/**
 * **The gate and the ladder** — GAMEPLAY § 20.10's check (*a dirty dispatcher cannot be sent, and
 * the button says why*), § 14's row states, and § 20.11's reference-run label.
 */

import { describe, expect, it } from 'vitest';

import {
  caseNameOf,
  caseNamesOf,
  ladderRowsOf,
  sendGateOf,
  whatAreTheFortyOf,
  LADDER_CAVEAT,
  LADDER_WORLD_ABSENCE,
  REFERENCE_RUN_LABEL,
  type LadderEntry,
} from './ladder.js';
import { proofCasesOf, type ProofCaseSet } from './proofCases.js';
import type { RatingSummary } from './rating.js';

const SET: ProofCaseSet = {
  version: 1,
  towers: [
    { id: 'tower-a', arrivalRatePctPop5min: 1, why: 'the short one' },
    { id: 'tower-b', arrivalRatePctPop5min: 2, why: 'the tall one' },
  ],
  crowds: [
    { id: 'one', label: 'The morning', tests: 'filling cars', durationS: 900, demand: {} },
    { id: 'two', label: 'The evening', tests: 'emptying them', durationS: 900, demand: {} },
  ],
};

const NAMES = { 'tower-a': 'Tower A', 'tower-b': 'Tower B' } as const;
const nameOf = (id: string): string => NAMES[id as keyof typeof NAMES] ?? id;

function summary(rating: number | null, casesRated: number, weakestCaseId?: string): RatingSummary {
  return {
    rating,
    casesRated,
    casesRun: casesRated,
    casesTotal: 4,
    complete: casesRated === 4,
    weakest:
      weakestCaseId === undefined
        ? null
        : {
            caseId: weakestCaseId,
            buildingId: 'tower-a',
            crowdId: 'one',
            seed: '1',
            score: 10,
            noScoreReason: null,
          },
    cases: [],
  };
}

describe('the send gate — § 20.10', () => {
  it('refuses an unsaved dispatcher and says why in the button’s own words', () => {
    const gate = sendGateOf({ dispatcherId: 'mine', dispatcherName: 'Mine', dirty: true });
    expect(gate.sendable).toBe(false);
    expect(gate.refusal).toContain('Mine');
    expect(gate.refusal).toContain('not saved');
    expect(gate.refusal).toContain('Save it, then send it.');
    /* Never a disabled control with no explanation, and never a control with no label. */
    expect(gate.label).not.toBe('');
  });

  it('lets a saved dispatcher through, with nothing to say about it', () => {
    const gate = sendGateOf({ dispatcherId: 'mine', dispatcherName: 'Mine', dirty: false });
    expect(gate.sendable).toBe(true);
    expect(gate.refusal).toBeNull();
  });

  it('refuses when nothing is open, and points at where a dispatcher is chosen', () => {
    const gate = sendGateOf(undefined);
    expect(gate.sendable).toBe(false);
    expect(gate.refusal).toContain('nothing to send');
  });
});

describe('the ladder’s rows — § 14', () => {
  const context = {
    fingerprintOf: (id: string) => (id === 'edited' ? 'moved' : 'as-rated'),
    caseNameOf: (caseId: string) => caseNamesOf(SET, nameOf).get(caseId) ?? caseId,
  };

  const entries: readonly LadderEntry[] = [
    {
      dispatcherId: 'steady',
      dispatcherName: 'Steady hand',
      isReference: true,
      fingerprint: 'as-rated',
      summary: summary(81.4, 4, 'tower-b/two'),
    },
    {
      dispatcherId: 'edited',
      dispatcherName: 'Mine',
      isReference: false,
      fingerprint: 'as-rated',
      summary: summary(90, 4, 'tower-a/one'),
    },
    {
      dispatcherId: 'never',
      dispatcherName: 'Untried',
      isReference: false,
      fingerprint: 'as-rated',
      summary: summary(null, 0),
    },
  ];

  const rows = ladderRowsOf(entries, context);

  it('labels a reference run and never presents it as a player — § 20.11', () => {
    const reference = rows.find((row) => row.dispatcherId === 'steady');
    expect(reference?.referenceLabel).toBe(REFERENCE_RUN_LABEL);
    expect(rows.find((row) => row.dispatcherId === 'edited')?.referenceLabel).toBeNull();
  });

  it('reads *edited since* where the library has moved past what was rated — § 11.7', () => {
    expect(rows.find((row) => row.dispatcherId === 'edited')?.staleness).toBe('edited since');
    expect(rows.find((row) => row.dispatcherId === 'steady')?.staleness).toBeNull();
  });

  it('reads *unrated* where there is no rating, and draws an em dash rather than a zero', () => {
    const untried = rows.find((row) => row.dispatcherId === 'never');
    expect(untried?.staleness).toBe('unrated');
    expect(untried?.rating).toBe('—');
    expect(untried?.weakestAt).toBe('—');
  });

  it('names the weakest case for a reader, with no engine identifier in it', () => {
    expect(rows.find((row) => row.dispatcherId === 'steady')?.weakestAt).toBe(
      'Tower B · The evening',
    );
  });

  it('sorts by rating, with the unrated after every standing row', () => {
    expect(rows.map((row) => row.dispatcherId)).toEqual(['edited', 'steady', 'never']);
  });

  it('says a rating over fewer than every case is not comparable with one over all of them', () => {
    const partial = ladderRowsOf(
      [
        {
          dispatcherId: 'partial',
          dispatcherName: 'Partial',
          isReference: false,
          fingerprint: 'as-rated',
          summary: summary(70, 3, 'tower-a/one'),
        },
      ],
      context,
    );
    expect(partial[0]?.incompleteNote).toContain('3 of 4');
    expect(partial[0]?.incompleteNote).toContain('not comparable');
  });

  it('draws the caveat and the world absence, so neither is optional', () => {
    expect(LADDER_CAVEAT).toContain('not a measured difference');
    expect(LADDER_WORLD_ABSENCE).toContain('needs a server');
    expect(LADDER_WORLD_ABSENCE).toContain('measured on this device');
  });
});

describe('the disclosure — § 14.2', () => {
  const view = whatAreTheFortyOf(SET, (id) => ({ name: nameOf(id), spec: '9 floors · 3 lifts' }));

  it('names every building with its spec and why it is in the set', () => {
    expect(view.towers).toEqual([
      { name: 'Tower A', spec: '9 floors · 3 lifts', why: 'the short one' },
      { name: 'Tower B', spec: '9 floors · 3 lifts', why: 'the tall one' },
    ]);
  });

  it('names every crowd shape with what it tests', () => {
    expect(view.crowds.map((crowd) => crowd.label)).toEqual(['The morning', 'The evening']);
  });

  it('closes with the arithmetic, the basis and the caveat', () => {
    expect(view.arithmetic).toContain('2 buildings × 2 crowd shapes = 4 runs');
    expect(view.arithmetic).toContain('The cases never move');
    expect(view.arithmetic).toContain('wins one shape and loses four sits mid-table');
    expect(view.basis).toContain('averaged over the forty proof cases');
    expect(view.caveat).toBe(LADDER_CAVEAT);
  });
});

describe('a case’s name', () => {
  it('is the tower’s name and the crowd’s label, never an id', () => {
    const first = proofCasesOf(SET)[0];
    if (first === undefined) throw new Error('no cases');
    expect(caseNameOf(first, nameOf(first.tower.id))).toBe('Tower A · The morning');
  });

  it('is keyed by case id for every case, so two readers cannot word it differently', () => {
    const names = caseNamesOf(SET, nameOf);
    expect(names.size).toBe(4);
    expect(names.get('tower-b/two')).toBe('Tower B · The evening');
  });
});
