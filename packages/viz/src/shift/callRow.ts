/**
 * **The report's row for a pinned day's call** — wave AI's press-moment ruling,
 * [§ D1029](../../../../DECISIONS.md).
 *
 * ## What it says
 *
 * One row, after § D982's pair: when the stage called the day, what the player answered and when,
 * and — from the pinned data rather than from any run this sheet made — what the answer they did
 * not choose read on **this crowd**, with the count of moments it was tried at. Then the census the
 * brief used to carry: the standing orders that clear this crowd's day with no press at all
 * (§ D914's `mootUnder`, moved here from the brief by the same ruling, because on the brief it told
 * a player the puzzle could be skipped and here it is a fact about the day they have just played).
 *
 * ## Its own grammar, and what it may not say
 *
 * § D982's pair row keeps its ban lists, and this row is held to them too (`callRow.test.ts`):
 * no verb of cause, no word of estimation, nothing connecting two verdicts. Beyond those, the
 * ruling's honesty lens licensed exactly one new kind of sentence here — *on this crowd, X was tried
 * at N moments from A to B and the day read V at every one* — and only on an admitted pin, only with
 * *this crowd* and a tried count, because there the counterfactual is a measurement rather than an
 * assumption. So the row:
 *
 * 1. names **this crowd** in the sentence that carries the pinned verdicts;
 * 2. states the **tried count** and the **clock range** from `ContractPressDay.call`, never a
 *    literal, and reports the moments past the window that did not read that way as what they are;
 * 3. offers **no mechanism** — no *because*, no *before the queue*, no *in time*, no *too late* —
 *    and **no claim across crowds** — no *always*, no *on this tower*, no *days like this*;
 * 4. closes with {@link PRESS_CALL_ROW_NOTE}, which says what the row's facts are about and what
 *    they are not.
 *
 * `plain` tone on every day, for § D900's reason: a press is not a fault.
 */

import type { RunInterventionConfig, SimTime } from '@elevator-sim/core/browser';

import { PARK_CARS_LOBBY_LABEL, SPREAD_CARS_LABEL, stampVerbOf } from '../live/interventions.js';

import type { ContractPressDay } from './ladder.js';
import type { PressCall } from './pressCall.js';
import type { ReportDiagnosis } from './types.js';

/** The row's id, so a renderer or a test can name it without matching on its words. */
export const PRESS_CALL_ROW_ID = 'press-call';

/**
 * What the row's facts are, and what they are not — the closing clause on every arm.
 *
 * No digit, no word from § D900's causal list or § D982's estimation list.
 */
const PRESS_CALL_ROW_NOTE =
  'Those are runs of this crowd’s day and nothing else: they say nothing about how a day reads for ' +
  'any other crowd, even in this tower.';

/**
 * *Take this call again* — the report's action beside the row, and its note. The label is the
 * ruling's own words; the note says what the press does and nothing about which answer to try.
 * `everyday/reportScreen.ts` draws both exactly when the sheet carries {@link PRESS_CALL_ROW_ID}.
 */
export const PRESS_CALL_AGAIN = Object.freeze({
  label: 'Take this call again',
  /*
   * § D1138 clause 4: the retake is practice. It said only what the press does until the first
   * closed attempt became the one that banks; a retake that banked let the answer this row prints
   * be banked on the next attempt, which is seats B and D's quiz with its key on the next page.
   */
  note:
    'The same day on the same crowd, from an empty record — the stage stops at the call again. ' +
    'It is practice: your week keeps your first attempt at this day.',
});

/** Everything the row reads. The pin is admitted and the day was played as it was measured. */
export interface PressCallRowInput {
  readonly press: ContractPressDay;
  readonly call: PressCall;
  /** The run's log — empty, or the one answer at the call second. */
  readonly interventions: readonly RunInterventionConfig[];
  /** A profile's display name, for the census. */
  readonly nameOf: (dispatcherId: string) => string | undefined;
}

/** A parking verb's own button words, lower-cased for the middle of a sentence. */
function verbLabelOf(kind: string): string {
  const label = kind === 'park-cars-lobby' ? PARK_CARS_LOBBY_LABEL : kind === 'spread-cars' ? SPREAD_CARS_LABEL : kind;
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** `a`, `a and b`, `a, b and c`. */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${String(parts[parts.length - 1])}`;
}

/**
 * The row, or `undefined` when the log is not the day as measured — two presses, a press at another
 * second, or a press that is neither of the pin's two. `shift/ladder.ts#pressDayMeasuredAs` refuses
 * those before this is asked; this refuses them again, so the row cannot print over a run it does
 * not describe even when a caller forgets.
 */
export function pressCallRowOf(
  input: PressCallRowInput,
  clockOf: (simTimeS: SimTime) => string,
): ReportDiagnosis | undefined {
  const { press, call, interventions } = input;
  const measured = press.call;
  if (measured === undefined || press.refused !== undefined) return undefined;
  if (interventions.length > 1) return undefined;
  const answer = interventions[0];
  if (answer !== undefined) {
    if (answer.atS !== call.atS) return undefined;
    if (answer.change.kind !== press.clearedBy && answer.change.kind !== press.missedBy) return undefined;
  }

  const at = clockOf(call.atS);
  const to = clockOf(call.atS + measured.windowS);
  const tried = `at ${String(measured.tried)} moments from ${at} to ${to}`;
  const cleared = verbLabelOf(press.clearedBy);
  const missed = verbLabelOf(press.missedBy);

  let pinned: string;
  if (answer === undefined) {
    pinned =
      `On this crowd, under the tower’s standing order, each parking press was tried ${tried}: ` +
      `with ${cleared} the day read Shift cleared at every one, and with ${missed} it read Shift ` +
      'missed at every one.';
  } else if (answer.change.kind === press.clearedBy) {
    pinned = `On this crowd, under the tower’s standing order, ${missed} was tried ${tried}, and the day read Shift missed at every one.`;
  } else {
    pinned = `On this crowd, under the tower’s standing order, ${cleared} was tried ${tried}, and the day read Shift cleared at every one.`;
  }
  const past =
    measured.holes.length === 0
      ? ''
      : ` Tried on to ${clockOf(call.atS + measured.searchedS)}, ${String(measured.holes.length)} of the ` +
        'later moments did not read that way.';
  const names = press.mootUnder.map((id) => input.nameOf(id) ?? id);
  const census =
    names.length === 0
      ? ''
      : ` With no press at all, ${listOf(names)} clear this crowd’s day.`;

  return {
    id: PRESS_CALL_ROW_ID,
    when: at,
    what:
      answer === undefined
        ? 'The stage called the day, and nothing was pressed'
        : `The stage called the day, and you ${stampVerbOf(answer.change)} at the call`,
    why: `${pinned}${past}${census} ${PRESS_CALL_ROW_NOTE}`,
    tone: 'plain',
  };
}
