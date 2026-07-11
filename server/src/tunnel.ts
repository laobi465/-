import http from 'node:http';
import net from 'node:net';
import { SocksClient } from 'socks';
import { config } from './config';
import { store } from './store';
import type { StoredProxy } from './types';

const log = (...a: unknown[]) => console.log('[tunnel]', ...a);

/** The expected Basic credential string (base64 of "user:pass"). */
const EXPECTED_B64 = Buffer.from(
  `${config.tunnel.username}:${config.tunnel.password}`,
).toString('base64');

/**
 * Validate the Proxy-Authorization header on an incoming request.
 * Returns true if the request may proceed; sends a 407 challenge otherwise.
 * Works for both plain HTTP forwards and CONNECT (caller handles the socket).
 */
function checkAuth(req: http.IncomingMessage): boolean {
  const header = req.headers['proxy-authorization'] || '';
  if (!header) return false;
  const m = /^Basic\s+(.+)$/i.exec(header.trim());
  return !!m && m[1] === EXPECTED_B64;
}

/** Send a 407 Proxy Authentication Required challenge to a plain HTTP client. */
function rejectAuth(res: http.ServerResponse) {
  res.writeHead(407, {
    'Proxy-Authenticate': 'Basic realm="proxy-pool"',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('Proxy authentication required');
}

/** Send a 407 challenge to a raw CONNECT socket. */
function rejectAuthSocket(socket: net.Socket) {
  try {
    socket.write(
      'HTTP/1.1 407 Proxy Authentication Required\r\n' +
        'Proxy-Authenticate: Basic realm="proxy-pool"\r\n' +
        'Content-Length: 0\r\n\r\n',
    );
    socket.end();
  } catch {
    socket.destroy();
  }
}

/** Establish a CONNECT tunnel through an HTTP proxy. */
function connectViaHttpProxy(
  proxy: StoredProxy,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: proxy.ip, port: proxy.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('proxy connect timeout'));
    }, timeoutMs);
    let buf = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const head = buf.toString('ascii');
      const idx = head.indexOf('\r\n\r\n');
      if (idx === -1) return;
      clearTimeout(timer);
      socket.off('data', onData);
      const statusLine = head.slice(0, head.indexOf('\r\n'));
      if (/\b200\b/.test(statusLine)) {
        const leftover = buf.subarray(idx + 4);
        if (leftover.length) socket.unshift(leftover);
        resolve(socket);
      } else {
        socket.destroy();
        reject(new Error(`CONNECT rejected: ${statusLine}`));
      }
    };

    socket.on('data', onData);
    socket.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.once('connect', () => {
      socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`);
    });
  });
}

/** Establish a connection through a SOCKS4/5 proxy. */
function connectViaSocks(
  proxy: StoredProxy,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return SocksClient.createConnection({
    proxy: {
      host: proxy.ip,
      port: proxy.port,
      type: proxy.protocol === 'socks4' ? 4 : 5,
    },
    command: 'connect',
    destination: { host, port },
    timeout: timeoutMs,
  }).then((info) => info.socket as unknown as net.Socket);
}

export function connectThroughUpstream(
  proxy: StoredProxy,
  host: string,
  port: number,
  timeoutMs = 10000,
): Promise<net.Socket> {
  if (proxy.protocol === 'socks4' || proxy.protocol === 'socks5') {
    return connectViaSocks(proxy, host, port, timeoutMs);
  }
  return connectViaHttpProxy(proxy, host, port, timeoutMs);
}

/** Pick a rotating upstream and open a tunnel, retrying on failure. */
async function pickAndConnect(
  host: string,
  port: number,
  retries = 4,
): Promise<{ socket: net.Socket; proxy: StoredProxy } | null> {
  for (let i = 0; i < retries; i++) {
    const proxy = store.pickForTunnel();
    if (!proxy) return null;
    try {
      const socket = await connectThroughUpstream(proxy, host, port);
      return { socket, proxy };
    } catch {
      // try the next proxy in the pool
    }
  }
  return null;
}

/** Handle an HTTPS CONNECT request from the client. */
function handleConnect(req: http.IncomingMessage, client: net.Socket, head: Buffer) {
  if (!checkAuth(req)) {
    rejectAuthSocket(client);
    return;
  }
  const sep = (req.url || '').lastIndexOf(':');
  const host = sep === -1 ? req.url || '' : (req.url || '').slice(0, sep);
  const port = sep === -1 ? 443 : Number((req.url || '').slice(sep + 1));

  pickAndConnect(host, port)
    .then((picked) => {
      if (!picked) {
        client.write('HTTP/1.1 502 No proxy available\r\n\r\n');
        client.end();
        return;
      }
      const { socket: upstream } = picked;
      client.write('HTTP/1.1 200 Connection established\r\n\r\n');
      if (head && head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
      const cleanup = () => {
        upstream.destroy();
        client.destroy();
      };
      upstream.on('error', cleanup);
      client.on('error', cleanup);
      upstream.on('close', cleanup);
      client.on('close', cleanup);
    })
    .catch(() => {
      try {
        client.write('HTTP/1.1 502 Tunnel failed\r\n\r\n');
        client.end();
      } catch {
        client.destroy();
      }
    });
}

/** Handle a plain HTTP request by forwarding it through a rotating upstream. */
function handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!checkAuth(req)) {
    rejectAuth(res);
    return;
  }
  const url = new URL(req.url || '', 'http://dummy.local');
  const host = url.hostname;
  const port = url.port ? Number(url.port) : 80;
  if (!host) {
    res.writeHead(400);
    res.end('bad request');
    return;
  }

  pickAndConnect(host, port)
    .then((picked) => {
      if (!picked) {
        res.writeHead(502);
        res.end('No proxy available in the pool');
        return;
      }
      const { socket: upstream } = picked;
      const headers = { ...req.headers };
      delete headers['proxy-connection'];
      const proxyReq = http.request(
        {
          host,
          port,
          path: url.pathname + url.search,
          method: req.method,
          headers,
          createConnection: () => upstream,
        },
        (upRes) => {
          res.writeHead(upRes.statusCode || 200, upRes.headers);
          upRes.pipe(res);
        },
      );
      proxyReq.on('error', () => {
        try {
          res.writeHead(502);
          res.end('upstream error');
        } catch {
          // client already gone
        }
      });
      req.pipe(proxyReq);
    })
    .catch(() => {
      res.writeHead(502);
      res.end('tunnel error');
    });
}

/** Start the rotating tunnel proxy server. */
export function startTunnel() {
  const server = http.createServer((req, res) => handleHttp(req, res));
  server.on('connect', (req, socket, head) =>
    handleConnect(req, socket as unknown as net.Socket, head),
  );
  server.on('error', (err) => log('server error:', err.message));
  server.listen(config.tunnel.port, config.tunnel.host, () => {
    log(
      `rotating tunnel proxy listening on ${config.tunnel.host}:${config.tunnel.port} (HTTP + HTTPS CONNECT)`,
    );
  });
}
