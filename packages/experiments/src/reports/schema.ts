/**
 * Hand-written validation for the stored-result envelope.
 *
 * ## Why not zod
 *
 * `core` may depend on zod and does; `experiments` may depend on `core` and nothing else
 * (CLAUDE.md § toolchain, and this package's `package.json` has exactly one dependency). Reaching
 * through a hoisted `node_modules` for a package this workspace has not declared is a dependency
 * in everything but the manifest, and the manifest is the thing that gets audited.
 *
 * It costs less than it looks. The envelope is a dozen scalars plus four small option bags; the
 * expensive part of the shape — the `RunRecord` with its thousands of per-passenger entries — is
 * validated by `core`'s own `parseRunRecord`, which is zod-backed, strict, and owns that schema.
 * So this file validates the envelope and delegates the dataset, which is also the right
 * ownership boundary: a new `PassengerRecord` field must not require an edit here.
 *
 * ## What "strict" means here
 *
 * Unrecognized keys are an **error**, matching `core/config/schema.ts` and
 * `core/metrics/serialization.ts`. A stored result is a contract, and a field that is silently
 * dropped is a field somebody will later believe was recorded — which for a replay knob means a
 * run that replays to a different answer and no obvious reason why.
 *
 * Every failure names a JSON path (`config.demand.arrivalRatePctPop5min`), because these errors
 * are read against a file, often a line of a 20 000-line one.
 */

import { ReportsError } from './types.js';

/* -------------------------------------------------------------------------- *
 * Paths
 * -------------------------------------------------------------------------- */

/** A location inside the parsed value, for error messages. */
export type Path = readonly (string | number)[];

export function formatPath(path: Path): string {
  if (path.length === 0) return '(root)';
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out === '' ? segment : `.${segment}`;
  }
  return out;
}

export function fail(path: Path, message: string): never {
  throw new ReportsError(`${formatPath(path)}: ${message}`);
}

/* -------------------------------------------------------------------------- *
 * Scalars
 * -------------------------------------------------------------------------- */

export function expectObject(value: unknown, path: Path): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, `expected an object, received ${describe(value)}`);
  }
  return value as Record<string, unknown>;
}

export function expectString(value: unknown, path: Path): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(path, `expected a non-empty string, received ${describe(value)}`);
  }
  return value;
}

/**
 * A finite number.
 *
 * `NaN` and `Infinity` are refused rather than accepted and propagated. They do not survive
 * `JSON.stringify` (both become `null`), so their appearance in a parsed value means the writer
 * was not this module — and a non-finite tunable is how a replay produces a run nobody can read.
 */
export function expectNumber(value: unknown, path: Path): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, `expected a finite number, received ${describe(value)}`);
  }
  return value;
}

export function expectInteger(value: unknown, path: Path, min = Number.NEGATIVE_INFINITY): number {
  const number = expectNumber(value, path);
  if (!Number.isInteger(number)) fail(path, `expected an integer, received ${number}`);
  if (number < min) fail(path, `expected an integer >= ${min}, received ${number}`);
  return number;
}

export function expectBoolean(value: unknown, path: Path): boolean {
  if (typeof value !== 'boolean') fail(path, `expected a boolean, received ${describe(value)}`);
  return value;
}

/**
 * A 64-bit unsigned seed written as a decimal string. **CLAUDE.md invariant 5, enforced.**
 *
 * The same regex `core/metrics/serialization.ts` applies to `RunRecord.seed`, applied to the
 * envelope for the same reason: a record whose seed cannot be turned back into a `bigint` is not
 * a record with a cosmetic flaw, it is a dataset nobody can reproduce.
 */
export function expectSeed(value: unknown, path: Path): string {
  const text = expectString(value, path);
  if (!/^\d+$/.test(text)) {
    fail(
      path,
      `expected a seed written as a non-negative decimal integer string, received "${text}". Every persisted record must carry the seed that produced it (CLAUDE.md invariant 5) or it cannot be replayed`,
    );
  }
  return text;
}

export function expectEnum<T extends string>(
  value: unknown,
  path: Path,
  allowed: readonly T[],
): T {
  const text = expectString(value, path);
  if (!(allowed as readonly string[]).includes(text)) {
    fail(path, `expected one of ${allowed.map((a) => `"${a}"`).join(', ')}, received "${text}"`);
  }
  return text as T;
}

export function expectArray(value: unknown, path: Path): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, `expected an array, received ${describe(value)}`);
  return value;
}

export function expectStringArray(value: unknown, path: Path): readonly string[] {
  return expectArray(value, path).map((item, index) => expectString(item, [...path, index]));
}

export function expectNumberArray(value: unknown, path: Path): readonly number[] {
  return expectArray(value, path).map((item, index) => expectNumber(item, [...path, index]));
}

/** A `Record<string, number>` — entrance weights, dispatcher weight vectors. */
export function expectNumberRecord(value: unknown, path: Path): Readonly<Record<string, number>> {
  const object = expectObject(value, path);
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(object)) {
    out[key] = expectNumber(entry, [...path, key]);
  }
  return out;
}

/** The `metadata` shape shared with `RunRecord.metadata`. */
export function expectMetadata(
  value: unknown,
  path: Path,
): Readonly<Record<string, string | number | boolean>> {
  const object = expectObject(value, path);
  const out: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(object)) {
    if (typeof entry === 'string' || typeof entry === 'boolean') out[key] = entry;
    else out[key] = expectNumber(entry, [...path, key]);
  }
  return out;
}

/* -------------------------------------------------------------------------- *
 * Strictness
 * -------------------------------------------------------------------------- */

/**
 * Refuse any key the reader does not know about.
 *
 * The alternative — ignoring unknown keys — is what turns a schema-version bump into an optional
 * courtesy. See the file docstring.
 */
export function rejectUnknownKeys(
  object: Record<string, unknown>,
  path: Path,
  known: readonly string[],
): void {
  const unknown = Object.keys(object).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    fail(
      path,
      `unrecognized ${unknown.length === 1 ? 'key' : 'keys'} ${unknown
        .map((key) => `"${key}"`)
        .join(', ')}; known keys are ${known.map((key) => `"${key}"`).join(', ')}. Refusing to drop a field silently — a dropped replay knob is a run that replays to a different answer`,
    );
  }
}

/**
 * Read an optional field, applying `read` only when the key is present with a value.
 *
 * `null` is treated as absent, because `JSON.stringify` turns an explicit `undefined` inside an
 * array into `null` and a permissive reader here costs nothing. Under
 * `exactOptionalPropertyTypes` the caller must then *omit* the key rather than set it to
 * `undefined`, which every construction site in this module does with a conditional spread.
 */
export function readOptional<T>(
  object: Record<string, unknown>,
  key: string,
  path: Path,
  read: (value: unknown, path: Path) => T,
): T | undefined {
  const value = object[key];
  if (value === undefined || value === null) return undefined;
  return read(value, [...path, key]);
}

/* -------------------------------------------------------------------------- *
 * Diagnostics
 * -------------------------------------------------------------------------- */

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : `${String(value)}`;
  if (typeof value === 'string') return `"${value.length > 40 ? `${value.slice(0, 40)}…` : value}"`;
  return typeof value;
}
