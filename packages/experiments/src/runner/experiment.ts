/**
 * The declarative experiment: validating a spec, and resolving it into a plan.
 *
 * CLAUDE.md invariant 7 — "anything tunable is data, not code" — applies to the *experiment*
 * every bit as much as to a dispatcher. An {@link ExperimentSpec} is JSON: it can live in a file,
 * be diffed in review, be emitted by a Phase 7 optimizer, and be attached to a result so that the
 * question a number answers is recoverable from the number. Nothing in this module branches on a
 * building id or a dispatcher id; ids are only ever keys into {@link ExperimentResources}.
 *
 * ## Two jobs, deliberately separated
 *
 * {@link parseExperimentSpec} turns an `unknown` — a parsed JSON file, an object from a UI — into a
 * typed spec or throws with the offending path. {@link planExperiment} resolves a typed spec
 * against its resources into an {@link ExperimentPlan}: the cross product expanded into cells, the
 * CRN cohorts identified, every default applied. Planning is **pure** and does no I/O, so a plan
 * can be inspected, printed or diffed before a single simulation runs — which matters, because a
 * plan is where a mis-specified experiment is cheapest to catch.
 *
 * Unknown keys are rejected rather than ignored. A spec with `"replications": 200` where the
 * schema says `"replication": { "maxReplications": 200 }` would otherwise run silently at the
 * default budget and report a tighter interval than it earned.
 */

import {
  CREDENTIAL_ASSIGNMENTS,
  DEMAND_LEVELS,
  DEMAND_TEMPLATE_IDS,
  INTERFLOOR_WEIGHTINGS,
} from '@elevator-sim/core';

import type {
  CredentialAssignment,
  DemandLevel,
  DemandTemplateId,
  DirectionalSplit,
  DispatchPolicyOptions,
  InterfloorWeighting,
  ReportWindow,
  SimulationDemandOptions,
  SummarizeOptions,
  WindowSelection,
} from '@elevator-sim/core';

import { crnCohortsOf, normalizeExperimentSeed, traceKeyOf } from './crn.js';
import { isReplicationMetric } from './metrics.js';
import type { ReplicationMetric } from './metrics.js';
import type {
  CellSimulationConfig,
  DispatcherArmSpec,
  ExperimentCell,
  ExperimentPlan,
  ExperimentResources,
  ExperimentRunOptions,
  ExperimentSpec,
  ParallelSpec,
  ReplicationPolicySpec,
  ResolvedParallelPolicy,
  ResolvedReplicationPolicy,
  SimulationOverridesSpec,
  TrafficArmSpec,
} from './types.js';
import { PARALLEL_MODES, RUNNER_DEFAULTS, RunnerError } from './types.js';

/* -------------------------------------------------------------------------- *
 * Small validators
 * -------------------------------------------------------------------------- */

const fail = (path: string, message: string): never => {
  throw new RunnerError(`${path}: ${message}`, path);
};

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, `expected an object, received ${describe(value)}`);
  }
  return value as Record<string, unknown>;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

function rejectUnknown(record: Record<string, unknown>, known: readonly string[], path: string): void {
  const allowed = new Set(known);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      fail(
        `${path}.${key}`,
        `unknown key. A spec is data, and an ignored key is a silently different experiment. Known keys: ${known.join(', ')}`,
      );
    }
  }
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(path, `expected a non-empty string, received ${describe(value)}`);
  }
  return value as string;
}

function asFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, `expected a finite number, received ${describe(value)}`);
  }
  return value as number;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, `expected a boolean, received ${describe(value)}`);
  return value as boolean;
}

function asMember<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  const text = asString(value, path);
  if (!(allowed as readonly string[]).includes(text)) {
    fail(path, `expected one of ${allowed.join(', ')}; received "${text}"`);
  }
  return text as T;
}

function asStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) fail(path, `expected an array, received ${describe(value)}`);
  return (value as unknown[]).map((entry, index) => asString(entry, `${path}[${index}]`));
}

function asNumberRecord(value: unknown, path: string): Readonly<Record<string, number>> {
  const record = asRecord(value, path);
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(record)) out[key] = asFiniteNumber(entry, `${path}.${key}`);
  return out;
}

/** `key in record` with the `undefined` value treated as absent, for `exactOptionalPropertyTypes`. */
const present = (record: Record<string, unknown>, key: string): boolean =>
  Object.hasOwn(record, key) && record[key] !== undefined;

/* -------------------------------------------------------------------------- *
 * Spec validation
 * -------------------------------------------------------------------------- */

const DEMAND_KEYS = [
  'demandLevel',
  'arrivalRatePctPop5min',
  'directionalSplit',
  'batchSharesDestination',
  'entranceWeights',
  'interfloorWeighting',
  'credentialAssignment',
  'maxLegs',
  'peakWindowS',
  'baselineFraction',
] as const;

function parseDirectionalSplit(value: unknown, path: string): DirectionalSplit {
  const record = asRecord(value, path);
  rejectUnknown(record, ['incoming', 'outgoing', 'interfloor'], path);
  return {
    incoming: asFiniteNumber(record['incoming'], `${path}.incoming`),
    outgoing: asFiniteNumber(record['outgoing'], `${path}.outgoing`),
    interfloor: asFiniteNumber(record['interfloor'], `${path}.interfloor`),
  };
}

function parseDemand(value: unknown, path: string): SimulationDemandOptions {
  const record = asRecord(value, path);
  rejectUnknown(record, DEMAND_KEYS, path);
  return {
    ...(present(record, 'demandLevel')
      ? { demandLevel: asMember<DemandLevel>(record['demandLevel'], DEMAND_LEVELS, `${path}.demandLevel`) }
      : {}),
    ...(present(record, 'arrivalRatePctPop5min')
      ? { arrivalRatePctPop5min: asFiniteNumber(record['arrivalRatePctPop5min'], `${path}.arrivalRatePctPop5min`) }
      : {}),
    ...(present(record, 'directionalSplit')
      ? { directionalSplit: parseDirectionalSplit(record['directionalSplit'], `${path}.directionalSplit`) }
      : {}),
    ...(present(record, 'batchSharesDestination')
      ? { batchSharesDestination: asBoolean(record['batchSharesDestination'], `${path}.batchSharesDestination`) }
      : {}),
    ...(present(record, 'entranceWeights')
      ? { entranceWeights: asNumberRecord(record['entranceWeights'], `${path}.entranceWeights`) }
      : {}),
    ...(present(record, 'interfloorWeighting')
      ? {
          interfloorWeighting: asMember<InterfloorWeighting>(
            record['interfloorWeighting'],
            INTERFLOOR_WEIGHTINGS,
            `${path}.interfloorWeighting`,
          ),
        }
      : {}),
    ...(present(record, 'credentialAssignment')
      ? {
          credentialAssignment: asMember<CredentialAssignment>(
            record['credentialAssignment'],
            CREDENTIAL_ASSIGNMENTS,
            `${path}.credentialAssignment`,
          ),
        }
      : {}),
    ...(present(record, 'maxLegs') ? { maxLegs: asFiniteNumber(record['maxLegs'], `${path}.maxLegs`) } : {}),
    ...(present(record, 'peakWindowS')
      ? { peakWindowS: asFiniteNumber(record['peakWindowS'], `${path}.peakWindowS`) }
      : {}),
    ...(present(record, 'baselineFraction')
      ? { baselineFraction: asFiniteNumber(record['baselineFraction'], `${path}.baselineFraction`) }
      : {}),
  };
}

function parseWindowSelection(value: unknown, path: string): WindowSelection {
  if (typeof value === 'string') {
    return asMember<'full-run' | 'peak-5min'>(value, ['full-run', 'peak-5min'], path);
  }
  const record = asRecord(value, path);
  rejectUnknown(record, ['id', 'startS', 'endS'], path);
  const window: ReportWindow = {
    id: asString(record['id'], `${path}.id`),
    startS: asFiniteNumber(record['startS'], `${path}.startS`),
    endS: asFiniteNumber(record['endS'], `${path}.endS`),
  };
  return window;
}

function parseTrafficArm(value: unknown, path: string): TrafficArmSpec {
  const record = asRecord(value, path);
  rejectUnknown(record, ['id', 'demandTemplate', 'durationS', 'reportWindow', 'demand'], path);
  return {
    id: asString(record['id'], `${path}.id`),
    ...(present(record, 'demandTemplate')
      ? {
          demandTemplate: asMember<DemandTemplateId>(
            record['demandTemplate'],
            DEMAND_TEMPLATE_IDS,
            `${path}.demandTemplate`,
          ),
        }
      : {}),
    ...(present(record, 'durationS')
      ? { durationS: asFiniteNumber(record['durationS'], `${path}.durationS`) }
      : {}),
    ...(present(record, 'reportWindow')
      ? { reportWindow: parseWindowSelection(record['reportWindow'], `${path}.reportWindow`) }
      : {}),
    ...(present(record, 'demand') ? { demand: parseDemand(record['demand'], `${path}.demand`) } : {}),
  };
}

function parseDispatcherArm(value: unknown, path: string): string | DispatcherArmSpec {
  if (typeof value === 'string') return asString(value, path);
  const record = asRecord(value, path);
  rejectUnknown(record, ['id', 'profile', 'options'], path);
  return {
    ...(present(record, 'id') ? { id: asString(record['id'], `${path}.id`) } : {}),
    profile: asString(record['profile'], `${path}.profile`),
    ...(present(record, 'options')
      ? { options: parseDispatchPolicyOptions(record['options'], `${path}.options`) }
      : {}),
  };
}

function parseDispatchPolicyOptions(value: unknown, path: string): DispatchPolicyOptions {
  const record = asRecord(value, path);
  rejectUnknown(record, ['eligibility', 'normalization', 'weights', 'hardConstraints'], path);
  return {
    ...(present(record, 'eligibility')
      ? { eligibility: asRecord(record['eligibility'], `${path}.eligibility`) as DispatchPolicyOptions['eligibility'] }
      : {}),
    ...(present(record, 'normalization')
      ? {
          normalization: asRecord(
            record['normalization'],
            `${path}.normalization`,
          ) as DispatchPolicyOptions['normalization'],
        }
      : {}),
    ...(present(record, 'weights') ? { weights: asNumberRecord(record['weights'], `${path}.weights`) } : {}),
    ...(present(record, 'hardConstraints')
      ? { hardConstraints: asStringArray(record['hardConstraints'], `${path}.hardConstraints`) }
      : {}),
  };
}

function parseReplicationPolicy(value: unknown, path: string): ReplicationPolicySpec {
  const record = asRecord(value, path);
  rejectUnknown(
    record,
    [
      'minReplications',
      'maxReplications',
      'checkEvery',
      'confidence',
      'acceptableRange',
      'stoppingMetric',
      'stopOnSaturation',
    ],
    path,
  );
  const metric = present(record, 'stoppingMetric')
    ? asString(record['stoppingMetric'], `${path}.stoppingMetric`)
    : undefined;
  if (metric !== undefined && !isReplicationMetric(metric)) {
    fail(`${path}.stoppingMetric`, `"${metric}" is not a known replication metric`);
  }
  return {
    ...(present(record, 'minReplications')
      ? { minReplications: asFiniteNumber(record['minReplications'], `${path}.minReplications`) }
      : {}),
    ...(present(record, 'maxReplications')
      ? { maxReplications: asFiniteNumber(record['maxReplications'], `${path}.maxReplications`) }
      : {}),
    ...(present(record, 'checkEvery')
      ? { checkEvery: asFiniteNumber(record['checkEvery'], `${path}.checkEvery`) }
      : {}),
    ...(present(record, 'confidence')
      ? { confidence: asFiniteNumber(record['confidence'], `${path}.confidence`) }
      : {}),
    ...(present(record, 'acceptableRange')
      ? { acceptableRange: asFiniteNumber(record['acceptableRange'], `${path}.acceptableRange`) }
      : {}),
    ...(metric === undefined ? {} : { stoppingMetric: metric as ReplicationMetric }),
    ...(present(record, 'stopOnSaturation')
      ? { stopOnSaturation: asBoolean(record['stopOnSaturation'], `${path}.stopOnSaturation`) }
      : {}),
  };
}

function parseParallel(value: unknown, path: string): ParallelSpec {
  const record = asRecord(value, path);
  rejectUnknown(record, ['mode', 'workers', 'minReplicationsForWorkers'], path);
  return {
    ...(present(record, 'mode') ? { mode: asMember(record['mode'], PARALLEL_MODES, `${path}.mode`) } : {}),
    ...(present(record, 'workers') ? { workers: asFiniteNumber(record['workers'], `${path}.workers`) } : {}),
    ...(present(record, 'minReplicationsForWorkers')
      ? {
          minReplicationsForWorkers: asFiniteNumber(
            record['minReplicationsForWorkers'],
            `${path}.minReplicationsForWorkers`,
          ),
        }
      : {}),
  };
}

function parseSimulationOverrides(value: unknown, path: string): SimulationOverridesSpec {
  const record = asRecord(value, path);
  const numeric = [
    'transferWalkS',
    'dispatchRetryS',
    'drainGraceS',
    'queueSampleCount',
    'doorObstructionProbability',
    'maxEvents',
  ] as const;
  rejectUnknown(record, ['onTimeout', ...numeric, 'summarize'], path);
  const out: Record<string, unknown> = {};
  if (present(record, 'onTimeout')) {
    out['onTimeout'] = asMember(record['onTimeout'], ['throw', 'report'] as const, `${path}.onTimeout`);
  }
  for (const key of numeric) {
    if (present(record, key)) out[key] = asFiniteNumber(record[key], `${path}.${key}`);
  }
  if (present(record, 'summarize')) {
    const summarize = asRecord(record['summarize'], `${path}.summarize`);
    if (present(summarize, 'window')) {
      fail(
        `${path}.summarize.window`,
        'the report window belongs to the traffic arm, so that two arms of one experiment cannot be summarized over windows nobody declared',
      );
    }
    out['summarize'] = summarize as Omit<SummarizeOptions, 'window'>;
  }
  return out as SimulationOverridesSpec;
}

/**
 * Validate an unknown value into an {@link ExperimentSpec}.
 *
 * @throws RunnerError naming the offending dotted path.
 */
export function parseExperimentSpec(value: unknown, path = 'spec'): ExperimentSpec {
  const record = asRecord(value, path);
  rejectUnknown(
    record,
    ['id', 'description', 'seed', 'buildings', 'dispatchers', 'traffic', 'replication', 'parallel', 'simulation'],
    path,
  );

  const seedValue = record['seed'];
  if (typeof seedValue !== 'number' && typeof seedValue !== 'string') {
    fail(`${path}.seed`, `expected a number or a decimal string, received ${describe(seedValue)}`);
  }

  if (!Array.isArray(record['dispatchers'])) {
    fail(`${path}.dispatchers`, `expected an array, received ${describe(record['dispatchers'])}`);
  }
  if (!Array.isArray(record['traffic'])) {
    fail(`${path}.traffic`, `expected an array, received ${describe(record['traffic'])}`);
  }

  return {
    id: asString(record['id'], `${path}.id`),
    ...(present(record, 'description')
      ? { description: asString(record['description'], `${path}.description`) }
      : {}),
    seed: seedValue as number | string,
    buildings: asStringArray(record['buildings'], `${path}.buildings`),
    dispatchers: (record['dispatchers'] as unknown[]).map((entry, index) =>
      parseDispatcherArm(entry, `${path}.dispatchers[${index}]`),
    ),
    traffic: (record['traffic'] as unknown[]).map((entry, index) =>
      parseTrafficArm(entry, `${path}.traffic[${index}]`),
    ),
    ...(present(record, 'replication')
      ? { replication: parseReplicationPolicy(record['replication'], `${path}.replication`) }
      : {}),
    ...(present(record, 'parallel') ? { parallel: parseParallel(record['parallel'], `${path}.parallel`) } : {}),
    ...(present(record, 'simulation')
      ? { simulation: parseSimulationOverrides(record['simulation'], `${path}.simulation`) }
      : {}),
  };
}

/* -------------------------------------------------------------------------- *
 * Resolving the policies
 * -------------------------------------------------------------------------- */

function requireInteger(value: number, name: string, min: number): number {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RunnerError(`${name} must be a safe integer >= ${min}; received ${value}.`, name);
  }
  return value;
}

export function resolveReplicationPolicy(
  spec: ReplicationPolicySpec | undefined,
): ResolvedReplicationPolicy {
  const minReplications = requireInteger(
    spec?.minReplications ?? RUNNER_DEFAULTS.minReplications,
    'replication.minReplications',
    1,
  );
  const maxReplications = requireInteger(
    spec?.maxReplications ?? Math.max(RUNNER_DEFAULTS.maxReplications, minReplications),
    'replication.maxReplications',
    1,
  );
  if (maxReplications < minReplications) {
    throw new RunnerError(
      `replication.maxReplications (${maxReplications}) is below replication.minReplications (${minReplications}).`,
      'replication.maxReplications',
    );
  }
  const checkEvery = requireInteger(spec?.checkEvery ?? RUNNER_DEFAULTS.checkEvery, 'replication.checkEvery', 1);
  const confidence = spec?.confidence ?? RUNNER_DEFAULTS.confidence;
  if (!(confidence > 0 && confidence < 1)) {
    throw new RunnerError(
      `replication.confidence must lie strictly between 0 and 1; received ${confidence}.`,
      'replication.confidence',
    );
  }
  const acceptableRange = spec?.acceptableRange ?? RUNNER_DEFAULTS.acceptableRange;
  if (!Number.isFinite(acceptableRange) || acceptableRange < 0) {
    throw new RunnerError(
      `replication.acceptableRange must be a non-negative number; received ${acceptableRange}.`,
      'replication.acceptableRange',
    );
  }
  return {
    minReplications,
    maxReplications,
    checkEvery,
    confidence,
    acceptableRange,
    stoppingMetric: spec?.stoppingMetric ?? (RUNNER_DEFAULTS.stoppingMetric as ReplicationMetric),
    stopOnSaturation: spec?.stopOnSaturation ?? RUNNER_DEFAULTS.stopOnSaturation,
  };
}

export function resolveParallelPolicy(
  spec: ParallelSpec | undefined,
  override?: ParallelSpec | undefined,
): ResolvedParallelPolicy {
  const merged: ParallelSpec = { ...spec, ...override };
  const workers = merged.workers ?? RUNNER_DEFAULTS.workers;
  return {
    mode: merged.mode ?? (RUNNER_DEFAULTS.parallelMode as ResolvedParallelPolicy['mode']),
    workers: requireInteger(workers, 'parallel.workers', 0),
    minReplicationsForWorkers: requireInteger(
      merged.minReplicationsForWorkers ?? RUNNER_DEFAULTS.minReplicationsForWorkers,
      'parallel.minReplicationsForWorkers',
      1,
    ),
  };
}

/* -------------------------------------------------------------------------- *
 * Planning
 * -------------------------------------------------------------------------- */

interface ResolvedDispatcherArm {
  readonly armId: string;
  readonly profileId: string;
  readonly options: DispatchPolicyOptions | undefined;
}

function resolveDispatcherArms(
  spec: ExperimentSpec,
  resources: ExperimentResources,
): readonly ResolvedDispatcherArm[] {
  const arms: ResolvedDispatcherArm[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of spec.dispatchers.entries()) {
    const path = `spec.dispatchers[${index}]`;
    const arm: DispatcherArmSpec = typeof entry === 'string' ? { profile: entry } : entry;
    const armId = arm.id ?? arm.profile;
    if (!resources.dispatcherProfilesById.has(arm.profile)) {
      throw new RunnerError(
        `${path}: no dispatcher profile "${arm.profile}" in the supplied resources. Known: ${[...resources.dispatcherProfilesById.keys()].join(', ')}`,
        path,
      );
    }
    if (seen.has(armId)) {
      throw new RunnerError(
        `${path}: duplicate dispatcher arm id "${armId}". Two arms sharing an id would collide in the plan and in every result keyed by it; give the variant an explicit "id".`,
        path,
      );
    }
    seen.add(armId);
    arms.push({ armId, profileId: arm.profile, options: arm.options });
  }
  if (arms.length === 0) {
    throw new RunnerError('spec.dispatchers is empty: an experiment needs at least one arm.', 'spec.dispatchers');
  }
  return arms;
}

function resolveTrafficArms(spec: ExperimentSpec): readonly TrafficArmSpec[] {
  const seen = new Set<string>();
  for (const [index, arm] of spec.traffic.entries()) {
    if (seen.has(arm.id)) {
      throw new RunnerError(
        `spec.traffic[${index}]: duplicate traffic arm id "${arm.id}".`,
        `spec.traffic[${index}]`,
      );
    }
    seen.add(arm.id);
  }
  if (spec.traffic.length === 0) {
    throw new RunnerError(
      'spec.traffic is empty: an experiment needs at least one traffic condition. Use [{ "id": "default" }] for the template’s own defaults.',
      'spec.traffic',
    );
  }
  return spec.traffic;
}

/**
 * Expand a spec into cells and identify the CRN cohorts.
 *
 * Pure: no filesystem, no clock, no RNG. Ordering is `buildings × traffic × dispatchers` with the
 * dispatcher **innermost**, which is not cosmetic — it makes the arms of a paired comparison
 * contiguous in the plan, so a CRN cohort is a contiguous run of cells and a printed plan reads as
 * the comparison it is.
 *
 * @throws RunnerError for an id the resources do not contain, a duplicate arm id, or an empty axis.
 */
export function planExperiment(
  spec: ExperimentSpec,
  resources: ExperimentResources,
  options?: ExperimentRunOptions | undefined,
): ExperimentPlan {
  const policy = resolveReplicationPolicy(spec.replication);
  const parallel = resolveParallelPolicy(spec.parallel, options?.parallel);
  const dispatchers = resolveDispatcherArms(spec, resources);
  const traffic = resolveTrafficArms(spec);
  const warnings: string[] = [];

  if (spec.buildings.length === 0) {
    throw new RunnerError('spec.buildings is empty: an experiment needs at least one building.', 'spec.buildings');
  }
  const buildingIds = new Set<string>();
  for (const [index, id] of spec.buildings.entries()) {
    if (buildingIds.has(id)) {
      throw new RunnerError(`spec.buildings[${index}]: duplicate building id "${id}".`, `spec.buildings[${index}]`);
    }
    buildingIds.add(id);
  }

  const overrides = spec.simulation ?? {};
  const cells: ExperimentCell[] = [];

  for (const buildingId of spec.buildings) {
    const building = resources.buildingsById.get(buildingId);
    if (building === undefined) {
      throw new RunnerError(
        `spec.buildings: no building "${buildingId}" in the supplied resources. Known: ${[...resources.buildingsById.keys()].join(', ')}`,
        'spec.buildings',
      );
    }
    for (const arm of traffic) {
      for (const dispatcher of dispatchers) {
        const profile = resources.dispatcherProfilesById.get(dispatcher.profileId);
        // Unreachable: resolveDispatcherArms already checked every profile id.
        if (profile === undefined) throw new RunnerError(`missing profile "${dispatcher.profileId}"`);

        const simulation: CellSimulationConfig = {
          building,
          dispatcherProfile: profile,
          trafficProfiles: resources.trafficProfiles,
          ...(resources.elevatorSpecs === undefined ? {} : { elevatorSpecs: resources.elevatorSpecs }),
          ...(arm.demandTemplate === undefined ? {} : { demandTemplate: arm.demandTemplate }),
          ...(arm.durationS === undefined ? {} : { durationS: arm.durationS }),
          ...(arm.reportWindow === undefined ? {} : { reportWindow: arm.reportWindow }),
          ...(arm.demand === undefined ? {} : { demand: arm.demand }),
          ...(dispatcher.options === undefined ? {} : { dispatcherOptions: dispatcher.options }),
          // Core defaults `onTimeout` to 'throw'; the runner measures saturation instead.
          onTimeout: overrides.onTimeout ?? (RUNNER_DEFAULTS.onTimeout as 'report'),
          ...(overrides.transferWalkS === undefined ? {} : { transferWalkS: overrides.transferWalkS }),
          ...(overrides.dispatchRetryS === undefined ? {} : { dispatchRetryS: overrides.dispatchRetryS }),
          ...(overrides.drainGraceS === undefined ? {} : { drainGraceS: overrides.drainGraceS }),
          ...(overrides.queueSampleCount === undefined ? {} : { queueSampleCount: overrides.queueSampleCount }),
          ...(overrides.doorObstructionProbability === undefined
            ? {}
            : { doorObstructionProbability: overrides.doorObstructionProbability }),
          ...(overrides.maxEvents === undefined ? {} : { maxEvents: overrides.maxEvents }),
          ...(overrides.summarize === undefined ? {} : { summarize: overrides.summarize }),
          metadata: Object.freeze({
            experimentId: spec.id,
            trafficArmId: arm.id,
            dispatcherArmId: dispatcher.armId,
          }),
        };

        cells.push({
          cellId: `${buildingId}|${arm.id}|${dispatcher.armId}`,
          index: cells.length,
          buildingId,
          trafficArmId: arm.id,
          dispatcherArmId: dispatcher.armId,
          dispatcherProfileId: dispatcher.profileId,
          traceKey: traceKeyOf(simulation),
          simulation,
        });
      }
    }
  }

  const cohorts = crnCohortsOf(cells);
  if (dispatchers.length > 1 && cohorts.every((cohort) => cohort.cellIds.length < 2)) {
    warnings.push(
      'No CRN cohort contains two cells, so no paired comparison is possible. Check that the arms differ only in their dispatcher.',
    );
  }

  return {
    experimentId: spec.id,
    experimentSeed: normalizeExperimentSeed(spec.seed),
    cells: Object.freeze(cells),
    cohorts,
    policy,
    parallel,
    keepRecords: options?.keepRecords ?? RUNNER_DEFAULTS.keepRecords,
    onReplicationError:
      options?.onReplicationError ?? (RUNNER_DEFAULTS.onReplicationError as 'throw' | 'record'),
    guaranteedReplications: cells.length * policy.minReplications,
    warnings: Object.freeze(warnings),
  };
}
