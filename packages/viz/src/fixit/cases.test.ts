/**
 * The shipped cases, validated against real runs — GAMEPLAY § 10.6 rule 6 as a suite.
 *
 * Rule 6: *"The diagnosed fix must move the complaint by ≥ 80 % on its own, and must not cost the
 * rest of the building more than two points. Check this against a real run before shipping the
 * case."* Every case in `data/fixit-cases.json` is run here, through **the same**
 * `fixitRunPlanOf`/`measuredOf`/`classifyOutcome` chain both panels use
 * (`stageRun.ts`'s lesson: a test that assembled its own request would vouch for a
 * reimplementation of the call site).
 *
 * ## The pinned numbers
 *
 * The as-built figures each case's copy quotes — *"the 9 waits over a minute"*, *"the 341 s
 * mean"* — are asserted here to the digit. A quoted figure that stops reproducing turns this
 * suite red rather than going quietly stale, which is CLAUDE.md's *"if you publish a number, pin
 * it to the run that produced it"* applied to authored copy.
 *
 * ## Moved controls, compared on the legs
 *
 * § D177's standing requirement, applied to every patch a case sells: selecting the repair must
 * change the run, **on the legs**, not on a window statistic. And the refusal binds the other way
 * (§ D227): the five standing extras claim to fix nothing, so selecting all five must leave the
 * as-repaired config equal to the as-built one — a claim pinned by construction, not by a
 * sentence.
 *
 * Timeouts are generous by the repo's convention for suites that simulate: the largest case runs
 * a 101-floor tower twice per assertion block.
 *
 * ## Where the fifteen catalogue cases moved from the prototype, and why
 *
 * GAMEPLAY § 10.5's list is authored against towers this repository does not ship and a closed-form
 * model this surface replaced with real paired runs (§ 20.7). Every case below keeps its § 10.5
 * lesson; what moved is recorded here because rule 6 forced it against the real engine:
 *
 * - **Buildings.** Only Crown Hotel and St Jude Hospital ship by name; the other thirteen cases
 *   are re-homed on shipped towers (the § 10.5 tower is in parentheses in each case's entry
 *   below). Chancery House hosts none: measured at every plausible rate, its six 5 m/s cars never
 *   produce a wait over the minute the complaint measures — the prestige bank is sized for its own
 *   16 %/5 min peak and cannot be made to fail with one configuration fault.
 * - **Mechanisms the patch schema cannot express**, each replaced by the nearest measurable fault:
 *   time-of-day rules (homing's "stop homing after the morning peak", rooftop's "from 17:30",
 *   downpeak's "down-priority for the last hour") do not exist — those cases run at the hour the
 *   complaint is about and repair with parking, a keyed service range, and a keyed car
 *   respectively. En-route call collection (bedcall's "collects every call en route") cannot
 *   happen under the shipped no-diversion default, so that case became a refurbishment lockout the
 *   diagnosed fix lifts. Crowd-shaping fixes (stagger, bell, occupancy's staggered starts) are
 *   expressed as the population present in the measured window, and each case's copy says so
 *   in its own words ("this run watches the first cohort").
 * - **Destination panels demoted from a fix to a purchase.** The prototype's occupancy case buys
 *   "panels and lobby zoning" as the diagnosed fix (14 u). Measured on this engine, panels made
 *   the lobby's long waits worse at that operating point (§ D333's AWT cost, visible here), and
 *   14 u exceeds the parser's 0–9 u diagnosed cap — so panels appear as the plausible-and-costly
 *   wrong buy in four cases, priced 8–13 u, with effect lines that promise a bench run rather than
 *   an outcome.
 * - **Budgets and prices** were re-fitted to the parser's bands (budget 10–16 u, diagnosed 0–9 u):
 *   homing 8 → 10 u budget, goods 9 → 10, gym 9 → 10, occupancy 18 → 16 with its diagnosed
 *   14 → 3 u (the fix changed, above), scan/collective 2 u kept, doubledeck 16 kept.
 * - **`bed-cars-locked-out` scores `complaintGonePct` exactly 80 %** (5 → 1 long waits), the
 *   contract's own bar met without margin; the seed is pinned and the run is deterministic, so
 *   this is knife-edge only against future engine changes, which re-validate every case anyway.
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

import { DATA_DIR } from '../fixtures.test-helper.js';
import {
  COMPLAINT_GONE_PCT,
  REST_DROP_LIMIT_POINTS,
  classifyOutcome,
  emptyFixitState,
  spendOf,
  toggleRepair,
} from './engine.js';
import { parseFixitCases } from './parse.js';
import {
  FIXIT_RUN_SWITCHES,
  figureValuesOf,
  fixitRunPlanOf,
  measuredOf,
  type FixitResources,
  type FixitRunPlan,
} from './run.js';
import type { FixitCase, FixitCases, FixitState } from './types.js';
import { recordRun, type RecordedRun } from '../record/recordRun.js';

const SUITE_TIMEOUT = 300_000;

/**
 * The loaded `data/`, in `FixitResources`' shape — the browser loader's exact inputs, read from
 * disk because `dev/data.ts` fetches over HTTP and this suite runs under Node. Same parsers, same
 * resolution door.
 */
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
let cases: FixitCases;

beforeAll(async () => {
  resources = await resourcesFromDisk();
  const raw = JSON.parse(await readFile(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as unknown;
  cases = parseFixitCases(raw, {
    floorIdsByBuilding: new Map(
      resources.entries.map((entry) => [
        entry.resolved.id,
        entry.resolved.floors.map((floor) => floor.id),
      ]),
    ),
    profileIds: new Set(resources.dispatcherProfiles.profiles.map((profile) => profile.id)),
    engineIds: [
      ...resources.entries.map((entry) => entry.resolved.id),
      ...resources.dispatcherProfiles.profiles.map((profile) => profile.id),
    ],
  });
}, SUITE_TIMEOUT);

function caseOf(id: string): FixitCase {
  const entry = cases.cases.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`the shipped file has no case "${id}"`);
  return entry;
}

/**
 * The pair, run — locally, since GitHub issue #165.
 *
 * `fixit/run.ts` exported `runFixitPair` until both Fix-a-building shells moved their runs to
 * `dev/offThreadRuns.ts`. Nothing outside this file called it after that, and a behaviour with no
 * non-test caller is the defect `docs/05-roadmap.md`'s standing requirement is about — so it was
 * deleted rather than kept for a suite's convenience.
 *
 * Nothing is reimplemented by this helper: what the suite must not restate is
 * {@link fixitRunPlanOf}, which builds the configs, and {@link FIXIT_RUN_SWITCHES}, which settles
 * `recordRun`'s two switches. Both are the shipped module's and both are called here.
 */
function runFixitPair(plan: FixitRunPlan): { readonly before: RecordedRun; readonly after: RecordedRun } {
  return {
    before: recordRun(plan.asBuilt, FIXIT_RUN_SWITCHES),
    after: recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES),
  };
}

/** Boarding/alighting identity of a run, for the compared-on-the-legs assertions. */
function legsKey(run: RecordedRun): string {
  return JSON.stringify(
    run.recording.legs.map((leg) => [leg.passengerId, leg.boardedAt ?? null, leg.alightedAt ?? null]),
  );
}

function diagnosedState(entry: FixitCase): FixitState {
  const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
  if (diagnosed === undefined) throw new Error('no diagnosed repair');
  const state = toggleRepair(entry, emptyFixitState(), diagnosed.id);
  expect(state.selectedRepairIds, 'the diagnosed fix must be affordable').toContain(diagnosed.id);
  return state;
}

describe('the shipped case file', () => {
  it('parses against the shipped data and holds the eighteen authored cases', () => {
    expect(cases.cases.map((entry) => entry.id)).toEqual([
      'sleeping-sky-lobby',
      'zoning-starves-the-top',
      'three-cars-one-cars-work',
      'doors-that-never-close',
      'cars-that-always-go-home',
      'car-park-nobody-serves',
      'express-that-stops-everywhere',
      'deliveries-on-the-passenger-group',
      'one-start-time',
      'every-letter-says-nine',
      'everyone-leaves-at-once',
      'bed-cars-locked-out',
      'two-cars-out-wrong-month',
      'every-deck-calls-itself-full',
      'restaurant-above-the-ballroom',
      'controller-sends-every-car',
      'let-faster-than-the-lifts',
      'gym-on-the-top-floor',
    ]);
  });
});

/**
 * One block per case: the § 10.6 rule 6 validation, the pinned as-built figures, and the
 * moved-control sweep over every patch the case sells.
 */
interface Pinned {
  readonly id: string;
  /** The complaint figure on the as-built run, and after the diagnosed fix alone. */
  readonly before: number;
  readonly after: number;
  /** The four figure texts, exactly as the panel would print them. */
  readonly figureTexts: readonly string[];
  /**
   * Repairs whose patch measurably changes nothing on this case's own day, with the claim in the
   * repair's own effect line. § D227's rule — a stated refusal is pinned by a run, never by a
   * sentence — so the suite asserts byte-identical legs for these and a changed run for the rest.
   */
  readonly inertRepairIds?: readonly string[];
}

const PINNED: readonly Pinned[] = [
  {
    id: 'sleeping-sky-lobby',
    before: 9,
    after: 0,
    figureTexts: [
      '9 of 86 journeys',
      '70 s',
      // 23.9 s before § D332. The deck fix moves `vertical-city`'s as-built run — the complaint
      // count, the worst wait and the healthy figure are all unmoved, so the case reads as it did.
      '23.1 s over 86 boarded journeys',
      '100.0 % of 520 journeys',
    ],
  },
  {
    id: 'zoning-starves-the-top',
    before: 341.1,
    after: 56.5,
    figureTexts: [
      '341.1 s over 132 boarded journeys',
      '112 of 132 journeys',
      '914 s',
      '100.0 % of 68 journeys',
    ],
  },
  {
    id: 'three-cars-one-cars-work',
    before: 7,
    after: 0,
    figureTexts: ['7 of 27 journeys', '112 s', '48.9 s over 27 boarded journeys', '100.0 % of 15 journeys'],
    /*
     * The fourth lift is the § 10.2 lesson made measurable: under a nearest-car rule every tie
     * breaks to the earlier car, so an identical fourth car wins nothing and moves nothing. Its
     * effect line says exactly that, and this pin is what keeps the sentence honest.
     */
    inertRepairIds: ['fourth-lift'],
  },

  /* ---- the fifteen catalogue cases, § 10.5 ---------------------------------- */

  {
    id: 'doors-that-never-close',
    before: 28,
    after: 3,
    figureTexts: [
      '28 of 195 journeys',
      '196 s',
      '30.4 s over 195 boarded journeys',
      '95.6 % of 45 journeys',
    ],
  },
  {
    id: 'cars-that-always-go-home',
    before: 6,
    after: 0,
    figureTexts: [
      '6 of 70 journeys',
      '74 s',
      '32.2 s over 70 boarded journeys',
      '100.0 % of 497 journeys',
    ],
  },
  {
    id: 'car-park-nobody-serves',
    before: 21,
    after: 3,
    figureTexts: [
      '21 of 45 journeys',
      '322 s',
      '70.0 s over 45 boarded journeys',
      '98.0 % of 51 journeys',
    ],
  },
  {
    id: 'express-that-stops-everywhere',
    before: 4,
    after: 0,
    figureTexts: [
      '4 of 100 journeys',
      '110 s',
      '19.0 s over 100 boarded journeys',
      '100.0 % of 112 journeys',
    ],
  },
  {
    id: 'deliveries-on-the-passenger-group',
    before: 15,
    after: 2,
    figureTexts: [
      '15 of 164 journeys',
      '105 s',
      '21.1 s over 164 boarded journeys',
      '94.6 % of 37 journeys',
    ],
  },
  {
    id: 'one-start-time',
    before: 21,
    after: 0,
    figureTexts: [
      '21 of 84 journeys',
      '107 s',
      '32.8 s over 84 boarded journeys',
      '95.0 % of 141 journeys',
    ],
  },
  {
    id: 'every-letter-says-nine',
    before: 10,
    after: 0,
    figureTexts: [
      '10 of 91 journeys',
      '114 s',
      '25.4 s over 91 boarded journeys',
      '95.5 % of 264 journeys',
    ],
  },
  {
    id: 'everyone-leaves-at-once',
    before: 12,
    after: 0,
    figureTexts: [
      '12 of 59 journeys',
      '117 s',
      '33.0 s over 59 boarded journeys',
      '92.7 % of 259 journeys',
    ],
  },
  {
    id: 'bed-cars-locked-out',
    before: 11,
    after: 1,
    figureTexts: [
      '11 of 36 journeys',
      '125 s',
      '42.0 s over 36 boarded journeys',
      '94.7 % of 228 journeys',
    ],
  },
  {
    id: 'two-cars-out-wrong-month',
    before: 19,
    after: 2,
    figureTexts: [
      '19 of 40 journeys',
      '139 s',
      '52.0 s over 40 boarded journeys',
      '100.0 % of 72 journeys',
    ],
  },
  {
    id: 'every-deck-calls-itself-full',
    before: 8,
    after: 0,
    figureTexts: [
      '8 of 257 journeys',
      '77 s',
      '17.3 s over 257 boarded journeys',
      '97.0 % of 867 journeys',
    ],
  },
  {
    id: 'restaurant-above-the-ballroom',
    before: 6,
    after: 0,
    figureTexts: [
      '6 of 44 journeys',
      '79 s',
      '28.7 s over 44 boarded journeys',
      '94.5 % of 217 journeys',
    ],
  },
  {
    id: 'controller-sends-every-car',
    before: 4,
    after: 0,
    figureTexts: [
      '4 of 124 journeys',
      '92 s',
      '23.6 s over 124 boarded journeys',
      '100.0 % of 427 journeys',
    ],
  },
  {
    id: 'let-faster-than-the-lifts',
    before: 32,
    after: 1,
    /*
     * The healthy figure's denominator is **14 journeys**, and it is small on purpose rather than
     * by accident: the scope is every journey touching the lobby, so "the rest" is only the
     * floor-to-floor traffic, which is what a 61 %-overlet office tower has least of. The engine
     * prints the denominator beside the share for exactly this reason (`figureText`'s
     * `rest-away-pct` arm), so the player reads *92.9 % of 14* rather than a bare percentage.
     */
    figureTexts: [
      '32 of 349 journeys',
      '113 s',
      '22.3 s over 349 boarded journeys',
      '92.9 % of 14 journeys',
    ],
  },
  {
    id: 'gym-on-the-top-floor',
    before: 3,
    after: 0,
    figureTexts: [
      '3 of 44 journeys',
      '80 s',
      '30.9 s over 44 boarded journeys',
      '94.7 % of 57 journeys',
    ],
  },
];

/**
 * Every numeral in a case's authored copy that is **not** one of its measured figures, with the
 * source it came from — GAMEPLAY § 20.11's *"a real source … or an explicit `FIXTURE` marker"*.
 *
 * ## Why this exists when the figures are already pinned
 *
 * {@link PINNED} pins what the *engine computes*; the copy quotes those figures **by hand**, one
 * sentence away. So a figure that moved turned this suite red on `figureTexts` and left the
 * sentence quoting the old number — the two are linked by a reviewer's memory, which is the link
 * § D227 records going stale. The assertion below closes it in the direction that matters: every
 * number a player reads in this file is either produced by the run or declared here with where it
 * came from.
 *
 * The declared ones are of exactly two kinds and neither is a measurement:
 *
 * - **floor ids**, in the complainer's line — *tenant, floor 62* is who wrote the letter;
 * - **served headcounts**, from the building document's own population split, which the zoning
 *   case's diagnosis is *about*: they are the fault, not a reading of it.
 *
 * A third kind would be a figure with no source, and it has nowhere to go: an unrecognised numeral
 * fails, and an entry here that stops appearing fails too — a ghost source is a source nobody reads.
 */
const AUTHORED_FACTS: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  'sleeping-sky-lobby': Object.freeze({
    '62': 'a floor of Vertical City — the letter-writer’s own floor, not a reading',
  }),
  'zoning-starves-the-top': Object.freeze({
    '18': 'a floor of the case’s building — the letter-writer’s own floor',
    '600': 'the low bank’s served population, from the building document; the split is the fault',
    '1,170': 'the high bank’s served population, from the same place',
    '585': 'half of 1,170 — the arithmetic the repair line performs in front of the reader',
  }),
  'three-cars-one-cars-work': Object.freeze({
    '4': 'a floor of the case’s building — the letter-writer’s own floor',
  }),

  /*
   * The fifteen catalogue cases declare **eight** facts between them, and seven are the same kind:
   * the floor the letter-writer lives or works on. That is the shape rule 6 predicts — a case whose
   * copy quotes its own run needs no third-party numbers — and the one exception is named below.
   */
  'cars-that-always-go-home': Object.freeze({
    '52': 'a floor of the case’s building — the letter-writer’s own floor',
  }),
  'express-that-stops-everywhere': Object.freeze({
    '25': 'a floor of the case’s building — the letter-writer’s own floor',
  }),
  'one-start-time': Object.freeze({
    '16': 'a floor of the case’s building — the letter-writer’s own floor',
  }),
  'two-cars-out-wrong-month': Object.freeze({
    '21': 'a floor of the case’s building — the letter-writer’s own floor',
  }),
  'controller-sends-every-car': Object.freeze({
    '40': 'a floor of the case’s building — the letter-writer’s own floor',
  }),
  'let-faster-than-the-lifts': Object.freeze({
    '19': 'a floor of the case’s building — the letter-writer’s own floor',
    /*
     * The one fact in these fifteen that is not a floor id. It is arithmetic over the case's own
     * as-built patch against the shipped building, checkable by hand: the building document totals
     * 992 people, the as-built floor populations total 1,601, and 1,601 / 992 is a rise of 61.4 %.
     * It is the fault rather than a reading of it — the same footing as the zoning case's two
     * served headcounts above.
     */
    '61': 'the population rise the as-built patch encodes: 1,601 people against the building document’s 992',
  }),
  'gym-on-the-top-floor': Object.freeze({
    '5': 'a floor of the case’s building — the letter-writer’s own floor',
  }),
});

/** Every number a reader could match against a figure. `NUMBER_TOKEN`'s rule, one package over. */
const COPY_NUMERAL = /\d[\d,]*(?:\.\d+)?/g;

/** Every player-facing string a case authors, named so a failure says which sentence. */
function authoredCopyOf(entry: FixitCase): readonly (readonly [string, string])[] {
  return [
    ['name', entry.name],
    ['asBuilt.note', entry.asBuilt.note],
    ['complaint.text', entry.complaint.text],
    ['complaint.complainer', entry.complaint.complainer],
    ['complaint.measure.label', entry.complaint.measure.label],
    ['symptom', entry.symptom],
    ['diagnosis.text', entry.diagnosis.text],
    ['diagnosis.reasoning', entry.diagnosis.reasoning],
    ['result.head', entry.result.head],
    ['result.body', entry.result.body],
    ...entry.figures.map((figure, index): readonly [string, string] => [
      `figures[${String(index)}].label`,
      figure.label,
    ]),
    ...entry.repairs.flatMap((repair): readonly (readonly [string, string])[] => [
      [`repairs.${repair.id}.name`, repair.name],
      [`repairs.${repair.id}.effect`, repair.effect],
    ]),
  ];
}

/**
 * Whether `numeral` is one of these measured values, as a reader would read it.
 *
 * Rounding-tolerant in one direction only: the copy may quote *341 s* for a measured `341.1`,
 * because that is what a sentence does with a figure, and it may not quote a value the run did not
 * produce. Compared at the copy's own precision, so `341` matches `341.1` and `342` does not.
 */
function isMeasured(numeral: string, measured: readonly number[]): boolean {
  const bare = numeral.replaceAll(',', '');
  const places = bare.includes('.') ? (bare.split('.')[1]?.length ?? 0) : 0;
  return measured.some((value) => value.toFixed(places) === bare);
}

describe.each(PINNED)('case $id — its copy quotes the run and nothing else (§ 20.11)', (pinned) => {
  it('every authored numeral is a measured figure or a declared fact', () => {
    const entry = caseOf(pinned.id);
    const facts = AUTHORED_FACTS[pinned.id] ?? {};
    /*
     * The values the run produced, taken from the same pins the panel's figures are checked
     * against plus the complaint measurement itself — never re-derived here, for `stageRun.ts`'s
     * reason: a second computation of what the case measured would vouch for itself.
     */
    const measured = [
      pinned.before,
      pinned.after,
      ...pinned.figureTexts.flatMap((text) =>
        [...text.matchAll(COPY_NUMERAL)].map((match) => Number(match[0].replaceAll(',', ''))),
      ),
    ].filter((value) => Number.isFinite(value));

    const unsourced: string[] = [];
    const usedFacts = new Set<string>();
    for (const [field, text] of authoredCopyOf(entry)) {
      for (const match of text.matchAll(COPY_NUMERAL)) {
        const numeral = match[0].replace(/,$/, '');
        if (isMeasured(numeral, measured)) continue;
        if (numeral in facts) {
          usedFacts.add(numeral);
          continue;
        }
        unsourced.push(`${field}: ${numeral} — in ${JSON.stringify(text.slice(0, 90))}`);
      }
    }
    expect(
      unsourced,
      'an authored figure with no source. Either it is a reading, in which case pin it in PINNED ' +
        'and let the run produce it, or it is a fact about the building, in which case declare it ' +
        'in AUTHORED_FACTS with where it came from. § 20.11: nothing is presented as truth unsourced.',
    ).toEqual([]);

    // And no ghost: a declared source for a numeral the copy no longer quotes is a source nobody reads.
    expect(
      Object.keys(facts).filter((numeral) => !usedFacts.has(numeral)),
      'delete the AUTHORED_FACTS entry; a list of ghosts is how a list stops being read',
    ).toEqual([]);
  });
});

describe.each(PINNED)('case $id', (pinned) => {
  it(
    'is validated by a real run pair: the diagnosed fix clears both measured bars (§ 10.6 rule 6)',
    () => {
      const entry = caseOf(pinned.id);
      const state = diagnosedState(entry);
      const pair = runFixitPair(fixitRunPlanOf(entry, state, resources));
      const measurement = measuredOf(entry, pair.before.recording, pair.after.recording);

      // The two § 9 thresholds, asserted on the measurement itself before the classification.
      expect(measurement.complaintGonePct).not.toBeNull();
      expect(measurement.complaintGonePct ?? 0).toBeGreaterThanOrEqual(COMPLAINT_GONE_PCT);
      expect(measurement.restDeltaPoints).not.toBeNull();
      expect(measurement.restDeltaPoints ?? -100).toBeGreaterThanOrEqual(-REST_DROP_LIMIT_POINTS);

      // The pinned complaint figures — the numbers the case's own copy quotes.
      expect(measurement.complaintBefore).toBeCloseTo(pinned.before, 1);
      expect(measurement.complaintAfter).toBeCloseTo(pinned.after, 1);

      // And the classification agrees: the case is FIXED with its authored head.
      const outcome = classifyOutcome(entry, measurement, spendOf(entry, state));
      expect(outcome.kind).toBe('fixed');
      expect(outcome.head).toBe(entry.result.head);
    },
    SUITE_TIMEOUT,
  );

  it(
    'shows four figures measured from the as-built run, pinned to the digit',
    () => {
      const entry = caseOf(pinned.id);
      const pair = runFixitPair(fixitRunPlanOf(entry, emptyFixitState(), resources));
      const figures = figureValuesOf(entry, pair.before.recording);
      expect(figures.map((figure) => figure.text)).toEqual(pinned.figureTexts);
      // Exactly one figure reads bad and at least one healthy — § 10.6 rule 1, on the values the
      // player actually sees rather than only on the authored intent.
      expect(figures.filter((figure) => figure.reading === 'bad')).toHaveLength(1);
      expect(figures.some((figure) => figure.reading === 'healthy')).toBe(true);
    },
    SUITE_TIMEOUT,
  );

  it(
    'sells no inert repair: every patch changes the run, compared on the legs (§ D177)',
    () => {
      const entry = caseOf(pinned.id);
      const base = runFixitPair(fixitRunPlanOf(entry, emptyFixitState(), resources)).before;
      const baseKey = legsKey(base);
      for (const repair of entry.repairs) {
        // Constructed directly rather than through the reducer: the new shaft is deliberately
        // unaffordable, and what is under test here is the patch, not the gate.
        const state: FixitState = { ...emptyFixitState(), selectedRepairIds: [repair.id] };
        const pair = runFixitPair(fixitRunPlanOf(entry, state, resources));
        if ((pinned.inertRepairIds ?? []).includes(repair.id)) {
          // The effect line claims the purchase moves nothing; the run is what pins that claim.
          expect(legsKey(pair.after), `repair "${repair.id}" claims inertness its run contradicts`).toBe(baseKey);
        } else {
          expect(legsKey(pair.after), `repair "${repair.id}" moved no leg`).not.toBe(baseKey);
        }
      }
    },
    SUITE_TIMEOUT,
  );

  it(
    'keeps the extras honest: all five selected leave the as-repaired config equal to as-built',
    () => {
      const entry = caseOf(pinned.id);
      const state: FixitState = {
        ...emptyFixitState(),
        selectedExtraIds: ['traffic-survey', 'landing-indicators', 'car-interiors', 'call-out-cover', 'tenant-notices'],
      };
      const plan = fixitRunPlanOf(entry, state, resources);
      // Config equality is run equality: `recordRun` is deterministic in its config.
      expect(plan.asRepaired).toEqual(plan.asBuilt);
    },
    SUITE_TIMEOUT,
  );
});

/**
 * A case may be run twice — and the loaded file must be the same file afterwards.
 *
 * This is a regression pin for a defect the fifteen catalogue cases exposed and the three shipped
 * ones could not: `applyBuildingPatch` assigned `patch.banks` **by reference**, so the run's
 * document and the parsed case object became the same array, and the `addCars` loop then pushed
 * into it. Nine of the eighteen cases patch banks in their as-built *and* offer a new shaft, so
 * selecting that shaft grew a car on the authored data permanently: the next run of the case was
 * refused by `parseBuilding` with `duplicate car id "F"`, and any run that survived described a
 * building nobody wrote.
 *
 * A player reaches it by pressing `Run the day` twice, which is the ordinary way to use the screen.
 * Asserted here rather than in `run.test.ts` because what makes it reachable is the **shipped
 * data** — a fixture case with one bank would pass against the aliasing version.
 */
describe('running a case leaves the authored case file alone', () => {
  it(
    'builds the same plan twice for every case that patches banks and offers a new shaft',
    () => {
      for (const entry of cases.cases) {
        const shaft = entry.repairs.find((repair) => repair.role === 'new-shaft');
        if (shaft === undefined || entry.asBuilt.patch.building?.banks === undefined) continue;
        const state: FixitState = { ...emptyFixitState(), selectedRepairIds: [shaft.id] };
        const first = fixitRunPlanOf(entry, state, resources);
        // The second call is the assertion: under the aliasing defect it throws `duplicate car id`.
        const second = fixitRunPlanOf(entry, state, resources);
        expect(second.asRepaired.building, `case "${entry.id}" changed under its own run`).toEqual(
          first.asRepaired.building,
        );
        // And the as-built side is unmoved by the repair having been planned at all.
        expect(fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt).toEqual(first.asBuilt);
      }
    },
    SUITE_TIMEOUT,
  );
});

describe('the editor machinery is live where it is priced', () => {
  it(
    'a +0.5 m/s step and a +2-place step each change the run on the legs',
    () => {
      // Driven on the zoning case: its high bank queues deeply, so both speed and load bind.
      const entry = caseOf('zoning-starves-the-top');
      const base = legsKey(runFixitPair(fixitRunPlanOf(entry, emptyFixitState(), resources)).before);
      const speed = runFixitPair(
        fixitRunPlanOf(entry, { ...emptyFixitState(), speedSteps: 1 }, resources),
      );
      expect(legsKey(speed.after), 'the speed stepper moved no leg').not.toBe(base);
      const capacity = runFixitPair(
        fixitRunPlanOf(entry, { ...emptyFixitState(), capacitySteps: 1 }, resources),
      );
      expect(legsKey(capacity.after), 'the capacity stepper moved no leg').not.toBe(base);
    },
    SUITE_TIMEOUT,
  );
});
