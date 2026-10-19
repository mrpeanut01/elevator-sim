/**
 * **The adversarial persona's gate**: the pinned corpus on stage 1, every pinned regression, the
 * generator's contract, and each P-PLAY property shown to fail on a real session.
 *
 * Stage 1 is the stage the persona was run on first and the cheapest one there is (two cars, a
 * residential trickle, nineteen riders on replication 0), so the always-on half here costs a
 * couple of seconds. A property that has never failed is a property that cannot fail, so the
 * fault cases at the bottom break each one on a real run through `PlaySessions.evaluate`'s fault
 * hook, which the campaign and the command never set.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  INTERVENTION_KINDS,
  loadConfig,
  runSimulation,
  type LoadedConfig,
  type SimulationResult,
} from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { formatPlayCase, playLogJson, shrinkPlayCase } from './playShrink.js';
import {
  PLAY_REGRESSIONS,
  STANDARD_PLAY_CORPUS,
  canonicalVerbs,
  playCaseFromPinned,
  rankVerbs,
  runPlayCampaign,
} from './playCampaign.js';
import { PLAY_PROPERTIES, PlaySessions, isPlayFailure, refusalGroundsOf } from './play.js';
import { playStageOf, stageSessionConfigFor } from './stageSession.js';
import {
  PLAY_SHAPES,
  STANDARD_PLAY_SPACE,
  playCaseFromSeed,
  playContextFor,
  playLogRefusal,
  playLogSpend,
  type PlayCase,
  type PlayContext,
} from './verbs.js';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const STAGE = 'stage-1-first-call';

let config: LoadedConfig;
let campaign: unknown;
let priceSchedule: unknown;
let context: PlayContext;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  campaign = JSON.parse(readFileSync(`${DATA_DIR}/campaign.json`, 'utf8')) as unknown;
  priceSchedule = JSON.parse(readFileSync(`${DATA_DIR}/price-schedule.json`, 'utf8')) as unknown;
  context = playContextFor({ config, campaign, priceSchedule, stageId: STAGE });
}, 60_000);

function pinned(caseId: string): PlayCase {
  const pin = PLAY_REGRESSIONS.find((entry) => entry.caseId === caseId);
  if (pin === undefined) throw new Error(`no pinned case ${caseId}`);
  return playCaseFromPinned(pin, context);
}

/* -------------------------------------------------------------------------- *
 * The stage, read from its plain fields
 * -------------------------------------------------------------------------- */

describe('a stage is read from its plain fields', () => {
  it('reads stage 1 as data/campaign.json writes it, and refuses a stage it does not declare', () => {
    const stage = playStageOf(campaign, STAGE);
    expect(stage.buildingId).toBe('garden-apartments');
    expect(stage.startingProfileId).toBe('collective');
    expect(stage.arrivalRatePctPop5min).toBeNull();
    expect(stage.durationS).toBe(900);
    expect(stage.tuningSeeds.seed).toBe('20260730');
    expect(stage.goalKinds).toEqual(['beat-the-baseline']);
    /* The base rung, then each step bought in order: 4 u, 24 u, 54 u. */
    expect(stage.budgetRungs).toEqual([4, 24, 54]);
    expect(() => playStageOf(campaign, 'stage-99')).toThrow(/declares no stage "stage-99"/);
  });

  it('builds the session config with the log on it, and with no interventions key for an empty log', () => {
    const empty = stageSessionConfigFor(context.stage, context.resources, 3);
    expect('interventions' in empty).toBe(false);
    expect(empty.reportWindow).toBe('full-run');
    expect(empty.onTimeout).toBe('report');
    expect(empty.replication).toBe(3);
    const log = [{ atS: 10, change: { kind: 'spread-cars' as const } }];
    expect(stageSessionConfigFor(context.stage, context.resources, 3, log).interventions).toBe(log);
  });

  it('asks core which handovers it schedules rather than deciding, and refuses the ones that change the model', () => {
    /* `collective` opens on up/down buttons with no bidding: core refuses an adopt to either
       destination profile or either auction, and accepts every switch (a switch moves weights only). */
    const adopt = context.adoptTargets.map((profile) => profile.id);
    expect(adopt).not.toContain('destination-panel');
    expect(adopt).not.toContain('auction');
    expect(adopt).toContain('eta');
    expect(context.switchTargets).toHaveLength(config.dispatcherProfiles.profiles.length);
  });
});

/* -------------------------------------------------------------------------- *
 * The generator
 * -------------------------------------------------------------------------- */

describe('the generator', () => {
  it('is a pure function of its seed', () => {
    for (const seed of STANDARD_PLAY_CORPUS.slice(0, 8)) {
      const first = playCaseFromSeed(seed, context, STANDARD_PLAY_SPACE);
      const second = playCaseFromSeed(seed, context, STANDARD_PLAY_SPACE);
      expect(playLogJson(second.log)).toBe(playLogJson(first.log));
      expect(second.replication).toBe(first.replication);
      expect(second.budgetUnits).toBe(first.budgetUnits);
    }
    const a = playCaseFromSeed(STANDARD_PLAY_CORPUS[0] ?? 0, context, STANDARD_PLAY_SPACE);
    const b = playCaseFromSeed(STANDARD_PLAY_CORPUS[1] ?? 0, context, STANDARD_PLAY_SPACE);
    expect(playLogJson(a.log) + String(a.replication)).not.toBe(playLogJson(b.log) + String(b.replication));
  });

  it('presses all seven kinds and draws every shape across the pinned corpus, every log legal', () => {
    const kinds = new Set<string>();
    const shapes = new Set<string>();
    for (const seed of STANDARD_PLAY_CORPUS) {
      const playCase = playCaseFromSeed(seed, context, STANDARD_PLAY_SPACE);
      shapes.add(playCase.shape);
      for (const entry of playCase.log) kinds.add(entry.change.kind);
      expect(playLogRefusal(context, playCase.log, playCase.budgetUnits), playCase.caseId).toBeUndefined();
      expect(playLogSpend(context, playCase.log)).toBeLessThanOrEqual(playCase.budgetUnits);
      for (const entry of playCase.log) {
        if (!('serviceEvents' in entry.change)) continue;
        for (const effect of entry.change.serviceEvents) expect(effect.atS).toBeGreaterThanOrEqual(entry.atS);
      }
    }
    expect([...kinds].sort()).toEqual([...INTERVENTION_KINDS].sort());
    expect([...shapes].sort()).toEqual([...PLAY_SHAPES].sort());
  });

  it('refuses the logs the construction rules forbid, so a shrunk case can never be one', () => {
    const both = (atS: number) => ({
      atS,
      change: {
        kind: 'answer-incident' as const,
        option: 'x',
        serviceEvents: [
          { atS, bankId: 'main', carId: 'A', mode: 'out-of-service' as const },
          { atS, bankId: 'main', carId: 'B', mode: 'out-of-service' as const },
        ],
      },
    });
    expect(playLogRefusal(context, [both(10)], 4)).toMatch(/no car accepting hall calls/);
    const early = {
      atS: 100,
      change: { kind: 'answer-incident' as const, option: 'x', serviceEvents: [{ atS: 50, bankId: 'main', carId: 'A', mode: 'independent' as const }] },
    };
    expect(playLogRefusal(context, [early], 4)).toMatch(/outside \[100, 900\]/);
    const dear = {
      atS: 0,
      change: { kind: 'building-change' as const, changeId: 'fifth-car', name: 'A fifth car', serviceEvents: [] },
    };
    expect(playLogRefusal(context, [dear], 24)).toMatch(/spends 54 u on a 24 u rung/);
    expect(playLogRefusal(context, [dear], 54)).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- *
 * The gate
 * -------------------------------------------------------------------------- */

describe('the persona on stage 1', () => {
  it('holds all nine properties on the pinned corpus and on every pinned regression', () => {
    const sessions = new PlaySessions(context);
    const result = runPlayCampaign({
      sessions,
      seeds: STANDARD_PLAY_CORPUS,
      pinned: PLAY_REGRESSIONS.filter((pin) => pin.stageId === STAGE).map((pin) => playCaseFromPinned(pin, context)),
      space: STANDARD_PLAY_SPACE,
    });
    const report = result.failures
      .map((failure) => formatPlayCase(failure.minimal.case, context) + '\n' + failure.minimal.violations.map((v) => `[${v.property}] ${v.message}`).join('\n'))
      .join('\n\n');
    expect(result.failures, report).toEqual([]);
    expect(result.stats.cases).toBe(STANDARD_PLAY_CORPUS.length + PLAY_REGRESSIONS.length);
    /* Not vacuous: hundreds of presses, and some sessions refused their mean. */
    expect(result.stats.entries).toBeGreaterThan(200);
    expect(result.stats.refusals).toBeGreaterThan(0);
  }, 120_000);

  it('still exercises the mechanism each regression was pinned for', () => {
    const sessions = new PlaySessions(context);
    const run = (caseId: string): SimulationResult => {
      const playCase = pinned(caseId);
      return sessions.run(playCase.log, playCase.replication);
    };
    /* A rezone to one floor strands the whole crowd: the fifth terminus, counted by the audit. */
    const stranded = run('play-3000033-s7');
    expect(stranded.conservation.stranded).toBe(stranded.trace.passengerCount);
    /* A derate moves the load factor the cell reports off the plate. */
    const derated = run('play-3000007-s5');
    const plateKg = context.cars.find((car) => car.carId === 'A')?.ratedLoadKg ?? 0;
    expect(derated.record.loadSamples.some((sample) => sample.carId === 'main-A' && sample.massKg > 0 && Math.abs(sample.loadFactor - sample.massKg / plateKg) > 1e-6)).toBe(true);
    /* A switch to the other passenger model is applied and disclaimed, never refused. */
    const disclaimed = run('play-1000003-s8');
    expect(disclaimed.warnings.some((warning) => warning.includes('this run stays conventional'))).toBe(true);
    /* The three deadlock pins now drain. */
    for (const caseId of ['play-1000872-s12', 'play-1000256-s11', 'play-1001042-s16']) {
      expect(run(caseId).status, caseId).toBe('completed');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Each property can fail
 * -------------------------------------------------------------------------- */

describe('each P-PLAY property fails on a real session when its rule is broken', () => {
  const doNothing = (): PlayCase => ({
    caseId: 'fault',
    playSeed: '0',
    stageId: STAGE,
    replication: 0,
    budgetUnits: 4,
    shape: 'do-nothing',
    log: [],
  });

  it('no-softlock: a refusal with no reason is a verdict nobody can read', () => {
    const outcome = new PlaySessions(context).evaluate(pinned('play-3000033-s7'), {
      interpose: (result) => ({ ...result, summary: { ...result.summary, awtInvalidReason: '' } }),
    });
    expect(outcome.violations.map((violation) => violation.property)).toContain('no-softlock');
  });

  /*
   * The softlock check finds an engine refusal by its own words in `result.warnings`. These two
   * logs are ones the generator would never build (`playLogRefusal` refuses both), handed straight
   * to the session so that the warning is `Simulation`'s and not this file's: if the engine ever
   * rewords the refusal, this case goes red instead of the check going quiet.
   */
  it('no-softlock: a log the engine declines is a finding, in the engine’s own words, on both refusal paths', () => {
    const sessions = new PlaySessions(context);
    const logs = {
      'an effect before its own press': [
        {
          atS: 300,
          change: {
            kind: 'answer-incident' as const,
            option: 'x',
            serviceEvents: [{ atS: 100, bankId: 'main', carId: 'A', mode: 'independent' as const }],
          },
        },
      ],
      'a press past the drain deadline': [{ atS: 1_000_000, change: { kind: 'spread-cars' as const } }],
    };
    for (const [name, log] of Object.entries(logs)) {
      const playCase: PlayCase = { ...doNothing(), caseId: name, log };
      expect(playLogRefusal(context, log, 4), name).toBeDefined();
      const declined = sessions
        .run(log, 0)
        .warnings.filter((warning) => warning.startsWith('interventions[0]') && warning.includes('not scheduled'));
      expect(declined, `${name}: Simulation no longer words this refusal as the check reads it`).toHaveLength(1);
      const outcome = sessions.evaluate(playCase);
      const softlock = outcome.violations.filter((violation) => violation.property === 'no-softlock');
      expect(softlock.map((violation) => violation.message), name).toEqual([
        `the engine declined part of a log the generator built as legal: ${declined[0] ?? ''}`,
      ]);
    }
  });

  it('readable-verdict: a summary that calls a stranded day valid is caught on the record', () => {
    const playCase = pinned('play-3000033-s7');
    const sessions = new PlaySessions(context);
    expect(refusalGroundsOf(sessions.run(playCase.log, playCase.replication)).join(' ')).toMatch(/empty-window/);
    const outcome = sessions.evaluate(playCase, {
      interpose: (result) => ({ ...result, summary: { ...result.summary, awtIsValid: true } }),
    });
    expect(outcome.violations.some((violation) => violation.property === 'readable-verdict')).toBe(true);
  });

  it('reachable-goal: a session on a different crowd cannot be paired', () => {
    const sessions = new PlaySessions(context);
    const other = sessions.baseline(1);
    const outcome = sessions.evaluate(doNothing(), {
      interpose: (result) => ({ ...result, trace: other.trace }),
    });
    expect(outcome.violations.some((violation) => violation.property === 'reachable-goal' && /changed the crowd/.test(violation.message))).toBe(true);
  });

  it('reachable-goal: a valid verdict with no time to destination has nothing to pair', () => {
    const outcome = new PlaySessions(context).evaluate(doNothing(), {
      interpose: (result) => ({
        ...result,
        summary: { ...result.summary, timeToDestination: { ...result.summary.timeToDestination, meanS: Number.NaN } },
      }),
    });
    expect(outcome.violations.some((violation) => violation.property === 'reachable-goal' && /ttdMeanS/.test(violation.message))).toBe(true);
  });

  it('names every property it checks, the three of its own first', () => {
    expect(PLAY_PROPERTIES).toEqual(['no-softlock', 'readable-verdict', 'reachable-goal']);
  });
});

/* -------------------------------------------------------------------------- *
 * The shrinker and the ranking
 * -------------------------------------------------------------------------- */

describe('the shrinker', () => {
  it('reduces a faulted session to the smallest log that still breaks the same property, deterministically', () => {
    /* A real dense case, broken by a summarizer that never refuses: every session that strands or
       empties a day now fails P-PLAY-2, so the shrinker has a property to keep failing. */
    const faults = {
      interpose: (result: SimulationResult) => ({ ...result, summary: { ...result.summary, awtIsValid: true } }),
    };
    const sessions = new PlaySessions(context);
    const faulted = { evaluate: (playCase: PlayCase) => sessions.evaluate(playCase, faults), context } as unknown as PlaySessions;
    const original = sessions.evaluate(pinned('play-1001042-s16'), faults);
    expect(isPlayFailure(original)).toBe(true);
    const first = shrinkPlayCase(original, faulted, 200);
    const second = shrinkPlayCase(original, faulted, 200);
    expect(first.minimal.case.log.length).toBeLessThan(original.case.log.length);
    expect(first.minimal.violations.map((violation) => violation.property)).toContain('readable-verdict');
    expect(playLogJson(second.minimal.case.log)).toBe(playLogJson(first.minimal.case.log));
    expect(playLogRefusal(context, first.minimal.case.log, first.minimal.case.budgetUnits)).toBeUndefined();
  });
});

describe('P-DESIGN-1', () => {
  it('ranks every canonical verb against the empty log on the same crowds, and ties the stamp-only rows exactly', () => {
    const sessions = new PlaySessions(context);
    const rows = rankVerbs(sessions, 3);
    expect(rows.map((row) => `${row.kind} ${row.instance}`)).toEqual(
      canonicalVerbs(context).map((verb) => `${verb.kind} ${verb.instance}`),
    );
    for (const row of rows.filter((entry) => entry.instance.includes('the stamp alone'))) {
      expect(row.meanS).toBe(0);
      expect(row.verdict).toBe('INDISTINGUISHABLE');
    }
    /* The arm really is the session the verb makes: the canonical spread run differs from the
       empty log on the legs on at least one of the three crowds. */
    const spread = canonicalVerbs(context).find((verb) => verb.kind === 'spread-cars');
    const differs = [0, 1, 2].some(
      (replication) =>
        JSON.stringify(runSimulation(stageSessionConfigFor(context.stage, context.resources, replication, spread?.log ?? [])).record.passengers) !==
        JSON.stringify(sessions.baseline(replication).record.passengers),
    );
    expect(differs).toBe(true);
  });
});
