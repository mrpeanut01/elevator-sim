/**
 * **Both tutorial screens are real runs on the real engine** — [§ D529](../../../../DECISIONS.md)'s
 * own obligation, GitHub issue **#380**.
 *
 * > Both screens are **real runs on the real engine** (`docs/10` § 5.5, § D525 clause 4), not
 * > scripted mocks.
 *
 * And the issue says why the criterion exists rather than leaving it as a preference: *"Asserted,
 * because a tutorial is exactly where a stand-in figure is most tempting."* A first session is the
 * one screen a reviewer is least likely to check the numbers on, and the one a builder is most
 * likely to want to look good.
 *
 * ## What this file runs, and what it refuses to restate
 *
 * The shipped chain, called rather than reimplemented — `fixit/run.ts#fixitRunPlanOf` for the
 * configs, `record/recordRun.ts` for the runs, `fixit/run.ts#measuredOf` for the measurement,
 * `everyday/tutorialModel.ts#workedAnswerFactsOf` for what the screen is handed. `fixit/run.ts`'s
 * own docstring states the rule this obeys: *"a test that assembled its own `SimulationConfig`
 * would vouch for a reimplementation of the call site."* The loader is `fixit/cases.test.ts`'s,
 * because `dev/data.ts` fetches over HTTP and this suite runs under Node — same parsers, same
 * resolution door.
 *
 * ## The claim that actually needs a run
 *
 * Not *the numbers are plausible*, which no test can check. **The worked answer is earned**: the
 * change the tutorial shows moves the count it says it moves, measured on this engine, on the same
 * crowd, with nothing bought. `workedAnswer.ts#movementOf` has an arm for a change that moved
 * nothing and an arm for one that made things worse; those arms exist so this file can assert the
 * shipped tutorial reaches neither.
 *
 * **No timeout annotation, deliberately.** The `viz` project already sets `testTimeout` and
 * `hookTimeout` to 300 000 ms, and `vitest.config.ts`'s own argument for that is *"a default
 * rather than an annotation, because the annotation is a list and the list is the defect"* — it
 * fixes today's files and not tomorrow's. An annotation here would also move `testCost.test.ts`'s
 * derived census, which is a published figure, for a suite that measures at a tenth of a second.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  parseBuilding,
  parseDispatcherProfiles,
  parseElevatorSpecs,
  parseTrafficProfiles,
  resolveBuilding,
} from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { emptyFixitState, toggleRepair } from '../fixit/engine.js';
import { fixitContextOf, parseFixitCases } from '../fixit/parse.js';
import {
  FIXIT_RUN_SWITCHES,
  figureValuesOf,
  fixitRunPlanOf,
  measuredOf,
  type FixitResources,
} from '../fixit/run.js';
import type { FixitCase } from '../fixit/types.js';
import type { VizRecording } from '../contract/types.js';
import { frameAt } from '../frame/frameAt.js';
import { plainLeversOf } from '../mode/plainLevers.js';
import { recordRun, type RecordedRun } from '../record/recordRun.js';
import { rushTutorialWorkedAnswerOf } from './rushScreenModel.js';
import { waitBandsAt } from '../live/bands.js';
import { ManualClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { PACE_HOLD_WAIT_S } from './stagePace.js';
import { DEFAULT_STAGE_SIM_PER_REAL_S as DEFAULT_WATCHING, STAGE_SPEEDS } from './stageScreenModel.js';
import {
  TUTORIAL_CASE_ID,
  TUTORIAL_QUIET_SIM_PER_REAL_S,
  TUTORIAL_STEPS,
  tutorialPaceOf,
  tutorialWalkthroughViewOf,
  tutorialWorkedAnswerOf,
  workedAnswerFactsOf,
} from './tutorialModel.js';

/** `fixit/cases.test.ts`'s loader — the browser loader's exact inputs, read from disk. */
async function resourcesFromDisk(): Promise<FixitResources> {
  const [specsRaw, trafficRaw, dispatchersRaw] = await Promise.all([
    readFile(join(DATA_DIR, 'elevator-specs.json'), 'utf8'),
    readFile(join(DATA_DIR, 'traffic-profiles.json'), 'utf8'),
    readFile(join(DATA_DIR, 'dispatcher-profiles.json'), 'utf8'),
  ]);
  const elevatorSpecs = parseElevatorSpecs(JSON.parse(specsRaw));
  const trafficProfiles = parseTrafficProfiles(JSON.parse(trafficRaw));
  const dispatcherProfiles = parseDispatcherProfiles(JSON.parse(dispatchersRaw));
  const trafficProfileIds = new Set(trafficProfiles.profiles.map((profile) => profile.id));
  const dir = join(DATA_DIR, 'buildings');
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const entries = await Promise.all(
    names.map(async (name) => {
      const config = parseBuilding(JSON.parse(await readFile(join(dir, name), 'utf8')), name);
      return {
        config,
        resolved: resolveBuilding(config, elevatorSpecs, { file: name, trafficProfileIds }),
      };
    }),
  );
  return { entries, elevatorSpecs, trafficProfiles, dispatcherProfiles, trafficProfileIds };
}

let resources: FixitResources;
let entry: FixitCase;
let before: RecordedRun;
let after: RecordedRun;

beforeAll(async () => {
  resources = await resourcesFromDisk();
  const cases = parseFixitCases(
    JSON.parse(await readFile(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as unknown,
    fixitContextOf({
      schedule: shippedPriceSchedule(),
      buildings: resources.entries.map((candidate) => candidate.resolved),
      trafficProfiles: resources.trafficProfiles,
      dispatcherProfiles: resources.dispatcherProfiles,
    }),
  );
  const found = cases.cases.find((candidate) => candidate.id === TUTORIAL_CASE_ID);
  if (found === undefined) throw new Error(`the shipped file has no case "${TUTORIAL_CASE_ID}"`);
  entry = found;

  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  if (diagnosed === undefined) throw new Error('the tutorial case has no diagnosed repair');

  /*
   * The two configs the tutorial runs, built by the shipped planner. Screen one draws the first;
   * screen two draws both. `fixitRunPlanOf(entry, emptyFixitState(), …)` is what the mount asks
   * for as built, and the diagnosed selection is what it asks for as repaired — the same two calls
   * `tutorialScreens.ts#request` makes.
   */
  const asBuiltPlan = fixitRunPlanOf(entry, emptyFixitState(), resources);
  const repairedPlan = fixitRunPlanOf(
    entry,
    toggleRepair(entry, emptyFixitState(), diagnosed.id, shippedPriceSchedule()),
    resources,
  );
  before = recordRun(asBuiltPlan.asBuilt, FIXIT_RUN_SWITCHES);
  after = recordRun(repairedPlan.asRepaired, FIXIT_RUN_SWITCHES);
});

describe('the tutorial names a shipped case, and its answer is that case’s own', () => {
  it('teaches a case this build ships, on the forgiving building § D529 clause 1 asks for', () => {
    expect(entry.id).toBe(TUTORIAL_CASE_ID);
    expect(entry.buildingId).toBe('garden-apartments');
    const building = resources.entries.find(
      (candidate) => candidate.resolved.id === entry.buildingId,
    );
    expect(building, 'the tutorial names a building this build does not ship').toBeDefined();
  });

  it('pins screen one’s control to screen two’s answer, through the case file', () => {
    /*
     * The other half of `tutorialModel.test.ts`'s lesson pin, and the half only this file can make:
     * that test resolves the walkthrough's step against the shipped lever list, and this one
     * resolves the same field against the shipped **repair**. A walkthrough that taught a control
     * the answer does not use would be two demonstrations sharing a screen count.
     *
     * **Strengthened when screen two grew the press.** It used
     * to assert only that the repair patched *something* at `idle.parkingStrategy`, which a repair
     * that parked every car in the lobby would also have passed — the exact opposite lesson, on a
     * control whose face now says *spread the cars out*. The value is compared, both ways.
     */
    const step = TUTORIAL_STEPS.find((candidate) => candidate.id === 'spread');
    expect(step).toBeDefined();
    const lever = plainLeversOf(
      { name: 'baseline', weights: {}, flags: { pool: false, zone: false, bypass: true }, families: {} },
      { parking: false, express: false, dwell: undefined },
    ).find((candidate) => candidate.id === step?.id);
    expect(lever, 'the tutorial names a lever this build does not ship').toBeDefined();

    const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
    const parking = diagnosed?.patch.dispatcher?.idle?.parkingStrategy;
    expect(parking).toBeDefined();
    /*
     * The lever's `writes` clause is the claim — `idle.parkingStrategy: zone-center + split-demand`
     * — and the case's repair is the shipped fact. They agree on the field **and on the value**,
     * which is what licenses the press being described as the lever of that name.
     */
    expect(lever?.writes).toContain(`idle.parkingStrategy: ${String(parking)}`);
  });
});

describe('§ D529 — both screens are real runs on the real engine', () => {
  it('runs two configurations of one day, sharing the crowd, differing only in the change', () => {
    /*
     * The basis, checked rather than claimed. Everything the passenger trace is a function of comes
     * off the case and is identical between the two; only the dispatcher differs. That is what
     * makes the two counts the worked answer prints comparable at all.
     */
    expect(before.recording.legs.length).toBeGreaterThan(0);
    expect(after.recording.legs.length).toBeGreaterThan(0);
    expect(measuredOf(entry, before.recording, after.recording).sameCrowd).toBe(true);
  });

  it('moves the run when the change is applied — compared on the legs', () => {
    /*
     * This repository's standing requirement, applied to the one control the tutorial teaches:
     * *move the control and require the run to change, compared on the legs rather than on a window
     * statistic*. A worked answer whose configuration produced the identical run would be the inert
     * control § D177 found three of, dressed as a lesson.
     */
    const legsKey = (run: RecordedRun): string =>
      JSON.stringify(
        run.recording.legs.map((leg) => [leg.passengerId, leg.boardedAt ?? null, leg.alightedAt ?? null]),
      );
    expect(legsKey(after)).not.toBe(legsKey(before));
  });

  it('draws screen one’s figures off the run rather than off a fixture', () => {
    const figures = figureValuesOf(entry, before.recording).map((figure, index) => ({
      id: `figure-${String(index)}`,
      label: figure.label,
      value: figure.text,
      note: entry.complaint.measure.label,
    }));
    const view = tutorialWalkthroughViewOf({ figures });
    expect(view.figures).toHaveLength(entry.figures.length);
    expect(view.figures.length).toBeGreaterThan(0);
    for (const figure of view.figures) {
      // Every cell says something and none is a stand-in zero or a dash.
      expect(figure.value.trim(), figure.label).not.toBe('');
      expect(figure.value, figure.label).not.toBe('—');
    }
    // The complaint figure is a count of journeys measured on this run, not an authored number.
    expect(view.figures[0]?.value).toMatch(/^\d+ of \d+ journeys$/u);
  });

  it('hands screen two the runs’ own counts, field for field', () => {
    const measured = measuredOf(entry, before.recording, after.recording);
    const facts = workedAnswerFactsOf(entry, before.recording, after.recording);
    expect(facts.before).toBe(measured.complaintBefore);
    expect(facts.after).toBe(measured.complaintAfter);
    expect(facts.measure).toBe(entry.complaint.measure.label);
    // And the prose is the case's, which `fixit/parse.ts` validated at load.
    expect(facts.diagnosis).toBe(entry.diagnosis.text);
    expect(facts.reasoning).toBe(entry.diagnosis.reasoning);
  });

  it('shows an answer that is earned: the change moves the count it says it moves', () => {
    /*
     * The claim that needs a run. `workedAnswer.ts` has an arm for a change that moved nothing and
     * one for a change that made things worse; the shipped tutorial must reach neither, or the
     * first thing a new player is shown is a fix that does not fix.
     */
    const measured = measuredOf(entry, before.recording, after.recording);
    expect(measured.complaintBefore).toBeGreaterThan(0);
    expect(measured.complaintAfter).toBeLessThan(measured.complaintBefore);

    const view = tutorialWorkedAnswerOf(workedAnswerFactsOf(entry, before.recording, after.recording));
    expect(view.movement).not.toContain('moved this count by nothing');
    expect(view.movement).not.toContain('worse');
    expect(view.movement).toContain('with nothing bought');
    // The two counts on screen are the two counts measured, printed with their own measure.
    expect(view.before).toContain(String(measured.complaintBefore));
    expect(view.after).toContain(String(measured.complaintAfter));
  });

  it('says the same thing from both entry points over the measured pair', () => {
    /*
     * § D529 clause 2 again, this time over facts a run produced rather than a literal.
     * `workedAnswer.test.ts` makes the same comparison on a fixture; making it here as well is what
     * says the reuse survives the one input that is not under a test's control.
     */
    const facts = workedAnswerFactsOf(entry, before.recording, after.recording);
    const { why: _tutorialWhy, ...fromTutorial } = tutorialWorkedAnswerOf(facts);
    const { why: _rushWhy, ...fromRush } = rushTutorialWorkedAnswerOf(facts);
    expect(fromRush).toEqual(fromTutorial);
  });
});

/**
 * How far apart the cars stand, averaged over the run.
 *
 * The mean absolute height difference over every pair of cars, sampled at a fixed cadence: one
 * number for *are the three cars together or apart*, which is the whole of what the complaint
 * describes (*"I still watch all three sit downstairs together"*) and the whole of what the caption
 * over the second pane claims.
 *
 * Measured off the frames the block actually paints — `frame/frameAt.ts` is what `caseStage.ts`
 * calls per canvas per frame — so this is the picture's own quantity rather than a second reading of
 * the run. A step of ten simulated seconds over a forty-five minute case is 271 samples, which is
 * far more resolution than a claim this coarse needs and costs nothing.
 */
function meanCarSeparationM(recording: VizRecording, stepS = 10): number {
  let total = 0;
  let pairs = 0;
  for (let t = recording.startedAt; t <= recording.endedAt; t += stepS) {
    const cars = frameAt(recording, t).cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        total += Math.abs((cars[i]?.heightM ?? 0) - (cars[j]?.heightM ?? 0));
        pairs += 1;
      }
    }
  }
  return pairs === 0 ? 0 : total / pairs;
}

describe('the press on screen two is watched, not just measured — `charter S1`', () => {
  it('spreads the cars, which is what the caption over the second pane says it does', () => {
    /*
     * **The one claim this screen makes about the picture rather than about the figures.**
     *
     * Screen two's second beat draws the pair side by side and captions them *AS IT STANDS* and
     * *WITH THE CARS SPREAD OUT*; the control's own read-line, which is `mode/plainLevers.ts`'s,
     * says it *pushes cars apart across the tower*. Neither of those is a figure the worked answer
     * measures — `measuredOf` counts long waits, not geometry — so nothing else in this suite could
     * catch the caption being false, and a caption that describes a picture the run does not draw
     * is the stale refusal this repository has a rule about, pointed at a player's eyes.
     *
     * Measured on this tree at the shipped seed: **1.78 m as built against 5.47 m repaired**, a
     * factor of 3.08 on a six-storey building. The bar is a factor of two, which is loose enough to
     * survive a tuning change to the parking strategy and far too tight to survive the repair being
     * swapped for one that does something else.
     */
    const asBuilt = meanCarSeparationM(before.recording);
    const repaired = meanCarSeparationM(after.recording);
    expect(asBuilt).toBeGreaterThan(0);
    expect(
      repaired / asBuilt,
      `the cars stand ${asBuilt.toFixed(2)} m apart as built and ${repaired.toFixed(2)} m apart repaired — ` +
        'the caption over the second pane says they spread out',
    ).toBeGreaterThan(2);
  });
});

/*
 * **Screen two builds its failure inside about twenty seconds** — GitHub issue #598, § D992.
 *
 * Played end to end through the shipped `Playback` over a `ManualClock`, with the tutorial's own
 * pace rule asked once a frame from the present frame's longest wait — exactly what
 * `caseStage.ts` does for the tutorial. The clock's reading when somebody first stands past a
 * minute on a landing is the number the issue sets a bar on, and it is measured in simulated
 * seconds per real second from the code path rather than from a wall clock on a shared box.
 */
describe('screen two shows the building breaking within about twenty seconds — GitHub issue #598', () => {
  const FRAME_MS = 50;
  const TWENTY_REAL_S = 20;

  /** Real seconds until the canvas first shows somebody past a minute, crossing the quiet at `quiet`. */
  function realSecondsToTrouble(
    recording: VizRecording,
    quiet: number,
  ): { firstS: number; realS: number; totalRealS: number } {
    const clock = new ManualClock();
    const playback = new Playback(recording, clock, { speed: DEFAULT_WATCHING, autoplay: true });
    let firstS: number | undefined;
    let realS = Number.NaN;
    while (playback.state !== 'ended') {
      const t = playback.simTimeS;
      const longest = waitBandsAt(recording, t).longestCurrentWaitS;
      const held = longest !== undefined && longest >= PACE_HOLD_WAIT_S;
      if (firstS === undefined && held) {
        firstS = t;
        realS = clock.now() / 1000;
      }
      const speed =
        quiet === TUTORIAL_QUIET_SIM_PER_REAL_S
          ? tutorialPaceOf({ longestStandingS: longest, watchingSimPerRealS: DEFAULT_WATCHING })
          : held
            ? DEFAULT_WATCHING
            : Math.max(DEFAULT_WATCHING, quiet);
      if (playback.speed !== speed) playback.setSpeed(speed);
      clock.advance(FRAME_MS);
    }
    if (firstS === undefined) throw new Error('the as-built morning never put anybody past a minute');
    return { firstS, realS, totalRealS: clock.now() / 1000 };
  }

  it('puts somebody past a minute on a landing inside twenty real seconds at the shipped speed', () => {
    const measured = realSecondsToTrouble(before.recording, TUTORIAL_QUIET_SIM_PER_REAL_S);
    // The run the constant was derived from: first trouble 1 448 s into the morning, read on the
    // first frame at or after it — a frame at the quiet rung is 4.5 simulated seconds.
    expect(measured.firstS).toBeGreaterThanOrEqual(1448);
    expect(measured.firstS).toBeLessThan(1448 + (TUTORIAL_QUIET_SIM_PER_REAL_S * FRAME_MS) / 1000 + 1);
    expect(measured.realS).toBeLessThanOrEqual(TWENTY_REAL_S);
    // And the whole morning is about a minute of watching, against 11 min 15 s at one rung.
    expect(measured.totalRealS).toBeLessThan(90);
  });

  it('90× is the slowest rung on the ladder that does it — 30× is not enough', () => {
    expect(STAGE_SPEEDS.some((speed) => speed.simPerRealS === TUTORIAL_QUIET_SIM_PER_REAL_S)).toBe(true);
    const slower = STAGE_SPEEDS.filter(
      (speed) => speed.simPerRealS > DEFAULT_WATCHING && speed.simPerRealS < TUTORIAL_QUIET_SIM_PER_REAL_S,
    );
    expect(slower.length).toBeGreaterThan(0);
    for (const rung of slower) {
      expect(realSecondsToTrouble(before.recording, rung.simPerRealS).realS, rung.label).toBeGreaterThan(
        TWENTY_REAL_S,
      );
    }
    expect(realSecondsToTrouble(before.recording, TUTORIAL_QUIET_SIM_PER_REAL_S).realS).toBeLessThanOrEqual(
      TWENTY_REAL_S,
    );
  });
});
