/**
 * **§ 7.6's three tests, and the first one is the reason this file exists** — GitHub issue #340.
 *
 * `docs/26-telemetry-and-privacy.md` § 7.6 states what the schema owes before it ships:
 *
 * 1. *"Both polarities of the dead-seam rule. Every event name the client can emit is in § 7's
 *    table with a question and a KPI beside it; and every entry in the table has a **non-test
 *    emitter** in shipped code. An event nobody emits is a dead seam. An event no KPI reads is data
 *    held for no reason, which is worse."*
 * 2. *"Absent-tolerance."* With the transport unset, a session completes and every screen behaves
 *    identically — P-6. The recorder's half is `recorder.test.ts`; the browser half is a tier this
 *    file cannot reach and is named in the report rather than claimed here.
 * 3. *"No unbounded string, and no clock in `core/`."* The first is asserted over the schema's own
 *    types by `packages/server/src/telemetry/schema.test.ts`, which is where the runtime gate is;
 *    the second is `boundaries.test.ts`, which already owns both rules for the whole package.
 *
 * ## The emitter scan, and what it is and is not
 *
 * {@link emittersOf} is a **text scan** over the package's non-test sources, in the idiom
 * `store/concurrency.test-helper.ts` uses on `store.ts`: crude on purpose, and loud rather than
 * silent when it cannot read something. It answers *which shipped file writes this event name*, and
 * it cannot answer *does that line ever run* — which is the question the standing requirement in
 * `docs/05-roadmap.md` says a barrel re-export and a `{@link}` tag both fail. What closes that gap
 * here is the browser tier and the register: an event with a shipped emitter that no player can
 * reach would still be a seam, and the honest place to say so is {@link UNEMITTED_EVENTS}.
 *
 * ## The other end of the wire
 *
 * `packages/server` cannot import this package and must not, so the two closed vocabularies it
 * declares — the verdict kinds and the figure classifications — are a **mirror** of types that live
 * here. A mirror nobody checks is what P-5 forbids, so this file reads the server's own source and
 * compares both directions. `menu/client.test.ts` reads that package the same way and for the same
 * reason: this is the wire, and two ends of it cannot be allowed to drift.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EVERYDAY_SCREENS } from '../everyday/types.js';
import {
  BATCH_VERDICT_KINDS,
  CONTROL_KEYS,
  DAY_VERDICT_KINDS,
  END_REASONS,
  FIGURE_TONES,
  MAX_EVENTS_PER_BATCH,
  REFUSAL_GROUNDS,
  SCREEN_KEYS,
  SUMMARY_FIGURE_KINDS,
  TELEMETRY_EVENT_NAMES,
  TELEMETRY_SCHEMA_VERSION,
  UNEMITTED_EVENTS,
  telemetryRunPointerOf,
  type TelemetryEventName,
} from './schema.js';

const VIZ_SRC = fileURLToPath(new URL('../', import.meta.url));
const SERVER_SRC = fileURLToPath(new URL('../../../server/src/', import.meta.url));

/* -------------------------------------------------------------------------- *
 * The emitter scan
 * -------------------------------------------------------------------------- */

/**
 * TypeScript with comments and string literals left alone but comments removed.
 *
 * Only comments go, and that is the difference from `documentation.test.ts`'s harsher stripper: the
 * thing being looked for **is** a string literal, so removing literals would remove the subject.
 * What has to go is prose — a docstring naming `session_start` while explaining why nothing emits
 * it would otherwise read as an emitter, which is the exact shape of false positive
 * `docs/22-charter.md`'s S1 cell was corrected for.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/[^\n]*/gu, ' ');
}

/** Every non-test `.ts` under `packages/viz/src`, as `[relative id, comment-stripped source]`. */
function shippedSources(): readonly (readonly [string, string])[] {
  const found: (readonly [string, string])[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(path);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test-helper.ts')) continue;
      found.push([path.slice(VIZ_SRC.length).split(sep).join('/'), withoutComments(readFileSync(path, 'utf8'))]);
    }
  };
  walk(VIZ_SRC);
  return found;
}

/**
 * Which shipped files compose an event of this name.
 *
 * `name: '<event>'` is the shape every emitter has, because {@link UnstampedEvent} is a
 * discriminated union and the discriminant is how a caller picks a member. `telemetry/` itself is
 * excluded: `schema.ts` **declares** the names and `recorder.ts` switches on them, and counting
 * either as an emitter would make the register unfalsifiable — the module that says an event is not
 * emitted would be the module proving it is.
 */
function emittersOf(name: TelemetryEventName): readonly string[] {
  const shape = new RegExp(`name:\\s*'${name}'`, 'u');
  return shippedSources()
    .filter(([id]) => !id.startsWith('telemetry/'))
    .filter(([, source]) => shape.test(source))
    .map(([id]) => id);
}

/* -------------------------------------------------------------------------- *
 * § 7.6's first test — both polarities of the dead-seam rule
 * -------------------------------------------------------------------------- */

describe('§ 7.6 — every declared event is emitted, and every emitted event is declared', () => {
  it('finds a non-test emitter for every event this build does not exempt', () => {
    const missing = TELEMETRY_EVENT_NAMES.filter(
      (name) => UNEMITTED_EVENTS[name] === undefined && emittersOf(name).length === 0,
    );
    expect(
      missing,
      'these events are in `docs/26` § 7’s table, this build does not declare them unemitted, and ' +
        'nothing in shipped code composes one. That is the dead seam `CLAUDE.md` opens with: wire ' +
        'them, or enter them in `UNEMITTED_EVENTS` with what is blocking them.',
    ).toEqual([]);
  });

  it('finds no emitter for an event the register says is not emitted', () => {
    // The other direction, and the one that keeps the register from becoming decoration. An entry
    // that has quietly acquired an emitter is a claim that has stopped being true, and it must fail
    // on the commit that wires it rather than on the day somebody reads the constant.
    for (const [name, reason] of Object.entries(UNEMITTED_EVENTS)) {
      expect(emittersOf(name as TelemetryEventName), `${name} is registered as unemitted (${reason})`).toEqual([]);
    }
  });

  it('gives every unemitted event a reason long enough to be one', () => {
    for (const [name, reason] of Object.entries(UNEMITTED_EVENTS)) {
      expect(reason.length, `${name}: no reason`).toBeGreaterThan(120);
    }
  });

  it('positive control: the scan finds the emitters it is supposed to be finding', () => {
    // Without this the two cases above pass on a broken scan — one because it finds nothing
    // anywhere, the other because it finds nothing anywhere. The four named here are the funnel's
    // spine and they live in four different files.
    expect(emittersOf('session_start')).toContain('everyday/shell.ts');
    expect(emittersOf('screen_entered')).toContain('everyday/shell.ts');
    expect(emittersOf('trouble_visible')).toContain('everyday/stageScreen.ts');
    expect(emittersOf('verdict_shown')).toContain('everyday/reportScreen.ts');
    expect(emittersOf('change_made')).toContain('everyday/fixitScreen.ts');
  });

  it('positive control: a prose mention is not an emitter', () => {
    // The correction `docs/22-charter.md`'s S1 cell had to publish, held as a check rather than as
    // a paragraph: a word grep matches the word used to deny the thing.
    const prose = withoutComments("/* nothing here emits name: 'rerun_same_crowd' at all */\nexport const x = 1;\n");
    expect(/name:\s*'rerun_same_crowd'/u.test(prose)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * The two ends of the wire
 * -------------------------------------------------------------------------- */

describe('the client’s schema and the server’s agree, in both directions', () => {
  const serverSchema = (): string => readFileSync(join(SERVER_SRC, 'telemetry', 'schema.ts'), 'utf8');

  /** A `const NAME = [ … ] as const;` tuple, read out of the server's source as strings. */
  function serverTuple(name: string): readonly string[] {
    const source = serverSchema();
    const block = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`, 'u').exec(source);
    expect(block, `the server no longer declares ${name} in the form this case reads`).not.toBeNull();
    return [...String(block?.[1]).matchAll(/'([^']+)'/gu)].map((match) => String(match[1]));
  }

  it('declares the same ten event names, in the same order', () => {
    expect(serverTuple('TELEMETRY_EVENT_NAMES')).toEqual([...TELEMETRY_EVENT_NAMES]);
  });

  it('declares the same verdict and figure vocabularies', () => {
    expect(serverTuple('DAY_VERDICT_KINDS')).toEqual([...DAY_VERDICT_KINDS]);
    expect(serverTuple('BATCH_VERDICT_KINDS')).toEqual([...BATCH_VERDICT_KINDS]);
    expect(serverTuple('SUMMARY_FIGURE_KINDS')).toEqual([...SUMMARY_FIGURE_KINDS]);
    expect(serverTuple('FIGURE_TONES')).toEqual([...FIGURE_TONES]);
    expect(serverTuple('END_REASONS')).toEqual([...END_REASONS]);
  });

  it('agrees on the envelope’s two constants', () => {
    const source = serverSchema();
    expect(source).toContain(`export const TELEMETRY_SCHEMA_VERSION = ${String(TELEMETRY_SCHEMA_VERSION)};`);
    expect(source).toContain(`export const MAX_EVENTS_PER_BATCH = ${String(MAX_EVENTS_PER_BATCH)};`);
  });

  it('positive control: the reader really is reading the server and can fail', () => {
    // A `serverTuple` that silently returned `[]` would make every case above pass, which is the
    // one failure mode a mirror check may not have.
    expect(serverTuple('END_REASONS').length).toBeGreaterThan(0);
    expect(() => serverTuple('NO_SUCH_TUPLE')).toThrow();
  });
});

/* -------------------------------------------------------------------------- *
 * P-5 — the vocabularies are the product's
 * -------------------------------------------------------------------------- */

describe('every vocabulary is the product’s own', () => {
  it('takes the screen keys from the screen registry, unchanged', () => {
    // Identity rather than equality: `SCREEN_KEYS` **is** `EVERYDAY_SCREENS`, so a screen added to
    // the registry is collectable on that commit and a copy cannot go stale.
    expect(SCREEN_KEYS).toBe(EVERYDAY_SCREENS);
  });

  it('has no vocabulary member that is not a bounded token the server will store', () => {
    /*
     * P-4 as a run over the client's own lists. The server bounds a vocabulary token to lower-case
     * letters, digits and hyphens; a member here that fell outside that would be a value this
     * client can compose and that server will refuse, and the whole batch would go with it.
     */
    const token = /^[a-z0-9][a-z0-9-]{0,63}$/u;
    for (const list of [SCREEN_KEYS, CONTROL_KEYS, DAY_VERDICT_KINDS, BATCH_VERDICT_KINDS, FIGURE_TONES, SUMMARY_FIGURE_KINDS, END_REASONS, REFUSAL_GROUNDS]) {
      for (const member of list) expect(token.test(member), member).toBe(true);
    }
  });

  it('gives every control kind a shipped press, and every shipped press a control kind', () => {
    /*
     * § 7.4's *"a control that changes a run and is not in the registry is a finding, not a silent
     * omission"*, as far as a scan can hold it. Both directions: a key nothing presses is a dead
     * entry, and a `change_made` composed with a key this list does not have would not compile —
     * which is the half a test cannot add to.
     */
    const sources = shippedSources().filter(([id]) => !id.startsWith('telemetry/'));
    for (const key of CONTROL_KEYS) {
      /*
       * The **literal** rather than `controlKey: '…'`, because two of the five are not written at
       * the property: the machinery steppers resolve theirs from `FixitMachineryRow.key` in a
       * ternary, which is right — the row's own `'speed' | 'capacity'` is the product's vocabulary
       * and a duplicated literal at each handler would be a second one. The looser shape can
       * over-match a file that merely mentions a key, and that is the safe direction for this
       * question: it can report a key as pressed when it is not, and cannot hide one that is.
       */
      const pressed = sources.some(([, source]) => source.includes(`'${key}'`));
      expect(pressed, `${key} is in the control registry and nothing presses it`).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The run pointer — § 2.1
 * -------------------------------------------------------------------------- */

describe('the run pointer is a projection of the submission and not a second type', () => {
  const RUN = Object.freeze({
    buildingId: 'garden-apartments',
    dispatcherProfileId: 'collective',
    demandTemplateId: 'rise-and-fall',
    arrivalRatePctPop5min: 6,
    durationS: 900,
    windowStartS: null,
    seed: '20260910',
  });

  it('carries the seven fields and drops the two spreads', () => {
    const pointer = telemetryRunPointerOf({ ...RUN, ruleRows: [], interventions: [] });
    expect(Object.keys(pointer).sort()).toEqual(Object.keys(RUN).sort());
  });

  it('carries a null rate and a null window rather than dropping them', () => {
    // Both nulls are real selections — the building's own profile, and the whole period — so a
    // pointer that omitted them would name a different run from the one the player watched.
    const pointer = telemetryRunPointerOf({ ...RUN, arrivalRatePctPop5min: null, windowStartS: null });
    expect(pointer.arrivalRatePctPop5min).toBeNull();
    expect(pointer.windowStartS).toBeNull();
  });
});
