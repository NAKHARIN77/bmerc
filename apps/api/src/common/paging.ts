import { z } from 'zod';

/** ?page=&limit= shared by every list endpoint (design doc section 8). */
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const pageArgs = (p: { page: number; limit: number }) => ({ skip: (p.page - 1) * p.limit, take: p.limit });

export const paged = <T>(items: T[], total: number, p: { page: number; limit: number }) => ({
  items,
  page: p.page,
  limit: p.limit,
  total,
});

export const uuid = z.uuid();
