/**
 * `elevator-sim fuzz --scenario <id> --engagement`, end to end: the real `main`, the real `data/`, the
 * real simulator, and the stage-1 baseline the command prints.
 *
 * The case that matters most is the seam. `data/engagement-bands.json` got its first reader in
 * § D1595, so a band edge moved **in the file the command reads** must move a figure the command
 * prints; a copy of the data directory with one edge moved is run through the same path a user types.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_DATA_DIR } from '../data.js';
import { EXIT_USAGE } from '../errors.js';
import { main } from '../index.js';
import { createBufferedOutput, type BufferedOutput } from '../output.js';

import { ENGAGEMENT_HEADER } from './fuzzEngagement.js';

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

async function cli(argv: readonly string[]): Promise<Run> {
  const options = { color: false, columns: 140, rows: 60, env: {} } as const;
  const out: BufferedOutput = createBufferedOutput(options);
  const err: BufferedOutput = createBufferedOutput(options);
  const code = await main(argv, out, err);
  return { code, out: out.text(), err: err.text() };
}

const ENGAGE = ['fuzz', '--scenario', 'stage-1-first-call', '--engagement'];

/** A data directory that is the shipped one with `engagement-bands.json` replaced. */
const made: string[] = [];
function dataWithBands(bands: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'engagement-bands-'));
  made.push(dir);
  for (const entry of readdirSync(DEFAULT_DATA_DIR)) {
    if (entry !== 'engagement-bands.json') symlinkSync(join(DEFAULT_DATA_DIR, entry), join(dir, entry));
  }
  writeFileSync(join(dir, 'engagement-bands.json'), JSON.stringify(bands));
  return dir;
}
const SHIPPED_BANDS = JSON.parse(readFileSync(join(DEFAULT_DATA_DIR, 'engagement-bands.json'), 'utf8')) as Record<string, unknown>;

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe('elevator-sim fuzz --scenario stage-1-first-call --engagement', () => {
  it('says first that these are unmeasured premises and that no player presses a verb, prints the baseline, and exits 0', async () => {
    const { code, out } = await cli(ENGAGE);
    expect(code).toBe(0);
    const header = out.indexOf('UNMEASURED PREMISES ABOUT PEOPLE');
    expect(header).toBeGreaterThan(-1);
    expect(header).toBeLessThan(out.indexOf('Proxy 2'));
    expect(out.replace(/\s+/gu, ' ')).toContain(ENGAGEMENT_HEADER);

    /* Proxy 2, on both seed sets, each beside its AWT and WT95. */
    expect(out).toContain('tuning: tuning-20260730');
    expect(out).toContain('holdout: holdout-20260731');
    expect(out.match(/in band\s+1 of 50 \[0\.004, 0\.105\]/gu)).toHaveLength(2);
    expect(out.match(/flat 49 · below-band 0 · in-band 1 · above-band 0 · runaway 0 · suppressed 0/gu)).toHaveLength(2);
    expect(out).toMatch(/beside\s+AWT \d+\.\d\d s \[/u);

    /* Proxy 1: nothing to judge for a player, and an engine baseline labelled as one. */
    expect(out).toMatch(/player session\s+0 of 0 \(nothing to judge\)/u);
    expect(out).toContain('ENGINE-LEVEL BASELINE, NOT A PLAYER SESSION');
    expect(out).toMatch(/meaningful\s+10 of 22 \[0\.269, 0\.653\]/u);
    for (const kind of ['answer-incident', 'equipment-change', 'building-change']) {
      expect(out).toContain(`not yet replayable — ${kind}`);
    }

    /* Proxy 3: no attempts, and the gap named. */
    expect(out).toMatch(/slope\s+no-attempts/u);
    expect(out.replace(/\s+/gu, ' ')).toContain('one fixed holdout batch, holdout-20260731');

    expect(out).toContain('Named gaps');
    expect(out).toContain('reproduce every figure on this page: elevator-sim fuzz --scenario stage-1-first-call --engagement');
  }, 300_000);

  it('reads the band from the data file it is pointed at: an edge moved there moves the figure printed', async () => {
    const scenarios = SHIPPED_BANDS['scenarios'] as Record<string, unknown>;
    const moved = dataWithBands({
      ...SHIPPED_BANDS,
      scenarios: { ...scenarios, 'stage-1-first-call': { tensionBand: { flatBelow: 0, inBandLow: 0, inBandHigh: 6 } } },
    });
    const { code, out } = await cli([...ENGAGE, '--data', moved]);
    expect(code).toBe(0);
    expect(out.match(/in band\s+50 of 50 \[/gu)).toHaveLength(2);
    expect(out).toContain(`--engagement --data ${moved}`);
  }, 300_000);

  it('refuses a bands file that says something it cannot apply, naming the key', async () => {
    const typo = dataWithBands({ ...SHIPPED_BANDS, tensionBand: { ...(SHIPPED_BANDS['tensionBand'] as object), inBandHi: 9 } });
    const { code, err } = await cli([...ENGAGE, '--data', typo]);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('"inBandHi"');
  });

  it('refuses the campaign’s flags, which shape a run that does not happen, and needs a stage', async () => {
    const cases = await cli([...ENGAGE, '--cases', '4']);
    expect(cases.code).toBe(EXIT_USAGE);
    expect(cases.err).toContain('--cases shape the property campaign');
    const bare = await cli(['fuzz', '--engagement']);
    expect(bare.code).toBe(EXIT_USAGE);
    expect(bare.err).toContain('--engagement needs --scenario <id>');
  });

  it('is in the command’s help, with an example', async () => {
    const { out } = await cli(['fuzz', '--help']);
    expect(out).toContain('--engagement');
    expect(out).toContain('fuzz --scenario stage-1-first-call --engagement');
  });
});
