/**
 * The workshop's model, held to the four things it can most easily stop being.
 *
 * 1. **The drawers agree.** A lever and a term slider are two views of one number, and the printed
 *    cost line is a third. The pair of cases at the top move a lever and require the other two to
 *    move with it — which is the standing requirement (*move the control and require the run to
 *    change*) asked at the level where it can be asked without a document: the line is composed
 *    from the same `weights` map `profileFromSpec` writes into the run.
 * 2. **No word is authored twice.** Every term name, serves clause, slider end, constraint name,
 *    rule template and value label must come from `core`. The cases below check the ones a
 *    renderer would be most tempted to retype.
 * 3. **The counts are counted.** `the 13 cost terms — 4 weighted` is derived from the library and
 *    the vector, never written; a header that said `13` would be a claim about a library that has
 *    already changed size once.
 * 4. **The two §11.5 actions `core` omits are unbuildable.** The offered list is `RULE_ACTIONS`,
 *    so they cannot be selected — that is the vocabulary's refusal, made once, in the model.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseDispatcherProfiles,
  HARD_CONSTRAINT_WORDS,
  RULE_ACTIONS,
  COST_TERMS_BY_ID,
  type DispatcherProfile,
} from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LEVERS,
  specFromProfile,
  type DispatcherSpec,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';
import { defaultRuleRow } from '../authoring/ruleSpec.js';
import { selectorContextFrom, defaultSelectorSpec } from '../authoring/selectorSpec.js';
import { applyPlainLever } from '../mode/plainLevers.js';
import {
  behaviourBlockOf,
  carriedBlocksOf,
  constraintCardsOf,
  libraryCardsOf,
  mathsDisclosureOf,
  nameplateOf,
  playStyleAbsenceOf,
  playStyleCardsOf,
  rulesBlockOf,
  styleSelectionOf,
  switchingBlockOf,
  termDisclosureOf,
  workshopLeversOf,
} from './workshopModel.js';

const FILE = parseDispatcherProfiles(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../data/dispatcher-profiles.json', import.meta.url)),
      'utf8',
    ),
  ),
);

const profileOf = (id: string): DispatcherProfile => {
  const found = FILE.profiles.find((profile) => profile.id === id);
  if (found === undefined) throw new Error(`no shipped profile ${id}`);
  return found;
};

const COLLECTIVE = profileOf('collective');
const SPEC: DispatcherSpec = specFromProfile(COLLECTIVE, COLLECTIVE.name);
const LEVERS: GroupLevers = DEFAULT_LEVERS;

describe('the drawers are two views of one vector', () => {
  it('moves the printed cost line when the patience lever moves', () => {
    const before = mathsDisclosureOf(SPEC, FILE.terms).line;
    const { spec } = applyPlainLever(SPEC, LEVERS, 'patience', 64);
    const after = mathsDisclosureOf(spec, FILE.terms).line;

    expect(after).not.toBe(before);
    /*
     * Not merely different — different in the one way the lever claims. `starvation`'s weight is
     * what the patience lever owns, and 64 is what was asked for, so the line must carry `0.64`
     * against that term's short name and nothing else may have moved.
     */
    expect(after).toContain('0.64·starvation');
    expect(spec.weights['waitTime']).toBe(SPEC.weights['waitTime']);
  });

  it('shows the same number on the term slider that the lever holds', () => {
    const { spec } = applyPlainLever(SPEC, LEVERS, 'room', 37);
    const lever = workshopLeversOf(spec, LEVERS).find((view) => view.id === 'room');
    const row = termDisclosureOf(FILE.terms, spec).rows.find((entry) => entry.termId === 'loadFactor');

    expect(lever?.value).toBe(37);
    expect(row?.value).toBe(37);
    expect(row?.weighted).toBe(true);
  });

  it('carries a toggle lever into the flag row it owns', () => {
    const { spec } = applyPlainLever(SPEC, LEVERS, 'spread', true);
    expect(behaviourBlockOf(spec, LEVERS).flags.find((flag) => flag.key === 'zone')?.on).toBe(true);
  });
});

describe('the thirteen, behind a door that counts its own contents', () => {
  it('derives both numbers in the summary from the library and the vector', () => {
    const view = termDisclosureOf(FILE.terms, SPEC);
    expect(view.summary).toBe(
      `the ${String(FILE.terms.length)} cost terms — ${String(view.weighted)} weighted`,
    );
    expect(view.rows).toHaveLength(FILE.terms.length);
    // `collective` weights one term, so the count is a measurement rather than a coincidence.
    expect(view.weighted).toBe(1);

    const { spec } = applyPlainLever(SPEC, LEVERS, 'patience', 50);
    expect(termDisclosureOf(FILE.terms, spec).weighted).toBe(2);
  });

  it('reads every sub-line from core’s own player words, never an engine id', () => {
    const rows = termDisclosureOf(FILE.terms, SPEC).rows;
    for (const row of rows) {
      const term = COST_TERMS_BY_ID.get(row.termId);
      if (term === undefined) continue;
      expect(row.serves).toBe(
        `serves ${term.player.serves} · ${term.player.atZero} → ${term.player.atFull}`,
      );
      /*
       * Not `!== termId`: five of the thirteen ids are single lower-case words and *are* the
       * phrase (`starvation`, `crowding`), so that assertion would fail on a row that is already
       * correct. What may never appear is a **camel-cased** id — `waitTime` on a Casual surface is
       * exactly what §16 rule 11 forbids — and no player-facing phrase in this register has a
       * capital in it.
       */
      expect(row.label).not.toMatch(/[A-Z]/);
    }
  });

  it('draws the inert-term refusal beside the control rather than dropping the weight', () => {
    const weighted: DispatcherSpec = {
      ...SPEC,
      weights: { ...SPEC.weights, rideTime: 60 },
      flags: { ...SPEC.flags, pool: false },
    };
    const row = termDisclosureOf(FILE.terms, weighted).rows.find(
      (entry) => entry.termId === 'rideTime',
    );
    expect(row?.value).toBe(60);
    expect(row?.inertWhy).toMatch(/inert until the call carries a destination/);
  });
});

describe('§11.3 — the maths, in rule 12’s order', () => {
  it('names every symbol the line uses, from core’s words', () => {
    const { spec } = applyPlainLever(SPEC, LEVERS, 'patience', 30);
    const view = mathsDisclosureOf(spec, FILE.terms);
    expect(view.symbols.map((symbol) => symbol.symbol)).toEqual(['wait', 'starvation']);
    for (const symbol of view.symbols) {
      expect(view.line).toContain(symbol.symbol);
      const term = COST_TERMS_BY_ID.get(
        FILE.terms.find((entry) => entry.id.toLowerCase().startsWith(symbol.symbol))?.id ?? '',
      );
      if (term !== undefined) expect(symbol.serves).toBe(term.player.serves);
    }
  });

  it('states the sign rule this engine actually has — every term is a cost', () => {
    const view = mathsDisclosureOf(SPEC, FILE.terms);
    expect(view.signs).toMatch(/added together/);
    expect(view.signs).toMatch(/nothing on it can pull a score down/);
    /* The plain sentence comes first and refuses the *measure of the day* reading (§11.3). */
    expect(view.plainSentence).toMatch(/lowest score wins/);
    expect(view.plainSentence).toMatch(/not a measure of how the day went/);
  });

  it('says so plainly when every term is zero rather than printing an empty sum', () => {
    const blank: DispatcherSpec = { ...SPEC, weights: {} };
    expect(mathsDisclosureOf(blank, FILE.terms).line).toBe('cost = nothing — every term is zero');
    expect(mathsDisclosureOf(blank, FILE.terms).symbols).toHaveLength(0);
  });
});

describe('the play styles are data, and the shelf is complete', () => {
  it('draws a card per declared style, with the file’s own words', () => {
    const cards = playStyleCardsOf(FILE, 'collective', LEVERS, SPEC);
    expect(cards).toHaveLength(FILE.playStyles?.length ?? 0);
    expect(cards.length).toBeGreaterThan(0);
    for (const [index, card] of cards.entries()) {
      const style = FILE.playStyles?.[index];
      if (style === undefined) throw new Error('the file lost a style between two reads');
      expect(card.name).toBe(style.name);
      expect(card.trade).toBe(style.trade);
      // §16 rule 11: no engine identifier reaches a player-facing field.
      expect(card.name).not.toContain(style.profileId);
      expect(card.trade).not.toContain(style.profileId);
      expect(card.id).toBe(style.id);
    }
    expect(playStyleAbsenceOf(FILE)).toBeUndefined();
  });

  it('lights exactly one of the two styles that share a vector', () => {
    /*
     * `steady-hand` and `lobby-anchor` are both `collective`; they differ only in the lobby lever.
     * A card that lit on the profile alone would light both, which is a screen telling a player
     * they are somewhere they are not.
     */
    const parked = { ...LEVERS, parking: true };
    const lit = (levers: GroupLevers): readonly string[] =>
      playStyleCardsOf(FILE, 'collective', levers, SPEC)
        .filter((card) => card.selected)
        .map((card) => card.id);

    expect(lit(LEVERS)).toEqual(['steady-hand']);
    expect(lit(parked)).toEqual(['lobby-anchor']);
  });

  it('resolves a card to a shipped profile and its two group settings', () => {
    const picked = styleSelectionOf(FILE, 'lobby-anchor');
    expect(picked?.profile.id).toBe('collective');
    expect(picked?.parking).toBe(true);
    expect(picked?.zone).toBe(false);
    expect(styleSelectionOf(FILE, 'no-such-style')).toBeUndefined();
  });

  it('offers every shipped dispatcher no style already names — §D299 §2', () => {
    const named = new Set((FILE.playStyles ?? []).map((style) => style.profileId));
    const library = libraryCardsOf(FILE, 'collective');
    expect(library.map((card) => card.profileId)).toEqual(
      FILE.profiles.filter((profile) => !named.has(profile.id)).map((profile) => profile.id),
    );
    // Every profile is reachable: a style card, or a library card. Nothing is withheld.
    expect(new Set([...named, ...library.map((card) => card.profileId)]).size).toBe(
      FILE.profiles.length,
    );
  });

  it('draws a stated absence, not a blank, for a library with no styles', () => {
    const { playStyles: _styles, ...bare } = FILE;
    expect(playStyleCardsOf(bare, 'collective', LEVERS, SPEC)).toHaveLength(0);
    expect(playStyleAbsenceOf(bare)).toMatch(/declares no named styles/);
  });
});

describe('constraints and carried blocks — nothing unnamed reaches the screen', () => {
  it('reads a named constraint from core’s own words', () => {
    const cards = constraintCardsOf(profileOf('collective'));
    expect(cards.map((card) => card.name)).toEqual([
      HARD_CONSTRAINT_WORDS.noDirectionReversal.name,
    ]);
    expect(cards[0]?.unnamed).toBe(false);
  });

  it('falls back honestly for a constraint this build cannot name, and keeps the id', () => {
    const invented = { ...COLLECTIVE, hardConstraints: ['someFutureFilter'] } as DispatcherProfile;
    const card = constraintCardsOf(invented)[0];
    expect(card?.unnamed).toBe(true);
    expect(card?.name).toContain('a filter no weight can buy past');
    expect(card?.name).toContain('someFutureFilter');
  });

  it('says what a profile carries that the workshop cannot draw, in words', () => {
    const carried = carriedBlocksOf(profileOf('auction-multi-round'));
    expect(carried.length).toBeGreaterThan(0);
    for (const entry of carried) {
      expect(entry.words.length).toBeGreaterThan(0);
      // The union member is an engine word; only `words` may be drawn.
      expect(entry.words).not.toBe(entry.block);
    }
    expect(carriedBlocksOf(undefined)).toHaveLength(0);
  });
});

describe('the switching block says when it is inert, rather than hiding', () => {
  const CONTEXT = selectorContextFrom(FILE, 900);

  it('draws the whole block under `off`, and states why nothing in it reaches the run', () => {
    const spec = { ...defaultSelectorSpec(CONTEXT), policy: 'off' as const };
    const view = switchingBlockOf(spec, CONTEXT);
    expect(view.inertNote).toMatch(/never builds the detector/);
    expect(view.controls.length).toBeGreaterThan(0);
    expect(view.controls.every((control) => control.inert)).toBe(true);
    expect(view.patterns.length).toBeGreaterThan(0);
  });

  it('drops the inert note and reads core’s own description for each control', () => {
    const spec = { ...defaultSelectorSpec(CONTEXT), policy: 'fuzzy' as const };
    const view = switchingBlockOf(spec, CONTEXT);
    expect(view.inertNote).toBeUndefined();
    expect(view.controls.every((control) => !control.inert)).toBe(true);
    for (const control of view.controls) {
      expect(control.help.length).toBeGreaterThan(0);
      expect(control.label).not.toBe(control.field);
    }
    expect(view.modes.map((mode) => mode.label)).not.toContain('fuzzy');
    expect(view.policyLine.length).toBeGreaterThan(0);
  });
});

describe('§11.5 — the rule vocabulary is the model’s', () => {
  const CONTEXT = { hasClock: true };

  it('offers exactly the actions core declares, so the two §11.5 omits are unbuildable', () => {
    const block = rulesBlockOf([], 'Steady hand', CONTEXT);
    expect(block.thenOptions.map((option) => option.id)).toEqual([...RULE_ACTIONS]);
    /*
     * The refusal, stated as the property rather than as a sentence: §11.5 lists *skip everything
     * above v* and *treat up-calls as urgent*, and neither can be picked here because neither is
     * in `RULE_ACTIONS`. That is one refusal, in `core`, not a second one on this screen.
     */
    expect(block.thenOptions.map((option) => option.id)).not.toContain('skip-above');
    expect(block.thenOptions.map((option) => option.id)).not.toContain('up-calls-urgent');
    expect(block.thenOptions).toHaveLength(8);
  });

  it('reads back a row in words, names the lever it moves, and always prints the fallback', () => {
    const block = rulesBlockOf([defaultRuleRow()], 'Steady hand', CONTEXT);
    expect(block.rows[0]?.readback).toMatch(/^when .+, .+\.$/);
    expect(block.rows[0]?.lever).toMatch(/^moves /);
    expect(block.fallback).toBe('If no rule fits, Steady hand decides.');
    expect(block.exclusivity).toMatch(/first match wins/);
    expect(block.empty).toBeUndefined();
  });

  it('puts a clockless time rule’s refusal beside the row it is about', () => {
    const rows = [{ ...defaultRuleRow(), when: 'time-before' as const, whenValue: 32_400 }];
    const block = rulesBlockOf(rows, 'Steady hand', { hasClock: false });
    expect(block.rows[0]?.issues.some((issue) => /no clock/.test(issue.message))).toBe(true);
  });

  it('says so when there are no rows at all', () => {
    expect(rulesBlockOf([], 'Steady hand', CONTEXT).empty).toMatch(/No rules/);
  });
});

describe('§11.1 — the nameplate counts against where the style put it', () => {
  it('reads unchanged before anything moves', () => {
    const plate = nameplateOf({
      startedFrom: 'Steady hand',
      spec: SPEC,
      levers: LEVERS,
      baseSpec: SPEC,
      baseLevers: LEVERS,
      ruleRows: [],
    });
    expect(plate.unchanged).toMatch(/Steady hand, unchanged/);
    expect(plate.leversMoved).toBe('levers moved 0 of 4');
    expect(plate.rules).toBe('rules 0');
    expect(plate.provedOnTheBench).toMatch(/keeps no bench record/);
  });

  it('counts one lever, and never claims the bench has seen the change', () => {
    const { spec } = applyPlainLever(SPEC, LEVERS, 'patience', 70);
    const plate = nameplateOf({
      startedFrom: 'Steady hand',
      spec,
      levers: LEVERS,
      baseSpec: SPEC,
      baseLevers: LEVERS,
      ruleRows: [],
    });
    expect(plate.unchanged).toBeUndefined();
    expect(plate.leversMoved).toBe('levers moved 1 of 4');
    expect(plate.provedOnTheBench).toBe('proved on the bench — not since your last change');
  });

  it('counts a rule as a change even with every lever where it was', () => {
    const plate = nameplateOf({
      startedFrom: 'Steady hand',
      spec: SPEC,
      levers: LEVERS,
      baseSpec: SPEC,
      baseLevers: LEVERS,
      ruleRows: [defaultRuleRow()],
    });
    expect(plate.unchanged).toBeUndefined();
    expect(plate.rules).toBe('rules 1');
  });
});
