/**
 * **A price is multiplied in `pricing/` or nowhere** — GitHub issue **#528**,
 * [§ D560](../../../../DECISIONS.md).
 *
 * The defect #528 names is not that an editor multiplied; it is *where*. A magnitude term for a price
 * — a rate, a step count, a per-floor quantity — living in a screen's own arithmetic is a second price
 * list the schedule cannot see, cannot bound and cannot change, which is `CLAUDE.md` invariant 7 on
 * the one thing `data/price-schedule.json` exists to hold ([§ D525](../../../../DECISIONS.md) clause 2,
 * `docs/38` § 2.1). It had already produced two prices for one purchase: `fixit/engine.ts#spendOf`
 * charged 20 u for the +1.0 m/s that a repair buys for 10.
 *
 * So this is the guard the issue's third point asks for. It scans **every non-test `.ts` file under
 * `packages/viz/src`**, derived from disk rather than listed, and fails on a multiplication either
 * side of which mentions a price. `pricing/` is exempt because it is the home: `#purchaseUnits`,
 * `#steppedPurchaseUnits` and `#ceilingUnitsOf` are the three places a price and a count are allowed
 * to meet, and each says on its face which one it is.
 *
 * ## What it can and cannot see, stated rather than implied
 *
 * It reads source text, not types, so it catches the shape a person writes — `steps * price`,
 * `units * n` — including a price laundered through one local binding, which is the realistic case.
 * It does **not** catch a price renamed to something that mentions no price at all and then
 * multiplied three modules away; nothing short of type-aware analysis would, and claiming otherwise
 * would be the kind of sentence this repository asks to be measured. What it buys is that the honest
 * spelling of the defect cannot land unnoticed, and that the dishonest one has to be deliberate.
 *
 * Tests are out of scope on purpose: a fixture that builds a budget as `10 × a price` prices nothing
 * a player pays. The scope is the shipped product.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const VIZ_SRC = fileURLToPath(new URL('..', import.meta.url));

/** Where a price is allowed to meet a count. Its own three functions say which is which. */
const HOME = 'pricing';

/**
 * **The one file outside `pricing/` that multiplies a price, with its reason.**
 *
 * `commissioning/choices.ts` prices a bank in **capital units**, a currency
 * `data/price-schedule.json` does not hold and no tier of it prices: 100 a shaft, 20 per m/s per car,
 * 0.2 per metre of the class's rated rise. That is a rate × a magnitude in code, and it is the same
 * shape #528 names — `pricing/types.ts`'s own module docstring already counts
 * `commissioning/types.ts#CapitalConstraint.headroom` among the six price lists it found.
 *
 * **It is listed rather than fixed, and the reason is the rule this lane was given.** Routing it
 * through the schedule would re-price every commissioning choice the product ships, and a shipped
 * figure is the product owner's to move. So it is named here, where the next reader meets it, instead
 * of being quietly outside the scan. The entry is asserted in both directions below: an identifier
 * that leaves this file fails, and so does one that joins it.
 */
const ALLOWED: ReadonlyMap<string, { readonly reason: string; readonly identifiers: readonly string[] }> =
  new Map([
    [
      'commissioning/choices.ts',
      {
        reason:
          'capital units, a second currency the price schedule does not hold. Moving it re-prices ' +
          'every commissioning choice, which is the product owner’s call (GitHub issue #528, § D560).',
        identifiers: [
          'CAPITAL_UNITS_PER_MPS',
          'CAPITAL_UNITS_PER_RATED_RISE_M',
          'CAPITAL_UNITS_PER_SHAFT',
        ],
      },
    ],
  ]);

/** A price, as a reader spells one. Deliberately narrow: `budget` and `total` alone are not prices. */
const PRICE_WORD = /units|price|cost|tariff/iu;

/** Every non-test `.ts` file under `packages/viz/src`, relative to it, derived from disk. */
function sourceFiles(): readonly string[] {
  const out: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(join(VIZ_SRC, directory === '' ? '.' : directory), {
      withFileTypes: true,
    })) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path, path);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test-helper.ts')) continue;
      out.push(path);
    }
  };
  walk('', '');
  return out.sort();
}

/**
 * A template literal's words blanked and **its `${…}` expressions kept**, line for line.
 *
 * Blanking the whole span was the first draft and it was wrong in the direction that matters: a
 * price multiplied inside a template is a price a screen *draws*, which is the defect at its most
 * visible, and `${String(steps * priceUnits)} u` would have been read as prose and skipped. The words
 * still go, so `+${String(steps * 2)} places` beside the word *price* stays a magnitude.
 */
function templateExpressionsOnly(source: string): string {
  let out = '';
  let at = 0;
  while (at < source.length) {
    if (source[at] !== '`') {
      out += source[at];
      at += 1;
      continue;
    }
    at += 1;
    let depth = 0;
    while (at < source.length) {
      const character = source[at] ?? '';
      if (depth === 0) {
        if (character === '\\') {
          at += 2;
          continue;
        }
        if (character === '`') {
          at += 1;
          break;
        }
        if (character === '$' && source[at + 1] === '{') {
          depth = 1;
          out += ' ';
          at += 2;
          continue;
        }
        out += character === '\n' ? '\n' : ' ';
        at += 1;
        continue;
      }
      if (character === '{') depth += 1;
      if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          out += ' ';
          at += 1;
          continue;
        }
      }
      out += character;
      at += 1;
    }
  }
  return out;
}

/**
 * Source with its comments and quoted strings blanked, newlines kept.
 *
 * They have to go before the operands are read: a docstring about a price charged per step is not a
 * price charged per step, and neither is a sentence inside a refusal.
 */
function code(source: string): string {
  const keepLines = (span: string): string => '\n'.repeat((span.match(/\n/gu) ?? []).length);
  return templateExpressionsOnly(
    source
      .replace(/\/\*[\s\S]*?\*\//gu, keepLines)
      .replace(/(^|[^:])\/\/[^\n]*/gu, (_match, before: string) => before),
  )
    .replace(/'(?:[^'\\\n]|\\.)*'/gu, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/gu, '""');
}

/** The text either side of a `*`, as far as the expression it belongs to reaches on that line. */
function operandsAround(line: string, at: number): readonly [string, string] {
  const reach = (from: number, step: -1 | 1): string => {
    let depth = 0;
    let i = from;
    while (i >= 0 && i < line.length) {
      const character = line[i] ?? '';
      const opening = step === -1 ? ')]' : '([';
      const closing = step === -1 ? '([' : ')]';
      if (opening.includes(character)) depth += 1;
      else if (closing.includes(character)) {
        if (depth === 0) break;
        depth -= 1;
      } else if (depth === 0 && !/[\w$.]/u.test(character)) break;
      i += step;
    }
    return step === -1 ? line.slice(i + 1, from + 1) : line.slice(from, i);
  };
  let left = at - 1;
  while (left >= 0 && line[left] === ' ') left -= 1;
  let right = at + 1;
  while (right < line.length && line[right] === ' ') right += 1;
  return [reach(left, -1), reach(right, 1)];
}

interface Multiplication {
  readonly file: string;
  readonly line: number;
  readonly left: string;
  readonly right: string;
}

/** Every multiplication in one file whose operands mention a price. */
function pricedMultiplicationsIn(file: string, source: string): readonly Multiplication[] {
  const found: Multiplication[] = [];
  /* A local binding whose initializer reads a price carries one: `const p = priceOf(…)`. */
  const laundered = new Set<string>();
  for (const match of code(source).matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=([^;\n]*)/gu)) {
    if (PRICE_WORD.test(match[2] ?? '')) laundered.add(match[1] ?? '');
  }
  const carriesAPrice = (operand: string): boolean =>
    PRICE_WORD.test(operand) || laundered.has(operand.split('.')[0] ?? '');
  code(source)
    .split('\n')
    .forEach((line, index) => {
      for (const match of line.matchAll(/\*/gu)) {
        const at = match.index;
        if (line[at - 1] === '*' || line[at + 1] === '*') continue;
        const [left, right] = operandsAround(line, at);
        if (left === '' && right === '') continue;
        if (carriesAPrice(left) || carriesAPrice(right)) {
          found.push({ file, line: index + 1, left, right });
        }
      }
    });
  return found;
}

function scan(): readonly Multiplication[] {
  return sourceFiles()
    .filter((file) => !file.startsWith(`${HOME}/`))
    .flatMap((file) => pricedMultiplicationsIn(file, readFileSync(join(VIZ_SRC, file), 'utf8')));
}

describe('a price is multiplied in pricing/ or nowhere — GitHub issue #528', () => {
  it('scans the whole of packages/viz/src, derived from disk rather than listed', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain('fixit/engine.ts');
    expect(files).toContain('pricing/parse.ts');
    expect(files).not.toContain('pricing/rate.test.ts');
  });

  it('finds no price multiplied outside pricing/, but for the one allowed file', () => {
    const stray = scan().filter((hit) => !ALLOWED.has(hit.file));
    expect(
      stray.map((hit) => `${hit.file}:${String(hit.line)}: ${hit.left} * ${hit.right}`),
      'a price is multiplied outside `pricing/`. A magnitude term for a price belongs in the ' +
        'schedule, where the data can set it and a reader can find it: give the row a `rate` and ' +
        'charge it through `pricing/parse.ts#purchaseUnits`, or charge a stepped control through ' +
        '`#steppedPurchaseUnits`. If it genuinely prices something the schedule does not hold, add ' +
        'it to ALLOWED above with the reason — and read § D560 first, because that is the ' +
        'commissioning exception and it is one file for a reason.',
    ).toEqual([]);
  });

  it('holds the allowed file in both directions, so the register cannot go stale', () => {
    for (const [file, entry] of ALLOWED) {
      const identifiers = [
        ...new Set(
          scan()
            .filter((hit) => hit.file === file)
            .flatMap((hit) => [hit.left, hit.right])
            .flatMap((operand) => operand.match(/[A-Za-z_$][\w$]*/gu) ?? [])
            .filter((name) => PRICE_WORD.test(name)),
        ),
      ].sort();
      expect(
        identifiers,
        `${file} is registered above as multiplying a price ${entry.reason}. What it multiplies has ` +
          'changed. If the multiplication is gone, delete the entry on the commit that removed it — ' +
          'a register that can only grow is decoration. If something new was added, it needs its own ' +
          'reason rather than this one.',
      ).toEqual([...entry.identifiers].sort());
    }
  });

  /**
   * **The scan is proved to bite three ways and to stay quiet two more**, because a source scan that
   * matches nothing looks exactly like a tree that is clean. The first is the defect § D560 removed, spelled as it was
   * spelled in `fixit/engine.ts`; the second is that defect laundered through a plain name, which is
   * how it would be written by somebody working around this file; the third is a price multiplied
   * **inside a template**, which is the defect at its most visible because a screen draws the result;
   * the last two are the false positives it must not raise — a magnitude multiplied beside the word
   * *price*, and prose about one.
   */
  it('would catch the defect it was written for, and does not catch a magnitude', () => {
    const caught = (source: string): number => pricedMultiplicationsIn('probe.ts', source).length;
    expect(caught('const units = state.speedSteps * pricing.speedUnitsPerHalfMps;')).toBe(1);
    expect(caught('const p = priceOf(schedule, "faster-machines").priceUnits;\nconst u = n * p;')).toBe(
      1,
    );
    expect(caught('const line = `${String(steps * change.priceUnits)} u`;')).toBe(1);
    expect(caught('const readout = `${String(price)} u · +${String(steps * 2)} places`;')).toBe(0);
    expect(caught('/* A speed step is 10 u each, so two steps * the price is 20. */')).toBe(0);
  });
});
