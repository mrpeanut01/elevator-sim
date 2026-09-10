/**
 * **The one place telemetry meets the browser** — GitHub issue #340.
 *
 * `telemetry/` is pure: no `localStorage`, no `crypto`, no `fetch`, no clock. This module is its DOM
 * half and is a declared shell-tier file in `boundaries.test.ts`, exactly as `everyday/shell.ts`
 * and `everyday/settingsScreen.ts` are. The split is the one `everyday/profileStore.ts` draws over
 * `everyday/profile.ts` and it buys the same thing: the words and the decisions are drivable by a
 * node test, and the four things only a browser has are behind four functions.
 *
 * ## A shared instance, on `profileStore.ts`'s precedent and for its reason
 *
 * `EverydayScreenContext` is deliberately minimal and shared by every screen lane, so a screen
 * cannot be handed a recorder through it — and the shell, which emits `session_start` and every
 * navigation, and the screens, which emit what they draw, must be talking to the same queue. One
 * instance, created on first ask.
 *
 * ## Where the batch goes, and why it can only be one place
 *
 * `packages/viz/staticwebapp.config.json` ships `connect-src 'self'`, widened only to the API
 * origin the build was told about (`docs/16` § 4). So a telemetry endpoint anywhere else is blocked
 * by the page's own policy before any code runs — which is why `docs/26` § 10 non-goal 2 can say a
 * third-party tracker is *refused, not negotiated*: the enforcement predates the posture. The origin
 * is read from the same `<meta>` tag `dev/main.ts` reads for the leaderboard client, and an absent
 * tag means an absent transport rather than a failure.
 *
 * ## Why this does not use `menu/client.ts`
 *
 * That client is the account and leaderboard transport and it carries a bearer token. Sending
 * telemetry through it would put the session token one parameter away from a telemetry request,
 * which is the join `docs/26` § 3.2 exists to make impossible. This module's transport has no
 * `token` field and no way to acquire one — `fetch` is called with two headers, neither of them
 * `authorization`.
 *
 * ## Nothing here waits and nothing here retries
 *
 * § 8: *"Never block the page, never retry aggressively, and treat total failure as normal."* The
 * `fetch` is not awaited by any caller, its rejection is swallowed, and a non-2xx answer is ignored.
 * A dropped batch is a data point lost, which § 9.2 already accounts for; a page waiting on a
 * thirty-second cold start is a product defect a player can see. `keepalive` is set so a flush
 * fired as the tab goes away is allowed to finish — that is the one thing the browser can do here
 * that no amount of code can.
 */

import { systemClock } from '../playback/clock.js';
import { BUILD_VERSION } from '../release/version.js';
import type { SessionStore } from '../persist/types.js';
import {
  createTelemetryRecorder,
  type TelemetryRecorder,
  type TelemetryTransport,
} from '../telemetry/recorder.js';
import type { TelemetryBatch } from '../telemetry/schema.js';

/** Where the API is, or `''` — `dev/main.ts` reads the same tag for the leaderboard client. */
function apiOrigin(): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector('meta[name="elevator-sim-api"]')?.getAttribute('content')?.trim() ?? '';
}

/**
 * The durable slot, or `undefined`.
 *
 * `everyday/profileStore.ts#browserBacking`'s shape, kept rather than shared: that function is
 * private to its module and exporting it would make one adapter serve two envelopes, which is the
 * *two writers for one version number* hazard one level down. Both guards matter — a page with no
 * `window` (a node test), and a browser that throws on merely *touching* `localStorage`, which
 * private windows do.
 */
function browserBacking(): SessionStore | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const storage = window.localStorage;
    return {
      read: (key) => storage.getItem(key),
      write: (key, value) => {
        storage.setItem(key, value);
      },
      remove: (key) => {
        storage.removeItem(key);
      },
    };
  } catch {
    /* Storage denied. Memory-only, honestly — and the settings row says so. */
    return undefined;
  }
}

/**
 * 128 bits of randomness as lower-case hex.
 *
 * `crypto.getRandomValues` and nothing else. § 3.1: the identifier *"is derived from nothing: not
 * from the device, not from the clock, not from anything about the person. A derived identifier is
 * one that reconstitutes itself after deletion, which would make § 4.3 false."* So there is no
 * fallback to `Math.random` and no fallback to a timestamp: where the platform has no CSPRNG this
 * returns the empty string, `consent.ts` refuses it, and the grant does not happen. A consent
 * screen that could not mint an honest id is better off not minting one.
 */
function randomId(): string {
  const source = globalThis.crypto;
  if (source === undefined || typeof source.getRandomValues !== 'function') return '';
  const bytes = source.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Post a batch, and ask for a player's rows to be deleted. Neither is awaited by a caller. */
function browserTransport(origin: string): TelemetryTransport | undefined {
  if (origin === '' || typeof fetch !== 'function') return undefined;
  const post = (path: string, body: unknown): void => {
    try {
      void fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        /*
         * The one browser affordance this module needs. A flush fired from `visibilitychange` as
         * the tab is hidden or closed would otherwise be cancelled with the page; `keepalive` lets
         * it finish. It caps the body at 64 KB in every implementation, which is the same bound
         * `MAX_BODY_BYTES` puts on the server side — a batch of sixty-four events is about 6 KB.
         */
        keepalive: true,
      }).catch(() => {
        /* § 8: total failure is normal. Nothing about the page depends on this. */
      });
    } catch {
      /* `fetch` can throw synchronously on a malformed origin. Same answer. */
    }
  };
  return {
    send: (batch: TelemetryBatch) => {
      post('/api/telemetry', batch);
    },
    forget: (playerId: string) => {
      post('/api/telemetry/forget', { playerId });
    },
  };
}

let shared: TelemetryRecorder | undefined;

/**
 * The recorder — created on first ask, the same one on every ask after.
 *
 * Every port is resolved once, here, at the moment of the first call. That is deliberately *lazy*
 * rather than at module load: `everyday/telemetryPort.ts` is imported by the shell, which is
 * imported by `boot.ts`, and reading a `<meta>` tag at module-evaluation time would read it before
 * the document this module is going to be asked about is necessarily complete.
 */
export function everydayTelemetry(): TelemetryRecorder {
  shared ??= createTelemetryRecorder({
    store: browserBacking(),
    clock: systemClock(),
    randomId,
    transport: browserTransport(apiOrigin()),
    buildId: BUILD_VERSION,
  });
  return shared;
}
