/**
 * A hidden element is hidden — derived from this directory rather than from a list here.
 *
 * ## The trap, which this repository already knew about and guarded on only one side
 *
 * `el.hidden = true` sets the `hidden` attribute, and the browser hides it with a **user agent**
 * rule, `[hidden] { display: none }`. Any author `display` outranks a user agent one, so an element
 * that carries `display:grid` inline is still laid out, still painted and still occupying its box
 * after it has been told to hide. What a player sees is an empty bordered banner.
 *
 * `dev/surfaces.test.ts` states that mechanism in prose about the tab gate note, and
 * `packages/viz/index.html` guards it **seventeen** times with a paired
 * `.x[hidden] { display: none; }` rule beside every `display` it sets on a hideable element. Every
 * one of those guards is Engineer-side: that file contains no `everyday-` string at all. This
 * directory builds its DOM in TypeScript with inline `style.cssText` and has no stylesheet to put
 * such a rule in, so it had no guard of any kind, and one of its six `.hidden` sites was tripping
 * today — the Design a building screen's advisory banner, GitHub issue #295's F29.
 *
 * ## Why the site list is read off disk
 *
 * A hand-written list of the six is the same defect one level up: it covers today's six and not the
 * seventh, written next month by somebody who has never read this file. So the sites are found by
 * scanning this directory's own source, and the count is asserted to be non-zero rather than pinned
 * to a number, because pinning it would turn every new screen into a failure in this file rather
 * than a check that ran.
 *
 * ## What it cannot see, said rather than skipped
 *
 * There is no jsdom in this repository, so this cannot mount a screen and ask a layout engine. It
 * reads the source. Three consequences, each of which is a hole rather than a limitation:
 *
 * 1. **It resolves one level of indirection.** `x.style.cssText = SOME_CONST` is followed to a
 *    `const SOME_CONST = …` in the same file, and identifiers interpolated into a template literal
 *    are followed the same way. A style assembled through a function call is **not** followed —
 *    such a site is reported as unresolved and fails, so the blind spot is loud.
 * 2. **It only sees `everyday/`.** The Engineer directories take their elements from `index.html`,
 *    where the seventeen paired CSS rules are the guard that belongs there.
 * 3. **It cannot see a class rule**, because this directory has none. An author stylesheet rule
 *    setting `display` on a hideable element would defeat `[hidden]` exactly as an inline one does;
 *    if `everyday/` ever grows a stylesheet, this file needs a second half.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('.', import.meta.url));

/** This directory's shipped source: no tests, no helpers. */
function sourceFiles(): readonly string[] {
  return readdirSync(DIR)
    .filter(
      (name) =>
        name.endsWith('.ts') && !name.includes('.test.') && !name.includes('.test-helper.'),
    )
    .sort();
}

/** One `<identifier>.hidden = …` write, and the file it is in. */
interface HiddenSite {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

/**
 * Every `.hidden` **write** on a plain local identifier.
 *
 * A member expression (`ui.progress.hidden`) is not matched, and neither is a read
 * (`if (overlay.hidden)`): the first names an element built somewhere this scan cannot follow, and
 * the second sets nothing. Both are reported below so the exclusion is visible rather than assumed.
 */
function hiddenSites(source: string, file: string): readonly HiddenSite[] {
  const sites: HiddenSite[] = [];
  source.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
    const match = /(?:^|[^.\w$])([A-Za-z_$][\w$]*)\.hidden\s*=[^=]/u.exec(line);
    if (match?.[1] !== undefined) sites.push({ file, line: index + 1, name: match[1] });
  });
  return sites;
}

/**
 * The inline style an identifier is given in its own file, with one level of indirection followed,
 * or `undefined` where it is never given one.
 *
 * `null` is the third answer and the one that matters: the assignment exists and this scan could
 * not read through it. That fails rather than passing quietly.
 */
function inlineStyleOf(source: string, name: string): string | undefined | null {
  const assignment = new RegExp(
    String.raw`(?:^|[^.\w$])` + name + String.raw`\.style\.cssText\s*=\s*`,
    'u',
  ).exec(source);
  if (assignment === null) return undefined;

  /* The expression up to the `;` that ends the statement — not one inside a template or a list. */
  const from = assignment.index + assignment[0].length;
  let depth = 0;
  let inTemplate = false;
  let end = -1;
  for (let at = from; at < source.length; at += 1) {
    const char = source[at];
    if (char === '`' && source[at - 1] !== '\\') inTemplate = !inTemplate;
    else if (!inTemplate && (char === '[' || char === '(')) depth += 1;
    else if (!inTemplate && (char === ']' || char === ')')) depth -= 1;
    else if (!inTemplate && depth === 0 && char === ';') {
      end = at;
      break;
    }
  }
  if (end === -1) return null;
  const expression = source.slice(from, end).trim();

  /*
   * A style assembled by a function this scan cannot read through is **unresolved**, which fails.
   * `[…].join(';')` and `String(…)` are not that case: the first is a list literal whose contents
   * are right there, and the second is a formatter inside a template.
   */
  const opaqueCall = /(?:^|[^.\w$])(?!String\b|Number\b|Boolean\b)[A-Za-z_$][\w$]*\s*\(/u;
  const stripped = expression.replace(/`[^`]*`/gu, '').replace(/\[[^\]]*\]\.join\([^)]*\)/gu, '');
  if (opaqueCall.test(stripped)) return null;

  /*
   * One level of indirection, and only where the reference is unambiguous: the whole expression is
   * a bare identifier, or the identifier is interpolated whole into a template. Following every
   * word in reach would drag unrelated `const`s in and report a `display` that is not on this
   * element.
   */
  const referenced = new Set<string>();
  if (/^[A-Za-z_$][\w$]*$/u.test(expression)) referenced.add(expression);
  for (const hole of expression.matchAll(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/gu)) {
    if (hole[1] !== undefined) referenced.add(hole[1]);
  }
  let text = expression;
  for (const identifier of referenced) {
    const declaration = new RegExp(
      String.raw`\bconst\s+` + identifier + String.raw`\s*(?::[^=]+)?=\s*([\s\S]*?);\n`,
      'u',
    ).exec(source);
    if (declaration?.[1] === undefined) return null;
    text += `;${declaration[1]}`;
  }
  return text;
}

/**
 * The `display` values an element is given through the property rather than through `cssText`.
 *
 * `el.style.display = 'flex'` defeats `[hidden]` exactly as `display:flex` in a `cssText` does, and
 * it is the more likely of the two to be written next: this directory already sets it that way on
 * five elements, none of which is `hidden`-toggled today. `'none'` and `''` are not offenders —
 * the first hides and the second clears the inline value, which is the property's own way of
 * handing control back to the attribute.
 */
function propertyDisplaysOf(source: string, name: string): readonly string[] {
  const pattern = new RegExp(
    String.raw`(?:^|[^.\w$])` + name + String.raw`\.style\.display\s*=\s*([^;\n]+)`,
    'gu',
  );
  return [...source.matchAll(pattern)]
    .map((match) => (match[1] ?? '').trim())
    .filter((value) => !/^'none'$|^"none"$|^''$|^""$/u.test(value));
}

describe('an element this directory hides is actually hidden — issue #295 F29', () => {
  const files = sourceFiles();

  it('finds the directory’s `.hidden` writes by reading it, not by naming them', () => {
    // Non-vacuity in both directions: a scan that matched nothing would pass every case below,
    // and a scan that matched every line would make the next one meaningless.
    expect(files.length).toBeGreaterThan(10);
    const all = files.flatMap((file) => hiddenSites(readFileSync(join(DIR, file), 'utf8'), file));
    expect(all.length).toBeGreaterThan(0);
    expect(all.length).toBeLessThan(files.length);
    // The one this guard was written for must be among them, or it is watching the wrong thing.
    expect(all.some((site) => site.file === 'designerScreen.ts' && site.name === 'warningCard')).toBe(
      true,
    );
  });

  it('gives no hideable element an inline `display`', () => {
    const offenders: string[] = [];
    const unresolved: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(DIR, file), 'utf8');
      for (const site of hiddenSites(source, file)) {
        for (const value of propertyDisplaysOf(source, site.name)) {
          offenders.push(`${site.file}:${String(site.line)} ${site.name} — .style.display = ${value}`);
        }
        const style = inlineStyleOf(source, site.name);
        if (style === undefined) continue;
        if (style === null) {
          unresolved.push(`${site.file}:${String(site.line)} ${site.name}`);
          continue;
        }
        /*
         * `display:none` is not this defect — it hides the element the same way `hidden` does. It
         * is any *other* value that outranks the user agent rule and leaves the box standing.
         */
        if (/(?:^|[;\s`])display\s*:\s*(?!none)/u.test(style)) {
          offenders.push(`${site.file}:${String(site.line)} ${site.name} — ${style.trim()}`);
        }
      }
    }
    /*
     * An unreadable style is a failure and not a skip. The whole reason this file exists is that a
     * site nobody looked at kept its box, and a scan that shrugged at the sites it could not parse
     * would be that defect wearing a passing test.
     */
    expect(unresolved, 'this scan could not read these styles; extend it or simplify them').toEqual(
      [],
    );
    expect(
      offenders,
      'an inline `display` outranks the user agent’s `[hidden] { display: none }`, so these ' +
        'elements keep their box while claiming to be hidden. Move the `display` onto the rows, ' +
        'or hide the element some way other than the `hidden` attribute.',
    ).toEqual([]);
  });
});
