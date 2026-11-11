/**
 * The Everyday rules editing model — the round trip, the words, and the refusals.
 *
 * The words tests are §11.5's own rules held as assertions: every value-carrying template has a
 * `{v}` placeholder, substitution never concatenates (the *"park a spare car at floor the
 * lobby"* regression, pinned), every row's action names the lever it moves, and the vocabulary's
 * key sets are guarded both ways against `core`'s — the `PATTERN_LINES` pattern, applied to the
 * rules' tables.
 */

import {
  MAX_RULE_AND,
  RULE_ACTIONS,
  RULE_ACTION_WORDS,
  RULE_CONDITIONS,
  RULE_CONDITION_WORDS,
  type DispatcherProfile,
  type TrafficProfiles,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import {
  RULES_EXCLUSIVITY_NOTE,
  defaultRuleRow,
  fallbackLineOf,
  leverLineOf,
  profileWithRules,
  readbackOf,
  ruleIssues,
  ruleProvenanceName,
  rulesFromProfile,
  canAddCondition,
  rowWithAndAt,
  rowWithAnotherCondition,
  rowWithThen,
  rowWithWhen,
  rowWithoutAndAt,
  substituted,
  templateHasClock,
  type RuleRow,
} from './ruleSpec.js';

const PROFILE: DispatcherProfile = {
  id: 'steady',
  name: 'Steady hand',
  weights: { waitTime: 1 },
};

const ROWS: readonly RuleRow[] = [
  { when: 'lobby-queue-passes', whenValue: 12, then: 'hold-at-lobby' },
  { when: 'call-waited', whenValue: 60, then: 'jump-queue' },
  { when: 'shaft-out', then: 'park-at-floor', thenValue: 'top' },
];

describe('the round trip', () => {
  it('rows → profileWithRules → rulesFromProfile is exact', () => {
    const written = profileWithRules(PROFILE, ROWS);
    expect(rulesFromProfile(written)).toEqual(ROWS);
    // And both halves are written at once: rows plus the policy that reads them.
    expect(written.selection?.policy).toBe('rules');
    expect(written.rules?.rows).toHaveLength(3);
  });

  it('empty rows return the profile by object identity — the byte-identity half', () => {
    expect(profileWithRules(PROFILE, [])).toBe(PROFILE);
    expect(rulesFromProfile(PROFILE)).toEqual([]);
  });

  it('preserves the profile’s other selection fields when writing the policy', () => {
    const tuned: DispatcherProfile = {
      ...PROFILE,
      selection: { policy: 'off', hysteresisS: 45 },
    };
    const written = profileWithRules(tuned, ROWS);
    expect(written.selection).toEqual({ policy: 'rules', hysteresisS: 45 });
  });
});

describe('the words — §11.5 held as assertions', () => {
  it('guards both key sets against core, in both directions', () => {
    expect(Object.keys(RULE_CONDITION_WORDS).sort()).toEqual([...RULE_CONDITIONS].sort());
    expect(Object.keys(RULE_ACTION_WORDS).sort()).toEqual([...RULE_ACTIONS].sort());
  });

  it('every value-carrying template has a {v}, and every valueless one has none', () => {
    for (const words of [
      ...Object.values(RULE_CONDITION_WORDS),
      ...Object.values(RULE_ACTION_WORDS),
    ]) {
      expect(words.template.includes('{v}')).toBe(words.values !== undefined);
      expect(words.template.trim()).not.toBe('');
      expect(words.lever.trim()).not.toBe('');
    }
  });

  it('substitutes, never concatenates — the "floor the lobby" regression, pinned', () => {
    const park = RULE_ACTION_WORDS['park-at-floor'];
    expect(substituted(park, 'lobby')).toBe('park the idle cars at the lobby');
    expect(substituted(park, 'top')).toBe('park the idle cars at the top floor');
    expect(substituted(park, 7)).toBe('park the idle cars at floor 7');
    expect(substituted(park, 'lobby')).not.toContain('floor the lobby');
    // The unfilled form draws an ellipsis rather than the raw placeholder.
    expect(substituted(park, undefined)).toBe('park the idle cars at …');
  });

  it('composes the §11.5 readback, template halves substituted', () => {
    expect(readbackOf(ROWS[0]!)).toBe(
      'when the lobby queue passes 12 people, hold a car at the lobby.',
    );
    expect(readbackOf(ROWS[1]!)).toBe('when a call has waited 60 s, let it jump the queue.');
  });

  it('every row shows the lever it moves, from the model’s own moves claim', () => {
    for (const row of ROWS) {
      const line = leverLineOf(row);
      const action = RULE_ACTION_WORDS[row.then];
      expect(line).toContain(`moves ${action.lever}`);
      expect(line).toContain(action.moves);
    }
    // The caveat is the stated limitation, carried rather than dropped.
    expect(leverLineOf({ when: 'shaft-out', then: 'spread-out' })).toContain(
      'stays the run’s own setting',
    );
  });

  it('draws the fallback and exclusivity lines in the player’s register', () => {
    expect(fallbackLineOf('Steady hand')).toBe('If no rule fits, Steady hand decides.');
    expect(RULES_EXCLUSIVITY_NOTE).toContain('first match wins');
    expect(RULES_EXCLUSIVITY_NOTE).toContain('do not stack');
  });
});

describe('the provenance naming path — rule 11, extended the way PATTERN_NAMES was', () => {
  it('names a rule arm’s provenance id from the same core table the editor renders', () => {
    expect(ruleProvenanceName('rule-2:lobby-queue-passes:12')).toBe(
      'rule 2 — the lobby queue passes 12 people',
    );
    expect(ruleProvenanceName('rule-1:shaft-out')).toBe('rule 1 — a shaft is out of service');
    expect(ruleProvenanceName('rule-3:day-period:morning-rush')).toBe(
      'rule 3 — the day is in the morning rush',
    );
  });

  it('declines what it cannot name, so the honest fallback applies', () => {
    expect(ruleProvenanceName('up-peak')).toBeUndefined();
    expect(ruleProvenanceName('rule-2:not-a-condition:12')).toBeUndefined();
  });
});

describe('the refusals', () => {
  const CLOCKED = { hasClock: true };
  const CLOCKLESS = { hasClock: false };

  it('refuses a time rule on a clockless crowd, and withdraws the refusal with a clock', () => {
    const rows: readonly RuleRow[] = [
      { when: 'time-before', whenValue: 36000, then: 'hold-at-lobby' },
    ];
    const refused = ruleIssues(rows, CLOCKLESS);
    expect(refused.some((issue) => issue.message.includes('no clock'))).toBe(true);
    expect(ruleIssues(rows, CLOCKED)).toEqual([]);
  });

  it('mirrors the compiler’s pairing and duplicate refusals in advance', () => {
    const rows: readonly RuleRow[] = [
      { when: 'call-waited', whenValue: 60, then: 'no-new-pickups' },
      { when: 'car-fuller-than', whenValue: 0.7, then: 'no-new-pickups' },
      { when: 'car-fuller-than', whenValue: 0.8, then: 'no-new-pickups' },
    ];
    const issues = ruleIssues(rows, CLOCKED);
    expect(issues.some((issue) => issue.message.includes('only pairs with'))).toBe(true);
    expect(issues.some((issue) => issue.message.includes('second'))).toBe(true);
  });

  it('refuses an out-of-list value beside its own row half', () => {
    const issues = ruleIssues(
      [{ when: 'call-waited', whenValue: 61, then: 'jump-queue' }],
      CLOCKED,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe('rows.0.when');
  });

  it('reads the clock off the template, not off a guess', () => {
    const profiles = {
      demandTemplates: [
        { id: 'clocked', startOfDayMin: 510 },
        { id: 'clockless' },
      ],
    } as unknown as TrafficProfiles;
    expect(templateHasClock(profiles, 'clocked')).toBe(true);
    expect(templateHasClock(profiles, 'clockless')).toBe(false);
    expect(templateHasClock(profiles, 'absent')).toBe(false);
  });
});

describe('the row helpers', () => {
  it('snaps values when the id changes, keeping a value the new list still offers', () => {
    const row = defaultRuleRow();
    expect(row.when).toBe('call-waited');
    expect(row.whenValue).toBe(30);
    // 30 is in both lists (30 s → 30 people), so the value survives the switch…
    const queued = rowWithWhen(row, 'lobby-queue-passes');
    expect(queued.whenValue).toBe(30);
    // …and a value the new list does not offer snaps to the list's first.
    const from45 = rowWithWhen({ ...row, whenValue: 45 }, 'lobby-queue-passes');
    expect(from45.whenValue).toBe(6);
    const parked = rowWithThen(queued, 'park-at-floor');
    expect(parked.thenValue).toBe('lobby');
    // A valueless id drops the value rather than carrying a ghost.
    expect(rowWithWhen(queued, 'shaft-out').whenValue).toBeUndefined();
  });
});

describe('further conditions — a row that asks for more than one thing', () => {
  const both: RuleRow = {
    when: 'lobby-queue-passes',
    whenValue: 12,
    and: [{ when: 'call-waited', whenValue: 60 }],
    then: 'jump-queue',
  };

  it('round-trips through the profile with its further conditions, and reads as one sentence', () => {
    expect(rulesFromProfile(profileWithRules(PROFILE, [both]))).toEqual([both]);
    expect(readbackOf(both)).toBe(
      'when the lobby queue passes 12 people and a call has waited 60 s, treat that call as urgent.'.replace(
        'treat that call as urgent',
        substituted(RULE_ACTION_WORDS['jump-queue'], undefined),
      ),
    );
  });

  it('names every condition of a compiled arm from its provenance id', () => {
    expect(ruleProvenanceName('rule-2:lobby-queue-passes:12+call-waited:60+shaft-out')).toBe(
      'rule 2 — the lobby queue passes 12 people and a call has waited 60 s and a shaft is out of service',
    );
    expect(ruleProvenanceName('rule-2:lobby-queue-passes:12+moon-is-full')).toBeUndefined();
  });

  it('adds up to core’s bound, edits one in place with its value snapped, and drops one', () => {
    const one = rowWithAnotherCondition({ when: 'shaft-out', then: 'jump-queue' });
    expect(one.and).toHaveLength(1);
    // A new condition is never one the row already tests, so its first press changes the row.
    const first = RULE_CONDITIONS[0];
    const again = rowWithAnotherCondition(rowWithAnotherCondition({ when: first, then: 'jump-queue' }));
    expect(new Set([again.when, ...(again.and ?? []).map((extra) => extra.when)]).size).toBe(3);
    const two = rowWithAnotherCondition(one);
    expect(two.and).toHaveLength(MAX_RULE_AND);
    expect(canAddCondition(two)).toBe(false);
    expect(rowWithAnotherCondition(two)).toBe(two);

    const edited = rowWithAndAt(two, 1, 'day-period', 999);
    expect(edited.and?.[1]).toEqual({ when: 'day-period', whenValue: 'morning-rush' });
    expect(rowWithAndAt(two, 0, 'shaft-out', 12).and?.[0]).toEqual({ when: 'shaft-out' });
    expect(rowWithoutAndAt(edited, 0).and).toEqual([{ when: 'day-period', whenValue: 'morning-rush' }]);
    // Dropping the last leaves no key at all, so the row is the bytes it was before.
    expect(Object.hasOwn(rowWithoutAndAt(one, 0), 'and')).toBe(false);
  });

  it('the whole-run ceiling takes no further condition, and switching to it sheds them', () => {
    const ceiling: RuleRow = { when: 'car-fuller-than', whenValue: 0.8, then: 'no-new-pickups' };
    expect(canAddCondition(ceiling)).toBe(false);
    expect(rowWithThen({ ...both, when: 'car-fuller-than', whenValue: 0.8 }, 'no-new-pickups').and).toBeUndefined();
    const issues = ruleIssues([{ ...ceiling, and: [{ when: 'shaft-out' }] }], { hasClock: true });
    expect(issues.map((issue) => issue.message).join(' ')).toContain('cannot wait on a further condition');
  });

  it('says a clockless time test on a further condition silences the whole row', () => {
    const issues = ruleIssues(
      [{ when: 'shaft-out', and: [{ when: 'day-period', whenValue: 'lunch' }], then: 'jump-queue' }],
      { hasClock: false },
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('rows.0.and.0');
    expect(issues[0]?.message).toContain('the whole row does nothing');
  });
});
