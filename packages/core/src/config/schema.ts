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
  ASSIGNMENT_TIMINGS,
  BUILDING_TYPES,
  CALL_TYPES,
  COMMITMENT_POINTS,
  DOOR_TYPES,
  DWELL_POLICIES,
  PARKING_STRATEGIES,
  REASSIGNMENT_POLICIES,
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
  emptyBank: 'empty-bank',
  invalidConvention: 'invalid-convention',
  /** The building type has no row in `timing.passengerTransferS` and no car stated one. */
  missingPassengerTransfer: 'missing-passenger-transfer',
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
});

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
type _BuildingConfigConforms = Conforms<BuildingConfig, z.infer<typeof buildingConfigSchema>>;
