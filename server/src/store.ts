import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { get as getCredentials } from './credentials';
import type { ProxyFilter, Stats, StoredProxy, TunnelInfo } from './types';

interface StoreMeta {
  refreshing: boolean;
  lastRefreshAt: number | null;
  nextRefreshAt: number | null;
  lastRefreshDurationMs: number | null;
}

class ProxyStore extends EventEmitter {
  private map = new Map<string, StoredProxy>();
  private persistTimer: NodeJS.Timeout | null = null;
  private rrIndex = 0;

  /** Load previously persisted proxies (dropping already-expired ones). */
  load() {
    try {
      const file = config.dataFile;
      if (!fs.existsSync(file)) return;
      const data = JSON.parse(fs.readFileSync(file, 'utf8')) as StoredProxy[];
      const now = Date.now();
      for (const p of data) {
        if (p && p.id && p.expiresAt > now) this.map.set(p.id, p);
      }
      console.log(`[store] loaded ${this.map.size} live proxies from disk`);
    } catch {
      // ignore — start empty
    }
  }

  /** Insert/refresh a batch of validated proxies. */
  upsertMany(proxies: StoredProxy[]) {
    for (const p of proxies) this.map.set(p.id, p);
    this.schedulePersist();
    this.emit('change', { type: 'refresh' });
  }

  /** Delete every proxy whose TTL has elapsed. Returns the number removed. */
  removeExpired(now = Date.now()): number {
    let removed = 0;
    for (const [id, p] of this.map) {
      if (p.expiresAt <= now) {
        this.map.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      this.schedulePersist();
      this.emit('change', { type: 'expire', count: removed });
    }
    return removed;
  }

  getAll(filter: ProxyFilter = {}): StoredProxy[] {
    let arr = Array.from(this.map.values());
    if (filter.protocol && filter.protocol !== 'all') {
      arr = arr.filter((p) => p.protocol === filter.protocol);
    }
    if (filter.pure !== undefined) arr = arr.filter((p) => p.pure === filter.pure);
    if (filter.country) {
      arr = arr.filter(
        (p) => (p.countryCode || '').toLowerCase() === filter.country!.toLowerCase(),
      );
    }
    if (filter.q) {
      const q = filter.q.toLowerCase();
      arr = arr.filter(
        (p) =>
          p.ip.includes(q) ||
          String(p.port).includes(q) ||
          (p.country || '').toLowerCase().includes(q) ||
          (p.countryCode || '').toLowerCase().includes(q) ||
          (p.isp || '').toLowerCase().includes(q),
      );
    }
    const sort = filter.sort || 'latency';
    arr.sort((a, b) =>
      sort === 'latency' ? a.latency - b.latency : b.validatedAt - a.validatedAt,
    );
    const offset = filter.offset || 0;
    const limit = filter.limit || arr.length;
    return arr.slice(offset, offset + limit);
  }

  count(): number {
    return this.map.size;
  }

  getStats(meta: StoreMeta): Stats {
    const arr = Array.from(this.map.values());
    const byProtocol: Record<string, number> = {};
    const countryMap: Record<string, number> = {};
    let pure = 0;
    let aiAccessible = 0;
    let youtubeAccessible = 0;
    let anonymous = 0;
    let latSum = 0;
    for (const p of arr) {
      byProtocol[p.protocol] = (byProtocol[p.protocol] || 0) + 1;
      if (p.pure) pure++;
      if (p.aiAccessible) aiAccessible++;
      if (p.youtubeAccessible) youtubeAccessible++;
      if (!p.leaksRealIp) anonymous++;
      latSum += p.latency;
      if (p.countryCode) countryMap[p.countryCode] = (countryMap[p.countryCode] || 0) + 1;
    }
    const byCountry = Object.entries(countryMap)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);
    return {
      total: arr.length,
      pure,
      aiAccessible,
      youtubeAccessible,
      anonymous,
      byProtocol,
      byCountry,
      avgLatency: arr.length ? Math.round(latSum / arr.length) : 0,
      ...meta,
    };
  }

  /** Round-robin pick of an alive proxy for the rotating tunnel. */
  pickForTunnel(): StoredProxy | null {
    const arr = Array.from(this.map.values());
    if (arr.length === 0) return null;
    const p = arr[this.rrIndex % arr.length];
    this.rrIndex = (this.rrIndex + 1) % arr.length;
    return p;
  }

  getTunnelInfo(realIp: string | null): TunnelInfo {
    // Advertise the address clients should actually use to reach the tunnel:
    //   1. explicitly configured TUNNEL_PUBLIC_HOST (domain / public IP)
    //   2. auto-detected server public IP (realIp)
    //   3. configured bind host when it is not 0.0.0.0
    //   4. 127.0.0.1 (local development fallback)
    const host =
      config.tunnel.publicHost ||
      realIp ||
      (config.tunnel.host !== '0.0.0.0' ? config.tunnel.host : '127.0.0.1');
    // Credentials are read dynamically so dashboard changes reflect immediately.
    const { username, password } = getCredentials();
    // Display/copy format: user:pass@host:port — usable as
    // http://user:pass@host:port in browsers / curl -x.
    const address = `${username}:${password}@${host}:${config.tunnel.port}`;
    return {
      host,
      port: config.tunnel.port,
      username,
      password,
      address,
      protocols: ['http', 'https', 'socks4', 'socks5'],
      rotating: true,
      realIp,
      poolSize: this.map.size,
    };
  }

  snapshot(limit = 600): StoredProxy[] {
    return this.getAll({ limit, sort: 'latency' });
  }

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, 2000);
  }

  private persist() {
    try {
      const file = config.dataFile;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(Array.from(this.map.values())));
    } catch (err) {
      console.warn('[store] persist failed:', (err as Error).message);
    }
  }
}

export const store = new ProxyStore();
