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
import { batchReport, type BatchReport } from '../batch/report.js';
import type { BatchRequest, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';
import type { VizRecording } from '../contract/types.js';
import { briefingFor, type StageBriefing } from '../campaign/brief.js';
import { admitProfile } from '../campaign/dimensions.js';
import {
  evidenceFrom,
  failStateCounts,
  failStateReports,
  type FailStateReport,
} from '../campaign/failStates.js';
import { judgeStage, type StageReport } from '../campaign/judge.js';
import { editableIdsOf } from '../campaign/parse.js';
import {
  batchRequestForStage,
  demonstrationConfigFor,
  stageReplicationSeed,
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
}

export interface CampaignPanelHandle {
  /** Redraw the briefing. Called when the tab is selected. */
  refresh(): void;
}

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
   * The replication this report diagnoses, kept so the mode layer can draw the run-level
   * non-negotiables — the seed, the warnings, the undelivered count — from the same run the floor
   * ids came from. A second recording here would be a second run behind one report.
   */
  let lastDemonstration: VizRecording | undefined;

  for (const [index, stage] of loaded.campaign.stages.entries()) {
    ui.stage.append(new Option(`${String(index + 1)}. ${stage.name}`, stage.id));
  }
  for (const profile of resources.dispatcherProfiles.profiles) {
    ui.profile.append(new Option(profile.id, profile.id));
  }

  function currentStage(): CampaignStage | undefined {
    return loaded.campaign.stages.find((stage) => stage.id === ui.stage.value);
  }

  function profileById(id: string): DispatcherProfile | undefined {
    return resources.dispatcherProfiles.profiles.find((profile) => profile.id === id);
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
    nodes.push(admissionNode(stage));
    return nodes;
  }

  /** What the chosen profile moves, and whether this stage opened it. */
  function admissionNode(stage: CampaignStage): HTMLElement {
    const baseline = profileById(stage.dispatcher.startingProfileId);
    /*
     * The **resolved** dispatcher, so the briefing describes what the candidate arm will actually
     * run. Reading the base profile here drew *"runs the same system on every declared
     * dimension"* beside a weight the player had just moved — found by driving, in the session
     * that first turned the editor on.
     */
    const outcome = candidateProfileFor(stage);
    if (baseline === undefined || !outcome.ok) {
      return row(
        'your setting',
        outcome.ok ? 'no profile selected' : outcome.reason,
        undefined,
        'figure-absent',
      );
    }
    const candidate = outcome.profile;
    const admission = admitProfile(
      loaded.space,
      baseline,
      candidate,
      editableIdsOf(stage.dispatcher.editable, loaded.space.ids),
    );
    return row(
      'your setting',
      admission.sentence,
      admission.admissible
        ? undefined
        : 'A stage names the dimensions it opens so that what it judges is what it offered. Pick a profile that stays inside them, or move to a stage that opens these.',
      admission.admissible ? 'figure-observation' : 'figure-warning',
    );
  }

  /* ------------------------------------------------------------------ *
   * Running
   * ------------------------------------------------------------------ */

  function requestFor(stage: CampaignStage): BatchRequest | undefined {
    const baseline = profileById(stage.dispatcher.startingProfileId);
    if (baseline === undefined) {
      fail('this build’s data/ does not carry one of the two dispatcher profiles this stage needs.');
      return undefined;
    }
    const outcome = candidateProfileFor(stage);
    if (!outcome.ok) {
      fail(outcome.reason);
      return undefined;
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
      return undefined;
    }
    /* One statement of what a stage run is, shared with the suite — see `campaign/stageRun.ts`. */
    return batchRequestForStage(stage, ui.profile.value, editFor(stage));
  }

  function start(): void {
    const stage = currentStage();
    if (stage === undefined) return;
    const request = requestFor(stage);
    if (request === undefined) return;
    ui.error.textContent = '';
    stopWorker();
    ui.output.replaceChildren();

    const total = request.arms.length * request.replications;
    ui.progress.max = total;
    ui.progress.value = 0;
    ui.progress.hidden = false;
    ui.status.textContent = `running ${String(total)} replications — both settings, the same passengers…`;
    setRunning(true);

    const next = new Worker(new URL('./batchWorker.ts', import.meta.url), { type: 'module' });
    worker = next;
    next.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as BatchWorkerMessage;
      if (message.kind === 'progress') {
        ui.progress.value = message.progress.completed;
        ui.status.textContent = `${String(message.progress.completed)} of ${String(message.progress.total)} replications — the page is still yours while this runs.`;
        return;
      }
      setRunning(false);
      ui.progress.hidden = true;
      if (message.kind === 'failed') {
        fail(`the stage could not be run: ${message.message}`);
        stopWorker();
        return;
      }
      const report = batchReport(message.result);
      const published = loaded.published.scenarios.find((entry) => entry.id === stage.id);
      if (published === undefined) {
        fail(`stage "${stage.id}" has no published goal table entry, so nothing can be judged.`);
        stopWorker();
        return;
      }
      const verdict = judgeStage({ stage, published, result: message.result, report });
      ui.status.textContent = `${String(report.replications)} replications per setting in ${(message.result.elapsedMs / 1000).toFixed(1)} s.`;
      draw(stage, verdict, report, failStates(stage, message.result.arms[1]?.replications ?? []));
      stopWorker();
    });
    next.addEventListener('error', (event: ErrorEvent) => {
      setRunning(false);
      ui.progress.hidden = true;
      fail(`the batch worker failed to start: ${event.message}`);
      stopWorker();
    });
    next.postMessage({ kind: 'run', request } satisfies BatchWorkerRequest);
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

  function draw(
    stage: CampaignStage,
    verdict: StageReport,
    report: BatchReport,
    states: readonly FailStateReport[],
  ): void {
    ui.output.replaceChildren();
    ui.output.append(
      row(
        verdict.cleared ? 'stage cleared' : 'stage not cleared',
        verdict.headline,
        // R7, on the results surface as well as the briefing: the seed is text and can be pasted.
        `seed ${verdict.seed} — every one of these ${String(verdict.replications)} runs replays from it. ` +
          `${report.crnSentence}`,
        verdict.cleared ? 'figure-observation' : 'figure-warning',
      ),
    );
    if (report.budgetNote !== null) {
      ui.output.append(row('replication budget', report.budgetNote, undefined, 'figure-warning'));
    }
    for (const goal of verdict.goals) {
      ui.output.append(row(goal.label, goal.sentence, goal.note, goalClass(goal.met)));
    }

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

    ui.output.append(
      row(
        'the measurements behind the verdict',
        `${report.buildingName} · ${String(report.replications)} runs per setting · ${report.demandClause}`,
        `Every arm ran this population: ${report.traceKey}`,
        'figure-observation',
      ),
    );
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
      for (const item of comparison.rows) {
        ui.output.append(
          row(
            item.label,
            item.sentence,
            item.note,
            item.verdict === 'suppressed' || item.verdict === 'unmeasured'
              ? 'figure-suppressed figure-warning'
              : 'figure-observation',
          ),
        );
      }
    }
    /* The stage is on screen; the briefing is redrawn so the goals and their bars stay beside it. */
    void stage;
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
    return disclosureItems({ recording, failStates: states });
  }

  ui.stage.addEventListener('change', () => {
    const stage = currentStage();
    if (stage !== undefined) ui.profile.value = stage.dispatcher.startingProfileId;
    ui.output.replaceChildren();
    ui.error.textContent = '';
    ui.status.textContent = '';
    resetWeights();
    drawBrief();
    drawWeights();
  });
  ui.profile.addEventListener('change', () => {
    ui.error.textContent = '';
    resetWeights();
    drawBrief();
    drawWeights();
  });
  ui.edit.addEventListener('change', () => {
    ui.error.textContent = '';
    if (ui.edit.checked) resetWeights();
    drawWeights();
    drawBrief();
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
    stopWorker();
    setRunning(false);
    ui.progress.hidden = true;
    ui.status.textContent = 'cancelled — a stopped batch has no result, so nothing is reported.';
  });

  const first = loaded.campaign.stages[0];
  if (first !== undefined) {
    ui.stage.value = first.id;
    ui.profile.value = first.dispatcher.startingProfileId;
  }
  setRunning(false);
  ui.progress.hidden = true;
  resetWeights();
  drawBrief();
  drawWeights();

  return {
    refresh: () => {
      drawBrief();
      drawWeights();
    },
  };
}
