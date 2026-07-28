/**
 * **The JSON in `docs/06-parameterization-and-tuning.md` is executed, not read.**
 *
 * That document is the one a person or an optimizer copies from. Two review findings were the same
 * defect in it, and both survived because nothing in the suite ever looked at the file:
 *
 * - **#6** — the "Worked example: a complete dispatcher config" weighted `rideTime: 0.3` while
 *   authoring no `dispatch.callType`, so the term sat at the `up-down-buttons` default where
 *   `rideTimeTerm.activeWhen` declares it **inert**. `policies.test.ts` § *"lets no profile weight a
 *   term its own stage settings make inert"* builds exactly that profile as a fixture and fails on
 *   it. So the single config the tuning doc presented as canonical was the one the repository
 *   forbids — and the doc invites the reader to paste it into `data/dispatcher-profiles.json`.
 * - **#7** — the self-describing-schema example declared `"id": "dispatch.parkingStrategy"`, which
 *   no profile can hold: `dispatchStageSchema` is a `z.strictObject` with no `parkingStrategy` key.
 *   An optimizer implementing that section samples a dimension `parseDispatcherProfiles` rejects,
 *   and never samples the real knob, `idle.parkingStrategy`.
 *
 * ## The partition is the load-bearing part
 *
 * Every fenced `json` block in the document is classified into exactly one of three kinds, and the
 * classification is asserted **total**: a block this file cannot recognise fails the suite rather
 * than being skipped. That is what stops the guard decaying into "the two blocks somebody thought
 * of at the time" — a new example must either satisfy a check or be declared here with a reason.
 *
 * | kind | check |
 * |---|---|
 * | dispatcher profile (`id` + `weights`) | round-trips through the real `parseDispatcherProfiles`, and weights no term its own resolved stage settings gate off |
 * | parameter declarations (`id` + `type`) | every dotted `id`, and every `activeWhen` gate key, is a member of `collectSearchSpace().ids` |
 * | declared other | listed in {@link DECLARED_OTHER} with the reason it is neither |
 *
 * The third row is one entry: Layer 4's `patternSwitching` illustration, which is neither a profile
 * nor a parameter declaration and — per `DECISIONS.md` § D12 — describes a controller that does not
 * exist. It is declared rather than pattern-matched away, so the day somebody implements the
 * detector this file has to be revisited instead of quietly continuing to ignore the block.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  COST_TERMS_BY_ID,
  parseDispatcherProfiles,
  resolveDispatchConfig,
  type DispatcherProfile,
} from '@elevator-sim/core';
import { describe, expect, it } from 'vitest';

import { collectSearchSpace } from './collect.js';

const DOC = fileURLToPath(
  new URL('../../../../../docs/06-parameterization-and-tuning.md', import.meta.url),
);

const PROFILES_JSON = fileURLToPath(
  new URL('../../../../../data/dispatcher-profiles.json', import.meta.url),
);

/**
 * Blocks that are neither a dispatcher profile nor a parameter declaration, keyed by a substring
 * that identifies the block, with the reason each is exempt.
 */
const DECLARED_OTHER: ReadonlyMap<string, string> = new Map([
  [
    '"patternDetector"',
    'Layer 4 illustrates the fuzzy pattern-switching block. It is authored in data/ and schema-validated, ' +
      'and no runtime code reads it — DECISIONS.md § D12 records it as deliberately unimplemented scope ' +
      'and docs/05-roadmap.md marks the Phase 7 bullet not-done. It is not a profile and declares no tunable.',
  ],
]);

/** Every fenced ```json block in the document, in order, with its 1-based start line. */
function jsonBlocks(): readonly { readonly line: number; readonly body: string }[] {
  const lines = readFileSync(DOC, 'utf8').split('\n');
  const blocks: { line: number; body: string }[] = [];
  let open: { line: number; body: string[] } | undefined;
  for (const [index, line] of lines.entries()) {
    if (open === undefined) {
      if (line.trim() === '```json') open = { line: index + 2, body: [] };
      continue;
    }
    if (line.trim() === '```') {
      blocks.push({ line: open.line, body: open.body.join('\n') });
      open = undefined;
      continue;
    }
    open.body.push(line);
  }
  expect(open, 'an unterminated ```json fence in docs/06').toBeUndefined();
  return blocks;
}

/**
 * The schema example is three sibling objects separated by commas rather than a JSON array, which
 * is how it reads best in prose and is not parseable as written. Wrapping restores it; nothing else
 * about the block is touched, so a syntax error inside it still fails.
 */
function parseBlock(body: string): unknown {
  const trimmed = body.trim();
  const text = trimmed.startsWith('{') && /\}\s*,\s*\{/.test(trimmed) ? `[${trimmed}]` : trimmed;
  return JSON.parse(text) as unknown;
}

type Kind = 'profile' | 'parameters' | 'other';

function classify(value: unknown, body: string): Kind {
  for (const marker of DECLARED_OTHER.keys()) if (body.includes(marker)) return 'other';
  const rows = Array.isArray(value) ? value : [value];
  const objects = rows.filter(
    (row): row is Record<string, unknown> => typeof row === 'object' && row !== null,
  );
  if (objects.length === rows.length && objects.every((row) => 'weights' in row)) return 'profile';
  if (objects.length === rows.length && objects.every((row) => 'id' in row && 'type' in row)) {
    return 'parameters';
  }
  return 'other';
}

/**
 * Term ids this profile weights above zero whose own `activeWhen` its **resolved** settings do not
 * satisfy — the same computation `policies.test.ts` applies to the shipped file, against the
 * resolved configuration rather than the authored one, because a profile that authors no `dispatch`
 * section still runs at `DISPATCH_DEFAULTS`.
 */
function unsatisfiedGatesOf(profile: DispatcherProfile): readonly string[] {
  const settingAt = (path: string): unknown => {
    const resolved = resolveDispatchConfig(profile) as unknown as Record<string, unknown>;
    const authored = profile as unknown as Record<string, unknown>;
    for (const root of [resolved, authored]) {
      let cursor: unknown = root;
      for (const key of path.split('.')) {
        if (typeof cursor !== 'object' || cursor === null) {
          cursor = undefined;
          break;
        }
        cursor = (cursor as Record<string, unknown>)[key];
      }
      if (cursor !== undefined) return cursor;
    }
    return undefined;
  };

  const dead: string[] = [];
  for (const [termId, weight] of Object.entries(profile.weights)) {
    if (weight === 0) continue;
    const term = COST_TERMS_BY_ID.get(termId);
    if (term?.activeWhen === undefined) continue;
    const satisfied = Object.entries(term.activeWhen).every(([path, admitted]) =>
      admitted.includes(String(settingAt(path))),
    );
    if (!satisfied) dead.push(termId);
  }
  return dead;
}

describe('docs/06 § JSON examples', () => {
  const blocks = jsonBlocks();

  it('has at least one block of each checkable kind, so the assertions below are not vacuous', () => {
    const kinds = blocks.map(({ body }) => classify(parseBlock(body), body));
    expect(kinds).toContain('profile');
    expect(kinds).toContain('parameters');
  });

  it('classifies every fenced block — an unrecognised example fails rather than being skipped', () => {
    for (const { line, body } of blocks) {
      const kind = classify(parseBlock(body), body);
      if (kind !== 'other') continue;
      const declared = [...DECLARED_OTHER.keys()].some((marker) => body.includes(marker));
      expect(
        declared,
        `docs/06 line ${String(line)}: a fenced json block that is neither a dispatcher profile ` +
          `(id + weights) nor a parameter declaration (id + type), and is not declared in ` +
          `DECLARED_OTHER. Add it there with the reason, or make it checkable.`,
      ).toBe(true);
    }
  });

  it('loads every profile example through the real parseDispatcherProfiles', () => {
    const shipped = JSON.parse(readFileSync(PROFILES_JSON, 'utf8')) as Record<string, unknown>;
    for (const { line, body } of blocks) {
      const value = parseBlock(body);
      if (classify(value, body) !== 'profile') continue;
      const rows = Array.isArray(value) ? value : [value];
      expect(
        () => parseDispatcherProfiles({ ...shipped, profiles: rows }),
        `docs/06 line ${String(line)}: this worked example does not load. The document tells the ` +
          `reader to paste it into data/dispatcher-profiles.json.`,
      ).not.toThrow();
    }
  });

  it('weights no term the example’s own stage settings gate off (review finding #6)', () => {
    const shipped = JSON.parse(readFileSync(PROFILES_JSON, 'utf8')) as Record<string, unknown>;
    for (const { line, body } of blocks) {
      const value = parseBlock(body);
      if (classify(value, body) !== 'profile') continue;
      const rows = Array.isArray(value) ? value : [value];
      const parsed = parseDispatcherProfiles({ ...shipped, profiles: rows });
      for (const profile of parsed.profiles) {
        expect(
          unsatisfiedGatesOf(profile),
          `docs/06 line ${String(line)}: profile "${profile.id}" weights a term its own resolved ` +
            `stage settings make inert. Pasting this example into data/ turns policies.test.ts red.`,
        ).toEqual([]);
      }
    }
  });

  it('declares only ids a profile can actually hold (review finding #7)', () => {
    const ids = new Set(collectSearchSpace().ids);
    expect(ids.size, 'the collected search space is empty, so the check below proves nothing')
      .toBeGreaterThan(0);

    for (const { line, body } of blocks) {
      const value = parseBlock(body);
      if (classify(value, body) !== 'parameters') continue;
      const rows = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
      for (const row of rows) {
        const declared = String(row['id']);
        expect(
          ids.has(declared),
          `docs/06 line ${String(line)}: declares "${declared}", which is not a dimension ` +
            `collectSearchSpace() returns. An optimizer implementing this section would sample a ` +
            `path no profile can hold.`,
        ).toBe(true);

        const gates = row['activeWhen'];
        if (typeof gates !== 'object' || gates === null) continue;
        for (const gate of Object.keys(gates)) {
          expect(
            ids.has(gate),
            `docs/06 line ${String(line)}: "${declared}" is gated on "${gate}", which is not a ` +
              `dimension of the search space, so the gate can never be evaluated.`,
          ).toBe(true);
        }
      }
    }
  });
});
