/** "just now", "4 min ago", "2 h ago", "yesterday", then "Nov 1". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMin = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (Number.isNaN(diffMin)) return '';
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h ago`;
  if (diffH < 48) return 'yesterday';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(then);
}
