import { canSeeSite, jobScope, resolveSiteIds, siteScope } from './scope.js';
import type { AuthUser } from './auth-user.js';

const user = (over: Partial<AuthUser>): AuthUser => ({
  id: 'u1', companyId: 'c1', role: 'technician', isPlatformAdmin: false, teamId: 't1', siteIds: ['s1'],
  fullName: 'Test', email: 't@x.test', ...over,
});

describe('resolveSiteIds', () => {
  it('gives company admins the whole company', () => {
    expect(resolveSiteIds('company_admin', null, [])).toBeNull();
  });

  it('gives site managers and stock keepers exactly their linked sites', () => {
    expect(resolveSiteIds('site_manager', null, ['s1', 's2'])).toEqual(['s1', 's2']);
    expect(resolveSiteIds('site_manager', null, [])).toEqual([]);
    expect(resolveSiteIds('stock_keeper', 's9', ['s2'])).toEqual(['s2']);
  });

  it("gives technicians their team's site, or nothing without a team", () => {
    expect(resolveSiteIds('technician', 's1', [])).toEqual(['s1']);
    expect(resolveSiteIds('head_technician', null, [])).toEqual([]);
  });

  it('gives accounts with no role nothing', () => {
    expect(resolveSiteIds(null, 's1', ['s2'])).toEqual([]);
  });
});

describe('jobScope', () => {
  it('adds no filter for company-wide roles', () => {
    expect(jobScope(user({ role: 'company_admin', siteIds: null }))).toEqual({});
  });

  it('limits site managers and stock keepers to their sites', () => {
    expect(jobScope(user({ role: 'site_manager', teamId: null, siteIds: ['s1', 's2'] }))).toEqual({ siteId: { in: ['s1', 's2'] } });
    expect(jobScope(user({ role: 'stock_keeper', teamId: null, siteIds: ['s2'] }))).toEqual({ siteId: { in: ['s2'] } });
  });

  it('limits technicians to unassigned or teammate jobs at their site', () => {
    expect(jobScope(user({}))).toEqual({
      siteId: { in: ['s1'] },
      OR: [{ assigneeId: null }, { assignee: { teamId: 't1' } }],
    });
  });

  it('matches nothing for a technician without a team', () => {
    expect(jobScope(user({ teamId: null, siteIds: [] }))).toEqual({ id: { in: [] } });
  });
});

describe('siteScope / canSeeSite', () => {
  it('filters by site list unless the user sees everything', () => {
    expect(siteScope(user({ siteIds: null }))).toEqual({});
    expect(siteScope(user({ siteIds: ['s1'] }))).toEqual({ id: { in: ['s1'] } });
    expect(canSeeSite(user({ siteIds: null }), 'any')).toBe(true);
    expect(canSeeSite(user({ siteIds: ['s1'] }), 's2')).toBe(false);
  });
});
