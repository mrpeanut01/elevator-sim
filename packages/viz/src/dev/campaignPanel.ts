/**
 * The Campaign surface — `docs/10-experience-layer-contract.md` § 5, and the named non-test caller
 * of everything in `src/campaign/`.
 *
 * The chain is `dev/main.ts → dev/campaignPanel.ts → dev/batchWorker.ts → batch/runBatch.ts`, with
 * `batch/report.ts`, `campaign/judge.ts` and `campaign/failStates.ts` called back on this thread
 * once the worker returns. **Every verdict on this surface comes from a batch**, which is R2 in
 * the only form that ships: the single-run viewer may say *"in this run, X happened"*, and a
 * scoreboard may not say *"this dispatcher is better"* from one replication.
 *
 * ## Two arms, always
 *
 * The stage's own starting profile is the baseline and the player's choice is the candidate, even
 * when they are the same profile. That is not symmetry for its own sake:
 *
 * - `beat-the-baseline` is a difference between arms and has nothing to be a difference *of*
 *   otherwise;
 * - the count goals' bar is the shipped setting's published count on these seeds, and running that
 *   setting in the same batch is what lets `campaign/judge.ts` check the bar **reproduces** before
 *   judging anybody against it;
 * - an unchanged choice is then W3's own liveness control on a scoreboard: two identical arms, no
 *   row resolved, nothing cleared.
 *
 * **The panel no longer *opens* on that control** ([§ D226](../../../../DECISIONS.md)). It used to,
 * on every stage, because every shipped stage starts on `collective` — so a first-time player's
 * only available action was a run that could not clear the stage and was reported as though they
 * had failed it. `openingProfileFor` picks the smallest admissible change instead, the control is
 * one dropdown click away, and `controlOrVerdictRow` reports it *as a control* when it is run.
 *
 * ## One replication is replayed, and the report says which
 *
 * A fail state's *frequency* comes from the batch. Its *diagnosis* cannot: a batch discards each
 * recording, so no floor id survives the fold. Replication 0 is therefore re-run here, at the seed
 * the batch used — by invariant 5 the identical run — purely so the diagnosis can name a landing.
 * It is 2–229 ms on the shipped buildings, it is labelled *Run 1*, and its seed is printed.
 */

import type { ParameterValue } from '@elevator-sim/experiments/browser';
import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { restrictedFloorIds } from '../access/zoning.js';
import {
  batchLibraryOf,
  SHIPPED_GROUP_LABEL,
  YOURS_GROUP_LABEL,
} from '../batch/library.js';
import { populationLineOf, type BatchReport } from '../batch/report.js';
import type {
  BatchRequest,
  BatchResult,
  BatchWorkerMessage,
  BatchWorkerRequest,
} from '../batch/types.js';
import type { VizRecording } from '../contract/types.js';
import { briefingFor, type StageBriefing } from '../campaign/brief.js';
import { admitProfile, movedDimensions } from '../campaign/dimensions.js';
import {
  evidenceFrom,
  failStateCounts,
  failStateReports,
  type FailStateReport,
} from '../campaign/failStates.js';
import type { StageReport } from '../campaign/judge.js';
import { editableIdsOf } from '../campaign/parse.js';
import { runStageToVerdict, type StageSequenceOutcome } from '../campaign/stageSequence.js';
import {
  demonstrationConfigFor,
  stageReplicationSeed,
  stageSeedSetOf,
  type StageSeedSet,
} from '../campaign/stageRun.js';
import type { CampaignStage } from '../campaign/types.js';
import { applyControlEdit, controlsFor } from '../controls/controls.js';
import {
  resolveEditedProfile,
  valuesFromProfile,
  type EditedVector,
} from '../controls/editedProfile.js';
import { renderControls, valueAtSliderPosition } from '../controls/render.js';
import type { Control, ControlValues } from '../controls/types.js';
import { disclosureItems, rowClassesOf } from '../mode/disclosure.js';
import type { GlossaryTerm } from '../mode/glossary.js';
import { parityRefusal } from '../mode/parity.js';
import { itemsIn, type ViewMode } from '../mode/types.js';
import { recordRun } from '../record/recordRun.js';
import type { BrowserResources, LoadedCampaign } from './data.js';
import { instantiateControlNode } from './parameterForm.js';

export interface CampaignPanelElements {
  readonly stage: HTMLSelectElement;
  readonly profile: HTMLSelectElement;
  readonly run: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
  readonly progress: HTMLProgressElement;
  readonly status: HTMLElement;
  readonly error: HTMLElement;
  readonly brief: HTMLElement;
  readonly output: HTMLElement;
  /** W6 — turn the player's move from a dropdown choice into an edited weight vector. */
  readonly edit: HTMLInputElement;
  readonly weightsBar: HTMLElement;
  readonly weights: HTMLElement;
  readonly weightsStatus: HTMLElement;
  readonly weightsRefusal: HTMLElement;
}

export interface CampaignPanelOptions {
  readonly resources: BrowserResources;
  readonly loaded: LoadedCampaign;
  readonly elements: CampaignPanelElements;
  /**
   * The current view mode — § 4. A getter rather than a value, because the toggle lives in the
   * page header and this panel must read it at draw time rather than at mount time.
   */
  readonly mode: () => ViewMode;
  /**
   * The dispatchers the reader has saved — issues #167 and #228,
   * [§ D443](../../../../DECISIONS.md).
   *
   * A getter for the same reason {@link mode} is one: this panel mounts after an async fetch and
   * lives for the page, while the shelf is authored later and elsewhere. See
   * `dev/batchPanel.ts`'s own field for the full argument.
   */
  readonly savedProfiles: () => readonly DispatcherProfile[];
}

export interface CampaignPanelHandle {
  /** Redraw the briefing. Called when the tab is selected. */
  refresh(): void;
}

/**
 * The two ways a batch ends without a result, as values rather than as messages.
 *
 * Neither is ever shown. `CANCELLED` is the player stopping the run, and the cancel handler has
 * already written a better sentence than a generic one; `RUN_FAILED` is the worker refusing, and
 * `runOneBatch` has already put the worker's own reason on the error line. They exist so that a
 * sequence waiting on a batch can be ended at all — see `abortRun`.
 */
const CANCELLED = Symbol('cancelled');
const RUN_FAILED = Symbol('run-failed');

/**
 * Read one input back as the value its control declares — `dev/parameterForm.ts`'s rule, applied
 * to the second mount of the same controls.
 *
 * Keyed on the control's own `kind` and never on the element's type, so the two cannot disagree
 * about what a control holds. A slider reports a **position** and is converted through the
 * declaration's own scale.
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

export function mountCampaignPanel(options: CampaignPanelOptions): CampaignPanelHandle {
  const { resources, loaded, elements: ui } = options;
  const doc = ui.output.ownerDocument;
  let worker: Worker | undefined;
  /**
   * Which run is the one on screen.
   *
   * Bumped by {@link abortRun}, read once each sequence finishes. A stage spans two batches, so a
   * player who cancels between them and starts again has two sequences alive at once; without
   * this the first one to finish draws, and it is not necessarily the one they are watching.
   */
  let runToken = 0;
  /** How {@link abortRun} settles the batch a terminated worker will never answer. */
  let abandonRun: ((reason: unknown) => void) | undefined;
  /**
   * The replication this report diagnoses, kept so the mode layer can draw the run-level
   * non-negotiables — the seed, the warnings, the undelivered count — from the same run the floor
   * ids came from. A second recording here would be a second run behind one report.
   */
  let lastDemonstration: VizRecording | undefined;

  for (const [index, stage] of loaded.campaign.stages.entries()) {
    ui.stage.append(new Option(`${String(index + 1)}. ${stage.name}`, stage.id));
  }
  fillDispatcherOptions();

  /**
   * `Name (slug)` — see `dev/batchPanel.ts`'s picker for the finding. This list had the same
   * defect: `your setting` offered thirteen raw ids against a rail that names the same thirteen.
   *
   * **And it offered only the thirteen**, which is #167 § 3.1 (4)'s third select and the reason
   * this is a function now: a dispatcher the reader built could not be the setting they took into
   * a stage, on the one surface in the product whose entire subject is *change one thing and see
   * what it does*. Rebuilt on every visit rather than at mount, off the same visibility signal
   * `dev/batchPanel.ts` uses and for the same reason.
   *
   * **The stage's admission is unchanged and is what makes this safe.** `admitProfile` runs against
   * the *resolved* dispatcher in {@link admitted}, so a saved profile that moves a dimension the
   * stage did not open is refused with the dimension named — by the same function and the same
   * sentence a shipped profile gets. Offering the option is not promising it clears; the contract
   * asks for exactly that (*"refused by name, exactly as an edit is today"*).
   */
  function fillDispatcherOptions(): void {
    const saved = options.savedProfiles();
    const chosen = ui.profile.value;
    ui.profile.replaceChildren();
    if (saved.length === 0) {
      for (const profile of resources.dispatcherProfiles.profiles) {
        ui.profile.append(optionFor(profile));
      }
    } else {
      ui.profile.append(groupOf(SHIPPED_GROUP_LABEL, resources.dispatcherProfiles.profiles));
      ui.profile.append(groupOf(YOURS_GROUP_LABEL, saved));
    }
    if ([...ui.profile.options].some((option) => option.value === chosen)) ui.profile.value = chosen;
  }

  function optionFor(profile: DispatcherProfile): HTMLOptionElement {
    return new Option(`${profile.name} (${profile.id})`, profile.id);
  }

  function groupOf(label: string, profiles: readonly DispatcherProfile[]): HTMLOptGroupElement {
    const group = doc.createElement('optgroup');
    group.label = label;
    for (const profile of profiles) group.append(optionFor(profile));
    return group;
  }

  function currentStage(): CampaignStage | undefined {
    return loaded.campaign.stages.find((stage) => stage.id === ui.stage.value);
  }

  /**
   * The profile an id names — **shipped or saved** (issues #167, #228, § D443).
   *
   * Every consumer in this file goes through here: the picker's label, the stage's baseline, the
   * weight editor's starting point, the admission and the candidate the batch runs. Widening this
   * one function is what makes a saved dispatcher a first-class setting rather than an option that
   * draws its own id and then fails; leaving any one caller on the shipped list would have
   * produced a panel that ran the right dispatcher and named the wrong one.
   *
   * The stage's own `startingProfileId` is authored in `data/` and therefore always resolves in the
   * shipped half; nothing here depends on that, which is why there is no second lookup for it.
   */
  function profileById(id: string): DispatcherProfile | undefined {
    return (
      resources.dispatcherProfiles.profiles.find((profile) => profile.id === id) ??
      options.savedProfiles().find((profile) => profile.id === id)
    );
  }

  /** `Nearest car (nearest-car)` — the picker's own form, for the status line beside it. */
  function labelFor(id: string): string {
    const profile = profileById(id);
    return profile === undefined ? id : `${profile.name} (${profile.id})`;
  }

  /**
   * The setting this stage opens on — **and it is no longer the stage's own baseline.**
   *
   * Every one of the ten shipped stages starts on `collective`, and this panel used to select the
   * starting profile as the player's setting too. So the first thing a first-time player could do
   * was run `collective` against `collective`: an hour-long-looking minute of computation on two
   * arms that are the same system, which is **mathematically incapable** of clearing the stage,
   * reported afterwards as *"stage not cleared"* — the same words a genuine failure gets. The one
   * sentence explaining it lived several screens down the left briefing column and read as a
   * tautology (*"'collective' runs the same system as 'collective'"*), so a player who did not
   * read the whole column concluded they had done something wrong, or that the tab was broken.
   *
   * The identical-arms run is still **available** — it is W3's own liveness control, and a reader
   * is entitled to run it — and this panel now reports it *as a control* rather than as a failure.
   * What changed is only what the tab opens on.
   *
   * The choice is **derived, not authored**, on two rules in order:
   *
   * 1. `admitProfile` must admit it. A stage names the dimensions it opens, and a default that
   *    moved one it did not would land the player on a refusal with Run disabled — a worse first
   *    screen than the one this replaces.
   * 2. Of those, the one that moves the **fewest declared dimensions**, ties going to the file's
   *    own order.
   *
   * Rule 2 was added after driving it. File order alone opens stage 1 on `nearest-car`, which
   * differs from `collective` on three dimensions at once and is the weakest dispatcher this
   * project ships — so a player's first Lab run went from an unwinnable *0 of 2* to a winnable
   * *0 of 2*, which is honest and teaches nothing. The smallest admissible change is the
   * instructive one: it is the *change one thing* experiment the whole tab is built around, and on
   * stage 1 it is `eta`, which is `collective` with its one hard constraint dropped.
   *
   * Where no admissible alternative exists the baseline is kept, and the status line says what
   * that means before the player presses anything.
   */
  function openingProfileFor(stage: CampaignStage): string {
    return smallestAdmissibleChange(stage) ?? stage.dispatcher.startingProfileId;
  }

  /**
   * The admissible profile nearest the baseline, or `undefined` when there is none.
   *
   * **Two shipped stages have none**, which the walk over all ten found rather than assumed:
   * `stage-8-the-headline-address` and `stage-10-the-bed-and-the-visitor` open dimension sets that
   * no shipped dispatcher sits inside — stage 8's, for instance, omits
   * `constraints.noDirectionReversal`, which `collective` declares and every alternative moves. On
   * those two the weight editor is not one way to play, it is the **only** way, and the panel says
   * so rather than telling a player to change a setting that cannot be changed.
   */
  function smallestAdmissibleChange(stage: CampaignStage): string | undefined {
    const baseline = profileById(stage.dispatcher.startingProfileId);
    if (baseline === undefined) return undefined;
    const editable = editableIdsOf(stage.dispatcher.editable, loaded.space.ids);
    let best: { readonly id: string; readonly moved: number } | undefined;
    for (const profile of resources.dispatcherProfiles.profiles) {
      if (profile.id === baseline.id) continue;
      if (!admitProfile(loaded.space, baseline, profile, editable).admissible) continue;
      const moved = movedDimensions(loaded.space, baseline, profile).length;
      /* Strictly fewer, so a tie leaves the earlier profile in place — the file's own order. */
      if (best === undefined || moved < best.moved) best = { id: profile.id, moved };
    }
    return best?.id;
  }

  /** What a player can actually do about two identical arms on this stage. */
  function wayOutOf(stage: CampaignStage): string {
    if (smallestAdmissibleChange(stage) !== undefined) {
      return 'Change “your setting” for a stage you can clear.';
    }
    const opened = editableIdsOf(stage.dispatcher.editable, loaded.space.ids).length;
    return (
      `No shipped dispatcher stays inside the ${String(opened)} dimensions this stage opens, so ` +
      'the weight editor is the way to play it: tick “edit the weights”, move one of them, and ' +
      'run that against the baseline.'
    );
  }

  /**
   * What this stage is about to run, at the top of the panel where a player looks first.
   *
   * The briefing column already carries all of this, and carrying it is not the same as it being
   * read: the tester's report is explicit that they did not see the identical-arms sentence until
   * after the run, because it was several screens of dense monospace down. The bar beside the Run
   * button is where a player looks before pressing it.
   */
  function drawIntent(): void {
    const stage = currentStage();
    if (stage === undefined) return;
    const baselineId = stage.dispatcher.startingProfileId;
    if (ui.profile.value === baselineId && !ui.edit.checked) {
      ui.status.textContent =
        `both settings are ${labelFor(baselineId)} — the two arms are the same system, so no ` +
        'measure can separate them and “beat the baseline” cannot be reached however long it ' +
        `runs. That is this surface’s control run, and it is worth doing once. ${wayOutOf(stage)}`;
      return;
    }
    ui.status.textContent =
      `this stage runs its baseline, ${labelFor(baselineId)}, against your setting, ` +
      `${labelFor(ui.profile.value)}${ui.edit.checked ? ', with your weight edits' : ''} — ` +
      'both on the same passengers. Press Run this stage.';
  }

  function fail(text: string): void {
    ui.error.textContent = text;
    ui.error.focus();
  }

  /* ------------------------------------------------------------------ *
   * W6 — the live weight editor
   * ------------------------------------------------------------------ */

  /**
   * The player's point, held whole.
   *
   * Every dimension, gated-off ones included, exactly as `controls/controls.ts` holds them and for
   * its reasons: a disabled control still shows a value beside its reason, and a gate flipped back
   * on restores what the reader last set rather than resetting to the declared default.
   *
   * Rebuilt from the chosen profile whenever the stage or the profile changes, because an edit is
   * *of* a base and a base that moved underneath it is a different edit.
   */
  let weightValues: ControlValues = new Map();
  let weightBaseId = '';

  function editableSetFor(stage: CampaignStage): ReadonlySet<string> {
    return new Set(editableIdsOf(stage.dispatcher.editable, loaded.space.ids));
  }

  /** The controls this stage opens, in the space's own gate order. */
  function editableControls(stage: CampaignStage): readonly Control[] {
    const editable = editableSetFor(stage);
    return controlsFor(loaded.space, weightValues).filter((control) => editable.has(control.id));
  }

  function resetWeights(): void {
    const base = profileById(ui.profile.value);
    weightBaseId = ui.profile.value;
    weightValues = base === undefined ? new Map() : valuesFromProfile(loaded.space, base);
  }

  /**
   * Only what the player moved.
   *
   * A patch rather than the whole point, and the difference is the one `decodeCandidate` draws:
   * *"a candidate that omitted an inactive knob produces a profile that omits it too and the
   * resolver applies its default — which is exactly what 'inactive' means."* Sending all 56 would
   * author every dimension onto the profile and turn *"I moved one weight"* into a diff of
   * everything.
   */
  function editRecord(stage: CampaignStage): Readonly<Record<string, ParameterValue>> {
    const base = profileById(weightBaseId);
    if (base === undefined) return {};
    const origin = valuesFromProfile(loaded.space, base);
    const moved: Record<string, ParameterValue> = {};
    for (const control of editableControls(stage)) {
      const now = weightValues.get(control.id);
      if (now === undefined) continue;
      if (String(origin.get(control.id)) === String(now)) continue;
      moved[control.id] = now;
    }
    return moved;
  }

  /** The player's move, when the checkbox is on and something has actually moved. */
  function editFor(stage: CampaignStage): EditedVector | undefined {
    if (!ui.edit.checked) return undefined;
    const values = editRecord(stage);
    return {
      baseProfileId: weightBaseId,
      profileId: `${weightBaseId}-edited`,
      values,
    };
  }

  /**
   * The dispatcher the candidate arm will run, or the reason it cannot run one.
   *
   * One function, called by the pre-flight *and* by the demonstration replay, so the profile the
   * report diagnoses is the profile the batch ran. `resolveEditedProfile` is the same call
   * `batch/runBatch.ts` makes inside the worker.
   */
  function candidateProfileFor(
    stage: CampaignStage,
  ): { readonly ok: true; readonly profile: DispatcherProfile } | { readonly ok: false; readonly reason: string } {
    const base = profileById(ui.profile.value);
    if (base === undefined) {
      return { ok: false, reason: 'this build’s data/ does not carry the profile you picked.' };
    }
    const edit = editFor(stage);
    if (edit === undefined) return { ok: true, profile: base };
    const resolved = resolveEditedProfile(loaded.space, base, edit);
    return resolved.ok ? { ok: true, profile: resolved.profile } : { ok: false, reason: resolved.reason };
  }

  function drawWeights(): void {
    const stage = currentStage();
    ui.weights.hidden = !ui.edit.checked;
    ui.weightsBar.hidden = !ui.edit.checked;
    ui.weights.replaceChildren();
    if (stage === undefined || !ui.edit.checked) {
      weightsRefused = false;
      ui.run.disabled = false;
      return;
    }
    if (weightBaseId !== ui.profile.value) resetWeights();

    const controls = editableControls(stage);
    ui.weights.append(instantiateControlNode(doc, renderControls(controls)));

    const moved = Object.keys(editRecord(stage)).length;
    const outcome = candidateProfileFor(stage);
    /*
     * The refusal is drawn **here**, at the control, and `Run this stage` is disabled behind it —
     * which is the requirement W6 carries: an edit that produces an invalid profile is refused at
     * the control, not at the simulator. The sentence is `core`'s own, through
     * `SearchSpace.validate`; nothing in this file decides what a runnable dispatcher is.
     */
    ui.weightsRefusal.textContent = outcome.ok ? '' : outcome.reason;
    weightsRefused = !outcome.ok;
    ui.run.disabled = weightsRefused;
    ui.weightsStatus.textContent =
      `${String(controls.length)} of ${String(loaded.space.ids.length)} declared dimensions are ` +
      `open on this stage · ${String(moved)} moved · ` +
      (outcome.ok
        ? 'this vector is authorable and buildable'
        : 'this vector cannot be run — see the refusal beside it');
  }

  /**
   * Whether the weight editor is currently refusing the vector on screen.
   *
   * Held rather than re-derived at each caller, because {@link setRunning} runs **after** a batch
   * finishes and would otherwise re-enable *Run* on a vector the editor had just refused —
   * a refusal that survives until the reader looks away, which is worse than no refusal.
   */
  let weightsRefused = false;

  function setRunning(running: boolean): void {
    ui.run.disabled = running || weightsRefused;
    ui.cancel.disabled = !running;
    ui.stage.disabled = running;
    ui.profile.disabled = running;
    ui.edit.disabled = running;
  }

  function stopWorker(): void {
    worker?.terminate();
    worker = undefined;
  }

  /**
   * End whatever run is in flight, without saying anything about it.
   *
   * A terminated worker sends no message, so the promise `runOneBatch` handed out has to be
   * settled from here or the sequence waiting on it is stranded — which, once a stage takes two
   * batches, means a cancelled first batch would silently prevent every later run from drawing.
   * The caller that cancels writes its own sentence; this only stops the machinery.
   */
  function abortRun(): void {
    runToken += 1;
    const abandon = abandonRun;
    abandonRun = undefined;
    stopWorker();
    abandon?.(CANCELLED);
  }

  /* ------------------------------------------------------------------ *
   * The briefing
   * ------------------------------------------------------------------ */

  function drawBrief(): void {
    ui.brief.replaceChildren();
    const stage = currentStage();
    if (stage === undefined) return;
    const published = loaded.published.scenarios.find((entry) => entry.id === stage.id);
    if (published === undefined) return;

    const briefing = briefingFor({
      stage,
      published,
      dimensionIds: loaded.space.ids,
      dimensionHelp: loaded.dimensionHelp,
    });
    ui.brief.append(...briefNodes(briefing, stage));
  }

  function briefNodes(briefing: StageBriefing, stage: CampaignStage): readonly HTMLElement[] {
    const nodes: HTMLElement[] = [
      row('teaches', briefing.teaches, briefing.sentences.join(' '), 'figure-observation'),
      row('this stage runs', briefing.configuration, briefing.seedNote, 'figure-observation'),
    ];
    for (const goal of briefing.goals) {
      nodes.push(row('goal', goal, undefined, 'figure-observation'));
    }
    /*
     * R12's constants, drawn in the *suppressed* class rather than as goals — because that is what
     * they are. A row saying "50 of 50" beside the goals would read as a win nobody earned.
     */
    for (const fact of briefing.facts) {
      nodes.push(row('about this building', fact, undefined, 'figure-suppressed figure-warning'));
    }
    for (const missing of briefing.withheld) {
      nodes.push(row('not judgeable here', missing, undefined, 'figure-absent'));
    }
    nodes.push(
      row(
        'dials this stage opens',
        `${String(briefing.editable.length)} of ${String(loaded.space.ids.length)} declared dimensions`,
        briefing.editable
          .slice(0, 12)
          .map((dimension) => dimension.id)
          .join(', ') + (briefing.editable.length > 12 ? ', …' : ''),
        'figure-observation',
      ),
    );
    const admission = admissionNode(stage);
    nodes.push(admission.node);
    /*
     * Last, under the sentences that used the words — issue #22, and `dev/batchPanel.ts`'s reason.
     * Both sources are `glossaryFor` over their **own** emitted text, so nothing here lists a term
     * and nothing here can drift from what the briefing actually says.
     */
    nodes.push(...glossaryNodes([...briefing.glossary, ...admission.glossary]));
    return nodes;
  }

  /** What the chosen profile moves, and whether this stage opened it. */
  /**
   * The *your setting* row, **and the words it used** — issue #22.
   *
   * A pair rather than two functions, because the second would have to call `admitProfile` again to
   * find out what the first said: `ProfileAdmission.glossary` is `glossaryFor` over *that*
   * admission's own sentence, so recomputing it means recomputing the sentence, and two calls are
   * two answers to *is this profile admissible* that could disagree on the day the space moves.
   */
  function admissionNode(stage: CampaignStage): {
    readonly node: HTMLElement;
    readonly glossary: readonly GlossaryTerm[];
  } {
    const baseline = profileById(stage.dispatcher.startingProfileId);
    /*
     * The **resolved** dispatcher, so the briefing describes what the candidate arm will actually
     * run. Reading the base profile here drew *"runs the same system on every declared
     * dimension"* beside a weight the player had just moved — found by driving, in the session
     * that first turned the editor on.
     */
    const outcome = candidateProfileFor(stage);
    if (baseline === undefined || !outcome.ok) {
      return {
        node: row(
          'your setting',
          outcome.ok ? 'no profile selected' : outcome.reason,
          undefined,
          'figure-absent',
        ),
        // No admission was computed, so there is no admission text to have used a word. An empty
        // list is the honest answer rather than a `glossaryFor` over a refusal this module wrote.
        glossary: [],
      };
    }
    const candidate = outcome.profile;
    const admission = admitProfile(
      loaded.space,
      baseline,
      candidate,
      editableIdsOf(stage.dispatcher.editable, loaded.space.ids),
    );
    return {
      node: row(
        'your setting',
        admission.sentence,
        admission.admissible
          ? undefined
          : 'A stage names the dimensions it opens so that what it judges is what it offered. Pick a profile that stays inside them, or move to a stage that opens these.',
        admission.admissible ? 'figure-observation' : 'figure-warning',
      ),
      glossary: admission.glossary,
    };
  }

  /**
   * The words a surface used, defined once each — issue #22.
   *
   * ## Three properties, each one a rule this repository already had
   *
   * **The plain language leads; it never replaces.** No row above is touched: every verdict,
   * sentence and refusal is byte-identical to what it was before this block existed, which
   * `campaignPanel.test.ts` asserts by rendering with and without terms and comparing the rest.
   * § D240's rule 3.
   *
   * **The terms are derived, never listed.** `StageBriefing.glossary`, `StageReport.glossary` and
   * `ProfileAdmission.glossary` are each `glossaryFor` over their own emitted text, so a sentence
   * that stops using a word loses its definition on the same commit. This panel adds no list for
   * that to drift from.
   *
   * **It may not become a ranking.** `mode/glossary.ts` sweeps every `plain` for comparative and
   * ordering language; nothing here composes copy, so that sweep is the only way one could arrive.
   *
   * Deduplicated by `id` rather than by object identity: the producers return entries **from**
   * `GLOSSARY_TERMS` by reference, so identity would work today and would fail silently the day one
   * of them maps over them.
   */
  function glossaryNodes(terms: readonly GlossaryTerm[]): readonly HTMLElement[] {
    const seen = new Set<string>();
    const shown = terms.filter((entry) => !seen.has(entry.id) && seen.add(entry.id));
    if (shown.length === 0) return [];
    return [
      row(
        'the words above',
        'What each term on this screen means. Definitions only — nothing here is a result, and ' +
          'nothing here compares two settings.',
        undefined,
        'figure-observation',
      ),
      ...shown.map((entry) => row(entry.term, entry.plain, undefined, 'figure-observation')),
    ];
  }

  /* ------------------------------------------------------------------ *
   * Running
   * ------------------------------------------------------------------ */

  /**
   * Everything that can refuse this stage before a batch starts.
   *
   * It used to return the request as well, which was fine while a stage was one batch. It is not
   * fine now: the requests are built by `campaign/stageSequence.ts` so that the tuning batch and
   * the holdout batch cannot differ in anything but their seed set, and a pre-flight that also
   * built one of them would be the second construction of a request that `campaign/stageRun.ts`
   * exists to prevent.
   */
  function admitted(stage: CampaignStage): boolean {
    /*
     * The shelf, admitted before the stage is — `dev/batchPanel.ts#start`'s argument, placed here
     * because this panel's single gate is `admitted` and a second refusal path would be a second
     * answer to *may this run*.
     */
    const library = batchLibraryOf(resources.dispatcherProfiles, options.savedProfiles());
    if (!library.ok) {
      fail(library.reason);
      return false;
    }
    const baseline = profileById(stage.dispatcher.startingProfileId);
    if (baseline === undefined) {
      fail('this build’s data/ does not carry one of the two dispatcher profiles this stage needs.');
      return false;
    }
    const outcome = candidateProfileFor(stage);
    if (!outcome.ok) {
      fail(outcome.reason);
      return false;
    }
    /*
     * The admission is asked of the **resolved** dispatcher, edited or not. That is the point of
     * routing an edit through a real `DispatcherProfile`: `admitProfile` diffs two systems that
     * will run, so a vector that moves a dimension the stage did not open is refused with the
     * dimension named, by the same function and the same sentence a shipped profile would be.
     */
    const admission = admitProfile(
      loaded.space,
      baseline,
      outcome.profile,
      editableIdsOf(stage.dispatcher.editable, loaded.space.ids),
    );
    if (!admission.admissible) {
      fail(admission.sentence);
      return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * The status line — and it now has two batches to account for
   * ------------------------------------------------------------------ */

  /**
   * What the player is told while a batch runs, and which of the two it is.
   *
   * **A stage takes up to two batches, so the status line has to say so before the first one
   * starts.** A surface that looked identical and took twice as long would be a worse product than
   * the regression this replaced: the player's own model of *Run this stage* is one wait, and a
   * second wait they were not told about reads as a hang. So the tuning line names the second
   * batch as a *condition* — it follows only if every goal is met — rather than promising a run
   * that usually will not happen.
   *
   * The seed sets are named, not described. `judge.ts`'s own sentences print
   * `holdout-20260731 (seed 20260731)`, and a status line that invented a friendlier phrase for the
   * same set would leave a player matching two names for one thing.
   */
  function openingLine(stage: CampaignStage, seedSet: StageSeedSet, total: number): string {
    const seeds = stageSeedSetOf(stage, seedSet);
    if (seedSet === 'tuning') {
      return (
        `running ${String(total)} replications on ${seeds.name} — both settings, the same ` +
        `passengers… If every goal is met here, a second batch of ${String(total)} follows on ` +
        `${stageSeedSetOf(stage, 'holdout').name}, because a stage is cleared on seeds it was not ` +
        'tuned against.'
      );
    }
    return (
      `every goal met on the runs you made — now running ${String(total)} replications on ` +
      `${seeds.name}, seeds this setting was not tuned against. This second batch decides whether ` +
      'the stage is cleared; it adds no figure to the rows you are about to read.'
    );
  }

  function progressLine(
    stage: CampaignStage,
    seedSet: StageSeedSet,
    completed: number,
    total: number,
  ): string {
    const done = `${String(completed)} of ${String(total)} replications on ${stageSeedSetOf(stage, seedSet).name}`;
    return seedSet === 'tuning'
      ? `${done} — the page is still yours while this runs.`
      : `${done} — the second batch, on seeds you could not have tuned against.`;
  }

  /**
   * The timing line, and — when the second batch did not happen — the reason it did not.
   *
   * A player who watched one batch on a surface that told them to expect two is owed the sentence
   * saying which of the two things happened. `verdict.holdout === null` is exactly *the holdout
   * batch was not run*, and it is never *the holdout batch held*.
   */
  function closingLine(stage: CampaignStage, outcome: StageSequenceOutcome, elapsedMs: number): string {
    const per = `${String(outcome.report.replications)} replications per setting`;
    const took = `${(elapsedMs / 1000).toFixed(1)} s`;
    const tuning = stageSeedSetOf(stage, 'tuning').name;
    if (outcome.verdict.holdout === null) {
      return (
        `${per} on ${tuning} in ${took}. The holdout batch was not run: a goal missed on the runs ` +
        'you made cannot be recovered on seeds you did not tune against.'
      );
    }
    return `${per} on ${tuning}, and again on ${stageSeedSetOf(stage, 'holdout').name} — ${took} for both batches.`;
  }

  /**
   * One batch, on one worker, as a promise — so the sequence above it can be written as a
   * sequence rather than as a tree of nested message handlers.
   *
   * Cancellation is the reason the rejection is stored rather than thrown: a terminated worker
   * sends no message, so a promise wired only to the worker's events would never settle and the
   * run after it would never start. {@link abortRun} settles it, and the one rejection value it
   * uses is recognised by the caller so that *cancelled* never reaches the error line.
   */
  function runOneBatch(
    stage: CampaignStage,
    request: BatchRequest,
    seedSet: StageSeedSet,
  ): Promise<BatchResult> {
    return new Promise<BatchResult>((resolve, reject) => {
      const total = request.arms.length * request.replications;
      ui.progress.max = total;
      ui.progress.value = 0;
      ui.progress.hidden = false;
      ui.status.textContent = openingLine(stage, seedSet, total);

      const next = new Worker(new URL('./batchWorker.ts', import.meta.url), { type: 'module' });
      worker = next;
      abandonRun = reject;
      const settle = (): void => {
        abandonRun = undefined;
        stopWorker();
      };
      next.addEventListener('message', (event: MessageEvent) => {
        const message = event.data as BatchWorkerMessage;
        if (message.kind === 'progress') {
          ui.progress.value = message.progress.completed;
          ui.status.textContent = progressLine(
            stage,
            seedSet,
            message.progress.completed,
            message.progress.total,
          );
          return;
        }
        settle();
        if (message.kind === 'failed') {
          fail(`the stage could not be run: ${message.message}`);
          reject(RUN_FAILED);
          return;
        }
        resolve(message.result);
      });
      next.addEventListener('error', (event: ErrorEvent) => {
        settle();
        fail(`the batch worker failed to start: ${event.message}`);
        reject(RUN_FAILED);
      });
      next.postMessage({
        kind: 'run',
        request,
        savedProfiles: options.savedProfiles(),
      } satisfies BatchWorkerRequest);
    });
  }

  function start(): void {
    const stage = currentStage();
    if (stage === undefined) return;
    if (!admitted(stage)) return;
    const published = loaded.published.scenarios.find((entry) => entry.id === stage.id);
    if (published === undefined) {
      fail(`stage "${stage.id}" has no published goal table entry, so nothing can be judged.`);
      return;
    }
    ui.error.textContent = '';
    abortRun();
    ui.output.replaceChildren();
    setRunning(true);
    /*
     * A stage run now spans two batches, so *"is this result still the one on screen?"* is a real
     * question rather than a theoretical one — a player who cancels and starts again while the
     * first sequence is between batches would otherwise be drawn the older verdict.
     */
    const token = ++runToken;
    let elapsedMs = 0;

    void runStageToVerdict({
      stage,
      published,
      candidateProfileId: ui.profile.value,
      edit: editFor(stage),
      run: async (request, seedSet) => {
        const result = await runOneBatch(stage, request, seedSet);
        elapsedMs += result.elapsedMs;
        return result;
      },
    }).then(
      (outcome) => {
        if (token !== runToken) return;
        setRunning(false);
        ui.progress.hidden = true;
        ui.status.textContent = closingLine(stage, outcome, elapsedMs);
        draw(
          stage,
          outcome.verdict,
          outcome.report,
          failStates(stage, outcome.result.arms[1]?.replications ?? []),
        );
      },
      () => {
        /*
         * Both rejection values are already on screen — `runOneBatch` writes the failure to the
         * error line and the cancel handler writes its own status — so there is nothing to say
         * here that would not overwrite a more specific sentence with a vaguer one.
         */
        if (token !== runToken) return;
        setRunning(false);
        ui.progress.hidden = true;
      },
    );
  }

  /**
   * The four fail states: counted over the batch, diagnosed on replication 0 replayed here.
   *
   * The replay is a full `recordRun` on this thread — the recording is what carries the legs, and
   * the legs are what carry the floor and the credential. It is one replication, and the report
   * never lets it stand for the fifty.
   */
  function failStates(
    stage: CampaignStage,
    replications: Parameters<typeof failStateCounts>[0],
  ): readonly FailStateReport[] {
    const counts = failStateCounts(replications);
    const building = resources.buildings.find((candidate) => candidate.id === stage.building);
    /*
     * The **resolved** dispatcher, so an edited vector is diagnosed by the run it actually
     * produced. Replaying the base profile here would put a floor id from a different dispatcher
     * beside a count taken from the fifty, which is the worst version of this seam being open.
     */
    const outcome = candidateProfileFor(stage);
    if (building === undefined || !outcome.ok) return [];
    const profile = outcome.profile;

    const seed = stageReplicationSeed(stage, 0);
    const { recording } = recordRun(
      demonstrationConfigFor({
        stage,
        building,
        dispatcherProfile: profile,
        trafficProfiles: resources.trafficProfiles,
        elevatorSpecs: resources.elevatorSpecs,
        dispatcherProfiles: resources.dispatcherProfiles,
      }),
    );
    lastDemonstration = recording;
    const evidence = evidenceFrom({
      recording,
      replication: 0,
      seed: seed.toString(),
      restrictedFloorIds: restrictedFloorIds(
        building.floors.map((floor) => floor.id),
        building.accessZones,
      ),
      carriesCredential: credentialCapabilityOf(profile).carriesCredential,
    });
    return failStateReports({ stage, counts, evidence, dimensionHelp: loaded.dimensionHelp });
  }

  /* ------------------------------------------------------------------ *
   * Drawing — the same `.figure` vocabulary as the run summary and the Compare tab
   * ------------------------------------------------------------------ */

  function row(label: string, value: string, note: string | undefined, cls: string): HTMLElement {
    const node = doc.createElement('div');
    node.className = `figure ${cls}`;
    const labelNode = doc.createElement('span');
    labelNode.className = 'figure-label';
    labelNode.textContent = `${label} `;
    const valueNode = doc.createElement('span');
    valueNode.className = 'figure-value';
    valueNode.textContent = value;
    node.append(labelNode, valueNode);
    if (note !== undefined && note !== '') {
      const noteNode = doc.createElement('p');
      noteNode.className = 'figure-note';
      noteNode.textContent = note;
      node.append(noteNode);
    }
    return node;
  }

  /** A goal's class from what it is, never from whether the reader would like it. */
  function goalClass(met: boolean | null): string {
    if (met === null) return 'figure-absent';
    return met ? 'figure-observation' : 'figure-warning';
  }

  /**
   * The headline row — **and a run of a setting against itself is reported as the control it is.**
   *
   * `judgeStage` is untouched and its verdict is unchanged: a stage whose goals were not reached
   * was not cleared, and this row still prints `verdict.headline` verbatim, so nothing is softened
   * and nothing is hidden. What changes is the **label a player reads first**. *"Stage not
   * cleared"* over two arms that are the same system tells a player they failed at something no
   * configuration of theirs could have passed, and that is a false thing to teach even though
   * every word in the sentence is true.
   *
   * The identical case is detected on the **resolved** ids, so an edited `collective` against
   * shipped `collective` is correctly two settings rather than one — `runBatch` puts the resolved
   * profile's id on the arm for that reason.
   *
   * And the control is **read**, not assumed. Two identical arms see identical passengers and
   * produce identical numbers, so every paired difference is exactly zero and no row may exclude
   * it. A row that did would mean the arms did not share a trace or the run is not deterministic —
   * a failure of the apparatus, not of the player — so it is said in those words rather than
   * quietly rendered as a win.
   */
  function controlOrVerdictRow(
    stage: CampaignStage,
    verdict: StageReport,
    report: BatchReport,
  ): HTMLElement {
    const provenance =
      `seed ${verdict.seed} — every one of these ${String(verdict.replications)} runs replays ` +
      `from it. ${report.crnSentence}`;
    const ids = new Set(report.arms.map((arm) => arm.dispatcherProfileId));
    if (report.arms.length < 2 || ids.size > 1) {
      return row(
        verdict.cleared ? 'stage cleared' : 'stage not cleared',
        verdict.headline,
        provenance,
        verdict.cleared ? 'figure-observation' : 'figure-warning',
      );
    }
    const separated = report.comparisons
      .flatMap((comparison) => comparison.rows)
      .filter((item) => item.verdict === 'resolved' || item.verdict === 'under-budget');
    const name = report.arms[0]?.dispatcherProfileName ?? '';
    if (separated.length > 0) {
      return row(
        'the control did not hold — report this',
        `Both arms ran ${name}, so every paired difference should have been exactly zero, and ` +
          `${String(separated.length)} of the measures below came back with an interval that ` +
          'excludes it. Two identical settings cannot differ unless the two arms saw different ' +
          `passengers or a run is not reproducible. ${verdict.headline}`,
        provenance,
        'figure-suppressed figure-warning',
      );
    }
    return row(
      'control run — the two settings are the same',
      `Both arms ran ${name}. They are identical by construction, so no measure can separate ` +
        'them and “beat the baseline” is unreachable here however long it runs — this is not a ' +
        'stage you failed, it is the check this surface is built to survive, and it held. ' +
        `${verdict.headline} ${wayOutOf(stage)}`,
      provenance,
      'figure-observation',
    );
  }

  /**
   * The goals, twice, with the batch each answer came from on the row that carries it.
   *
   * **The two batches are not interchangeable and this is where a surface could imply they are.**
   * `judgeStage`'s `goals` are the **tuning** batch — the runs the player made — and they are what
   * every goal row's sentence has always been, deliberately: feedback a player cannot see is not
   * feedback, and a stage refused on a count they can go and look at is a stage they can play
   * again. `holdout.goals` are the same goals over a sample they could not have tuned against, and
   * they decide `cleared` and nothing else. Printing the two lists one after another with the same
   * labels would be the confusion the whole split exists to prevent, so each list gets a caption
   * naming its seed set and every holdout row carries the set on its own label — a reader who
   * scrolled past the caption still knows which runs they are reading about.
   *
   * The holdout half is drawn whether it held or not. Drawing it only when it refused would report
   * the unflattering half of a measurement and hide the other, which is the shape this repository
   * refuses everywhere else; and a player who cleared a stage is owed the evidence that they
   * cleared it on runs they had never seen.
   */
  function seedSetBlocks(stage: CampaignStage, verdict: StageReport): readonly HTMLElement[] {
    const tuning = stageSeedSetOf(stage, 'tuning');
    const holdoutSeeds = stageSeedSetOf(stage, 'holdout');
    const nodes: HTMLElement[] = [
      row(
        'the runs you made',
        `${String(verdict.goals.length)} goals, judged on ${tuning.name} (seed ${tuning.seed}) — ` +
          'the seeds this setting was tuned against, and the batch every row below is about.',
        'These are the counts to play against: a goal missed here is one you can go and look at. ' +
          'Meeting all of them is half of clearing the stage.',
        'figure-observation',
      ),
      ...verdict.goals.map((goal) => row(goal.label, goal.sentence, goal.note, goalClass(goal.met))),
    ];

    const holdout = verdict.holdout;
    if (holdout === null) {
      nodes.push(
        row(
          'the holdout seeds — not run',
          `${holdoutSeeds.name} (seed ${holdoutSeeds.seed}) was not run, because a goal missed on ` +
            'the runs above cannot be recovered on seeds this setting was not tuned against. A ' +
            'stage is cleared on both batches or on neither, and nothing here was measured about ' +
            'this one.',
          undefined,
          'figure-absent',
        ),
      );
      return nodes;
    }

    nodes.push(
      row(
        holdout.held ? 'the runs you could not tune against' : 'the runs you could not tune against — refused',
        holdout.sentence,
        `A second batch of the same two settings over ${holdout.seedSetName}, run after the batch ` +
          'above met every goal. It decides whether the stage is cleared and it changes no figure ' +
          'above it: every row up to here is the batch you ran.',
        holdout.held ? 'figure-observation' : 'figure-warning',
      ),
      ...holdout.goals.map((goal) =>
        row(
          `${goal.label} · on ${holdout.seedSetName}`,
          goal.sentence,
          goal.note,
          goalClass(goal.met),
        ),
      ),
    );
    return nodes;
  }

  function draw(
    stage: CampaignStage,
    verdict: StageReport,
    report: BatchReport,
    states: readonly FailStateReport[],
  ): void {
    ui.output.replaceChildren();
    ui.output.append(controlOrVerdictRow(stage, verdict, report));
    if (report.budgetNote !== null) {
      ui.output.append(row('replication budget', report.budgetNote, undefined, 'figure-warning'));
    }
    ui.output.append(...seedSetBlocks(stage, verdict));

    ui.output.append(
      row(
        'what went wrong, and how often',
        `The counts are over all ${String(verdict.replications)} runs. The floors and credentials ` +
          'below are from one of them, replayed so it could be named.',
        undefined,
        'figure-observation',
      ),
    );
    /*
     * § 4 — the fail states go through the mode layer, and the parity check runs on exactly the
     * items this panel is about to mount. A Basic mode that dropped one of them puts its own
     * refusal on screen rather than silently drawing three rows where there were four.
     */
    const items = failStateDisclosure(states);
    const refusal = parityRefusal(items);
    if (refusal !== undefined) {
      ui.output.append(row('mode parity', refusal, undefined, 'figure-warning'));
    }
    for (const item of itemsIn(items, options.mode())) {
      ui.output.append(
        row(
          item.label,
          item.rendering.value,
          item.rendering.note,
          rowClassesOf(item, item.rendering).filter((name) => name !== 'figure').join(' '),
        ),
      );
    }

    // The population in words, the exact key on the row's `title` — `docs/20` defect 9, and
    // `batch/report.ts#populationLineOf` for why the key is kept rather than dropped.
    const measurementsRow = row(
      'the measurements behind the verdict',
      `${report.buildingName} · ${String(report.replications)} runs per setting · ${report.demandClause}`,
      `Every arm ran this population: ${populationLineOf(report.traceKey, { buildingName: report.buildingName })}.`,
      'figure-observation',
    );
    measurementsRow.title = report.traceKey;
    ui.output.append(measurementsRow);
    for (const arm of report.arms) {
      ui.output.append(
        row(
          `setting ${arm.armId}`,
          arm.sentence,
          arm.reasons[0],
          arm.quotable === arm.n ? 'figure-observation' : 'figure-warning',
        ),
      );
    }
    for (const comparison of report.comparisons) {
      /*
       * **The same explanation once, and the next step named** — `dev/batchPanel.ts`'s finding,
       * and this surface draws the same rows so it had the same wall of text: three suppressed
       * estimate rows, each carrying a byte-identical 624-character paragraph. R3 requires the
       * reason; it does not require it three times. The dedupe is on exact equality, so two rows
       * whose notes merely resemble each other keep both.
       */
      const seen = new Map<string, string>();
      for (const item of comparison.rows) {
        const first = seen.get(item.note);
        if (first === undefined && item.note !== '') seen.set(item.note, item.label);
        ui.output.append(
          row(
            item.label,
            item.sentence,
            first === undefined ? item.note : `The same reason as “${first}” above, in the same words.`,
            item.verdict === 'suppressed' || item.verdict === 'unmeasured'
              ? 'figure-suppressed figure-warning'
              : 'figure-observation',
          ),
        );
      }
      if (comparison.summary.remedy !== null) {
        ui.output.append(
          row('what would move it', comparison.summary.remedy, undefined, 'figure-warning'),
        );
      }
    }
    // The stage's own verdict words and the batch report's, in one block — issue #22. One screen,
    // one vocabulary; `judge.ts` already notes that the two lists overlap and both are derived.
    ui.output.append(...glossaryNodes([...verdict.glossary, ...report.glossary]));
  }

  /**
   * The fail-state reports as mode items.
   *
   * A synthetic recording is **not** built here: `disclosureItems` takes the fail states beside a
   * recording, and the campaign's own recording is the demonstration replay. Passing the reports
   * alone would need a recording anyway, so the panel hands over the one it already replayed —
   * which is also what makes the run-level non-negotiables (the seed, the warnings, the
   * undelivered count) appear on this surface without a second implementation of them.
   */
  function failStateDisclosure(states: readonly FailStateReport[]) {
    const recording = lastDemonstration;
    if (recording === undefined) return [];
    /*
     * `dispatcherName` is handed over because this panel **has** it. `DisclosureInput` says the
     * field is optional *"because a `VizRecording` carries the id and nothing else — a recording
     * loaded from a file has no `data/` beside it"*, and that is not this caller's situation: the
     * stage resolved a real `DispatcherProfile` to run the batch. Without it the run-identity row
     * read `Garden Apartments · nearest-car` in Basic mode — the slug, on the one surface § 4 says
     * replaces it with the display name.
     */
    const stage = currentStage();
    const outcome = stage === undefined ? undefined : candidateProfileFor(stage);
    return disclosureItems({
      recording,
      failStates: states,
      ...(outcome?.ok === true ? { dispatcherName: outcome.profile.name } : {}),
    });
  }

  ui.stage.addEventListener('change', () => {
    const stage = currentStage();
    if (stage !== undefined) ui.profile.value = openingProfileFor(stage);
    ui.output.replaceChildren();
    ui.error.textContent = '';
    resetWeights();
    drawBrief();
    drawWeights();
    drawIntent();
  });
  ui.profile.addEventListener('change', () => {
    ui.error.textContent = '';
    resetWeights();
    drawBrief();
    drawWeights();
    drawIntent();
  });
  ui.edit.addEventListener('change', () => {
    ui.error.textContent = '';
    if (ui.edit.checked) resetWeights();
    drawWeights();
    drawBrief();
    drawIntent();
  });
  /*
   * One route from an input back to the model, exactly as `dev/parameterForm.ts` has: the value is
   * read through the control's own `kind`, written through `applyControlEdit`, and the form is
   * redrawn either way — on acceptance because a gate may have cascaded, on refusal because the
   * input has to go back to what the model holds rather than keeping what was refused.
   */
  ui.weights.addEventListener('change', (event) => {
    const stage = currentStage();
    if (stage === undefined) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
    const id = target.dataset['parameter'];
    if (id === undefined) return;
    const control = editableControls(stage).find((candidate) => candidate.id === id);
    if (control === undefined) return;
    const edit = applyControlEdit(loaded.space, weightValues, id, valueFrom(control, target));
    if (edit.accepted) {
      weightValues = edit.values;
      ui.weightsRefusal.textContent = '';
    } else {
      ui.weightsRefusal.textContent = edit.reason;
    }
    drawWeights();
    drawBrief();
  });
  ui.run.addEventListener('click', start);
  ui.cancel.addEventListener('click', () => {
    abortRun();
    setRunning(false);
    ui.progress.hidden = true;
    ui.status.textContent = 'cancelled — a stopped batch has no result, so nothing is reported.';
  });

  const first = loaded.campaign.stages[0];
  if (first !== undefined) {
    ui.stage.value = first.id;
    ui.profile.value = openingProfileFor(first);
  }
  setRunning(false);
  ui.progress.hidden = true;
  resetWeights();
  drawBrief();
  drawWeights();
  drawIntent();

  /*
   * **The setting picker is refilled every time this tab is shown**, off the panel's own `hidden`
   * attribute — `dev/batchPanel.ts`'s observer, third application, and here it is the *only*
   * caller available: `dev/main.ts` assigns this handle to a variable and never reads it, so
   * {@link CampaignPanelHandle.refresh} has no non-test caller at all. Hanging the refill on that
   * handle would have been CLAUDE.md's standing requirement broken inside the fix for a defect of
   * the same class. The stale handle is reported rather than repaired here; it belongs to whoever
   * owns `dev/main.ts`'s tab wiring.
   */
  const panel = ui.output.closest('[role="tabpanel"]');
  if (panel !== null && typeof MutationObserver === 'function') {
    const observer = new MutationObserver(() => {
      if (!panel.hasAttribute('hidden')) fillDispatcherOptions();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }

  return {
    refresh: () => {
      fillDispatcherOptions();
      drawBrief();
      drawWeights();
      /* Only while nothing is on screen: a finished run's timing line is not to be overwritten. */
      if (ui.output.childElementCount === 0) drawIntent();
    },
  };
}
