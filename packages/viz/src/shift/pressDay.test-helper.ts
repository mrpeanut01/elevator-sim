/**
 * **One pinned day, run the way the Scenario press runs it, and its call** — the harness
 * `pressLadder.test.ts` and `pressLadder.sweep.test.ts`'s call mode share, so the always-on check
 * and the instrument that produced the pin cannot build the day two ways
 * ([§ D1029](../../../../DECISIONS.md)).
 *
 * A test helper rather than a production module, `contractDay.test-helper.ts`'s reason: the player's
 * product runs a pinned day through `everyday/host.ts`, and nothing it ships needs this. What it
 * shares with the product is the one function that matters, `shift/pressCall.ts#pressCallOf` — the
 * stage asks it of the recording it plays and this asks it of the as-built run, and
 * `pressCall.test.ts` asserts that the two answers are the same second.
 */

import type { RunInterventionConfig } from '@elevator-sim/core/browser';

import type { BrowserResources } from '../dev/data.js';
import {
  buildingConfigOf,
  shiftLengthForContract,
  shiftRunConfigOf,
  type ViewerState,
} from '../dev/state.js';
import type { VizRecording } from '../contract/types.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';

import { bookedOutCarsOf } from './bookedOut.js';
import { contractBuildings, contractDayState } from './contractDay.test-helper.js';
import { contractById } from './contracts.js';
import { actsOf, runHorizonOf, wholeDayFor, wholeDayRun } from './dayLength.js';
import { SHIFT_EVENTS } from './events.js';
import { goalsForDay, readGoals } from './goals.js';
import type { ContractPressDay } from './ladder.js';
import { shiftObservationsOf } from './observations.js';
import { pressCallOf, type PressCall } from './pressCall.js';
import { dayReportOf } from './report.js';
import type { RunHorizon } from './types.js';
import { openWeek } from './week.js';

/** Every building the contracts name — `contractDay.test-helper.ts`'s derivation, loaded once. */
export const PRESS_DAY_RESOURCES: BrowserResources = contractBuildings();

/**
 * The two window fields a day runs at on `horizon` — `everyday/host.ts#startRun`'s own patch. A
 * whole day on a tower with none throws rather than falling back to the slice.
 */
export function horizonFieldsOf(
  contractId: string,
  horizon: RunHorizon,
): Partial<ViewerState> {
  if (horizon === 'period') return {};
  const contract = contractById(contractId);
  const day = wholeDayFor(
    PRESS_DAY_RESOURCES.trafficProfiles,
    buildingConfigOf(PRESS_DAY_RESOURCES, [], contract?.buildingId ?? ''),
  );
  if (day === undefined) throw new Error(`${contractId} pins a whole day on a tower that has none`);
  return wholeDayRun(day);
}

/** One run of one pinned day, graded two ways — the goal predicate and the sheet's own line. */
export interface PressDayArm {
  readonly recording: VizRecording;
  readonly horizon: RunHorizon;
  /** `readGoals` — any goal not `met`, `shift/week.ts#outcomeOf`'s rule. */
  readonly missed: boolean;
  readonly worstWaitS: number;
  /** Passenger, car and boarding second — `probes.test-helper.ts#legsOf`'s triple. */
  readonly legs: readonly (readonly [string, string, number])[];
  /** The call instant, asked of this run. */
  readonly call: PressCall | undefined;
  /** `dayReportOf(...).verdictLine`, computed on demand because it costs a report. */
  verdictLine(): string;
}

/** Run `contractId`'s day at `seed` under `dispatcherId` with `interventions`, on `horizon`. */
export function pressDayArmOf(
  contractId: string,
  seed: bigint,
  dispatcherId: string,
  horizon: RunHorizon,
  interventions: readonly RunInterventionConfig[],
): PressDayArm {
  const contract = contractById(contractId);
  if (contract === undefined) throw new Error(`no contract ${contractId}`);
  const over = horizonFieldsOf(contractId, horizon);
  const shiftLengthS = over.shiftLengthS ?? shiftLengthForContract(contractId);
  const state = contractDayState(contractId, { seed, dispatcherId, over });
  const plan = shiftRunConfigOf(PRESS_DAY_RESOURCES, state);
  const { recording } = recordRun(
    { ...plan.config, interventions },
    { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds },
  );
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const runHorizon = runHorizonOf(
    PRESS_DAY_RESOURCES.trafficProfiles,
    buildingConfigOf(PRESS_DAY_RESOURCES, state.savedBuildings, contract.buildingId),
    state,
  );
  const goals = goalsForDay(1, runHorizon);
  const call = pressCallOf({
    legs: recording.legs,
    bookedOut: bookedOutCarsOf(plan.building),
    horizon: runHorizon,
    acts: actsOf(recording.demandPhases),
    startedAt: recording.startedAt,
    endedAt: recording.endedAt,
  });
  return {
    recording,
    horizon: runHorizon,
    missed: readGoals(goals, observations).some((reading) => reading.state !== 'met'),
    worstWaitS: observations.worstWaitS,
    legs: recording.legs.map(
      (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1] as const,
    ),
    call,
    verdictLine: () =>
      dayReportOf({
        recording,
        observations,
        goals,
        week: openWeek(contractId),
        contract,
        event: SHIFT_EVENTS.ordinary,
        plan: { shiftLengthS, windowStartS: over.windowStartS ?? null, patternId: 'building' },
        calendar: null,
        subject: { kind: 'week-day' },
      }).verdictLine,
  };
}

/** One press, at `atS`, of `kind` — the shape the stage's call card files. */
export function pressAt(atS: number, kind: string): RunInterventionConfig[] {
  return [{ atS, change: { kind } as RunInterventionConfig['change'] }];
}

/** What {@link windowHolds} found at each offset it tried. */
export interface WindowTry {
  readonly offsetS: number;
  readonly clears: boolean;
  readonly otherMisses: boolean;
}

/**
 * **Ask a pin's claim at each offset from its call** — the admission criterion's own question.
 *
 * At every offset the clearing press must clear and the other must miss; the answer lists every
 * try, so a caller can say which failed rather than only that one did. Two runs per offset, the
 * as-built run already taken by the caller.
 */
export function windowTries(
  contractId: string,
  press: Pick<ContractPressDay, 'seedText' | 'standingOrder' | 'clearedBy' | 'missedBy' | 'horizon'>,
  callAtS: number,
  offsetsS: readonly number[],
): readonly WindowTry[] {
  const seed = BigInt(press.seedText);
  return offsetsS.map((offsetS) => {
    const atS = callAtS + offsetS;
    const right = pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, pressAt(atS, press.clearedBy));
    const wrong = pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, pressAt(atS, press.missedBy));
    return { offsetS, clears: !right.missed, otherMisses: wrong.missed };
  });
}
