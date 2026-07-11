import { useEffect, useRef, useState } from 'react';
import { ChevronDown, RefreshCw, CheckCircle2, ArrowUpCircle, ExternalLink } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { triggerUpdate } from '@/lib/api';
import type { VersionInfo } from '@/types';

interface VersionBadgeProps {
  version: VersionInfo | null;
}

type Phase = 'idle' | 'updating' | 'restarting' | 'done' | 'error';

export function VersionBadge({ version }: VersionBadgeProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [msg, setMsg] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close the popover when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const ver = version?.version ?? '—';
  const hasUpdate = version?.hasUpdate ?? false;

  const onUpdate = async () => {
    setPhase('updating');
    setMsg('正在拉取最新代码并安装依赖…');
    try {
      const res = await triggerUpdate();
      if (!res.ok) {
        setPhase('error');
        setMsg(res.message);
        return;
      }
      setPhase('restarting');
      setMsg('更新完成，服务正在重启，请稍候…');
      // Poll health until the server comes back, then reload the page.
      let ok = false;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const r = await fetch('/api/health');
          if (r.ok) {
            ok = true;
            break;
          }
        } catch {
          // still restarting
        }
      }
      if (ok) {
        setPhase('done');
        setMsg('重启完成，正在刷新页面…');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setPhase('error');
        setMsg('重启超时，请手动刷新页面');
      }
    } catch (e) {
      setPhase('error');
      setMsg((e as Error).message);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
          hasUpdate
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
            : 'border-slate-700/60 bg-slate-800/40 text-slate-300 hover:bg-slate-800/70',
        )}
      >
        <span className="tabular-nums">v{ver}</span>
        {hasUpdate && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          {/* Mobile backdrop: tap anywhere outside to close (also prevents scroll bleed). */}
          <div
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              // Mobile: fixed panel centered near the top, full width minus margins
              // so it never overflows the viewport. Desktop (sm+): right-aligned
              // dropdown anchored under the badge.
              'fixed left-1/2 top-3 z-50 w-[calc(100vw-1.5rem)] max-w-sm -translate-x-1/2',
              'sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:max-w-none sm:translate-x-0',
              'rounded-xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur',
            )}
          >
            {/* header */}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                版本信息
              </span>
              <a
                href={`https://github.com/laobi465/-/commit/${version?.commit ?? ''}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
              >
                GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* current version */}
            <div className="space-y-1.5 text-xs">
              <Row label="当前版本" value={`v${ver}`} />
              <Row label="本地提交" value={version?.commit ?? '—'} mono />
              <Row
                label="远程提交"
                value={version?.remoteCommit ?? '检测中…'}
                mono
              />
              <Row
                label="检查时间"
                value={version?.lastCheckedAt ? timeAgo(version.lastCheckedAt) : '—'}
              />
            </div>

            {/* status */}
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2 text-xs">
              {phase === 'restarting' || phase === 'updating' ? (
                <RefreshCw className="h-4 w-4 animate-spin text-cyan-400" />
              ) : hasUpdate ? (
                <ArrowUpCircle className="h-4 w-4 text-amber-400" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              )}
              <span
                className={cn(
                  'min-w-0 flex-1',
                  phase === 'error'
                    ? 'text-rose-300'
                    : hasUpdate || phase === 'restarting' || phase === 'updating'
                      ? 'text-slate-200'
                      : 'text-slate-400',
                )}
              >
                {phase === 'updating'
                  ? '正在更新…'
                  : phase === 'restarting'
                    ? '服务重启中…'
                    : phase === 'done'
                      ? '更新完成'
                      : phase === 'error'
                        ? msg || '更新失败'
                        : hasUpdate
                          ? '发现新版本，可立即更新'
                          : '已是最新版本'}
              </span>
            </div>

            {/* update button / message */}
            {hasUpdate && phase !== 'restarting' && phase !== 'done' && (
              <button
                onClick={onUpdate}
                disabled={phase === 'updating' || version?.updating}
                className={cn(
                  'mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition',
                  phase === 'updating'
                    ? 'cursor-wait border-slate-700 bg-slate-800 text-slate-400'
                    : 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25',
                )}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', phase === 'updating' && 'animate-spin')} />
                {phase === 'updating' ? '更新中…' : '立即更新并重启'}
              </button>
            )}

            {msg && (phase === 'updating' || phase === 'restarting' || phase === 'error') && (
              <p className="mt-2 break-words text-[11px] leading-relaxed text-slate-500">{msg}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-right text-slate-200',
          mono && 'font-mono text-[11px]',
        )}
      >
        {value}
      </span>
    </div>
  );
}
