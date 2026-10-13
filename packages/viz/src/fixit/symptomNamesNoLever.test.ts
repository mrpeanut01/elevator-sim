/**
 * **Fix-it's as-built lines name the symptom, never the lever** — [§ D1425](../../../../DECISIONS.md),
 * decision swarm DS's Q4 ruling.
 *
 * The terracotta line on a case's as-built card (and under the tutorial's *What you are looking
 * at*) is `FixitCase.symptom`. It says who waits and where: people, or a place where people stand,
 * as its subject, and no machinery, no setting and no figure. `fixit/parse.ts` refuses a case that
 * breaks the first two at load time ({@link symptomLeverIn}, {@link symptomFigureIn}); this file
 * holds the shipped lines to all three and keeps the lines the rule was written against, so the
 * rule's own result on them stays checkable.
 *
 * ## Which cases got a new line, and why that set
 *
 * The ruling: *"a word test is derived from each case's as-built patch, and it catches number words
 * as well as numerals … The lane takes the union of their lists and the test's own result."* So
 * {@link REWRITTEN} is derived here as the union of {@link MEMBER_LISTS} (S1, S2 and S3 each named
 * the cases they judged to need one) and what {@link symptomLeverIn} and {@link symptomFigureIn}
 * flag on {@link LINES_BEFORE_D1425}. The word test flags fifteen; the members add
 * `let-faster-than-the-lifts`, whose old line stated a cause rather than a sight, which no word list
 * can see. Two lines stand.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { symptomFigureIn, symptomLeverIn } from './parse.js';
import type { FixitCase } from './types.js';

/** The shipped symptom lines as they stood before § D1425, keyed by case id. */
const LINES_BEFORE_D1425: Readonly<Record<string, string>> = Object.freeze({
  'sleeping-sky-lobby': 'waits over a minute for a car down, while the shuttles sit at the street',
  'zoning-starves-the-top': 'one car answering nine dense floors, and a crowd stood at every landing it serves',
  'three-cars-one-cars-work': 'waits over a minute for a car up, while three cars stand together below',
  'doors-that-never-close': 'doors held eleven seconds at every stop, on every car',
  'cars-that-always-go-home': 'waits over a minute at the top of the tower, while the cars wait at its bottom',
  'car-park-nobody-serves': 'one car for the garage, and a crowd on its landing beside a hoistway standing empty',
  'express-that-stops-everywhere': 'express cars stopping at every floor below the zone they were built for',
  'deliveries-on-the-passenger-group':
    'two cars standing doors-open twenty-five seconds at every stop, through the busiest hours',
  'one-start-time': 'a lobby queue that outgrows four cars every morning at nine',
  'every-letter-says-nine': 'seven hundred appointment letters, one printed time',
  'everyone-leaves-at-once': 'a landing crowd of hundreds, served one carload at a time',
  'bed-cars-locked-out': 'the two bed cars pass the surgical floors without stopping',
  'two-cars-out-wrong-month': 'one car in service for the whole upper zone',
  'every-deck-calls-itself-full': 'decks that stop boarding at a fraction of their plated load',
  'restaurant-above-the-ballroom': 'a lunchtime landing served by whatever the rest of the house spares',
  'controller-sends-every-car': 'two cars answering where one was wanted',
  'let-faster-than-the-lifts': 'a lobby sized for a smaller building than the one above it',
  'gym-on-the-top-floor': 'gym journeys waiting for cars parked at the door',
});

/** The cases each swarm member named as needing a new line (`decide-ds` S1, S2 and S3, § Q4). */
const MEMBER_LISTS: Readonly<Record<'S1' | 'S2' | 'S3', readonly string[]>> = Object.freeze({
  S1: [
    'sleeping-sky-lobby', 'zoning-starves-the-top', 'three-cars-one-cars-work', 'doors-that-never-close',
    'cars-that-always-go-home', 'car-park-nobody-serves', 'express-that-stops-everywhere',
    'deliveries-on-the-passenger-group', 'every-letter-says-nine', 'bed-cars-locked-out',
    'two-cars-out-wrong-month', 'every-deck-calls-itself-full', 'controller-sends-every-car',
    'let-faster-than-the-lifts', 'gym-on-the-top-floor',
  ],
  S2: [
    'sleeping-sky-lobby', 'zoning-starves-the-top', 'three-cars-one-cars-work', 'doors-that-never-close',
    'cars-that-always-go-home', 'car-park-nobody-serves', 'express-that-stops-everywhere',
    'deliveries-on-the-passenger-group', 'one-start-time', 'every-letter-says-nine', 'bed-cars-locked-out',
    'two-cars-out-wrong-month', 'every-deck-calls-itself-full', 'controller-sends-every-car',
    'let-faster-than-the-lifts', 'gym-on-the-top-floor',
  ],
  S3: [
    'sleeping-sky-lobby', 'cars-that-always-go-home', 'gym-on-the-top-floor', 'zoning-starves-the-top',
    'three-cars-one-cars-work', 'car-park-nobody-serves', 'express-that-stops-everywhere',
    'bed-cars-locked-out', 'two-cars-out-wrong-month', 'doors-that-never-close',
    'deliveries-on-the-passenger-group', 'every-letter-says-nine', 'every-deck-calls-itself-full',
    'controller-sends-every-car',
  ],
});

/** What the word test flags on the old lines, pinned so a change to the word lists is a visible diff. */
const FLAGGED_BEFORE_D1425: readonly string[] = [
  'bed-cars-locked-out', 'car-park-nobody-serves', 'cars-that-always-go-home', 'controller-sends-every-car',
  'deliveries-on-the-passenger-group', 'doors-that-never-close', 'every-deck-calls-itself-full',
  'every-letter-says-nine', 'express-that-stops-everywhere', 'gym-on-the-top-floor', 'one-start-time',
  'sleeping-sky-lobby', 'three-cars-one-cars-work', 'two-cars-out-wrong-month', 'zoning-starves-the-top',
];

/**
 * **Who waits, or where**: a person, a crowd, or a place a person stands. A line with none of these
 * has machinery or a setting as its subject, whatever else it avoids. Owner-reversible with the
 * word families (§ D1425).
 */
const PEOPLE_OR_PLACE =
  /\b(?:people|person|riders?|passengers?|tenants?|residents?|guests?|patients?|visitors?|staff|porters?|commuters?|diners?|delegates?|everyone|everybody|crowds?|queues?|landings?|lobby|lobbies|floors?|flats|street|garage|entrance|reception|gym|restaurant|ballroom|wards?|theatres?|clinics?|outpatients|platforms?|corridors?|dock)\b/iu;

let cases: readonly FixitCase[];

beforeAll(async () => {
  const raw = JSON.parse(await readFile(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as {
    readonly cases: readonly FixitCase[];
  };
  cases = raw.cases;
}, 60_000);

/** Whether the word test flags a line on a case: a figure, or a word its as-built patch writes. */
function flagged(symptom: string, asBuilt: FixitCase['asBuilt']): boolean {
  return symptomFigureIn(symptom) !== null || symptomLeverIn(symptom, asBuilt) !== null;
}

function caseById(id: string): FixitCase {
  const found = cases.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no shipped case "${id}"`);
  return found;
}

/** The union the ruling asks for: every member's list and the word test's own result. */
function rewrittenIds(): readonly string[] {
  const ids = new Set<string>([...MEMBER_LISTS.S1, ...MEMBER_LISTS.S2, ...MEMBER_LISTS.S3, ...FLAGGED_BEFORE_D1425]);
  return [...ids].sort();
}

describe('fix-it as-built lines name the symptom, never the lever (§ D1425)', () => {
  it('the word test, derived from each as-built patch, flags the old lines it was written against', () => {
    expect(Object.keys(LINES_BEFORE_D1425).sort()).toEqual(cases.map((entry) => entry.id).sort());
    const found = cases
      .filter((entry) => flagged(LINES_BEFORE_D1425[entry.id] ?? '', entry.asBuilt))
      .map((entry) => entry.id)
      .sort();
    expect(found).toEqual([...FLAGGED_BEFORE_D1425].sort());
  });

  it('every case in the union has a new line, and every other line stands', () => {
    const rewritten = new Set(rewrittenIds());
    expect(rewritten.size).toBe(16);
    for (const entry of cases) {
      const before = LINES_BEFORE_D1425[entry.id];
      if (rewritten.has(entry.id)) expect(entry.symptom, entry.id).not.toBe(before);
      else expect(entry.symptom, entry.id).toBe(before);
    }
  });

  it('every shipped line names who waits or where, and no figure, machinery or setting', () => {
    for (const entry of cases) {
      expect(symptomFigureIn(entry.symptom), `${entry.id}: "${entry.symptom}"`).toBeNull();
      expect(symptomLeverIn(entry.symptom, entry.asBuilt), `${entry.id}: "${entry.symptom}"`).toBeNull();
      expect(PEOPLE_OR_PLACE.test(entry.symptom), `${entry.id}: "${entry.symptom}" names nobody and nowhere`).toBe(true);
    }
  });

  it('keeps PM-FB2’s old examples red: doors held on a dwell case, cars standing on a parking case', () => {
    expect(symptomLeverIn('doors held at every stop', caseById('doors-that-never-close').asBuilt)?.family).toBe('doors');
    expect(symptomLeverIn('a queue while nothing is held', caseById('doors-that-never-close').asBuilt)?.word).toBe('held');
    expect(symptomLeverIn('three cars standing together', caseById('cars-that-always-go-home').asBuilt)?.word).toBe('cars');
    expect(symptomLeverIn('people waiting by the parked fleet', caseById('gym-on-the-top-floor').asBuilt)?.word).toBe('parked');
  });

  it('catches a figure in words before a unit, and lets a spelled count with no unit stand', () => {
    expect(symptomFigureIn('doors held eleven seconds at every stop')).toBe('eleven seconds');
    expect(symptomFigureIn('two cars standing doors-open twenty-five seconds')).toBe('twenty-five seconds');
    expect(symptomFigureIn('one car answering nine dense floors')).toBe('nine dense floors');
    expect(symptomFigureIn('seven hundred people on the landing')).toBe('seven hundred people');
    expect(symptomFigureIn('a landing crowd of hundreds, served one carload at a time')).toBeNull();
    expect(symptomFigureIn('waits over a minute')).toBeNull();
  });

  it('reads the families off the patch: a crowd-only case refuses the tenancy words and not the machinery', () => {
    const crowdOnly = caseById('everyone-leaves-at-once').asBuilt;
    expect(symptomLeverIn('a crowd at nine, every letter printed alike', crowdOnly)?.family).toBe('tenancy');
    expect(symptomLeverIn('a crowd watching the cars', crowdOnly)).toBeNull();
    expect(symptomLeverIn('a lobby queue at nine', caseById('one-start-time').asBuilt)?.family).toBe('tenancy');
    expect(symptomLeverIn('decks leaving half full', caseById('every-deck-calls-itself-full').asBuilt)).not.toBeNull();
    expect(symptomLeverIn('commuters left behind', caseById('every-deck-calls-itself-full').asBuilt)).toBeNull();
  });
});
