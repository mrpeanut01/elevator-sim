/**
 * **`elevator-sim compare --shard` and `--merge`** — the non-test caller of `docs/15` Phase B's
 * fan-out, GitHub issue #413.
 *
 * `experiments/src/runner/shard.test.ts` holds the fan-out itself to criteria 1, 2, 5 and 7. This
 * file holds the **command** to them, through the real `main`, the real `data/` and real shard files
 * on disk, because a library that satisfies a criterion and a command that routes past it would pass
 * every test in that file.
 *
 * And it holds the other half of `docs/15` § 3: **sharding is opt-in and the unsharded path is
 * unchanged.** The skeletons below were captured from `compare` on `d9af2917`, before this issue's
 * first commit, and every figure in them is masked — so they pin what the command says and where,
 * and not a number a second platform may round differently.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { deserializeShard, estimateMean, smallestDetectableEffect } from '@elevator-sim/experiments';

import { EXIT_USAGE } from '../errors.js';
import { num } from '../format.js';
import { main } from '../index.js';
import { createBufferedOutput, type BufferedOutput } from '../output.js';

interface Run {
  readonly code: number;
  readonly text: string;
}

async function cli(argv: readonly string[]): Promise<Run> {
  const out: BufferedOutput = createBufferedOutput({ color: false, columns: 120, rows: 60, env: {} });
  const code = await main(argv, out, out);
  return { code, text: out.text() };
}

const dir = mkdtempSync(join(tmpdir(), 'elevator-sim-compare-shard-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A contrast that is cheap and quotable: two cars, a ten-minute horizon, both arms reportable. */
const CONTRAST = [
  '--building',
  'garden-apartments',
  '--a',
  'eta',
  '--b',
  'nearest-car',
  '--seed',
  '20260726',
  '--window',
  'full-run',
  '--serial',
  '--duration',
  '600',
] as const;

/** Run blocks 1…count of one invocation, each to its own file, and return the files. */
async function shardFiles(
  label: string,
  argv: readonly string[],
  count: number,
  ceiling: number,
): Promise<{ readonly files: readonly string[]; readonly runs: readonly Run[] }> {
  const files: string[] = [];
  const runs: Run[] = [];
  for (let k = 1; k <= count; k += 1) {
    const file = join(dir, `${label}-${k}-of-${count}.json`);
    const run = await cli(['compare', ...argv, '--shard', `${k}/${count}`, '--ceiling', String(ceiling), '--out', file]);
    expect(run.code, run.text).toBe(0);
    files.push(file);
    runs.push(run);
  }
  return { files, runs };
}

/**
 * What the command prints about the comparison itself: from its heading through the `reproduce:`
 * line, without progress and without the `executed` line — the one line whose content is about how
 * the replications were run rather than what they measured.
 */
function comparisonOf(text: string): readonly string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'Paired comparison');
  const end = lines.findIndex((line) => line.includes('reproduce:'));
  expect(start, text).toBeGreaterThanOrEqual(0);
  expect(end, text).toBeGreaterThan(start);
  return lines
    .slice(start, end + 1)
    .filter((line) => !line.startsWith('  … ') && !line.trimStart().startsWith('executed'));
}

/* -------------------------------------------------------------------------- *
 * Unsharded, unchanged
 * -------------------------------------------------------------------------- */

/** Every figure masked and every run of padding collapsed, so only words, labels and order remain. */
function skeletonOf(text: string): readonly string[] {
  return text
    .split('\n')
    .filter((line) => !line.startsWith('  … '))
    .map((line) =>
      line
        .replace(/[+-]?\d+(?:\.\d+)?/gu, '#')
        .replace(/ {2,}/gu, '  ')
        .trimEnd(),
    );
}

const HEADER = (building: string, id: string, traffic: string, b: string, window: string): readonly string[] => [
  '',
  'Paired comparison',
  '────────────────────',
  `  building  ${building}  (${id})`,
  `  traffic  ${traffic}`,
  '  A  Minimum estimated wait  (eta)',
  `  B  ${b}`,
  '  replications  # per arm, common random numbers',
  `  window  ${window}`,
  '  seed  #',
  '',
  '',
  'Arms',
  '────────────────────',
];

const TAIL = (reproduce: string): readonly string[] => [
  '',
  '  common RNs  verified — # of # replication pairs share a trace digest',
  '  executed  # replications, serial, # s',
  '  budget  # replications is below the documented #–#; ten produced a # % error in the reference study',
  '',
  `  reproduce: elevator-sim compare ${reproduce}`,
  '',
  '',
];

/** Captured from `compare` at `d9af2917`, the tree this issue branched from, and masked. */
const BEFORE_SHARDING: Readonly<Record<string, { readonly argv: readonly string[]; readonly skeleton: readonly string[] }>> = {
  contrast: {
    argv: ['compare', ...CONTRAST, '--reps', '6'],
    skeleton: [
      ...HEADER('Garden Apartments', 'garden-apartments', 'residential', 'Nearest car  (nearest-car)', 'full-run'),
      '  metric  A  eta  B  nearest-car',
      '  AWT  # s  [#, #]  # s  [#, #]',
      '  WT#  # s  [#, #]  # s  [#, #]',
      '  % waits > # s  # %  [#, #]  # %  [#, #]',
      '  TTD  # s  [#, #]  # s  [#, #]',
      '  saturated  # of # replications  # of # replications',
      '  every mean carries its # % interval; there is no bare mean here',
      '',
      'Paired difference  (A − B, # % confidence)',
      '───────────────────────────────────────────',
      '  AWT  # s  [#, #]  INDISTINGUISHABLE',
      '  WT#  # s  [#, #]  INDISTINGUISHABLE',
      '  % waits > # s  # %  [#, #]  IDENTICAL',
      '  TTD  # s  [#, #]  INDISTINGUISHABLE',
      '',
      '  VERDICT: INDISTINGUISHABLE on AWT at n = #.',
      '  The # % interval on the difference contains zero, so eta and nearest-car are not ranked.',
      '  That is not "the same"; it is "below this experiment\'s resolution". Raise --reps to',
      '  resolve a smaller effect.',
      ...TAIL(
        'compare --building garden-apartments --a eta --b nearest-car --reps # --seed # --confidence # --window full-run --duration #'.replace(
          /^compare /u,
          '',
        ),
      ),
    ],
  },
  identical: {
    argv: ['compare', ...CONTRAST.map((token) => (token === 'nearest-car' ? 'eta' : token)), '--reps', '4'],
    skeleton: [
      ...HEADER('Garden Apartments', 'garden-apartments', 'residential', 'Minimum estimated wait  (eta)', 'full-run'),
      '  metric  A  eta  B  eta',
      '  AWT  # s  [#, #]  # s  [#, #]',
      '  WT#  # s  [#, #]  # s  [#, #]',
      '  % waits > # s  # %  [#, #]  # %  [#, #]',
      '  TTD  # s  [#, #]  # s  [#, #]',
      '  saturated  # of # replications  # of # replications',
      '  every mean carries its # % interval; there is no bare mean here',
      '',
      'Paired difference  (A − B, # % confidence)',
      '───────────────────────────────────────────',
      '  AWT  # s  [#, #]  IDENTICAL',
      '  WT#  # s  [#, #]  IDENTICAL',
      '  % waits > # s  # %  [#, #]  IDENTICAL',
      '  TTD  # s  [#, #]  IDENTICAL',
      '',
      '  VERDICT: IDENTICAL on AWT — # of # paired differences are exactly zero.',
      '  eta and eta produced bit-identical runs at every replication, so this is no effect at all',
      '  rather than an effect too small to see. No replication count changes it, and there is',
      '  nothing here to widen or narrow.',
      '',
      '  Comparing eta with itself is the documented sanity check, and this is the result it is',
      '  supposed to produce: the apparatus adds no difference of its own.',
      ...TAIL('--building garden-apartments --a eta --b eta --reps # --seed # --confidence # --window full-run --duration #'),
    ],
  },
  saturated: {
    argv: ['compare', '--building', 'midtown-office', '--a', 'eta', '--b', 'nearest-car', '--reps', '2', '--seed', '20260726', '--serial'],
    skeleton: [
      ...HEADER('Midtown Office', 'midtown-office', 'office-standard', 'Nearest car  (nearest-car)', 'the demand template’s own'),
      '  metric  A  eta  B  nearest-car',
      '  AWT  SUPPRESSED  SUPPRESSED',
      '  WT#  SUPPRESSED  SUPPRESSED',
      '  % waits > # s  SUPPRESSED  SUPPRESSED',
      '  TTD  SUPPRESSED  SUPPRESSED',
      '  saturated  # of # replications  # of # replications',
      '  every mean carries its # % interval; there is no bare mean here',
      '',
      '  ██  SATURATED — a queue diverged. Waiting statistics are suppressed.',
      '  A (eta): # of # replications saturated (a diverging queue), so the mean describes a system whose backlog grows without bound',
      '  B (nearest-car): # of # replications saturated (a diverging queue), so the mean describes a system whose backlog grows without bound',
      '  Lower --rate, add cars, or treat this configuration as the capacity limit.',
      '',
      'Paired difference  (A − B, # % confidence)',
      '───────────────────────────────────────────',
      '  AWT  SUPPRESSED  — the arms above are not reportable, so their difference is not either',
      '  WT#  SUPPRESSED  — the arms above are not reportable, so their difference is not either',
      '  % waits > # s  SUPPRESSED  — the arms above are not reportable, so their difference is not either',
      '  TTD  SUPPRESSED  — the arms above are not reportable, so their difference is not either',
      '',
      '  VERDICT: NONE — a saturated arm cannot be ranked.',
      '  docs/#-traffic-and-statistics.md: flag it and suppress the AWT interval; do not',
      '  report a mean for a system whose queues grow without bound.',
      ...TAIL('--building midtown-office --a eta --b nearest-car --reps # --seed # --confidence #'),
    ],
  },
};

describe('elevator-sim compare, unsharded, is unchanged by sharding (docs/15 § 3: opt-in)', () => {
  it.each(Object.keys(BEFORE_SHARDING))(
    '%s prints, word for word and line for line, what it printed before --shard existed',
    async (name) => {
      const entry = BEFORE_SHARDING[name];
      if (entry === undefined) throw new Error(`no case ${name}`);
      const { code, text } = await cli(entry.argv);
      expect(code).toBe(0);
      expect(skeletonOf(text)).toEqual(entry.skeleton);
    },
  );

  it('still refuses a missing --building in exactly the words it used to', async () => {
    const { code, text } = await cli(['compare', '--a', 'eta', '--b', 'nearest-car']);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toBe(
      '\nerror  elevator-sim compare: missing required flag --building.\n       --building <id>   which building to simulate\n\n',
    );
  });
});

/* -------------------------------------------------------------------------- *
 * Sharded
 * -------------------------------------------------------------------------- */

describe('elevator-sim compare --shard / --merge (docs/15 Phase B)', () => {
  it('criterion 1: one block, merged, prints the unsharded comparison line for line', async () => {
    const argv = [...CONTRAST, '--reps', '6'];
    const single = await cli(['compare', ...argv]);
    const { files, runs } = await shardFiles('one', argv, 1, 12);
    const merged = await cli(['compare', '--merge', ...files]);

    expect(merged.code, merged.text).toBe(0);
    expect(comparisonOf(merged.text)).toEqual(comparisonOf(single.text));
    expect(merged.text).toMatch(/executed\s+12 replications, merged from 1 block\n/u);
    // A block is not a result, so it prints no verdict of its own.
    expect(runs[0]?.text).not.toContain('VERDICT');
  });

  it.each([2, 3])(
    'criterion 1: %i uneven blocks of 7 replications, merged in any order, print the unsharded comparison',
    async (count) => {
      const argv = [...CONTRAST, '--reps', '7'];
      const single = await cli(['compare', ...argv]);
      const { files } = await shardFiles(`seven-${count}`, argv, count, 14);
      const merged = await cli(['compare', '--merge', ...[...files].reverse()]);

      expect(merged.code, merged.text).toBe(0);
      expect(comparisonOf(merged.text)).toEqual(comparisonOf(single.text));
      expect(merged.text).toMatch(new RegExp(`executed\\s+14 replications, merged from ${count} blocks\\n`, 'u'));
    },
  );

  it('criterion 1: a saturated comparison merges to the same refusal to rank', async () => {
    const argv = ['--building', 'midtown-office', '--a', 'eta', '--b', 'nearest-car', '--reps', '2', '--seed', '20260726', '--serial'];
    const single = await cli(['compare', ...argv]);
    const { files } = await shardFiles('saturated', argv, 2, 4);
    const merged = await cli(['compare', '--merge', ...files]);

    expect(merged.code, merged.text).toBe(0);
    expect(comparisonOf(merged.text)).toEqual(comparisonOf(single.text));
    expect(merged.text).toContain('VERDICT: NONE');
    expect(merged.text).toContain('not computed — the arms are not reportable');
  });

  it('criterion 5: each block reports its own limit, and the merge recomputes it at the merged n', async () => {
    const argv = [...CONTRAST, '--reps', '8'];
    const { files, runs } = await shardFiles('limit', argv, 2, 16);
    const merged = await cli(['compare', '--merge', ...files]);
    expect(merged.code, merged.text).toBe(0);

    const limitIn = (text: string): string | undefined =>
      /smallest detectable effect ([\d.]+) s/u.exec(text)?.[1];
    for (const run of runs) expect(run.text).toMatch(/AWT\s+n = 4, smallest detectable effect [\d.]+ s at 80 % power/u);
    expect(merged.text).toContain('Resolution at the merged n = 8');

    const atMergedN = limitIn(merged.text);
    const perBlock = runs.map((run) => limitIn(run.text));
    expect(atMergedN).toBeDefined();
    for (const figure of perBlock) {
      expect(figure).toBeDefined();
      expect(figure).not.toBe(atMergedN);
    }

    // And the merged figure is the one the whole difference series gives — derived here from the
    // files, through the library, rather than read back from the command's own arithmetic.
    const differences = files.flatMap((file) =>
      deserializeShard(readFileSync(file, 'utf8')).result.rows.map((row) => row.differences[0]?.awtS ?? Number.NaN),
    );
    const estimate = estimateMean(differences);
    expect(estimate.n).toBe(8);
    expect(atMergedN).toBe(num(smallestDetectableEffect(estimate.stdDev, estimate.n), 2));
  });

  it('criterion 7: refuses a fan-out over its ceiling before any replication runs, and writes no file', async () => {
    const file = join(dir, 'over-ceiling.json');
    const { code, text } = await cli(['compare', ...CONTRAST, '--reps', '6', '--shard', '1/2', '--ceiling', '11', '--out', file]);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('12 replication-runs');
    expect(text).toContain('ceiling of 11');
    // No progress line: not one replication started.
    expect(text).not.toContain('replications\n  … ');
    expect(text).not.toMatch(/… \d+\/\d+ replications/u);
    expect(existsSync(file)).toBe(false);

    // The hint for a missing --ceiling names the figure the refusal above was checked against.
    const hint = await cli(['compare', ...CONTRAST, '--reps', '6', '--shard', '1/2', '--out', file]);
    expect(hint.code).toBe(EXIT_USAGE);
    expect(hint.text).toContain('12 replication-runs: 2 cells × 6 replications');
    expect(existsSync(file)).toBe(false);
  });

  it('criterion 7: reports spend after the verdict, per block and in total, and on no verdict line', async () => {
    const argv = [...CONTRAST, '--reps', '6'];
    const { files } = await shardFiles('spend', argv, 2, 20);
    const merged = await cli(['compare', '--merge', ...files]);
    expect(merged.code, merged.text).toBe(0);

    const lines = merged.text.split('\n');
    const verdict = lines.findIndex((line) => line.includes('VERDICT:'));
    const spend = lines.findIndex((line) => line.startsWith('Spend'));
    expect(verdict).toBeGreaterThanOrEqual(0);
    expect(spend).toBeGreaterThan(verdict);
    expect(merged.text).toMatch(/ceiling\s+20 replication-runs, declared before any block ran/u);
    expect(merged.text).toMatch(/block 1 of 2\s+replications 0–2, 6 runs, [\d.]+ s wall, serial/u);
    expect(merged.text).toMatch(/block 2 of 2\s+replications 3–5, 6 runs, [\d.]+ s wall, serial/u);
    expect(merged.text).toMatch(/total\s+12 of 20 replication-runs, [\d.]+ s of block wall time, summed/u);
    for (const line of lines.filter((candidate) => candidate.includes('VERDICT'))) {
      expect(line).not.toMatch(/replication-runs|wall|ceiling|spend/iu);
    }
  });

  it('criterion 2: refuses to merge a shard file with an arm edited out', async () => {
    const argv = [...CONTRAST, '--reps', '4'];
    const { files } = await shardFiles('dropped-arm', argv, 2, 8);
    const [first, second] = files;
    if (first === undefined || second === undefined) throw new Error('missing file');

    const control = await cli(['compare', '--merge', first, second]);
    expect(control.code, control.text).toBe(0);

    const file = JSON.parse(readFileSync(second, 'utf8')) as {
      result: { cellIds: string[]; pairs: unknown[]; rows: { records: unknown[]; differences: unknown[] }[] };
    };
    const dropped = file.result.cellIds.findIndex((id) => id.endsWith('|B'));
    expect(dropped).toBeGreaterThanOrEqual(0);
    file.result.cellIds.splice(dropped, 1);
    file.result.pairs = [];
    for (const row of file.result.rows) {
      row.records.splice(dropped, 1);
      row.differences = [];
    }
    const edited = join(dir, 'dropped-arm-edited.json');
    writeFileSync(edited, JSON.stringify(file));

    const refused = await cli(['compare', '--merge', first, edited]);
    expect(refused.code).toBe(EXIT_USAGE);
    expect(refused.text).toContain('every arm of every cell');
    expect(refused.text).not.toContain('VERDICT');
  });

  it('refuses to merge blocks of two different comparisons', async () => {
    const one = await shardFiles('mixed-nearest', [...CONTRAST, '--reps', '4'], 2, 8);
    const two = await shardFiles(
      'mixed-collective',
      [...CONTRAST.map((token) => (token === 'nearest-car' ? 'collective' : token)), '--reps', '4'],
      2,
      8,
    );
    const { code, text } = await cli(['compare', '--merge', one.files[0] ?? '', two.files[1] ?? '']);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('different comparisons');
    expect(text).toContain('nearest-car');
    expect(text).toContain('collective');
    expect(text).not.toContain('VERDICT');
  });

  it('refuses an incomplete set of blocks', async () => {
    const { files } = await shardFiles('incomplete', [...CONTRAST, '--reps', '4'], 2, 8);
    const { code, text } = await cli(['compare', '--merge', files[0] ?? '']);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('1 of the 2 shards');
    expect(text).not.toContain('VERDICT');
  });

  it('refuses a flag --merge would ignore, and --shard without its ceiling or its file', async () => {
    const { files } = await shardFiles('flags', [...CONTRAST, '--reps', '4'], 1, 8);
    const file = files[0] ?? '';
    const out = join(dir, 'flags-never-written.json');
    const unseeded = CONTRAST.filter((flag, index) => flag !== '--seed' && CONTRAST[index - 1] !== '--seed');
    const noDirectory = join(dir, 'no-such-directory');
    const cases: readonly { readonly argv: readonly string[]; readonly says: string }[] = [
      { argv: ['compare', '--merge', file, '--seed', '3'], says: '--seed' },
      { argv: ['compare', '--merge', file, '--building', 'garden-apartments'], says: '--building' },
      { argv: ['compare', '--merge'], says: 'names no shard files' },
      { argv: ['compare', '--merge', join(dir, 'does-not-exist.json')], says: 'does-not-exist.json' },
      { argv: ['compare', ...CONTRAST, '--reps', '4', '--shard', '1/2', '--out', out], says: '--ceiling' },
      { argv: ['compare', ...CONTRAST, '--reps', '4', '--shard', '1/2', '--ceiling', '8'], says: '--out' },
      { argv: ['compare', ...CONTRAST, '--reps', '4', '--shard', '3/2', '--ceiling', '8', '--out', out], says: '--shard' },
      { argv: ['compare', ...CONTRAST, '--reps', '4', '--shard', 'half', '--ceiling', '8', '--out', out], says: '--shard' },
      { argv: ['compare', ...CONTRAST, '--reps', '4', '--shard', '1/5', '--ceiling', '8', '--out', out], says: '5' },
      { argv: ['compare', ...CONTRAST, '--reps', '4', '--ceiling', '8'], says: '--ceiling' },
      { argv: ['compare', ...CONTRAST, '--reps', '4', '--out', out], says: '--out' },
      // Without --seed every block draws its own, so no two could merge.
      { argv: ['compare', ...unseeded, '--reps', '4', '--shard', '1/2', '--ceiling', '8', '--out', out], says: '--seed' },
      // An --out that cannot be written is refused before the block runs, not after.
      {
        argv: ['compare', ...CONTRAST, '--reps', '4', '--shard', '1/2', '--ceiling', '8', '--out', join(noDirectory, 'block.json')],
        says: 'was not run',
      },
    ];
    for (const entry of cases) {
      const { code, text } = await cli(entry.argv);
      expect(code, `${entry.argv.join(' ')}\n${text}`).toBe(EXIT_USAGE);
      expect(text, entry.argv.join(' ')).toContain(entry.says);
      expect(text).not.toMatch(/… \d+\/\d+ replications/u);
    }
    expect(existsSync(out)).toBe(false);
    expect(existsSync(noDirectory)).toBe(false);
  });

  it('names the new flags in its help, and how the two halves fit together', async () => {
    const { code, text } = await cli(['compare', '--help']);
    expect(code).toBe(0);
    for (const flag of ['--shard <k/n>', '--out <file>', '--ceiling <runs>', '--merge']) {
      expect(text).toContain(flag);
    }
    expect(text).toContain('compare --merge');
  });
});
