/**
 * The device chime ledger, driven — GitHub issue **#579**, [§ D911](../../../../DECISIONS.md),
 * [§ D711](../../../../DECISIONS.md) clauses 1–6.
 *
 * Two things this file is careful about, and both are the module's own claims rather than
 * conveniences:
 *
 * - **No award is written down here.** Every expectation about a balance is stated against
 *   `CHIME_AWARDS`, which `core` projects out of `data/chime-ledger.json`, so a rebalance of that
 *   file moves this test with it rather than turning it red. A literal `6` would be the defect
 *   `CLAUDE.md` records three published numbers committing.
 * - **The store half is driven through a fake backing**, not through `localStorage`, so the
 *   quarantine and memory-only arms are reachable under Node — `careerStore`'s own arrangement.
 */

import { describe, expect, it } from 'vitest';

import { createDeviceChimeStore } from './chimeStore.js';
import {
  CHIME_AWARDS,
  DEVICE_CHIMES_KEY,
  DEVICE_CHIMES_QUARANTINE_KEY,
  DEVICE_SINK_PRICES,
  boughtStepIdOf,
  decodeDeviceChimes,
  deviceBalanceOf,
  deviceOwnedOf,
  emptyDeviceChimes,
  encodeDeviceChimes,
  withSinkSpend,
  withSpend,
  withTurn,
} from './deviceChimes.js';
import type { SessionStore } from '../persist/types.js';

const SCENARIO_AWARD = CHIME_AWARDS.awards['scenario-cleared'] ?? 0;
const RUSH_AWARD = CHIME_AWARDS.awards['rush-wave-survived'] ?? 0;
const DAY_AWARD = CHIME_AWARDS.awards['career-day-paid'] ?? 0;
const PAR_AWARD = CHIME_AWARDS.awards['scenario-at-par'] ?? 0;
/** A sink's price, read off the shipped table rather than written down. */
const priceOf = (sinkId: string): number => DEVICE_SINK_PRICES.sinks.find((sink) => sink.id === sinkId)?.priceChimes ?? Number.NaN;
const capOf = (sinkId: string): number => DEVICE_SINK_PRICES.sinks.find((sink) => sink.id === sinkId)?.maxSteps ?? Number.NaN;

function fakeBacking(): { store: SessionStore; slots: Map<string, string> } {
  const slots = new Map<string, string>();
  return {
    slots,
    store: {
      read: (key) => slots.get(key) ?? null,
      write: (key, value) => {
        slots.set(key, value);
      },
      remove: (key) => {
        slots.delete(key);
      },
    },
  };
}

describe('the device ledger records turns and derives a balance — § D711 clause 2', () => {
  it('pays the shipped award for a scenario cleared, with no account and no server', () => {
    const record = withTurn(emptyDeviceChimes(), {
      completion: 'scenario-cleared',
      scenarioId: 'a-case',
    });
    expect(SCENARIO_AWARD, 'the shipped table pays nothing for a cleared scenario').toBeGreaterThan(0);
    expect(deviceBalanceOf(record)).toBe(SCENARIO_AWARD);
  });

  it('pays a scenario once however many times it is cleared — § D533 on the device', () => {
    let record = emptyDeviceChimes();
    for (let i = 0; i < 4; i += 1) {
      record = withTurn(record, { completion: 'scenario-cleared', scenarioId: 'a-case' });
    }
    expect(deviceBalanceOf(record)).toBe(SCENARIO_AWARD);
    /* Identity, not just equality: a turn that is owed nothing returns the record it was handed. */
    expect(withTurn(record, { completion: 'scenario-cleared', scenarioId: 'a-case' })).toBe(record);
  });

  it('pays a different scenario separately', () => {
    let record = withTurn(emptyDeviceChimes(), { completion: 'scenario-cleared', scenarioId: 'one' });
    record = withTurn(record, { completion: 'scenario-cleared', scenarioId: 'two' });
    expect(deviceBalanceOf(record)).toBe(SCENARIO_AWARD * 2);
  });

  it('pays a rush only for the waves beyond this device’s best', () => {
    let record = withTurn(emptyDeviceChimes(), { completion: 'rush-wave-survived', waves: 3 });
    expect(deviceBalanceOf(record)).toBe(RUSH_AWARD * 3);
    record = withTurn(record, { completion: 'rush-wave-survived', waves: 3 });
    expect(deviceBalanceOf(record)).toBe(RUSH_AWARD * 3);
    record = withTurn(record, { completion: 'rush-wave-survived', waves: 5 });
    expect(deviceBalanceOf(record)).toBe(RUSH_AWARD * 5);
  });

  it('refuses a rush turn that claims no whole wave', () => {
    const empty = emptyDeviceChimes();
    expect(withTurn(empty, { completion: 'rush-wave-survived', waves: 0 })).toBe(empty);
    expect(withTurn(empty, { completion: 'rush-wave-survived', waves: -2 })).toBe(empty);
    expect(withTurn(empty, { completion: 'rush-wave-survived', waves: 1.5 })).toBe(empty);
  });

  it('pays a contract day once per day it names, and every day it names — § D1416', () => {
    /*
     * The inverse of the case that stood here, and the inversion is the record: it read *"counts a
     * contract day every time, because nothing can tell a second day from a re-post"*. The day names
     * itself now, so the same day filed twice pays once and two days pay twice.
     */
    let record = emptyDeviceChimes();
    record = withTurn(record, { completion: 'career-day-paid', key: 'career:c1:m0:d1:t1' });
    const once = record;
    record = withTurn(record, { completion: 'career-day-paid', key: 'career:c1:m0:d1:t1' });
    expect(record, 'the same day filed twice paid twice').toBe(once);
    record = withTurn(record, { completion: 'career-day-paid', key: 'career:c1:m0:d2:t2' });
    expect(deviceBalanceOf(record)).toBe(DAY_AWARD * 2);
  });

  it('reads a version-1 record’s counted days and pays them again under no composed day — § D1416', () => {
    /* Version 1 keyed a day by a count; no composed key is a bare number, so the two never collide. */
    const v1 = JSON.stringify({
      version: 1,
      turns: [
        { completion: 'career-day-paid', key: '1' },
        { completion: 'career-day-paid', key: '2' },
      ],
      spends: [],
    });
    const loaded = decodeDeviceChimes(v1);
    expect(loaded.refusal).toBeUndefined();
    expect(deviceBalanceOf(loaded.record)).toBe(DAY_AWARD * 2);
    expect(loaded.record.sinks).toEqual([]);
    const next = withTurn(loaded.record, { completion: 'career-day-paid', key: 'week:c1:s20260901' });
    expect(deviceBalanceOf(next)).toBe(DAY_AWARD * 3);
  });

  it('pays a par once per scenario, apart from the scenario’s clear — § D1417', () => {
    expect(PAR_AWARD, 'the shipped table pays nothing for a par').toBeGreaterThan(0);
    let record = withTurn(emptyDeviceChimes(), { completion: 'scenario-cleared', scenarioId: 'stage-2' });
    record = withTurn(record, { completion: 'scenario-at-par', scenarioId: 'stage-2' });
    const once = record;
    record = withTurn(record, { completion: 'scenario-at-par', scenarioId: 'stage-2' });
    expect(record).toBe(once);
    expect(deviceBalanceOf(record)).toBe(SCENARIO_AWARD + PAR_AWARD);
  });

  it('pays a held level once, keyed by the level, and another level again — § D1402', () => {
    /* A keyed completion since a held level joined § D1416's table: `{ completion, key }`. */
    const levelAward = CHIME_AWARDS.awards['week-held'] ?? 0;
    expect(levelAward, 'the shipped table pays a held week nothing').toBeGreaterThan(0);
    let record = emptyDeviceChimes();
    record = withTurn(record, { completion: 'week-held', key: 'c2/3' });
    const once = record;
    record = withTurn(record, { completion: 'week-held', key: 'c2/3' });
    expect(record, 'a level held again was recorded again').toBe(once);
    record = withTurn(record, { completion: 'week-held', key: 'c2/4' });
    expect(deviceBalanceOf(record)).toBe(levelAward * 2);
    expect(record.turns.map((turn) => turn.key)).toEqual(['c2/3', 'c2/4']);
  });

  it('never reads below zero, whatever a hand-edited record holds', () => {
    const tampered = { version: 2, turns: [], spends: [{ scenarioId: 'a', stepId: 'b', chimes: 99 }], sinks: [] };
    expect(deviceBalanceOf(tampered)).toBe(0);
  });
});

describe('the one thing it spends on is a scenario’s own rung — § D911', () => {
  const banked = (scenarios: readonly string[]) =>
    scenarios.reduce(
      (record, id) => withTurn(record, { completion: 'scenario-cleared', scenarioId: id }),
      emptyDeviceChimes(),
    );

  it('buys a rung the balance covers and takes exactly what the rung cost', () => {
    const record = banked(['one', 'two']);
    const outcome = withSpend(record, { scenarioId: 'three', stepId: 'wider', chimes: SCENARIO_AWARD });
    expect(outcome.kind).toBe('bought');
    if (outcome.kind !== 'bought') return;
    expect(deviceBalanceOf(outcome.record)).toBe(SCENARIO_AWARD);
    expect(boughtStepIdOf(outcome.record, 'three')).toBe('wider');
  });

  it('refuses a shortfall and says by how much, computed here rather than by a screen', () => {
    const outcome = withSpend(emptyDeviceChimes(), {
      scenarioId: 'three',
      stepId: 'wider',
      chimes: SCENARIO_AWARD,
    });
    expect(outcome).toEqual({ kind: 'refused', refusal: { kind: 'short', shortBy: SCENARIO_AWARD } });
  });

  it('refuses a second purchase of the same rung, which would buy nothing', () => {
    const record = banked(['one', 'two', 'three']);
    const first = withSpend(record, { scenarioId: 'x', stepId: 'wider', chimes: SCENARIO_AWARD });
    expect(first.kind).toBe('bought');
    if (first.kind !== 'bought') return;
    expect(withSpend(first.record, { scenarioId: 'x', stepId: 'wider', chimes: SCENARIO_AWARD })).toEqual({
      kind: 'refused',
      refusal: { kind: 'owned' },
    });
    /* The same rung id on a **different** scenario is a different purchase and is allowed. */
    expect(withSpend(first.record, { scenarioId: 'y', stepId: 'wider', chimes: SCENARIO_AWARD }).kind).toBe(
      'bought',
    );
  });

  it('knows nothing about a scenario nobody bought a rung on', () => {
    expect(boughtStepIdOf(emptyDeviceChimes(), 'x')).toBeUndefined();
  });
});

describe('the three ledger sinks are spent from this tally for play on this device — § D1418', () => {
  const banked = (count: number) =>
    Array.from({ length: count }, (_, index) => `case-${String(index)}`).reduce(
      (record, id) => withTurn(record, { completion: 'scenario-cleared', scenarioId: id }),
      emptyDeviceChimes(),
    );

  it('sells every sink the shipped table sells, at the ledger’s own price', () => {
    for (const sink of DEVICE_SINK_PRICES.sinks) {
      const record = banked(Math.ceil(sink.priceChimes / SCENARIO_AWARD));
      const outcome = withSinkSpend(record, sink.id, 1);
      expect(outcome.kind, sink.id).toBe('bought');
      if (outcome.kind !== 'bought') continue;
      expect(deviceBalanceOf(record) - deviceBalanceOf(outcome.record), sink.id).toBe(sink.priceChimes);
      expect(outcome.grantUnits, sink.id).toBe(sink.modifier.grantUnits);
      expect(deviceOwnedOf(outcome.record), sink.id).toEqual([{ sinkId: sink.id, steps: 1 }]);
    }
  });

  it('refuses a shortfall and says by how much', () => {
    const price = priceOf('career-purse-top-up');
    expect(withSinkSpend(emptyDeviceChimes(), 'career-purse-top-up', 1)).toEqual({
      kind: 'refused',
      refusal: { kind: 'short', shortBy: price },
    });
  });

  it('stops at the sink’s own cap, which is the most a run may claim', () => {
    let record = banked(20);
    const cap = capOf('rush-purse-top-up');
    for (let step = 0; step < cap; step += 1) {
      const outcome = withSinkSpend(record, 'rush-purse-top-up', 1);
      expect(outcome.kind).toBe('bought');
      if (outcome.kind === 'bought') record = outcome.record;
    }
    expect(withSinkSpend(record, 'rush-purse-top-up', 1)).toEqual({ kind: 'refused', refusal: { kind: 'owned' } });
    expect(deviceOwnedOf(record)).toEqual([{ sinkId: 'rush-purse-top-up', steps: cap }]);
    expect(withSinkSpend(banked(20), 'rush-prefit', 1).kind).toBe('bought');
  });

  it('refuses a sink the table does not sell, naming no price', () => {
    expect(withSinkSpend(banked(5), 'a-sink-nobody-sells', 1)).toEqual({ kind: 'refused', refusal: { kind: 'unknown' } });
  });

  it('keeps what it bought across a reload, and a version-1 record reads as having bought none', () => {
    const backing = fakeBacking();
    const first = createDeviceChimeStore(backing.store);
    for (let i = 0; i < 3; i += 1) first.bank({ completion: 'scenario-cleared', scenarioId: `c${String(i)}` });
    expect(first.spendSink('rush-prefit', 1).kind).toBe('bought');
    const second = createDeviceChimeStore(backing.store);
    expect(deviceOwnedOf(second.record())).toEqual([{ sinkId: 'rush-prefit', steps: 1 }]);
    expect(second.balance()).toBe(SCENARIO_AWARD * 3 - priceOf('rush-prefit'));
  });
});

describe('the envelope quarantines rather than coerces — careerPersist’s rule', () => {
  it('round-trips a record it wrote', () => {
    const record = withTurn(emptyDeviceChimes(), { completion: 'scenario-cleared', scenarioId: 'a' });
    expect(decodeDeviceChimes(encodeDeviceChimes(record))).toEqual({ record, refusal: undefined });
  });

  it('reads nothing as empty rather than as a refusal', () => {
    expect(decodeDeviceChimes(null)).toEqual({ record: emptyDeviceChimes(), refusal: 'empty' });
    expect(decodeDeviceChimes('')).toEqual({ record: emptyDeviceChimes(), refusal: 'empty' });
  });

  it('names each way a stored record can be unreadable', () => {
    expect(decodeDeviceChimes('{').refusal).toBe('unreadable');
    expect(decodeDeviceChimes('[]').refusal).toBe('wrong-shape');
    expect(decodeDeviceChimes(JSON.stringify({ version: 99, turns: [], spends: [] })).refusal).toBe(
      'wrong-version',
    );
    expect(
      decodeDeviceChimes(JSON.stringify({ version: 1, turns: [{ completion: 'nope', key: '' }], spends: [] }))
        .refusal,
    ).toBe('wrong-shape');
  });
});

describe('the store keeps it, and never claims a save it did not make', () => {
  it('banks through storage and reads back the same tally on a second store', () => {
    const backing = fakeBacking();
    const first = createDeviceChimeStore(backing.store);
    expect(first.bank({ completion: 'scenario-cleared', scenarioId: 'a' })).toBe(SCENARIO_AWARD);
    expect(first.durable()).toBe(true);
    const second = createDeviceChimeStore(backing.store);
    expect(second.balance()).toBe(SCENARIO_AWARD);
    expect(backing.slots.has(DEVICE_CHIMES_KEY)).toBe(true);
  });

  it('is memory-only with no backing, and says so rather than promising', () => {
    const store = createDeviceChimeStore(undefined);
    expect(store.durable()).toBe(false);
    store.bank({ completion: 'scenario-cleared', scenarioId: 'a' });
    expect(store.balance()).toBe(SCENARIO_AWARD);
    /* A fresh store shares nothing, which is why the singleton is conditional on real storage. */
    expect(createDeviceChimeStore(undefined).balance()).toBe(0);
  });

  it('sets a record it cannot read aside rather than overwriting it', () => {
    const backing = fakeBacking();
    backing.slots.set(DEVICE_CHIMES_KEY, JSON.stringify({ version: 99 }));
    const store = createDeviceChimeStore(backing.store);
    expect(store.refusal()).toBe('wrong-version');
    expect(backing.slots.get(DEVICE_CHIMES_QUARANTINE_KEY)).toBe(JSON.stringify({ version: 99 }));
  });

  it('seals on clear, so nothing this session goes on to do writes the tally back', () => {
    const backing = fakeBacking();
    const store = createDeviceChimeStore(backing.store);
    store.bank({ completion: 'scenario-cleared', scenarioId: 'a' });
    store.clear();
    expect(store.balance()).toBe(0);
    store.bank({ completion: 'scenario-cleared', scenarioId: 'b' });
    expect(backing.slots.has(DEVICE_CHIMES_KEY)).toBe(false);
    expect(createDeviceChimeStore(backing.store).balance()).toBe(0);
  });

  it('survives a backing that throws on every call', () => {
    const throwing: SessionStore = {
      read: () => {
        throw new Error('denied');
      },
      write: () => {
        throw new Error('denied');
      },
      remove: () => {
        throw new Error('denied');
      },
    };
    const store = createDeviceChimeStore(throwing);
    expect(store.balance()).toBe(0);
    expect(store.bank({ completion: 'scenario-cleared', scenarioId: 'a' })).toBe(SCENARIO_AWARD);
    expect(() => {
      store.clear();
    }).not.toThrow();
  });
});
