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

import type { RunInterventionConfig } from '@elevator-sim/core/browser';

import { clockAt } from './timeline.js';

/**
 * The control's label, imperative because it is a button and not a caption. One entry per
 * `InterventionChange` arm; a second arm (dispatcher switching) adds its own beside this one.
 */
export const PARK_CARS_LOBBY_LABEL = 'Park the cars in the lobby';

/**
 * What the stage says a change *did*, past tense, keyed by the change kind. Not exported: the
 * sentence a player reads is the stamp, and two exports for one sentence would be two places for
 * it to drift apart.
 */
const STAMP_VERBS: Readonly<Record<RunInterventionConfig['change']['kind'], string>> =
  Object.freeze({
    'park-cars-lobby': 'parked the cars in the lobby',
  });

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
  return `${clockAt(latest.atS, dayStartS)} · ${STAMP_VERBS[latest.change.kind]}`;
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
 * {@link STAMP_VERBS}, shared {@link clockAt}, so the sheet and the stage can never disagree about
 * what a press was called or when it landed. The sort is a defensive copy in time order — the log
 * is authored in press order, which is time order for a control that appends at the playhead, but
 * the sheet's claim is *in time order* and it holds that claim itself rather than inheriting it.
 *
 * `[]` for an empty log, never a placeholder line: a day the player did not touch reads exactly as
 * it always did, and *"no interventions"* would be a caption over nothing (`docs/10` R3's blank,
 * inverted — {@link interventionStampOf}'s own rule, kept).
 */
export function interventionLogOf(
  interventions: readonly RunInterventionConfig[],
  dayStartS?: number | undefined,
): readonly string[] {
  return [...interventions]
    .sort((a, b) => a.atS - b.atS)
    .map((entry) => `${clockAt(entry.atS, dayStartS)} · ${STAMP_VERBS[entry.change.kind]}`);
}
