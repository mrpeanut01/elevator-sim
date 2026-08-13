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
 * ## What the run button promises — GitHub issue #92
 *
 * **One run, and the screen says so.** The panel's run verb re-simulates the same building, the same
 * seed and the same traffic with a different dispatcher in charge; it does not run a comparison, and
 * it may not be read as one. So the result strip built below is a **pairing of two sheets**, drawn
 * from `reportPanel.ts`'s own `ReportDeltaView` — which is arithmetic-free by construction: every
 * value in it is a string one of the two sheets already published, paired by figure id, with no
 * subtraction, no ordering and no colour. Its refusal travels with it: *"Two runs are two runs …
 * which setting is better needs 50 or more paired runs against the same passengers and an interval
 * that excludes zero, which is what Compare is for."*
 *
 * That number is CLAUDE.md's *"budget 50–200 replications"*, and it is why this strip does **not**
 * try to answer the question the issue asks in its title. A one-click *run this and show me the
 * difference* that reported the delta of two single runs would be this project's documented central
 * failure mode — *increasing lift speed appearing to increase average waiting time* — shipped as a
 * feature. The delta is worth putting in front of a practitioner anyway, because *what did this
 * dispatcher do today* is a real question with a real answer; what it is not is evidence.
 *
 * The strip is the **same** `reportDeltaOf` the Day report draws, reached through the exported
 * `reportViewOf`, rather than a second implementation. Two answers to *what moved* is how the two
 * surfaces come to disagree about a run they are both describing.
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

import { COST_TERMS_BY_ID } from '@elevator-sim/core/browser';
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

import {
  applyPlainLever,
  plainLeverEchoOf,
  plainLeverHelp,
  plainLeverSub,
  plainLeversOf,
  type PlainLeverId,
  type PlainLeverView,
} from '../mode/plainLevers.js';
import type { ViewMode } from '../mode/types.js';
import { commitmentOf } from '../scope/commitment.js';
import type { ShapedDayReport } from '../shift/report.js';

import { chip, el, fill, pick, plateRow, setHidden, setStyle, setText, slider, toggle } from './dom.js';
import type { DispatcherEditorElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import { reportViewOf, runProgressOf, type RunProgress } from './reportPanel.js';
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
  /**
   * The sub-line, in the mode's own vocabulary.
   *
   * Advanced: `serves AWT`, from the library's engineer-facing `serves`. Basic: the term's
   * `player` words from `core` — the plain serves clause and both slider ends — which is §16
   * rule 11 of the Everyday Mode handoff (issue #147): the words live beside the term in the
   * model, and this row *reads* them rather than owning a translation table.
   */
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
  mode: ViewMode = 'advanced',
): readonly TermRow[] {
  const why = new Map(inert.map((entry) => [entry.termId, entry.why]));
  return terms.map((term): TermRow => {
    const value = spec.weights[term.id] ?? 0;
    return {
      termId: term.id,
      label: humanTermName(term.id),
      help: term.measures,
      serves: mode === 'basic' ? plainServesOf(term) : `serves ${term.serves}`,
      value,
      weighted: value > 0,
      inertWhy: why.get(term.id),
    };
  });
}

/**
 * The Basic sub-line: the plain serves clause and both slider ends, from the term's own
 * `player` words in `core` (Everyday handoff §11.4 — *"labelled with what it serves and both of
 * its ends"*; §16 rule 11 — the words are the model's, never a table in this file).
 *
 * The engineer's `serves AWT` is the fallback for a term the registry has not implemented —
 * such a term has no `player` block to read, its weight moves nothing, and inventing plain
 * words here for it would be the id-to-prose table #147 forbids, one register over.
 */
function plainServesOf(term: CostTerm): string {
  const implemented = COST_TERMS_BY_ID.get(term.id);
  if (implemented === undefined) return `serves ${term.serves}`;
  const player = implemented.player;
  return `serves ${player.serves} · ${player.atZero} → ${player.atFull}`;
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

/* -------------------------------------------------------------------------- *
 * "And what did it do?" — the result strip, GitHub issue #92
 * -------------------------------------------------------------------------- */

/**
 * The run this panel's own press started, and the sheet that press replaced.
 *
 * ## Why the *before* is captured at the press rather than looked up afterwards
 *
 * `mountReport` keeps a `previousSheet` of its own and differences against *"the sheet before this
 * one"*. That is the right relation for a sheet, and it is the wrong one here: this panel is not
 * describing a sequence of sheets, it is describing **the press the reader just made**. The sheet
 * that was on screen at that moment is a fact this panel owns and cannot be wrong about, and saying
 * so on the strip means the two surfaces are not two answers to one question — they are answers to
 * two questions, each naming its own.
 *
 * It also survives the one case a lookup does not. `dev/main.ts` files a sheet from a *mid-run*
 * toggle of the energy axis (the stale-sheet resurrection recorded in triage as N-3), so *the latest
 * filed sheet* is not always a sheet of the latest run. {@link editorRunReadOutOf} gates on the
 * playhead as well as on the run id, and refuses rather than pairs whenever either disagrees.
 *
 * `runId` is `building-profile-seed`, so re-running one selection reproduces bit-identically
 * (§ D223) and the id is stable across a retry — which is correct here: the reader pressed once, and
 * a second run of the same selection is the same run.
 */
export interface EditorRunPairing {
  readonly runId: string;
  /** The filed sheet at the moment of the press, or `undefined` when nothing had been filed. */
  readonly before: ShapedDayReport | undefined;
}

/**
 * Which of six things the strip has to say. Prose-free on purpose — see {@link RunThisState}.
 *
 * The five that are not `paired` are all *"there is nothing to pair yet, and here is why"*, and each
 * names a different why. A single "no data" arm would have collapsed a day that is still playing
 * (wait), a day nobody filed (open the sheet) and a run somebody else started (press again) into one
 * shrug, which is the class of message a reader learns to stop reading.
 */
export type EditorRunReadOut =
  | 'noRun'
  | 'superseded'
  | 'watching'
  | 'unfiled'
  | 'firstSheet'
  | 'paired';

/**
 * What the strip may say, given what this panel started and what is on screen now.
 *
 * The order of the tests is the order of what a reader is owed, and it is the same order
 * `reportViewOf` uses one surface over: *nothing has been run here* outranks everything, because a
 * strip cannot be about a press that never happened; *this is not that run any more* comes next,
 * because pairing a sheet of somebody else's run against this panel's remembered *before* would be a
 * delta between two runs that were never asked the same question; and **the playhead outranks the
 * filed sheet**, which is § D223 applied to a second surface — a whole-day pairing drawn while the
 * day is at 09:14 is two answers on one screen, and this panel is not entitled to a different answer
 * from the sheet it is quoting.
 */
export function editorRunReadOutOf(
  caused: EditorRunPairing | undefined,
  at: {
    readonly runId: string | undefined;
    readonly playedOut: boolean;
    readonly report: ShapedDayReport | undefined;
  },
): EditorRunReadOut {
  if (caused === undefined) return 'noRun';
  if (at.runId !== caused.runId) return 'superseded';
  if (!at.playedOut) return 'watching';
  if (at.report === undefined) return 'unfiled';
  return caused.before === undefined ? 'firstSheet' : 'paired';
}

/* -------------------------------------------------------------------------- *
 * Naming a dispatcher — GitHub issue #113 § 3
 * -------------------------------------------------------------------------- */

/**
 * Why a name cannot be filed, or `undefined` when it can.
 *
 * ## The two defects this closes, both reported and both reproduced
 *
 * Save wrote whatever was in the field and `profileFromSpec` turned an empty one into *My
 * dispatcher* — with **no dedupe of any kind**, so pressing Save three times on an untouched blank
 * spec produced three cards with identical titles and no way to tell them apart. The right rail, the
 * challenge screen's dispatcher select and this panel's own *your dispatchers* list all key on the
 * id and all *display* the name, so three identical names is three identical rows over three
 * different weight vectors.
 *
 * The comparison is case- and space-insensitive because the reader is the one who has to tell them
 * apart on a list: `Mine` and `mine ` are two rows a person cannot distinguish, and a uniqueness
 * rule that admits them has not delivered uniqueness. The shipped profiles are in `taken` as well as
 * the reader's own — a saved dispatcher called `collective` sits in the same list as the shipped one
 * and would be indistinguishable from it.
 *
 * ## Why it returns a code rather than a sentence
 *
 * {@link runThisDispatcherStateOf}'s reason, in full above: an exported producer of player-facing
 * prose owes `honesty/surfaces.ts` an adapter, and this lane does not own that file. The copy is
 * module-private, beside the button, in {@link NAME_REFUSAL_COPY}.
 */
export type NameRefusal = 'empty' | 'taken';

export function saveNameRefusalOf(
  name: string,
  taken: readonly string[],
): NameRefusal | undefined {
  const wanted = name.trim().toLowerCase();
  if (wanted === '') return 'empty';
  return taken.some((other) => other.trim().toLowerCase() === wanted) ? 'taken' : undefined;
}

/**
 * Whether *rename* is offered, and if not, why not.
 *
 * Issue #113 § 3: *"there is a delete but no rename"*. Deleting and re-saving is not a rename —
 * it mints a new id, and the id is what a recording, the right rail and the challenge screen all
 * hold — so a reader who mistyped a name had a choice between living with it and orphaning
 * everything that referred to it.
 *
 * `notYours` rather than a disabled button with no reason: a shipped profile's name is `data/`'s,
 * and this editor renaming one would put a second answer to *what is `collective` called* in the
 * player's browser only.
 */
export type RenameState = 'notYours' | 'unchanged' | 'refused' | 'ready';

export function renameStateOf(
  name: string,
  editingId: string,
  saved: readonly { readonly id: string; readonly profile: DispatcherProfile }[],
): RenameState {
  const entry = saved.find((other) => other.id === editingId);
  if (entry === undefined) return 'notYours';
  if (name.trim() === entry.profile.name.trim()) return 'unchanged';
  const others = saved
    .filter((other) => other.id !== editingId)
    .map((other) => other.profile.name);
  return saveNameRefusalOf(name, others) === undefined ? 'ready' : 'refused';
}

/**
 * The library with one entry renamed — the id, the weights and every carried field untouched.
 *
 * A `map` rather than a delete and an append, and that is the whole point: the entry keeps its
 * position in the list and, far more importantly, its **id**. A rename that minted a new id would
 * be a delete wearing a friendlier label, and `state.dispatcherId` would go on naming a dispatcher
 * that no longer exists.
 */
export function renamedDispatchers(
  saved: readonly { readonly id: string; readonly profile: DispatcherProfile }[],
  id: string,
  name: string,
): readonly { readonly id: string; readonly profile: DispatcherProfile }[] {
  return saved.map((entry) =>
    entry.id === id ? { id: entry.id, profile: { ...entry.profile, name: name.trim() } } : entry,
  );
}

/* -------------------------------------------------------------------------- *
 * What this editor cannot write — GitHub issue #113 § 5
 * -------------------------------------------------------------------------- */

/**
 * The blocks a profile carries that this editor's document cannot express.
 *
 * `data/dispatcher-profiles.json` advertises five families — `baseline`, `auction`, `zoning`,
 * `destination` and the weighted-cost engine everything shares — and **two of them are authorable
 * here**. The editor's document is thirteen weights plus three flags, so there is no control for an
 * auction's rounds, a zone's split threshold, a destination panel's `passengerAssignment`, a
 * reassignment policy or a hard constraint. Copying such a profile *does* round-trip those fields,
 * because {@link profileFromSpec} spreads its `base` — which is precisely what makes the silence
 * dangerous: the reader edits a multi-round auction's weights, saves, and gets a multi-round
 * auction, with nothing on screen having mentioned the auction.
 *
 * § D227's rule, in its own words: *a control that writes nothing must say so.* This is the same
 * rule pointed at the gap between what a document carries and what a panel can reach, and it is
 * reported rather than fixed — building an auction editor is a lane, and a **silent** partial editor
 * is the defect.
 *
 * Derived from the profile rather than from its `role`, because `role` is free-form and three of the
 * thirteen shipped profiles declare none while carrying exactly these blocks.
 */
export type UnauthorableBlock =
  | 'auction'
  | 'zoning'
  | 'panel'
  | 'reassignment'
  | 'timing'
  | 'constraints'
  | 'selection';

export function unauthorableBlocksOf(
  profile: DispatcherProfile | undefined,
): readonly UnauthorableBlock[] {
  if (profile === undefined) return [];
  const dispatch = profile.dispatch;
  const found: UnauthorableBlock[] = [];
  if (profile.auction !== undefined) found.push('auction');
  if (dispatch?.splitThresholdPassengers !== undefined) found.push('zoning');
  if (dispatch?.passengerAssignment !== undefined) found.push('panel');
  if (dispatch?.reassignmentPolicy !== undefined) found.push('reassignment');
  if (dispatch?.assignmentTiming !== undefined) found.push('timing');
  if (profile.hardConstraints !== undefined || profile.eligibility !== undefined) {
    found.push('constraints');
  }
  if (profile.selection !== undefined) found.push('selection');
  return found;
}

/*
 * The sentence both run verbs end on — GitHub issue #92, and the one clause on this panel that is
 * not about what the press *does*.
 *
 * Written once and shared, rather than said twice in two ways. It is the promise the button is
 * making, and a promise stated in two wordings is two promises: the day one of them is edited, the
 * button says one thing on the label a reader hovers and another on the label they do not.
 *
 * The figure is CLAUDE.md's own — *budget 50–200 replications; ten is not enough* — and the shape of
 * the claim is `reportPanel.ts`'s, which is the wording every other refusal on this subject in the
 * product already uses. The panel's foot in `index.html` says the same thing in the same words, and
 * that is not redundancy: it is there for a reader who never hovers anything.
 */
const ONE_RUN_PROMISE =
  'This is one run, not a comparison: same building, same seed, same passengers, a different ' +
  'dispatcher in charge. A difference between two single runs is not evidence that one dispatcher ' +
  'is better than another — that needs 50 or more paired runs against the same passengers and an ' +
  'interval that excludes zero, which is what Compare is for. What one run tells you is what this ' +
  'dispatcher did today, and the strip below the buttons says what moved.';

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
      `dispatcher by id. ${ONE_RUN_PROMISE}`,
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
      `building, seed and traffic. ${ONE_RUN_PROMISE}`,
  }),
});

/** The strip's heading. Constant across all six states, so the block is findable when it is empty. */
const RESULT_EYEBROW = 'What your run moved';

/**
 * Which two sheets the rows are, said above them.
 *
 * The direction has to be on the screen rather than inferred from the arrow, because the rows carry
 * no sign and no colour — `ReportDeltaView`'s whole design — so *which column is which* is the only
 * thing a reader needs and cannot work out.
 */
const RESULT_PAIRING_LINE =
  'Left is what the sheet on screen said when you pressed; right is what the sheet your run filed ' +
  'says. Both columns are those two sheets’ own words, unedited.';

/**
 * The five states that are not a pairing, each saying which one it is.
 *
 * `watching` is a template rather than a sentence because it names the playhead, and a clock in a
 * fixed string is a clock that stops being true. It is built by {@link runReadOutNoteOf} from
 * `runProgressOf`'s own two strings — the same two `reportPanel.ts` puts on the running sheet, so
 * the strip and the sheet cannot disagree about what time it is in the building.
 */
const RUN_READ_OUT_COPY: Readonly<Record<Exclude<EditorRunReadOut, 'paired'>, string>> =
  Object.freeze({
    noRun:
      'Nothing to put side by side yet. Run a dispatcher from this panel and what its sheet printed ' +
      'lands here, beside what the sheet before it printed.',
    superseded:
      'The run this panel started is no longer the one on screen — a different building, dispatcher ' +
      'or seed has been run since. Run again from here and the pairing starts from the sheet that ' +
      'is filed now.',
    watching:
      'This strip reports a whole day at once and waits for the playhead: a part-day average is not ' +
      'an average of the day. Play it through on the Simulation tab, or click the far end of the ' +
      'timeline, and the two sheets land here.',
    unfiled:
      'The day has played out and no sheet has been filed for it. Opening the Day report closes the ' +
      'day and files one; this strip fills in when you come back.',
    firstSheet:
      'This is the first sheet filed this session, so there is nothing to set beside it. Move a ' +
      'weight, run again from here, and the next sheet arrives paired with this one.',
  });

/**
 * One side of a pairing row: the sheet's value, and — when that value is a mean — the count it was
 * taken over, in the sheet's own words. Issue #137.
 *
 * Both strings arrive from `ReportDeltaView`; nothing is composed here except the brackets. It is a
 * function rather than two inline templates so the two sides cannot end up punctuated differently,
 * which is the smallest version of the mistake this whole strip is arranged against: two answers to
 * one question about one run.
 */
function withCount(value: string, count: string | null): string {
  return count === null ? value : `${value} (${count})`;
}

/** The note for a strip that is not showing a pairing, with the playhead's clock where it belongs. */
function runReadOutNoteOf(state: Exclude<EditorRunReadOut, 'paired'>, progress: RunProgress): string {
  const base = RUN_READ_OUT_COPY[state];
  if (state !== 'watching' || progress.kind !== 'watching') return base;
  return `The day is still running — ${progress.atClock} of a shift that runs to ${progress.endsAtClock}. ${base}`;
}

/** The refusals {@link saveNameRefusalOf} returns, said where the reader typed the name. */
const NAME_REFUSAL_COPY: Readonly<Record<NameRefusal, string>> = Object.freeze({
  empty:
    'Give this dispatcher a name before saving it. It is the only thing that tells it apart from ' +
    'the others on every list it appears on.',
  taken:
    'A dispatcher with that name already exists. Two rows with one name are two rows you cannot ' +
    'tell apart later — change a word and save again, or use Rename to move the name.',
});

/** Why *Rename* is off, said on the control rather than left for the reader to work out. */
const RENAME_COPY: Readonly<Record<RenameState, string>> = Object.freeze({
  notYours:
    'Only a dispatcher you saved can be renamed. This one ships with the simulator, and its name ' +
    'is the one every published figure was measured under.',
  unchanged: 'The name in the field is already this dispatcher’s name.',
  refused: 'That name is empty or already taken by another dispatcher.',
  ready: 'Renames the saved dispatcher you are editing. Nothing else changes — same id, same weights.',
});

/** What each unauthorable block is, in the reader's words. One clause, naming the field. */
const UNAUTHORABLE_COPY: Readonly<Record<UnauthorableBlock, string>> = Object.freeze({
  auction: 'its auction (how many rounds of bidding, and the reserve)',
  zoning: 'the size of the landing crowd that splits a zone',
  panel: 'its destination panel wiring (who is told the destination, and when)',
  reassignment: 'when an assignment stops being changeable',
  timing: 'whether an assignment is made at once or deferred',
  constraints: 'its hard constraints and eligibility rules',
  selection: 'its mid-run weight-set selection',
});

/*
 * The two scope notes this panel carries — GitHub issue #104.
 *
 * ## Two, because this panel holds two behaviours a hand's width apart
 *
 * The weights, the flags and the name write `dispatcherSpec`, which `shiftRunConfigOf` never reads;
 * the group levers and the door dwell write `levers`, which it does. Both blocks are drawn in the
 * same editor panel, in the same slider and toggle components, and **neither of them changes the
 * shift on screen** — for two different reasons, needing two different sentences. The report asks
 * for one note; one note here would have been wrong about one of the blocks it covered.
 *
 * ## The reporter's own wording, on the block it is true of
 *
 * *"Locked for this shift, changes apply to your next run"* is issue #104's suggested copy. It is
 * refused on the right rail — a card there discards the day outright — and it is exactly right
 * about the levers, so it is used verbatim there. A fix that improved the wording of a correct
 * sentence would have been this repository rewriting a reporter for style.
 *
 * ## Why the verbs are interpolated rather than typed out
 *
 * {@link RUN_THIS_COPY} is the module that decides what the button beneath these sliders says. A
 * note naming *Run this dispatcher* in its own quotes would be a second answer to the same
 * question, and the label is exactly the sort of thing a later lane renames — `rightRail.ts`'s
 * machines refusal makes the same move against `menu/screens.ts` and `index.html`, and says why:
 * *a refusal is pinned by the thing it points at, never by another sentence.*
 *
 * Both are empty when `scope/surface.ts` stops declaring what they claim. See
 * `scope/commitment.ts` for why the failure direction is silence rather than a stale sentence.
 */
const DRAFT_NOTE =
  commitmentOf('viewer.dispatcherSpec', 'writes-only') === 'draft'
    ? 'Nothing you move here reaches a run yet — this panel holds a draft, and the shift on ' +
      `screen keeps the dispatcher it was simulated with. ${RUN_THIS_COPY.select.label} is what ` +
      `hands it over, or ${RUN_THIS_COPY.saveFirst.label} while the draft is still unfiled; ` +
      'either one re-runs the whole day from the start rather than steering the one you are ' +
      'watching.'
    : '';

const LEVERS_NOTE =
  commitmentOf('viewer.levers', 'writes-only') === 'next-run'
    ? 'Locked for this shift: changes apply to your next run. These do reach a run — the day is ' +
      'simulated with them — but moving one asks for no run of its own, so the shift on screen ' +
      'keeps the levers it was simulated under until something else runs one.'
    : '';

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
    save({ select: false });
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

  /*
   * The two nodes the shipped markup does not carry, built here on `buildingEditor.ts`'s precedent
   * and for the same two reasons — GitHub issue #113 §§ 3 and 4.
   *
   * **The confirmation** is what Save owes the reader now that it no longer navigates. It used to
   * end in `context.openTab('run')`, so *something happened* was carried by the tab changing under
   * the reader; a Save that files quietly and stays put would be the dead button issue #54 reported
   * one panel over.
   *
   * **Rename** is the verb the panel was missing. Delete existed; rename did not, so the only way to
   * correct a name was to delete and re-save, which mints a new id.
   */
  const savedNote = el(doc, 'span', {
    className: 'helpful',
    attrs: { role: 'status' },
    style: { color: 'var(--ok)', 'font-size': '11.5px' },
  });
  const rename = el(doc, 'button', {
    className: 'chip',
    text: 'Rename',
    attrs: { type: 'button' },
  });
  /*
   * The refusal § D227 requires — issue #113 § 5. It goes under the summary line, which is where
   * this panel already says *what the dispatcher you are looking at is*, rather than beside the
   * buttons: it is a fact about the document, not about a verb.
   */
  const unauthorable = el(doc, 'p', {
    className: 'helpful',
    style: { color: 'var(--warn)', 'font-size': '11.5px', margin: '4px 0 0' },
  });
  /*
   * The result strip — GitHub issue #92. Four nodes, built here on the same precedent as the three
   * above, and placed **after** `.editor-actions` rather than inside it: it is an account of a run,
   * not a verb, and a paragraph inside a row of buttons would be laid out as one.
   *
   * The heading is drawn in every state, including the one where there is nothing to report, for
   * `emptyReportView`'s reason one surface over: a block that appears only when it has something to
   * say is a block a reader does not know exists, and *"press this and nothing appears"* is the
   * reading it replaces.
   */
  const resultEyebrow = el(doc, 'div', {
    className: 'eyebrow',
    text: RESULT_EYEBROW,
    style: { 'margin-bottom': '6px' },
  });
  const resultPairing = el(doc, 'p', {
    className: 'helpful',
    style: { 'font-size': '11.5px', color: 'var(--dim)', margin: '0 0 8px', 'line-height': '1.5' },
  });
  const resultRows = el(doc, 'div', { className: 'plate' });
  /*
   * `role="status"` for the same reason the save confirmation carries one: the strip changes without
   * the reader having moved focus into it — a run they started minutes ago finishes filing — and a
   * screen reader that is never told is a second channel this panel does not have.
   */
  const resultNote = el(doc, 'p', {
    className: 'helpful',
    attrs: { role: 'status' },
    style: { 'font-size': '11.5px', color: 'var(--dim)', margin: '8px 0 0', 'line-height': '1.5' },
  });
  const resultStrip = el(doc, 'div', {
    style: { 'margin-top': '16px', 'padding-top': '14px', 'border-top': '1px solid var(--hairline)' },
    children: [resultEyebrow, resultPairing, resultRows, resultNote],
  });

  /*
   * The four plain levers — the Everyday handoff's tinker drawer (§11.3), built here on the same
   * precedent as the nodes above because `index.html` has no block for it yet.
   *
   * **There is no lever state.** Each row is a named view onto a control this panel already
   * binds — two weights, two group controls — through `plainLeversOf`/`applyPlainLever`
   * (`mode/plainLevers.ts`, which owns the mapping and the §20.1 argument). That is why the block
   * sits *above* the thirteen terms: a reader who moves a lever and then opens the terms sees the
   * same number, because it is the same number.
   *
   * Sliders are built once and updated in place, for the drag-capture reason the term rows give;
   * the two toggle slots are re-filled per render like the flags block.
   */
  const plainSliderRows = new Map<PlainLeverId, SliderHandles>();
  const plainSlots = new Map<PlainLeverId, HTMLElement>();
  /** The four lever rows' own container, so the block's fixed lines cannot interleave with them. */
  const plainSlotsBox = el(doc, 'div');
  /*
   * The acknowledgement pair — `docs/19` defect 5, and the audit's *surface the lever's
   * consequence where the eye is*. At 1280 the thirteen terms — and `#dispatcher-summary`'s cost
   * line, *"the best feedback in the editor"* — are below the fold, so a moved lever changed
   * nothing visible. `plainEcho` names what the press just wrote (`plainLeverEchoOf`, derived
   * from the current view each render so it cannot go stale); `plainCost` is **the same
   * `costFunctionLine` call the summary makes** — one composition, drawn in a second place,
   * never a second composition (`authoring/dispatcherSpec.ts#costFunctionLine` stays the only
   * author of that expression).
   *
   * The pair sits **above** the four rows, not under them — `docs/20` defect 11's second walk
   * found the first fix's echo at y 748–835 with the fold at 745, which is `docs/19` defect 5
   * verbatim with the sentence written: an acknowledgement below four slider rows is pushed under
   * the fold *by the rows it acknowledges*, at exactly the width the block was built for. Above
   * them it cannot be — the block opens at the top of the panel — and `fold1280.browser.test.ts`
   * measures it there rather than trusting this paragraph. The extra class on the echo is that
   * test's handle; the node is still the one `.advice` paragraph `noteContrast` counts.
   */
  const plainEcho = el(doc, 'p', {
    className: 'advice dispatcher-plain-echo',
    style: { margin: '0 0 8px' },
  });
  const plainCost = el(doc, 'div', {
    className: 'summary-line',
    style: { margin: '0 0 10px' },
  });
  const plainBlock = el(doc, 'div', {
    style: { margin: '0 0 14px' },
    children: [
      el(doc, 'div', {
        className: 'eyebrow',
        text: 'THE FOUR PLAIN LEVERS',
        style: { 'margin-bottom': '4px' },
      }),
      el(doc, 'p', {
        className: 'helpful',
        text:
          'Each lever is a plain name for a control below. Moving it moves the same setting the ' +
          'engineer’s own controls show, so the two can never disagree.',
        style: { 'font-size': '11.5px', color: 'var(--dim)', margin: '0 0 8px', 'line-height': '1.5' },
      }),
      plainEcho,
      plainCost,
      plainSlotsBox,
    ],
  });

  setHidden(savedNote, true);
  setHidden(unauthorable, true);
  elements.save.parentElement?.append(runThis, rename, savedNote);
  elements.save.parentElement?.after(resultStrip);
  elements.summary.parentElement?.append(unauthorable);
  /*
   * Before the terms **header row**, not before the header's own span — `docs/20` defect 11's
   * other half. `elements.termsUsed.parentElement` is the `.eyebrow-row` flex row, and the first
   * fix inserted `plainBlock` *inside* it: the whole lever block became a flex item laid out
   * beside `THE 13 COST TERMS`, which is how a section header came to render as a 58 px
   * one-word-per-line sliver at 1280×800. The row itself is the sibling this block goes above.
   * Still `parentElement?.insertBefore` — the sibling-insert idiom every other mount uses, and
   * the one the DOM test recorders answer.
   */
  const termsHeaderRow = elements.termsUsed.parentElement;
  termsHeaderRow?.parentElement?.insertBefore(plainBlock, termsHeaderRow);

  /*
   * The two scope notes, written once at mount rather than on every render — issue #104. Each sits
   * **above** the block it is about, because it is the rule a reader needs before moving a slider;
   * a sentence underneath is an explanation of something already spent. Built here for
   * {@link DRAFT_NOTE}'s stated reason: `index.html` cannot derive a claim from `scope/surface.ts`.
   */
  const scopeNote = (before: HTMLElement, text: string): void => {
    if (text === '') return;
    // `.advice` is this panel's own voice for *a sentence about the controls beside it*, with a
    // bottom margin added because the class is written for a line that ends a block and this one
    // opens one.
    before.parentElement?.insertBefore(
      el(doc, 'p', { className: 'advice', text, style: { 'margin-bottom': '10px' } }),
      before,
    );
  };
  scopeNote(elements.terms, DRAFT_NOTE);
  scopeNote(elements.levers, LEVERS_NOTE);

  /**
   * The run this panel started, and the sheet it replaced — see {@link EditorRunPairing}.
   *
   * A mount-local rather than a `ViewerState` field, and the reason is `mountReport`'s about its own
   * `previousSheet` plus one this panel has of its own: `scope/surface.ts` derives its table from the
   * state's keys, so a field here would be a new row in the change-scope surface for something no
   * control writes and no run reads. It is lost on reload, which is honest — so is the reader's
   * memory of which press this was.
   */
  let caused: EditorRunPairing | undefined;

  rename.addEventListener('click', () => {
    const at = view;
    const current = spec();
    if (at === undefined || current === undefined) return;
    const state = at.state;
    if (renameStateOf(current.name, state.editingDispatcherId, state.savedDispatchers) !== 'ready') {
      return;
    }
    /*
     * The spec's name is rewritten to the trimmed form as well, so the field the reader typed into
     * and the row they just renamed do not disagree by a space — and so `specIsDirty` compares
     * equal afterwards, which is what stops *Rename* leaving the panel claiming unsaved changes.
     */
    context.update({
      savedDispatchers: renamedDispatchers(
        state.savedDispatchers,
        state.editingDispatcherId,
        current.name,
      ),
      dispatcherSpec: { ...current, name: current.name.trim() },
    });
    setText(elements.error, '');
  });

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
    /*
     * The two halves of the pairing, read **before** anything is written — GitHub issue #92.
     *
     * `before` is the sheet on screen at the instant of the press, which is the relation the strip
     * claims and the only one this panel can be certain of. `wasRunId` is what the strip is
     * measured against below: `runShift` catches its own failures and leaves the state alone, so a
     * run that did not happen leaves the recording where it was, and the pairing must not be armed
     * on it — the reader would be shown a delta of the previous sheet against itself, captioned as
     * the run they just asked for.
     */
    const before = at.state.report;
    const wasRunId = at.recording?.runId;
    if (action === 'saveFirst') {
      /*
       * The **one** path that still selects, and it says so on its own label: *Save it and run it*.
       * A press that refused — an empty or duplicated name — must not go on to run, because there
       * is nothing filed for the run to resolve, so the return value is branched on rather than
       * discarded.
       */
      if (!save({ select: true })) return;
    } else {
      context.update({ dispatcherId: at.state.editingDispatcherId });
      context.openTab('run');
    }
    /*
     * **Armed when the run lands, not on the next line** — and the sentence that used to be here
     * was true when it was written and had stopped being true, which is this repository's own
     * standing hazard rather than a new one.
     *
     * It read *"`runShift` re-renders synchronously, so `view` is the state the press produced by
     * the time it returns"*. That was a fact about `dev/main.ts#runShift` calling `recordRun`
     * inline, and it stopped being one when the shift moved to a worker — at which point this
     * panel armed nothing, because `view.recording` was still the previous run's when the next line
     * ran. The strip went on drawing *"Nothing to put side by side yet"* after a press that had in
     * fact started a run, which `dispatcherStrip.browser.test.ts` caught in three cases.
     *
     * `MountContext.runShift`'s callback is the fix and it keeps the property the old comment was
     * about: it is handed the recording the run produced, and it is **not called at all** for a
     * press that refused, threw or was cancelled. So arming is still conditional on a run having
     * happened — the condition is simply the shell's answer now rather than an inference from a
     * field that may not have been written yet.
     */
    context.runShift((recording) => {
      if (recording.runId === wasRunId) return;
      caused = { runId: recording.runId, before };
      // `renderAll` has already run by the time the callback fires, so the strip needs one more
      // paint to show the pairing this press just armed. `view` is the fresh one by then.
      if (view !== undefined) render(view);
    });
  });

  /**
   * File the spec as a new dispatcher. `true` when something was filed.
   *
   * ## Saving no longer selects — GitHub issue #113 §§ 3 and 4
   *
   * This wrote `dispatcherId: id` and then `context.openTab('run')`, so **every** press of Save
   * silently changed who was driving and moved the reader off the panel. Issue #113 § 3 reports the
   * consequence: a reader pressing Save repeatedly, as one does while tuning, kept re-pointing the
   * run at whatever they had filed most recently without ever asking for it.
   *
   * § 4 reports the same seam from the other end — the building editor's Save does *not* select, so
   * *"Save as a new building"* leaves the next run on the old building. The two editors disagreed,
   * and **the dispatcher editor is the one that moved**, deliberately: the building editor's
   * selection goes through {@link stateRunningSaved}, whose docstring documents a week-contract
   * forgery that a bare `buildingId` write reintroduces — a drawn tower banked against a real
   * assignment. That indirection is load-bearing and is not something to copy over here; what is
   * copyable is its *shape*, which is **Save files it and says so, and a second, named verb runs
   * it**. The building editor's second verb is *Run a day on it*; this panel's is the *now use this*
   * control above, which has been here since issue #65 and now carries the whole of the selection.
   */
  function save(options: { readonly select: boolean }): boolean {
    const at = view;
    const current = spec();
    if (at === undefined || current === undefined) return false;
    /*
     * Refused **before** an id is minted, so a rejected save leaves nothing behind. The names it is
     * checked against are every dispatcher on the list the reader will read it off — shipped and
     * saved — because that is the list on which two identical rows are indistinguishable.
     */
    const refusal = saveNameRefusalOf(
      current.name,
      allDispatchers(at.resources, at.state.savedDispatchers).map((profile) => profile.name),
    );
    if (refusal !== undefined) {
      setText(elements.error, NAME_REFUSAL_COPY[refusal]);
      forgetConfirmation();
      return false;
    }
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
        ...(options.select ? { dispatcherId: id } : {}),
        editingDispatcherId: id,
        dispatcherSpec: { ...current, name: profile.name },
      });
      setText(elements.error, '');
      if (options.select) {
        forgetConfirmation();
        context.openTab('run');
        return true;
      }
      confirmedId = id;
      setText(
        savedNote,
        `Saved — “${profile.name}” is in your dispatchers. It is not driving yet; press ` +
          `“${RUN_THIS_COPY.select.label}” to put it in charge of the shift.`,
      );
      setHidden(savedNote, false);
      return true;
    } catch (error) {
      /*
       * A refused save is a fact about the document the reader is holding, not a crash. It lands in
       * this editor's own `role="alert"` rather than anywhere else, so the message is beside the
       * edit that caused it.
       */
      const message = error instanceof Error ? error.message : String(error);
      setText(elements.error, message);
      context.fail(message);
      forgetConfirmation();
      return false;
    }
  }

  /** The dispatcher the confirmation is about. Cleared the moment the reader edits again. */
  let confirmedId = '';

  function forgetConfirmation(): void {
    confirmedId = '';
    setText(savedNote, '');
    setHidden(savedNote, true);
  }

  /* --- the four plain levers ---------------------------------------------- */

  /**
   * Which lever the reader last pulled, and on which draft — the echo's key, never its words.
   *
   * The words come from {@link plainLeverEchoOf} over the **current** view on every render, so
   * the line cannot describe a value the state has since left; what is remembered is only *that*
   * a lever was pulled and *which*. Keyed on `editingDispatcherId` so switching to another
   * profile clears it — an echo about a draft no longer on screen would be the stale-confirmation
   * defect {@link forgetConfirmation} exists for, one element down.
   */
  let pulledLever: { readonly id: PlainLeverId; readonly editingId: string } | undefined;

  /** Route a lever's new value through the model and into state, both documents at once. */
  function pullPlainLever(id: PlainLeverId, value: number | boolean): void {
    const at = view;
    if (at === undefined) return;
    const applied = applyPlainLever(at.state.dispatcherSpec, at.state.levers, id, value);
    pulledLever = { id, editingId: at.state.editingDispatcherId };
    context.update({ dispatcherSpec: applied.spec, levers: applied.levers });
  }

  function drawPlainLevers(rows: readonly PlainLeverView[]): void {
    for (const row of rows) {
      let slot = plainSlots.get(row.id);
      if (slot === undefined) {
        slot = el(doc, 'div');
        plainSlots.set(row.id, slot);
        plainSlotsBox.append(slot);
      }
      const sub = plainLeverSub(row);
      const help = plainLeverHelp(row);
      if (row.kind === 'toggle') {
        fill(
          slot,
          toggle(doc, {
            label: row.label,
            hint: sub,
            help,
            on: row.value === true,
            onToggle: () => {
              pullPlainLever(row.id, !(row.value === true));
            },
          }),
        );
        continue;
      }
      const position = typeof row.value === 'number' ? row.value : 0;
      let handles = plainSliderRows.get(row.id);
      if (handles === undefined) {
        const node = slider(doc, {
          label: row.label,
          value: String(position),
          raw: position,
          min: 0,
          max: 100,
          step: 1,
          help,
          sub,
          onInput: (next) => {
            pullPlainLever(row.id, next);
          },
        });
        handles = sliderHandlesOf(node);
        if (handles !== undefined) plainSliderRows.set(row.id, handles);
        fill(slot, node);
        continue;
      }
      updateSliderRow(handles, {
        raw: position,
        value: String(position),
        sub,
        subColor: 'var(--faint)',
        labelColor: position > 0 ? 'var(--text)' : 'var(--dimmer)',
      });
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

    const plainRows = plainLeversOf(current, state.levers);
    drawPlainLevers(plainRows);
    /*
     * The acknowledgement pair — docs/19 defect 5. The echo is cleared when the draft under it
     * changes (same rule as {@link forgetConfirmation}: a sentence about a document no longer on
     * screen), and is otherwise re-derived from the current rows so it always states the value
     * the lever now holds. The cost line is the summary's own call, verbatim.
     */
    if (pulledLever !== undefined && pulledLever.editingId !== state.editingDispatcherId) {
      pulledLever = undefined;
    }
    const pulledRow = plainRows.find((row) => row.id === pulledLever?.id);
    setText(plainEcho, pulledRow === undefined ? '' : plainLeverEchoOf(pulledRow));
    setHidden(plainEcho, pulledRow === undefined);
    setText(plainCost, costFunctionLine(current, (id) => shortTermNameOf(id, allIds)));

    const rows = termRowsOf(terms, current, inertTerms(current), state.mode);
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
    const dirty = specIsDirty(current, source);
    setHidden(elements.dirty, !dirty);

    /*
     * **What this editor cannot write about the profile in front of the reader** — issue #113 § 5,
     * and § D227's rule that a control which writes nothing must say so. The note is keyed on the
     * *source* profile rather than on the spec, because the spec has no room for these fields at
     * all: they survive a save by riding on `profileFromSpec`'s `base`, which is exactly why their
     * absence from the panel is invisible without this line.
     */
    const carried = unauthorableBlocksOf(source);
    setText(
      unauthorable,
      carried.length === 0
        ? ''
        : `Carried through unchanged and not editable here: ${carried
            .map((block) => UNAUTHORABLE_COPY[block])
            .join('; ')}. Saving keeps them exactly as they are.`,
    );
    setHidden(unauthorable, carried.length === 0);

    /*
     * The confirmation is about a document that has not moved since. `buildingEditor.ts`'s rule,
     * and for its reason: a green *saved* line still showing after the reader has dragged a weight
     * is a claim about the thing on screen that stopped being true.
     */
    if (confirmedId !== '' && (dirty || state.editingDispatcherId !== confirmedId)) {
      forgetConfirmation();
    }

    /* Rename — the verb this panel did not have. */
    const renameState = renameStateOf(current.name, state.editingDispatcherId, state.savedDispatchers);
    rename.disabled = renameState !== 'ready';
    rename.title = RENAME_COPY[renameState];

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

    /*
     * The result strip — GitHub issue #92, and the whole of what the run verb now owes the reader
     * who stayed here.
     *
     * The pairing is `reportPanel.ts`'s, reached through the exported `reportViewOf` rather than
     * rebuilt: `ReportDeltaView` pairs the two sheets' **published strings** by figure id, takes no
     * difference and states no direction, and it carries its own refusal in `note` — the 50-paired-
     * runs sentence this panel's foot in `index.html` also says. A second implementation here would
     * be a second answer to *what moved* on a run both surfaces are describing.
     */
    const progress = runProgressOf(at);
    const readOut = editorRunReadOutOf(caused, {
      runId: at.recording?.runId,
      playedOut: progress.kind === 'played-out',
      report: state.report,
    });
    const paired =
      readOut === 'paired' && state.report !== undefined && caused?.before !== undefined
        ? reportViewOf(state.report, { kind: 'played-out' }, caused.before).delta
        : null;
    setText(resultPairing, paired === null ? '' : RESULT_PAIRING_LINE);
    setHidden(resultPairing, paired === null);
    fill(
      resultRows,
      ...(paired === null
        ? []
        : /*
           * The identity rows first, then the figures — `reportDeltaOf`'s own order, and the one that
           * matters: a reader has to see that the *seed* moved before they read six figures that
           * moved, or the strip invites them to attribute the change to the weight they dragged.
           *
           * **And each value carries the count it was taken over, when it is a mean** — issue #137,
           * R13 clause one, and this is the surface where it costs most. The Day report draws this
           * same block a scroll above a figure grid that prints `over 1 204 legs in the peak-5min
           * window` under the mean. *This strip has no grid.* It is a caption, these rows and a
           * note, so a mean here is read with nothing around it — which is why the honesty sweep's
           * finding was recorded against both surfaces and why the fix could not be a Day-report-
           * only one.
           *
           * The counts are `ReportDeltaView`'s, decided once in `reportPanel.ts#reportDeltaOf` and
           * drawn here rather than worked out again: two implementations of *what n is this* on one
           * pairing is how the two surfaces come to print different denominators for the same run.
           * One `plate-row` per figure, each count parenthesised beside its own value, so a reader
           * is never asked which of the two counts belongs to which of the two runs.
           */
          [...paired.selection, ...paired.figures].map((row) =>
            plateRow(
              doc,
              row.label,
              `${withCount(row.before, row.beforeCount)}  →  ${withCount(row.after, row.afterCount)}`,
            ),
          )),
    );
    setText(
      resultNote,
      paired === null
        ? // `readOut` is not `paired` here in every case but one: the arm above can still fall to
          // `null` if the report went away between the two reads, and the read-out's own note is the
          // honest thing to print then rather than an empty box.
          runReadOutNoteOf(readOut === 'paired' ? 'unfiled' : readOut, progress)
        : paired.note,
    );

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
