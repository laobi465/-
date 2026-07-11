import { useMemo } from 'react';
import { ShieldCheck, ShieldAlert, Clock, Zap, Bot, Youtube } from 'lucide-react';
import { cn, countryFlag, expiresIn, timeAgo } from '@/lib/utils';
import type { Protocol, StoredProxy } from '@/types';

const PROTO_COLOR: Record<Protocol, string> = {
  http: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  https: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  socks4: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  socks5: 'bg-violet-500/15 text-violet-300 ring-violet-400/30',
};

function latencyColor(ms: number) {
  if (ms < 600) return 'text-emerald-400';
  if (ms < 1500) return 'text-cyan-300';
  if (ms < 3000) return 'text-amber-300';
  return 'text-rose-400';
}

export function ProxyTable({ proxies }: { proxies: StoredProxy[] }) {
  const rows = useMemo(() => proxies.slice(0, 300), [proxies]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur">
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-medium">代理地址</th>
              <th className="px-3 py-2.5 font-medium">协议</th>
              <th className="px-3 py-2.5 font-medium">国家</th>
              <th className="px-3 py-2.5 text-center font-medium">
                <Bot className="inline h-3 w-3" /> AI
              </th>
              <th className="px-3 py-2.5 text-center font-medium">
                <Youtube className="inline h-3 w-3" /> YT
              </th>
              <th className="px-3 py-2.5 font-medium">纯净</th>
              <th className="px-3 py-2.5 font-medium">出口 IP</th>
              <th className="px-3 py-2.5 font-medium">ISP / AS</th>
              <th className="px-3 py-2.5 text-right font-medium">
                <Zap className="inline h-3 w-3" /> 延迟
              </th>
              <th className="px-3 py-2.5 font-medium">
                <Clock className="inline h-3 w-3" /> 校验
              </th>
              <th className="px-4 py-2.5 text-right font-medium">过期</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-slate-500">
                  代理池为空，正在拉取并校验中…
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="transition hover:bg-slate-800/40">
                <td className="px-4 py-2.5 font-mono text-slate-200">
                  {p.ip}
                  <span className="text-slate-500">:</span>
                  {p.port}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      'inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1',
                      PROTO_COLOR[p.protocol],
                    )}
                  >
                    {p.protocol}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-300">
                  <span className="mr-1">{countryFlag(p.countryCode)}</span>
                  {p.countryCode || '--'}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Reachable ok={p.aiAccessible} />
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Reachable ok={p.youtubeAccessible} />
                </td>
                <td className="px-3 py-2.5">
                  {p.pure ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">
                      <ShieldCheck className="h-3 w-3" /> 纯净
                    </span>
                  ) : p.leaksRealIp ? (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300 ring-1 ring-rose-400/30">
                      <ShieldAlert className="h-3 w-3" /> 泄漏
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-700/40 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-slate-600/40">
                      匿名
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-slate-400">{p.exitIp || '--'}</td>
                <td className="px-3 py-2.5 max-w-[180px] truncate text-slate-400" title={p.isp}>
                  {p.isp || '--'}
                </td>
                <td className={cn('px-3 py-2.5 text-right font-mono tabular-nums', latencyColor(p.latency))}>
                  {p.latency}ms
                </td>
                <td className="px-3 py-2.5 text-slate-500">{timeAgo(p.validatedAt)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-400">
                  {expiresIn(p.expiresAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {proxies.length > rows.length && (
        <div className="border-t border-slate-800 bg-slate-950/40 px-4 py-2 text-center text-[11px] text-slate-500">
          显示前 {rows.length} 条，共 {proxies.length} 个代理
        </div>
      )}
    </div>
  );
}

function Reachable({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-400/30">
      ✓
    </span>
  ) : (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-700/40 text-slate-500">
      ✕
    </span>
  );
}
