import { config } from './config';
import { fetchProxyList } from './fetcher';
import { store } from './store';
import { validateBatch } from './validator';
import { checkForUpdate } from './updater';

let refreshTimer: NodeJS.Timeout | null = null;
let cleanupTimer: NodeJS.Timeout | null = null;
let updateTimer: NodeJS.Timeout | null = null;
let refreshing = false;
let lastRefreshAt: number | null = null;
let nextRefreshAt: number | null = null;
let lastRefreshDurationMs: number | null = null;
let progress = { done: 0, total: 0, alive: 0 };

export function isRefreshing() {
  return refreshing;
}
export function getLastRefreshAt() {
  return lastRefreshAt;
}
export function getNextRefreshAt() {
  return nextRefreshAt;
}
export function getLastRefreshDurationMs() {
  return lastRefreshDurationMs;
}
export function getProgress() {
  return progress;
}

export interface RefreshResult {
  fetched: number;
  validated: number;
  durationMs: number;
}

/** Fetch the upstream list, validate every candidate, and refresh the pool. */
export async function refresh(): Promise<RefreshResult> {
  if (refreshing) return { fetched: 0, validated: 0, durationMs: 0 };
  refreshing = true;
  progress = { done: 0, total: 0, alive: 0 };
  store.emit('change', { type: 'refresh-start' });
  const start = Date.now();
  try {
    const list = await fetchProxyList();
    progress.total = list.length;
    store.emit('change', { type: 'progress' });
    const validated = await validateBatch(list, (done, total, alive) => {
      progress = { done, total, alive };
      if (done % 25 === 0 || done === total) store.emit('change', { type: 'progress' });
    });
    if (validated.length) store.upsertMany(validated);
    lastRefreshDurationMs = Date.now() - start;
    lastRefreshAt = Date.now();
    nextRefreshAt = lastRefreshAt + config.refreshIntervalMs;
    store.emit('change', { type: 'refresh-done' });
    console.log(
      `[scheduler] refreshed: fetched=${list.length} validated=${validated.length} in ${lastRefreshDurationMs}ms`,
    );
    return { fetched: list.length, validated: validated.length, durationMs: lastRefreshDurationMs };
  } catch (err) {
    console.warn('[scheduler] refresh failed:', (err as Error).message);
    nextRefreshAt = Date.now() + config.refreshIntervalMs;
    return { fetched: 0, validated: 0, durationMs: Date.now() - start };
  } finally {
    refreshing = false;
  }
}

function scheduleNext() {
  if (refreshTimer) clearTimeout(refreshTimer);
  nextRefreshAt = Date.now() + config.refreshIntervalMs;
  refreshTimer = setTimeout(() => {
    refresh().finally(scheduleNext);
  }, config.refreshIntervalMs);
}

export function startScheduler() {
  // Periodically drop proxies whose TTL has elapsed ("过期自动删除").
  cleanupTimer = setInterval(() => {
    const removed = store.removeExpired();
    if (removed) console.log(`[scheduler] removed ${removed} expired proxies`);
  }, config.cleanupIntervalMs);
  // Check GitHub for new commits every 1 minute ("每1分钟拉取对应github项目").
  updateTimer = setInterval(() => {
    checkForUpdate().catch((e) => console.warn('[scheduler] update check failed:', (e as Error).message));
  }, config.update.checkIntervalMs);
  // Run the first update check immediately so the badge is populated on boot.
  checkForUpdate().catch((e) => console.warn('[scheduler] update check failed:', (e as Error).message));
  // Kick off the first refresh immediately, then every 5 minutes.
  refresh().finally(scheduleNext);
}

export function stopScheduler() {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  if (updateTimer) clearInterval(updateTimer);
}
