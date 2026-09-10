/**
 * **What a stored service-event effect is allowed to be** — GitHub issue **#476**,
 * [§ D405](../../../../DECISIONS.md).
 *
 * ## The defect this exists to close
 *
 * `packages/viz/src/watch/record.ts` reads a `WatchRecord` back off `localStorage` and refuses one
 * it cannot re-ask. Its `answer-incident` arm demanded a `carId` on **every** effect, and a
 * {@link ResolvedServiceEvent} may instead name a bank's serving range, which carries no car
 * (§ D523). So an answer that closed a zone — or the derate
 * `packages/viz/src/campaign/incidents.ts#answerChangeOf` writes on a car's return — came back as
 * *this record is malformed* when the truth was *this reader does not know that shape*.
 *
 * The check was right to exist and the **shape of its acceptance** was wrong, which is why the fix
 * is a description rather than a widening: a reader that accepted anything would be the more
 * dangerous defect, and deciding what a stored effect may be is a question about
 * `ResolvedServiceEvent` rather than about one arm of one gate.
 *
 * ## Why one description rather than one check per reader
 *
 * #370 added two more kinds that carry effects, written tolerantly and saying so, so the tree held
 * **two readers with different ideas of what an effect may look like** — one that demanded a car on
 * every effect and one that asked for a `atS` and nothing else. Neither was right, and nothing
 * could tell you they disagreed. That is `interventionWire.ts`'s finding one substrate down: the
 * intervention wire set was spelled six times with a drift test over two of them.
 *
 * So {@link STORED_EFFECT_SHAPES} is the one description and {@link storedEffectIssue} is the one
 * reader, and `packages/viz/src/watch/record.test.ts` derives the reader set **from disk** rather
 * than from a list, so a third reader spelled by hand goes red rather than quietly disagreeing.
 *
 * ## Why it is in `core` and not in `packages/viz`
 *
 * `interventionWire.ts`'s argument exactly: the question is *what may an effect be?*, and the
 * answer is decided entirely by `config/types.ts#ResolvedServiceEvent`, which this package owns.
 * `packages/viz` may not import `packages/server` (§ D215 § 3), so the only place two ends can
 * share one derivation is the package they both already depend on.
 *
 * ## The table is tied to the union by the compiler, in both directions
 *
 * {@link ShapeFor} makes each row's `fields` a `Record` over **that arm's own keys**, so a field
 * added to `ResolvedServiceModeEvent` and not described here will not compile, and a field
 * described here that the arm does not have will not either. {@link EffectDiscriminant} is derived
 * as *the keys that appear on exactly one arm*, so a row cannot claim a discriminant that tells
 * nothing apart, and `storedEffect.test.ts` asserts the remaining direction — that every arm of the
 * union has a row — with a type-level check the compiler runs.
 *
 * ## Where this is deliberately stricter than `Simulation`, and why
 *
 * `Simulation#carriedEffectEvents` refuses a derate whose `ratedLoadKg` is not positive and says
 * nothing about `ratedLoadLb`, which it never reads. This asks both to be positive loads, because
 * `ratedLoadLb` is the plate the author wrote and the field that tells a derate from a mode change
 * — a plate of zero pounds is not a plate, and a record naming one is damaged rather than large.
 * The divergence is stated rather than discovered: this gate answers a *storage* question about
 * untrusted bytes and returns a picker row, where `Simulation`'s answers a *run* question about
 * a building and throws.
 */

import { SERVICE_MODES, type ResolvedServiceEvent } from '../config/types.js';

import { INTERVENTION_KINDS, type InterventionChange, type InterventionKind } from './types.js';

/* -------------------------------------------------------------------------- *
 * The discriminants, derived from the union rather than transcribed
 * -------------------------------------------------------------------------- */

/** Every key any arm of {@link ResolvedServiceEvent} carries. Distributive, so it is the union. */
type EveryEffectKey = ResolvedServiceEvent extends infer Arm
  ? Arm extends object
    ? keyof Arm
    : never
  : never;

/** The arms of {@link ResolvedServiceEvent} that carry `Key`. */
type ArmsWith<Key extends EveryEffectKey> = Extract<ResolvedServiceEvent, Record<Key, unknown>>;

/** Whether `T` is a union of more than one member. Non-distributive on `U` by construction. */
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

/**
 * The keys that appear on **exactly one** arm — the only keys that can tell the three shapes apart,
 * derived.
 *
 * `atS` and `bankId` are on all three and `carId` is on two, so none of them is here; a typo is not
 * here either. That is what stops a row claiming a discriminant that discriminates nothing, which
 * is the failure a hand-written `'mode' | 'servesFloors' | 'ratedLoadLb'` could not see.
 */
export type EffectDiscriminant = {
  [Key in EveryEffectKey]: [ArmsWith<Key>] extends [never]
    ? never
    : IsUnion<ArmsWith<Key>> extends false
      ? Key
      : never;
}[EveryEffectKey];

/* -------------------------------------------------------------------------- *
 * The field vocabulary
 * -------------------------------------------------------------------------- */

/**
 * What one field of a stored effect must be. A closed vocabulary, so the table stays *data* — the
 * repository's seventh invariant pointed at a validator rather than at a dispatcher.
 */
export type StoredEffectFieldKind =
  | 'a finite number'
  | 'a non-empty string'
  | 'a non-empty list of non-empty strings'
  | 'a positive finite number'
  | 'a declared service mode';

/** One field's rule: what it must be, and the words a reader shows when it is not. */
export interface StoredEffectField {
  readonly must: StoredEffectFieldKind;
  /**
   * Fits `…an effect that ${miss}` — a **clause**, so every reader's own sentence stays its own.
   * The two readers in `watch/record.ts` wrap it differently and neither owns the words for what
   * is missing.
   */
  readonly miss: string;
}

/**
 * The predicate behind each kind, and the vocabulary it draws from when it draws from one.
 *
 * A field with a `vocabulary` misses as *this build does not ship X* rather than as *this record is
 * malformed*, because a mode this build does not declare is a fact about the build and a bank id
 * that is not a string is a fact about the bytes. Telling those apart in the sentence is the whole
 * of what #476 was filed about, one level up.
 */
const FIELD_CHECKS: Readonly<
  Record<
    StoredEffectFieldKind,
    { readonly ok: (value: unknown) => boolean; readonly vocabulary?: string }
  >
> = Object.freeze({
  'a finite number': { ok: (value) => typeof value === 'number' && Number.isFinite(value) },
  'a non-empty string': { ok: (value) => typeof value === 'string' && value.length > 0 },
  'a non-empty list of non-empty strings': {
    ok: (value) =>
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((entry) => typeof entry === 'string' && entry.length > 0),
  },
  'a positive finite number': {
    ok: (value) => typeof value === 'number' && Number.isFinite(value) && value > 0,
  },
  'a declared service mode': {
    ok: (value) => typeof value === 'string' && (SERVICE_MODES as readonly string[]).includes(value),
    vocabulary: 'service mode',
  },
});

/* -------------------------------------------------------------------------- *
 * The description
 * -------------------------------------------------------------------------- */

/**
 * One admissible shape, tied to its arm of the union by the compiler.
 *
 * `fields` is a `Record` over **that arm's own keys**: every key required, no key invented. A field
 * added to `ResolvedServiceRangeEvent` and not described here is a build error, which is the
 * property a hand-written checklist never had.
 */
export interface ShapeFor<Discriminant extends EffectDiscriminant> {
  readonly discriminant: Discriminant;
  /** What this shape changes, in `describeServiceEvent`'s own register. Read by a player. */
  readonly does: string;
  readonly fields: Readonly<Record<keyof ArmsWith<Discriminant>, StoredEffectField>>;
}

/**
 * **The admissible shapes of a stored effect** — the one description every reader consults.
 *
 * Three rows because `ResolvedServiceEvent` has three arms (§ D523), and the type-level check in
 * `storedEffect.test.ts` fails if it grows a fourth without one. Order is the order
 * `config/serviceEvent.ts` declares its guards in, so a refusal that lists them reads the same
 * twice.
 */
export const STORED_EFFECT_SHAPES: {
  readonly mode: ShapeFor<'mode'>;
  readonly range: ShapeFor<'servesFloors'>;
  readonly derate: ShapeFor<'ratedLoadLb'>;
} = Object.freeze({
  mode: {
    discriminant: 'mode',
    does: 'a car’s service mode',
    fields: {
      atS: { must: 'a finite number', miss: 'carries no simulated second' },
      bankId: { must: 'a non-empty string', miss: 'names no bank' },
      carId: { must: 'a non-empty string', miss: 'names no car' },
      mode: { must: 'a declared service mode', miss: 'names no service mode' },
    },
  },
  range: {
    discriminant: 'servesFloors',
    does: 'a bank’s serving range',
    fields: {
      atS: { must: 'a finite number', miss: 'carries no simulated second' },
      bankId: { must: 'a non-empty string', miss: 'names no bank' },
      /*
       * Non-empty, and that bound is `Simulation`'s rather than this file's: a bank set to serve no
       * floors *"is a car out of service wearing a different name; say that instead"*. A reader
       * that accepted it would hand the replay a run the engine throws on.
       */
      servesFloors: {
        must: 'a non-empty list of non-empty strings',
        miss: 'gives the bank no floors to serve',
      },
    },
  },
  derate: {
    discriminant: 'ratedLoadLb',
    does: 'a car’s rated load',
    fields: {
      atS: { must: 'a finite number', miss: 'carries no simulated second' },
      bankId: { must: 'a non-empty string', miss: 'names no bank' },
      carId: { must: 'a non-empty string', miss: 'names no car' },
      ratedLoadLb: { must: 'a positive finite number', miss: 'rates the car at no plated load' },
      ratedLoadKg: { must: 'a positive finite number', miss: 'rates the car at no load in kilograms' },
    },
  },
});

/** The rows, in declaration order. */
const SHAPES = Object.freeze(Object.values(STORED_EFFECT_SHAPES));

/** *a car’s service mode, a bank’s serving range or a car’s rated load* — derived, for a refusal. */
function whatAnEffectMayChange(): string {
  const does = SHAPES.map((shape) => shape.does);
  const last = does[does.length - 1] ?? '';
  return does.length < 2 ? last : `${does.slice(0, -1).join(', ')} or ${last}`;
}

/* -------------------------------------------------------------------------- *
 * The one reader
 * -------------------------------------------------------------------------- */

/**
 * Why a stored effect cannot be re-asked.
 *
 * Two arms rather than a string, because the two refusals belong to different registers and the
 * caller writes the sentence: a `vocabulary` miss is *this build does not ship the service mode
 * “toast”* and a `shape` miss is a clause the caller drops into its own *…would be a guess at what
 * it changed*. Collapsing them into one string is how a reader ends up blaming the file for
 * something the build did.
 */
export type StoredEffectIssue =
  | { readonly kind: 'shape'; readonly clause: string }
  | { readonly kind: 'vocabulary'; readonly noun: string; readonly value: string };

/**
 * Everything structurally wrong with one stored effect, or `null` — the whole of what a reader of
 * an untrusted record needs to ask about it.
 *
 * `unknown` in, deliberately: every caller is reading bytes that a type annotation cannot vouch
 * for, and a parameter typed `ResolvedServiceEvent` would be a promise the caller cannot keep.
 *
 * What this does **not** ask is whether the run builds that bank or that car, or whether the effect
 * falls inside the run's window. Those are questions about a building and a horizon rather than
 * about a shape, `Simulation` asks them where the building is, and asking them here would make this
 * a second answer to them.
 */
export function storedEffectIssue(effect: unknown): StoredEffectIssue | null {
  if (effect === null || typeof effect !== 'object' || Array.isArray(effect)) {
    return { kind: 'shape', clause: 'is not an effect at all' };
  }
  const held = effect as Readonly<Record<string, unknown>>;
  const matching = SHAPES.filter((shape) => shape.discriminant in held);
  if (matching.length === 0) {
    return {
      kind: 'shape',
      clause: `changes none of the things a service event can change (${whatAnEffectMayChange()})`,
    };
  }
  if (matching.length > 1) {
    /*
     * `config/serviceEvent.ts` states the exclusivity this enforces — *"no shape carries two of the
     * three"* — and an effect that carries two is not an arm of the union at all. Refused rather
     * than resolved by precedence, because picking one would be the reader deciding what the record
     * meant, which is § 1.5's approximate replay with a tidier name.
     */
    return {
      kind: 'shape',
      clause: `changes more than one thing at once (${matching.map((shape) => shape.does).join(' and ')})`,
    };
  }
  const shape = matching[0];
  /* c8 ignore next -- `matching.length === 1` a line ago; the index is for the type checker. */
  if (shape === undefined) return null;
  for (const [name, field] of Object.entries(shape.fields) as readonly (readonly [
    string,
    StoredEffectField,
  ])[]) {
    const check = FIELD_CHECKS[field.must];
    if (check.ok(held[name])) continue;
    return check.vocabulary === undefined
      ? { kind: 'shape', clause: field.miss }
      : { kind: 'vocabulary', noun: check.vocabulary, value: String(held[name]) };
  }
  return null;
}

/* -------------------------------------------------------------------------- *
 * Which kinds carry effects at all
 * -------------------------------------------------------------------------- */

/**
 * The kinds whose arm of `InterventionChange` carries `serviceEvents`, as a type.
 *
 * Derived from the union rather than listed, so a fourth kind that carries effects joins it by
 * being declared. {@link EFFECT_CARRYING_KINDS} is the runtime half and the two are tied together
 * below.
 */
export type EffectCarryingKind = Extract<
  InterventionChange,
  { readonly serviceEvents: readonly unknown[] }
>['kind'];

/**
 * Whether each declared kind's arm carries `serviceEvents`.
 *
 * `Record<InterventionKind, boolean>` and not a partial one, which is the whole point:
 * `INTERVENTION_WIRE`'s move exactly. A kind added to `INTERVENTION_KINDS` with no row here is a
 * **compile error**, so a seventh kind cannot arrive in an undefined state at this gate — which is
 * what #371 was filed about, one table over.
 *
 * **`as const satisfies` rather than an annotation**, for `INTERVENTION_WIRE`'s stated reason: an
 * annotation widens every value to `boolean`, which makes {@link CarriesEffectsByTable} resolve to
 * `never` and the assertions in `storedEffect.test.ts` vacuously true.
 */
const CARRIES_EFFECTS = {
  'park-cars-lobby': false,
  'switch-dispatcher': false,
  'answer-incident': true,
  'spread-cars': false,
  'equipment-change': true,
  'building-change': true,
} as const satisfies Readonly<Record<InterventionKind, boolean>>;

/** The kinds the table says carry effects, as a type. The union's own answer is above. */
export type CarriesEffectsByTable = {
  [Kind in InterventionKind]: (typeof CARRIES_EFFECTS)[Kind] extends true ? Kind : never;
}[InterventionKind];

/**
 * The kinds a reader must check effects on — an **allow-list**, `CARRIED_INTERVENTION_KINDS`' own
 * precedent: a kind added tomorrow is unchecked until somebody writes `true` beside it, and the
 * compiler asks the question rather than waiting for a defect to.
 *
 * **The predicate narrows to {@link CarriesEffectsByTable} and the annotation is
 * {@link EffectCarryingKind}**, which is not a spelling choice: that pairing is what makes the
 * compiler check one direction. A `true` row beside a kind whose arm carries no effects widens the
 * table's type past the union's and the annotation fails. Narrowing straight to `EffectCarryingKind`
 * would have been an unchecked assertion dressed as a check — the table could say anything.
 *
 * `storedEffect.test.ts` asserts the other direction, so a kind that grows a `serviceEvents` field
 * and is left `false` here is a build error rather than a gate that silently stops reading its
 * effects.
 *
 * Iteration order is `INTERVENTION_KINDS`' own, so a refusal that lists it reads the same twice.
 */
export const EFFECT_CARRYING_KINDS: readonly EffectCarryingKind[] = Object.freeze(
  INTERVENTION_KINDS.filter((kind): kind is CarriesEffectsByTable => CARRIES_EFFECTS[kind]),
);
