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
 *
 * ## A second subject on the same context: the shipped fix-it cases (GitHub issue #570)
 *
 * The same layer one adapter over. The FIXIT adapter drove its own synthetic case, and after
 * § D1011 it drove the shipped cases' verdicts and nothing above them, so every letter, as-built
 * note and diagnosis a player opens was rendered by nothing the search reads. The cases below read
 * the registered adapters back out of `SURFACE_ADAPTERS`, take each expectation from the shipped
 * file or from the screen model's own function, and hold the held cases the other way: a case the
 * list will not open contributes its name and nothing else.
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

import { fixitDiagnosisView } from '../everyday/fixitScreenModel.js';
import { TUTORIAL_CASE_ID } from '../everyday/tutorialModel.js';
import { isOffered } from '../fixit/held.js';
import { opensWithDiagnosis, routeCensusOf } from '../fixit/routeCensus.js';
import type { FixitCase } from '../fixit/types.js';

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

/* -------------------------------------------------------------------------- *
 * GitHub issue #570 — the shipped fix-it cases, as a player opens them
 * -------------------------------------------------------------------------- */

const FIXIT_ADAPTER_ID = 'fixit/engine.ts#classifyOutcome';
const TUTORIAL_ADAPTER_ID = 'everyday/tutorialModel.ts#tutorialWalkthroughViewOf';

/** One adapter's output, `field → text`, read off the registered adapter rather than re-derived. */
function fieldsOf(adapterId: string): ReadonlyMap<string, string> {
  const adapter = SURFACE_ADAPTERS.find((candidate) => candidate.id === adapterId);
  if (adapter === undefined) throw new Error(`no surface adapter is registered as ${adapterId}`);
  return new Map(adapter.render(context).map((text) => [text.field, text.text]));
}

describe('the corpus reads every shipped fix-it case a player opens — issue #570', () => {
  let fixit: ReadonlyMap<string, string>;
  let cases: readonly FixitCase[];
  let offered: readonly FixitCase[];

  beforeAll(() => {
    fixit = fieldsOf(FIXIT_ADAPTER_ID);
    cases = context.shippedFixit.cases.cases;
    offered = cases.filter((entry) => isOffered(entry.id));
  });

  it('seeds every case’s name, a held case’s included, because the rail draws all of them', () => {
    expect(cases.length).toBeGreaterThan(offered.length);
    for (const entry of cases) {
      expect(fixit.get(`shipped(${entry.id}).name`), entry.id).toBe(entry.name);
    }
  });

  it('seeds every offered case’s letter, the building as it stands and the figures’ captions', () => {
    for (const entry of offered) {
      const at = `shipped(${entry.id})`;
      expect(fixit.get(`${at}.brief.complaint`), entry.id).toBe(entry.complaint.text);
      expect(fixit.get(`${at}.brief.complainer`), entry.id).toBe(entry.complaint.complainer);
      expect(fixit.get(`${at}.brief.asBuilt`), entry.id).toBe(entry.asBuilt.note);
      expect(fixit.get(`${at}.brief.symptom`), entry.id).toBe(entry.symptom);
      /* Present exactly where the parser derived a disclosure, absent where it derived none. */
      expect(fixit.get(`${at}.brief.demand`), entry.id).toBe(entry.demandDisclosure);
      entry.figures.forEach((figure, index) => {
        expect(fixit.get(`${at}.figure[${String(index)}].label`), entry.id).toBe(figure.label);
      });
      expect(fixit.get(`${at}.row.complaint.label`), entry.id).toContain(entry.complaint.measure.label);
      expect(fixit.get(`${at}.row.replication.label`), entry.id).toContain(entry.complaint.measure.label);
    }
  });

  it('seeds every offered case’s diagnosis card in the words both surfaces print', () => {
    const schedule = context.shippedFixit.cases.schedule;
    let opened = 0;
    for (const entry of offered) {
      const at = `shipped(${entry.id})`;
      const census = routeCensusOf(entry.id);
      const shown = fixitDiagnosisView({ entry, schedule, asked: true, census, explained: false });
      expect(fixit.get(`${at}.diagnosis.shown.text`), entry.id).toBe(shown.text);
      expect(fixit.get(`${at}.diagnosis.explained.text`), entry.id).toBe(entry.diagnosis.text);
      expect(fixit.get(`${at}.diagnosis.explained.note`), entry.id).toBe(entry.diagnosis.reasoning);
      /* The census sentence exactly where the census opens the card, and nowhere else. */
      expect(fixit.has(`${at}.diagnosis.shown.because`), entry.id).toBe(opensWithDiagnosis(entry.id));
      if (opensWithDiagnosis(entry.id)) opened += 1;
    }
    /* Or the clause above only ever watched the absent side. */
    expect(opened).toBeGreaterThan(0);
  });

  it('seeds the tenancy cohorts, their reasons and their positions on the cases that author one', () => {
    const authoring = offered.filter((entry) => (entry.asBuilt.tenancy?.cohorts.length ?? 0) > 0);
    expect(authoring.length).toBeGreaterThan(0);
    for (const entry of authoring) {
      for (const cohort of entry.asBuilt.tenancy?.cohorts ?? []) {
        const where = `shipped(${entry.id}).tenancy.${cohort.id}`;
        expect(fixit.get(`${where}.name`), entry.id).toBe(cohort.name);
        expect(fixit.get(`${where}.reason`), entry.id).toBe(cohort.reason);
        for (const position of cohort.positions) {
          expect(fixit.get(`${where}.option(${position.id})`), entry.id).toBe(position.name);
        }
      }
    }
  });

  it('and seeds nothing of a held case beyond its name, since neither surface opens one', () => {
    const held = cases.filter((entry) => !isOffered(entry.id));
    expect(held.length).toBeGreaterThan(0);
    for (const entry of held) {
      const page = [...fixit.keys()].filter(
        (field) => field.startsWith(`shipped(${entry.id}).`) && /\.(brief|figure\[|row|diagnosis|tenancy)/u.test(field),
      );
      expect(page, entry.id).toEqual([]);
    }
  });

  it('seeds the tutorial case’s change and effect under the tutorial’s own surface', () => {
    const entry = cases.find((candidate) => candidate.id === TUTORIAL_CASE_ID);
    const diagnosed = entry?.repairs.find((repair) => repair.role === 'diagnosed');
    expect(diagnosed).toBeDefined();
    const tutorial = fieldsOf(TUTORIAL_ADAPTER_ID);
    expect(tutorial.get(`shipped(${TUTORIAL_CASE_ID}).worked.change`)).toBe(diagnosed?.name);
    expect(tutorial.get(`shipped(${TUTORIAL_CASE_ID}).worked.effect`)).toBe(diagnosed?.effect);
  });
});
