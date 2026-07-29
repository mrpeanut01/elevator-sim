/**
 * The four control renderers — `docs/10-experience-layer-contract.md` § 8.1 and § 11 **W4**.
 *
 * > *"One control renderer per `type` — continuous (slider + number, honouring `scale: 'log'`),
 * > integer (stepper), categorical (select over `values`), boolean (checkbox) — plus one rule that
 * > reads `activeWhen` … and disables-with-reason rather than hides. **Four renderers, no elevator
 * > knowledge**, and a new parameter appears in the UI with no UI change."*
 *
 * ## Why these emit a tree and not DOM
 *
 * `packages/viz/src/boundaries.test.ts` confines the DOM to `src/dev/`, and that rule is worth
 * more than the convenience of calling `createElement` here: it is why every renderer in this
 * package is testable under plain Node with no jsdom, and why a test can assert *the structure a
 * control has* rather than *what a browser did with it*. So a renderer returns a {@link ControlNode}
 * — tag, attributes, text, children — and `dev/parameterForm.ts` is the one file that instantiates
 * one. The same split `render/describeFrame.ts` already uses for the screen-reader text.
 *
 * It also buys the thing this lane exists to prove. A renderer that returned an `HTMLInputElement`
 * could only be checked by driving a browser; one that returns a tree can be checked against a
 * **fictional** schema in a unit test, which is wave 6's § 7 requirement and the difference between
 * *"the form works"* and *"the form works because the shipped schema happens to fit it"*.
 *
 * ## Accessibility, decided here rather than left to the mount
 *
 * - Every control's prose is a real element with an id, referenced by `aria-describedby`. A
 *   `title` attribute is not reachable by keyboard and the descriptions run to 1 167 characters.
 * - An inactive control is `disabled` **and** carries its reason as text (`UX.md` KB-15: never
 *   colour, and here never a visual state, as the only signal). `aria-disabled` goes with it so a
 *   screen reader reads the state and the reason together.
 * - The unit is a suffix element rather than being glued into the label, so a reader can be told
 *   *"metres per second"* without the label becoming unparseable.
 *
 * ## The log scale
 *
 * A range input is linear in its own coordinate, and `idle.predictorHorizonS` runs 30 s to 3 600 s
 * — a linear slider puts 99 % of its travel above a minute, which is the same complaint
 * `sample.ts` makes about a linear *draw*. So a `log` dimension's slider travels in `ln` space and
 * {@link sliderPositionOf} / {@link valueAtSliderPosition} are the two conversions, exported
 * because the mount needs both and because a conversion nothing can test is a conversion nobody
 * checked. They are exact inverses to within floating point, asserted in `render.test.ts`.
 */

import type {
  Control,
  SelectControl,
  SliderControl,
  StepperControl,
  CheckboxControl,
} from './types.js';

/**
 * A rendered element, before anything owns it.
 *
 * Attribute values are strings because that is what an attribute is; `checked`, `disabled` and
 * `selected` are present-or-absent and are emitted as the empty string when present, which is how
 * HTML spells a boolean attribute.
 */
export interface ControlNode {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  /** Text content, for a leaf. Mutually exclusive with `children` in practice, not by type. */
  readonly text?: string | undefined;
  readonly children: readonly ControlNode[];
}

/** How many positions a range input has. Enough that a 0–1 weight moves in steps of 0.001. */
export const SLIDER_STEPS = 1000;

/** The DOM id of a control's input, derived from its parameter id. */
export const inputIdOf = (id: string): string => `param-${id.replace(/\./g, '-')}`;

/** The DOM id of a control's description, which `aria-describedby` points at. */
export const helpIdOf = (id: string): string => `${inputIdOf(id)}-help`;

function node(
  tag: string,
  attrs: Readonly<Record<string, string>>,
  children: readonly ControlNode[] = [],
  text?: string,
): ControlNode {
  return { tag, attrs, children, ...(text === undefined ? {} : { text }) };
}

/* -------------------------------------------------------------------------- *
 * The log/linear conversions
 * -------------------------------------------------------------------------- */

/**
 * Where a value sits on its slider, as an integer in `[0, SLIDER_STEPS]`.
 *
 * A degenerate range — `min === max`, which a schema may legitimately declare for a knob that is
 * fixed today and searchable tomorrow — maps everything to `0` rather than dividing by zero.
 */
export function sliderPositionOf(control: SliderControl, value: number): number {
  const { min, max, scale } = control;
  if (!(max > min)) return 0;
  const project = (x: number): number => (scale === 'log' ? Math.log(x) : x);
  const span = project(max) - project(min);
  if (!(span > 0)) return 0;
  const position = ((project(value) - project(min)) / span) * SLIDER_STEPS;
  return Math.max(0, Math.min(SLIDER_STEPS, Math.round(position)));
}

/**
 * The value at a slider position. The inverse of {@link sliderPositionOf}.
 *
 * The endpoints are returned exactly rather than reconstructed, because `exp(log(min))` is not
 * `min` in floating point and a slider dragged to its end must produce a value the schema's own
 * bound check accepts. That check is `applyControlEdit`'s, and it is inclusive — so a value a
 * hair outside would be **refused at the control**, which is the correct behaviour applied to the
 * wrong cause.
 */
export function valueAtSliderPosition(control: SliderControl, position: number): number {
  const { min, max, scale } = control;
  // A degenerate range has one value, and it is returned rather than reconstructed. Found by the
  // test: `exp(log(3) - log(3) + log(3))` is 2.999999999999999 6, which `applyControlEdit` would
  // then have to decide about against a bound of exactly 3.
  if (!(max > min)) return min;
  const clamped = Math.max(0, Math.min(SLIDER_STEPS, position));
  if (clamped <= 0) return min;
  if (clamped >= SLIDER_STEPS) return max;
  const fraction = clamped / SLIDER_STEPS;
  if (scale === 'log') return Math.exp(Math.log(min) + fraction * (Math.log(max) - Math.log(min)));
  return min + fraction * (max - min);
}

/* -------------------------------------------------------------------------- *
 * The shared frame — label, help, unit, reset, reason
 * -------------------------------------------------------------------------- */

/** The `disabled` / `aria-disabled` pair, or nothing. One place, so the two cannot disagree. */
function disabledAttrs(control: Control): Readonly<Record<string, string>> {
  return control.enabled ? {} : { disabled: '', 'aria-disabled': 'true' };
}

/**
 * The wrapper every kind shares: name, unit, the input, the reset, the prose, and the reason.
 *
 * The reason element is emitted **only** when there is one, and when there is one it is emitted
 * as text in the flow — not as a tooltip, not as a colour. docs/10 R3's shape: the thing that is
 * suppressed is replaced by why, never by a blank.
 */
function frame(control: Control, input: ControlNode): ControlNode {
  const children: ControlNode[] = [
    node('span', { class: 'control-label' }, [], control.label),
  ];
  if (control.unit !== undefined) {
    children.push(node('span', { class: 'control-unit' }, [], control.unit));
  }
  children.push(input);
  children.push(
    node(
      'button',
      {
        type: 'button',
        class: 'control-reset',
        'data-reset': control.id,
        title: `reset to ${String(control.reset)}`,
        ...disabledAttrs(control),
      },
      [],
      'reset',
    ),
  );
  children.push(node('p', { class: 'control-help', id: helpIdOf(control.id) }, [], control.help));
  if (control.inactiveReason !== undefined) {
    children.push(
      node('p', { class: 'control-inactive' }, [], `not in effect: it ${control.inactiveReason}`),
    );
  }
  return node(
    'div',
    {
      class: control.enabled ? 'control' : 'control control-disabled',
      'data-parameter': control.id,
      'data-section': control.section,
      'data-kind': control.kind,
    },
    children,
  );
}

/** The attributes every input carries, whatever its kind. */
function inputAttrs(control: Control): Readonly<Record<string, string>> {
  return {
    id: inputIdOf(control.id),
    name: control.id,
    'data-parameter': control.id,
    'aria-describedby': helpIdOf(control.id),
    ...disabledAttrs(control),
  };
}

/* -------------------------------------------------------------------------- *
 * Renderer 1 of 4 — continuous: a range input beside a number input
 * -------------------------------------------------------------------------- */

export function renderSlider(control: SliderControl): ControlNode {
  const range = node('input', {
    ...inputAttrs(control),
    type: 'range',
    min: '0',
    max: String(SLIDER_STEPS),
    step: '1',
    value: String(sliderPositionOf(control, control.value)),
    'data-role': 'slider',
    'data-scale': control.scale,
    'data-min': String(control.min),
    'data-max': String(control.max),
  });
  // The number input carries the id-free copy: two inputs cannot share one `id`, and the range is
  // the one the label points at because it is the one a pointer reaches for.
  const number = node('input', {
    ...inputAttrs(control),
    id: `${inputIdOf(control.id)}-number`,
    type: 'number',
    min: String(control.min),
    max: String(control.max),
    step: 'any',
    value: String(control.value),
    'data-role': 'number',
  });
  return frame(control, node('span', { class: 'control-input' }, [range, number]));
}

/* -------------------------------------------------------------------------- *
 * Renderer 2 of 4 — integer: a stepper
 * -------------------------------------------------------------------------- */

export function renderStepper(control: StepperControl): ControlNode {
  const input = node('input', {
    ...inputAttrs(control),
    type: 'number',
    min: String(control.min),
    max: String(control.max),
    step: '1',
    value: String(control.value),
    'data-role': 'stepper',
  });
  return frame(control, node('span', { class: 'control-input' }, [input]));
}

/* -------------------------------------------------------------------------- *
 * Renderer 3 of 4 — categorical: a select over the declared values
 * -------------------------------------------------------------------------- */

export function renderSelect(control: SelectControl): ControlNode {
  const options = control.values.map((value) =>
    node(
      'option',
      { value, ...(value === control.value ? { selected: '' } : {}) },
      [],
      value,
    ),
  );
  const select = node(
    'select',
    { ...inputAttrs(control), 'data-role': 'select' },
    options,
  );
  return frame(control, node('span', { class: 'control-input' }, [select]));
}

/* -------------------------------------------------------------------------- *
 * Renderer 4 of 4 — boolean: a checkbox
 * -------------------------------------------------------------------------- */

export function renderCheckbox(control: CheckboxControl): ControlNode {
  const input = node('input', {
    ...inputAttrs(control),
    type: 'checkbox',
    'data-role': 'checkbox',
    ...(control.value ? { checked: '' } : {}),
  });
  return frame(control, node('span', { class: 'control-input' }, [input]));
}

/* -------------------------------------------------------------------------- *
 * The dispatch — four cases, exhaustive, and no fifth
 * -------------------------------------------------------------------------- */

/**
 * One control to its element tree.
 *
 * The switch is total over {@link Control}'s discriminant and has no `default`, so a fifth
 * parameter kind landing in `core` is a **compile error here** rather than a control that silently
 * does not render. That is the property `docs/06`'s four-kind contract is worth having.
 */
export function renderControl(control: Control): ControlNode {
  switch (control.kind) {
    case 'slider':
      return renderSlider(control);
    case 'stepper':
      return renderStepper(control);
    case 'select':
      return renderSelect(control);
    case 'checkbox':
      return renderCheckbox(control);
  }
}

/**
 * The whole form, grouped by section, in the space's gate order.
 *
 * Sections come out of the parameter ids and are never enumerated: a schema that declares a
 * section this package has never heard of renders as a group with that name and no code change,
 * which is the same property that makes the four renderers generic.
 */
export function renderControls(controls: readonly Control[]): ControlNode {
  const groups = new Map<string, ControlNode[]>();
  for (const control of controls) {
    const existing = groups.get(control.section);
    const rendered = renderControl(control);
    if (existing === undefined) groups.set(control.section, [rendered]);
    else existing.push(rendered);
  }
  const sections = [...groups].map(([section, children]) =>
    node('fieldset', { class: 'control-section', 'data-section': section }, [
      node('legend', {}, [], section),
      ...children,
    ]),
  );
  return node('div', { class: 'control-form' }, sections);
}
