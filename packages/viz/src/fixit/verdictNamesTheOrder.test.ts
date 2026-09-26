/**
 * **A fixed verdict names the order that was run, and prints the diagnosis's words only over the
 * diagnosis's own run** — [§ D1011](../../../../DECISIONS.md), `rescore-ai` C's D1 and D's N1.
 *
 * `fixit/engine.ts#classifyOutcome` returned the case's authored `result` for **every** fixed
 * outcome. Six routes were reproduced on the shipped bundle (five still clear; see the note at the
 * end of {@link FALSE_ROUTES}), each clearing its case by a change the
 * diagnosis does not name and each read back the diagnosis's mechanism as though the player had made
 * it — *"Four hundred letters now say half past"* over a hospital roof raised three metres, *"The
 * staggered starts … take six hundred arrivals out"* over a parking change. Every one is here, built
 * by pressing the same controls in the same order through the engine's reducers, run on the case
 * seed as both surfaces run it, and judged the way both surfaces judge it: the after-run's legs
 * against the diagnosed repair's own run.
 *
 * **What each route must now read.** A fixed outcome, a head that is not the authored head, a body
 * that carries **no sentence** of the authored body, names the order's changes and what they did
 * (§ D1158), and ends on the close that says the runs show the change works and not why.
 *
 * **The negative control, in both directions.** Forcing `witnessRun: true` on the same route's run
 * must bring the authored words back — otherwise the assertions above would pass on an engine that
 * never printed them at all; and the pressed diagnosed answer, run the same way, must be judged the
 * witness's run and read the authored head, which `families.test.ts` holds for all eighteen.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { fixitVerdictContextOf } from '../everyday/fixitScreenModel.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { sameLegs } from '../record/crowd.js';
import { recordRun } from '../record/recordRun.js';
import { editorInputsOf } from './editorInputs.js';
import {
  FIXED_BY_ORDER_CLOSE,
  FIXED_BY_ORDER_DID_LEAD,
  FIXED_BY_ORDER_HEAD,
  classifyOutcome,
  rowsBoughtOf,
  spendOf,
  witnessStateOf,
  type FixitVerdictContext,
} from './engine.js';
import {
  ANSWER_PRESSES,
  carTo,
  dial,
  doors,
  parking,
  pressed,
  raiseTopFloor,
  type Press,
} from './presses.test-helper.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import { FIXIT_RUN_SWITCHES, fixitRunPlanOf, measuredOf, type FixitResources } from './run.js';
import { EVERY_CAR, type FixitCase, type FixitCases, type FixitState } from './types.js';

/** Six cases, three runs each, on one worker; the slowest is Vertical City's decks. */
const SUITE_TIMEOUT = 300_000;

let resources: FixitResources;
let cases: FixitCases;

beforeAll(async () => {
  resources = await fixitResourcesFromDisk();
  cases = await shippedFixitCases(resources);
}, SUITE_TIMEOUT);

function caseOf(id: string): FixitCase {
  const entry = cases.cases.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`the shipped file has no case "${id}"`);
  return entry;
}

/**
 * The reproduced routes, each as the assessor who found it wrote it down, and the words the old
 * verdict printed over it — quoted so a reader can see what stopped being said.
 */
const FALSE_ROUTES: readonly {
  readonly caseId: string;
  readonly source: string;
  readonly presses: readonly Press[];
  readonly printed: string;
}[] = [
  {
    caseId: 'everyone-leaves-at-once',
    source: 'C D1 — cars sent to one busy landing: more cars when the queue is long; queue that calls another car: 2',
    presses: [dial('dispatch.assignmentMode', 'split-demand'), dial('dispatch.splitThresholdPassengers', 2)],
    printed: 'The ballroom has its own car while the conference sits',
  },
  {
    caseId: 'every-deck-calls-itself-full',
    source: 'C D1 — where idle cars wait: in the middle of its own zone',
    presses: [parking('zone-center')],
    printed: 'each deck weighs against its own plate',
  },
  {
    caseId: 'every-letter-says-nine',
    source: 'C D1 — the top floor, buy one more step, three times',
    presses: [raiseTopFloor(3)],
    printed: 'Four hundred letters now say half past',
  },
  {
    caseId: 'doors-that-never-close',
    source: 'C D1 — door hold on every car, 5.0 s and 3.0 s',
    presses: [...doors(EVERY_CAR, 5, 3)],
    printed: 'the trolleys keep their eleven seconds',
  },
  {
    caseId: 'two-cars-out-wrong-month',
    source: 'C D1 and D3 — car A runs in the High bank',
    presses: [carTo('A', 'high')],
    printed: 'The same refit, re-phased',
  },
  /*
   * `let-faster-than-the-lifts` — *D N1, park at one floor you name, floor 30*, which printed *"The
   * clause bought the morning back"* — stood here and is removed rather than kept failing. GitHub
   * issue #601 (§ D1076) re-authored that case at 7.0 % a five minutes once its answer thinned the
   * crowd instead of re-drawing it, and on the re-authored case seed the route no longer clears the
   * letter's morning (`not-enough`), so there is no fixed verdict left for it to misattribute. The
   * five rows above still hold the property.
   */
];

interface Judged {
  readonly entry: FixitCase;
  readonly state: FixitState;
  readonly context: FixitVerdictContext;
  readonly classify: (verdict: FixitVerdictContext) => ReturnType<typeof classifyOutcome>;
}

/** Press, run the pair and the witness on the case seed, and decide `witnessRun` on the legs. */
function judge(entry: FixitCase, presses: readonly Press[]): Judged {
  const schedule = shippedPriceSchedule();
  const state = pressed(entry, presses, { resources, schedule });
  const plan = fixitRunPlanOf(entry, state, resources);
  const before = recordRun(plan.asBuilt, FIXIT_RUN_SWITCHES).recording;
  const after = recordRun(plan.asRepaired, FIXIT_RUN_SWITCHES).recording;
  const witness = recordRun(fixitRunPlanOf(entry, witnessStateOf(entry), resources).asRepaired, FIXIT_RUN_SWITCHES)
    .recording;
  const measurement = measuredOf(entry, before, after);
  const spend = spendOf(entry, state, schedule);
  const context = fixitVerdictContextOf({
    entry,
    state,
    inputs: editorInputsOf(entry, state, resources, schedule),
    schedule,
    witnessRun: sameLegs(after, witness),
  });
  return { entry, state, context, classify: (verdict) => classifyOutcome(entry, measurement, spend, verdict) };
}

/** The authored body's sentences, each long enough to be a claim rather than a word. */
function sentencesOf(body: string): readonly string[] {
  return body
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12);
}

describe('a fixed verdict over a route the diagnosis does not name is composed from the order', () => {
  it.each(FALSE_ROUTES)(
    '$caseId — $source',
    (route) => {
      const entry = caseOf(route.caseId);
      /* The quoted words are the authored ones, so the route is the defect as reproduced. */
      expect(`${entry.result.head} ${entry.result.body}`).toContain(route.printed);

      const judged = judge(entry, route.presses);
      expect(judged.context.witnessRun, 'the route is not the diagnosed repair’s run').toBe(false);
      const outcome = judged.classify(judged.context);

      expect(outcome.kind, 'the route still clears on the case seed — the defect needs a fixed verdict').toBe('fixed');
      expect(outcome.head).toBe(FIXED_BY_ORDER_HEAD);
      expect(outcome.head).not.toBe(entry.result.head);
      expect(outcome.attribution).toBe('order');
      for (const sentence of sentencesOf(entry.result.body)) {
        expect(outcome.body, 'an authored sentence over a run it is not true of').not.toContain(sentence);
      }
      expect(`${outcome.head} ${outcome.body}`).not.toContain(route.printed);

      /*
       * Every change in the control's words, and what it did (§ D1158: the rows bought left the
       * body, because a row's name repeated the change it followed).
       */
      expect(rowsBoughtOf(entry, judged.state, shippedPriceSchedule()).length).toBeGreaterThan(0);
      expect(outcome.body).toContain(FIXED_BY_ORDER_DID_LEAD);
      expect(outcome.body).not.toContain('describes a different run');
      expect(judged.context.changes.length).toBeGreaterThan(0);
      for (const change of judged.context.changes) expect(outcome.body).toContain(change);
      expect(outcome.body.endsWith(FIXED_BY_ORDER_CLOSE)).toBe(true);

      /* Negative control: the same run declared the witness's gets the authored words back. */
      const forced = judged.classify({ ...judged.context, witnessRun: true });
      expect(forced.head).toBe(entry.result.head);
      expect(`${forced.head} ${forced.body}`).toContain(route.printed);
      expect(forced.attribution).toBe('diagnosis');
    },
    SUITE_TIMEOUT,
  );

  it(
    'the pressed diagnosed answer on the same cases is the witness’s run, and reads the authored head',
    () => {
      for (const route of FALSE_ROUTES) {
        const entry = caseOf(route.caseId);
        const judged = judge(entry, ANSWER_PRESSES[entry.id]!);
        expect(judged.context.witnessRun, entry.id).toBe(true);
        const outcome = judged.classify(judged.context);
        expect(outcome.kind, entry.id).toBe('fixed');
        expect(outcome.head, entry.id).toBe(entry.result.head);
      }
    },
    SUITE_TIMEOUT,
  );

  it('an absent context is not evidence: the fixed arm is composed', () => {
    const entry = caseOf('two-cars-out-wrong-month');
    const outcome = classifyOutcome(
      entry,
      {
        complaintBefore: 19,
        complaintAfter: 2,
        scopeBoardedBefore: 40,
        scopeBoardedAfter: 40,
        complaintGonePct: 89.5,
        restAwayBeforePct: 100,
        restAwayAfterPct: 100,
        restBoardedBefore: 72,
        restBoardedAfter: 72,
        restDeltaPoints: 0,
        sameCrowd: true,
      },
      spendOf(entry, witnessStateOf(entry), shippedPriceSchedule()),
    );
    expect(outcome.kind).toBe('fixed');
    expect(outcome.head).toBe(FIXED_BY_ORDER_HEAD);
    expect(outcome.body.startsWith(FIXED_BY_ORDER_DID_LEAD)).toBe(true);
    expect(outcome.body.endsWith(FIXED_BY_ORDER_CLOSE)).toBe(true);
  });
});
