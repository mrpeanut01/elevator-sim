/**
 * *Which dimensions the player may move* — § 5.2 — made mechanical rather than decorative.
 *
 * A stage names an editable set. Without this module that set would be a caption: the player picks
 * a dispatcher profile, the batch runs, and nothing checks that the profile they picked differs
 * from the stage's own only in the ways the stage allows. With it, an off-spec profile is refused
 * **with the out-of-scope dimension named**, before a single replication runs.
 *
 * ## Why a profile diff and not a form
 *
 * CLAUDE.md invariant 7: *"Anything tunable is data, not code. Dispatch strategies are weight
 * vectors in `data/dispatcher-profiles.json`, not classes."* The player's move is therefore
 * choosing a different weight vector, and the honest question about that choice is *"what did it
 * move?"* — which is a diff between two points of the **declared search space**, not between two
 * JSON documents. `candidateFromProfile` is `experiments`' own answer to *"what does this profile
 * actually run?"*: it fills every dimension the profile does not author from its declared default
 * and drops the dimensions whose gates are unmet, *"because that is what `resolveDispatchConfig`
 * will do with that profile at run time."*
 *
 * So a diff computed here is a diff of the systems the two profiles run, not of the text somebody
 * typed — which is the difference between refusing `energy-aware` because it authored
 * `answer.maxDwellS` and refusing it because it will *use* a different dwell.
 *
 * ## A dimension that appears or disappears is a move
 *
 * Gated dimensions drop out of a candidate when their `activeWhen` is unmet, so
 * `dispatch.commitmentPoint` is present on `fairness-first` and absent on `collective`. That is a
 * real difference in what the dispatcher does and it is reported as one, with `—` standing for
 * *"this dial is not live on that profile"* rather than for a value.
 */

import { candidateFromProfile } from '@elevator-sim/experiments/browser';
import type { Candidate, ParameterValue, SearchSpace } from '@elevator-sim/experiments/browser';
import type { DispatcherProfile } from '@elevator-sim/core/browser';

/** One dimension on which two profiles run different systems. */
export interface MovedDimension {
  readonly id: string;
  /** The baseline's value, or `null` where the dimension is not live on that profile. */
  readonly from: ParameterValue | null;
  readonly to: ParameterValue | null;
}

/** How a value reads in a sentence. `—` is *not live here*, never a zero. */
export function valueText(value: ParameterValue | null): string {
  return value === null ? '—' : String(value);
}

/**
 * Every dimension on which `candidate` differs from `baseline`, in the space's own gate order.
 *
 * Pure, and it takes the space as an argument: nothing here collects one, so a test can hand it a
 * space built from a schema the product does not ship — which is W4's own liveness instrument.
 */
export function movedDimensions(
  space: SearchSpace,
  baseline: DispatcherProfile,
  candidate: DispatcherProfile,
): readonly MovedDimension[] {
  const from = candidateFromProfile(space, baseline);
  const to = candidateFromProfile(space, candidate);
  const moved: MovedDimension[] = [];
  for (const id of space.ids) {
    const left = valueAt(from, id);
    const right = valueAt(to, id);
    if (sameValue(left, right)) continue;
    moved.push({ id, from: left, to: right });
  }
  return moved;
}

function valueAt(candidate: Candidate, id: string): ParameterValue | null {
  return candidate.get(id) ?? null;
}

/**
 * Value equality, by string.
 *
 * `ParameterValue` is a number, a boolean or a string, so `String` is total and lossless for the
 * comparison this makes: two dimensions differ when they read differently. A `===` would be
 * correct too and would compare `null` with `0` as different, which is the case that matters — the
 * string form keeps that and reads the same in the sentence the panel prints.
 */
function sameValue(left: ParameterValue | null, right: ParameterValue | null): boolean {
  if (left === null || right === null) return left === right;
  return String(left) === String(right);
}

/** What a stage says about a profile the player picked. */
export interface ProfileAdmission {
  readonly admissible: boolean;
  /** Dimensions the choice moves that the stage allows. Possibly empty. */
  readonly withinScope: readonly MovedDimension[];
  /** Dimensions the choice moves that the stage does not. Non-empty exactly when refused. */
  readonly outOfScope: readonly MovedDimension[];
  /** The reader's sentence — a fact about the choice, never a judgement of it. */
  readonly sentence: string;
}

/**
 * Is this profile a legal move on this stage?
 *
 * The refusal names the dimension, because *"that profile is not allowed here"* is not actionable
 * and *"it also changes `idle.parkingStrategy`, which this stage does not open"* is. Nothing about
 * being admissible says a profile is **good**: R11's front is still a front, and this function
 * never orders two admissible choices.
 */
export function admitProfile(
  space: SearchSpace,
  baseline: DispatcherProfile,
  candidate: DispatcherProfile,
  editableIds: readonly string[],
): ProfileAdmission {
  const editable = new Set(editableIds);
  const moved = movedDimensions(space, baseline, candidate);
  const withinScope = moved.filter((dimension) => editable.has(dimension.id));
  const outOfScope = moved.filter((dimension) => !editable.has(dimension.id));

  if (outOfScope.length > 0) {
    const named = outOfScope
      .map((dimension) => `${dimension.id} (${valueText(dimension.from)} → ${valueText(dimension.to)})`)
      .join(', ');
    return {
      admissible: false,
      withinScope,
      outOfScope,
      sentence:
        `"${candidate.id}" also moves ${String(outOfScope.length)} dimension` +
        `${outOfScope.length === 1 ? '' : 's'} this stage does not open: ${named}. The batch is ` +
        'not run, because a stage that judges a change it did not offer is judging something else.',
    };
  }
  if (withinScope.length === 0) {
    return {
      admissible: true,
      withinScope,
      outOfScope,
      sentence:
        `"${candidate.id}" runs the same system as "${baseline.id}" on every declared dimension, ` +
        'so the two arms are identical by construction and no row can separate them. That is the ' +
        'control this surface is meant to survive.',
    };
  }
  const named = withinScope
    .map((dimension) => `${dimension.id} ${valueText(dimension.from)} → ${valueText(dimension.to)}`)
    .join('; ');
  return {
    admissible: true,
    withinScope,
    outOfScope,
    sentence: `"${candidate.id}" moves ${String(withinScope.length)} of this stage's dimensions: ${named}.`,
  };
}
