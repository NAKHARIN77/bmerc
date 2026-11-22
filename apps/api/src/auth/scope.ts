import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from './auth-user.js';

// Who sees what inside a company (design doc section 4). RLS already limits rows to the
// company; these filters narrow it further by role. Add them to every tenant query.
//
//   company_admin, stock_keeper   whole company
//   site_manager                  sites linked in site_managers
//   head_technician, technician   their team's site: unassigned jobs and jobs held by teammates

const NOTHING = { id: { in: [] as string[] } };

/** Sites the user may see, from role, team and site_managers. Computed once per request. */
export function resolveSiteIds(
  role: AuthUser['role'],
  teamSiteId: string | null | undefined,
  managedSiteIds: string[],
): string[] | null {
  switch (role) {
    case 'company_admin':
    case 'stock_keeper':
      return null;
    case 'site_manager':
      return managedSiteIds;
    case 'head_technician':
    case 'technician':
      return teamSiteId ? [teamSiteId] : [];
    default:
      return [];
  }
}

export function siteScope(user: AuthUser): Prisma.SiteWhereInput {
  return user.siteIds === null ? {} : { id: { in: user.siteIds } };
}

export function jobScope(user: AuthUser): Prisma.JobWhereInput {
  if (user.siteIds === null) return {};
  if (user.role === 'head_technician' || user.role === 'technician') {
    if (!user.teamId) return NOTHING;
    return { siteId: { in: user.siteIds }, OR: [{ assigneeId: null }, { assignee: { teamId: user.teamId } }] };
  }
  return { siteId: { in: user.siteIds } };
}

/** True when the user may see this site at all. */
export const canSeeSite = (user: AuthUser, siteId: string) => user.siteIds === null || user.siteIds.includes(siteId);
