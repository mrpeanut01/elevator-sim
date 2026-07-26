/**
 * End-to-end tests: the real `main`, the real `data/` directory, the real simulator.
 *
 * Everything here runs against short horizons and small replication counts, because the point
 * is that the wiring is right — that `list` names the buildings, that `run` reports an AWT and
 * the seed, and that `compare` puts an unmodified dispatcher against itself and refuses to rank
 * them. The statistics themselves are tested where they live.
 */

import { describe, expect, it } from 'vitest';

import { main } from './index.js';
import { createBufferedOutput, type BufferedOutput } from './output.js';
import { DEFAULT_DATA_DIR } from './data.js';
import { EXIT_USAGE } from './errors.js';

interface Run {
  readonly code: number;
  readonly text: string;
}

async function cli(argv: readonly string[], columns = 120): Promise<Run> {
  const out: BufferedOutput = createBufferedOutput({ color: false, columns, rows: 60, env: {} });
  const code = await main(argv, out, out);
  return { code, text: out.text() };
}

interface SplitRun {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

/** The same, with the two streams kept apart. For asserting *where* a message went. */
async function splitCli(argv: readonly string[]): Promise<SplitRun> {
  const options = { color: false, columns: 120, rows: 60, env: {} } as const;
  const out: BufferedOutput = createBufferedOutput(options);
  const err: BufferedOutput = createBufferedOutput(options);
  const code = await main(argv, out, err);
  return { code, out: out.text(), err: err.text() };
}

/**
 * The metric rows of the `Arms` table: everything between the column header and `saturated`.
 *
 * Returned as cells, split on the column gap, so a test can say "no value in this table is a
 * number" without tripping over the `95` in `WT95` or the `60` in `% waits > 60 s`.
 */
function armsTableValues(text: string): readonly (readonly string[])[] {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'Arms');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, index) => index > start && line.trim().startsWith('saturated'));
  expect(end).toBeGreaterThan(start);
  // start + 1 is the rule, start + 2 the column header.
  return lines.slice(start + 3, end).map((line) => line.trim().split(/\s{2,}/).slice(1));
}

const SHORT = ['--duration', '600'];

describe('elevator-sim --help and exit codes', () => {
  it('prints the command list and exits 0', async () => {
    const { code, text } = await cli(['--help']);
    expect(code).toBe(0);
    for (const command of ['list', 'run', 'compare', 'watch']) {
      expect(text).toContain(command);
    }
    expect(text).toContain('prints the seed it used');
    // The heading promised "global" and the flags were rejected in the leading position, so the
    // help now says which side of the command each one goes on.
    expect(text).toContain('before or after the command');
  });

  it('keeps diagnostics off stdout so redirecting the results still shows the error', async () => {
    const { code, out, err } = await splitCli(['run', '--building', 'nope', '--dispatcher', 'eta']);
    expect(code).toBe(EXIT_USAGE);
    expect(out).toBe('');
    expect(err).toContain('no building with id "nope"');
  });

  it('keeps results off stderr', async () => {
    const { code, out, err } = await splitCli(['list']);
    expect(code).toBe(0);
    expect(err).toBe('');
    expect(out).toContain('garden-apartments');
  });

  it('prints per-command help', async () => {
    const { code, text } = await cli(['compare', '--help']);
    expect(code).toBe(0);
    expect(text).toContain('elevator-sim compare');
    expect(text).toContain('--reps');
    expect(text).toContain('INDISTINGUISHABLE');
  });

  it('accepts the flags it calls global before the command, as the help says it does', async () => {
    // The root help lists --data and --no-color under "Global flags". Both used to be rejected
    // in the leading position, and rejected as an *unknown command*, which points the user at
    // the wrong thing entirely.
    for (const argv of [
      ['--no-color', 'list'],
      ['--data', DEFAULT_DATA_DIR, 'list'],
      [`--data=${DEFAULT_DATA_DIR}`, 'list'],
      ['--no-color', '--data', DEFAULT_DATA_DIR, 'list'],
    ]) {
      const { code, text } = await cli(argv);
      expect(code, argv.join(' ')).toBe(0);
      expect(text, argv.join(' ')).toContain('garden-apartments');
    }
  });

  it('still lets a flag typed after the command win over the same flag typed before it', async () => {
    const { code, text } = await cli(['--data', 'nope', 'list', '--data', DEFAULT_DATA_DIR]);
    expect(code).toBe(0);
    expect(text).toContain('garden-apartments');
  });

  it('says a leading unknown flag is misplaced rather than calling it an unknown command', async () => {
    const { code, text } = await cli(['--verbose', 'list']);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('flags come after the command');
    expect(text).not.toContain('unknown command');
  });

  it('exits 1 with a suggestion for an unknown command', async () => {
    const { code, text } = await cli(['compair']);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('unknown command "compair"');
    expect(text).toContain('did you mean "compare"?');
  });

  it('exits 1 for an unknown flag without printing a stack', async () => {
    const { code, text } = await cli(['run', '--buidling', 'garden-apartments']);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('unknown flag "--buidling"');
    expect(text).not.toContain('at Object.');
  });

  it('exits 1 and lists the ids for a building that does not exist', async () => {
    const { code, text } = await cli([
      'run',
      '--building',
      'garden-apartment',
      '--dispatcher',
      'eta',
    ]);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('no building with id "garden-apartment"');
    expect(text).toContain('garden-apartments');
    expect(text).toContain('midtown-office');
  });

  it('exits 1, not 2, when a flag makes the run impossible to set up', async () => {
    const { code, text } = await cli([
      'run',
      '--building',
      'garden-apartments',
      '--dispatcher',
      'eta',
      '--duration',
      '120',
    ]);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('cannot be simulated');
    expect(text).toContain('300 s peak hold');
    expect(text).toContain('--duration');
  });

  it('exits 1 and lists the ids for a dispatcher that does not exist', async () => {
    const { code, text } = await cli([
      'run',
      '--building',
      'garden-apartments',
      '--dispatcher',
      'et',
    ]);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('no dispatcher profile with id "et"');
    expect(text).toContain('nearest-car');
  });
});

describe('elevator-sim list', () => {
  it('names all five buildings, with their shape', async () => {
    const { code, text } = await cli(['list']);
    expect(code).toBe(0);
    for (const id of [
      'garden-apartments',
      'midtown-office',
      'mixed-use-high-rise',
      'secure-tower',
      'vertical-city',
    ]) {
      expect(text).toContain(id);
    }
    // Floors, banks, cars, population and type are what make the table worth reading.
    expect(text).toContain('residential');
    expect(text).toContain('mixed-use');
    expect(text).toContain('1,710');
  });

  it('names the dispatcher profiles with their weight vectors', async () => {
    const { text } = await cli(['list']);
    expect(text).toContain('nearest-car');
    expect(text).toContain('distanceTravelled 1.00');
    expect(text).toContain('eta');
    expect(text).toContain('waitTime 1.00');
  });

  it('names the traffic profiles and their design targets', async () => {
    const { text } = await cli(['list']);
    expect(text).toContain('office-standard');
    expect(text).toContain('up-peak');
    expect(text).toContain('rise-and-fall');
  });
});

describe('elevator-sim run', () => {
  it('summarises a Garden Apartments run, naming AWT and the seed', async () => {
    const { code, text } = await cli([
      'run',
      '--building',
      'garden-apartments',
      '--dispatcher',
      'eta',
      '--seed',
      '42',
      '--window',
      'full-run',
      ...SHORT,
    ]);
    expect(code).toBe(0);
    expect(text).toContain('AWT');
    expect(text).toMatch(/AWT\s+\d+\.\d+ s/);
    expect(text).toContain('seed');
    expect(text).toContain('42');
    expect(text).toContain('WT95');
    expect(text).toContain('waits over 60 s');
    expect(text).toContain('TTD (mean)');
    expect(text).toContain('achieved interval');
    expect(text).toContain('handling capacity');
    expect(text).toContain('mean car load');
    expect(text).toContain('generated');
    expect(text).toContain('delivered');
  });

  it('prints a reproduce line carrying the seed it used', async () => {
    const { text } = await cli([
      'run',
      '--building',
      'garden-apartments',
      '--dispatcher',
      'eta',
      '--seed',
      '2026',
      ...SHORT,
    ]);
    expect(text).toContain('reproduce:');
    expect(text).toContain('--seed 2026');
  });

  it('prints a seed even when none was given, so the run is reproducible', async () => {
    const { code, text } = await cli([
      'run',
      '--building',
      'garden-apartments',
      '--dispatcher',
      'eta',
      ...SHORT,
    ]);
    expect(code).toBe(0);
    const match = /--seed (\d+)/.exec(text);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(0);
  });

  it('reports the achieved interval as unmeasurable where no threshold is valid', async () => {
    const { code, text } = await cli([
      'run',
      '--building',
      'mixed-use-high-rise',
      '--dispatcher',
      'eta',
      '--seed',
      '7',
      '--duration',
      '300',
      '--rate',
      '2',
    ]);
    expect(code).toBe(0);
    expect(text).toContain('achieved interval');
    // Either a real measurement or the explicit refusal — never a fallback constant dressed up
    // as a measurement.
    expect(text).toMatch(/achieved interval\s+(unmeasurable|—|\d)/);
  });

  it('suppresses time to destination on a saturated run, not only the waiting block', async () => {
    // Midtown Office at its declared demand saturates. This is the `--help` example, so it is
    // the first thing many users see; TTD contains the wait the banner has just refused to
    // quote, and it used to print as a plain number four lines underneath it.
    const { code, text } = await cli([
      'run',
      '--building',
      'midtown-office',
      '--dispatcher',
      'predictive-balanced',
      '--seed',
      '42',
    ]);
    expect(code).toBe(0);
    expect(text).toContain('SATURATED');
    expect(text).toContain('must not be quoted');

    const lines = text.split('\n');
    const ttdLines = lines.filter((line) => line.trim().startsWith('TTD '));
    expect(ttdLines.length).toBe(2);
    for (const line of ttdLines) {
      // The value only — the `95` in the label "TTD (95th pct)" is a label, not a measurement.
      const value = line.trim().split(/\s{2,}/)[1];
      expect(value).toBe('SUPPRESSED');
      expect(value).not.toMatch(/\d/);
    }
  }, 120_000);

  it('still says "—" rather than SUPPRESSED when there was simply nothing to measure', async () => {
    // Zero demand is not saturation: nothing diverged, there is just no journey to average.
    // "SUPPRESSED" there would claim a number exists and is being withheld.
    const { code, text } = await cli([
      'run',
      '--building',
      'garden-apartments',
      '--dispatcher',
      'eta',
      '--seed',
      '1',
      '--rate',
      '0',
      ...SHORT,
    ]);
    expect(code).toBe(0);
    const ttd = text.split('\n').find((line) => line.trim().startsWith('TTD (mean)'));
    expect(ttd).toBeDefined();
    expect(ttd).toContain('—');
    expect(ttd).not.toContain('SUPPRESSED');
  });
});

describe('elevator-sim compare', () => {
  it('reports INDISTINGUISHABLE when a dispatcher is compared with itself', async () => {
    const { code, text } = await cli([
      'compare',
      '--building',
      'garden-apartments',
      '--a',
      'eta',
      '--b',
      'eta',
      '--reps',
      '4',
      '--seed',
      '20260726',
      '--window',
      'full-run',
      '--serial',
      ...SHORT,
    ]);
    expect(code).toBe(0);
    expect(text).toContain('INDISTINGUISHABLE');
    expect(text).not.toContain('is BETTER than');
    expect(text).not.toContain('is WORSE than');
  });

  it('verifies common random numbers rather than assuming them', async () => {
    const { text } = await cli([
      'compare',
      '--building',
      'garden-apartments',
      '--a',
      'eta',
      '--b',
      'nearest-car',
      '--reps',
      '4',
      '--seed',
      '20260726',
      '--window',
      'full-run',
      '--serial',
      ...SHORT,
    ]);
    expect(text).toContain('common RNs');
    expect(text).toContain('verified');
    expect(text).not.toContain('MISMATCH');
  });

  it('never prints a mean without an interval, and always prints the seed', async () => {
    const { text } = await cli([
      'compare',
      '--building',
      'garden-apartments',
      '--a',
      'eta',
      '--b',
      'nearest-car',
      '--reps',
      '4',
      '--seed',
      '99',
      '--window',
      'full-run',
      '--serial',
      ...SHORT,
    ]);
    expect(text).toContain('there is no bare mean here');
    expect(text).toContain('--seed 99');
    // Every AWT figure on the arms table is followed by its bracketed interval.
    const armLine = text.split('\n').find((line) => line.trim().startsWith('AWT '));
    expect(armLine).toBeDefined();
    expect(armLine).toMatch(/\[.*\]/);
  });

  it('warns when the replication budget is below the documented range', async () => {
    const { text } = await cli([
      'compare',
      '--building',
      'garden-apartments',
      '--a',
      'eta',
      '--b',
      'nearest-car',
      '--reps',
      '4',
      '--seed',
      '5',
      '--window',
      'full-run',
      '--serial',
      ...SHORT,
    ]);
    expect(text).toContain('below the documented 50–200');
  });

  it('never prints a difference beside a verdict when the arms themselves are suppressed', async () => {
    // Midtown Office at its declared demand saturates, so nothing about waiting may be quoted —
    // including the difference between two suppressed means.
    const { code, text } = await cli([
      'compare',
      '--building',
      'midtown-office',
      '--a',
      'eta',
      '--b',
      'nearest-car',
      '--reps',
      '2',
      '--seed',
      '20260726',
      '--serial',
    ]);
    expect(code).toBe(0);
    expect(text).toContain('SATURATED');
    expect(text).toContain('VERDICT: NONE');
    expect(text).not.toContain('BETTER');
    expect(text).not.toContain('WORSE');

    // Not one number survives in the Arms table. TTD used to: it is not called a waiting time,
    // but core defines it as including every transfer wait and averages it over the journeys
    // that completed, so on a saturated arm it is a divergent quantity measured on the
    // survivors. It printed two non-overlapping intervals directly above the line saying the
    // arms were not reportable, which is a ranking handed to the reader by the back door.
    const values = armsTableValues(text);
    expect(values.length).toBe(4);
    for (const row of values) {
      expect(row.length).toBeGreaterThan(0);
      for (const cell of row) {
        expect(cell).toBe('SUPPRESSED');
        expect(cell).not.toMatch(/\d/);
      }
    }
    const ttd = text.split('\n').find((line) => line.trim().startsWith('TTD '));
    expect(ttd).toBeDefined();
    expect(ttd).toContain('SUPPRESSED');
    expect(ttd).not.toMatch(/\d/);
    expect(ttd).not.toMatch(/\[/);
  });

  it('exits 1 when an arm names a dispatcher that does not exist', async () => {
    const { code, text } = await cli([
      'compare',
      '--building',
      'garden-apartments',
      '--a',
      'eta',
      '--b',
      'nowhere',
      '--reps',
      '2',
    ]);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('no dispatcher profile with id "nowhere"');
    expect(text).toContain('(--b)');
  });
});

describe('elevator-sim watch', () => {
  it('degrades to line output off a TTY and still prints the seed and a summary', async () => {
    const { code, text } = await cli([
      'watch',
      '--building',
      'garden-apartments',
      '--dispatcher',
      'eta',
      '--seed',
      '11',
      ...SHORT,
    ]);
    expect(code).toBe(0);
    expect(text).toContain('seed');
    expect(text).toContain('11');
    expect(text).toContain('mean wait');
    expect(text).toContain('playback finished');
    expect(text).toContain('AWT');
  });

  it('exits 1 and lists the banks for a bank that does not exist', async () => {
    const { code, text } = await cli([
      'watch',
      '--building',
      'secure-tower',
      '--dispatcher',
      'eta',
      '--bank',
      'middle',
      '--duration',
      '120',
    ]);
    expect(code).toBe(EXIT_USAGE);
    expect(text).toContain('has no bank "middle"');
    expect(text).toContain('low, high');
  });
});
