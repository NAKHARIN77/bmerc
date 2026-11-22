import type { Role } from '../generated/prisma/enums.js';

export interface AuthUser {
  id: string;
  companyId: string | null;
  role: Role | null;
  isPlatformAdmin: boolean;
  teamId: string | null;
  fullName: string;
  email: string;
}
