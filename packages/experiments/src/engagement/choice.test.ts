/**
 * The meaningful-choice proxy on stage 1: held to P-DESIGN-1 where the two ask one question, its
 * counterfactual shown to hold every other entry, and its buckets shown to count what they say.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { interventionKindRefusal, loadConfig, type RunInterventionConfig, type SimulationResult } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { PlaySessions } from '../fuzz/play.js';
import { rankVerbs, type VerbRankingRow } from '../fuzz/playCampaign.js';
import { describePlayEntry } from '../fuzz/playShrink.js';
import { playContextFor } from '../fuzz/verbs.js';
import { DATA_DIR } from '../validation/harness.js';
import { parseEngagementBands, tensionBandFor, type MeaningfulChoiceBands } from './bands.js';
import {
  beliefDisagreements,
  engineBaselineChoices,
  judgeChoice,
  meaningfulChoiceRate,
  measureChoices,
  type ChoiceVerdict,
} from './choice.js';

const STAGE = 'stage-1-first-call';
const read = (file: string): unknown => JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as unknown;
const BANDS = parseEngagementBands(read('engagement-bands.json'));
const CHOICE: MeaningfulChoiceBands = BANDS.meaningfulChoice;

let sessions: PlaySessions;
let baseline: readonly ChoiceVerdict[];
let ranking: readonly VerbRankingRow[];

beforeAll(async () => {
  const config = await loadConfig(DATA_DIR);
  const context = playContextFor({ config, campaign: read('campaign.json'), priceSchedule: read('price-schedule.json'), stageId: STAGE });
  sessions = new PlaySessions(context);
  baseline = engineBaselineChoices(sessions, CHOICE, tensionBandFor(BANDS, STAGE));
  ranking = rankVerbs(sessions, CHOICE.replications);
});

describe('the engine baseline asks P-DESIGN-1’s question and gets P-DESIGN-1’s answer', () => {
  it('has one verdict per canonical press, in rankVerbs’s order', () => {
    expect(baseline.map((verdict) => `${verdict.kind} ${verdict.instance}`)).toEqual(
      ranking.map((row) => `${row.kind} ${row.instance}`),
    );
  });

  it('carries rankVerbs’s ΔTTD interval exactly on every replayable press', () => {
    for (const [index, verdict] of baseline.entries()) {
      const row = ranking[index] as VerbRankingRow;
      if (verdict.status === 'not-yet-replayable') continue;
      expect(verdict.ttd?.estimate?.mean, `${row.kind} ${row.instance}`).toBe(row.meanS);
      expect(verdict.ttd?.estimate?.lower).toBe(row.lowerS);
      expect(verdict.ttd?.estimate?.upper).toBe(row.upperS);
      expect(verdict.status === 'meaningful', `${row.kind} ${row.instance}`).toBe(row.verdict === 'BETTER' || row.verdict === 'WORSE');
      expect(verdict.replications - verdict.emptyCrowds).toBe(row.pairs);
    }
  });

  it('stubs exactly the kinds core will not replay, with core’s own reason, and keeps them out of the rate', () => {
    const stubbed = baseline.filter((verdict) => verdict.status === 'not-yet-replayable');
    expect(stubbed.map((verdict) => verdict.kind)).toEqual(['answer-incident', 'equipment-change', 'building-change']);
    for (const verdict of stubbed) {
      expect(verdict.notReplayableBecause).toBe(interventionKindRefusal(verdict.kind));
      expect(verdict.ttd).toBeUndefined();
    }
    for (const verdict of baseline.filter((candidate) => candidate.status !== 'not-yet-replayable')) {
      expect(interventionKindRefusal(verdict.kind)).toBeUndefined();
    }
  });

  it('is 10 of 22 meaningful on stage 1’s tuning seeds, pinned to the run that produced it', () => {
    const rate = meaningfulChoiceRate(baseline);
    expect(rate).toMatchObject({ entries: 25, meaningful: { k: 10, n: 22 }, null: 12, suppressed: 0, notYetReplayable: 3 });
    expect(rate.stubbedKinds.map((row) => [row.kind, row.entries])).toEqual([
      ['answer-incident', 1],
      ['equipment-change', 1],
      ['building-change', 1],
    ]);
  });

  it('puts the press’s tension arm beside the choice, paired on every replication', () => {
    for (const verdict of baseline.filter((candidate) => candidate.status !== 'not-yet-replayable')) {
      expect(verdict.tension?.pairs).toBe(CHOICE.replications);
    }
    const spread = baseline.find((verdict) => verdict.kind === 'spread-cars');
    expect(spread?.tension?.verdict).toBe('INDISTINGUISHABLE');
  });
});

describe('a player log: every other entry is held', () => {
  it('judges an entry against the log without it, not against the empty log, and stubs a kind core will not replay', () => {
    const log: RunInterventionConfig[] = [
      { atS: 0, change: { kind: 'spread-cars' } },
      { atS: 100, change: { kind: 'answer-incident', option: 'held', serviceEvents: [] } },
    ];
    const verdicts = measureChoices(sessions, log, CHOICE, (entry) => describePlayEntry(entry, sessions.context));
    expect(verdicts.map((verdict) => verdict.status)).toEqual([expect.stringMatching(/^(meaningful|null)$/u), 'not-yet-replayable']);
    const replications = Array.from({ length: CHOICE.replications }, (_, index) => index);
    const held = judgeChoice({
      entryIndex: 0,
      kind: 'spread-cars',
      instance: 'spread-cars',
      withEntry: replications.map((replication) => sessions.run(log, replication)),
      withoutEntry: replications.map((replication) => sessions.run([log[1] as RunInterventionConfig], replication)),
    });
    expect(verdicts[0]?.ttd?.estimate).toEqual(held.ttd?.estimate);
    expect(meaningfulChoiceRate(verdicts)).toMatchObject({ entries: 2, notYetReplayable: 1, meaningful: { n: 1 } });
  });

  it('has nothing to judge in an empty log, which is a stage-1 player session', () => {
    const verdicts = measureChoices(sessions, [], CHOICE, () => '');
    expect(verdicts).toEqual([]);
    expect(meaningfulChoiceRate(verdicts).meaningful).toEqual({ k: 0, n: 0 });
  });
});

describe('the pairing rules', () => {
  const runs = (count: number, log: RunInterventionConfig[] = []): SimulationResult[] =>
    Array.from({ length: count }, (_, replication) => (log.length === 0 ? sessions.baseline(replication) : sessions.run(log, replication)));
  const press: RunInterventionConfig[] = [{ atS: 0, change: { kind: 'park-cars-lobby' } }];
  const arms = (withEntry: readonly SimulationResult[], withoutEntry: readonly SimulationResult[]) =>
    ({ entryIndex: 0, kind: 'park-cars-lobby', instance: 'at 0 s', withEntry, withoutEntry }) as const;

  it('suppresses a choice when either arm refuses its mean on any pair, and keeps it in the denominator', () => {
    const withEntry = runs(50, press);
    const refusing = withEntry.map((run, index) =>
      index === 3 ? { ...run, summary: { ...run.summary, awtIsValid: false, awtInvalidGround: 'saturated' as const } } : run,
    );
    const verdict = judgeChoice(arms(refusing, runs(50)));
    expect(verdict).toMatchObject({ status: 'suppressed', suppressedBecause: 'saturated' });
    expect(meaningfulChoiceRate([verdict]).meaningful).toEqual({ k: 0, n: 1 });
  });

  it('leaves an empty crowd out of the pairing and counts it', () => {
    const empty = (run: SimulationResult): SimulationResult => ({ ...run, trace: { ...run.trace, passengerCount: 0 } });
    const withEntry = runs(50, press).map((run, index) => (index === 5 ? empty(run) : run));
    const withoutEntry = runs(50).map((run, index) => (index === 5 ? empty(run) : run));
    expect(judgeChoice(arms(withEntry, withoutEntry)).emptyCrowds).toBe(1);
  });

  it('throws on a pair that did not see one crowd', () => {
    const shifted = runs(51).slice(1);
    expect(() => judgeChoice(arms(runs(50, press), shifted))).toThrow(/same crowd/u);
  });
});

describe('the persona’s beliefs', () => {
  const verdict = (entryIndex: number, status: ChoiceVerdict['status']): ChoiceVerdict => ({
    entryIndex,
    kind: 'spread-cars',
    instance: `entry ${String(entryIndex)}`,
    status,
    replications: 50,
    emptyCrowds: 0,
  });
  const verdicts = [verdict(0, 'meaningful'), verdict(1, 'null'), verdict(2, 'suppressed'), verdict(3, 'meaningful')];

  it('lists a felt-but-null choice, an unperceived one, and the beliefs it cannot judge', () => {
    const found = beliefDisagreements(verdicts, [
      { entryIndex: 0, believedMattered: false },
      { entryIndex: 1, believedMattered: true },
      { entryIndex: 2, believedMattered: true },
      { entryIndex: 3, believedMattered: true },
      { entryIndex: 9, believedMattered: false },
    ]);
    expect(found.unperceived.map((row) => row.entryIndex)).toEqual([0]);
    expect(found.feltButNull.map((row) => row.entryIndex)).toEqual([1]);
    expect(found.unjudged.map((row) => row.entryIndex)).toEqual([2, 9]);
  });

  it('is three empty lists with no beliefs, and refuses two beliefs about one entry', () => {
    expect(beliefDisagreements(verdicts, [])).toEqual({ feltButNull: [], unperceived: [], unjudged: [] });
    expect(() =>
      beliefDisagreements(verdicts, [
        { entryIndex: 0, believedMattered: true },
        { entryIndex: 0, believedMattered: false },
      ]),
    ).toThrow(/two beliefs/u);
  });
});
