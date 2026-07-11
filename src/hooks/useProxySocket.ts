import { useEffect, useRef, useState } from 'react';
import type { Progress, Stats, StoredProxy, VersionInfo } from '@/types';
import { checkVersionUpdate } from '@/lib/api';

interface LiveState {
  stats: Stats | null;
  progress: Progress;
  proxies: StoredProxy[];
  version: VersionInfo | null;
  connected: boolean;
}

const EMPTY_PROGRESS: Progress = { done: 0, total: 0, alive: 0 };

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  // In dev, Vite proxies /ws to the backend; in prod the same origin serves it.
  return `${proto}://${window.location.host}/ws`;
}

/**
 * Maintain a single WebSocket to the backend and expose the latest snapshot.
 * Auto-reconnects with backoff. Also polls the tunnel info over HTTP.
 */
export function useProxySocket() {
  const [state, setState] = useState<LiveState>({
    stats: null,
    progress: EMPTY_PROGRESS,
    proxies: [],
    version: null,
    connected: false,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(1000);

  useEffect(() => {
    let closed = false;

    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 1000;
        setState((s) => ({ ...s, connected: true }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'snapshot') {
            setState({
              stats: msg.stats,
              progress: msg.progress ?? EMPTY_PROGRESS,
              proxies: msg.proxies ?? [],
              version: msg.version ?? null,
              connected: true,
            });
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setState((s) => ({ ...s, connected: false }));
        if (closed) return;
        const delay = Math.min(retryRef.current * 1.5, 8000);
        retryRef.current = delay;
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
    };
  }, []);

  // On page load / refresh, trigger a fresh GitHub update check so the version
  // badge reflects the latest status immediately (the backend also broadcasts
  // the result over the open WebSocket).
  useEffect(() => {
    checkVersionUpdate()
      .then((v) => setState((s) => ({ ...s, version: v })))
      .catch(() => {
        // network error / server down — WebSocket snapshot will catch up
      });
  }, []);

  return state;
}
