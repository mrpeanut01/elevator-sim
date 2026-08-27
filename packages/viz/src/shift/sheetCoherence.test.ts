/**
 * **Two figures on one sheet, over one cohort, may not disagree** — GitHub issue #288, AC3.
 *
 * ## Why this file exists rather than another case in `report.test.ts`
 *
 * Every property in `honesty/` is a predicate over **one** surface's strings, and issue #288 is
 * precisely the defect that shape cannot see: the Day report's TOOK THE STAIRS cell was internally
 * honest, the mood card's unluckiest-rider row was internally honest, and the two printed `72` and
 * `0` about the same seventy-two people three rows apart. `CLAUDE.md` names that gap in the Phase 9
 * verdict — *"what the corpus still cannot ask is whether two surfaces agree about one run"* — and
 * this is one instrument for one class of it.
 *
 * ## What it asserts, and why nothing here is a pinned number
 *
 * A figure is not wrong for being different from another figure; it is wrong for being different
 * **while claiming the same cohort**. So every assertion below is an identity between two
 * expressions of the same population, and the population is measured on the run rather than assumed:
 *
 * - the run really does turn riders away, or nothing here is about anything (`turnedAway > 0`);
 * - the reporting window really does hold every arrival on this run, so the sheet's window-scoped
 *   figures and its whole-shift figures are genuinely over one cohort — checked, because on a
 *   thirty-minute slice they are **not**, and the sheet then has to say so instead;
 * - and only then, the counts.
 *
 * Nothing pins `72`, `0` or `313 s`. A seed change moves every number in this file and moves none
 * of its assertions.
 *
 * ## The run is the shipped one, with no Parameters edit
 *
 * Secure Tower over its own authored day, built the way the product builds it —
 * `dev/state.ts#shiftRunConfigOf` from `initialState`, with `shift/dayLength.ts#wholeDayRun`'s two
 * window fields, which is what the Everyday run press writes. The issue is reachable at shipped
 * defaults and a fixture that reached it by turning a dial would be proving something else.
 *
 * Midtown Office rides along as the negative control: an office building of the same crowd on the
 * same day that declares `accessZones: []`, so it turns nobody away and every identity below must
 * hold there for a different reason. A rule that only holds where the defect was is a rule fitted
 * to the defect.
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
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { moodAt } from '../live/bands.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { buildingMood, moodObservationsOf } from '../render/mood.js';
import { queueAt } from '../frame/overlay.js';

import { wholeDayFor, wholeDayRun } from './dayLength.js';
import { shiftObservationsOf } from './observations.js';
import type { Observations } from './types.js';

const DATA = new URL('../../../../data/', import.meta.url);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, DATA)), 'utf8')) as unknown;

/** The zoned office tower the issue was filed on, and the unzoned one that is its control. */
const BUILDING_IDS = ['secure-tower', 'midtown-office'] as const;

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

const RESOURCES = resourcesOf();
const configOf = (id: string) => RESOURCES.entries.find((entry) => entry.config.id === id)?.config;

const recordings = new Map<string, VizRecording>();

beforeAll(() => {
  for (const id of BUILDING_IDS) {
    const day = wholeDayFor(RESOURCES.trafficProfiles, configOf(id));
    if (day === undefined) throw new Error(`${id} has no authored day — see shift/dayLength.ts`);
    const state: ViewerState = {
      ...initialState(RESOURCES, 20260824n),
      buildingId: id,
      ...wholeDayRun(day),
    };
    const plan = shiftRunConfigOf(RESOURCES, state);
    recordings.set(id, recordRun(plan.config, { recordDecisions: false }).recording);
  }
}, 600_000);

function recordingOf(id: string): VizRecording {
  const recording = recordings.get(id);
  if (recording === undefined) throw new Error(`no recording for ${id}`);
  return recording;
}

/**
 * The closing fold, once per building.
 *
 * Memoised rather than recomputed per assertion, and it is a cost decision rather than a
 * correctness one: `observationsAt` is pure and uncached by design (the playhead scrubs backwards),
 * so calling it fifteen times over a 7 308-leg day is fifteen full walks for one answer.
 */
const folds = new Map<string, Observations>();
const closingQueues = new Map<string, ReturnType<typeof queueAt>>();

function observationsOf(id: string): Observations {
  const found = folds.get(id);
  if (found !== undefined) return found;
  const recording = recordingOf(id);
  const fold = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  folds.set(id, fold);
  return fold;
}

/** The closing queue, once per building, for {@link observationsOf}'s reason. */
function closingQueuesOf(id: string): ReturnType<typeof queueAt> {
  const found = closingQueues.get(id);
  if (found !== undefined) return found;
  const recording = recordingOf(id);
  const queues = queueAt(recording, recording.endedAt);
  closingQueues.set(id, queues);
  return queues;
}

/* -------------------------------------------------------------------------- *
 * The premises — measured, so a vacuous pass is impossible
 * -------------------------------------------------------------------------- */

describe('the premises this sheet-coherence suite rests on', () => {
  it('turns riders away on the zoned tower and on nobody in the control', () => {
    // The whole point of the fixture. If Secure Tower stopped refusing anybody — a `data/` change,
    // a credential-gap share of zero — every identity below would hold for want of a population,
    // and this is where that is reported instead.
    expect(observationsOf('secure-tower').turnedAway).toBeGreaterThan(0);
    expect(observationsOf('midtown-office').turnedAway).toBe(0);
  });

  it('runs a window that holds every arrival, so the sheet’s two scopes are one cohort here', () => {
    /*
     * The condition that makes the counts below comparable at all, and it is **not** the usual
     * case: `live/observations.test.ts` measures zero spanning windows across all eight shipped
     * buildings on the thirty-minute breadth fixture. A whole authored day is the run where the
     * window-scoped `serviceLevel` and the whole-shift fold genuinely describe one population, and
     * that is exactly the run on which a disagreement between them is a contradiction rather than a
     * difference of scope.
     */
    for (const id of BUILDING_IDS) {
      const recording = recordingOf(id);
      expect(recording.summary.serviceLevel.arrivalCount, id).toBe(observationsOf(id).arrived);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The coherence rules
 * -------------------------------------------------------------------------- */

describe.each(BUILDING_IDS)('%s — no two figures on the sheet contradict each other', (id) => {
  it('counts the same horizon crossings on the stat fold and on the service level', () => {
    /*
     * **The issue's contradiction, as an identity.** `Observations.abandoned` is folded from the
     * legs by `live/observations.ts`; `serviceLevel.overHorizonCount` is folded by
     * `core/metrics/summarize.ts`. Over one cohort they are two expressions of one count, and on
     * the tree this issue was filed against they were `72` and `0` — because the viewer's fold
     * ended a wait at `boardedAt` and `core`'s ended it at
     * `boardedAt ?? abandonedAt ?? refusedAt ?? censoredAtS`.
     *
     * Two modules, two walks, one answer. Deliberately not refactored into one call: `live/` folds
     * at a playhead and `core` folds a finished run, and making the sheet read `core`'s figure
     * would make this check a tautology and would put a whole-run number on a mid-run surface —
     * the violation class § D307's temporal axis exists to find.
     */
    const recording = recordingOf(id);
    const observations = observationsOf(id);
    expect(`${id}: ${String(observations.abandoned)}`).toBe(
      `${id}: ${String(recording.summary.serviceLevel.overHorizonCount)}`,
    );
  });

  it('reaches the same worst wait on the rail’s card and on the sheet’s cell', () => {
    // `worstWaitS` is the whole-shift maximum the goal row grades; `serviceLevel.longestWaitS` is
    // the window's, printed as WORST WAIT. One cohort here, so one number — and the same ending
    // rule reached from two directions.
    const recording = recordingOf(id);
    const windowWorst = recording.summary.serviceLevel.longestWaitS;
    if (windowWorst === null) throw new Error(`${id}: the window held no arrivals`);
    expect(observationsOf(id).worstWaitS).toBe(Math.round(windowWorst));
  });

  it('accounts for every person exactly once — carried, turned away, or still owed a car', () => {
    /*
     * `core`'s conservation identity, at leg level and on the surface a player reads:
     * `generated === delivered + undelivered + abandoned + accessRefused`. `VizSummary` carries no
     * `accessRefused`, which is what `render/mood.ts`'s delivered driver says it cannot name — so
     * the sheet's own three counts have to close over the legs instead, and this is the check that
     * they do. Before the fix `abandoned` overlapped `turnedAway` completely and the sheet's cells
     * could not be totalled at all.
     */
    const observations = observationsOf(id);
    const recording = recordingOf(id);
    const stillOwed = recording.legs.filter(
      (leg) => leg.alightedAt === undefined && leg.refusedAt === undefined,
    ).length;
    expect(observations.carried + observations.turnedAway + stillOwed).toBe(observations.arrived);
  });

  it('never reports somebody as a stairs-taker whose wait ended at the door', () => {
    /*
     * The rule stated over the **legs**, and against the rule it replaced, so the case cannot pass
     * by agreeing with a second copy of the same mistake. `crossed` applies `core`'s ending rule;
     * `crossedIgnoringRefusals` applies the one this issue is about. Their difference is the exact
     * population that used to be printed as *waited past the 15-minute horizon and were never
     * carried*, and on the zoned tower it is asserted to be non-empty — otherwise this whole file
     * is a suite about a run in which nothing could go wrong.
     */
    const recording = recordingOf(id);
    const horizonS = recording.summary.serviceLevel.horizonS;
    const t = recording.endedAt;
    const crossedUnder = (endsAtRefusal: boolean): number =>
      recording.legs.filter((leg) => {
        const endedAt = endsAtRefusal ? (leg.boardedAt ?? leg.refusedAt) : leg.boardedAt;
        return Math.min(endedAt ?? Number.POSITIVE_INFINITY, t) - leg.arrivedAt > horizonS;
      }).length;

    const crossed = crossedUnder(true);
    const crossedIgnoringRefusals = crossedUnder(false);
    if (id === 'secure-tower') {
      expect(crossedIgnoringRefusals - crossed).toBeGreaterThan(0);
    }
    expect(observationsOf(id).abandoned).toBe(crossed);
  });

  it('does not say nobody crossed the horizon on a sheet whose stairs cell counts somebody', () => {
    /*
     * The contradiction as a **reader** meets it: prose against a cell. The mood card's
     * unluckiest-rider row and the Day report's TOOK THE STAIRS figure are drawn on one screen, and
     * the row's calm branch is a universal claim — *"Nobody in the … window waited past the … s
     * abandonment horizon"* — which a non-zero stairs count denies.
     */
    const recording = recordingOf(id);
    const observations = observationsOf(id);
    const mood = buildingMood(moodObservationsOf(recording, closingQueuesOf(id), recording.endedAt));
    const driver = mood.drivers.find((entry) => entry.id === 'abandoned');
    if (driver === undefined) throw new Error('no unluckiest-rider driver');
    if (driver.text.includes('Nobody in the')) {
      expect(`${id}: ${String(observations.abandoned)}`).toBe(`${id}: 0`);
    } else {
      expect(driver.text).toContain(`${String(observations.abandoned)} of `);
    }
  });

  it('does not name a longest wait on the mood card that no rider on the sheet served', () => {
    /*
     * Where the reported `2 915 s` came from. The retrospective mood sub-line prints the longest
     * wait the whole-run banding knows about; the sheet's WORST WAIT prints the window's. One
     * cohort here, so the card's figure may not exceed the sheet's — and on the tree this issue was
     * filed against it exceeded it by two orders of magnitude, because a refused rider read as
     * standing for the rest of the day.
     *
     * Compared through the rendered string rather than the field, because the string is what a
     * reader is asked to believe.
     */
    const recording = recordingOf(id);
    const windowWorst = recording.summary.serviceLevel.longestWaitS;
    if (windowWorst === null) throw new Error(`${id}: the window held no arrivals`);
    const sub = moodAt(recording, recording.endedAt, 'whole-run').sub;
    const printed = /longest (?:wait )?(\d+) s/.exec(sub);
    if (printed === null) {
      // Only the calmest band prints no figure, and it may only do so under half a minute.
      expect(sub).toContain('nobody stood half a minute');
      expect(windowWorst).toBeLessThan(30);
      return;
    }
    expect(Number(printed[1])).toBeLessThanOrEqual(Math.round(windowWorst));
  });
});
