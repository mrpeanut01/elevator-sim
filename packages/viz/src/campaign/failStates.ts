/**
 * § 5.3's four fail states: a plain sentence, a one-line diagnosis naming the floor or the
 * credential, and a suggested lever drawn from the stage's own editable dimensions.
 *
 * ## Why a fail state is counted over a batch and diagnosed on one run
 *
 * **R2** and **M7**. *"Secure Tower under `collective`, 20 consecutive seeds — 6 of 20
 * replications return a quotable AWT and 4 of 20 are diagnosed saturated. The same
 * configuration."* A fail state read off one run is that coin flip; a fail state read off fifty is
 * a frequency. So *how often* comes from the batch.
 *
 * *Where* cannot. A `BatchReplication` is a folded summary — it carries `saturated`, the service
 * level and the status, and no floor, because W3 discards the recording deliberately (*"a batch of
 * 200 replications of Vertical City would be hundreds of megabytes of `VizRecording`"*). So the
 * diagnosis is taken from **one replication of the same batch, replayed** — replication 0, at the
 * seed the batch used, which by invariant 5 is the identical run. The report says which run it is
 * and prints its seed (**R7**); it never presents the one run's floors as a property of the fifty.
 *
 * ## Locked out is the one the batch cannot count, and it says so
 *
 * `lockedOutLandingsAt` needs `VizLeg.credentialGroup`, which lives on the recording, not on the
 * fold. The frequency line for `locked-out` is therefore a **refusal with its reason** (**R3**),
 * not a zero — the same shape `data/scenario-goals.json` uses for `everyone-can-get-there`, and for
 * the same underlying reason.
 *
 * ## The lever is a hint and never an answer
 *
 * § 5.3: *"The lever is a hint, never an automatic fix, and never phrased as 'the right answer' —
 * there is a Pareto front here, not an optimum."* Every lever sentence ends by saying so, and the
 * text of the dial comes from the schema's **own** `description`, so a hint cannot drift from what
 * the dial does. One case has no lever at all and says that instead: riders carrying no credential
 * are not reachable by any dispatcher dimension
 * ([§ D159](../../../../DECISIONS.md), correction 2).
 */

import type { LockedOutLanding } from '../access/lockedOut.js';
import { lockedOutLandingsAt } from '../access/lockedOut.js';
import type { BatchReplication } from '../batch/types.js';
import type { VizRecording } from '../contract/types.js';
import { queueAt } from '../frame/overlay.js';
import { FAIL_STATES, type CampaignStage, type FailState } from './types.js';
import { playerSafeDescription } from './words.js';

/* -------------------------------------------------------------------------- *
 * How often — over the batch
 * -------------------------------------------------------------------------- */

/** One fail state's frequency over a batch arm. `runs` is `null` when the batch cannot see it. */
export interface FailStateCount {
  readonly state: FailState;
  readonly runs: number | null;
  readonly n: number;
  /** Runs on which the quantity was never measured. Never folded into `runs`. */
  readonly unmeasured: number;
}

/**
 * Count the three batch-visible fail states over one arm.
 *
 * Reads `saturated`, `serviceLevelVerdict`, `status` and `unservedFraction` — all copied from each
 * run's own summary by `runBatch` and never recomputed here (**R9**). Not one of R1's three
 * estimate fields is touched, which is why these counts are available on all sixty shipped cells
 * and a mean is available on fourteen (**M1**).
 */
export function failStateCounts(
  replications: readonly BatchReplication[],
): readonly FailStateCount[] {
  const n = replications.length;
  let overwhelmed = 0;
  let abandoned = 0;
  let stranded = 0;
  let strandedUnmeasured = 0;

  for (const replication of replications) {
    if (replication.saturated) overwhelmed += 1;
    if (replication.serviceLevelVerdict === 'starved') abandoned += 1;
    const unserved = replication.metrics.unservedFraction;
    if (replication.status !== 'timed-out') continue;
    /*
     * *"`status === 'timed-out'` with `undelivered > 0`"* — R4's own predicate, through the
     * fraction the batch carries. A `null` is **not** a zero: the run never measured how many
     * people were left, so it is counted as unmeasured and stated separately rather than being
     * quietly scored as a run in which nobody was stranded.
     */
    if (unserved === null) strandedUnmeasured += 1;
    else if (unserved > 0) stranded += 1;
  }

  return [
    { state: 'overwhelmed', runs: overwhelmed, n, unmeasured: 0 },
    { state: 'abandoned', runs: abandoned, n, unmeasured: 0 },
    { state: 'stranded', runs: stranded, n, unmeasured: strandedUnmeasured },
    { state: 'locked-out', runs: null, n, unmeasured: 0 },
  ];
}

/* -------------------------------------------------------------------------- *
 * Where — from one replayed replication
 * -------------------------------------------------------------------------- */

/** A landing named in a diagnosis, at the sampled instant it looked worst. */
export interface NamedLanding {
  readonly floorId: string;
  readonly people: number;
  readonly oldestWaitS: number;
  /** Simulated seconds. `0` for a fact about the whole run rather than about an instant. */
  readonly atS: number;
}

/**
 * How often the run is sampled for the *worst* moment at each landing.
 *
 * **Not `endedAt`, and this is a finding rather than a preference.** Measured on this campaign's
 * own stage 3 — Midtown Office at its shipped demand, replication 0 of seed 20260730 — the run is
 * `saturated: true` with `undelivered: 0`, and it **ends at 1 883 s with the building empty**: the
 * queues grew enormously inside the 900 s demand horizon and drained afterwards. A diagnosis taken
 * at `endedAt` therefore reported *"nobody was still standing at the end"* about a run the summary
 * calls saturated, which is CLAUDE.md's own warning — *"neither sees a queue that grew enormously
 * and drained just in time"* — arriving on a screen.
 *
 * 15 s is **M5**'s own cadence, so the deepest queue this reports is comparable with the 175 and
 * 379 that measurement published. `queueAt` is linear in the leg count, so a 900 s run of Vertical
 * City is roughly 125 × 3 222 leg visits — well inside a click. (3 222 predates `vertical-city`'s
 * ground-lobby escalator, which removed about 8 % of that building's lift legs; the bound is an
 * over-estimate now, which is the direction a headroom claim may safely be wrong in.)
 */
export const DIAGNOSIS_SAMPLE_EVERY_S = 15;

/** What one replayed replication can say about *where* a fail state happened. */
export interface DemonstrationEvidence {
  /** The replication this is, and its seed. R7: printed, copyable, and it replays this exactly. */
  readonly replication: number;
  readonly seed: string;
  readonly saturated: boolean;
  readonly starved: boolean;
  readonly timedOut: boolean;
  /** Legs that arrived and never boarded, by origin floor, in the building's own floor order. */
  readonly strandedLandings: readonly NamedLanding[];
  /** Floors still queued at the end, deepest first. */
  readonly deepestLandings: readonly NamedLanding[];
  /** Floors where somebody is past the abandonment horizon at the end. */
  readonly abandonedLandings: readonly NamedLanding[];
  readonly lockedOut: readonly LockedOutLanding[];
}

export interface EvidenceInput {
  readonly recording: VizRecording;
  readonly replication: number;
  readonly seed: string;
  /** Floors inside an access zone. Empty means *"this caller does not know"* — `lockedOut.ts`. */
  readonly restrictedFloorIds: readonly string[];
  readonly carriesCredential: boolean;
}

/**
 * Read one finished recording for the floors and credentials a diagnosis names.
 *
 * **R6**: goals and fail states are evaluated from the *finished* recording, never from a frame —
 * *"`recordRun` returns a complete recording before the first frame is drawn; there is no live
 * simulation to be surprised by."* Everything below is taken at `endedAt`.
 */
export function evidenceFrom(input: EvidenceInput): DemonstrationEvidence {
  const { recording } = input;

  /** Per floor, the worst it ever looked, and when. See {@link DIAGNOSIS_SAMPLE_EVERY_S}. */
  const deepest = new Map<string, NamedLanding>();
  const abandoned = new Map<string, NamedLanding>();
  for (const t of sampleInstants(recording.startedAt, recording.endedAt)) {
    for (const queue of queueAt(recording, t)) {
      const landing: NamedLanding = {
        floorId: queue.floorId,
        people: queue.total,
        oldestWaitS: queue.oldestWaitS,
        atS: t,
      };
      const seen = deepest.get(queue.floorId);
      if (seen === undefined || landing.people > seen.people) deepest.set(queue.floorId, landing);
      if (queue.worstBand !== 'abandoned') continue;
      const worst = abandoned.get(queue.floorId);
      if (worst === undefined || landing.oldestWaitS > worst.oldestWaitS) {
        abandoned.set(queue.floorId, landing);
      }
    }
  }

  const floorOrder = recording.floors.map((floor) => floor.id);
  const strandedByFloor = new Map<string, number>();
  for (const leg of recording.legs) {
    if (leg.boardedAt !== undefined) continue;
    strandedByFloor.set(leg.originFloorId, (strandedByFloor.get(leg.originFloorId) ?? 0) + 1);
  }

  return {
    replication: input.replication,
    seed: input.seed,
    saturated: recording.summary.saturated,
    starved: recording.summary.serviceLevel.verdict === 'starved',
    timedOut: recording.status === 'timed-out',
    strandedLandings: floorOrder
      .filter((floorId) => (strandedByFloor.get(floorId) ?? 0) > 0)
      .map((floorId) => ({
        floorId,
        people: strandedByFloor.get(floorId) ?? 0,
        oldestWaitS: deepest.get(floorId)?.oldestWaitS ?? 0,
        atS: 0,
      })),
    deepestLandings: [...deepest.values()].sort((a, b) => b.people - a.people),
    /* Floor order, not wait order: a list of floors is read against the building. */
    abandonedLandings: floorOrder
      .map((floorId) => abandoned.get(floorId))
      .filter((landing): landing is NamedLanding => landing !== undefined),
    lockedOut: lockedOutLandingsAt({
      recording,
      /*
       * At the end, and here that is right: a locked-out leg is one that **never** boarded and
       * never got a car, so it is present at every instant after it arrived and the last one sees
       * all of them.
       */
      at: recording.endedAt,
      restrictedFloorIds: input.restrictedFloorIds,
      carriesCredential: input.carriesCredential,
    }),
  };
}

function sampleInstants(startedAt: number, endedAt: number): readonly number[] {
  const instants: number[] = [];
  for (let t = startedAt; t < endedAt; t += DIAGNOSIS_SAMPLE_EVERY_S) instants.push(t);
  instants.push(endedAt);
  return instants;
}

/* -------------------------------------------------------------------------- *
 * The report
 * -------------------------------------------------------------------------- */

export interface FailStateReport {
  readonly state: FailState;
  /** Whether the replayed replication exhibited it. A fact about one run — R2. */
  readonly occurredInDemonstration: boolean;
  /** *"In 50 runs, 43 …"*, or the refusal and its reason. R10, R13. */
  readonly frequency: string;
  /** What it means, in plain language. */
  readonly sentence: string;
  /** One line, naming the floor or the credential, from the replayed run. */
  readonly diagnosis: string;
  /** The hint, or the statement that no dial reaches this. Never *"the right answer"*. */
  readonly lever: string;
}

/**
 * What each state **means**, phrased as a definition rather than as a claim.
 *
 * Found by driving, not by a test. The first draft read *"The queues never stopped growing."* — a
 * true sentence about a run that was Overwhelmed, and an assertion about a run that was not, drawn
 * identically on a row whose own count said **0 of 50**. A row that explains a failure and a row
 * that reports one must not read the same, and the cheapest way to get that right is for the
 * explanation never to be in the indicative in the first place.
 */
const PLAIN: Readonly<Record<FailState, string>> = {
  overwhelmed:
    'Overwhelmed means the queues never stopped growing: more people arrived than the building ' +
    'could carry, and a run in that state has no meaningful average wait, so none is shown for it.',
  abandoned:
    'Abandoned means somebody was still waiting when the run gave up on them. A wait past the ' +
    'abandonment horizon is a person who, in a real building, would have taken the stairs or gone ' +
    'home.',
  stranded:
    'Stranded means the run ended with people still in the system: they arrived, they called, and ' +
    'no car ever carried them.',
  'locked-out':
    'Locked out means a call was registered that no car may legally answer. It is not congestion: ' +
    'the credential the rider holds is not one the dispatcher can read, or the rider holds none ' +
    'at all.',
};

export interface FailStateReportInput {
  readonly stage: CampaignStage;
  readonly counts: readonly FailStateCount[];
  readonly evidence: DemonstrationEvidence;
  /**
   * `SearchParameter.description` by dimension id, so a hint says what the dial does in the
   * schema's own words. A dimension with no help text is still named; it just says less.
   */
  readonly dimensionHelp: ReadonlyMap<string, string>;
}

/** All four states, in R4's order of preference, whether or not they occurred. */
export function failStateReports(input: FailStateReportInput): readonly FailStateReport[] {
  const byState = new Map(input.counts.map((count) => [count.state, count]));
  return FAIL_STATES.map((state) => {
    const count = byState.get(state);
    const inDemonstration = occurred(state, input.evidence);
    /*
     * The hint is attached only where the state actually arose — in the replayed run or in any of
     * the batch's runs. Suggesting a dial for a failure that did not happen is not honest advice,
     * it is furniture, and § 5.3's *"a hint, never an answer"* is weakened by every place it is
     * printed with nothing to be a hint about.
     */
    const arose = inDemonstration || (count?.runs ?? 0) > 0;
    /*
     * The one exception, and it is not a hint: where the stage declares **no** lever, the text is
     * the statement that the state cannot arise on this building at all. That is worth reading
     * whether or not it happened, and it is the sentence a player needs in order not to go looking
     * for a credential dial on a building with no credentials.
     */
    const declaresNoLever = input.stage.levers[state] === null;
    return {
      state,
      occurredInDemonstration: inDemonstration,
      frequency: frequencyOf(state, count),
      sentence: PLAIN[state],
      diagnosis: diagnose(state, input.evidence),
      lever: arose || declaresNoLever ? leverText(state, input) : '',
    };
  });
}

function occurred(state: FailState, evidence: DemonstrationEvidence): boolean {
  switch (state) {
    case 'overwhelmed':
      return evidence.saturated;
    case 'abandoned':
      return evidence.starved;
    case 'stranded':
      return evidence.timedOut && evidence.strandedLandings.length > 0;
    case 'locked-out':
      return evidence.lockedOut.length > 0;
  }
}

/** A frequency over runs with its real denominator — R10 and R13 clause two. */
function frequencyOf(state: FailState, count: FailStateCount | undefined): string {
  if (count === undefined) return 'this batch reported nothing about it.';
  if (count.runs === null) {
    return (
      `no count. A batch keeps each run's summary and discards its recording, and whether a call ` +
      'was locked out is a fact about the legs. It is diagnosed on the replayed run below and ' +
      'nowhere else — the number is missing, and this is what is there instead of it.'
    );
  }
  const tail =
    count.unmeasured > 0
      ? ` ${String(count.unmeasured)} more ended with people still in the system and never ` +
        'measured how many, so they are not counted either way.'
      : '';
  return `in ${String(count.n)} runs, ${String(count.runs)} ended this way.${tail}`;
}

function diagnose(state: FailState, evidence: DemonstrationEvidence): string {
  const run = `Run ${String(evidence.replication + 1)}, seed ${evidence.seed}`;
  switch (state) {
    case 'overwhelmed': {
      const worst = evidence.deepestLandings[0];
      if (worst === undefined) return `${run}: no landing ever had anybody standing at it.`;
      return (
        `${run}: the deepest landing was ${worst.floorId}, with ${String(worst.people)} people on ` +
        `it ${worst.atS.toFixed(0)} s into the run and the oldest of them ` +
        `${worst.oldestWaitS.toFixed(0)} s into their wait.`
      );
    }
    case 'abandoned': {
      const floors = evidence.abandonedLandings;
      if (floors.length === 0) return `${run}: nobody passed the abandonment horizon.`;
      const named = floors
        .map(
          (landing) =>
            `${landing.floorId} (${landing.oldestWaitS.toFixed(0)} s, at ${landing.atS.toFixed(0)} s)`,
        )
        .join(', ');
      return `${run}: somebody was past the horizon at ${named}.`;
    }
    case 'stranded': {
      const floors = evidence.strandedLandings;
      if (floors.length === 0) return `${run}: everybody who called was carried.`;
      const total = floors.reduce((sum, landing) => sum + landing.people, 0);
      const named = floors
        .slice(0, 4)
        .map((landing) => `${landing.floorId} (${String(landing.people)})`)
        .join(', ');
      const more = floors.length > 4 ? `, and ${String(floors.length - 4)} more floors` : '';
      return `${run}: ${String(total)} calls never boarded, at ${named}${more}.`;
    }
    case 'locked-out': {
      if (evidence.lockedOut.length === 0) {
        return `${run}: every call registered could legally be answered.`;
      }
      const named = evidence.lockedOut
        .map(
          (landing) =>
            `${landing.floorId} (${String(landing.legCount)} ` +
            `${landing.cause === 'rider-has-no-credential' ? 'riders with no credential at all' : `holding ${landing.credentialGroups.join(', ')}`})`,
        )
        .join(', ');
      return `${run}: ${named}.`;
    }
  }
}

/**
 * The hint.
 *
 * Named from the stage's own editable set, described in the schema's words, and closed with the
 * sentence § 5.3 requires — that this is a place to look and not the answer, because the thing
 * being navigated is a front.
 */
function leverText(state: FailState, input: FailStateReportInput): string {
  if (state === 'locked-out' && hasUnbadgedRiders(input.evidence)) {
    return (
      'No dial reaches this one. These riders carry no credential at all, so no dispatcher — ' +
      'including the two that read credentials — can serve them. The fix is in the building’s ' +
      'access zoning, not in the dispatcher.'
    );
  }
  const id = input.stage.levers[state];
  if (id === null) {
    return (
      `This stage's building declares no access-controlled floor, so this state cannot arise ` +
      'here and no dial is suggested for it.'
    );
  }
  const help = playerSafeDescription(input.dimensionHelp.get(id));
  return (
    `One dial this stage opens is ${id}${help === null ? '.' : ` — ${help}`} It is a place to ` +
    'look, never the answer: every dial here buys one thing by spending another, and what you are ' +
    'moving along is a front rather than a hill with a top.'
  );
}

function hasUnbadgedRiders(evidence: DemonstrationEvidence): boolean {
  return evidence.lockedOut.some((landing) => landing.cause === 'rider-has-no-credential');
}
