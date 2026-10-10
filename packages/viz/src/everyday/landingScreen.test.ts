/**
 * **The landing block's morning repeats, and only its window does.**
 *
 * `landingScreen.ts#playInto` sets a loop over thirty seconds to five minutes of the morning and
 * paints every frame from {@link landingLoopOf}. It used to paint from `Playback.simTimeS`, which
 * clamps at the recording's end and never wraps (the wrap lives in `Playback.frame`), so the block
 * played from thirty seconds through the drain and then sat on the last frame for ever: the still
 * frame the module's header says the block exists to avoid. Wave AN lane AP-3 found it while
 * building `towerLoop.ts`, which hit the same trap.
 *
 * The recording is the page's own: {@link landingConfigOf} on Midtown, simulated through
 * `recordRun` as `dev/shiftWorker.ts` does for the page, so the window and the drain behind it are
 * the ones a visitor would see rather than a stand-in shaped to make the case pass.
 * `landingScreen.browser.test.ts` asks the browser half, that the canvas moves; it samples for
 * twenty seconds, which is less than one pass through the window, so it could not see this.
 */

import { describe, expect, it } from 'vitest';

import { ManualClock } from '../playback/clock.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES } from '../scope/probes.test-helper.js';

import { LANDING_RUN, landingConfigOf, landingLoopOf } from './landingScreen.js';

function landingMorning() {
  const building = RESOURCES.buildings.find((one) => one.id === LANDING_RUN.buildingId);
  if (building === undefined) throw new Error(`the test resources carry no ${LANDING_RUN.buildingId}`);
  return recordRun(landingConfigOf(RESOURCES, building), {
    recordDecisions: false,
    outOfServiceCarIds: [],
  }).recording;
}

describe('the landing block’s loop', () => {
  it('wraps the playhead back to loopFromS at the window’s end, rather than running into the drain and stopping', () => {
    const played = landingMorning();
    const fromS = LANDING_RUN.loopFromS;
    const toS = Math.min(LANDING_RUN.durationS, played.endedAt);
    /* The premise: there is a drain past the window, so a transport that ignored it would show it. */
    expect(played.endedAt, 'the morning drains past its demand horizon').toBeGreaterThan(toS);

    const clock = new ManualClock(0);
    const loop = landingLoopOf(played, clock);
    expect(loop.frame().simTimeS).toBe(fromS);

    /* Three passes through the window, in 50 ms frames, as a browser's animation frames would ask. */
    const stepMs = 50;
    const cycleMs = ((toS - fromS) / LANDING_RUN.speedSimPerRealS) * 1000;
    const shown: number[] = [];
    let wraps = 0;
    let last: number = fromS;
    for (let ms = 0; ms < 3 * cycleMs; ms += stepMs) {
      clock.advance(stepMs);
      const now = loop.frame().simTimeS;
      shown.push(now);
      if (now < last) {
        wraps += 1;
        expect(now, 'a wrap lands on the window’s start').toBe(fromS);
      }
      last = now;
    }
    loop.stop();

    expect(Math.max(...shown), 'the playhead never leaves the window for the drain').toBeLessThanOrEqual(toS);
    expect(Math.min(...shown), 'nor goes back before it, into the empty lobby').toBeGreaterThanOrEqual(fromS);
    expect(wraps, 'three passes through the window wrap at least twice').toBeGreaterThanOrEqual(2);
    /* And it is not sitting on one frame: the last pass is still moving. */
    expect(new Set(shown.slice(-20)).size, 'the final second of picture moves').toBeGreaterThan(1);
  });
});
