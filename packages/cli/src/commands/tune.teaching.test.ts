/**
 * **`elevator-sim tune --teaching` — the named non-test caller of `experiments/teaching`.**
 *
 * `experiments/src/teaching/deadCode.test.ts` asserts that this file imports the module. This file
 * asserts that the import is a *use*: the command runs a real round against the real `data/`
 * directory and prints a verdict measured on held-out traffic. Between them, the twelfth instance
 * of `docs/05-roadmap.md` § *Standing requirement* has to fail a test rather than wait for a
 * reviewer — reachability was true of all eleven.
 *
 * The budgets are the smallest the surface admits, which is the band's own floor of 50 for the
 * verdict, because the refusal below the floor is one of the things being exercised.
 */

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXIT_USAGE } from '../errors.js';
import { main } from '../index.js';
import { createBufferedOutput, type BufferedOutput } from '../output.js';

async function cli(argv: readonly string[]): Promise<{ code: number; out: string; err: string }> {
  const options = { color: false, columns: 120, rows: 60, env: {} } as const;
  const out: BufferedOutput = createBufferedOutput(options);
  const err: BufferedOutput = createBufferedOutput(options);
  const code = await main(argv, out, err);
  return { code, out: out.text(), err: err.text() };
}

const SPEC = {
  id: 'cli-teaching',
  building: 'midtown-office',
  traffic: [
    {
      id: 'interfloor-mix-1.5pct',
      durationS: 900,
      reportWindow: 'full-run',
      demand: {
        directionalSplit: { incoming: 0.4, outgoing: 0.3, interfloor: 0.3 },
        entranceWeights: { G: 1 },
        arrivalRatePctPop5min: 1.5,
        peakWindowS: 300,
      },
    },
  ],
  observations: [
    { id: 'lobbyArrivalRate', causality: 'trailing-window' },
    { id: 'interfloorRate', causality: 'trailing-window' },
    { id: 'downPeakRate', causality: 'trailing-window' },
  ],
  action: {
    kind: 'weight-set-selection',
    parameterIds: [
      'selection.lobbyArrivalRateGain',
      'selection.interfloorRateGain',
      'selection.downPeakRateGain',
      'selection.switchMargin',
    ],
  },
  objective: {
    gate: 'ttdMeanS',
    direction: 'lower-is-better',
    costs: ['awtS', 'energyPerServedLegKJ'],
    referenceArm: 'census',
  },
  budget: {
    censusReplications: 12,
    searchCandidates: 3,
    searchReplications: 6,
    resolutionReplications: 12,
    verdictReplications: 50,
  },
  seeds: { runSeed: 20260726, trainingTrafficSeed: 900_001, holdoutTrafficSeed: 900_002 },
};

async function specFile(patch: Record<string, unknown> = {}, text?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'teaching-'));
  const path = join(dir, 'spec.json');
  await writeFile(path, text ?? JSON.stringify({ ...SPEC, ...patch }), 'utf8');
  return path;
}

describe('elevator-sim tune --teaching runs a round and reports it on held-out traffic', () => {
  it('prints the verdict, the held-out label, and the training number as not a result', async () => {
    const path = await specFile();
    const { code, out } = await cli(['tune', '--teaching', path]);
    expect(code).toBe(0);
    expect(out).toContain('judged on held-out traffic');
    expect(out).toContain('VERDICT:');
    expect(out).toContain('HELD-OUT');
    expect(out).toContain('a bare mean, no interval, not a result');
    /* The two seeds are printed, because a verdict whose traffic is not named is not this verdict
       — and because CLAUDE.md invariant 5 wants a run replayable from what it printed. */
    expect(out).toContain('training 900001, holdout 900002');
    expect(out).toContain('realized sets disjoint: true');
  }, 600_000);

  it('needs no --building, because the spec names one', async () => {
    /* And the search path still refuses without it, by the same name and the same exit code. */
    const { code, err } = await cli(['tune', '--params', 'idle.repositionThresholdS']);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('--building');
  });
});

describe('a refused spec is a usage error, and the message names the clause', () => {
  it('refuses a verdict budget below the documented floor', async () => {
    const path = await specFile({ budget: { ...SPEC.budget, verdictReplications: 10 } });
    const { code, err } = await cli(['tune', '--teaching', path]);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('50–200 band');
  });

  it('refuses one traffic seed doing both jobs', async () => {
    const path = await specFile({ seeds: { ...SPEC.seeds, holdoutTrafficSeed: 900_001 } });
    const { code, err } = await cli(['tune', '--teaching', path]);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('under a second name');
  });

  it('refuses an action parameter outside the selection stage', async () => {
    const path = await specFile({
      action: { kind: 'weight-set-selection', parameterIds: ['idle.repositionThresholdS'] },
    });
    const { code, err } = await cli(['tune', '--teaching', path]);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('outside the "selection." section');
  });

  it('refuses a file that is not there, and one that is not JSON', async () => {
    const missing = await cli(['tune', '--teaching', join(tmpdir(), 'no-such-teaching-spec.json')]);
    expect(missing.code).toBe(EXIT_USAGE);
    expect(missing.err).toContain('cannot read teaching spec');

    const path = await specFile({}, '{ not json');
    const malformed = await cli(['tune', '--teaching', path]);
    expect(malformed.code).toBe(EXIT_USAGE);
    expect(malformed.err).toContain('is not valid JSON');
  });
});
