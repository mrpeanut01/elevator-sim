/**
 * **The shipped as-built mornings reproduce from the runs that produced them** —
 * [§ D1120](../../../../DECISIONS.md) clause 4, and `CLAUDE.md`'s oldest rule about a published
 * number: *"pin it to the run that produced it."*
 *
 * `asBuiltMornings.test.ts` is the always-on half: it recomputes every row's input digest from the
 * shipped data and re-runs two mornings. This file is the other half. It **re-runs every morning of
 * every case** — forty-nine as-built runs a case, through the same `recordRun` and
 * `fixit/run.ts#morningReadingOf` the morning worker calls — and requires each reading and each
 * digest to match `data/fixit-as-built-mornings.json` exactly. The digest cannot see a change to
 * `core`'s simulation; this can.
 *
 * ## Gated, on a gate of its own
 *
 * `ELEVATOR_SIM_FIXIT_MORNINGS=deep`, on `.github/workflows/deep-tiers.yml`'s argument for one job
 * per tier: a re-run after a fix does not pay for the tiers beside it. The engineering decision
 * member (S3) priced the whole set at about 113 s of CPU; one case per test, the largest being
 * `vertical-city`'s two at roughly a second a morning, each well inside the `viz` project's 300 s
 * ceiling, so no timeout is raised here.
 *
 * ## Regenerating
 *
 * ```
 * ELEVATOR_SIM_FIXIT_MORNINGS=deep ELEVATOR_SIM_REGENERATE_FIXIT_MORNINGS=1 \
 *   npx vitest run --project viz src/fixit/asBuiltMornings.sweep.test.ts
 * ```
 *
 * It **writes** the file and skips the comparison, so a regeneration cannot be mistaken for a
 * passing guard. A re-run that disagrees with the file is a question rather than an answer:
 * something under the case moved — a building, a profile, the demand, the case, or `core`.
 *
 * This file imports nothing from `asBuiltMornings.ts`, because that module reads the file at load
 * and a regeneration has to start from a tree where it is missing or malformed.
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import { DATA_DIR } from '../fixtures.test-helper.js';

import { emptyFixitState } from './engine.js';
import { morningConfigsOf, replicationSeedsOf } from './judge.js';
import { morningsInputHashOf } from './morningsInput.js';
import { fixitResourcesFromDisk, shippedFixitCases } from './resources.test-helper.js';
import { FIXIT_RUN_SWITCHES, fixitRunPlanOf, morningReadingOf, type FixitResources } from './run.js';
import type { FixitCases } from './types.js';

const OPEN = process.env['ELEVATOR_SIM_FIXIT_MORNINGS'] === 'deep';
const REGENERATE = process.env['ELEVATOR_SIM_REGENERATE_FIXIT_MORNINGS'] === '1';
const PATH = join(DATA_DIR, 'fixit-as-built-mornings.json');

type Stored = readonly [number | null, number | null, number];
interface Row {
  readonly caseId: string;
  readonly inputHash: string;
  readonly readings: readonly Stored[];
}

/** The case ids in the shipped file, read without parsing it — a regeneration starts from nothing. */
function caseIdsOnDisk(): readonly string[] {
  const raw = JSON.parse(readFileSync(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as { cases: { id: string }[] };
  return raw.cases.map((entry) => entry.id);
}

function treeOf(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

describe.skipIf(!OPEN)('the shipped as-built mornings reproduce — § D1120 clause 4', () => {
  let resources: FixitResources;
  let cases: FixitCases;
  const measured = new Map<string, Row>();
  const started = Date.now();

  beforeAll(async () => {
    resources = await fixitResourcesFromDisk();
    cases = await shippedFixitCases(resources);
  });

  afterAll(() => {
    process.stderr.write(`fixit as-built mornings: ${String(measured.size)} cases in ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
    const ids = caseIdsOnDisk();
    if (!REGENERATE || measured.size !== ids.length) return;
    const rows = ids.map((id) => measured.get(id)!);
    const document = {
      generatedBy: 'packages/viz/src/fixit/asBuiltMornings.sweep.test.ts',
      contract:
        'DECISIONS.md § D1120 clause 4. Each fix case’s forty-nine derived as-built mornings (fixit/judge.ts#replicationSeedsOf), run through record/recordRun.ts and read by fixit/run.ts#morningReadingOf, so the judge asks a worker only for a press’s own after-runs. Each row carries the digest of every input its readings depend on (fixit/morningsInput.ts); a row whose digest no longer matches is not used. A reading is [complaint, the rest of the building’s share away in points, the rest boarded]. Nothing in this file is chosen: every figure is the output of the command below, and a figure that does not reproduce is a finding to report rather than a number to edit.',
      provenance: {
        kind: 'measured',
        command:
          'ELEVATOR_SIM_FIXIT_MORNINGS=deep ELEVATOR_SIM_REGENERATE_FIXIT_MORNINGS=1 npx vitest run --project viz src/fixit/asBuiltMornings.sweep.test.ts',
        tree: treeOf(),
        measuredAt: new Date().toISOString().slice(0, 10),
      },
      cases: rows,
    };
    /* One row a line, so a moved case is one line of diff. */
    const body = rows.map((row) => `    ${JSON.stringify(row)}`).join(',\n');
    const head = JSON.stringify({ ...document, cases: [] }, null, 2).replace(/"cases": \[\]\n\}$/, '');
    writeFileSync(PATH, `${head}"cases": [\n${body}\n  ]\n}\n`);
  });

  it.each(caseIdsOnDisk())('%s — forty-nine as-built mornings', (caseId) => {
    const entry = cases.cases.find((candidate) => candidate.id === caseId)!;
    const t0 = Date.now();
    const asBuilt = fixitRunPlanOf(entry, emptyFixitState(), resources).asBuilt;
    const readings = morningConfigsOf(asBuilt, replicationSeedsOf(entry)).map((config) => {
      const reading = morningReadingOf(recordRun(config, FIXIT_RUN_SWITCHES).recording, entry.complaint.measure);
      return [reading.complaint, reading.restAwayPct, reading.restBoarded] as const;
    });
    const row: Row = { caseId, inputHash: morningsInputHashOf(entry, asBuilt), readings };
    measured.set(caseId, row);
    process.stderr.write(`${caseId}: 49 mornings, ${String(Date.now() - t0)} ms\n`);
    expect(readings).toHaveLength(49);
    if (REGENERATE) return;

    const onDisk = JSON.parse(readFileSync(PATH, 'utf8')) as { cases: readonly Row[] };
    expect(
      row,
      'a shipped as-built morning no longer reproduces from the run that produced it. Something under ' +
        'the case moved — a building, a profile, the demand, the case or core. Find which; do not edit ' +
        'the number.',
    ).toEqual(onDisk.cases.find((candidate) => candidate.caseId === caseId));
  });
});
