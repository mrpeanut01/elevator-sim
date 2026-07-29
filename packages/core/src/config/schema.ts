/**
 * Runtime validation for the JSON reference data, plus the diagnostic vocabulary the rest
 * of the config module reports through.
 *
 * The schemas mirror `types.ts` one-for-one; the `Conforms` assertions at the bottom fail
 * the build if the two drift apart.
 *
 * Every object schema is **strict**: an unrecognized key is an error, not silently
 * dropped. A misspelled tunable that is quietly ignored is exactly the failure mode
 * CLAUDE.md invariant 8 exists to prevent — if a knob is real, it is declared here.
 */

import { z } from 'zod';

import {
  AGGREGATIONS,
  ASSIGNMENT_MODES,
  PASSENGER_ASSIGNMENT_MODES,
  ASSIGNMENT_TIMINGS,
  BUILDING_TYPES,
  CALL_TYPES,
  COMMITMENT_POINTS,
  DOOR_TYPES,
  DWELL_POLICIES,
  PARKING_STRATEGIES,
  REASSIGNMENT_POLICIES,
  SERVICE_MODES,
  WEIGHT_SET_POLICIES,
  type AccessZone,
  type BankConfig,
  type BuildingConfig,
  type CarConfig,
  type ConfigIssue,
  type CostTerm,
  type DispatcherProfile,
  type DispatcherProfiles,
  type ElevatorSpec,
  type ElevatorSpecs,
  type FloorConfig,
  type FloorRange,
  type ServiceEventConfig,
  type TrafficProfile,
  type TrafficProfiles,
} from './types.js';

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Stable codes for fatal problems. Tests and tooling match on these, not on prose. */
export const ISSUE_CODES = {
  missingFile: 'missing-file',
  unreadableFile: 'unreadable-file',
  invalidJson: 'invalid-json',
  schema: 'schema',
  noBuildings: 'no-buildings',
  duplicateId: 'duplicate-id',
  noFloors: 'no-floors',
  invalidFloorRange: 'invalid-floor-range',
  floorHeightOrder: 'floor-height-order',
  deckConfiguration: 'deck-configuration',
  deckSeparationMismatch: 'deck-separation-mismatch',
  floorPair: 'floor-pair',
  floorRangeOverlap: 'floor-range-overlap',
  floorRangeTooLarge: 'floor-range-too-large',
  unknownFloor: 'unknown-floor',
  unknownSpec: 'unknown-spec',
  unknownDoorType: 'unknown-door-type',
  unknownTrafficProfile: 'unknown-traffic-profile',
  unknownCostTerm: 'unknown-cost-term',
  /**
   * A bank declares no cars.
   *
   * Raised by `resolveBuilding`. A building read from a file never reaches it, because
   * {@link bankConfigSchema} refuses `cars: []` one stage earlier — but `resolveBuilding` is a
   * public entry point that the editor, the fixtures and the fuzzers hand hand-built objects to,
   * and it accepted what the schema rejects. Both gates now give the same verdict, which is also
   * `deriveUpPeakTerms`' (`emptyGroup`): a group of zero cars has no interval.
   */
  emptyBank: 'empty-bank',
  invalidConvention: 'invalid-convention',
  /** The building type has no row in `timing.passengerTransferS` and no car stated one. */
  missingPassengerTransfer: 'missing-passenger-transfer',
  /** A `serviceEvents` entry names a car this building does not have, or names one ambiguously. */
  unknownServiceEventCar: 'unknown-service-event-car',
} as const;

/** Stable codes for non-fatal diagnostics. */
export const WARNING_CODES = {
  populationMismatch: 'population-mismatch',
  speedOutsideClassRange: 'speed-outside-class-range',
  loadOutsideClassRange: 'load-outside-class-range',
  riseExceedsClass: 'rise-exceeds-class',
  floorsExceedClass: 'floors-exceed-class',
  noEntranceFloor: 'no-entrance-floor',
  unknownWeightSetProfile: 'unknown-weight-set-profile',
  /**
   * The bank has double-deck cars and no `servesFloorPairs`, so **there is no deck geometry to
   * simulate** and the runtime runs the car as a single deck of the combined capacity.
   *
   * This is the disclaimer `double-deck-not-simulated` used to be, narrowed to the only case
   * where it is still true. Double-deck operation *is* simulated as of Phase 6: `shaftForBank`
   * builds a deck-aware shaft from this pairing, one stop opens onto both floors of a pair, the
   * 80 % design load applies per deck and the dwell is the busier deck. All of that is downstream
   * of the pairing — a bank that declares none gets a single-deck shaft, really does make up to
   * twice the stops the declared hardware would, and really does report round-trip times,
   * intervals and handling capacities for a machine nobody configured.
   *
   * So the code kept its meaning and lost its scope, rather than being deleted: `planRun` in
   * `cli/src/commands/run.ts` still branches on it and is still its named non-test reader
   * (DECISIONS.md § D23), and `config/doubleDeck.test.ts` still asserts it in both directions.
   * It is raised on **no shipped building** — `vertical-city`'s shuttle declares its four pairs
   * — which is the difference between a disclaimer and a defect.
   */
  missingFloorPairs: 'missing-floor-pairs',
  unusedFloorPairs: 'unused-floor-pairs',
  deckLoadMismatch: 'deck-load-mismatch',
  deckPersonsOutsideClassRange: 'deck-persons-outside-class-range',
} as const;

/** Render a zod path as `banks[0].cars[1].spec`. */
export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else if (out === '') {
      out += String(segment);
    } else {
      out += `.${String(segment)}`;
    }
  }
  return out;
}

/** Render issues grouped by file, one bullet each. */
export function formatConfigIssues(
  issues: readonly ConfigIssue[],
  options: { readonly summary?: string; readonly hint?: string } = {},
): string {
  const count = issues.length;
  const summary =
    options.summary ?? `Invalid configuration: ${count} problem${count === 1 ? '' : 's'}`;
  const byFile = new Map<string, ConfigIssue[]>();
  for (const issue of issues) {
    const bucket = byFile.get(issue.file);
    if (bucket === undefined) byFile.set(issue.file, [issue]);
    else bucket.push(issue);
  }
  const lines = [summary];
  for (const [file, fileIssues] of byFile) {
    lines.push(`  ${file}`);
    for (const issue of fileIssues) {
      const where = issue.path === '' ? '(root)' : issue.path;
      lines.push(`    - ${where}: ${issue.message}`);
    }
  }
  if (options.hint !== undefined) lines.push(`  ${options.hint}`);
  return lines.join('\n');
}

/**
 * A configuration failure carrying every problem found, each located by file and JSON
 * path. Never throw a bare zod error out of this module: the caller is a human editing a
 * JSON file and needs to be told which file, which field, and what was expected.
 */
export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(
    issues: readonly ConfigIssue[],
    options: { readonly summary?: string; readonly hint?: string } = {},
  ) {
    super(formatConfigIssues(issues, options));
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/** Build a single-issue `ConfigError`. */
export function configError(
  issue: ConfigIssue,
  options: { readonly summary?: string; readonly hint?: string } = {},
): ConfigError {
  return new ConfigError([issue], options);
}

/** Convert a zod failure into located issues. */
export function issuesFromZodError(error: z.ZodError, file: string): ConfigIssue[] {
  return error.issues.map((issue) => ({
    file,
    path: formatPath(issue.path),
    message: issue.message,
    code: ISSUE_CODES.schema,
  }));
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** zod rejects `NaN` and `Infinity` for `z.number()`, so plain numbers are already finite. */
const nonNegative = z.number().min(0);
const positive = z.number().gt(0);
const fraction = z.number().min(0).max(1);
const identifier = z.string().min(1, 'must be a non-empty string');
const comment = z.string().optional();

const valueRangeSchema = z
  .strictObject({ min: z.number(), max: z.number(), typical: z.number() })
  .refine((r) => r.min <= r.typical && r.typical <= r.max, {
    message: 'expected min <= typical <= max',
  });

const typicalMaxSchema = z
  .strictObject({ typical: z.number(), max: z.number() })
  .refine((r) => r.typical <= r.max, { message: 'expected typical <= max' });

/** Flag duplicate `id` values in an array of records. */
function checkUniqueIds(
  items: readonly { readonly id: string }[],
  field: string,
  ctx: z.RefinementCtx,
): void {
  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    const first = seen.get(item.id);
    if (first === undefined) {
      seen.set(item.id, index);
      return;
    }
    ctx.addIssue({
      code: 'custom',
      path: [field, index, 'id'],
      message: `duplicate id "${item.id}"; already declared at ${field}[${first}]. Ids must be unique.`,
    });
  });
}

// ---------------------------------------------------------------------------
// data/elevator-specs.json
// ---------------------------------------------------------------------------

const doorTimingSchema = z.strictObject({
  openS: positive,
  closeS: positive,
});

const doorTimingsSchema = z.strictObject({
  centerOpening: doorTimingSchema,
  sideOpening: doorTimingSchema,
  dwellCarCallS: valueRangeSchema,
  dwellHallCallS: valueRangeSchema,
});

export const elevatorSpecSchema = z.strictObject({
  $comment: comment,
  id: identifier,
  name: z.string().min(1),
  ratedSpeedMps: valueRangeSchema,
  maxRiseM: positive,
  maxFloors: z.number().int().positive(),
  acceleration: typicalMaxSchema,
  jerk: typicalMaxSchema,
  capacityLbRange: z
    .tuple([positive, positive])
    .refine(([low, high]) => low <= high, { message: 'expected [lowLb, highLb] with low <= high' }),
  application: z.string().min(1),
  doubleDeckPersonsPerDeck: z
    .tuple([positive, positive])
    .refine(([low, high]) => low <= high, { message: 'expected [low, high] with low <= high' })
    .optional(),
});

/** `ratedLoadLb / 150`. The divisor is data; `resolveCar` reads it from here. */
const PERSONS_PER_LOAD_US_PATTERN = /^\s*ratedLoadLb\s*\/\s*(\d+(?:\.\d+)?)\s*$/u;
/** `ratedLoadKg / 75`. */
const PERSONS_PER_LOAD_EN81_PATTERN = /^\s*ratedLoadKg\s*\/\s*(\d+(?:\.\d+)?)\s*$/u;

/** Extract the divisor from a `personsPerRatedLoad*` convention string. */
export function parseLoadDivisor(expression: string, imperial: boolean): number | undefined {
  const match = (imperial ? PERSONS_PER_LOAD_US_PATTERN : PERSONS_PER_LOAD_EN81_PATTERN).exec(
    expression,
  );
  if (match === null) return undefined;
  const divisor = Number(match[1]);
  return Number.isFinite(divisor) && divisor > 0 ? divisor : undefined;
}

const conventionsSchema = z.strictObject({
  $comment: comment,
  personsPerRatedLoadUS: z
    .string()
    .regex(PERSONS_PER_LOAD_US_PATTERN, 'expected an expression of the form "ratedLoadLb / 150"'),
  personsPerRatedLoadEN81: z
    .string()
    .regex(PERSONS_PER_LOAD_EN81_PATTERN, 'expected an expression of the form "ratedLoadKg / 75"'),
  designLoadFactor: z
    .number()
    .gt(0)
    .max(1, 'design load factor must be <= 1; 0.8 is the traffic-analysis standard'),
});

export const elevatorSpecsSchema = z
  .strictObject({
    $comment: comment,
    version: z.number().int().positive(),
    units: z.record(z.string(), z.string()),
    conventions: conventionsSchema,
    classes: z.array(elevatorSpecSchema).min(1, 'at least one elevator class is required'),
    codeMinimumSpeedByRise: z.array(
      z.strictObject({
        riseFtRange: z
          .tuple([nonNegative, z.number().nullable()])
          .refine(([low, high]) => high === null || low <= high, {
            message: 'expected [fromFt, toFt] with fromFt <= toFt, or null for an open top band',
          }),
        minSpeedFpm: positive,
        minSpeedMps: positive,
      }),
    ),
    capacities: z.array(
      z.strictObject({
        ratedLoadLb: positive,
        ratedLoadKg: positive,
        personsUS: z.number().int().positive(),
        use: z.string().min(1),
      }),
    ),
    doors: doorTimingsSchema,
    timing: z.strictObject({
      $comment: comment,
      motorStartDelayS: nonNegative,
      levelingSettleS: valueRangeSchema,
      passengerTransferS: z.strictObject({
        $comment: comment,
        office: positive,
        residential: positive,
        hotel: positive,
      }),
    }),
    loadSensor: z.strictObject({
      $comment: comment,
      hallCallBypassThreshold: fraction,
      overloadAlarmThreshold: positive,
    }),
    realWorldAnchors: z.array(
      z.strictObject({
        $comment: comment,
        building: z.string().min(1),
        speedMps: positive,
        note: z.string().optional(),
      }),
    ),
  })
  .superRefine((specs, ctx) => {
    checkUniqueIds(specs.classes, 'classes', ctx);
    const seenLoads = new Map<number, number>();
    specs.capacities.forEach((entry, index) => {
      const first = seenLoads.get(entry.ratedLoadLb);
      if (first === undefined) {
        seenLoads.set(entry.ratedLoadLb, index);
        return;
      }
      ctx.addIssue({
        code: 'custom',
        path: ['capacities', index, 'ratedLoadLb'],
        message: `duplicate rated load ${entry.ratedLoadLb} lb; already declared at capacities[${first}]`,
      });
    });
    if (specs.loadSensor.overloadAlarmThreshold <= specs.loadSensor.hallCallBypassThreshold) {
      ctx.addIssue({
        code: 'custom',
        path: ['loadSensor', 'overloadAlarmThreshold'],
        message: `expected the overload threshold (${specs.loadSensor.overloadAlarmThreshold}) to exceed the hall-call bypass threshold (${specs.loadSensor.hallCallBypassThreshold})`,
      });
    }
  });

// ---------------------------------------------------------------------------
// data/traffic-profiles.json
// ---------------------------------------------------------------------------

const DIRECTIONAL_SPLIT_TOLERANCE = 1e-6;

export const trafficProfileSchema = z.strictObject({
  $comment: comment,
  id: identifier,
  name: z.string().min(1),
  governingPeak: z.string().min(1),
  arrivalRatePctPop5min: valueRangeSchema,
  targetIntervalS: positive,
  targetAvgWaitS: positive,
  batchSize: z.strictObject({
    $comment: comment,
    distribution: z.string().min(1),
    mean: z.number().gte(1, 'a batch contains at least one passenger'),
  }),
  directionalSplit: z
    .strictObject({ incoming: fraction, outgoing: fraction, interfloor: fraction })
    .refine(
      (split) =>
        Math.abs(split.incoming + split.outgoing + split.interfloor - 1) <=
        DIRECTIONAL_SPLIT_TOLERANCE,
      { message: 'incoming + outgoing + interfloor must sum to 1' },
    ),
});

export const trafficProfilesSchema = z
  .strictObject({
    $comment: comment,
    version: z.number().int().positive(),
    arrivalProcess: z.strictObject({ $comment: comment, type: z.string().min(1) }),
    profiles: z.array(trafficProfileSchema).min(1, 'at least one traffic profile is required'),
    demandTemplates: z.array(
      z.strictObject({
        $comment: comment,
        id: identifier,
        name: z.string().min(1),
        recommended: z.boolean(),
        durationMin: positive,
        reportWindow: z.string().optional(),
        shape: z.string().optional(),
        discardFirstMin: nonNegative.optional(),
        discardLastMin: nonNegative.optional(),
      }),
    ),
    passengerMass: z
      .strictObject({
        $comment: comment,
        distribution: z.string().min(1),
        meanKg: positive,
        stdDevKg: z
          .number()
          .gt(0, 'passenger mass must be a distribution, not a constant: the load sensor measures it'),
        minKg: positive,
        maxKg: positive.optional(),
      })
      .refine((mass) => mass.minKg < mass.meanKg, { message: 'expected minKg < meanKg' })
      .refine((mass) => mass.maxKg === undefined || mass.maxKg > mass.meanKg, {
        message: 'expected maxKg > meanKg',
      }),
  })
  .superRefine((profiles, ctx) => {
    checkUniqueIds(profiles.profiles, 'profiles', ctx);
    checkUniqueIds(profiles.demandTemplates, 'demandTemplates', ctx);
    profiles.demandTemplates.forEach((template, index) => {
      const discarded = (template.discardFirstMin ?? 0) + (template.discardLastMin ?? 0);
      if (discarded >= template.durationMin) {
        ctx.addIssue({
          code: 'custom',
          path: ['demandTemplates', index, 'discardFirstMin'],
          message: `discarding ${discarded} min of a ${template.durationMin} min run leaves no measurement window`,
        });
      }
    });
  });

// ---------------------------------------------------------------------------
// data/dispatcher-profiles.json
// ---------------------------------------------------------------------------

export const costTermSchema = z.strictObject({
  $comment: comment,
  id: identifier,
  measures: z.string().min(1),
  serves: z.string().min(1),
});

const dispatchStageSchema = z.strictObject({
  $comment: comment,
  callType: z.enum(CALL_TYPES).optional(),
  passengerAssignment: z.enum(PASSENGER_ASSIGNMENT_MODES).optional(),
  batchWindowS: nonNegative.optional(),
  assignmentTiming: z.enum(ASSIGNMENT_TIMINGS).optional(),
  deferWindowS: nonNegative.optional(),
  assignmentMode: z.enum(ASSIGNMENT_MODES).optional(),
  splitThresholdPassengers: z.number().int().positive().optional(),
  reassignmentPolicy: z.enum(REASSIGNMENT_POLICIES).optional(),
  commitmentPoint: z.enum(COMMITMENT_POINTS).optional(),
  reassignmentHysteresisS: nonNegative.optional(),
  maxReassignmentsPerCall: z.number().int().min(0).optional(),
});

/**
 * Stage 2's hard filters, as a profile authors them.
 *
 * `DISPATCH_PARAMETERS` has declared both rows since Phase 2 and this section did not exist, so
 * an optimizer could sample `eligibility.*`, find an optimum through `DispatchPolicyOptions`, and
 * then be unable to write it down — invariant 8 met on the sampling half and not the persisting
 * half, which is the same defect as a knob that is declared and unread, one step later.
 * `dispatch/parameters.test.ts` now asserts every declared id round-trips through this schema.
 */
const eligibilityStageSchema = z.strictObject({
  $comment: comment,
  allowOppositeDirectionPickup: z.boolean().optional(),
  // Not `fraction`: the declared range is [0, 1.2], because a projected load *on arrival* may
  // legitimately exceed rated load and a profile must be able to say it will still assign.
  maxLoadFactorForAssignment: nonNegative.max(1.2).optional(),
});

/**
 * The half-cost points of the two saturating normalization maps, as a profile authors them.
 *
 * Distinct from the file-level `normalization.required`, which says whether normalization is
 * mandatory at all; these are the per-dispatcher references `DISPATCH_PARAMETERS` declares as
 * `normalization.waitTimeS` and `normalization.distanceM`. They were reachable only through
 * `DispatchPolicyOptions` for the same reason `eligibility` was, and are authorable for the same
 * one: a parameter an optimizer can sample and cannot persist is a dimension it searches for
 * nothing.
 */
const profileNormalizationSchema = z.strictObject({
  $comment: comment,
  waitTimeS: positive.optional(),
  distanceM: positive.optional(),
});

const answerStageSchema = z.strictObject({
  $comment: comment,
  bypassLoadThreshold: fraction.optional(),
  overloadThreshold: positive.optional(),
  allowBypassIfSoleEligibleCar: z.boolean().optional(),
  dwellPolicy: z.enum(DWELL_POLICIES).optional(),
  dwellAdaptationGain: nonNegative.optional(),
  reopenOnLateArrival: z.boolean().optional(),
  maxDwellS: positive.optional(),
  // The two `answer.*` ids `DOOR_PARAMETERS` declares and this section did not carry. Both are
  // read by `resolveDoorConfig` off `DoorAnswerSource`, which is `profile.answer` verbatim, so
  // they were live knobs an optimizer could sample through `DoorConfigOverrides` and could not
  // persist as a profile. `physics/doors/types.ts` recorded the exact two rows it was owed; these
  // are they.
  maxReopensPerStop: z.number().int().min(0).max(20).optional(),
  maxTransferSeconds: nonNegative.optional(),
});

const idleStageSchema = z.strictObject({
  $comment: comment,
  parkingStrategy: z.enum(PARKING_STRATEGIES).optional(),
  repositionThresholdS: nonNegative.optional(),
  repositionEnergyWeight: nonNegative.optional(),
  predictorHorizonS: positive.optional(),
  // `gt(0)`, not `fraction`: `createArrivalModel` rejects a learning rate of zero, because a model
  // that can never learn is an inert predictor that still reports a forecast. A `fraction` here
  // accepted `0`, so the profile loaded clean and the model threw at construction — the config
  // layer admitting a value the model refuses.
  predictorLearningRate: z.number().gt(0).max(1).optional(),
  predictorBucketWidthS: positive.optional(),
  predictorCycleS: positive.optional(),
  predictorPriorRatePerS: nonNegative.optional(),
  predictorPriorStrength: nonNegative.optional(),
});

/**
 * Stage 4's aggregation, as a profile authors it.
 *
 * `aggregation` is the declarative selector `dispatch/policies/registry.ts` looks the policy
 * factory up by, so "which dispatcher" stays data (CLAUDE.md invariant 7) and a tuned winner is
 * persistable as a profile rather than reachable only through an options object.
 */
const auctionStageSchema = z.strictObject({
  $comment: comment,
  aggregation: z.enum(AGGREGATIONS).optional(),
  rounds: z.number().int().min(1).max(8).optional(),
  reserveMarginalDelayS: nonNegative.optional(),
});

/**
 * Stage 3's weight-set selection, as a profile authors it.
 *
 * Six scalars and no map. The arms are the file-level `patternSwitching` block, for the same
 * reason the cost-term library is file-level: a statement of what exists is not a knob an
 * optimizer samples. `policy` is the opt-in and its default is `off`, so a profile that says
 * nothing here holds one weight vector for the run — which is every profile this file ships.
 */
const selectionStageSchema = z.strictObject({
  $comment: comment,
  policy: z.enum(WEIGHT_SET_POLICIES).optional(),
  hysteresisS: nonNegative.max(900).optional(),
  observationWindowS: positive.min(30).max(1800).optional(),
  lobbyArrivalRateGain: nonNegative.max(4).optional(),
  interfloorRateGain: nonNegative.max(4).optional(),
  downPeakRateGain: nonNegative.max(4).optional(),
  switchMargin: fraction.optional(),
});

export const dispatcherProfileSchema = z.strictObject({
  $comment: comment,
  id: identifier,
  name: z.string().min(1),
  role: z.string().min(1).optional(),
  engine: z.string().min(1).optional(),
  weights: z.record(identifier, z.number()),
  hardConstraints: z.array(identifier).optional(),
  normalization: profileNormalizationSchema.optional(),
  dispatch: dispatchStageSchema.optional(),
  eligibility: eligibilityStageSchema.optional(),
  answer: answerStageSchema.optional(),
  idle: idleStageSchema.optional(),
  auction: auctionStageSchema.optional(),
  selection: selectionStageSchema.optional(),
});

/**
 * The keys of an object schema whose values are themselves object schemas, in declaration order.
 *
 * ## Why this exists
 *
 * A dispatcher profile holds its tunables in **sections** — `profile.idle.predictorCycleS`, and so
 * on — and `experiments/src/tuning/space/encode.ts` has to know which keys those are in order to
 * write a candidate down as a profile and read it back. It knew by carrying a hand-written list,
 * and CLAUDE.md's *Standing requirement* names exactly what happens next: `selection` landed in
 * this file with seven declared, round-trip-tested rows, the list did not gain it, and all seven
 * were reported *unauthorable* by `collectSearchSpace()` and dropped from the search space — with
 * nothing anywhere reading as wrong ([DECISIONS.md § D146](../../../../DECISIONS.md)).
 *
 * So the list is derived from the schema, and it is derived **here** rather than in `experiments`
 * for a reason that is not convenience: `experiments` does not depend on `zod` and must not start,
 * and the fact being read is a fact about `core`'s schema. A consumer gets
 * {@link DISPATCHER_PROFILE_OBJECT_SECTIONS}; nobody outside this file re-derives it.
 *
 * ## The rule, and what it deliberately does not admit
 *
 * A key is a section when unwrapping every wrapper that exposes an `innerType` — `.optional()`,
 * `.default()`, `.nullable()`, `.readonly()` — reaches a `ZodObject`. Under that rule the shipped
 * profile schema yields seven, and the seven fields that are *not* sections are each excluded for
 * a reason rather than by name: `$comment`, `id`, `name`, `role` and `engine` are strings,
 * `hardConstraints` is an array, and `weights` is a **record** — an open map of term id to number,
 * which `encode.ts` handles as a pseudo-section precisely because it has no fixed keys.
 *
 * That last exclusion is also the honest statement of the blind spot: a future section authored as
 * a `z.record`, a `z.union`, a `z.intersection`, a `z.lazy` or a pipe would **not** be found, and
 * would fail the same silent way `selection` did. `schema.test.ts` asserts the rule against a
 * fictional schema the product does not ship, including those shapes, so the boundary is pinned
 * rather than assumed.
 *
 * Declaration order rather than sorted, because it is the order a profile is authored in and the
 * order a decoded patch's JSON keys come out in; an object literal's key order is fixed by the
 * language, unlike a module namespace's, which is why `collect.ts` sorts and this does not.
 */
export function objectSectionsOf(schema: {
  readonly shape: Readonly<Record<string, unknown>>;
}): readonly string[] {
  return Object.freeze(
    Object.keys(schema.shape).filter((key) => unwrapSchema(schema.shape[key]).type === 'object'),
  );
}

/** The `def` of a zod schema, as much of it as {@link objectSectionsOf} reads. */
interface SchemaDef {
  readonly type?: string;
  readonly innerType?: unknown;
}

function defOf(schema: unknown): SchemaDef | undefined {
  if (typeof schema !== 'object' || schema === null) return undefined;
  const def = (schema as { readonly def?: unknown }).def;
  return typeof def === 'object' && def !== null ? (def as SchemaDef) : undefined;
}

/**
 * Peel wrappers until the schema underneath, whatever the wrappers are.
 *
 * Generic in the wrapper rather than a list of them: every zod wrapper that has an inside exposes
 * it as `def.innerType`, so `.optional().readonly()` needs no more code than `.optional()`. The
 * depth bound is not defensive about zod — it stops a malformed cyclic `def` from hanging this
 * module at import time, which is where the constant below is built.
 */
function unwrapSchema(schema: unknown): SchemaDef {
  let def = defOf(schema);
  for (let depth = 0; depth < 8; depth += 1) {
    const inner = def?.innerType;
    if (inner === undefined) break;
    def = defOf(inner);
  }
  return def ?? {};
}

/**
 * Every section a dispatcher profile writes as `profile.<section>.<key>`, from the schema itself.
 *
 * Seven today: `normalization`, `dispatch`, `eligibility`, `answer`, `idle`, `auction`,
 * `selection`. An eighth added to {@link dispatcherProfileSchema} appears here, and therefore in
 * the tuning search space, with no edit anywhere else — which is the half of CLAUDE.md invariant 8
 * that a generic optimizer depends on and that no test used to hold.
 *
 * The two pseudo-sections are correctly absent: `weights` and `hardConstraints` are not written as
 * `profile.<section>.<key>` and `encode.ts` translates them itself.
 */
export const DISPATCHER_PROFILE_OBJECT_SECTIONS: readonly string[] =
  objectSectionsOf(dispatcherProfileSchema);

export const dispatcherProfilesSchema = z
  .strictObject({
    $comment: comment,
    version: z.number().int().positive(),
    terms: z.array(costTermSchema).min(1, 'the cost-term library must not be empty'),
    normalization: z.strictObject({ $comment: comment, required: z.boolean() }),
    profiles: z.array(dispatcherProfileSchema).min(1, 'at least one dispatcher is required'),
    patternSwitching: z
      .strictObject({
        $comment: comment,
        patternDetector: z.strictObject({
          $comment: comment,
          type: z.string().min(1),
          inputs: z.array(identifier).min(1),
          patterns: z.array(identifier).min(1),
          hysteresisS: nonNegative,
          // Pattern id to input id to `[zeroAt, oneAt]` — the membership ramp that decides when
          // the detector is in that pattern. Optional in the schema and **required by
          // `resolveWeightSets`** for every declared pattern, and the asymmetry is deliberate:
          // this file may be read by a consumer that only wants the profile library, but a
          // *selector* built over a pattern with no clause has a constant membership and can
          // neither enter nor leave that pattern on evidence.
          membership: z
            .record(identifier, z.record(identifier, z.tuple([z.number(), z.number()])))
            .optional(),
        }),
        weightSetsByPattern: z.record(identifier, identifier),
      })
      .optional(),
  })
  .superRefine((file, ctx) => {
    checkUniqueIds(file.terms, 'terms', ctx);
    checkUniqueIds(file.profiles, 'profiles', ctx);
    const termIds = new Set(file.terms.map((term) => term.id));
    const known = [...termIds].join(', ');
    file.profiles.forEach((profile, index) => {
      for (const term of Object.keys(profile.weights)) {
        if (termIds.has(term)) continue;
        ctx.addIssue({
          code: 'custom',
          path: ['profiles', index, 'weights', term],
          message: `unknown cost term "${term}" in dispatcher "${profile.id}". Declared terms: ${known}. Add it to "terms" (and implement it) before weighting it.`,
        });
      }
    });
  });

// ---------------------------------------------------------------------------
// data/buildings/*.json
// ---------------------------------------------------------------------------

export const floorConfigSchema = z.strictObject({
  $comment: comment,
  id: identifier,
  index: z.number().int('floor index must be an integer (negative for basements)'),
  heightM: z.number(),
  population: nonNegative,
  isEntrance: z.boolean().optional(),
  isTransferFloor: z.boolean().optional(),
  trafficProfile: identifier.optional(),
  label: z.string().min(1).optional(),
});

export const floorRangeSchema = z
  .strictObject({
    $comment: comment,
    fromIndex: z.number().int(),
    toIndex: z.number().int(),
    startHeightM: z.number(),
    floorToFloorM: positive,
    populationPerFloor: nonNegative,
    idPattern: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    isEntrance: z.boolean().optional(),
    isTransferFloor: z.boolean().optional(),
    trafficProfile: identifier.optional(),
  })
  .refine((range) => range.fromIndex <= range.toIndex, {
    message: 'expected fromIndex <= toIndex',
  });

export const carConfigSchema = z.strictObject({
  $comment: comment,
  id: identifier,
  spec: identifier,
  // Operational state, not hardware. Declared as a tunable in `CAR_PARAMETERS`
  // (`model/car/car.ts`) with type, values and default, per CLAUDE.md invariant 8; it is not
  // in the *dispatcher's* search space because no dispatcher profile has a section that can
  // hold a `car.*` id, which is the same mechanical rule that excludes `car.passengerTransferS`
  // (see `experiments/src/tuning/space/collect.ts`).
  mode: z.enum(SERVICE_MODES).optional(),
  ratedSpeedMps: positive.optional(),
  ratedLoadLb: positive.optional(),
  doorType: z.enum(DOOR_TYPES).optional(),
  acceleration: positive.optional(),
  jerk: positive.optional(),
  doorOpenS: positive.optional(),
  doorCloseS: positive.optional(),
  dwellCarCallS: positive.optional(),
  dwellHallCallS: positive.optional(),
  motorStartDelayS: nonNegative.optional(),
  levelingSettleS: nonNegative.optional(),
  // Per passenger, per direction. Defaults to timing.passengerTransferS[building type];
  // stated here for a building type that table has no row for, or for a bank whose
  // population transfers differently from the rest of the building.
  passengerTransferS: positive.optional(),
  doubleDeck: z.boolean().optional(),
  deckSeparationM: positive.optional(),
  ratedLoadLbPerDeck: positive.optional(),
});

export const bankConfigSchema = z.strictObject({
  $comment: comment,
  id: identifier,
  name: z.string().min(1).optional(),
  servesFloors: z.array(identifier).min(2, 'a bank must serve at least two floors'),
  servesFloorPairs: z
    .array(z.tuple([identifier, identifier]))
    .min(1, 'servesFloorPairs, when present, must list at least one [lower, upper] pair')
    .optional(),
  cars: z.array(carConfigSchema).min(1, 'a bank must have at least one car'),
});

/**
 * One scheduled service-mode change. See {@link ServiceEventConfig}.
 *
 * `atS` is non-negative, and `z.number()` already refuses `Infinity` and `NaN` — a schedule entry
 * that can never fire is a silently-inert event, which is worse than a rejected one. Which car it
 * names is checked in `resolveBuilding`, where the banks are in view.
 */
export const serviceEventSchema = z.strictObject({
  $comment: comment,
  atS: nonNegative,
  carId: identifier,
  bankId: identifier.optional(),
  mode: z.enum(SERVICE_MODES),
});

export const accessZoneSchema = z.strictObject({
  $comment: comment,
  id: identifier,
  floors: z.array(identifier).min(1, 'an access zone must cover at least one floor'),
  credentialGroups: z.array(identifier).min(1, 'an access zone must name a credential group'),
});

export const buildingConfigSchema = z
  .strictObject({
    $comment: comment,
    id: identifier,
    name: z.string().min(1),
    type: z.enum(BUILDING_TYPES),
    trafficProfile: identifier,
    floors: z.array(floorConfigSchema).optional(),
    floorRanges: z.array(floorRangeSchema).optional(),
    totalPopulation: nonNegative.optional(),
    banks: z.array(bankConfigSchema).min(1, 'a building must have at least one bank'),
    accessZones: z.array(accessZoneSchema).optional(),
    serviceEvents: z.array(serviceEventSchema).optional(),
    notes: z.array(z.string().min(1)).optional(),
  })
  .superRefine((building, ctx) => {
    const floorCount = (building.floors?.length ?? 0) + (building.floorRanges?.length ?? 0);
    if (floorCount === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['floors'],
        message:
          'no floors declared. Provide "floors" (explicit form), "floorRanges" (compact form), or both. See data/buildings/README.md.',
      });
    }
    checkUniqueIds(building.banks, 'banks', ctx);
    if (building.accessZones !== undefined) checkUniqueIds(building.accessZones, 'accessZones', ctx);
    building.banks.forEach((bank, bankIndex) => {
      const seen = new Map<string, number>();
      bank.cars.forEach((car, carIndex) => {
        const first = seen.get(car.id);
        if (first === undefined) {
          seen.set(car.id, carIndex);
          return;
        }
        ctx.addIssue({
          code: 'custom',
          path: ['banks', bankIndex, 'cars', carIndex, 'id'],
          message: `duplicate car id "${car.id}" in bank "${bank.id}"; already declared at banks[${bankIndex}].cars[${first}]. Car ids must be unique within a bank.`,
        });
      });
    });
  });

// ---------------------------------------------------------------------------
// Compile-time conformance: schema output must satisfy the hand-written types.
// These aliases are unused at runtime; they exist so `tsc` fails on drift.
// ---------------------------------------------------------------------------

type Conforms<Expected, Actual extends Expected> = Actual;

type _ElevatorSpecConforms = Conforms<ElevatorSpec, z.infer<typeof elevatorSpecSchema>>;
type _ElevatorSpecsConforms = Conforms<ElevatorSpecs, z.infer<typeof elevatorSpecsSchema>>;
type _TrafficProfileConforms = Conforms<TrafficProfile, z.infer<typeof trafficProfileSchema>>;
type _TrafficProfilesConforms = Conforms<TrafficProfiles, z.infer<typeof trafficProfilesSchema>>;
type _CostTermConforms = Conforms<CostTerm, z.infer<typeof costTermSchema>>;
type _DispatcherProfileConforms = Conforms<
  DispatcherProfile,
  z.infer<typeof dispatcherProfileSchema>
>;
type _DispatcherProfilesConforms = Conforms<
  DispatcherProfiles,
  z.infer<typeof dispatcherProfilesSchema>
>;
type _FloorConfigConforms = Conforms<FloorConfig, z.infer<typeof floorConfigSchema>>;
type _FloorRangeConforms = Conforms<FloorRange, z.infer<typeof floorRangeSchema>>;
type _CarConfigConforms = Conforms<CarConfig, z.infer<typeof carConfigSchema>>;
type _BankConfigConforms = Conforms<BankConfig, z.infer<typeof bankConfigSchema>>;
type _AccessZoneConforms = Conforms<AccessZone, z.infer<typeof accessZoneSchema>>;
type _ServiceEventConforms = Conforms<ServiceEventConfig, z.infer<typeof serviceEventSchema>>;
type _BuildingConfigConforms = Conforms<BuildingConfig, z.infer<typeof buildingConfigSchema>>;
