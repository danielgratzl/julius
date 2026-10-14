// All dates are ISO "YYYY-MM-DD" strings, computed in UTC to avoid DST drift.
const DAY = 86_400_000;

const toIso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(s + "T00:00:00Z");

/** Today's date in the local timezone (Europe/Zurich in Docker). */
export function localToday(now = new Date()): string {
  return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export const addDays = (s: string, n: number) => toIso(new Date(parse(s).getTime() + n * DAY));

/** Adds months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: string, n: number): string {
  const d = parse(s);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toIso(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))));
}

export function monthEnd(s: string): string {
  const d = parse(s);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export const firstOfMonth = (s: string) => s.slice(0, 8) + "01";
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
export const fmtDate = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "—");
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());
