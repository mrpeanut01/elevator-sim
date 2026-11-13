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
  parseBuilding,
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
import { withGoodsCar } from '../fixtures.test-helper.js';
import { DISPATCHER_FAMILIES } from '../authoring/dispatcherFamilies.js';
import { applyPlainLever } from '../mode/plainLevers.js';
import {
  behaviourBlockOf,
  constraintCardsOf,
  mathsDisclosureOf,
  nameplateOf,
  prioritiesOf,
  rulesBlockOf,
  saveBlockOf,
  shelfOf,
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
/** A shipped tower, as authored — no car of it declares a duty, like every shipped building but St Jude (§ D549, § D1290). */
const MIDTOWN = parseBuilding(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../../data/buildings/midtown-office.json', import.meta.url)),
      'utf8',
    ),
  ),
);

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
    const row = termDisclosureOf(FILE.terms, spec, MIDTOWN).rows.find((entry) => entry.termId === 'loadFactor');

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
    const view = termDisclosureOf(FILE.terms, SPEC, MIDTOWN);
    expect(view.summary).toBe(
      `the ${String(FILE.terms.length)} cost terms — ${String(view.weighted)} weighted`,
    );
    expect(view.rows).toHaveLength(FILE.terms.length);
    // `collective` weights one term, so the count is a measurement rather than a coincidence.
    expect(view.weighted).toBe(1);

    const { spec } = applyPlainLever(SPEC, LEVERS, 'patience', 50);
    expect(termDisclosureOf(FILE.terms, spec, MIDTOWN).weighted).toBe(2);
  });

  it('reads every sub-line from core’s own player words, never an engine id', () => {
    const rows = termDisclosureOf(FILE.terms, SPEC, MIDTOWN).rows;
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
    const row = termDisclosureOf(FILE.terms, weighted, MIDTOWN).rows.find(
      (entry) => entry.termId === 'rideTime',
    );
    expect(row?.value).toBe(60);
    expect(row?.inertWhy).toMatch(/inert until the call carries a destination/);
  });

  it('draws the duty refusal beside its slider where no car declares a duty, and not where one does — § D549', () => {
    const weighted: DispatcherSpec = { ...SPEC, weights: { ...SPEC.weights, dutyMismatch: 40 } };
    const rowOn = (building: typeof MIDTOWN) =>
      termDisclosureOf(FILE.terms, weighted, building).rows.find((entry) => entry.termId === 'dutyMismatch');
    expect(rowOn(MIDTOWN)?.value).toBe(40);
    expect(rowOn(MIDTOWN)?.inertWhy).toMatch(/no car in this building declares a duty/);
    expect(rowOn(withGoodsCar(MIDTOWN))?.value).toBe(40);
    expect(rowOn(withGoodsCar(MIDTOWN))?.inertWhy).toBeUndefined();
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

describe('the shelf is data, and it is complete', () => {
  const SHELF = shelfOf(FILE, DISPATCHER_FAMILIES, [], 'collective');
  const cards = SHELF.families.flatMap((family) => family.cards);

  it('draws every shipped dispatcher exactly once — §D299 §2', () => {
    expect(cards.map((card) => card.profileId).sort()).toEqual(
      FILE.profiles.map((profile) => profile.id).sort(),
    );
  });

  it('needs no trailing shelf: the shipped shelves hold every shipped profile', () => {
    expect(SHELF.families.map((family) => family.id)).toEqual(DISPATCHER_FAMILIES.map((family) => family.id));
  });

  it('draws nothing for a shelved id the library lost, and lands an unshelved profile on a trailing shelf', () => {
    const first = DISPATCHER_FAMILIES[0];
    if (first === undefined) throw new Error('data/ ships no shelf');
    const shelf = shelfOf(FILE, [{ ...first, profileIds: [...first.profileIds, 'no-such-design'] }], [], '');
    expect(shelf.families[0]?.cards.map((card) => card.profileId)).toEqual(first.profileIds);
    expect(shelf.families.at(-1)?.id).toBe('unfiled');
    expect(shelf.families.flatMap((family) => family.cards)).toHaveLength(FILE.profiles.length);
  });

  it('carries the library’s own words, and no engine id', () => {
    for (const card of cards) {
      const profile = profileOf(card.profileId);
      expect(card.name).toBe(profile.name);
      expect(card.blurb).toBe(profile.blurb);
      // §16 rule 11: a bar is named by `core`'s own player words, never by a table held here.
      const playerNames = Object.keys(profile.weights).map((termId) => COST_TERMS_BY_ID.get(termId)?.player.name);
      for (const bar of card.priorities) expect(playerNames).toContain(bar.name);
    }
  });

  it('marks only the open design, and tags the reference designs', () => {
    expect(cards.filter((card) => card.open).map((card) => card.profileId)).toEqual(['collective']);
    expect(cards.filter((card) => card.tag !== undefined).map((card) => card.profileId).sort()).toEqual(
      FILE.profiles.filter((profile) => profile.role === 'baseline').map((profile) => profile.id).sort(),
    );
  });

  it('drops no play style: each is an alias of its design or a variation of it', () => {
    const drawn = cards.flatMap((card) => [
      ...card.aliases,
      ...card.variations.map((variation) => variation.name),
    ]);
    expect(drawn.sort()).toEqual((FILE.playStyles ?? []).map((style) => style.name).sort());
    /*
     * `steady-hand` and `lobby-anchor` are both `collective`; they differ only in the lobby lever.
     * The first is the design under another name; the second is the design with a lever pulled,
     * and drawing it as an alias would hide the one thing it changes.
     */
    const collective = cards.find((card) => card.profileId === 'collective');
    expect(collective?.aliases).toEqual(['Steady hand']);
    expect(collective?.variations.map((variation) => variation.styleId)).toEqual(['lobby-anchor']);
  });

  it('draws one unnamed shelf, not a blank, for a library with no families', () => {
    const shelf = shelfOf(FILE, [], [], '');
    expect(shelf.families).toHaveLength(1);
    expect(shelf.families[0]?.cards).toHaveLength(FILE.profiles.length);
  });

  it('shows the player’s own with a lineage only when one is known', () => {
    const mine = { ...COLLECTIVE, id: 'yours-1', name: 'Mine' };
    const shelf = shelfOf(
      FILE,
      DISPATCHER_FAMILIES,
      [
        { id: 'yours-1', profile: mine, basedOn: 'collective' },
        { id: 'yours-2', profile: { ...mine, id: 'yours-2', name: 'Older' } },
        { id: 'yours-3', profile: { ...mine, id: 'yours-3', name: 'Orphan' }, basedOn: 'no-such-design' },
      ],
      'yours-2',
    );
    expect(shelf.yoursEmpty).toBeUndefined();
    expect(shelf.yours.map((card) => card.basedOn)).toEqual([COLLECTIVE.name, undefined, undefined]);
    expect(shelf.yours.map((card) => card.open)).toEqual([false, true, false]);
    expect(shelfOf(FILE, DISPATCHER_FAMILIES, [], '').yoursEmpty).toMatch(/Nothing saved yet/);
  });

  it('scales priority bars within one design, largest first', () => {
    const bars = prioritiesOf(profileOf('energy-aware'));
    expect(bars[0]?.share).toBe(1);
    expect(bars.map((bar) => bar.share)).toEqual([...bars.map((bar) => bar.share)].sort((a, b) => b - a));
  });

  /**
   * The guarantee `schema.ts` deliberately does not make, made here instead.
   *
   * A style naming a profile the file does not declare is a card that cannot be pressed, and it
   * would be a real defect in `data/`. It is checked here rather than in the schema for the
   * reason that `superRefine`'s comment gives in full: rebuilding the dispatcher document around
   * a **subset** of its profiles is idiomatic in this tree (a saved dispatcher, a worked example
   * from `docs/06`), and a cross-file refinement refused every one of those with a message about
   * the shipped library. `patternSwitching.weightSetsByPattern` is the same relationship and is
   * unchecked in the schema for the same reason.
   */
  it('resolves every shipped style to a shipped profile', () => {
    for (const style of FILE.playStyles ?? []) {
      expect(
        styleSelectionOf(FILE, style.id),
        `play style "${style.id}" starts from "${style.profileId}", which this file does not declare`,
      ).toBeDefined();
    }
  });

  it('resolves a card to a shipped profile and its two group settings', () => {
    const picked = styleSelectionOf(FILE, 'lobby-anchor');
    expect(picked?.profile.id).toBe('collective');
    expect(picked?.parking).toBe(true);
    expect(picked?.zone).toBe(false);
    expect(styleSelectionOf(FILE, 'no-such-style')).toBeUndefined();
  });

});

describe('the save block — § 11.1', () => {
  const open = { savedName: undefined, basedOn: 'Fairness first', unsaved: false } as const;

  it('never offers to write an industry design: its save files a copy', () => {
    for (const unsaved of [false, true]) {
      const block = saveBlockOf({ ...open, kind: 'industry', unsaved });
      expect(block.save.label).toBe('Save as my own');
      expect(block.save.replaces).toBeUndefined();
      expect(block.copy).toBeUndefined();
      expect(block.revert.enabled).toBe(unsaved);
    }
  });

  it('asks before replacing one of the player’s own, and offers the copy beside it', () => {
    const block = saveBlockOf({ kind: 'yours', savedName: 'Patience', basedOn: undefined, unsaved: true });
    expect(block.save.enabled).toBe(true);
    expect(block.save.replaces).toContain('Patience');
    expect(block.copy).toBe('Save as a copy');
    expect(saveBlockOf({ kind: 'yours', savedName: 'Patience', basedOn: undefined, unsaved: false }).save.enabled).toBe(false);
  });

  it('lets a dispatcher whose source is gone be saved, and never discarded onto nothing', () => {
    const block = saveBlockOf({ kind: 'gone', savedName: undefined, basedOn: undefined, unsaved: true });
    expect(block.save.enabled).toBe(true);
    expect(block.revert.enabled).toBe(false);
  });
});

describe('constraints — nothing unnamed reaches the screen', () => {
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
});

describe('the switching block says when it is inert, rather than hiding', () => {
  const CONTEXT = selectorContextFrom(FILE, 900);

  it('draws the whole block under `off`, and states why nothing in it reaches the run', () => {
    const spec = { ...defaultSelectorSpec(CONTEXT), policy: 'off' as const };
    const view = switchingBlockOf(spec, CONTEXT);
    expect(view.inertNote).toMatch(/Nothing below this line reaches the run/);
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
    expect(plate.provedOnTheBench).toMatch(/no record is kept/);
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
