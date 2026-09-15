/**
 * What a rush sitting may put on the wire — GitHub issue **#372**'s fourth criterion, and the
 * client half of [§ D542](../../../../DECISIONS.md).
 *
 * `rushRoundRecordOf` is driven where it is called, in `host.test.ts`, against the real shipped
 * `data/` and a real rush recording — a round's record needs a `ViewerState`, a recording and an
 * end, and building the three by hand here would be testing a fixture. What this file drives is the
 * part that is pure over records: **whether a sitting may travel, and exactly what goes on the
 * wire when it does**.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { RushOutcome } from './rush.js';
import {
  MAX_SITTING_ROUNDS,
  RUSH_SITTING_COPY,
  rushSittingOf,
  type RushRoundRecord,
} from './rushSitting.js';

const outcome = (kind: RushOutcome['kind'], heldS: number): RushOutcome => ({
  kind,
  atS: heldS,
  wave: Math.floor(heldS / 180) + 1,
  heldS,
  arrived: 200,
  carried: 150,
  longestWaitS: 130,
  overLine: 40,
  saturation: undefined,
});

function round(over: Partial<RushRoundRecord> = {}): RushRoundRecord {
  return {
    dispatcherProfileId: 'collective',
    dispatcherName: 'Collective',
    ruleRows: [],
    wireInterventions: [],
    interventionCount: 0,
    holdS: 1640,
    outcome: outcome('broke', 1640),
    unpostable: [],
    ...over,
  };
}

describe('a sitting is every round since the as-shipped start — GitHub issue #372', () => {
  it('puts the rounds in order on the wire, and the seed, the stream and the purse nowhere on it', () => {
    const check = rushSittingOf({
      buildingId: 'midtown-office',
      rounds: [round({ dispatcherProfileId: 'eta', holdS: 900, outcome: outcome('broke', 900) }), round()],
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.body.buildingId).toBe('midtown-office');
    expect(check.body.rounds.map((entry) => entry.dispatcherProfileId)).toEqual(['eta', 'collective']);
    expect(check.body.rounds.map((entry) => entry.claimedHeldS)).toEqual([900, 1640]);
    /*
     * **The absences are the protocol.** `packages/server`'s `rushSitting.ts#NEVER_ON_THE_WIRE`
     * refuses a purse, a paid figure, a wave count, a budget, a seed, a template, a rate, a length
     * and a window **by name**, so a body carrying one is refused before a simulation starts. This
     * asserts over the serialised body rather than over the keys of one round, because a key added
     * to a nested object is exactly the way one would arrive unnoticed.
     */
    const wire = JSON.stringify(check.body);
    for (const refused of [
      'purse',
      'paidUnits',
      'wavesOutlasted',
      'budgetUnits',
      'seed',
      'demandTemplateId',
      'arrivalRatePctPop5min',
      'durationS',
      'windowStartS',
    ]) {
      expect(wire, `a sitting carried "${refused}", which the server refuses by name`).not.toContain(refused);
    }
  });

  it('carries no key at all for an empty log or an empty rule list — core’s byte-identical promise', () => {
    const check = rushSittingOf({ buildingId: 'midtown-office', rounds: [round()] });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(Object.keys(check.body.rounds[0] ?? {})).toEqual(['dispatcherProfileId', 'claimedHeldS']);
    expect(Object.keys(check.body)).toEqual(['buildingId', 'rounds']);
  });

  it('carries the log and the rows when there are any', () => {
    const check = rushSittingOf({
      buildingId: 'midtown-office',
      rounds: [
        round({
          ruleRows: [{ when: 'lobby-queue-passes', whenValue: 12, then: 'hold-at-lobby' }],
          wireInterventions: [{ atS: 300, change: { kind: 'switch-dispatcher', toProfileId: 'eta' } }],
          interventionCount: 1,
        }),
      ],
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.body.rounds[0]?.interventions).toEqual([
      { atS: 300, change: { kind: 'switch-dispatcher', toProfileId: 'eta' } },
    ]);
    expect(check.body.rounds[0]?.ruleRows).toHaveLength(1);
  });

  it('refuses a last round ended by hand and one that never broke, and tells them apart — § D515', () => {
    const stopped = rushSittingOf({
      buildingId: 'midtown-office',
      rounds: [round({ outcome: outcome('stopped', 500) })],
    });
    expect(stopped.ok).toBe(false);
    if (stopped.ok) return;
    expect(stopped.reasons).toEqual([RUSH_SITTING_COPY.handStopped]);

    const never = rushSittingOf({
      buildingId: 'midtown-office',
      rounds: [round({ holdS: null, outcome: outcome('stopped', 5400) })],
    });
    expect(never.ok).toBe(false);
    if (never.ok) return;
    expect(never.reasons).toEqual([RUSH_SITTING_COPY.neverBroke]);
    /*
     * The pair must never share a sentence: a run the player stopped is one they can play out, and a
     * run that held every wave is a tower this dispatcher does not break. One wording for both would
     * send half the readers to the wrong action.
     */
    expect(RUSH_SITTING_COPY.handStopped).not.toEqual(RUSH_SITTING_COPY.neverBroke);
  });

  it('lets an earlier round be hand-stopped, because the last round is what posts', () => {
    const check = rushSittingOf({
      buildingId: 'midtown-office',
      rounds: [round({ outcome: outcome('stopped', 400), holdS: 1200 }), round()],
    });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    /*
     * And the earlier round still claims its **hold moment** rather than where the player stopped:
     * the server replays the whole stream and reads the hold moment off its own legs, so a claim of
     * 400 here would be refused as `held-does-not-reproduce` against an honest player.
     */
    expect(check.body.rounds[0]?.claimedHeldS).toBe(1200);
  });

  it('reports every reason at once, round by round, rather than the first', () => {
    const check = rushSittingOf({
      buildingId: 'midtown-office',
      rounds: [
        round({ unpostable: ['the building “mine” is saved on this device alone'] }),
        round({ unpostable: ['a day handed to Your own mix cannot be posted to a board'], outcome: outcome('stopped', 900) }),
      ],
    });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reasons).toHaveLength(3);
    expect(check.reasons[0]).toContain('Round 1:');
    expect(check.reasons[1]).toContain('Round 2:');
    expect(check.reasons[2]).toBe(RUSH_SITTING_COPY.handStopped);
  });

  it('refuses an empty sitting by naming the act rather than the absence', () => {
    const check = rushSittingOf({ buildingId: 'midtown-office', rounds: [] });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reasons).toEqual([RUSH_SITTING_COPY.noRounds]);
  });

  it('refuses more rounds than the server takes, and says how to start a new sitting', () => {
    const rounds = Array.from({ length: MAX_SITTING_ROUNDS + 1 }, () => round());
    const check = rushSittingOf({ buildingId: 'midtown-office', rounds });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reasons).toEqual([RUSH_SITTING_COPY.tooLong(MAX_SITTING_ROUNDS + 1)]);
    /* One under the bound still posts, which is what says the bound is the bound. */
    expect(rushSittingOf({ buildingId: 'midtown-office', rounds: rounds.slice(0, MAX_SITTING_ROUNDS) }).ok).toBe(true);
  });

  it('carries the modifiers it is given and no key when there are none — § D526 clause 3', () => {
    const bare = rushSittingOf({ buildingId: 'midtown-office', rounds: [round()] });
    expect(bare.ok && 'modifiers' in bare.body).toBe(false);
    const claimed = rushSittingOf({
      buildingId: 'midtown-office',
      rounds: [round()],
      modifiers: [{ sinkId: 'rush-purse-top-up', steps: 2 }],
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(claimed.body.modifiers).toEqual([{ sinkId: 'rush-purse-top-up', steps: 2 }]);
    /* The modifier and never the spend: nothing on the wire says what it cost. */
    expect(JSON.stringify(claimed.body)).not.toContain('chime');
  });
});

describe('the two ends agree about what they refuse — § D215 § 3’s read-the-source method', () => {
  const SERVER = readFileSync(
    fileURLToPath(new URL('../../../server/src/leaderboard/rushSitting.ts', import.meta.url)),
    'utf8',
  );

  it('holds this client’s round bound to the server’s own constant, read as text', () => {
    /*
     * `packages/viz` may not depend on `packages/server`, so the server's bound is read out of its
     * source exactly as `menu/client.test.ts` reads the password bounds — § D215 § 3's own method
     * for the same reason. A client bound *stricter* than the server's refuses something the server
     * would have taken and nobody finds out, which is why this is asserted rather than assumed.
     */
    const declared = /const MAX_SITTING_ROUNDS = (\d+);/u.exec(SERVER)?.[1];
    expect(declared, 'packages/server no longer declares MAX_SITTING_ROUNDS in the form this reads').toBeDefined();
    expect(Number(declared)).toBe(MAX_SITTING_ROUNDS);
  });

  it('keeps the two identity keys this module filters for, so a rename goes red here', () => {
    /*
     * `rushRoundRecordOf` keeps exactly `viewer.buildingId` and `viewer.dispatcherId` out of
     * `runIdentityIssues` and discards the rest, because a sitting's wire carries those two ids and
     * the server derives everything else from the building. A filter over a key that stopped being
     * issued would drop a gate **in silence** — the answer is simply an empty list — so the two
     * keys are asserted against the module that issues them.
     *
     * Read as source rather than by driving the predicate, and deliberately: the answers under test
     * are the two it reaches **before** the scope walk, and a `ViewerState` stubbed far enough to
     * reach them is a fixture proving a fixture works. The strings are what a rename moves.
     */
    const IDENTITY = readFileSync(fileURLToPath(new URL('../scope/runIdentity.ts', import.meta.url)), 'utf8');
    expect(IDENTITY).toContain("key: 'viewer.buildingId'");
    expect(IDENTITY).toContain("key: 'viewer.dispatcherId'");
    const SITTING = readFileSync(fileURLToPath(new URL('./rushSitting.ts', import.meta.url)), 'utf8');
    expect(SITTING).toContain("'viewer.buildingId'");
    expect(SITTING).toContain("'viewer.dispatcherId'");
  });

  it('builds a body out of exactly the keys the server’s gate allows, read as text', () => {
    /*
     * **The one seam no single test can drive end to end**, and this is the tree's method for it.
     * `packages/viz` may not import `packages/server`, so the client cannot feed a body through
     * `rushSittingIssues`; what it can do is read that gate's own allow-lists out of its source and
     * check that every key this module can emit is on them. A key added here and not there is
     * `400 invalid-sitting` at the moment a player posts — the moment with no words for it — and a
     * key the gate would refuse **by name** is worse, because the refusal reads like an accusation.
     */
    const listOf = (name: string): readonly string[] => {
      const found = new RegExp(`const ${name}: readonly string\\[\\] = Object\\.freeze\\(\\[([^\\]]*)\\]`, 'u').exec(SERVER);
      expect(found, `packages/server no longer declares ${name} in the form this reads`).not.toBeNull();
      return [...((found as RegExpExecArray)[1] ?? '').matchAll(/'([^']+)'/gu)].map((match) => match[1] ?? '');
    };

    const full = rushSittingOf({
      buildingId: 'midtown-office',
      rounds: [
        round({
          ruleRows: [{ when: 'lobby-queue-passes', whenValue: 12, then: 'hold-at-lobby' }],
          wireInterventions: [
            { atS: 60, change: { kind: 'park-cars-lobby' } },
            { atS: 120, change: { kind: 'spread-cars' } },
            {
              atS: 300,
              change: {
                kind: 'switch-dispatcher',
                toProfileId: 'eta',
                ruleRows: [{ when: 'car-fuller-than', whenValue: 8, then: 'no-new-pickups' }],
              },
            },
          ],
        }),
      ],
      modifiers: [{ sinkId: 'rush-purse-top-up', steps: 2 }],
    });
    expect(full.ok).toBe(true);
    if (!full.ok) return;

    const body = full.body as unknown as Record<string, unknown>;
    expect(Object.keys(body).every((key) => listOf('SITTING_KEYS').includes(key))).toBe(true);
    const roundBody = (body['rounds'] as readonly Record<string, unknown>[])[0] ?? {};
    expect(Object.keys(roundBody).every((key) => listOf('ROUND_KEYS').includes(key))).toBe(true);
    for (const row of roundBody['ruleRows'] as readonly Record<string, unknown>[]) {
      expect(Object.keys(row).every((key) => listOf('RULE_ROW_KEYS').includes(key))).toBe(true);
    }
    for (const entry of roundBody['interventions'] as readonly Record<string, unknown>[]) {
      expect(Object.keys(entry).every((key) => listOf('INTERVENTION_KEYS').includes(key))).toBe(true);
      const change = entry['change'] as Record<string, unknown>;
      const allowed = change['kind'] === 'switch-dispatcher' ? listOf('SWITCH_KEYS') : listOf('BARE_CHANGE_KEYS');
      expect(Object.keys(change).every((key) => allowed.includes(key))).toBe(true);
    }
    for (const claim of body['modifiers'] as readonly Record<string, unknown>[]) {
      expect(Object.keys(claim).every((key) => listOf('MODIFIER_KEYS').includes(key))).toBe(true);
    }
    /* Non-vacuity: the lists were found and are not empty, or every check above passes on nothing. */
    for (const name of ['SITTING_KEYS', 'ROUND_KEYS', 'RULE_ROW_KEYS', 'INTERVENTION_KEYS', 'SWITCH_KEYS', 'MODIFIER_KEYS']) {
      expect(listOf(name).length, `${name} read as empty, so the case above asserts nothing`).toBeGreaterThan(0);
    }
  });
});
