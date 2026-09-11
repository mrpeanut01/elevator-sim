/**
 * **The dispatcher registers the call the landing can make** — GitHub issue #437, AC2,
 * `DECISIONS.md` § D553.
 *
 * `dispatch.callType` used to be the only statement of what a call discloses, for every landing in
 * the run. A building may now declare a landing's own fixture, and the runner stamps it on the call
 * as `DispatchCall.callType` wherever it differs from the dispatcher's. These are the two stage-1
 * functions that read it: `costRequestFor` decides what the car may know, and `batchKeyOf` decides
 * what counts as the same request. Both must follow the landing, and both must be exactly what
 * they were for a call that carries no landing call type.
 */

import { describe, expect, it } from 'vitest';

import { batchKeyOf, costRequestFor, observationFor } from './lifecycle.js';
import { resolveDispatchConfig } from './policy.js';
import type { DispatchCall, DispatcherProfileSource, ResolvedDispatchConfig } from './types.js';

function configOf(dispatch: DispatcherProfileSource['dispatch'] = {}): ResolvedDispatchConfig {
  return resolveDispatchConfig({ id: 'probe', name: 'Probe', weights: {}, dispatch });
}

const BUTTONS = configOf();
const DISCLOSURE = configOf({ callType: 'mobile-credential' });
const PANEL = configOf({ callType: 'mobile-credential', passengerAssignment: 'panel' });

function call(extra: Partial<DispatchCall> = {}): DispatchCall {
  return {
    id: 'main#G:up',
    floorId: 'G',
    floorIndex: 0,
    direction: 'up',
    registeredAt: 0,
    destinationFloorId: '12',
    credentialGroup: 'tenant-a',
    ...extra,
  };
}

function requestOf(subject: DispatchCall, config: ResolvedDispatchConfig) {
  return costRequestFor(subject, config, observationFor(subject, 1));
}

describe('what a car may know about a call, per landing', () => {
  it('is unchanged for a call that carries no landing call type', () => {
    expect(requestOf(call(), BUTTONS)).not.toHaveProperty('destinationFloorId');
    expect(requestOf(call(), BUTTONS)).not.toHaveProperty('credentialGroup');
    expect(requestOf(call(), DISCLOSURE)).toMatchObject({
      destinationFloorId: '12',
      credentialGroup: 'tenant-a',
    });
  });

  it('is exactly the unstamped request when the landing declares the dispatcher’s own call type', () => {
    expect(requestOf(call({ callType: 'up-down-buttons' }), BUTTONS)).toStrictEqual(
      requestOf(call(), BUTTONS),
    );
    expect(requestOf(call({ callType: 'mobile-credential' }), DISCLOSURE)).toStrictEqual(
      requestOf(call(), DISCLOSURE),
    );
  });

  it('discloses the destination at a destination landing under an up/down dispatcher', () => {
    const kiosk = requestOf(call({ callType: 'destination-entry' }), BUTTONS);
    expect(kiosk.destinationFloorId).toBe('12');
    // A kiosk states a destination and identifies nobody (§ D30): no credential without a panel.
    expect(kiosk).not.toHaveProperty('credentialGroup');
    const reader = requestOf(call({ callType: 'mobile-credential' }), BUTTONS);
    expect(reader).toMatchObject({ destinationFloorId: '12', credentialGroup: 'tenant-a' });
  });

  it('discloses nothing at an up/down landing under a destination dispatcher', () => {
    for (const config of [DISCLOSURE, PANEL]) {
      const button = requestOf(call({ callType: 'up-down-buttons' }), config);
      expect(button).not.toHaveProperty('destinationFloorId');
      expect(button).not.toHaveProperty('credentialGroup');
      expect(button).toStrictEqual(requestOf(call(), BUTTONS));
    }
  });
});

describe('what counts as the same request, per landing', () => {
  it('keys a panel run’s destination landing on the origin-destination pair, as it always has', () => {
    expect(batchKeyOf(call(), PANEL)).toBe('G→12');
    expect(batchKeyOf(call({ callType: 'destination-entry' }), PANEL)).toBe('G→12');
  });

  it('keys a panel run’s up/down landing on the button, because there is no panel to key on', () => {
    expect(batchKeyOf(call({ callType: 'up-down-buttons' }), PANEL)).toBe('G:up');
  });

  it('never keys a run that does not assign at the panel on anything but the button', () => {
    for (const callType of ['up-down-buttons', 'destination-entry', 'mobile-credential'] as const) {
      expect(batchKeyOf(call({ callType }), BUTTONS)).toBe('G:up');
      expect(batchKeyOf(call({ callType }), DISCLOSURE)).toBe('G:up');
    }
  });
});
