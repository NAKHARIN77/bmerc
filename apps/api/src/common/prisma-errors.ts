import { conflict } from './http.js';

/** Prisma P2002 (unique constraint) → 409 with our error shape; anything else is rethrown. */
export async function uniqueOr409<T>(op: Promise<T>, code: string, message: string): Promise<T> {
  try {
    return await op;
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') throw conflict(code, message);
    throw e;
  }
}
