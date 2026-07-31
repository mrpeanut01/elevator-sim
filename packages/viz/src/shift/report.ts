/**
 * The Day report — the observation sheet, and the module where honesty costs the most.
 *
 * ## What this replaces
 *
 * The handoff's report sheet is a prototype's, and `docs/12-design-handoff.md` § 4.2 is the list of
 * what each of its figures becomes. Two are worth naming here because they are the reason this
 * module is careful rather than long:
 *
 * - Its **average wait** is `28 + (100 − pct) × 0.9`. That is not a rounded mean or a stale mean;
 *   it is a number computed from a different quantity to look plausible. It is replaced by
 *   `summary.meanWaitS` — and by the word **withheld** whenever the run's own `awtIsValid` is
 *   false or the run saturated.
 * - Its **where it went wrong** rows are hard-coded at `08:30` and `17:20`, on a run whose clock
 *   the design invented. They are replaced by three rows derived from the run: the instant the
 *   deepest queue stood, the demand phase that instant fell in, and the reporting window every
 *   cohort figure above was computed over. **A clock time the run did not have is never printed.**
 *
 * ## The suppression gate, stated once
 *
 * `AVERAGE WAIT` is the only figure on this sheet that a saturated run may not publish, and it is
 * gated on `summary.awtIsValid && !summary.saturated` — both, not either. `awtIsValid` already has
 * four grounds (an empty window, censoring above the unserved limit, a leg past the 900 s
 * abandonment horizon, and the trend test) and `saturated` is carried separately; requiring both is
 * `docs/12` § 4.2's own wording and it is the conservative direction. Everything else on the sheet
 * is an **observation** — a count, or a ratio of counts — and is therefore printed on a saturated
 * day, which is the day a reader most needs it. That split is `docs/10` R9: one gate, for exactly
 * the figures the flag speaks for, widened to nothing.
 *
 * ## Energy: two figures, no colour, no total
 *
 * The handoff has no energy figure. `docs/12` § 4.2 adds one and § D106 says why dropping it to
 * match a handoff that had not heard the argument would be a regression — and, in the same breath,
 * what may be done with it. `workKJ` and `workPerServedLegKJ` are drawn **side by side**, always
 * both or neither, with {@link ReportFigure.tone} `unranked` and {@link ReportFigure.axisOnly}
 * `true`. Nothing on this sheet sums them with anything, ranks them against anything, or turns them
 * into a grade: measured across the full experiment matrix, `nearest-car` is on the Pareto front at
 * six of eight cells because it is best on energy and worst on wait, so a green energy figure would
 * congratulate the weakest shipped dispatcher. *A configuration that spends less by serving fewer
 * people has not saved anything*, which is exactly what the second figure is for. When
 * `energy.measured` is false both read **not recorded**, never `0 kJ`.
 *
 * ## What is inherited and what is derived
 *
 * Nothing here recomputes a statistic. Every figure is either copied from {@link VizSummary} (which
 * `record/recordRun.ts` copied from `RunSummary`, which `core` computed) or copied from the
 * {@link Observations} the live layer folded out of the recording. This module formats and
 * refuses; it does not measure. That is the same division `campaign/judge.ts` states for the
 * batch — *"nothing statistical is computed here"*.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizRecording, VizSummary } from '../contract/types.js';

import { eventFor } from './events.js';
import { readGoals } from './goals.js';
import { growthFactor } from './growth.js';
import {
  DAY_START_S,
  weekdayOf,
  type DayReport,
  type Observations,
  type ReportDiagnosis,
  type ReportFigure,
  type ReportForecast,
  type ReportLever,
  type ScenarioContract,
  type ShiftEvent,
  type ShiftGoal,
  type WeekState,
} from './types.js';

/**
 * The word the sheet prints instead of a mean it may not publish.
 *
 * A constant because three places have to agree on it: the figure, the honesty guard in
 * `report.test.ts`, and whatever renders it. The handoff already reserved this exact word for the
 * saturated case; the implementation widens it to all four of `awtIsValid`'s grounds.
 */
export const WITHHELD = 'withheld';

/** What an unmeasured quantity reads. Never `0`, never a dash. `docs/10` R3/R11. */
export const NOT_RECORDED = 'not recorded';

export interface DayReportInput {
  readonly recording: VizRecording;
  /** From `packages/viz/src/live/`. See `types.ts` — this layer never folds a recording itself. */
  readonly observations: Observations;
  /** Today's goals. Read here, against the same observations, so the sheet cannot disagree with the rail. */
  readonly goals: readonly ShiftGoal[];
  /** The week **after** `closeDay` — it carries the streak, the banked count and the award. */
  readonly week: WeekState;
  /** `undefined` for a building the reader built, which is graded but belongs to no scenario. */
  readonly contract: ScenarioContract | undefined;
  readonly event: ShiftEvent;
  /** The dispatcher's display name. Defaults to the recording's profile id. */
  readonly dispatcherName?: string | undefined;
  /** The simulated second the shift clock calls 06:00. See {@link DAY_START_S}. */
  readonly dayStartS?: SimTime | undefined;
}

/**
 * Build the day's observation sheet.
 *
 * Pure: no clock, no RNG, no simulation. The run already happened and the observations were already
 * folded; this arranges them and refuses what may not be said.
 */
export function dayReportOf(input: DayReportInput): DayReport {
  const { recording, observations, week, contract, event } = input;
  const { summary } = recording;
  const dayStartS = input.dayStartS ?? DAY_START_S;
  const dispatcherName = input.dispatcherName ?? recording.dispatcherProfileId;
  const readings = readGoals(input.goals, observations);
  const allMet = readings.length > 0 && readings.every((reading) => reading.state === 'met');
  const nextIdx = (week.dayIdx + 1) % 7;

  return {
    title: `${weekdayOf(week.dayIdx)} — day ${String(week.day)}`,
    metaLines: [
      `${recording.buildingName} · ${dispatcherName}`,
      `seed ${recording.seed} · ${clockRange(recording.startedAt, recording.endedAt, dayStartS)} · one replication`,
    ],
    lede: ledeFor(summary, observations),
    figures: figuresFor(summary, observations, dayStartS),
    verdict: allMet ? 'cleared' : 'missed',
    verdictLine: allMet ? 'Shift cleared' : 'Shift missed',
    streakLine: streakLineFor(allMet, week.streak),
    contractLine: contractLineFor(contract, week),
    cleared: week.cleared,
    goals: readings,
    diagnosis: diagnosisFor(recording, observations, dayStartS),
    levers: LEVERS,
    forecast: forecastFor(week.day, nextIdx),
    taught: taughtFor(contract, week),
    smallPrint: smallPrintFor(dispatcherName),
    nextDayName: weekdayOf(nextIdx),
  };
}

/* -------------------------------------------------------------------------- *
 * The lede
 * -------------------------------------------------------------------------- */

/**
 * The design's two branches, with its third clause removed rather than reworded.
 *
 * The healthy branch ends *"and the queue no deeper at close than at mid-morning"*. That is a
 * claim about two instants the recording does not summarise, and printing it unverified would be
 * the caption-that-does-not-describe-the-picture failure this whole handoff keeps naming. What is
 * left is three counts, all of them observations.
 */
function ledeFor(summary: VizSummary, observations: Observations): string {
  if (summary.saturated) {
    return (
      `It did not cope. ${String(observations.arrived)} people asked for a lift and ` +
      `${String(observations.carried)} got one, with ${String(summary.unservedCount)} still ` +
      'standing when the window closed. That is a building being outrun, not a dispatcher having ' +
      'a bad day — and it is fixable with the levers below.'
    );
  }
  return (
    `A day it could handle. ${String(observations.carried)} journeys of ` +
    `${String(observations.arrived)} offered, and ${String(observations.minutePct)}% of riders ` +
    'away inside a minute.'
  );
}

/* -------------------------------------------------------------------------- *
 * The figure grid
 * -------------------------------------------------------------------------- */

function figuresFor(
  summary: VizSummary,
  observations: Observations,
  dayStartS: SimTime,
): readonly ReportFigure[] {
  return [
    {
      id: 'carried',
      label: 'CARRIED',
      value: String(observations.carried),
      note: `of ${String(observations.arrived)} who turned up`,
      tone: 'plain',
      axisOnly: false,
    },
    {
      id: 'minute',
      label: 'AWAY INSIDE A MINUTE',
      value: `${String(observations.minutePct)}%`,
      // R13: the share never travels without the count it was taken over.
      note: `an observation, never suppressed — over ${String(observations.servedLegs)} served legs`,
      tone: observations.minutePct >= 75 ? 'good' : observations.minutePct >= 50 ? 'caution' : 'bad',
      axisOnly: false,
    },
    averageWaitFigure(summary),
    worstWaitFigure(summary),
    {
      id: 'deepest-queue',
      label: 'DEEPEST QUEUE',
      value: String(observations.peakQueue),
      note: deepestQueueNote(observations, dayStartS),
      tone: observations.peakQueue > 24 ? 'hot' : 'plain',
      axisOnly: false,
    },
    {
      id: 'stairs',
      label: 'TOOK THE STAIRS',
      value: String(observations.abandoned),
      note: 'waited past the 15-minute horizon',
      tone: observations.abandoned > 0 ? 'bad' : 'good',
      axisOnly: false,
    },
    ...energyFigures(summary),
  ];
}

/**
 * The one figure on this sheet that may be refused — **and the whole of the refusal**.
 *
 * Exported because `report.test.ts` asserts both branches directly and because the honesty guard
 * wants a handle on it. The value is `summary.meanWaitS` formatted and **nothing else**: there is
 * no fallback arithmetic, no interpolation from the away-inside-a-minute share, and no rounding to
 * a friendlier number. The mockup's `28 + (100 − pct) × 0.9` is asserted absent.
 */
export function averageWaitFigure(summary: VizSummary): ReportFigure {
  const publishable = summary.awtIsValid && !summary.saturated;
  if (!publishable) {
    return {
      id: 'average-wait',
      label: 'AVERAGE WAIT',
      value: WITHHELD,
      note:
        summary.awtInvalidReason ??
        'the queues never settled, so there is no cohort to take a mean over — see the small print',
      tone: 'withheld',
      axisOnly: false,
    };
  }
  return {
    id: 'average-wait',
    label: 'AVERAGE WAIT',
    value: `${summary.meanWaitS.toFixed(1)} s`,
    // R13 and § 7.4: a mean is not a figure without its window and its `n`.
    note: `over ${String(summary.waitCount)} legs in the ${summary.reportWindow.id} window`,
    tone: 'plain',
    axisOnly: false,
  };
}

/**
 * The longest wait in the window, and the word that keeps it honest.
 *
 * `longestWaitIsCensored` means the leg never boarded, so the number is a **lower bound** and the
 * sentence has to say *at least*. Drawing the censored and uncensored cases identically would put
 * the understatement precisely where the service is worst — `VizServiceLevel`'s own argument.
 */
function worstWaitFigure(summary: VizSummary): ReportFigure {
  const { longestWaitS, longestWaitIsCensored } = summary.serviceLevel;
  if (longestWaitS === null) {
    return {
      id: 'worst-wait',
      label: 'WORST WAIT',
      value: NOT_RECORDED,
      note: 'the reporting window held no arrivals',
      tone: 'plain',
      axisOnly: false,
    };
  }
  return {
    id: 'worst-wait',
    label: 'WORST WAIT',
    value: `${longestWaitIsCensored ? 'at least ' : ''}${longestWaitS.toFixed(0)} s`,
    note: longestWaitIsCensored
      ? 'a rider who never boarded — this is a lower bound, not their wait'
      : 'one rider, and they remember it',
    tone: longestWaitS > 120 ? 'bad' : 'plain',
    axisOnly: false,
  };
}

/** *floor 12 at 08:37*, or the honest absence of one. Never a clock time the run did not have. */
function deepestQueueNote(observations: Observations, dayStartS: SimTime): string {
  if (observations.peakQueueFloorId === null || observations.peakQueueAtS === null) {
    return 'never more than a handful';
  }
  return `floor ${observations.peakQueueFloorId} at ${clockOf(observations.peakQueueAtS, dayStartS)}`;
}

/**
 * The pair. Both or neither, never ranked, never summed. See the module docstring and § D106.
 *
 * `deliveredLegCount` rides in the per-leg figure's note because it is that ratio's denominator and
 * R13 says an estimate over four legs is not the same claim as one over four hundred.
 */
function energyFigures(summary: VizSummary): readonly ReportFigure[] {
  const { energy } = summary;
  const measured = energy.measured;
  return [
    {
      id: 'energy-work',
      label: 'WORK DONE',
      value: measured && energy.workKJ !== null ? `${energy.workKJ.toFixed(0)} kJ` : NOT_RECORDED,
      note: 'out-of-balance mechanical work — an axis beside the waits, never a score',
      tone: 'unranked',
      axisOnly: true,
    },
    {
      id: 'energy-per-leg',
      label: 'WORK PER DELIVERED LEG',
      value:
        measured && energy.workPerServedLegKJ !== null
          ? `${energy.workPerServedLegKJ.toFixed(1)} kJ`
          : NOT_RECORDED,
      note: `over ${String(energy.deliveredLegCount)} delivered legs — a day that spends less by carrying fewer people has saved nothing`,
      tone: 'unranked',
      axisOnly: true,
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * Where it went wrong
 * -------------------------------------------------------------------------- */

/**
 * Three rows, every one of them derived from this run.
 *
 * The mockup's `08:30` and `17:20` are gone. What replaces them is the instant the deepest queue
 * actually stood, the demand phase that instant actually fell in, and the window the figures above
 * were actually computed over — and where the run does not have one of those, the row says so
 * rather than borrowing a plausible time from an office day this simulator never ran (§ 4.1).
 */
function diagnosisFor(
  recording: VizRecording,
  observations: Observations,
  dayStartS: SimTime,
): readonly ReportDiagnosis[] {
  const at = observations.peakQueueAtS;
  const floorId = observations.peakQueueFloorId;
  const phase = at === null ? undefined : recording.demandPhases.find((p) => at >= p.startS && at < p.endS);
  const reportWindow = recording.summary.reportWindow;

  const queueRow: ReportDiagnosis =
    at === null || floorId === null
      ? {
          id: 'peak-queue',
          when: '—',
          what: 'No pile-up worth naming',
          why: 'Demand stayed under what the group could clear, all day.',
          tone: 'plain',
        }
      : {
          id: 'peak-queue',
          when: clockOf(at, dayStartS),
          what: `Floor ${floorId} stacked ${String(observations.peakQueue)} deep`,
          why:
            'Every car was committed elsewhere when the calls landed together. Batch arrivals are ' +
            'the normal case, not the unlucky one — people travel in groups.',
          tone: 'bad',
        };

  const phaseRow: ReportDiagnosis =
    phase === undefined
      ? {
          id: 'peak-phase',
          when: '—',
          what:
            recording.demandPhases.length === 0
              ? 'This recording carries no demand schedule'
              : 'The worst moment fell outside every demand phase',
          why:
            'The timeline’s segments are the resolved demand template’s own phases, so a run ' +
            'recorded before that field existed has none to name. No phase is invented to fill ' +
            'the gap — a label that does not describe the demand under it is the thing this sheet ' +
            'exists to avoid.',
          tone: 'plain',
        }
      : {
          id: 'peak-phase',
          when: clockRange(phase.startS, phase.endS, dayStartS),
          what: `The worst of it landed in ${phase.label}${rateClause(phase.ratePctPop5min)}`,
          why:
            'Round-trip time is what limits you inside a peak, not car speed. A stop costs about ' +
            '10 s of door and transfer time however fast the motor is, so the way out of a peak is ' +
            'fewer stops per trip rather than a quicker one.',
          tone: 'caution',
        };

  const windowRow: ReportDiagnosis = {
    id: 'report-window',
    when: clockOf(reportWindow.startS, dayStartS),
    what: `Every cohort figure above is the ${reportWindow.id} window, ${clockRange(reportWindow.startS, reportWindow.endS, dayStartS)}`,
    why:
      /*
       * The number is a **word** and not a numeral, and that is not a style choice. The honesty
       * search found this sentence printing `25` three rows under a cell reading
       * `AVERAGE WAIT: withheld`, on a run whose own refused `meanWaitS` rounds to 25 — a quoted
       * counter-example that a reader cannot tell from a figure, in the same voice as the sheet's
       * real ones. A carve-out for *numerals inside quotation marks* would have a hiding place in
       * it, so the numeral goes instead.
       */
      '“Riders waited twenty-five seconds on average” is false without “during the busiest five ' +
      'minutes”. ' +
      'The counts — carried, took the stairs, the deepest queue — are over the whole shift; the ' +
      'means and the longest wait are over that window and nothing else.',
    tone: 'plain',
  };

  return [queueRow, phaseRow, windowRow];
}

/** ` at 12.4 %pop/5min`, or nothing when the record carried no population to divide by. */
function rateClause(ratePctPop5min: number | null): string {
  return ratePctPop5min === null ? '' : `, at ${ratePctPop5min.toFixed(1)} %pop/5min`;
}

/* -------------------------------------------------------------------------- *
 * The rest of the sheet
 * -------------------------------------------------------------------------- */

/**
 * The four levers, verbatim from `design.html` :332–340.
 *
 * Kept word for word because every one of them is *true of this simulator*: a car is a `CarConfig`,
 * zoning is a bank's `servesFloors`, fairness is a weight in `data/dispatcher-profiles.json`, and
 * destination dispatch is Phase 6's `passengerAssignment: 'panel'`. The one sentence that would
 * have needed re-sourcing — a claim that destination dispatch does better *because* authorization
 * and optimization happen in one step — is not among them; see CLAUDE.md on the seven places that
 * claim was corrected.
 */
const LEVERS: readonly ReportLever[] = Object.freeze([
  Object.freeze({
    id: 'add-a-car',
    title: 'Add a car',
    body: 'The blunt instrument. Costs a shaft, works immediately, and the Building tab will let you feel how much it buys.',
  }),
  Object.freeze({
    id: 'zone-the-tower',
    title: 'Zone the tower',
    body: 'Split the floors between cars during the peak only. Superb while the peak holds, wasteful the moment it eases.',
  }),
  Object.freeze({
    id: 'weight-fairness',
    title: 'Weight fairness up',
    body: 'Rescue the forgotten floor rather than shaving seconds off the easy calls. Your worst wait falls; your average may not.',
  }),
  Object.freeze({
    id: 'ask-destination',
    title: 'Ask where they’re going',
    body: 'Destination dispatch pools riders by destination in the lobby, which cuts stops per trip — the thing that actually costs time.',
  }),
]);

/** The design's streak sentences (`design.html` :3499), unchanged. */
function streakLineFor(allMet: boolean, streak: number): string {
  if (!allMet) {
    return 'Streak reset. The building keeps growing either way — nothing here is a game over.';
  }
  return streak === 1 ? 'First clean day. Streak started.' : `${String(streak)} clean days in a row.`;
}

function contractLineFor(contract: ScenarioContract | undefined, week: WeekState): string {
  if (contract === undefined) {
    return 'Your own building — nothing is being banked, and the goals are still read from what happened.';
  }
  // SC-05/DR-09 (§ D198): `cleanRun` keeps counting on a contract already cleared, so the raw
  // figure can read "2 of 1". The clamp is on the display only — the data keeps its truth.
  const banked = Math.min(week.cleanRun, contract.needClean);
  return (
    `${contract.label} — ${contract.title} · ${String(banked)} of ` +
    `${String(contract.needClean)} clean shifts banked`
  );
}

/**
 * Tomorrow's card.
 *
 * The design prints a flat *"+11% more tenants than today"*. It is 11 % of **day one**, not of
 * today, because growth is linear (`1 + 0.11 × (day − 1)`) — so on day 5 tomorrow is 7.6 % busier
 * than today, not 11 %. The true figure is computed rather than the constant repeated: a number on
 * a forecast card is a claim, and this one is checkable against `growthFactor`.
 */
function forecastFor(day: number, nextIdx: number): ReportForecast {
  const event = eventFor(day + 1, nextIdx);
  const increase = (growthFactor(day + 1) / growthFactor(day) - 1) * 100;
  return {
    name: event.name,
    note: event.note,
    demand: `+${increase.toFixed(1)}% more tenants than today`,
  };
}

/** *What this taught* — the design's two branches (`design.html` :3506). */
function taughtFor(contract: ScenarioContract | undefined, week: WeekState): string {
  if (week.cleared !== null) return `Cleared: ${week.cleared.reward}.`;
  if (contract === undefined) {
    return 'A building you drew yourself. Nothing banks here — the sheet is the whole reward.';
  }
  const left = Math.max(0, contract.needClean - week.cleanRun);
  return (
    `Bank ${String(left)} more clean shift${left === 1 ? '' : 's'} on this building and the next ` +
    `assignment opens: ${contract.reward}.`
  );
}

/**
 * The small print, verbatim from `design.html` :3484 — and the best sentence in the handoff.
 *
 * It is this project's thesis in a reader's own words: CLAUDE.md's *"never declare one dispatcher
 * better than another without a paired-t confidence interval that excludes zero"* and its 50–200
 * replication budget, said to somebody who has just watched one day and wants to conclude something
 * from it. Not paraphrased, not shortened, and not made conditional on the day having gone badly.
 */
function smallPrintFor(dispatcherName: string): string {
  return (
    'This is one replication of one day on one seed. It cannot tell you that ' +
    `${dispatcherName.toLowerCase()} is better than anything — that needs 50 or more paired runs ` +
    'against the same passengers, and a confidence interval that excludes zero. What it can tell ' +
    'you is what happened today, and today is where the queue was.'
  );
}

/* -------------------------------------------------------------------------- *
 * The shift clock
 * -------------------------------------------------------------------------- */

/**
 * `dayStartS + simTimeS`, as `HH:MM`.
 *
 * The whole of the shift clock, and it adds no information: `simTimeS` is the kernel's, so
 * CLAUDE.md invariant 3 is untouched — nothing here reads a wall clock, it renames one the
 * simulation already produced. Wrapped modulo 24 hours so a long run cannot print `26:10`.
 *
 * Exported because the header band and the transport's o'clock ticks need the same mapping, and two
 * implementations of *what time is it in this building* would disagree about the same instant.
 */
export function clockOf(simTimeS: SimTime, dayStartS: SimTime = DAY_START_S): string {
  const total = Math.floor(dayStartS + simTimeS);
  const wrapped = ((total % 86_400) + 86_400) % 86_400;
  const hours = Math.floor(wrapped / 3600);
  const minutes = Math.floor((wrapped % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** `06:00–06:30`. An en dash, matching the design's own ranges. */
export function clockRange(startS: SimTime, endS: SimTime, dayStartS: SimTime = DAY_START_S): string {
  return `${clockOf(startS, dayStartS)}–${clockOf(endS, dayStartS)}`;
}
