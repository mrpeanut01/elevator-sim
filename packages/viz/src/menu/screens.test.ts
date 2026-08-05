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

import { asBuiltChoices, withBankChoice } from '../commissioning/choices.js';
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
import { initialMenuState } from './menu.js';
import {
  applyIntent,
  screenOf,
  withChosenValue,
  type ChallengeScreenInput,
  type CommissioningScreenInput,
  type MenuAffordance,
  type MenuIntent,
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
    // The pair the transport was already right about, kept as the control case: if this ever fails
    // alongside the four above, the fault is in `applyIntent` rather than in the rewrite.
    const row = rowsOn('free-play').find((entry) => entry.id === 'free-play.duration');
    const wanted = (row?.options ?? []).find((option) => option.id !== row?.value);
    const next = applyIntent(stateAt('free-play'), withChosenValue(row?.intent ?? { kind: 'back' }, wanted?.id ?? ''));
    const after = screenOf({ ...ARM, state: next }).rows.find((entry) => entry.id === 'free-play.duration');
    expect(after?.value).toBe(wanted?.id);
  });
});
