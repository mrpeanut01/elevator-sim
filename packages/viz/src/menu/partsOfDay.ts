/**
 * *Which part of the day you run* — the one control that replaced two, derived from `data/`.
 *
 * `DECISIONS.md` § D286. Play-tester issues #78, #80, #81, #82 and #83 are five reports of one
 * thing: the product's unit is a **day** and its only run-shape control was a **length**, so the
 * length had to carry a meaning it could not hold. Four narrative options in the campaign
 * (*Short shift — 15 min*) and five numeric ones in Free play (*15 minutes*) selected the same
 * field; the labels understated the run by up to 1.9×, because a length names the demand schedule
 * and says nothing about the drain; and a longer length **rescaled** the demand curve instead of
 * showing more of the day, so the peak was five minutes at every setting and the rush hour moved.
 *
 * The honest control names what a player is actually choosing. `office-day` is a ten-hour schedule
 * with three peaks in it (§ D276), and `windowStartS`/`windowEndS` (§ D285) runs a part of one
 * without rescaling it. So the options are the day's own periods:
 *
 * ```text
 * Morning rush — 08:30–09:00
 * Lunch — 12:15–12:45
 * Evening — 17:15–17:45
 * Office working day — 08:00–18:00
 * ```
 *
 * ## Nothing here is a list, and the three that could have been are each derived
 *
 * **The intervals** come from the loaded templates' own hours. `rise-and-fall` declares 08:30 and a
 * 30-minute period, `office-day` declares 08:00, so the morning is `[30 min, 60 min)` of the day —
 * and § D276's claim that the day *contains* those three cited periods is what makes that true
 * rather than convenient. § D282 and `openingDurationS` are the precedents: a menu built from a
 * literal is the defect § D213 paid for five times over.
 *
 * **Which candidates survive** is decided by the day's own phase list, not by naming the three that
 * should. A template's hour offers a part when it lands on the day's phase **boundaries** and the
 * day reaches full intensity inside it. That is what excludes `shift-change`, whose 14:45 falls in
 * the middle of the day's flat 13:15–16:15 stretch: an office day has no shift change, and a
 * derivation that admitted it would print a two-peak label over a level. `evening-egress`'s 22:24
 * is outside the day altogether. Both exclusions are structural facts about the record rather than
 * two ids this file knows to skip.
 *
 * **The names** come from the hour. {@link PART_NAMES} is a label for a time of day, not a tunable —
 * it decides no cost and reaches no run — and it is applied to the part's own start, so a day
 * profile that shipped tomorrow with a 06:00 peak would be named without this file changing.
 *
 * ## What a shape template offers, and why it is one option rather than a ladder
 *
 * Its own period, once. A `rise-and-fall` is a 30-minute up-peak; running it for two hours never
 * meant *two hours of morning*, it meant the same triangle stretched over two hours with the same
 * five-minute crest — issue #81. That control is gone rather than relabelled, because relabelling it
 * would have left a player able to pick a different scenario while believing they had picked a time
 * budget. `templateOverrides.durationS` still exists in `core` for a study that wants the refit; it
 * is not a thing a player is offered.
 */

import { clockOf } from '../shift/report.js';

import type { CatalogueTemplate } from './catalogue.js';
import type { DayPart } from './types.js';

/**
 * The word for a time of day. Applied to a part's **start**, and matched on the first row it fits.
 *
 * Not a tunable and not a schema (CLAUDE.md invariant 7 is about things that change a run; this
 * changes a caption). It is here rather than in `data/traffic-profiles.json` because a demand record
 * describes *demand* — a `demandTemplates` row has no rate field and no name for an hour, and adding
 * one would make the reference file carry English.
 *
 * *"Rush"* is warranted rather than decorative: a part exists only where the day reaches its own
 * peak intensity, so every named part is the busiest the building gets, and the one option that is
 * not a peak — the whole period — is named by the template instead.
 */
const PART_NAMES: readonly { readonly beforeS: number; readonly name: string }[] = Object.freeze([
  { beforeS: 11 * 3600, name: 'Morning rush' },
  { beforeS: 14 * 3600, name: 'Lunch' },
  { beforeS: 17 * 3600, name: 'Afternoon' },
  { beforeS: 24 * 3600, name: 'Evening' },
]);

/* -------------------------------------------------------------------------- *
 * The derivation
 * -------------------------------------------------------------------------- */

const MINUTE_S = 60;

/** `08:30–09:00`, or `undefined` when the template declares no hour. */
function clockRangeOf(startOfDayS: number | null, durationS: number): string | undefined {
  if (startOfDayS === null) return undefined;
  return `${clockOf(0, startOfDayS)}–${clockOf(durationS, startOfDayS)}`;
}

/**
 * The sentence under the option. States the demand window and names the tail; predicts neither.
 *
 * See {@link DayPart.detail} for why no end time appears here.
 */
function detailOf(startOfDayS: number | null, durationS: number): string {
  const minutes = Math.round(durationS / MINUTE_S);
  const demand = `${String(minutes)} min of demand`;
  if (startOfDayS === null) {
    return `${demand}, then however long it takes to clear`;
  }
  return `${demand} — ${clockOf(0, startOfDayS)} to ${clockOf(durationS, startOfDayS)}, then however long it takes to clear`;
}

function partOf(
  name: string,
  windowStartS: number | null,
  durationS: number,
  startOfDayS: number | null,
): DayPart {
  const range = clockRangeOf(startOfDayS, durationS);
  return Object.freeze({
    id: `${windowStartS === null ? 'null' : String(windowStartS)}:${String(durationS)}`,
    name,
    label: range === undefined ? name : `${name} — ${range}`,
    detail: detailOf(startOfDayS, durationS),
    windowStartS,
    durationS,
    startOfDayS,
  });
}

/** The label for a part starting at `startOfDayS`. The last row is the fallback, never a throw. */
function nameForHour(startOfDayS: number): string {
  return PART_NAMES.find((row) => startOfDayS < row.beforeS)?.name ?? 'Evening';
}

/**
 * Every part of `templateId`'s period a player may run, shortest-first with the whole period last.
 *
 * Always at least one entry for a template that declares a `durationMin`, because *the whole of it*
 * is always runnable — which is what keeps `menu.test.ts` § *every shipped template can be run at
 * some offered part* a real guard rather than a tautology: it also requires one of the parts to fit
 * inside {@link LONGEST_OFFERED_RUN_S}, and for a ten-hour day only a window does.
 *
 * Returns `[]` for an id the catalogue does not carry, so a stale selection is refused in words by
 * `freePlayIssues` rather than throwing in a render path.
 */
export function partsOfDay(
  templates: readonly CatalogueTemplate[],
  templateId: string,
): readonly DayPart[] {
  const record = templates.find((template) => template.id === templateId);
  if (record === undefined) return Object.freeze([]);
  const periodMin = record.durationMin ?? 0;
  if (periodMin <= 0) return Object.freeze([]);
  const periodS = periodMin * MINUTE_S;
  const hourS = record.startOfDayMin === undefined ? null : record.startOfDayMin * MINUTE_S;

  // Its own name, not a time-of-day word: the whole of a day is not a rush, and the whole of a
  // shape is the period that record *is*.
  const whole = partOf(record.name, null, periodS, hourS);

  const phases = record.phases;
  if (phases === undefined || phases.length === 0 || record.startOfDayMin === undefined) {
    return Object.freeze([whole]);
  }

  // The day's own knots and its own maximum. Both read off the record rather than assumed, so a
  // second day profile with different geometry derives its parts without this file changing.
  const boundaries = new Set<number>([0, ...phases.map((phase) => phase.endMin)]);
  const peak = phases.reduce(
    (highest, phase) => Math.max(highest, phase.startIntensity, phase.endIntensity),
    0,
  );

  const parts: DayPart[] = [];
  for (const other of templates) {
    if (other.id === templateId) continue;
    if (other.startOfDayMin === undefined || other.durationMin === undefined) continue;
    const startMin = other.startOfDayMin - record.startOfDayMin;
    const endMin = startMin + other.durationMin;
    // Inside the day, on its knots, and containing a period the day actually runs at full
    // intensity. The three conditions are what make this a derivation rather than a list: each is
    // a fact about the record, and between them they admit exactly the periods § D276 authored.
    if (startMin < 0 || endMin > periodMin) continue;
    if (!boundaries.has(startMin) || !boundaries.has(endMin)) continue;
    const reachesPeak = phases.some(
      (phase) =>
        phase.startMin >= startMin &&
        phase.endMin <= endMin &&
        Math.max(phase.startIntensity, phase.endIntensity) >= peak,
    );
    if (!reachesPeak) continue;
    parts.push(
      partOf(
        nameForHour(other.startOfDayMin * MINUTE_S),
        startMin * MINUTE_S,
        (endMin - startMin) * MINUTE_S,
        other.startOfDayMin * MINUTE_S,
      ),
    );
  }

  parts.sort((left, right) => (left.windowStartS ?? 0) - (right.windowStartS ?? 0));
  return Object.freeze([...parts, whole]);
}

/** The part `id` names, or `undefined` when the selection no longer matches what is offered. */
export function partById(parts: readonly DayPart[], id: string): DayPart | undefined {
  return parts.find((part) => part.id === id);
}

/** The id a `(windowStartS, durationS)` pair names. The inverse of {@link DayPart.id}. */
export function partIdOf(windowStartS: number | null, durationS: number): string {
  return `${windowStartS === null ? 'null' : String(windowStartS)}:${String(durationS)}`;
}
