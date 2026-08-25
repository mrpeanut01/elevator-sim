/**
 * The corpus renders what the product renders — GitHub issue #272, one layer over.
 *
 * ## Why this file exists rather than another axis
 *
 * `RISKS.md` **R26**: *a suite built entirely from fixtures cannot distinguish "the mechanism is
 * correct" from "the mechanism is reached."* The honesty search is exactly such a suite — it
 * renders shipped expressions and judges the **strings**, so a surface that calls a shipped helper
 * with an input the product never passes produces a corpus that is internally honest about a screen
 * nobody can open. Every one of the ten properties would stay green, because each of them is a
 * predicate over the strings and not over the call.
 *
 * That is not hypothetical here. [§ D364](../../../../DECISIONS.md) made
 * `shift/calendar.ts#spokenForCarsOf` the one answer to *which cars has today already taken?* and
 * fixed the three callers that build a run. `honesty/surfaces.ts` was outside that lane's files, so
 * it kept omitting {@link CalendarPatchInput.event} — and `calendar.ts`'s own docstring says what
 * that costs, by name:
 *
 * > The one caller that omits it is `honesty/surfaces.ts`, which renders captions for the string
 * > corpus rather than building a run; on `garden-apartments` that makes it render a caption the
 * > product would not produce.
 *
 * ## What is asserted, and what it is derived from
 *
 * Every shipped period, on both days the adapter drives, rendered by the **adapter itself** — read
 * back out of `SURFACE_ADAPTERS` rather than re-implemented — and compared against `calendarPatch`
 * called the way a run builder calls it. The expectation is the shipped helper's own output, never a
 * transcribed string: a period whose wording changes moves both sides together, and only a period
 * whose *decision* differs can separate them.
 *
 * The inputs are transcribed (the split, the template, the run length), and that is safe in the one
 * direction that matters: if they ever drift from the adapter's, the equality below fails loudly
 * rather than quietly agreeing about a day neither side is describing.
 *
 * ## The clause that keeps it from being vacuous
 *
 * Four of the five shipped periods reserve no car, and on four of the five shipped buildings a bank
 * has cars to spare — so on most cells the two derivations agree whatever the surface passes, and a
 * test that only checked equality could pass while watching nothing. The last clause requires the
 * omission to still be **detectable**: on `garden-apartments`, whose only bank has two cars, the
 * event-bearing and event-less derivations must disagree, in the caption and in the refusal.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { DirectionalSplit } from '@elevator-sim/core/browser';

import {
  CALENDAR_PERIODS,
  CALENDAR_PERIOD_IDS,
  calendarDayFor,
  calendarLine,
  calendarPatch,
  periodOnDays,
  scheduledEventFor,
  type CalendarPeriodId,
} from '../shift/calendar.js';

import { caseFromSeed, contextFor, type HonestySpace } from './index.js';
import { loadHonestyResources } from './resources.test-helper.js';
import { SURFACE_ADAPTERS, type HonestyContext } from './surfaces.js';
import { STANDARD_SPACE } from './generate.js';

/**
 * One building, one short run, one batch of two.
 *
 * `garden-apartments` because it is the cell where the omission bites — its main bank has two cars,
 * so `move-in`'s derate takes the only car a period could reserve — and because it is the cheapest
 * building this repository ships. The rest of the space is `STANDARD_SPACE`'s, so the case is one
 * the always-on corpus could itself have drawn.
 */
const CALENDAR_SPACE: HonestySpace = Object.freeze({
  ...STANDARD_SPACE,
  buildingIds: Object.freeze(['garden-apartments']),
  minDurationS: 600,
  maxDurationS: 600,
  minReplications: 2,
  maxReplications: 2,
});

/**
 * The adapter's own inputs, transcribed from `surfaces.ts#CALENDAR_AND_FABRIC`.
 *
 * Transcribed rather than exported: a helper on `surfaces.ts` reachable only from here would be a
 * new export with no non-test caller, which is the standing requirement's own subject. Drift is
 * caught by the equality clause rather than by a second sentence.
 */
const SPLIT: DirectionalSplit = { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 };
const TEMPLATE = 'rise-and-fall';
const RUN_LENGTH_S = 1800;
const DAYS = [1, 6] as const;

const ADAPTER_ID = 'shift/calendar.ts#calendarLine';

let context: HonestyContext;
let rendered: ReadonlyMap<string, string>;

beforeAll(async () => {
  const { resources } = await loadHonestyResources();
  context = contextFor(caseFromSeed(1, { space: CALENDAR_SPACE }), resources);
  const adapter = SURFACE_ADAPTERS.find((candidate) => candidate.id === ADAPTER_ID);
  if (adapter === undefined) throw new Error(`no surface adapter is registered as ${ADAPTER_ID}`);
  rendered = new Map(adapter.render(context).map((text) => [text.field, text.text]));
}, 600_000);

/**
 * The `field → text` entries the calendar block would seed for one period, from the shipped helper.
 *
 * Only the two fields the patch decides — the line and the refusals. The period's own name and
 * note, and the day's event name and note, are the adapter's other seeds and are not this file's
 * subject: they are copied off `CALENDAR_PERIODS` and `SHIFT_EVENTS` and cannot disagree with a run.
 *
 * A seed whose text is blank is **dropped**, because `singleRun` drops it — a period that does not
 * apply today (`quarter-end` is the business week, so its Saturday is byte-identical to no period)
 * seeds `''` for its line and the corpus carries nothing. Reproducing that here is what makes the
 * comparison a comparison of what the search actually reads.
 */
function shippedCalendarFields(id: CalendarPeriodId, withEvent: boolean): Map<string, string> {
  const fields = new Map<string, string>();
  const placed = periodOnDays(CALENDAR_PERIODS[id], 1, 7);
  for (const day of DAYS) {
    const dayIdx = (day - 1) % 7;
    const today = calendarDayFor(placed, day, dayIdx);
    const patch = calendarPatch({
      day: today,
      building: context.building,
      split: SPLIT,
      demandTemplateId: TEMPLATE,
      demandTemplates: context.trafficProfiles.demandTemplates,
      runLengthS: RUN_LENGTH_S,
      ...(withEvent ? { event: scheduledEventFor(placed, day, dayIdx) } : {}),
    });
    const prefix = `period.${id}.day${String(day)}`;
    const line = today === null ? '' : calendarLine(patch);
    if (line.trim() !== '') fields.set(`${prefix}.line`, line);
    for (const [index, withheld] of patch.withheld.entries()) {
      if (withheld.trim() !== '') fields.set(`${prefix}.withheld[${String(index)}]`, withheld);
    }
  }
  return fields;
}

/** The same entries, read back off the registered adapter rather than re-derived. */
function corpusCalendarFields(id: CalendarPeriodId): Map<string, string> {
  const wanted = new RegExp(`^period\\.${id}\\.day\\d+\\.(line|withheld\\[\\d+\\])$`, 'u');
  return new Map([...rendered].filter(([field]) => wanted.test(field)));
}

describe('the corpus’s calendar caption is the one the product would publish — issue #272', () => {
  for (const id of CALENDAR_PERIOD_IDS) {
    it(`agrees on ${id}`, () => {
      expect(corpusCalendarFields(id)).toEqual(shippedCalendarFields(id, true));
    });
  }

  /*
   * Or every clause above is watching nothing. `garden-apartments`' main bank has two cars, so
   * `carsToDerate` may take exactly one — the same car `move-in`'s derate takes — and `reserveCars`
   * never empties a bank. Step over it and the period reserves none and files a refusal; omit it
   * and the caption claims a reservation the run would not make.
   *
   * Both days, because they fail differently: Monday asks for one car and Saturday's override asks
   * for two, so the omission costs a whole reservation on one and half of one on the other.
   */
  it('and the omission is still detectable, or the clauses above prove nothing', () => {
    const withEvent = shippedCalendarFields('moving-week', true);
    const without = shippedCalendarFields('moving-week', false);

    expect(withEvent).not.toEqual(without);
    expect(without.get('period.moving-week.day1.line')).toContain('1 car reserved');
    expect(withEvent.get('period.moving-week.day1.line')).not.toContain('car reserved');
    expect(without.get('period.moving-week.day1.withheld[0]')).toBeUndefined();
    expect(withEvent.get('period.moving-week.day1.withheld[0]')).toContain('could reserve 0');
    expect(without.get('period.moving-week.day6.withheld[0]')).toContain('could reserve 1');
    expect(withEvent.get('period.moving-week.day6.withheld[0]')).toContain('could reserve 0');
  });
});
