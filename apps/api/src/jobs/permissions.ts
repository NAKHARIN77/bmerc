import type { AuthUser } from '../auth/auth-user.js';
import { canSeeSite } from '../auth/scope.js';
import type { JobStatus } from '../generated/prisma/enums.js';

// Who may do what to a job (design doc section 4). The caller has already loaded the job
// through jobScope, so "own site" and "own team" visibility is checked before these run.

export interface JobRef {
  status: JobStatus;
  assigneeId: string | null;
  siteId: string;
}

/** Open a job (receive a device) at a site. */
export const canReceive = (me: AuthUser, siteId: string) =>
  (me.role === 'company_admin' || me.role === 'site_manager' || me.role === 'head_technician') && canSeeSite(me, siteId);

/** Assign or reassign. Head technicians may only pick from their own team (checked against the assignee). */
export const canAssign = (me: AuthUser, job: JobRef) =>
  job.status !== 'dispatched' && (me.role === 'company_admin' || me.role === 'site_manager' || me.role === 'head_technician');

/** Change status and write the repair note. A technician works only on jobs they hold, or picks up an unassigned one. */
export function canWork(me: AuthUser, job: JobRef) {
  if (job.status === 'dispatched') return false;
  if (me.role === 'company_admin' || me.role === 'site_manager' || me.role === 'head_technician') return true;
  if (me.role === 'technician') return job.assigneeId === me.id || (job.assigneeId === null && job.status === 'todo');
  return false;
}

/** Return the device to the customer: staff who face customers, not bench technicians. */
export const canDispatch = (me: AuthUser, job: JobRef) =>
  (job.status === 'qc_passed' || job.status === 'unrepairable') &&
  (me.role === 'company_admin' || me.role === 'site_manager' || me.role === 'head_technician');

/**
 * Take parts from stock into the job, or return them. Technicians ask for parts instead (part requests,
 * decided 2026-11-24): the stock keeper or a lead approves and the parts go on the job then.
 */
export function canUseParts(me: AuthUser, job: JobRef) {
  if (job.status === 'dispatched') return false;
  if (me.role === 'stock_keeper') return canSeeSite(me, job.siteId);
  return me.role === 'company_admin' || me.role === 'site_manager' || me.role === 'head_technician';
}

/** Ask the stock keeper for parts (whoever may work on the job, while it is open). */
export const canRequestParts = (me: AuthUser, job: JobRef) => ['todo', 'in_repair', 'waiting_parts'].includes(job.status) && canWork(me, job);

/** Flags for the job page so it only shows buttons that will work. */
export const allowedActions = (me: AuthUser, job: JobRef) => ({
  assign: canAssign(me, job),
  work: canWork(me, job),
  dispatch: canDispatch(me, job),
  parts: canUseParts(me, job),
  requestParts: canRequestParts(me, job),
});
