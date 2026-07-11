import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { config } from './config';
import { store } from './store';
import * as scheduler from './scheduler';
import { getRealIp } from './validator';
import { getVersionInfo, performUpdate } from './updater';

const log = (...a: unknown[]) => console.log('[api]', ...a);

function sendJson(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(data));
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

/** Start the HTTP API + WebSocket server. */
export function startApi() {
  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const q = parseQuery(rawUrl);
    const pathname = rawUrl.split('?')[0];

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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
