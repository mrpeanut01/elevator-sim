/**
 * The case file's door — every refusal `parse.ts` promises, driven.
 *
 * The fixture is a minimal valid file mutated one way per test, `campaign/parse.ts`'s own test
 * pattern: a suite that only parsed the shipped file would prove the shipped file is valid and
 * nothing about the rules.
 */

import { describe, expect, it } from 'vitest';

import { parseFixitCases, playerFacingStringsOf, FixitCasesError, type FixitContext } from './parse.js';
import type { FixitCase } from './types.js';

const CONTEXT: FixitContext = {
  floorIdsByBuilding: new Map([['tower', ['G', '2', '3', '4']]]),
  profileIds: new Set(['standing-order']),
  engineIds: ['tower', 'standing-order'],
};

/** A minimal valid case, cloned per test. */
function validCase(): Record<string, unknown> {
  return {
    id: 'a-case',
    name: 'The case',
    buildingId: 'tower',
    dispatcherProfileId: 'standing-order',
    run: { seed: '123', durationS: 900, arrivalRatePctPop5min: null },
    asBuilt: { note: 'As it stands.', patch: { dispatcher: { idle: { parkingStrategy: 'lobby' } } } },
    complaint: {
      text: 'The wait upstairs is long.',
      complainer: 'tenant, floor 3',
      measure: {
        kind: 'long-waits',
        label: 'waits over a minute upstairs',
        thresholdS: 60,
        scope: { mode: 'origin', floorIds: ['3', '4'] },
      },
    },
    symptom: 'waits over a minute',
    figures: [
      { kind: 'complaint', label: 'Waits over a minute upstairs', reading: 'bad' },
      { kind: 'scope-mean-wait', label: 'Mean wait upstairs', reading: 'mid' },
      { kind: 'scope-worst-wait', label: 'Worst wait upstairs', reading: 'mid' },
      { kind: 'rest-away-pct', label: 'The rest away inside a minute', reading: 'healthy' },
    ],
    diagnosis: { text: 'The cars park at the wrong end.', reasoning: 'Every long wait began that way.' },
    budgetUnits: 12,
    repairs: [
      { id: 'r-diagnosed', role: 'diagnosed', name: 'Spread the fleet', costUnits: 0, effect: 'A setting; the waits above are the target.', patch: { dispatcher: { idle: { parkingStrategy: 'stay' } } } },
      { id: 'r-costly', role: 'costly-fix', name: 'Re-gear the machines', costUnits: 10, effect: 'Shortens the worst wait; the parking stays.', patch: { building: { cars: [{ carIds: ['*'], set: { ratedSpeedDeltaMps: 0.5 } }] } } },
      { id: 'r-cheap', role: 'cheap-fix', name: 'Trim the dwell', costUnits: 2, effect: 'Moves the mean a little.', patch: { building: { cars: [{ carIds: ['*'], set: { dwellHallCallS: 2.5 } }] } } },
      { id: 'r-shaft', role: 'new-shaft', name: 'A new shaft · beyond a repair budget', costUnits: 34, effect: 'A capital conversation with the owner.', patch: { building: { addCars: [{ bankId: 'main', copyCarId: 'A', id: 'B' }] } } },
    ],
    result: { head: 'Fixed.', body: 'Nothing was bought.' },
  };
}

function fileWith(mutate: (entry: Record<string, unknown>) => void): unknown {
  const entry = validCase();
  mutate(entry);
  return { version: 1, cases: [entry] };
}

function violationsOf(raw: unknown): readonly string[] {
  try {
    parseFixitCases(raw, CONTEXT);
    return [];
  } catch (error) {
    if (error instanceof FixitCasesError) return error.violations;
    throw error;
  }
}

describe('parseFixitCases', () => {
  it('accepts the minimal valid case', () => {
    const parsed = parseFixitCases(fileWith(() => {}), CONTEXT);
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0]?.repairs).toHaveLength(4);
  });

  it('refuses a building this build does not ship', () => {
    const violations = violationsOf(fileWith((entry) => { entry['buildingId'] = 'atlantis'; }));
    expect(violations.join('\n')).toContain('"atlantis" is not in this build\'s data/');
  });

  it('refuses a measure naming a floor the building does not have', () => {
    const violations = violationsOf(
      fileWith((entry) => {
        (entry['complaint'] as { measure: { scope: { floorIds: string[] } } }).measure.scope.floorIds = ['99'];
      }),
    );
    expect(violations.join('\n')).toContain('floor "99"');
  });

  it('holds § 10.2\'s budget band', () => {
    expect(violationsOf(fileWith((entry) => { entry['budgetUnits'] = 9; })).join('\n')).toContain('10–16');
    expect(violationsOf(fileWith((entry) => { entry['budgetUnits'] = 17; })).join('\n')).toContain('10–16');
  });

  it('requires exactly one repair per role', () => {
    const violations = violationsOf(
      fileWith((entry) => {
        const repairs = entry['repairs'] as { role: string }[];
        (repairs[1] as { role: string }).role = 'diagnosed';
      }),
    );
    expect(violations.join('\n')).toContain('"diagnosed" repairs');
    expect(violations.join('\n')).toContain('"costly-fix" repairs');
  });

  it('prices the diagnosed fix 0–9 and the shaft at an unaffordable 34', () => {
    const costly = violationsOf(
      fileWith((entry) => {
        ((entry['repairs'] as { costUnits: number }[])[0] as { costUnits: number }).costUnits = 10;
      }),
    );
    expect(costly.join('\n')).toContain('0–9');
    const cheapShaft = violationsOf(
      fileWith((entry) => {
        ((entry['repairs'] as { costUnits: number }[])[3] as { costUnits: number }).costUnits = 12;
      }),
    );
    expect(cheapShaft.join('\n')).toContain('it is 34 in every case');
    expect(cheapShaft.join('\n')).toContain('visible and unaffordable');
  });

  it('refuses a repair with no patch — a purchase that fixes nothing is an extra', () => {
    const violations = violationsOf(
      fileWith((entry) => {
        ((entry['repairs'] as { patch: unknown }[])[2] as { patch: unknown }).patch = {};
      }),
    );
    expect(violations.join('\n')).toContain('changes nothing');
  });

  it('refuses a probability word in player-facing copy — R10', () => {
    const violations = violationsOf(
      fileWith((entry) => {
        (entry['diagnosis'] as { text: string }).text = 'The fix will probably help.';
      }),
    );
    expect(violations.join('\n')).toContain('R10');
  });

  it('refuses an engine identifier in player-facing copy — § 16 rule 11', () => {
    const violations = violationsOf(
      fileWith((entry) => {
        (entry['complaint'] as { text: string }).text = 'The tower runs standing-order and it is slow.';
      }),
    );
    expect(violations.join('\n')).toContain('§ 16 rule 11');
  });

  it('requires four figures with exactly one read as bad and one healthy', () => {
    const violations = violationsOf(
      fileWith((entry) => {
        (entry['figures'] as { reading: string }[]).forEach((figure) => {
          figure.reading = 'bad';
        });
      }),
    );
    expect(violations.join('\n')).toContain('exactly one thing is wrong');
    expect(violations.join('\n')).toContain('no healthy figure');
  });

  it('lists every player-facing string, so the copy sweep cannot silently narrow', () => {
    const parsed = parseFixitCases(fileWith(() => {}), CONTEXT);
    const labels = playerFacingStringsOf(parsed.cases[0] as FixitCase).map(([label]) => label);
    // One entry per authored surface string: name, note, complaint pair, measure label, symptom,
    // diagnosis pair, result pair, four figures, and a name + effect per repair.
    expect(labels).toHaveLength(10 + 4 + 8);
  });
});
