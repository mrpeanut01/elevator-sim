/**
 * A board row as a spectator's row — GitHub issue #337, driven through the shipped gate.
 *
 * The one claim worth a simulation here is the acceptance's second criterion: **the record replays
 * rather than re-running with the viewer's dispatcher, and gates on reproduction.** So a row is
 * built from a submission whose claim was measured by running the same configuration through the
 * same path the gate uses, and the gate is then asked twice — once with the honest claim, once with
 * the claim one figure off — so both branches are driven rather than the happy one alone.
 */

import { describe, expect, it } from 'vitest';

import type { BoardEntry } from '../menu/client.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { switchWireOf } from '../scope/switchWire.js';

import { watchGateBefore } from './library.js';
import { checkedRunForTest } from './gate.test-helper.js';
import { postedLogOf, postedRunOf, postedSubtitleOf } from './posted.js';
import { watchRunConfigOf } from './record.js';
import { CLAIM_EPSILON, claimDrift, claimOf, claimRefusalFor } from './reproduce.js';
import { watchingStrings, watchingViewOf } from './view.js';

const SHIPPED = RESOURCES.dispatcherProfiles.profiles;

function entryOf(overrides: Partial<BoardEntry> = {}, run: Partial<BoardEntry['run']> = {}): BoardEntry {
  return {
    id: 'row-1',
    displayName: 'Nadia R.',
    run: {
      buildingId: 'midtown-office',
      dispatcherProfileId: 'collective',
      demandTemplateId: 'rise-and-fall',
      arrivalRatePctPop5min: null,
      durationS: 600,
      windowStartS: null,
      seed: '20260906',
      ...run,
    },
    dataHash: 'sha256:test',
    measured: { awtS: 0, wt95S: 0, ttdMeanS: 0, pctOverLongWait: 0, awtIsValid: true },
    legs: 100,
    submittedAtMs: 0,
    ...overrides,
  };
}

/** The claim the server would have measured for this row, taken by the gate's own replay path. */
function measuredEntry(entry: BoardEntry): BoardEntry {
  const record = postedRunOf(entry, 1, RESOURCES).record;
  if (record === null) throw new Error('a posted row carries a record');
  const recording = recordRun(watchRunConfigOf(baseState(), RESOURCES, record)).recording;
  const claim = claimOf(recording);
  return {
    ...entry,
    measured: {
      awtS: claim.awtS,
      wt95S: claim.wt95S,
      ttdMeanS: claim.ttdMeanS,
      pctOverLongWait: claim.pctOverLongWait,
      awtIsValid: claim.awtIsValid,
    },
    legs: recording.summary.waitCount,
  };
}

describe('a board row as a watchable run — GitHub issue #337', () => {
  it('is the submission, field by field, on free play’s week', () => {
    const run = postedRunOf(entryOf(), 3, RESOURCES);
    expect(run.source).toBe('posted-run');
    expect(run.label).toBe('Nadia R.');
    expect(run.subtitle).toBe(postedSubtitleOf(3));
    expect(run.buildingName).toBe('Midtown Office');
    expect(run.posted).toBeUndefined();
    expect(run.claim?.legs).toBe(100);
    expect(run.blocked).toBeNull();
    expect(run.record).toMatchObject({
      seed: '20260906',
      buildingId: 'midtown-office',
      dispatcherId: 'collective',
      demandTemplateId: 'rise-and-fall',
      shiftLengthS: 600,
      windowStartS: null,
      day: 1,
      dayIdx: 0,
      outOfServiceCarIds: [],
      interventions: [],
      ruleRows: [],
    });
  });

  it('passes the gate on the claim the server measured, and enters with the replay', () => {
    const entry = measuredEntry(entryOf());
    const checked = checkedRunForTest(postedRunOf(entry, 1, RESOURCES), RESOURCES, baseState(), (config) => recordRun(config).recording);
    expect(checked.run.blocked).toBeNull();
    expect(checked.recording).toBeDefined();
  }, 120_000);

  it('refuses a claim one figure off, naming the figure, and never in the first person', () => {
    const entry = measuredEntry(entryOf());
    const off: BoardEntry = { ...entry, measured: { ...entry.measured, awtS: entry.measured.awtS + 0.5 } };
    const checked = checkedRunForTest(postedRunOf(off, 1, RESOURCES), RESOURCES, baseState(), (config) => recordRun(config).recording);
    expect(checked.run.blocked?.ground).toBe('does-not-reproduce');
    expect(checked.recording).toBeUndefined();
    expect(checked.run.blocked?.reason).toContain('the mean wait (s)');
    expect(checked.run.blocked?.reason).not.toMatch(/\b(you|your|yours)\b/iu);
  }, 120_000);

  it('drifts on the server’s own tolerance, not on equality', () => {
    const claim = { awtS: 10, wt95S: 20, ttdMeanS: 30, pctOverLongWait: 1.5, awtIsValid: true, legs: 10 };
    expect(claimDrift(claim, { ...claim, awtS: 10 + CLAIM_EPSILON / 2 })).toEqual([]);
    expect(claimDrift(claim, { ...claim, awtS: 10 + CLAIM_EPSILON * 10 }).map((row) => row.label)).toEqual([
      'the mean wait (s)',
    ]);
    expect(claimDrift(claim, { ...claim, awtIsValid: false }).map((row) => row.label)).toEqual([
      'whether the mean is quotable (1 yes, 0 no)',
    ]);
  });

  it('pins the tolerance to the server’s constant, which it transcribes', () => {
    expect(CLAIM_EPSILON).toBe(1e-9);
  });

  it('refuses a handover to a dispatcher this build does not ship, before any simulation', () => {
    const entry = entryOf({}, {
      interventions: [{ atS: 120, change: { kind: 'switch-dispatcher', toProfileId: 'no-such-dispatcher' } }],
    });
    const run = postedRunOf(entry, 1, RESOURCES);
    expect(run.blocked?.ground).toBe('unreadable-record');
    expect(run.blocked?.reason).toContain('no-such-dispatcher');
    expect(watchGateBefore(run, RESOURCES, baseState()).kind).toBe('settled');
  });

  it('refuses a handover carrying a rule this build does not ship, by name', () => {
    const entry = entryOf({}, {
      interventions: [
        {
          atS: 120,
          change: { kind: 'switch-dispatcher', toProfileId: 'eta', ruleRows: [{ when: 'moon-phase', then: 'jump-queue' }] },
        },
      ],
    });
    expect(postedLogOf(entry, SHIPPED)).toContain('moon-phase');
  });

  it('carries the wire’s log back as the profile core runs, the inverse of what the client sent', () => {
    const target = SHIPPED[2];
    if (target === undefined) throw new Error('the shipped profiles hold at least three');
    const rows = [{ when: 'call-waited', whenValue: 60, then: 'jump-queue' }] as const;
    const withRules = { ...target, rules: { rows: [...rows] }, selection: { ...(target.selection ?? {}), policy: 'rules' as const } };
    const wire = switchWireOf(withRules, SHIPPED);
    if (wire === undefined) throw new Error('a shipped profile with rows is expressible on the wire');
    const entry = entryOf({}, {
      interventions: [
        { atS: 120, change: { kind: 'park-cars-lobby' } },
        { atS: 240, change: { kind: 'switch-dispatcher', ...wire } },
      ],
    });
    const log = postedLogOf(entry, SHIPPED);
    if (typeof log === 'string') throw new Error(log);
    expect(log[0]).toEqual({ atS: 120, change: { kind: 'park-cars-lobby' } });
    const second = log[1]?.change;
    if (second?.kind !== 'switch-dispatcher') throw new Error('the second entry is the handover');
    expect(second.profile.id).toBe(target.id);
    expect(second.profile.rules?.rows).toEqual([...rows]);
    expect(second.profile.selection?.policy).toBe('rules');
  });

  it('draws the board’s figures, with the count, and withholds a mean the server did not vouch for', () => {
    const quotable = watchingViewOf(postedRunOf(entryOf({ measured: { awtS: 18.25, wt95S: 40.1, ttdMeanS: 60, pctOverLongWait: 2.5, awtIsValid: true }, legs: 412 }), 2, RESOURCES), 'Collective');
    expect(quotable.figures.map((figure) => figure.value)).toEqual(['18.3 s', '40.1 s', '2.5%']);
    expect(quotable.figures[0]?.label).toContain('over 412 rides');
    expect(quotable.sourceLine).toContain("today's board");
    expect(quotable.subtitle).toContain('#2 on today');
    const withheld = watchingViewOf(postedRunOf(entryOf({ legs: undefined }), 2, RESOURCES), 'Collective');
    expect(withheld.figures[0]?.value).toBe('withheld');
    for (const view of [quotable, withheld]) {
      for (const text of watchingStrings(view)) expect(text).not.toMatch(/\b(you|your|yours)\b/iu);
    }
  });

  it('leaves the reference fixture marker on reference rows alone: a posted row is not a fixture', () => {
    const run = postedRunOf(entryOf(), 1, RESOURCES);
    expect(run.source).not.toBe('reference');
    expect(watchingViewOf(run, 'x').sourceLine).not.toContain('not a player');
  });

  it('never quotes a first-person word in the claim refusal', () => {
    const refusal = claimRefusalFor(
      { awtS: 1, wt95S: 2, ttdMeanS: 3, pctOverLongWait: 4, awtIsValid: true, legs: 5 },
      recordRun(watchRunConfigOf(baseState(), RESOURCES, postedRunOf(entryOf(), 1, RESOURCES).record ?? (() => { throw new Error('record'); })())).recording,
    );
    expect(refusal).not.toBeNull();
    expect(refusal).not.toMatch(/\b(you|your|yours)\b/iu);
  }, 120_000);
});
