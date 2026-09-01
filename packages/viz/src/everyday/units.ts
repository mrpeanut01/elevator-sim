/**
 * **Metres or feet, and the one rule that makes it safe** — ENGINE_CONTRACT § 13, the clause
 * `everyday/figures.ts` does not own.
 *
 * > Metres by default; the `Units` setting switches machine specs to feet and **must convert, not
 * > relabel**.
 *
 * GitHub issue #170's Units half. Until this module existed, `grep -rin "imperial"
 * packages/viz/src --include='*.ts'` found no non-test occurrence: no field of any settings type
 * and no display formatter read a metres-or-feet preference, so the row § 15.1 specifies was drawn
 * as a stated absence in `settingsView.ts#SETTINGS_ABSENCES`. The work was never the control — the
 * control is designed — it was **a consumer**. This module is the consumer, and
 * [§ D448](../../../../DECISIONS.md) is the record.
 *
 * ## The correctness bite, and how the module shape is the proof
 *
 * `CLAUDE.md`'s conventions: **units are SI internally** — metres, seconds, kilograms, m/s — and
 * imperial values appear *only* in reference data and display formatting, **always with the unit in
 * the identifier** (`ratedLoadLb`, `speedFpm`). A conversion that leaked out of the display layer
 * into a stored figure would be a defect of a different order from a mislabelled one: it would
 * reach a run record, a persisted profile, a submitted run or a published interval, and every one
 * of those is compared against numbers taken under the other preference.
 *
 * **So this module exports no converted number.** {@link feetOf} is module-private and every
 * exported entry point that touches it returns a `string`. There is no signature here through which
 * a converted quantity can be assigned to anything, which makes the invariant a fact about the
 * types rather than a rule somebody has to remember; `units.test.ts` asserts it from the other end
 * as well, by running the same configuration under both preferences and requiring the legs to be
 * identical.
 *
 * The one exported thing that is not a string is {@link EverydayUnits} itself, which is the
 * preference, not a quantity.
 *
 * ## Why the conversion is exact
 *
 * A foot is **exactly 0.3048 m** by the 1959 international agreement, so this is a definition
 * rather than a measurement and needs no citation to lift-engineering literature. Nothing here
 * rounds a stored value; the rounding is in the formatting, at the precision each caller asks for,
 * and the caller's precision is the one it already printed under metres. That is what keeps this
 * change from moving a metric string: every metric arm below reproduces exactly what its site
 * printed before this module existed, with one deliberate exception noted on {@link speedFigure}.
 *
 * ## What the preference reaches, and what it does not
 *
 * It reaches **machine specifications** — the rated speed of a car and the travel it makes — on the
 * three Everyday surfaces that print them: § 13.2's rating plate and the machine panel beside it on
 * the drawing board, the tuner's machine card (whose readout's own docstring says it is *"in the
 * units the plate uses"*, so the two could not be allowed to disagree), and the daily loop's
 * *Rated speed* fact.
 *
 * Three metre-or-foot-adjacent figures are deliberately **left in their own unit**, because none of
 * them is a machine specification:
 *
 * - **`CAPACITY … lb` on the rating plate.** `ratedLoadLb` is reference data with the unit in the
 *   identifier — the convention's own worked example — and § 13's clause is about metres and feet.
 *   A plate is where a real machine's imperial rated load belongs.
 * - **`+0.5 m/s` on the fix screen's repair steps.** That is a **price**, quoted in the unit § 9
 *   prices it in, not a reading off a machine. Converting a shop's price list is a different
 *   decision from converting a spec.
 * - **`shift/contracts.ts`'s building stat line.** `shift/` is shared with the Engineer surface,
 *   whose own contract governs its figures; this preference is § 13's, and § 13 is the Casual
 *   engine contract.
 *
 * That list is a claim about this tree and it is asserted rather than left in prose:
 * `units.test.ts` greps the Everyday directory for a bare `m/s` literal and requires every one it
 * finds to be on that list or to be reached through this module.
 */

/** Which way a machine specification reads. `metric` is § 13's default and this build's. */
export type EverydayUnits = 'metric' | 'imperial';

/** § 13's *metres by default*, in one place, so no caller invents a second default. */
export const DEFAULT_EVERYDAY_UNITS: EverydayUnits = 'metric';

/** Both values, for a caller that iterates them — a settings row, a test, a corpus adapter. */
export const EVERYDAY_UNITS: readonly EverydayUnits[] = Object.freeze([
  'metric',
  'imperial',
] as const);

/**
 * Whether a restored value is one this build knows.
 *
 * The load path's guard, on `profile.ts`'s own rule that a shape this build cannot vouch for is
 * refused whole rather than patched: a third unit written by some later build must not come back
 * as a silent `metric`, because a preference restored as something the player did not choose is
 * the same lie as a control that does not write.
 */
export function isEverydayUnits(value: unknown): value is EverydayUnits {
  return value === 'metric' || value === 'imperial';
}

/**
 * Exactly 0.3048 metres, by the 1959 international agreement on the foot.
 *
 * **Module-private on purpose** — see the docstring above. The whole guarantee this module offers
 * is that a converted number has no way out of it, and an exported metres-to-feet function is the
 * one thing that would give it one.
 */
const METRES_PER_FOOT = 0.3048;

/** Metres to feet. Private, for the reason on {@link METRES_PER_FOOT}. */
function feetOf(metres: number): number {
  return metres / METRES_PER_FOOT;
}

/** The suffix a speed carries, per preference. */
const SPEED_UNIT: Readonly<Record<EverydayUnits, string>> = Object.freeze({
  metric: 'm/s',
  imperial: 'ft/s',
});

/** The suffix a distance carries, per preference. */
const LENGTH_UNIT: Readonly<Record<EverydayUnits, string>> = Object.freeze({
  metric: 'm',
  imperial: 'ft',
});

/**
 * A rated speed, converted and suffixed — `2.50 m/s` or `8.20 ft/s`.
 *
 * `decimals` is the caller's, because each site already had one and § 13's rule is about the
 * *number*, not about a house precision: the rating plate and the tuner print two places, and a
 * class band prints two on each end of its range.
 *
 * **The one metric arm this module moved.** `today.ts`'s *Rated speed* fact printed
 * `String(max) + ' m/s'` — `2.5 m/s`, and `8 m/s` for a shuttle — while the plate two screens over
 * printed `2.50 m/s` for the same car. That inconsistency predates this module and is not worth
 * keeping through a change whose whole subject is how a machine specification reads, so the fact
 * takes the plate's precision. It is the only metric string this lane changed, and it changes no
 * figure's value.
 */
export function speedFigure(mps: number, units: EverydayUnits, decimals = 2): string {
  const value = units === 'imperial' ? feetOf(mps) : mps;
  return `${value.toFixed(decimals)} ${SPEED_UNIT[units]}`;
}

/**
 * A distance, converted and suffixed — `42.0 m` or `137.8 ft`.
 *
 * Travel on the plate prints one place; a machine class's declared maximum rise prints none,
 * because the catalogue authors it as a whole number of metres.
 */
export function lengthFigure(metres: number, units: EverydayUnits, decimals = 1): string {
  const value = units === 'imperial' ? feetOf(metres) : metres;
  return `${value.toFixed(decimals)} ${LENGTH_UNIT[units]}`;
}

/**
 * The converted number alone, for a chip in a row whose readout carries the unit once.
 *
 * The tuner's speed ladder is drawn as bare figures under a readout that names the unit, and a
 * ladder that stayed in metres beside a readout in feet is the incoherence § D359 found one screen
 * over: each half internally honest, the pair contradictory. A **string**, like everything else
 * exported here, so a bare converted value still cannot be assigned to a numeric field.
 */
export function speedValueFigure(mps: number, units: EverydayUnits, decimals = 2): string {
  const value = units === 'imperial' ? feetOf(mps) : mps;
  return value.toFixed(decimals);
}

/**
 * A speed range on one suffix — `0.50–1.00 m/s`, `1.64–3.28 ft/s`.
 *
 * Composed here rather than at the two call sites, so the pair cannot end up converted on one end
 * and relabelled on the other. That is not a hypothetical: a range is exactly where a hand-written
 * conversion divides the number a reader checks and forgets the one they do not.
 */
export function speedRangeFigure(
  lowMps: number,
  highMps: number,
  units: EverydayUnits,
  decimals = 2,
): string {
  const low = units === 'imperial' ? feetOf(lowMps) : lowMps;
  const high = units === 'imperial' ? feetOf(highMps) : highMps;
  return `${low.toFixed(decimals)}–${high.toFixed(decimals)} ${SPEED_UNIT[units]}`;
}

/**
 * § 15.1's *Units* row, as words — the label, the § 16 register clause, and the two faces.
 *
 * Held here beside the conversion rather than in `settingsView.ts` for the reason § D227 gives:
 * the row's note is a claim about what the control reaches, and a note that lived away from the
 * conversion is a note that goes on describing a scope the conversion has since changed. The row
 * says *machine specifications* because that is exactly the set enumerated in this module's
 * docstring and asserted in its test — not *every figure*, which would be a promise the daily
 * loop's waits and the campaign's money break on the next screen a player opens.
 */
export const UNITS_ROW_COPY = Object.freeze({
  label: 'Units',
  note: 'machine specifications read in metres or feet',
  /** The pill's text, per preference. The prototype's own two words (§ 18, `imperial`). */
  face: Object.freeze({ metric: 'metres', imperial: 'feet' }) as Readonly<
    Record<EverydayUnits, string>
  >,
});
