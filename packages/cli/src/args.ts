/**
 * Hand-rolled argument parsing.
 *
 * No `commander`, no `yargs`: this package depends on `@elevator-sim/core` and
 * `@elevator-sim/experiments` and on nothing else, so that installing it is trivial and reading
 * it is possible. The parser is deliberately small and deliberately loud — an unknown flag or a
 * bad value produces a message that names the flag and lists what would have worked, never a
 * stack trace.
 *
 * Accepted forms:
 *
 * ```
 * --flag value      --flag=value      --flag (boolean)      --no-flag (boolean)
 * -f value          -f=value          -f                    (single-letter aliases)
 * ```
 *
 * `--` ends flag parsing; everything after it is a positional.
 */

import { UsageError, didYouMean } from './errors.js';

export type FlagKind = 'string' | 'number' | 'integer' | 'boolean';

/** One declared flag. The same declaration drives parsing, validation and `--help`. */
export interface FlagSpec {
  /** Long name, without the leading `--`. */
  readonly name: string;
  readonly kind: FlagKind;
  /** One line, shown by `--help`. */
  readonly summary: string;
  /** Single-character aliases, without the leading `-`. */
  readonly aliases?: readonly string[] | undefined;
  /** What the value is called in help output, e.g. `<id>`. */
  readonly placeholder?: string | undefined;
  readonly required?: boolean | undefined;
  /** Applied when the flag is absent. Booleans default to `false` unless stated. */
  readonly defaultValue?: FlagValue | undefined;
  /** Rendered in help as `(default: …)` when the real default is not a literal. */
  readonly defaultText?: string | undefined;
  /** Admissible values for a `string` flag, checked here so the error names them. */
  readonly choices?: readonly string[] | undefined;
  /** Inclusive bounds for a `number`/`integer` flag. */
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

export type FlagValue = string | number | boolean;

export interface ParsedArgs {
  readonly values: Readonly<Record<string, FlagValue>>;
  readonly positionals: readonly string[];
}

/**
 * Parse `argv` against `specs`.
 *
 * @param context how the command is invoked, e.g. `elevator-sim run`. Appears in every error.
 * @throws UsageError for an unknown flag, a missing value, a value of the wrong type, a value
 *   outside a declared set or range, a missing required flag, or an unexpected positional.
 */
export function parseArgs(
  argv: readonly string[],
  specs: readonly FlagSpec[],
  context: string,
): ParsedArgs {
  const byName = new Map<string, FlagSpec>();
  for (const spec of specs) {
    byName.set(spec.name, spec);
    for (const alias of spec.aliases ?? []) byName.set(alias, spec);
  }
  const longNames = specs.map((spec) => spec.name);

  const values: Record<string, FlagValue> = {};
  const positionals: string[] = [];
  let sawTerminator = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] as string;

    if (sawTerminator) {
      positionals.push(token);
      continue;
    }
    if (token === '--') {
      sawTerminator = true;
      continue;
    }
    if (!token.startsWith('-') || token === '-') {
      positionals.push(token);
      continue;
    }

    const isLong = token.startsWith('--');
    const body = isLong ? token.slice(2) : token.slice(1);
    const equals = body.indexOf('=');
    const rawName = equals === -1 ? body : body.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : body.slice(equals + 1);

    // `--no-thing` turns a boolean off.
    let negated = false;
    let name = rawName;
    if (isLong && !byName.has(name) && name.startsWith('no-')) {
      const positive = name.slice(3);
      if (byName.get(positive)?.kind === 'boolean') {
        negated = true;
        name = positive;
      }
    }

    const spec = byName.get(name);
    if (spec === undefined) {
      throw unknownFlag(token, isLong ? rawName : rawName, longNames, context);
    }

    if (spec.kind === 'boolean') {
      if (inlineValue === undefined) {
        values[spec.name] = !negated;
        continue;
      }
      values[spec.name] = parseBoolean(spec, inlineValue, context);
      continue;
    }

    if (negated) {
      throw new UsageError(
        `${context}: --no-${spec.name} is not valid; --${spec.name} takes a value.`,
      );
    }

    let raw = inlineValue;
    if (raw === undefined) {
      const next = argv[index + 1];
      if (next === undefined || (next.startsWith('-') && next !== '-' && !isNegativeNumber(next))) {
        throw new UsageError(
          `${context}: flag --${spec.name} needs a value.`,
          [`usage: --${spec.name} ${spec.placeholder ?? '<value>'}   ${spec.summary}`],
        );
      }
      raw = next;
      index += 1;
    }

    values[spec.name] = coerce(spec, raw, context);
  }

  for (const spec of specs) {
    if (spec.name in values) continue;
    if (spec.required === true) {
      throw new UsageError(
        `${context}: missing required flag --${spec.name}.`,
        [
          `--${spec.name} ${spec.placeholder ?? '<value>'}   ${spec.summary}`,
          ...(spec.choices === undefined ? [] : [`valid values: ${spec.choices.join(', ')}`]),
        ],
      );
    }
    if (spec.defaultValue !== undefined) {
      values[spec.name] = spec.defaultValue;
    } else if (spec.kind === 'boolean') {
      values[spec.name] = false;
    }
  }

  return { values, positionals };
}

function unknownFlag(
  token: string,
  name: string,
  longNames: readonly string[],
  context: string,
): UsageError {
  const suggestion = didYouMean(name, longNames);
  const details = [
    `known flags: ${longNames.map((flag) => `--${flag}`).join(', ')}`,
    ...(suggestion === undefined ? [] : [`did you mean --${suggestion}?`]),
  ];
  return new UsageError(`${context}: unknown flag "${token}".`, details);
}

function isNegativeNumber(token: string): boolean {
  return /^-\d/.test(token);
}

function parseBoolean(spec: FlagSpec, raw: string, context: string): boolean {
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  throw new UsageError(
    `${context}: --${spec.name} expects true or false; received "${raw}".`,
  );
}

function coerce(spec: FlagSpec, raw: string, context: string): FlagValue {
  if (spec.kind === 'string') {
    if (spec.choices !== undefined && !spec.choices.includes(raw)) {
      const suggestion = didYouMean(raw, spec.choices);
      throw new UsageError(
        `${context}: --${spec.name} does not accept "${raw}".`,
        [
          `valid values: ${spec.choices.join(', ')}`,
          ...(suggestion === undefined ? [] : [`did you mean "${suggestion}"?`]),
        ],
      );
    }
    return raw;
  }

  const value = Number(raw.replace(/_/g, ''));
  if (raw.trim() === '' || !Number.isFinite(value)) {
    throw new UsageError(
      `${context}: --${spec.name} expects a ${spec.kind === 'integer' ? 'whole number' : 'number'}; received "${raw}".`,
    );
  }
  if (spec.kind === 'integer' && !Number.isSafeInteger(value)) {
    throw new UsageError(
      `${context}: --${spec.name} expects a whole number no larger than ${Number.MAX_SAFE_INTEGER}; received "${raw}".`,
    );
  }
  if (spec.min !== undefined && value < spec.min) {
    throw new UsageError(
      `${context}: --${spec.name} must be at least ${spec.min}; received ${value}.`,
    );
  }
  if (spec.max !== undefined && value > spec.max) {
    throw new UsageError(
      `${context}: --${spec.name} must be at most ${spec.max}; received ${value}.`,
    );
  }
  return value;
}

/* -------------------------------------------------------------------------- *
 * Typed accessors. `noUncheckedIndexedAccess` makes the raw record awkward to
 * read; these do the narrowing once, and throw on a programming error rather
 * than returning a plausible zero.
 * -------------------------------------------------------------------------- */

export function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.values[name];
  return typeof value === 'string' ? value : undefined;
}

export function requiredStringFlag(parsed: ParsedArgs, name: string): string {
  const value = stringFlag(parsed, name);
  if (value === undefined) throw new UsageError(`missing required flag --${name}.`);
  return value;
}

export function numberFlag(parsed: ParsedArgs, name: string): number | undefined {
  const value = parsed.values[name];
  return typeof value === 'number' ? value : undefined;
}

export function booleanFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.values[name] === true;
}

/** Reject positionals for commands that take none, naming the stray argument. */
export function rejectPositionals(parsed: ParsedArgs, context: string): void {
  const stray = parsed.positionals[0];
  if (stray === undefined) return;
  throw new UsageError(
    `${context}: unexpected argument "${stray}".`,
    ['this command takes flags only; run with --help to see them'],
  );
}
