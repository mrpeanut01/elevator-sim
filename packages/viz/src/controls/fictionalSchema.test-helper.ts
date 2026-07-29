/**
 * A parameter schema for a product this repository does not ship, and will not.
 *
 * **This file is the whole point of W4's acceptance**, and `WAVE6_PLAN.md` § 7 names the risk it
 * exists against:
 *
 * > *"W4's liveness evidence is read off the shipped schema, so a generated control looks live
 * > because the schema happens to fit it. **The evidence is derived from a fictional schema the
 * > product does not ship.**"*
 *
 * That is not pedantry. `docs/10` § 11 W4 asks for a form whose four renderers work *"with no
 * elevator knowledge"*, and there is exactly one way to check that claim: point them at a schema
 * with no elevators in it. A form asserted only against `collectSearchSpace()`'s 49 real
 * dimensions passes whether it is generic or whether it happens to have been written around the
 * ids it saw — which is the same failure `collect.ts` names about hand-listed search spaces, and
 * the same one `collect.test.ts` guards with its own injected namespace.
 *
 * ## What it is a schema *of*
 *
 * A fruit orchard. Nothing here has a counterpart in `data/`: there is no `orchard` section, no
 * `irrigation` term, and no lantern anywhere in `core`. If a control renders `orchard.lanternCount`
 * correctly — with its range, its default, its prose and its two-condition gate — then it renders
 * it off the declaration and nowhere else.
 *
 * ## What it exercises, and why each row is here
 *
 * | row | kind | what it proves |
 * |---|---|---|
 * | `orchard.irrigation` | categorical | a select over declared values, and a **gate** for two other rows |
 * | `orchard.litresPerTree` | continuous, `log` | the log slider, a unit suffix, and a **value-list** gate |
 * | `orchard.pickersOnShift` | integer | the stepper, and a gate expressed as a **numeric range** |
 * | `orchard.nightHarvest` | boolean | the checkbox, and a **boolean** gate, which compares as `"true"` |
 * | `orchard.lanternCount` | integer | a **conjunction** — two conditions, both of which must hold |
 *
 * Five rows, four kinds, both `activeWhen` forms, and a conjunction. The shipped schema has 49
 * dimensions and 13 gates; this has 5 and 2, and it is the one that can prove genericity.
 *
 * ## Why the namespace is a plain object
 *
 * `discoverParameterSchemas` reads a **module namespace** — every export whose name ends
 * `_PARAMETERS` and whose value is an array of specs. A plain object satisfies that structurally,
 * which is exactly what makes the discovery injectable and therefore checkable. `collect.ts` says
 * so in `CollectOptions.source`: *"injectable so `collect.test.ts` can hand in a namespace with an
 * extra schema and prove the discovery really is discovery — a hand-listed collector passes every
 * other test in this file."*
 */

import { collectSearchSpace } from '@elevator-sim/experiments/browser';
import type { SearchSpace } from '@elevator-sim/experiments/browser';

/** The fictional schema's rows, in no particular order — the collector decides gate order. */
export const ORCHARD_PARAMETERS = [
  {
    id: 'orchard.irrigation',
    type: 'categorical',
    values: ['drip', 'flood', 'none'],
    default: 'drip',
    description:
      'How water reaches the trees. Drip lines meter a set volume per tree; flooding fills the row and is measured the same way but wastes more; none leaves the block on rainfall alone, which makes every water figure inapplicable.',
  },
  {
    id: 'orchard.litresPerTree',
    type: 'continuous',
    range: [0.5, 400],
    scale: 'log',
    default: 12,
    unit: 'L',
    description:
      'Water delivered per tree per irrigation cycle. Spans nearly three orders of magnitude, because a nursery whip and a mature standard are not the same plant, so the dimension is searched on a log scale.',
    activeWhen: { 'orchard.irrigation': ['drip', 'flood'] },
  },
  {
    id: 'orchard.pickersOnShift',
    type: 'integer',
    range: [1, 40],
    default: 6,
    description:
      'How many people are picking. A whole number by construction: half a picker is not a configuration, and a search that draws one has been given the wrong kind of dimension.',
  },
  {
    id: 'orchard.nightHarvest',
    type: 'boolean',
    default: false,
    description:
      'Whether picking continues after dusk. Cooler fruit keeps longer and the crew works slower; the trade is the point, and it is not a setting with a good end and a bad end.',
  },
  {
    id: 'orchard.lanternCount',
    type: 'integer',
    range: [0, 200],
    default: 0,
    description:
      'Lanterns hung along the rows. Inert unless picking runs after dusk, and pointless with a crew too small to spread out — so it is gated on both, and it is the row that proves a conjunction is evaluated as a conjunction.',
    activeWhen: {
      'orchard.nightHarvest': ['true'],
      'orchard.pickersOnShift': { min: 4 },
    },
  },
] as const;

/** The namespace `discoverParameterSchemas` reads. One schema, discovered by its name's suffix. */
export const ORCHARD_NAMESPACE: Readonly<Record<string, unknown>> = {
  ORCHARD_PARAMETERS,
  // Two decoys, so the discovery is doing discovery rather than taking the only key present.
  NOT_A_SCHEMA: [{ id: 'orchard.nonsense' }],
  ORCHARD_NOTES: 'the collector must ignore this: the name does not end in the suffix',
};

/**
 * The fictional space.
 *
 * `include: () => true` replaces the default `isProfileAuthorable`, which decides membership by
 * writing the row into a real dispatcher profile and parsing it — a question about elevators that
 * an orchard schema would answer "no" to for every row, and rightly. The predicate is injectable
 * for exactly this reason, and swapping it is not a weakening: every other check the collector
 * performs — malformed rows, contradictory re-declarations, `activeWhen` cycles, log ranges that
 * reach zero — still runs.
 */
export function orchardSpace(): SearchSpace {
  return collectSearchSpace({ source: ORCHARD_NAMESPACE, include: () => true });
}
