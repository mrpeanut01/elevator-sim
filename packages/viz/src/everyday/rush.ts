/**
 * **Endless rush, the engine half** — GAMEPLAY § 9, ENGINE_CONTRACT § 3.2, GitHub issue #220,
 * under § D477 (kept; a ramp against a fail state), § D478 (a run outside its band says so) and
 * § D515 (what this module decides). `everyday/rushScreenModel.ts` is the setup screen's model and
 * owns the stream's arithmetic; this module turns that arithmetic into a run, reads the run for its
 * hold line, and words the result. `rushScreen.ts`, `stageScreen.ts` and `reportScreen.ts` draw
 * exactly what is decided here.
 *
 * ## The run
 *
 * The rush is a **week of its own** on `shift/week.ts#RUSH_CONTRACT_ID`, through the ordinary run
 * pipeline: {@link rushPatchOf} parks the player's week, opens the rush week, and sets the run's
 * identity — the `endless-rush` template, `arrivalRatePctPop5min` at wave 30's rate converted to the
 * building's own population, ninety minutes, seed 90 210, no window. `shiftRunConfigOf` then builds
 * the same `SimulationConfig` it builds for any day, and the stage plays the recording as it plays
 * any recording. Nothing here is a second simulator, a second clock or a second playback.
 *
 * ## The fail state, and the design question § D477 left open
 *
 * § D477: *the run ends when the lobby overfills*. § 20.5 and `RUSH_HOLD_LINE`: *forty people
 * standing over two minutes at once*, not forty standing. **They are the same line, and this module
 * says so rather than picking one by reading order.** *Overfill* without a wait clause ends a run on
 * forty fresh arrivals — the exact reading § 20.5 corrects — and forty people past two minutes is
 * what a lobby overfilling looks like once the building has stopped clearing it. {@link rushHoldAt}
 * reads the recording at the stream's own two-second buckets with `live/bands.ts#waitBandsAt`, the
 * stage's own membership authority, and reports the first bucket at which the fourth band holds
 * forty. The stage stops the replay there; the player may stop it earlier by hand.
 *
 * ## What the result may say
 *
 * `docs/35` `PM-RU3`: the divergence point comes from `summary.saturation` and never from a second
 * definition. So the result quotes `core`'s own trend test — the verdict, the window it was fitted
 * over, the slope and its sample count — and computes no *when it broke* of its own; the hold moment
 * is an observation of the recording, not an estimate. And the mode says *better* about nothing,
 * because it never has two configurations to compare. Every figure is a run fact with its clock
 * beside it.
 *
 * ## The disclosure
 *
 * Wave 30 asks 70.6 arrivals a minute of every tower. Converted to a rate, that leaves every shipped
 * profile's declared band — on a 120-person building it is several hundred per cent of the
 * population per five minutes — and § D478 says a run outside its band says so on its own face.
 * {@link rushDisclosureOf} is `fixit/parse.ts#demandDisclosureOf`'s sentence, the one already
 * shipped for the fixit cases, drawn on the setup screen and on the result.
 */

import type { ResolvedBuilding } from '@elevator-sim/core/browser';

import type { VizRecording, VizSaturation } from '../contract/types.js';
import type { ViewerState } from '../dev/state.js';
import { demandDisclosureOf, type DemandBand } from '../fixit/parse.js';
import { waitBandsAt } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import { RUSH_CONTRACT_ID, openRush, switchWeek } from '../shift/week.js';

import { EM_DASH } from './figures.js';
import {
  LAST_GENERATED_WAVE,
  RUSH_HOLD_LINE,
  RUSH_STREAM,
  arrivalsPerMinute,
  playerWaveAt,
  rushHoldLineFigure,
} from './rushScreenModel.js';

/** The bar's refusal between the press and the landing — a run on a worker arrives as a notification. */
export const RUSH_NOT_LANDED = 'the stream has not landed yet — the waves are being generated';

/** The template `data/traffic-profiles.json` authors for the stream. */
export const RUSH_TEMPLATE_ID = 'endless-rush';

/** § 3.2's one seed, as the run carries it. */
export const RUSH_SEED = BigInt(RUSH_STREAM.seed);

/** Wave 30's arrivals a minute — the top of the ramp, and the template's intensity 1. */
export function rushTopArrivalsPerMinute(): number {
  return arrivalsPerMinute(LAST_GENERATED_WAVE - 1);
}

/**
 * Wave 30's rate as `arrivalRatePctPop5min` for a building of `population` — the override the run
 * carries, so the stream is the same number of **people** on every tower.
 */
export function rushTopRatePctPop5min(population: number): number {
  if (!(population > 0)) throw new Error('a rush needs a building with people in it');
  return (rushTopArrivalsPerMinute() * 5 * 100) / population;
}

/** What the rush leaves behind to be put back — {@link rushPatchOf}'s inverse. */
export interface RushBefore {
  readonly contractId: string;
  readonly playMode: ViewerState['playMode'];
  readonly freePlay: ViewerState['freePlay'];
  readonly shiftLengthS: number;
  readonly windowStartS: number | null;
  readonly seed: bigint;
  readonly recording: ViewerState['recording'];
}

export function rushBeforeOf(state: ViewerState): RushBefore {
  return {
    contractId: state.week.contractId,
    playMode: state.playMode,
    freePlay: state.freePlay,
    shiftLengthS: state.shiftLengthS,
    windowStartS: state.windowStartS,
    seed: state.seed,
    recording: state.recording,
  };
}

/** The state a rush runs in: the player's week parked, the rush week open, the stream selected. */
export function rushPatchOf(state: ViewerState, population: number): Partial<ViewerState> {
  const moved = switchWeek(state.week, state.parkedWeeks, RUSH_CONTRACT_ID, 'restart');
  return {
    playMode: 'endless',
    week: moved.week.contractId === RUSH_CONTRACT_ID ? moved.week : openRush(),
    parkedWeeks: moved.parked,
    freePlay: { demandTemplateId: RUSH_TEMPLATE_ID, arrivalRatePctPop5min: rushTopRatePctPop5min(population) },
    shiftLengthS: RUSH_STREAM.lengthS,
    /*
     * A window from the period's own start rather than `null`: an authored phase list refuses a
     * `durationS` override (§ D275), and `shiftRunConfigOf` sends one exactly when the window is
     * `null`. The window is the whole ninety minutes, so nothing is selected out of the schedule.
     */
    windowStartS: 0,
    seed: RUSH_SEED,
  };
}

/** The player's week back, exactly as parked — see {@link RushBefore}. */
export function rushRestorePatchOf(state: ViewerState, before: RushBefore): Partial<ViewerState> {
  const moved = switchWeek(state.week, state.parkedWeeks, before.contractId, 'resume');
  return {
    week: moved.week,
    parkedWeeks: moved.parked,
    playMode: before.playMode,
    freePlay: before.freePlay,
    shiftLengthS: before.shiftLengthS,
    windowStartS: before.windowStartS,
    seed: before.seed,
    recording: before.recording,
  };
}

/** § D478's sentence for the rush's rate on this building, or `undefined` inside the band. */
export function rushDisclosureOf(building: ResolvedBuilding, band: DemandBand | undefined): string | undefined {
  return demandDisclosureOf(Math.round(rushTopRatePctPop5min(building.totalPopulation) * 10) / 10, band);
}

/**
 * The first bucket at which forty people have been standing over two minutes at once — the hold
 * line crossed — or `undefined` when the run ends without crossing it. Read at the stream's own
 * two-second buckets from the run's start.
 */
export function rushHoldAt(recording: Pick<VizRecording, 'legs' | 'startedAt' | 'endedAt'>): number | undefined {
  const bandIndex = 3;
  for (let t = recording.startedAt; t <= recording.endedAt; t += RUSH_STREAM.bucketS) {
    const count = waitBandsAt(recording as VizRecording, t).counts[bandIndex]?.count ?? 0;
    if (count >= RUSH_HOLD_LINE.people) return t;
  }
  return undefined;
}

/** How many people are past the hold line's two minutes at `t`. */
export function rushOverLineAt(recording: VizRecording, t: number): number {
  return waitBandsAt(recording, t).counts[3]?.count ?? 0;
}

export interface RushOutcome {
  /** `broke` when the hold line was crossed; `stopped` when the player ended it first. */
  readonly kind: 'broke' | 'stopped';
  /** The simulated second the rush ended at, from the run's start. */
  readonly atS: number;
  readonly wave: number;
  readonly heldS: number;
  readonly arrived: number;
  readonly carried: number;
  /** The longest anybody had stood by `atS`, including those still standing. */
  readonly longestWaitS: number;
  /** People past two minutes at `atS`, against the line. */
  readonly overLine: number;
  readonly saturation: VizSaturation | undefined;
}

/**
 * The run read at the moment it ended — the hold line if it was crossed before `stoppedAtS`, the
 * hand stop otherwise, the run's end when neither.
 */
export function rushOutcomeOf(recording: VizRecording, stoppedAtS: number | undefined): RushOutcome {
  const holdAtS = rushHoldAt(recording);
  const broke = holdAtS !== undefined && (stoppedAtS === undefined || holdAtS <= stoppedAtS);
  const atS = broke ? holdAtS : Math.min(stoppedAtS ?? recording.endedAt, recording.endedAt);
  const o = observationsAt(recording, atS);
  let longest = 0;
  for (const leg of recording.legs) {
    if (leg.arrivedAt > atS || leg.refusedAt !== undefined) continue;
    const left = leg.boardedAt === undefined ? atS : Math.min(leg.boardedAt, atS);
    longest = Math.max(longest, left - leg.arrivedAt);
  }
  return {
    kind: broke ? 'broke' : 'stopped',
    atS,
    wave: playerWaveAt(atS - recording.startedAt),
    heldS: atS - recording.startedAt,
    arrived: o.arrived,
    carried: o.carried,
    longestWaitS: longest,
    overLine: rushOverLineAt(recording, atS),
    saturation: recording.summary.saturation,
  };
}

/**
 * How many waves a rush **outlasted**, as the chime ledger is told it — GitHub issue #499 — or
 * `undefined` when the run has no turn to bank.
 *
 * *A rush wave survived* (`data/chime-ledger.json`'s `rush-wave-survived`) is a wave the run got
 * through. {@link RushOutcome.wave} is the wave the line was crossed in — the result's *furthest
 * wave* — which was reached and not survived, so the count is the waves before it. Two runs bank
 * nothing: one ended by hand, which has no breaking point (§ D515, and the result says *not posted*
 * for the same reason), and one that broke inside its first wave, which outlasted none.
 *
 * A count of turns and nothing else the run measured: how long it held, how many were carried and how
 * long anybody waited are all on the outcome, and none of them reaches this answer, which is § D526
 * clause 2. Which of the waves are paid is the server's to decide — only those beyond the account's
 * best (`packages/server/src/chimes/ledger.test.ts`).
 */
export function rushWavesOutlastedOf(outcome: RushOutcome): number | undefined {
  if (outcome.kind !== 'broke') return undefined;
  const outlasted = outcome.wave - 1;
  return outlasted >= 1 ? outlasted : undefined;
}

/* -------------------------------------------------------------------------- *
 * The stage header in the rush context — § 9.2: held time, the wave, no timeline
 * -------------------------------------------------------------------------- */

export interface RushStageFigure {
  readonly label: string;
  readonly value: string;
}

export interface RushStageHeaderView {
  /** `12:34` — time held, not the hour. */
  readonly held: string;
  /** `WAVE 5`. */
  readonly wave: string;
  readonly drivingLabel: string;
  readonly driverName: string;
  readonly figures: readonly RushStageFigure[];
}

export const RUSH_STAGE_COPY = Object.freeze({
  drivingLabel: 'DRIVING',
  heldLabel: 'held',
  standingLabel: 'standing right now',
  overLineLabel: 'past two minutes, of 40',
  longestLabel: 'longest so far',
});

/** `m:ss` of seconds held. */
export function heldClock(heldS: number): string {
  const whole = Math.max(0, Math.floor(heldS));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${String(m)}:${s < 10 ? '0' : ''}${String(s)}`;
}

export function rushStageHeaderOf(input: {
  readonly recording: VizRecording;
  readonly simTimeS: number;
  readonly driverName: string;
}): RushStageHeaderView {
  const heldS = input.simTimeS - input.recording.startedAt;
  const o = observationsAt(input.recording, input.simTimeS);
  const longest = o.worstWaitSoFarS;
  return {
    held: heldClock(heldS),
    wave: `WAVE ${String(playerWaveAt(heldS))}`,
    drivingLabel: RUSH_STAGE_COPY.drivingLabel,
    driverName: input.driverName,
    figures: [
      { label: RUSH_STAGE_COPY.standingLabel, value: String(o.waitingNow) },
      { label: RUSH_STAGE_COPY.overLineLabel, value: String(rushOverLineAt(input.recording, input.simTimeS)) },
      {
        label: RUSH_STAGE_COPY.longestLabel,
        value: longest === undefined ? EM_DASH : `${String(Math.round(longest))} s${o.worstWaitIsCensored ? ' and counting' : ''}`,
      },
    ],
  };
}

/* -------------------------------------------------------------------------- *
 * The result — § 9.3, its own screen, branching on whether the line was crossed
 * -------------------------------------------------------------------------- */

export interface RushResultFigure {
  readonly label: string;
  readonly value: string;
  readonly note?: string | undefined;
}

export interface RushResultView {
  readonly eyebrow: string;
  readonly head: string;
  readonly lede: string;
  /** The account's beats, in order — three when it broke, two when it was stopped. */
  readonly account: readonly string[];
  readonly figures: readonly RushResultFigure[];
  readonly footer: string;
  /** § D478's line, or `undefined` inside the band. */
  readonly disclosure: string | undefined;
  readonly outcome: RushOutcome['kind'];
}

/** The result screen before any rush has landed. */
export const RUSH_RESULT_EMPTY_LEDE = 'A rush has not run yet, so there is no furthest wave to report. Start one from the Endless rush screen.';

export const RUSH_RESULT_COPY = Object.freeze({
  eyebrow: 'ENDLESS RUSH · THE RESULT',
  brokeHead: (wave: number): string => `Wave ${String(wave)} is where it stopped draining`,
  stoppedHead: (wave: number): string => `You stopped at wave ${String(wave)}, still holding`,
  brokeLede: (held: string, arrived: number): string =>
    `It held for ${held} before forty people had been standing over two minutes at once; ${String(arrived)} had arrived by then.`,
  stoppedLede: 'This run does not have a breaking point to report. It was ended by hand while the building was still clearing what arrived.',
  beatComfortable: 'The first waves cleared between cars, the way a normal morning does.',
  beatTrend: (saturation: VizSaturation): string =>
    saturation.verdict === 'diverging-queue'
      ? `Then the queue stopped emptying between cars: over the ${heldClock(saturation.windowEndS - saturation.windowStartS)} the sheet's trend test measures, it grew ${saturation.slopePersonsPerMinute.toFixed(1)} people a minute, read at ${String(saturation.sampleCount)} samples.`
      : `The sheet's trend test over the whole run does not call the queue divergent (${saturation.verdict}, ${String(saturation.sampleCount)} samples), which is what a line reached and then cleared looks like.`,
  beatTrendAbsent: 'This recording carries no trend test, so where the queue began to diverge is not on it.',
  beatBroke: (held: string): string => `At ${held} held, forty people had been over two minutes at once, and the rush ended there.`,
  beatStopped: (over: number): string =>
    `${String(over)} people were past two minutes when it stopped, against a line of ${String(RUSH_HOLD_LINE.people)}. Where this building breaks is not yet known.`,
  brokeFooter: `Waves are identical for everyone, generated once from seed ${String(RUSH_STREAM.seed)}.`,
  stoppedFooter: (wave: number): string =>
    `Ended by hand at wave ${String(wave)} — not posted, because a stopped run has no breaking point.`,
  furthestWave: 'furthest wave',
  howLong: 'how long it held',
  carried: 'people carried',
  longest: 'longest anybody waited',
});

export function rushResultViewOf(outcome: RushOutcome, disclosure: string | undefined): RushResultView {
  const held = heldClock(outcome.heldS);
  const broke = outcome.kind === 'broke';
  const trend = outcome.saturation === undefined ? RUSH_RESULT_COPY.beatTrendAbsent : RUSH_RESULT_COPY.beatTrend(outcome.saturation);
  return {
    eyebrow: RUSH_RESULT_COPY.eyebrow,
    head: broke ? RUSH_RESULT_COPY.brokeHead(outcome.wave) : RUSH_RESULT_COPY.stoppedHead(outcome.wave),
    lede: broke ? RUSH_RESULT_COPY.brokeLede(held, outcome.arrived) : RUSH_RESULT_COPY.stoppedLede,
    account: broke
      ? [RUSH_RESULT_COPY.beatComfortable, trend, RUSH_RESULT_COPY.beatBroke(held)]
      : [RUSH_RESULT_COPY.beatComfortable, RUSH_RESULT_COPY.beatStopped(outcome.overLine)],
    figures: [
      { label: RUSH_RESULT_COPY.furthestWave, value: String(outcome.wave) },
      { label: RUSH_RESULT_COPY.howLong, value: held },
      { label: RUSH_RESULT_COPY.carried, value: String(outcome.carried) },
      { label: RUSH_RESULT_COPY.longest, value: `${String(Math.round(outcome.longestWaitS))} s`, note: `the run ends at ${rushHoldLineFigure()}` },
    ],
    footer: broke ? RUSH_RESULT_COPY.brokeFooter : RUSH_RESULT_COPY.stoppedFooter(outcome.wave),
    disclosure,
    outcome: outcome.kind,
  };
}
