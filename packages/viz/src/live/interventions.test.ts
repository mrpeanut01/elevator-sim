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

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import {
  RULE_ACTION_WORDS,
  type DispatcherProfile,
  type ResolvedBuilding,
  type RunInterventionConfig,
} from '@elevator-sim/core/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { purchaseUnits } from '../pricing/parse.js';

import { DATA_DIR, requireBuilding } from '../fixtures.test-helper.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import type { PricedChange } from '../pricing/types.js';

import {
  admitWorks,
  driverNameAt,
  driversLineOf,
  driverStretchesOf,
  interventionLogOf,
  interventionStampOf,
  PARK_CARS_LOBBY_LABEL,
  RECOMPUTING_BEAT,
  SPREAD_CARS_LABEL,
  spentOnWorks,
  switchChangesNothing,
  SWITCH_KEEPS_DOORS,
  SWITCH_KEEPS_FORECAST,
  SWITCH_NEEDS_BIDDING,
  SWITCH_NEEDS_OTHER_PANELS,
  SWITCH_PINS_NOTE,
  SWITCH_STOPS_BIDDING,
  switchDispatcherLabelOf,
  switchNoteOf,
  switchRefusalOf,
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
    expect(SWITCH_PINS_NOTE).toContain('rules or pattern switching stand down');
    // § D1048: the press hands over the whole dispatcher, so the sentence no longer says *weights
    // alone* — which was true of the old kind and made the button's own label false — and names
    // the stages a player can see move, and the assignments that do not.
    expect(SWITCH_PINS_NOTE).not.toContain('weights');
    expect(SWITCH_PINS_NOTE).toContain('runs as this dispatcher would run it');
    expect(SWITCH_PINS_NOTE).toContain('calls already given a car keep it');
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

/*
 * Wave AL, lane AL-A, the post-AK panel's seats B and C: after a handover the stage's `DRIVING` cell
 * and the report's title kept naming the dispatcher the day was configured with.
 */
describe('who drove which stretch — driverStretchesOf, driverNameAt, driversLineOf', () => {
  const FAIR: DispatcherProfile = { id: 'fairness-first', name: 'Fairness first', weights: {} };
  const ADOPT_FAIR = { kind: 'adopt-dispatcher', profile: FAIR } as const;
  const at0848 = 2 * 3600 + 48 * 60;

  it('names the configured dispatcher before the handover and the new one from it', () => {
    const log = [{ atS: at0848, change: ADOPT_FAIR }];
    expect(driverNameAt(log, at0848 - 1, 'Minimum estimated wait')).toBe('Minimum estimated wait');
    expect(driverNameAt(log, at0848, 'Minimum estimated wait')).toBe('Fairness first');
    expect(driverNameAt(log, 12 * 3600, 'Minimum estimated wait')).toBe('Fairness first');
  });

  it('reads a stored weights-only handover too, and ignores presses that hand nothing over', () => {
    const log = [
      { atS: 60, change: PARK },
      { atS: AT_0914, change: SWITCH },
    ];
    expect(driverNameAt(log, AT_0914 + 1, 'Conventional collective')).toBe('Steady hand');
    expect(driverStretchesOf(log, 'Conventional collective').map((stretch) => stretch.name)).toEqual([
      'Conventional collective',
      'Steady hand',
    ]);
  });

  it('opens no stretch for a handover to the dispatcher already driving, and holds time order', () => {
    const log = [
      { atS: 5 * 3600, change: { kind: 'adopt-dispatcher', profile: STEADY } as const },
      { atS: at0848, change: ADOPT_FAIR },
      { atS: at0848 + 60, change: ADOPT_FAIR },
    ];
    expect(driverStretchesOf(log, 'Conventional collective')).toEqual([
      { fromS: undefined, name: 'Conventional collective' },
      { fromS: at0848, name: 'Fairness first' },
      { fromS: 5 * 3600, name: 'Steady hand' },
    ]);
  });

  it('says who drove when, on the run’s own clock', () => {
    expect(driversLineOf([], 'Conventional collective')).toBe('Conventional collective');
    expect(driversLineOf([{ atS: at0848, change: ADOPT_FAIR }], 'Minimum estimated wait')).toBe(
      'Minimum estimated wait, then Fairness first from 08:48',
    );
    /* A whole day that begins at 08:00 puts the same press at 10:48. */
    expect(driversLineOf([{ atS: at0848, change: ADOPT_FAIR }], 'Minimum estimated wait', 8 * 3600)).toBe(
      'Minimum estimated wait, then Fairness first from 10:48',
    );
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
    const log = [{ atS: 60, change: { kind: 'adopt-dispatcher', profile: PLAIN } }] as const;
    expect(switchChangesNothing({ interventions: log, target: PLAIN, driving })).toBe(true);
    /*
     * The thunk's whole reason, asserted rather than described: the pinned case answers from the log
     * and never walks the spec chain, and both callers run this on frames.
     */
    expect(asked).toBe(0);
    const other = profileOf('other', { waitTime: 3, stopCount: 2 });
    expect(switchChangesNothing({ interventions: log, target: other, driving })).toBe(false);
    expect(asked).toBe(0);
  });

  /**
   * **§ D1048's correction, on the shipped pair that found it.** `collective` and *Minimum estimated
   * wait* share `waitTime: 1`, so a vector comparison called the handover a no-op and the stage drew
   * *"that is what the building is already running"* under a dispatcher the building was not
   * running. The whole dispatcher differs by one hard constraint, and that is a change.
   */
  it('compares the whole dispatcher a handover carries, not the vector — collective to ETA is a change', () => {
    const collective: DispatcherProfile = { id: 'collective', name: 'Collective', weights: { waitTime: 1 }, hardConstraints: ['noDirectionReversal'] };
    const eta: DispatcherProfile = { id: 'eta', name: 'ETA', weights: { waitTime: 1 } };
    expect(switchChangesNothing({ interventions: [], target: eta, driving: () => collective })).toBe(false);
    /* A stage setting is a difference too, at equal weights and constraints. */
    const reassigning: DispatcherProfile = { ...eta, id: 'r', dispatch: { reassignmentPolicy: 'until-commitment' } };
    expect(switchChangesNothing({ interventions: [], target: reassigning, driving: () => eta })).toBe(false);
    /* And a field a handover does not carry is not: an authored default is the default. */
    const spelledOut: DispatcherProfile = { ...eta, id: 's', dispatch: { reassignmentPolicy: 'never' } };
    expect(switchChangesNothing({ interventions: [], target: spelledOut, driving: () => eta })).toBe(true);
  });

  it('reads a weights-only handover on a replayed log as the driver’s stages under its weights', () => {
    const collective: DispatcherProfile = { id: 'collective', name: 'Collective', weights: { waitTime: 1 }, hardConstraints: ['noDirectionReversal'] };
    const nearest: DispatcherProfile = { id: 'nearest', name: 'Nearest', weights: { distanceTravelled: 1 } };
    const log = [{ atS: 60, change: { kind: 'switch-dispatcher', profile: nearest } }] as const;
    /* What is in force is collective's rule with nearest's weights, which is not nearest. */
    expect(switchChangesNothing({ interventions: log, target: nearest, driving: () => collective })).toBe(false);
    expect(
      switchChangesNothing({
        interventions: log,
        target: { ...nearest, id: 'n2', hardConstraints: ['noDirectionReversal'] },
        driving: () => collective,
      }),
    ).toBe(true);
  });

  it('reads the last handover on the log, not the first', () => {
    const other = profileOf('other', { waitTime: 3 });
    const log = [
      { atS: 60, change: { kind: 'adopt-dispatcher', profile: PLAIN } },
      { atS: 120, change: { kind: 'adopt-dispatcher', profile: other } },
    ] as const;
    expect(
      switchChangesNothing({ interventions: log, target: other, driving: () => PLAIN }),
    ).toBe(true);
  });
});

/**
 * **The two things no handover can carry, refused on the target's own data** — § D1048.
 *
 * Driven over the shipped file rather than over fixtures alone, because the defect this closes was
 * two shipped rows: *Destination disclosure* and *Destination dispatch* were offered, enabled, and
 * moved no leg. The refusal is decided off the fields the engine resolves (the landing pair and the
 * auction section), so a saved dispatcher is refused on the same ground as a shipped one and no
 * profile id is read (invariant 7).
 */
describe('switchRefusalOf — § D1048', () => {
  let shipped: readonly DispatcherProfile[];
  beforeAll(async () => {
    shipped = (await loadConfig(DATA_DIR)).dispatcherProfiles.profiles;
  });
  const byId = (id: string): DispatcherProfile => {
    const found = shipped.find((profile) => profile.id === id);
    if (found === undefined) throw new Error(`no shipped profile ${id}`);
    return found;
  };

  it('refuses both destination rows from a day on up-and-down buttons, with the panels reason', () => {
    expect(switchRefusalOf(byId('destination-eta'), byId('collective'))).toBe(SWITCH_NEEDS_OTHER_PANELS);
    expect(switchRefusalOf(byId('destination-panel'), byId('collective'))).toBe(SWITCH_NEEDS_OTHER_PANELS);
  });

  it('refuses the way back too, and between the two destination levels', () => {
    expect(switchRefusalOf(byId('collective'), byId('destination-panel'))).toBe(SWITCH_NEEDS_OTHER_PANELS);
    /* Same call type, different panel: one names a car per rider and the other does not. */
    expect(switchRefusalOf(byId('destination-panel'), byId('destination-eta'))).toBe(SWITCH_NEEDS_OTHER_PANELS);
  });

  it('refuses a bidding target from a day that does not bid, and the reverse, and a change of rounds', () => {
    expect(switchRefusalOf(byId('auction'), byId('collective'))).toBe(SWITCH_NEEDS_BIDDING);
    expect(switchRefusalOf(byId('auction-multi-round'), byId('collective'))).toBe(SWITCH_NEEDS_BIDDING);
    expect(switchRefusalOf(byId('collective'), byId('auction'))).toBe(SWITCH_STOPS_BIDDING);
    expect(switchRefusalOf(byId('auction-multi-round'), byId('auction'))).toBe(SWITCH_STOPS_BIDDING);
  });

  it('refuses nothing between two conventional dispatchers, or a bidding day handed its own rules', () => {
    for (const target of shipped) {
      const sameLanding =
        (target.dispatch?.callType ?? 'up-down-buttons') === 'up-down-buttons' &&
        (target.dispatch?.passengerAssignment ?? 'none') === 'none';
      const bids = target.auction !== undefined;
      expect(switchRefusalOf(target, byId('collective')) === undefined, target.id).toBe(sameLanding && !bids);
    }
    expect(switchRefusalOf(byId('auction'), byId('auction'))).toBeUndefined();
  });

  it('reads the data, not the name — a saved copy with a panel is refused, and one without is not', () => {
    const saved: DispatcherProfile = { ...byId('eta'), id: 'saved-1', name: 'My dispatcher' };
    expect(switchRefusalOf(saved, byId('collective'))).toBeUndefined();
    expect(
      switchRefusalOf({ ...saved, dispatch: { callType: 'destination-entry' } }, byId('collective')),
    ).toBe(SWITCH_NEEDS_OTHER_PANELS);
  });

  it('says what cannot change and never names an engine field', () => {
    for (const sentence of [SWITCH_NEEDS_OTHER_PANELS, SWITCH_NEEDS_BIDDING, SWITCH_STOPS_BIDDING]) {
      expect(sentence).toMatch(/^cannot take over part-way through the day: /u);
      expect(sentence).not.toMatch(/callType|passengerAssignment|aggregation|auction|weight/u);
    }
  });
});

/**
 * **What a handover cannot bring part-way, named on the row** — § D1048.
 *
 * Driven over the shipped file: the two notes appear exactly for the two targets whose door timing
 * or demand forecast is built with the day, and for no other conventional target from the standing
 * order. `core`'s `sim/adoptDispatcher.test.ts` is the run that pins the same partition: those two
 * are the only adoptable targets a handover at 0:00 does not reproduce.
 */
describe('switchNoteOf — § D1048', () => {
  let shipped: readonly DispatcherProfile[];
  beforeAll(async () => {
    shipped = (await loadConfig(DATA_DIR)).dispatcherProfiles.profiles;
  });

  it('names door timing for Energy aware, both halves for Predictive balanced, and nothing else', () => {
    const collective = shipped.find((profile) => profile.id === 'collective');
    if (collective === undefined) throw new Error('no collective');
    const noted = Object.fromEntries(
      shipped
        .filter((target) => switchRefusalOf(target, collective) === undefined)
        .map((target) => [target.id, switchNoteOf(target, collective)] as const)
        .filter(([, note]) => note !== undefined),
    );
    expect(noted).toEqual({
      'energy-aware': SWITCH_KEEPS_DOORS,
      'predictive-balanced': `${SWITCH_KEEPS_DOORS}; ${SWITCH_KEEPS_FORECAST}`,
    });
  });

  it('is relative to the day: the same target from a day already on its settings needs no note', () => {
    const energy = shipped.find((profile) => profile.id === 'energy-aware');
    if (energy === undefined) throw new Error('no energy-aware');
    expect(switchNoteOf(energy, energy)).toBeUndefined();
  });

  it('says what stays, in the player’s words, and never names a field', () => {
    for (const sentence of [SWITCH_KEEPS_DOORS, SWITCH_KEEPS_FORECAST]) {
      expect(sentence).toMatch(/^the cars keep /u);
      expect(sentence).not.toMatch(/dwell|predictor|answer|idle|bypass/u);
    }
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

  /*
   * Two real towers, because the admission is now a question about a *building* as well as about a
   * purse — GitHub issue #477. `garden-apartments` has no double-deck car anywhere, so it is the
   * arm on which the three pricing refusals below are about money and nothing else;
   * `vertical-city` ships eight double-deck shuttles across four floor pairs, which is the tower
   * the defect was found on. Real buildings rather than fixtures on this file's own stated ground:
   * a fixture tower would prove that a fixture tower is refused.
   */
  let config: LoadedConfig;
  let singleDeck: ResolvedBuilding;
  let doubleDeck: ResolvedBuilding;

  beforeAll(async () => {
    config = await loadConfig(DATA_DIR);
    singleDeck = requireBuilding(config, 'garden-apartments');
    doubleDeck = requireBuilding(config, 'vertical-city');
  }, 120_000);

  /**
   * The cheapest and dearest shipped changes on each of the two tiers, found rather than named.
   *
   * **Flat rows only, and that is the population this control can buy from** — GitHub issue #437,
   * § D619. A rated row is priced per unit, `purchaseUnits` refuses to price one without a quantity
   * this control does not hold, and `admitWorks` now refuses such a change by name. Sorting the
   * whole tier would therefore throw, and picking a rated row as *the cheapest equipment change*
   * would make these cases assert against a purchase the product does not offer.
   */
  const onTier = (tier: string): readonly PricedChange[] =>
    schedule.changes
      .filter((change) => change.tier === tier && change.rate === undefined)
      .sort((a, b) => purchaseUnits(a) - purchaseUnits(b));

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

  /**
   * **A change priced per unit is refused with a reason, never priced at one and never a throw** —
   * GitHub issue #437, § D619. `shaft-area` (GitHub issue #429 stage 2, § D631) joined `landing-panels`
   * as the schedule's second rated row and is refused for the identical reason, asserted below.
   *
   * `landing-panels` is the schedule's first rated row. This control buys a whole change and holds
   * no quantity, so the honest answer is a refusal; before § D619 the answer was a
   * `PriceScheduleError` thrown out of `admitWorks`, which on the stage screen is a crash where the
   * contract promises a sentence. Driven against the shipped row rather than a fixture, because a
   * fixture would prove only that a fixture is refused.
   */
  it('refuses a change priced per unit, because this control holds no quantity', () => {
    const rated = schedule.changes.filter((change) => change.rate !== undefined);
    expect(rated.map((change) => change.id)).toEqual(['landing-panels', 'shaft-area']);
    const panels = rated[0] as PricedChange;

    const admission = admitWorks({
      schedule,
      // A budget far above any plausible price, so the refusal cannot be the purse's.
      budgetUnits: 10_000,
      interventions: [],
      changeId: panels.id,
      kind: 'equipment-change',
      building: singleDeck,
      serviceEvents: [],
    });
    expect(admission.admitted).toBe(false);
    expect(admission.priceUnits).toBe(0);
    expect(admission.reason).toContain(panels.name);
    expect(admission.reason).toContain('per');
    // And the label prints the rate on the row's face rather than inventing a total.
    expect(worksLabelOf(panels)).toContain('units per');
    expect(worksLabelOf(panels)).not.toMatch(/· \d+ units$/);
  });

  it('admits a change the rung covers, and refuses one it does not — naming the price and the budget', () => {
    const dear = dearestBuilding as PricedChange;
    expect(dear.priceUnits).toBeGreaterThan(0);

    const afforded = admitWorks({
      schedule,
      budgetUnits: purchaseUnits(dear),
      interventions: [],
      changeId: dear.id,
      kind: 'building-change',
      building: singleDeck,
      serviceEvents: [],
    });
    expect(afforded.admitted).toBe(true);
    expect(afforded.reason).toBeUndefined();
    expect(afforded.priceUnits).toBe(dear.priceUnits);

    // One unit short — the boundary, not a round number, so the comparison is `<=` and not `<`.
    const refused = admitWorks({
      schedule,
      budgetUnits: purchaseUnits(dear) - 1,
      interventions: [],
      changeId: dear.id,
      kind: 'building-change',
      building: singleDeck,
      serviceEvents: [],
    });
    expect(refused.admitted).toBe(false);
    // The refusal names the price, the budget and what is already committed — a sentence saying
    // only *you cannot afford this* leaves a player unable to tell a dear change from a spent purse.
    expect(refused.reason).toContain(String(dear.priceUnits));
    expect(refused.reason).toContain(String(purchaseUnits(dear) - 1));
    expect(refused.reason).toContain(dear.name);
    expect(refused.reason).toContain('already spent');
  });

  it('prices a second purchase against what the day has already spent', () => {
    const first = onTier('building')[0] as PricedChange;
    const second = onTier('building').find(
      (change) => change.id !== first.id && purchaseUnits(change) > 0,
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
    const rung = Math.max(purchaseUnits(first), purchaseUnits(second));
    const alone = admitWorks({ schedule, budgetUnits: rung, interventions: [], changeId: second.id, kind: 'building-change', building: singleDeck, serviceEvents: [] });
    expect(alone.admitted).toBe(true);
    const afterTheFirst = admitWorks({ schedule, budgetUnits: rung, interventions: log, changeId: second.id, kind: 'building-change', building: singleDeck, serviceEvents: [] });
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
      budgetUnits: purchaseUnits(change),
      interventions: log,
      changeId: change.id,
      kind: 'building-change',
      building: singleDeck,
      serviceEvents: [],
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
      building: singleDeck,
      serviceEvents: [],
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
      building: singleDeck,
      serviceEvents: [],
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
  /* ------------------------------------------------------------------ *
   * A rezone the fabric cannot take — GitHub issue #477
   * ------------------------------------------------------------------ */

  /**
   * `rezone-bank` is a shipped `building` row covering `building.banks[]`, and `vertical-city`
   * ships eight double-deck shuttles across four floor pairs. Aimed at one of those banks the
   * effect used to be admitted, appended, scheduled, fired, and thrown as a `ModelError` **out of
   * the running day**. The engine now warns and declines to schedule it, which keeps the day alive;
   * this is the other half, and it is the half that decides whether the player was charged.
   *
   * The boundary is checked against the value the defect really had: under the defect this
   * admission is `true` with `reason: undefined`, so `admitted` is asserted `false` rather than
   * merely *not truthy*, and the price is asserted **absent from the record** rather than assumed
   * absent — a control that refused in words and appended anyway would pass a looser check.
   */
  const REZONE_SHUTTLE = {
    atS: 700,
    bankId: 'shuttle',
    servesFloors: ['G', '2', '26', '27', '51', '52'],
  } as const;

  it('refuses a rezone aimed at a double-deck bank, and names the pairing as the reason', () => {
    const rezone = schedule.changes.find((row) => row.id === 'rezone-bank') as PricedChange;
    expect(rezone).toBeDefined();

    const admission = admitWorks({
      schedule,
      // A rung that covers the change several times over, so the refusal cannot be about money.
      budgetUnits: purchaseUnits(rezone) * 10,
      interventions: [],
      changeId: rezone.id,
      kind: 'building-change',
      building: doubleDeck,
      serviceEvents: [REZONE_SHUTTLE],
    });

    expect(admission.admitted).toBe(false);
    expect(admission.reason).toContain('double-deck');
    // The bank by its authored display name, never its id — gameplay § 16 rule 11.
    expect(admission.reason).toContain('Double-deck sky lobby shuttle');
    expect(admission.reason).not.toContain('shuttle"');
    expect(admission.reason).toContain('Nothing has been bought.');
    // Not the affordability sentence: a change the build could never carry must not be refused for
    // money, or a player reads it as *save up and try again*.
    expect(admission.reason).not.toContain('already spent');
  });

  it('takes no money for a refused rezone — the sentence and the spend move together', () => {
    const rezone = schedule.changes.find((row) => row.id === 'rezone-bank') as PricedChange;
    // Nothing is appended when the admission refuses, so the day's committed spend is what it was.
    const before: readonly RunInterventionConfig[] = [];
    const admission = admitWorks({
      schedule,
      budgetUnits: purchaseUnits(rezone) * 10,
      interventions: before,
      changeId: rezone.id,
      kind: 'building-change',
      building: doubleDeck,
      serviceEvents: [REZONE_SHUTTLE],
    });
    expect(admission.admitted).toBe(false);
    expect(spentOnWorks(schedule, before)).toBe(0);
    // Non-vacuity: the same change on the same rung, admitted, would have cost something — so the
    // zero above is a refusal rather than a change the schedule prices at nothing.
    expect(rezone.priceUnits).toBeGreaterThan(0);
  });

  it('admits the same change on a bank whose range can move — the refusal is about the fabric', () => {
    const rezone = schedule.changes.find((row) => row.id === 'rezone-bank') as PricedChange;
    const local = doubleDeck.banks.find((bank) => bank.id === 'zone-1-local');
    expect(local).toBeDefined();
    const admission = admitWorks({
      schedule,
      budgetUnits: purchaseUnits(rezone) * 10,
      interventions: [],
      changeId: rezone.id,
      kind: 'building-change',
      building: doubleDeck,
      serviceEvents: [
        { atS: 700, bankId: 'zone-1-local', servesFloors: ['G', '2', '3', '4'] },
      ],
    });
    expect(admission.admitted).toBe(true);
    expect(admission.reason).toBeUndefined();
  });

  it('admits a purchase whose effect is its stamp alone, on the same double-deck tower', () => {
    // `serviceEvents: []` is legal and means *the stamp is the point*. The ground must read the
    // effects rather than the tower, or every purchase on `vertical-city` would be refused.
    const rezone = schedule.changes.find((row) => row.id === 'rezone-bank') as PricedChange;
    const admission = admitWorks({
      schedule,
      budgetUnits: purchaseUnits(rezone) * 10,
      interventions: [],
      changeId: rezone.id,
      kind: 'building-change',
      building: doubleDeck,
      serviceEvents: [],
    });
    expect(admission.admitted).toBe(true);
  });
});
