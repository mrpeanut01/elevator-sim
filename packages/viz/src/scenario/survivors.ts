/**
 * **The published survivor table — `data/scenario-survivors.json` — and the rules a scenario may
 * not ship without.** GitHub issue **#367**, `docs/38` § 2.1 and § 3,
 * [§ D525](../../../../DECISIONS.md) clause 3.
 *
 * > *"A survivor count per scenario per budget step, pre-simulated, pinned, published on the
 * > scenario, with its sampling method beside it where the space is sampled."*
 *
 * `survivorSpace.ts` says what the configurations are, `measureSurvivors.ts` judges them, and this
 * file is the shape they are published in and the schema that refuses a table that does not say
 * what it means. The split, and the rule that a published number is pinned to the run that produced
 * it, are `scenario/published.ts`'s and `benchmark/published.ts`'s — this file is the third
 * instance of the same pattern and deliberately not a fourth variation on it.
 *
 * ## This table is **measured**, and that is the opposite of `data/contract-ladder.json`
 *
 * The distinction matters enough to be the first thing here. `data/contract-ladder.json` carries
 * the product owner's 2026-09-08 provenance marking and draws the line **field by field**: its
 * miss rates are measured, its *targets* are chosen, and *"what is CHOSEN is … game feel, not a
 * measurement, and no amount of sweeping makes it one."* `data/campaign.json`'s budgets are the
 * same shape — every `note` opens `DERIVED:` or `CHOSEN:`.
 *
 * **Nothing in this table is chosen.** Every number in it is the output of a run, and the run is
 * named on the table's own face: {@link PublishedSurvivors.provenance} carries the command, the
 * commit, the master sampler seed, the dispatcher each scenario was baselined against and the
 * scenario's own two seed sets. A reader who disagrees with a figure here is not disagreeing with a
 * judgement — they are saying the run does not reproduce, which is a **finding to report** rather
 * than a number to edit. `CLAUDE.md`: *"If you publish a number, pin it to the run that produced
 * it."*
 *
 * The one thing that is chosen is {@link PublishedSurvivors.provenance}'s `sampleSize`, and it is
 * chosen the way a replication budget is chosen rather than the way game feel is: it is what the
 * deep tier can afford at fifty replications a cell. It is published, not buried, and the count it
 * produced is meaningless without it — which is why every record carries `examined` beside
 * `survivors` and this file publishes no rate at all.
 *
 * ## Counts, never quotients — and there are **two** sample sizes, not one
 *
 * `published.ts`'s rule, inherited by name: *"a stored rate is a number that can drift from its own
 * counts through an edit or a rounding, and CLAUDE.md records three published figures that did
 * exactly that."* So `examined` and `survivors`, and the reader divides.
 *
 * The trap specific to this table is that a survivor count has two denominators and they are not
 * interchangeable:
 *
 * - **n = 50 replications**, the scenario's own, inside `CLAUDE.md`'s 50–200 budget. That is the
 *   sample size *inside* each cell, paired under common random numbers, and it is what the only
 *   interval anywhere in this measurement is formed over — the paired-t on the difference that
 *   `beat-the-baseline` reads through the shipped judge.
 * - **k = `examined` configurations**, the sample over the reachable space. The survivor count is a
 *   count over **k**.
 *
 * A reader who takes `survivors / examined` for a per-seed pass rate has read the wrong
 * denominator, and {@link survivorSentenceFor} is written so a player cannot: it says how many ways
 * in were tried before it says how many got through.
 *
 * ## Two strata, and only one of them is a sample
 *
 * Issue #367 asks that *"where the space is too large to enumerate … the count is a sample and says
 * so on its own face."* Measured, the shipped ladder splits in two rather than by tier:
 *
 * - **The dropdown** is a **census**. Thirteen shipped profiles is a population; every one the rung
 *   can afford is played. `dropdown.survivors` is therefore exact, and it is the number DC-2's
 *   replacement reads — *no stage clears from the dispatcher dropdown alone* is a statement about
 *   this column (GitHub issue #365's comment, positions one and two exempt).
 * - **The dials** are a **sample**, at every rung including the base. That is stronger than #367
 *   expected — it asks for sampling at the building tier — and it is measured rather than assumed:
 *   `survivorSpace.ts#bundleSpaceOf` reports the space uncountable as soon as an affordable bundle
 *   covers a continuous dimension, and the cheapest priced change on the ladder covers two.
 *
 * {@link validatePublishedSurvivors} refuses a record whose declared method disagrees with that
 * derivation, so the day somebody prices a change covering only categorical dials, a rung becomes
 * enumerable and the file has to say so.
 *
 * ## What may not ship, asserted rather than reviewed
 *
 * Every clause below is one issue #367 or its #365 comment asks for, and each is a sentence rather
 * than a code because the caller is a test whose failure text is what a future reader sees.
 *
 * - **Zero is not a scenario** unless it declares itself a diagnosis — `docs/10` § 5.4 stage 3's
 *   *unwinnable as configured and it says so*, which is `docs/33` DC-3 stopping the ladder from
 *   ending in cruelty.
 * - **DC-1, re-expressed as a reading of this count**: the survivor count is **less than the whole
 *   affordable space**. A rung where every configuration clears has nothing for a player to fail.
 * - **The first-hour floor** (#381): *no scenario a player meets in the first hour may have a
 *   survivor count of one.* One survivor is the ceiling of the ladder and should not be reachable
 *   before the player knows what the controls do. Which scenarios those are is **derived** —
 *   {@link firstHourScenarioIds} — rather than authored; see that function for the derivation and
 *   for what it is standing in for until #381 rules. A diagnosis does **not** exempt a scenario
 *   from this one, and the asymmetry is deliberate: a diagnosis is a scenario saying nothing gets
 *   through it, so a diagnosis beside a count of one would be a sentence its own measurement
 *   contradicts. The zero rule is the only place a diagnosis buys anything.
 * - **The dropdown census only grows with the budget.** Affordability is monotone in units, so a
 *   profile affordable at the base rung is affordable at every rung above it. This is an internal
 *   control on the file rather than a rule about the game: a table where it fails was assembled
 *   wrong, and no amount of re-running would fix it.
 *
 * The **tutorial is outside this count** — #380, excluded by #381 — and it is outside by
 * construction rather than by exemption: this table is keyed by `data/campaign.json`'s stages, and
 * the tutorial is not one.
 *
 * ## Two clauses of #367 that are **carried and not asserted**, named rather than left to be found
 *
 * Both wait on a figure nobody has authored, and inventing one here would be this file doing the
 * thing its own first paragraph says it never does.
 *
 * 1. **DC-2's replacement.** GitHub issue #365's comment re-expresses *no stage clears from the
 *    dispatcher dropdown alone* as *the dispatcher tier's survivors are inside the ladder
 *    position's budget, positions one and two exempt*. The **reading** ships:
 *    {@link PublishedSurvivorStep.perTier}'s `dispatcher` column is exactly that count, and it is
 *    exact rather than sampled because the dropdown half is a census. What does not ship is the
 *    comparison, because **no field of `data/` says what a ladder position's survivor budget is**.
 * 2. **A count outside its position's budget fails rather than being noted** — the same missing
 *    figure, one clause along. {@link PublishedSurvivorScenario.ladderPosition} is carried and is
 *    checked against the campaign's own ordered path, so the key the ruling will need is here and
 *    is derived rather than authored.
 *
 * What a rule needs is a band per position — `docs/33` DC-4's `[1/3, 2/3]` is that shape for a miss
 * rate, and `data/contract-ladder.json` is where such a figure would live, marked **chosen** the way
 * every figure in that file is. Choosing it is a designer's decision about pacing, which is
 * `data/contract-ladder.json`'s own provenance note in as many words: *"no amount of sweeping makes
 * it one."* This file measures; it does not choose.
 */

import type { PriceSchedule } from '../pricing/types.js';

import { rungsOf, type ScenarioBudget } from './budget.js';

/* -------------------------------------------------------------------------- *
 * The file shape
 * -------------------------------------------------------------------------- */

/** One seed set, as the file records it. The same shape `published.ts` uses, deliberately. */
export interface PublishedSeedSet {
  readonly name: string;
  readonly seed: string;
  readonly replications: number;
}

/** Examined and survivors, for one stratum or one price tier. Counts only. */
export interface SurvivorCounts {
  readonly examined: number;
  readonly survivors: number;
}

/** How the dial stratum was drawn at one rung, so the draw can be redone from the file alone. */
export interface PublishedSampling {
  readonly method: 'sampled' | 'exhaustive';
  readonly sampleSize: number;
  readonly masterSeed: number;
  readonly seed: number;
  readonly bundles: number;
  readonly enumerable: boolean;
  readonly draws: number;
  readonly refusedDraws: number;
  readonly inertDraws: number;
  readonly duplicateDraws: number;
}

/** One `(scenarioId, stepId)` cell: the key issue #365 shaped the budget steps to carry. */
export interface PublishedSurvivorStep {
  /** `null` on the base rung; a `BoughtBudgetStep.id` on every bought one. Stable, never an index. */
  readonly stepId: string | null;
  readonly units: number;
  readonly chimesSpent: number;
  /** The `k` this count is over. Never the replication count — see the module docstring. */
  readonly examined: number;
  readonly survivors: number;
  /**
   * The survivors, by name.
   *
   * Published rather than only counted, for `difficultyCurve.test.ts`'s reason: a register that
   * names its members can be checked in both directions, and *"one survivor"* is a claim a reader
   * should be able to go and look at. A dial survivor is `edit-<n>` and is reproducible from
   * {@link PublishedSampling.seed} and its index in the draw.
   */
  readonly survivorNames: readonly string[];
  /** Of {@link examined}, how many had a goal the judge could not answer. Unjudged is not passed. */
  readonly unjudged: number;
  /**
   * Of {@link examined}, how many ran a batch in which an orderable measure refused its own number.
   *
   * `CLAUDE.md`: *"If a configuration saturates, flag it and suppress the AWT interval"* — one of
   * five grounds `awtIsValid` fails on. A survivor count of 1 of 24 where 24 refused their own mean
   * is a different fact from 1 of 24 where none did, and this field is what lets a reader tell them
   * apart instead of quietly counting a suppressed run as an honest loss.
   */
  readonly suppressed: number;
  /**
   * Configurations the declared space admits and `core` refuses to build. **Not** in `examined`.
   *
   * Zero on all thirty shipped cells, re-measured on `4159520` after GitHub issue **#475** closed
   * rather than inferred from the fix, and the field is kept rather than dropped for the reason
   * `measureSurvivors.ts#UnbuildableConfiguration` gives: a category that is empty because it was
   * fixed reads exactly like one that is empty because nobody looked, unless the count is still
   * published.
   */
  readonly unbuildable: number;
  /** The census half. Exact. */
  readonly dropdown: SurvivorCounts;
  /** The sampled half. {@link sampling} says how. */
  readonly dials: SurvivorCounts;
  /** Examined and survivors by the dearest price tier reached — issue #367's per-tier clause. */
  readonly perTier: Readonly<Record<string, SurvivorCounts>>;
  readonly sampling: PublishedSampling;
}

/** One scenario's survivor counts, at every rung of its budget. */
export interface PublishedSurvivorScenario {
  readonly id: string;
  readonly name: string;
  /** 1-based position on `data/campaign.json`'s ordered path — issue #365's comment asks for it. */
  readonly ladderPosition: number;
  /** Whether a player meets this scenario in their first hour. See {@link firstHourScenarioIds}. */
  readonly inFirstHour: boolean;
  readonly buildingId: string;
  /** The profile every configuration is an edit of, and arm 0 of every batch. */
  readonly baselineProfileId: string;
  readonly durationS: number;
  readonly replications: number;
  readonly tuningSeeds: PublishedSeedSet;
  readonly holdoutSeeds: PublishedSeedSet;
  /**
   * The scenario's own declaration that it is unwinnable as configured, or `null`.
   *
   * `docs/10` § 5.4 stage 3's shape and `docs/33` DC-3: zero survivors is allowed **only** where
   * the scenario says so in the player's words. A `null` here beside a zero count is what
   * {@link validatePublishedSurvivors} refuses.
   */
  readonly diagnosis: string | null;
  readonly steps: readonly PublishedSurvivorStep[];
}

/** How the table was produced. Every field is a fact about a run, never a choice about a game. */
export interface SurvivorProvenance {
  /** `'measured'`. A constant, and its presence is the assertion — see the module docstring. */
  readonly kind: 'measured';
  /** The exact command that reproduces this file. */
  readonly command: string;
  /** The commit the run was taken on. A figure without its tree is a figure nobody can re-take. */
  readonly tree: string;
  /** ISO date the run was taken. */
  readonly measuredAt: string;
  /** The master seed every cell's sampler seed derives from. */
  readonly masterSeed: number;
  /** Distinct dial configurations drawn at each rung. Published because `k` is a denominator. */
  readonly sampleSize: number;
  /**
   * What the count is a count of, in one sentence, so a reader meets the scope beside the number.
   *
   * Not decoration: this measurement reaches four of the schedule's twenty-five priced changes and
   * varies twenty-four of the search space's fifty-nine dimensions, and a survivor count read
   * without that is read as a claim about the whole ladder.
   */
  readonly scope: string;
  /** Price-schedule change ids a scenario run can apply. */
  readonly reachableChangeIds: readonly string[];
  /** Priced changes no scenario run can apply — a bound on this measurement, named. */
  readonly unreachableChangeIds: readonly string[];
  /** Search-space dimensions the schedule prices nothing for, and which are therefore not varied. */
  readonly unpricedDimensionCount: number;
  readonly declaredDimensionCount: number;
}

export interface PublishedSurvivors {
  /** How to regenerate the file, so a stale number has an owner. `published.ts`'s field. */
  readonly generatedBy: string;
  readonly contract: string;
  readonly provenance: SurvivorProvenance;
  readonly scenarios: readonly PublishedSurvivorScenario[];
}

/* -------------------------------------------------------------------------- *
 * Reading the table
 * -------------------------------------------------------------------------- */

/**
 * The scenarios a player meets in their first hour, **derived from the campaign's own ordered path**.
 *
 * #381's floor — *no scenario a player meets in the first hour may have a survivor count of one* —
 * needs a set, and no field of `data/campaign.json` declares one. Two ways to supply it: author a
 * list, or derive one. A list would be this file choosing which scenarios count as early, which is
 * a game-feel judgement in a file whose whole subject is that it contains none.
 *
 * So it is derived: the stages in order, each contributing its own declared `durationS`, cumulated
 * until an hour of simulated play is reached. On the shipped campaign every stage runs 900 s, so
 * the set is the first four. **The derivation is stated rather than hidden because it is standing
 * in for a ruling** — #381 owns what *the first hour* means, and when it says, this function is the
 * one place to change. What it must not become is a hand-written list of ids: a scenario inserted
 * at position 2 must join the set without an edit, and with this derivation it does.
 */
export function firstHourScenarioIds(
  stages: readonly { readonly id: string; readonly durationS: number }[],
): ReadonlySet<string> {
  const out = new Set<string>();
  let elapsed = 0;
  for (const stage of stages) {
    if (elapsed >= FIRST_HOUR_S) break;
    out.add(stage.id);
    elapsed += stage.durationS;
  }
  return out;
}

/** An hour of simulated play, in seconds. The unit `durationS` is already in. */
export const FIRST_HOUR_S = 3_600;

/**
 * A Clopper–Pearson (exact binomial) interval on the **dial** stratum's survivor share.
 *
 * Derived at read time and never stored, for `published.ts`'s stated reason. It exists because the
 * dial half is a sample and a sample has an uncertainty a reader is entitled to: 0 of 12 is not
 * *"no configuration clears"*, it is *"at most about a quarter of them do, with 95 % confidence."*
 *
 * **Exact rather than normal-approximate**, because `k` here is twelve: a Wald interval on 0 of 12
 * has width zero and would say the sweep proved something it did not. The dropdown stratum is a
 * census and gets no interval at all — an interval on a population is a category error.
 */
export function dialShareInterval(counts: SurvivorCounts): {
  readonly low: number;
  readonly high: number;
} {
  const { examined, survivors } = counts;
  if (examined <= 0) return { low: 0, high: 1 };
  const low = survivors === 0 ? 0 : betaQuantile(0.025, survivors, examined - survivors + 1);
  const high =
    survivors === examined ? 1 : betaQuantile(0.975, survivors + 1, examined - survivors);
  return { low, high };
}

/**
 * The `p`-quantile of a Beta(a, b), by bisection on the regularised incomplete beta function.
 *
 * Bisection rather than a closed form: the interval is drawn once per record for a reader, `a` and
 * `b` are small integers, and forty iterations is exact to twelve decimal places. A faster
 * inversion would be a second numerical routine in a repository that already keeps its statistics
 * in one place.
 */
function betaQuantile(p: number, a: number, b: number): number {
  let low = 0;
  let high = 1;
  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    if (regularisedIncompleteBeta(mid, a, b) < p) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** `I_x(a, b)`, by the continued fraction in Numerical Recipes § 6.4. */
function regularisedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front =
    Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
    ) / a;
  if (x < (a + 1) / (a + b + 2)) return front * betaContinuedFraction(x, a, b);
  return 1 - betaTail(x, a, b);
}

function betaTail(x: number, a: number, b: number): number {
  const front =
    Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) + b * Math.log(1 - x) + a * Math.log(x),
    ) / b;
  return front * betaContinuedFraction(1 - x, b, a);
}

function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let result = d;
  for (let m = 1; m <= 300; m += 1) {
    const even = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + even * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + even / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    result *= d * c;
    const odd = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + odd * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + odd / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return result;
}

/** Lanczos, g = 7, n = 9. The same approximation `core`'s statistics use. */
function logGamma(z: number): number {
  const g = [
    0.999_999_999_999_809_93, 676.520_368_121_885_1, -1_259.139_216_722_402_8,
    771.323_428_777_653_13, -176.615_029_162_140_6, 12.507_343_278_686_905,
    -0.138_571_095_265_720_12, 9.984_369_578_019_572e-6, 1.505_632_735_149_311_6e-7,
  ];
  const x = z - 1;
  let sum = g[0] ?? 0;
  for (let index = 1; index < g.length; index += 1) sum += (g[index] ?? 0) / (x + index);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

/* -------------------------------------------------------------------------- *
 * The player's words
 * -------------------------------------------------------------------------- */

/** Every string the survivor count draws on a scenario. One place, so no screen invents a second. */
export const SURVIVOR_COPY = Object.freeze({
  heading: 'Ways through',
  censusNote: 'The settings you can pick by name were all tried. That half is a count, not an estimate.',
  sampleNote: 'The dials were drawn at random from what this budget buys, so that half is a sample.',
  diagnosisLead: 'Nothing gets through this one as it stands, and that is the point:',
  unbuildableNote:
    'A setting this tower cannot be built with is not counted either way — it is neither a way through nor a failed attempt.',
});

/**
 * What a scenario says about its own difficulty, in the player's words.
 *
 * **No scalar score, no letter, no star** — `docs/38` § 4, and § D525 clause 3 makes the count the
 * whole of what difficulty is. The sentence names the count and its `k` in that order, so a reader
 * meets *how many were tried* before *how many got through* and cannot read the count as a rate.
 *
 * `docs/10` R13 in the shape this repository keeps re-learning: the estimate carries its own `n` in
 * its own box. `estimate-without-n` was found twice by the honesty corpus on rows that had a count
 * nearby but not inside them, and a survivor count is exactly that shape.
 *
 * A refusal replaces the number rather than hiding it (R3): a scenario that declares itself a
 * diagnosis says so, and a cell that examined nothing says that instead of printing a zero that
 * would read as *"nothing works"*.
 */
export function survivorSentenceFor(
  scenario: PublishedSurvivorScenario,
  step: PublishedSurvivorStep,
): string {
  if (step.examined === 0) {
    return (
      `${SURVIVOR_COPY.heading}: nothing was tried at this budget, so there is no count to give. ` +
      'A count of zero and a count nobody took are different things, and this is the second.'
    );
  }
  const tried =
    `${String(step.examined)} ${step.examined === 1 ? 'way in was' : 'ways in were'} ` +
    'tried at this budget';
  if (scenario.diagnosis !== null) {
    return (
      `${SURVIVOR_COPY.heading}: ${tried} and ${String(step.survivors)} got through. ` +
      `${SURVIVOR_COPY.diagnosisLead} ${scenario.diagnosis}`
    );
  }
  const through =
    step.survivors === 0
      ? 'none got through'
      : step.survivors === 1
        ? 'exactly one got through'
        : `${String(step.survivors)} got through`;
  const split =
    `${String(step.dropdown.survivors)} of ${String(step.dropdown.examined)} came from the ` +
    `settings you can pick by name, and ${String(step.dials.survivors)} of ` +
    `${String(step.dials.examined)} from the dials.`;
  /*
   * The census note always applies — the dropdown half is a population, at every rung. The sample
   * note is added only where the dial half really is a sample, so a rung that ever becomes
   * enumerable stops claiming an uncertainty it does not have. Both notes, not one: the two halves
   * of this count are different kinds of number, and a reader told only *"this is a sample"* would
   * put an interval round a census.
   */
  const method = step.sampling.method === 'sampled' ? ` ${SURVIVOR_COPY.sampleNote}` : '';
  return `${SURVIVOR_COPY.heading}: ${tried} and ${through}. ${split} ${SURVIVOR_COPY.censusNote}${method}`;
}

/* -------------------------------------------------------------------------- *
 * The guard
 * -------------------------------------------------------------------------- */

/** What the table is checked against: the shipped campaign, and the ladder its budgets are priced by. */
export interface SurvivorContext {
  readonly stages: readonly {
    readonly id: string;
    readonly name: string;
    readonly building: string;
    readonly durationS: number;
    readonly replications: number;
    readonly budget: ScenarioBudget;
    readonly dispatcher: { readonly startingProfileId: string };
    readonly seeds: PublishedSeedSet;
    readonly holdoutSeeds: PublishedSeedSet;
  }[];
  readonly schedule: PriceSchedule;
}

/** `CLAUDE.md`'s replication budget, as the two numbers it states. */
export const MIN_REPLICATIONS = 50;
export const MAX_REPLICATIONS = 200;

/**
 * Every way the published survivor table can be wrong, as a list of sentences. Empty means sound.
 *
 * A list rather than a throw, and a sentence rather than a code, for `published.ts`'s reason: the
 * caller is a test whose failure text is the thing a future reader will actually see, and
 * `toEqual([])` prints every violation at once.
 */
export function validatePublishedSurvivors(
  table: PublishedSurvivors,
  context: SurvivorContext,
): readonly string[] {
  const out: string[] = [];

  if (table.provenance.kind !== 'measured') {
    out.push(
      'the table does not declare itself measured. Every figure here is the output of a run, ' +
        'unlike data/contract-ladder.json, whose targets are chosen; a table that does not say ' +
        'which it is invites a reader to edit a number instead of reporting that it moved.',
    );
  }
  for (const [field, value] of [
    ['generatedBy', table.generatedBy],
    ['contract', table.contract],
    ['provenance.command', table.provenance.command],
    ['provenance.tree', table.provenance.tree],
    ['provenance.measuredAt', table.provenance.measuredAt],
    ['provenance.scope', table.provenance.scope],
  ] as const) {
    if (value.trim() === '') out.push(`the table's "${field}" is empty, so the run is not pinned.`);
  }
  if (table.provenance.sampleSize <= 0) {
    out.push('the table declares a sample size of zero, so no cell counts anything.');
  }
  if (table.scenarios.length === 0) {
    out.push('the table declares no scenarios, so it asserts nothing about any difficulty.');
  }

  const firstHour = firstHourScenarioIds(context.stages);
  const stagesById = new Map(context.stages.map((stage) => [stage.id, stage]));
  const seen = new Set<string>();

  for (const [index, scenario] of table.scenarios.entries()) {
    const where = `scenario "${scenario.id}"`;
    if (seen.has(scenario.id)) out.push(`${where}: declared twice.`);
    seen.add(scenario.id);

    const stage = stagesById.get(scenario.id);
    if (stage === undefined) {
      out.push(`${where}: is not a stage data/campaign.json ships, so it counts nothing anybody plays.`);
      continue;
    }
    out.push(...checkScenario(where, scenario, stage, index, firstHour));
  }

  for (const stage of context.stages) {
    if (!seen.has(stage.id)) {
      out.push(
        `stage "${stage.id}": ships in data/campaign.json and has no survivor count. § D525 makes ` +
          'difficulty the number of ways through, so a scenario without one has no declared ' +
          'difficulty at all — it is not easy, it is unmeasured.',
      );
    }
  }

  return out;
}

function checkScenario(
  where: string,
  scenario: PublishedSurvivorScenario,
  stage: SurvivorContext['stages'][number],
  index: number,
  firstHour: ReadonlySet<string>,
): readonly string[] {
  const out: string[] = [];

  if (scenario.ladderPosition !== index + 1) {
    out.push(
      `${where}: declares ladder position ${String(scenario.ladderPosition)} and is row ` +
        `${String(index + 1)} of the table. The position is the campaign's ordered path, derived, ` +
        'never authored beside it.',
    );
  }
  if (scenario.inFirstHour !== firstHour.has(scenario.id)) {
    out.push(
      `${where}: says inFirstHour is ${String(scenario.inFirstHour)} and the campaign's own ` +
        'durations say otherwise. The set is derived from the ordered path, not written down.',
    );
  }
  if (scenario.buildingId !== stage.building) {
    out.push(`${where}: counts on "${scenario.buildingId}" and the stage runs "${stage.building}".`);
  }
  if (scenario.baselineProfileId !== stage.dispatcher.startingProfileId) {
    out.push(
      `${where}: baselined against "${scenario.baselineProfileId}" and the stage starts from ` +
        `"${stage.dispatcher.startingProfileId}". Every configuration here is an edit of the ` +
        'baseline and the baseline is arm 0 of every batch, so the wrong one measures another game.',
    );
  }
  if (scenario.replications !== stage.replications) {
    out.push(
      `${where}: counted over ${String(scenario.replications)} replications and the stage declares ` +
        `${String(stage.replications)}.`,
    );
  }
  if (scenario.replications < MIN_REPLICATIONS || scenario.replications > MAX_REPLICATIONS) {
    out.push(
      `${where}: ran ${String(scenario.replications)} replications a cell. CLAUDE.md budgets ` +
        `${String(MIN_REPLICATIONS)}–${String(MAX_REPLICATIONS)}: "Ten is not enough — it produced ` +
        'a 12% error against the converged mean in the reference study."',
    );
  }
  if (scenario.tuningSeeds.seed === scenario.holdoutSeeds.seed) {
    out.push(
      `${where}: the tuning and holdout seed sets share master seed ` +
        `"${scenario.tuningSeeds.seed}", so a survivor cleared on the seeds it was tuned against ` +
        'and the holdout validated nothing.',
    );
  }
  for (const [name, published, declared] of [
    ['tuning', scenario.tuningSeeds, stage.seeds],
    ['holdout', scenario.holdoutSeeds, stage.holdoutSeeds],
  ] as const) {
    if (published.seed !== declared.seed || published.replications !== declared.replications) {
      out.push(
        `${where}: publishes ${name} seeds ${published.seed}×${String(published.replications)} and ` +
          `the stage declares ${declared.seed}×${String(declared.replications)}. A pinned count ` +
          'over seeds the scenario does not run is a count of something else.',
      );
    }
  }
  if (scenario.diagnosis !== null && scenario.diagnosis.trim() === '') {
    out.push(`${where}: declares an empty diagnosis. A refusal replaces the number; it is not a blank.`);
  }

  const rungs = rungsOf(stage.budget);
  if (scenario.steps.length !== rungs.length) {
    out.push(
      `${where}: publishes ${String(scenario.steps.length)} budget steps and the scenario's budget ` +
        `has ${String(rungs.length)} rungs. Every step credits can buy carries its own count ` +
        '(docs/38 § 2.4, § D526), including the base.',
    );
  }

  let bestSurvivors = 0;
  let previousDropdownExamined = -1;
  for (const [position, rung] of rungs.entries()) {
    const step = scenario.steps[position];
    if (step === undefined) continue;
    const at = `${where}, budget step ${step.stepId === null ? '(base)' : `"${step.stepId}"`}`;
    if (step.stepId !== rung.stepId) {
      out.push(
        `${at}: is row ${String(position + 1)} and the budget's rung ${String(position + 1)} is ` +
          `${rung.stepId === null ? '(base)' : `"${rung.stepId}"`}. The count is keyed by a stable ` +
          'step id and never by an array position — issue #365 shaped the schema that way for this.',
      );
    }
    if (step.units !== rung.units || step.chimesSpent !== rung.chimesSpent) {
      out.push(
        `${at}: counts at ${String(step.units)} units for ${String(step.chimesSpent)} chimes and ` +
          `the ladder puts this rung at ${String(rung.units)} for ${String(rung.chimesSpent)}.`,
      );
    }
    out.push(...checkStep(at, step));

    if (step.survivors > bestSurvivors) bestSurvivors = step.survivors;
    if (step.dropdown.examined < previousDropdownExamined) {
      out.push(
        `${at}: the dropdown census examined ${String(step.dropdown.examined)} profiles here and ` +
          `${String(previousDropdownExamined)} at the rung below. Affordability only grows with ` +
          'units, so a census that shrinks says the table was assembled wrong rather than that ' +
          'the game changed.',
      );
    }
    previousDropdownExamined = step.dropdown.examined;

    if (step.examined > 0 && step.survivors === step.examined) {
      out.push(
        `${at}: every one of the ${String(step.examined)} configurations tried cleared it, so ` +
          'there is nothing here for a player to fail. DC-1 re-expressed as a reading of this ' +
          'count: the survivor count is less than the whole affordable space.',
      );
    }
    if (step.survivors === 1 && scenario.inFirstHour) {
      out.push(
        `${at}: has exactly one survivor and a player meets this scenario in their first hour. ` +
          'One survivor is the ceiling of the ladder and may not be reachable before the player ' +
          'knows what the controls do (GitHub issue #381).',
      );
    }
  }

  if (bestSurvivors === 0 && scenario.diagnosis === null && scenario.steps.length > 0) {
    out.push(
      `${where}: nothing clears it at any budget step and it does not declare itself a diagnosis. ` +
        'Zero is not a scenario (§ D525 clause 3): a scenario nothing gets through is unwinnable ' +
        'as configured, and docs/10 § 5.4 stage 3 allows exactly one thing to be done with that — ' +
        'say so in the player\'s words. docs/33 DC-3 is the same rule, and it is what stops the ' +
        'ladder ending in cruelty.',
    );
  }

  return out;
}

function checkStep(at: string, step: PublishedSurvivorStep): readonly string[] {
  const out: string[] = [];

  if (step.survivors > step.examined) {
    out.push(
      `${at}: ${String(step.survivors)} survivors out of ${String(step.examined)} examined.`,
    );
  }
  if (step.survivorNames.length !== step.survivors) {
    out.push(
      `${at}: names ${String(step.survivorNames.length)} survivors and counts ` +
        `${String(step.survivors)}. A count whose members cannot be listed cannot be checked.`,
    );
  }
  if (step.dropdown.examined + step.dials.examined !== step.examined) {
    out.push(
      `${at}: the two strata examined ${String(step.dropdown.examined)} and ` +
        `${String(step.dials.examined)} and the cell says ${String(step.examined)}.`,
    );
  }
  if (step.dropdown.survivors + step.dials.survivors !== step.survivors) {
    out.push(
      `${at}: the two strata's survivors do not sum to the cell's count.`,
    );
  }
  const tierExamined = Object.values(step.perTier).reduce((sum, cell) => sum + cell.examined, 0);
  const tierSurvivors = Object.values(step.perTier).reduce((sum, cell) => sum + cell.survivors, 0);
  if (tierExamined !== step.examined || tierSurvivors !== step.survivors) {
    out.push(
      `${at}: the per-tier table sums to ${String(tierExamined)} examined and ` +
        `${String(tierSurvivors)} survivors, and the cell says ${String(step.examined)} and ` +
        `${String(step.survivors)}. Issue #367 asks the count to be reportable per tier, which it ` +
        'is not if the tiers do not add up to it.',
    );
  }
  if (step.unjudged > step.examined || step.suppressed > step.examined) {
    out.push(`${at}: more configurations were unjudged or suppressed than were examined.`);
  }

  const { sampling } = step;
  if (sampling.method === 'sampled' && sampling.enumerable) {
    out.push(
      `${at}: is published as sampled and its own space is enumerable, so it could have been ` +
        'counted exactly. A sample where a census is available is an estimate nobody needed.',
    );
  }
  if (sampling.method === 'exhaustive' && !sampling.enumerable) {
    out.push(
      `${at}: is published as an exhaustive count over a space survivorSpace.ts calls uncountable. ` +
        'The cheapest priced change on the ladder covers two continuous dimensions, so a rung that ' +
        'can afford anything at all reaches a space no enumeration walks.',
    );
  }
  if (sampling.method === 'sampled' && sampling.sampleSize <= 0) {
    out.push(`${at}: is sampled and declares a sample size of zero.`);
  }
  if (sampling.method === 'sampled' && sampling.seed <= 0) {
    out.push(
      `${at}: is sampled and carries no seed, so the draw cannot be redone. CLAUDE.md invariant 2 ` +
        'and 5: every draw comes from a named stream, and every published run replays exactly.',
    );
  }
  if (sampling.bundles <= 0) {
    out.push(
      `${at}: reports no affordable bundle at all, so the rung buys nothing the run can apply and ` +
        'the count below it is over an empty space.',
    );
  }
  if (step.dials.examined > sampling.sampleSize) {
    out.push(
      `${at}: drew ${String(step.dials.examined)} dial configurations against a declared sample ` +
        `size of ${String(sampling.sampleSize)}.`,
    );
  }
  if (sampling.draws < step.dials.examined) {
    out.push(`${at}: reports fewer draws than configurations, which no rejection sampler can do.`);
  }

  return out;
}
