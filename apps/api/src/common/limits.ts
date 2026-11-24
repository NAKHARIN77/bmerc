import { DEFAULT_CREDIT_WEIGHTS, WORK_TYPES, type CreditWeights } from './credits.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { withTenantTx } from '../prisma/tenant.js';
import { conflict } from './http.js';

export interface Limits {
  plan: { code: string; name: string } | null;
  maxUsers: number | null; // null = no limit
  maxSites: number | null;
  /** Credits per month (null = no limit). Each job uses credits by its work type when it passes QC. */
  maxJobsPerMonth: number | null;
  creditWeights: CreditWeights;
}

/** Weights from stored JSON; anything missing or invalid falls back to the defaults. */
export function weightsOf(json: unknown): CreditWeights {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  return Object.fromEntries(
    WORK_TYPES.map((t) => [t, Number.isInteger(o[t]) && (o[t] as number) >= 0 ? (o[t] as number) : DEFAULT_CREDIT_WEIGHTS[t]]),
  ) as CreditWeights;
}

type Override = Partial<Record<'maxUsers' | 'maxSites' | 'maxJobsPerMonth', number | null>>;

/** Plan limits with the platform owner's per-company overrides ("Edit limits") applied. */
export async function limitsFor(prisma: PrismaClient, companyId: string): Promise<Limits> {
  const sub = await prisma.subscription.findUnique({ where: { companyId }, include: { plan: true } });
  if (!sub) return { plan: null, maxUsers: null, maxSites: null, maxJobsPerMonth: null, creditWeights: DEFAULT_CREDIT_WEIGHTS };
  const o = (sub.overrideLimits ?? {}) as Override;
  const pick = (k: keyof Override) => (k in o ? (o[k] ?? null) : sub.plan[k]);
  return {
    plan: { code: sub.plan.code, name: sub.plan.name },
    maxUsers: pick('maxUsers'),
    maxSites: pick('maxSites'),
    maxJobsPerMonth: pick('maxJobsPerMonth'),
    // Fixed when the plan was bought (subscription copy); the plan's own weights only for older rows.
    creditWeights: weightsOf(sub.creditWeights ?? sub.plan.creditWeights),
  };
}

/** First day of the current month (UTC). Credits are counted from here for the monthly quota. */
export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export async function usageFor(prisma: PrismaClient, companyId: string) {
  const users = await prisma.user.count({ where: { companyId, isActive: true } });
  const [sites, creditsThisMonth] = await withTenantTx(prisma, companyId, async (tx) => [
    await tx.site.count({ where: { status: { not: 'inactive' } } }),
    (await tx.job.aggregate({ where: { chargedAt: { gte: monthStart() } }, _sum: { creditsCharged: true } }))._sum.creditsCharged ?? 0,
  ] as const);
  return { users, sites, creditsThisMonth };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function assertSeat(prisma: PrismaClient, companyId: string) {
  const { maxUsers } = await limitsFor(prisma, companyId);
  if (maxUsers === null) return;
  const used = await prisma.user.count({ where: { companyId, isActive: true } });
  if (used >= maxUsers) {
    throw conflict('QUOTA_USERS', `Your plan allows ${plural(maxUsers, 'active user')}. Upgrade the plan or deactivate someone first`, { limit: maxUsers, used });
  }
}

/** Sites in setup or active count toward the plan; inactive sites do not. */
export async function assertSiteSlot(prisma: PrismaClient, companyId: string) {
  const { maxSites } = await limitsFor(prisma, companyId);
  if (maxSites === null) return;
  const { sites } = await usageFor(prisma, companyId);
  if (sites >= maxSites) {
    throw conflict('QUOTA_SITES', `Your plan allows ${plural(maxSites, 'site')}. Upgrade the plan or set another site to inactive first`, { limit: maxSites, used: sites });
  }
}
