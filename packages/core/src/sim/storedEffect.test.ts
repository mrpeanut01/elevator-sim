/**
 * **The description of a stored effect, held to the union it describes** — GitHub issue #476.
 *
 * Three claims `storedEffect.ts` makes in prose are settled here rather than asserted:
 *
 * 1. **Every arm of `ResolvedServiceEvent` has a row**, and every kind that carries effects is on
 *    the allow-list. Both are type-level checks, in this file for `interventionWire.test.ts`'
 *    stated reason: an assertion needs a value to hang on, a value nothing imports is a dead
 *    export, and `tsc -b` compiles the test files anyway — so a mismatch is a build error.
 * 2. **Each row is accepted**, driven from the row's own fields rather than from three transcribed
 *    exemplars, so a shape added to the table is exercised the day it lands.
 * 3. **Each row's fields are load bearing**, driven the same way: every field of every shape is
 *    dropped and corrupted in turn and the effect must be refused each time. A description whose
 *    fields nothing checks is a checklist.
 */

import { describe, expect, it } from 'vitest';

import type { ResolvedServiceEvent } from '../config/types.js';

import {
  EFFECT_CARRYING_KINDS,
  STORED_EFFECT_SHAPES,
  storedEffectIssue,
  type CarriesEffectsByTable,
  type EffectCarryingKind,
  type EffectDiscriminant,
  type StoredEffectField,
  type StoredEffectFieldKind,
} from './storedEffect.js';

/* -------------------------------------------------------------------------- *
 * The two directions, checked by the compiler
 * -------------------------------------------------------------------------- */

/** `true` when `A` and `B` are the same union. Non-distributive, so `never` cannot hide a gap. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * The arms `Key` selects — **distributed over `Key`**, which the first draft of this file was not.
 *
 * `Extract<T, Record<'mode' | 'servesFloors', unknown>>` asks for an arm carrying *both* keys, which
 * no arm does, so the whole check quietly resolved to `never` and read as a failure of the table.
 * It was not: `Record<K, V>` over a union `K` is one object with every key, not a union of objects.
 * Caught on the first compile, which is the assertion doing its job before the code it guards had
 * shipped — `interventionWire.ts` records the same thing happening to its own pair.
 */
type ArmWith<Key extends string> = Key extends unknown
  ? Extract<ResolvedServiceEvent, Record<Key, unknown>>
  : never;

/** Every arm the table's discriminants select, as a union. */
type DescribedArm = ArmWith<
  (typeof STORED_EFFECT_SHAPES)[keyof typeof STORED_EFFECT_SHAPES]['discriminant']
>;

/*
 * **Every arm of the union has a row, and no row selects something that is not an arm.** An arm
 * added to `ResolvedServiceEvent` with no row here makes this `false` and the file will not
 * compile, which is the property a hand-written checklist of three shapes never had.
 */
const everyArmIsDescribed: Same<ResolvedServiceEvent, DescribedArm> = true;

/*
 * **The allow-list and the union agree about which kinds carry effects**, in both directions —
 * `interventionWire.ts`'s pair, pointed at the field rather than at the wire. A seventh kind that
 * carries `serviceEvents` and is left `false` in `CARRIES_EFFECTS` fails here.
 */
const everyCarryingKindIsListed: Same<EffectCarryingKind, CarriesEffectsByTable> = true;

/*
 * The derivation is not vacuous: `EffectDiscriminant` must actually hold the keys that tell the
 * arms apart. A conditional type that quietly resolved to `never` would make every row's
 * `discriminant` unassignable — but it would also make `Same<…>` above trivially satisfiable if the
 * union collapsed, so the floor is asserted directly.
 */
const modeIsADiscriminant: 'mode' extends EffectDiscriminant ? true : false = true;
const carIdIsNotADiscriminant: 'carId' extends EffectDiscriminant ? true : false = false;

/* -------------------------------------------------------------------------- *
 * The runtime half
 * -------------------------------------------------------------------------- */

/** A value that satisfies each field kind, and one that does not. Keyed by the closed vocabulary. */
const SAMPLES: Readonly<Record<StoredEffectFieldKind, { readonly ok: unknown; readonly bad: unknown }>> =
  Object.freeze({
    'a finite number': { ok: 200, bad: Number.NaN },
    'a non-empty string': { ok: 'main', bad: '' },
    'a non-empty list of non-empty strings': { ok: ['G', '2'], bad: [] },
    'a positive finite number': { ok: 900, bad: 0 },
    'a declared service mode': { ok: 'out-of-service', bad: 'toast' },
  });

/** The smallest effect of `shape` that the description accepts, built from the row itself. */
function wellFormed(shape: (typeof STORED_EFFECT_SHAPES)[keyof typeof STORED_EFFECT_SHAPES]): Record<string, unknown> {
  return Object.fromEntries(
    fieldsOf(shape).map(([name, field]) => [name, SAMPLES[field.must].ok]),
  );
}

/** A row's fields as pairs. The rows are a union of `Record`s, which `Object.entries` widens. */
function fieldsOf(
  shape: (typeof STORED_EFFECT_SHAPES)[keyof typeof STORED_EFFECT_SHAPES],
): readonly (readonly [string, StoredEffectField])[] {
  return Object.entries(shape.fields as Readonly<Record<string, StoredEffectField>>);
}

const SHAPES = Object.entries(STORED_EFFECT_SHAPES);

describe('one description of what a stored effect may be', () => {
  it('describes every arm of the union and nothing else', () => {
    // The compiler settled this above; these keep the assertions from being deleted as unused and
    // say out loud that they are the point of the file.
    expect([everyArmIsDescribed, everyCarryingKindIsListed]).toEqual([true, true]);
    expect([modeIsADiscriminant, carIdIsNotADiscriminant]).toEqual([true, false]);
    // A floor rather than an equality: the assertion above is what holds the count to the union.
    expect(SHAPES.length).toBeGreaterThanOrEqual(3);
    expect(EFFECT_CARRYING_KINDS).toEqual(['answer-incident', 'equipment-change', 'building-change']);
  });

  it('accepts a well-formed effect of every shape it describes', () => {
    for (const [name, shape] of SHAPES) {
      expect(storedEffectIssue(wellFormed(shape)), `${name} must be admissible`).toBeNull();
    }
  });

  it('refuses an effect whose fields are missing or wrong — every field of every shape', () => {
    for (const [name, shape] of SHAPES) {
      for (const [field, rule] of fieldsOf(shape)) {
        const dropped: Record<string, unknown> = { ...wellFormed(shape) };
        delete dropped[field];
        /*
         * Dropping a shape's **discriminant** does not leave a shape with a hole in it; it leaves
         * a different question, and the description answers that one too — the effect now matches
         * no row. Both are refusals, which is what this asserts, and the sentence differs because
         * the two are different findings.
         */
        expect(storedEffectIssue(dropped), `${name} without ${field} must be refused`).not.toBeNull();
        expect(
          storedEffectIssue({ ...wellFormed(shape), [field]: SAMPLES[rule.must].bad }),
          `${name} with a bad ${field} must be refused`,
        ).not.toBeNull();
      }
    }
  });

  it('refuses what is not an effect at all, and an effect that is two shapes at once', () => {
    for (const value of [null, undefined, 'out-of-service', 42, [], [{ atS: 1 }]]) {
      expect(storedEffectIssue(value), `${JSON.stringify(value) ?? 'undefined'} is not an effect`)
        .not.toBeNull();
    }
    // No discriminant: a car and a second and nothing that says what changed.
    const shapeless = { atS: 200, bankId: 'main', carId: 'B' };
    expect(storedEffectIssue(shapeless)?.kind).toBe('shape');
    // Two discriminants: `config/serviceEvent.ts` says no shape carries two of the three, so this
    // is not an arm of the union and picking one would be the reader deciding what was meant.
    const doubled = { ...wellFormed(STORED_EFFECT_SHAPES.mode), ...wellFormed(STORED_EFFECT_SHAPES.range) };
    expect(storedEffectIssue(doubled)?.kind).toBe('shape');
  });

  it('tells a vocabulary miss from a damaged one, because the two sentences differ', () => {
    const mode = { ...wellFormed(STORED_EFFECT_SHAPES.mode), mode: 'toast' };
    expect(storedEffectIssue(mode)).toEqual({ kind: 'vocabulary', noun: 'service mode', value: 'toast' });
    const bank = { ...wellFormed(STORED_EFFECT_SHAPES.mode), bankId: 42 };
    expect(storedEffectIssue(bank)?.kind).toBe('shape');
  });
});
