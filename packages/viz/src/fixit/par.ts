/**
 * **A fix case's par: the cheapest change we tried that fixes it** — [§ D1184](../../../../DECISIONS.md),
 * the swarm's Q3 ruling, clause 4 (S1's form).
 *
 * ## What it is for
 *
 * A fixed case used to end the search: the verdict landed, the case was marked, and nothing on the
 * card said whether the order was dear or cheap for this letter. The route census measured that most
 * cases clear at more than one price and seven of fifteen have a free clearing route, so there is
 * something left to find after a clear. The par is that, stated on the fixed card and nowhere else:
 * *the cheapest change we tried that fixes this letter, judged on the same forty-nine mornings*, and
 * what the player's own order cost beside it. **It pays nothing and moves no verdict**: a fixed case
 * is fixed at any price inside its budget, and the chime award is the same either way.
 *
 * ## What the figure is, and is not
 *
 * - **A minimum over a sample.** The routes are `routes.test-helper.ts#routesFor`'s role-blind
 *   sample, the same the census counts, so the sentence says *we tried* and never claims the
 *   cheapest possible. A player who finds a cheaper fix has found one the sample did not try, and
 *   the card says so in those words.
 * - **Judged as a press is judged.** A route counts only if it clears the letter's morning **and**
 *   holds on the forty-nine derived mornings with the judge's own futility looks
 *   (`par.test-helper.ts`). A gate clear that the mornings refuse is not a par.
 * - **Priced as the spent row prices**: `engine.ts#spendOf`'s total at the schedule's figures.
 *
 * ## How it is pinned
 *
 * {@link FIXIT_PAR} is `routeCensus.sweep.test.ts`'s output under `ELEVATOR_SIM_FIXIT_ROUTES=deep`,
 * pasted rather than edited, and that sweep re-derives every row nightly. `par.test.ts` holds, always
 * on, that every offered case has a row and that a row's par never sits where the census found no
 * clearing route.
 *
 * ## The mark, and where nothing is drawn — [§ D1234](../../../../DECISIONS.md)
 *
 * A fixed case at or under its par carries `scenario/par.ts`'s mark, on the fixed card's line and on
 * the case list's row. **Where the par is free and the fix bought nothing, neither the line nor the
 * row's par is drawn**: a free par is matched by every fix that buys nothing, so the comparison
 * records nothing about this player's order. A fix that spent more than a free par still reads the
 * line, because that a free fix exists is news to that player.
 *
 * Pure. No DOM, no data read.
 */

import { PAR_MARK_COPY, parMarkOf } from '../scenario/par.js';

/** One case's par. `units` is `null` where no clearing route the sample tried held on the mornings. */
export interface FixitParRow {
  readonly units: number | null;
  /** Clearing routes judged on the forty-nine mornings, cheapest first, before one held. */
  readonly judged: number;
}

/**
 * The measurement, per offered case — `routeCensus.sweep.test.ts`'s `par` output, pasted rather
 * than edited: `ELEVATOR_SIM_FIXIT_ROUTES=deep FIXIT_ROUTES_OUT=<path> npx vitest run --project viz
 * src/fixit/routeCensus.sweep.test.ts`, run by lane AK-F on 2026-09-26 on `ccceb8a`'s tree, fifteen
 * cases in 317 s in one vitest process beside the survivor regeneration. The route that set
 * each par is printed by the sweep and deliberately not written here: this module ships, and a route
 * label is the answer the fixed card must not print. Fourteen pars are the cheapest gate-clearing
 * route and held on the first judgement; `bed-cars-locked-out` and `every-deck-calls-itself-full`
 * each had a cheaper gate clear the forty-nine mornings refused. Two cases have a free par.
 */
export const FIXIT_PAR: Readonly<Record<string, FixitParRow>> = Object.freeze({
  'sleeping-sky-lobby': { units: 0, judged: 1 },
  'zoning-starves-the-top': { units: 6, judged: 1 },
  'three-cars-one-cars-work': { units: 0, judged: 1 },
  'doors-that-never-close': { units: 2, judged: 1 },
  'car-park-nobody-serves': { units: 6, judged: 1 },
  'express-that-stops-everywhere': { units: 6, judged: 1 },
  'deliveries-on-the-passenger-group': { units: 2, judged: 1 },
  'one-start-time': { units: 2, judged: 1 },
  'every-letter-says-nine': { units: 2, judged: 1 },
  'bed-cars-locked-out': { units: 6, judged: 2 },
  'two-cars-out-wrong-month': { units: 6, judged: 1 },
  'every-deck-calls-itself-full': { units: 6, judged: 3 },
  'restaurant-above-the-ballroom': { units: 2, judged: 1 },
  'controller-sends-every-car': { units: 2, judged: 1 },
  'let-faster-than-the-lifts': { units: 2, judged: 1 },
});

/** The case's par row, or `undefined` for a case the table does not cover. */
export function fixitParOf(caseId: string): FixitParRow | undefined {
  return FIXIT_PAR[caseId];
}

/** Every string the par draws. One place, so no screen invents a second. */
export const FIXIT_PAR_COPY = Object.freeze({
  under: 'Yours cost less than any fix we tried.',
  same: 'Yours cost the same.',
  pays: 'Matching it or beating it pays nothing extra.',
  /*
   * A case fixed before its cost was kept on this device (lane AL-B, seat C D5): the par is still
   * drawn, and the comparison is withheld rather than guessed.
   */
  unrecorded: 'What your fix cost was not kept on this device, so it is not compared.',
  /* The case list's short form, on a fixed row. */
  tagPar: 'par',
  tagYours: 'yours',
});

function unitsOf(units: number): string {
  return `${String(units)} ${units === 1 ? 'unit' : 'units'}`;
}

/**
 * **The par line on a fixed card**, or `undefined` where the case has no par.
 *
 * Drawn only beside a *fixed* verdict: `spentUnits` is what the order that verdict measured costs,
 * the spent row's own figure. The sentence names the sample (*we tried*) and the judge (*the same
 * forty-nine mornings*), gives both prices, and says it pays nothing.
 */
export function fixitParLineOf(caseId: string, spentUnits: number | undefined): string | undefined {
  const row = fixitParOf(caseId);
  if (row === undefined || row.units === null) return undefined;
  /* § D1234: a free fix beside a free par is not compared, since every free fix would match it. */
  if (row.units === 0 && spentUnits === 0) return undefined;
  const mark = parMarkOf(row.units, spentUnits);
  const lead = mark === undefined ? '' : `${PAR_MARK_COPY[mark]} `;
  const comparison =
    spentUnits === undefined
      ? FIXIT_PAR_COPY.unrecorded
      : spentUnits < row.units
      ? FIXIT_PAR_COPY.under
      : spentUnits === row.units
        ? FIXIT_PAR_COPY.same
        : `Yours cost ${unitsOf(spentUnits)}.`;
  return (
    `${lead}The cheapest change we tried that fixes this letter, judged on the same forty-nine mornings, ` +
    `cost ${unitsOf(row.units)}. ${comparison} ${FIXIT_PAR_COPY.pays}`
  );
}

/**
 * **The par on the case list's fixed row** — lane AL-B, the post-AK panel's seat C D5: *"The list
 * card says only FIXED · on your own, with no par."* The short form of {@link fixitParLineOf}:
 * *par 2 u · yours 2 u*, or *par 2 u* where the fix's cost was not kept. `undefined` where the case
 * has no par.
 */
export function fixitParTagOf(caseId: string, spentUnits: number | undefined): string | undefined {
  const row = fixitParOf(caseId);
  if (row === undefined || row.units === null) return undefined;
  /* § D1234: nothing to compare where a free fix meets a free par. */
  if (row.units === 0 && spentUnits === 0) return undefined;
  const par = `${FIXIT_PAR_COPY.tagPar} ${String(row.units)} u`;
  if (spentUnits === undefined) return par;
  const mark = parMarkOf(row.units, spentUnits);
  const tagged = `${par} · ${FIXIT_PAR_COPY.tagYours} ${String(spentUnits)} u`;
  return mark === undefined ? tagged : `${tagged} · ${mark === 'at' ? PAR_MARK_COPY.tagAt : PAR_MARK_COPY.tagUnder}`;
}
