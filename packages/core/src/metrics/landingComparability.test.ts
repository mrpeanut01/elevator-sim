/**
 * **A mixed run's comparability, decided per landing and enforced here** — GitHub issue #437,
 * `DECISIONS.md` § D553.
 *
 * A destination panel is a fact about a landing, so the passenger model is too: a landing whose
 * panel names a car is `destination-dispatch`, a landing that keeps its up/down button — or only
 * discloses a destination — is `conventional`. A run whose landings agree keeps today's label and
 * today's object, exactly. A run whose landings disagree is `hybrid`, and it carries the set of
 * landings that assign, because that set is what decides whether its nine model-sensitive metrics
 * mean the same thing as another run's.
 *
 * The pairing rule is asserted in every direction a study could get wrong: a hybrid against either
 * uniform model, a hybrid against a hybrid with another panel set, and — the one that is permitted —
 * a hybrid against a hybrid whose landings agree with it landing for landing.
 */

import { describe, expect, it } from 'vitest';

import type { CallType, PassengerAssignmentMode } from '../config/types.js';

import {
  COMPARABLE_METRIC_IDS,
  MODEL_SENSITIVE_METRIC_IDS,
  comparabilityBetween,
  comparabilityDisclaimer,
  comparabilityOf,
  comparabilityOfLandings,
  landingPassengerModelOf,
  passengerModelOf,
} from './comparability.js';

interface Stage {
  readonly callType: CallType;
  readonly passengerAssignment: PassengerAssignmentMode;
}

const PANEL: Stage = { callType: 'mobile-credential', passengerAssignment: 'panel' };
const KIOSK_PANEL: Stage = { callType: 'destination-entry', passengerAssignment: 'panel' };
const DISCLOSURE: Stage = { callType: 'destination-entry', passengerAssignment: 'none' };
const BUTTONS: Stage = { callType: 'up-down-buttons', passengerAssignment: 'none' };
const STAGES = [PANEL, KIOSK_PANEL, DISCLOSURE, BUTTONS] as const;

const IDS = ['G', 'P1', '2', '3', '4'] as const;

/** The building's landings, with `declared` naming the ones that declare a call type. */
function landings(
  declared: Readonly<Record<string, CallType>> = {},
): readonly { readonly id: string; readonly landingCallType?: CallType | undefined }[] {
  return IDS.map((id) => (declared[id] === undefined ? { id } : { id, landingCallType: declared[id] }));
}

/** Every landing but the named ones declares up/down buttons: the literature's hybrid shape. */
function panelsOnlyAt(...panelled: readonly string[]): Readonly<Record<string, CallType>> {
  return Object.fromEntries(
    IDS.filter((id) => !panelled.includes(id)).map((id) => [id, 'up-down-buttons' as CallType]),
  );
}

const ALL_23 = [...MODEL_SENSITIVE_METRIC_IDS, ...COMPARABLE_METRIC_IDS].sort();

describe('the passenger model of one landing', () => {
  it('is the run model wherever the landing declares nothing', () => {
    for (const stage of STAGES) {
      expect(landingPassengerModelOf(stage, undefined)).toBe(passengerModelOf(stage));
    }
  });

  it('is conventional at an up/down landing whatever the dispatcher would have named', () => {
    // policy.ts's own sentence: a panel that cannot ask for a destination is an up/down button.
    for (const stage of STAGES) {
      expect(landingPassengerModelOf(stage, 'up-down-buttons')).toBe('conventional');
    }
  });

  it('assigns at a destination landing only when the run names cars at the panel', () => {
    expect(landingPassengerModelOf(PANEL, 'destination-entry')).toBe('destination-dispatch');
    expect(landingPassengerModelOf(KIOSK_PANEL, 'mobile-credential')).toBe('destination-dispatch');
    // Disclosure at a landing is disclosure: the passenger still boards whichever car opens.
    expect(landingPassengerModelOf(DISCLOSURE, 'mobile-credential')).toBe('conventional');
    expect(landingPassengerModelOf(BUTTONS, 'destination-entry')).toBe('conventional');
  });
});

describe('the comparability of a run, off its landings', () => {
  it('is today’s object, key for key, when no landing declares a call type', () => {
    for (const stage of STAGES) {
      const off = comparabilityOfLandings(stage, landings());
      expect(off).toStrictEqual(comparabilityOf(passengerModelOf(stage)));
      expect(Object.keys(off)).not.toContain('assigningFloorIds');
    }
  });

  it('is today’s object when every landing declares the run’s own call type', () => {
    for (const stage of STAGES) {
      const everywhere = Object.fromEntries(IDS.map((id) => [id, stage.callType]));
      expect(comparabilityOfLandings(stage, landings(everywhere))).toStrictEqual(
        comparabilityOf(passengerModelOf(stage)),
      );
    }
  });

  it('is conventional when a panel dispatcher runs a building with no panel on any landing', () => {
    const none = Object.fromEntries(IDS.map((id) => [id, 'up-down-buttons' as CallType]));
    expect(comparabilityOfLandings(PANEL, landings(none))).toStrictEqual(
      comparabilityOf('conventional'),
    );
  });

  it('is hybrid, naming the assigning landings in building order, when the landings disagree', () => {
    const hybrid = comparabilityOfLandings(PANEL, landings(panelsOnlyAt('P1', 'G')));
    expect(hybrid.passengerModel).toBe('hybrid');
    expect(hybrid.assigningFloorIds).toEqual(['G', 'P1']);
    expect(hybrid.notComparableMetrics).toEqual(MODEL_SENSITIVE_METRIC_IDS);
    expect(hybrid.comparableMetrics).toEqual(COMPARABLE_METRIC_IDS);
    expect(Object.isFrozen(hybrid)).toBe(true);
    expect(Object.isFrozen(hybrid.assigningFloorIds)).toBe(true);
  });

  it('stays conventional when a disclosure-only run mixes destination and button landings', () => {
    // Every landing is the conventional passenger model, so all twenty-three stay comparable —
    // the same reading docs/09 § 1.6 gives a disclosure-only run today.
    expect(
      comparabilityOfLandings(DISCLOSURE, landings(panelsOnlyAt('G'))),
    ).toStrictEqual(comparabilityOf('conventional'));
    expect(
      comparabilityOfLandings(BUTTONS, landings({ G: 'destination-entry' })),
    ).toStrictEqual(comparabilityOf('conventional'));
  });

  it('refuses to call a run hybrid without the landings that make it one', () => {
    expect(() => comparabilityOf('hybrid')).toThrow(/assigning/);
    expect(() => comparabilityOf('hybrid', [])).toThrow(/assigning/);
  });
});

describe('whether two runs may be paired on the nine', () => {
  const conventional = comparabilityOf('conventional');
  const full = comparabilityOf('destination-dispatch');
  const lobby = comparabilityOfLandings(PANEL, landings(panelsOnlyAt('G')));
  const lobbyAgain = comparabilityOfLandings(KIOSK_PANEL, landings(panelsOnlyAt('G')));
  const twoLobbies = comparabilityOfLandings(PANEL, landings(panelsOnlyAt('G', 'P1')));

  const refused = (a: typeof lobby, b: typeof lobby): void => {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      const pair = comparabilityBetween(x, y);
      expect(pair.sameLandingModels).toBe(false);
      expect(pair.notComparableMetrics).toEqual(MODEL_SENSITIVE_METRIC_IDS);
      expect(pair.comparableMetrics).toEqual(COMPARABLE_METRIC_IDS);
    }
  };

  const permitted = (a: typeof lobby, b: typeof lobby): void => {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      const pair = comparabilityBetween(x, y);
      expect(pair.sameLandingModels).toBe(true);
      expect(pair.notComparableMetrics).toEqual([]);
      expect([...pair.comparableMetrics].sort()).toEqual(ALL_23);
    }
  };

  it('keeps today’s two rules for the uniform models', () => {
    permitted(conventional, conventional);
    permitted(full, full);
    refused(conventional, full);
  });

  it('refuses a hybrid against a conventional run and against a full destination-dispatch run', () => {
    refused(lobby, conventional);
    refused(lobby, full);
  });

  it('refuses a hybrid against a hybrid whose panels are on other landings', () => {
    refused(lobby, twoLobbies);
  });

  it('permits a hybrid against a hybrid whose landings agree with it landing for landing', () => {
    // Different call types and different dispatchers; the same landings name cars. Each passenger
    // is measured in the same construct in both runs, so the nine keep their meaning.
    permitted(lobby, lobbyAgain);
  });

  it('never keeps TTD out of a pairing', () => {
    for (const [a, b] of [
      [lobby, conventional],
      [lobby, full],
      [lobby, twoLobbies],
      [conventional, full],
    ] as const) {
      expect(comparabilityBetween(a, b).comparableMetrics).toContain('ttdMeanS');
    }
  });
});

describe('the disclaimer a hybrid run carries', () => {
  it('names the assigning landings, the nine, and what they may not be paired against', () => {
    const text = comparabilityDisclaimer('hybrid', ['G', 'P1']);
    expect(text).toBeDefined();
    expect(text).toContain('hybrid');
    expect(text).toContain('"G", "P1"');
    for (const id of MODEL_SENSITIVE_METRIC_IDS) expect(text).toContain(id);
    expect(text).toContain('ttdMeanS');
    expect(text).toContain('§ D553');
  });

  it('leaves the two uniform disclaimers exactly as they were', () => {
    expect(comparabilityDisclaimer('conventional')).toBeUndefined();
    expect(comparabilityDisclaimer('destination-dispatch', undefined)).toBe(
      comparabilityDisclaimer('destination-dispatch'),
    );
  });
});
