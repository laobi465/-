import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  accent: 'emerald' | 'cyan' | 'violet' | 'amber' | 'rose' | 'sky';
}

const ACCENT: Record<StatCardProps['accent'], string> = {
  emerald: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/30',
  cyan: 'text-cyan-300 bg-cyan-500/10 ring-cyan-400/30',
  violet: 'text-violet-300 bg-violet-500/10 ring-violet-400/30',
  amber: 'text-amber-300 bg-amber-500/10 ring-amber-400/30',
  rose: 'text-rose-300 bg-rose-500/10 ring-rose-400/30',
  sky: 'text-sky-300 bg-sky-500/10 ring-sky-400/30',
};

export function StatCard({ icon: Icon, label, value, hint, accent }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg ring-1',
            ACCENT[accent],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-100">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
