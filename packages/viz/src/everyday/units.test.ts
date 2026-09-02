/**
 * **That the `Units` preference converts, and that the conversion cannot get out** — GitHub issue
 * #170's Units half, [§ D448](../../../../DECISIONS.md).
 *
 * ENGINE_CONTRACT § 13 makes two demands and they pull in opposite directions:
 *
 * > Metres by default; the `Units` setting switches machine specs to feet and **must convert, not
 * > relabel**.
 *
 * and `CLAUDE.md`'s conventions, which keep units SI internally and allow imperial values only in
 * reference data and display formatting, always with the unit in the identifier. So the figure a
 * player reads must *change* when they flip the preference, and every number the product stores,
 * submits or compares must not. This file asserts both, and the second is the one that matters:
 * a mislabelled figure is a copy defect, and a converted figure inside a run record is a run that
 * cannot be compared with anybody else's.
 *
 * **The relabel case is written from the other side of the arithmetic on purpose.** It divides by
 * `0.3048` itself rather than calling `speedFigure` twice, because a test that asked the module for
 * both halves of a comparison would pass for a module that had stopped converting entirely.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { everydayProfileStore } from './profileStore.js';
import { baseState, legsOf } from '../scope/probes.test-helper.js';
import {
  DEFAULT_EVERYDAY_UNITS,
  EVERYDAY_UNITS,
  isEverydayUnits,
  lengthFigure,
  speedFigure,
  speedRangeFigure,
  speedValueFigure,
  UNITS_ROW_COPY,
  type EverydayUnits,
} from './units.js';

/** The definition, restated here so the assertions do not read it off the module they check. */
const METRES_PER_FOOT = 0.3048;

/** Every rated speed `data/elevator-specs.json` ships a class for, and the two ends of the range. */
const SPEEDS: readonly number[] = [0.5, 0.63, 1.0, 1.75, 2.5, 3.0, 5.0, 8.0, 10.0];

describe('the conversion is a conversion', () => {
  it('prints metres by default and feet on request, with the number', () => {
    expect(speedFigure(2.5, 'metric')).toBe('2.50 m/s');
    expect(speedFigure(2.5, 'imperial')).toBe('8.20 ft/s');
    expect(lengthFigure(42, 'metric')).toBe('42.0 m');
    expect(lengthFigure(42, 'imperial')).toBe('137.8 ft');
    expect(speedRangeFigure(0.5, 1.0, 'metric')).toBe('0.50–1.00 m/s');
    expect(speedRangeFigure(0.5, 1.0, 'imperial')).toBe('1.64–3.28 ft/s');
    expect(lengthFigure(120, 'metric', 0)).toBe('120 m');
    expect(lengthFigure(120, 'imperial', 0)).toBe('394 ft');
  });

  /**
   * **§ 13's comma, on the arm that is the only one long enough to need it.**
   *
   * *Thousands separated with a comma.* No metric figure this module draws gets near four digits —
   * `data/elevator-specs.json`'s tallest class declares a 700 m rise — but the conversion makes it
   * `2,297 ft`, so a preference that lengthened a figure without grouping it would introduce the
   * one formatting defect § 13 names, on the arm nobody was reading. Both shipped classes past the
   * boundary are checked, and a metric figure below it is checked for the absence of a comma so
   * this cannot be satisfied by grouping everything.
   */
  it('groups thousands, which only the converted arm is long enough to need', () => {
    expect(lengthFigure(600, 'imperial', 0)).toBe('1,969 ft');
    expect(lengthFigure(700, 'imperial', 0)).toBe('2,297 ft');
    // The decimal place survives the grouping — the separator is the integer part's alone.
    expect(lengthFigure(350, 'imperial')).toBe('1,148.3 ft');
    expect(lengthFigure(700, 'metric', 0)).toBe('700 m');
    expect(lengthFigure(42, 'metric')).not.toContain(',');
  });

  /**
   * **The relabel test, which is the clause § 13 spells out.**
   *
   * A relabel keeps the digits and swaps the suffix — `2.50 m/s` becoming `2.50 ft/s` — and it is
   * the failure this clause exists to name, because it is the cheaper thing to write and it looks
   * right on screen. So the assertion is on the digits with the suffix stripped, over every rated
   * speed the shipped classes offer, and the expected value is computed here from the definition
   * rather than asked of the module.
   */
  it('moves the digits, not just the suffix — over every shipped rated speed', () => {
    for (const mps of SPEEDS) {
      const metric = speedFigure(mps, 'metric');
      const imperial = speedFigure(mps, 'imperial');
      const metricDigits = metric.replace(/ m\/s$/u, '');
      const imperialDigits = imperial.replace(/ ft\/s$/u, '');

      expect(metric, `${String(mps)} in metres`).toBe(`${mps.toFixed(2)} m/s`);
      expect(imperial, `${String(mps)} in feet`).toBe(
        `${(mps / METRES_PER_FOOT).toFixed(2)} ft/s`,
      );
      expect(imperialDigits, `${String(mps)} was relabelled rather than converted`).not.toBe(
        metricDigits,
      );
      // And in the right direction: a foot is smaller than a metre, so the figure grows.
      expect(Number(imperialDigits)).toBeGreaterThan(Number(metricDigits));
    }
  });

  it('round-trips back to the metre it came from, so no figure is quietly rescaled twice', () => {
    for (const mps of SPEEDS) {
      const feet = Number(speedFigure(mps, 'imperial').replace(/ ft\/s$/u, ''));
      expect(feet * METRES_PER_FOOT).toBeCloseTo(mps, 2);
    }
  });

  it('leaves zero alone in both preferences, which is the one value a relabel gets right', () => {
    /*
     * Recorded rather than skipped. `0.00` is identical under both, so a building with no car — the
     * `EM_DASH` branch upstream — could never distinguish a conversion from a relabel, and a test
     * that swept a value set including zero without saying this would have a hole in it.
     */
    expect(speedFigure(0, 'metric')).toBe('0.00 m/s');
    expect(speedFigure(0, 'imperial')).toBe('0.00 ft/s');
  });
});

describe('the preference itself', () => {
  it('is metres by default — § 13’s own word, in one place', () => {
    expect(DEFAULT_EVERYDAY_UNITS).toBe('metric');
    expect(EVERYDAY_UNITS).toEqual(['metric', 'imperial']);
    expect(EVERYDAY_UNITS).toContain(DEFAULT_EVERYDAY_UNITS);
  });

  it('refuses a value this build does not know rather than coercing it', () => {
    for (const known of EVERYDAY_UNITS) expect(isEverydayUnits(known)).toBe(true);
    for (const unknown of ['feet', 'metres', 'IMPERIAL', '', 0, 1, null, undefined, {}, []]) {
      expect(isEverydayUnits(unknown), JSON.stringify(unknown)).toBe(false);
    }
  });

  it('gives the row a face for each preference and a note that names its scope', () => {
    for (const units of EVERYDAY_UNITS) {
      expect(UNITS_ROW_COPY.face[units].length).toBeGreaterThan(3);
    }
    expect(UNITS_ROW_COPY.face.metric).not.toBe(UNITS_ROW_COPY.face.imperial);
    /*
     * The note is a claim about what the control reaches, so it says *machine specifications*
     * rather than *figures*: the daily loop's waits, the campaign's money and the fix screen's
     * priced steps are all untouched, and a note promising every figure would be § D227's stale
     * claim written on the day the control shipped.
     */
    expect(UNITS_ROW_COPY.note).toContain('machine specification');
    expect(UNITS_ROW_COPY.note).not.toMatch(/every|all figures/iu);
  });
});

/* -------------------------------------------------------------------------- *
 * The correctness bite — a converted number may not reach a stored figure
 * -------------------------------------------------------------------------- */

describe('the conversion cannot leave the display layer', () => {
  /**
   * **The structural half: no export hands a caller a converted number.**
   *
   * `feetOf` is module-private, so there is no signature through which a converted quantity can be
   * assigned to a field — and this case is what keeps that true as the module grows. It walks the
   * whole export surface rather than a written list, so an export added later is covered on the
   * commit that adds it rather than whenever somebody remembers this file.
   */
  it('returns a string from every entry point that touches the conversion', async () => {
    const module: Record<string, unknown> = await import('./units.js');
    const functions = Object.entries(module).filter(
      ([, value]) => typeof value === 'function',
    ) as readonly (readonly [string, (...args: readonly unknown[]) => unknown])[];
    expect(functions.length).toBeGreaterThan(0);

    for (const [name, fn] of functions) {
      /*
       * `isEverydayUnits` is the one export that is a predicate rather than a formatter, and it
       * takes no quantity — it is excluded by name because excluding it by shape would mean
       * excluding every boolean, which is the thing being asserted about everything else.
       */
      if (name === 'isEverydayUnits') continue;
      /*
       * The argument list is derived from the arity rather than written per function, so an export
       * added later is exercised without this case being edited. Every formatter here takes some
       * number of quantities, then the preference, then an optional precision — `fn.length` counts
       * the parameters before the first default, so the preference is always the last of them.
       */
      for (const units of EVERYDAY_UNITS) {
        const args = [...Array.from({ length: fn.length - 1 }, () => 2.5), units];
        const answer = fn(...args);
        expect(typeof answer, `${name} under ${units}`).toBe('string');
      }
    }
  });

  /**
   * **The run half: flipping the preference does not move a single leg.**
   *
   * This is `docs/05`'s standing requirement in its contrapositive, and it is the shape #258 states
   * for a presentation control: *a presentation control must reach a sink and must not reach the
   * legs*. Legs rather than a window statistic, for § D177's reason — a mean can be unchanged for a
   * run that is entirely different, and a mean can move because the window moved.
   *
   * It flips the **shipped singleton**, not a local store, because that is what a leak would have
   * to read. A future `shiftRunConfigOf` that consulted the preference — to pick a speed, to round
   * a rise, to seed anything — would redden this case, and nothing else in the suite would.
   */
  it('leaves the legs byte-identical either side of the preference', () => {
    const store = everydayProfileStore();
    const before = store.units();
    try {
      store.setUnits('metric');
      const metres = legsOf(baseState());
      store.setUnits('imperial');
      const feet = legsOf(baseState());

      expect(metres.length).toBeGreaterThan(100);
      expect(feet).toBe(metres);
    } finally {
      store.setUnits(before);
    }
  });

  /**
   * **The storage half: what is persisted is the preference, never a figure taken under it.**
   *
   * The envelope holds one of two string literals. There is no number in it that the preference can
   * move, which is the whole reason the preference is a sibling of `profile` rather than a field on
   * it: identity travels with a posted run, and a display preference folded into identity would
   * ride along with a submission and be compared against runs taken under the other one.
   */
  it('stores the preference as a word, so no stored figure can carry a unit', () => {
    const store = everydayProfileStore();
    const before = store.units();
    try {
      for (const units of EVERYDAY_UNITS) {
        store.setUnits(units);
        expect(typeof store.units()).toBe('string');
        expect(EVERYDAY_UNITS).toContain(store.units());
        expect(Number.isNaN(Number(store.units()))).toBe(true);
      }
    } finally {
      store.setUnits(before);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The scope claim, asserted rather than described
 * -------------------------------------------------------------------------- */

/**
 * Everyday files allowed to write a bare `m/s` of their own, and why each one is not a spec.
 *
 * The module docstring says what the preference reaches and what it does not, and a prose list is
 * exactly the kind of claim this repository has watched go stale — so it is checked. A new bare
 * `m/s` in `everyday/` either goes through `units.ts` or arrives here with its reason, which is the
 * moment to decide whether it is a machine specification or something else wearing the same unit.
 */
const BARE_SPEED_UNIT_ALLOWED: ReadonlyMap<string, string> = new Map([
  ['units.ts', 'the suffix table itself — this is where the string is allowed to be written'],
  [
    'fixitScreenModel.ts',
    'a priced repair step (`+0.5 m/s`), quoted in the unit § 9 prices it in rather than read off a machine',
  ],
]);

describe('what the preference reaches is a list, and the list is checked', () => {
  it('lets no Everyday surface print a speed the preference cannot reach', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const offenders: string[] = [];

    for (const name of readdirSync(here)) {
      if (!name.endsWith('.ts') || name.endsWith('.test.ts')) continue;
      if (BARE_SPEED_UNIT_ALLOWED.has(name)) continue;
      const source = readFileSync(join(here, name), 'utf8');
      for (const [index, line] of source.split('\n').entries()) {
        /*
         * Template and quoted literals only, and never a comment: a docstring saying the words
         * *m/s* is prose about the rule, and matching it would make this case a grep for its own
         * subject. The pattern wants a **printed** suffix, which in this tree is always a template
         * literal or a quoted string.
         */
        const trimmed = line.trim();
        if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
        if (!/(?:`|')[^`']*m\/s/u.test(line)) continue;
        offenders.push(`${name}:${String(index + 1)}  ${trimmed.slice(0, 90)}`);
      }
    }

    expect(
      offenders,
      'an Everyday surface prints a rated speed without going through `units.ts`, so a player who ' +
        'asked for feet meets metres on it. Draw it with `speedFigure`, or add the file to ' +
        'BARE_SPEED_UNIT_ALLOWED with the reason it is not a machine specification.',
    ).toEqual([]);
  });

  it('keeps no allowance for a file that stopped needing one', () => {
    // § D227 in the direction that bites after a lane lands, applied to this file's own register.
    const here = dirname(fileURLToPath(import.meta.url));
    for (const [name] of BARE_SPEED_UNIT_ALLOWED) {
      const source = readFileSync(join(here, name), 'utf8');
      expect(
        source.split('\n').some((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('*') || trimmed.startsWith('//')) return false;
          return /(?:`|')[^`']*m\/s/u.test(line);
        }),
        `${name} is allowed a bare m/s and no longer prints one — delete its row`,
      ).toBe(true);
    }
  });
});

/* A compile-time reading of the type, so the union cannot quietly gain a third member. */
const _units: readonly EverydayUnits[] = EVERYDAY_UNITS;
void _units;
