/**
 * **The published survivor counts reproduce from the run that produced them** — GitHub issue
 * **#367**'s pin clause, and `CLAUDE.md`'s oldest rule about a published number.
 *
 * > *"If you publish a number, pin it to the run that produced it."*
 *
 * `survivors.test.ts` is the always-on half: it checks the table is well formed, self-consistent
 * and inside every rule a scenario may not ship without, and it runs nothing. This file is the
 * other half — it **re-runs the whole sweep** and compares the counts with what is on disk. A
 * published number that does not reproduce from the code that produced it is this repository's
 * named defect, and a difficulty table is exactly the shape it takes.
 *
 * ## Why this is gated, and on a gate of its own
 *
 * Every cell is a fifty-replication two-arm batch, and a cell that meets every bar on the tuning
 * seeds runs a second one. Measured on 2026-09-10 on a quiet ten-core developer machine, at the
 * shipped sample size and under load from a second suite: the whole sweep is **932 s** over 480
 * judgements — 120 dropdown ones, played once per profile per scenario and attributed to every rung
 * that affords them, and 360 drawn dial ones. It is very unevenly spread:
 * `stage-3-overwhelmed` alone takes 389 s, `stage-5-credentials` 189 s and `stage-1-first-call` 4 s,
 * which is why a per-scenario progress line exists at all.
 *
 * **Re-run on `f4383c4` for GitHub issue #475 at 1 900 s**, and that is two effects rather than a
 * regression in the sweep. Most of it is the machine — that run shared a host whose load average
 * was above 60 — and the rest is the fix doing its job: the four configurations that used to
 * `throw` while the building was constructed cost almost nothing, and each now runs a full
 * fifty-replication batch like any other draw. **932 s is the quiet-machine figure and is the one
 * to plan CI against**; 1 900 s is what a contended one looks like and is recorded so the next
 * reader does not read it as the tier having doubled.
 *
 * A hosted four-core runner is slower again, which is `difficulty-curve`'s own argument one
 * file over.
 *
 * `ELEVATOR_SIM_SURVIVORS` rather than `ELEVATOR_SIM_DEEP`, and the reason is
 * `.github/workflows/deep-tiers.yml`'s: nine jobs rather than one, so *"the first tier to go red
 * does not hide the other eight"* and so a re-run after a fix does not also pay for the tiers
 * beside it. A gate of its own is what makes this tier dispatchable on its own.
 *
 * `packages/viz/src/deepTiers.test.ts` derives the gated set from disk and asserts the workflow
 * names every one of them, so this tier cannot arrive unwired — which is the failure
 * `measure.corpus.test.ts` demonstrated by landing already gated and already running nowhere.
 *
 * ## Regenerating
 *
 * ```
 * ELEVATOR_SIM_SURVIVORS=deep ELEVATOR_SIM_REGENERATE_SURVIVORS=1 \
 *   npx vitest run --project viz src/scenario/survivorSweep.test.ts
 * ```
 *
 * It **writes** the file and skips the comparison, following `goalRates.test.ts`'s precedent, so a
 * regeneration cannot be mistaken for a passing guard. A re-run that disagrees with the file is a
 * question rather than an answer: something moved — a profile, a building, the price schedule, a
 * goal's published bar, or the judge — and the thing to do is find out which.
 */

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  SCENARIO_SURVIVORS_PATH,
  measurePublishedSurvivors,
  regenerateScenarioSurvivors,
} from './regenerateSurvivors.test-helper.js';
import type { PublishedSurvivors, PublishedSurvivorStep } from './survivors.js';

const OPEN = process.env['ELEVATOR_SIM_SURVIVORS'] === 'deep';
const REGENERATE = process.env['ELEVATOR_SIM_REGENERATE_SURVIVORS'] === '1';

/** The counts a re-run must reproduce, keyed the way the table is: `(scenarioId, stepId)`. */
function countsOf(table: PublishedSurvivors): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const scenario of table.scenarios) {
    for (const step of scenario.steps) {
      out[`${scenario.id}#${step.stepId ?? ''}`] = summaryOf(step);
    }
  }
  return out;
}

/**
 * One cell, as the string a failure prints.
 *
 * A string rather than an object, because vitest's diff on a flat record of strings names the cell
 * and shows both sides on one line — and the thing a reader needs from a moved pin is *which cell*
 * before *by how much*. The survivor names are in it because a count that stayed at one while its
 * survivor changed identity is a different finding from a count that held.
 */
function summaryOf(step: PublishedSurvivorStep): string {
  return (
    `${String(step.survivors)}/${String(step.examined)} ` +
    `dropdown ${String(step.dropdown.survivors)}/${String(step.dropdown.examined)} ` +
    `dials ${String(step.dials.survivors)}/${String(step.dials.examined)} ` +
    `unjudged ${String(step.unjudged)} suppressed ${String(step.suppressed)} ` +
    `unbuildable ${String(step.unbuildable)} ` +
    `[${[...step.survivorNames].sort().join(' ')}]`
  );
}

/**
 * The case's own name, hoisted out of the `it` call.
 *
 * **Written this way so the timeout annotation is counted.** `testCost.test-helper.ts#annotationsIn`
 * matches a closing `}, <ms>);` at the start of a line, so an annotation written across lines after
 * a comment — which is how this file's first draft had it — is invisible to the census, and an
 * uncounted annotation is `RISKS.md` R38 wearing a timeout. The canonical form needs the callback
 * as the `it`'s second argument, which needs the name to be one expression rather than a ternary
 * spread over a line of its own.
 */
const CASE_NAME = REGENERATE
  ? 'regenerates data/scenario-survivors.json'
  : 're-runs every scenario at every budget step and matches the file';

describe.skipIf(!OPEN)('the published survivor counts reproduce — issue #367', () => {
  /* Hours, not minutes. The ceiling below is the tier's, and it is not an expectation. */
  it(CASE_NAME, async () => {
    const lines: string[] = [];
    const measured = REGENERATE
      ? await regenerateScenarioSurvivors({ onScenario: (line) => lines.push(line) })
      : await measurePublishedSurvivors({ onScenario: (line) => lines.push(line) });
    process.stderr.write(`survivor sweep\n${lines.join('\n')}\n`);

    /* Non-vacuity: the sweep found something to count. */
    expect(measured.scenarios.length, 'the sweep measured no scenario').toBeGreaterThan(0);
    expect(
      measured.scenarios.reduce(
        (sum, scenario) => sum + scenario.steps.reduce((inner, step) => inner + step.examined, 0),
        0,
      ),
      'the sweep examined no configuration at all',
    ).toBeGreaterThan(0);

    if (REGENERATE) return;

    const onDisk = JSON.parse(await readFile(SCENARIO_SURVIVORS_PATH, 'utf8')) as PublishedSurvivors;
    expect(
      countsOf(measured),
      'a published survivor count no longer reproduces from the run that produced it. Something ' +
        'moved — a dispatcher profile, a building, data/price-schedule.json, a goal’s published ' +
        'bar, or the judge. That is a finding to report, not a number to edit.',
    ).toEqual(countsOf(onDisk));
  }, 10_800_000);
});
