/**
 * **The budget the campaign panel's fail-state replay is bounded by** — GitHub issue #410.
 *
 * `dev/campaignPanel.ts#failStates` runs one replication again with `recordRun`, **on the thread
 * that paints**, so that the four fail states can be diagnosed against real legs: the counts come
 * from the fifty the batch produced on `dev/batchWorker.ts`, and the floor id and the credential
 * come from replication 0 replayed here. It is one of the surfaces this repository's module graph
 * finds simulating on the main thread, and `dev/mainThreadSimulation.test.ts` is the derivation
 * that finds it.
 *
 * ## Bounded rather than moved, and the measurement is why
 *
 * `dev/measure.surfaceRuns.test.ts` ran every shipped stage. On this container, node v26.5.0:
 * **3 ms to 68 ms**, median 15 ms, over legs **19 to 417**. The worst shipped stage is a sixth of
 * `dev/mainThreadFrames.test-helper.ts#BLOCKED_FRAME_GAP_MS`, the browser tier's own measured
 * threshold for *the page has stopped painting* — and the transport a worker would add is 1.3 ms to
 * 9.9 ms of `structuredClone` on top of a worker spawn. Moving a 15 ms run behind a message port
 * makes it slower in wall clock and adds an asynchronous state machine to a panel that is already
 * holding one for the batch. So this surface stays, and carries a budget instead.
 *
 * That is the choice #410 offers — *"moved to a worker or bounded by a budget they meet"* — taken
 * in the direction the numbers point, rather than taken for both surfaces alike.
 *
 * ## The budget is in legs, and it is derived rather than picked
 *
 * A budget in milliseconds cannot be enforced in this suite. `vitest.config.ts#SIMULATING_TIMEOUT_MS`
 * measured this repository amplifying wall clock about ninefold under load, and #410 names the
 * problem: *"a wall-clock budget on a shared runner measures the runner (#335)"*. A gate that goes
 * red because another worktree was compiling teaches people to raise the number.
 *
 * So {@link LEG_BUDGET} is a leg count — the same integer on every machine — **converted once**
 * from the threshold that does have a meaning. The same measurement that produced the range above
 * produced this surface's rate: `ms-per-1000-legs = 174.21` across the ten shipped stages. At that
 * rate `BLOCKED_FRAME_GAP_MS`'s 400 ms is **2 296 legs**, and 2 000 is the round figure under it.
 * The conversion is a one-time calibration on a named machine, which is exactly what #335 asks for
 * and what a per-run stopwatch is not: load moves the milliseconds and cannot move the legs.
 *
 * **What the budget does and does not catch, said rather than implied.** It catches the change that
 * would actually hurt — a stage authored at a longer `durationS`, a heavier tower, or a higher
 * arrival rate — because all three arrive as legs. It does not catch `recordRun` itself getting
 * slower per leg; nothing written in legs could. That is `dev/measure.surfaceRuns.test.ts`'s job and
 * it is gated, so it is a thing somebody runs rather than a thing that runs itself, which is stated
 * here rather than left for a reader to discover the hard way.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md): the budget is over one panel's replay and the
 * campaign file it reads, and binds nothing outside them, so this docstring is the record the
 * working agreement asks for.
 */

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';

import { useCampaignFixture } from './campaign.test-helper.js';
import { demonstrationConfigFor } from './stageRun.js';

/**
 * The most legs one fail-state replay may simulate.
 *
 * 2 000, derived in the header: `BLOCKED_FRAME_GAP_MS` (400 ms) at this surface's own measured
 * 174.21 ms per thousand legs is 2 296, and this is the round figure below it. The measured worst
 * shipped stage is **417**, so the gate sits about five times above the population it bounds — far
 * enough that authoring an ordinary new stage does not trip it, close enough that a stage at a
 * tower and a length this panel cannot afford does.
 */
const LEG_BUDGET = 2000;

/**
 * The dispatcher the replay is measured under.
 *
 * `dev/campaignPanel.ts` replays the **resolved candidate** — an edited weight vector, whatever the
 * player is currently proposing — so no single profile is *the* one this surface runs. `collective`
 * is a shipped profile of the middle sort, and the quantity being bounded is how much traffic the
 * stage generates rather than how well a dispatcher answers it: a weight vector changes which car
 * goes, not how many people arrive. Stated because a reader could otherwise take this constant for
 * a claim about the panel's default, which it is not.
 */
const DISPATCHER_ID = 'collective';

describe('the campaign panel’s fail-state replay stays inside its budget', () => {
  const fixture = useCampaignFixture();

  it('every shipped stage is under the leg budget', () => {
    const { campaign, config } = fixture;
    const dispatcherProfile = config.dispatcherProfilesById.get(DISPATCHER_ID);
    expect(dispatcherProfile, `this build ships no “${DISPATCHER_ID}” profile`).toBeDefined();
    if (dispatcherProfile === undefined) return;

    /*
     * The floor, and it is the assertion that keeps the rest honest: a `≤` gate over an empty stage
     * list passes at nothing, so a campaign file that failed to parse would turn this green while
     * bounding no surface at all. `dev/measure.surfaceRuns.test.ts` states the same rule.
     */
    expect(campaign.stages.length).toBeGreaterThan(0);

    for (const stage of campaign.stages) {
      const building = config.buildingsById.get(stage.building);
      expect(building, `${stage.id} names a building this build does not ship`).toBeDefined();
      if (building === undefined) continue;

      const { recording } = recordRun(
        demonstrationConfigFor({
          stage,
          building,
          dispatcherProfile,
          trafficProfiles: config.trafficProfiles,
          elevatorSpecs: config.elevatorSpecs,
          dispatcherProfiles: config.dispatcherProfiles,
        }),
      );

      expect(
        recording.legs.length,
        `${stage.id} replays ${String(recording.legs.length)} legs, over the ` +
          `${String(LEG_BUDGET)}-leg budget this panel simulates on the painting thread — ` +
          'either the stage is too heavy for a synchronous replay, or the replay belongs on a ' +
          'worker like the batch beside it',
      ).toBeLessThanOrEqual(LEG_BUDGET);
    }
  });

  /**
   * The negative control — without it the case above is consistent with a budget that cannot fail.
   *
   * A stage at the heaviest shipped tower and eight times the length is the change the budget
   * exists to refuse, and it is asserted to **exceed** the budget rather than merely to differ: a
   * control that came out under it would mean the gate admits the thing it is written against.
   */
  it('a stage heavy enough to freeze the panel would fail this budget', () => {
    const { campaign, config } = fixture;
    const stage = campaign.stages[0];
    const dispatcherProfile = config.dispatcherProfilesById.get(DISPATCHER_ID);
    const building = config.buildingsById.get('vertical-city');
    if (stage === undefined || dispatcherProfile === undefined || building === undefined) {
      throw new Error('the control needs a stage, a profile and vertical-city');
    }

    const { recording } = recordRun(
      demonstrationConfigFor({
        stage: { ...stage, building: 'vertical-city', durationS: 7200 },
        building,
        dispatcherProfile,
        trafficProfiles: config.trafficProfiles,
        elevatorSpecs: config.elevatorSpecs,
        dispatcherProfiles: config.dispatcherProfiles,
      }),
    );
    expect(recording.legs.length).toBeGreaterThan(LEG_BUDGET);
  });
});
