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

// ISO 3166-1 alpha-2 codes that Intl names but that are not countries (EU, UN, pseudo-regions).
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'QO', 'UN', 'XA', 'XB', 'ZZ']);
let countryList: { code: string; name: string }[] | null = null;

/** Every country Intl can name, sorted by English name. Built once, from the runtime's ICU data. */
export function countries(): { code: string; name: string }[] {
  if (countryList) return countryList;
  const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const list: { code: string; name: string }[] = [];
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(65 + i, 65 + j);
      const name = names.of(code);
      if (name && !NOT_COUNTRIES.has(code)) list.push({ code, name });
    }
  }
  countryList = list.sort((a, b) => a.name.localeCompare(b.name));
  return countryList;
}

export const isCountry = (code: string) => countries().some((c) => c.code === code);
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
