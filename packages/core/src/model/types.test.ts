import { describe, expect, it } from 'vitest';

import {
  DECK_POSITIONS,
  DIRECTIONS,
  ModelError,
  SERVICE_MODES,
  acceptsCarCalls,
  acceptsHallCalls,
  directionBetween,
  hallCallId,
  oppositeDirection,
  type ServiceMode,
} from './types.js';

describe('direction', () => {
  it('has exactly two directions', () => {
    expect([...DIRECTIONS]).toEqual(['up', 'down']);
  });

  it('inverts', () => {
    expect(oppositeDirection('up')).toBe('down');
    expect(oppositeDirection('down')).toBe('up');
  });

  it('derives direction from floor indices', () => {
    expect(directionBetween(0, 12)).toBe('up');
    expect(directionBetween(12, 0)).toBe('down');
  });

  it('has no direction for a trip that goes nowhere', () => {
    // Not 'up' by default: a caller must decide what a zero-length trip means rather than
    // being handed an arbitrary direction that would light a real button.
    expect(directionBetween(7, 7)).toBeUndefined();
  });

  it('orders by index, not by height — negative indices travel up to the lobby', () => {
    // midtown-office's P1 is index -1. A basement passenger heading for the lobby is going up.
    expect(directionBetween(-1, 0)).toBe('up');
  });
});

describe('service mode', () => {
  it('declares the four modes', () => {
    expect([...SERVICE_MODES]).toEqual([
      'in-service',
      'independent',
      'fire-recall',
      'out-of-service',
    ]);
  });

  it('allocates hall calls only to cars in normal service', () => {
    const accepting = SERVICE_MODES.filter((mode) => acceptsHallCalls(mode));
    expect(accepting).toEqual(['in-service']);
  });

  it('keeps car calls alive on independent service', () => {
    // The distinction is the point of having two predicates: an attendant-operated car still
    // answers the buttons pressed inside it, but the group controller must not send it work.
    expect(acceptsCarCalls('independent')).toBe(true);
    expect(acceptsHallCalls('independent')).toBe(false);
  });

  it('gives a recalled or out-of-service car nothing to do', () => {
    for (const mode of ['fire-recall', 'out-of-service'] satisfies ServiceMode[]) {
      expect(acceptsHallCalls(mode)).toBe(false);
      expect(acceptsCarCalls(mode)).toBe(false);
    }
  });
});

describe('hall call identity', () => {
  it('is one call per floor per direction', () => {
    expect(hallCallId('12', 'up')).toBe('12:up');
    expect(hallCallId('12', 'down')).not.toBe(hallCallId('12', 'up'));
    expect(hallCallId('12', 'up')).not.toBe(hallCallId('13', 'up'));
  });
});

describe('deck positions', () => {
  it('names the two decks lower-first, matching servesFloorPairs order', () => {
    expect([...DECK_POSITIONS]).toEqual(['lower', 'upper']);
  });
});

describe('ModelError', () => {
  it('is a named Error subclass', () => {
    const error = new ModelError('nope');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ModelError');
    expect(error.message).toBe('nope');
  });
});
