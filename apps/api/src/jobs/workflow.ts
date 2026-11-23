import { randomInt } from 'node:crypto';
import type { JobStatus } from '../generated/prisma/enums.js';

/** Allowed status moves (design doc section 6). Anything else is a 409 and the board card snaps back. */
export const NEXT: Record<JobStatus, JobStatus[]> = {
  todo: ['in_repair'],
  in_repair: ['waiting_parts', 'qc_passed', 'unrepairable'],
  waiting_parts: ['in_repair'],
  unrepairable: ['dispatched'],
  qc_passed: ['dispatched'],
  dispatched: [],
};

export const canMove = (from: JobStatus, to: JobStatus) => NEXT[from].includes(to);

/** Closed jobs cannot be edited. */
export const isClosed = (s: JobStatus) => s === 'dispatched';

/** TK-2026-0113: year plus a per-company counter, at least 4 digits. */
export const jobNumber = (year: number, n: number) => `TK-${year}-${String(n).padStart(4, '0')}`;

// No 0/O or 1/I so a code read off a worn label is not mistyped.
const QR_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Random, unguessable device code such as BMERC-7K3QX9MD (never sequential). */
export function newQrCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += QR_ALPHABET[randomInt(QR_ALPHABET.length)];
  return `BMERC-${s}`;
}
