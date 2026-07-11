import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a millisecond timestamp as a local HH:MM:SS string. */
export function formatTime(ts: number | null | undefined): string {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

/** Human-readable "x秒前" / "x分钟前". */
export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return '从未';
  const diff = Date.now() - ts;
  if (diff < 5000) return '刚刚';
  if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  return `${Math.floor(diff / 3600000)}小时前`;
}

/** Countdown until the next refresh, e.g. "04:23". */
export function countdown(to: number | null | undefined): string {
  if (!to) return '--:--';
  const diff = Math.max(0, to - Date.now());
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Remaining lifetime before a proxy expires. */
export function expiresIn(expiresAt: number): string {
  const diff = Math.max(0, expiresAt - Date.now());
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** Convert a 2-letter country code into a flag emoji. */
export function countryFlag(code?: string): string {
  if (!code || code.length !== 2) return '🏳️';
  const cc = code.toUpperCase();
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (cc.charCodeAt(0) - 65), A + (cc.charCodeAt(1) - 65));
}
