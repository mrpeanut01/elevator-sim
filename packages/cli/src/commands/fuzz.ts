/**
 * `elevator-sim fuzz` — generate buildings nobody authored, run them, and check the six
 * properties on every finished run.
 *
 * This command is **Phase 8's fuzz track's non-test caller**, and that is the whole reason it
 * exists rather than a convenience. `packages/experiments/src/fuzz/` shipped complete, correct and
 * unit-tested with every importer of `campaign.js` outside `fuzz/index.ts` a `*.test.ts` —
 * docs/07-handoff.md § 3 records it as **C24**, a weaker instance of the standing requirement than
 * the nine it counts, defensible (a fuzzer's product *is* a test) and still weaker than the answer
 * `tune` gives `tuning/`. So the point of this file is that it is the named caller: it reaches
 * {@link runCampaign}, {@link formatStats}, {@link STANDARD_CORPUS}, {@link deepSeeds},
 * {@link STANDARD_SPACE} and {@link DEEP_SPACE} from a path a user can type, and it puts the
 * 2 000-case deep campaign — until now reachable only through an environment variable and a
 * vitest invocation — in their hands.
 *
 * ## What it will not do
 *
 * - **It never moves a bound to make a case pass.** `PROPERTY_BOUNDS` is read and printed, never
 *   overridden from a flag. Both of Phase 8's blocking violations were closed by fixing `core`,
 *   and `fuzz-1001074`'s whole lesson is that the 900 s starvation bound is the finding rather
 *   than the obstacle. A `--starvation-bound` flag would be the one-line way to lose that.
 * - **It never silently truncates.** The campaign's own `CampaignStats` is printed in full — cases,
 *   evaluated, skipped, passengers, simulated hours, topologies and run statuses — because a
 *   campaign that does not say what it cost is a campaign whose green means nothing.
 * - **It never reports a violation quietly.** A counterexample is printed whole, shrunk, with the
 *   generator seed that reproduces its unshrunk parent, and the process exits `2`. A fuzz run that
 *   found a lost passenger and exited `0` would be worse than no fuzz run at all.
 *
 * ## Tiers are flags here, not environment
 *
 * `campaign.ts` reads `ELEVATOR_SIM_FUZZ` to decide whether the opt-in vitest tier runs at all;
 * this command does not consult it, because a tier chosen by an ambient variable is a tier a user
 * cannot see in their own shell history. `--tier deep` is the switch. The one thing it does borrow
 * is {@link deepCampaignSize}, so `--tier deep` with no `--cases` runs the same 250 the vitest tier
 * runs (and honours `ELEVATOR_SIM_FUZZ_CASES` identically) rather than inventing a second default
 * for the same thing.
 */

import {
  DEEP_SPACE,
  FUZZ_PROPERTIES,
  PROPERTY_BOUNDS,
  STANDARD_CORPUS,
  STANDARD_SPACE,
  deepCampaignSize,
  deepSeeds,
  formatOutcome,
  formatStats,
  runCampaign,
  type CampaignStats,
  type FuzzOutcome,
  type FuzzProperty,
  type FuzzSpace,
  type ShrinkResult,
} from '@elevator-sim/experiments';
import type { LoadedConfig } from '@elevator-sim/core';

import {
  booleanFlag,
  numberFlag,
  parseArgs,
  rejectPositionals,
  stringFlag,
  type FlagSpec,
  type ParsedArgs,
} from '../args.js';
import { loadData, resolveDataDir } from '../data.js';
import { EXIT_INTERNAL, UsageError } from '../errors.js';
import { count, num } from '../format.js';
import { BINARY, printCommandHelp, wrap, type CommandHelp } from '../help.js';
import { field, heading, padColumn, type Output } from '../output.js';

/* -------------------------------------------------------------------------- *
 * Tiers
 * -------------------------------------------------------------------------- */

/** The two corpora `campaign.ts` documents, named on the command line rather than in an env var. */
export const FUZZ_TIERS = ['standard', 'deep'] as const;

export type FuzzTier = (typeof FUZZ_TIERS)[number];

/** The generation space each tier draws from. Both are `fuzz/generate.ts`'s, unmodified. */
export function spaceOf(tier: FuzzTier): FuzzSpace {
  return tier === 'deep' ? DEEP_SPACE : STANDARD_SPACE;
}

/** The deep tier's default case count, and how many the standard tier has pinned. */
const DEFAULT_DEEP_CASES = 250;

/**
 * The seeds a run will use.
 *
 * The two tiers differ in **kind**, not only in size, and the difference is deliberate:
 *
 * - `standard` is {@link STANDARD_CORPUS}, 64 seeds **pinned** so the always-on tier is a
 *   regression suite — the same buildings on every machine, forever. `--cases` truncates it and
 *   cannot extend it: appending generated seeds to a pinned corpus would produce a corpus whose
 *   coverage claims `generate.test.ts` asserts are no longer true of it.
 * - `deep` is a contiguous range from `--from`, so any budget is reachable and any case is one
 *   integer somebody can type back.
 *
 * @throws UsageError when `cases` exceeds what the pinned corpus contains.
 */
export function seedsFor(tier: FuzzTier, cases: number | undefined, from: number): readonly number[] {
  if (tier === 'deep') return deepSeeds(cases ?? DEFAULT_DEEP_CASES, from);
  if (cases === undefined) return STANDARD_CORPUS;
  if (cases > STANDARD_CORPUS.length) {
    throw new UsageError(
      `--cases ${String(cases)} is more than the standard tier has: its corpus is ${String(STANDARD_CORPUS.length)} pinned seeds.`,
      [
        'the standard corpus is pinned so that the always-on tier is a regression suite; it is truncated by --cases, never extended',
        `for a larger campaign use --tier deep, which generates a contiguous seed range: ${BINARY} fuzz --tier deep --cases ${String(cases)}`,
      ],
    );
  }
  return STANDARD_CORPUS.slice(0, cases);
}

/* -------------------------------------------------------------------------- *
 * Flags
 * -------------------------------------------------------------------------- */

export const FUZZ_FLAGS: readonly FlagSpec[] = [
  {
    name: 'tier',
    kind: 'string',
    placeholder: '<id>',
    summary: 'standard is the pinned always-on corpus; deep generates a wider space',
    choices: [...FUZZ_TIERS],
    defaultValue: 'standard',
  },
  {
    name: 'cases',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'how many cases to run; the deep tier’s budget is wall clock, not replications',
    min: 1,
    max: 1_000_000,
    defaultText: 'standard: the whole 64-seed corpus; deep: 250',
  },
  {
    name: 'from',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'first generator seed of a deep run; a case is a pure function of its seed',
    min: 0,
    defaultValue: 1_000_001,
  },
  {
    name: 'shrink',
    kind: 'boolean',
    summary: 'reduce every counterexample to a minimal one before printing it',
    defaultValue: true,
  },
  {
    name: 'shrink-budget',
    kind: 'integer',
    placeholder: '<n>',
    summary: 'candidate reductions a single counterexample may spend',
    min: 1,
    max: 100_000,
    defaultText: 'the shrinker’s own',
  },
  {
    name: 'full',
    kind: 'boolean',
    summary: 'print the unshrunk parent of each counterexample as well as the minimal one',
  },
  { name: 'data', kind: 'string', placeholder: '<dir>', summary: 'data directory to read' },
  { name: 'no-color', kind: 'boolean', summary: 'never emit ANSI colour' },
  { name: 'help', kind: 'boolean', aliases: ['h'], summary: 'show this help' },
];

export const FUZZ_HELP: CommandHelp = {
  name: 'fuzz',
  usage: `${BINARY} fuzz [--tier standard|deep] [--cases <n>] [--from <n>]`,
  summary: 'generate random buildings and check the six run properties on every one',
  description: [
    'Randomized buildings, not just randomized seeds. Every case is generated through the real ' +
      'schema — the same parseBuilding loadConfig applies — so a case that reaches the simulator ' +
      'is by construction one the loader would accept, and it is run through the shipped ' +
      'runSimulation rather than a test harness.',
    'Six properties are re-derived from the trace and the record of each finished run: nobody is ' +
      'lost, nobody is delivered to the wrong floor, no car carries a load the boarding rule ' +
      'could not have produced, no time runs backwards, the run terminates, and nobody waits past ' +
      'the stated bound unless the run flags itself saturated. The bounds are printed and are not ' +
      'settable from here: moving one to make a case pass is the failure this whole track exists ' +
      'to prevent.',
    'A counterexample is shrunk, printed whole with the seed that reproduces its unshrunk parent, ' +
      'and exits 2. A campaign that found a lost passenger and exited 0 would be worse than no ' +
      'campaign at all.',
  ],
  flags: FUZZ_FLAGS,
  examples: [
    `${BINARY} fuzz`,
    `${BINARY} fuzz --cases 8`,
    `${BINARY} fuzz --tier deep --cases 250`,
    `${BINARY} fuzz --tier deep --cases 2000 --shrink-budget 200`,
  ],
};

export async function fuzzCommand(out: Output, argv: readonly string[]): Promise<number> {
  const context = `${BINARY} fuzz`;
  const parsed = parseArgs(argv, FUZZ_FLAGS, context);
  rejectPositionals(parsed, context);
  if (parsed.values['help'] === true) {
    printCommandHelp(out, FUZZ_HELP);
    return 0;
  }
  const config = await loadData(resolveDataDir(stringFlag(parsed, 'data')));
  return runFuzz(out, config, parsed);
}

/* -------------------------------------------------------------------------- *
 * The run
 * -------------------------------------------------------------------------- */

export function runFuzz(out: Output, config: LoadedConfig, parsed: ParsedArgs): number {
  const { dim, cyan, yellow } = out.palette;

  const tier = (stringFlag(parsed, 'tier') ?? 'standard') as FuzzTier;
  const requested = numberFlag(parsed, 'cases');
  const from = numberFlag(parsed, 'from') ?? 1_000_001;
  const shrink = booleanFlag(parsed, 'shrink');
  const shrinkBudget = numberFlag(parsed, 'shrink-budget');
  const full = booleanFlag(parsed, 'full');

  const cases = tier === 'deep' ? (requested ?? deepCampaignSize()) : requested;
  const seeds = seedsFor(tier, cases, from);
  const space = spaceOf(tier);

  /* ---- the plan, printed before anything runs ---------------------------- */

  heading(out, 'Fuzz campaign');
  field(out, 'tier', `${tier}  ${dim(tierNote(tier))}`);
  field(out, 'cases', `${count(seeds.length)}  ${dim(seedNote(tier, seeds, from))}`);
  field(
    out,
    'space',
    `${String(space.minFloors)}–${String(space.maxFloors)} floors, ≤ ${String(space.maxCarsPerBank)} cars/bank, ` +
      `${String(space.minDurationS)}–${String(space.maxDurationS)} s horizons, ≤ ${String(space.maxArrivalRatePctPop5min)} %pop/5min`,
  );
  field(
    out,
    'bounds',
    `deadlock ${String(PROPERTY_BOUNDS.deadlockIdleBoundS)} s idle, starvation ${String(PROPERTY_BOUNDS.starvationBoundS)} s  ${dim('— stated, and not settable from here')}`,
  );
  field(
    out,
    'shrink',
    shrink
      ? `on${shrinkBudget === undefined ? '' : `, budget ${count(shrinkBudget)}`}`
      : `${yellow('off')}  ${dim('— counterexamples print at the size they were found')}`,
  );
  field(out, 'properties', `${count(FUZZ_PROPERTIES.length)}  ${dim(FUZZ_PROPERTIES.join(', '))}`);
  out.line();

  if (tier === 'deep') {
    out.line(
      dim(
        `  the deep tier’s budget is wall clock, not replications: ${count(seeds.length)} cases of up to ` +
          `${String(space.maxFloors)} floors and ${String(space.maxDurationS)} s take minutes, and 2 000 is the overnight pass`,
      ),
    );
    out.line();
  }

  /* ---- the campaign ------------------------------------------------------ */

  /*
   * Run in chunks, and merge. `runCampaign` has no progress hook and is not this task's file to
   * give one, so the alternative to chunking is a 2 000-case run that prints nothing for several
   * minutes and cannot be told apart from a hang. Chunking cannot move a number: a case is a pure
   * function of its own seed and carries its own `StreamSet`, so the same seeds in any grouping
   * produce the same outcomes — `fuzz.test.ts` asserts that against one undivided `runCampaign`
   * call over the same seeds rather than assuming it.
   */
  const size = chunkSize(seeds.length);
  const outcomes: FuzzOutcome[] = [];
  const failures: ShrinkResult[] = [];
  let stats: CampaignStats | undefined;

  for (let start = 0; start < seeds.length; start += size) {
    const slice = seeds.slice(start, start + size);
    const chunk = runCampaign({
      config,
      seeds: slice,
      space,
      shrink,
      ...(shrinkBudget === undefined ? {} : { shrinkBudget }),
    });
    outcomes.push(...chunk.outcomes);
    failures.push(...chunk.failures);
    stats = stats === undefined ? chunk.stats : mergeStats(stats, chunk.stats);

    if (start + size < seeds.length) {
      out.line(
        dim(
          `  … ${String(Math.min(start + size, seeds.length))}/${String(seeds.length)} cases, ${String(failures.length)} counterexample(s) so far`,
        ),
      );
    }
  }

  /* An empty seed list is unreachable — `--cases` has a floor of 1 and both corpora are non-empty
     — but a campaign that reported a green verdict over nothing is exactly the vacuous pass this
     project keeps finding, so it is refused rather than assumed away. */
  if (stats === undefined) {
    throw new UsageError('no cases to run.', ['--cases must name at least one case']);
  }

  const code = reportCampaign(out, { tier, stats, outcomes, failures, full });

  out.line();
  out.line(
    `  ${dim('reproduce:')} ${cyan(
      [
        `${BINARY} fuzz`,
        `--tier ${tier}`,
        `--cases ${String(seeds.length)}`,
        ...(tier === 'deep' ? [`--from ${String(from)}`] : []),
        ...(shrink ? [] : ['--no-shrink']),
        ...(shrinkBudget === undefined ? [] : [`--shrink-budget ${String(shrinkBudget)}`]),
        ...(stringFlag(parsed, 'data') === undefined
          ? []
          : [`--data ${stringFlag(parsed, 'data') ?? ''}`]),
      ].join(' '),
    )}`,
  );
  out.line();

  return code;
}

/* -------------------------------------------------------------------------- *
 * The report
 * -------------------------------------------------------------------------- */

/** Everything the report needs. Separated from the run so a *failing* campaign can be driven. */
export interface CampaignReportInput {
  readonly tier: FuzzTier;
  readonly stats: CampaignStats;
  readonly outcomes: readonly FuzzOutcome[];
  readonly failures: readonly ShrinkResult[];
  /** Print the unshrunk parent beside the minimal case. */
  readonly full?: boolean | undefined;
}

/**
 * What the campaign found, and the exit code that goes with it.
 *
 * Exported and taken as data rather than folded into {@link runFuzz} for one reason: the branch
 * that matters here is the one a green run never reaches. The command exposes no fault-injection
 * flag — shipping one would put the test harness on the user's command line, and worse, would put
 * a way to *manufacture* a counterexample beside the thing that reports them. So the violation
 * branch is driven in `fuzz.test.ts` from a **real** faulted run (`stallingAfter` through
 * `evaluateCase`) into this function, which is the same function `runFuzz` calls. A red banner
 * nobody has ever seen is a red banner nobody can trust.
 */
export function reportCampaign(out: Output, input: CampaignReportInput): number {
  const { bold, dim, cyan, green, red, yellow } = out.palette;
  const { tier, stats, outcomes, failures, full = false } = input;

  /* ---- what it cost, from the campaign's own accounting ------------------- */

  heading(out, 'What ran');
  for (const row of formatStats(stats).split('\n')) out.line(`  ${dim(row.slice(0, 17))}${row.slice(17)}`);

  const unroutable = stats.statuses['unroutable'] ?? 0;
  const invalid = stats.statuses['invalid-config'] ?? 0;
  if (unroutable > 0 || invalid > 0) {
    out.line();
    out.line(
      yellow(
        `  !!  ${count(unroutable + invalid)} case(s) produced no verdict — ${count(unroutable)} unroutable, ${count(invalid)} invalid-config`,
      ),
    );
    out.line(
      wrap(
        'Both are generator defects rather than simulator ones: a building no chain of banks ' +
          'connects is a building nobody could ride, and the trace planner is right to refuse it. ' +
          'They are counted rather than swallowed, and the pinned corpus produces none of either — ' +
          'so a non-zero count here on the standard tier is a finding about the generator.',
        Math.min(out.columns - 6, 92),
        '      ',
      ),
    );
  }

  /* ---- the six properties, one line each --------------------------------- */

  const byProperty = violationsByProperty(outcomes);
  heading(out, 'Properties');
  const width = Math.max(...FUZZ_PROPERTIES.map((property) => property.length));
  for (const property of FUZZ_PROPERTIES) {
    const failing = byProperty.get(property) ?? 0;
    out.line(
      `  ${padColumn(property, width)}  ` +
        (failing === 0
          ? `${green('held')}  ${dim(`in ${count(stats.evaluated)} of ${count(stats.cases)} evaluated`)}`
          : bold(red(`VIOLATED in ${count(failing)} case(s)`))),
    );
  }

  /* ---- counterexamples --------------------------------------------------- */

  const thrown = outcomes.filter((outcome) => outcome.threw !== undefined).length;

  if (failures.length > 0) {
    heading(out, 'Counterexamples');
    for (const failure of failures) {
      out.line();
      out.line(
        bold(
          red(
            `  ██  ${failure.minimal.case.caseId}${failure.steps > 0 ? ` — shrunk in ${String(failure.steps)} steps (${String(failure.evaluations)} evaluations)` : ''}`,
          ),
        ),
      );
      out.line();
      if (full && failure.original !== failure.minimal) {
        out.line(dim('  as found:'));
        out.line(indent(formatOutcome(failure.original)));
        out.line();
        out.line(dim('  shrunk:'));
      }
      out.line(indent(formatOutcome(failure.minimal)));
      out.line();
      out.line(
        `  ${dim('reproduce the unshrunk parent:')} ${cyan(`caseFromSeed(${failure.original.case.fuzzSeed}, generateOptionsFrom(config, ${tier === 'deep' ? 'DEEP_SPACE' : 'STANDARD_SPACE'}))`)}`,
      );
    }
  }

  /* ---- the verdict ------------------------------------------------------- */

  const violations = outcomes.reduce((total, outcome) => total + outcome.violations.length, 0);

  out.line();
  if (failures.length > 0) {
    out.line(
      bold(
        red(
          `  ██  VERDICT: ${count(violations)} PROPERTY VIOLATION(S) IN ${count(failures.length)} OF ${count(stats.cases)} CASES` +
            (thrown > 0 ? `, AND ${count(thrown)} CASE(S) THREW` : ''),
        ),
      ),
    );
    out.line(
      wrap(
        'Each counterexample above is printed whole and carries the seed that reproduces its ' +
          'unshrunk parent, because a finding nobody can replay is a rumour. Fix the simulator, or ' +
          'establish that the property is wrong — never move a bound to make the case pass. Both ' +
          'of Phase 8’s blocking violations were closed in core/, and neither by moving a bound.',
        Math.min(out.columns - 4, 92),
        '  ',
      ),
    );
  } else {
    out.line(
      green(
        bold(
          `  VERDICT: ALL ${String(FUZZ_PROPERTIES.length)} PROPERTIES HELD ON ${count(stats.evaluated)} EVALUATED CASE(S).`,
        ),
      ),
    );
    out.line(
      wrap(
        `${count(stats.generatedPassengers)} passengers over ${num(stats.simulatedSeconds / 3600, 2)} simulated hours. ` +
          'This is a statement about mechanics, not about statistics: one replication per case, so ' +
          'nothing here says a mean is right — only that nobody was lost, misdelivered, overloaded, ' +
          'deadlocked or starved in the runs that produced them.',
        Math.min(out.columns - 4, 92),
        '  ',
      ),
    );
  }

  return failures.length > 0 ? EXIT_INTERNAL : 0;
}

/* -------------------------------------------------------------------------- *
 * Pieces
 * -------------------------------------------------------------------------- */

/** Cases per chunk, targeting about eight progress lines and never fewer than one case. */
export function chunkSize(cases: number, targetLines = 8): number {
  return Math.max(1, Math.ceil(cases / Math.max(1, targetLines)));
}

/** Two chunks' accounting, added. Counters sum; the two histograms merge key by key. */
export function mergeStats(a: CampaignStats, b: CampaignStats): CampaignStats {
  const add = (
    left: Readonly<Record<string, number>>,
    right: Readonly<Record<string, number>>,
  ): Readonly<Record<string, number>> => {
    const merged: Record<string, number> = { ...left };
    for (const [key, value] of Object.entries(right)) merged[key] = (merged[key] ?? 0) + value;
    return Object.freeze(merged);
  };
  return Object.freeze({
    cases: a.cases + b.cases,
    evaluated: a.evaluated + b.evaluated,
    skipped: a.skipped + b.skipped,
    failures: a.failures + b.failures,
    generatedPassengers: a.generatedPassengers + b.generatedPassengers,
    simulatedSeconds: a.simulatedSeconds + b.simulatedSeconds,
    topologies: add(a.topologies, b.topologies),
    statuses: add(a.statuses, b.statuses),
  });
}

/**
 * Cases that violated each property, by property.
 *
 * Counted per **case**, not per violation: `fuzz-1001074` produced two starvation violations from
 * one building, and reporting "2 cases" for one counterexample would overstate the finding in the
 * one direction this project cannot afford to overstate anything.
 */
export function violationsByProperty(
  outcomes: readonly FuzzOutcome[],
): ReadonlyMap<FuzzProperty, number> {
  const counts = new Map<FuzzProperty, number>();
  for (const outcome of outcomes) {
    for (const property of new Set(outcome.violations.map((violation) => violation.property))) {
      counts.set(property, (counts.get(property) ?? 0) + 1);
    }
  }
  return counts;
}

function tierNote(tier: FuzzTier): string {
  return tier === 'deep'
    ? '— the opt-in space: 40 floors, 6 cars a bank, 30-minute horizons, demand past capacity'
    : '— the pinned always-on corpus, a regression suite rather than a search';
}

function seedNote(tier: FuzzTier, seeds: readonly number[], from: number): string {
  if (tier === 'deep') {
    return `seeds ${String(from)}…${String(from + seeds.length - 1)}`;
  }
  return seeds.length === STANDARD_CORPUS.length
    ? 'the whole pinned corpus'
    : `the first ${String(seeds.length)} of ${String(STANDARD_CORPUS.length)} pinned seeds`;
}

/** A multi-line block, indented so it reads as part of the report rather than as raw output. */
function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}
