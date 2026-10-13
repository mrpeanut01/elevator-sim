/**
 * **Every door the Everyday host has onto a run, sorted, so a new one cannot open unsorted** — wave
 * AO, lane AO-1, [§ D1360](../../../../DECISIONS.md), the post-AN panel's seat D (D1).
 *
 * ## The hole
 *
 * At a held call, Menu → *Dispatcher workshop* → a style card → *Run a day with this* opened the
 * stage on the attempt's own crowd and stopped at the identical call, so every answer could be
 * rehearsed to 18:00 and then given for score after *Resume*. § D1323 had shut the Engineer's
 * dispatcher card for exactly this reason, by a table over every key of `ViewerState`
 * (`dev/engineerWindow.ts#VIEWER_KEY_ROLES`). The workshop was the same back door through another
 * screen, and it reached the run through `EverydayHost.startRun`, which five screens press.
 *
 * ## What this file holds
 *
 * 1. **{@link DOORS} sorts every member of `EverydayHost`**, typed `Record<keyof EverydayHost, …>`,
 *    so a member added to the interface fails the compile here until somebody says which door it
 *    is. The table and a live host's own keys are asserted equal both ways.
 * 2. **The sort is checked against the code**, member by member over `host.ts`'s object literal: a
 *    member whose body presses a run or writes the state is never `'reads'`, and every `'held'`
 *    member asks § D1360's question (`attemptHoldOver` or `editorWrite`) in its own body.
 * 3. **Every `'held'` door is driven** over a host with an attempt standing, through the real
 *    `watchOnlyRefusal`, and refuses with `ATTEMPT_HOLDS_ITS_DAY` while writing and running
 *    nothing; driven again with the week free, it writes or runs, so the door is real.
 * 4. **The shell's backstop stands at the one place every run is made**: `dev/main.ts#runShift`
 *    asks `attemptRefusesTheRun` before it latches anything, so a door this table never heard of
 *    still cannot run the attempt's day.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { watchOnlyRefusal } from '../dev/engineerWindow.js';
import type { BrowserResources } from '../dev/data.js';
import { initialState, type ViewerState } from '../dev/state.js';
import { contractBuildings } from '../shift/contractDay.test-helper.js';
import type { DayAttempt } from '../shift/attempt.js';
import { ATTEMPT_HOLDS_ITS_DAY } from '../shift/banking.js';
import { watchRecordOf } from '../watch/record.js';
import type { WatchableRun } from '../watch/types.js';

import { createEverydayHost, type EverydayHost, type EverydayHostBindings } from './host.js';

/**
 * Which door a member of the host is onto a run of the day on screen:
 *
 * - `'reads'`: answers without writing the state or asking for a run (a network read or send, the
 *   ledger, the address bar and a subscription included);
 * - `'attempt'`: the standing attempt's own control, which begins, resumes, presses, answers, closes
 *   or leaves it; `dev/main.ts` holds these to the tab that holds the attempt (§ D1361);
 * - `'held'`: would run the day on screen or change how it runs, so it refuses with § D1360's
 *   sentence while an attempt stands there;
 * - `'elsewhere'`: runs or writes only another mode's or another day's week (a rush, a career day, a
 *   replay, tomorrow), moving off the week on screen first, which parks the attempt as the door
 *   does, or puts a parked week back as it stood;
 * - `'watch'`: replays a record somebody filed or posted, which nothing presses or files;
 * - `'rival'`: § 7.4's race, a run beside the day drawn only up to the stage's playhead.
 */
type Door = 'reads' | 'attempt' | 'held' | 'elsewhere' | 'watch' | 'rival';

const DOORS: Readonly<Record<keyof EverydayHost, Door>> = Object.freeze({
  week: 'reads',
  parkedWeeks: 'reads',
  contract: 'reads',
  towerChoice: 'reads',
  scenarioHorizon: 'reads',
  calendarPeriod: 'reads',
  goalsToday: 'reads',
  goalsAhead: 'reads',
  goalsAt: 'reads',
  goalFactsAt: 'reads',
  lastReport: 'reads',
  lastOutcome: 'reads',
  weekHouse: 'reads',
  weekDriverRun: 'reads',
  weekRecord: 'reads',
  dayCrowd: 'reads',
  selection: 'reads',
  seed: 'reads',
  resolvedBuilding: 'reads',
  dayAhead: 'reads',
  tomorrowBriefing: 'reads',
  buildingIds: 'reads',
  buildingById: 'reads',
  dispatchers: 'reads',
  dispatcherById: 'reads',
  drivingProfile: 'reads',
  trafficProfileById: 'reads',
  buildingSpecLine: 'reads',
  buildingStartTimeFloors: 'reads',
  buildingShafts: 'reads',
  campaign: 'reads',
  priceSchedule: 'reads',
  careerNotice: 'reads',
  savedDispatchers: 'reads',
  editedDispatcher: 'reads',
  elevatorSpecs: 'reads',
  buildingSpec: 'reads',
  plainLevers: 'reads',
  dispatcherProfilesFile: 'reads',
  workingSpec: 'reads',
  groupLevers: 'reads',
  patience: 'reads',
  editingSource: 'reads',
  ruleRows: 'reads',
  selectorSpec: 'reads',
  selectorContext: 'reads',
  crowdHasClock: 'reads',
  attemptHold: 'reads',
  setWorkingSpec: 'held',
  setGroupLevers: 'held',
  setRuleRows: 'held',
  setSelectorSpec: 'held',
  startFromDispatcher: 'held',
  runState: 'reads',
  runCarriedBySelection: 'reads',
  recording: 'reads',
  runPending: 'reads',
  runFailure: 'reads',
  leaveCareer: 'elsewhere',
  addressDescribesRun: 'reads',
  campaignHistory: 'reads',
  campaignFiledDays: 'reads',
  careerCloseLine: 'reads',
  /* The career tower's day under every driver, handed to the desk to run: the career's crowd, never the week's. */
  careerDayCensusRuns: 'elsewhere',
  runPointer: 'reads',
  ghostRace: 'reads',
  raceAgainst: 'rival',
  dayStartS: 'reads',
  runHorizon: 'reads',
  interventions: 'reads',
  startRun: 'held',
  playDay: 'attempt',
  dayAttempt: 'reads',
  stageHold: 'reads',
  attemptResumeAtS: 'reads',
  practiceOnStage: 'reads',
  noteShown: 'attempt',
  pinnedCallDone: 'reads',
  notePinnedCallDone: 'attempt',
  dayCallRowsAt: 'reads',
  closeDay: 'attempt',
  /* Today banked first, so tomorrow's day: no attempt stands on a day the week has not dealt. */
  openTomorrow: 'elsewhere',
  openNextWeek: 'elsewhere',
  intervene: 'attempt',
  setDispatcher: 'held',
  setPlainLever: 'held',
  campaignAct: 'elsewhere',
  runCampaignDay: 'elsewhere',
  campaignDay: 'reads',
  answerIncident: 'elsewhere',
  applyBuildingSpec: 'held',
  /* § D1368's sandbox day plays the day's crowd, so it is held while an attempt stands (joined at integration). */
  sandboxStanding: 'reads',
  /* Lane AO-4's two reads, joined at integration: the attempt's left-at clock and the day before's driver. */
  dayAttemptLeftAt: 'reads',
  previousDayDriver: 'reads',
  /* Lane AO-3's two reads, joined at integration: the tower's shape and the career's tower line. */
  buildingShape: 'reads',
  careerTowerSpecLine: 'reads',
  runSandbox: 'held',
  /* Puts the parked week back; it runs nothing and writes only the sandbox day's own week away. */
  leaveSandbox: 'elsewhere',
  watchableRuns: 'reads',
  dailyBoard: 'reads',
  chimeBalance: 'reads',
  /* `dev/main.ts#postCurrentRun` refuses a run of a day whose attempt stands (§ D1360), as *Save recording* does. */
  postRun: 'reads',
  postRushSitting: 'reads',
  rushPosted: 'reads',
  challengeToday: 'reads',
  accountActions: 'reads',
  watchRun: 'watch',
  postedRun: 'reads',
  watching: 'reads',
  stopWatching: 'watch',
  startRush: 'elsewhere',
  rush: 'reads',
  endRush: 'elsewhere',
  leaveRush: 'elsewhere',
  rushBest: 'reads',
  rushDisclosure: 'reads',
  rushRebuild: 'reads',
  pickRushRebuild: 'elsewhere',
  rushOpeningPurse: 'reads',
  bankScenarioClear: 'reads',
  chimeTally: 'reads',
  rushStartsFitted: 'reads',
  spendChime: 'elsewhere',
  startReplay: 'elsewhere',
  chooseTower: 'elsewhere',
  /* Moves the week as the door does, and refuses to write the pin over a week an attempt stands on. */
  playPressDay: 'elsewhere',
  pressCallOnStage: 'reads',
  takeCallAgain: 'held',
  openingAtS: 'reads',
  dayCallOnStage: 'attempt',
  answerDayCall: 'attempt',
  skipDayCalls: 'attempt',
  endDayEarly: 'attempt',
  skipPressCall: 'attempt',
  replay: 'reads',
  leaveReplay: 'elsewhere',
  leaveDayUnfinished: 'attempt',
  playThisCrowd: 'held',
  subscribe: 'reads',
});

/* -------------------------------------------------------------------------- *
 * A host over the shipped contracts' buildings, with or without an attempt
 * -------------------------------------------------------------------------- */

const RESOURCES: BrowserResources = contractBuildings();
const BASE: ViewerState = initialState(RESOURCES, 20261003n);

const ATTEMPT: DayAttempt = {
  contractId: BASE.week.contractId,
  day: BASE.week.day,
  dayIdx: BASE.week.dayIdx,
  seed: BASE.seed.toString(),
  daySeed: BASE.seed.toString(),
  dispatcherId: BASE.dispatcherId,
  interventions: [],
  record: null,
  shownToS: 600,
  pinnedCallDone: false,
  pressCallSkipped: false,
  calls: null,
};

interface Harness {
  readonly host: EverydayHost;
  /** Every press and write a binding received, in order. */
  readonly calls: string[];
}

/**
 * `standing` puts an attempt on the week on screen, and binds `attemptHold` the way `dev/main.ts`
 * does: § D1323's `watchOnlyRefusal` over the state, with the sentence wherever an attempt stands.
 */
function harnessOf(standing: boolean): Harness {
  const calls: string[] = [];
  const state: ViewerState = { ...BASE, recording: { runId: 'doors' } as unknown as ViewerState['recording'] };
  const bindings: EverydayHostBindings = {
    resources: RESOURCES,
    state: () => state,
    playheadS: () => 0,
    dayClosed: () => false,
    runIsOwn: () => true,
    playerHasChosen: () => true,
    dayStartS: () => undefined,
    startRun: () => {
      calls.push('startRun');
    },
    beginDayAttempt: () => {
      calls.push('beginDayAttempt');
    },
    intervene: (atS, change) => {
      calls.push(`intervene:${change.kind}`);
    },
    closeDay: () => {
      calls.push('closeDay');
    },
    openRunTab: () => {
      calls.push('openRunTab');
    },
    applyPatch: () => {
      calls.push('applyPatch');
    },
    ghostRace: () => ({ pick: 'none', rival: undefined, refusal: undefined, pending: false }),
    raceAgainst: (pick) => {
      calls.push(`raceAgainst:${pick}`);
    },
    loadReferenceRuns: () => Promise.resolve([]),
    simulateRecord: () => {
      calls.push('simulateRecord');
    },
    enterWatch: () => {
      calls.push('enterWatch');
    },
    stopWatching: () => {
      calls.push('stopWatching');
    },
    playThisCrowd: () => {
      calls.push('playThisCrowd');
    },
    watching: () => undefined,
    dailyBoard: undefined,
    onChange: () => () => undefined,
    dayAttempt: () => (standing ? ATTEMPT : undefined),
    attemptHold: (patch) =>
      watchOnlyRefusal(state, patch, () => (standing ? ATTEMPT_HOLDS_ITS_DAY : undefined)),
  };
  return { host: createEverydayHost(bindings), calls };
}

/** What a binding call counts as: a run, or a write of the state. */
const RUNS_OR_WRITES = new Set(['startRun', 'beginDayAttempt', 'applyPatch', 'playThisCrowd', 'simulateRecord']);

/** Each `'held'` door, pressed the way its screen presses it, with arguments that move something. */
const HELD_PRESSES: Readonly<Record<string, (host: EverydayHost) => unknown>> = Object.freeze({
  setWorkingSpec: (host) => host.setWorkingSpec({ ...host.workingSpec(), name: 'a different copy' }),
  setGroupLevers: (host) => host.setGroupLevers({ ...host.groupLevers(), parking: !host.groupLevers().parking }),
  setRuleRows: (host) => host.setRuleRows([]),
  setSelectorSpec: (host) => host.setSelectorSpec({ ...host.selectorSpec() }),
  startFromDispatcher: (host) => {
    const other = host.dispatchers().find((profile) => profile.id !== BASE.dispatcherId);
    if (other === undefined) throw new Error('the shipped library has one dispatcher');
    return host.startFromDispatcher(other.id, { parking: true, zone: false });
  },
  startRun: (host) => host.startRun(),
  setDispatcher: (host) => {
    const other = host.dispatchers().find((profile) => profile.id !== BASE.dispatcherId);
    if (other === undefined) throw new Error('the shipped library has one dispatcher');
    return host.setDispatcher(other.id);
  },
  setPlainLever: (host) => host.setPlainLever('patience', 80),
  applyBuildingSpec: (host) => {
    const spec = host.buildingSpec();
    if (spec === undefined) throw new Error('the standing building has no spec');
    return host.applyBuildingSpec(spec);
  },
  runSandbox: (host) => host.runSandbox({ building: undefined, pattern: undefined, dwell: { choice: 'patient' } }),
  takeCallAgain: (host) => host.takeCallAgain(),
  playThisCrowd: (host) =>
    host.playThisCrowd({ id: 'doors', record: watchRecordOf({ ...BASE, seed: BASE.seed + 1n }, RESOURCES) } as unknown as WatchableRun),
});

/** A press's answer: its returned sentence, or the sentence it threw. */
function answerOf(press: () => unknown): unknown {
  try {
    return press();
  } catch (error) {
    return error instanceof Error ? error.message : error;
  }
}

/* -------------------------------------------------------------------------- *
 * The host's own source, member by member
 * -------------------------------------------------------------------------- */

const HOST_SOURCE = readFileSync(fileURLToPath(new URL('./host.ts', import.meta.url)), 'utf8');

/**
 * The body of each member of `createEverydayHost`'s object literal, by name: the lines from one
 * member's key at four spaces' indent to the next. A shorthand member (`goalsAt,`) is its own name.
 */
function hostMemberBodies(): ReadonlyMap<string, string> {
  const start = HOST_SOURCE.indexOf('  const everydayHost: EverydayHost = {');
  if (start < 0) throw new Error('host.ts no longer builds `everydayHost` as one object literal');
  const end = HOST_SOURCE.indexOf('\n  };', start);
  const lines = HOST_SOURCE.slice(start, end).split('\n').slice(1);
  const bodies = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of lines) {
    const key = /^ {4}([a-zA-Z]\w*)(?::|,|\()/u.exec(line)?.[1];
    if (key !== undefined) {
      current = [];
      bodies.set(key, current);
    }
    current?.push(line);
  }
  return new Map([...bodies].map(([key, body]) => [key, body.join('\n')]));
}

/** A press of a run, or a write of the state, as `host.ts` spells it. */
const PRESSES_OR_WRITES =
  /\bb\.(?:startRun|beginDayAttempt|resumeDayAttempt|playThisCrowd|simulateRecord|intervene|applyPatch)\(|\bpressTodaysRun\(|\beverydayHost\.startRun\(|\badvanceDay\(|\beditorWrite\(|\bmoveWeekTo\(/u;

describe('every door the Everyday host has onto a run is sorted — § D1360', () => {
  it('sorts every member of a live host, and nothing the host does not have', () => {
    const live = Object.keys(harnessOf(false).host).sort();
    expect(Object.keys(DOORS).sort()).toEqual(live);
  });

  it('never calls a member that presses a run or writes the state a read, and every held door asks first', () => {
    const bodies = hostMemberBodies();
    const misread: string[] = [];
    const unasked: string[] = [];
    for (const [member, door] of Object.entries(DOORS)) {
      const body = bodies.get(member);
      expect(body, `${member} is not a member of host.ts's object literal`).toBeDefined();
      if (body === undefined) continue;
      if (door === 'reads' && PRESSES_OR_WRITES.test(body)) misread.push(member);
      if (door === 'held' && !/\battemptHoldOver\(|\beditorWrite\(/u.test(body)) unasked.push(member);
    }
    expect(misread, 'sorted as reads, and its body presses a run or writes the state').toEqual([]);
    expect(unasked, 'sorted as held, and its body never asks attemptHold').toEqual([]);
  });

  it('drives every held door: refused in words, writing and running nothing, while an attempt stands', () => {
    const held = Object.entries(DOORS)
      .filter(([, door]) => door === 'held')
      .map(([member]) => member);
    expect(held.filter((member) => HELD_PRESSES[member] === undefined), 'a held door with no press here').toEqual([]);
    for (const member of held) {
      const press = HELD_PRESSES[member];
      if (press === undefined) continue;
      const standing = harnessOf(true);
      expect(answerOf(() => press(standing.host)), `${member} did not refuse`).toBe(ATTEMPT_HOLDS_ITS_DAY);
      expect(standing.calls.filter((call) => RUNS_OR_WRITES.has(call)), `${member} ran or wrote`).toEqual([]);
    }
  });

  it('drives every held door again with the week free, and each one writes or runs, so the door is real', () => {
    for (const [member, press] of Object.entries(HELD_PRESSES)) {
      const free = harnessOf(false);
      expect(answerOf(() => press(free.host)), `${member} refused with no attempt standing`).not.toBe(ATTEMPT_HOLDS_ITS_DAY);
      /* *Take this call again* refuses a week on no pinned day in its own words; every other door writes or runs. */
      if (member === 'takeCallAgain') continue;
      expect(free.calls.some((call) => RUNS_OR_WRITES.has(call)), `${member} wrote and ran nothing`).toBe(true);
    }
  });

  it('keeps the shell’s backstop at the one place every run is made', () => {
    const main = readFileSync(fileURLToPath(new URL('../dev/main.ts', import.meta.url)), 'utf8');
    const runShift = main.indexOf('  function runShift(');
    expect(runShift, 'dev/main.ts no longer has runShift').toBeGreaterThan(0);
    const firstLatch = main.indexOf('runCause = cause;', runShift);
    const backstop = main.indexOf("if (cause === 'player' && attemptRefusesTheRun())", runShift);
    expect(backstop, 'runShift does not ask attemptRefusesTheRun').toBeGreaterThan(runShift);
    expect(backstop, 'runShift latches the ask before the backstop asks').toBeLessThan(firstLatch);
  });
});
