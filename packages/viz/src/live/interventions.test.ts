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

import { describe, expect, it } from 'vitest';

import { interventionLogOf, interventionStampOf, PARK_CARS_LOBBY_LABEL } from './interventions.js';

// 09:14 under the shared 06:00 day start: 3 h 14 min into the run.
const AT_0914 = 3 * 3600 + 14 * 60;
const PARK = { kind: 'park-cars-lobby' } as const;

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
    // One arm today; a second change kind must extend both sentences together.
    expect(PARK_CARS_LOBBY_LABEL).toBe('Park the cars in the lobby');
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

  it('prints nothing for an empty log — no placeholder line', () => {
    expect(interventionLogOf([])).toEqual([]);
  });

  it('reads the run’s own hour, exactly as the stamp does', () => {
    expect(interventionLogOf([{ atS: 0, change: PARK }], 8 * 3600)).toEqual([
      '08:00 · parked the cars in the lobby',
    ]);
  });
});
