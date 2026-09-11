/**
 * `dutyMismatch` — a car sent for a trip it is not for. GitHub issue #481, `DECISIONS.md` § D549.
 *
 * **The project owner's ruling of 2026-09-10 is the whole contract**: duty binds dispatch through a
 * cost term, and a mismatch between a rider's duty and a car's costs a weighted penalty declared in
 * data, so a profile can express anything from a preference to near-exclusive use. So this term is an
 * indicator — `1` for a mismatch, `0` otherwise — bounded at `1`, and the *price* is entirely the
 * weight a profile gives it in `data/dispatcher-profiles.json`. A new cost term is new code, which is
 * `CLAUDE.md` invariant 7's one exception; how much a mismatch matters is not decided here.
 *
 * **What it reads, and why that is all.** The rider's duty arrives on the request
 * (`CostRequest.duty`), put there by `costRequestFor` from the landing call, which carries the duty
 * of the person who pressed it — the head of the queue, in `Simulation#callValue`, exactly as the
 * credential does. The car's duty arrives on the snapshot (`CarSnapshot.duty`), straight off
 * `CarConfig.duty`. A car that declares none is a passenger car (`DEFAULT_CAR_DUTY`), and a call that
 * carries none prices nothing — which is every call in a building where no car declares a duty, so
 * such a building scores every car exactly as it did before this term existed.
 *
 * **Why no `activeWhen`.** A gate names a dispatcher parameter under which the term cannot change a
 * decision, and none exists: the duty is disclosed under every call type, because a goods or bed trip
 * is summoned on the landing's own duty control rather than read off a destination panel. What does
 * make it inert is a *building* that declares no duty, which no dispatcher parameter can express — so
 * `sim/searchSpaceLiveness.test.ts` carries `weights.dutyMismatch` in `DECLARED_INERT` under that
 * condition, and executes it.
 *
 * **What it is not.** Not a filter: `servesFloors` (service zoning) and `accessZones` (access zoning)
 * decide which cars *may* take a call, in `estimateCost`'s feasibility check, while a duty only says
 * what it costs to send one that is not for the trip — so a mismatched car is still sent when it is
 * the only one, which is what *near-exclusive* rather than *exclusive* means. And not operational
 * zoning, which `zoneAffinity` prices from the group controller's own partition of the moment: a duty
 * is a property of the shaft as built, and it does not move during a run.
 *
 * Pure: it reads two frozen values and writes nothing (`CLAUDE.md` invariant 1).
 */
import { DEFAULT_CAR_DUTY } from '../../config/types.js';
import type { CostTermDefinition, TermContext } from '../types.js';

/** `1` when the call carries a duty the car is not for, `0` otherwise. */
export function dutyMismatchOf(context: TermContext): number {
  const riderDuty = context.request.duty;
  if (riderDuty === undefined) return 0;
  return (context.car.duty ?? DEFAULT_CAR_DUTY) === riderDuty ? 0 : 1;
}

export const dutyMismatchTerm: CostTermDefinition = Object.freeze({
  id: 'dutyMismatch',
  // Dimensionless, as every other bounded count in the library is: 0 or 1, and nothing between.
  unit: '',
  measures: "Mismatch between the rider's duty and the car's",
  // Everyday Mode's words for this term — engine contract §6.3, issue #147 — addressed to a player,
  // while `measures` stays addressed to an optimizer.
  player: Object.freeze({
    name: 'duty match',
    serves: 'goods and bed lifts kept for their own trips',
    atZero: 'send any car for any trip',
    atFull: 'keep each car to its own duty',
  } as const),
  normalization: Object.freeze({ mode: 'bounded', fullScale: 1 } as const),
  evaluate: dutyMismatchOf,
});
