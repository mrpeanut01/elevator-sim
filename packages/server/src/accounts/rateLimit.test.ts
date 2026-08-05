/**
 * The budget, driven on an injected clock.
 *
 * Every test here is a fact about a *refusal*, because the allowing half is not what the module is
 * for: unlimited, `POST /api/auth/request-link` mails whoever it is told to, as fast as it can, on
 * behalf of anybody who can type an address.
 *
 * The clock is a parameter for this package's usual reason (§ D215 § 6) and one more: a limiter
 * tested against the real clock would need a test that sleeps for a window, so it would either be
 * slow or would only ever test the first request.
 */

import { describe, expect, it } from 'vitest';

import { FixedWindowLimiter, MAX_TRACKED_KEYS } from './rateLimit.js';

const NOW = 1_770_000_000_000;

describe('a fixed window', () => {
  it('allows the budget and refuses the next one', () => {
    const limiter = new FixedWindowLimiter({ maxRequests: 3, windowMs: 1000 });
    expect(limiter.charge('a', NOW)).toBeUndefined();
    expect(limiter.charge('a', NOW + 1)).toBeUndefined();
    expect(limiter.charge('a', NOW + 2)).toBeUndefined();
    expect(limiter.charge('a', NOW + 3)).toBeDefined();
  });

  it('says how long to wait, rather than only that the answer is no', () => {
    const limiter = new FixedWindowLimiter({ maxRequests: 1, windowMs: 1000 });
    limiter.charge('a', NOW);
    // A refusal a caller can put a duration on is a refusal a player can act on.
    expect(limiter.charge('a', NOW + 400)).toBe(600);
  });

  it('refuses for the whole window and then allows again', () => {
    const limiter = new FixedWindowLimiter({ maxRequests: 1, windowMs: 1000 });
    expect(limiter.charge('a', NOW)).toBeUndefined();
    expect(limiter.charge('a', NOW + 999)).toBeDefined();
    expect(limiter.charge('a', NOW + 1000)).toBeUndefined();
  });

  it('keeps keys apart, which is the whole reason there are two limiters', () => {
    const limiter = new FixedWindowLimiter({ maxRequests: 1, windowMs: 1000 });
    expect(limiter.charge('victim@example.test', NOW)).toBeUndefined();
    expect(limiter.charge('someone-else@example.test', NOW)).toBeUndefined();
    expect(limiter.charge('victim@example.test', NOW)).toBeDefined();
  });

  it('charges on the way past, so a burst cannot all pass one check', () => {
    // Charging and asking are one call on purpose. Were they two, `maxRequests` concurrent callers
    // could each read the count before any of them incremented it.
    const limiter = new FixedWindowLimiter({ maxRequests: 2, windowMs: 1000 });
    const answers = [NOW, NOW, NOW, NOW].map((at) => limiter.charge('a', at));
    expect(answers.filter((answer) => answer === undefined)).toHaveLength(2);
  });

  it('a refusal does not extend the window it was refused in', () => {
    // A refused request must not push the window forward, or a caller who keeps trying can never
    // get back in — a self-inflicted lockout that looks exactly like a broken server.
    const limiter = new FixedWindowLimiter({ maxRequests: 1, windowMs: 1000 });
    limiter.charge('a', NOW);
    for (let at = NOW + 100; at < NOW + 1000; at += 100) limiter.charge('a', at);
    expect(limiter.charge('a', NOW + 1000)).toBeUndefined();
  });
});

describe('the memory bound', () => {
  it('sweeps expired windows rather than growing forever', () => {
    const limiter = new FixedWindowLimiter({ maxRequests: 1, windowMs: 1000 });
    for (let index = 0; index < 200; index += 1) limiter.charge(`k${String(index)}`, NOW);
    expect(limiter.size).toBe(200);
    // One key past the window, and the sweep only runs at the cap — so this asserts the *reuse*
    // path rather than the sweep: an expired window is replaced in place, not accumulated beside.
    limiter.charge('k0', NOW + 5000);
    expect(limiter.size).toBe(200);
  });

  it('is bounded by a number rather than by hope', () => {
    // The bound exists because the keys are attacker-chosen: an address and a client address are
    // both strings a sender picks. A limiter that grew one entry per distinct key would be a
    // memory-exhaustion target wearing the costume of a defence.
    expect(MAX_TRACKED_KEYS).toBeGreaterThan(1000);
    expect(MAX_TRACKED_KEYS).toBeLessThan(1_000_000);
  });
});
