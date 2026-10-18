/**
 * `elevator-sim fuzz --scenario <id>` — the adversarial persona: a campaign stage's building held
 * fixed, the player's verb log fuzzed over the seven intervention kinds.
 *
 * This file is the **named non-test caller** of `packages/experiments/src/fuzz/`'s persona family
 * (`verbs.ts`, `play.ts`, `playShrink.ts`, `playCampaign.ts`, `stageSession.ts`), the role
 * `fuzz.ts` plays for the building fuzz. It inherits every rule that file states:
 *
 * - **No bound moves.** `PROPERTY_BOUNDS` is printed and not settable, and there is no flag that
 *   could excuse a finding (no `--softlock-ok`, no looser horizon).
 * - **Every counterexample is shrunk**, printed whole with the play seed that reproduces its
 *   unshrunk parent, and the process **exits 2**.
 * - **Tiers are flags.** `standard` is a pinned corpus plus every pinned regression for the stage;
 *   `deep` is a contiguous seed range in a wider space. The building fuzz's `hybrid` tier is a
 *   building axis and is refused here by name.
 *
 * ## The header says what a clean run is worth
 *
 * No player can press any of these verbs on a Scenario stage: those stages are played as a judged
 * *move*, and the seven verbs live only on the live day screen. So the first thing printed is that
 * this is an **engine stress test on the stage's building and crowd**, in plain words, so a green
 * verdict is never read as *players cannot break this stage*.
 *
 * ## P-DESIGN-1 is printed and never exits non-zero
 *
 * The dominant-verb ranking is a report for the design director, not a property: a BETTER row is a
 * fact about the stage, and whether it is a depth defect is the owner's call.
 *
 * The decisions in this file bind nothing beyond the command and are recorded here (§ D405); the
 * family itself is § D1590.
 */

import {
  DEEP_PLAY_SPACE,
  FUZZ_PROPERTIES,
  PLAY_PROPERTIES,
  PROPERTY_BOUNDS,
  PlaySessions,
  PlayStageError,
  STANDARD_PLAY_CORPUS,
  STANDARD_PLAY_SPACE,
  deepCampaignSize,
  deepPlaySeeds,
  formatPlayOutcome,
  formatPlayStats,
  playCaseFromPinned,
  playContextFor,
  playRegressionsFor,
  playStageIdsOf,
  rankVerbs,
  runPlayCampaign,
  type PlayCampaignStats,
  type PlayContext,
  type PlayOutcome,
  type PlayShrinkResult,
  type PlaySpace,
  type VerbRankingRow,
} from '@elevator-sim/experiments';
import type { LoadedConfig } from '@elevator-sim/core';

import { booleanFlag, numberFlag, stringFlag, type ParsedArgs } from '../args.js';
import { EXIT_INTERNAL, UsageError, didYouMean } from '../errors.js';
import { count, num } from '../format.js';
import { BINARY, wrap } from '../help.js';
import { field, heading, padColumn, table, type Output } from '../output.js';

/** The two raw files a stage is read from. The command reads them; `experiments` never does. */
export interface PlayData {
  readonly campaign: unknown;
  readonly priceSchedule: unknown;
}

/** The tiers this family runs. `hybrid` is a building axis and has no meaning on a fixed stage. */
export type PlayTier = 'standard' | 'deep';

/** Replications behind each P-DESIGN-1 row: CLAUDE.md's floor on `standard`, its ceiling on `deep`. */
export function rankingReplicationsFor(tier: PlayTier): number {
  return tier === 'deep' ? 200 : 50;
}

/** The space a tier draws from. */
export function playSpaceOf(tier: PlayTier): PlaySpace {
  return tier === 'deep' ? DEEP_PLAY_SPACE : STANDARD_PLAY_SPACE;
}

/**
 * The play seeds a run uses: the pinned corpus (truncated, never extended) on `standard`, and a
 * contiguous range from `--from` on `deep`.
 *
 * @throws UsageError when `cases` exceeds the pinned corpus on `standard`.
 */
export function playSeedsFor(tier: PlayTier, cases: number | undefined, from: number): readonly number[] {
  if (tier === 'deep') return deepPlaySeeds(cases ?? deepCampaignSize(), from);
  if (cases === undefined) return STANDARD_PLAY_CORPUS;
  if (cases > STANDARD_PLAY_CORPUS.length) {
    throw new UsageError(
      `--cases ${String(cases)} is more than the standard tier has: its corpus is ${String(STANDARD_PLAY_CORPUS.length)} pinned play seeds.`,
      [
        'the standard corpus is pinned so that it is a regression suite; it is truncated by --cases, never extended',
        `for a larger campaign use --tier deep: ${BINARY} fuzz --scenario <id> --tier deep --cases ${String(cases)}`,
      ],
    );
  }
  return STANDARD_PLAY_CORPUS.slice(0, cases);
}

/** The stage context, with a missing or misspelled id turned into a usage error that names the ids. */
export function playContextOrUsage(config: LoadedConfig, data: PlayData, stageId: string): PlayContext {
  const known = playStageIdsOf(data.campaign);
  if (!known.includes(stageId)) {
    const suggestion = didYouMean(stageId, known);
    throw new UsageError(`no campaign stage with id "${stageId}" (--scenario).`, [
      `available: ${known.join(', ')}`,
      ...(suggestion === undefined ? [] : [`did you mean "${suggestion}"?`]),
    ]);
  }
  try {
    return playContextFor({ config, campaign: data.campaign, priceSchedule: data.priceSchedule, stageId });
  } catch (error) {
    if (error instanceof PlayStageError) throw new UsageError(error.message, ['data/campaign.json is the file it was read from']);
    throw error;
  }
}

/* -------------------------------------------------------------------------- *
 * The run
 * -------------------------------------------------------------------------- */

export function runPlayFuzz(out: Output, config: LoadedConfig, parsed: ParsedArgs, data: PlayData): number {
  const { dim, cyan, yellow, bold } = out.palette;
  const stageId = stringFlag(parsed, 'scenario') ?? '';
  const rawTier = stringFlag(parsed, 'tier') ?? 'standard';
  if (rawTier !== 'standard' && rawTier !== 'deep') {
    throw new UsageError(`--tier ${rawTier} has no meaning with --scenario.`, [
      'the hybrid tier draws per-landing hall fixtures, which is a building axis; --scenario holds the building fixed',
      'use --tier standard (the default) or --tier deep',
    ]);
  }
  const tier: PlayTier = rawTier;
  const from = numberFlag(parsed, 'from') ?? 1_000_001;
  const shrink = booleanFlag(parsed, 'shrink');
  const shrinkBudget = numberFlag(parsed, 'shrink-budget');
  const full = booleanFlag(parsed, 'full');
  const seeds = playSeedsFor(tier, numberFlag(parsed, 'cases'), from);
  const space = playSpaceOf(tier);

  const context = playContextOrUsage(config, data, stageId);
  const sessions = new PlaySessions(context);
  const { stage } = context;
  const regressions = tier === 'standard' ? playRegressionsFor(stage.id) : [];
  const width = Math.min(out.columns - 6, 92);

  /* ---- the plan, and what it is worth, before anything runs --------------- */

  heading(out, `Adversarial persona — ${stage.id}`);
  out.line(
    bold(
      yellow(
        wrap(
          'ENGINE STRESS TEST, NOT A PLAYTEST. No player can press any of these seven verbs on this ' +
            'stage: a Scenario stage is played as a judged move (a dispatcher and its dials), and the ' +
            'verbs live only on the live day screen. So a clean run here says the engine survives these ' +
            'verb logs on this building and its crowd. It does not say that players cannot break this ' +
            'stage, because on this stage players cannot press anything at all.',
          width,
          '  ',
        ),
      ),
    ),
  );
  out.line();
  field(out, 'stage', `${stage.id}  ${dim(`— ${stage.name}, on ${stage.buildingId}, opening on ${stage.startingProfileId}, ${String(stage.durationS)} s`)}`);
  field(
    out,
    'tier',
    `${tier}  ${dim(
      tier === 'deep'
        ? `— a contiguous range of play seeds, ≤ ${String(space.maxEntries)} entries a log`
        : `— the pinned ${String(STANDARD_PLAY_CORPUS.length)}-seed corpus, plus ${String(regressions.length)} pinned regression(s) for this stage`,
    )}`,
  );
  field(
    out,
    'cases',
    `${count(seeds.length + regressions.length)}  ${dim(
      tier === 'deep'
        ? `play seeds ${String(from)}…${String(from + seeds.length - 1)}`
        : `${seeds.length === STANDARD_PLAY_CORPUS.length ? 'the whole pinned corpus' : `the first ${String(seeds.length)} pinned seeds`}, and ${String(regressions.length)} pinned regression(s)`,
    )}`,
  );
  field(out, 'space', `≤ ${String(space.maxEntries)} entries, ≤ ${String(space.maxEffects)} service events an entry, ≤ ${String(space.maxChurn)} handovers in a churn`);
  field(
    out,
    'payloads',
    `switch to ${String(context.switchTargets.length)} and adopt ${String(context.adoptTargets.length)} shipped profiles core schedules here; ` +
      `${String(context.purchases.filter((row) => row.kind === 'equipment-change').length)} equipment and ` +
      `${String(context.purchases.filter((row) => row.kind === 'building-change').length)} building rows; rungs ${stage.budgetRungs.join(', ')} u`,
  );
  field(
    out,
    'bounds',
    `deadlock ${String(PROPERTY_BOUNDS.deadlockIdleBoundS)} s idle, starvation ${String(PROPERTY_BOUNDS.starvationBoundS)} s  ${dim('— stated, and not settable from here')}`,
  );
  field(
    out,
    'shrink',
    shrink ? `on${shrinkBudget === undefined ? '' : `, budget ${count(shrinkBudget)}`}` : `${yellow('off')}  ${dim('— counterexamples print at the size they were found')}`,
  );
  field(out, 'properties', `${count(PLAY_PROPERTIES.length + FUZZ_PROPERTIES.length)}  ${dim([...PLAY_PROPERTIES, ...FUZZ_PROPERTIES].join(', '))}`);
  field(out, 'goals', goalScopeOf(stage.goalKinds));
  out.line();

  /* ---- the campaign ------------------------------------------------------ */

  const campaign = runPlayCampaign({
    sessions,
    seeds,
    pinned: regressions.map((pinned) => playCaseFromPinned(pinned, context)),
    space,
    shrink,
    ...(shrinkBudget === undefined ? {} : { shrinkBudget }),
  });

  /* ---- P-DESIGN-1 -------------------------------------------------------- */

  const replications = rankingReplicationsFor(tier);
  const ranking = rankVerbs(sessions, replications);

  const code = reportPlayCampaign(out, {
    context,
    tier,
    stats: campaign.stats,
    outcomes: campaign.outcomes,
    failures: campaign.failures,
    ranking,
    full,
  });

  out.line();
  out.line(
    `  ${dim('reproduce:')} ${cyan(
      [
        `${BINARY} fuzz --scenario ${stage.id}`,
        `--tier ${tier}`,
        `--cases ${String(seeds.length)}`,
        ...(tier === 'deep' ? [`--from ${String(from)}`] : []),
        ...(shrink ? [] : ['--no-shrink']),
        ...(shrinkBudget === undefined ? [] : [`--shrink-budget ${String(shrinkBudget)}`]),
        ...(stringFlag(parsed, 'data') === undefined ? [] : [`--data ${stringFlag(parsed, 'data') ?? ''}`]),
      ].join(' '),
    )}`,
  );
  out.line();
  return code;
}

/** What P-PLAY-3 checks of each goal the stage carries, and what it leaves to the viewer's readers. */
export function goalScopeOf(goalKinds: readonly string[]): string {
  const checked = goalKinds.filter((kind) => kind === 'beat-the-baseline');
  const left = goalKinds.filter((kind) => kind !== 'beat-the-baseline');
  return [
    ...(checked.length === 0 ? [] : ['beat-the-baseline: pairing checked (same crowd, every compared figure a number)']),
    ...(left.length === 0 ? [] : [`${left.join(', ')}: not checked here — the viewer's goal readers judge them (named gap)`]),
  ].join('; ');
}

/* -------------------------------------------------------------------------- *
 * The report
 * -------------------------------------------------------------------------- */

export interface PlayReportInput {
  readonly context: PlayContext;
  readonly tier: PlayTier;
  readonly stats: PlayCampaignStats;
  readonly outcomes: readonly PlayOutcome[];
  readonly failures: readonly PlayShrinkResult[];
  readonly ranking: readonly VerbRankingRow[];
  readonly full?: boolean | undefined;
}

/**
 * What the persona found, and the exit code with it. Taken as data so the red branch can be driven
 * from a real faulted session in `fuzz.test.ts`, as `reportCampaign`'s is.
 */
export function reportPlayCampaign(out: Output, input: PlayReportInput): number {
  const { bold, dim, cyan, green, red } = out.palette;
  const { context, tier, stats, outcomes, failures, ranking, full = false } = input;
  const width = Math.min(out.columns - 4, 92);

  heading(out, 'What ran');
  for (const row of formatPlayStats(stats).split('\n')) out.line(`  ${dim(row.slice(0, 17))}${row.slice(17)}`);

  heading(out, 'Properties');
  const counts = new Map<string, number>();
  for (const outcome of outcomes) {
    for (const property of new Set(outcome.violations.map((violation) => violation.property))) {
      counts.set(property, (counts.get(property) ?? 0) + 1);
    }
  }
  const names = [...PLAY_PROPERTIES, ...FUZZ_PROPERTIES];
  const nameWidth = Math.max(...names.map((name) => name.length));
  for (const property of names) {
    const failing = counts.get(property) ?? 0;
    out.line(
      `  ${padColumn(property, nameWidth)}  ` +
        (failing === 0
          ? `${green('held')}  ${dim(`in ${count(outcomes.length)} of ${count(outcomes.length)} sessions`)}`
          : bold(red(`VIOLATED in ${count(failing)} session(s)`))),
    );
  }

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
        out.line(indent(formatPlayOutcome(failure.original, context)));
        out.line();
        out.line(dim('  shrunk:'));
      }
      out.line(indent(formatPlayOutcome(failure.minimal, context)));
      out.line();
      out.line(
        `  ${dim('reproduce the unshrunk parent:')} ${cyan(`playCaseFromSeed(${failure.original.case.playSeed}, playContextFor({ …, stageId: '${context.stage.id}' }), ${tier === 'deep' ? 'DEEP_PLAY_SPACE' : 'STANDARD_PLAY_SPACE'})`)}`,
      );
    }
  }

  heading(out, 'P-DESIGN-1 — dominant-verb ranking (a report, never a verdict)');
  out.line(
    wrap(
      `ΔTTD is the verb's arm minus the empty log, in seconds of mean time to destination, paired on ` +
        `replication i of the stage's tuning seeds (${String(ranking[0]?.replications ?? 0)} replications a row, the same crowd checked on every pair` +
        `${(ranking[0]?.emptyCrowds ?? 0) > 0 ? `; ${String(ranking[0]?.emptyCrowds ?? 0)} of them drew nobody at all and are left out of every row, so each interval is over ${String(ranking[0]?.pairs ?? 0)} pairs` : ''}). ` +
        'Negative is faster. BETTER and WORSE mean the paired 95 % interval excludes zero; a row is suppressed when either arm refuses its mean on any pair. ' +
        'Whether a verb that wins here is dominant is the design director’s call across scenarios; this ranks one stage and exits 0 on it.',
      width,
      '  ',
    ),
  );
  out.line();
  table(
    out,
    [
      { header: 'verb', align: 'left' },
      { header: 'canonical instance', align: 'left' },
      { header: 'n', align: 'right' },
      { header: 'ΔTTD s', align: 'right' },
      { header: '95 % interval', align: 'right' },
      { header: 'verdict', align: 'left' },
    ],
    ranking.map((row) => [
      row.kind,
      row.instance,
      String(row.pairs),
      row.verdict === 'SUPPRESSED' ? '—' : num(row.meanS, 3),
      row.verdict === 'SUPPRESSED' ? '—' : `[${num(row.lowerS, 3)}, ${num(row.upperS, 3)}]`,
      row.verdict === 'SUPPRESSED' ? `suppressed (${row.suppressedBecause ?? 'refused'})` : row.verdict,
    ]),
  );

  heading(out, 'Named gaps');
  for (const gap of PLAY_GAPS) out.line(wrap(`- ${gap}`, width, '  '));

  out.line();
  const violations = outcomes.reduce((total, outcome) => total + outcome.violations.length, 0);
  if (failures.length > 0) {
    out.line(
      bold(red(`  ██  VERDICT: ${count(violations)} PROPERTY VIOLATION(S) IN ${count(failures.length)} OF ${count(outcomes.length)} SESSIONS`)),
    );
    out.line(
      wrap(
        'Each counterexample above is printed whole and carries the play seed that reproduces its unshrunk ' +
          'parent. Fix the engine or the game at the root, or establish that the property is wrong — never ' +
          'move a bound to make the case pass — and pin the shrunk case as a regression.',
        width,
        '  ',
      ),
    );
  } else {
    out.line(
      green(bold(`  VERDICT: ALL ${String(names.length)} PROPERTIES HELD ON ${count(outcomes.length)} SESSION(S) OF ${context.stage.id}.`)),
    );
    out.line(
      wrap(
        `${count(stats.entries)} verb presses over ${num(stats.simulatedSeconds / 3600, 2)} simulated hours. ` +
          'An engine stress test on this stage’s building and crowd, one replication a session: it says no ' +
          'verb log here crashed, stalled, published an unreadable verdict or broke the pairing its goal ' +
          'is judged on. It says nothing about what a player can press, and nothing about a mean.',
        width,
        '  ',
      ),
    );
  }
  return failures.length > 0 ? EXIT_INTERNAL : 0;
}

/** The gaps the family names rather than closes, printed on every run. */
export const PLAY_GAPS: readonly string[] = Object.freeze([
  'P-PLAY-1’s screen half — no available next verb — is decided by the viewer’s stageInterventionsOf, which this package cannot call; it is not rebuilt here.',
  'P-PLAY-3 checks the pairing beat-the-baseline needs; the count goals are judged by the viewer’s measureGoalRate and batch report, which are not reimplemented.',
  'Handover targets carry no rule rows: a shipped profile verbatim is what a submission rebuilds from an id with no rows.',
  'equipment-change, building-change and answer-incident carry service events no shipped Scenario screen authors; their payloads are legal on the building, not offers a player is shown.',
  'A derate below what the heaviest rider needs, and a mode schedule that leaves a bank with no serving car, are not generated: P5 knows the shafts, not the modes or the rated loads.',
]);

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}
