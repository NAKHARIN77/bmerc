// Reporting periods shared by the owner console and company reports.

export const monthStartUtc = (d = new Date(), back = 0) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));

/** Periods for revenue and reports: last 7 days, last 4 weeks (from Monday) or last 3 months, oldest first. */
export function periods(kind: 'day' | 'week' | 'month', now = new Date()) {
  const DAY = 86_400_000;
  const day = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' }).format(d);
  const out: Array<{ from: Date; to: Date; label: string }> = [];
  if (kind === 'day') {
    for (let i = 6; i >= 0; i--) {
      const from = new Date(day(now).getTime() - i * DAY);
      out.push({ from, to: new Date(from.getTime() + DAY), label: fmt(from, { day: 'numeric', month: 'short' }) + (i === 0 ? ' (today)' : '') });
    }
  } else if (kind === 'week') {
    const monday = new Date(day(now).getTime() - ((now.getUTCDay() + 6) % 7) * DAY);
    for (let i = 3; i >= 0; i--) {
      const from = new Date(monday.getTime() - i * 7 * DAY);
      const to = new Date(from.getTime() + 7 * DAY);
      const last = fmt(new Date(to.getTime() - DAY), { day: 'numeric', month: 'short' });
      out.push({ from, to, label: `${fmt(from, { day: 'numeric', month: 'short' })} to ${last}${i === 0 ? ' (so far)' : ''}` });
    }
  } else {
    for (let i = 2; i >= 0; i--) {
      const from = monthStartUtc(now, i);
      out.push({ from, to: monthStartUtc(now, i - 1), label: fmt(from, { month: 'short', year: 'numeric' }) + (i === 0 ? ' (this month)' : '') });
    }
  }
  return out;
}
