/**
 * The generated form's model: a search space plus a point, in, one control per dimension, out.
 *
 * `docs/10-experience-layer-contract.md` § 11 **W4**. Pure — no DOM, no clock, no RNG — so the
 * genericity claim can be asserted under Node against a schema the product does not ship
 * (`controls.test.ts`). `render.ts` turns these into elements; `dev/parameterForm.ts` mounts them.
 *
 * ## Where every rule in here comes from, and what is deliberately absent
 *
 * There is **no elevator knowledge in this file**. No parameter id, no term id, no profile id, no
 * section name. Search it: the only domain words are in the docstrings. That is not tidiness — it
 * is the acceptance criterion. docs/10 § 8.1: *"Four renderers, no elevator knowledge, and a new
 * parameter appears in the UI with no UI change."*
 *
 * ## The `activeWhen` rule, and why it is enforced here rather than at the run
 *
 * `parseDispatcherProfiles` is the validator (docs/10 § 8.2 rule 1) and this module does not
 * replace it. What it adds is the *declarative* half of `policies.test.ts`'s two-part rule, which
 * is the half that can be decided from the schema alone: **a dimension whose own `activeWhen` is
 * unsatisfied by the current point is refused at the control, with the reason.** The *empirical*
 * half — a weighted term that contributes zero across the scoring scenarios — cannot be decided
 * from a schema and is not attempted; docs/10 § 8.2 rule 2 is explicit that the editor must
 * therefore **not claim** a profile is sound, only that it is authorable and has no dead gate.
 *
 * The gate rule itself is imported, not restated. `isActive`, `readerFor`, `activeParameters` and
 * `activeWhenSatisfied` come from `@elevator-sim/experiments/browser`, which is
 * `tuning/space`'s own implementation — the one `collect.ts` uses and `collect.test.ts` pins
 * against `core`'s table of cases. docs/06 says there is one rule and *"an optimizer implements it
 * once"*; a form that implemented it a second time would be a second answer to *"does this knob
 * matter"*, and the two would drift on the day a third `activeWhen` form lands.
 *
 * ## Why the state is complete and the candidate is derived
 *
 * {@link ControlValues} holds every id, including the gated-off ones; {@link candidateOf} projects
 * it back to a `Candidate`, which drops them. Two reasons:
 *
 * 1. A disabled control still has to show a value beside its reason (docs/10 § 8.1: disable, do
 *    not hide), and a `Candidate` has thrown that value away by construction.
 * 2. Flipping a gate back on must restore what the reader last set, not silently reset it to the
 *    declared default. A form that forgets is a form that quietly edits.
 *
 * Everything that leaves this module for a validator or a run goes through {@link candidateOf}, so
 * search semantics are never widened by the form's convenience.
 */

import {
  activeParameters,
  activeWhenSatisfied,
  defaultCandidate,
  isActive,
  isActiveWhenRange,
  parameterOf,
  readerFor,
} from '@elevator-sim/experiments/browser';
import type {
  ActiveWhenCondition,
  Candidate,
  ParameterValue,
  SearchParameter,
  SearchSpace,
} from '@elevator-sim/experiments/browser';

import type { Control, ControlEdit, ControlValues } from './types.js';

/* -------------------------------------------------------------------------- *
 * Values
 * -------------------------------------------------------------------------- */

/**
 * Every dimension at its declared default, gated-off ones included.
 *
 * `defaultCandidate` gives the honest origin of the space — *"the point every dimension's declared
 * default describes, with inactive dimensions dropped"*. The loop puts the dropped ones back, at
 * their declared default, because the form draws them. The two steps are kept separate on purpose:
 * the first is the shipped notion of "the origin" and is not re-derived here; the second is this
 * module's own widening and is visible as such.
 */
export function defaultValues(space: SearchSpace): ControlValues {
  const values = new Map<string, ParameterValue>(defaultCandidate(space));
  for (const parameter of space.parameters) {
    if (!values.has(parameter.id)) values.set(parameter.id, parameter.default);
  }
  return values;
}

/**
 * The form's state as a `Candidate` — that is, with every inactive dimension dropped.
 *
 * The only value that should leave this module towards a validator, a decoder or a run.
 * `activeParameters` decides what is live, so "live" means here exactly what it means to a search.
 */
export function candidateOf(space: SearchSpace, values: ControlValues): Candidate {
  const candidate = new Map<string, ParameterValue>();
  for (const parameter of activeParameters(space, values)) {
    candidate.set(parameter.id, values.get(parameter.id) ?? parameter.default);
  }
  return candidate;
}

/* -------------------------------------------------------------------------- *
 * Gate reasons — schema prose, never authored prose
 * -------------------------------------------------------------------------- */

/**
 * One `activeWhen` condition as a phrase, built from the condition and nothing else.
 *
 * Both declared forms, and no third branch: a value list reads *"one of a, b"* and a numeric
 * interval reads *"at least x"* / *"at most x"* / *"between x and y"*. `isActiveWhenRange` is the
 * shipped discriminator, so a third form landing in `core` is a type error here rather than a
 * sentence that quietly stops being true.
 */
export function describeCondition(condition: ActiveWhenCondition): string {
  if (!isActiveWhenRange(condition)) {
    return condition.length === 1
      ? `${String(condition[0])}`
      : `one of ${condition.map((value) => String(value)).join(', ')}`;
  }
  const { min, max } = condition;
  if (min !== undefined && max !== undefined) return `between ${String(min)} and ${String(max)}`;
  if (min !== undefined) return `at least ${String(min)}`;
  if (max !== undefined) return `at most ${String(max)}`;
  // A condition with neither bound is satisfied by any finite number; saying so beats saying
  // nothing, and it is reachable because both bounds are optional in the declared type.
  return 'any number';
}

/** How a gate's current value reads in a reason. `undefined` is a fact, not a blank. */
function describeValue(value: ParameterValue | undefined): string {
  return value === undefined ? 'not set' : String(value);
}

/**
 * The gates a parameter needs and does not have, at a point, in declaration order.
 *
 * Uses `activeWhenSatisfied` per condition rather than `isActive` over the whole conjunction,
 * because the form has to name *which* gate is the problem: *"this needs a destination"* is
 * actionable and *"unavailable"* is not.
 */
function unmetGatesOf(
  parameter: SearchParameter,
  read: (id: string) => ParameterValue | undefined,
): readonly { readonly gate: string; readonly needs: string; readonly has: string }[] {
  const conditions = parameter.activeWhen;
  if (conditions === undefined) return [];
  const unmet: { gate: string; needs: string; has: string }[] = [];
  for (const [gate, condition] of Object.entries(conditions)) {
    if (condition === undefined) continue;
    const value = read(gate);
    if (activeWhenSatisfied(condition, value)) continue;
    unmet.push({ gate, needs: describeCondition(condition), has: describeValue(value) });
  }
  return unmet;
}

/** The unmet gates as one sentence, in the reader's register but in the schema's vocabulary. */
function reasonFor(
  unmet: readonly { readonly gate: string; readonly needs: string; readonly has: string }[],
): string {
  return unmet
    .map(({ gate, needs, has }) => `needs ${gate} to be ${needs} — it is ${has}`)
    .join('; and ');
}

/* -------------------------------------------------------------------------- *
 * The form
 * -------------------------------------------------------------------------- */

/**
 * One control per dimension of the space, in the space's own gate order.
 *
 * **Every** dimension: `space.parameters` is the list, so `controlsFor(space, …).length` is
 * `space.ids.length` by construction and docs/10 § 11 W4's completeness criterion — *"every id in
 * `collectSearchSpace().ids` is reachable in the editor"* — is a property of the loop rather than
 * of a fixture somebody has to remember to update.
 *
 * Gate order matters for more than tidiness: a dimension appears after the dimension that gates
 * it, so a reader who turns a gate on finds the control it unlocked *below* the switch they threw
 * rather than somewhere above it.
 */
export function controlsFor(space: SearchSpace, values: ControlValues): readonly Control[] {
  const read = readerFor(space, values);
  return space.parameters.map((parameter) => {
    const enabled = isActive(parameter, read);
    const unmet = enabled ? [] : unmetGatesOf(parameter, read);
    const common = {
      id: parameter.id,
      section: parameter.section,
      label: parameter.key,
      help: parameter.description,
      enabled,
      unmetGates: unmet.map(({ gate }) => gate),
      ...(parameter.unit === undefined ? {} : { unit: parameter.unit }),
      ...(enabled ? {} : { inactiveReason: reasonFor(unmet) }),
    };
    const current = values.get(parameter.id) ?? parameter.default;

    switch (parameter.type) {
      case 'continuous':
        return {
          ...common,
          kind: 'slider' as const,
          value: typeof current === 'number' ? current : parameter.default,
          reset: parameter.default,
          min: parameter.min,
          max: parameter.max,
          scale: parameter.scale,
        };
      case 'integer':
        return {
          ...common,
          kind: 'stepper' as const,
          value: typeof current === 'number' ? current : parameter.default,
          reset: parameter.default,
          min: parameter.min,
          max: parameter.max,
        };
      case 'categorical':
        return {
          ...common,
          kind: 'select' as const,
          value: typeof current === 'string' ? current : parameter.default,
          reset: parameter.default,
          values: parameter.values,
        };
      case 'boolean':
        return {
          ...common,
          kind: 'checkbox' as const,
          value: typeof current === 'boolean' ? current : parameter.default,
          reset: parameter.default,
        };
    }
  });
}

/* -------------------------------------------------------------------------- *
 * Editing — the refusals, at the control
 * -------------------------------------------------------------------------- */

/**
 * Move one control, or say why not.
 *
 * The refusals, in the order they are checked:
 *
 * 1. **An id the space does not declare.** `parameterOf` is the lookup; a form pointed at a
 *    different space than the one that drew it is a bug and not a value to coerce.
 * 2. **A dimension whose `activeWhen` is unsatisfied.** docs/10 § 11 W4's acceptance clause, and
 *    the one that makes this more than a type check: it is refused *here*, with the gate named,
 *    rather than at the run.
 * 3. **A value of the wrong runtime kind**, or outside the declared bounds, or not among the
 *    declared values, or non-integral for an integer dimension. Every bound is the schema's.
 *
 * On acceptance the value is written and **nothing else is touched**: a gate that has just been
 * flipped re-activates its dependants because {@link controlsFor} re-evaluates them from the new
 * point, not because this function cascaded anything. One write, one source of truth.
 */
export function applyControlEdit(
  space: SearchSpace,
  values: ControlValues,
  id: string,
  value: ParameterValue,
): ControlEdit {
  const parameter = parameterOf(space, id);
  if (parameter === undefined) {
    return { accepted: false, reason: `${id} is not a dimension of this space.` };
  }

  const read = readerFor(space, values);
  if (!isActive(parameter, read)) {
    return {
      accepted: false,
      reason: `${id} is not live: it ${reasonFor(unmetGatesOf(parameter, read))}.`,
    };
  }

  const refusal = refuse(parameter, value);
  if (refusal !== undefined) return { accepted: false, reason: refusal };

  const next = new Map(values);
  next.set(id, value);
  return { accepted: true, values: next };
}

/** Why this value is not one this dimension can hold, or `undefined`. */
function refuse(parameter: SearchParameter, value: ParameterValue): string | undefined {
  switch (parameter.type) {
    case 'continuous':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${parameter.id} takes a finite number; got ${JSON.stringify(value)}.`;
      }
      if (parameter.type === 'integer' && !Number.isInteger(value)) {
        return `${parameter.id} takes a whole number; got ${String(value)}.`;
      }
      if (value < parameter.min || value > parameter.max) {
        return `${parameter.id} is declared over [${String(parameter.min)}, ${String(parameter.max)}]; got ${String(value)}.`;
      }
      return undefined;
    }
    case 'categorical': {
      if (typeof value !== 'string' || !parameter.values.includes(value)) {
        return `${parameter.id} takes one of ${parameter.values.join(', ')}; got ${JSON.stringify(value)}.`;
      }
      return undefined;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        return `${parameter.id} takes true or false; got ${JSON.stringify(value)}.`;
      }
      return undefined;
    }
  }
}

/**
 * Put one dimension back to its declared default.
 *
 * Goes through {@link applyControlEdit} rather than writing the map, so a reset is refused on an
 * inactive control for the same reason and with the same sentence as any other edit. A reset that
 * bypassed the gate would be a second way to write a value, which is one more than there should
 * be.
 */
export function resetControl(
  space: SearchSpace,
  values: ControlValues,
  id: string,
): ControlEdit {
  const parameter = parameterOf(space, id);
  if (parameter === undefined) {
    return { accepted: false, reason: `${id} is not a dimension of this space.` };
  }
  return applyControlEdit(space, values, id, parameter.default);
}
