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

export function getVersionInfo() {
  return getJson<VersionInfo>(`${base}/api/version`);
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
