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

/** The whole document. */
export interface WrinkleLibrary {
  readonly version: number;
  readonly templates: readonly WrinkleTemplate[];
  readonly unexpressible: readonly UnexpressibleWrinkle[];
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
