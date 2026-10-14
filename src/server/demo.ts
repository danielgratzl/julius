import { addDays, addMonths, firstOfMonth } from "../shared/dates";
import { CATEGORY_DEFAULT_KIND, type Account, type AppData, type RecurringCost, type Snapshot } from "../shared/types";

/** Example household: two persons, ~3 years of monthly balances, some of them stale. */
export function demoData(today: string): AppData {
  const persons = [
    { id: crypto.randomUUID(), name: "Me", color: "#3b7dd8", sortOrder: 0 },
    { id: crypto.randomUUID(), name: "Partner", color: "#d9822b", sortOrder: 1 },
  ];
  const [me, partner] = persons.map((p) => p.id);
  const both = [me, partner];
  const hash = (s: string) => [...s].reduce((x, c) => (x * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
  const noise = (seed: string, k: number) => (k === 0 ? 0 : Math.sin((hash(seed) % 97) + k * 1.7) * 0.6 + Math.sin(k * 0.53 + (hash(seed) % 13)) * 0.4);

  const accounts: Account[] = [];
  const snapshots: Snapshot[] = [];
  const add = (
    name: string, institution: string, type: Account["type"], owners: string[],
    current: number, drift: number, vol: number, lastAgo: number,
    opt: { pk?: Account["pensionKind"]; months?: number; closedAgo?: number; notes?: string } = {},
  ) => {
    const id = crypto.randomUUID();
    accounts.push({ id, name, institution, type, pensionKind: opt.pk ?? null, owners, notes: opt.notes ?? "", closedAt: opt.closedAgo ? addDays(today, -opt.closedAgo) : null });
    // Histories share a common start (~34 months back) unless the account was opened later
    const last = addDays(today, -lastAgo);
    const start = addMonths(today, -34);
    for (let k = 0; k <= (opt.months ?? 60) && addMonths(last, -k) >= start; k++) {
      const balance = Math.max(0, Math.round((current - drift * k + vol * noise(name + institution, k)) * 100));
      snapshots.push({ id: crypto.randomUUID(), accountId: id, date: addMonths(last, -k), balance });
    }
  };
  add("Private account", "Raiffeisen", "bank", [me], 8420.35, 40, 1800, 9);
  add("Private account", "PostFinance", "bank", [partner], 6150.8, 30, 1400, 9);
  add("Household account", "Zürcher Kantonalbank", "bank", both, 4870.1, 0, 2200, 9, { notes: "Rent, groceries, utilities" });
  add("Savings account", "Zürcher Kantonalbank", "bank", both, 38500, 600, 300, 9);
  add("ETF portfolio", "Swissquote", "investment", [me], 61240, 1350, 3500, 12);
  add("Fund savings plan", "PostFinance", "investment", [partner], 18930, 450, 900, 44);
  add("Pillar 3a", "VIAC", "pension", [me], 34880, 640, 1200, 12, { pk: "pillar3a" });
  add("Pillar 3a", "frankly", "pension", [partner], 21760, 600, 800, 12, { pk: "pillar3a" });
  add("Pension fund", "Employer pension fund", "pension", [me], 148300, 1450, 0, 13, { pk: "pillar2" });
  add("Pension fund", "Employer pension fund", "pension", [partner], 97650, 1050, 0, 105, { pk: "pillar2" });
  add("Vested benefits account", "Freizügigkeitsstiftung", "pension", [partner], 18420, 25, 0, 290, { pk: "vested_benefits", months: 24 });
  add("Youth savings account", "UBS", "bank", [partner], 3200, 20, 100, 500, { months: 16, closedAgo: 480 });

  const jan1 = `${Number(today.slice(0, 4)) + 1}-01-01`;
  const fom = firstOfMonth(today);
  const cost = (
    name: string, provider: string, category: RecurringCost["category"], owners: string[], chf: number,
    billing: RecurringCost["billing"], termMonths: number, renewal: string | null, noticeMonths: number | null, endDate: string | null = null,
  ): RecurringCost => ({
    id: crypto.randomUUID(), name, provider, kind: CATEGORY_DEFAULT_KIND[category], category, owners,
    amount: Math.round(chf * 100), billing, termMonths, renewal, noticeMonths, endDate, notes: "",
  });
  const costs = [
    cost("Rent", "Landlord", "housing", both, 2450, "monthly", 1, null, 3),
    cost("Ancillary costs (Nebenkosten)", "Landlord", "housing", both, 220, "monthly", 1, null, 3),
    cost("Child care (Kita)", "Kita Sonnenschein", "childcare", both, 1850, "monthly", 1, null, 1),
    cost("Electricity", "EKZ", "utilities", both, 180, "quarterly", 1, null, null),
    cost("Tax instalments", "Canton of Zurich", "taxes", both, 1100, "monthly", 1, null, null),
    cost("Health insurance, basic (KVG)", "CSS", "insurance", [me], 412.3, "monthly", 12, jan1, 1),
    cost("Health insurance, basic (KVG)", "Helsana", "insurance", [partner], 398.9, "monthly", 12, jan1, 1),
    cost("Supplementary insurance (VVG)", "CSS", "insurance", [me], 64.2, "monthly", 12, jan1, 3),
    cost("Household contents & liability", "Die Mobiliar", "insurance", both, 486, "yearly", 12, addMonths(fom, 5), 3),
    cost("Car insurance", "AXA", "insurance", both, 1124, "yearly", 12, jan1, 3),
    cost("Radio & TV levy", "Serafe", "fees", both, 335, "yearly", 12, jan1, null),
    cost("NZZ Digital", "NZZ", "news", [me], 29, "monthly", 12, addDays(today, 95), 1),
    cost("Netflix Standard", "Netflix", "streaming", both, 18.9, "monthly", 1, addDays(today, 8), 0),
    cost("Spotify Duo", "Spotify", "streaming", both, 19.95, "monthly", 1, addDays(today, 15), 0),
    cost("Half Fare travelcard", "SBB", "mobility", [partner], 190, "yearly", 12, addDays(today, 22), 0),
    cost("iCloud+ 200 GB", "Apple", "software", [me], 3, "monthly", 1, addDays(today, 3), 0),
    cost("1Password Families", "1Password", "software", both, 60, "yearly", 12, addDays(today, 210), 0),
    cost("Mobile plan", "Salt", "telecom", [me], 39.9, "monthly", 12, addDays(today, 170), 2),
    cost("Gym membership", "Update Fitness", "membership", [partner], 890, "yearly", 12, addMonths(fom, 2), 1),
    cost("Disney+", "Disney", "streaming", both, 12.9, "monthly", 1, addDays(today, -90), 0, addDays(today, -90)),
  ];
  return { persons, accounts, snapshots, costs, settings: { staleDays: 31 } };
}
