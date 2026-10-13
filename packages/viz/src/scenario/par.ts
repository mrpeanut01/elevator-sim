/**
 * **The par mark: a clear at or under the cheapest way through we tried** — [§ D1234](../../../../DECISIONS.md),
 * wave AL's swarm DN, Q3 ruling item 3.
 *
 * A par is the cheapest price at which a measured search found a way through: for a fix case, the
 * route census judged on the forty-nine mornings (`fixit/par.ts`); for a campaign stage, the
 * survivor census's named ways through at the budget the stage opens on (`campaign/stagePar.ts`).
 * The mark says how a player's own clear compares with it. ~~**It pays nothing and unlocks nothing**,
 * `docs/38` § 2.4's flat award per completed turn being the only pay a clear earns, and a clear is a
 * clear at any price inside its budget.~~ *Amended by [§ D1417](../../../../DECISIONS.md), swarm DS's
 * Q3 ruling: a clear that earns the mark pays `data/chime-ledger.json`'s `scenario-at-par` award,
 * once per stage or case, keyed by the scenario like its clear.* It still unlocks nothing, and a
 * clear is still a clear at any price inside its budget. The award is flat and a property of the
 * scenario's price, never a figure a run measured, so § D526 clause 2 holds. {@link PAR_PAYS_LINE}
 * is the one sentence every surface says it in.
 *
 * **No mark where the par is free.** A free par is matched by any clear that buys nothing, so a
 * mark there is earned by every such clear and records nothing (S2's measurement: the cheapest way
 * through stages 1, 6, 7 and 8 was 0 units when the swarm sat). A clear that cost more than a free
 * par is above it and is not marked either. So on a free par the mark is never drawn, and that is
 * the rule rather than a gap.
 *
 * Pure. No DOM, and no data read at run time: the award is the bundled ledger's, projected to its
 * earn half the way `everyday/deviceChimes.ts#CHIME_AWARDS` is, so no binding here holds a source.
 */

import { chimeEarnTableOf, parseChimeLedger } from '@elevator-sim/core/browser';

/*
 * Named `chimeLedgerDocument` rather than `document`, for `boundaries.test.ts`' bare-global rule, as
 * `everyday/chimesPanel.ts` and `everyday/deviceChimes.ts` name it.
 */
import chimeLedgerDocument from '../../../../data/chime-ledger.json' with { type: 'json' };

/** `data/chime-ledger.json`'s `scenario-at-par` award (§ D1417), read once from the earn projection. */
export const PAR_AWARD_CHIMES: number =
  chimeEarnTableOf(parseChimeLedger(chimeLedgerDocument)).awards['scenario-at-par'] ?? 0;

/**
 * **What a par pays, in one sentence every par line ends with** — [§ D1417](../../../../DECISIONS.md).
 * It read *"Matching it or beating it pays nothing extra"* on the stage row, the stage page and the
 * fix-it card, which stopped being true on the commit that made a par pay.
 */
export const PAR_PAYS_LINE: string =
  PAR_AWARD_CHIMES > 0
    ? `Matching it or beating it pays ${String(PAR_AWARD_CHIMES)} ${PAR_AWARD_CHIMES === 1 ? 'chime' : 'chimes'}, once.`
    : 'Matching it or beating it pays nothing extra.';

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
