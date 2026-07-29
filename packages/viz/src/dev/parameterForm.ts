/**
 * The generated parameter form, mounted — `docs/10-experience-layer-contract.md` § 11 **W4**'s
 * named non-test caller.
 *
 * This is the only file in W4 that touches the DOM, which is `src/boundaries.test.ts` rule 3, and
 * it is deliberately thin: it instantiates the {@link ControlNode} trees `controls/render.ts`
 * produces, routes three events back through `controls/controls.ts`, and draws whatever comes
 * back. Every decision about *what* a control is, whether it is live and whether an edit is
 * admissible is made in the pure half, where it can be asserted against a schema the product does
 * not ship.
 *
 * ## What this closes
 *
 * `DECISIONS.md` § D121 shipped `packages/experiments`' browser barrel and stated, in the file
 * itself: *"**This barrel has no non-test caller today**, and that is said plainly rather than
 * dressed up. It cannot have one: the consumer it exists for is W4."* Tracked as **C34**. This is
 * that consumer: `controls/controls.ts` imports `collectSearchSpace`, `isActive`, `readerFor`,
 * `activeParameters`, `activeWhenSatisfied`, `isActiveWhenRange`, `defaultCandidate` and
 * `parameterOf` from `@elevator-sim/experiments/browser`, and this file is what calls it from a
 * shipped path. Counted with the repository's own scanner, not asserted.
 *
 * ## The schema picker, and why it is not a list
 *
 * The form is pointed at a *source*, and the sources are **discovered**:
 * `discoverParameterSchemas()` returns every `*_PARAMETERS` export `core` declares, and each one
 * becomes an entry. No schema is named in this file. docs/10 § 9.2 wanted one generator serving
 * both U6 (`collectSearchSpace()`) and U7 (`TRAFFIC_PARAMETERS`); discovering the list gives all
 * ten and the day an eleventh is declared it appears here with no edit.
 *
 * **Two of the ten do not collect, and the form says so rather than hiding them.** Measured on
 * this tree: `SIM_PARAMETERS` declares a `log` scale over a range starting at zero, and
 * `TRAFFIC_PARAMETERS` declares `traffic.arrivalRatePctPop5min` with a `null` default — which is
 * the *"only honest default"* docs/10 § 9.3 quotes approvingly, and which a search space cannot
 * start from. Both refusals come from `collectSearchSpace` with its own message, and both are
 * drawn. Dropping them silently would be this repository's signature defect pointed at a schema:
 * a surface that looks complete because the incomplete parts are invisible.
 */

import {
  collectSearchSpace,
  discoverParameterSchemas,
} from '@elevator-sim/experiments/browser';
import type { ParameterValue, SearchSpace } from '@elevator-sim/experiments/browser';

import {
  applyControlEdit,
  candidateOf,
  controlsFor,
  defaultValues,
  resetControl,
} from '../controls/controls.js';
import { renderControls, valueAtSliderPosition } from '../controls/render.js';
import type { ControlNode } from '../controls/render.js';
import type { Control, ControlEdit, ControlValues } from '../controls/types.js';

/** The id the picker uses for the profile-authorable space, which is not one declared schema. */
const SEARCH_SPACE_SOURCE = '<dispatcher search space>';

export interface ParameterFormOptions {
  /** Where the controls are drawn. Emptied and refilled on every render. */
  readonly container: HTMLElement;
  /** Which schema the form is pointed at. Populated here from discovery. */
  readonly picker: HTMLSelectElement;
  /** One line: how many dimensions, how many live, and the authorability verdict. */
  readonly status: HTMLElement;
  /** Refusals, in the reader's register. `role="alert"` in the markup. */
  readonly refusal: HTMLElement;
}

export interface ParameterFormHandle {
  /** Redraw from the current state. Used by the tab switch. */
  refresh(): void;
  /** The live point, as a search would see it — inactive dimensions dropped. */
  candidate(): ReadonlyMap<string, ParameterValue>;
}

/** A schema that collected, or the reason it did not. Never a silently missing entry. */
type Source = { readonly ok: true; readonly space: SearchSpace } | { readonly ok: false; readonly reason: string };

function collect(name: string): Source {
  try {
    if (name === SEARCH_SPACE_SOURCE) return { ok: true, space: collectSearchSpace() };
    const rows = discoverParameterSchemas().get(name);
    if (rows === undefined) return { ok: false, reason: `${name} is no longer declared.` };
    return { ok: true, space: collectSearchSpace({ source: { [name]: rows }, include: () => true }) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** One {@link ControlNode} tree, instantiated. The only DOM construction in W4. */
function instantiate(doc: Document, node: ControlNode): HTMLElement {
  const element = doc.createElement(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, value);
  if (node.text !== undefined) element.textContent = node.text;
  for (const child of node.children) element.append(instantiate(doc, child));
  return element;
}

/**
 * Read one input back as the value its control declares.
 *
 * Keyed on the control's own `kind`, never on the element's type, so the two cannot disagree
 * about what a control holds. A slider reports a position and is converted through the
 * declaration's own scale; everything else reports its value directly.
 */
function valueFrom(control: Control, input: HTMLInputElement | HTMLSelectElement): ParameterValue {
  const role = input.dataset['role'];
  switch (control.kind) {
    case 'slider':
      return role === 'slider'
        ? valueAtSliderPosition(control, Number(input.value))
        : Number(input.value);
    case 'stepper':
      return Number(input.value);
    case 'checkbox':
      return (input as HTMLInputElement).checked;
    case 'select':
      return input.value;
  }
}

export function mountParameterForm(options: ParameterFormOptions): ParameterFormHandle {
  const { container, picker, status, refusal } = options;
  const doc = container.ownerDocument;

  for (const name of [SEARCH_SPACE_SOURCE, ...discoverParameterSchemas().keys()]) {
    picker.append(new Option(name, name));
  }

  let sourceName = picker.value;
  let source = collect(sourceName);
  let values: ControlValues = source.ok ? defaultValues(source.space) : new Map();

  function say(reason: string): void {
    refusal.textContent = reason;
  }

  function draw(): void {
    container.replaceChildren();
    if (!source.ok) {
      status.textContent = `${sourceName} does not collect into a search space.`;
      const reason = doc.createElement('p');
      reason.className = 'control-inactive';
      reason.textContent = source.reason;
      container.append(reason);
      return;
    }

    const space = source.space;
    const controls = controlsFor(space, values);
    container.append(instantiate(doc, renderControls(controls)));

    const live = controls.filter((control) => control.enabled).length;
    let verdict: string;
    try {
      const why = space.validate(candidateOf(space, values));
      verdict =
        why === undefined
          ? 'authorable as a dispatcher profile, and it has no dead gate'
          : `not authorable: ${why}`;
    } catch (error) {
      // `validate` decodes into a dispatcher profile, which is only a meaningful question for a
      // space whose ids are profile paths. For the other nine schemas the answer is legitimately
      // "no", and saying so is better than not asking.
      verdict = `not authorable: ${error instanceof Error ? error.message : String(error)}`;
    }
    status.textContent = `${String(controls.length)} dimensions, ${String(live)} live — ${verdict}. Authorability is a schema check: docs/10 § 8.2 says a profile that passes it is authorable and has no dead gate, not that it is sound.`;
  }

  function apply(edit: ControlEdit): void {
    if (edit.accepted) {
      values = edit.values;
      say('');
    } else {
      say(edit.reason);
    }
    // Redraw either way: on acceptance a gate may have cascaded, and on refusal the input has to
    // go back to what the model says it holds rather than keeping the value that was refused.
    draw();
  }

  picker.addEventListener('change', () => {
    sourceName = picker.value;
    source = collect(sourceName);
    values = source.ok ? defaultValues(source.space) : new Map();
    say('');
    draw();
  });

  container.addEventListener('change', (event) => {
    if (!source.ok) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    const id = target.dataset['parameter'];
    if (id === undefined) return;
    const control = controlsFor(source.space, values).find((candidate) => candidate.id === id);
    if (control === undefined) return;
    apply(applyControlEdit(source.space, values, id, valueFrom(control, target)));
  });

  container.addEventListener('click', (event) => {
    if (!source.ok) return;
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const id = target.dataset['reset'];
    if (id === undefined) return;
    apply(resetControl(source.space, values, id));
  });

  draw();

  return {
    refresh: draw,
    candidate: () => (source.ok ? candidateOf(source.space, values) : new Map()),
  };
}
