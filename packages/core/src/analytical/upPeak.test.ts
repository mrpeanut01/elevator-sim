/**
 * Tests for the derivation of closed-form terms from the shipped building configurations.
 *
 * These run against the **real** `data/` directory rather than fixtures, on purpose. The
 * closed form is Phase 2's acceptance oracle for Midtown Office specifically, so the number
 * that has to be right is the one derived from the file the simulator will be pointed at.
 * A fixture that drifted from `data/buildings/midtown-office.json` would be worse than no
 * test at all.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config/loader.js';
import type { ElevatorSpecs, LoadedConfig, ResolvedBuilding } from '../config/types.js';
import { analyzeUpPeak, deriveUpPeakTerms, passengerTransferSecondsFor } from './upPeak.js';
import {
  AnalyticalError,
  CLOSED_FORM_COMPARISON_RULE,
  IMPLAUSIBLE_PERCENT_POPULATION_5MIN,
  UP_PEAK_WARNING_CODES,
} from './types.js';

const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

let config: LoadedConfig;
let specs: ElevatorSpecs;

function building(id: string): ResolvedBuilding {
  const found = config.buildingsById.get(id);
  if (found === undefined) throw new Error(`data/buildings is missing "${id}"`);
  return found;
}

function warningCodes(warnings: readonly { readonly code: string }[]): readonly string[] {
  return warnings.map((warning) => warning.code).sort();
}

beforeAll(async () => {
  config = await loadConfig(REAL_DATA_DIR);
  specs = config.elevatorSpecs;
});

// ---------------------------------------------------------------------------
// The worked example
// ---------------------------------------------------------------------------

/**
 * ## Midtown Office, worked by hand
 *
 * `data/buildings/midtown-office.json`: 20 storeys, one bank of 4 cars, 2.5 m/s,
 * 2500 lb, centre-opening doors, geared traction. Every step below is checkable with a
 * calculator against that file and `data/elevator-specs.json`.
 *
 * ### Geometry
 *
 * Floors: `P1` (index −1, −3.5 m), `G` (index 0, 0.0 m), then `2` … `20`. There is no floor
 * `1`: the lobby is double height, so `G → 2` is a 5.0 m rise and every floor above is
 * 3.8 m apart, ending at floor `20` at 73.4 m.
 *
 *   terminal            `G`, height 0.0 m — the highest-index entrance with population
 *                       above it; the garage `P1` is the second entrance the closed form
 *                       cannot represent
 *   N                   19 populated served floors above `G` (`2` … `20`)
 *   df  = (73.4 − 5.0) / (19 − 1) = 68.4 / 18            = 3.8 m
 *   tx_m = 5.0 − 3.8 − 0.0                               = 1.2 m
 *   v                                                    = 2.5 m/s
 *   tv  = 3.8 / 2.5                                      = 1.52 s
 *   tx  = 1.2 / 2.5                                      = 0.48 s
 *
 * Check on `df` and `tx` together: at `H = N = 19` the model puts the car at
 * `19 × 3.8 + 1.2 = 73.4 m`, which is floor 20's real height. The grid is exact at the
 * endpoints, not merely close.
 *
 * ### Time lost per stop
 *
 *   door open (centre-opening)   1.8 s
 *   door close (centre-opening)  3.0 s
 *   motor start delay            0.5 s
 *   levelling and settling       0.7 s
 *   ts                           6.0 s
 *
 * ### Payload
 *
 *   rated load                              2500 lb
 *   persons at rated load = ⌊2500 / 150⌋  = 16
 *   P = 16 × 0.8                          = 12.8    (not rounded: P is an expectation)
 *   tp, office                            = 1.2 s
 *   L                                     = 4 cars
 *   U = 19 floors × 90 persons            = 1710
 *
 * ### S and H
 *
 *   S = 19 × (1 − (18/19)^12.8)
 *     ln(18/19) = −0.0540672211;  × 12.8 = −0.6920604301;  e^… = 0.5005436695
 *     S = 19 × 0.4994563305 = 9.4896702793
 *
 *   H = 19 − Σ_{i=1..18} (i/19)^12.8
 *     the sum is dominated by its top terms:
 *       (18/19)^12.8 = 0.50054367   (17/19)^12.8 = 0.24082430
 *       (16/19)^12.8 = 0.11083830   (15/19)^12.8 = 0.04852009
 *       (14/19)^12.8 = 0.02006282   (13/19)^12.8 = 0.00777013
 *       (12/19)^12.8 = 0.00278913   (11/19)^12.8 = 0.00091576
 *       (10/19)^12.8 = 0.00027037   and 9 further terms totalling 0.00008893
 *       Σ = 0.9326235
 *     H = 19 − 0.9326235 = 18.0673765
 *
 * ### Round trip
 *
 *   travel   = 2 × (18.0673765 × 1.52 + 0.48) = 2 × 27.9424123 =  55.8848245 s
 *   stops    = (9.4896703 + 1) × 6.0                           =  62.9380217 s
 *   transfer = 2 × 12.8 × 1.2                                  =  30.72      s
 *   RTT                                                        = 149.5428462 s
 *
 *   INT  = 149.5428462 / 4                        =  37.3857116 s
 *   HC   = 300 × 12.8 × 4 / 149.5428462           = 102.7130377 persons / 5 min
 *   %POP = 102.7130377 / 1710 × 100               =   6.0066104 %
 *
 * Cross-check on `travel` without going through `H` in floor units: `H = 18.0673765` sits
 * between floor `19` (69.6 m) and floor `20` (73.4 m), at `69.6 + 0.0673765 × 3.8 =
 * 69.8560 m`. A round trip is `2 × 69.8560 = 139.7121 m`, and at 2.5 m/s that is
 * `55.8848 s` — the same number by a different route.
 */
describe('Midtown Office — the Phase 2 acceptance oracle', () => {
  it('derives every term from the shipped configuration', () => {
    const terms = deriveUpPeakTerms(building('midtown-office'), specs);

    expect(terms.bankId).toBe('main');
    expect(terms.terminalFloorId).toBe('G');
    expect(terms.terminalHeightM).toBe(0);

    expect(terms.floorsAboveTerminal).toBe(19);
    expect(terms.upperFloorIds.at(0)).toBe('2');
    expect(terms.upperFloorIds.at(-1)).toBe('20');
    expect(terms.upperFloorIds).toHaveLength(19);

    expect(terms.interfloorDistanceM).toBeCloseTo(3.8, 12);
    expect(terms.expressRiseM).toBeCloseTo(1.2, 12);
    expect(terms.ratedSpeedMps).toBe(2.5);

    expect(terms.stopTime.doorOpenS).toBe(1.8);
    expect(terms.stopTime.doorCloseS).toBe(3.0);
    expect(terms.stopTime.motorStartDelayS).toBe(0.5);
    expect(terms.stopTime.levelingSettleS).toBe(0.7);
    expect(terms.stopTime.accelerationLossS).toBe(0);
    expect(terms.stopTime.totalS).toBeCloseTo(6.0, 12);

    expect(terms.ratedCapacityPersons).toBe(16);
    expect(terms.designLoadFactor).toBe(0.8);
    expect(terms.servedPopulation).toBe(1710);
    expect(terms.buildingPopulation).toBe(1710);

    // The seven scalars, as handed to the closed form.
    expect(terms.roundTripTerms.floorsAboveTerminal).toBe(19);
    expect(terms.roundTripTerms.passengersPerTrip).toBeCloseTo(12.8, 12);
    expect(terms.roundTripTerms.singleFloorTransitS).toBeCloseTo(1.52, 12);
    expect(terms.roundTripTerms.stopTimeLossS).toBeCloseTo(6.0, 12);
    expect(terms.roundTripTerms.passengerTransferS).toBe(1.2);
    expect(terms.roundTripTerms.carsInGroup).toBe(4);
    expect(terms.roundTripTerms.population).toBe(1710);
    expect(terms.roundTripTerms.expressJumpS).toBeCloseTo(0.48, 12);
  });

  it('places floor 20 at its real height on the uniform floor grid', () => {
    // df and tx are exact at the endpoints, which is the point of deriving df from the
    // served zone rather than from the whole rise.
    const terms = deriveUpPeakTerms(building('midtown-office'), specs);
    const modelledTopHeight =
      terms.floorsAboveTerminal * terms.interfloorDistanceM + terms.expressRiseM;
    expect(modelledTopHeight).toBeCloseTo(73.4, 9);
  });

  it('reproduces the hand-computed round trip term by term', () => {
    const { result } = analyzeUpPeak(building('midtown-office'), specs);

    expect(result.expectedStops).toBeCloseTo(9.4896703, 7);
    expect(result.highestReversalFloor).toBeCloseTo(18.0673765, 7);

    expect(result.travelTimeS).toBeCloseTo(55.8848245, 6);
    expect(result.stopTimeS).toBeCloseTo(62.9380217, 6);
    expect(result.transferTimeS).toBeCloseTo(30.72, 10);
    expect(result.roundTripTimeS).toBeCloseTo(149.5428462, 6);

    expect(result.intervalS).toBeCloseTo(37.3857116, 6);
    expect(result.handlingCapacityPerCar5Min).toBeCloseTo(25.6782594, 6);
    expect(result.handlingCapacity5Min).toBeCloseTo(102.7130377, 6);
    expect(result.percentPopulation5Min).toBeCloseTo(6.0066104, 6);
  });

  it('agrees with the independent distance-based cross-check on travel time', () => {
    // H = 18.0673765 sits between floor 19 (69.6 m) and floor 20 (73.4 m). Interpolating
    // the authored heights directly, without the df/tx grid, must give the same seconds.
    const { result } = analyzeUpPeak(building('midtown-office'), specs);
    const fraction = result.highestReversalFloor - 18;
    const heightM = 69.6 + fraction * (73.4 - 69.6);
    expect(result.travelTimeS).toBeCloseTo((2 * heightM) / 2.5, 9);
  });

  it('lands in the sanity band: interval 20–40 s, plausible handling capacity', () => {
    const { result } = analyzeUpPeak(building('midtown-office'), specs);

    // Four cars over a 20-storey office. Interval must be 20–40 s.
    expect(result.intervalS).toBeGreaterThan(20);
    expect(result.intervalS).toBeLessThan(40);

    // Each car completes 300 / 149.5 ≈ 2.0 round trips in the reporting window carrying
    // 12.8 people, so ~25.7 per car and ~103 for the group of four.
    expect(result.handlingCapacityPerCar5Min).toBeGreaterThan(20);
    expect(result.handlingCapacityPerCar5Min).toBeLessThan(32);
    expect(result.handlingCapacity5Min).toBeGreaterThan(80);
    expect(result.handlingCapacity5Min).toBeLessThan(130);
  });

  it('shows the building is under-elevatored against its own traffic profile', () => {
    // Not a defect in the formula, and not something to tune away: 1710 occupants on 4
    // cars is 428 people per car against a design norm nearer 200–300, so handling
    // capacity lands at ~6% of population per 5 minutes against the 11–15% that
    // data/traffic-profiles.json asks of a standard office. The interval tells the same
    // story more mildly, 37.4 s against a 30 s target.
    //
    // Phase 2 should therefore expect a *saturated* up-peak on this building at the
    // profile's rated demand — which is exactly the case the saturation flag exists for.
    const { result } = analyzeUpPeak(building('midtown-office'), specs);
    const profile = config.trafficProfilesById.get('office-standard');
    expect(profile).toBeDefined();
    expect(result.percentPopulation5Min).toBeLessThan(profile?.arrivalRatePctPop5min.min ?? 11);
    expect(result.intervalS).toBeGreaterThan(profile?.targetIntervalS ?? 30);
  });

  it('flags exactly the two ways this building departs from the model', () => {
    const { warnings } = analyzeUpPeak(building('midtown-office'), specs);
    expect(warningCodes(warnings)).toEqual([
      UP_PEAK_WARNING_CODES.expressZone,
      UP_PEAK_WARNING_CODES.multipleEntrances,
    ]);
    // Uniform 90-person floors and a uniform 3.8 m pitch above the lobby are what make
    // this the clean validation building; those warnings must stay absent.
    expect(warningCodes(warnings)).not.toContain(
      UP_PEAK_WARNING_CODES.nonUniformFloorPopulations,
    );
    expect(warningCodes(warnings)).not.toContain(
      UP_PEAK_WARNING_CODES.nonUniformInterfloorDistance,
    );
  });

  it('is pure and stable across calls', () => {
    const midtown = building('midtown-office');
    const before = JSON.stringify({
      floors: midtown.floors,
      banks: midtown.banks,
      totalPopulation: midtown.totalPopulation,
    });

    const first = analyzeUpPeak(midtown, specs);
    const second = analyzeUpPeak(midtown, specs);

    expect(second).toEqual(first);
    // Nothing was written back onto the building or its specs.
    expect(
      JSON.stringify({
        floors: midtown.floors,
        banks: midtown.banks,
        totalPopulation: midtown.totalPopulation,
      }),
    ).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// How the oracle may be compared against a simulation
// ---------------------------------------------------------------------------

describe('the comparison rule Phase 2 will be judged by', () => {
  it('is quoted with its precondition, not as "below means broken"', () => {
    // The unqualified rule is false by this module's own assumption table: two entries
    // bias 'over'. Both act through the load, so the rule needs matched load attached.
    expect(CLOSED_FORM_COMPARISON_RULE.statement).toMatch(/matched load/i);
    expect(CLOSED_FORM_COMPARISON_RULE.precondition).toMatch(/rise-and-fall/i);
    expect(CLOSED_FORM_COMPARISON_RULE.canPushSimulationBelowIds).toContain(
      'full-car-every-trip',
    );
    expect(CLOSED_FORM_COMPARISON_RULE.canPushSimulationBelowIds).toContain(
      'fractional-capacity',
    );
  });

  it('is satisfied on Midtown Office by passing the load the simulator actually boards', () => {
    // The concrete case the rule exists for. The simulator cannot board 0.8 of a person,
    // so its fullest car carries ⌊16 × 0.8⌋ = 12, and under the mandated rise-and-fall
    // template the shoulders of the peak are lighter still. Comparing such a run against
    // the 12.8-passenger closed form and calling the difference a defect is the failure
    // mode; comparing at matched load is the fix, and the escape hatch already exists.
    const design = analyzeUpPeak(building('midtown-office'), specs);
    const matched = analyzeUpPeak(building('midtown-office'), specs, {
      passengersPerTrip: 12,
    });

    expect(design.result.roundTripTimeS).toBeCloseTo(149.5428462, 6);
    expect(matched.result.roundTripTimeS).toBeCloseTo(144.8534513, 6);

    // A correct simulation at P = 12 lands ~3 % *below* the design-load closed form. That
    // is the closed form being evaluated at the wrong load, not a broken simulator.
    expect(matched.result.roundTripTimeS).toBeLessThan(design.result.roundTripTimeS);
    const shortfall =
      1 - matched.result.roundTripTimeS / design.result.roundTripTimeS;
    expect(shortfall).toBeGreaterThan(0.02);
    expect(shortfall).toBeLessThan(0.05);

    // Only the terms downstream of P move; the geometry is untouched.
    expect(matched.interfloorDistanceM).toBeCloseTo(design.interfloorDistanceM, 12);
    expect(matched.roundTripTerms.singleFloorTransitS).toBeCloseTo(
      design.roundTripTerms.singleFloorTransitS,
      12,
    );
    expect(matched.result.expectedStops).toBeLessThan(design.result.expectedStops);
    expect(matched.result.highestReversalFloor).toBeLessThan(
      design.result.highestReversalFloor,
    );
  });

  it('is one-sided the other way once the load matches: acceleration only adds seconds', () => {
    // With P held equal, everything the closed form omits does add time — which is what
    // makes the rule sound under its precondition.
    const matched = analyzeUpPeak(building('midtown-office'), specs, {
      passengersPerTrip: 12,
    });
    const withKinematics = analyzeUpPeak(building('midtown-office'), specs, {
      passengersPerTrip: 12,
      accelerationLossPerStopS: 2.5,
    });
    expect(withKinematics.result.roundTripTimeS).toBeGreaterThan(
      matched.result.roundTripTimeS,
    );
  });
});

// ---------------------------------------------------------------------------
// The repository's own statement of the formulas
// ---------------------------------------------------------------------------

describe('docs/03-traffic-and-statistics.md Part 2 — the formulas this repo holds itself to', () => {
  /**
   * Phase 2 acceptance (`docs/05-roadmap.md`) points the validator at that doc section, so
   * a formula stated there that disagrees with this module is a live trap: whoever compares
   * simulated handling capacity against the doc has no way to tell which side is wrong.
   * The doc previously wrote `HC5 = 300·P / RTT`, omitting the group size `L` while the
   * `%POP` line below it divided by the whole building population — a factor of 4 on
   * Midtown Office. This pins the corrected statement.
   */
  let part2: string;

  beforeAll(async () => {
    const source = await readFile(
      fileURLToPath(new URL('../../../../docs/03-traffic-and-statistics.md', import.meta.url)),
      'utf8',
    );
    const start = source.indexOf('## Part 2');
    const end = source.indexOf('## Part 3');
    expect(start, 'docs/03 has no Part 2 heading').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    part2 = source.slice(start, end);
  });

  it('states handling capacity as the whole-group figure, carrying L', () => {
    const line = part2
      .split('\n')
      .find((candidate) => candidate.trimStart().startsWith('HC5'));
    expect(line, 'docs/03 Part 2 no longer states an HC5 formula').toBeDefined();
    // Either equivalent form is fine; dropping L from both is not.
    expect(line ?? '').toMatch(/300·P·L\s*\/\s*RTT|300·P\s*\/\s*INT/);
  });

  it('agrees numerically with this module on Midtown Office', () => {
    // Evaluate the doc's expression by hand against the derived terms and check it against
    // what the module returns. 300·P·L/RTT = 300 × 12.8 × 4 / 149.5428 = 102.71, not the
    // 25.68 the L-less reading gives.
    const analysis = analyzeUpPeak(building('midtown-office'), specs);
    const { passengersPerTrip, carsInGroup } = analysis.roundTripTerms;
    const fromDoc =
      (300 * passengersPerTrip * carsInGroup) / analysis.result.roundTripTimeS;

    expect(fromDoc).toBeCloseTo(analysis.result.handlingCapacity5Min, 9);
    expect(fromDoc).toBeCloseTo(102.7130377, 6);
    expect((fromDoc / analysis.servedPopulation) * 100).toBeCloseTo(
      analysis.result.percentPopulation5Min,
      9,
    );

    // And the L-less reading is exactly L times smaller, which is the trap.
    expect(analysis.result.handlingCapacityPerCar5Min).toBeCloseTo(fromDoc / carsInGroup, 9);
    expect(analysis.result.handlingCapacityPerCar5Min).toBeCloseTo(25.6782594, 6);
  });
});

// ---------------------------------------------------------------------------
// The bridge to Barney's full ts
// ---------------------------------------------------------------------------

describe('acceleration loss — the bridge to the full definition of ts', () => {
  it('defaults to zero, which is the classic closed form', () => {
    const terms = deriveUpPeakTerms(building('midtown-office'), specs);
    expect(terms.stopTime.accelerationLossS).toBe(0);
  });

  it('adds exactly (S+1) × loss to the round trip', () => {
    const plain = analyzeUpPeak(building('midtown-office'), specs);
    // v/a = 2.5 / 1.0 = 2.5 s is the trapezoidal penalty of one accelerate/decelerate
    // cycle over covering the same distance at rated speed; a jerk-limited profile costs
    // a little more again. Charged (S+1) ≈ 10.5 times, it is worth ~26 s on a 150 s round
    // trip — around 18%, and the single largest thing the classic form leaves out.
    const withLoss = analyzeUpPeak(building('midtown-office'), specs, {
      accelerationLossPerStopS: 2.5,
    });

    expect(withLoss.result.roundTripTimeS - plain.result.roundTripTimeS).toBeCloseTo(
      (plain.result.expectedStops + 1) * 2.5,
      9,
    );
    expect(withLoss.result.roundTripTimeS / plain.result.roundTripTimeS).toBeGreaterThan(1.15);
    expect(withLoss.result.intervalS).toBeGreaterThan(plain.result.intervalS);
    expect(withLoss.result.handlingCapacity5Min).toBeLessThan(plain.result.handlingCapacity5Min);
  });
});

// ---------------------------------------------------------------------------
// The other shipped buildings
// ---------------------------------------------------------------------------

describe('Garden Apartments — a different door type, speed and transfer time', () => {
  /**
   * 5 populated floors above a single lobby, 3.0 m pitch, two 1600 lb hydraulic cars at
   * 0.63 m/s with side-opening doors. Residential transfer time is 1.75 s, not 1.2 s.
   *
   *   N = 5, df = (15.0 − 3.0)/4 = 3.0 m, tx = 3.0 − 3.0 − 0.0 = 0 m  (no express run)
   *   tv = 3.0 / 0.63 = 4.7619048 s
   *   ts = 2.5 + 4.0 + 0.5 + 0.7 = 7.7 s      (side-opening doors are slower)
   *   P  = ⌊1600/150⌋ × 0.8 = 10 × 0.8 = 8
   *   S  = 5 × (1 − 0.8^8) = 5 × (1 − 0.16777216) = 4.1611392
   *   H  = 5 − [0.2^8 + 0.4^8 + 0.6^8 + 0.8^8]
   *      = 5 − [0.00000256 + 0.00065536 + 0.01679616 + 0.16777216] = 4.81477376
   *   travel   = 2 × 4.81477376 × 4.7619048 = 45.8549882 s
   *   stops    = 5.1611392 × 7.7            = 39.7407718 s
   *   transfer = 2 × 8 × 1.75               = 28         s
   *   RTT                                   = 113.5957600 s
   *   INT = 56.80 s, HC = 300 × 8 × 2 / 113.59576 = 42.255 / 5 min, %POP = 35.2 %
   */
  it('reproduces the hand-computed round trip', () => {
    const analysis = analyzeUpPeak(building('garden-apartments'), specs);

    expect(analysis.terminalFloorId).toBe('G');
    expect(analysis.floorsAboveTerminal).toBe(5);
    expect(analysis.interfloorDistanceM).toBeCloseTo(3.0, 12);
    expect(analysis.expressRiseM).toBeCloseTo(0, 12);
    expect(analysis.stopTime.totalS).toBeCloseTo(7.7, 12);
    expect(analysis.roundTripTerms.passengerTransferS).toBe(1.75);
    expect(analysis.roundTripTerms.passengersPerTrip).toBeCloseTo(8, 12);

    expect(analysis.result.expectedStops).toBeCloseTo(4.1611392, 9);
    expect(analysis.result.highestReversalFloor).toBeCloseTo(4.81477376, 9);
    expect(analysis.result.travelTimeS).toBeCloseTo(45.8549882, 6);
    expect(analysis.result.stopTimeS).toBeCloseTo(39.7407718, 6);
    expect(analysis.result.transferTimeS).toBeCloseTo(28, 10);
    expect(analysis.result.roundTripTimeS).toBeCloseTo(113.59576, 5);
  });

  it('lands inside the residential interval target', () => {
    // docs/03-traffic-and-statistics.md Part 1: residential target interval 50–90 s.
    const { result } = analyzeUpPeak(building('garden-apartments'), specs);
    expect(result.intervalS).toBeGreaterThan(50);
    expect(result.intervalS).toBeLessThan(90);
    // Two cars for 120 residents is generous: capacity far exceeds the 3–7 % demand.
    expect(result.percentPopulation5Min).toBeGreaterThan(7);
  });

  it('warns that a fully loaded car stops nearly everywhere', () => {
    // P = 8 over N = 5 floors: S saturates towards N and RTT stops responding to load.
    const { warnings } = analyzeUpPeak(building('garden-apartments'), specs);
    expect(warningCodes(warnings)).toContain(UP_PEAK_WARNING_CODES.saturatedStops);
  });
});

describe('Secure Tower — zoning, express runs and skewed floor populations', () => {
  it('charges the high bank for its 56 m express run', () => {
    // The high bank serves G then nothing until floor 16 at 60.0 m. df across floors
    // 16–30 is (114.6 − 60.0)/14 = 3.9 m, so the express rise is 60.0 − 3.9 = 56.1 m,
    // worth 56.1 / 4.0 = 14.025 s each way — around 17 % of the round trip. Dropping the
    // tx term would understate this bank badly.
    const high = analyzeUpPeak(building('secure-tower'), specs, { bankId: 'high' });

    expect(high.terminalFloorId).toBe('G');
    expect(high.floorsAboveTerminal).toBe(15);
    expect(high.interfloorDistanceM).toBeCloseTo(3.9, 9);
    expect(high.expressRiseM).toBeCloseTo(56.1, 9);
    expect(high.roundTripTerms.expressJumpS).toBeCloseTo(14.025, 9);
    expect(high.servedPopulation).toBe(446);
    expect(warningCodes(high.warnings)).toContain(UP_PEAK_WARNING_CODES.expressZone);

    // The terminal the rule picks unaided is the one a human would name.
    const named = analyzeUpPeak(building('secure-tower'), specs, {
      bankId: 'high',
      entranceFloorId: 'G',
    });
    expect(named.result.roundTripTimeS).toBeCloseTo(high.result.roundTripTimeS, 9);

    expect(2 * high.roundTripTerms.expressJumpS).toBeGreaterThan(
      0.15 * high.result.roundTripTimeS,
    );
  });

  it('serves the low bank without an express run', () => {
    const low = analyzeUpPeak(building('secure-tower'), specs, { bankId: 'low' });
    expect(low.floorsAboveTerminal).toBe(14);
    expect(low.servedPopulation).toBe(546);
    // G → 2 is 5.4 m against a 3.9 m pitch, so a small but real 1.5 m express correction.
    expect(low.expressRiseM).toBeCloseTo(1.5, 9);
    expect(low.result.roundTripTimeS).toBeLessThan(
      analyzeUpPeak(building('secure-tower'), specs, { bankId: 'high' }).result.roundTripTimeS,
    );
  });

  it('warns that tenant floor populations are not uniform', () => {
    // 44 / 34 / 36 / 26 / 12 persons per floor by tenant. S is maximised at uniform, so
    // the closed form over-charges the stop term here.
    const low = analyzeUpPeak(building('secure-tower'), specs, { bankId: 'low' });
    expect(warningCodes(low.warnings)).toContain(
      UP_PEAK_WARNING_CODES.nonUniformFloorPopulations,
    );
  });

  it('requires a bank to be named when the building has several', () => {
    expect(() => analyzeUpPeak(building('secure-tower'), specs)).toThrow(AnalyticalError);
    expect(() => analyzeUpPeak(building('secure-tower'), specs, { bankId: 'nope' })).toThrow(
      /declares no bank "nope"/,
    );
  });
});

describe('Mixed-Use High-Rise — transfer floors, sky lobbies and a one-stop shuttle', () => {
  it('refuses to guess a transfer time for a mixed-use building', () => {
    // elevator-specs.json → timing.passengerTransferS has office / residential / hotel
    // rows and no mixed-use row, because a mixed-use tower's banks lift populations that
    // transfer at different rates. There is no honest default, so the caller must state one.
    expect(passengerTransferSecondsFor(specs, 'mixed-use')).toBeUndefined();
    expect(passengerTransferSecondsFor(specs, 'office')).toBe(1.2);
    expect(passengerTransferSecondsFor(specs, 'residential')).toBe(1.75);
    expect(passengerTransferSecondsFor(specs, 'hotel')).toBe(1.5);

    expect(() =>
      analyzeUpPeak(building('mixed-use-high-rise'), specs, { bankId: 'office-local' }),
    ).toThrow(/passengerTransferS/);
  });

  it('takes the sky lobby as the terminal for the residential bank', () => {
    // Floor 31 is flagged isTransferFloor, not isEntrance, and is the only way into
    // floors 32–60. The terminal rule has to reach it without being told.
    const residential = analyzeUpPeak(building('mixed-use-high-rise'), specs, {
      bankId: 'residential-local',
      passengerTransferS: 1.75,
    });

    expect(residential.terminalFloorId).toBe('31');
    expect(residential.terminalHeightM).toBeCloseTo(126.0, 9);
    expect(residential.floorsAboveTerminal).toBe(29);
    expect(residential.upperFloorIds.at(0)).toBe('32');
    expect(residential.upperFloorIds.at(-1)).toBe('60');
    expect(residential.interfloorDistanceM).toBeCloseTo(3.2, 9);
    expect(residential.servedPopulation).toBe(29 * 26);
    expect(residential.result.intervalS).toBeGreaterThan(0);
  });

  it('handles a one-stop shuttle, where N = 1 collapses S and H to 1', () => {
    // The shuttle serves G and the sky lobby at 31 and nothing else. df has no interfloor
    // gap to average, so it becomes the whole 126 m run and tx is zero.
    const shuttle = analyzeUpPeak(building('mixed-use-high-rise'), specs, {
      bankId: 'shuttle',
      passengerTransferS: 1.2,
    });

    expect(shuttle.terminalFloorId).toBe('G');
    expect(shuttle.floorsAboveTerminal).toBe(1);
    expect(shuttle.interfloorDistanceM).toBeCloseTo(126.0, 9);
    expect(shuttle.expressRiseM).toBe(0);
    expect(shuttle.result.expectedStops).toBe(1);
    expect(shuttle.result.highestReversalFloor).toBe(1);

    // P = ⌊4000/150⌋ × 0.8 = 26 × 0.8 = 20.8; tv = 126 / 8 = 15.75 s.
    //   travel   = 2 × 1 × 15.75  = 31.50 s
    //   stops    = (1 + 1) × 6.0  = 12.00 s
    //   transfer = 2 × 20.8 × 1.2 = 49.92 s
    //   RTT                       = 93.42 s
    expect(shuttle.roundTripTerms.passengersPerTrip).toBeCloseTo(20.8, 9);
    expect(shuttle.roundTripTerms.singleFloorTransitS).toBeCloseTo(15.75, 9);
    expect(shuttle.result.roundTripTimeS).toBeCloseTo(93.42, 9);
    expect(shuttle.result.intervalS).toBeCloseTo(23.355, 9);

    // And the caveat that matters: at 8 m/s over 126 m with a = 1.1 m/s², the car spends
    // most of the run accelerating or decelerating, so assuming rated speed throughout
    // overstates shuttle capacity by a wide margin. The building's own notes say so.
    expect(warningCodes(shuttle.warnings)).toContain(UP_PEAK_WARNING_CODES.saturatedStops);
  });

  it('refuses to let the shuttle report a meaningless %POP unremarked', () => {
    // The default U is the sum of population over the destination floors. For the shuttle
    // the only destination is the sky lobby at 31, whose population field is 260 — its
    // amenity occupants. But the shuttle lifts everyone bound above 31 as well: the 754
    // residents of floors 32–60 all ride it. So the honest U is 260 + 29×26 = 1014 and the
    // default is 3.9× too small, which surfaces as 102.8 % of population handled per five
    // minutes. Against a Part 1 demand range of 3–17 %, that reads as a wildly
    // over-elevatored shuttle when the truth is 26.3 %.
    const shuttle = analyzeUpPeak(building('mixed-use-high-rise'), specs, {
      bankId: 'shuttle',
      passengerTransferS: 1.2,
    });

    expect(shuttle.servedPopulation).toBe(260);
    expect(shuttle.result.handlingCapacity5Min).toBeCloseTo(267.1804, 3);
    expect(shuttle.result.percentPopulation5Min).toBeCloseTo(102.7617, 3);

    // Both detectors fire: the input-side one on the shape of the destinations, and the
    // output-side one on the number that shape produced.
    const codes = warningCodes(shuttle.warnings);
    expect(codes).toContain(UP_PEAK_WARNING_CODES.destinationsAreTransferFloors);
    expect(codes).toContain(UP_PEAK_WARNING_CODES.implausibleHandlingCapacity);

    const transferWarning = shuttle.warnings.find(
      (warning) => warning.code === UP_PEAK_WARNING_CODES.destinationsAreTransferFloors,
    );
    expect(transferWarning?.message).toMatch(/isTransferFloor/);
    expect(transferWarning?.message).toMatch(/servedPopulation/);
  });

  it('gives the shuttle a sane %POP once the population it lifts is stated', () => {
    // The escape hatch, exercised. 260 amenity occupants on 31 plus 29 residential floors
    // of 26 people each = 1014, and %POP drops from 102.8 % to 26.3 %.
    const lifted = 260 + 29 * 26;
    const shuttle = analyzeUpPeak(building('mixed-use-high-rise'), specs, {
      bankId: 'shuttle',
      passengerTransferS: 1.2,
      servedPopulation: lifted,
    });

    expect(lifted).toBe(1014);
    expect(shuttle.servedPopulation).toBe(1014);
    expect(shuttle.result.percentPopulation5Min).toBeCloseTo(26.3492, 3);
    // RTT is a property of the geometry and the load, so stating U moves %POP and nothing
    // else.
    expect(shuttle.result.roundTripTimeS).toBeCloseTo(93.42, 9);

    // The implausible-capacity warning clears; the structural one stays, because the
    // shuttle really is feeding another bank whatever U is set to.
    const codes = warningCodes(shuttle.warnings);
    expect(codes).not.toContain(UP_PEAK_WARNING_CODES.implausibleHandlingCapacity);
    expect(codes).toContain(UP_PEAK_WARNING_CODES.destinationsAreTransferFloors);
  });

  it('leaves the local banks unflagged: their destinations are final', () => {
    // The warning has to discriminate, or it is noise. Floors 32–60 and 2–30 are nobody's
    // transfer point and are served by one bank each, so neither local bank trips it.
    for (const [bankId, transferS] of [
      ['office-local', 1.2],
      ['residential-local', 1.75],
    ] as const) {
      const codes = warningCodes(
        analyzeUpPeak(building('mixed-use-high-rise'), specs, {
          bankId,
          passengerTransferS: transferS,
        }).warnings,
      );
      expect(codes).not.toContain(UP_PEAK_WARNING_CODES.destinationsAreTransferFloors);
      expect(codes).not.toContain(UP_PEAK_WARNING_CODES.implausibleHandlingCapacity);
    }
  });
});

describe('Vertical City — a bank the closed form cannot describe', () => {
  it('refuses the double-deck shuttle rather than inventing an answer', () => {
    // Every floor the shuttle serves is an unpopulated sky lobby, so there is no terminal
    // with population above it and no destination distribution to average over.
    expect(() => analyzeUpPeak(building('vertical-city'), specs, { bankId: 'shuttle' })).toThrow(
      AnalyticalError,
    );
    expect(() => analyzeUpPeak(building('vertical-city'), specs, { bankId: 'shuttle' })).toThrow(
      /no floor flagged isEntrance or isTransferFloor with populated floors above it/,
    );

    // Naming a terminal gets one step further and then hits the same wall from the
    // destination side.
    expect(() =>
      analyzeUpPeak(building('vertical-city'), specs, {
        bankId: 'shuttle',
        entranceFloorId: 'G',
      }),
    ).toThrow(/serves no populated floor above its terminal/);
  });

  it('can be analysed anyway once destinations and population are stated', () => {
    // The escape hatch, and the honest warning that comes with it.
    const shuttle = analyzeUpPeak(building('vertical-city'), specs, {
      bankId: 'shuttle',
      entranceFloorId: 'G',
      upperFloorIds: ['26', '51', '76'],
      servedPopulation: 6000,
      passengerTransferS: 1.2,
    });

    expect(shuttle.floorsAboveTerminal).toBe(3);
    expect(shuttle.servedPopulation).toBe(6000);
    expect(shuttle.result.roundTripTimeS).toBeGreaterThan(0);
    expect(warningCodes(shuttle.warnings)).toContain(UP_PEAK_WARNING_CODES.doubleDeck);
  });

  it('serves a normal local bank without complaint', () => {
    const zone1 = analyzeUpPeak(building('vertical-city'), specs, {
      bankId: 'zone-1-local',
      passengerTransferS: 1.2,
    });
    expect(zone1.terminalFloorId).toBe('G');
    expect(zone1.result.intervalS).toBeGreaterThan(0);
    // Floor 2 is the upper-deck boarding level: served, above the terminal, unpopulated,
    // and therefore not an up-peak destination.
    expect(zone1.upperFloorIds).not.toContain('2');
    expect(warningCodes(zone1.warnings)).toContain(
      UP_PEAK_WARNING_CODES.unpopulatedFloorsExcluded,
    );
  });
});

// ---------------------------------------------------------------------------
// Overrides and failure modes
// ---------------------------------------------------------------------------

describe('overrides', () => {
  it('honours an explicit terminal, and rejects one the bank does not serve', () => {
    const fromGarage = analyzeUpPeak(building('midtown-office'), specs, {
      entranceFloorId: 'P1',
    });
    // Loading from the garage drags the (unpopulated) lobby into the served set as a
    // non-destination and lengthens every trip by the extra 3.5 m.
    expect(fromGarage.terminalFloorId).toBe('P1');
    expect(fromGarage.floorsAboveTerminal).toBe(19);
    expect(fromGarage.result.roundTripTimeS).toBeGreaterThan(
      analyzeUpPeak(building('midtown-office'), specs).result.roundTripTimeS,
    );

    expect(() =>
      analyzeUpPeak(building('midtown-office'), specs, { entranceFloorId: '99' }),
    ).toThrow(AnalyticalError);
  });

  it('honours explicit geometry, payload and transfer overrides', () => {
    const base = analyzeUpPeak(building('midtown-office'), specs);
    const tweaked = analyzeUpPeak(building('midtown-office'), specs, {
      interfloorDistanceM: 4.0,
      ratedSpeedMps: 5.0,
      passengerTransferS: 1.0,
      designLoadFactor: 1.0,
    });

    expect(tweaked.interfloorDistanceM).toBe(4.0);
    expect(tweaked.ratedSpeedMps).toBe(5.0);
    expect(tweaked.roundTripTerms.singleFloorTransitS).toBeCloseTo(0.8, 12);
    expect(tweaked.roundTripTerms.passengersPerTrip).toBe(16);
    expect(tweaked.roundTripTerms.passengerTransferS).toBe(1.0);
    expect(tweaked.result.roundTripTimeS).not.toBeCloseTo(base.result.roundTripTimeS, 3);
  });

  it('takes P directly when asked, bypassing capacity × load factor', () => {
    const analysis = analyzeUpPeak(building('midtown-office'), specs, {
      passengersPerTrip: 12,
    });
    // The integer the simulator will actually board, ⌊16 × 0.8⌋ = 12, rather than 12.8.
    // Its handling capacity is ~6 % below the closed form's — the `fractional-capacity`
    // divergence, made measurable.
    expect(analysis.roundTripTerms.passengersPerTrip).toBe(12);
    const fractional = analyzeUpPeak(building('midtown-office'), specs);
    const ratio =
      analysis.result.handlingCapacity5Min / fractional.result.handlingCapacity5Min;
    expect(ratio).toBeLessThan(1);
    expect(ratio).toBeGreaterThan(0.9);
  });

  it('rejects a destination floor at or below the terminal', () => {
    expect(() =>
      analyzeUpPeak(building('midtown-office'), specs, { upperFloorIds: ['G', '5'] }),
    ).toThrow(/at or below the terminal/);
    expect(() =>
      analyzeUpPeak(building('midtown-office'), specs, { upperFloorIds: ['5', '404'] }),
    ).toThrow(AnalyticalError);
  });

  it('rejects a repeated destination floor rather than inflating N', () => {
    expect(() =>
      analyzeUpPeak(building('midtown-office'), specs, { upperFloorIds: ['5', '6', '5'] }),
    ).toThrow(/duplicates/);
  });
});

describe('every shipped building is either analysable or explicit about why not', () => {
  it('produces a positive, finite interval for every ordinary bank', () => {
    const transferOverride: Record<string, number> = { 'mixed-use': 1.2 };
    let analysed = 0;
    let refused = 0;
    let implausible = 0;

    for (const resolved of config.buildings) {
      for (const bank of resolved.banks) {
        const options = {
          bankId: bank.id,
          ...(transferOverride[resolved.type] === undefined
            ? {}
            : { passengerTransferS: transferOverride[resolved.type] }),
        };

        let analysis;
        try {
          analysis = analyzeUpPeak(resolved, specs, options);
        } catch (error) {
          // The only acceptable refusal is a stated one.
          expect(error).toBeInstanceOf(AnalyticalError);
          refused += 1;
          continue;
        }

        analysed += 1;
        expect(Number.isFinite(analysis.result.roundTripTimeS)).toBe(true);
        expect(analysis.result.roundTripTimeS).toBeGreaterThan(0);
        expect(analysis.result.intervalS).toBeGreaterThan(0);
        expect(analysis.result.handlingCapacity5Min).toBeGreaterThan(0);
        expect(analysis.result.percentPopulation5Min).toBeGreaterThan(0);
        // > 0 on its own passes anything, including the 102.8 % the shuttle used to report
        // silently against the wrong population. A %POP past the sanity bound is allowed
        // only if the analysis says out loud that it is not to be believed.
        if (analysis.result.percentPopulation5Min > IMPLAUSIBLE_PERCENT_POPULATION_5MIN) {
          implausible += 1;
          expect(
            warningCodes(analysis.warnings),
            `${resolved.id}/${bank.id} reports ${analysis.result.percentPopulation5Min.toFixed(1)} % of population per 5 min unflagged`,
          ).toContain(UP_PEAK_WARNING_CODES.implausibleHandlingCapacity);
        }
        // A round trip of a whole minute to half an hour brackets everything from a
        // two-storey hydraulic to a supertall shuttle. Outside that, something is wrong.
        expect(analysis.result.roundTripTimeS).toBeGreaterThan(30);
        expect(analysis.result.roundTripTimeS).toBeLessThan(1800);
        expect(analysis.result.highestReversalFloor).toBeLessThanOrEqual(
          analysis.floorsAboveTerminal,
        );
        expect(analysis.result.expectedStops).toBeLessThanOrEqual(
          analysis.floorsAboveTerminal,
        );
      }
    }

    // The sweep must not pass vacuously by refusing everything. As of the shipped data,
    // 16 of the 17 banks are analysable; only Vertical City's double-deck shuttle between
    // unpopulated sky lobbies is not. The three new members are the three single-bank
    // buildings — Chancery House, Crown Hotel and St Jude Hospital — and all three analyse,
    // including the two whose banks hold cars of unlike speed and capacity.
    expect(analysed).toBe(16);
    expect(refused).toBe(1);
    // Exactly one bank exceeds the sanity bound on the default population: Mixed-Use
    // High-Rise's shuttle, whose U is the sky lobby's own 260 rather than the 1014 it
    // lifts. Every other bank's default U is the population it actually serves.
    expect(implausible).toBe(1);
  });
});
