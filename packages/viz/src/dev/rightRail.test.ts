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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
import { DATA_DIR, requireBuilding, suppressedConfig } from '../fixtures.test-helper.js';
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
  runningClassesOf,
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

  it('counts weighted terms against the library rather than a literal thirteen', () => {
    // The denominator tracks `data/`'s term list, which is the point of the test's name: it moved
    // from twelve to thirteen when `diversionDetour` landed (`DECISIONS.md` § D211) and the plate
    // followed without a code change, which a literal would not have.
    expect(valueOf(dispatcherPlateOf(profile('collective')), 'terms weighted')).toBe('1 of 13');
    expect(valueOf(dispatcherPlateOf(profile('predictive-balanced')), 'terms weighted')).toBe(
      '10 of 13',
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
    expect(blurb).toContain('1 of 13 terms weighted');
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
    /*
     * `hydraulic` on Garden Apartments, which is the class its two cars are actually built to:
     * 15 m of rise and 6 floors against 18 m and 6, at 0.63 m/s inside a 0.50–0.75 band.
     *
     * This case used to be `ultra-high-speed` on the same building, and it passed for a reason
     * that was a defect rather than a fact — see the speed case below.
     */
    const line = machineWarningOf(
      machineClass('hydraulic'),
      requireBuilding(config, 'garden-apartments'),
    );
    expect(line).not.toContain('⚠');
    expect(line).toContain('Garden Apartments');
  });

  it('checks the speed band, not only the rise and the floor count', () => {
    /*
     * **The expectation this case carried before issue #114 was the bug.** It asserted that
     * *Ultra high-speed* — a class banded 10.00–20.50 m/s — raised nothing about Garden
     * Apartments, whose cars run at 0.63, and named it *"says nothing alarming when the building
     * is inside the envelope"*. The building is not inside that class's envelope; the envelope was
     * checked on rise and floors and never on speed, so the line said so anyway. The nameplate two
     * rows above it has always said *"A car outside the band is not a car of this class"*, and
     * `config/parse.ts` has always raised `speed-outside-class-range` for it.
     */
    const ultra = machineClass('ultra-high-speed');
    const line = machineWarningOf(ultra, requireBuilding(config, 'garden-apartments'));
    expect(line.startsWith('⚠')).toBe(true);
    expect(line).not.toContain("is inside this class's envelope");
    // Both sides of the comparison, so the reader can see which number is being objected to.
    expect(line).toContain('0.63 m/s');
    expect(line).toContain(
      `${ultra.speedMinMps.toFixed(2)}–${ultra.speedMaxMps.toFixed(2)} m/s`,
    );
    // Still an advisory: the loader raises this one as a warning too, and builds the bank.
    expect(line).toContain('advisory rather than a refusal');
    expect(line.toLowerCase()).not.toContain('refuses');
  });

  it('measures the cars built to the class, not every car in the building', () => {
    /*
     * Vertical City runs 27 gearless-traction cars and 8 ultra high-speed ones. Comparing all 35
     * against the gearless band (2.50–7.00) raises a ⚠ about the sky-lobby shuttle, which is
     * correctly an ultra car correctly running at 10 m/s — a false alarm in place of the false
     * *inside the envelope* this fix removed. `config/parse.ts` scopes its own envelope checks the
     * same way: once per class in the bank, over the classes the bank actually uses.
     */
    const city = requireBuilding(config, 'vertical-city');
    const speeds = city.banks.flatMap((bank) => bank.cars.map((car) => car.ratedSpeedMps));
    const gearless = machineClass('gearless-traction');
    expect(Math.max(...speeds)).toBeGreaterThan(gearless.speedMaxMps);
    expect(machineWarningOf(gearless, city)).not.toContain('m/s against a class banded');
  });

  it('makes no claim about a building it has not been given', () => {
    const line = machineWarningOf(machineClass('hydraulic'), undefined);
    expect(line).not.toContain('⚠');
  });
});

/* -------------------------------------------------------------------------- *
 * Machines: what is running, and the refusal that says so — issue #114
 * -------------------------------------------------------------------------- */

describe('runningClassesOf', () => {
  it('reads the class off the cars, on a building the rail used to be wrong about', () => {
    /*
     * The regression pin. `editingClassId` is seeded from `classes[2]` — *Geared traction* — and
     * `withBuilding` never re-derives it, so the rail highlighted that class on every building in
     * the catalogue. Chancery House runs six gearless cars and not one geared one.
     */
    const running = runningClassesOf(requireBuilding(config, 'chancery-house'), classes);
    expect(running.map((entry) => entry.id)).toEqual(['gearless-traction']);
    expect(running[0]?.machineClass?.name).toBe('Gearless traction');
    expect(running[0]?.cars).toBe(6);
    expect(running[0]?.speedMinMps).toBe(5);
    expect(running[0]?.speedMaxMps).toBe(5);
  });

  it('disagrees with itself across buildings, which the pointer it replaced never did', () => {
    const first = (id: string): string | undefined =>
      runningClassesOf(requireBuilding(config, id), classes)[0]?.id;
    expect(first('garden-apartments')).toBe('hydraulic');
    expect(first('midtown-office')).toBe('geared-traction');
    expect(first('chancery-house')).toBe('gearless-traction');
    expect(new Set([first('garden-apartments'), first('chancery-house')]).size).toBe(2);
  });

  it('lists every class a building runs, largest fleet first', () => {
    // 27 gearless locals against 8 ultra high-speed shuttle cars: the nameplate follows the first.
    const running = runningClassesOf(requireBuilding(config, 'vertical-city'), classes);
    expect(running.map((entry) => entry.id)).toEqual(['gearless-traction', 'ultra-high-speed']);
    expect(running[0]?.cars).toBe(27);
    expect(running[1]?.cars).toBe(8);
    expect(running[0]?.banks.length).toBeGreaterThan(1);
    expect(running[1]?.banks).toEqual(['Double-deck sky lobby shuttle']);
  });

  it('separates two classes sharing one bank, and bands their speeds', () => {
    const running = runningClassesOf(requireBuilding(config, 'crown-hotel'), classes);
    expect(running).toHaveLength(2);
    for (const entry of running) expect(entry.banks).toEqual(['Main bank']);
    const all = running.flatMap((entry) => [entry.speedMinMps, entry.speedMaxMps]);
    expect(new Set(all)).toEqual(new Set([1.75, 3]));
  });

  it('keeps the row when the library cannot name the class, rather than dropping it', () => {
    // A `spec` no class record carries is a misconfiguration; a panel that stayed quieter about it
    // than about a working building would be the wrong way round.
    const running = runningClassesOf(requireBuilding(config, 'midtown-office'), []);
    expect(running.map((entry) => entry.id)).toEqual(['geared-traction']);
    expect(running[0]?.machineClass).toBeUndefined();
  });

  it('has nothing to say before a building resolves', () => {
    expect(runningClassesOf(undefined, classes)).toEqual([]);
  });
});

describe('the Machines segment says it writes nothing — § D227', () => {
  /*
   * `mountRightRail` is DOM-bound and on `honesty/derive.test.ts`'s undriven-mount list, so the
   * panel itself cannot be rendered under Node. What is asserted instead is the pure paragraph the
   * panel puts in its prose slot — `machineWarningOf` is the whole of it — plus the two things a
   * sentence alone cannot establish: that no write survives in the module for it to be wrong
   * about, and that the three segments which *do* write make no such claim. That is weaker than
   * driving the mount and is said rather than dressed up.
   */
  const REFUSAL = 'Nothing here is pickable';

  const sourceOf = (path: string): string =>
    readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

  /** Comments blanked, so a docstring *about* a write does not read as one. `derive`'s idiom. */
  const code = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('carries the refusal in every state the paragraph has', () => {
    const inside = machineWarningOf(
      machineClass('hydraulic'),
      requireBuilding(config, 'garden-apartments'),
    );
    const over = machineWarningOf(
      machineClass('hydraulic'),
      requireBuilding(config, 'vertical-city'),
    );
    const none = machineWarningOf(machineClass('hydraulic'), undefined);
    for (const line of [inside, over, none]) expect(line).toContain(REFUSAL);
  });

  it('names the two surfaces that really do write, in their own words', () => {
    /*
     * A refusal is pinned by the thing it points at, never by another sentence. Both labels are
     * asserted against the module that authors them, so renaming either screen turns this red
     * rather than leaving the rail pointing at a door that is no longer there.
     */
    const line = machineWarningOf(machineClass('hydraulic'), undefined);
    expect(sourceOf('../menu/screens.ts')).toContain("label: 'Commission the building'");
    expect(sourceOf('../../index.html')).toContain('Save as a new building');
    expect(line).toContain('Commission the building');
    expect(line).toContain('Save as a new building');
  });

  it('names the route in the word that is actually on the menu — the half the pin above missed', () => {
    /*
     * The sentence read *"Menu → Campaign"* for every wave after GitHub issue #97 relabelled that
     * row **Scenarios**, and the test above did not notice because it pinned the two *labels* and
     * said nothing about the *route*. A pin that covers half a claim is how the other half rots.
     *
     * Derived from the row rather than repeated: the assertion reads the label off `mainRows`'
     * `main.campaign` affordance and requires the rail's route to name that word, so relabelling the
     * row again turns this red on the same run instead of a wave later.
     */
    const label = /to\('main\.campaign',\s*'([^']+)'/u.exec(sourceOf('../menu/screens.ts'))?.[1];
    expect(label, 'the label `mainRows` gives the row this route names').toBeDefined();
    const line = machineWarningOf(machineClass('hydraulic'), undefined);
    expect(line).toContain(`Menu → ${label ?? ''}`);
  });

  it('is true: nothing in the rail writes the pointer the six cards used to write', () => {
    // The other half of § D227. A sentence saying a panel writes nothing is worth what the code
    // behind it is worth, and `editingClassId` was exactly one `context.update` away from making
    // this claim false.
    expect(code(sourceOf('./rightRail.ts'))).not.toContain('editingClassId');
  });

  it('is confined to the segment it is true of', () => {
    /*
     * § D227 binds both ways: a control that writes something may not claim it writes nothing. The
     * dispatcher, traffic and building lists each call `runShift` after their write, so none of
     * them may carry this sentence.
     */
    const live = [
      dispatcherNoteOf(config.dispatcherProfiles.profiles, 'collective'),
      ...config.dispatcherProfiles.profiles.map((entry) => dispatcherBlurbOf(entry)),
      ...patternOptionsOf(
        resourcesWith(config.trafficProfiles),
        [],
        requireBuilding(config, 'midtown-office'),
      ).flatMap((option) => [option.sub, option.help]),
      ...buildingPlateOf(requireBuilding(config, 'midtown-office'), undefined).map(
        (row) => `${row.v} ${row.help ?? ''}`,
      ),
    ];
    for (const text of live) expect(text).not.toContain(REFUSAL);
  });
});

/* -------------------------------------------------------------------------- *
 * The rule that outranks the design
 * -------------------------------------------------------------------------- */

describe('a suppressed run yields no mean anywhere in the right rail', () => {
  /*
   * `suppressedConfig` is `vertical-city` at a **stated** 16 % of population per five minutes rather
   * than at its shipped rate — `DECISIONS.md` § D260. At the shipped rate this run used to be
   * refused, and it was refused by § D254's pickup access check rather than by its traffic. The
   * plates below are still read off `vertical-city`, so nothing about the building moved.
   */
  let recording: VizRecording;

  beforeAll(() => {
    recording = recordRun(suppressedConfig(config)).recording;
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
