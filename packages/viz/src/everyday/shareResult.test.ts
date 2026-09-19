/**
 * The result artefact, both branches, and the spoiler rule asserted rather than promised.
 *
 * The artefact's text is a pure function of the run, so every claim here is made against the text
 * itself. Three families:
 *
 * 1. **The two branches** — a run whose mean is publishable and a run whose mean is refused. The
 *    second is the one worth reading: the refusal is present, it is the product's own per-ground
 *    wording, and no number stands anywhere near it.
 * 2. **The spoiler rule** ([§ D685](../../../../DECISIONS.md)) — a recording whose dispatcher is
 *    named, rendered, with the name and the id required absent from every line. That is the guard
 *    that fails if somebody widens `ShareRunFacts` later, which no amount of docstring can do.
 * 3. **The strip agrees with the shipped banding** — the per-slice fold is the one quantity this
 *    module derives itself, so its tally is checked against `live/bands.ts#waitBandsAt` on the
 *    `whole-run` basis rather than trusted.
 */

import { describe, expect, it } from 'vitest';

import { bandIndexOf, waitBandsAt, WAIT_BANDS } from '../live/bands.js';
import {
  servedLeg,
  syntheticRecording,
  waitingLeg,
} from '../live/synthetic.test-helper.js';
import type { VizRecording } from '../contract/types.js';

import {
  SHARE_COPY,
  SHARE_QUIET_FACE,
  SHARE_SLICES,
  shareArtefactOf,
  shareFactsOf,
  shareSlicesOf,
} from './shareResult.js';

/** A window of 1 200 s, so each of the twelve slices is a round 100 s. */
const WINDOW = { id: 'whole-run', startS: 0, endS: 1_200 } as const;

function runWith(
  legs: readonly VizRecording['legs'][number][],
  summary: Parameters<typeof syntheticRecording>[0] extends { summary?: infer S } ? S : never,
): VizRecording {
  return syntheticRecording({
    legs,
    endedAt: 1_200,
    summary: { reportWindow: WINDOW, windowSeconds: 1_200, ...summary },
  });
}

/** One call per slice, each waiting `waitS`, so a strip reads exactly what was asked for. */
function onePerSlice(waits: readonly number[]): readonly VizRecording['legs'][number][] {
  return waits.map((waitS, index) =>
    servedLeg(`p${String(index)}`, index * 100 + 10, index * 100 + 10 + waitS, index * 100 + 60 + waitS),
  );
}

describe('the strip', () => {
  it('cuts the reporting window into twelve slices and bands each by the worst wait in it', () => {
    const waits = [5, 10, 35, 40, 70, 130, 200, 300, 65, 45, 20, 8];
    const artefact = shareArtefactOf(shareFactsOf(runWith(onePerSlice(waits), {})));
    const strip = artefact.lines.find((line) => line.field === 'strip');

    expect(strip?.text).toBe(waits.map((waitS) => WAIT_BANDS[bandIndexOf(waitS)]?.face).join(''));
    expect(strip?.text).toHaveLength(SHARE_SLICES);
  });

  it('draws a slice nobody called in as its own face, never as the calmest band', () => {
    // Calls in the first and last slice only. The ten between are quiet, not breezy.
    const legs = [servedLeg('a', 10, 15, 60), servedLeg('b', 1_150, 1_160, 1_190)];
    const slices = shareSlicesOf(runWith(legs, {}));

    expect(slices).toHaveLength(SHARE_SLICES);
    expect(slices.slice(1, 11).every((slice) => slice.band === undefined)).toBe(true);
    const strip = shareArtefactOf(shareFactsOf(runWith(legs, {}))).lines.find(
      (line) => line.field === 'strip',
    );
    expect(strip?.text.slice(1, 11)).toBe(SHARE_QUIET_FACE.repeat(10));
    // The whole point of the distinction: the calm face must not be what a quiet slice draws.
    expect(strip?.text.slice(1, 11)).not.toContain(WAIT_BANDS[0]?.face);
  });

  it('marks the slices whose worst wait belongs to somebody who never boarded', () => {
    // Two legs that never board, in the first two slices; served legs everywhere else.
    const legs = [
      waitingLeg('never-1', 10),
      waitingLeg('never-2', 110),
      ...onePerSlice([0, 0, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]).slice(2),
    ];
    const slices = shareSlicesOf(runWith(legs, {}));

    expect(slices.filter((slice) => slice.censored)).toHaveLength(2);
    const note = shareArtefactOf(shareFactsOf(runWith(legs, {}))).lines.find(
      (line) => line.field === 'strip.censored',
    );
    expect(note?.text).toBe(`2 ${SHARE_COPY.censoredNote}`);
    expect(note?.count).toBe(2);
  });

  it('says nothing about censoring when nobody was cut short', () => {
    const artefact = shareArtefactOf(shareFactsOf(runWith(onePerSlice(Array(12).fill(20)), {})));
    expect(artefact.lines.some((line) => line.field === 'strip.censored')).toBe(false);
  });

  /**
   * The cross-check the module's docstring promises. `waitBandsAt(…, endedAt, 'whole-run')` bands
   * every leg by the wait it realised; the strip's slices partition the same legs. So the set of
   * bands the strip reports must be a subset of the bands that tally reports, and the strip's worst
   * must equal the tally's worst — which is the claim that would break if the two folds ever
   * disagreed about when a wait ends.
   */
  it('agrees with the shipped whole-run banding about the worst wait of the day', () => {
    for (const waits of [
      [5, 10, 35, 40, 70, 130, 200, 300, 65, 45, 20, 8],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [119, 119, 119, 119, 119, 119, 119, 119, 119, 119, 119, 119],
    ]) {
      const recording = runWith(onePerSlice(waits), {});
      const tally = waitBandsAt(recording, recording.endedAt, 'whole-run');
      const slices = shareSlicesOf(recording);
      const worst = Math.max(...slices.flatMap((slice) => (slice.band === undefined ? [] : [slice.band])));

      expect(worst).toBe(tally.worstIndex);
      const reported = new Set(slices.flatMap((slice) => (slice.band === undefined ? [] : [slice.band])));
      for (const band of reported) expect(tally.counts[band]?.count ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('the mean, both branches', () => {
  it('publishes the mean with the count it was taken over', () => {
    const artefact = shareArtefactOf(
      shareFactsOf(
        runWith(onePerSlice(Array(12).fill(20)), {
          awtIsValid: true,
          saturated: false,
          meanWaitS: 47.24,
          waitCount: 1_388,
        }),
      ),
    );
    const mean = artefact.lines.find((line) => line.field === 'mean');

    expect(mean?.role).toBe('estimate');
    expect(mean?.text).toBe('average wait 47.2 s over 1,388 waits');
    // R13: the count is structured as well as printed, so a consumer carrying the line keeps it.
    expect(mean?.count).toBe(1_388);
  });

  it('refuses the mean in the product’s own words, and prints no number near it', () => {
    const artefact = shareArtefactOf(
      shareFactsOf(
        runWith(onePerSlice(Array(12).fill(200)), {
          awtIsValid: false,
          saturated: true,
          awtInvalidGround: 'saturated',
          awtInvalidReason: 'Queue length rose by 268.0 persons over the window.',
          meanWaitS: 191.4,
          waitCount: 612,
        }),
      ),
    );
    const mean = artefact.lines.find((line) => line.field === 'mean');

    expect(mean?.role).toBe('suppressed');
    expect(mean?.text).toBe('NO AVERAGE — the queues never settled during this run');
    // A refusal has no sample, so it carries no `n` — `averageWaitFigure`'s own rule.
    expect(mean?.count).toBeUndefined();
    // R3: the refused figure does not travel, in any rendering, anywhere in the artefact.
    for (const rendering of ['191', '191.4', '191.40', '191.400']) {
      expect(artefact.text).not.toContain(rendering);
    }
    // And the engine's own statistics prose does not reach a player surface.
    expect(artefact.text).not.toContain('Queue length rose');
  });

  it('never omits the refusal and never softens it', () => {
    const artefact = shareArtefactOf(
      shareFactsOf(
        runWith(onePerSlice(Array(12).fill(200)), {
          awtIsValid: false,
          saturated: true,
          awtInvalidGround: 'censored',
        }),
      ),
    );
    // The line exists, it leads with the refusal, and there is no arm in which it is dropped.
    const mean = artefact.lines.find((line) => line.field === 'mean');
    expect(mean).toBeDefined();
    expect(mean?.text.startsWith('NO AVERAGE')).toBe(true);
    expect(artefact.text).toContain('NO AVERAGE');
  });

  /**
   * The gate is the Day report's and is **not** `awtIsValid` alone. A run that is unsaturated and
   * valid publishes; a run that is valid and saturated does not. Re-deriving the gate here would
   * publish a mean the sheet withholds, on exactly the runs somebody would want to share.
   */
  it('takes the sheet’s gate rather than the flag, so a saturated run withholds', () => {
    const facts = shareFactsOf(
      runWith(onePerSlice(Array(12).fill(20)), { awtIsValid: true, saturated: true }),
    );
    expect(facts.mean.kind).toBe('refused');
  });
});

describe('the spoiler rule — § D685', () => {
  /**
   * The recording names a dispatcher, twice over: `dispatcherProfileId` is a field on it and the
   * id is a word a fixture could easily leak. Neither may reach the artefact.
   */
  it('names no dispatcher, in either branch', () => {
    for (const summary of [{ awtIsValid: true }, { awtIsValid: false, saturated: true, awtInvalidGround: 'saturated' }]) {
      const recording = {
        ...runWith(onePerSlice(Array(12).fill(20)), summary),
        dispatcherProfileId: 'destination-eta',
      };
      const artefact = shareArtefactOf(shareFactsOf(recording));

      expect(artefact.text).not.toContain('destination-eta');
      expect(artefact.text.toLowerCase()).not.toContain('dispatcher');
      for (const line of artefact.lines) expect(line.text).not.toContain('destination-eta');
    }
  });

  it('carries the identity a recipient needs and nothing else about the selection', () => {
    const recording = {
      ...runWith(onePerSlice(Array(12).fill(20)), {}),
      buildingName: 'Midtown Office',
      seed: '4815162342',
      trafficProfileId: 'up-peak-4pct',
    };
    const artefact = shareArtefactOf(shareFactsOf(recording));

    expect(artefact.text).toContain('Midtown Office');
    expect(artefact.text).toContain('seed 4815162342');
    // The traffic profile is a selection, not an outcome — it does not travel.
    expect(artefact.text).not.toContain('up-peak-4pct');
  });

  /**
   * The rule is the *type*, and this is what says so. Every key on the facts an artefact is built
   * from is enumerated here; adding one is a failing test, which is the point — a widened facts
   * type is exactly how an input would get in.
   */
  it('builds from an enumerated set of facts, so a widening is visible', () => {
    const facts = shareFactsOf(runWith(onePerSlice(Array(12).fill(20)), {}));
    expect(Object.keys(facts).sort()).toEqual(
      [
        'buildingName',
        'delivered',
        'generated',
        'mean',
        'seed',
        'slices',
        'stripCalls',
      ].sort(),
    );
  });
});

describe('the artefact as a whole', () => {
  it('publishes no score, grade, rating or rank', () => {
    const artefact = shareArtefactOf(shareFactsOf(runWith(onePerSlice(Array(12).fill(20)), {})));
    for (const word of ['score', 'grade', 'rating', 'rank', 'points', 'stars', '/10', '%']) {
      expect(artefact.text.toLowerCase()).not.toContain(word);
    }
  });

  it('carries no link, so nothing can be appended to one', () => {
    const artefact = shareArtefactOf(shareFactsOf(runWith(onePerSlice(Array(12).fill(20)), {})));
    expect(artefact.text).not.toMatch(/https?:\/\//u);
    expect(artefact.text).not.toContain('www.');
  });

  it('states on its own face that the run’s configuration is withheld', () => {
    const artefact = shareArtefactOf(shareFactsOf(runWith(onePerSlice(Array(12).fill(20)), {})));
    expect(artefact.lines.at(-1)?.text).toBe(SHARE_COPY.promise);
  });

  /**
   * The denominator is in the sentence, and there is **no** third count beside it: `delivered`,
   * `undelivered` and *turned away* are three buckets of one conservation audit, and
   * `unservedCount` is folded over the reporting window rather than over the run. A line pairing a
   * run-cohort count with a window-cohort one is two cohorts in one sentence.
   */
  it('gives the delivered count its denominator and nothing from another cohort', () => {
    const artefact = shareArtefactOf(
      shareFactsOf(
        runWith(onePerSlice(Array(12).fill(20)), {
          delivered: 1_388,
          generated: 1_392,
          unservedCount: 4,
          undelivered: 2,
        }),
      ),
    );
    const line = artefact.lines.find((entry) => entry.field === 'delivered');
    expect(line?.text).toBe('1,388 of 1,392 delivered');
    expect(line?.count).toBe(1_392);
    // Neither of the two cohorts this line does not speak for reaches the artefact.
    expect(artefact.text).not.toContain('never boarded');
  });

  it('is the lines joined, so the clipboard and the screen cannot disagree', () => {
    const artefact = shareArtefactOf(shareFactsOf(runWith(onePerSlice(Array(12).fill(20)), {})));
    expect(artefact.text).toBe(artefact.lines.map((line) => line.text).join('\n'));
  });

  it('has a legend with a rung for every band and one for the quiet face', () => {
    const artefact = shareArtefactOf(shareFactsOf(runWith(onePerSlice(Array(12).fill(20)), {})));
    const legend = artefact.lines.find((line) => line.field === 'strip.legend')?.text ?? '';
    for (const band of WAIT_BANDS) expect(legend).toContain(`${band.face} ${band.legendLabel}`);
    expect(legend).toContain(`${SHARE_QUIET_FACE} ${SHARE_COPY.quietLegend}`);
  });

  it('draws no strip at all for a window of no length, rather than twelve empty cells', () => {
    const recording = syntheticRecording({
      legs: [],
      summary: { reportWindow: { id: 'whole-run', startS: 60, endS: 60 }, windowSeconds: 0 },
    });
    const artefact = shareArtefactOf(shareFactsOf(recording));
    expect(artefact.lines.some((line) => line.field === 'strip')).toBe(false);
    // The rest of the artefact still stands — the mean and the counts do not need a strip.
    expect(artefact.lines.some((line) => line.field === 'mean')).toBe(true);
  });
});
