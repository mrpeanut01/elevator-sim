/**
 * **Move the control and require the run to change — and its inverse.** S2 and S3.
 *
 * § D177 wrote the first half and this repository has paid for it: three inert controls and one
 * false claim about a mechanism, found *before a single editor was mounted*. `docs/12` § 5 clause 9
 * states it as a definition-of-done item — *"no control is inert"* — and until this file it was
 * checked per editor, over the controls somebody remembered, rather than over the writable surface
 * derived from the state.
 *
 * The second half is new and is the one with a leaderboard behind it. `menu/types.ts` promises that
 * a `Settings` field cannot change what a run computes, *because* two players' scores would
 * otherwise be incomparable while both looked valid and the board verifies by replaying a seed. That
 * promise has never had a way to be false. Here it does: a `presentation` control whose two arms
 * produce different legs fails.
 *
 * Both halves compare **legs**, never a window statistic. § D177's own reason: a mean can be
 * unchanged for a run that is entirely different, and a mean can move because the window moved.
 */

import { describe, expect, it } from 'vitest';

import { baseState, legsOf, PROBES, SINK_IS_A_MOUNT, SINK_MISSING } from './probes.test-helper.js';
import { SCOPE_OF } from './surface.js';
import type { ControlEntry, SurfaceKey } from './types.js';

function controls(): readonly (readonly [SurfaceKey, ControlEntry])[] {
  return (Object.entries(SCOPE_OF) as [SurfaceKey, (typeof SCOPE_OF)[SurfaceKey]][])
    .flatMap(([key, entry]) => (entry.kind === 'control' ? [[key, entry] as const] : []))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

describe('a control that is not presentation reaches the run', () => {
  for (const [key, entry] of controls()) {
    if (entry.scope === 'presentation') continue;
    it(`${key} moves the legs`, () => {
      const probe = PROBES[key];
      expect(probe?.states, `${key} has no states probe`).toBeDefined();
      const [a, b] = probe?.states ?? [];
      if (a === undefined || b === undefined) throw new Error(`${key}: no states probe`);
      const base = baseState();
      expect(
        legsOf(a(base)),
        `${key} is declared ${entry.scope} and changes no leg — an inert control (docs/12 § 5 clause 9)`,
      ).not.toBe(legsOf(b(base)));
    });
  }
});

describe('a presentation control cannot reach the run', () => {
  for (const [key, entry] of controls()) {
    if (entry.scope !== 'presentation') continue;
    const probe = PROBES[key];
    if (probe?.states === undefined) continue;
    it(`${key} leaves the legs byte-identical`, () => {
      const [a, b] = probe.states ?? [];
      if (a === undefined || b === undefined) throw new Error(`${key}: no states probe`);
      const base = baseState();
      expect(
        legsOf(a(base)),
        `${key} is declared presentation and moved a leg — two players' scores would differ while ` +
          'both looked valid, and the leaderboard verifies by replaying a seed',
      ).toBe(legsOf(b(base)));
    });
  }
});

describe('a presentation control reaches a sink, or the register says why not', () => {
  for (const [key, entry] of controls()) {
    if (entry.scope !== 'presentation') continue;
    it(`${key} is accounted for`, () => {
      const probe = PROBES[key];
      const registered = key in SINK_IS_A_MOUNT || key in SINK_MISSING;
      if (probe?.sink === undefined) {
        // Identical legs alone cannot tell *cannot change a run* from *does nothing at all*. An
        // unregistered presentation control with no sink is the second, unnoticed.
        expect(
          registered,
          `${key} has no sink and is in neither register — it may be a control that does nothing`,
        ).toBe(true);
        return;
      }
      const [a, b] = probe.sink;
      expect(JSON.stringify(a()), `${key}'s declared sink does not move`).not.toBe(JSON.stringify(b()));
    });
  }
});

describe('the missing-sink register is a finding and not an exemption', () => {
  it('holds only entries that really do reach nothing', () => {
    // Staleness, in `deadCode.test.ts`'s idiom: an entry must leave this register because the code
    // moved. A registered control that has since acquired a sink would otherwise sit here forever,
    // reading as a known defect while being fixed.
    for (const key of Object.keys(SINK_MISSING) as SurfaceKey[]) {
      expect(
        PROBES[key]?.sink,
        `${key} is registered as reaching nothing but now declares a sink — remove it from SINK_MISSING`,
      ).toBeUndefined();
    }
  });

  it('is the four settings, and says so out loud', () => {
    // Pinned rather than merely non-empty, so closing three of the four cannot leave the register
    // looking healthy. § D216 § 3: this is the row worth the most, because it is already promised in
    // prose and the prose is currently protecting a claim with no way to be true or false.
    expect(Object.keys(SINK_MISSING).sort()).toEqual([
      'settings.playbackSpeed',
      'settings.reduceMotion',
      'settings.showEnergyAxis',
      'settings.theme',
    ]);
  });
});
