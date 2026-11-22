import type { Role } from "@bmerc/shared";

export interface Me {
  id: string;
  email: string;
  fullName: string;
  role: Role | null;
  isPlatformAdmin: boolean;
  companyId: string | null;
  teamId: string | null;
  siteIds: string[] | null;
  company: {
    id: string;
    name: string;
    status: "active" | "suspended" | "closed";
    subscription: { status: string; plan: { code: string; name: string } } | null;
  } | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role | null;
  teamId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  status: "active" | "invited";
  team: { id: string; name: string; siteId: string } | null;
  siteIds: string[];
}

export interface Site {
  id: string;
  name: string;
  country: string | null;
  province: string | null;
  address: string | null;
  status: "setup" | "active" | "inactive";
  teams: Array<{ id: string; name: string; headUserId: string | null }>;
}

export interface Team {
  id: string;
  name: string;
  siteId: string;
  headUserId: string | null;
  site: { name: string };
  members: Array<{ id: string; fullName: string; role: Role | null; isActive: boolean }>;
}

export interface Usage {
  plan: { code: string; name: string } | null;
  users: { used: number; limit: number | null };
  sites: { used: number; limit: number | null };
  jobsThisMonth: { used: number; limit: number | null };
}
