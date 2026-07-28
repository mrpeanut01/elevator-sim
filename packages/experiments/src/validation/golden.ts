/**
 * Golden runs — **Phase 8 § Determinism regression**, "golden runs replay byte-identically from
 * stored seeds".
 *
 * ## The problem this file is designed around, stated before the solution
 *
 * The obvious way to build a golden-run regression is to run the simulator once, commit the
 * resulting record (or a digest of it), and assert equality forever. That artefact is red the
 * first time anybody legitimately changes dispatch behaviour, and the fix is always the same
 * ceremony: regenerate the file, eyeball nothing, commit. After the third regeneration nobody
 * reads the diff, and the fourth one hides a real regression. A golden that must be regenerated
 * on every legitimate behaviour change is not a guard; it is a ritual with a green tick.
 *
 * So **this manifest contains no simulator output at all.** Not an AWT, not a fingerprint, not a
 * passenger count. It contains:
 *
 * 1. the **inputs** — the seed and the configuration, hand-authored, referencing `data/` by id;
 * 2. the **key paths** of the persisted envelope those inputs produce — names, never values.
 *
 * Both are invariant under any change to how elevators behave. A dispatcher rewrite, a new cost
 * term, a retuned weight vector, a physics fix: all of them move every number in the run and
 * none of them touches a single byte of `golden/manifest.json`. The concurrent Phase 6 work is
 * the case in point — it is the largest behaviour change in the project and this manifest is
 * inert under it.
 *
 * What *does* move the manifest is a change to the **persistence contract**: a new replay knob on
 * `SimulationConfig` that `createStoredRun` starts recording, or one that stops being recorded.
 * That is exactly the change a replay regression should force a human to look at, and when it
 * happens the diff is one key name. A regeneration whose diff is anything other than added or
 * removed key names is itself the bug.
 *
 * ## What the suite then asserts, and why each part is separate
 *
 * | Assertion | Failure means |
 * |---|---|
 * | the same envelope re-executes to the same record, twice in a row | the simulator lost determinism (invariants 2, 3, 4) |
 * | it survives NDJSON → disk → `readRunSetFile` → `replayStoredRun` | the *stored* configuration is incomplete |
 * | the produced envelope's key set equals the manifest's | the persistence contract moved without anybody saying so |
 * | every stored field, perturbed alone, is visible on at least one golden | some field is stored but nothing reads it |
 *
 * The last one is the negative control, and it is deliberately stronger than the one Phase 3
 * built. `storedRunReplay.test.ts` increments the seed and requires the replay to differ, which
 * proves the seed is load-bearing (invariant 5) and says nothing about the other fourteen fields.
 * A record that carried the right seed and the wrong `durationS` would pass it. {@link
 * FIELD_PERTURBATIONS} moves each stored field on its own, and the suite reports the whole matrix.
 *
 * The claim is quantified over the *set* rather than over each golden, and that is a correctness
 * fix rather than a hedge: `sim.dispatchRetryS` is genuinely inert on a run whose refusals are all
 * structural, because `simulation.ts` deliberately does not re-offer such a call on a timer. A
 * per-golden "every field must move" is simply false, and asserting it would have meant tuning a
 * golden until it happened to hold. What is asserted instead — every stored key demonstrably read
 * *somewhere*, with a golden added when nothing reached the regime — is the true statement, and
 * `seed` is still additionally required on every golden individually.
 *
 * ## Where the numbers are, since they are not here
 *
 * `benchmark/published.ts` pins full-precision published figures with a drift guard — that is the
 * artefact whose job *is* to notice a number moving, and it is regenerated deliberately through
 * `benchmark/regeneratePins.ts`. Splitting the two is the point: one file answers "did the answer
 * change", this one answers "can the answer be reproduced from what we stored". Merging them
 * would make every behaviour change look like a determinism failure.
 */

import {
  METRICS_SCHEMA_VERSION,
  type DemandTemplateId,
  type SimulationConfig,
} from '@elevator-sim/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { REPORTS_SCHEMA_VERSION, type StoredRunConfig } from '../reports/types.js';
import type { ReplaySources } from '../reports/replay.js';

/* -------------------------------------------------------------------------- *
 * The manifest
 * -------------------------------------------------------------------------- */

/**
 * One golden run: everything `runSimulation` needs, and nothing it produces.
 *
 * Every field here is authored by hand. The seed is a decimal string for the reason
 * `StoredRunConfig.seed` is — 64-bit seeds do not survive `JSON.stringify` as anything else —
 * and it is deliberately above 2^53 in one case so the manifest exercises the precision path a
 * sweep actually writes.
 */
export interface GoldenSpec {
  /** Stable identity of this golden. Never reused, never renumbered. */
  readonly id: string;
  /** Why this run is in the set. Prose, read by humans when one of them goes red. */
  readonly covers: string;
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly seed: string;
  readonly demandTemplate: DemandTemplateId;
  readonly durationS?: number;
  readonly demand?: GoldenDemand;
  readonly sim?: GoldenSim;
  /** Whether the run is driven with `data/elevator-specs.json`. See `ReplaySources`. */
  readonly usesElevatorSpecs: boolean;
  /**
   * Dotted key paths of the `StoredRunConfig` these inputs produce, sorted.
   *
   * Names only. Arrays are named but not indexed, so `summarize.terminalFloorIds` appears once
   * however many entrances the building has.
   */
  readonly envelopeKeys: readonly string[];
  /** Whether this golden is in the always-on set or only under `ELEVATOR_SIM_DEEP=1`. */
  readonly tier: 'always-on' | 'deep';
}

export interface GoldenDemand {
  readonly arrivalRatePctPop5min?: number;
  readonly peakWindowS?: number;
  readonly directionalSplit?: {
    readonly incoming: number;
    readonly outgoing: number;
    readonly interfloor: number;
  };
  readonly entranceWeights?: Readonly<Record<string, number>>;
}

export interface GoldenSim {
  readonly transferWalkS?: number;
  readonly dispatchRetryS?: number;
  readonly drainGraceS?: number;
  readonly queueSampleCount?: number;
  readonly doorObstructionProbability?: number;
  readonly maxEvents?: number;
  readonly onTimeout?: 'throw' | 'report';
}

export interface GoldenManifest {
  readonly $comment: string;
  readonly version: number;
  /**
   * The two schema versions the key list was captured against.
   *
   * Pinned so that a schema bump cannot slip past as "the keys happen to be the same". They are
   * two numbers rather than one for the reason `reports/types.ts` gives: a new metric field is a
   * `core` change and a new replay knob is an `experiments` change, and a reader has to be able
   * to say which one it is looking at.
   */
  readonly reportsSchemaVersion: number;
  readonly metricsSchemaVersion: number;
  readonly runs: readonly GoldenSpec[];
}

const MANIFEST_PATH = fileURLToPath(new URL('./golden/manifest.json', import.meta.url));

let cached: GoldenManifest | undefined;

/** `golden/manifest.json`, parsed once per process. */
export function goldenManifest(): GoldenManifest {
  cached ??= JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as GoldenManifest;
  return cached;
}

/** The goldens in a tier. `'deep'` returns the whole set, because deep is a superset. */
export function goldensFor(tier: 'always-on' | 'deep'): readonly GoldenSpec[] {
  const runs = goldenManifest().runs;
  return tier === 'deep' ? runs : runs.filter((run) => run.tier === 'always-on');
}

/** Whether the opt-in deep campaigns were requested. Mirrors `fuzz/campaign.ts`'s convention. */
export function deepRequested(): boolean {
  return process.env['ELEVATOR_SIM_DEEP'] === '1';
}

/* -------------------------------------------------------------------------- *
 * Inputs → SimulationConfig
 * -------------------------------------------------------------------------- */

/**
 * Rebuild the `SimulationConfig` a golden names.
 *
 * Structurally the same job `reports/replay.ts` `replaySimulationConfig` does, and deliberately
 * *not* that function: this one starts from the hand-authored spec rather than from an envelope,
 * which is what makes the round trip a round trip. Using `replaySimulationConfig` on both ends
 * would prove only that a function agrees with itself.
 *
 * @throws Error naming the missing id. Replaying against a substitute building is worse than not
 *   replaying — the run would succeed and mean nothing.
 */
export function goldenSimulationConfig(
  spec: GoldenSpec,
  sources: ReplaySources,
): SimulationConfig {
  const building = sources.buildingsById.get(spec.buildingId);
  if (building === undefined) {
    throw new Error(
      `Golden "${spec.id}" names building "${spec.buildingId}", which is not in data/. Known: ${[...sources.buildingsById.keys()].join(', ')}`,
    );
  }
  const dispatcherProfile = sources.dispatcherProfilesById.get(spec.dispatcherProfileId);
  if (dispatcherProfile === undefined) {
    throw new Error(
      `Golden "${spec.id}" names dispatcher profile "${spec.dispatcherProfileId}", which is not in data/. Known: ${[...sources.dispatcherProfilesById.keys()].join(', ')}`,
    );
  }
  if (spec.usesElevatorSpecs && sources.elevatorSpecs === undefined) {
    throw new Error(
      `Golden "${spec.id}" declares usesElevatorSpecs, and no data/elevator-specs.json was supplied. The load sensor would silently fall back to LOAD_SENSOR_DEFAULTS.`,
    );
  }

  return Object.freeze({
    building,
    dispatcherProfile,
    trafficProfiles: sources.trafficProfiles,
    ...(spec.usesElevatorSpecs && sources.elevatorSpecs !== undefined
      ? { elevatorSpecs: sources.elevatorSpecs }
      : {}),
    seed: BigInt(spec.seed),
    demandTemplate: spec.demandTemplate,
    runId: spec.id,
    ...(spec.durationS === undefined ? {} : { durationS: spec.durationS }),
    ...(spec.demand === undefined ? {} : { demand: spec.demand }),
    ...(spec.sim ?? {}),
    onTimeout: spec.sim?.onTimeout ?? 'report',
  }) as SimulationConfig;
}

/* -------------------------------------------------------------------------- *
 * Key paths
 * -------------------------------------------------------------------------- */

/**
 * The dotted key paths of a value, sorted, arrays named but not indexed.
 *
 * Names, never values — the whole reason the manifest is inert under a behaviour change. An
 * array contributes its own path and stops: `summarize.terminalFloorIds` is one entry whether the
 * building has one entrance or five, so adding a lobby to a building is not a golden update.
 */
export function keyPathsOf(value: unknown, prefix = ''): readonly string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix === '' ? [] : [prefix];
  }
  const paths: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    const path = prefix === '' ? key : `${prefix}.${key}`;
    paths.push(...keyPathsOf(entry, path));
  }
  return paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The key paths of a stored envelope, with the two free-form maps collapsed to their own path.
 *
 * `demand.entranceWeights` is keyed by floor id and `summarize.window` by nothing stable, so
 * descending into them would put building content into a structural check and make an edit to a
 * building config look like a persistence-contract change. Everything else is descended into,
 * because everything else is contract.
 */
export function envelopeKeyPaths(config: StoredRunConfig): readonly string[] {
  const opaque = new Set(['demand.entranceWeights', 'demandTemplate']);
  const collapse = (value: unknown, prefix: string): readonly string[] => {
    if (opaque.has(prefix)) return [prefix];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return prefix === '' ? [] : [prefix];
    }
    const paths: string[] = [];
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      paths.push(...collapse(entry, prefix === '' ? key : `${prefix}.${key}`));
    }
    return paths;
  };
  return [...collapse(config, '')].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/* -------------------------------------------------------------------------- *
 * The per-field negative control
 * -------------------------------------------------------------------------- */

/**
 * One way of moving a single stored field, and what it is there to prove.
 *
 * `apply` returns `undefined` when the field is absent from this golden's envelope, which is how
 * one table covers goldens with different option bags without pretending to have tested a field
 * that was never stored.
 */
export interface FieldPerturbation {
  /** The stored key path this moves. Cross-checked against the envelope's real key set. */
  readonly path: string;
  readonly why: string;
  readonly apply: (config: StoredRunConfig) => StoredRunConfig | undefined;
}

const withSim = (
  config: StoredRunConfig,
  patch: Partial<NonNullable<StoredRunConfig['sim']>>,
): StoredRunConfig | undefined =>
  config.sim === undefined ? undefined : { ...config, sim: { ...config.sim, ...patch } };

const withDemand = (
  config: StoredRunConfig,
  patch: Partial<NonNullable<StoredRunConfig['demand']>>,
): StoredRunConfig | undefined =>
  config.demand === undefined ? undefined : { ...config, demand: { ...config.demand, ...patch } };

/**
 * Every stored field, moved on its own.
 *
 * Each perturbation is the smallest change that is still meaningful for the field's type: `+1`
 * on the seed, `+1 s` on a duration, the other value of an enum. Small on purpose — a
 * perturbation large enough to change the answer by accident proves nothing about whether the
 * field is *read*.
 *
 * Four stored keys are deliberately absent from this table, with reasons rather than silence.
 * {@link UNPERTURBED} carries them, and the suite asserts that the table plus that set covers the
 * envelope exactly — so a new stored field cannot arrive unnoticed and untested.
 */
export const UNPERTURBED: Readonly<Record<string, string>> = Object.freeze({
  buildingId:
    'covered by substitution against data/ in the suite, where the available ids are known; a synthesised id would only test the loader',
  dispatcherProfileId: 'same — substituted for a real second profile in the suite',
  trafficProfileId:
    'cannot be moved independently. replaySimulationConfig refuses a record whose stored traffic profile disagrees with its building, by design, and the suite asserts that refusal. Perturbing it would test the guard, not the field',
  usesElevatorSpecs:
    'a provenance flag, not a knob. reports/replay.ts is explicit that omitting elevatorSpecs falls back to LOAD_SENSOR_DEFAULTS, which are "the same numbers today" — so flipping it is legitimately invisible in the record, and the field is stored precisely so the day they diverge is not silent. It is checked in the suite by the complementary assertion: a replay that declares it and is given no specs must throw',
  'sim.onTimeout':
    'a policy, not an input to the arithmetic. On a run that finishes inside its budget it changes nothing at all, so a blanket "this field moves the record" assertion would be false for it. The suite asserts the behaviour it actually governs instead: on the golden that timed out, replaying under "throw" must throw, and under "report" must not',
});
export const FIELD_PERTURBATIONS: readonly FieldPerturbation[] = Object.freeze([
  {
    path: 'seed',
    why: 'invariant 5 — the seed must be load-bearing rather than decorative',
    apply: (config) => ({ ...config, seed: (BigInt(config.seed) + 1n).toString() }),
  },
  {
    path: 'durationS',
    why: 'the demand horizon: a shorter run generates fewer people',
    apply: (config) =>
      config.durationS === undefined ? undefined : { ...config, durationS: config.durationS - 30 },
  },
  {
    path: 'demand.arrivalRatePctPop5min',
    why: 'the arrival rate is the single strongest driver of the trace',
    apply: (config) =>
      config.demand?.arrivalRatePctPop5min === undefined
        ? undefined
        : withDemand(config, {
            arrivalRatePctPop5min: config.demand.arrivalRatePctPop5min + 0.25,
          }),
  },
  {
    path: 'demand.peakWindowS',
    why: 'the peak window shapes the arrival intensity curve',
    apply: (config) =>
      config.demand?.peakWindowS === undefined
        ? undefined
        : withDemand(config, { peakWindowS: config.demand.peakWindowS - 60 }),
  },
  {
    path: 'demand.directionalSplit',
    why: 'incoming versus outgoing decides where everybody starts',
    apply: (config) =>
      config.demand?.directionalSplit === undefined
        ? undefined
        : withDemand(config, {
            directionalSplit: { incoming: 0.5, outgoing: 0.3, interfloor: 0.2 },
          }),
  },
  {
    path: 'demand.entranceWeights',
    why: 'which entrance the incoming traffic arrives through',
    apply: (config) => {
      const weights = config.demand?.entranceWeights;
      if (weights === undefined) return undefined;
      const keys = Object.keys(weights);
      if (keys.length < 2) return undefined;
      const flipped = Object.fromEntries(
        keys.map((key, index) => [key, index === 0 ? 0 : 1 / (keys.length - 1)]),
      );
      return withDemand(config, { entranceWeights: flipped });
    },
  },
  {
    path: 'sim.transferWalkS',
    why: 'the sky-lobby transfer penalty enters every multi-bank journey',
    apply: (config) =>
      config.sim?.transferWalkS === undefined
        ? undefined
        : withSim(config, { transferWalkS: config.sim.transferWalkS + 5 }),
  },
  {
    path: 'sim.dispatchRetryS',
    /* Tripled rather than nudged: this is a *timer*, and the run only notices it where a call
       was refused for a soft reason and comes back. A one-second nudge on a cadence that fires
       twice in a run is a perturbation small enough to be invisible for reasons that have
       nothing to do with whether the field is read. */
    why: 'how fast a softly-refused call is re-offered to the group',
    apply: (config) =>
      config.sim?.dispatchRetryS === undefined
        ? undefined
        : withSim(config, { dispatchRetryS: config.sim.dispatchRetryS * 3 }),
  },
  {
    path: 'sim.drainGraceS',
    /* Cut to a second rather than nudged, and for the same reason the retry cadence is tripled:
       this is a *deadline*, and lengthening one that was never reached is not a perturbation at
       all. Truncating it is — on any run with somebody still in transit when demand stops. */
    why: 'how long the run keeps going after demand stops',
    apply: (config) =>
      config.sim?.drainGraceS === undefined ? undefined : withSim(config, { drainGraceS: 1 }),
  },
  {
    path: 'sim.queueSampleCount',
    why: 'the queue sampling grid, which is recorded and read by saturation detection',
    apply: (config) =>
      config.sim?.queueSampleCount === undefined
        ? undefined
        : withSim(config, { queueSampleCount: config.sim.queueSampleCount + 4 }),
  },
  {
    path: 'sim.doorObstructionProbability',
    why: 'a draw from the doors stream — a knob that consumes randomness',
    apply: (config) =>
      config.sim?.doorObstructionProbability === undefined
        ? undefined
        : withSim(config, {
            doorObstructionProbability: Math.min(
              0.9,
              config.sim.doorObstructionProbability + 0.2,
            ),
          }),
  },
  {
    path: 'sim.maxEvents',
    why: 'the kernel event budget: a smaller one stops the run early and is recorded as timed-out',
    apply: (config) =>
      config.sim?.maxEvents === undefined ? undefined : withSim(config, { maxEvents: 400 }),
  },
  {
    path: 'summarize.terminalFloorIds',
    why: 'which floors count as terminals, which decides what a round trip is',
    apply: (config) => {
      const terminals = config.summarize?.terminalFloorIds;
      if (terminals === undefined || config.summarize === undefined) return undefined;
      /* A single-entrance building has nothing to drop to. Exercised on the two-entrance
         goldens instead; the suite's coverage check is over the whole set, not per run. */
      if (terminals.length < 2) return undefined;
      return {
        ...config,
        summarize: { ...config.summarize, terminalFloorIds: [...terminals].slice(0, 1) },
      };
    },
  },
  {
    path: 'summarize.window.startS',
    why: 'where the measurement window opens',
    apply: (config) => {
      const window = config.summarize?.window;
      if (window === undefined || config.summarize === undefined) return undefined;
      return {
        ...config,
        summarize: { ...config.summarize, window: { ...window, startS: window.startS + 30 } },
      };
    },
  },
  {
    path: 'summarize.window.endS',
    why: 'where it closes',
    apply: (config) => {
      const window = config.summarize?.window;
      if (window === undefined || config.summarize === undefined) return undefined;
      return {
        ...config,
        summarize: { ...config.summarize, window: { ...window, endS: window.endS - 30 } },
      };
    },
  },
  {
    path: 'summarize.window.id',
    why: 'the window label travels into the record and names what was measured',
    apply: (config) => {
      const window = config.summarize?.window;
      if (window === undefined || config.summarize === undefined) return undefined;
      return {
        ...config,
        summarize: {
          ...config.summarize,
          window: { ...window, id: `${window.id}-perturbed` },
        },
      };
    },
  },
  {
    path: 'runId',
    why: 'the run identity, which a sweep supplies to keep 20 000 records addressable',
    apply: (config) =>
      config.runId === undefined ? undefined : { ...config, runId: `${config.runId}-perturbed` },
  },
  {
    path: 'demandTemplate',
    why: 'which arrival-intensity curve the trace is generated from',
    apply: (config) => {
      /* Only between the two named templates, and only when the horizon is long enough for the
         other one: constant-iso discards 15 minutes of warm-up and 5 of cool-down, so a shorter
         run has no measurement window and the generator throws. Refusing here rather than
         catching later keeps a generator constraint out of a determinism assertion. */
      if (typeof config.demandTemplate !== 'string') return undefined;
      if (config.demandTemplate === 'rise-and-fall') {
        return (config.durationS ?? 0) < 1260
          ? undefined
          : { ...config, demandTemplate: 'constant-iso' as const };
      }
      return { ...config, demandTemplate: 'rise-and-fall' as const };
    },
  },
]);

/* -------------------------------------------------------------------------- *
 * Reporting
 * -------------------------------------------------------------------------- */

/** The schema versions the manifest was captured against, for the suite's console output. */
export function schemaVersionLine(): string {
  const manifest = goldenManifest();
  return (
    `manifest v${String(manifest.version)} captured at ` +
    `reports schema ${String(manifest.reportsSchemaVersion)} (build ${String(REPORTS_SCHEMA_VERSION)}), ` +
    `metrics schema ${String(manifest.metricsSchemaVersion)} (build ${String(METRICS_SCHEMA_VERSION)})`
  );
}
