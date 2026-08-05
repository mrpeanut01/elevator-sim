/**
 * The instrument every scope declaration is judged by — two arms per control.
 *
 * A test helper rather than a production module, deliberately. These closures load `data/`, build
 * states and run simulations; shipping them in the bundle to satisfy a table would be an instrument
 * with no caller, which is the defect the whole `scope/` directory exists to catch. `.test-helper.ts`
 * is treated as a test by both dead-code scanners, so this file owes no non-test caller and says so
 * here rather than leaving a reader to infer it.
 *
 * ## What the two arms mean
 *
 * `states` is a pair differing in **exactly one field**, and `scope.test.ts` compares the legs:
 *
 * | declared scope | required of the legs |
 * |---|---|
 * | anything but `presentation` | they **differ** — otherwise the control is inert (`docs/12` § 5 clause 9) |
 * | `presentation` | they are **byte-identical** — otherwise a display setting is silently changing a run |
 *
 * `sink` is a pair of calls into whatever the control is *for*, and their results must differ. It is
 * required on `presentation` rows because identical legs alone cannot tell *"this cannot change a
 * run"* from *"this does nothing at all"*, and the second is exactly what four shipped settings turn
 * out to be.
 *
 * ## Why some presentation rows have no sink here
 *
 * Two reasons, and they are kept apart because only one of them is a defect.
 *
 * - **{@link SINK_IS_A_MOUNT}** — the control's only consumer is a DOM mount, and `docs/16` S9 says
 *   a model walk may not claim to have driven one. A registered reason, not a finding.
 * - **{@link SINK_MISSING}** — the control reaches nothing at all. A **recorded finding**, kept here
 *   so the suite is green while the register carries the defect, in `deadCode.test.ts`'s idiom.
 *   `scope.test.ts` asserts the register is not stale, so an entry cannot outlive the bug.
 *
 * {@link SINK_MISSING} is **empty**, and it is kept rather than deleted. All four settings began in
 * it — `docs/16` § 5 clause 4 — and all four now reach the thing they name. An empty register is the
 * honest end state of one that carried findings: deleting it would delete the mechanism that made
 * the next inert control visible, and the assertion that pins its contents is what would notice.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core/browser';

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import { classesFromSpecs, type MachineClass } from '../authoring/machineSpec.js';
import type { BrowserResources } from '../dev/data.js';
import { disclosureOf, initialState, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { mathsDisclosureOf } from '../dev/leftRail.js';
import { playbackRateFor, shouldAutoplayWith } from '../dev/motion.js';
import { drawerStateFor, railStateFor, surfaceStateFor } from '../dev/surfaces.js';
import { summaryFigureIds } from '../render/runSummary.js';
import { themeFor } from '../render/theme.js';
import type { TabName } from '../dev/elementMap.js';
import type { HonestyCard } from '../live/types.js';
import { navigate } from '../menu/menu.js';
import { initialMenuState } from '../menu/menu.js';
import { catalogueOf } from '../menu/catalogue.js';
import { CALENDAR_PERIODS, periodOnDays } from '../shift/calendar.js';
import { asBuiltChoices, withBankChoice } from '../commissioning/choices.js';
import { commissionableClasses } from '../commissioning/types.js';
import { challengeRunConfigs, type ChallengeView } from '../menu/challenge.js';
import { createClient } from '../menu/client.js';
import { recordRun } from '../record/recordRun.js';
import { nextDay } from '../shift/week.js';

import type { SurfaceKey } from './types.js';

/* -------------------------------------------------------------------------- *
 * Resources — two buildings, the same pair `state.freePlay.test.ts` uses
 * -------------------------------------------------------------------------- */

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

/**
 * Two buildings, not eight.
 *
 * § D216 § 5 bounds this deliberately: the walk simulates, because comparing on the legs is the
 * only comparison § D177 accepts, and the suite is already 1 918 s. Garden Apartments is small
 * enough to run in milliseconds and Midtown Office is the second arm every `buildingId` probe needs.
 */
const BUILDING_IDS = ['garden-apartments', 'midtown-office'] as const;

export function resourcesOf(): BrowserResources {
  const elevatorSpecs = parseElevatorSpecs(read('elevator-specs.json'));
  const entries = BUILDING_IDS.map((id) => {
    const config = parseBuilding(read(`buildings/${id}.json`));
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, elevatorSpecs) };
  });
  const trafficProfiles = parseTrafficProfiles(read('traffic-profiles.json'));
  return {
    elevatorSpecs,
    trafficProfiles,
    dispatcherProfiles: parseDispatcherProfiles(read('dispatcher-profiles.json')),
    buildings: entries.map((entry) => entry.resolved),
    entries,
    trafficProfileIds: new Set(trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
}

export const RESOURCES = resourcesOf();

/** The state every probe starts from. Garden Apartments at 900 s — small, and quick to simulate. */
export function baseState(): ViewerState {
  return {
    ...initialState(RESOURCES, 20260804n),
    buildingId: 'garden-apartments',
    shiftLengthS: 900,
  };
}

/**
 * The legs of the run a state produces, as a comparable string.
 *
 * Legs, never a window statistic. § D177's own words: *a mean can be unchanged for a run that is
 * entirely different, and a mean can move because the window moved.*
 *
 * ## It builds the run the way `runShift` builds it, and that is not a detail
 *
 * `shiftRunConfigOf` returns `outOfServiceCarIds` **beside** `config` rather than inside it, and
 * `dev/main.ts#runShift` passes the two to `recordRun` separately. A helper that destructured only
 * `config` therefore drops every held car — and it reported `viewer.outOfServiceCarIds` as an inert
 * control on a building where four cars carry 1 710 people, which is exactly the false accusation an
 * instrument like this one is most dangerous for. An instrument that does not reproduce the shipped
 * call path measures the instrument.
 */
export function legsOf(state: ViewerState): string {
  const plan = shiftRunConfigOf(RESOURCES, state);
  return JSON.stringify(
    recordRun(plan.config, {
      recordDecisions: false,
      outOfServiceCarIds: plan.outOfServiceCarIds,
    }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
  );
}

/* -------------------------------------------------------------------------- *
 * The probes
 * -------------------------------------------------------------------------- */

export interface ScopeProbe {
  /** Two states differing in exactly one field. */
  readonly states?: readonly [(s: ViewerState) => ViewerState, (s: ViewerState) => ViewerState];
  /** Two calls into what the control is for. Their results must differ. */
  readonly sink?: readonly [() => unknown, () => unknown];
  /**
   * The legs, for a control whose run is **not** built by `shiftRunConfigOf`.
   *
   * Exactly one control needs this today and it is not an escape hatch: a challenge run is assembled
   * by `menu/challenge.ts#challengeRunConfigs` against the server's issued configuration, which is a
   * different path through the same kernel. § D177's rule is unchanged — move the control, require
   * the legs to differ — and what moves is which function is asked for them.
   *
   * A probe that instead pointed `states` at `viewer.dispatcherId` would be comparing the legs of a
   * *different* control that happens to share a value, which is `docs/16` S2's amendment: the sink
   * must be the shipped decision, not a restatement of it.
   */
  readonly legs?: readonly [() => string, () => string];
}

const card = (hasMaths: boolean): HonestyCard => ({
  glyph: '✓',
  title: 'title',
  plain: 'plain',
  hasMaths,
  maths: 'the maths',
  bg: '#000',
  edge: '#111',
  warning: false,
  suppressed: false,
  fallingBehind: false,
});

const CATALOGUE = catalogueOf(RESOURCES);


/*
 * Both sinks call the **shipped** decision rather than restating it.
 *
 * A first draft wrote `60 * multiplier` here and asserted it differed from `60 * 1`. That is a
 * sink that tests its own arithmetic and says nothing about the product — a control could be
 * disconnected entirely and the assertion would still pass. `dev/motion.ts` now owns both
 * decisions and `dev/main.ts` calls them, so moving one of these settings and moving the thing
 * the viewer actually consults are the same event.
 */
const autoplayFor = (reduceMotion: boolean): boolean =>
  shouldAutoplayWith(() => ({ matches: false }), reduceMotion);

const playbackSpeedFor = (multiplier: number): number => playbackRateFor(60, multiplier);

/**
 * `hydraulic` re-saved with a gentler acceleration — and the field is chosen rather than convenient.
 *
 * It has to be the class Garden Apartments' cars actually declare, or `specsWithClass` widens an
 * `ElevatorSpecs` nothing resolves against and the probe proves nothing. And it has to be a field
 * those cars do **not** override: they declare `ratedSpeedMps`, `ratedLoadLb` and `doorType`
 * inline, so a class with a different rated speed reaches `resolveBuilding` and loses to the car —
 * correct behaviour, and a probe that moved the speed would have reported the seam dead.
 *
 * `acceleration` is not overridden, so it comes from the class, and halving it lengthens every
 * short hop. That is also the modelling rule this simulator is built around: short hops never reach
 * rated speed, so acceleration is what a six-floor building's journey times are actually made of.
 */
const GENTLER_HYDRAULIC: MachineClass = Object.freeze({
  ...(classesFromSpecs(RESOURCES.elevatorSpecs).find((entry) => entry.id === 'hydraulic') as MachineClass),
  accelerationMps2: 0.4,
  yours: true,
});

/**
 * The legs of one challenge seed, built the way the shell builds them.
 *
 * `challengeRunConfigs` is asked for the configuration and `recordRun` runs it, which is exactly the
 * pair `dev/main.ts#runChallenge` performs — so this measures the shipped path rather than a
 * reconstruction of it. One seed rather than five: the assertion is that the dispatcher moves the
 * run, and four more runs would measure the same fact four more times at four times the cost.
 */
function challengeLegsWith(dispatcherProfileId: string): string {
  const built = challengeRunConfigs(PROBE_CHALLENGE, RESOURCES, dispatcherProfileId);
  if (!built.ok) throw new Error(`the probe challenge does not run here: ${built.detail}`);
  const first = built.runs[0];
  if (first === undefined) throw new Error('the probe challenge names no seeds');
  return JSON.stringify(
    recordRun(first.config, { recordDecisions: false }).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
    ]),
  );
}

/** The request the shipped client builds for a board on this metric. The URL is the whole sink. */
function boardRequestFor(metric: string): string {
  let seen = '';
  const client = createClient('https://example.invalid', (request) => {
    seen = `${request.method} ${request.url}`;
    return Promise.resolve({ status: 200, body: { entries: [] } });
  });
  void client.challengeBoard('midtown-morning-4', metric);
  return seen;
}

/**
 * A challenge as the server issues one — constructed, because `viz` ships no challenge and must
 * build with `packages/server` absent. The configuration is the shipped rotation's first cell.
 */
const PROBE_CHALLENGE: ChallengeView = Object.freeze({
  challenge: Object.freeze({
    id: 'midtown-morning-4',
    name: 'Midtown morning',
    brief: 'Five seeds on Midtown Office at the morning peak.',
    config: Object.freeze({
      buildingId: 'midtown-office',
      demandTemplateId: 'rise-and-fall',
      arrivalRatePctPop5min: 3,
      durationS: 900,
    }),
    seeds: Object.freeze(['1001']),
    opensAtMs: 0,
    closesAtMs: 0,
  }),
  state: 'open',
  seedCount: 1,
  opensInMs: null,
  closesInMs: 3_600_000,
  clockNote: 'The server decides which challenge is open.',
  dataHash: 'abcdef0123456789',
  compare: Object.freeze({
    note: 'Compare answers the question a board cannot.',
    buildingId: 'midtown-office',
    demandTemplateId: 'rise-and-fall',
    arrivalRatePctPop5min: 3,
    durationS: 900,
  }),
});

/** Midtown's main bank with one more shaft than it ships — the commissioning probe's second arm. */
function fiveShaftMain(): ReturnType<typeof asBuiltChoices> {
  const building = RESOURCES.buildings.find((entry) => entry.id === 'midtown-office')?.config;
  if (building === undefined) throw new Error('midtown-office is not loaded');
  const classes = commissionableClasses(RESOURCES.elevatorSpecs);
  const asBuilt = asBuiltChoices(building, classes);
  const main = asBuilt[0];
  if (main === undefined) throw new Error('midtown-office declares no bank');
  return withBankChoice(asBuilt, { ...main, shafts: main.shafts + 1 });
}

/**
 * A probe for every `control` row in `SCOPE_OF`. `surface.test.ts` asserts that in both directions,
 * so a control added without one is red rather than unscoped-in-practice.
 */
export const PROBES: Readonly<Record<SurfaceKey, ScopeProbe>> = Object.freeze({
  /* --------------------------------------------------------- presentation: viewer */
  'viewer.mode': {
    states: [(s) => ({ ...s, mode: 'basic' }), (s) => ({ ...s, mode: 'advanced' })],
    sink: [() => disclosureOf('basic'), () => disclosureOf('advanced')],
  },
  'viewer.showMaths': {
    states: [(s) => ({ ...s, showMaths: true }), (s) => ({ ...s, showMaths: false })],
    sink: [
      () => mathsDisclosureOf(card(true), true, 'engineer'),
      () => mathsDisclosureOf(card(true), false, 'engineer'),
    ],
  },
  'viewer.tab': {
    states: [(s) => ({ ...s, tab: 'run' }), (s) => ({ ...s, tab: 'report' })],
    sink: [
      () => surfaceStateFor('run', new Set<TabName>()),
      () => surfaceStateFor('report', new Set<TabName>()),
    ],
  },
  'viewer.revealedTabs': {
    states: [
      (s) => ({ ...s, revealedTabs: new Set<TabName>() }),
      (s) => ({ ...s, revealedTabs: new Set<TabName>(['traffic']) }),
    ],
    sink: [
      () => surfaceStateFor('run', new Set<TabName>()),
      () => surfaceStateFor('run', new Set<TabName>(['traffic'])),
    ],
  },
  'viewer.railSegment': {
    states: [(s) => ({ ...s, railSegment: 'dispatcher' }), (s) => ({ ...s, railSegment: 'traffic' })],
    sink: [() => railStateFor('dispatcher'), () => railStateFor('traffic')],
  },
  'viewer.drawerOpen': {
    states: [(s) => ({ ...s, drawerOpen: false }), (s) => ({ ...s, drawerOpen: true })],
    sink: [() => drawerStateFor(1000, false), () => drawerStateFor(1000, true)],
  },
  'viewer.editingDispatcherId': {
    states: [
      (s) => ({ ...s, editingDispatcherId: 'collective' }),
      (s) => ({ ...s, editingDispatcherId: 'eta' }),
    ],
  },
  'viewer.editingPatternId': {
    states: [(s) => ({ ...s, editingPatternId: 'building' }), (s) => ({ ...s, editingPatternId: 'office-standard' })],
  },
  'viewer.editingClassId': {
    states: [
      (s) => ({ ...s, editingClassId: 'geared-traction' }),
      (s) => ({ ...s, editingClassId: 'hydraulic' }),
    ],
  },
  'viewer.editingBuildingId': {
    states: [
      (s) => ({ ...s, editingBuildingId: 'garden-apartments' }),
      (s) => ({ ...s, editingBuildingId: 'midtown-office' }),
    ],
  },

  /* ------------------------------------------------------ between-games: the run */
  'viewer.buildingId': {
    states: [(s) => ({ ...s, buildingId: 'garden-apartments' }), (s) => ({ ...s, buildingId: 'midtown-office' })],
  },
  'viewer.dispatcherId': {
    states: [(s) => ({ ...s, dispatcherId: 'collective' }), (s) => ({ ...s, dispatcherId: 'nearest-car' })],
  },
  'viewer.pattern': {
    states: [(s) => ({ ...s, pattern: 'building' }), (s) => ({ ...s, pattern: 'office-standard' })],
  },
  'viewer.shiftLengthS': {
    states: [(s) => ({ ...s, shiftLengthS: 900 }), (s) => ({ ...s, shiftLengthS: 1800 })],
  },
  'viewer.freePlay': {
    states: [
      (s) => ({ ...s, freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 3 } }),
      (s) => ({ ...s, freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 12 } }),
    ],
  },
  'viewer.seed': {
    states: [(s) => ({ ...s, seed: 1n }), (s) => ({ ...s, seed: 999n })],
  },
  'viewer.calendar': {
    /*
     * `quarter-end` rather than `vacation`, and Midtown rather than Garden Apartments, because both
     * choices are about the probe having something to measure: quarter-end raises the population
     * *and* names `evening-egress`, so it moves the legs through two independent routes, and a
     * probe that could only fail if both were broken at once is a better guard than one that
     * depends on a single field.
     */
    states: [
      (s) => ({ ...s, buildingId: 'midtown-office', shiftLengthS: 1800, calendar: null }),
      (s) => ({
        ...s,
        buildingId: 'midtown-office',
        shiftLengthS: 1800,
        calendar: periodOnDays(CALENDAR_PERIODS['quarter-end'], 1, 7),
      }),
    ],
  },
  'viewer.commissioning': {
    /*
     * A fifth shaft at Midtown, at 1 800 s. Both halves of that cell are measured rather than
     * convenient: Garden Apartments produces 20 legs at that length and two hydraulic cars answer
     * every one, so a third car is never assigned and the probe would report a live control dead —
     * which is `docs/10` § 0's M1 measurement (*"one building where nothing you change makes any
     * difference"*) arriving at a control instead of at a slider.
     */
    states: [
      (s) => ({ ...s, buildingId: 'midtown-office', shiftLengthS: 1800, commissioning: [] }),
      (s) => ({
        ...s,
        buildingId: 'midtown-office',
        shiftLengthS: 1800,
        commissioning: fiveShaftMain(),
      }),
    ],
  },

  /* ------------------------------------------------------- within-day: re-runs today */
  'viewer.levers': {
    states: [
      (s) => ({ ...s, levers: DEFAULT_LEVERS }),
      (s) => ({ ...s, levers: { ...DEFAULT_LEVERS, express: true } }),
    ],
  },
  'viewer.selectorSpec': {
    /*
     * On Midtown Office, for the same measured reason `viewer.outOfServiceCarIds` is: Garden
     * Apartments is a residential trickle, and a trickle keeps the pattern detector in one arm all
     * day — so a policy that switches between arms has nothing to switch between and the probe
     * would report a live control dead.
     *
     * `off` against `fuzzy` rather than two arm maps, because it is the contrast the control's own
     * first row makes and the one that cannot be quiet: with no policy, `resolveWeightSets` returns
     * nothing and the driving weights never move.
     */
    states: [
      (s) => ({
        ...s,
        buildingId: 'midtown-office',
        selectorSpec: { ...s.selectorSpec, policy: 'off' },
      }),
      (s) => ({
        ...s,
        buildingId: 'midtown-office',
        selectorSpec: { ...s.selectorSpec, policy: 'fuzzy' },
      }),
    ],
  },
  'viewer.outOfServiceCarIds': {
    /*
     * On Midtown Office, not Garden Apartments — and the reason is a measured fact about the probe
     * rather than a preference.
     *
     * Garden Apartments is six floors and two hydraulic cars at a residential trickle, and at that
     * demand **`main-A` answers everything on its own**: holding `main-B` produces a byte-identical
     * set of legs, so the arm reported this control inert when the control is fine and the building
     * is idle. A probe has to be run on a building where the thing it is probing matters.
     *
     * Midtown Office is four cars and 1 710 people. Holding one leaves three, which is also what
     * `shift/events.ts#carsToHold` guarantees — a bank with no in-service car is a set of floors
     * nobody can reach, which is a different scenario rather than a busier one.
     */
    states: [
      (s) => ({ ...s, buildingId: 'midtown-office', outOfServiceCarIds: [] }),
      (s) => ({ ...s, buildingId: 'midtown-office', outOfServiceCarIds: ['main-D'] }),
    ],
  },
  'viewer.savedClasses': {
    // A saved class widens the specs the building resolves against with no further selection, which
    // is why this one is a `control` and the other three saves are `latent`. The arm re-saves the
    // class Garden Apartments' own cars declare — `hydraulic` — at a different rated speed, because
    // a class the building does not use would be carried into `ElevatorSpecs` and change no leg.
    states: [(s) => ({ ...s, savedClasses: [] }), (s) => ({ ...s, savedClasses: [GENTLER_HYDRAULIC] })],
  },

  /* ---------------------------------------------------- between-days: the boundary */
  'viewer.week': {
    states: [(s) => s, (s) => ({ ...s, week: nextDay(nextDay(s.week)) })],
  },

  /* ------------------------------------------------------------------- settings */
  /*
   * Two of the four have sinks and two do not, and the difference is visible here rather than
   * argued anywhere.
   *
   * There is no `states` arm on any of them, and that is structural rather than an omission:
   * `shiftRunConfigOf` takes a `ViewerState`, `Settings` is not one of its inputs, and no arm could
   * be written that reached a leg. The half worth checking is the other one — that the control
   * reaches *something*.
   */
  'settings.reduceMotion': {
    // The sink is the same predicate `adopt` asks. A reader who set the switch has asked for the
    // same thing `prefers-reduced-motion` asks for, by a different route.
    sink: [() => autoplayFor(false), () => autoplayFor(true)],
  },
  'settings.playbackSpeed': {
    // A multiplier over the transport chip's own speed, which is why the sink is the product and
    // not the setting echoed back.
    sink: [() => playbackSpeedFor(1), () => playbackSpeedFor(4)],
  },
  'settings.showEnergyAxis': {
    // The shipped decision, not a restatement: `runSummaryFigures` is what the panel renders, and
    // `summaryFigureIds` is the id list it produces. A probe that counted figures itself would pass
    // on a disconnected control.
    sink: [
      () => summaryFigureIds({ showEnergyAxis: true }),
      () => summaryFigureIds({ showEnergyAxis: false }),
    ],
  },
  'settings.theme': {
    // `themeFor` is the function `dev/main.ts#applyTheme` calls, probed with a fixed
    // `prefers-color-scheme` so `system` is not what is being measured here.
    sink: [
      () => themeFor('dark', () => ({ matches: false })),
      () => themeFor('light', () => ({ matches: false })),
    ],
  },

  /* ------------------------------------------------------------------ free play */
  'free-play.buildingId': {
    states: [(s) => ({ ...s, buildingId: 'garden-apartments' }), (s) => ({ ...s, buildingId: 'midtown-office' })],
  },
  'free-play.dispatcherProfileId': {
    states: [(s) => ({ ...s, dispatcherId: 'collective' }), (s) => ({ ...s, dispatcherId: 'nearest-car' })],
  },
  'free-play.demandTemplateId': {
    states: [
      (s) => ({ ...s, shiftLengthS: 7200, freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 6 } }),
      (s) => ({ ...s, shiftLengthS: 7200, freePlay: { demandTemplateId: 'constant-iso', arrivalRatePctPop5min: 6 } }),
    ],
  },
  'free-play.arrivalRatePctPop5min': {
    states: [
      (s) => ({ ...s, freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 3 } }),
      (s) => ({ ...s, freePlay: { demandTemplateId: 'rise-and-fall', arrivalRatePctPop5min: 12 } }),
    ],
  },
  'free-play.durationS': {
    states: [(s) => ({ ...s, shiftLengthS: 300 }), (s) => ({ ...s, shiftLengthS: 1800 })],
  },
  'free-play.seed': {
    states: [(s) => ({ ...s, seed: 1n }), (s) => ({ ...s, seed: 999n })],
  },

  /* ------------------------------------------------------------------ challenge */
  'challenge.dispatcherProfileId': {
    /*
     * The one control whose run is built by `challengeRunConfigs` rather than `shiftRunConfigOf`,
     * so the legs come from there — see `ScopeProbe.legs`.
     *
     * Midtown Office at 3 %/900 s is the shipped rotation's own first cell, and `collective` against
     * `nearest-car` is the widest pair the library has: `nearest-car` is the weakest shipped
     * dispatcher and was the viewer's default until § D134, so if any two profiles move the legs,
     * these do. A pair that did not move them would be measuring the probe rather than the control.
     */
    legs: [() => challengeLegsWith('collective'), () => challengeLegsWith('nearest-car')],
  },
  'challenge.metric': {
    /*
     * Presentation, and the sink is the **request**. The board is ordered by the server, so a
     * different metric is a different fetch rather than a re-sort of rows already in hand — which is
     * also why it may not move a leg: the runs it orders were simulated by somebody else, hours ago.
     *
     * Driven through `createClient` with a recording transport, so what is compared is the URL the
     * shipped client actually builds. A helper that formatted the same query string here would pass
     * whether or not the control was connected — S2's amendment, and the defect it was written for.
     */
    sink: [() => boardRequestFor('awtS'), () => boardRequestFor('wt95S')],
  },

  /* ----------------------------------------------------------------- menu shell */
  'menu.screen': {
    sink: [
      () => initialMenuState(CATALOGUE).screen,
      () => navigate(initialMenuState(CATALOGUE), 'settings').screen,
    ],
  },
});

/* -------------------------------------------------------------------------- *
 * The two registers
 * -------------------------------------------------------------------------- */

/**
 * Presentation controls whose only consumer is a DOM mount.
 *
 * `docs/16` S9: a model walk may not be cited as having driven a document. These four name which
 * artifact an editor is pointed at, and the only thing that reads them is the mount that draws its
 * title — so the honest statement is *"unreachable at this evidence tier"*, not *"inert"*.
 */
export const SINK_IS_A_MOUNT: Readonly<Record<string, string>> = Object.freeze({
  'viewer.editingDispatcherId': 'read by mountDispatcherEditor to title its own panel; no pure sink exists to call',
  'viewer.editingPatternId': 'read by mountTrafficEditor to title its own panel; no pure sink exists to call',
  'viewer.editingClassId': 'read by mountMachinesEditor to title its own panel; no pure sink exists to call',
  'viewer.editingBuildingId': 'read by mountBuildingEditor, and by withBuilding’s pristine check, which is not a display',
});

/**
 * Presentation controls that reach **nothing at all** — a recorded finding, not an exemption.
 *
 * `docs/16` § 5 clause 4 and § D216 § 3. Each of these is a switch a player can flip in a shipped
 * menu that changes no pixel and no number, and `menu/types.ts` carries a paragraph explaining a
 * restriction on them that has never had a way to be true or false.
 *
 * Kept here so the suite is green while the register carries the defect — `deadCode.test.ts`'s
 * `DEAD_CANDIDATES` idiom — and `scope.test.ts` asserts an entry cannot outlive its bug.
 */
export const SINK_MISSING: Readonly<Record<string, string>> = Object.freeze({});
