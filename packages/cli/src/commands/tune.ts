/**
 * `elevator-sim tune` — search the parameter space, then check the winner on traffic it has never
 * seen.
 *
 * This command is Phase 7's non-test caller. Everything under
 * `packages/experiments/src/tuning/` was complete, correct and unit-tested, and until this file
 * existed **nothing outside its own suites called any of it** — docs/08-review-findings.md § 1, and
 * the sixth instance of docs/05-roadmap.md's standing requirement. `tuning/search/index.ts` § 6
 * said so itself and was overridden. So the point of this file is not that it is convenient; it is
 * that it is the named caller, and it reaches every entry point the phase has:
 * {@link randomSearch}, {@link successiveHalving}, {@link sepCmaEs}, {@link runnerObjective} and
 * {@link runHoldoutRound}.
 *
 * ## The method, which is not negotiable
 *
 * - **The search never sees the seeds it is validated on.** A search runs every round at one
 *   experiment seed — that is what makes its candidates CRN-paired, and it is exactly why those
 *   seeds cannot also be the unseen ones. The tuning set is the search's own trace seed; the
 *   holdout set is a different one, and `runHoldoutRound` refuses the two being equal rather than
 *   warning about it. This command does not re-implement any of that (CLAUDE.md § Tuning
 *   discipline).
 * - **Nothing is ranked inside the noise floor.** Every claim is a paired-t interval on a
 *   difference; an interval containing zero is reported as such and the two candidates are not
 *   ordered. The Pareto front comes from `tuning/report`, which places an arm only where another is
 *   significantly better on at least one objective and significantly worse on none.
 * - **The budget is priced before the run, not excused after it.** docs/07-handoff.md § 4 measured
 *   the resolution limit as *two* numbers — 0.20 s between near-neighbour weight vectors and 1.9 s
 *   between structurally different dispatchers, both at n = 100. This command prints what the
 *   requested budget can resolve, and when it cannot resolve any effect this project has ever
 *   measured by tuning it prints that instead of a ranking.
 * - **No global RNG.** Every draw comes from a named stream of an injected `StreamSet`:
 *   `searchRng` for what the optimizer proposes, `roundSeed` for the traces it is scored on, and
 *   the two are deliberately different streams (CLAUDE.md invariant 2).
 *
 * ## What it deliberately does not do
 *
 * It does not write a tuned profile into `data/`. A winner that generalizes is a *finding*, and
 * docs/06 leaves `predictive-balanced`'s 8 s deadband authored as shipped on purpose so that this
 * phase keeps a known answer to validate itself against. Editing the answer into the data is how
 * that stops being true.
 */

import {
  AWT_OBJECTIVE_ID,
  DOC_RUNGS,
  SEARCH_METHODS,
  buildingFeasibility,
  candidateFromProfile,
  candidateSampler,
  materializer,
  plannedBudget,
  randomSearch,
  roundSeed,
  runExperiment,
  runHoldoutRound,
  runnerObjective,
  searchSpace,
  sepCmaEs,
  subspace,
  successiveHalving,
  vectorSpace,
  type Candidate,
  type Evaluation,
  type ExperimentResources,
  type ExperimentResult,
  type ExperimentRunOptions,
  type ExperimentSpec,
  type HoldoutAssessment,
  type ParallelSpec,
  type Rung,
  type SearchMethodId,
  type SearchResult,
  type SearchSpace,
  type TrafficArmSpec,
  type TuningArm,
} from '@elevator-sim/experiments';
import type { LoadedConfig } from '@elevator-sim/core';

import {
  booleanFlag,
  numberFlag,
  parseArgs,
  rejectPositionals,
  requiredStringFlag,
  stringFlag,
  type FlagSpec,
  type ParsedArgs,
} from '../args.js';
import {
  loadData,
  randomSeed,
  requireBuilding,
  requireDispatcher,
  requireTrafficProfile,
  resolveDataDir,
  withTrafficProfile,
} from '../data.js';
import { UsageError, didYouMean } from '../errors.js';
import { count, num, signed } from '../format.js';
import { BINARY, printCommandHelp, wrap, type CommandHelp } from '../help.js';
import { field, heading, padColumn, type Output } from '../output.js';

/* -------------------------------------------------------------------------- *
 * The measured resolution limits (docs/07-handoff.md § 4)
 * -------------------------------------------------------------------------- */

/** The budget both limits below were measured at. */
const RESOLUTION_REFERENCE_N = 100;

/** Smallest detectable effect between **near-neighbour weight vectors** at n = 100, 80 % power. */
const NEAR_NEIGHBOUR_RESOLUTION_S = 0.2;

/** The same between **structurally different dispatchers** — ρ ≈ 0.61, so ~10× coarser. */
const STRUCTURAL_RESOLUTION_S = 1.9;

/**
 * The largest effect this project has ever measured by tuning: `predictive-balanced`'s
 * `idle.repositionThresholdS` 8 s → 2 s on Garden Apartments, −1.288 s [−2.277, −0.298] on the
 * holdout seed set at n = 60 (docs/05-roadmap.md § Phase 7).
 *
 * It is the honest ceiling on "could this budget resolve *anything*". A run whose half-width
 * exceeds it cannot detect the biggest tuning effect on record, so it cannot detect a smaller one
 * either, and printing a ranking from it would be the confident nonsense CLAUDE.md § Statistical
 * discipline is written against.
 */
const LARGEST_MEASURED_TUNING_EFFECT_S = 1.288;

/** docs/03 § Part 3's floor for a number that will be compared against another number. */
const DOCUMENTED_MIN_REPLICATIONS = 50;

/** Half-width the paired difference can be resolved to at `n`, scaling as `1/√n`. */
export function resolutionAt(n: number, referenceS: number): number {
  return referenceS * Math.sqrt(RESOLUTION_REFERENCE_N / Math.max(1, n));
}

/** Replications needed to resolve an effect of `effectS`, from the same two measured points. */
export function replicationsToResolveEffect(effectS: number, referenceS: number): number {
  if (!(effectS > 0)) return Number.POSITIVE_INFINITY;
  return Math.ceil(RESOLUTION_REFERENCE_N * (referenceS / effectS) ** 2);
}

/* -------------------------------------------------------------------------- *
 * Flags
 * -------------------------------------------------------------------------- */

export const TUNE_FLAGS: readonly FlagSpec[] = [
  {
    name: 'building',
    kind: 'string',
    placeholder: '<id>',
    summary: 'which building to tune on; the optimum is per building',
    required: true,
  },
  {
    name: 'base',
    kind: 'string',
    placeholder: '<id>',
    summary: 'the hand-authored profile to beat, and the profile candidates patch',
    defaultValue: 'predictive-balanced',
  },
  {
    name: 'method',
    kind: 'string',
    placeholder: '<id>',
    summary: 'optimizer; random is the honest baseline and cannot stall on a plateau',
    choices: [...SEARCH_METHODS],
    defaultValue: 'random',
  },
  {
    name: 'params',
    kind: 'string',
    placeholder: '<ids>',
    summary: 'comma-separated parameter ids to search',
    defaultText: 'every declared dimension',
  },
  {
    name: 'candidates',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'draws (random), rung-1 width (successive-halving), or population (sep-cmaes)',
    min: 2,
    max: 10_000,
    defaultValue: 12,
  },
  {
    name: 'reps',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'replications per candidate inside the search; the fidelity, not the verdict',
    min: 2,
    max: 5000,
    defaultValue: 8,
  },
  {
    name: 'generations',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'sep-cmaes only: generations to run',
    min: 1,
    max: 1000,
    defaultValue: 5,
  },
  {
    name: 'finalists',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'search winners carried into the held-out validation round',
    min: 1,
    max: 20,
    defaultValue: 2,
  },
  {
    name: 'validate-reps',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'replications per arm on each seed set; 50–200 is the documented budget',
    min: 2,
    max: 5000,
    defaultValue: 30,
  },
  {
    name: 'resolve',
    kind: 'number',
    placeholder: '<s>',
    summary: 'the effect size the validation budget is priced against',
    min: 0.001,
    defaultValue: NEAR_NEIGHBOUR_RESOLUTION_S,
  },
  {
    name: 'seed',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'search seed; the whole trajectory and the tuning traces derive from it',
    min: 0,
    defaultText: 'random, and printed',
  },
  {
    /*
     * A **string**, not an integer, and the reason is arithmetic rather than taste: the default is
     * derived through `roundSeed`, which is 64 bits, and 64 bits do not fit in a `number`. Typing
     * the printed default back in — which is exactly what the `reproduce:` line invites — would
     * otherwise be rejected as "larger than MAX_SAFE_INTEGER". Every seed in this project crosses
     * a boundary as a decimal string for the same reason.
     */
    name: 'holdout-seed',
    kind: 'string',
    placeholder: '<n>',
    summary: 'seed for the disjoint validation traffic; a decimal integer, 64 bits',
    defaultText: 'derived from --seed, and printed',
  },
  {
    name: 'traffic',
    kind: 'string',
    placeholder: '<id>',
    summary: 'override the building’s traffic profile',
  },
  {
    name: 'duration',
    kind: 'number',
    placeholder: '<s>',
    summary: 'demand horizon in simulated seconds',
    min: 1,
  },
  {
    name: 'rate',
    kind: 'number',
    placeholder: '<pct>',
    summary: 'arrival rate as % of population per 5 min',
    min: 0,
  },
  {
    name: 'window',
    kind: 'string',
    placeholder: '<id>',
    summary: 'window each replication is summarised over',
    choices: ['peak-5min', 'full-run'],
    defaultText: 'the demand template’s own',
  },
  {
    name: 'confidence',
    kind: 'number',
    placeholder: '<f>',
    summary: 'confidence level as a fraction',
    min: 0.5,
    max: 0.9999,
    defaultValue: 0.95,
  },
  { name: 'serial', kind: 'boolean', summary: 'never use worker threads' },
  { name: 'data', kind: 'string', placeholder: '<dir>', summary: 'data directory to read' },
  { name: 'no-color', kind: 'boolean', summary: 'never emit ANSI colour' },
  { name: 'help', kind: 'boolean', aliases: ['h'], summary: 'show this help' },
];

export const TUNE_HELP: CommandHelp = {
  name: 'tune',
  usage: `${BINARY} tune --building <id> [--params <ids>] [--method random] [--seed <n>]`,
  summary: 'search the dispatcher parameter space and validate the winner on held-out seeds',
  description: [
    'The optimizer is told nothing about elevators. It samples the schema every dispatch stage ' +
      'declares — type, range, and the activeWhen gates for conditional knobs — so adding a ' +
      'parameter adds a dimension and needs no code here.',
    'The search and the verdict are deliberately separate runs. A search evaluates every ' +
      'candidate of a round on one set of passenger traces, which is what pairs them and is worth ' +
      '324× in replications between near neighbours — and is exactly why those traces cannot also ' +
      'be the evidence. The finalists are re-run on a disjoint seed set the search never saw, and ' +
      'that is the number reported.',
    'A difference smaller than the interval half-width is reported as indistinguishable and is ' +
      'never ranked. Ask for a budget that cannot resolve an effect this project has measured and ' +
      'the command says so instead of naming a winner.',
  ],
  flags: TUNE_FLAGS,
  examples: [
    `${BINARY} tune --building garden-apartments --params idle.repositionThresholdS --candidates 8 --reps 6 --validate-reps 30`,
    `${BINARY} tune --building garden-apartments --method successive-halving --candidates 9 --reps 4 --seed 20260726`,
    `${BINARY} tune --building midtown-office --method sep-cmaes --candidates 6 --generations 4 --reps 6 --rate 1`,
  ],
};

export async function tuneCommand(out: Output, argv: readonly string[]): Promise<number> {
  const context = `${BINARY} tune`;
  const parsed = parseArgs(argv, TUNE_FLAGS, context);
  rejectPositionals(parsed, context);
  if (parsed.values['help'] === true) {
    printCommandHelp(out, TUNE_HELP);
    return 0;
  }
  const config = await loadData(resolveDataDir(stringFlag(parsed, 'data')));
  return await runTune(out, config, parsed);
}

/* -------------------------------------------------------------------------- *
 * The run
 * -------------------------------------------------------------------------- */

export async function runTune(
  out: Output,
  config: LoadedConfig,
  parsed: ParsedArgs,
): Promise<number> {
  const { bold, dim, cyan, green, red, yellow } = out.palette;

  const buildingId = requiredStringFlag(parsed, 'building');
  const baseId = stringFlag(parsed, 'base') ?? 'predictive-balanced';
  const method = (stringFlag(parsed, 'method') ?? 'random') as SearchMethodId;
  const base = requireBuilding(config, buildingId);
  const baseProfile = requireDispatcher(config, baseId, '--base');
  const trafficId = stringFlag(parsed, 'traffic') ?? base.trafficProfile;
  requireTrafficProfile(config, trafficId);
  const building = withTrafficProfile(base, trafficId);

  const candidates = numberFlag(parsed, 'candidates') ?? 12;
  const reps = numberFlag(parsed, 'reps') ?? 8;
  const generations = numberFlag(parsed, 'generations') ?? 5;
  const finalists = numberFlag(parsed, 'finalists') ?? 2;
  const validateReps = numberFlag(parsed, 'validate-reps') ?? 30;
  const target = numberFlag(parsed, 'resolve') ?? NEAR_NEIGHBOUR_RESOLUTION_S;
  const confidence = numberFlag(parsed, 'confidence') ?? 0.95;
  const seed = numberFlag(parsed, 'seed') ?? randomSeed();
  const durationS = numberFlag(parsed, 'duration');
  const rate = numberFlag(parsed, 'rate');
  const serial = booleanFlag(parsed, 'serial');
  const window = stringFlag(parsed, 'window');

  const full = searchSpace();
  const space = narrowedSpace(full, stringFlag(parsed, 'params'));
  const searched = space.ids;

  const traffic: TrafficArmSpec = {
    id: `tune-${trafficId}`,
    ...(durationS === undefined ? {} : { durationS }),
    ...(rate === undefined ? {} : { demand: { arrivalRatePctPop5min: rate } }),
    ...(window === 'full-run' || window === 'peak-5min' ? { reportWindow: window } : {}),
  };
  const resources: ExperimentResources = {
    buildingsById: new Map([[buildingId, building]]),
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    ...(config.elevatorSpecs === undefined ? {} : { elevatorSpecs: config.elevatorSpecs }),
  };
  const parallel: ParallelSpec | undefined = serial ? { mode: 'serial' } : undefined;

  /* ---- the plan, printed before anything runs ---------------------------- */

  const ladder = method === 'successive-halving' ? ladderFrom(candidates, reps) : undefined;
  const searchBudget =
    ladder !== undefined
      ? plannedBudget(ladder)
      : method === 'sep-cmaes'
        ? (generations * candidates + 1) * reps
        : (candidates + 1) * reps;
  const validationBudget = (finalists + 1) * validateReps * 2;

  heading(out, 'Tuning run');
  field(out, 'building', `${base.name}  ${dim(`(${buildingId})`)}`);
  field(out, 'traffic', trafficId);
  field(out, 'reference', `${baseProfile.name}  ${dim(`(${baseId})`)}`);
  field(out, 'method', `${method}  ${dim(methodNote(method))}`);
  field(
    out,
    'dimensions',
    `${count(searched.length)} searched  ${dim(
      searched.length <= 6 ? searched.join(', ') : `${searched.slice(0, 6).join(', ')}, …`,
    )}`,
  );
  field(out, 'search budget', `${count(searchBudget)} replications at n = ${count(reps)} per candidate`);
  field(out, 'validation', `${count(validationBudget)} replications, ${count(validateReps)} per arm per seed set`);
  field(out, 'seed', bold(cyan(String(seed))));
  out.line();

  /* ---- what this budget can and cannot resolve --------------------------- */

  const nearAt = resolutionAt(validateReps, NEAR_NEIGHBOUR_RESOLUTION_S);
  const structuralAt = resolutionAt(validateReps, STRUCTURAL_RESOLUTION_S);
  const needed = replicationsToResolveEffect(target, NEAR_NEIGHBOUR_RESOLUTION_S);
  const belowResolution = nearAt > LARGEST_MEASURED_TUNING_EFFECT_S;

  heading(out, 'Resolution');
  field(
    out,
    `at n = ${String(validateReps)}`,
    `${num(nearAt, 2)} s between near neighbours, ${num(structuralAt, 2)} s between structurally different dispatchers`,
    20,
  );
  out.line(
    dim(
      `  ${padColumn('measured', 20)}0.20 s / 1.9 s at n = 100, 80 % power (docs/07-handoff.md § 4)`,
    ),
  );
  out.line(
    `  ${padColumn('asked to resolve', 20)}${num(target, 2)} s, which needs n ≈ ${count(needed)}` +
      (validateReps >= needed ? ` ${green('— met')}` : ` ${yellow(`— have ${String(validateReps)}`)}`),
  );

  if (belowResolution) {
    out.line();
    out.line(
      red(bold('  ██  BELOW RESOLUTION — this budget cannot resolve any effect on record.')),
    );
    out.line(
      wrap(
        `The half-width at n = ${String(validateReps)} is ${num(nearAt, 2)} s. The largest effect this project has ever ` +
          `measured by tuning is ${num(LARGEST_MEASURED_TUNING_EFFECT_S, 2)} s (the 8 s → 2 s deadband on Garden Apartments, ` +
          'docs/05-roadmap.md § Phase 7). A run that cannot see that cannot see anything smaller ' +
          'either, so no ranking is printed below — only the measurements, and what they fail to say. ' +
          `Raise --validate-reps: n ≥ ${String(replicationsToResolveEffect(LARGEST_MEASURED_TUNING_EFFECT_S, NEAR_NEIGHBOUR_RESOLUTION_S))} clears this floor, ` +
          `n ≥ ${String(needed)} resolves the ${num(target, 2)} s asked for, and docs/03 budgets 50–200 for anything quoted.`,
        Math.min(out.columns - 6, 92),
        '      ',
      ),
    );
  } else if (validateReps < DOCUMENTED_MIN_REPLICATIONS) {
    out.line();
    out.line(
      yellow(
        `  !!  ${count(validateReps)} replications is below the documented ${String(DOCUMENTED_MIN_REPLICATIONS)}–200; ten produced a 12 % error in the reference study`,
      ),
    );
  }
  out.line();

  /* ---- the search -------------------------------------------------------- */

  /*
   * Two candidates, and the difference between them is load-bearing.
   *
   * `wholeDispatcher` is the reference profile read back over the **whole** space. It is the
   * `base` every draw is merged with before feasibility is judged, because half a dispatcher
   * cannot be judged — and it is what a gate outside the narrowed set is read from, so narrowing
   * to `idle.repositionThresholdS` does not silently deactivate it by falling back to the
   * *declared* default of the `idle.parkingStrategy` that gates it.
   *
   * `incumbent` is the same point restricted to the dimensions actually being searched. That is
   * what enters the search as an arm: materializing the whole point instead would author every
   * declared default into the candidate profile, so the "incumbent" arm would stop being the
   * shipped configuration and the reference would be comparing against something else.
   */
  const wholeDispatcher = candidateFromProfile(full, baseProfile);
  const incumbent: Candidate = new Map(
    searched.flatMap((id) => {
      const value = wholeDispatcher.get(id);
      return value === undefined ? [] : [[id, value] as const];
    }),
  );
  const gatedOff = searched.filter((id) => !incumbent.has(id));
  if (gatedOff.length > 0) {
    out.line(
      yellow(
        `  !!  ${gatedOff.join(', ')} ${gatedOff.length === 1 ? 'is' : 'are'} inactive under ${baseId}: an activeWhen gate on this profile leaves ${gatedOff.length === 1 ? 'it' : 'them'} unsearchable, and no draw will move ${gatedOff.length === 1 ? 'it' : 'them'}`,
      ),
    );
    out.line();
  }

  const sampleOptions = {
    base: wholeDispatcher,
    feasible: buildingFeasibility(space, building, config.elevatorSpecs, { base: baseProfile }),
  };
  const materialize = materializer(space, baseProfile);

  let roundsRun = 0;
  const objective = runnerObjective<Candidate>({
    resources,
    buildingId,
    traffic,
    materialize,
    experimentId: `cli-tune-${buildingId}`,
    ...(parallel === undefined ? {} : { parallel }),
    onExperiment: (result: ExperimentResult) => {
      roundsRun += 1;
      out.line(
        dim(
          `  … round ${String(roundsRun)}: ${count(result.cells.length)} candidates × ${count(result.replicationsRun / Math.max(1, result.cells.length))} replications`,
        ),
      );
    },
  });

  heading(out, 'Search');
  const result: SearchResult<Candidate> =
    method === 'successive-halving'
      ? await successiveHalving<Candidate>({
          objective,
          seed,
          space: candidateSampler(space, sampleOptions),
          rungs: ladder as readonly Rung[],
          incumbent,
          idPrefix: 'sh',
        })
      : method === 'sep-cmaes'
        ? await sepCmaEs<Candidate>({
            objective,
            seed,
            space: vectorSpace(space, sampleOptions),
            generations,
            population: candidates,
            replications: reps,
            start: incumbent,
            incumbent,
            idPrefix: 'cma',
          })
        : await randomSearch<Candidate>({
            objective,
            seed,
            space: candidateSampler(space, sampleOptions),
            candidates,
            replications: reps,
            incumbent,
            idPrefix: 'rand',
          });

  out.line();
  field(out, 'evaluated', `${count(result.candidatesEvaluated)} candidates, ${count(result.replicationsSpent)} replications`, 20);
  field(out, 'trace seed', `${result.traceSeed}  ${dim('(the tuning seed set)')}`, 20);
  field(
    out,
    'plateaus',
    `${count(result.plateau.flatRounds)} flat rounds, ${count(result.plateau.tiedWithBest)} candidates bit-identical to the best, ${count(result.plateau.escapes)} escapes`,
    20,
  );
  for (const note of result.notes) out.line(dim(`  ${note}`));

  /* ---- the finalists ----------------------------------------------------- */

  const chosen = finalistsOf(result, finalists);
  if (chosen.length === 0) {
    throw new UsageError(
      'the search produced no candidate distinct from the incumbent to validate.',
      [
        'every draw landed on the incumbent’s own plateau, which is a finding rather than a failure',
        'widen the search with --candidates, or pick a dimension with --params whose steps flip a decision',
      ],
    );
  }

  const arms: readonly TuningArm[] = chosen.map((evaluation) => ({
    candidateId: evaluation.candidate.id,
    label: `${evaluation.candidate.origin}, score ${num(evaluation.score, 3)} s at n = ${String(evaluation.replications)}`,
    profile: materialize(evaluation.candidate.value, `tuned-${evaluation.candidate.id}`),
    parameters: pointOf(evaluation.candidate.value, searched),
  }));
  const reference: TuningArm = {
    candidateId: baseId,
    label: `${baseProfile.name}, as shipped`,
    profile: baseProfile,
    parameters: pointOf(incumbent, searched),
  };

  /* ---- validation on seeds the search never saw -------------------------- */

  const tuningSeed = result.traceSeed;
  const holdoutFlag = stringFlag(parsed, 'holdout-seed');
  if (holdoutFlag !== undefined && !/^\d+$/.test(holdoutFlag.trim())) {
    throw new UsageError(`--holdout-seed expects a decimal integer; received "${holdoutFlag}".`, [
      'seeds are written as decimal strings so that 64 bits survive a command line and a JSON file',
    ]);
  }
  const holdoutSeed =
    holdoutFlag === undefined ? String(roundSeed(seed, HOLDOUT_ROUND_INDEX)) : holdoutFlag.trim();

  heading(out, 'Held-out validation');
  field(out, 'tuning seed', tuningSeed, 20);
  field(out, 'holdout seed', `${bold(cyan(holdoutSeed))}  ${dim('— traffic the search never saw')}`, 20);
  field(out, 'arms', `${baseId} (reference) + ${chosen.map((entry) => entry.candidate.id).join(', ')}`, 20);
  out.line();

  let validationReplications = 0;
  const round = await runHoldoutRound({
    resources,
    buildingId,
    traffic,
    reference,
    candidates: arms,
    tuningSeed,
    holdoutSeed,
    replications: validateReps,
    confidence,
    experimentId: `cli-tune-${buildingId}`,
    title: `elevator-sim tune — ${base.name} (${trafficId}) against "${baseId}"`,
    ...(parallel === undefined ? {} : { parallel }),
    run: async (
      spec: ExperimentSpec,
      armResources: ExperimentResources,
      options: ExperimentRunOptions,
    ): Promise<ExperimentResult> =>
      await runExperiment(spec, armResources, {
        ...options,
        onReplication: () => {
          validationReplications += 1;
          if (validationReplications % Math.max(1, Math.ceil(validationBudget / 8)) === 0) {
            out.line(dim(`  … ${String(validationReplications)}/${String(validationBudget)} replications`));
          }
        },
      }),
  });

  out.line(round.page);

  /* ---- the headline, which is the only place a word is attached ---------- */

  const assessments = round.report.holdout.filter(
    (entry) => entry.objectiveId === AWT_OBJECTIVE_ID,
  );

  heading(out, 'Verdict on held-out seeds  (AWT)');
  const width = Math.max(...assessments.map((entry) => entry.candidateId.length), 'candidate'.length);
  out.line(
    `  ${dim(padColumn('candidate', width))}  ${dim(padColumn('tuning Δ', 12))}  ${dim(padColumn('holdout Δ', 12))}  ${dim('verdict')}`,
  );
  for (const entry of assessments) {
    out.line(
      `  ${padColumn(entry.candidateId, width)}  ${padColumn(gainText(entry.tuningGain), 12)}  ${padColumn(gainText(entry.holdoutGain), 12)}  ${paint(out, entry)}`,
    );
  }
  out.line(
    dim('  Δ is the improvement over the reference in seconds; positive is better, and a number'),
  );
  out.line(dim('  here is a point estimate — the interval that decides is on the page above.'));

  out.line();
  if (belowResolution) {
    out.line(red(bold('  VERDICT: NO RANKING — the validation budget is below resolution.')));
    out.line(
      wrap(
        'The measurements above stand as measurements. What they cannot support is an order, and ' +
          'this command will not print one it cannot defend. Raise --validate-reps.',
        Math.min(out.columns - 4, 92),
        '  ',
      ),
    );
  } else {
    const headline = headlineOf(assessments);
    const style =
      headline.kind === 'generalizes' ? green : headline.kind === 'overfitted' ? red : yellow;
    out.line(style(bold(`  VERDICT: ${headline.text}`)));
    out.line(wrap(headline.detail, Math.min(out.columns - 4, 92), '  '));
  }

  out.line();
  out.line(
    `  ${dim('reproduce:')} ${cyan(
      [
        `${BINARY} tune`,
        `--building ${buildingId}`,
        `--base ${baseId}`,
        `--method ${method}`,
        ...(stringFlag(parsed, 'params') === undefined ? [] : [`--params ${searched.join(',')}`]),
        `--candidates ${String(candidates)}`,
        `--reps ${String(reps)}`,
        ...(method === 'sep-cmaes' ? [`--generations ${String(generations)}`] : []),
        `--finalists ${String(finalists)}`,
        `--validate-reps ${String(validateReps)}`,
        `--resolve ${String(target)}`,
        `--confidence ${String(confidence)}`,
        `--seed ${String(seed)}`,
        `--holdout-seed ${holdoutSeed}`,
        ...(window === undefined ? [] : [`--window ${window}`]),
        ...(durationS === undefined ? [] : [`--duration ${String(durationS)}`]),
        ...(rate === undefined ? [] : [`--rate ${String(rate)}`]),
        ...(stringFlag(parsed, 'traffic') === undefined ? [] : [`--traffic ${trafficId}`]),
        ...(stringFlag(parsed, 'data') === undefined ? [] : [`--data ${stringFlag(parsed, 'data') ?? ''}`]),
      ].join(' '),
    )}`,
  );
  out.line();
  return 0;
}

/* -------------------------------------------------------------------------- *
 * Pieces
 * -------------------------------------------------------------------------- */

/**
 * The round index the holdout seed is derived at.
 *
 * A search under the default `'fixed'` seed policy runs every round at round 0's seed, and even a
 * `'per-round'` search would need a million rounds to reach this one. Derived through the search's
 * own `roundSeed` rather than through an arithmetic of this file's invention, for the reason
 * `round.ts` gives: there is no reason to add a second mapping between a seed and its numbers.
 * `runHoldoutRound` refuses the two seeds being equal, so this is a convenience and not the guard.
 */
const HOLDOUT_ROUND_INDEX = 1_000_003;

function methodNote(method: SearchMethodId): string {
  switch (method) {
    case 'successive-halving':
      return `— docs/06's ladder, scaled; the full table is ${String(plannedBudget(DOC_RUNGS))} replications`;
    case 'sep-cmaes':
      return '— moves rather than samples; escapes plateaus by inflating σ and restarting';
    default:
      return '— the honest baseline: independent draws, so no plateau can stall it';
  }
}

/** The declared space, narrowed to `--params` if given. @throws UsageError for an unknown id. */
export function narrowedSpace(full: SearchSpace, params: string | undefined): SearchSpace {
  if (params === undefined) return full;
  const ids = params
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
  if (ids.length === 0) {
    throw new UsageError('--params was given but names no parameter.', [
      `available: ${full.ids.length} dimensions; run \`${BINARY} tune --help\``,
    ]);
  }
  for (const id of ids) {
    if (full.byId.has(id)) continue;
    const suggestion = didYouMean(id, [...full.ids]);
    throw new UsageError(`no searchable parameter "${id}" (--params).`, [
      `${full.ids.length} dimensions are declared; the first few are ${full.ids.slice(0, 8).join(', ')}`,
      ...(suggestion === undefined ? [] : [`did you mean "${suggestion}"?`]),
    ]);
  }
  return subspace(full, ids);
}

/**
 * A fidelity ladder from one width and one fidelity, with η ≈ 3 on both axes.
 *
 * docs/06's own table is `100×10 → 33×30 → 11×100 → 3×300`, which is 3 990 replications and not
 * something to run from a terminal on a whim. The shape is what matters and it is preserved:
 * `assertLadder` (inside `successiveHalving`) rejects anything whose width does not strictly
 * narrow and whose fidelity does not strictly rise, so a ladder that stopped being one would throw
 * rather than quietly spend a budget the doc's table does not describe.
 */
export function ladderFrom(candidates: number, replications: number): readonly Rung[] {
  const rungs: Rung[] = [];
  let width = candidates;
  let fidelity = replications;
  for (;;) {
    rungs.push({ candidates: width, replications: fidelity });
    const next = Math.floor(width / 3);
    if (next < 2 || rungs.length >= DOC_RUNGS.length) break;
    width = next;
    fidelity *= 3;
  }
  return Object.freeze(rungs);
}

/**
 * The finalists: the best distinct candidates the search actually measured, at their own fidelity.
 *
 * The incumbent is excluded because it is already the round's reference arm; carrying it twice
 * would put a candidate up against itself and report `IDENTICAL` as if it were a finding. Ties are
 * broken by the fidelity a candidate was last measured at, then by score, then by id — never by
 * iteration order, so the choice is reproducible from the seed (CLAUDE.md invariant 4's spirit).
 */
export function finalistsOf<C>(
  result: SearchResult<C>,
  wanted: number,
): readonly Evaluation<C>[] {
  const bestPerCandidate = new Map<string, Evaluation<C>>();
  for (const evaluation of result.evaluations) {
    if (evaluation.candidate.id === 'incumbent') continue;
    const previous = bestPerCandidate.get(evaluation.candidate.id);
    if (previous === undefined || evaluation.replications > previous.replications) {
      bestPerCandidate.set(evaluation.candidate.id, evaluation);
    }
  }
  return [...bestPerCandidate.values()]
    .sort(
      (a, b) =>
        b.replications - a.replications ||
        a.score - b.score ||
        a.candidate.id.localeCompare(b.candidate.id),
    )
    .slice(0, wanted);
}

/** A candidate as the report prints it: the searched dimensions only, in the space's own order. */
function pointOf(
  candidate: Candidate,
  ids: readonly string[],
): Readonly<Record<string, number | string | boolean>> {
  const out: Record<string, number | string | boolean> = {};
  for (const id of ids) {
    const value = candidate.get(id);
    if (value !== undefined) out[id] = value;
  }
  return out;
}

function gainText(gain: number): string {
  return Number.isFinite(gain) ? `${signed(gain, 3)} s` : '—';
}

function paint(out: Output, entry: HoldoutAssessment): string {
  const { green, red, yellow, dim } = out.palette;
  switch (entry.verdict) {
    case 'generalizes':
      return green(entry.verdict.toUpperCase());
    case 'degraded':
      return yellow(entry.verdict.toUpperCase());
    case 'overfitted':
      return red(entry.verdict.toUpperCase());
    case 'unconfirmed':
      return yellow(entry.verdict.toUpperCase());
    default:
      return dim(entry.verdict.toUpperCase());
  }
}

interface Headline {
  readonly kind: 'generalizes' | 'degraded' | 'overfitted' | 'unconfirmed' | 'none';
  readonly text: string;
  readonly detail: string;
}

/**
 * The one sentence, from the holdout module's own six-state verdict.
 *
 * Nothing is recomputed here and no threshold of this file's invention is applied: `assessHoldout`
 * decides, and this turns its decision into a sentence. The ordering is by strength of claim, so
 * a run holding one `generalizes` and three `unconfirmed`s reports the finding rather than the
 * silence.
 */
export function headlineOf(assessments: readonly HoldoutAssessment[]): Headline {
  const of = (verdict: HoldoutAssessment['verdict']): readonly HoldoutAssessment[] =>
    assessments.filter((entry) => entry.verdict === verdict);

  const generalizes = of('generalizes');
  if (generalizes.length > 0) {
    const ids = generalizes.map((entry) => entry.candidateId).join(', ');
    return {
      kind: 'generalizes',
      text: `${ids} beats ${generalizes[0]?.referenceId ?? 'the reference'} on HELD-OUT seeds.`,
      detail:
        'The paired-t interval excludes zero on traffic the search never saw, and the gain did ' +
        'not measurably shrink between the two seed sets. That is the Phase 7 acceptance ' +
        'criterion, met on this configuration at this budget.',
    };
  }
  const degraded = of('degraded');
  if (degraded.length > 0) {
    return {
      kind: 'degraded',
      text: `${degraded.map((entry) => entry.candidateId).join(', ')} is better on held-out seeds, but by measurably less.`,
      detail:
        'The holdout interval excludes zero, so the effect is real on new traffic; the shrinkage ' +
        'interval also excludes zero, so some of the tuning-set gain was fitted to those traces. ' +
        'Quote the holdout number, never the tuning one.',
    };
  }
  const overfitted = of('overfitted');
  if (overfitted.length > 0) {
    return {
      kind: 'overfitted',
      text: `${overfitted.map((entry) => entry.candidateId).join(', ')} did NOT generalize.`,
      detail:
        'A gain that was significant on the seeds the search optimized against did not survive a ' +
        'disjoint set, and the shrinkage is itself significant. This is the failure held-out ' +
        'seeds exist to catch, and reporting it is the point.',
    };
  }
  const unconfirmed = of('unconfirmed');
  if (unconfirmed.length > 0) {
    return {
      kind: 'unconfirmed',
      text: 'UNCONFIRMED — the holdout set could not tell.',
      detail:
        'A tuning-set gain was significant and the holdout interval contains zero, but so does ' +
        'the shrinkage interval: the holdout set neither confirmed nor contradicted it. This one ' +
        'is fixed by replications — raise --validate-reps.',
    };
  }
  return {
    kind: 'none',
    text: 'NO CANDIDATE WAS SELECTED — nothing beat the reference on the tuning seeds.',
    detail:
      'Every candidate’s tuning-set interval contained zero, so there was no gain to hold out ' +
      'against. That is a legitimate result and the commonest one: the objective is piecewise ' +
      'constant, and most draws land on the incumbent’s own plateau. Widen the search, raise ' +
      '--reps, or accept that the hand-authored profile is already at a local optimum here.',
  };
}
