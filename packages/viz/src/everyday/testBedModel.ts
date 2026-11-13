/**
 * **The workshop's test bed** — the pure half. `everyday/workshopScreen.ts` is the non-test caller
 * of every export: it draws the dock beside the editor from {@link TEST_BED_COPY}, builds the run
 * with {@link testBedRequestOf} and {@link testBedProfilesOf}, and draws {@link testBedViewOf}.
 *
 * ## What it is for
 *
 * The bench (`everyday/benchScreen.ts`) answers *which of these saved dispatchers is better across
 * the proof cases*, and it resolves its field by id — so the thing a player is in the middle of
 * building could not be put on it without saving first. The test bed answers the question a player
 * has while editing: **did that change help, here?** It runs the working copy, saved or not,
 * against one rival on one building.
 *
 * ## How the working copy gets there without being saved
 *
 * `dev/batchWorker.ts` already takes a list of extra profiles beside the shipped library — the
 * seam GitHub issues #167 and #228 opened for saved dispatchers. {@link testBedProfilesOf} puts
 * the working copy on that list under {@link TEST_BED_WORKING_ID}, built by the same
 * `authoring/dispatcherShelf.ts#builtProfileOf` a save uses, so what is tested is what a save
 * would write.
 *
 * ## What it reports, and what it does not author
 *
 * The comparison is `batch/report.ts#batchReport`, whole: matched crowds for both arms, a paired-t
 * interval per measure, a mean suppressed where a queue never cleared, energy per ride and the
 * unserved share drawn beside the waits and never folded into them. Every sentence about a result
 * is that module's. This one adds a single word per row ({@link TEST_BED_VERDICT_WORDS}) so a
 * column of them can be read at a glance, and the word never says more than the verdict it names.
 */

import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { builtProfileOf, type BuiltDispatcher } from '../authoring/dispatcherShelf.js';
import type { SelectorContext } from '../authoring/selectorSpec.js';
import type { BatchReport, BatchVerdict } from '../batch/report.js';
import type { BatchMetric, BatchRequest } from '../batch/types.js';

/** The id the working copy rides under. Never drawn, and never a saved dispatcher's id (`yours-N`). */
export const TEST_BED_WORKING_ID = 'workshop-working-copy';

/** Simulated seconds per run: half an hour, inside the 900 to 3600 s the shipped operating points use. */
export const TEST_BED_RUN_S = 1800;

/** Every sentence the test bed authors about itself. */
export const TEST_BED_COPY = Object.freeze({
  heading: 'TEST BED',
  hint:
    'Run this dispatcher, saved or not, against another on the same riders.',
  buildingLabel: 'Building',
  crowdLabel: 'How busy',
  rivalLabel: 'Against',
  runsLabel: 'Matched runs',
  run: 'Prove it',
  stop: 'Stop',
  /** What a run is, said beside the count so *50* is 50 of something. */
  runLine: 'Each run is half an hour of the building.',
  running: 'Running',
  /** Drawn over a result once the dispatcher it was about has been changed. */
  stale: 'This result is for an earlier version of the dispatcher. Run it again to test what you have now.',
  /** Drawn under a result in which a wait has no figure, so the next move is on the page. */
  noFigure:
    'A line with no figure means the runs did not settle at this flow: too few riders to measure, ' +
    'or more than the building can clear. Try a lighter or heavier flow, or another building.',
  detailSummary: 'What each line means',
  watchNote: 'To watch it work for a day, use “Test simulation” below. One day is a look, not proof.',
  benchNote:
    'This tests one building at one flow. The Test bench runs up to four saved dispatchers over ' +
    'every building and every kind of crowd.',
  benchLink: 'Open the Test bench',
  failed: 'The test bed could not run this:',
} as const);

/**
 * How busy the building is: the share of its population arriving every five minutes.
 *
 * Explicit rates, and not the three points of the building's own demand band, which is what this
 * offered first. A band's *typical* point is the design peak of the building's traffic profile —
 * at `midtown-office` it saturated ten runs of ten, and the report correctly refused to quote a
 * wait for any of them, which is an honest answer to a question nobody meant to ask. One, two and
 * four per cent are the operating points this project's own studies run that building at
 * (`CLAUDE.md` § Phase 6), and ten is the one `garden-apartments` is studied at — a small
 * residential block has too few riders to measure at two. No single rate suits every building, so
 * a flow a building cannot settle at is said so in the report's words, with
 * {@link TEST_BED_COPY.noFigure} under it, rather than printed as a mean.
 */
export const TEST_BED_CROWDS: readonly {
  readonly id: string;
  readonly label: string;
  readonly ratePctPop5min: number;
}[] = Object.freeze([
  Object.freeze({ id: 'light', label: 'A light flow', ratePctPop5min: 1 }),
  Object.freeze({ id: 'steady', label: 'A steady flow', ratePctPop5min: 2 }),
  Object.freeze({ id: 'heavy', label: 'A heavy flow', ratePctPop5min: 4 }),
  Object.freeze({ id: 'rush', label: 'A rush', ratePctPop5min: 10 }),
]);

/** The crowd the dock opens on. */
export const TEST_BED_DEFAULT_CROWD = 'steady';

/**
 * One word for each verdict `batch/report.ts` can reach, for the pill beside a row.
 *
 * `resolved` is the only verdict with a direction, so it is the only one with two words. None of
 * them is a claim the row's own sentence does not make: `under-budget` is not *better*, and
 * `shown` — energy, which this project draws and refuses to rank (§ D106) — says exactly that.
 */
export const TEST_BED_VERDICT_WORDS = Object.freeze({
  better: 'YOURS IS BETTER',
  worse: 'YOURS IS WORSE',
  'under-budget': 'NEEDS MORE RUNS',
  unresolved: 'TOO CLOSE TO CALL',
  shown: 'SHOWN, NOT RANKED',
  suppressed: 'NO FIGURE',
  unmeasured: 'NOT MEASURED',
} as const);

/** The word for one row. */
export function testBedVerdictWordOf(
  verdict: BatchVerdict,
  favours: 'candidate' | 'baseline' | null,
): string {
  if (verdict !== 'resolved') return TEST_BED_VERDICT_WORDS[verdict];
  return favours === 'baseline' ? TEST_BED_VERDICT_WORDS.worse : TEST_BED_VERDICT_WORDS.better;
}

/** The rows the dock leads with; every other measure is under the disclosure. */
export const TEST_BED_HEADLINE: readonly BatchMetric[] = Object.freeze([
  'awtS',
  'wt95S',
  'ttdMeanS',
  'energyPerServedLegKJ',
  'unservedFraction',
]);

/** What the player chose on the dock. */
export interface TestBedChoice {
  readonly buildingId: string;
  /** A {@link TEST_BED_CROWDS} id. */
  readonly crowdId: string;
  readonly rivalId: string;
  readonly replications: number;
}

/**
 * The batch a press runs: the rival as the baseline arm, the working copy as the candidate.
 *
 * The order is the claim. `batchReport` writes each interval as *candidate − baseline*, so with
 * the working copy second every sentence reads as what **yours** did relative to the rival.
 */
export function testBedRequestOf(choice: TestBedChoice, seed: bigint): BatchRequest {
  return {
    buildingId: choice.buildingId,
    seed: seed.toString(),
    durationS: TEST_BED_RUN_S,
    replications: choice.replications,
    arms: [
      { armId: 'rival', dispatcherProfileId: choice.rivalId },
      { armId: 'yours', dispatcherProfileId: TEST_BED_WORKING_ID },
    ],
    // An id this build does not know runs the building's own profile, which is the engine's default.
    arrivalRatePctPop5min:
      TEST_BED_CROWDS.find((crowd) => crowd.id === choice.crowdId)?.ratePctPop5min ?? null,
  };
}

/** A building's name on the dock's list, with a tower of the player's own marked as theirs. */
export function testBedBuildingLabelOf(name: string, own: boolean): string {
  return own ? `${name} (yours)` : name;
}

/** The working copy as a profile the worker can run, and the name it is reported under. */
export function testBedWorkingProfileOf(
  built: BuiltDispatcher,
  source: DispatcherProfile | undefined,
  context: SelectorContext,
): DispatcherProfile {
  const profile = builtProfileOf(built, TEST_BED_WORKING_ID, source, context);
  // Reported as *yours*: beside a rival that may be the design it was copied from, its own name
  // would put the same words on both arms.
  return { ...profile, name: `Yours (${profile.name})` };
}

/** The extra profiles a run carries: the player's saved ones, then the working copy. */
export function testBedProfilesOf(
  saved: readonly DispatcherProfile[],
  working: DispatcherProfile,
): readonly DispatcherProfile[] {
  return [...saved.filter((profile) => profile.id !== TEST_BED_WORKING_ID), working];
}

/** One row of the result, as the dock draws it. */
export interface TestBedRow {
  readonly metric: BatchMetric;
  readonly label: string;
  readonly word: string;
  /** `good`, `bad` or `flat` — the pill's colour, and nothing a reader has to see colour to get. */
  readonly tone: 'good' | 'bad' | 'flat';
  /** `batch/report.ts`'s own sentence, carrying its interval and its *n*. */
  readonly sentence: string;
  readonly note: string;
}

/** The whole result. */
export interface TestBedView {
  /** What ran, in words: the building, the demand and the count. */
  readonly ran: string;
  /** Whether both arms met the same riders — always drawn, aligned or not. */
  readonly crn: string;
  /** Present when the count is under the 50 this project budgets for. */
  readonly budgetNote: string | undefined;
  /** How each arm behaved before any comparison: *in 50 runs, 3 saturated*. */
  readonly arms: readonly string[];
  readonly headline: readonly TestBedRow[];
  readonly rest: readonly TestBedRow[];
  /** `batchReport`'s own summary of what the rows added up to. Never a winner. */
  readonly summary: string;
  /** {@link TEST_BED_COPY.noFigure}, when a headline row has no figure. */
  readonly noFigure: string | undefined;
}

/** The dock's reading of a finished batch, or `undefined` for one with no comparison in it. */
export function testBedViewOf(report: BatchReport): TestBedView | undefined {
  const comparison = report.comparisons[0];
  if (comparison === undefined) return undefined;
  const rows = comparison.rows.map((row): TestBedRow => {
    const word = testBedVerdictWordOf(row.verdict, row.favours);
    return Object.freeze({
      metric: row.metric,
      label: row.label,
      word,
      tone:
        word === TEST_BED_VERDICT_WORDS.better ? 'good' : word === TEST_BED_VERDICT_WORDS.worse ? 'bad' : 'flat',
      sentence: row.sentence,
      note: row.note,
    });
  });
  return Object.freeze({
    ran: `${report.buildingName} · ${report.demandClause} · ${String(report.replications)} runs`,
    crn: report.crnSentence,
    budgetNote: report.budgetNote ?? undefined,
    arms: Object.freeze(report.arms.map((arm) => `${arm.dispatcherProfileName}: ${arm.sentence}`)),
    headline: Object.freeze(rows.filter((row) => TEST_BED_HEADLINE.includes(row.metric))),
    rest: Object.freeze(rows.filter((row) => !TEST_BED_HEADLINE.includes(row.metric))),
    summary: comparison.summary.sentence,
    noFigure: rows.some(
      (row) => TEST_BED_HEADLINE.includes(row.metric) && row.word === TEST_BED_VERDICT_WORDS.suppressed,
    )
      ? TEST_BED_COPY.noFigure
      : undefined,
  });
}
