/**
 * The honesty card, on runs whose refusal is real.
 *
 * Not asserted on a stub with `awtIsValid: false` bolted on: `suppressedConfig` saturates and
 * `garden-apartments` does not, which gives both the refusal and its negative control from runs the
 * viewer can actually produce. Suppression that fires everywhere is indistinguishable from a module
 * that never computes anything, and this repository has shipped that shape before.
 *
 * **The refused run is now a rate rather than a building** — `DECISIONS.md` § D260. It read
 * *"`midtown-office` and `vertical-city` saturate at the shipped traffic rates"*, which was true
 * and was true for the wrong reason on the second of them: § D254's pickup access check stranded
 * `vertical-city`'s landing calls and the backlog read as saturation. Served properly the building
 * completes at 100 % delivery, so the fixture states 16 % of population per five minutes and the
 * refusal is the traffic's.
 *
 * The sharpest assertion is the one about the prototype: the design's disclosure computes *"queue
 * length rose by N persons"* from `waiting - 8`, a number off the screen rather than out of the
 * run. `docs/12` § 4.2 replaces every such figure, and this file asserts the replacement rather
 * than trusting the reading.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import {
  DATA_DIR,
  SUPPRESSED_BUILDING_ID,
  breadthConfig,
  suppressedConfig,
} from '../fixtures.test-helper.js';
import { meansAreSuppressed } from '../frame/overlay.js';
import { recordRun } from '../record/recordRun.js';

import { fallingBehindAt, honestyAt } from './honesty.js';
import { syntheticRecording, waitingLeg } from './synthetic.test-helper.js';

/** One whose mean the run refuses, and one it stands behind. */
const SUPPRESSED_ID = SUPPRESSED_BUILDING_ID;
const QUOTABLE_ID = 'garden-apartments';

let config: LoadedConfig;
const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  recordings.set(SUPPRESSED_ID, recordRun(suppressedConfig(config)).recording);
  recordings.set(QUOTABLE_ID, recordRun(breadthConfig(config, QUOTABLE_ID)).recording);
}, 600_000);

function recordingOf(id: string): VizRecording {
  const recording = recordings.get(id);
  if (recording === undefined) throw new Error(`no recording for ${id}`);
  return recording;
}

describe('the two runs are the two states this file needs', () => {
  it('has one suppressed run and one quotable one', () => {
    expect(meansAreSuppressed(recordingOf(SUPPRESSED_ID))).toBe(true);
    expect(meansAreSuppressed(recordingOf(QUOTABLE_ID))).toBe(false);
  }, 600_000);
});

describe('the engineer’s maths is the real rule', () => {
  it('quotes the run’s own refusal verbatim when the means are suppressed', () => {
    const recording = recordingOf(SUPPRESSED_ID);
    const card = honestyAt(recording, recording.endedAt, 'engineer');
    expect(card.suppressed).toBe(true);
    expect(card.warning).toBe(true);
    expect(card.glyph).toBe('⚠');
    expect(card.hasMaths).toBe(true);
    const reason = recording.summary.awtInvalidReason;
    if (reason !== undefined) expect(card.maths ?? '').toContain(reason);
    expect(card.maths ?? '').toContain(recording.summary.reportWindow.id);
    expect(card.maths ?? '').toContain(`n = ${String(recording.summary.waitCount)} legs`);
  }, 600_000);

  it('says which gates passed, over what window and over what n, when they do', () => {
    const recording = recordingOf(QUOTABLE_ID);
    const card = honestyAt(recording, recording.endedAt, 'engineer');
    expect(card.suppressed).toBe(false);
    expect(card.glyph).toBe('✓');
    expect(card.title).toBe('The numbers here are safe to quote');
    const maths = card.maths ?? '';
    expect(maths).toContain(recording.summary.reportWindow.id);
    expect(maths).toContain(`n = ${String(recording.summary.waitCount)} legs`);
    expect(maths).toContain(
      `${String(recording.summary.serviceLevel.overHorizonCount)} past the`,
    );
    expect(maths).toContain('grounds pass');
  }, 600_000);

  it('does not reproduce the prototype’s invented figure', () => {
    // The design computes *"queue length rose by N persons … against thresholds of 8 persons and
    // 0.5/min"* with `N = waiting - 8`, off the screen rather than out of the run — and prints it
    // on **every** suppressed card, whichever ground fired. `core` writes a sentence of its own
    // that happens to use the same thresholds when the *trend* ground is the one that fired, and
    // that sentence is quoted verbatim. So the assertion is not "those words never appear"; it is
    // that everything outside the quotation is composed from the summary, and that a run whose
    // means are quotable carries none of it at all.
    const quotable = recordingOf(QUOTABLE_ID);
    const quotableMaths = honestyAt(quotable, quotable.endedAt, 'engineer').maths ?? '';
    for (const phrase of ['queue length rose by', '0.5/min', '8 persons']) {
      expect(quotableMaths.toLowerCase()).not.toContain(phrase);
    }

    const suppressed = recordingOf(SUPPRESSED_ID);
    const maths = honestyAt(suppressed, suppressed.endedAt, 'engineer').maths ?? '';
    const quoted = suppressed.summary.awtInvalidReason ?? '';
    expect(quoted).not.toBe('');
    expect(maths).toContain(`verbatim: “${quoted}”`);
    // Strip the quotation and nothing of the prototype's arithmetic may remain.
    const ours = maths.replace(quoted, '').toLowerCase();
    for (const phrase of ['queue length rose by', '0.5/min', '8 persons']) {
      expect(ours).not.toContain(phrase);
    }
  }, 600_000);

  it('offers no maths at all in casual mode — a lever, not a lecture', () => {
    const recording = recordingOf(SUPPRESSED_ID);
    const card = honestyAt(recording, recording.endedAt, 'casual');
    expect(card.hasMaths).toBe(false);
    expect(card.maths).toBeUndefined();
  }, 600_000);
});

describe('the casual copy is the design’s, keyed on an observation', () => {
  it('reads *falling behind* only when both halves of the observation hold', () => {
    // Nobody past two minutes: not falling behind, however deep the queue.
    const shallow = syntheticRecording({
      legs: Array.from({ length: 200 }, (_unused, i) => waitingLeg(`p${String(i)}`, 0)),
      summary: { handlingCapacity: { personsPer5Min: 1, offeredPer5Min: 10, pctPopulationPer5Min: 1 } },
    });
    expect(fallingBehindAt(shallow, 60)).toBe(false);
    // The same queue, aged past two minutes, against ten arrivals per five minutes.
    expect(fallingBehindAt(shallow, 200)).toBe(true);
    // A queue smaller than five minutes' worth of arrivals is not the lifts falling behind.
    const small = syntheticRecording({
      legs: [waitingLeg('p1', 0)],
      summary: { handlingCapacity: { personsPer5Min: 1, offeredPer5Min: 10, pctPopulationPer5Min: 1 } },
    });
    expect(fallingBehindAt(small, 200)).toBe(false);
  });

  it('writes the design’s two sentences, in the third person, and nothing else', () => {
    const behind = syntheticRecording({
      legs: Array.from({ length: 200 }, (_unused, i) => waitingLeg(`p${String(i)}`, 0)),
      summary: { handlingCapacity: { personsPer5Min: 1, offeredPer5Min: 10, pctPopulationPer5Min: 1 } },
    });
    const card = honestyAt(behind, 200, 'casual');
    expect(card.title).toBe('The building is falling behind');
    /*
     * The design's sentence with its pronoun removed — the deviation `casualTitle`'s docstring
     * argues, and `docs/20` defect 7. `your cars` is the handoff's own § 14.1 defect condition when
     * the day on the stage belongs to somebody else, and this card is drawn on a watched run.
     */
    expect(card.plain).toBe(
      'People are arriving faster than the cars can clear them. Add a shaft, zone the tower, ' +
        'or ride out a rough morning and read the post-mortem.',
    );
    // Token names, not the dark band's value — § D251. A wash is not a word, so this copy of the
    // palette never showed up in a contrast walk and would have outlived the three that did.
    expect(card.bg).toBe('color-mix(in srgb, var(--band-1) 7%, transparent)');
    expect(card.edge).toBe('color-mix(in srgb, var(--band-1) 35%, transparent)');

    const calm = honestyAt(syntheticRecording(), 200, 'casual');
    expect(calm.title).toBe('Comfortably keeping up');
    expect(calm.plain).toBe(
      'Cars are clearing calls faster than people turn up. Push the traffic pattern harder, or ' +
        'bank the shift and take tomorrow.',
    );
    expect(calm.bg).toBe('color-mix(in srgb, var(--band-0) 6%, transparent)');
    expect(calm.edge).toBe('color-mix(in srgb, var(--band-0) 28%, transparent)');
  });
});

describe('a closed shift is reported by its verdict, not by its empty last second', () => {
  it('the live casual card really does go calm on a refused run — the defect, reproduced', () => {
    const recording = recordingOf(SUPPRESSED_ID);
    expect(meansAreSuppressed(recording)).toBe(true);

    /*
     * **Reproduced on the real run, which it could not be before § D260.**
     *
     * This said *"`vertical-city` times out with people still standing, so its own terminal frame is
     * honest"*, and the defect therefore had to be shown against the synthetic recording below. That
     * sentence described § D254's defect rather than the building: the pickup access check stranded
     * the landing calls, so the run never cleared. Served properly, `suppressedConfig` is a run that
     * **drains** — `completed`, nobody undelivered — and whose mean is refused all the same, which is
     * exactly the shape this defect needs and the shape no shipped fixture used to produce.
     *
     * So the claim is now made twice: once on a run the viewer can actually produce, and once on the
     * synthetic recording, which stays because it pins the same shape without depending on a rate.
     */
    const live = honestyAt(recording, recording.endedAt, 'casual');
    expect(recording.status).toBe('completed');
    expect(live.suppressed).toBe(true);
    expect(live.fallingBehind).toBe(false);
    expect(live.title).toBe('Comfortably keeping up');
    expect(live.glyph).toBe('✓');

    const drained = syntheticRecording({
      summary: {
        saturated: true,
        awtIsValid: false,
        awtInvalidReason:
          'the run saturated: the queues did not reach a steady state, so a mean wait describes ' +
          'nothing.',
      },
    });
    const synthetic = honestyAt(drained, 300, 'casual');
    expect(synthetic.suppressed).toBe(true);
    expect(synthetic.fallingBehind).toBe(false);
    expect(synthetic.title).toBe('Comfortably keeping up');
    expect(synthetic.glyph).toBe('✓');
  });

  it('carries the refusal into casual words once the shift is over — § 4’s never-hide list', () => {
    const drained = syntheticRecording({
      summary: {
        saturated: true,
        awtIsValid: false,
        awtInvalidReason: 'the run saturated: the queues did not reach a steady state.',
      },
    });
    const closed = honestyAt(drained, 300, 'casual', 'whole-run');
    expect(closed.basis).toBe('whole-run');
    expect(closed.warning).toBe(true);
    expect(closed.glyph).toBe('⚠');
    expect(closed.title).not.toBe('Comfortably keeping up');
    expect(closed.plain).toContain('never settled');
    expect(closed.plain).toContain('average');
    // R3, both halves: casual shortens the reason and does not remove it — the verbatim rule stays
    // one control away rather than disappearing.
    expect(closed.hasMaths).toBe(false);
    expect(honestyAt(drained, 300, 'engineer', 'whole-run').maths ?? '').toContain(
      'the run saturated: the queues did not reach a steady state.',
    );
  });

  it('does not claim a growing queue for a ground that is not saturation', () => {
    const closed = honestyAt(
      syntheticRecording({
        summary: {
          saturated: false,
          awtIsValid: false,
          awtInvalidReason: 'a leg waited 922.7 s, past the 900 s abandonment horizon.',
        },
      }),
      300,
      'casual',
      'whole-run',
    );
    expect(closed.plain).not.toContain('never settled');
    expect(closed.plain).toContain('does not pass every check');
    // Never a figure: the rail's counts carry the numbers, and a second copy is a second figure.
    expect(closed.plain).not.toContain('922.7');
  });

  it('says the lifts kept up only when the run’s own gate says the averages hold', () => {
    const closed = honestyAt(syntheticRecording(), 300, 'casual', 'whole-run');
    expect(closed.suppressed).toBe(false);
    expect(closed.glyph).toBe('✓');
    expect(closed.title).toBe('The lifts kept up today');
    expect(closed.warning).toBe(false);
  });

  it('leaves the engineer card unmoved by the basis — it always read the whole run', () => {
    for (const overrides of [
      {},
      { saturated: true, awtIsValid: false },
    ]) {
      const recording = syntheticRecording({ summary: overrides });
      const live = honestyAt(recording, 300, 'engineer');
      const closed = honestyAt(recording, 300, 'engineer', 'whole-run');
      expect(closed.title).toBe(live.title);
      expect(closed.plain).toBe(live.plain);
      expect(closed.glyph).toBe(live.glyph);
      expect(closed.maths).toBe(live.maths);
    }
  });
});

describe('the engineer’s plain sentence does not claim a growing queue it cannot see', () => {
  it('keeps the design’s wording for the saturation ground', () => {
    const card = honestyAt(
      syntheticRecording({ summary: { saturated: true, awtIsValid: false } }),
      300,
      'engineer',
    );
    expect(card.plain).toContain('The queues are still growing');
  });

  it('says something else for the other three grounds', () => {
    const card = honestyAt(
      syntheticRecording({
        summary: {
          saturated: false,
          awtIsValid: false,
          awtInvalidReason:
            'a leg waited 922.7 s, past the 900 s abandonment horizon, so the mean is not a mean of waits anybody had.',
        },
      }),
      300,
      'engineer',
    );
    expect(card.plain).not.toContain('The queues are still growing');
    expect(card.plain).toContain('does not clear every check');
    expect(card.maths ?? '').toContain('922.7 s');
  });
});
