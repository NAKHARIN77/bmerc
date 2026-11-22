import { defaultCurrency, isCountry, isCurrency, planVatBps, taxOn } from './region.js';

describe('region helpers', () => {
  it('accepts real country codes only', () => {
    expect(isCountry('TH')).toBe(true);
    expect(isCountry('VN')).toBe(true);
    expect(isCountry('EU')).toBe(false);
    expect(isCountry('th')).toBe(false);
    expect(isCountry('QQ')).toBe(false);
  });

  it('accepts ISO currency codes', () => {
    expect(isCurrency('THB')).toBe(true);
    expect(isCurrency('XXX1')).toBe(false);
  });

  it('suggests a local currency, USD otherwise', () => {
    expect(defaultCurrency('MY')).toBe('MYR');
    expect(defaultCurrency('FR')).toBe('USD');
    expect(defaultCurrency(null)).toBe('USD');
  });

  it('adds Thai VAT to plan invoices for Thai companies only', () => {
    expect(planVatBps('TH')).toBe(700);
    expect(planVatBps('VN')).toBe(0);
    expect(taxOn(4900, 700)).toBe(343);
  });
});
