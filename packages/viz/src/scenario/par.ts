/**
 * **The par mark: a clear at or under the cheapest way through we tried** — [§ D1234](../../../../DECISIONS.md),
 * wave AL's swarm DN, Q3 ruling item 3.
 *
 * A par is the cheapest price at which a measured search found a way through: for a fix case, the
 * route census judged on the forty-nine mornings (`fixit/par.ts`); for a campaign stage, the
 * survivor census's named ways through at the budget the stage opens on (`campaign/stagePar.ts`).
 * The mark says how a player's own clear compares with it. **It pays nothing and unlocks nothing**,
 * `docs/38` § 2.4's flat award per completed turn being the only pay a clear earns, and a clear is a
 * clear at any price inside its budget.
 *
 * **No mark where the par is free.** A free par is matched by any clear that buys nothing, so a
 * mark there is earned by every such clear and records nothing (S2's measurement: the cheapest way
 * through stages 1, 6, 7 and 8 was 0 units when the swarm sat). A clear that cost more than a free
 * par is above it and is not marked either. So on a free par the mark is never drawn, and that is
 * the rule rather than a gap.
 *
 * Pure. No DOM, no data read.
 */

/** How a clear compares with the par, where that comparison earns a mark. */
export type ParMark = 'under' | 'at';

/** The words a mark is drawn in. One place, so the fix-it list and the hub say the same thing. */
export const PAR_MARK_COPY = Object.freeze({
  at: 'At par.',
  under: 'Under par.',
  tagAt: 'at par',
  tagUnder: 'under par',
});

/**
 * The mark a clear at `spentUnits` earns against a par of `parUnits`, or `undefined` for none.
 *
 * `undefined` where there is no par, where the clear's cost was not kept, where the clear cost more
 * than the par, and wherever the par is free (see the module docstring).
 */
export function parMarkOf(parUnits: number | null | undefined, spentUnits: number | undefined): ParMark | undefined {
  if (parUnits === null || parUnits === undefined || spentUnits === undefined) return undefined;
  if (parUnits === 0) return undefined;
  if (spentUnits < parUnits) return 'under';
  if (spentUnits === parUnits) return 'at';
  return undefined;
}
