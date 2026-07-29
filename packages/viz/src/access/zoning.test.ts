/**
 * The credential lens — `docs/10-experience-layer-contract.md` § 10.1.
 *
 * Two claims are worth more than the rest and both are asserted against the **shipped** Secure
 * Tower rather than a fixture:
 *
 * 1. *Not served* and *not permitted* are different states, drawn differently, and the
 *    difference survives the colour being taken away. `CLAUDE.md` forbids collapsing the three
 *    kinds of zoning, and a lens that drew them the same way would collapse two of them in the
 *    one place a reader looks.
 * 2. The lens's answer is `core`'s answer. This module re-derives the access index because it
 *    has to run on a document that does not resolve; a re-derivation that disagreed with
 *    `Building.isAccessPermitted` would be a second source of truth about who may travel.
 */

import { Simulation, loadConfig, type AccessZone, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import type { VizFloor } from '../contract/types.js';
import type { ShaftGeometry } from '../render/layout.js';
import {
  CREDENTIAL_STATES,
  LENS_LEGEND,
  LENS_OPERATIONAL_NOTE,
  STATE_GLYPHS,
  STATE_WORDS,
  credentialGroupsIn,
  credentialLensFor,
  describeCredentialLens,
  floorRunsOf,
  permittedGroupsByFloor,
  restrictedFloorIds,
} from './zoning.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 120_000);

function secureTower(): {
  floors: readonly VizFloor[];
  shafts: readonly ShaftGeometry[];
  accessZones: readonly AccessZone[];
} {
  const building = config.buildingsById.get('secure-tower');
  if (building === undefined) throw new Error('secure-tower is missing from data/');
  return {
    floors: building.floors.map((floor) => ({
      id: floor.id,
      index: floor.index,
      heightM: floor.heightM,
      isEntrance: floor.isEntrance === true,
      isTransferFloor: floor.isTransferFloor === true,
      population: floor.population,
    })),
    shafts: building.banks.flatMap((bank) =>
      bank.cars.map((car) => ({
        carId: `${bank.id}-${car.id}`,
        bankId: bank.id,
        label: car.id,
        servedFloorIds: [...bank.servesFloors],
      })),
    ),
    accessZones: building.accessZones,
  };
}

describe('the three states stay three states', () => {
  it('gives each a glyph and a word that no other state shares', () => {
    const glyphs = CREDENTIAL_STATES.map((state) => STATE_GLYPHS[state]);
    const words = CREDENTIAL_STATES.map((state) => STATE_WORDS[state]);
    expect(new Set(glyphs).size).toBe(CREDENTIAL_STATES.length);
    expect(new Set(words).size).toBe(CREDENTIAL_STATES.length);
  });

  it('never reuses the run viewer’s "no car answered" glyph for a zoning fact', () => {
    // `✗` is an *outcome* — a car could legally have come and none did. Neither zoning state may
    // borrow it, or the picture would say a dispatcher failed where a building forbade.
    expect(Object.values(STATE_GLYPHS)).not.toContain('✗');
  });

  it('has one legend row per state, each naming which zoning produced it', () => {
    expect(LENS_LEGEND.map((row) => row.state)).toEqual([...CREDENTIAL_STATES]);
    expect(LENS_LEGEND.find((row) => row.state === 'not-served')?.zoning).toBe('service zoning');
    expect(LENS_LEGEND.find((row) => row.state === 'not-permitted')?.zoning).toBe('access zoning');
    for (const row of LENS_LEGEND) expect(row.sentence.length).toBeGreaterThan(20);
  });

  it('says out loud that operational zoning is not on the lens', () => {
    expect(LENS_OPERATIONAL_NOTE).toContain('Operational zoning');
    expect(LENS_OPERATIONAL_NOTE).toContain('not a property of the building');
  });
});

describe('Secure Tower under one credential at a time', () => {
  it('opens only the executive floor to `exec`, and only that one', () => {
    const { floors, shafts, accessZones } = secureTower();
    const lens = credentialLensFor({ floors, shafts, accessZones, credentialGroup: 'exec' });
    const reachable = lens.rows.filter((row) => row.state === 'reachable').map((row) => row.floorId);
    // G is in no access zone at all, which is Secure Tower's stated design: only the lobby is
    // unrestricted. So `exec` reaches the lobby and floor 30 and nothing else.
    expect(reachable).toEqual(['G', '30']);
    expect(lens.counts['not-permitted']).toBe(28);
    expect(lens.counts['not-served']).toBe(0);
  });

  it('opens every tenant floor to `facilities` and refuses it the executive floor', () => {
    const { floors, shafts, accessZones } = secureTower();
    const lens = credentialLensFor({ floors, shafts, accessZones, credentialGroup: 'facilities' });
    expect(lens.rows.filter((row) => row.state === 'not-permitted').map((row) => row.floorId)).toEqual(
      ['30'],
    );
    // The building's own note: *"there is no universal credential."* The lens shows it.
    expect(lens.counts.reachable).toBe(29);
  });

  it('agrees with `Building.isAccessPermitted` on every (floor, credential) pair', () => {
    const { floors, shafts, accessZones } = secureTower();
    const simulation = new Simulation(fixtureConfig(config, { buildingId: 'secure-tower' }));
    const groups = credentialGroupsIn(accessZones);
    expect(groups.length).toBeGreaterThan(5);

    const disagreements: string[] = [];
    for (const group of groups) {
      const lens = credentialLensFor({ floors, shafts, accessZones, credentialGroup: group });
      for (const row of lens.rows) {
        const core = simulation.building.isAccessPermitted(group, row.floorId);
        if (core !== row.permitted) disagreements.push(`${group}@${row.floorId}`);
      }
    }
    expect(disagreements).toEqual([]);
  }, 60_000);

  it('lists the restricted floors in building order, not in id order', () => {
    const { floors, accessZones } = secureTower();
    const ids = restrictedFloorIds(
      floors.map((floor) => floor.id),
      accessZones,
    );
    expect(ids[0]).toBe('2');
    expect(ids[ids.length - 1]).toBe('30');
    expect(ids).toHaveLength(29);
    // The failure this ordering exists to prevent: `['11','12', … ,'2','20']`.
    expect(ids.slice(0, 3)).toEqual(['2', '3', '4']);
  });

  it('names its restricted floors as runs, in building order, never as arithmetic on the id', () => {
    const { floors, accessZones } = secureTower();
    const ids = floors.map((floor) => floor.id);
    expect(floorRunsOf(ids, restrictedFloorIds(ids, accessZones))).toBe('2–30');
    // A gap makes two runs; a run of two is written out, because `2–3` says less than `2, 3`.
    expect(floorRunsOf(ids, ['2', '3', '4', '9', '10'])).toBe('2–4, 9, 10');
    // The lobby is first in building order and is not restricted, so it never opens a run.
    expect(floorRunsOf(ids, restrictedFloorIds(ids, accessZones)).startsWith('G')).toBe(false);
  });

  it('builds runs from position, not from the id — so non-numeric ids survive', () => {
    const ids = ['B2', 'B1', 'G', 'M', '2', '3'];
    // Positions 0–2 are consecutive; `B2, B1, G` is a run even though nothing about those
    // strings is ordered. A numeric reading would produce nonsense here.
    expect(floorRunsOf(ids, ['B2', 'B1', 'G', '3'])).toBe('B2–G, 3');
  });

  it('offers the credential picker every group the building mentions, de-duplicated', () => {
    const { accessZones } = secureTower();
    const groups = credentialGroupsIn(accessZones);
    expect(new Set(groups).size).toBe(groups.length);
    expect(groups).toContain('facilities');
    expect(groups).toContain('exec-escort');
  });
});

describe('an unrestricted building', () => {
  it('reports every floor reachable, and says so in words', () => {
    const floors: VizFloor[] = [
      { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
      { id: '2', index: 1, heightM: 3, isEntrance: false, isTransferFloor: false, population: 10 },
    ];
    const shafts: ShaftGeometry[] = [
      { carId: 'a-A', bankId: 'a', label: 'A', servedFloorIds: ['G', '2'] },
    ];
    const lens = credentialLensFor({
      floors,
      shafts,
      accessZones: undefined,
      credentialGroup: 'anything',
    });
    expect(lens.counts.reachable).toBe(2);
    expect(describeCredentialLens(lens)).toContain('Every floor is reachable');
    // Absence of a zone means unrestricted — never "permits nobody".
    expect(permittedGroupsByFloor(undefined).size).toBe(0);
  });
});

describe('a floor that fails both ways', () => {
  const floors: VizFloor[] = [
    { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
    { id: '2', index: 1, heightM: 3, isEntrance: false, isTransferFloor: false, population: 10 },
    { id: '3', index: 2, heightM: 6, isEntrance: false, isTransferFloor: false, population: 10 },
  ];
  const shafts: ShaftGeometry[] = [
    { carId: 'a-A', bankId: 'a', label: 'A', servedFloorIds: ['G', '2'] },
  ];
  const accessZones = [
    { id: 'z1', floors: ['2'], credentialGroups: ['staff'] },
    { id: 'z2', floors: ['3'], credentialGroups: ['staff'] },
  ];

  it('reports the physical barrier as the state and keeps the credential fact beside it', () => {
    const lens = credentialLensFor({ floors, shafts, accessZones, credentialGroup: 'visitor' });
    const three = lens.rows.find((row) => row.floorId === '3');
    expect(three?.state).toBe('not-served');
    expect(three?.served).toBe(false);
    expect(three?.permitted).toBe(false);
    expect(three?.alsoNotPermitted).toBe(true);
    // Floor 2 is reached by a shaft and closed to this credential: the *other* barrier.
    const two = lens.rows.find((row) => row.floorId === '2');
    expect(two?.state).toBe('not-permitted');
    expect(two?.alsoNotPermitted).toBe(false);
  });

  it('names both barriers separately in the text alternative, and never merges them', () => {
    const lens = credentialLensFor({ floors, shafts, accessZones, credentialGroup: 'visitor' });
    const text = describeCredentialLens(lens);
    expect(text).toContain('No shaft reaches 3 — service zoning.');
    expect(text).toContain('does not open them — access zoning.');
    expect(text).toContain('fail both ways');
    // The word this repository is not allowed to use for either of them.
    expect(text).not.toContain('unavailable');
  });
});
