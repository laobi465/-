// Self-update module: detect new commits on GitHub and pull + restart.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config';

const log = (...a: unknown[]) => console.log('[updater]', ...a);

// Project root = two levels above server/src.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let cached: VersionInfo | null = null;
let updating = false;

export interface VersionInfo {
  version: string;
  commit: string;
  remoteCommit: string | null;
  hasUpdate: boolean;
  lastCheckedAt: number | null;
  updating: boolean;
}

/** Read the version string from the root package.json. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Get the short hash of the current local HEAD. */
function localCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Get the latest commit hash on the remote branch via GitHub API (no token needed). */
async function remoteCommit(): Promise<string | null> {
  const { repo, branch } = config.update;
  const url = `https://api.github.com/repos/${repo}/commits/${branch}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'proxy-pool-updater',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sha?: string };
    return data.sha ? data.sha.slice(0, 7) : null;
  } catch {
    return null;
  }
}

/** Return the cached version info (updated by the scheduler every minute). */
export function getVersionInfo(): VersionInfo {
  if (cached) return { ...cached, updating };
  // First call before the scheduler runs — build a snapshot synchronously.
  const commit = localCommit();
  const info: VersionInfo = {
    version: readVersion(),
    commit,
    remoteCommit: null,
    hasUpdate: false,
    lastCheckedAt: null,
    updating,
  };
  cached = info;
  return info;
}

/** Check GitHub for new commits and refresh the cached version info. */
export async function checkForUpdate(): Promise<VersionInfo> {
  const version = readVersion();
  const commit = localCommit();
  const remote = await remoteCommit();
  const hasUpdate = remote !== null && remote !== commit;
  cached = {
    version,
    commit,
    remoteCommit: remote,
    hasUpdate,
    lastCheckedAt: Date.now(),
    updating,
  };
  log(`checked: local=${commit} remote=${remote ?? '?'} hasUpdate=${hasUpdate}`);
  return cached;
}

/**
 * Pull the latest code from GitHub, reinstall deps, then restart the process.
 * In Docker (restart: unless-stopped) exiting triggers an automatic restart.
 * Outside Docker we spawn a detached successor before exiting.
 */
export async function performUpdate(): Promise<{ ok: boolean; message: string }> {
  if (updating) return { ok: false, message: '更新正在进行中' };
  updating = true;
  log('starting self-update via git pull…');
  try {
    // 1. git pull
    execSync('git fetch origin && git reset --hard origin/main', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30000,
    });
    log('git pull done');

    // 2. reinstall dependencies (root + server) in case package.json changed
    try {
      execSync('npm install --omit=dev --no-audit --no-fund', {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 120000,
      });
      execSync('npm install --omit=dev --no-audit --no-fund', {
        cwd: path.join(ROOT, 'server'),
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 120000,
      });
      log('deps reinstalled');
    } catch (e) {
      log('dep reinstall skipped/failed (non-fatal):', (e as Error).message);
    }

    // 3. schedule restart after the response is sent
    setTimeout(() => restart(), 500);
    return { ok: true, message: '更新完成，服务正在重启…' };
  } catch (err) {
    updating = false;
    log('update failed:', (err as Error).message);
    return { ok: false, message: `更新失败: ${(err as Error).message}` };
  }
}

/** Restart the service: exit so Docker restarts it, or spawn a successor. */
function restart() {
  log('restarting…');
  // If running under Docker / a process manager, just exit; they will restart us.
  if (process.env.DOCKER === '1' || fs.existsSync('/.dockerenv')) {
    process.exit(0);
  }
  // Otherwise spawn a detached successor running the same entry, then exit.
  const entry = process.argv[1];
  const args = process.argv.slice(2);
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, RESTARTED: '1' },
  });
  child.unref();
  process.exit(0);
}
