/**
 * The wire's one derivation — GitHub issues **#370** and **#371**, S5 (`docs/16` § 4).
 *
 * The set of intervention kinds a submission may carry was written down **six** times: two string
 * arrays with a drift test between them, and four TypeScript unions with nothing over them at all.
 * `sim/interventionWire.ts` is now the one declaration, and this file holds the two checks that
 * make it one rather than a seventh: the table answers for **every** declared kind, and the union
 * carries **exactly** the kinds the table admits.
 *
 * The second of those is enforced by the compiler and not by a case here. `tsc -b` compiles this
 * file, so the two type aliases below are checked by `npm run typecheck` and a mismatch is a build
 * error. That is deliberate — it is a claim about types, and only the compiler can settle one — and
 * they live in a test file rather than beside the table because an assertion needs a value to hang
 * on, and a value nothing imports is a dead export (`dispatch/deadCode.test.ts` said so on the
 * first run).
 */

import { describe, expect, it } from 'vitest';

import {
  CARRIED_INTERVENTION_KINDS,
  INTERVENTION_WIRE,
  interventionKindRefusal,
  type CarriedInterventionKind,
  type WireInterventionChange,
} from './interventionWire.js';
import { INTERVENTION_KINDS } from './types.js';

/* -------------------------------------------------------------------------- *
 * Checked by `tsc`, not by a case
 * -------------------------------------------------------------------------- */

/**
 * Every carried kind has an arm. Widen `WireInterventionChange` the day a row turns `carried:
 * true`, or this stops compiling — which is the failure #371 asked for, arriving at `tsc` rather
 * than as a `throw` out of the submission assembler on a run the gate has just declared postable.
 */
type EveryCarriedKindHasAnArm =
  CarriedInterventionKind extends WireInterventionChange['kind'] ? true : never;

/**
 * And no arm exists for a kind the table refuses — the negative control, without which the check
 * above is satisfied by a union that carries everything.
 */
type NoArmForARefusedKind =
  WireInterventionChange['kind'] extends CarriedInterventionKind ? true : never;

/** Both directions, in one value. Either failing makes its side `never` and this a type error. */
const WIRE_MATCHES_THE_TABLE: EveryCarriedKindHasAnArm & NoArmForARefusedKind = true;

/* -------------------------------------------------------------------------- *
 * Checked by a case
 * -------------------------------------------------------------------------- */

describe('the wire table answers for every declared intervention kind', () => {
  it('holds a row per kind, so a new one cannot arrive undecided', () => {
    // `Record<InterventionKind, …>` makes a missing row a compile error, and this is the runtime
    // half of the same claim: the table's key set *is* the vocabulary, neither wider nor narrower.
    expect(Object.keys(INTERVENTION_WIRE).sort()).toEqual([...INTERVENTION_KINDS].sort());
  });

  it('carries some kinds and refuses others — an allow-list, not a formality', () => {
    // A table that admitted everything would satisfy the shape checks and would be the gate
    // removed; one that admitted nothing would make every board place unreachable. Both arms are
    // asserted so neither degenerate table passes.
    expect(CARRIED_INTERVENTION_KINDS.length).toBeGreaterThan(0);
    expect(CARRIED_INTERVENTION_KINDS.length).toBeLessThan(INTERVENTION_KINDS.length);
    expect(WIRE_MATCHES_THE_TABLE).toBe(true);
  });

  it('gives every refused kind its own reason, and none to a carried one', () => {
    /*
     * **The correction #370 forced.** Both gates used to answer with `answer-incident`'s sentence
     * whatever kind was refused — correct while it was the only one, and a false accusation the
     * moment there were three, because a player who bought a rezone would have been told their
     * record held an incident answer. So the reasons must be distinct as well as present: a table
     * that gave every refused kind the same words would pass a "has a reason" check and would be
     * exactly the defect back again.
     */
    const refused = INTERVENTION_KINDS.filter((kind) => !CARRIED_INTERVENTION_KINDS.includes(kind));
    expect(refused.length).toBeGreaterThan(1);
    const reasons = refused.map((kind) => interventionKindRefusal(kind) ?? '');
    for (const reason of reasons) expect(reason.length).toBeGreaterThan(40);
    expect(new Set(reasons).size).toBe(reasons.length);
    for (const kind of CARRIED_INTERVENTION_KINDS) {
      expect(interventionKindRefusal(kind)).toBeUndefined();
    }
  });

  it('names the missing cause for each of the three, in the register a player reads', () => {
    // Each refusal says what would be *replayed wrongly*, which is the ground § D486 settled on —
    // a missing cause, never a missing field — and none of them is an engine identifier.
    expect(interventionKindRefusal('answer-incident')).toContain(
      'the answer and not the thing answered',
    );
    for (const kind of ['equipment-change', 'building-change'] as const) {
      expect(interventionKindRefusal(kind)).toContain('budget');
      expect(interventionKindRefusal(kind)).toContain('entitlement');
      expect(interventionKindRefusal(kind)).not.toContain('serviceEvents');
    }
  });

  it('lists the carried kinds in the vocabulary’s own order, so a refusal reads the same twice', () => {
    const order = INTERVENTION_KINDS.filter((kind) => CARRIED_INTERVENTION_KINDS.includes(kind));
    expect([...CARRIED_INTERVENTION_KINDS]).toEqual([...order]);
  });
});
