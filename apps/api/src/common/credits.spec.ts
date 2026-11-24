import { creditsFor } from './credits.js';
import { weightsOf } from './limits.js';

describe('credits', () => {
  it('charges the full weight the first time', () => {
    expect(creditsFor(5, 0)).toBe(5);
  });
  it('a repeat within the window pays only up to the highest weight', () => {
    expect(creditsFor(5, 1)).toBe(4); // inspection then board repair = 5 in total
    expect(creditsFor(1, 5)).toBe(0); // board repair then inspection = still 5
    expect(creditsFor(3, 3)).toBe(0);
  });
  it('reads stored weights and falls back to the defaults', () => {
    expect(weightsOf({ inspection: 2, chip_replacement: 4, board_repair: 6 })).toEqual({ inspection: 2, chip_replacement: 4, board_repair: 6 });
    expect(weightsOf({ inspection: -1, board_repair: 'x' })).toEqual({ inspection: 1, chip_replacement: 3, board_repair: 5 });
    expect(weightsOf(null)).toEqual({ inspection: 1, chip_replacement: 3, board_repair: 5 });
  });
});
