/**
 * The honesty card (design L6, `:146–160`) — and the *show me the maths* disclosure behind it.
 *
 * ## What this card is for
 *
 * It is the one place on the screen that says, in words, whether the run's estimates may be
 * quoted. `UX.md` § 7.1 rule 4 and `docs/10` R9 make `meansAreSuppressed` the single gate for
 * *may I show this*, and `frame/overlay.ts` already owns it — this module reads it and never
 * recomputes it. Three copies of that rule is three chances to keep two of them, which is
 * precisely how the canvas came to draw `mean wait so far 87.7 s` on the line under the
 * `SATURATED — AWT suppressed` banner it had drawn itself.
 *
 * ## The engineer's maths is the real rule, and the prototype's is not
 *
 * The design's disclosure reads *"queue length rose by N persons over the reporting window against
 * thresholds of 8 persons and 0.5/min"*, where `N` is `Math.max(0, waiting - 8)` — a number
 * computed from the screen rather than from the run. It is a prototype placeholder and it is not
 * reproduced. What is printed instead:
 *
 * - **When suppressed**, `summary.awtInvalidReason` **verbatim**. `core` already writes an
 *   excellent sentence there, naming which of the four grounds fired and with what numbers, and
 *   paraphrasing it here would create a second account of a refusal — the failure mode this card
 *   exists to prevent, one level up. When the flag is set with no reason (the saturation-only
 *   path), the same sentence `overlayAt` falls back to is used, so the two surfaces cannot
 *   disagree about a refusal they are both reporting.
 * - **When not suppressed**, which gates passed and over what window, from the summary's own
 *   fields: `reportWindow`, `windowSeconds`, `waitCount`, `unservedCount`, `pctOverLongWait`,
 *   `longWaitThresholdS` and `serviceLevel`. Every figure is a count, a threshold or a longest
 *   wait; not one of them is a mean. R13 is honoured in the sentence — the `n` is stated beside
 *   the window, because *"the gates passed"* over five legs is a different claim from over four
 *   hundred, and Garden Apartments at `collective`, seed 42 is the measured case: a legitimately
 *   quotable AWT computed over **five** legs.
 *
 * ## Why casual and engineer can disagree about the glyph — and where that stopped being true
 *
 * They are answering different questions and the design says so — *casual gets a lever, not a
 * lecture*. Casual asks **is the building coping right now**, which is an observation at the
 * playhead. Engineer asks **may I quote this run's averages**, which is a verdict on the whole
 * run. A building that is coping at 04:12 of a run that saturated later shows `✓` to a casual
 * reader and `⚠` to an engineer, and both are true. What neither of them ever does is show a
 * mean.
 *
 * **That argument holds for every playhead inside the run and fails at the last one.** *"Is the
 * building coping right now"* has no useful answer once there is no *now* left: a run that
 * completes runs on until the last passenger is delivered, so its final frame has an empty lobby by
 * construction, `fallingBehindAt` is false there whatever happened, and the casual card read
 * `✓ Comfortably keeping up` over a shift that ended `saturated` with 781 of 1 392 riders past the
 * 900 s horizon. That is § 4's line crossed — *"Basic mode may hide complexity. It may never hide a
 * failure"* — and a refused statistic is on § 4's own never-hide list, which `mode/types.ts`'s
 * `disclosureClassOf` states as `suppression → must-show`. The casual card was the one **mounted**
 * surface where that clause was not kept.
 *
 * So the card takes a {@link WaitBandBasis} like the mood card beside it. On `'now'` nothing has
 * changed. On `'whole-run'` the casual card answers **did it cope**, which is the run's own verdict
 * rather than a second opinion about it: the same `meansAreSuppressed` gate the engineer reads, in
 * casual words. R3's *"Basic mode may shorten the reason; it may not remove it"* is then kept in
 * both halves — casual shortens the refusal to one sentence, and the verbatim reason is still one
 * control away behind *show me the maths*. See [`DECISIONS.md` § D239](../../../../DECISIONS.md).
 *
 * ## The prototype's `waiting > 40`, re-sourced
 *
 * The design keys its casual copy on `st.waiting > 40 && st.bands[3] > 0` — a queue deeper than
 * forty *and* somebody past two minutes. The shape is right and the `40` is an invented constant:
 * forty is a crowd in Garden Apartments and a quiet second on Vertical City. It is replaced by one
 * of the run's own observations — `handlingCapacity.offeredPer5Min`, the number of people who
 * arrive every five minutes. A queue larger than five minutes' worth of arrivals is a queue the
 * lifts are not clearing, on any building, and it is a count rather than an estimate.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { meansAreSuppressed } from '../frame/overlay.js';

import { WAIT_BANDS, waitBandsAt } from './bands.js';
import { hhmm, timeOfDayAt } from './timeline.js';
import type { DisclosureMode, HonestyCard, WaitBandBasis } from './types.js';

/**
 * `overlayAt`'s own fallback sentence, for a run flagged saturated with no written reason.
 *
 * Kept identical to the string in `frame/overlay.ts` deliberately: the two surfaces report the
 * same refusal and a reader who sees both must not be told two things. It is duplicated rather
 * than imported because `overlayAt` builds it inline; if a third caller ever needs it, it moves
 * to `overlay.ts` and both import it.
 */
const SATURATION_SENTENCE =
  'the run saturated: the queues did not reach a steady state, so a mean wait describes nothing.';

/*
 * The card's wash and rule, one pair per verdict — § D251.
 *
 * These were `rgba(224,176,64,…)` and `rgba(63,178,127,…)`: the **dark** values of `--band-1` and
 * `--band-0`, written out, and put on the card by `dev/leftRail.ts` as an inline `background` and
 * `border-color`. Neither shows up in a contrast walk — a wash is not a word — so this copy was
 * the quiet one, and it would have stayed after the three that were measured were fixed. It is
 * the same defect and it is fixed the same way: name the token, and let `color-mix` do what an
 * alpha did.
 */
const WARNING_BG = 'color-mix(in srgb, var(--band-1) 7%, transparent)';
const WARNING_EDGE = 'color-mix(in srgb, var(--band-1) 35%, transparent)';
const CALM_BG = 'color-mix(in srgb, var(--band-0) 6%, transparent)';
const CALM_EDGE = 'color-mix(in srgb, var(--band-0) 28%, transparent)';

/**
 * Is the building falling behind at the playhead? An observation, and only an observation.
 *
 * Two conditions, both counts, both from the run: somebody standing right now is in the worst
 * wait-age band, **and** more people are standing than arrive in five minutes. See the module
 * docstring for why the second replaces the prototype's `waiting > 40`.
 *
 * Exported because the coach ribbon and the alarm chip ask the same question, and a second
 * expression of it in a renderer is the shape of defect this package greps for.
 */
export function fallingBehindAt(recording: VizRecording, simTimeS: SimTime): boolean {
  const bands = waitBandsAt(recording, simTimeS);
  const worstIndex = WAIT_BANDS.length - 1;
  const fuming = bands.counts[worstIndex]?.count ?? 0;
  if (fuming === 0) return false;
  const offered = recording.summary.handlingCapacity.offeredPer5Min;
  if (!Number.isFinite(offered) || offered <= 0) return bands.total > 0;
  return bands.total > offered;
}

/**
 * The card, at a playhead position, in one of the two disclosure modes.
 *
 * `basis` is the mood card's, and it decides **the casual card only**: `'now'` while the playhead
 * is inside the run, `'whole-run'` once it has reached the end. The engineer card reads a verdict
 * about the whole run either way and does not move. The parameter defaults to the live reading so
 * every caller written before it existed keeps the card it had.
 *
 * `dayStartS` is the run's own hour — the value `dev/main.ts` feeds the header clock — and it
 * reaches exactly one string: the maths paragraph's reporting-window range. That range used to
 * take the 06:00 default unconditionally, so on a run whose template declares 08:30 the engineer's
 * card quoted a window on a clock no other surface was showing (`docs/19` defect 2 — one clock
 * per run). `undefined` falls back to the shared `DAY_START_S`, together with every other reader.
 */
export function honestyAt(
  recording: VizRecording,
  simTimeS: SimTime,
  mode: DisclosureMode,
  basis: WaitBandBasis = 'now',
  dayStartS?: number | undefined,
): HonestyCard {
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const suppressed = meansAreSuppressed(recording);
  const fallingBehind = fallingBehindAt(recording, t);
  const engineer = mode === 'engineer';
  const shiftOver = basis === 'whole-run';
  /*
   * Casual reads the playhead while there is one, and the run's own verdict once there is not;
   * engineer reads the verdict throughout. See the module docstring for why the first clause has
   * two halves rather than one.
   */
  const warning = engineer || shiftOver ? suppressed : fallingBehind;

  return {
    basis,
    glyph: warning ? '⚠' : '✓',
    title: engineer
      ? engineerTitle(suppressed)
      : shiftOver
        ? closedTitle(suppressed)
        : casualTitle(fallingBehind),
    plain: engineer
      ? engineerPlain(recording, suppressed)
      : shiftOver
        ? closedPlain(recording, suppressed)
        : casualPlain(fallingBehind),
    hasMaths: engineer,
    maths: engineer ? mathsOf(recording, suppressed, dayStartS) : undefined,
    bg: warning ? WARNING_BG : CALM_BG,
    edge: warning ? WARNING_EDGE : CALM_EDGE,
    warning,
    suppressed,
    fallingBehind,
  };
}

/* -------------------------------------------------------------------------- *
 * Copy
 * -------------------------------------------------------------------------- */

/**
 * The design's casual strings, `:2347–2361` — verbatim but for the second person.
 *
 * ## The one deviation, and why it is a deviation from the handoff *to* the handoff
 *
 * `docs/20` defect 7 found this card telling a spectator *"That one got away from you"* over
 * somebody else's day, and § 14.1 of the same handoff calls that a defect in as many words: *"No
 * first-person copy anywhere in the mode. Not `you`, not `your run`, not `your best`."* Two
 * sections of one canonical document disagree on a watched run, and something has to give.
 *
 * What gives is the pronoun, in **one** register rather than two. The alternative — a spectator arm
 * for every sentence here — doubles the copy of a module whose whole subject is that two accounts of
 * one refusal is the failure mode, and it would leave the player's arm free to acquire a *your* that
 * the watched arm quietly drops. `render/mood.ts` already settled the same question one card over:
 * *"The building"*, never *"you"*. So the card addresses the building and the run, the sentences
 * mean exactly what they meant, and § 14.1 holds here without a branch to keep in step.
 *
 * What is **not** changed is the editorial *we*: the simulator saying *we are withholding* is the
 * product speaking about its own refusal, which is the voice `docs/10` R9 asks for and is not a
 * claim about whose day is on the stage.
 */
function casualTitle(fallingBehind: boolean): string {
  return fallingBehind ? 'The building is falling behind' : 'Comfortably keeping up';
}

function casualPlain(fallingBehind: boolean): string {
  return fallingBehind
    ? 'People are arriving faster than the cars can clear them. Add a shaft, zone the tower, ' +
        'or ride out a rough morning and read the post-mortem.'
    : 'Cars are clearing calls faster than people turn up. Push the traffic pattern harder, or ' +
        'bank the shift and take tomorrow.';
}

/**
 * The casual card once the shift is over — the design has none, because its card only ran live.
 *
 * It answers *did it cope*, and it answers it with the run's own gate rather than with a second
 * opinion about the run: `meansAreSuppressed` is the one authority on whether this shift's averages
 * may be quoted (`docs/10` R9), and a casual reader is entitled to the *fact* of a refusal even
 * though the rule behind it stays behind *show me the maths*.
 */
function closedTitle(suppressed: boolean): string {
  return suppressed ? 'That one got away from the building' : 'The lifts kept up today';
}

/**
 * The casual sentence for a closed shift.
 *
 * The suppressed branch splits the way {@link engineerPlain} splits and for the same measured
 * reason: *the queues never settled* is true of exactly one of the five grounds `awtIsValid` fails
 * on, and *the trend test sees a queue still growing at the horizon, the censoring test sees one
 * that has not cleared by it; neither sees a queue that grew enormously and drained just in time.*
 * So the saturation wording is used only where saturation fired.
 *
 * Neither branch prints a figure. The rail's four stat rows and the mood card beside this one are
 * head counts and carry the numbers; a second copy of a count here would be a second count.
 */
function closedPlain(recording: VizRecording, suppressed: boolean): string {
  if (!suppressed) {
    return (
      'The queues settled, so the shift’s averages are ones the simulator will stand behind. The ' +
      'counts on this rail are what actually happened; read them beside it.'
    );
  }
  if (recording.summary.saturated) {
    return (
      'The queues never settled, so there is no single number for what the wait was — asking for ' +
      'one would only say when we stopped watching. Every count on this rail is real; the ' +
      'average is the thing we are withholding.'
    );
  }
  return (
    'This shift does not pass every check an average has to pass, so the simulator withholds the ' +
    'average rather than printing one nothing could lean on. Every count on this rail is real; ' +
    'switch to Engineer for the rule that refused it.'
  );
}

/** The design's engineer strings, re-keyed onto the flag that actually decides. */
function engineerTitle(suppressed: boolean): string {
  return suppressed
    ? 'We won’t show an average today'
    : 'The numbers here are safe to quote';
}

/**
 * The engineer's plain sentence.
 *
 * The design's suppressed copy opens *"the queues are still growing"*, which is true of exactly
 * one of the four grounds `awtIsValid` fails on. Since Phase 8 the flag also fails on an empty
 * window, on censoring above the unserved limit, and on a leg past the 900 s abandonment horizon —
 * and *the trend test sees a queue still growing at the horizon, the censoring test sees one that
 * has not cleared by it; neither sees a queue that grew enormously and drained just in time*. So
 * the design's opening clause is kept only for the ground it describes, and the other three get a
 * sentence that does not claim a growing queue. The second half — *"the counts above are real; the
 * average is not"* — is the design's and is true of all four.
 */
function engineerPlain(recording: VizRecording, suppressed: boolean): string {
  if (!suppressed) {
    return (
      'Queues are settling rather than piling up, so the averages this run produces are ones the ' +
      'simulator will stand behind.'
    );
  }
  if (recording.summary.saturated) {
    return (
      'The queues are still growing, so an “average wait” would just say when we stopped ' +
      'looking. The counts above are real; the average is not.'
    );
  }
  return (
    'This run does not clear every check an average has to clear, so the average is withheld ' +
    'rather than printed with a caveat. The counts above are real; the average is not.'
  );
}

/* -------------------------------------------------------------------------- *
 * The maths
 * -------------------------------------------------------------------------- */

/**
 * The actual rule, from the summary's own fields. Engineer mode only.
 *
 * Never a mean, in either branch: the suppressed branch quotes `core`'s refusal and the passing
 * branch quotes counts, thresholds and a longest wait. `noMeans.test.ts` asserts that no module in
 * this directory so much as names the three suppressible fields.
 */
function mathsOf(
  recording: VizRecording,
  suppressed: boolean,
  dayStartS?: number | undefined,
): string {
  const s = recording.summary;
  // Not `window`: `boundaries.test.ts` rule 3 forbids a bare identifier of that name anywhere
  // outside `src/dev/`, because the finding that rule actually produced was a local shadowing the
  // DOM global. `RunSummary.window` is what `core` calls the field; nothing here may spell it.
  const reportWindow = s.reportWindow;
  const windowClause =
    `Reporting window ${reportWindow.id}, ` +
    `${hhmm(timeOfDayAt(reportWindow.startS, dayStartS))}–${hhmm(timeOfDayAt(reportWindow.endS, dayStartS))} ` +
    `(${s.windowSeconds.toFixed(0)} s), n = ${String(s.waitCount)} legs.`;

  if (suppressed) {
    // Verbatim. `core` writes this sentence and names the ground that fired; a paraphrase here
    // would be a second account of the same refusal.
    const reason = s.awtInvalidReason ?? SATURATION_SENTENCE;
    return (
      `AWT withheld. The run’s own reason, verbatim: “${reason}” ` +
      `${windowClause} ` +
      `${String(s.unservedCount)} of ${String(s.serviceLevel.arrivalCount)} arrivals had not ` +
      `boarded when it closed; ${String(s.serviceLevel.overHorizonCount)} passed the ` +
      `${s.serviceLevel.horizonS.toFixed(0)} s abandonment horizon.`
    );
  }

  const level = s.serviceLevel;
  const longest =
    level.longestWaitS === null
      ? 'no arrival in the window'
      : `${level.longestWaitS.toFixed(0)} s${level.longestWaitIsCensored ? ' and counting, because that person never boarded' : ''}`;
  const overLong =
    s.pctOverLongWait === null
      ? `nothing served, so no share over ${s.longWaitThresholdS.toFixed(0)} s`
      : `${s.pctOverLongWait.toFixed(1)} % of served legs waited over ${s.longWaitThresholdS.toFixed(0)} s`;

  return (
    `${windowClause} ` +
    'Not saturated — the queue trend test found no growth at the horizon. ' +
    `${String(s.unservedCount)} of ${String(level.arrivalCount)} arrivals unserved when the ` +
    `window closed, and ${String(level.overHorizonCount)} past the ` +
    `${level.horizonS.toFixed(0)} s abandonment horizon. Longest wait ${longest}; ${overLong}. ` +
    'All four of `awtIsValid`’s grounds pass, so this run’s averages are quotable — over that ' +
    'window and that n, and nothing wider.'
  );
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
