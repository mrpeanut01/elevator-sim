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
 * **All ten collect, and four rows inside one of them still cannot be searched.** § D134 measured
 * two schemas refusing outright and drew the refusal rather than hiding the schema; T75 fixed what
 * each refusal was about, and they turned out to be different kinds of thing:
 *
 * - `SIM_PARAMETERS` was a **defect** — `sim.drainGraceS` and `sim.queueSampleCount` declared a
 *   `log` scale over a range starting at zero, which no sampler can draw from. Zero is a named
 *   mode in both, so the scale was wrong and the bound was right. Fixed in `core`; the schema
 *   collects whole.
 * - `TRAFFIC_PARAMETERS` was **not** a defect. `traffic.arrivalRatePctPop5min` and the three
 *   `traffic.directionalSplit.*` shares declare `default: null` on purpose — the *"only honest
 *   default"* docs/10 § 9.3 quotes approvingly, because any number named there is imposed on every
 *   profile in every building. Honest and unsearchable at the same time. So the form asks for
 *   `nullDefault: 'exclude'`: the other thirteen rows draw controls, and the four are drawn as
 *   named refusals beside them, in `collectSearchSpace`'s own words.
 *
 * The register is unchanged from § D134's: what cannot be searched is **said**, never dropped.
 * A surface that looks complete because the incomplete parts are invisible is this repository's
 * signature defect pointed at a schema. What moved is the granularity — one bad row used to take
 * sixteen good ones off the screen with it.
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
import { renderControls, renderUnsearchable, valueAtSliderPosition } from '../controls/render.js';
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
export type Source =
  | { readonly ok: true; readonly space: SearchSpace }
  | { readonly ok: false; readonly reason: string };

/**
 * Point the form at one discovered schema, or at the dispatcher space.
 *
 * **Exported so the acceptance test calls the function the form calls.** `DECISIONS.md` § D159
 * names *a fixture routing the test past its subject* as one of five ways a test can fail to be
 * able to fail, and a test that rebuilt these options itself would be exactly that: it would go on
 * passing while the mount asked `collectSearchSpace` for something else entirely.
 */
export function collectFormSource(name: string): Source {
  try {
    // The dispatcher space keeps the shipped rule — `nullDefault` defaults to `'refuse'` — because
    // a *dispatcher* dimension with no origin is a defect and must not shrink the space quietly.
    if (name === SEARCH_SPACE_SOURCE) return { ok: true, space: collectSearchSpace() };
    const rows = discoverParameterSchemas().get(name);
    if (rows === undefined) return { ok: false, reason: `${name} is no longer declared.` };
    return {
      ok: true,
      space: collectSearchSpace({
        source: { [name]: rows },
        include: () => true,
        nullDefault: 'exclude',
      }),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The one line under the picker: how many dimensions, how many live, how many cannot be searched,
 * and the authorability verdict.
 *
 * **Pure, and exported, because `space.unsearchable` has two readers** — this sentence and
 * `renderUnsearchable`'s list — and [`DECISIONS.md`](../../../../DECISIONS.md) § D154 records the
 * mutation that came back green for exactly that reason: *"that value has two independent readers
 * … and freezing one leaves the other live."* A count drawn in one place and not the other is a
 * form that says thirteen dimensions and lists four refusals, or the reverse, and nothing red.
 */
export function formStatusLine(
  space: SearchSpace,
  controls: readonly Control[],
  values: ControlValues,
): string {
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
  const withheld =
    space.unsearchable.size === 0
      ? ''
      : `, ${String(space.unsearchable.size)} declared but not searchable`;
  return `${String(controls.length)} dimensions, ${String(live)} live${withheld} — ${verdict}. Authorability is a schema check: docs/10 § 8.2 says a profile that passes it is authorable and has no dead gate, not that it is sound.`;
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
  let source = collectFormSource(sourceName);
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
    const unsearchable = renderUnsearchable(space.unsearchable);
    if (unsearchable !== undefined) container.append(instantiate(doc, unsearchable));

    status.textContent = formStatusLine(space, controls, values);
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
    source = collectFormSource(sourceName);
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
