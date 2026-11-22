// Types and constants shared by api and web.
export const JOB_STATUSES = ['todo', 'in_repair', 'waiting_parts', 'unrepairable', 'qc_passed', 'dispatched'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ROLES = ['company_admin', 'head_technician', 'technician', 'stock_keeper'] as const;
export type Role = (typeof ROLES)[number];
