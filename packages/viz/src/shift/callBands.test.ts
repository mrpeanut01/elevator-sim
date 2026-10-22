/**
 * **The call bands' arithmetic on every run, and the shipped census checked** — wave AO, lane DR-2,
 * [§ D1441](../../../../DECISIONS.md) to [§ D1443](../../../../DECISIONS.md), swarm DR's ruling Q2
 * items 1 to 3 and Q3's DC-13.
 *
 * `everyday/callBands.sweep.test.ts` plays the census nightly and requires the rows to be exactly
 * `data/call-bands.json`'s. Everything the product and the nightly job read from those rows is
 * arithmetic, held here on a pinned fixture built from swarm DR's S1 figures (13 of 25 split rows
 * lost by *keep* under Fairness first, 3 of 18 under Predictive balanced; Energy aware clearing 5 of
 * 25 and 2 of 18), each bound met and missed by one, so a gated verdict never rests on a sum nobody
 * checked.
 */

import { describe, expect, it } from 'vitest';

import dispatcherProfiles from '../../../../data/dispatcher-profiles.json' with { type: 'json' };

import { DAY_CALL_DRIVER_OFFER } from './dayCalls.js';
import {
  CALL_BANDS,
  callBandsIssues,
  callBandsReadingOf,
  callSplits,
  driverOfferOf,
  shareWordsOf,
  weekBandsLinesOf,
  type CallBands,
  type CallBandsCall,
  type CallBandsProtocol,
  type CallBandsRow,
} from './callBands.js';
import { houseStandingOrder } from './weekStake.js';
import { bandedProfilesOf } from './weekDominance.js';
import { dealtWeekOrdersOf } from './weekOrders.js';
import { WEEK_WAY } from './weekWay.js';

type Mark = 'C' | 'm';

const SHIPPED_PROFILES: readonly string[] = (dispatcherProfiles as { profiles: { id: string }[] }).profiles.map(
  (profile) => profile.id,
);

const PROTOCOL: CallBandsProtocol = {
  contractId: 'c2',
  crowds: [0, 5, 10, 15],
  placement: 'park-cars-lobby',
  candidates: ['fairness-first', 'predictive-balanced', 'capacity-aware', 'energy-aware', 'eta'],
  keepLosesAtLeast: [1, 5],
  keepLosesAtMost: [3, 5],
  switchClearsAtLeast: [1, 5],
  answerClearsAtMost: [2, 3],
};

/** One raised who-drives call offering `a` and `b`, with every verdict given. */
function call(offered: readonly [string, string], marks: Readonly<Record<string, Mark>>): CallBandsCall {
  return { crowd: 0, day: 1, atS: 0, offered, marks };
}

/**
 * A row of `split` calls on which *keep* misses the first `keepLoses`, the first target clears the
 * first `aClears` and the second target the last `bClears` (shadow marks laid over them), plus
 * `quiet` calls where every answer clears. Which of them split is the reading's to say.
 */
function rowOf(input: {
  readonly briefDriver: string;
  readonly offered: readonly [string, string];
  readonly split: number;
  readonly keepLoses: number;
  readonly aClears: number;
  readonly bClears?: number;
  readonly quiet?: number;
  readonly shadow?: (index: number) => Readonly<Record<string, Mark>>;
}): CallBandsRow {
  const [a, b] = input.offered;
  const calls: CallBandsCall[] = [];
  for (let k = 0; k < input.split; k += 1) {
    const keep: Mark = k < input.keepLoses ? 'm' : 'C';
    const aMark: Mark = k < input.aClears ? 'C' : 'm';
    const bMark: Mark = k >= input.split - (input.bClears ?? 0) ? 'C' : 'm';
    calls.push(call(input.offered, { keep, [a]: aMark, [b]: bMark, ...(input.shadow?.(k) ?? {}) }));
  }
  for (let k = 0; k < (input.quiet ?? 0); k += 1) calls.push(call(input.offered, { keep: 'C', [a]: 'C', [b]: 'C' }));
  return {
    orderId: 'fixture',
    week: 2,
    briefDriver: input.briefDriver,
    days: ['a', 'b', 'c', 'd', 'e'],
    dayMarks: ['CCCCC', 'CCCCC', 'CCCCC', 'CCCCC'],
    calls,
  };
}

/** S1's Fairness first row: keep lost 13 of 25, Predictive balanced cleared 20, Energy aware 5. */
const FAIRNESS = rowOf({
  briefDriver: 'fairness-first',
  offered: ['predictive-balanced', 'energy-aware'],
  split: 25,
  keepLoses: 13,
  aClears: 20,
  bClears: 5,
  quiet: 34,
});

describe('a split row — § D1441', () => {
  it('splits where keep and the card’s two answers reach more than one verdict, whatever a shadow read', () => {
    expect(callSplits(call(['x', 'y'], { keep: 'C', x: 'C', y: 'C', z: 'm' }))).toBe(false);
    expect(callSplits(call(['x', 'y'], { keep: 'C', x: 'm', y: 'C' }))).toBe(true);
  });
});

describe('the keep band, the floor and the ceiling — § D1441', () => {
  it('reads S1’s Fairness first row: keep inside the band, Predictive balanced over the ceiling', () => {
    const reading = callBandsReadingOf(FAIRNESS, PROTOCOL);
    expect(reading.calls).toBe(59);
    expect(reading.split).toBe(25);
    expect(reading.keepLoses).toBe(13);
    expect(reading.keepBand).toBe('holds');
    expect(reading.card.find((tally) => tally.id === 'predictive-balanced')).toEqual({ id: 'predictive-balanced', clears: 20, of: 25 });
    /* S1's 5 of 25 for Energy aware: on the floor, and inside it. */
    expect(reading.card.find((tally) => tally.id === 'energy-aware')).toEqual({ id: 'energy-aware', clears: 5, of: 25 });
    expect(reading.underFloor).toEqual([]);
    expect(reading.overCeiling.map((tally) => tally.id)).toEqual(['predictive-balanced']);
    expect(reading.passes).toBe(false);
  });

  it('holds the keep band on both sides of each edge: a fifth and three fifths in, one either side out', () => {
    const band = (keepLoses: number, split: number): string =>
      callBandsReadingOf(rowOf({ briefDriver: 'x', offered: ['p', 'q'], split, keepLoses, aClears: split }), PROTOCOL).keepBand;
    /* S1's Predictive balanced row: 3 of 18 is under a fifth. */
    expect(band(3, 18)).toBe('under');
    expect(band(4, 20)).toBe('holds');
    expect(band(3, 20)).toBe('under');
    expect(band(12, 20)).toBe('holds');
    expect(band(13, 20)).toBe('over');
    expect(band(0, 0)).toBe('no-split');
  });

  it('holds the floor at one split row in five: S1’s 5 of 25 in, 2 of 18 out', () => {
    const second = (clears: number, split: number) =>
      callBandsReadingOf(
        rowOf({
          briefDriver: 'x',
          offered: ['p', 'q'],
          split,
          keepLoses: 0,
          aClears: split,
          shadow: (index) => ({ 'energy-aware': index < clears ? 'C' : 'm' }),
        }),
        PROTOCOL,
      );
    expect(second(5, 25).candidatesUnderFloor.map((tally) => tally.id)).not.toContain('energy-aware');
    expect(second(2, 18).candidatesUnderFloor.map((tally) => tally.id)).toContain('energy-aware');
    expect(second(4, 20).candidatesUnderFloor.map((tally) => tally.id)).not.toContain('energy-aware');
    expect(second(3, 20).candidatesUnderFloor.map((tally) => tally.id)).toContain('energy-aware');
  });

  it('holds the ceiling at two thirds of the split rows an answer is on: 6 of 9 in, 7 of 9 out', () => {
    const over = (aClears: number): readonly string[] =>
      callBandsReadingOf(rowOf({ briefDriver: 'x', offered: ['p', 'q'], split: 9, keepLoses: 3, aClears }), PROTOCOL).overCeiling.map(
        (tally) => tally.id,
      );
    expect(over(6)).not.toContain('p');
    expect(over(7)).toContain('p');
  });

  it('measures a shadow candidate on the split rows the card met, never on the rows that did not split', () => {
    const row = rowOf({
      briefDriver: 'x',
      offered: ['p', 'q'],
      split: 10,
      keepLoses: 5,
      aClears: 10,
      quiet: 10,
      shadow: () => ({ 'capacity-aware': 'm' }),
    });
    const quietShadow = { ...row, calls: row.calls.map((entry, index) => (index >= 10 ? { ...entry, marks: { ...entry.marks, 'capacity-aware': 'C' as const } } : entry)) };
    const reading = callBandsReadingOf(quietShadow, PROTOCOL);
    expect(reading.targets.find((tally) => tally.id === 'capacity-aware')).toEqual({ id: 'capacity-aware', clears: 0, of: 10 });
    expect(reading.candidatesUnderFloor.map((tally) => tally.id)).toContain('capacity-aware');
    /* A shadow is no miss in play: the card never offered it. */
    expect(reading.underFloor.map((tally) => tally.id)).not.toContain('capacity-aware');
  });
});

describe('the offer list, derived from the census — § D1442', () => {
  const bands = (rows: readonly CallBandsRow[]): CallBands => ({ version: 1, protocol: PROTOCOL, rows });

  it('keeps the candidates in the census’s order, less every one under the floor on a row it was measured on', () => {
    const energyTrap = rowOf({
      briefDriver: 'predictive-balanced',
      offered: ['fairness-first', 'energy-aware'],
      split: 18,
      keepLoses: 3,
      aClears: 18,
      bClears: 2,
      shadow: (index) => ({ 'capacity-aware': index < 10 ? 'C' : 'm', eta: index < 4 ? 'C' : 'm' }),
    });
    /* Energy aware clears only on the two rows where every answer cleared, so on none that split. */
    expect(callBandsReadingOf(energyTrap, PROTOCOL).underFloor.map((tally) => tally.id)).toEqual(['energy-aware']);
    expect(callBandsReadingOf(energyTrap, PROTOCOL).candidatesUnderFloor.map((tally) => tally.id)).toEqual(['energy-aware']);
    expect(driverOfferOf(bands([energyTrap]))).toEqual(['fairness-first', 'predictive-balanced', 'capacity-aware', 'eta']);
    /* A candidate no row measured keeps its place: nothing measured, nothing removed. */
    expect(driverOfferOf(bands([]))).toEqual(PROTOCOL.candidates);
  });

  it('is the shipped offer: the census’s list, never the house, and no name written in code', () => {
    expect(DAY_CALL_DRIVER_OFFER).toEqual(driverOfferOf(CALL_BANDS));
    expect(DAY_CALL_DRIVER_OFFER).not.toContain(houseStandingOrder());
    expect(DAY_CALL_DRIVER_OFFER.length).toBeGreaterThanOrEqual(3);
    for (const id of DAY_CALL_DRIVER_OFFER) expect(CALL_BANDS.protocol.candidates).toContain(id);
  });
});

describe('the shipped census — § D1441, held by § D1616', () => {
  /*
   * The census measures every order dealt from week 2. On the fixed engine Midtown deals none, its one
   * admitted order held by § D1616, so the command run on that tree measures no row and the file
   * carries none; the derived offer is then the protocol's candidates in order. The rows' checks run
   * on a real dealt order in `callBands.preD1603.test.ts`, on the census as measured before the fix.
   */
  it('measures no row, because no order is dealt from week 2, and finds nothing wrong with that', () => {
    const dealt = dealtWeekOrdersOf(CALL_BANDS.protocol.contractId);
    expect(dealt).toEqual([undefined]);
    expect(CALL_BANDS.rows).toEqual([]);
    expect(
      callBandsIssues(
        CALL_BANDS,
        dealt,
        SHIPPED_PROFILES,
        (order) => bandedProfilesOf(CALL_BANDS.protocol.contractId, order),
        WEEK_WAY.protocol.heldOutCount,
      ),
    ).toEqual([]);
    expect(DAY_CALL_DRIVER_OFFER).toEqual(CALL_BANDS.protocol.candidates);
  });
});

describe('a bound in words — § D1443', () => {
  it('says each bound as a fraction, never as a natural frequency a corpus would read as a rate', () => {
    expect(shareWordsOf([1, 5], 'a')).toBe('a fifth');
    expect(shareWordsOf([1, 5], 'the')).toBe('the fifth');
    expect(shareWordsOf([3, 5], 'a')).toBe('three fifths');
    expect(shareWordsOf([3, 5], 'the')).toBe('the three fifths');
    expect(shareWordsOf([2, 3], 'the')).toBe('the two thirds');
    expect(shareWordsOf([7, 9], 'a')).toBe('78 per cent');
  });
});

describe('DC-13 on the week sheet — § D1443', () => {
  const nameOf = (id: string): string | undefined =>
    ({ 'fairness-first': 'Fairness first', 'predictive-balanced': 'Predictive balanced', 'energy-aware': 'Energy aware' })[id];
  const order = { id: 'fixture', days: ['a', 'b', 'c', 'd', 'e'] };
  const bands = (rows: readonly CallBandsRow[]): CallBands => ({ version: 1, protocol: PROTOCOL, rows });

  it('states a miss with the census’s own counts and no advice, and says nothing for week 1 or an unmeasured order', () => {
    const predictive = rowOf({ briefDriver: 'predictive-balanced', offered: ['fairness-first', 'energy-aware'], split: 18, keepLoses: 3, aClears: 18 });
    const lines = weekBandsLinesOf('c2', order, nameOf, bands([predictive]));
    expect(lines[0]).toBe('This week misses the census’s check on its who-drives calls, and is dealt with the miss stated.');
    expect(lines[1]).toBe(
      'With Predictive balanced picked and every who-drives call kept, over 4 census crowds, 18 of 18 who-drives calls split the day: ' +
        'keeping the driver lost 3 of them, under the fifth the check asks for; ' +
        'keeping the driver cleared 15 of them, over the two thirds the check allows any one answer; ' +
        'Fairness first cleared 18 of them, over the two thirds the check allows any one answer; ' +
        'Energy aware cleared 0 of them, under the fifth the check asks of a switch.',
    );
    expect(lines.join(' ')).not.toMatch(/\b(should|try|better|best|worse)\b/iu);
    expect(weekBandsLinesOf('c2', undefined, nameOf, bands([predictive]))).toEqual([]);
    expect(weekBandsLinesOf('c2', { id: 'other', days: order.days }, nameOf, bands([predictive]))).toEqual([]);
    expect(weekBandsLinesOf('c7', order, nameOf, bands([predictive]))).toEqual([]);
  });

  it('says the week passed where every banded row holds every bound', () => {
    const fine = rowOf({
      briefDriver: 'fairness-first',
      offered: ['predictive-balanced', 'energy-aware'],
      split: 10,
      keepLoses: 4,
      aClears: 6,
      bClears: 5,
    });
    const reading = callBandsReadingOf(fine, PROTOCOL);
    expect(reading.passes, reading.lines.join('; ')).toBe(true);
    const lines = weekBandsLinesOf('c2', order, nameOf, bands([fine]));
    expect(lines).toEqual([
      'This week passes the census’s check on its who-drives calls: with Fairness first picked and every call kept, over 4 census crowds, ' +
        'keeping the driver lost between a fifth and three fifths of the calls that split the day, each switch on the card cleared at least a fifth of them, ' +
        'and no answer cleared more than two thirds.',
    ]);
  });
});
