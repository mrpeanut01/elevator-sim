/**
 * `everyday/callOpening.ts` — a replay of a called day opens just before the call, wave AK,
 * § D1140, the post-AJ panel's seat A: *Take this call again* re-opened St Jude's day at 08:30 for
 * a call at 08:40, and *Watch it* would have opened a ten-hour day at 08:00.
 */

import { describe, expect, it } from 'vitest';

import type { ViewerState } from '../dev/state.js';
import { contractDayState } from '../shift/contractDay.test-helper.js';
import { admittedPressDayIds, pressDayFor } from '../shift/ladder.js';
import { horizonFieldsOf, pressAt, pressDayArmOf, PRESS_DAY_RESOURCES } from '../shift/pressDay.test-helper.js';
import { watchRecordOf } from '../watch/record.js';

import { CALL_LEAD_S, callOpeningOf, watchedCallOpeningOf } from './callOpening.js';

/** The first admitted pinned day, as measured, with the run its standing order makes. */
function pinnedDay(): { readonly state: ViewerState; readonly arm: ReturnType<typeof pressDayArmOf> } {
  const [contractId] = admittedPressDayIds();
  const press = pressDayFor(contractId);
  if (contractId === undefined || press === undefined) throw new Error('an admitted pin');
  const seed = BigInt(press.seedText);
  const arm = pressDayArmOf(contractId, seed, press.standingOrder, press.horizon, []);
  const state = {
    ...contractDayState(contractId, { seed, dispatcherId: press.standingOrder, over: horizonFieldsOf(contractId, press.horizon) }),
    /* The Scenario's own day carries no campaign event; `contractDayState` pins one for the sweep. */
    campaignEventId: undefined,
  };
  return { state, arm };
}

describe('a replay of a called day opens just before the call — § D1140', () => {
  it('opens a retake of the pinned day half a minute before its call, whether or not it was pressed', () => {
    const { state, arm } = pinnedDay();
    const call = arm.call;
    if (call === undefined) throw new Error('the pinned day raises its call');
    const opening = callOpeningOf(PRESS_DAY_RESOURCES, state, arm.recording);
    expect(opening).toBe(call.atS - CALL_LEAD_S);
    expect(opening ?? 0).toBeGreaterThan(arm.recording.startedAt);
  });

  it('opens a watched filed pinned day at the same second, read off its own record', () => {
    const { state, arm } = pinnedDay();
    const call = arm.call;
    if (call === undefined) throw new Error('the pinned day raises its call');
    const record = watchRecordOf(state, PRESS_DAY_RESOURCES);
    expect(record, 'the pinned day files a record').toBeDefined();
    if (record === undefined) return;
    expect(record.rungContractId).toBe(state.week.contractId);
    /* The spectator stands on some other week entirely; the record is what decides. */
    const spectator = { ...state, week: { ...state.week, contractId: 'c1', day: 4 }, seed: 1n };
    expect(watchedCallOpeningOf(PRESS_DAY_RESOURCES, spectator, record, arm.recording)).toBe(call.atS - CALL_LEAD_S);
  });

  it('opens any other day at its first press, and a day with none at its start', () => {
    const { state, arm } = pinnedDay();
    const other = { ...state, dispatcherId: state.dispatcherId === 'eta' ? 'collective' : 'eta' };
    const start = arm.recording.startedAt;
    /* Not the pinned day as measured, so rule 1 answers nothing and the presses decide. */
    const pressed = { ...other, interventions: [...pressAt(start + 900, 'spread-cars'), ...pressAt(start + 600, 'park-cars-lobby')] };
    expect(callOpeningOf(PRESS_DAY_RESOURCES, pressed, arm.recording)).toBe(start + 600 - CALL_LEAD_S);
    expect(callOpeningOf(PRESS_DAY_RESOURCES, other, arm.recording)).toBeUndefined();
    /* A press inside the lead opens at the start rather than before it. */
    const early = { ...other, interventions: pressAt(start + 10, 'spread-cars') };
    expect(callOpeningOf(PRESS_DAY_RESOURCES, early, arm.recording)).toBeUndefined();
  });
});
