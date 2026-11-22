/** Only the fields a PATCH touched, so audit entries stay small: changed(before, patch), changed(after, patch). */
export function changed<T extends object>(row: T, patch: object): Partial<T> {
  return Object.fromEntries(Object.keys(patch).map((k) => [k, (row as Record<string, unknown>)[k]])) as Partial<T>;
}
