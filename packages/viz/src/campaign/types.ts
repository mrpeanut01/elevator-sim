/**
 * The scenario schema — `docs/10-experience-layer-contract.md` § 5.2 — and the four fail states
 * of § 5.3, as types.
 *
 * ## What a scenario is, and what it deliberately is not
 *
 * § 5.2: *"A scenario is a named, seeded, fully-specified configuration plus a goal set plus a
 * replication budget. It is data — a JSON file, validated by a schema, in the same spirit as
 * invariant 7."* {@link Campaign} is that file's shape and `campaign/parse.ts` is that schema.
 *
 * What it is **not** is a second source of truth about what a goal is worth. Every goal a stage
 * declares must appear in `data/scenario-goals.json`'s `goals` bucket for the **same stage id**,
 * and the bar it is judged against is the count that table published. A goal cannot be authored
 * here; it can only be *selected* from what was measured, which is [§ D160](../../../../DECISIONS.md)'s
 * closing instruction taken literally.
 *
 * ## Two fields of § 5.2's list are narrower here than the prose, and both narrowings are reasons
 *
 * - **`building` is an id and never an inline `BuildingConfig`.** § 5.2 allows either. An inline
 *   building could not carry a measured goal: `data/scenario-goals.json` is keyed by stage id over
 *   the shipped buildings, and R12 makes an unmeasured goal unshippable. So the inline form is not
 *   a feature this schema is missing — it is a form in which no goal could legally be declared.
 * - **`traffic` is the one field the batch runner reads.** § 5.2 calls it *"a `TRAFFIC_PARAMETERS`
 *   patch"*; `BatchRequest` accepts `arrivalRatePctPop5min` and nothing else, because every other
 *   demand field would change the passenger trace without `traceKeyOf` being able to say so.
 *   Widening this means widening `BatchRequest` first, and that is W3's contract, not this one's.
 *
 * ## Why the editable dimension set is part of the schema rather than a hint
 *
 * § 5.2 asks for *"a starting profile, and which dimensions the player may move"*, and § 5.3 draws
 * every suggested lever from that set. Both are enforced: `parse.ts` refuses a dimension id the
 * discovered search space does not declare, and refuses a lever that is not in its own stage's
 * set. The list is never written down in code — the caller passes `collectSearchSpace().ids`, so a
 * dimension declared tomorrow is authorable here with no edit and a dimension deleted tomorrow
 * turns the campaign red.
 */

import type { GoalSpec } from '../scenario/goals.js';
import type { PublishedSeedSet } from '../scenario/published.js';

/* -------------------------------------------------------------------------- *
 * Fail states — § 5.3, in R4's order of preference
 * -------------------------------------------------------------------------- */

/**
 * § 5.3's four, in the order R4 prefers them.
 *
 * None is invented: `overwhelmed` is `summary.saturated`, `abandoned` is
 * `serviceLevel.verdict === 'starved'`, `stranded` is a `timed-out` run with people still in the
 * system, and `locked-out` is § 10's access-controlled call no car may legally answer.
 */
export const FAIL_STATES = ['overwhelmed', 'abandoned', 'stranded', 'locked-out'] as const;

export type FailState = (typeof FAIL_STATES)[number];

/* -------------------------------------------------------------------------- *
 * A stage
 * -------------------------------------------------------------------------- */

/**
 * Which dimensions the player may move.
 *
 * `every-declared-dimension` is not a shortcut for "all 56": it is the statement stage 7 needs —
 * *"the dispatcher editor (§ 8) with a batch goal and a holdout set"* — and it resolves against
 * whatever the search space declares at the moment it is asked. Writing the ids out would make the
 * campaign file the second place that has to change when `core` declares a knob.
 */
export type EditableDimensions =
  | { readonly mode: 'listed'; readonly ids: readonly string[] }
  | { readonly mode: 'every-declared-dimension' };

export interface StageDispatcher {
  /** The profile the stage starts on, and the batch's **baseline** arm. */
  readonly startingProfileId: string;
  readonly editable: EditableDimensions;
}

/** § 5.2's `traffic`, in the one field a batch is a function of. */
export interface StageTraffic {
  /** `null` runs the building's own profile — the same convention `BatchRequest` uses. */
  readonly arrivalRatePctPop5min: number | null;
}

export interface CampaignStage {
  /** Must equal a scenario id in `data/scenario-goals.json`, or no goal here has a measured rate. */
  readonly id: string;
  readonly name: string;
  /** § 5.4's *"each stage adding exactly one concept"*, in the stage's own words. */
  readonly teaches: string;
  /** § 5.2's *"2–3 sentences of plain language"*. Checked, including the count. */
  readonly brief: readonly string[];
  readonly building: string;
  readonly traffic: StageTraffic;
  readonly durationS: number;
  readonly dispatcher: StageDispatcher;
  /** The tuning seed set, explicitly (§ 5.2). */
  readonly seeds: PublishedSeedSet;
  /** Disjoint from {@link seeds} — CLAUDE.md § Tuning discipline. Derived-seed disjointness. */
  readonly holdoutSeeds: PublishedSeedSet;
  /** How many runs a goal is judged over. */
  readonly replications: number;
  /**
   * The goals, as kinds and thresholds only.
   *
   * No target is authored here. The bar is the count `data/scenario-goals.json` published for this
   * stage, and `campaign/judge.ts` reads it from there. A number written down twice is a number
   * that can drift, and this repository has three of those on the record.
   */
  readonly goals: readonly GoalSpec[];
  /**
   * One suggested lever per fail state, or `null` where the fail state cannot arise here.
   *
   * `null` is only legal for `locked-out`, and only on a building that declares no access zone —
   * which `parse.ts` derives from the building rather than trusting. Every other `null` is a
   * violation, and a lever outside {@link StageDispatcher.editable} is a violation.
   */
  readonly levers: Readonly<Record<FailState, string | null>>;
}

export interface Campaign {
  /** Where the file came from, so a stale stage has an owner. */
  readonly generatedBy: string;
  readonly contract: string;
  /** § 5.4's progression, in play order. The array's order **is** the order. */
  readonly stages: readonly CampaignStage[];
}
