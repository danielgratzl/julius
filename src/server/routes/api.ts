import { eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { db } from "../db";
import * as t from "../db/schema";
import { loadAll, replaceAll, setAccountOwners, setCostOwners, upsertSnapshot } from "../repo";
import * as v from "../validation";

const api = new Hono();

async function body<S extends z.ZodType>(c: { req: { json: () => Promise<unknown> } }, schema: S, upgrade = (raw: unknown) => raw): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: "Invalid JSON" });
  });
  const r = schema.safeParse(upgrade(raw));
  if (!r.success) throw new HTTPException(400, { message: r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") });
  return r.data;
}

function assertPersons(ids: string[]) {
  const found = db.select({ id: t.persons.id }).from(t.persons).where(inArray(t.persons.id, ids)).all();
  if (found.length !== new Set(ids).size) throw new HTTPException(400, { message: "Unknown person" });
}

function notFound(): never {
  throw new HTTPException(404, { message: "Not found" });
}

api.get("/health", (c) => c.json({ ok: true }));
api.get("/data", (c) => c.json(loadAll()));

/* persons */
api.post("/persons", async (c) => {
  const input = await body(c, v.personInput);
  const { max } = db.select({ max: sql<number>`coalesce(max(sort_order), -1)` }).from(t.persons).get()!;
  const id = crypto.randomUUID();
  db.insert(t.persons).values({ id, ...input, sortOrder: max + 1 }).run();
  return c.json({ id }, 201);
});
api.patch("/persons/:id", async (c) => {
  const input = await body(c, v.personInput.partial());
  const r = db.update(t.persons).set(input).where(eq(t.persons.id, c.req.param("id"))).run();
  if (!r.changes) notFound();
  return c.json({ ok: true });
});
api.delete("/persons/:id", (c) => {
  const id = c.req.param("id");
  const used =
    db.select().from(t.accountOwners).where(eq(t.accountOwners.personId, id)).get() ||
    db.select().from(t.costOwners).where(eq(t.costOwners.personId, id)).get();
  if (used) throw new HTTPException(409, { message: "This person still owns accounts or recurring costs" });
  db.delete(t.persons).where(eq(t.persons.id, id)).run();
  return c.json({ ok: true });
});

/* accounts */
api.post("/accounts", async (c) => {
  const { owners, initialBalance, initialDate, ...a } = await body(c, v.newAccountInput);
  assertPersons(owners);
  const id = crypto.randomUUID();
  db.transaction((tx) => {
    tx.insert(t.accounts).values({ id, ...a, pensionKind: a.type === "pension" ? a.pensionKind ?? "pillar3a" : null }).run();
    setAccountOwners(tx, id, owners);
    if (initialBalance !== undefined && initialDate) upsertSnapshot(tx, id, initialDate, initialBalance);
  });
  return c.json({ id }, 201);
});
api.patch("/accounts/:id", async (c) => {
  const id = c.req.param("id");
  const { owners, ...a } = await body(c, v.accountInput.partial());
  if (!db.select().from(t.accounts).where(eq(t.accounts.id, id)).get()) notFound();
  if (owners) assertPersons(owners);
  if (a.type && a.type !== "pension") a.pensionKind = null;
  db.transaction((tx) => {
    if (Object.keys(a).length) tx.update(t.accounts).set(a).where(eq(t.accounts.id, id)).run();
    if (owners) setAccountOwners(tx, id, owners);
  });
  return c.json({ ok: true });
});
api.delete("/accounts/:id", (c) => {
  const r = db.delete(t.accounts).where(eq(t.accounts.id, c.req.param("id"))).run();
  if (!r.changes) notFound();
  return c.json({ ok: true });
});

/* balances */
api.put("/snapshots", async (c) => {
  const s = await body(c, v.snapshotInput);
  if (!db.select().from(t.accounts).where(eq(t.accounts.id, s.accountId)).get()) notFound();
  upsertSnapshot(db, s.accountId, s.date, s.balance);
  return c.json({ ok: true });
});
api.post("/snapshots/bulk", async (c) => {
  const { date, entries } = await body(c, v.bulkSnapshotInput);
  const ids = entries.map((e) => e.accountId);
  if (db.select({ id: t.accounts.id }).from(t.accounts).where(inArray(t.accounts.id, ids)).all().length !== new Set(ids).size) notFound();
  db.transaction((tx) => entries.forEach((e) => upsertSnapshot(tx, e.accountId, date, e.balance)));
  return c.json({ saved: entries.length });
});
api.delete("/snapshots/:id", (c) => {
  const r = db.delete(t.snapshots).where(eq(t.snapshots.id, c.req.param("id"))).run();
  if (!r.changes) notFound();
  return c.json({ ok: true });
});

/* recurring costs */
api.post("/costs", async (c) => {
  const { owners, ...cost } = await body(c, v.costInput);
  assertPersons(owners);
  const id = crypto.randomUUID();
  db.transaction((tx) => {
    tx.insert(t.recurringCosts).values({ id, ...cost }).run();
    setCostOwners(tx, id, owners);
  });
  return c.json({ id }, 201);
});
api.patch("/costs/:id", async (c) => {
  const id = c.req.param("id");
  const { owners, ...cost } = await body(c, v.costInput.partial());
  if (!db.select().from(t.recurringCosts).where(eq(t.recurringCosts.id, id)).get()) notFound();
  if (owners) assertPersons(owners);
  db.transaction((tx) => {
    if (Object.keys(cost).length) tx.update(t.recurringCosts).set(cost).where(eq(t.recurringCosts.id, id)).run();
    if (owners) setCostOwners(tx, id, owners);
  });
  return c.json({ ok: true });
});
api.delete("/costs/:id", (c) => {
  const r = db.delete(t.recurringCosts).where(eq(t.recurringCosts.id, c.req.param("id"))).run();
  if (!r.changes) notFound();
  return c.json({ ok: true });
});

/* settings */
api.patch("/settings", async (c) => {
  const s = await body(c, v.settingsInput);
  db.insert(t.settings)
    .values({ key: "staleDays", value: String(s.staleDays) })
    .onConflictDoUpdate({ target: t.settings.key, set: { value: String(s.staleDays) } })
    .run();
  return c.json({ ok: true });
});

/* backup & export */
api.get("/backup", (c) => {
  const stamp = new Date().toISOString().slice(0, 10);
  c.header("Content-Disposition", `attachment; filename="julius-backup-${stamp}.json"`);
  return c.json({ version: 2, exportedAt: new Date().toISOString(), ...loadAll() });
});
api.post("/backup", async (c) => {
  const data = await body(c, v.backupInput, v.upgradeBackup);
  const personIds = new Set(data.persons.map((p) => p.id));
  const accountIds = new Set(data.accounts.map((a) => a.id));
  const badOwner = [...data.accounts, ...data.costs].some((x) => x.owners.some((o) => !personIds.has(o)));
  if (badOwner || data.snapshots.some((s) => !accountIds.has(s.accountId)))
    throw new HTTPException(400, { message: "Backup references unknown persons or accounts" });
  replaceAll(data);
  return c.json({ ok: true });
});
api.get("/export/balances.csv", (c) => {
  const rows = db
    .select({ date: t.snapshots.date, account: t.accounts.name, institution: t.accounts.institution, type: t.accounts.type, balance: t.snapshots.balance })
    .from(t.snapshots)
    .innerJoin(t.accounts, eq(t.accounts.id, t.snapshots.accountId))
    .orderBy(t.snapshots.date)
    .all();
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = ["date,account,institution,type,balance_chf", ...rows.map((r) => [r.date, q(r.account), q(r.institution), r.type, (r.balance / 100).toFixed(2)].join(","))].join("\n");
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="julius-balances.csv"`);
  return c.body(csv);
});

export default api;
