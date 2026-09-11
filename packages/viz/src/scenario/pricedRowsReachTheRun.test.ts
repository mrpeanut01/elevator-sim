/**
 * **Every priced change a scenario can apply reaches a scenario run, compared on the legs** — GitHub
 * issue **#467**, and `CLAUDE.md`'s standing requirement pointed at the rows that issue priced.
 *
 * > *"Move the control and require the run to change, compared on the legs."*
 *
 * `budgetReachesTheRun.test.ts` proves the budget gates two changes, `dispatch-rules` and
 * `destination-panels`, on one stage. This file asks the other question of **every** priced change
 * a scenario run can apply — the rows #467 added among them, and those are named by the provenance
 * their own notes carry rather than listed here: is there a shipped scenario on which buying the
 * change, inside that scenario's **opening** budget, changes who boards which car and when? A row
 * that could not would be a price on a control that does nothing, which is the inert-control class
 * this repository has shipped eleven times in code, arriving through `data/` instead.
 *
 * ## How a change is bought, and why no magnitude is chosen here
 *
 * Every dimension the change covers that the scenario offers is moved, one at a time in the space's
 * declaration order — the order gates are written in — to a value **read off the space**: a
 * categorical dial to the first declared value the baseline does not hold, a boolean to the other
 * one, and a numeric dial to an end of its declared range — the end farther from what the baseline
 * holds first, then the nearer one. A dial whose gate the partly-built vector leaves shut is dropped
 * rather than forced, which is `survivorSpace.ts`'s rule for a disabled control, and the assembled
 * vector must pass `admitEditedVector` on the scenario's own building before it is run. Where the
 * whole bundle is refused or leaves the legs where they were, each covered dial is tried alone.
 *
 * **Both ends, and the first run of this file is why.** It tried the farther end only, and
 * `load-weighing` went unfound on all twelve scenarios for a reason that said nothing about the row:
 * `answer.bypassLoadThreshold`'s farther end, 0, was refused on every building, which left only
 * `answer.overloadThreshold` at 1.5 — the stretch of its range `core` itself measures inert from 1.0
 * up. A file that had reported the row inert on that evidence would have been reporting its own
 * choice of edge.
 *
 * The edges are not a claim that anybody should buy them. They are the declared domain's own ends,
 * which is the only magnitude this file has a basis for, and the question is whether the purchase
 * reaches the run at all.
 *
 * ## Two arms per change, and the second is what makes the first about a budget
 *
 * 1. At the scenario's **base rung** the change is affordable and the legs move.
 * 2. At a rung **one unit short of its price** the same purchase is refused and nothing is applied,
 *    so the run is the unedited one. Skipped only for a change that costs nothing, since no rung is
 *    below zero.
 *
 * ## Compared on the legs, never on a window statistic
 *
 * Who boarded which car and when — `budgetReachesTheRun.test.ts`'s own key, and `docs/12` § 5
 * clause 9's. A mean can move because a run is noisy; the boarding identities move only when the
 * simulation did something different.
 *
 * ## The dials #467 folded into `dispatch-rules`, each on its own
 *
 * The cases above check **rows**, and a row passes on the first purchase of it that moves the legs
 * — the whole bundle is tried first — so a purchase that moves a weight carries `dispatch-rules`
 * past them whatever the dials #467 added to that row do. The review of GitHub PR #506 found that
 * gap. {@link DIAL_WITNESSES} closes it by naming, per dial, a shipped scenario that sells the dial
 * and whose demonstration replication changes when that dial **alone** is moved — to the other
 * boolean, or to an end of its declared range, read off the space as above — inside the scenario's
 * opening budget and bought through that row. Which dials those are is derived rather than listed:
 * every one `dispatch-rules` covers outside the `weights` and `dispatch` sections it priced before
 * #467, so a filter `core` declares tomorrow under a group that row covers is red here until
 * somebody names a scenario whose run it moves.
 *
 * ## Hints that name one of those dials and move nothing
 *
 * A stage's fail-state lever is a hint, and since #467 a hint naming a folded dial costs that row's
 * price to follow. {@link HINTS_THAT_DO_NOT_MOVE_THE_RUN} registers the ones whose single move
 * changes the legs of **no** replication of the scenario's batch — every replication of its tuning
 * seed set and of its holdout set, the second replayed through the same constructor with
 * `stageReplicationSeed`'s holdout derivation — and it is checked in both directions: a hint that
 * newly names a dial that moves none is red, and an entry leaves only on the commit that makes its
 * move change a replication. The batch rather than the replay, because the replay is one
 * replication of the batch and a register keyed to it could tell the owner a purchase changes
 * nothing about a batch it has changed. `data/price-schedule.json`'s `dispatch-rules` note tells
 * the owner, and the register's last case holds that note to it.
 *
 * ## No timeout annotation, and the census is why that is a decision
 *
 * The first version of this file annotated its hook and both cases at 900 000 ms, three sites above
 * `viz`'s 300 000 ms ceiling, and `testCost.test.ts`'s ratchet refused them — *"a case may not be
 * annotated upward to satisfy a budget"*. It was right to: the file runs in about ten seconds alone,
 * against a project default that is already the ceiling. So the cases resolve to that default, and
 * a future annotation here owes the measurement that earns it.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import {
  collectSearchSpace,
  type ParameterValue,
  type SearchParameter,
  type SearchSpace,
} from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { admitPurchase, rungsOf } from './budget.js';
import type { PublishedGoalRates } from './published.js';
import { reachableChangesOf, type ReachableChange } from './survivorSpace.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { parseEngineeringBriefs } from '../briefs/parse.js';
import { editableIdsOf, parseCampaign, type CampaignContext } from '../campaign/parse.js';
import {
  demonstrationConfigFor,
  stageReplicationSeed,
  type StageSeedSet,
} from '../campaign/stageRun.js';
import { FAIL_STATES, type CampaignStage } from '../campaign/types.js';
import {
  admitEditedVector,
  applyEdit,
  resolveEditedProfile,
  valuesFromProfile,
} from '../controls/editedProfile.js';
import { priceOf } from '../pricing/parse.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PriceSchedule } from '../pricing/types.js';
import { recordRun } from '../record/recordRun.js';
import { DATA_DIR, requireBuilding, requireDispatcher } from '../fixtures.test-helper.js';

type Values = Readonly<Record<string, ParameterValue>>;

let config: LoadedConfig;
let space: SearchSpace;
let schedule: PriceSchedule;
let scenarios: readonly CampaignStage[];

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  space = collectSearchSpace();
  schedule = shippedPriceSchedule();
  const published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  const context: CampaignContext = {
    published,
    dimensionIds: space.ids,
    profileIds: new Set(config.dispatcherProfilesById.keys()),
    restrictedFloorIdsByBuilding: new Map(
      [...config.buildingsById.values()].map((building) => [
        building.id,
        restrictedFloorIds(
          building.floors.map((floor) => floor.id),
          building.accessZones,
        ),
      ]),
    ),
    schedule,
  };
  const campaign = parseCampaign(
    JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')) as unknown,
    context,
  );
  const briefs = parseEngineeringBriefs(
    JSON.parse(await readFile(join(DATA_DIR, 'engineering-briefs.json'), 'utf8')) as unknown,
    context,
  );
  scenarios = [...campaign.stages, ...briefs.asScenarios.stages];
});

/** The rows #467 drafted, found by the issue number their provenance notes cite. */
function rowsThisIssuePriced(): readonly string[] {
  return schedule.changes.filter((change) => change.note.includes('#467')).map((change) => change.id);
}

/** Which end of a numeric range to take: the one farther from the held value, or the nearer. */
type End = 'farther' | 'nearer';

/** A value of the declared domain that the baseline does not already hold — read off the space. */
function edgeOf(
  parameter: SearchParameter,
  held: ParameterValue | undefined,
  end: End,
): ParameterValue | undefined {
  switch (parameter.type) {
    case 'categorical':
      return parameter.values.find((value) => value !== held);
    case 'boolean':
      return held !== true;
    case 'integer':
    case 'continuous': {
      const at = typeof held === 'number' ? held : parameter.default;
      const maxIsFarther = Math.abs(parameter.max - at) >= Math.abs(at - parameter.min);
      return maxIsFarther === (end === 'farther') ? parameter.max : parameter.min;
    }
  }
}

/** The dials a change buys on a scenario, moved as the module docstring says, or `undefined`. */
function movedBy(
  stage: CampaignStage,
  dimensionIds: readonly string[],
  end: End,
): Values | undefined {
  const offered = new Set(editableIdsOf(stage.dispatcher.editable, space.ids, schedule));
  const baseline = requireDispatcher(config, stage.dispatcher.startingProfileId);
  let values = valuesFromProfile(space, baseline);
  const moved: Record<string, ParameterValue> = {};
  for (const id of dimensionIds) {
    const parameter = space.byId.get(id);
    if (parameter === undefined || !offered.has(id)) continue;
    const target = edgeOf(parameter, values.get(id), end);
    if (target === undefined || values.get(id) === target) continue;
    const step = applyEdit(space, values, { [id]: target });
    if (!step.ok) continue;
    values = step.values;
    moved[id] = target;
  }
  if (Object.keys(moved).length === 0) return undefined;
  const target = {
    building: requireBuilding(config, stage.building),
    elevatorSpecs: config.elevatorSpecs,
  };
  return admitEditedVector(space, baseline, moved, target).admissible ? moved : undefined;
}

/** The whole bundle first, then each covered dial alone; farther ends before nearer. Distinct. */
function purchasesOf(change: ReachableChange, stage: CampaignStage): readonly Values[] {
  const out: Values[] = [];
  const seen = new Set<string>();
  const groups = [change.dimensionIds, ...change.dimensionIds.map((id) => [id])];
  for (const ids of groups) {
    for (const end of ['farther', 'nearer'] as const) {
      const values = movedBy(stage, ids, end);
      if (values === undefined) continue;
      const key = JSON.stringify(values);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(values);
    }
  }
  return out;
}

/** What the budget lets reach the run: the purchase, or nothing. */
function underBudget(units: number, values: Values): Values | null {
  return admitPurchase(schedule, units, Object.keys(values)).admitted ? values : null;
}

const unedited = new Map<string, string>();

/**
 * One replication of the scenario's own batch, folded to the legs — replication 0 of its tuning
 * set, which is the one the stage replays, unless told otherwise.
 */
function legsOf(
  stage: CampaignStage,
  values: Values | null,
  replication = 0,
  seedSet: StageSeedSet = 'tuning',
): string {
  const key = `${stage.id}/${seedSet}/${String(replication)}`;
  if (values === null) {
    const cached = unedited.get(key);
    if (cached !== undefined) return cached;
  }
  const base = requireDispatcher(config, stage.dispatcher.startingProfileId);
  const building = requireBuilding(config, stage.building);
  let profile = base;
  if (values !== null) {
    const resolved = resolveEditedProfile(
      space,
      base,
      { baseProfileId: base.id, profileId: 'bought', values },
      { building, elevatorSpecs: config.elevatorSpecs },
    );
    if (!resolved.ok) throw new Error(resolved.reason);
    profile = resolved.profile;
  }
  const simulation = {
    ...demonstrationConfigFor({
      stage,
      building,
      dispatcherProfile: profile,
      trafficProfiles: config.trafficProfiles,
      elevatorSpecs: config.elevatorSpecs,
      dispatcherProfiles: config.dispatcherProfiles,
      replication,
    }),
    /* The replay derives the tuning set's seed; the holdout set's is the same derivation. */
    seed: stageReplicationSeed(stage, replication, seedSet),
  };
  const legs = JSON.stringify(
    recordRun(simulation, { recordDecisions: false }).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
    ]),
  );
  if (values === null) unedited.set(key, legs);
  return legs;
}

interface Subject {
  readonly change: ReachableChange;
  readonly stage: CampaignStage;
  readonly baseUnits: number;
  readonly values: Values;
}

let found: ReadonlyMap<string, Subject> | undefined;
const tried = new Map<string, readonly string[]>();

/**
 * For every reachable change, the first shipped scenario on which the base rung buys it and the
 * legs move — **found rather than named**, and cached because finding it costs recorded runs.
 */
function subjects(): ReadonlyMap<string, Subject> {
  if (found !== undefined) return found;
  const out = new Map<string, Subject>();
  for (const change of reachableChangesOf(space, schedule)) {
    const notes: string[] = [];
    search: for (const stage of scenarios) {
      const baseUnits = rungsOf(stage.budget)[0]?.units ?? 0;
      const purchases = purchasesOf(change, stage);
      if (purchases.length === 0) {
        notes.push(`${stage.id}: offers no dial of it the building will take`);
        continue;
      }
      for (const values of purchases) {
        const bought = underBudget(baseUnits, values);
        if (bought === null) {
          notes.push(`${stage.id}: its ${String(baseUnits)} u base cannot pay`);
          continue;
        }
        if (legsOf(stage, bought) !== legsOf(stage, null)) {
          out.set(change.changeId, { change, stage, baseUnits, values: bought });
          break search;
        }
        notes.push(`${stage.id}: legs unmoved by ${Object.keys(values).join(' + ')}`);
      }
    }
    tried.set(change.changeId, notes);
  }
  found = out;
  return out;
}

describe('every priced change a scenario can apply reaches a scenario run — #467', () => {
  it('prices the rows #467 drafted on changes a scenario run can apply', () => {
    const drafted = rowsThisIssuePriced();
    expect(drafted.length, 'no row in data/price-schedule.json cites #467').toBeGreaterThan(0);
    const reachable = new Set(reachableChangesOf(space, schedule).map((change) => change.changeId));
    for (const id of drafted) expect(reachable.has(id), `${id} reaches no scenario run`).toBe(true);
  });

  it(
    'moves the legs, for every such change, on a shipped scenario whose opening budget buys it',
    () => {
      const reached = subjects();
      const lines = [...reached.values()].map(
        (subject) =>
          `${subject.change.changeId} (${String(subject.change.priceUnits)} u, ${subject.change.tier}) ` +
          `on ${subject.stage.id} at its ${String(subject.baseUnits)} u base: ` +
          Object.entries(subject.values)
            .map(([id, value]) => `${id} → ${String(value)}`)
            .join(', '),
      );
      process.stderr.write(`priced changes that reach a run\n  ${lines.join('\n  ')}\n`);
      const missing = reachableChangesOf(space, schedule)
        .filter((change) => !reached.has(change.changeId))
        .map((change) => `${change.changeId}: ${(tried.get(change.changeId) ?? []).join('; ')}`);
      expect(missing).toEqual([]);
      for (const id of rowsThisIssuePriced()) expect(reached.has(id), id).toBe(true);
    },
  );

  it(
    'refuses the same purchase one unit short of its price, so nothing reaches the run',
    () => {
      let refused = 0;
      for (const subject of subjects().values()) {
        if (subject.change.priceUnits === 0) continue;
        const short = underBudget(subject.change.priceUnits - 1, subject.values);
        expect(short, `${subject.change.changeId} admitted below its price`).toBeNull();
        expect(legsOf(subject.stage, short)).toBe(legsOf(subject.stage, null));
        expect(legsOf(subject.stage, subject.values)).not.toBe(legsOf(subject.stage, short));
        refused += 1;
      }
      expect(refused, 'no priced change costs anything, so no refusal arm ran').toBeGreaterThan(0);
    },
  );
});

/* -------------------------------------------------------------------------- *
 * The dials #467 folded into dispatch-rules, one at a time — the review of PR #506
 * -------------------------------------------------------------------------- */

/** The row #467 widened rather than giving five dials rows of their own — its note says why. */
const FOLDED_INTO = 'dispatch-rules';

/** The sections `dispatch-rules` priced before #467 widened it: weights and assignment mode. */
const PRICED_BEFORE_THE_WIDENING: readonly string[] = ['weights', 'dispatch'];

/**
 * **Per folded dial, a shipped scenario that sells it and whose run it moves on its own.**
 *
 * Named rather than found, so a dial disconnected from the run is red on the scenario it used to
 * move rather than passing on another it happens to disturb.
 */
const DIAL_WITNESSES: ReadonlyMap<string, string> = new Map([
  ['eligibility.allowOppositeDirectionPickup', 'brief-e5-handling-capacity'],
  ['eligibility.enRouteDiversion', 'brief-e3-diagnose-the-saturation'],
  ['eligibility.maxLoadFactorForAssignment', 'stage-2-morning-rush'],
  ['constraints.noDirectionReversal', 'stage-9-both-ways-at-once'],
  ['answer.allowBypassIfSoleEligibleCar', 'stage-3-overwhelmed'],
]);

/** A hint: the lever a stage suggests for one of its fail states. */
interface Hint {
  readonly scenarioId: string;
  readonly failState: (typeof FAIL_STATES)[number];
  readonly dial: string;
}

/**
 * **Hints naming a folded dial whose move alone changes no replication of the scenario's batch.**
 *
 * Measured over every replication of both seed sets, and held in both directions by the last
 * `describe` below. An entry leaves on the commit that makes its move change a replication, and a
 * hint that newly names a dial that changes none is red until it is entered here. No reason is
 * attached to any entry, because none is measured: why a move changes nothing on a run is a
 * question for `core`, and a plausible sentence in its place is what § D256 refuses.
 */
const HINTS_THAT_DO_NOT_MOVE_THE_RUN: readonly Hint[] = [
  {
    scenarioId: 'stage-2-morning-rush',
    failState: 'stranded',
    dial: 'answer.allowBypassIfSoleEligibleCar',
  },
  {
    scenarioId: 'stage-7-prove-it',
    failState: 'stranded',
    dial: 'answer.allowBypassIfSoleEligibleCar',
  },
  {
    scenarioId: 'stage-8-the-headline-address',
    failState: 'stranded',
    dial: 'answer.allowBypassIfSoleEligibleCar',
  },
  {
    scenarioId: 'stage-10-the-bed-and-the-visitor',
    failState: 'stranded',
    dial: 'answer.allowBypassIfSoleEligibleCar',
  },
  {
    scenarioId: 'brief-e5-handling-capacity',
    failState: 'stranded',
    dial: 'answer.allowBypassIfSoleEligibleCar',
  },
];

function scenarioNamed(id: string): CampaignStage {
  const stage = scenarios.find((candidate) => candidate.id === id);
  if (stage === undefined) throw new Error(`no shipped scenario is "${id}"`);
  return stage;
}

function spelled(values: Values): string {
  return Object.entries(values)
    .map(([id, value]) => `${id} → ${String(value)}`)
    .join(', ');
}

/** The dials `dispatch-rules` sells outside the sections it priced before #467, in space order. */
function foldedDials(): readonly string[] {
  const row = reachableChangesOf(space, schedule).find((change) => change.changeId === FOLDED_INTO);
  if (row === undefined) throw new Error(`${FOLDED_INTO} reaches no scenario run`);
  return row.dimensionIds.filter(
    (id) => !PRICED_BEFORE_THE_WIDENING.includes(space.byId.get(id)?.section ?? ''),
  );
}

/** Each distinct move of one dial alone, read off the space as the module docstring says. */
function singleMovesOf(stage: CampaignStage, dial: string): readonly Values[] {
  const out: Values[] = [];
  const seen = new Set<string>();
  for (const end of ['farther', 'nearer'] as const) {
    const values = movedBy(stage, [dial], end);
    if (values === undefined) continue;
    const key = JSON.stringify(values);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(values);
  }
  return out;
}

function labelOf(hint: Hint): string {
  return `${hint.scenarioId} ${hint.failState} → ${hint.dial}`;
}

interface HintMeasurement {
  readonly hint: Hint;
  readonly moves: readonly Values[];
  /** The first replication a move changed, or `null` where no move changed any replication. */
  readonly movedOn: string | null;
}

let hintsMeasured: readonly HintMeasurement[] | undefined;

/** Every shipped hint naming a folded dial, measured over both seed sets. Cached: it costs runs. */
function measuredHints(): readonly HintMeasurement[] {
  if (hintsMeasured !== undefined) return hintsMeasured;
  const folded = new Set(foldedDials());
  const out: HintMeasurement[] = [];
  for (const stage of scenarios) {
    for (const failState of FAIL_STATES) {
      const dial = stage.levers[failState];
      if (dial === null || !folded.has(dial)) continue;
      const moves = singleMovesOf(stage, dial);
      let movedOn: string | null = null;
      search: for (const seedSet of ['tuning', 'holdout'] as const) {
        for (let replication = 0; replication < stage.replications; replication += 1) {
          for (const values of moves) {
            const edited = legsOf(stage, values, replication, seedSet);
            if (edited !== legsOf(stage, null, replication, seedSet)) {
              movedOn = `${seedSet} replication ${String(replication)} by ${spelled(values)}`;
              break search;
            }
          }
        }
      }
      out.push({ hint: { scenarioId: stage.id, failState, dial }, moves, movedOn });
    }
  }
  hintsMeasured = out;
  return out;
}

describe('each dial #467 folded into dispatch-rules moves a scenario run on its own', () => {
  it(
    'names a witness for exactly the dials the row sells outside the weights and the assignment mode',
    () => {
      expect([...DIAL_WITNESSES.keys()].sort()).toEqual([...foldedDials()].sort());
    },
  );

  it('moves the legs with each such dial moved alone, on the scenario named for it, inside its opening budget', () => {
    const lines: string[] = [];
    const failures: string[] = [];
    for (const [dial, scenarioId] of DIAL_WITNESSES) {
      const stage = scenarioNamed(scenarioId);
      const baseUnits = rungsOf(stage.budget)[0]?.units ?? 0;
      if (!editableIdsOf(stage.dispatcher.editable, space.ids, schedule).includes(dial)) {
        failures.push(`${dial}: ${scenarioId} does not sell it`);
        continue;
      }
      const notes: string[] = [];
      let moved: Values | undefined;
      for (const values of singleMovesOf(stage, dial)) {
        const admission = admitPurchase(schedule, baseUnits, Object.keys(values));
        if (!admission.admitted) {
          notes.push(`its ${String(baseUnits)} u base cannot pay for ${spelled(values)}`);
          continue;
        }
        expect(admission.changeIds, `${dial} is bought through another row`).toEqual([FOLDED_INTO]);
        if (legsOf(stage, values) !== legsOf(stage, null)) {
          moved = values;
          break;
        }
        notes.push(`legs unmoved by ${spelled(values)}`);
      }
      if (moved === undefined) {
        const why = notes.length > 0 ? notes.join('; ') : 'no single move the building takes';
        failures.push(`${dial} on ${scenarioId}: ${why}`);
      } else {
        const where = `${scenarioId} at its ${String(baseUnits)} u base`;
        lines.push(`${dial} on ${where}: ${spelled(moved)}`);
      }
    }
    process.stderr.write(`folded dials that move a run alone\n  ${lines.join('\n  ')}\n`);
    expect(failures).toEqual([]);
  });
});

describe('a hint naming a folded dial that moves no replication is registered, both directions', () => {
  it('finds hints naming a folded dial, and a single move to try for each', () => {
    const measured = measuredHints();
    const vacuous = 'no shipped hint names a folded dial, so the register is vacuous';
    expect(measured.length, vacuous).toBeGreaterThan(0);
    for (const entry of measured) {
      expect(entry.moves.length, labelOf(entry.hint)).toBeGreaterThan(0);
    }
  });

  it('registers exactly the hints whose move alone changes no replication of either seed set', () => {
    const measured = measuredHints();
    const lines = measured.map(
      (entry) =>
        `${labelOf(entry.hint)}: ` +
        (entry.movedOn === null ? 'no replication moved' : `moved on ${entry.movedOn}`),
    );
    process.stderr.write(`hints naming a folded dial\n  ${lines.join('\n  ')}\n`);
    const inert = measured
      .filter((entry) => entry.movedOn === null)
      .map((entry) => labelOf(entry.hint));
    expect(inert.sort()).toEqual(HINTS_THAT_DO_NOT_MOVE_THE_RUN.map(labelOf).sort());
  });

  it('sees a hint whose move does change the run, so the register is not every hint it measures', () => {
    expect(measuredHints().some((entry) => entry.movedOn !== null)).toBe(true);
  });

  it('tells the owner on the dispatch-rules row, naming the register and exactly the scenarios on it', () => {
    const { note } = priceOf(schedule, FOLDED_INTO);
    const [registerName] = Object.keys({ HINTS_THAT_DO_NOT_MOVE_THE_RUN });
    expect(note.includes(registerName ?? ' '), `the note names ${String(registerName)}`).toBe(
      HINTS_THAT_DO_NOT_MOVE_THE_RUN.length > 0,
    );
    const named = scenarios.map((stage) => stage.id).filter((id) => note.includes(id));
    expect(named.sort()).toEqual(
      [...new Set(HINTS_THAT_DO_NOT_MOVE_THE_RUN.map((hint) => hint.scenarioId))].sort(),
    );
    for (const hint of HINTS_THAT_DO_NOT_MOVE_THE_RUN) {
      expect(note, `the note names the dial ${hint.scenarioId}'s hint names`).toContain(hint.dial);
    }
  });
});
