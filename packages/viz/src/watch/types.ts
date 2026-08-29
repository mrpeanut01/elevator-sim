/**
 * **Watching somebody else's run — what a run record is, locally.**
 *
 * GAMEPLAY § 14.1 and ENGINE_CONTRACT § 1.5. **The one substitution this directory makes against
 * § 1.5 is § D407**; everything else here is module-local and recorded where it is argued, under
 * § D405. (The argument sat in this docstring unnumbered because the lane that wrote it was told
 * not to claim a `## D3xx` heading it could not reserve — which is § D404, and this file is one of
 * the sixty-four sites that rule was written for.)
 *
 * ## The one substitution this slice makes, stated first
 *
 * § 1.5 says `Watch it` *"fetches that run's `{ seed, config, interventions[] }` and replays it
 * locally — the identical computation the server performs to verify a post, which is why the pill
 * can honestly say **verified by the server**."* **There is no server in this product**, so the
 * second half of that sentence has nothing behind it and the pill may not say it. What is true is
 * the first half: the record is fetched from somewhere local, this build re-simulates it, and it
 * checks the result against the figures the record was filed with. So the pill says
 * {@link REPLAY_PILL_VERB} — *verified by re-simulation* — and `watch/view.ts` owns the wording.
 *
 * The distinction is not pedantry. *Verified by the server* is a claim about an adversary: it says
 * a forged submission was refused by a party the player does not control. Re-simulation on the
 * player's own machine, over a record the player's own machine wrote, refuses **staleness** and
 * refuses nothing else — a record whose figures no longer reproduce is caught, and a record
 * somebody edited to match its own lie is not. Saying the stronger sentence would be this
 * repository's own named failure: a true-sounding claim about a check that did not happen.
 *
 * ## What a record is, and why it is not a recording
 *
 * A {@link WatchRecord} is the *question*, never the answer. `VizRecording` is megabytes of step
 * series and `persist/types.ts` already refuses to store one — *"it is a pure function of the seed
 * and the configuration"*. The record is that seed and that configuration, plus the intervention
 * log § 1.4 makes part of the run, and watching is re-asking the simulator the same question.
 *
 * That is what makes the reproduction gate possible at all: a stored *recording* cannot fail to
 * reproduce itself, so a gate over one would check nothing. A stored *record* can, and the two
 * branches of {@link WatchableRun.blocked} are what § 1.5's *"a row that cannot be replayed loses
 * its `Watch it` button rather than replaying something approximate"* asks for.
 */

import type { RunInterventionConfig } from '@elevator-sim/core/browser';

import type { RuleRow } from '../authoring/ruleSpec.js';

/* -------------------------------------------------------------------------- *
 * The record
 * -------------------------------------------------------------------------- */

/**
 * The shape number of a stored {@link WatchRecord}, and a **refusal** rather than a guess when it
 * differs.
 *
 * `contract/types.ts#VIZ_SCHEMA_VERSION` and `persist/types.ts#SESSION_SCHEMA_VERSION`'s idiom, for
 * their reason: the number is worth having only where two values can genuinely differ, and here
 * they can — a record in `localStorage` was written by whatever build the player last loaded, and a
 * record in `data/reference-runs.json` was written by whatever build regenerated the file.
 *
 * It is **separate from** `SESSION_SCHEMA_VERSION` even though a record travels inside the session
 * envelope, because the two answer different questions and have different readers. The envelope's
 * number says *can this build read the week?*; this one says *can this build re-ask this run's
 * question?* — and the shipped reference file carries records with no envelope around them at all.
 *
 * | version | what it holds |
 * |---|---|
 * | 1 | The first shape: seed, the six selection axes, the week's day pair, the held cars, the log. |
 * | 2 | …and the Everyday rules the run's dispatcher was driven by. |
 *
 * ## Version 2, and why it is a bump rather than an optional key
 *
 * `docs/20` defect 1. Writing one rule made **every day filed afterwards unwatchable**: a written
 * rule list is not expressible as a selection, `runIdentityIssues` says so, and `watchRecordOf`
 * refuses to write a record for any state it refuses. The rules are the one refused field that is
 * **plain data on the profile** — four scalars a `RuleRow` already round-trips through
 * `localStorage` — so the honest answer was to carry them rather than to keep declining, and
 * `record.ts#WATCH_RECORD_CARRIES` is where the subtraction is declared.
 *
 * A version-1 record is *readable* as a version-2 one carrying no rules, and that is a completion
 * rather than a guess in the strongest form this repository uses the word: version 1's own write
 * gate **refused every state with a rule in it**, so `ruleRows: []` is not a default standing in for
 * something nobody wrote down — it is the only value such a record could have described.
 * `persist/session.ts` performs that completion on read, which is why the constant here can stay a
 * single number and `recordUnreadableReason` can stay a plain `!==`.
 */
export const WATCH_RECORD_VERSION = 2;

/**
 * A run, as the question that produced it — contract § 1.4's `{ seed, config, interventions[] }`,
 * with `config` spelled out as the axes a selection can name.
 *
 * ## Why the axes rather than a `SimulationConfig`
 *
 * `scope/runIdentity.ts` already argues this at length for the leaderboard and the answer is the
 * same one: *"Ids rather than inline objects, deliberately. A submission that carried its own
 * building would let a player invent a two-floor tower with sixteen cars and post a superb wait."*
 * A record that carried a resolved building would be exactly that, and it would additionally go
 * stale the day `data/buildings/` changed — where an id re-resolves against whatever this build
 * ships, and the reproduction gate then *catches* the disagreement instead of hiding it.
 *
 * So every field here is either a scalar the player chose or an id `data/` resolves, and
 * `watch/record.ts#watchRecordIssues` refuses to write one for any state whose run needs something
 * else. That refusal is not a limitation bolted on afterwards — it is what makes the gate meaningful.
 *
 * ## Why `seed` is a string
 *
 * `ViewerState.seed` is a `bigint` and `JSON.stringify` throws on one — `persist/jsonSafety.ts`
 * exists because that trap is already in the tree. A decimal string round-trips through JSON, is
 * exact for every value a `bigint` can hold, and is turned back by `BigInt(seed)` at the one place
 * that needs it.
 */
export interface WatchRecord {
  readonly version: number;
  /** The master seed, as a decimal string. `BigInt(seed)` is the only reader. */
  readonly seed: string;
  readonly buildingId: string;
  readonly dispatcherId: string;
  /** `'building'` or a shipped traffic-profile id — `ViewerState.pattern`. */
  readonly pattern: string;
  /**
   * Free Play's demand-template override, or `null` for *whatever the pattern implies*.
   *
   * `null` rather than an absent key, and it is not a default: `ViewerState.freePlay` is
   * `undefined` for every campaign run, and a campaign run's template is derived from the pattern
   * by `shiftDemandTemplateId`. Writing the derived value here would make a record that pins an
   * override the player never made, and the two stop agreeing the day the derivation moves.
   */
  readonly demandTemplateId: string | null;
  /** Free Play's rate override, or `null` for *the building's own profile* — a real selection. */
  readonly arrivalRatePctPop5min: number | null;
  readonly shiftLengthS: number;
  /** `null` is *the whole of the period* — § D286's own meaning, carried verbatim. */
  readonly windowStartS: number | null;
  /**
   * The week day the run was played on, 1-based. `growth.ts`'s 11 %/day reads it, so a record
   * without it replays day 4 as day 1 and quietly runs a smaller building.
   */
  readonly day: number;
  /**
   * The weekday index. `shift/events.ts#eventFor(day, dayIdx)` reads the pair, so the two together
   * are what re-derives the day's event — and why {@link WatchRecord} carries no event id: an id
   * stored beside the pair is a second answer that can disagree with it.
   */
  readonly dayIdx: number;
  /** Cars the player held out of service, sorted. `[]` for a run that held none. */
  readonly outOfServiceCarIds: readonly string[];
  /** The mid-run interventions, in press order — contract § 1.4. `[]` for a run with none. */
  readonly interventions: readonly RunInterventionConfig[];
  /**
   * The Everyday rules the dispatcher was driven by, in first-match order — `docs/20` defect 1.
   *
   * `[]` for a run that wrote none, which is every run the shipped profiles produce on their own.
   *
   * ## Why the record may hold these when a submission may not
   *
   * `interventions` and `outOfServiceCarIds` are already here on exactly this footing, and the
   * argument is `record.ts`'s: *"this record is not the wire — it is a local file and a local
   * slot — so it can hold what the wire cannot."* `scope/runIdentity.ts` refuses a rule list
   * because **no field of `RunSubmission`, no CLI flag and no deep-link parameter expresses one**,
   * which is a fact about the wire and not about the rules.
   *
   * ## Why the rows and not the profile they make
   *
   * `authoring/ruleSpec.ts#profileWithRules` turns these four scalars into a whole
   * `DispatcherProfile` with `selection.policy: 'rules'` on it. Storing that profile would be
   * storing a resolved artefact — the thing {@link WatchRecord}'s own docstring refuses for the
   * building — and it would go stale the day the rule vocabulary or the policy wiring moves. The
   * rows are what the player wrote; the profile is what this build makes of them, and re-making it
   * is what replaying means.
   *
   * The ids are checked against the shipped vocabulary on read
   * (`record.ts#recordUnreadableReason`), because a record naming a condition this build no longer
   * has is a record it cannot re-ask — the same answer, and the same sentence shape, as a record
   * naming a building `data/buildings/` has stopped shipping.
   */
  readonly ruleRows: readonly RuleRow[];
}

/* -------------------------------------------------------------------------- *
 * What the record claims
 * -------------------------------------------------------------------------- */

/**
 * The figures a record was filed with — what re-simulation has to reproduce before the run may be
 * watched.
 *
 * ## Why these four and not the whole sheet
 *
 * Each is a *count or a percentage of legs*, folded by `shift/observations.ts` from the recording
 * at `endedAt`, and none is suppressible. That matters: a gate over a figure the product sometimes
 * refuses to publish would be a gate that reads `undefined` on a saturated run and calls it a
 * mismatch, which would take the watch affordance away from exactly the runs most worth watching.
 * `meanWaitS` is the obvious candidate and is deliberately absent for that reason — `awtIsValid`
 * suppresses it on five grounds and the day's own sheet may be showing a dash where this gate
 * would want a number.
 *
 * They are also *whole numbers*, so the comparison is `===` rather than a tolerance. A tolerance is
 * a decision about how wrong a replay may be, and § 1.5's answer is *not at all*: **never replay
 * something approximate**.
 */
export interface PostedResult {
  /** Legs that arrived. */
  readonly arrived: number;
  /** Legs that alighted. */
  readonly carried: number;
  /** Served legs away inside a minute, percent — the sheet's headline. */
  readonly minutePct: number;
  /** The longest wait, whole seconds. */
  readonly worstWaitS: number;
}

/* -------------------------------------------------------------------------- *
 * A row in the picker
 * -------------------------------------------------------------------------- */

/**
 * Where a watchable run came from — and the distinction § 20.11 makes structural.
 *
 * `'reference'` is a run shipped in `data/reference-runs.json` as a **fixture**. § 20.11:
 * *"World figures must never be presented as players when they are reference runs."* So the source
 * is a field of the value rather than a property of the file it happened to be read from, and
 * `watch/view.ts` renders `reference run · not a player` from it — the sentence § 14.1 asks for,
 * derived from the data rather than typed beside it.
 *
 * `'filed-day'` is a day this device closed. It is not *somebody else*, and the copy never says it
 * is: § 14.1's no-first-person rule and § 20.11's no-inventing-people rule pull in the same
 * direction, and what satisfies both is naming the **day** rather than a person.
 */
export type WatchSource = 'filed-day' | 'reference';

/** Why a row cannot be watched — § 1.5's *"loses its `Watch it` button rather than replaying something approximate"*. */
export interface WatchBlocked {
  /**
   * The machine-readable ground, so a test can drive both branches by name rather than by matching
   * prose.
   *
   * - `no-record` — the day was filed by a build that stored no record. Not a fault and not a
   *   corruption: it is the **measured** state of a session written before the record existed,
   *   exactly as `persist/types.ts` reads an empty library as the measured state of version 1.
   * - `unreadable-record` — the record's shape number is not {@link WATCH_RECORD_VERSION}, or an
   *   id in it names something this build does not ship.
   * - `does-not-reproduce` — the record re-simulated, and the figures it was filed with are not
   *   the figures that came back.
   */
  readonly ground: 'no-record' | 'unreadable-record' | 'does-not-reproduce';
  /** What the row says instead of offering the affordance. Never first-person — § 14.1. */
  readonly reason: string;
}

/**
 * One row a spectator may be offered, and everything the shell needs to draw it.
 *
 * `blocked` is `null` for a row that can be watched. The pair is deliberately not a boolean plus a
 * message: `docs/16` S1's rule is that an absence indistinguishable from an oversight is not a
 * declaration, and a row that simply lacked a button would be exactly that.
 *
 * `posted` is what the record *claims*. It is set on a blocked row too — a day that will not
 * reproduce still filed a result, and hiding it would misdescribe the row as empty rather than as
 * unwatchable.
 */
export interface WatchableRun {
  /** Stable within one sitting; the picker's selection key. */
  readonly id: string;
  readonly source: WatchSource;
  /** What the header names. Never a person for a `reference` row — see {@link WatchSource}. */
  readonly label: string;
  /** The building the record names, in the player's words. */
  readonly buildingName: string;
  /** One line placing the run — `Tuesday · day 2`, or the reference run's own note. */
  readonly subtitle: string;
  readonly record: WatchRecord | null;
  readonly posted: PostedResult;
  readonly blocked: WatchBlocked | null;
}
