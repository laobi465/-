// Central configuration for the proxy pool service.
// All durations are in milliseconds.

const MIN = 60 * 1000;

export const config = {
  // proxifly/free-proxy-list served via jsDelivr CDN (fast, cacheable, no token).
  // A single "all" file already contains http / https / socks4 / socks5 entries.
  sourceUrls: [
    'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json',
  ],
  // Fallback raw GitHub URL (used if jsDelivr fails).
  sourceFallback:
    'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/all/data.json',

  refreshIntervalMs: 5 * MIN, // refresh the pool every 5 minutes
  cleanupIntervalMs: 1 * MIN, // sweep expired proxies every minute
  proxyTtlMs: 10 * MIN, // a proxy expires 10min after its last successful validation

  validation: {
    timeoutMs: 6000, // per-proxy validation timeout (ip-api reachability)
    httpsTimeoutMs: 9000, // per-target HTTPS reachability timeout (AI / YouTube)
    concurrency: 120, // simultaneous validations
    // ip-api.com free endpoint (HTTP only). Returns the exit IP + country info.
    testHost: 'ip-api.com',
    testPath: '/json/?fields=status,query,country,countryCode,city,isp,org,as,proxy,hosting',
    maxLatencyMs: 6000,
    // Reachability targets for "pure IP" = can actually reach AI sites + YouTube.
    targets: {
      ai: { host: 'chat.openai.com', path: '/cdn-cgi/trace' },
      youtube: { host: 'www.youtube.com', path: '/' },
    },
  },

  server: {
    host: process.env.HOST || '0.0.0.0',
    apiPort: Number(process.env.API_PORT) || 7999,
  },

  tunnel: {
    host: process.env.TUNNEL_HOST || '0.0.0.0',
    port: Number(process.env.TUNNEL_PORT) || 8080,
  },

  dataFile: process.env.DATA_FILE || 'server/data/proxies.json',

  // Self-update: check GitHub for new commits every 1 minute.
  update: {
    repo: 'laobi465/-',
    branch: 'main',
    checkIntervalMs: 1 * MIN,
  },
} as const;
