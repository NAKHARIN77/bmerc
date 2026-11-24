import type { WorkType } from '../generated/prisma/enums.js';

// Credits (decided 2026-11-24). Keep in sync with packages/shared (WORK_TYPES, DEFAULT_CREDIT_WEIGHTS).
export const WORK_TYPES = ['inspection', 'chip_replacement', 'board_repair'] as const satisfies readonly WorkType[];
export type CreditWeights = Record<WorkType, number>;
/** Default weights for new plans. A company keeps the weights of the plan it bought. */
export const DEFAULT_CREDIT_WEIGHTS: CreditWeights = { inspection: 1, chip_replacement: 3, board_repair: 5 };
/** The same device repaired again within this many days counts as one job. */
export const REPEAT_DAYS = 7;

/**
 * Credits a job uses when it passes QC. A repeat repair of the same device within REPEAT_DAYS counts as one
 * job at the highest weight: it only pays the difference over what that device already paid in the window.
 */
export const creditsFor = (weight: number, alreadyPaidInWindow: number) => Math.max(0, weight - alreadyPaidInWindow);
