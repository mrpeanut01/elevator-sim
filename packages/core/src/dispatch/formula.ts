/**
 * **A priority a dispatcher writes for itself** — a formula over the cost terms the library
 * already has.
 *
 * ```
 * cost(car, call) = Σᵢ wᵢ · normalize(termᵢ) + Σⱼ wⱼ · formulaⱼ(normalize(term₁), normalize(term₂), …)
 * ```
 *
 * ## What it is, and what it is deliberately not
 *
 * A weight vector can say *wait matters twice as much as crowding*. It cannot say *a car that is
 * both far and full is worse than the sum of the two*, or *judge a car by whichever of these is
 * worst*, because a weighted sum is linear. A formula is that missing shape: an expression tree
 * whose leaves are the **normalized** values of library terms (and constants) and whose nodes are
 * `add`, `multiply`, `max` and `min`.
 *
 * It is **data on the profile** (CLAUDE.md invariant 7), not code, and it is not a script that
 * picks a car. The dispatcher asks every car for a cost thousands of times per decision and that
 * question must stay pure, repeatable and free of clocks and dice (invariant 1), or every
 * comparison this repository publishes stops being valid. Each property is true of a formula **by
 * construction**, and is checked before a run rather than trusted during one:
 *
 * - **pure** — a leaf is a library term's own `evaluate`, which is pure, or a constant; the four
 *   operators read their arguments and nothing else;
 * - **non-negative and finite** — every leaf is (`scoreCar` already refuses a term that is not),
 *   and each operator preserves both, so the sum stays monotonic in its own weights;
 * - **bounded in cost** — {@link MAX_FORMULA_NODES} and {@link MAX_FORMULA_DEPTH} cap the tree,
 *   so one formula costs at most a handful of arithmetic operations on values `scoreCar` has
 *   mostly computed already.
 *
 * ## Why the leaves are normalized
 *
 * `waitTime` runs 0–120 s and `stopCount` 0–20. Multiplied raw, the product is in second-stops
 * and its weight means nothing — the failure CLAUDE.md § *Modeling rules* names. So a leaf is the
 * term **after** `normalizeTerm`, on the profile's own references: the same number the weighted
 * sum multiplies by its weight, which is also what makes a formula of one term at weight `w`
 * identical to weighting that term by `w`.
 *
 * ## What a formula is not searched over
 *
 * Its weight is not a declared tunable and `tuning/space` does not sample it: the tree is a
 * player's or an author's structure, and a search over structure is not a search over a range.
 */

import { COST_TERMS_BY_ID, isDeclaredTerm } from './terms/index.js';
import { DispatchError } from './types.js';

/** The four operators. Each maps non-negative finite arguments to a non-negative finite value. */
export const FORMULA_OPS = ['add', 'multiply', 'max', 'min'] as const;
export type FormulaOp = (typeof FORMULA_OPS)[number];

/** How many formulas one profile may carry. */
export const MAX_FORMULAS = 4;
/** How many nodes one formula may hold, leaves included. */
export const MAX_FORMULA_NODES = 15;
/** How deep one formula may nest: a bare leaf is depth 1. */
export const MAX_FORMULA_DEPTH = 4;
/** The largest constant a leaf may hold, and the largest weight a formula may carry. */
export const MAX_FORMULA_NUMBER = 100;

/** One node of the tree, as a profile authors it. Exactly one of the three shapes. */
export type FormulaNode =
  | { readonly term: string }
  | { readonly value: number }
  | { readonly op: FormulaOp; readonly of: readonly FormulaNode[] };

/** One formula, as a profile authors it. */
export interface FormulaSource {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly expression: FormulaNode;
}

/** A formula that has passed {@link resolveFormulas}. */
export interface ResolvedFormula {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly expression: FormulaNode;
  /** Every library term the tree reads, once each, in first-read order. */
  readonly termIds: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walk one tree, refusing what cannot be evaluated honestly. Returns the node count.
 *
 * Written against `unknown` on purpose: a profile reaches the policy as a hand-built object as
 * often as through `dispatcherProfilesSchema`, the same reason `resolveDispatchConfig` re-checks
 * a weight's term id.
 */
function checkNode(
  node: unknown,
  depth: number,
  terms: string[],
  where: string,
): number {
  if (depth > MAX_FORMULA_DEPTH) {
    throw new DispatchError(
      `${where} nests deeper than ${String(MAX_FORMULA_DEPTH)}. A formula is a few terms combined, and a deeper one belongs in a second formula.`,
    );
  }
  if (!isRecord(node)) {
    throw new DispatchError(`${where} holds ${JSON.stringify(node)}, which is not a term, a value or an operation.`);
  }
  const shapes = ['term', 'value', 'op'].filter((key) => Object.hasOwn(node, key));
  if (shapes.length !== 1) {
    throw new DispatchError(
      `${where} must be exactly one of { term }, { value } or { op, of }; it names ${shapes.length === 0 ? 'none of them' : shapes.join(' and ')}.`,
    );
  }
  if (shapes[0] === 'term') {
    const id = node['term'];
    if (typeof id !== 'string' || !isDeclaredTerm(id)) {
      throw new DispatchError(
        `${where} reads term ${JSON.stringify(id)}, which the cost-term library does not declare. A misspelled term would read as nothing, and a product with nothing in it is zero for every car.`,
      );
    }
    if (!COST_TERMS_BY_ID.has(id)) {
      throw new DispatchError(`${where} reads term "${id}", which is declared and not yet implemented, so it has no value to read.`);
    }
    if (!terms.includes(id)) terms.push(id);
    return 1;
  }
  if (shapes[0] === 'value') {
    const value = node['value'];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_FORMULA_NUMBER) {
      throw new DispatchError(
        `${where} holds the value ${String(value)}; a constant must be a finite number from 0 to ${String(MAX_FORMULA_NUMBER)}. A negative one would let a car be rewarded for a property another is charged for.`,
      );
    }
    return 1;
  }
  const op = node['op'];
  if (typeof op !== 'string' || !(FORMULA_OPS as readonly string[]).includes(op)) {
    throw new DispatchError(
      `${where} names the operation ${JSON.stringify(op)}. Known operations: ${FORMULA_OPS.join(', ')}. Subtraction and division are absent on purpose: neither keeps a cost non-negative and finite.`,
    );
  }
  const of = node['of'];
  if (!Array.isArray(of) || of.length < 2) {
    throw new DispatchError(`${where} applies "${op}" to fewer than two things, which combines nothing.`);
  }
  let count = 1;
  for (const [index, child] of (of as readonly unknown[]).entries()) {
    count += checkNode(child, depth + 1, terms, `${where}.of[${String(index)}]`);
  }
  return count;
}

/**
 * Check a profile's formulas, or refuse — the posture of every resolver in this package: each
 * thing refused is a plausible-looking run of a system nobody configured.
 */
export function resolveFormulas(
  source: readonly FormulaSource[] | undefined,
  profileId: string,
): readonly ResolvedFormula[] {
  if (source === undefined || source.length === 0) return NO_FORMULAS;
  if (source.length > MAX_FORMULAS) {
    throw new DispatchError(
      `Dispatcher "${profileId}" carries ${String(source.length)} formulas; a profile may carry at most ${String(MAX_FORMULAS)}.`,
    );
  }
  const seen = new Set<string>();
  const resolved: ResolvedFormula[] = [];
  for (const [index, formula] of source.entries()) {
    const where = `Dispatcher "${profileId}" formula ${String(index + 1)}`;
    if (typeof formula.id !== 'string' || formula.id.length === 0) {
      throw new DispatchError(`${where} has no id.`);
    }
    if (isDeclaredTerm(formula.id)) {
      throw new DispatchError(
        `${where} is named "${formula.id}", which is a library term's id. A breakdown would then show two different things under one name.`,
      );
    }
    if (seen.has(formula.id)) {
      throw new DispatchError(`${where} repeats the id "${formula.id}". Two formulas under one id are one line in a breakdown and two in the cost.`);
    }
    seen.add(formula.id);
    if (
      typeof formula.weight !== 'number' ||
      !Number.isFinite(formula.weight) ||
      formula.weight < 0 ||
      formula.weight > MAX_FORMULA_NUMBER
    ) {
      throw new DispatchError(
        `${where} ("${formula.id}") has weight ${String(formula.weight)}; it must be a finite number from 0 to ${String(MAX_FORMULA_NUMBER)}.`,
      );
    }
    const termIds: string[] = [];
    const nodes = checkNode(formula.expression, 1, termIds, `${where} ("${formula.id}")`);
    if (nodes > MAX_FORMULA_NODES) {
      throw new DispatchError(
        `${where} ("${formula.id}") holds ${String(nodes)} nodes; a formula may hold at most ${String(MAX_FORMULA_NODES)}.`,
      );
    }
    if (termIds.length === 0) {
      throw new DispatchError(
        `${where} ("${formula.id}") reads no term, so it is the same number for every car and can change no decision.`,
      );
    }
    resolved.push(
      Object.freeze({
        id: formula.id,
        name: typeof formula.name === 'string' && formula.name.length > 0 ? formula.name : formula.id,
        weight: formula.weight,
        expression: formula.expression,
        termIds: Object.freeze(termIds),
      }),
    );
  }
  return Object.freeze(resolved);
}

/** The one empty list, so a profile without formulas allocates nothing and compares by identity. */
export const NO_FORMULAS: readonly ResolvedFormula[] = Object.freeze([]);

/**
 * The value of a checked tree. Pure: `valueOf` is asked for a term's normalized value and the
 * rest is arithmetic. Total over a tree {@link resolveFormulas} accepted.
 */
export function evaluateFormula(node: FormulaNode, valueOf: (termId: string) => number): number {
  if ('term' in node) return valueOf(node.term);
  if ('value' in node) return node.value;
  let result = evaluateFormula(node.of[0]!, valueOf);
  for (let index = 1; index < node.of.length; index += 1) {
    const next = evaluateFormula(node.of[index]!, valueOf);
    switch (node.op) {
      case 'add':
        result += next;
        break;
      case 'multiply':
        result *= next;
        break;
      case 'max':
        result = Math.max(result, next);
        break;
      case 'min':
        result = Math.min(result, next);
        break;
    }
  }
  return result;
}
