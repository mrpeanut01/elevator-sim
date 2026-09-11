/**
 * **The server re-runs the run.** A submitted score is accepted only if replaying its seed
 * reproduces it.
 *
 * `DECISIONS.md` § D214 § 3. This is the whole anti-cheat design and there is no other part to it:
 * no heuristics, no plausibility bounds, no rate-limiting-as-security. Invariant 5 already
 * guarantees what is needed — *every persisted run record carries its seed, so any run replays
 * exactly* — so a forged score is rejected because it does not replay, and an honest one is accepted
 * because it does. The client is never trusted with a number.
 *
 * ## Why exact, and not "close enough"
 *
 * A tolerance is a budget for a cheat. The engine is deterministic from its seed and the same
 * `@elevator-sim/core` runs on both sides, so an honest client reproduces the server's value to the
 * last bit; anything else is a different run. {@link METRIC_EPSILON} exists only for the one thing
 * that genuinely is not bit-exact — a float that has crossed JSON — and is tight enough that no
 * meaningful score difference fits inside it.
 *
 * ## What a rejection is not
 *
 * A rejection is **not** an accusation. A player on an older build, or one who ran before a `data/`
 * change, submits in good faith and does not reproduce. That is why the reason is carried out of
 * here as a machine-readable code: the caller can tell "this does not match" from "this board no
 * longer exists", and say the right thing to a player who did nothing wrong.
 */

import {
  RUSH_STREAM,
  RUSH_TEMPLATE_ID,
  type RunInterventionConfig,
  runSimulation,
  rushTopRatePctPop5min,
  type RuleRowConfig,
  type RunSummary,
  type SimulationConfig,
} from '@elevator-sim/core';
import { reportWindowForBuilding } from '@elevator-sim/experiments/browser';

import type { ClaimedMetrics, Submission, SubmittedRun } from './submission.js';

/**
 * The largest difference a metric may show and still be called the same number.
 *
 * `1e-9` seconds. A JSON round trip of an IEEE-754 double is exact for every value this produces, so
 * in practice the difference is zero; the epsilon is here because *"in practice"* is not a thing to
 * assert on, not because a real gap is expected. It is nine orders of magnitude below the smallest
 * wait difference that could change a ranking.
 */
export const METRIC_EPSILON = 1e-9;

/** Why a submission was refused, as something the caller can branch on. */
export type RejectionCode =
  | 'unknown-building'
  | 'unknown-dispatcher'
  | 'unknown-template'
  | 'rush-posts-as-a-sitting'
  | 'metrics-do-not-reproduce'
  | 'awt-not-quotable'
  | 'simulation-failed';

export interface VerificationRejected {
  readonly ok: false;
  readonly code: RejectionCode;
  readonly detail: string;
}

export interface VerificationAccepted {
  readonly ok: true;
  /** The **server's** metrics, which are what get stored. The claim is never persisted. */
  readonly measured: ClaimedMetrics;
  /**
   * Served legs in the measurement window — the `n` behind `measured.awtS`.
   *
   * Beside `measured` rather than inside it, because `ClaimedMetrics` is *what a player claims* and
   * this is never claimed. See `store/store.ts#EntryRow.legs` for the full reason; the short one is
   * that a denominator in the claim would be one more way to refuse an honest player, over the one
   * number a dishonest one would most want to choose.
   */
  readonly legs: number;
}

export type Verification = VerificationAccepted | VerificationRejected;

/** What the verifier needs from the server's own loaded `data/`. */
export interface VerificationResources {
  readonly buildingsById: ReadonlyMap<string, SimulationConfig['building']>;
  readonly dispatcherProfilesById: ReadonlyMap<string, SimulationConfig['dispatcherProfile']>;
  readonly trafficProfiles: SimulationConfig['trafficProfiles'];
  readonly elevatorSpecs: SimulationConfig['elevatorSpecs'];
  readonly dispatcherProfiles: SimulationConfig['dispatcherProfiles'];
}

/**
 * Build the configuration the run claims to be, from the **server's** data.
 *
 * Ids in, resolved objects out. A submission never carries a building or a profile — that is what
 * would let a player invent a two-floor tower with sixteen cars and post a superb wait.
 */
export function configFor(
  run: SubmittedRun,
  resources: VerificationResources,
): SimulationConfig | RejectionCode {
  /*
   * **The rush posts as a sitting, and this is where the refusal of it was lifted** — GitHub issue
   * #372, [§ D542](../../../../DECISIONS.md), under the owner's ruling of 2026-09-10.
   *
   * It read, from GitHub issue #220: *a template that declares itself unselectable is one the board
   * does not know: no shipped list offers it, so a submission naming it was built by hand, and a run
   * under a stream that leaves every profile's declared band is not a run this board ranks* — and
   * `endless-rush` was refused here as `unknown-template`. **Both halves are still true of this path**,
   * which ranks a quotable mean on the daily board and the personal log, so a single run under the
   * rush is still refused before anything simulates. What is lifted is the refusal of the rush as a
   * thing a server can verify and rank, and the argument, in the order the ruling asked for it:
   *
   * 1. **The rush has something to rank that it produces.** A rush's mean is unquotable by design —
   *    the stream is built to break the building, and `measureRun`'s `awt-not-quotable` would refuse
   *    every one — so the rank is how long it held, read off the replay at the hold moment by the
   *    reader the stage stops on (`@elevator-sim/core`'s `rushHoldAtLegs`). A stopped-by-hand run and a
   *    run that never broke post nothing (`rushSitting.ts`, `no-breaking-point`).
   * 2. **What posts is a sitting, whole** — the owner's reading (b): consecutive runs from an
   *    as-shipped start, every round's intervention log on the wire.
   * 3. **Every round is verified from causes, and every effect is derived** — § D486's shape. A round
   *    carries a building id, a shipped dispatcher id, its rows and its log on
   *    `submission.ts`'s allow-list; {@link rushRoundConfigFor} derives the seed, the stream, the
   *    length and the rate; the server re-simulates it and compares the held time; and every purse is
   *    derived from the replay. A client-named purse, amount, wave count, seed or stream is refused by
   *    name. So a posted sitting cannot carry a gentler climb, a kinder seed, a purse or a figure its
   *    own replay did not produce.
   * 4. **It is a ranking on one crowd.** The seed is shared (§ D515), and a rush board is keyed by the
   *    tower, the day and the modifier set (`boardKey.ts#rushPlacementOf`, § D543), so rows on one
   *    board met the identical crowd and a bought start ranks only beside the same bought start.
   * 5. **What it costs was measured first.** One simulation a round, 326–1 541 ms a round across the
   *    nine shipped buildings and linear in the chain, charged against the cooldown per round, twelve
   *    rounds at most (`rushSitting.ts`'s table and its command, measured on the commit before this
   *    one).
   *
   * **What stays refused, each on its own ground:** a bought change mid-run (`interventionWire.ts` —
   * no submission carries the entitlement to it), an incident answer (§ D486, permanent), a pre-fitted
   * start (its fitted building is one this server cannot build), and a between-round rebuild, which no
   * wire carries yet.
   */
  if (run.demandTemplateId === RUSH_TEMPLATE_ID) return 'rush-posts-as-a-sitting';
  // Any other template that declares itself unselectable is one the board does not know, on #220's
  // ground above: no shipped list offers it, so a submission naming it was built by hand.
  return configOver(run, resources, (template) => template.selectable !== false);
}

/** What a single run under the rush stream is told, on the score route — {@link configFor}'s refusal. */
const RUSH_POSTS_AS_A_SITTING =
  'A rush posts as a sitting, not as a single run: send every round, from the building as shipped, to ' +
  'POST /api/rush-sittings, where each round is replayed and the sitting is ranked by how long its last ' +
  'round held. A rush has no average wait to rank here — the stream is built to break the building.';

/**
 * The configuration of one round of a posted rush sitting — GitHub issue **#372**, and
 * `rushSitting.ts`'s one way into the replay.
 *
 * **Nothing about the round's run is submitted except what a player chose.** The building id names
 * the tower; the template, the seed, the ninety minutes, the window from the period's start and the
 * rate that makes the stream the same number of people on every tower are all derived here, from
 * `@elevator-sim/core`'s `sim/rush.ts`, which is the same derivation `packages/viz/src/everyday/rush.ts`
 * writes into the viewer's patch. So a round cannot post a gentler stream, a kinder seed or a shorter
 * climb: there is no field that could say one. The player's dispatcher, rules and intervention log
 * go through {@link configOver} exactly as a single run's do.
 *
 * It admits **only** the rush template, which is the whole of the difference from {@link configFor}.
 */
export function rushRoundConfigFor(
  buildingId: string,
  round: Pick<SubmittedRun, 'dispatcherProfileId' | 'ruleRows' | 'interventions'>,
  resources: VerificationResources,
): SimulationConfig | RejectionCode {
  const building = resources.buildingsById.get(buildingId);
  if (building === undefined) return 'unknown-building';
  const run: SubmittedRun = {
    buildingId,
    dispatcherProfileId: round.dispatcherProfileId,
    demandTemplateId: RUSH_TEMPLATE_ID,
    arrivalRatePctPop5min: rushTopRatePctPop5min(building.totalPopulation),
    durationS: RUSH_STREAM.lengthS,
    // From the period's own start rather than `null`, for `rush.ts#rushPatchOf`'s reason: an authored
    // phase list refuses a `durationS` override (§ D275), and a window is what carries the length.
    windowStartS: 0,
    seed: String(RUSH_STREAM.seed),
    ...(round.ruleRows === undefined ? {} : { ruleRows: round.ruleRows }),
    ...(round.interventions === undefined ? {} : { interventions: round.interventions }),
  };
  return configOver(run, resources, (template) => template.id === RUSH_TEMPLATE_ID);
}

/**
 * The shared half of {@link configFor} and {@link rushRoundConfigFor}: resolve every id against the
 * server's own `data/`, in the order the refusals have always come in, with the one question that
 * differs between them — *which templates this path admits* — asked by the caller.
 */
function configOver(
  run: SubmittedRun,
  resources: VerificationResources,
  admits: (template: SimulationConfig['trafficProfiles']['demandTemplates'][number]) => boolean,
): SimulationConfig | RejectionCode {
  const building = resources.buildingsById.get(run.buildingId);
  if (building === undefined) return 'unknown-building';
  const shipped = resources.dispatcherProfilesById.get(run.dispatcherProfileId);
  if (shipped === undefined) return 'unknown-dispatcher';
  const template = resources.trafficProfiles.demandTemplates.find(
    (entry) => entry.id === run.demandTemplateId,
  );
  if (template === undefined || !admits(template)) return 'unknown-template';

  // The player's rules over the **server's** profile. Never a profile the submission carried.
  const dispatcherProfile = profileWithRules(shipped, run.ruleRows ?? []);
  // And the log's handovers the same way — a switch to an id this server does not ship is refused
  // exactly as an unshipped base profile is.
  const log = interventionsFor(run, resources);
  if (log === 'unknown-dispatcher') return 'unknown-dispatcher';

  // Derived from the id, never read off the wire — the argument is at the spread below.
  const reportWindow = reportWindowForBuilding(run.buildingId);

  return {
    building,
    dispatcherProfile,
    trafficProfiles: resources.trafficProfiles,
    ...(resources.elevatorSpecs === undefined ? {} : { elevatorSpecs: resources.elevatorSpecs }),
    ...(resources.dispatcherProfiles === undefined
      ? {}
      : { dispatcherProfiles: resources.dispatcherProfiles }),
    // A string of digits, validated by `submissionIssues` before it reaches here. `BigInt` rather
    // than `Number` because a 20-digit seed does not survive a double, and the seed is an identity:
    // rounding it would replay a different run and reject an honest player.
    seed: BigInt(run.seed),
    demandTemplate: run.demandTemplateId as SimulationConfig['demandTemplate'],
    // `report`, not `throw`. A run that times out with people still in the system is a legitimate
    // outcome to submit — it simply will not be ranked, because `awtIsValid` is false and the gate
    // below refuses it. Throwing would turn "your dispatcher was overwhelmed" into a server error.
    onTimeout: 'report',
    ...(run.arrivalRatePctPop5min === null
      ? {}
      : { demand: { arrivalRatePctPop5min: run.arrivalRatePctPop5min } }),
    /*
     * `durationS` **or** a window, never both — § D285/§ D286, and this branch is a deliberate
     * mirror of `viz`'s `dev/state.ts`, which makes the same choice in the same shape. The client
     * and the server have to agree about what a submission means, and the way they agree is that
     * both build the config this way rather than that one of them normalises for the other.
     *
     * The reason is not tidiness. `durationS` reaches `runSimulation` as
     * `templateOverrides.durationS`, which **refits the template's geometry** — a shorter ramp
     * around the same hold — so a part of a day cannot travel as one. And on an authored phase list
     * `core` refuses the override outright (§ D275), which is the *one* kind of template that has
     * parts worth selecting: passing both would throw on exactly the case the window exists for.
     * Measured, not reasoned — the first version of this passed both and
     * `office-day` threw `templateOverrides.durationS cannot be applied`.
     *
     * The far end is derived rather than submitted. The viewer carries a window as a start and a
     * length, so `durationS` already fixes it, and a second number on the wire could disagree with
     * the first.
     */
    ...(run.windowStartS === null
      ? { durationS: run.durationS }
      : { windowStartS: run.windowStartS, windowEndS: run.windowStartS + run.durationS }),
    /*
     * **Which window the figures are read over** — GitHub issue #315, and the *third* kind of
     * window on this object rather than a variant of the two above it. `durationS` decides how much
     * day is generated, `windowStartS`/`windowEndS` decide how much of it is run, and this decides
     * how much of what ran is **measured**.
     *
     * It was absent, and the absence refused honest players. `viz`'s `shiftRunConfigOf` has set it
     * since `docs/20` defect 5, so the client and the server were measuring the same legs over
     * different windows and the comparison below could not agree: on `garden-apartments` /
     * `collective` / `rise-and-fall` at 3 600 s, seed 20260901, the server read
     * `awtS 18.233 / wt95S 29.310 / ttdMeanS 50.829` where the client read
     * `13.462 / 28.119 / 40.348`, and **every** submission on that building was refused as
     * `metrics-do-not-reproduce` — this product's one accusation, spent on a player who did nothing
     * wrong. `midtown-office` reproduced perfectly, which is why the suite never saw it: the
     * building the tests drove is the one building whose answer is *leave the template's band
     * alone*.
     *
     * **Derived, never submitted, and that is the whole design rather than a preference.** A report
     * window on the wire is a player-settable parameter inside a board key — `ENGINE_CONTRACT.md`
     * § 12.1, the rule `boardKey.ts` exists to keep — and a cheat lever with it: the window is the
     * divisor of every mean on the sheet, so a player who picks their own window picks their own
     * average. It is keyed on the building id, which a submission already carries and the server
     * already resolves against its own `data/`.
     *
     * **The same function as the client's, not the same rule written twice.** `viz`'s
     * `shift/reportWindow.ts#shiftReportWindowFor` and this line both call
     * `@elevator-sim/experiments`'s `reportWindowForBuilding`, which reads the conclusion
     * `MATRIX_CELLS` already encodes. Two copies would drift, and the first symptom of the drift is
     * the defect above. {@link profileWithRules} is transcribed rather than imported and says why —
     * `core` refuses every shape but the one it writes, so that transcription **cannot** drift.
     * Nothing plays that part here: a second copy of this rule would be free to disagree, so there
     * is not one.
     *
     * Spread-or-omit, exactly as `shiftRunConfigOf` writes it: an absent key and a present
     * `undefined` are different claims to `core`, and only the first means *the template's own*.
     */
    ...(reportWindow === undefined ? {} : { reportWindow }),
    /*
     * The run record's log — § 1.4, and **spread rather than written as `interventions: run.…`**,
     * for the reason `viz`'s `shiftRunConfigOf` gives at the same line: `core` promises a run with
     * no `interventions` key is byte-identical to one built before the field existed and pins it
     * with a fingerprint, so an empty log has to carry *no key at all* rather than an empty array.
     * That is what lets every score posted before this field re-verify unchanged.
     */
    ...(log.length === 0 ? {} : { interventions: log }),
  } as SimulationConfig;
}

/**
 * The wire's log as `core` runs it — GitHub issue #338, § D486. A switch arrives as a shipped id
 * plus rows and leaves here as the profile `core`'s arm carries, built **from this server's own
 * `data/`** through the same {@link profileWithRules} the base profile goes through; an id this
 * server does not ship is the same rejection the base profile gets. The two parking kinds pass
 * through unchanged.
 */
function interventionsFor(
  run: SubmittedRun,
  resources: VerificationResources,
): readonly RunInterventionConfig[] | 'unknown-dispatcher' {
  const log: RunInterventionConfig[] = [];
  for (const entry of run.interventions ?? []) {
    if (entry.change.kind === 'switch-dispatcher') {
      const shipped = resources.dispatcherProfilesById.get(entry.change.toProfileId);
      if (shipped === undefined) return 'unknown-dispatcher';
      log.push({
        atS: entry.atS,
        change: { kind: 'switch-dispatcher', profile: profileWithRules(shipped, entry.change.ruleRows ?? []) },
      });
    } else {
      log.push({ atS: entry.atS, change: { kind: entry.change.kind } });
    }
  }
  return log;
}

/**
 * The Everyday rules written onto a profile — the server's half of § 11.5's compile.
 *
 * ## Why this is here and not imported, and why it is not a second answer
 *
 * `viz`'s `authoring/ruleSpec.ts#profileWithRules` does the same two writes, and `viz` may not be
 * imported from this package — § D215 § 3 states the prohibition in the other direction and
 * `menu/client.test.ts` is built around it. Two implementations of one decision is this
 * repository's signature defect, so what stops these two drifting is that **neither of them is
 * free to choose**: `core`'s `resolveDispatchConfig` refuses a `rules` section authored under any
 * policy but `'rules'`, and refuses `selection.policy: 'rules'` with no rows. The pair of writes
 * below is the only pair `core` accepts, which makes this a transcription of a constraint rather
 * than an opinion — and `verify.test.ts` drives the *other* half of the claim by replaying a
 * client's own ruled run and requiring the metrics to agree to {@link METRIC_EPSILON}.
 *
 * **Empty rows return the profile by object identity**, matching `viz`'s contract exactly: a
 * submission with no rules resolves to the profile `data/dispatcher-profiles.json` ships, and the
 * replay is bit-for-bit the run it was before this function existed.
 */
export function profileWithRules(
  profile: SimulationConfig['dispatcherProfile'],
  rows: readonly RuleRowConfig[],
): SimulationConfig['dispatcherProfile'] {
  if (rows.length === 0) return profile;
  return {
    ...profile,
    rules: { rows: [...rows] },
    selection: { ...(profile.selection ?? {}), policy: 'rules' },
  };
}

/** The four ranked metrics plus the validity flag, read off a summary the server produced. */
export function metricsOf(summary: RunSummary): ClaimedMetrics {
  return Object.freeze({
    awtS: summary.waiting.meanS,
    wt95S: summary.waiting.p95S,
    ttdMeanS: summary.timeToDestination.meanS,
    pctOverLongWait: summary.waiting.pctOverLongWait,
    awtIsValid: summary.awtIsValid,
  });
}

/** Whether two metric sets are the same run's, within {@link METRIC_EPSILON}. */
export function metricsAgree(left: ClaimedMetrics, right: ClaimedMetrics): boolean {
  const close = (a: number, b: number): boolean =>
    (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= METRIC_EPSILON;
  return (
    close(left.awtS, right.awtS) &&
    close(left.wt95S, right.wt95S) &&
    close(left.ttdMeanS, right.ttdMeanS) &&
    close(left.pctOverLongWait, right.pctOverLongWait) &&
    left.awtIsValid === right.awtIsValid
  );
}

/**
 * Replay the submission and decide.
 *
 * Order matters and is deliberate: resolve, simulate, **check quotability, then compare**. A
 * saturated run is refused on its own merits (§ D214 § 6) rather than being compared first, because
 * a player whose queue diverged should be told that — not told their arithmetic disagrees with the
 * server's, which it does not.
 */
/**
 * The server's own replay of a run, measured — the half of {@link verifySubmission} that has no
 * claim in it, and the whole of what a **baseline** row needs (GitHub issue #222, § D521): the
 * house does not claim, it measures.
 *
 * Same three refusals as the submission path, in the same words, so a seeded row and a posted row
 * are refused on identical grounds. The fourth refusal — the claim not reproducing — has no
 * subject here.
 */
export function measureRun(
  run: SubmittedRun,
  resources: VerificationResources,
): { readonly ok: true; readonly measured: ClaimedMetrics; readonly legs: number } | VerificationRejected {
  const config = configFor(run, resources);
  if (typeof config === 'string') {
    return {
      ok: false,
      code: config,
      detail:
        config === 'unknown-building'
          ? `This server does not ship a building "${run.buildingId}".`
          : config === 'unknown-dispatcher'
            ? `This server does not ship a dispatcher "${run.dispatcherProfileId}".`
            : config === 'rush-posts-as-a-sitting'
              ? RUSH_POSTS_AS_A_SITTING
              : `This server does not ship a demand template "${run.demandTemplateId}".`,
    };
  }

  let summary: RunSummary;
  try {
    summary = runSimulation(config).summary;
  } catch (error) {
    // A configuration the server cannot run is not a cheat and must not read as one.
    return {
      ok: false,
      code: 'simulation-failed',
      detail: error instanceof Error ? error.message : 'the replay did not complete',
    };
  }

  const measured = metricsOf(summary);

  // The suppression the rest of the project applies, at the one surface where a player is motivated
  // to ignore it. Checked against the SERVER's run, so claiming `awtIsValid: true` cannot buy it.
  if (!measured.awtIsValid) {
    return {
      ok: false,
      code: 'awt-not-quotable',
      detail:
        'This run’s average wait is not quotable — the queue did not clear, or too many riders ' +
        'went unserved — so it cannot be ranked. The run is real; the mean is not reportable.',
    };
  }

  return { ok: true, measured, legs: summary.waiting.count };
}

export function verifySubmission(
  submission: Submission,
  resources: VerificationResources,
): Verification {
  const replayed = measureRun(submission.run, resources);
  if (!replayed.ok) return replayed;

  if (!metricsAgree(submission.claimed, replayed.measured)) {
    return {
      ok: false,
      code: 'metrics-do-not-reproduce',
      detail:
        'Replaying this seed on this server did not reproduce the submitted figures. That happens ' +
        'when the client is on a different build or the reference data has changed since the run.',
    };
  }

  return { ok: true, measured: replayed.measured, legs: replayed.legs };
}
