/**
 * The security claims, driven rather than asserted.
 *
 * Every test here breaks something on purpose: a tampered token, a token replayed against a
 * different address, an expired one, a server with no secret. A credentials module whose tests only
 * ever supply correct inputs has demonstrated that the happy path works, which is the half nobody
 * was worried about.
 *
 * **The password suite is gone because the passwords are** (§ D241). What replaced it is not a
 * smaller set of tests: a magic link is the *whole* credential, so the arms below are the arms that
 * decide whether an account can be taken, and one of them — single use — is deliberately **not**
 * here. It cannot be, because a signature cannot express it; `http/api.test.ts` drives it against
 * the store, and this file's job is to say clearly that the signature does not.
 */

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  LOGIN_TTL_MS,
  MissingSecretError,
  constantTimeEquals,
  newSessionToken,
  requireSecret,
  signLoginToken,
  verifyLoginToken,
} from './credentials.js';

const SECRET = 'a'.repeat(48);
const NOW = 1_770_000_000_000;

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
 * Sign-in tokens
 * -------------------------------------------------------------------------- */

describe('sign-in tokens', () => {
  const issue = (): ReturnType<typeof signLoginToken> =>
    signLoginToken({ userId: 'u1', email: 'player@example.test', secret: SECRET, nowMs: NOW });

  it('round-trips the claims it was signed with', () => {
    const link = issue();
    const claims = verifyLoginToken(link.token, SECRET, NOW);
    expect(claims).toMatchObject({ userId: 'u1', email: 'player@example.test', jti: link.jti });
  });

  it('refuses a token signed with a different secret', () => {
    expect(verifyLoginToken(issue().token, 'b'.repeat(48), NOW)).toBe('bad-signature');
  });

  it('refuses a tampered payload', () => {
    const [body = '', signature = ''] = issue().token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ u: 'someone-else', e: 'attacker@example.test', j: 'anything', x: NOW + 1000 }),
      'utf8',
    ).toString('base64url');
    // The payload is swapped and the signature kept. This is the attack the HMAC exists for, and
    // under a magic link it is an attempt to mint a session for an account the attacker names.
    expect(verifyLoginToken(`${forged}.${signature}`, SECRET, NOW)).toBe('bad-signature');
    expect(body.length).toBeGreaterThan(0);
  });

  it('cannot be replayed against a different address', () => {
    // The email is INSIDE the signature, so a token carries the address it was mailed to and cannot
    // be presented as a login for another one. `api.ts` checks the claim against the stored account
    // rather than trusting it, and this is the half that makes that check meaningful.
    const claims = verifyLoginToken(issue().token, SECRET, NOW);
    expect(typeof claims).not.toBe('string');
    if (typeof claims === 'string') return;
    expect(claims.email).toBe('player@example.test');
  });

  it('expires, and expires in minutes rather than hours', () => {
    const link = signLoginToken({
      userId: 'u1',
      email: 'player@example.test',
      secret: SECRET,
      nowMs: NOW,
      ttlMs: 1000,
    });
    expect(verifyLoginToken(link.token, SECRET, NOW + 999)).not.toBe('expired');
    expect(verifyLoginToken(link.token, SECRET, NOW + 1001)).toBe('expired');

    // The shipped TTL, asserted as a bound rather than as a number, because the number may move and
    // the bound may not: a login link is not a confirmation link and must not inherit its day.
    expect(LOGIN_TTL_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(LOGIN_TTL_MS).toBeLessThanOrEqual(60 * 60 * 1000);
    expect(verifyLoginToken(issue().token, SECRET, NOW + LOGIN_TTL_MS + 1)).toBe('expired');
  });

  it('checks the signature before the expiry', () => {
    // A forged token must not be able to learn whether its payload parsed. Both are wrong here and
    // the signature is what is reported.
    const stale = signLoginToken({
      userId: 'u1',
      email: 'e@example.test',
      secret: 'c'.repeat(48),
      nowMs: NOW - LOGIN_TTL_MS * 2,
    });
    expect(verifyLoginToken(stale.token, SECRET, NOW)).toBe('bad-signature');
  });

  it('gives every token a distinct identity, which is what single use is hung on', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const link = issue();
      expect(seen.has(link.jti)).toBe(false);
      seen.add(link.jti);
      // Two links for the same account are two different strings. Without that, spending one would
      // spend the other, and a player who asked twice would lock themselves out.
      expect(link.token).not.toBe('');
    }
  });

  it('says the expiry it signed, so the caller can store the same one', () => {
    const link = signLoginToken({
      userId: 'u1',
      email: 'player@example.test',
      secret: SECRET,
      nowMs: NOW,
      ttlMs: 60_000,
    });
    expect(link.expiresAtMs).toBe(NOW + 60_000);
    const claims = verifyLoginToken(link.token, SECRET, NOW);
    if (typeof claims === 'string') expect.unreachable('should have verified');
    else expect(claims.expiresAtMs).toBe(link.expiresAtMs);
  });

  it('verifies a spent token exactly as happily as an unspent one — which is why the store exists', () => {
    // The negative result this module is honest about. Nothing about an HMAC changes when a token is
    // used, so verifying twice succeeds twice, and single use is a fact about `login_tokens` or it
    // is not a fact. `api.test.ts` is where the second redemption is refused.
    const link = issue();
    expect(verifyLoginToken(link.token, SECRET, NOW)).toMatchObject({ jti: link.jti });
    expect(verifyLoginToken(link.token, SECRET, NOW)).toMatchObject({ jti: link.jti });
  });

  it('refuses garbage without throwing', () => {
    for (const bad of ['', '.', 'nodot', 'a.b', '...', `${Buffer.from('{').toString('base64url')}.x`]) {
      expect(() => verifyLoginToken(bad, SECRET, NOW)).not.toThrow();
      expect(typeof verifyLoginToken(bad, SECRET, NOW)).toBe('string');
    }
  });

  it('refuses a well-signed token whose payload is missing a field', () => {
    // Signed by this server, so the HMAC passes — and then the claims do not typecheck. A token
    // that verified with a missing `jti` would be a token nothing could spend, i.e. a token with
    // no single-use guarantee at all.
    for (const payload of [
      { u: 'u1', e: 'p@example.test', x: NOW + 1000 },
      { u: 'u1', j: 'j1', x: NOW + 1000 },
      { e: 'p@example.test', j: 'j1', x: NOW + 1000 },
      { u: 'u1', e: 'p@example.test', j: 'j1' },
    ]) {
      const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      const signature = createHmac('sha256', SECRET).update(body).digest('base64url');
      expect(verifyLoginToken(`${body}.${signature}`, SECRET, NOW)).toBe('malformed');
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
