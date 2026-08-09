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
 *
 * ## The second half — Free Play's opening pair, GitHub issue #99
 *
 * The same three kinds, one door over, plus a fourth that is not about a default at all. Free Play
 * resolved its pair from `catalogue.buildings[0]`/`catalogue.dispatchers[0]`, so the menu held the
 * dispatcher § D134 had already retired; `PREFERRED_OPENING_BUILDINGS` and the rows below pin the
 * replacement. The building preference resolves to what file order already produced, so the vacuity
 * control is a *prepended* id rather than "not index 0".
 *
 * The fourth is the **refusal**: issue #99 also asks for a difficulty label in the picker, and the
 * last block here is the run that says a static proxy would put the reassuring word on the building
 * that suppresses its own mean. A refusal is pinned by a run, never by another sentence (§ D227).
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, runSimulation, type LoadedConfig } from '@elevator-sim/core';

import { DATA_DIR } from '../fixtures.test-helper.js';
import {
  PREFERRED_BATCH_BASELINE,
  PREFERRED_BATCH_CANDIDATE,
  PREFERRED_OPENING_BUILDINGS,
  PREFERRED_VIEWER_DISPATCHERS,
  preferredId,
} from './defaults.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
});

/** The profile list in the order the viewer's `<select>` receives it — `data/`'s file order. */
function shippedProfiles(): readonly { readonly id: string }[] {
  return config.dispatcherProfiles.profiles;
}

/** The building list in the order the Free Play picker receives it — `data/buildings/`'s file order. */
function shippedBuildings(): readonly { readonly id: string }[] {
  return config.buildings.map((building) => ({ id: building.id }));
}

/**
 * Free Play's own opening settings, verbatim from `menu/menu.ts`'s `initialMenuState`: the shipped
 * `rise-and-fall` template over its whole 1 800 s period, the building's own traffic profile at its
 * own rate, `report` on timeout. Longer than {@link awtIsValidFor}'s 900 s because that is the
 * length the menu actually opens on, and a default is only defensible against the run it produces.
 */
function openingRun(
  buildingId: string,
  dispatcherId: string,
  seed: bigint,
): { readonly awtIsValid: boolean; readonly meanWaitS: number; readonly pctOverAMinute: number } {
  const building = config.buildingsById.get(buildingId);
  const dispatcherProfile = config.dispatcherProfilesById.get(dispatcherId);
  if (building === undefined) throw new Error(`no building ${buildingId}`);
  if (dispatcherProfile === undefined) throw new Error(`no dispatcher ${dispatcherId}`);
  const { summary } = runSimulation({
    building,
    dispatcherProfile,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    seed,
    durationS: 1800,
    demandTemplate: 'rise-and-fall',
    onTimeout: 'report',
  });
  return {
    awtIsValid: summary.awtIsValid,
    meanWaitS: summary.waiting.meanS,
    pctOverAMinute: summary.waiting.pctOverLongWait,
  };
}

/** People per car, exactly as the picker's own `building.detail` line would let a reader compute it. */
function peoplePerCar(buildingId: string): number {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`no building ${buildingId}`);
  const cars = building.banks.reduce((total, bank) => total + bank.cars.length, 0);
  return building.totalPopulation / cars;
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
    expect(preferredId(PREFERRED_VIEWER_DISPATCHERS, shippedProfiles())).toBe(
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

    const chosen = preferredId(PREFERRED_VIEWER_DISPATCHERS, shippedProfiles());
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
    const baseline = preferredId(PREFERRED_BATCH_BASELINE, shippedProfiles());
    const candidate = preferredId(PREFERRED_BATCH_CANDIDATE, shippedProfiles());
    expect(baseline).toBeDefined();
    expect(candidate).toBeDefined();
    // A panel that opens on `X` against `X` prints IDENTICAL and teaches nothing on the first
    // press. `compare --a X --b X` is a real command; it is not a starting position.
    expect(baseline).not.toBe(candidate);
  });

  it('falls back to file order when `data/` ships none of the preferred ids', () => {
    // The fallback path is the one nobody exercises, so it is exercised here: `undefined` is the
    // signal `main.ts` and `batchPanel.ts` read as "leave the control where the browser put it".
    expect(preferredId(PREFERRED_VIEWER_DISPATCHERS, [{ id: 'orchard-irrigation' }])).toBe(
      undefined,
    );
    // …and the same call over a set that *does* contain a preferred id returns it, so the
    // `undefined` above is the fallback and not a broken lookup.
    expect(
      preferredId(PREFERRED_VIEWER_DISPATCHERS, [
        { id: 'orchard-irrigation' },
        { id: 'eta' },
      ]),
    ).toBe('eta');
  });
});

describe("the default pair's first run publishes a mean, and the check can tell", () => {
  const chosen = (): string => {
    const id = preferredId(PREFERRED_VIEWER_DISPATCHERS, shippedProfiles());
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

/* -------------------------------------------------------------------------- *
 * The other door — GitHub issue #99
 * -------------------------------------------------------------------------- */

/**
 * The Free Play opening building, pinned on the same three grounds as the dispatcher above.
 *
 * The building the preference resolves to is the one file order already produced, so *"not index
 * 0"* would assert nothing here and is deliberately not the check. What is checked is that the
 * value is a **choice**: it survives a catalogue whose file order puts something else first, which
 * is exactly the change that would otherwise move the default in silence.
 */
describe('Free Play opens on a building that was chosen, not inherited from file order', () => {
  it('resolves to `chancery-house` against the shipped building set', () => {
    expect(preferredId(PREFERRED_OPENING_BUILDINGS, shippedBuildings())).toBe('chancery-house');
  });

  it('names only buildings `data/buildings/` actually ships', () => {
    const shipped = new Set(shippedBuildings().map((entry) => entry.id));
    expect(shipped.size).toBeGreaterThan(1);
    expect(PREFERRED_OPENING_BUILDINGS.length).toBeGreaterThan(0);
    for (const id of PREFERRED_OPENING_BUILDINGS) expect(shipped).toContain(id);
  });

  it('keeps the choice when a new building sorts ahead of it — the whole point of the list', () => {
    /*
     * The defect this closes, made concrete. `data/buildings/` is read in filename order, so a
     * building called `atrium-tower` landing tomorrow becomes index 0 and would have become the
     * opening building, with no test anywhere going red. The preference does not move.
     */
    expect(
      preferredId(PREFERRED_OPENING_BUILDINGS, [
        { id: 'atrium-tower' },
        ...shippedBuildings(),
      ]),
    ).toBe('chancery-house');
    // …and the fallback still fires when `data/` ships none of the preferred ids.
    expect(preferredId(PREFERRED_OPENING_BUILDINGS, [{ id: 'atrium-tower' }])).toBe(undefined);
  });
});

/**
 * The opening pair, measured at the length the menu opens on rather than at the viewer's 900 s.
 *
 * Issue #99 reports a first run whose headline number the product refuses to print. The premise is
 * corrected — the default is Chancery House and `nearest-car`, not Midtown Office and `collective` —
 * and the complaint survives the correction, which is what these rows record. Each is written
 * against the *mechanism* rather than against a figure this arm happens to produce: the file-order
 * dispatcher is the one whose mean the run refuses on 2 of 6 seeds, and the chosen one is the one
 * that publishes on all six.
 */
describe("the opening pair's own first run, at Free Play's own settings", () => {
  it('publishes a mean on the seed the menu ships, and on the seed that breaks the file-order arm', () => {
    for (const seed of [20260804n, 42n]) {
      expect(openingRun('chancery-house', 'collective', seed).awtIsValid, String(seed)).toBe(true);
    }
  });

  it('and the file-order arm does not — so the row above is a choice rather than a coincidence', () => {
    /*
     * The control, and the issue's own symptom. `nearest-car` is what `catalogue.dispatchers[0]`
     * resolved to before this lane; at seed 42 on the same building and the same settings the run
     * refuses its own mean, which is the *SATURATED, AWT suppressed* screen the report describes —
     * reached from the shipped default rather than from the pair the report names.
     */
    expect(openingRun('chancery-house', 'nearest-car', 42n).awtIsValid).toBe(false);
  });

  it('and where both arms are quotable, the chosen one is not marginally better', () => {
    /*
     * Seed 20260804 is the seed `initialMenuState` ships, and on it *both* arms publish a mean — so
     * quotability alone would have called the old default acceptable. The same 81 riders wait
     * 146.72 s under the file-order arm and 10.34 s under the chosen one, with 87.7 % of them over a
     * minute against 0.0 %. Asserted as an ordering with a wide margin rather than as those figures:
     * the figures belong to this seed, the ordering belongs to the handling capacity underneath it
     * (54.0 against 81.0 offered, versus 86.0 against 81.0).
     */
    const chosen = openingRun('chancery-house', 'collective', 20260804n);
    const fileOrder = openingRun('chancery-house', 'nearest-car', 20260804n);
    expect(fileOrder.awtIsValid).toBe(true);
    expect(chosen.meanWaitS * 5).toBeLessThan(fileOrder.meanWaitS);
    expect(chosen.pctOverAMinute).toBe(0);
    expect(fileOrder.pctOverAMinute).toBeGreaterThan(50);
  });

  it('and the smallest building the issue asks for is a null run, not an easy one', () => {
    /*
     * Issue #99 names Garden Apartments, because that is where the campaign starts new players. At
     * Free Play's own settings it serves a handful of people and the two arms are **the same run**:
     * the one thing a first run has to show — that the dispatcher is what you are choosing — is
     * invisible there. `c1` gets a 3 600 s shift and a scaffolded brief (§ D234); Free Play has
     * neither, so it opens somewhere the choice is legible.
     */
    const quiet = openingRun('garden-apartments', 'collective', 20260804n);
    const alsoQuiet = openingRun('garden-apartments', 'nearest-car', 20260804n);
    expect(quiet.meanWaitS).toBe(alsoQuiet.meanWaitS);
    // …and the building this opens on instead is not the same run under the two arms.
    expect(openingRun('chancery-house', 'collective', 20260804n).meanWaitS).not.toBe(
      openingRun('chancery-house', 'nearest-car', 20260804n).meanWaitS,
    );
  });
});

/**
 * Why the picker carries no difficulty label — a **refusal pinned by a run**, § D227.
 *
 * Issue #99's second recommendation is a plain-language load estimate in the building picker,
 * *"something like population per car, or an easy or hard label"*. The refusal is here rather than
 * in a sentence in `defaults.ts` alone, because a stated refusal goes stale exactly the way a stated
 * mechanism does — and this one would go stale in the direction that matters, by becoming *true*
 * without anybody noticing they could now ship the label.
 *
 * The counterexample is a single pair and it is the pair a newcomer would be misled by. If a
 * `data/` change ever makes the proxy agree with the simulator on it, this test fails and the
 * question is reopened.
 */
describe('a static load proxy does not order the buildings the way the simulator does', () => {
  it('ranks Mixed-Use High-Rise easier than Secure Tower, and the runs say the opposite', () => {
    // Arithmetic a reader can do from the picker's own `19 floors · 612 people · 6 cars` line.
    expect(peoplePerCar('mixed-use-high-rise')).toBeLessThan(peoplePerCar('secure-tower'));

    // …and the run at the opening settings inverts it: the "easier" building refuses its own mean.
    expect(openingRun('secure-tower', 'collective', 20260804n).awtIsValid).toBe(true);
    expect(openingRun('mixed-use-high-rise', 'collective', 20260804n).awtIsValid).toBe(false);
  });
});
