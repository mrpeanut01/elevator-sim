import { describe, expect, it } from 'vitest';

import {
  NORMALIZATION_DEFAULTS,
  boundedNormalize,
  normalizeTerm,
  resolveNormalization,
  saturatingNormalize,
} from './normalize.js';
import { COST_TERMS } from './terms/index.js';
import { DispatchError, type CostTermDefinition, type ResolvedNormalization } from './types.js';

/* -------------------------------------------------------------------------- *
 * The saturating map
 * -------------------------------------------------------------------------- */

describe('saturatingNormalize', () => {
  it('lands in [0, 1) for every non-negative input, however large', () => {
    for (const raw of [0, 0.001, 1, 10, 60, 120, 600, 3600, 1e6, 1e12]) {
      const value = saturatingNormalize(raw, 60);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('puts the reference scale at exactly the half-cost point', () => {
    expect(saturatingNormalize(60, 60)).toBeCloseTo(0.5, 12);
    expect(saturatingNormalize(30, 30)).toBeCloseTo(0.5, 12);
  });

  it('is strictly increasing everywhere, so ordering survives at any magnitude', () => {
    // The property a hard clamp would destroy: two cars 200 s and 400 s away are still
    // ranked, instead of both pinning at 1.0 exactly when the choice matters most.
    const samples = [0, 1, 5, 20, 60, 100, 200, 400, 1000, 5000];
    for (let i = 1; i < samples.length; i += 1) {
      const previous = samples[i - 1] as number;
      const current = samples[i] as number;
      expect(saturatingNormalize(current, 60)).toBeGreaterThan(saturatingNormalize(previous, 60));
    }
  });

  it('is near-linear for values well below the reference', () => {
    // x/(1+x) ≈ x for x << 1, so small differences behave the way an author expects.
    const scaled = saturatingNormalize(0.6, 60);
    expect(scaled).toBeCloseTo(0.01, 3);
  });

  it('maps an infinite raw value to 1 rather than NaN', () => {
    // Stage 2 filters infeasible cars, but a NaN would compare false against everything and
    // silently make an infeasible car the winner.
    expect(saturatingNormalize(Number.POSITIVE_INFINITY, 60)).toBe(1);
  });

  it('clamps a negative raw value to zero', () => {
    expect(saturatingNormalize(-5, 60)).toBe(0);
  });

  it('rejects a non-positive reference, which would delete the term', () => {
    expect(() => saturatingNormalize(1, 0)).toThrow(DispatchError);
    expect(() => saturatingNormalize(1, -1)).toThrow(DispatchError);
    expect(() => saturatingNormalize(1, Number.POSITIVE_INFINITY)).toThrow(DispatchError);
  });

  it('rejects NaN from a term', () => {
    expect(() => saturatingNormalize(Number.NaN, 60)).toThrow(DispatchError);
  });
});

/* -------------------------------------------------------------------------- *
 * The bounded map
 * -------------------------------------------------------------------------- */

describe('boundedNormalize', () => {
  it('is linear inside the range and clamps outside it', () => {
    expect(boundedNormalize(0, 2)).toBe(0);
    expect(boundedNormalize(1, 2)).toBe(0.5);
    expect(boundedNormalize(2, 2)).toBe(1);
    expect(boundedNormalize(3, 2)).toBe(1);
    expect(boundedNormalize(-1, 2)).toBe(0);
  });

  it('rejects a non-positive full scale', () => {
    expect(() => boundedNormalize(1, 0)).toThrow(DispatchError);
  });

  it('rejects NaN from a term', () => {
    expect(() => boundedNormalize(Number.NaN, 2)).toThrow(DispatchError);
  });
});

/* -------------------------------------------------------------------------- *
 * Comparability — the reason this module exists
 * -------------------------------------------------------------------------- */

describe('normalization keeps every term comparable', () => {
  const scales: ResolvedNormalization = resolveNormalization();

  it('maps every term into [0, 1] across its whole plausible raw range', () => {
    // CLAUDE.md: raw waitTime (0-120 s) and stopCount (0-20) on one scale make weights
    // uninterpretable. This is the assertion that they are not on one scale any more.
    const rawByUnit: Readonly<Record<string, readonly number[]>> = {
      s: [0, 1, 15, 30, 60, 120, 300, 1200],
      m: [0, 0.5, 4, 12, 30, 80, 200, 600],
      '': [0, 1, 2],
    };

    for (const term of COST_TERMS) {
      const raws = rawByUnit[term.unit];
      expect(raws, `no probe values for unit "${term.unit}"`).toBeDefined();
      for (const raw of raws ?? []) {
        const value = normalizeTerm(term, raw, scales);
        expect(value, `${term.id} at raw ${raw}`).toBeGreaterThanOrEqual(0);
        expect(value, `${term.id} at raw ${raw}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('puts a typical value of every term within an order of magnitude of every other', () => {
    // The operational form of "comparable": a 60 s wait, 30 m of extra travel and one
    // direction reversal are all mid-scale, so weights read as preferences rather than as
    // unit conversions. Raw, these three numbers span 60x.
    const typical = new Map<string, number>([
      ['waitTime', 60],
      ['distanceTravelled', 30],
      ['directionReversal', 1],
    ]);
    for (const term of COST_TERMS) {
      const raw = typical.get(term.id);
      expect(raw, `no typical value for ${term.id}`).toBeDefined();
      const value = normalizeTerm(term, raw ?? 0, scales);
      expect(value).toBeGreaterThan(0.1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonic per term, so a one-term weight vector is invariant to its reference scale', () => {
    // Why nearest-car picks the same car whatever `normalization.distanceM` is set to: the
    // map is monotonic, so it cannot reorder a single-term ranking. Phase 7 can therefore
    // tune the reference for the terms that trade against each other without accidentally
    // retuning the baselines.
    const near = 8;
    const far = 25;
    for (const reference of [5, 30, 200]) {
      const scaled: ResolvedNormalization = { waitTimeS: reference, distanceM: reference };
      for (const term of COST_TERMS) {
        expect(normalizeTerm(term, near, scaled)).toBeLessThanOrEqual(
          normalizeTerm(term, far, scaled),
        );
      }
    }
  });

  it('routes each term through the map it declares', () => {
    const saturating = COST_TERMS.filter((term) => term.normalization.mode === 'saturating');
    const bounded = COST_TERMS.filter((term) => term.normalization.mode === 'bounded');
    expect(saturating.map((term) => term.id)).toEqual(['waitTime', 'distanceTravelled']);
    expect(bounded.map((term) => term.id)).toEqual(['directionReversal']);

    // A bounded term reaches exactly 1 at its full scale; a saturating one never does.
    const reversal = bounded[0] as CostTermDefinition;
    expect(normalizeTerm(reversal, 2, scales)).toBe(1);
    const wait = saturating[0] as CostTermDefinition;
    expect(normalizeTerm(wait, 1e9, scales)).toBeLessThan(1);
  });
});

/* -------------------------------------------------------------------------- *
 * Resolution
 * -------------------------------------------------------------------------- */

describe('resolveNormalization', () => {
  it('applies the declared defaults', () => {
    expect(resolveNormalization()).toEqual(NORMALIZATION_DEFAULTS);
    expect(NORMALIZATION_DEFAULTS.waitTimeS).toBe(60);
    expect(NORMALIZATION_DEFAULTS.distanceM).toBe(30);
  });

  it('overrides one scale without disturbing the other', () => {
    const resolved = resolveNormalization({ distanceM: 12 });
    expect(resolved.distanceM).toBe(12);
    expect(resolved.waitTimeS).toBe(NORMALIZATION_DEFAULTS.waitTimeS);
  });

  it('rejects a non-positive scale eagerly', () => {
    expect(() => resolveNormalization({ waitTimeS: 0 })).toThrow(/normalization\.waitTimeS/);
    expect(() => resolveNormalization({ distanceM: -3 })).toThrow(/normalization\.distanceM/);
  });

  it('freezes what it returns', () => {
    expect(Object.isFrozen(resolveNormalization())).toBe(true);
  });
});
