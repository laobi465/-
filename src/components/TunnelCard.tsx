import { useEffect, useState } from 'react';
import { Network, Copy, Check, Shuffle, Globe, Zap, Loader2, XCircle, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTunnelInfo, testTunnel, updateCredentials, type TunnelTestResult } from '@/lib/api';
import type { TunnelInfo } from '@/types';

export function TunnelCard({ poolSize }: { poolSize: number }) {
  const [info, setInfo] = useState<TunnelInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TunnelTestResult | null>(null);

  // Inline "edit credentials" form state.
  const [editing, setEditing] = useState(false);
  const [editUser, setEditUser] = useState('');
  const [editPass, setEditPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  // address = "user:pass@host:port" (display); copyValue = "http://user:pass@host:port"
  const address = info?.address ?? 'proxy:proxy@127.0.0.1:8080';
  const copyValue = `http://${address}`;
  // isLocal now checks the host part (address no longer starts with the host).
  const isLocal = !info || (info.host || '127.0.0.1').startsWith('127.');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const onTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testTunnel();
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, latencyMs: 0, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const openEdit = () => {
    // Prefill username from current info; password is never exposed by the
    // API, so it must be re-entered each time.
    setEditUser(info?.username ?? 'proxy');
    setEditPass('');
    setSaveMsg(null);
    setEditing(true);
  };

  const onSave = async () => {
    if (!editUser.trim() || !editPass.trim()) {
      setSaveMsg({ ok: false, text: '用户名和密码不能为空' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await updateCredentials(editUser.trim(), editPass.trim());
      setSaveMsg({ ok: true, text: '账号已更新，立即生效' });
      setEditing(false);
      // Reload tunnel info so the displayed address reflects the new creds.
      getTunnelInfo()
        .then((d) => setInfo(d))
        .catch(() => {});
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
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
        <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-3 text-lg font-semibold tracking-wide text-emerald-300">
          {address}
        </code>
        <button
          onClick={copy}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 transition hover:bg-slate-800"
          title={`复制 ${copyValue}`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
        <button
          onClick={onTest}
          disabled={testing}
          className={cn(
            'flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition',
            testing
              ? 'cursor-wait border-slate-700 bg-slate-800/60 text-slate-400'
              : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20',
          )}
          title="测试隧道代理（通过它访问 httpbin.org/ip 验证链路）"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{testing ? '测试中…' : '测试连接'}</span>
        </button>
      </div>

      {isLocal && (
        <p className="mt-1.5 text-[11px] text-amber-400/80">
          当前为本地地址。部署到服务器后，将自动显示服务器公网 IP；也可用环境变量 TUNNEL_PUBLIC_HOST 指定域名。
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Meta label="协议" value={info?.protocols.join(' / ') ?? 'http · https'} />
        <Meta label="代理池大小" value={`${info?.poolSize ?? poolSize}`} />
        <Meta
          label="代理账号"
          value={info ? `${info.username}:${info.password}` : 'proxy:proxy'}
        />
        <Meta
          label="本机真实IP"
          value={info?.realIp ?? '未知'}
        />
      </div>

      <div className="mt-3">
        <button
          onClick={() => (editing ? setEditing(false) : openEdit())}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition',
            editing
              ? 'border-slate-600 bg-slate-800/70 text-slate-300'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
          )}
        >
          <KeyRound className="h-3.5 w-3.5" />
          {editing ? '取消修改' : '修改代理账号'}
        </button>
      </div>

      {editing && (
        <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">用户名</span>
              <input
                value={editUser}
                onChange={(e) => setEditUser(e.target.value)}
                autoComplete="off"
                placeholder="代理账号用户名"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">密码</span>
              <input
                type="password"
                value={editPass}
                onChange={(e) => setEditPass(e.target.value)}
                autoComplete="new-password"
                placeholder="输入新密码"
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500/60"
              />
            </label>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition',
                saving
                  ? 'cursor-wait border-slate-700 bg-slate-800/60 text-slate-400'
                  : 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25',
              )}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? '保存中…' : '保存并生效'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800"
            >
              取消
            </button>
            {saveMsg && (
              <span
                className={cn(
                  'ml-1 text-xs',
                  saveMsg.ok ? 'text-emerald-400' : 'text-rose-400',
                )}
              >
                {saveMsg.text}
              </span>
            )}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            修改后立即生效（新请求需使用新账号），并持久化到服务器，重启后仍然保留。
          </p>
        </div>
      )}

      {saveMsg && !editing && (
        <div
          className={cn(
            'mt-2 text-xs',
            saveMsg.ok ? 'text-emerald-400' : 'text-rose-400',
          )}
        >
          {saveMsg.text}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          <Globe className="h-3 w-3" /> 使用示例
        </div>
        <pre className="overflow-x-auto text-[11px] leading-relaxed text-slate-300">
{`# 点击复制按钮得到 http://user:pass@host:port
# curl 用法（自动从纯净代理池轮换出口 IP）
curl -x ${copyValue} https://httpbin.org/ip

# 浏览器 / 爬虫直接填入该 HTTP 代理即可
# 每次请求自动切换不同的上游纯净 IP`}
        </pre>
      </div>

      {testResult && (
        <div
          className={cn(
            'mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs',
            testResult.ok
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-200',
          )}
        >
          {testResult.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          )}
          <div className="min-w-0 flex-1 break-words">
            {testResult.ok ? (
              <span>
                连接成功 · 出口 IP <span className="font-mono text-emerald-300">{testResult.exitIp ?? '未知'}</span> · 耗时 {testResult.latencyMs}ms
              </span>
            ) : (
              <span>
                连接失败 · {testResult.error || `HTTP ${testResult.status ?? '?'}`}
                {testResult.latencyMs > 0 && ` · 耗时 ${testResult.latencyMs}ms`}
              </span>
            )}
          </div>
          <button
            onClick={() => setTestResult(null)}
            className="shrink-0 text-current/60 transition hover:text-current"
            title="关闭"
          >
            ✕
          </button>
        </div>
      )}
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
