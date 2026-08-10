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
 *
 * ## What this form does to a run — the UI readiness audit's **B4**
 *
 * For most of its life: **nothing.** `mountParameterForm` returned a handle whose `candidate()` was
 * *"the only route from that form to a value"*, `dev/main.ts` discarded it, and
 * `grep '\.candidate()'` over `packages/viz/src` and `packages/cli/src` returned zero hits. The
 * audit counted the cost — **12 schemas, 130 declared rows, 114 live controls and 16 named
 * refusals** — and named the shape: a player sets `sim.patience.meanS` to 120, presses Run, and gets
 * the same day back byte for byte, under a status line that reads like a configurator. It was
 * declared honestly in `docs/10` § 11 and **in a document**, which is CLAUDE.md's *a stated refusal
 * is pinned by a run, never by another sentence* pointed at the wrong medium.
 *
 * Both halves are closed here, and they are different repairs:
 *
 * - **The screen says so.** {@link appliedNoteFor} draws one sentence per source, as the form's
 *   first child, naming the button and what pressing it will do.
 * - **One schema is genuinely wired.** {@link ParameterFormOptions.onCandidate} replaces the
 *   discarded getter, and `dev/main.ts` routes `PATIENCE_PARAMETERS` into `ViewerState.patience`.
 *   The getter is **deleted** rather than left beside it: a route nothing takes is what the audit
 *   found, and keeping it would be two answers to *how does a value leave this form*.
 *
 * The rest of the picker still binds nothing, and that is now a sentence a reader meets rather than
 * one they would have to go looking for.
 */

import {
  collectSearchSpace,
  discoverParameterSchemas,
} from '@elevator-sim/experiments/browser';
import type { ParameterValue, SearchSpace } from '@elevator-sim/experiments/browser';
import type { PatienceConfig } from '@elevator-sim/core/browser';

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
import { glossaryFor } from '../mode/glossary.js';

/** The id the picker uses for the profile-authorable space, which is not one declared schema. */
const SEARCH_SPACE_SOURCE = '<dispatcher search space>';

/**
 * The one discovered schema the Run button reads — `core`'s own export name, which is what
 * `discoverParameterSchemas()` keys by.
 *
 * Exported because **`dev/main.ts` decides what to do with it and this file decides nothing**: the
 * mount publishes a candidate with its source's name, the shell matches on this constant, and
 * `dev/state.ts#shiftRunConfigOf` puts the result on the config. One name, read in both places, so
 * the sentence {@link appliedNoteFor} prints and the branch that applies it cannot disagree — which
 * is the failure mode this whole tab was an instance of.
 */
export const APPLIED_SCHEMA = 'PATIENCE_PARAMETERS';

/**
 * What this schema does to the next run, in the reader's register — the audit's **B4**.
 *
 * ## Why a sentence per schema rather than one banner
 *
 * Because the true statement differs, and a banner that said *"nothing here is applied"* would be
 * wrong on the one screen where it matters. Eleven of the twelve discovered schemas and the
 * dispatcher space are **drawn and not applied**; `PATIENCE_PARAMETERS` is applied. Saying so per
 * source is the difference between a disclaimer and a fact.
 *
 * ## Why the refusal says what the tab *is* rather than only what it is not
 *
 * A control that is drawn as live and binds nothing is unacceptable, and the honest repair is not
 * only *"this does nothing"* — it is *what is this, then*. These controls are the search space a
 * generic optimizer would be handed (CLAUDE.md invariant 8), rendered from the schemas `core`
 * declares; reading them tells you what is tunable and what each range is. That is a real thing to
 * be, and a reader who knows it will stop expecting the Run button to move.
 */
export function appliedNoteFor(sourceName: string): string {
  if (sourceName === APPLIED_SCHEMA) {
    return (
      'APPLIED — these four reach the next shift. What you set here is written onto the run as ' +
      'sim.patience, so riders give up and leave. Abandonment improves the average wait by ' +
      'construction, because it removes the longest waits from the sample: read the abandoned ' +
      'count beside the mean, never instead of it, and above 2 % the mean is suppressed outright. ' +
      'Press Run this shift to see it. Every other schema on this picker is drawn and not applied.'
    );
  }
  return (
    `NOT APPLIED — nothing the Run button does reads ${sourceName}. Move a control here, press Run ` +
    'this shift, and the day that comes back is byte for byte the day you would have got without ' +
    'touching it. What this is instead: the search space a generic optimizer would be handed — ' +
    'every tunable core declares, with its type, its range and the gates that decide when it is ' +
    `live. ${APPLIED_SCHEMA} is the one source on this picker that does reach a run.`
  );
}

/**
 * The patience curve a candidate describes, or `null` for *nobody leaves*.
 *
 * `null` rather than a default curve, and that is `core`'s own rule rather than a choice made here:
 * `sim/patience.ts` says an absent block means every run is byte-identical to one produced before
 * patience existed, and `sim.patience.distribution` declares `'none'` as its default for exactly
 * that reason. A default patience would put an unstated behaviour into every run in the product.
 *
 * The three numbers are read out of the candidate rather than defaulted here, because
 * `candidateOf` has already applied each row's `activeWhen`: under `exponential` there is no
 * `spreadS` in the map at all, which is the schema's own statement that the field is inert there.
 * Substituting a number for it would be this file inventing a value `core` refuses to read.
 */
export function patienceFromCandidate(
  candidate: ReadonlyMap<string, ParameterValue>,
): PatienceConfig | null {
  const distribution = candidate.get('sim.patience.distribution');
  if (distribution !== 'exponential' && distribution !== 'uniform') return null;
  const meanS = numberIn(candidate, 'sim.patience.meanS');
  // `requireValidPatience` throws on a non-positive mean — *"a mean patience of zero abandons every
  // rider at the instant they arrive and reports an AWT over nobody"*. The schema's range starts at
  // 1 so no control can produce one, and this is the guard that keeps that true of a schema change
  // rather than of today's schema.
  if (meanS === undefined || meanS <= 0) return null;
  const spreadS = numberIn(candidate, 'sim.patience.spreadS');
  const minS = numberIn(candidate, 'sim.patience.minS');
  return {
    distribution,
    meanS,
    ...(spreadS === undefined ? {} : { spreadS }),
    ...(minS === undefined ? {} : { minS }),
  };
}

function numberIn(
  candidate: ReadonlyMap<string, ParameterValue>,
  id: string,
): number | undefined {
  const value = candidate.get(id);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export interface ParameterFormOptions {
  /** Where the controls are drawn. Emptied and refilled on every render. */
  readonly container: HTMLElement;
  /** Which schema the form is pointed at. Populated here from discovery. */
  readonly picker: HTMLSelectElement;
  /** One line: how many dimensions, how many live, and the authorability verdict. */
  readonly status: HTMLElement;
  /** Refusals, in the reader's register. `role="alert"` in the markup. */
  readonly refusal: HTMLElement;
  /**
   * The live point, whenever it moves — the seam the UI readiness audit's **B4** found missing.
   *
   * ## What was wrong
   *
   * This mount used to hand back a `ParameterFormHandle` whose `candidate()` was *"the only route
   * from that form to a value"*, `dev/main.ts` **discarded the handle**, and `grep '\.candidate()'`
   * over `packages/viz/src` and `packages/cli/src` returned **zero hits**. So 114 live controls
   * over 12 schemas drew, accepted edits, cascaded their gates, refused bad values and reported
   * *"41 dimensions, 41 live — authorable as a dispatcher profile"* — and a player could set
   * `sim.patience.meanS` to 120, press Run, and get the same day back byte for byte.
   *
   * A callback rather than a getter, because a getter is what was there: the difference between a
   * value that *can* be read and a value that *is* read is the whole of the standing requirement,
   * and the second one is harder to leave unwired by accident.
   *
   * ## It fires on every accepted edit and on every source change
   *
   * On the source change too, so what the receiver holds is always the point the picker is
   * currently showing rather than the last one it was told about — the two would drift the moment
   * a player moved the picker, and a stale value the screen has stopped displaying is exactly the
   * disagreement this seam existed to avoid.
   *
   * Called with the source's name, because **the receiver decides what is applied**. This file
   * knows what the controls hold; it does not know what a run reads.
   */
  readonly onCandidate?: ((sourceName: string, candidate: ReadonlyMap<string, ParameterValue>) => void) | undefined;
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

/**
 * One {@link ControlNode} tree, instantiated. The only DOM construction in W4.
 *
 * **Exported** since W6: `dev/campaignPanel.ts` mounts the same controls, restricted to the
 * dimensions a stage declares editable, and a second `createElement` walk there would be a second
 * answer to *"what does a control look like in the DOM"* — the shape `campaign/stageRun.ts` was
 * extracted to avoid one layer down.
 */
export function instantiateControlNode(doc: Document, node: ControlNode): HTMLElement {
  const element = doc.createElement(node.tag);
  for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, value);
  if (node.text !== undefined) element.textContent = node.text;
  for (const child of node.children) element.append(instantiateControlNode(doc, child));
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

export function mountParameterForm(options: ParameterFormOptions): void {
  const { container, picker, status, refusal, onCandidate } = options;
  const doc = container.ownerDocument;

  for (const name of [SEARCH_SPACE_SOURCE, ...discoverParameterSchemas().keys()]) {
    picker.append(new Option(name, name));
  }

  let sourceName = picker.value;
  let source = collectFormSource(sourceName);
  /**
   * What each source was left holding, so the picker is a **view** and not a reset.
   *
   * It was one `values` map re-seeded from `defaultValues` on every picker change, which meant
   * looking at a second schema silently discarded whatever had been set on the first. That was
   * harmless while nothing read the form; it stops being harmless the moment a source is applied to
   * the run, because *the screen and the run must not disagree* — and a value the run still holds
   * while the control that set it has snapped back to its default is precisely that disagreement.
   */
  const valuesBySource = new Map<string, ControlValues>();

  function valuesFor(name: string, from: Source): ControlValues {
    const held = valuesBySource.get(name);
    if (held !== undefined) return held;
    const seeded: ControlValues = from.ok ? defaultValues(from.space) : new Map();
    valuesBySource.set(name, seeded);
    return seeded;
  }

  let values: ControlValues = valuesFor(sourceName, source);

  function say(reason: string): void {
    refusal.textContent = reason;
  }

  /** Tell the receiver what the picker is showing now. See {@link ParameterFormOptions.onCandidate}. */
  function publish(): void {
    if (onCandidate === undefined) return;
    onCandidate(sourceName, source.ok ? candidateOf(source.space, values) : new Map());
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
    /*
     * **What this schema does to the next run, said above the controls it draws** — the audit's B4.
     *
     * First child of the form rather than a footnote, because it is the thing a reader has to know
     * before they touch anything, and because the tab's own status line reads like a configurator:
     * *"41 dimensions, 41 live — authorable as a dispatcher profile"* is a true sentence about a
     * search space and was being read as a claim about the Run button. `docs/10` § 11 declared the
     * gap honestly and declared it **in a document**, which is CLAUDE.md's *a stated refusal is
     * pinned by a run, never by another sentence* pointed at the wrong medium.
     */
    const applied = doc.createElement('p');
    applied.className = 'control-inactive';
    applied.textContent = appliedNoteFor(sourceName);
    container.append(applied);
    container.append(instantiateControlNode(doc, renderControls(controls)));
    const unsearchable = renderUnsearchable(space.unsearchable);
    if (unsearchable !== undefined) container.append(instantiateControlNode(doc, unsearchable));

    const line = formStatusLine(space, controls, values);
    status.textContent = line;
    /*
     * **The two terms nothing else defines** — GitHub issue #22, and this is the wiring that
     * matters most of the three.
     *
     * `formStatusLine` above and `controls/editedProfile.ts` are the *only* producers in the tree
     * of **dead gate** and **authorable**. `mode/glossary.ts` defines both and holds them to its
     * *attached to something real* clause, so neither can rot silently — but until this call they
     * were definitions no player could reach, which is the shape this repository counts.
     *
     * `glossaryFor` is called on the line this function just built rather than on a field, because
     * unlike the batch and campaign reports there is no report object here to carry one. It is pure
     * and it reads nothing but the string it is handed, so what comes back is exactly what this
     * sentence says — which is the same *derived, never listed* property the other two surfaces get
     * from their `glossary` fields, reached one step more directly.
     *
     * The status line itself is **untouched**: the definitions go in a block beneath it, and
     * `parameterForm.test.ts` asserts the sentence is byte-identical to what `formStatusLine`
     * returned. The plain language leads; it never replaces.
     */
    const terms = glossaryFor([line]);
    if (terms.length === 0) return;
    const list = doc.createElement('div');
    list.className = 'control-glossary';
    for (const entry of terms) {
      const item = doc.createElement('p');
      item.className = 'control-inactive';
      item.textContent = `${entry.term} — ${entry.plain}`;
      list.append(item);
    }
    container.append(list);
  }

  function apply(edit: ControlEdit): void {
    if (edit.accepted) {
      values = edit.values;
      valuesBySource.set(sourceName, values);
      say('');
      // Only on acceptance. A refused edit changed nothing, and telling the receiver about it would
      // make the run and the screen agree on a value neither of them is showing.
      publish();
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
    values = valuesFor(sourceName, source);
    say('');
    publish();
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
}
