/**
 * **Phase 8 § Scale & performance** — the large sweep and the memory profile.
 *
 * `docs/07-handoff.md` names "a 20k-replication sweep" and "memory profile". Both are here, and
 * the 20 000-replication run is **opt-in**, for the reason `fuzz/deep.test.ts` gives about its own
 * campaign: a suite that grew by ten minutes is turned off inside a week and then protects
 * nothing.
 *
 * ## Always-on versus opt-in — exactly, with no silent caps
 *
 * **Always-on** (a few seconds):
 *
 * - a **200-replication** sweep through the real `runExperiment`, serial, measured;
 * - the **projection** to 20 000 from that measured per-replication cost, printed with the
 *   extrapolation labelled as an extrapolation;
 * - the assertion that `keepRecords: false` really drops the records, which is the difference
 *   between a 20 000-replication sweep fitting in memory and not;
 * - a **deterministic** memory profile: serialized bytes per record and per leg, which is a pure
 *   function of the run and can therefore carry a threshold.
 *
 * **`ELEVATOR_SIM_DEEP=1`**: the full 20 000 replications, executed, with the projection checked
 * against what actually happened.
 *
 * ## Why the projection is worth having even when the real sweep has not run
 *
 * A per-replication cost measured over 200 replications of the same cell is a good estimator of
 * the cost of 20 000 of them, because the replications are independent and identically
 * configured — the only thing that changes between them is the seed. What it cannot capture is a
 * cost that grows *with the sweep*, which is precisely what the `keepRecords` assertion is for:
 * retained records are the one term that is superlinear in wall time and linear-forever in
 * memory, and it is checked directly rather than extrapolated.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { canonicalJson, createStoredRun, serializeStoredRun } from '../reports/persistence.js';
import { runExperiment } from '../runner/replicationRunner.js';
import type { ExperimentResources, ExperimentResult } from '../runner/types.js';
import { loadResources, withProfiles } from './harness.js';
import { goldenSimulationConfig, goldensFor } from './golden.js';
import { replaySourcesFrom } from '../reports/replay.js';
import { runSimulation } from '@elevator-sim/core';
import { fitPowerLaw, formatFit, heapAround } from './perfInstrument.js';

const DEEP = process.env['ELEVATOR_SIM_DEEP'] === '1';

/** What the always-on portion measures, and what the deep portion actually runs. */
const ALWAYS_ON_REPLICATIONS = 200;
const DEEP_REPLICATIONS = 20_000;

let resources: ExperimentResources;

beforeAll(async () => {
  resources = withProfiles(await loadResources(), []);
}, 120_000);

/**
 * The cell the sweep is measured on: **the repository's own gate operating point**.
 *
 * Midtown Office, up-peak at 1 %, 900 s — `validation/harness.ts` `MIDTOWN_UP_PEAK`, chosen there
 * because `operatingPoint.test.ts` censused it as the highest rate at which every arm comes back
 * 0/100 saturated. Two properties matter for extrapolating from it: no replication runs to a
 * drain deadline, so the per-replication cost is stable; and it is the configuration a real sweep
 * in this repository actually runs, so the projected 20 000-replication figure is a projection of
 * something somebody would do rather than of the cheapest thing available. Garden Apartments
 * would have been four times faster and would have projected a number about nothing.
 */
function sweepSpec(id: string, replications: number) {
  return {
    id,
    seed: 20260728,
    buildings: ['midtown-office'],
    dispatchers: ['eta'],
    traffic: [
      {
        id: 'sweep',
        durationS: 900,
        demand: {
          arrivalRatePctPop5min: 1,
          peakWindowS: 300,
          directionalSplit: { incoming: 1, outgoing: 0, interfloor: 0 },
          entranceWeights: { G: 1, P1: 0 },
        },
      },
    ],
    replication: {
      minReplications: replications,
      maxReplications: replications,
      checkEvery: Math.max(1, Math.floor(replications / 8)),
    },
    parallel: { mode: 'serial' as const },
  };
}

describe('a large replication sweep', () => {
  let perReplicationS = Number.NaN;

  it(`runs ${String(ALWAYS_ON_REPLICATIONS)} replications and reports the per-replication cost`, async () => {
    const started = process.hrtime.bigint();
    const result = await runExperiment(sweepSpec('perf/sweep', ALWAYS_ON_REPLICATIONS), resources, {
      keepRecords: false,
    });
    const run = { result, seconds: Number(process.hrtime.bigint() - started) / 1e9 };

    const cell = run.result.cells[0];
    expect(cell).toBeDefined();
    if (cell === undefined) return;
    expect(cell.replications).toHaveLength(ALWAYS_ON_REPLICATIONS);

    perReplicationS = run.seconds / ALWAYS_ON_REPLICATIONS;
    const projectedS = perReplicationS * DEEP_REPLICATIONS;
    console.log(
      `\n[perf] sweep: ${String(ALWAYS_ON_REPLICATIONS)} replications in ${run.seconds.toFixed(2)} s ` +
        `= ${(perReplicationS * 1000).toFixed(2)} ms each (serial, keepRecords: false)\n` +
        `[perf] EXTRAPOLATION, not a measurement: ${String(DEEP_REPLICATIONS)} replications ≈ ` +
        `${projectedS.toFixed(0)} s (${(projectedS / 60).toFixed(1)} min) serial on this machine. ` +
        `Run with ELEVATOR_SIM_DEEP=1 to measure it instead.`,
    );

    /* Structural, not temporal: every replication produced a distinct trace and a real number. */
    const digests = new Set(cell.replications.map((replication) => replication.traceDigest));
    expect(digests.size).toBe(ALWAYS_ON_REPLICATIONS);
    expect(perReplicationS).toBeGreaterThan(0);
  }, 900_000);

  it('drops records when asked to, which is what makes a 20k sweep possible at all', async () => {
    /* The one term that is linear-forever in memory. A sweep that retained records would need
       the per-record figure measured below times twenty thousand, and this is the switch that
       decides which of the two a caller gets. Asserted on both sides so a `keepRecords` that had
       silently stopped being read could not pass. */
    const kept = await runExperiment(sweepSpec('perf/sweep-kept', 8), resources, {
      keepRecords: true,
    });
    const dropped = await runExperiment(sweepSpec('perf/sweep-dropped', 8), resources, {
      keepRecords: false,
    });

    const recordsIn = (result: ExperimentResult): number =>
      (result.cells[0]?.replications ?? []).filter((entry) => entry.record !== undefined).length;

    console.log(
      `[perf] keepRecords: true → ${String(recordsIn(kept))}/8 records retained; false → ${String(recordsIn(dropped))}/8`,
    );
    expect(recordsIn(kept)).toBe(8);
    expect(recordsIn(dropped)).toBe(0);

    /* And dropping them changes nothing about the answer. If it did, the memory decision would
       be a scientific decision, which is exactly what it must not be. */
    const metricsOf = (result: ExperimentResult): unknown =>
      canonicalJson(
        (result.cells[0]?.replications ?? []).map((entry) => [entry.seed, entry.metrics]),
      );
    expect(metricsOf(dropped)).toEqual(metricsOf(kept));
  }, 900_000);

  it.skipIf(!DEEP)(
    `runs the full ${String(DEEP_REPLICATIONS)}-replication sweep`,
    async () => {
      const started = process.hrtime.bigint();
      const result = await runExperiment(
        sweepSpec('perf/sweep-deep', DEEP_REPLICATIONS),
        resources,
        { keepRecords: false, parallel: { mode: 'workers' } },
      );
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const cell = result.cells[0];
      expect(cell?.replications).toHaveLength(DEEP_REPLICATIONS);

      console.log(
        `\n[perf] DEEP sweep: ${String(DEEP_REPLICATIONS)} replications in ${seconds.toFixed(1)} s ` +
          `(${((seconds / DEEP_REPLICATIONS) * 1000).toFixed(2)} ms each, workers)\n` +
          `[perf] against the serial extrapolation of ${(perReplicationS * DEEP_REPLICATIONS).toFixed(0)} s`,
      );

      /* Twenty thousand distinct traces. A seed derivation that collided would show up here and
         nowhere else in the repository — no other suite runs enough replications to see it. */
      const digests = new Set((cell?.replications ?? []).map((entry) => entry.traceDigest));
      expect(digests.size).toBe(DEEP_REPLICATIONS);
    },
    7_200_000,
  );
});

/* -------------------------------------------------------------------------- *
 * Memory
 * -------------------------------------------------------------------------- */

describe('memory profile', () => {
  /**
   * The deterministic half: serialized bytes.
   *
   * `heapUsed` cannot carry a threshold in this process — the repository's `vitest` invocation
   * passes no `--expose-gc`, so a delta measured across a run is partly a statement about when
   * the collector last ran. The serialized size of a stored record is not: it is a pure function
   * of the run, so it is what the budget claim is made from, and the heap figure is printed
   * beside it as context only.
   */
  it('reports bytes per stored record and per passenger leg, and projects a 20k sweep', async () => {
    const loaded = await loadResources();
    const sources = replaySourcesFrom(loaded);
    const spec = goldensFor('always-on').find((entry) => entry.id === 'garden-eta-baseline');
    expect(spec).toBeDefined();
    if (spec === undefined) return;

    const simConfig = goldenSimulationConfig(spec, sources);
    const { value: stored, heap } = heapAround(() =>
      createStoredRun({
        experimentId: 'perf/memory',
        experimentSeed: spec.seed,
        replication: 0,
        config: simConfig,
        result: runSimulation(simConfig),
      }),
    );

    const bytes = Buffer.byteLength(serializeStoredRun(stored), 'utf8');
    const legs = stored.record.passengers.length;
    const perLeg = bytes / legs;
    const projectedGb = (bytes * 20_000) / 1024 ** 3;

    console.log(
      `\n[perf] one stored record: ${String(bytes)} bytes for ${String(legs)} legs = ` +
        `${perLeg.toFixed(0)} B/leg (deterministic — serialized size, not heap)\n` +
        `[perf] EXTRAPOLATION: 20 000 such records ≈ ${projectedGb.toFixed(2)} GiB on disk, which is ` +
        `why a sweep streams with keepRecords: false rather than retaining them\n` +
        `[perf] indicative heap around the same run: ${heap.deltaMb.toFixed(1)} MiB ` +
        `(${heap.beforeMb.toFixed(0)} → ${heap.afterMb.toFixed(0)} MiB; not assertable, see perfInstrument.ts)`,
    );

    /* A per-leg record is a few hundred bytes of JSON: arrival, boarding, alighting, car, bank,
       mass, credential. An order of magnitude either side of that would mean the record shape
       changed materially — ten times smaller means fields were dropped, ten times larger means a
       derived structure got serialized into every passenger. Both are things a reader of a
       result set needs to be told about. */
    expect(perLeg).toBeGreaterThan(30);
    expect(perLeg).toBeLessThan(3000);
  }, 900_000);

  it('grows the retained result linearly in replications, not worse', async () => {
    /* The shape of the claim, on a deterministic quantity: the whole `ExperimentResult`,
       canonically serialized, at four replication counts. `CellAggregate` keeps one sample per
       replication per metric, which is linear and correct. A **superlinear** term here would mean
       something in the aggregate accumulates pairwise across replications — a growing provenance
       blob, a per-pair comparison retained — and that is the failure that turns a 20 000-
       replication sweep from large into impossible. It is checked rather than extrapolated,
       because it is exactly the term a per-replication cost measured at n = 200 cannot see. */
    const counts = [2, 4, 8, 16];
    const points: (readonly [number, number])[] = [];
    for (const count of counts) {
      const result = await runExperiment(sweepSpec(`perf/footprint-${String(count)}`, count), resources, {
        keepRecords: false,
      });
      points.push([count, Buffer.byteLength(canonicalJson(result), 'utf8')] as const);
    }

    /* ## Affine, not a power law — and the difference matters here
     *
     * A serialized result is `fixed header + n × per-replication`, and the header is large: the
     * cell aggregate, the convergence report, the plan. A log-log fit through that reports an
     * exponent near 0.65 and it would be *wrong* to read that as sublinear growth — it is a
     * constant being amortised. So the check is on the **marginal** bytes per replication across
     * two disjoint intervals of the sweep. Constant marginal cost is linear growth; a marginal
     * that rises with `n` is the superlinear term this test exists to catch, and it would show
     * up as a ratio near the interval ratio rather than near one. */
    const bytesAt = new Map(points.map(([count, bytes]) => [count, bytes]));
    const lowMarginal = ((bytesAt.get(4) as number) - (bytesAt.get(2) as number)) / 2;
    const highMarginal = ((bytesAt.get(16) as number) - (bytesAt.get(8) as number)) / 8;
    const fit = fitPowerLaw(points);

    console.log(
      `\n[perf] retained ExperimentResult footprint (keepRecords: false):\n` +
        points
          .map(([count, bytes]) => `    ${String(count).padStart(3)} reps → ${String(bytes).padStart(8)} B`)
          .join('\n') +
        `\n    marginal bytes/replication: ${lowMarginal.toFixed(0)} B over 2→4, ` +
        `${highMarginal.toFixed(0)} B over 8→16 (ratio ${(highMarginal / lowMarginal).toFixed(2)})` +
        `\n    ${formatFit('footprint vs replications (log-log; sublinear only because the header amortises)', fit)}`,
    );

    expect(lowMarginal).toBeGreaterThan(0);
    /* Ratio 1 is exactly linear. 4 would be what a quadratic term produces across these
       intervals. The bound is set between them and nowhere near either observed value. */
    expect(highMarginal / lowMarginal).toBeLessThan(2);
    expect(highMarginal / lowMarginal).toBeGreaterThan(0.5);
  }, 900_000);
});
