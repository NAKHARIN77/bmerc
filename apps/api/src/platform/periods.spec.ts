import { periods } from './platform.controller.js';

describe('revenue periods', () => {
  const now = new Date('2026-11-23T10:00:00Z'); // a Monday

  it('last 7 days end today', () => {
    const p = periods('day', now);
    expect(p).toHaveLength(7);
    expect(p[6].from.toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(p[6].label).toBe('23 Nov (today)');
    expect(p[0].from.toISOString()).toBe('2026-11-17T00:00:00.000Z');
  });

  it('last 4 weeks start on Monday', () => {
    const p = periods('week', now);
    expect(p).toHaveLength(4);
    expect(p[3].from.toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(p[0].from.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(p[0].label).toBe('2 Nov to 8 Nov');
  });

  it('last 3 months are whole calendar months', () => {
    const p = periods('month', now);
    expect(p.map((x) => x.from.toISOString().slice(0, 10))).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(p[2].to.toISOString().slice(0, 10)).toBe('2026-12-01');
    expect(p[2].label).toBe('Nov 2026 (this month)');
  });
});
