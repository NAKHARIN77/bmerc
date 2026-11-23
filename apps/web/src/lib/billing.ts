// Company plan billing (/billing/* in the API).

export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  maxJobsPerMonth: number | null;
  maxSites: number | null;
  maxUsers: number | null;
  features: string[];
}

export interface BillingSubscription {
  company: {
    name: string;
    legalName: string | null;
    taxId: string | null;
    billingEmail: string | null;
    billingAddress: string | null;
    country: string | null;
    status: "active" | "suspended" | "closed";
    subscription: { status: string; currentPeriodStart: string; currentPeriodEnd: string; plan: { id: string; code: string; name: string; priceCents: number } } | null;
  };
  vatBps: number;
  plans: BillingPlan[];
  usage: Record<"jobsThisMonth" | "sites" | "users", { used: number; limit: number | null }>;
}

export interface BillingInvoice {
  id: string;
  number: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  status: "open" | "paid" | "void";
  overdue: boolean;
  reported: boolean;
  dueAt: string;
  paidAt: string | null;
  paymentRef: string | null;
  createdAt: string;
  plan: { id: string; name: string } | null;
  company?: { name: string; legalName: string | null; taxId: string | null; billingEmail: string | null; billingAddress: string | null };
}

export const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export const vatText = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;
