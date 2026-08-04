/**
 * Passwords, confirmation tokens and session tokens — the parts that must not be got wrong quietly.
 *
 * `DECISIONS.md` § D214 § 5. Everything here is `node:crypto`; there is no dependency to audit and
 * no hand-rolled primitive. What *is* hand-written is the policy around them, and each choice is
 * stated where it is made rather than left to be inferred from the code.
 *
 * ## The rules this module keeps
 *
 * - A password is **never** stored, logged, echoed or returned. Only a `scrypt` digest and its salt.
 * - Comparisons of secrets are **constant-time**. A fast `===` on a token leaks its prefix to
 *   anyone willing to time the response.
 * - The signing secret comes from the environment and **has no default**. A placeholder default is
 *   how a development secret reaches production, so a server without one refuses to boot rather
 *   than signing with something guessable.
 */

import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

/* -------------------------------------------------------------------------- *
 * Passwords
 * -------------------------------------------------------------------------- */

/**
 * `scrypt` parameters.
 *
 * `N = 2^15` with `r = 8, p = 1` is the interactive-login end of the range the algorithm's own
 * author recommends: roughly 100 ms and 32 MB per hash on a modern core. That cost is the point —
 * it is paid once per login by a legitimate user and once per guess by an attacker with the
 * database, and it is what makes an offline dictionary attack expensive rather than instant.
 */
export const SCRYPT_PARAMS = Object.freeze({ N: 32_768, r: 8, p: 1, keyLength: 64, saltBytes: 16 });

/** A stored password: the digest and the salt it was derived with. Never the password. */
export interface PasswordHash {
  readonly saltHex: string;
  readonly hashHex: string;
}

/**
 * The rules a password must satisfy, as a list of what is wrong with it.
 *
 * **Length is the only hard requirement**, deliberately. Composition rules — a digit, a symbol, a
 * capital — measurably push people towards `Password1!` and are not what makes a secret strong; a
 * long passphrase is stronger than a short mangled word and this refuses to pretend otherwise. The
 * upper bound exists because `scrypt` will happily spend a second hashing a megabyte, which is a
 * denial-of-service an unauthenticated endpoint must not offer.
 */
export function passwordIssues(password: string): readonly string[] {
  const issues: string[] = [];
  if (password.length < 12) issues.push('a password must be at least 12 characters');
  if (password.length > 200) issues.push('a password must be at most 200 characters');
  return Object.freeze(issues);
}

/** Hash a password with a fresh random salt. */
export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(SCRYPT_PARAMS.saltBytes);
  const hash = scryptSync(password, salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    // Node's default `maxmem` is 32 MB, which `N = 2^15` sits exactly on and intermittently
    // exceeds. Raised explicitly so the cost is the cost that was chosen rather than whatever fits.
    maxmem: 128 * 1024 * 1024,
  });
  return Object.freeze({ saltHex: salt.toString('hex'), hashHex: hash.toString('hex') });
}

/**
 * Whether a password matches a stored hash, in constant time.
 *
 * Returns `false` for a malformed stored record rather than throwing: a corrupt row must fail the
 * login, not crash the endpoint and tell the caller which rows are corrupt.
 */
export function passwordMatches(password: string, stored: PasswordHash): boolean {
  let expected: Buffer;
  try {
    expected = Buffer.from(stored.hashHex, 'hex');
    if (expected.length !== SCRYPT_PARAMS.keyLength) return false;
  } catch {
    return false;
  }
  const actual = scryptSync(password, Buffer.from(stored.saltHex, 'hex'), SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
    maxmem: 128 * 1024 * 1024,
  });
  return timingSafeEqual(actual, expected);
}

/* -------------------------------------------------------------------------- *
 * The signing secret
 * -------------------------------------------------------------------------- */

/** Thrown when the server is asked to start without a signing secret. */
export class MissingSecretError extends Error {
  constructor() {
    super(
      'ELEVATOR_SIM_SECRET is not set. It signs email-confirmation tokens, so a server without ' +
        'one would issue tokens anybody could forge. There is deliberately no default: a ' +
        'placeholder is how a development secret reaches production.',
    );
    this.name = 'MissingSecretError';
  }
}

/**
 * The signing secret, from the environment.
 *
 * @throws MissingSecretError when unset or too short to be worth having. **No default**, and the
 *   32-character floor is asserted rather than padded — a secret short enough to guess is not
 *   improved by being stretched.
 */
export function requireSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env['ELEVATOR_SIM_SECRET'];
  if (secret === undefined || secret.length < 32) throw new MissingSecretError();
  return secret;
}

/* -------------------------------------------------------------------------- *
 * Confirmation tokens
 * -------------------------------------------------------------------------- */

/** How long a confirmation link is good for. Long enough to reach an inbox, short enough to expire. */
export const CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A signed, expiring confirmation token.
 *
 * `base64url(payload).base64url(hmac)` where the payload is the user id, the email being confirmed
 * and an expiry. The email is **inside the signature** so a token cannot be replayed against a
 * different address after the account's email is changed, which is the mistake that turns a
 * confirmation flow into an account-takeover flow.
 *
 * The clock is passed in rather than read, so the expiry is testable without waiting a day.
 */
export function signConfirmation(input: {
  readonly userId: string;
  readonly email: string;
  readonly secret: string;
  readonly nowMs: number;
  readonly ttlMs?: number;
}): string {
  const payload = JSON.stringify({
    u: input.userId,
    e: input.email,
    x: input.nowMs + (input.ttlMs ?? CONFIRMATION_TTL_MS),
  });
  const body = Buffer.from(payload, 'utf8').toString('base64url');
  return `${body}.${hmac(body, input.secret)}`;
}

/** Why a token was refused. Never surfaced verbatim to the user; the caller decides the wording. */
export type TokenFailure = 'malformed' | 'bad-signature' | 'expired';

export interface ConfirmationClaims {
  readonly userId: string;
  readonly email: string;
  readonly expiresAtMs: number;
}

/**
 * Verify a confirmation token.
 *
 * **Signature first, expiry second.** Checking expiry first would let an attacker learn whether a
 * forged token's payload happened to parse, which is information they should not get from a token
 * they did not sign.
 */
export function verifyConfirmation(
  token: string,
  secret: string,
  nowMs: number,
): ConfirmationClaims | TokenFailure {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return 'malformed';
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  if (!constantTimeEquals(signature, hmac(body, secret))) return 'bad-signature';

  let claims: { u?: unknown; e?: unknown; x?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as typeof claims;
  } catch {
    return 'malformed';
  }
  if (typeof claims.u !== 'string' || typeof claims.e !== 'string' || typeof claims.x !== 'number') {
    return 'malformed';
  }
  if (claims.x <= nowMs) return 'expired';
  return Object.freeze({ userId: claims.u, email: claims.e, expiresAtMs: claims.x });
}

/* -------------------------------------------------------------------------- *
 * Session tokens
 * -------------------------------------------------------------------------- */

/**
 * A fresh opaque session token.
 *
 * Opaque and stored, not a JWT: revocation is a `DELETE`, and this product has no need for
 * stateless verification. 32 bytes from the CSPRNG — guessing one is not a threat model, it is
 * arithmetic.
 */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/* -------------------------------------------------------------------------- *
 * Primitives
 * -------------------------------------------------------------------------- */

function hmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/**
 * Constant-time string comparison.
 *
 * Length is compared first and **not** in constant time, which is deliberate and safe: the length
 * of an HMAC is a constant of the algorithm, so it leaks nothing an attacker does not already know.
 */
export function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
