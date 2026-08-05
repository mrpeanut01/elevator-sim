/**
 * The client and the account form, driven over a transport that never touches a socket.
 *
 * Every interesting case here is a **failure**: a server that is down, a body that is not JSON, a
 * 422 that must not read as an accusation, a 2xx in a shape this build does not understand, a link
 * that has already been spent, a budget that has already been charged. A client tested only on its
 * happy path has demonstrated the half nobody was worried about.
 *
 * Two blocks earn their keep beyond that. The mirrored-rules block asserts the client's validation
 * against the **server's own source**, so a client rule cannot drift stricter than the server it is
 * a courtesy for — and one of its cases is an **absence**, which is the shape that survives a
 * deletion. The last block is a lexical sweep for a password field anywhere in the viewer, because
 * § D241 deleted the password path and *deleted* is a claim about every file rather than about the
 * two that were edited.
 */

import { readFileSync, readdirSync } from 'node:fs';
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
  MAX_DISPLAY_NAME,
  MIN_DISPLAY_NAME,
  SIGNED_OUT,
  canSubmitForm,
  formIssues,
  linkRequested,
  linkRetryInMsOf,
  namingStage,
  pending,
  postingRefusal,
  rateLimited,
  retryAllowed,
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

const USER = { id: 'u1', email: 'ada@example.test', displayName: 'Ada', displayNameChosen: true };
const UNNAMED = { ...USER, displayName: 'player-9f2c1a4b7e05', displayNameChosen: false };

/** A signed-in state, without going through the wire to get one. */
const signedInAs = (user = USER): ReturnType<typeof signedIn> => signedIn(SIGNED_OUT, 'session', user);

/* -------------------------------------------------------------------------- *
 * The client
 * -------------------------------------------------------------------------- */

describe('the leaderboard client', () => {
  it('sends the bearer token on the calls that need one, and not on the ones that do not', async () => {
    const { transport, seen } = scripted({ status: 200, body: { user: USER } });
    const client = createClient('https://elevator.example/', transport);
    await client.me('session-token');
    await client.setDisplayName('session-token', 'Ada');
    await client.requestLink('ada@example.test');
    await client.redeem('a-mailed-token');
    expect(seen[0]?.token).toBe('session-token');
    expect(seen[1]?.token).toBe('session-token');
    // Neither half of signing in has a session yet. A bearer header on these would be a token from
    // some other account travelling with a request about this one.
    expect(seen[2]?.token).toBeUndefined();
    expect(seen[3]?.token).toBeUndefined();
    // The trailing slash on the origin is normalised rather than doubled.
    expect(seen[0]?.url).toBe('https://elevator.example/api/me');
  });

  it('puts a mailed link token in the POST body and never in the URL', async () => {
    /*
     * § D241 § 4. A token in a query string reaches access logs, ingress traces and `Referer`, and
     * this one mints a session. The fragment keeps it out of the request the *browser* makes; this
     * keeps it out of the request the *client* makes, which is the half this file owns.
     */
    const { transport, seen } = scripted({ status: 200, body: { token: 's', user: USER } });
    await createClient('https://x', transport).redeem('sekrit-link-token');
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.url).toBe('https://x/api/auth/redeem');
    expect(seen[0]?.url).not.toContain('sekrit-link-token');
    expect(seen[0]?.body).toEqual({ token: 'sekrit-link-token' });
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
      body: { error: 'invalid-address', issues: ['an email address is required'] },
    });
    const result = await createClient('https://x', transport).requestLink('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-address');
    expect(result.issues).toEqual(['an email address is required']);
  });

  it('refuses a 2xx whose shape it does not understand', async () => {
    const { transport } = scripted({ status: 200, body: { something: 'else' } });
    const result = await createClient('https://x', transport).redeem('a-token');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // A silent `undefined` here would reach the screen where a name should be.
    expect(result.code).toBe('unexpected-response');
  });

  it('refuses a 202 with no sentence in it rather than inventing “check your email”', async () => {
    // The one wording the server owns outright: it is identical whether or not the address has an
    // account, and it is the only place the expiry is put into words. A client that supplied a
    // fallback would be a second answer to *how long have I got*.
    const { transport } = scripted({ status: 202, body: { ok: true, expiresInMs: 900_000 } });
    const result = await createClient('https://x', transport).requestLink('ada@example.test');
    expect(result.ok).toBe(false);
    if (result.ok) return;
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
 * The three ways a link fails, and the one way a budget does
 * -------------------------------------------------------------------------- */

describe('a sign-in link that cannot be spent', () => {
  const REFUSALS = [
    ['link-expired', 'That sign-in link has expired. Ask for a new one — they are good for a few minutes.'],
    ['link-spent', 'That sign-in link has already been used. Each one works once; ask for a new one.'],
    ['link-invalid', 'That sign-in link is not valid. Ask for a new one.'],
  ] as const;

  for (const [code, detail] of REFUSALS) {
    it(`carries ${code} as its own reason, and quotes no token`, async () => {
      /*
       * All three are 400 and all three are distinguished, because *whether asking again will help*
       * differs between them — expired and spent both mean *ask again*, invalid means *that is not
       * one of ours*. Collapsing them would be one sentence for three different next actions.
       */
      const { transport } = scripted({ status: 400, body: { error: code, detail } });
      const result = await createClient('https://x', transport).redeem('sekrit-link-token');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe(code);
      expect(result.detail).toBe(detail);
      // Never, on any path. A refusal that echoed the token would put a credential on the screen
      // and into whatever the player pastes it into.
      expect(JSON.stringify(result)).not.toContain('sekrit-link-token');
    });
  }

  it('answers a GET on the redeem route as a method problem, not as a bad link', async () => {
    // § D241 § 4: the 405 exists so *"a fetch of this path consumed nothing"* is said out loud. A
    // client that folded it into `link-invalid` would tell a player their link was broken when a
    // scanner had merely looked at it.
    const { transport } = scripted({
      status: 405,
      body: {
        error: 'method-not-allowed',
        detail: 'Sign-in links are redeemed with a POST. A GET here does nothing and consumes nothing.',
      },
    });
    const result = await createClient('https://x', transport).redeem('t');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('method-not-allowed');
    expect(result.detail).toContain('consumes nothing');
  });

  it('reads the retry duration out of a 429, and only out of a 429', async () => {
    const { transport } = scripted({
      status: 429,
      body: {
        error: 'too-many-link-requests',
        detail: 'Too many sign-in links have been asked for. Try again shortly, and check your inbox meanwhile.',
        retryInMs: 540_000,
      },
    });
    const result = await createClient('https://x', transport).requestLink('ada@example.test');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(linkRetryInMsOf(result)).toBe(540_000);
    /*
     * § D242 § 4: the refusal names a duration and does **not** say which of the two budgets was
     * spent, because *"this address has had too many"* is the enumeration oracle by a longer route.
     * The client must not helpfully add that back.
     */
    expect(result.detail).not.toMatch(/this address|that address|your address/iu);
  });

  it('ignores a retryInMs that arrives on some other refusal', async () => {
    // The gate it feeds disables the form. A stray field on an unrelated 400 must not be able to
    // switch that on — the code is checked as well as the value.
    const { transport } = scripted({
      status: 400,
      body: { error: 'invalid-address', detail: 'no', retryInMs: 60_000 },
    });
    const result = await createClient('https://x', transport).requestLink('nope');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(linkRetryInMsOf(result)).toBeUndefined();
  });

  it('ignores a 429 whose duration is missing or nonsense', async () => {
    for (const retryInMs of [undefined, 'soon', 0, -1, Number.NaN]) {
      const { transport } = scripted({
        status: 429,
        body: { error: 'too-many-link-requests', detail: 'Too many.', retryInMs },
      });
      const result = await createClient('https://x', transport).requestLink('ada@example.test');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      // A gate held open by `NaN` milliseconds is a form that never comes back.
      expect(linkRetryInMsOf(result), JSON.stringify(retryInMs)).toBeUndefined();
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Naming yourself
 * -------------------------------------------------------------------------- */

describe('choosing a display name', () => {
  it('reports a taken name as taken — the one thing a taken address is never reported as', async () => {
    /*
     * The asymmetry is § D241 § 7's, and it is deliberate rather than inconsistent: a display name
     * is printed on every board, so it is already public and saying it is taken leaks nothing. An
     * address is not, which is why `requestLink` answers identically either way.
     */
    const { transport } = scripted({
      status: 409,
      body: { error: 'name-taken', detail: 'That display name is already in use on a board.' },
    });
    const result = await createClient('https://x', transport).setDisplayName('session', 'Ada');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('name-taken');
    expect(result.detail).toContain('already in use');
  });

  it('passes the server’s field issues through instead of restating the bounds', async () => {
    const { transport } = scripted({
      status: 400,
      body: {
        error: 'invalid-display-name',
        issues: ['a display name may not contain control characters'],
      },
    });
    const result = await createClient('https://x', transport).setDisplayName('session', 'ab');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(['a display name may not contain control characters']);
  });

  it('reports an expired session as the server words it, on both account routes', async () => {
    const { transport } = scripted({
      status: 401,
      body: { error: 'not-signed-in', detail: 'Sign in to change your name.' },
    });
    const client = createClient('https://x', transport);
    for (const result of [await client.me('stale'), await client.setDisplayName('stale', 'Ada')]) {
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('not-signed-in');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The cold start — half a minute is a healthy response, not a failure
 * -------------------------------------------------------------------------- */

describe('a request that takes as long as a cold start', () => {
  it('is waited for rather than abandoned', async () => {
    /*
     * § D243 § 4 measured **28.7 s** for a cold `GET /api/challenges` against the live app, because
     * the Container App runs at `minReplicas: 0`. A client-side deadline would turn that into
     * `unreachable` — *"the leaderboard server could not be reached"* — about a server that is
     * reachable and starting, which is the worst available wording: it is wrong, and it tells the
     * player to give up.
     */
    let release: (response: TransportResponse) => void = () => undefined;
    const transport: Transport = async () =>
      new Promise<TransportResponse>((resolve) => {
        release = resolve;
      });

    let settled: unknown;
    const inFlight = createClient('https://x', transport)
      .challenges()
      .then((result) => {
        settled = result;
      });

    // Several turns of the microtask queue: anything that was going to give up on its own would
    // have done so by now, because there is nothing in this module that could wait for a clock.
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    expect(settled).toBeUndefined();

    release({ status: 200, body: { currentId: 'c1', recent: [] } });
    await inFlight;
    expect((settled as { ok: boolean }).ok).toBe(true);
  });

  it('has no deadline in its source at all', () => {
    // The property above is about one call; this is about every future edit. Asserted over the code
    // with comments removed, because this file's docstrings talk about the very thing it forbids.
    const code = withoutComments(readFileSync(moduleFile('./client.ts'), 'utf8'));
    for (const forbidden of ['AbortController', 'AbortSignal', 'setTimeout', 'signal:']) {
      expect(code, `menu/client.ts must not ${forbidden}`).not.toContain(forbidden);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The account form
 * -------------------------------------------------------------------------- */

describe('the account form', () => {
  it('asks for an address and nothing else while signed out', () => {
    // There is one field, because there is one door. § D241 § 7: a form that asked for a name only
    // when the address was new would tell the person filling it in whether the address was new.
    expect(formIssues(SIGNED_OUT).map((issue) => issue.field)).toEqual(['email']);
    const typed = updateForm(SIGNED_OUT, { email: 'ada@example.test' });
    expect(formIssues(typed)).toEqual([]);
  });

  it('refuses an address that is not one, in the server’s own shape', () => {
    for (const email of ['nope', 'a b@c.test', 'a@b', `${'x'.repeat(250)}@b.test`]) {
      expect(formIssues(updateForm(SIGNED_OUT, { email })).map((issue) => issue.field), email).toEqual([
        'email',
      ]);
    }
  });

  it('asks for a name only once signed in and only while the server says it is unchosen', () => {
    expect(namingStage(SIGNED_OUT)).toBe(false);
    expect(namingStage(signedInAs())).toBe(false);
    const unnamed = signedInAs(UNNAMED);
    expect(namingStage(unnamed)).toBe(true);
    // Derived from the flag on the wire, never from the *shape* of the generated name — a client
    // that recognised `player-<hex>` would be a second place deciding what one looks like, and it
    // would stop being true the first time the generator changed.
    expect(namingStage({ ...unnamed, user: { ...UNNAMED, displayNameChosen: true } })).toBe(false);
    expect(formIssues(unnamed).map((issue) => issue.field)).toEqual(['displayName']);
  });

  it('mirrors the display-name bounds without inventing a stricter one', () => {
    const unnamed = signedInAs(UNNAMED);
    const named = (displayName: string): readonly string[] =>
      formIssues(updateForm(unnamed, { displayName })).map((issue) => issue.field);
    expect(named('A')).toEqual(['displayName']);
    expect(named('Ab')).toEqual([]);
    expect(named('x'.repeat(MAX_DISPLAY_NAME))).toEqual([]);
    expect(named('x'.repeat(MAX_DISPLAY_NAME + 1))).toEqual(['displayName']);
    // The server's reason, kept: this string is drawn on every board, and a name carrying a bidi
    // override is a name that rearranges somebody else's row.
    expect(named('Ada‮')).toEqual(['displayName']);
  });

  it('has no password in it, in any state, anywhere', () => {
    /*
     * The inverted assertion, at the level of the state rather than the type. § D241 deleted the
     * password path; issue #30 is what a *half*-deleted one costs — a live `<input type="password">`
     * wired to nothing is a keystroke collector by accident, and people reuse passwords.
     */
    const states = [
      SIGNED_OUT,
      updateForm(SIGNED_OUT, { email: 'ada@example.test', displayName: 'Ada' }),
      linkRequested(SIGNED_OUT, { detail: 'If that address can receive mail…', expiresInMs: 900_000 }),
      signedInAs(),
      signedInAs(UNNAMED),
      rateLimited(SIGNED_OUT, 'Too many.', 60_000),
    ];
    for (const state of states) {
      expect(Object.keys(state.form).sort()).toEqual(['displayName', 'email']);
      expect(JSON.stringify(state)).not.toMatch(/password/iu);
    }
  });

  it('shows the server’s 202 unchanged, and claims nothing about whether the account existed', () => {
    const detail =
      'If that address can receive mail, a sign-in link is on its way. It works once and expires in 15 minutes.';
    const state = linkRequested(updateForm(SIGNED_OUT, { email: 'ada@example.test' }), {
      detail,
      expiresInMs: 900_000,
    });
    expect(state.notice).toBe(detail);
    expect(state.linkSent).toBe(true);
    // The 202 is byte-identical for an address the server has never seen. A client that added
    // "welcome back" or "account created" would rebuild the oracle in prose.
    expect(state.notice).not.toMatch(/welcome back|created|new account|already have/iu);
  });

  it('does not say a link was sent when the server refused to send one', () => {
    // A player told to check their inbox for a message that was never sent waits forever, and then
    // asks for another link they are also not allowed to have.
    const state = rateLimited(updateForm(SIGNED_OUT, { email: 'a@b.test' }), 'Too many.', 540_000);
    expect(state.linkSent).toBe(false);
    expect(state.retryInMs).toBe(540_000);
    expect(canSubmitForm(state)).toBe(false);
    // ...and the gate lifts on its own rather than leaving a dead form.
    expect(canSubmitForm(retryAllowed(state))).toBe(true);
  });

  it('will not submit while a request is in flight', () => {
    const ready = updateForm(SIGNED_OUT, { email: 'a@b.test' });
    expect(canSubmitForm(ready)).toBe(true);
    expect(canSubmitForm(pending(ready, 'Asking for a sign-in link…'))).toBe(false);
  });

  it('can be busy and have something to say at the same time', () => {
    // The cold-start case: `withNotice` ends a request, so a screen that could only use it had to
    // choose between saying nothing for half a minute and pretending the request had finished.
    const waiting = pending(updateForm(SIGNED_OUT, { email: 'a@b.test' }), 'Still going.');
    expect(waiting.busy).toBe(true);
    expect(waiting.notice).toBe('Still going.');
  });

  it('prompts for a name exactly once, and not at all for a player who has one', () => {
    expect(signedInAs(UNNAMED).notice).toMatch(/name that goes on the boards/u);
    expect(signedInAs().notice).toBeUndefined();
    // The prompt is a prompt, not a gate: § D241 § 5 removed the last thing this surface had to
    // withhold, so an unnamed player is refused nothing.
    expect(postingRefusal(signedInAs(UNNAMED))).toBeUndefined();
  });

  it('tells a signed-out player to sign in, and says what signing in costs', () => {
    const refusal = postingRefusal(SIGNED_OUT);
    expect(refusal).toMatch(/Sign in/u);
    // Said here because it is the moment somebody decides whether to bother, and "no password" is
    // the part that changes the answer.
    expect(refusal).toMatch(/no password/u);
  });

  it('keeps a notice until the player types again', () => {
    const noticed = withNotice(SIGNED_OUT, 'That sign-in link has expired. Ask for a new one.');
    expect(noticed.notice).toBeDefined();
    // Typing clears it: a stale error beside a field the player just fixed reads as still wrong.
    expect(updateForm(noticed, { email: 'a@b.test' }).notice).toBeUndefined();
  });

  it('signs out to a clean state, optionally with a word about why', () => {
    expect(signedOut().token).toBeUndefined();
    expect(signedOut('That sign-in link has already been used.').notice).toBe(
      'That sign-in link has already been used.',
    );
    // A failed redemption must not leave a half-signed-in state behind it.
    expect(signedOut('x').user).toBeUndefined();
    expect(signedOut('x').linkSent).toBe(false);
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
   * `MIN_PASSWORD_LENGTH` and `MAX_PASSWORD_LENGTH` in `menu/account.ts` were orphaned by that
   * deletion and have gone with the account form's migration to the link flow; this case stops them
   * being re-justified by a rule that no longer exists.
   */
  it('finds no password rule on the server, because sign-in is a link', () => {
    const source = serverSource('accounts/credentials.ts');
    expect(source).not.toContain('password.length');
    expect(source).not.toContain('hashPassword');
    expect(source).not.toContain('SCRYPT_PARAMS');
  });

  it('finds no route this client could still be calling', () => {
    // The other half of the same deletion, and the half a *client* can get wrong: `/api/register`,
    // `/api/login` and `/api/confirm` are gone, so a client still offering them would draw a form
    // whose button 404s. Asserted over the route table rather than over the client, because the
    // client's absence proves nothing about what the server stopped answering.
    const source = serverSource('http/api.ts');
    for (const route of ['/api/register', '/api/login', '/api/confirm']) {
      expect(source, `${route} is gone; nothing may call it`).not.toContain(`'POST ${route}'`);
    }
    for (const route of ['/api/auth/request-link', '/api/auth/redeem', '/api/me/display-name']) {
      expect(source, `${route} is the replacement`).toContain(`'POST ${route}'`);
    }
  });

  it('mirrors the server’s display-name bounds exactly', () => {
    const source = serverSource('http/api.ts');
    expect(source).toContain(`MAX_DISPLAY_NAME = ${String(MAX_DISPLAY_NAME)}`);
    expect(source).toContain(`displayName.length < ${String(MIN_DISPLAY_NAME)}`);
  });

  it('mirrors the server’s address rule character for character', () => {
    /*
     * The one place a stricter client would silently refuse a real person. Both ends spell the same
     * deliberately-minimal expression — one `@`, something either side, no spaces — and the reason
     * is written on the server: a regex claiming to implement RFC 5321 rejects addresses that work,
     * and the mail is the real check.
     */
    const shape = String.raw`/^[^\s@]+@[^\s@]+\.[^\s@]+$/u`;
    expect(serverSource('http/api.ts')).toContain(shape);
    expect(readFileSync(moduleFile('./account.ts'), 'utf8')).toContain(shape);
    // The length bound too: 254 on the server, and a client that used 200 would refuse addresses
    // that work.
    expect(serverSource('http/api.ts')).toContain('trimmed.length > 254');
  });
});

/* -------------------------------------------------------------------------- *
 * No password field anywhere in the viewer — the tripwire for § D241
 * -------------------------------------------------------------------------- */

describe('the viewer has no password field', () => {
  /**
   * Every non-test module under `packages/viz/src`, with comments blanked.
   *
   * The whole package rather than the two files that were edited, because *deleted* is a claim
   * about the tree. Issue #30's field lived in a **panel**, not in the model that fed it, so a
   * sweep scoped to `menu/` would have passed while the password box was still on screen.
   */
  function viewerModules(): readonly { readonly path: string; readonly code: string }[] {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const out: { path: string; code: string }[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test-helper.ts')) continue;
        out.push({ path: path.slice(root.length), code: withoutComments(readFileSync(path, 'utf8')) });
      }
    };
    walk(root);
    return out;
  }

  it('declares no password input, label or field type in any shipped module', () => {
    /*
     * A string literal that *is* the word, rather than a mention of it: `'password'` as an input
     * type, `'Password'` as a label, `'password'` as a form key. Prose that talks about there being
     * no password — which several modules now do, deliberately — is a longer sentence and does not
     * match.
     */
    const offenders = viewerModules()
      .filter((module) => /(['"`])[Pp]assword\1/u.test(module.code))
      .map((module) => module.path);
    expect(
      offenders,
      'a password field is a keystroke collector when it is wired to nothing — § D241 deleted the path',
    ).toEqual([]);
  });

  it('declares no password input in the page itself', () => {
    const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
    expect(html).not.toMatch(/type\s*=\s*["']?password/iu);
  });

  it('positive control: the sweep reads enough modules to mean something', () => {
    // Without this the rule above passes when the walk reads nothing, which is the shape of a
    // harness reporting "no failures" for every case.
    const modules = viewerModules();
    expect(modules.length).toBeGreaterThan(60);
    expect(modules.map((module) => module.path)).toContain('/dev/menuPanel.ts');
    expect(modules.map((module) => module.path)).toContain('/menu/account.ts');
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

/* -------------------------------------------------------------------------- *
 * Reading source, which two blocks above do
 * -------------------------------------------------------------------------- */

function moduleFile(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

/**
 * Blank every comment, keeping the offsets stable enough to test against.
 *
 * Needed because both source-reading blocks assert about things this package **discusses at
 * length**: `menu/client.ts`'s docstring explains why it sets no `AbortSignal`, and half a dozen
 * modules now explain that there is no password. A scan that read comments would report the
 * explanation as the offence.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/gu, '$1 ');
}
