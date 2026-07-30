/**
 * End-to-end tests: the real `main`, the real `data/` directory, the real simulator.
 *
 * Everything here runs against short horizons and small replication counts, because the point
 * is that the wiring is right — that `list` names the buildings, that `run` reports an AWT and
 * the seed, and that `compare` puts an unmodified dispatcher against itself and refuses to rank
 * them. The statistics themselves are tested where they live.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
    for (const command of ['list', 'run', 'compare', 'tune', 'fuzz', 'watch']) {
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

/*
 * `StageActivity.kioskRefusedLegs` reaching a human.
 *
 * **This is the CLI half of the two non-test callers that counter did not have** (DECISIONS.md
 * § D137 item 2, § D149 item 2); the other is `benchmark/accessControl.ts`'s coverage column.
 *
 * It has to be driven through a **derived data directory**, and that is a fact about the fix
 * rather than a weakness of the test: every profile `data/dispatcher-profiles.json` ships runs at
 * `up-down-buttons` or `mobile-credential`, deliberately (§ D30), so no shipped invocation can
 * make this line print. The reader it exists for is the one who authors
 * `dispatch.callType: "destination-entry"` — invariant 7 makes that a data edit, not a code
 * change — and discovers that the building goes unserved with nothing in the table saying which
 * of the two mechanisms did it. So the test authors exactly that profile and runs it.
 */
describe('a bare destination kiosk reports who it turned away', () => {
  let dataDir = '';

  beforeAll(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'elevator-sim-kiosk-'));
    cpSync(DEFAULT_DATA_DIR, dataDir, { recursive: true });
    const profilesPath = join(dataDir, 'dispatcher-profiles.json');
    const profiles = JSON.parse(readFileSync(profilesPath, 'utf8')) as {
      profiles: Record<string, unknown>[];
    };
    /* The one authored field that turns the kiosk bare, and nothing else: `eta`'s weights beside
       `destination-entry`. Invariant 7 — this is a data edit, which is exactly the point. */
    profiles.profiles.push({
      id: 'kiosk-bare',
      name: 'Destination entry with no credential',
      role: 'destination',
      weights: { waitTime: 1 },
      dispatch: { callType: 'destination-entry' },
    });
    writeFileSync(profilesPath, JSON.stringify(profiles, undefined, 2));
  });

  afterAll(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  const REFUSAL_ROW = 'refused at the kiosk';

  it('prints the refused-leg count in the Passengers block, not only in a warning', async () => {
    const { code, text } = await cli([
      'run',
      '--data',
      dataDir,
      '--building',
      'secure-tower',
      '--dispatcher',
      'kiosk-bare',
      '--seed',
      '42',
      ...SHORT,
    ]);
    expect(code).toBe(0);

    const line = text.split('\n').find((row) => row.includes(REFUSAL_ROW));
    expect(
      line,
      'the Passengers block does not name the kiosk refusals. StageActivity.kioskRefusedLegs is ' +
        'back to having no reader in packages/cli — DECISIONS.md § D137 item 2',
    ).toBeDefined();
    // A count, and a real one: this run refuses a three-figure number of legs.
    expect(line).toMatch(/refused at the kiosk\s+\d+ leg\(s\)/u);
    const refused = Number(/refused at the kiosk\s+(\d+) leg/u.exec(line as string)?.[1]);
    expect(refused).toBeGreaterThan(0);

    /* It must sit in the Passengers block, because the figure it qualifies is `undelivered` and a
       reader who has to scroll to a warning list to attribute that figure has not been told. */
    const lines = text.split('\n');
    const passengers = lines.findIndex((row) => row.trim() === 'Passengers');
    const warnings = lines.findIndex((row) => row.trim() === 'Warnings');
    const refusalRow = lines.findIndex((row) => row.includes(REFUSAL_ROW));
    expect(passengers).toBeGreaterThanOrEqual(0);
    expect(warnings).toBeGreaterThan(passengers);
    expect(refusalRow).toBeGreaterThan(passengers);
    expect(refusalRow).toBeLessThan(warnings);

    /* And the count is not larger than the undelivered journeys it explains — a refused leg is
       one of them, so a row claiming more refusals than there are undelivered journeys would be
       reporting a different quantity than the one it sits under. */
    const whole = lines.find((row) => row.includes('whole run')) as string;
    const undelivered = Number(/(\d+) undelivered/u.exec(whole)?.[1]);
    expect(undelivered).toBeGreaterThan(0);
    expect(refused).toBeLessThanOrEqual(undelivered);
  }, 120_000);

  it('says nothing about a kiosk on a shipped profile — the negative control', async () => {
    // A row that appeared on every run would be indistinguishable from a report that never looked.
    // `mobile-credential` on the same building at the same seed carries the credential, so nothing
    // is refused at the interface and the row must be absent rather than zero.
    const { code, text } = await cli([
      'run',
      '--data',
      dataDir,
      '--building',
      'secure-tower',
      '--dispatcher',
      'destination-eta',
      '--seed',
      '42',
      ...SHORT,
    ]);
    expect(code).toBe(0);
    expect(text).not.toContain(REFUSAL_ROW);
    expect(text).toContain('Passengers');
  }, 120_000);
});

describe('elevator-sim compare', () => {
  /**
   * CHANGED 2026-07-27 (review finding #8). This test used to assert `INDISTINGUISHABLE` for a
   * dispatcher compared with itself, and in doing so pinned the defect: every paired difference in
   * that run is *exactly* zero, so the honest answer is IDENTICAL and the advice attached to
   * INDISTINGUISHABLE — raise --reps — is unsatisfiable at any replication count.
   *
   * The claim the old assertion was reaching for, that the command refuses to rank two arms it
   * cannot separate, is kept and strengthened below.
   */
  it('names a self-comparison IDENTICAL, not a resolution problem', async () => {
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
    expect(text).toContain('IDENTICAL');
    expect(text).toContain('VERDICT: IDENTICAL on AWT');
    expect(text).toContain('4 of 4 paired differences are exactly zero');
    /* The refusal to rank, which is what the previous assertion was really about. */
    expect(text).not.toContain('is BETTER than');
    expect(text).not.toContain('is WORSE than');
    /* And the advice that no replication count can satisfy, gone. */
    expect(text).not.toContain('Raise --reps');
    expect(text).not.toContain("below this experiment's resolution");
    expect(text).not.toContain('INDISTINGUISHABLE');
  });

  it('points a bit-identical comparison of two different profiles at the wiring-bug rule', async () => {
    // Finding #8's real case: `eta` and `fairness-first` are distinct shipped profiles that agree
    // on every dispatch decision here, so the paired differences are all exactly zero. The
    // roadmap's rule is that this is a wiring bug until proven otherwise, and the CLI must say so
    // rather than suggest more replications.
    const { code, text } = await cli([
      'compare',
      '--building',
      'garden-apartments',
      '--a',
      'eta',
      '--b',
      'fairness-first',
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
    expect(text).toContain('VERDICT: IDENTICAL on AWT');
    expect(text).toContain('bit-identical result is a wiring bug until proven otherwise');
    expect(text).not.toContain('Raise --reps');
    expect(text).not.toContain("below this experiment's resolution");
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

  /**
   * Review finding #19. `--confidence` moves every bound the command prints and was missing from
   * the `reproduce:` line, so running the printed string could contradict the verdict printed
   * directly above it: at `--confidence 0.8` the measured case printed "AWT −0.22 s [−0.41, −0.04]
   * BETTER" and its own reproduce line re-ran at the 0.95 default as "[−0.51, +0.07]
   * INDISTINGUISHABLE". Both bounds re-measured on this tree; the 0.95 pair was [−0.50, +0.05]
   * before the published interval became Student-t at every `n` (review finding #14), a 4.35 %
   * multiplier at n = 30.
   *
   * `--serial` is appended to the re-run rather than being expected in the printed line: it picks
   * an executor and cannot move a number, which is exactly the criterion for what belongs on a
   * reproduce line and what does not.
   */
  it('prints a reproduce line that reproduces the verdict printed above it', async () => {
    const argv = [
      'compare',
      '--building',
      'midtown-office',
      '--a',
      'eta',
      '--b',
      'capacity-aware',
      '--reps',
      '30',
      '--seed',
      '20260726',
      '--rate',
      '1',
      '--duration',
      '900',
      '--confidence',
      '0.8',
      '--serial',
    ];
    const first = await cli(argv);
    expect(first.code).toBe(0);

    const line = first.text.split('\n').find((candidate) => candidate.includes('reproduce:'));
    expect(line).toBeDefined();
    const printed = (line as string).slice((line as string).indexOf('reproduce:') + 10).trim();
    expect(printed.startsWith('elevator-sim compare')).toBe(true);
    expect(printed).toContain('--confidence 0.8');

    /* Re-run the printed string verbatim, as a user would. */
    const second = await cli([...printed.split(/\s+/).slice(1), '--serial']);
    expect(second.code).toBe(0);

    const awtRows = (text: string): readonly string[] =>
      text.split('\n').filter((row) => row.trim().startsWith('AWT'));
    const verdictLines = (text: string): readonly string[] =>
      text.split('\n').filter((row) => row.includes('VERDICT:'));

    expect(awtRows(second.text)).toEqual(awtRows(first.text));
    expect(verdictLines(second.text)).toEqual(verdictLines(first.text));
    expect(verdictLines(first.text).join('\n')).toContain('is BETTER than');

    /* And the reason the flag has to be on the line: dropping it changes the answer. */
    const withoutConfidence = printed
      .split(/\s+/)
      .slice(1)
      .filter((token, index, tokens) => token !== '--confidence' && tokens[index - 1] !== '--confidence');
    const third = await cli([...withoutConfidence, '--serial']);
    expect(verdictLines(third.text)).not.toEqual(verdictLines(first.text));
  }, 120_000);

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

/* -------------------------------------------------------------------------- *
 * Phase 6b — the destination-dispatch passenger model, through the CLI
 * -------------------------------------------------------------------------- */

describe('a Level-1 run through the CLI', () => {
  it('watch renders a populated landing column and says what the column means', async () => {
    /*
     * Driven, not reasoned about. `docs/09` § 3.1 predicted an **empty** landing series under a
     * panel because the series is keyed `(floorId, direction)`; that symptom does not reproduce,
     * because Phase 6b left `PassengerRecord.direction` populated. What was actually missing was
     * any statement that the column had changed meaning: under a panel `▲71` is seventy-one
     * people each already assigned one car, not one hall call with seventy-one behind it.
     */
    const { code, text } = await cli([
      'watch',
      '--building',
      'midtown-office',
      '--dispatcher',
      'destination-panel',
      '--seed',
      '20260727',
      ...SHORT,
    ]);
    expect(code).toBe(0);
    expect(text).toContain('destination dispatch: the waiting column is a direction bucket');

    // The column is not empty. `waiting` in the plain table is the same `QueueClock` total the
    // full-frame per-floor arrows are summed from, so a non-zero total is the discriminating
    // observation available off a TTY.
    const waiting = [...text.matchAll(/^\s+\d+:\d\d\s+(\d+)\s+\d+/gmu)].map((m) =>
      Number(m[1]),
    );
    expect(waiting.length).toBeGreaterThan(5);
    expect(Math.max(...waiting)).toBeGreaterThan(0);

    // And the comparability disclaimer reaches the summary `printRunReport` prints at the end.
    expect(text).toContain('playback finished');
    expect(text).toContain('destination-dispatch passenger model');
  }, 120_000);

  it('watch says the conventional thing on a conventional run', async () => {
    const { text } = await cli([
      'watch',
      '--building',
      'midtown-office',
      '--dispatcher',
      'eta',
      '--seed',
      '20260727',
      ...SHORT,
    ]);
    expect(text).toContain('pressed a direction button');
    expect(text).not.toContain('destination dispatch: the waiting column');
    expect(text).not.toContain('destination-dispatch passenger model');
  }, 120_000);

  it('compare refuses to gate on AWT when the two arms have different passenger models', async () => {
    /*
     * The defect this measured, before the fix: `--a eta --b destination-panel` printed
     * `VERDICT: INDISTINGUISHABLE on AWT` with nothing said, and AWT is the *first* of the nine
     * metrics `core`'s own `comparabilityOf` says must not be paired across the two models.
     */
    const { code, text } = await cli([
      'compare',
      '--building',
      'midtown-office',
      '--a',
      'eta',
      '--b',
      'destination-panel',
      '--reps',
      '4',
      '--seed',
      '20260727',
      '--rate',
      '1.5',
      '--window',
      'full-run',
      '--duration',
      '1800',
    ]);
    expect(code).toBe(0);
    expect(text).toContain('THE TWO ARMS DO NOT SHARE A PASSENGER MODEL');
    expect(text).toContain('A (eta): conventional');
    expect(text).toContain('B (destination-panel): destination-dispatch');
    // The list is core's, not a copy: every id it names must be one of the nine.
    for (const metric of ['awtS', 'wt95S', 'pctOverLongWait', 'intervalS', 'maxQueueLength']) {
      expect(text).toContain(metric);
    }
    expect(text).toContain('on TTD');
    expect(text).not.toContain('on AWT at n =');
  }, 300_000);

  it('compare still gates on AWT when the two arms share a model', async () => {
    // The negative control. A notice that appeared on every comparison would be indistinguishable
    // from a module that never looked.
    const { text } = await cli([
      'compare',
      '--building',
      'midtown-office',
      '--a',
      'eta',
      '--b',
      'destination-eta',
      '--reps',
      '4',
      '--seed',
      '20260727',
      '--rate',
      '1.5',
      '--window',
      'full-run',
      '--duration',
      '1800',
    ]);
    expect(text).not.toContain('THE TWO ARMS DO NOT SHARE A PASSENGER MODEL');
    expect(text).toContain('on AWT');
  }, 300_000);
});
