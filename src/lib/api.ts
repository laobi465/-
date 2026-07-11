import type { TunnelInfo } from '@/types';

const base = '';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function getTunnelInfo() {
  return getJson<TunnelInfo>(`${base}/api/tunnel`);
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
