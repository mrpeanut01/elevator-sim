import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEVERS,
  costFunctionLine,
  type DispatcherSpec,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';
import { shortTermNameOf } from '../dev/dispatcherEditor.js';

import { applyPlainLever, plainLeverEchoOf, plainLeversOf, type PlainLeverId } from './plainLevers.js';

/**
 * The four plain levers — BUILD_PLAN slice 1 (`docs/design/design_handoff_casual_mode/`).
 *
 * The property under test is the slice's whole point: **there is no lever state.** A lever is a
 * view onto the spec and group levers the run is built from, so the tinker drawer and the
 * thirteen-term drawer agree by identity, and moving a lever changes the printed cost line for
 * the same reason moving the term slider does.
 */

const SPEC: DispatcherSpec = {
  name: 'Fixture',
  weights: { waitTime: 100, starvation: 30, loadFactor: 40 },
  flags: { pool: false, zone: false, bypass: true },
};

const LEVERS: GroupLevers = DEFAULT_LEVERS;

const ALL_IDS = ['waitTime', 'starvation', 'loadFactor'] as const;

function lever(id: PlainLeverId, spec = SPEC, levers = LEVERS) {
  const found = plainLeversOf(spec, levers).find((row) => row.id === id);
  if (found === undefined) throw new Error(`no lever ${id}`);
  return found;
}

describe('the levers are views, not state', () => {
  it('reads the weight the term drawer shows, from the same field', () => {
    expect(lever('patience').value).toBe(SPEC.weights['starvation']);
    expect(lever('room').value).toBe(SPEC.weights['loadFactor']);
  });

  it('reads the group controls the levers block shows', () => {
    expect(lever('lobby').value).toBe(false);
    expect(lever('lobby', SPEC, { ...LEVERS, parking: true }).value).toBe(true);
    expect(lever('spread').value).toBe(false);
    expect(
      lever('spread', { ...SPEC, flags: { ...SPEC.flags, zone: true } }).value,
    ).toBe(true);
  });

  it('round-trips: what a lever writes is what the lever then reads', () => {
    const patience = applyPlainLever(SPEC, LEVERS, 'patience', 85);
    expect(lever('patience', patience.spec, patience.levers).value).toBe(85);
    const lobby = applyPlainLever(SPEC, LEVERS, 'lobby', true);
    expect(lever('lobby', lobby.spec, lobby.levers).value).toBe(true);
  });

  it('writes only the owned field — a lever with a side effect is two controls in one label', () => {
    const applied = applyPlainLever(SPEC, LEVERS, 'patience', 85);
    expect(applied.spec.weights).toEqual({ ...SPEC.weights, starvation: 85 });
    expect(applied.spec.flags).toEqual(SPEC.flags);
    expect(applied.spec.name).toBe(SPEC.name);
    expect(applied.levers).toBe(LEVERS);

    const spread = applyPlainLever(SPEC, LEVERS, 'spread', true);
    expect(spread.spec.weights).toEqual(SPEC.weights);
    expect(spread.spec.flags).toEqual({ ...SPEC.flags, zone: true });
    expect(spread.levers).toBe(LEVERS);

    const lobby = applyPlainLever(SPEC, LEVERS, 'lobby', true);
    expect(lobby.spec).toBe(SPEC);
    expect(lobby.levers).toEqual({ ...LEVERS, parking: true });
  });

  it('clamps and rounds a slider position the way every other slider does', () => {
    expect(applyPlainLever(SPEC, LEVERS, 'room', 130.4).spec.weights['loadFactor']).toBe(100);
    expect(applyPlainLever(SPEC, LEVERS, 'room', -3).spec.weights['loadFactor']).toBe(0);
    expect(applyPlainLever(SPEC, LEVERS, 'room', 41.6).spec.weights['loadFactor']).toBe(42);
  });
});

describe('slice 1’s acceptance check, in unit form', () => {
  it('moving a weight-backed lever changes the printed cost expression', () => {
    const before = costFunctionLine(SPEC, (id) => shortTermNameOf(id, [...ALL_IDS]));
    const applied = applyPlainLever(SPEC, LEVERS, 'patience', 85);
    const after = costFunctionLine(applied.spec, (id) => shortTermNameOf(id, [...ALL_IDS]));
    expect(after).not.toBe(before);
    expect(after).toContain('0.85');
  });

  it('opening the thirteen shows the number the lever wrote — one expression, two drawers', () => {
    const applied = applyPlainLever(SPEC, LEVERS, 'room', 55);
    // The term drawer reads spec.weights directly; the lever reads the same field. Identity,
    // not synchronisation.
    expect(applied.spec.weights['loadFactor']).toBe(55);
    expect(lever('room', applied.spec, applied.levers).value).toBe(55);
  });
});

describe('the words (guide §11.3, §16 rule 11)', () => {
  it('carries the prototype’s copy for labels, reads and ends', () => {
    expect(lever('patience').label).toBe('How long anyone should wait');
    expect(lever('patience').atZero).toBe('let it slide');
    expect(lever('patience').atFull).toBe('nobody waits');
    expect(lever('lobby').reads).toBe('holds a car at the lobby');
    expect(lever('spread').atFull).toBe('cover everything');
    expect(lever('room').atZero).toBe('cram them in');
  });

  it('a weight-backed lever carries the term’s own serves clause from core', () => {
    expect(lever('patience').serves).toBe('serves the worst wait rather than the average');
    expect(lever('room').serves).toBe('serves leaving room in a car');
    expect(lever('lobby').serves).toBeUndefined();
    expect(lever('spread').serves).toBeUndefined();
  });

  it('no player-visible string contains an engine identifier', () => {
    // `writes` is the engineer tooltip and names its field on purpose; everything else is
    // player-visible and must not.
    for (const row of plainLeversOf(SPEC, LEVERS)) {
      for (const text of [row.label, row.reads, row.atZero, row.atFull, row.serves ?? '']) {
        expect(text, `${row.id}: "${text}"`).not.toMatch(/\b[a-z]+[A-Z][A-Za-z]*\b/);
        expect(text, `${row.id}: "${text}"`).not.toMatch(/\b(?:AWT|WT95|TTD)\b/);
      }
    }
  });
});

describe('the echo — docs/19 defect 5', () => {
  it('names the position a slider now holds and the field that holds it', () => {
    const applied = applyPlainLever(SPEC, LEVERS, 'patience', 85);
    const echo = plainLeverEchoOf(lever('patience', applied.spec, applied.levers));
    expect(echo).toContain('How long anyone should wait');
    expect(echo).toContain('85');
    expect(echo).toContain('weights.starvation');
  });

  it('names the state a toggle now holds and the group control it wrote', () => {
    const applied = applyPlainLever(SPEC, LEVERS, 'lobby', true);
    const echo = plainLeverEchoOf(lever('lobby', applied.spec, applied.levers));
    expect(echo).toContain('Keep a car downstairs');
    expect(echo).toContain('is now on');
    expect(echo).toContain('idle.parkingStrategy: lobby');
    expect(plainLeverEchoOf(lever('lobby'))).toContain('is now off');
  });

  it('is derived from the view, so it cannot describe a value the state has left', () => {
    // The echo takes no remembered press: composed twice over the same view it is byte-identical,
    // and composed over a moved view it moves with it.
    expect(plainLeverEchoOf(lever('room'))).toBe(plainLeverEchoOf(lever('room')));
    const applied = applyPlainLever(SPEC, LEVERS, 'room', 55);
    expect(plainLeverEchoOf(lever('room', applied.spec, applied.levers))).toContain('55');
  });

  it('does not restate the cost formula — costFunctionLine stays the only composition of it', () => {
    for (const row of plainLeversOf(SPEC, LEVERS)) {
      expect(plainLeverEchoOf(row)).not.toContain('cost =');
    }
  });
});
