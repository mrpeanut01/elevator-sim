/**
 * **The gate and the ladder** — GAMEPLAY § 20.10's check (*a dirty dispatcher cannot be sent, and
 * the button says why*), § 14's row states, and § 20.11's reference-run label.
 */

import { describe, expect, it } from 'vitest';

import {
  caseNameOf,
  caseNamesOf,
  ladderEntryOf,
  ladderRowsOf,
  savedRatingIssue,
  savedRatingOf,
  sendGateOf,
  whatAreTheFortyOf,
  LADDER_CAVEAT,
  LADDER_WORLD_ABSENCE,
  REFERENCE_RUN_LABEL,
  type LadderEntry,
} from './ladder.js';
import { proofCasesOf, type ProofCaseSet } from './proofCases.js';
import { ratingOf, type RatedCase, type RatingSummary } from './rating.js';

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

/* -------------------------------------------------------------------------- *
 * A rating that survives the tab — issue #224, § D434
 * -------------------------------------------------------------------------- */

/** One rated case, with everything invariant 5 and R13 want on it. */
function rated(index: number, score: number | null): RatedCase {
  return {
    caseId: `tower-a/case-${String(index)}`,
    buildingId: 'tower-a',
    crowdId: 'one',
    seed: `seed-${String(index)}`,
    score,
    noScoreReason: score === null ? 'nobody was carried in this case' : null,
  };
}

/** A live entry over four cases, one of which measured nothing. */
function liveEntry(): LadderEntry {
  const cases = [rated(0, 91), rated(1, 74), rated(2, null), rated(3, 88)];
  return {
    dispatcherId: 'mine',
    dispatcherName: 'Mine',
    isReference: false,
    fingerprint: 'waitTime=1',
    summary: ratingOf(cases, 4),
  };
}

describe('a stored rating is its cases, and the mean is rebuilt from them', () => {
  it('keeps the cases and the denominator, and stores no folded figure', () => {
    const saved = savedRatingOf(liveEntry());
    expect(saved.cases).toHaveLength(4);
    expect(saved.casesTotal).toBe(4);
    /*
     * The claim § D434 rests on: nothing `ratingOf` computes is written down. A stored `rating`,
     * `casesRated`, `complete` or `weakest` would be a figure a store could hold in disagreement
     * with the cases beside it, and the ladder draws the stored aggregate rather than re-deriving
     * it — so nothing would notice.
     */
    for (const folded of ['rating', 'casesRated', 'casesRun', 'complete', 'weakest']) {
      expect(Object.keys(saved), folded).not.toContain(folded);
    }
  });

  it('restores to the identical entry — one arithmetic, two arrival routes', () => {
    const live = liveEntry();
    const restored = ladderEntryOf(savedRatingOf(live));
    expect(restored).toEqual(live);
    // And through the surface a player reads, which is the only thing that could differ silently.
    const context = { fingerprintOf: () => 'waitTime=1', caseNameOf: nameOf };
    expect(ladderRowsOf([restored], context)).toEqual(ladderRowsOf([live], context));
  });

  it('carries the fingerprint, so a restored rating can still go stale', () => {
    /*
     * § 11.7's *edited since* is the reason a kept rating is worth keeping rather than merely
     * present: without the digest the row would stand over a dispatcher the player has since
     * changed and say nothing about it.
     */
    const restored = ladderEntryOf(savedRatingOf(liveEntry()));
    const rows = ladderRowsOf([restored], {
      fingerprintOf: () => 'waitTime=9',
      caseNameOf: nameOf,
    });
    expect(rows[0]?.staleness).toBe('edited since');
  });

  it('holds an incomplete rating as incomplete rather than rounding it up', () => {
    // R13 through the round trip: the case that served nobody is not averaged as a zero, and the
    // rating says it is over three of four.
    const restored = ladderEntryOf(savedRatingOf(liveEntry()));
    expect(restored.summary.casesRated).toBe(3);
    expect(restored.summary.complete).toBe(false);
    expect(restored.summary.rating).toBeCloseTo((91 + 74 + 88) / 3, 10);
  });
});

describe('a saved rating is refused when this build cannot vouch for it', () => {
  const good = savedRatingOf(liveEntry());

  it('accepts what this module wrote', () => {
    expect(savedRatingIssue(good)).toBeUndefined();
  });

  it('refuses a case with no seed — invariant 5 at the storage boundary', () => {
    const issue = savedRatingIssue({ ...good, cases: [{ ...rated(0, 91), seed: '' }] });
    expect(issue).toBe('a rated case has no seed');
  });

  it('refuses a case that both has a score and says why it has none', () => {
    expect(
      savedRatingIssue({
        ...good,
        cases: [{ ...rated(0, 91), noScoreReason: 'nobody was carried' }],
      }),
    ).toContain('says why it has none');
    expect(
      savedRatingIssue({ ...good, cases: [{ ...rated(0, null), noScoreReason: null }] }),
    ).toContain('says why it has none');
  });

  it('refuses more cases than the set it claims to be over', () => {
    // `41 of 40` on a player's screen, otherwise: `ratingOf` folds every row it is handed.
    expect(savedRatingIssue({ ...good, casesTotal: 2 })).toContain('more cases than the set');
  });

  it('refuses a rating with no dispatcher, no digest, or no list at all', () => {
    expect(savedRatingIssue({ ...good, dispatcherId: '' })).toContain('dispatcherId');
    expect(savedRatingIssue({ ...good, fingerprint: '' })).toContain('fingerprint');
    expect(savedRatingIssue({ ...good, cases: 'forty' })).toContain('no list of cases');
    expect(savedRatingIssue({ ...good, isReference: 'yes' })).toContain('reference run');
    expect(savedRatingIssue('a rating')).toContain('not an object');
  });
});
