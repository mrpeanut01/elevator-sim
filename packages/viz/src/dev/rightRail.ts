/**
 * The right rail — four segments over *what is running* (`docs/12-design-handoff.md` § 1.4,
 * R1–R3).
 *
 * ## What this mount is, and what the shell keeps
 *
 * `dev/surfaces.ts` owns the segmented control: which button is selected, which panel is hidden,
 * which one the arrow keys reach. This file owns **the contents of the four panels** and nothing
 * else — a list, a `SCHEDULE` plate and a link, four times over. Re-implementing the segment
 * machinery here would be a second answer to *which segment is open*, which is the failure this
 * package has a rule about.
 *
 * ## Every figure is derived, and the handoff's are not
 *
 * The handoff's plates are computed from a prototype's own re-authored buildings: its building
 * schedule contains a nominal round trip (`(rise * 2) / speed + stops * 5.4 + cap * 1.92`), an
 * interval derived from it, and a handling capacity derived from *that*. None of the three is
 * reproduced. `docs/12` § 4.2 replaces every figure with one the recording actually produced, and
 * the consequence for this file is the rule stated in one line:
 *
 * > **A plate never computes a round trip *and passes it off as a measurement*. It reads one off
 * > the run, or it says there is no run — and where it computes one, it says so.**
 *
 * The second clause is `docs/21` § 3.7 (1) and it is a *widening with a label*, not a weakening.
 * The rule's subject was always the prototype's defect: a nominal figure printed **beside** measured
 * ones with nothing to tell them apart, inviting a comparison a single run cannot support. So
 * `handling capacity` and `achieved interval` still appear **if and only if** a recording exists,
 * and before the first run the plate still says so in a row of its own rather than quietly filling
 * the space with arithmetic the simulator did not do. Underneath them, {@link closedFormRowsOf}
 * draws the Barney/CIBSE closed form per bank — *a specification, not a measurement*, with its
 * assumptions cited and its divergences named — because a specification needs no run and refuses to
 * stand in for one. That is the correctness oracle on screen: under pure up-peak the two intervals
 * should agree within a few percent, and a reader who can see them disagree has a defect report.
 * The rest — floors, rise, population, shafts, car capacity — comes off the *resolved* building,
 * which is the grown one the day is actually being run against.
 *
 * The dispatcher plate is read from `resolveDispatchConfig`, not from the profile as authored:
 * every one of `load sensor`, `pooling`, `zoning` and `parking` has a default that a profile
 * declining to mention it still gets, and a plate that read only the authored object would print
 * *none* about a behaviour that is on.
 *
 * ## The two averages this rail is allowed to print, and the one it is not
 *
 * `handlingCapacity` is a rate over counts — people carried per five minutes against people
 * offered per five minutes — and is never suppressed. `achievedInterval.meanS` **is** a mean, of
 * the gaps between car departures, and § 1.5 B8 is unconditional: *nothing on the screen is
 * averaged over a queue that never settled*. So the interval row is withheld whenever
 * `meansAreSuppressed(recording)`, and says which gate withheld it. Nothing here reaches for
 * `meanWaitS`, `wait95S` or `meanTimeToDestinationS` at all.
 *
 * ## Three of the four segments pick, and the fourth reports — issue #114
 *
 * `docs/12` § 1.4 R2 gives every segment *"a list of selectable cards"*, and the Machines segment
 * shipped one: six cards, `aria-pressed` on one of them, in the identical form as the three lists
 * above it. **It selected nothing.** Its `onPick` wrote `ViewerState.editingClassId`, which is
 * declared `presentation` in `scope/surface.ts` and is read by the machines *editor* to name its
 * draft — `shiftRunConfigOf` has never read it, and `scope.test.ts` requires the legs to stay
 * byte-identical when it moves. So the player moved a control, the run did not change, and the
 * screen looked right: § D219's defect, drawn as six cards.
 *
 * The fix is **not** to make it live, because there is nothing coherent for it to write: a machine
 * class is a fact about a **bank**, and the two surfaces that own it are the commissioning screen
 * (per bank, straight into the next run) and the building editor (one class across a building you
 * draw, behind its save). What this segment can honestly do is **report** —
 * {@link runningClassesOf} derives the classes the running building's cars are actually built to —
 * and **say that it reports**, which is § D227's rule pointed at a list instead of a slider.
 *
 * The deviation from R2 is deliberate, and the constraint that forced it is one the handoff's own
 * prototype did not have: its toy simulator gives a building one machine, and this one gives every
 * bank its own.
 *
 * ## KB-15
 *
 * The rail has one colour-bearing state — which card in a list is selected — and `dom.ts`'s
 * `pick` carries it as `aria-pressed` rather than as a class, so the selection is a fact a screen
 * reader has. The Machines segment therefore has **no** colour-bearing state and no `pick` at all:
 * a card that cannot be pressed may not carry the attribute that says which one is pressed. The
 * machine-class advisory leads with `⚠` when it fires, and reads as an ordinary sentence when it
 * does not.
 */

import {
  COST_TERMS_BY_ID,
  DECLARED_TERM_IDS,
  DispatchError,
  resolveDispatchConfig,
  type DispatcherProfile,
  type ElevatorSpecs,
  type ResolvedBuilding,
  type ResolvedDispatchConfig,
} from '@elevator-sim/core/browser';

import { CLOSED_FORM_ASSUMPTIONS } from '@elevator-sim/core/browser';

import { checkAccessCompatibility } from '../access/dispatcherCredentials.js';
import { upPeakBanksOf } from '../authoring/buildingSpec.js';
import { plainDescription, type MachineClass } from '../authoring/machineSpec.js';
import {
  PEAK_ORDER_INFO,
  patternSummary,
  specFromTrafficProfile,
  type PatternSpec,
} from '../authoring/patternSpec.js';
import type { VizRecording } from '../contract/types.js';
import type { ViewMode } from '../mode/types.js';
import { meansAreSuppressed } from '../frame/overlay.js';
import { commitmentOf } from '../scope/commitment.js';
import type { SurfaceKey } from '../scope/types.js';
import { statLineOf } from '../shift/contracts.js';

import type { BrowserResources } from './data.js';
import { resolveEdited } from './data.js';
import { buildingEditorSeedOf } from './buildingEditor.js';
import { el, fill, fillPlate, pick, plateRow, setHidden, setText, type PlateEntry } from './dom.js';
import type { RailElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import {
  allBuildingIds,
  allClasses,
  allDispatchers,
  buildingConfigOf,
  disclosureOf,
  profileById,
  withBuilding,
  withDispatcher,
  type SavedPattern,
  type ViewerState,
} from './state.js';

/**
 * What this mount owns: `Elements['rail']` and nothing else.
 *
 * An alias rather than a fresh interface, because the manifest in `dev/elementMap.ts` is already
 * the list of what the page must contain and a second declaration of the same twenty-three fields
 * would be a copy that can drift from it.
 */
export type RightRailElements = RailElements;

/* -------------------------------------------------------------------------- *
 * Dispatcher — § 1.4 R2, R3
 * -------------------------------------------------------------------------- */

/**
 * The family word beside a profile's name.
 *
 * `role` is the file's own word for it and eight of the thirteen shipped profiles carry one. The
 * other four are plain weighted-cost vectors with no role declared, and they get the engine's
 * name rather than an invented family: making one up here would be a taxonomy this repository
 * maintains in a renderer, which is where taxonomies go stale.
 */
export function dispatcherFamilyOf(profile: DispatcherProfile): string {
  return profile.role ?? profile.engine ?? 'weighted cost';
}

/**
 * The blurb under a profile's name in the list — **derived, for every profile, with no path by
 * which authored prose can reach a card.**
 *
 * ## Why `$comment` is not this string, and is not a shorter version of it either
 *
 * It used to be: the profile's own `$comment` when it had one, this derivation when it did not.
 * That is the defect § D163 clause 1's search found, and the report it produced was a *symptom*
 * rather than the fault. On a Vertical City run whose own summary refuses its mean, the
 * `destination-eta` card printed `no quotable AWT on 30 of 30` — an estimate cue and the run's
 * own refused `meanWaitS`, in one clause — so R3 fired. The `30` was a **replication count from
 * a different study on a different building**, and the collision was luck.
 *
 * The luck is the point. `$comment` is maintainer documentation: `destination-eta`'s is **5 082
 * characters** of seeds, `DECISIONS.md` ids, replication budgets and confidence intervals, and
 * **25 distinct numerals in it sit in a clause with an estimate cue**. Any run whose refused
 * `meanWaitS`, `wait95S` or `meanTimeToDestinationS` rounds to one of those twenty-five fires the
 * property, and no narrowing of the property can tell that numeral from a real leak — the text is
 * free-form, so there is nothing to narrow *against*. § D172 narrowed R3 five times, and every
 * one of those narrowings was a proof that a numeral **could not** be the quantity. None is
 * available here.
 *
 * And the collision is the smaller half. `AWT +0.295 [+0.154, +0.437]` on the card of the
 * dispatcher the reader has just run is a published interval from another building, another seed
 * and n = 150, printed with nothing to say so. Truncating it would not help: a truncated essay is
 * still an essay, and its first clause carries numerals too.
 *
 * ## So what a card says instead
 *
 * The weight vector, in the file's own vocabulary — the honest one-liner the three profiles with
 * no `$comment` already shipped, now the only mechanism. It cannot go stale, because it *is* the
 * configuration; it carries no estimate cue, so R3's textual half has nothing to match; and it is
 * bounded by the size of the term library rather than by an author's patience.
 *
 * Two shipped facts are not weights and still separate two profiles the vector cannot: the
 * `hardConstraints` list and the auction stage. Both are printed as the file declares them, the
 * way the term ids already are, rather than translated — a taxonomy maintained in a renderer is
 * the thing {@link dispatcherFamilyOf} refuses for the same reason. `rightRail.test.ts` asserts
 * **no two shipped profiles share a blurb**, so a future pair that collides is red rather than a
 * picker with two identical cards in it.
 *
 * A short authored player-facing blurb would be better copy than any of this, and the handoff
 * already writes one per dispatcher. That needs a new field in `data/dispatcher-profiles.json`;
 * `$comment` is not it and must not be made to be it.
 */
export function dispatcherBlurbOf(profile: DispatcherProfile): string {
  const weighted = weightedTermsOf(profile.weights);
  const head =
    weighted.length === 0
      ? 'no term weighted — every car prices the same'
      : `${String(weighted.length)} of ${String(DECLARED_TERM_IDS.length)} terms weighted; ` +
        `heaviest ${weighted
          .slice(0, 3)
          .map(([id, weight]) => `${id} ${weight.toFixed(2)}`)
          .join(', ')}`;
  const clauses = [head, ...mechanismClausesOf(profile)];
  return `${clauses.join('; ')}.`;
}

/* -------------------------------------------------------------------------- *
 * What a dispatcher does differently in the building — GitHub issues #100, #110
 * -------------------------------------------------------------------------- */

/**
 * The card as one register draws it: the line under the name, and what a disclosure reveals.
 *
 * Two fields rather than one string because the whole design is that **the registers swap places
 * rather than trade content** — see {@link dispatcherCardOf}.
 */
export interface DispatcherCard {
  /** The blurb under the profile's name in the list. */
  readonly sub: string;
  /** What `dom.ts#pick` puts behind the card's disclosure. */
  readonly help: string;
}

/**
 * One dispatcher's card, in the reader's register — GitHub issue
 * [#100](https://github.com/mrpeanut01/elevator-sim/issues/100) and
 * [#110](https://github.com/mrpeanut01/elevator-sim/issues/110).
 *
 * ## What was measured, and what the issues got wrong about it
 *
 * #100 says the cards *"show raw weighted-cost notation such as `cost = 1.00 times wait`"*. Driven
 * over all thirteen shipped profiles, **no card on this rail has ever printed that**: the string it
 * describes is `authoring/dispatcherSpec.ts#costFunctionLine`'s `cost = 1.00·wait + 0.30·starvation`,
 * which belongs to the dispatcher **editor**. Recorded as not reproduced rather than fixed here.
 *
 * #110's quotation is exact, and it is this file's:
 * *"Conventional collective / BASELINE / 1 of 13 terms weighted; heaviest waitTime 1.00; hard
 * constraint noDirectionReversal"*. Both halves of its complaint survived driving — the vocabulary
 * is the engine's identifiers, and **nowhere in the product does it say what a dispatcher does
 * differently to a queue** (§ D301 § 2's first named piece of work).
 *
 * The third finding is the one that decides the shape of the fix, and it is the opposite of
 * § D319's: the Day report could not be given a register because `DayReportInput` had no mode
 * field and `reportViewOf` took no mode parameter, so **no input could carry one**. Here the mode
 * was already in hand — `mountRightRail` has `state.mode` and has been passing it to
 * {@link buildingPlateOf} and `disclosureOf` for waves. Nothing structural was in the way. What
 * was in the way was that nobody had written the other register.
 *
 * ## Nothing is hidden, and nothing is added on one side only
 *
 * Both modes carry **both** strings; only which one is on the face and which one is behind the
 * disclosure moves. That is § D299 § 2 stated as an equality a test can run — `rightRail.test.ts`
 * requires `sub + help` to contain the vector blurb, the behaviour sentence *and* the profile id in
 * **both** registers, and pins Engineer's `sub` byte-for-byte against
 * {@link dispatcherBlurbOf} over every shipped profile. A change that made Casual read better by
 * trimming Engineer therefore goes red, which is § D299 § 1's test in the file it is about.
 *
 * It also means Engineer **gains** the behaviour sentence rather than being left with the vector,
 * which § D299 § 1 permits explicitly (*easier to use, never saying less*) and § D301 § 3 predicts:
 * a practitioner reading thirteen weight vectors wants *"only three of the thirteen cards here price
 * metres of travel added"* every bit as much as a newcomer does.
 *
 * #110's own recommendation — that the thirteen dispatchers *become* four or five play styles —
 * stays refused (§ D299 § 2, § D319). Thirteen cards, thirteen full weight vectors, one disclosure
 * away in either register.
 */
export function dispatcherCardOf(
  profile: DispatcherProfile,
  cards: readonly DispatcherProfile[],
  mode: ViewMode = 'advanced',
): DispatcherCard {
  const vector = dispatcherBlurbOf(profile);
  const behaviour = dispatcherBehaviourOf(profile, cards);
  const identity = `Profile id \`${profile.id}\`.`;
  return mode === 'basic'
    ? { sub: behaviour, help: `${vector} ${identity}` }
    : { sub: vector, help: `${behaviour} ${identity}` };
}

/**
 * What this dispatcher does differently in the building — **derived from its weight vector and from
 * the other cards on the list, never authored per id.**
 *
 * ## Why there is no sentence-per-dispatcher, and why an authored `blurb` field is not the fix
 *
 * {@link dispatcherBlurbOf}'s docstring ends by wishing for one: *"a short authored player-facing
 * blurb would be better copy than any of this … that needs a new field in
 * `data/dispatcher-profiles.json`"*. That wish is **withdrawn here rather than granted**, and the
 * reason is the one CLAUDE.md's invariant 7 exists for pointed one step further on.
 *
 * A per-id sentence in this module would be `if (strategy === 'nearest-car')` wearing prose. A
 * per-id sentence in `data/` would clear invariant 7 on a technicality and fail the thing invariant
 * 7 is *for*: a dispatcher's weight vector is the one object in this repository that a **search**
 * writes — Phase 7's optimizer emits weight vectors, `tuning/` emits weight vectors, and § D145's
 * learned arm emits weight vectors. Authored prose beside a searched vector is stale on the first
 * round it improves, and nothing would notice. `TrafficProfile.blurb` is the precedent for authored
 * copy and it is a precedent about a *pattern*, which nothing tunes.
 *
 * So every clause below is computed, and the vocabulary comes from the two places that already
 * declare it:
 *
 * | clause | source | goes stale when |
 * |---|---|---|
 * | which terms it ranks on | `profile.weights` | never — it *is* the vector |
 * | what a term means | `CostTermSpec.measures`, via `core`'s `COST_TERMS_BY_ID` | never — one row per term in `data/dispatcher-profiles.json → terms` |
 * | what it prices that the others do not | the `cards` argument | never — it is recomputed against the list on screen |
 * | the hard constraint, the auction, the pooling | the profile's own authored fields | never — `mechanismClausesOf`'s rule, and its reason |
 *
 * ## `serves` is deliberately not used, and the reason is a property rather than a preference
 *
 * `data/dispatcher-profiles.json → terms` gives every term a `serves` as well as a `measures`, and
 * `serves` is the more interesting half — *"AWT"*, *"WT95, % > 60s"*, *"TTD"*. Every one of those is
 * a token in `honesty/properties.ts#ESTIMATE_CUES`. A card that said *"serves AWT"* beside
 * *"only 3 of the 13 cards"* would be an estimate cue in the same clause as a small integer, and on
 * any run whose refused `meanWaitS` rounds to 3 or 13 that is R3's `suppressed-mean` — the
 * coincidence § D186 spent a whole lane on, manufactured on purpose. `measures` carries no cue.
 *
 * ## It is long on the cards that are complicated, and that is the choice rather than an oversight
 *
 * Measured over the shipped thirteen: 72 characters for `eta`, 203 for `collective`, and **668 for
 * `predictive-balanced`**, which weights ten of the thirteen terms. The obvious trim — name the
 * leaders on the face and put the rest behind the disclosure — was **refused**, on § D301 § 1:
 * subtraction is the default move for a casual mode and it is the one this product does not make.
 * The card is long because that dispatcher is complicated, and a card that hid nine tenths of what
 * a dispatcher weighs would be describing a simpler dispatcher.
 *
 * `docs/12` § 1.5 B1's *"casual gets a lever, not a lecture"* is not an argument against it and is
 * named here so the next reader does not have to re-decide: {@link nameplateVisibleIn}'s docstring
 * already scopes that clause to the `NAMEPLATE` plate — *"a door-dwell reference value and a jerk
 * limit are a lecture"* — which is reference data a run never touches. A dispatcher's own weight
 * vector is the thing the reader is choosing between.
 *
 * The length is **bounded by the term library** rather than by an author's patience, which is the
 * property {@link dispatcherBlurbOf} was rewritten to have: a reader's own profile weighting all
 * thirteen terms is the worst case and it is a known one.
 *
 * ## What this card still does not say, and why that is now a gap rather than a refusal
 *
 * This card names `noDirectionReversal` verbatim, under a sentence saying what a hard constraint
 * **is** — a filter no weight can buy past — which is true of every id including one this build has
 * never heard of. That used to be a *refusal*: the only prose `core` carried per constraint was
 * `dispatch/parameters.ts`'s 350-character optimizer-schema description, written under CLAUDE.md
 * invariant 8 for a search rather than for a person, and translating it in a renderer would be the
 * taxonomy {@link dispatcherFamilyOf} refuses two functions up for exactly this reason.
 *
 * **The refusal's ground is gone.** `core` now declares player-facing words beside the constraint —
 * `dispatch/types.ts#HARD_CONSTRAINT_WORDS`, surfaced on the schema row as
 * `DISPATCH_PARAMETERS['constraints.noDirectionReversal'].player` — which is the fix
 * [#147](https://github.com/mrpeanut01/elevator-sim/issues/147) asked for, in the place it named.
 * `everyday/workshopModel.ts#constraintCardsOf` reads them, with the honest fallback for a
 * constraint this build cannot name. This rail card does not read them **yet**, so #147 stays open
 * on the surface it names, and this paragraph is a gap with an owner rather than a sentence telling
 * the next reader not to try. Per § D227, a refusal is pinned by a run and never by another
 * sentence; when the ground under one moves, the sentence moves with it.
 */
export function dispatcherBehaviourOf(
  profile: DispatcherProfile,
  cards: readonly DispatcherProfile[],
): string {
  const weighted = weightedTermsOf(profile.weights);
  const sentences = [rankingSentenceOf(weighted)];
  sentences.push(...contrastSentencesOf(profile, weighted, cards));
  sentences.push(...mechanismSentencesOf(profile));
  return sentences.join(' ');
}

/**
 * What the scorer is trying to make small, in the term library's own English.
 *
 * **Half the heaviest weight** is the line between *what it ranks on* and *what it also prices*, and
 * it is a statement about an `argmin` rather than a rounding: weights apply to terms normalised into
 * `[0, 1]` (`data/dispatcher-profiles.json → normalization`, `required: true`), so a term at 0.10
 * against a 1.00 can move the winner only where the leaders are within a tenth of each other. Naming
 * it in the same breath as the leader would tell a player the two matter alike, and on
 * `capacity-aware` — 0.70, 0.20, 0.10 — they do not.
 *
 * The empty case is the one shipped profiles never reach and a reader's own can: a vector of zeros
 * scores every car identically, and `core`'s policy then decides by car id. Saying so is
 * {@link dispatcherBlurbOf}'s existing *"no term weighted — every car prices the same"* as a
 * sentence.
 */
function rankingSentenceOf(weighted: readonly (readonly [string, number])[]): string {
  const heaviest = weighted[0];
  if (heaviest === undefined) {
    return (
      'It puts weight on nothing at all, so every car costs it the same and the choice falls ' +
      'through to the group’s tie-break.'
    );
  }
  const leaders = weighted.filter(([, weight]) => weight >= heaviest[1] / 2);
  const rest = weighted.slice(leaders.length);
  const tail =
    rest.length === 0 ? '' : `, and more lightly on ${termList(rest.map(([id]) => id))}`;
  return `It ranks the cars on ${termList(leaders.map(([id]) => id))}${tail} — lowest wins.`;
}

/**
 * The clauses that answer *differently from what?* — computed against the list the reader is looking
 * at, never against a remembered one.
 *
 * `cards` is the rail's own `allDispatchers(...)`, so it carries the reader's saved profiles too and
 * *"of the 15 cards here"* counts fifteen cards that are really there. That is the whole reason the
 * peer set is a parameter instead of a constant: a count of *the shipped thirteen* would be a
 * sentence about a list nobody is looking at the moment somebody saves a fourteenth.
 *
 * Two clauses, and they are different questions rather than one question twice:
 *
 * 1. **A term it prices that few others do.** The rarest of its own weighted terms, emitted only
 *    when at most a third of the cards price it — the threshold is a third because a term half the
 *    list prices is not a distinguishing fact and a sentence claiming it were would be filler.
 * 2. **A term almost everything else prices and it does not.** `nearest-car` is the case this exists
 *    for: twelve of the thirteen shipped cards weight `waitTime` and it is the one that does not,
 *    which is the single most useful thing anyone can be told about it and which clause 1 cannot
 *    reach, because clause 1 only looks at terms the profile *has*.
 *
 * Both may fire, and on `nearest-car` both do. Neither fires for `eta`, whose whole character is
 * that it prices the ordinary thing and nothing else — and the sentence for that is the absence of
 * these two, plus {@link rankingSentenceOf}'s *"lowest wins"* with no tail.
 */
function contrastSentencesOf(
  profile: DispatcherProfile,
  weighted: readonly (readonly [string, number])[],
  cards: readonly DispatcherProfile[],
): readonly string[] {
  const total = cards.length;
  if (total < 2) return [];
  const priced = (id: string): number =>
    cards.filter((card) => (card.weights[id] ?? 0) !== 0).length;

  const sentences: string[] = [];

  const rarest = [...weighted]
    .map(([id]) => ({ id, count: priced(id) }))
    .sort((a, b) => a.count - b.count || a.id.localeCompare(b.id))[0];
  if (rarest !== undefined && rarest.count * 3 <= total) {
    sentences.push(
      rarest.count === 1
        ? `Of the ${String(total)} cards here it is the only one that prices ${termName(rarest.id)}.`
        : `Of the ${String(total)} cards here only ${String(rarest.count)} price ` +
          `${termName(rarest.id)}, and this is one.`,
    );
  }

  const missed = DECLARED_TERM_IDS.map((id) => ({ id, count: priced(id) }))
    .filter(({ id, count }) => count * 2 > total && (profile.weights[id] ?? 0) === 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))[0];
  if (missed !== undefined) {
    const without = total - missed.count;
    sentences.push(
      without === 1
        ? `It is the only card here that puts no weight on ${termName(missed.id)} at all.`
        : `It is one of only ${String(without)} cards here that put no weight on ` +
          `${termName(missed.id)} at all.`,
    );
  }
  return sentences;
}

/**
 * A term id as the library describes it, or as itself when the library does not carry it.
 *
 * `CostTermDefinition.measures` mirrors `data/dispatcher-profiles.json → terms[].measures` — `core`
 * pins the two together in both directions (`policy.test.ts`) — so this is the data file's own
 * English reaching a card without a renderer re-authoring it.
 *
 * The fallback is not decoration. `DECLARED_TERM_IDS` is deliberately a *superset* of the
 * implemented terms so that *"declared but pending"* and *"not a term at all"* stay different
 * things; a pending term has no `CostTermDefinition` and therefore no `measures`. It is empty today
 * and the branch is reachable the day it is not, and a card that silently dropped a weighted term
 * would be describing a dispatcher nobody configured.
 */
function termName(id: string): string {
  const measures = COST_TERMS_BY_ID.get(id)?.measures;
  if (measures === undefined) return `\`${id}\``;
  // Only the first character, and only when the second is not also upper case: `measures` strings
  // are sentences in the data file and are being spliced mid-sentence here, but a term whose
  // description opened on an acronym must not be lower-cased into a different word.
  const second = measures[1] ?? '';
  return second !== second.toLowerCase()
    ? measures
    : `${(measures[0] ?? '').toLowerCase()}${measures.slice(1)}`;
}

/** `a`, `a and b`, `a, b and c` — the Oxford-free join the rest of this file uses. */
function termList(ids: readonly string[]): string {
  const names = ids.map(termName);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * The declared behaviour a weight vector cannot carry, as sentences.
 *
 * The same four authored facts {@link mechanismClausesOf} lists, plus the pooling branch, said in
 * full rather than as a semicolon-separated tail. It reads the profile **as authored** for
 * {@link mechanismClausesOf}'s stated reason — nothing here invents a description, so nothing here
 * can be wrong about the code — with the consequence that a profile relying on a stage default
 * contributes no sentence about it. That is the honest direction: the default is what every other
 * card does too, so it is not something this one does differently.
 *
 * The pooling clause is the one this function has that {@link mechanismClausesOf} does not, and it
 * is here because it is the **third** fact of the kind that docstring names — *"two shipped facts
 * are not weights and still separate two profiles the vector cannot"*. It is a third:
 * `destination-eta` and `destination-panel` weight the same two terms and differ in the building by
 * whether the landing panel names a car. Without it the two cards differ only in the order two
 * identical weights sort in, which is a distinction no player can act on. The two renderings come
 * off one branch — see {@link poolingReadingOf} — so the plate row and this sentence cannot come to
 * disagree about which case a profile is in.
 */
function mechanismSentencesOf(profile: DispatcherProfile): readonly string[] {
  const sentences: string[] = [];
  const constraints = [...(profile.hardConstraints ?? [])].sort((a, b) => a.localeCompare(b));
  if (constraints.length > 0) {
    sentences.push(
      `Before any of that it throws out every car the hard rule${constraints.length === 1 ? '' : 's'} ` +
        `${constraints.map((id) => `\`${id}\``).join(' and ')} rule${constraints.length === 1 ? 's' : ''} ` +
        'out — a filter, so no weight can buy past it.',
    );
  }
  const auction = profile.auction;
  if (auction !== undefined) {
    const rounds = auction.rounds ?? 1;
    sentences.push(
      `The cars bid for the call and the group takes the best bid — \`${auction.aggregation ?? 'central-argmin'}\`, ` +
        `over ${String(rounds)} bidding round${rounds === 1 ? '' : 's'} — rather than the group ` +
        'scoring them itself.',
    );
  }
  if (profile.eligibility?.enRouteDiversion === true) {
    sentences.push('A car already on its way will stop for a call it is about to fly past.');
  }
  const pooling = poolingReadingOf(
    profile.dispatch?.passengerAssignment ?? 'none',
    profile.dispatch?.assignmentMode ?? 'single-car',
    profile.dispatch?.splitThresholdPassengers ?? 0,
  ).sentence;
  if (pooling !== undefined) sentences.push(pooling);
  return sentences;
}

/**
 * The declared behaviour a weight vector cannot carry, in the file's own words.
 *
 * Only fields `DispatcherProfile` types and `data/dispatcher-profiles.json` actually authors:
 * ids out of `hardConstraints`, and the auction stage's `aggregation` and `rounds`. Nothing here
 * invents a description, so nothing here can be wrong about the code — and a value this renderer
 * has never heard of prints as itself rather than as a default sentence about it.
 */
function mechanismClausesOf(profile: DispatcherProfile): readonly string[] {
  const clauses: string[] = [];
  const constraints = profile.hardConstraints ?? [];
  if (constraints.length > 0) {
    clauses.push(
      `hard constraint${constraints.length === 1 ? '' : 's'} ${[...constraints].sort((a, b) => a.localeCompare(b)).join(', ')}`,
    );
  }
  const auction = profile.auction;
  if (auction !== undefined) {
    const rounds = auction.rounds ?? 1;
    clauses.push(
      `${auction.aggregation ?? 'central-argmin'} over ${String(rounds)} bidding round${rounds === 1 ? '' : 's'}`,
    );
  }
  // **The clause that keeps `collective` and `collective-enroute` distinguishable.** The two are
  // the same weight vector under the same hard constraint and differ only in whether a moving car
  // may be cut short to take a call it is about to fly past (`DECISIONS.md` § D205) — so without
  // this the rail printed one sentence for two dispatchers, and `rightRail.test.ts`'s "tells every
  // shipped profile apart" is what said so. A behaviour a weight vector cannot carry is exactly
  // what this function is for.
  if (profile.eligibility?.enRouteDiversion === true) {
    clauses.push('stops en route for calls it passes');
  }
  return clauses;
}

/** `n of m · family` — the eyebrow note, design `:924`. */
export function dispatcherNoteOf(
  profiles: readonly DispatcherProfile[],
  currentId: string,
): string {
  const index = profiles.findIndex((profile) => profile.id === currentId);
  const position = index === -1 ? 1 : index + 1;
  const current = index === -1 ? profiles[0] : profiles[index];
  const family = current === undefined ? 'unknown' : dispatcherFamilyOf(current).toLowerCase();
  return `${String(position)} of ${String(profiles.length)} · ${family}`;
}

/**
 * The eight-row `SCHEDULE` plate — design `:2596–2612`, re-sourced.
 *
 * Every row below the second is read off the **resolved** configuration. The design reads four of
 * them off an authored `flags` object, which is the shape of defect this file's docstring names:
 * `parkingStrategy` defaults to `stay`, `assignmentMode` to `single-car` and
 * `maxLoadFactorForAssignment` to `1`, so a profile that declares none of them still *has* all
 * three, and a plate reading the authored object would print nothing about any of them.
 *
 * A profile this engine refuses — an unknown weight, an engine it does not implement — has no
 * resolved configuration to describe, and the plate says exactly that rather than falling back to
 * defaults it would not run with. `credentialCapabilityOf` takes the same line for the same reason.
 *
 * ## The two registers — GitHub issue #100
 *
 * **Every `k` and every `v` is byte-identical in both modes, and only the `help` moves.** That is
 * {@link buildingPlateOf}'s pattern six functions down, adopted here rather than re-argued, and it
 * is what lets `rightRail.test.ts` state *Casual removes nothing* as a string equality over the rows
 * instead of as a paragraph. A plate is a table of measured facts; the vocabulary problem is in the
 * *explanation*, and the explanation is exactly what `help` is.
 *
 * The Casual lead obeys `mode/disclosure.ts`'s three rules the way § D71's does: it **restates no
 * number**, it **makes no claim the source does not**, and the engineer's sentence follows it
 * **verbatim**. Four rows take one — the four that carry a vocabulary a reader would have to already
 * have. `profile` and `family` are a name and a word, and get none.
 */
export function dispatcherPlateOf(
  profile: DispatcherProfile,
  mode: ViewMode = 'advanced',
): readonly PlateEntry[] {
  /* {@link buildingPlateOf}'s own helper, in the same words, for the same reason. */
  const lead = (casual: string, sentence: string): string =>
    mode === 'basic' ? `${casual} ${sentence}` : sentence;
  let resolved: ResolvedDispatchConfig;
  try {
    resolved = resolveDispatchConfig(profile);
  } catch (error) {
    if (!(error instanceof DispatchError)) throw error;
    return [
      { k: 'profile', v: profile.name },
      { k: 'family', v: dispatcherFamilyOf(profile) },
      { k: 'refused', v: 'this engine will not build it', help: error.message },
    ];
  }

  const weighted = [
    ...weightedTermsOf(Object.fromEntries(resolved.weights)),
    ...weightedTermsOf(Object.fromEntries(resolved.pendingWeights)),
  ].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const heaviest = weighted
    .slice(0, 3)
    .map(([id, weight]) => `${id} ${weight.toFixed(2)}`)
    .join(' · ');

  const eligibility = resolved.eligibility;
  const dispatch = resolved.dispatch;
  const zoneAffinity = resolved.weights.get('zoneAffinity') ?? 0;

  return [
    { k: 'profile', v: resolved.name },
    { k: 'family', v: dispatcherFamilyOf(profile) },
    {
      k: 'terms weighted',
      v: `${String(weighted.length)} of ${String(DECLARED_TERM_IDS.length)}`,
      /*
       * The count was the word **twelve**, spelled out, against a value that has read `1 of 13`
       * since the thirteenth term landed. Prose about a number, wrong about the number, on the row
       * that prints it — this repository's own recurring defect, found by driving this plate rather
       * than by reading it. It is derived now, so the sentence and the value move together.
       */
      help: lead(
        'A dispatcher scores every car and sends the cheapest. These are the things it is allowed ' +
          'to count.',
        `The cost-term library declares ${String(DECLARED_TERM_IDS.length)} terms; this counts the ` +
          'ones this profile gives a non-zero weight. A term weighted zero reaches the scorer and ' +
          'changes no decision.',
      ),
    },
    {
      k: 'heaviest',
      v: heaviest === '' ? 'none' : heaviest,
      help: lead(
        'What it cares about most, and by how much against the rest.',
        'The three largest weights, as authored. Weights are applied to normalised terms, so ' +
          'they are comparable with one another and carry no unit.',
      ),
    },
    {
      k: 'load sensor',
      v: loadSensorPhrase(
        eligibility.maxLoadFactorForAssignment,
        resolved.answer.allowBypassIfSoleEligibleCar,
      ),
      help: lead(
        'How full a car has to be before the group stops sending it to new calls.',
        '`eligibility.maxLoadFactorForAssignment` — the group\'s own load filter, which is not ' +
          "the car's bypass threshold. At 1.0 it is inert and the car's load cell is the only filter.",
      ),
    },
    {
      k: 'pooling',
      v: poolingReadingOf(
        dispatch.passengerAssignment,
        dispatch.assignmentMode,
        dispatch.splitThresholdPassengers,
      ).short,
      help: lead(
        'Whether one call gets one car, or a crowded landing gets more than one.',
        '`dispatch.passengerAssignment` and `dispatch.assignmentMode`. A landing panel pools by ' +
          'destination; `split-demand` sends a second car to a landing deeper than the threshold.',
      ),
    },
    {
      k: 'zoning',
      v:
        zoneAffinity > 0
          ? `zone affinity weighted ${zoneAffinity.toFixed(2)}`
          : 'none — the group is undivided',
      help: lead(
        'Whether cars are given their own patch of the building to look after.',
        'Operational zoning is the `zoneAffinity` cost term, not a building fact. Service zoning ' +
          "is the bank's `servesFloors` and access zoning is the credential; the three are distinct.",
      ),
    },
    {
      k: 'parking',
      v: PARKING_WORDS[resolved.idle.parkingStrategy] ?? resolved.idle.parkingStrategy,
      help: lead(
        'Where a car waits when nobody has called it.',
        '`idle.parkingStrategy` — where a car with nothing to do goes.',
      ),
    },
  ];
}

const PARKING_WORDS: Readonly<Record<string, string>> = Object.freeze({
  stay: 'stays where it stopped',
  lobby: 'returns to the lobby',
  'zone-center': 'centre of its zone',
  'predicted-demand': 'where demand is forecast',
});

function loadSensorPhrase(maxLoadFactor: number, soleEligibleOverride: boolean): string {
  const base =
    maxLoadFactor >= 1
      ? 'the car’s own bypass only'
      : `no car above ${(maxLoadFactor * 100).toFixed(0)}% load`;
  return soleEligibleOverride ? `${base} · sole-eligible override on` : base;
}

/** The pooling case, in the plate's words and in a card's. */
interface PoolingReading {
  /** The plate's value cell — byte-identical in both registers, as every `v` on that plate is. */
  readonly short: string;
  /**
   * What it does to a landing, as a sentence, or `undefined` for the case that does nothing.
   *
   * `none` is the default every other card also has, so it is not something *this* card does
   * differently and {@link dispatcherBehaviourOf} says nothing about it — the same direction
   * {@link mechanismSentencesOf} takes with every unstated stage default.
   */
  readonly sentence: string | undefined;
}

/**
 * Which of the three pooling cases a resolved configuration is in — **decided once, rendered twice.**
 *
 * The plate row and the Casual card's mechanism sentence both need this branch, and two copies of it
 * is the shape § D227 names: a row saying *split above 12 waiting* beside a sentence that had drifted
 * into saying something else about the same profile. One function, two projections, and the
 * projections cannot disagree about the case because there is one `if`.
 */
function poolingReadingOf(
  passengerAssignment: string,
  assignmentMode: string,
  splitThreshold: number,
): PoolingReading {
  if (passengerAssignment === 'panel') {
    return {
      short: 'by destination, at the panel',
      sentence:
        'Riders say which floor they want at the landing, so a queue here is people waiting for ' +
        'the car they were promised rather than for whichever one turns up.',
    };
  }
  if (assignmentMode === 'split-demand') {
    return {
      short: `split above ${String(splitThreshold)} waiting`,
      sentence:
        `Once more than ${String(splitThreshold)} people are waiting at one landing it sends a ` +
        'second car there rather than making them all fit in one.',
    };
  }
  return { short: 'none', sentence: undefined };
}

/** Term ids with a non-zero weight, heaviest first, ties by id so the order is stable. */
function weightedTermsOf(
  weights: Readonly<Record<string, number>>,
): readonly (readonly [string, number])[] {
  return Object.entries(weights)
    .filter(([, weight]) => weight !== 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/* -------------------------------------------------------------------------- *
 * Traffic — § 1.4 R3
 * -------------------------------------------------------------------------- */

/**
 * The arrival pattern in the units a traffic study is written in.
 *
 * The design's plate names a first and a second peak at authored clock times. There is no
 * sixteen-hour day here to hang them on (`docs/12` § 4.1) and inventing one would be a schedule
 * the demand underneath does not have, so the rows are the engine's own parameters instead: the
 * peak rate, how long it holds, the batch mean and the interfloor share. Each carries the field
 * it is read from, so a reader can check the claim against `authoring/patternSpec.ts`.
 *
 * `population` is the **resolved** building's, which is the grown one the day is run against, and
 * is `undefined` before a building resolves rather than `0`.
 */
export function trafficPlateOf(
  spec: PatternSpec,
  population: number | undefined,
): readonly PlateEntry[] {
  const order = PEAK_ORDER_INFO[spec.order];
  return [
    { k: 'pattern', v: spec.name },
    { k: 'peak order', v: order.label, help: order.note },
    {
      k: 'peak rate',
      v: `${spec.ratePctPop5min.toFixed(1)} %pop/5 min`,
      help:
        '`demand.arrivalRatePctPop5min` — arrivals at the peak as a percentage of population ' +
        'every five minutes. The day’s event may scale it; see TODAY’S SHIFT.',
    },
    {
      k: 'peak holds',
      v: `${String(Math.round(spec.peakWindowS))} s`,
      help: '`demand.peakWindowS`, which is also the reporting window under `rise-and-fall`.',
    },
    {
      k: 'group size',
      v: `${spec.batchMean.toFixed(1)} people`,
      help:
        '`batchSize.mean`. Passengers arrive in batches, not one at a time; batch size changes ' +
        'loading and stopping more than the mean rate does.',
    },
    {
      k: 'interfloor',
      v: `${String(Math.round(spec.interfloorShare * 100))}% of trips`,
      help: 'The `interfloor` component of `demand.directionalSplit` — trips that never touch an entrance.',
    },
    {
      k: 'population',
      v: population === undefined ? 'no building resolved' : `${grouped(population)} people`,
      help: 'The resolved building’s own total, grown to today. The rate above is a share of it.',
    },
    {
      k: 'measured on',
      v: 'observed calls only',
      help:
        'Every figure this viewer reports about a run is a count of something that happened. ' +
        'Nothing on this plate is modelled from a nominal round trip.',
    },
  ];
}

/* -------------------------------------------------------------------------- *
 * Building — § 1.4 R3
 * -------------------------------------------------------------------------- */

/**
 * The specification rows — Barney/CIBSE closed form, per bank, **labelled as a specification**.
 *
 * ## The rule this obeys rather than breaks
 *
 * `docs/21` L-3 states the plate's governing rule: *a plate never computes a round trip; it reads
 * one off the run, or it says there is no run.* This function computes a round trip. The rule
 * survives because of what it was protecting against, which the sentence it replaces says in full:
 * *"a nominal figure printed beside measured ones is an invitation to compare them, which is
 * exactly the comparison a single run cannot support."*
 *
 * Three things keep that true here, and all three are structural rather than promised:
 *
 * 1. **The basis is on the row.** Every key below carries `closed form`, and the block opens with a
 *    row whose value *is* the label — `a specification, not a measurement` — and whose help cites
 *    `CLOSED_FORM_ASSUMPTIONS` by count and by name. A reader cannot meet one of these figures
 *    without meeting its basis.
 * 2. **It never substitutes for the measured arm.** {@link buildingPlateOf} draws `no run yet`
 *    exactly as it always did, and these rows appear underneath it — a specification needs no run,
 *    and saying so is not the same as filling the measured row's hole with an estimate.
 * 3. **The two never share a cell or a tone.** Separate rows, separate keys, and the measured pair
 *    is above the specification pair in reading order, so the headline stays the thing that
 *    happened.
 *
 * ## What it puts on screen, which is the correctness oracle
 *
 * `CLAUDE.md` § Correctness oracle: *under pure up-peak, simulated interval and handling capacity
 * must match the closed-form Barney/CIBSE round-trip-time calculation within a few percent.* That
 * has been a test since Phase 2 and has never been visible. It is now the two rows directly under
 * the two the run measured, on the same plate, on every building — so a divergence a reader can see
 * is a defect report, per that rule, rather than something only the suite could have caught.
 *
 * ## Warnings are not optional here
 *
 * `authoring/buildingSpec.ts#upPeakAnalysisOf` states it: *a figure shown without its warning is
 * this repository's named failure mode*, and the shipped buildings trip these — a second entrance
 * on Midtown Office, an express zone on Vertical City. Every sentence the analysis produced is
 * drawn, one row per warning, keyed to the bank it is about. None is summarised away.
 *
 * ## The engine is asked, never re-derived
 *
 * {@link upPeakBanksOf} is the existing seam — the same one the building editor's live readout uses
 * (`authoring/buildingSpec.ts:2342`, the non-test caller this row was modelled on) — so the `tp`
 * rule for building types the reference table has no row for, the per-code warning sentences and
 * the quoted refusal all have exactly one author. This function chooses which rows they go in.
 */
export function closedFormRowsOf(
  building: ResolvedBuilding,
  specs: ElevatorSpecs,
): readonly PlateEntry[] {
  const banks = upPeakBanksOf(building, specs);
  if (banks.length === 0) return [];
  const rows: PlateEntry[] = [
    {
      k: 'closed form',
      v: 'a specification, not a measurement',
      help:
        `Barney/CIBSE up-peak round trip, from the same \`analyzeUpPeak\` the correctness oracle ` +
        `holds the simulator to. It predicts a mean interval and a handling capacity under pure ` +
        `up-peak; it has no queueing model and no variance, so it cannot predict a wait at all. ` +
        `${String(CLOSED_FORM_ASSUMPTIONS.length)} simplifications are declared in ` +
        `\`CLOSED_FORM_ASSUMPTIONS\`, each with the direction it biases the round trip — the first ` +
        `is \`${CLOSED_FORM_ASSUMPTIONS[0]?.id ?? ''}\`. The rows above are what the run did.`,
    },
  ];
  const named = banks.length > 1;
  for (const bank of banks) {
    const suffix = named ? ` · ${bank.bankId}` : '';
    if (bank.figures === undefined) {
      rows.push({
        k: `closed form${suffix}`,
        v: 'refused',
        /* The thrown message verbatim — `bankAnalysisOf`'s own rule: it names the thing the model
           cannot fit, and a softer sentence would name less. */
        help: bank.refusal,
      });
      continue;
    }
    const figures = bank.figures;
    rows.push({
      k: `interval (closed form)${suffix}`,
      v: `${figures.intervalS.toFixed(1)} s`,
      help:
        `RTT / L over ${String(bank.carCount)} car${bank.carCount === 1 ? '' : 's'}, from a ` +
        `${figures.roundTripTimeS.toFixed(1)} s round trip ` +
        `(${figures.travelTimeS.toFixed(1)} s travelling, ${figures.stopTimeS.toFixed(1)} s ` +
        `stopping, ${figures.transferTimeS.toFixed(1)} s transferring). Compare it with the ` +
        `achieved interval above: under pure up-peak the two should agree within a few percent, ` +
        `and a visible divergence is a defect report rather than a curiosity.`,
    });
    rows.push({
      k: `capacity (closed form)${suffix}`,
      v:
        `${figures.handlingCapacity5Min.toFixed(1)} persons / 5 min · ` +
        `${figures.percentPopulation5Min.toFixed(1)}% of population`,
      help:
        `300·P/INT, against U = ${grouped(figures.servedPopulation)} — the population this bank ` +
        `lifts, which is not always the building's. A specification for a crowd that all wants to ` +
        `go up; the measured row above counts what the day's actual crowd got.`,
    });
    for (const [index, warning] of bank.warnings.entries()) {
      rows.push({
        k: `divergence${suffix}${bank.warnings.length > 1 ? ` ${String(index + 1)}` : ''}`,
        v: 'this building strays from the model',
        help: warning,
      });
    }
  }
  return rows;
}

/**
 * The consultant's traffic-analysis schedule, derived from the building and the run.
 *
 * The design's version computes a nominal round trip and derives an interval and a handling
 * capacity from it, **unlabelled and above the measured figures**. That is what is refused, and it
 * is the whole of what is refused: this simulator *measures* the last two, and a nominal figure
 * printed beside measured ones with nothing to tell them apart is an invitation to compare them as
 * if they were the same kind of claim — which is exactly the comparison a single run cannot
 * support.
 *
 * So the plate is in three halves, and the third is new (`docs/21` § 3.7 (1)). Above the line, five
 * facts about the building as resolved — none of which depends on a run. Then the two the run
 * produced, and **when there is no run the plate says so** rather than leaving the space or filling
 * it. Then the closed form, per bank, labelled *a specification, not a measurement* and carrying
 * its assumptions — see {@link closedFormRowsOf} for why that is L-3 preserved rather than L-3
 * broken, and why the specification is below the measurement rather than beside it.
 *
 * `specs` is optional and its absence is a **narrower plate, never a wrong one**: a caller with no
 * `ElevatorSpecs` in hand gets the two halves it always got. Optional rather than required because
 * this is an exported pure function with callers outside the rail, and a required argument would
 * have made every one of them find a copy of the machine library to draw a building fact.
 */
export function buildingPlateOf(
  building: ResolvedBuilding,
  recording: VizRecording | undefined,
  mode: ViewMode = 'advanced',
  specs?: ElevatorSpecs | undefined,
): readonly PlateEntry[] {
  /*
   * The plain-language lead — issue #71, and `mode/disclosure.ts`'s three rules applied to a plate
   * rather than to a figure: it **restates no number**, it **makes no claim the source does not**,
   * and the measured sentence follows **verbatim**. Only the two rows below the line take one,
   * because they are the two that carry a vocabulary — *handling capacity* and *achieved interval*
   * are lift-engineering terms, and the five above the line are floors, metres and people.
   */
  const lead = (casual: string, sentence: string): string =>
    mode === 'basic' ? `${casual} ${sentence}` : sentence;
  const heights = building.floors.map((floor) => floor.heightM);
  const rise = heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0;
  const cars = building.banks.flatMap((bank) => bank.cars);
  const entrance = building.entranceFloors[0];
  const aboveEntrance =
    entrance === undefined
      ? undefined
      : building.floors.filter((floor) => floor.index > entrance.index).length;

  const rows: PlateEntry[] = [
    {
      k: 'floors served',
      v:
        aboveEntrance === undefined
          ? String(building.floors.length)
          : `${String(building.floors.length)} (${String(aboveEntrance)} above the entrance)`,
      help: 'Expanded floors, so a building declared with `floorRanges` counts the same as one declared floor by floor.',
    },
    { k: 'travel height', v: `${rise.toFixed(1)} m`, help: 'Highest floor to lowest, by height above datum.' },
    { k: 'population', v: `${grouped(building.totalPopulation)} people`, help: 'Sum of the expanded floors’ populations, grown to today.' },
    {
      k: 'shafts',
      v: `${String(cars.length)} cars in ${String(building.banks.length)} bank${building.banks.length === 1 ? '' : 's'}`,
      help: 'A double-deck car is one car: it occupies one shaft.',
    },
    {
      k: 'car capacity',
      v: capacityPhrase(cars),
      help: 'Persons at rated load, and at the design load a traffic study actually sizes on.',
    },
  ];

  if (recording === undefined) {
    rows.push({
      k: 'measured',
      v: 'no run yet',
      help:
        'Handling capacity and interval are measured from a run, never computed from a nominal ' +
        'round trip. Run a shift and both appear here. The closed-form rows below are a ' +
        'specification and need no run, which is why they are there and this one is not.',
    });
    /*
     * The specification survives the refusal, and that is the point of labelling it. `no run yet`
     * is still the answer to *what did this building do*; the rows below answer *what was it sized
     * for*, which is a different question with an answer available before anybody presses Run.
     */
    return [...rows, ...(specs === undefined ? [] : closedFormRowsOf(building, specs))];
  }

  const summary = recording.summary;
  const capacity = summary.handlingCapacity;
  rows.push({
    k: 'handling capacity',
    v:
      capacity.pctPopulationPer5Min === null
        ? `${capacity.personsPer5Min.toFixed(1)} persons / 5 min`
        : `${capacity.pctPopulationPer5Min.toFixed(1)}% of population / 5 min`,
    help: lead(
      'Handling capacity is how many people the lifts actually moved in five minutes, set against ' +
        'how many turned up in the same five.',
      `Carried ${capacity.personsPer5Min.toFixed(1)} people every five minutes against ` +
        `${capacity.offeredPer5Min.toFixed(1)} arriving. A count, not an estimate.`,
    ),
  });

  const interval = summary.achievedInterval;
  if (meansAreSuppressed(recording)) {
    rows.push({
      k: 'achieved interval',
      v: 'withheld',
      help: lead(
        'The interval is the average wait between one car leaving the lobby and the next, and this ' +
          'run has not earned an average.',
        'A mean gap between departures is still a mean. This run does not clear the checks an ' +
          `average has to clear: ${summary.awtInvalidReason ?? 'the queues did not reach a steady state.'}`,
      ),
    });
  } else if (interval.meanS !== null) {
    rows.push({
      k: 'achieved interval',
      v: `${interval.meanS.toFixed(1)} s over ${String(interval.count)} gaps`,
      help: lead(
        'The interval is the average wait between one car leaving the lobby and the next.',
        'Mean spacing of car departures from the terminal. The gap count is carried because a ' +
          'mean over two gaps is a different claim from one over sixty.',
      ),
    });
  } else {
    rows.push({
      k: 'achieved interval',
      v: 'not reconstructed',
      help: 'Too few departures from the terminal in the window to fit a gap.',
    });
  }
  return [...rows, ...(specs === undefined ? [] : closedFormRowsOf(building, specs))];
}

type ResolvedCars = ResolvedBuilding['banks'][number]['cars'];

/**
 * `16 persons · 12 at design load`, or a range when the fleet is mixed.
 *
 * Both halves are stated because the second is the one a traffic study sizes on: cars fill to
 * 80 % of rated capacity, not 100 %, and a plate that printed only the nameplate figure would be
 * systematically optimistic in exactly the way CLAUDE.md's modelling rules name.
 */
function capacityPhrase(cars: ResolvedCars): string {
  if (cars.length === 0) return 'no cars';
  const persons = cars.map((car) => car.capacityPersons);
  const design = cars.map((car) => car.designCapacityPersons);
  const low = Math.min(...persons);
  const high = Math.max(...persons);
  const head = low === high ? `${String(low)} persons` : `${String(low)}–${String(high)} persons`;
  const designLow = Math.min(...design);
  const designHigh = Math.max(...design);
  const tail =
    designLow === designHigh
      ? `${String(designLow)} at design load`
      : `${String(designLow)}–${String(designHigh)} at design load`;
  return `${head} · ${tail}`;
}

/* -------------------------------------------------------------------------- *
 * Machines — § 1.4 R3, engineer only
 * -------------------------------------------------------------------------- */

/**
 * One machine class the running building actually has cars built to.
 *
 * Counts, speeds and ids — no sentence. The strings this becomes belong to the mount; the part
 * worth holding to account is the **decision**, which is *which classes is this building running,
 * and how much of it runs each*. See {@link runningClassesOf}.
 */
export interface RunningMachineClass {
  /** The `spec` its cars declare, present even when the class library carries no record of it. */
  readonly id: string;
  /** The class record, or `undefined` when nothing in the library carries {@link id}. */
  readonly machineClass: MachineClass | undefined;
  readonly cars: number;
  readonly speedMinMps: number;
  readonly speedMaxMps: number;
  /** The banks running it, in the building's own order, by name where a bank declares one. */
  readonly banks: readonly string[];
}

/**
 * What the running building is built to, ordered by how much of it runs each class.
 *
 * ## Why this is derived from the cars and not from a pointer
 *
 * The rail used to highlight `ViewerState.editingClassId`, and that field is seeded once at boot
 * from `classes[2]` — a positional index into `data/elevator-specs.json`, which is *Geared
 * traction*. `withBuilding` does not touch it. So the segment said **Geared traction** on every
 * building forever: on Garden Apartments, whose two cars are hydraulic; on Chancery House, whose
 * six are gearless; on Vertical City, whose sky-lobby shuttle is ultra high-speed. It also
 * disagreed with the building editor's own class chips, which have always read the building.
 *
 * A car carries its class on `ResolvedCar.spec`, so the question has an answer that cannot go
 * stale, and the answer is a **list**: four of the eight shipped buildings run more than one
 * class, and two of those four run both inside a single bank. Anything that reduced this to one
 * class would be inventing the reduction.
 *
 * Ordered by car count, descending, and `sort` is stable — so classes with the same count keep the
 * building's own bank order, and the first entry is the class most of the building is built to.
 * That is the one the `NAMEPLATE` describes, and the plate names it in its own first row rather
 * than leaving the choice implicit.
 */
export function runningClassesOf(
  building: ResolvedBuilding | undefined,
  classes: readonly MachineClass[],
): readonly RunningMachineClass[] {
  if (building === undefined) return [];
  const found = new Map<
    string,
    { cars: number; min: number; max: number; readonly banks: string[] }
  >();
  for (const bank of building.banks) {
    const label = bank.name ?? bank.id;
    for (const car of bank.cars) {
      const entry = found.get(car.spec) ?? {
        cars: 0,
        min: car.ratedSpeedMps,
        max: car.ratedSpeedMps,
        banks: [],
      };
      entry.cars += 1;
      entry.min = Math.min(entry.min, car.ratedSpeedMps);
      entry.max = Math.max(entry.max, car.ratedSpeedMps);
      if (!entry.banks.includes(label)) entry.banks.push(label);
      found.set(car.spec, entry);
    }
  }
  return [...found.entries()]
    .map(([id, entry]) => ({
      id,
      machineClass: classes.find((known) => known.id === id),
      cars: entry.cars,
      speedMinMps: entry.min,
      speedMaxMps: entry.max,
      banks: entry.banks,
    }))
    .sort((a, b) => b.cars - a.cars);
}

/**
 * A speed, or a band of them, in the two decimals the nameplate's own `rated speed` row uses.
 */
function speedPhrase(lowMps: number, highMps: number): string {
  return lowMps === highMps
    ? `${lowMps.toFixed(2)} m/s`
    : `${lowMps.toFixed(2)}–${highMps.toFixed(2)} m/s`;
}

/**
 * The sentence this panel carries in **every** state, including the states where nothing is wrong.
 *
 * § D227's rule, and it is the half that rule calls the more dangerous one inverted: a control that
 * writes nothing must say so. This segment draws no control at all now, which satisfies the rule
 * structurally and leaves a reader with the question the six cards used to answer wrongly — *then
 * where do I change the machine?* — so the sentence answers it, and names both surfaces that really
 * do write, in the words those surfaces use for themselves.
 *
 * Both destinations are pinned by `rightRail.test.ts` against the modules that author their labels,
 * so a screen renamed elsewhere turns this sentence red rather than leaving it pointing at nothing.
 * That is weaker than driving the menu and is stated rather than dressed up.
 *
 * ## The route was stale, and the pin is why nobody noticed
 *
 * It read *"Menu → Campaign"*. The row it names has been labelled **Scenarios** since GitHub issue
 * #97 — `menu/screens.ts`'s `main.campaign`, whose own comment records that *Campaign survives in
 * exactly one place now: the shift layer's own prose* — so this sentence has been sending readers to
 * a word that is not on the menu, on the screen [§ D300](../../../../DECISIONS.md) says #116 missed
 * **twice**. The paragraph above claimed the destinations were pinned, and they were: the pin held
 * the two **labels** and said nothing about the **route**, so the half that rotted was the half
 * nothing was watching. `rightRail.test.ts` now asserts the row label this route names, on the same
 * rule — a wayfinding claim is pinned by the thing it points at, never by another sentence.
 */
const MACHINES_ARE_REPORTED =
  'Nothing here is pickable, and that is deliberate: this panel reports the classes the running ' +
  'building’s cars are built to, and the choice is made on two other screens. Commission the ' +
  'building (Menu → Scenarios) sets one bank’s class and its rated speed, and reaches the next run ' +
  'with no save; the building editor sets one class and one speed across a whole building you ' +
  'draw, behind Save as a new building. The machine editor below authors a class — it does not ' +
  'decide which cars are built to it.';

/**
 * The `NAMEPLATE` plate. Engineer mode only — `#rail-nameplate-block` is hidden in casual (B1).
 *
 * The class record supplies the envelope; `data/elevator-specs.json`'s **file-level** `doors`,
 * `timing` and `loadSensor` blocks supply everything else, because those are shared by every
 * class and are not per-class fields — `authoring/machineSpec.ts` refuses to draw a slider for
 * them for the same reason.
 *
 * The design's footnote under this plate states the 80 % fill rule in prose. It is also a **row**
 * here, carrying `conventions.designLoadFactor` itself, because the prose is a claim about a
 * number in the data file and this repository has a documented history of prose that was wrong
 * about the code.
 */
export function nameplateOf(
  machineClass: MachineClass,
  specs: ElevatorSpecs,
): readonly PlateEntry[] {
  const doors = specs.doors;
  const timing = specs.timing;
  const sensor = specs.loadSensor;
  const fill80 = specs.conventions.designLoadFactor;
  const transfer = timing.passengerTransferS;

  return [
    { k: 'class', v: machineClass.name, help: machineClass.application },
    {
      k: 'rated speed',
      v: `${machineClass.speedMinMps.toFixed(2)}–${machineClass.speedMaxMps.toFixed(2)} m/s, typical ${machineClass.speedTypicalMps.toFixed(2)}`,
      help: 'A car outside the band is not a car of this class.',
    },
    {
      k: 'ride',
      v: `${machineClass.accelerationMps2.toFixed(2)} m/s² · ${machineClass.jerkMps3.toFixed(2)} m/s³`,
      help:
        'Acceleration and jerk are modelled, so a short hop never reaches rated speed. A ' +
        'simulator that ignored them would wrongly conclude faster lifts always help.',
    },
    {
      k: 'rated envelope',
      v: `to ${String(machineClass.maxRiseM)} m and ${String(machineClass.maxFloors)} floors`,
      help: 'Reference application guidance. `config/parse.ts` raises a warning past it and builds the bank anyway.',
    },
    {
      k: 'rated load',
      v: `${String(machineClass.loadMinLb)}–${String(machineClass.loadMaxLb)} lb`,
      help: 'The rated-load range this class is built in. Imperial, and the unit is in the name.',
    },
    {
      k: 'design load',
      v: `${(fill80 * 100).toFixed(0)}% of rated`,
      help:
        '`conventions.designLoadFactor`. Cars fill to this, never to the nameplate — using the ' +
        'nameplate is how a study ends up flattering.',
    },
    {
      k: 'doors',
      v: `centre ${doors.centerOpening.openS.toFixed(1)}/${doors.centerOpening.closeS.toFixed(1)} s · side ${doors.sideOpening.openS.toFixed(1)}/${doors.sideOpening.closeS.toFixed(1)} s`,
      help: 'Open and close times per door type, shared by every class.',
    },
    {
      k: 'dwell',
      v: `car call ${doors.dwellCarCallS.typical.toFixed(1)} s · hall call ${doors.dwellHallCallS.typical.toFixed(1)} s`,
      help: 'Hall dwell is longer: passengers have to walk to the car.',
    },
    {
      k: 'start & levelling',
      v: `${timing.motorStartDelayS.toFixed(1)} s · ${timing.levelingSettleS.typical.toFixed(1)} s`,
      help: 'Fixed costs outside the motion profile, paid on every stop.',
    },
    {
      k: 'transfer',
      v: `${transfer.office.toFixed(1)} / ${transfer.residential.toFixed(1)} / ${transfer.hotel.toFixed(1)} s`,
      help:
        'Seconds per passenger per direction, office / residential / hotel. The `2·P·tp` term of ' +
        'the round trip, and the term it is most sensitive to.',
    },
    {
      k: 'load sensor',
      v: `bypass at ${(sensor.hallCallBypassThreshold * 100).toFixed(0)}% · alarm at ${(sensor.overloadAlarmThreshold * 100).toFixed(0)}%`,
      help: 'Fractions of rated load at which the car stops answering hall calls and at which it will not start.',
    },
  ];
}

/**
 * Whether the `NAMEPLATE` block is on screen — § 1.4 R3 and § 1.5 B1.
 *
 * A function of one argument and it is still worth being one, because the alternative is a
 * comparison written inline in a DOM write, which is a decision no test in this repository can
 * reach. *Casual gets a lever, not a lecture*: a door-dwell reference value and a jerk limit are
 * a lecture.
 */
export function nameplateVisibleIn(mode: 'casual' | 'engineer'): boolean {
  return mode === 'engineer';
}

/**
 * Whether the running building sits inside the class's envelope — rise, floor count **and the
 * speed its cars actually run** — followed by {@link MACHINES_ARE_REPORTED}.
 *
 * **An advisory, and it says so.** `config/parse.ts` raises all three findings as *warnings* —
 * `rise-exceeds-class`, `floors-exceed-class`, `speed-outside-class-range`, the first of them
 * carrying *"the reference envelope is application guidance, not a hard limit"* — and builds the
 * bank anyway, so the run happens and its figures describe a machine outside its class. A line
 * here that said the loader refuses would be describing behaviour this project does not have.
 *
 * ## The speed clause, and why it was missing for so long
 *
 * The envelope was checked on rise and floor count and **never on speed**, so this line told a
 * reader that *"Chancery House is inside this class's envelope"* for Ultra high-speed — a class
 * banded 10.00–20.50 m/s — about a building whose cars run at 5.00. The plate two rows above
 * already said the opposite in as many words: *"A car outside the band is not a car of this
 * class."* The code now honours that sentence, and `config/parse.ts` was already honouring it.
 *
 * ## Which cars are measured, which is the part that can be got wrong quietly
 *
 * **The cars built to this class**, when the building has any — not every car in the building.
 * Four of the eight shipped buildings run more than one class (Crown Hotel and St Jude inside one
 * bank; Mixed-Use and Vertical City across banks), and measuring all of them against one class's
 * band raises a `⚠` on Vertical City about a sky-lobby shuttle that is correctly an ultra
 * high-speed car and correctly runs at 10 m/s. That would replace a false *inside the envelope*
 * with a false alarm, which is not an improvement. It also matches the loader, whose envelope
 * checks run *"once per class in the bank"* over the classes a bank actually uses.
 *
 * A class **no** car here is built to has nothing of its own to measure, so the building's own
 * cars are compared instead: that pair is not reachable from the panel any more — the class comes
 * from the cars now — but it is reachable from a caller, and answering *inside the envelope* about
 * a class the building does not run is the claim this function exists to stop making.
 */
export function machineWarningOf(
  machineClass: MachineClass,
  building: ResolvedBuilding | undefined,
): string {
  if (building === undefined) {
    return (
      'The class sets the speed band, the rise it can serve and the loads it is built in. ' +
      MACHINES_ARE_REPORTED
    );
  }
  const heights = building.floors.map((floor) => floor.heightM);
  const rise = heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : 0;
  const floors = building.floors.length;
  const over: string[] = [];
  if (rise > machineClass.maxRiseM) {
    over.push(
      `${rise.toFixed(0)} m of rise against a class rated for ${String(machineClass.maxRiseM)} m`,
    );
  }
  if (floors > machineClass.maxFloors) {
    over.push(
      `${String(floors)} floors against a class rated for ${String(machineClass.maxFloors)}`,
    );
  }
  const cars = building.banks.flatMap((bank) => bank.cars);
  const ofThisClass = cars.filter((car) => car.spec === machineClass.id);
  const measured = (ofThisClass.length > 0 ? ofThisClass : cars).map((car) => car.ratedSpeedMps);
  if (measured.length > 0) {
    const low = Math.min(...measured);
    const high = Math.max(...measured);
    if (low < machineClass.speedMinMps || high > machineClass.speedMaxMps) {
      over.push(
        `cars running at ${speedPhrase(low, high)} against a class banded ` +
          `${speedPhrase(machineClass.speedMinMps, machineClass.speedMaxMps)}`,
      );
    }
  }
  if (over.length === 0) {
    return (
      `${building.name} is inside this class's envelope. The class sets the speed band, the rise ` +
      `it can serve and the loads it is built in. ${MACHINES_ARE_REPORTED}`
    );
  }
  return (
    `⚠ ${over.join(', and ')}. That is an advisory rather than a refusal: the loader raises it as ` +
    'a warning and builds the bank anyway, so the run happens and the figures describe a machine ' +
    `outside its class. ${MACHINES_ARE_REPORTED}`
  );
}

/* -------------------------------------------------------------------------- *
 * The pattern list — § 1.4 R2
 * -------------------------------------------------------------------------- */

/** One selectable arrival pattern. `'building'` is the comparable default; see `PatternSelection`. */
export interface PatternOption {
  readonly id: string;
  readonly label: string;
  readonly tag: string;
  readonly sub: string;
  readonly help: string;
}

/**
 * `'building'`, then every shipped profile, then the reader's own.
 *
 * `'building'` is first and tagged `DEFAULT` because it is the only selection under which the
 * run's demand is the building's own `trafficProfile` — the demand every published figure in this
 * repository was measured under. Choosing anything else is choosing to leave the comparable case,
 * and the card says so rather than leaving a reader to find out from `DECISIONS.md`.
 *
 * ## A shipped profile's `help` is its authored `blurb`, and `$comment` may not stand in
 *
 * It used to be `profile.$comment` with a derived fallback — the identical route § D186 closed
 * for dispatcher cards, where the "comment" a card rendered was 5 082 characters of maintainer
 * documentation whose numerals collide with refused run figures. It stayed benign here only
 * because the one shipped traffic `$comment` happened to be 64 characters of player-safe copy;
 * nothing bounded the next authored paragraph. `TrafficProfile.blurb` is the field that exists
 * to be read (required, validated, capped at 160 characters by `core`'s schema), `$comment` is
 * maintainer documentation again, and `rightRail.test.ts` asserts the refusal in both
 * directions — the shipped file's comments never reach an option, and an adversarial comment
 * planted on every profile reaches none of the three rendered strings.
 */
export function patternOptionsOf(
  resources: BrowserResources,
  saved: readonly SavedPattern[],
  building: ResolvedBuilding | undefined,
): readonly PatternOption[] {
  const own =
    building === undefined
      ? undefined
      : resources.trafficProfiles.profiles.find(
          (profile) => profile.id === building.trafficProfile,
        );
  const options: PatternOption[] = [
    {
      id: 'building',
      label: own === undefined ? 'The building’s own profile' : own.name,
      tag: 'DEFAULT',
      sub: 'the demand every published figure in this project was measured under',
      help:
        'Runs the building’s declared `trafficProfile` with no demand override at all, rather ' +
        'than reconstructing its numbers and passing them back in.',
    },
  ];
  for (const profile of resources.trafficProfiles.profiles) {
    options.push({
      id: profile.id,
      label: profile.name,
      tag: profile.governingPeak,
      sub:
        `${profile.arrivalRatePctPop5min.typical.toFixed(1)} %pop/5 min · groups of ` +
        `${profile.batchSize.mean.toFixed(1)} · ` +
        `${String(Math.round(profile.directionalSplit.interfloor * 100))}% interfloor`,
      help: profile.blurb,
    });
  }
  for (const entry of saved) {
    options.push({
      id: entry.id,
      label: entry.spec.name,
      tag: 'YOURS',
      sub: patternSummary(entry.spec),
      help: 'A pattern you saved. Editing a shipped one never overwrites it.',
    });
  }
  return options;
}

/** The `PatternSpec` the current selection amounts to — the plate's input. */
export function selectedPatternSpecOf(
  resources: BrowserResources,
  state: ViewerState,
  building: ResolvedBuilding | undefined,
): PatternSpec {
  if (state.pattern !== 'building') {
    const saved = state.savedPatterns.find((entry) => entry.id === state.pattern);
    if (saved !== undefined) return saved.spec;
    return specFromTrafficProfile(resources.trafficProfiles, state.pattern);
  }
  return specFromTrafficProfile(resources.trafficProfiles, building?.trafficProfile);
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

/*
 * The sentence the three live segments carry — GitHub issue #104.
 *
 * Module-private, beside the control, on the precedent `dispatcherEditor.ts#RUN_THIS_COPY` sets and
 * for the reason its docstring gives: an exported string here would be a new player-facing prose
 * producer owing `honesty/surfaces.ts` an adapter, and this lane does not own that file. It reaches
 * the static sweep, which is weaker than being driven and is said rather than dressed up.
 *
 * **The issue's own wording is refused, and that is the point of the fix.** It asks for *locked for
 * this shift, changes apply to your next run*. Verified against this tree, no card on these three
 * panels is disabled while a shift plays: each `onPick` below writes and then calls
 * `context.runShift()`, and `dev/main.ts#runShift` builds a **new `Playback`** off the new
 * recording. So the card is not inert and it is not deferred — it is destructive, and *locked* is a
 * refusal a run refutes. § D227 rates that above a missing one.
 *
 * The playhead clause is the half a player actually loses something to, and it is the half the
 * report is describing from the other side: press a card thirty seconds into a queue building and
 * the queue is gone, because the day it was in is gone.
 */
const PICKS_RE_RUN =
  'The simulator runs the whole day before it plays any of it back, so picking a card here does ' +
  'not steer the shift on screen — it throws that day away and simulates a different one from the ' +
  'start. Nothing on this panel is locked while a shift plays: the run you are watching is ' +
  'replaced rather than paused, and the playhead goes back to the beginning with it.';

/**
 * Build the right rail. Nothing is drawn until {@link Panel.render} is called.
 *
 * ## Why the lists are keyed and not simply refilled
 *
 * `render` runs on every playback frame, and `fill` replaces a container's children. A list
 * rebuilt sixty times a second would move focus off whatever the reader was tabbing through and
 * drop the pointer's hover on every card — a keyboard user could not reach the fourth dispatcher
 * at all. So each container carries the signature of what it last drew and is rebuilt only when
 * that changes. It is a correctness measure with a performance side effect, not the other way
 * round.
 */
export function mountRightRail(ui: RightRailElements, context: MountContext): Panel {
  const doc = ui.root.ownerDocument;

  /** The last rendered view, for the one link whose press needs to read the stage. */
  let latest: ViewAt | undefined;

  /*
   * The four `Open … editor →` buttons. They move to a surface and (with one decided exception)
   * do nothing else — in particular they do not blindly seed the editors' working copies from the
   * rail's selection, because doing so would silently discard an unsaved edit the reader left on
   * that tab. The drawer they sit in closes as part of the navigation itself —
   * `dev/main.ts#openTab` owns that write (`docs/19` defect 6), so it is not repeated here.
   *
   * The exception is the building link — `docs/19` defect 11. With **no dirty draft** the editor
   * opened on whatever it last held (*EDITING — GARDEN APARTMENTS* over a Midtown stage), so the
   * link now seeds the staged building first, through `buildingEditorSeedOf`, whose docstring
   * carries the no-clobber rule this comment used to state and the three cases where it declines.
   */
  ui.openDispatcher.addEventListener('click', () => {
    context.openTab('dispatcher');
  });
  ui.openTraffic.addEventListener('click', () => {
    context.openTab('traffic');
  });
  ui.openBuilding.addEventListener('click', () => {
    const seed = latest === undefined ? undefined : buildingEditorSeedOf(latest);
    if (seed !== undefined) context.update(seed);
    context.openTab('building');
  });
  ui.openMachines.addEventListener('click', () => {
    context.openTab('machines');
  });

  /*
   * The scope note, written once at mount rather than on every render — GitHub issue #104.
   *
   * **Above the cards and not below them**, because it is the rule a reader needs *before* pressing
   * one, and a sentence under the list is an explanation of something already lost. It goes in this
   * mount rather than in `index.html` for the reason {@link commitmentOf}'s docstring gives: markup
   * cannot be derived from `scope/surface.ts`, and a hand-written sentence about what a control
   * does is the stale-refusal defect § D227 names.
   *
   * Nothing is drawn when a key stops being a control that runs the shift. That direction is
   * deliberate — an absent sentence is not a false one — and `scopeNotes.test.ts` drives this mount
   * and reads the note back out, which is what stops the absence becoming permanent.
   */
  const scopeNote = (list: HTMLElement, key: SurfaceKey): void => {
    if (commitmentOf(key, 'runs-the-shift') !== 're-runs-now') return;
    list.parentElement?.insertBefore(
      el(doc, 'p', { className: 'rail-prose', text: PICKS_RE_RUN }),
      list,
    );
  };
  scopeNote(ui.dispatcherList, 'viewer.dispatcherId');
  scopeNote(ui.trafficList, 'viewer.pattern');
  scopeNote(ui.buildingList, 'viewer.buildingId');

  const dispatcherList = keyedList(ui.dispatcherList);
  const trafficList = keyedList(ui.trafficList);
  const buildingList = keyedList(ui.buildingList);
  const machinesList = keyedList(ui.machinesList);
  const dispatcherPlate = keyedPlate(ui.dispatcherPlate);
  const trafficPlate = keyedPlate(ui.trafficPlate);
  const buildingPlate = keyedPlate(ui.buildingPlate);
  const machinesPlate = keyedPlate(ui.machinesPlate);

  return {
    render(view: ViewAt): void {
      latest = view;
      const { resources, state, recording, building } = view;

      /* ---- Dispatcher ---- */
      const profiles = allDispatchers(resources, state.savedDispatchers);
      const profile = profileById(resources, state.savedDispatchers, state.dispatcherId);
      setText(ui.dispatcherNote, dispatcherNoteOf(profiles, state.dispatcherId));
      dispatcherList(
        /*
         * The mode joins the signature — issue #100. `keyedList` rebuilds only when this string
         * moves, and both of a card's strings move with the register, so a rail that kept the old
         * key would go on drawing the engineer's cards after the toggle until something else
         * happened to change the list. Found by reading {@link mountRightRail}'s own docstring
         * about why the lists are keyed rather than by watching it fail — which is also the honest
         * account of the evidence: see {@link keyedPlate} for why neither key can be driven here.
         */
        `${state.mode}|${profiles
          .map((entry) => `${entry.id}${entry.id === state.dispatcherId ? '*' : ''}`)
          .join('|')}`,
        () =>
          profiles.map((entry) => {
            const card = dispatcherCardOf(entry, profiles, state.mode);
            return pick(doc, {
              title: entry.name,
              sub: card.sub,
              tag: dispatcherFamilyOf(entry).toUpperCase(),
              selected: entry.id === state.dispatcherId,
              help: card.help,
              onPick: () => {
                /*
                 * The whole transition, not the id — issue #65. `withDispatcher` takes the editor's
                 * working copy along while it is untouched, on `withBuilding`'s rule and for its
                 * reason: writing `dispatcherId` alone left the editor describing a profile nobody
                 * is running, under a card marked *selected*.
                 *
                 * A whole `ViewerState` **is** a `Partial<ViewerState>`, so this merges to exactly
                 * the state the transition returned. No new member on {@link MountContext}: a
                 * `replace` would be the one thing that seam's docstring forbids a panel — writing a
                 * state directly rather than asking for a change.
                 */
                context.update(withDispatcher(state, resources, entry.id));
                context.runShift();
              },
            });
          }),
      );
      dispatcherPlate(dispatcherPlateOf(profile, state.mode));
      setText(
        ui.accessNote,
        building === undefined
          ? ''
          : (checkAccessCompatibility({
              buildingName: building.name,
              floorIds: building.floors.map((floor) => floor.id),
              accessZones: building.accessZones,
              profile,
              profiles,
            }).warning ?? ''),
      );

      /* ---- Traffic ---- */
      const patterns = patternOptionsOf(resources, state.savedPatterns, building);
      const spec = selectedPatternSpecOf(resources, state, building);
      setText(ui.trafficNote, `${spec.ratePctPop5min.toFixed(1)} %pop/5 min`);
      trafficList(
        patterns.map((entry) => `${entry.id}${entry.id === state.pattern ? '*' : ''}`).join('|'),
        () =>
          patterns.map((entry) =>
            pick(doc, {
              title: entry.label,
              sub: entry.sub,
              tag: entry.tag.toUpperCase(),
              selected: entry.id === state.pattern,
              help: entry.help,
              onPick: () => {
                context.update({ pattern: entry.id });
                context.runShift();
              },
            }),
          ),
      );
      trafficPlate(trafficPlateOf(spec, building?.totalPopulation));

      /* ---- Building ---- */
      const buildingIds = allBuildingIds(resources, state.savedBuildings);
      setText(ui.buildingNote, buildingNoteOf(building));
      buildingList(
        buildingIds.map((id) => `${id}${id === state.buildingId ? '*' : ''}`).join('|'),
        () =>
          buildingIds.map((id) => {
            const card = buildingCardOf(resources, state, id);
            return pick(doc, {
              title: card.label,
              sub: card.sub,
              selected: id === state.buildingId,
              help: `Building id \`${id}\`.`,
              onPick: () => {
                /*
                 * `withBuilding`, not a `buildingId` patch — the same hole as the dispatcher card
                 * beside it, on the control where it costs the most. Writing the id alone skipped
                 * the week's move into (and out of) the building's scenario, left the fabric keyed
                 * by the previous building's bank ids (issue #46), and left both working copies on
                 * the building that is no longer running. `dev/main.ts`'s coach select has always
                 * called this function; this card is the other writer and did not.
                 */
                context.update(withBuilding(state, resources, id));
                context.runShift();
              },
            });
          }),
      );
      if (building === undefined) {
        buildingPlate([
          {
            k: 'building',
            v: 'not resolved',
            help: 'The schedule is derived from the resolved building; nothing has resolved yet.',
          },
        ]);
      } else {
        buildingPlate(
          buildingPlateOf(building, recording, state.mode, resources.elevatorSpecs),
        );
      }

      /*
       * ---- Machines ----
       *
       * The one segment with no `pick` in it, and no `context.update` either. See the module
       * docstring: the six cards it used to draw wrote `editingClassId`, which no run reads, so
       * what is drawn now is what the building is built to. Nothing in this block can change a
       * run, which is why it is the only one of the four that never calls `runShift`.
       */
      const running = runningClassesOf(building, allClasses(resources, state.savedClasses));
      const shownClass = running[0]?.machineClass;
      setText(ui.machinesNote, machinesNoteOf(building));
      const runningRows = runningRowsOf(running);
      machinesList(
        // The help is in the signature as well as the row, because it names the banks — two
        // buildings can run the same class in the same numbers and not in the same shafts.
        runningRows.map((row) => `${row.k} · ${row.v} · ${row.help ?? ''}`).join(' | '),
        () => [
          el(doc, 'div', {
            className: 'plate',
            children: runningRows.map((row) => plateRow(doc, row.k, row.v, row.help)),
          }),
        ],
      );
      // § 1.4 R3 / B1 — the nameplate is engineer-only. Casual gets a lever, not a lecture.
      const engineer = nameplateVisibleIn(disclosureOf(state.mode));
      setHidden(ui.nameplateBlock, !engineer);
      if (engineer && shownClass !== undefined) {
        machinesPlate(nameplateOf(shownClass, resources.elevatorSpecs));
      }
      setText(
        ui.machinesWarning,
        shownClass === undefined
          ? unknownClassNoteOf(building)
          : machineWarningOf(shownClass, building),
      );
    },
  };
}

/* ---- helpers the mount uses and nothing else does ---- */

interface BuildingCard {
  readonly label: string;
  readonly sub: string;
}

/**
 * A building's card, with its stat line generated from the building rather than authored
 * (`docs/12` § 4.4).
 *
 * A building the reader saved is resolved through the same door a shipped one goes through, so a
 * card cannot describe a building the runner would refuse. When it *is* refused the card says so
 * and names the refusal, which is the state the building editor exists to get the reader out of.
 */
function buildingCardOf(
  resources: BrowserResources,
  state: ViewerState,
  id: string,
): BuildingCard {
  const shipped = resources.entries.find((entry) => entry.config.id === id);
  if (shipped !== undefined) {
    return { label: shipped.resolved.name, sub: statLineOf(shipped.resolved) };
  }
  const config = buildingConfigOf(resources, state.savedBuildings, id);
  if (config === undefined) return { label: id, sub: 'not loaded' };
  try {
    return { label: `${config.name} · yours`, sub: statLineOf(resolveEdited(resources, config)) };
  } catch (error) {
    return {
      label: `${config.name} · yours`,
      sub: `does not resolve — ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildingNoteOf(building: ResolvedBuilding | undefined): string {
  if (building === undefined) return 'no building resolved';
  const cars = building.banks.reduce((total, bank) => total + bank.cars.length, 0);
  const inService = building.banks
    .flatMap((bank) => bank.cars)
    .filter((car) => car.mode === 'in-service').length;
  return inService === cars
    ? `${String(cars)} shafts in use`
    : `${String(inService)} of ${String(cars)} shafts in use`;
}

function machinesNoteOf(building: ResolvedBuilding | undefined): string {
  if (building === undefined) return 'no run yet';
  const speeds = building.banks.flatMap((bank) => bank.cars.map((car) => car.ratedSpeedMps));
  if (speeds.length === 0) return 'no cars';
  return `running at ${Math.max(...speeds).toFixed(2)} m/s`;
}

/**
 * The running classes as plate rows — the segment's list slot, in the rail's read-only component.
 *
 * A plate rather than cards, and the swap is the whole point: `pick` is a `<button>` carrying
 * `aria-pressed`, so a list of them promises a selection to a pointer, to a keyboard and to a
 * screen reader alike. Three of those promises were false here. The plate is what this rail
 * already uses for *facts about what is running*, and it makes no promise at all.
 *
 * A class the library cannot name still gets a row, under the `spec` its cars declare: the
 * building is running *something*, and a panel that dropped the row would be quieter about a
 * misconfiguration than about a working one.
 */
function runningRowsOf(running: readonly RunningMachineClass[]): readonly PlateEntry[] {
  if (running.length === 0) {
    // `buildingPlateOf`'s own answer to the same question, in the same words: a row that says
    // there is nothing yet, rather than an empty box a reader has to interpret.
    return [
      {
        k: 'machine class',
        v: 'not resolved',
        help: 'Read off the running building’s cars; nothing has resolved yet.',
      },
    ];
  }
  return running.map((entry) => ({
    k: entry.machineClass?.name ?? entry.id,
    v:
      `${String(entry.cars)} car${entry.cars === 1 ? '' : 's'} at ` +
      speedPhrase(entry.speedMinMps, entry.speedMaxMps),
    help: `${entry.banks.join(' · ')} — ${machineHelpOf(entry.machineClass)}`,
  }));
}

/** A class's own one-liner, or the sentence for a `spec` the class library does not carry. */
function machineHelpOf(machineClass: MachineClass | undefined): string {
  return machineClass === undefined
    ? 'no class of this id is loaded, so the nameplate below cannot describe these cars'
    : plainDescription(machineClass);
}

/**
 * The prose slot when no running car resolves to a class — before a building has resolved, and for
 * a car whose `spec` the library does not carry.
 *
 * The refusal is repeated here rather than skipped: the panel says what it is for in every state it
 * has, and *the one state where something is wrong* is the worst one to drop it in.
 */
function unknownClassNoteOf(building: ResolvedBuilding | undefined): string {
  const head =
    building === undefined
      ? 'No building has resolved yet, so there is no machine to describe.'
      : `${building.name} has no car this page can match to a machine class.`;
  return `${head} ${MACHINES_ARE_REPORTED}`;
}

/** Rebuild a list only when its signature changes. See {@link mountRightRail}'s docstring. */
function keyedList(host: Element): (key: string, build: () => readonly Node[]) => void {
  let last: string | undefined;
  return (key, build) => {
    if (key === last) return;
    last = key;
    fill(host, ...build());
  };
}

/**
 * The same, for a plate, keyed on the rows it would draw.
 *
 * **`help` is in the key, and leaving it out was a live defect.** The key was `k` and `v` only, and
 * {@link buildingPlateOf} has drawn its Casual lead into `help` since GitHub issue #71 — so toggling
 * the mode moved two rows' explanations and the plate, seeing the same keys and the same values,
 * drew nothing. A reader who switched to Casual kept the engineer's sentences until some *other*
 * change happened to move a value. Issue #100 puts a Casual lead on six more rows of the dispatcher
 * plate, which is how this surfaced; the building plate has had it the whole time.
 *
 * {@link mountRightRail}'s docstring calls the keying *"a correctness measure with a performance
 * side effect, not the other way round"*. A key missing a field the renderer reads is that sentence
 * inverted.
 *
 * **This is not driven.** `mountRightRail` is DOM-bound and on `honesty/derive.test.ts`'s
 * undriven-mount list, and `dev/mountRecorder.test-helper.ts` reaches construction rather than
 * `render` — so nothing under Node can flip the toggle and read the plate back. What
 * `rightRail.test.ts` asserts instead is that this key **reads `help` at all**, over the module's
 * own source with comments stripped, which is the idiom the Machines segment's refusal is held to
 * three functions up. It is weaker than driving the mount and is said rather than dressed up.
 */
function keyedPlate(host: Element): (rows: readonly PlateEntry[]) => void {
  let last: string | undefined;
  return (rows) => {
    const key = rows
      .map((entry) => `${entry.k}\u0000${entry.v}\u0000${entry.help ?? ''}`)
      .join('\u0001');
    if (key === last) return;
    last = key;
    fillPlate(host, rows);
  };
}

/**
 * `1710` → `1,710`.
 *
 * Hand-rolled rather than `toLocaleString`, for the reason `shift/contracts.ts` gives about the
 * same job: a locale-dependent separator makes the string depend on the machine the browser is
 * running on and on the machine a test runs on.
 */
function grouped(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
