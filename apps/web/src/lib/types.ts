import type { DeviceKind, JobPriority, JobStatus, Role } from "@bmerc/shared";

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

export interface JobRow {
  id: string;
  number: string;
  status: JobStatus;
  priority: JobPriority;
  reportedFault: string | null;
  receivedAt: string;
  updatedAt: string;
  device: { id: string; kind: DeviceKind; model: string; serialNo: string };
  customer: { id: string; name: string };
  site: { id: string; name: string };
  assignee: { id: string; fullName: string } | null;
}

export interface JobDetail extends JobRow {
  workNote: string | null;
  unrepairableReason: string | null;
  qcPassedAt: string | null;
  dispatchedAt: string | null;
  device: JobRow["device"] & { hashrateTh: string | number | null; qrCode: string | null };
  customer: { id: string; name: string; contactName: string | null; email: string | null; phone: string | null };
  events: Array<{ id: string; fromStatus: JobStatus | null; toStatus: JobStatus; actorId: string | null; note: string | null; createdAt: string }>;
}

export interface CustomerRow {
  id: string;
  name: string;
  country: string | null;
  devices: number;
  openJobs: number;
}

export interface CustomerDetail {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  createdAt: string;
  devices: Array<{ id: string; kind: DeviceKind; model: string; serialNo: string; qrCode: string | null }>;
}

export interface PartRow {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  minQty: number;
  isActive: boolean;
  totalQty: number;
  belowMin: boolean;
}

export interface PartDetail extends Omit<PartRow, "totalQty" | "belowMin"> {
  stock: Array<{ site: { id: string; name: string }; qty: number; belowMin: boolean }>;
}
