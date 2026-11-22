// Types and constants shared by api and web. Keep in sync with apps/api/prisma/schema.prisma.
export const JOB_STATUSES = ['todo', 'in_repair', 'waiting_parts', 'unrepairable', 'qc_passed', 'dispatched'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ROLES = ['company_admin', 'site_manager', 'head_technician', 'technician', 'stock_keeper'] as const;
export type Role = (typeof ROLES)[number];

/** Roles linked to one or more sites (user_sites). */
export const SITE_ROLES: readonly Role[] = ['site_manager', 'stock_keeper'];
/** Roles that belong to a team; they see their team's site. */
export const TEAM_ROLES: readonly Role[] = ['head_technician', 'technician'];

export const ROLE_LABEL: Record<Role, string> = {
  company_admin: 'Company Admin',
  site_manager: 'Site Manager',
  head_technician: 'Head Technician',
  technician: 'Technician',
  stock_keeper: 'Stock Keeper',
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  todo: 'To do',
  in_repair: 'In repair',
  waiting_parts: 'Waiting for parts',
  unrepairable: 'Cannot repair',
  qc_passed: 'Passed QC',
  dispatched: 'Returned',
};

export const DEVICE_KINDS = ['miner', 'hashboard', 'control_board', 'psu', 'other'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
