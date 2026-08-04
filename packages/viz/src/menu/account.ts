/**
 * The account screen's state, and the checks the player is told about **before** a request is sent.
 *
 * Pure, like everything else in this directory: a form whose validation lives in a `submit` handler
 * is validation no test drives.
 *
 * ## Why the rules are duplicated from the server, and why that is not a violation
 *
 * The server refuses a nine-character password (`accounts/credentials.ts`) and it must, because the
 * client is not trusted with anything. The rules here are a **courtesy**, not a gate: they tell a
 * player what is wrong without a round trip. So the duplication is deliberate and its risk is
 * one-directional — a client rule that is *stricter* than the server's would refuse something the
 * server accepts and there would be no way to find out, which is why {@link MIN_PASSWORD_LENGTH}
 * and {@link MAX_DISPLAY_NAME} are asserted equal to the server's own constants in
 * `account.test.ts` rather than merely written to match.
 */

import type { AccountSummary } from './client.js';

/* -------------------------------------------------------------------------- *
 * The rules, mirrored from the server
 * -------------------------------------------------------------------------- */

/** `packages/server/src/accounts/credentials.ts` — `passwordIssues`. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;
/** `packages/server/src/http/api.ts` — `displayNameIssues`. */
export const MIN_DISPLAY_NAME = 2;
export const MAX_DISPLAY_NAME = 32;

/* -------------------------------------------------------------------------- *
 * State
 * -------------------------------------------------------------------------- */

/** Which half of the account screen the player is looking at. */
export type AccountMode = 'sign-in' | 'register';

export interface AccountForm {
  readonly mode: AccountMode;
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

export const EMPTY_FORM: AccountForm = Object.freeze({
  mode: 'sign-in',
  email: '',
  displayName: '',
  password: '',
});

/**
 * Who is signed in, and what the last request said.
 *
 * `token` is held in memory only. It is deliberately **not** written to `localStorage`: this is a
 * static app served from disk in development, a stored bearer token survives every tab on the
 * origin, and the product's entire benefit from persisting it is not retyping a password.
 */
export interface AccountState {
  readonly form: AccountForm;
  readonly token: string | undefined;
  readonly user: AccountSummary | undefined;
  /** The last thing the screen has to say — an error from the server, or a confirmation. */
  readonly notice: string | undefined;
  /** True while a request is in flight, so the panel can disable its buttons. */
  readonly busy: boolean;
}

export const SIGNED_OUT: AccountState = Object.freeze({
  form: EMPTY_FORM,
  token: undefined,
  user: undefined,
  notice: undefined,
  busy: false,
});

/* -------------------------------------------------------------------------- *
 * Reducers
 * -------------------------------------------------------------------------- */

export function updateForm(state: AccountState, patch: Partial<AccountForm>): AccountState {
  // The password is cleared when the mode changes, not carried across. A player switching from
  // "sign in" to "create an account" has changed what they are doing, and a field they cannot see
  // holding a value they typed for something else is how the wrong secret gets submitted.
  const mode = patch.mode ?? state.form.mode;
  const cleared = mode === state.form.mode ? {} : { password: '' };
  return Object.freeze({
    ...state,
    form: Object.freeze({ ...state.form, ...cleared, ...patch }),
    notice: undefined,
  });
}

export function signedIn(state: AccountState, token: string, user: AccountSummary): AccountState {
  return Object.freeze({
    ...state,
    token,
    user,
    busy: false,
    // The password is dropped from state the moment it is no longer needed. Keeping it would put
    // it in every subsequent render's closure for no purpose at all.
    form: Object.freeze({ ...state.form, password: '' }),
    notice: user.confirmed
      ? undefined
      : 'Check your email to confirm your address. You can play now; posting a score needs the ' +
        'address confirmed.',
  });
}

export function signedOut(notice?: string): AccountState {
  return Object.freeze({ ...SIGNED_OUT, ...(notice === undefined ? {} : { notice }) });
}

export function withNotice(state: AccountState, notice: string): AccountState {
  return Object.freeze({ ...state, notice, busy: false });
}

export function busy(state: AccountState, value: boolean): AccountState {
  return Object.freeze({ ...state, busy: value });
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
 */
export function formIssues(form: AccountForm): readonly FormIssue[] {
  const issues: FormIssue[] = [];
  const email = form.email.trim();
  if (email.length === 0) {
    issues.push({ field: 'email', message: 'Enter your email address.' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    // Minimal on purpose. A regex claiming to implement RFC 5321 rejects addresses that work, and
    // the confirmation mail is the real check — it either arrives or it does not.
    issues.push({ field: 'email', message: 'That does not look like an email address.' });
  }

  if (form.password.length < MIN_PASSWORD_LENGTH) {
    issues.push({
      field: 'password',
      // Says what is required and why it is length rather than punctuation: composition rules push
      // people to `Password1!`, which is not what makes a secret strong.
      message: `Use at least ${String(MIN_PASSWORD_LENGTH)} characters. A long phrase beats a short mangled word.`,
    });
  } else if (form.password.length > MAX_PASSWORD_LENGTH) {
    issues.push({ field: 'password', message: `Keep it under ${String(MAX_PASSWORD_LENGTH)} characters.` });
  }

  if (form.mode === 'register') {
    const name = form.displayName.trim();
    if (name.length < MIN_DISPLAY_NAME) {
      issues.push({ field: 'displayName', message: 'Pick a name to appear on the boards.' });
    } else if (name.length > MAX_DISPLAY_NAME) {
      issues.push({
        field: 'displayName',
        message: `A display name is at most ${String(MAX_DISPLAY_NAME)} characters.`,
      });
    }
  }
  return Object.freeze(issues);
}

/** Whether the form can be sent. Never a reason to skip the server's own check. */
export function canSubmitForm(state: AccountState): boolean {
  return !state.busy && formIssues(state.form).length === 0;
}

/**
 * Whether this player may post a score, and the sentence to show when they may not.
 *
 * Returns the **reason** rather than a boolean, because the two cases a player hits — not signed in,
 * and signed in but unconfirmed — need different words and a boolean would collapse them into one
 * disabled button with no explanation.
 */
export function postingRefusal(state: AccountState): string | undefined {
  if (state.token === undefined || state.user === undefined) {
    return 'Sign in to post this run to a leaderboard.';
  }
  if (!state.user.confirmed) {
    return 'Confirm your email address to post a score. Everything else works meanwhile.';
  }
  return undefined;
}
