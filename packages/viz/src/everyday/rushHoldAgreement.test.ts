/**
 * **A player's rush meets the crowd the server replays** — the viewer's half of the agreement PR
 * #513's review asked for (finding 1), on every shipped building.
 *
 * ## What was wrong, measured
 *
 * `EverydayHost.startRush` sized the stream from `dev/state.ts#resolvedBuildingOf` on the state the
 * player was **standing in** — their own week, grown to its day and handed over by its contract —
 * while the run it started was the rush's own week, in endless play, on the building as authored.
 * So the rate was a function of the player: Midtown Office under collective held **664 s** from a
 * day-1 `c2` week (occupancy 0.395, 684 people read for the rate against 1 710 in the run),
 * **962 s** from the same week on day 5, and **1 640 s** from Free Play — and only the last is what
 * the server replays. Chancery House diverged the same way through `c6`'s occupancy of 1.06. And
 * because growth is 11 % a day on every tower, **every** building's crowd moved once a player's
 * week was past its first day; the ten cells that agreed in the review agreed because the probe
 * stood on day 1.
 *
 * The crowd a rush sends has to be a function of the building, the rush's one seed and the
 * modifier set only: the board is keyed on the building and the date, and the rule that everybody
 * on it met the same crowd is what a board row means.
 *
 * ## The two halves
 *
 * The first `describe` is the property, with no simulation: from three standings a player can be in
 * on every shipped tower, the rate the press writes is the shipped building's. The second plays
 * every cell of `packages/server/src/leaderboard/rushHoldAgreement.json` through the press a player
 * makes and reads the stage's own hold line; `rushHoldAgreement.test.ts` beside that table replays
 * the same cells through the server's `rushRoundConfigFor`. The table is read as a file rather than
 * imported, on `scope/runIdentity.test.ts`'s precedent for reading `packages/server`'s
 * `submission.ts`: this package may not import that one.
 */

import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, type LoadedConfig, type RunInterventionConfig } from '@elevator-sim/core';

import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher, type ViewerState } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { switchTargetFromWire, type WireIntervention } from '../scope/switchWire.js';

import { createEverydayHost, type EverydayHostBindings } from './host.js';
import { RUSH_SEED, rushHoldAt, rushTopRatePctPop5min } from './rush.js';

const TABLE_URL = new URL('../../../server/src/leaderboard/rushHoldAgreement.json', import.meta.url);

interface AgreementCell {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly interventions?: readonly WireIntervention[];
  readonly heldS: number | null;
}

const table = JSON.parse(readFileSync(TABLE_URL, 'utf8')) as { readonly cells: readonly AgreementCell[] };

let config: LoadedConfig;
let resources: BrowserResources;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  resources = {
    priceSchedule: shippedPriceSchedule(),
    elevatorSpecs: config.elevatorSpecs,
    trafficProfiles: config.trafficProfiles,
    dispatcherProfiles: config.dispatcherProfiles,
    buildings: config.buildings,
    entries: config.buildings.map((building) => ({ file: `${building.id}.json`, config: building.config, resolved: building })),
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
});

/** Standing on `buildingId` the way a player arrives there: its own contract's week, on day 1. */
function standingOn(buildingId: string, dispatcherId = 'collective'): ViewerState {
  return withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, buildingId), resources, dispatcherId);
}

/** *Start the rush*, pressed through `EverydayHost` exactly as `rushScreen.ts` presses it. */
function pressedRush(standing: ViewerState): ViewerState {
  let state = standing;
  const bindings = {
    resources,
    state: () => state,
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
    ghostRace: () => ({ pick: 'none', rival: undefined, refusal: undefined, pending: false }),
    raceAgainst: () => undefined,
    loadReferenceRuns: () => Promise.resolve([]),
    simulateRecord: () => {
      throw new Error('the rush press asks for no simulation of its own');
    },
    enterWatch: () => undefined,
    stopWatching: () => undefined,
    playThisCrowd: () => undefined,
    watching: () => undefined,
    dailyBoard: undefined,
    bankCompletion: () => undefined,
    onChange: () => () => undefined,
  } as unknown as EverydayHostBindings;
  const refusal = createEverydayHost(bindings).startRush();
  if (refusal !== undefined) throw new Error(`the rush would not start: ${refusal}`);
  return state;
}

describe('a rush’s crowd is a function of the building alone — PR #513, finding 1', () => {
  it('writes the shipped building’s rate from any week a player stands in, on every shipped tower', () => {
    const mismatches: string[] = [];
    for (const shipped of config.buildings) {
      const own = standingOn(shipped.id);
      const standings: readonly (readonly [string, ViewerState])[] = [
        [`its own week (${own.week.contractId}) on day 1`, own],
        [`its own week (${own.week.contractId}) on day 5`, { ...own, week: { ...own.week, day: 5 } }],
        ['Free Play', { ...own, playMode: 'free-play' }],
      ];
      const expected = rushTopRatePctPop5min(shipped.totalPopulation);
      for (const [label, standing] of standings) {
        const rate = pressedRush(standing).freePlay?.arrivalRatePctPop5min;
        if (rate !== expected) mismatches.push(`${shipped.id} from ${label}: ${String(rate)} where the building says ${String(expected)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe('the rush hold agreement table — the viewer’s half (PR #513, finding 1)', () => {
  it('covers every shipped building', () => {
    expect([...new Set(table.cells.map((cell) => cell.buildingId))].sort()).toEqual(config.buildings.map((building) => building.id).sort());
  });

  it.each(table.cells.map((cell) => [`${cell.buildingId} ${cell.dispatcherProfileId}${cell.interventions === undefined ? '' : ' logged'}`, cell] as const))(
    '%s',
    (label, cell) => {
      const pressed = pressedRush(standingOn(cell.buildingId, cell.dispatcherProfileId));
      const log: RunInterventionConfig[] = (cell.interventions ?? []).map((entry) => {
        if (entry.change.kind !== 'switch-dispatcher') return { atS: entry.atS, change: { kind: entry.change.kind } } as RunInterventionConfig;
        const profile = switchTargetFromWire(entry.change, resources.dispatcherProfiles.profiles);
        if (profile === undefined) throw new Error(`${label}: no shipped dispatcher "${entry.change.toProfileId}"`);
        return { atS: entry.atS, change: { kind: 'switch-dispatcher', profile } };
      });
      const plan = shiftRunConfigOf(resources, log.length === 0 ? pressed : { ...pressed, interventions: log });
      const { recording } = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds });
      expect(recording.startedAt).toBe(0);
      const hold = rushHoldAt(recording);
      expect(hold === undefined ? null : hold - recording.startedAt, `${label}: a player's rush does not hold where the server's replay does`).toBe(cell.heldS);
    },
  );
});
