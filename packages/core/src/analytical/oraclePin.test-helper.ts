/**
 * **The oracle is pinned to conventional up/down buttons, and this is the pin.**
 *
 * `CLAUDE.md` § Correctness oracle says: *"Under pure up-peak, simulated interval and handling
 * capacity must match the closed-form Barney/CIBSE round-trip-time calculation within a few
 * percent. If simulation and closed form diverge, assume the simulation is wrong until proven
 * otherwise."*
 *
 * **This is the one place in the repository where that instinct gives the wrong answer, and it has
 * to be written down where somebody under pressure will read it.** The closed form's expected
 * number of stops is
 *
 * ```
 * S = N · (1 − (1 − 1/N)^P)
 * ```
 *
 * — the expected number of *distinct* floors chosen when each of the `P` passengers picks a
 * destination **independently and uniformly**. Destination dispatch exists precisely to violate
 * that assumption: it groups passengers with common destinations into one car and drives `S`
 * down, which shortens the round trip and raises handling capacity. A destination-dispatch arm
 * that agreed with the closed form would mean the grouping did nothing.
 *
 * So a divergence between a destination arm and `analytical/roundTripTime.ts` is **the effect, not
 * a defect**, and a Phase 6 work item that "fixed" the oracle to agree with a destination
 * dispatcher would have destroyed the project's only external correctness anchor while looking
 * like an improvement. The remedy is not a wider band or a caveat in a document — it is a refusal:
 * the oracle runs against `up-down-buttons` and nothing else, and says so when handed anything
 * else.
 *
 * Kept as a test helper rather than as a runtime export because it has no non-test caller and
 * should not pretend to: its two callers are `analytical/validation.test.ts` and
 * `sim/oracle.test.ts`, which are the two places the closed form is compared to a run. A guard
 * exported from `src/` whose only callers are its own tests is the shape of defect this repository
 * has shipped eight times.
 */

import type { DispatcherProfile } from '../config/types.js';

/**
 * Refuse a profile the Barney/CIBSE closed form is not a statement about.
 *
 * Refuses on **either** half of destination dispatch, and the two are refused for different
 * reasons:
 *
 * - a destination `callType` lets the dispatcher price the journey, so which car a passenger ends
 *   up in stops being independent of where they are going, and `S` stops being `N(1−(1−1/N)^P)`;
 * - `passengerAssignment: 'panel'` changes the passenger model outright — the landing is one
 *   request per origin-destination pair, the queue is partitioned by promised car, and the
 *   departure gap the oracle measures the interval from is no longer a round-robin one.
 *
 * @throws Error naming the profile, the field and the reason.
 */
export function assertOracleProfile(profile: DispatcherProfile): DispatcherProfile {
  const callType = profile.dispatch?.callType ?? 'up-down-buttons';
  const assignment = profile.dispatch?.passengerAssignment ?? 'none';
  if (callType !== 'up-down-buttons' || assignment !== 'none') {
    throw new Error(
      `The Barney/CIBSE closed form is pinned to conventional dispatch and profile "${profile.id}" is not conventional ` +
        `(dispatch.callType: "${callType}", dispatch.passengerAssignment: "${assignment}"). ` +
        'The closed form assumes S = N(1 - (1 - 1/N)^P), i.e. that every passenger picks a destination independently and ' +
        'uniformly. Destination dispatch exists to violate that assumption — it groups common destinations into one car ' +
        'and drives S down — so a destination arm SHOULD disagree with the closed form, and that disagreement is the ' +
        'effect being measured. Do NOT relax the oracle to accommodate it: this is the one place where CLAUDE.md\'s ' +
        '"assume the simulation is wrong until proven otherwise" gives the wrong answer, and the oracle is the only ' +
        'external correctness anchor this project has.',
    );
  }
  return profile;
}
