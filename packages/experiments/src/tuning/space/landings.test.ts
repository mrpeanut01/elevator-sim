/**
 * **The per-floor panel dimension** — GitHub issue #534 item 5, `DECISIONS.md` § D553 item 8,
 * § D571.
 *
 * Two things are asserted here and the second is the one that matters, because § D553 item 8's
 * whole warning is that a per-floor set is *not* one of the four kinds a generic optimizer
 * understands:
 *
 * 1. **A search can actually sample it.** `sampleCandidate`, `sampleCandidates`,
 *    `defaultCandidate`, `perturbCandidate` and `candidatesEqual` all take this space unchanged and
 *    produce points that decode to real `landingCallType` declarations. A dimension a search cannot
 *    draw from is the `patternSwitching` defect wearing a schema (`CLAUDE.md` § *the standing
 *    requirement*), and this file is what stops that being a claim.
 * 2. **Move the control and require the run to change**, compared on the legs. The default point
 *    decodes to the building exactly as it ships — byte for byte, through the real `runSimulation`
 *    — and flipping one landing moves the legs. Both halves, because a dimension that only ever
 *    moves a run is as untrustworthy as one that never does: the default has to be the identity or
 *    every point in the space means something other than what it says.
 */

import {
  parseBuilding,
  resolveBuilding,
  runSimulation,
  StreamSet,
  loadConfig,
  type DispatcherProfile,
  type LoadedConfig,
  type ResolvedBuilding,
  type SimulationResult,
} from '@elevator-sim/core';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { collectSearchSpace, defaultCandidate } from './collect.js';
import {
  BUTTON_CALL_TYPE,
  LANDING_PANEL_KEY,
  LANDING_SECTION,
  landingCallTypesFrom,
  landingPanelParameterId,
  landingPanelSpaceFor,
  panelCallTypeFor,
  panelCountOf,
  wouldBeHybrid,
  type LandingPanelSpace,
} from './landings.js';
import { candidatesEqual } from './encode.js';
import { perturbCandidate, sampleCandidate, sampleCandidates } from './sample.js';
import type { Candidate } from './types.js';

const DATA_DIR = fileURLToPath(new URL('../../../../../data', import.meta.url));

const FLOOR_IDS = ['G', '2', '3', '4', '5'] as const;
const SEED = 20_260_914;

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 60_000);

const rng = (name = 'landings.test'): ReturnType<StreamSet['derive']> =>
  new StreamSet(SEED).derive(name);

function panelSpace(
  callType: 'up-down-buttons' | 'destination-entry' | 'mobile-credential',
  options: { readonly hasAccessZones?: boolean; readonly callCarriesCredential?: boolean } = {},
): LandingPanelSpace {
  return landingPanelSpaceFor({
    floorIds: [...FLOOR_IDS],
    stage: {
      callType,
      ...(options.callCarriesCredential === undefined
        ? {}
        : { callCarriesCredential: options.callCarriesCredential }),
    },
    ...(options.hasAccessZones === undefined ? {} : { hasAccessZones: options.hasAccessZones }),
  });
}

/* -------------------------------------------------------------------------- *
 * Ids
 * -------------------------------------------------------------------------- */

describe('a landing dimension names its floor and nothing else', () => {
  it('spells one out, so a renamed key is a visible change rather than a silent one', () => {
    for (const floorId of FLOOR_IDS) {
      expect(landingPanelParameterId(floorId)).toBe(
        `${LANDING_SECTION}.${floorId}.${LANDING_PANEL_KEY}`,
      );
    }
    // The id is what a stored candidate carries, and stage 2 extends these ids rather than
    // replacing them (§ D571 clause 2), so the literal form is asserted once rather than derived.
    expect(landingPanelParameterId('B1')).toBe('landings.B1.destinationPanel');
  });

  it('is not a member of the dispatcher space, in both directions', () => {
    // § D553 item 8: a floor id is a building's, so `collectSearchSpace`'s membership rule — *a
    // dispatcher profile can hold this id* — must exclude it. Asserted rather than assumed, because
    // an id that leaked in would be searched and then written into a profile that cannot hold it.
    const dispatcher = collectSearchSpace();
    for (const floorId of FLOOR_IDS) {
      expect(dispatcher.byId.has(landingPanelParameterId(floorId))).toBe(false);
    }
    expect(dispatcher.ids.some((id) => id.startsWith(`${LANDING_SECTION}.`))).toBe(false);
    // …and this space carries exactly the landings it was given, in building order.
    expect(panelSpace('up-down-buttons').space.ids).toEqual(
      FLOOR_IDS.map((floorId) => landingPanelParameterId(floorId)),
    );
  });

  it('refuses a building that declares a floor twice', () => {
    expect(() =>
      landingPanelSpaceFor({ floorIds: ['G', '2', 'G'], stage: { callType: 'up-down-buttons' } }),
    ).toThrow(/twice/);
  });
});

/* -------------------------------------------------------------------------- *
 * What the two values mean
 * -------------------------------------------------------------------------- */

describe('the fixture a panel landing declares is a function of the dispatcher', () => {
  it('keeps the dispatcher’s own call type where it carries a destination', () => {
    expect(panelCallTypeFor({ callType: 'mobile-credential' }, false)).toBe('mobile-credential');
    expect(panelCallTypeFor({ callType: 'destination-entry' }, false)).toBe('destination-entry');
  });

  it('uses a reader where the dispatcher’s own call type carries none', () => {
    expect(panelCallTypeFor({ callType: 'up-down-buttons' }, false)).toBe('mobile-credential');
    expect(panelCallTypeFor({ callType: 'up-down-buttons' }, true)).toBe('mobile-credential');
  });

  it('avoids the one pairing C35 is open on: a destination call with no credential, beside zones', () => {
    const bare = { callType: 'destination-entry' as const, callCarriesCredential: false };
    expect(panelCallTypeFor(bare, true)).toBe('mobile-credential');
    // …and only beside zones. Without restricted landings the kiosk has nobody to lock out.
    expect(panelCallTypeFor(bare, false)).toBe('destination-entry');
    // A kiosk whose calls *do* carry a credential — a panel dispatcher — keeps its own fixture.
    expect(
      panelCallTypeFor({ callType: 'destination-entry', callCarriesCredential: true }, true),
    ).toBe('destination-entry');
  });

  it('declares a button as a button under every dispatcher', () => {
    for (const callType of ['up-down-buttons', 'destination-entry', 'mobile-credential'] as const) {
      expect(panelSpace(callType).buttonCallType).toBe(BUTTON_CALL_TYPE);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * A search can sample it
 * -------------------------------------------------------------------------- */

describe('the dimension is one a generic search can draw from', () => {
  it('draws a point per landing, from the caller’s stream, reproducibly', () => {
    const panels = panelSpace('mobile-credential');
    const first = sampleCandidate(panels.space, rng(), { validate: false });
    const second = sampleCandidate(panels.space, rng(), { validate: false });
    expect(first.size).toBe(FLOOR_IDS.length);
    expect(candidatesEqual(first, second)).toBe(true);
    // No global RNG anywhere in the path (CLAUDE.md invariant 2): a different stream, a different
    // point — and this is the assertion that would fail if one crept in.
    expect(candidatesEqual(first, sampleCandidate(panels.space, rng('other'), { validate: false }))).toBe(
      false,
    );
  });

  it('reaches mixtures rather than only the two corners', () => {
    const panels = panelSpace('mobile-credential');
    const drawn = sampleCandidates(panels.space, rng(), 64, { validate: false });
    const counts = drawn.map((candidate) => panelCountOf(panels, candidate));
    expect(Math.min(...counts)).toBeLessThan(FLOOR_IDS.length);
    expect(Math.max(...counts)).toBeGreaterThan(0);
    expect(counts.some((count) => count > 0 && count < FLOOR_IDS.length)).toBe(true);
  });

  it('takes a neighbour of a point, which is one landing changing its mind', () => {
    const panels = panelSpace('mobile-credential');
    const base = defaultCandidate(panels.space);
    const neighbour = perturbCandidate(panels.space, base, rng(), { step: 0.3, validate: false });
    expect(candidatesEqual(base, neighbour)).toBe(false);
  });

  it('counts the panels, which is the quantity a per-panel price multiplies', () => {
    const panels = panelSpace('mobile-credential');
    const none: Candidate = new Map(FLOOR_IDS.map((id) => [landingPanelParameterId(id), false]));
    const all: Candidate = new Map(FLOOR_IDS.map((id) => [landingPanelParameterId(id), true]));
    const lobby: Candidate = new Map([[landingPanelParameterId('G'), true]]);
    expect(panelCountOf(panels, none)).toBe(0);
    expect(panelCountOf(panels, all)).toBe(FLOOR_IDS.length);
    // A partial candidate takes the space's defaults for what it omits, so a subspace draw still
    // decodes to a whole building. Under a destination dispatcher the default is a panel.
    expect(panelCountOf(panels, lobby)).toBe(FLOOR_IDS.length);
    expect(panelCountOf(panelSpace('up-down-buttons'), lobby)).toBe(1);
  });

  it('says whether a point is hybrid, and only where the dispatcher names cars', () => {
    const panels = panelSpace('mobile-credential');
    const mixed: Candidate = new Map(
      FLOOR_IDS.map((id, index) => [landingPanelParameterId(id), index === 0]),
    );
    const all: Candidate = new Map(FLOOR_IDS.map((id) => [landingPanelParameterId(id), true]));
    const none: Candidate = new Map(FLOOR_IDS.map((id) => [landingPanelParameterId(id), false]));
    expect(wouldBeHybrid(panels, mixed, true)).toBe(true);
    // The corners are uniform runs, not hybrids, and a dispatcher that assigns nobody makes every
    // landing conventional whatever its fixture discloses — `landingPassengerModelOf`'s own rule.
    expect(wouldBeHybrid(panels, all, true)).toBe(false);
    expect(wouldBeHybrid(panels, none, true)).toBe(false);
    expect(wouldBeHybrid(panels, mixed, false)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * Move the control and require the run to change
 * -------------------------------------------------------------------------- */

/** A six-floor, two-car building: small enough to run in milliseconds, big enough to allocate. */
function tower(landings: Readonly<Record<string, string>> = {}): ResolvedBuilding {
  const authored = {
    id: 'landing-space-tower',
    name: 'Landing space tower',
    type: 'office',
    trafficProfile: 'office-standard',
    floors: [
      { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
      { id: '2', index: 2, heightM: 4, population: 60 },
      { id: '3', index: 3, heightM: 8, population: 60 },
      { id: '4', index: 4, heightM: 12, population: 60 },
      { id: '5', index: 5, heightM: 16, population: 60 },
    ].map((floor) => ({
      ...floor,
      ...(landings[floor.id] === undefined ? {} : { landingCallType: landings[floor.id] }),
    })),
    totalPopulation: 240,
    banks: [
      {
        id: 'main',
        servesFloors: ['G', '2', '3', '4', '5'],
        cars: [
          { id: 'A', spec: 'geared-traction', ratedSpeedMps: 1.6, ratedLoadLb: 2500, doorType: 'centerOpening' },
          { id: 'B', spec: 'geared-traction', ratedSpeedMps: 1.6, ratedLoadLb: 2500, doorType: 'centerOpening' },
        ],
      },
    ],
    accessZones: [],
  };
  return resolveBuilding(parseBuilding(authored, 'landing-space-tower.json'), config.elevatorSpecs, {
    file: 'landing-space-tower.json',
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
  });
}

function panelProfile(): DispatcherProfile {
  const base = config.dispatcherProfilesById.get('destination-panel');
  if (base === undefined) throw new Error('missing dispatcher fixture "destination-panel"');
  return base;
}

/**
 * The demand this file's two runs are taken at, **chosen by measurement rather than by taste**.
 *
 * Whether removing one landing's panel moves the legs is seed- and load-dependent, which § D553
 * records as an observation rather than a mechanism (`sim/landingPanels.test.ts` AC4's last case
 * pins both halves at two neighbouring seeds). Swept here over three arrival rates × six seeds on
 * this fixture: at **8 %** and {@link SEED} no single flip moves anything, at 15 % one or two
 * landings do, and at **25 %** four of the five do — including `G`, which is the landing the case
 * below flips. So the rate is 25 and the reason is a sweep, not a preference.
 *
 * The identity half is not seed-dependent at all: the default point reproduced the undeclared
 * building at every one of those eighteen cells.
 */
const ARRIVAL_RATE_PCT_POP_5MIN = 25;

function run(building: ResolvedBuilding): SimulationResult {
  return runSimulation({
    building,
    dispatcherProfile: panelProfile(),
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: SEED,
    durationS: 900,
    reportWindow: 'full-run',
    demand: { arrivalRatePctPop5min: ARRIVAL_RATE_PCT_POP_5MIN },
    onTimeout: 'report',
  });
}

/** Every leg's car and boarding instant — the trajectory, not a statistic over it. */
function trajectory(result: SimulationResult): string {
  return result.record.passengers
    .map((leg) => `${leg.passengerId}:${leg.carId ?? '-'}:${String(leg.boardedAt)}`)
    .join('|');
}

describe('the dimension reaches a run', () => {
  it('decodes its default point to the building exactly as it ships', () => {
    const panels = panelSpace('mobile-credential');
    const declared = landingCallTypesFrom(panels, defaultCandidate(panels.space));
    // Every landing, and every one of them the dispatcher's own fixture — which § D553 clause 1
    // says is the same building. `core`'s `sim/landingPanelIdentity.test.ts` holds that byte for
    // byte over every shipped building; here it is held on the run this space produces.
    expect(Object.keys(declared).sort()).toEqual([...FLOOR_IDS].sort());
    for (const floorId of FLOOR_IDS) expect(declared[floorId]).toBe('mobile-credential');
    expect(trajectory(run(tower(declared)))).toBe(trajectory(run(tower())));
  }, 60_000);

  it('moves the legs when one landing loses its panel', () => {
    const panels = panelSpace('mobile-credential');
    const base = defaultCandidate(panels.space);
    const flipped: Candidate = new Map([...base, [landingPanelParameterId('G'), false]]);
    const declared = landingCallTypesFrom(panels, flipped);
    expect(declared['G']).toBe(BUTTON_CALL_TYPE);
    expect(panelCountOf(panels, flipped)).toBe(FLOOR_IDS.length - 1);

    const moved = run(tower(declared));
    expect(trajectory(moved)).not.toBe(trajectory(run(tower())));
    // …and the run says what it became: a mixture, named landing by landing.
    expect(moved.comparability.passengerModel).toBe('hybrid');
    expect(moved.comparability.assigningFloorIds).toEqual(['2', '3', '4', '5']);
    expect(wouldBeHybrid(panels, flipped, true)).toBe(true);
  }, 60_000);
});
