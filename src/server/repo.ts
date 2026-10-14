import { asc, eq } from "drizzle-orm";
import { DEFAULT_SETTINGS, type Account, type AppData, type RecurringCost, type Settings } from "../shared/types";
import { db } from "./db";
import * as t from "./db/schema";

const ownersBy = <K extends string>(rows: ({ personId: string } & Record<K, string>)[], key: K) => {
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r[key], [...(map.get(r[key]) ?? []), r.personId]);
  return map;
};

export function loadSettings(): Settings {
  const rows = db.select().from(t.settings).all();
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key === "staleDays") out.staleDays = Number(r.value);
  return out;
}

export function loadAll(): AppData {
  const accOwners = ownersBy(db.select().from(t.accountOwners).all(), "accountId");
  const costOwners = ownersBy(db.select().from(t.costOwners).all(), "costId");
  return {
    persons: db.select().from(t.persons).orderBy(asc(t.persons.sortOrder)).all(),
    accounts: db.select().from(t.accounts).all().map((a): Account => ({ ...a, owners: accOwners.get(a.id) ?? [] })),
    snapshots: db.select().from(t.snapshots).orderBy(asc(t.snapshots.date)).all(),
    costs: db
      .select()
      .from(t.recurringCosts)
      .all()
      .map((c): RecurringCost => ({ ...c, category: c.category as RecurringCost["category"], owners: costOwners.get(c.id) ?? [] })),
    settings: loadSettings(),
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function setAccountOwners(tx: Tx, accountId: string, owners: string[]) {
  tx.delete(t.accountOwners).where(eq(t.accountOwners.accountId, accountId)).run();
  tx.insert(t.accountOwners).values(owners.map((personId) => ({ accountId, personId }))).run();
}

export function setCostOwners(tx: Tx, costId: string, owners: string[]) {
  tx.delete(t.costOwners).where(eq(t.costOwners.costId, costId)).run();
  tx.insert(t.costOwners).values(owners.map((personId) => ({ costId, personId }))).run();
}

export function upsertSnapshot(tx: Tx | typeof db, accountId: string, date: string, balance: number) {
  tx.insert(t.snapshots)
    .values({ id: crypto.randomUUID(), accountId, date, balance })
    .onConflictDoUpdate({ target: [t.snapshots.accountId, t.snapshots.date], set: { balance } })
    .run();
}

/** Replaces the whole database content, e.g. when restoring a backup. */
export function replaceAll(data: AppData) {
  db.transaction((tx) => {
    tx.delete(t.accountOwners).run();
    tx.delete(t.costOwners).run();
    tx.delete(t.snapshots).run();
    tx.delete(t.accounts).run();
    tx.delete(t.recurringCosts).run();
    tx.delete(t.persons).run();
    tx.delete(t.settings).run();
    if (data.persons.length) tx.insert(t.persons).values(data.persons).run();
    for (const { owners, ...a } of data.accounts) {
      tx.insert(t.accounts).values(a).run();
      setAccountOwners(tx, a.id, owners);
    }
    for (let i = 0; i < data.snapshots.length; i += 500) tx.insert(t.snapshots).values(data.snapshots.slice(i, i + 500)).run();
    for (const { owners, ...c } of data.costs) {
      tx.insert(t.recurringCosts).values(c).run();
      setCostOwners(tx, c.id, owners);
    }
    tx.insert(t.settings).values({ key: "staleDays", value: String(data.settings.staleDays) }).run();
  });
}

