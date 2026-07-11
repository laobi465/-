import net from 'node:net';
import tls from 'node:tls';
import { config } from './config';
import type { Protocol, RawProxy, StoredProxy } from './types';

let realIp: string | null = null;

/** Detect this server's own public IP (used to detect proxies that leak it). */
export async function detectRealIp(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('http://ip-api.com/json/?fields=query', {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = (await res.json()) as { query?: string };
    realIp = data.query || null;
  } catch {
    realIp = null;
  }
  return realIp;
}

export function getRealIp(): string | null {
  return realIp;
}

// ---- egress gateway support ----------------------------------------------
// In restricted environments (e.g. this sandbox) direct outbound TCP is
// blocked and all traffic must flow through an HTTP CONNECT gateway exposed
// via http_proxy / https_proxy. When such a gateway is configured we CONNECT
// through it to reach the candidate proxy, which makes validation work even
// in otherwise locked-down networks. On a normal server with open egress no
// gateway is set and we connect directly.

interface Gateway {
  host: string;
  port: number;
}

function parseGateway(): Gateway | null {
  const raw =
    process.env.HTTPS_PROXY || process.env.HTTP_PROXY ||
    process.env.https_proxy || process.env.http_proxy;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    if (!u.hostname || !port) return null;
    return { host: u.hostname, port };
  } catch {
    return null;
  }
}

const gateway = parseGateway();

/** Establish a raw TCP socket TO a candidate proxy (direct or via gateway). */
function connectToProxy(raw: RawProxy, timeoutMs: number): Promise<net.Socket> {
  if (gateway) {
    return connectViaGateway(gateway, raw.ip, raw.port, timeoutMs);
  }
  return directConnect(raw.ip, raw.port, timeoutMs);
}

function directConnect(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('direct connect timeout'));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** CONNECT through an HTTP gateway to reach (host:port). */
function connectViaGateway(
  gw: Gateway,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: gw.host, port: gw.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('gateway connect timeout'));
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
        reject(new Error(`gateway CONNECT rejected: ${statusLine}`));
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

// ---- manual SOCKS4/5 handshake over an already-open proxy socket ----------

/** Speak SOCKS5 greeting + connect to (dstHost:dstPort) over `socket`. */
function socks5Handshake(
  socket: net.Socket,
  dstHost: string,
  dstPort: number,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socks5 timeout')), timeoutMs);
    let step = 0;
    let buf = Buffer.alloc(0);
    const onStep = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        if (step === 0) {
          // greeting: need VER+METHOD (2 bytes)
          if (buf.length < 2) return;
          if (buf[0] !== 0x05) throw new Error('bad socks5 version');
          if (buf[1] !== 0x00) throw new Error('socks5 auth required/unsupported');
          buf = buf.subarray(2);
          step = 1;
          // send connect request
          let req: Buffer;
          if (net.isIPv4(dstHost)) {
            req = Buffer.alloc(10);
            req[3] = 0x01;
            const parts = dstHost.split('.').map(Number);
            req[4] = parts[0]; req[5] = parts[1]; req[6] = parts[2]; req[7] = parts[3];
          } else {
            const dn = Buffer.from(dstHost, 'utf8');
            req = Buffer.alloc(7 + dn.length);
            req[3] = 0x03;
            req[4] = dn.length;
            dn.copy(req, 5);
          }
          req[0] = 0x05; req[1] = 0x01; req[2] = 0x00;
          req.writeUInt16BE(dstPort, req.length - 2);
          socket.write(req);
        } else if (step === 1) {
          // reply: VER REP RSV ATYP BND.ADDR BND.PORT
          if (buf.length < 4) return;
          if (buf[0] !== 0x05) throw new Error('bad socks5 reply');
          if (buf[1] !== 0x00) throw new Error(`socks5 connect failed: ${buf[1]}`);
          socket.off('data', onStep);
          clearTimeout(timer);
          resolve();
        }
      } catch (e) {
        socket.off('data', onStep);
        clearTimeout(timer);
        reject(e);
      }
    };
    socket.on('data', onStep);
    socket.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    // greeting: VER=5, NMETHODS=1, METHOD=0 (no auth)
    socket.write(Buffer.from([0x05, 0x01, 0x00]));
  });
}

/** Speak SOCKS4 connect to (dstHost:dstPort) over `socket`. */
function socks4Handshake(
  socket: net.Socket,
  dstHost: string,
  dstPort: number,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socks4 timeout')), timeoutMs);
    let buf = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < 8) return;
      if (buf[0] !== 0x00) return reject(new Error('bad socks4 reply'));
      if (buf[1] !== 0x5a) return reject(new Error(`socks4 failed: ${buf[1]}`));
      socket.off('data', onData);
      clearTimeout(timer);
      resolve();
    };
    socket.on('data', onData);
    socket.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    const req = Buffer.alloc(9);
    req[0] = 0x04; req[1] = 0x01;
    req.writeUInt16BE(dstPort, 2);
    if (net.isIPv4(dstHost)) {
      const parts = dstHost.split('.').map(Number);
      req[4] = parts[0]; req[5] = parts[1]; req[6] = parts[2]; req[7] = parts[3];
    }
    // req[8] = 0 (userid null)
    socket.write(req);
  });
}

/**
 * Establish a tunnel from us → candidate proxy → (dstHost:dstPort).
 * Returns a raw socket where bytes flow to/from the destination through
 * the candidate proxy. Works for http / https / socks4 / socks5 protocols
 * and respects the egress gateway.
 */
function tunnelThroughProxy(
  raw: RawProxy,
  dstHost: string,
  dstPort: number,
  timeoutMs: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let socket: net.Socket;
    connectToProxy(raw, timeoutMs)
      .then((s) => {
        socket = s;
        if (raw.protocol === 'socks4') {
          return socks4Handshake(socket, dstHost, dstPort, timeoutMs);
        }
        if (raw.protocol === 'socks5') {
          return socks5Handshake(socket, dstHost, dstPort, timeoutMs);
        }
        // http / https proxies: issue a CONNECT to establish the tunnel.
        return new Promise<void>((res, rej) => {
          const t = setTimeout(() => rej(new Error('http connect timeout')), timeoutMs);
          let buf = Buffer.alloc(0);
          const onData = (chunk: Buffer) => {
            buf = Buffer.concat([buf, chunk]);
            const head = buf.toString('ascii');
            const idx = head.indexOf('\r\n\r\n');
            if (idx === -1) return;
            clearTimeout(t);
            socket.off('data', onData);
            const statusLine = head.slice(0, head.indexOf('\r\n'));
            if (/\b200\b/.test(statusLine)) {
              const leftover = buf.subarray(idx + 4);
              if (leftover.length) socket.unshift(leftover);
              res();
            } else {
              rej(new Error(`proxy CONNECT rejected: ${statusLine}`));
            }
          };
          socket.on('data', onData);
          socket.once('error', (e) => {
            clearTimeout(t);
            rej(e);
          });
          socket.write(`CONNECT ${dstHost}:${dstPort} HTTP/1.1\r\nHost: ${dstHost}:${dstPort}\r\n\r\n`);
        });
      })
      .then(() => resolve(socket))
      .catch((e) => {
        try {
          socket?.destroy();
        } catch {
          // ignore
        }
        reject(e);
      });
  });
}

// ---- HTTP & HTTPS reachability through a candidate proxy ------------------

interface HttpResult {
  statusCode: number;
  body: string;
  ms: number;
}

/** GET http://host/path through the candidate proxy (HTTP forward semantics). */
function httpGetThroughProxy(
  raw: RawProxy,
  host: string,
  path: string,
  timeoutMs: number,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    let socket: net.Socket;
    tunnelThroughProxy(raw, host, 80, timeoutMs)
      .then((s) => {
        socket = s;
        const start = Date.now();
        let buf = '';
        let headerEnd = -1;
        let statusCode = 0;
        let resolved = false;
        const finish = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(t);
          resolve({
            statusCode,
            body: headerEnd >= 0 ? buf.slice(headerEnd + 4) : '',
            ms: Date.now() - start,
          });
        };
        const t = setTimeout(() => {
          socket.destroy();
          finish();
        }, timeoutMs);
        socket.write(
          `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\nAccept: */*\r\n\r\n`,
        );
        socket.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          if (headerEnd === -1) {
            const idx = buf.indexOf('\r\n\r\n');
            if (idx === -1) return;
            headerEnd = idx;
            const head = buf.slice(0, idx);
            const statusLine = head.slice(0, head.indexOf('\r\n'));
            const m = /^HTTP\/\d(?:\.\d)?\s+(\d+)/.exec(statusLine);
            statusCode = m ? Number(m[1]) : 0;
          }
          // Once we have the headers, stop accumulating after a reasonable body size.
          if (buf.length > 16384) finish();
        });
        socket.on('end', finish);
        socket.on('error', (e) => {
          if (resolved) return;
          clearTimeout(t);
          reject(e);
        });
      })
      .catch(reject);
  });
}

/**
 * Test whether an HTTPS target is reachable through the candidate proxy:
 * establish a tunnel, perform a TLS handshake, then issue a GET.
 * Resolves true if the server responds with any HTTP status.
 */
function testHttpsThroughProxy(
  raw: RawProxy,
  host: string,
  path: string,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let tlsSocket: tls.TLSSocket | null = null;
    let tunnel: net.Socket | null = null;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        tlsSocket?.destroy();
        tunnel?.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);

    tunnelThroughProxy(raw, host, 443, timeoutMs)
      .then((sock) => {
        tunnel = sock;
        tlsSocket = tls.connect({
          socket: sock,
          servername: host,
          ALPNProtocols: ['http/1.1'],
          timeout: timeoutMs,
        });
        tlsSocket.on('secureConnect', () => {
          tlsSocket!.write(
            `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\nAccept: */*\r\n\r\n`,
          );
        });
        let buf = '';
        tlsSocket.on('data', (chunk) => {
          buf += chunk.toString('ascii');
          const idx = buf.indexOf('\r\n');
          if (idx !== -1) {
            const statusLine = buf.slice(0, idx);
            const ok = /^HTTP\/\d(?:\.\d)?\s+[1-5]\d\d\b/.test(statusLine);
            done(ok);
          }
        });
        tlsSocket.on('error', () => done(false));
        tlsSocket.on('close', () => done(false));
      })
      .catch(() => done(false));
  });
}

// ---- public validation API ------------------------------------------------

/** Validate a single proxy: reachability (ip-api) + AI/YouTube access + geo. */
export async function validateOne(raw: RawProxy): Promise<StoredProxy | null> {
  const v = config.validation;
  try {
    const result = await httpGetThroughProxy(raw, v.testHost, v.testPath, v.timeoutMs);
    if (result.statusCode !== 200) return null;

    let data: any;
    try {
      // body may contain trailing chunks; parse the first JSON object found
      const body = result.body;
      const start = body.indexOf('{');
      const end = body.lastIndexOf('}');
      if (start === -1 || end === -1) return null;
      data = JSON.parse(body.slice(start, end + 1));
    } catch {
      return null;
    }
    if (!data || data.status !== 'success') return null;

    const exitIp: string | undefined = data.query;
    const leaksRealIp = !!realIp && !!exitIp && exitIp === realIp;

    // "Pure IP" = the proxy can actually reach an AI site AND YouTube over
    // HTTPS, and does not leak this server's real IP.
    const [aiOk, ytOk] = await Promise.all([
      testHttpsThroughProxy(raw, v.targets.ai.host, v.targets.ai.path, v.httpsTimeoutMs),
      testHttpsThroughProxy(raw, v.targets.youtube.host, v.targets.youtube.path, v.httpsTimeoutMs),
    ]);
    const pure = aiOk && ytOk && !leaksRealIp;

    const now = Date.now();
    return {
      id: `${raw.protocol}:${raw.ip}:${raw.port}`,
      ip: raw.ip,
      port: raw.port,
      protocol: raw.protocol as Protocol,
      anonymity: raw.anonymity,
      alive: true,
      latency: result.ms,
      exitIp,
      pure,
      aiAccessible: aiOk,
      youtubeAccessible: ytOk,
      leaksRealIp,
      country: data.country,
      countryCode: data.countryCode,
      city: data.city,
      isp: data.isp,
      org: data.org,
      as: data.as,
      validatedAt: now,
      expiresAt: now + config.proxyTtlMs,
    };
  } catch {
    return null;
  }
}

/**
 * Validate a batch of candidate proxies with a bounded concurrency pool.
 * Returns only the proxies that passed validation.
 */
export async function validateBatch(
  list: RawProxy[],
  onProgress?: (done: number, total: number, alive: number) => void,
): Promise<StoredProxy[]> {
  const concurrency = Math.min(config.validation.concurrency, list.length || 1);
  const results: StoredProxy[] = [];
  let cursor = 0;
  let done = 0;
  let alive = 0;
  const total = list.length;

  async function worker() {
    while (cursor < total) {
      const idx = cursor++;
      const validated = await validateOne(list[idx]);
      done++;
      if (validated) {
        results.push(validated);
        alive++;
      }
      onProgress?.(done, total, alive);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
