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

import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { credentialCapabilityOf } from '../access/dispatcherCredentials.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { batchReport, type BatchReport } from '../batch/report.js';
import type { BatchRequest, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';
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
import { recordRun } from '../record/recordRun.js';
import type { BrowserResources, LoadedCampaign } from './data.js';

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
}

export interface CampaignPanelOptions {
  readonly resources: BrowserResources;
  readonly loaded: LoadedCampaign;
  readonly elements: CampaignPanelElements;
}

export interface CampaignPanelHandle {
  /** Redraw the briefing. Called when the tab is selected. */
  refresh(): void;
}

export function mountCampaignPanel(options: CampaignPanelOptions): CampaignPanelHandle {
  const { resources, loaded, elements: ui } = options;
  const doc = ui.output.ownerDocument;
  let worker: Worker | undefined;

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

  function setRunning(running: boolean): void {
    ui.run.disabled = running;
    ui.cancel.disabled = !running;
    ui.stage.disabled = running;
    ui.profile.disabled = running;
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
    const candidate = profileById(ui.profile.value);
    if (baseline === undefined || candidate === undefined) {
      return row('your setting', 'no profile selected', undefined, 'figure-absent');
    }
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
    const candidate = profileById(ui.profile.value);
    if (baseline === undefined || candidate === undefined) {
      fail('this build’s data/ does not carry one of the two dispatcher profiles this stage needs.');
      return undefined;
    }
    const admission = admitProfile(
      loaded.space,
      baseline,
      candidate,
      editableIdsOf(stage.dispatcher.editable, loaded.space.ids),
    );
    if (!admission.admissible) {
      fail(admission.sentence);
      return undefined;
    }
    /* One statement of what a stage run is, shared with the suite — see `campaign/stageRun.ts`. */
    return batchRequestForStage(stage, candidate.id);
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
    const profile = profileById(ui.profile.value);
    if (building === undefined || profile === undefined) return [];

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
    for (const state of states) {
      ui.output.append(
        row(
          state.state,
          state.frequency,
          `${state.sentence} ${state.diagnosis} ${state.lever}`,
          state.occurredInDemonstration ? 'figure-warning' : 'figure-observation',
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

  ui.stage.addEventListener('change', () => {
    const stage = currentStage();
    if (stage !== undefined) ui.profile.value = stage.dispatcher.startingProfileId;
    ui.output.replaceChildren();
    ui.error.textContent = '';
    ui.status.textContent = '';
    drawBrief();
  });
  ui.profile.addEventListener('change', () => {
    ui.error.textContent = '';
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
  drawBrief();

  return { refresh: drawBrief };
}
