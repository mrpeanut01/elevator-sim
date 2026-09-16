/**
 * **GitHub issue #437 stage 2's measurement, and the claims drawn from it** — `DECISIONS.md`
 * § D619.
 *
 * `landingPanelDeployment.ts`'s header publishes six intervals and three verdicts. This file runs
 * the study once and asserts every one of them, plus the apparatus they rest on: that the three
 * deployments saw one crowd, that each arm is the passenger model it claims to be, that the panel
 * counts are the quantity the price schedule's `landing-panels` row multiplies, and that
 * `core`'s own pairing rule refuses the nine model-sensitive metrics on every pair here.
 *
 * The pin comparison is Layer A of `published.ts`'s guard, run where the study already is.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { MODEL_SENSITIVE_METRIC_IDS } from '@elevator-sim/core';

import {
  LANDING_PANEL_ARMS,
  LANDING_PANEL_DISPATCHER,
  LANDING_PANEL_GATE,
  LANDING_PANEL_METRICS,
  LANDING_PANEL_PAIRS,
  LANDING_PANEL_REPLICATIONS,
  LANDING_PANEL_SEED,
  landingPanelCell,
  landingPanelPair,
  landingPanelPairKey,
  runLandingPanelDeploymentStudy,
  type LandingPanelDeploymentStudy,
} from './landingPanelDeployment.js';
import { checkPinned, describeMismatches, landingPanelFigures } from './published.js';

let study: LandingPanelDeploymentStudy;

beforeAll(async () => {
  study = await runLandingPanelDeploymentStudy({});
}, 1_800_000);

/** Both cells, by the id the study gives them. */
const UP_PEAK = 'up-peak-1pct';
const MIXED = 'mixed-1.5pct';

describe('the apparatus, before anything is read off it', () => {
  it('feeds all three deployments the same passenger traces', () => {
    // Common random numbers, asserted rather than assumed. The three arms are three *buildings*,
    // which is exactly the case where a cohort can silently split — see the module's note on
    // `traceKeyOf` keying on the building id.
    for (const cell of study.cells) {
      expect(cell.crnAligned, `${cell.cellId} handed its arms different traffic`).toBe(true);
    }
  });

  it('runs one dispatcher and one seed, at the declared budget', () => {
    expect(study.seed).toBe(LANDING_PANEL_SEED);
    expect(study.dispatcherId).toBe(LANDING_PANEL_DISPATCHER);
    for (const cell of study.cells) {
      expect(cell.replications).toBe(LANDING_PANEL_REPLICATIONS);
      expect(cell.dispatcherId).toBe(LANDING_PANEL_DISPATCHER);
    }
    // CLAUDE.md § Statistical discipline: 50-200.
    expect(LANDING_PANEL_REPLICATIONS).toBeGreaterThanOrEqual(50);
    expect(LANDING_PANEL_REPLICATIONS).toBeLessThanOrEqual(200);
  });

  it('quotes nothing from a saturated cell — every arm of both cells is clean', () => {
    for (const cell of study.cells) {
      for (const arm of cell.arms) {
        expect(arm.saturatedCount, `${cell.cellId}/${arm.armId} saturated`).toBe(0);
        expect(arm.awtIsValid, `${cell.cellId}/${arm.armId} lost its AWT`).toBe(true);
      }
    }
  });
});

describe('the deployments are what they claim to be', () => {
  it('is three arms of ascending panel count, and the counts are the price schedule’s quantity', () => {
    for (const cell of study.cells) {
      const byArm = new Map(cell.arms.map((arm) => [arm.armId, arm]));
      expect([...byArm.keys()]).toEqual([...LANDING_PANEL_ARMS]);
      // Midtown Office authors twenty-one landings and flags two of them `isEntrance`. The middle
      // figure is derived from the building rather than written here, which is the whole reason a
      // hybrid is a measurement rather than a choice this file made.
      expect(byArm.get('none')?.panelCount).toBe(0);
      expect(byArm.get('entrance')?.panelCount).toBe(2);
      expect(byArm.get('full')?.panelCount).toBe(21);
    }
  });

  it('is one passenger model per arm, and the hybrid is the middle one', () => {
    for (const cell of study.cells) {
      const byArm = new Map(cell.arms.map((arm) => [arm.armId, arm.passengerModel]));
      expect(byArm.get('none')).toBe('conventional');
      expect(byArm.get('entrance')).toBe('hybrid');
      expect(byArm.get('full')).toBe('destination-dispatch');
    }
  });
});

describe('what may be paired is core’s decision, not this study’s', () => {
  it('refuses all nine model-sensitive metrics on every pair, and permits the gate on all of them', () => {
    // § D553's pairing rule biting on a real measurement: no two arms here run the same landing
    // models, so AWT and WT95 measure different constructs on either side and may not be read as a
    // difference. TTD is the one span that survives, which is why it is the gate.
    for (const cell of study.cells) {
      for (const pair of cell.pairs) {
        const expected = !MODEL_SENSITIVE_METRIC_IDS.includes(pair.metric);
        expect(pair.comparable, `${cell.cellId}/${pair.candidateId}-${pair.baselineId}/${pair.metric}`).toBe(
          expected,
        );
      }
      for (const [candidateId, baselineId] of LANDING_PANEL_PAIRS) {
        expect(landingPanelPair(cell, candidateId, baselineId, LANDING_PANEL_GATE).comparable).toBe(
          true,
        );
      }
    }
  });

  it('never lets a refused metric carry a BETTER or a WORSE', () => {
    // The refusal is a value rather than a caveat: a caller reading `verdict` cannot obtain a
    // direction from a metric core says is not a difference. Asserted in both directions, so the
    // field cannot become a constant that happens to read `NOT-COMPARABLE` everywhere.
    let comparableSeen = 0;
    for (const cell of study.cells) {
      for (const pair of cell.pairs) {
        if (pair.comparable) {
          comparableSeen += 1;
          expect(pair.verdict).toBe(pair.comparison.verdict);
        } else {
          expect(pair.verdict).toBe('NOT-COMPARABLE');
        }
      }
    }
    expect(comparableSeen).toBeGreaterThan(0);
  });
});

describe('the up-peak cell: two panels buy exactly what twenty-one do', () => {
  it('is bit-identical between the hybrid and the full deployment, on every metric', () => {
    // Incoming-only demand weighted entirely to G registers every call at G, so the nineteen
    // panels the hybrid leaves out are never pressed. Stated as an exact-zero count over the
    // whole budget rather than as an interval that happens to be narrow.
    const cell = landingPanelCell(study, UP_PEAK);
    for (const metric of LANDING_PANEL_METRICS) {
      const pair = landingPanelPair(cell, 'entrance', 'full', metric);
      expect(pair.exactZeroCount, `${metric} differed somewhere`).toBe(LANDING_PANEL_REPLICATIONS);
      expect(pair.comparison.estimate.mean).toBe(0);
      expect(pair.comparison.verdict).toBe('IDENTICAL');
    }
  });

  it('cannot distinguish either deployment from buttons on the gate, and says how far off it is', () => {
    const cell = landingPanelCell(study, UP_PEAK);
    for (const armId of ['entrance', 'full'] as const) {
      const gate = landingPanelPair(cell, armId, 'none', LANDING_PANEL_GATE);
      expect(gate.verdict).toBe('INDISTINGUISHABLE');
      expect(gate.comparison.estimate.lower).toBeLessThan(0);
      expect(gate.comparison.estimate.upper).toBeGreaterThan(0);
      // The interval straddling zero is half the claim; the other half is that no budget this
      // project permits would resolve it — CLAUDE.md's band tops out at 200.
      expect(gate.comparison.requiredReplications ?? 0).toBeGreaterThan(1000);
    }
  });
});

describe('the mixed cell: the landings a hybrid leaves out are landings that are used', () => {
  it('puts both deployments ahead of buttons on the gate, resolvably', () => {
    const cell = landingPanelCell(study, MIXED);
    for (const armId of ['entrance', 'full'] as const) {
      const gate = landingPanelPair(cell, armId, 'none', LANDING_PANEL_GATE);
      expect(gate.verdict, armId).toBe('BETTER');
      expect(gate.comparison.estimate.upper, armId).toBeLessThan(0);
      expect(gate.comparison.requiredReplications, armId).toBe(1);
    }
  });

  it('orders them monotonically in panels, with the hybrid short of the full deployment', () => {
    const cell = landingPanelCell(study, MIXED);
    const hybrid = landingPanelPair(cell, 'entrance', 'none', LANDING_PANEL_GATE);
    const full = landingPanelPair(cell, 'full', 'none', LANDING_PANEL_GATE);
    const between = landingPanelPair(cell, 'entrance', 'full', LANDING_PANEL_GATE);
    expect(full.comparison.estimate.mean).toBeLessThan(hybrid.comparison.estimate.mean);
    expect(between.verdict).toBe('WORSE');
    expect(between.comparison.estimate.lower).toBeGreaterThan(0);
    // And the two readings agree: (entrance − none) − (full − none) is (entrance − full).
    expect(
      hybrid.comparison.estimate.mean - full.comparison.estimate.mean,
    ).toBeCloseTo(between.comparison.estimate.mean, 9);
  });

  it('reports the energy cost beside the gate rather than folded into it', () => {
    // § D106: energy is an axis, never a score, and it is per served leg so that a deployment
    // which saved work by carrying fewer people could not win on it.
    const cell = landingPanelCell(study, MIXED);
    for (const armId of ['entrance', 'full'] as const) {
      const energy = landingPanelPair(cell, armId, 'none', 'energyPerServedLegKJ');
      expect(energy.comparable, armId).toBe(true);
      expect(energy.verdict, armId).toBe('WORSE');
    }
  });
});

describe('the published figures still reproduce', () => {
  it('matches every pin in published.ts', () => {
    const measured = landingPanelFigures(study);
    // Twenty-four: two cells × three pairs × four metrics, and the key is the study's own.
    expect(measured.size).toBe(2 * LANDING_PANEL_PAIRS.length * LANDING_PANEL_METRICS.length);
    expect(
      measured.has(
        landingPanelPairKey(UP_PEAK, {
          candidateId: 'entrance',
          baselineId: 'none',
          metric: LANDING_PANEL_GATE,
        }),
      ),
    ).toBe(true);
    const mismatches = checkPinned('landing-panel-deployment', measured);
    expect(mismatches, describeMismatches('landing-panel-deployment', mismatches)).toEqual([]);
  });
});
