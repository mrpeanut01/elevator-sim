/**
 * `elevator-sim compare` — two dispatchers, paired, with a verdict you are allowed to believe.
 *
 * The method is not negotiable (CLAUDE.md § Statistical discipline):
 *
 * - both arms see the **same passenger traces** at equal replication index (common random
 *   numbers). `runExperiment` guarantees this by giving cells that differ only in their
 *   dispatcher arm the same `traceKey`, and this command asserts the digests match rather than
 *   assuming it;
 * - the verdict comes from a **paired-t interval on the difference**, never from comparing two
 *   separate intervals — overlapping intervals do not imply no difference, and the paired
 *   variance is the whole reason the comparison is affordable;
 * - an interval containing zero is **INDISTINGUISHABLE**, printed as that word, with no ranking
 *   and no point estimate offered as a consolation prize;
 * - a run in which **every** paired difference is exactly zero is **IDENTICAL**, which is a
 *   different finding and not a stronger INDISTINGUISHABLE — see below;
 * - a saturated arm has its waiting statistics **suppressed** rather than averaged.
 *
 * Nothing here prints a mean without its interval.
 *
 * ## Why IDENTICAL is a fourth word rather than a shade of the third
 *
 * INDISTINGUISHABLE means "there is an effect here that this budget cannot resolve", and the
 * honest advice attached to it is to raise `--reps`. That advice is *wrong* — unsatisfiable, in
 * fact — when the two arms produced bit-identical runs: dispatch is an `argmin` over a handful of
 * cars and the simulator is deterministic, so a change too small to flip a single decision produces
 * n-out-of-n exactly-zero paired differences at every replication count. No `--reps` resolves a
 * difference that is not there.
 *
 * The repository already made this distinction and this command did not use it: `experiments`'
 * `benchmark/verdict.ts` returns `IDENTICAL` for exactly this case and says why collapsing the two
 * "would let an inert cost term be written up as 'a promising direction that needs more
 * replications', which is the specific mistake this project exists not to make". Review finding #8
 * measured the gap outside the self-comparison sanity check too: at the project's own operating
 * point `eta` and `fairness-first` — two distinct shipped profiles — produce 30/30 exactly-zero
 * paired AWT differences, and the CLI reported that as a resolution problem.
 *
 * ## Sharding — `docs/15-compute-offload-contract.md` Phase B, GitHub issue #413
 *
 * Opt-in, and the unsharded command is unchanged: without `--shard` or `--merge` this file runs the
 * code it ran before either existed, and `compare.shard.test.ts` holds its output to skeletons
 * captured before the first sharding commit.
 *
 * - `--shard k/n --seed <n> --ceiling <runs> --out <file>` plans the same experiment the unsharded
 *   command plans, cuts it with `ShardedExperiment.of` — which refuses a ceiling below the plan's
 *   cells × replications before anything runs — runs replication block `k` of `n` for **both** arms
 *   with `runShard`, and writes it with `serializeShard`. `--seed` is required, because without it
 *   every block draws its own and no two blocks could merge; and an `--out` that cannot be written is
 *   refused before the block runs rather than after. A block prints no verdict. It prints its own
 *   resolution limit, labelled as its own, so that a merge's figure can be told apart from it.
 * - `--merge <file...>` reads the blocks, requires every file to record the same comparison, rebuilds
 *   the plan from those flags and this machine's `data/`, and hands the blocks to `mergeShards`,
 *   which refuses a block of another plan, a missing or repeated block, and a block missing an arm.
 *   The verdict is rendered by the same code as the unsharded one, over the merged cells, with every
 *   paired interval read from the differences each block stored. `mergeShards` has already required
 *   those to equal, value for value, the differences each block's own records give, so reading them
 *   rather than re-pairing the pooled records moves no number — and so no test can tell the two
 *   readings apart: which array is read is stated here, not pinned. The resolution limit is recomputed
 *   from the merged differences at the merged `n`, and the spend is printed after the verdict, never
 *   on a line of it.
 *
 * What is not built here: any workflow that runs blocks on other machines, and any measurement of
 * whether two machines agree. A merge of blocks from two machines is refused unless both derived the
 * same plan digest from their data, and whether they do is unchecked.
 */

import { accessSync, constants as fsConstants, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';

import type { ReplicationMetric } from '@elevator-sim/experiments';
import {
  RESOLUTION_POWER,
  RunnerError,
  ShardedExperiment,
  aggregateCell,
  deserializeShard,
  estimateMean,
  intervalContainsZero,
  mergeShards,
  pairedDifferenceEstimate,
  planExperiment,
  replicationsToResolve,
  runExperiment,
  runShard,
  serializeShard,
  smallestDetectableEffect,
  type CellResult,
  type ExperimentPlan,
  type ExperimentResources,
  type ExperimentSpec,
  type FanOutSpend,
  type MeanEstimate,
  type MergedPair,
  type ReplicationRecord,
  type ShardContext,
  type ShardResult,
} from '@elevator-sim/experiments';
import {
  comparabilityOf,
  passengerModelOf,
  resolveDispatchConfig,
  type DispatcherProfile,
  type LoadedConfig,
  type PassengerModel,
  type ResolvedBuilding,
} from '@elevator-sim/core';

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
import { UsageError } from '../errors.js';
import { ABSENT, count, num, renderEstimate, renderSignedEstimate } from '../format.js';
import { BINARY, printCommandHelp, wrap, type CommandHelp } from '../help.js';
import { field, heading, padColumn, type Output } from '../output.js';

/**
 * The metrics the verdict table reports. AWT decides — **unless the two arms do not share a
 * passenger model**, in which case AWT is one of the nine metrics that stop measuring the same
 * thing and {@link gateMetricFor} moves the verdict to TTD. See {@link crossModelNotice}.
 */
const REPORTED: readonly {
  readonly metric: ReplicationMetric;
  readonly label: string;
  readonly unit: string;
  readonly digits: number;
  /** `-1` when lower is better. */
  readonly direction: -1 | 1;
}[] = [
  { metric: 'awtS', label: 'AWT', unit: 's', digits: 2, direction: -1 },
  { metric: 'wt95S', label: 'WT95', unit: 's', digits: 2, direction: -1 },
  { metric: 'pctOverLongWait', label: '% waits > 60 s', unit: '%', digits: 2, direction: -1 },
  { metric: 'ttdMeanS', label: 'TTD', unit: 's', digits: 2, direction: -1 },
];

export const COMPARE_FLAGS: readonly FlagSpec[] = [
  {
    name: 'building',
    kind: 'string',
    placeholder: '<id>',
    summary: 'which building to simulate',
    required: true,
  },
  { name: 'a', kind: 'string', placeholder: '<id>', summary: 'first dispatcher', required: true },
  { name: 'b', kind: 'string', placeholder: '<id>', summary: 'second dispatcher', required: true },
  {
    name: 'traffic',
    kind: 'string',
    placeholder: '<id>',
    summary: 'override the building’s traffic profile',
  },
  {
    name: 'reps',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'replications per arm; 50–200 is the documented budget',
    min: 2,
    max: 5000,
    defaultValue: 100,
  },
  {
    name: 'seed',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'experiment master seed; every replication seed derives from it',
    min: 0,
    defaultText: 'random, and printed',
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
  {
    name: 'shard',
    kind: 'string',
    placeholder: '<k/n>',
    summary: 'run replication block k of n, both arms, and write it to --out; needs the same --seed on every block; merge the blocks with --merge',
  },
  { name: 'out', kind: 'string', placeholder: '<file>', summary: 'where --shard writes its block' },
  {
    name: 'ceiling',
    kind: 'integer',
    placeholder: '<runs>',
    summary: 'most replication-runs (every planned cell × --reps) the whole fan-out may spend; required with --shard, checked before it runs',
    min: 1,
  },
  {
    name: 'merge',
    kind: 'boolean',
    summary: 'merge the block files named after it into one verdict; takes no other flag but --data',
  },
  { name: 'data', kind: 'string', placeholder: '<dir>', summary: 'data directory to read' },
  { name: 'no-color', kind: 'boolean', summary: 'never emit ANSI colour' },
  { name: 'help', kind: 'boolean', aliases: ['h'], summary: 'show this help' },
];

export const COMPARE_HELP: CommandHelp = {
  name: 'compare',
  usage: `${BINARY} compare --building <id> --a <id> --b <id> [--reps 100] [--seed <n>]`,
  summary: 'run two dispatchers under common random numbers and print a paired-t verdict',
  description: [
    'Both arms are driven by byte-identical passenger traces at every replication index, so the ' +
      'difference between them is the dispatcher and nothing else. That is worth 5–20× in ' +
      'required replications, and it is what makes a 100-replication answer trustworthy.',
    'The verdict is a paired-t confidence interval on A − B — Student-t at n−1, at every n. If it ' +
      'contains zero the answer is INDISTINGUISHABLE and the two are not ranked — overlapping or ' +
      'straddling intervals do not become a winner by being looked at harder.',
    'If every paired difference is exactly zero the answer is IDENTICAL instead: the two arms ' +
      'produced bit-identical runs, which is no effect rather than a small one, and no --reps ' +
      'resolves it.',
    'A large budget can be split into replication blocks, each run in its own process: --shard k/n --seed <n> ' +
      'runs block k of n for both arms, so no arm is ever separated from its pair, and writes it to ' +
      '--out. --ceiling declares the most replication-runs the whole fan-out may spend and is checked ' +
      'before a block runs. compare --merge <file...> refuses blocks of different comparisons, a ' +
      'missing block and a block missing an arm, then prints the same verdict the unsharded command ' +
      'prints, the resolution limit recomputed at the merged n, and the spend beside it.',
  ],
  flags: COMPARE_FLAGS,
  examples: [
    `${BINARY} compare --building garden-apartments --a eta --b nearest-car --reps 100 --window full-run`,
    `${BINARY} compare --building midtown-office --a predictive-balanced --b eta --reps 200 --rate 8`,
    `${BINARY} compare --building garden-apartments --a eta --b eta --reps 20 --window full-run   # must be IDENTICAL`,
    `${BINARY} compare --building midtown-office --a eta --b collective --reps 800 --seed 7 --shard 1/4 --ceiling 1600 --out block-1.json`,
    `${BINARY} compare --merge block-1.json block-2.json block-3.json block-4.json`,
  ],
};

export async function compareCommand(out: Output, argv: readonly string[]): Promise<number> {
  const context = `${BINARY} compare`;
  // `--merge` takes its whole comparison from the block files, so it is parsed against its own four
  // flags: the required --building, --a and --b were recorded in every file when the block ran.
  if (argv.includes('--merge')) return await mergeCommand(out, argv, context);
  const parsed = parseArgs(argv, COMPARE_FLAGS, context);
  rejectPositionals(parsed, context);
  if (parsed.values['help'] === true) {
    printCommandHelp(out, COMPARE_HELP);
    return 0;
  }
  const config = await loadData(resolveDataDir(stringFlag(parsed, 'data')));
  return await runCompare(out, config, parsed);
}

export async function runCompare(
  out: Output,
  config: LoadedConfig,
  parsed: ParsedArgs,
): Promise<number> {
  const context = `${BINARY} compare`;
  if (booleanFlag(parsed, 'merge')) {
    throw new UsageError(`${context}: write --merge on its own, followed by the block files.`, [
      MERGE_USAGE,
    ]);
  }
  const shard = stringFlag(parsed, 'shard');
  const outFile = stringFlag(parsed, 'out');
  const ceiling = numberFlag(parsed, 'ceiling');
  if (shard === undefined) {
    if (outFile !== undefined) {
      throw new UsageError(
        `${context}: --out writes one replication block, and there is no --shard to write.`,
        ['add --shard <k/n> and --ceiling <runs>, or drop --out'],
      );
    }
    if (ceiling !== undefined) {
      throw new UsageError(
        `${context}: --ceiling bounds a fan-out, and there is no --shard to bound.`,
        ['add --shard <k/n> and --out <file>, or drop --ceiling'],
      );
    }
    return await runSingle(out, config, invocationOf(parsed));
  }
  if (numberFlag(parsed, 'seed') === undefined) {
    throw new UsageError(
      `${context}: --shard needs --seed <n>. Without it every block draws its own seed, so no two blocks run the same comparison and --merge would refuse them all, after every block had run.`,
      ['pass the same --seed to every block of one fan-out'],
    );
  }
  return await runBlock(out, config, invocationOf(parsed), { shard, outFile, ceiling }, context);
}

/* -------------------------------------------------------------------------- *
 * One comparison, whichever way it ran
 * -------------------------------------------------------------------------- */

/**
 * Every flag that can move a number: the set the `reproduce:` line prints, and the set a block file
 * records, so that `--merge` plans exactly the experiment each block ran.
 */
interface CompareInvocation {
  readonly building: string;
  readonly a: string;
  readonly b: string;
  readonly traffic?: string | undefined;
  readonly reps: number;
  readonly seed: number;
  readonly confidence: number;
  readonly duration?: number | undefined;
  readonly rate?: number | undefined;
  readonly window?: 'full-run' | 'peak-5min' | undefined;
  /** Picks an executor and moves no number, so a block file does not record it. */
  readonly serial: boolean;
}

function invocationOf(parsed: ParsedArgs): CompareInvocation {
  const building = requiredStringFlag(parsed, 'building');
  const a = requiredStringFlag(parsed, 'a');
  const b = requiredStringFlag(parsed, 'b');
  const traffic = stringFlag(parsed, 'traffic');
  const duration = numberFlag(parsed, 'duration');
  const rate = numberFlag(parsed, 'rate');
  const window = stringFlag(parsed, 'window');
  return {
    building,
    a,
    b,
    ...(traffic === undefined ? {} : { traffic }),
    reps: numberFlag(parsed, 'reps') ?? 100,
    seed: numberFlag(parsed, 'seed') ?? randomSeed(),
    confidence: numberFlag(parsed, 'confidence') ?? 0.95,
    ...(duration === undefined ? {} : { duration }),
    ...(rate === undefined ? {} : { rate }),
    ...(window === 'full-run' || window === 'peak-5min' ? { window } : {}),
    serial: booleanFlag(parsed, 'serial'),
  };
}

/** What `compare` resolved from the flags and `data/`: the arms, and the experiment they run. */
interface PreparedComparison {
  readonly invocation: CompareInvocation;
  readonly base: ResolvedBuilding;
  readonly aProfile: DispatcherProfile;
  readonly bProfile: DispatcherProfile;
  readonly trafficId: string;
  readonly spec: ExperimentSpec;
  readonly resources: ExperimentResources;
}

/** One spec for all three ways to run a comparison, so a block plans the plan the unsharded run plans. */
function prepareComparison(config: LoadedConfig, invocation: CompareInvocation): PreparedComparison {
  const { building: buildingId, a: aId, b: bId, reps, seed } = invocation;
  const base = requireBuilding(config, buildingId);
  const aProfile = requireDispatcher(config, aId, '--a');
  const bProfile = requireDispatcher(config, bId, '--b');
  const trafficId = invocation.traffic ?? base.trafficProfile;
  requireTrafficProfile(config, trafficId);
  const building = withTrafficProfile(base, trafficId);
  const durationS = invocation.duration;
  const rate = invocation.rate;
  const window = invocation.window;

  const spec: ExperimentSpec = {
    id: `cli-compare-${buildingId}-${aId}-vs-${bId}`,
    seed,
    buildings: [buildingId],
    // Explicit arm ids: `--a eta --b eta` is a legitimate and useful sanity check, and two arms
    // sharing an id would collide in the plan.
    dispatchers: [
      { id: 'A', profile: aId },
      { id: 'B', profile: bId },
    ],
    traffic: [
      {
        id: trafficId,
        ...(durationS === undefined ? {} : { durationS }),
        ...(rate === undefined ? {} : { demand: { arrivalRatePctPop5min: rate } }),
        ...(window === 'full-run' || window === 'peak-5min' ? { reportWindow: window } : {}),
      },
    ],
    replication: { minReplications: reps, maxReplications: reps },
    ...(invocation.serial ? { parallel: { mode: 'serial' as const } } : {}),
  };

  const resources: ExperimentResources = {
    buildingsById: new Map([[buildingId, building]]),
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    // The file beside the profile index, so an arm whose profile opts into `selection.policy`
    // finds the weight sets it names. Inert while no shipped profile opts in.
    dispatcherProfiles: config.dispatcherProfiles,
  };

  return { invocation, base, aProfile, bProfile, trafficId, spec, resources };
}

function printComparisonHeader(out: Output, prepared: PreparedComparison): void {
  const { bold, dim, cyan } = out.palette;
  const { base, aProfile, bProfile, trafficId, invocation } = prepared;
  const { building: buildingId, a: aId, b: bId, reps, seed } = invocation;
  const window = invocation.window;
  heading(out, 'Paired comparison');
  field(out, 'building', `${base.name}  ${dim(`(${buildingId})`)}`);
  field(out, 'traffic', trafficId);
  field(out, 'A', `${aProfile.name}  ${dim(`(${aId})`)}`);
  field(out, 'B', `${bProfile.name}  ${dim(`(${bId})`)}`);
  field(out, 'replications', `${count(reps)} per arm, common random numbers`);
  field(out, 'window', window ?? dim('the demand template’s own'));
  field(out, 'seed', bold(cyan(String(seed))));
  out.line();
}

/** The unsharded command: plan, run, render. The code this file ran before `--shard` existed. */
async function runSingle(
  out: Output,
  config: LoadedConfig,
  invocation: CompareInvocation,
): Promise<number> {
  const prepared = prepareComparison(config, invocation);
  printComparisonHeader(out, prepared);

  const total = invocation.reps * 2;
  const progress = createProgress(out, total);
  const result = await runExperiment(prepared.spec, prepared.resources, {
    // The summaries and their scalar projections are all this command reads; keeping every
    // RunRecord would cost hundreds of megabytes at 200 replications and buy nothing.
    keepRecords: false,
    onReplication: () => {
      progress.tick();
    },
  });
  progress.done();

  renderComparison(out, prepared, {
    cellA: requireCell(result.cells, 'A'),
    cellB: requireCell(result.cells, 'B'),
    executed: `${result.replicationsRun} replications, ${result.execution.executor}${result.execution.executor === 'workers' ? ` ×${result.execution.workers}` : ''}, ${num(result.execution.elapsedMs / 1000, 1)} s`,
  });
  return 0;
}

/** The cells a verdict is rendered from, and how they came to be. */
interface ComparisonView {
  readonly cellA: CellResult;
  readonly cellB: CellResult;
  /** The `executed` line: how the replications ran. The one line a merge words differently. */
  readonly executed: string;
  /**
   * A merge's stored differences, `A − B` per replication in replication order, each computed
   * inside the block that ran both arms. Absent when both arms ran in this process.
   */
  readonly differencesFor?: ((metric: ReplicationMetric) => readonly number[] | undefined) | undefined;
}

/** What the rendered verdict rested on, for a merge's resolution section to read. */
interface RenderedVerdict {
  readonly usable: boolean;
  readonly gate: { readonly metric: ReplicationMetric; readonly label: string };
  readonly headline: Verdict | undefined;
}

/**
 * Arms, paired differences, verdict, and the lines under it — for every mode.
 *
 * Moved here from `runCompare` byte for byte, apart from three reads: the `executed` line, the
 * reproduce line's `--traffic`, and a merge's stored differences. `compare.shard.test.ts` holds the
 * unsharded output to what it printed before the move, and a merge's to the unsharded output.
 */
function renderComparison(
  out: Output,
  prepared: PreparedComparison,
  view: ComparisonView,
): RenderedVerdict {
  const { bold, dim, cyan, green, red, yellow } = out.palette;
  const { aProfile, bProfile, trafficId, invocation } = prepared;
  const { building: buildingId, a: aId, b: bId, reps, seed, confidence } = invocation;
  const durationS = invocation.duration;
  const rate = invocation.rate;
  const window = invocation.window;
  const { cellA, cellB } = view;

  const crossModel = crossModelNotice(aProfile, bProfile);
  const gate = gateMetricFor(crossModel);

  // CRN is the whole basis of the comparison, so it is verified rather than assumed.
  const crn = crnStatus(cellA, cellB);

  heading(out, 'Arms');
  const rows: string[][] = [];
  const suppressed: string[] = [];
  for (const spec_ of REPORTED) {
    const a = armEstimate(cellA, spec_.metric, confidence);
    const b = armEstimate(cellB, spec_.metric, confidence);
    rows.push([
      spec_.label,
      renderArm(a, spec_.digits, spec_.unit, out),
      renderArm(b, spec_.digits, spec_.unit, out),
    ]);
  }
  if (!cellA.aggregate.awtIsValid) {
    suppressed.push(`A (${aId}): ${cellA.aggregate.awtInvalidReason ?? 'AWT not reportable'}`);
  }
  if (!cellB.aggregate.awtIsValid) {
    suppressed.push(`B (${bId}): ${cellB.aggregate.awtInvalidReason ?? 'AWT not reportable'}`);
  }

  const labelWidth = Math.max(...REPORTED.map((entry) => entry.label.length), 'saturated'.length);
  out.line(
    `  ${dim(padColumn('metric', labelWidth))}  ${dim(padColumn(`A  ${aId}`, 34))}  ${dim(`B  ${bId}`)}`,
  );
  for (const row of rows) {
    out.line(
      `  ${padColumn(row[0] ?? '', labelWidth)}  ${padColumn(row[1] ?? '', 34)}  ${row[2] ?? ''}`,
    );
  }
  // Saturation is the one comparison that survives suppression: "A diverges and B does not" is
  // a finding, and it is the only one available once the means are withheld.
  const saturatedRow = (cell: CellResult): string =>
    `${count(cell.aggregate.saturatedCount)} of ${count(cell.aggregate.count)} replications`;
  out.line(
    `  ${padColumn('saturated', labelWidth)}  ${padColumn(
      cellA.aggregate.saturated ? red(saturatedRow(cellA)) : dim(saturatedRow(cellA)),
      34,
    )}  ${cellB.aggregate.saturated ? red(saturatedRow(cellB)) : dim(saturatedRow(cellB))}`,
  );
  out.line(dim(`  every mean carries its ${num(confidence * 100, 0)} % interval; there is no bare mean here`));

  /*
   * The two arms do not have the same passenger model, and nine of the twenty-three recorded
   * metrics stop measuring the same thing when they do not.
   *
   * Measured, not theorised: this command used to print `VERDICT: INDISTINGUISHABLE on AWT` for
   * `--a eta --b destination-panel` with nothing said, and AWT is the first of the nine —
   * under a landing panel the arrival-to-boarding span contains the walk to a named car and
   * excludes the option of taking whichever car opens. `core` already declares the partition
   * (`comparabilityOf`) and already raises a disclaimer into `result.warnings`, which `run`
   * prints and this command never read. So the list is taken from `core` rather than restated,
   * and the verdict moves to the metric the contract nominates.
   */
  if (crossModel !== undefined) {
    out.line();
    out.line(
      yellow(bold('  !!  THE TWO ARMS DO NOT SHARE A PASSENGER MODEL — most of this table is not comparable.')),
    );
    out.line(yellow(`      A (${aId}): ${crossModel.aModel}`));
    out.line(yellow(`      B (${bId}): ${crossModel.bModel}`));
    out.line(
      wrap(
        `${count(crossModel.notComparable.length)} of the recorded metrics change construct between these two models and must not be paired: ${crossModel.notComparable.join(', ')}.`,
        Math.min(out.columns - 6, 92),
        '      ',
      ),
    );
    out.line(
      wrap(
        `The verdict below is therefore taken on ${gate.label}, which keeps its definition under both models (docs/09 § 1.6, DECISIONS.md § D27: gate on TTD, and report AWT and WT95 beside it with explicit verdicts rather than omitting them).`,
        Math.min(out.columns - 6, 92),
        '      ',
      ),
    );
  }

  const anySaturated = cellA.aggregate.saturated || cellB.aggregate.saturated;
  if (suppressed.length > 0) {
    out.line();
    if (anySaturated) {
      out.line(red(bold('  ██  SATURATED — a queue diverged. Waiting statistics are suppressed.')));
      for (const line of suppressed) out.line(red(`      ${line}`));
      out.line(
        dim('      Lower --rate, add cars, or treat this configuration as the capacity limit.'),
      );
    } else {
      out.line(
        yellow(bold('  !!  NOT REPORTABLE — some replications produced no usable AWT.')),
      );
      for (const line of suppressed) out.line(yellow(`      ${line}`));
      out.line(
        dim(
          '      Usually a window too thin to contain anybody: try --window full-run, a longer',
        ),
      );
      out.line(dim('      --duration, or a higher --rate.'));
    }
  }

  const usable = cellA.aggregate.awtIsValid && cellB.aggregate.awtIsValid;

  heading(out, `Paired difference  (A − B, ${num(confidence * 100, 0)} % confidence)`);
  let headline: Verdict | undefined;
  let headlineDifference: PairedDifference | undefined;

  // A difference of means is only as trustworthy as the means. If either arm's cohort was
  // censored — saturated, or a window nobody was served in — then every per-metric difference
  // is a difference between two biased estimates, and printing one beside the word BETTER is
  // exactly the "confident nonsense" CLAUDE.md § Statistical discipline is written against.
  if (!usable) {
    for (const entry of REPORTED) {
      out.line(
        `  ${padColumn(entry.label, labelWidth)}  ${
          anySaturated ? red('SUPPRESSED') : yellow('SUPPRESSED')
        }  ${dim('— the arms above are not reportable, so their difference is not either')}`,
      );
    }
  }

  for (const entry of usable ? REPORTED : []) {
    const difference = pairedEstimate(
      cellA,
      cellB,
      entry.metric,
      confidence,
      view.differencesFor?.(entry.metric),
    );
    if (difference === undefined) {
      const missing =
        (cellA.aggregate.metrics[entry.metric]?.nonFiniteCount ?? 0) +
        (cellB.aggregate.metrics[entry.metric]?.nonFiniteCount ?? 0);
      out.line(
        `  ${padColumn(entry.label, labelWidth)}  ${yellow(
          `NO INTERVAL — ${count(missing)} of ${count(reps * 2)} replications produced no value for this metric`,
        )}`,
      );
      continue;
    }
    const verdict = verdictOf(difference, entry.direction);
    if (entry.metric === gate.metric) {
      headline = verdict;
      headlineDifference = difference;
    }
    const { estimate } = difference;
    const text = renderSignedEstimate(estimate.mean, estimate.lower, estimate.upper, {
      digits: entry.digits,
      unit: entry.unit,
    });
    const tag =
      verdict === 'IDENTICAL'
        ? cyan(verdict)
        : verdict === 'INDISTINGUISHABLE'
          ? yellow(verdict)
          : verdict === 'BETTER'
            ? green(verdict)
            : red(verdict);
    out.line(`  ${padColumn(entry.label, labelWidth)}  ${padColumn(text, 34)}  ${tag}`);
  }

  out.line();
  if (!usable) {
    out.line(
      (anySaturated ? red : yellow)(
        bold(
          `  VERDICT: NONE — ${anySaturated ? 'a saturated' : 'an unreportable'} arm cannot be ranked.`,
        ),
      ),
    );
    out.line(
      dim('  docs/03-traffic-and-statistics.md: flag it and suppress the AWT interval; do not'),
    );
    out.line(dim('  report a mean for a system whose queues grow without bound.'));
    if (anySaturated && cellA.aggregate.saturated !== cellB.aggregate.saturated) {
      const diverging = cellA.aggregate.saturated ? `A (${aId})` : `B (${bId})`;
      const coping = cellA.aggregate.saturated ? `B (${bId})` : `A (${aId})`;
      out.line();
      out.line(
        bold(
          `  What can be said: ${diverging} diverges at this load and ${coping} does not. That is a`,
        ),
      );
      out.line(bold('  finding about capacity, and it does not need a mean to be true.'));
    }
  } else if (headline === undefined) {
    out.line(yellow(bold(`  VERDICT: NONE — ${gate.label} could not be estimated on both arms.`)));
  } else if (headline === 'IDENTICAL') {
    const pairs = headlineDifference?.differences.length ?? reps;
    out.line(cyan(bold(`  VERDICT: IDENTICAL on ${gate.label} — ${count(pairs)} of ${count(pairs)} paired differences are exactly zero.`)));
    out.line(
      wrap(
        `${aId} and ${bId} produced bit-identical runs at every replication, so this is no effect at all rather than an effect too small to see. ` +
          'No replication count changes it, and there is nothing here to widen or narrow.',
        Math.min(out.columns - 4, 92),
        '  ',
      ),
    );
    out.line();
    out.line(
      wrap(
        aId === bId
          ? `Comparing ${aId} with itself is the documented sanity check, and this is the result it is supposed to produce: the apparatus adds no difference of its own.`
          : `docs/05-roadmap.md: a bit-identical result is a wiring bug until proven otherwise. Two profiles that differ on paper and not in a single dispatch decision usually mean the difference between them is inert — check that the cost terms ${aId} and ${bId} disagree on are read by the shipped path before reading this as "the two are equally good".`,
        Math.min(out.columns - 4, 92),
        '  ',
      ),
    );
  } else if (headline === 'INDISTINGUISHABLE') {
    out.line(yellow(bold(`  VERDICT: INDISTINGUISHABLE on ${gate.label} at n = ${count(reps)}.`)));
    out.line(
      wrap(
        `The ${num(confidence * 100, 0)} % interval on the difference contains zero, so ${aId} and ${bId} are not ranked. ` +
          'That is not "the same"; it is "below this experiment\'s resolution". Raise --reps to resolve a smaller effect.',
        Math.min(out.columns - 4, 92),
        '  ',
      ),
    );
  } else if (headline === 'BETTER') {
    out.line(green(bold(`  VERDICT: A (${aId}) is BETTER than B (${bId}) on ${gate.label}.`)));
    out.line(dim('  The paired-t interval on the difference excludes zero.'));
  } else {
    out.line(red(bold(`  VERDICT: A (${aId}) is WORSE than B (${bId}) on ${gate.label}.`)));
    out.line(dim('  The paired-t interval on the difference excludes zero.'));
  }

  out.line();
  field(out, 'common RNs', crn, 20);
  field(out, 'executed', view.executed, 20);
  if (reps < 50) {
    out.line(
      yellow(
        `  ${padColumn('budget', 20)}${count(reps)} replications is below the documented 50–200; ten produced a 12 % error in the reference study`,
      ),
    );
  }
  out.line();
  /* Every flag that can move a number, unconditionally where it has a default that can be
     overridden. `--confidence` used to be omitted (review finding #19), so re-running the line
     labelled `reproduce:` reproduced the run but not the verdict printed above it: at
     --confidence 0.8 the printed AWT row read "−0.22 s [−0.41, −0.04] BETTER" and the printed
     command re-ran it at 0.95 as "[−0.51, +0.07] INDISTINGUISHABLE". A reproduce line that
     reproduces a different answer is worse than no reproduce line. Matches `run`, which builds
     its own line from every number-moving flag.

     Both bounds are re-measured on this tree, not carried forward: the 0.95 pair moved from
     [−0.50, +0.05] when `estimateMean` stopped switching to the normal quantile above n = 25
     (review finding #14). At n = 30 the multiplier is 1.043504 at 95 % and 1.023317 at 80 %, which
     is why the 0.8 row is unchanged at two decimals and the 0.95 row is not. Command:
       compare --building midtown-office --a eta --b capacity-aware --reps 30 --seed 20260726
               --rate 1 --duration 900 [--confidence 0.8] */
  out.line(
    `  ${dim('reproduce:')} ${cyan(
      [
        `${BINARY} compare`,
        `--building ${buildingId}`,
        `--a ${aId}`,
        `--b ${bId}`,
        `--reps ${reps}`,
        `--seed ${seed}`,
        `--confidence ${confidence}`,
        ...(window === undefined ? [] : [`--window ${window}`]),
        ...(durationS === undefined ? [] : [`--duration ${durationS}`]),
        ...(rate === undefined ? [] : [`--rate ${rate}`]),
        ...(invocation.traffic === undefined ? [] : [`--traffic ${trafficId}`]),
      ].join(' '),
    )}`,
  );
  out.line();
  return { usable, gate, headline };
}

/* -------------------------------------------------------------------------- *
 * Sharding — docs/15-compute-offload-contract.md Phase B
 * -------------------------------------------------------------------------- */

const MERGE_USAGE = `usage: ${BINARY} compare --merge <file> [<file>…]`;

/** The flags `--merge` accepts. Every other flag moves a number, and a merge reads those from its files. */
const MERGE_FLAG_NAMES: ReadonlySet<string> = new Set(['merge', 'data', 'no-color', 'help']);

async function mergeCommand(out: Output, argv: readonly string[], context: string): Promise<number> {
  const ignored = COMPARE_FLAGS.filter(
    (flag) =>
      !MERGE_FLAG_NAMES.has(flag.name) &&
      argv.some((token) => token === `--${flag.name}` || token.startsWith(`--${flag.name}=`)),
  );
  if (ignored.length > 0) {
    throw new UsageError(
      `${context}: --merge takes the comparison from its block files, so ${ignored.map((flag) => `--${flag.name}`).join(', ')} would be ignored.`,
      ['every flag that moves a number was recorded in each block when it ran; drop it here', MERGE_USAGE],
    );
  }
  const parsed = parseArgs(
    argv,
    COMPARE_FLAGS.filter((flag) => MERGE_FLAG_NAMES.has(flag.name)),
    context,
  );
  if (parsed.positionals.length === 0) {
    throw new UsageError(`${context}: --merge names no shard files.`, [MERGE_USAGE]);
  }
  const config = await loadData(resolveDataDir(stringFlag(parsed, 'data')));
  return await runMerge(out, config, parsed.positionals, context);
}

/** A block file's record of the comparison it belongs to: {@link CompareInvocation} without `serial`. */
function shardContextOf(invocation: CompareInvocation): ShardContext {
  return {
    building: invocation.building,
    a: invocation.a,
    b: invocation.b,
    ...(invocation.traffic === undefined ? {} : { traffic: invocation.traffic }),
    reps: invocation.reps,
    seed: invocation.seed,
    confidence: invocation.confidence,
    ...(invocation.duration === undefined ? {} : { duration: invocation.duration }),
    ...(invocation.rate === undefined ? {} : { rate: invocation.rate }),
    ...(invocation.window === undefined ? {} : { window: invocation.window }),
  };
}

const CONTEXT_KEYS: readonly string[] = [
  'building',
  'a',
  'b',
  'traffic',
  'reps',
  'seed',
  'confidence',
  'duration',
  'rate',
  'window',
];

function invocationFromContext(context: ShardContext, file: string, command: string): CompareInvocation {
  const refuse = (detail: string): UsageError =>
    new UsageError(`${command}: ${file} is not a block written by ${BINARY} compare --shard.`, [detail]);
  for (const key of Object.keys(context)) {
    if (!CONTEXT_KEYS.includes(key)) throw refuse(`it records "${key}", which compare never writes`);
  }
  const text = (key: string): string | undefined => {
    const value = context[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw refuse(`--${key} is recorded as ${JSON.stringify(value)}`);
    return value;
  };
  const number = (key: string): number | undefined => {
    const value = context[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'number') throw refuse(`--${key} is recorded as ${JSON.stringify(value)}`);
    return value;
  };
  const required = <T>(key: string, value: T | undefined): T => {
    if (value === undefined) throw refuse(`it does not record --${key}`);
    return value;
  };
  const traffic = text('traffic');
  const duration = number('duration');
  const rate = number('rate');
  const window = text('window');
  if (window !== undefined && window !== 'full-run' && window !== 'peak-5min') {
    throw refuse(`--window is recorded as "${window}"`);
  }
  return {
    building: required('building', text('building')),
    a: required('a', text('a')),
    b: required('b', text('b')),
    ...(traffic === undefined ? {} : { traffic }),
    reps: required('reps', number('reps')),
    seed: required('seed', number('seed')),
    confidence: required('confidence', number('confidence')),
    ...(duration === undefined ? {} : { duration }),
    ...(rate === undefined ? {} : { rate }),
    ...(window === undefined ? {} : { window }),
    serial: false,
  };
}

/**
 * An `--out` that cannot be written is refused before the block runs. The file is written only after
 * every replication of the block has run, so finding the path unwritable then would spend the block.
 */
function refuseUnwritable(outFile: string, context: string): void {
  const target = resolvePath(outFile);
  try {
    accessSync(dirname(target), fsConstants.W_OK);
  } catch (error) {
    throw new UsageError(`${context}: cannot write the block to ${outFile}, so the block was not run.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  if (existsSync(target) && statSync(target).isDirectory()) {
    throw new UsageError(`${context}: --out ${outFile} is a directory, so the block was not run.`);
  }
}

/** A refusal from the fan-out is the user's to fix, so it leaves as a usage error. */
function refusedAsUsage<T>(context: string, action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof RunnerError) throw new UsageError(`${context}: ${error.message}`);
    throw error;
  }
}

/** `--shard k/n`: run one replication block of both arms and write it. Prints no verdict. */
async function runBlock(
  out: Output,
  config: LoadedConfig,
  invocation: CompareInvocation,
  flags: { readonly shard: string; readonly outFile: string | undefined; readonly ceiling: number | undefined },
  context: string,
): Promise<number> {
  const { bold, dim, cyan } = out.palette;
  if (flags.outFile === undefined) {
    throw new UsageError(`${context}: --shard needs --out <file> to write its block to.`);
  }
  const match = /^(\d+)\/(\d+)$/u.exec(flags.shard);
  const k = Number(match?.[1]);
  const n = Number(match?.[2]);
  if (match === null || !(k >= 1 && k <= n)) {
    throw new UsageError(
      `${context}: --shard expects k/n with 1 ≤ k ≤ n, such as 2/4; received "${flags.shard}".`,
    );
  }
  if (n > invocation.reps) {
    throw new UsageError(
      `${context}: --shard ${flags.shard} cuts ${invocation.reps} replications into ${n} blocks, and a block needs at least one.`,
      [`use at most ${invocation.reps} blocks, or raise --reps`],
    );
  }
  const outFile = flags.outFile;

  const prepared = prepareComparison(config, invocation);
  const plan = planExperiment(prepared.spec, prepared.resources, { keepRecords: false });
  if (flags.ceiling === undefined) {
    // Read from the plan rather than assumed from two arms: cells × replications is the figure
    // `ShardedExperiment.of` checks a ceiling against, and `compare.shard.test.ts` holds the two equal.
    const replications = plan.policy.maxReplications;
    throw new UsageError(`${context}: --shard needs --ceiling <runs>, declared before any block runs.`, [
      `this comparison's whole fan-out spends ${count(plan.cells.length * replications)} replication-runs: ${plan.cells.length} cells × ${replications} replications, read from its plan`,
      'docs/15-compute-offload-contract.md § 4 criterion 7: the ceiling is declared before the first fan-out',
    ]);
  }
  const ceiling = flags.ceiling;
  const sharded = refusedAsUsage(context, () =>
    ShardedExperiment.of(plan, { shards: n, ceiling: { replicationRuns: ceiling } }),
  );
  const block = sharded.blocks[k - 1];
  if (block === undefined) throw new Error(`compare: no block ${k} of ${n}.`);
  refuseUnwritable(outFile, context);

  heading(out, `Replication block ${k} of ${n}`);
  field(out, 'building', `${prepared.base.name}  ${dim(`(${invocation.building})`)}`);
  field(out, 'traffic', prepared.trafficId);
  field(out, 'A', `${prepared.aProfile.name}  ${dim(`(${invocation.a})`)}`);
  field(out, 'B', `${prepared.bProfile.name}  ${dim(`(${invocation.b})`)}`);
  field(
    out,
    'replications',
    `${block.from}–${block.to - 1} of 0–${invocation.reps - 1}, both arms at each, common random numbers`,
  );
  field(out, 'window', invocation.window ?? dim('the demand template’s own'));
  field(out, 'seed', bold(cyan(String(invocation.seed))));
  field(out, 'ceiling', `${count(ceiling)} replication-runs for the whole fan-out, checked before this block ran`);
  field(out, 'plan', `${sharded.planDigest.slice(0, 12)}  ${dim('every block of this comparison carries it, and --merge refuses any other')}`);
  out.line();

  const progress = createProgress(out, (block.to - block.from) * plan.cells.length);
  const result = await runShard(sharded, block.index, {
    onReplication: () => {
      progress.tick();
    },
  });
  progress.done();

  try {
    writeFileSync(outFile, serializeShard(result, shardContextOf(invocation)));
  } catch (error) {
    throw new UsageError(`${context}: could not write the block to ${outFile}.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  printBlockAlone(out, prepared, plan, result);

  out.line();
  field(out, 'wrote', outFile, 20);
  field(out, 'spend', spendLine(result.spend.replicationRuns, result.spend.wallSeconds, result.spend.executor, result.spend.workers), 20);
  field(out, 'merge with', `${BINARY} compare --merge <all ${n} block files>`, 20);
  out.line();
  return 0;
}

/** `--merge <file...>`: every block of one comparison, merged into the unsharded verdict. */
async function runMerge(
  out: Output,
  config: LoadedConfig,
  files: readonly string[],
  context: string,
): Promise<number> {
  const blocks = files.map((file) => {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      throw new UsageError(`${context}: cannot read the block file ${file}.`, [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    try {
      return { file, ...deserializeShard(text) };
    } catch (error) {
      if (error instanceof RunnerError) {
        throw new UsageError(`${context}: ${file} is not a block this command can merge.`, [error.message]);
      }
      throw error;
    }
  });
  const first = blocks[0];
  if (first === undefined) throw new UsageError(`${context}: --merge names no shard files.`, [MERGE_USAGE]);

  for (const block of blocks.slice(1)) {
    const keys = [...new Set([...Object.keys(first.context), ...Object.keys(block.context)])];
    const disagreements = keys.filter((key) => first.context[key] !== block.context[key]);
    if (disagreements.length > 0) {
      throw new UsageError(`${context}: these files are blocks of different comparisons.`, [
        ...disagreements.map(
          (key) =>
            `--${key} ${String(first.context[key] ?? '(unset)')} in ${first.file}, but ${String(block.context[key] ?? '(unset)')} in ${block.file}`,
        ),
        'a merge pairs A and B inside each block; blocks of two comparisons pair nothing with each other',
      ]);
    }
  }

  const invocation = invocationFromContext(first.context, first.file, context);
  const prepared = prepareComparison(config, invocation);
  const plan = planExperiment(prepared.spec, prepared.resources, { keepRecords: false });
  const sharded = refusedAsUsage(context, () =>
    ShardedExperiment.of(plan, { shards: [...first.result.layout], ceiling: first.result.ceiling }),
  );
  const merged = refusedAsUsage(context, () =>
    mergeShards(
      sharded,
      blocks.map((block) => block.result),
    ),
  );

  const cellA = requireCell(merged.result.cells, 'A');
  const cellB = requireCell(merged.result.cells, 'B');
  const pair = merged.pairs.find(
    (candidate) => candidate.candidateCellId === cellA.cellId && candidate.baselineCellId === cellB.cellId,
  );
  if (pair === undefined) {
    throw new UsageError(`${context}: the merged blocks carry no A − B pair, so there is nothing to compare.`);
  }
  const blockCount = merged.spend.shards.length;

  printComparisonHeader(out, prepared);
  const rendered = renderComparison(out, prepared, {
    cellA,
    cellB,
    executed: `${merged.result.replicationsRun} replications, merged from ${blockCount} block${blockCount === 1 ? '' : 's'}`,
    differencesFor: (metric) => pair.differences[metric],
  });
  printMergedResolution(out, rendered, pair, invocation.reps);
  printSpend(out, merged.spend);
  return 0;
}

/* -------------------------------------------------------------------------- *
 * Resolution and spend, beside the verdict
 * -------------------------------------------------------------------------- */

type ResolutionLimit =
  | { readonly kind: 'limit'; readonly n: number; readonly sde: number; readonly required: number | undefined }
  | { readonly kind: 'identical'; readonly n: number }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * `docs/15` § 4 criterion 5's figure, from a difference series and nothing else: the smallest effect
 * a paired interval at this `n` detects at `RESOLUTION_POWER`, by the formula § D151 defined, and the
 * `n` the observed effect would need to clear zero. Computed from whatever series it is handed, so
 * a block's figure is a block's and a merge's is the merge's; neither is ever stored or carried.
 */
function resolutionOf(
  differences: readonly number[] | undefined,
  usable: boolean,
  label: string,
): ResolutionLimit {
  if (!usable) {
    return { kind: 'refused', reason: 'the arms are not reportable, so neither is what this budget can resolve' };
  }
  if (differences === undefined || differences.length === 0 || !differences.every(Number.isFinite)) {
    return { kind: 'refused', reason: `a replication produced no ${label} value` };
  }
  if (differences.length < 2) {
    return { kind: 'refused', reason: `n = ${differences.length} has no spread to measure a limit against` };
  }
  if (differences.every((value) => value === 0)) return { kind: 'identical', n: differences.length };
  const estimate = estimateMean(differences);
  return {
    kind: 'limit',
    n: estimate.n,
    sde: smallestDetectableEffect(estimate.stdDev, estimate.n),
    required: replicationsToResolve(estimate.mean, estimate.stdDev),
  };
}

function powerLabel(): string {
  return `${num(RESOLUTION_POWER * 100, 0)} % power`;
}

function unitOf(metric: ReplicationMetric): { readonly unit: string; readonly digits: number } {
  const entry = REPORTED.find((candidate) => candidate.metric === metric);
  return { unit: entry?.unit ?? '', digits: entry?.digits ?? 2 };
}

/**
 * A block's own figure, at the block's `n`, labelled as its own. Printed so that a merge's figure can
 * be seen to differ from it; nothing in the block file carries it.
 */
function printBlockAlone(
  out: Output,
  prepared: PreparedComparison,
  plan: ExperimentPlan,
  result: ShardResult,
): void {
  const { yellow } = out.palette;
  heading(out, 'This block alone  (not a verdict: the merge recomputes every figure at the merged n)');
  const gate = gateMetricFor(crossModelNotice(prepared.aProfile, prepared.bProfile));
  const { unit, digits } = unitOf(gate.metric);
  const columnOf = (armId: string): number => plan.cells.findIndex((cell) => cell.dispatcherArmId === armId);
  const [a, b] = [columnOf('A'), columnOf('B')];
  const aggregateOf = (column: number): ReturnType<typeof aggregateCell> =>
    aggregateCell(result.rows.map((row) => row.records[column] as ReplicationRecord));
  const usable = aggregateOf(a).awtIsValid && aggregateOf(b).awtIsValid;
  const pairIndex = result.pairs.findIndex(
    (pair) => pair.candidateCellId === plan.cells[a]?.cellId && pair.baselineCellId === plan.cells[b]?.cellId,
  );
  const differences =
    pairIndex === -1
      ? undefined
      : result.rows.map((row) => row.differences[pairIndex]?.[gate.metric] ?? Number.NaN);
  const limit = resolutionOf(differences, usable, gate.label);
  const text =
    limit.kind === 'limit'
      ? `n = ${count(limit.n)}, smallest detectable effect ${num(limit.sde, digits)} ${unit} at ${powerLabel()}`
      : limit.kind === 'identical'
        ? `n = ${count(limit.n)}, every paired difference is exactly zero, so there is no effect to resolve`
        : yellow(`not computed — ${limit.reason}`);
  field(out, gate.label, text);
}

/** The merge's figure, recomputed from every block's differences at the merged `n`. */
function printMergedResolution(
  out: Output,
  rendered: RenderedVerdict,
  pair: MergedPair,
  reps: number,
): void {
  const { yellow } = out.palette;
  heading(
    out,
    `Resolution at the merged n = ${count(reps)}  (recomputed from every block's differences; no block's figure is used)`,
  );
  const { unit, digits } = unitOf(rendered.gate.metric);
  const limit =
    rendered.usable && rendered.headline === undefined
      ? ({ kind: 'refused', reason: `${rendered.gate.label} could not be estimated on both arms` } as const)
      : resolutionOf(pair.differences[rendered.gate.metric], rendered.usable, rendered.gate.label);
  const text =
    limit.kind === 'limit'
      ? `smallest detectable effect ${num(limit.sde, digits)} ${unit} at ${powerLabel()}` +
        (limit.required === undefined
          ? ''
          : `; the observed effect would need n ≈ ${count(limit.required)} to clear zero`)
      : limit.kind === 'identical'
        ? 'every paired difference is exactly zero, so there is no effect to resolve'
        : yellow(`not computed — ${limit.reason}`);
  out.line(`  ${padColumn(rendered.gate.label, 20)}${text}`);
}

function spendLine(runs: number, wallSeconds: number, executor: string, workers: number): string {
  return `${count(runs)} replication-runs, ${num(wallSeconds, 1)} s wall, ${executor}${workers > 1 ? ` ×${workers}` : ''}`;
}

/** docs/15 § 4 criterion 7's second half: what the answer cost, after it and on no line of it. */
function printSpend(out: Output, spend: FanOutSpend): void {
  heading(out, 'Spend  (what this answer cost: beside the verdict, never part of it)');
  field(out, 'ceiling', `${count(spend.ceiling.replicationRuns)} replication-runs, declared before any block ran`, 20);
  for (const [position, shard] of spend.shards.entries()) {
    field(
      out,
      `block ${position + 1} of ${spend.shards.length}`,
      `replications ${shard.block.from}–${shard.block.to - 1}, ${count(shard.replicationRuns)} runs, ${num(shard.wallSeconds, 1)} s wall, ${shard.executor}${shard.workers > 1 ? ` ×${shard.workers}` : ''}`,
      20,
    );
  }
  field(
    out,
    'total',
    `${count(spend.replicationRuns)} of ${count(spend.ceiling.replicationRuns)} replication-runs, ${num(spend.wallSeconds, 1)} s of block wall time, summed`,
    20,
  );
  out.line();
}

/* -------------------------------------------------------------------------- *
 * Passenger models — the comparison this command could not previously refuse
 * -------------------------------------------------------------------------- */

/** What is not comparable between two arms, when their passenger models differ. */
export interface CrossModelNotice {
  readonly aModel: PassengerModel;
  readonly bModel: PassengerModel;
  /** Metric ids that change construct across the two models. Taken from `core`, never listed here. */
  readonly notComparable: readonly string[];
}

/**
 * The passenger model an arm will run under, off the **resolved** dispatch stage.
 *
 * `resolveDispatchConfig` is what applies the defaults and what refuses `panel` under a call type
 * that cannot ask for a destination, and `passengerModelOf` is the same function `Simulation`
 * uses to stamp `RunRecord.passengerModel`. Reading the authored
 * `profile.dispatch?.passengerAssignment` instead would be a second opinion about a question
 * `core` has already answered, and would disagree the first time a default changed.
 */
export function modelOfProfile(profile: DispatcherProfile): PassengerModel {
  return passengerModelOf(resolveDispatchConfig(profile).dispatch);
}

/**
 * `undefined` when the two arms share a passenger model, and the notice when they do not.
 *
 * `notComparable` is `core`'s own list — `comparabilityOf('destination-dispatch')` — so a metric
 * added to or removed from the nine appears here without this file being edited. That matters:
 * the list exists precisely because nobody remembers it, and a copy in the CLI would be the
 * stale-published-number shape one directory over.
 */
export function crossModelNotice(
  a: DispatcherProfile,
  b: DispatcherProfile,
): CrossModelNotice | undefined {
  const aModel = modelOfProfile(a);
  const bModel = modelOfProfile(b);
  if (aModel === bModel) return undefined;
  return {
    aModel,
    bModel,
    notComparable: comparabilityOf('destination-dispatch').notComparableMetrics,
  };
}

/**
 * Which metric the headline verdict is taken on.
 *
 * AWT within one passenger model; **TTD** across two, because AWT is the first of the nine
 * metrics that stop measuring the same thing — docs/09 § 1.6 and `DECISIONS.md` § D27. Asserted
 * rather than assumed: the fallback is looked up in {@link REPORTED} so a gate metric that
 * stopped being reported is a build error rather than a silent reversion to AWT.
 */
export function gateMetricFor(notice: CrossModelNotice | undefined): {
  readonly metric: ReplicationMetric;
  readonly label: string;
} {
  const wanted: ReplicationMetric = notice === undefined ? 'awtS' : 'ttdMeanS';
  const entry = REPORTED.find((candidate) => candidate.metric === wanted);
  if (entry === undefined) {
    throw new Error(`compare: the gate metric "${wanted}" is not in the reported table.`);
  }
  return { metric: entry.metric, label: entry.label };
}

/* -------------------------------------------------------------------------- *
 * Statistics
 * -------------------------------------------------------------------------- */

export type Verdict = 'BETTER' | 'WORSE' | 'INDISTINGUISHABLE' | 'IDENTICAL';

/**
 * A paired difference and the evidence behind it: the interval, and the raw per-replication
 * differences the interval was computed from.
 *
 * The differences are carried rather than recomputed because {@link identical} is keyed on them
 * being **exactly** zero. There is no tolerance here on purpose: "within 1e-9 of each other" is a
 * claim about resolution, which is what INDISTINGUISHABLE already says. IDENTICAL is a claim about
 * the two runs having been the same run, and only `d === 0` supports it.
 */
export interface PairedDifference {
  readonly estimate: MeanEstimate;
  /** `A − B`, one per replication, in replication index order. */
  readonly differences: readonly number[];
  /** How many of {@link differences} are exactly `0`. */
  readonly exactZeroCount: number;
  /** `n > 0` and every paired difference is exactly `0`. */
  readonly identical: boolean;
}

/**
 * The verdict, and the only place a difference is allowed to become a word.
 *
 * `direction` is `-1` when lower is better, so a negative difference on AWT is A winning.
 *
 * IDENTICAL is tested first and does not consult the interval at all. An all-zero difference series
 * has a zero-width interval at `[0, 0]`, which `intervalContainsZero` reports as true, so the
 * ordering is what keeps the two apart — and the interval is the wrong instrument for the question
 * anyway. Mirrors `experiments`' `benchmark/verdict.ts` `classify`, which reaches the same
 * conclusion from `exactZeroCount === n` before it reaches for `intervalExcludesZero`.
 */
export function verdictOf(difference: PairedDifference, direction: -1 | 1): Verdict {
  if (difference.identical) return 'IDENTICAL';
  const { estimate } = difference;
  if (!Number.isFinite(estimate.lower) || !Number.isFinite(estimate.upper)) {
    return 'INDISTINGUISHABLE';
  }
  if (intervalContainsZero(estimate)) return 'INDISTINGUISHABLE';
  const improved = direction === -1 ? estimate.upper < 0 : estimate.lower > 0;
  return improved ? 'BETTER' : 'WORSE';
}

function requireCell(cells: readonly CellResult[], armId: string): CellResult {
  const cell = cells.find((candidate) => candidate.dispatcherArmId === armId);
  if (cell === undefined) {
    throw new UsageError(`the experiment produced no results for arm "${armId}".`);
  }
  return cell;
}

interface ArmEstimate {
  readonly estimate: MeanEstimate | undefined;
  readonly suppressed: boolean;
  readonly reason?: string | undefined;
}

/**
 * The metrics whose value contains a waiting time, and which therefore cannot survive the
 * suppression of AWT.
 *
 * TTD is the one that looks like it escapes and does not. Core defines it (metrics/types.ts) as
 * arrival at the first landing to alighting at the final one, **including every transfer wait**,
 * and it is averaged over the journeys that *completed*. On a saturated arm that is a divergent
 * quantity measured on the survivors — the same censoring `awtInvalidReason` describes, with the
 * bias pointing the flattering way. Leaving it in the table printed two intervals that did not
 * overlap directly above a line saying the arms were not reportable, which is an invitation to
 * rank two dispatchers off a table the code had just declared unrankable.
 */
const WAIT_DERIVED_METRICS: ReadonlySet<ReplicationMetric> = new Set<ReplicationMetric>([
  'awtS',
  'wt95S',
  'wt99S',
  'maxWaitS',
  'pctOverLongWait',
  'ttdMeanS',
  'ttdP95S',
]);

function armEstimate(
  cell: CellResult,
  metric: ReplicationMetric,
  confidence: number,
): ArmEstimate {
  const waitMetric = WAIT_DERIVED_METRICS.has(metric);
  if (waitMetric && !cell.aggregate.awtIsValid) {
    return {
      estimate: undefined,
      suppressed: true,
      ...(cell.aggregate.awtInvalidReason === undefined
        ? {}
        : { reason: cell.aggregate.awtInvalidReason }),
    };
  }
  const samples = finiteSamples(cell, metric);
  if (samples === undefined) {
    return { estimate: undefined, suppressed: false, reason: 'a replication produced no value' };
  }
  return { estimate: estimateMean(samples, { confidence }), suppressed: false };
}

function renderArm(arm: ArmEstimate, digits: number, unit: string, out: Output): string {
  if (arm.estimate === undefined) {
    return arm.suppressed ? out.palette.red('SUPPRESSED') : out.palette.yellow(ABSENT);
  }
  return renderEstimate(arm.estimate.mean, arm.estimate.lower, arm.estimate.upper, {
    digits,
    unit,
  });
}

/** Every replication's value for one metric, or `undefined` if any of them is not a number. */
function finiteSamples(cell: CellResult, metric: ReplicationMetric): readonly number[] | undefined {
  const aggregate = cell.aggregate.metrics[metric];
  if (aggregate === undefined) return undefined;
  if (aggregate.nonFiniteCount > 0 || aggregate.samples.length < 2) return undefined;
  return aggregate.samples;
}

/**
 * The paired-t interval on `A − B`.
 *
 * Pairing is by replication index, which is exactly the index the CRN cohort aligns traces on.
 * `undefined` when either arm has a non-finite value: an absent measurement is excluded
 * deliberately here rather than averaged into a plausible number.
 */
function pairedEstimate(
  a: CellResult,
  b: CellResult,
  metric: ReplicationMetric,
  confidence: number,
  stored?: readonly number[] | undefined,
): PairedDifference | undefined {
  const left = finiteSamples(a, metric);
  const right = finiteSamples(b, metric);
  if (left === undefined || right === undefined) return undefined;
  const n = Math.min(left.length, right.length);
  if (n < 2) return undefined;
  if (stored !== undefined) {
    // A merge: the differences each block computed from its own records, in replication order.
    // `mergeShards` has already refused a block whose stored differences its records do not give,
    // so these are the values the branch below computes, taken from where they were paired.
    if (stored.length !== n) {
      throw new Error(`compare: ${stored.length} merged differences for ${n} replications of ${metric}.`);
    }
    let storedZeros = 0;
    for (const value of stored) if (value === 0) storedZeros += 1;
    return {
      estimate: estimateMean(stored, { confidence }),
      differences: stored,
      exactZeroCount: storedZeros,
      identical: storedZeros === n,
    };
  }
  const candidate = left.slice(0, n);
  const baseline = right.slice(0, n);
  const differences = candidate.map((value, index) => value - (baseline[index] as number));
  let exactZeroCount = 0;
  for (const value of differences) if (value === 0) exactZeroCount += 1;
  return {
    estimate: pairedDifferenceEstimate(candidate, baseline, { confidence }),
    differences,
    exactZeroCount,
    identical: exactZeroCount === n,
  };
}

/** Whether the two arms really did see identical passenger populations, index by index. */
function crnStatus(a: CellResult, b: CellResult): string {
  const n = Math.min(a.replications.length, b.replications.length);
  let matched = 0;
  for (let index = 0; index < n; index += 1) {
    if (a.replications[index]?.traceDigest === b.replications[index]?.traceDigest) matched += 1;
  }
  return matched === n && n > 0
    ? `verified — ${count(n)} of ${count(n)} replication pairs share a trace digest`
    : `MISMATCH — only ${count(matched)} of ${count(n)} pairs share a trace digest`;
}

/* -------------------------------------------------------------------------- *
 * Progress
 * -------------------------------------------------------------------------- */

interface Progress {
  tick(): void;
  done(): void;
}

/**
 * A progress bar on a TTY, a dot every few replications otherwise.
 *
 * A hundred replications of a twenty-floor building is a minute of staring at nothing, and a CLI
 * that looks hung is a CLI nobody runs twice.
 */
function createProgress(out: Output, total: number): Progress {
  const { dim, cyan } = out.palette;
  let done = 0;
  const started = Date.now();
  const width = Math.max(10, Math.min(40, out.columns - 40));

  if (!out.isTTY) {
    return {
      tick(): void {
        done += 1;
        if (done % Math.max(1, Math.ceil(total / 8)) === 0 || done === total) {
          out.line(`  … ${done}/${total} replications`);
        }
      },
      done(): void {
        /* the last tick already said so */
      },
    };
  }

  const render = (): void => {
    const fraction = total === 0 ? 1 : done / total;
    const filled = Math.round(fraction * width);
    const elapsed = (Date.now() - started) / 1000;
    const eta = done === 0 ? Number.NaN : (elapsed / done) * (total - done);
    out.raw(
      `\r  ${cyan('█'.repeat(filled))}${dim('·'.repeat(width - filled))} ${String(done).padStart(String(total).length)}/${total}` +
        `  ${dim(Number.isFinite(eta) ? `${num(eta, 0)} s left` : 'starting…')}   `,
    );
  };

  render();
  return {
    tick(): void {
      done += 1;
      render();
    },
    done(): void {
      out.raw('\r');
      out.raw(' '.repeat(Math.max(1, Math.min(out.columns - 1, width + 40))));
      out.raw('\r');
    },
  };
}
