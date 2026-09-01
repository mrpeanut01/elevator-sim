/**
 * The vocabulary of the honesty search: what a generated case is, what a rendered string is,
 * and what it means for one to assert something the run's own statistics refuse.
 *
 * ## Why this module exists
 *
 * [`DECISIONS.md` § D163](../../../../DECISIONS.md) clause 1 is Phase 9's load-bearing gate, and
 * it says why in its own words:
 *
 * > Across a generated sweep over (building × shipped dispatcher × seed × mode), **no
 * > player-facing string may assert something the run's own statistics refuse.** … every one of
 * > these rules is currently enforced by hand-written tests over hand-chosen cases. `fuzz/`
 * > exists because that is not the same as holding.
 *
 * So this directory is `packages/experiments/src/fuzz/` pointed at the experience layer rather
 * than at the simulator, and it is deliberately the *same* machinery: a case is a pure function
 * of one seed, a counterexample shrinks, a shrunk case is JSON-serializable and prints in full,
 * and every property has a deliberate fault in `faults.ts` that makes it fire. A property that
 * has never failed is a property that cannot fail.
 *
 * ## What it does **not** do
 *
 * It does not decide whether a mean is legitimate. `meansAreSuppressed(recording)` decides that,
 * and it is the shipped gate `frame/overlay.ts` already calls — R9's *"one source of truth for
 * 'may I show this'"*. Nothing here re-derives saturation, re-counts a sample, or re-implements
 * a suppression rule. Every property is a predicate over **rendered strings plus the statistics
 * the shipped code already computed**, and where the two disagree the statistics win.
 *
 * ## Determinism (CLAUDE.md invariants 2, 3 and 5)
 *
 * A {@link HonestyCase} is produced by `caseFromSeed` from one `honestySeed` and nothing else,
 * drawing only from a named stream on an injected `StreamSet`. There is no `Math.random()` in
 * this directory and no wall clock. A **shrunk** case is a hand-reduced neighbour of a generated
 * one and is therefore no longer seed-derivable, so {@link HonestyCase} is entirely
 * JSON-serializable and a counterexample prints in full — a finding nobody can replay is a
 * rumour.
 */

import type { WaitBandBasis } from '../live/types.js';

/* -------------------------------------------------------------------------- *
 * Properties
 * -------------------------------------------------------------------------- */

/**
 * The six properties § D163 clause 1 enumerates, each named by the rule of
 * [`docs/10`](../../../../docs/10-experience-layer-contract.md) § 1 it derives from — **and a
 * seventh, which is about *when* a string was said rather than about what it said, an eighth about
 * a cell a figure may not stand in, and a ninth about what a string is written *in*.**
 *
 * ## Why the ninth is here and not in a lint rule
 *
 * `CHARTER_PROGRAMME.md` § M2's third exit criterion is *"nothing on a player surface refers to a
 * section number, a source filename or a code identifier"*, and it says of itself that it *"is a
 * mechanical check and it is part of the gate"*. A gate with an instrument is a gate; a gate with
 * an opinion is a negotiation — and this one **fails today**: `ISSUE_VERIFICATION_FINDINGS.md` § N
 * counts six source files carrying it, which reach the player through **four** of this corpus's
 * surfaces. That is why the check is built before the strings are fixed rather than after — a gate
 * nobody has watched fail is a gate nobody has watched.
 *
 * It belongs in this corpus rather than in a source lint because the defect is about what a
 * **player reads**, not about what a file contains: the same sentence is fine in a docstring and
 * wrong on a screen, and the only list of what reaches a screen is `surfaces.ts`. A grep over
 * `src/` cannot tell those apart; this search already knows.
 *
 * Ordered as the decision lists them. Each is checked by one function in `properties.ts`, and
 * each has a fault in `faults.ts` that makes it fail.
 *
 * ## Why the seventh exists, and what it says about the first six
 *
 * `surfaces.ts#sampleTimes` has always driven every single-run surface at five playheads, and the
 * **first of them is `startedAt`**. So the left rail's *"All 34 people got where they were going"*,
 * published on a cold load before the shift had played a second, was in the corpus from the day the
 * corpus existed and **passed every one of the six** — because not one of them asks *at what
 * playhead*. R3 asks whether a mean is licensed, R13 whether an estimate carries its `n`, R11 what a
 * figure blends; a whole-day count drawn beside a clock reading 00:00 is licensed, carries its `n`,
 * blends nothing, and is a lie about the shift on screen.
 *
 * The rule it enforces is R6 — *"an outcome evaluated before the playhead reaches `endedAt` is a
 * preview"* — as [`DECISIONS.md` § D223](../../../../DECISIONS.md) keeps it on the Day report and
 * § D293 keeps it on the rail: the sheet whose figures are empty while you are watching, and the
 * mood card that withholds its four whole-run drivers and draws a retraction in their place. This
 * property is the claim that **every** surface obeys that rule, rather than the two that were
 * caught obeying it.
 *
 * An uncovered property that happens to pass is the shape this repository's standing requirement is
 * written about, which is why the axis was added after the defect was fixed rather than instead of
 * fixing it.
 *
 * ## Why the tenth is a different shape from the other nine, and had to be
 *
 * Nine of these are predicates over **one case's rendered strings**: they ask *is this surface
 * telling the truth about this run?* [`DECISIONS.md` § D359](../../../../DECISIONS.md) shipped a
 * defect that answers **yes** on both screens and leaves the product incoherent — `goalsForDay`
 * grew a horizon parameter, one of four callers passed it, and after a whole authored day the
 * Everyday rail graded the run against a 460 s worst-wait ceiling while the Engineer rail graded
 * the same run against 230 s. Each rail was internally honest. Nothing asked whether they agreed.
 *
 * § D359 also ruled out the cheap fix: a `horizon` axis on the sweep would drive each adapter over
 * both kinds of run and produce two internally-honest corpora, comparing neither. So
 * `surfaces-disagree` renders **one state through a declared pair** of shipped expressions and
 * compares one named figure. The pairs are declared with a reason in `agreement.ts#AGREED_FIGURES`,
 * and the figures that legitimately differ are declared too, in `#NOT_AGREED` — a pair inferred
 * from a name collision is not a contract, and a property weakened until it stopped firing on the
 * batch's two seed sets would be worse than no property at all.
 */
export const HONESTY_PROPERTIES = [
  /** R3 — no mean, percentile or time-to-destination is shown on a run whose summary refuses it. */
  'suppressed-mean',
  /** R2 — a claim that orders two dispatchers needs a resolved paired interval over the budget. */
  'single-run-comparative',
  /** R10 — no word for how sure something is, anywhere a player reads. */
  'probability-word',
  /** R13 — every estimate carries its `n`, and no frequency invents a denominator. */
  'estimate-without-n',
  /** R11 — energy is an axis: no single figure blends it with a wait metric into a score. */
  'energy-wait-blend',
  /** R12 / § D160 — no goal is reported without the measured pass rate that makes it a goal. */
  'goal-without-rate',
  /** R6 / § D223 — no figure that can only be true of the whole run, at a playhead short of its end. */
  'whole-run-figure-early',
  /** § 12.2 / § 16 rules 1 and 15 — a withheld cell reads `—` or a label, never a zero or a leak. */
  'withheld-figure-published',
  /** The charter's M2 gate — no section number, source filename or code identifier where a player reads. */
  'internal-notation',
  /** `TEST_MATRIX.md` T1 / § D359 — two surfaces, one state, and one figure that means one thing. */
  'surfaces-disagree',
] as const;

export type HonestyProperty = (typeof HONESTY_PROPERTIES)[number];

/** One concrete failure: which property, what was wrong, and which string it was about. */
export interface HonestyViolation {
  readonly property: HonestyProperty;
  /** Human-readable, and specific enough to act on without re-running. */
  readonly message: string;
  /** The surface that produced the offending string, `<module>#<export>`. */
  readonly surfaceId: string;
  /** Which field of that surface's output, e.g. `figures[4].value`. */
  readonly field: string;
  /** The offending string, truncated for the report but never paraphrased. */
  readonly text: string;
}

/* -------------------------------------------------------------------------- *
 * Rendered text
 * -------------------------------------------------------------------------- */

/**
 * How much evidence stands behind a string.
 *
 * The distinction R2 turns on: a surface driven from **one** recording may say *"in this run, X
 * happened"* and may not order two dispatchers; a surface driven from a **batch** may, subject
 * to its interval and its `n`.
 *
 * `authored` is text a human wrote into `data/` (a stage brief). `schema` is text `core` wrote
 * into a `SearchParameter.description` and a viewer re-prints — the class `campaign/words.ts`
 * found the one probability word in.
 */
export type TextProvenance = 'single-run' | 'batch' | 'authored' | 'schema';

/**
 * What kind of claim a string makes, taken from the shipped surface's **own** classification
 * wherever it has one.
 *
 * `render/runSummary.ts` already splits its figures into `observation | estimate | suppressed |
 * absent`, and `batch/report.ts` already carries `verdict` and `favours`. An adapter copies
 * those; it never invents them. Where a surface has no classification of its own the string is
 * `prose`, and prose is checked by every property that can be checked without one.
 */
export type TextRole =
  /** A fact about the run that happened. Never suppressed. */
  | 'observation'
  /** A mean or a percentile — the class R3 gates and R13 requires an `n` beside. */
  | 'estimate'
  /** The word that *replaces* a refused estimate. R3: never a blank, never a zero. */
  | 'suppressed'
  /** The refusal's own words. Quotes numbers legitimately, so R3 exempts it and only it. */
  | 'reason'
  /** A claim that orders two arms, or declines to. R2. */
  | 'comparison'
  /** A goal's verdict or pass rate. R12. */
  | 'goal'
  /** A name, a unit, a heading. Carries no number of its own. */
  | 'label'
  /** Everything else a player reads. */
  | 'prose';

/**
 * **When** a string was said, and over what window its figures are folded — the temporal axis.
 *
 * ## The declaration is the surfaces', not this file's
 *
 * *"Is this figure whole-run?"* is not answerable from a string, and a harness that guessed it from
 * words would be judging a sentence it wrote itself. So {@link basis} is **copied** from whichever
 * shipped type already answers that question about the value in hand — and three of them do, all
 * spelling it with `live/types.ts`'s {@link WaitBandBasis} rather than a private union:
 *
 * | Declared by | On |
 * |---|---|
 * | `render/mood.ts#MoodDriver.basis` | each of the mood card's five drivers (§ D293) |
 * | `live/types.ts#WaitBands.basis` | the banding the bar and legend are read off |
 * | `live/types.ts#HonestyCard.basis` / `Mood.basis` | the honesty card and the card's face |
 *
 * A surface with no such declaration seeds {@link atS} and {@link endedAt} and leaves `basis`
 * `undefined`: it is still on the axis, and the *textual* half of the property — a whole-run count
 * printed beside a cue that names it, where the live count at that playhead is a different number —
 * is what reaches it. That is deliberate. The structural half asserts the gates the product already
 * has; the textual half is the one that can catch a surface which declares nothing.
 *
 * ## Why it is not called `window`
 *
 * `boundaries.test.ts` bans a bare `window` identifier anywhere outside `dev/`, *"precisely because
 * a local of that name shadowing the global is how a DOM reference hides"* — and it caught this
 * interface, which was called `TextWindow` with a `window` field for the length of one test run.
 * `properties.ts` already carries the same note about a local named `clause`, and `contract/types.ts`
 * carries `windowSeconds` for the same reason. The rule is worth more than the better noun.
 *
 * ## Why the playhead is carried rather than the fraction
 *
 * The rule is *short of `endedAt`*, and `dev/leftRail.ts#shiftIsOver` — the rail's own one home for
 * that decision — compares the two numbers. Carrying `atS < endedAt` as a boolean computed here
 * would be a second copy of that comparison, which is the failure `shiftIsOver`'s own docstring
 * exists to prevent.
 */
export interface TextPlayhead {
  /** The playhead this surface was driven at, simulated seconds. */
  readonly atS: number;
  /** The run's last instant, `recording.endedAt`. */
  readonly endedAt: number;
  /**
   * The surface's **own** answer to *over what window is this folded* — never inferred here.
   *
   * `undefined` means the surface makes no such declaration, which is a fact about the surface and
   * not a pass.
   */
  readonly basis?: WaitBandBasis | undefined;
}

/**
 * A cell standing where a figure the shell **may not publish** would be — the withheld matrix's
 * unit of observation (ENGINE_CONTRACT § 12.2).
 *
 * ## Why the adapter declares it rather than the property inferring it
 *
 * *"Is this cell one that must be withheld right now?"* is not answerable from the string. It is a
 * fact about the state the surface was driven in — which is why § 12.2 asks for an enumeration of
 * **states** rather than a scan of words — so the adapter that put the surface in the state is the
 * only thing that knows, and it says so here. `TextPlayhead` is declared the same way and for the
 * same reason.
 *
 * {@link ifPublished} is what makes the *stale figure* half decidable rather than a guess: the
 * adapter knows what the cell would have carried had the figure been available (the watched run's
 * share, the day's percentage), and a withheld cell carrying that numeral is a leak whatever words
 * surround it. An empty list is honest and common — many cells have nothing that could leak into
 * them — and it narrows this property to its other three clauses for that cell.
 */
export interface WithheldFigure {
  /** The combination this cell was drawn under — `generate.ts#WithheldState.id`. */
  readonly state: string;
  /** The reasons that withhold **this** cell, a subset of the state's. Never empty. */
  readonly because: readonly string[];
  /**
   * What the cell would carry if the figure were available — numerals that may not appear here.
   *
   * Rendered forms, not raw numbers, so the comparison is against what a reader would read.
   */
  readonly ifPublished: readonly string[];
}

/**
 * That this string is **one side of a declared pair** — `agreement.ts#AgreedFigure`'s unit.
 *
 * ## Why the reading is marked rather than matched by its words
 *
 * *"Are these two strings about the same figure?"* is not answerable from the strings, and a
 * harness that guessed it from a name collision would be inventing the contract it then enforced —
 * the one failure `agreement.ts#NOT_AGREED` exists to refuse. So the pairing is **declared**, and
 * the declaration travels on the reading, exactly as {@link WithheldFigure} and {@link TextPlayhead}
 * carry the two other facts a property may not infer.
 *
 * Marking the reading rather than comparing at render time is also what keeps this property
 * falsifiable in the way the other nine are: the comparison happens in `properties.ts` over the
 * same `RenderedText[]` every other check sees, so a `faults.ts` fault that corrupts one side fires
 * it — *a property that has never failed is a property that cannot fail*.
 */
export interface AgreementReading {
  /** The declared pair — `agreement.ts#AgreedFigure.id`. */
  readonly pair: string;
  /** The state both sides were driven over — `agreement.ts#AgreementView.id`. */
  readonly view: string;
  /** Which side of the pair this reading is. */
  readonly side: 'left' | 'right';
}

/** One string a player would actually see, with the structural facts the surface knows about it. */
export interface RenderedText {
  /** `<module>#<export>`, matching the ids `derive.ts` produces from the source tree. */
  readonly surfaceId: string;
  /** Which part of the surface's output this is. Specific enough to find by hand. */
  readonly field: string;
  readonly text: string;
  readonly role: TextRole;
  readonly provenance: TextProvenance;
  /**
   * The sample size the surface itself declared for this string, when it declared one.
   *
   * `undefined` means *"this surface does not report a count for this string"*, which is what
   * R13 is about; `null` means *"the surface says the count is unavailable"*, which is not the
   * same fact.
   */
  readonly declaredCount?: number | null | undefined;
  /** Whether the count was printed in the same visual unit as the value. R13 clause one. */
  readonly countShown?: boolean | undefined;
  /** For a `comparison`: what the shipped report said about it. Copied, never re-derived. */
  readonly comparison?:
    | {
        readonly favours: string | null;
        readonly verdict: string;
        readonly pairs: number;
      }
    | undefined;
  /** For a `goal`: whether a measured pass rate was published beside it, and over how many seeds. */
  readonly goal?:
    | {
        readonly rateShown: boolean;
        readonly seeds: number;
      }
    | undefined;
  /**
   * For an `estimate` or `observation`: whether the quantity is an energy one.
   *
   * Taken from `BATCH_METRIC_CLASS` / the figure's own id, never guessed from the words — R11 is
   * a rule about what a figure *is*, and a renderer that stopped writing `kJ` would still be
   * blending the axis into a score.
   */
  readonly energyAxis?: boolean | undefined;
  /**
   * Whether this string carries one of the three quantities `summary.awtIsValid` speaks for.
   *
   * **The distinction R3 actually draws, and the one the first run of this search got wrong.**
   * `render/runSummary.ts` publishes ten figures and `meansAreSuppressed` decides *"exactly the
   * three figures `RunSummary.awtIsValid` speaks for"* — AWT, WT95 and time-to-destination. The
   * achieved **interval** is an estimate too and it is *not* one of them, so it is legitimately
   * drawn on a saturated run; a check that forbade every `estimate` on a suppressed run reported
   * it as a violation, which is the check being wrong rather than the figure.
   *
   * Set from the shipped figure ids (`AWT_ID`, `WT95_ID`, `TTD_ID`), never from a list of names
   * written here.
   */
  readonly gated?: boolean | undefined;
  /**
   * When this string was said, for a surface driven at a playhead. See {@link TextPlayhead}.
   *
   * `undefined` for a surface that has no playhead at all — a menu screen, an editor row, a batch
   * report. Those are outside the temporal axis because there is no clock for them to be early
   * against, which is a different fact from passing it.
   */
  readonly playhead?: TextPlayhead | undefined;
  /**
   * That this string stands in a **withheld** figure's place, and under which state. § 12.2.
   *
   * `undefined` for every string that is not one — which is nearly all of them, and is a different
   * fact from a cell that is withheld and honest about it. See {@link WithheldFigure}.
   */
  readonly withheld?: WithheldFigure | undefined;
  /**
   * That this string is one side of a declared cross-surface pair. See {@link AgreementReading}.
   *
   * `undefined` for every string a single surface said about itself, which is all but a handful:
   * this is the only field on this interface that is about **two** surfaces at once.
   */
  readonly agreement?: AgreementReading | undefined;
}

/* -------------------------------------------------------------------------- *
 * The generated case
 * -------------------------------------------------------------------------- */

/**
 * The presentation modes the search sweeps.
 *
 * § D163 names *(building × shipped dispatcher × seed × mode)*, and clause 2 recorded that only
 * one mode existed when the criterion was written. The Basic/Advanced split has since landed, so
 * the tuple now carries both — the one-line change the previous docstring promised — and
 * `honesty.test.ts`'s corpus assertion (`stats.modes` keys equal this tuple) tightened with it:
 * a corpus that never drew `'basic'` is red, not quietly narrower.
 *
 * **What the axis buys today, said precisely.** `caseFromSeed` draws the mode last, so the 48
 * pinned cases keep their building, dispatcher, seed and batch shape and only the `mode` field
 * differs; the corpus *distributes* across the two values rather than doubling. No shipped
 * adapter branches on `context.case.mode` yet — the disclosure adapter deliberately renders
 * **both** `VIEW_MODES` on every case, because parity is a comparison of two projections of one
 * datum (`surfaces.ts` § *Why both modes*). So the value of generating the axis is the day a
 * mode-aware renderer lands: it is driven on both modes from that day, rather than from the day
 * somebody remembers to check it.
 */
export const HONESTY_MODES = ['basic', 'advanced'] as const;

export type HonestyMode = (typeof HONESTY_MODES)[number];

/**
 * One case: a configuration of the experience layer, fully serializable.
 *
 * Everything here is a **shipped** value — a building out of `data/buildings/`, a profile out of
 * `data/dispatcher-profiles.json`, a stage out of `data/campaign.json`. A fuzzer that invented a
 * building would test the building generator; the claim under search is about the strings the
 * shipped product prints on the shipped configurations.
 */
export interface HonestyCase {
  /** `honesty-<seed>`, or `<parent>-s<n>` for a shrunk neighbour. */
  readonly caseId: string;
  /** The generator seed, decimal. `caseFromSeed(honestySeed)` reproduces an unshrunk case exactly. */
  readonly honestySeed: string;
  /** Master seed handed to every run of this case, decimal. On the recording, invariant 5. */
  readonly simSeed: string;
  readonly buildingId: string;
  /** The arm a single-run surface is driven from, and the batch's baseline. */
  readonly baselineProfileId: string;
  /** The batch's second arm. May equal {@link baselineProfileId} — that is the control. */
  readonly candidateProfileId: string;
  readonly durationS: number;
  /** Percent of population per 5 minutes, or `null` for the building's own profile. */
  readonly arrivalRatePctPop5min: number | null;
  /** Replications the batch surfaces are driven at. */
  readonly replications: number;
  /** A `data/campaign.json` stage id, or `null` when this case drives no campaign surface. */
  readonly stageId: string | null;
  readonly mode: HonestyMode;
  /**
   * A `honesty/fitOut.ts#HONESTY_KITS` id, or `null` for a tower **as built**.
   *
   * ## Why this axis exists, and why it is a field rather than a corpus of its own
   *
   * [§ D427](../../../../DECISIONS.md) made a campaign purchase reach the run and predicted its own
   * effect on this corpus: *"any corpus case that ever carries a non-`AS_BUILT` fit-out would
   * move."* The corpus was measured against a re-measured base and **every figure was identical** —
   * so none did, and the ten properties had never read a string produced by a run whose doors,
   * machines, cars, shafts, control or tenancy had been fitted out. A surface can be honest about a
   * tower as built and dishonest about a fitted one.
   *
   * `mode` is the precedent for the shape and is cited **with** its own measured null: it produced
   * zero new strings on the day it landed and stopped being a null later, when two adapters became
   * mode-aware. An axis is driven from the day a fitted surface lands rather than from the day
   * somebody remembers to check it, which one extra case would not be.
   *
   * Drawn **last** by `caseFromSeed`, after {@link mode}, so every pinned case keeps the building,
   * dispatcher, seed, horizon, demand, batch shape and mode it already had. See
   * `honesty/fitOut.ts` for which kits and the measurement that chose them.
   */
  readonly fitOutId: string | null;
  /** Short labels for what makes this case interesting. Reported, never branched on. */
  readonly tags: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * Outcomes
 * -------------------------------------------------------------------------- */

/**
 * Why a case produced no verdict.
 *
 * `unrunnable` is a **generator** defect — a case naming a stage whose building the case does not
 * use, say — and is reported separately so a shrink step that produces one is discarded rather
 * than counted as a counterexample.
 */
export const HONESTY_SKIP_REASONS = ['unrunnable', 'no-stage'] as const;

export type HonestySkipReason = (typeof HONESTY_SKIP_REASONS)[number];

/** What checking one case produced. */
export interface HonestyOutcome {
  readonly case: HonestyCase;
  readonly violations: readonly HonestyViolation[];
  readonly skipped?: HonestySkipReason | undefined;
  /** An exception that is not itself a property verdict. Always a finding. */
  readonly threw?: string | undefined;
  /* ---- measurements, reported by the campaign ---- */
  /** Strings rendered and checked. Zero is a **failure of the harness**, not a clean case. */
  readonly textCount: number;
  /** Which surfaces produced at least one string on this case. */
  readonly surfacesExercised: readonly string[];
  /** Simulations run for this case, so the campaign can report what it cost. */
  readonly simulations: number;
  /** Whether the single run this case rendered had its estimates suppressed. */
  readonly suppressed: boolean;
  /** How much of this case's text the temporal axis reached, and how it was declared. */
  readonly temporal: TemporalReach;
  /** How much of it the withheld matrix reached. See {@link WithheldReach}. */
  readonly withheld: WithheldReach;
}

/**
 * The size of the temporal axis, measured rather than assumed.
 *
 * **A property that never sees a string it could fail is green for the wrong reason.** The six
 * properties before this one are each answerable about every string in the corpus; this one is
 * answerable only about strings a surface said *at a playhead*, and only interesting about the ones
 * it said **early**. Both counts are therefore reported beside the corpus size — the same reason
 * `HonestyCampaignStats.suppressedCases` is reported, and `honesty.test.ts` asserts on them for the
 * same reason it asserts *"the corpus reaches both halves of the space, so R3 has something to
 * check."*
 *
 * {@link declaredWholeRun} is the one that would go quietly to zero. It counts strings a surface
 * declared whole-run **at any playhead**, and the shipped surfaces only ever declare that at
 * `endedAt` — so a corpus in which it is zero is a corpus where the retrospective copy of the mood
 * card, the banding and the honesty card was never rendered, and the structural half of the
 * property is asserting a gate over an empty set.
 */
export interface TemporalReach {
  /** Strings said at a playhead — the axis's whole population. */
  readonly atPlayhead: number;
  /** Of those, said at a playhead short of `endedAt`. Where the property can fail. */
  readonly early: number;
  /** Of those, whose surface declared the figure folded over the instant. */
  readonly declaredNow: number;
  /** Of those, whose surface declared the figure folded over the whole shift. */
  readonly declaredWholeRun: number;
}

/**
 * The size of the withheld matrix, measured rather than assumed — {@link TemporalReach}'s reason,
 * one axis over.
 *
 * `withheld-figure-published` is answerable only about cells an adapter **marked**, so a corpus that
 * stopped marking them would leave the property iterating an empty set and reporting zero
 * violations, which is byte-identical to the property holding. {@link states} is the sharper of the
 * two: it counts the distinct combinations that produced at least one marked cell, and § 12.2's
 * whole claim is about *every* combination — a number below `2 ** WITHHELD_REASONS.length` is a
 * matrix with a hole in it, whatever the cell count says.
 */
export interface WithheldReach {
  /** Cells drawn where a figure the state withholds would be. */
  readonly cells: number;
  /** Distinct `WithheldState.id`s that produced at least one of them. */
  readonly states: number;
}

/** What a whole campaign measured. Printed by the always-on suite so the cost is never silent. */
export interface HonestyCampaignStats {
  readonly cases: number;
  readonly evaluated: number;
  readonly skipped: number;
  readonly failures: number;
  readonly texts: number;
  readonly simulations: number;
  /** How many cases rendered a suppressed run — the half of the space R3 is about. */
  readonly suppressedCases: number;
  /** Every surface id that produced at least one string, with its count. */
  readonly surfaces: Readonly<Record<string, number>>;
  readonly buildings: Readonly<Record<string, number>>;
  readonly modes: Readonly<Record<string, number>>;
  /**
   * Cases per fit-out kit, with `as-built` for the towers that bought nothing.
   *
   * Reported beside {@link buildings} and {@link modes} because it is the same kind of fact and
   * carries the same risk: an axis whose corpus drew one value is an axis nobody checked, and the
   * value it would silently collapse to here is the one the corpus already had — every case a tower
   * **as built**, which is the state § D427's null result found. `honesty.test.ts` asserts both
   * halves are non-empty for that reason.
   */
  readonly fitOuts: Readonly<Record<string, number>>;
  /** The temporal axis's own size, summed over the campaign. See {@link TemporalReach}. */
  readonly temporal: TemporalReach;
  /** The withheld matrix's own size, summed over the campaign. See {@link WithheldReach}. */
  readonly withheld: WithheldReach;
}
