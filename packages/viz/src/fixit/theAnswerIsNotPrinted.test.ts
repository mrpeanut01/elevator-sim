/**
 * **The fix-it case does not tell the player which repair is the answer, and every case is still
 * solvable** — GitHub issues **#566** and **#568**, [§ D869](../../../../DECISIONS.md) and
 * [§ D870](../../../../DECISIONS.md).
 *
 * `docs/38` § 2.1 retires *"the four-repair menu and the five decoys … and with them the printed
 * line that says what kind of fix it is"*. [§ D706](../../../../DECISIONS.md) conditions the
 * **menu's** retirement on an editor that can write the answers, and this suite is the other half:
 * the *answer key* retires now, because nothing in § D706's argument for waiting applies to a
 * sentence whose only job is to say which of the four rows is correct.
 *
 * Four things are held here, and the third is the one that cost a run rather than a sentence:
 *
 * 1. **No phrase marks the answer.** All eighteen diagnosed repairs ended with *"The 9 waits over a
 *    minute are the target"*, seven of them followed by *"and it is a setting"*. Both are gone, and
 *    the phrase guard below refuses them back.
 * 2. **No *formula* marks it either**, which a phrase list cannot see. The check is a measurement:
 *    a word n-gram that appears on many cases' diagnosed repairs and on **no** decoy anywhere is a
 *    tell whatever it says, and the retired tail is what that detector was calibrated against — it
 *    fires on a file with the tail put back, which is the arm that makes the green one mean
 *    something.
 * 3. **Every case is solved, not asserted to be solvable.** A role-blind enumeration of the routes
 *    a player can actually take is run, case by case, and the first one that clears both measured
 *    bars is pinned. Twelve of the eighteen are cleared by the **editor alone** — no repair row
 *    touched — which is a larger number than § D706 § 1's *one of eighteen*, and the two figures
 *    answer different questions: § D706 asked whether the *authored answer's own patch* is
 *    reachable from the editor, and this asks whether *any affordable configuration* clears, which
 *    is [§ D525](../../../../DECISIONS.md) clause 3's own definition of a scenario's difficulty.
 * 4. **A repair that names a figure and a direction moves it that way**, measured on the run rather
 *    than read. This is GitHub issue #568's fifth criterion, and it found two more false promises
 *    than the issue reported.
 *
 * **What this suite deliberately does not claim.** The decoys still refute themselves in their own
 * copy — *"the empty three-hundred-metre climb that makes the long waits is not a door"* — so a
 * reader who works through four rows can still find the answer by elimination. That is honest copy
 * about what each purchase does (§ D227 requires it to stay true, and `cases.test.ts` pins it on
 * the legs), and the thing that closes it is § D706's retirement of the menu, not a re-wording of
 * four sentences into vagueness.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import type { SimulationConfig } from '@elevator-sim/core/browser';
import {
  classifyOutcome,
  emptyFixitState,
  repairsInDrawOrder,
  spendOf,
  zonePriceUnits,
  topFloorRaisePriceUnits,
} from './engine.js';
import { playerFacingStringsOf } from './parse.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import {
  FIXIT_RUN_SWITCHES,
  figureValuesOf,
  fixitRunPlanOf,
  measuredOf,
  standingParkingOf,
  topFloorRaiseCeilingOf,
  zoneOverlapCeilingOf,
  type FixitResources,
} from './run.js';
import { EDITOR_PARKING_STRATEGIES } from './types.js';
import type { FixitCase, FixitCases, FixitState } from './types.js';

const SUITE_TIMEOUT = 600_000;

let resources: FixitResources;
let cases: FixitCases;

beforeAll(async () => {
  resources = await fixitResourcesFromDisk();
  cases = await shippedFixitCases(resources);
}, SUITE_TIMEOUT);

/* -------------------------------------------------------------------------- *
 * 1 and 2 — nothing on the page says which row is the answer
 * -------------------------------------------------------------------------- */

/**
 * The retired phrases, quoted rather than described.
 *
 * A description (*"no sentence naming the complaint as this repair's target"*) is not checkable and
 * would rot into a comment; these are the exact shapes `data/fixit-cases.json` carried on
 * 2026-09-19, and the guard is that they never come back.
 */
const RETIRED_TELLS: readonly RegExp[] = Object.freeze([
  /\b(?:are|is) the target\b/i,
  /\bit is a setting\b/i,
  /\bfree — configuration\b/i,
]);

describe('no fix-it case tells the player which repair is the answer', () => {
  it('carries none of the retired phrases on any player-facing string', () => {
    const found: string[] = [];
    for (const entry of cases.cases) {
      for (const [label, text] of playerFacingStringsOf(entry)) {
        for (const tell of RETIRED_TELLS) {
          if (tell.test(text)) found.push(`${entry.id} ${label}: ${JSON.stringify(text)}`);
        }
      }
    }
    expect(
      found,
      'docs/38 § 2.1 retires the printed line that says which repair is correct and what kind of ' +
        'fix it is. A case that says it again is a multiple-choice quiz with the answer under it.',
    ).toEqual([]);
  });

  /**
   * **The role never reaches a string**, which is the half a phrase list can state and the
   * positional half below is the one it cannot.
   */
  it('renders no role word anywhere a player can read', () => {
    /*
     * `fixit/types.ts#RepairRole`'s four, written out because a union type has no runtime members.
     * The assertion below holds the list to the file rather than to a memory of it: every shipped
     * repair's role must be one of these, so a fifth role cannot slip past the sweep by not being
     * listed.
     */
    const roleWords = ['diagnosed', 'costly-fix', 'cheap-fix', 'new-shaft'];
    const shipped = new Set(cases.cases.flatMap((entry) => entry.repairs.map((r) => r.role)));
    expect([...shipped].sort()).toEqual([...roleWords].sort());

    const found: string[] = [];
    for (const entry of cases.cases) {
      for (const [label, text] of playerFacingStringsOf(entry)) {
        for (const role of roleWords) {
          if (text.toLowerCase().includes(role)) found.push(`${entry.id} ${label}: ${role}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  /**
   * **The draw order carries no information about which repair is which** — the tell a phrase sweep
   * cannot see, and the one that shipped on all eighteen cases.
   *
   * `data/fixit-cases.json` still lists the repairs in role order, and both surfaces used to draw
   * them in that order, so the answer was the first row every time.
   * `fixit/engine.ts#repairsInDrawOrder` is what the surfaces draw now; this asserts what it buys —
   * that the diagnosed repair is spread across the positions rather than sitting in one — and that
   * the shipped file's own order is still the one the tell would come back through, so a later lane
   * that stops calling the function has this test to explain why it exists.
   */
  it('draws the answer in no fixed position, though the file still authors it first', () => {
    const authored = cases.cases.map((entry) =>
      entry.repairs.findIndex((repair) => repair.role === 'diagnosed'),
    );
    expect(new Set(authored), 'the file authors the diagnosed repair first on every case').toEqual(
      new Set([0]),
    );

    const drawn = cases.cases.map((entry) =>
      repairsInDrawOrder(entry).findIndex((repair) => repair.role === 'diagnosed'),
    );
    expect(drawn).toEqual([3, 2, 0, 0, 3, 0, 2, 2, 0, 2, 2, 3, 1, 2, 3, 3, 0, 3]);
    expect(new Set(drawn).size, 'a draw order that puts the answer in one place is the old tell')
      .toBeGreaterThan(1);

    /* Deterministic: the same case draws the same order twice, and on the next load. */
    for (const entry of cases.cases) {
      expect(repairsInDrawOrder(entry).map((repair) => repair.id)).toEqual(
        repairsInDrawOrder(entry).map((repair) => repair.id),
      );
      expect([...repairsInDrawOrder(entry)].map((r) => r.id).sort()).toEqual(
        [...entry.repairs].map((r) => r.id).sort(),
      );
    }
  });

  /**
   * **The formula check, and its own control.**
   *
   * A *tell* here is a word n-gram (two or three words) that appears on at least `atLeast` cases'
   * diagnosed repairs and on **no** decoy of any case. *"are the target"* was one on seventeen of
   * the eighteen and *"the target"* on all of them; anything that replaced it would be one too,
   * whatever words it used.
   *
   * The threshold is half the cases rather than one, because a handful of low-count phrases survive
   * honestly — three crowd-shaping cases each say *"this run watches the …"*, which is § 10.4's
   * basis in the copy of the three repairs that change who arrives, and it is a fact about the run
   * rather than a mark on the answer. They are named in the expectation below so that a new one
   * arriving is read rather than absorbed.
   */
  it('shares no formula across the diagnosed repairs that no decoy ever uses', () => {
    expect(tellsIn(cases.cases, 9)).toEqual([]);

    /* Every survivor under the threshold, named — a list nobody reads is a list that hides one. */
    expect([...tellsIn(cases.cases, 3)].sort()).toEqual([
      'run watches',
      'run watches the',
      'the idle',
      'this run',
      'this run watches',
      'watches the',
    ]);
  });

  /**
   * The arm that makes the green one mean something: the retired tail, put back, is detected.
   *
   * Without this a detector that always returned `[]` would pass — which is the shape of check this
   * repository keeps finding on its own guards.
   */
  it('detects the retired tail when it is put back', () => {
    const withTheTell = cases.cases.map((entry) => ({
      ...entry,
      repairs: entry.repairs.map((repair) =>
        repair.role === 'diagnosed'
          ? { ...repair, effect: `${repair.effect} The waits over a minute are the target.` }
          : repair,
      ),
    }));
    expect(tellsIn(withTheTell, 9)).toContain('are the target');
    for (const entry of withTheTell) {
      const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed')!;
      expect(RETIRED_TELLS.some((tell) => tell.test(diagnosed.effect))).toBe(true);
    }
  });
});

/** Word n-grams of length 2 and 3, lowercased, punctuation dropped. */
function gramsOf(text: string): ReadonlySet<string> {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const out = new Set<string>();
  for (const size of [2, 3]) {
    for (let i = 0; i + size <= words.length; i += 1) out.add(words.slice(i, i + size).join(' '));
  }
  return out;
}

/** Every n-gram on `atLeast` cases' diagnosed repairs and on no decoy of any case. */
function tellsIn(entries: readonly FixitCase[], atLeast: number): readonly string[] {
  const onDiagnosed = new Map<string, Set<string>>();
  const onDecoys = new Set<string>();
  for (const entry of entries) {
    for (const repair of entry.repairs) {
      const grams = gramsOf(`${repair.name}. ${repair.effect}`);
      if (repair.role === 'diagnosed') {
        for (const gram of grams) {
          const seen = onDiagnosed.get(gram) ?? new Set<string>();
          seen.add(entry.id);
          onDiagnosed.set(gram, seen);
        }
      } else {
        for (const gram of grams) onDecoys.add(gram);
      }
    }
  }
  return [...onDiagnosed]
    .filter(([gram, seen]) => seen.size >= atLeast && !onDecoys.has(gram))
    .map(([gram]) => gram)
    .sort();
}

/* -------------------------------------------------------------------------- *
 * 3 — every case is solved by a route chosen without reading the role
 * -------------------------------------------------------------------------- */

/** One thing a player can do, named the way the screen names it. */
interface Route {
  readonly label: string;
  readonly state: FixitState;
}

/**
 * Every route this suite will try, in one fixed order, **built without looking at any repair's
 * role**.
 *
 * The editor's own controls first — the five families `fixit/types.ts#FixitState` draws — and then
 * the repair rows, in the order the screen draws them
 * (`fixit/engine.ts#repairsInDrawOrder`), which is the order a player meets them in. Anything the
 * budget refuses is dropped here rather than run, because a route a player cannot select is not a
 * route.
 */
function routesFor(entry: FixitCase, asBuilt: SimulationConfig): readonly Route[] {
  const schedule = shippedPriceSchedule();
  const standing = standingParkingOf(asBuilt);
  const zoneCeiling = zoneOverlapCeilingOf(asBuilt.building);
  const raiseCeiling = topFloorRaiseCeilingOf(asBuilt.building);
  const candidates: Route[] = [];
  for (const strategy of EDITOR_PARKING_STRATEGIES) {
    if (strategy === standing) continue;
    candidates.push({
      label: `parking:${strategy}`,
      state: { ...emptyFixitState(), parkingStrategy: strategy },
    });
  }
  if (zonePriceUnits(schedule) <= entry.budgetUnits) {
    /* Every rung, not only the ceiling: `cases.test.ts` proves each one redraws a different run. */
    for (let floors = 1; floors <= zoneCeiling; floors += 1) {
      candidates.push({
        label: `zone:${String(floors)}`,
        state: { ...emptyFixitState(), zoneOverlapFloors: floors },
      });
    }
  }
  candidates.push({ label: 'speed:1', state: { ...emptyFixitState(), speedSteps: 1 } });
  candidates.push({ label: 'capacity:1', state: { ...emptyFixitState(), capacitySteps: 1 } });
  if (topFloorRaisePriceUnits(schedule) <= entry.budgetUnits) {
    for (let metres = 1; metres <= raiseCeiling; metres += 1) {
      candidates.push({
        label: `raise:${String(metres)}`,
        state: { ...emptyFixitState(), topFloorRaiseM: metres },
      });
    }
  }
  /*
   * Two-control pairs, before the menu is reached: a player who has moved one dial and not cleared
   * the case moves a second, and `one-start-time` is the case that needs it — no single control
   * clears it and `parking:lobby` with one speed step does.
   */
  for (const strategy of EDITOR_PARKING_STRATEGIES) {
    if (strategy === standing) continue;
    candidates.push({
      label: `parking:${strategy}+speed:1`,
      state: { ...emptyFixitState(), parkingStrategy: strategy, speedSteps: 1 },
    });
    if (zoneCeiling > 0) {
      candidates.push({
        label: `parking:${strategy}+zone:${String(zoneCeiling)}`,
        state: { ...emptyFixitState(), parkingStrategy: strategy, zoneOverlapFloors: zoneCeiling },
      });
    }
  }
  for (const repair of repairsInDrawOrder(entry)) {
    candidates.push({
      label: `repair:${repair.id}`,
      state: { ...emptyFixitState(), selectedRepairIds: [repair.id] },
    });
  }
  return candidates.filter(
    (route) => spendOf(entry, route.state, schedule).totalUnits <= entry.budgetUnits,
  );
}

/**
 * **The route that clears each case, and whether the menu was needed for it.**
 *
 * Pinned as one table and asserted in one `toEqual`, so a failing run prints every case at once
 * rather than the first — this is a survivor census and a census read one row at a time is a
 * census nobody finishes.
 *
 * The six rows reading `repair:` are the ones no editor route in {@link routesFor} clears —
 * `zoning-starves-the-top`, `doors-that-never-close`, `express-that-stops-everywhere`,
 * `deliveries-on-the-passenger-group`, `two-cars-out-wrong-month` and `let-faster-than-the-lifts`.
 * They are **not** a finding that a case is unsolvable: each is cleared by a repair the player can
 * select without being told anything about it, which is what this suite is for. What they are is
 * the measured size of § D706 § 6's precondition — six cases whose answer the shipped editor cannot
 * express, against twelve it can.
 *
 * **The twelve is a floor and the search is a sample, which § D525 clause 3 requires this row to
 * say.** {@link routesFor} tries the five editor families one at a time and then two at a time
 * over parking, and stops at the first route that clears; the affordable space is far larger than
 * that, so a case that lands on `repair:` here has not been shown to need the menu — it has been
 * shown that this enumeration did not find an editor route. Three of the twelve were only reached
 * by widening the enumeration once: `controller-sends-every-car` needs the **second** rung of the
 * zoning stepper rather than its ceiling, and `one-start-time` needs a parking rule and a speed
 * step together. Neither would have been found by a smaller search, and neither is a coincidence
 * worth generalising from.
 */
const SOLVED_BY: readonly (readonly [string, string])[] = Object.freeze([
  ['sleeping-sky-lobby', 'parking:stay'],
  ['zoning-starves-the-top', 'repair:redraw-by-headcount'],
  ['three-cars-one-cars-work', 'parking:zone-center'],
  ['doors-that-never-close', 'repair:dwell-that-reacts'],
  ['cars-that-always-go-home', 'parking:stay'],
  ['car-park-nobody-serves', 'zone:1'],
  ['express-that-stops-everywhere', 'repair:blank-the-low-landings'],
  ['deliveries-on-the-passenger-group', 'repair:delivery-window'],
  ['one-start-time', 'parking:lobby+speed:1'],
  ['every-letter-says-nine', 'raise:3'],
  ['everyone-leaves-at-once', 'parking:zone-center'],
  ['bed-cars-locked-out', 'zone:1'],
  ['two-cars-out-wrong-month', 'repair:borrow-a-low-car'],
  ['every-deck-calls-itself-full', 'parking:zone-center'],
  ['restaurant-above-the-ballroom', 'speed:1'],
  ['controller-sends-every-car', 'zone:2'],
  ['let-faster-than-the-lifts', 'repair:invoke-staggered-starts'],
  ['gym-on-the-top-floor', 'parking:zone-center'],
]);

describe('every case is solved without being told which repair is the answer', () => {
  it(
    'clears both measured bars on the first affordable route a role-blind search reaches',
    () => {
      const schedule = shippedPriceSchedule();
      const solved: (readonly [string, string])[] = [];
      for (const entry of cases.cases) {
        const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
        const before = recordRun(asBuilt, FIXIT_RUN_SWITCHES).recording;
        let winner = 'none';
        for (const route of routesFor(entry, asBuilt)) {
          const after = recordRun(
            fixitRunPlanOf(entry, route.state, resources).asRepaired,
            FIXIT_RUN_SWITCHES,
          ).recording;
          const outcome = classifyOutcome(
            entry,
            measuredOf(entry, before, after),
            spendOf(entry, route.state, schedule),
          );
          if (outcome.kind === 'fixed') {
            winner = route.label;
            break;
          }
        }
        solved.push([entry.id, winner]);
      }
      expect(solved).toEqual(SOLVED_BY);
      expect(
        solved.filter(([, route]) => route === 'none'),
        'a case with no route through is a scenario with zero survivors — § D525 clause 3 says ' +
          'that is a diagnosis or it is not a scenario, and no fix case declares itself one.',
      ).toEqual([]);
    },
    SUITE_TIMEOUT,
  );

  /** The census § D706 § 6 is conditioned on, stated as a number rather than as a feeling. */
  it('names how many cases the editor alone clears', () => {
    const editorOnly = SOLVED_BY.filter(([, route]) => !route.startsWith('repair:'));
    expect(editorOnly).toHaveLength(12);
    expect(SOLVED_BY.filter(([, route]) => route.startsWith('repair:'))).toHaveLength(6);
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — a repair that names a figure and a direction moves it that way
 * -------------------------------------------------------------------------- */

/** *"so the 70 s worst wait shortens"* — the family GitHub issue #568 is about. */
const CLAIMS_SHORTER = /\bworst\b[^.]*\bshorten/i;
/** *"and the worst wait does not shorten"* — the corrected form, which must stay corrected. */
const CLAIMS_NO_CHANGE = /\bworst wait does not shorten\b/i;

describe('a repair that names the worst wait and a direction moves it that way', () => {
  it(
    'measures every such claim on its own case, on the run rather than on the sentence',
    () => {
      const claims: string[] = [];
      const wrong: string[] = [];
      for (const entry of cases.cases) {
        const claiming = entry.repairs.filter(
          (repair) => CLAIMS_SHORTER.test(repair.effect) || CLAIMS_NO_CHANGE.test(repair.effect),
        );
        if (claiming.length === 0) continue;
        const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
        const before = worstWaitOf(entry, recordRun(asBuilt, FIXIT_RUN_SWITCHES).recording);
        for (const repair of claiming) {
          const state: FixitState = { ...emptyFixitState(), selectedRepairIds: [repair.id] };
          const after = worstWaitOf(
            entry,
            recordRun(fixitRunPlanOf(entry, state, resources).asRepaired, FIXIT_RUN_SWITCHES)
              .recording,
          );
          const shorter = after < before;
          const promised = !CLAIMS_NO_CHANGE.test(repair.effect);
          claims.push(`${entry.id}/${repair.id}`);
          if (shorter !== promised) {
            wrong.push(
              `${entry.id}/${repair.id}: says the worst wait ${promised ? 'shortens' : 'does not shorten'}, ` +
                `and it went ${before} → ${after}`,
            );
          }
        }
      }
      expect(
        wrong,
        'GitHub issue #568: either the repair does what it promises or its promise changes. § D227 ' +
          '— a sentence that has stopped being true is worse than a missing one.',
      ).toEqual([]);
      /* Non-vacuity: a regex that matched nothing would pass the assertion above. */
      expect(claims.sort()).toEqual([
        'car-park-nobody-serves/regear-the-garage-car',
        'doors-that-never-close/regear-the-rank',
        'every-deck-calls-itself-full/regear-the-shuttles',
        'express-that-stops-everywhere/regear-the-express',
        'gym-on-the-top-floor/replant-the-machines',
        'restaurant-above-the-ballroom/regear-guest-cars',
        'three-cars-one-cars-work/faster-machines',
        'zoning-starves-the-top/regear-the-upper-car',
      ]);
    },
    SUITE_TIMEOUT,
  );
});

/**
 * The scoped worst wait, in the same seconds the case's own figure grid prints — read back off the
 * rendered figure rather than recomputed, so this suite cannot disagree with the screen about what
 * the worst wait is.
 */
function worstWaitOf(entry: FixitCase, recording: Parameters<typeof figureValuesOf>[1]): number {
  const index = entry.figures.findIndex((figure) => figure.kind === 'scope-worst-wait');
  if (index < 0) throw new Error(`case "${entry.id}" draws no worst-wait figure`);
  const text = figureValuesOf(entry, recording)[index]!.text;
  const seconds = /^(\d+(?:\.\d+)?) s$/.exec(text);
  if (seconds === null) throw new Error(`case "${entry.id}" worst wait reads "${text}"`);
  return Number(seconds[1]);
}
