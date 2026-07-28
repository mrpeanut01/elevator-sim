/**
 * Undo, redo and dirty state — `ED-21`, `ED-22`, `ED-23`.
 */

import type { BuildingConfig } from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { updateFloor } from './editorEdits.js';
import { EditorHistory, MIN_HISTORY_DEPTH } from './editorHistory.js';

const BASE: BuildingConfig = {
  id: 'b',
  name: 'B',
  type: 'office',
  trafficProfile: 'office-standard',
  floors: [
    { id: 'G', index: 0, heightM: 0, population: 0, isEntrance: true },
    { id: '2', index: 1, heightM: 4, population: 10 },
  ],
  banks: [{ id: 'main', servesFloors: ['G', '2'], cars: [{ id: 'A', spec: 'gearless-traction' }] }],
};

describe('EditorHistory', () => {
  it('refuses a limit below the depth ED-21 requires', () => {
    expect(() => new EditorHistory(BASE, MIN_HISTORY_DEPTH - 1)).toThrow(RangeError);
    expect(() => new EditorHistory(BASE, MIN_HISTORY_DEPTH)).not.toThrow();
  });

  it('undoes and redoes at least twenty steps', () => {
    const history = new EditorHistory(BASE);
    for (let i = 1; i <= 25; i += 1) {
      history.apply(updateFloor(history.current, '2', { population: i }));
    }
    expect(history.current.floors?.[1]?.population).toBe(25);
    for (let i = 0; i < 20; i += 1) history.undo();
    expect(history.current.floors?.[1]?.population).toBe(5);
    for (let i = 0; i < 20; i += 1) history.redo();
    expect(history.current.floors?.[1]?.population).toBe(25);
  });

  it('does not spend a step on an edit that changes nothing', () => {
    const history = new EditorHistory(BASE);
    history.apply(updateFloor(history.current, '2', { population: 10 }));
    expect(history.state.canUndo).toBe(false);
    expect(history.state.isDirty).toBe(false);
  });

  it('is clean again when an edit is undone back to the loaded document — ED-23', () => {
    const history = new EditorHistory(BASE);
    history.apply(updateFloor(history.current, '2', { population: 99 }));
    expect(history.state.isDirty).toBe(true);
    history.undo();
    // Measured against the baseline rather than tracked as a flag: editing a value and editing
    // it back is not an unsaved change, and a warning that fires anyway stops being believed.
    expect(history.state.isDirty).toBe(false);
  });

  it('discards back to the loaded document, and the discard is itself undoable — ED-22', () => {
    const history = new EditorHistory(BASE);
    history.apply(updateFloor(history.current, '2', { population: 99 }));
    history.discard();
    expect(history.current.floors?.[1]?.population).toBe(10);
    expect(history.state.isDirty).toBe(false);
    history.undo();
    expect(history.current.floors?.[1]?.population).toBe(99);
  });

  it('drops the redo stack when a new edit is made after an undo', () => {
    const history = new EditorHistory(BASE);
    history.apply(updateFloor(history.current, '2', { population: 20 }));
    history.undo();
    expect(history.state.canRedo).toBe(true);
    history.apply(updateFloor(history.current, '2', { population: 30 }));
    expect(history.state.canRedo).toBe(false);
    expect(history.current.floors?.[1]?.population).toBe(30);
  });

  it('bounds the stack, dropping the oldest rather than growing without limit', () => {
    const history = new EditorHistory(BASE, MIN_HISTORY_DEPTH);
    for (let i = 1; i <= 40; i += 1) {
      history.apply(updateFloor(history.current, '2', { population: i }));
    }
    expect(history.state.depth).toBe(MIN_HISTORY_DEPTH);
  });

  it('adopts a new baseline on reset, so a fresh Open is not born dirty', () => {
    const history = new EditorHistory(BASE);
    history.apply(updateFloor(history.current, '2', { population: 77 }));
    history.reset(history.current);
    expect(history.state.isDirty).toBe(false);
    expect(history.state.canUndo).toBe(false);
    expect(history.state.canRedo).toBe(false);
  });

  it('undo returns the same document when there is nothing to undo', () => {
    const history = new EditorHistory(BASE);
    expect(history.undo()).toBe(history.current);
    expect(history.redo()).toBe(history.current);
  });
});
