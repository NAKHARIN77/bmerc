/**
 * SKUs made by the server when a part is saved with the SKU left empty: <PREFIX>-0001, -0002 …
 * The prefix comes from the category's first word: "Chips" → CHIP, "Fans" → FAN, "Thermal paste" → THERMAL.
 * No category, or one with no Latin letters or digits, gives PART.
 */
export function skuPrefix(category: string | null | undefined): string {
  const word = (category ?? '').trim().split(/\s+/)[0] ?? '';
  let p = word.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (p.length > 3 && p.endsWith('S') && !p.endsWith('SS')) p = p.slice(0, -1); // plural: Chips → CHIP
  p = p.slice(0, 10);
  return p || 'PART';
}

/**
 * One more than the highest <prefix>-NNNN SKU in use (exactly four digits, the shape this file makes).
 * Other SKUs are ignored, so a model number such as FAN-12038 does not push the next number to FAN-12039.
 */
export function nextSkuNumber(prefix: string, taken: string[]): number {
  const re = new RegExp(`^${prefix}-([0-9]{4})$`);
  let max = 0;
  for (const s of taken) {
    const m = re.exec(s);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}
