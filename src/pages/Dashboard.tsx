import { useEffect, useMemo, useState } from 'react';
import {
  Database,
  ShieldCheck,
  Globe2,
  Gauge,
  Network,
  Layers,
  Bot,
  Youtube,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { StatCard } from '@/components/StatCard';
import { PureProxyCard } from '@/components/PureProxyCard';
import { FilterBar, type PureFilter, type SortKey } from '@/components/FilterBar';
import { ProxyTable } from '@/components/ProxyTable';
import { useProxySocket } from '@/hooks/useProxySocket';
import { triggerRefresh } from '@/lib/api';
import { cn, countryFlag } from '@/lib/utils';
import type { Protocol } from '@/types';

export default function Dashboard() {
  const { stats, progress, proxies, version, connected } = useProxySocket();

  const [protocol, setProtocol] = useState<Protocol | 'all'>('all');
  const [pure, setPure] = useState<PureFilter>('all');
  const [sort, setSort] = useState<SortKey>('latency');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);

  // tick once a second for countdowns / relative times
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const countries = stats?.byCountry ?? [];

  const filtered = useMemo(() => {
    let arr = proxies;
    if (protocol !== 'all') arr = arr.filter((p) => p.protocol === protocol);
    if (pure === 'pure') arr = arr.filter((p) => p.pure);
    else if (pure === 'ai') arr = arr.filter((p) => p.aiAccessible);
    else if (pure === 'youtube') arr = arr.filter((p) => p.youtubeAccessible);
    else if (pure === 'any') arr = arr.filter((p) => !p.leaksRealIp);
    if (country) arr = arr.filter((p) => (p.countryCode || '') === country);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter(
        (p) =>
          p.ip.includes(q) ||
          String(p.port).includes(q) ||
          (p.countryCode || '').toLowerCase().includes(q) ||
          (p.isp || '').toLowerCase().includes(q),
      );
    }
    arr = [...arr].sort((a, b) =>
      sort === 'latency' ? a.latency - b.latency : b.validatedAt - a.validatedAt,
    );
    return arr;
  }, [proxies, protocol, pure, query, sort, country]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await triggerRefresh();
    } catch {
      // ignore — websocket will still reflect state
    } finally {
      setTimeout(() => setRefreshing(false), 800);
    }
  };

  const byProto = stats?.byProtocol ?? {};

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Header
        stats={stats}
        progress={progress}
        connected={connected}
        onRefresh={onRefresh}
        refreshing={refreshing || !!stats?.refreshing}
        now={now}
        version={version}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          icon={Database}
          label="代理池总数"
          value={stats?.total ?? 0}
          hint="已校验存活的代理"
          accent="emerald"
        />
        <StatCard
          icon={ShieldCheck}
          label="纯净 IP"
          value={stats?.pure ?? 0}
          hint="可访问 AI + YouTube"
          accent="cyan"
        />
        <StatCard
          icon={Bot}
          label="可访问 AI"
          value={stats?.aiAccessible ?? 0}
          hint="能访问 chat.openai.com"
          accent="violet"
        />
        <StatCard
          icon={Youtube}
          label="可访问 YouTube"
          value={stats?.youtubeAccessible ?? 0}
          hint="能访问 www.youtube.com"
          accent="rose"
        />
        <StatCard
          icon={Gauge}
          label="平均延迟"
          value={stats?.avgLatency ? `${stats.avgLatency}ms` : '--'}
          hint={`覆盖 ${countries.length} 个国家`}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PureProxyCard proxies={proxies} />
        </div>
        <div className="space-y-4">
          <ProtocolBreakdown byProtocol={byProto} total={stats?.total ?? 0} />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Layers className="h-4 w-4 text-emerald-400" /> 代理池明细
            <span className="text-xs font-normal text-slate-500">
              （实时更新 · 共 {filtered.length} 条）
            </span>
          </h2>
        </div>
        <FilterBar
          protocol={protocol}
          setProtocol={setProtocol}
          pure={pure}
          setPure={setPure}
          sort={sort}
          setSort={setSort}
          query={query}
          setQuery={setQuery}
          country={country}
          setCountry={setCountry}
          countries={countries}
        />
        {country && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>已按国家筛选：</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300 ring-1 ring-emerald-400/30">
              {countryFlag(country)} {country}
              <button
                onClick={() => setCountry('')}
                className="ml-1 text-emerald-400 hover:text-emerald-200"
              >
                ✕
              </button>
            </span>
          </div>
        )}
        <ProxyTable proxies={filtered} />
      </section>

      {/* 国家分类总览 */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Globe2 className="h-4 w-4 text-emerald-400" /> 国家 / 地区分类
          <span className="text-xs font-normal text-slate-500">
            （点击任意国家可快速筛选）
          </span>
        </h2>
        <CountryGrid
          countries={countries}
          active={country}
          onPick={(c) => setCountry(c === country ? '' : c)}
        />
      </section>

      <footer className="pt-2 text-center text-[11px] text-slate-600">
        数据来源 github.com/proxifly/free-proxy-list · 纯净判定 = 可访问 AI 网站与 YouTube · 仅供学习研究
      </footer>
    </div>
  );
}

function ProtocolBreakdown({
  byProtocol,
  total,
}: {
  byProtocol: Record<string, number>;
  total: number;
}) {
  const order = ['http', 'https', 'socks4', 'socks5'];
  const colors: Record<string, string> = {
    http: 'bg-sky-400',
    https: 'bg-emerald-400',
    socks4: 'bg-amber-400',
    socks5: 'bg-violet-400',
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <Network className="h-3.5 w-3.5" /> 协议分布
      </h3>
      <div className="space-y-2.5">
        {order.map((k) => {
          const v = byProtocol[k] || 0;
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          return (
            <div key={k}>
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                <span className="uppercase">{k}</span>
                <span className="tabular-nums text-slate-300">{v}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${colors[k]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CountryGrid({
  countries,
  active,
  onPick,
}: {
  countries: Array<{ country: string; count: number }>;
  active: string;
  onPick: (c: string) => void;
}) {
  if (countries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-xs text-slate-500">
        暂无国家数据，代理池填充后将在此展示
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {countries.map((c) => {
        const isActive = c.country === active;
        return (
          <button
            key={c.country}
            onClick={() => onPick(c.country)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition',
              isActive
                ? 'border-emerald-500/50 bg-emerald-500/15 ring-1 ring-emerald-400/30'
                : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/40',
            )}
          >
            <span className="text-lg leading-none">{countryFlag(c.country)}</span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-slate-200">{c.country}</div>
              <div className="text-[10px] tabular-nums text-slate-500">{c.count} 个</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
