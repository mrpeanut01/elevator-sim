/**
 * **Searching a scenario's dial stratum for a witness vector, at a sample size of the caller's
 * choosing** — `docs/38` § 2.1's *"a stage the dropdown alone does not clear and a witness vector
 * that does"*, and GitHub issue **#234**.
 *
 * `measureSurvivors.ts` judges a whole cell at the published sample size and produces a **count**.
 * This file is the other question asked of the same space: *does a way through exist at all, and
 * what is it?* It reuses `survivorSpace.ts`'s sampler and `campaign/stageSequence.ts`'s judge
 * without reimplementing either, so a witness found here is a way through in exactly the sense the
 * product means by it — `stageRun.ts`'s founding argument, which this repository has paid for at
 * three levels.
 *
 * ## Why this exists: the published zero is a sample, and it was read as a census
 *
 * `survivors.ts` says it in its own words — *"the dropdown is a **census** … the dials are a
 * **sample**"* — and `dialShareInterval` derives an exact Clopper–Pearson interval at read time, so
 * at `SURVIVOR_SAMPLE_SIZE = 12` a dial count of zero bounds the clearing share at **about a
 * quarter**, not at nothing. That did not stop *"0 of 360 — not one clears"* being circulated as a
 * proof that no dial edit wins anywhere in the campaign. It is not one, and the difference is not
 * academic: measured here, stage 1 has dial ways through at the base rung and the published cell
 * missed them by drawing twelve.
 *
 * **A count and a search want different sample sizes, and that is the whole reason for two files.**
 * The published table's `k` is fixed at 12 because `data/scenario-survivor-bands.json` records
 * `approvedAtSampleSize: 12` and `survivorBands.test-helper.ts#sampleSizeIssue` refuses a table
 * regenerated at another one until the owner re-approves the band — a share is a share of what was
 * judged, so widening `k` silently moves every band reading. A **search** is under no such
 * constraint, because it publishes no share against a band: it reports which draw indices cleared
 * and what they bought.
 *
 * ## The draw is a prefix, which is what makes a widened search comparable
 *
 * `sampleReachableConfigurations` runs one loop against one seeded stream and stops when it has
 * accepted `sampleSize` configurations. The stream, the bundle draw and the admission filter do not
 * depend on `sampleSize` — only the stopping point does — so **the first twelve configurations
 * drawn at k = 200 are the same twelve, in the same order, that the published table drew at k = 12**.
 * A search at a larger `k` therefore extends the published cell rather than replacing it, and a
 * witness at index 30 is a configuration the published draw never reached rather than one it
 * reached and judged differently.
 *
 * ## The shipped sweep was reproduced first, and that is what makes the widening a finding
 *
 * Before anything was widened, `measureScenarioSurvivors` was re-run on `stage-1-first-call` at the
 * published `sampleSize` of 12 on this tree and **reproduced the published cell to the string**:
 * base `1/18` (dropdown 1/6, dials 0/12, suppressed 3), equipment `1/24`, building `1/24`
 * (suppressed 4), `zoned-uppeak` the survivor at every rung. 28 s.
 *
 * That ordering is the whole argument. `CLAUDE.md`'s oldest lesson about a published number is that
 * only a re-measurement tells a **correction** apart from a **move**; without it, three witnesses
 * at k = 200 would be indistinguishable from a judge that had drifted since the table was pinned.
 *
 * ## Not a `*.test.ts`
 *
 * vitest's `include` is `src/**\/*.test.ts`, and this reads `data/` from Node, which
 * `boundaries.test.ts` confines to the dev entry point and the test helpers. It is also deliberately
 * **not** gated behind an environment variable: `deepTiers.test.ts` derives the gated set from disk
 * and a tenth tier arriving unwired is a red pull request, correctly. The always-on caller
 * (`dialWitness.test.ts`) judges a handful of pinned indices and costs seconds; a lane that wants a
 * wide sweep passes a large `sampleSize` and pays for it in its own driver.
 *
 * The decision this module took is recorded here and cites [§ D405](../../../../DECISIONS.md): the
 * search instrument binds nothing outside `scenario/`. What it **found** reaches past this module
 * and is [§ D691](../../../../DECISIONS.md).
 */

import { loadConfig } from '@elevator-sim/core';
import type {
  DispatcherProfile,
  ElevatorSpecs,
  ResolvedBuilding,
} from '@elevator-sim/core/browser';
import type { ParameterValue } from '@elevator-sim/experiments/browser';
import { collectSearchSpace } from '@elevator-sim/experiments/browser';

import { runBatch } from '../batch/runBatch.js';
import { runStageToVerdict } from '../campaign/stageSequence.js';
import type { CampaignStage } from '../campaign/types.js';
import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import { rungsOf } from './budget.js';
import type { PublishedScenario } from './published.js';
import { loadSurvivorFixture, SURVIVOR_MASTER_SEED } from './regenerateSurvivors.test-helper.js';
import { sampleReachableConfigurations, samplerSeedFor } from './survivorSpace.js';

/** One drawn dial configuration, with the index the draw gave it. The index is how a witness is named. */
export interface DialDraw {
  /** Position in the draw, zero-based. `measureSurvivors.ts` names the same configuration `edit-<n>`. */
  readonly index: number;
  /** Price-schedule change ids the configuration bought. */
  readonly changeIds: readonly string[];
  /** The dearest price tier it reached. */
  readonly tier: string;
  /** What it cost at this rung, distinct changes summed once. */
  readonly units: number;
  /** The dials it moved off the baseline, and what to. */
  readonly values: Readonly<Record<string, ParameterValue>>;
}

/** What judging one drawn configuration found. The fields are `JudgedConfiguration`'s, by name. */
export interface DialVerdict extends DialDraw {
  /** `StageReport.cleared` — both seed sets, the shipped meaning of *through*. */
  readonly cleared: boolean;
  /** Met every bar on the tuning seeds, whatever the holdout said. */
  readonly metOnTuningSeeds: boolean;
  /** A goal the judge could not answer on the tuning batch. Neither passed nor failed. */
  readonly unjudged: boolean;
}

/** Everything a search needs, resolved from the shipped `data/` once. */
export interface WitnessFixture {
  readonly stage: CampaignStage;
  readonly published: PublishedScenario;
  readonly baseline: DispatcherProfile;
  readonly building: ResolvedBuilding;
  /** The sensor defaults those cars resolve against — the sampler needs them to refuse a vector the cars will not take. */
  readonly elevatorSpecs: ElevatorSpecs | undefined;
  readonly run: (request: Parameters<typeof runBatch>[0]) => ReturnType<typeof runBatch>;
}

/**
 * Load one shipped stage, its goal row, its baseline profile and its building.
 *
 * The shipped `data/` rather than a fixture, for `measureSurvivors.ts`'s reason: a witness judged
 * against a hand-built stage would be a way through something that does not ship.
 */
export async function witnessFixtureFor(stageId: string): Promise<WitnessFixture> {
  const config = await loadConfig(DATA_DIR);
  const { campaign, published } = await loadSurvivorFixture();
  const stage = campaign.stages.find((entry) => entry.id === stageId);
  if (stage === undefined) throw new Error(`no campaign stage "${stageId}"`);
  const row = published.scenarios.find((entry) => entry.id === stageId);
  if (row === undefined) throw new Error(`no published goal row for "${stageId}"`);
  const baseline = config.dispatcherProfilesById.get(stage.dispatcher.startingProfileId);
  if (baseline === undefined) {
    throw new Error(`no dispatcher profile "${stage.dispatcher.startingProfileId}"`);
  }
  const resources = {
    building: requireBuilding(config, stage.building),
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
  return {
    stage,
    published: row,
    baseline,
    building: resources.building,
    elevatorSpecs: resources.elevatorSpecs,
    run: (request) => runBatch(request, resources),
  };
}

/**
 * Draw the dial stratum at one rung, without judging any of it.
 *
 * Pure and fast — no simulation. Separated from {@link judgeDialDraws} because the draw is what
 * makes a witness *nameable*: an index is only meaningful beside the draw that produced it, and a
 * caller that wants to re-check one pinned witness must be able to reproduce the draw without
 * paying for the other 199.
 */
export async function drawDialConfigurations(input: {
  readonly fixture: WitnessFixture;
  readonly sampleSize: number;
  /** `null` for the base rung; otherwise a step id from the stage's own budget. */
  readonly stepId?: string | null;
  readonly masterSeed?: number;
}): Promise<readonly DialDraw[]> {
  const { fixture, sampleSize } = input;
  const stepId = input.stepId ?? null;
  const masterSeed = input.masterSeed ?? SURVIVOR_MASTER_SEED;
  const rung = rungsOf(fixture.stage.budget).find((entry) => entry.stepId === stepId);
  if (rung === undefined) {
    throw new Error(`stage "${fixture.stage.id}" has no budget rung "${String(stepId)}"`);
  }
  const drawn = sampleReachableConfigurations({
    space: collectSearchSpace(),
    schedule: shippedPriceSchedule(),
    baseline: fixture.baseline,
    building: fixture.building,
    elevatorSpecs: fixture.elevatorSpecs,
    units: rung.units,
    sampleSize,
    seed: samplerSeedFor(masterSeed, fixture.stage.id, stepId),
  });
  return drawn.configurations.map((configuration, index) => ({
    index,
    changeIds: configuration.changeIds,
    tier: configuration.tier,
    units: configuration.units,
    values: configuration.values,
  }));
}

/**
 * Judge named draws through the shipped sequence, and say which cleared.
 *
 * One tuning batch each, and a holdout batch only for the ones that met every bar on the tuning
 * seeds — `runStageToVerdict`'s own skip, which is arithmetic rather than an economy: `cleared`
 * needs both halves.
 *
 * A configuration `core` refuses to build is **rethrown** rather than swallowed. `measureSurvivors.ts`
 * counts such a refusal out of `examined` because a survivor count must not absorb a product defect;
 * a search has no denominator to protect, and a caller asking whether a *named* vector still clears
 * wants the message rather than a `false`.
 */
export async function judgeDialDraws(input: {
  readonly fixture: WitnessFixture;
  readonly draws: readonly DialDraw[];
  readonly onVerdict?: ((verdict: DialVerdict) => void) | undefined;
}): Promise<readonly DialVerdict[]> {
  const { fixture, draws } = input;
  const out: DialVerdict[] = [];
  for (const draw of draws) {
    const outcome = await runStageToVerdict({
      stage: fixture.stage,
      published: fixture.published,
      candidateProfileId: fixture.baseline.id,
      edit: {
        baseProfileId: fixture.baseline.id,
        profileId: `edit-${String(draw.index)}`,
        values: draw.values,
      },
      run: (request) => fixture.run(request),
    });
    const verdict: DialVerdict = {
      ...draw,
      cleared: outcome.verdict.cleared,
      metOnTuningSeeds: outcome.verdict.metOnTuningSeeds,
      unjudged: outcome.verdict.goals.some((goal) => goal.met === null),
    };
    out.push(verdict);
    input.onVerdict?.(verdict);
  }
  return out;
}
