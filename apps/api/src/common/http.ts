import { HttpException, HttpStatus } from '@nestjs/common';
import type { ZodType } from 'zod';

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
