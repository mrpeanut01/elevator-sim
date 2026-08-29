/**
 * The pin behind the suppressed-row remedy's load sentence — GitHub issue #299,
 * [§ D392](../../../../DECISIONS.md).
 *
 * ## What this file is for, and the hole it is deliberately not in
 *
 * `batch/report.ts#remedyFor` told a reader to lower *"demand %pop/5 min"* **until the queues stop
 * growing**, and `dev/batchPanel.ts#remedyControl` implements *until* as one 10 % step per press.
 * Nothing in the tree had ever run that step. `shippedDefault.test.ts` is the closest thing, and it
 * measures a state in which the button is **never offered** — its whole assertion is that nothing
 * suppresses — so a remedy that was wrong at every rung would have left it green.
 *
 * `CLAUDE.md` closes on *"if you publish a number, pin it to the run that produced it."* An
 * instruction about what a control **achieves** is a claim of the same kind, so it gets the same
 * treatment: the ladders are measured in `remedyFor`'s docstring, and the rungs the sentence
 * actually rests on are re-derived here.
 *
 * ## The run, once, for every case below
 *
 * Seed `20260729`, 900 simulated seconds, **n = 50** paired replications, `collective` as baseline
 * against `eta` as candidate — the shipped batch form — with the demand typed into the field, so it
 * arrives as `arrivalRatePctPop5min` exactly as the button writes it. Each rung is
 * {@link nextRung}, which is `remedyControl`'s own arithmetic.
 *
 * A **dropped pair** is the complete-case rule as `batch/report.ts#droppedSentenceFor` counts it:
 * either arm's `awtIsValid` false. It is counted here from the replications rather than read off a
 * report, because the claim is about the rule and a report that stopped applying it would make a
 * count taken from the report agree with itself.
 *
 * ## What is asserted, and what is deliberately not
 *
 * **No paired-t interval, and no claim that one rung is better than another.** That is not
 * fastidiousness, it is the finding: lowering the rate redraws the whole passenger trace, so the
 * fifty pairs after a press are fifty *different* pairs. Common random numbers hold across
 * dispatchers — `runBatch` audits that field for field — and hold across nothing else, so a paired
 * interval spanning a demand change would be arithmetic on unrelated runs. What is asserted are
 * **counts under the shipped suppression rule**, which are facts about runs that happened.
 *
 * Not asserted anywhere: an exact dropped-pair count. Pinning `1 → 3` as literals would make this
 * file red for any unrelated change that moved a single replication over the saturation threshold,
 * and the sentence it defends does not depend on the digits. The docstring carries the digits; the
 * cases carry the **shape**, and each one is paired with a rung that goes the other way so a
 * constant cannot satisfy it.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { batchReport } from './report.js';
import { runBatch } from './runBatch.js';
import type { BatchRequest, BatchResources } from './types.js';
import { fakeResult } from './fixtures.test-helper.js';
import { DATA_DIR } from '../fixtures.test-helper.js';

let config: LoadedConfig;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
}, 300_000);

/**
 * `dev/batchPanel.ts#remedyControl`'s step, to the digit.
 *
 * Copied rather than imported, and the copy is the honest option here: the expression lives inside
 * `mountBatchPanel`'s closure, where it has a `document` and a form around it. Lifting it out to
 * share with a node test would move shipped code to suit a test, which is the trade this repository
 * refuses. The guard against the copy drifting is `remedyControl`'s label — the button says the
 * rate it is about to write — and the ladder in `remedyFor`'s docstring, which is stated in the
 * same numbers this produces.
 */
function nextRung(rate: number): number {
  return Math.round(rate * 0.9 * 10) / 10;
}

function resourcesFor(buildingId: string): BatchResources {
  const building = config.buildingsById.get(buildingId);
  if (building === undefined) throw new Error(`no building "${buildingId}"`);
  return {
    building,
    dispatcherProfiles: config.dispatcherProfiles,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
  };
}

function requestAt(buildingId: string, rate: number): BatchRequest {
  return {
    buildingId,
    seed: '20260729',
    durationS: 900,
    replications: 50,
    arms: [
      { armId: 'baseline', dispatcherProfileId: 'collective' },
      { armId: 'candidate', dispatcherProfileId: 'eta' },
    ],
    arrivalRatePctPop5min: rate,
  };
}

interface Rung {
  readonly rate: number;
  readonly dropped: number;
  readonly total: number;
  /** Of the replications that refused a mean, how many also diagnosed a diverging queue. */
  readonly refusedAndSaturated: number;
  readonly refused: number;
}

/** One rung of the ladder, counted under the complete-case rule. */
function rungAt(buildingId: string, rate: number): Rung {
  const result = runBatch(requestAt(buildingId, rate), resourcesFor(buildingId));
  const [baseline, candidate] = result.arms;
  if (baseline === undefined || candidate === undefined) throw new Error('two arms expected');
  let dropped = 0;
  let refused = 0;
  let refusedAndSaturated = 0;
  for (const [index, left] of baseline.replications.entries()) {
    const right = candidate.replications[index];
    if (right === undefined) throw new Error(`candidate is missing replication ${String(index)}`);
    if (left.awtIsValid && right.awtIsValid) continue;
    dropped += 1;
    for (const rep of [left, right]) {
      if (rep.awtIsValid) continue;
      refused += 1;
      if (rep.saturated) refusedAndSaturated += 1;
    }
  }
  return { rate, dropped, total: baseline.replications.length, refusedAndSaturated, refused };
}

/* -------------------------------------------------------------------------- *
 * 1 — the sentence, which is the thing that changed
 * -------------------------------------------------------------------------- */

/** The remedy a batch with a suppressed row actually prints. */
function suppressedRemedy(): string {
  const report = batchReport(fakeResult({ delta: -3, invalidOn: [17] }));
  const remedy = report.comparisons[0]?.summary.remedy;
  expect(remedy, 'a batch with a dropped pair printed no remedy at all').not.toBeNull();
  return remedy ?? '';
}

describe('the load sentence promises nothing the button has not been measured to do', () => {
  it('makes no "lower it until X" promise, in any wording', () => {
    /*
     * The withdrawn sentence, and the shape of it rather than the string. *"until the queues stop
     * growing"* is what #299 found; *"until the rows fill in"* and *"until it stops suppressing"*
     * are the same promise with new words, and a guard that named only the first would be passed
     * by the second.
     *
     * **The pattern cannot see a negation, and the sentence is written around that rather than the
     * pattern being widened to allow one.** The first draft of the replacement said *"this surface
     * will not tell you to lower it until the rows fill in"* — honest, and caught by this case on
     * its first run, because `lower … until` is the shape whether or not a *not* precedes it. The
     * shipped sentence therefore does not use the construction at all. That is the stricter of the
     * two repairs and it is the right one: a promise a reader has to parse a negation to un-read
     * is most of a promise, and a guard taught to accept "not" would be passed by the next
     * sentence that drops the "not" in an edit.
     */
    const remedy = suppressedRemedy();
    expect(
      remedy,
      'the remedy tells a reader to lower the demand until some end state arrives. Measured at ' +
        'n = 50 the 10 % step reaches no such state in a usable number of presses on Midtown ' +
        'Office, and on Garden Apartments it moves away from one — see § D392.',
    ).not.toMatch(/\blower(?:ing)?\b[^.]{0,80}\buntil\b/i);
    expect(remedy).not.toContain('until the queues stop growing');
  });

  it('says the step can go either way, and why, rather than leaving it implied', () => {
    /*
     * AC3. The advice may not imply a monotonicity `awtIsValid`'s five grounds do not have, and
     * "may not imply" is met by saying the opposite out loud — a reader who is told only that the
     * load is the lever will read the next press as progress.
     */
    const remedy = suppressedRemedy();
    expect(remedy, 'the sentence never says a press can raise the count').toMatch(/raise it/i);
    expect(remedy, 'the sentence never says how many grounds refuse a mean').toContain(
      'five grounds',
    );
    expect(
      remedy,
      'the sentence does not say that a lowered rate redraws the passengers, which is the reason ' +
        'the pairs after a press are different pairs',
    ).toMatch(/redraws the passengers/i);
  });

  it('still names the lever and still refuses the wrong remedy', () => {
    // The two things the old sentence got right. A rewrite that lost them would trade one defect
    // for another, and the second is the one `remedyFor`'s docstring exists to prevent.
    const remedy = suppressedRemedy();
    expect(remedy).toContain('demand %pop/5 min');
    expect(remedy).toContain('more replications make this more common rather than less');
    expect(remedy).not.toMatch(/try (?:a|another) (?:different )?seed/i);
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — the measurement the sentence rests on
 * -------------------------------------------------------------------------- */

describe('the 10 % step, measured at fifty pairs', () => {
  it('raises the dropped-pair count at one Chancery House rung and lowers it at another', () => {
    /*
     * Finding 2, and the second rung is the non-vacuity guard rather than decoration: a broken
     * counter that returned a constant, or a `runBatch` that stopped varying with the rate, would
     * satisfy either assertion alone and can satisfy neither together.
     *
     * `19 → 17.1` and `17 → 15.3` are two presses of the same button on the same building, one
     * step apart. One press makes the batch report *less*, the next-but-one makes it report more.
     */
    const worse = { from: rungAt('chancery-house', 19), to: rungAt('chancery-house', nextRung(19)) };
    const better = { from: rungAt('chancery-house', 17), to: rungAt('chancery-house', nextRung(17)) };

    expect(
      worse.to.dropped,
      `a press from ${worse.from.rate.toFixed(1)} to ${worse.to.rate.toFixed(1)} %pop/5 min no ` +
        'longer raises the dropped-pair count. If that is a real improvement the sentence in ' +
        '`remedyFor` may be able to say more than it does — re-measure the ladder in its ' +
        'docstring before relaxing it, because the other half of this case still has to hold.',
    ).toBeGreaterThan(worse.from.dropped);

    expect(
      better.to.dropped,
      `a press from ${better.from.rate.toFixed(1)} to ${better.to.rate.toFixed(1)} %pop/5 min no ` +
        'longer lowers the count, so this file is asserting that the step is uniformly harmful — ' +
        'which is not what was measured and is not what the remedy says',
    ).toBeLessThan(better.from.dropped);
  }, 300_000);

  it('walks the wrong way on Garden Apartments, where no refusal is a growing queue', () => {
    /*
     * Finding 3, and the one that decided AC1 in favour of changing the text rather than the step.
     * On a building this quiet the binding ground is an empty reporting window: the batch drops
     * pairs because nobody was *served* inside the window, and every press makes the window
     * emptier. No step size repairs a direction.
     *
     * The ground is asserted through `saturated`, which is the field a batch replication carries.
     * A rung where the refusals were saturation would be a different building than the one this
     * case is about, and the remedy's advice would be right there.
     */
    const from = rungAt('garden-apartments', 3);
    const to = rungAt('garden-apartments', nextRung(3));

    expect(from.refused, 'nothing was refused at all, so this case measures no ground').toBeGreaterThan(0);
    expect(
      from.refusedAndSaturated,
      'a refusal at Garden Apartments 3 %pop/5 min now diagnoses a diverging queue. That would ' +
        'make the load the right lever here and this case the wrong claim — check what moved ' +
        'before editing the assertion',
    ).toBe(0);
    expect(to.refusedAndSaturated).toBe(0);

    expect(
      to.dropped,
      `one press from ${from.rate.toFixed(1)} to ${to.rate.toFixed(1)} %pop/5 min no longer ` +
        'raises the dropped-pair count on the building whose refusals are empty windows',
    ).toBeGreaterThan(from.dropped);
  }, 300_000);

  it('does not clear Midtown Office in the presses the panel offers', () => {
    /*
     * Finding 1, at the two ends of the ladder a player actually walks: the band point the panel
     * opens this building on, and where eight presses land. The middle rungs are in `remedyFor`'s
     * docstring and are not re-run here — the claim is *"the end state is not reached"*, and the
     * endpoint is what carries it.
     *
     * The second assertion is the load-bearing one. The first is there so that a tree in which
     * Midtown stopped saturating at its own minimum fails **here**, with this sentence, rather
     * than silently turning the second assertion into a claim about nothing.
     */
    const start = 11;
    let rate = start;
    for (let press = 0; press < 8; press += 1) rate = nextRung(rate);

    const opening = rungAt('midtown-office', start);
    expect(
      opening.dropped,
      `Midtown Office at ${String(start)} %pop/5 min now stands behind some pairs, so the remedy ` +
        'is offered here on a different footing than § D392 measured. Re-measure the ladder.',
    ).toBe(opening.total);

    const landed = rungAt('midtown-office', rate);
    expect(
      landed.dropped,
      `eight presses take Midtown Office from ${String(start)} to ${rate.toFixed(1)} %pop/5 min ` +
        'and now drop nothing. That is the end state the withdrawn sentence promised, and if it ' +
        'is real the sentence may be able to promise it again — but the promise is about every ' +
        'building the remedy is offered for, so re-measure the other four first.',
    ).toBeGreaterThan(0);
  }, 300_000);
});
