/**
 * **A fix case's as-built line says what the building is, never what is wrong with it** —
 * [§ D1233](../../../../DECISIONS.md), wave AL's swarm DN, Q3 ruling item 1.
 *
 * The as-built line is drawn under the complaint and **before** the diagnosis is asked for
 * (`everyday/fixitScreen.ts`, the as-built block), so [§ D1120](../../../../DECISIONS.md)'s *the
 * diagnosis waits until asked* holds only if that line does not carry the diagnosis itself. On the
 * base of wave AL it did on most cases: *"the door dwell on all five is set to eleven seconds, the
 * figure the luggage trolleys needed"*, *"the lockout was never lifted"*, *"divided by the eight cars
 * of the bank instead of by the two decks of the car"*. The swarm's three members counted 12, 13
 * and 16 of 18 by their own readings; this file's reading is 16, and it is the one held below.
 *
 * ## What is held, and why it is a list rather than a detector
 *
 * Each case names the words that would say its cause: the setting the diagnosed repair changes, its
 * standing value, and the clause that says why it is wrong. Those are read off each case's own
 * diagnosis and diagnosed repair, and they are **per case** because the same word is fabric on one
 * building and the fault on another: *idle* is the answer at the gym and nothing at the ballroom.
 * An automatic overlap between the note and the diagnosis was tried first and did not separate the
 * two (it flags *shuttles* on the sky lobby, which is the building, and misses *never lifted*, which
 * is the fault), so the list is authored and the arm below holds it to something.
 *
 * - **Every shipped case has an entry**, so a nineteenth case cannot pass by not being listed.
 * - **No note matches its own case's terms.**
 * - **The retired notes match**, verbatim, on every case that was rewritten: that is the arm that
 *   makes the green one mean something, since a list of terms nothing could match would pass too.
 *
 * What stays on the note is the building a player can see in the editor and on the stage: its cars,
 * its banks, its floors and who uses them. The complaint is untouched, because a tenant reports what
 * they see, and the diagnosis keeps the cause, which is where the product says it is.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';

interface RawCase {
  readonly id: string;
  readonly asBuilt: { readonly note: string };
}

let cases: readonly RawCase[];

beforeAll(async () => {
  const raw = JSON.parse(await readFile(join(DATA_DIR, 'fixit-cases.json'), 'utf8')) as {
    readonly cases: readonly RawCase[];
  };
  cases = raw.cases;
}, 60_000);

/** The words that would name each case's cause, read off its diagnosis and its diagnosed repair. */
const CAUSE_TERMS: Readonly<Record<string, readonly RegExp[]>> = Object.freeze({
  'sleeping-sky-lobby': [/\bpark/iu, /\bground floor\b/iu, /\bsent\b/iu, /\bidle\b/iu],
  'zoning-starves-the-top': [/\bre-let\b/iu, /\bafter the split\b/iu, /\bfloor count\b/iu, /\bheads?(?:count)?\b/iu, /\bdense\b/iu],
  'three-cars-one-cars-work': [/\bnearest\b/iu, /\bspread/iu, /\bidle\b/iu, /\btogether\b/iu],
  'doors-that-never-close': [/\bdwell\b/iu, /\beleven\b/iu, /\bseconds?\b/iu, /\btrolley/iu, /\bdoors? (?:held|open)\b/iu],
  'cars-that-always-go-home': [/\bsent\b/iu, /\bback down\b/iu, /\bto wait\b/iu, /\bidle\b/iu, /\bbetween calls\b/iu],
  'car-park-nobody-serves': [/\bone of them\b/iu, /\bcarries on down\b/iu, /\blanding doors?\b/iu, /\bfit-out contract\b/iu, /\bone car\b/iu],
  'express-that-stops-everywhere': [/\bexpress\b/iu, /\bevery landing\b/iu, /\brestrict/iu, /\bsince commissioning\b/iu, /\banswer/iu],
  'deliveries-on-the-passenger-group': [/\bdoor hold\b/iu, /\bhold (?:their|its) doors?\b/iu, /\btwenty-five\b/iu, /\bseconds?\b/iu, /\bmorning peak\b/iu, /\bcages? ride\b/iu],
  'one-start-time': [/\bstart time\b/iu, /\bnine\b/iu, /\bcontractual\b/iu, /\bat once\b/iu, /\bsame (?:time|minute)\b/iu],
  'every-letter-says-nine': [/\bnine\b/iu, /\bo'clock\b/iu, /\bappointment letter/iu, /\bsame (?:time|window)\b/iu, /\bone (?:printed )?time\b/iu],
  'everyone-leaves-at-once': [/\bconfigured\b/iu, /\bordinary\b/iu, /\bkey(?:ed)?\b/iu, /\bone car\b/iu],
  'bed-cars-locked-out': [/\block(?:ed)? out\b/iu, /\blockout\b/iu, /\bnever lifted\b/iu, /\brefurbish/iu, /\bsurgical\b/iu],
  'two-cars-out-wrong-month': [/\btogether\b/iu, /\bfullest\b/iu, /\bbusiest\b/iu, /\bcalendar\b/iu, /\btwo of the three\b/iu, /\bmonth\b/iu],
  'every-deck-calls-itself-full': [/\bload weighing\b/iu, /\bdivided\b/iu, /\bplated?\b/iu, /\binstead of\b/iu, /\bfull\b/iu],
  'restaurant-above-the-ballroom': [/\bfill the rank\b/iu, /\bat lunch\b/iu, /\bshares?\b/iu, /\bbusiest\b/iu],
  'controller-sends-every-car': [/\bsplits?\b/iu, /\bevery car\b/iu, /\bwhatever is free\b/iu, /\btwo cars\b/iu],
  'let-faster-than-the-lifts': [/\bsix hundred more\b/iu, /\bunchanged\b/iu, /\bsized for\b/iu, /\brise\b/iu, /\d+ ?%/u, /\bundersized\b/iu],
  'gym-on-the-top-floor': [/\bpark/iu, /\bfront door\b/iu, /\bidle\b/iu, /\bthe way they were set\b/iu],
});

/**
 * The as-built lines this file retired, verbatim as `data/fixit-cases.json` carried them on
 * `c2ca845`. Every one must match its own case's terms, or the list above is too weak to have caught
 * it. The two cases absent from this map carried a note that already named no cause and were kept.
 */
const RETIRED_NOTES: Readonly<Record<string, string>> = Object.freeze({
  'zoning-starves-the-top':
    'Four cars split into a low-rise and a high-rise bank; the upper floors were re-let to a dense tenant after the split was drawn.',
  'doors-that-never-close':
    'Five cars serve every floor from the dock to the top of the house, and the door dwell on all five is set to eleven seconds — the figure the luggage trolleys needed.',
  'cars-that-always-go-home':
    'Four tower cars carry the flats above the sky lobby, and between calls every one of them is sent back down to the sky lobby to wait.',
  'car-park-nobody-serves':
    'Four cars serve the tower, and exactly one of them — by the original fit-out contract — carries on down to the garage level, which half the building drives in through.',
  'express-that-stops-everywhere':
    'Three cars were built to run express to the upper zone; since commissioning they have answered every landing in the building.',
  'deliveries-on-the-passenger-group':
    'Five cars carry the whole hospital, and the two big trolley cars have their door hold set to twenty-five seconds — the time a supply cage needs — while the cages ride through the morning peak.',
  'one-start-time': 'Seventeen hundred desks, four cars, and one contractual start time for every tenant in the tower.',
  'every-letter-says-nine':
    "Outpatients runs every clinic from the first floor, and every appointment letter in the building says nine o'clock — seven hundred of them.",
  'everyone-leaves-at-once':
    'The ballroom floor is let to a conference of seven hundred, and when a session breaks they all press down within minutes — into a group configured for an ordinary hotel afternoon.',
  'bed-cars-locked-out':
    "The two cars big enough for a bed were locked out of the surgical floors during last year's refurbishment, and the lockout was never lifted.",
  'two-cars-out-wrong-month':
    'The upper-zone refit takes two of the three high cars out together, in the fullest month of the year. The scope of works is right; the calendar is not.',
  'every-deck-calls-itself-full':
    "Eight double-deck shuttles link the street to the sky lobbies. At commissioning, each deck's load weighing was set to the car's plated figure divided by the eight cars of the bank — instead of by the two decks of the car.",
  'restaurant-above-the-ballroom':
    'The third floor was relaunched as a restaurant and spa doing three hundred covers, above a ballroom and a reception that already fill the rank at lunch.',
  'controller-sends-every-car':
    'The tower cars answer the flats above the sky lobby, and the controller splits every waiting group across every car it can reach — press once, and whatever is free starts moving.',
  'let-faster-than-the-lifts':
    'A year of dense lettings put six hundred more people above an unchanged six-car group — a rise of 61 % on the population the two banks were sized for.',
  'gym-on-the-top-floor':
    "The top floor became the residents' gym in January, and the block's two cars still spend every idle moment parked at the front door, the way they were set when the building opened.",
});

function namedCauses(caseId: string, note: string): readonly string[] {
  return (CAUSE_TERMS[caseId] ?? []).filter((term) => term.test(note)).map((term) => term.source);
}

describe('a fix case’s as-built line names no fault before the diagnosis is asked for', () => {
  it('lists the cause of every shipped case, and nothing else', () => {
    expect(Object.keys(CAUSE_TERMS).sort()).toEqual(cases.map((entry) => entry.id).sort());
  });

  it('draws no as-built line that names its own case’s cause', () => {
    const found = cases
      .map((entry) => ({ id: entry.id, terms: namedCauses(entry.id, entry.asBuilt.note) }))
      .filter((row) => row.terms.length > 0)
      .map((row) => `${row.id}: ${row.terms.join(', ')}`);
    expect(
      found,
      'the as-built line is drawn before the diagnosis is asked for, so a line that names the ' +
        'setting, its value or why it is wrong is the answer printed above the question.',
    ).toEqual([]);
  });

  it('would have caught every line it retired', () => {
    const missed = Object.entries(RETIRED_NOTES)
      .filter(([id, note]) => namedCauses(id, note).length === 0)
      .map(([id]) => id);
    expect(missed).toEqual([]);
    /* And the retired lines are gone from the file, so the arm is about lines that really shipped. */
    for (const entry of cases) {
      const retired = RETIRED_NOTES[entry.id];
      if (retired !== undefined) expect(entry.asBuilt.note, entry.id).not.toBe(retired);
    }
  });
});
