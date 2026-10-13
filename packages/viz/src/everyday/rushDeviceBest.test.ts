/**
 * **This device's best rush sitting: kept across reloads, replayed from its causes, drawn among the
 * house's rows on a build with no board** — [§ D1420](../../../../DECISIONS.md), swarm DS's Q3 ruling.
 *
 * Red on the base: none of this existed. The rush kept its best *"since this page opened"*
 * (`EverydayHost.rushBestThisVisit`), a reload took it, and with no server no row of the player's
 * stood among the house's.
 *
 * The replay arm is the claim that matters: the row's figure is the replay's, never the kept one, so
 * the case plays the house's own cell (the player's path, `rushHouse.test-helper.ts`) and requires
 * the replay of a sitting built from that round's causes to hold exactly where the house table says
 * it held, whatever figure the record carries beside it.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher, type ViewerState } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { createEverydayHost, type EverydayHostBindings } from './host.js';
import { RUSH_SEED, rushHoldAt } from './rush.js';
import {
  RUSH_DEVICE_BEST_KEY,
  RUSH_DEVICE_COPY,
  RUSH_DEVICE_REPLAY_REFUSAL,
  decodeRushDeviceBest,
  emptyRushDeviceBest,
  encodeRushDeviceBest,
  rushDeviceReplayOf,
  rushDeviceSittingOf,
  withRushDeviceBest,
  type RushDeviceStanding,
} from './rushDeviceBest.js';
import { createRushDeviceStore } from './rushDeviceStore.js';
import { createDeviceChimeStore } from './chimeStore.js';
import { RUSH_SITTING_COPY } from './rushSitting.js';
import { RUSH_FITTED_DEVICE_LINE, rushFittedLineOf } from './rushScreenModel.js';
import { RUSH_HOUSE_TABLE, rushStandingsOf } from './rushHouse.js';
import { browserResourcesFrom } from './rushHouse.test-helper.js';
import type { RushSittingBody } from './rushSitting.js';

let config: LoadedConfig;
let resources: BrowserResources;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  resources = browserResourcesFrom(config);
}, 120_000);

const BUILDING = 'garden-apartments';

/** The house's own cell on the smallest tower: the player's path, measured and pinned. */
function houseHeldS(): number {
  const run = RUSH_HOUSE_TABLE.runs.find((entry) => entry.buildingId === BUILDING && entry.dispatcherId === 'collective');
  if (run?.brokeAtS === null || run?.brokeAtS === undefined) throw new Error('the house cell never broke');
  return run.brokeAtS;
}

function oneRound(claimedHeldS: number | null, extra: Partial<RushSittingBody['rounds'][number]> = {}): RushSittingBody {
  return { buildingId: BUILDING, rounds: [{ dispatcherProfileId: 'collective', claimedHeldS, ...extra }] };
}

/** The replay's hold, seconds from the round's start — what the row draws. */
function replayedHeldS(body: RushSittingBody): number | undefined {
  const replay = rushDeviceReplayOf(resources, body);
  if (typeof replay === 'string') throw new Error(replay);
  const { recording } = recordRun(replay.config, { recordDecisions: false, outOfServiceCarIds: replay.outOfServiceCarIds });
  const at = rushHoldAt(recording);
  return at === undefined ? undefined : at - recording.startedAt;
}

describe('the record keeps one sitting per tower, the better one, and survives a reload — § D1420', () => {
  it('keeps a first sitting, keeps a better one, and leaves a worse one alone by identity', () => {
    const first = withRushDeviceBest(emptyRushDeviceBest(), BUILDING, oneRound(600), 600);
    expect(rushDeviceSittingOf(first, BUILDING)?.keptHeldS).toBe(600);
    expect(withRushDeviceBest(first, BUILDING, oneRound(500), 500)).toBe(first);
    const better = withRushDeviceBest(first, BUILDING, oneRound(700), 700);
    expect(rushDeviceSittingOf(better, BUILDING)?.keptHeldS).toBe(700);
    expect(better.sittings).toHaveLength(1);
    /* Another tower is another slot. */
    const other = withRushDeviceBest(better, 'midtown-office', { ...oneRound(10), buildingId: 'midtown-office' }, 10);
    expect(other.sittings.map((sitting) => sitting.buildingId).sort()).toEqual([BUILDING, 'midtown-office']);
    /* A body for another tower, or with no rounds, is not kept under this one. */
    expect(withRushDeviceBest(first, 'midtown-office', oneRound(900), 900)).toBe(first);
    expect(withRushDeviceBest(first, BUILDING, { buildingId: BUILDING, rounds: [] }, 900)).toBe(first);
  });

  it('reads back what it wrote, and quarantines what this build cannot read', () => {
    const kept = withRushDeviceBest(emptyRushDeviceBest(), BUILDING, oneRound(600), 600);
    expect(decodeRushDeviceBest(encodeRushDeviceBest(kept))).toEqual({ record: kept, refused: false });
    for (const bad of ['{', '[]', '{"version":2,"sittings":[]}', '{"version":1,"sittings":[{"buildingId":"x"}]}']) {
      expect(decodeRushDeviceBest(bad).refused, bad).toBe(true);
    }
    expect(decodeRushDeviceBest(null)).toEqual({ record: emptyRushDeviceBest(), refused: false });
  });

  it('a store over the same backing reads the sitting back after a reload', () => {
    const slots = new Map<string, string>();
    const backing = {
      read: (key: string) => slots.get(key) ?? null,
      write: (key: string, value: string) => {
        slots.set(key, value);
      },
      remove: (key: string) => {
        slots.delete(key);
      },
    };
    expect(createRushDeviceStore(backing).offer(BUILDING, oneRound(600), 600)).toBe(true);
    expect(slots.has(RUSH_DEVICE_BEST_KEY)).toBe(true);
    const reloaded = createRushDeviceStore(backing);
    expect(rushDeviceSittingOf(reloaded.record(), BUILDING)?.body).toEqual(oneRound(600));
  });
});

describe('the row’s figure is a replay of the sitting’s causes, never a kept figure — § D1420', () => {
  it('replays a one-round sitting to exactly where the house’s own run of it held', () => {
    expect(replayedHeldS(oneRound(houseHeldS()))).toBe(houseHeldS());
  }, 120_000);

  it('a hand-edited figure moves nothing drawn: the replay holds where the round held', () => {
    expect(replayedHeldS(oneRound(99_999))).toBe(houseHeldS());
  }, 120_000);

  it('a rebuild bought before the last round reaches its replay, so the fit is folded and not dropped', () => {
    const rebuilt: RushSittingBody = {
      buildingId: BUILDING,
      rounds: [
        { dispatcherProfileId: 'collective', claimedHeldS: houseHeldS() },
        { dispatcherProfileId: 'collective', claimedHeldS: null, rebuild: ['faster-doors'] },
      ],
    };
    expect(replayedHeldS(rebuilt)).not.toBe(houseHeldS());
  }, 120_000);

  it('refuses, with its reason, a sitting naming what this build does not ship', () => {
    expect(rushDeviceReplayOf(resources, { buildingId: 'nowhere', rounds: [{ dispatcherProfileId: 'collective', claimedHeldS: 1 }] })).toBe(
      RUSH_DEVICE_REPLAY_REFUSAL.building,
    );
    expect(rushDeviceReplayOf(resources, oneRound(1, { dispatcherProfileId: 'no-such-profile' }))).toBe(RUSH_DEVICE_REPLAY_REFUSAL.dispatcher);
    expect(
      rushDeviceReplayOf(resources, {
        buildingId: BUILDING,
        rounds: [
          { dispatcherProfileId: 'collective', claimedHeldS: 1 },
          { dispatcherProfileId: 'collective', claimedHeldS: 1, rebuild: ['not-on-the-menu'] },
        ],
      }),
    ).toBe(RUSH_DEVICE_REPLAY_REFUSAL.rebuild);
  });
});

describe('the host keeps and answers it only where there is no rush board — § D1420', () => {
  function hostWith(board: boolean, store = createRushDeviceStore(undefined)) {
    const state = initialState(resources, 1n);
    const bindings = {
      resources,
      state: () => state,
      onChange: () => () => undefined,
      rushDeviceBest: store,
      ...(board ? { readRushPosted: () => Promise.resolve({ kind: 'silent' as const }) } : {}),
      simulateRecord: (cfg: Parameters<EverydayHostBindings['simulateRecord']>[0], done: (recording: never) => void, _failed: unknown, out: readonly string[]) => {
        done(recordRun(cfg, { recordDecisions: false, outOfServiceCarIds: out }).recording as never);
      },
    } as unknown as EverydayHostBindings;
    return { host: createEverydayHost(bindings), store };
  }

  it('answers silent on a build with a board, none with nothing kept, and the replayed row otherwise', async () => {
    expect(await hostWith(true).host.rushDeviceBest(BUILDING)).toEqual({ kind: 'silent' });
    expect(await hostWith(false).host.rushDeviceBest(BUILDING)).toEqual({ kind: 'none' });
    const store = createRushDeviceStore(undefined);
    store.offer(BUILDING, oneRound(99_999), 99_999);
    const answer = await hostWith(false, store).host.rushDeviceBest(BUILDING);
    expect(answer).toEqual({ kind: 'row', heldS: houseHeldS(), roundCount: 1, modifiers: [] });
  }, 120_000);

  /** A rush pressed and its first round played to its line, the way `rushHoldAgreement.test.ts` presses one. */
  function playedRound(board: boolean, store = createRushDeviceStore(undefined)) {
    let state: ViewerState = withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, BUILDING), resources, 'collective');
    const bindings = {
      resources,
      state: () => state,
      rushDeviceBest: store,
      ...(board ? { readRushPosted: () => Promise.resolve({ kind: 'silent' as const }) } : {}),
      applyPatch: (patch: Partial<ViewerState>) => {
        state = { ...state, ...patch };
      },
      startRun: () => undefined,
      playheadS: () => 0,
      dayClosed: () => false,
      runIsOwn: () => false,
      playerHasChosen: () => false,
      dayStartS: () => undefined,
      intervene: () => undefined,
      closeDay: () => undefined,
      openRunTab: () => undefined,
      bankCompletion: undefined,
      onChange: () => () => undefined,
    } as unknown as EverydayHostBindings;
    const host = createEverydayHost(bindings);
    const refusal = host.startRush();
    if (refusal !== undefined) throw new Error(refusal);
    const run = shiftRunConfigOf(resources, state);
    state = { ...state, recording: recordRun(run.config, { recordDecisions: false, outOfServiceCarIds: run.outOfServiceCarIds }).recording };
    const holdAtS = host.rush()?.holdAtS;
    if (holdAtS === undefined) throw new Error('the round never crossed its line');
    host.endRush(holdAtS);
    /* The read settles the round, which is when a round is recorded. */
    host.rush();
    return store;
  }

  it('keeps a played sitting on a build with no board, and none on a build with one', () => {
    const kept = rushDeviceSittingOf(playedRound(false).record(), BUILDING);
    expect(kept?.body.rounds).toHaveLength(1);
    expect(kept?.body.rounds[0]?.dispatcherProfileId).toBe('collective');
    expect(kept?.keptHeldS).toBe(houseHeldS());
    expect(rushDeviceSittingOf(playedRound(true).record(), BUILDING)).toBeUndefined();
  }, 120_000);

  it('draws the replayed row among the house’s, tagged as this device’s, under a line that says it was posted nowhere', () => {
    const device: RushDeviceStanding = { kind: 'row', heldS: houseHeldS(), roundCount: 1, modifiers: [] };
    const drawn = rushStandingsOf(BUILDING, () => undefined, RUSH_HOUSE_TABLE, undefined, { kind: 'silent' }, device);
    if (drawn.kind !== 'rows') throw new Error(drawn.kind);
    expect(drawn.yours).toHaveLength(1);
    expect(drawn.yours[0]?.tag).toBe(RUSH_DEVICE_COPY.tag);
    expect(drawn.yours[0]?.name).toBe(RUSH_DEVICE_COPY.name);
    expect(drawn.yoursLine).toBe(RUSH_DEVICE_COPY.note);
    expect(drawn.yoursLine).toMatch(/posted nowhere, no server checked it, and it is ranked against nobody/u);
    /* A build with a board draws § D1359's line and never this device's row. */
    const served = rushStandingsOf(BUILDING, () => undefined, RUSH_HOUSE_TABLE, undefined, { kind: 'signed-out' }, device);
    if (served.kind !== 'rows') throw new Error(served.kind);
    expect(served.yours).toEqual([]);
    /* Nothing kept, and a kept sitting this build cannot replay, each say so. */
    const none = rushStandingsOf(BUILDING, () => undefined, RUSH_HOUSE_TABLE, undefined, { kind: 'silent' }, { kind: 'none' });
    expect(none.kind === 'rows' ? none.yoursLine : undefined).toBe(RUSH_DEVICE_COPY.none);
    const unreplayable = rushStandingsOf(BUILDING, () => undefined, RUSH_HOUSE_TABLE, undefined, { kind: 'silent' }, {
      kind: 'unreplayable',
      reason: RUSH_DEVICE_REPLAY_REFUSAL.building,
    });
    expect(unreplayable.kind === 'rows' ? unreplayable.yoursLine : undefined).toBe(
      RUSH_DEVICE_COPY.unreplayable(RUSH_DEVICE_REPLAY_REFUSAL.building),
    );
  });
});

/*
 * **A pre-fit bought from this device's tally starts this device's sitting fitted, and that sitting is
 * never offered for posting** — [§ D1418](../../../../DECISIONS.md). Red on the base: with no server the
 * press answered `no-server` and the sitting started as built.
 */
describe('a rush pre-fit bought on the device reaches the run and is never posted — § D1418', () => {
  function started(buy: boolean): { readonly legs: string; readonly fitted: boolean; readonly check: ReturnType<ReturnType<typeof createEverydayHost>['rush']> } {
    const chimes = createDeviceChimeStore(undefined);
    for (const id of ['a', 'b', 'c']) chimes.bank({ completion: 'scenario-cleared', scenarioId: `case-${id}` });
    let state: ViewerState = withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, BUILDING), resources, 'collective');
    const bindings = {
      resources,
      state: () => state,
      deviceChimes: chimes,
      chimeHome: () => 'device' as const,
      applyPatch: (patch: Partial<ViewerState>) => {
        state = { ...state, ...patch };
      },
      startRun: () => undefined,
      playheadS: () => 0,
      dayClosed: () => false,
      runIsOwn: () => false,
      playerHasChosen: () => false,
      dayStartS: () => undefined,
      intervene: () => undefined,
      closeDay: () => undefined,
      openRunTab: () => undefined,
      bankCompletion: undefined,
      onChange: () => () => undefined,
    } as unknown as EverydayHostBindings;
    const host = createEverydayHost(bindings);
    /* The device charge runs before the press's first await, so the purchase is held on return. */
    if (buy) void host.spendChime('rush-prefit', 1);
    fittedLine = rushFittedLineOf(host);
    const refusal = host.startRush();
    if (refusal !== undefined) throw new Error(refusal);
    const config = shiftRunConfigOf(resources, state);
    const { recording } = recordRun(config.config, { recordDecisions: false, outOfServiceCarIds: config.outOfServiceCarIds });
    state = { ...state, recording };
    const holdAtS = host.rush()?.holdAtS;
    if (holdAtS !== undefined) host.endRush(holdAtS);
    return {
      legs: JSON.stringify(recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1])),
      fitted: state.campaignFitOut !== undefined,
      check: host.rush(),
    };
  }

  let fittedLine: string | undefined;

  it('fits the tower, moves the legs, and refuses the post with its reason', () => {
    const asBuilt = started(false);
    expect(fittedLine).toBeUndefined();
    const fitted = started(true);
    /*
     * Wave AP lane AP-D2, the post-AO panel's seat D (D9): the setup screen's line said *posted to its
     * own board* over this sitting, whose post is refused. Red before: it drew RUSH_FITTED_LINE.
     */
    expect(fittedLine).toBe(RUSH_FITTED_DEVICE_LINE);
    expect(fittedLine).toContain('never posted');
    expect(asBuilt.fitted).toBe(false);
    expect(fitted.fitted).toBe(true);
    expect(fitted.legs).not.toBe(asBuilt.legs);
    expect(fitted.check?.check.ok).toBe(false);
    expect(fitted.check?.check.ok === false ? fitted.check.check.reasons : []).toContain(RUSH_SITTING_COPY.boughtOnDevice);
    expect(asBuilt.check?.check.ok === false ? asBuilt.check.check.reasons : []).not.toContain(RUSH_SITTING_COPY.boughtOnDevice);
  }, 120_000);
});
