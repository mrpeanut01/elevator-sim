/**
 * A window selects part of a day and draws nobody new — `DECISIONS.md` § D285.
 *
 * `traffic/dayStartIdentity.test.ts` proved that giving a template an *hour* moves nothing. This is
 * the file for the field that made the hour selectable, and it has the harder job, because a window
 * **does** change a run: that is the point of it. So the property is not *"nothing moved"* but a
 * pair of them, and each is asserted by a run rather than by an argument about which function reads
 * which field.
 *
 * ## The two properties
 *
 * **1 — A run that declares no window is the run this field did not exist for.** Not "equivalent",
 * not "within tolerance": the same object. `generateTrace` returns its own trace by reference when
 * no window is declared, so the assertion below is `toBe` on two `JSON.stringify` strings and, for
 * the *"the whole period is not a part"* case, `toBe` on the objects themselves. A guard with no
 * pinned constant cannot go stale, which is `dayStartIdentity`'s argument inherited whole. The
 * broader half of this claim is not here at all — it is the 2 410-case core suite, every pinned
 * digest in `transportIdentity.test.ts` and `sim/oracle.test.ts`, all of which are unmoved.
 *
 * **2 — A window's crowd is the day's crowd, not a new draw at a new length.** This is the property
 * that makes the field a *view* rather than a second experiment, and it is the reason
 * `generateTrace` draws the whole period and then cuts, instead of bounding the sampler. Asserted
 * three ways: the ids of the kept passengers, every field of every kept record, and the fact that
 * two different windows of one seed are two parts of one day.
 *
 * Property 2 is what CLAUDE.md invariant 2 asks for here. Under a bounded sampler a window change
 * would redraw every arrival instant, so a morning-versus-evening comparison would be unpaired and
 * would lose the 5–20× common random numbers buy; under this one the two windows share a day, and
 * the pairing is the day.
 *
 * ## What is deliberately *not* asserted
 *
 * That a windowed run and the same window of a continuously simulated day produce the same
 * **result**. They cannot: a continuous day carries queued riders and moving cars across 08:30 and a
 * windowed run starts empty, and no arrangement of this field changes that. What is asserted is that
 * they contain the same **demand**, which is the strongest claim available and the one that decides
 * whether *"which part of the day"* still names the same thing after the transition § D286 describes.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import type { LoadedConfig } from '../config/types.js';
import { StreamSet } from '../random/index.js';
import { BUILDING_IDS, load } from '../sim/fixtures.test-helper.js';
import { runSimulation } from '../sim/simulation.js';

import { resolveDemandTemplate, windowTemplate } from './demandTemplate.js';
import { generateTrace } from './generator.js';
import { DEMAND_TEMPLATE_IDS, TrafficError, type TrafficConfig } from './types.js';

const SEED = 20_260_806n;

/** The day record § D276 authored, and the only shipped template with parts to select. */
const DAY_ID = 'office-day';

/**
 * The three periods `office-day` contains, in seconds into its own ten hours.
 *
 * **Not authored here — reproduced from the shipped records' own hours**, which is what the case
 * *"every offered part is a shipped template's own hour"* asserts. `rise-and-fall` declares 08:30
 * and the day declares 08:00, so the morning is `[30 min, 60 min)`; likewise `lunch-two-way`'s
 * 12:15 and `office-down-peak`'s 17:15. If a record's hour moves, that case goes red rather than
 * this table going quietly stale.
 */
interface DayPartFixture {
  readonly startS: number;
  readonly endS: number;
  /** The shipped record whose own hour and length this part reproduces. */
  readonly hour: string;
}

const PARTS: Readonly<Record<'morning' | 'lunch' | 'evening', DayPartFixture>> = Object.freeze({
  morning: Object.freeze({ startS: 30 * 60, endS: 60 * 60, hour: 'rise-and-fall' }),
  lunch: Object.freeze({ startS: 255 * 60, endS: 285 * 60, hour: 'lunch-two-way' }),
  evening: Object.freeze({ startS: 555 * 60, endS: 585 * 60, hour: 'office-down-peak' }),
});

/**
 * Whether naming the whole period returns the trace **itself** rather than a copy of it.
 *
 * Two `generateTrace` calls make two objects however identical they are, so the reference claim has
 * to be made inside one generation. `windowTemplate` returning its argument is what the slice tests
 * for, so this reproduces that decision on the resolved template the trace already holds.
 */
function sliceIsIdentity(trace: ReturnType<typeof generateTrace>): boolean {
  return windowTemplate(trace.template, 0, trace.template.durationS) === trace.template;
}

let config: LoadedConfig;

beforeAll(async () => {
  config = await load();
}, 60_000);

function baseConfig(buildingId: string, templateId: string): Omit<TrafficConfig, 'streams'> {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`no building ${buildingId}`);
  return { building, profiles: config.trafficProfiles, template: templateId };
}

const traceFor = (
  buildingId: string,
  templateId: string,
  window?: { readonly startS: number; readonly endS: number },
): ReturnType<typeof generateTrace> =>
  generateTrace({
    ...baseConfig(buildingId, templateId),
    streams: new StreamSet(SEED),
    ...(window === undefined
      ? {}
      : { windowStartS: window.startS, windowEndS: window.endS }),
  });

/* -------------------------------------------------------------------------- *
 * Property 1 — a run with no window is the run before the field existed
 * -------------------------------------------------------------------------- */

describe('a run that declares no window is untouched by the field existing', () => {
  it.each(DEMAND_TEMPLATE_IDS.map((id) => [id] as const))(
    '%s carries no window key at all, rather than one spanning the period',
    (templateId) => {
      const template = resolveDemandTemplate(templateId, config.trafficProfiles.demandTemplates);
      // `'window' in x` and `JSON.stringify` disagree about an `undefined`-valued key, and the
      // identity guards read the first. This is the same discipline `startOfDayS` and
      // `authoredPhaseList` keep, for the same reason: the key sits inside every `SimulationResult`.
      expect('window' in template, templateId).toBe(false);
      const trace = traceFor('midtown-office', templateId);
      expect('window' in trace.template, templateId).toBe(false);
    },
  );

  it.each(BUILDING_IDS.map((id) => [id] as const))(
    '%s draws the same day whether or not the whole of it is named',
    (buildingId) => {
      // The whole is not a part, so naming it is the same selection as naming nothing — and the
      // two land on the same object rather than on two objects that happen to agree. A run that
      // said "the full day" and carried a key a run that said nothing did not would have a
      // different structural digest and therefore a different leaderboard board.
      const day = traceFor(buildingId, DAY_ID);
      const named = traceFor(buildingId, DAY_ID, { startS: 0, endS: day.template.durationS });
      expect(JSON.stringify(named)).toBe(JSON.stringify(day));
      // Reference equality inside one generation, which is the stronger statement: the slice is
      // not merely a copy that agrees, it is the early return.
      expect(sliceIsIdentity(day)).toBe(true);
    },
  );

  it('is the same run end to end, not merely the same trace', async () => {
    // Third layer, for `dayStartIdentity`'s reason: a run that read the window anywhere downstream
    // of the generator would pass the trace comparison and fail here.
    const building = config.buildingsById.get('midtown-office');
    const dispatcherProfile = config.dispatcherProfilesById.get('collective');
    if (building === undefined || dispatcherProfile === undefined) throw new Error('no fixture');
    const runOf = (named: boolean): unknown =>
      runSimulation({
        building,
        dispatcherProfile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        demandTemplate: DAY_ID,
        seed: 20_260_806,
        onTimeout: 'report',
        ...(named ? { windowStartS: 0, windowEndS: 600 * 60 } : {}),
      });
    expect(JSON.stringify(runOf(true))).toBe(JSON.stringify(runOf(false)));
    // Two ten-hour days of `midtown-office`, and the only case in this file that runs the kernel
    // rather than the generator. It costs 2.5 s alone and **timed out against the 5 s default under
    // a full-suite run**, where 340 files share the pool — passing in isolation and failing in
    // `npm test` is the worst way for a test to be wrong, because the failure looks like the code.
    // The three identity suites this one mirrors carry 60–180 s for the same reason; it was the
    // one that did not.
  }, 60_000);
});

/* -------------------------------------------------------------------------- *
 * Property 2 — the window's crowd is the day's crowd
 * -------------------------------------------------------------------------- */

describe('a window selects part of a day rather than drawing a shorter one', () => {
  it.each(Object.entries(PARTS).map(([name, part]) => [name, part] as const))(
    'the %s window keeps exactly the day’s own arrivals, re-based and nothing else',
    (_name, part) => {
      const day = traceFor('midtown-office', DAY_ID);
      const cut = traceFor('midtown-office', DAY_ID, part);

      const expected = day.passengers.filter(
        (passenger) => passenger.arrivalTimeS >= part.startS && passenger.arrivalTimeS < part.endS,
      );
      expect(cut.passengerCount).toBe(expected.length);
      expect(cut.passengerCount).toBeGreaterThan(0);

      // The ids are the day's, so they do not start at 1 — which is the property rather than an
      // oversight. A window that renumbered would look identical here and would have stopped being
      // a view of the day the moment anything joined two windows on their passenger ids.
      expect(cut.passengers.map((passenger) => passenger.id)).toEqual(
        expected.map((passenger) => passenger.id),
      );
      expect(cut.passengers[0]?.id).not.toBe('p1');

      // Every field, not just the ids: mass, destination, credential, category, legs and hops must
      // be the day's, because a window that redrew any of them would be a different crowd wearing
      // the day's names.
      expect(
        JSON.stringify(cut.passengers.map((passenger) => ({ ...passenger, arrivalTimeS: 0 }))),
      ).toBe(JSON.stringify(expected.map((passenger) => ({ ...passenger, arrivalTimeS: 0 }))));
      expect(cut.passengers.map((passenger) => passenger.arrivalTimeS)).toEqual(
        expected.map((passenger) => passenger.arrivalTimeS - part.startS),
      );
    },
  );

  it('pairs two windows of one seed on the same day, which is what CRN needs', () => {
    // The invariant-2 statement. Two windows are two parts of *one* draw, so a morning-versus-
    // evening comparison is paired on the day rather than being two unrelated experiments — which
    // is exactly the 5–20× a bounded sampler would have spent.
    const day = traceFor('midtown-office', DAY_ID);
    for (const part of [PARTS.morning, PARTS.lunch, PARTS.evening]) {
      const cut = traceFor('midtown-office', DAY_ID, part);
      const ids = new Set(cut.passengers.map((passenger) => passenger.id));
      const fromDay = day.passengers.filter((passenger) => ids.has(passenger.id));
      expect(fromDay.length).toBe(cut.passengerCount);
    }
    // And they are genuinely different parts, or the pairing above would be vacuous.
    const morning = traceFor('midtown-office', DAY_ID, PARTS.morning);
    const evening = traceFor('midtown-office', DAY_ID, PARTS.evening);
    const shared = new Set(morning.passengers.map((passenger) => passenger.id));
    expect(evening.passengers.some((passenger) => shared.has(passenger.id))).toBe(false);
  });

  it('re-bases the clock, the period and the report window onto the part', () => {
    const cut = traceFor('midtown-office', DAY_ID, PARTS.lunch);
    expect(cut.durationS).toBe(30 * 60);
    expect(cut.template.durationS).toBe(30 * 60);
    // 12:15, which is `lunch-two-way`'s own hour — the day started at 08:00 and the cut is 255
    // minutes in. This is the half of § D244 that stops being free: the hour is now an input to a
    // label a player reads, so a wrong one costs more than it did.
    expect(cut.startOfDayS).toBe(12 * 3600 + 15 * 60);
    expect(cut.template.startOfDayS).toBe(cut.startOfDayS);
    expect(cut.reportWindowStartS).toBe(0);
    expect(cut.reportWindowEndS).toBe(30 * 60);
    expect(cut.passengersInReportWindow).toBe(cut.passengerCount);
    expect(cut.template.window).toEqual({ startS: 255 * 60, endS: 285 * 60, periodS: 600 * 60 });
    // The day is still declared, so a reader holding the trace knows it is half an hour *of a
    // ten-hour day* without re-resolving the record.
    expect(cut.template.window?.periodS).toBe(600 * 60);
    expect(cut.template.authoredPhaseList).toBe(true);
  });

  it('re-derives the peak, the integral and the mean mix over the part rather than carrying the day’s', () => {
    const day = traceFor('midtown-office', DAY_ID).template;
    const lunch = traceFor('midtown-office', DAY_ID, PARTS.lunch).template;
    expect(lunch.intensityIntegralS).toBeLessThan(day.intensityIntegralS);
    expect(lunch.peakIntensity).toBe(1);
    // The lunch period's own 45/45/10, which is the cited arc's mean and *not* the day's — the day
    // is dominated by its balanced inter-peak stretches at a different level. A window that carried
    // the day's mean would plan its demand at a mix its own phases never hold.
    expect(lunch.meanDirectionalSplit?.incoming).toBeCloseTo(0.45, 3);
    expect(lunch.meanDirectionalSplit?.outgoing).toBeCloseTo(0.45, 3);
    expect(lunch.meanDirectionalSplit?.interfloor).toBeCloseTo(0.1, 3);
  });

  it('turns the crowd round between the parts, which is the thing a rescaled day cannot do', () => {
    // § D276 measured this on ten-minute windows of one run. Here it is the *runs themselves*, which
    // is what issue #78 asked for: the morning fills the building and the evening empties it, and a
    // player choosing between them is choosing between two different problems rather than two
    // lengths of one.
    const share = (part: DayPartFixture): number => {
      const cut = traceFor('midtown-office', DAY_ID, part);
      const incoming = cut.passengers.filter((passenger) => passenger.category === 'incoming');
      return incoming.length / cut.passengerCount;
    };
    const morning = share(PARTS.morning);
    const evening = share(PARTS.evening);
    expect(morning).toBeGreaterThan(0.7);
    expect(evening).toBeLessThan(0.2);
    expect(morning - evening).toBeGreaterThan(0.5);
  });
});

/* -------------------------------------------------------------------------- *
 * The offered parts are the shipped records' own hours
 * -------------------------------------------------------------------------- */

describe('a part of the day is a shipped period, not an interval this code chose', () => {
  it.each(Object.entries(PARTS).map(([name, part]) => [name, part] as const))(
    'the %s part is exactly the clock and length another record declares',
    (_name, part) => {
      const records = config.trafficProfiles.demandTemplates;
      const day = records.find((record) => record.id === DAY_ID);
      const period = records.find((record) => record.id === part.hour);
      expect(day?.startOfDayMin, DAY_ID).toBeDefined();
      expect(period?.startOfDayMin, part.hour).toBeDefined();
      const dayStartMin = day?.startOfDayMin ?? 0;
      // Both ends, so a record that moved its hour *or* its length turns this red.
      expect(((period?.startOfDayMin ?? 0) - dayStartMin) * 60).toBe(part.startS);
      expect((period?.durationMin ?? 0) * 60).toBe(part.endS - part.startS);
    },
  );

  it('lands every part on the day’s own phase boundaries, which is why shift-change is not one', () => {
    const day = resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates);
    const boundaries = new Set([0, ...day.phases.map((phase) => phase.endS)]);
    for (const part of Object.values(PARTS)) {
      expect(boundaries.has(part.startS), String(part.startS)).toBe(true);
      expect(boundaries.has(part.endS), String(part.endS)).toBe(true);
    }
    // The negative control, and the reason the offered list is three rather than four.
    // `shift-change` declares 14:45, which is 405 minutes into this day — inside the flat afternoon
    // stretch that runs 315–495. The day has no period there, so naming one after that record would
    // put a two-peak label on a level.
    const shiftChange = config.trafficProfiles.demandTemplates.find(
      (record) => record.id === 'shift-change',
    );
    const offsetS = ((shiftChange?.startOfDayMin ?? 0) - 8 * 60) * 60;
    expect(boundaries.has(offsetS)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The refusals
 * -------------------------------------------------------------------------- */

describe('a window that cannot mean anything says so by name', () => {
  const day = (): ReturnType<typeof resolveDemandTemplate> =>
    resolveDemandTemplate(DAY_ID, config.trafficProfiles.demandTemplates);

  it('refuses a window past the end of the period, naming both lengths', () => {
    expect(() => windowTemplate(day(), 0, 600 * 60 + 1)).toThrow(TrafficError);
    expect(() => windowTemplate(day(), 0, 600 * 60 + 1)).toThrow(/does not fit inside/u);
    expect(() => windowTemplate(day(), 0, 600 * 60 + 1)).toThrow(/36000 s/u);
  });

  it('refuses an empty or inverted window rather than running a period with no demand', () => {
    expect(() => windowTemplate(day(), 1800, 1800)).toThrow(/must be below windowEndS/u);
    expect(() => windowTemplate(day(), 3600, 1800)).toThrow(/must be below windowEndS/u);
  });

  it('refuses a second window on a template that already carries one', () => {
    // Nesting would measure the second window against the first one's length, at which point
    // "which part of the day" stops naming a part of the day.
    const morning = windowTemplate(day(), PARTS.morning.startS, PARTS.morning.endS);
    expect(() => windowTemplate(morning, 0, 900)).toThrow(/already a \[1800, 3600\) window/u);
  });

  it('refuses one end without the other, at the generator', () => {
    expect(() =>
      generateTrace({
        ...baseConfig('midtown-office', DAY_ID),
        streams: new StreamSet(SEED),
        windowStartS: 1800,
      }),
    ).toThrow(/needs both ends/u);
  });

  it('still refuses templateOverrides.durationS, and now names the field that replaces it', () => {
    // § D275's refusal is not relaxed by this field existing — it is *answered* by it. Rescaling a
    // day is still the wrong operation; the message now says what the right one is called.
    expect(() =>
      generateTrace({
        ...baseConfig('midtown-office', DAY_ID),
        streams: new StreamSet(SEED),
        templateOverrides: { durationS: 900 },
      }),
    ).toThrow(/windowStartS\/windowEndS/u);
  });
});

/* -------------------------------------------------------------------------- *
 * A window works on a shape too, and the run is a real one
 * -------------------------------------------------------------------------- */

describe('the window is a run selection rather than a phase-list feature', () => {
  it('cuts a shape template as readily as a schedule, because it refits no geometry', () => {
    // No `if (authoredPhaseList)` anywhere in `windowTemplate`, deliberately: a window selects part
    // of a period and every template has one. The reason `office-day` is the record that needed it
    // is that it is the one with parts worth selecting, not that the mechanism knows about it.
    const cut = traceFor('midtown-office', 'rise-and-fall', { startS: 600, endS: 1200 });
    expect(cut.durationS).toBe(600);
    expect(cut.template.window).toEqual({ startS: 600, endS: 1200, periodS: 1800 });
    expect(cut.startOfDayS).toBe(8 * 3600 + 40 * 60);
    expect('window' in traceFor('midtown-office', 'rise-and-fall').template).toBe(false);
  });

  it('runs a windowed day to completion and reports over the part', () => {
    const building = config.buildingsById.get('garden-apartments');
    const dispatcherProfile = config.dispatcherProfilesById.get('collective');
    if (building === undefined || dispatcherProfile === undefined) throw new Error('no fixture');
    const result = runSimulation({
      building,
      dispatcherProfile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      demandTemplate: DAY_ID,
      windowStartS: PARTS.morning.startS,
      windowEndS: PARTS.morning.endS,
      seed: 20_260_806,
      onTimeout: 'report',
    });
    expect(result.reportWindow.startS).toBe(0);
    expect(result.reportWindow.endS).toBe(30 * 60);
    expect(result.trace.passengerCount).toBeGreaterThan(0);
    // The demand horizon is the part; the run itself is allowed to overrun it while the queue
    // drains, which is the tail issue #80 says the labels must name rather than hide.
    expect(result.demandEndedAt).toBe(30 * 60);
    expect(result.endedAt).toBeGreaterThanOrEqual(result.demandEndedAt);
  });
});
