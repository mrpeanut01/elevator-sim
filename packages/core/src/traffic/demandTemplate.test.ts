/**
 * Demand template geometry.
 *
 * Two things are being protected here. The obvious one is arithmetic: the reported window
 * must be the peak five minutes and must sit at full intensity, or every headline statistic
 * describes a slice of a ramp instead of the peak. The less obvious one is the `recommended`
 * flag, which is carried onto the trace so a downstream analysis can refuse to build a
 * confidence interval across replications of a template that does not support one — see
 * docs/03-traffic-and-statistics.md § The independence condition.
 */

import { describe, expect, it } from 'vitest';

import type { DemandTemplate } from '../config/types.js';

import {
  constantDemandTemplate,
  expectedPassengers,
  inReportWindow,
  integratedIntensityS,
  intensityAt,
  resolveDemandTemplate,
  riseAndFallTemplate,
} from './demandTemplate.js';
import { TrafficError } from './types.js';

describe('rise-and-fall (CIBSE) template', () => {
  const template = riseAndFallTemplate();

  it('is a 30 minute run reported over its peak 5 minutes', () => {
    expect(template.durationS).toBe(1800);
    expect(template.reportWindowEndS - template.reportWindowStartS).toBe(300);
    expect(template.recommended).toBe(true);
  });

  it('centres the reported window, so it is the peak and not part of a ramp', () => {
    expect(template.reportWindowStartS).toBe(750);
    expect(template.reportWindowEndS).toBe(1050);
    expect(template.durationS - template.reportWindowEndS).toBe(template.reportWindowStartS);
  });

  it('holds full intensity across the whole reported window', () => {
    for (const t of [750, 800, 900, 1049.9, 1050]) {
      expect(intensityAt(template, t)).toBeCloseTo(1, 12);
    }
  });

  it('ramps linearly from nothing and back to nothing', () => {
    expect(intensityAt(template, 0)).toBeCloseTo(0, 12);
    expect(intensityAt(template, 375)).toBeCloseTo(0.5, 12);
    expect(intensityAt(template, 1425)).toBeCloseTo(0.5, 12);
    expect(intensityAt(template, 1800)).toBeCloseTo(0, 12);
  });

  it('has intensity zero outside the run', () => {
    expect(intensityAt(template, -1)).toBe(0);
    expect(intensityAt(template, 1801)).toBe(0);
  });

  it('integrates to ramp + hold + ramp', () => {
    // Two triangles of base 750 and height 1, plus a 300 s rectangle.
    expect(template.intensityIntegralS).toBeCloseTo(750 + 300, 9);
    expect(integratedIntensityS(template)).toBeCloseTo(1050, 9);
    expect(integratedIntensityS(template, 750, 1050)).toBeCloseTo(300, 9);
  });

  it('turns a peak rate into the expected passenger counts', () => {
    // Midtown Office under office-standard: 0.684 passengers/s at peak.
    expect(expectedPassengers(template, 0.684, 750, 1050)).toBeCloseTo(205.2, 9);
    expect(expectedPassengers(template, 0.684)).toBeCloseTo(0.684 * 1050, 9);
  });

  it('honours a non-zero baseline', () => {
    const warm = riseAndFallTemplate({ baselineFraction: 0.25 });
    expect(intensityAt(warm, 0)).toBeCloseTo(0.25, 12);
    expect(intensityAt(warm, 375)).toBeCloseTo(0.625, 12);
    expect(warm.intensityIntegralS).toBeCloseTo(((0.25 + 1) / 2) * 750 * 2 + 300, 9);
  });

  it('honours an explicit duration and hold', () => {
    const short = riseAndFallTemplate({ durationS: 900, peakWindowS: 100 });
    expect(short.reportWindowStartS).toBe(400);
    expect(short.reportWindowEndS).toBe(500);
    expect(short.peakIntensity).toBe(1);
  });

  it('collapses to a flat run when the hold fills the duration', () => {
    const flat = riseAndFallTemplate({ durationS: 300, peakWindowS: 300 });
    expect(flat.phases).toHaveLength(1);
    expect(intensityAt(flat, 0)).toBe(1);
    expect(flat.intensityIntegralS).toBeCloseTo(300, 9);
  });

  it('rejects a hold longer than the run, and a baseline outside [0, 1]', () => {
    expect(() => riseAndFallTemplate({ durationS: 300, peakWindowS: 600 })).toThrow(TrafficError);
    expect(() => riseAndFallTemplate({ baselineFraction: 1.5 })).toThrow(TrafficError);
    expect(() => riseAndFallTemplate({ durationS: 0 })).toThrow(TrafficError);
  });
});

describe('constant (ISO 8100-32) template', () => {
  const template = constantDemandTemplate();

  it('is a 120 minute run discarding 15 minutes of warm-up and 5 of cool-down', () => {
    expect(template.durationS).toBe(7200);
    expect(template.reportWindowStartS).toBe(900);
    expect(template.reportWindowEndS).toBe(6900);
  });

  it('is flagged not recommended, so no analysis builds a CI across its replications', () => {
    expect(template.recommended).toBe(false);
  });

  it('holds a steady intensity for the whole run', () => {
    for (const t of [0, 900, 3600, 6900, 7200]) expect(intensityAt(template, t)).toBe(1);
    expect(template.intensityIntegralS).toBe(7200);
    expect(integratedIntensityS(template, 900, 6900)).toBe(6000);
  });

  it('rejects discards that leave no measurement window', () => {
    expect(() =>
      constantDemandTemplate({ durationS: 600, discardFirstS: 400, discardLastS: 300 }),
    ).toThrow(TrafficError);
  });
});

describe('the reported window predicate', () => {
  const template = riseAndFallTemplate();

  it('is half open, so a passenger is counted in exactly one window', () => {
    expect(inReportWindow(template, 749.999)).toBe(false);
    expect(inReportWindow(template, 750)).toBe(true);
    expect(inReportWindow(template, 1049.999)).toBe(true);
    expect(inReportWindow(template, 1050)).toBe(false);
  });
});

describe('resolution from data/traffic-profiles.json', () => {
  const riseRecord: DemandTemplate = {
    id: 'rise-and-fall',
    name: 'CIBSE rise-and-fall template',
    recommended: true,
    durationMin: 30,
    reportWindow: 'peak-5min',
    shape: 'ramp up to peak, hold, ramp down',
  };
  const constantRecord: DemandTemplate = {
    id: 'constant-iso',
    name: 'ISO 8100-32 constant demand',
    recommended: false,
    durationMin: 120,
    discardFirstMin: 15,
    discardLastMin: 5,
  };

  it('takes its numbers from the record and its shape from the module', () => {
    const rise = resolveDemandTemplate(riseRecord);
    expect(rise.name).toBe('CIBSE rise-and-fall template');
    expect(rise.durationS).toBe(1800);
    expect(rise.reportWindowStartS).toBe(750);

    const constant = resolveDemandTemplate(constantRecord);
    expect(constant.durationS).toBe(7200);
    expect(constant.reportWindowStartS).toBe(900);
    expect(constant.reportWindowEndS).toBe(6900);
  });

  it('scales the geometry with the declared duration rather than hardcoding 1800', () => {
    const longer = resolveDemandTemplate({ ...riseRecord, durationMin: 60 });
    expect(longer.durationS).toBe(3600);
    // The reported window stays five minutes; the ramps absorb the extra time.
    expect(longer.reportWindowEndS - longer.reportWindowStartS).toBe(300);
    expect(longer.reportWindowStartS).toBe(1650);
  });

  it('looks an id up in the supplied records', () => {
    const resolved = resolveDemandTemplate('constant-iso', [riseRecord, constantRecord]);
    expect(resolved.id).toBe('constant-iso');
    expect(resolved.durationS).toBe(7200);
  });

  it('falls back to documented defaults when an id has no record', () => {
    expect(resolveDemandTemplate('rise-and-fall').durationS).toBe(1800);
    expect(resolveDemandTemplate('constant-iso', []).durationS).toBe(7200);
  });

  it('passes an already-resolved template straight through', () => {
    const template = riseAndFallTemplate({ durationS: 1200 });
    expect(resolveDemandTemplate(template)).toBe(template);
  });

  it('lets an override beat the record, for every number of both shapes', () => {
    // Without this path `traffic.riseAndFall.peakWindowS` and `.baselineFraction` are declared
    // tunables no configuration can reach: `fromRecord` hardcoded the first and ignored the
    // second, so an optimizer that wrote either got a run at the default and was told nothing.
    const rise = resolveDemandTemplate('rise-and-fall', [riseRecord, constantRecord], {
      durationS: 1200,
      peakWindowS: 400,
      baselineFraction: 0.2,
    });
    expect(rise.durationS).toBe(1200);
    expect(rise.reportWindowEndS - rise.reportWindowStartS).toBe(400);
    expect(intensityAt(rise, 0)).toBeCloseTo(0.2, 12);
    // Identity preserved: it is still the record's template, with different geometry.
    expect(rise.id).toBe('rise-and-fall');
    expect(rise.name).toBe('CIBSE rise-and-fall template');

    const constant = resolveDemandTemplate('constant-iso', [riseRecord, constantRecord], {
      durationS: 3600,
      discardFirstS: 600,
      discardLastS: 120,
    });
    expect(constant.durationS).toBe(3600);
    expect(constant.reportWindowStartS).toBe(600);
    expect(constant.reportWindowEndS).toBe(3480);
  });

  it('leaves every unset override on the record value', () => {
    const rise = resolveDemandTemplate('rise-and-fall', [riseRecord], { peakWindowS: 600 });
    expect(rise.durationS).toBe(1800);
    expect(rise.reportWindowStartS).toBe(600);
    expect(intensityAt(rise, 0)).toBe(0);
    const constant = resolveDemandTemplate('constant-iso', [constantRecord], { durationS: 3600 });
    expect(constant.reportWindowStartS).toBe(900);
    expect(constant.reportWindowEndS).toBe(3300);
  });

  it('applies overrides to a bare id with no record behind it', () => {
    expect(resolveDemandTemplate('rise-and-fall', [], { durationS: 900 }).durationS).toBe(900);
    expect(
      resolveDemandTemplate('constant-iso', undefined, { discardLastS: 60 }).reportWindowEndS,
    ).toBe(7140);
  });

  it('still validates the record even when an override replaces its duration', () => {
    // A nonsense duration in the data is a data error whether or not this run overrode it.
    expect(() =>
      resolveDemandTemplate({ ...riseRecord, durationMin: 0 }, undefined, { durationS: 1200 }),
    ).toThrow(TrafficError);
  });

  it('refuses overrides on an already-resolved template rather than ignoring them', () => {
    // The failure this prevents is silent: a caller passes both, the overrides do nothing, and
    // the run is reported as though they had applied.
    const resolved = riseAndFallTemplate({ durationS: 1200 });
    expect(() => resolveDemandTemplate(resolved, undefined, { peakWindowS: 420 })).toThrow(
      /cannot be applied to the already-resolved template/,
    );
    // An empty or all-undefined override is not an override, and passes through.
    expect(resolveDemandTemplate(resolved, undefined, {})).toBe(resolved);
    expect(resolveDemandTemplate(resolved, undefined, { peakWindowS: undefined })).toBe(resolved);
  });

  it('refuses an unknown id instead of guessing a shape', () => {
    // A typo that silently swapped a 30 minute peaked run for a 120 minute flat one would
    // move every reported statistic without moving anything visible.
    expect(() => resolveDemandTemplate('rise-and-fal' as 'rise-and-fall')).toThrow(
      /Unknown demand template/,
    );
    expect(() => resolveDemandTemplate({ ...riseRecord, id: 'bathtub' })).toThrow(
      /has no shape in this module/,
    );
  });
});

describe('integrated intensity', () => {
  const template = riseAndFallTemplate();

  it('clamps to the run and returns zero for an empty or inverted window', () => {
    expect(integratedIntensityS(template, -100, 0)).toBe(0);
    expect(integratedIntensityS(template, 1050, 750)).toBe(0);
    expect(integratedIntensityS(template, -100, 5000)).toBeCloseTo(template.intensityIntegralS, 9);
  });

  it('is additive across adjacent windows', () => {
    const whole = integratedIntensityS(template, 0, 1800);
    const parts =
      integratedIntensityS(template, 0, 750) +
      integratedIntensityS(template, 750, 1050) +
      integratedIntensityS(template, 1050, 1800);
    expect(parts).toBeCloseTo(whole, 9);
  });
});
