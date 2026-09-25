/**
 * **The fix cases held from the list, each with the measurement that holds it** —
 * [§ D1020](../../../../DECISIONS.md), GitHub issue #602.
 *
 * Under the single-pair judge every shipped case's diagnosed repair cleared its letter's morning,
 * and that was the whole of the evidence a case was solvable. Under `fixit/judge.ts`'s fifty
 * mornings it is not enough, and four cases' own answers failed. One was re-authored and three are
 * held. [§ D525](../../../../DECISIONS.md)
 * clause 3 says a scenario with no demonstrated way through *"is a diagnosis scenario … or it is not
 * a scenario"*, and none of these declares itself a diagnosis — so they are **held**: drawn in the
 * list with their reason, never opened and never silently removed. Holding is the clause of § D1020
 * the product owner is most likely to reverse, and reversing it is deleting a row here.
 *
 * Each was re-authoring's candidate first — on demand only, never on the bar and never on the seed,
 * which is the ruling's rule. All four were re-measured at their shipped arrival rate × 0.8, × 1.25
 * and × 1.5, answer and placebo, fifty mornings each. **`controller-sends-every-car` came back** at
 * × 1.25 (5 → 6.25 %/5 min): its answer then removes +2.36 waits a morning (+0.56 to +4.16) with the
 * rest unharmed and the placebo refused, so it was re-authored rather than held, its figures re-taken
 * in `cases.test.ts`. **The other three did not**: at every rate either the letter's own morning
 * stopped clearing — which would mean rewriting the letter, not the demand — or the answer's effect
 * stayed indistinguishable from none, or (`everyone-leaves-at-once`) the rest of the building stayed
 * shown worse. § D1020 carries that table. A case comes back by
 * being rewritten until `cases.test.ts`'s judge passes its answer and refuses its placebo, and then
 * leaving this register on the same commit; `cases.test.ts` holds the register in both directions,
 * so a held case whose answer starts passing fails the suite until it is released.
 *
 * ## The measurements, at k = 50 (the letter's morning and forty-nine derived), on `702991b`
 *
 * Per-morning complaint reduction, two-sided 95 % paired-t; *rest* is the rest of the building's
 * per-morning change in points.
 *
 * | case | the diagnosed repair | the +3 cm/s placebo |
 * |---|---|---|
 * | `cars-that-always-go-home` | +0.62 [−0.37, +1.61] waits a morning — cannot be told from no change | clears the letter's morning; −0.60 [−1.70, +0.50] |
 * | `everyone-leaves-at-once` | +3.10 [+1.86, +4.34], but the rest −3.09 [−3.78, −2.40] points: shown worse than the 2-point floor | **passes**: +1.24 [+0.21, +2.27], rest +0.06 [−0.68, +0.80] |
 * | `controller-sends-every-car`, as shipped at 5 %/5 min | +0.96 [−0.41, +2.33] — cannot be told from no change; **re-authored**, not held | clears the letter's morning; −0.12 [−0.97, +0.73] |
 * | `gym-on-the-top-floor` | −0.06 [−0.81, +0.69] — no change | refused at the letter's morning; +0.08 [−0.52, +0.68] |
 *
 * `everyone-leaves-at-once` fails twice over: its answer buys the letter's relief with the rest of
 * the building, and a change that should do nothing passes its judge — so the case cannot tell an
 * answer from a placebo, which is the one thing a scenario's judge exists to do.
 */

/**
 * The register. Player-facing: the reason is drawn beside the held row, so it carries no figure —
 * the figures are the table above and § D1020, where a re-measurement can move them — and it says
 * only what the measurement supports.
 */
export const HELD_FIX_CASES: Readonly<Record<string, string>> = Object.freeze({
  'cars-that-always-go-home':
    'Held back. The change its diagnosis names made no difference fifty mornings could tell from luck, so this letter cannot be answered honestly yet.',
  'everyone-leaves-at-once':
    'Held back. The change its diagnosis names clears the letter by making the rest of the building worse, and a change that should do nothing passes here too.',
  'gym-on-the-top-floor':
    'Held back. The change its diagnosis names made no difference fifty mornings could tell from luck, so this letter cannot be answered honestly yet.',
});

/** Why a case is held, or `undefined` for a case the list offers. */
export function heldReasonOf(caseId: string): string | undefined {
  return Object.hasOwn(HELD_FIX_CASES, caseId) ? HELD_FIX_CASES[caseId] : undefined;
}

/** Whether a case is offered — the list opens these and only these. */
export function isOffered(caseId: string): boolean {
  return heldReasonOf(caseId) === undefined;
}
