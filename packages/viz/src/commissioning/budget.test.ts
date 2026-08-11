/**
 * **The capital constraint is a limit on the configuration and never a metric — asserted.**
 *
 * `docs/17` § 4.4 asks this decision to be made out loud; `types.ts` makes it, with the citation.
 * This file is the half that runs. A rule stated in a docstring and checked by nothing is the shape
 * of every dead seam this repository has found, and `docs/10` § 5.5's prohibitions are exactly the
 * kind of rule that decays quietly: nothing breaks the day a budget line lands beside a wait
 * figure, and everything is wrong afterwards.
 *
 * Four assertions, in increasing order of how hard they are to get round:
 *
 * 1. **No capital figure reaches a report shape.** Measured on a real `ShapedDayReport` built from
 *    a real run of a commissioned building — not on a type, and not on a promise.
 * 2. **No file here can reach a reporting surface at all.** An import check, so the first assertion
 *    is a fact about the module graph rather than about one run.
 * 3. **No string this module produces carries comparative or scoring vocabulary**, or the name of
 *    any run metric it must never stand beside. Over every string literal in the directory *and*
 *    every sentence a battery of real reviews generates.
 * 4. **The lexicon is not broken.** Positive controls, because a vocabulary scan whose patterns
 *    have rotted passes everything.
 *
 * ## Why this is § D106's argument
 *
 * Energy is an axis, never a score, *because* `nearest-car` — the weakest shipped dispatcher — is
 * on the Pareto front at six of eight cells on the strength of it: a configuration that spends less
 * by carrying fewer people has not saved anything. Capital does the same thing one step earlier —
 * the cheapest building is the one with the fewest shafts. § D106 answers it by publishing
 * `workPerServedLegKJ` **beside** the raw figure; the answer here is stronger and simpler, because
 * capital is spent before the week and has no result to sit beside. So it does not appear on the
 * sheet at all, and that absence is what these tests pin.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';
import { shiftRunConfigOf, type ViewerState } from '../dev/state.js';
import { contractById } from '../shift/contracts.js';
import { SHIFT_EVENTS } from '../shift/events.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { dayReportOf } from '../shift/report.js';
import { closeDay, openWeek, outcomeOf } from '../shift/week.js';

import { commissionedBuilding } from './building.js';
import { asBuiltChoices, withBankChoice } from './choices.js';
import { refusalsBeside, reviewCommissioning } from './refusals.js';
import {
  CONSTRAINTS,
  DIMENSION_LABELS,
  commissionableClasses,
  constraintById,
  type CapitalConstraint,
} from './types.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CLASSES = commissionableClasses(RESOURCES.elevatorSpecs);
const NEW_BUILD = constraintById('new-build') as CapitalConstraint;

const base = (() => {
  const entry = RESOURCES.entries.find((candidate) => candidate.config.id === 'midtown-office');
  if (entry === undefined) throw new Error('probes.test-helper.ts does not load midtown-office');
  return entry.config;
})();

/** Four shafts to five, and the class with them — a configuration that commits real capital. */
const CHOICES = withBankChoice(asBuiltChoices(base, CLASSES), {
  bankId: 'main',
  shafts: 5,
  machineClassId: 'geared-traction',
  ratedSpeedMps: 2.25,
});

const REVIEW = reviewCommissioning({
  base,
  choices: CHOICES,
  classes: CLASSES,
  specs: RESOURCES.elevatorSpecs,
  constraint: NEW_BUILD,
});

/* -------------------------------------------------------------------------- *
 * 1 — no capital figure reaches a report shape
 * -------------------------------------------------------------------------- */

describe('the budget does not reach a results page', () => {
  /** A real day of a real week, run on the commissioned building. */
  const report = (() => {
    const state: ViewerState = {
      ...baseState(),
      buildingId: 'midtown-office',
      shiftLengthS: 900,
      savedBuildings: [{ id: 'midtown-office', config: commissionedBuilding(base, CHOICES, CLASSES) }],
    };
    const plan = shiftRunConfigOf(RESOURCES, state);
    const recording = recordRun(plan.config, {
      recordDecisions: false,
      outOfServiceCarIds: plan.outOfServiceCarIds,
    }).recording;
    const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
    const goals = goalsForDay(1);
    const opened = openWeek('c2');
    const week = closeDay(
      opened,
      outcomeOf({
        record: null,
        recordRefusal: null,
        day: opened.day,
        dayIdx: opened.dayIdx,
        eventId: 'ordinary',
        arrived: observations.arrived,
        carried: observations.carried,
        minutePct: observations.minutePct,
        readings: readGoals(goals, observations),
      }),
    );
    return dayReportOf({
      recording,
      observations,
      goals,
      week,
      contract: contractById('c2'),
      event: SHIFT_EVENTS.ordinary,
      calendar: null,
      subject: { kind: 'week-day' },
      // Issue #126's required field. Nothing here reads the basis; the sheet is built for its
      // figures, and the plan says what those figures are figures of.
      plan: { shiftLengthS: 900, windowStartS: null, patternId: 'building' },
    });
  })();

  it('runs a building the choices really produced', () => {
    // The control for the three tests below: a sheet that came from the *unchanged* building would
    // prove nothing about a commissioned one.
    expect(REVIEW.admissible).toBe(true);
    expect(REVIEW.capitalUnits).toBeGreaterThan(0);
    expect(report.figures.length).toBeGreaterThan(0);
  });

  it('publishes no figure whose value is the capital or the budget', () => {
    const forbidden = new Set([String(REVIEW.capitalUnits), String(REVIEW.budgetUnits)]);
    for (const figure of report.figures) {
      expect(forbidden.has(figure.value), `figure "${figure.id}" prints a capital figure`).toBe(false);
    }
  });

  it('says none of the words a capital figure would arrive under, anywhere on the sheet', () => {
    /*
     * The whole sheet, serialized — figures, notes, diagnosis, levers, small print, meta. A budget
     * that reached the sheet would have to be *called* something, and every name it could have is
     * here. This is deliberately broader than the figure check above: it also catches a capital
     * line smuggled into a note or a caption, which is exactly where a *"you spent 82 % of budget"*
     * would land.
     */
    const sheet = JSON.stringify(report).toLowerCase();
    for (const word of ['capital', 'budget', 'commission', 'shafts allowed', 'spent']) {
      expect(sheet.includes(word), `the sheet says "${word}"`).toBe(false);
    }
  });

  it('and the whole run configuration carries no trace of it either', () => {
    // The run's own identity — the thing a leaderboard digests and the server replays. A capital
    // figure that reached it would be comparable between players by construction.
    const state: ViewerState = {
      ...baseState(),
      buildingId: 'midtown-office',
      shiftLengthS: 900,
      savedBuildings: [{ id: 'midtown-office', config: commissionedBuilding(base, CHOICES, CLASSES) }],
    };
    const plan = shiftRunConfigOf(RESOURCES, state);
    const document = JSON.stringify(plan.building).toLowerCase();
    for (const word of ['capital', 'budget', 'commission']) {
      expect(document.includes(word), `the building document says "${word}"`).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — nothing here can reach a reporting surface
 * -------------------------------------------------------------------------- */

/** Every runtime `.ts` in this directory. Tests are excluded: a test may import a report. */
function runtimeFiles(): readonly { readonly name: string; readonly code: string }[] {
  return readdirSync(HERE)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.test-helper.ts'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, code: readFileSync(join(HERE, name), 'utf8') }));
}

/**
 * The surfaces a capital figure must never be able to travel to.
 *
 * `shift/report.ts` and `render/` are the results pages; `live/` and `frame/` are what the overlay
 * reads; `dev/` mounts every panel; `menu/` carries the leaderboard client, which is the *"compared
 * between players"* half of the rule. A module that cannot import any of them cannot put a number
 * on any of them, whatever anybody writes here later.
 */
const FORBIDDEN_IMPORT = /from\s+['"]\.\.\/(shift\/report|render|live|frame|dev|menu|record|playback|persist)\b/;

describe('no file here can reach a reporting surface', () => {
  it('imports nothing that draws a result', () => {
    const offenders = runtimeFiles()
      .filter((file) => FORBIDDEN_IMPORT.test(file.code))
      .map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  it('positive control: the rule catches an import that would', () => {
    expect(FORBIDDEN_IMPORT.test("import { dayReportOf } from '../shift/report.js';")).toBe(true);
    expect(FORBIDDEN_IMPORT.test("import { themeFor } from '../render/theme.js';")).toBe(true);
    // And does not fire on what this module legitimately reads.
    expect(FORBIDDEN_IMPORT.test("import { valueText } from '../campaign/dimensions.js';")).toBe(false);
  });

  it('has files to check, so an empty pass is not possible', () => {
    expect(runtimeFiles().map((file) => file.name)).toEqual([
      'building.ts',
      'choices.ts',
      'refusals.ts',
      'types.ts',
    ]);
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — the vocabulary
 * -------------------------------------------------------------------------- */

/**
 * Words a limit may not use.
 *
 * Two families, and they answer two different halves of the rule.
 *
 * **Comparison and scoring** — `docs/10` § 5.5 bans a grade letter, an efficiency score and an
 * energy score, and R2 says a score is a property of a run and never of a dispatcher. A budget that
 * described itself in this vocabulary would have become the thing the prohibition is about,
 * whatever the code around it did.
 *
 * **Run metrics** — the clause *"nothing may print `you spent 82 % of budget` beside a wait
 * figure"* is about adjacency, and adjacency is not checkable from a string. What *is* checkable is
 * that no sentence this module produces ever names one of those quantities, which is the same
 * prohibition from the other end: a capital sentence that cannot say the word *wait* cannot be
 * written to sit beside one.
 *
 * Word-bounded, deliberately. `\bgrade\b` and not `grade`, because *upgrade* is an ordinary word
 * about a machine; `\brated\b` is not banned at all, because a rated speed is a fact about hardware.
 */
const BANNED = Object.freeze([
  /\bgrades?\b/i,
  /\bscored?\b/i,
  /\bscoring\b/i,
  /\brank(?:ed|ing|s)?\b/i,
  /\befficien\w*\b/i,
  /\bbetter\b/i,
  /\bworse\b/i,
  /\bbest\b/i,
  /\bworst\b/i,
  /\bbeats?\b/i,
  /\bwinner\b/i,
  /\bpoints?\b/i,
  /\bstars?\b/i,
  /\bleaderboard\b/i,
  /\bpercent\b/i,
  /%/,
  /\bwait(?:ing|s|ed)?\b/i,
  /\bAWT\b/,
  /\bWT95\b/,
  /\benergy\b/i,
  /\bkWh\b/i,
  /\bthroughput\b/i,
]);

/**
 * Comments removed, so the scan is about the prose this module **prints** rather than about the
 * prose it uses to explain itself.
 *
 * `boundaries.test.ts` makes exactly this argument for exactly this reason, and it applies with
 * more force here: `types.ts`'s docstring quotes the prohibition it is obeying — *an "efficiency"
 * or "energy" score*, *"you spent 82 % of budget"* — and under a raw scan the file that states the
 * rule is the file that violates it. **Naming the thing you are avoiding is how the avoidance stays
 * understood**, so the docstrings keep the words and the strings may not have them.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Every string literal in the runtime files — the whole of the prose this module can print. */
function stringLiterals(source: string): readonly string[] {
  const code = stripComments(source);
  const found: string[] = [];
  const pattern = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let match = pattern.exec(code);
  while (match !== null) {
    found.push(match[1] ?? match[2] ?? match[3] ?? '');
    match = pattern.exec(code);
  }
  return found;
}

/**
 * Every sentence a real review produces, over a battery that exercises every refusal this module
 * has.
 *
 * The literals scan alone would miss anything assembled from two of them, and this scan alone would
 * miss a string no case reaches. Both, so neither gap is load-bearing.
 */
function generatedProse(): readonly string[] {
  const asBuilt = asBuiltChoices(base, CLASSES);
  const built = asBuilt[0];
  if (built === undefined) throw new Error('midtown-office declares no banks');
  const cases = [
    asBuilt,
    CHOICES,
    withBankChoice(asBuilt, { ...built, shafts: 0 }),
    withBankChoice(asBuilt, { ...built, machineClassId: 'antigravity' }),
    withBankChoice(asBuilt, { ...built, machineClassId: 'hydraulic', ratedSpeedMps: 0.63 }),
    withBankChoice(asBuilt, { ...built, ratedSpeedMps: 3 }),
    withBankChoice(asBuilt, { ...built, machineClassId: 'ultra-high-speed', ratedSpeedMps: 10 }),
    withBankChoice(asBuilt, { ...built, shafts: 12, machineClassId: 'ultra-high-speed', ratedSpeedMps: 20 }),
  ];
  const prose: string[] = [];
  for (const constraint of CONSTRAINTS) {
    for (const choices of cases) {
      const review = reviewCommissioning({
        base,
        choices,
        classes: CLASSES,
        specs: RESOURCES.elevatorSpecs,
        constraint,
      });
      prose.push(review.sentence);
      prose.push(...review.refusals.map((refusal) => refusal.message));
      prose.push(...refusalsBeside(review, 'main', 'shafts').map((refusal) => refusal.message));
    }
  }
  return prose;
}

describe('the budget speaks no comparative or scoring vocabulary', () => {
  it('says nothing banned in any string this module can print', () => {
    const offences: string[] = [];
    for (const file of runtimeFiles()) {
      for (const literal of stringLiterals(file.code)) {
        for (const pattern of BANNED) {
          if (pattern.test(literal)) offences.push(`${file.name}: ${pattern.source} — "${literal}"`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('says nothing banned in any sentence a real review produces', () => {
    const prose = generatedProse();
    // The battery has to reach the refusals, or this passes by producing nothing.
    expect(prose.length).toBeGreaterThan(30);
    const offences: string[] = [];
    for (const sentence of prose) {
      for (const pattern of BANNED) {
        if (pattern.test(sentence)) offences.push(`${pattern.source} — "${sentence}"`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('says nothing banned in the constraints or the dimension labels', () => {
    const strings = [
      ...CONSTRAINTS.flatMap((constraint) => [constraint.id, constraint.label, constraint.note]),
      ...Object.values(DIMENSION_LABELS),
    ];
    for (const value of strings) {
      for (const pattern of BANNED) {
        expect(pattern.test(value), `"${value}" matches ${pattern.source}`).toBe(false);
      }
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — the lexicon is not broken
 * -------------------------------------------------------------------------- */

describe('the vocabulary scan itself', () => {
  const matchesSomething = (value: string): boolean => BANNED.some((pattern) => pattern.test(value));

  it('catches the sentence this whole rule exists to prevent', () => {
    expect(matchesSomething('You spent 82% of budget — average wait 41 s.')).toBe(true);
    expect(matchesSomething('Grade B — a more efficient building than last week.')).toBe(true);
    expect(matchesSomething('Your capital score ranks 4th on the leaderboard.')).toBe(true);
    expect(matchesSomething('This configuration is better than the one you started with.')).toBe(true);
  });

  it('does not catch ordinary talk about hardware', () => {
    expect(matchesSomething('Geared traction is rated to climb 76 m at up to 2.5 m/s.')).toBe(false);
    expect(matchesSomething('Refurbishment allows 892 capital units on this building.')).toBe(false);
    expect(matchesSomething('An upgrade to the machine class costs more than a shaft.')).toBe(false);
  });

  it('finds string literals at all, so an empty scan is not a pass', () => {
    const literals = runtimeFiles().flatMap((file) => stringLiterals(file.code));
    expect(literals.length).toBeGreaterThan(20);
    expect(literals.some((value) => value.includes('capital units'))).toBe(true);
  });

  it('strips the docstrings that quote the prohibition, and only those', () => {
    /*
     * The positive control for {@link stripComments}. `types.ts` cites § 5.5 by quoting it, so a
     * scanner that read comments would report the file stating the rule as the file breaking it —
     * and the fix a reader would reach for is deleting the citation, which is the worst available
     * outcome. Both halves asserted: the quotation is really in the file, and it is really not in
     * the scan.
     */
    const types = runtimeFiles().find((file) => file.name === 'types.ts');
    expect(types).toBeDefined();
    if (types === undefined) return;
    expect(types.code).toContain('82 %');
    expect(stringLiterals(types.code).some((value) => value.includes('82 %'))).toBe(false);
  });
});
