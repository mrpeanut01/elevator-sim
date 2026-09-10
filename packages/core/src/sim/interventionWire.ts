/**
 * **Which intervention kinds a submission can carry, and the one shape they travel in** — GitHub
 * issues **#370** and **#371**, S5 (`docs/16` § 4), [§ D486](../../../../DECISIONS.md).
 *
 * ## Why this is in `core` and not in the two packages that use it
 *
 * It reads like a leaderboard concern and it is not one. The question is *can this kind be replayed
 * from a submission's ids alone?*, and the answer is decided entirely by **what the kind's arm of
 * `InterventionChange` carries** — a fact about the vocabulary in `sim/types.ts`, which this package
 * owns. `park-cars-lobby` carries nothing but its instant, so it replays from its instant.
 * `answer-incident` carries the *answer* and not the incident, so it cannot. Both of those are
 * sentences about the union, not about a wire format.
 *
 * Before this module the answer was written down **six** times: two string arrays
 * (`packages/viz/src/scope/runIdentity.ts#CARRIED_INTERVENTION_KINDS` and
 * `packages/server/src/leaderboard/submission.ts#SUBMITTABLE_INTERVENTION_KINDS`) and four
 * TypeScript unions spelling the same three arms (`submission.ts#SubmittedIntervention`,
 * `viz/menu/client.ts#SubmittedIntervention`, `viz/scope/switchWire.ts#WireIntervention`,
 * `viz/watch/posted.ts#WireIntervention`). The two arrays had a drift test between them; the four
 * unions had **none**, so widening the vocabulary meant editing six places and only one of the
 * edits was checked. `packages/viz` may not import `packages/server` (§ D215 § 3), so the only
 * place the two ends can share one derivation is the package they both already depend on. This is
 * that place.
 *
 * ## The table is the source and everything else is derived from it
 *
 * {@link INTERVENTION_WIRE} answers for **every** declared kind, which is what makes it a
 * derivation rather than a seventh list: a kind added to `INTERVENTION_KINDS` with no row here is a
 * **compile error** on the `Record<InterventionKind, …>`, so a new kind cannot arrive in an
 * undefined state on the board — which is exactly what #371 was filed about. The kinds that travel
 * fall out as {@link CARRIED_INTERVENTION_KINDS}; the reason a kind does not travel is on its own
 * row, so a refusal names *that kind's* ground instead of borrowing the incident answer's, which is
 * what the client did for every refused kind until #370 gave it two more to be wrong about.
 *
 * {@link WireIntervention} is the one union, and the two type-level assertions at the foot of this
 * file tie it to the table in **both** directions: an arm with no carried row, or a carried row with
 * no arm, will not compile. That is the property the four hand-written unions never had.
 *
 * ## `Row` is a parameter because the two ends check rows at different moments
 *
 * The server and `scope/switchWire.ts` hold rows that `core` has already typed
 * (`RuleRowConfig`); `menu/client.ts` and `watch/posted.ts` hold rows that arrived as JSON and are
 * *strings until they are checked*, which is a real distinction those modules make deliberately and
 * this one must not flatten. So the row type is a parameter with the strict shape as its default,
 * and each consumer instantiates it with the shape it actually holds.
 *
 * The decision this module took is recorded in this docstring and cites
 * [§ D405](../../../../DECISIONS.md): it moves no bound and binds nothing that was not already
 * bound by `INTERVENTION_KINDS` and § D486, so no `DECISIONS.md` number is owed for it.
 */

import type { RuleRowConfig } from '../config/types.js';

import { INTERVENTION_KINDS, type InterventionKind } from './types.js';

/**
 * One kind's answer: it travels, or it does not and here is why.
 *
 * A discriminated union rather than a boolean plus an optional string, so a row that refuses
 * without a reason cannot be written. Every refusal in this table is read by a player.
 */
export type InterventionWireRule =
  | { readonly carried: true }
  | {
      readonly carried: false;
      /**
       * Why this kind cannot travel, in the player's register — the sentence
       * `scope/runIdentity.ts` puts in front of them and the sentence
       * `packages/server`'s submission gate answers with. A **cause** that is missing, never a
       * field: every one of these would replay something other than the day that was played.
       */
      readonly refusal: string;
    };

/**
 * The answer for every declared kind.
 *
 * `Record<InterventionKind, …>` and not a partial one: the exhaustiveness is the whole point, and
 * it is why a seventh place to edit cannot appear by accident.
 *
 * **`as const satisfies` rather than an annotation**, and the difference is load-bearing rather
 * than stylistic. An annotation widens every `carried` to `boolean`, which makes
 * {@link CarriedInterventionKind} resolve to `never` and the two assertions at the foot of this
 * file vacuously true — a check that cannot fail, which is worse than no check. `satisfies` keeps
 * the exhaustiveness the annotation was there for (a missing kind is still an error) and keeps the
 * literal types the derivation needs. This was caught by the assertion going red on the first
 * compile, which is the assertion doing its job before the feature it guards had shipped.
 */
export const INTERVENTION_WIRE = Object.freeze({
    'park-cars-lobby': { carried: true },
    'spread-cars': { carried: true },
    'switch-dispatcher': { carried: true },
    'answer-incident': {
      carried: false,
      /*
       * The word *permanent* is load-bearing and is here rather than in either gate's own sentence,
       * which is where it used to be. § D486 ruled this one refusal permanent; the two below are
       * not ruled permanent and their route out is named, so a gate that appended *"and that
       * refusal is permanent"* to every refused kind — which is what appending it to the shared
       * message did — would be over-claiming about two of the three. Each row says its own status.
       */
      refusal:
        'an incident answer names service events for an incident no selection or submission ' +
        'carries, so a replay would hold the answer and not the thing answered — and that refusal ' +
        'is permanent by design (§ D486), because a replay that verified the answer alone would ' +
        'verify a different day as this one',
    },
    /*
     * **Both new kinds are refused, and it is the same missing cause one substrate over** (#370).
     * A bought change names service events decided by a *price schedule and a scenario budget*, and
     * neither travels: no field of a submission carries the budget the purchase was made against.
     * A replay from ids alone would therefore hold the change and not the entitlement to it — the
     * server would verify a rezoned tower as honest without ever being able to ask whether the
     * player could afford to rezone it, which is § D481's cheat lever exactly: a player who posts a
     * building change posts their own building. Refusing is the same trade the incident answer
     * makes, and refusing *by name* is what stops the two grounds being confused for each other.
     *
     * The route out is named and not recommended, on § D486's precedent: the budget and the
     * schedule would have to be derivable server-side from causes that travel — a scenario id and a
     * rung — before either of these could be admitted, and that is a decision about scoring rather
     * than a missing field.
     */
    'equipment-change': {
      carried: false,
      refusal:
        'an equipment change was bought against a scenario budget, and no submission carries a ' +
        'budget — so a replay would hold the change and not the entitlement to it, and the board ' +
        'would rank a tower nobody could check the player could afford',
    },
    'building-change': {
      carried: false,
      refusal:
        'a building change was bought against a scenario budget, and no submission carries a ' +
        'budget — so a replay would hold the change and not the entitlement to it, and the board ' +
        'would rank a tower nobody could check the player could afford',
    },
  } as const) satisfies Readonly<Record<InterventionKind, InterventionWireRule>>;

/**
 * The kinds a submission may carry, derived — an **allow-list**, on `INTERVENTION_KINDS`' own
 * precedent: a kind added tomorrow is refused until somebody writes `carried: true` beside it,
 * where a deny-list would let it through silently and the first symptom would be an honest player
 * accused of a forgery.
 *
 * Iteration order is `INTERVENTION_KINDS`' own, so the set is stable across builds and a refusal
 * that lists it reads the same twice.
 */
export const CARRIED_INTERVENTION_KINDS: readonly InterventionKind[] = Object.freeze(
  INTERVENTION_KINDS.filter((kind) => INTERVENTION_WIRE[kind].carried),
);

/*
 * `interventionKindTravels(kind)` was written here and is **deleted**: both gates need the *set*
 * rather than the predicate — they print it in their refusals — so `CARRIED_INTERVENTION_KINDS`
 * is what they call and a one-line wrapper over `.includes` had no caller. `deadCode.test.ts`
 * found it on the first run, which is `pricing/repairPrice.ts`'s `repairNights` again: the fix for
 * a helper nobody calls is to delete it, not to register it.
 */

/**
 * Why a kind does not travel, or `undefined` for one that does.
 *
 * The refusal the client shows before a player posts and the refusal the server answers with are
 * this one string. They were two strings, and one of them was used for **every** refused kind,
 * which was correct while `answer-incident` was the only one.
 */
export function interventionKindRefusal(kind: InterventionKind): string | undefined {
  const rule = INTERVENTION_WIRE[kind];
  return rule.carried ? undefined : rule.refusal;
}

/** The kinds that travel, as a type. Derived from the table by the same mapped type the checks use. */
export type CarriedInterventionKind = {
  [K in InterventionKind]: (typeof INTERVENTION_WIRE)[K]['carried'] extends true ? K : never;
}[InterventionKind];

/**
 * The `switch-dispatcher` arm as the wire carries it — **an id and rows, never a profile**
 * (§ D486). `packages/viz/src/scope/switchWire.ts` is the translation on the client end and
 * `packages/server`'s `verify.ts#profileWithRules` the re-derivation on the other.
 */
export interface SwitchOnTheWire<Row = RuleRowConfig> {
  readonly toProfileId: string;
  readonly ruleRows?: readonly Row[] | undefined;
}

/**
 * What a carried intervention's `change` looks like on the wire — one arm per carried kind, and the
 * assertions below hold it to exactly that.
 */
export type WireInterventionChange<Row = RuleRowConfig> =
  | { readonly kind: 'park-cars-lobby' }
  | { readonly kind: 'spread-cars' }
  | ({ readonly kind: 'switch-dispatcher' } & SwitchOnTheWire<Row>);

/** One entry of the log as the wire carries it — `{ atS, change }`, contract § 1.4's own shape. */
export interface WireIntervention<Row = RuleRowConfig> {
  readonly atS: number;
  readonly change: WireInterventionChange<Row>;
}

/* -------------------------------------------------------------------------- *
 * The two directions, checked by the compiler
 * -------------------------------------------------------------------------- */

/*
 * The assertions that hold {@link WireInterventionChange} to {@link INTERVENTION_WIRE} in **both**
 * directions live in `interventionWire.test.ts`, not here, and the move was forced by
 * `dispatch/deadCode.test.ts`: an assertion needs a value to hang on, and a value nothing imports
 * is a dead export whatever it is for. In the test file it hangs on nothing that has to be
 * exported, and it is still enforced by `tsc -b` — the test files are inside the project's
 * `include`, so `npm run typecheck` compiles them and a mismatch is a build error rather than a
 * failing case. Which is the right place for it anyway: it is a claim about types, and the only
 * thing that can check a claim about types is the compiler.
 */
