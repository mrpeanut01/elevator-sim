/**
 * The Everyday data host's pure half — every derivation `createEverydayHost` layers over the
 * bindings, driven against the real shipped `data/` (the fixture rule `fixtures.test-helper.ts`
 * states: a fixture building proves that a fixture building works).
 *
 * The DOM/runtime half — the bindings `dev/main.ts` implements against its boot closure — is
 * driven in `shell.browser.test.ts`, where a real page starts a run through the host and meets
 * § 3.4's confirm strip.
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
import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { SIGNED_OUT, signedIn, type AccountState } from '../menu/account.js';

import { towerById, type CampaignTower } from '../campaign/career.js';
import { clearedDays, purseOf, type ShopCategoryId } from '../campaign/economy.js';
import { AS_BUILT } from '../campaign/fitOut.js';
import type { VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import { shiftGoalsOf } from '../dev/leftRail.js';
import {
  initialState,
  profileById,
  shiftLengthForContract,
  shiftRunConfigOf,
  type ViewerState,
} from '../dev/state.js';
import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';
import { wholeDayFor, wholeDayRun } from '../shift/dayLength.js';
import { GOAL_BARS } from '../shift/goals.js';
import type { ShapedDayReport } from '../shift/report.js';
import { watchRunConfigOf } from '../watch/record.js';
import { postedResultOf } from '../watch/reproduce.js';
import type { PostedResult, WatchableRun, WatchRecord } from '../watch/types.js';
import { watchingViewOf, type WatchingView } from '../watch/view.js';

import {
  createEverydayHost,
  dailyBoardOf,
  EVERYDAY_HOST,
  type EverydayHostBindings,
} from './host.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

const BUILDING_IDS = ['garden-apartments', 'midtown-office'] as const;

function resourcesOf(): BrowserResources {
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

const resources = resourcesOf();
const base = (): ViewerState => initialState(resources, 20260812n);
/** The loaded `BuildingConfig` `wholeDayFor` reads a traffic profile off. */
const configOf = (id: string) => resources.entries.find((entry) => entry.config.id === id)?.config;

/**
 * A recording as far as the host ever reads one on these paths: `runState` asks only whether one
 * is on the stage. `goalsToday`'s with-a-recording arm folds a real one and is exercised by the
 * browser tier, where a real run exists.
 */
const A_RECORDING = { runId: 'host-test' } as unknown as VizRecording;

/** The host only asks whether a sheet is standing — see `openTomorrow`'s gate. */
const A_REPORT = { kind: 'week-day' } as unknown as ShapedDayReport;

interface Harness {
  readonly bindings: EverydayHostBindings;
  /** Every action press, in order, so compositions can assert their sequence. */
  readonly calls: string[];
  /** Every patch `applyPatch` received, in order. */
  readonly patches: Partial<ViewerState>[];
  state: ViewerState;
  /** What `loadReferenceRuns` answers — § 14.1's second source, as a fixture. */
  references: readonly WatchableRun[];
  /** What the reproduction gate's simulator answers. See the § 14.1 cases below. */
  simulate: (config: SimulationConfig) => VizRecording;
  /** The session `enterWatch` opened, read back by `watching()`. */
  watching: { readonly run: WatchableRun; readonly view: WatchingView } | undefined;
}

function harnessOf(
  state: ViewerState,
  flags?: Partial<{
    playheadS: number;
    dayClosed: boolean;
    runIsOwn: boolean;
    playerHasChosen: boolean;
    dayStartS: number;
  }>,
): Harness {
  const calls: string[] = [];
  const patches: Partial<ViewerState>[] = [];
  const harness: Harness = {
    calls,
    patches,
    state,
    references: [],
    simulate: () => {
      throw new Error('this harness was not given a simulator');
    },
    watching: undefined,
    bindings: {
      resources,
      state: () => harness.state,
      playheadS: () => flags?.playheadS ?? 0,
      dayClosed: () => flags?.dayClosed ?? false,
      runIsOwn: () => flags?.runIsOwn ?? false,
      playerHasChosen: () => flags?.playerHasChosen ?? false,
      dayStartS: () => flags?.dayStartS,
      startRun: () => {
        calls.push('startRun');
      },
      intervene: (atS, change) => {
        calls.push(`intervene:${String(atS)}:${change.kind}`);
      },
      closeDay: () => {
        calls.push('closeDay');
      },
      openRunTab: () => {
        calls.push('openRunTab');
      },
      applyPatch: (patch) => {
        calls.push('applyPatch');
        patches.push(patch);
      },
      /*
       * § 14.1's six, recorded rather than refused — GitHub issue #182. `watchRun`'s composition is
       * driven below, and what it is asserted on is the *order* of these calls: the gate runs, and
       * `enterWatch` is reached only when it passed.
       */
      loadReferenceRuns: () => {
        calls.push('loadReferenceRuns');
        return Promise.resolve(harness.references);
      },
      simulateRecord: (config) => {
        calls.push('simulateRecord');
        return harness.simulate(config);
      },
      enterWatch: (run) => {
        calls.push(`enterWatch:${run.id}`);
        harness.watching = { run, view: watchingViewOf(run, 'Steady hand') };
      },
      stopWatching: () => {
        calls.push('stopWatching');
        harness.watching = undefined;
      },
      playThisCrowd: (run) => {
        calls.push(`playThisCrowd:${run.id}`);
      },
      watching: () => harness.watching,
      /* No page, so no API origin, so nothing to ask — the honest no-server arm. */
      dailyBoard: undefined,
    signIn: undefined,
      onChange: (listener) => {
        calls.push('onChange');
        void listener;
        return () => {
          calls.push('unsubscribe');
        };
      },
    },
  };
  return harness;
}

describe('runState — § 3.4’s latch, derived from the four grounds', () => {
  it('is closed with no run on the stage, whatever the flags say', () => {
    const h = harnessOf(base(), { dayClosed: true, runIsOwn: true, playerHasChosen: true });
    const run = createEverydayHost(h.bindings).runState();
    expect(run).toEqual({ hasRun: false, dayClosed: false, playheadS: 0, open: false });
  });

  it('opens only for the player’s own, chosen, unfiled run', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const open = createEverydayHost(
      harnessOf(withRun, { runIsOwn: true, playerHasChosen: true }).bindings,
    ).runState();
    expect(open).toEqual({ hasRun: true, dayClosed: false, playheadS: 0, open: true });
  });

  it('stays closed for boot’s demo run — § D232: a run nobody asked for warns nobody', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const run = createEverydayHost(
      harnessOf(withRun, { runIsOwn: true, playerHasChosen: false }).bindings,
    ).runState();
    expect(run.hasRun).toBe(true);
    expect(run.open).toBe(false);
  });

  it('stays closed for somebody else’s run — § 3.4: there is nothing of yours to lose', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const run = createEverydayHost(
      harnessOf(withRun, { runIsOwn: false, playerHasChosen: true }).bindings,
    ).runState();
    expect(run.open).toBe(false);
  });

  it('closes when the day files, and says so in dayClosed', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const run = createEverydayHost(
      harnessOf(withRun, { runIsOwn: true, playerHasChosen: true, dayClosed: true }).bindings,
    ).runState();
    expect(run).toEqual({ hasRun: true, dayClosed: true, playheadS: 0, open: false });
  });

  it('reads the playhead live from the bindings — a pull, not a stored copy', () => {
    const withRun = { ...base(), recording: A_RECORDING };
    const run = createEverydayHost(harnessOf(withRun, { playheadS: 417 }).bindings).runState();
    expect(run.playheadS).toBe(417);
  });
});

describe('the day-record reads', () => {
  it('answers the week, its contract, and no outcome before any day has closed', () => {
    const host = createEverydayHost(harnessOf(base()).bindings);
    const week = host.week();
    expect(week.day).toBe(1);
    // The page opens on CONTRACTS[0], so the contract resolves and names the opening building.
    expect(host.contract()?.buildingId).toBe('garden-apartments');
    expect(host.lastOutcome()).toBeUndefined();
    expect(host.lastReport()).toBeUndefined();
  });

  it('reads goals as all pending before any run — the wake-up gate doing its work', () => {
    const readings = createEverydayHost(harnessOf(base()).bindings).goalsToday();
    expect(readings.length).toBeGreaterThan(0);
    for (const reading of readings) {
      expect(reading.state, reading.goal.id).toBe('pending');
      expect(reading.observed, reading.goal.id).toBeNull();
    }
  });
});

describe('the resource lookups are honest — undefined, never a substitution', () => {
  const host = createEverydayHost(harnessOf(base()).bindings);

  it('answers a shipped building and refuses an unknown id', () => {
    expect(host.buildingById('garden-apartments')?.id).toBe('garden-apartments');
    expect(host.buildingById('no-such-tower')).toBeUndefined();
    expect(host.buildingIds()).toContain('midtown-office');
  });

  it('answers a shipped dispatcher and refuses an unknown id — unlike profileById, on purpose', () => {
    expect(host.dispatcherById('collective')?.id).toBe('collective');
    expect(host.dispatcherById('no-such-dispatcher')).toBeUndefined();
    // The contrast this lookup exists for: the state-selection resolver substitutes (a selector
    // must select something); a lookup about a named thing may not.
    expect(profileById(resources, [], 'no-such-dispatcher')).toBeDefined();
    expect(host.dispatchers().length).toBeGreaterThan(3);
  });

  it('answers a shipped traffic profile and refuses an unknown id', () => {
    expect(host.trafficProfileById('residential-standard')?.id ?? 'found').toBeDefined();
    expect(host.trafficProfileById('no-such-profile')).toBeUndefined();
  });
});

/**
 * **The vector actually driving, not the id the player picked** — GitHub issue #171.
 *
 * The façade grew this method for § 7.6's handover, and the case that matters is the one an id
 * comparison gets wrong: a player who has moved a plain lever is running a vector their standing
 * dispatcher's name no longer describes, so handing the day to that name is a real change. If this
 * method ever answered the base profile, the stage's control would be disabled at exactly that
 * moment — § D177's inert-control class with its polarity reversed.
 */
describe('drivingProfile — what the building is obeying', () => {
  it('is the standing profile while nothing has been moved', () => {
    const host = createEverydayHost(harnessOf(base()).bindings);
    const standing = host.dispatcherById(host.selection().dispatcherId);
    expect(standing).toBeDefined();
    expect(host.drivingProfile().weights).toEqual(standing?.weights);
  });

  it('follows a lever the run reads, under the same standing id', () => {
    const h = harnessOf(base());
    const host = createEverydayHost(h.bindings);
    /*
     * *Keep a car downstairs* is the one plain lever `drivingProfileOf` reads (issue #296), so it
     * is the one that can make this method disagree with the base profile without the id moving.
     */
    host.setPlainLever('lobby', true);
    const moved = createEverydayHost(harnessOf({ ...base(), ...h.patches[0] }).bindings);
    expect(moved.selection().dispatcherId).toBe(host.selection().dispatcherId);
    expect(moved.drivingProfile().idle?.parkingStrategy).toBe('lobby');
    expect(host.drivingProfile().idle?.parkingStrategy).not.toBe('lobby');
  });
});

describe('editedDispatcher — the § 20.10 gauntlet gate’s one question', () => {
  it('is clean on a freshly opened profile, so a saved dispatcher may be sent', () => {
    const edited = createEverydayHost(harnessOf(base()).bindings).editedDispatcher();
    expect(edited.id).toBe(base().editingDispatcherId);
    expect(edited.dirty).toBe(false);
    expect(edited.name).not.toBe('');
  });

  it('is dirty the moment the working copy differs from what the library holds', () => {
    const state = base();
    const h = harnessOf({
      ...state,
      dispatcherSpec: {
        ...state.dispatcherSpec,
        weights: { ...state.dispatcherSpec.weights, waitTime: 3 },
      },
    });
    expect(createEverydayHost(h.bindings).editedDispatcher().dirty).toBe(true);
  });

  it('is dirty when the profile it was opened from is gone — a run can be pointed at neither', () => {
    /*
     * `dev/dispatcherEditor.ts#runThisStateOf` collapses the two into one `saveFirst` for this
     * reason, and the gate asks the question in the same place so the two controls cannot disagree
     * about what *saved* means.
     */
    const h = harnessOf({ ...base(), editingDispatcherId: 'no-such-dispatcher' });
    expect(createEverydayHost(h.bindings).editedDispatcher().dirty).toBe(true);
  });
});

describe('the plain-lever seam — the same vector the Engineer editor holds', () => {
  it('reads the four levers off the working spec and group levers', () => {
    const views = createEverydayHost(harnessOf(base()).bindings).plainLevers();
    expect(views.map((view) => view.id)).toEqual(['patience', 'lobby', 'spread', 'room']);
  });

  it('writes one lever through applyPlainLever, patching only the two documents', () => {
    const h = harnessOf(base());
    createEverydayHost(h.bindings).setPlainLever('patience', 80);
    expect(h.calls).toEqual(['applyPatch']);
    const patch = h.patches[0];
    expect(patch).toBeDefined();
    expect(Object.keys(patch ?? {}).sort()).toEqual(['dispatcherSpec', 'levers']);
    expect(patch?.dispatcherSpec?.weights['starvation']).toBe(80);
  });
});

describe('the run actions', () => {
  it('startRun and closeDay are the bindings’ own presses on a crowd with no authored day', () => {
    // Garden Apartments is residential and no day-shaped record ships for that crowd, so the day
    // seam writes nothing here — not an empty patch, which would re-render every surface to change
    // no field. § D227: a control that writes nothing says so, and this is that said with a run.
    const h = harnessOf(base());
    const host = createEverydayHost(h.bindings);
    host.startRun();
    host.closeDay();
    expect(h.calls).toEqual(['startRun', 'closeDay']);
  });

  it('openTomorrow refuses while no closed day’s sheet is standing', () => {
    const h = harnessOf(base());
    createEverydayHost(h.bindings).openTomorrow();
    expect(h.calls).toEqual([]);
  });

  it('openTomorrow advances the day, clears the day’s artefacts, and runs — in that order', () => {
    const closed: ViewerState = { ...base(), recording: A_RECORDING, report: A_REPORT };
    const h = harnessOf(closed);
    createEverydayHost(h.bindings).openTomorrow();
    expect(h.calls).toEqual(['applyPatch', 'openRunTab', 'startRun']);
    const patch = h.patches[0];
    expect(patch?.week?.day).toBe(closed.week.day + 1);
    expect(patch?.week?.attempt).toBe(0);
    // The same composition as the report sheet's own press (`dev/reportPanel.ts`): the sheet, the
    // beat, the recording and yesterday's log all go in the patch that opens the day they are not
    // an account of.
    expect(patch).toMatchObject({
      recording: undefined,
      report: undefined,
      tomorrow: undefined,
      withheld: [],
      interventions: [],
    });
  });

  /**
   * The day the Everyday player actually runs — `ISSUE_VERIFICATION_FINDINGS.md` § AB.
   *
   * The finding was that `office-day` had shipped for waves — ten hours, seventeen phases, three
   * cited peaks — and no Everyday player could reach it, because every Everyday day fell through
   * `shiftDemandTemplateId` to a hard-coded thirty-minute `rise-and-fall`. What is asserted here is
   * the *press*: the run this product's own primary starts is the whole day, on the buildings a day
   * was authored for and on no others.
   */
  it('starts the whole authored day where the building has one, and says so as a window', () => {
    const office: ViewerState = { ...base(), buildingId: 'midtown-office' };
    const h = harnessOf(office);
    createEverydayHost(h.bindings).startRun();

    // Patched **before** the press, because `runShift` reads the state synchronously to build the
    // config: a patch landing after it would run yesterday's length under today's caption.
    expect(h.calls).toEqual(['applyPatch', 'startRun']);

    const day = wholeDayFor(resources.trafficProfiles, configOf(office.buildingId));
    if (day === undefined) throw new Error('midtown-office has no whole day');
    // Derived from the record, not transcribed: the length is the period `data/` declares.
    expect(h.patches[0]).toEqual(wholeDayRun(day));
    expect(h.patches[0]?.shiftLengthS).toBe(day.periodS);
    // A window and not a `null`, which is the only spelling `core` accepts for a phase list — and
    // the reason is asserted in `shift/dayLength.test.ts`, where it throws.
    expect(h.patches[0]?.windowStartS).toBe(0);
  });

  it('opens tomorrow onto a day of the same kind, in one merge', () => {
    // Two patches would let a render see a week advanced onto a horizon it is not running yet.
    const closed: ViewerState = {
      ...base(),
      buildingId: 'midtown-office',
      recording: A_RECORDING,
      report: A_REPORT,
    };
    const h = harnessOf(closed);
    createEverydayHost(h.bindings).openTomorrow();
    expect(h.calls).toEqual(['applyPatch', 'openRunTab', 'startRun']);
    expect(h.patches).toHaveLength(1);
    expect(h.patches[0]?.week?.day).toBe(closed.week.day + 1);
    expect(h.patches[0]?.windowStartS).toBe(0);
    expect(h.patches[0]?.shiftLengthS).toBeGreaterThan(closed.shiftLengthS);
  });

  it('grades a whole day against the whole day’s bars, and a slice against the slice’s', () => {
    /*
     * The half a lane could most easily ship broken: a longer run judged by the ceiling a
     * thirty-minute one was authored against. `goalsForDay`'s own docstring measures what that
     * costs — Secure Tower's day 1 goes from 4 of 10 seeds missing something to 9 of 10, on a run
     * nobody made worse — so the rail's reading and the run's window are read from one predicate.
     */
    const day = wholeDayFor(resources.trafficProfiles, configOf('midtown-office'));
    if (day === undefined) throw new Error('midtown-office has no whole day');

    const slice: ViewerState = { ...base(), buildingId: 'midtown-office' };
    const whole: ViewerState = { ...slice, ...wholeDayRun(day) };
    const worstBarOf = (state: ViewerState): number => {
      const readings = createEverydayHost(harnessOf(state).bindings).goalsToday();
      return readings.find((reading) => reading.goal.id === 'worst-wait')?.goal.bar ?? Number.NaN;
    };
    expect(worstBarOf(whole)).toBe(worstBarOf(slice) * GOAL_BARS.worstWholeDayFactor);

    // And a crowd with no day is graded exactly as it was, whatever its window happens to say —
    // the horizon comes from the day the building has, never from the number of seconds.
    const residential: ViewerState = { ...base(), shiftLengthS: 36000, windowStartS: 0 };
    expect(worstBarOf(residential)).toBe(worstBarOf(base()));
  });

  /**
   * § 7's stage reads the run and grows its record through these four, and each is worth a case for
   * a different reason: `recording` is what makes the stage possible at all, `dayStartS` is what
   * stops two surfaces disagreeing about what `09:14` means, and `intervene` carries **the
   * caller's** playhead — which is the whole reason it takes one.
   */
  it('hands back the recording on the stage, and the run’s own start hour', () => {
    const h = harnessOf({ ...base(), recording: A_RECORDING }, { dayStartS: 9 * 3600 });
    const host = createEverydayHost(h.bindings);
    expect(host.recording()).toBe(A_RECORDING);
    expect(host.dayStartS()).toBe(9 * 3600);
    // `undefined` is the honest answer for a template that declares no hour — `clockAt` owns the
    // fallback, so a screen never restates 06:00.
    expect(createEverydayHost(harnessOf(base()).bindings).dayStartS()).toBeUndefined();
    expect(createEverydayHost(harnessOf(base()).bindings).recording()).toBeUndefined();
  });

  it('reads the intervention log, and appends at the playhead the caller passed', () => {
    const withRun: ViewerState = { ...base(), recording: A_RECORDING };
    const h = harnessOf(withRun, { playheadS: 12 });
    const host = createEverydayHost(h.bindings);
    expect(host.interventions()).toEqual([]);
    host.intervene(447, { kind: 'park-cars-lobby' });
    /*
     * **447, not 12.** The shell's own playhead is 12 here; the Everyday stage runs its own
     * transport and passed 447. A façade that read `playheadS()` instead would stamp every Everyday
     * intervention at whatever instant the Engineer surface happened to be paused at — a change
     * filed at a moment nobody was looking at.
     */
    expect(h.calls).toEqual(['intervene:447:park-cars-lobby']);
  });

  it('refuses to grow a record that does not exist', () => {
    const h = harnessOf(base(), { playheadS: 12 });
    createEverydayHost(h.bindings).intervene(10, { kind: 'park-cars-lobby' });
    expect(h.calls).toEqual([]);
  });

  it('subscribe is onChange’s passthrough, unsubscribe included', () => {
    const h = harnessOf(base());
    const off = createEverydayHost(h.bindings).subscribe(() => {});
    off();
    expect(h.calls).toEqual(['onChange', 'unsubscribe']);
  });
});

describe('one run, one set of bars — both shells', () => {
  /**
   * The defect this file's neighbour lane shipped, and the reason it is asserted from **both call
   * paths** rather than from two literals.
   *
   * `goalsForDay` grew a second argument and one of its four callers passed it. So an Everyday
   * player who pressed *Run* on a whole authored day was graded by the Everyday rail against a
   * 460 s worst-wait ceiling and by the Engineer rail — the same run, the same state, one door
   * away — against 230 s. Neither number is wrong on its own; publishing both about one run is the
   * thing `TEST_MATRIX.md` T1's *figures consistent* clause forbids, and it is the failure this
   * repository's honesty tier exists to catch.
   *
   * Both sides here are the product's own expressions: `goalsToday()` is what the Everyday rail
   * draws, `shiftGoalsOf` is what the Engineer rail draws **and** what `dev/main.ts#closeShift`
   * files the sheet with. Nothing is transcribed — the state is built from the record's own period
   * through `wholeDayRun`, and the assertion is that the two paths agree, not that either equals a
   * number this file chose.
   */
  const barsOf = (goals: readonly { readonly id: string; readonly bar: number }[]) =>
    Object.fromEntries(goals.map((goal) => [goal.id, goal.bar]));

  const everydayBars = (state: ViewerState) =>
    barsOf(
      createEverydayHost(harnessOf(state).bindings)
        .goalsToday()
        .map((reading) => reading.goal),
    );
  const engineerBars = (state: ViewerState) => barsOf(shiftGoalsOf(state, resources));

  it('grades a whole day the same on the Everyday rail and the Engineer rail', () => {
    const day = wholeDayFor(resources.trafficProfiles, configOf('midtown-office'));
    if (day === undefined) throw new Error('midtown-office has no whole day');
    const whole: ViewerState = {
      ...base(),
      buildingId: 'midtown-office',
      ...wholeDayRun(day),
    };

    expect(engineerBars(whole)).toEqual(everydayBars(whole));

    /*
     * And the disagreement is a real one rather than a shape mismatch: on a whole day the ceiling
     * these two must agree *about* is the slice's, scaled. Asserted from `GOAL_BARS` rather than
     * from 460, so a lane that moves the factor moves this with it.
     */
    const slice: ViewerState = { ...base(), buildingId: 'midtown-office' };
    expect(everydayBars(whole)['worst-wait']).toBe(
      (everydayBars(slice)['worst-wait'] ?? Number.NaN) * GOAL_BARS.worstWholeDayFactor,
    );
  });

  it('grades a slice the same on both, and every day of a week', () => {
    // The control. A shell that hard-coded `'whole-day'` would pass the case above and fail here,
    // which is why the slice is asserted rather than assumed to be the untouched case.
    const slice: ViewerState = { ...base(), buildingId: 'midtown-office' };
    expect(engineerBars(slice)).toEqual(everydayBars(slice));

    const day = wholeDayFor(resources.trafficProfiles, configOf('midtown-office'));
    if (day === undefined) throw new Error('midtown-office has no whole day');
    for (let dayNumber = 1; dayNumber <= 7; dayNumber += 1) {
      for (const run of [{}, wholeDayRun(day)]) {
        const state: ViewerState = {
          ...slice,
          ...run,
          week: { ...slice.week, day: dayNumber },
        };
        expect(engineerBars(state), `day ${String(dayNumber)}`).toEqual(everydayBars(state));
      }
    }
  });

  it('grades a crowd with no authored day the same on both, whatever its window says', () => {
    /*
     * Garden Apartments is one of the three shipped crowds `dayLength.ts` refuses to hand an office
     * day to. Its window is set to a day's length anyway, so a shell that keyed the horizon on a
     * number of seconds instead of on *the building has a day* would disagree here.
     */
    const residential: ViewerState = {
      ...base(),
      buildingId: 'garden-apartments',
      shiftLengthS: 36_000,
      windowStartS: 0,
    };
    expect(engineerBars(residential)).toEqual(everydayBars(residential));
    expect(everydayBars(residential)).toEqual(everydayBars(base()));
  });
});

describe('the slot — how the host crosses from dev/main’s boot to the shell', () => {
  it('starts empty, publishes, replays to late listeners, and honours unsubscribe', () => {
    // One lifecycle in one case, because the slot is the module singleton the shipped wiring
    // uses and this file owns its whole story in order.
    expect(EVERYDAY_HOST.current()).toBeUndefined();

    const heard: string[] = [];
    const early = EVERYDAY_HOST.whenReady(() => heard.push('early'));
    expect(heard).toEqual([]);

    const host = createEverydayHost(harnessOf(base()).bindings);
    EVERYDAY_HOST.publish(host);
    expect(EVERYDAY_HOST.current()).toBe(host);
    expect(heard).toEqual(['early']);

    // A listener arriving after the publish hears about the current host immediately.
    const late = EVERYDAY_HOST.whenReady(() => heard.push('late'));
    expect(heard).toEqual(['early', 'late']);

    // A re-publish (the loader retrying a failed boot) replaces and notifies everyone again.
    const second = createEverydayHost(harnessOf(base()).bindings);
    EVERYDAY_HOST.publish(second);
    expect(EVERYDAY_HOST.current()).toBe(second);
    expect(heard).toEqual(['early', 'late', 'early', 'late']);

    early();
    late();
    EVERYDAY_HOST.publish(host);
    expect(heard, 'an unsubscribed listener stays unsubscribed').toEqual([
      'early',
      'late',
      'early',
      'late',
    ]);
  });
});

/* -------------------------------------------------------------------------- *
 * § 6.4 step 4 — the campaign day is filed. GitHub issue #223.
 * -------------------------------------------------------------------------- */

/**
 * **The seam `AGENT_STATUS.md` said was missing, driven through the façade that has it.**
 *
 * The register recorded the gap as *"marking it cleared or missed needs `closeShift` to know which
 * tower it belonged to"*. It does not: `closeShift` writes `ViewerState.week`, the campaign career
 * is deliberately not on `ViewerState`, and both facts a filing needs — which tower, and what the
 * run read — are on this side of the façade the whole time. So the cases below press
 * `runCampaignDay` and `closeDay` and read the career back, which is the entire mechanism.
 *
 * ## Why the recordings are real runs
 *
 * The verdict is a fold over `observationsAt(recording, recording.endedAt)`, so a stub recording
 * would grade nothing and every case here would pass on a build that files nothing. Both recordings
 * are `garden-apartments` — the one building {@link openingCareer} holds — for one simulated hour,
 * which is the length `runCampaignDay` now seeds and the length § 8's tests can be read at.
 *
 * {@link BUSY} exists because the shipped crowd clears every difficulty: measured on this tree at
 * 3 600 s, `arrivalRatePctPop5min` 6 → 20 all give 100 % carried, a worst wait under 85 s and a peak
 * queue under 11, which holds even `impossible`'s bars. At 30 the worst wait is 219 s, which misses
 * a standard month's 180 and holds an easy month's 240 — so it is the one pair that can show the
 * difficulty reaching the record.
 */
describe('filing the campaign day — issue #223', () => {
  /** A run every § 8.6 test can read, and holds. */
  let CLEAN: VizRecording;
  /** The same building under a crowd that misses a standard month and holds an easy one. */
  let BUSY: VizRecording;

  let loaded: LoadedConfig;

  beforeAll(async () => {
    loaded = await loadConfig(DATA_DIR);
    const base: SimulationConfig = fixtureConfig(loaded, {
      buildingId: 'garden-apartments',
      durationS: 3600,
      seed: 424242n,
      onTimeout: 'report',
    });
    CLEAN = recordRun(base, { recordDecisions: false }).recording;
    BUSY = recordRun(
      { ...base, demand: { arrivalRatePctPop5min: 30 } },
      { recordDecisions: false },
    ).recording;
  }, 300_000);

  interface CampaignHarness {
    readonly bindings: EverydayHostBindings;
    readonly patches: Partial<ViewerState>[];
    state: ViewerState;
    /** `filedRunId === recording.runId`, as `dev/main.ts` holds it. */
    filed: string | undefined;
  }

  /**
   * A harness whose `closeDay` files the way `closeShift` does — and whose `applyPatch` **merges**.
   *
   * Both halves matter. The merge is what makes `runCampaignDay`'s building and length patch land,
   * so a later read sees the state the press wrote rather than the state before it. And `closeDay`
   * latches by `runId` exactly as `dev/main.ts` does, so a second press on a filed sheet returns
   * having written nothing — which is the gate this seam reads back rather than predicts.
   */
  function campaignHarness(recording: VizRecording | undefined, refuses = false): CampaignHarness {
    const patches: Partial<ViewerState>[] = [];
    const h: CampaignHarness = {
      patches,
      state: { ...base(), recording },
      filed: undefined,
      bindings: {
        resources,
        state: () => h.state,
        playheadS: () => 0,
        dayClosed: () =>
          h.state.recording !== undefined && h.filed === h.state.recording.runId,
        runIsOwn: () => true,
        playerHasChosen: () => true,
        dayStartS: () => undefined,
        startRun: () => {},
        intervene: () => {},
        closeDay: () => {
          if (refuses || h.state.recording === undefined) return;
          h.filed = h.state.recording.runId;
        },
        openRunTab: () => {},
        applyPatch: (patch) => {
          patches.push(patch);
          h.state = { ...h.state, ...patch };
        },
        /* § 14.1 is not this harness's subject; the campaign cases press none of these. */
        loadReferenceRuns: () => Promise.resolve([]),
        simulateRecord: () => {
          throw new Error('the campaign harness does not simulate a record');
        },
        enterWatch: () => {},
        stopWatching: () => {},
        playThisCrowd: () => {},
        watching: () => undefined,
        /* No page, so no API origin, so nothing to ask — the honest no-server arm. */
        dailyBoard: undefined,
    signIn: undefined,
        onChange: () => () => {},
      },
    };
    return h;
  }

  const towerOf = (host: ReturnType<typeof createEverydayHost>): CampaignTower =>
    towerById(host.campaign(), 'c1')!;

  it('runs the day at the length this contract is graded over, whatever the state was left at', () => {
    /*
     * **What this guards, said exactly rather than generously.** `initialState` already seeds `c1`'s
     * hour, because the page opens on Garden Apartments — so on a cold load this press writes the
     * length that is already there and changes nothing. What it guards is a state left at some other
     * length: `withBuilding` deliberately does not re-seed (`shiftLengthForContract`'s own
     * docstring), so a player who has taken another assignment, or moved the Engineer length
     * control, arrives at § 8's *Lock it in* carrying it.
     *
     * That matters because of what the length does to the grading, measured on this tree: at
     * 1 800 s Garden Apartments produced 16, 26 and 18 arrivals on three seeds against a wake-up
     * gate of twenty, so two of the three graded **nothing** and could file nothing. At the hour
     * `c1` names, the same three give 29, 38 and 39 and all three grade.
     *
     * So the state is set to the shipped default first: a press that only agreed with what was
     * already there would pass on a build that writes no length at all.
     */
    const h = campaignHarness(undefined);
    h.state = { ...h.state, shiftLengthS: 1800, windowStartS: 600 };
    createEverydayHost(h.bindings).runCampaignDay('c1');

    expect(shiftLengthForContract('c1')).toBeGreaterThan(1800);
    expect(h.patches[0]).toMatchObject({
      buildingId: 'garden-apartments',
      shiftLengthS: shiftLengthForContract('c1'),
      // A contract declares a length and not a part of a day — `scenariosPanel`'s own rule.
      windowStartS: null,
    });
    // And the merge landed, so the run this press starts is built from it.
    expect(h.state.shiftLengthS).toBe(shiftLengthForContract('c1'));
  });

  it('files the day cleared, and the purse and the record move with it', () => {
    const h = campaignHarness(CLEAN);
    const host = createEverydayHost(h.bindings);
    const before = towerOf(host);

    host.runCampaignDay('c1');
    host.closeDay();

    const after = towerOf(host);
    expect(after.day).toBe(before.day + 1);
    expect(after.missed).toBe(0);
    expect(clearedDays(after)).toBe(1);
    expect(purseOf(after)).toBeGreaterThan(purseOf(before));
    expect(host.campaign().today).toBe(2);
  });

  it('files the day missed when a test the run read did not hold', () => {
    const h = campaignHarness(BUSY);
    const host = createEverydayHost(h.bindings);

    host.runCampaignDay('c1');
    host.closeDay();

    const after = towerOf(host);
    expect(after.day).toBe(2);
    expect(after.missed).toBe(1);
    expect(clearedDays(after)).toBe(0);
  });

  it('follows the tower’s difficulty, so the contract sheet’s buttons reach the record', () => {
    /*
     * § D177's standing requirement at the filing seam: **one** recording, one control moved, and
     * the thing that has to change is the day the record kept — not a printed bar. An easy month's
     * 240 s ceiling holds this run's 219 s worst wait and a standard month's 180 does not.
     */
    const easy = createEverydayHost(campaignHarness(BUSY).bindings);
    easy.campaignAct({ kind: 'set-difficulty', towerId: 'c1', difficultyId: 'easy' });
    easy.runCampaignDay('c1');
    easy.closeDay();
    expect(towerOf(easy).missed).toBe(0);

    const standard = createEverydayHost(campaignHarness(BUSY).bindings);
    standard.runCampaignDay('c1');
    standard.closeDay();
    expect(towerOf(standard).difficultyId).toBe('standard');
    expect(towerOf(standard).missed).toBe(1);
  });

  /* ------------------------------------------------------------------------ *
   * GitHub issue #181 — the press, and the legs it produces
   * ------------------------------------------------------------------------ */

  /**
   * **The end-to-end half of § D177's rule, driven through the product's own press.**
   *
   * `campaign/fitOut.test.ts` proves each tier on the legs from a hand-built state. That is the
   * seam; this is the **path** — buy a tier through `campaignAct`, press *Lock it in and run day N*
   * through `runCampaignDay`, and require the run built from the state that press left behind to
   * have different legs. A seam that is proved and a path that never reaches it is precisely the
   * defect issue #181 is about, and the two halves cannot substitute for each other.
   */
  describe('what the tower has bought reaches the run — issue #181', () => {
    /** The legs a state produces, built by `shiftRunConfigOf` exactly as `runShift` builds one. */
    const legsOf = (state: ViewerState): string => {
      const plan = shiftRunConfigOf(resources, state);
      return JSON.stringify(
        recordRun(plan.config, {
          recordDecisions: false,
          outOfServiceCarIds: plan.outOfServiceCarIds,
        }).recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
      );
    };

    /** Press *buy this tier*, then *Lock it in and run day N*, and hand back what the press left. */
    function pressed(buy: { readonly categoryId: ShopCategoryId; readonly level: number } | undefined): ViewerState {
      const h = campaignHarness(undefined);
      const host = createEverydayHost(h.bindings);
      if (buy !== undefined) {
        // § 8.4's two-step buy, through the reducer the screens press — never by writing `fitted`
        // onto the record, which would prove the fold and nothing about the shop. A zero-night tier
        // is fitted on the first press, which is why the second is only sent when there is one.
        host.campaignAct({ kind: 'press-tier', towerId: 'c1', ...buy });
        if (host.campaign().pendingBooking !== undefined) {
          host.campaignAct({ kind: 'pick-start', startIdx: 0 });
        }
      }
      host.runCampaignDay('c1');
      return h.state;
    }

    it('writes the kit the tower is running, and nothing when nothing is bought', () => {
      expect(pressed(undefined).campaignFitOut).toEqual(AS_BUILT);
      expect(pressed({ categoryId: 'doors', level: 1 }).campaignFitOut?.doorSecondsSaved).toBe(1);
    });

    it('changes the legs of the day — a bought tier and an unbought one are two runs', () => {
      // `doors` L1 books zero nights, so it is live on the day it is bought and the press that runs
      // day 1 runs it. A tier with nights would need the days walking forward first, which is
      // `fitOut.test.ts`'s booking case.
      expect(legsOf(pressed({ categoryId: 'doors', level: 1 }))).not.toBe(legsOf(pressed(undefined)));
    });

    it('does not follow the player out to Today’s tower', () => {
      /*
       * The cross-flow case, on the latch's own ground one field over: run a campaign day, leave for
       * § 6's day, and the week's building must not be running another contract's doors. Worse than
       * a stale latch, which decides what a day is *filed* against — this decides what the day *is*.
       */
      const h = campaignHarness(undefined);
      const host = createEverydayHost(h.bindings);
      host.campaignAct({ kind: 'press-tier', towerId: 'c1', categoryId: 'doors', level: 1 });
      host.runCampaignDay('c1');
      expect(h.state.campaignFitOut).not.toEqual(AS_BUILT);

      host.startRun();
      expect(h.state.campaignFitOut).toBeUndefined();
    });
  });

  it('files nothing for a day Today’s tower started', () => {
    const h = campaignHarness(CLEAN);
    const host = createEverydayHost(h.bindings);
    host.startRun();
    host.closeDay();
    expect(towerOf(host).day).toBe(1);
    expect(host.campaign().today).toBe(1);
  });

  it('files nothing against a tower the player walked out on', () => {
    /*
     * The cross-flow case, and the reason the latch is cleared by § 6's own presses rather than
     * only set by § 8's: run a campaign day, leave for Today's tower, close **that** day. Without
     * the clear this banked somebody else's morning against the contract.
     */
    const host = createEverydayHost(campaignHarness(CLEAN).bindings);
    host.runCampaignDay('c1');
    host.startRun();
    host.closeDay();
    expect(towerOf(host).day).toBe(1);
  });

  it('files once, however many times the primary is pressed', () => {
    const host = createEverydayHost(campaignHarness(CLEAN).bindings);
    host.runCampaignDay('c1');
    host.closeDay();
    host.closeDay();
    host.closeDay();
    expect(towerOf(host).day).toBe(2);
    expect(host.campaign().today).toBe(2);
  });

  it('refuses to file tomorrow off the run today was filed from', () => {
    /*
     * The case the `dayClosed` **crossing** guards and the latch does not, so each of the two has a
     * mutation that reddens it alone. The run is on a worker: *Lock it in and run day 2* returns
     * long before there is a recording of day 2, and until it lands the run on the stage is
     * yesterday's — already filed. A press in that window must file nothing, or day 2 is marked
     * from the legs of day 1.
     */
    const host = createEverydayHost(campaignHarness(CLEAN).bindings);
    host.runCampaignDay('c1');
    host.closeDay();
    expect(towerOf(host).day).toBe(2);

    host.runCampaignDay('c1');
    host.closeDay();
    expect(towerOf(host).day).toBe(2);
  });

  it('files one day when a filed run is re-simulated under it', () => {
    /*
     * The case the **latch clear** guards and the crossing does not, so that line has a mutation of
     * its own too. § 1.4's intervention re-runs the day and `dev/main.ts`'s `adopt` clears
     * `filedRunId` when the new recording lands — which re-arms `closeShift`. A campaign day that
     * filed on that second close would advance the contract twice for one morning, which is
     * `shift/week.ts#closeDay`'s `recordGrew` argument one record up: a record growing is not a
     * second day.
     *
     * The adoption is staged on the harness rather than pressed, because `intervene` crosses to
     * `dev/main.ts`'s runner and there is none here; what is driven is the state it leaves behind.
     */
    const h = campaignHarness(CLEAN);
    const host = createEverydayHost(h.bindings);
    host.runCampaignDay('c1');
    host.closeDay();
    expect(towerOf(host).day).toBe(2);

    h.state = { ...h.state, recording: { ...CLEAN, runId: 'grown' } };
    h.filed = undefined;
    host.closeDay();
    expect(towerOf(host).day).toBe(2);
  });

  it('files nothing when the day itself refused to file', () => {
    // `closeShift`'s three silent early returns, as one binding that writes nothing: a campaign day
    // may not be marked by a press that produced no sheet.
    const host = createEverydayHost(campaignHarness(CLEAN, true).bindings);
    host.runCampaignDay('c1');
    host.closeDay();
    expect(towerOf(host).day).toBe(1);
  });

  it('files nothing for a morning the tests could not read, and does not mark it against the player', () => {
    const short = recordRun(
      fixtureConfig(loaded, {
        buildingId: 'garden-apartments',
        durationS: 600,
        seed: 424242n,
        onTimeout: 'report',
      }),
      { recordDecisions: false },
    ).recording;
    const h = campaignHarness(short);
    const host = createEverydayHost(h.bindings);
    host.runCampaignDay('c1');
    host.closeDay();

    // The day itself closed — this is a refusal to *mark a contract*, not a refusal to file a day.
    expect(h.filed).toBe(short.runId);
    expect(towerOf(host).day).toBe(1);
    expect(towerOf(host).missed).toBe(0);
  });

  it('tells the campaign screens, so a filed day redraws the desk it was filed from', () => {
    const host = createEverydayHost(campaignHarness(CLEAN).bindings);
    let notified = 0;
    host.subscribe(() => {
      notified += 1;
    });
    host.runCampaignDay('c1');
    host.closeDay();
    expect(notified).toBeGreaterThan(0);
  });
});

/**
 * **§ 14.1's five methods** — GitHub issue **#182**, [§ D436](../../../../DECISIONS.md).
 *
 * The absence this replaced read *"no watch entry — § 14's spectator flow has no Everyday surface
 * yet"*, and the reason the composition is driven here rather than only in the browser is that the
 * one thing that can go wrong is an **ordering**: § 1.5 refuses to replay something approximate, so
 * a `watchRun` that entered the spectator state and *then* checked would put a stranger's chrome
 * over the player's own day for however long the check took.
 *
 * Both branches run a real simulation and a real reproduction. A gate fed a stub is a gate that
 * tests its own mock.
 */
describe('§ 14.1 — the spectator entry', () => {
  /** A record of the state the harness stands on, so `watchRunConfigOf` re-asks the same question. */
  function recordOf(state: ViewerState): WatchRecord {
    return {
      version: 2,
      seed: String(state.seed),
      buildingId: state.buildingId,
      dispatcherId: state.dispatcherId,
      pattern: state.pattern,
      demandTemplateId: null,
      arrivalRatePctPop5min: null,
      shiftLengthS: 600,
      windowStartS: null,
      day: state.week.day,
      dayIdx: state.week.dayIdx,
      outOfServiceCarIds: [],
      interventions: [],
      ruleRows: [],
    };
  }

  const rowOf = (record: WatchRecord | null, posted: PostedResult): WatchableRun => ({
    id: 'reference-under-test',
    source: 'reference',
    label: 'The house baseline',
    buildingName: 'Garden Apartments',
    subtitle: 'the shipped dispatcher, on the shipped morning',
    record,
    posted,
    blocked: null,
  });

  const NO_FIGURES: PostedResult = { arrived: 0, carried: 0, minutePct: 0, worstWaitS: 0 };

  /** The four figures the gate compares, folded exactly as `watch/reproduce.ts` folds them. */
  const postedOf = (recording: VizRecording): PostedResult => postedResultOf(recording);

  it('offers the filed days first and the reference runs after them', async () => {
    const h = harnessOf(base());
    h.references = [rowOf(recordOf(h.state), NO_FIGURES)];
    const rows = await createEverydayHost(h.bindings).watchableRuns();
    /* No day has been closed on this state, so the references are the whole list. */
    expect(rows.map((row) => row.source)).toEqual(['reference']);
    expect(h.calls).toContain('loadReferenceRuns');
  });

  /*
   * A failed fetch costs the reference rows and nothing else. The filed days are already in hand,
   * and a picker that threw would show none of them — one absent source turning into an empty
   * screen, which is the shape `weekView.ts` keeps two absences apart to avoid.
   */
  it('still answers when the reference fetch fails', async () => {
    const h = harnessOf(base());
    const bindings: EverydayHostBindings = {
      ...h.bindings,
      loadReferenceRuns: () => Promise.reject(new Error('offline')),
    };
    await expect(createEverydayHost(bindings).watchableRuns()).resolves.toEqual([]);
  });

  it('enters the spectator state on a record that reproduces, and only after the gate', () => {
    const h = harnessOf(base());
    h.state = { ...h.state, shiftLengthS: 600, windowStartS: null };
    const record = recordOf(h.state);
    const recording = recordRun(watchRunConfigOf(h.state, resources, record)).recording;
    h.simulate = () => recording;
    const host = createEverydayHost(h.bindings);

    const answer = host.watchRun(rowOf(record, postedOf(recording)));

    expect(answer.blocked, 'a record that reproduces was refused').toBeNull();
    /* The order is the assertion: the gate runs, and the entry happens after it. */
    expect(
      h.calls.filter((call) => call.startsWith('simulateRecord') || call.startsWith('enterWatch')),
    ).toEqual(['simulateRecord', 'enterWatch:reference-under-test']);
    expect(host.watching()?.run.id).toBe('reference-under-test');
    /* And the view is the one derivation both shells draw — § 14.1's pill, not a second one. */
    expect(host.watching()?.view.pill).toContain('REPLAY');
  });

  it('refuses a record that does not reproduce, and enters nothing', () => {
    const h = harnessOf(base());
    h.state = { ...h.state, shiftLengthS: 600, windowStartS: null };
    const record = recordOf(h.state);
    const recording = recordRun(watchRunConfigOf(h.state, resources, record)).recording;
    h.simulate = () => recording;
    const host = createEverydayHost(h.bindings);

    const posted = postedOf(recording);
    const answer = host.watchRun(rowOf(record, { ...posted, carried: posted.carried + 1 }));

    expect(answer.blocked?.ground).toBe('does-not-reproduce');
    /* The reason names the figure that moved — a refusal that says only *no* sends a reader hunting. */
    expect(answer.blocked?.reason).toContain('people carried');
    expect(h.calls).not.toContain('enterWatch:reference-under-test');
    expect(host.watching()).toBeUndefined();
  });

  /*
   * The two grounds that need no simulation are marked on the way out of `watch/library.ts`, and a
   * row already carrying one must not be re-checked: running a whole day to reach a conclusion
   * already in hand is the cost `dev/watchPanel.ts` states and declines to pay twice.
   */
  it('does not simulate a row that is already blocked', () => {
    const h = harnessOf(base());
    const host = createEverydayHost(h.bindings);
    const blocked: WatchableRun = {
      ...rowOf(null, NO_FIGURES),
      blocked: { ground: 'no-record', reason: 'nothing to re-simulate' },
    };
    expect(host.watchRun(blocked).blocked).not.toBeNull();
    expect(h.calls).not.toContain('simulateRecord');
  });

  it('hands the two presses straight through, so one implementation serves both shells', () => {
    const h = harnessOf(base());
    const host = createEverydayHost(h.bindings);
    const row = rowOf(recordOf(h.state), NO_FIGURES);
    host.playThisCrowd(row);
    host.stopWatching();
    expect(h.calls).toContain('playThisCrowd:reference-under-test');
    expect(h.calls).toContain('stopWatching');
  });
});

/* -------------------------------------------------------------------------- *
 * The daily board — #221's read half
 * -------------------------------------------------------------------------- */

/**
 * Four states, and the pair that must never share a sentence is *nobody has posted yet* against
 * *we could not ask*. The ladder beside this board already makes the same distinction for the same
 * reason: its empty line is a claim about the player and is false when a store could not be read.
 *
 * Driven through {@link dailyBoardOf} rather than through the shell, because the composition is the
 * part worth checking and `boundaries.test.ts` keeps the client out of every module but two.
 */
describe('the account port', () => {
  /** A signed-in state, built through the state machine rather than as a literal. */
  const signedInState = (): AccountState =>
    signedIn(SIGNED_OUT, 'tok', {
      id: 'u1',
      email: 'ada@example.com',
      displayName: 'Ada',
      displayNameChosen: true,
    });

  it('answers a signed-out state with a reason when the build has no server', () => {
    const h = harnessOf(base());
    const host = createEverydayHost({ ...h.bindings, signIn: undefined });
    const account = host.account();
    expect(account.token).toBeUndefined();
    /*
     * A state and not an error — § D456's second test asks whether the player can still play. The
     * notice says what the build is, not what the player should do about it.
     */
    expect(account.notice).toContain('no account server');
    expect(account.notice).toContain('Everything except posting');
  });

  it('reads the live state rather than a copy, so the two shells cannot disagree', () => {
    const h = harnessOf(base());
    let live: AccountState = SIGNED_OUT;
    const host = createEverydayHost({
      ...h.bindings,
      signIn: {
        state: () => live,
        requestLink: async () => {},
        chooseDisplayName: async () => {},
        signOut: () => {},
      },
    });
    expect(host.account().token).toBeUndefined();
    // The Engineer menu signs in. The Everyday host must see it without being told.
    live = signedInState();
    expect(host.account().token).toBe('tok');
    expect(host.account().user?.displayName).toBe('Ada');
  });

  it('passes the address through rather than reading a shared form', async () => {
    const h = harnessOf(base());
    const asked: string[] = [];
    const host = createEverydayHost({
      ...h.bindings,
      signIn: {
        state: () => SIGNED_OUT,
        requestLink: async (email) => {
          asked.push(email);
        },
        chooseDisplayName: async () => {},
        signOut: () => {},
      },
    });
    await host.requestSignInLink('grace@example.com');
    expect(asked).toEqual(['grace@example.com']);
  });

  it('is inert rather than throwing on every effect when there is no server', async () => {
    /*
     * The screen is reachable signed out on a build with no server, so each of these is a control a
     * player can press in that state. A throw here would be the § D456 failure exactly: a refusal
     * that stops the game rather than declining one action.
     */
    const h = harnessOf(base());
    const host = createEverydayHost({ ...h.bindings, signIn: undefined });
    await expect(host.requestSignInLink('ada@example.com')).resolves.toBeUndefined();
    await expect(host.chooseDisplayName('Ada')).resolves.toBeUndefined();
    expect(() => {
      host.signOut();
    }).not.toThrow();
  });

  it('drives the name and the sign-out through the port', async () => {
    const h = harnessOf(base());
    const named: string[] = [];
    let out = 0;
    const host = createEverydayHost({
      ...h.bindings,
      signIn: {
        state: () => signedInState(),
        requestLink: async () => {},
        chooseDisplayName: async (name) => {
          named.push(name);
        },
        signOut: () => {
          out += 1;
        },
      },
    });
    await host.chooseDisplayName('Grace');
    host.signOut();
    expect(named).toEqual(['Grace']);
    expect(out).toBe(1);
  });
});

describe('the daily board read', () => {
  /*
   * Deliberately not the date this test runs on. A stub carrying the real today passes whether the
   * key comes from the server or from a local clock — the assertion below would then be green for
   * the wrong reason, which is the coincidence this repository has been caught by before. Mutating
   * the source to compute the date locally must turn the next case red, and with a real date it
   * does not.
   */
  const TODAY = { date: '2019-04-01', seed: '20190401', config: {} } as never;
  const listed = (today: unknown): never => ({ ok: true, value: { boards: [], kinds: [], today } }) as never;
  const failed = (detail: string): never => ({ ok: false, code: 'unreachable', detail, issues: [] }) as never;
  const page = (note: string, entries: readonly unknown[]): never =>
    ({ ok: true, value: { boardKey: 'daily:2019-04-01', metric: 'awtS', note, entries } }) as never;

  it('answers no-server when the page was served with no API origin', async () => {
    const h = harnessOf(base());
    const host = createEverydayHost({ ...h.bindings, dailyBoard: undefined });
    // Not a failed request. Nothing was asked, because there was nothing to ask.
    expect(await host.dailyBoard()).toEqual({ kind: 'no-server' });
  });

  it('asks for the key the server named, never one it worked out for itself', async () => {
    const asked: string[] = [];
    const board = await dailyBoardOf(
      () => Promise.resolve(listed(TODAY)),
      (key, metric) => {
        asked.push(`${key}|${metric}`);
        return Promise.resolve(page('Ranked on average wait.', []));
      },
    );
    // The server's own date. A client that computed this would be a second answer to which day it
    // is, and one that read `daily:` off a key would be a second answer to what a key looks like.
    expect(asked).toEqual(['daily:2019-04-01|awtS']);
    expect(board).toEqual({
      kind: 'board',
      date: '2019-04-01',
      note: 'Ranked on average wait.',
      rows: [],
    });
  });

  it('keeps an empty board apart from a board it could not reach', async () => {
    const empty = await dailyBoardOf(
      () => Promise.resolve(listed(TODAY)),
      () => Promise.resolve(page('Ranked on average wait.', [])),
    );
    const unreachable = await dailyBoardOf(
      () => Promise.resolve(failed('The leaderboard server could not be reached.')),
      () => Promise.reject(new Error('never asked')),
    );
    // Nobody has posted today, which is a board. Versus: we do not know, which is not.
    expect(empty.kind).toBe('board');
    expect(unreachable.kind).toBe('unreachable');
  });

  it('does not ask for a board when the list already failed', async () => {
    let asked = 0;
    const board = await dailyBoardOf(
      () => Promise.resolve(failed('Refused.')),
      () => {
        asked += 1;
        return Promise.resolve(page('', []));
      },
    );
    expect(asked).toBe(0);
    if (board.kind !== 'unreachable') throw new Error('expected unreachable');
    // The server's own sentence, carried rather than replaced.
    expect(board.detail).toBe('Refused.');
  });

  it('says undeclared when the server answered and named no day', async () => {
    const board = await dailyBoardOf(
      () => Promise.resolve(listed(undefined)),
      () => Promise.reject(new Error('never asked')),
    );
    /*
     * The API image is deployed by hand, so a running one can predate the field. *It did not say*
     * is not *there is no board today*, and it is not a failed request either — collapsing it into
     * either would put a sentence on screen that the server never supported.
     */
    expect(board).toEqual({ kind: 'undeclared' });
  });

  it('carries a board-read failure through rather than reporting an empty board', async () => {
    const board = await dailyBoardOf(
      () => Promise.resolve(listed(TODAY)),
      () => Promise.resolve(failed('The server refused that request.')),
    );
    expect(board).toEqual({ kind: 'unreachable', detail: 'The server refused that request.' });
  });
});
