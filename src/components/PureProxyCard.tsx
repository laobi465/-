import { useState } from 'react';
import { ShieldCheck, Copy, Check, Globe, Zap } from 'lucide-react';
import { cn, countryFlag } from '@/lib/utils';
import type { Protocol, StoredProxy } from '@/types';

const PROTO_STYLE: Record<Protocol, string> = {
  http: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  https: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  socks4: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  socks5: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
};

/**
 * 展示代理池中延迟最低的 5 个纯净 IP（可访问 AI + YouTube 且不泄漏真实 IP）。
 * 每个地址带独立复制按钮，复制值为带协议格式的 `protocol://ip:port`，
 * 可直接用于 curl / 浏览器 / 爬虫。
 */
export function PureProxyCard({ proxies }: { proxies: StoredProxy[] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // 纯净 IP = pure === true；按延迟升序取前 5 个。
  const top = [...proxies]
    .filter((p) => p.pure)
    .sort((a, b) => a.latency - b.latency)
    .slice(0, 5);

  const copy = async (p: StoredProxy, idx: number) => {
    const value = `${p.protocol}://${p.ip}:${p.port}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="flex items-center gap-2 text-cyan-300">
        <ShieldCheck className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">纯净 IP 地址</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-medium text-cyan-300 ring-1 ring-cyan-400/30">
          <Zap className="h-3 w-3" /> 可访问 AI + YouTube
        </span>
      </div>

      {top.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">
          暂无纯净 IP，代理池校验完成后将在此展示前 5 个最优地址。
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {top.map((p, idx) => {
            const value = `${p.protocol}://${p.ip}:${p.port}`;
            const copied = copiedIdx === idx;
            return (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5"
              >
                <span
                  className={cn(
                    'shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    PROTO_STYLE[p.protocol],
                  )}
                >
                  {p.protocol}
                </span>
                <code className="min-w-0 flex-1 truncate text-sm font-medium text-emerald-300">
                  {value}
                </code>
                <span className="hidden shrink-0 items-center gap-1 text-[11px] text-slate-400 sm:inline-flex">
                  <Globe className="h-3 w-3" />
                  {countryFlag(p.countryCode)} {p.countryCode ?? '??'}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                  {p.latency}ms
                </span>
                <button
                  onClick={() => copy(p, idx)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800/60 text-slate-300 transition hover:bg-slate-800"
                  title={`复制 ${value}`}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        点击复制按钮即可得到带协议格式的地址（如{' '}
        <span className="font-mono text-slate-400">socks5://1.2.3.4:1080</span>
        ），可直接用于 curl / 浏览器 / 爬虫。
      </p>
    </div>
  );
}
