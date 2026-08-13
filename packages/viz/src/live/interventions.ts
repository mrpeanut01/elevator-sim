/**
 * The intervention control's words — Everyday Mode slice 3 (contract § 1.4, gameplay § 7.6).
 *
 * A run is the record `{ seed, config, interventions[] }`, and the stage owes the player two
 * sentences about it: the verb on the control (*Park the cars in the lobby*) and the stamp under
 * the header once it has been pressed (`09:14 · parked the cars in the lobby`). Both live here,
 * pure and DOM-free, so the honesty sweep can drive them and `dev/main.ts` only decides which
 * element they go in — the split every panel in `dev/` keeps.
 *
 * ## The stamp is temporal by construction
 *
 * {@link interventionStampOf} answers for a **playhead**, not for the log: it names the latest
 * entry at or before `simTimeS` and nothing later. A player who scrubs back past their own
 * intervention sees the stamp disappear, because at that instant on the stage the intervention
 * has not happened yet — the same rule § D307's temporal axis holds every other surface to, met
 * here by the shape of the function rather than by a guard in the caller.
 *
 * The clock format is {@link clockAt} — the shell's own `hh:mm`, fed the same `dayStartS` the
 * header's clock reads — so the stamp and the clock above it can never disagree about what 09:14
 * means.
 */

import type { InterventionChange, RunInterventionConfig } from '@elevator-sim/core/browser';

import { clockAt } from './timeline.js';

/**
 * The control's label, imperative because it is a button and not a caption. One label per
 * intervention control; {@link switchDispatcherLabelOf} is the second, beside this one.
 */
export const PARK_CARS_LOBBY_LABEL = 'Park the cars in the lobby';

/**
 * The dispatcher-switch control's label — parametric over the *name*, never the id, because the
 * button says what pressing it does and a player is handing the day to *somebody*, not to a key
 * in a data file (gameplay § 16 rule 11: no engine identifiers in the Casual register).
 */
export function switchDispatcherLabelOf(name: string): string {
  return `Hand the rest of the day to ${name}`;
}

/**
 * The stage's `recomputing` beat — contract § 1.4's own requirement, verbatim in intent: a
 * re-simulation above ~400 ms shows this rather than freezing. One sentence, here with the other
 * intervention words so the honesty sweep drives it, and shown by `dev/main.ts` only once the
 * round trip has actually outlived the threshold — a 181 ms building must not flash it.
 */
export const RECOMPUTING_BEAT = 'recomputing the day…';

/**
 * What the stage says a change *did*, past tense, per change kind. Not exported: the sentence a
 * player reads is the stamp, and two exports for one sentence would be two places for it to
 * drift apart. A `switch` with no default, so a fourth `InterventionChange` arm is a compile
 * error here rather than a stamp that renders `undefined` — the exhaustiveness the old
 * `Record<kind, string>` bought, kept across the two arms whose words are parametric:
 * `switch-dispatcher` names the profile's display name (never its id), and `answer-incident`
 * quotes the chosen option's own authored words, so a spectator replaying the record reads the
 * same sentence the player did (§ 20.16 — `atS` is `runIncidentClock`, and the clock beside this
 * verb is how it appears on the report).
 */
function stampVerbOf(change: InterventionChange): string {
  switch (change.kind) {
    case 'park-cars-lobby':
      return 'parked the cars in the lobby';
    case 'switch-dispatcher':
      return `handed the rest of the day to ${change.profile.name}`;
    case 'answer-incident':
      return `answered the incident — ${change.option}`;
  }
}

/**
 * The most recent intervention **as of the playhead**, stamped — `09:14 · parked the cars in the
 * lobby` — or `''` when none has taken effect yet.
 *
 * `''` rather than a placeholder sentence, because an empty log is not a state that needs
 * narrating: the control's own label already says what pressing it would do, and a stamp reading
 * *no interventions yet* would be a caption over nothing (`docs/10` R3's blank, inverted).
 *
 * `dayStartS` follows {@link clockAt}'s contract — the run's own hour, `undefined` falling back
 * to the shared `DAY_START_S` — so a caller holding `trace.startOfDayS` passes it through.
 */
export function interventionStampOf(
  interventions: readonly RunInterventionConfig[],
  simTimeS: number,
  dayStartS?: number | undefined,
): string {
  let latest: RunInterventionConfig | undefined;
  // The log is authored in press order, which is time order for a control that always appends
  // at the playhead; the scan keeps the *last* qualifying entry so two presses at one instant
  // resolve the way the kernel resolves them — the later entry wins (invariant 4's tie rule,
  // read back out).
  for (const entry of interventions) {
    if (entry.atS <= simTimeS) latest = entry;
  }
  if (latest === undefined) return '';
  return `${clockAt(latest.atS, dayStartS)} · ${stampVerbOf(latest.change)}`;
}

/**
 * The whole log, one stamped line per intervention in time order — the filed sheet's record of
 * what the player changed mid-run (`docs/19` defect 10).
 *
 * ## Why this exists beside {@link interventionStampOf} rather than inside it
 *
 * The stamp answers for a **playhead** and deliberately names one entry; the Day report is an
 * account of the **whole day** (§ D223 — a reader who paused at 09:00 has not made the afternoon
 * not happen), so its lines are the whole log and no playhead enters the signature. The two are
 * different claims — *what has taken effect on the stage* against *what this day's record holds* —
 * and folding them into one function would put a playhead parameter on a surface that must not
 * consult one.
 *
 * Each line is the stage's own stamp, verbatim (`09:14 · parked the cars in the lobby`): shared
 * {@link stampVerbOf}, shared {@link clockAt}, so the sheet and the stage can never disagree about
 * what a press was called or when it landed. The sort is a defensive copy in time order — the log
 * is authored in press order, which is time order for a control that appends at the playhead, but
 * the sheet's claim is *in time order* and it holds that claim itself rather than inheriting it.
 *
 * `[]` for an empty log, never a placeholder line: a day the player did not touch reads exactly as
 * it always did, and *"no interventions"* would be a caption over nothing (`docs/10` R3's blank,
 * inverted — {@link interventionStampOf}'s own rule, kept).
 *
 * ## `runIncidentClock` is one of these lines — § 20.16, discharged by unification
 *
 * A campaign incident's answer is an `answer-incident` entry on the same log, stamped with the
 * simulated second it was given, so *"`runIncidentClock` must … appear on the report"* is met by
 * this function doing for that entry exactly what it does for every other: one line, the answer's
 * own clock, the chosen option's own words. There is no second clock and no second renderer to
 * drift from this one.
 */
export function interventionLogOf(
  interventions: readonly RunInterventionConfig[],
  dayStartS?: number | undefined,
): readonly string[] {
  return [...interventions]
    .sort((a, b) => a.atS - b.atS)
    .map((entry) => `${clockAt(entry.atS, dayStartS)} · ${stampVerbOf(entry.change)}`);
}
