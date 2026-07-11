import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { config } from './config';
import { store } from './store';
import * as scheduler from './scheduler';
import { getRealIp } from './validator';
import { getVersionInfo, performUpdate, checkForUpdate } from './updater';
import { get as getCredentials, set as setCredentials } from './credentials';

const log = (...a: unknown[]) => console.log('[api]', ...a);

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  });
  res.end(JSON.stringify(data));
}

/** Read and parse a JSON object body from an incoming request. */
function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c: Buffer) => {
      raw += c.toString();
      // Guard against unbounded payloads.
      if (raw.length > 64 * 1024) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function parseQuery(rawUrl: string): Record<string, string> {
  const u = new URL(rawUrl, 'http://x');
  const out: Record<string, string> = {};
  u.searchParams.forEach((v, k) => (out[k] = v));
  return out;
}

function currentStats() {
  return store.getStats({
    refreshing: scheduler.isRefreshing(),
    lastRefreshAt: scheduler.getLastRefreshAt(),
    nextRefreshAt: scheduler.getNextRefreshAt(),
    lastRefreshDurationMs: scheduler.getLastRefreshDurationMs(),
  });
}

// The built frontend lives at <project-root>/dist (two levels above server/src).
const DIST_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist',
);
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function serveStatic(res: http.ServerResponse, urlPath: string) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  let fp = path.join(DIST_DIR, rel);
  if (!fp.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  // SPA fallback for client-side routes.
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    fp = path.join(DIST_DIR, 'index.html');
  }
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}

/**
 * Test the tunnel proxy end-to-end: connect through the local tunnel (with
 * Basic auth) to httpbin.org/ip and report exit IP / latency / status.
 * This verifies the full chain: auth → rotating upstream → external reach.
 */
async function testTunnel(): Promise<{
  ok: boolean;
  exitIp?: string;
  latencyMs: number;
  status?: number;
  error?: string;
}> {
  const start = Date.now();
  // Build the proxy URL pointing at our own tunnel with Basic auth.
  // Credentials are read dynamically so the test reflects runtime changes.
  const { username, password } = getCredentials();
  const proxyUrl = `http://${username}:${password}@127.0.0.1:${config.tunnel.port}`;
  try {
    // fetch() supports the proxy via a dispatcher only in undici; here we do
    // a raw HTTP request through the proxy manually for portability.
    const u = new URL(proxyUrl);
    const proxyHost = u.hostname;
    const proxyPort = Number(u.port);
    const auth = Buffer.from(`${u.username}:${u.password}`).toString('base64');

    const targetUrl = 'http://httpbin.org/ip';
    const target = new URL(targetUrl);

    const result = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = http.request(
          {
            host: proxyHost,
            port: proxyPort,
            method: 'GET',
            path: targetUrl,
            headers: {
              Host: target.host,
              'Proxy-Authorization': `Basic ${auth}`,
            },
            timeout: 15000,
          },
          (upRes) => {
            let body = '';
            upRes.on('data', (c: Buffer) => (body += c.toString()));
            upRes.on('end', () => resolve({ status: upRes.statusCode || 0, body }));
          },
        );
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('proxy test timeout')));
        req.end();
      },
    );

    const latencyMs = Date.now() - start;
    if (result.status !== 200) {
      return { ok: false, latencyMs, status: result.status, error: `HTTP ${result.status}` };
    }
    // httpbin.org/ip returns { "origin": "1.2.3.4" }
    let exitIp: string | undefined;
    try {
      exitIp = (JSON.parse(result.body) as { origin?: string }).origin;
    } catch {
      // keep undefined
    }
    return { ok: true, exitIp, latencyMs, status: result.status };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: (e as Error).message };
  }
}

/** Start the HTTP API + WebSocket server. */
export function startApi() {
  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const q = parseQuery(rawUrl);
    const pathname = rawUrl.split('?')[0];

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    try {
      if (pathname === '/api/health')
        return sendJson(res, { ok: true, time: Date.now() });

      if (pathname === '/api/stats') return sendJson(res, currentStats());

      if (pathname === '/api/tunnel')
        return sendJson(res, store.getTunnelInfo(getRealIp()));

      if (pathname === '/api/tunnel/test' && req.method === 'POST') {
        const result = await testTunnel();
        return sendJson(res, result, result.ok ? 200 : 502);
      }

      // Read current tunnel credentials (username only — never expose the
      // password over the API).
      if (pathname === '/api/tunnel/credentials' && req.method === 'GET') {
        const { username } = getCredentials();
        return sendJson(res, { username });
      }

      // Update tunnel credentials at runtime. Persists to disk so the change
      // survives restarts; takes effect immediately for new tunnel requests.
      if (pathname === '/api/tunnel/credentials' && req.method === 'PUT') {
        const body = (await readJsonBody(req)) as { username?: string; password?: string };
        try {
          setCredentials(body.username ?? '', body.password ?? '');
        } catch (e) {
          return sendJson(res, { error: (e as Error).message }, 400);
        }
        // Broadcast a fresh snapshot so every dashboard sees the new address.
        broadcast();
        const { username } = getCredentials();
        return sendJson(res, { username, updated: true });
      }

      if (pathname === '/api/proxies') {
        const list = store.getAll({
          protocol: q.protocol,
          pure: q.pure === undefined ? undefined : q.pure === 'true',
          country: q.country,
          q: q.q,
          limit: q.limit ? Number(q.limit) : 500,
          offset: q.offset ? Number(q.offset) : 0,
          sort: q.sort === 'recent' ? 'recent' : 'latency',
        });
        return sendJson(res, { total: store.count(), count: list.length, proxies: list });
      }

      if (pathname === '/api/refresh' && req.method === 'POST') {
        const result = await scheduler.refresh();
        return sendJson(res, { ...result, progress: scheduler.getProgress() });
      }

      if (pathname === '/api/version')
        return sendJson(res, getVersionInfo());

      if (pathname === '/api/version/check' && req.method === 'POST') {
        // Force a fresh check against GitHub so a page refresh shows the latest
        // status immediately (instead of waiting up to 1min for the scheduler).
        const info = await checkForUpdate();
        broadcast();
        return sendJson(res, info);
      }

      if (pathname === '/api/update' && req.method === 'POST') {
        const result = await performUpdate();
        return sendJson(res, result, result.ok ? 200 : 500);
      }

      // Anything else: serve the built frontend (production) or 404 (dev).
      if (fs.existsSync(DIST_DIR)) return serveStatic(res, pathname);
      sendJson(res, { error: 'not found', path: pathname }, 404);
    } catch (err) {
      sendJson(res, { error: (err as Error).message }, 500);
    }
  });

  // ---- WebSocket: push live updates to the dashboard ----------------------
  const wss = new WebSocketServer({ server, path: '/ws' });

  let broadcastPending = false;
  function broadcast() {
    if (broadcastPending) return;
    broadcastPending = true;
    setTimeout(() => {
      broadcastPending = false;
      const msg = JSON.stringify({
        type: 'snapshot',
        stats: currentStats(),
        progress: scheduler.getProgress(),
        proxies: store.snapshot(),
        version: getVersionInfo(),
      });
      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(msg);
      }
    }, 800);
  }

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'snapshot',
        stats: currentStats(),
        progress: scheduler.getProgress(),
        proxies: store.snapshot(),
        version: getVersionInfo(),
      }),
    );
  });

  store.on('change', broadcast);
  // Safety net: ensure the dashboard updates even if no change event fires.
  setInterval(broadcast, 5000);

  server.listen(config.server.apiPort, config.server.host, () => {
    log(`api + websocket on http://${config.server.host}:${config.server.apiPort}`);
  });
}
