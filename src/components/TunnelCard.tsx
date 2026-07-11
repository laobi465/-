import { useEffect, useState } from 'react';
import { Network, Copy, Check, Shuffle, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTunnelInfo } from '@/lib/api';
import type { TunnelInfo } from '@/types';

export function TunnelCard({ poolSize }: { poolSize: number }) {
  const [info, setInfo] = useState<TunnelInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getTunnelInfo()
        .then((d) => alive && setInfo(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const address = info?.address ?? '127.0.0.1:8080';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="flex items-center gap-2 text-emerald-300">
        <Network className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wider">隧道代理地址</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">
          <Shuffle className="h-3 w-3" /> 轮询旋转
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-3 text-lg font-semibold tracking-wide text-emerald-300">
          {address}
        </code>
        <button
          onClick={copy}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 transition hover:bg-slate-800"
          title="复制地址"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Meta label="协议" value={info?.protocols.join(' / ') ?? 'http · https'} />
        <Meta label="代理池大小" value={`${info?.poolSize ?? poolSize}`} />
        <Meta
          label="本机真实IP"
          value={info?.realIp ?? '未知'}
        />
        <Meta label="模式" value="HTTP + HTTPS CONNECT" />
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <Globe className="h-3 w-3" /> 使用示例
        </div>
        <pre className="overflow-x-auto text-[11px] leading-relaxed text-slate-300">
{`# 通过隧道代理访问（自动从纯净代理池轮换）
curl -x http://${address} https://httpbin.org/ip

# 浏览器 / 爬虫设置为该 HTTP 代理即可
# 每次请求自动切换不同的上游纯净 IP`}
        </pre>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn('mt-0.5 truncate text-xs font-medium text-slate-200')}>{value}</div>
    </div>
  );
}
