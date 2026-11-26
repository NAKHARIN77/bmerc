import type { CreditWeights, WorkType } from "@bmerc/shared";
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
  /** The user's team and its site (technicians, head technicians). */
  team: { name: string; site: string } | null;
  /** Sites linked to the user (site managers, stock keepers). */
  siteNames: string[];
  /** Credits per work type under the company's plan. */
  creditWeights: CreditWeights | null;
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
  partsStocked: number;
}

export interface Team {
  id: string;
  name: string;
  siteId: string;
  headUserId: string | null;
  site: { name: string };
  members: Array<{ id: string; fullName: string; role: Role | null; isActive: boolean; jobsOpen: number; jobsDone: number }>;
  jobsOpen: number;
  jobsDone: number;
}

export interface Usage {
  plan: { code: string; name: string } | null;
  users: { used: number; limit: number | null };
  sites: { used: number; limit: number | null };
  creditsThisMonth: { used: number; limit: number | null };
  /** Credits per work type, fixed when the plan was bought. */
  creditWeights: CreditWeights;
}

export interface JobRow {
  id: string;
  number: string;
  status: JobStatus;
  priority: JobPriority;
  workType: WorkType;
  /** Credits taken when the job passed QC (0 before). */
  creditsCharged: number;
  reportedFault: string | null;
  workNote: string | null;
  receivedAt: string;
  updatedAt: string;
  device: { id: string; kind: DeviceKind; model: string; serialNo: string; qrCode: string | null };
  customer: { id: string; name: string };
  site: { id: string; name: string };
  assignee: { id: string; fullName: string } | null;
  qcPassedAt: string | null;
  tests: Array<{ passed: boolean; testedOn: string; workDone: string | null }>;
  qrPrintLogs: Array<{ printedAt: string }>;
}

export type TestItem = "hb1" | "hb2" | "hb3" | "ctrl" | "psu" | "fan";
export type TestValue = "pass" | "fail" | "not_tested";

export interface JobDetail extends Omit<JobRow, "tests" | "qrPrintLogs"> {
  unrepairableReason: string | null;
  qcPassedAt: string | null;
  dispatchedAt: string | null;
  device: JobRow["device"] & { hashrateTh: string | number | null; qrCode: string | null; minerModel: MinerModel | null };
  customer: { id: string; name: string; contactName: string | null; email: string | null; phone: string | null };
  events: Array<{ id: string; fromStatus: JobStatus | null; toStatus: JobStatus; actorId: string | null; by: string | null; note: string | null; createdAt: string }>;
  can: { assign: boolean; work: boolean; dispatch: boolean; parts: boolean; requestParts: boolean; bill: boolean };
  invoice: { id: string; number: string; status: "unpaid" | "partial" | "paid" | "void"; currency: string; totalCents: number; paidCents: number } | null;
  tests: Array<{ id: string; testedOn: string; testedBy: string | null; workDone: string | null; results: Record<TestItem, TestValue>; passed: boolean; createdAt: string }>;
  qrPrintLogs: Array<{ id: string; by: string | null; copies: number; printedAt: string }>;
  parts: Array<{ id: string; qty: number; part: { id: string; name: string; sku: string; unit: string } }>;
  components: Array<{ id: string; component: string; serialNo: string | null; replacementSerialNo: string | null; workDone: string | null; result: "repaired" | "replaced" | "unchanged" }>;
}

export interface JobSummary {
  total: number;
  open: number;
  byStatus: Record<JobStatus, number>;
}

export interface CustomerSummary {
  customers: number;
  devicesIn: number;
  openJobs: number;
  countries: string[];
}

export interface CustomerRow {
  id: string;
  name: string;
  country: string | null;
  /** Only for admins and site managers. */
  email?: string | null;
  /** Only for admins and site managers. */
  phone?: string | null;
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
  /** Miner models it fits; empty = any model. */
  modelIds: string[];
  unit: string;
  minQty: number;
  isActive: boolean;
  totalQty: number;
  belowMin: boolean;
}

export interface PartDetail extends Omit<PartRow, "totalQty" | "belowMin"> {
  stock: Array<{ site: { id: string; name: string }; qty: number; belowMin: boolean }>;
  movements: Array<{ id: string; type: "in" | "out" | "adjust"; qty: number; reason: string | null; createdAt: string; by: string | null; site: { name: string }; job: { id: string; number: string } | null }>;
}

export interface Assignee {
  id: string;
  fullName: string;
  role: Role | null;
  teamId: string | null;
  team: string | null;
  /** Jobs this technician holds that have not reached QC. */
  openJobs: number;
}

export interface Technician {
  id: string;
  fullName: string;
  role: Role | null;
  team: { id: string; name: string };
  site: { id: string; name: string };
  openJobs: number;
  atQc: number;
}

export type StockLevel = "ok" | "low" | "out";

export interface StockRow {
  qty: number;
  level: StockLevel;
  site: { id: string; name: string };
  part: { id: string; name: string; sku: string; unit: string; minQty: number; category: string | null; modelIds: string[] };
}

export interface StockPage extends Page<StockRow> {
  counts: { skus: number; low: number; out: number };
}

export type ComponentResult = "repaired" | "replaced" | "unchanged";

export interface DeviceMatch {
  id: string;
  kind: DeviceKind;
  model: string;
  serialNo: string;
  qrCode: string | null;
  customer: { id: string; name: string };
  matchedBoard: string | null;
  jobs: Array<{
    id: string;
    number: string;
    status: JobStatus;
    receivedAt: string;
    reportedFault: string | null;
    parts: Array<{ qty: number; part: { name: string } }>;
    invoice: { totalCents: number; paidCents: number; currency: string; status: "unpaid" | "partial" | "paid" | "void" } | null;
  }>;
}

export interface DeviceHistory extends Omit<DeviceMatch, "matchedBoard" | "jobs"> {
  hashrateTh: string | number | null;
  createdAt: string;
  jobs: Array<{
    id: string;
    number: string;
    status: JobStatus;
    reportedFault: string | null;
    workNote: string | null;
    unrepairableReason: string | null;
    receivedAt: string;
    qcPassedAt: string | null;
    dispatchedAt: string | null;
    site: { name: string };
    assignee: { fullName: string } | null;
    components: Array<{ id: string; component: string; serialNo: string | null; replacementSerialNo: string | null; workDone: string | null; result: ComponentResult }>;
    parts: Array<{ id: string; qty: number; part: { name: string; sku: string } }>;
  }>;
}

/** A customer who sent devices to one site, with what they sent there (GET /sites/:id/customers). */
export interface SiteCustomer {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  devices: number;
  openJobs: number;
  lastReceivedAt: string;
  jobs: Array<{
    id: string;
    number: string;
    status: JobStatus;
    reportedFault: string | null;
    receivedAt: string;
    dispatchedAt: string | null;
    device: { id: string; kind: DeviceKind; model: string; serialNo: string; qrCode: string | null };
  }>;
}

/** Repair invoice from the company to its customer (GET /job-invoices/:id). */
export interface RepairInvoice {
  id: string;
  number: string;
  currency: string;
  taxRateBps: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  status: "unpaid" | "partial" | "paid" | "void";
  issuedAt: string;
  dueAt: string | null;
  note: string | null;
  lines: Array<{ id: string; kind: "labor" | "part" | "other"; description: string; qty: number; unitPriceCents: number; amountCents: number; jobPartId: string | null }>;
  payments: Array<{ id: string; method: "bank_transfer" | "cash" | "other"; amountCents: number; paidAt: string; reference: string | null; status: string }>;
  job: {
    id: string;
    number: string;
    status: JobStatus;
    site: { name: string; address: string | null };
    device: { model: string; serialNo: string };
    customer: { name: string; contactName: string | null; email: string | null; phone: string | null };
  };
  company: { name: string; legalName: string | null; taxId: string | null; billingAddress: string | null };
}

/** A miner model with its hashboards and chips (platform reference list). */
export interface MinerModel {
  id: string;
  brand: string;
  name: string;
  hashboards: number;
  chipModel: string | null;
  chipsPerBoard: number | null;
  /** Number from the list endpoints; the job detail sends the database decimal as a string. */
  hashrateTh: number | string | null;
  notes: string | null;
  sourceUrl: string | null;
  /** The platform owner checked the numbers. */
  verified: boolean;
  isActive: boolean;
  /** Company list only: true for a model this company added itself (the rest is the shared BMERC list). */
  own?: boolean;
}

/** A technician's request for parts, decided by the stock keeper or a lead. */
export interface PartRequest {
  id: string;
  qty: number;
  note: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  part: { id: string; name: string; sku: string; unit: string };
  job: { id: string; number: string; status: JobStatus; assigneeId: string | null; device: { model: string } };
  site: { id: string; name: string };
  requestedBy: string | null;
  decidedBy: string | null;
  /** Now in stock at the job's site. */
  inStock: number;
  canDecide: boolean;
  canCancel: boolean;
}
