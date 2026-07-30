/**
 * The newcomer-facing defaults, pinned — wave 9, T73.
 *
 * ## Why this file exists
 *
 * [§ D134](../../../../DECISIONS.md) moved the viewer's opening dispatcher off `nearest-car` and
 * **nothing pinned the result**. `PREFERRED_DEFAULT_DISPATCHERS` was a local `const` inside
 * `boot()` in `dev/main.ts`, unexported and untested; `batchPanel.ts` held two more of the same
 * shape. A later edit could have put `nearest-car` back, or a rename could have dropped the
 * preference to the file-order fallback (which is `nearest-car`, because it is first in
 * `data/dispatcher-profiles.json`), and every test in this repository would still have been green.
 *
 * That is the *absent* guard, the cheapest of wave 8's false-negative shapes. This file closes it.
 *
 * ## What is asserted, and what is deliberately not
 *
 * A test that only said `expect(chosen).toBe('collective')` would be a change detector: it fails
 * on any edit, including a correct one, and it says nothing about *why* `collective` is right. So
 * three kinds of assertion are made, and each carries a control that would notice if it stopped
 * meaning anything:
 *
 * | assertion | control against vacuity |
 * |---|---|
 * | the resolved default is `collective` | the shipped set is non-empty and contains every id the preference lists name |
 * | the resolved default is **not** the saturating arm | `nearest-car` really is in the shipped set, so "not it" is a choice rather than an absence |
 * | the default's first run **publishes a mean** | the same dispatcher on Midtown Office at the same defaults does **not**, so the check discriminates |
 *
 * The third is the one that carries the reason rather than the id. `docs/07-handoff.md` § 4's claim
 * about `nearest-car` is a claim about saturation, so the pin is written against saturation.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, runSimulation, type LoadedConfig } from '@elevator-sim/core';

import { DATA_DIR } from '../fixtures.test-helper.js';
import {
  PREFERRED_BATCH_BASELINE,
  PREFERRED_BATCH_CANDIDATE,
  PREFERRED_VIEWER_DISPATCHERS,
  preferredDispatcherId,
} from './defaults.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

/** The profile list in the order the viewer's `<select>` receives it — `data/`'s file order. */
function shippedProfiles(): readonly { readonly id: string }[] {
  return config.dispatcherProfiles.profiles;
}

/**
 * The viewer's own run settings, verbatim from `dev/main.ts`'s `runOnce`: 900 s, `report` on
 * timeout, the building's shipped traffic profile at its shipped demand. Only the seed is chosen
 * here, and it is the one `docs/10` § 2.2 measures at.
 */
function awtIsValidFor(buildingId: string, dispatcherId: string): boolean {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(dispatcherId);
  if (building === undefined) throw new Error(`no building ${buildingId}`);
  if (dispatcherProfile === undefined) throw new Error(`no dispatcher ${dispatcherId}`);
  return runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed: 42n,
    durationS: 900,
    onTimeout: 'report',
  }).summary.awtIsValid;
}

describe('the viewer opens on a dispatcher that was chosen, not inherited from file order', () => {
  it('resolves to `collective` against the shipped profile set', () => {
    expect(preferredDispatcherId(PREFERRED_VIEWER_DISPATCHERS, shippedProfiles())).toBe(
      'collective',
    );
  });

  it('never resolves to the profile `data/` lists first, which is the one that saturates', () => {
    const first = shippedProfiles()[0]?.id;
    // The control: without this, "the default is not `nearest-car`" would pass on a `data/` that
    // no longer ships it, and the assertion would have quietly stopped meaning anything.
    expect(first, 'file order changed; the preference is protecting against a different id now').toBe(
      'nearest-car',
    );
    expect(shippedProfiles().map((profile) => profile.id)).toContain('nearest-car');

    const chosen = preferredDispatcherId(PREFERRED_VIEWER_DISPATCHERS, shippedProfiles());
    expect(chosen).not.toBe(first);
  });

  it('names only dispatchers `data/` actually ships, in all three preference lists', () => {
    const shipped = new Set(shippedProfiles().map((profile) => profile.id));
    expect(shipped.size).toBeGreaterThan(1);
    for (const list of [
      PREFERRED_VIEWER_DISPATCHERS,
      PREFERRED_BATCH_BASELINE,
      PREFERRED_BATCH_CANDIDATE,
    ]) {
      expect(list.length).toBeGreaterThan(0);
      for (const id of list) expect(shipped).toContain(id);
    }
  });

  it('opens the Compare surface on two different arms', () => {
    const baseline = preferredDispatcherId(PREFERRED_BATCH_BASELINE, shippedProfiles());
    const candidate = preferredDispatcherId(PREFERRED_BATCH_CANDIDATE, shippedProfiles());
    expect(baseline).toBeDefined();
    expect(candidate).toBeDefined();
    // A panel that opens on `X` against `X` prints IDENTICAL and teaches nothing on the first
    // press. `compare --a X --b X` is a real command; it is not a starting position.
    expect(baseline).not.toBe(candidate);
  });

  it('falls back to file order when `data/` ships none of the preferred ids', () => {
    // The fallback path is the one nobody exercises, so it is exercised here: `undefined` is the
    // signal `main.ts` and `batchPanel.ts` read as "leave the control where the browser put it".
    expect(preferredDispatcherId(PREFERRED_VIEWER_DISPATCHERS, [{ id: 'orchard-irrigation' }])).toBe(
      undefined,
    );
    // …and the same call over a set that *does* contain a preferred id returns it, so the
    // `undefined` above is the fallback and not a broken lookup.
    expect(
      preferredDispatcherId(PREFERRED_VIEWER_DISPATCHERS, [
        { id: 'orchard-irrigation' },
        { id: 'eta' },
      ]),
    ).toBe('eta');
  });
});

describe("the default pair's first run publishes a mean, and the check can tell", () => {
  const chosen = (): string => {
    const id = preferredDispatcherId(PREFERRED_VIEWER_DISPATCHERS, shippedProfiles());
    if (id === undefined) throw new Error('no preferred dispatcher resolved');
    return id;
  };

  it('is quotable on the building the viewer opens on', () => {
    // Garden Apartments is `data/buildings/`'s first entry and therefore the viewer's opening
    // building. `docs/10` § 2.2 argues that default is also poor; measured on this tree it is the
    // only shipped building on which *any* dispatcher publishes a mean at the viewer's own
    // settings, which is why it stays. See the T73 report.
    expect(awtIsValidFor('garden-apartments', chosen())).toBe(true);
  });

  it('is NOT quotable on Midtown Office at the same settings — so the assertion above discriminates', () => {
    // Without this row, the quotability check would pass on a tree where every run is quotable
    // and would therefore be asserting nothing. It is the positive control, and it is also the
    // measurement behind leaving the building default alone.
    expect(awtIsValidFor('midtown-office', chosen())).toBe(false);
  });
});
