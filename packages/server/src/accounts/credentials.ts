/**
 * Sign-in tokens and session tokens — the parts that must not be got wrong quietly.
 *
 * `DECISIONS.md` § D214 § 5 as amended by § D241. Everything here is `node:crypto`; there is no
 * dependency to audit and no hand-rolled primitive. What *is* hand-written is the policy around
 * them, and each choice is stated where it is made rather than left to be inferred from the code.
 *
 * ## There are no passwords here any more
 *
 * § D241 replaced them with an emailed magic link. The `scrypt` parameters, the digest, the salt and
 * the two functions either side of them are **deleted, not deprecated** — a password path that is
 * unreachable but still exported is a login this repository's own standing requirement says nothing
 * calls and nobody notices, on the one surface where that is worst.
 *
 * ## The rules this module keeps
 *
 * - A sign-in token is **never** stored, logged, echoed or returned. It exists in the mail body and
 *   in the redeeming request, and nowhere else. What the database holds is its {@link LoginToken.jti}
 *   — an identifier that authorises nothing on its own, because the signature is the authorisation.
 * - Comparisons of secrets are **constant-time**. A fast `===` on a token leaks its prefix to
 *   anyone willing to time the response.
 * - The signing secret comes from the environment and **has no default**. A placeholder default is
 *   how a development secret reaches production, so a server without one refuses to boot rather
 *   than signing with something guessable.
 */

import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

/* -------------------------------------------------------------------------- *
 * The signing secret
 * -------------------------------------------------------------------------- */

/** Thrown when the server is asked to start without a signing secret. */
export class MissingSecretError extends Error {
  constructor() {
    super(
      'ELEVATOR_SIM_SECRET is not set. It signs the emailed sign-in links that are the only way ' +
        'into an account, so a server without one would issue tokens anybody could forge. There ' +
        'is deliberately no default: a placeholder is how a development secret reaches production.',
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
 * Sign-in tokens
 * -------------------------------------------------------------------------- */

/**
 * How long an emailed sign-in link is good for: **fifteen minutes**.
 *
 * The confirmation link it replaces was good for 24 hours, and that was right for what it did and
 * badly wrong for what this does. A confirmation link grants **one bit** — *this address is real*.
 * A sign-in link grants **a session**, so its blast radius is the whole account, and every minute it
 * stays valid is a minute it is an account key sitting in a mailbox: forwarded, synced to a phone
 * left on a desk, or read by whoever inherits a shared inbox.
 *
 * Fifteen minutes rather than five, because of two measured facts about this deployment rather than
 * a feeling. The container runs at `minReplicas: 0`, so a request that arrives cold pays a full
 * start — **28.7 s** was observed on `/api/challenges` — and the redeeming request pays it again if
 * the player opens the mail after the app has scaled back down. Delivery itself is seconds when it
 * is seconds and minutes when a receiving server greylists, which is common and retried on a timer
 * outside anyone's control. Five minutes would refuse honest players on a slow mail path; an hour
 * would buy them nothing they notice.
 *
 * The window is also the only period a `login_tokens` row exists, so this bounds the table as well
 * as the risk.
 */
export const LOGIN_TTL_MS = 15 * 60 * 1000;

/**
 * A signed sign-in token, and the two things the server must remember about it.
 *
 * The token goes in the mail. The {@link jti} goes in the database, and is what makes redemption
 * **single-use**: a signature can be checked a thousand times and will pass a thousand times, so
 * single use is a fact about server-side state or it is not a fact at all.
 */
export interface LoginToken {
  /** `base64url(payload).base64url(hmac)`. Mailed, never stored, never logged, never returned. */
  readonly token: string;
  /** The token's identity. Stored, and deleted by the redemption that consumes it. */
  readonly jti: string;
  readonly expiresAtMs: number;
}

/**
 * Sign a sign-in token.
 *
 * The construction is `signConfirmation`'s, which this replaces, plus one field. The payload is the
 * user id, **the email being signed in**, a random `jti` and an expiry, all inside the HMAC.
 *
 * The email is inside the signature for the reason it was in the confirmation token: a token must
 * not be replayable against a different address than the one it was mailed to. Under a magic link
 * that reason is stronger, not weaker — the token *is* the credential, so a token that authenticated
 * whatever address an account happened to hold at redemption time would be an account-takeover
 * primitive rather than a login.
 *
 * The `jti` is 16 bytes from the CSPRNG. It is not a secret — anyone holding the token can read the
 * payload — and it is not asked to be one: it names a row, and the signature is what authorises.
 *
 * The clock is passed in rather than read, so the expiry is testable without waiting.
 */
export function signLoginToken(input: {
  readonly userId: string;
  readonly email: string;
  readonly secret: string;
  readonly nowMs: number;
  readonly ttlMs?: number;
}): LoginToken {
  const jti = randomBytes(16).toString('base64url');
  const expiresAtMs = input.nowMs + (input.ttlMs ?? LOGIN_TTL_MS);
  const payload = JSON.stringify({ u: input.userId, e: input.email, j: jti, x: expiresAtMs });
  const body = Buffer.from(payload, 'utf8').toString('base64url');
  return Object.freeze({ token: `${body}.${hmac(body, input.secret)}`, jti, expiresAtMs });
}

/** Why a token was refused. Never surfaced verbatim to the user; the caller decides the wording. */
export type TokenFailure = 'malformed' | 'bad-signature' | 'expired';

export interface LoginClaims {
  readonly userId: string;
  readonly email: string;
  readonly jti: string;
  readonly expiresAtMs: number;
}

/**
 * Verify a sign-in token's signature and expiry.
 *
 * **This is half of a redemption and never the whole of it.** It says the token was signed by this
 * server and has not expired; it cannot say the token has not already been used, because nothing
 * about a signature changes when it is spent. The caller consumes {@link LoginClaims.jti} against
 * the store, and `http/api.ts` is the one place that does both.
 *
 * **Signature first, expiry second.** Checking expiry first would let an attacker learn whether a
 * forged token's payload happened to parse, which is information they should not get from a token
 * they did not sign. The signature comparison is {@link constantTimeEquals}, so a near-miss forgery
 * cannot be walked forwards a byte at a time.
 */
export function verifyLoginToken(token: string, secret: string, nowMs: number): LoginClaims | TokenFailure {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return 'malformed';
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  if (!constantTimeEquals(signature, hmac(body, secret))) return 'bad-signature';

  let claims: { u?: unknown; e?: unknown; j?: unknown; x?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as typeof claims;
  } catch {
    return 'malformed';
  }
  if (
    typeof claims.u !== 'string' ||
    typeof claims.e !== 'string' ||
    typeof claims.j !== 'string' ||
    typeof claims.x !== 'number'
  ) {
    return 'malformed';
  }
  if (claims.x <= nowMs) return 'expired';
  return Object.freeze({ userId: claims.u, email: claims.e, jti: claims.j, expiresAtMs: claims.x });
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
