/**
 * **The weight-set selector, given a surface** — `docs/17-play-experience-audit.md` § 5 finding 6.
 *
 * ## What this panel is for
 *
 * `docs/16` § 1 establishes the fact the whole product is shaped by: `Simulation.run()` is one
 * synchronous call, so **a control does not steer a day, it re-rolls one**. The weight-set selector
 * is the single exception — the dispatcher classifies the traffic into the patterns
 * `data/dispatcher-profiles.json` authors and swaps weight vectors mid-run behind a dwell — and it
 * was reachable from no screen. So the player's genuine within-day lever is *configuring an
 * automatic policy in advance*, and this is where they configure it.
 *
 * Nothing here decides what a selector *is*. `authoring/selectorSpec.ts` made every modelling
 * decision — which field writes which document, which configurations are inert, which are refused
 * by name, what each pattern means in a building manager's words — and this file binds controls to
 * it. What lives here is the **presentation**: which rows there are, what each is called, which
 * chip is lit, and where a refusal is drawn. Every one of those is a pure exported function,
 * because this repository has no jsdom and a decision made inside a click handler cannot be tested.
 *
 * ## The claim this panel is careful not to make
 *
 * **Nothing on this surface says switching helps.** `DECISIONS.md` § D145, § D156 and § D169 are
 * three recorded refusals of the *learned* selector against `collective`, the last of them with the
 * negative control investigated rather than filed. What is exposed here is the hand-authored map,
 * which is shipped and works; every line of copy below describes what a regime *is* or what a
 * control *does*, and a sentence claiming an outcome would need a paired-t interval behind it.
 *
 * ## Where the controls reach, which is the only reason this file exists
 *
 * `dev/state.ts`'s `shiftRunConfigOf` writes **both** halves — `profileWithSelector` onto the
 * driving profile and `dispatcherProfilesWithSelector` onto the file the arms resolve from. Before
 * this lane the second had no seam at all: the loader carried `patternSwitching` (§ D153's
 * limitation, closed) and the run builder passed `resources.dispatcherProfiles` straight through,
 * so the block was loadable and unwritable. `selectorEditor.test.ts` is § D177's rule pointed at
 * this panel — move the control, require the run to change, **compared on the legs**.
 *
 * ## Two rules carried over from `dev/dispatcherEditor.ts`
 *
 * **Rows are built once and updated in place.** Replacing an `<input type="range">` mid-drag
 * releases pointer capture and the thumb stops following. The arm rows hold a `<select>` for the
 * same reason: replacing an open one closes it under the pointer.
 *
 * **A refusal goes beside the control it refuses.** `selectorIssues` returns `{field, message}` and
 * every message lands next to its own field — never in a console, never collapsed into one list at
 * the bottom, because a reader who moved a slider needs to be told about *that* slider.
 *
 * ## What is deliberately not offered
 *
 * - **The whole panel, when the loaded file declares no `patternSwitching` block.** `docs/16` S7 —
 *   a control that cannot be honoured is not offered, rather than offered and refused. The reason
 *   is stated in its place, because an absent panel with no explanation is indistinguishable from
 *   an oversight.
 * - **A dispatcher the reader saved, as an arm.** `weightSetSourceFrom` builds `weightsByProfileId`
 *   from the **file's** profile array, so an arm naming a saved dispatcher is refused at Run. The
 *   select offers what the file declares. (A binding already present that names something the file
 *   does not declare *is* shown — see {@link armOptionsOf} — because hiding it would hide the entry
 *   its own refusal is about.)
 * - **The membership ramps.** They are calibrated breakpoints, measured through the shipped engine
 *   at eight operating points; a slider over them would silently invalidate that calibration.
 *   `patternSwitchingWithSelector` carries the detector through unchanged and this panel shows the
 *   ramps as a derived sentence instead — {@link ArmRow.signature}.
 *
 * ## The one refusal that is deliberately absent
 *
 * `selection.switchMargin` is declared `contextual`-only in `DISPATCH_PARAMETERS` and
 * `selectWeightSet` applies it under `fuzzy` as well. `selectorSpec.ts` emits no refusal for it and
 * neither does this panel: a refusal telling a player their margin is inert while the run reads it
 * is worse than silence. The disagreement is between the schema and the code, and it is the code
 * that decides what a run does.
 */

import { dispatchParameter, type DispatcherProfile } from '@elevator-sim/core/browser';

import {
  POLICY_VALUES,
  SELECTOR_SCALAR_FIELDS,
  helpFor,
  parameterIdFor,
  patternCards,
  patternLine,
  policyLine,
  rangeFor,
  selectorContextFrom,
  selectorIssues,
  specIsDirty,
  specFromProfile as selectorSpecFromProfile,
  withWeightSet,
  type SelectorContext,
  type SelectorField,
  type SelectorIssue,
  type SelectorScalarField,
  type SelectorSpec,
} from '../authoring/selectorSpec.js';
import type { WeightSetPolicy } from '@elevator-sim/core/browser';

import { commitmentOf } from '../scope/commitment.js';

import { sliderHandlesOf, updateSliderRow, type SliderHandles } from './dispatcherEditor.js';
import { chip, el, fill, setHidden, setText, slider } from './dom.js';
import type { SelectorEditorElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import { profileById } from './state.js';

/* -------------------------------------------------------------------------- *
 * Is there anything to offer at all — docs/16 S7
 * -------------------------------------------------------------------------- */

/** Whether the panel is drawn, and — when it is not — the sentence that says why. */
export interface SelectorAvailability {
  readonly offered: boolean;
  /** Empty when the panel is offered. Never a console message; it is drawn in the panel's place. */
  readonly note: string;
}

/**
 * The panel is offered exactly when the loaded file gives it something to switch between.
 *
 * Not a disabled control with a tooltip: with no `patternSwitching` block there is no
 * configuration of this panel that runs, because `resolveWeightSets` refuses a policy with no
 * library **by name**. Drawing five arm selects over a library that does not exist would teach a
 * player a model the product does not have (`docs/16` S7).
 *
 * The reason is still said, in the panel's own place, because § D106's argument about `measured:
 * false` versus `0` applies to a control: an absence indistinguishable from an oversight is not a
 * declaration.
 */
export function selectorAvailability(context: SelectorContext): SelectorAvailability {
  if (context.patternSwitching !== undefined) return { offered: true, note: '' };
  return {
    offered: false,
    note:
      'This dispatcher library declares no traffic patterns, so there is nothing to switch ' +
      'between and no policy on offer. The patterns and the weight set each one runs are ' +
      'authored file-level, in data/dispatcher-profiles.json.',
  };
}

/* -------------------------------------------------------------------------- *
 * The policy chips — pure
 * -------------------------------------------------------------------------- */

/**
 * The three policies in a building manager's words — `docs/12` § 2.2, whose requirement is that
 * *every handoff label is a sentence a building manager would say*.
 *
 * Authored rather than derived because prose cannot be derived. The **keys** are not authored
 * knowledge: they are `WEIGHT_SET_POLICIES`, `core`'s own vocabulary, and `selectorEditor.test.ts`
 * asserts this table's key set against `POLICY_VALUES` in both directions — so a fourth policy in
 * `core` fails the suite rather than drawing two chips over three rules.
 *
 * Every hint says what the rule *does*. None says what it buys: § D145/§ D156/§ D169 refused the
 * learned selector three times, and a chip whose label implied an improvement would be the failure
 * mode CLAUDE.md § *Statistical discipline* names, printed on a button.
 */
export const POLICY_HINTS: Readonly<Record<WeightSetPolicy, { readonly label: string; readonly hint: string }>> =
  Object.freeze({
    off: Object.freeze({
      label: 'One setting, all shift',
      hint:
        'The dispatcher keeps the weights you gave it from the first second to the last. This is ' +
        'what every shipped dispatcher does and what every published figure here was measured under.',
    }),
    fuzzy: Object.freeze({
      label: 'Watch the traffic and change',
      hint:
        'The dispatcher counts arrivals over a trailing window, decides which pattern the building ' +
        'is in, and runs that pattern’s weights until another pattern takes over.',
    }),
    contextual: Object.freeze({
      label: 'Watch the traffic, with your tuning',
      hint:
        'The same detector, with three gains on what it reads and a margin a challenging pattern ' +
        'must beat the incumbent by. At their defaults it is arithmetically the rule above.',
    }),
  });

export interface PolicyChipRow {
  readonly policy: WeightSetPolicy;
  readonly label: string;
  readonly hint: string;
  readonly pressed: boolean;
}

/** The three chips, in `core`'s declaration order, with the current one pressed. */
export function policyChipsOf(spec: SelectorSpec): readonly PolicyChipRow[] {
  return POLICY_VALUES.map((policy): PolicyChipRow => {
    const copy = POLICY_HINTS[policy];
    return { policy, label: copy.label, hint: copy.hint, pressed: spec.policy === policy };
  });
}

/* -------------------------------------------------------------------------- *
 * The scalar rows — pure
 * -------------------------------------------------------------------------- */

/** Every scalar field except the policy, which is a chip row rather than a slider. */
export type SelectorSliderField = Exclude<SelectorScalarField, 'policy'>;

/**
 * The slider fields, **derived** from `selectorSpec.ts`'s derivation of `DISPATCH_PARAMETERS`.
 *
 * Two levels of derivation and no list: a parameter added under `selection.` in `core` reaches this
 * panel without an edit here, and a label missing for it fails {@link SCALAR_LABELS}' both-ways
 * test rather than drawing a row with no name.
 */
export const SELECTOR_SLIDER_FIELDS: readonly SelectorSliderField[] = Object.freeze(
  SELECTOR_SCALAR_FIELDS.filter((field): field is SelectorSliderField => field !== 'policy'),
);

/**
 * A short name per slider. The tooltip is `core`'s own description, verbatim — see {@link helpFor}.
 *
 * Authored because the ids do not turn into phrases anybody says: `hysteresisS` is *how long it
 * sticks with a decision*, and a mechanical de-camel-casing would print *hysteresis s*. Asserted
 * against {@link SELECTOR_SLIDER_FIELDS} in both directions.
 */
export const SCALAR_LABELS: Readonly<Record<SelectorSliderField, string>> = Object.freeze({
  hysteresisS: 'Stick with a decision for at least',
  observationWindowS: 'Judge the traffic on the last',
  lobbyArrivalRateGain: 'Weight given to lobby arrivals',
  interfloorRateGain: 'Weight given to floor-to-floor trips',
  downPeakRateGain: 'Weight given to people heading down',
  switchMargin: 'How much better a new pattern must look',
});

/** One slider row. */
export interface ScalarRow {
  readonly field: SelectorSliderField;
  readonly label: string;
  /** `core`'s own parameter description — the tooltip. */
  readonly help: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The number beside the thumb, with the declared unit when there is one. */
  readonly valueText: string;
  /**
   * Why the run will not read this value, or `''` when it will. Drawn in place of the sub-line,
   * never under it — see `dispatcherEditor.ts`'s term rows for the same argument.
   */
  readonly refusal: string;
}

/**
 * The step a control moves in, derived from the declared range rather than authored per field.
 *
 * A table of six steps would be a seventh place a bound lives. The bands are chosen so every
 * field's **default** is reachable from its minimum in whole steps — asserted in the test, because
 * a control that cannot return to the value the run opened on is a control a reader cannot undo.
 */
export function stepFor(min: number, max: number): number {
  const span = max - min;
  if (span <= 1) return 0.01;
  if (span <= 10) return 0.05;
  if (span <= 100) return 1;
  return 10;
}

/**
 * Snap a control's reading onto its step.
 *
 * A range input reports `min + n·step` in binary floating point, so a 0.05-step gain arrives as
 * `1.0500000000000003`. Left alone it would make `profileWithSelector` write a `selection` block
 * for a value the reader believes is the default, and the panel would say *changed* about a
 * configuration nobody changed.
 */
export function snapToStep(value: number, step: number): number {
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(4));
}

/** The six sliders, with the refusals the model raised against each. */
export function scalarRowsOf(
  spec: SelectorSpec,
  issues: readonly SelectorIssue[],
): readonly ScalarRow[] {
  return SELECTOR_SLIDER_FIELDS.map((field): ScalarRow => {
    const range = rangeFor(field) ?? ([0, 1] as const);
    const [min, max] = range;
    const value = spec[field];
    return {
      field,
      label: SCALAR_LABELS[field],
      help: helpFor(field),
      value,
      min,
      max,
      step: stepFor(min, max),
      valueText: `${formatValue(value)}${unitSuffixOf(field)}`,
      refusal: refusalFor(field, issues),
    };
  });
}

/** The declared unit, from `core`'s own parameter declaration. `''` for a dimensionless field. */
function unitSuffixOf(field: SelectorScalarField): string {
  const unit = dispatchParameter(parameterIdFor(field))?.unit;
  return unit === undefined ? '' : ` ${unit}`;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/* -------------------------------------------------------------------------- *
 * The arm rows — pure
 * -------------------------------------------------------------------------- */

/** One pattern, as a row: what the regime is, what the detector matches on, and what runs in it. */
export interface ArmRow {
  readonly patternId: string;
  /** The plain-language sentence, or the id when this build has no line for the pattern. */
  readonly line: string;
  /** What the detector matches on, derived from the authored ramps. `''` when there is none. */
  readonly signature: string;
  readonly weightSetId: string;
  readonly weightSetName: string;
  /** False when this row cannot take effect — selection off, unbound, or bound to nothing real. */
  readonly live: boolean;
  readonly refusal: string;
}

/**
 * The rows, in the detector's **declaration order**.
 *
 * Not alphabetical and not sorted by anything this panel decides: `selectWeightSet` breaks a
 * membership tie by *the first-declared of two equal patterns wins*, so any other order would draw
 * the priority backwards. `patternCards` already orders them that way and appends the bindings the
 * detector does not declare, which are kept visible so a reader can see the entry their refusal is
 * about.
 */
export function armRowsOf(
  spec: SelectorSpec,
  context: SelectorContext,
  issues: readonly SelectorIssue[],
): readonly ArmRow[] {
  return patternCards(spec, context).map((card): ArmRow => ({
    patternId: card.patternId,
    line: card.line ?? patternLine(card.patternId) ?? card.patternId,
    signature: card.signature ?? '',
    weightSetId: card.weightSetId,
    weightSetName: card.weightSetName,
    live: card.live,
    refusal: refusalFor(`weightSetsByPattern.${card.patternId}`, issues),
  }));
}

/** What one arm's `<select>` offers. */
export interface ArmOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The weight sets an arm may name: the **file's** profiles, plus whatever this arm already holds.
 *
 * The first half is `docs/16` S7 — a saved dispatcher is not in the file `weightSetSourceFrom`
 * builds its library from, so offering one would offer a binding the run refuses by name.
 *
 * The second half is the harder one and it is not symmetric with the first. An unbound arm, or one
 * naming a profile the file dropped, gets an option of its own **spelling out what it is** — because
 * `fillSelect` falls back to the first option when the current value is not offered, and a select
 * that silently displayed `nearest-car` over a binding that says `energy-saver` would be a panel
 * lying about the document it is editing. The row's refusal says the rest.
 */
export function armOptionsOf(context: SelectorContext, weightSetId: string): readonly ArmOption[] {
  const declared = context.profiles.map((profile) => ({ value: profile.id, label: profile.name }));
  if (weightSetId === '') {
    return [{ value: '', label: '— nothing bound —' }, ...declared];
  }
  if (!context.profiles.some((profile) => profile.id === weightSetId)) {
    return [{ value: weightSetId, label: `${weightSetId} — not in this file` }, ...declared];
  }
  return declared;
}

/* -------------------------------------------------------------------------- *
 * Refusals, and the changed marker
 * -------------------------------------------------------------------------- */

/**
 * Every refusal raised against one field, as one string.
 *
 * Joined rather than truncated to the first: `selectorIssues` returns all of them for
 * `freePlayIssues`' reason — a reader who fixes one and is then told about the next has been made
 * to guess how many there are — and dropping the rest at the drawing step would undo that.
 */
export function refusalFor(field: SelectorField, issues: readonly SelectorIssue[]): string {
  return issues
    .filter((issue) => issue.field === field)
    .map((issue) => issue.message)
    .join(' ');
}

/**
 * The line under the panel when the reader's configuration is not the file's.
 *
 * `''` when it is. There is no *save* here and that is deliberate: the selector is applied on top
 * of whichever dispatcher is driving, like the group levers beside it, so what a reader changes
 * takes effect on the next run rather than forking a profile they did not ask to fork. What they
 * need to know is that the run is no longer the shipped configuration, which is what this says.
 */
export function changedNoteOf(
  spec: SelectorSpec,
  profile: DispatcherProfile,
  context: SelectorContext,
): string {
  if (!specIsDirty(spec, profile, context)) return '';
  return 'changed — this run is not the shipped configuration';
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

/*
 * The scope note — GitHub issue #104, and this is the panel where the two senses of *mid-shift*
 * collide.
 *
 * The heading above these chips reads *"the one thing that changes mid-shift"*, and it is accurate
 * about the **mechanism**: `selection.policy` really does re-weight the dispatcher while the day
 * runs, which is what makes it the simulator's only genuine within-day adaptation. It is not
 * accurate about the **control**, and a player watching a queue build has no way to tell the two
 * apart from the heading alone — this panel writes `selectorSpec` and asks for no run, so the shift
 * on screen was simulated under whatever was set before it started. The note draws the distinction
 * rather than leaving the heading to be read as a promise about the control.
 *
 * The wording is issue #104's own, because on this block it is true. Module-private beside the
 * control, and empty when `scope/surface.ts` stops declaring it — `dispatcherEditor.ts` states both
 * reasons and `scope/commitment.ts` states why silence is the failure direction.
 */
const APPLIES_NEXT_RUN =
  commitmentOf('viewer.selectorSpec', 'writes-only') === 'next-run'
    ? 'Locked for this shift: changes apply to your next run. The policy itself does switch ' +
      'weight sets while a day runs — that is what it is for — but choosing one here is still a ' +
      'setting the next run is simulated with, and the shift on screen keeps the switching it was ' +
      'simulated under.'
    : '';

/** Nodes of one arm row, kept so a redraw writes into the row instead of replacing it. */
interface ArmHandles {
  readonly root: HTMLElement;
  readonly select: HTMLSelectElement;
  readonly line: HTMLElement;
  readonly signature: HTMLElement;
  readonly refusal: HTMLElement;
}

export function mountSelectorEditor(
  elements: SelectorEditorElements,
  context: MountContext,
): Panel {
  const doc = elements.controls.ownerDocument;
  let view: ViewAt | undefined;

  let builtScalarKeys = '';
  const scalarRows = new Map<string, SliderHandles>();
  let builtArmKeys = '';
  const armRows = new Map<string, ArmHandles>();
  /** What each arm's option list currently says, so an unchanged one is not replaced under the pointer. */
  const armOptionKeys = new Map<string, string>();

  const spec = (): SelectorSpec | undefined => view?.state.selectorSpec;

  function patch(next: Partial<SelectorSpec>): void {
    const current = spec();
    if (current === undefined) return;
    context.update({ selectorSpec: { ...current, ...next } });
  }

  /* --- static wiring, once ------------------------------------------------ */

  /* The scope note, above the chips it is about — issue #104. See {@link APPLIES_NEXT_RUN}. */
  if (APPLIES_NEXT_RUN !== '') {
    elements.policy.parentElement?.insertBefore(
      el(doc, 'p', {
        className: 'advice',
        text: APPLIES_NEXT_RUN,
        style: { 'margin-bottom': '10px' },
      }),
      elements.policy,
    );
  }

  elements.reset.addEventListener('click', () => {
    const at = view;
    if (at === undefined) return;
    const running = profileById(at.resources, at.state.savedDispatchers, at.state.dispatcherId);
    context.update({
      selectorSpec: selectorSpecFromProfile(running, contextOf(at)),
    });
  });

  function contextOf(at: ViewAt): SelectorContext {
    /*
     * The run length is passed, and it buys one refusal nothing else can raise: a dwell at least as
     * long as the shift means the detector picks once and never changes its mind, which is one
     * weight vector for the run with extra steps. A surface that did not know the shift length
     * would simply omit it, which is why `SelectorContext.durationS` is optional.
     */
    return selectorContextFrom(at.resources.dispatcherProfiles, at.state.shiftLengthS);
  }

  /* --- the sliders -------------------------------------------------------- */

  function drawScalars(rows: readonly ScalarRow[]): void {
    const keys = rows.map((row) => row.field).join('|');
    if (keys !== builtScalarKeys) {
      scalarRows.clear();
      fill(
        elements.scalars,
        ...rows.map((row) => {
          const node = slider(doc, {
            label: row.label,
            value: row.valueText,
            raw: row.value,
            min: row.min,
            max: row.max,
            step: row.step,
            help: row.help,
            // Always non-empty, so the node exists for the render that has to put a refusal in it.
            sub: `${String(row.min)}–${String(row.max)}`,
            onInput: (value) => {
              patch({ [row.field]: snapToStep(value, row.step) } as Partial<SelectorSpec>);
            },
          });
          const handles = sliderHandlesOf(node);
          if (handles !== undefined) scalarRows.set(row.field, handles);
          return node;
        }),
      );
      builtScalarKeys = keys;
    }

    for (const row of rows) {
      const handles = scalarRows.get(row.field);
      if (handles === undefined) continue;
      updateSliderRow(handles, {
        raw: row.value,
        value: row.valueText,
        sub: row.refusal === '' ? `${String(row.min)}–${String(row.max)}` : row.refusal,
        subColor: row.refusal === '' ? 'var(--faint)' : 'var(--warn)',
        labelColor: row.refusal === '' ? 'var(--text)' : 'var(--dimmer)',
      });
    }
  }

  /* --- the arm rows ------------------------------------------------------- */

  function drawArms(rows: readonly ArmRow[], selectorContext: SelectorContext): void {
    const keys = rows.map((row) => row.patternId).join('|');
    if (keys !== builtArmKeys) {
      armRows.clear();
      armOptionKeys.clear();
      fill(
        elements.patterns,
        ...rows.map((row) => {
          const select = el(doc, 'select', {
            attrs: { 'aria-label': `weight set for ${row.patternId} traffic` },
          });
          select.addEventListener('change', () => {
            const current = spec();
            if (current === undefined) return;
            context.update({
              selectorSpec: withWeightSet(current, row.patternId, select.value),
            });
          });
          const line = el(doc, 'div', { className: 'selector-arm-line' });
          const signature = el(doc, 'div', { className: 'selector-arm-signature' });
          const refusal = el(doc, 'div', { className: 'selector-refusal' });
          const root = el(doc, 'div', {
            className: 'selector-arm',
            children: [
              el(doc, 'div', {
                className: 'selector-arm-head',
                children: [
                  el(doc, 'span', { className: 'selector-arm-name', text: row.patternId }),
                ],
              }),
              line,
              signature,
              el(doc, 'label', {
                className: 'field',
                text: 'runs the weights of',
                children: [select],
              }),
              refusal,
            ],
          });
          armRows.set(row.patternId, { root, select, line, signature, refusal });
          return root;
        }),
      );
      builtArmKeys = keys;
    }

    for (const row of rows) {
      const handles = armRows.get(row.patternId);
      if (handles === undefined) continue;
      setText(handles.line, row.line);
      setText(handles.signature, row.signature);
      setText(handles.refusal, row.refusal);
      setHidden(handles.refusal, row.refusal === '');
      setHidden(handles.signature, row.signature === '');
      handles.root.setAttribute('data-live', row.live ? 'true' : 'false');
      /*
       * The options are rebuilt only when what they say changed. `fillSelect` replaces the whole
       * option list, which closes an open dropdown — harmless on a value the reader just chose, and
       * not harmless on every unrelated render, and this panel re-renders on every state change in
       * the viewer.
       */
      const options = armOptionsOf(selectorContext, row.weightSetId);
      const optionKey = options.map((option) => `${option.value} ${option.label}`).join('|');
      if (armOptionKeys.get(row.patternId) !== optionKey) {
        fill(
          handles.select,
          ...options.map((option) =>
            el(doc, 'option', { text: option.label, attrs: { value: option.value } }),
          ),
        );
        armOptionKeys.set(row.patternId, optionKey);
      }
      if (handles.select.value !== row.weightSetId) handles.select.value = row.weightSetId;
    }
  }

  /* --- render ------------------------------------------------------------- */

  function render(at: ViewAt): void {
    view = at;
    const state = at.state;
    const current = state.selectorSpec;
    const selectorContext = contextOf(at);
    const availability = selectorAvailability(selectorContext);

    setHidden(elements.controls, !availability.offered);
    setText(elements.unavailable, availability.note);
    setHidden(elements.unavailable, availability.note === '');
    if (!availability.offered) return;

    const issues = selectorIssues(current, selectorContext);

    fill(
      elements.policy,
      ...policyChipsOf(current).map((row) =>
        chip(doc, {
          label: row.label,
          selected: row.pressed,
          title: row.hint,
          onPick: () => {
            patch({ policy: row.policy });
          },
        }),
      ),
    );
    setText(elements.line, policyLine(current, selectorContext));
    const policyRefusal = refusalFor('policy', issues);
    setText(elements.policyIssue, policyRefusal);
    setHidden(elements.policyIssue, policyRefusal === '');

    drawScalars(scalarRowsOf(current, issues));
    drawArms(armRowsOf(current, selectorContext, issues), selectorContext);

    const mapRefusal = refusalFor('weightSetsByPattern', issues);
    setText(elements.mapIssue, mapRefusal);
    setHidden(elements.mapIssue, mapRefusal === '');

    const running = profileById(at.resources, state.savedDispatchers, state.dispatcherId);
    const changed = changedNoteOf(current, running, selectorContext);
    setText(elements.changed, changed);
    setHidden(elements.changed, changed === '');
  }

  return { render };
}
