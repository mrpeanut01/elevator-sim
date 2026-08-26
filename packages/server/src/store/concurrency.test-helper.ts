/**
 * **What every writing member of the store does, derived from its own source and its own schema.**
 *
 * Issue #266 asks for the enumeration of read-then-write pairs to be *derived rather than
 * hand-listed*, and the reason is the one this repository has recorded many times: a hand-written
 * list is correct on the day it is written and silent every day after. § D358 mapped two sites and
 * said so; the question it left open — *how many others are there?* — cannot be answered by a table
 * a person maintains.
 *
 * ## What is derived, and from what
 *
 * Two inputs, both already in the tree and neither written for this audit:
 *
 * 1. **`store.ts`'s own text.** Every member of every class, and for each member the ordered list of
 *    SQL statements it issues — following `this.<member>(…)` calls transitively, because
 *    `recordEntry`'s first read is `userById`'s `SELECT` and a scanner that stopped at the member
 *    boundary would report `createUser` as a bare `INSERT` with nothing before it.
 * 2. **`SCHEMA`'s own text**, parsed out of the same file. Which tables reference which, which of
 *    those references cascade, and what is unique. That is what says *which errors the database is
 *    entitled to raise* at each write — a foreign-key violation is possible exactly where a
 *    reference exists, and a uniqueness violation exactly where a constraint or index does.
 *
 * ## The site predicate, and why it is wider than the issue's title
 *
 * #266 names *read-then-write pairs*. That set is derived here and asserted ({@link
 * memberReadsBeforeWriting}), because it is the acceptance criterion. But it is the wrong set to
 * *remediate* against, and the two sites it misses are the instructive ones:
 *
 * - `createSession` and `createLoginToken` read nothing. Each is a bare `INSERT` into a table with a
 *   foreign key to `users`, and each is called by a route that read the account a moment earlier —
 *   so the check-then-act is real and simply is not inside the store method. A scan for
 *   read-then-write inside `store/` cannot see it.
 * - `consumeLoginToken` writes twice and reads nothing, and its `rowCount` answer changes meaning
 *   when a cascade removes the row it was about.
 *
 * So the set that must carry a stated remedy is **every member that writes**, which is derived by
 * the same scan and needs no judgement to compute. A member that only reads cannot be made to lie
 * by a concurrent delete: it returns fewer rows, which is the truth.
 *
 * ## What this is not
 *
 * It is a **text scanner, not a type checker**, and its limits are stated rather than implied:
 *
 * - Calls are resolved **within one file, by member name**. No file in `packages/server/src/store/`
 *   issues SQL except `store.ts`, and {@link sqlIssuingFiles} asserts that rather than assuming it —
 *   the day a second one appears, the assertion fails and this resolution has to be widened.
 * - A statement built by anything other than string concatenation and template literals would be
 *   invisible. `store.ts` builds every statement that way and the scanner refuses a `query` call
 *   whose argument it cannot read, loudly, rather than skipping it. A skipped statement reads as
 *   *no risk*, and silence that looks like a clean result is the one failure mode an audit may not
 *   have (R24, and `deadCode.test-helper.ts`'s divergence 3).
 * - Dynamic table names are not resolved. There are none; a `${…}` interpolation inside a statement
 *   becomes `?` and would only ever appear in a column position here, which the scanner records
 *   verbatim so a reader can see it.
 *
 * **This file is a test helper and is named as one**, matching `pglite.test-helper.ts`,
 * `racingSql.test-helper.ts` and `deadCode.test-helper.ts`. It has no non-test caller and must not
 * acquire one.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This directory — the one #266 scopes the enumeration to. */
export const STORE_DIR = fileURLToPath(new URL('./', import.meta.url));

/* -------------------------------------------------------------------------- *
 * Lexing: enough of TypeScript to tell code from text
 * -------------------------------------------------------------------------- */

interface Literal {
  /** Index of the opening quote in the source. */
  readonly start: number;
  /** Index one past the closing quote. */
  readonly end: number;
  /** The text between the quotes, with every `${…}` interpolation collapsed to `?`. */
  readonly value: string;
}

interface Masked {
  /**
   * The source with comments and string *contents* blanked to spaces, character for character, so
   * every offset is still the offset it was. Quotes and braces of the code survive.
   */
  readonly masked: string;
  /** Every string and template literal, in source order. */
  readonly literals: readonly Literal[];
}

/**
 * Blank the comments and the insides of the strings, keeping every offset.
 *
 * Length-preserving on purpose: the call scan runs over {@link Masked.masked} and the statement text
 * comes from {@link Masked.literals}, so the two have to agree about where things are. Rewriting
 * rather than deleting is what makes that true without a second parse.
 */
export function mask(source: string): Masked {
  const out = source.split('');
  const literals: Literal[] = [];
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      blank(i, end === -1 ? source.length : end);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      const start = i;
      i += 1;
      let value = '';
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') {
          value += source[i + 1] ?? '';
          i += 2;
          continue;
        }
        value += source[i];
        i += 1;
      }
      i += 1; // the closing quote
      blank(start + 1, i - 1);
      literals.push({ start, end: i, value });
      continue;
    }
    if (c === '`') {
      const start = i;
      i += 1;
      let value = '';
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') {
          value += source[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          // An interpolation is code, not text. Collapsed rather than resolved: nothing in this
          // store interpolates a table name, and a reader seeing `?` in a column position is being
          // told the truth about what the scanner can and cannot see.
          let depth = 1;
          i += 2;
          while (i < source.length && depth > 0) {
            if (source[i] === '{') depth += 1;
            else if (source[i] === '}') depth -= 1;
            i += 1;
          }
          value += '?';
          continue;
        }
        value += source[i];
        i += 1;
      }
      i += 1;
      blank(start + 1, i - 1);
      literals.push({ start, end: i, value });
      continue;
    }
    i += 1;
  }
  return { masked: out.join(''), literals };
}

/* -------------------------------------------------------------------------- *
 * Members
 * -------------------------------------------------------------------------- */

export interface Member {
  /** `recordEntry`, `#asOwnerError`, `entryOf` — as written, private hash and all. */
  readonly name: string;
  /** Parameter names, in order. `#userRow` takes its statement in one of these. */
  readonly params: readonly string[];
  /** Offsets of the body, braces excluded, into the *masked* source. */
  readonly start: number;
  readonly end: number;
}

/**
 * Every class member and every top-level function in one file.
 *
 * Brace-matched over the masked source rather than pattern-matched line by line, so a nested object
 * literal, an arrow function or a template literal cannot end a member early. The name is the
 * identifier immediately before the signature's first `(`, which is what a method, a constructor and
 * a function declaration all have in common.
 *
 * **A block whose signature has no call shape is descended into, not recorded** — that is what makes
 * `class Store { … }` yield its eighteen members rather than one. A block whose signature *does*
 * have one is a member and its body is taken whole.
 *
 * **Angle brackets are tracked at signature level, and that is not fussiness.** `createUser`'s
 * return type is `Promise<{ readonly ok: true … } | { … }>`: without counting `<` and `>` the first
 * `{` of that annotation reads as the start of the body, and the member recorded is a type rather
 * than a method — which is to say, a method with no statements in it, which is exactly the silent
 * clean result this scanner may not produce.
 */
export function members(source: string): readonly Member[] {
  const { masked } = mask(source);
  const found: Member[] = [];
  scan(masked, 0, masked.length, found);
  return found;
}

/** One nesting level: record the named blocks, descend into the unnamed ones. */
function scan(masked: string, from: number, to: number, found: Member[]): void {
  let signature = '';
  let parens = 0;
  let angle = 0;

  for (let i = from; i < to; i += 1) {
    const c = masked[i];
    if (c === '(') parens += 1;
    else if (c === ')') parens -= 1;
    else if (parens === 0 && c === '<') angle += 1;
    else if (parens === 0 && c === '>' && masked[i - 1] !== '=' && angle > 0) angle -= 1;

    if (c === '{' && parens === 0 && angle === 0) {
      const close = matchBrace(masked, i);
      const head = nameOf(signature);
      if (head === undefined) scan(masked, i + 1, close, found);
      else found.push({ name: head.name, params: head.params, start: i + 1, end: close });
      signature = '';
      i = close;
      continue;
    }
    // A `;` ends a declaration and an `=` starts an initialiser, so either one means the signature
    // so far was not a signature. Neither test may fire inside a parameter list or a type argument:
    // `createUser(input: { … }): Promise<{ … } | { … }>` closes braces in both, and treating those
    // as terminators is what once made four of the six writing members invisible to this scan.
    if (parens === 0 && angle === 0 && (c === ';' || (c === '=' && masked[i + 1] !== '=' && masked[i - 1] !== '='))) {
      signature = '';
      continue;
    }
    signature += c;
  }
}

/** The index of the `}` closing the `{` at `open`. Braces inside strings are already blanked. */
function matchBrace(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('concurrency audit: unbalanced braces in the source. This scanner cannot read it.');
}

/** The name and parameters of a signature, or `undefined` when it has no call shape. */
function nameOf(signature: string): { readonly name: string; readonly params: readonly string[] } | undefined {
  const open = signature.indexOf('(');
  if (open === -1) return undefined;
  const head = signature.slice(0, open).trim();
  const match = /(#?[A-Za-z_$][\w$]*)$/u.exec(head);
  if (match === null) return undefined;
  const name = match[1] ?? '';
  // `if (…) { … }`, `for (…) { … }`, `catch (…) { … }` all have the call shape and are not members.
  if (KEYWORDS.has(name)) return undefined;
  return { name, params: parameterNames(signature.slice(open)) };
}

/**
 * The parameter names of `(a: T, b: U)`, positionally.
 *
 * Only the leading identifier of each top-level comma group, which is all this scanner needs: it is
 * looking for the case where a statement is *passed in* rather than written in place, and that
 * argument is always a bare parameter reference. A destructured parameter yields nothing and simply
 * never matches, which is the safe direction — an unmatched statement throws rather than vanishing.
 */
function parameterNames(text: string): readonly string[] {
  const close = matchParen(text);
  const inner = text.slice(1, close);
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const c of inner) {
    if (c === '(' || c === '[' || c === '{' || c === '<') depth += 1;
    else if (c === ')' || c === ']' || c === '}' || c === '>') depth -= 1;
    if (c === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  out.push(current);
  return Object.freeze(out.map((p) => /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)/u.exec(p)?.[1] ?? ''));
}

/** The index of the `)` closing the `(` at index 0 of `text`. */
function matchParen(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

const KEYWORDS: ReadonlySet<string> = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'typeof',
  'await',
]);

/* -------------------------------------------------------------------------- *
 * Statements
 * -------------------------------------------------------------------------- */

export type StatementKind = 'read' | 'write' | 'ddl';

export interface Statement {
  readonly kind: StatementKind;
  /** `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`. */
  readonly verb: string;
  /** Every table the statement names, lower-cased, in the order it names them. */
  readonly tables: readonly string[];
  /** Whitespace-collapsed, so a failure names the statement rather than a line number. */
  readonly sql: string;
}

type Step =
  | { readonly step: 'sql'; readonly statement: Statement }
  /**
   * A `query` whose statement is one of this member's own parameters, by position. `#userRow` is
   * the only one: it takes the statement from whichever of `userById`, `userByEmail` and
   * `#userByName` called it, so the text is at the call site and the risk is at the callee.
   */
  | { readonly step: 'sql-from-parameter'; readonly parameter: number }
  | {
      readonly step: 'call';
      readonly member: string;
      /** Literal arguments of the call, positionally. `undefined` where the argument is computed. */
      readonly args: readonly (string | undefined)[];
    };

/** What one member does, in order, before any call is followed. */
export interface Trace {
  readonly name: string;
  readonly params: readonly string[];
  readonly steps: readonly Step[];
}

const SQL_CALL = /this\.#sql\.(query|exec)\s*\(/gu;
const MEMBER_CALL = /this\.(#?[A-Za-z_$][\w$]*)\s*\(/gu;

/**
 * The ordered steps of every member in one file.
 *
 * Both scans run over the masked text so that a `this.` inside a comment or a string cannot be
 * mistaken for a call, and the statement text is lifted from the literals that fall inside the
 * `query(` call's first argument — which is how `'INSERT INTO entries (…' + '…ON CONFLICT…'` comes
 * back as one statement rather than as two fragments.
 */
export function traces(source: string): readonly Trace[] {
  const { masked, literals } = mask(source);
  return members(source).map((member) => {
    const body = masked.slice(member.start, member.end);
    const steps: { at: number; value: Step }[] = [];

    SQL_CALL.lastIndex = 0;
    for (let m = SQL_CALL.exec(body); m !== null; m = SQL_CALL.exec(body)) {
      const openAt = member.start + m.index + m[0].length - 1;
      const args = argumentsOf(masked, literals, openAt);
      const text = args[0]?.literal;
      if (text !== undefined) {
        steps.push({ at: m.index, value: { step: 'sql', statement: statementOf(text) } });
        continue;
      }
      const argument = args[0]?.text.trim();
      const parameter = argument === undefined ? -1 : member.params.indexOf(argument);
      if (parameter !== -1) {
        steps.push({ at: m.index, value: { step: 'sql-from-parameter', parameter } });
        continue;
      }
      throw new Error(
        `concurrency audit: ${member.name} calls this.#sql.${String(m[1])}(…) with an argument this ` +
          'scanner cannot read — it is neither a literal nor one of this member\'s own parameters. ' +
          'Refusing to skip it: a statement the audit cannot see reads as a statement with no ' +
          'constraint risk, and a clean result from a blind instrument is worse than no result. ' +
          'Build the statement from string literals, or teach this scanner the new shape.',
      );
    }

    MEMBER_CALL.lastIndex = 0;
    for (let m = MEMBER_CALL.exec(body); m !== null; m = MEMBER_CALL.exec(body)) {
      const name = m[1] ?? '';
      if (name === '#sql') continue;
      const openAt = member.start + m.index + m[0].length - 1;
      steps.push({
        at: m.index,
        value: { step: 'call', member: name, args: argumentsOf(masked, literals, openAt).map((a) => a.literal) },
      });
    }

    steps.sort((a, b) => a.at - b.at);
    return { name: member.name, params: member.params, steps: steps.map((s) => s.value) };
  });
}

/**
 * The arguments of the call whose `(` is at `openAt`, positionally.
 *
 * `literal` is the concatenation of the argument's string literals when the argument is *nothing
 * but* string literals joined by `+` — otherwise it is `undefined`, because anything else is
 * computed and reading it would be guessing. `text` is the raw argument, which is how a bare
 * parameter reference is recognised.
 */
function argumentsOf(
  masked: string,
  literals: readonly Literal[],
  openAt: number,
): readonly { readonly text: string; readonly literal: string | undefined }[] {
  const spans: { from: number; to: number }[] = [];
  let depth = 1;
  let from = openAt + 1;
  let i = from;
  for (; i < masked.length && depth > 0; i += 1) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) break;
    } else if (c === ',' && depth === 1) {
      spans.push({ from, to: i });
      from = i + 1;
    }
  }
  if (i > from) spans.push({ from, to: i });

  return spans.map((span) => {
    const text = masked.slice(span.from, span.to);
    const inside = literals.filter((l) => l.start >= span.from && l.end <= span.to);
    if (inside.length === 0) return { text, literal: undefined };
    let rest = text;
    for (const l of inside) {
      rest = rest.slice(0, l.start - span.from) + ' '.repeat(l.end - l.start) + rest.slice(l.end - span.from);
    }
    return { text, literal: /[^\s+]/u.test(rest) ? undefined : inside.map((l) => l.value).join('') };
  });
}

/** What a statement is and what it touches. */
export function statementOf(sql: string): Statement {
  const text = sql.replace(/\s+/gu, ' ').trim();
  const verb = (/^([A-Za-z]+)/u.exec(text)?.[1] ?? '').toUpperCase();
  const tables: string[] = [];
  const push = (name: string | undefined): void => {
    if (name !== undefined && !tables.includes(name.toLowerCase())) tables.push(name.toLowerCase());
  };
  if (verb === 'INSERT') {
    push(/INTO\s+([A-Za-z_][\w]*)/iu.exec(text)?.[1]);
  } else if (verb === 'UPDATE') {
    push(/^UPDATE\s+([A-Za-z_][\w]*)/iu.exec(text)?.[1]);
  } else {
    for (const m of text.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_][\w]*)/giu)) push(m[1]);
  }
  const kind: StatementKind =
    verb === 'SELECT' ? 'read' : verb === 'INSERT' || verb === 'UPDATE' || verb === 'DELETE' ? 'write' : 'ddl';
  return { kind, verb, tables: Object.freeze(tables), sql: text };
}

/* -------------------------------------------------------------------------- *
 * Flattening
 * -------------------------------------------------------------------------- */

/**
 * One member's statements in the order they run, with `this.<member>(…)` calls expanded.
 *
 * A member already on the stack is not re-entered. There is no recursion in `store.ts` today; the
 * guard is here so that adding some would not hang the audit instead of reporting it.
 */
export function flatten(
  all: readonly Trace[],
  name: string,
  bound: readonly (string | undefined)[] = [],
  stack: readonly string[] = [],
): readonly Statement[] {
  if (stack.includes(name)) return [];
  const trace = all.find((t) => t.name === name);
  if (trace === undefined) return [];
  const out: Statement[] = [];
  for (const step of trace.steps) {
    if (step.step === 'sql') {
      out.push(step.statement);
      continue;
    }
    if (step.step === 'sql-from-parameter') {
      const text = bound[step.parameter];
      if (text === undefined) {
        throw new Error(
          `concurrency audit: ${name} runs a statement it was handed, and no caller in this trace ` +
            'passed a literal for it. The statement is invisible to the audit, which would report ' +
            'it as no risk at all. Widen the scanner rather than letting it pass.',
        );
      }
      out.push(statementOf(text));
      continue;
    }
    out.push(...flatten(all, step.member, step.args, [...stack, name]));
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * The schema, read out of the same file
 * -------------------------------------------------------------------------- */

export interface ForeignKey {
  readonly column: string;
  readonly references: string;
  readonly onDeleteCascade: boolean;
}

export interface TableFacts {
  readonly table: string;
  readonly foreignKeys: readonly ForeignKey[];
  /** Every unique constraint and unique index, as the column list each covers. */
  readonly unique: readonly (readonly string[])[];
}

/**
 * Every table's references and uniqueness, parsed from the `SCHEMA` literal.
 *
 * Read out of the shipped schema rather than restated, for `deleteUser`'s reason: the day a fifth
 * table references `users`, this widens on its own and the sites that must handle a new foreign key
 * appear without anybody widening a list.
 */
export function schemaFacts(source: string): readonly TableFacts[] {
  const { literals } = mask(source);
  const schema = literals.map((l) => l.value).find((v) => /CREATE TABLE/iu.test(v));
  if (schema === undefined) {
    throw new Error('concurrency audit: no CREATE TABLE literal in the source. The schema moved; this scan is blind.');
  }
  const tables = new Map<string, { foreignKeys: ForeignKey[]; unique: (readonly string[])[] }>();
  for (const m of schema.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+([A-Za-z_][\w]*)\s*\(([\s\S]*?)\n\);/giu)) {
    const table = String(m[1]).toLowerCase();
    const body = String(m[2]);
    const facts = { foreignKeys: [] as ForeignKey[], unique: [] as (readonly string[])[] };
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--')) continue;
      const fk = /^([A-Za-z_][\w]*)\b[\s\S]*?REFERENCES\s+([A-Za-z_][\w]*)/iu.exec(trimmed);
      if (fk !== null) {
        facts.foreignKeys.push({
          column: String(fk[1]).toLowerCase(),
          references: String(fk[2]).toLowerCase(),
          onDeleteCascade: /ON DELETE CASCADE/iu.test(trimmed),
        });
      }
      const table_unique = /^UNIQUE\s*\(([^)]*)\)/iu.exec(trimmed);
      if (table_unique !== null) facts.unique.push(columns(String(table_unique[1])));
      const column_unique = /^([A-Za-z_][\w]*)\b[^,]*\b(?:UNIQUE|PRIMARY KEY)\b/iu.exec(trimmed);
      if (column_unique !== null && table_unique === null) facts.unique.push([String(column_unique[1]).toLowerCase()]);
    }
    tables.set(table, facts);
  }
  for (const m of schema.matchAll(/CREATE UNIQUE INDEX(?:\s+IF NOT EXISTS)?\s+\S+\s+ON\s+([A-Za-z_][\w]*)\s*\(([^)]*\)?[^)]*)\)/giu)) {
    const table = String(m[1]).toLowerCase();
    const facts = tables.get(table);
    if (facts !== undefined) facts.unique.push(columns(String(m[2])));
  }
  return Object.freeze(
    [...tables].map(([table, facts]) =>
      Object.freeze({
        table,
        foreignKeys: Object.freeze(facts.foreignKeys),
        unique: Object.freeze(facts.unique.map((u) => Object.freeze(u))),
      }),
    ),
  );
}

function columns(list: string): readonly string[] {
  return Object.freeze(
    list
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c.length > 0),
  );
}

/* -------------------------------------------------------------------------- *
 * The audit
 * -------------------------------------------------------------------------- */

export interface Site {
  readonly member: string;
  /** True when some read runs before some write. #266's own predicate. */
  readonly readsBeforeWriting: boolean;
  /** Tables written, in order. */
  readonly writes: readonly string[];
  /** Tables an insert or update of this member can violate a foreign key into. */
  readonly foreignKeyRisk: readonly string[];
  /**
   * Tables that reference something this member **deletes** from without `ON DELETE CASCADE`, and
   * so can make the delete itself fail. Empty everywhere today, which is what makes `deleteUser`
   * one statement rather than four.
   */
  readonly deleteRisk: readonly string[];
  /**
   * Column lists a write of this member can collide with — **after** subtracting what the statement
   * already arbitrates. An `ON CONFLICT (config_hash, user_id, seed) DO UPDATE` is the database
   * deciding, so that constraint is not a risk; an `ON CONFLICT (id)` on a table whose *natural* key
   * is what two concurrent callers collide on leaves the natural key here, which is how the second
   * defect in `recordEntry` was found.
   */
  readonly uniqueRisk: readonly (readonly string[])[];
  /**
   * Tables this member touches whose rows a concurrent `DELETE FROM users` can remove — `users`
   * itself, and everything that cascades from it. Where this is non-empty the member has to have an
   * answer to *the row was there and now is not*, even when no constraint can fire.
   */
  readonly cascadeExposure: readonly string[];
  /** Every statement, flattened, for a failure that names what it saw. */
  readonly statements: readonly Statement[];
}

/**
 * Every member that writes, with what the database can do to it.
 *
 * The predicate is *writes at all*, not *reads then writes* — see the header. A member that only
 * reads cannot be made to lie by a concurrent delete.
 */
export function writingSites(source: string): readonly Site[] {
  const all = traces(source);
  const facts = schemaFacts(source);
  const passThrough = new Set(passThroughMembers(source));
  const sites: Site[] = [];
  for (const trace of all) {
    // A member that runs a statement it was handed is not a site of its own: the text is at each
    // caller, and so is the risk. `passThroughIsReached` is what stops that from being a hiding
    // place — a pass-through nobody hands a literal to would be a statement the audit never sees.
    if (passThrough.has(trace.name)) continue;
    const statements = flatten(all, trace.name);
    const writes = statements.filter((s) => s.kind === 'write');
    if (writes.length === 0) continue;
    let seenRead = false;
    let readsBeforeWriting = false;
    for (const s of statements) {
      if (s.kind === 'read') seenRead = true;
      else if (s.kind === 'write' && seenRead) readsBeforeWriting = true;
    }
    const foreignKeyRisk: string[] = [];
    const deleteRisk: string[] = [];
    const uniqueRisk: (readonly string[])[] = [];
    for (const write of writes) {
      for (const table of write.tables) {
        // A `DELETE` cannot violate its own table's constraints. What it can violate is a reference
        // *into* the table from somewhere that does not cascade — which is the direction that would
        // make `deleteUser` fail outright, and the reason its docstring can promise one statement.
        if (write.verb === 'DELETE') {
          for (const other of facts) {
            if (other.foreignKeys.some((fk) => fk.references === table && !fk.onDeleteCascade)) {
              if (!deleteRisk.includes(other.table)) deleteRisk.push(other.table);
            }
          }
          continue;
        }
        const fact = facts.find((f) => f.table === table);
        if (fact === undefined) continue;
        for (const fk of fact.foreignKeys) if (!foreignKeyRisk.includes(fk.references)) foreignKeyRisk.push(fk.references);
        for (const u of fact.unique) if (canCollide(write, u)) uniqueRisk.push(u);
      }
    }
    const exposed = exposedToUserDeletion(facts);
    sites.push({
      member: trace.name,
      readsBeforeWriting,
      writes: Object.freeze(writes.flatMap((w) => w.tables)),
      foreignKeyRisk: Object.freeze(foreignKeyRisk),
      deleteRisk: Object.freeze(deleteRisk),
      uniqueRisk: Object.freeze(uniqueRisk),
      cascadeExposure: Object.freeze([...new Set(statements.flatMap((s) => s.tables))].filter((t) => exposed.has(t))),
      statements: Object.freeze(statements),
    });
  }
  return Object.freeze(sites);
}

/**
 * Whether this statement can still violate the unique constraint over `columns`.
 *
 * Two subtractions, both of them the difference between a risk and a decision:
 *
 * - an `ON CONFLICT (…)` target names a constraint the statement **arbitrates**, so it is not a way
 *   for the statement to fail; and `ON CONFLICT` with no target arbitrates all of them;
 * - an `UPDATE` can only collide on a constraint that covers a column it actually sets.
 */
function canCollide(statement: Statement, columns: readonly string[]): boolean {
  const conflict = /ON CONFLICT\s*(\(([^)]*)\))?/iu.exec(statement.sql);
  if (conflict !== null) {
    if (conflict[2] === undefined) return false;
    const target = columns_(conflict[2]);
    if (target.length === columns.length && target.every((c, i) => c === columns[i])) return false;
  }
  if (statement.verb === 'UPDATE') {
    const set = /\bSET\s+([\s\S]*?)(?:\bWHERE\b|$)/iu.exec(statement.sql)?.[1] ?? '';
    const assigned = [...set.matchAll(/([A-Za-z_][\w]*)\s*=/gu)].map((m) => String(m[1]).toLowerCase());
    return columns.some((c) => assigned.some((a) => c === a || c.includes(a)));
  }
  return true;
}

function columns_(list: string): readonly string[] {
  return list
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c.length > 0);
}

/** Every table whose rows a `DELETE FROM users` can remove, `users` included. A fixpoint, not a list. */
function exposedToUserDeletion(facts: readonly TableFacts[]): ReadonlySet<string> {
  const exposed = new Set<string>(['users']);
  for (let changed = true; changed; ) {
    changed = false;
    for (const fact of facts) {
      if (exposed.has(fact.table)) continue;
      if (fact.foreignKeys.some((fk) => fk.onDeleteCascade && exposed.has(fk.references))) {
        exposed.add(fact.table);
        changed = true;
      }
    }
  }
  return exposed;
}

/** Members that run a statement handed to them by a caller. `#userRow` is the only one today. */
export function passThroughMembers(source: string): readonly string[] {
  return Object.freeze(
    traces(source)
      .filter((t) => t.steps.some((s) => s.step === 'sql-from-parameter'))
      .map((t) => t.name)
      .sort(),
  );
}

/**
 * Whether every pass-through member is handed a readable literal by at least one caller.
 *
 * False means a statement exists that this audit cannot see anywhere — which would show up as a
 * *smaller* risk surface, the one direction an audit may never fail in silently.
 */
export function passThroughIsReached(source: string, member: string): boolean {
  const all = traces(source);
  const target = all.find((t) => t.name === member);
  const wanted = target?.steps.flatMap((s) => (s.step === 'sql-from-parameter' ? [s.parameter] : [])) ?? [];
  return all.some((caller) =>
    caller.steps.some(
      (s) => s.step === 'call' && s.member === member && wanted.every((p) => s.args[p] !== undefined),
    ),
  );
}

/** #266's own set: the members in which a read runs before a write. */
export function memberReadsBeforeWriting(source: string): readonly string[] {
  return Object.freeze(
    writingSites(source)
      .filter((s) => s.readsBeforeWriting)
      .map((s) => s.member)
      .sort(),
  );
}

/** Distinct tables a member writes to. The transaction trigger of § D361 is *more than one*. */
export function writtenTables(site: Site): readonly string[] {
  return Object.freeze([...new Set(site.writes)].sort());
}

/* -------------------------------------------------------------------------- *
 * The directory
 * -------------------------------------------------------------------------- */

/** Every non-test `.ts` file in `packages/server/src/store/`. */
export function storeSources(): readonly { readonly file: string; readonly source: string }[] {
  return Object.freeze(
    readdirSync(STORE_DIR)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.test-helper.ts'))
      .sort()
      .map((file) => ({ file, source: readFileSync(join(STORE_DIR, file), 'utf8') })),
  );
}

/**
 * Which files in the directory issue SQL at all.
 *
 * The call resolution above is per-file, so a second SQL-issuing file would be a member whose
 * callees this scanner cannot follow — reported as fewer statements, which reads as less risk. The
 * test asserts this is exactly `['store.ts']`, and the day it is not, the resolution is what has to
 * be widened.
 */
export function sqlIssuingFiles(): readonly string[] {
  return Object.freeze(
    storeSources()
      .filter(({ source }) => traces(source).some((t) => t.steps.some((s) => s.step === 'sql')))
      .map(({ file }) => file),
  );
}
