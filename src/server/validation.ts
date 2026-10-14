import { z } from "zod";
import { isIsoDate } from "../shared/dates";
import { ACCOUNT_TYPES, BILLINGS, CATEGORIES, COST_KINDS, PENSION_KINDS } from "../shared/types";

const date = z.string().refine(isIsoDate, "Expected a date like 2026-10-13");
const rappen = z.number().int();
const owners = z.array(z.string().min(1)).min(1, "Pick at least one owner");

export const personInput = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const accountInput = z.object({
  name: z.string().trim().min(1).max(100),
  institution: z.string().trim().max(100).default(""),
  type: z.enum(ACCOUNT_TYPES),
  pensionKind: z.enum(PENSION_KINDS).nullable().default(null),
  owners,
  notes: z.string().max(500).default(""),
  closedAt: date.nullable().default(null),
});

export const newAccountInput = accountInput.extend({
  initialBalance: rappen.optional(),
  initialDate: date.optional(),
});

export const snapshotInput = z.object({ accountId: z.string(), date, balance: rappen });

export const bulkSnapshotInput = z.object({
  date,
  entries: z.array(z.object({ accountId: z.string(), balance: rappen })).min(1),
});

export const costInput = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.string().trim().max(100).default(""),
  kind: z.enum(COST_KINDS),
  category: z.enum(CATEGORIES),
  owners,
  amount: rappen.nonnegative(),
  billing: z.enum(BILLINGS),
  termMonths: z.number().int().min(1).max(120),
  renewal: date.nullable(),
  noticeMonths: z.number().int().min(0).max(24).nullable(),
  endDate: date.nullable().default(null),
  notes: z.string().max(500).default(""),
});

export const settingsInput = z.object({ staleDays: z.number().int().min(1).max(365) });

export const backupInput = z.object({
  persons: z.array(personInput.extend({ id: z.string(), sortOrder: z.number().int() })),
  accounts: z.array(accountInput.extend({ id: z.string() })),
  snapshots: z.array(snapshotInput.extend({ id: z.string() })),
  costs: z.array(costInput.extend({ id: z.string() })),
  settings: settingsInput,
});

/** Version-1 backups called recurring costs "subscriptions" and had no kind. */
export function upgradeBackup(raw: unknown): unknown {
  if (raw && typeof raw === "object" && "subscriptions" in raw && !("costs" in raw)) {
    const { subscriptions, ...rest } = raw as { subscriptions: unknown };
    return { ...rest, costs: Array.isArray(subscriptions) ? subscriptions.map((s) => ({ kind: "subscription", ...s })) : subscriptions };
  }
  return raw;
}
