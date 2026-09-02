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
  rowVariationOf,
  selectionFromRun,
} from './boardRun.js';
import { catalogueOf } from './catalogue.js';
import type { BoardEntry, RunSubmission } from './client.js';
import { enterFreePlay } from './enterFreePlay.js';
import { freePlayIssues } from './menu.js';
import { applyIntent, screenOf, type MenuAffordance, type MenuScreenView } from './screens.js';
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

/** The same configuration, a different player, a different seed. */
const OTHER_ROW: RunSubmission = Object.freeze({ ...ROW, seed: '1002' });

/**
 * The daily board's own shape — GitHub issue #316, and § D439's consequence in one constant.
 *
 * The **same** seed as {@link ROW}, because that is what a daily board is: the day's fixture and the
 * day's crowd, with the dispatcher left free (`leaderboard/boardKey.ts#isDailyFixtureRun`). A row
 * differing by seed would be a personal log's shape and would test the wrong thing.
 */
const ETA_ROW: RunSubmission = Object.freeze({ ...ROW, dispatcherProfileId: 'eta' });

/**
 * This build's name for a dispatcher id, resolved rather than transcribed — and it throws.
 *
 * A `?? ''` fallback would make every `toContain` below vacuously true the day an id was renamed in
 * `data/`, which is the shape of silent degradation these assertions exist to catch elsewhere.
 */
function dispatcherName(id: string): string {
  const name = CATALOGUE.dispatchers.find((entry) => entry.id === id)?.name;
  if (name === undefined) throw new Error(`this build ships no dispatcher “${id}”`);
  return name;
}

const COLLECTIVE_NAME = dispatcherName('collective');
const ETA_NAME = dispatcherName('eta');

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

  /*
   * What this test used to assert, and why the assertion moved rather than softened — issue #316.
   *
   * It read *"says nothing about what ran when the rows disagree about it"*, and it was correct
   * about a board that was a configuration: a disagreeing page could only mean the client and the
   * server had fallen out over what a board is, and silence was the only honest answer. § D439 made
   * a daily board's rows disagree **by design**, so silence became a blank where the interesting
   * fact was. What survives unweakened is the half that was load-bearing: an axis the rows disagree
   * on is still never named as though they agreed, and the shape now makes that structural — a
   * varying axis has no value in {@link BoardConfiguration} to print by accident.
   */
  it('names what a mixed board shares and never the axis it does not', () => {
    const configuration = boardConfigurationOf([ROW, ETA_ROW], CATALOGUE);
    expect(configuration.agreed).toBe(false);
    expect(configuration.varying).toEqual(['Dispatcher']);
    expect(configuration.shared.map((axis) => axis.axis)).toEqual([
      'Building',
      'Traffic shape',
      'Arrival rate',
      'Part of the day',
    ]);

    const reveal = boardRevealOf(configuration);
    expect(reveal).toContain('Midtown Office');
    expect(reveal).toContain('3 % of population per 5 min');
    // The refusal, asserted as an absence on both values rather than on the one that would look
    // wrong: naming *either* dispatcher above the table is the false statement, not just the second.
    expect(reveal).not.toContain(COLLECTIVE_NAME);
    expect(reveal).not.toContain(ETA_NAME);
    // And the reader is told where it went, because a sentence that simply omitted an axis would
    // read as a board with no dispatcher.
    expect(reveal).toContain('The rows differ on the dispatcher');
    expect(reveal).toContain('named on each row');
  });

  it('agrees per axis exactly when it agrees over the whole key — the two definitions, pinned', () => {
    /*
     * `agreed` is measured on `configKeyOf`'s six fields and the axis table is measured field by
     * field, and nothing but this holds them together: an axis added to the table and forgotten in
     * the key (or the reverse) would make the screen speak about something the board never checked.
     */
    for (const rows of [
      [ROW, OTHER_ROW],
      [ROW, ETA_ROW],
      [ROW, { ...ROW, buildingId: 'garden-apartments' }],
      [ROW, { ...ROW, demandTemplateId: 'office-day' }],
      [ROW, { ...ROW, arrivalRatePctPop5min: null }],
      [ROW, { ...ROW, durationS: 900 }],
      [ROW, { ...ROW, windowStartS: 1800 }],
      [ROW],
    ]) {
      const configuration = boardConfigurationOf(rows, CATALOGUE);
      expect(configuration.agreed).toBe(configuration.varying.length === 0);
      expect(configuration.shared.length + configuration.varying.length).toBe(5);
    }
  });

  it('tells two run lengths apart even when they wear the same part label', () => {
    /*
     * *Part of the day* is drawn from `windowStartS` **and** `durationS`, and the label is drawn
     * from the template. So agreement has to be measured on the pair: a version comparing labels
     * would call these two rows agreed and print a part neither of them ran for.
     */
    const configuration = boardConfigurationOf([ROW, { ...ROW, durationS: 900 }], CATALOGUE);
    expect(configuration.varying).toEqual(['Part of the day']);
    expect(boardRevealOf(configuration)).not.toContain('Part of the day:');
  });

  it('says nothing about a board whose rows share nothing, and says why', () => {
    // A personal log's shape: whatever that player ran, in one place (§ D439).
    const configuration = boardConfigurationOf(
      [ROW, { ...ETA_ROW, buildingId: 'garden-apartments', demandTemplateId: 'office-day', arrivalRatePctPop5min: null, durationS: 3600, windowStartS: 0 }],
      CATALOGUE,
    );
    expect(configuration.shared).toEqual([]);
    expect(boardRevealOf(configuration)).toBeUndefined();
    expect(boardRevealRefusalOf(configuration)).toContain('share no part of what they ran');
  });

  it('names an empty page as nothing to say rather than as rows that disagree', () => {
    /*
     * It used to answer the disagreement refusal here, which was a claim about rows that do not
     * exist — an open board with nothing posted to it is a state `dev/menuPanel.ts` draws in words.
     */
    const configuration = boardConfigurationOf([], CATALOGUE);
    expect(configuration.agreed).toBe(false);
    expect(boardRevealOf(configuration)).toBeUndefined();
    expect(boardRevealRefusalOf(configuration)).toBeUndefined();
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

/* -------------------------------------------------------------------------- *
 * The screen, not the sentence — GitHub issue #316
 * -------------------------------------------------------------------------- */

/**
 * The leaderboard as a player meets it, with a board open.
 *
 * Driven through `screenOf` rather than through {@link boardRevealOf} alone, because the claim under
 * test spans the two: the reveal *promises* that what the rows differ on is named on each row, and
 * only the screen can keep that promise. A sentence promising a disclosure a later edit removed
 * would be § D227's stale refusal with its polarity reversed — a claim that something is said, in a
 * place where it is not.
 */
function leaderboardWith(runs: readonly RunSubmission[]): MenuScreenView {
  const entries: readonly BoardEntry[] = runs.map((run, index) => ({
    id: `entry-${String(index)}`,
    displayName: `Player ${String(index)}`,
    run,
    // What the row was measured against — never the board it is on (`ENGINE_CONTRACT.md` § 12.1).
    dataHash: 'abcdef0123456789',
    measured: { awtS: 24.6, wt95S: 51.2, ttdMeanS: 63.4, pctOverLongWait: 8.1, awtIsValid: true },
    submittedAtMs: 0,
  }));
  return screenOf({
    state: { ...initialMenuState(CATALOGUE), screen: 'leaderboard' },
    catalogue: CATALOGUE,
    canPost: true,
    hasRun: true,
    boards: [{ boardKey: 'daily:2026-09-01', entries: entries.length }],
    boardPage: {
      boardKey: 'daily:2026-09-01',
      metric: 'awtS',
      note: 'Ranked on the named metric alone. The others are shown beside it and never combined.',
      entries,
    },
  });
}

/** The per-row controls, in board order. */
function beatRows(view: MenuScreenView): readonly MenuAffordance[] {
  return view.rows.filter((row) => row.id.startsWith('leaderboard.beat.'));
}

/** The nth per-row control, or a failure that names what was missing rather than a `TypeError`. */
function beatRowAt(view: MenuScreenView, index: number): MenuAffordance {
  const row = beatRows(view)[index];
  if (row === undefined) throw new Error(`the board drew no row at index ${String(index)}`);
  return row;
}

/**
 * Every word one row puts in front of a reader, including the refused arm.
 *
 * `disabledWhy` is in it because `dev/menuPanel.ts` draws that **instead of** the detail on a
 * disabled row, so a test reading only `detail` would pass over the rows where this build cannot
 * name what it is refusing.
 */
function rowText(row: MenuAffordance): string {
  return `${row.label} ${row.detail ?? ''} ${row.disabledWhy ?? ''}`;
}

describe('a mixed daily board reads as a comparison', () => {
  it('names the shared axes above the table and the dispatcher on each row', () => {
    const view = leaderboardWith([ROW, ETA_ROW]);
    const notices = view.notices.join(' ');

    // (a) The axes the rows do agree on are named, once, where a claim about the board belongs.
    expect(notices).toContain('Midtown Office');
    expect(notices).toContain('3 % of population per 5 min');

    // (b) The dispatcher is on the rows and on **neither** notice: it is per row, not once.
    expect(notices).not.toContain(COLLECTIVE_NAME);
    expect(notices).not.toContain(ETA_NAME);
    expect(beatRows(view)).toHaveLength(2);
    expect(rowText(beatRowAt(view, 0))).toContain(COLLECTIVE_NAME);
    expect(rowText(beatRowAt(view, 0))).not.toContain(ETA_NAME);
    expect(rowText(beatRowAt(view, 1))).toContain(ETA_NAME);
    expect(rowText(beatRowAt(view, 1))).not.toContain(COLLECTIVE_NAME);
  });

  it('names it once and on no row when every row shares it — the negative control', () => {
    /*
     * Without this, a change that simply printed the dispatcher on every row always would pass the
     * test above while making the agreed board say the same thing three times. The rule is *once or
     * per row*, and a rule with only one direction tested is half a rule.
     */
    const view = leaderboardWith([ROW, OTHER_ROW]);
    expect(view.notices.join(' ')).toContain(COLLECTIVE_NAME);
    for (const row of beatRows(view)) expect(rowText(row)).not.toContain(COLLECTIVE_NAME);
  });

  it('withdraws the seed-luck note from a board that is not one dispatcher', () => {
    /*
     * `BEATING_NOTE` says *every one of them is that same dispatcher … which is luck rather than
     * skill*. That is true of a board whose rows agree and false of the one this issue is about, and
     * its gate used to be *did the reveal say anything* — the same gate only while the reveal was
     * silent on every mixed board.
     */
    expect(leaderboardWith([ROW, OTHER_ROW]).notices).toContain(BEATING_NOTE);
    expect(leaderboardWith([ROW, ETA_ROW]).notices).not.toContain(BEATING_NOTE);
  });

  it('marks a row whose dispatcher this build does not carry, rather than leaving it blank', () => {
    /*
     * The two halves of a mixed board that a CDN-served viewer will actually meet (§ D308): one row
     * this build can name and one it cannot. The unnamed one is still identified — by the id the
     * server verified — because a row with nothing where the other rows carry a dispatcher reads as
     * a row that ran none.
     */
    const view = leaderboardWith([ROW, { ...ROW, dispatcherProfileId: 'predictive-x' }]);
    expect(rowText(beatRowAt(view, 1))).toContain('predictive-x');
    expect(rowText(beatRowAt(view, 1))).toContain('not in this build');
    // It is refused as well as named: this build cannot reproduce a run it cannot resolve.
    expect(beatRowAt(view, 1).enabled).toBe(false);
  });

  it('says the row’s own configuration is what a press loads, because it is', () => {
    /*
     * The line under the control read *"loads this board's configuration with this row's own
     * seed"*, and `selectionFromRun` has always taken **every** field from the row. The two were one
     * sentence while a board was a configuration; on a mixed board the old wording named the wrong
     * subject in the place a player is most likely to act on it.
     */
    const variation = rowVariationOf(ETA_ROW, boardConfigurationOf([ROW, ETA_ROW], CATALOGUE), CATALOGUE);
    expect(beatDetailOf(ETA_ROW, variation)).toContain(`Dispatcher: ${ETA_NAME}`);
    expect(beatDetailOf(ETA_ROW, variation)).toContain('this row’s own configuration');
    expect(beatDetailOf(ROW)).not.toContain('this board’s configuration');
    // And the press still produces that row's run, which is the assertion the legs make below.
    expect(selectionFromRun(ETA_ROW).dispatcherProfileId).toBe('eta');
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
