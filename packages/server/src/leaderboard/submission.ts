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
  RULE_ACTION_WORDS,
  RULE_CONDITION_WORDS,
  isInterventionKind,
  type RuleActionId,
  type RuleConditionId,
  type RuleRowConfig,
  type RunInterventionConfig,
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
   * **Two of the three kinds are refused here and the reason is not the same for both**, which is
   * why {@link SUBMITTABLE_INTERVENTION_KINDS} names the one that travels rather than a list of
   * exclusions:
   *
   * - `switch-dispatcher` carries a whole `DispatcherProfile` **inline**, which is this module's
   *   founding rule violated exactly: a vector a player supplies, run on a board keyed by a
   *   dispatcher they only started under. It could only ever travel as a *shipped profile id*
   *   resolved against this server's `data/`, and that is a different field from the one the viewer
   *   needs locally (its driving profile is routinely a derived object no id resolves).
   * - `answer-incident` answers a **campaign incident**, and the incident is not on the wire.
   *   `viz`'s `shift/incidents.ts` writes it onto the building as `serviceEvents` from the week's
   *   day and the calendar; a replay built from ids alone has no incident to answer, so the answer's
   *   `serviceEvents` would be the only mode changes in the run and the legs would differ. It is a
   *   missing *cause*, not a missing field, and carrying the answer without it would be worse than
   *   refusing it.
   *
   * `park-cars-lobby` carries nothing but its instant, and travels.
   *
   * Absent and `[]` are the same run, byte for byte — `core` pins that with a fingerprint
   * (`sim/interventions.test.ts`), and `runDataHashOf` drops the key.
   */
  readonly interventions?: readonly RunInterventionConfig[] | undefined;
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
 * {@link SubmittedRun.interventions} carries the reason each of the other two is out.
 */
export const SUBMITTABLE_INTERVENTION_KINDS: readonly string[] = Object.freeze(['park-cars-lobby']);

/** Everything structurally wrong with a submitted rule list, or nothing. */
function ruleRowIssues(rows: readonly RuleRowConfig[] | undefined): readonly string[] {
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

/** Everything structurally wrong with a submitted intervention log, or nothing. */
function interventionIssues(log: readonly RunInterventionConfig[] | undefined): readonly string[] {
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
      issues.push(
        `interventions[${index}] is a "${kind}", which a submission may not carry — ` +
          `only ${SUBMITTABLE_INTERVENTION_KINDS.join(', ')} travels, because the others carry a ` +
          'dispatcher inline or answer an incident this server has no record of',
      );
    }
  }
  return issues;
}
