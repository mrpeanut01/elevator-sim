/**
 * **What the day did after the last press** — GitHub issue **#581**, the day report's missing link.
 *
 * ## The finding
 *
 * `docs/43` P3 scored understandability 6 / 10 against a bar of 8, and the assessor named one
 * missing link: *nothing on the career day report says which press moved which figure.* The
 * figures are on the sheet, the presses are on the sheet — `shift/report.ts#metaLinesFor` prints
 * `09:14 · parked the cars in the lobby` for every entry in the run record's log — and the
 * relation between them is drawn nowhere. The **rush** sheet is the product's own proof that such
 * a sentence can be written here: *"over the 90:00 the sheet's trend test measures, it grew 19.8
 * people a minute … 2 of the 3 standing at 12"* is a size and a location in the product's voice.
 *
 * ## Route 2, and the sentence says so on its own face
 *
 * #581 offers two permitted routes and forbids a third. **This module takes route 2 —
 * co-occurrence, stated as co-occurrence** — and {@link AFTER_PRESS_DISCLAIMER} is that choice
 * written into the copy a player reads rather than left in a docstring.
 *
 * Route 1 — re-simulate the same day with the press removed and publish the difference — was
 * considered and rejected **on this repository's own statistical rule rather than on cost**. The
 * day does re-simulate in under two seconds, so the run is obtainable; what is not obtainable is
 * the claim. A counterfactual pair is **one replication**, and `CLAUDE.md`'s discipline is
 * explicit: *never declare one dispatcher better than another without a paired-t confidence
 * interval that excludes zero*, budgeting 50–200 replications, because ten produced a 12 % error
 * against the converged mean in the reference study. A single with/without pair on one seed
 * published under the word *moved* would be exactly the confident nonsense that rule exists to
 * stop — and a day report is not a bench. The surface that may answer *is this better?* is the
 * bench, which is where `shift/report.ts`' own next-step pointer already sends a reader.
 *
 * So the honest thing this sheet can say is **when** and **how much**, and that is what the rush
 * line the assessor praised says too: it reports a size and a location and never claims the wave
 * caused it.
 *
 * ## The rules this beat keeps, which are `shift/trouble.ts`'s rules on a smaller surface
 *
 * 1. **No mean, of anything.** Every figure is a count of people or a clock time, so R3's
 *    `suppressed-mean` class has nothing to sit beside and R13's *estimate without n* has no
 *    estimate to catch. That is structural here rather than a habit: `observationsAt`'s
 *    `waitingNow` and `carried` are counts of legs, and this module reads nothing else.
 * 2. **Every figure carries the cohort it is over.** *44 people standing* is people standing at
 *    that instant; *118 people delivered* is deliveries between the two clock times. Both are said
 *    in the sentence rather than implied by its position.
 * 3. **The window is the player's, and nothing else is inside it.** The beat names the **last**
 *    press and runs to the end of the run, so no other press falls in the window it reports. With
 *    more than one press it says how many came earlier, because a reader who cannot see the other
 *    presses would read this window as the whole day's.
 * 4. **No verb of cause.** *moved*, *because*, *caused*, *thanks to* and *made* are absent by
 *    construction and `afterPress.test.ts` fails on any of them, so the refusal is pinned by a run
 *    rather than by this paragraph.
 *
 * ## Why it is a diagnosis row rather than a new field
 *
 * `shift/report.ts#diagnosisFor`'s own docstring records issue #56: a `report-window` row was
 * removed from that section because it was a **methodology footnote** wearing a timestamp —
 * word-for-word identical on a flawless day and a collapsed one, and nothing happened at the clock
 * it carried. This row is the other kind. Something did happen at its clock: the player pressed a
 * control, and the record holds the second they pressed it. A day nobody touched draws no row at
 * all, which is the same shape `interventionLogOf` already has (`[]` for an empty log, never a
 * placeholder line).
 *
 * The route choice, the rejection of route 1 and the four rules above are
 * [§ D900](../../../../DECISIONS.md) — an entry rather than this docstring alone, because the row
 * binds `shift/report.ts`'s diagnosis section, whose own docstring had read *two rows, both of
 * them events* since issue #56, and reaches `dev/reportPanel.ts`, `everyday/reportScreen.ts` and
 * `render/reportCard.ts` without any of them being asked.
 */

import type { RunInterventionConfig, SimTime } from '@elevator-sim/core/browser';

import type { VizRecording } from '../contract/types.js';
import { stampVerbOf } from '../live/interventions.js';
import { observationsAt } from '../live/observations.js';

import type { ReportDiagnosis } from './types.js';

/** The row's id, so a renderer or a test can name it without matching on its words. */
export const AFTER_PRESS_ROW_ID = 'after-press';

/**
 * **Which claim this row is making, in the copy itself** — #581's *"say which route in the copy"*.
 *
 * Three clauses and each is load-bearing. The first says what the reading is not: nothing here ran
 * the day without the press, so nothing here measures the press. The second and third say why the
 * sheet does not simply go and measure it, because a reader told *this is not measured* and not
 * told *and here is what measuring it would take* will reasonably assume nobody tried.
 *
 * It names no dispatcher and ranks nothing, so `docs/10` R2's *no comparative claim off one
 * replication* has nothing to catch; and it carries no figure at all, which is deliberate — the
 * numbers are in {@link ReportDiagnosis.what} and the row's own `why` opener, each under the
 * cohort it is over, and a refusal with a number in it is the shape R3 spends its length on.
 */
export const AFTER_PRESS_DISCLAIMER =
  'This is what the day did after the press, not what the press did: the day was not run again ' +
  'without it, so nothing here measures the change. One run either way would not settle it — the ' +
  'bench is where a difference is shown, over many runs of the same crowd.';

/** Said when presses came before the one this row names, so its window is not read as the day's. */
function earlierPressClause(earlier: number): string {
  if (earlier === 0) return '';
  const word = earlier === 1 ? 'press' : 'presses';
  const verb = earlier === 1 ? 'is' : 'are';
  return ` ${String(earlier)} earlier ${word} ${verb} in the log above, outside this window.`;
}

/** `44 people` / `1 person`. */
function people(count: number): string {
  return `${String(count)} ${count === 1 ? 'person' : 'people'}`;
}

/**
 * The beat, or `undefined` when the run has no press to report one for.
 *
 * `undefined` on three states and each is a state rather than a failure: an untouched day, a run
 * whose only presses are stamped at or past its own end (there is no window left to read), and a
 * record whose presses all fall outside its own span. A row is never drawn empty — #581's *"a day
 * with no presses draws no such line and says nothing instead of inventing one"*.
 *
 * The clock is passed in rather than imported, because `shift/report.ts` owns the shift clock and a
 * second mapping from simulated seconds to `HH:MM` would be two answers to *what time is it in this
 * building* — the defect that module's own `clockOf` docstring exists to refuse.
 */
export function afterPressBeatOf(
  recording: VizRecording,
  interventions: readonly RunInterventionConfig[],
  clockRangeOf: (startS: SimTime, endS: SimTime) => string,
): ReportDiagnosis | undefined {
  /*
   * Inside the run's own span, and strictly before its end. A press stamped at `endedAt` has no
   * window after it, and a reading over an empty window would publish `0 people delivered` about a
   * building that was not asked to deliver anybody — a true figure making a false impression,
   * which is the class this sheet's refusals are for.
   */
  const inRun = interventions.filter(
    (entry) => entry.atS >= recording.startedAt && entry.atS < recording.endedAt,
  );
  if (inRun.length === 0) return undefined;
  /*
   * Time order, held here rather than inherited: the log is authored in press order, which is time
   * order for a control that appends at the playhead — `interventionLogOf`'s own defensive copy,
   * and the same argument. The claim is *the last press*, so this module owns the ordering.
   */
  const ordered = [...inRun].sort((a, b) => a.atS - b.atS);
  const last = ordered[ordered.length - 1];
  if (last === undefined) return undefined;

  const then = observationsAt(recording, last.atS);
  const end = observationsAt(recording, recording.endedAt);
  /*
   * Clamped at zero rather than trusted. `carried` is non-decreasing in `t` by construction, so a
   * negative here would be a record whose legs are not sorted — and a sheet printing `-3 people
   * delivered` would be reporting a defect in a vocabulary the player cannot act on.
   */
  const delivered = Math.max(0, end.carried - then.carried);

  return {
    id: AFTER_PRESS_ROW_ID,
    when: clockRangeOf(last.atS, recording.endedAt),
    what: `You ${stampVerbOf(last.change)}, with ${people(then.waitingNow)} standing at the landings`,
    why:
      `${people(end.waitingNow)} were standing when the day ended, and ${people(delivered)} were ` +
      `delivered between those two clock times.${earlierPressClause(ordered.length - 1)} ` +
      AFTER_PRESS_DISCLAIMER,
    /*
     * **Never toned.** A press is not a fault, and `diagnosisRowsOf` paints `bad` and `caution`
     * from this field: a red edge under a sentence that explicitly claims no cause would say, in
     * colour, the thing the words refuse to say. `plain` on every day, cleared or missed.
     */
    tone: 'plain',
  };
}
