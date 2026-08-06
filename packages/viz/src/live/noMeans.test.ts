/**
 * The rule this whole directory is built around, checked mechanically rather than by reading.
 *
 * `docs/10` R9 makes `meansAreSuppressed` the single gate for *may I show this*, and CLAUDE.md
 * makes suppressing a mean over a queue that never settled non-negotiable. The left rail's answer
 * to both is structural: it never reaches for a mean at all. Two assertions hold that:
 *
 * 1. **A grep.** No module in `src/live/` may *name* `meanWaitS`, `wait95S` or
 *    `meanTimeToDestinationS` — the three figures `awtIsValid` speaks for — nor `runningMeanWaitS`
 *    or `rollingMeanWaitS`, the two derived ones. Comments are stripped first, exactly as
 *    `boundaries.test.ts` strips them, because half the value of these files is docstrings that
 *    explain *why* the fields are absent and naming the thing you are avoiding is how the
 *    avoidance stays understood.
 * 2. **A run.** On a recording whose `awtIsValid` is false, every value every function in the
 *    directory returns is walked, and none of them may be the suppressed figure — as a number
 *    anywhere in the output, or as text inside a string.
 *
 * The second is what catches an *arithmetic* leak that the grep cannot see: a module that
 * recomputed a mean from `legs` rather than reading it off the summary would pass the grep and
 * fail here.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizRecording } from '../contract/types.js';
import { DATA_DIR, SUPPRESSED_BUILDING_ID, suppressedConfig } from '../fixtures.test-helper.js';
import { meansAreSuppressed } from '../frame/overlay.js';
import { recordRun } from '../record/recordRun.js';

import { moodAt, waitBandsAt } from './bands.js';
import { decisionRowsAt } from './decisions.js';
import { honestyAt } from './honesty.js';
import { observationsAt } from './observations.js';
import { phaseAt, tickLabelsOf, timelineOf } from './timeline.js';

const LIVE_DIR = fileURLToPath(new URL('.', import.meta.url));

/**
 * The run whose mean is refused — `suppressedConfig`, and the rate is the point.
 *
 * This said *"the one that saturates hardest at the shipped rates"* and named the building alone.
 * It was true, and it was true because of `DECISIONS.md` § D254's defect: the pickup access check
 * stranded every landing call raised inside a zone, and the queue that produced was read as
 * saturation. Served properly `vertical-city` completes at 100 % delivery and quotes its mean, so
 * the guard below started failing — correctly. The fixture now states a **demand rate**, which is
 * a property of the traffic rather than of a bug. See {@link SUPPRESSED_BUILDING_ID}.
 */
const SUPPRESSED_ID = SUPPRESSED_BUILDING_ID;

let config: LoadedConfig;
let recording: VizRecording;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  recording = recordRun(suppressedConfig(config)).recording;
}, 600_000);

/** Comments removed, so the rule is about code rather than about prose. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const SUPPRESSIBLE = /\b(?:meanWaitS|wait95S|meanTimeToDestinationS|runningMeanWaitS|rollingMeanWaitS)\b/;

describe('no module in `live/` names a suppressible figure', () => {
  it('leaves the three the gate speaks for, and the two derived from them, alone', async () => {
    const names = (await readdir(LIVE_DIR)).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.test-helper.ts'),
    );
    // Not vacuous: the directory has modules in it.
    expect(names.length).toBeGreaterThan(3);
    const offenders: string[] = [];
    for (const name of names) {
      const code = stripComments(await readFile(join(LIVE_DIR, name), 'utf8'));
      if (SUPPRESSIBLE.test(code)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it('positive control: the pattern would catch one if it were there', () => {
    expect(SUPPRESSIBLE.test('const x = recording.summary.meanWaitS;')).toBe(true);
    expect(SUPPRESSIBLE.test('const x = frame.runningMeanWaitS;')).toBe(true);
    expect(SUPPRESSIBLE.test('const x = summary.waitCount;')).toBe(false);
  });
});

describe(`${SUPPRESSED_ID} — a suppressed run yields no mean anywhere`, () => {
  it('really is suppressed, or the rest of this proves nothing', () => {
    expect(meansAreSuppressed(recording)).toBe(true);
    expect(Number.isFinite(recording.summary.meanWaitS)).toBe(true);
  }, 600_000);

  it('never returns the withheld figure, as a number or inside a sentence', () => {
    const withheld = [
      recording.summary.meanWaitS,
      recording.summary.wait95S,
      recording.summary.meanTimeToDestinationS,
    ].filter((value) => Number.isFinite(value) && value !== 0);
    expect(withheld.length).toBeGreaterThan(0);

    const span = recording.endedAt - recording.startedAt;
    const times = Array.from({ length: 7 }, (_unused, i) => recording.startedAt + (span * i) / 6);
    const outputs: unknown[] = [];
    for (const t of times) {
      outputs.push(
        waitBandsAt(recording, t),
        moodAt(recording, t),
        observationsAt(recording, t),
        timelineOf(recording),
        phaseAt(recording, t),
        tickLabelsOf(recording, 5),
        decisionRowsAt(recording, t),
        honestyAt(recording, t, 'casual'),
        honestyAt(recording, t, 'engineer'),
      );
    }

    const found: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'number') {
        for (const target of withheld) {
          // The suppressed figures are non-integral averages; an exact match at any precision a
          // renderer would print is a leak.
          if (Math.abs(value - target) < 1e-6) found.push(`${path} = ${String(value)}`);
        }
        return;
      }
      if (typeof value === 'string') {
        for (const target of withheld) {
          for (const digits of [0, 1, 2]) {
            const printed = target.toFixed(digits);
            // A bare `12` would match half the numbers on the card; only look for the shapes a
            // renderer actually produces from a mean.
            if (digits > 0 && value.includes(printed)) found.push(`${path} ⊃ "${printed}"`);
          }
        }
        return;
      }
      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) walk(item, `${path}[${String(index)}]`);
        return;
      }
      if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
      }
    };
    for (const [index, output] of outputs.entries()) walk(output, `#${String(index)}`);
    expect(found).toEqual([]);
  }, 600_000);
});
