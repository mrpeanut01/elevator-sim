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
 * - **Every input has an accessible name.** The control's name is a `<label for>` bound to the
 *   input's already-unique id, and the continuous renderer's second input — the number box beside
 *   the slider — is pointed at that same element with `aria-labelledby`. It was a `<span>`, which
 *   names nothing: every input on the tab announced its type, its state and its description while
 *   never saying *which parameter*, a defect strictly larger than the § D222 one above it, since
 *   that one left the name of the gate unspoken and this one left the name of the control unspoken.
 * - Every control's prose is a real element with an id, referenced by `aria-describedby`. A
 *   `title` attribute is not reachable by keyboard and the descriptions run to 1 167 characters.
 * - **So is the reason**, since § D222 — and it is named *first* in `aria-describedby`, because a
 *   reader who cannot act on the control should hear why before hearing the description. Before
 *   that fix `aria-describedby` pointed at the help alone, so a screen reader said *disabled* and
 *   never said *why*: the state was announced and its cause was on screen for sighted readers only.
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

/**
 * The DOM id of a control's inactive reason, which `aria-describedby` points at when there is one.
 *
 * Exists because there was no id: the reason was drawn as an anonymous `<p>` and referenced by
 * nothing, so a screen reader announced the control `disabled` and had no route to the sentence
 * saying which gate to move. See § D222.
 *
 * **Not exported, unlike its two siblings above**, and the difference is not an oversight. Nothing
 * outside this file needs to *name* the reason — the mount instantiates whatever tree it is given,
 * and `render.test.ts` asserts the wiring by reading the id off the emitted element and requiring
 * `aria-describedby` to point at it, which is the stronger claim: it fails on a **dangling**
 * reference, and an assertion written against this function's return value would not.
 */
const reasonIdOf = (id: string): string => `${inputIdOf(id)}-inactive`;

/**
 * The DOM id of a control's name element, so a second input can be pointed at the same words.
 *
 * Only the continuous renderer needs it: a slider is *two* inputs for one parameter, and `for`
 * names exactly one. The number box is labelled by reference rather than by a copy of
 * `control.label`, so the two inputs cannot come to disagree about what parameter they are.
 *
 * Private for {@link reasonIdOf}'s reason: `render.test.ts` reads the id off the emitted label and
 * requires the reference to resolve, which fails on a dangling idref where an assertion against
 * this function's return value would not.
 */
const labelIdOf = (id: string): string => `${inputIdOf(id)}-label`;

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
 * The shared frame — label, lock badge, help, unit, reset, reason
 * -------------------------------------------------------------------------- */

/** The `disabled` / `aria-disabled` pair, or nothing. One place, so the two cannot disagree. */
function disabledAttrs(control: Control): Readonly<Record<string, string>> {
  return control.enabled ? {} : { disabled: '', 'aria-disabled': 'true' };
}

/**
 * The badge on the label line: which gates this control is waiting on, in three or four words.
 *
 * Emitted **only** when the control is inactive, and it is the *summary* of the reason rather than
 * a second opinion about it — the ids come off `ControlCommon.unmetGates`, the declared field, so
 * the badge and {@link frame}'s sentence cannot drift into disagreeing about which gate is the
 * problem. It does not reword `inactiveReason` and it does not replace it.
 *
 * KB-15 by construction: the badge is **words**, not a colour and not an icon that needs a legend.
 * A reader who cannot see `.control-lock`'s tint still reads *needs dispatch.callType*, and the
 * gate id is the thing they can act on — it is the label of another control on the same tab.
 *
 * The `unmetGates.length === 0` branch is unreachable through `controlsFor`, which populates the
 * field whenever it withholds `enabled`. It is written anyway rather than asserted away: a
 * `Control` is a plain interface any caller can build, and the failure mode of the alternative is
 * a badge reading `needs ` with nothing after it.
 */
function lockBadge(control: Control): ControlNode | undefined {
  if (control.enabled) return undefined;
  const gates = control.unmetGates;
  return node(
    'span',
    { class: 'control-lock', ...(gates.length === 0 ? {} : { 'data-unmet-gates': gates.join(' ') }) },
    [],
    gates.length === 0 ? 'not in effect' : `needs ${gates.join(' and ')}`,
  );
}

/**
 * The badge on the label line for a control that **gates** others — issue #79, § D252.
 *
 * ## The direction the form could not state
 *
 * § D222 shipped the gated end: an inactive control says `needs dispatch.callType`, so a reader
 * looking at a dead knob can see which switch to move. The mirror was missing. A reader looking at
 * `selection.policy` — which governs six other controls — was told nothing, so moving it produced a
 * cascade with no warning and no account of itself. This is that account.
 *
 * ## Why a count and not a graph, and why not the ids
 *
 * The tab **already orders a gated control below its gate** (`controlsFor`'s gate order), so the
 * layout encodes which controls a switch governs; what it cannot say is *how many* to look for. A
 * dependency graph would be a second navigation model over information the page already carries,
 * and the two would then have to be kept in step — so the badge answers the question the layout
 * leaves open and adds no second model. The ids go on `data-unlocks` / `data-holds-open`, which is
 * where a test and the mount read them; a badge naming six of them would be longer than the label
 * it sits beside.
 *
 * ## Why the words move and the badge does not
 *
 * Presence is **structural** — the badge is emitted for a control that gates something and for no
 * control that gates nothing, whatever the current point, because {@link ControlCommon.unlocks} and
 * {@link ControlCommon.holdsOpen} partition the dependants exactly. A badge that read `unlocks 6`
 * and then disappeared when the reader threw the switch would vanish at the one moment they are
 * watching to see what they just did, which is the complaint the issue opens with.
 *
 * So the words say which side of the gate the dependants are on: `unlocks 6` while it is holding
 * them shut, `holds 6 open` once it is not. When it is doing both — a categorical gate with six
 * dependants under different conditions — the badge names the actionable half, and the two data
 * attributes carry the whole partition.
 *
 * KB-15, by construction and not by a legend: the content is **words and a number**. `.control-gate`
 * has a tint, and the tint is the second signal.
 */
function gateBadge(control: Control): ControlNode | undefined {
  const shut = control.unlocks;
  const open = control.holdsOpen;
  if (shut.length === 0 && open.length === 0) return undefined;
  const attrs: Record<string, string> = { class: 'control-gate' };
  if (shut.length > 0) attrs['data-unlocks'] = shut.join(' ');
  if (open.length > 0) attrs['data-holds-open'] = open.join(' ');
  const text =
    shut.length > 0
      ? `unlocks ${String(shut.length)}`
      : `holds ${String(open.length)} open`;
  return node('span', attrs, [], text);
}

/**
 * The wrapper every kind shares: name, the lock badge, the gate badge, unit, the input, the reset,
 * the reason, and the prose.
 *
 * The reason element is emitted **only** when there is one, and when there is one it is emitted as
 * **text in the flow** — not as a tooltip, not as a colour. docs/10 R3's shape: the thing that is
 * suppressed is replaced by why, never by a blank.
 *
 * ## What § D222 changed, and what it deliberately did not
 *
 * That rule was challenged by a play-tester — *the Parameters tab is a wall of fine print, move the
 * reason into a `?` tooltip* — and it was re-decided **on a measurement rather than on the quote
 * above**. On the shipped dispatcher space, 20 of 58 controls are inactive at the defaults, and
 * their reasons total 1 797 characters against 20 464 characters of `control-help`: the reason is
 * **8.1 % of the prose on the tab**. Hiding all of it would shorten the page by a twelfth and cost
 * every touch and keyboard reader the sentence. The wall is the *description*, which is a different
 * element and not what R3 governs. So the rule stands, and it now stands measured.
 *
 * What the tester was right about is **adjacency**, which no rule ever asked for and nothing
 * supplied. The reason used to be emitted last, *below* `control-help` — and on the twenty inactive
 * rows that description is a median of 318 and a maximum of 727 characters, so the explanation for a
 * dead control sat a paragraph away from it. Two changes, neither of them a hiding place:
 *
 * 1. The reason is emitted **above** the help, so it is adjacent to the control it is about.
 * 2. {@link lockBadge} puts the unmet gate ids **on the label line**, where the control's state is
 *    read, with the full sentence still below.
 *
 * The reason keeps its own element, its own text and now its own id — it did not become a `title`,
 * a `<details>` or a hover state. A `title` is unreachable by touch and by keyboard; a disclosure
 * would have collapsed on every keystroke, because `dev/parameterForm.ts` redraws the whole form on
 * each accepted edit and a fresh tree has no open state to restore.
 */
function frame(control: Control, input: ControlNode): ControlNode {
  const children: ControlNode[] = [
    // A `<label for>`, not a `<span>`. As a span this was the control's name on screen and nothing
    // at all to an accessibility tree: every input on the tab had a type, a state and a description
    // and **no accessible name**, so a screen reader could say *slider, disabled,* and then read 300
    // characters about a parameter it had never named. `for` also buys click-to-focus, which the
    // span never gave a pointer either. `.control-label`'s CSS is keyed on the class, not the tag.
    node(
      'label',
      { class: 'control-label', id: labelIdOf(control.id), for: inputIdOf(control.id) },
      [],
      control.label,
    ),
  ];
  const badge = lockBadge(control);
  if (badge !== undefined) children.push(badge);
  // After the lock badge, because a control can carry both — `auction.rounds` is gated by
  // `auction.aggregation` and gates `auction.reserveMarginalDelayS` — and what a reader needs
  // first from a dead control is why it is dead.
  const gate = gateBadge(control);
  if (gate !== undefined) children.push(gate);
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
  // The reason before the help: it is the shorter sentence and the one a reader looking at a dead
  // control is looking for. See this function's docstring for the measurement that reordered them.
  if (control.inactiveReason !== undefined) {
    children.push(
      node(
        'p',
        { class: 'control-inactive', id: reasonIdOf(control.id) },
        [],
        `not in effect: it ${control.inactiveReason}`,
      ),
    );
  }
  children.push(node('p', { class: 'control-help', id: helpIdOf(control.id) }, [], control.help));
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

/**
 * The attributes every input carries, whatever its kind.
 *
 * `aria-describedby` names the reason **and** the help when there is a reason, reason first. It
 * used to name the help alone, which meant a screen reader announced the control `disabled` — from
 * {@link disabledAttrs} — and then read a description that never mentions the gate, so the state
 * arrived without its cause. The order is the same adjacency argument {@link frame} makes visually:
 * the reason is one clause and the description runs to 727 characters on the rows that have one.
 */
function inputAttrs(control: Control): Readonly<Record<string, string>> {
  return {
    id: inputIdOf(control.id),
    name: control.id,
    'data-parameter': control.id,
    'aria-describedby':
      control.inactiveReason === undefined
        ? helpIdOf(control.id)
        : `${reasonIdOf(control.id)} ${helpIdOf(control.id)}`,
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
  /*
   * The number input carries its own id: two inputs cannot share one, and the range is the one
   * `frame`'s `<label for>` points at because it is the one a pointer reaches for.
   *
   * That sentence used to be written here and was not true — there was no label to point at
   * anything, only a `<span>`. Now that there is one, the number box would be the single input on
   * the tab still left nameless, so it is labelled **by reference** to the same element rather than
   * by a second copy of `control.label`.
   */
  const number = node('input', {
    ...inputAttrs(control),
    'aria-labelledby': labelIdOf(control.id),
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

/**
 * The rows this schema declares and no search can draw from — drawn, never dropped.
 *
 * `SearchSpace.unsearchable` is populated only when the collector was asked for
 * `nullDefault: 'exclude'`, which is what the generated form asks for when it points at one of
 * `core`'s ten schemas. Under the shipped dispatcher space it is empty and this returns
 * `undefined`, so the form gains nothing to draw and nothing to explain.
 *
 * Rendered as a `<section>` rather than a `<fieldset>` on purpose: a fieldset is a group of
 * controls, and the point of this list is that there are none. Each entry carries the collector's
 * own sentence, so the form never paraphrases a refusal it did not compute.
 */
export function renderUnsearchable(unsearchable: ReadonlyMap<string, string>): ControlNode | undefined {
  if (unsearchable.size === 0) return undefined;
  const rows = [...unsearchable]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, reason]) =>
      node('li', { class: 'control-inactive', 'data-unsearchable': id }, [], reason),
    );
  return node('section', { class: 'control-unsearchable' }, [
    node(
      'p',
      {},
      [],
      `${String(unsearchable.size)} declared ${unsearchable.size === 1 ? 'row is' : 'rows are'} not searchable, and ${unsearchable.size === 1 ? 'it is' : 'they are'} listed rather than hidden:`,
    ),
    node('ul', {}, rows),
  ]);
}
