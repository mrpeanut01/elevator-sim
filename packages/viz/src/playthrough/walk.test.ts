/**
 * A play-through: every screen reached, every affordance pressed, every option chosen.
 *
 * ## What tier of evidence this is, said before anything else
 *
 * `docs/16` S9 names four: `static sweep < model walk < document recorder < browser`. **This is the
 * second.** It drives the *decisions* — `screenOf` and `applyIntent`, the pure pair `dev/menuPanel.ts`
 * renders — over the whole reachable graph. It does not open a document, because this repository has
 * no browser and [`docs/05`](../../../../docs/05-roadmap.md) says so in terms: *"no Playwright, no
 * Puppeteer, no jsdom."*
 *
 * So a failure here is a real defect and a pass here is **not** a claim that the menu works on a
 * screen. `UX.md` § 27 marks accordingly, and nothing in it is `✅ run`.
 *
 * ## Why a walk rather than a list of cases
 *
 * Because the defects it is looking for are properties of the *graph*, not of a screen. *No dead
 * end*, *back always reaches the root*, *no screen offers a control its mode forbids* — each is
 * false at one node and true everywhere else, and a hand-written case list checks the nodes somebody
 * thought of. The walk enumerates from `MENU_SCREENS` and from each screen's own affordances, so a
 * seventh screen or a new row is covered on the day it lands.
 *
 * ## What it would have caught
 *
 * Three of the eight clauses `docs/16` § 5 names, and it is worth being precise about which, because
 * the others needed a different instrument:
 *
 * - **clause 6** — the campaign screen offered nothing but Back. That is *"every screen offers a way
 *   forward"*, and it is asserted below.
 * - **clause 2 and 3** — Start's intent reaching the shell at all, and the state it produces. The
 *   first is structural (an exhaustive switch over {@link MenuIntent}); the second is
 *   `menu/enterFreePlay.test.ts`, which compares the legs, because *what a run is* is not a question
 *   a navigation walk can answer.
 * - **clauses 5 and 7** — the missing stylesheet and the missing way back are DOM facts, and are
 *   asserted by reading `index.html` in `dev/surfaces.test.ts`. A model walk cannot see them, and
 *   claiming otherwise is exactly what S9 forbids.
 *
 * ## What it did **not** catch, and why — the correction this file has already needed once
 *
 * GitHub issues #42 and #44: four of the six intents that carry a chosen value were dispatched
 * unrewritten, so every Commissioning dropdown and the Calendar were inert on the shipped page. This
 * walk presses every option of every select on every screen and said nothing about any of them.
 *
 * The reason is the one worth carrying forward. The select case **built the intent it pressed with
 * the same expression the panel used** — `row.intent.kind === 'set-free-play' || row.intent.kind ===
 * 'set-setting' ? { ...row.intent, value } : row.intent` — and skipped every row that fell into the
 * fallback. Two copies of one condition can only ever agree, so the four broken transports were
 * precisely the four this file asserted nothing about (§ D248 § 4). *A walk that reproduces the
 * transport cannot measure it*, which is § D183's fixture-shaped failure arriving in a walk.
 *
 * It now presses `menu/screens.ts#withChosenValue` — the shipped transport, exhaustive over
 * `MenuIntent` — and what it skips is decided by {@link REDUCER_OWNS}, a fact about `applyIntent`
 * rather than a restatement of the panel. Watched failing against the old expression before being
 * trusted.
 */

import { describe, expect, it } from 'vitest';

import { catalogueOf } from '../menu/catalogue.js';
import { initialMenuState } from '../menu/menu.js';
import {
  applyIntent,
  screenOf,
  withChosenValue,
  type MenuAffordance,
  type MenuScreenView,
  type CommissioningScreenInput,
  type MenuViewInput,
} from '../menu/screens.js';
import { MENU_SCREENS, type MenuScreen, type MenuState } from '../menu/types.js';
import { asBuiltChoices, shaftChoices, speedChoices } from '../commissioning/choices.js';
import { reviewCommissioning } from '../commissioning/refusals.js';
import { CONSTRAINTS, commissionableClasses, constraintById } from '../commissioning/types.js';
import { permits } from '../scope/permits.js';
import { RESOURCES } from '../scope/probes.test-helper.js';
import type { PlayMode } from '../scope/types.js';

const CATALOGUE = catalogueOf(RESOURCES);

/**
 * The three arms every screen is walked under.
 *
 * Not one. The interesting prose and the interesting refusals live in the states where something is
 * wrong — a broken selection, a player who cannot post, a run that cannot be ranked — and a walk
 * driven only on the happy path leaves every error path unvisited, which is where careless wording
 * and dead controls actually live. `menu/`'s own honesty adapter makes the same argument.
 */
const ARMS: readonly { readonly name: string; readonly input: Omit<MenuViewInput, 'state'> }[] =
  Object.freeze([
    { name: 'signed in, a postable run on screen', input: { catalogue: CATALOGUE, canPost: true, hasRun: true } },
    { name: 'signed out, nothing run yet', input: { catalogue: CATALOGUE, canPost: false, hasRun: false } },
    {
      name: 'signed in, a run that cannot be ranked',
      input: {
        catalogue: CATALOGUE,
        canPost: true,
        hasRun: true,
        rankingRefusal: 'day 7 grows the building and schedules a move-in',
      },
    },
    {
      /*
       * **A fourth arm, because the first three never see the fabric screen.**
       *
       * `MenuViewInput.commissioning` is optional, and every arm above omits it — so the walk
       * rendered the *no building loaded* fallback for `commissioning` on every pass and asserted
       * nothing about the screen a player actually meets. That is the coverage hole this whole
       * directory exists to catch, in the newest screen, produced by the option being optional.
       *
       * The input is built from the real shipped `midtown-office` under `new-build`, which is the
       * constraint that opens every dimension — so this is the arm where the most controls are
       * enabled and the most options are offered, and therefore the one where a broken select or a
       * missing refusal has somewhere to show.
       */
      name: 'a building on the bench, under the loosest constraint',
      input: {
        catalogue: CATALOGUE,
        canPost: false,
        hasRun: false,
        calendarPeriodId: 'quarter-end',
        commissioning: commissioningArm(),
      },
    },
  ]);

/** The fabric screen's input, from the shipped building and the shipped specs. */
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
 * The intent kinds `applyIntent` actually answers, so *the screen reflects it* is a fair question.
 *
 * **Derived from the reducer, not from the panel.** The three it omits — `set-calendar`,
 * `set-commissioning`, `set-constraint` — write `ViewerState` rather than `MenuState` and
 * `applyIntent` returns the state unchanged for them by design, which its own arm says in words. The
 * expression this replaces named `set-free-play` and `set-setting` and was a copy of the *panel's*
 * broken condition, which is why it skipped the four transports that were broken (§ D248 § 4).
 *
 * `set-challenge` is in here and was not in the old list: the reducer has always answered it, and
 * the old expression dropped it for no reason anybody had stated.
 */
const REDUCER_OWNS = new Set(['set-free-play', 'set-setting', 'set-challenge']);

const viewAt = (state: MenuState, arm: (typeof ARMS)[number]): MenuScreenView =>
  screenOf({ ...arm.input, state });

const stateAt = (screen: MenuScreen): MenuState => ({ ...initialMenuState(CATALOGUE), screen });

/* -------------------------------------------------------------------------- *
 * The graph
 * -------------------------------------------------------------------------- */

describe('the menu graph has no dead ends', () => {
  it('reaches every screen from the root', () => {
    // Breadth-first over `navigate` intents from `main`, so a screen nothing links to is red rather
    // than merely untested. Derived from MENU_SCREENS, never listed.
    const seen = new Set<MenuScreen>(['main']);
    const queue: MenuState[] = [initialMenuState(CATALOGUE)];
    while (queue.length > 0) {
      const state = queue.shift();
      if (state === undefined) break;
      for (const row of viewAt(state, ARMS[0] as (typeof ARMS)[number]).rows) {
        if (row.intent.kind !== 'navigate' || seen.has(row.intent.to)) continue;
        seen.add(row.intent.to);
        queue.push(applyIntent(state, row.intent, CATALOGUE));
      }
    }
    expect([...seen].sort()).toEqual([...MENU_SCREENS].sort());
  });

  it('offers a way forward from every screen, not only a way back', () => {
    /*
     * `docs/16` § 5 clause 6. The campaign screen rendered a placeholder and one Back button, so a
     * player who picked the product's *first* menu row arrived somewhere with nothing to do.
     */
    for (const arm of ARMS) {
      for (const screen of MENU_SCREENS) {
        const forward = viewAt(stateAt(screen), arm).rows.filter((row) => row.kind !== 'back');
        expect(forward.length, `${screen} (${arm.name}) offers nothing but Back`).toBeGreaterThan(0);
      }
    }
  });

  it('returns to the root from every screen, in bounded steps', () => {
    for (const screen of MENU_SCREENS) {
      let state = stateAt(screen);
      let steps = 0;
      while (state.screen !== 'main' && steps <= MENU_SCREENS.length) {
        state = applyIntent(state, { kind: 'back' }, CATALOGUE);
        steps += 1;
      }
      expect(state.screen, `${screen} never reaches the root`).toBe('main');
    }
  });

  it('gives every screen but the root a Back', () => {
    for (const screen of MENU_SCREENS) {
      const hasBack = viewAt(stateAt(screen), ARMS[0] as (typeof ARMS)[number]).rows.some(
        (row) => row.kind === 'back',
      );
      expect(hasBack, screen).toBe(screen !== 'main');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The affordances
 * -------------------------------------------------------------------------- */

function everyRow(): readonly { readonly screen: MenuScreen; readonly arm: string; readonly row: MenuAffordance }[] {
  return ARMS.flatMap((arm) =>
    MENU_SCREENS.flatMap((screen) =>
      viewAt(stateAt(screen), arm).rows.map((row) => ({ screen, arm: arm.name, row })),
    ),
  );
}

describe('every affordance is usable', () => {
  it('has a unique id within its screen', () => {
    for (const arm of ARMS) {
      for (const screen of MENU_SCREENS) {
        const ids = viewAt(stateAt(screen), arm).rows.map((row) => row.id);
        expect(new Set(ids).size, `${screen} (${arm.name}) repeats an id`).toBe(ids.length);
      }
    }
  });

  it('explains itself whenever it is disabled', () => {
    // Disabled **and explained**. A control that refuses in silence moves an explainable error to
    // the one moment with no words for it — `menuPanel.ts`'s own rule, asserted over the graph
    // rather than at the one place somebody remembered.
    for (const { screen, arm, row } of everyRow()) {
      if (row.enabled) continue;
      expect(row.disabledWhy ?? '', `${screen}/${row.id} (${arm}) is disabled and says nothing`).not.toBe('');
    }
  });

  it('offers a non-empty option list containing its own value', () => {
    // A select whose current value is not among its options draws a box showing something the list
    // cannot get back to — the shape `catalogue.ts` was built to make impossible, checked here for
    // the settings and rate ladders it does not cover.
    for (const { screen, arm, row } of everyRow()) {
      if (row.kind !== 'select') continue;
      const options = row.options ?? [];
      expect(options.length, `${screen}/${row.id} (${arm}) has no options`).toBeGreaterThan(0);
      expect(
        options.some((option) => option.id === row.value),
        `${screen}/${row.id} (${arm}) shows "${row.value ?? ''}", which is not one of its options`,
      ).toBe(true);
    }
  });

  it('applies every option a select offers, and the screen reflects it', () => {
    /*
     * The § D177 shape at navigation scale: press the control, require the model to move. A select
     * whose options were decorative — chosen, carried, and dropped — is the defect § D215 § 8 found
     * in this exact screen, where three of six axes reached nothing.
     *
     * ## This case used to contain a copy of the defect it exists to catch
     *
     * It built the intent it pressed with **the same expression the panel used**:
     *
     * ```ts
     * row.intent.kind === 'set-free-play' || row.intent.kind === 'set-setting'
     *   ? { ...row.intent, value: option.id }
     *   : row.intent
     * ```
     *
     * and then `continue`d past any row that fell into the fallback. So the four transports that
     * were broken — `set-calendar`, `set-commissioning`, `set-constraint`, `set-challenge` — were
     * exactly the four this walk asserted nothing about (§ D248 § 4). **A walk that reproduces the
     * transport cannot measure it**: both copies agreed, and agreeing is all a duplicate can do.
     *
     * The transport is now `menu/screens.ts#withChosenValue` — the shipped one, which is a switch
     * over `MenuIntent` with no `default`, so a seventh intent carrying a chosen value cannot join
     * it in silence. Nothing is skipped by the *kind* of intent any more; what decides whether the
     * screen is checked is whether `applyIntent` is the thing that answers this intent at all, which
     * is a fact about the reducer rather than a restatement of the panel's condition.
     */
    for (const arm of ARMS) {
      for (const screen of MENU_SCREENS) {
        for (const row of viewAt(stateAt(screen), arm).rows) {
          if (row.kind !== 'select') continue;
          for (const option of row.options ?? []) {
            const intent = withChosenValue(row.intent, option.id);
            if (!REDUCER_OWNS.has(intent.kind)) continue;
            const next = applyIntent(stateAt(screen), intent, CATALOGUE);
            const after = viewAt(next, arm).rows.find((candidate) => candidate.id === row.id);
            expect(
              after?.value,
              `${screen}/${row.id} (${arm}) did not take "${option.id}"`,
            ).toBe(option.id);
          }
        }
      }
    }
  });

  it('leaves every other select on the screen showing a value it still offers', () => {
    /*
     * **The hole the case above cannot see, and GitHub issue #111(b) fell straight through it.**
     *
     * That case applies an option and then re-reads *the same row*. So a select whose choice breaks
     * a **different** select is invisible to it, and one did: picking a traffic shape rebuilt *Part
     * of the day* from the new template's parts while `windowStartS`/`durationS` still held a part
     * of the old one. No option matched, a browser falls back to index 0, and the box then showed a
     * part the model did not hold — with no way back, since a `<select>` fires no `change` for the
     * option it is already on.
     *
     * The invariant is the same one `offers a non-empty option list containing its own value`
     * asserts about the *opening* state, carried across an edit: **after any option is applied,
     * every select on the screen still contains its own value.** It is stated over the whole row
     * list rather than over the pair of fields that were wrong, because *which* select a choice
     * breaks is exactly what nobody knows in advance — that is what made this one survive.
     *
     * Watched failing before it was trusted: with `freePlayPatch`'s `demandTemplateId` arm writing
     * only the template, this reports `free-play/free-play.part` for every template whose parts
     * differ from the opening one.
     */
    for (const arm of ARMS) {
      for (const screen of MENU_SCREENS) {
        for (const row of viewAt(stateAt(screen), arm).rows) {
          if (row.kind !== 'select') continue;
          for (const option of row.options ?? []) {
            const intent = withChosenValue(row.intent, option.id);
            if (!REDUCER_OWNS.has(intent.kind)) continue;
            const next = applyIntent(stateAt(screen), intent, CATALOGUE);
            for (const sibling of viewAt(next, arm).rows) {
              if (sibling.kind !== 'select') continue;
              expect(
                (sibling.options ?? []).map((entry) => entry.id),
                `${screen}/${sibling.id} (${arm.name}) shows "${sibling.value ?? ''}", which it does ` +
                  `not offer, after ${row.id} was set to "${option.id}"`,
              ).toContain(sibling.value);
            }
          }
        }
      }
    }
  });

  it('rewrites every select’s intent to the option chosen, including the ones the shell owns', () => {
    /*
     * The half the case above structurally cannot reach, and the half that was broken.
     *
     * `set-calendar`, `set-commissioning` and `set-constraint` write `ViewerState` rather than
     * `MenuState`, so `applyIntent` returns the state unchanged by design and *the screen reflects
     * it* is not a question this tier can ask. What it can ask — and what the four broken transports
     * failed — is whether the **intent dispatched names the option the player picked** rather than
     * the one the row was already showing.
     *
     * `menu/screens.test.ts` owns the deep version of this, including two cases that go all the way
     * to the legs. This is the walk's own coverage of the same property, stated over the graph so
     * that a row added to any screen is covered on the day it lands rather than when somebody
     * remembers that file.
     */
    for (const arm of ARMS) {
      for (const screen of MENU_SCREENS) {
        for (const row of viewAt(stateAt(screen), arm).rows) {
          if (row.kind !== 'select') continue;
          for (const option of row.options ?? []) {
            if (option.id === row.value) continue;
            expect(
              withChosenValue(row.intent, option.id),
              `${screen}/${row.id} (${arm}) dispatches the value already showing when ` +
                `"${option.id}" is chosen — a no-op by construction`,
            ).not.toEqual(row.intent);
          }
        }
      }
    }
  });

  it('is not vacuous — the walk really reaches intents on both sides of that split', () => {
    /*
     * Without this, the pair above could pass over a graph in which every select carried a
     * `set-free-play`, which is precisely the coverage the old duplicated ternary had: it skipped
     * the four kinds that were broken, so its own reach was the shape of the defect.
     */
    const kinds = new Set(
      everyRow()
        .filter(({ row }) => row.kind === 'select')
        .map(({ row }) => row.intent.kind),
    );
    expect([...kinds].some((kind) => REDUCER_OWNS.has(kind)), 'no select reaches the reducer').toBe(
      true,
    );
    expect(
      [...kinds].some((kind) => !REDUCER_OWNS.has(kind)),
      'no select on this graph is one the shell owns, so the repaired transports are unwalked',
    ).toBe(true);
  });

  it('toggles both ways', () => {
    for (const arm of ARMS) {
      for (const screen of MENU_SCREENS) {
        for (const row of viewAt(stateAt(screen), arm).rows) {
          if (row.kind !== 'toggle') continue;
          const next = applyIntent(stateAt(screen), row.intent, CATALOGUE);
          const after = viewAt(next, arm).rows.find((candidate) => candidate.id === row.id);
          expect(after?.value, `${screen}/${row.id} did not change`).not.toBe(row.value);
        }
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Scope — S7
 * -------------------------------------------------------------------------- */

/**
 * Which play mode a screen belongs to.
 *
 * An exhaustive switch rather than a lookup, so a seventh screen has to be given a home instead of
 * defaulting into one — which is how `campaign` came to mean two different things.
 */
function modeOf(screen: MenuScreen): PlayMode {
  switch (screen) {
    case 'free-play':
      return 'free-play';
    case 'campaign':
      return 'shift-week';
    case 'leaderboard':
    case 'challenge':
      /*
       * Both are `ranked`: what a player may move on either is what survives the server's replay,
       * which is the whole of that row's argument in `permits.ts`. The challenge screen offers one
       * `between-games` axis (the dispatcher) and one `presentation` one (the board's ordering), and
       * `ranked` permits exactly those two scopes.
       */
      return 'ranked';
    case 'commissioning':
      /*
       * Its own mode, and the one row of `permits.ts` that forbids `within-day` — so this is the
       * screen that would catch a fabric control being offered beside a dispatcher weight.
       */
      return 'commissioning';
    case 'main':
    case 'settings':
    case 'account':
      // Not a play surface. `shift-week` is the permissive row, so an affordance on one of these
      // that a mode would forbid is caught by the screen that owns it rather than here.
      return 'shift-week';
  }
}

describe('no screen offers a control its mode forbids — S7', () => {
  it('holds for every row on every screen', () => {
    for (const { screen, arm, row } of everyRow()) {
      const mode = modeOf(screen);
      expect(
        permits(mode, row.scope),
        `${screen}/${row.id} (${arm}) is ${row.scope} and ${mode} forbids it — S7 says such a ` +
          'control is not offered, rather than offered and refused',
      ).toBe(true);
    }
  });

  it('is not vacuous — the matrix really does forbid things', () => {
    // Without this, the assertion above would pass on a `permits` that returned true for everything.
    expect(permits('ranked', 'between-days')).toBe(false);
    expect(permits('free-play', 'between-days')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The walk covers something
 * -------------------------------------------------------------------------- */

describe('the walk is worth running', () => {
  it('visits every screen under every arm', () => {
    expect(everyRow().length).toBeGreaterThanOrEqual(ARMS.length * MENU_SCREENS.length);
  });

  it('reaches a disabled control and an enabled one', () => {
    // A walk that only ever saw enabled rows would pass the disabled-and-explained assertion by
    // never reaching it — the exact way a sweep quietly covers less than it claims.
    const states = new Set(everyRow().map(({ row }) => row.enabled));
    expect([...states].sort()).toEqual([false, true]);
  });
});
