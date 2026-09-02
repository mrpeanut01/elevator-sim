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

import type { DispatcherProfile } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import {
  interventionLogOf,
  interventionStampOf,
  PARK_CARS_LOBBY_LABEL,
  RECOMPUTING_BEAT,
  switchChangesNothing,
  SWITCH_PINS_NOTE,
  switchDispatcherLabelOf,
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
