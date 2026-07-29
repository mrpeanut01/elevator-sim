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
 * ## Three refusals, in the order they are checked, and all three are at the control
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
 *
 * **Refused at the control, not at the simulator**, which is the requirement: `admitEditedVector`
 * is what `dev/campaignPanel.ts` calls before it enables *Run*, and `resolveEditedProfile` is what
 * `batch/runBatch.ts` calls inside the worker. Both are this module, so the pre-flight cannot pass
 * something the run then rejects, and the run cannot accept something the pre-flight refused.
 */

import {
  candidateFromProfile,
  candidateProfile,
  type Candidate,
  type ParameterValue,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';
import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { applyControlEdit, candidateOf } from './controls.js';
import type { ControlValues } from './types.js';

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
 * May this edit run? — the control's own question, answered without running anything.
 *
 * Steps 1–3 of the module docstring, in order, and it stops at the first refusal because the
 * second refusal on a point that already failed the first is about a point nobody proposed.
 */
export function admitEditedVector(
  space: SearchSpace,
  base: DispatcherProfile,
  edit: Readonly<Record<string, ParameterValue>>,
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
): EditedProfileOutcome {
  const admission = admitEditedVector(space, base, edit.values);
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
