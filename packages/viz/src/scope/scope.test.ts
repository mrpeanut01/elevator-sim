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

import {
  baseState,
  LATENT_PROBES,
  legsOf,
  PROBES,
  SINK_IS_A_MOUNT,
  SINK_MISSING,
} from './probes.test-helper.js';
import { SCOPE_OF } from './surface.js';
import type { ControlEntry, LatentEntry, SurfaceKey } from './types.js';

function controls(): readonly (readonly [SurfaceKey, ControlEntry])[] {
  return (Object.entries(SCOPE_OF) as [SurfaceKey, (typeof SCOPE_OF)[SurfaceKey]][])
    .flatMap(([key, entry]) => (entry.kind === 'control' ? [[key, entry] as const] : []))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function latents(): readonly (readonly [SurfaceKey, LatentEntry])[] {
  return (Object.entries(SCOPE_OF) as [SurfaceKey, (typeof SCOPE_OF)[SurfaceKey]][])
    .flatMap(([key, entry]) => (entry.kind === 'latent' ? [[key, entry] as const] : []))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * The `control` a latent row's `realisedBy` chain ends at, or `undefined` if it does not end at one.
 *
 * A latent row may be realised by another latent row — `viewer.dispatcherSpec` is realised by
 * `viewer.savedDispatchers`, which is itself realised by `viewer.dispatcherId` — so the question
 * *"does writing this ever reach a run?"* is about the end of the chain, not the next hop.
 * `surface.test.ts` already requires each hop to name a declared field; this requires the walk to
 * terminate, which is what a cycle or a chain ending at an `output` would break.
 */
function terminalControlOf(start: SurfaceKey): readonly [SurfaceKey, ControlEntry] | undefined {
  const seen = new Set<SurfaceKey>();
  let key = start;
  for (;;) {
    if (seen.has(key)) return undefined; // a cycle realises nothing
    seen.add(key);
    const entry = SCOPE_OF[key];
    if (entry === undefined) return undefined;
    if (entry.kind === 'control') return [key, entry];
    if (entry.kind !== 'latent') return undefined;
    key = entry.realisedBy;
  }
}

describe('a control that is not presentation reaches the run', () => {
  for (const [key, entry] of controls()) {
    if (entry.scope === 'presentation') continue;
    it(`${key} moves the legs`, () => {
      const probe = PROBES[key];
      /*
       * A control whose run is not `shiftRunConfigOf`'s brings its own pair — see `ScopeProbe.legs`.
       * The assertion is the same one either way: move the control, require the legs to differ.
       */
      if (probe?.legs !== undefined) {
        const [left, right] = probe.legs;
        expect(
          left(),
          `${key} is declared ${entry.scope} and changes no leg — an inert control (docs/12 § 5 clause 9)`,
        ).not.toBe(right());
        return;
      }
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

  it('is empty, because all four settings now reach something', () => {
    /*
     * `docs/16` § 5 clause 4, closed. It was four, then two, and is now none.
     *
     * Pinned as **empty** rather than deleted along with the register. The register is the mechanism
     * that makes the next inert control visible, and this assertion is what would notice a new entry
     * arriving quietly — an empty list that nothing checks is how a list stops being read.
     */
    expect(Object.keys(SINK_MISSING)).toEqual([]);
  });
});

/**
 * **The inverse, for the rows nothing had ever driven.**
 *
 * Every `describe` above iterates `controls()`. Until this block, **no `latent` row had been driven
 * at either end** — the eight rows whose entire claim is *"moving this changes no leg"* were taken
 * on the declaration's word, while `scope/commitment.ts#commitmentOf` reads the same table and three
 * shipped surfaces derive their words from it. A latent row that had quietly become live would be a
 * **refusal drawn over a working control**, which [§ D227](../../../../DECISIONS.md) rates as worse
 * than a missing sentence.
 *
 * ## Two mutations, and the obvious one does not validate this block
 *
 * It was written against a table that already passes — GitHub issue #296 measured
 * `viewer.dispatcherSpec` and found the declaration true — so a green run here proves nothing on its
 * own. Both mutations below were run; the difference between them is the point.
 *
 * **Reclassifying the row does not do it.** Inverting `viewer.dispatcherSpec` to
 * `control('within-day')` in `surface.ts` reddens eight cases, including both coverage assertions in
 * `surface.test.ts` — but **not this block**, because `latents()` then skips the row entirely. The
 * mutation removes the case from the run rather than breaking its assertion, which is the shape that
 * makes a passing mutation test worthless.
 *
 * **Wiring the draft into the run does.** Pointing `drivingProfileOf` at `state.dispatcherSpec` —
 * literally the fix issue #296 rejected — turns `viewer.dispatcherSpec leaves the legs
 * byte-identical` red, and it is the only mutation of the two that exercises what this block claims.
 *
 * It took two attempts to get there, and the first failure is recorded in `LATENT_PROBES`' own
 * docstring: the arm was decisive as a *state* and not as a *run*, so it passed under the wiring
 * mutation while the vacuity guard was satisfied. A guard that the arms differ is not a guard that
 * the arms could move a leg.
 */
describe('a latent field moves no leg by itself', () => {
  for (const [key] of latents()) {
    it(`${key} leaves the legs byte-identical`, () => {
      const probe = LATENT_PROBES[key];
      expect(probe, `${key} has no latent probe`).toBeDefined();
      if (probe === undefined) return;
      const [a, b] = probe.states;
      const base = baseState();
      const left = a(base);
      const right = b(base);
      /*
       * **The vacuity guard, and it is not decoration.** Two arms that are accidentally equal make
       * this case pass while measuring nothing — the page-error-probe shape this repository has a
       * rule about. The arms must differ in the field the row itself names before their legs
       * agreeing means anything.
       */
      expect(
        JSON.stringify(left[probe.field]),
        `${key}'s two arms are identical in ${String(probe.field)} — the case would pass while ` +
          'measuring nothing',
      ).not.toBe(JSON.stringify(right[probe.field]));
      expect(
        legsOf(left),
        `${key} is declared latent and moved a leg — a draft that reaches the run, under a refusal ` +
          'saying it does not (§ D227)',
      ).toBe(legsOf(right));
    });
  }
});

/**
 * **Latent is not inert, and this is the half that tells them apart.**
 *
 * *"The legs do not move"* is also true of a field that does nothing at all, which is the defect
 * `LatentEntry.realisedBy` exists to distinguish from. Two claims are checked, and every row is
 * covered by the first whether or not it carries the second.
 */
describe('a latent field is realised rather than inert', () => {
  for (const [key, entry] of latents()) {
    it(`${key}'s realisedBy chain ends at a control that moves a run`, () => {
      const terminal = terminalControlOf(entry.realisedBy);
      expect(
        terminal,
        `${key} → ${entry.realisedBy} does not reach a control — a chain that ends nowhere, or a ` +
          'cycle, realises nothing and the row is inert rather than latent',
      ).toBeDefined();
      if (terminal === undefined) return;
      const [terminalKey, terminalEntry] = terminal;
      /*
       * `presentation` is the one scope that cannot reach a run — the block above proves it leaves
       * the legs byte-identical — so a chain ending there would realise the draft into nothing.
       */
      expect(
        terminalEntry.scope,
        `${key} is realised through ${terminalKey}, which is declared presentation and therefore ` +
          'cannot reach a run at all',
      ).not.toBe('presentation');
      // And that terminal is itself driven, by the first `describe` in this file, over `PROBES`.
      expect(PROBES[terminalKey], `${terminalKey} has no probe, so the chain ends unproven`).toBeDefined();
    });

    const probe = LATENT_PROBES[key];
    if (probe?.realised === undefined) continue;
    it(`${key} moves the legs once the chain that realises it is written`, () => {
      const [a, b] = probe.realised ?? [];
      if (a === undefined || b === undefined) throw new Error(`${key}: no realised probe`);
      const base = baseState();
      expect(
        legsOf(a(base)),
        `${key} changes no leg even when carried through ${entry.realisedBy} to a run — that is an ` +
          'inert field wearing a latent declaration',
      ).not.toBe(legsOf(b(base)));
    });
  }
});
