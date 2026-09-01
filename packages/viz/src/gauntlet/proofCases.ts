/**
 * **The forty proof cases** — `ENGINE_CONTRACT.md` § 12.3, parsed from `data/proof-cases.json` and
 * derived here into the list every reader shares.
 *
 * ## One list, three readers, and why the list is not in this file
 *
 * § 12.3: *"Eight buildings × five crowd shapes, fixed forever, shared by the gauntlet, the
 * ladder's `What are the forty?` panel and the bench's suite. One list, three readers."* A rating
 * is the mean of all forty and the cases never move, so two ratings a month apart stay comparable —
 * which makes the fixture list the single most load-bearing piece of authored data in the mode, and
 * CLAUDE.md invariant 7 puts it in `data/`. `proof-cases.test.ts` asserts the both-directions
 * property this arrangement exists for: **no module in `packages/viz/src` may contain a tower id, a
 * tower name or a crowd label as a literal.** A second copy of the names is the defect; a test that
 * only checked the first copy would not see it.
 *
 * **All three readers exist as of [§ D445](../../../../DECISIONS.md)**: the gauntlet (`run.ts`),
 * the ladder's disclosure (`ladder.ts#whatAreTheFortyOf`) and the Everyday bench
 * (`everyday/benchModel.ts`), which ran `MATRIX_CELLS` until that ruling. The Engineer's suite
 * panel (`dev/suitePanel.ts`) still runs the matrix and is **not** a fourth reader: § 12.3 names
 * the *bench's* suite, § 12 is the Everyday bench, and the Engineer surface asks the matrix's own
 * question at the matrix's own points.
 *
 * ## The seed is not part of the list, and § 1 gives one rule per reader
 *
 * The one thing `data/` deliberately does *not* carry is the seed, and § 1's table carries **two**
 * rules over this one fixture set:
 *
 * | Gauntlet, 40 cases | `hash(towerId, crowdIndex)` | *fixed forever; a rating is only comparable if the cases never move* |
 * | Bench, per test per rep | `hash(testId, repIndex)` | *the same for every entrant — that is what "matched crowds" means* |
 *
 * So *one list, three readers* is a claim about **fixtures**, never about traces. {@link proofSeedOf}
 * is the gauntlet's rule and {@link benchSeedOf} is the bench's, and neither has a default: a caller
 * of {@link proofCaseRequestOf} must hand it a seed and therefore must say which reader it is.
 *
 * That split is also CLAUDE.md's hold-out discipline, which is why it is not merely obedience to a
 * table. A bench sharing the gauntlet's seeds would let a player tune a dispatcher against the exact
 * forty traces it is about to be **rated** on — *"tune on one seed set, validate on a disjoint one,
 * or you overfit the weight vector to specific passenger traces and the gain vanishes on new
 * traffic"*. Same operating points, disjoint traces, is the textbook arrangement and it is what this
 * pair produces. `proofCases.test.ts` asserts the two seed **sets** are disjoint over the shipped
 * forty rather than trusting that two hashes of different strings differ.
 *
 * ## Why the eight are not `MATRIX_CELLS`, and what the bench gave up by moving
 *
 * `benchmark/matrixCells.ts` holds eight **measured operating points** — building × traffic-pattern
 * cells over five buildings, each carrying a derived replication budget and the census that argued
 * it. Those answer *"where can this project resolve a difference?"*. The forty answer *"does this
 * dispatcher hold up everywhere?"*, which is a different question with a different shape: every
 * shipped building appears exactly once, every crowd shape appears on every building, and no cell
 * is dropped for being hard to resolve — a tower a dispatcher does badly on is the point of it.
 * The two lists are therefore two lists, and neither may be derived from the other.
 *
 * The bench moving to the forty therefore looks like it costs the derived budgets, and **it costs
 * nothing**, which was measured rather than assumed: no module in `packages/viz` reads
 * `MatrixCell.replications`, `budgetBasis`, `armCeilings` or `admissibleReplications`. The bench
 * consumed a cell's building, horizon, demand block, window, id and label and nothing else, and a
 * proof case carries every one of those. `SuiteRequest.replications` says why in its own docstring:
 * the budget is *"one number for the whole suite rather than each cell's own derived budget, because
 * this is the player's control"*. What the bench keeps is `report.ts`'s `under-budget` refusal below
 * `MIN_REPLICATION_BUDGET`, which is a gate rather than an estimate and is unaffected by which
 * fixtures it gates. See [§ D445](../../../../DECISIONS.md).
 *
 * ## What the derivation guarantees
 *
 * The forty are the cross product, in file order: tower-major, so a reader scanning a rating's
 * per-case rows meets all five crowds of one building together. {@link proofCasesOf} is total over
 * a parsed document and its length is `towers × crowds` by construction — there is no case list to
 * fall out of step with the two lists it is made of, which is the second reason this is a cross
 * product rather than forty authored rows.
 */

import type { SimulationDemandOptions } from '@elevator-sim/core/browser';

import type { BatchArmRequest, BatchRequest } from '../batch/types.js';

/** Raised when `data/proof-cases.json` cannot be read as the forty. Never for a run's result. */
export class ProofCaseError extends Error {
  override readonly name = 'ProofCaseError';
}

/** One of the eight towers: which shipped building, at what level, and why it is in the set. */
export interface ProofTower {
  /** A `data/buildings/` id. Checked at parse against the ids this build actually ships. */
  readonly id: string;
  /** The level this tower is proved at — per tower, because a level is a property of the building. */
  readonly arrivalRatePctPop5min: number;
  /** § 12.3's *why it is in the set* column, authored. Read by the disclosure panel, verbatim. */
  readonly why: string;
}

/** One of the five crowd shapes: what the people do, and how long they do it for. */
export interface ProofCrowd {
  readonly id: string;
  /** The player's name for the shape. No engine identifier ever reaches an Everyday surface. */
  readonly label: string;
  /** What this shape tests, authored — the disclosure panel's second column. */
  readonly tests: string;
  readonly durationS: number;
  /**
   * The shape itself, as core's own demand vocabulary.
   *
   * Deliberately carries no `arrivalRatePctPop5min` and no `entranceWeights`: the level is the
   * tower's (see the module docstring) and the entrance mix is each building's own profile, which
   * is not a thing five shapes shared by eight buildings can state — `MATRIX_CELLS` names
   * `{ G: 1, P1: 0 }` on the two buildings that have a `P1` and omits it on the other three.
   */
  readonly demand: SimulationDemandOptions;
}

/** The document, parsed. The forty are {@link proofCasesOf} over it, never a third field. */
export interface ProofCaseSet {
  readonly version: number;
  readonly towers: readonly ProofTower[];
  readonly crowds: readonly ProofCrowd[];
}

/** One of the forty: a tower, a crowd, and the seed § 1 fixes for the pair. */
export interface ProofCase {
  /** `${towerId}/${crowdId}` — stable, and the key a rating's per-case row is stored under. */
  readonly id: string;
  readonly tower: ProofTower;
  readonly crowd: ProofCrowd;
  /** The crowd's index in the document — § 1's `crowdIndex`, and half of the seed. */
  readonly crowdIndex: number;
  /** § 1's `hash(towerId, crowdIndex)`, decimal, as `BatchRequest.seed` takes it. */
  readonly seed: string;
}

/**
 * § 1's seed rule: `hash(towerId, crowdIndex)`, **fixed forever**.
 *
 * FNV-1a over `towerId#crowdIndex`, 32-bit, integer arithmetic throughout — the same property § 1
 * demands of its own generator (*"equally cheap and equally reproducible across platforms — no
 * `Math.random`, no time-seeded state, no floating-point accumulation order that differs between
 * builds"*). It is not § 1's LCG because that is a *stream* generator and this is a *key*: what is
 * wanted here is one stable number per (tower, crowd), and an LCG stepped `crowdIndex` times from a
 * tower-derived seed would give neighbouring towers correlated case seeds, which is the one thing a
 * fixture list of forty must not have.
 *
 * Changing this function changes every case's crowd and silently invalidates every rating ever
 * published. It is pinned by a test with the values written out, for that reason and no other.
 */
export function proofSeedOf(towerId: string, crowdIndex: number): string {
  let hash = 2166136261;
  const key = `${towerId}#${String(crowdIndex)}`;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash ^ key.charCodeAt(index)) >>> 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return String(hash >>> 0);
}

/**
 * § 1's **bench** seed rule: `hash(testId, repIndex)` — the test half of it.
 *
 * `runBatch` supplies the `repIndex` half (`replicationSeed(request.seed, replication)`, one seed
 * per index shared by every arm — *"this line is the whole of CRN"*), so what a caller owes is one
 * stable number per test. The test **is** a proof case, so the key is the case's own id under a
 * bench prefix.
 *
 * ## Why this is not {@link proofSeedOf}
 *
 * Two reasons, and the second is the one that would survive § 1 being rewritten.
 *
 * 1. § 1's table gives the bench and the gauntlet **different rules** over the same fixture set.
 *    *One list, three readers* (§ 12.3) is a claim about fixtures; a rating is comparable because
 *    the **cases** never move, not because everything that ever runs them shares their traces.
 * 2. CLAUDE.md § Tuning discipline: *"Tune on one seed set, validate on a disjoint one, or you
 *    overfit the weight vector to specific passenger traces and the gain vanishes on new traffic."*
 *    The bench is where a player iterates on a dispatcher and the gauntlet is what rates it. Shared
 *    seeds would make the rating a measurement on the training set.
 *
 * The prefix is a different key space rather than a different hash, so the two rules stay one
 * function's worth of arithmetic and a reader can check either by hand. Disjointness over the
 * shipped forty is **asserted** in `proofCases.test.ts`, not assumed: two hashes of two different
 * strings are only *probably* different, and the probability is not the argument.
 */
export function benchSeedOf(proofCase: ProofCase): string {
  let hash = 2166136261;
  const key = `bench#${proofCase.id}`;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash ^ key.charCodeAt(index)) >>> 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return String(hash >>> 0);
}

/**
 * The forty, tower-major, derived — never authored.
 *
 * Total over a parsed document, so `length === towers.length × crowds.length` holds by
 * construction rather than by assertion. That is the property the disclosure panel's closing
 * arithmetic (*eight × five = forty*) is allowed to state, because it is reading the same two
 * lengths this function multiplies.
 */
export function proofCasesOf(set: ProofCaseSet): readonly ProofCase[] {
  const cases: ProofCase[] = [];
  for (const tower of set.towers) {
    set.crowds.forEach((crowd, crowdIndex) => {
      cases.push({
        id: `${tower.id}/${crowd.id}`,
        tower,
        crowd,
        crowdIndex,
        seed: proofSeedOf(tower.id, crowdIndex),
      });
    });
  }
  return cases;
}

/**
 * One case as a `BatchRequest` — the mapping, in one place, so no caller assembles a request.
 *
 * Field for field: the tower's building and level, the crowd's horizon and demand block, the
 * case's own § 1 seed. `reportWindow` is `full-run` on all forty (the data file's `$comment` argues
 * it), and `arrivalRatePctPop5min` is carried **inside** the demand block rather than beside it
 * because `runBatch` refuses the combination by name — the level and the shape are one population
 * or they are two sources for one thing.
 *
 * `replications` is the caller's, and the gauntlet passes **1**. That is not a budget and is not
 * claimed to be one: see `rating.ts`, which states what a mean over forty single runs may and may
 * not be used to say, and refuses to name a winner from it.
 *
 * **`seed` is the caller's too, and it is required rather than defaulted.** § 1 gives one seed rule
 * per reader over this one list — {@link proofSeedOf} for the gauntlet, {@link benchSeedOf} for the
 * bench — and a default here would be one of the two rules worn silently by the other reader. That
 * is the shape [§ D227](../../../../DECISIONS.md) is about: the caller says which rule it is using,
 * in the call, where a reader of the call can see it.
 */
export function proofCaseRequestOf(
  proofCase: ProofCase,
  arms: readonly BatchArmRequest[],
  replications: number,
  seed: string,
): BatchRequest {
  return {
    buildingId: proofCase.tower.id,
    seed,
    durationS: proofCase.crowd.durationS,
    replications,
    arms,
    arrivalRatePctPop5min: null,
    demand: {
      ...proofCase.crowd.demand,
      arrivalRatePctPop5min: proofCase.tower.arrivalRatePctPop5min,
    },
    reportWindow: 'full-run',
  };
}

/* -------------------------------------------------------------------------- *
 * Parsing
 * -------------------------------------------------------------------------- */

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProofCaseError(`${what} is not an object, so the forty cannot be read from it.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new ProofCaseError(`${what} is not an array.`);
  return value;
}

function asString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProofCaseError(`${what} is not a non-empty string.`);
  }
  return value;
}

function asPositiveNumber(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ProofCaseError(`${what} is not a finite number above zero.`);
  }
  return value;
}

/** What the parse needs to know about this build, so a case cannot name a building it lacks. */
export interface ProofCaseParseContext {
  /** Every id in `data/buildings/`, from the loaded resources. Never a hand-written list. */
  readonly buildingIds: ReadonlySet<string>;
}

/**
 * Parse `data/proof-cases.json`, refusing rather than repairing.
 *
 * The refusals are the file's own invariants made enforceable: a tower naming a building this
 * build does not ship (the case could not run, and a rating over thirty-nine is not a rating —
 * § 12.3), a duplicate id (the cross product would run one case twice under two names), and an
 * empty list either side (`towers × crowds` would be zero and every rating a mean of nothing).
 *
 * It does **not** check that there are exactly eight towers and five crowds. The count is a
 * property of the authored set, and hard-coding forty here would be the second copy of the list
 * this module exists to prevent — one that disagreed with `data/` on the day somebody authored
 * Harbour Point. What is asserted about the count lives in `proofCases.test.ts`, against the file.
 */
export function parseProofCases(raw: unknown, context: ProofCaseParseContext): ProofCaseSet {
  const root = asRecord(raw, 'data/proof-cases.json');
  const version = root['version'];
  if (version !== 1) {
    throw new ProofCaseError(
      `data/proof-cases.json declares version ${String(version)}; this build reads version 1.`,
    );
  }

  const towers = asArray(root['towers'], 'towers').map((entry, index) => {
    const record = asRecord(entry, `towers[${String(index)}]`);
    const id = asString(record['id'], `towers[${String(index)}].id`);
    if (!context.buildingIds.has(id)) {
      throw new ProofCaseError(
        `proof tower "${id}" names a building this build does not ship, so its five cases could ` +
          `not run — and a rating taken over fewer than every case is not the rating the forty ` +
          `define. Known buildings: ${[...context.buildingIds].sort().join(', ')}.`,
      );
    }
    return {
      id,
      arrivalRatePctPop5min: asPositiveNumber(
        record['arrivalRatePctPop5min'],
        `towers[${String(index)}].arrivalRatePctPop5min`,
      ),
      why: asString(record['why'], `towers[${String(index)}].why`),
    } satisfies ProofTower;
  });

  const crowds = asArray(root['crowds'], 'crowds').map((entry, index) => {
    const record = asRecord(entry, `crowds[${String(index)}]`);
    return {
      id: asString(record['id'], `crowds[${String(index)}].id`),
      label: asString(record['label'], `crowds[${String(index)}].label`),
      tests: asString(record['tests'], `crowds[${String(index)}].tests`),
      durationS: asPositiveNumber(record['durationS'], `crowds[${String(index)}].durationS`),
      demand: asRecord(
        record['demand'],
        `crowds[${String(index)}].demand`,
      ) as SimulationDemandOptions,
    } satisfies ProofCrowd;
  });

  if (towers.length === 0 || crowds.length === 0) {
    throw new ProofCaseError(
      'the proof set needs at least one tower and one crowd shape; an empty side makes every ' +
        'rating a mean of nothing.',
    );
  }
  requireUniqueIds(towers, 'tower');
  requireUniqueIds(crowds, 'crowd');
  return { version, towers, crowds };
}

function requireUniqueIds(entries: readonly { readonly id: string }[], what: string): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new ProofCaseError(
        `${what} "${entry.id}" appears twice; the cross product would run one case under two names.`,
      );
    }
    seen.add(entry.id);
  }
}
