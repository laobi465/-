import { Server, Activity, RefreshCw } from 'lucide-react';
import { cn, countdown, formatTime, timeAgo } from '@/lib/utils';
import { VersionBadge } from '@/components/VersionBadge';
import type { Stats, Progress, VersionInfo } from '@/types';

interface HeaderProps {
  stats: Stats | null;
  progress: Progress;
  connected: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  now: number;
  version: VersionInfo | null;
}

export function Header({ stats, progress, connected, onRefresh, refreshing, now, version }: HeaderProps) {
  const nextIn = countdown(stats?.nextRefreshAt);
  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : stats?.refreshing ? 0 : 100;

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
          <Server className="h-6 w-6 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            代理池监控台
          </h1>
          <p className="text-xs text-slate-400">
            proxifly/free-proxy-list · 每 5 分钟自动刷新 · 过期自动清理
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <VersionBadge version={version} />
        <StatusPill
          ok={connected}
          label={connected ? '实时连接' : '断开重连中'}
          icon={<Activity className="h-3.5 w-3.5" />}
        />
        <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-300">
          上次刷新 <span className="text-slate-100">{timeAgo(stats?.lastRefreshAt)}</span>
        </div>
        <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-300">
          下次刷新 <span className="tabular-nums text-emerald-300">{nextIn}</span>
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition',
            refreshing
              ? 'cursor-not-allowed border-slate-700 bg-slate-800/60 text-slate-400'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          {refreshing ? '检测中…' : '立即刷新'}
        </button>
      </div>

      {stats?.refreshing && progress.total > 0 && (
        <div className="w-full">
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              正在校验代理 {progress.done}/{progress.total} · 存活 {progress.alive}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </header>
  );
}

function StatusPill({
  ok,
  label,
  icon,
}: {
  ok: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium',
        ok
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-300',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          ok ? 'bg-emerald-400' : 'animate-pulse bg-amber-400',
        )}
      />
      {icon}
      {label}
    </div>
  );
}
