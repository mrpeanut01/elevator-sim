/**
 * **A demand template may declare an hour, and the schema is the only door it can come through.**
 *
 * `trafficProfilesSchema.demandTemplates` is a `strictObject`, so `startOfDayMin` could not have
 * been authored in `data/traffic-profiles.json` alone — an undeclared key is refused outright. That
 * is the property this file exercises first, because it is what keeps a template from having a
 * second, unvalidated definition somewhere: the hour is either in the schema and in the record, or
 * it does not exist. `DECISIONS.md` § D244.
 *
 * Three claims:
 *
 * 1. an hour outside `[0, 1440)` is refused, **by name**, at both ends — and the upper end is
 *    half-open, because 1440 is the next midnight and admitting both spellings of one instant would
 *    let two records that mean the same thing compare unequal;
 * 2. a record with **no** hour is valid, which is what makes omission a declaration rather than an
 *    incomplete row — `constant-iso` ships that way on purpose;
 * 3. the shipped file's five authored hours are inside the bound and land where their `$comment`
 *    says they land, which is the half a range check cannot make.
 *
 * What is deliberately *not* here: whether the hour changes a run. It does not, and that is proved
 * by a run in `traffic/dayStartIdentity.test.ts` rather than by a schema test, because a schema
 * test could not tell the difference.
 */

import { describe, expect, it } from 'vitest';

import { load } from '../sim/fixtures.test-helper.js';

import { trafficProfilesSchema } from './schema.js';

/** The minimum a `demandTemplates` entry needs, so a case can vary one field and nothing else. */
const TEMPLATE = {
  id: 'rise-and-fall',
  name: 'CIBSE rise-and-fall template',
  recommended: true,
  durationMin: 30,
} as const;

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
        directionalSplit: { incoming: 0.85, outgoing: 0.05, interfloor: 0.1 },
      },
    ],
    demandTemplates: [template],
    passengerMass: { distribution: 'normal', meanKg: 75, stdDevKg: 15, minKg: 40 },
  };
}

/** The `startOfDayMin` complaints a parse produced, if any. */
function hourIssues(template: Record<string, unknown>): readonly string[] {
  const result = trafficProfilesSchema.safeParse(profilesWith(template));
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path.includes('startOfDayMin'))
    .map((issue) => issue.message);
}

describe('the demand template hour is admitted by the schema and bounded by it', () => {
  it('cannot be authored in data alone: the row is a strictObject', () => {
    // The mechanism, asserted rather than assumed. A key the schema does not declare is refused,
    // which is why `startOfDayMin` had to land in `schema.ts` and could not be slipped into
    // `data/traffic-profiles.json` on its own.
    const result = trafficProfilesSchema.safeParse(
      profilesWith({ ...TEMPLATE, startOfDayHour: 8 }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a record with no hour, because omission is a declaration', () => {
    const result = trafficProfilesSchema.safeParse(profilesWith({ ...TEMPLATE }));
    expect(result.success).toBe(true);
    if (result.success) {
      // Absent, not present-and-undefined: the resolver reads `undefined` as "no hour" and the
      // runtime template must then carry no key at all.
      expect('startOfDayMin' in result.data.demandTemplates[0]!).toBe(false);
    }
  });

  it('accepts both ends of the admitted range', () => {
    for (const startOfDayMin of [0, 1439, 1439.999]) {
      expect(hourIssues({ ...TEMPLATE, startOfDayMin }), String(startOfDayMin)).toEqual([]);
    }
  });

  it('refuses a negative hour by name', () => {
    const issues = hourIssues({ ...TEMPLATE, startOfDayMin: -1 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/minutes after local midnight/);
  });

  it('refuses 1440 and above by name, because 1440 is the next midnight', () => {
    for (const startOfDayMin of [1440, 1441, 2880]) {
      const issues = hourIssues({ ...TEMPLATE, startOfDayMin });
      expect(issues, String(startOfDayMin)).toHaveLength(1);
      expect(issues[0], String(startOfDayMin)).toMatch(/must be below 1440/);
    }
  });

  it('refuses a non-number by name', () => {
    expect(hourIssues({ ...TEMPLATE, startOfDayMin: '08:30' })).toHaveLength(1);
  });
});

/**
 * The shipped hours, and the derivation each one's `$comment` claims.
 *
 * Pinned in *clock* terms rather than as bare minute counts, because the minute count is the thing
 * a reader cannot check by eye and the clock is what the `$comment` argues about. `1044` looks like
 * a typo until it reads as 17:24, which is what placing `evening-egress`'s reported five minutes at
 * 17:30 costs.
 */
const SHIPPED_HOURS: Readonly<Record<string, string | null>> = {
  'rise-and-fall': '08:30',
  'constant-iso': null,
  'lunch-two-way': '12:15',
  'shift-change': '14:45',
  // `evening-egress` is the **venue** case and nothing else since `DECISIONS.md` § D263: 22:24
  // places its reported five minutes at 22:30–22:35, a function turning out. The office end of day
  // it used to double as is `office-down-peak`, whose 17:15 places its hold at 17:30 — the pair of
  // hours that could not both live on one record, which is what forced the split.
  'evening-egress': '22:24',
  'office-down-peak': '17:15',
};

describe('the shipped reference data authors five hours and deliberately omits one', () => {
  it('every template declares the hour its comment argues for, or none', async () => {
    const config = await load();
    const measured: Record<string, string | null> = {};
    for (const template of config.trafficProfiles.demandTemplates) {
      const minutes = template.startOfDayMin;
      measured[template.id] =
        minutes === undefined
          ? null
          : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }
    expect(measured).toEqual(SHIPPED_HOURS);
  }, 60_000);

  it('constant-iso carries no key at all, rather than a null or a zero', async () => {
    const config = await load();
    const record = config.trafficProfiles.demandTemplates.find(
      (entry) => entry.id === 'constant-iso',
    );
    expect(record).toBeDefined();
    // `in`, not `=== undefined`: ISO's constant demand has no hour, and "no hour" and "midnight"
    // must not be the same record.
    expect('startOfDayMin' in record!).toBe(false);
  }, 60_000);

  it('every authored hour states its citation status in its own comment', async () => {
    const config = await load();
    for (const template of config.trafficProfiles.demandTemplates) {
      if (template.startOfDayMin === undefined) continue;
      const comment = template.$comment ?? '';
      // The CITED / DERIVED / NOT CITED idiom this file already uses for `lunch-two-way`'s mix.
      // An hour that no table publishes may be authored; it may not be authored silently.
      expect(comment, template.id).toContain('CLOCK');
      expect(comment, template.id).toContain('NOT CITED');
      expect(comment, template.id).toMatch(/DERIVED|assumption/);
    }
  }, 60_000);
});
