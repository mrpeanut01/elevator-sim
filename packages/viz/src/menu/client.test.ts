/**
 * The client and the account form, driven over a transport that never touches a socket.
 *
 * Every interesting case here is a **failure**: a server that is down, a body that is not JSON, a
 * 422 that must not read as an accusation, a 2xx in a shape this build does not understand. A
 * client tested only on its happy path has demonstrated the half nobody was worried about.
 *
 * The last block is the one that earns its keep: it asserts the client's mirrored validation
 * constants against the **server's own**, so a client rule cannot drift stricter than the server it
 * is a courtesy for.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  claimedMetricsOf,
  createClient,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from './client.js';
import {
  EMPTY_FORM,
  MAX_DISPLAY_NAME,
  MIN_DISPLAY_NAME,
  SIGNED_OUT,
  canSubmitForm,
  formIssues,
  postingRefusal,
  signedIn,
  signedOut,
  updateForm,
  withNotice,
} from './account.js';

/* -------------------------------------------------------------------------- *
 * A transport that records what it was asked for
 * -------------------------------------------------------------------------- */

function scripted(response: TransportResponse | (() => never)): {
  transport: Transport;
  seen: TransportRequest[];
} {
  const seen: TransportRequest[] = [];
  return {
    seen,
    transport: async (request) => {
      seen.push(request);
      if (typeof response === 'function') response();
      return response as TransportResponse;
    },
  };
}

const USER = { id: 'u1', email: 'ada@example.test', displayName: 'Ada', confirmed: true };

/* -------------------------------------------------------------------------- *
 * The client
 * -------------------------------------------------------------------------- */

describe('the leaderboard client', () => {
  it('sends the bearer token on the calls that need one, and not on the ones that do not', async () => {
    const { transport, seen } = scripted({ status: 200, body: { user: USER } });
    const client = createClient('https://elevator.example/', transport);
    await client.me('session-token');
    await client.boards();
    expect(seen[0]?.token).toBe('session-token');
    expect(seen[1]?.token).toBeUndefined();
    // The trailing slash on the origin is normalised rather than doubled.
    expect(seen[0]?.url).toBe('https://elevator.example/api/me');
  });

  it('turns an unreachable server into a sentence, not an exception', async () => {
    const { transport } = scripted(() => {
      throw new Error('ECONNREFUSED');
    });
    const result = await createClient('https://elevator.example', transport).boards();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('unreachable');
    // And it tells the player their run survives, because the alternative reading — "your score is
    // gone" — is both wrong and the one people assume.
    expect(result.detail).toMatch(/not lost/u);
  });

  it('carries the server’s own wording for a refusal rather than inventing one', async () => {
    const { transport } = scripted({
      status: 422,
      body: {
        error: 'metrics-do-not-reproduce',
        detail: 'Replaying this seed on this server did not reproduce the submitted figures.',
      },
    });
    const result = await createClient('https://x', transport).submit('t', {
      run: {
        buildingId: 'garden-apartments',
        dispatcherProfileId: 'collective',
        demandTemplateId: 'rise-and-fall',
        arrivalRatePctPop5min: null,
        durationS: 900,
        seed: '1',
      },
      claimed: { awtS: 1, wt95S: 1, ttdMeanS: 1, pctOverLongWait: 0, awtIsValid: true },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('metrics-do-not-reproduce');
    // Not rewritten, and not an accusation. An honest player on an older build lands here.
    expect(result.detail).toContain('did not reproduce');
    expect(result.detail).not.toMatch(/cheat|fake|forged/u);
  });

  it('passes a field-issue list through so a form can show it', async () => {
    const { transport } = scripted({
      status: 400,
      body: { error: 'invalid-registration', issues: ['a', 'b', 'c'] },
    });
    const result = await createClient('https://x', transport).register({
      email: 'a@b.test',
      displayName: 'Ada',
      password: 'a passphrase of adequate length',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(['a', 'b', 'c']);
  });

  it('refuses a 2xx whose shape it does not understand', async () => {
    const { transport } = scripted({ status: 200, body: { something: 'else' } });
    const result = await createClient('https://x', transport).login({ email: 'a@b.test', password: 'x' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // A silent `undefined` here would reach the screen where a name should be.
    expect(result.code).toBe('unexpected-response');
  });

  it('survives a response with no body at all', async () => {
    const { transport } = scripted({ status: 500, body: undefined });
    const result = await createClient('https://x', transport).boards();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('http-500');
    expect(result.detail.length).toBeGreaterThan(0);
  });

  it('returns a board page with the server’s note intact', async () => {
    const { transport } = scripted({
      status: 200,
      body: {
        configHash: 'abc',
        metric: 'awtS',
        note: 'Ranked on the named metric alone. The others are shown beside it and never combined.',
        entries: [],
      },
    });
    const result = await createClient('https://x', transport).board('abc', 'awtS');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // § D106 travels with the data. A client that dropped the note would be free to draw a
    // composite score with nothing on screen saying it should not.
    expect(result.value.note).toMatch(/never combined/u);
  });
});

/* -------------------------------------------------------------------------- *
 * The account form
 * -------------------------------------------------------------------------- */

describe('the account form', () => {
  it('reports every problem at once', () => {
    const form = { ...EMPTY_FORM, mode: 'register' as const, email: 'nope', password: 'short' };
    expect(formIssues(form).map((issue) => issue.field).sort()).toEqual(['displayName', 'email', 'password']);
  });

  it('asks for a display name only when registering', () => {
    const signIn = { ...EMPTY_FORM, email: 'a@b.test', password: 'a passphrase long enough' };
    expect(formIssues(signIn)).toEqual([]);
    expect(formIssues({ ...signIn, mode: 'register' }).map((issue) => issue.field)).toEqual(['displayName']);
  });

  it('clears the password when the mode changes', () => {
    // A field the player cannot see holding a secret they typed for something else is how the
    // wrong one gets submitted.
    const typed = updateForm(SIGNED_OUT, { password: 'a passphrase long enough' });
    expect(updateForm(typed, { mode: 'register' }).form.password).toBe('');
    expect(updateForm(typed, { email: 'a@b.test' }).form.password).toBe('a passphrase long enough');
  });

  it('drops the password from state once signed in', () => {
    const typed = updateForm(SIGNED_OUT, { email: 'ada@example.test', password: 'a passphrase long enough' });
    const state = signedIn(typed, 'token', USER);
    expect(state.form.password).toBe('');
    expect(JSON.stringify(state)).not.toContain('a passphrase long enough');
  });

  it('says what an unconfirmed account still cannot do, without locking it out', () => {
    const state = signedIn(SIGNED_OUT, 'token', { ...USER, confirmed: false });
    expect(state.notice).toMatch(/confirm/iu);
    expect(state.notice).toMatch(/play now/u);
    expect(postingRefusal(state)).toMatch(/Confirm your email/u);
    // ...and a confirmed one is refused nothing.
    expect(postingRefusal(signedIn(SIGNED_OUT, 'token', USER))).toBeUndefined();
  });

  it('tells a signed-out player to sign in rather than showing a dead button', () => {
    expect(postingRefusal(SIGNED_OUT)).toMatch(/Sign in/u);
  });

  it('will not submit while a request is in flight', () => {
    const ready = updateForm(SIGNED_OUT, { email: 'a@b.test', password: 'a passphrase long enough' });
    expect(canSubmitForm(ready)).toBe(true);
    expect(canSubmitForm({ ...ready, busy: true })).toBe(false);
  });

  it('keeps a notice until the player types again', () => {
    const noticed = withNotice(SIGNED_OUT, 'That address and password do not match an account.');
    expect(noticed.notice).toBeDefined();
    // Typing clears it: a stale error beside a field the player just fixed reads as still wrong.
    expect(updateForm(noticed, { email: 'a@b.test' }).notice).toBeUndefined();
  });

  it('signs out to a clean state, optionally with a word about why', () => {
    expect(signedOut().token).toBeUndefined();
    expect(signedOut('Your session expired.').notice).toBe('Your session expired.');
  });
});

/* -------------------------------------------------------------------------- *
 * The mirrored rules
 * -------------------------------------------------------------------------- */

describe('the client’s rules are the server’s rules', () => {
  /*
   * Read out of the server's **source text**, not imported.
   *
   * `viz` may not depend on `server` — it is a static browser bundle and `server` opens a socket
   * and a database — so the honest way to check the mirror is to read the file the rule lives in.
   * That is `experiments/src/validation/documentation.test.ts`'s own method, used here for the same
   * reason: the alternative is a comment claiming the numbers match, which is exactly what a
   * comment cannot promise.
   *
   * The risk is one-directional and worth spelling out. A client rule *looser* than the server's
   * costs a wasted round trip and a clear refusal. A client rule *stricter* refuses something the
   * server would have accepted, and nobody ever finds out, because the request that would have
   * proved it is the one the client never sent.
   */
  const serverSource = (relative: string): string =>
    readFileSync(fileURLToPath(new URL(`../../../server/src/${relative}`, import.meta.url)), 'utf8');

  /*
   * The mirror is now an **absence**, and the direction of the risk is why it is asserted at all.
   *
   * § D241 deleted the password path: sign-in is an emailed link, so `passwordIssues`,
   * `hashPassword`, `passwordMatches` and `SCRYPT_PARAMS` are gone from the server, and there are
   * no bounds left to mirror. Deleting this case would have been the obvious move and the wrong
   * one — it is the case that fails if a password rule ever returns to the server while the client
   * is still an email-only form, which is the same one-directional hazard the block above
   * describes, pointed the other way.
   *
   * `MIN_PASSWORD_LENGTH` and `MAX_PASSWORD_LENGTH` in `menu/account.ts` are orphaned by that
   * deletion and are removed with the account form's own migration to the link flow; this case
   * stops them being re-justified by a rule that no longer exists.
   */
  it('finds no password rule on the server, because sign-in is a link', () => {
    const source = serverSource('accounts/credentials.ts');
    expect(source).not.toContain('password.length');
    expect(source).not.toContain('hashPassword');
    expect(source).not.toContain('SCRYPT_PARAMS');
  });

  it('mirrors the server’s display-name bounds exactly', () => {
    const source = serverSource('http/api.ts');
    expect(source).toContain(`MAX_DISPLAY_NAME = ${String(MAX_DISPLAY_NAME)}`);
    expect(source).toContain(`displayName.length < ${String(MIN_DISPLAY_NAME)}`);
  });
});

/* -------------------------------------------------------------------------- *
 * The claim a client makes about its own run
 * -------------------------------------------------------------------------- */

describe('claimedMetricsOf', () => {
  const WHOLE = Object.freeze({
    meanWaitS: 31.4,
    wait95S: 88.2,
    meanTimeToDestinationS: 60.1,
    pctOverLongWait: 2.5,
    awtIsValid: true,
  });

  it('passes every figure through untouched', () => {
    const result = claimedMetricsOf(WHOLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claimed).toEqual({
      awtS: 31.4,
      wt95S: 88.2,
      ttdMeanS: 60.1,
      pctOverLongWait: 2.5,
      awtIsValid: true,
    });
  });

  it('refuses an unmeasured long-wait share rather than calling it zero', () => {
    /*
     * The defect. `dev/main.ts` wrote `pctOverLongWait ?? 0`, so a share that was never measured —
     * `core` produces `NaN` for a share with no denominator and the recording stores `null` —
     * reached the server as `0`. The server measures the same run, gets `NaN`, and refuses the
     * submission as metrics-that-do-not-reproduce: this product's one accusation, spent on a client
     * fallback.
     */
    const result = claimedMetricsOf({ ...WHOLE, pctOverLongWait: null });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain('never measured');
  });

  it('does not refuse a genuine zero', () => {
    // The distinction the `??` collapsed: nobody waited long is a measurement, and it posts.
    const result = claimedMetricsOf({ ...WHOLE, pctOverLongWait: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claimed.pctOverLongWait).toBe(0);
  });

  it('carries a false awtIsValid rather than hiding it', () => {
    // A saturated run may be submitted; it simply will not be ranked, and the server is the one
    // that says so. Suppressing the flag here would be the client deciding quotability.
    const result = claimedMetricsOf({ ...WHOLE, awtIsValid: false });
    expect(result.ok && result.claimed.awtIsValid).toBe(false);
  });
});
