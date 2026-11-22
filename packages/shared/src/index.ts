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
  todo: 'Pending',
  in_repair: 'In repair',
  waiting_parts: 'Waiting',
  unrepairable: 'Cannot repair',
  qc_passed: 'Done',
  dispatched: 'Returned',
};

export const DEVICE_KINDS = ['miner', 'hashboard', 'control_board', 'psu', 'other'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const DEVICE_KIND_LABEL: Record<DeviceKind, string> = {
  miner: 'Whole miner',
  hashboard: 'Hashboard',
  control_board: 'Control board',
  psu: 'PSU',
  other: 'Other',
};

export const JOB_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

export const SITE_STATUSES = ['setup', 'active', 'inactive'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];
export const SITE_STATUS_LABEL: Record<SiteStatus, string> = { setup: 'Setup', active: 'Active', inactive: 'Inactive' };

export { COUNTRIES } from './countries';
import { COUNTRIES } from './countries';

let countryList: { code: string; name: string }[] | null = null;

/** Every country, sorted by English name. A fixed list, so server and browser render the same names. */
export function countries(): { code: string; name: string }[] {
  countryList ??= COUNTRIES.map(([code, name]) => ({ code, name }));
  return countryList;
}

export const isCountry = (code: string) => COUNTRIES.some(([c]) => c === code);
export const isCurrency = (code: string) => Intl.supportedValuesOf('currency').includes(code);

/** Plan prices are one USD price for every country (decided 2026-11-23). */
export const PLAN_CURRENCY = 'USD';

/** Suggested repair-invoice currency for a new company; the admin can change it in Company settings. */
const LOCAL_CURRENCY: Record<string, string> = {
  TH: 'THB', VN: 'VND', MY: 'MYR', SG: 'SGD', ID: 'IDR', PH: 'PHP', LA: 'LAK', KH: 'KHR', MM: 'MMK',
  CN: 'CNY', HK: 'HKD', TW: 'TWD', JP: 'JPY', KR: 'KRW', IN: 'INR', AU: 'AUD', GB: 'GBP', US: 'USD',
  CA: 'CAD', RU: 'RUB', KZ: 'KZT', AE: 'AED',
};
export const defaultCurrency = (country: string | null | undefined) => (country && LOCAL_CURRENCY[country]) || 'USD';

/** Tax rates are stored in basis points: 700 = 7%. */
export const fmtTaxRate = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;
