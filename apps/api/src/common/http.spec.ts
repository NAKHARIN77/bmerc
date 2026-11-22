import { z } from 'zod';
import { parse } from './http.js';

const fieldErrors = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return Object.fromEntries(((e as { getResponse(): { details: Array<{ path: string[]; message: string }> } }).getResponse().details).map((d) => [d.path[0], d.message]));
  }
  throw new Error('expected a validation error');
};

describe('parse field errors', () => {
  it('uses plain English', () => {
    const S = z.object({ name: z.string().min(2), email: z.email(), qty: z.number().int().min(0), code: z.string().max(3), sku: z.string().min(1) });
    expect(fieldErrors(() => parse(S, { name: 'a', email: 'x', qty: -1, code: 'abcd', sku: '' }))).toEqual({
      name: 'At least 2 characters',
      email: 'Enter a valid email address',
      qty: 'Must be 0 or more',
      code: 'At most 3 characters',
      sku: 'Required',
    });
    expect(fieldErrors(() => parse(S, {})).name).toBe('Required');
  });

  it('keeps messages written in the schema', () => {
    expect(fieldErrors(() => parse(z.object({ a: z.string().min(8, 'At least 8 characters long') }), { a: 'x' })).a).toBe('At least 8 characters long');
  });
});
