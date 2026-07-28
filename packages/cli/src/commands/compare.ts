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
 */

import type { ReplicationMetric } from '@elevator-sim/experiments';
import {
  estimateMean,
  intervalContainsZero,
  pairedDifferenceEstimate,
  runExperiment,
  type CellResult,
  type ExperimentSpec,
  type MeanEstimate,
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
import { UsageError } from '../errors.js';
import { ABSENT, count, num, renderEstimate, renderSignedEstimate } from '../format.js';
import { BINARY, printCommandHelp, wrap, type CommandHelp } from '../help.js';
import { field, heading, padColumn, type Output } from '../output.js';

/** The metrics the verdict table reports. AWT decides; the others are context. */
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
  ],
  flags: COMPARE_FLAGS,
  examples: [
    `${BINARY} compare --building garden-apartments --a eta --b nearest-car --reps 100 --window full-run`,
    `${BINARY} compare --building midtown-office --a predictive-balanced --b eta --reps 200 --rate 8`,
    `${BINARY} compare --building garden-apartments --a eta --b eta --reps 20 --window full-run   # must be IDENTICAL`,
  ],
};

export async function compareCommand(out: Output, argv: readonly string[]): Promise<number> {
  const context = `${BINARY} compare`;
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
  const { bold, dim, cyan, green, red, yellow } = out.palette;

  const buildingId = requiredStringFlag(parsed, 'building');
  const aId = requiredStringFlag(parsed, 'a');
  const bId = requiredStringFlag(parsed, 'b');
  const base = requireBuilding(config, buildingId);
  const aProfile = requireDispatcher(config, aId, '--a');
  const bProfile = requireDispatcher(config, bId, '--b');
  const trafficId = stringFlag(parsed, 'traffic') ?? base.trafficProfile;
  requireTrafficProfile(config, trafficId);
  const building = withTrafficProfile(base, trafficId);

  const reps = numberFlag(parsed, 'reps') ?? 100;
  const seed = numberFlag(parsed, 'seed') ?? randomSeed();
  const confidence = numberFlag(parsed, 'confidence') ?? 0.95;
  const durationS = numberFlag(parsed, 'duration');
  const rate = numberFlag(parsed, 'rate');
  const serial = booleanFlag(parsed, 'serial');
  const window = stringFlag(parsed, 'window');

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
    ...(serial ? { parallel: { mode: 'serial' as const } } : {}),
  };

  heading(out, 'Paired comparison');
  field(out, 'building', `${base.name}  ${dim(`(${buildingId})`)}`);
  field(out, 'traffic', trafficId);
  field(out, 'A', `${aProfile.name}  ${dim(`(${aId})`)}`);
  field(out, 'B', `${bProfile.name}  ${dim(`(${bId})`)}`);
  field(out, 'replications', `${count(reps)} per arm, common random numbers`);
  field(out, 'window', window ?? dim('the demand template’s own'));
  field(out, 'seed', bold(cyan(String(seed))));
  out.line();

  const total = reps * 2;
  const progress = createProgress(out, total);
  const result = await runExperiment(
    spec,
    {
      buildingsById: new Map([[buildingId, building]]),
      dispatcherProfilesById: config.dispatcherProfilesById,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
    },
    {
      // The summaries and their scalar projections are all this command reads; keeping every
      // RunRecord would cost hundreds of megabytes at 200 replications and buy nothing.
      keepRecords: false,
      onReplication: () => {
        progress.tick();
      },
    },
  );
  progress.done();

  const cellA = requireCell(result.cells, 'A');
  const cellB = requireCell(result.cells, 'B');

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
    const difference = pairedEstimate(cellA, cellB, entry.metric, confidence);
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
    if (entry.metric === 'awtS') {
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
    out.line(yellow(bold('  VERDICT: NONE — AWT could not be estimated on both arms.')));
  } else if (headline === 'IDENTICAL') {
    const pairs = headlineDifference?.differences.length ?? reps;
    out.line(cyan(bold(`  VERDICT: IDENTICAL on AWT — ${count(pairs)} of ${count(pairs)} paired differences are exactly zero.`)));
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
    out.line(yellow(bold(`  VERDICT: INDISTINGUISHABLE on AWT at n = ${count(reps)}.`)));
    out.line(
      wrap(
        `The ${num(confidence * 100, 0)} % interval on the difference contains zero, so ${aId} and ${bId} are not ranked. ` +
          'That is not "the same"; it is "below this experiment\'s resolution". Raise --reps to resolve a smaller effect.',
        Math.min(out.columns - 4, 92),
        '  ',
      ),
    );
  } else if (headline === 'BETTER') {
    out.line(green(bold(`  VERDICT: A (${aId}) is BETTER than B (${bId}) on AWT.`)));
    out.line(dim('  The paired-t interval on the difference excludes zero.'));
  } else {
    out.line(red(bold(`  VERDICT: A (${aId}) is WORSE than B (${bId}) on AWT.`)));
    out.line(dim('  The paired-t interval on the difference excludes zero.'));
  }

  out.line();
  field(out, 'common RNs', crn, 20);
  field(
    out,
    'executed',
    `${result.replicationsRun} replications, ${result.execution.executor}${result.execution.executor === 'workers' ? ` ×${result.execution.workers}` : ''}, ${num(result.execution.elapsedMs / 1000, 1)} s`,
    20,
  );
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
     command re-ran it at 0.95 as "[−0.50, +0.05] INDISTINGUISHABLE". A reproduce line that
     reproduces a different answer is worse than no reproduce line. Matches `run`, which builds
     its own line from every number-moving flag. */
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
        ...(stringFlag(parsed, 'traffic') === undefined ? [] : [`--traffic ${trafficId}`]),
      ].join(' '),
    )}`,
  );
  out.line();
  return 0;
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
): PairedDifference | undefined {
  const left = finiteSamples(a, metric);
  const right = finiteSamples(b, metric);
  if (left === undefined || right === undefined) return undefined;
  const n = Math.min(left.length, right.length);
  if (n < 2) return undefined;
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
