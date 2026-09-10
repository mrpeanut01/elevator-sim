/**
 * **Judging the configurations a rung reaches, and counting the ones that clear** — the expensive
 * half of GitHub issue **#367**, and the second operation in [§ D525](../../../../DECISIONS.md)
 * clause 3:
 *
 * > *"take every configuration the budget can reach on the schedule, **judge each on the scenario's
 * > seeds under common random numbers against the scenario's goals, and count the ones that
 * > clear**. Many survivors is easy. One survivor is the hardest a scenario is allowed to be."*
 *
 * `survivorSpace.ts` is the first operation. `survivors.ts` is the table this produces. The split
 * is `scenario/`'s own — `measure.ts` runs the batches and `published.ts` holds the shape — and it
 * exists so the guard can re-derive a pinned number by calling the same function the pin was
 * written by.
 *
 * ## Nothing here is a second runner, a second judge or a second definition of *clear*
 *
 * Every configuration goes through `campaign/stageSequence.ts#runStageToVerdict` — the shipped
 * sequence, the one `dev/campaignPanel.ts` calls — so a survivor is a configuration that clears the
 * scenario in exactly the sense the product means by it, and this module cannot drift from the
 * panel. That is `stageRun.ts`'s founding argument, which this repository has now paid for at three
 * separate levels: *"the suite would have gone on passing if the panel had drifted … because the
 * suite was measuring a reimplementation of the call site."*
 *
 * **`cleared`, not `metOnTuningSeeds`.** `difficultyCurve.test.ts`'s DC-2 register uses the second
 * because DC-2 asks whether the dropdown can meet the bars *at all*; a survivor count is a count of
 * ways *through*, and this product does not let a player through on the seeds they tuned against.
 * So each configuration runs the tuning batch and — only if it met every bar there — the holdout
 * batch, which is `runStageToVerdict`'s own skip and is arithmetic rather than an economy:
 * `cleared` needs both halves, so a configuration that missed a bar on the tuning seeds is refused
 * whatever the holdout would have said.
 *
 * ## Common random numbers, and what the two `n`s in this measurement are
 *
 * `CLAUDE.md`'s statistical discipline governs this file completely, and the thing most likely to
 * be misread about a survivor count is that it has **two** sample sizes:
 *
 * - **n = replications**, the scenario's own — 50 on every shipped stage, inside `CLAUDE.md`'s
 *   50–200 budget. Every configuration is judged over these, paired against the baseline arm by
 *   `batch/runBatch.ts`'s own CRN pairing, and the only interval any of this publishes is the
 *   paired-t on the difference that `beat-the-baseline` reads. Nothing here compares two
 *   configurations to each other, so no second interval is formed and none is needed: the
 *   *comparison* rule CLAUDE.md states is discharged inside each cell by the shipped judge, once
 *   per configuration, against the scenario's own baseline.
 * - **k = configurations examined**, the sample over the reachable space. A survivor count is a
 *   count over **k**, and `survivors.ts` publishes `examined` beside `survivors` for exactly the
 *   reason `published.ts` publishes counts and never quotients. Reading a survivor count without
 *   its `k` is reading a numerator.
 *
 * The two are not interchangeable and the file that carries them says so on its face. A survivor
 * count is not a per-seed proportion; the seeds are inside each cell, and `k` is the axis the
 * count is over.
 *
 * ## A run that refuses its own mean is counted and named, never quietly counted
 *
 * `CLAUDE.md`: *"If a configuration saturates, flag it and suppress the AWT interval"* — one of
 * five grounds `awtIsValid` fails on. `judge.ts` already handles a suppressed comparison honestly,
 * and a configuration whose every orderable measure is suppressed simply does not meet
 * `beat-the-baseline`. What this module adds is that the **number** of such configurations is
 * published beside the count, in {@link SurvivorTally.suppressed}: a survivor count of 3 of 12 over
 * a rung where 9 of the 12 refused their own mean is a different fact from 3 of 12 where none did,
 * and a reader who is not told cannot tell them apart.
 *
 * {@link SurvivorTally.unjudged} is the same shape for the other refusal: a count goal whose
 * **baseline** arm did not reproduce its published count is not judged at all, and `judge.ts`
 * returns `met: null` for it. Unjudged is not passed, and it is not failed either — it is a cell
 * that said nothing, and it is counted as its own thing.
 *
 * The decision this module took is recorded in this docstring and cites
 * [§ D405](../../../../DECISIONS.md): it binds nothing outside `scenario/` and the data file that
 * directory publishes, so no `DECISIONS.md` number is owed for it.
 */

import type {
  DispatcherProfile,
  ElevatorSpecs,
  ResolvedBuilding,
} from '@elevator-sim/core/browser';
import type { SearchSpace } from '@elevator-sim/experiments/browser';

import type { BatchReport } from '../batch/report.js';
import type { BatchRequest, BatchResult } from '../batch/types.js';
import type { StageReport } from '../campaign/judge.js';
import { runStageToVerdict } from '../campaign/stageSequence.js';
import type { CampaignStage } from '../campaign/types.js';
import type { PriceSchedule } from '../pricing/types.js';

import { rungsOf, type BudgetRung } from './budget.js';
import type { PublishedScenario } from './published.js';
import {
  bundleSpaceOf,
  dropdownConfigurationsOf,
  reachableChangesOf,
  sampleReachableConfigurations,
  samplerSeedFor,
} from './survivorSpace.js';

/* -------------------------------------------------------------------------- *
 * What one cell reports
 * -------------------------------------------------------------------------- */

/** One configuration's verdict, kept so a survivor can be named rather than only counted. */
export interface JudgedConfiguration {
  /** `'dropdown'` for a shipped profile picked by name; `'dials'` for a drawn edit. */
  readonly stratum: 'dropdown' | 'dials';
  /** What the configuration is called in the published record — a profile id, or `edit-<n>`. */
  readonly name: string;
  /** The dearest price tier the configuration reached. */
  readonly tier: string;
  /** What it cost at that rung, distinct changes summed once. */
  readonly units: number;
  /** Price-schedule change ids bought. */
  readonly changeIds: readonly string[];
  /** `StageReport.cleared` — both seed sets, the shipped meaning of *through*. */
  readonly cleared: boolean;
  /** Met every bar on the runs the player made, whatever the holdout said. */
  readonly metOnTuningSeeds: boolean;
  /** A goal the judge could not answer on the tuning batch. Unjudged is neither passed nor failed. */
  readonly unjudged: boolean;
  /** At least one orderable measure refused to stand behind its own number on the tuning batch. */
  readonly suppressed: boolean;
}

/**
 * A configuration the declared space admits and `core` refuses to build.
 *
 * **Empty on the shipped ladder since GitHub issue #475 was fixed, and kept because it is the
 * instrument that found it.** The four this sweep first met were real:
 * `controls/editedProfile.ts#admitEditedVector` accepted a vector with
 * `answer.dwellPolicy: 'adaptive'` and an `answer.maxDwellS` below the car's own door timings,
 * `space.validate` returned no reason — it cannot, being building-independent — and
 * `model/car/car.ts` threw *"dwellPolicy \"adaptive\" requires maxDwellS >= the larger base
 * dwell (5s)"* when the building was constructed. They had to be counted **out** of `examined`,
 * which is honest for a survivor count and is not a fix.
 *
 * **That refusal is now taken at the draw** — `survivorSpace.ts` hands the sampler the building,
 * so a vector this simulator cannot run on this scenario's cars is refused and redrawn rather than
 * played. The field stays, and so does the count beside it, for two reasons: a **dropdown** profile
 * can still fail to build on a particular building, and a category that is zero because it was
 * fixed is only distinguishable from one that is zero because nobody looked if the count is still
 * published. `admittedVectorsBuild.test.ts` is the guard that keeps it at zero for the dials.
 *
 * A configuration nobody can run is not a way through the scenario and it is not a failed attempt
 * either, so it is **excluded from `examined`** and counted here. Excluding it silently would put a
 * product defect inside a difficulty measurement, where it would read as the scenario being hard.
 */
export interface UnbuildableConfiguration {
  readonly name: string;
  readonly tier: string;
  readonly changeIds: readonly string[];
  /** `core`'s own message, kept verbatim. The refusal replaces the number, it never hides it. */
  readonly reason: string;
}

/** Examined and survivors for one stratum or one tier. Counts only; the quotient is derived. */
export interface SurvivorCounts {
  readonly examined: number;
  readonly survivors: number;
}

/** What one `(scenario, rung)` cell measured. */
export interface SurvivorTally {
  readonly stepId: string | null;
  readonly units: number;
  readonly chimesSpent: number;
  /** Configurations judged — the `k` the count is over. Never the replication count. */
  readonly examined: number;
  /** Configurations that cleared the scenario on both seed sets. */
  readonly survivors: number;
  /** Of {@link examined}, how many had a goal the judge could not answer. */
  readonly unjudged: number;
  /** Of {@link examined}, how many ran a batch that refused its own mean somewhere. */
  readonly suppressed: number;
  /** The dropdown stratum, taken exhaustively. DC-2's replacement reads this. */
  readonly dropdown: SurvivorCounts;
  /** The dial stratum, sampled. {@link SurvivorTally.sampling} says how. */
  readonly dials: SurvivorCounts;
  /** Examined and survivors, split by the dearest price tier the configuration reached. */
  readonly perTier: Readonly<Record<string, SurvivorCounts>>;
  /** Every judged configuration. The regenerator keeps the survivors and drops the rest. */
  readonly judged: readonly JudgedConfiguration[];
  /** Configurations the declared space admits and `core` refuses to build — not in {@link examined}. */
  readonly unbuildable: readonly UnbuildableConfiguration[];
  /** How the dial stratum was sampled, so the draw can be redone from the file alone. */
  readonly sampling: SamplingRecord;
}

/** Everything a reader needs to redo the draw, and everything the draw learned about itself. */
export interface SamplingRecord {
  /**
   * How the **dial** stratum was taken. The dropdown stratum is always exhaustive and says so in
   * its own field rather than through this one.
   */
  readonly method: 'sampled' | 'exhaustive';
  /** How many distinct configurations were asked for. */
  readonly sampleSize: number;
  /** The master seed the cell's own seed derives from. */
  readonly masterSeed: number;
  /** This cell's seed: `samplerSeedFor(masterSeed, scenarioId, stepId)`. */
  readonly seed: number;
  /** Affordable non-empty bundles of reachable priced changes at this rung. Countable. */
  readonly bundles: number;
  /**
   * Whether the whole dial space is finite.
   *
   * `false` at every rung on the shipped ladder, which is a **measurement** — the cheapest priced
   * change covers two continuous dimensions — and is why {@link SamplingRecord.method} reads
   * *sampled* even at the base. Issue #367 expected sampling only at the building tier.
   */
  readonly enumerable: boolean;
  readonly draws: number;
  readonly refusedDraws: number;
  readonly inertDraws: number;
  readonly duplicateDraws: number;
}

/* -------------------------------------------------------------------------- *
 * The measurement
 * -------------------------------------------------------------------------- */

export interface MeasureSurvivorsInput {
  readonly stage: CampaignStage;
  /** The stage's row of `data/scenario-goals.json` — the source of every bar, on both seed sets. */
  readonly published: PublishedScenario;
  readonly space: SearchSpace;
  readonly schedule: PriceSchedule;
  /**
   * The scenario's own building, resolved — issue **#475**.
   *
   * Carried rather than reached for through {@link MeasureSurvivorsInput.run}, which is a closure
   * over resources this module cannot see. The sampler needs it to refuse a vector the cars will
   * not accept, and it must be the **same** building the batch runs on or the draw would be
   * filtered against one tower and played on another.
   */
  readonly building: ResolvedBuilding;
  /** The sensor defaults those cars resolve against. See {@link MeasureSurvivorsInput.building}. */
  readonly elevatorSpecs: ElevatorSpecs | undefined;
  /** The scenario's own baseline profile, resolved from `data/dispatcher-profiles.json`. */
  readonly baseline: DispatcherProfile;
  /** Every shipped profile, so the dropdown stratum is a population rather than a selection. */
  readonly profiles: readonly DispatcherProfile[];
  /** Distinct dial configurations to draw at each rung. `survivors.ts` says why the figure is what it is. */
  readonly sampleSize: number;
  /** The master seed every cell's sampler seed derives from. Pinned in the published table. */
  readonly masterSeed: number;
  /** How a batch is run. Injected for `stageSequence.ts`'s reason: the suite hands over `runBatch`. */
  readonly run: (request: BatchRequest) => BatchResult | Promise<BatchResult>;
  /** Called after each configuration lands, so a driver can say where it is. */
  readonly onConfiguration?:
    | ((rung: BudgetRung | null, judged: JudgedConfiguration) => void)
    | undefined;
}

/**
 * Measure every rung of one scenario's budget: draw, play, and count what cleared.
 *
 * Minutes per scenario — it simulates. The **dial** stratum is measured independently at each rung,
 * each with its own derived seed, rather than by widening one sample: the reachable space at a
 * bought rung is a different population from the base's, and a shared draw would make the counts
 * correlated in a way no reader could unpick.
 *
 * ## The dropdown stratum is judged once per scenario and attributed to the rungs that afford it
 *
 * A profile's verdict does not depend on the rung: the stage, the seeds, the horizon, the demand
 * and the two arms are identical, so playing `predictive-balanced` at the base rung and again at
 * the equipment rung would run the same batch twice and get the same answer by construction. What
 * the rung decides is **affordability**, which is arithmetic on the schedule and needs no
 * replication. So each profile is played once and counted at every rung whose units cover it.
 *
 * That is a saving of two thirds of this stratum's cost and it is stated rather than hidden,
 * because it is the one place this measurement does not re-run what it reports. It is safe for a
 * reason that is checkable rather than plausible: `batchRequestForStage` is a pure function of the
 * stage and the candidate, and the budget appears in none of its arguments — which is `charter`
 * non-goal 6 and exactly what `budgetReachesTheRun.test.ts` asserts about the judge.
 */
export async function measureScenarioSurvivors(
  input: MeasureSurvivorsInput,
): Promise<readonly SurvivorTally[]> {
  const {
    stage,
    published,
    space,
    schedule,
    baseline,
    building,
    elevatorSpecs,
    profiles,
    sampleSize,
    masterSeed,
    run,
  } = input;
  const reachable = reachableChangesOf(space, schedule);

  /* The countable stratum, played once. See the docstring on why once is enough. */
  const dropdown = dropdownConfigurationsOf(space, schedule, baseline, profiles);
  const dropdownJudged = new Map<string, JudgedConfiguration>();
  const dropdownUnbuildable: UnbuildableConfiguration[] = [];
  for (const configuration of dropdown) {
    const outcome = await playOrRefuse(() =>
      runStageToVerdict({
        stage,
        published,
        candidateProfileId: configuration.profileId,
        run: (request) => run(request),
      }),
    );
    if (typeof outcome === 'string') {
      dropdownUnbuildable.push({
        name: configuration.profileId,
        tier: configuration.tier,
        changeIds: configuration.changeIds,
        reason: outcome,
      });
      continue;
    }
    const entry = judgedFrom('dropdown', configuration.profileId, configuration, outcome);
    dropdownJudged.set(configuration.profileId, entry);
    input.onConfiguration?.(null, entry);
  }

  const out: SurvivorTally[] = [];
  for (const rung of rungsOf(stage.budget)) {
    const seed = samplerSeedFor(masterSeed, stage.id, rung.stepId);
    const bundleSpace = bundleSpaceOf(space, reachable, rung.units);
    const drawn = sampleReachableConfigurations({
      space,
      schedule,
      baseline,
      building,
      elevatorSpecs,
      units: rung.units,
      sampleSize,
      seed,
    });

    const judged: JudgedConfiguration[] = [];
    const unbuildable: UnbuildableConfiguration[] = [];
    for (const configuration of dropdown) {
      if (configuration.units > rung.units) continue;
      const entry = dropdownJudged.get(configuration.profileId);
      if (entry === undefined) {
        const refused = dropdownUnbuildable.find((row) => row.name === configuration.profileId);
        if (refused !== undefined) unbuildable.push(refused);
        continue;
      }
      judged.push(entry);
    }

    for (const [index, configuration] of drawn.configurations.entries()) {
      const name = `edit-${String(index)}`;
      const outcome = await playOrRefuse(() =>
        runStageToVerdict({
          stage,
          published,
          candidateProfileId: baseline.id,
          edit: { baseProfileId: baseline.id, profileId: name, values: configuration.values },
          run: (request) => run(request),
        }),
      );
      if (typeof outcome === 'string') {
        unbuildable.push({
          name,
          tier: configuration.tier,
          changeIds: configuration.changeIds,
          reason: outcome,
        });
        continue;
      }
      const entry = judgedFrom('dials', name, configuration, outcome);
      judged.push(entry);
      input.onConfiguration?.(rung, entry);
    }

    out.push({
      stepId: rung.stepId,
      units: rung.units,
      chimesSpent: rung.chimesSpent,
      examined: judged.length,
      survivors: judged.filter((entry) => entry.cleared).length,
      unjudged: judged.filter((entry) => entry.unjudged).length,
      suppressed: judged.filter((entry) => entry.suppressed).length,
      dropdown: countsOf(judged.filter((entry) => entry.stratum === 'dropdown')),
      dials: countsOf(judged.filter((entry) => entry.stratum === 'dials')),
      perTier: perTierOf(judged),
      judged,
      unbuildable,
      sampling: {
        method: bundleSpace.enumerable ? 'exhaustive' : 'sampled',
        sampleSize,
        masterSeed,
        seed,
        bundles: bundleSpace.bundles.length,
        enumerable: bundleSpace.enumerable,
        draws: drawn.draws,
        refusedDraws: drawn.refusedDraws,
        inertDraws: drawn.inertDraws,
        duplicateDraws: drawn.duplicateDraws,
      },
    });
  }

  return out;
}

/**
 * Play a configuration, or return `core`'s refusal as a string.
 *
 * A `throw` here is not an error in the sweep: it is a configuration the declared space admits and
 * the simulator will not build, which is a **result** — see {@link UnbuildableConfiguration}. The
 * message is returned verbatim rather than classified, because classifying it would need a list of
 * what `core` refuses and that list is exactly what nobody has.
 */
async function playOrRefuse(
  play: () => Promise<{ readonly verdict: StageReport; readonly report: BatchReport }>,
): Promise<{ readonly verdict: StageReport; readonly report: BatchReport } | string> {
  try {
    return await play();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function judgedFrom(
  stratum: 'dropdown' | 'dials',
  name: string,
  configuration: {
    readonly tier: string;
    readonly units: number;
    readonly changeIds: readonly string[];
  },
  outcome: { readonly verdict: StageReport; readonly report: BatchReport },
): JudgedConfiguration {
  return {
    stratum,
    name,
    tier: configuration.tier,
    units: configuration.units,
    changeIds: configuration.changeIds,
    cleared: outcome.verdict.cleared,
    metOnTuningSeeds: outcome.verdict.metOnTuningSeeds,
    unjudged: outcome.verdict.goals.some((goal) => goal.met === null),
    suppressed: suppressedIn(outcome.report),
  };
}

function countsOf(judged: readonly JudgedConfiguration[]): SurvivorCounts {
  return { examined: judged.length, survivors: judged.filter((entry) => entry.cleared).length };
}

/**
 * Whether any orderable measure refused to stand behind its own number.
 *
 * `judge.ts#judgeComparisonGoal`'s own filter, and deliberately the same one: a survivor count that
 * called a run suppressed on a different rule from the judge that refused it would be two
 * definitions of the same word. `metricClass === 'axis'` is excluded there because energy is an
 * axis and never a score (`CLAUDE.md`, [§ D106](../../../../DECISIONS.md)), and it is excluded here
 * for the same reason.
 */
function suppressedIn(report: BatchReport): boolean {
  const comparison = report.comparisons[0];
  if (comparison === undefined) return false;
  return comparison.rows.some(
    (row) =>
      row.metricClass !== 'axis' && (row.verdict === 'suppressed' || row.verdict === 'unmeasured'),
  );
}

/**
 * Examined and survivors by the dearest tier a configuration reached.
 *
 * Issue #367's *"reportable per price tier, not only in total"*, which is DC-2's replacement: *no
 * stage clears from the dispatcher dropdown alone* becomes a statement about the **dispatcher
 * tier's** survivors, and a single scalar cannot answer it.
 */
function perTierOf(judged: readonly JudgedConfiguration[]): Readonly<Record<string, SurvivorCounts>> {
  const out: Record<string, { examined: number; survivors: number }> = {};
  for (const entry of judged) {
    const cell = (out[entry.tier] ??= { examined: 0, survivors: 0 });
    cell.examined += 1;
    if (entry.cleared) cell.survivors += 1;
  }
  return out;
}
