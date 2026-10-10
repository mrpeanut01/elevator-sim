/**
 * `dev/engineerWindow.ts` — wave AN, lane AN-6, [§ D1323](../../../../DECISIONS.md). The gate's three
 * pure halves: which writes reach a run, when a write is refused, and the context that refuses it.
 * The shipped path is driven on the built bundle by `everyday/watchOnly.browser.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { baseState, RESOURCES } from '../scope/probes.test-helper.js';

import type { MountContext } from './mountTypes.js';
import {
  patchRemakesTheDay,
  VIEWER_KEY_ROLES,
  watchOnlyContext,
  watchOnlyRefusal,
  type ViewerKeyRole,
} from './engineerWindow.js';
import { shiftRunConfigOf, withBuilding, withDispatcher, type ViewerState } from './state.js';

const REFUSED = 'refused for the test';

describe('which writes reach a run', () => {
  it('sorts every key the state carries', () => {
    const roles: Readonly<Record<string, ViewerKeyRole | undefined>> = VIEWER_KEY_ROLES;
    const unsorted = Object.keys(baseState()).filter((key) => roles[key] === undefined);
    expect(unsorted).toEqual([]);
  });

  it('lets a write of the view through, and a write of the state as it stands', () => {
    const state = baseState();
    expect(patchRemakesTheDay(state, { tab: 'report', railSegment: 'building', showMaths: !state.showMaths })).toBe(false);
    expect(patchRemakesTheDay(state, { seed: state.seed, dispatcherId: state.dispatcherId })).toBe(false);
    expect(patchRemakesTheDay(state, { ...state })).toBe(false);
  });

  it('catches a change under any key that reaches a run, and a key it does not know', () => {
    const state = baseState();
    expect(patchRemakesTheDay(state, { seed: state.seed + 1n })).toBe(true);
    expect(patchRemakesTheDay(state, withDispatcher(state, RESOURCES, 'nearest-car'))).toBe(true);
    expect(patchRemakesTheDay(state, withBuilding(state, RESOURCES, 'midtown-office'))).toBe(true);
    expect(patchRemakesTheDay(state, { recording: undefined, report: undefined, ...{ unknownKey: 1 } } as Partial<ViewerState>)).toBe(
      true,
    );
  });

  it('is right that the view keys do not reach a run: the run a state makes is the same under another state’s view', () => {
    /*
     * The other half of the table, measured rather than asserted: every key sorted `'view'` taken from
     * a state on another building and dispatcher, whose editors' working copies describe other
     * things, and the run config `shiftRunConfigOf` builds is identical. A key wrongly sorted `'view'`
     * that the run reads would move it.
     */
    const state = baseState();
    const other = withDispatcher(withBuilding(state, RESOURCES, 'midtown-office'), RESOURCES, 'nearest-car');
    const viewKeys = (Object.keys(VIEWER_KEY_ROLES) as (keyof ViewerState)[]).filter((key) => VIEWER_KEY_ROLES[key] === 'view');
    const borrowed = Object.fromEntries(viewKeys.map((key) => [key, other[key]])) as Partial<ViewerState>;
    expect(viewKeys.some((key) => other[key] !== state[key]), 'the other state shares every view key, so this measures nothing').toBe(
      true,
    );
    const config = (over: ViewerState): string =>
      JSON.stringify(shiftRunConfigOf(RESOURCES, over), (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
    expect(config({ ...state, ...borrowed })).toBe(config(state));
    /* And the control: a key sorted `'remakes-the-day'` moves the same config. */
    expect(config({ ...state, dispatcherId: other.dispatcherId })).not.toBe(config(state));
  });
});

describe('when a write is refused', () => {
  const refusalWhere = (holds: (over: ViewerState) => boolean) => (over: ViewerState): string | undefined =>
    holds(over) ? REFUSED : undefined;

  it('refuses an ask for a run while the window holds, and only then', () => {
    expect(watchOnlyRefusal(baseState(), undefined, refusalWhere(() => true))).toBe(REFUSED);
    expect(watchOnlyRefusal(baseState(), undefined, refusalWhere(() => false))).toBeUndefined();
  });

  it('never refuses a write of the view', () => {
    expect(watchOnlyRefusal(baseState(), { tab: 'report' }, refusalWhere(() => true))).toBeUndefined();
  });

  it('refuses a write that would put a week with an attempt standing on screen, as well as one made over it', () => {
    const state = baseState();
    const moved = withBuilding(state, RESOURCES, 'midtown-office');
    const onMidtown = (over: ViewerState): boolean => over.buildingId === 'midtown-office';
    expect(watchOnlyRefusal(state, moved, refusalWhere(onMidtown))).toBe(REFUSED);
    expect(watchOnlyRefusal(moved, withBuilding(moved, RESOURCES, 'garden-apartments'), refusalWhere(onMidtown))).toBe(REFUSED);
    expect(watchOnlyRefusal(state, { seed: state.seed + 1n }, refusalWhere(onMidtown))).toBeUndefined();
  });
});

describe('the gated context', () => {
  function recorder(): { readonly context: MountContext; readonly calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      context: {
        update: (patch) => {
          calls.push(`update:${Object.keys(patch).join(',')}`);
        },
        runShift: () => {
          calls.push('runShift');
        },
        openTab: (tab) => {
          calls.push(`openTab:${tab}`);
        },
        fail: (message) => {
          calls.push(`fail:${message}`);
        },
      },
    };
  }

  it('passes the two writes through when nothing refuses, and everything else as given', () => {
    const made = recorder();
    const gated = watchOnlyContext(made.context, () => false);
    gated.update({ tab: 'run' });
    gated.runShift();
    gated.openTab('report');
    gated.fail('x');
    expect(made.calls).toEqual(['update:tab', 'runShift', 'openTab:report', 'fail:x']);
  });

  it('drops a refused write and a refused run, and still opens a tab', () => {
    const made = recorder();
    const asked: (Partial<ViewerState> | undefined)[] = [];
    const gated = watchOnlyContext(made.context, (patch) => {
      asked.push(patch);
      return true;
    });
    gated.update({ dispatcherId: 'nearest-car' });
    gated.runShift();
    gated.openTab('run');
    expect(made.calls).toEqual(['openTab:run']);
    expect(asked).toEqual([{ dispatcherId: 'nearest-car' }, undefined]);
  });
});
