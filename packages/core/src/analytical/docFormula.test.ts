/**
 * **The formulas published in `docs/03-traffic-and-statistics.md` Part 2 are evaluated, not read.**
 *
 * `analytical/types.ts` names that section as *"where this repository states the formulas it holds
 * itself to"*, and `highestReversalFloor`'s own docstring asserts that its expression for `H` is
 * *"the expression stated in `docs/03-traffic-and-statistics.md` Part 2"*. Review finding #16 found
 * both claims false at once:
 *
 * - the published `RTT` omitted the **`tx`** express term, which `roundTripTime()` always evaluates
 *   and `deriveUpPeakTerms` derives from real floor heights for every zoned bank. Secure Tower's
 *   high bank runs ~60 m of express — `tx = 14.025 s`, about 20 % of its round trip — so hand-
 *   checking a zoned bank against the published expression disagreed with the code by tens of
 *   seconds;
 * - and Part 2 contained **no `H` formula at all**, only a one-line gloss in the term table, so the
 *   docstring cross-referenced a statement that did not exist.
 *
 * ## What this test does, and why that shape
 *
 * It reads the fenced block out of the document, translates the mathematical notation into an
 * expression tree, evaluates it against the **real Secure Tower high-bank terms**, and compares
 * against `roundTripTime()`. The bank is chosen because its `expressJumpS` is large: on an unzoned
 * bank `tx` is at or near 0 — 0.48 s on Midtown Office — and the omission this finding reports is
 * invisible at printed precision.
 *
 * The evaluator is deliberately small and total — numbers, identifiers, `+ - * / **`, parentheses,
 * and the one `Σ_{i=a..b}` construct the `H` line uses. It rejects anything it does not recognise
 * rather than skipping it, so a formula rewritten into notation this file cannot read fails the
 * suite instead of silently passing. `roundTripTime()` is never consulted to build the expected
 * value: the doc is evaluated on its own terms and the two numbers are compared.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { type LoadedConfig } from '../config/index.js';
import { loadConfig } from '../config/loader.js';

import { roundTripTime } from './roundTripTime.js';
import { deriveUpPeakTerms } from './upPeak.js';

const DOC = fileURLToPath(new URL('../../../../docs/03-traffic-and-statistics.md', import.meta.url));
const REAL_DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));

/* -------------------------------------------------------------------------- *
 * Reading the block
 * -------------------------------------------------------------------------- */

/** `name -> right-hand side`, for every `name = expression` line in Part 2's fenced block. */
function publishedFormulas(): ReadonlyMap<string, string> {
  const text = readFileSync(DOC, 'utf8');
  const part2 = text.slice(text.indexOf('## Part 2'), text.indexOf('## Part 3'));
  const block = /```\n([\s\S]*?)```/.exec(part2)?.[1];
  expect(block, 'docs/03 Part 2 has no fenced formula block').toBeDefined();

  const formulas = new Map<string, string>();
  for (const line of (block as string).split('\n')) {
    // `NAME = rhs   trailing prose`. The prose is separated by two or more spaces.
    const row = /^\s*([A-Za-z%][A-Za-z0-9]*)\s*=\s*(.+?)(?:\s{2,}[a-z%].*)?$/.exec(line);
    if (row === null) continue;
    const [, name, rhs] = row;
    // `HC5 = a = b` publishes two equivalent forms; the first is the definition.
    const first = (rhs as string).split(/\s+=\s+/)[0] as string;
    if (!formulas.has(name as string)) formulas.set(name as string, first.trim());
  }
  return formulas;
}

/* -------------------------------------------------------------------------- *
 * Evaluating it
 * -------------------------------------------------------------------------- */

/** Mathematical typography → the ASCII the tokenizer below understands. */
function toAscii(source: string): string {
  return source
    .replaceAll('·', '*')
    .replaceAll('×', '*')
    .replaceAll('−', '-')
    .replaceAll('–', '-')
    .replaceAll('^', '**');
}

type Env = Readonly<Record<string, number>>;

/**
 * Expand `Σ_{i=lo..hi} (body)` into an explicit parenthesised sum, so the evaluator proper needs no
 * notion of a bound variable. An empty range expands to `(0)`, which is the correct value and the
 * case `N = 1` actually hits.
 */
function expandSums(source: string, env: Env): string {
  const SUM = /Σ_\{([A-Za-z]+)=([^.]+)\.\.([^}]+)\}\s*(\([^()]*\)(?:\*\*[A-Za-z0-9]+)?)/;
  let text = source;
  for (let guard = 0; guard < 8; guard += 1) {
    const match = SUM.exec(text);
    if (match === null) return text;
    const [whole, variable, loSrc, hiSrc, body] = match;
    const lo = Math.round(evaluate(loSrc as string, env));
    const hi = Math.round(evaluate(hiSrc as string, env));
    const terms: string[] = [];
    for (let i = lo; i <= hi; i += 1) {
      terms.push(
        `(${(body as string).replaceAll(
          new RegExp(`\\b${variable as string}\\b`, 'g'),
          String(i),
        )})`,
      );
    }
    text = text.replace(whole as string, terms.length === 0 ? '(0)' : `(${terms.join(' + ')})`);
  }
  throw new Error(`more than 8 Σ constructs in "${source}" — refusing to expand further`);
}

type Token = { readonly kind: 'number' | 'name' | 'op'; readonly text: string };

function tokenize(source: string): readonly Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const ws = /^\s+/.exec(rest);
    if (ws !== null) {
      index += ws[0].length;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/.exec(rest);
    if (number !== null) {
      tokens.push({ kind: 'number', text: number[0] });
      index += number[0].length;
      continue;
    }
    const name = /^[A-Za-z%][A-Za-z0-9]*/.exec(rest);
    if (name !== null) {
      tokens.push({ kind: 'name', text: name[0] });
      index += name[0].length;
      continue;
    }
    const op = /^(\*\*|[+\-*/()])/.exec(rest);
    if (op !== null) {
      tokens.push({ kind: 'op', text: op[0] });
      index += op[0].length;
      continue;
    }
    throw new Error(`docs/03 Part 2: cannot read "${rest.slice(0, 12)}" — unrecognised notation`);
  }
  return tokens;
}

/** Recursive descent over `+ - * / **`, unary minus and parentheses. Right-associative `**`. */
function evaluate(source: string, env: Env): number {
  const tokens = tokenize(toAscii(source));
  let at = 0;

  const peek = (): Token | undefined => tokens[at];
  const eat = (text: string): boolean => {
    if (peek()?.text !== text) return false;
    at += 1;
    return true;
  };

  const primary = (): number => {
    const token = peek();
    if (token === undefined) throw new Error(`docs/03 Part 2: "${source}" ends mid-expression`);
    if (eat('(')) {
      const value = expr();
      if (!eat(')')) throw new Error(`docs/03 Part 2: unbalanced parentheses in "${source}"`);
      return value;
    }
    at += 1;
    if (token.kind === 'number') return Number(token.text);
    if (token.kind === 'name') {
      const value = env[token.text];
      if (value === undefined) {
        throw new Error(`docs/03 Part 2: "${source}" uses "${token.text}", which is not defined`);
      }
      return value;
    }
    throw new Error(`docs/03 Part 2: unexpected "${token.text}" in "${source}"`);
  };

  const unary = (): number => (eat('-') ? -unary() : primary());

  const power = (): number => {
    const base = unary();
    return eat('**') ? base ** power() : base;
  };

  const term = (): number => {
    let value = power();
    for (;;) {
      if (eat('*')) value *= power();
      else if (eat('/')) value /= power();
      else return value;
    }
  };

  const expr = (): number => {
    let value = term();
    for (;;) {
      if (eat('+')) value += term();
      else if (eat('-')) value -= term();
      else return value;
    }
  };

  const result = expr();
  if (at !== tokens.length) {
    throw new Error(`docs/03 Part 2: trailing "${tokens[at]?.text ?? ''}" in "${source}"`);
  }
  return result;
}

/* -------------------------------------------------------------------------- *
 * The assertions
 * -------------------------------------------------------------------------- */

describe('docs/03 Part 2 — the closed form this repository holds itself to', () => {
  let config: LoadedConfig;

  beforeAll(async () => {
    config = await loadConfig(REAL_DATA_DIR);
  });

  /** Secure Tower's high bank: the only shipped bank whose express jump is large. */
  function secureHighBankTerms() {
    const building = config.buildingsById.get('secure-tower');
    if (building === undefined) throw new Error('data/buildings is missing "secure-tower"');
    return deriveUpPeakTerms(building, config.elevatorSpecs, { bankId: 'high' }).roundTripTerms;
  }

  it('publishes a formula for every quantity the oracle computes', () => {
    const formulas = publishedFormulas();
    for (const name of ['RTT', 'S', 'H', 'INT', 'HC5']) {
      expect(formulas.has(name), `docs/03 Part 2 states no formula for ${name}`).toBe(true);
    }
  });

  it('reproduces roundTripTime() on a bank with a non-zero express jump (review finding #16)', () => {
    const terms = secureHighBankTerms();
    expect(
      terms.expressJumpS,
      'the fixture has no express jump, so it cannot detect a missing tx term',
    ).toBeGreaterThan(1);

    const formulas = publishedFormulas();
    const env: Record<string, number> = {
      N: terms.floorsAboveTerminal,
      P: terms.passengersPerTrip,
      tv: terms.singleFloorTransitS,
      tx: terms.expressJumpS,
      ts: terms.stopTimeLossS,
      tp: terms.passengerTransferS,
      L: terms.carsInGroup,
      population: terms.population,
    };

    // Order matters: S and H feed RTT, RTT feeds INT, INT feeds HC5.
    for (const name of ['S', 'H']) {
      const rhs = formulas.get(name) as string;
      env[name] = evaluate(expandSums(toAscii(rhs), env), env);
    }
    for (const name of ['RTT', 'INT', 'HC5']) {
      env[name] = evaluate(expandSums(toAscii(formulas.get(name) as string), env), env);
    }

    const computed = roundTripTime(terms);

    expect(env['S'], 'S — expected stops').toBeCloseTo(computed.expectedStops, 9);
    expect(env['H'], 'H — highest reversal floor. The formula the docstring says Part 2 states')
      .toBeCloseTo(computed.highestReversalFloor, 9);
    expect(
      env['RTT'],
      `RTT from docs/03 Part 2 against roundTripTime(). tx = ${String(terms.expressJumpS)} s on ` +
        `this bank, so a published formula that omits the express term is out by ` +
        `${String(2 * terms.expressJumpS)} s.`,
    ).toBeCloseTo(computed.roundTripTimeS, 9);
    expect(env['INT'], 'INT — interval').toBeCloseTo(computed.intervalS, 9);
    expect(env['HC5'], 'HC5 — group handling capacity per 5 minutes').toBeCloseTo(
      computed.handlingCapacity5Min,
      9,
    );
  });

  /**
   * The second fixture is the unzoned case, where the express term is nearly absent — Midtown
   * Office's `tx` is 0.48 s, and it is not zero only because the lobby is double height, so `G → 2`
   * is a 5.0 m rise against a 3.8 m pitch. That is the regime in which the published formula was
   * *right*, which is exactly why the omission survived: the building the doc's
   * worked example uses barely exercises the term it left out.
   */
  it('still reproduces it on an unzoned bank, where tx is near zero', () => {
    const building = config.buildingsById.get('midtown-office');
    if (building === undefined) throw new Error('data/buildings is missing "midtown-office"');
    const terms = deriveUpPeakTerms(building, config.elevatorSpecs).roundTripTerms;
    expect(terms.expressJumpS).toBeLessThan(1);

    const formulas = publishedFormulas();
    const env: Record<string, number> = {
      N: terms.floorsAboveTerminal,
      P: terms.passengersPerTrip,
      tv: terms.singleFloorTransitS,
      tx: terms.expressJumpS,
      ts: terms.stopTimeLossS,
      tp: terms.passengerTransferS,
      L: terms.carsInGroup,
      population: terms.population,
    };
    for (const name of ['S', 'H', 'RTT']) {
      env[name] = evaluate(expandSums(toAscii(formulas.get(name) as string), env), env);
    }
    expect(env['RTT']).toBeCloseTo(roundTripTime(terms).roundTripTimeS, 9);
  });
});
