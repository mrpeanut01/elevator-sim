/**
 * The wrinkle library's shape — GitHub issue **#159**, `GAMEPLAY_AND_NAVIGATION.md` § 17.
 *
 * ## Why this module exists
 *
 * § 17 says a day is a **draw**, and says why the library must be data:
 *
 * > the wrinkle library must be data so a day is a row rather than code
 *
 * That is `CLAUDE.md` invariant 7 — *anything tunable is data, not code* — pointed at content. The
 * seven events this replaces were object literals in `shift/events.ts`, so adding a twenty-fourth
 * meant editing a module; now it means adding a row.
 *
 * ## The rule every template obeys, and the three kinds that therefore are not here
 *
 * A template's effect is expressed **only** in fields the engine actually reads — the same four
 * {@link WrinkleEffect} carries, which are `EventEffect`'s own. `shift/events.ts`'s docstring is the
 * argument, and it is the most important sentence in this directory:
 *
 * > a dead *caption* is actively false … a label that does not describe the picture under it, which
 * > is the failure the honesty card exists to prevent.
 *
 * § 17 names six kinds of wrinkle. **Three of them cannot be written in these four fields**, so
 * they are recorded in the library's `unexpressible` list with the seam each needs rather than
 * authored as templates that would render a note no passenger experiences. `parse.ts` requires that
 * list to be non-empty for exactly as long as it is true, and `wrinkles.test.ts` holds it against
 * the document.
 */

import type { DirectionalSplit } from '@elevator-sim/core/browser';

/** Which days a template may be drawn on. */
export type WrinkleDays = 'weekday' | 'weekend' | 'campaign';

/** Every value of {@link WrinkleDays}, for iteration and for the parser's check. */
export const WRINKLE_DAYS: readonly WrinkleDays[] = Object.freeze([
  'weekday',
  'weekend',
  'campaign',
]);

/**
 * What a wrinkle does to the run, in the four fields the engine reads.
 *
 * Structurally `EventEffect` minus `writes`, which is **derived** rather than authored: a template
 * that declared its own `writes` could disagree with its own effect, and `shift/events.ts` already
 * cross-checks the struct against the patch. Deriving it makes the disagreement unrepresentable.
 */
export interface WrinkleEffect {
  readonly changesNothing: boolean;
  readonly arrivalRateMultiplier: number | null;
  readonly directionalSplit: DirectionalSplit | null;
  readonly carsOutOfService: number;
  readonly derate: {
    readonly cars: number;
    readonly fromFraction: number;
    readonly toFraction: number;
  } | null;
  /**
   * Where the wrinkle sits on a whole authored day — {@link WholeDayPlacement}. `null` on a
   * wrinkle that sets no mix (it has nothing to place: its level and cars apply as they do on a
   * slice). Optional in the type so a hand-built effect in a test reads as *no placement*; the
   * loader always fills it, and refuses a mix-setting template that has none.
   */
  readonly wholeDay?: WholeDayPlacement | null;
}

/**
 * **Where a mix-setting wrinkle sits on a whole authored day** — [§ D1057](../../../../DECISIONS.md),
 * the week swarm's ruling S1 + S3 (2–1, S2's condition kept).
 *
 * On a slice the run *is* the episode, so the wrinkle's split applies to the whole run. On a whole
 * day (`office-day`, ten hours) `core` refuses a run-wide split beside a template that varies its own
 * mix, and a run-wide multiplier multiplies ten hours rather than the event. So a wrinkle that sets
 * a mix declares where it sits in the day instead: a clock window, the level inside it, and the
 * sentence that describes the day it makes. `shift/episode.ts#spliceEpisode` writes it into the
 * run's own copy of the day's phase list, with 60 s ramps at each edge, and nothing outside the
 * window moves.
 *
 * The times are **clock minutes since midnight** (authored as `"10:00"`), because the note names a
 * clock time and the day template decides whether it contains it — a placement the day's clock
 * cannot hold is refused by the splice, and a template whose placement is refused outright is not
 * drawn on a whole day at all (S2's condition, {@link WholeDayRefusal}).
 */
export interface WholeDayEpisode {
  readonly kind: 'episode';
  /** Clock minutes since midnight at which the episode's mix and level begin. */
  readonly fromMin: number;
  /** Clock minutes since midnight at which they end. Strictly after {@link fromMin}. */
  readonly toMin: number;
  /**
   * The level inside the window, as a phase intensity in `[0, 1]` (`1` is the day's own peak), or
   * `'authored'` to keep the day's own level there and move only the mix.
   */
  readonly intensity: number | 'authored';
  /**
   * A multiplier on the **whole** day's rate, or `null` for none. Refused above `1` at load: a surge
   * is an episode and never the whole day, which is the defect the placement exists to end (the
   * shipped fire drill made a day 1.6 times busier). Below `1` it states that the whole day is
   * lighter — a weekend, a day half the floor is off — which is a claim about the day rather than
   * about the event, and it keeps the figure the slice always had.
   */
  readonly dayRateMultiplier: number | null;
  /**
   * The note on a whole day, with `{episode}` where the window is named (*"from 10:00 to 10:20"*)
   * and the template's own axis placeholders. Replaces the slice note on a spliced run, so the
   * brief says when and what, from the same numbers the splice used.
   */
  readonly note: string;
  /** Why here, how long and how busy — an uncited assumption says so. Not player-facing. */
  readonly reason: string;
}

/** A mix-setting wrinkle that cannot be placed honestly on a whole day, with the reason. */
export interface WholeDayRefusal {
  readonly kind: 'refused';
  readonly reason: string;
}

export type WholeDayPlacement = WholeDayEpisode | WholeDayRefusal;

/** What an axis value may move about a placement: when, and how busy. */
export interface WholeDayOverride {
  readonly fromMin?: number;
  readonly toMin?: number;
  readonly intensity?: number | 'authored';
}

/**
 * One value on a parameter axis: a note fragment, and the effect fields it overrides.
 *
 * The overrides are a **partial** effect rather than a whole one, so a value says only what it
 * changes and a template's base effect stays the single statement of what the wrinkle is.
 */
export interface WrinkleAxisValue {
  readonly id: string;
  /** Substituted into the template's note at `{axisId}`. May be empty when the axis is silent. */
  readonly label: string;
  readonly arrivalRateMultiplier?: number | null;
  readonly directionalSplit?: DirectionalSplit | null;
  readonly carsOutOfService?: number;
  readonly derate?: WrinkleEffect['derate'];
  /** Moves the template's whole-day window or level for this value — `caterers`' *when*. */
  readonly wholeDay?: WholeDayOverride;
}

/** A parameter axis: § 17's *"a shaft out (which, from when, until when)"* made countable. */
export interface WrinkleAxis {
  readonly id: string;
  readonly values: readonly WrinkleAxisValue[];
}

/** One row of the library. */
export interface WrinkleTemplate {
  readonly id: string;
  readonly name: string;
  /** Carries `{axisId}` placeholders, one per axis whose label is non-empty. */
  readonly note: string;
  readonly days: WrinkleDays;
  readonly effect: WrinkleEffect;
  readonly axes: readonly WrinkleAxis[];
}

/** A kind of wrinkle § 17 names that the engine cannot express, and the seam it needs. */
export interface UnexpressibleWrinkle {
  readonly kind: string;
  readonly needs: string;
}

/**
 * How often a **contract** day is a day of its own — GitHub issue **#564**.
 *
 * A career day asks three questions in order: does the contract's calendar book one
 * (`campaign/calendar.ts`), has the wear clock rolled a failure (`campaign/economy.ts`), and — on
 * the days neither claims — does the building have a day of its own. This is the share that
 * answers the third, and it is data for `CLAUDE.md` invariant 7's reason: the rate a career meets
 * an event at is game balance, so it is a row rather than a literal in a reducer.
 *
 * Its type, range and default are declared beside the parser
 * (`parse.ts#CAMPAIGN_DAY_EVENT_SHARE`) rather than only in the document, which is invariant 8's
 * shape for a tunable — a value out of range is a load-time refusal with the bound named.
 */
export interface CampaignDayRules {
  /** Per cent of otherwise-unclaimed contract days that draw a wrinkle. `0`–`100`. */
  readonly eventSharePct: number;
}

/** The whole document. */
export interface WrinkleLibrary {
  readonly version: number;
  readonly templates: readonly WrinkleTemplate[];
  readonly unexpressible: readonly UnexpressibleWrinkle[];
  readonly campaignDay: CampaignDayRules;
}

/**
 * A template with one value chosen on every axis — the thing a day actually gets.
 *
 * The `id` composes the template's with each chosen value's, so two draws of `shaft-out` that
 * differ in their window are different wrinkles for the rotation rule to keep apart. § 17's
 * *"no wrinkle template twice in fourteen"* is nonetheless about the **template**, which is why
 * {@link templateId} is carried separately rather than parsed back out of the composed id.
 */
export interface DrawnWrinkle {
  readonly id: string;
  readonly templateId: string;
  readonly name: string;
  readonly note: string;
  readonly effect: WrinkleEffect;
}
