/**
 * **Move the control and require the run to change** — pointed at the menu's own transport.
 *
 * ## The defect this file is written against
 *
 * A `select` affordance is built before anybody picks anything, so its {@link MenuAffordance.intent}
 * has to carry the value the row is *currently* showing — that is what puts the right option in the
 * box. Dispatching that same intent on `change` therefore writes back what was already there. The
 * rewrite that turns *the intent this row is showing* into *the intent the player just asked for*
 * lived in `dev/menuPanel.ts` as a ternary naming two of the six intents that carry a chosen value:
 *
 * ```ts
 * row.intent.kind === 'set-free-play' || row.intent.kind === 'set-setting' ? { ...row.intent, value } : row.intent
 * ```
 *
 * The other four — `set-calendar`, `set-commissioning`, `set-constraint`, `set-challenge` — fell
 * into the fallback arm and dispatched a no-op. Measured in a browser before the fix: the Calendar
 * select read `''` before choosing *Vacation week* and `''` after it (GitHub issue #44), and
 * `main — shafts` read `2`, was set to `1`, and read `2` again (issue #42).
 *
 * ## Why the checks below are derived and not listed
 *
 * `withChosenValue`'s pass-through arm is a hand-written list of fourteen intent kinds, and a
 * hand-written list is the exact shape this repository keeps finding stale — § D213 says so about
 * five of them at once. So nothing here trusts it. Every assertion walks `screenOf` over
 * {@link MENU_SCREENS} under the arms that actually populate the interesting screens, takes the
 * `select`, `toggle` and `text` rows it finds, and requires that **choosing a different option
 * produces a different intent**. A seventh control filed into the pass-through arm fails on the
 * screen it was added to, without anybody having to remember this file exists.
 *
 * ## And the last two go all the way to the legs
 *
 * `docs/12` § 5 clause 9 and § D177: *move the control and require the run to change, compared on
 * the legs rather than on a window statistic.* An intent that carries the right string is not yet a
 * run that differs, and the two failures look identical from the panel. So the calendar and the
 * fabric are each driven from the affordance the player presses through to `legsOf`, which builds
 * the run the way `dev/main.ts#runShift` builds it.
 *
 * Those two cases reproduce two arms of the shell's own switch, and that is stated rather than
 * hidden: this lane does not own `dev/main.ts`, so the three lines between *the intent* and *the
 * `ViewerState` field* are written out here with the arm they mirror named beside them. It is the
 * one seam in this file that a change to the shell could invalidate silently, and the honest place
 * to say so is next to it.
 */

import { describe, expect, it } from 'vitest';

import { asBuiltChoices, movedChoiceText, withBankChoice } from '../commissioning/choices.js';
import { reviewCommissioning } from '../commissioning/refusals.js';
import {
  CONSTRAINTS,
  commissionableClasses,
  constraintById,
  type CommissioningChoices,
} from '../commissioning/types.js';
import { shaftChoices, speedChoices } from '../commissioning/choices.js';
import { buildingConfigOf } from '../dev/state.js';
import { CALENDAR_PERIODS, periodOnDays, type CalendarPeriodId } from '../shift/calendar.js';
import { HISTORY_DAYS } from '../shift/week.js';
import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';

import { catalogueOf } from './catalogue.js';
import { freePlayIssues, initialMenuState } from './menu.js';
import {
  applyIntent,
  screenOf,
  withChosenValue,
  type ChallengeScreenInput,
  type CommissioningScreenInput,
  type MenuAffordance,
  type MenuIntent,
  type MenuScreenView,
  type MenuViewInput,
} from './screens.js';
import { MENU_SCREENS, type MenuScreen, type MenuState } from './types.js';

const CATALOGUE = catalogueOf(RESOURCES);

/* -------------------------------------------------------------------------- *
 * The arms
 * -------------------------------------------------------------------------- */

/**
 * The fabric screen's input, from the shipped `midtown-office` under the loosest constraint.
 *
 * `new-build` opens every dimension, so this is the arm with the most enabled controls and the most
 * offered options — the one where a select that drops its choice has somewhere to show. Without it
 * the `commissioning` screen renders its *no building loaded* fallback, which offers one navigate
 * row and would have made every assertion below vacuous on the screen issue #42 is about.
 */
function commissioningArm(): CommissioningScreenInput {
  const building = RESOURCES.buildings.find((entry) => entry.id === 'midtown-office')?.config;
  if (building === undefined) throw new Error('midtown-office is not loaded');
  const classes = commissionableClasses(RESOURCES.elevatorSpecs);
  const choices = asBuiltChoices(building, classes);
  const constraint = constraintById('new-build') ?? CONSTRAINTS[0];
  if (constraint === undefined) throw new Error('no constraints ship');
  return {
    buildingName: building.name,
    constraintId: constraint.id,
    choices,
    review: reviewCommissioning({
      base: building,
      choices,
      classes,
      specs: RESOURCES.elevatorSpecs,
      constraint,
    }),
    optionsFor: (bankId) => {
      const choice = choices.find((entry) => entry.bankId === bankId);
      const machineClass = classes.find((entry) => entry.id === choice?.machineClassId);
      return {
        shafts: shaftChoices(choice?.shafts ?? 1).map((n) => ({ id: String(n), name: String(n) })),
        machineClass: classes.map((entry) => ({ id: entry.id, name: entry.name })),
        ratedSpeed: speedChoices(machineClass).map((speed) => ({
          id: String(speed),
          name: `${speed.toFixed(2)} m/s`,
        })),
      };
    },
  };
}

/**
 * A challenge, as the server would have answered — so the `challenge` screen renders its two selects.
 *
 * Without it that screen draws its *this build was not compiled against a server* fallback, which
 * offers one navigate row: `set-challenge` would then never be walked, which is exactly the reason
 * it was one of the four broken transports nothing noticed. Transcribed from `menu/challenge.test.ts`'s
 * own fixture rather than fetched, for the reason that file gives: this tier has no server.
 */
function challengeArm(): ChallengeScreenInput {
  return {
    view: {
      challenge: {
        id: 'midtown-morning-0',
        name: 'Midtown, morning rush',
        brief: 'Fifteen minutes of Midtown Office under a rise-and-fall morning peak.',
        config: {
          buildingId: 'midtown-office',
          demandTemplateId: 'rise-and-fall',
          arrivalRatePctPop5min: 3,
          durationS: 900,
        },
        seeds: ['1001', '1002', '1003', '1004', '1005'],
        opensAtMs: 1_754_179_200_000,
        closesAtMs: 1_754_784_000_000,
      },
      state: 'open',
      seedCount: 5,
      opensInMs: null,
      closesInMs: 86_400_000,
      clockNote: 'Which challenge is open is decided by the server.',
      dataHash: 'abcdef0123456789abcdef0123456789',
      compare: {
        note: 'Compare answers the question a board cannot.',
        buildingId: 'midtown-office',
        demandTemplateId: 'rise-and-fall',
        arrivalRatePctPop5min: 3,
        durationS: 900,
      },
    },
    runsDone: 5,
  };
}

const ARM: Omit<MenuViewInput, 'state'> = {
  catalogue: CATALOGUE,
  canPost: true,
  hasRun: true,
  calendarPeriodId: '',
  commissioning: commissioningArm(),
  challenge: challengeArm(),
};

const stateAt = (screen: MenuScreen): MenuState => ({ ...initialMenuState(CATALOGUE), screen });

const rowsOn = (screen: MenuScreen): readonly MenuAffordance[] =>
  screenOf({ ...ARM, state: stateAt(screen) }).rows;

/** Every row on every screen that a player chooses a value on rather than merely pressing. */
function valueRows(): readonly { readonly screen: MenuScreen; readonly row: MenuAffordance }[] {
  return MENU_SCREENS.flatMap((screen) =>
    rowsOn(screen)
      .filter((row) => row.kind === 'select' || row.kind === 'toggle' || row.kind === 'text')
      .map((row) => ({ screen, row })),
  );
}

/**
 * Whether an intent carries a given string anywhere on it.
 *
 * Deliberately structural rather than a lookup of *which field this kind puts its value in*. A
 * lookup would be a second copy of {@link withChosenValue}'s own table, so a wrong entry in one
 * would be a wrong entry in both and the check would agree with the defect.
 */
const carries = (intent: MenuIntent, value: string): boolean =>
  Object.values(intent).some((field) => field === value);

/* -------------------------------------------------------------------------- *
 * The transport
 * -------------------------------------------------------------------------- */

describe('choosing an option produces an intent about that option — issues #44 and #42', () => {
  it('rewrites every select on every screen, for every option it offers', () => {
    for (const { screen, row } of valueRows()) {
      if (row.kind !== 'select') continue;
      for (const option of row.options ?? []) {
        const asked = withChosenValue(row.intent, option.id);
        expect(
          carries(asked, option.id),
          `${screen}/${row.id} dispatches an intent that does not mention "${option.id}" — the ` +
            'player picked one option and the menu asked for another',
        ).toBe(true);
        if (option.id === row.value) continue;
        expect(
          asked,
          `${screen}/${row.id} dispatches the value already showing when "${option.id}" is chosen. ` +
            'That is a no-op by construction: the control moves and the run does not.',
        ).not.toEqual(row.intent);
      }
    }
  });

  it('rewrites toggles and text rows the same way', () => {
    for (const { screen, row } of valueRows()) {
      if (row.kind === 'select') continue;
      const other = row.kind === 'toggle' ? (row.value === 'on' ? 'off' : 'on') : 'a-typed-value';
      const asked = withChosenValue(row.intent, other);
      expect(carries(asked, other), `${screen}/${row.id} drops what was typed or toggled`).toBe(true);
    }
  });

  it('leaves an intent that carries no chosen value exactly as it was', () => {
    /*
     * The other direction, and the reason the rewrite is a switch rather than a spread. A `navigate`
     * that quietly acquired the id of whatever option sat beside it would be worse than an inert
     * control: it would go somewhere nobody asked for.
     */
    const navigate: MenuIntent = { kind: 'navigate', to: 'settings' };
    expect(withChosenValue(navigate, 'free-play')).toEqual(navigate);
    expect(withChosenValue({ kind: 'start' }, 'anything')).toEqual({ kind: 'start' });
  });

  it('is not vacuous — the walk really reaches all six intents that carry a value', () => {
    /*
     * Without this, every assertion above could pass over a graph in which only `set-free-play` and
     * `set-setting` were ever reached, which is precisely the coverage the broken transport had:
     * `playthrough/walk.test.ts` skips any row whose intent is not one of those two, so the four
     * that were broken were the four nothing walked.
     */
    const kinds = new Set(valueRows().map(({ row }) => row.intent.kind));
    expect([...kinds].sort()).toEqual([
      'set-calendar',
      'set-challenge',
      'set-commissioning',
      'set-constraint',
      'set-free-play',
      'set-setting',
    ]);
  });

  it('reaches the option lists it is walking, on the screens the issues name', () => {
    // A second non-vacuity guard, on the two screens that were reported dead. A `commissioning` arm
    // that fell back to *no building loaded* would offer one navigate row and pass everything above.
    const calendar = rowsOn('campaign').find((row) => row.id === 'campaign.calendar');
    expect(calendar?.options?.length ?? 0).toBeGreaterThan(1);
    const fabric = rowsOn('commissioning').filter((row) => row.kind === 'select');
    expect(fabric.length).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- *
 * All the way to the legs — § D177, `docs/12` § 5 clause 9
 * -------------------------------------------------------------------------- */

describe('the repaired controls change the run, compared on the legs', () => {
  it('a calendar period picked in the menu changes who turns up — issue #44', () => {
    /*
     * The chain, end to end: the affordance the player presses, the intent the transport produces,
     * the `ViewerState` the shell writes from it, and the legs the run then has.
     *
     * The middle step is `dev/main.ts`'s `set-calendar` arm, reproduced in two lines because this
     * lane does not own that file:
     *
     *     const period = CALENDAR_PERIODS[intent.periodId as CalendarPeriodId];
     *     state = { ...state, calendar: period === undefined ? null : periodOnDays(period, 1, HISTORY_DAYS) };
     *
     * Legs and not a mean, for § D177's reason: a mean can be unchanged for a run that is entirely
     * different, and can move because the window moved.
     */
    const row = rowsOn('campaign').find((entry) => entry.id === 'campaign.calendar');
    expect(row, 'the Scenarios screen no longer offers a Calendar').toBeDefined();
    const vacation = (row?.options ?? []).find((option) => option.id !== '');
    expect(vacation, 'the Calendar offers nothing but an ordinary week').toBeDefined();

    const asked = withChosenValue(row?.intent ?? { kind: 'back' }, vacation?.id ?? '');
    expect(asked.kind).toBe('set-calendar');
    const periodId = asked.kind === 'set-calendar' ? asked.periodId : '';
    expect(periodId, 'the intent still names the period that was already on').toBe(vacation?.id);

    const period = CALENDAR_PERIODS[periodId as CalendarPeriodId] as
      | (typeof CALENDAR_PERIODS)[CalendarPeriodId]
      | undefined;
    expect(period, `no shipped period is called "${periodId}"`).toBeDefined();
    const ordinary = baseState();
    const chosen = {
      ...ordinary,
      calendar: period === undefined ? null : periodOnDays(period, 1, HISTORY_DAYS),
    };
    expect(
      legsOf(chosen),
      'the Calendar was moved and the run produced the same legs — the control is inert',
    ).not.toBe(legsOf(ordinary));
  });

  it('a fabric dimension picked in the menu changes the run — issue #42', () => {
    /*
     * The same chain on the other reported screen, and the shell arm it mirrors is `set-commissioning`:
     *
     *     const choices = state.commissioning.length === 0 ? asBuiltChoices(authored, classes) : state.commissioning;
     *     state = { ...state, commissioning: withBankChoice(choices, next) };
     */
    const shafts = rowsOn('commissioning').find((row) => row.id.endsWith('.shafts'));
    expect(shafts, 'the fabric screen offers no shaft count').toBeDefined();
    const wanted = (shafts?.options ?? []).find((option) => option.id !== shafts?.value);
    expect(wanted, 'the shaft ladder offers only the count already built').toBeDefined();

    const asked = withChosenValue(shafts?.intent ?? { kind: 'back' }, wanted?.id ?? '');
    expect(asked.kind).toBe('set-commissioning');
    if (asked.kind !== 'set-commissioning') throw new Error('unreachable');
    expect(asked.value, 'the intent still names the shaft count already built').toBe(wanted?.id);

    /*
     * **Midtown at 1 800 s, and the cell is measured rather than convenient.** `probes.test-helper.ts`
     * records why, having hit it: *"Garden Apartments produces 20 legs at that length and two
     * hydraulic cars answer every one, so a third car is never assigned and the probe would report a
     * live control dead"* — `docs/10` § 0's M1 (*one building where nothing you change makes any
     * difference*) arriving at a control instead of at a slider. This test hit it too, on the first
     * run, and moved rather than lowering the bar.
     */
    const state = { ...baseState(), buildingId: 'midtown-office', shiftLengthS: 1800 };
    const authored = buildingConfigOf(RESOURCES, state.savedBuildings, state.buildingId);
    if (authored === undefined) throw new Error(`no building "${state.buildingId}"`);
    const classes = commissionableClasses(RESOURCES.elevatorSpecs);
    const built = asBuiltChoices(authored, classes);
    const current = built.find((choice) => choice.bankId === authored.banks[0]?.id);
    if (current === undefined) throw new Error('the building has no bank to commission');
    const moved: CommissioningChoices = withBankChoice(built, {
      ...current,
      shafts: current.shafts + 1,
    });

    expect(
      legsOf({ ...state, commissioning: moved }),
      'a shaft was added and the run produced the same legs — the fabric never reached it',
    ).not.toBe(legsOf({ ...state, commissioning: built }));
  });
});

/* -------------------------------------------------------------------------- *
 * The root says which rows need a server — GitHub issue #28
 * -------------------------------------------------------------------------- */

const rootWith = (hasServer: boolean | undefined): readonly MenuAffordance[] =>
  screenOf({ ...ARM, hasServer, state: stateAt('main') }).rows;

/** The three that dead-end without one, and the three that do not. `docs/16`'s own split. */
const SOCIAL = ['main.challenge', 'main.leaderboard', 'main.account'];
const LOCAL = ['main.campaign', 'main.free-play', 'main.settings'];

describe('the root menu says which rows need a server', () => {
  it('marks the three social rows and leaves the other three alone', () => {
    /*
     * Issue #28: *"all three dead-end … The main menu gives no hint of this. The rows are styled
     * exactly like the working ones and carry confident subtitles."* The signal belongs on the root
     * because that is where the choice is made, and the root is the one screen that knows nothing
     * about any of them — so it has to be told.
     */
    const rows = rootWith(false);
    for (const id of SOCIAL) {
      const row = rows.find((entry) => entry.id === id);
      expect(row?.detail ?? '', `${id} dead-ends and says nothing about why`).toContain('needs a server');
    }
    for (const id of LOCAL) {
      const row = rows.find((entry) => entry.id === id);
      expect(row?.detail ?? '', `${id} does not need a server and claims it does`).not.toContain(
        'needs a server',
      );
    }
  });

  it('leaves every row alone when there is a server', () => {
    for (const row of rootWith(true)) {
      expect(row.detail ?? '', `${row.id} warns about a server this build has`).not.toContain(
        'needs a server',
      );
    }
  });

  it('says nothing at all when nobody has said — the honest default', () => {
    /*
     * `undefined` is *nobody has answered*, not *no server*. Only the shell can answer it: the origin
     * is a `<meta>` tag read at run time, so the same bytes are a connected build behind a server and
     * an unconnected one behind a CDN. A menu that guessed would put a false refusal on a working
     * deployment, which is worse than the silence it replaced.
     */
    expect(rootWith(undefined).map((row) => row.detail ?? '')).toEqual(
      rootWith(true).map((row) => row.detail ?? ''),
    );
  });

  it('keeps every row reachable — the signal is a sentence, never a locked door', () => {
    // #28 offers three remedies and this is the third with the second's honesty. All three screens
    // teach their subject with the server off, so disabling them would hide the only thing they can
    // still do — and a player who cannot open the challenge screen cannot read what a challenge is.
    for (const row of rootWith(false)) expect(row.enabled, row.id).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * The design phase can be finished — GitHub issue #48
 * -------------------------------------------------------------------------- */

describe('the commissioning screen can be committed, cancelled and read', () => {
  const fabricScreen = (over: CommissioningScreenInput): MenuScreenView =>
    screenOf({ ...ARM, commissioning: over, state: stateAt('commissioning') });

  /** The shipped arm, with one bank's shafts moved — a fabric that is definitely not as built. */
  function movedArm(): CommissioningScreenInput {
    const building = RESOURCES.buildings.find((entry) => entry.id === 'midtown-office')?.config;
    if (building === undefined) throw new Error('midtown-office is not loaded');
    const classes = commissionableClasses(RESOURCES.elevatorSpecs);
    const built = asBuiltChoices(building, classes);
    const first = built[0];
    if (first === undefined) throw new Error('midtown-office has no bank');
    const choices = withBankChoice(built, { ...first, shafts: first.shafts + 1 });
    const constraint = constraintById('new-build') ?? CONSTRAINTS[0];
    if (constraint === undefined) throw new Error('no constraints ship');
    return {
      ...commissioningArm(),
      choices,
      review: reviewCommissioning({
        base: building,
        choices,
        classes,
        specs: RESOURCES.elevatorSpecs,
        constraint,
      }),
    };
  }

  it('offers a commit, and it is what takes the fabric into the week', () => {
    /*
     * Issue #48. Every dropdown on this screen already wrote `ViewerState.commissioning` on the
     * pick (§ D248), so the fabric was live — and the screen still had no way to say *I am done*.
     * A design phase you cannot leave deliberately is one whose result arrives by accident, on
     * whichever run happens next.
     */
    const commit = fabricScreen(commissioningArm()).rows.find((row) => row.id === 'commissioning.commit');
    expect(commit, 'the fabric screen still has no way to finish').toBeDefined();
    expect(commit?.intent).toEqual({ kind: 'commit-commissioning' });
  });

  it('refuses the commit in words when the review refuses the configuration', () => {
    /*
     * The refusal belongs beside the **verb**, and it is a different sentence from the ones beside
     * the controls: each select's own `disabledWhy` says what is wrong with that dimension, and
     * this says why the configuration as a whole may not open a week — a claim no single select can
     * make. `retrofit` opens nothing, so every move is out of scope and the review refuses.
     */
    const arm = movedArm();
    const building = RESOURCES.buildings.find((entry) => entry.id === 'midtown-office')?.config;
    if (building === undefined) throw new Error('midtown-office is not loaded');
    const classes = commissionableClasses(RESOURCES.elevatorSpecs);
    const retrofit = constraintById('retrofit');
    if (retrofit === undefined) throw new Error('retrofit does not ship');
    const refused: CommissioningScreenInput = {
      ...arm,
      constraintId: retrofit.id,
      review: reviewCommissioning({
        base: building,
        choices: arm.choices,
        classes,
        specs: RESOURCES.elevatorSpecs,
        constraint: retrofit,
      }),
    };
    const commit = fabricScreen(refused).rows.find((row) => row.id === 'commissioning.commit');
    expect(commit?.enabled, 'a refused configuration can still open a week').toBe(false);
    expect(commit?.disabledWhy ?? '', 'the commit refuses in silence').not.toBe('');
  });

  it('offers a cancel only once something has moved — S7', () => {
    // A cancel that is always available on a screen where nothing has changed is a control whose
    // press changes nothing, which is the defect this repository counts.
    const untouched = fabricScreen(commissioningArm()).rows.find((row) => row.id === 'commissioning.reset');
    expect(untouched?.enabled, 'a fabric nobody moved offers something to put back').toBe(false);
    expect(untouched?.disabledWhy ?? '').not.toBe('');

    const moved = fabricScreen(movedArm()).rows.find((row) => row.id === 'commissioning.reset');
    expect(moved?.enabled, 'a moved fabric cannot be put back').toBe(true);
    expect(moved?.intent).toEqual({ kind: 'reset-commissioning' });
  });

  it('previews what would be built, in the diff commissioning/ already computed', () => {
    /*
     * The preview is `CommissioningReview.moved` through `movedChoiceText` — the sentence that
     * module already writes for one moved dimension. Nothing is re-derived: a preview that
     * recomputed *what changed* would be a second answer to a question `refusals.ts` has answered,
     * and the two would disagree the day a fourth dimension lands.
     */
    const arm = movedArm();
    const said = fabricScreen(arm).notices.join(' ');
    expect(arm.review.moved.length, 'this arm moves nothing, so the preview has nothing to say').toBeGreaterThan(0);
    for (const moved of arm.review.moved) {
      expect(said, `the preview omits ${moved.id}`).toContain(movedChoiceText(moved));
    }
  });

  it('says nothing at all about what a change would buy — R2', () => {
    /*
     * The line the preview may not cross. This screen has simulated nothing, so it has measured
     * nothing, and a preview that ranked two fabrics off no replications would be exactly the
     * confident nonsense CLAUDE.md's statistical discipline is written against. Every clause is a
     * statement of what the hardware **would be**.
     *
     * ## Scoped to the preview line, and the reason is a real sentence it would otherwise flag
     *
     * The first draft swept every notice on the screen and went red on the capital legend's *"more
     * shafts, **faster** cars and a taller-rated class each commit more"* (§ D230 § #24). That
     * sentence is about **price** — it interpolates `CAPITAL_UNITS_PER_MPS` and says what a choice
     * costs, which is the one comparison this screen is allowed to make. Sweeping it would have
     * been a check that could only pass by deleting a true statement, so the sweep is narrowed to
     * the line this change authored rather than the rule being loosened.
     */
    const preview = fabricScreen(movedArm())
      .notices.filter((line) => line.includes('would be commissioning'))
      .join(' ')
      .toLowerCase();
    expect(preview, 'there is no preview line to sweep').not.toBe('');
    for (const word of ['faster', 'better', 'improve', 'worse', 'recommend', 'should choose']) {
      expect(preview, `the preview says "${word}" about a fabric nothing has run`).not.toContain(word);
    }
  });

  it('explains what the screen is for before it explains what the number is not', () => {
    // Issue #48's design brief. #24 reported three questions this screen knew the answers to and
    // printed none of; this is the fourth — *what am I choosing between?* A player who does not
    // know what a machine class is cannot act on a sentence about capital units.
    const notices = fabricScreen(commissioningArm()).notices;
    expect(notices[0] ?? '', 'the screen still opens on the capital caveat').toContain('shafts');
    expect(notices.join(' ')).toContain('machine class');
  });

  it('carries no capital figure into the preview — the limit is stated once', () => {
    /*
     * `commissioning/types.ts`'s whole argument: a currency shown twice starts reading like the
     * thing being optimised. The figure lives in `review.sentence`, in one place, and the preview
     * repeats neither number.
     */
    const arm = movedArm();
    const preview = fabricScreen(arm).notices.filter((line) => line.includes('would be commissioning'));
    expect(preview.length, 'there is no preview line to check').toBe(1);
    for (const figure of [String(arm.review.capitalUnits), String(arm.review.budgetUnits)]) {
      expect(preview[0] ?? '', `the preview restates ${figure}`).not.toContain(figure);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The root is not a one-way door — GitHub issue #40
 * -------------------------------------------------------------------------- */

describe('the root offers a way out that is not a mode being entered', () => {
  const rootRunning = (hasRun: boolean): readonly MenuAffordance[] =>
    screenOf({ ...ARM, hasRun, state: stateAt('main') }).rows;

  it('carries a Resume that asks the shell to close the menu', () => {
    /*
     * Issue #40. The root is the one screen with no `back`, so before this it offered six
     * navigations and no exit: a player who pressed **Menu** over a running shift to check a setting
     * had to *start something* to get back to the shift they were already watching.
     */
    const resume = rootRunning(true).find((row) => row.id === 'main.resume');
    expect(resume, 'the root menu still has no way out').toBeDefined();
    expect(resume?.enabled).toBe(true);
    expect(resume?.intent).toEqual({ kind: 'close' });
  });

  it('refuses in words when there is no shift behind the menu — S7', () => {
    // A *Resume* that closed the overlay onto an empty shell would take the screen away and give
    // nothing back. `MenuAffordance.disabledWhy` is the rule that a refusal is always explained.
    const resume = rootRunning(false).find((row) => row.id === 'main.resume');
    expect(resume?.enabled).toBe(false);
    expect(resume?.disabledWhy ?? '', 'the root’s way out refuses in silence').not.toBe('');
  });

  it('points the refusal the way the rows are actually laid out — GitHub issue #97', () => {
    /*
     * **The word and the order disagreed, and the reporter followed the word.**
     *
     * The refusal said *"pick a scenario or a free-play selection **below**"* while this row is
     * emitted **last**, so there was nothing below it — the panel appends only the how-to-play
     * disclosure after the rows. The two rows the sentence names are the *first two* on the list.
     * `resumeRow`'s own docstring said *"It is first"* over code that has only ever put it last,
     * which is how the sentence survived: the comment agreed with it and the screen did not.
     *
     * **Derived rather than pinned to a word.** The expected direction comes from the row order, so
     * moving the row demands the other word rather than quietly leaving this green — which is the
     * failure mode the original sentence is an instance of.
     */
    const rows = rootRunning(false);
    const at = (id: string): number => rows.findIndex((row) => row.id === id);
    const resumeAt = at('main.resume');
    const named = [at('main.campaign'), at('main.free-play')];

    expect(resumeAt, 'the root has no Resume row').toBeGreaterThanOrEqual(0);
    expect(named.every((index) => index >= 0), 'the refusal names a row the root does not have').toBe(
      true,
    );

    const above = named.every((index) => index < resumeAt);
    const refusal = rows[resumeAt]?.disabledWhy ?? '';
    expect(refusal, `the rows it names sit ${above ? 'above' : 'below'} it`).toContain(
      above ? 'above' : 'below',
    );
    expect(refusal, 'the refusal points both ways at once').not.toContain(above ? 'below' : 'above');
  });

  it('is the only row on the root that leaves without choosing anything', () => {
    /*
     * The non-vacuity guard. Every other root row is a `navigate`, and the three commits that close
     * the overlay — Start, Pick a scenario, Keep going — each commit the player to something on a
     * screen further in. A second `close` up here would be two answers to *what does leaving mean*.
     */
    const closers = rootRunning(true).filter((row) => row.intent.kind === 'close');
    expect(closers.map((row) => row.id)).toEqual(['main.resume']);
  });

  it('changes nothing about the menu itself — leaving is the shell’s, not the reducer’s', () => {
    /*
     * `applyIntent` returns the state unchanged, and that is the decision rather than an omission: a
     * reducer that also navigated would be deciding *which screen the menu re-opens on*, which is
     * `reopen`'s answer (the root) and not this one's to give a second time.
     */
    const before = stateAt('settings');
    expect(applyIntent(before, { kind: 'close' }, CATALOGUE)).toBe(before);
  });
});

/* -------------------------------------------------------------------------- *
 * A row says what its intent does — GitHub issue #97
 * -------------------------------------------------------------------------- */

describe('the scenarios screen describes the thing its rows actually do', () => {
  it('does not promise a week that `open-campaign` never starts', () => {
    /*
     * The row read *"Open the doors — Take the current scenario and start the week"*. Nothing
     * starts a week on that path: `applyIntent` returns the state unchanged (asserted below), and
     * `dev/main.ts`'s arm sets `tab: 'scenarios'` and closes the overlay. There is no *current
     * scenario* in `ViewerState` for it to take either — a scenario becomes current by being
     * pressed on the Scenarios surface, where `scenariosPanel.ts#take` restarts the week.
     *
     * The copy moved rather than the behaviour, and the choice was forced: a row that started a
     * week would have to decide **which** scenario from a screen offering no scenario control, so
     * it would either invent a default (a sixth hard-coded list, § D213) or start whichever week
     * the shell was sitting on — which is the *"dropped the player on whatever tab the shell
     * happened to be on"* defect `docs/16` § 5 clause 6 already fixed on this very row.
     *
     * Two tiers, said apart. The first assertion is a **fact about the reducer**; the rest are
     * about the **words**, and words are the weaker half — the shell's arm is `dev/main.ts`'s and
     * this file cannot reach it.
     */
    const before = stateAt('campaign');
    expect(
      applyIntent(before, { kind: 'open-campaign' }, CATALOGUE),
      'the menu layer now starts something on this intent, so the copy below may be too modest',
    ).toBe(before);

    const row = rowsOn('campaign').find((entry) => entry.intent.kind === 'open-campaign');
    expect(row, 'the scenarios screen no longer carries an open-campaign row').toBeDefined();
    const copy = `${row?.label ?? ''} — ${row?.detail ?? ''}`;
    for (const promise of ['start the week', 'starts the week', 'Take the current scenario']) {
      expect(copy, `the row promises "${promise}" and its intent does not deliver one`).not.toContain(
        promise,
      );
    }
    // …and it says where it does go, which is the half that stops the fix being a deletion.
    expect(copy, 'the row no longer names the surface it opens').toContain('Scenarios');
  });

  it('leaves the row that does start something saying so', () => {
    // The control case. `start-endless` really does begin a week, so the vocabulary above is not
    // banned from the screen — it is banned from the row whose intent cannot honour it.
    const endless = rowsOn('campaign').find((entry) => entry.intent.kind === 'start-endless');
    expect(endless, 'the scenarios screen no longer offers Keep going').toBeDefined();
    expect(endless?.kind).toBe('commit');
    expect(`${endless?.label ?? ''} ${endless?.detail ?? ''}`).toContain('week');
  });
});

/* -------------------------------------------------------------------------- *
 * The cold start — GitHub issues #90 and #98, under § D299
 * -------------------------------------------------------------------------- */

/** The root, as a reader of each product meets it. */
const rootIn = (
  viewMode: 'basic' | 'advanced',
  overrides: Partial<MenuViewInput> = {},
): ReturnType<typeof screenOf> => screenOf({ ...ARM, ...overrides, viewMode, state: stateAt('main') });

describe('the root recommends exactly one row, and neither product loses anything for it', () => {
  /**
   * #90's headline, as a property rather than as a row this file names.
   *
   * *"There is no row that says Start here or New? Begin with this. Every option looks like the right
   * answer."* The fix is one recommendation, and **one** is the whole of it: two recommended rows is
   * the reported defect with a smaller `n`, and none is the defect itself.
   */
  it('marks one and only one row as the recommendation, in both products', () => {
    for (const mode of ['basic', 'advanced'] as const) {
      const recommended = rootIn(mode).rows.filter((row) => row.primary === true);
      expect(recommended.map((row) => row.id), `${mode} does not recommend exactly one row`).toEqual([
        'main.start-here',
      ]);
    }
  });

  /**
   * It is **first**, which is the claim `FIRST_VISIT_NOTE` makes to a new player in words.
   *
   * A recommendation below the things it is recommending against is not one. `dev/menuPanel.test.ts`
   * carries the other half — that the guide is drawn directly under it on the page — so between them
   * the welcome's two wayfinding clauses are pinned by the layout rather than by care.
   */
  it('puts it above the rows it is recommending among', () => {
    for (const mode of ['basic', 'advanced'] as const) {
      expect(rootIn(mode).rows[0]?.id, `${mode} does not lead with its recommendation`).toBe(
        'main.start-here',
      );
    }
  });

  /**
   * **§ D299 § 2's constraint, as a test.** *A first run may sequence what a player meets; it may not
   * remove what they can reach.*
   *
   * Derived rather than listed: the assertion is that the root **minus the new row** is byte-identical
   * between the two products and to what it is without a recommendation at all. So a later change that
   * hid the leaderboard from Casual, or renamed a row in one product only, fails here — which is the
   * *"quietly caps what a player can build"* failure § D299 names as the same broken promise wearing a
   * better layout.
   */
  it('adds a door and takes nothing away — the same six rows and Resume, in both products', () => {
    const rest = (mode: 'basic' | 'advanced'): unknown =>
      rootIn(mode)
        .rows.filter((row) => row.id !== 'main.start-here')
        .map((row) => ({ id: row.id, label: row.label, detail: row.detail, intent: row.intent }));
    expect(rest('basic'), 'the two products no longer offer the same rows').toEqual(rest('advanced'));
    // Non-vacuity: there really are rows under the recommendation, and they are the ones #90 lists.
    const ids = rootIn('basic').rows.map((row) => row.id);
    expect(ids).toEqual([
      'main.start-here',
      'main.campaign',
      'main.free-play',
      'main.challenge',
      'main.leaderboard',
      'main.account',
      'main.settings',
      'main.resume',
    ]);
  });

  /**
   * **One door per product**, and each opens the thing its own sentence names.
   *
   * Both intents are members the shell already performs — no new arm, so no member that compiles with
   * nothing behind it. Casual's is `open-campaign`, which the case above proves starts **no** week, so
   * its copy is held to the same ban that row is held to. Engineer's navigates, so the screen it names
   * has to be one that exists.
   */
  it('opens the scenarios board in Casual and Free play in Engineer', () => {
    const casual = rootIn('basic').rows[0];
    expect(casual?.intent).toEqual({ kind: 'open-campaign' });
    // The same ban `campaign.open` is under: this row cannot promise a week its intent never starts.
    const casualCopy = `${casual?.label ?? ''} — ${casual?.detail ?? ''}`;
    for (const promise of ['start the week', 'starts the week', 'starts a week']) {
      expect(casualCopy, `Casual's door promises "${promise}" and open-campaign delivers none`).not.toContain(
        promise,
      );
    }
    expect(casualCopy, 'Casual’s door does not say what it opens').toContain('scenarios board');

    const engineer = rootIn('advanced').rows[0];
    expect(engineer?.intent).toEqual({ kind: 'navigate', to: 'free-play' });
    expect(MENU_SCREENS, 'Engineer’s door navigates to a screen that does not exist').toContain(
      'free-play',
    );
  });

  /**
   * *"six axes, then Start"* is a count, and a count in copy is what goes stale.
   *
   * Derived from the screen it describes rather than believed: the Free play screen's own value rows
   * are counted, and a seventh axis — or a sixth deleted — turns this red on the sentence that names
   * the number. `HOW_TO_PLAY` makes the same claim in *The six things Free play lets you set*, so both
   * are pinned to one derivation.
   */
  it('claims the number of axes Free play actually offers', () => {
    const axes = rowsOn('free-play').filter(
      (row) => row.kind === 'select' || row.kind === 'text',
    ).length;
    expect(axes, 'Free play no longer offers six axes').toBe(6);
    expect(rootIn('advanced').rows[0]?.detail ?? '').toContain('six axes');
  });

  /**
   * The welcome is offered on a stated first visit, and `undefined` says nothing.
   *
   * `hasServer`'s precedent, and the reason is the same one: a caller that has not looked is honestly
   * *nobody has said*, and a menu that greeted a returning player as a new one would be a false claim
   * about them rather than a harmless flourish.
   */
  it('says nothing about a first visit until the shell says it is one', () => {
    expect(rootIn('basic').notices, 'silence is not the default').toEqual([]);
    expect(rootIn('basic', { firstVisit: false }).notices).toEqual([]);
    const welcome = rootIn('basic', { firstVisit: true }).notices;
    expect(welcome.length, 'a stated first visit gets no welcome').toBe(1);
    expect(welcome[0]).toContain('Nothing was restored');
  });

  /** And it belongs to the screen a player lands on, not to every screen behind it. */
  it('keeps the welcome on the root', () => {
    for (const screen of MENU_SCREENS) {
      if (screen === 'main') continue;
      const notices = screenOf({ ...ARM, firstVisit: true, state: stateAt(screen) }).notices;
      expect(
        notices.join(' '),
        `the ${screen} screen welcomes a first-time player it is not the first thing they see`,
      ).not.toContain('Nothing was restored');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * One door, and one question at a time — issues #30 and #31
 * -------------------------------------------------------------------------- */

const accountRowsWith = (
  overrides: Partial<MenuViewInput>,
): readonly MenuAffordance[] =>
  screenOf({ ...ARM, canPost: false, ...overrides, state: stateAt('account') }).rows;

describe('the account screen asks one thing at a time', () => {
  it('offers a link and never a credential when signed out', () => {
    const rows = accountRowsWith({});
    const submit = rows.find((row) => row.id === 'account.submit');
    /*
     * *Sign in* named a mechanism that no longer exists. § D241 made the way in an emailed link, and
     * the label now names what pressing it does — on the one screen where somebody is deciding
     * whether to hand over an address at all.
     */
    expect(submit?.label).toBe('Email me a link');
    expect(rows.map((row) => row.id)).not.toContain('account.sign-out');
  });

  it('asks for a name once the link has been redeemed, and never before', () => {
    /*
     * § D241 § 7. Asking for a display name *beside* the address — only when the address is new —
     * would tell the person filling in the form whether the address is new, which is the
     * account-enumeration oracle the server's identical-bytes 202 exists to close. So the question
     * moves to after the redemption, where the address is already proved.
     */
    const signedOut = accountRowsWith({});
    expect(signedOut.map((row) => row.label)).not.toContain('Save this name');

    const naming = accountRowsWith({ canPost: true, naming: true });
    expect(naming.map((row) => row.label)).toContain('Save this name');
    // And it is asked rather than demanded: a player who would rather not answer can leave.
    expect(naming.map((row) => row.id), 'a naming prompt with no way past it is a gate').toContain(
      'account.sign-out',
    );
  });

  it('has nothing left to ask once a name has been chosen', () => {
    const rows = accountRowsWith({ canPost: true, naming: false });
    expect(rows.map((row) => row.id).filter((id) => id !== 'back')).toEqual(['account.sign-out']);
  });

  it('says why the name is being asked for now, on the screen that asks', () => {
    // A form that appears after somebody thought they were finished reads as a bait-and-switch
    // unless it says why it waited.
    const view = screenOf({ ...ARM, canPost: true, naming: true, state: stateAt('account') });
    expect(view.notices.join(' ')).toContain('without telling anyone whether your address was');
  });

  it('never puts the word for a credential on this screen, in any of its three states', () => {
    // The model half of the account lane's lexical sweep, driven rather than scanned: every string
    // this screen can produce, in all three states, over both arms of `canPost`.
    for (const overrides of [{}, { canPost: true, naming: true }, { canPost: true, naming: false }]) {
      const view = screenOf({ ...ARM, canPost: false, ...overrides, state: stateAt('account') });
      const said = [...view.notices, ...view.issues, ...view.rows.flatMap((row) => [row.label, row.detail ?? ''])];
      expect(said.join(' ').toLowerCase(), JSON.stringify(overrides)).not.toContain('password');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The reducer still agrees with the transport
 * -------------------------------------------------------------------------- */

describe('the two halves of the menu still meet', () => {
  it('applies a rewritten free-play choice to the state the screen then draws', () => {
    /*
     * The pair the transport was already right about, kept as the control case: if this ever fails
     * alongside the four above, the fault is in `applyIntent` rather than in the rewrite.
     *
     * **It named `free-play.duration`, which § D286 deleted**, so every lookup below returned
     * `undefined` and the case asserted `undefined === undefined` — green, and about nothing. Found
     * while threading the catalogue through `applyIntent` for issue #111(b), which is the second
     * time an id in this directory outlived the row it named. The row is now one that exists, and
     * the two `toBeDefined` guards are what stop it going quiet again rather than red.
     */
    const row = rowsOn('free-play').find((entry) => entry.id === 'free-play.building');
    expect(row, 'the free-play screen no longer has a building row under that id').toBeDefined();
    const wanted = (row?.options ?? []).find((option) => option.id !== row?.value);
    expect(wanted, 'only one building ships, so choosing a different one asserts nothing').toBeDefined();

    const next = applyIntent(
      stateAt('free-play'),
      withChosenValue(row?.intent ?? { kind: 'back' }, wanted?.id ?? ''),
      CATALOGUE,
    );
    const after = screenOf({ ...ARM, state: next }).rows.find(
      (entry) => entry.id === 'free-play.building',
    );
    expect(after?.value).toBe(wanted?.id);
  });

  it('re-derives the part of the day when the template moves — GitHub issue #111(b)', () => {
    /*
     * **Not a lag. A value the new select cannot represent, and cannot get out of.**
     *
     * `freePlayPatch` wrote `demandTemplateId` and left `windowStartS`/`durationS` alone. The *Part
     * of the day* row is then rebuilt from `partsFor(catalogue, theNewTemplate)` while its value is
     * still `partIdOf(...)` of the **old** template's part — so no option matched, the browser fell
     * back to its first, and the box and the model disagreed permanently. Permanently, because a
     * native `<select>` fires no `change` for the option it is already showing: the issue's own
     * stated recovery ("re-pick the identical option") is not a recovery a browser offers, and this
     * case deliberately does not use it.
     *
     * Measured on the shipped catalogue rather than a fixture, because the defect was a
     * disagreement between two shipped templates' part lists and a fixture can be authored not to
     * have one: `rise-and-fall` offers exactly `null:1800`, and `office-day` offers none of it.
     */
    const opening = stateAt('free-play');
    const template = rowsOn('free-play').find((entry) => entry.id === 'free-play.template');
    const day = (template?.options ?? []).find((option) => option.id === 'office-day');
    expect(day, 'office-day no longer ships, so this case has nothing to move to').toBeDefined();

    const before = rowsOn('free-play').find((entry) => entry.id === 'free-play.part');
    expect(
      (before?.options ?? []).some((option) => option.id === before?.value),
      'the opening state is already broken, so this case cannot show the fix',
    ).toBe(true);

    const next = applyIntent(
      opening,
      withChosenValue(template?.intent ?? { kind: 'back' }, 'office-day'),
      CATALOGUE,
    );
    const after = screenOf({ ...ARM, state: next }).rows.find(
      (entry) => entry.id === 'free-play.part',
    );

    // The invariant, stated over the row rather than over the two fields: whatever the reducer
    // picked, the select can show it.
    expect(
      (after?.options ?? []).map((option) => option.id),
      'the part select no longer offers the value it is drawn with, so the box shows one part and ' +
        'the model holds another',
    ).toContain(after?.value);
    // …and the selection it landed on is startable, which is the half a player feels.
    expect(freePlayIssues(next.freePlay, CATALOGUE)).toEqual([]);
    // …and it really did move, so this is a re-derivation rather than a value that happened to fit.
    expect(after?.value).not.toBe(before?.value);
  });
});
