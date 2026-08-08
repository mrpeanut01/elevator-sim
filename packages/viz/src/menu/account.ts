/**
 * The account screen's state, and the checks the player is told about **before** a request is sent.
 *
 * Pure, like everything else in this directory: a form whose validation lives in a `submit` handler
 * is validation no test drives.
 *
 * ## There is no password here, and its absence is load-bearing
 *
 * `DECISIONS.md` § D241 replaced the credential with a mailed link, and the password path was
 * **deleted** rather than disabled — on the server and here. So this module has no
 * `MIN_PASSWORD_LENGTH`, no `password` on {@link AccountForm} and nothing that could put one on a
 * screen. Issue #30 is what a half-deleted one costs: a live `<input type="password">` wired to
 * nothing is a keystroke collector by accident, and people reuse passwords.
 *
 * `client.test.ts` asserts the absence from the **server's** source too, in the direction that
 * matters: a password rule returning there while this half is still an email-only form is the
 * failure nobody would notice, because the request that would prove it is the one never sent.
 *
 * ## There is also no *mode*, and that is the same decision seen from the other end
 *
 * Sign in and create-an-account were two buttons over one form (issue #31). Under a mailed link
 * they cannot be two things: asking for a display name **only when the address is new** would tell
 * the person filling in the form whether the address is new, which is exactly the
 * account-enumeration oracle the server's identical-bytes 202 exists to close (§ D241 § 7). So
 * there is one door — type an address, get a link — and the name is asked for afterwards, over a
 * session that already proves the address.
 *
 * ## Why the rules are duplicated from the server, and why that is not a violation
 *
 * The server refuses a one-character display name (`http/api.ts#displayNameIssues`) and it must,
 * because the client is not trusted with anything. The rules here are a **courtesy**, not a gate:
 * they tell a player what is wrong without a round trip. So the duplication is deliberate and its
 * risk is one-directional — a client rule that is *stricter* than the server's would refuse
 * something the server accepts and there would be no way to find out, which is why
 * {@link MAX_DISPLAY_NAME} and the address shape are asserted equal to the server's own in
 * `client.test.ts` rather than merely written to match.
 */

import type { AccountSummary, Failure, LinkRequested } from './client.js';

/* -------------------------------------------------------------------------- *
 * The rules, mirrored from the server
 * -------------------------------------------------------------------------- */

/** `packages/server/src/http/api.ts` — `displayNameIssues`. */
export const MIN_DISPLAY_NAME = 2;
export const MAX_DISPLAY_NAME = 32;

/* -------------------------------------------------------------------------- *
 * State
 * -------------------------------------------------------------------------- */

/**
 * The two fields the whole flow ever collects, and they are never collected at the same time.
 *
 * `email` is asked for signed out. `displayName` is asked for **signed in**, once, when the server
 * says `displayNameChosen === false`. Which of the two is live is derived from the state rather
 * than stored, because a stored answer is a second one — see {@link namingStage}.
 */
export interface AccountForm {
  readonly email: string;
  readonly displayName: string;
}

export const EMPTY_FORM: AccountForm = Object.freeze({
  email: '',
  displayName: '',
});

/**
 * Who is signed in, what has been asked for, and what the last request said.
 *
 * `token` is held in memory only. It is deliberately **not** written to `localStorage`: this is a
 * static app served from disk in development, a stored bearer token survives every tab on the
 * origin, and the benefit from persisting it is now smaller than it ever was — the way back in is
 * a link, not a retyped secret.
 */
export interface AccountState {
  readonly form: AccountForm;
  readonly token: string | undefined;
  readonly user: AccountSummary | undefined;
  /**
   * True once the server has accepted a link request for this address.
   *
   * It says *a link was sent*, never *an account exists* — the 202 that sets it is identical for an
   * address the server has never seen, and a flag that meant anything more would be the oracle
   * rebuilt in the client's own state.
   */
  readonly linkSent: boolean;
  /**
   * How long the server said to wait, when it refused with **429**, or `undefined`.
   *
   * Held rather than discarded because a form that stays live after a rate-limit invites a second
   * request that will also be refused. It is a *duration*, not a deadline: nothing in this module
   * reads a clock, and the shell clears it when the wait is over.
   */
  readonly retryInMs: number | undefined;
  /** The last thing the screen has to say — an error from the server, or a confirmation. */
  readonly notice: string | undefined;
  /** True while a request is in flight, so the panel can disable its buttons. */
  readonly busy: boolean;
}

export const SIGNED_OUT: AccountState = Object.freeze({
  form: EMPTY_FORM,
  token: undefined,
  user: undefined,
  linkSent: false,
  retryInMs: undefined,
  notice: undefined,
  busy: false,
});

/* -------------------------------------------------------------------------- *
 * Which question is being asked
 * -------------------------------------------------------------------------- */

/**
 * Whether this player still owes the boards a name.
 *
 * Derived from the server's flag and never from the *shape* of the name it generated. The server
 * mints `player-<12 hex>` for a new account, and a client that recognised that pattern would be a
 * second place deciding what a generated name looks like — which stops being true the first time
 * the generator changes, silently, on the one screen that would then ask nobody for anything.
 */
export function namingStage(state: AccountState): boolean {
  return state.token !== undefined && state.user !== undefined && !state.user.displayNameChosen;
}

/* -------------------------------------------------------------------------- *
 * Reducers
 * -------------------------------------------------------------------------- */

export function updateForm(state: AccountState, patch: Partial<AccountForm>): AccountState {
  /*
   * **A commit that changes nothing is not an edit** — GitHub issue #106.
   *
   * The panel commits a field on `change`, and a browser fires `change` on blur and again on Enter,
   * so the same string arrives here two and three times over: once when the reader tabs away, once
   * when they press Enter, once more on the blur that follows the button they pressed. Clearing the
   * notice on each of those is the deception below with its sign flipped — it takes *"a link is on
   * its way"* off the screen a beat after the request that earned it, about an address nobody has
   * touched.
   *
   * So the rule is about the string and not about the event: the notice is still about the address
   * in the box for exactly as long as the box says the same thing.
   */
  const changed = (Object.keys(patch) as (keyof AccountForm)[]).some(
    (field) => patch[field] !== undefined && patch[field] !== state.form[field],
  );
  if (!changed) return state;

  /*
   * Changing the address takes back *a link is on its way*, because it is no longer about the
   * address in the box. Leaving it standing would tell somebody who had just corrected a typo to go
   * and check an inbox they do not own.
   *
   * `retryInMs` is deliberately **not** cleared by typing. It is a budget the server has already
   * charged (§ D242), not a fact about the form, and a gate a player could lift by pressing a key
   * would be no gate at all.
   */
  const addressChanged = patch.email !== undefined && patch.email !== state.form.email;
  return Object.freeze({
    ...state,
    form: Object.freeze({ ...state.form, ...patch }),
    ...(addressChanged ? { linkSent: false } : {}),
    notice: undefined,
  });
}

/**
 * The server accepted a link request. Carries **its** sentence, and authors none.
 *
 * The 202's `detail` is the only place the expiry is put into words, and § D241 § 3 sized that
 * number against two measured facts. Rewording it here would be a second answer to *how long have
 * I got*, drifting the first time the server's TTL moves.
 */
export function linkRequested(state: AccountState, requested: LinkRequested): AccountState {
  return Object.freeze({
    ...state,
    linkSent: true,
    retryInMs: undefined,
    busy: false,
    notice: requested.detail,
  });
}

/**
 * The server refused with 429. Carries its sentence and the duration it named.
 *
 * `linkSent` is **not** set: nothing was sent. Reporting "check your email" over a refusal would
 * leave a player waiting for a message that does not exist, which is the failure mode § D242 § 4
 * describes from the server's side.
 */
export function rateLimited(state: AccountState, detail: string, retryInMs: number): AccountState {
  return Object.freeze({ ...state, retryInMs, busy: false, notice: detail });
}

/** The wait named by a 429 is over. The refusal's wording is left alone; only the gate lifts. */
export function retryAllowed(state: AccountState): AccountState {
  return Object.freeze({ ...state, retryInMs: undefined });
}

/**
 * A link was redeemed and a session exists.
 *
 * The one sentence this authors is the naming prompt, and it is authored rather than carried
 * because no server response is about to say it: the 200 from `/api/auth/redeem` is a session, and
 * `displayNameChosen: false` is a fact, not a request.
 */
export function signedIn(state: AccountState, token: string, user: AccountSummary): AccountState {
  return Object.freeze({
    ...state,
    token,
    user,
    linkSent: false,
    retryInMs: undefined,
    busy: false,
    form: Object.freeze({ ...state.form, displayName: user.displayNameChosen ? state.form.displayName : '' }),
    notice: user.displayNameChosen
      ? undefined
      : 'You are signed in. Pick the name that goes on the boards — it is the only thing about you ' +
        'anybody else sees, and you can change it later.',
  });
}

export function signedOut(notice?: string): AccountState {
  return Object.freeze({ ...SIGNED_OUT, ...(notice === undefined ? {} : { notice }) });
}

export function withNotice(state: AccountState, notice: string): AccountState {
  return Object.freeze({ ...state, notice, busy: false });
}

/**
 * A request is in flight, and the screen has something to say while it is.
 *
 * Separate from {@link withNotice}, which ends a request. The server sleeps when nobody is using it
 * and the first call after a quiet spell was measured at 28.7 s (§ D243 § 4), so *busy* and *has a
 * sentence* have to be able to hold at the same time — a spinner with no words beside it for half a
 * minute is indistinguishable from a hang.
 */
export function pending(state: AccountState, notice: string): AccountState {
  return Object.freeze({ ...state, notice, busy: true });
}

/*
 * `busy(state, value)` used to sit here and has been **deleted rather than kept for symmetry**.
 *
 * Every one of its callers set it to `true` and then had no way to say anything while the request
 * ran; the cold start (§ D243 § 4) made that gap visible, {@link pending} closed it, and what was
 * left was an export with no non-test caller. That is the defect this repository has shipped eleven
 * times in code, and `menu/` is not exempt from its own standing rule because the export is small.
 * `withNotice` clears the flag on the way out, so the pair is complete without it.
 */

/* -------------------------------------------------------------------------- *
 * Reading a refusal the client has to act on
 * -------------------------------------------------------------------------- */

/**
 * How long the server said to wait, out of a **429** — or `undefined` for every other failure.
 *
 * `menu/client.ts` carries a refusal's whole body and deliberately does not parse it; this is the
 * one field on this screen that has to be read rather than shown, and it is read here for the same
 * reason `challengeNotOpenOf` reads the 409 next door. The `code` is checked as well as the field,
 * so a stray `retryInMs` on some other refusal cannot silently gate the form.
 */
export function linkRetryInMsOf(failure: Failure): number | undefined {
  if (failure.code !== 'too-many-link-requests') return undefined;
  const body = failure.body as Record<string, unknown> | null | undefined;
  const retry = body?.['retryInMs'];
  return typeof retry === 'number' && Number.isFinite(retry) && retry > 0 ? retry : undefined;
}

/* -------------------------------------------------------------------------- *
 * Validation
 * -------------------------------------------------------------------------- */

export interface FormIssue {
  readonly field: keyof AccountForm;
  readonly message: string;
}

/**
 * Everything wrong with the form, all at once.
 *
 * All at once rather than first-wrong, for the reason `freePlayIssues` gives: a form that reports
 * one problem at a time makes a player guess how many there are.
 *
 * It takes the **state** and not the form, because which field is live is a fact about the session
 * rather than about the two strings: signed out, the address is the question; signed in and unnamed
 * (§ D241 § 7), the name is. Handing it a bare form would have made the caller decide that, which
 * is the split that let issue #31's screen print a sign-in error under a registration form.
 */
export function formIssues(state: AccountState): readonly FormIssue[] {
  const issues: FormIssue[] = [];

  if (namingStage(state)) {
    const name = state.form.displayName.trim();
    if (name.length < MIN_DISPLAY_NAME) {
      issues.push({ field: 'displayName', message: 'Pick a name to appear on the boards.' });
    } else if (name.length > MAX_DISPLAY_NAME) {
      issues.push({
        field: 'displayName',
        message: `A display name is at most ${String(MAX_DISPLAY_NAME)} characters.`,
      });
    } else if (/[\p{Cc}\p{Cf}]/u.test(name)) {
      // The server's own rule and its own reason: this string is drawn on every board, and a name
      // carrying a newline or a bidi override is a name that rearranges somebody else's row.
      issues.push({ field: 'displayName', message: 'A display name cannot contain control characters.' });
    }
    return Object.freeze(issues);
  }

  const email = state.form.email.trim();
  if (email.length === 0) {
    issues.push({ field: 'email', message: 'Enter your email address. A sign-in link is posted to it.' });
  } else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    // Minimal on purpose, and the same expression the server uses. A regex claiming to implement
    // RFC 5321 rejects addresses that work, and the mail is the real check — it either arrives or
    // it does not.
    issues.push({ field: 'email', message: 'That does not look like an email address.' });
  }
  return Object.freeze(issues);
}

/**
 * Whether the form can be sent. Never a reason to skip the server's own check.
 *
 * The 429 gate is here rather than in the panel, so a rate-limited player cannot spend a second
 * request that the server has already said it will refuse — § D242's budgets are per address and
 * per caller, and a form that kept firing would burn both on somebody who did nothing wrong.
 */
export function canSubmitForm(state: AccountState): boolean {
  return !state.busy && state.retryInMs === undefined && formIssues(state).length === 0;
}

/**
 * Whether this player may post a score, and the sentence to show when they may not.
 *
 * Returns the **reason** rather than a boolean, so a screen has words for the refusal instead of a
 * disabled button with nothing beside it.
 *
 * ## It has one arm now, and the deleted one was not a simplification
 *
 * It used to have two: not signed in, and signed in but *unconfirmed*. § D241 § 5 deleted the
 * second along with `confirmed`, and the argument is worth keeping where the gate was rather than
 * only in the decision log. The confirmation gate existed because a password issues a session to
 * somebody who has never proved they can read the address. A mailed link cannot do that — the
 * session was minted by redeeming a token that arrived at the address — so the flag would have been
 * `true` for every account that could ever reach this function, and the branch would have been an
 * authorization check that cannot fire.
 *
 * **An unnamed player is deliberately not refused here.** `player-a1b2c3…` on a board is ugly and
 * honest; a run that cannot be posted until a form is filled in is a gate, and § D241 § 5's whole
 * point is that there is nothing left for this surface to gate.
 */
export function postingRefusal(state: AccountState): string | undefined {
  if (state.token === undefined || state.user === undefined) {
    return 'Sign in to post this run to a leaderboard. It takes an email address and no password: ' +
      'a link is emailed to you, and opening it signs you in.';
  }
  return undefined;
}
