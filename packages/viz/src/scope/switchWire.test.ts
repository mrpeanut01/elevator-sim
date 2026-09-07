/**
 * The switch arm's wire form — GitHub issue #338, § D486 — driven in the three shapes a target can
 * take: a shipped style, a shipped style with the player's rules on it, and a hand-tuned vector.
 */

import { describe, expect, it } from 'vitest';

import type { DispatcherProfile } from '@elevator-sim/core/browser';

import { RESOURCES } from './probes.test-helper.js';
import { switchTargetFromWire, switchUnpostableReasonOf, switchWireOf } from './switchWire.js';

const SHIPPED = RESOURCES.dispatcherProfiles.profiles;
const ROWS = [{ when: 'call-waited', whenValue: 60, then: 'jump-queue' }] as const;

describe('switchWireOf', () => {
  it('carries a shipped style as its id and nothing else', () => {
    const style = SHIPPED[1] as DispatcherProfile;
    expect(switchWireOf(style, SHIPPED)).toEqual({ toProfileId: style.id });
  });

  it('carries a saved dispatcher that is a shipped style with rules as the id plus the rows', () => {
    const base = SHIPPED[2] as DispatcherProfile;
    const saved: DispatcherProfile = {
      ...base,
      id: 'saved-mine',
      name: 'Mine',
      rules: { rows: [...ROWS] },
      selection: { ...(base.selection ?? {}), policy: 'rules' },
    };
    expect(switchWireOf(saved, SHIPPED)).toEqual({ toProfileId: base.id, ruleRows: [...ROWS] });
    expect(switchUnpostableReasonOf(saved, SHIPPED)).toBeUndefined();
  });

  it('refuses a hand-tuned vector, naming the dispatcher by its name and never its id', () => {
    const base = SHIPPED[0] as DispatcherProfile;
    const tuned: DispatcherProfile = {
      ...base,
      id: 'saved-tuned-v2',
      name: 'Tuned',
      weights: { ...base.weights, waitTime: (base.weights['waitTime'] ?? 0) + 0.25 },
    };
    expect(switchWireOf(tuned, SHIPPED)).toBeUndefined();
    const reason = switchUnpostableReasonOf(tuned, SHIPPED);
    expect(reason).toContain('Tuned');
    expect(reason).not.toContain('saved-tuned-v2');
    expect(reason).toContain('cannot be posted');
  });

  it('inverts on this end what the server inverts on its own — GitHub issue #337', () => {
    const base = SHIPPED[2] as DispatcherProfile;
    const saved: DispatcherProfile = {
      ...base,
      id: 'saved-mine',
      rules: { rows: [...ROWS] },
      selection: { ...(base.selection ?? {}), policy: 'rules' },
    };
    const wire = switchWireOf(saved, SHIPPED);
    if (wire === undefined) throw new Error('expressible');
    const back = switchTargetFromWire(wire, SHIPPED);
    expect(back?.id).toBe(base.id);
    expect(back?.rules?.rows).toEqual([...ROWS]);
    expect(back?.selection?.policy).toBe('rules');
    expect(switchTargetFromWire({ toProfileId: 'no-such' }, SHIPPED)).toBeUndefined();
    expect(switchTargetFromWire({ toProfileId: base.id }, SHIPPED)).toBe(base);
  });

  it('is not fooled by identity fields, and is not fooled by a run field either', () => {
    const base = SHIPPED[3] as DispatcherProfile;
    // A renamed copy of a shipped style is that style: identity is not a run field.
    expect(switchWireOf({ ...base, id: 'other', name: 'Other' }, SHIPPED)).toEqual({
      toProfileId: base.id,
    });
    // A moved idle stage is a different vector, whatever the id says.
    expect(
      switchWireOf({ ...base, idle: { ...(base.idle ?? {}), parkingStrategy: 'zone-center' } }, SHIPPED),
    ).toBeUndefined();
  });
});
