/**
 * `elevator-sim fuzz --scenario <id> --engagement` — the three fun proxies on one campaign stage.
 *
 * This file is the **named non-test caller** of `packages/experiments/src/engagement/` (§ D1595): it
 * reads `data/engagement-bands.json`, `data/campaign.json` and `data/price-schedule.json` itself, hands
 * them in, and prints what the proxies say. `experiments` stays a function of its arguments.
 *
 * ## Why a flag on `fuzz` and not a seventh command
 *
 * `fuzz --scenario` is the one command that already reads a campaign stage, builds its sessions and
 * ranks its verbs (P-DESIGN-1, whose canonical presses the meaningful-choice baseline reuses). The
 * proxies need exactly that context and nothing else, so a flag is the smallest surface that can
 * carry them. With the flag the property campaign does not run: the flags that shape it (`--tier`,
 * `--cases`, `--from`, `--shrink`, `--shrink-budget`, `--full`) are refused by name rather than
 * silently ignored.
 *
 * ## What the first line says
 *
 * That every figure is an unmeasured premise about people, and that on a Scenario stage no player
 * presses a verb. Both are true of every run of this command, so both are printed before anything
 * else, in plain words.
 *
 * ## What it prints, and what it never prints
 *
 * Every rate as `k of n` with its Wilson interval and its suppressed buckets beside it; every
 * comparison as a paired-t interval on the same replication seeds; AWT and WT95 beside each arm; the
 * exact command that reproduces the page. Never a combined score, a weight, a grade, or a comparison
 * of two separate intervals: the tuning and holdout arms are disjoint samples and are printed one after
 * the other with no verdict between them. It always exits 0, because a proxy is a report and not a
 * property.
 *
 * The decisions in this file bind nothing beyond the command and are recorded here (§ D405).
 */

import {
  EngagementBandsError,
  TENSION_CLASSES,
  beliefDisagreements,
  describePlayEntry,
  engineBaselineChoices,
  formatKOfN,
  masterySlopeOf,
  meaningfulChoiceRate,
  measureChoices,
  pairedMasterySlope,
  parseEngagementBands,
  playSeedSetOf,
  playStageIdsOf,
  stageBaselineRuns,
  tallyTension,
  tensionBandFor,
  tensionMismatches,
  tensionOf,
  waitFiguresOf,
  PlaySessions,
  type ChoiceVerdict,
  type EngagementBands,
  type PairedComparison,
  type PlaySeedSet,
  type ResolvedTensionBand,
  type TensionReading,
  type WaitFigures,
} from '@elevator-sim/experiments';
import type { LoadedConfig } from '@elevator-sim/core';

import { stringFlag, type ParsedArgs } from '../args.js';
import { UsageError } from '../errors.js';
import { num, signed } from '../format.js';
import { BINARY, wrap } from '../help.js';
import { field, heading, table, type Output } from '../output.js';

import { playContextOrUsage, type PlayData } from './fuzzPlay.js';

/** The three raw files the proxies read. The command reads them; `experiments` never does. */
export interface EngagementData extends PlayData {
  readonly engagementBands: unknown;
}

/** The campaign flags `--engagement` refuses, because the property campaign does not run with it. */
export const CAMPAIGN_ONLY_FLAGS: readonly string[] = Object.freeze([
  'tier',
  'cases',
  'from',
  'shrink',
  'no-shrink',
  'shrink-budget',
  'full',
]);

/** The first line, verbatim. A test holds it, so it cannot drift into something softer. */
export const ENGAGEMENT_HEADER =
  'UNMEASURED PREMISES ABOUT PEOPLE. Every figure below is a fun proxy that no human ground-truth set ' +
  'has calibrated yet, so none is marked Measured. On a Scenario stage no player presses a verb: the ' +
  'stage is played as a judged move, a dispatcher and its dials, and the verbs live only on the live ' +
  'day screen.';

/** The gaps every run names, because none of them is closed by this command. */
export const ENGAGEMENT_GAPS: readonly string[] = Object.freeze([
  'Every proxy and threshold is an unmeasured premise about people: none predicts anything a human was seen to do until the spec’s calibration step marks it Measured with the path:line of its test.',
  'On a Scenario stage no player presses a verb, so a player session there has no choice to judge; the meaningful-choice figure that is not 0 of 0 is the engine-level baseline of canonical presses, which no player made.',
  'answer-incident, equipment-change and building-change are not yet replayable from a session’s verbs and seed (core’s interventionKindRefusal), so their entries are counted apart and never enter the meaningful-choice rate.',
  'The persona’s beliefs about its choices and its narration of felt tension do not exist until the playtest phase, so both disagreement lists are empty by construction rather than by measurement.',
  'The mastery slope reads the game’s own stage verdicts, which experiments may not compute (viz owns every judge); no persona attempts exist yet, so it reports no attempts.',
  'The spec asks for mastery over N fresh, disjoint holdout seeds; the game judges every attempt of a stage on the same fixed holdout batch, so a slope over real attempts would be over one repeated seed set. No seed scheme is invented here to close that.',
]);

/** Refuse the campaign's own flags by name: they would shape a run that does not happen. */
export function refuseCampaignFlags(argv: readonly string[]): void {
  const given = CAMPAIGN_ONLY_FLAGS.filter((name) =>
    argv.some((token) => token === `--${name}` || token.startsWith(`--${name}=`)),
  );
  if (given.length === 0) return;
  throw new UsageError(`${given.map((name) => `--${name}`).join(', ')} shape the property campaign, which --engagement does not run.`, [
    'the proxies read their replication and attempt counts from data/engagement-bands.json and the stage’s own seed sets',
    `drop ${given.length === 1 ? 'it' : 'them'}: ${BINARY} fuzz --scenario <id> --engagement`,
  ]);
}

/** The bands file, parsed against the campaign's stage ids, with a refusal turned into a usage error. */
export function engagementBandsOrUsage(raw: unknown, stageIds: readonly string[]): EngagementBands {
  try {
    return parseEngagementBands(raw, stageIds);
  } catch (error) {
    if (error instanceof EngagementBandsError) {
      throw new UsageError(`data/engagement-bands.json cannot be read: ${error.message}`, [
        'every threshold the proxies apply is read from that file, and an unknown key or metric is refused rather than ignored',
      ]);
    }
    throw error;
  }
}

/* -------------------------------------------------------------------------- *
 * The run
 * -------------------------------------------------------------------------- */

export function runEngagement(
  out: Output,
  config: LoadedConfig,
  parsed: ParsedArgs,
  argv: readonly string[],
  data: EngagementData,
): number {
  refuseCampaignFlags(argv);
  const { bold, yellow, dim, cyan } = out.palette;
  const stageId = stringFlag(parsed, 'scenario') ?? '';
  const context = playContextOrUsage(config, data, stageId);
  const { stage } = context;
  const bands = engagementBandsOrUsage(data.engagementBands, playStageIdsOf(data.campaign));
  const band = tensionBandFor(bands, stage.id);
  const sessions = new PlaySessions(context);
  const width = Math.min(out.columns - 4, 96);
  const dataFlag = stringFlag(parsed, 'data');
  const reproduce = [`${BINARY} fuzz --scenario ${stage.id} --engagement`, ...(dataFlag === undefined ? [] : [`--data ${dataFlag}`])].join(' ');

  heading(out, `Fun proxies — ${stage.id}`);
  out.line(bold(yellow(wrap(ENGAGEMENT_HEADER, width, '  '))));
  out.line();
  field(out, 'stage', `${stage.id}  ${dim(`— ${stage.name}, on ${stage.buildingId}, opening on ${stage.startingProfileId}, ${String(stage.durationS)} s`)}`);
  field(out, 'tension band', describeBand(band));
  for (const which of ['tuning', 'holdout'] as const) {
    const set = playSeedSetOf(stage, which);
    field(out, `${which} seeds`, `${set.name}  ${dim(`(master seed ${set.seed}, replications 0…${String(set.replications - 1)})`)}`);
  }
  field(out, 'choices', `${String(bands.meaningfulChoice.replications)} replications of the tuning seeds  ${dim(`(meaningfulChoice.replications; ${bands.meaningfulChoice.verdict})`)}`);
  field(out, 'mastery', `${String(bands.masterySlope.attempts)} attempts on the ${bands.masterySlope.seedSet} seeds  ${dim('(masterySlope.attempts and .seedSet)')}`);
  field(out, 'axes', 'each proxy is printed beside AWT and WT95; none is weighted, summed into a score, or graded');

  /* ---- proxy 2: the tension band, on the stage's own setting ------------- */

  heading(out, 'Proxy 2 — tension band, on the stage’s own setting');
  out.line(
    wrap(
      'Swing is the interquartile range of the queue samples the summary’s own saturation test was fitted on, over the summary’s report window; ' +
        'direction is linearTrend’s slope over the same samples, converted from persons per second to persons per minute (× 60) to meet runawaySlopePerMin. ' +
        'Runaway needs that slope above the limit and awtIsValid false; any other flagged run is suppressed. A flagged run is never in band and never leaves the denominator. ' +
        'The two seed sets are disjoint samples, so they are printed one after the other and never compared with each other.',
      width,
      '  ',
    ),
  );
  let tuningReadings: readonly TensionReading[] = [];
  for (const which of ['tuning', 'holdout'] as const) {
    const runs = stageBaselineRuns(sessions, which);
    const readings = runs.map((run) => tensionOf(run.record, run.summary, band));
    if (which === 'tuning') tuningReadings = readings;
    printTensionArm(out, which, playSeedSetOf(stage, which).name, stage.startingProfileId, readings, waitFiguresOf(runs));
  }
  const mismatches = tensionMismatches(tuningReadings, []);
  out.line();
  field(
    out,
    'felt tension',
    `${String(mismatches.inBandButNotFelt.length)} in band but felt otherwise, ${String(mismatches.feltButNotInBand.length)} felt in band but measured otherwise  ${dim('(no persona narration until the playtest phase)')}`,
  );
  out.line(`  ${dim('reproduce:')} ${cyan(reproduce)}`);

  /* ---- proxy 1: the meaningful-choice rate ------------------------------- */

  heading(out, 'Proxy 1 — meaningful-choice rate');
  const playerSession = measureChoices(sessions, [], bands.meaningfulChoice, (entry) => describePlayEntry(entry, context));
  const playerRate = meaningfulChoiceRate(playerSession);
  field(
    out,
    'player session',
    `${formatKOfN(playerRate.meaningful)}  ${dim(`— ${String(playerRate.entries)} entries in the log: on this Scenario stage no player presses a verb`)}`,
  );
  const beliefs = beliefDisagreements(playerSession, []);
  field(
    out,
    'beliefs',
    `${String(beliefs.feltButNull.length)} felt but null, ${String(beliefs.unperceived.length)} unperceived, ${String(beliefs.unjudged.length)} unjudged  ${dim('(no persona beliefs until the playtest phase)')}`,
  );
  out.line();
  out.line(
    bold(
      wrap(
        `ENGINE-LEVEL BASELINE, NOT A PLAYER SESSION: the canonical presses P-DESIGN-1 ranks (one per verb, and one per shipped target core schedules here for the two handovers), each a one-entry log judged against the empty log on replications 0…${String(bands.meaningfulChoice.replications - 1)} of ${stage.tuningSeeds.name}. No player made these choices.`,
        width,
        '  ',
      ),
    ),
  );
  out.line(
    wrap(
      'ΔTTD and ΔAWT are with the press minus without it, seconds, paired on each replication with the crowd checked equal. A press is meaningful when the 95 % interval on ΔTTD excludes zero, in either direction; ΔAWT is beside it, never instead. ' +
        'Δ in band is the press’s tension arm minus the empty log’s, as 0/1 in-band indicators paired on the same seeds.',
      width,
      '  ',
    ),
  );
  out.line();
  const baseline = engineBaselineChoices(sessions, bands.meaningfulChoice, band);
  const judged = baseline.filter((verdict) => verdict.status !== 'not-yet-replayable');
  table(
    out,
    [
      { header: 'verb', align: 'left' },
      { header: 'canonical instance', align: 'left' },
      { header: 'pairs', align: 'right' },
      { header: 'ΔTTD s  [95 %]', align: 'right' },
      { header: 'ΔAWT s  [95 %]', align: 'right' },
      { header: 'status', align: 'left' },
      { header: 'Δ in band', align: 'left' },
    ],
    judged.map((verdict) => [
      verdict.kind,
      verdict.instance,
      String(verdict.replications - verdict.emptyCrowds),
      intervalText(verdict.ttd),
      intervalText(verdict.awt),
      statusText(verdict),
      deltaText(verdict.tension),
    ]),
  );
  out.line();
  const rate = meaningfulChoiceRate(baseline);
  field(out, 'meaningful', `${formatKOfN(rate.meaningful)}  ${dim(`(null ${String(rate.null)}, suppressed ${String(rate.suppressed)}, not yet replayable ${String(rate.notYetReplayable)} and outside both sides)`)}`);
  table(
    out,
    [
      { header: 'by verb', align: 'left' },
      { header: 'meaningful, k of n [95 % Wilson]', align: 'left' },
    ],
    [...new Set(judged.map((verdict) => verdict.kind))].map((kind) => [
      kind,
      formatKOfN(meaningfulChoiceRate(judged.filter((verdict) => verdict.kind === kind)).meaningful),
    ]),
    '    ',
  );
  for (const stub of rate.stubbedKinds) {
    out.line(wrap(`not yet replayable — ${stub.kind} (${String(stub.entries)} canonical press): ${stub.refusal}`, width, '  '));
  }
  const figures = waitFiguresOf(
    Array.from({ length: bands.meaningfulChoice.replications }, (_, replication) => sessions.baseline(replication)),
  );
  field(out, 'beside', `the empty log on these seeds: ${waitText(figures)}`);
  out.line(`  ${dim('reproduce:')} ${cyan(reproduce)}`);

  /* ---- proxy 3: the mastery slope ----------------------------------------- */

  heading(out, 'Proxy 3 — mastery slope');
  const mastery = masterySlopeOf([], bands.masterySlope);
  const paired = pairedMasterySlope([], [], bands.masterySlope);
  field(
    out,
    'slope',
    `${mastery.verdict}  ${dim(`— ${String(mastery.attempts)} of the ${String(mastery.required)} attempts a slope needs; the game’s own verdicts are the input and no persona has made an attempt`)}`,
  );
  field(out, 'paired', `${paired.verdict}  ${dim('— no second series of attempts to pair against')}`);
  out.line(
    wrap(
      `Named gap: the game judges every attempt at ${stage.id} on one fixed holdout batch, ${stage.holdoutSeeds.name} (master seed ${stage.holdoutSeeds.seed}, ${String(stage.holdoutSeeds.replications)} replications), so a series of real attempts carries that one seed set repeated, where the spec asks for ${String(bands.masterySlope.attempts)} fresh, disjoint holdout seed sets in order. A slope over the game's attempts could be memorisation of that batch. No seed scheme is invented here to close it.`,
      width,
      '  ',
    ),
  );
  out.line(`  ${dim('reproduce:')} ${cyan(reproduce)}`);

  heading(out, 'Named gaps');
  for (const gap of ENGAGEMENT_GAPS) out.line(wrap(`- ${gap}`, width, '  '));
  out.line();
  out.line(`  ${dim('reproduce every figure on this page:')} ${cyan(reproduce)}`);
  out.line();
  return 0;
}

/* -------------------------------------------------------------------------- *
 * Rendering
 * -------------------------------------------------------------------------- */

function describeBand(band: ResolvedTensionBand): string {
  const moved = band.overridden.length === 0 ? 'the top-level band' : `the stage's own override moved ${band.overridden.join(', ')}`;
  return (
    `flat below ${num(band.flatBelow, 1)}, in band [${num(band.inBandLow, 1)}, ${num(band.inBandHigh, 1)}] persons of swing, ` +
    `runaway above ${num(band.runawaySlopePerMin, 2)} persons/min  (${moved})`
  );
}

function printTensionArm(
  out: Output,
  which: PlaySeedSet,
  setName: string,
  profileId: string,
  readings: readonly TensionReading[],
  figures: WaitFigures,
): void {
  const { dim, bold } = out.palette;
  const tally = tallyTension(readings);
  const flagged = tally.counts.runaway + tally.counts.suppressed;
  const swings = readings.map((reading) => reading.swingPersons).filter(Number.isFinite);
  const sources = [...new Set(readings.map((reading) => `${reading.source}, ${String(reading.sampleCount)} samples`))];
  out.line();
  out.line(`  ${bold(`${which}: ${setName}`)}  ${dim(`— the stage's own setting (${profileId}, no verb pressed)`)}`);
  field(out, '  in band', formatKOfN(tally.inBand));
  field(out, '  classes', TENSION_CLASSES.map((tensionClass) => `${tensionClass} ${String(tally.counts[tensionClass])}`).join(' · '));
  field(
    out,
    '  flagged',
    `${String(flagged)} of ${String(tally.n)} by awtIsValid (runaway ${String(tally.counts.runaway)}, suppressed ${String(tally.counts.suppressed)})`,
  );
  field(
    out,
    '  swing',
    swings.length === 0
      ? 'none published'
      : `${String(swings.filter((swing) => swing > 0).length)} of ${String(swings.length)} published swings above 0; largest ${num(Math.max(...swings), 1)} persons`,
  );
  field(out, '  series', sources.length > 3 ? `${String(sources.length)} shapes` : sources.join('; '));
  field(out, '  beside', waitText(figures));
}

function waitText(figures: WaitFigures): string {
  if (figures.awt === undefined || figures.wt95 === undefined) {
    return `AWT and WT95 suppressed: ${String(figures.refused)} of ${String(figures.replications)} replications refused their mean (${figures.refusedGrounds.join(', ') || 'none'})`;
  }
  return (
    `AWT ${num(figures.awt.mean, 2)} s [${num(figures.awt.lower, 2)}, ${num(figures.awt.upper, 2)}], ` +
    `WT95 ${num(figures.wt95.mean, 2)} s [${num(figures.wt95.lower, 2)}, ${num(figures.wt95.upper, 2)}], ` +
    `over ${String(figures.replications)} replications`
  );
}

function statusText(verdict: ChoiceVerdict): string {
  if (verdict.status === 'suppressed') return `suppressed (${verdict.suppressedBecause ?? 'refused'})`;
  // An exact tie on every pair is a verb that did nothing on these seeds, at any budget.
  return verdict.ttd?.identical === true ? `${verdict.status}, identical` : verdict.status;
}

function intervalText(comparison: PairedComparison | undefined): string {
  const estimate = comparison?.estimate;
  if (estimate === undefined) return '—';
  return `${signed(estimate.mean, 3)}  [${signed(estimate.lower, 3)}, ${signed(estimate.upper, 3)}]`;
}

function deltaText(comparison: PairedComparison | undefined): string {
  if (comparison === undefined) return '—';
  if (comparison.estimate === undefined) return `suppressed (${comparison.suppressedBecause ?? 'refused'})`;
  if (comparison.identical) return 'identical';
  return `${signed(comparison.estimate.mean, 3)} [${signed(comparison.estimate.lower, 3)}, ${signed(comparison.estimate.upper, 3)}] ${comparison.verdict}`;
}
