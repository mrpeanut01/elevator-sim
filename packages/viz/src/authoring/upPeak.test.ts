/**
 * The designer's sizing block is the correctness oracle's closed form, not a re-derivation of it.
 *
 * Three claims decide slice 6's cheap half, and each has its own section below:
 *
 * 1. **Same code.** A shipped building opened untouched in the editor must produce, through
 *    `upPeakAnalysisOf`, exactly the figures `analyzeUpPeak` produces on the directly loaded
 *    document — bit-equal, because the untouched round trip is lossless and the arithmetic is one
 *    body. A tolerance here would be room for a second formula to hide in.
 * 2. **The control moves the figure.** This repository has shipped a configurable, unit-tested,
 *    never-consulted behaviour eleven times, and a figures panel that ignored the sliders would be
 *    the twelfth wearing numbers. Cars and speed are the two controls the work order names, and
 *    both are required to move the *printed* line, not just an internal field.
 * 3. **A refusal is labelled and complete.** A spec the loader refuses, and a bank the closed form
 *    cannot model, must produce a sentence — never `NaN`, never a stale figure beside it.
 *
 * The warnings get their own sections: every stable code has a sentence arm (asserted against the
 * source, the way `dev/scopeNotes.test.ts` pins a label to the module that authors it), and no
 * sentence the shipped buildings can produce contains a probability word — R10, checked with the
 * shipped `probabilityWordIn` rather than a local word list.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  UP_PEAK_WARNING_CODES,
  analyzeUpPeak,
  parseBuilding,
  parseElevatorSpecs,
  resolveBuilding,
  type BuildingConfig,
  type ElevatorSpecs,
} from '@elevator-sim/core/browser';

import { probabilityWordIn } from '../campaign/words.js';
import { BUILDING_IDS, DATA_DIR } from '../fixtures.test-helper.js';

import {
  BLANK_SPEC,
  buildingAdvice,
  specFromBuilding,
  upPeakAnalysisOf,
  type BuildingSpec,
  type SpecUpPeakAnalysis,
} from './buildingSpec.js';

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const SPECS: ElevatorSpecs = parseElevatorSpecs(read(join(DATA_DIR, 'elevator-specs.json')));

const buildingConfig = (id: string): BuildingConfig =>
  parseBuilding(read(join(DATA_DIR, 'buildings', `${id}.json`)));

const TOWER: BuildingSpec = { ...BLANK_SPEC, floors: 12, cars: 4, capacityPerFloor: 100 };

/** Shapes a reader must never be shown — `shippedBuildings.test.ts`'s own list. */
const UNREADABLE = /\[object Object\]|NaN|undefined/;

/** Every string the block can draw, flattened, so a sweep cannot miss a field. */
function stringsOf(analysis: SpecUpPeakAnalysis): readonly string[] {
  const out: string[] = [analysis.refusal];
  for (const bank of analysis.banks) {
    out.push(bank.refusal, bank.line, bank.reading, ...bank.warnings);
  }
  return out.filter((text) => text !== '');
}

/* ========================================================================== *
 * 1 — the same code the oracle uses
 * ========================================================================== */

describe('the figures are analyzeUpPeak’s, through the editor’s own save path', () => {
  it('reproduces the direct analysis bit for bit on an untouched midtown-office', () => {
    const config = buildingConfig('midtown-office');
    const direct = analyzeUpPeak(resolveBuilding(config, SPECS), SPECS);

    const sized = upPeakAnalysisOf(specFromBuilding(config, 'midtown-office'), SPECS);
    expect(sized.refusal).toBe('');
    expect(sized.banks).toHaveLength(1);
    const bank = sized.banks[0];
    expect(bank?.refusal).toBe('');
    expect(bank?.figures).toBeDefined();
    /*
     * `toBe`, not `toBeCloseTo`. The untouched round trip writes the carried banks and floors back
     * verbatim, so the resolved building is the same building and the closed form must return the
     * same doubles. A tolerance would be the gap a second formula could live in.
     */
    expect(bank?.figures?.roundTripTimeS).toBe(direct.result.roundTripTimeS);
    expect(bank?.figures?.intervalS).toBe(direct.result.intervalS);
    expect(bank?.figures?.handlingCapacity5Min).toBe(direct.result.handlingCapacity5Min);
    expect(bank?.figures?.percentPopulation5Min).toBe(direct.result.percentPopulation5Min);
    expect(bank?.figures?.servedPopulation).toBe(direct.servedPopulation);
  });

  it('carries every divergence the analysis records, one sentence per warning', () => {
    const config = buildingConfig('midtown-office');
    const direct = analyzeUpPeak(resolveBuilding(config, SPECS), SPECS);
    // The building this criterion names trips the model: two entrances, at least.
    expect(direct.warnings.length).toBeGreaterThan(0);

    const bank = upPeakAnalysisOf(specFromBuilding(config, 'midtown-office'), SPECS).banks[0];
    expect(bank?.warnings).toHaveLength(direct.warnings.length);
    // The second entrance is the one the work order names — say it in the reader's words.
    expect(bank?.warnings.join(' ')).toContain('entrance');
  });

  it('prints the figures line and a computed reading, and the blank tower gets both too', () => {
    const sized = upPeakAnalysisOf(TOWER, SPECS);
    const bank = sized.banks[0];
    expect(bank?.line).toContain('round trip');
    expect(bank?.line).toContain('interval');
    expect(bank?.line).toContain('% of the');
    // A 12-storey tower of geared traction is stop-dominated, and now that is computed, not asserted.
    expect(bank?.reading).toContain('dominated by stops and door time');
    /*
     * The blank tower saturates its stops by design — P = 12.8 over N = 12 — and the block must say
     * so beside the figure rather than leave a load-insensitive round trip looking tunable.
     */
    expect(bank?.warnings.join(' ')).toContain('stopped responding to load');
  });

  it('buildingAdvice no longer makes the dominance claim it never computed', () => {
    /*
     * Its third arm returned "will be dominated by stops and door time" unconditionally — a stated
     * mechanism with no measurement, which the computed reading beside the figures now owns. The
     * two heuristic arms stay; the uncomputed sentence must not come back.
     */
    expect(buildingAdvice(TOWER)).toBe('');
    expect(buildingAdvice({ ...TOWER, capacityPerFloor: 200, occupancyPct: 120 })).toContain(
      'people per shaft',
    );
  });
});

/* ========================================================================== *
 * 2 — move the control, require the printed figure to change
 * ========================================================================== */

describe('the moved-control requirement, on the printed line', () => {
  const lineOf = (spec: BuildingSpec): string => {
    const bank = upPeakAnalysisOf(spec, SPECS).banks[0];
    expect(bank?.refusal).toBe('');
    return bank?.line ?? '';
  };

  it('adding cars moves the printed interval and leaves the round trip alone', () => {
    const four = upPeakAnalysisOf(TOWER, SPECS).banks[0];
    const eight = upPeakAnalysisOf({ ...TOWER, cars: 8 }, SPECS).banks[0];
    /*
     * `toBeCloseTo` here where the untouched round trip above demands `toBe`, and the digit of
     * slack is explained rather than waved at: the derivation averages door and speed terms over
     * the bank's cars, and a mean of eight identical doubles accumulates differently in the last
     * ulp than a mean of four. RTT is independent of L in the formula; the 1e-13 wobble is the
     * summation order, not a second formula.
     */
    expect(eight?.figures?.roundTripTimeS).toBeCloseTo(four?.figures?.roundTripTimeS ?? 0, 9);
    // INT = RTT / L: doubling the group halves the interval exactly.
    expect(eight?.figures?.intervalS).toBeCloseTo((four?.figures?.intervalS ?? 0) / 2, 9);
    expect(eight?.line).not.toBe(four?.line);
  });

  it('changing rated speed moves the printed line through the round trip', () => {
    const fast = lineOf(TOWER);
    const slow = lineOf({ ...TOWER, ratedSpeedMps: 1.0 });
    expect(slow).not.toBe(fast);
    const fastRtt = upPeakAnalysisOf(TOWER, SPECS).banks[0]?.figures?.roundTripTimeS ?? 0;
    const slowRtt =
      upPeakAnalysisOf({ ...TOWER, ratedSpeedMps: 1.0 }, SPECS).banks[0]?.figures?.roundTripTimeS ?? 0;
    expect(slowRtt).toBeGreaterThan(fastRtt);
  });

  it('a sky lobby deals two banks and each gets its own named line', () => {
    const sized = upPeakAnalysisOf({ ...TOWER, floors: 40, skyFloors: [20] }, SPECS);
    expect(sized.banks).toHaveLength(2);
    for (const bank of sized.banks) {
      expect(bank.refusal).toBe('');
      expect(bank.line).toMatch(/^Bank /);
      expect(bank.reading).not.toBe('');
    }
    // The upper bank runs express below its zone; the tx term must be said, not silently added.
    expect(sized.banks.map((bank) => bank.warnings.join(' ')).join(' ')).toContain('express');
  });
});

/* ========================================================================== *
 * 3 — refusals: labelled, complete, and never NaN
 * ========================================================================== */

describe('the unbuildable and the unanalysable', () => {
  it('a spec the loader refuses gets one labelled refusal and no figures at all', () => {
    const sized = upPeakAnalysisOf({ ...TOWER, specClass: 'no-such-class' }, SPECS);
    expect(sized.refusal).toContain('loader refuses');
    expect(sized.banks).toHaveLength(0);
    expect(JSON.stringify(sized)).not.toMatch(/NaN/);
  });

  it('a bank whose destinations hold nobody is refused by name while its neighbour is sized', () => {
    /*
     * Exactly the state a reader reaches by zeroing a band's floors: the closed form has no
     * up-peak to analyse there (`noServedPopulation`), and the other bank still deserves its
     * figures. The refused bank keeps no line and no figures — a stale number beside a refusal is
     * the defect the work order names.
     */
    const emptied: BuildingSpec = {
      ...TOWER,
      cars: 2,
      bandByCar: { 1: [6, 12] },
      occupancyByFloor: { 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 },
    };
    const sized = upPeakAnalysisOf(emptied, SPECS);
    expect(sized.refusal).toBe('');
    expect(sized.banks).toHaveLength(2);
    const refused = sized.banks.filter((bank) => bank.refusal !== '');
    const figured = sized.banks.filter((bank) => bank.refusal === '');
    expect(refused).toHaveLength(1);
    expect(figured).toHaveLength(1);
    expect(refused[0]?.refusal).toContain('closed form refuses');
    expect(refused[0]?.figures).toBeUndefined();
    expect(refused[0]?.line).toBe('');
    expect(refused[0]?.reading).toBe('');
    expect(figured[0]?.figures).toBeDefined();
    expect(JSON.stringify(sized)).not.toMatch(/NaN/);
  });

  it('sizes every bank of the mixed-use tower from its cars’ own transfer times', () => {
    /*
     * `elevator-specs.json → timing.passengerTransferS` has no `mixed-use` row on purpose, so the
     * closed form's default refuses every bank of this building with a RangeError — while the
     * reference data states the answer per car. The oracle driver's rule
     * (`experiments/src/oracle/upPeakCase.ts#passengerTransferForBank`) reads the cars; this pins
     * that `upPeakAnalysisOf` applies the same rule rather than showing three refusals about a
     * table.
     */
    const config = buildingConfig('mixed-use-high-rise');
    const sized = upPeakAnalysisOf(specFromBuilding(config, 'mixed-use-high-rise'), SPECS);
    expect(sized.refusal).toBe('');
    expect(sized.banks.length).toBeGreaterThan(1);
    for (const bank of sized.banks) {
      expect(bank.refusal, bank.bankId).toBe('');
      expect(bank.figures, bank.bankId).toBeDefined();
    }
    /*
     * The shuttle's destination is a transfer floor, so its percentage is measured against a
     * population it does not lift — the two warnings that catch that from both sides must reach
     * the reader in the reader's register.
     */
    const joined = sized.banks.map((bank) => bank.warnings.join(' ')).join(' ');
    expect(joined).toContain('not the population this bank lifts');
    expect(joined).toContain('sanity bound');
  });
});

/* ========================================================================== *
 * The warning sentences — every code has an arm, and none says a probability word
 * ========================================================================== */

describe('the re-voiced warnings', () => {
  it('has a sentence arm for every stable code the analysis can raise', () => {
    /*
     * Pinned against the source the way `scopeNotes.test.ts` pins a label to the module that
     * authors it: `warningSentenceOf` switches on `UP_PEAK_WARNING_CODES.<code>` case labels, so
     * a code added in core without a sentence here is a failing test rather than a reader meeting
     * the fallback. The fallback stays for the string-typed field, and names the code.
     */
    const source = readFileSync(fileURLToPath(new URL('./buildingSpec.ts', import.meta.url)), 'utf8');
    for (const code of Object.keys(UP_PEAK_WARNING_CODES)) {
      expect(source, code).toContain(`UP_PEAK_WARNING_CODES.${code}`);
    }
  });

  it('never shows a probability word or an unreadable shape, on any shipped building or the blank', () => {
    /*
     * R10 with the shipped word list (`campaign/words.ts`), not a local copy — the reason this
     * module re-voices core's messages at all is that one of them says "almost certainly", so the
     * sweep that guards the re-voicing must be the same guard that would have caught the original.
     */
    const specs: BuildingSpec[] = [
      { ...BLANK_SPEC },
      ...BUILDING_IDS.map((id) => specFromBuilding(buildingConfig(id), id)),
    ];
    let warnings = 0;
    for (const spec of specs) {
      for (const text of stringsOf(upPeakAnalysisOf(spec, SPECS))) {
        expect(probabilityWordIn(text), `${spec.id}: ${text}`).toBeNull();
        expect(text, spec.id).not.toMatch(UNREADABLE);
      }
      warnings += upPeakAnalysisOf(spec, SPECS).banks.reduce(
        (total, bank) => total + bank.warnings.length,
        0,
      );
    }
    // The sweep must have swept something: the shipped buildings trip the model by design.
    expect(warnings).toBeGreaterThan(5);
  });
});
