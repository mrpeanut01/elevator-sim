/**
 * **A priority of your own** — the editing model for `core`'s `dispatch/formula.ts`.
 *
 * `everyday/workshopScreen.ts#drawFormulas` is the non-test caller of every export here: the
 * block in the workshop's *priorities* card where a player writes a formula, names it and weighs
 * it. The formulas ride the working copy (`DispatcherSpec.formulas`), so
 * `authoring/dispatcherSpec.ts#profileFromSpec` writes them onto the profile a run, a save and
 * the test bed all build.
 *
 * ## What the editor can write, and what it can only show
 *
 * `core` accepts a tree: operations inside operations, with constants. This editor writes the one
 * shape a sentence can carry — **one operation over two to four library terms** — because that is
 * the whole of what a weight vector cannot say (*both at once*, *whichever is worse*) and a
 * nested tree drawn as selects is a puzzle. A formula that arrives deeper than that, from a
 * profile authored by hand, is not flattened or refused: {@link simpleFormulaOf} returns
 * `undefined`, the screen draws its {@link formulaReadbackOf} sentence with its name, weight and
 * a remove control, and says it was written outside this editor.
 *
 * ## The words
 *
 * {@link FORMULA_OP_WORDS} is this module's one authored table — an operation is a model fact and
 * its plain name is not derivable. A term is named by `core`'s own `player.name`, so the formula
 * and the weight row above it use one word for one thing.
 */

import {
  COST_TERMS_BY_ID,
  FORMULA_OPS,
  MAX_FORMULAS,
  resolveFormulas,
  type FormulaNodeConfig,
  type FormulaTermConfig,
} from '@elevator-sim/core/browser';

/** One formula on the working copy — exactly the profile's own shape, so the round trip is trivial. */
export type FormulaSpec = FormulaTermConfig;

type FormulaOpId = (typeof FORMULA_OPS)[number];

/** How many terms the editor's one operation may combine. */
export const FORMULA_MIN_TERMS = 2;
export const FORMULA_MAX_TERMS = 4;

/** The select's label for an operation, and the phrase its readback is built on. */
export interface FormulaOpWords {
  /** The option a player picks. */
  readonly label: string;
  /** What it means, in one line, under the select. */
  readonly meaning: string;
  /** The readback's lead-in: *whichever is worse of …*. */
  readonly lead: string;
  /** The word between the terms in the readback. */
  readonly joiner: string;
}

export const FORMULA_OP_WORDS: Readonly<Record<FormulaOpId, FormulaOpWords>> = Object.freeze({
  multiply: Object.freeze({
    label: 'both at once',
    meaning: 'Costs a lot only when every one of these is bad together. Any one of them near zero forgives the rest.',
    lead: 'how bad these are together:',
    joiner: 'times',
  }),
  max: Object.freeze({
    label: 'whichever is worse',
    meaning: 'Judges a car by its worst of these and ignores the others.',
    lead: 'whichever is worse of',
    joiner: 'or',
  }),
  min: Object.freeze({
    label: 'whichever is better',
    meaning: 'Judges a car by its best of these, so being good at one is enough.',
    lead: 'whichever is better of',
    joiner: 'or',
  }),
  add: Object.freeze({
    label: 'added up',
    meaning: 'The plain sum. The same as weighing each one equally, kept as one row.',
    lead: 'the sum of',
    joiner: 'plus',
  }),
});

/** The operations in the order the select offers them: the two a weight cannot say, first. */
export const FORMULA_OP_ORDER: readonly FormulaOpId[] = Object.freeze(['multiply', 'max', 'min', 'add']);

/** A term's player name, or its id for a term this build has no words for. */
export function formulaTermNameOf(termId: string): string {
  return COST_TERMS_BY_ID.get(termId)?.player.name ?? termId;
}

/** Every term a formula may read, in registry order, under its player name. */
export function formulaTermOptions(): readonly { readonly id: string; readonly name: string }[] {
  return [...COST_TERMS_BY_ID.values()].map((term) => ({ id: term.id, name: term.player.name }));
}

/** The editor's one shape: an operation and the terms it combines. */
export interface SimpleFormula {
  readonly op: FormulaOpId;
  readonly termIds: readonly string[];
}

/**
 * The expression as the editor's one shape, or `undefined` for a tree it cannot draw as selects —
 * a nested operation, a constant, or more terms than {@link FORMULA_MAX_TERMS}.
 */
export function simpleFormulaOf(expression: FormulaNodeConfig): SimpleFormula | undefined {
  if (!('op' in expression)) return undefined;
  if (expression.of.length < FORMULA_MIN_TERMS || expression.of.length > FORMULA_MAX_TERMS) return undefined;
  const termIds: string[] = [];
  for (const child of expression.of) {
    if (!('term' in child)) return undefined;
    termIds.push(child.term);
  }
  return Object.freeze({ op: expression.op, termIds: Object.freeze(termIds) });
}

/** The editor's shape, written back as the tree `core` evaluates. */
export function expressionOf(simple: SimpleFormula): FormulaNodeConfig {
  return { op: simple.op, of: simple.termIds.map((term) => ({ term })) };
}

function phraseOf(node: FormulaNodeConfig, nested: boolean): string {
  if ('term' in node) return formulaTermNameOf(node.term);
  if ('value' in node) return String(node.value);
  const words = FORMULA_OP_WORDS[node.op];
  const parts = node.of.map((child) => phraseOf(child, true));
  const body = `${words.lead} ${parts.join(` ${words.joiner} `)}`;
  return nested ? `(${body})` : body;
}

/**
 * The formula as a sentence: *whichever is worse of wait time or load factor*. Total over any
 * tree `core` accepts, so a formula the editor cannot draw still says what it is.
 */
export function formulaReadbackOf(formula: FormulaSpec): string {
  return `Reads as: ${phraseOf(formula.expression, false)}.`;
}

/** An id no formula on the working copy holds: `mine-1`, `mine-2`, … */
function nextFormulaId(formulas: readonly FormulaSpec[]): string {
  const taken = new Set(formulas.map((formula) => formula.id));
  for (let index = 1; ; index += 1) {
    const candidate = `mine-${String(index)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Whether the working copy may take another formula — `core`'s own bound. */
export function canAddFormula(formulas: readonly FormulaSpec[]): boolean {
  return formulas.length < MAX_FORMULAS;
}

/**
 * The list with one more formula: the first operation over the first two terms, at a weight that
 * makes it count. Not weight zero — a new priority that changes nothing would be a control that
 * writes nothing without saying so.
 */
export function withNewFormula(formulas: readonly FormulaSpec[]): readonly FormulaSpec[] {
  if (!canAddFormula(formulas)) return formulas;
  const terms = formulaTermOptions();
  const id = nextFormulaId(formulas);
  return Object.freeze([
    ...formulas,
    Object.freeze({
      id,
      name: `My priority ${id.slice('mine-'.length)}`,
      weight: 0.5,
      expression: expressionOf({ op: FORMULA_OP_ORDER[0]!, termIds: [terms[0]!.id, terms[1]!.id] }),
    }),
  ]);
}

/** The list with the `at`-th formula replaced by `patch` over it. */
export function withFormulaAt(
  formulas: readonly FormulaSpec[],
  at: number,
  patch: Partial<Pick<FormulaSpec, 'name' | 'weight' | 'expression'>>,
): readonly FormulaSpec[] {
  return Object.freeze(
    formulas.map((formula, index) => (index === at ? Object.freeze({ ...formula, ...patch }) : formula)),
  );
}

/** The list without its `at`-th formula. */
export function withoutFormulaAt(formulas: readonly FormulaSpec[], at: number): readonly FormulaSpec[] {
  return Object.freeze(formulas.filter((_, index) => index !== at));
}

/**
 * Why these formulas would stop a run, in a sentence a player can act on, or `undefined`.
 *
 * Asked of `core`'s own `resolveFormulas`, so this cannot disagree with pressing Run; **its
 * message is not drawn**, because it is written for whoever authors a profile by hand and names
 * fields and bounds in the engine's notation. Everything the editor's own controls can produce
 * resolves, so this is reached by a hand-edited or damaged working copy and says so.
 */
export function formulaIssueOf(formulas: readonly FormulaSpec[]): string | undefined {
  try {
    resolveFormulas(formulas, 'working-copy');
    return undefined;
  } catch {
    return (
      'One of these priorities cannot be worked out as it stands, so a run with it would be refused. ' +
      'Remove it, or write it again with the controls here.'
    );
  }
}

/** The block's authored copy. */
export const FORMULA_COPY = Object.freeze({
  heading: 'A PRIORITY OF YOUR OWN',
  hint:
    'Combine several things into one new thing to weigh. It is added to the car’s cost like any ' +
    'other row.',
  empty: 'None written. The priorities above are all this dispatcher weighs.',
  add: 'Write a priority',
  full: 'A dispatcher carries at most four priorities of its own.',
  nameLabel: 'Name',
  weightLabel: 'How much it counts',
  opLabel: 'Combine',
  addTerm: 'and another',
  dropTerm: 'drop',
  remove: 'remove',
  handWritten:
    'This one was written outside this editor, and its controls cannot show all of it. It still ' +
    'runs. You can rename it, weigh it or remove it here.',
  unweighted: 'At zero it changes nothing.',
} as const);
