import type { Role } from '../generated/prisma/enums.js';

export interface AuthUser {
  id: string;
  companyId: string | null;
  role: Role | null;
  isPlatformAdmin: boolean;
  teamId: string | null;
  /** Sites this user may see. null = every site in the company. [] = none. See scope.ts. */
  siteIds: string[] | null;
  fullName: string;
  email: string;
}

export const COMPANY_ROLES: Role[] = ['company_admin', 'site_manager', 'head_technician', 'technician', 'stock_keeper'];
