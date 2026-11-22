/**
 * Fixed-window counter kept in memory. Fine for one API instance;
 * move to a shared store (Redis) before running more than one.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { n: number; until: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** True when the key has used up its attempts in the current window. */
  blocked(key: string) {
    const h = this.hits.get(key);
    return !!h && h.until > Date.now() && h.n >= this.max;
  }

  hit(key: string) {
    const h = this.hits.get(key);
    const n = h && h.until > Date.now() ? h.n + 1 : 1;
    this.hits.set(key, { n, until: h && h.until > Date.now() ? h.until : Date.now() + this.windowMs });
    if (this.hits.size > 10_000) this.prune();
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private prune() {
    const now = Date.now();
    for (const [k, h] of this.hits) if (h.until <= now) this.hits.delete(k);
  }
}
