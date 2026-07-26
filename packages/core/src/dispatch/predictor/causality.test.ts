/**
 * The causality suite: proof that the predictor cannot see the future.
 *
 * This is the most important file in the module. Everything Phase 5 claims about predictive
 * pre-positioning is worthless if the forecast is informed by arrivals that have not happened —
 * not slightly optimistic, worthless, because the quantity being measured is the value of
 * *anticipating* demand and an oracle anticipates nothing. A clairvoyant predictor would also
 * fail quietly and look like a triumph, which is exactly the "confident nonsense" CLAUDE.md names
 * as this project's most likely failure mode.
 *
 * Three kinds of assertion, in decreasing order of strength:
 *
 * 1. **Structural.** The module's own source is read and its import list checked, the way
 *    `estimateCost.test.ts` proves the cost estimator cannot reach an RNG. There is no object
 *    graph from a predictor to a trace because there is no runtime import out of the directory at
 *    all, so a future edit that reached for one would have to add an import here — and this test
 *    is what says not to.
 * 2. **Informational.** A forecast made at `t` is bit-identical to one made by a fresh model fed
 *    only the arrivals that happened before `t`'s bucket started. Not "close to": identical. Every
 *    later arrival, including ones already handed to the model, provably contributes nothing.
 * 3. **Monotone.** Both directions of time are closed. `observe` refuses an arrival that runs
 *    backwards, *and* every read refuses a time the model has already moved past. The second half
 *    used to be a caller obligation documented as a structural fact, which it is not: property 2 is
 *    a statement about the **open** bucket and says nothing about a query for a bucket that closed
 *    long ago. Measured on a model fed 360 arrivals over `[0, 1800)`, asking about `t = 100` gave
 *    31.90 where the causal answer is 1.50 — 21x, silent, and exactly the shape a mis-wired
 *    decision context produces.
 * 4. **Interface.** The read-only face has no way to record an observation, so no scoring code —
 *    which runs thousands of times per dispatch decision — can teach or unteach the model.
 */

import { describe, expect, it } from 'vitest';

import { DIRECTIONS } from '../../model/types.js';

import { createArrivalModel } from './arrivalModel.js';
import { PredictorError, type ArrivalModel, type DemandForecast } from './types.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

/** Every source file in the module. Kept explicit so a new file must be added here to pass. */
const MODULE_FILES = ['types.ts', 'parameters.ts', 'arrivalModel.ts', 'index.ts'] as const;

const FLOORS = Object.freeze(['1', '2', '3', '10', '11', '12']);

/** Defaults: 300 s buckets, so bucket boundaries are the multiples of 300. */
const BUCKET_S = 300;

function model(): ArrivalModel {
  return createArrivalModel({ floorIds: FLOORS });
}

/** Read one of this module's own source files, for the structural assertions. */
async function readModuleSource(fileName: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  return readFile(fileURLToPath(new URL(fileName, import.meta.url)), 'utf8');
}

/** Every `import … from '…'` in a source file, with whether it was type-only. */
function importsOf(source: string): readonly { readonly clause: string; readonly from: string }[] {
  const found: { clause: string; from: string }[] = [];
  const pattern = /(?:^|\n)import\b([^;]*?)from\s+'([^']+)';/g;
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    found.push({ clause: match[1] ?? '', from: match[2] ?? '' });
  }
  return found;
}

/* -------------------------------------------------------------------------- *
 * 1 — structural: the module cannot reach a trace
 * -------------------------------------------------------------------------- */

describe('the predictor cannot reach the passenger trace', () => {
  it('imports nothing from traffic/, in any file', async () => {
    // The headline. `traffic/` is where the trace lives: `generateTrace` produces every passenger
    // a replication will see *before* the run starts, which is what makes common random numbers
    // work — and what would make a predictor that read it omniscient.
    for (const fileName of MODULE_FILES) {
      const source = await readModuleSource(fileName);
      for (const { from } of importsOf(source)) {
        expect(from, `${fileName} imports '${from}'`).not.toMatch(/traffic/);
      }
    }
  });

  it('has no runtime import outside its own directory, in any file', async () => {
    // Stronger than "does not import traffic/", and the reason the causality argument is
    // structural rather than a promise: every outward import is `import type` and is erased at
    // compile time, so a compiled predictor holds references to nothing but its own three files.
    // There is no path — through the kernel, a generator, a bank, a building — to anything that
    // knows a future arrival, because there is no path to anything at all.
    for (const fileName of MODULE_FILES) {
      const source = await readModuleSource(fileName);
      for (const { clause, from } of importsOf(source)) {
        if (from.startsWith('./')) continue;
        expect(
          clause.trimStart().startsWith('type '),
          `${fileName} has a runtime import of '${from}'; outward imports must be \`import type\``,
        ).toBe(true);
      }
    }
  });

  it('never imports for side effects, and never imports dynamically', async () => {
    // The two ways an import escapes the check above.
    for (const fileName of MODULE_FILES) {
      const source = await readModuleSource(fileName);
      expect(source, fileName).not.toMatch(/(?:^|\n)import\s+'[^']+';/);
      expect(source, fileName).not.toMatch(/\bimport\s*\(/);
      expect(source, fileName).not.toMatch(/\brequire\s*\(/);
    }
  });

  it('names no type or function from the traffic module anywhere in its source', async () => {
    // Belt and braces: an import could in principle be re-exported to the predictor by a third
    // module. None of these identifiers appears, so nothing shaped like a trace is being handled
    // under another module's name.
    const forbidden = [
      'PassengerTrace',
      'GeneratedPassenger',
      'TraceLeg',
      'TrafficConfig',
      'TrafficError',
      'ArrivalEvent',
      'generateTrace',
      'planDemand',
      'sampleBatchArrivalTimes',
      'RoutePlanner',
      'StreamSet',
    ];
    for (const fileName of MODULE_FILES) {
      const source = await readModuleSource(fileName);
      for (const identifier of forbidden) {
        expect(source, `${fileName} mentions ${identifier}`).not.toContain(identifier);
      }
    }
  });

  it('draws no random number and reads no clock', async () => {
    // CLAUDE.md invariants 2 and 3. A predictor with a random tie-break would desynchronize
    // common random numbers between two dispatchers that differ only in their weights, and one
    // that read a wall clock would forecast a different thing on a slow machine.
    for (const fileName of MODULE_FILES) {
      const source = await readModuleSource(fileName);
      expect(source, fileName).not.toMatch(/Math\.random/);
      expect(source, fileName).not.toMatch(/Date\.now|performance\.now|new Date/);
      expect(source, fileName).not.toMatch(/setTimeout|setInterval|queueMicrotask/);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — informational: only arrivals before the current bucket inform a forecast
 * -------------------------------------------------------------------------- */

describe('a forecast uses only arrivals that had already happened', () => {
  it('is unchanged by arrivals observed later in the same bucket', () => {
    // The property as the brief states it: arrivals observed at t = 200 do not inform a forecast
    // about the bucket they landed in. It holds because the bucket in progress is accumulating and
    // is not part of any estimate — the model folds *completed* buckets only.
    //
    // Stated across two models read at the same instant rather than one model read twice, because
    // re-reading t = 100 after observing t = 299 is now refused outright (see the backwards-read
    // test below). Two models at one instant is the stronger claim anyway: it isolates the 26
    // extra arrivals as the only difference.
    const quiet = model();
    quiet.observe('12', 'up', 10);
    quiet.observe('3', 'down', 40);

    const busy = model();
    busy.observe('12', 'up', 10);
    busy.observe('3', 'down', 40);
    for (let n = 0; n < 25; n += 1) busy.observe('12', 'up', 200 + n);
    busy.observe('12', 'up', 299);

    // t = 299 is still inside bucket 0, which has not closed for either model.
    expect(busy.forecast('12', 'up', 299, 300)).toBe(quiet.forecast('12', 'up', 299, 300));
    expect([...busy.expectedDemandByFloor(299, 300)]).toStrictEqual([
      ...quiet.expectedDemandByFloor(299, 300),
    ]);
    // …and the arrivals really were recorded. This is not passing because nothing happened.
    expect(busy.observedArrivals).toBe(28);
    expect(quiet.observedArrivals).toBe(2);
  });

  it('does learn from them once their bucket has closed', () => {
    // The complement, and the reason the test above is a causality property rather than a bug: the
    // information is not discarded, it is *deferred* to the moment it became historical.
    const predictor = model();
    for (let n = 0; n < 30; n += 1) predictor.observe('12', 'up', 100 + n);

    // Asked at the last instant the model has been told about, while their bucket is still open…
    const duringBucket = predictor.forecast('12', 'up', 129, BUCKET_S);
    // …and again once that bucket has closed. Both reads are forward of every observation.
    const afterBucket = predictor.forecast('12', 'up', BUCKET_S, BUCKET_S);

    expect(afterBucket).toBeGreaterThan(duringBucket * 2);
  });

  it('equals a model that never saw anything from the current bucket onward', () => {
    // The unconditional statement, and the strongest of the three: replay only the arrivals that
    // happened strictly before the query bucket started, and the forecast is **bit-identical**.
    // Whatever the model has been told since contributes exactly nothing — not a rounding-level
    // amount, nothing.
    const arrivals: readonly { readonly floorId: string; readonly at: number }[] = Object.freeze([
      { floorId: '12', at: 5 },
      { floorId: '12', at: 130 },
      { floorId: '3', at: 240 },
      { floorId: '12', at: 310 },
      { floorId: '12', at: 480 },
      { floorId: '11', at: 505 },
      { floorId: '12', at: 700 },
      { floorId: '1', at: 905 },
      { floorId: '12', at: 1100 },
      { floorId: '12', at: 1250 },
      { floorId: '10', at: 1420 },
      { floorId: '12', at: 1700 },
    ]);

    const live = model();
    let fed = 0;

    // Monotone use, exactly as a simulation drives it: observations and queries interleaved in
    // time order, never a query about a time the model has already moved past.
    for (const queryAt of [0, 150, 300, 460, 610, 900, 1205, 1500, 1800]) {
      while (fed < arrivals.length && (arrivals[fed]?.at ?? Infinity) <= queryAt) {
        const arrival = arrivals[fed];
        if (arrival !== undefined) live.observe(arrival.floorId, 'up', arrival.at);
        fed += 1;
      }

      const bucketStart = Math.floor(queryAt / BUCKET_S) * BUCKET_S;
      const causal = model();
      for (const arrival of arrivals) {
        if (arrival.at < bucketStart) causal.observe(arrival.floorId, 'up', arrival.at);
      }

      expect([...live.expectedDemandByFloor(queryAt, 300)], `at t=${String(queryAt)}`).toStrictEqual(
        [...causal.expectedDemandByFloor(queryAt, 300)],
      );
      expect(live.rate('12', 'up', queryAt)).toBe(causal.rate('12', 'up', queryAt));
    }

    expect(fed).toBe(arrivals.length);
  });

  it('prices a bucket the horizon reaches into with the belief held at fromT', () => {
    // A horizon that spans a boundary is integrated bucket by bucket, but every bucket is read
    // *as of fromT*. Advancing the estimate to the moment being forecast would be remembering
    // rather than forecasting — and would be undetectable in any aggregate metric.
    const predictor = model();
    for (let n = 0; n < 20; n += 1) predictor.observe('12', 'up', 5 + n * 10);

    // A window entirely inside the open bucket, and one spanning three buckets. Both must be
    // reproducible from the observations that preceded the open bucket, which here is none of
    // them: every arrival is in bucket 0 and bucket 0 has not closed at t = 250.
    const cold = model();
    expect(predictor.forecast('12', 'up', 250, 40)).toBe(cold.forecast('12', 'up', 250, 40));
    expect(predictor.forecast('12', 'up', 250, 700)).toBe(cold.forecast('12', 'up', 250, 700));
  });

  it('refuses an observation that runs backwards in time', () => {
    // Out-of-order observation is the shape replaying a stored history takes, and the guarantee
    // above holds only while observation is monotone. Rejected loudly rather than absorbed.
    const predictor = model();
    predictor.observe('12', 'up', 400);
    expect(() => predictor.observe('12', 'up', 399)).toThrow(/time order/);
    expect(() => predictor.observe('12', 'up', 400)).not.toThrow();
  });

  it('refuses a read for a time it has already moved past', () => {
    // The other half of the same guarantee, and the half that was missing. Guarding only `observe`
    // made monotone use a *caller obligation* while the module documented it as a structural fact.
    // It is not one: the estimator answers "as of the time asked", and once a bucket has closed
    // there is nothing in the arithmetic to distinguish "asked at t" from "asked later, about t".
    //
    // Measured before the guard, on exactly this shape: `forecast('12','up',100,300)` returned
    // 31.90 where a model fed only the arrivals before t = 100 returns 1.50, and
    // `rate('12','up',100)` returned 0.1063 against 0.005. A 21x clairvoyant answer that no
    // aggregate metric would flag, reachable from a context built on a call's `registeredAt`, a
    // cached `now`, or replay code scrubbing backwards.
    const predictor = model();
    for (let at = 0; at < 1800; at += 5) predictor.observe('12', 'up', at);
    expect(predictor.observedArrivals).toBe(360);
    expect(predictor.lastObservedAt).toBe(1795);

    // All three reads, not just `forecast`: `expectedDemandByFloor` is what stage 7 consumes and
    // `rate` is what the `predictedDemand` cost term reads, so a guard on one of the three would
    // leave the two live paths open.
    expect(() => predictor.forecast('12', 'up', 100, 300)).toThrow(PredictorError);
    expect(() => predictor.forecast('12', 'up', 100, 300)).toThrow(/clairvoyance/);
    expect(() => predictor.expectedDemandByFloor(100, 300)).toThrow(/clairvoyance/);
    expect(() => predictor.rate('12', 'up', 100)).toThrow(/clairvoyance/);
    // The message names both times, so the fix is obvious from the failure alone.
    expect(() => predictor.rate('12', 'up', 100)).toThrow(/100.*1795|1795.*100/);

    // One tick before the last observation is still refused: the boundary is the observation, not
    // the bucket, because a within-bucket backwards read is the same peek in miniature.
    expect(() => predictor.forecast('12', 'up', 1794.9, 300)).toThrow(PredictorError);
    // At the last observation and after it, which is how a simulation drives it, nothing throws.
    expect(() => predictor.forecast('12', 'up', 1795, 300)).not.toThrow();
    expect(() => predictor.expectedDemandByFloor(1795, 300)).not.toThrow();
    expect(() => predictor.rate('12', 'up', 1795)).not.toThrow();
    expect(() => predictor.forecast('12', 'up', 9000, 300)).not.toThrow();
  });

  it('answers any time before it has been told anything, and again after a reset', () => {
    // The guard is a floor at `lastObservedAt`, not a ratchet on a wall clock. A cold model has no
    // floor — there is no observation for a read to be informed by — and `reset()` removes it
    // again, which is what makes a model reusable across replications. A guard keyed to the highest
    // time ever *seen* would have made the second replication of a run unable to read t = 0.
    const predictor = model();
    expect(predictor.lastObservedAt).toBeUndefined();
    expect(() => predictor.forecast('12', 'up', 0, 300)).not.toThrow();
    expect(() => predictor.rate('12', 'up', 0)).not.toThrow();

    for (let at = 0; at < 600; at += 5) predictor.observe('12', 'up', at);
    expect(() => predictor.forecast('12', 'up', 0, 300)).toThrow(PredictorError);

    predictor.reset();
    expect(() => predictor.forecast('12', 'up', 0, 300)).not.toThrow();
    expect(predictor.forecast('12', 'up', 0, 300)).toBe(model().forecast('12', 'up', 0, 300));
  });

  it('checks the time before the causality of it, so a bad time is still named as one', () => {
    // Ordering matters for the error a caller sees: a negative or NaN time is a unit mistake, not
    // a clairvoyance attempt, and reporting it as the latter would send someone hunting the wrong
    // bug. `NaN` is neither before nor after the last observation, so only ordering saves it.
    const predictor = model();
    predictor.observe('12', 'up', 400);
    expect(() => predictor.forecast('12', 'up', -1, 300)).toThrow(/finite simulated time/);
    expect(() => predictor.forecast('12', 'up', Number.NaN, 300)).toThrow(/finite simulated time/);
    expect(() => predictor.rate('12', 'up', Number.NaN)).toThrow(/finite simulated time/);
    expect(() => predictor.expectedDemandByFloor(Number.NaN, 300)).toThrow(/finite simulated time/);
    // And an unknown floor outranks both: it is a configuration mismatch either way.
    expect(() => predictor.forecast('99', 'up', 1, 300)).toThrow(/unknown floor/);
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — interface: the read-only face cannot teach the model anything
 * -------------------------------------------------------------------------- */

describe('the forecasting interface is read-only', () => {
  it('exposes exactly two mutating operations, and both are on the model face', () => {
    const predictor = model();
    const members = Object.keys(predictor).sort();

    expect(members).toStrictEqual([
      'config',
      'expectedDemandByFloor',
      'floorIds',
      'forecast',
      'lastObservedAt',
      'observe',
      'observedArrivals',
      'parameters',
      'rate',
      'reset',
    ]);

    // The narrowed face is what the `predictedDemand` term and the repositioning stage hold. The
    // guarantee is a compile-time one — nothing typed as a `DemandForecast` can call `observe`,
    // which matters because a cost term runs thousands of times per dispatch decision and must
    // not be able to record anything. The runtime assertion only pins the intent.
    const forecaster: DemandForecast = predictor;
    expect(Object.keys(forecaster)).toContain('forecast');
    expect(typeof (forecaster as { readonly forecast: unknown }).forecast).toBe('function');
  });

  it('answers the same thing however many times it is asked', () => {
    // Reads are pure. If a read sealed a bucket in place, the first forecast after a quiet spell
    // would differ from the second, and a renderer that drew the forecast would change the run.
    const predictor = model();
    for (let n = 0; n < 12; n += 1) predictor.observe('11', 'down', n * 37);

    const first = predictor.forecast('11', 'down', 1200, 300);
    const firstMap = [...predictor.expectedDemandByFloor(1200, 300)];
    const firstRate = predictor.rate('11', 'down', 1200);

    for (let n = 0; n < 50; n += 1) {
      predictor.forecast('11', 'down', 900 + n, 300);
      predictor.expectedDemandByFloor(2000 + n, 600);
      predictor.rate('1', 'up', 3000 + n);
    }

    expect(predictor.forecast('11', 'down', 1200, 300)).toBe(first);
    expect([...predictor.expectedDemandByFloor(1200, 300)]).toStrictEqual(firstMap);
    expect(predictor.rate('11', 'down', 1200)).toBe(firstRate);
  });

  it('keeps its own direction list in step with the model layer', () => {
    // `FORECAST_DIRECTIONS` is duplicated inside `arrivalModel.ts` so the module has no runtime
    // import outside its directory. A test may import freely, so this is where the duplicate is
    // pinned to the original.
    const predictor = model();
    const perFloor = predictor.expectedDemandByFloor(0, 300).get('1') ?? 0;
    const summed = DIRECTIONS.reduce(
      (total, direction) => total + predictor.forecast('1', direction, 0, 300),
      0,
    );

    expect(DIRECTIONS).toStrictEqual(['up', 'down']);
    expect(perFloor).toBeCloseTo(summed, 12);
  });
});
