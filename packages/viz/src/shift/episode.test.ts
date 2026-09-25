/**
 * `shift/episode.ts` on its own — the splice is pure, so these cases need no simulation. What the
 * product does with it on a whole day is `wholeDayEvents.test.ts`'s.
 *
 * The three claims, each checked against `core` rather than against the splice's own arithmetic:
 *
 * 1. **Every shipped placement splices into every shipped day into a record `core` accepts** —
 *    `demandPhaseIssues` empty, `resolveDemandTemplate` resolving, and the day still recognised as
 *    the building's day (`wholeDayFor`), so the horizon and the report window keep resolving.
 * 2. **Outside `[from − ramp, to + ramp]` the day is its own**, sampled every 30 s through `core`'s
 *    own `intensityAt` and `splitAt`.
 * 3. **Inside the window the mix is the wrinkle's and the level is the placement's** — exactly the
 *    wrinkle's split, and the placement's intensity or the day's own where it says `authored`.
 */

import {
  demandPhaseIssues,
  intensityAt,
  resolveDemandTemplate,
  splitAt,
  type DemandTemplate,
  type DirectionalSplit,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { RESOURCES } from '../scope/probes.test-helper.js';
import { everyWrinkle } from '../wrinkles/draw.js';
import { WRINKLE_LIBRARY } from '../wrinkles/library.js';
import type { WholeDayEpisode } from '../wrinkles/types.js';

import { wholeDayFor } from './dayLength.js';
import { EPISODE_RAMP_MIN, spliceEpisode, trafficProfilesWithRecord } from './episode.js';

const PROFILES = RESOURCES.trafficProfiles;

/**
 * Every shipped record some building runs as its whole day — `wholeDayFor` over every traffic
 * profile, so a phase list with a clock that is not a day (`endless-rush`) is not one of them.
 */
const DAY_IDS = new Set(
  PROFILES.profiles.flatMap((profile) => {
    const day = wholeDayFor(PROFILES, { trafficProfile: profile.id });
    return day === undefined ? [] : [day.templateId];
  }),
);
const DAYS: readonly DemandTemplate[] = PROFILES.demandTemplates.filter((record) => DAY_IDS.has(record.id));

/** Every drawable wrinkle value that carries an episode, with its split. */
const PLACED = everyWrinkle(WRINKLE_LIBRARY).flatMap((wrinkle) => {
  const placed = wrinkle.effect.wholeDay;
  const split = wrinkle.effect.directionalSplit;
  return placed?.kind === 'episode' && split !== null
    ? [{ id: wrinkle.id, name: wrinkle.name, episode: placed, split }]
    : [];
});

function sameSplit(a: DirectionalSplit | undefined, b: DirectionalSplit | undefined, tol = 1e-9): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    Math.abs(a.incoming - b.incoming) <= tol &&
    Math.abs(a.outgoing - b.outgoing) <= tol &&
    Math.abs(a.interfloor - b.interfloor) <= tol
  );
}

describe('the splice — § D1057', () => {
  it('has days to splice into and placements to splice', () => {
    expect(DAYS.map((record) => record.id)).toContain('office-day');
    /* Fifteen templates are placed; with their axis values that is more drawable wrinkles. */
    expect(new Set(PLACED.map((entry) => entry.id.split(':')[0])).size).toBe(15);
  });

  it('writes every shipped placement into every shipped day as a record core accepts', () => {
    const problems: string[] = [];
    for (const record of DAYS) {
      for (const { id, name, episode, split } of PLACED) {
        const spliced = spliceEpisode(record, episode, split, name);
        if (spliced.kind === 'refused') {
          problems.push(`${id} in ${record.id}: refused — ${spliced.reason}`);
          continue;
        }
        const phases = spliced.record.phases ?? [];
        const issues = demandPhaseIssues(
          phases.map((phase) => ({
            start: phase.startMin,
            end: phase.endMin,
            startIntensity: phase.startIntensity,
            endIntensity: phase.endIntensity,
            startSplit: phase.startSplit,
            endSplit: phase.endSplit,
          })),
          spliced.record.durationMin,
          'min',
        );
        if (issues.length > 0) problems.push(`${id} in ${record.id}: ${issues.map((i) => i.message).join('; ')}`);
        const profiles = trafficProfilesWithRecord(PROFILES, spliced.record);
        expect(() => resolveDemandTemplate(record.id, profiles.demandTemplates)).not.toThrow();
        /* The day is still the building's day, so the horizon and the report window resolve. */
        for (const profile of PROFILES.profiles) {
          const before = wholeDayFor(PROFILES, { trafficProfile: profile.id });
          const after = wholeDayFor(profiles, { trafficProfile: profile.id });
          if (before?.templateId !== after?.templateId) {
            problems.push(`${id} in ${record.id}: ${profile.id}'s day stopped resolving`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('leaves the day its own outside the window and ramps, and is the wrinkle inside it', () => {
    const mismatches: string[] = [];
    for (const record of DAYS) {
      const base = resolveDemandTemplate(record.id, PROFILES.demandTemplates);
      for (const { id, name, episode, split } of PLACED) {
        const spliced = spliceEpisode(record, episode, split, name);
        if (spliced.kind === 'refused') continue;
        const run = resolveDemandTemplate(
          record.id,
          trafficProfilesWithRecord(PROFILES, spliced.record).demandTemplates,
        );
        const ramp = EPISODE_RAMP_MIN * 60;
        for (let t = 0; t <= base.durationS; t += 30) {
          const inside = t >= spliced.startS && t <= spliced.endS;
          const nearby = t > spliced.startS - ramp && t < spliced.endS + ramp;
          if (inside) {
            const level = episode.intensity === 'authored' ? intensityAt(base, t) : episode.intensity;
            if (Math.abs(intensityAt(run, t) - level) > 1e-9 || !sameSplit(splitAt(run, t), split)) {
              mismatches.push(`${id} in ${record.id} at ${String(t)} s: not the wrinkle inside the window`);
            }
          } else if (!nearby) {
            if (
              Math.abs(intensityAt(run, t) - intensityAt(base, t)) > 1e-9 ||
              !sameSplit(splitAt(run, t), splitAt(base, t))
            ) {
              mismatches.push(`${id} in ${record.id} at ${String(t)} s: the day moved outside the window`);
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('puts the episode at the clock time the placement names', () => {
    const office = DAYS.find((record) => record.id === 'office-day');
    const drill = PLACED.find((entry) => entry.id.startsWith('fire-drill:full'));
    if (office === undefined || drill === undefined) throw new Error('no office day or no drill');
    const spliced = spliceEpisode(office, drill.episode, drill.split, drill.name);
    if (spliced.kind === 'refused') throw new Error(spliced.reason);
    /* 10:00 on a day that opens at 08:00 is two hours in; twenty minutes long. */
    expect([spliced.startS, spliced.endS]).toEqual([7_200, 8_400]);
  });

  it('refuses a day that cannot hold the window, and a record that is not a day', () => {
    const office = DAYS.find((record) => record.id === 'office-day');
    if (office === undefined) throw new Error('no office day');
    const split = { incoming: 0.1, outgoing: 0.8, interfloor: 0.1 };
    const at = (fromMin: number, toMin: number): WholeDayEpisode['intensity'] | undefined => {
      const result = spliceEpisode(office, { fromMin, toMin, intensity: 1 }, split, 'x');
      return result.kind === 'refused' ? undefined : 1;
    };
    expect(at(7 * 60, 7 * 60 + 20), 'before the day opens').toBeUndefined();
    expect(at(17 * 60 + 50, 18 * 60 + 10), 'past the close').toBeUndefined();
    expect(at(8 * 60, 8 * 60 + 20), 'at the opening, no lead ramp needed').toBe(1);
    expect(at(17 * 60 + 40, 18 * 60), 'to the close, no tail ramp needed').toBe(1);
    const shape = PROFILES.demandTemplates.find((record) => record.phases === undefined);
    if (shape === undefined) throw new Error('no shape template');
    expect(spliceEpisode(shape, { fromMin: 600, toMin: 620, intensity: 1 }, split, 'x').kind).toBe('refused');
  });
});
