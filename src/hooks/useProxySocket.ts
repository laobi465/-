import { useEffect, useRef, useState } from 'react';
import type { Progress, Stats, StoredProxy } from '@/types';

interface LiveState {
  stats: Stats | null;
  progress: Progress;
  proxies: StoredProxy[];
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

  return state;
}
