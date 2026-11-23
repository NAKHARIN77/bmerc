// Types and helpers for the platform owner console (/platform/* in the API).

export interface PlatformCompany {
  id: string;
  name: string;
  country: string | null;
  status: "active" | "suspended" | "closed";
  billingEmail: string | null;
  createdAt: string;
  plan: { code: string; name: string; priceCents: number } | null;
  subscriptionStatus: string | null;
  hasOverride: boolean;
  payment: "Overdue" | "Due" | "Paid" | "Trial" | "No invoice";
  limits: { jobsPerMonth: number | null; sites: number | null; users: number | null };
  usage: { jobsThisMonth: number; sites: number; users: number };
  sites: number;
  jobs: { open: number; waitingParts: number; cannotRepair: number; atQc: number };
  lowStock: number;
}

export interface PlatformOverview {
  currency: string;
  collectedThisMonthCents: number;
  outstandingCents: number;
  pendingPayments: number;
  companies: Partial<Record<"active" | "suspended" | "closed", number>>;
  jobs: { byStatus: Partial<Record<string, number>>; open: number };
  lowStock: number;
  revenue: Array<{ month: string; collectedCents: number }>;
}

export interface PlatformCompanyDetail {
  id: string;
  name: string;
  legalName: string | null;
  country: string | null;
  status: "active" | "suspended" | "closed";
  billingEmail: string | null;
  createdAt: string;
  subscription: {
    status: string;
    overrideLimits: Partial<Record<"maxJobsPerMonth" | "maxSites" | "maxUsers", number | null>> | null;
    currentPeriodEnd: string;
    plan: { id: string; code: string; name: string; priceCents: number; maxJobsPerMonth: number | null; maxSites: number | null; maxUsers: number | null };
  } | null;
  limits: { jobsPerMonth: number | null; sites: number | null; users: number | null };
  usage: { users: number; sites: number; jobsThisMonth: number };
  sites: Array<{ id: string; name: string; country: string | null; province: string | null; status: string; teams: number; technicians: number; openJobs: number }>;
}

export interface PlatformPlan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  maxJobsPerMonth: number | null;
  maxSites: number | null;
  maxUsers: number | null;
  features: string[];
  companies: number;
}

export interface PlatformInvoice {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  taxCents: number;
  totalCents: number;
  taxRateBps: number;
  currency: string;
  status: "open" | "paid" | "void";
  /** Open and past its due date (decided by the API clock). */
  overdue: boolean;
  dueAt: string;
  paidAt: string | null;
  paymentRef: string | null;
  createdAt: string;
  company: { id: string; name: string };
  plan: string | null;
}

export interface PlatformAuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  createdAt: string;
  company: { id: string; name: string } | null;
  actor: { id: string; fullName: string; email: string } | null;
}

export const usd = (cents: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export const limitText = (used: number, limit: number | null) => `${used} / ${limit === null ? "no limit" : limit}`;
