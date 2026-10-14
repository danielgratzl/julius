import { describe, expect, it } from "vitest";
import { cancelBy, costStatus, costSummary, createLedger, nextRenewal, upcomingEvents } from "./calc";
import { addMonths } from "./dates";
import { parseChf } from "./money";
import type { Account, AppData, RecurringCost } from "./types";

const persons = [
  { id: "p1", name: "Me", color: "#000", sortOrder: 0 },
  { id: "p2", name: "Partner", color: "#111", sortOrder: 1 },
  { id: "p3", name: "Kid", color: "#222", sortOrder: 2 },
];
const acc = (id: string, type: Account["type"], owners: string[], closedAt: string | null = null): Account => ({
  id, name: id, institution: "", type, pensionKind: type === "pension" ? "pillar3a" : null, owners, notes: "", closedAt,
});
const data = (accounts: Account[], snaps: [string, string, number][]): AppData => ({
  persons,
  accounts,
  snapshots: snaps.map(([accountId, date, balance], i) => ({ id: String(i), accountId, date, balance })),
  costs: [],
  settings: { staleDays: 31 },
});

describe("net worth", () => {
  const d = data(
    [acc("bank", "bank", ["p1"]), acc("joint", "bank", ["p1", "p2", "p3"]), acc("3a", "pension", ["p2"]), acc("old", "bank", ["p1"], "2025-06-01")],
    [
      ["bank", "2025-01-31", 1000_00],
      ["bank", "2025-03-15", 2000_00],
      ["joint", "2025-02-01", 300_00],
      ["3a", "2025-01-10", 5000_00],
      ["old", "2025-01-01", 700_00],
    ],
  );
  const l = createLedger(d, "2025-12-31");

  it("carries the last balance forward and is 0 before the first one", () => {
    expect(l.valueAt(d.accounts[0], "2025-01-30")).toBe(0);
    expect(l.valueAt(d.accounts[0], "2025-01-31")).toBe(1000_00);
    expect(l.valueAt(d.accounts[0], "2025-03-14")).toBe(1000_00);
    expect(l.valueAt(d.accounts[0], "2025-12-31")).toBe(2000_00);
  });

  it("counts closed accounts as 0 from the closing date", () => {
    expect(l.valueAt(d.accounts[3], "2025-05-31")).toBe(700_00);
    expect(l.valueAt(d.accounts[3], "2025-06-01")).toBe(0);
  });

  it("splits shared accounts evenly and separates pension from liquid", () => {
    const w = l.worthAt("2025-12-31");
    expect(w.total).toBe(2000_00 + 300_00 + 5000_00);
    expect(w.liquid).toBe(2300_00);
    expect(w.pension).toBe(5000_00);
    expect(w.byPerson.p1.total).toBe(2000_00 + 100_00);
    expect(w.byPerson.p2.total).toBe(100_00 + 5000_00);
    expect(w.byPerson.p2.pension).toBe(5000_00);
    expect(w.byPerson.p3.liquid).toBe(100_00);
  });

  it("builds a month-end series ending today", () => {
    const s = l.series();
    expect(s[0].date).toBe("2025-01-31");
    expect(s.at(-1)!.date).toBe("2025-12-31");
    expect(s.map((p) => p.date)).toContain("2025-02-28");
  });
});

describe("staleness", () => {
  const d = data([acc("a", "bank", ["p1"]), acc("b", "bank", ["p1"]), acc("never", "bank", ["p1"]), acc("closed", "bank", ["p1"], "2025-01-01")], [
    ["a", "2025-09-30", 1],
    ["b", "2025-09-29", 1],
  ]);
  const l = createLedger(d, "2025-10-31");
  it("flags accounts older than 31 days", () => {
    expect(l.isStale(d.accounts[0])).toBe(false); // 31 days
    expect(l.isStale(d.accounts[1])).toBe(true); // 32 days
  });
  it("flags accounts without balances but not closed ones", () => {
    expect(l.isStale(d.accounts[2])).toBe(true);
    expect(l.isStale(d.accounts[3])).toBe(false);
  });
});

describe("recurring costs", () => {
  const sub = (o: Partial<RecurringCost>): RecurringCost => ({
    id: "s", name: "s", provider: "", kind: "subscription", category: "insurance", owners: ["p1"], amount: 120_00, billing: "yearly",
    termMonths: 12, renewal: "2026-01-01", noticeMonths: 3, endDate: null, notes: "", ...o,
  });

  it("steps renewals from the anchor without month-end drift", () => {
    const s = { renewal: "2026-01-31", termMonths: 1 };
    expect(nextRenewal(s, "2026-02-01")).toBe("2026-02-28");
    expect(nextRenewal(s, "2026-03-01")).toBe("2026-03-31");
    expect(nextRenewal(s, "2025-11-15")).toBe("2025-11-30");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("computes the cancellation deadline from the notice period", () => {
    expect(cancelBy("2027-01-01", 3)).toBe("2026-09-30");
    expect(cancelBy("2027-01-01", 1)).toBe("2026-11-30");
  });

  it("rolls to the next term when the deadline was missed", () => {
    const st = costStatus(sub({ renewal: "2027-01-01" }), "2026-10-13");
    expect(st.kind).toBe("term");
    if (st.kind !== "term") return;
    expect(st.missed).toBe(true);
    expect(st.deadline).toBe("2027-09-30");
    expect(st.runsUntil).toBe("2027-12-31");
  });

  it("rates urgency by days to the deadline", () => {
    const st = costStatus(sub({ renewal: "2027-01-01", noticeMonths: 1 }), "2026-11-10");
    expect(st.kind === "term" && st.urgency).toBe("warn");
    const st2 = costStatus(sub({ renewal: "2027-01-01", noticeMonths: 1 }), "2026-11-25");
    expect(st2.kind === "term" && st2.urgency).toBe("crit");
  });

  it("handles cancelled, ended, mandatory and monthly subscriptions", () => {
    expect(costStatus(sub({ endDate: "2026-12-31" }), "2026-10-13").kind).toBe("cancelled");
    expect(costStatus(sub({ endDate: "2026-10-13" }), "2026-10-13").kind).toBe("ended");
    expect(costStatus(sub({ noticeMonths: null }), "2026-10-13").kind).toBe("mandatory");
    expect(costStatus(sub({ termMonths: 1, noticeMonths: 0 }), "2026-10-13").kind).toBe("flex");
  });

  it("treats open-ended costs with notice as ongoing, not 'cancel any time'", () => {
    const rent = sub({ kind: "fixed", category: "housing", billing: "monthly", termMonths: 1, renewal: null, noticeMonths: 3 });
    expect(costStatus(rent, "2026-10-13")).toEqual({ kind: "ongoing", noticeMonths: 3, renewal: null });
    const kita = sub({ kind: "fixed", termMonths: 1, renewal: "2026-11-01", noticeMonths: 1 });
    expect(costStatus(kita, "2026-10-13").kind).toBe("ongoing");
    expect(costStatus(sub({ termMonths: 1, renewal: null, noticeMonths: 0 }), "2026-10-13").kind).toBe("flex");
    expect(upcomingEvents([rent], "2026-10-13", 365)).toEqual([]);
  });

  it("lists upcoming deadlines and summarises costs by kind and person", () => {
    const subs = [
      sub({ id: "a", noticeMonths: 1, renewal: "2027-01-01" }),
      sub({ id: "b", owners: ["p1", "p2"], billing: "monthly", amount: 20_00 }),
      sub({ id: "rent", kind: "fixed", category: "housing", owners: ["p1", "p2"], billing: "monthly", amount: 2000_00, renewal: null, termMonths: 1 }),
      sub({ id: "old", billing: "monthly", amount: 99_00, endDate: "2026-01-01" }),
    ];
    const ev = upcomingEvents(subs, "2026-11-01", 61);
    expect(ev.map((e) => [e.cost.id, e.what])).toEqual([["a", "cancel"], ["a", "renews"]]);
    const s = costSummary(subs, ["p1", "p2"], "2026-11-01");
    expect(s.count).toBe(3);
    expect(s.monthly).toBe(10_00 + 20_00 + 2000_00);
    expect(s.byKind).toEqual({ fixed: 2000_00, subscription: 30_00 });
    expect(s.byPerson.p1).toBe(10_00 + 10_00 + 1000_00);
    expect(s.byPerson.p2).toBe(10_00 + 1000_00);
    expect(s.byCategory.get("housing")).toBe(2000_00);
  });
});

describe("money parsing", () => {
  it("accepts Swiss formats", () => {
    expect(parseChf("12'345.50")).toBe(1234550);
    expect(parseChf("12’345")).toBe(1234500);
    expect(parseChf("CHF 80,5")).toBe(8050);
    expect(Number.isNaN(parseChf("abc"))).toBe(true);
  });
});
