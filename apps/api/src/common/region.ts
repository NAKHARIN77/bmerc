// Country, currency and tax helpers. The web app has the same lists in @bmerc/shared;
// the API keeps its own copy because it runs compiled JS and cannot import that package's TS source.

// Same rules as packages/shared/src/countries.ts: no EU/UN groupings, pseudo-regions or ICU-only areas.
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'QO', 'UN', 'XA', 'XB', 'ZZ', 'AC', 'CP', 'CQ', 'DG', 'EA', 'IC', 'TA']);
const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const currencies = new Set(Intl.supportedValuesOf('currency'));

/** ISO 3166-1 alpha-2 country code that Intl can name. */
/** Retired codes such as BU (Burma) canonicalise to their replacement, so they fail this check. */
const isCurrentCode = (code: string) => {
  try {
    return Intl.getCanonicalLocales(`und-${code}`)[0] === `und-${code}`;
  } catch {
    return false;
  }
};
export const isCountry = (code: string) =>
  /^[A-Z]{2}$/.test(code) && !NOT_COUNTRIES.has(code) && !!regionNames.of(code) && isCurrentCode(code);
/** ISO 4217 currency code. */
export const isCurrency = (code: string) => currencies.has(code);

const LOCAL_CURRENCY: Record<string, string> = {
  TH: 'THB', VN: 'VND', MY: 'MYR', SG: 'SGD', ID: 'IDR', PH: 'PHP', LA: 'LAK', KH: 'KHR', MM: 'MMK',
  CN: 'CNY', HK: 'HKD', TW: 'TWD', JP: 'JPY', KR: 'KRW', IN: 'INR', AU: 'AUD', GB: 'GBP', US: 'USD',
  CA: 'CAD', RU: 'RUB', KZ: 'KZT', AE: 'AED',
};
/** Suggested repair-invoice currency for a new company; the admin can change it later. */
export const defaultCurrency = (country: string | null | undefined) => (country && LOCAL_CURRENCY[country]) || 'USD';

/**
 * VAT the platform adds to plan invoices, by the customer company's country, in basis points (700 = 7%).
 * Plan prices exclude VAT and are one USD price everywhere (decided 2026-11-23).
 * Countries not listed get 0% (export of services). Rates still need sign-off from the accountant.
 */
const PLAN_VAT_BPS: Record<string, number> = { TH: 700 };
export const planVatBps = (country: string | null | undefined) => (country ? (PLAN_VAT_BPS[country] ?? 0) : 0);

/** Tax on an amount in minor units, rounded half up. */
export const taxOn = (amountCents: number, bps: number) => Math.round((amountCents * bps) / 10_000);
