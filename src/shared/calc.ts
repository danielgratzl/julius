import { addDays, addMonths, daysBetween, monthEnd } from "./dates";
import { BILLING_MONTHS, type Account, type AccountType, type AppData, type Category, type CostKind, type RecurringCost, type Snapshot } from "./types";

export interface PersonWorth {
  total: number;
  liquid: number;
  pension: number;
  bank: number;
  investment: number;
}

export interface Worth {
  date: string;
  total: number;
  liquid: number;
  pension: number;
  byType: Record<AccountType, number>;
  byPerson: Record<string, PersonWorth>;
}

export const isLiquid = (a: Account) => a.type !== "pension";
export const isActive = (a: Account, today: string) => !a.closedAt || a.closedAt > today;

/** Read-only view over the data with indexed snapshot lookups. */
export function createLedger(data: AppData, today: string) {
  const byAccount = new Map<string, Snapshot[]>();
  for (const s of data.snapshots) {
    const list = byAccount.get(s.accountId);
    if (list) list.push(s);
    else byAccount.set(s.accountId, [s]);
  }
  for (const list of byAccount.values()) list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const snapshotsOf = (accountId: string) => byAccount.get(accountId) ?? [];
  const lastSnapshot = (a: Account) => snapshotsOf(a.id).at(-1) ?? null;

  /** Latest snapshot on or before `date`; 0 before the first snapshot and from closedAt on. */
  function valueAt(a: Account, date: string): number {
    if (a.closedAt && date >= a.closedAt) return 0;
    let v = 0;
    for (const s of snapshotsOf(a.id)) {
      if (s.date <= date) v = s.balance;
      else break;
    }
    return v;
  }

  function daysSinceUpdate(a: Account): number | null {
    const last = lastSnapshot(a);
    return last ? daysBetween(last.date, today) : null;
  }

  function isStale(a: Account): boolean {
    if (!isActive(a, today)) return false;
    const d = daysSinceUpdate(a);
    return d === null || d > data.settings.staleDays;
  }

  function worthAt(date: string): Worth {
    const w: Worth = { date, total: 0, liquid: 0, pension: 0, byType: { bank: 0, investment: 0, pension: 0 }, byPerson: {} };
    for (const p of data.persons) w.byPerson[p.id] = { total: 0, liquid: 0, pension: 0, bank: 0, investment: 0 };
    for (const a of data.accounts) {
      const v = valueAt(a, date);
      if (!v) continue;
      w.total += v;
      w.byType[a.type] += v;
      if (isLiquid(a)) w.liquid += v;
      else w.pension += v;
      // Shared accounts are split evenly between their owners
      const share = v / a.owners.length;
      for (const pid of a.owners) {
        const pw = w.byPerson[pid];
        if (!pw) continue;
        pw.total += share;
        if (a.type === "pension") pw.pension += share;
        else {
          pw.liquid += share;
          pw[a.type] += share;
        }
      }
    }
    return w;
  }

  /** One point per month-end from the first snapshot, plus today. */
  function series(): Worth[] {
    const first = data.snapshots.reduce<string | null>((m, s) => (m === null || s.date < m ? s.date : m), null);
    const points: Worth[] = [];
    if (first) {
      for (let d = monthEnd(first); d < today; d = monthEnd(addDays(d, 1))) points.push(worthAt(d));
    }
    points.push(worthAt(today));
    return points;
  }

  return { snapshotsOf, lastSnapshot, valueAt, daysSinceUpdate, isStale, worthAt, series };
}

export type Ledger = ReturnType<typeof createLedger>;

/* ---------- recurring costs ---------- */

export const monthlyCost = (c: RecurringCost) => c.amount / BILLING_MONTHS[c.billing];
export const isCostActive = (c: RecurringCost, today: string) => !c.endDate || c.endDate > today;

/** First renewal date on or after `ref`, stepping from the anchor in whole terms (no month-end drift). */
export function nextRenewal(c: { renewal: string; termMonths: number }, ref: string): string {
  const at = (k: number) => addMonths(c.renewal, k * c.termMonths);
  let k = 0;
  if (at(0) < ref) while (at(k) < ref) k++;
  else while (at(k - 1) >= ref) k--;
  return at(k);
}

/** Last day the cancellation must arrive so the contract ends before `renewal`. */
export const cancelBy = (renewal: string, noticeMonths: number) => addDays(addMonths(renewal, -noticeMonths), -1);

export type Urgency = "crit" | "warn" | "ok" | "muted";

export type CostStatus =
  | { kind: "ended"; endDate: string }
  | { kind: "cancelled"; endDate: string; days: number }
  /** Cannot be cancelled (e.g. Serafe levy) */
  | { kind: "mandatory"; renewal: string | null }
  /** Month to month without notice */
  | { kind: "flex"; renewal: string | null }
  /** Open-ended, cancellable with notice at any time (rent, child care) */
  | { kind: "ongoing"; noticeMonths: number; renewal: string | null }
  | { kind: "term"; renewal: string; deadline: string; days: number; missed: boolean; runsUntil: string; urgency: Urgency };

export function costStatus(c: RecurringCost, today: string): CostStatus {
  if (c.endDate && c.endDate <= today) return { kind: "ended", endDate: c.endDate };
  if (c.endDate) return { kind: "cancelled", endDate: c.endDate, days: daysBetween(today, c.endDate) };
  const renewal = c.renewal ? nextRenewal({ renewal: c.renewal, termMonths: c.termMonths }, today) : null;
  if (c.noticeMonths === null) return { kind: "mandatory", renewal };
  if (!renewal || c.termMonths === 1)
    return c.noticeMonths > 0 ? { kind: "ongoing", noticeMonths: c.noticeMonths, renewal } : { kind: "flex", renewal };
  let deadline = cancelBy(renewal, c.noticeMonths);
  let missed = false;
  // If this term's deadline has passed, the contract runs one more term
  let runsUntil = addDays(renewal, -1);
  if (deadline < today) {
    missed = true;
    const following = nextRenewal({ renewal: c.renewal!, termMonths: c.termMonths }, addDays(renewal, 1));
    deadline = cancelBy(following, c.noticeMonths);
    runsUntil = addDays(following, -1);
  }
  const days = daysBetween(today, deadline);
  const urgency: Urgency = days <= 7 ? "crit" : days <= 30 ? "warn" : "ok";
  return { kind: "term", renewal, deadline, days, missed, runsUntil, urgency };
}

export interface CostEvent {
  date: string;
  cost: RecurringCost;
  what: "cancel" | "renews" | "ends";
  urgency: Urgency;
}

/** Cancellation deadlines, non-monthly charges and endings within the next `days` days. */
export function upcomingEvents(costs: RecurringCost[], today: string, days: number): CostEvent[] {
  const until = addDays(today, days);
  const events: CostEvent[] = [];
  for (const cost of costs) {
    const st = costStatus(cost, today);
    if (st.kind === "cancelled" && st.endDate <= until) events.push({ date: st.endDate, cost, what: "ends", urgency: "muted" });
    if (st.kind === "term" && st.deadline <= until) events.push({ date: st.deadline, cost, what: "cancel", urgency: st.urgency });
    if ("renewal" in st && st.renewal && cost.billing !== "monthly" && st.renewal <= until)
      events.push({ date: st.renewal, cost, what: "renews", urgency: "muted" });
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface CostSummary {
  /** Rappen per month, all active costs */
  monthly: number;
  count: number;
  byKind: Record<CostKind, number>;
  /** Per person; shared costs are split evenly */
  byPerson: Record<string, number>;
  byCategory: Map<Category, number>;
}

export function costSummary(costs: RecurringCost[], personIds: string[], today: string): CostSummary {
  const sum: CostSummary = { monthly: 0, count: 0, byKind: { fixed: 0, subscription: 0 }, byPerson: Object.fromEntries(personIds.map((id) => [id, 0])), byCategory: new Map() };
  for (const c of costs) {
    if (!isCostActive(c, today)) continue;
    const m = monthlyCost(c);
    sum.monthly += m;
    sum.count++;
    sum.byKind[c.kind] += m;
    sum.byCategory.set(c.category, (sum.byCategory.get(c.category) ?? 0) + m);
    for (const pid of c.owners) if (pid in sum.byPerson) sum.byPerson[pid] += m / c.owners.length;
  }
  return sum;
}
