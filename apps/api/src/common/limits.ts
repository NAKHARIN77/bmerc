import type { PrismaClient } from '../generated/prisma/client.js';
import { withTenantTx } from '../prisma/tenant.js';
import { conflict } from './http.js';

export interface Limits {
  plan: { code: string; name: string } | null;
  maxUsers: number | null; // null = no limit
  maxSites: number | null;
  maxJobsPerMonth: number | null;
}

type Override = Partial<Record<'maxUsers' | 'maxSites' | 'maxJobsPerMonth', number | null>>;

/** Plan limits with the platform owner's per-company overrides ("Edit limits") applied. */
export async function limitsFor(prisma: PrismaClient, companyId: string): Promise<Limits> {
  const sub = await prisma.subscription.findUnique({ where: { companyId }, include: { plan: true } });
  if (!sub) return { plan: null, maxUsers: null, maxSites: null, maxJobsPerMonth: null };
  const o = (sub.overrideLimits ?? {}) as Override;
  const pick = (k: keyof Override) => (k in o ? (o[k] ?? null) : sub.plan[k]);
  return {
    plan: { code: sub.plan.code, name: sub.plan.name },
    maxUsers: pick('maxUsers'),
    maxSites: pick('maxSites'),
    maxJobsPerMonth: pick('maxJobsPerMonth'),
  };
}

/** First day of the current month (UTC). Jobs are counted from here for the monthly quota. */
export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

export async function usageFor(prisma: PrismaClient, companyId: string) {
  const users = await prisma.user.count({ where: { companyId, isActive: true } });
  const [sites, jobsThisMonth] = await withTenantTx(prisma, companyId, async (tx) => [
    await tx.site.count({ where: { status: { not: 'inactive' } } }),
    await tx.job.count({ where: { receivedAt: { gte: monthStart() } } }),
  ] as const);
  return { users, sites, jobsThisMonth };
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
