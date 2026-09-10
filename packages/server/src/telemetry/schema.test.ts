/**
 * The telemetry gate, driven against `docs/26-telemetry-and-privacy.md` § 7 — GitHub issue #340.
 *
 * ## What this file is for, and what `api.test.ts` is for
 *
 * Here: the **allowlist**, in both directions, and every refusal the gate can make. There: one
 * event driven from a request to a stored row, and the retention sweep removing it. The split is
 * the usual one — a shape check needs no database, and an end-to-end claim needs no per-field
 * enumeration.
 *
 * ## The rule every case here exists to hold
 *
 * P-3: *"The schema is the allowlist. An event not in § 7's table does not ship. An event that
 * answers no question stated in § 6 does not ship. Both directions are tested."* So the cases below
 * are not *does a valid batch pass* — one case does that and the rest break something on purpose,
 * because a gate is only worth what it refuses.
 *
 * P-4's second half is the other subject: **no unbounded string reaches a row**. The cases that
 * push a sentence, an address and a URL into every string-shaped field are that rule as a run.
 */

import { describe, expect, it } from 'vitest';

import { AWT_INVALID_GROUNDS } from '@elevator-sim/core';

import type { SubmittedRun } from '../leaderboard/submission.js';
import {
  AT_MS_RESOLUTION_MS,
  END_REASONS,
  MAX_EVENTS_PER_BATCH,
  MAX_SESSION_ELAPSED_MS,
  RAW_EVENT_RETENTION_MS,
  BATCH_VERDICT_KINDS,
  DAY_VERDICT_KINDS,
  FIGURE_TONES,
  REFUSAL_GROUNDS,
  REFUSAL_KINDS,
  SUMMARY_FIGURE_KINDS,
  RUN_POINTER_FIELDS,
  TELEMETRY_EVENT_NAMES,
  TELEMETRY_SCHEMA_VERSION,
  VERDICT_KINDS,
  batchIssues,
  eventIssues,
  runPointerIssues,
  type TelemetryEvent,
  type TelemetryEventName,
} from './schema.js';

/* -------------------------------------------------------------------------- *
 * Fixtures
 * -------------------------------------------------------------------------- */

/**
 * A valid run pointer, typed as `SubmittedRun` on purpose.
 *
 * § 2.1: *"The pointer's type already exists and a second one may not be invented."* Annotating the
 * fixture with the submission's own type is what makes that a compile-time claim rather than a
 * paragraph — a field renamed on `SubmittedRun` fails `tsc` here, and a field this schema forgot to
 * accept fails the case below.
 */
const RUN: SubmittedRun = Object.freeze({
  buildingId: 'garden-apartments',
  dispatcherProfileId: 'collective',
  demandTemplateId: 'rise-and-fall',
  arrivalRatePctPop5min: 6,
  durationS: 900,
  windowStartS: null,
  seed: '20260910',
});

const PLAYER = 'a'.repeat(32);
const SESSION = 'b'.repeat(32);

/** One valid event of every name, so a case can pick the one it wants to break. */
const VALID: Readonly<Record<TelemetryEventName, TelemetryEvent>> = Object.freeze({
  session_start: { name: 'session_start', atMs: 0, entryScreenKey: 'menu' },
  run_observed: { name: 'run_observed', atMs: 1_000, run: RUN, reachedEndedAt: true },
  trouble_visible: { name: 'trouble_visible', atMs: 2_000, run: RUN, atRunS: 412 },
  change_made: { name: 'change_made', atMs: 3_000, controlKey: 'fixit-repair', screenKey: 'fixit' },
  rerun_same_crowd: { name: 'rerun_same_crowd', atMs: 4_000, run: RUN, crowdHeld: true },
  verdict_shown: {
    name: 'verdict_shown',
    atMs: 5_000,
    verdictKind: 'cleared',
    refusalGround: null,
    screenKey: 'report',
  },
  session_end: { name: 'session_end', atMs: 6_000, endReason: 'hidden' },
  screen_entered: { name: 'screen_entered', atMs: 7_000, screenKey: 'stage', fromScreenKey: 'menu' },
  refusal_shown: { name: 'refusal_shown', atMs: 8_000, refusalKind: 'withheld', screenKey: 'report' },
  cold_load: { name: 'cold_load', atMs: 9_000, msToInteractive: 2_100 },
});

function batch(events: readonly unknown[]): unknown {
  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    buildId: '1a2b3c4d5e',
    playerId: PLAYER,
    sessionId: SESSION,
    events,
  };
}

/* -------------------------------------------------------------------------- *
 * The allowlist, both directions
 * -------------------------------------------------------------------------- */

describe('the event allowlist', () => {
  it('accepts every name `docs/26` § 7 declares, and this fixture covers all ten', () => {
    // Both directions of the fixture itself, first: a name added to the schema with no valid
    // example here would make every case below silently narrower than it reads.
    expect(Object.keys(VALID).sort()).toEqual([...TELEMETRY_EVENT_NAMES].sort());
    for (const name of TELEMETRY_EVENT_NAMES) {
      expect(eventIssues(VALID[name]), name).toEqual([]);
    }
  });

  it('refuses a name that is not in the table, however plausible', () => {
    // The three a later proposal is most likely to reach for, and each answers no question in § 6.
    for (const name of ['page_view', 'click', 'purchase', 'session_start ']) {
      expect(eventIssues({ name, atMs: 0 }), name).not.toEqual([]);
    }
  });

  it('refuses an event that is missing a field its row gives it', () => {
    for (const name of TELEMETRY_EVENT_NAMES) {
      const complete = VALID[name];
      for (const field of Object.keys(complete)) {
        if (field === 'name' || field === 'atMs') continue;
        const { [field]: _dropped, ...without } = complete;
        expect(eventIssues(without), `${name} without ${field}`).not.toEqual([]);
      }
    }
  });

  it('refuses an event carrying a field the table does not give it, rather than trimming it', () => {
    // Trimming is the tempting alternative and it is the one P-3 forbids: a client could then ship
    // a field nobody agreed to and never be told, which is collection outside the schema (§ 10
    // non-goal 8) arriving through the server's own politeness.
    for (const name of TELEMETRY_EVENT_NAMES) {
      expect(eventIssues({ ...VALID[name], extra: 1 }), name).not.toEqual([]);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * P-4 — no unbounded string reaches a row
 * -------------------------------------------------------------------------- */

describe('no player-authored string can reach a field', () => {
  /** The three shapes P-4 names as the hazard: a sentence, an address, and a link. */
  const TYPED = [
    'I could not get past the third floor and my name is Ada',
    'ada@example.test',
    'https://example.test/?note=hello',
  ];

  it('refuses one in every string-shaped field of every event', () => {
    for (const name of TELEMETRY_EVENT_NAMES) {
      const complete = VALID[name];
      for (const [field, value] of Object.entries(complete)) {
        if (field === 'name' || typeof value !== 'string') continue;
        for (const typed of TYPED) {
          expect(eventIssues({ ...complete, [field]: typed }), `${name}.${field}`).not.toEqual([]);
        }
      }
    }
  });

  it('refuses one in every string-shaped field of the run pointer', () => {
    for (const [field, value] of Object.entries(RUN)) {
      if (typeof value !== 'string') continue;
      for (const typed of TYPED) {
        expect(runPointerIssues({ ...RUN, [field]: typed }), `run.${field}`).not.toEqual([]);
      }
    }
  });

  it('refuses a `buildId` long enough to hold one, and accepts the one the viewer produces', () => {
    // `packages/viz/src/release/version.ts` emits a ten-character commit or the word it uses for a
    // tree that was never bundled. Both are inside the bound; a paragraph is not.
    expect(batchIssues({ ...(batch([VALID.session_start]) as object), buildId: 'unbuilt' })).toEqual([]);
    expect(
      batchIssues({ ...(batch([VALID.session_start]) as object), buildId: 'x'.repeat(65) }),
    ).not.toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The identity fields — § 3
 * -------------------------------------------------------------------------- */

describe('the two random ids', () => {
  it('accepts 128 bits of lower-case hex and nothing else', () => {
    expect(batchIssues(batch([VALID.session_start]))).toEqual([]);
    for (const bad of ['', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), `${'a'.repeat(31)}g`]) {
      expect(batchIssues({ ...(batch([VALID.session_start]) as object), playerId: bad }), bad).not.toEqual([]);
      expect(batchIssues({ ...(batch([VALID.session_start]) as object), sessionId: bad }), bad).not.toEqual([]);
    }
  });

  it('has no field an account id or a session token could arrive in', () => {
    // § 3.2 as a run rather than a sentence. A batch that carries one is refused as surplus, which
    // is the same mechanism that refuses a surplus field on an event — there is nowhere for the
    // join to be made because there is no field shaped to hold it.
    for (const key of ['userId', 'token', 'email', 'sessionToken', 'authorization']) {
      const issues = batchIssues({ ...(batch([VALID.session_start]) as object), [key]: 'x' });
      // The envelope check reads named fields rather than refusing surplus ones, so this asserts
      // the honest thing: whatever a caller adds, nothing in the schema reads it, and the row
      // written from this batch carries only the six values `store.ts` names. The surplus-field
      // refusal that *is* enforced is on the event, tested above.
      expect(issues, key).toEqual([]);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The clock — § 7.1
 * -------------------------------------------------------------------------- */

describe('`atMs` is a session-elapsed clock and cannot be a wall clock', () => {
  it('refuses an epoch millisecond, which is the mistake a client would actually make', () => {
    // 2026-09-10 as `Date.now()` would give it. This is the single most likely wrong value, and it
    // is refused by the bound rather than by a heuristic about how large a number looks.
    expect(eventIssues({ ...VALID.session_start, atMs: 1_789_000_000_000 })).not.toEqual([]);
    expect(eventIssues({ ...VALID.session_start, atMs: MAX_SESSION_ELAPSED_MS })).toEqual([]);
    expect(eventIssues({ ...VALID.session_start, atMs: MAX_SESSION_ELAPSED_MS + AT_MS_RESOLUTION_MS })).not.toEqual([]);
  });

  it('refuses a negative one, a fractional one, and one that is not rounded to 100 ms', () => {
    for (const atMs of [-100, 12.5, 1_234, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(eventIssues({ ...VALID.session_start, atMs }), String(atMs)).not.toEqual([]);
    }
    expect(eventIssues({ ...VALID.session_start, atMs: 1_200 })).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * The envelope — § 7.1
 * -------------------------------------------------------------------------- */

describe('the batch envelope', () => {
  it('refuses an unknown schema version rather than guessing at it', () => {
    for (const version of [0, 2, '1', null, undefined]) {
      expect(
        batchIssues({ ...(batch([VALID.session_start]) as object), schemaVersion: version }),
        String(version),
      ).not.toEqual([]);
    }
  });

  it('refuses an empty batch and one over the cap', () => {
    expect(batchIssues(batch([]))).not.toEqual([]);
    const many = Array.from({ length: MAX_EVENTS_PER_BATCH }, () => VALID.screen_entered);
    expect(batchIssues(batch(many))).toEqual([]);
    expect(batchIssues(batch([...many, VALID.screen_entered]))).not.toEqual([]);
  });

  it('refuses the whole batch when one event is bad, and names which one', () => {
    const issues = batchIssues(batch([VALID.session_start, { name: 'session_start', atMs: -1 }]));
    expect(issues.some((issue) => issue.startsWith('events[1]:'))).toBe(true);
  });

  it('refuses anything that is not an object', () => {
    for (const value of [null, undefined, 'batch', 7, [VALID.session_start]]) {
      expect(batchIssues(value), String(value)).not.toEqual([]);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The run pointer — § 2.1
 * -------------------------------------------------------------------------- */

describe('the run pointer is the submission’s own seven fields', () => {
  it('accepts a `SubmittedRun` and names exactly its required fields', () => {
    expect(runPointerIssues(RUN)).toEqual([]);
    expect([...RUN_POINTER_FIELDS].sort()).toEqual(Object.keys(RUN).sort());
  });

  it('refuses the two Everyday fields, which is the decision rather than an omission', () => {
    // § D440 gave `SubmittedRun` `ruleRows` and `interventions`. They are arrays of objects, they
    // answer no question in § 6, and accepting them would put an unbounded structure on an
    // unauthenticated route. Refused as surplus, so the absence is enforced rather than described.
    expect(runPointerIssues({ ...RUN, ruleRows: [] })).not.toEqual([]);
    expect(runPointerIssues({ ...RUN, interventions: [] })).not.toEqual([]);
  });

  it('accepts the two nulls that mean a real selection', () => {
    // `arrivalRatePctPop5min: null` is the building's own profile and `windowStartS: null` is the
    // whole period. Both are distinct selections rather than missing values, which is what
    // `submission.ts` says about the same two fields.
    expect(runPointerIssues({ ...RUN, arrivalRatePctPop5min: null, windowStartS: null })).toEqual([]);
  });

  it('refuses a seed that is not decimal digits, and a duration outside a day', () => {
    for (const seed of ['', 'abc', '-1', '1.5', '1'.repeat(21)]) {
      expect(runPointerIssues({ ...RUN, seed }), seed).not.toEqual([]);
    }
    for (const durationS of [0, -900, 86_401, Number.NaN]) {
      expect(runPointerIssues({ ...RUN, durationS }), String(durationS)).not.toEqual([]);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The vocabularies — § 7.4
 * -------------------------------------------------------------------------- */

describe('the vocabularies are the product’s and not this module’s', () => {
  it('takes the refusal grounds from `core`’s own table', () => {
    // P-5, and the reason `metrics/awtValidity.ts` exists: a ground *is* its entry in that table,
    // so a sixth one widens this with no edit here. A hand-written tuple would be the
    // hand-written-list defect one package along.
    expect(REFUSAL_GROUNDS).toEqual(AWT_INVALID_GROUNDS);
    for (const ground of AWT_INVALID_GROUNDS) {
      expect(eventIssues({ ...VALID.verdict_shown, refusalGround: ground }), ground).toEqual([]);
    }
    expect(eventIssues({ ...VALID.verdict_shown, refusalGround: 'made-up' })).not.toEqual([]);
  });

  it('accepts a null refusal ground, because a verdict that is not a refusal has none', () => {
    expect(eventIssues({ ...VALID.verdict_shown, refusalGround: null })).toEqual([]);
  });

  it('takes a verdict from both shipped classifications, and they are disjoint', () => {
    /*
     * The deviation from § 7.4, asserted rather than only argued in a docstring. § 7.4 names the
     * bench's `BatchVerdict`; the daily loop's beat-5 verdict is `ShapedDayReport.verdict`, and
     * `docs/26 K2`'s chain is the daily loop. Both are accepted, and the sets must stay disjoint —
     * if they ever overlapped, a stored `verdictKind` would no longer say which surface drew it,
     * and `screenKey` alone would have to carry a distinction the vocabulary had lost.
     */
    const overlap = DAY_VERDICT_KINDS.filter((kind) =>
      (BATCH_VERDICT_KINDS as readonly string[]).includes(kind),
    );
    expect(overlap).toEqual([]);
    expect(VERDICT_KINDS).toEqual([...DAY_VERDICT_KINDS, ...BATCH_VERDICT_KINDS]);
  });

  it('takes a figure classification from both shipped ones, refusals and non-refusals alike', () => {
    /*
     * The same deviation one field along, plus the half that looks like a defect and is not: three
     * of these members are not refusals at all. `observation` and `plain` are ordinary figures and
     * `unranked` is § D106's energy pair, which may not be ranked and is not withheld. Narrowing
     * the vocabulary to the ones that read like refusals would be this schema deciding what a
     * refusal is, and P-5 gives that decision to the surface.
     */
    expect(REFUSAL_KINDS).toEqual([...SUMMARY_FIGURE_KINDS, ...FIGURE_TONES]);
    for (const kind of ['observation', 'plain', 'unranked']) {
      expect(eventIssues({ ...VALID.refusal_shown, refusalKind: kind }), kind).toEqual([]);
    }
  });

  it('closes the verdict, refusal-kind and end-reason lists', () => {
    for (const kind of VERDICT_KINDS) {
      expect(eventIssues({ ...VALID.verdict_shown, verdictKind: kind }), kind).toEqual([]);
    }
    for (const kind of REFUSAL_KINDS) {
      expect(eventIssues({ ...VALID.refusal_shown, refusalKind: kind }), kind).toEqual([]);
    }
    for (const reason of END_REASONS) {
      expect(eventIssues({ ...VALID.session_end, endReason: reason }), reason).toEqual([]);
    }
    expect(eventIssues({ ...VALID.verdict_shown, verdictKind: 'good' })).not.toEqual([]);
    expect(eventIssues({ ...VALID.refusal_shown, refusalKind: 'refused' })).not.toEqual([]);
    expect(eventIssues({ ...VALID.session_end, endReason: 'closed' })).not.toEqual([]);
  });

  it('bounds a screen key and a control key without closing them', () => {
    // The viewer's screen registry grows and `docs/26` § 7.4 says the control registry is owed with
    // the controls, so these are bounded tokens here and closed lists in the client. Bounded is not
    // unbounded: a token cannot spell a sentence, an address or a URL.
    for (const key of ['menu', 'fixit', 'mixed-use-high-rise', 'a'.repeat(64)]) {
      expect(eventIssues({ ...VALID.screen_entered, screenKey: key }), key).toEqual([]);
    }
    for (const key of ['', 'Menu', 'menu screen', 'a'.repeat(65), '-menu']) {
      expect(eventIssues({ ...VALID.screen_entered, screenKey: key }), key).not.toEqual([]);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The horizon — § 5.1
 * -------------------------------------------------------------------------- */

describe('the retention horizon', () => {
  it('is ninety days, which is what `docs/26` § 5.1 derives', () => {
    // Pinned here rather than left to a reader of the expression, because this constant is the
    // whole of what `docs/26` § 5 promises and `store.ts`'s sweep is the only thing enforcing it.
    expect(RAW_EVENT_RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});
