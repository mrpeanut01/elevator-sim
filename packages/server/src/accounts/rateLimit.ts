/**
 * A fixed-window request budget, keyed by a string, on an injected clock.
 *
 * `DECISIONS.md` § D242. It exists for one endpoint and one abuse: `POST /api/auth/request-link`
 * takes an address from an anonymous caller and **sends mail to it**. Unlimited, that is not a login
 * form, it is an email-bombing gadget pointed at a third party who never used this product — and it
 * is also how a Communication Services quota is burned in an afternoon by somebody who thought they
 * were testing.
 *
 * ## Why two budgets and not one
 *
 * They stop different attacks and neither substitutes for the other.
 *
 * - **Per address** bounds what one victim can be made to receive, however many machines the sender
 *   has. This is the one that makes the endpoint not a weapon.
 * - **Per client address** bounds how many *different* victims one sender can reach, which the
 *   per-address budget does not touch at all: a hundred addresses hit three times each is a hundred
 *   people mailed and no per-address budget exceeded.
 *
 * ## Memory is bounded, and the bound fails closed
 *
 * A limiter keyed by attacker-chosen strings is itself a memory-exhaustion target. Expired windows
 * are swept when the map reaches {@link MAX_TRACKED_KEYS}, and a limiter that is still full after a
 * sweep **refuses** rather than growing. That is a deliberate choice of which failure to have: under
 * an attack big enough to fill the table with live windows, honest requests are refused for a
 * window's length, which is recoverable, and the process does not exhaust its heap, which is not.
 *
 * In memory rather than in the database, for `api.ts`'s cooldown's reason: it bounds *this process*,
 * which is the thing being protected, and a restart resetting it costs one extra mail.
 */

/** How many, and over how long. */
export interface RateLimitRule {
  readonly maxRequests: number;
  readonly windowMs: number;
}

/**
 * The point at which the map is swept, and — if the sweep frees nothing — the point at which new
 * keys are refused.
 *
 * Fifty thousand windows is a few megabytes and is far more distinct addresses than this product
 * will see honestly in fifteen minutes, so reaching it is itself evidence of the attack the limiter
 * is for.
 */
export const MAX_TRACKED_KEYS = 50_000;

interface Window {
  startedAtMs: number;
  count: number;
}

/**
 * A fixed-window counter.
 *
 * Fixed rather than sliding, deliberately. A sliding window is more accurate at the boundary and
 * costs a timestamp list per key; the boundary error here is that a determined sender can post
 * `2 × maxRequests` mails across two adjacent windows, which for a budget of three mails per quarter
 * hour is a bound of six rather than three and changes nothing about whether the endpoint is a
 * weapon. Accuracy that costs unbounded per-key memory on a surface whose whole problem is
 * attacker-chosen keys is the wrong trade.
 */
export class FixedWindowLimiter {
  readonly #rule: RateLimitRule;
  readonly #windows = new Map<string, Window>();

  constructor(rule: RateLimitRule) {
    this.#rule = rule;
  }

  /**
   * Charge one request against `key`.
   *
   * Returns `undefined` when the request is allowed, and otherwise **how many milliseconds until it
   * would be** — a number rather than a boolean because a refusal a caller can put a duration on is
   * a refusal a player can act on, and because `Retry-After` has to come from somewhere.
   *
   * Charging and asking are one call on purpose. Two calls is a check-then-act, and the version of
   * that bug on this surface is a burst that all passes the check before any of it increments.
   */
  charge(key: string, nowMs: number): number | undefined {
    const existing = this.#windows.get(key);
    if (existing !== undefined && nowMs - existing.startedAtMs < this.#rule.windowMs) {
      if (existing.count >= this.#rule.maxRequests) {
        return existing.startedAtMs + this.#rule.windowMs - nowMs;
      }
      existing.count += 1;
      return undefined;
    }

    if (existing === undefined && this.#windows.size >= MAX_TRACKED_KEYS) {
      this.#sweep(nowMs);
      // Still full of *live* windows: refuse rather than grow. See the header on which failure this
      // is choosing.
      if (this.#windows.size >= MAX_TRACKED_KEYS) return this.#rule.windowMs;
    }
    this.#windows.set(key, { startedAtMs: nowMs, count: 1 });
    return undefined;
  }

  /** How many keys are being tracked. For the test that asserts the bound, and for nothing else. */
  get size(): number {
    return this.#windows.size;
  }

  #sweep(nowMs: number): void {
    for (const [key, window] of this.#windows) {
      if (nowMs - window.startedAtMs >= this.#rule.windowMs) this.#windows.delete(key);
    }
  }
}
