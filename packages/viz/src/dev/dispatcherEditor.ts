/**
 * The dispatcher editor, mounted — `docs/12-design-handoff.md` § 1.3 **M8**.
 *
 * ## What is here and what is not
 *
 * Nothing in this file decides what a dispatcher *is*. `authoring/dispatcherSpec.ts` already made
 * every modelling decision — which flag writes which field, why *snappy* is the code minimum rather
 * than something faster, why a weight of zero is never written — and this file binds controls to
 * it. What lives here is the part that needs a document, plus the handful of **presentation**
 * decisions that do not: which twelve rows there are, what each is called, which dwell chip is lit.
 * Every one of those is a pure exported function, because this repository has no jsdom and a
 * decision made inside a click handler cannot be tested.
 *
 * ## Two rules that are requirements rather than polish
 *
 * **The inert term is drawn, not dropped.** `inertTerms(spec)` names every weighted term the engine
 * will not read — today `rideTime` under a non-destination call type, which is `DECISIONS.md`
 * § D112's shipped defect stated as a rule. The refusal goes *beside the control*, in the pattern
 * `docs/10` § 11 W4 established for the generated parameter form. Silently turning the flag on
 * would change the passenger model under a reader who moved a slider; silently dropping the weight
 * would hide that they had asked for something.
 *
 * **The dwell chips have a fourth state and it is the default.** `levers.dwell === undefined` means
 * *the dispatcher's own*, and no chip is pressed unless the running profile happens to match one.
 * A *normal* chip lit by nobody rewrote `energy-aware`'s authored adaptive dwell the moment the
 * page loaded, and `authoring/authoring.test.ts`'s run-identity test is the only thing that caught
 * it — the page looked right and the dispatcher was not the one named in the rail.
 *
 * ## Why the term rows are built once and updated in place
 *
 * A `<input type="range">` drag is held by the element the pointer went down on. Replacing that
 * element mid-drag — which is what a mount that rebuilds its rows on every state change does, and
 * every one of these editors changes state on `input` — releases the capture and the thumb stops
 * following the pointer after the first pixel. So the rows are rebuilt only when the *set* of rows
 * changes, and every render after that writes values into the nodes that are already there. The
 * same argument applies to the elevation's drag bars in `buildingEditor.ts`, for the same reason.
 */

import type { CostTerm, DispatcherProfile } from '@elevator-sim/core/browser';

import {
  DWELL_CHOICES,
  DWELL_HINTS,
  adviceFor,
  costFunctionLine,
  dwellChoiceOf,
  inertTerms,
  profileFromSpec,
  specFromProfile,
  specIsDirty,
  type DispatcherSpec,
  type DwellChoice,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';

import { chip, el, fill, pick, setHidden, setStyle, setText, slider, toggle } from './dom.js';
import type { DispatcherEditorElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import { allDispatchers, profileById } from './state.js';

/* -------------------------------------------------------------------------- *
 * Shared plumbing the other three editors import
 * -------------------------------------------------------------------------- */

/**
 * The nodes inside one row {@link slider} built.
 *
 * Kept so a redraw can write into a row instead of replacing it — see the module docstring for
 * why replacing it is a bug rather than a cost. It reads them back off the element by the class
 * names `dom.ts` gives every slider, which is the shared vocabulary rather than a private
 * arrangement: a change to those class names is a change to the design system, and it breaks this
 * loudly (the row rebuilds and nothing updates) rather than quietly.
 *
 * **This wants to live in `dom.ts`.** It is imported by all four editors and it is DOM glue with no
 * decision in it, which is exactly that module's remit; it is here because this lane owns four
 * files and `dom.ts` is not one of them.
 */
export interface SliderHandles {
  readonly root: HTMLElement;
  readonly input: HTMLInputElement;
  readonly value: HTMLElement;
  readonly label: HTMLElement;
  readonly sub: HTMLElement;
}

/**
 * Read a built slider row's nodes back, or `undefined` when it is not one.
 *
 * Total rather than throwing: a caller that cannot find the nodes falls back to rebuilding, which
 * is a worse drag and a correct picture, and a thrown error here would take the whole panel down
 * over a cosmetic regression.
 */
export function sliderHandlesOf(root: HTMLElement): SliderHandles | undefined {
  const input = root.querySelector('input');
  const value = root.querySelector('.slider-value');
  const label = root.querySelector('.helpful');
  const sub = root.querySelector('.slider-sub');
  if (
    !(input instanceof HTMLInputElement) ||
    !(value instanceof HTMLElement) ||
    !(label instanceof HTMLElement) ||
    !(sub instanceof HTMLElement)
  ) {
    return undefined;
  }
  return { root, input, value, label, sub };
}

/** Write a row's changing parts, touching nothing that did not move. */
export function updateSliderRow(
  handles: SliderHandles,
  next: {
    readonly raw: number;
    readonly value: string;
    readonly sub: string;
    readonly subColor: string;
    readonly labelColor: string;
  },
): void {
  const raw = String(next.raw);
  // Never unconditionally: assigning the same string is a no-op, but assigning a *different* one
  // mid-drag would fight the pointer, and the state is the authority only when it disagrees.
  if (handles.input.value !== raw) handles.input.value = raw;
  setText(handles.value, next.value);
  setText(handles.sub, next.sub);
  setStyle(handles.sub, 'color', next.subColor);
  setStyle(handles.label, 'color', next.labelColor);
}

/**
 * The first free `prefix-N`.
 *
 * Counting the saved list would do until a reader deletes the second of three and saves again,
 * at which point `yours-3` collides with the one already there and the rail shows two cards that
 * are the same dispatcher. Ids are identity here — `state.dispatcherId` is one — so the collision
 * would not merely look wrong.
 */
export function nextSavedId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n += 1) {
    const id = `${prefix}-${String(n)}`;
    if (!used.has(id)) return id;
  }
}

/* -------------------------------------------------------------------------- *
 * The twelve terms — pure
 * -------------------------------------------------------------------------- */

/**
 * A term id as a phrase — `waitTime` → `wait time`.
 *
 * Derived rather than tabled, and that is the point: `data/dispatcher-profiles.json` declares the
 * terms and a hand-written label table here would be a second declaration of the same list, going
 * stale the first time a thirteenth term is authored. The file carries `measures` and `serves`,
 * which are the sentences a reader needs; the id is the name.
 */
export function humanTermName(termId: string): string {
  return termId.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * The compact name the cost line uses — `waitTime` → `wait`.
 *
 * The first camel word, unless another term in the same library shares it, in which case the whole
 * phrase. A short name that named two terms would make `cost = 1.00·wait + 0.30·wait` — a line
 * whose whole job is to say which terms are weighted.
 */
export function shortTermNameOf(termId: string, allIds: readonly string[]): string {
  const head = (id: string): string => (id.split(/(?=[A-Z])/)[0] ?? id).toLowerCase();
  const mine = head(termId);
  const shared = allIds.filter((id) => id !== termId && head(id) === mine).length > 0;
  return shared ? humanTermName(termId) : mine;
}

/** One row of the twelve. */
export interface TermRow {
  readonly termId: string;
  /** The row's name — {@link humanTermName}. */
  readonly label: string;
  /** The tooltip: the term's own `measures` sentence from the profile library. */
  readonly help: string;
  /** The sub-line: `serves AWT`, from the term's own `serves`. */
  readonly serves: string;
  /** The slider position, `0..100`. `weight = position / 100`. */
  readonly value: number;
  readonly weighted: boolean;
  /**
   * Why the engine will not read this weight, or `undefined` when it will.
   *
   * Present exactly when {@link inertTerms} names the term. Drawn beside the control — § D112.
   */
  readonly inertWhy: string | undefined;
}

/**
 * The twelve rows, in the order `data/dispatcher-profiles.json` declares them.
 *
 * `inert` is passed in rather than computed here so the caller cannot draw a different list from
 * the one the model produced: two answers to *which terms are inert* is how the refusal comes to
 * be shown beside the wrong slider.
 */
export function termRowsOf(
  terms: readonly CostTerm[],
  spec: DispatcherSpec,
  inert: readonly { readonly termId: string; readonly why: string }[],
): readonly TermRow[] {
  const why = new Map(inert.map((entry) => [entry.termId, entry.why]));
  return terms.map((term): TermRow => {
    const value = spec.weights[term.id] ?? 0;
    return {
      termId: term.id,
      label: humanTermName(term.id),
      help: term.measures,
      serves: `serves ${term.serves}`,
      value,
      weighted: value > 0,
      inertWhy: why.get(term.id),
    };
  });
}

/* -------------------------------------------------------------------------- *
 * The three flags and the two levers — pure
 * -------------------------------------------------------------------------- */

export type FlagKey = keyof DispatcherSpec['flags'];

export interface FlagRow {
  readonly key: FlagKey;
  readonly label: string;
  readonly hint: string;
  /** The tooltip: the profile field this writes, so the claim is checkable. */
  readonly help: string;
  readonly on: boolean;
}

/**
 * The handoff's three flags, with its own copy, plus the field each one writes.
 *
 * The handoff's hints explain the phenomenon; the `help` names the field. A reader of this
 * implementation needs both, and the phenomenon without the field is what lets a control drift
 * into decoration.
 */
export function flagRowsOf(spec: DispatcherSpec): readonly FlagRow[] {
  return [
    {
      key: 'pool',
      label: 'Pool riders by destination',
      hint: 'Asks where they are going and groups them. Fewer stops per trip, a longer wait in the lobby.',
      help:
        'dispatch.callType: mobile-credential — destination *disclosure*, the Level-0 arm. The ' +
        'landing panel that names a car is a passenger-model change (DECISIONS.md § D27) and stays ' +
        'behind the shipped destination-panel profile, where the choice is named.',
      on: spec.flags.pool,
    },
    {
      key: 'zone',
      label: 'Give each car a zone',
      hint: 'Splits the tower between cars. Wins the peak, wastes the lull.',
      help: 'idle.parkingStrategy: zone-center, with dispatch.assignmentMode: split-demand.',
      on: spec.flags.zone,
    },
    {
      key: 'bypass',
      label: 'Read the load sensor',
      hint: 'A car over 80% full stops being offered new calls. Turn it off and watch it sail past people.',
      help:
        'answer.bypassLoadThreshold — 0.8, which is elevator-specs.json’s own ' +
        'loadSensor.hallCallBypassThreshold. Off is 1, not infinity: resolveLoadSensor refuses a ' +
        'threshold outside (0, 1], so “off” means “only when completely full”.',
      on: spec.flags.bypass,
    },
  ];
}

export type LeverKey = 'parking' | 'express';

export interface LeverRow {
  readonly key: LeverKey;
  readonly label: string;
  readonly hint: string;
  readonly help: string;
  readonly on: boolean;
}

/**
 * The two group levers — the handoff's *apply to whoever is driving* block.
 *
 * Separate from the flags because they are applied **on top of** whichever dispatcher is selected,
 * including a shipped one nobody has edited. See `authoring/dispatcherSpec.ts`'s `GroupLevers`:
 * folding them into the spec would mean pulling a lever silently forked the profile.
 */
export function leverRowsOf(levers: GroupLevers): readonly LeverRow[] {
  return [
    {
      key: 'parking',
      label: 'Park the cars in the lobby before the rush',
      hint: 'Kills the first wait of the morning. Costs a little motor time all day.',
      help:
        'idle.parkingStrategy: lobby. An idle car returns to the entrance floor, so the next lobby ' +
        'call is answered with the doors already in the right place. Outranked by express zoning, ' +
        'because a car cannot park both in its zone’s centre and in the lobby.',
      on: levers.parking,
    },
    {
      key: 'express',
      label: 'Express zoning — give each car a slice of the tower',
      hint: 'Superb at 08:30, wasteful at 15:00. Watch the lull, not the peak.',
      help:
        'idle.parkingStrategy: zone-center, plus dispatch.assignmentMode: split-demand. The tower ' +
        'is split into contiguous bands and each car owns one, so cars stop competing for the same ' +
        'calls.',
      on: levers.express,
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * Door dwell — the fourth state
 * -------------------------------------------------------------------------- */

export interface DwellChipRow {
  readonly choice: DwellChoice;
  readonly label: string;
  readonly help: string;
  readonly pressed: boolean;
  /**
   * `true` when the chip is lit because the **running profile** authored that dwell rather than
   * because the reader chose it. Nothing has been overridden; the chip is reporting, not asserting.
   */
  readonly inherited: boolean;
}

/**
 * The three chips, and which — if any — is pressed.
 *
 * `levers.dwell === undefined` is *inherit*, and it is the value the page opens on. In that state a
 * chip lights only when {@link dwellChoiceOf} says the running profile's own dwell happens to be
 * one of the three; a profile that authored something the three cannot express — `energy-aware`'s
 * adaptive 0.2 gain and 10 s ceiling — lights **none**, which is the honest picture.
 */
export function dwellChipsOf(
  levers: GroupLevers,
  profile: DispatcherProfile,
): readonly DwellChipRow[] {
  const inherited = levers.dwell === undefined ? dwellChoiceOf(profile) : undefined;
  return DWELL_CHOICES.map((choice): DwellChipRow => {
    const chosen = levers.dwell === choice;
    return {
      choice,
      label: choice,
      help: DWELL_HINTS[choice],
      pressed: chosen || inherited === choice,
      inherited: !chosen && inherited === choice,
    };
  });
}

/** The sentence under the chips. Says which of the four states the doors are actually in. */
export function dwellHintOf(levers: GroupLevers, profile: DispatcherProfile): string {
  if (levers.dwell !== undefined) return DWELL_HINTS[levers.dwell];
  const own = dwellChoiceOf(profile);
  if (own !== undefined) {
    return (
      `No override — ${profile.name} authors its own dwell, and it happens to be the ${own} ` +
      'setting. Press a chip to hold the doors to your figure instead of the dispatcher’s.'
    );
  }
  return (
    `No override — the doors keep whatever ${profile.name} authored, which is not one of these ` +
    'three. Pressing a chip replaces it; leaving them alone is what keeps the run the one named in ' +
    'the rail.'
  );
}

/* -------------------------------------------------------------------------- *
 * Card copy
 * -------------------------------------------------------------------------- */

/** The one-line weight vector under a dispatcher's name in a list. */
export function vectorLineOf(profile: DispatcherProfile, allIds: readonly string[]): string {
  return costFunctionLine(specFromProfile(profile, profile.name), (id) =>
    shortTermNameOf(id, allIds),
  );
}

/** The flag summary a card's tooltip carries. */
export function flagLineOf(profile: DispatcherProfile): string {
  const spec = specFromProfile(profile, profile.name);
  const on: string[] = [];
  if (spec.flags.pool) on.push('pooled by destination');
  if (spec.flags.zone) on.push('zoned');
  on.push(spec.flags.bypass ? 'reads the load sensor' : 'blind to the load sensor');
  return on.join(' · ');
}

/* -------------------------------------------------------------------------- *
 * "Now use this" — the verb the editor did not have (issue #65)
 * -------------------------------------------------------------------------- */

/**
 * What the *run this* control should say and do, given what is on screen.
 *
 * Issue #65: *"Having tuned thirteen weight sliders there is no way to run what you just built
 * without hunting back to the right rail and finding your saved copy."* The panel's only verbs were
 * **Close** and **Save as a new dispatcher**, and the second only happens to run the result — it is
 * a filing action that also selects, which is not a thing a reader can be expected to infer.
 *
 * Three states, and the label says which one you are in rather than making the reader guess:
 *
 * - **the spec differs from the profile it was opened from** — nothing can run an unsaved weight
 *   vector, because the run resolves a dispatcher by id. So the honest label is *save it and run
 *   it*, naming both halves of what the press will do.
 * - **it matches, and is already what is driving** — the button is off and says so. An enabled
 *   control whose press changes nothing is the defect this repository counts.
 * - **it matches, and something else is driving** — a plain selection.
 *
 * ## Why this returns a state rather than a label
 *
 * The copy lives beside the button, in the mount, as a module-private table. `honesty/derive`
 * classifies every **exported** producer of player-facing prose and requires an adapter in
 * `honesty/surfaces.ts` for each; the four mounts are excluded there as the DOM half of a split
 * whose pure half is driven. Returning a label from here would be a new exported prose surface
 * needing a `surfaces.ts` entry, so the decision is exported prose-free and testable, and the
 * wording sits where the rest of this panel's wording sits. That is the same move
 * `TRANSPORT_LANDING_TITLE` makes in `buildingEditor.ts`, for the same reason.
 *
 * It is a real limitation and worth saying plainly: copy in a mount reaches the static sweep and
 * not the driven one. Promoting these three labels into the `EDITORS` adapter would be strictly
 * better — see this lane's report.
 */
export type RunThisState = 'saveFirst' | 'alreadyDriving' | 'select';

export function runThisDispatcherStateOf(
  spec: DispatcherSpec,
  source: DispatcherProfile | undefined,
  runningId: string,
  editingId: string,
): RunThisState {
  // No source means the profile being edited no longer exists — the reader deleted it. There is
  // nothing to point the run at, so the honest offer is to file it again rather than to select.
  if (source === undefined || specIsDirty(spec, source)) return 'saveFirst';
  return editingId === runningId ? 'alreadyDriving' : 'select';
}

/*
 * The *now use this* copy. Module-private for the reason stated above, and for the one
 * `TRANSPORT_LANDING_TITLE` states in `buildingEditor.ts`: an exported string literal here becomes
 * an unclassified prose surface in `honesty/derive`.
 */
const RUN_THIS_COPY: Readonly<
  Record<RunThisState, { readonly label: string; readonly title: string }>
> = Object.freeze({
  saveFirst: Object.freeze({
    label: 'Save it and run it',
    title:
      'Files these weights as a dispatcher of your own and makes it the one driving, then runs the ' +
      'shift again. A weight vector that has not been saved cannot drive: the run resolves a ' +
      'dispatcher by id.',
  }),
  alreadyDriving: Object.freeze({
    label: 'Already driving',
    title:
      'This is the dispatcher the shift is already running. Move a weight to make it a new one.',
  }),
  select: Object.freeze({
    label: 'Run this dispatcher',
    title:
      'Makes the dispatcher shown here the one the shift runs, and runs it again on the same ' +
      'building, seed and traffic.',
  }),
});

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

export function mountDispatcherEditor(
  elements: DispatcherEditorElements,
  context: MountContext,
): Panel {
  const doc = elements.terms.ownerDocument;
  let view: ViewAt | undefined;

  /** The row set currently in the DOM. Rebuilt only when the *keys* change. See the docstring. */
  let builtTermKeys = '';
  const termRows = new Map<string, SliderHandles>();

  const spec = (): DispatcherSpec | undefined => view?.state.dispatcherSpec;

  function patchSpec(patch: Partial<DispatcherSpec>): void {
    const current = spec();
    if (current === undefined) return;
    context.update({ dispatcherSpec: { ...current, ...patch } });
  }

  function setWeight(termId: string, position: number): void {
    const current = spec();
    if (current === undefined) return;
    patchSpec({ weights: { ...current.weights, [termId]: position } });
  }

  /* --- static wiring, once ------------------------------------------------ */

  elements.name.addEventListener('input', () => {
    patchSpec({ name: elements.name.value });
  });

  elements.copyCurrent.addEventListener('click', () => {
    const at = view;
    if (at === undefined) return;
    const running = profileById(at.resources, at.state.savedDispatchers, at.state.dispatcherId);
    context.update({
      dispatcherSpec: specFromProfile(running, running.name),
      editingDispatcherId: running.id,
    });
  });

  elements.close.addEventListener('click', () => {
    context.openTab('run');
  });

  elements.save.addEventListener('click', () => {
    save();
  });

  /*
   * *Now use this* — issue #65. Built here rather than in `index.html` for the reason the building
   * editor's confirmation is: it goes in `.editor-actions`, beside the two verbs that were the whole
   * of the panel's vocabulary, and adding a node is a smaller change than reserving one.
   */
  const runThis = el(doc, 'button', {
    className: 'primary',
    attrs: { type: 'button' },
  });
  elements.save.parentElement?.append(runThis);

  runThis.addEventListener('click', () => {
    const at = view;
    const current = spec();
    if (at === undefined || current === undefined) return;
    const source = allDispatchers(at.resources, at.state.savedDispatchers).find(
      (profile) => profile.id === at.state.editingDispatcherId,
    );
    const action = runThisDispatcherStateOf(
      current,
      source,
      at.state.dispatcherId,
      at.state.editingDispatcherId,
    );
    if (action === 'alreadyDriving') return;
    if (action === 'saveFirst') {
      // `save` already selects what it files — see its `dispatcherId: id`. It also opens the run
      // tab, which is where a reader who pressed *run it* is going anyway.
      save();
    } else {
      context.update({ dispatcherId: at.state.editingDispatcherId });
      context.openTab('run');
    }
    context.runShift();
  });

  function save(): void {
    const at = view;
    const current = spec();
    if (at === undefined || current === undefined) return;
    try {
      const saved = at.state.savedDispatchers;
      const id = nextSavedId('yours', [
        ...allDispatchers(at.resources, saved).map((profile) => profile.id),
      ]);
      const base = allDispatchers(at.resources, saved).find(
        (profile) => profile.id === at.state.editingDispatcherId,
      );
      const profile = profileFromSpec(current, {
        id,
        levers: at.state.levers,
        ...(base === undefined ? {} : { base }),
      });
      context.update({
        savedDispatchers: [...saved, { id, profile }],
        dispatcherId: id,
        editingDispatcherId: id,
        dispatcherSpec: { ...current, name: profile.name },
      });
      setText(elements.error, '');
      context.openTab('run');
    } catch (error) {
      /*
       * A refused save is a fact about the document the reader is holding, not a crash. It lands in
       * this editor's own `role="alert"` rather than anywhere else, so the message is beside the
       * edit that caused it.
       */
      const message = error instanceof Error ? error.message : String(error);
      setText(elements.error, message);
      context.fail(message);
    }
  }

  /* --- the term rows ------------------------------------------------------ */

  function drawTerms(rows: readonly TermRow[]): void {
    const keys = rows.map((row) => row.termId).join('|');
    if (keys !== builtTermKeys) {
      termRows.clear();
      fill(
        elements.terms,
        ...rows.map((row) => {
          const node = slider(doc, {
            label: row.label,
            value: String(row.value),
            raw: row.value,
            min: 0,
            max: 100,
            step: 1,
            help: row.help,
            // Always non-empty, so the node exists for the render that has to put a refusal in it.
            sub: row.serves,
            onInput: (position) => {
              setWeight(row.termId, position);
            },
          });
          const handles = sliderHandlesOf(node);
          if (handles !== undefined) termRows.set(row.termId, handles);
          return node;
        }),
      );
      builtTermKeys = keys;
    }

    for (const row of rows) {
      const handles = termRows.get(row.termId);
      if (handles === undefined) continue;
      updateSliderRow(handles, {
        raw: row.value,
        value: String(row.value),
        // The refusal replaces the `serves` line rather than sitting under it: a weight the engine
        // will not read does not serve the metric the library says it serves, and printing both
        // would be the editor agreeing with itself about a term that changes no decision.
        sub: row.inertWhy === undefined ? row.serves : `${row.label} is ${row.inertWhy}`,
        subColor: row.inertWhy === undefined ? 'var(--faint)' : 'var(--warn)',
        labelColor: row.weighted ? 'var(--text)' : 'var(--dimmer)',
      });
    }
  }

  /* --- render ------------------------------------------------------------- */

  function render(at: ViewAt): void {
    view = at;
    const state = at.state;
    const current = state.dispatcherSpec;
    const terms = at.resources.dispatcherProfiles.terms;
    const everyone = allDispatchers(at.resources, state.savedDispatchers);
    const allIds = terms.map((term) => term.id);
    const running = profileById(at.resources, state.savedDispatchers, state.dispatcherId);
    const source = everyone.find((profile) => profile.id === state.editingDispatcherId);

    /* The controller list. */
    fill(
      elements.list,
      ...everyone.map((profile) =>
        pick(doc, {
          title: profile.name,
          sub: vectorLineOf(profile, allIds),
          ...(state.savedDispatchers.some((entry) => entry.id === profile.id)
            ? { tag: 'YOURS', tagClass: 'var(--ok)' }
            : profile.id === state.dispatcherId
              ? { tag: 'RUNNING', tagClass: 'var(--accent-soft)' }
              : {}),
          selected: profile.id === state.editingDispatcherId,
          help: flagLineOf(profile),
          onPick: () => {
            context.update({
              dispatcherSpec: specFromProfile(profile, profile.name),
              editingDispatcherId: profile.id,
            });
          },
        }),
      ),
    );

    /* Headings. */
    setText(elements.editing, `Editing — ${current.name}`);
    const yours = state.savedDispatchers.length;
    setText(elements.yoursCount, `${String(yours)} of your own saved`);
    if (elements.name.value !== current.name) elements.name.value = current.name;

    const rows = termRowsOf(terms, current, inertTerms(current));
    const weighted = rows.filter((row) => row.weighted).length;
    setText(
      elements.termsUsed,
      `The ${String(terms.length)} cost terms — ${String(weighted)} weighted`,
    );
    drawTerms(rows);

    /* Flags. */
    fill(
      elements.flags,
      ...flagRowsOf(current).map((row) =>
        toggle(doc, {
          label: row.label,
          hint: row.hint,
          help: row.help,
          on: row.on,
          onToggle: () => {
            patchSpec({ flags: { ...current.flags, [row.key]: !row.on } });
          },
        }),
      ),
    );

    /* Group levers. */
    fill(
      elements.levers,
      ...leverRowsOf(state.levers).map((row) =>
        toggle(doc, {
          label: row.label,
          hint: row.hint,
          help: row.help,
          on: row.on,
          onToggle: () => {
            context.update({ levers: { ...state.levers, [row.key]: !row.on } });
          },
        }),
      ),
    );

    /* Door dwell — four states, three chips. */
    fill(
      elements.dwellChips,
      ...dwellChipsOf(state.levers, running).map((row) =>
        chip(doc, {
          label: row.inherited ? `${row.label} (theirs)` : row.label,
          selected: row.pressed,
          title: row.help,
          onPick: () => {
            /*
             * Pressing the lit chip returns to *inherit* rather than doing nothing. Without it the
             * fourth state is reachable only by reloading the page, which makes it a state the
             * reader can leave and never re-enter — and it is the state every published figure was
             * measured in.
             */
            const next: DwellChoice | undefined =
              state.levers.dwell === row.choice ? undefined : row.choice;
            context.update({ levers: { ...state.levers, dwell: next } });
          },
        }),
      ),
    );
    setText(elements.dwellHint, dwellHintOf(state.levers, running));

    /* Summary, advice, dirty. */
    setText(
      elements.summary,
      costFunctionLine(current, (id) => shortTermNameOf(id, allIds)),
    );
    setText(elements.advice, adviceFor(current));
    setHidden(elements.dirty, !specIsDirty(current, source));

    /* The *now use this* verb, relabelled for whichever of the three states the panel is in. */
    const action = runThisDispatcherStateOf(
      current,
      source,
      state.dispatcherId,
      state.editingDispatcherId,
    );
    setText(runThis, RUN_THIS_COPY[action].label);
    runThis.title = RUN_THIS_COPY[action].title;
    runThis.disabled = action === 'alreadyDriving';

    /* Your dispatchers. */
    fill(
      elements.yours,
      ...state.savedDispatchers.map((entry) =>
        savedRow(doc, entry.profile, allIds, {
          onPick: () => {
            context.update({
              dispatcherSpec: specFromProfile(entry.profile, entry.profile.name),
              editingDispatcherId: entry.id,
            });
          },
          onDelete: () => {
            const remaining = state.savedDispatchers.filter((other) => other.id !== entry.id);
            const fallback = at.resources.dispatcherProfiles.profiles[0]?.id ?? state.dispatcherId;
            context.update({
              savedDispatchers: remaining,
              ...(state.dispatcherId === entry.id ? { dispatcherId: fallback } : {}),
              ...(state.editingDispatcherId === entry.id
                ? { editingDispatcherId: fallback }
                : {}),
            });
          },
        }),
      ),
    );
  }

  return { render };
}

/** One row of *your dispatchers*: pick it back into the editor, or delete it. */
function savedRow(
  doc: Document,
  profile: DispatcherProfile,
  allIds: readonly string[],
  handlers: { readonly onPick: () => void; readonly onDelete: () => void },
): HTMLElement {
  const open = el(doc, 'button', {
    className: 'pick',
    attrs: { type: 'button', 'aria-pressed': 'false' },
    style: { flex: '1', 'min-width': '0', border: '0', background: 'none' },
    children: [
      el(doc, 'div', { className: 'pick-title', text: profile.name }),
      el(doc, 'div', { className: 'pick-sub', text: vectorLineOf(profile, allIds) }),
    ],
  });
  open.addEventListener('click', handlers.onPick);
  const remove = el(doc, 'button', {
    className: 'chip',
    text: 'delete',
    title: `Remove ${profile.name}. Nothing else is touched; a run already recorded keeps the profile it was run with.`,
    attrs: { type: 'button' },
  });
  remove.addEventListener('click', handlers.onDelete);
  return el(doc, 'div', {
    className: 'elev-legend-row',
    style: {
      border: '1px solid var(--edge)',
      background: 'var(--card)',
      'border-radius': '10px',
      padding: '10px 12px',
    },
    children: [open, remove],
  });
}
