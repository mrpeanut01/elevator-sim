/**
 * An **edited weight vector** as a runnable dispatcher — `docs/10-experience-layer-contract.md`
 * § 11 **W6**, closing the known limitation [§ D161](../../../../DECISIONS.md) states in as many
 * words:
 *
 * > the player's move is a **shipped profile**, not a live weight editor — wiring W4's form into
 * > the arm is W6's — so four stages need an authored weight vector to clear.
 *
 * ## The invariant this file exists to keep
 *
 * CLAUDE.md invariant 7: *"Anything tunable is data, not code."* An edited vector is therefore
 * **not** a special kind of arm that the simulator learns about. It is a point of the declared
 * search space, decoded into `data/dispatcher-profiles.json`'s own JSON shape, and parsed by
 * `parseDispatcherProfiles` — the function `loadConfig` itself calls. If it does not parse, it does
 * not run, and the refusal is `core`'s own message rather than a second opinion.
 *
 * `candidateProfile` is that whole trip, by import: `decodeCandidate` → `applyPatch` →
 * `parseProfile`. Nothing here re-implements a step of it.
 *
 * ## Four refusals, in the order they are checked, and all four are at the control
 *
 * 1. **An id the space does not declare.** A form pointed at a different space than the one that
 *    drew it.
 * 2. **A value the dimension cannot hold** — wrong runtime kind, outside the declared bounds, not
 *    among the declared values, non-integral for an integer, or on a dimension whose `activeWhen`
 *    is unmet. This is {@link applyControlEdit}, **by call**, so the sentence a player sees when a
 *    slider refuses and the sentence a batch would raise are the same sentence produced by the
 *    same function. A second bounds check here would be a second answer.
 * 3. **A combination the declared box admits and `core` refuses.** The declared box is not the
 *    feasible set: `SearchSpace.validate` decodes the point, parses it and builds a policy from
 *    it, and *"whatever `core` refuses, this refuses, with `core`'s own message."* There is exactly
 *    one such constraint today — a `destination-entry` dispatcher may not defer — and one uniform
 *    draw in eight violates it, so this is not a theoretical branch.
 * 4. **A combination `core` refuses on *this building's cars*.** GitHub issue **#475**. Step 3 is
 *    building-independent by construction: `SearchSpace.validate` asks whether a *group
 *    controller* can be built, and two of the eight `answer.*` rows are not answerable that way
 *    because they are checked against a **car**. `answer.maxDwellS` under
 *    `answer.dwellPolicy: 'adaptive'` must be at least the larger of that car's own
 *    `dwellCarCallS` and `dwellHallCallS`, and `answer.bypassLoadThreshold` must be strictly
 *    positive and no greater than `answer.overloadThreshold`. So this step is
 *    {@link buildingFeasibility}, **by call** — the same `resolveDoorConfig` and
 *    `resolveLoadSensor` that `model/car/car.ts` calls when the run is built — and it is why
 *    {@link EditTarget} is a required argument rather than an option.
 *
 * **Refused at the control, not at the simulator**, which is the requirement: `admitEditedVector`
 * is what `dev/campaignPanel.ts` calls before it enables *Run*, and `resolveEditedProfile` is what
 * `batch/runBatch.ts` calls inside the worker. Both are this module, so the pre-flight cannot pass
 * something the run then rejects, and the run cannot accept something the pre-flight refused.
 *
 * ## Why the building is an argument and not an option — issue #475
 *
 * Step 4 arrived because the invariant in the paragraph above was **false**, and it was found by a
 * sweep rather than by a reader: `scenario/survivorSpace.ts` enumerated the configurations a
 * scenario budget reaches, this module admitted every one of them, and `core` threw on **four**
 * when the run was built — *"dwellPolicy \"adaptive\" requires maxDwellS >= the larger base dwell
 * (5s)"*. Those four had to be counted **out** of the sweep's `examined`, because a configuration
 * nobody can run is neither a way through a scenario nor a failed attempt.
 *
 * A vector is runnable **on a building**, never in the abstract — the bound is a car's door
 * timings, and the same vector is admissible at one tower and refused at the next. A gate that can
 * be called without naming the building is a gate that will be called that way, and the answer it
 * gives then is about a different question from the one the caller asked. So {@link EditTarget} is
 * required at every entry point, and the callers that had a building all along now hand it over.
 *
 * **Recorded here rather than in `DECISIONS.md`, under [§ D405](../../../../DECISIONS.md).** Issue
 * #475 names two ways out and leans to this one: *the gate learns the constraint*, or *`core`
 * accepts and clamps and says where*. The first is taken, and the reason is what the second would
 * cost — clamping keeps every signature and changes what `answer.maxDwellS` **means**, so a player
 * who sets 4 gets 5 and any report quoting the dial quotes a number the run did not use. That is a
 * stale refusal manufactured on purpose, which is the class § D227 exists for. The reach is a
 * required argument on two exported functions and the five callers of the pair — inside this
 * module's own port rather than past it — so this paragraph is the record § D405 says it is, and no
 * number is taken.
 */

import {
  buildingFeasibility,
  candidateFromProfile,
  candidateProfile,
  type Candidate,
  type ParameterValue,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';
import type {
  DispatcherProfile,
  ElevatorSpecs,
  ResolvedBuilding,
} from '@elevator-sim/core/browser';

import { applyControlEdit, candidateOf } from './controls.js';
import type { ControlValues } from './types.js';

/**
 * **The building an edited vector will be run on** — issue **#475**, and the argument that makes
 * *"an admitted vector runs"* a true sentence rather than an aspiration.
 *
 * Two of the `answer.*` dimensions are bounded by a **car** rather than by another dial, so
 * *"may a player set this?"* has no building-independent answer. Handing this over is not a
 * courtesy to the check: it is the difference between answering the caller's question and
 * answering a narrower one that happens to be cheaper.
 *
 * `elevatorSpecs` is `undefined`-able rather than optional, because the load-sensor bound reads
 * the shipped sensor defaults and a caller that has none has to say so out loud rather than by
 * omission. Every shipped caller has them: `BatchResources`, `BrowserResources` and the honesty
 * corpus's own context all carry the parsed `data/elevator-specs.json`.
 */
export interface EditTarget {
  readonly building: ResolvedBuilding;
  readonly elevatorSpecs: ElevatorSpecs | undefined;
}

/**
 * A player's edit, as data that survives `JSON.stringify` and `postMessage`.
 *
 * A plain record rather than a `Map`, because a `BatchRequest` crosses a worker boundary and is
 * written to a file by callers — the same reason `BatchRequest.seed` is a decimal string. The
 * values are `ParameterValue`, which is a number, a boolean or a string, so the record is JSON by
 * construction.
 */
export interface EditedVector {
  /** The shipped profile the edit starts from. Its id, resolved by the caller against `data/`. */
  readonly baseProfileId: string;
  /** The id the resulting profile carries, so a report can name what ran. */
  readonly profileId: string;
  /** Dimension id → value, in the discovered space's own ids. Only what the player moved. */
  readonly values: Readonly<Record<string, ParameterValue>>;
}

/** Why an edited vector cannot run, or the profile it becomes. */
export type EditedProfileOutcome =
  | {
      readonly ok: true;
      readonly profile: DispatcherProfile;
      /** The point, as a search would see it — inactive dimensions dropped. */
      readonly candidate: Candidate;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * The base profile's point, widened to every declared dimension so the form can draw them all.
 *
 * `candidateFromProfile` is `experiments`' answer to *"what does this profile actually run?"* — it
 * fills a dimension the profile does not author with that dimension's declared default, *"because
 * that is what `resolveDispatchConfig` will do with that profile at run time"*. The loop after it
 * puts back the dimensions the base's own gates dropped, at their declared default, for the reason
 * `controls.ts`'s {@link defaultValues} gives: a disabled control still has to show a value beside
 * its reason, and a gate flipped back on must restore what was there.
 */
export function valuesFromProfile(space: SearchSpace, base: DispatcherProfile): ControlValues {
  const values = new Map<string, ParameterValue>(candidateFromProfile(space, base));
  for (const parameter of space.parameters) {
    if (!values.has(parameter.id)) values.set(parameter.id, parameter.default);
  }
  return values;
}

/**
 * Apply an edit to a base profile's point, refusing at the first dimension that cannot hold it.
 *
 * Every write goes through {@link applyControlEdit}, so a value out of range is refused with the
 * bound quoted and a value on a dead gate is refused with the gate named. The order is the record's
 * own insertion order, which matters for a gate and its dependant: writing the gate first is what
 * lets the dependant become live in the same pass, and a player who moved both in the form did
 * exactly that.
 */
export function applyEdit(
  space: SearchSpace,
  base: ControlValues,
  edit: Readonly<Record<string, ParameterValue>>,
): { readonly ok: true; readonly values: ControlValues } | { readonly ok: false; readonly reason: string } {
  let values = base;
  for (const [id, value] of Object.entries(edit)) {
    const result = applyControlEdit(space, values, id, value);
    if (!result.accepted) return { ok: false, reason: result.reason };
    values = result.values;
  }
  return { ok: true, values };
}

/** What a caller learns about an edit **before** anything is run. */
export interface EditAdmission {
  readonly admissible: boolean;
  /** The reason, when it is not. Never empty when {@link admissible} is `false`. */
  readonly reason: string | undefined;
  /** The point the edit describes, when it is admissible. */
  readonly candidate: Candidate | undefined;
}

/**
 * May this edit run **on this building**? — the control's own question, answered without running
 * anything.
 *
 * Steps 1–4 of the module docstring, in order, and it stops at the first refusal because the
 * second refusal on a point that already failed the first is about a point nobody proposed.
 *
 * Step 4 is last for a reason rather than by habit: `buildingFeasibility` builds a car for every
 * car of the building, so a point that is not even a dispatcher is refused by step 3 for a
 * fraction of the cost and with a message about the thing that is actually wrong with it.
 */
export function admitEditedVector(
  space: SearchSpace,
  base: DispatcherProfile,
  edit: Readonly<Record<string, ParameterValue>>,
  target: EditTarget,
): EditAdmission {
  const applied = applyEdit(space, valuesFromProfile(space, base), edit);
  if (!applied.ok) return { admissible: false, reason: applied.reason, candidate: undefined };

  const candidate = candidateOf(space, applied.values);
  let why: string | undefined;
  try {
    why = space.validate(candidate);
  } catch (error) {
    why = error instanceof Error ? error.message : String(error);
  }
  if (why !== undefined) {
    return {
      admissible: false,
      reason:
        `this vector is inside every dimension's declared range and is not a dispatcher this ` +
        `simulator can build: ${why} The refusal is core's, not this form's — the declared box is ` +
        'not the feasible set.',
      candidate: undefined,
    };
  }

  /*
   * Step 4 — issue #475. Building-dependent, and therefore not answerable by `space.validate`.
   * Wrapped for the same reason step 3 is: `buildingFeasibility` returns its refusals, but
   * `decodeInto` and `parseProfile` can still raise on a shape nothing above has had to reject,
   * and a throw crossing `dev/batchWorker.ts` is flattened to a string that loses the dial.
   */
  let onThisBuilding: string | undefined;
  try {
    onThisBuilding = buildingFeasibility(space, target.building, target.elevatorSpecs, { base })(
      candidate,
    );
  } catch (error) {
    onThisBuilding = error instanceof Error ? error.message : String(error);
  }
  if (onThisBuilding !== undefined) {
    return {
      admissible: false,
      reason:
        `this vector is a dispatcher this simulator can build and is not one it can run on this ` +
        `building: ${onThisBuilding} The refusal is core's, not this form's — a door timing and a ` +
        `load cell belong to the car, so a vector every dial admits can still be refused by the ` +
        `equipment it would have to drive, and the same vector can run at one tower and not at ` +
        `the next.`,
      candidate: undefined,
    };
  }
  return { admissible: true, reason: undefined, candidate };
}

/**
 * The edited vector as a real {@link DispatcherProfile}, or the reason it is not one.
 *
 * Never throws for a *refused* edit — a thrown error crossing a worker boundary is flattened to a
 * string by `dev/batchWorker.ts` and loses which dimension was at fault, and R3's shape (*"the
 * refusal replaces the value, it never hides it"*) applies to an edit as much as to a statistic.
 */
export function resolveEditedProfile(
  space: SearchSpace,
  base: DispatcherProfile,
  edit: EditedVector,
  target: EditTarget,
): EditedProfileOutcome {
  const admission = admitEditedVector(space, base, edit.values, target);
  if (!admission.admissible || admission.candidate === undefined) {
    return { ok: false, reason: admission.reason ?? 'the edited vector was refused.' };
  }
  try {
    return {
      ok: true,
      profile: candidateProfile(space, admission.candidate, {
        id: edit.profileId,
        name: `${edit.profileId} (edited from ${base.id})`,
        base,
      }),
      candidate: admission.candidate,
    };
  } catch (error) {
    /*
     * `parseProfile` throws `SearchSpaceError` when the merged document is not authorable — an id
     * that breaks the identifier pattern, a weight naming a term the file does not declare. It is
     * `parseDispatcherProfiles`' own message, wrapped, and it is returned rather than raised for
     * the reason above.
     */
    return {
      ok: false,
      reason: `the edited vector is not authorable as a dispatcher profile: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
