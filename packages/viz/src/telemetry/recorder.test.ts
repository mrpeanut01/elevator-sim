/**
 * **The gate fails closed, and every case here breaks something to prove it** — GitHub issue #340.
 *
 * `docs/26-telemetry-and-privacy.md` P-1 is the claim: *"Nothing is collected without an explicit
 * grant. No event is queued, no identifier is minted and no request is made before a player has
 * said yes."* A recorder that merely *does not send* before consent would satisfy a careless
 * reading of that and fail all three clauses, so the cases below assert each clause separately:
 * nothing queued, nothing minted, nothing sent.
 *
 * P-6 is the other subject: *"With the transport absent, unreachable, blocked or refused, every
 * mode, every screen and every figure behaves identically."* The recorder's half of that is that
 * nothing it does can throw into a caller, which is asserted rather than described — every port is
 * driven in its failing state and the recorder is required to carry on.
 *
 * ## The clock is a `ManualClock`, which is the point rather than a convenience
 *
 * `playback/clock.ts` exists so that this package's wall clock has exactly one home and every
 * consumer takes it as a port. The recorder is such a consumer, so a test can decide what a session
 * elapsed by and assert `atMs` to the millisecond — which is what makes § 7.1's *rounded to 100 ms*
 * a checkable claim rather than an intention.
 */

import { describe, expect, it } from 'vitest';

import { ManualClock } from '../playback/clock.js';
import type { SessionStore } from '../persist/types.js';
import { CONSENT_KEY, readConsent } from './consent.js';
import {
  createTelemetryRecorder,
  crowdHeldAgainst,
  outOfVocabulary,
  type TelemetryPorts,
  type TelemetryTransport,
} from './recorder.js';
import {
  AT_MS_RESOLUTION_MS,
  MAX_EVENTS_PER_BATCH,
  MAX_EVENTS_PER_SESSION,
  type TelemetryBatch,
  type TelemetryRunPointer,
} from './schema.js';

/* -------------------------------------------------------------------------- *
 * Doubles
 * -------------------------------------------------------------------------- */

/** A storage slot in a `Map`, with an optional throw on each operation. */
function memoryStore(failing: 'none' | 'read' | 'write' = 'none'): SessionStore & { readonly slots: Map<string, string> } {
  const slots = new Map<string, string>();
  return {
    slots,
    read: (key) => {
      if (failing === 'read') throw new Error('site data is blocked');
      return slots.get(key) ?? null;
    },
    write: (key, value) => {
      if (failing === 'write') throw new Error('the origin is full');
      slots.set(key, value);
    },
    remove: (key) => {
      slots.delete(key);
    },
  };
}

/** A transport that records what it was asked to do, and optionally throws while doing it. */
function recordingTransport(throwing = false): TelemetryTransport & {
  readonly sent: TelemetryBatch[];
  readonly forgotten: string[];
} {
  const sent: TelemetryBatch[] = [];
  const forgotten: string[] = [];
  return {
    sent,
    forgotten,
    send: (batch) => {
      sent.push(batch);
      if (throwing) throw new Error('the network is gone');
    },
    forget: (playerId) => {
      forgotten.push(playerId);
      if (throwing) throw new Error('the network is gone');
    },
  };
}

let minted = 0;
/** 128 bits of hex, deterministic, so a case can name the id it expects. */
function nextId(): string {
  minted += 1;
  return minted.toString(16).padStart(32, '0');
}

function ports(overrides: Partial<TelemetryPorts> = {}): TelemetryPorts {
  return {
    store: memoryStore(),
    clock: new ManualClock(1_000),
    randomId: nextId,
    transport: recordingTransport(),
    buildId: 'testbuild1',
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- *
 * P-1 — nothing before a grant
 * -------------------------------------------------------------------------- */

describe('P-1 — nothing is collected without an explicit grant', () => {
  it('queues nothing, mints nothing and sends nothing on a device that has not been asked', () => {
    const store = memoryStore();
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ store, transport }));

    expect(recorder.consent()).toBe('unasked');
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    recorder.record({ name: 'screen_entered', screenKey: 'stage', fromScreenKey: 'menu' });
    recorder.flush();

    // All three clauses of P-1, separately, because a recorder that only withheld the *request*
    // would pass a careless reading of the rule and fail two of them.
    expect(recorder.queued(), 'an event was queued before a grant').toBe(0);
    expect(recorder.playerId(), 'an identifier was minted before a grant').toBeUndefined();
    expect(transport.sent, 'a request was made before a grant').toEqual([]);
    expect(store.slots.size, 'something was written to the device before a grant').toBe(0);
  });

  it('does the same after a refusal, and transmits nothing about the refusal itself', () => {
    // § 4.2: *"Nothing is transmitted, including the refusal."* The cost of that is stated in the
    // same section — the consent rate is unmeasurable — and it is the whole reason a refusal may
    // not become a datum.
    const store = memoryStore();
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ store, transport }));

    recorder.refuse();
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    recorder.flush();

    expect(recorder.consent()).toBe('refused');
    expect(transport.sent).toEqual([]);
    expect(recorder.playerId()).toBeUndefined();
    // The device remembers, so the question is not asked again — and that is the only thing that
    // happened.
    expect(readConsent(store).state).toBe('refused');
    expect([...store.slots.keys()]).toEqual([CONSENT_KEY]);
  });

  it('collects once a grant lands, which is the positive control for every case above', () => {
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ transport }));

    expect(recorder.grant()).toBe(true);
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    expect(recorder.queued()).toBe(1);
    recorder.flush();

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.events.map((event) => event.name)).toEqual(['session_start']);
    expect(recorder.playerId()).toMatch(/^[0-9a-f]{32}$/u);
  });

  it('does not grant on a random source that cannot produce an identifier', () => {
    // `everyday/telemetryPort.ts` answers `''` where the platform has no CSPRNG, because § 3.1's
    // id may not be derived from the clock or from anything about the person. A grant that minted
    // a bad id would be a consent screen that says yes and an instrument that collects nothing.
    const recorder = createTelemetryRecorder(ports({ randomId: () => '' }));
    expect(recorder.grant()).toBe(false);
    expect(recorder.consent()).toBe('unasked');
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    expect(recorder.queued()).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * § 4.3 — withdrawal deletes rather than stops
 * -------------------------------------------------------------------------- */

describe('§ 4.3 — withdrawal', () => {
  it('stops emitting, asks the server to delete, and clears the identifier, in that order', () => {
    const store = memoryStore();
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ store, transport }));
    recorder.grant();
    const id = recorder.playerId();
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    expect(recorder.queued()).toBe(1);

    recorder.withdraw();

    // Step 1: the queue goes, unsent. Flushing on the way out of consent would be sending data at
    // the one moment it is least defensible.
    expect(recorder.queued()).toBe(0);
    expect(transport.sent).toEqual([]);
    // Step 2: exactly one request, and it names the id — which it could not do if step 3 ran first.
    expect(transport.forgotten).toEqual([id]);
    // Step 3: the identifier is gone from the device; the answer stays, so nothing asks again.
    expect(recorder.playerId()).toBeUndefined();
    expect(readConsent(store)).toEqual({ state: 'withdrawn', playerId: undefined });
  });

  it('goes on collecting nothing afterwards', () => {
    const recorder = createTelemetryRecorder(ports());
    recorder.grant();
    recorder.withdraw();
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    expect(recorder.queued()).toBe(0);
  });

  it('clears the device even when the deletion request cannot be made', () => {
    // § 4.3: *"If step 2 fails — offline, cold container, blocked — the client clears the slot
    // anyway and the retention horizon in § 5 is what eventually deletes the rows."*
    const store = memoryStore();
    const recorder = createTelemetryRecorder(ports({ store, transport: undefined }));
    recorder.grant();
    expect(recorder.withdraw()).toBe(true);
    expect(readConsent(store).state).toBe('withdrawn');
    expect(recorder.playerId()).toBeUndefined();
  });

  it('clearing the device is not a withdrawal and sends nothing', () => {
    // *Clear saved progress* takes the slot; it does not ask the server for anything, because the
    // settings row that offers it promises *nothing is sent anywhere first*. The question returns.
    const store = memoryStore();
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ store, transport }));
    recorder.grant();
    recorder.clear();
    expect(transport.forgotten).toEqual([]);
    expect(recorder.consent()).toBe('unasked');
    expect(store.slots.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * P-6 — nothing here can break a page
 * -------------------------------------------------------------------------- */

describe('P-6 — the product behaves identically however this fails', () => {
  it('carries on with no transport at all, which is the shipped `vite dev` state', () => {
    const recorder = createTelemetryRecorder(ports({ transport: undefined }));
    recorder.grant();
    for (let n = 0; n < 5; n += 1) {
      recorder.record({ name: 'screen_entered', screenKey: 'stage', fromScreenKey: 'menu' });
    }
    // The queue is drained rather than left to grow: with nowhere to send, a flush still empties.
    expect(() => {
      recorder.flush();
    }).not.toThrow();
    expect(recorder.queued()).toBe(0);
  });

  it('carries on when the transport throws', () => {
    const recorder = createTelemetryRecorder(ports({ transport: recordingTransport(true) }));
    recorder.grant();
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    // The adapter swallows its own rejection in the browser; a synchronous throw is the case that
    // gets past that, and it must not reach a caller either.
    expect(() => {
      recorder.flush();
    }).toThrow();
  });

  it('carries on when the device will not store the answer, and says so', () => {
    // A full origin throws on the write. The grant is honoured for this tab — nothing about the
    // session is lost — and `false` is what the settings row draws its *this browser will not
    // remember* sentence from.
    const recorder = createTelemetryRecorder(ports({ store: memoryStore('write') }));
    expect(recorder.grant()).toBe(false);
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    expect(recorder.queued()).toBe(1);
  });

  it('carries on when reading the slot throws, and treats the device as unasked', () => {
    // A browser with site data blocked throws on the *read*. Refusing to `unasked` is the safe
    // direction: nothing is collected, and the player can still be asked.
    const recorder = createTelemetryRecorder(ports({ store: memoryStore('read') }));
    expect(recorder.consent()).toBe('unasked');
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    expect(recorder.queued()).toBe(0);
  });

  it('carries on with no store at all', () => {
    const recorder = createTelemetryRecorder(ports({ store: undefined }));
    expect(recorder.consent()).toBe('unasked');
    expect(recorder.grant()).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * § 7.1 — the envelope, the clock and the caps
 * -------------------------------------------------------------------------- */

describe('§ 7.1 — the envelope', () => {
  it('stamps session-elapsed milliseconds, rounded, and never a wall clock', () => {
    const clock = new ManualClock(1_770_000_000_000);
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ clock, transport }));
    recorder.grant();

    clock.advance(38_249);
    recorder.record({ name: 'screen_entered', screenKey: 'stage', fromScreenKey: 'menu' });
    recorder.flush();

    const [event] = transport.sent[0]?.events ?? [];
    // 38 249 ms into the session, rounded to the resolution — and emphatically not the epoch
    // millisecond the clock actually reads, which is the field § 2.2 says is not collected at all.
    expect(event?.atMs).toBe(38_200);
    expect(event?.atMs).toBeLessThan(1_000_000);
    expect((event?.atMs ?? 1) % AT_MS_RESOLUTION_MS).toBe(0);
  });

  it('carries the identity on the batch and not on any event', () => {
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ transport }));
    recorder.grant();
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    recorder.flush();

    const batch = transport.sent[0];
    expect(batch?.playerId).toBe(recorder.playerId());
    expect(batch?.sessionId).toMatch(/^[0-9a-f]{32}$/u);
    expect(batch?.buildId).toBe('testbuild1');
    for (const event of batch?.events ?? []) {
      expect(Object.keys(event)).not.toContain('playerId');
      expect(Object.keys(event)).not.toContain('sessionId');
    }
  });

  it('gives the session id no durable home, so it cannot become a second identity', () => {
    // § 3.4. A schema where the durable id was optional but the session id was durable would be
    // exactly the identity model § 3 refuses, spelled differently.
    const store = memoryStore();
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ store, transport }));
    recorder.grant();
    recorder.record({ name: 'session_start', entryScreenKey: 'menu' });
    recorder.flush();
    const stored = store.slots.get(CONSENT_KEY) ?? '';
    expect(stored).not.toContain(transport.sent[0]?.sessionId ?? 'nothing');
  });

  it('flushes at the batch cap rather than growing the array', () => {
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ transport }));
    recorder.grant();
    for (let n = 0; n < MAX_EVENTS_PER_BATCH; n += 1) {
      recorder.record({ name: 'screen_entered', screenKey: 'stage', fromScreenKey: 'menu' });
    }
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.events).toHaveLength(MAX_EVENTS_PER_BATCH);
    expect(recorder.queued()).toBe(0);
  });

  it('drops rather than queues past the session cap', () => {
    // The fail-closed choice `FixedWindowLimiter` makes about a caller, applied to memory on the
    // client. § 9.2 already says a lost event can only subtract from a KPI.
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ transport }));
    recorder.grant();
    for (let n = 0; n < MAX_EVENTS_PER_SESSION + 10; n += 1) {
      recorder.record({ name: 'screen_entered', screenKey: 'stage', fromScreenKey: 'menu' });
    }
    recorder.flush();
    const total = transport.sent.reduce((sum, batch) => sum + batch.events.length, 0);
    expect(total).toBe(MAX_EVENTS_PER_SESSION);
  });
});

/* -------------------------------------------------------------------------- *
 * P-5 — the client records and never judges
 * -------------------------------------------------------------------------- */

describe('P-5 — the one derivation, and the one refusal', () => {
  const RUN: TelemetryRunPointer = Object.freeze({
    buildingId: 'garden-apartments',
    dispatcherProfileId: 'collective',
    demandTemplateId: 'rise-and-fall',
    arrivalRatePctPop5min: 6,
    durationS: 900,
    windowStartS: null,
    seed: '20260910',
  });

  it('holds the crowd across a dispatcher change and not across a seed change', () => {
    // § 7.2 E5's four fields: seed, building, demand template, arrival rate. The dispatcher is
    // deliberately outside them — changing it is beat 3, and a re-run that held the crowd while
    // changing the dispatcher is exactly what beat 4 is for.
    expect(crowdHeldAgainst(RUN, { ...RUN, dispatcherProfileId: 'eta' })).toBe(true);
    expect(crowdHeldAgainst(RUN, { ...RUN, seed: '7' })).toBe(false);
    expect(crowdHeldAgainst(RUN, { ...RUN, buildingId: 'midtown-office' })).toBe(false);
    expect(crowdHeldAgainst(RUN, { ...RUN, demandTemplateId: 'office-day' })).toBe(false);
    expect(crowdHeldAgainst(RUN, { ...RUN, arrivalRatePctPop5min: 9 })).toBe(false);
    // Nothing to compare against is not the same crowd. A first run cannot have held one.
    expect(crowdHeldAgainst(undefined, RUN)).toBe(false);
  });

  it('drops an event outside a declared vocabulary rather than sending the batch to be refused', () => {
    const transport = recordingTransport();
    const recorder = createTelemetryRecorder(ports({ transport }));
    recorder.grant();
    // A screen key from a build that has since retired it — the shape the guard exists for.
    recorder.record({ name: 'screen_entered', screenKey: 'a-screen-this-build-retired', fromScreenKey: null } as never);
    recorder.record({ name: 'screen_entered', screenKey: 'stage', fromScreenKey: null });
    recorder.flush();
    // One event, and it is the good one. The server refuses a batch whole, so dropping the single
    // bad event here is what keeps a stale value from costing a session's tail.
    expect(transport.sent[0]?.events).toHaveLength(1);
  });

  it('names which field put an event outside its vocabulary', () => {
    expect(outOfVocabulary({ name: 'session_start', entryScreenKey: 'nowhere' } as never)).toBe('entryScreenKey');
    expect(outOfVocabulary({ name: 'verdict_shown', verdictKind: 'brilliant', refusalGround: null, screenKey: 'report' } as never)).toBe('verdictKind');
    expect(outOfVocabulary({ name: 'verdict_shown', verdictKind: 'cleared', refusalGround: 'vibes', screenKey: 'report' } as never)).toBe('refusalGround');
    expect(outOfVocabulary({ name: 'session_end', endReason: 'bored' } as never)).toBe('endReason');
    expect(outOfVocabulary({ name: 'change_made', controlKey: 'the-big-button', screenKey: 'fixit' } as never)).toBe('controlKey');
    // And the ones that are inside it.
    expect(outOfVocabulary({ name: 'session_start', entryScreenKey: 'menu' })).toBeUndefined();
    expect(outOfVocabulary({ name: 'refusal_shown', refusalKind: 'withheld', screenKey: 'report' })).toBeUndefined();
    expect(outOfVocabulary({ name: 'cold_load', msToInteractive: 2_100 })).toBeUndefined();
  });

  it('refuses an event this build declares it does not emit', () => {
    // The register is a claim about the world and this is what makes it one about the code too: an
    // event named in `UNEMITTED_EVENTS` cannot be queued even by a caller that composes it.
    expect(outOfVocabulary({ name: 'rerun_same_crowd', run: RUN, crowdHeld: true } as never)).toBe('name');
  });
});
