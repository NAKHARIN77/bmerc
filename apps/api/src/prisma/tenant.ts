import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Returns a client whose every query runs in a transaction with app.company_id set,
 * so PostgreSQL Row-Level Security only exposes that company's rows.
 * companyId must come from the verified JWT, never from request body or query.
 */
export function forTenant(prisma: PrismaClient, companyId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.company_id', ${companyId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Several writes in one transaction, all under the same company's RLS context. */
export function withTenantTx<T>(prisma: PrismaClient, companyId: string, fn: (tx: TenantTx) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, TRUE)`;
    return fn(tx);
  });
}

/** Read-only cross-company view for platform admins. Every use must be written to the audit log. */
export function forPlatformAdmin(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.platform_admin', 'on', TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}
