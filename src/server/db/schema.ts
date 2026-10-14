import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const persons = sqliteTable("persons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  institution: text("institution").notNull().default(""),
  type: text("type", { enum: ["bank", "investment", "pension"] }).notNull(),
  pensionKind: text("pension_kind", { enum: ["pillar2", "pillar3a", "vested_benefits"] }),
  notes: text("notes").notNull().default(""),
  closedAt: text("closed_at"),
});

export const accountOwners = sqliteTable(
  "account_owners",
  {
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    personId: text("person_id").notNull().references(() => persons.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.personId] })],
);

export const snapshots = sqliteTable(
  "balance_snapshots",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    /** Rappen */
    balance: integer("balance").notNull(),
  },
  (t) => [uniqueIndex("snapshots_account_date").on(t.accountId, t.date)],
);

// Recurring costs (fixed costs and subscriptions). The SQL tables keep their original
// "subscriptions" names: renaming them would need an interactive drizzle-kit migration
// and the names are never shown to users.
export const recurringCosts = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull().default(""),
  kind: text("kind", { enum: ["fixed", "subscription"] }).notNull().default("subscription"),
  category: text("category").notNull(),
  amount: integer("amount").notNull(),
  billing: text("billing", { enum: ["monthly", "quarterly", "semiannual", "yearly"] }).notNull(),
  termMonths: integer("term_months").notNull(),
  renewal: text("renewal"),
  noticeMonths: integer("notice_months"),
  endDate: text("end_date"),
  notes: text("notes").notNull().default(""),
});

export const costOwners = sqliteTable(
  "subscription_owners",
  {
    costId: text("subscription_id").notNull().references(() => recurringCosts.id, { onDelete: "cascade" }),
    personId: text("person_id").notNull().references(() => persons.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.costId, t.personId] })],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
