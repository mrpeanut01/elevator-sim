/**
 * **The dispatcher workshop's pure model** — GAMEPLAY_AND_NAVIGATION.md §11, the half that has no
 * document. `everyday/workshopScreen.ts` is the DOM half and draws exactly what is decided here.
 *
 * ## What the workshop is for, and the rule that shapes every export below
 *
 * §D301's thesis: *the mass-market draw is the non-dumbification of the settings and parameters*.
 * §D299 §2 states the test this surface has to pass — **easier to use, never saying less** — so
 * nothing here is withheld on the grounds that a Casual player *would not want it*. What Casual
 * gets is **disclosure order**, not a smaller product: six named styles, four plain levers, then
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
 * - the **six play styles** are `data/dispatcher-profiles.json`'s `playStyles` block
 *   (`core`'s `PlayStyle`), for the reason invariant 7 gives: a style is a weight vector with a
 *   name, and a renderer holding six names against six profile ids is that forbidden table with a
 *   friendlier key.
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

import {
  costFunctionLine,
  inertTerms,
  type DispatcherSpec,
  type GroupLevers,
} from '../authoring/dispatcherSpec.js';
import {
  fallbackLineOf,
  leverLineOf,
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
 * Sources, line by line: `styleHeading`, `yoursHeading`, `optimisingHeading`, `behavesHeading`,
 * `groupHeading`, `switchingHeading`, `rulesHeading`, `showEveryTerm`, `showTheMaths` and
 * `zoningBoundary` are the prototype's own cells (`docs/design/elevator-sim-casual.dc.html`, and
 * §11.4's header sentence verbatim). `libraryHeading` and `libraryHint` are this build's, because
 * the prototype's left panel offers six styles and the saved shelf and nothing else, and this
 * build ships thirteen dispatchers — §D299 §2 forbids hiding the other seven behind a card that
 * does not exist.
 */
export const WORKSHOP_COPY = Object.freeze({
  eyebrow: 'DISPATCHER WORKSHOP',
  title: 'Build the thing that decides',
  lede:
    'A dispatcher is one rule, asked thousands of times a day: which car goes to this call. Start ' +
    'from a style, pull four levers, and open as much of the rest as you want. Nothing here is ' +
    'held back — the drawers are an order to read in, not a smaller set of controls.',
  styleHeading: 'START FROM A STYLE',
  styleHint:
    'Each one is a whole dispatcher already. Pressing a card replaces what you are editing, so ' +
    'press one first and tinker after.',
  /** Drawn instead of the cards when the loaded library declares no styles at all. */
  styleAbsent:
    'This build’s dispatcher library declares no named styles, so there is nothing to start from ' +
    'here. Every dispatcher it does ship is in the list below, under its own name.',
  libraryHeading: 'EVERY OTHER DISPATCHER THIS BUILD SHIPS',
  libraryHint:
    'The styles above are six ways in, not the whole shelf. These are the rest, under the names ' +
    'the library gives them.',
  yoursHeading: 'YOURS',
  /**
   * The shelf's empty state — and it promised a landing place this build has no verb to reach.
   *
   * It read *"Nothing saved yet. Move a lever or add a rule and this is where it lands."* Nothing
   * in `everyday/` writes `savedDispatchers`: the Engineer editor's *Save as new* is the only
   * control in the product that files a dispatcher, so a player who moved a lever here and looked
   * for it to land was watching for something that could not arrive. GitHub issue #296's fourth
   * criterion, and the same class as the promise its footer used to make.
   *
   * The replacement says where a save comes from rather than that one is coming, which is § D227's
   * rule pointed at a promise instead of a refusal.
   *
   * **Issues #228 and #167 have landed and this sentence is unchanged, which is the note worth
   * keeping** ([§ D443](../../../../DECISIONS.md)). That lane made a saved dispatcher reach
   * Compare, the suite, the Lab, the bench and the gauntlet — so the shelf below is now worth
   * filling, and the route it names is now worth taking. What it did **not** build is a Save here,
   * and it declined deliberately rather than for want of time: #180's scope transfer into #228
   * names four behaviours § 11.1 requires of one — overwrite, save-as-a-copy, auto-versioned names,
   * and the warning before an overwrite — and *"saves and persists"* admits an implementation that
   * satisfies #228 and none of them. So the sentence is still true, and it stays until a lane owns
   * all four.
   */
  yoursEmpty:
    'Nothing saved yet. Saving a dispatcher of your own is the Engineer workshop’s Save as new — ' +
    'this build has no save here yet. Your levers, switching and rules still travel with the next ' +
    'run without being saved.',
  leversHeading: 'THE FOUR LEVERS',
  leversHint:
    'Four plain controls over the same numbers the drawer below holds. Move one and the cost line ' +
    'changes, because it is the same weight.',
  optimisingHeading: 'WHAT IT IS OPTIMISING',
  showEveryTerm: 'show every term',
  behavesHeading: 'HOW IT BEHAVES',
  groupHeading: 'GROUP LEVERS — APPLY TO WHOEVER IS DRIVING',
  /** §11.4's boundary sentence, verbatim. It is also why one §11.5 action does not exist. */
  zoningBoundary:
    'zoning and service ranges belong to the building, not the dispatcher — they live in Design a ' +
    'building',
  constraintsHeading: 'FILTERS NO WEIGHT CAN BUY PAST',
  constraintsHint:
    'These run before the scoring. A car they reject is not offered the call however the weights ' +
    'are set.',
  /** The honest name for a constraint this build carries and has no player-facing words for. */
  constraintFallbackName: 'a filter no weight can buy past',
  carriedHeading: 'CARRIED, AND NOT DRAWN HERE',
  carriedHint:
    'This dispatcher was authored with settings this workshop has no control for. They travel with ' +
    'it unchanged when you save — they are not lost, and they are not editable here.',
  switchingHeading: 'TRAFFIC-PATTERN SWITCHING',
  switchingHint:
    'The one thing that can change mid-shift: whether the dispatcher may notice the traffic has ' +
    'turned over and swap what it is optimising for.',
  rulesHeading: 'ADVANCED: WRITE YOUR OWN RULES',
  rulesHint:
    'Read top to bottom, first match wins. Every row says the lever it moves, so the two views can ' +
    'never disagree.',
  /**
   * Why the list of *then* clauses is shorter than the guide's.
   *
   * One sentence, not two refusals: the vocabulary is the model's, and a screen that authored its
   * own reason for each omission would be a second answer to *what can a rule do*.
   */
  rulesVocabularyNote:
    'The list of things a rule can do is the simulator’s own, so a rule you can write is a rule it ' +
    'can run. A rule that masked off floors is not here for the reason above: which floors a shaft ' +
    'serves is the building’s, not the dispatcher’s.',
  rulesEmpty: 'No rules. The style above decides every call on its own.',
  showTheMaths: 'show me the maths',
  mathsHeading: 'HOW A CAR IS CHOSEN',
} as const);

/* -------------------------------------------------------------------------- *
 * Layer 1 — the named styles, and everything else on the shelf
 * -------------------------------------------------------------------------- */

/** One style card, as §11.2 draws it: a name, the trade, and whether it is what is loaded. */
export interface PlayStyleCard {
  readonly id: string;
  /** The style's own name from `data/`. Never a profile id — §16 rule 11. */
  readonly name: string;
  /** One plain sentence about the trade. Never a claim of quality. */
  readonly trade: string;
  /** True when the working copy is this style, unedited. */
  readonly selected: boolean;
}

/**
 * The style cards, in the file's own order, with the loaded one marked.
 *
 * `selected` compares the **whole** starting point — the profile the style names *and* its two
 * group settings — because §6.2's `steady-hand` and `lobby-anchor` share a weight vector and
 * differ only in where the idle cars wait. Comparing the profile alone would light both cards for
 * one state, which is a screen telling a player they are somewhere they are not.
 */
export function playStyleCardsOf(
  file: DispatcherProfiles,
  loadedProfileId: string,
  levers: GroupLevers,
  spec: DispatcherSpec,
): readonly PlayStyleCard[] {
  return Object.freeze(
    (file.playStyles ?? []).map((style) =>
      Object.freeze({
        id: style.id,
        name: style.name,
        trade: style.trade,
        selected:
          style.profileId === loadedProfileId &&
          style.parking === levers.parking &&
          style.zone === spec.flags.zone,
      }),
    ),
  );
}

/**
 * The refusal drawn where the cards would be, or `undefined` when there are cards.
 *
 * A build whose library declares no styles is not a broken build — the styles are optional in the
 * schema — so this is a sentence rather than a blank region, and it points at the list that *does*
 * have every dispatcher in it. §D227's rule: a control that offers nothing must say so.
 */
export function playStyleAbsenceOf(file: DispatcherProfiles): string | undefined {
  return (file.playStyles ?? []).length === 0 ? WORKSHOP_COPY.styleAbsent : undefined;
}

/** One shipped dispatcher no style names, offered under the library's own name for it. */
export interface LibraryCard {
  readonly profileId: string;
  readonly name: string;
  readonly selected: boolean;
}

/**
 * Every shipped dispatcher **no style already names**, so the shelf is complete without being
 * doubled.
 *
 * This exists because of §D299 §2 rather than because the prototype asks for it: six cards over a
 * thirteen-profile library is six-thirteenths of a product, and *"the audience would not want the
 * other seven"* is exactly the reasoning that clause forbids. The card carries the profile's own
 * `name` — authored, player-facing, capped by `core`'s schema — and never its id.
 */
export function libraryCardsOf(
  file: DispatcherProfiles,
  loadedProfileId: string,
): readonly LibraryCard[] {
  const named = new Set((file.playStyles ?? []).map((style) => style.profileId));
  return Object.freeze(
    file.profiles
      .filter((profile) => !named.has(profile.id))
      .map((profile) =>
        Object.freeze({
          profileId: profile.id,
          name: profile.name,
          selected: profile.id === loadedProfileId,
        }),
      ),
  );
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
 */
export function termDisclosureOf(
  terms: readonly CostTerm[],
  spec: DispatcherSpec,
): TermDisclosure {
  const rows = termRowsOf(terms, spec, inertTerms(spec), 'basic');
  const weighted = rows.filter((row) => row.weighted).length;
  return Object.freeze({
    summary: `the ${String(rows.length)} cost terms — ${String(weighted)} weighted`,
    hint:
      'Each one is a kind of cost, scored 0 to 100. An inked row is one this dispatcher is paying ' +
      'attention to; a grey one it is ignoring.',
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
      'Every car is given a score for answering this call, and the lowest score wins. It is a way ' +
      'of choosing between cars — it is not a measure of how the day went, and a car with a low ' +
      'score is not a car that will be quick.',
    symbols: Object.freeze(symbols),
    line: costFunctionLine(spec, (termId) => shortTermNameOf(termId, allIds)),
    signs:
      'Every term on that line is a kind of cost and they are added together, so nothing on it can ' +
      'pull a score down: distance costs, a full car costs, a long-standing call costs. What a ' +
      'weight decides is which kind of cost outranks which.',
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
            'This build has no player-facing words for this filter. It still runs, and it still ' +
            'rejects cars before any weight is read.',
          unnamed: true,
        });
      }
      return Object.freeze({ id, name: words.name, effect: words.effect, unnamed: false });
    }),
  );
}

/**
 * The blocks a profile can carry that this workshop draws no control for.
 *
 * Its own union rather than `dispatcherEditor.ts#UnauthorableBlock`, because the two screens ask
 * different questions and the shared name hid that — see {@link carriedBlocksOf}. A member leaves
 * here on the commit that draws its family, never before.
 */
export type WorkshopCarriedBlock =
  | 'auction'
  | 'zoning'
  | 'panel'
  | 'reassignment'
  | 'timing'
  | 'constraints'
  | 'selection';

/**
 * The Casual sentence for each block a profile can carry that this workshop has no control for.
 *
 * A table keyed by a **closed union declared in this module**, not by an engine id — so it is not
 * the §6.3 shape: {@link WorkshopCarriedBlock} gaining a member is a compile error here, where a
 * profile gaining a section is not. The sentences exist because the alternative is worse in both
 * directions: printing the union's own members would put `auction` and `panel` on a Casual surface
 * (rule 11), and printing nothing would be §D227's silent partial editor, which
 * {@link carriedBlocksOf} exists to refuse.
 */
const CARRIED_BLOCK_WORDS: Readonly<Record<WorkshopCarriedBlock, string>> = Object.freeze({
  auction: 'the cars bid against each other for the call, over more than one round',
  zoning: 'a crowd size above which the tower is split between the cars',
  panel: 'the landing panel tells each rider which car to stand at',
  reassignment: 'a call may be taken off one car and given to another after it was assigned',
  timing: 'the moment the call is assigned is held back rather than taken on the press',
  constraints: 'a filter that decides which cars may be offered the call at all',
  selection: 'a rule for changing what it optimises part-way through the day',
});

/** One carried-but-not-drawn block, in words. */
export interface CarriedBlock {
  readonly block: WorkshopCarriedBlock;
  readonly words: string;
}

/**
 * What this dispatcher carries that **this workshop** cannot draw, said in Casual words.
 *
 * ## Why the list is derived here rather than borrowed
 *
 * It used to call `dispatcherEditor.ts#unauthorableBlocksOf`, and that was right while the two
 * screens could draw the same seven blocks: neither authored them, so one list answered both.
 * `dev/familyControls.ts` then made six of the seven authorable **in the Engineer editor**, and that
 * function narrowed to `selection` alone — correctly, for its own screen.
 *
 * The workshop imports none of those controls. So the borrowed list stopped meaning *what this
 * screen is not showing* and started meaning *what the other screen is not showing*, and the two
 * had quietly become different questions. Left alone, a Casual player editing `auction-multi-round`
 * — which declares an auction and no selection — would have been told nothing at all, on the one
 * disclosure whose entire job is to say what the screen is leaving out. § D227, arriving through a
 * merge rather than through an edit, on a surface neither lane changed.
 *
 * The derivation below is the one that function carried before it narrowed, and it stays here until
 * the workshop draws these families itself — at which point a block leaves this list on the commit
 * that draws it, which is the same rule the register it came from applies one screen over.
 *
 * Derived from the profile rather than from its `role`, because `role` is free-form and three of the
 * thirteen shipped profiles declare none while carrying exactly these blocks. Empty for most of the
 * shelf; non-empty is the honest half of *full capability* — the workshop says what it is not
 * showing rather than letting a reader believe the screen is the document.
 */
export function carriedBlocksOf(profile: DispatcherProfile | undefined): readonly CarriedBlock[] {
  if (profile === undefined) return Object.freeze([]);
  const dispatch = profile.dispatch;
  const found: WorkshopCarriedBlock[] = [];
  if (profile.auction !== undefined) found.push('auction');
  if (dispatch?.splitThresholdPassengers !== undefined) found.push('zoning');
  if (dispatch?.passengerAssignment !== undefined) found.push('panel');
  if (dispatch?.reassignmentPolicy !== undefined) found.push('reassignment');
  if (dispatch?.assignmentTiming !== undefined) found.push('timing');
  if (profile.hardConstraints !== undefined || profile.eligibility !== undefined) {
    found.push('constraints');
  }
  if (profile.selection !== undefined) found.push('selection');
  return Object.freeze(
    found.map((block) => Object.freeze({ block, words: CARRIED_BLOCK_WORDS[block] })),
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
      ? 'Inert while one setting runs all shift: the dispatcher holds a single weight vector and ' +
        'never builds the detector. Nothing below this line reaches the run.'
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
      : `${input.startedFrom}, unchanged — move a lever or add a rule and this becomes a ` +
        'dispatcher of your own, with a name you choose.',
    startedFrom: `started from ${input.startedFrom}`,
    leversMoved: `levers moved ${String(moved)} of ${String(total)}`,
    rules: `rules ${String(input.ruleRows.length)}`,
    provedOnTheBench: dirty
      ? 'proved on the bench — not since your last change'
      : 'proved on the bench — this build keeps no bench record for a dispatcher, so the bench ' +
        'cannot say it has seen this one',
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
 * has a third field class — `viewer.dispatcherSpec` is `latent`, and `dev/state.ts#drivingProfileOf`
 * composes the run from the other three and never from it — so the two-cell table cannot describe
 * two of the four states a player can actually produce. That is `WORKSHOP_COPY.libraryHeading`'s
 * situation exactly (the prototype's panel offers six styles, this build ships thirteen), and it is
 * answered the same way: the guide's own sentences are kept and drawn where they are true, and this
 * build adds the ones its own shape needs.
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
 * through here inherits that pinning: the day GitHub issue #228 gives the draft a way across and
 * `viewer.dispatcherSpec` stops being `latent`, this answer changes itself and the bar stops saying
 * the weights stay behind.
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
