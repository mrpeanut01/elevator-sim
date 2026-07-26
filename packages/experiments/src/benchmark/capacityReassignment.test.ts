/**
 * **Stage 5's load-driven trigger: reachable, and inert where it counts.**
 *
 * docs/05-roadmap.md § Phase 5 lists *"capacity-aware reassignment when a car crosses the bypass
 * threshold"* as scope. This suite is the acceptance evidence for that bullet, and it asserts two
 * things that a reader could otherwise not tell apart:
 *
 * 1. **The mechanism is reached.** `capacityCrossings` and `capacityHeld` rise with load through the
 *    shipped path, so a migration count of zero means *the policy kept the call*, not *the call site
 *    is missing*. This is the assertion whose absence let four Phase 5 behaviours ship disconnected.
 * 2. **It migrates nothing at any load where an AWT interval may be quoted.** The finding, pinned as
 *    a finding. If a future change makes the trigger pay at a reportable load, this test goes red and
 *    the report has to be rewritten — which is the correct outcome, because that is a result.
 *
 * Nothing here is tuned to pass. The loads are the ones `saturationCensus.test.ts` measures as the
 * quotable range for this building, chosen before the answer was known, and the two loads past it are
 * present so the report can say where the mechanism *does* fire and what state the queues are in when
 * it does.
 */

import { describe, expect, it } from 'vitest';

import {
  STAGE5_BUILDING,
  STAGE5_LOADS,
  STAGE5_PROFILE,
  formatCapacityReassignment,
  runCapacityReassignmentStudy,
  withoutReassignment,
  type Stage5Study,
} from './capacityReassignment.js';
import { loadResources } from '../validation/harness.js';

const TIMEOUT_MS = 900_000;

/** Modest but not token: 40 replications resolve a per-run count of 0.15 from a count of 0. */
const REPLICATIONS = 40;

let cached: Stage5Study | undefined;

async function study(): Promise<Stage5Study> {
  cached ??= await runCapacityReassignmentStudy({ replications: REPLICATIONS });
  return cached;
}

describe('Phase 5 scope — capacity-driven reassignment on the load edge', () => {
  it('prints the stage-5 table', async () => {
    console.log(formatCapacityReassignment(await study()));
  }, TIMEOUT_MS);

  it('is a one-field control: the only difference is dispatch.reassignmentPolicy', async () => {
    // The whole validity of every interval in this study. A control that differed anywhere else
    // would produce an interval on that instead (CLAUDE.md invariant 7 — the variant is data).
    const resources = await loadResources();
    const base = resources.dispatcherProfilesById.get(STAGE5_PROFILE);
    expect(base, `data/dispatcher-profiles.json must ship "${STAGE5_PROFILE}"`).toBeDefined();
    const control = withoutReassignment(base as NonNullable<typeof base>);

    expect(control.dispatch?.reassignmentPolicy).toBe('never');
    expect((base as NonNullable<typeof base>).dispatch?.reassignmentPolicy).toBe('until-commitment');
    expect(control.weights).toEqual((base as NonNullable<typeof base>).weights);
    expect(control.idle).toEqual((base as NonNullable<typeof base>).idle);
    expect(control.answer).toEqual((base as NonNullable<typeof base>).answer);
    // Every stage-5 tunable other than the policy switch is carried across, so the control is the
    // same dispatcher with the stage turned off rather than a differently-configured one.
    expect(control.dispatch?.commitmentPoint).toBe(
      (base as NonNullable<typeof base>).dispatch?.commitmentPoint,
    );
    expect(control.dispatch?.reassignmentHysteresisS).toBe(
      (base as NonNullable<typeof base>).dispatch?.reassignmentHysteresisS,
    );
  }, TIMEOUT_MS);

  it('pairs every load under common random numbers', async () => {
    const outcome = await study();
    expect(outcome.rows.map((row) => row.arrivalRatePctPop5min)).toEqual([...STAGE5_LOADS]);
    for (const row of outcome.rows) {
      expect(row.crnAligned, `load ${row.arrivalRatePctPop5min} % is not paired`).toBe(true);
    }
    expect(outcome.building).toBe(STAGE5_BUILDING);
  }, TIMEOUT_MS);

  it('reaches the monitor: cars cross their threshold and the sweep looks at their calls', async () => {
    // "Off" and "never wired" produce the same migration count. The crossing and held counts are what
    // separate them, and they are the reason `StageActivity` carries three numbers rather than one.
    const outcome = await study();
    expect(outcome.loadsWithCrossings.length).toBeGreaterThan(0);
    const heaviest = outcome.rows[outcome.rows.length - 1];
    expect(heaviest, 'the sweep must have a heaviest load').toBeDefined();
    expect((heaviest as NonNullable<typeof heaviest>).treatment.crossingsPerRun).toBeGreaterThan(0);
    expect((heaviest as NonNullable<typeof heaviest>).treatment.heldPerRun).toBeGreaterThan(0);

    // And the control, which cannot migrate, still sweeps — so the counters are the runner's and not
    // the policy's.
    expect((heaviest as NonNullable<typeof heaviest>).control.crossingsPerRun).toBeGreaterThan(0);
    expect((heaviest as NonNullable<typeof heaviest>).control.migrationsPerRun).toBe(0);
  }, TIMEOUT_MS);

  it('finds the trigger inert at every load whose AWT may be quoted, and names where it fires', async () => {
    const outcome = await study();
    const quotable = outcome.rows.filter((row) => row.quotable);
    expect(quotable.length, 'no load was quotable — the sweep has nothing to report on').toBeGreaterThan(0);

    for (const row of quotable) {
      expect(
        row.treatment.migrationsPerRun,
        `the load-crossing trigger fired at ${row.arrivalRatePctPop5min} %, which IS quotable — the report's headline finding has changed and must be rewritten`,
      ).toBe(0);
    }
    expect(outcome.inertWhereQuotable).toBe(true);

    // Where it does fire, say so, and say what the queues were doing.
    expect(outcome.firstFiringLoad, 'the trigger never fired at any load in the sweep').toBeDefined();
    const firing = outcome.rows.find(
      (row) => row.arrivalRatePctPop5min === outcome.firstFiringLoad,
    );
    expect(firing?.quotable, 'the first firing load is quotable, which contradicts the row above').toBe(
      false,
    );
    console.log(
      `Stage 5 first migrates a call at ${String(outcome.firstFiringLoad)} % of population per 5 minutes, ` +
        `where ${String(firing?.treatment.saturatedCount)}/${REPLICATIONS} replications have a diverging queue ` +
        `and ${String(firing?.treatment.validAwtCount)}/${REPLICATIONS} have a quotable AWT. ` +
        `Quotable loads: ${outcome.quotableLoads.join(', ')} — migrations per run at each: ` +
        `${quotable.map((row) => row.treatment.migrationsPerRun.toFixed(2)).join(', ')}.`,
    );
  }, TIMEOUT_MS);

  it('reports reassignment as a whole separately from the trigger, and only where quotable', async () => {
    // Turning `reassignmentPolicy` off gates ALL of stage 5, not just the load edge — so this
    // interval is an interval on reassignment, and the migration counts above are what say how much
    // of it the load edge accounts for. On the quotable rows: none of it.
    const outcome = await study();
    for (const row of outcome.rows) {
      if (row.quotable) continue;
      // An unquotable row must never be read as a result. Nothing here asserts on its interval; the
      // formatter suppresses it, and this pins that it does.
      expect(formatCapacityReassignment(outcome)).toContain('suppressed');
    }
    const quotable = outcome.rows.filter((row) => row.quotable);
    for (const row of quotable) {
      const d = row.differences.awtS;
      console.log(
        `reassignment at ${row.arrivalRatePctPop5min} %: d AWT ${d.mean.toFixed(4)} ` +
          `[${d.lower.toFixed(4)}, ${d.upper.toFixed(4)}], ${row.exactZeroCount}/${REPLICATIONS} paired ` +
          `differences exactly zero, load-crossing migrations ${row.treatment.migrationsPerRun.toFixed(2)}/run.`,
      );
    }
  }, TIMEOUT_MS);
});
