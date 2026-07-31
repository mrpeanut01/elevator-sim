/**
 * The set of player-facing text producers, **derived from the source tree**.
 *
 * ## Why this is derived and not listed
 *
 * [§ D163](../../../../DECISIONS.md) says it directly: *"A hand-written parity list is the
 * hand-written-list defect [§ D152] closed one layer down, and it would fail the same way —
 * silently, when a ninth failure state is added."* The same is true of a list of strings to
 * check. So the search does not carry one. It carries a **derivation**, and `derive.test.ts`
 * fails when a derived producer is in neither an adapter's `covers` nor a stated exclusion.
 *
 * A new surface is therefore red, not skipped.
 *
 * ## The derivation, stated so a reviewer can attack it
 *
 * TypeScript 7 is the native compiler and ships **no JavaScript compiler API** — `createProgram`,
 * `createSourceFile` and `SyntaxKind` are all `undefined` on the `typescript` package in this
 * repository. So a type-checker-driven derivation is not available, and this is a source scanner
 * in the same shape as `boundaries.test.ts`, which is the precedent in this package.
 *
 * A declaration is a **text producer** when, over comment-stripped source:
 *
 * 1. it is a top-level `export`ed `function`, `const`, `let`, `var` or `class`; **and**
 * 2. its own span contains a *prose literal* — a string or template literal with two adjacent
 *    alphabetic words in it — that is not inside a `throw`; **or**
 * 3. its span references another top-level declaration in the same module that satisfies (2),
 *    transitively. This is the clause that catches `export function banner(x) { return line(x); }`
 *    where every word lives in a private helper.
 *
 * ### What each exclusion buys, and what it costs
 *
 * - **Comments are stripped**, because half the value of these files is their docstrings and a
 *   rule that fired on prose about prose would be unusable. Same argument, same mechanism as
 *   `boundaries.test.ts#stripComments`.
 * - **`throw` literals are dropped**, because an error message is developer-facing by
 *   construction: it reaches a console or a `catch`, never a player's screen. The one place this
 *   could hide something is a surface that renders a caught error's `message` — and every such
 *   surface in this package (`editor/editorValidate.ts`, `record/document.ts`,
 *   `access/dispatcherCredentials.ts`) has its *own* prose and is derived anyway.
 * - **Two adjacent alphabetic words** is the prose test. It admits `'not served'` and rejects
 *   `'destination-entry'`, `'12px ui-monospace'` and every id, key and CSS token in the package.
 *   It over-collects — `LOCKOUT_CAUSES` and `FIGURE_ORDER` are derived and are not prose — and
 *   over-collection is the safe direction: everything derived must be *classified*, and a wrong
 *   classification is one line in a list with a reason on it.
 *
 * ### The known limitation, stated rather than discovered later
 *
 * The scanner is blind to a *new export in a covered module that bears no prose of its own and
 * calls nothing in its own module* — it would reach for a text producer in another module and be
 * derived only if that call is a bare identifier this scanner sees. It sees imported names, so in
 * practice the transitive clause covers it; what it genuinely cannot see is a producer assembled
 * entirely out of data read at runtime. `honesty.test.ts`'s liveness assertion is the second
 * instrument for that class: an adapter that produces nothing is red.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `packages/viz/src`. */
export const VIZ_SRC = fileURLToPath(new URL('..', import.meta.url));

/** One derived producer. `id` is `<module>#<export>`, the id an adapter and a violation both use. */
export interface TextDeclaration {
  readonly id: string;
  readonly module: string;
  readonly name: string;
  /** Whether the prose is in this declaration's own span, or reached through another. */
  readonly direct: boolean;
  /** The first prose literal that made it a producer, truncated. Evidence, not decoration. */
  readonly evidence: string;
}

async function walk(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.name.endsWith('.ts')) files.push(path);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

/**
 * Comments blanked rather than removed, so every offset in the result still points at the source.
 *
 * `boundaries.test.ts` deletes them; this scanner reports the line a literal is on, so it pads
 * instead. Newlines survive in both.
 */
function blankComments(text: string): string {
  const blank = (match: string): string => match.replace(/[^\n]/g, ' ');
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)));
}

interface Literal {
  readonly text: string;
  readonly index: number;
}

/**
 * Every string and template literal in the source, with its offset.
 *
 * A hand-written character scanner rather than a regex, for `boundaries.test.ts`'s stated reason:
 * the regex form silently ate whole files. Escapes are consumed in pairs; a template
 * substitution's contents are kept as text, which is harmless — a substitution can only make a
 * literal look *more* like prose, and every candidate is classified either way.
 */
function literalsIn(code: string): readonly Literal[] {
  const found: Literal[] = [];
  let i = 0;
  while (i < code.length) {
    const quote = code[i];
    if (quote === '"' || quote === "'" || quote === '`') {
      let j = i + 1;
      let buffer = '';
      while (j < code.length) {
        if (code[j] === '\\') {
          buffer += code[j + 1] ?? '';
          j += 2;
          continue;
        }
        if (code[j] === quote) break;
        buffer += code[j];
        j += 1;
      }
      found.push({ text: buffer, index: i });
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return found;
}

/** Two adjacent alphabetic words. Admits `not served`; rejects `destination-entry` and `12px`. */
const PROSE = /[A-Za-z]{2,}[ ,.'’-]+[A-Za-z]{2,}/;

const DECLARATION =
  /^(export\s+)?(?:declare\s+)?(?:async\s+)?(?:function|const|class|let|var)\s+\*?\s*([A-Za-z_$][\w$]*)/gm;

interface Span {
  readonly name: string;
  readonly exported: boolean;
  readonly start: number;
  end: number;
}

/** Whether a literal sits inside a `throw` statement — a developer-facing message. */
function isThrown(span: string, at: number): boolean {
  const before = span.slice(Math.max(0, at - 240), at);
  const lastThrow = before.lastIndexOf('throw ');
  if (lastThrow < 0) return false;
  // A `;` or a closing brace between the `throw` and the literal means the throw already ended.
  return !/[;}]/.test(before.slice(lastThrow));
}

/** Every text-producing exported declaration under `packages/viz/src`, sorted by id. */
export async function deriveTextProducers(
  root: string = VIZ_SRC,
): Promise<readonly TextDeclaration[]> {
  const producers: TextDeclaration[] = [];

  for (const path of await walk(root)) {
    const module = relative(root, path).split('\\').join('/');
    if (module.endsWith('.test.ts') || module.endsWith('.test-helper.ts')) continue;
    // The instrument is not one of the surfaces it checks.
    if (module.startsWith('honesty/')) continue;

    const code = blankComments(await readFile(path, 'utf8'));
    const spans: Span[] = [];
    for (const match of code.matchAll(DECLARATION)) {
      spans.push({ name: match[2] ?? '', exported: match[1] !== undefined, start: match.index, end: code.length });
    }
    for (const [index, span] of spans.entries()) {
      const next = spans[index + 1];
      if (next !== undefined) span.end = next.start;
    }

    const byName = new Map(spans.map((span) => [span.name, span]));
    const ownProse = new Map<string, string>();
    const references = new Map<string, ReadonlySet<string>>();

    for (const span of spans) {
      const body = code.slice(span.start, span.end);
      const prose = literalsIn(body).find(
        (literal) => PROSE.test(literal.text) && !isThrown(body, literal.index),
      );
      if (prose !== undefined) ownProse.set(span.name, prose.text.slice(0, 90));
      const named = new Set<string>();
      for (const match of body.matchAll(/[A-Za-z_$][\w$]*/g)) {
        const name = match[0];
        if (name !== span.name && byName.has(name)) named.add(name);
      }
      references.set(span.name, named);
    }

    /* Transitive closure: a declaration bears text when it, or anything it names, does. */
    const bears = new Map<string, { readonly direct: boolean; readonly evidence: string }>();
    for (const [name, evidence] of ownProse) bears.set(name, { direct: true, evidence });
    let changed = true;
    while (changed) {
      changed = false;
      for (const span of spans) {
        if (bears.has(span.name)) continue;
        for (const reference of references.get(span.name) ?? []) {
          const carried = bears.get(reference);
          if (carried === undefined) continue;
          bears.set(span.name, { direct: false, evidence: `via ${reference}: ${carried.evidence}` });
          changed = true;
          break;
        }
      }
    }

    for (const span of spans) {
      if (!span.exported) continue;
      const carried = bears.get(span.name);
      if (carried === undefined) continue;
      producers.push({
        id: `${module}#${span.name}`,
        module,
        name: span.name,
        direct: carried.direct,
        evidence: carried.evidence,
      });
    }
  }

  return producers.sort((a, b) => a.id.localeCompare(b.id));
}

/** One authored prose string, wherever in the package it was written. */
export interface ProseLiteral {
  readonly module: string;
  readonly line: number;
  readonly text: string;
}

/**
 * Every prose literal in every non-test module, including the DOM entry points.
 *
 * The companion instrument to {@link deriveTextProducers}, and it exists for one class of surface
 * the generated search cannot reach: `dev/main.ts`, `dev/batchPanel.ts` and `dev/campaignPanel.ts`
 * **author status text inline** — `ui.status.textContent = '…'` — and they are DOM-bound, so they
 * cannot be driven under Node without a jsdom this package deliberately does not have
 * (`boundaries.test.ts` exists to keep it that way).
 *
 * A static sweep over their literals is weaker than driving them — it cannot see a sentence
 * assembled at runtime — and it is not nothing: R10 is a rule about **words**, and every word in
 * an authored literal is visible here. `dev/main.ts` does export a handful of declarations (its
 * producers are classified in `derive.test.ts`), but its status text is authored inside function
 * bodies no export carries, so this sweep is the only instrument that reads those sentences.
 */
export async function deriveProseLiterals(root: string = VIZ_SRC): Promise<readonly ProseLiteral[]> {
  const found: ProseLiteral[] = [];
  for (const path of await walk(root)) {
    const module = relative(root, path).split('\\').join('/');
    if (module.endsWith('.test.ts') || module.endsWith('.test-helper.ts')) continue;
    if (module.startsWith('honesty/')) continue;
    const code = blankComments(await readFile(path, 'utf8'));
    for (const literal of literalsIn(code)) {
      if (!PROSE.test(literal.text)) continue;
      if (isThrown(code, literal.index)) continue;
      found.push({
        module,
        line: code.slice(0, literal.index).split('\n').length,
        text: literal.text,
      });
    }
  }
  return found;
}
