/**
 * **How long a sitting takes, measured against a real clock** — GitHub issue #559.
 *
 * The five session-shape figures on the mode tiles and the Scenario hub are claims about **wall
 * clock**, so they are settled by a clock rather than by a division. This is the instrument that
 * produced the figures `everyday/sittingShape.ts` publishes: it builds the real run each mode
 * plays, through the shipped config builders, simulates it, and then plays the recording end to end
 * through the real {@link Playback} at the shipped default rung against `systemClock()` — asking for
 * a frame on a timer the way `caseStage.ts`' own loop asks for one — and times the whole thing.
 *
 * ## Why it is a clock and not `durationS / simPerRealS`
 *
 * Because the division cannot see three of the four terms, and two of them turned out to matter:
 *
 * 1. **The simulate wait.** A sitting begins with a run being computed, and that is wall clock the
 *    player spends before a frame is drawn. It is **not** a function of the rung, so no derivation
 *    from the ladder can produce it.
 * 2. **Whether the playhead tracks the clock at all.** {@link Playback} re-anchors on every frame
 *    against the display clock, so a frame loop that cannot keep up drops *pictures* and not
 *    *time* — but that is a claim about the implementation, and this measures it instead of
 *    asserting it.
 * 3. **The player's own dwell.** Reading the letter, choosing a repair, looking at the report. It
 *    is not measured here and it is not derived anywhere: see `everyday/sittingShape.ts`, which
 *    says so rather than folding an invented number into the figure.
 *
 * ## Skipped unless asked for, and it writes to a file
 *
 * Gated on `SITTING_OUT` for `honesty/measure.corpus.test.ts`' two reasons: the default suite must
 * not pay for it, and vitest intercepts `console.log`, so a figure printed to a stream does not
 * reach the person who needs it. It costs **as long as the sittings it plays**, by construction —
 * about three quarters of an hour for the four cells below. Run it on a quiet box; a frame loop
 * measured under load measures the box.
 *
 * ```
 * SITTING_OUT=/tmp/sittings.txt npx vitest run --project viz \
 *   packages/viz/src/everyday/sittingClock.measure.test.ts --testTimeout=5400000
 * ```
 *
 * ## It asserts one thing, and it is not a pin
 *
 * `honesty/measure.corpus.test.ts` asserts nothing, on the ground that an exact pin on a measured
 * figure trains people to edit the number. The same applies to the elapsed milliseconds here. What
 * is asserted is the **relation** the published figures rest on — that the playhead reaches the end
 * of the recording, and that it does so within a few per cent of the rung's own mapping — because
 * that relation failing is exactly the case in which a figure derived from the rung would be wrong
 * and nothing else would say so.
 *
 * ## Two legs, gated separately, because they answer different questions at different prices
 *
 * The **clock leg** (`SITTING_OUT`) is the one described above: four cells, three quarters of an
 * hour, and what it establishes is the **rate** — that a second of watching costs a second of the
 * player's evening divided by the rung, to within a few per cent. That relation is the licence for
 * every published figure to be *derived* from the ladder instead of played out.
 *
 * The **span leg** (`SITTING_SPANS_OUT`) censuses how many simulated seconds each of the eighteen
 * fix cases actually watches. A span needs a simulation and no clock, so it costs about a minute
 * rather than a day, and it is the source of `everyday/sittingShape.ts#SITTING_SPANS.fixCase` —
 * the one span that is **not** an authored duration, because each recording runs past its own
 * `durationS` while the building drains.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md) for what binds only this file; the figures it
 * produced and what they did to five player-facing strings are [§ D753](../../../../DECISIONS.md).
 */

import { writeFileSync } from 'node:fs';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher, type ViewerState } from '../dev/state.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { emptyFixitState } from '../fixit/engine.js';
import { fixitContextOf, parseFixitCases } from '../fixit/parse.js';
import { FIXIT_RUN_SWITCHES, fixitRunPlanOf, type FixitResources } from '../fixit/run.js';
import { systemClock } from '../playback/clock.js';
import { Playback } from '../playback/playback.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import { createEverydayHost, type EverydayHostBindings } from './host.js';
import { RUSH_SEED, rushHoldAt } from './rush.js';
import { SITTING_SPANS } from './sittingShape.js';
import { DEFAULT_STAGE_SPEED_INDEX, STAGE_SPEEDS, stageSpeedAt } from './stageScreenModel.js';

const OUT = process.env['SITTING_OUT'];
/** The span leg's own gate — see the docstring's *Two legs*. */
const SPANS_OUT = process.env['SITTING_SPANS_OUT'];
/**
 * **A plumbing check, never a measurement** — `SITTING_SMOKE=1` plays at the ladder's top rung so
 * the four cells' config building can be exercised in a minute instead of in three quarters of an
 * hour. Every line it writes is stamped `SMOKE`, and the rung it ran at is printed beside the
 * figures either way, because a session-shape figure taken at a rung nobody opens at is the defect
 * this whole file exists to close.
 */
const SMOKE = process.env['SITTING_SMOKE'] === '1';
/** The frame interval a browser's `requestAnimationFrame` would offer — 60 Hz, near enough. */
const FRAME_MS = 16;

/** The rung this run plays at — the shipped default, or the top of the ladder under {@link SMOKE}. */
function playedRung(): number {
  const top = STAGE_SPEEDS[STAGE_SPEEDS.length - 1];
  if (SMOKE && top !== undefined) return top.simPerRealS;
  return stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX).simPerRealS;
}

let config: LoadedConfig;
let resources: BrowserResources;
let fixitResources: FixitResources;

async function loadEverything(): Promise<void> {
  config = await loadConfig(DATA_DIR);
  resources = {
    priceSchedule: shippedPriceSchedule(),
    elevatorSpecs: config.elevatorSpecs,
    trafficProfiles: config.trafficProfiles,
    dispatcherProfiles: config.dispatcherProfiles,
    buildings: config.buildings,
    entries: config.buildings.map((building) => ({
      file: `${building.id}.json`,
      config: building.config,
      resolved: building,
    })),
    trafficProfileIds: new Set(config.trafficProfiles.profiles.map((profile) => profile.id)),
    warnings: [],
  };
  fixitResources = {
    entries: resources.entries,
    elevatorSpecs: config.elevatorSpecs,
    trafficProfiles: config.trafficProfiles,
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfileIds: resources.trafficProfileIds,
  };
}

/** Standing on `buildingId` the way a player arrives there — `rushHoldAgreement.test.ts`' helper. */
function standingOn(buildingId: string, dispatcherId = 'collective'): ViewerState {
  return withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, buildingId), resources, dispatcherId);
}

/** *Start the rush*, pressed through `EverydayHost` exactly as `rushScreen.ts` presses it. */
function pressedRush(standing: ViewerState): ViewerState {
  let state = standing;
  const bindings = {
    resources,
    state: () => state,
    rushModifiers: () => [],
    applyPatch: (patch: Partial<ViewerState>) => {
      state = { ...state, ...patch };
    },
    startRun: () => undefined,
    playheadS: () => 0,
    dayClosed: () => false,
    runIsOwn: () => false,
    playerHasChosen: () => false,
    dayStartS: () => undefined,
    intervene: () => undefined,
    closeDay: () => undefined,
    openRunTab: () => undefined,
    ghostRace: () => ({ pick: 'none', rival: undefined, refusal: undefined, pending: false }),
    raceAgainst: () => undefined,
    loadReferenceRuns: () => Promise.resolve([]),
    simulateRecord: () => {
      throw new Error('the rush press asks for no simulation of its own');
    },
    enterWatch: () => undefined,
    stopWatching: () => undefined,
    playThisCrowd: () => undefined,
    watching: () => undefined,
    dailyBoard: undefined,
    bankCompletion: () => undefined,
    onChange: () => () => undefined,
  } as unknown as EverydayHostBindings;
  const refusal = createEverydayHost(bindings).startRush();
  if (refusal !== undefined) throw new Error(`the rush would not start: ${refusal}`);
  return state;
}

interface Played {
  readonly label: string;
  /** What the day asked the simulator for, in simulated seconds. */
  readonly askedS: number;
  /** What the sitting actually watched, in simulated seconds — an outcome, never the ask. */
  readonly spanS: number;
  readonly simulateMs: number;
  readonly watchMs: number;
  readonly frames: number;
}

/**
 * Play each recording against the wall clock, timed, and stop where the **mode** stops.
 *
 * `stopAtS` is what makes a rush measurable at all: a rush's recording runs to `endedAt`, which is
 * the building finally draining long after the demand stopped, and the *sitting* ends at the hold
 * line — `everyday/host.ts#endRush`. Playing to the recording's end would have published a rush
 * more than five times the one a player sits through. Every other cell passes `undefined` and plays
 * to its own end, which is what those screens do.
 */
async function playOut(
  label: string,
  askedS: number,
  recordings: readonly { readonly recording: VizRecording; readonly stopAtS?: number | undefined }[],
  simulateMs: number,
): Promise<Played> {
  const speed = playedRung();
  let watchMs = 0;
  let frames = 0;
  let spanS = 0;
  for (const { recording, stopAtS } of recordings) {
    const endsAt = stopAtS ?? recording.endedAt;
    spanS += endsAt - recording.startedAt;
    const playback = new Playback(recording, systemClock(), { speed, autoplay: true });
    const startedMs = Date.now();
    while (playback.state !== 'ended' && playback.simTimeS < endsAt) {
      playback.frame();
      frames += 1;
      await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
    }
    watchMs += Date.now() - startedMs;
  }
  return { label, askedS, spanS, simulateMs, watchMs, frames };
}

const played: Played[] = [];

describe.runIf(OUT !== undefined)('one sitting of each mode, against a real clock — issue #559', () => {
  beforeAll(async () => {
    await loadEverything();
  }, 600_000);

  /** A building-day, on the week a fresh session opens: Scenario 1, an hour (§ D234). */
  it('plays the opening building-day', async () => {
    const state = initialState(resources, RUSH_SEED);
    const asked = state.shiftLengthS;
    const plan = shiftRunConfigOf(resources, state);
    const startedMs = Date.now();
    const run = recordRun(plan.config, { recordDecisions: false });
    const simulateMs = Date.now() - startedMs;
    played.push(await playOut(`building-day · ${state.buildingId} · ${String(asked)} s asked`, asked, [{ recording: run.recording }], simulateMs));
    expect(played.at(-1)?.spanS).toBeGreaterThan(0);
  }, 3_600_000);

  /** The same loop on the length fifteen of the sixteen contracts run — `DEFAULT_SHIFT_LENGTH_S`. */
  it('plays a building-day at the default shift length', async () => {
    const opening = initialState(resources, RUSH_SEED);
    const state: ViewerState = { ...withBuilding(opening, resources, 'chancery-house'), shiftLengthS: 1800 };
    const plan = shiftRunConfigOf(resources, state);
    const startedMs = Date.now();
    const run = recordRun(plan.config, { recordDecisions: false });
    const simulateMs = Date.now() - startedMs;
    played.push(await playOut(`building-day · ${state.buildingId} · 1800 s asked`, 1800, [{ recording: run.recording }], simulateMs));
    expect(played.at(-1)?.spanS).toBeGreaterThan(0);
  }, 3_600_000);

  /** A fix case: the as-built run, then the pair — `everyday/fixitScreen.ts` mounts both. */
  it('plays a fix-a-building case, as-built then the pair', async () => {
    const cases = parseFixitCases(
      JSON.parse(await (await import('node:fs/promises')).readFile(`${DATA_DIR}/fixit-cases.json`, 'utf8')) as unknown,
      fixitContextOf({
        schedule: shippedPriceSchedule(),
        buildings: resources.entries.map((entry) => entry.resolved),
        trafficProfiles: config.trafficProfiles,
        dispatcherProfiles: config.dispatcherProfiles,
        elevatorSpecs: config.elevatorSpecs,
      }),
    );
    const entry = cases.cases[0];
    if (entry === undefined) throw new Error('no fix case ships');
    const state = { ...emptyFixitState(), selectedRepairIds: entry.repairs.slice(0, 1).map((repair) => repair.id) };
    const plan = fixitRunPlanOf(entry, state, fixitResources);
    const startedMs = Date.now();
    const before = recordRun(plan.asBuilt, FIXIT_RUN_SWITCHES);
    const after = recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES);
    const simulateMs = Date.now() - startedMs;
    /*
     * Three plays rather than two: the as-built block runs once when the case opens, and the pair
     * block runs both recordings at **one** playhead over the longer of them (`caseStage.ts`), so
     * the pair costs one run's watching and not two.
     */
    const longer = before.recording.endedAt - before.recording.startedAt >= after.recording.endedAt - after.recording.startedAt ? before.recording : after.recording;
    played.push(
      await playOut(`fix case · ${entry.id} · as-built then the pair`, entry.run.durationS * 2, [{ recording: before.recording }, { recording: longer }], simulateMs),
    );
    expect(played.at(-1)?.spanS).toBeGreaterThan(0);
  }, 3_600_000);

  /** A rush, on the cell `rushHoldAgreement.json` heads its table with. */
  it('plays a rush to its hold', async () => {
    const pressed = pressedRush(standingOn('midtown-office', 'collective'));
    const plan = shiftRunConfigOf(resources, pressed);
    const startedMs = Date.now();
    const run = recordRun(plan.config, { recordDecisions: false });
    const simulateMs = Date.now() - startedMs;
    /*
     * The hold, from `core`'s own reader over the legs — the moment the stage stops on and the
     * moment `packages/server` replays a posted round to. `rushHoldAgreement.json` pins this cell at
     * 1 640 s; a rush that never holds is watched to the end of its stream.
     */
    const heldS = rushHoldAt(run.recording);
    played.push(
      await playOut(
        `rush · midtown-office · collective · held at ${heldS === undefined ? 'never' : `${String(heldS)} s`}`,
        pressed.shiftLengthS,
        [{ recording: run.recording, stopAtS: heldS }],
        simulateMs,
      ),
    );
    expect(played.at(-1)?.spanS).toBeGreaterThan(0);
  }, 3_600_000);

  it('writes what the clock read', () => {
    const speed = playedRung();
    const lines = [
      SMOKE ? 'SMOKE — plumbing only, NOT a measurement' : 'measured at the shipped default rung',
      `rung: ${String(speed)} sim s per real s (the shipped default is ${stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX).label})`,
      `frame interval asked for: ${String(FRAME_MS)} ms`,
      '',
      'label | asked s | span s | simulate ms | watch ms | watch s | span/watch (sim s per real s) | frames',
    ];
    for (const row of played) {
      const rate = row.watchMs === 0 ? 0 : (row.spanS / row.watchMs) * 1000;
      lines.push(
        [
          row.label,
          String(row.askedS),
          row.spanS.toFixed(1),
          String(row.simulateMs),
          String(row.watchMs),
          (row.watchMs / 1000).toFixed(1),
          rate.toFixed(4),
          String(row.frames),
        ].join(' | '),
      );
      // The relation the published figures rest on: the playhead tracks the clock at the rung.
      if (!SMOKE) expect(Math.abs(rate - speed) / speed).toBeLessThan(0.05);
    }
    writeFileSync(OUT ?? '/dev/null', `${lines.join('\n')}\n`, 'utf8');
  });
});

/**
 * **The span leg — how many simulated seconds a sitting watches, over every shipped case.**
 *
 * Separate from the clock leg above and gated on its own variable, because the two answer different
 * questions and cost different amounts. A *span* needs a simulation and no clock: it is what the
 * player watches, in simulated seconds. A *rate* needs a clock and one cell: it is what a second of
 * that watching costs in their evening. The clock leg establishes the rate to within a few per cent
 * of the rung, which is the licence for every other figure to be derived from the ladder instead of
 * played out at three quarters of an hour a cell — so this leg censuses the eighteen fix cases in
 * about a minute rather than in a day.
 *
 * ```
 * SITTING_SPANS_OUT=/tmp/spans.txt npx vitest run --project viz \
 *   packages/viz/src/everyday/sittingClock.measure.test.ts --testTimeout=1800000
 * ```
 *
 * It is the source of `everyday/sittingShape.ts#SITTING_SPANS.fixCase`, and it exists because that
 * span is the one entry that is **not** an authored duration: each recording runs past its own
 * `durationS` while the building drains, so `2 × durationS` is a floor and not the figure.
 */
describe.runIf(SPANS_OUT !== undefined)('how long every fix case watches — issue #559', () => {
  beforeAll(async () => {
    await loadEverything();
  }, 600_000);

  it('censuses the span of every shipped case', async () => {
    const cases = parseFixitCases(
      JSON.parse(await (await import('node:fs/promises')).readFile(`${DATA_DIR}/fixit-cases.json`, 'utf8')) as unknown,
      fixitContextOf({
        schedule: shippedPriceSchedule(),
        buildings: resources.entries.map((entry) => entry.resolved),
        trafficProfiles: config.trafficProfiles,
        dispatcherProfiles: config.dispatcherProfiles,
        elevatorSpecs: config.elevatorSpecs,
      }),
    );
    const lines = ['case | authored s | as-built span s | pair span s | sitting span s'];
    const spans: number[] = [];
    for (const entry of cases.cases) {
      const state = { ...emptyFixitState(), selectedRepairIds: entry.repairs.slice(0, 1).map((repair) => repair.id) };
      const plan = fixitRunPlanOf(entry, state, fixitResources);
      const before = recordRun(plan.asBuilt, FIXIT_RUN_SWITCHES);
      const after = recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES);
      const beforeSpan = before.recording.endedAt - before.recording.startedAt;
      const afterSpan = after.recording.endedAt - after.recording.startedAt;
      /* The pair block runs both recordings at one playhead over the longer of them — caseStage.ts. */
      const pairSpan = Math.max(beforeSpan, afterSpan);
      const sitting = beforeSpan + pairSpan;
      spans.push(sitting);
      lines.push([entry.id, String(entry.run.durationS), beforeSpan.toFixed(1), pairSpan.toFixed(1), sitting.toFixed(1)].join(' | '));
    }
    lines.push('');
    lines.push(`low ${Math.min(...spans).toFixed(1)} s · high ${Math.max(...spans).toFixed(1)} s`);
    lines.push(`published: low ${String(SITTING_SPANS.fixCase.lowSimS)} s · high ${String(SITTING_SPANS.fixCase.highSimS)} s`);
    writeFileSync(SPANS_OUT ?? '/dev/null', `${lines.join('\n')}\n`, 'utf8');
    /*
     * The one assertion, and it is a **relation** rather than a pin, on the clock leg's own ground:
     * the published span must bracket every shipped case, so a case re-authored longer than the
     * tile advertises goes red here rather than on a player's screen.
     */
    expect(Math.min(...spans)).toBeGreaterThanOrEqual(SITTING_SPANS.fixCase.lowSimS);
    expect(Math.max(...spans)).toBeLessThanOrEqual(SITTING_SPANS.fixCase.highSimS);
  }, 1_800_000);
});
