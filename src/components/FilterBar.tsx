import { Search } from 'lucide-react';
import { cn, countryFlag } from '@/lib/utils';
import type { Protocol } from '@/types';

export type SortKey = 'latency' | 'recent';
export type PureFilter = 'all' | 'pure' | 'ai' | 'youtube' | 'any';

interface FilterBarProps {
  protocol: Protocol | 'all';
  setProtocol: (v: Protocol | 'all') => void;
  pure: PureFilter;
  setPure: (v: PureFilter) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  query: string;
  setQuery: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
  countries: Array<{ country: string; count: number }>;
}

const PROTOCOLS: Array<Protocol | 'all'> = ['all', 'http', 'https', 'socks4', 'socks5'];

export function FilterBar(props: FilterBarProps) {
  const {
    protocol,
    setProtocol,
    pure,
    setPure,
    sort,
    setSort,
    query,
    setQuery,
    country,
    setCountry,
    countries,
  } = props;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        value={protocol}
        onChange={(v) => setProtocol(v as Protocol | 'all')}
        options={PROTOCOLS.map((p) => ({ value: p, label: p === 'all' ? '全部协议' : p.toUpperCase() }))}
      />

      <Segmented
        value={pure}
        onChange={(v) => setPure(v as PureFilter)}
        options={[
          { value: 'all', label: '全部' },
          { value: 'pure', label: '纯净(AI+YT)' },
          { value: 'ai', label: '可访问AI' },
          { value: 'youtube', label: '可访问YT' },
          { value: 'any', label: '含匿名' },
        ]}
      />

      <Segmented
        value={sort}
        onChange={(v) => setSort(v as SortKey)}
        options={[
          { value: 'latency', label: '延迟优先' },
          { value: 'recent', label: '最新优先' },
        ]}
      />

      {/* 国家分类筛选 */}
      <div className="relative">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="appearance-none rounded-lg border border-slate-700 bg-slate-900/60 py-1.5 pl-3 pr-8 text-xs text-slate-200 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
        >
          <option value="">🌍 全部国家</option>
          {countries.map((c) => (
            <option key={c.country} value={c.country}>
              {countryFlag(c.country)} {c.country} ({c.count})
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
          ▼
        </span>
      </div>

      <div className="relative ml-auto">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索 IP / 国家 / ISP"
          className="w-56 rounded-lg border border-slate-700 bg-slate-900/60 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
        />
      </div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition',
            value === o.value
              ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
