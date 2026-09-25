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
 * 3. **Every offered case is solved, not asserted to be solvable — under the judge a player
 *    meets.** A role-blind enumeration of the routes a player can actually take is run, case by
 *    case, and the first one that **holds over fifty mornings** is pinned
 *    ([§ D1020](../../../../DECISIONS.md)); the routes that cleared the letter's morning and then did
 *    not hold are pinned beside it, because they are the single pair's noise named case by case.
 *    Under the single pair this read seventeen of eighteen on the editor alone (§ D1000 § 3); the
 *    figures now are in {@link SOLVED_BY}'s own count case below. This asks whether *any affordable
 *    configuration* clears, which is [§ D525](../../../../DECISIONS.md) clause 3's own definition of
 *    a scenario's difficulty.
 * 4. **A repair that names a figure and a direction moves it that way**, measured on the run rather
 *    than read. This is GitHub issue #568's fifth criterion, and it found two more false promises
 *    than the issue reported.
 *
 * **The residual this suite used to name is closed.** The decoys refute themselves in their own
 * copy — *"the empty three-hundred-metre climb that makes the long waits is not a door"* — so a
 * reader who worked through four rows could find the answer by elimination. § D706's retirement of
 * the menu was named as the thing that closes that, and it landed on [§ D1020](../../../../DECISIONS.md)'s
 * commit: no surface draws a repair row, so no player reads a decoy's line. The copy stays true and
 * stays pinned on the legs (`cases.test.ts`), because the file keeps the repairs as priced negative
 * controls.
 */

import { writeFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import type { SimulationConfig } from '@elevator-sim/core/browser';
import {
  classifyOutcome,
  emptyFixitState,
  spendOf,
  zonePriceUnits,
  topFloorRaisePriceUnits,
} from './engine.js';
import { playerFacingStringsOf } from './parse.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import {
  dialGroupsOf,
  dialOptionsOf,
  liveDialIdsOf,
  rezoneFabricOf,
  standingDialValuesOf,
} from './families.js';
import {
  FIXIT_RUN_SWITCHES,
  assertPairMatchesRepairs,
  figureValuesOf,
  fixitPlanRefusalOf,
  fixitRunPlanOf,
  measuredOf,
  standingParkingOf,
  topFloorRaiseCeilingOf,
  zoneOverlapCeilingOf,
  type FixitResources,
} from './run.js';
import { EVERY_CAR, OUT_OF_SERVICE } from './types.js';
import type { EditorParkingStrategy, FixitCase, FixitCases, FixitState } from './types.js';
import type { VizRecording } from '../contract/types.js';
import type { FixitOutcome } from './engine.js';
import { createFixitJudge, pressThroughTheJudge, type FixitJudge, type MorningRunner, type PairRunner } from './judge.js';
import { heldReasonOf } from './held.js';
import { routesFor } from './routes.test-helper.js';
import { morningReadingOf } from './run.js';

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

  /*
   * **The draw-order check retired with the menu** — [§ D1020](../../../../DECISIONS.md). It held
   * `repairsInDrawOrder` to spreading the answer across the menu's four rows, which mattered while a
   * menu drew them. Nothing draws a repair row now, so there is no position to carry a tell, and the
   * function went with its last caller. The two checks below still bind: they are about the words
   * the file holds, and the file still holds them.
   */

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

/* The role-blind routes live in `routes.test-helper.ts`, shared with § D1120's route census. */

/**
 * **The route that holds each case under the judge a player meets, and the routes that only cleared
 * once** — re-pinned by [§ D1020](../../../../DECISIONS.md) under the fifty-morning judge.
 *
 * Pinned as tables and asserted in one `toEqual` each, so a failing run prints every case at once —
 * this is a survivor census, and a census read one row at a time is a census nobody finishes.
 *
 * ## What moved, and why the old table was the finding
 *
 * Under the single pair this table read *seventeen of eighteen cleared by the editor alone* (§ D1000
 * § 3), and it named two of its own wins as the pair's noise: `let-faster-than-the-lifts` on a fixed
 * floor at the top and `every-letter-says-nine` on a three-metre roof raise. Under the judge, a route
 * **holds** only when its letter's morning clears both bars and the fifty mornings' paired interval
 * excludes zero with the rest not shown worse than the floor; a route that clears the letter's
 * morning and then does not hold is `cleared-once`, is **not** a win, and goes in
 * {@link NOT_REPLICATED} rather than being dropped — because those rows are the finding, the
 * single pair's noise named case by case.
 *
 * ## Three things the rows say, and one they do not
 *
 * - **A held case is not searched.** Its answer fails the judge (`fixit/held.ts` carries each
 *   measurement), it is not offered, and its row reads `held`.
 * - **`answer:` is the witness, not a find.** Where no sampled editor route holds, the diagnosed
 *   repair is tried last — the change `families.test.ts` proves the editor writes leg for leg — so
 *   the row says the case has a way through without claiming the sample found it.
 * - **The menu's rows are gone from the routes**, because the menu is gone (§ D1020 (c)).
 * - **The count is a floor and the search is a sample**, which § D525 clause 3 requires this row to
 *   say. It stops at the first route that holds, and it tries each family one move at a time.
 *
 * **What the two `NOT_REPLICATED` rows are.** `every-letter-says-nine`'s three-metre roof raise is
 * one of the two wins § D1000 § 3 itself named as the single pair's noise; the other, zone-centre
 * parking on `every-deck-calls-itself-full`, is the decision agents' own zone-centre finding. Neither
 * holds, and each case's first route that does is a different one. A third row,
 * `let-faster-than-the-lifts`' fixed floor at the top, left the table when GitHub issue #601
 * (§ D1076) re-authored that case at 7.0 %: on the re-authored letter's morning that route no longer
 * clears even once. **`every-deck-calls-itself-full`'s zoning step was refused rather than
 * judged until GitHub issue #605** (§ D1075): the surfaces' own crowd check (GitHub issue #350) read
 * an escalator hop the overlap removed as a change of crowd, so the press failed, and before wave AI
 * a player pressing it saw *Running the day…* for good (§ D1020). The generator's crowd was identical
 * all along; with the check reading the journey rather than the first lift leg, `zone:1` is a route
 * like any other and it **holds**, so it is that case's row, ahead of `capacity:1`, which held
 * while it was refused. **The cost**, measured 2026-09-25 at `702991b`: the whole enumeration took
 * 423 s of one vitest process under a load average of 9–14, and 236 s at 13 on the next sitting,
 * against this file's 600 s annotation. They are dated readings of a shared box, not a bound.
 */
const SOLVED_BY: readonly (readonly [string, string])[] = Object.freeze([
  ['sleeping-sky-lobby', 'parking:stay'],
  ['zoning-starves-the-top', 'car:A->high'],
  ['three-cars-one-cars-work', 'parking:zone-center'],
  ['doors-that-never-close', 'doors:5/3'],
  ['cars-that-always-go-home', 'held'],
  ['car-park-nobody-serves', 'zone:1'],
  ['express-that-stops-everywhere', 'answer:blank-the-low-landings'],
  ['deliveries-on-the-passenger-group', 'doors:5/3'],
  ['one-start-time', 'parking:lobby+speed:1'],
  ['every-letter-says-nine', 'dial:constraints.noDirectionReversal=false'],
  ['everyone-leaves-at-once', 'held'],
  ['bed-cars-locked-out', 'zone:1'],
  ['two-cars-out-wrong-month', 'car:A->high'],
  ['every-deck-calls-itself-full', 'zone:1'],
  ['restaurant-above-the-ballroom', 'speed:1'],
  ['controller-sends-every-car', 'parking:zone-center+zone:3'],
  ['let-faster-than-the-lifts', 'tenancy:new-lettings=invoke-for-all'],
  ['gym-on-the-top-floor', 'held'],
]);

/** Routes that cleared the letter's morning and did not hold over fifty mornings, before the winner. */
const NOT_REPLICATED: readonly (readonly [string, string])[] = Object.freeze([
  ['every-letter-says-nine', 'raise:3'],
  ['every-deck-calls-itself-full', 'parking:zone-center'],
]);

/** The shipped press, synchronously in this process — `cases.test.ts#judgedPress`'s shape. */
function syncJudge(): FixitJudge {
  const mornings: MorningRunner = {
    start(ask) {
      ask.onDone(ask.configs.map((config) => morningReadingOf(recordRun(config, FIXIT_RUN_SWITCHES).recording, ask.measure)));
    },
    cancel() {},
    isRunning: () => false,
  };
  return createFixitJudge(mornings);
}

/**
 * One press through the judge, with the letter's as-built run passed in so a case's routes share
 * it, and the judge shared across them so the forty-nine as-built mornings are run once a case.
 */
function pressRoute(
  entry: FixitCase,
  state: FixitState,
  before: VizRecording,
  judge: FixitJudge,
): FixitOutcome | 'refused' {
  const schedule = shippedPriceSchedule();
  const pairRunner: PairRunner = {
    start(ask) {
      /* The as-built half is the case's own, run once; the after half is this route's. */
      ask.onDone([before, recordRun(ask.runs[1]!.config, FIXIT_RUN_SWITCHES).recording]);
    },
  };
  let verdict: FixitOutcome | 'refused' | undefined;
  pressThroughTheJudge({
    entry,
    plan: fixitRunPlanOf(entry, state, resources),
    switches: FIXIT_RUN_SWITCHES,
    pairRunner,
    judge,
    /*
     * The surfaces' own check first — GitHub issue #350: the pair's crowd claim held to its legs.
     * A route whose pair moves the crowd without claiming to is one the product refuses with a
     * failure line rather than a verdict, so it is no route through (`every-deck-calls-itself-full`'s
     * zoning step is the one found, § D1020).
     */
    classify: (b, a, done) => {
      assertPairMatchesRepairs(entry, state, b, a);
      done(classifyOutcome(entry, measuredOf(entry, b, a), spendOf(entry, state, schedule)));
    },
    onGate: (outcome) => {
      verdict = outcome;
    },
    onVerdict: (outcome) => {
      verdict = outcome;
    },
    onFailed: () => {
      verdict = 'refused';
    },
  });
  return verdict!;
}

describe('every offered case is solved without being told which repair is the answer', () => {
  it(
    'holds over fifty mornings on the first affordable route a role-blind search reaches',
    () => {
      const solved: (readonly [string, string])[] = [];
      const notReplicated: (readonly [string, string])[] = [];
      for (const entry of cases.cases) {
        if (heldReasonOf(entry.id) !== undefined) {
          solved.push([entry.id, 'held']);
          continue;
        }
        const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
        const before = recordRun(asBuilt, FIXIT_RUN_SWITCHES).recording;
        const judge = syncJudge();
        let winner = 'none';
        for (const route of routesFor(entry, asBuilt, resources)) {
          const outcome = pressRoute(entry, route.state, before, judge);
          if (outcome === 'refused') continue;
          if (outcome.kind === 'fixed') {
            winner = route.label;
            break;
          }
          if (outcome.kind === 'cleared-once') notReplicated.push([entry.id, route.label]);
        }
        solved.push([entry.id, winner]);
        /* The census's own output, written per case so a long sitting can be read while it runs. */
        if (process.env['FIXIT_CENSUS_OUT'] !== undefined) {
          writeFileSync(process.env['FIXIT_CENSUS_OUT'], JSON.stringify({ solved, notReplicated }, null, 1));
        }
      }
      if (process.env['FIXIT_CENSUS_OUT'] !== undefined) {
        writeFileSync(process.env['FIXIT_CENSUS_OUT'], JSON.stringify({ solved, notReplicated }, null, 1));
      }
      expect(solved).toEqual(SOLVED_BY);
      expect(notReplicated).toEqual(NOT_REPLICATED);
      expect(
        solved.filter(([, route]) => route === 'none'),
        'an offered case with no route through is a scenario with zero survivors — § D525 clause 3 ' +
          'says that is a diagnosis or it is not a scenario, and no fix case declares itself one.',
      ).toEqual([]);
    },
    SUITE_TIMEOUT,
  );

  /**
   * The census § D706 § 6 is conditioned on, stated as figures rather than as a feeling — and
   * **read off {@link SOLVED_BY} rather than re-measured**, deliberately: the case above holds every
   * row against a run, and what this adds is that the split is written down as figures a reader
   * can fail.
   */
  it('names how many cases hold on an editor route, on the witness, and are held', () => {
    const editor = SOLVED_BY.filter(([, route]) => route !== 'held' && !route.startsWith('answer:'));
    const witness = SOLVED_BY.filter(([, route]) => route.startsWith('answer:'));
    const held = SOLVED_BY.filter(([, route]) => route === 'held');
    expect([editor.length, witness.length, held.length]).toEqual([14, 1, 3]);
    expect(SOLVED_BY.some(([, route]) => route.startsWith('repair:')), 'the menu retired').toBe(false);
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
