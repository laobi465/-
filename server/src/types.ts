export type Protocol = 'http' | 'https' | 'socks4' | 'socks5';

export interface RawProxy {
  proxy: string;
  protocol: string;
  ip: string;
  port: number;
  https: boolean;
  anonymity: string;
  score: number;
  geolocation?: { country?: string; city?: string };
}

export interface StoredProxy {
  id: string; // `${protocol}:${ip}:${port}`
  ip: string;
  port: number;
  protocol: Protocol;
  anonymity: string; // from source (transparent / anonymous / elite)
  alive: boolean;
  latency: number; // ms
  exitIp?: string; // IP seen by the target (the proxy's exit IP)
  pure: boolean; // can reach AI sites + YouTube AND does not leak the real IP
  aiAccessible: boolean; // can reach an AI site (chat.openai.com) over HTTPS
  youtubeAccessible: boolean; // can reach YouTube over HTTPS
  leaksRealIp: boolean; // exit IP equals the server's real IP
  country?: string;
  countryCode?: string;
  city?: string;
  isp?: string;
  org?: string;
  as?: string;
  validatedAt: number; // ms timestamp
  expiresAt: number; // ms timestamp
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
  username: string;
  password: string;
  address: string;
  protocols: string[];
  rotating: boolean;
  realIp: string | null;
  poolSize: number;
}

export interface ProxyFilter {
  protocol?: string;
  pure?: boolean;
  country?: string;
  q?: string;
  limit?: number;
  offset?: number;
  sort?: 'latency' | 'recent';
}
