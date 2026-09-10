/**
 * The intervention stamp answers for the playhead, not for the log.
 *
 * The temporal property is the one worth a file: § D307's axis found two surfaces publishing, at
 * a playhead short of the end, a figure only true of the whole run — and a stamp reading
 * `09:14 · parked the cars in the lobby` while the stage is drawing 08:00 would be the same
 * defect with a player's own action as the subject. `interventionStampOf` meets it by shape
 * (only entries at or before `simTimeS` are eligible), and this file is what notices if that
 * shape changes.
 */

import {
  RULE_ACTION_WORDS,
  type DispatcherProfile,
  type RunInterventionConfig,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PricedChange } from '../pricing/types.js';

import {
  admitWorks,
  interventionLogOf,
  interventionStampOf,
  PARK_CARS_LOBBY_LABEL,
  RECOMPUTING_BEAT,
  SPREAD_CARS_LABEL,
  spentOnWorks,
  switchChangesNothing,
  SWITCH_PINS_NOTE,
  switchDispatcherLabelOf,
  WORKS_ARM_EXPLAINS,
  worksKindOfTier,
  worksLabelOf,
} from './interventions.js';

// 09:14 under the shared 06:00 day start: 3 h 14 min into the run.
const AT_0914 = 3 * 3600 + 14 * 60;
const PARK = { kind: 'park-cars-lobby' } as const;

// The minimal profile the switch arm carries: id, display name, a vector. The stamp must speak
// the name and never the id — the id here is deliberately engine-flavoured so a leak would show.
const STEADY: DispatcherProfile = { id: 'steady-hand-v2', name: 'Steady hand', weights: {} };
const SWITCH = { kind: 'switch-dispatcher', profile: STEADY } as const;
const ANSWER = {
  kind: 'answer-incident',
  option: 'call the fitter out now',
  serviceEvents: [],
} as const;

describe('SPREAD_CARS_LABEL — GitHub issue #352', () => {
  it('is the rules vocabulary’s own sentence, about the whole fleet, capitalised for a button', () => {
    // Derived from `RULE_ACTION_WORDS['spread-out'].template` rather than authored beside it, so a
    // rule row and this control cannot come to mean two things by *spread*.
    expect(SPREAD_CARS_LABEL).toBe('Spread the cars across the tower');
    expect(RULE_ACTION_WORDS['spread-out'].template).toBe('spread the other cars across the tower');
  });

  it('stamps in the same sentence, past tense', () => {
    expect(interventionStampOf([{ atS: AT_0914, change: { kind: 'spread-cars' } }], AT_0914)).toBe(
      '09:14 · spread the cars across the tower',
    );
  });
});

describe('interventionStampOf', () => {
  it('stamps the design’s own sentence, in the shell’s own clock', () => {
    // The worked example § 7.6 prints — `09:14 · parked the cars in the lobby` — verbatim.
    expect(interventionStampOf([{ atS: AT_0914, change: PARK }], AT_0914)).toBe(
      '09:14 · parked the cars in the lobby',
    );
  });

  it('answers nothing before the intervention has happened on the stage', () => {
    // A reader who scrubs back past their own intervention watches the stamp disappear: at that
    // playhead the change of mind has not happened yet, and narrating it would be § D307's
    // whole-run figure at a mid-run playhead.
    expect(interventionStampOf([{ atS: AT_0914, change: PARK }], AT_0914 - 1)).toBe('');
    expect(interventionStampOf([], 10_000)).toBe('');
  });

  it('names the latest entry in force, not the first', () => {
    const log = [
      { atS: 600, change: PARK },
      { atS: AT_0914, change: PARK },
    ];
    expect(interventionStampOf(log, AT_0914 + 60)).toBe('09:14 · parked the cars in the lobby');
    // Between the two, the earlier one is the one that has happened.
    expect(interventionStampOf(log, 700)).toBe('06:10 · parked the cars in the lobby');
  });

  it('reads the run’s own hour when one is passed, exactly as the header clock does', () => {
    // `dayStartS` follows clockAt's contract: the same value dev/main.ts feeds the header, so
    // the stamp and the clock above it cannot disagree about what 09:14 means.
    expect(interventionStampOf([{ atS: 0, change: PARK }], 0, 8 * 3600)).toBe(
      '08:00 · parked the cars in the lobby',
    );
  });

  it('labels the control with a verb, and the stamp with its past tense', () => {
    expect(PARK_CARS_LOBBY_LABEL).toBe('Park the cars in the lobby');
    // The switch control speaks the *name* — a button naming `steady-hand-v2` would be an engine
    // identifier in the Casual register (§ 16 rule 11), which is why the label is parametric.
    expect(switchDispatcherLabelOf('Steady hand')).toBe('Switch to Steady hand');
  });

  it('stamps a dispatcher switch in the handoff’s own sentence, name and never id', () => {
    // § 7.6's worked example is `09:14 · switched to Lobby anchor`, and the handoff wins copy.
    const stamp = interventionStampOf([{ atS: AT_0914, change: SWITCH }], AT_0914);
    expect(stamp).toBe('09:14 · switched to Steady hand');
    expect(stamp).not.toContain('steady-hand-v2');
  });

  it('states the pin — a switch stands the player’s choosers down, in words (§ D227)', () => {
    // The mechanism's one player-facing sentence, carried on the switch control's title: the
    // adopted vector silences rules and pattern switching from the stamped instant, and a
    // behaviour nothing states is a stale refusal waiting to happen.
    expect(SWITCH_PINS_NOTE).toContain('weights alone');
    expect(SWITCH_PINS_NOTE).toContain('rules or pattern switching stand down');
  });

  it('stamps an incident answer with the chosen option’s own words — § 20.16’s clock', () => {
    // `atS` is `runIncidentClock`: the simulated second the answer was given, in the shell's own
    // clock, beside the option's authored words. No engine vocabulary enters the sentence.
    expect(interventionStampOf([{ atS: AT_0914, change: ANSWER }], AT_0914)).toBe(
      '09:14 · answered the incident — call the fitter out now',
    );
  });

  it('holds the recomputing beat as one sentence, ready for the stage', () => {
    // Contract § 1.4: above ~400 ms, a beat rather than a freeze. The words live here so the
    // sweep drives them; dev/main.ts only decides when the threshold has genuinely passed.
    expect(RECOMPUTING_BEAT).toBe('recomputing the day…');
  });
});

describe('interventionLogOf', () => {
  /*
   * The filed sheet's half — `docs/19` defect 10. No playhead in the signature, on purpose: the
   * Day report is a whole-day account (§ D223), so its log is the whole log, and the temporal
   * discipline the stamp keeps by shape does not apply to a surface that only exists at the end.
   */
  it('prints every entry, in time order, in the stamp’s own words', () => {
    const lines = interventionLogOf([
      { atS: AT_0914, change: PARK },
      { atS: 600, change: PARK },
    ]);
    // Handed over out of order; the claim *in time order* is the function's own, not the caller's.
    expect(lines).toEqual([
      '06:10 · parked the cars in the lobby',
      '09:14 · parked the cars in the lobby',
    ]);
    // Line one is byte-identical to the stage's stamp at that instant — shared verbs, shared
    // clock, so the sheet and the stage cannot disagree about what a press was called.
    expect(lines[1]).toBe(interventionStampOf([{ atS: AT_0914, change: PARK }], AT_0914));
  });

  it('prints all three kinds on one sheet — the incident answer’s clock among them (§ 20.16)', () => {
    // A day with a park, a handover and an answered incident lists three stamped lines, one per
    // entry, in time order; the answer's line *is* `runIncidentClock` appearing on the report.
    expect(
      interventionLogOf([
        { atS: AT_0914, change: ANSWER },
        { atS: 600, change: PARK },
        { atS: 7200, change: SWITCH },
      ]),
    ).toEqual([
      '06:10 · parked the cars in the lobby',
      '08:00 · switched to Steady hand',
      '09:14 · answered the incident — call the fitter out now',
    ]);
  });

  it('prints nothing for an empty log — no placeholder line', () => {
    expect(interventionLogOf([])).toEqual([]);
  });

  it('reads the run’s own hour, exactly as the stamp does', () => {
    expect(interventionLogOf([{ atS: 0, change: PARK }], 8 * 3600)).toEqual([
      '08:00 · parked the cars in the lobby',
    ]);
  });
});

/* -------------------------------------------------------------------------- *
 * The handover's own refusal — one predicate, two shells
 * -------------------------------------------------------------------------- */

/**
 * **The check that stopped § 7.6's second arm being an inert control**, on both surfaces that draw
 * it (`dev/main.ts`'s Engineer strip, `everyday/stageScreen.ts`'s stage — GitHub issue #171).
 *
 * The case worth reading first is *a moved lever under the same name*. Comparing base **ids** — the
 * shape this replaced — answers *no change* there, and it is wrong: what drives a run is the vector,
 * the player has moved it, and handing the day back to the name they started under is a real change
 * to every decision from that instant. § D177's inert-control class with its polarity reversed.
 */
describe('switchChangesNothing', () => {
  const profileOf = (id: string, weights: Readonly<Record<string, number>>): DispatcherProfile => ({
    id,
    name: id,
    weights,
  });
  const PLAIN = profileOf('plain', { waitTime: 1, stopCount: 2 });

  it('is true when the target is the vector already driving', () => {
    expect(
      switchChangesNothing({ interventions: [], target: PLAIN, driving: () => PLAIN }),
    ).toBe(true);
  });

  it('ignores key order, which is authoring noise rather than a difference', () => {
    const reordered = profileOf('plain', { stopCount: 2, waitTime: 1 });
    expect(
      switchChangesNothing({ interventions: [], target: reordered, driving: () => PLAIN }),
    ).toBe(true);
  });

  it('is false where an id comparison would have said true — a lever has moved the vector', () => {
    const driving = profileOf('plain', { waitTime: 9, stopCount: 2 });
    expect(
      switchChangesNothing({ interventions: [], target: PLAIN, driving: () => driving }),
    ).toBe(false);
  });

  it('counts a live chooser as a difference at equal weights', () => {
    /* A switch also stands the chooser down for the rest of the run, which is a change by itself. */
    const driving: DispatcherProfile = { ...PLAIN, selection: { policy: 'rules' } };
    expect(
      switchChangesNothing({ interventions: [], target: PLAIN, driving: () => driving }),
    ).toBe(false);
  });

  it('lets a handover already on the log decide, without consulting a vector at all', () => {
    let asked = 0;
    const driving = (): DispatcherProfile => {
      asked += 1;
      return profileOf('plain', { waitTime: 9, stopCount: 2 });
    };
    const log = [{ atS: 60, change: { kind: 'switch-dispatcher', profile: PLAIN } }] as const;
    expect(switchChangesNothing({ interventions: log, target: PLAIN, driving })).toBe(true);
    /*
     * The thunk's whole reason, asserted rather than described: the pinned case answers from the log
     * and never walks the spec chain, and both callers run this on frames.
     */
    expect(asked).toBe(0);
    const other = profileOf('other', { waitTime: 1, stopCount: 2 });
    expect(switchChangesNothing({ interventions: log, target: other, driving })).toBe(false);
    expect(asked).toBe(0);
  });

  it('reads the last handover on the log, not the first', () => {
    const other = profileOf('other', { waitTime: 3 });
    const log = [
      { atS: 60, change: { kind: 'switch-dispatcher', profile: PLAIN } },
      { atS: 120, change: { kind: 'switch-dispatcher', profile: other } },
    ] as const;
    expect(
      switchChangesNothing({ interventions: log, target: other, driving: () => PLAIN }),
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * The bought kinds — GitHub issue #370
 * -------------------------------------------------------------------------- */

/**
 * The two kinds a player **buys** mid-run, priced from `data/price-schedule.json`.
 *
 * Driven against the **shipped** schedule rather than a fixture, on
 * `pricing/tiersReachTheRun.test.ts`'s stated ground: a price this file invented would be the
 * second price list #366 exists to end, and a refusal quoting an invented number is a refusal
 * nobody can check against the ladder a player is actually paying on.
 */
describe('the bought kinds — stamp, price and refusal (GitHub issue #370)', () => {
  const schedule = shippedPriceSchedule();

  /** The cheapest and dearest shipped changes on each of the two tiers, found rather than named. */
  const onTier = (tier: string): readonly PricedChange[] =>
    schedule.changes.filter((change) => change.tier === tier).sort((a, b) => a.priceUnits - b.priceUnits);

  const cheapestEquipment = onTier('equipment')[0];
  const dearestBuilding = onTier('building').at(-1);

  it('stamps a purchase in the schedule’s own words, and never its id', () => {
    expect(
      interventionStampOf(
        [
          {
            atS: AT_0914,
            change: {
              kind: 'equipment-change',
              changeId: 'zone-the-tower',
              name: 'Zone the tower',
              serviceEvents: [],
            },
          },
        ],
        AT_0914,
      ),
    ).toBe('09:14 · fitted new equipment — Zone the tower');
    expect(
      interventionStampOf(
        [
          {
            atS: AT_0914,
            change: {
              kind: 'building-change',
              changeId: 'rezone-bank',
              name: 'Re-zone a bank',
              serviceEvents: [],
            },
          },
        ],
        AT_0914,
      ),
    ).toBe('09:14 · changed the building — Re-zone a bank');
  });

  it('never leaks the changeId into the stamp — gameplay § 16 rule 11', () => {
    // The id is engine-flavoured on purpose here, exactly as `STEADY`'s is on the switch arm, so a
    // leak would be visible rather than plausible.
    const stamp = interventionStampOf(
      [
        {
          atS: AT_0914,
          change: {
            kind: 'building-change',
            changeId: 'shop.machines.3',
            name: 'New machines',
            serviceEvents: [],
          },
        },
      ],
      AT_0914,
    );
    expect(stamp).toBe('09:14 · changed the building — New machines');
    expect(stamp).not.toContain('shop.machines.3');
  });

  it('records each shipped tier as the kind that tier is paid on, and refuses a tier no kind records', () => {
    expect(worksKindOfTier('equipment')).toBe('equipment-change');
    expect(worksKindOfTier('building')).toBe('building-change');
    // The dispatcher tier is `switch-dispatcher`'s, and a third kind meaning the same press would
    // be two records for one act.
    expect(worksKindOfTier('dispatcher')).toBeUndefined();
    expect(worksKindOfTier('a-tier-this-build-has-never-shipped')).toBeUndefined();
    // Every shipped tier is accounted for one way or the other, so a fourth tier landing in
    // `data/` is a decision somebody has to take rather than a silent `undefined`.
    for (const tier of schedule.tiers) {
      expect(['dispatcher', 'equipment', 'building']).toContain(tier.id);
    }
  });

  it('labels a purchase with the schedule’s price and never with one of its own', () => {
    expect(cheapestEquipment).toBeDefined();
    const change = cheapestEquipment as PricedChange;
    expect(worksLabelOf(change)).toBe(`${change.name} · ${String(change.priceUnits)} units`);
  });

  it('admits a change the rung covers, and refuses one it does not — naming the price and the budget', () => {
    const dear = dearestBuilding as PricedChange;
    expect(dear.priceUnits).toBeGreaterThan(0);

    const afforded = admitWorks({
      schedule,
      budgetUnits: dear.priceUnits,
      interventions: [],
      changeId: dear.id,
      kind: 'building-change',
    });
    expect(afforded.admitted).toBe(true);
    expect(afforded.reason).toBeUndefined();
    expect(afforded.priceUnits).toBe(dear.priceUnits);

    // One unit short — the boundary, not a round number, so the comparison is `<=` and not `<`.
    const refused = admitWorks({
      schedule,
      budgetUnits: dear.priceUnits - 1,
      interventions: [],
      changeId: dear.id,
      kind: 'building-change',
    });
    expect(refused.admitted).toBe(false);
    // The refusal names the price, the budget and what is already committed — a sentence saying
    // only *you cannot afford this* leaves a player unable to tell a dear change from a spent purse.
    expect(refused.reason).toContain(String(dear.priceUnits));
    expect(refused.reason).toContain(String(dear.priceUnits - 1));
    expect(refused.reason).toContain(dear.name);
    expect(refused.reason).toContain('already spent');
  });

  it('prices a second purchase against what the day has already spent', () => {
    const first = onTier('building')[0] as PricedChange;
    const second = onTier('building').find(
      (change) => change.id !== first.id && change.priceUnits > 0,
    ) as PricedChange;
    const log: readonly RunInterventionConfig[] = [
      {
        atS: 300,
        change: {
          kind: 'building-change',
          changeId: first.id,
          name: first.name,
          serviceEvents: [],
        },
      },
    ];
    expect(spentOnWorks(schedule, log)).toBe(first.priceUnits);

    // A rung that covers the second change on its own and not beside the first.
    const rung = Math.max(first.priceUnits, second.priceUnits);
    const alone = admitWorks({ schedule, budgetUnits: rung, interventions: [], changeId: second.id, kind: 'building-change' });
    expect(alone.admitted).toBe(true);
    const afterTheFirst = admitWorks({ schedule, budgetUnits: rung, interventions: log, changeId: second.id, kind: 'building-change' });
    expect(afterTheFirst.admitted).toBe(false);
    expect(afterTheFirst.spentUnits).toBe(first.priceUnits);
  });

  it('charges nothing to repeat a change today’s record already holds', () => {
    // `changesBought`'s distinct-by-id rule read down the time axis: a bank re-zoned at 09:00 and
    // re-zoned again at 11:00 was bought once and used twice. Stated because the opposite reading
    // is equally arguable and only one of them can be the shipped one.
    const change = onTier('building').at(-1) as PricedChange;
    const log: readonly RunInterventionConfig[] = [
      { atS: 300, change: { kind: 'building-change', changeId: change.id, name: change.name, serviceEvents: [] } },
    ];
    expect(spentOnWorks(schedule, log)).toBe(change.priceUnits);
    const again = admitWorks({
      schedule,
      budgetUnits: change.priceUnits,
      interventions: log,
      changeId: change.id,
      kind: 'building-change',
    });
    expect(again.admitted).toBe(true);
  });

  it('refuses a change priced on a rung this control does not buy on', () => {
    const building = onTier('building')[0] as PricedChange;
    const wrongRung = admitWorks({
      schedule,
      budgetUnits: 1_000,
      interventions: [],
      changeId: building.id,
      kind: 'equipment-change',
    });
    expect(wrongRung.admitted).toBe(false);
    expect(wrongRung.reason).toContain('building rung');
    expect(wrongRung.reason).toContain('equipment rung');
  });

  it('refuses an id the schedule prices nothing for, rather than letting it through free', () => {
    // Silently free is the worst of the three answers: a stored record naming an unknown change
    // would buy the tower for nothing. `pricing/parse.ts#priceOf` throws for the same reason; this
    // hands back the sentence because its caller is a screen.
    const unknown = admitWorks({
      schedule,
      budgetUnits: 1_000,
      interventions: [],
      changeId: 'a-change-this-build-has-never-priced',
      kind: 'building-change',
    });
    expect(unknown.admitted).toBe(false);
    expect(unknown.reason).toContain('a-change-this-build-has-never-priced');
    expect(unknown.priceUnits).toBe(0);
  });

  it('counts nothing for a log that holds no purchases', () => {
    expect(spentOnWorks(schedule, [{ atS: 60, change: PARK }, { atS: 90, change: ANSWER }])).toBe(0);
  });

  it('states what the arm does, including the promise a run has to keep', () => {
    // The second half of this sentence is a claim about the mechanism, pinned by
    // `core/src/sim/interventions.test.ts`'s *holds the crowd across the press* rather than by
    // another sentence (§ D227).
    expect(WORKS_ARM_EXPLAINS).toContain('re-simulates the day from the start');
    expect(WORKS_ARM_EXPLAINS).toContain('the same people arrive at the same seconds');
  });

  it('prints a purchase on the filed sheet in the stamp’s own words', () => {
    expect(
      interventionLogOf([
        { atS: 60, change: PARK },
        {
          atS: 120,
          change: {
            kind: 'building-change',
            changeId: 'rezone-bank',
            name: 'Re-zone a bank',
            serviceEvents: [],
          },
        },
      ]),
    ).toEqual(['06:01 · parked the cars in the lobby', '06:02 · changed the building — Re-zone a bank']);
  });
});
