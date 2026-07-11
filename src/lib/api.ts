import type { TunnelInfo, VersionInfo } from '@/types';

const base = '';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function getTunnelInfo() {
  return getJson<TunnelInfo>(`${base}/api/tunnel`);
}

export interface TunnelTestResult {
  ok: boolean;
  exitIp?: string;
  latencyMs: number;
  status?: number;
  error?: string;
}

/** Test the tunnel proxy end-to-end via the backend. */
export function testTunnel() {
  return fetch(`${base}/api/tunnel/test`, { method: 'POST' }).then((res) =>
    res.json() as Promise<TunnelTestResult>,
  );
}

export function getVersionInfo() {
  return getJson<VersionInfo>(`${base}/api/version`);
}

/** Force a fresh GitHub update check on the backend; returns the latest info. */
export function checkVersionUpdate() {
  return fetch(`${base}/api/version/check`, { method: 'POST' }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<VersionInfo>;
  });
}

export async function triggerRefresh(): Promise<{
  fetched: number;
  validated: number;
  durationMs: number;
}> {
  const res = await fetch(`${base}/api/refresh`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function triggerUpdate(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${base}/api/update`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
