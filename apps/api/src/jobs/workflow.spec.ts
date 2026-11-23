import { canMove, isClosed, jobNumber, newQrCode } from './workflow.js';

describe('job workflow', () => {
  it('follows the board order', () => {
    expect(canMove('todo', 'in_repair')).toBe(true);
    expect(canMove('in_repair', 'waiting_parts')).toBe(true);
    expect(canMove('waiting_parts', 'in_repair')).toBe(true);
    expect(canMove('in_repair', 'qc_passed')).toBe(true);
    expect(canMove('in_repair', 'unrepairable')).toBe(true);
    expect(canMove('qc_passed', 'dispatched')).toBe(true);
    expect(canMove('unrepairable', 'dispatched')).toBe(true);
  });

  it('refuses skipped or backward steps', () => {
    expect(canMove('todo', 'qc_passed')).toBe(false);
    expect(canMove('todo', 'dispatched')).toBe(false);
    expect(canMove('waiting_parts', 'qc_passed')).toBe(false);
    expect(canMove('qc_passed', 'in_repair')).toBe(false);
    expect(canMove('dispatched', 'todo')).toBe(false);
    expect(isClosed('dispatched')).toBe(true);
    expect(isClosed('qc_passed')).toBe(false);
  });

  it('numbers jobs per year', () => {
    expect(jobNumber(2026, 113)).toBe('TK-2026-0113');
    expect(jobNumber(2026, 12345)).toBe('TK-2026-12345');
  });

  it('makes random QR codes without look-alike characters', () => {
    const codes = new Set(Array.from({ length: 200 }, newQrCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^BMERC-[2-9A-HJ-NP-Z]{8}$/);
  });
});
