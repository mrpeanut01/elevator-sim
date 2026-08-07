/**
 * One derivation of *"can this run be reproduced elsewhere?"*, and the hand-written copy it replaces
 * — S5.
 *
 * The load-bearing test is the last one: `runIdentityIssues(state, resources, 'ranked')` must refuse
 * **exactly** the states `dev/main.ts#provenanceLineOf` refuses. Not a superset and not a subset,
 * over a matrix of states rather than at one point.
 *
 * Both directions are failures with a victim:
 *
 * - **Stricter than provenance** and the submit path refuses a run a CLI line would have reproduced,
 *   so an honest player is told their run cannot be posted and never finds out why.
 * - **Looser than provenance** and the client posts a run the server cannot reproduce. The server
 *   rejects it as a forgery — which is the one place this product accuses somebody of cheating, and
 *   it would be accusing them of a client bug.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_LEVERS } from '../authoring/dispatcherSpec.js';
import { provenanceLineOf } from '../dev/main.js';
import type { ViewerState } from '../dev/state.js';
import { nextDay } from '../shift/week.js';

import { baseState, RESOURCES } from './probes.test-helper.js';
import { runIdentityIssues } from './runIdentity.js';

/**
 * The states the two implementations are compared over.
 *
 * One per refusal `provenanceLineOf` can produce, plus the clean case and two that must **not** be
 * refused — a moved seed and a different shipped dispatcher — because a predicate that refused
 * everything would agree with a predicate that refused everything.
 */
function matrix(): readonly { readonly name: string; readonly state: ViewerState }[] {
  const base = baseState();
  return [
    { name: 'clean, day 1, shipped everything', state: base },
    { name: 'a different shipped dispatcher', state: { ...base, dispatcherId: 'nearest-car' } },
    { name: 'a moved seed', state: { ...base, seed: 987654321n } },
    { name: 'a longer shift', state: { ...base, shiftLengthS: 1800 } },
    { name: 'a building only this browser has', state: { ...base, buildingId: 'my-tower' } },
    { name: 'a dispatcher only this browser has', state: { ...base, dispatcherId: 'my-profile' } },
    { name: 'a saved arrival pattern', state: { ...base, pattern: 'my-pattern' } },
    { name: 'day 2 — the building has grown', state: { ...base, week: nextDay(base.week) } },
    { name: 'a car held out of service', state: { ...base, outOfServiceCarIds: ['main-b'] } },
    {
      name: 'a group lever moved off its default',
      state: { ...base, levers: { ...DEFAULT_LEVERS, express: true } },
    },
  ];
}

describe('the predicate answers the question it claims to', () => {
  it('accepts a day-1 run on shipped data', () => {
    expect(runIdentityIssues(baseState(), RESOURCES)).toEqual([]);
    expect(runIdentityIssues(baseState(), RESOURCES).length === 0).toBe(true);
  });

  it('accepts the axes a selection actually carries', () => {
    // The negative control that makes every refusal below mean something. All four are
    // `between-games`, which `ranked` permits, and all four travel with a submission.
    const base = baseState();
    for (const state of [
      { ...base, dispatcherId: 'nearest-car' },
      { ...base, seed: 987654321n },
      { ...base, shiftLengthS: 1800 },
      { ...base, buildingId: 'midtown-office' },
    ]) {
      expect(runIdentityIssues(state, RESOURCES), JSON.stringify(state.buildingId)).toEqual([]);
    }
  });

  it('refuses a run that is one part of a longer day, because no board can record which part', () => {
    /*
     * § D288. Not a scope question and not a *this browser alone* question — the third kind: a run
     * a **submission** cannot carry. `RunSubmission` is six fields and the window is in none of
     * them, and the board re-simulates rather than trusting the client — so posting a lunch peak
     * would have the server replay the seed over the whole ten hours and answer a different
     * question, correctly.
     *
     * Asserted against the whole-period control in the same case, because the claim is that the
     * window is what refuses it and not the length: both arms are thirty minutes.
     */
    const base = { ...baseState(), shiftLengthS: 1800 };
    expect(runIdentityIssues({ ...base, windowStartS: null }, RESOURCES)).toEqual([]);

    const windowed = runIdentityIssues({ ...base, windowStartS: 30 * 60 }, RESOURCES);
    expect(windowed.map((issue) => issue.key)).toEqual(['viewer.windowStartS']);
    expect(windowed[0]?.message).toContain('part of a longer day');
    // The reason names the replay rather than only the row, because that is what actually happens.
    expect(windowed[0]?.message).toContain('replay');
    // ...and it survives `shift-week`, which permits every scope: this is not a scope refusal, so
    // permitting `between-days` must not clear it.
    expect(
      runIdentityIssues({ ...base, windowStartS: 30 * 60 }, RESOURCES, 'shift-week').length,
    ).toBe(1);
  });

  it('reports every reason rather than the first', () => {
    const base = baseState();
    const bad: ViewerState = {
      ...base,
      week: nextDay(base.week),
      outOfServiceCarIds: ['main-b'],
      levers: { ...DEFAULT_LEVERS, express: true },
    };
    // A reader who fixes one and is then told about the next has been made to guess how many there
    // are — `freePlayIssues`' rule, applied to the same kind of gate.
    expect(runIdentityIssues(bad, RESOURCES).length).toBe(3);
  });

  it('names the field each refusal is about', () => {
    for (const { name, state } of matrix()) {
      for (const issue of runIdentityIssues(state, RESOURCES)) {
        expect(issue.key, name).toMatch(/^viewer\./u);
        expect(issue.message.length, `${name} — ${issue.key}`).toBeGreaterThan(30);
      }
    }
  });

  it('refuses nothing in a mode that permits everything', () => {
    const base = baseState();
    const busy: ViewerState = { ...base, week: nextDay(base.week), outOfServiceCarIds: ['main-b'] };
    // `shift-week` permits every scope, so the only refusals left are the three value questions —
    // and this state raises none of them.
    expect(runIdentityIssues(busy, RESOURCES, 'shift-week')).toEqual([]);
  });
});

describe('one derivation, two consumers', () => {
  it('agrees with provenanceLineOf on every state in the matrix', () => {
    for (const { name, state } of matrix()) {
      const provenance = provenanceLineOf(state, RESOURCES);
      const issues = runIdentityIssues(state, RESOURCES, 'ranked');
      expect(
        issues.length === 0,
        `${name}: provenance ${provenance.ok ? 'accepts' : 'refuses'} and runIdentity ${
          issues.length === 0 ? 'accepts' : `refuses (${issues.map((issue) => issue.key).join(', ')})`
        }`,
      ).toBe(provenance.ok);
    }
  });

  it('gives the same number of reasons', () => {
    // Not just the same verdict. A predicate that collapsed three refusals into one would agree on
    // every boolean above and still tell a player less than the control beside it does.
    for (const { name, state } of matrix()) {
      const provenance = provenanceLineOf(state, RESOURCES);
      if (provenance.ok) continue;
      expect(runIdentityIssues(state, RESOURCES, 'ranked').length, name).toBe(provenance.reasons.length);
    }
  });

  it('is exercised by a matrix that reaches both verdicts', () => {
    // Without this the two assertions above would pass over ten states that all refuse.
    const verdicts = matrix().map(({ state }) => runIdentityIssues(state, RESOURCES).length === 0);
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });
});
