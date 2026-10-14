export const ACCOUNT_TYPES = ["bank", "investment", "pension"] as const;
export const PENSION_KINDS = ["pillar2", "pillar3a", "vested_benefits"] as const;
export const BILLINGS = ["monthly", "quarterly", "semiannual", "yearly"] as const;
export const COST_KINDS = ["fixed", "subscription"] as const;
export const CATEGORIES = [
  "housing", "childcare", "utilities", "loans", "taxes",
  "insurance", "news", "streaming", "software", "telecom", "mobility", "fees", "membership", "other",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type PensionKind = (typeof PENSION_KINDS)[number];
export type Billing = (typeof BILLINGS)[number];
export type Category = (typeof CATEGORIES)[number];
export type CostKind = (typeof COST_KINDS)[number];

export interface Person {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: AccountType;
  pensionKind: PensionKind | null;
  owners: string[];
  notes: string;
  /** ISO date; value counts as 0 from this date on */
  closedAt: string | null;
}

/** Balances are integer Rappen (CHF cents). */
export interface Snapshot {
  id: string;
  accountId: string;
  date: string;
  balance: number;
}

/** Anything paid regularly: fixed costs (rent, child care) and subscriptions / contracts. */
export interface RecurringCost {
  id: string;
  name: string;
  provider: string;
  kind: CostKind;
  category: Category;
  owners: string[];
  /** Rappen per billing period */
  amount: number;
  billing: Billing;
  /** Contract term in months; renews automatically after each term */
  termMonths: number;
  /** A known renewal date (first day of a term); null = ongoing without a fixed term */
  renewal: string | null;
  /** Notice period in months; null = cannot be cancelled */
  noticeMonths: number | null;
  /** Set once cancelled: last day the cost runs */
  endDate: string | null;
  notes: string;
}

export interface Settings {
  staleDays: number;
}

export interface AppData {
  persons: Person[];
  accounts: Account[];
  snapshots: Snapshot[];
  costs: RecurringCost[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { staleDays: 31 };

export const TYPE_LABEL: Record<AccountType, string> = { bank: "Bank account", investment: "Investment account", pension: "Pension account" };
export const TYPE_PLURAL: Record<AccountType, string> = { bank: "Bank accounts", investment: "Investments", pension: "Pension" };
export const PENSION_LABEL: Record<PensionKind, string> = {
  pillar2: "2nd pillar (BVG pension fund)",
  pillar3a: "Pillar 3a",
  vested_benefits: "Vested benefits (Freizügigkeit)",
};
export const KIND_LABEL: Record<CostKind, string> = { fixed: "Fixed cost", subscription: "Subscription" };
export const KIND_PLURAL: Record<CostKind, string> = { fixed: "Fixed costs", subscription: "Subscriptions" };

export const CATEGORY_LABEL: Record<Category, string> = {
  housing: "Housing",
  childcare: "Child care",
  utilities: "Energy & utilities",
  loans: "Loans & leasing",
  taxes: "Taxes",
  insurance: "Insurance",
  news: "News & media",
  streaming: "Streaming",
  software: "Software & apps",
  telecom: "Telecom",
  mobility: "Mobility",
  fees: "Fees & levies",
  membership: "Membership",
  other: "Other",
};
/** Kind preset when a category is chosen; can still be changed per entry. */
export const CATEGORY_DEFAULT_KIND: Record<Category, CostKind> = {
  housing: "fixed", childcare: "fixed", utilities: "fixed", loans: "fixed", taxes: "fixed", fees: "fixed",
  insurance: "subscription", news: "subscription", streaming: "subscription", software: "subscription",
  telecom: "subscription", mobility: "subscription", membership: "subscription", other: "subscription",
};

export const BILLING_MONTHS: Record<Billing, number> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
export const BILLING_LABEL: Record<Billing, string> = { monthly: "month", quarterly: "quarter", semiannual: "half-year", yearly: "year" };
