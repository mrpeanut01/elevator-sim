/**
 * The right rail's four plates, driven over the shipped `data/` rather than over a fixture.
 *
 * The claim these plates make is *this is what is running*, and a fixture would prove that a
 * fixture renders. So every case below resolves a real profile, a real building or the real
 * `data/elevator-specs.json`, which is the same argument `fixtures.test-helper.ts` makes.
 *
 * What is asserted, beyond the shapes:
 *
 * 1. **The dispatcher plate reads the resolved profile.** `collective` declares no `idle` block
 *    and still parks somewhere; a plate reading the authored object would print nothing about it.
 * 2. **The building plate omits handling capacity when there is no run**, and says so rather than
 *    computing the nominal round trip the handoff's prototype computes (`docs/12` § 4.2).
 * 3. **The nameplate is engineer-only** (§ 1.4 R3), and its 80 % fill row is read from
 *    `conventions.designLoadFactor` rather than written out.
 * 4. **The machine-class line is an advisory.** `config/parse.ts` raises the envelope finding as a
 *    warning and builds the bank anyway, so no string here may say the loader refuses.
 * 5. **No plate value contains a figure `meansAreSuppressed` refuses**, driven on a real saturated
 *    Vertical City run.
 */

import {
  loadConfig,
  type DispatcherProfile,
  type LoadedConfig,
  type TrafficProfiles,
} from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';
import { DEFAULT_PATTERN, specFromTrafficProfile } from '../authoring/patternSpec.js';
import { probabilityWordIn } from '../campaign/words.js';
import type { VizRecording } from '../contract/types.js';
import { DATA_DIR, breadthConfig, requireBuilding } from '../fixtures.test-helper.js';
import { meansAreSuppressed } from '../frame/overlay.js';
import { recordRun } from '../record/recordRun.js';

import type { BrowserResources } from './data.js';
import type { PlateEntry } from './dom.js';
import {
  buildingPlateOf,
  dispatcherBlurbOf,
  dispatcherFamilyOf,
  dispatcherNoteOf,
  dispatcherPlateOf,
  machineWarningOf,
  nameplateOf,
  nameplateVisibleIn,
  patternOptionsOf,
  trafficPlateOf,
} from './rightRail.js';

let config: LoadedConfig;
let classes: readonly MachineClass[];

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  classes = classesFromSpecs(config.elevatorSpecs);
}, 600_000);

function profile(id: string): DispatcherProfile {
  const found = config.dispatcherProfilesById.get(id);
  if (found === undefined) throw new Error(`data/dispatcher-profiles.json has no "${id}".`);
  return found;
}

function machineClass(id: string): MachineClass {
  const found = classes.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`data/elevator-specs.json has no class "${id}".`);
  return found;
}

const valueOf = (rows: readonly PlateEntry[], key: string): string | undefined =>
  rows.find((row) => row.k === key)?.v;

/* -------------------------------------------------------------------------- *
 * Dispatcher
 * -------------------------------------------------------------------------- */

describe('dispatcherPlateOf', () => {
  it('draws the eight rows the design draws, in its order', () => {
    expect(dispatcherPlateOf(profile('collective')).map((row) => row.k)).toEqual([
      'profile',
      'family',
      'terms weighted',
      'heaviest',
      'load sensor',
      'pooling',
      'zoning',
      'parking',
    ]);
  });

  it('counts weighted terms against the library rather than a literal twelve', () => {
    expect(valueOf(dispatcherPlateOf(profile('collective')), 'terms weighted')).toBe('1 of 12');
    expect(valueOf(dispatcherPlateOf(profile('predictive-balanced')), 'terms weighted')).toBe(
      '10 of 12',
    );
  });

  it('names at most the heaviest three, largest first', () => {
    const heaviest = valueOf(dispatcherPlateOf(profile('predictive-balanced')), 'heaviest') ?? '';
    expect(heaviest.split(' · ')).toHaveLength(3);
    expect(heaviest.startsWith('waitTime 1.00')).toBe(true);
  });

  /* --- the point of resolving --- */

  it('reports a default the profile never declared — the reason it reads the resolved config', () => {
    // `collective` has no `idle` block at all. It still parks, and the plate says where.
    expect(profile('collective').idle).toBeUndefined();
    expect(valueOf(dispatcherPlateOf(profile('collective')), 'parking')).toBe(
      'stays where it stopped',
    );
  });

  it('reads parking, pooling and zoning off the profiles that do declare them', () => {
    const zoned = dispatcherPlateOf(profile('zoned-uppeak'));
    expect(valueOf(zoned, 'parking')).toBe('centre of its zone');
    expect(valueOf(zoned, 'pooling')).toBe('split above 10 waiting');
    expect(valueOf(zoned, 'zoning')).toBe('zone affinity weighted 0.30');

    const panel = dispatcherPlateOf(profile('destination-panel'));
    expect(valueOf(panel, 'pooling')).toBe('by destination, at the panel');

    const predictive = dispatcherPlateOf(profile('predictive-balanced'));
    expect(valueOf(predictive, 'parking')).toBe('where demand is forecast');
  });

  it('says the group adds no load filter when the sensor threshold is inert', () => {
    // `maxLoadFactorForAssignment` defaults to 1.0 — the car's own bypass has already filtered.
    expect(valueOf(dispatcherPlateOf(profile('collective')), 'load sensor')).toBe(
      'the car’s own bypass only',
    );
    expect(valueOf(dispatcherPlateOf(profile('capacity-aware')), 'load sensor')).toContain(
      'sole-eligible override on',
    );
  });

  it('says a profile the engine refuses is refused, rather than describing defaults it will not run with', () => {
    const bogus: DispatcherProfile = {
      id: 'bogus',
      name: 'Bogus',
      weights: { waitTime: 1 },
      hardConstraints: ['thisIsNotAConstraint'],
    };
    const rows = dispatcherPlateOf(bogus);
    expect(rows.map((row) => row.k)).toEqual(['profile', 'family', 'refused']);
    expect(rows[2]?.help).toContain('thisIsNotAConstraint');
  });

  it('describes zoning as absent when no zone term is weighted', () => {
    expect(valueOf(dispatcherPlateOf(profile('collective')), 'zoning')).toContain('none');
  });
});

/**
 * The blurb is derived for **every** profile, and these are the guards that keep it that way.
 *
 * The card used to print `profile.$comment` verbatim where there was one. § D163 clause 1's
 * search reported it as an R3 violation — `destination-eta`'s comment says *"no quotable AWT on
 * 30 of 30"*, and on a Vertical City run whose refused `meanWaitS` rounds to `30` that is an
 * estimate cue and the withheld number in one clause. The collision was luck; the defect was that
 * a player-facing card rendered 5 082 characters of maintainer prose at all.
 *
 * So the cases below are about the **mechanism** and not about that one string: a comment may not
 * reach a blurb by any route, a blurb may not carry an estimate cue at all, and no two shipped
 * profiles may share one. The last is what makes the derivation safe to widen — it is the reason
 * the hard-constraint and auction clauses exist, rather than a preference.
 */
describe('the dispatcher list’s words', () => {
  it('never renders a profile’s `$comment`, whole or in part', () => {
    const commented = config.dispatcherProfiles.profiles.filter(
      (entry) => (entry.$comment ?? '').trim() !== '',
    );
    // Both ways: a file that stopped carrying comments would make the loop below vacuous.
    expect(commented.length).toBeGreaterThan(5);
    for (const entry of commented) {
      const blurb = dispatcherBlurbOf(entry);
      expect(blurb).not.toBe(entry.$comment);
      // Not a prefix either: truncating an essay leaves an essay, and its numerals with it.
      const opening = (entry.$comment ?? '').slice(0, 24);
      expect(blurb.includes(opening)).toBe(false);
    }
  });

  it('carries no estimate cue, so R3’s textual half has nothing to match', () => {
    // `honesty/properties.ts`'s ESTIMATE_CUES, restated because they are module-private there.
    const cues = /\b(?:average|mean|awt|typical|95th|wt95|percentile|one in twenty|1 in 20|time to destination|ttd)\b/i;
    for (const entry of config.dispatcherProfiles.profiles) {
      const blurb = dispatcherBlurbOf(entry);
      expect(cues.test(blurb), `${entry.id}: ${blurb}`).toBe(false);
      expect(blurb.length, `${entry.id} is ${String(blurb.length)} characters`).toBeLessThanOrEqual(
        160,
      );
    }
    // The regression itself: the numeral and the cue that fired are both gone.
    expect(dispatcherBlurbOf(profile('destination-eta'))).not.toContain('30 of 30');
  });

  it('tells every shipped profile apart', () => {
    const blurbs = config.dispatcherProfiles.profiles.map((entry) => dispatcherBlurbOf(entry));
    expect(new Set(blurbs).size).toBe(blurbs.length);
  });

  it('generates an honest one-liner from the weight vector', () => {
    const collective = profile('collective');
    expect(collective.$comment).toBeUndefined();
    const blurb = dispatcherBlurbOf(collective);
    expect(blurb).toContain('1 of 12 terms weighted');
    expect(blurb).toContain('waitTime 1.00');
  });

  it('prints the two declared facts a weight vector cannot carry, as the file declares them', () => {
    // `collective` and `eta` weight the same single term; only the hard constraint separates them.
    expect(dispatcherBlurbOf(profile('collective'))).toContain(
      'hard constraint noDirectionReversal',
    );
    expect(dispatcherBlurbOf(profile('eta'))).not.toContain('hard constraint');
    // The two auctions are weight-identical; only the round count separates them.
    expect(dispatcherBlurbOf(profile('auction'))).toContain('contract-net over 1 bidding round');
    expect(dispatcherBlurbOf(profile('auction-multi-round'))).toContain(
      'contract-net over 3 bidding rounds',
    );
  });

  it('names the engine rather than inventing a family for a profile with no role', () => {
    expect(dispatcherFamilyOf(profile('collective'))).toBe('baseline');
    expect(profile('energy-aware').role).toBeUndefined();
    expect(dispatcherFamilyOf(profile('energy-aware'))).toBe('weighted cost');
  });

  it('notes the position and the family — `n of m · family`', () => {
    const profiles = config.dispatcherProfiles.profiles;
    expect(dispatcherNoteOf(profiles, 'collective')).toBe(
      `3 of ${String(profiles.length)} · baseline`,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Traffic
 * -------------------------------------------------------------------------- */

describe('trafficPlateOf', () => {
  it('states the pattern in traffic-study units, and says the figures are observed', () => {
    const spec = specFromTrafficProfile(config.trafficProfiles, 'office-standard');
    const rows = trafficPlateOf(spec, 1710);
    expect(rows.map((row) => row.k)).toEqual([
      'pattern',
      'peak order',
      'peak rate',
      'peak holds',
      'group size',
      'interfloor',
      'population',
      'measured on',
    ]);
    expect(valueOf(rows, 'measured on')).toBe('observed calls only');
    expect(valueOf(rows, 'population')).toBe('1,710 people');
  });

  it('reads the rate, the batch mean and the interfloor share off the profile', () => {
    const source = config.trafficProfilesById.get('office-standard');
    expect(source).toBeDefined();
    const spec = specFromTrafficProfile(config.trafficProfiles, 'office-standard');
    const rows = trafficPlateOf(spec, 100);
    expect(valueOf(rows, 'peak rate')).toBe(
      `${(source?.arrivalRatePctPop5min.typical ?? 0).toFixed(1)} %pop/5 min`,
    );
    expect(valueOf(rows, 'group size')).toBe(`${(source?.batchSize.mean ?? 0).toFixed(1)} people`);
  });

  it('says there is no building rather than printing a population of zero', () => {
    expect(valueOf(trafficPlateOf(DEFAULT_PATTERN, undefined), 'population')).toBe(
      'no building resolved',
    );
  });
});

/**
 * The pattern list's words — the sibling of *the dispatcher list's words* above, because it had
 * the sibling defect: `patternOptionsOf` used to read `profile.$comment` onto a card's `help`,
 * the identical route § D186 closed for dispatchers. It stayed benign here only because the one
 * shipped traffic comment was short and player-safe, which is luck, not a bound.
 *
 * So these cases are about the **mechanism**: a shipped card's `help` is the profile's authored
 * `blurb` (a field `core`'s schema requires and caps), a `$comment` may not reach any rendered
 * string of any option, and — the direction the shipped file cannot exercise — an adversarial
 * essay of maintainer prose planted as every profile's `$comment` still reaches nothing. Anyone
 * re-pointing this surface at `$comment` turns that last case red.
 */
function resourcesWith(trafficProfiles: TrafficProfiles): BrowserResources {
  return {
    elevatorSpecs: config.elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: config.dispatcherProfiles,
    buildings: config.buildings,
    entries: [],
    trafficProfileIds: new Set(trafficProfiles.profiles.map((entry) => entry.id)),
    warnings: [],
  };
}

describe('the pattern list’s words', () => {
  const optionsOver = (trafficProfiles: TrafficProfiles) =>
    patternOptionsOf(resourcesWith(trafficProfiles), [], requireBuilding(config, 'midtown-office'));

  it('reads every shipped card’s help from the profile’s authored `blurb`', () => {
    const options = optionsOver(config.trafficProfiles);
    for (const entry of config.trafficProfiles.profiles) {
      expect(options.find((option) => option.id === entry.id)?.help).toBe(entry.blurb);
    }
  });

  it('never renders a traffic profile’s `$comment`, whole or in part', () => {
    const commented = config.trafficProfiles.profiles.filter(
      (entry) => (entry.$comment ?? '').trim() !== '',
    );
    // Both ways: a file that stopped carrying comments would make the loop below vacuous.
    expect(commented.length).toBeGreaterThan(0);
    const options = optionsOver(config.trafficProfiles);
    for (const entry of commented) {
      const option = options.find((candidate) => candidate.id === entry.id);
      expect(option).toBeDefined();
      const opening = (entry.$comment ?? '').slice(0, 24);
      for (const text of [option?.label, option?.tag, option?.sub, option?.help]) {
        expect(text).not.toBe(entry.$comment);
        expect(text?.includes(opening)).toBe(false);
      }
    }
  });

  it('refuses an adversarial `$comment` planted on every profile, not merely the shipped ones', () => {
    // The exact shape § D186 describes: maintainer prose, numerals in a clause with an estimate
    // cue, far past any card's length. The shipped file never carries this; the route must
    // refuse it anyway, or the guard above is only as strong as today's data.
    const essay =
      'INTERNAL-ONLY: mean AWT refused on 30 of 30 replications at seed 4242; ' +
      'interval +0.295 [+0.154, +0.437] at n = 150; do not quote. '.repeat(80);
    const poisoned: TrafficProfiles = {
      ...config.trafficProfiles,
      profiles: config.trafficProfiles.profiles.map((entry) => ({ ...entry, $comment: essay })),
    };
    const options = optionsOver(poisoned);
    // The list still renders in full: the 'building' row plus one card per profile.
    expect(options.length).toBe(poisoned.profiles.length + 1);
    const opening = essay.slice(0, 24);
    for (const option of options) {
      for (const text of [option.label, option.tag, option.sub, option.help]) {
        expect(text).not.toBe(essay);
        expect(text.includes(opening), `${option.id}: ${text}`).toBe(false);
        expect(text.includes('INTERNAL-ONLY')).toBe(false);
      }
    }
    // Refused is not blanked: each card's help is still the authored blurb.
    for (const entry of poisoned.profiles) {
      expect(options.find((option) => option.id === entry.id)?.help).toBe(entry.blurb);
    }
  });

  it('ships blurbs a driven honesty surface can carry — no estimate cue, no probability word, bounded', () => {
    // `honesty/surfaces.ts` seeds every option's `help` as prose, so these strings are inside
    // R1–R13. The cue list restates `honesty/properties.ts`'s module-private ESTIMATE_CUES, as
    // the dispatcher suite above already does; the probability check is the shared word list.
    const cues =
      /\b(?:average|mean|awt|typical|95th|wt95|percentile|one in twenty|1 in 20|time to destination|ttd)\b/i;
    for (const entry of config.trafficProfiles.profiles) {
      expect(cues.test(entry.blurb), `${entry.id}: ${entry.blurb}`).toBe(false);
      expect(probabilityWordIn(entry.blurb), `${entry.id}: ${entry.blurb}`).toBeNull();
      expect(entry.blurb.length, `${entry.id} is ${String(entry.blurb.length)} characters`).toBeLessThanOrEqual(160);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Building
 * -------------------------------------------------------------------------- */

describe('buildingPlateOf', () => {
  it('derives every figure from the resolved building', () => {
    const building = requireBuilding(config, 'midtown-office');
    const rows = buildingPlateOf(building, undefined);
    const cars = building.banks.reduce((total, bank) => total + bank.cars.length, 0);
    expect(valueOf(rows, 'floors served')).toContain(String(building.floors.length));
    expect(valueOf(rows, 'population')).toContain(
      String(Math.round(building.totalPopulation)).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
    );
    expect(valueOf(rows, 'shafts')).toBe(`${String(cars)} cars in 1 bank`);
    const heights = building.floors.map((floor) => floor.heightM);
    expect(valueOf(rows, 'travel height')).toBe(
      `${(Math.max(...heights) - Math.min(...heights)).toFixed(1)} m`,
    );
  });

  it('omits handling capacity and interval when there is no run, and says why', () => {
    const rows = buildingPlateOf(requireBuilding(config, 'midtown-office'), undefined);
    expect(rows.map((row) => row.k)).not.toContain('handling capacity');
    expect(rows.map((row) => row.k)).not.toContain('achieved interval');
    expect(valueOf(rows, 'measured')).toBe('no run yet');
    // The prototype's nominal round trip, and the two figures derived from it, are not here.
    expect(rows.map((row) => row.k)).not.toContain('round trip');
    for (const row of rows) expect(row.v).not.toContain('nominal');
  });

  it('states the 80% design load beside the rated capacity', () => {
    const rows = buildingPlateOf(requireBuilding(config, 'midtown-office'), undefined);
    expect(valueOf(rows, 'car capacity')).toContain('at design load');
  });

  it('counts the banks from the building rather than assuming one', () => {
    const secure = requireBuilding(config, 'secure-tower');
    expect(secure.banks.length).toBeGreaterThan(1);
    expect(valueOf(buildingPlateOf(secure, undefined), 'shafts')).toContain(
      `${String(secure.banks.length)} banks`,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Machines
 * -------------------------------------------------------------------------- */

describe('nameplateOf', () => {
  it('is engineer-only', () => {
    expect(nameplateVisibleIn('casual')).toBe(false);
    expect(nameplateVisibleIn('engineer')).toBe(true);
  });

  it('reads the 80% fill rule from the conventions block rather than writing it out', () => {
    const rows = nameplateOf(machineClass('geared-traction'), config.elevatorSpecs);
    const factor = config.elevatorSpecs.conventions.designLoadFactor;
    expect(valueOf(rows, 'design load')).toBe(`${(factor * 100).toFixed(0)}% of rated`);
    expect(rows.find((row) => row.k === 'design load')?.help).toContain('never to the nameplate');
  });

  it('carries the file-level doors, timing and load-sensor blocks', () => {
    const specs = config.elevatorSpecs;
    const rows = nameplateOf(machineClass('geared-traction'), specs);
    expect(valueOf(rows, 'doors')).toContain(specs.doors.centerOpening.openS.toFixed(1));
    expect(valueOf(rows, 'dwell')).toContain(specs.doors.dwellHallCallS.typical.toFixed(1));
    expect(valueOf(rows, 'start & levelling')).toContain(specs.timing.motorStartDelayS.toFixed(1));
    expect(valueOf(rows, 'transfer')).toContain(specs.timing.passengerTransferS.office.toFixed(1));
    expect(valueOf(rows, 'load sensor')).toContain(
      `${(specs.loadSensor.hallCallBypassThreshold * 100).toFixed(0)}%`,
    );
  });

  it('carries the class record’s own envelope', () => {
    const hydraulic = machineClass('hydraulic');
    const rows = nameplateOf(hydraulic, config.elevatorSpecs);
    expect(valueOf(rows, 'rated envelope')).toContain(String(hydraulic.maxRiseM));
    expect(valueOf(rows, 'rated load')).toBe(
      `${String(hydraulic.loadMinLb)}–${String(hydraulic.loadMaxLb)} lb`,
    );
  });
});

describe('machineWarningOf', () => {
  it('is an advisory and never says the loader refuses', () => {
    const line = machineWarningOf(machineClass('hydraulic'), requireBuilding(config, 'vertical-city'));
    expect(line.startsWith('⚠')).toBe(true);
    expect(line).toContain('advisory rather than a refusal');
    expect(line.toLowerCase()).not.toContain('refuses');
    expect(line.toLowerCase()).not.toContain('will not build');
  });

  it('names the rise and the class’s own limit', () => {
    const hydraulic = machineClass('hydraulic');
    const line = machineWarningOf(hydraulic, requireBuilding(config, 'vertical-city'));
    expect(line).toContain(`${String(hydraulic.maxRiseM)} m`);
  });

  it('says nothing alarming when the building is inside the envelope', () => {
    const line = machineWarningOf(
      machineClass('ultra-high-speed'),
      requireBuilding(config, 'garden-apartments'),
    );
    expect(line).not.toContain('⚠');
    expect(line).toContain('Garden Apartments');
  });

  it('makes no claim about a building it has not been given', () => {
    const line = machineWarningOf(machineClass('hydraulic'), undefined);
    expect(line).not.toContain('⚠');
  });
});

/* -------------------------------------------------------------------------- *
 * The rule that outranks the design
 * -------------------------------------------------------------------------- */

describe('a suppressed run yields no mean anywhere in the right rail', () => {
  let recording: VizRecording;

  beforeAll(() => {
    recording = recordRun(breadthConfig(config, 'vertical-city')).recording;
  }, 600_000);

  it('really is suppressed, or the rest of this proves nothing', () => {
    expect(meansAreSuppressed(recording)).toBe(true);
    expect(Number.isFinite(recording.summary.meanWaitS)).toBe(true);
  });

  it('withholds the achieved interval, which is still a mean over a queue that never settled', () => {
    const rows = buildingPlateOf(requireBuilding(config, 'vertical-city'), recording);
    expect(valueOf(rows, 'achieved interval')).toBe('withheld');
    // …and keeps the handling capacity, which is a count of people per five minutes.
    expect(valueOf(rows, 'handling capacity')).toBeDefined();
  });

  it('never prints the withheld figure in any plate, as a number or inside a sentence', () => {
    const withheld = [
      recording.summary.meanWaitS,
      recording.summary.wait95S,
      recording.summary.meanTimeToDestinationS,
    ].filter((value) => Number.isFinite(value) && value !== 0);
    expect(withheld.length).toBeGreaterThan(0);

    const building = requireBuilding(config, 'vertical-city');
    const plates: readonly (readonly PlateEntry[])[] = [
      buildingPlateOf(building, recording),
      buildingPlateOf(building, undefined),
      trafficPlateOf(
        specFromTrafficProfile(config.trafficProfiles, building.trafficProfile),
        building.totalPopulation,
      ),
      ...config.dispatcherProfiles.profiles.map((entry) => dispatcherPlateOf(entry)),
      ...classes.map((entry) => nameplateOf(entry, config.elevatorSpecs)),
    ];

    const found: string[] = [];
    for (const [index, rows] of plates.entries()) {
      for (const row of rows) {
        for (const text of [row.k, row.v, row.help ?? '']) {
          for (const target of withheld) {
            for (const digits of [1, 2]) {
              if (text.includes(target.toFixed(digits))) {
                found.push(`plate #${String(index)} "${row.k}" ⊃ "${target.toFixed(digits)}"`);
              }
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  }, 600_000);
});
