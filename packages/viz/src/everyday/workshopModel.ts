/**
 * **The dispatcher workshop's pure model** — GAMEPLAY_AND_NAVIGATION.md §11, the half that has no
 * document. `everyday/workshopScreen.ts` is the DOM half and draws exactly what is decided here.
 *
 * ## What the workshop is for, and the rule that shapes every export below
 *
 * §D301's thesis: *the mass-market draw is the non-dumbification of the settings and parameters*.
 * §D299 §2 states the test this surface has to pass — **easier to use, never saying less** — so
 * nothing here is withheld on the grounds that a Casual player *would not want it*. What Casual
 * gets is **disclosure order**, not a smaller product: a shelf of every design, four plain levers, then
 * the thirteen weights, the behaviour flags, the switching block and the rules editor, each behind
 * a door that announces what is behind it (§16 rule 13). A door is not a wall — every control the
 * Engineer editor can reach is reachable from this screen.
 *
 * ## Where every word comes from, and the three places it is *not* here
 *
 * §16 rule 11, and `core`'s own standing rule (`ENGINE_CONTRACT.md` §6.3): *the name, the `serves`
 * clause and both end labels are properties of the MODEL* — a table in a renderer mapping engine
 * ids to prose is forbidden, because it goes stale the day a parameter is added. So:
 *
 * - the **thirteen terms**' names, serves clauses and both ends are `core`'s `PlayerTermWords`,
 *   read through `dev/dispatcherEditor.ts#termRowsOf` in its `basic` register — the same rows the
 *   Engineer editor draws, so the two screens cannot describe one weight in two vocabularies;
 * - the **hard constraints**' names and effects are `core`'s `HARD_CONSTRAINT_WORDS`, with the
 *   honest fallback for a constraint this build cannot name living here, where reaching it is a
 *   content bug the surface must survive ({@link constraintCardsOf});
 * - the **rule vocabulary** — every condition, action, `{v}` template, value list and `moves`
 *   badge — is `core`'s `RULE_CONDITION_WORDS`/`RULE_ACTION_WORDS` through `authoring/ruleSpec.ts`.
 *   §11.5 lists ten actions and `RULE_ACTIONS` declares eight; **the two it omits are unbuildable
 *   here because the offered list is derived from that array**, which is the vocabulary's refusal
 *   made once, in the model, rather than a second refusal drawn on a screen;
 * - the **shelves** are `data/dispatcher-families.json` (`authoring/dispatcherFamilies.ts`), and
 *   the play styles drawn as aliases and variations are `data/dispatcher-profiles.json`'s
 *   `playStyles` block, for the reason invariant 7 gives: which design sits with which, and what a design is
 *   also called, are facts about the library, and a renderer holding them against profile ids is
 *   that forbidden table with a friendlier key.
 *
 * The one place words *are* authored here is {@link WORKSHOP_COPY} — headings, disclosure summaries
 * and the sentences the prototype writes about the screen itself. Those are the handoff's own copy,
 * which it is canonical for.
 *
 * ## Two deviations from the handoff, both because the simulator wins about numbers
 *
 * 1. **§11.3's sign sentence is replaced rather than transcribed.** The handoff says *"distance and
 *    a full car push a score up; a long wait pushes it down"*, which is true of its toy simulator
 *    and false of this one: `CostTermDefinition.evaluate` must return a **non-negative** value —
 *    *"a cost, never a bonus"* — and the weighted sum is added, so no term on the printed line can
 *    pull a score down. {@link mathsDisclosureOf} says what is true instead, which is the more
 *    useful sentence anyway: every term is a kind of badness, and a weight decides which kind
 *    outranks which.
 * 2. **The style cards' trade sentences are re-authored in `data/`,** because two of
 *    `ENGINE_CONTRACT.md` §6.2's are claims of quality (*"the biggest single win on a busy
 *    morning"*) and §11.1's own rule for this copy is *"one plain sentence about the trade, not a
 *    claim of quality"* — which is R2 one register up. The argument is on `PlayStyle`.
 *
 * **Both deviations and the `playStyles` block are § D416**; the arguments are here and on
 * `core/src/config/types.ts#PlayStyle`, and the entry adds nothing they do not already say. The
 * two § 11.5 actions this model cannot offer are § D415's, made once in the vocabulary.
 */

import {
  COST_TERMS_BY_ID,
  HARD_CONSTRAINT_WORDS,
  RULE_ACTIONS,
  RULE_ACTION_WORDS,
  RULE_CONDITIONS,
  RULE_CONDITION_WORDS,
  type CostTerm,
  type DispatcherProfile,
  type DispatcherProfiles,
  type HardConstraintId,
  type PlayStyle,
  type RuleActionId,
  type RuleConditionId,
  type RuleValueOption,
} from '@elevator-sim/core/browser';

import type { DispatcherFamily } from '../authoring/dispatcherFamilies.js';
import {
  costFunctionLine,
  inertTerms,
  specFromProfile,
  type DispatcherSpec,
  type DutyDeclarations,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';
import {
  fallbackLineOf,
  leverLineOf,
  canAddCondition,
  readbackOf,
  ruleIssues,
  RULES_EXCLUSIVITY_NOTE,
  type RuleContext,
  type RuleIssue,
  type RuleRow,
} from '../authoring/ruleSpec.js';
import {
  patternCards,
  policyLine,
  rangeFor,
  helpFor,
  SELECTOR_SCALAR_FIELDS,
  POLICY_VALUES,
  type PatternCard,
  type SelectorContext,
  type SelectorScalarField,
  type SelectorSpec,
} from '../authoring/selectorSpec.js';
import { commitmentOf } from '../scope/commitment.js';
import {
  flagRowsOf,
  leverRowsOf,
  shortTermNameOf,
  termRowsOf,
  type FlagRow,
  type LeverRow,
  type TermRow,
} from '../dev/dispatcherEditor.js';
import { plainLeversOf, type PlainLeverView } from '../mode/plainLevers.js';

/* -------------------------------------------------------------------------- *
 * The screen's own chrome
 * -------------------------------------------------------------------------- */

/**
 * Every sentence the workshop authors about itself, one frozen object so the honesty sweep renders
 * all of them on every case.
 *
 * Sources: `optimisingHeading`, `behavesHeading`, `groupHeading`, `switchingHeading`,
 * `rulesHeading`, `showEveryTerm`, `showTheMaths` and `zoningBoundary` are the prototype's own cells
 * (`docs/design/elevator-sim-casual.dc.html`, and §11.4's header sentence verbatim). The shelf and
 * the save block are this build's: the prototype's left panel offered six styles and a saved list,
 * and the product owner's 2026-11-11 direction replaced it with a shelf of every industry design
 * and of the player's own, each saved under its own name.
 */
export const WORKSHOP_COPY = Object.freeze({
  eyebrow: 'DISPATCHER WORKSHOP',
  title: 'Build the thing that decides',
  lede:
    'A dispatcher is one rule, asked thousands of times a day: which car goes to this call.',
  /* ---- the shelf: the workshop's front door ---- */
  shelfTitle: 'Your dispatchers, and the industry’s',
  shelfLede:
    'A dispatcher decides which car goes to each call. Start from an industry design, change ' +
    'it, and save it under your own name.',
  yoursHeading: 'YOURS',
  yoursHint: 'Saved in this browser.',
  /** Drawn where the saved cards would be. It names the route to a first save, which exists now. */
  yoursEmpty:
    'Nothing saved yet. Open an industry design below and save it under your own name.',
  industryHeading: 'INDUSTRY DESIGNS',
  /** The heading for shipped designs `data/dispatcher-families.json` does not shelve. */
  unfiledHeading: 'MORE DESIGNS',
  unfiledLine: 'Designs not filed under a family.',
  /** Drawn on a design whose `role` is `baseline` — the label `nearest-car`'s own comment owes. */
  baselineTag: 'REFERENCE',
  baselineHint:
    'A reference design: held fixed, and the others are measured against it.',
  openTag: 'OPEN NOW',
  aliasLead: 'Also called',
  openIndustry: 'Make my own',
  openYours: 'Open',
  keepWorking: 'Keep working',
  duplicate: 'Duplicate',
  remove: 'Delete',
  removeConfirm: 'Delete it',
  removeCancel: 'Keep it',
  discardOpen: 'Discard and open',
  discardCancel: 'Cancel',
  backToShelf: '← All dispatchers',
  /* ---- the nameplate's save block ---- */
  nameLabel: 'Name',
  saveAsMine: 'Save as my own',
  save: 'Save',
  saveCopy: 'Save as a copy',
  replaceConfirm: 'Replace it',
  revert: 'Discard changes',
  saveHolds:
    'A save keeps everything on this page.',
  industryNote:
    'Saving makes a copy of your own. The industry design stays as it is.',
  refusalEmpty: 'Give it a name first.',
  refusalTaken: 'That name is taken. Change it, or save a copy.',
  showEveryTerm: 'show every term',
  behavesHeading: 'HOW IT BEHAVES',
  groupHeading: 'GROUP LEVERS — APPLY TO WHOEVER IS DRIVING',
  /** §11.4's boundary sentence, verbatim. It is also why one §11.5 action does not exist. */
  zoningBoundary:
    'Zoning and service ranges belong to the building. Set them in Design a building.',
  constraintsHeading: 'FILTERS BEFORE SCORING',
  constraintsHint:
    'A car these reject is not offered the call, whatever the weights.',
  /** The honest name for a constraint this build carries and has no player-facing words for. */
  constraintFallbackName: 'a filter no weight can buy past',
  switchingHeading: 'SWITCHING WITH THE TRAFFIC',
  switchingHint:
    'Whether the dispatcher may notice the traffic has turned over and swap what it is ' +
    'optimising for. The design it swaps to for each kind of traffic is saved with it.',
  rulesHeading: 'ADVANCED: YOUR OWN RULES',
  rulesHint:
    'The first rule that matches wins. With “and…”, a rule fires only when every condition holds.',
  /** The link under the rules, and the heading of the popover that holds the two long notes. */
  rulesLink: 'How rules work',
  /**
   * Why the list of *then* clauses is shorter than the guide's.
   *
   * One sentence, not two refusals: the vocabulary is the model's, and a screen that authored its
   * own reason for each omission would be a second answer to *what can a rule do*.
   */
  rulesVocabularyNote:
    'A rule can do only what the simulator can run. No rule masks off floors: which floors a ' +
    'shaft serves is the building’s, not the dispatcher’s.',
  rulesEmpty: 'No rules. The settings above decide every call.',
  showTheMaths: 'Show the maths',
  mathsHeading: 'HOW A CAR IS CHOSEN',
} as const);

/* -------------------------------------------------------------------------- *
 * Layer 1 — the named styles, and everything else on the shelf
 * -------------------------------------------------------------------------- */

/** One of a design's leading concerns, for the bars on its card. */
export interface PriorityBar {
  /** The term's own player name from `core` — never its engine id. */
  readonly name: string;
  /** This weight over the design's largest, 0 to 1. A shape to recognise, not a figure to read. */
  readonly share: number;
}

/**
 * What a design weighs most, largest first — the bars on a shelf card.
 *
 * Names are `core`'s `PlayerTermWords` (§16 rule 11). A term this build has not implemented falls
 * back to its short name, as {@link mathsDisclosureOf} does. `share` is relative to the design's
 * own largest weight, because weights are only ever compared within one dispatcher: a bar that
 * invited comparing `0.7` on one card with `0.5` on another would be inviting a comparison the
 * cost function does not make.
 */
export function prioritiesOf(profile: DispatcherProfile, limit = 4): readonly PriorityBar[] {
  const weighted = Object.entries(profile.weights)
    .filter(([, weight]) => weight > 0)
    .sort(([, a], [, b]) => b - a);
  const largest = weighted[0]?.[1] ?? 1;
  const allIds = weighted.map(([termId]) => termId);
  return Object.freeze(
    weighted.slice(0, limit).map(([termId, weight]) =>
      Object.freeze({
        name: COST_TERMS_BY_ID.get(termId)?.player.name ?? shortTermNameOf(termId, allIds),
        share: weight / largest,
      }),
    ),
  );
}

/** A named starting point that is an industry design with a lever already pulled. */
export interface VariationCard {
  /** The play style's id — what {@link styleSelectionOf} resolves. */
  readonly styleId: string;
  readonly name: string;
  /** One plain sentence about the trade. Never a claim of quality. */
  readonly trade: string;
}

/** One industry design on the shelf. */
export interface IndustryCard {
  readonly profileId: string;
  /** The library's own name for it. Never its id. */
  readonly name: string;
  /** The authored line, when the library carries one. */
  readonly blurb: string | undefined;
  /** {@link WORKSHOP_COPY.baselineTag}, on a reference design. */
  readonly tag: string | undefined;
  readonly priorities: readonly PriorityBar[];
  /** Play-style names that are this design exactly, under another name. */
  readonly aliases: readonly string[];
  /** Play styles that are this design with a lever pulled. */
  readonly variations: readonly VariationCard[];
  /** True when the working copy was read from this design. */
  readonly open: boolean;
}

/** One named shelf of industry designs. */
export interface FamilyShelf {
  readonly id: string;
  readonly name: string;
  readonly line: string;
  readonly cards: readonly IndustryCard[];
}

/** One of the player's own. */
export interface YoursCard {
  readonly id: string;
  readonly name: string;
  /** *based on ⟨industry design⟩*, or `undefined` when the lineage is not known. */
  readonly basedOn: string | undefined;
  readonly priorities: readonly PriorityBar[];
  readonly open: boolean;
}

/** The workshop's front door: the player's own dispatchers, then every industry design. */
export interface Shelf {
  readonly yours: readonly YoursCard[];
  /** Drawn instead of the cards when nothing is saved. */
  readonly yoursEmpty: string | undefined;
  /** The industry row's hint, with the count derived from the library. */
  readonly industryHint: string;
  readonly families: readonly FamilyShelf[];
}

/** The slice of a saved dispatcher the shelf reads — `dev/state.ts#SavedDispatcher`'s shape. */
export interface ShelvedDispatcher {
  readonly id: string;
  readonly profile: DispatcherProfile;
  readonly basedOn?: string | undefined;
}

/**
 * The shelf — every shipped design exactly once, under the library's own headings, and the
 * player's own above them.
 *
 * ## Why this replaced *start from a style*
 *
 * The panel this replaces drew six nicknamed style cards, then the seven shipped designs no style
 * named under a second heading, then the saved ones — three lists answering one question, where
 * the same design could be reached under two names and pressing either replaced the working copy.
 * Here a design appears once, under the name the library gives it, on the shelf the library's
 * shelves (`data/dispatcher-families.json`, through `authoring/dispatcherFamilies.ts`) put it on. The play styles are still read and nothing in them is dropped:
 * a style that **is** a design under another name is drawn as that design's alias, and a style
 * that is a design with a lever pulled is drawn as a variation of it.
 *
 * **Complete by construction** (§D299 §2): a profile no family shelves lands on a trailing shelf
 * rather than off the page, and with no shelves declared the library is drawn as that one shelf.
 * `authoring/dispatcherFamilies.test.ts` asserts the shipped pair needs no trailing shelf.
 */
export function shelfOf(
  file: DispatcherProfiles,
  shelves: readonly DispatcherFamily[],
  saved: readonly ShelvedDispatcher[],
  openId: string,
): Shelf {
  const byId = new Map(file.profiles.map((profile) => [profile.id, profile]));
  const styles = file.playStyles ?? [];
  const cardOf = (profile: DispatcherProfile): IndustryCard => {
    const ownZone = specFromProfile(profile, profile.name).flags.zone;
    const mine = styles.filter((style) => style.profileId === profile.id);
    const isAlias = (style: PlayStyle): boolean => !style.parking && style.zone === ownZone;
    return Object.freeze({
      profileId: profile.id,
      name: profile.name,
      blurb: profile.blurb,
      tag: profile.role === 'baseline' ? WORKSHOP_COPY.baselineTag : undefined,
      priorities: prioritiesOf(profile),
      aliases: Object.freeze(mine.filter(isAlias).map((style) => style.name)),
      variations: Object.freeze(
        mine
          .filter((style) => !isAlias(style))
          .map((style) => Object.freeze({ styleId: style.id, name: style.name, trade: style.trade })),
      ),
      open: profile.id === openId,
    });
  };

  const shelved = new Set<string>();
  const families: FamilyShelf[] = [];
  for (const family of shelves) {
    const cards: IndustryCard[] = [];
    for (const profileId of family.profileIds) {
      const profile = byId.get(profileId);
      // A family naming a profile this file lost shelves nothing for it — an absence, not a stand-in.
      if (profile === undefined || shelved.has(profileId)) continue;
      shelved.add(profileId);
      cards.push(cardOf(profile));
    }
    if (cards.length > 0) {
      families.push(
        Object.freeze({ id: family.id, name: family.name, line: family.line, cards: Object.freeze(cards) }),
      );
    }
  }
  const unfiled = file.profiles.filter((profile) => !shelved.has(profile.id));
  if (unfiled.length > 0) {
    families.push(
      Object.freeze({
        id: 'unfiled',
        name: WORKSHOP_COPY.unfiledHeading,
        line: WORKSHOP_COPY.unfiledLine,
        cards: Object.freeze(unfiled.map(cardOf)),
      }),
    );
  }

  return Object.freeze({
    yours: Object.freeze(
      saved.map((entry) =>
        Object.freeze({
          id: entry.id,
          name: entry.profile.name,
          basedOn:
            entry.basedOn === undefined ? undefined : byId.get(entry.basedOn)?.name,
          priorities: prioritiesOf(entry.profile),
          open: entry.id === openId,
        }),
      ),
    ),
    yoursEmpty: saved.length === 0 ? WORKSHOP_COPY.yoursEmpty : undefined,
    industryHint:
      `${String(file.profiles.length)} designs. Open one to make your own copy. The original never changes.`,
    families: Object.freeze(families),
  });
}

/** The sentence asked before a saved dispatcher is deleted. */
export function removeQuestionOf(name: string): string {
  return `Delete “${name}”? It leaves every picker, and it cannot be brought back.`;
}

/** The sentence asked before opening another dispatcher over unsaved changes. */
export function discardQuestionOf(openName: string): string {
  return `“${openName}” has unsaved changes. Opening this one discards them.`;
}

/* -------------------------------------------------------------------------- *
 * §11.1 — saving
 * -------------------------------------------------------------------------- */

/** What the workshop has open, as `everyday/host.ts#WorkingDispatcherStatus` reports it. */
export interface OpenDispatcher {
  readonly kind: 'industry' | 'yours' | 'gone';
  readonly savedName: string | undefined;
  readonly basedOn: string | undefined;
  readonly unsaved: boolean;
}

/** The nameplate's save block: where this dispatcher stands, and the verbs that apply to it. */
export interface SaveBlock {
  /** Where it stands, in a few words. */
  readonly state: string;
  /** *based on ⟨industry design⟩*, when known. */
  readonly basedOn: string | undefined;
  /** The primary save. `replaces` is the question to ask first when it would overwrite. */
  readonly save: { readonly label: string; readonly enabled: boolean; readonly replaces: string | undefined };
  /** *Save as a copy* — offered only on one of the player's own; an industry save is already a copy. */
  readonly copy: string | undefined;
  /** *Discard changes*, enabled only while there are some. */
  readonly revert: { readonly label: string; readonly enabled: boolean };
  readonly notes: readonly string[];
}

/**
 * §11.1's save rules, decided once.
 *
 * - An **industry design** is never written. Its one save files a copy of the player's own.
 * - One of **the player's own** saves in place, and the replace is asked first, with what follows
 *   from it said plainly: the id stays, so every run, bench and picker that names it gets the new
 *   version. § 11.1's own warning names bench results and board entries; this build keeps no bench
 *   record per dispatcher, so the sentence says what is true here instead.
 * - **Save as a copy** leaves the saved one alone and files the next free version of the name.
 * - A source that no longer exists can still be saved as the player's own, never discarded onto.
 */
export function saveBlockOf(open: OpenDispatcher): SaveBlock {
  const C = WORKSHOP_COPY;
  const basedOn = open.basedOn === undefined ? undefined : `based on ${open.basedOn}`;
  if (open.kind === 'yours') {
    return Object.freeze({
      state: open.unsaved ? 'Yours — unsaved changes' : 'Yours — saved',
      basedOn,
      save: Object.freeze({
        label: C.save,
        enabled: open.unsaved,
        replaces:
          `This replaces the saved “${open.savedName ?? ''}”. Everything that uses it gets the new version.`,
      }),
      copy: C.saveCopy,
      revert: Object.freeze({ label: C.revert, enabled: open.unsaved }),
      notes: Object.freeze([C.saveHolds]),
    });
  }
  if (open.kind === 'gone') {
    return Object.freeze({
      state: 'The design this came from is gone',
      basedOn: undefined,
      save: Object.freeze({ label: C.saveAsMine, enabled: true, replaces: undefined }),
      copy: undefined,
      revert: Object.freeze({ label: C.revert, enabled: false }),
      notes: Object.freeze([C.saveHolds]),
    });
  }
  return Object.freeze({
    state: open.unsaved ? 'Your copy — not saved yet' : 'An industry design, as shipped',
    basedOn: open.unsaved ? basedOn : undefined,
    save: Object.freeze({ label: C.saveAsMine, enabled: true, replaces: undefined }),
    copy: undefined,
    revert: Object.freeze({ label: C.revert, enabled: open.unsaved }),
    notes: Object.freeze([C.industryNote, C.saveHolds]),
  });
}

/** A style resolved against the library: the profile to load, and the two levers it sets. */
export interface StyleSelection {
  readonly profile: DispatcherProfile;
  readonly parking: boolean;
  readonly zone: boolean;
}

/**
 * What pressing a style card means, or `undefined` for a style whose profile this file lost.
 *
 * Total over the shipped data — `schema.ts` refuses a style naming a profile the file does not
 * declare — so the `undefined` arm is reachable only through a hand-edited document, and it is an
 * absence rather than a substitution for `dev/main.ts#dispatcherNameOf`'s stated reason: an answer
 * about the wrong dispatcher is a false statement, not a missing one.
 */
export function styleSelectionOf(
  file: DispatcherProfiles,
  styleId: string,
): StyleSelection | undefined {
  const style: PlayStyle | undefined = (file.playStyles ?? []).find((entry) => entry.id === styleId);
  if (style === undefined) return undefined;
  const profile = file.profiles.find((entry) => entry.id === style.profileId);
  if (profile === undefined) return undefined;
  return Object.freeze({ profile, parking: style.parking, zone: style.zone });
}

/* -------------------------------------------------------------------------- *
 * Layer 2 — the four plain levers
 * -------------------------------------------------------------------------- */

/**
 * The four levers over the working copy — `mode/plainLevers.ts`'s own views, unchanged.
 *
 * Re-exported through this module rather than imported at the screen, so the workshop has one
 * import surface and the honesty adapter drives the levers on the same seeds as everything else.
 * There is deliberately no second derivation: a lever *is* a named view onto a weight, and this
 * module adds nothing to it.
 */
export function workshopLeversOf(
  spec: DispatcherSpec,
  levers: GroupLevers,
): readonly PlainLeverView[] {
  return plainLeversOf(spec, levers);
}

/* -------------------------------------------------------------------------- *
 * Layer 3 — the thirteen, behind an announced door
 * -------------------------------------------------------------------------- */

/** The thirteen-term drawer: its summary, and one row per term. */
export interface TermDisclosure {
  /** §11.4's own header, with **both counts derived** — never a literal `13` or `4`. */
  readonly summary: string;
  readonly hint: string;
  /** Every term in the library's declaration order, in the Casual register. */
  readonly rows: readonly TermRow[];
  /** How many of {@link rows} carry a weight above zero. */
  readonly weighted: number;
}

/**
 * The drawer, announced by its contents — §16 rule 13, and §11.4's *"the 13 cost terms — 4
 * weighted"*.
 *
 * **Both numbers are counted, not written.** The thirteenth term is the reason: the library grew
 * from twelve to thirteen and every sentence in this repository that had transcribed *"twelve"*
 * became a claim about a different library on the commit that added it. `dispatcherEditor.ts`'s
 * `TermRow` docstring still says *"one of the twelve"*, which is the same defect surviving in a
 * comment; a header that says it out loud on a player's screen is worse.
 *
 * The rows are `termRowsOf` in its `basic` register, which is where §16 rule 11 is met: each row's
 * sub-line is `core`'s `PlayerTermWords` — the plain serves clause and both slider ends — and the
 * inert-term refusal is `inertTerms`', drawn beside the control rather than dropped (§D112).
 *
 * `building` is the standing selection — `EverydayHost.resolvedBuilding`, the building the next run
 * is built from — because the duty refusal is a fact about that building (§ D549), and it is the same
 * decision the Engineer editor draws: one function, two renderings.
 */
export function termDisclosureOf(
  terms: readonly CostTerm[],
  spec: DispatcherSpec,
  building: DutyDeclarations | undefined,
): TermDisclosure {
  const rows = termRowsOf(terms, spec, inertTerms(spec, building), 'basic');
  const weighted = rows.filter((row) => row.weighted).length;
  return Object.freeze({
    summary: `the ${String(rows.length)} cost terms — ${String(weighted)} weighted`,
    hint:
      'Each is a kind of cost, scored 0 to 100. Dark rows count. Grey rows are ignored.',
    rows,
    weighted,
  });
}

/* -------------------------------------------------------------------------- *
 * §11.3 — show me the maths
 * -------------------------------------------------------------------------- */

/** One symbol of the printed line, named before the line is shown. */
export interface MathsSymbol {
  /** The short name as it appears in the line — `wait`, `starvation`. */
  readonly symbol: string;
  /** The term's own player name from `core` — never its engine id. */
  readonly name: string;
  /** The term's own `serves` clause from `core`. */
  readonly serves: string;
  /** The weight, as the line prints it. */
  readonly weight: string;
}

/** §11.3's disclosure: the plain sentence, the symbols, the line, and what the signs mean. */
export interface MathsDisclosure {
  readonly summary: string;
  /** **First**, before any symbol or formula — §16 rule 12. */
  readonly plainSentence: string;
  /** Every symbol the line uses, named. Rule 12 forbids a formula with an unnamed symbol. */
  readonly symbols: readonly MathsSymbol[];
  /** `costFunctionLine`'s output, composed there and only there. */
  readonly line: string;
  /** What the signs mean — see the module docstring for why this is not the handoff's sentence. */
  readonly signs: string;
}

/**
 * The maths, disclosed in §16 rule 12's order: **plain sentence, every symbol named, then the
 * line**, and never the line alone.
 *
 * The line itself is `costFunctionLine`'s — the one composition of that expression in the tree —
 * and nothing here restates the formula. What this adds is the naming: the line prints
 * `1.00·wait + 0.30·starvation`, and `wait` is a short name `shortTermNameOf` derives, so without
 * {@link MathsDisclosure.symbols} a Casual reader would meet an abbreviation of an engine id,
 * which is what rule 11 forbids at one remove.
 *
 * A term the engine has not implemented has no `player` block to read; it is named by the short
 * name alone with the library's own `measures` sentence, which is honest about a term that cannot
 * be described in Casual words rather than inventing some.
 */
export function mathsDisclosureOf(
  spec: DispatcherSpec,
  terms: readonly CostTerm[],
): MathsDisclosure {
  const allIds = terms.map((term) => term.id);
  const symbols = Object.entries(spec.weights)
    .filter(([, position]) => position > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([termId, position]): MathsSymbol => {
      const implemented = COST_TERMS_BY_ID.get(termId);
      const measures = terms.find((term) => term.id === termId)?.measures ?? '';
      return Object.freeze({
        symbol: shortTermNameOf(termId, allIds),
        name: implemented?.player.name ?? shortTermNameOf(termId, allIds),
        serves: implemented === undefined ? measures : implemented.player.serves,
        weight: (position / 100).toFixed(2),
      });
    });
  return Object.freeze({
    summary: WORKSHOP_COPY.showTheMaths,
    plainSentence:
      'Every car gets a score for answering this call, and the lowest score wins. The score ' +
      'chooses between cars. It is not a measure of how the day went, and a car with a low score ' +
      'is not a car that will be quick.',
    symbols: Object.freeze(symbols),
    line: costFunctionLine(spec, (termId) => shortTermNameOf(termId, allIds)),
    signs:
      'Every term on that line is a kind of cost and they are added together, so nothing on it can ' +
      'pull a score down. A weight decides which kind of cost outranks which.',
  });
}

/* -------------------------------------------------------------------------- *
 * Layer 4 — how it behaves, and what the workshop cannot draw
 * -------------------------------------------------------------------------- */

/** §11.4's second block: the dispatcher's own flags, then the levers applied over whoever drives. */
export interface BehaviourBlock {
  readonly heading: string;
  readonly flags: readonly FlagRow[];
  readonly groupHeading: string;
  readonly groupLevers: readonly LeverRow[];
  /** §11.4's own boundary sentence, drawn as part of the header rather than as a footnote. */
  readonly boundary: string;
}

/**
 * The flags and the group levers, both from the Engineer editor's own row builders.
 *
 * Reused rather than rebuilt, which is the point: `flagRowsOf` carries the field each flag writes
 * (`answer.bypassLoadThreshold`, and why *off* is 1 rather than infinity), and a second set of
 * rows here would be a second claim about what a toggle does. The Casual screen draws the `label`
 * and the `hint`; the `help` is the checkable claim, drawn as the control's title.
 */
export function behaviourBlockOf(spec: DispatcherSpec, levers: GroupLevers): BehaviourBlock {
  return Object.freeze({
    heading: WORKSHOP_COPY.behavesHeading,
    flags: flagRowsOf(spec),
    groupHeading: WORKSHOP_COPY.groupHeading,
    groupLevers: leverRowsOf(levers),
    boundary: WORKSHOP_COPY.zoningBoundary,
  });
}

/** One hard constraint, in player-facing words. */
export interface ConstraintCard {
  readonly id: string;
  readonly name: string;
  readonly effect: string;
  /** True when this build had no words for the constraint and the honest fallback was drawn. */
  readonly unnamed: boolean;
}

/**
 * The profile's hard constraints, named — `core`'s `HARD_CONSTRAINT_WORDS`, with the fallback here.
 *
 * The fallback is here rather than in `core` for the reason that record's docstring gives: reaching
 * it is a **content bug the surface must survive**, not a state the model may ship. A constraint
 * with no words renders *"a filter no weight can buy past"* **plus its id** — the id is drawn only
 * on this arm, because a player who meets an unnamed filter is owed the string that will let
 * somebody find it, and a screen that swallowed it would leave them with nothing to report.
 */
export function constraintCardsOf(profile: DispatcherProfile | undefined): readonly ConstraintCard[] {
  return Object.freeze(
    (profile?.hardConstraints ?? []).map((id) => {
      const words = HARD_CONSTRAINT_WORDS[id as HardConstraintId] as
        | (typeof HARD_CONSTRAINT_WORDS)[HardConstraintId]
        | undefined;
      if (words === undefined) {
        return Object.freeze({
          id,
          name: `${WORKSHOP_COPY.constraintFallbackName} (${id})`,
          effect:
            'This filter has no plain name yet. It still runs, and still rejects cars before any ' +
            'weight is read.',
          unnamed: true,
        });
      }
      return Object.freeze({ id, name: words.name, effect: words.effect, unnamed: false });
    }),
  );
}

/* -------------------------------------------------------------------------- *
 * Layer 5 — traffic-pattern switching
 * -------------------------------------------------------------------------- */

/** One of §11.5's three switching modes, in the guide's words, over `core`'s own policy values. */
export interface SwitchingModeCard {
  /** `core`'s `WeightSetPolicy` value. Never rendered. */
  readonly policy: string;
  readonly label: string;
  readonly selected: boolean;
}

/** One of the six detector parameters, with its declared range and `core`'s own description. */
export interface DetectorControl {
  readonly field: SelectorScalarField;
  readonly label: string;
  /** `core`'s own parameter description, verbatim — `selectorSpec.ts#helpFor`. */
  readonly help: string;
  readonly range: readonly [number, number] | undefined;
  readonly value: number;
  /** True while `policy: 'off'` makes every control in this block inert. */
  readonly inert: boolean;
}

/** §11.4's switching block, whole. */
export interface SwitchingBlock {
  readonly heading: string;
  readonly hint: string;
  readonly modes: readonly SwitchingModeCard[];
  /** `selectorSpec.ts#policyLine` — what this configuration does, never what it buys. */
  readonly policyLine: string;
  /** The §11.4 inert sentence, present exactly while the whole block is inert. */
  readonly inertNote: string | undefined;
  readonly controls: readonly DetectorControl[];
  /** The five pattern cards — what each is, how it is detected, and what runs while it holds. */
  readonly patterns: readonly PatternCard[];
}

/**
 * §11.4's three modes, in the guide's order and words, mapped onto `core`'s three policy values.
 *
 * The labels are §11.4's; the *values* are `WEIGHT_SET_POLICIES` through
 * `selectorSpec.ts#POLICY_VALUES`, so a fourth policy in `core` appears here as an unlabelled
 * option rather than being silently dropped — which is the failure the derived-list rule exists
 * for. `selectorSpec.test.ts` already pins the policy set; this one names them.
 */
const POLICY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  off: 'One setting, all shift',
  fuzzy: 'Watch the traffic and change',
  contextual: 'Watch the traffic, with your tuning',
});

/** The six detector controls' §11.4 labels, keyed by the field `core` declares. */
const DETECTOR_LABELS: Readonly<Record<string, string>> = Object.freeze({
  hysteresisS: 'How long to stick with a decision',
  observationWindowS: 'How long a window to judge on',
  lobbyArrivalRateGain: 'Weight given to lobby arrivals',
  interfloorRateGain: 'Weight given to floor-to-floor trips',
  downPeakRateGain: 'Weight given to people heading down',
  switchMargin: 'How much better a new pattern must look',
});

/**
 * The whole switching block.
 *
 * Under `off` the block is drawn and **stated inert** rather than hidden, which is §11.4's own
 * instruction and §D227's rule in the same breath: a control that writes nothing must say so, and
 * a hidden control says nothing at all. The inert sentence names the mechanism — the detector is
 * never built — rather than saying the block is disabled, because *why* is the part a player can
 * act on.
 */
export function switchingBlockOf(spec: SelectorSpec, context: SelectorContext): SwitchingBlock {
  const inert = spec.policy === 'off';
  const controls = SELECTOR_SCALAR_FIELDS.filter((field) => field !== 'policy').map(
    (field): DetectorControl =>
      Object.freeze({
        field,
        label: DETECTOR_LABELS[field] ?? field,
        help: helpFor(field),
        range: rangeFor(field),
        value: Number(spec[field]),
        inert,
      }),
  );
  return Object.freeze({
    heading: WORKSHOP_COPY.switchingHeading,
    hint: WORKSHOP_COPY.switchingHint,
    modes: Object.freeze(
      POLICY_VALUES.map((policy) =>
        Object.freeze({
          policy,
          label: POLICY_LABELS[policy] ?? policy,
          selected: spec.policy === policy,
        }),
      ),
    ),
    policyLine: policyLine(spec, context),
    inertNote: inert
      ? 'Off while one setting runs all shift. Nothing below this line reaches the run.'
      : undefined,
    controls: Object.freeze(controls),
    patterns: patternCards(spec, context),
  });
}

/* -------------------------------------------------------------------------- *
 * Layer 6 — the rules editor
 * -------------------------------------------------------------------------- */

/** One option of a `when` or `then` select — the id, the phrase with `{v}` still in it. */
export interface RuleOption {
  readonly id: string;
  /** The `{v}` template, unsubstituted — the select's own label. */
  readonly template: string;
  /** The values this id admits, or `undefined` for a valueless one. */
  readonly values: readonly RuleValueOption[] | undefined;
}

/** One authored row, as the editor draws it. */
export interface RuleRowView {
  readonly index: number;
  readonly when: RuleConditionId;
  readonly whenValue: number | string | undefined;
  /** The row's further conditions, in order — every one must hold as well as the first. */
  readonly and: readonly { readonly when: RuleConditionId; readonly whenValue: number | string | undefined }[];
  /** Whether the row may take another: `ruleSpec.ts#canAddCondition`. */
  readonly canAddCondition: boolean;
  readonly then: RuleActionId;
  readonly thenValue: number | string | undefined;
  /** §11.5's plain readback — `ruleSpec.ts#readbackOf`, composed there. */
  readonly readback: string;
  /** §11.5's *every row shows the lever it moves* — the model's own `moves` claim. */
  readonly lever: string;
  /** Every refusal about this row, from `ruleSpec.ts#ruleIssues`. */
  readonly issues: readonly RuleIssue[];
}

/** The whole §11.5 block. */
export interface RulesBlock {
  readonly heading: string;
  readonly hint: string;
  /** Every condition `core` declares, in its own order. */
  readonly whenOptions: readonly RuleOption[];
  /** Every action `core` declares — **eight**, not §11.5's ten. See the module docstring. */
  readonly thenOptions: readonly RuleOption[];
  readonly rows: readonly RuleRowView[];
  /** The one note about why the action list is the model's. */
  readonly vocabularyNote: string;
  /** *If no rule fits, ⟨style⟩ decides.* — always drawn. */
  readonly fallback: string;
  readonly exclusivity: string;
  /** Drawn instead of the rows when there are none. */
  readonly empty: string | undefined;
}

/**
 * The rules editor.
 *
 * **The two options lists are `RULE_CONDITIONS` and `RULE_ACTIONS` mapped**, not transcriptions of
 * §11.5's tables. That is the whole of the refusal the mission asks for: *skip everything above*
 * and *treat up-calls as urgent* are absent from `RULE_ACTIONS` — with the reasons on that array's
 * docstring, which are load-bearing (a floor mask is a second source of truth about service range;
 * no cost term prices direction-conditional urgency, so the label would lie) — and because this
 * list is derived, they cannot be built here. A screen that transcribed the guide's ten would have
 * offered two rows the compiler accepts and the run refuses.
 */
export function rulesBlockOf(
  rows: readonly RuleRow[],
  styleName: string,
  context: RuleContext,
): RulesBlock {
  const issues = ruleIssues(rows, context);
  return Object.freeze({
    heading: WORKSHOP_COPY.rulesHeading,
    hint: WORKSHOP_COPY.rulesHint,
    whenOptions: Object.freeze(
      RULE_CONDITIONS.map((id) =>
        Object.freeze({
          id,
          template: RULE_CONDITION_WORDS[id].template,
          values: RULE_CONDITION_WORDS[id].values,
        }),
      ),
    ),
    thenOptions: Object.freeze(
      RULE_ACTIONS.map((id) =>
        Object.freeze({
          id,
          template: RULE_ACTION_WORDS[id].template,
          values: RULE_ACTION_WORDS[id].values,
        }),
      ),
    ),
    rows: Object.freeze(
      rows.map((row, index) =>
        Object.freeze({
          index,
          when: row.when,
          whenValue: row.whenValue,
          and: Object.freeze(
            (row.and ?? []).map((extra) => Object.freeze({ when: extra.when, whenValue: extra.whenValue })),
          ),
          canAddCondition: canAddCondition(row),
          then: row.then,
          thenValue: row.thenValue,
          readback: readbackOf(row),
          lever: leverLineOf(row),
          issues: Object.freeze(
            issues.filter((issue) => issue.field.startsWith(`rows.${String(index)}.`)),
          ),
        }),
      ),
    ),
    vocabularyNote: WORKSHOP_COPY.rulesVocabularyNote,
    fallback: fallbackLineOf(styleName),
    exclusivity: RULES_EXCLUSIVITY_NOTE,
    empty: rows.length === 0 ? WORKSHOP_COPY.rulesEmpty : undefined,
  });
}

/* -------------------------------------------------------------------------- *
 * §11.1 — the nameplate
 * -------------------------------------------------------------------------- */

/** §11.1's derived rows: what this was started from, and what has moved since. */
export interface Nameplate {
  /** The dashed sentence before anything is changed, or `undefined` once it is. */
  readonly unchanged: string | undefined;
  /** The style or dispatcher this was started from, by name. */
  readonly startedFrom: string;
  /** §6.1's own reading — `2 of 4`, both numbers derived. */
  readonly leversMoved: string;
  readonly rules: string;
  /** §11.1's fourth row. Always the dirty wording in this build — see the docstring. */
  readonly provedOnTheBench: string;
}

/**
 * The nameplate's four derived rows.
 *
 * `leversMoved` counts the levers whose value differs from the **style's own** starting point
 * rather than from `ENGINE_CONTRACT` §6.1's `{patience: 30, lobby: 20, spread: 30, load: 40}`
 * defaults. That table is the prototype's lever *state*, and this tree deliberately has none —
 * `mode/plainLevers.ts`'s whole design is that a lever is a view over the weight vector, so
 * *"moved"* can only mean *"differs from where this style put it"*. Counting against a constant
 * would report two levers moved on a dispatcher nobody has touched.
 *
 * `provedOnTheBench` reads §11.1's dirty wording whenever the working copy differs from what was
 * loaded, and otherwise says the bench has not seen this build — **never** that it has. This build
 * keeps no per-dispatcher bench record, so the affirmative arm would be a claim about a run that
 * may not exist; the absence is stated rather than guessed.
 */
export function nameplateOf(input: {
  readonly startedFrom: string;
  readonly spec: DispatcherSpec;
  readonly levers: GroupLevers;
  readonly baseSpec: DispatcherSpec;
  readonly baseLevers: GroupLevers;
  readonly ruleRows: readonly RuleRow[];
}): Nameplate {
  const moved = plainLeversOf(input.spec, input.levers).filter((lever, index) => {
    const base = plainLeversOf(input.baseSpec, input.baseLevers)[index];
    return base === undefined || base.value !== lever.value;
  }).length;
  const total = plainLeversOf(input.spec, input.levers).length;
  const dirty = moved > 0 || input.ruleRows.length > 0;
  return Object.freeze({
    unchanged: dirty
      ? undefined
      : `${input.startedFrom}, unchanged — move a lever or add a rule to make it your own.`,
    startedFrom: `started from ${input.startedFrom}`,
    leversMoved: `levers moved ${String(moved)} of ${String(total)}`,
    rules: `rules ${String(input.ruleRows.length)}`,
    provedOnTheBench: dirty
      ? 'proved on the bench — not since your last change'
      : 'proved on the bench — no record is kept, so it cannot say',
  });
}

/* -------------------------------------------------------------------------- *
 * §3.3's note cell — which of this screen's writes reach a run, GitHub issue #296
 * -------------------------------------------------------------------------- */

/**
 * The four `ViewerState` fields this screen writes, by their `scope/surface.ts` key.
 *
 * Listed rather than derived, and the list is itself the claim: `workshopScreen.ts` wires exactly
 * four host methods that write state — `setWorkingSpec`, `setGroupLevers`, `setSelectorSpec` and
 * `setRuleRows` — and `workshopTravel.test.ts` asserts this against the screen's own source in both
 * directions, so a fifth write arriving without a row here fails rather than being described by a
 * sentence that has not heard of it.
 *
 * The order is `dev/state.ts#shiftRunConfigOf`'s own composition order, which is also the order a
 * reader meets them on the panel: the draft first, then the three that travel.
 */
export const WORKSHOP_WRITES = Object.freeze([
  'viewer.dispatcherSpec',
  'viewer.levers',
  'viewer.selectorSpec',
  'viewer.ruleRows',
] as const);

export type WorkshopWrite = (typeof WORKSHOP_WRITES)[number];

/**
 * What the bar can honestly say about the edits standing when the primary is pressed.
 *
 * Four answers rather than the guide's two, because § 3.3's table was transcribed from a prototype
 * whose workshop had no draft: every control on it reached its toy simulator, so *unsaved changes
 * travel with the run* and *nothing changed yet* were the only two states that existed. This build
 * had a third field class — `viewer.dispatcherSpec` was `latent`, and `dev/state.ts#drivingProfileOf`
 * composed the run from the other three and never from it — so the two-cell table could not describe
 * two of the four states a player could actually produce. That was the old `WORKSHOP_COPY.libraryHeading`'s
 * situation exactly (the prototype's panel offers six styles, this build ships thirteen), and it is
 * answered the same way: the guide's own sentences are kept and drawn where they are true, and this
 * build adds the ones its own shape needs.
 *
 * **Since § D886 (GitHub issue #575) all four writes reach the run, so two of these four answers are
 * unreachable in the shipped product — and they are kept rather than deleted.** `draft-only` and
 * `split` are decided by {@link workshopWriteReachesRun}, which asks `scope/surface.ts` rather than
 * this module; the day a fifth write lands latent, or the day the working copy goes back to being a
 * draft, the bar has the sentence for it already and does not fall back to the guide's two-cell
 * table. `workshopTravel.test.ts` drives all sixteen subsets of the four writes against the
 * classification, so the two quiet answers are exercised by every run of the suite rather than
 * waiting unexercised for the state that needs them — which is the difference between a dead branch
 * and a register kept honest, and the same argument `probes.test-helper.ts#SINK_MISSING` makes about
 * an empty register one directory over.
 *
 * - `nothing` — no write is standing. The guide's *Nothing changed yet.*
 * - `travels` — every standing write reaches the run. The guide's *Unsaved changes travel with the
 *   run.*, drawn where it is a true sentence.
 * - `draft-only` — the only standing writes are the draft's, so the next run is the run the player
 *   would have got having touched nothing.
 * - `split` — both, and the reason this is four answers rather than three: either sentence above
 *   would be half right about edits a player made in one sitting, and half right is what
 *   GitHub issue #296 was.
 *
 * Named rather than derived, on `scope/commitment.ts#COMMITMENTS`' own rule: a fifth answer is a
 * compile error at every exhaustive `switch` over this union, while a fifth *field* is caught by
 * {@link WORKSHOP_WRITES}' both-directions assertion instead.
 *
 * `DECISIONS.md` § D386 is the decision — including why the disclosure was chosen over wiring the
 * draft, which GitHub issue #296's first criterion also allowed.
 */
export const WORKSHOP_REACHES = Object.freeze([
  'nothing',
  'travels',
  'draft-only',
  'split',
] as const);

export type WorkshopReach = (typeof WORKSHOP_REACHES)[number];

/**
 * Whether one of {@link WORKSHOP_WRITES} reaches a run — decided by `scope/surface.ts`, not here.
 *
 * This indirection is the whole point of the function and the reason it is not four booleans
 * written inline at the call site. A sentence about what a control reaches is a claim about the
 * code, and this repository's standing rule is that such a claim is pinned by a run and never by
 * another sentence — § D227, the traffic editor's *mean group size* refusal that stayed on screen
 * for every wave after the seam went live. `scope/surface.ts` is the one table that answers *what
 * does moving this reach*, `scope.test.ts` decides its `control` rows by running both arms and
 * comparing the legs, and `scope/commitment.ts#commitmentOf` is the reader. So a note indexed
 * through here inherits that pinning.
 *
 * **That sentence used to end with a prediction, and the prediction came true by another route.**
 * It read *"the day GitHub issue #228 gives the draft a way across and `viewer.dispatcherSpec`
 * stops being `latent`, this answer changes itself and the bar stops saying the weights stay
 * behind"*. The field stopped being latent on § D886 and #228 is not what did it — GitHub issue
 * #575 wired `dev/state.ts#drivingProfileOf` to the working copy, so the copy reaches the run as a
 * copy and needs no way across. **The mechanism was right about itself**: this function now answers
 * `true` for `viewer.dispatcherSpec`, the bar says the edit travels, and not one sentence was
 * edited to make that happen. The prediction is kept as the dated record it is, because a claim
 * about a derivation that survived its own subject moving is worth more than a tidy paragraph.
 *
 * `undefined` — an `output`, or a key the table does not carry — counts as **not reaching**, and
 * the direction is chosen rather than defaulted. The failure being guarded is a bar that promises
 * an edit travelled, so an answer the scope table cannot give must not become that promise;
 * `surface.test.ts` makes the second cause impossible for a field that exists.
 */
export function workshopWriteReachesRun(key: WorkshopWrite): boolean {
  const commitment = commitmentOf(key, 'writes-only');
  return commitment === 'next-run' || commitment === 're-runs-now';
}

/**
 * The bar's answer for the set of writes currently standing.
 *
 * Takes the moved keys rather than the four models, so the arithmetic deciding *moved* stays beside
 * the host that owns each field and this stays a pure statement about reach.
 * `workshopTravel.test.ts` supplies every subset, and requires the answer to agree with a
 * measurement on the legs for each one a player can reach with a single control.
 */
export function workshopReachOf(moved: Iterable<WorkshopWrite>): WorkshopReach {
  let travels = false;
  let stays = false;
  for (const key of moved) {
    if (workshopWriteReachesRun(key)) travels = true;
    else stays = true;
  }
  if (travels && stays) return 'split';
  if (travels) return 'travels';
  return stays ? 'draft-only' : 'nothing';
}
