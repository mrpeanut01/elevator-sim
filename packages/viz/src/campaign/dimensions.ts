/**
 * *What a player's choice moves* — the diff every stage admission is built on.
 *
 * A stage run pits the player's dispatcher against the stage's own, and the honest question about
 * that choice is *"what did it move?"*. This module answers it as a list of dimensions of the
 * declared search space. **It no longer decides admission**: § 5.2's editable list used to, through
 * an `admitProfile` that refused a profile moving a dimension the stage did not open, and
 * [§ D1129](../../../../DECISIONS.md) retired it for `campaign/stagePress.ts#admitStageMove`, which
 * prices the same diff against the stage's budget exactly as the survivor census does.
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

/*
 * **`admitProfile` was here, and it is gone** — [§ D1129](../../../../DECISIONS.md), the swarm's Q3
 * ruling. It admitted a stage move by the stage's legacy `editable` list while the survivor census
 * admitted by price, so the Scenario hub named ways through stages 1 and 5 that the Engineer Lab
 * refused. Its one non-test caller, `dev/campaignPanel.ts`, now asks
 * `campaign/stagePress.ts#admitStageMove`, the census's own rule, and a function kept with no caller
 * would be the dead seam `CLAUDE.md`'s standing requirement names. {@link movedDimensions} and
 * {@link valueText} stay: the one check is built on them.
 */
