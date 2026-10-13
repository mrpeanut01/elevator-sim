/**
 * **Whether *keep* can be wrong on a dealt week, judged on the day's verdict, and the driver offer
 * the census leaves** — wave AO, lane DR-2, [§ D1440](../../../../DECISIONS.md) to
 * [§ D1443](../../../../DECISIONS.md), swarm DR's ruling Q2 items 1 to 3 and Q3's DC-13.
 *
 * ## What was wrong
 *
 * § D1337's trap check read the who-drives row's ten-minute counts on the careful week's easy
 * crowds, under one driver, and found nothing wrong. The day is graded on its whole run, and on
 * Midtown's dealt week the row's favourite lost the day about as often as it won (swarm DR's S1:
 * 20 of 55 split rows), *keep* was nearly always safe for a player on Predictive balanced (3 of 18
 * split rows lost), and Energy aware, offered as a switch target, saved the day on 2 of 18. None of
 * that is visible to a count. The gate is therefore the day's verdict, on census crowds 0, 5, 10
 * and 15 rather than the census's easy first four (§ D1440), and the count check is published.
 *
 * ## What this reads
 *
 * `data/call-bands.json`: every raised who-drives call the careful line meets on each week order a
 * tower deals from week 2, under each of the two profiles DC-11 shows holding that week most, with
 * each answer's day verdict and each offer candidate's (a candidate the card does not offer is run
 * beside it, a shadow). `everyday/callBands.sweep.test.ts` measures the rows nightly and requires
 * them to be exactly these; everything else here is arithmetic over them.
 *
 * - A row **splits** where *keep* and the two offered answers do not all reach one verdict.
 * - **The keep band**: *keep* is the losing answer on at least a fifth and at most three fifths of
 *   the split rows (S1's band and S2's ceiling, overlapping there).
 * - **The floor**: every switch target clears on at least one split row in five of those it is
 *   measured on (S1's floor).
 * - **The ceiling**: no answer on the card clears on more than two thirds of the split rows it is on
 *   (S3's ceiling).
 *
 * ## The offer list
 *
 * {@link driverOfferOf}: the protocol's candidates in their order, less every candidate that misses
 * the floor on a row it was measured on. So the who-drives pair (`dayCalls.ts#dayCallDriversOf`) is
 * taken from the census, not from a list of names in code; a candidate the census cannot place
 * (no split row) stays where the protocol put it. The protocol's order puts Capacity aware where
 * Energy aware stood, the ruling's first candidate for that place.
 *
 * ## What it refuses
 *
 * - **No share across crowds is published as a rate**: each reading is a count over named crowds.
 * - **No band moves to make a week pass.** A dealt week that misses keeps its miss and says so
 *   (DC-13, {@link weekBandsLinesOf}); a miss is a finding for a ruling.
 * - **Nothing the stage shows reads these verdicts.** The card stays identical whether a call turns
 *   the day or not (§ D1138 clause 2); the week sheet states the census's check and no forecast.
 */

import callBandsDocument from '../../../../data/call-bands.json' with { type: 'json' };

import type { ContractWeekOrder } from './ladder.js';

/* -------------------------------------------------------------------------- *
 * The file
 * -------------------------------------------------------------------------- */

/** A share as a fraction, so a bound is exact: `[1, 5]` is a fifth. */
export type CallBandsShare = readonly [number, number];

export interface CallBandsProtocol {
  readonly contractId: string;
  /** Indexes into DC-10's held-out crowds (`data/week-way.json`), the crowds the census plays. */
  readonly crowds: readonly number[];
  /** The careful line's placement answer; who drives is always kept. */
  readonly placement: 'park-cars-lobby' | 'spread-cars' | 'leave';
  /** The offer candidates in the order a pair is taken, before the floor removes any. */
  readonly candidates: readonly string[];
  readonly keepLosesAtLeast: CallBandsShare;
  readonly keepLosesAtMost: CallBandsShare;
  readonly switchClearsAtLeast: CallBandsShare;
  readonly answerClearsAtMost: CallBandsShare;
}

/** One raised who-drives call: its pair and every verdict run from it, `C` cleared, `m` missed. */
export interface CallBandsCall {
  /** Index into DC-10's held-out crowds. */
  readonly crowd: number;
  /** The order's weekday, 1 to 5. */
  readonly day: number;
  readonly atS: number;
  /** The two switch targets the card offered, `driver-a` then `driver-b`. */
  readonly offered: readonly string[];
  /** `keep` and each offered or shadow profile's run from the call, graded with the day's goals. */
  readonly marks: Readonly<Record<string, 'C' | 'm'>>;
}

/** One week order under one banded profile, the careful line on every census crowd. */
export interface CallBandsRow {
  readonly orderId: string;
  /** The week it is dealt as. */
  readonly week: number;
  readonly briefDriver: string;
  /** The order's five drawn ids, so a row measured on another order reads as stale. */
  readonly days: readonly string[];
  /** Per census crowd in protocol order, Monday to Friday, the careful line's own day verdicts. */
  readonly dayMarks: readonly string[];
  readonly calls: readonly CallBandsCall[];
}

export interface CallBands {
  readonly version: number;
  readonly protocol: CallBandsProtocol;
  readonly rows: readonly CallBandsRow[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}
function asStrings(value: unknown): readonly string[] {
  return Object.freeze(Array.isArray(value) ? value.map(asString) : []);
}
function asShare(value: unknown): CallBandsShare {
  const [num, den] = Array.isArray(value) ? value : [];
  return Object.freeze([asNumber(num), asNumber(den)] as const);
}
function asPlacement(value: unknown): CallBandsProtocol['placement'] {
  return value === 'spread-cars' || value === 'leave' ? value : 'park-cars-lobby';
}

/** Structure only; {@link callBandsIssues} names a malformed field. */
export function parseCallBands(input: unknown): CallBands {
  const record = asRecord(input);
  const protocol = asRecord(record['protocol']);
  const rows = Array.isArray(record['rows']) ? (record['rows'] as unknown[]) : [];
  return Object.freeze({
    version: asNumber(record['version']),
    protocol: Object.freeze({
      contractId: asString(protocol['contractId']),
      crowds: Object.freeze(Array.isArray(protocol['crowds']) ? protocol['crowds'].map(asNumber) : []),
      placement: asPlacement(protocol['placement']),
      candidates: asStrings(protocol['candidates']),
      keepLosesAtLeast: asShare(protocol['keepLosesAtLeast']),
      keepLosesAtMost: asShare(protocol['keepLosesAtMost']),
      switchClearsAtLeast: asShare(protocol['switchClearsAtLeast']),
      answerClearsAtMost: asShare(protocol['answerClearsAtMost']),
    }),
    rows: Object.freeze(
      rows.map((value) => {
        const row = asRecord(value);
        const calls = Array.isArray(row['calls']) ? (row['calls'] as unknown[]) : [];
        return Object.freeze({
          orderId: asString(row['orderId']),
          week: asNumber(row['week']),
          briefDriver: asString(row['briefDriver']),
          days: asStrings(row['days']),
          dayMarks: asStrings(row['dayMarks']),
          calls: Object.freeze(
            calls.map((entry) => {
              const call = asRecord(entry);
              const marks = asRecord(call['marks']);
              return Object.freeze({
                crowd: asNumber(call['crowd']),
                day: asNumber(call['day']),
                atS: asNumber(call['atS']),
                offered: asStrings(call['offered']),
                marks: Object.freeze(
                  Object.fromEntries(
                    Object.entries(marks).map(([id, mark]) => [id, mark === 'C' ? ('C' as const) : ('m' as const)]),
                  ),
                ),
              });
            }),
          ),
        });
      }),
    ),
  });
}

/** The shipped census. */
export const CALL_BANDS: CallBands = parseCallBands(callBandsDocument);

/* -------------------------------------------------------------------------- *
 * The arithmetic
 * -------------------------------------------------------------------------- */

/** Whether a call's card answers, *keep* and its two offered targets, reach more than one verdict. */
export function callSplits(call: CallBandsCall): boolean {
  const verdicts = new Set(['keep', ...call.offered].map((id) => call.marks[id]).filter((mark) => mark !== undefined));
  return verdicts.size > 1;
}

/** `count / of` against a bound: at least, or at most. Zero rows meets neither side. */
function atLeast(count: number, of: number, [num, den]: CallBandsShare): boolean {
  return of > 0 && count * den >= num * of;
}
function atMost(count: number, of: number, [num, den]: CallBandsShare): boolean {
  return of > 0 && count * den <= num * of;
}

/** A count over the split rows an answer was measured on. */
export interface CallBandsTally {
  readonly id: string;
  readonly clears: number;
  readonly of: number;
}

/** What one row's arithmetic says. */
export interface CallBandsReading {
  readonly calls: number;
  readonly split: number;
  /** Split rows on which *keep* missed, so another answer on the card cleared. */
  readonly keepLoses: number;
  /** Whether *keep* loses on at least a fifth and at most three fifths of the split rows. */
  readonly keepBand: 'holds' | 'under' | 'over' | 'no-split';
  /** Each answer on the card: *keep*, then each target offered on a split row. */
  readonly card: readonly CallBandsTally[];
  /** Every switch target measured on a split row, offered or shadow, in first-measured order. */
  readonly targets: readonly CallBandsTally[];
  /** Switch targets the card offered that clear on under the floor: a miss in play. */
  readonly underFloor: readonly CallBandsTally[];
  /** Every measured target, offered or shadow, under the floor: what the offer list drops. */
  readonly candidatesUnderFloor: readonly CallBandsTally[];
  /** Answers on the card that clear on over the ceiling. */
  readonly overCeiling: readonly CallBandsTally[];
  /** The three checks hold together. */
  readonly passes: boolean;
  /** Each check in words, for the sweep's summary and the week sheet's reasons. */
  readonly lines: readonly string[];
}

function tallyOf(splits: readonly CallBandsCall[], id: string, onCard: boolean): CallBandsTally {
  const measured = splits.filter((call) => call.marks[id] !== undefined && (!onCard || id === 'keep' || call.offered.includes(id)));
  return { id, clears: measured.filter((call) => call.marks[id] === 'C').length, of: measured.length };
}

/** **One row's bands** — see the module docstring. */
export function callBandsReadingOf(row: CallBandsRow, protocol: CallBandsProtocol): CallBandsReading {
  const splits = row.calls.filter(callSplits);
  const keepLoses = splits.filter((call) => call.marks['keep'] === 'm').length;
  const keepBand: CallBandsReading['keepBand'] =
    splits.length === 0
      ? 'no-split'
      : !atLeast(keepLoses, splits.length, protocol.keepLosesAtLeast)
        ? 'under'
        : !atMost(keepLoses, splits.length, protocol.keepLosesAtMost)
          ? 'over'
          : 'holds';
  const offered: string[] = [];
  const measured: string[] = [];
  for (const call of splits) {
    for (const id of call.offered) if (!offered.includes(id)) offered.push(id);
    for (const id of Object.keys(call.marks)) if (id !== 'keep' && !measured.includes(id)) measured.push(id);
  }
  const card = [tallyOf(splits, 'keep', true), ...offered.map((id) => tallyOf(splits, id, true))];
  const targets = measured.map((id) => tallyOf(splits, id, false));
  const candidatesUnderFloor = targets.filter((tally) => !atLeast(tally.clears, tally.of, protocol.switchClearsAtLeast));
  const underFloor = candidatesUnderFloor.filter((tally) => offered.includes(tally.id));
  const overCeiling = card.filter((tally) => tally.of > 0 && !atMost(tally.clears, tally.of, protocol.answerClearsAtMost));
  const passes = keepBand === 'holds' && underFloor.length === 0 && overCeiling.length === 0;
  const lines = [
    `${String(row.calls.length)} who-drives calls, ${String(splits.length)} split the day`,
    `keep lost ${String(keepLoses)} of ${String(splits.length)} (${keepBand})`,
    ...card.map((tally) => `${tally.id} cleared ${String(tally.clears)} of ${String(tally.of)} on the card`),
    ...targets
      .filter((tally) => !offered.includes(tally.id))
      .map((tally) => `${tally.id} would have cleared ${String(tally.clears)} of ${String(tally.of)}`),
    `under the floor on the card: ${underFloor.map((tally) => tally.id).join(', ') || 'none'}`,
    `under the floor, every candidate: ${candidatesUnderFloor.map((tally) => tally.id).join(', ') || 'none'}`,
    `over the ceiling: ${overCeiling.map((tally) => tally.id).join(', ') || 'none'}`,
  ];
  return {
    calls: row.calls.length,
    split: splits.length,
    keepLoses,
    keepBand,
    card,
    targets,
    underFloor,
    candidatesUnderFloor,
    overCeiling,
    passes,
    lines,
  };
}

/**
 * **The driver offer, derived from the census** — [§ D1442](../../../../DECISIONS.md). The
 * protocol's candidates in order, less every one that clears under the floor on a row it was
 * measured on. `dayCalls.ts#DAY_CALL_DRIVER_OFFER` is this over the shipped file.
 */
export function driverOfferOf(bands: CallBands): readonly string[] {
  const failing = new Set<string>();
  for (const row of bands.rows) {
    for (const tally of callBandsReadingOf(row, bands.protocol).candidatesUnderFloor) failing.add(tally.id);
  }
  return Object.freeze(bands.protocol.candidates.filter((id) => !failing.has(id)));
}

/* -------------------------------------------------------------------------- *
 * DC-13 on the week sheet
 * -------------------------------------------------------------------------- */

const NUMERATOR_WORDS: readonly string[] = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const DENOMINATOR_WORDS: Readonly<Record<number, readonly [string, string]>> = {
  2: ['half', 'halves'],
  3: ['third', 'thirds'],
  4: ['quarter', 'quarters'],
  5: ['fifth', 'fifths'],
  10: ['tenth', 'tenths'],
};

/**
 * **A bound in words** — *a fifth*, *three fifths*, *two thirds*; with `'the'`, *the fifth*, *the
 * three fifths*. A bound is the check's own line and no estimate, so it is said as a fraction
 * rather than as a natural frequency (*1 in 5*), which reads as a rate measured over five things
 * (the honesty corpus's R13). A share with no word for its denominator is said as a percentage.
 */
export function shareWordsOf([num, den]: CallBandsShare, article: 'a' | 'the'): string {
  const words = DENOMINATOR_WORDS[den];
  const count = NUMERATOR_WORDS[num];
  if (words === undefined || count === undefined || num < 1) return `${(100 * num / den).toFixed(0)} per cent`;
  if (num === 1) return `${article} ${words[0]}`;
  return `${article === 'the' ? 'the ' : ''}${count} ${words[1]}`;
}

/** A profile's display name, by id. */
export type ProfileNameOf = (profileId: string) => string | undefined;

/**
 * **DC-13: whether a week dealt from week 2 passes the call bands in play**, as the week sheet says
 * it — [§ D1443](../../../../DECISIONS.md). One sentence per banded profile that misses, naming what
 * it missed with the census's own counts, or one sentence that the week passed; `[]` for week 1's
 * draw, a tower the census does not measure, or an order it has not measured. Plain and past: what
 * the census found, never what a player should press.
 */
export function weekBandsLinesOf(
  contractId: string,
  order: Pick<ContractWeekOrder, 'id' | 'days'> | undefined,
  nameOf: ProfileNameOf,
  bands: CallBands = CALL_BANDS,
): readonly string[] {
  if (order === undefined || bands.protocol.contractId !== contractId) return [];
  const rows = bands.rows.filter(
    (row) => row.orderId === order.id && row.days.length === order.days.length && row.days.every((id, index) => id === order.days[index]),
  );
  if (rows.length === 0) return [];
  const p = bands.protocol;
  const crowds = `${String(p.crowds.length)} census crowds`;
  const share = (bound: CallBandsShare, article: 'a' | 'the'): string => shareWordsOf(bound, article);
  const name = (id: string): string => (id === 'keep' ? 'keeping the driver' : (nameOf(id) ?? id));
  const misses: string[] = [];
  for (const row of rows) {
    const reading = callBandsReadingOf(row, p);
    if (reading.passes) continue;
    const driver = nameOf(row.briefDriver) ?? row.briefDriver;
    const lead = `With ${driver} picked and every who-drives call kept, over ${crowds}`;
    if (reading.keepBand === 'no-split') {
      misses.push(`${lead}, none of its ${String(reading.calls)} who-drives calls split the day.`);
      continue;
    }
    const parts: string[] = [];
    if (reading.keepBand === 'under') {
      parts.push(`keeping the driver lost ${String(reading.keepLoses)} of them, under ${share(p.keepLosesAtLeast, 'the')} the check asks for`);
    } else if (reading.keepBand === 'over') {
      parts.push(`keeping the driver lost ${String(reading.keepLoses)} of them, over ${share(p.keepLosesAtMost, 'the')} the check allows`);
    }
    for (const tally of reading.overCeiling) {
      parts.push(`${name(tally.id)} cleared ${String(tally.clears)} of ${tally.of === reading.split ? 'them' : `the ${String(tally.of)} it was offered on`}, over ${share(p.answerClearsAtMost, 'the')} the check allows any one answer`);
    }
    for (const tally of reading.underFloor) {
      parts.push(`${name(tally.id)} cleared ${String(tally.clears)} of ${tally.of === reading.split ? 'them' : `the ${String(tally.of)} it was offered on`}, under ${share(p.switchClearsAtLeast, 'the')} the check asks of a switch`);
    }
    misses.push(`${lead}, ${String(reading.split)} of ${String(reading.calls)} who-drives calls split the day: ${parts.join('; ')}.`);
  }
  const drivers = rows.map((row) => nameOf(row.briefDriver) ?? row.briefDriver).join(' or ');
  if (misses.length === 0) {
    return Object.freeze([
      `This week passes the census’s check on its who-drives calls: with ${drivers} picked and every call kept, over ${crowds}, keeping the driver lost between ${share(p.keepLosesAtLeast, 'a')} and ${share(p.keepLosesAtMost, 'a')} of the calls that split the day, each switch on the card cleared at least ${share(p.switchClearsAtLeast, 'a')} of them, and no answer cleared more than ${share(p.answerClearsAtMost, 'a')}.`,
    ]);
  }
  return Object.freeze(['This week misses the census’s check on its who-drives calls, and is dealt with the miss stated.', ...misses]);
}

/* -------------------------------------------------------------------------- *
 * The shipped census, checked
 * -------------------------------------------------------------------------- */

/**
 * **Every way the census file can be malformed or stale**, collected; the shipped file must answer
 * `[]` (`callBands.test.ts`). Every order the tower deals from week 2 has a row under each of its two
 * banded profiles, over exactly the order's days, with one day string per crowd; every candidate and
 * every marked profile is a shipped profile; every bound is a share.
 */
export function callBandsIssues(
  bands: CallBands,
  dealt: readonly (ContractWeekOrder | undefined)[],
  shippedProfiles: readonly string[],
  /** `weekDominance.ts#bandedProfilesOf` on the shipped screen. */
  bandedOf: (order: ContractWeekOrder) => readonly string[],
  /** DC-10's held-out crowd count, `WEEK_WAY.protocol.heldOutCount`. */
  heldOutCount: number,
): readonly string[] {
  const issues: string[] = [];
  const p = bands.protocol;
  if (bands.version !== 1) issues.push(`version ${String(bands.version)} is not 1`);
  if (p.crowds.length === 0) issues.push('the protocol names no crowd');
  for (const crowd of p.crowds) {
    if (!Number.isInteger(crowd) || crowd < 0 || crowd >= heldOutCount) {
      issues.push(`crowd ${String(crowd)} is not one of DC-10's ${String(heldOutCount)} held-out crowds`);
    }
  }
  for (const [key, share] of [
    ['keepLosesAtLeast', p.keepLosesAtLeast],
    ['keepLosesAtMost', p.keepLosesAtMost],
    ['switchClearsAtLeast', p.switchClearsAtLeast],
    ['answerClearsAtMost', p.answerClearsAtMost],
  ] as const) {
    const [num, den] = share;
    if (!(Number.isInteger(num) && Number.isInteger(den) && den > 0 && num >= 0 && num <= den)) {
      issues.push(`${key} is not a share`);
    }
  }
  for (const id of p.candidates) if (!shippedProfiles.includes(id)) issues.push(`candidate ${id} is not a shipped profile`);
  for (const [index, order] of dealt.entries()) {
    if (order === undefined) continue;
    for (const profile of bandedOf(order)) {
      const row = bands.rows.find((entry) => entry.orderId === order.id && entry.briefDriver === profile);
      if (row === undefined) {
        issues.push(`${order.id} has no row under ${profile}`);
        continue;
      }
      if (row.week !== index + 1) issues.push(`${order.id} under ${profile} was measured as week ${String(row.week)}, dealt as week ${String(index + 1)}`);
      if (row.days.length !== order.days.length || row.days.some((id, at) => id !== order.days[at])) {
        issues.push(`${order.id} under ${profile} was measured over other days`);
      }
      if (row.dayMarks.length !== p.crowds.length || row.dayMarks.some((marks) => !/^[Cm]{5}$/.test(marks))) {
        issues.push(`${order.id} under ${profile} does not carry five day verdicts for each crowd`);
      }
    }
  }
  for (const row of bands.rows) {
    if (!shippedProfiles.includes(row.briefDriver)) issues.push(`row driver ${row.briefDriver} is not a shipped profile`);
    for (const call of row.calls) {
      if (!p.crowds.includes(call.crowd)) issues.push(`${row.orderId} has a call on crowd ${String(call.crowd)}, outside the protocol`);
      if (call.offered.length !== 2) issues.push(`${row.orderId} has a call offering ${String(call.offered.length)} targets`);
      if (call.marks['keep'] === undefined) issues.push(`${row.orderId} has a call with no verdict for keep`);
      for (const id of Object.keys(call.marks)) {
        if (id !== 'keep' && !shippedProfiles.includes(id)) issues.push(`${row.orderId} marks ${id}, not a shipped profile`);
      }
      for (const id of call.offered) {
        if (call.marks[id] === undefined) issues.push(`${row.orderId} offered ${id} with no verdict`);
      }
    }
  }
  return Object.freeze(issues);
}
