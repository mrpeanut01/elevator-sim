/**
 * `fuzz`, end to end: the real `main`, the real `data/` directory, the real generator, the real
 * simulator.
 *
 * The budgets here are tiny on purpose — six pinned cases — because the claim under test is
 * **connection**, not coverage. docs/07-handoff.md § 3 records `C24`: every importer of
 * `packages/experiments/src/fuzz/campaign.ts` outside `fuzz/index.ts` was a `*.test.ts`, which is
 * the same shape as the nine defects the standing requirement counts, weaker only because a
 * fuzzer's product genuinely is a test. A suite that drove `runCampaign` directly is exactly what
 * that looked like, and it was green. So this file drives it the way a user does: through
 * `main(['fuzz', …])`, all the way to a verdict and an exit code.
 *
 * **The branch that matters is the one a green run never reaches.** A campaign that has never
 * printed a counterexample is a campaign nobody can trust to print one, and the command
 * deliberately ships no fault-injection flag — a `--break-dispatch` on a user's command line would
 * be a way to manufacture the very findings the command exists to report. So the red path is
 * driven here from a **real** faulted run: `stallingAfter(60)` through the shipped `evaluateCase`,
 * into `reportCampaign`, which is the same function `runFuzz` calls.
 */

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import {
  STANDARD_CORPUS,
  STANDARD_SPACE,
  caseFromSeed,
  evaluateCase,
  generateOptionsFrom,
  isFailure,
  runCampaign,
  stallingAfter,
  type CampaignStats,
  type FuzzOutcome,
} from '@elevator-sim/experiments';
import { beforeAll, describe, expect, it } from 'vitest';

import { main } from '../index.js';
import { DEFAULT_DATA_DIR } from '../data.js';
import { EXIT_INTERNAL, EXIT_USAGE } from '../errors.js';
import { BINARY } from '../help.js';
import { createBufferedOutput, type BufferedOutput } from '../output.js';

import {
  chunkSize,
  mergeStats,
  reportCampaign,
  seedsFor,
  spaceOf,
  violationsByProperty,
} from './fuzz.js';

interface Run {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

async function cli(argv: readonly string[]): Promise<Run> {
  const options = { color: false, columns: 120, rows: 60, env: {} } as const;
  const out: BufferedOutput = createBufferedOutput(options);
  const err: BufferedOutput = createBufferedOutput(options);
  const code = await main(argv, out, err);
  return { code, out: out.text(), err: err.text() };
}

/** Six of the pinned corpus. Enough to reach every section of the report, and seconds to run. */
const TINY = ['fuzz', '--cases', '6'];

/* -------------------------------------------------------------------------- *
 * The command runs a real campaign
 * -------------------------------------------------------------------------- */

describe('elevator-sim fuzz runs a real campaign against the shipped simulator', () => {
  it('generates buildings, checks all six properties, and reports what it cost', { timeout: 180_000 }, async () => {
    const { code, out } = await cli(TINY);

    expect(code).toBe(0);
    expect(out).toContain('Fuzz campaign');

    /* The campaign's own accounting, printed rather than inferred — the cost is never silent. */
    expect(out).toContain('What ran');
    expect(out).toMatch(/cases\s+6 \(6 evaluated, 0 skipped\)/);
    expect(out).toMatch(/passengers\s+\d+/);
    expect(out).toMatch(/simulated time\s+\d+\.\d\d h/);
    /* Real buildings were generated: the topology histogram is not empty and names the
       generator's own vocabulary rather than a shipped building id. */
    expect(out).toMatch(/topologies\s+.*(single-bank|parallel-banks|sky-lobby|shuttle)/);
    expect(out).toMatch(/run statuses\s+.*(completed|timed-out)/);

    /* All six named, not a count. A campaign that says "6 properties held" without naming them
       cannot be checked against `FUZZ_PROPERTIES`. */
    for (const property of [
      'conservation',
      'destination',
      'capacity',
      'monotonic-time',
      'termination',
      'starvation',
    ]) {
      expect(out).toContain(property);
    }
    expect(out).toContain('VERDICT: ALL 6 PROPERTIES HELD');
  });

  it('states the bounds it checks against, and offers no way to move them', { timeout: 180_000 }, async () => {
    const { out } = await cli(TINY);
    /* `fuzz-1001074`'s whole lesson: the 900 s bound is the finding, not the obstacle. It is
       printed so a reader knows what "held" means, and there is no flag that changes it. */
    expect(out).toContain('deadlock 600 s idle, starvation 900 s');
    expect(out).toContain('not settable from here');

    const { code, err } = await cli([...TINY, '--starvation-bound', '2000']);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('unknown flag "--starvation-bound"');
  });

  it('is reproducible from its own reproduce line', { timeout: 300_000 }, async () => {
    const first = await cli(TINY);
    const line = /reproduce: elevator-sim fuzz (.*)/.exec(first.out)?.[1];
    expect(line).toBeDefined();

    const again = await cli(['fuzz', ...(line ?? '').split(' ')]);
    const strip = (text: string): string =>
      text
        .split('\n')
        .filter((row) => !row.includes('…') && !row.includes('reproduce:'))
        .join('\n');
    expect(strip(again.out)).toBe(strip(first.out));
  });

  it('chunking the campaign for progress cannot move a number', { timeout: 300_000 }, async () => {
    /* The command splits the seed list so that a 2 000-case run prints progress instead of looking
       like a hang. A case is a pure function of its own seed and carries its own `StreamSet`, so
       the grouping must not be observable — asserted against a single `runCampaign` call over the
       same seeds rather than assumed, because "it obviously cannot matter" is how a determinism
       defect ships. At six cases the command runs six chunks of one. */
    expect(chunkSize(6)).toBe(1);

    const config = await loadConfig(DEFAULT_DATA_DIR);
    const whole = runCampaign({
      config,
      seeds: seedsFor('standard', 6, 1),
      space: STANDARD_SPACE,
    });

    const { out } = await cli(TINY);
    const numberAfter = (label: string): number =>
      Number(new RegExp(`${label}\\s+(\\d+)`).exec(out)?.[1] ?? '-1');

    expect(numberAfter('passengers')).toBe(whole.stats.generatedPassengers);
    expect(numberAfter('failures')).toBe(whole.stats.failures);
    expect(out).toContain(`(${String(whole.stats.evaluated)} evaluated, ${String(whole.stats.skipped)} skipped)`);
    /* The progress lines are the reason chunking exists, so their absence would mean the loop had
       quietly collapsed back to one call. */
    expect(out).toMatch(/… \d+\/6 cases, 0 counterexample\(s\) so far/);
  });

  it('reaches the deep space, which is the only place the wide corpus lives', { timeout: 300_000 }, async () => {
    /* Named because `--tier` is the only thing that selects `DEEP_SPACE`, and without it the
       whole opt-in tier would still be reachable from an environment variable and a vitest
       invocation and from no command a user can type. */
    const { code, out } = await cli(['fuzz', '--tier', 'deep', '--cases', '2']);
    expect(code).toBe(0);
    expect(out).toContain('seeds 1000001…1000002');
    expect(out).toContain('2–40 floors');
    expect(out).toContain('--from 1000001');
  });
});

/* -------------------------------------------------------------------------- *
 * The branch a green run never reaches
 * -------------------------------------------------------------------------- */

describe('a property violation is impossible to miss', () => {
  let config: LoadedConfig;
  let failing: FuzzOutcome;

  beforeAll(async () => {
    config = await loadConfig(DEFAULT_DATA_DIR);
    /* A real run of a real generated case, with a real fault: stages 2–5 refuse every call from
       t = 60, which is `fuzz/faults.test.ts`'s own P5 demonstration. Nothing is hand-built —
       `evaluateCase` produces the outcome the campaign would produce, violations and all. */
    const options = generateOptionsFrom(config, STANDARD_SPACE);
    const fuzzCase = caseFromSeed(STANDARD_CORPUS[0] ?? 101, options);
    failing = evaluateCase(fuzzCase, { config, createPolicy: stallingAfter(60) });
  }, 120_000);

  it('the fault really does break a property, so the fixture is not a fiction', () => {
    expect(isFailure(failing)).toBe(true);
    expect(failing.violations.length).toBeGreaterThan(0);
    expect(failing.skipped).toBeUndefined();
  });

  it('prints a red banner, the violated property, the case in full, and exits 2', () => {
    const out = createBufferedOutput({ color: false, columns: 120, rows: 60, env: {} });
    const stats: CampaignStats = {
      cases: 1,
      evaluated: 1,
      skipped: 0,
      failures: 1,
      generatedPassengers: failing.generatedPassengers,
      simulatedSeconds: failing.simulatedSeconds,
      topologies: { [failing.case.topology]: 1 },
      statuses: { [failing.status]: 1 },
    };

    const code = reportCampaign(out, {
      tier: 'standard',
      stats,
      outcomes: [failing],
      failures: [{ original: failing, minimal: failing, steps: 0, evaluations: 0 }],
    });

    const text = out.text();
    expect(code).toBe(EXIT_INTERNAL);
    expect(text).toContain('VERDICT:');
    expect(text).toContain('PROPERTY VIOLATION(S)');
    expect(text).toContain('██');

    /* Every property the run actually violated is named as VIOLATED, and no property it did not
       violate is. The set comes from the outcome, not from a guess about what stalling breaks. */
    const violated = new Set(failing.violations.map((violation) => violation.property));
    expect(violated.size).toBeGreaterThan(0);
    for (const property of violated) {
      expect(text).toMatch(new RegExp(`${property}\\s+VIOLATED`));
    }

    /* A counterexample nobody can replay is a rumour: the generator seed and the whole building
       are on the page, not a summary of them. */
    expect(text).toContain('Counterexamples');
    expect(text).toContain(failing.case.fuzzSeed);
    expect(text).toContain('reproduce the unshrunk parent');
    expect(text).toContain('caseFromSeed');
    expect(text).toContain('"banks"');

    /* And the instruction that keeps the finding a finding. */
    expect(text).toContain('never move a bound');
    expect(text).not.toContain('ALL 6 PROPERTIES HELD');
  });

  it('surfaces a case that produced no verdict as a generator defect, not as a pass', () => {
    const out = createBufferedOutput({ color: false, columns: 120, rows: 60, env: {} });
    const code = reportCampaign(out, {
      tier: 'deep',
      stats: {
        cases: 2,
        evaluated: 1,
        skipped: 1,
        failures: 0,
        generatedPassengers: 10,
        simulatedSeconds: 600,
        topologies: { 'sky-lobby': 2 },
        statuses: { completed: 1, unroutable: 1 },
      },
      outcomes: [],
      failures: [],
    });

    const text = out.text();
    /* Zero failures, so the run is green — and the skipped case is still named, with what it
       means, because `unroutable` is a defect in the *generator* and swallowing it would let the
       corpus quietly narrow. */
    expect(code).toBe(0);
    expect(text).toContain('1 case(s) produced no verdict');
    expect(text).toContain('1 unroutable');
    expect(text).toContain('generator defects');
  });
});

/* -------------------------------------------------------------------------- *
 * What it refuses
 * -------------------------------------------------------------------------- */

describe('fuzz teaches the vocabulary when a flag is wrong', () => {
  it('refuses to extend the pinned corpus, and names the tier that can', async () => {
    const { code, err } = await cli(['fuzz', '--cases', '500']);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('more than the standard tier has');
    expect(err).toContain('--tier deep');
  });

  it('rejects a tier that is not one of the two', async () => {
    const { code, err } = await cli(['fuzz', '--tier', 'shallow']);
    expect(code).toBe(EXIT_USAGE);
    expect(err).toContain('--tier does not accept "shallow"');
    expect(err).toContain('deep');
  });

  it('is listed in the root help with its summary, not only routable by name', async () => {
    /* `cli.test.ts` asserts the whole command list; this asserts the thing a user reads to decide
       whether to type it, because a command routable only by somebody who already knows its name
       is a command nobody finds. */
    const { code, out } = await cli(['--help']);
    expect(code).toBe(0);
    expect(out).toContain('fuzz');
    expect(out).toContain('generate random buildings');
    expect(out).toContain(`${BINARY} fuzz --cases 8`);
  });
});

/* -------------------------------------------------------------------------- *
 * The pure pieces
 * -------------------------------------------------------------------------- */

describe('the pieces that decide what runs', () => {
  it('takes the standard tier’s seeds from the pinned corpus and never past it', () => {
    expect(seedsFor('standard', undefined, 1)).toBe(STANDARD_CORPUS);
    expect(seedsFor('standard', 4, 1)).toEqual(STANDARD_CORPUS.slice(0, 4));
    /* Pinned means pinned: the always-on tier is a regression suite, and a corpus that grew
       generated seeds on demand would stop being the same buildings on every machine. */
    expect(() => seedsFor('standard', STANDARD_CORPUS.length + 1, 1)).toThrow(
      /more than the standard tier has/,
    );
  });

  it('makes the deep tier a contiguous range so any budget is reachable', () => {
    expect(seedsFor('deep', 4, 1_000_001)).toEqual([1_000_001, 1_000_002, 1_000_003, 1_000_004]);
    /* The overnight pass, from the command line rather than from an environment variable. */
    expect(seedsFor('deep', 2000, 1_000_001)).toHaveLength(2000);
    expect(spaceOf('deep').maxFloors).toBeGreaterThan(spaceOf('standard').maxFloors);
  });

  it('chunks for progress without ever producing a zero-length chunk', () => {
    expect(chunkSize(2000)).toBe(250);
    expect(chunkSize(64)).toBe(8);
    expect(chunkSize(1)).toBe(1);
    /* A zero chunk would loop forever; a chunk larger than the run is simply one chunk. */
    for (const cases of [1, 2, 3, 7, 64, 250, 2000]) {
      expect(chunkSize(cases)).toBeGreaterThan(0);
      expect(chunkSize(cases)).toBeLessThanOrEqual(cases);
    }
  });

  it('adds two chunks’ accounting without losing a histogram key', () => {
    const a: CampaignStats = {
      cases: 2,
      evaluated: 2,
      skipped: 0,
      failures: 0,
      generatedPassengers: 10,
      simulatedSeconds: 100,
      topologies: { 'single-bank': 2 },
      statuses: { completed: 2 },
    };
    const b: CampaignStats = {
      cases: 3,
      evaluated: 2,
      skipped: 1,
      failures: 1,
      generatedPassengers: 5,
      simulatedSeconds: 50,
      topologies: { 'single-bank': 1, shuttle: 2 },
      statuses: { completed: 1, 'timed-out': 1, unroutable: 1 },
    };
    const merged = mergeStats(a, b);

    expect(merged.cases).toBe(5);
    expect(merged.evaluated).toBe(4);
    expect(merged.skipped).toBe(1);
    expect(merged.failures).toBe(1);
    expect(merged.generatedPassengers).toBe(15);
    expect(merged.simulatedSeconds).toBe(150);
    /* A key present in one side only survives; a shared key adds rather than overwriting. */
    expect(merged.topologies).toEqual({ 'single-bank': 3, shuttle: 2 });
    expect(merged.statuses).toEqual({ completed: 3, 'timed-out': 1, unroutable: 1 });
  });

  it('counts a violated property once per case, not once per violation', () => {
    /* `fuzz-1001074` produced two starvation violations from one building. Reporting "2 cases"
       would overstate a finding, which is the one direction this project cannot overstate in. */
    const outcome = (properties: readonly string[]): FuzzOutcome =>
      ({
        case: {},
        violations: properties.map((property) => ({ property, message: property })),
        generatedPassengers: 0,
        simulatedSeconds: 0,
        status: 'completed',
      }) as unknown as FuzzOutcome;

    const counts = violationsByProperty([
      outcome(['starvation', 'starvation']),
      outcome(['starvation', 'termination']),
      outcome([]),
    ]);
    expect(counts.get('starvation')).toBe(2);
    expect(counts.get('termination')).toBe(1);
    expect(counts.get('capacity')).toBeUndefined();
  });
});
