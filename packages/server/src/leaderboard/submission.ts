/**
 * What a player submits, and the cheap gate in front of the simulation.
 *
 * `DECISIONS.md` § D214 § 3–4. A client-reported score measures willingness to cheat, so nothing
 * here trusts one: a submission carries the **seed and the resolved configuration**, and
 * `verify.ts` re-runs the simulation and accepts the score only if it reproduces.
 *
 * ## Why an entry carries a content hash of its inputs
 *
 * A score is *"this seed, on this building, under this dispatcher, scored X"* — and every one of
 * those nouns lives in `data/`. Change `midtown-office`'s population and every stored score silently
 * stops describing the run it names, **and stops re-verifying**, so honest old entries begin failing
 * the check that exists to catch forgeries.
 *
 * This repository has paid for that lesson twice in one branch. § D205 found a recorded fuzz case
 * losing its subject when a dispatcher profile was added; § D213 found the same defect one field
 * over, where adding a traffic profile moved `fuzz-1001074`'s arrival count from 177 to 188 while
 * the case still ran and still reported cleanly. A leaderboard is that shape with money on it.
 *
 * So `boardKey.ts#runDataHashOf` digests the **fully resolved inputs a run depended on**, and every
 * entry carries it. A `data/` change does not corrupt an old row — the row still names the data it
 * was measured against, and stays verifiable against it.
 *
 * ## What that digest is no longer allowed to be
 *
 * It used to be the **board key**, under the name `configHashOf`, and `ENGINE_CONTRACT.md` § 12.1
 * forbids that shape in as many words: *"No player-settable parameter may enter a board key. A key
 * of building × dispatcher × traffic template × arrival rate × run length fragments into thousands
 * of one-entry boards where everyone is permanently first."* That was the digest exactly, plus a
 * window. `boardKey.ts` is where the two jobs were separated and where the argument lives; this
 * module keeps the wire's shape and the gate in front of it.
 */

import {
  CARRIED_INTERVENTION_KINDS,
  RULE_ACTION_WORDS,
  RULE_CONDITION_WORDS,
  interventionKindRefusal,
  isInterventionKind,
  type RuleActionId,
  type RuleConditionId,
  type RuleRowConfig,
  type RunInterventionConfig,
  type WireIntervention,
} from '@elevator-sim/core';
import { createHash } from 'node:crypto';

/* -------------------------------------------------------------------------- *
 * The submitted run
 * -------------------------------------------------------------------------- */

/**
 * The configuration half of a submission: everything needed to reproduce the run.
 *
 * Ids rather than inline objects, deliberately. A submission that carried its own building would
 * let a player invent a two-floor tower with sixteen cars and post a superb wait; ids mean the
 * server resolves against **its own** `data/`, and {@link configHashOf} records which `data/` that
 * was.
 */
export interface SubmittedRun {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly demandTemplateId: string;
  /** `null` means the building's own traffic profile — a distinct selection, and hashed as one. */
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
  /**
   * Where in the day the run starts, or `null` for the whole period — `DECISIONS.md` § D285/§ D286.
   *
   * **The far end is `windowStartS + durationS`**, so this is one field rather than two: the viewer
   * carries the window as a start and a length (`menu/types.ts`), and a second end here would be a
   * second source of truth for a number `durationS` already fixes.
   *
   * Without it a windowed run could not be posted at all, and § D288 refused it in the client for
   * exactly that reason. The refusal was right and the reason is worth keeping, because it is not
   * *"the row would be mislabelled"*: the board does not store what a client claims, it
   * **re-simulates the seed itself** (§ D214 § 3). A lunch peak submitted without this field is
   * replayed over the whole day, and the server either refuses it by name — `office-day` at
   * `durationS: 1800` reaches `core` as `templateOverrides.durationS` on an authored phase list and
   * is rejected (§ D275) — or, on a shape template, quietly returns a different and entirely
   * correct answer to a different question. Neither number is wrong; they are about two different
   * runs, and nothing in the exchange could have said so.
   */
  readonly windowStartS: number | null;
  /** Decimal digits, 1–20. Validated before it reaches the kernel. */
  readonly seed: string;
  /**
   * The Everyday rules the run's dispatcher was driven by, in first-match order — § 11.5.
   *
   * ## Why this is *not* the inline-object cheat the module's own rule forbids
   *
   * The rule above is *ids rather than inline objects*, and the reason it gives is that a submission
   * carrying its own building would let a player invent a two-floor tower with sixteen cars. A rule
   * row is the opposite shape: it is **two ids and two values from closed lists declared in `core`**
   * (`RULE_CONDITIONS`, `RULE_ACTIONS`, and the `values` arrays on `RULE_CONDITION_WORDS` /
   * `RULE_ACTION_WORDS`), so the whole space a player can express is a finite product of vocabulary
   * this server ships. {@link submissionIssues} refuses anything outside it before a simulation
   * starts, and `core`'s own `resolveDispatchConfig` refuses it again at resolve.
   *
   * The rows are applied to **the profile this server resolved from `dispatcherProfileId`**, never
   * to a profile the submission carried — `verify.ts#profileWithRules`. So the weights are still the
   * server's own and the rules are the player's, which is exactly the division `submission.ts`'s
   * founding sentence asks for.
   *
   * Absent and `[]` are the same run: `profileWithRules` returns its input by object identity for an
   * empty list, and `boardKey.ts#runDataHashOf` drops the key from the canonical string.
   *
   * Before this field existed, `scope/runIdentity.ts` refused every state with a rule in it — *"no
   * selection or submission carries a rule list"* — so the whole of § 11's workshop produced
   * dispatchers that were unpostable by construction. That refusal was correct and is gone because
   * the fact it rested on is.
   */
  readonly ruleRows?: readonly RuleRowConfig[] | undefined;
  /**
   * The run record's intervention log — `ENGINE_CONTRACT.md` § 1.4's `{ seed, config,
   * interventions[] }`, in press order.
   *
   * § 1.4 clause 2 is *replay verification*: *"The server re-simulates the record, log included, and
   * refuses a submission whose metrics do not reproduce."* This field is what the log travels in;
   * without it the server replayed the seed **without** the log, got different legs, and refused an
   * honest run as `metrics-do-not-reproduce` — spending this product's one accusation on a player
   * who did nothing wrong.
   *
   * **One of the four kinds is refused here, and permanently**, which is why
   * {@link SUBMITTABLE_INTERVENTION_KINDS} names the ones that travel rather than a list of
   * exclusions (GitHub issue #338, § D486):
   *
   * - `switch-dispatcher` used to be refused because `core`'s arm carries a whole
   *   `DispatcherProfile` **inline**. It travels now as {@link SubmittedSwitch} — a shipped id and
   *   the player's rows — and the server re-derives the vector the way it already re-derives the
   *   base profile. What a submission still cannot carry is a hand-tuned vector, which is the same
   *   bound the base profile lives under.
   * - `answer-incident` answers a **campaign incident**, and the incident is not on the wire.
   *   `viz`'s `shift/incidents.ts` writes it onto the building as `serviceEvents` from the week's
   *   day and the calendar; a replay built from ids alone has no incident to answer, so the answer's
   *   `serviceEvents` would be the only mode changes in the run and the legs would differ. It is a
   *   missing *cause*, not a missing field, and carrying the answer without it would be worse than
   *   refusing it.
   *
   * `park-cars-lobby` and `spread-cars` carry nothing but their instant, and travel. The incident
   * refusal is **permanent** rather than a gap: a submission carrying the answer alone would replay
   * to a different run and this server would verify *that* one as honest, and the two routes out —
   * deriving the incident server-side from causes that travel, or carrying it as submitted data —
   * are respectively a move of `shift/incidents.ts` across a package boundary and § D481's cheat
   * lever exactly.
   *
   * Absent and `[]` are the same run, byte for byte — `core` pins that with a fingerprint
   * (`sim/interventions.test.ts`), and `runDataHashOf` drops the key.
   */
  readonly interventions?: readonly SubmittedIntervention[] | undefined;
}

/** The metrics a player claims. Every one is re-derived by the server and compared. */
export interface ClaimedMetrics {
  readonly awtS: number;
  readonly wt95S: number;
  readonly ttdMeanS: number;
  readonly pctOverLongWait: number;
  /**
   * Whether the run's own AWT is quotable.
   *
   * Submitted so that a **client claiming a valid mean for a saturated run is caught by the same
   * comparison as a client claiming the wrong number** — rather than being silently corrected by
   * the server and ranked anyway. `verify.ts` rejects a run whose real value is `false` regardless
   * of what was claimed (§ D214 § 6): a mean over a system whose queue grows without bound may not
   * be ranked, and the leaderboard is the one surface where a player is motivated to ignore that.
   */
  readonly awtIsValid: boolean;
}

export interface Submission {
  readonly run: SubmittedRun;
  readonly claimed: ClaimedMetrics;
  /**
   * What this run was played with, if anything was bought for it — GitHub issue **#368**,
   * `docs/38` § 2.3.
   *
   * Absent on a standard run, which is every run this product shipped before the chime ledger. It
   * carries the **modifier** and never what it cost: § D526 clause 3 forbids a currency figure on a
   * results page or in a comparison between players, and a spend on a submission would be one
   * arriving through the back of the board.
   *
   * On {@link Submission} rather than on {@link SubmittedRun}, and the placement is deliberate and
   * has survived the widening: `SubmittedRun` is what the server **replays**, and neither
   * `purse-units` nor `prefit` reaches a replay, because no mode that spends a purse posts yet. A
   * field on `SubmittedRun` that `verify.ts` read and could not act on would be the dead seam this
   * repository has shipped eleven times, so it stays here until GitHub issue #372 gives it a run to
   * reach.
   *
   * **Two things consume it, and both are outside the replay** — GitHub issue #371, § D526
   * clause 3. `http/api.ts` refuses a claim the account's ledger cannot support before it spends a
   * simulation on it; and `boardKey.ts#placeSubmission` and `#runDataHashOf` then take the
   * *checked* claim, so a set nobody paid for reaches no board key. The ordering is the guarantee,
   * and `api.test.ts` asserts it by looking for the board rather than only at the status code.
   */
  readonly modifiers?: readonly { readonly sinkId: string; readonly steps: number }[] | undefined;
}

/* -------------------------------------------------------------------------- *
 * What a row was measured against
 * -------------------------------------------------------------------------- */

/**
 * The facts about the server's own `data/` that a run's result depends on.
 *
 * Supplied by the caller rather than read here, so this module stays pure and the test can pin a
 * digest without loading a configuration. `store.ts` builds it once at boot.
 */
export interface ResolvedDataFacts {
  /** A digest of the building document as loaded — floors, banks, cars, zones, transport modes. */
  readonly buildingDigest: string;
  /** A digest of the dispatcher profile as loaded — weights, constraints, every stage setting. */
  readonly dispatcherDigest: string;
  /** A digest of the demand template record as loaded. */
  readonly templateDigest: string;
  /**
   * The engine's own model version.
   *
   * `TRAFFIC_DEFAULTS.trafficModel` names *which simulator* produced a number, the way a file
   * format version names which writer produced a file. A `v1` score and a `v2` score are not
   * comparable however identical the rest of the configuration is, so the version is part of what a
   * row was measured against rather than a footnote on it.
   */
  readonly trafficModel: string;
}

/*
 * `configHashOf` used to be here, and its absence is the record of a decision rather than a
 * deletion.
 *
 * It answered two questions with one value — *what data was this measured against* and *which board
 * is this row on* — and `ENGINE_CONTRACT.md` § 12.1 forbids the second answer in as many words,
 * because a digest of the building, the dispatcher, the template, the rate and the run length is a
 * board key made entirely of player-settable parameters. The first answer is right and is kept, bit
 * for bit, as `boardKey.ts#runDataHashOf`; the second is `boardKey.ts#placeSubmission`'s.
 *
 * Left as a comment rather than deleted because a reader looking for *why is there no config board
 * any more* should find the answer where the function used to be, not in a commit.
 */

/**
 * JSON with object keys in sorted order, recursively.
 *
 * `JSON.stringify` preserves insertion order, so two records that differ only in key order would
 * digest differently and fork a board for no reason. Arrays keep their order, because an array's
 * order is data.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

/** A digest of any loaded record, for {@link ResolvedDataFacts}. */
export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 32);
}

/* -------------------------------------------------------------------------- *
 * Shape validation, before anything is simulated
 * -------------------------------------------------------------------------- */

/**
 * The slice ladder — run lengths a player *picks*, bounded because a submission commands server CPU.
 *
 * `viz`'s `menu/types.ts#LONGEST_OFFERED_RUN_S` is the client-side bound on the same set and is
 * still `7200` ([§ D286](../../../../DECISIONS.md)). Nothing below widens what is **offered**; see
 * {@link ACCEPTED_DURATIONS_S}.
 */
const OFFERED_DURATIONS_S: readonly number[] = Object.freeze([300, 900, 1800, 3600, 7200]);

/**
 * A whole authored day, in seconds — `office-day`'s own `durationMin × 60`.
 *
 * **This is the one number on this side of the wire that `viz` derives rather than picks**, and the
 * asymmetry is the whole of why the constant needs a paragraph. `shift/dayLength.ts#wholeDayFor`
 * reads `data/traffic-profiles.json`, finds the phase-list record whose peak declares the building's
 * own `directionalSplit`, and returns that record's period — so the client can post a length nobody
 * ever offered it. § D286 closed this same mismatch from the other side by deleting the client's
 * *offer* of 36 000; [§ D356](../../../../DECISIONS.md) then made the same length reachable again
 * **without** an offer, and a bound on offers cannot see a derivation.
 *
 * So the two sides are pinned by a **test rather than by an import**: `viz` may not depend on
 * `server` (it is a static browser bundle and this package opens a socket and a database — the rule
 * `menu/challenge.ts` states for the challenge shapes), so `menu/client.test.ts` runs the client's
 * real `wholeDayFor` over the real `data/` and asserts every length it can produce is in the list
 * below, read out of **this file's source text**. A day authored in `data/` with a different period,
 * or this constant edited, turns that case red. That is the deliverable rather than the number.
 *
 * **Widening what is postable is not widening what is offered.** § D286's `LONGEST_OFFERED_RUN_S`
 * stands untouched at 7 200 and `menu.test.ts` still asserts it; a whole day remains something a
 * building's own record grants, never a row in a length picker.
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405 — the constant is local to this module and
 * pinned from outside it by `menu/client.test.ts`, which reads this file's source text and runs
 * the client's real `wholeDayFor` against it. § D286's `LONGEST_OFFERED_RUN_S` is untouched.
 */
const WHOLE_DAY_S = 36_000;

/**
 * Run lengths the server will simulate: the slice ladder, plus a whole authored day.
 *
 * Sorted, because the list is joined into the refusal a player reads and an unsorted one reads as
 * an accident. See {@link WHOLE_DAY_S} for how the last entry is kept honest against `viz`.
 */
export const ACCEPTED_DURATIONS_S: readonly number[] = Object.freeze(
  [...OFFERED_DURATIONS_S, WHOLE_DAY_S].sort((left, right) => left - right),
);

/**
 * The outer bound on a window, in seconds.
 *
 * A day, not a template's period. The named record's own length is the kernel's business and it
 * refuses a window past it **by name** (`windowIdentity.test.ts`, *"refuses a window past the end
 * of the period, naming both lengths"*); this constant only stops a number that could not be a
 * time of day at all from reaching a simulation. `viz`'s stored-selection validator uses the same
 * bound for the same reason.
 */
const SECONDS_IN_A_DAY = 86_400;

/**
 * Everything structurally wrong with a submission, or an empty array.
 *
 * Runs **before** the simulation, because verification costs real CPU and an unauthenticated shape
 * error must not be able to command it. This is the cheap gate; `verify.ts` is the expensive one.
 */
export function submissionIssues(submission: Submission): readonly string[] {
  const issues: string[] = [];
  const { run, claimed } = submission;

  if (!/^\d{1,20}$/u.test(run.seed)) issues.push('seed must be 1–20 decimal digits');
  if (!ACCEPTED_DURATIONS_S.includes(run.durationS)) {
    issues.push(`durationS must be one of ${ACCEPTED_DURATIONS_S.join(', ')}`);
  }
  const rate = run.arrivalRatePctPop5min;
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || rate > 100)) {
    issues.push('arrivalRatePctPop5min must be null or a percentage in (0, 100]');
  }
  /*
   * Bounded by a day, and by the day rather than by the named template's own period — the same
   * bound `viz`'s `validate.ts` puts on the stored selection, for the same reason it gives: a
   * window naming a part that `data/` has since moved is a run the kernel will refuse **by name**,
   * which is a better answer than a shape error here.
   *
   * The far end is checked too, because `durationS` is validated against a fixed list above and a
   * window is not: `windowStartS + durationS` past the end of a day is a submission the generator
   * would reject, and refusing it here keeps an unauthenticated shape error from commanding a
   * simulation — which is this function's whole job.
   */
  const windowStartS = run.windowStartS;
  if (windowStartS !== null) {
    if (!Number.isFinite(windowStartS) || windowStartS < 0 || windowStartS >= SECONDS_IN_A_DAY) {
      issues.push(`windowStartS must be null or a second within a day [0, ${SECONDS_IN_A_DAY})`);
    } else if (windowStartS + run.durationS > SECONDS_IN_A_DAY) {
      issues.push(
        `windowStartS + durationS must not run past the end of a day (${SECONDS_IN_A_DAY} s)`,
      );
    }
  }
  for (const [name, id] of [
    ['buildingId', run.buildingId],
    ['dispatcherProfileId', run.dispatcherProfileId],
    ['demandTemplateId', run.demandTemplateId],
  ] as const) {
    if (typeof id !== 'string' || id.length === 0 || id.length > 64) {
      issues.push(`${name} must be a non-empty id under 64 characters`);
    }
  }
  for (const [name, value] of [
    ['awtS', claimed.awtS],
    ['wt95S', claimed.wt95S],
    ['ttdMeanS', claimed.ttdMeanS],
    ['pctOverLongWait', claimed.pctOverLongWait],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) issues.push(`${name} must be a non-negative number`);
  }
  if (typeof claimed.awtIsValid !== 'boolean') issues.push('awtIsValid must be a boolean');

  issues.push(...ruleRowIssues(run.ruleRows));
  issues.push(...interventionIssues(run.interventions));

  return Object.freeze(issues);
}

/* -------------------------------------------------------------------------- *
 * The two Everyday fields, bounded before anything simulates
 * -------------------------------------------------------------------------- */

/**
 * The most rule rows a submission may carry.
 *
 * The editor offers a list a player builds a row at a time and § 11.5 puts no ceiling on it, so the
 * ceiling is here for {@link submissionIssues}' own stated reason rather than as a game rule: an
 * unauthenticated shape error must not be able to command server CPU, and every row is a clause
 * `resolveRuleArms` evaluates on **every dispatch decision**. Sixteen is comfortably above anything
 * the § 11.5 vocabulary can express without repeating itself — nine conditions, eight actions — and
 * far below a list that would cost a measurable fraction of a replay.
 *
 * Recorded here rather than in `DECISIONS.md`, under § D405: the constant is local to this module
 * and refuses by name, so the docstring is the record.
 */
const MAX_RULE_ROWS = 16;

/**
 * The most interventions a submission may carry.
 *
 * A run is re-simulated whole from t = 0 on every one (§ 1.4), so on the *client* the log's length
 * costs a player their own time; on the server it costs nothing per entry, because the replay is one
 * simulation whatever the log holds. The bound is therefore about the wire rather than about the
 * CPU: a log longer than this is not a day somebody played, and refusing it by name is cheaper than
 * storing it.
 */
const MAX_INTERVENTIONS = 64;

/**
 * The intervention kinds a submission may carry — the **allow-list**, not a list of exclusions.
 *
 * Written this way round on `core`'s own precedent for `INTERVENTION_KINDS`: a kind added tomorrow
 * is refused here until somebody decides it can travel, where a deny-list would let it through
 * silently and the first symptom would be an honest player accused of a forgery.
 * {@link SubmittedRun.interventions} carries the reason each refused kind is out.
 * `spread-cars` joined `park-cars-lobby` when it landed (GitHub issue #352): the same control with
 * the opposite setting, carrying nothing but its instant.
 *
 * **`core`'s table, not a list of its own** — GitHub issues #370 and #371. This was a hand-written
 * tuple, and `packages/viz`'s `scope/runIdentity.ts` held a second copy of it because § D215 § 3
 * forbids `viz` importing this package; a test compared the two by reading this file's **source
 * text**. That pair was two of six places the same set was written down, and the other four — the
 * TypeScript unions — had no check over them at all. The answer now lives in
 * `core/src/sim/interventionWire.ts`, which both packages already depend on, and the reason a kind
 * does not travel is on its own row rather than borrowed from `answer-incident`'s.
 */
export const SUBMITTABLE_INTERVENTION_KINDS: readonly string[] = CARRIED_INTERVENTION_KINDS;

/**
 * Everything structurally wrong with a submitted rule list, or nothing.
 *
 * Exported for `rushSitting.ts`, whose rounds carry the same rows and are bounded by the same
 * vocabulary — one gate for one shape, rather than a second copy that could admit what this refuses.
 */
export function ruleRowIssues(rows: readonly RuleRowConfig[] | undefined): readonly string[] {
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) return ['ruleRows must be an array'];
  if (rows.length > MAX_RULE_ROWS) return [`ruleRows must hold at most ${MAX_RULE_ROWS} rows`];
  const issues: string[] = [];
  for (const [index, row] of rows.entries()) {
    if (typeof row !== 'object' || row === null) {
      issues.push(`ruleRows[${index}] must be an object`);
      continue;
    }
    /*
     * Both halves of a row are checked against `core`'s **own** vocabulary tables rather than
     * against a copy — `RULE_CONDITION_WORDS` and `RULE_ACTION_WORDS` are keyed by the declared id
     * and carry the admissible `values`, so this refuses exactly what `resolveDispatchConfig` would
     * refuse and cannot drift from it. The check is here as well as there for `submissionIssues`'
     * one job: an out-of-vocabulary row would otherwise reach the kernel and be refused by a thrown
     * `TrafficError` *after* the run was set up, which is a simulation an unauthenticated caller
     * commanded.
     */
    const condition = RULE_CONDITION_WORDS[row.when as RuleConditionId] as
      | { readonly values?: readonly { readonly value: number | string }[] | undefined }
      | undefined;
    if (condition === undefined) {
      issues.push(`ruleRows[${index}].when "${String(row.when)}" is not a declared rule condition`);
    } else if (!valueIsDeclared(condition.values, row.whenValue)) {
      issues.push(`ruleRows[${index}].whenValue is not one of the values "${String(row.when)}" declares`);
    }
    const action = RULE_ACTION_WORDS[row.then as RuleActionId] as
      | { readonly values?: readonly { readonly value: number | string }[] | undefined }
      | undefined;
    if (action === undefined) {
      issues.push(`ruleRows[${index}].then "${String(row.then)}" is not a declared rule action`);
    } else if (!valueIsDeclared(action.values, row.thenValue)) {
      issues.push(`ruleRows[${index}].thenValue is not one of the values "${String(row.then)}" declares`);
    }
  }
  return issues;
}

/**
 * Whether a row's value is one the vocabulary declares.
 *
 * A valueless id declares no `values`, and for one the only admissible value is **absent** — a
 * number beside `a shaft is out of service` is a row that means nothing, and accepting it would let
 * two different submissions digest differently while describing the same run.
 */
function valueIsDeclared(
  values: readonly { readonly value: number | string }[] | undefined,
  value: unknown,
): boolean {
  if (values === undefined) return value === undefined;
  return values.some((option) => option.value === value);
}

/**
 * A `switch-dispatcher` on the wire — GitHub issue #338, § D486. **An id and rows, never a
 * profile**, on this module's founding rule: the server resolves `toProfileId` against its own
 * `data/` and writes the rows onto it through `verify.ts#profileWithRules`, exactly as it builds
 * the run's base profile from `dispatcherProfileId` and `ruleRows`. A hand-tuned vector cannot be
 * expressed here, and that is the refusal that survives — the same bound the base profile lives
 * under, applied to the switch arm instead of a category refusal standing over it.
 */
export interface SubmittedSwitch {
  readonly kind: 'switch-dispatcher';
  readonly toProfileId: string;
  readonly ruleRows?: readonly RuleRowConfig[] | undefined;
}

/**
 * One entry of the log as the wire carries it: the two parking kinds bare, the switch as ids.
 *
 * **`core`'s union, re-exported** (#370, #371) — it and the three in `packages/viz` spelled the same
 * arms with no drift test between them, and `core/src/sim/interventionWire.ts` now holds the one
 * declaration against the allow-list with a compile-time assertion in both directions.
 */
export type SubmittedIntervention = WireIntervention;

/**
 * Everything structurally wrong with a submitted intervention log, or nothing.
 *
 * Exported for `rushSitting.ts`, whose rounds carry the same log under the same allow-list — a rush
 * round with mid-run changes is refused on exactly the kinds a single run is refused on.
 */
export function interventionIssues(log: readonly SubmittedIntervention[] | undefined): readonly string[] {
  if (log === undefined) return [];
  if (!Array.isArray(log)) return ['interventions must be an array'];
  if (log.length > MAX_INTERVENTIONS) {
    return [`interventions must hold at most ${MAX_INTERVENTIONS} entries`];
  }
  const issues: string[] = [];
  for (const [index, entry] of log.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      issues.push(`interventions[${index}] must be an object`);
      continue;
    }
    if (!Number.isFinite(entry.atS) || entry.atS < 0) {
      issues.push(`interventions[${index}].atS must be a non-negative number of simulated seconds`);
    }
    const kind = (entry.change as { readonly kind?: unknown } | undefined)?.kind;
    if (typeof kind !== 'string' || !isInterventionKind(kind)) {
      issues.push(`interventions[${index}].change.kind "${String(kind)}" is not a declared intervention kind`);
    } else if (!SUBMITTABLE_INTERVENTION_KINDS.includes(kind)) {
      /*
       * **This kind's own ground, from `core`'s table** — GitHub issue #370. The sentence used to
       * end *"because an incident answer names an incident this server has no record of"*, which
       * was the only refused kind's reason standing in for every refused kind. Two more landed with
       * #370 and the sentence would have told an honest player their submission held an incident
       * answer it did not hold — a refusal naming the wrong ground, which costs more than a vague
       * one because it sends them looking for something they did not do.
       */
      issues.push(
        `interventions[${index}] is a "${kind}", which a submission may not carry — ` +
          `only ${SUBMITTABLE_INTERVENTION_KINDS.join(', ')} travel, because ` +
          `${interventionKindRefusal(kind) ?? 'this build does not say why'}`,
      );
    } else if (kind === 'switch-dispatcher') {
      const change = entry.change as Partial<SubmittedSwitch>;
      if (typeof change.toProfileId !== 'string' || change.toProfileId.length === 0) {
        issues.push(
          `interventions[${index}] is a switch-dispatcher with no toProfileId — a switch travels as ` +
            'a shipped dispatcher id plus rule rows, never as an inline profile',
        );
      }
      if ('profile' in change) {
        issues.push(
          `interventions[${index}] carries a dispatcher profile inline; a submission carries ` +
            'dispatchers by id',
        );
      }
      issues.push(
        ...ruleRowIssues(change.ruleRows).map((issue) => `interventions[${index}].${issue}`),
      );
    }
  }
  return issues;
}
