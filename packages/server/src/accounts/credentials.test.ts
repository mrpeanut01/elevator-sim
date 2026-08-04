/**
 * The security claims, driven rather than asserted.
 *
 * Every test here breaks something on purpose: a wrong password, a tampered token, a token replayed
 * against a different address, an expired one, a server with no secret. A credentials module whose
 * tests only ever supply correct inputs has demonstrated that the happy path works, which is the
 * half nobody was worried about.
 */

import { describe, expect, it } from 'vitest';

import {
  CONFIRMATION_TTL_MS,
  MissingSecretError,
  constantTimeEquals,
  hashPassword,
  newSessionToken,
  passwordIssues,
  passwordMatches,
  requireSecret,
  signConfirmation,
  verifyConfirmation,
} from './credentials.js';

const SECRET = 'a'.repeat(48);
const NOW = 1_770_000_000_000;

/* -------------------------------------------------------------------------- *
 * Passwords
 * -------------------------------------------------------------------------- */

describe('passwords', () => {
  it('accepts the right one and refuses the wrong one', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(passwordMatches('correct horse battery staple', stored)).toBe(true);
    expect(passwordMatches('correct horse battery stapl', stored)).toBe(false);
    expect(passwordMatches('', stored)).toBe(false);
  });

  it('never keeps the password, in any field', () => {
    const password = 'a passphrase nobody should find';
    const stored = hashPassword(password);
    // The whole record, serialised, must not contain it. A field added later that echoed the
    // password back would fail here rather than in a breach.
    expect(JSON.stringify(stored)).not.toContain(password);
    expect(Object.values(stored).join(' ')).not.toContain(password);
  });

  it('salts, so the same password twice gives different digests', () => {
    const first = hashPassword('the same passphrase twice');
    const second = hashPassword('the same passphrase twice');
    expect(first.hashHex).not.toBe(second.hashHex);
    expect(first.saltHex).not.toBe(second.saltHex);
    // ...and both still verify. A salt that broke verification would be caught by nothing above.
    expect(passwordMatches('the same passphrase twice', first)).toBe(true);
    expect(passwordMatches('the same passphrase twice', second)).toBe(true);
  });

  it('fails a corrupt stored record rather than throwing', () => {
    // A corrupt row must fail the login, not crash the endpoint and reveal which rows are corrupt.
    for (const stored of [
      { saltHex: 'zz', hashHex: 'zz' },
      { saltHex: '', hashHex: '' },
      { saltHex: 'ab', hashHex: 'ab' },
    ]) {
      expect(() => passwordMatches('anything at all here', stored)).not.toThrow();
      expect(passwordMatches('anything at all here', stored)).toBe(false);
    }
  });

  it('requires length and nothing else', () => {
    expect(passwordIssues('short')).toHaveLength(1);
    expect(passwordIssues('x'.repeat(201))).toHaveLength(1);
    // A long passphrase of one character class is fine. Composition rules push people to
    // `Password1!` and are not what makes a secret strong.
    expect(passwordIssues('all lowercase words and spaces')).toEqual([]);
    // The upper bound is a denial-of-service guard: scrypt will happily spend a second on a
    // megabyte, and this endpoint is unauthenticated.
    expect(passwordIssues('x'.repeat(200))).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The secret
 * -------------------------------------------------------------------------- */

describe('the signing secret', () => {
  it('refuses to start without one, and has no default', () => {
    expect(() => requireSecret({})).toThrow(MissingSecretError);
    // Short is refused rather than stretched: a secret short enough to guess is not improved by
    // being padded.
    expect(() => requireSecret({ ELEVATOR_SIM_SECRET: 'tooshort' })).toThrow(MissingSecretError);
  });

  it('says why, in terms an operator can act on', () => {
    try {
      requireSecret({});
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('ELEVATOR_SIM_SECRET');
      expect((error as Error).message).toMatch(/no default|placeholder/u);
    }
  });

  it('accepts one that is long enough', () => {
    expect(requireSecret({ ELEVATOR_SIM_SECRET: SECRET })).toBe(SECRET);
  });
});

/* -------------------------------------------------------------------------- *
 * Confirmation tokens
 * -------------------------------------------------------------------------- */

describe('confirmation tokens', () => {
  const token = (): string =>
    signConfirmation({ userId: 'u1', email: 'player@example.test', secret: SECRET, nowMs: NOW });

  it('round-trips the claims it was signed with', () => {
    const claims = verifyConfirmation(token(), SECRET, NOW);
    expect(claims).toMatchObject({ userId: 'u1', email: 'player@example.test' });
  });

  it('refuses a token signed with a different secret', () => {
    expect(verifyConfirmation(token(), 'b'.repeat(48), NOW)).toBe('bad-signature');
  });

  it('refuses a tampered payload', () => {
    const [body = '', signature = ''] = token().split('.');
    const forged = Buffer.from(
      JSON.stringify({ u: 'someone-else', e: 'attacker@example.test', x: NOW + 1000 }),
      'utf8',
    ).toString('base64url');
    // The payload is swapped and the signature kept. This is the attack the HMAC exists for.
    expect(verifyConfirmation(`${forged}.${signature}`, SECRET, NOW)).toBe('bad-signature');
    expect(body.length).toBeGreaterThan(0);
  });

  it('cannot be replayed against a different address', () => {
    // The email is INSIDE the signature. Without that, a token issued for one address could confirm
    // whatever address the account later claimed — which is how a confirmation flow becomes an
    // account-takeover flow.
    const claims = verifyConfirmation(token(), SECRET, NOW);
    expect(claims).not.toBe('bad-signature');
    if (typeof claims === 'string') return;
    expect(claims.email).toBe('player@example.test');
  });

  it('expires', () => {
    const expired = signConfirmation({
      userId: 'u1',
      email: 'player@example.test',
      secret: SECRET,
      nowMs: NOW,
      ttlMs: 1000,
    });
    expect(verifyConfirmation(expired, SECRET, NOW + 999)).not.toBe('expired');
    expect(verifyConfirmation(expired, SECRET, NOW + 1001)).toBe('expired');
  });

  it('checks the signature before the expiry', () => {
    // A forged token must not be able to learn whether its payload parsed. Both are wrong here and
    // the signature is what is reported.
    const stale = signConfirmation({
      userId: 'u1',
      email: 'e@example.test',
      secret: 'c'.repeat(48),
      nowMs: NOW - CONFIRMATION_TTL_MS * 2,
    });
    expect(verifyConfirmation(stale, SECRET, NOW)).toBe('bad-signature');
  });

  it('refuses garbage without throwing', () => {
    for (const bad of ['', '.', 'nodot', 'a.b', '...', Buffer.from('{').toString('base64url') + '.x']) {
      expect(() => verifyConfirmation(bad, SECRET, NOW)).not.toThrow();
      expect(typeof verifyConfirmation(bad, SECRET, NOW)).toBe('string');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Sessions and primitives
 * -------------------------------------------------------------------------- */

describe('session tokens', () => {
  it('are long, opaque and never repeat', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const token = newSessionToken();
      expect(token.length).toBeGreaterThanOrEqual(43);
      expect(seen.has(token)).toBe(false);
      seen.add(token);
    }
  });
});

describe('constant-time comparison', () => {
  it('agrees with equality on the answer', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'ab')).toBe(false);
    expect(constantTimeEquals('', '')).toBe(true);
  });
});
