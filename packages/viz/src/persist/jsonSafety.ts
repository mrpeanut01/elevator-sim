/**
 * *Does this value survive `JSON.parse(JSON.stringify(x))` unchanged?* — asked of the snapshot
 * before it is written, rather than discovered when the shell goes blank.
 *
 * ## The trap this exists for, by name
 *
 * `ViewerState.seed` is a **`bigint`**, and `JSON.stringify` does not skip a bigint, coerce it or
 * write it as a string: it **throws** `TypeError: Do not know how to serialize a BigInt`. So a save
 * path that stringified whatever it was handed would work perfectly until the day somebody widened
 * {@link SessionSnapshot} by one field, and then it would throw from inside a click handler on
 * every state change in the product. That is not a hypothetical shape — the seed is one field away
 * from the week in the same state object, and it is a `bigint` for a good reason (`FreePlaySelection`
 * carries the same quantity as a decimal *string*, because *"a seed is an identity, not a quantity
 * to do arithmetic on"*).
 *
 * The types cannot prevent it. TypeScript is erased by the time this code runs, the payload is
 * assembled from two states that other directories own, and `readonly` says nothing about what a
 * field's runtime type is. So the property is checked on the value.
 *
 * ## Four ways a value fails, and only one of them is loud
 *
 * | in the snapshot | what `JSON.stringify` does | how it is noticed without this file |
 * |---|---|---|
 * | `bigint` | throws | immediately, in the caller |
 * | `undefined`, a function, a symbol | **drops the key** | the reload refuses on a missing key, blaming the reader |
 * | `NaN`, `Infinity` | writes `null` | a streak of `null` that reads back as a shape error |
 * | `Date`, `Map`, `Set`, a class instance | writes something that parses back as *something else* | never — the restore succeeds and the value is wrong |
 *
 * The bottom row is the reason this walker returns a **path** rather than a boolean. A `Date` field
 * round-trips into an ISO string, passes a `typeof value === 'string'` check written later by
 * somebody reasonable, and is then rendered as a date nobody stored. Silent, plausible and wrong is
 * the failure mode this repository is built to refuse, so the check is *"the reconstructed value is
 * the same value"*, not *"the write did not throw"*.
 *
 * ## Its non-test caller
 *
 * `./session.ts`, on the save path, before the store is touched at all.
 */

/**
 * How deep a snapshot is allowed to nest before this walker calls it a defect.
 *
 * A `SessionSnapshot` is four levels at its deepest — `week.history[i].readings[j].goal.label` —
 * so a value beyond this is not a session, it is a cycle or a state object somebody spread in by
 * accident. Bounded rather than trusted because the walker is the thing standing between the shell
 * and a stack overflow, and a guard that can itself blow the stack has moved the failure rather
 * than caught it.
 */
const MAX_DEPTH = 12;

/** `Object`-or-null prototype: a value `JSON.parse` could have produced. */
function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** What to call a value in a message, without printing the value itself. */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') {
    const name: unknown = (value as { readonly constructor?: { readonly name?: unknown } })
      .constructor?.name;
    return typeof name === 'string' && name !== '' ? `a ${name}` : 'an exotic object';
  }
  return `a ${typeof value}`;
}

/** Where the round trip would break, and what would break it. */
export interface JsonIssue {
  /** A path into the value — `the session.session.week.day`. */
  readonly path: string;
  /** The clause after the path: *"is a bigint, and JSON.stringify throws on one"*. */
  readonly reason: string;
}

const at = (path: string, reason: string): JsonIssue => ({ path, reason });

/**
 * The first place `value` would not survive a JSON round trip, or `undefined`.
 *
 * Depth-first and **first-wrong rather than all-wrong**, which is the opposite of `freePlayIssues`'
 * rule and deliberately so: that function reports to a player who has to fix every problem, and
 * this one reports to a developer who has introduced exactly one — a field was widened, and the
 * path to it is the whole diagnosis. Listing every leaf under a stray `Map` would bury it.
 *
 * @param path what to call the root in the message.
 */
export function jsonRoundTripIssue(
  value: unknown,
  path = 'the snapshot',
  depth = 0,
  seen: ReadonlySet<object> = new Set(),
): JsonIssue | undefined {
  if (depth > MAX_DEPTH) {
    return at(path, `nests deeper than ${String(MAX_DEPTH)} levels, which no session shape does`);
  }

  switch (typeof value) {
    case 'bigint':
      // The named trap. The message says what happens rather than that it is disallowed, because
      // the next reader's question is "why not just store it".
      return at(path, 'is a bigint, and JSON.stringify throws on one rather than writing it');
    case 'undefined':
      return at(path, 'is undefined, and JSON.stringify drops the key rather than writing it');
    case 'function':
      return at(path, 'is a function, and JSON.stringify drops the key rather than writing it');
    case 'symbol':
      return at(path, 'is a symbol, and JSON.stringify drops the key rather than writing it');
    case 'number':
      return Number.isFinite(value)
        ? undefined
        : at(path, `is ${String(value)}, and JSON.stringify writes null rather than the number`);
    case 'string':
    case 'boolean':
      return undefined;
    default:
      break;
  }

  if (value === null) return undefined;
  const object = value as object;
  if (seen.has(object)) {
    return at(path, 'is already on the path above it, and JSON.stringify throws on a cycle');
  }
  const within = new Set(seen).add(object);

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const issue = jsonRoundTripIssue(entry, `${path}[${String(index)}]`, depth + 1, within);
      if (issue !== undefined) return issue;
    }
    return undefined;
  }

  if (!isPlainObject(object)) {
    /*
     * A `Date` is the instructive case and the reason this branch is a refusal rather than a
     * recursion into the instance's own fields. `JSON.stringify(new Date())` succeeds — `toJSON`
     * makes it an ISO string — and parses back as a string, so the write is clean, the read is
     * clean, and the value has silently changed type. Refusing the class is the only check that
     * catches it, and it catches `Map` and `Set` on the way past: both stringify to `{}`, losing
     * every entry without a single error. `ViewerState.revealedTabs` is a `ReadonlySet` today,
     * one spread away from a snapshot.
     */
    return at(
      path,
      `is ${describe(value)}, which JSON.parse(JSON.stringify(x)) does not reconstruct — ` +
        'it comes back as a plain object, a string, or an empty one',
    );
  }

  for (const [key, entry] of Object.entries(object)) {
    const issue = jsonRoundTripIssue(entry, `${path}.${key}`, depth + 1, within);
    if (issue !== undefined) return issue;
  }
  return undefined;
}
