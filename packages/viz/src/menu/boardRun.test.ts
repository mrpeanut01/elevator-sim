/**
 * A board row, taken on — GitHub issue #93, and the standing requirement pointed at it.
 *
 * The load-bearing test is the one at the bottom: **press the row and require the run to change,
 * compared on the legs** (§ D177). Everything above it is either an input to that or a claim about
 * words, and the words matter here more than usual because every one of them is about a run this
 * browser did not make.
 *
 * ## What would pass without the legs, and is therefore not enough
 *
 * A test that asserted the intent carries the right `RunSubmission` would pass against a shell arm
 * that dispatched it and did nothing — which is the eleven-times-shipped defect this repository
 * counts, and `patternSwitching` (§ D219) is the instance that was *loaded, resolved and writable by
 * nothing*. So the assertions here go all the way to the simulated legs, twice: once that pressing
 * a row produces **that row's** run, and once that pressing a *different* row produces a different
 * one. The second is the negative control; without it a bug that produced an empty leg set for every
 * row would pass the first.
 */

import { describe, expect, it } from 'vitest';

import { periodOnDays, CALENDAR_PERIODS } from '../shift/calendar.js';
import { asBuiltChoices, withBankChoice } from '../commissioning/choices.js';
import { commissionableClasses } from '../commissioning/types.js';
import type { ViewerState } from '../dev/state.js';
import { baseState, legsOf, RESOURCES } from '../scope/probes.test-helper.js';
import { runIdentityIssues } from '../scope/runIdentity.js';

import {
  BEATING_NOTE,
  BEAT_LABEL,
  beatDetailOf,
  beatRefusalOf,
  boardConfigurationOf,
  boardRevealOf,
  boardRevealRefusalOf,
  selectionFromRun,
} from './boardRun.js';
import { catalogueOf } from './catalogue.js';
import type { RunSubmission } from './client.js';
import { enterFreePlay } from './enterFreePlay.js';
import { freePlayIssues } from './menu.js';
import { applyIntent } from './screens.js';
import type { FreePlaySelection, MenuState } from './types.js';
import { initialMenuState } from './menu.js';

const CATALOGUE = catalogueOf(RESOURCES);

/**
 * A row as the server would return one.
 *
 * `midtown-office` at 1 800 s rather than the smaller pair every other test in this directory uses,
 * and it is measured rather than convenient: `scope/probes.test-helper.ts` records that Garden
 * Apartments produces 20 legs at 900 s and two hydraulic cars answer every one, so a commissioned
 * shaft is never assigned and the calendar-and-fabric control below would report a live seam dead.
 */
const ROW: RunSubmission = Object.freeze({
  buildingId: 'midtown-office',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 3,
  durationS: 1800,
  windowStartS: null,
  seed: '1001',
});

/** The same board, a different player, a different seed. The only axis a row may differ on. */
const OTHER_ROW: RunSubmission = Object.freeze({ ...ROW, seed: '1002' });

const issuesFor = (selection: FreePlaySelection): readonly { readonly message: string }[] =>
  freePlayIssues(selection, CATALOGUE);

/** Midtown's main bank with one more shaft than it ships. `probes.test-helper.ts`' second arm. */
function fiveShaftMain(): ReturnType<typeof asBuiltChoices> {
  const building = RESOURCES.buildings.find((entry) => entry.id === 'midtown-office')?.config;
  if (building === undefined) throw new Error('midtown-office is not loaded');
  const asBuilt = asBuiltChoices(building, commissionableClasses(RESOURCES.elevatorSpecs));
  const main = asBuilt[0];
  if (main === undefined) throw new Error('midtown-office declares no bank');
  return withBankChoice(asBuilt, { ...main, shafts: main.shafts + 1 });
}

/**
 * A viewer mid-campaign with a calendar period over the week and a commissioned fabric under it.
 *
 * The state GitHub issue #129 is about, reached the ordinary way: the calendar select is on the
 * *Scenarios* screen and the fabric has its own, and neither is an axis Free Play offers.
 */
function underACalendarAndAFabric(): ViewerState {
  return {
    ...baseState(),
    buildingId: 'midtown-office',
    shiftLengthS: 1800,
    calendar: periodOnDays(CALENDAR_PERIODS['quarter-end'], 1, 7),
    commissioning: fiveShaftMain(),
  };
}

/** What the shell does with a press, in the order `dev/main.ts#dispatchMenu` does it. */
function press(from: ViewerState, menu: MenuState, run: RunSubmission): ViewerState | undefined {
  const next = applyIntent(menu, { kind: 'beat-score', run }, CATALOGUE);
  return enterFreePlay(from, RESOURCES, next.freePlay, CATALOGUE);
}

describe('a submitted run is a free-play selection', () => {
  it('carries every field, and the two shapes have the same seven', () => {
    const selection = selectionFromRun(ROW);
    expect(selection).toEqual({
      buildingId: 'midtown-office',
      dispatcherProfileId: 'collective',
      demandTemplateId: 'rise-and-fall',
      arrivalRatePctPop5min: 3,
      durationS: 1800,
      windowStartS: null,
      seed: '1001',
    });
    /*
     * Both directions, derived from the objects rather than from a list. A field added to either
     * shape without the other is the § D288 defect — the window lived in `FreePlaySelection` and not
     * in `RunSubmission`, and nothing anywhere said so until a player's honest score came back a 422.
     */
    expect(Object.keys(selection).sort()).toEqual(Object.keys(ROW).sort());
  });

  it('reaches the menu state through the reducer, not through the shell', () => {
    const menu = initialMenuState(CATALOGUE);
    expect(applyIntent(menu, { kind: 'beat-score', run: ROW }, CATALOGUE).freePlay).toEqual(
      selectionFromRun(ROW),
    );
  });
});

describe('what the board ran — “how did they do it”', () => {
  it('names the configuration once, because every row shares it', () => {
    const configuration = boardConfigurationOf([ROW, OTHER_ROW], CATALOGUE);
    expect(configuration.agreed).toBe(true);
    expect(configuration.unresolved).toEqual([]);
    const reveal = boardRevealOf(configuration);
    // The dispatcher `data/` ships under that id, resolved rather than echoed.
    expect(reveal).toContain('Conventional collective');
    expect(reveal).toContain('Midtown Office');
    // The clause that keeps it from being a claim about this build's own copy.
    expect(reveal).toContain('this build’s own');
    expect(boardRevealRefusalOf(configuration)).toBeUndefined();
  });

  it('refuses to name a dispatcher this build does not carry, rather than echoing the id as a name', () => {
    const unknown: RunSubmission = { ...ROW, dispatcherProfileId: 'not-shipped-here' };
    const configuration = boardConfigurationOf([unknown], CATALOGUE);
    expect(configuration.unresolved.map((axis) => axis.axis)).toEqual(['Dispatcher']);
    const refusal = boardRevealRefusalOf(configuration);
    expect(refusal).toContain('not-shipped-here');
    expect(refusal).toContain('will not invent a name');
    // And the row itself cannot be run, with the reason `freePlayIssues` would give on Free play.
    expect(beatRefusalOf(unknown, CATALOGUE, issuesFor)).toContain('not-shipped-here');
  });

  it('says nothing about what ran when the rows disagree about it', () => {
    /*
     * A page whose rows do not share a configuration cannot happen while `runDataHashOf` digests all
     * six fields — which is exactly why the check is here rather than assumed. If the server ever
     * drops one, this screen must go quiet rather than name the first row's dispatcher for all of
     * them.
     */
    const configuration = boardConfigurationOf([ROW, { ...ROW, dispatcherProfileId: 'eta' }], CATALOGUE);
    expect(configuration.agreed).toBe(false);
    expect(boardRevealOf(configuration)).toBeUndefined();
    expect(boardRevealRefusalOf(configuration)).toContain('do not all name the same configuration');
  });

  it('names an empty page as nothing to say rather than as a configuration', () => {
    expect(boardConfigurationOf([], CATALOGUE).agreed).toBe(false);
  });

  it('does not print a weight vector, on any arm', () => {
    /*
     * The one thing the reveal may not say. `data/dispatcher-profiles.json` is the dispatcher
     * (invariant 7), so its weights are the most direct answer to #93's question — and they are the
     * part this browser cannot support, because the board's identity pins the digest the *server*
     * loaded and nothing here computes one. Asserted as an absence, because an absence is what a
     * later editor would fill in without noticing.
     */
    const reveal = boardRevealOf(boardConfigurationOf([ROW], CATALOGUE)) ?? '';
    for (const term of ['waitTime', 'weight', 'distanceTravelled', 'hardConstraint']) {
      expect(reveal).not.toContain(term);
    }
  });
});

describe('the control does not promise what its press cannot do', () => {
  it('is not labelled “Beat this score”', () => {
    /*
     * #93 § 1 asks for that name. It is refused for an arithmetic reason rather than a stylistic
     * one, and the reason is the assertion two tests down: the board fixes the configuration and the
     * row carries the seed, so a press that loads both reproduces the row exactly.
     */
    expect(BEAT_LABEL).not.toContain('Beat');
  });

  it('says the reproduction before a player spends a run finding out', () => {
    const detail = beatDetailOf(ROW);
    expect(detail).toContain('1001');
    expect(detail).toContain('reproduces these four figures exactly');
  });

  it('says where beating a row actually lives, since it is not here', () => {
    expect(BEATING_NOTE).toContain('challenge');
    expect(BEATING_NOTE).toContain('seed');
  });
});

describe('pressing a row produces that row’s run — the legs', () => {
  it('reproduces the row exactly, which is what makes the comparison a real one', () => {
    /*
     * The clause. A run entered from a board row and a run entered from the same selection typed
     * into Free play are the same run, leg for leg — which is invariant 5 arriving at a leaderboard,
     * and is the whole of why the server can verify a score at all.
     */
    const fromRow = press(baseState(), initialMenuState(CATALOGUE), ROW);
    const fromSelection = enterFreePlay(baseState(), RESOURCES, selectionFromRun(ROW), CATALOGUE);
    expect(fromRow).toBeDefined();
    expect(fromSelection).toBeDefined();
    if (fromRow === undefined || fromSelection === undefined) return;
    expect(legsOf(fromRow)).toBe(legsOf(fromSelection));
  });

  it('gives a different run for a different row — the negative control', () => {
    // Without this, a bug producing an empty leg set for every row would pass the assertion above.
    const first = press(baseState(), initialMenuState(CATALOGUE), ROW);
    const second = press(baseState(), initialMenuState(CATALOGUE), OTHER_ROW);
    if (first === undefined || second === undefined) return;
    expect(legsOf(second)).not.toBe(legsOf(first));
  });

  it('runs nothing at all for a row this build cannot resolve', () => {
    // The refusal reaches the run rather than only the label: a disabled row that still ran
    // something if pressed by another route would be the worse half of an explained refusal.
    expect(press(baseState(), initialMenuState(CATALOGUE), { ...ROW, dispatcherProfileId: 'not-shipped-here' })).toBeUndefined();
  });
});

describe('the run it produces is one the board could take back', () => {
  /*
   * GitHub issue #129's two fields, and the reason they are handled here rather than left.
   *
   * `viewer.calendar` and `viewer.commissioning` are `between-games`, so `permits('ranked', …)` is
   * true for both and `runIdentityIssues` says nothing about them — that is #129's whole subject and
   * it is deliberately **not** decided here. What is decided is narrower and is `enterFreePlay`'s own
   * long-standing rule: a free-play run may not inherit state the Free Play screen never offered,
   * which is the argument that already cleared the held car and the levers.
   *
   * Without it, pressing a leaderboard row while a quarter-end week was over the campaign would run
   * the row's ids against a *different building and a different demand* and call it the row's
   * configuration — and then, on posting, the server would replay the authored building, fail to
   * reproduce, and refuse an honest player as a forger.
   */
  it('does not inherit a calendar period or a commissioned shaft', () => {
    const fromCampaign = press(underACalendarAndAFabric(), initialMenuState(CATALOGUE), ROW);
    const fromClean = press(baseState(), initialMenuState(CATALOGUE), ROW);
    expect(fromCampaign).toBeDefined();
    if (fromCampaign === undefined || fromClean === undefined) return;
    expect(fromCampaign.calendar).toBeNull();
    expect(fromCampaign.commissioning).toEqual([]);
    expect(legsOf(fromCampaign)).toBe(legsOf(fromClean));
  });

  it('would have differed without the reset — the negative control', () => {
    /*
     * What the arm did before: apply the selection and leave `calendar` and `commissioning` exactly
     * as the campaign left them. If this ever stops differing, the clearing above has become
     * decorative and the assertion beside it has quietly stopped meaning anything.
     */
    const carried = underACalendarAndAFabric();
    const entered = press(carried, initialMenuState(CATALOGUE), ROW);
    if (entered === undefined) return;
    const uncleared: ViewerState = {
      ...entered,
      calendar: carried.calendar,
      commissioning: carried.commissioning,
    };
    expect(legsOf(uncleared)).not.toBe(legsOf(entered));
  });

  it('is a run the leaderboard could verify, entered from a state that is not', () => {
    const entered = press(underACalendarAndAFabric(), initialMenuState(CATALOGUE), ROW);
    if (entered === undefined) return;
    expect(runIdentityIssues(entered, RESOURCES, 'ranked')).toEqual([]);
  });
});
