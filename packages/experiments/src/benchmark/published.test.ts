/**
 * **Layer B of the publication guard: no printed interval without a study behind it.**
 *
 * `published.ts` § *Why this module exists* has the three defects this suite descends from. This
 * file owns the half that costs nothing to run — the source scan, the domain totality, and the
 * rendering — while Layer A, the estimate comparison, lives inside the study suites that already
 * pay for the runs.
 *
 * The load-bearing assertion is *the partition*: every interval-shaped literal in `benchmark/` is
 * either reproduced by a pinned estimate at its own printed precision, or declared in
 * {@link UNPINNED_INTERVALS} **with a count**. Equality of the two multisets, in both directions,
 * is what makes this a guard rather than an allowlist — a number cannot appear without a study, a
 * study's number cannot silently change, and a declared exception cannot outlive the reason it was
 * declared for.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  PINNED_ESTIMATES,
  PUBLISHED_STUDY_IDS,
  STUDY_ENTRY_POINTS,
  UNPINNED_INTERVALS,
  publishedForm,
  type PinnedEstimate,
  type PublishedStudyId,
} from './published.js';
import { renderPinTable } from './regeneratePins.js';

const SOURCE_DIR = fileURLToPath(new URL('.', import.meta.url));

/** Every non-test module in this directory, as `(name, source)`. */
function modules(): readonly (readonly [string, string])[] {
  return readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(`${SOURCE_DIR}${name}`, 'utf8')] as const);
}

/* -------------------------------------------------------------------------- *
 * The scan
 * -------------------------------------------------------------------------- */

/**
 * An interval as this package prints one, in any of the forms it actually uses.
 *
 * Signs optional (a `0.00` is written without one), the minus either ASCII or U+2212, and a unit
 * (`s`, `%`, `ms`) allowed after any of the three numbers because § 4 writes `−0.007 s [−0.032,
 * +0.018]`. Deliberately loose: a pattern that missed a form would make the partition pass by not
 * looking, which is the failure mode this whole file exists to prevent.
 */
const NUMBER = String.raw`[-−+]?\d+\.\d+`;
const UNIT = String.raw`(?:\s*(?:s|%|ms))?`;
const INTERVAL = new RegExp(
  `(${NUMBER})${UNIT}\\s*\\[\\s*(${NUMBER})${UNIT}\\s*,\\s*(${NUMBER})${UNIT}\\s*\\]`,
  'g',
);

/** A scanned number in {@link publishedForm}'s convention: explicit sign, U+2212 for minus. */
function normalize(text: string): string {
  if (text.startsWith('-')) return `−${text.slice(1)}`;
  if (text.startsWith('−') || text.startsWith('+')) return text;
  return `+${text}`;
}

/**
 * The guard's own two files, which *quote* intervals as data rather than publishing them.
 *
 * `published.ts` holds every declared-unpinned literal in {@link UNPINNED_INTERVALS}, this file
 * holds the rendering fixtures, and `regeneratePins.ts` is the emitter rather than a study — so
 * scanning them would make the partition compare the exception list against itself and would
 * classify the generator as something to pin. Three names, hard-coded, because the exclusion has to
 * be narrow enough to read: any other file that wanted to hide a number would have to be added here
 * in a diff.
 */
const GUARD_FILES: readonly string[] = Object.freeze([
  'published.ts',
  'published.test.ts',
  'regeneratePins.ts',
]);

/** Every interval literal in `benchmark/`, normalized, as `file → text → count`. */
function scanPublishedIntervals(): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const byFile = new Map<string, Map<string, number>>();
  for (const [name, source] of modules()) {
    if (GUARD_FILES.includes(name)) continue;
    for (const match of source.matchAll(INTERVAL)) {
      const text = `${normalize(match[1] ?? '')} [${normalize(match[2] ?? '')}, ${normalize(match[3] ?? '')}]`;
      const file = `benchmark/${name}`;
      const counts = byFile.get(file) ?? new Map<string, number>();
      counts.set(text, (counts.get(text) ?? 0) + 1);
      byFile.set(file, counts);
    }
  }
  return byFile;
}

/**
 * Every rendering of every pin, at 1–5 decimal places, mapped back to the pin that produced it.
 *
 * The precision is not assumed: a scanned literal is checked against the vocabulary at *its own*
 * number of decimals, so `−0.006 [−0.021, +0.010]` and `−0.01 [−0.02, +0.01]` are both recognised
 * as the same estimate rather than one of them being rejected as undeclared.
 */
function derivableForms(): ReadonlyMap<string, readonly string[]> {
  const forms = new Map<string, string[]>();
  for (const studyId of PUBLISHED_STUDY_IDS) {
    for (const [key, pin] of Object.entries(PINNED_ESTIMATES[studyId])) {
      for (let places = 1; places <= 5; places += 1) {
        const form = publishedForm(pin, places);
        const owners = forms.get(form) ?? [];
        owners.push(`${studyId}:${key}@${places}dp`);
        forms.set(form, owners);
      }
    }
  }
  return forms;
}

/* -------------------------------------------------------------------------- *
 * Suites
 * -------------------------------------------------------------------------- */

describe('the published-interval domain is the directory, not a list somebody maintains', () => {
  it('classifies every study entry point in benchmark/ as covered or as publishing no interval', () => {
    // The seam.test.ts convention, one level up from a categorical: the domain is derived from the
    // modules themselves, so a study added here cannot stay uncovered by nobody noticing.
    const declared = new RegExp(
      String.raw`export\s+(?:async\s+)?function\s+((?:run|measure|audit)[A-Za-z0-9_]*)`,
      'g',
    );
    const found = new Set<string>();
    for (const [name, source] of modules()) {
      if (name.endsWith('.test.ts') || GUARD_FILES.includes(name)) continue;
      for (const match of source.matchAll(declared)) found.add(match[1] ?? '');
    }
    expect(found.size).toBeGreaterThan(0);
    for (const entryPoint of [...found].sort()) {
      expect(
        STUDY_ENTRY_POINTS[entryPoint],
        `benchmark/ exports a study entry point "${entryPoint}" that published.ts does not classify. ` +
          'Map it to a PublishedStudyId, or to "no-intervals" with a reason.',
      ).toBeDefined();
    }
    for (const entryPoint of Object.keys(STUDY_ENTRY_POINTS)) {
      expect(
        found.has(entryPoint),
        `STUDY_ENTRY_POINTS names "${entryPoint}", which benchmark/ no longer exports.`,
      ).toBe(true);
    }
  });

  it('holds a non-empty pin table for every study id, and no id the table does not cover', () => {
    expect(Object.keys(PINNED_ESTIMATES).sort()).toEqual([...PUBLISHED_STUDY_IDS].sort());
    for (const studyId of PUBLISHED_STUDY_IDS) {
      expect(
        Object.keys(PINNED_ESTIMATES[studyId]).length,
        `study "${studyId}" is in the domain with no pinned figures`,
      ).toBeGreaterThan(0);
    }
    const covered = new Set(
      Object.values(STUDY_ENTRY_POINTS).filter((value) => value !== 'no-intervals'),
    );
    expect([...covered].sort()).toEqual([...PUBLISHED_STUDY_IDS].sort());
  });

  it('has a suite calling checkPinned for every study id — Layer A is where the runs already are', () => {
    // A pin table nobody compares against is the dead-seam shape one level up (CLAUDE.md: *name the
    // non-test caller*). Here the callers are tests by construction, so what is enforced is that
    // they exist, enumerated from the domain rather than from memory.
    const suites = modules()
      .filter(([name]) => name.endsWith('.test.ts'))
      .map(([, source]) => source)
      .join('\n');
    for (const studyId of PUBLISHED_STUDY_IDS) {
      const called = new RegExp(String.raw`checkPinned\(\s*'${studyId}'`).test(suites);
      expect(
        called,
        `no suite in benchmark/ calls checkPinned('${studyId}', …), so that study's pins are never compared against a run.`,
      ).toBe(true);
    }
  });
});

describe('publishedForm renders an interval the way this package writes one', () => {
  it('uses an explicit sign and U+2212, at the precision asked for', () => {
    const pin = { n: 250, mean: -1.6547939976491208, standardError: 0.45627396185145397, lower: -2.5534423872598953, upper: -0.7561456080383463 };
    expect(publishedForm(pin, 2)).toBe('−1.65 [−2.55, −0.76]');
    expect(publishedForm(pin, 3)).toBe('−1.655 [−2.553, −0.756]');
    // The double rounding that produced two of the three known defects: 3 dp then 2 dp is −1.66,
    // and rendering from the estimate is the only thing that tells the two apart.
    expect(publishedForm(pin, 2)).not.toBe('−1.66 [−2.55, −0.76]');
    expect(publishedForm({ n: 1, mean: 0, standardError: 0, lower: 0, upper: 0 }, 2)).toBe(
      '+0.00 [+0.00, +0.00]',
    );
  });
});

describe('every interval printed in benchmark/ is re-derivable from a pinned estimate', () => {
  it('partitions the scanned literals exactly into derivable and declared-unpinned', () => {
    const derivable = derivableForms();
    const scanned = scanPublishedIntervals();

    const undeclared: string[] = [];
    const actualUnpinned = new Map<string, number>();
    let derivableCount = 0;
    for (const [file, counts] of scanned) {
      for (const [text, count] of counts) {
        if (derivable.has(text)) {
          derivableCount += count;
          continue;
        }
        actualUnpinned.set(`${file} ${text}`, count);
      }
    }

    const expectedUnpinned = new Map(
      UNPINNED_INTERVALS.map((entry) => [`${entry.file} ${entry.text}`, entry.count]),
    );

    for (const [key, count] of actualUnpinned) {
      const [file, text] = key.split(' ');
      const expected = expectedUnpinned.get(key);
      if (expected === undefined) {
        undeclared.push(
          `${file}: "${text}" ×${count} — printed, but no pinned estimate renders it and ` +
            'UNPINNED_INTERVALS does not declare it. Either the number drifted, or the study that ' +
            'produces it needs an entry point and a pin.',
        );
      } else if (expected !== count) {
        undeclared.push(
          `${file}: "${text}" appears ${count} time(s), UNPINNED_INTERVALS declares ${expected}. ` +
            'A changed count is how review finding #4 looks — the same text correct in one place ' +
            'and wrong in another.',
        );
      }
    }
    for (const [key, count] of expectedUnpinned) {
      const [file, text] = key.split(' ');
      if (!actualUnpinned.has(key)) {
        undeclared.push(
          `${file}: UNPINNED_INTERVALS declares "${text}" ×${count}, which no longer appears there ` +
            'un-derivable. If a pin now reproduces it, delete the entry — the gap has closed.',
        );
      }
    }

    expect(undeclared.join('\n'), undeclared.join('\n')).toBe('');
    // Reported so the scan's reach is visible rather than assumed: a regex that quietly stopped
    // matching would otherwise pass this suite by finding nothing.
    console.log(
      `published intervals in benchmark/: ${derivableCount} re-derived from ${
        Object.values(PINNED_ESTIMATES).reduce((total, pins) => total + Object.keys(pins).length, 0)
      } pinned estimates, ` +
        `${[...actualUnpinned.values()].reduce((total, count) => total + count, 0)} declared unpinned.`,
    );
    expect(derivableCount).toBeGreaterThan(100);
  });

  it('gives every unpinned interval a reason, and names a real file', () => {
    const files = new Set(modules().map(([name]) => `benchmark/${name}`));
    for (const entry of UNPINNED_INTERVALS) {
      expect(files.has(entry.file), `UNPINNED_INTERVALS names a missing file "${entry.file}"`).toBe(
        true,
      );
      expect(entry.reason.length, `"${entry.text}" is exempted with no reason`).toBeGreaterThan(40);
      expect(entry.count).toBeGreaterThan(0);
    }
  });
});

describe('the pin generator still emits what the pin table holds', () => {
  it('round-trips every pinned key through renderPinTable', () => {
    // `regeneratePins.ts` is the only supported way to move a pin, so an emitter that had drifted
    // from the table's shape would be discovered at the worst possible moment — mid-correction.
    const measured = {} as Record<PublishedStudyId, ReadonlyMap<string, PinnedEstimate>>;
    for (const studyId of PUBLISHED_STUDY_IDS) {
      measured[studyId] = new Map(Object.entries(PINNED_ESTIMATES[studyId]));
    }
    const rendered = renderPinTable(measured);
    for (const studyId of PUBLISHED_STUDY_IDS) {
      for (const key of Object.keys(PINNED_ESTIMATES[studyId])) {
        expect(rendered.includes(JSON.stringify(key))).toBe(true);
      }
    }
    expect(rendered.startsWith('export const PINNED_ESTIMATES')).toBe(true);
  });
});
