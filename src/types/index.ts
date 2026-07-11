export type Protocol = 'http' | 'https' | 'socks4' | 'socks5';

export interface StoredProxy {
  id: string;
  ip: string;
  port: number;
  protocol: Protocol;
  anonymity: string;
  alive: boolean;
  latency: number;
  exitIp?: string;
  pure: boolean;
  aiAccessible: boolean;
  youtubeAccessible: boolean;
  leaksRealIp: boolean;
  country?: string;
  countryCode?: string;
  city?: string;
  isp?: string;
  org?: string;
  as?: string;
  validatedAt: number;
  expiresAt: number;
}

export interface Progress {
  done: number;
  total: number;
  alive: number;
}

export interface Stats {
  total: number;
  pure: number;
  aiAccessible: number;
  youtubeAccessible: number;
  anonymous: number;
  byProtocol: Record<string, number>;
  byCountry: Array<{ country: string; count: number }>;
  avgLatency: number;
  lastRefreshAt: number | null;
  nextRefreshAt: number | null;
  refreshing: boolean;
  lastRefreshDurationMs: number | null;
}

export interface TunnelInfo {
  host: string;
  port: number;
  address: string;
  protocols: string[];
  rotating: boolean;
  realIp: string | null;
  poolSize: number;
}

export interface SnapshotMessage {
  type: 'snapshot';
  stats: Stats;
  progress: Progress;
  proxies: StoredProxy[];
}
