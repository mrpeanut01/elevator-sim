/**
 * **Phase 6's criterion, evaluated on the building it names** — `DECISIONS.md` § D99.
 *
 * `mixedUseHighRise.ts` carries the argument and the result. This suite asserts the four things the
 * result would be worthless without, and one it would be dishonest without:
 *
 * 1. **§ 1 is categorical and structural.** No `role: 'baseline'` profile has a quotable AWT under
 *    the building's own mixed-directional scenario at *any* of three rates, and the unserved
 *    fraction rises as the load falls. That is what makes "the building admits no paired comparison
 *    there" a measurement rather than a preference.
 * 2. **Every point is quotable at its budget, and CRN-aligned.** A cell whose arms are not both
 *    quotable renders `UNQUOTABLE`, and an interval read off unpaired runs is not an interval.
 * 3. **The gate is TTD and the two costs are always present.** § D27: *"A WORSE verdict on AWT does
 *    not fail the phase; omitting it does."* Asserted structurally — for every gate cell there is an
 *    AWT cell and a WT95 cell with a real verdict — so the omission is unfailable rather than
 *    unchecked.
 * 4. **The criterion's verdict matches the cells**, and the pins reproduce.
 * 5. **The half that does not pass is asserted too.** The Level-1 panel does not beat `eta` or
 *    `collective` on the gate at any measured point, and at 4 % it is significantly worse on WT95.
 *    A suite that asserted only the winning arm would be reporting a selected result.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadResources, withProfiles } from '../validation/harness.js';
import type { ExperimentResources } from '../runner/types.js';

import {
  COVERAGE_RATES,
  DECOMPOSITION_ARM,
  LEVEL_0_ARM,
  LEVEL_1_ARM,
  MIXED_USE_GATE,
  MIXED_USE_POINTS,
  baselineProfileIds,
  formatMixedUseHighRise,
  mixedUsePoint,
  resolutionTable,
  runMixedUseHighRiseStudy,
  type MixedUseStudy,
} from './mixedUseHighRise.js';
import { checkPinned, describeMismatches, mixedUseFigures } from './published.js';

/** Three points and a three-rate coverage census on a 60-floor, 16-car building. */
const TIMEOUT_MS = 900_000;

let study: MixedUseStudy;
let resources: ExperimentResources;

beforeAll(async () => {
  resources = withProfiles(await loadResources(), []);
  study = await runMixedUseHighRiseStudy({ resources });
  console.log(formatMixedUseHighRise(study));
}, TIMEOUT_MS);

/* -------------------------------------------------------------------------- *
 * The baselines are data
 * -------------------------------------------------------------------------- */

describe('the naive baselines are read out of data/, not named in code', () => {
  it('finds every profile carrying role: "baseline" and nothing else', async () => {
    const config = await loadResources();
    const found = baselineProfileIds(config.dispatcherProfilesById);
    expect(found.length).toBeGreaterThanOrEqual(2);
    for (const id of found) {
      expect(config.dispatcherProfilesById.get(id)?.role).toBe('baseline');
    }
    for (const [id, profile] of config.dispatcherProfilesById) {
      if (profile.role === 'baseline') expect(found).toContain(id);
    }
    // Invariant 7: the criterion's "naive baselines" resolves through the data, so a fourth one
    // authored tomorrow joins the gate without a code change.
    expect(study.baselines).toEqual(found);
  });

  it('refuses to gate at all when data/ declares no baseline', () => {
    expect(() => baselineProfileIds(new Map())).toThrow(/no profile with role "baseline"/);
  });
});

/* -------------------------------------------------------------------------- *
 * § 1 — the building's own scenario
 * -------------------------------------------------------------------------- */

describe('§ 1 — the building’s own scenario admits no paired comparison, and the reason is structural', () => {
  it('leaves every baseline without a quotable AWT at every rate', () => {
    for (const rate of COVERAGE_RATES) {
      for (const baseline of study.baselines) {
        const row = study.coverage.rows.find(
          (entry) => entry.rate === rate && entry.armId === baseline,
        );
        expect(row, `no coverage row for ${baseline} at ${String(rate)} %`).toBeDefined();
        expect(
          row?.quotable,
          `${baseline} has a quotable AWT at ${String(rate)} % on the mixed-directional scenario, ` +
            'so a paired-t interval IS available there and § 1 of the module docstring is wrong.',
        ).toBe(false);
        expect(row?.meanUndelivered ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('serves the same traffic completely with a credential-aware arm', () => {
    // The contrast is what makes § 1 a statement about the *call type* rather than about the
    // building being too small. Same building, same trace, same rates.
    for (const rate of COVERAGE_RATES) {
      for (const armId of [DECOMPOSITION_ARM, LEVEL_1_ARM]) {
        const row = study.coverage.rows.find(
          (entry) => entry.rate === rate && entry.armId === armId,
        );
        expect(row?.quotable, `${armId} unquotable at ${String(rate)} %`).toBe(true);
        expect(row?.meanUndelivered).toBe(0);
        expect(row?.notCompleted).toBe(0);
      }
    }
  });

  it('finds the unserved fraction RISING as the load falls — structural, not load-driven', () => {
    // The whole discrimination. An overloaded building serves a larger *fraction* as demand drops;
    // a building that structurally refuses a share of its demand serves a smaller one, because the
    // servable traffic is what went away.
    expect(study.coverage.unservedRisesAsLoadFalls).toBe(true);
    expect(study.coverage.verdict).toBe('STRUCTURAL');
    expect(study.coverage.verdictReason).toMatch(/RISES as the load falls/);
  });
});

/* -------------------------------------------------------------------------- *
 * The apparatus
 * -------------------------------------------------------------------------- */

describe('every operating point is quotable at its budget, paired, and inside its ceiling', () => {
  it('has every arm quotable and every replication CRN-aligned', () => {
    for (const point of study.points) {
      expect(
        point.unquotableArms,
        `${point.id}: these arms lost their AWT at n = ${String(point.replications)}, so the ` +
          'budget is above this building’s ceiling and the cells are UNQUOTABLE.',
      ).toEqual([]);
      expect(point.quotable).toBe(true);
      expect(point.crnAligned, `${point.id}: the arms did not see the same populations`).toBe(true);
    }
  });

  it('spends a budget below the measured ceiling, wherever there is one', () => {
    for (const point of MIXED_USE_POINTS) {
      if (point.ceiling === undefined) continue;
      expect(
        point.replications,
        `${point.id} is budgeted at ${String(point.replications)} against a censused ceiling of ` +
          `${String(point.ceiling)}. Above the ceiling some arm has no quotable AWT.`,
      ).toBeLessThan(point.ceiling);
    }
  });

  it('states where every budget came from, and never from another study’s n (§ D99)', () => {
    for (const point of MIXED_USE_POINTS) {
      expect(point.budgetBasis.length, `${point.id} has no stated budget basis`).toBeGreaterThan(80);
      expect(point.prediction.length, `${point.id} has no prediction stated in advance`)
        .toBeGreaterThan(80);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The decomposition
 * -------------------------------------------------------------------------- */

describe('the call type alone is worth exactly zero here, and the study says so by measurement', () => {
  it('is bit-identical to eta on every replication of every point', () => {
    for (const point of study.points) {
      expect(
        point.decompositionIdentical,
        `${point.id}: the shipped destination profile differs from eta on ` +
          `${String(point.replications - point.decompositionIdentical)} replications. Every pickup ` +
          'here is at G, which is in no access zone, so a credential should buy nothing until a ' +
          'weight reads the destination — if that has changed, the decomposition below is no ' +
          'longer "the weight, all of it".',
      ).toBe(point.replications);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The gate — § D27's shape
 * -------------------------------------------------------------------------- */

describe('the gate is TTD, and AWT and WT95 are reported beside it with verdicts (§ D27)', () => {
  it('carries an AWT cell and a WT95 cell for every gate cell — omitting one fails the phase', () => {
    for (const point of study.points) {
      const gates = point.cells.filter((cell) => cell.metric === MIXED_USE_GATE);
      expect(gates.length).toBeGreaterThan(0);
      for (const gate of gates) {
        for (const metric of ['awtS', 'wt95S'] as const) {
          const cost = point.cell(gate.armId, gate.baselineId, metric);
          expect(cost.verdict, `${point.id} ${gate.armId}−${gate.baselineId} ${metric}`).not.toBe(
            'UNQUOTABLE',
          );
          expect(Number.isFinite(cost.estimate.mean)).toBe(true);
        }
      }
    }
  });

  it('finds the Level-0 arm BETTER on TTD against every baseline at up-peak 4 %', () => {
    const point = mixedUsePoint(study, 'up-peak-4pct');
    expect(point).toBeDefined();
    if (point === undefined) return;
    for (const baseline of study.baselines) {
      const gate = point.cell(LEVEL_0_ARM, baseline, MIXED_USE_GATE);
      expect(
        gate.verdict,
        `${LEVEL_0_ARM} − ${baseline} on ${MIXED_USE_GATE}: ` +
          `${gate.estimate.mean.toFixed(3)} [${gate.estimate.lower.toFixed(3)}, ${gate.estimate.upper.toFixed(3)}]`,
      ).toBe('BETTER');
      expect(gate.estimate.upper).toBeLessThan(0);
    }
    // The honest cost, asserted rather than merely present: this is the sign split D27 exists for.
    expect(point.cell(LEVEL_0_ARM, 'eta', 'awtS').verdict).toBe('WORSE');
    expect(point.cell(LEVEL_0_ARM, 'eta', 'rideMeanS').verdict).toBe('BETTER');
  });

  it('finds the Level-1 panel NOT beating eta or collective on TTD at any point', () => {
    // The half that fails, asserted so it cannot quietly stop being reported. The panel wins
    // against nearest-car everywhere and against the two collective-class baselines nowhere.
    for (const point of study.points) {
      for (const baseline of ['eta', 'collective']) {
        if (!study.baselines.includes(baseline)) continue;
        expect(
          point.cell(LEVEL_1_ARM, baseline, MIXED_USE_GATE).verdict,
          `${point.id}: ${LEVEL_1_ARM} − ${baseline} on the gate`,
        ).not.toBe('BETTER');
      }
    }
    const heavy = mixedUsePoint(study, 'up-peak-4pct');
    expect(heavy?.cell(LEVEL_1_ARM, 'eta', 'wt95S').verdict).toBe('WORSE');
    expect(heavy?.cell(LEVEL_1_ARM, 'eta', 'awtS').verdict).toBe('WORSE');
  });

  it('reports the blind control as blind, with the count that says why', () => {
    const point = mixedUsePoint(study, 'up-peak-1pct');
    expect(point?.blind).toBe(true);
    if (point === undefined) return;
    for (const baseline of ['eta', 'collective']) {
      if (!study.baselines.includes(baseline)) continue;
      const gate = point.cell(LEVEL_0_ARM, baseline, MIXED_USE_GATE);
      expect(gate.verdict).toBe('INDISTINGUISHABLE');
      // Blind, not merely under-powered: a large share of replications produce an exactly-zero
      // paired difference, which is what `arms.ts` § Phase 6a means by a point being blind.
      expect(gate.comparison.exactZeroCount / gate.comparison.n).toBeGreaterThan(0.25);
      // And the required n is far above anything the project's budget band allows.
      expect(gate.requiredReplications ?? 0).toBeGreaterThan(200);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The verdict, and the resolution it rests on
 * -------------------------------------------------------------------------- */

describe('the criterion’s verdict is derived from the cells, not written', () => {
  it('agrees with a recount of the gate cells', () => {
    const recount: string[] = [];
    for (const point of study.points) {
      if (!point.quotable) continue;
      for (const candidate of study.candidates) {
        const beatsAll = study.baselines.every(
          (baseline) => point.cell(candidate, baseline, MIXED_USE_GATE).verdict === 'BETTER',
        );
        if (beatsAll) recount.push(`${candidate}@${point.id}`);
      }
    }
    expect([...study.criterion.metBy].sort()).toEqual(recount.sort());
    expect(study.criterion.met).toBe(recount.length > 0);
  });

  it('is MET on this building, by the Level-0 arm at the heavy point', () => {
    expect(
      study.criterion.met,
      'Phase 6’s criterion is NOT met on mixed-use-high-rise. That is a real outcome and must be ' +
        'reported as one — see DECISIONS.md § D99. Do not weaken the criterion to make it pass.',
    ).toBe(true);
    expect(study.criterion.metBy).toContain(`${LEVEL_0_ARM}@up-peak-4pct`);
  });

  it('reports a required n above the ceiling where a contrast is permanently unresolvable', () => {
    const rows = resolutionTable(study);
    expect(rows.length).toBe(
      study.points.length * study.candidates.length * study.baselines.length,
    );
    // docs/07-handoff.md § 4: an effect below the resolution limit is "not measurable at that
    // budget", never a win and never "needs more replications". At least one contrast here is in
    // that position, and the table is what says so.
    const unresolvable = rows.filter((row) => row.resolvable === false);
    expect(unresolvable.length).toBeGreaterThan(0);
    for (const row of unresolvable) {
      expect(row.requiredReplications ?? 0).toBeGreaterThan(row.ceiling ?? 0);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Layer A of the publication guard
 * -------------------------------------------------------------------------- */

describe('the published figures still reproduce', () => {
  it('matches every pinned estimate, in both directions', () => {
    const mismatches = checkPinned('mixed-use-high-rise', mixedUseFigures(study));
    expect(
      describeMismatches('mixed-use-high-rise', mismatches),
      describeMismatches('mixed-use-high-rise', mismatches),
    ).toBe('');
  });
});
