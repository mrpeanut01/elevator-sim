/**
 * **An authored phase list has to keep by declaration what the shape builders keep by
 * construction, and the schema is the door a `data/` author comes through.** `DECISIONS.md` § D273.
 *
 * `riseAndFallTemplate` cannot emit a gap, an overlap, a descending pair or a run that stops before
 * its own duration, because it computes every knot from two numbers. An authored list can do all
 * four, and **every one of them is silent**: `intensityAt` returns `0` outside every phase, so a gap
 * is a stretch of the day in which nobody arrives and nothing says so; and it returns the *first*
 * matching phase, so an overlap is a phase that is simply not there.
 *
 * `demandPhases.ts` is the single authority for those rules and this file is its test. It is checked
 * from **both directions the rules are reachable from**, which is not belt-and-braces:
 *
 * - the **schema**, which is where a `data/` author meets them, and where an issue can carry a path
 *   (`demandTemplates[0].phases[2].startMin`) that names the row to fix;
 * - the **resolver**, in `traffic/phaseListIdentity.test.ts`, which is where a hand-built record and
 *   an already-resolved template meet them, and where the schema has no say at all.
 *
 * The one thing asserted here that is *not* a rule about phases: the schema's key list is a
 * `strictObject`, so `phases` could not have been authored in `data/traffic-profiles.json` without
 * landing in `schema.ts` first — the property that stops a template having a second, unvalidated
 * definition. That is the argument `dayStart.test.ts` makes for the hour, pointed at a schedule.
 */

import { describe, expect, it } from 'vitest';

import { trafficProfilesSchema } from './schema.js';

/** The minimum a `demandTemplates` entry needs, so a case can vary one field and nothing else. */
const TEMPLATE = {
  id: 'a-day',
  name: 'A day',
  recommended: false,
  durationMin: 30,
} as const;

/** A well-formed three-phase list over the 30 minutes `TEMPLATE` declares. */
const GOOD_PHASES: readonly Record<string, unknown>[] = [
  { startMin: 0, endMin: 12.5, startIntensity: 0, endIntensity: 1 },
  { startMin: 12.5, endMin: 17.5, startIntensity: 1, endIntensity: 1 },
  { startMin: 17.5, endMin: 30, startIntensity: 1, endIntensity: 0 },
];

const UP = { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 } as const;
const DOWN = { incoming: 0.05, outgoing: 0.85, interfloor: 0.1 } as const;

/** The minimum a whole `traffic-profiles.json` needs to reach the template rows. */
function profilesWith(template: Record<string, unknown>): unknown {
  return {
    version: 1,
    arrivalProcess: { type: 'poisson-batch' },
    profiles: [
      {
        id: 'office',
        name: 'Office',
        blurb: 'A floor of desks.',
        governingPeak: 'up-peak',
        arrivalRatePctPop5min: { min: 8, typical: 12, max: 15 },
        targetIntervalS: 30,
        targetAvgWaitS: 25,
        batchSize: { distribution: 'geometric', mean: 1.4 },
        directionalSplit: UP,
      },
    ],
    demandTemplates: [template],
    passengerMass: { distribution: 'normal', meanKg: 75, stdDevKg: 15, minKg: 40 },
    credentialGap: { wrongZoneShare: 0 },
  };
}

/** Every issue a parse produced, as `path: message`. */
function issuesOf(template: Record<string, unknown>): readonly string[] {
  const result = trafficProfilesSchema.safeParse(profilesWith(template));
  if (result.success) return [];
  return result.error.issues.map(
    (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
  );
}

describe('the phase list is admitted by the schema and structurally checked by it', () => {
  it('cannot be authored in data alone: the row is a strictObject', () => {
    // The mechanism, asserted rather than assumed. A key the schema does not declare is refused, so
    // `phases` had to land in `schema.ts` and could not be slipped into `data/` on its own — and
    // neither can a misspelling of one of its own fields.
    expect(issuesOf({ ...TEMPLATE, schedule: GOOD_PHASES })).not.toEqual([]);
    expect(
      issuesOf({
        ...TEMPLATE,
        phases: [{ startMin: 0, endMin: 30, startIntensity: 1, endIntensity: 1, startsplit: UP }],
      }),
    ).not.toEqual([]);
  });

  it('accepts a well-formed list, with and without a mix', () => {
    expect(issuesOf({ ...TEMPLATE, phases: GOOD_PHASES })).toEqual([]);
    expect(
      issuesOf({
        ...TEMPLATE,
        phases: GOOD_PHASES.map((phase) => ({ ...phase, startSplit: UP, endSplit: UP })),
      }),
    ).toEqual([]);
  });

  it('accepts a record with no list at all, which is every shape template', () => {
    expect(issuesOf({ ...TEMPLATE })).toEqual([]);
  });

  const cases: readonly (readonly [string, Record<string, unknown>, RegExp])[] = [
    ['an empty list', { phases: [] }, /at least one phase/u],
    [
      'a gap',
      {
        phases: [
          { startMin: 0, endMin: 10, startIntensity: 0, endIntensity: 1 },
          { startMin: 20, endMin: 30, startIntensity: 1, endIntensity: 0 },
        ],
      },
      /contiguous and ascending/u,
    ],
    [
      'an overlap',
      {
        phases: [
          { startMin: 0, endMin: 20, startIntensity: 0, endIntensity: 1 },
          { startMin: 10, endMin: 30, startIntensity: 1, endIntensity: 0 },
        ],
      },
      /contiguous and ascending/u,
    ],
    [
      'a list that begins late',
      { phases: [{ startMin: 5, endMin: 30, startIntensity: 1, endIntensity: 1 }] },
      /must begin at 0/u,
    ],
    [
      'a list that stops early',
      { phases: [{ startMin: 0, endMin: 20, startIntensity: 1, endIntensity: 1 }] },
      /must end exactly at durationMin/u,
    ],
    [
      'a list that overruns the duration',
      { phases: [{ startMin: 0, endMin: 40, startIntensity: 1, endIntensity: 1 }] },
      /must end exactly at durationMin/u,
    ],
    [
      'a zero-length phase',
      {
        phases: [
          { startMin: 0, endMin: 0, startIntensity: 1, endIntensity: 1 },
          { startMin: 0, endMin: 30, startIntensity: 1, endIntensity: 1 },
        ],
      },
      /strictly after/u,
    ],
    [
      'a descending phase',
      {
        phases: [
          { startMin: 0, endMin: 20, startIntensity: 1, endIntensity: 1 },
          { startMin: 20, endMin: 10, startIntensity: 1, endIntensity: 1 },
        ],
      },
      /strictly after/u,
    ],
    [
      'an undeclared step in the intensity',
      {
        phases: [
          { startMin: 0, endMin: 15, startIntensity: 0, endIntensity: 0.5 },
          { startMin: 15, endMin: 30, startIntensity: 1, endIntensity: 0 },
        ],
      },
      /undeclared step/u,
    ],
    [
      'an undeclared step in the mix',
      {
        phases: [
          { startMin: 0, endMin: 15, startIntensity: 1, endIntensity: 1, startSplit: UP, endSplit: UP },
          {
            startMin: 15,
            endMin: 30,
            startIntensity: 1,
            endIntensity: 1,
            startSplit: DOWN,
            endSplit: DOWN,
          },
        ],
      },
      /undeclared step in the directional mix/u,
    ],
    [
      'a mix on some phases only',
      {
        phases: [
          { startMin: 0, endMin: 15, startIntensity: 1, endIntensity: 1, startSplit: UP, endSplit: UP },
          { startMin: 15, endMin: 30, startIntensity: 1, endIntensity: 1 },
        ],
      },
      /every phase or on none/u,
    ],
    [
      'one endpoint mix without the other',
      {
        phases: [{ startMin: 0, endMin: 30, startIntensity: 1, endIntensity: 1, startSplit: UP }],
      },
      /both endpoint mixes or neither/u,
    ],
    [
      'a phase list beside period-endpoint mixes',
      {
        phases: GOOD_PHASES,
        directionalSplitAtStart: UP,
        directionalSplitAtEnd: DOWN,
      },
      /as a phase list or as the period endpoints, never both/u,
    ],
    [
      'a discard on a phase list',
      { phases: GOOD_PHASES, discardFirstMin: 5 },
      /belong to the ISO constant shape/u,
    ],
  ];

  for (const [label, patch, pattern] of cases) {
    it(`refuses ${label}`, () => {
      const issues = issuesOf({ ...TEMPLATE, ...patch });
      expect(issues.length, label).toBeGreaterThan(0);
      expect(issues.join('\n'), label).toMatch(pattern);
    });
  }

  it('names the phase and the field, so an author knows which row to fix', () => {
    const issues = issuesOf({
      ...TEMPLATE,
      phases: [
        { startMin: 0, endMin: 10, startIntensity: 0, endIntensity: 1 },
        { startMin: 10, endMin: 20, startIntensity: 1, endIntensity: 1 },
        { startMin: 25, endMin: 30, startIntensity: 1, endIntensity: 0 },
      ],
    });
    // Minutes, not seconds. The record says `25` and the resolver works in `1500`, so a complaint
    // about `phases[2].startS` would be a message about the wrong document.
    expect(issues.join('\n')).toMatch(/demandTemplates\.0\.phases\.2\.startMin/u);
  });

  it('refuses an intensity outside [0, 1], because a template is a shape and not a rate', () => {
    // Caught by the field schema before the structural rules run, which is why the message is
    // zod's rather than `demandPhases.ts`'s — the important half is that it is caught at all.
    expect(
      issuesOf({
        ...TEMPLATE,
        phases: [{ startMin: 0, endMin: 30, startIntensity: 1, endIntensity: 1.5 }],
      }).length,
    ).toBeGreaterThan(0);
    expect(
      issuesOf({
        ...TEMPLATE,
        phases: [{ startMin: 0, endMin: 30, startIntensity: -0.1, endIntensity: 1 }],
      }).length,
    ).toBeGreaterThan(0);
  });

  it('refuses a mix whose shares do not sum to 1, at the phase that carries it', () => {
    const issues = issuesOf({
      ...TEMPLATE,
      phases: [
        {
          startMin: 0,
          endMin: 30,
          startIntensity: 1,
          endIntensity: 1,
          startSplit: { incoming: 0.5, outgoing: 0.5, interfloor: 0.5 },
          endSplit: { incoming: 0.5, outgoing: 0.5, interfloor: 0.5 },
        },
      ],
    });
    expect(issues.join('\n')).toMatch(/must sum to 1/u);
  });
});
