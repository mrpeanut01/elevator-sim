/**
 * **What the player is asked, and what they are told afterwards** — GitHub issue #340, and
 * `docs/26-telemetry-and-privacy.md` § 15.2's drafted copy shipped for the first time.
 *
 * Pure: a copy record and two functions from a state to a view. The DOM half is
 * `everyday/shell.ts` for the ask and `everyday/settingsScreen.ts` for the row, which is the split
 * `everyday/settingsView.ts` and `everyday/signInLink.ts` already draw and is what lets every
 * string here enter the honesty corpus without a document.
 *
 * ## The copy is § 15.2's, and where it deviates it says so
 *
 * The heading, the body, the two answers and the line under them are that section's draft
 * unchanged. Three things are added and each is a rule from elsewhere in the same document rather
 * than a new idea:
 *
 * - the **withdrawn** row's sentence about the half that can fail (§ 4.3, drafted in § 15.2);
 * - the **not durable** line, for a device that refuses storage, which is `everyday/profile.ts`'s
 *   existing honesty about the same failure pointed at this slot;
 * - the settings row's own face, which § 15.2's table specifies as words and not as a state.
 *
 * ## What these strings may not contain, and it is checked rather than intended
 *
 * § 4.1's fourth bullet: the consent surface obeys the charter's non-goal 8 — **no section number,
 * no filename, no code identifier** — and may not cite `docs/26` by path. Every string here enters
 * `honesty/surfaces.ts`, where `internal-notation` is the property that decides it, so the rule is
 * a run rather than a paragraph.
 *
 * § 10 non-goal 3 is the other one: no pre-tick, no *by continuing you agree*, no asymmetric
 * buttons, no repeated asking after a refusal, no consent wall. The first four are shapes rather
 * than strings and the view expresses them by construction — {@link ConsentAskView} carries two
 * answers with no default and no ordering claim, and there is no field on it a caller could use to
 * make one of them look like the way forward.
 *
 * ## These words are drafted and **have not been reviewed by a lawyer**
 *
 * `docs/26`'s own front matter carries the product owner's condition, stated on GitHub issue #202:
 * *"no sentence in it may be published to a player, quoted in a privacy notice, put on a consent
 * surface, or relied on as a compliance position until a qualified professional has reviewed it and
 * the review is recorded here."* § 15.2's draft is Part B, and this module is that draft shipped as
 * code.
 *
 * **Nothing here enforces the condition, and pretending otherwise would be worse than saying so.**
 * A flag nobody can honestly set today would leave the whole surface unreachable, which is the dead
 * seam this repository keeps paying for; and a gate on the transport would be a rule about
 * deployments wearing a rule about words. What actually decides whether a person sees these
 * sentences is whether a build is served to people, which is a human act — so the condition is
 * recorded where a human will meet it (`docs/26` § 11, `RISKS.md` R31) rather than simulated here.
 *
 * The code is correct whatever the reviewer says. If the wording changes, this file changes and the
 * honesty corpus re-reads it; if the posture changes, `consent.ts` and `recorder.ts` are where that
 * lands. What must not happen is this surface being **shown** before the review — and that is a
 * decision about serving a build, not about a constant.
 */

import type { TelemetryConsent } from './consent.js';

/**
 * § 15.2's draft, and the two sentences that are load-bearing rather than decorative.
 *
 * **`body` says what is collected in the player's own vocabulary** — § 4.1, using the restatement
 * rule in `docs/23` § 1.4: a figure may be renamed or restated, never softened. *"Which screens you
 * reach and how long you play"* is a restatement; *"help us improve"* is a request with the content
 * removed.
 *
 * **`notCollected` is what makes the ask credible**, and § 4.1 requires it: the short form of § 2.2's
 * list belongs on the surface. Every clause in it is a refusal the schema actually enforces —
 * nothing typed can reach a field, there is no account id on a row, no geolocation, no fingerprint
 * and no third party — rather than a promise this module is making on somebody else's behalf.
 *
 * **`later`'s verb is `asks` rather than `deletes`**, which § 15.2 calls out: the local half is
 * immediate and the server half is a request that can fail, so a consent screen promising deletion
 * outright would make exactly the promise § 13.4's third requirement refuses.
 */
export const CONSENT_COPY = Object.freeze({
  heading: 'Can we count how the game is going?',
  body:
    'We would like to record which screens you reach, how long you play, and which building and ' +
    'settings each run used. It stays on our own server and goes nowhere else.',
  notCollected:
    'We do not record anything you type, your name, your email address, where you are, or what ' +
    'you do on any other site. Saying no changes nothing about the game — every mode, every ' +
    'screen and every number works exactly the same.',
  no: 'No',
  yes: 'Yes, count it',
  later:
    'You can change this later in Settings. Turning it off there also asks us to delete what was ' +
    'already recorded.',
} as const);

/**
 * The settings row — § 15.2's table, as words.
 *
 * `label` is the row's name and never changes. `on` and `off` are the two faces the pill draws, and
 * they say what is happening rather than naming a feature: a player reading *off* has to be able to
 * tell that nothing is being recorded without knowing what the row is called.
 *
 * `withdrawnNote` is the one sentence in this module that can lie, and § 4.3 requires it to say so.
 * Blunt, and true: the local half is immediate, and the request to delete what already reached the
 * server can fail. The clause about ageing out is the retention horizon said in the player's units
 * rather than as a number of days, which is § 15.5's rule for the published notice applied one
 * surface early.
 */
export const CONSENT_ROW_COPY = Object.freeze({
  label: 'Counting how the game is going',
  note:
    'Which screens you reach and how long you play. Never anything you type, and never your ' +
    'name or address.',
  on: 'on',
  off: 'off',
  withdrawnNote:
    'Off. The local half is immediate. Deleting what reached our server is a request, and if you ' +
    'were offline it may not have arrived — in that case it is deleted when it ages out.',
  notDurable:
    'This browser will not let the game remember your answer, so it will ask again next time. ' +
    'Nothing is being recorded in the meantime.',
} as const);

/** The ask, or nothing. `undefined` on every state but `unasked` — § 10 non-goal 3, no second ask. */
export interface ConsentAskView {
  readonly heading: string;
  readonly body: string;
  readonly notCollected: string;
  /** The two answers. Equally easy to give and equally easy to reach; neither is a default. */
  readonly no: string;
  readonly yes: string;
  readonly later: string;
}

/** The settings row, on every state including `unasked`. */
export interface ConsentRowView {
  readonly label: string;
  readonly note: string;
  /** The pill's face — the row's `on`/`off` word. */
  readonly value: string;
  /** Whether the pill draws filled, which is the same fact the word carries. Never the only one. */
  readonly on: boolean;
}

/**
 * The ask, drawn only while the question has not been put.
 *
 * `undefined` on `granted`, `refused` **and** `withdrawn`, which is § 10 non-goal 3's *no repeated
 * asking after a refusal* — and the third of those is why this is a function of the whole state
 * rather than a boolean: a player who has withdrawn has answered, and asking them again would be
 * the nag that turns a question into a toll.
 */
export function consentAskViewOf(state: TelemetryConsent): ConsentAskView | undefined {
  if (state !== 'unasked') return undefined;
  return Object.freeze({
    heading: CONSENT_COPY.heading,
    body: CONSENT_COPY.body,
    notCollected: CONSENT_COPY.notCollected,
    no: CONSENT_COPY.no,
    yes: CONSENT_COPY.yes,
    later: CONSENT_COPY.later,
  });
}

/**
 * The settings row, on every state.
 *
 * `unasked` and `refused` draw the same face — off, and nothing recorded — because they are the
 * same fact about the product even though they are different facts about the player. `withdrawn`
 * draws off with the sentence that says what withdrawal did and did not reach.
 *
 * `notDurable` replaces the note rather than sitting beside it, and that ordering is the honest
 * one: a browser that will not remember the answer is a more important thing to say than what the
 * row records, because it is the reason the answer will be asked for again.
 */
export function consentRowViewOf(state: TelemetryConsent, durable = true): ConsentRowView {
  const on = state === 'granted';
  const note = !durable
    ? CONSENT_ROW_COPY.notDurable
    : state === 'withdrawn'
      ? CONSENT_ROW_COPY.withdrawnNote
      : CONSENT_ROW_COPY.note;
  return Object.freeze({
    label: CONSENT_ROW_COPY.label,
    note,
    value: on ? CONSENT_ROW_COPY.on : CONSENT_ROW_COPY.off,
    on,
  });
}
