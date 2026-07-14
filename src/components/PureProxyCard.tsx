import { useMemo, useState } from 'react';
import { ShieldCheck, Copy, Check, Globe, Zap, ClipboardList } from 'lucide-react';
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
 * 可直接用于 curl / 浏览器 / 爬虫。另提供"一键复制全部"按钮，复制当前
 * 代理池中所有纯净 IP（每行一个，带协议格式）。
 *
 * 顶部国家选择器可按国家筛选纯净 IP（含"全部"选项），列表展示与"一键复制
 * 全部"均遵循当前选中国家。
 */
export function PureProxyCard({ proxies }: { proxies: StoredProxy[] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [country, setCountry] = useState<string>('');

  // 全部纯净 IP，按延迟升序。用于国家选项与"一键复制全部"。
  const allPure = useMemo(
    () => [...proxies].filter((p) => p.pure).sort((a, b) => a.latency - b.latency),
    [proxies],
  );

  // 可选国家列表（来自当前纯净 IP，按数量降序）。
  const countries = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of allPure) {
      const cc = (p.countryCode || '').toUpperCase();
      if (!cc) continue;
      map.set(cc, (map.get(cc) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [allPure]);

  // 按选中国家过滤后的纯净 IP。
  const filtered = useMemo(
    () =>
      country
        ? allPure.filter((p) => (p.countryCode || '').toUpperCase() === country)
        : allPure,
    [allPure, country],
  );

  // 列表展示前 5 个（遵循国家筛选）。
  const top = filtered.slice(0, 5);

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

  // 复制（过滤后的）全部纯净 IP，每行一个，格式 protocol://ip:port。
  const copyAll = async () => {
    if (filtered.length === 0) return;
    const text = filtered.map((p) => `${p.protocol}://${p.ip}:${p.port}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
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

      {/* 国家选择器 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500">国家：</span>
        <button
          onClick={() => setCountry('')}
          className={cn(
            'rounded-md border px-2 py-1 text-[11px] font-medium transition',
            country === ''
              ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30'
              : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800',
          )}
        >
          全部（{allPure.length}）
        </button>
        {countries.map(([cc, count]) => (
          <button
            key={cc}
            onClick={() => setCountry(cc)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition',
              country === cc
                ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30'
                : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800',
            )}
          >
            <span>{countryFlag(cc)}</span>
            <span>{cc}</span>
            <span className="tabular-nums text-slate-500">{count}</span>
          </button>
        ))}
        {countries.length === 0 && (
          <span className="text-[11px] text-slate-600">暂无国家数据</span>
        )}
      </div>

      {top.length === 0 ? (
        <p className="mt-4 text-xs text-slate-500">
          {country
            ? `所选国家暂无纯净 IP，可切换为"全部"查看其它国家。`
            : '暂无纯净 IP，代理池校验完成后将在此展示前 5 个最优地址。'}
        </p>
      ) : (
        <>
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

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={copyAll}
              disabled={filtered.length === 0}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition',
                filtered.length === 0
                  ? 'cursor-not-allowed border-slate-700 bg-slate-800/40 text-slate-500'
                  : copiedAll
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25',
              )}
              title={`一键复制当前筛选下全部 ${filtered.length} 个纯净 IP（每行一个，带协议格式）`}
            >
              {copiedAll ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <ClipboardList className="h-3.5 w-3.5" />
              )}
              {copiedAll
                ? '已复制'
                : `一键复制全部（${filtered.length} 个${country ? ` · ${country}` : ''}）`}
            </button>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            上方列出延迟最低的 5 个；"一键复制全部"会复制当前筛选下所有纯净 IP，
            每行一个、带协议格式（如{' '}
            <span className="font-mono text-slate-400">socks5://1.2.3.4:1080</span>
            ），可直接用于 curl / 浏览器 / 爬虫。
          </p>
        </>
      )}
    </div>
  );
}
