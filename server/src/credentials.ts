import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';

export interface Credentials {
  username: string;
  password: string;
}

const CREDS_FILE = path.join(path.dirname(config.dataFile), 'credentials.json');

// In-memory copy of the current credentials. Seeded from the persisted file if
// present, otherwise from the env-configured defaults. Mutable at runtime via
// set() so the tunnel auth and advertised address update without a restart.
let current: Credentials = load();

/** Read persisted credentials; fall back to config defaults when absent. */
function load(): Credentials {
  try {
    if (fs.existsSync(CREDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8')) as Partial<Credentials>;
      if (data.username && data.password) {
        return { username: data.username, password: data.password };
      }
    }
  } catch {
    // ignore corrupt file — use defaults below
  }
  return { username: config.tunnel.username, password: config.tunnel.password };
}

/** Persist credentials to disk so they survive restarts. */
function persist() {
  try {
    fs.mkdirSync(path.dirname(CREDS_FILE), { recursive: true });
    fs.writeFileSync(CREDS_FILE, JSON.stringify(current));
  } catch (err) {
    console.warn('[credentials] persist failed:', (err as Error).message);
  }
}

/** Current credentials (user:pass) used for tunnel Basic auth. */
export function get(): Credentials {
  return { ...current };
}

/** Base64 of "user:pass" — what the Proxy-Authorization header must match. */
export function getExpectedB64(): string {
  return Buffer.from(`${current.username}:${current.password}`).toString('base64');
}

/**
 * Update the tunnel credentials at runtime. Both fields must be non-empty
 * (trimmed). Persists immediately so the change survives restarts.
 * Throws on invalid input.
 */
export function set(username: string, password: string): Credentials {
  const u = (username || '').trim();
  const p = (password || '').trim();
  if (!u || !p) throw new Error('用户名和密码不能为空');
  if (u.includes(':')) throw new Error('用户名不能包含冒号 ":"');
  current = { username: u, password: p };
  persist();
  console.log(`[credentials] tunnel auth updated (user="${u}")`);
  return get();
}
