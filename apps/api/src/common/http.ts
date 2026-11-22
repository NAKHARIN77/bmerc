import { HttpException, HttpStatus } from '@nestjs/common';
import { z, type ZodType } from 'zod';

// Plain-English field errors for the web forms (zod's defaults read like "Too small: expected string to have >=2 characters").
// A message given in a schema still wins over these.
z.config({
  customError: (issue) => {
    const n = Number('minimum' in issue ? issue.minimum : 'maximum' in issue ? issue.maximum : 0);
    if (issue.code === 'too_small' && issue.origin === 'string') return n <= 1 ? 'Required' : `At least ${n} characters`;
    if (issue.code === 'too_big' && issue.origin === 'string') return `At most ${n} characters`;
    if (issue.code === 'too_small' && issue.origin === 'number') return `Must be ${n} or more`;
    if (issue.code === 'too_big' && issue.origin === 'number') return `Must be ${n} or less`;
    if (issue.code === 'invalid_format' && issue.format === 'email') return 'Enter a valid email address';
    if (issue.code === 'invalid_type' && issue.input === undefined) return 'Required';
    return undefined; // keep zod's message
  },
});

/** Shared error shape: { code, message, details } (design doc section 8). */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    super({ code, message, details }, status);
  }
}

export const notFound = (what: string) => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
export const forbidden = (message = 'You do not have permission to do this') =>
  new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
export const conflict = (code: string, message: string, details?: unknown) =>
  new ApiError(HttpStatus.CONFLICT, code, message, details);

/** Validate a request body/query with zod; 400 with field errors on failure. */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Some fields are invalid', r.error.issues);
  }
  return r.data;
}
