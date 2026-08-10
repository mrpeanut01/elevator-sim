import { describe, expect, it } from 'vitest';

import {
  DISPATCH_PARAMETERS,
  dispatchParameter,
} from './parameters.js';
import { COST_TERMS } from './terms/index.js';
import { HARD_CONSTRAINT_IDS, HARD_CONSTRAINT_WORDS } from './types.js';
import type { PlayerControlWords } from './types.js';

/**
 * The player-facing vocabulary — Everyday Mode's §16 rule 11, GitHub issue #147, and the
 * engine contract's §6.3 (`docs/design/design_handoff_casual_mode/`).
 *
 * The rule under test: **no engine identifier may reach a Casual surface, and every control a
 * Casual surface can reach carries a player-facing name and one-clause effect declared beside
 * the model.** The optimizer's `description` and the player's words are two fields with two
 * readers, never one string doing both jobs.
 *
 * Same posture as `parameters.test.ts`: exact in both directions. A row the Everyday surfaces
 * reach without words is a content bug this file catches; a row that *grew* words without being
 * added to the reachable list is a claim about the product nobody made, and it fails too.
 */

/**
 * Every row an Everyday surface can reach, by id — the thirteen weight sliders, the hard
 * constraint's card, and the controls behind the workshop's flags, group levers and
 * traffic-pattern block (gameplay guide §6.4–§6.5, §11.3–§11.4).
 *
 * Deliberately a hand-written list, mirrored against the schema below in both directions, the
 * way `parameters.test.ts` pins "exactly two gated weights": adding a Casual control means
 * adding its row here in the same change, and the failure message says so.
 */
const CASUAL_REACHABLE: readonly string[] = Object.freeze([
  ...COST_TERMS.map((term) => `weights.${term.id}`),
  'constraints.noDirectionReversal',
  'dispatch.callType',
  'eligibility.maxLoadFactorForAssignment',
  'idle.parkingStrategy',
  'selection.policy',
  'selection.hysteresisS',
  'selection.observationWindowS',
  'selection.lobbyArrivalRateGain',
  'selection.interfloorRateGain',
  'selection.downPeakRateGain',
  'selection.switchMargin',
]);

/** Every player-facing string a spec carries, for register checks. */
function playerStringsOf(words: PlayerControlWords): readonly string[] {
  return [words.name, words.effect, words.atZero, words.atFull].filter(
    (text): text is string => text !== undefined,
  );
}

/**
 * The register check: a player-facing string may not contain an engine identifier.
 *
 * Two shapes cover every identifier this package mints — a camelCase run (`waitTime`,
 * `noDirectionReversal`) and a dotted schema path (`weights.`, `selection.`). Plain English
 * ids (`starvation`, `crowding`) are *allowed*: the contract's own player names use them, and
 * the defect #147 names is the id-shaped token a player cannot parse, not the English word.
 * The engineer metric vocabulary (`AWT`, `WT95`, `TTD`) is checked separately because it is
 * neither camelCase nor dotted and it is the exact vocabulary the `serves` split exists to
 * keep off Everyday surfaces.
 */
function engineTokensIn(text: string): readonly string[] {
  const found: string[] = [];
  const camel = text.match(/\b[a-z]+[A-Z][A-Za-z]*\b/g);
  if (camel !== null) found.push(...camel);
  const dotted = text.match(
    /\b(?:weights|normalization|constraints|dispatch|eligibility|answer|idle|selection)\.[A-Za-z]+/g,
  );
  if (dotted !== null) found.push(...dotted);
  const metrics = text.match(/\b(?:AWT|WT95|TTD)\b/g);
  if (metrics !== null) found.push(...metrics);
  return found;
}

describe('cost-term player words (engine contract §6.3)', () => {
  it('every term carries all four fields, non-empty', () => {
    for (const term of COST_TERMS) {
      for (const [field, text] of Object.entries(term.player)) {
        expect(text.trim(), `${term.id} player.${field}`).not.toBe('');
      }
    }
  });

  it('no player string contains an engine identifier or an engineer metric name', () => {
    for (const term of COST_TERMS) {
      for (const text of playerStringsOf({ effect: term.player.serves, ...term.player })) {
        expect(engineTokensIn(text), `${term.id}: "${text}"`).toEqual([]);
      }
    }
  });

  it('the player serves clause is not the engineer serves clause wearing a new field', () => {
    // Two readers, two fields. The library's `serves` says `AWT`; the player's says `average
    // wait`. A term whose player.serves merely repeats measures has collapsed the two readers.
    for (const term of COST_TERMS) {
      expect(term.player.serves, term.id).not.toBe(term.measures);
    }
  });

  it('player names are distinct across the thirteen terms', () => {
    const names = COST_TERMS.map((term) => term.player.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the Casual-reachable schema rows (guide §16 rule 11, issue #147)', () => {
  it('every reachable row exists and carries player words', () => {
    for (const id of CASUAL_REACHABLE) {
      const row = dispatchParameter(id);
      expect(row, `${id} is not a declared parameter`).toBeDefined();
      expect(
        row?.player,
        `${id} is reachable from an Everyday surface and has no player words — add them beside the row, never in a screen`,
      ).toBeDefined();
    }
  });

  it('exactly the reachable rows carry player words — nothing silently joined the surface', () => {
    const withWords = DISPATCH_PARAMETERS.filter((row) => row.player !== undefined).map(
      (row) => row.id,
    );
    expect([...withWords].sort()).toEqual([...CASUAL_REACHABLE].sort());
  });

  it('a continuous reachable row names both of its ends', () => {
    // A slider is drawn with its two ends in words (§11.4); a toggle or a choice has none to
    // name. `weights.*` ends come from the term's own atZero/atFull.
    for (const id of CASUAL_REACHABLE) {
      const row = dispatchParameter(id);
      if (row?.type !== 'continuous') continue;
      expect(row.player?.atZero, `${id} atZero`).toBeDefined();
      expect(row.player?.atFull, `${id} atFull`).toBeDefined();
    }
  });

  it('no player string on any row contains an engine identifier', () => {
    for (const row of DISPATCH_PARAMETERS) {
      if (row.player === undefined) continue;
      for (const text of playerStringsOf(row.player)) {
        expect(engineTokensIn(text), `${row.id}: "${text}"`).toEqual([]);
      }
    }
  });

  it('a weight row’s words are the term’s own, in both directions', () => {
    for (const term of COST_TERMS) {
      const row = dispatchParameter(`weights.${term.id}`);
      expect(row?.player).toEqual({
        name: term.player.name,
        effect: `serves ${term.player.serves}`,
        atZero: term.player.atZero,
        atFull: term.player.atFull,
      });
    }
  });

  it('player words never replace the optimizer description', () => {
    for (const row of DISPATCH_PARAMETERS) {
      if (row.player === undefined) continue;
      expect(row.description.length, row.id).toBeGreaterThan(20);
      expect(row.player.name, row.id).not.toBe(row.description);
    }
  });
});

describe('hard-constraint player words (issue #147 verbatim)', () => {
  it('every declared constraint has a name and a one-clause effect', () => {
    for (const id of HARD_CONSTRAINT_IDS) {
      const words = HARD_CONSTRAINT_WORDS[id];
      expect(words.name.trim()).not.toBe('');
      expect(words.effect.trim()).not.toBe('');
      for (const text of playerStringsOf(words)) {
        expect(engineTokensIn(text), `${id}: "${text}"`).toEqual([]);
      }
    }
  });

  it('the schema row and the constraint speak with one voice', () => {
    // Identity, not equality: two copies of the same words is the drift #147 is about.
    expect(dispatchParameter('constraints.noDirectionReversal')?.player).toBe(
      HARD_CONSTRAINT_WORDS.noDirectionReversal,
    );
  });
});
