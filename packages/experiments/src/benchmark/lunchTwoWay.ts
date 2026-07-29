/**
 * **Does Midtown Office's lunch period actually change its directional mix? Measured on the
 * traffic, with no dispatcher in the room.**
 *
 * ```ts
 * const study = measureLunchTwoWayMix();   // three arms, 24 traces each, no Simulation
 * study.arms[0].largestStandardizedDeviation;   // the figure DECISIONS.md § D156 reports as +1.83
 * ```
 *
 * ## What this measures, and why it is not a dispatcher study
 *
 * `DECISIONS.md` § D156 § 1 screened all eight of Phase 6c's pre-registered operating points for
 * whether the three detector inputs move in **ratio** within a run, and found they do not: over a
 * time-bin × direction-category table, Pearson's homogeneity statistic was inside its own noise at
 * every cell with more than one category, *"the largest standardized deviation across the whole
 * grid is **+1.83 σ**"*, and four cells had one direction category by construction. Its conclusion
 * was structural — `DemandPhase` carried a scalar intensity, so the split could not vary.
 *
 * This module measures the same statistic, over the same shaped table, on the template built to
 * make it vary. It is **the same question asked of the traffic rather than of a run**: the three
 * quantities counted here are the detector's own three, classified by
 * `dispatch/selector.ts`'s own rule — *down* is `downPeakRate` whatever floor it starts on, an *up*
 * trip from an entrance is `lobbyArrivalRate`, an *up* trip from anywhere else is `interfloorRate`
 * — read off each passenger's **first leg** in the trace. No `Simulation` is constructed, no
 * dispatcher profile is named and no weight set exists. That is a constraint rather than an
 * economy: § D162 condition 3 requires the template to be committed **before** any Phase 6c arm
 * runs on it, and *"the commit that adds it may not also add a selector result."*
 *
 * ## The three arms, and why the third one is the honest comparison
 *
 * | arm | what it is |
 * |---|---|
 * | `lunch-two-way` | the shipped operating point, {@link MIDTOWN_LUNCH_TWO_WAY} |
 * | `lunch-two-way-flat` | the same, mix arc collapsed, total demand equal — § D162 condition 5 |
 * | `rise-and-fall` | the shipped template at the same building, rate, horizon and window |
 *
 * The third is what makes the first legible. § D156's +1.83 σ was measured on windows holding
 * **4 to 36 arrivals**, where, as it says itself, *"an observed ratio is dominated by counting
 * noise"* — so quoting a large statistic here against that number without re-measuring the shipped
 * template in the *same* apparatus, at the *same* counts, would be comparing a measurement to a
 * different measurement's units. The third arm supplies the like-for-like baseline; § D156's own
 * figure is quoted beside it and is not the thing being beaten.
 *
 * ## Publishes counts, not intervals
 *
 * A χ² and a standardized residual are not estimates with standard errors, and the claim is
 * categorical: *the mix varies, or it does not*. So this classifies `'no-intervals'` in
 * `published.ts` and its non-test caller is `livenessSuite.ts`, the driver the categorical half of
 * this directory has had since the ninth dead seam.
 */

import { generateTrace, StreamSet, type PassengerTrace, type ResolvedBuilding } from '@elevator-sim/core';

import { loadResources } from '../validation/harness.js';

import { MIDTOWN_LUNCH_FLAT_CONTROL, MIDTOWN_LUNCH_TWO_WAY } from './arms.js';

/* -------------------------------------------------------------------------- *
 * The three detector inputs, as a property of the trace
 * -------------------------------------------------------------------------- */

/** The detector's three categories, in `SELECTOR_INPUTS` order. */
export const DETECTOR_INPUTS = Object.freeze(['lobby', 'interfloor', 'down'] as const);

export type DetectorInput = (typeof DETECTOR_INPUTS)[number];

/**
 * The building this study measures. Named once, and it is the building the operating point names.
 */
export const LUNCH_TWO_WAY_BUILDING = 'midtown-office';

/**
 * Bins the reported window is split into.
 *
 * **Six, because § D156 used six**: its table is `X² … on 10 df`, and `(6 − 1) · (3 − 1) = 10`. The
 * comparison is only meaningful if the tables have the same shape, so the shape is inherited
 * rather than chosen.
 */
export const MIX_TIME_BINS = 6;

/** Master seed. Distinct from every other study's, so agreement is not shared traffic. */
export const LUNCH_TWO_WAY_SEED = 20_260_729;

/* -------------------------------------------------------------------------- *
 * Result shapes
 * -------------------------------------------------------------------------- */

/** One arm's `bins × categories` contingency table and the statistic over it. */
export interface MixHomogeneity {
  readonly id: string;
  readonly label: string;
  readonly templateId: string;
  /** `undefined` when the arm's template declares no mix at all. */
  readonly mixAmplitude: number | undefined;
  readonly replications: number;
  /** Arrivals inside the reported window, pooled across replications. */
  readonly windowArrivals: number;
  /** Mean arrivals per replication — § D156's own column, so the counts are comparable. */
  readonly arrivalsPerReplication: number;
  /** `MIX_TIME_BINS` rows, each `[lobby, interfloor, down]`. */
  readonly counts: readonly (readonly [number, number, number])[];
  /** The same rows as percentages of their own row total, rounded to one decimal. */
  readonly mixPct: readonly (readonly [number, number, number])[];
  readonly chiSquare: number;
  readonly degreesOfFreedom: number;
  /**
   * The Pearson standardized residual `(O − E)/√E` of largest magnitude, **signed**.
   *
   * The figure § D156 reports per cell, and the one to compare against its `+1.83`.
   */
  readonly largestStandardizedDeviation: number;
  /** Categories with any count at all. Fewer than two means the table has 0 df, as § D156 found. */
  readonly liveCategories: number;
  /**
   * `lobby : down` in the first bin and in the last, and the factor between them.
   *
   * The **ratio** is what § D151 § 5 says the question is: *"which pattern am I in lives in their
   * ratios, not their level."* A χ² says the table is not homogeneous; this says in which
   * direction and by how much, which is the part a reader can argue with.
   */
  readonly lobbyToDownFirstBin: number;
  readonly lobbyToDownLastBin: number;
  /** `max/min` of the two above, or `Infinity` when one bin has no down traffic at all. */
  readonly lobbyToDownSwing: number;
}

export interface LunchTwoWayMixStudy {
  readonly buildingId: string;
  readonly seed: number;
  readonly bins: number;
  /** § D156's own worst standardized deviation, quoted so the comparison is on the page. */
  readonly shippedTemplateBaselineFromD156: number;
  readonly arms: readonly MixHomogeneity[];
}

export interface LunchTwoWayMixOptions {
  /** Traces per arm. Default 24 — trace generation only, so this is seconds rather than minutes. */
  readonly replications?: number | undefined;
  readonly seed?: number | undefined;
}

/* -------------------------------------------------------------------------- *
 * Measurement
 * -------------------------------------------------------------------------- */

/**
 * Classify one journey the way `ArrivalWindow.observe` classifies one landing arrival.
 *
 * Its rule, in its order: a **down** first leg is `downPeakRate` whatever floor it starts on; an
 * up leg from an entrance is `lobbyArrivalRate`; an up leg from anywhere else is `interfloorRate`.
 * Reproduced rather than approximated by the trace's own `category` field, which is a different
 * partition — an interfloor trip from 15 to 5 is `interfloor` to the generator and `down` to the
 * detector, and it is the detector's answer this study is about.
 */
function classify(
  originFloorIndex: number,
  destinationFloorIndex: number,
  entranceIndices: ReadonlySet<number>,
): DetectorInput | undefined {
  if (destinationFloorIndex < originFloorIndex) return 'down';
  if (destinationFloorIndex === originFloorIndex) return undefined;
  return entranceIndices.has(originFloorIndex) ? 'lobby' : 'interfloor';
}

/** Accumulate one trace's in-window arrivals into a `bins × 3` table. */
function tabulate(
  trace: PassengerTrace,
  entranceIndices: ReadonlySet<number>,
  bins: number,
  table: number[][],
): void {
  const start = trace.reportWindowStartS;
  const span = trace.reportWindowEndS - start;
  if (!(span > 0)) return;
  for (const passenger of trace.passengers) {
    if (!passenger.inReportWindow) continue;
    const leg = passenger.legs[0];
    if (leg === undefined) continue;
    const input = classify(leg.originFloorIndex, leg.destinationFloorIndex, entranceIndices);
    if (input === undefined) continue;
    // The last instant of the window belongs to the last bin rather than to a seventh.
    const bin = Math.min(bins - 1, Math.floor(((passenger.arrivalTimeS - start) / span) * bins));
    const row = table[bin];
    const column = DETECTOR_INPUTS.indexOf(input);
    if (row === undefined || row[column] === undefined) continue;
    row[column] += 1;
  }
}

/**
 * Pearson's homogeneity statistic over a contingency table, and its worst standardized residual.
 *
 * Rows and columns with no observations at all are dropped before the degrees of freedom are
 * counted, which is what makes `liveCategories` worth reporting: § D156 found four cells with one
 * live category and **0 df**, where the statistic cannot be computed rather than being small.
 */
function homogeneity(table: readonly (readonly number[])[]): {
  chiSquare: number;
  degreesOfFreedom: number;
  largestStandardizedDeviation: number;
  liveCategories: number;
} {
  const rowTotals = table.map((row) => row.reduce((sum, value) => sum + value, 0));
  const columns = table[0]?.length ?? 0;
  const columnTotals = Array.from({ length: columns }, (_, column) =>
    table.reduce((sum, row) => sum + (row[column] ?? 0), 0),
  );
  const total = rowTotals.reduce((sum, value) => sum + value, 0);
  const liveRows = rowTotals.filter((value) => value > 0).length;
  const liveCategories = columnTotals.filter((value) => value > 0).length;
  if (total === 0 || liveRows < 2 || liveCategories < 2) {
    return { chiSquare: 0, degreesOfFreedom: 0, largestStandardizedDeviation: 0, liveCategories };
  }

  let chiSquare = 0;
  let worst = 0;
  for (const [rowIndex, row] of table.entries()) {
    const rowTotal = rowTotals[rowIndex] ?? 0;
    if (rowTotal === 0) continue;
    for (const [column, columnTotal] of columnTotals.entries()) {
      if (columnTotal === 0) continue;
      const expected = (rowTotal * columnTotal) / total;
      if (expected <= 0) continue;
      const residual = ((row[column] ?? 0) - expected) / Math.sqrt(expected);
      chiSquare += residual * residual;
      if (Math.abs(residual) > Math.abs(worst)) worst = residual;
    }
  }
  return {
    chiSquare,
    degreesOfFreedom: (liveRows - 1) * (liveCategories - 1),
    largestStandardizedDeviation: worst,
    liveCategories,
  };
}

/** One arm: a template, its overrides, and the label the report prints. */
interface MixArmSpec {
  readonly id: string;
  readonly label: string;
  readonly templateId: 'lunch-two-way' | 'rise-and-fall';
  readonly mixAmplitude: number | undefined;
}

const ARMS: readonly MixArmSpec[] = Object.freeze([
  Object.freeze({
    id: 'lunch-two-way',
    label: 'Midtown Office, lunch two-way 1.5 %, full run',
    templateId: 'lunch-two-way',
    mixAmplitude: 1,
  } as const),
  Object.freeze({
    id: 'lunch-two-way-flat',
    label: 'the same, mix arc collapsed (§ D162 condition 5)',
    templateId: 'lunch-two-way',
    mixAmplitude: 0,
  } as const),
  Object.freeze({
    id: 'rise-and-fall',
    label: 'the shipped template at the same point — the like-for-like baseline',
    templateId: 'rise-and-fall',
    mixAmplitude: undefined,
  } as const),
]);

/**
 * Measure the directional mix over the window, per arm.
 *
 * @throws Error when the shipped data does not carry the building the operating point names.
 */
export async function measureLunchTwoWayMix(
  options: LunchTwoWayMixOptions = {},
): Promise<LunchTwoWayMixStudy> {
  const replications = options.replications ?? 24;
  const seed = options.seed ?? LUNCH_TWO_WAY_SEED;
  const config = await loadResources();
  const building: ResolvedBuilding | undefined = config.buildingsById.get(LUNCH_TWO_WAY_BUILDING);
  if (building === undefined) {
    throw new Error(`No building "${LUNCH_TWO_WAY_BUILDING}" in the shipped data directory.`);
  }
  const entranceIndices = new Set(building.entranceFloors.map((floor) => floor.index));
  // The operating point's own numbers, read off the shipped spec rather than repeated here, so a
  // change to the spec cannot leave this study quietly measuring a different cell.
  const demand = MIDTOWN_LUNCH_TWO_WAY.demand ?? {};
  const flatDemand = MIDTOWN_LUNCH_FLAT_CONTROL.demand ?? {};

  const arms: MixHomogeneity[] = [];
  for (const arm of ARMS) {
    const table: number[][] = Array.from({ length: MIX_TIME_BINS }, () => [0, 0, 0]);
    let windowArrivals = 0;
    for (let replication = 0; replication < replications; replication += 1) {
      const trace = generateTrace({
        building,
        profiles: config.trafficProfiles,
        streams: new StreamSet(BigInt(seed + replication)),
        template: arm.templateId,
        templateOverrides: {
          durationS: MIDTOWN_LUNCH_TWO_WAY.durationS ?? 1800,
          peakWindowS: demand.peakWindowS ?? 300,
          ...(arm.mixAmplitude === undefined ? {} : { mixAmplitude: arm.mixAmplitude }),
        },
        ...(demand.arrivalRatePctPop5min === undefined
          ? {}
          : { arrivalRatePctPop5min: demand.arrivalRatePctPop5min }),
        ...(demand.entranceWeights === undefined ? {} : { entranceWeights: demand.entranceWeights }),
      });
      // `rise-and-fall` reports its peak 5 minutes and the arms are compared over a whole period,
      // so the shipped-template arm is tabulated over the run rather than over its own window. The
      // three tables then cover the same seconds, which is the only way the χ² values compare.
      const wholeRun: PassengerTrace = {
        ...trace,
        reportWindowStartS: 0,
        reportWindowEndS: trace.durationS,
        passengers: trace.passengers.map((passenger) => ({ ...passenger, inReportWindow: true })),
      };
      tabulate(wholeRun, entranceIndices, MIX_TIME_BINS, table);
      windowArrivals += wholeRun.passengers.length;
    }

    const stats = homogeneity(table);
    const ratioOf = (row: readonly number[] | undefined): number => {
      const lobby = row?.[0] ?? 0;
      const down = row?.[2] ?? 0;
      return down === 0 ? Number.POSITIVE_INFINITY : lobby / down;
    };
    const first = ratioOf(table[0]);
    const last = ratioOf(table[MIX_TIME_BINS - 1]);
    arms.push({
      id: arm.id,
      label: arm.label,
      templateId: arm.templateId,
      mixAmplitude: arm.id === 'lunch-two-way-flat' ? (flatDemand.mixAmplitude ?? 0) : arm.mixAmplitude,
      replications,
      windowArrivals,
      arrivalsPerReplication: windowArrivals / replications,
      counts: table.map((row) => [row[0] ?? 0, row[1] ?? 0, row[2] ?? 0] as const),
      mixPct: table.map((row) => {
        const total = (row[0] ?? 0) + (row[1] ?? 0) + (row[2] ?? 0);
        const pct = (value: number): number =>
          total === 0 ? 0 : Math.round(((value / total) * 100 + Number.EPSILON) * 10) / 10;
        return [pct(row[0] ?? 0), pct(row[1] ?? 0), pct(row[2] ?? 0)] as const;
      }),
      lobbyToDownFirstBin: first,
      lobbyToDownLastBin: last,
      lobbyToDownSwing:
        first === 0 || last === 0 ? Number.POSITIVE_INFINITY : Math.max(first / last, last / first),
      ...stats,
    });
  }

  return Object.freeze({
    buildingId: LUNCH_TWO_WAY_BUILDING,
    seed,
    bins: MIX_TIME_BINS,
    shippedTemplateBaselineFromD156: 1.83,
    arms: Object.freeze(arms),
  });
}

/** One line per arm, for {@link import('./livenessSuite.js')}'s report. */
export function formatLunchTwoWayMix(study: LunchTwoWayMixStudy): readonly string[] {
  const lines = [
    `lunch two-way mix — ${study.buildingId}, ${study.bins} time bins x 3 detector inputs, seed ${study.seed}`,
    `  § D156 measured the shipped templates flat: largest standardized deviation +${study.shippedTemplateBaselineFromD156.toFixed(2)} across eight operating points`,
  ];
  for (const arm of study.arms) {
    lines.push(
      `  ${arm.id.padEnd(20)} X² ${arm.chiSquare.toFixed(1).padStart(9)} on ${arm.degreesOfFreedom} df` +
        `, worst z ${arm.largestStandardizedDeviation >= 0 ? '+' : ''}${arm.largestStandardizedDeviation.toFixed(2)}` +
        `, ${arm.arrivalsPerReplication.toFixed(1)} arrivals/replication, live categories ${arm.liveCategories}` +
        `, lobby:down ${arm.lobbyToDownFirstBin.toFixed(2)} -> ${arm.lobbyToDownLastBin.toFixed(2)} (x${arm.lobbyToDownSwing.toFixed(1)})`,
    );
    for (const [index, row] of arm.mixPct.entries()) {
      lines.push(`      bin ${index + 1}: L/I/D ${row[0].toFixed(1)}/${row[1].toFixed(1)}/${row[2].toFixed(1)}`);
    }
  }
  return lines;
}
