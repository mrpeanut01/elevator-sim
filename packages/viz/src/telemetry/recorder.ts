/**
 * **The recorder: the thing that was missing** — GitHub issue #340.
 *
 * `docs/26-telemetry-and-privacy.md` designed a schema, a posture and a consent surface, and
 * produced no code. Two open issues consume data nothing emits. This is the emitter, and everything
 * about its shape is one of the six rules in § 1.
 *
 * ## It fails closed, and that is the first thing to check about it
 *
 * P-1: *"No event is queued, no identifier is minted and no request is made before a player has said
 * yes."* {@link TelemetryRecorder.record} returns before doing anything at all unless consent reads
 * `granted`, and the identifier is minted inside {@link TelemetryRecorder.grant} by `consent.ts`,
 * which is the only module that can produce one. So the failure modes are:
 *
 * - **no consent** — nothing queued, nothing sent, no id on the device;
 * - **no transport** (a `vite dev` page, a CDN with no API origin tag) — events queue and are
 *   dropped at the cap, and no request is attempted;
 * - **a failed request** — the batch is gone and nothing is retried.
 *
 * All three are *normal*, which is § 8's own word, and P-6 is why: *"With the transport absent,
 * unreachable, blocked or refused, every mode, every screen and every figure behaves identically."*
 * Nothing in this module can throw into a caller and nothing in it can block one — see the guard
 * inside {@link send}, which is there because this sentence was false for one commit and the case
 * named for it asserted the opposite.
 *
 * ## Which identifier P-1 is held on here, said rather than left to be assumed
 *
 * P-1 is *no identifier is minted before a player has said yes*, and this module holds it exactly
 * on `playerId`: there is no exported way to mint one, and `grantConsent` is the only thing that
 * does. `sessionId` is minted at construction, which is shell mount — **before** any answer — and
 * that is a deliberate exception rather than an oversight, so it is named here.
 *
 * What makes it defensible is that it is not an identifier of a *player*: it is a closure variable,
 * per tab, never persisted (`recorder.test.ts` asserts it is absent from the stored slot), never
 * transmitted without a grant (`send` refuses without a `playerId`), and it dies with the tab. It
 * cannot be joined to anything, including a later session on the same device. Minting it lazily
 * would change nothing a player could observe and would put a branch on the hot path.
 *
 * The claim to avoid is the broad one — *the id is minted only inside the grant* — which is true of
 * `playerId` and not of both.
 *
 * ## Pure, with four ports
 *
 * No DOM, no `localStorage`, no `fetch`, no clock, no timer — `boundaries.test.ts` forbids the last
 * two anywhere but `playback/clock.ts` and the shell tier, and the rest is the pure/DOM split
 * `everyday/` already draws. {@link TelemetryPorts} is what the shell hands over, and
 * `everyday/telemetryPort.ts` is the one module that builds them from a browser.
 *
 * ## Batching, and why it never sends on its own
 *
 * § 8: *"Batch per session; flush on `visibilitychange` and at a declared interval, never per
 * event"*, because the container runs at `minReplicas: 0` and a cold start has been measured at
 * 28.7 s and 32.2 s. So this module has **no timer of its own**: it accumulates, and the shell —
 * which owns the page's lifecycle and is allowed a timer — decides when to call
 * {@link TelemetryRecorder.flush}. A recorder that scheduled its own flush would be a module
 * deciding when to spend a cold start, which § 8 gives to the product (*"Do not use telemetry as a
 * warmer"*).
 *
 * ## What it computes, and it is exactly one thing
 *
 * P-5 says the client records and never judges, and this module obeys it with one deliberate
 * exception § 7.2 names outright: `rerun_same_crowd`'s `crowdHeld` is *"derived by comparing this
 * pointer with the previous run's on seed and demand fields — not asserted by the client"*. That
 * comparison is mechanical and is done in {@link crowdHeldAgainst} rather than taken from a caller,
 * which is what *not asserted by the client* means — the emitter cannot claim it.
 */

import type { DisplayClock } from '../playback/clock.js';
import type { SessionStore } from '../persist/types.js';
import {
  UNASKED,
  clearConsent,
  grantConsent,
  readConsent,
  refuseConsent,
  withdrawConsent,
  type ConsentRecord,
  type TelemetryConsent,
} from './consent.js';
import {
  AT_MS_RESOLUTION_MS,
  BATCH_VERDICT_KINDS,
  CONTROL_KEYS,
  DAY_VERDICT_KINDS,
  END_REASONS,
  FIGURE_TONES,
  MAX_EVENTS_PER_BATCH,
  MAX_EVENTS_PER_SESSION,
  MAX_SESSION_ELAPSED_MS,
  REFUSAL_GROUNDS,
  SCREEN_KEYS,
  SUMMARY_FIGURE_KINDS,
  TELEMETRY_EVENT_NAMES,
  TELEMETRY_SCHEMA_VERSION,
  UNEMITTED_EVENTS,
  type TelemetryBatch,
  type TelemetryEvent,
  type TelemetryRunPointer,
  type UnstampedEvent,
} from './schema.js';

/* -------------------------------------------------------------------------- *
 * The ports
 * -------------------------------------------------------------------------- */

/** Where a batch goes, and what a withdrawal asks for. Both are fire-and-forget. */
export interface TelemetryTransport {
  /** Post one batch. Never awaited by this module; a rejection is swallowed by the adapter. */
  send(batch: TelemetryBatch): void;
  /** § 3.3's second request. Takes a `playerId` and nothing else — there is nothing else to take. */
  forget(playerId: string): void;
}

export interface TelemetryPorts {
  /** The one durable slot, or `undefined` where the browser denies storage. */
  readonly store: SessionStore | undefined;
  /** Monotonic milliseconds. `playback/clock.ts#systemClock` in a browser, a fake in a test. */
  readonly clock: DisplayClock;
  /** 128 bits of randomness as lower-case hex. `crypto.getRandomValues` in a browser. */
  readonly randomId: () => string;
  /**
   * The transport, or `undefined` when this page was served with no API origin.
   *
   * `undefined` is the shipped state of a `vite dev` page and of any deployment with no origin tag
   * (`docs/16` § 4). It is a *state* rather than a failure and nothing about the product changes in
   * it — which is § 7.6's second test and P-6.
   */
  readonly transport: TelemetryTransport | undefined;
  /** § 7.1's build-time constant. `release/version.ts#BUILD_VERSION`. */
  readonly buildId: string;
}

/* -------------------------------------------------------------------------- *
 * The recorder
 * -------------------------------------------------------------------------- */

export interface TelemetryRecorder {
  /** The current state. `unasked` on a device that has never been asked, and it means no. */
  consent(): TelemetryConsent;
  /**
   * Record a grant: mint the identifier, and begin collecting.
   *
   * Answers whether the slot survived the tab, so the surface can say the honest thing rather than
   * promising a device it could not write to.
   */
  grant(): boolean;
  /** Record a refusal. Writes one slot, sends nothing at all — § 4.2, including the refusal. */
  refuse(): boolean;
  /**
   * § 4.3's withdrawal, in its three steps and in that order: stop emitting, ask the server to
   * delete what it has, then clear the slot.
   *
   * The queue is dropped rather than flushed. Flushing first would be sending data on the way out
   * of consent, which is the one moment it is least defensible.
   */
  withdraw(): boolean;
  /** Forget the slot entirely, as *Clear saved progress* does. Sends nothing. */
  clear(): void;
  /** Queue one event. A no-op unless consent is `granted`. Never throws, never blocks. */
  record(event: UnstampedEvent): void;
  /** Send whatever is queued, if anything is and there is somewhere to send it. */
  flush(): void;
  /** How many events are queued. For a test, and for the shell's own assertion that it flushed. */
  queued(): number;
  /** The identifier, or `undefined`. Read by the shell so a withdrawal can name it. */
  playerId(): string | undefined;
}

/**
 * Which of an event's declared vocabularies it is outside, or `undefined` when it is inside all of
 * them.
 *
 * ## Why this exists when the types already say it
 *
 * Every emitter in this build is type-checked, so on paper no out-of-vocabulary value can reach
 * here. Three things make that a paper claim rather than a guarantee, and each is a real path:
 *
 * - the classifications come off **data**, not off literals — a `FigureTone` on a report restored
 *   from a saved session, a screen key on a state read out of storage — and a value that was valid
 *   when it was written outlives the build that wrote it;
 * - a `data/` change can retire a vocabulary member under a device holding the old one;
 * - `tsc` does not run in a player's browser.
 *
 * ## What it buys, and it is not politeness
 *
 * The server refuses a **batch** whole when one event is bad, and refuses it for the right reason
 * (P-3: accepting the good half would let the two ends of the wire diverge silently). That is the
 * correct server behaviour and it makes one stale value cost a whole session's tail. Dropping the
 * one event here costs one event. § 9.2 already accounts for a lost event and says the loss can
 * only subtract from a KPI; losing sixty-three good events beside it is a different size of harm.
 *
 * Exported so `recorder.test.ts` can name the field rather than assert on a queue length.
 */
export function outOfVocabulary(event: UnstampedEvent): string | undefined {
  const inList = (list: readonly string[], value: string): boolean => list.includes(value);
  if (!inList(TELEMETRY_EVENT_NAMES, event.name)) return 'name';
  if (!isEmitted(event.name)) return 'name';
  switch (event.name) {
    case 'session_start':
      return inList(SCREEN_KEYS, event.entryScreenKey) ? undefined : 'entryScreenKey';
    case 'screen_entered':
      if (!inList(SCREEN_KEYS, event.screenKey)) return 'screenKey';
      return event.fromScreenKey === null || inList(SCREEN_KEYS, event.fromScreenKey)
        ? undefined
        : 'fromScreenKey';
    case 'change_made':
      if (!inList(CONTROL_KEYS, event.controlKey)) return 'controlKey';
      return inList(SCREEN_KEYS, event.screenKey) ? undefined : 'screenKey';
    case 'verdict_shown':
      if (!inList([...DAY_VERDICT_KINDS, ...BATCH_VERDICT_KINDS], event.verdictKind)) {
        return 'verdictKind';
      }
      if (event.refusalGround !== null && !inList(REFUSAL_GROUNDS, event.refusalGround)) {
        return 'refusalGround';
      }
      return inList(SCREEN_KEYS, event.screenKey) ? undefined : 'screenKey';
    case 'refusal_shown':
      if (!inList([...FIGURE_TONES, ...SUMMARY_FIGURE_KINDS], event.refusalKind)) {
        return 'refusalKind';
      }
      return inList(SCREEN_KEYS, event.screenKey) ? undefined : 'screenKey';
    case 'session_end':
      return inList(END_REASONS, event.endReason) ? undefined : 'endReason';
    default:
      /*
       * `run_observed`, `trouble_visible`, `rerun_same_crowd` and `cold_load` carry no vocabulary
       * field — a run pointer, two numbers and a boolean. The server bounds all four, and there is
       * no closed list here for them to be outside of.
       */
      return undefined;
  }
}

/**
 * Whether two run pointers are the same crowd — § 7.2 E5's derivation.
 *
 * *"`crowdHeld` is derived by comparing this pointer with the previous run's on seed and demand
 * fields."* Those fields are the four that decide which passengers arrive and when: the seed, the
 * building whose population they are drawn from, the demand template, and the arrival rate. The
 * dispatcher is deliberately **not** among them — changing it is beat 3, and a re-run that held the
 * crowd while changing the dispatcher is precisely what beat 4 is for.
 *
 * `windowStartS` and `durationS` are not compared either, and that is the honest reading of *the
 * same crowd*: a shorter window over the same arrivals is the same crowd seen for less time.
 *
 * Exported so `recorder.test.ts` can drive the comparison directly rather than through a queue.
 */
export function crowdHeldAgainst(
  previous: TelemetryRunPointer | undefined,
  next: TelemetryRunPointer,
): boolean {
  if (previous === undefined) return false;
  return (
    previous.seed === next.seed &&
    previous.buildingId === next.buildingId &&
    previous.demandTemplateId === next.demandTemplateId &&
    previous.arrivalRatePctPop5min === next.arrivalRatePctPop5min
  );
}

/**
 * Build a recorder over the given ports.
 *
 * Constructed once per page by `everyday/telemetryPort.ts`. Not a class, for the reason every other
 * pure module here is not one: the state is three fields and a closure over them is testable without
 * a document or a constructor.
 */
export function createTelemetryRecorder(ports: TelemetryPorts): TelemetryRecorder {
  let record: ConsentRecord = readConsent(ports.store);
  /** § 3.4: 128 bits per session, **in memory only**, never written to storage. */
  const sessionId = ports.randomId();
  /** The instant the session's clock starts. Monotonic, and never an epoch millisecond. */
  const startedAtMs = ports.clock.now();
  let queue: TelemetryEvent[] = [];
  /** How many events this session has ever queued, for {@link MAX_EVENTS_PER_SESSION}. */
  let queuedEver = 0;
  /** The last run pointer seen, so {@link crowdHeldAgainst} has something to compare against. */
  let lastRun: TelemetryRunPointer | undefined;

  /** Session-elapsed milliseconds, rounded to § 7.1's resolution. */
  function atMs(): number {
    const elapsed = ports.clock.now() - startedAtMs;
    return Math.round(Math.max(0, elapsed) / AT_MS_RESOLUTION_MS) * AT_MS_RESOLUTION_MS;
  }

  function send(): void {
    const events = queue;
    queue = [];
    if (events.length === 0) return;
    const playerId = record.playerId;
    if (playerId === undefined || ports.transport === undefined) return;
    /*
     * **P-6, and the module's own promise: nothing here may throw into a caller.**
     *
     * This call was unguarded, and the case named for the invariant asserted the opposite —
     * `expect(() => { recorder.flush(); }).toThrow()`, one line under a comment saying it *"must
     * not reach a caller either"*. Review found the pair. The shipped adapter wraps everything
     * including `JSON.stringify`, so no live break existed; the invariant was false all the same.
     *
     * It matters because `send` is not only reached from `flush`. {@link api.record} calls it at
     * the batch cap, and the shell calls `record` inside `go()` — so a transport that threw
     * synchronously would break **navigation**, which is P-6's own sentence: the product behaves
     * identically however this fails.
     *
     * Swallowed rather than reported. There is nowhere to report it to that would not itself be
     * telemetry, and a player whose analytics endpoint is unreachable must not be told about it.
     * The events are already out of the queue above, so a failed send drops a batch rather than
     * retrying — which is § 4.2's direction: under-report rather than hold data waiting.
     */
    try {
      ports.transport.send({
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        buildId: ports.buildId,
        playerId,
        sessionId,
        events,
      });
    } catch {
      /* Deliberately empty — see above. */
    }
  }

  const api: TelemetryRecorder = {
    consent: () => record.state,

    grant: () => {
      const granted = grantConsent(ports.store, ports.randomId());
      record = granted.record;
      return granted.durable;
    },

    refuse: () => {
      /*
       * **A refusal that meets an id is a withdrawal, and this used to drop the id instead.**
       *
       * The comment here read: *"Nothing can be queued before a grant, so the only way to reach
       * here with a queue is a grant followed by a refusal — a shape no shipped surface offers
       * today."* That sentence was true when it was written and **the commit that shipped the
       * Settings pill made it false**, which is `CLAUDE.md`'s more dangerous half: a refusal
       * describing a path as unreachable, in the file that would have to handle it.
       *
       * The reachable path, all presses on a fresh device: the shell mounts `unasked` and draws
       * the ask; the player reaches Settings through the rail and presses the consent pill, which
       * grants and mints an id; a batch flushes under that id; **the ask is still on screen**, and
       * the player answers it. Pressing *No* dropped the id from the device while its rows sat on
       * the server for ninety days with nothing left anywhere that could name them.
       *
       * That is `docs/26` § 4.3's own sentence turned around — *a withdrawal that only stops
       * future collection is not a withdrawal* — and § 3.3's promise that the client holds both
       * keys at the moment of erasure.
       *
       * So a refusal that finds an id **is** the withdrawal, and takes its path: the deletion
       * request goes first and the local half is cleared after. A refusal with no id is the
       * ordinary case and is unchanged — there is nothing to delete, and asking the server to
       * forget nobody would be a request a refusal is not allowed to make.
       */
      const held = record.playerId;
      if (held !== undefined) return api.withdraw();

      const refused = refuseConsent(ports.store);
      record = refused.record;
      /* Nothing can be queued without a grant, so this is empty on every path that reaches it. */
      queue = [];
      return refused.durable;
    },

    withdraw: () => {
      // Step 1: stop emitting, including anything queued and unsent (§ 4.3).
      const playerId = record.playerId;
      queue = [];
      // Step 2: one deletion request, naming the id, and it is the only request this makes.
      if (playerId !== undefined) ports.transport?.forget(playerId);
      // Step 3: clear the local half. The id is gone from the device whether or not step 2 arrived.
      const withdrawn = withdrawConsent(ports.store);
      record = withdrawn.record;
      return withdrawn.durable;
    },

    clear: () => {
      queue = [];
      clearConsent(ports.store);
      record = UNASKED;
    },

    record: (event) => {
      /*
       * **P-1, and it is the first line on purpose.** Everything below this — the clock, the queue,
       * the pointer — is collection, and none of it may happen for a player who has not said yes.
       * A guard further down would still have read a clock on their behalf.
       */
      if (record.state !== 'granted') return;
      /*
       * P-3's client half, and the register's: an event outside a declared vocabulary is dropped
       * rather than queued, and so is one this build says it does not emit. {@link outOfVocabulary}
       * carries the argument for why a type-checked emitter is not enough.
       */
      if (outOfVocabulary(event) !== undefined) return;
      if (queuedEver >= MAX_EVENTS_PER_SESSION) return;
      /*
       * Past the session bound the server would refuse the batch, so the recorder stops rather than
       * sending something it knows is invalid. A tab open for a day is the case; § 9.2 already
       * accounts for a lost event, and a refused *batch* would lose the whole session's tail.
       */
      const stamp = atMs();
      if (stamp > MAX_SESSION_ELAPSED_MS) return;

      /*
       * The one derivation this module performs — § 7.2 E5. `crowdHeld` is computed here rather
       * than taken from `event`, which is what *not asserted by the client* means: the emitter has
       * no way to claim it, because the field is overwritten.
       */
      const stamped: TelemetryEvent =
        event.name === 'rerun_same_crowd'
          ? { ...event, atMs: stamp, crowdHeld: crowdHeldAgainst(lastRun, event.run) }
          : ({ ...event, atMs: stamp } as TelemetryEvent);
      if ('run' in stamped) lastRun = stamped.run;

      queue.push(stamped);
      queuedEver += 1;
      // § 7.1: over the batch cap the batch flushes. It does not grow and it does not drop here.
      if (queue.length >= MAX_EVENTS_PER_BATCH) send();
    },

    flush: () => {
      send();
    },

    queued: () => queue.length,
    playerId: () => record.playerId,
  };

  /*
   * Named so `refuse` can take `withdraw`'s path rather than re-implement it — see the comment
   * there. One deletion sequence, one place, and a second copy of it is how the two answers drift.
   */
  return api;
}

/**
 * Whether this build claims to emit an event of this name — the register in
 * `schema.ts#UNEMITTED_EVENTS`, read as a predicate.
 *
 * Exported because two callers need it and neither should re-derive it: `schema.test.ts`, which
 * asserts the register in both directions against the shipped emitters, and a reader.
 */
export function isEmitted(name: TelemetryEvent['name']): boolean {
  return UNEMITTED_EVENTS[name] === undefined;
}
