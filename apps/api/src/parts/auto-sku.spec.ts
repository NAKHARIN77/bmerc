import { nextSkuNumber, skuPrefix } from './auto-sku.js';

describe('skuPrefix', () => {
  it('takes the first word of the category, upper case, without a plural s', () => {
    expect(skuPrefix('Chips')).toBe('CHIP');
    expect(skuPrefix('Fans')).toBe('FAN');
    expect(skuPrefix('PSU')).toBe('PSU');
    expect(skuPrefix('Thermal paste')).toBe('THERMAL');
    expect(skuPrefix('Hashboards')).toBe('HASHBOARD');
    expect(skuPrefix('Glass')).toBe('GLASS');
  });
  it('falls back to PART', () => {
    expect(skuPrefix(null)).toBe('PART');
    expect(skuPrefix('  ')).toBe('PART');
    expect(skuPrefix('ชิป')).toBe('PART');
  });
});

describe('nextSkuNumber', () => {
  it('counts on from the highest number with this prefix', () => {
    expect(nextSkuNumber('CHIP', [])).toBe(1);
    expect(nextSkuNumber('CHIP', ['CHIP-0001', 'CHIP-0007', 'CHIP-BM1398', 'CHIPX-0099', 'CHIP-12038'])).toBe(8);
  });
});
