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

/* -------------------------------------------------------------------------- *
 * Properties
 * -------------------------------------------------------------------------- */

/**
 * The six properties § D163 clause 1 enumerates, each named by the rule of
 * [`docs/10`](../../../../docs/10-experience-layer-contract.md) § 1 it derives from.
 *
 * Ordered as the decision lists them. Each is checked by one function in `properties.ts`, and
 * each has a fault in `faults.ts` that makes it fail.
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
}
