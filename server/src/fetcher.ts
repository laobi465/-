import { config } from './config';
import type { Protocol, RawProxy } from './types';

const KNOWN_PROTOCOLS: Protocol[] = ['http', 'https', 'socks4', 'socks5'];

function normalizeProtocol(p: unknown): Protocol | null {
  const v = String(p ?? '')
    .toLowerCase()
    .trim();
  return (KNOWN_PROTOCOLS as string[]).includes(v) ? (v as Protocol) : null;
}

async function fetchJson(url: string, timeoutMs = 15000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull the latest proxy list from the proxifly/free-proxy-list repository.
 * The list is de-duplicated and protocol-normalized. Returns an empty array
 * only if every source fails AND no cached list exists (callers handle that).
 */
export async function fetchProxyList(): Promise<RawProxy[]> {
  const urls = [...config.sourceUrls, config.sourceFallback];
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      if (!Array.isArray(data)) throw new Error('unexpected payload shape');
      const seen = new Set<string>();
      const out: RawProxy[] = [];
      for (const item of data as any[]) {
        if (!item || typeof item.ip !== 'string' || !item.port) continue;
        const protocol = normalizeProtocol(item.protocol);
        if (!protocol) continue;
        const ip = item.ip.trim();
        const port = Number(item.port);
        if (!ip || !port) continue;
        const key = `${protocol}:${ip}:${port}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          proxy: item.proxy || `${protocol}://${ip}:${port}`,
          protocol,
          ip,
          port,
          https: !!item.https,
          anonymity: String(item.anonymity || 'unknown'),
          score: Number(item.score || 0),
          geolocation: item.geolocation,
        });
      }
      return out;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('failed to fetch proxy list from all sources');
}
