/**
 * `@elevator-sim/experiments/browser` — the **environment-free** entry point.
 *
 * Two specifiers resolve to this file:
 *
 * - `@elevator-sim/experiments/browser` — always, in every environment.
 * - `@elevator-sim/experiments` — under the `browser` export condition, i.e. whenever a bundler
 *   is building for the browser. Under Node the same specifier resolves to `./index.js`, the
 *   package's full surface.
 *
 * ## Why this file exists
 *
 * docs/10-experience-layer-contract.md § 13 q1, which is a **prerequisite** and not a preference:
 * *"W4 cannot start against `collectSearchSpace()` until this is answered."* Before this file, the
 * package declared exactly `"."` and `"./package.json"` — no `browser` condition, and no subpath —
 * so a deep import of `tuning/space` was refused by the resolver, and the one entry that did exist
 * put a `node:` builtin into any browser bundle that touched it. A bundler replaces a Node builtin
 * with a stub that throws **at module evaluation**, so that is not a latent problem a consumer can
 * work around: it kills the page before a line of consumer code runs.
 *
 * `core` solved the same problem in DECISIONS.md § D31–§ D33 and this is a port of that solution:
 * a browser barrel, an export condition routing the plain specifier to it, and a graph-walk guard
 * asserted in both directions (`browser.test.ts`).
 *
 * **Measured, on the built output, with every `node:` builtin stubbed to throw:**
 * `dist/browser.js` pulls **12 emitted modules and 0 `node:` edges** and loads; `dist/index.js`
 * pulls 68 and **5** and does not. Under `--conditions=browser`, `@elevator-sim/experiments`
 * resolves to `dist/browser.js` and `@elevator-sim/core` to `core`'s `dist/browser.js`, and
 * `collectSearchSpace()` returns **49 ids** — the *same* 49 it returns under Node against
 * `core`'s full barrel. That is docs/10's **M10, corrected** confirmed rather than assumed:
 * discovery against either `core` barrel gives identical results, which is why W4 does not need a
 * second implementation of it.
 *
 * ## Where this differs from `core`'s split, and why
 *
 * In `core` the browser barrel is **the whole package** and `src/index.ts` is that barrel plus
 * `loadConfig` — the safe surface is the default and the unsafe one takes a deliberate act. That
 * polarity is right there because exactly one function in `core` was environment-bound.
 *
 * It is not available here, and inverting it would be a lie. This package's centre of gravity —
 * the replication runner's worker pool, NDJSON persistence, and every acceptance gate that reads
 * the real `data/` directory — is environment-bound *by purpose*, not by accident. Measured from
 * `src/index.ts`, three modules reach a Node builtin:
 *
 * | module | builtins | reached via |
 * |---|---|---|
 * | `runner/parallel.ts` | `node:os`, `node:worker_threads` | `index.ts → runner/index.ts` |
 * | `reports/persistence.ts` | `node:fs/promises`, `node:path` | `index.ts → reports/index.ts` |
 * | `validation/harness.ts` | `node:url` | `index.ts → benchmark/index.ts → benchmark/verdict.ts` |
 *
 * (`runner/worker.ts` and `validation/{golden,goldenChild}.ts` import builtins too and are not
 * reachable from `src/index.ts`; the worker entry is addressed as a URL rather than imported.)
 *
 * So this barrel is **additive and narrow**: `src/index.ts` is untouched and remains the package's
 * full Node surface, and this file is a stated subset. The direction-of-default argument from
 * § D31 is honoured in the one place it still can be — the `.` specifier *does* carry the `browser`
 * condition, so a browser build that reaches for the package by its plain name gets a working
 * module and a **build-time** "no such export" for anything not offered here, rather than a
 * throwing stub at load time. That trade is stated again under *Limitations* below.
 *
 * ## What is here, and why each of it is here
 *
 * Nothing is here because it happened to be free of `node:`. Every block answers a named consumer
 * in docs/10 § 11, or exists so that consumer cannot end up as a second source of truth about a
 * number:
 *
 * | block | why |
 * |---|---|
 * | `tuning/space` | **W4**, the blocking case: the generated dispatcher/traffic editor is pointed at {@link collectSearchSpace} and {@link discoverParameterSchemas}, and its acceptance derives the control list *from the function* rather than from a fixture |
 * | `reports/statistics.ts` | **W3**: a batch that renders a mean must not re-implement the paired-t interval. CLAUDE.md § Statistical discipline — a difference is declared only through an interval that excludes zero — is only enforceable if the arithmetic is the same arithmetic |
 * | {@link intervalContainsZero} | the function that *reads the verdict* off an interval. It is the one line between a paired interval and the overlap fallacy, and it costs nothing to ship |
 * | `runner/crn.ts` | **W3**, § 13 q1 by name: *"whether the batch reuses `packages/experiments`'s CRN manager … or duplicates a minimal seed-pairing rule. Duplicating is a second source of truth about pairing and should be avoided."* This is the non-duplicating answer |
 * | `runner/metrics.ts` | the `RunSummary` → scalar projection. Its own docstring gives the reason: the alternative is each consumer reaching into `summary.waiting.meanS` for itself, which is how two reports of the same run quote different numbers under the same name |
 * | `runner/stopping.ts` | *how many replications is enough* is exactly where confident nonsense enters a browser batch, and {@link halfWidthStoppingRule} is this project's shipped answer |
 *
 * ## What is deliberately **not** here
 *
 * `oracle/` and `fuzz/` are environment-free today — measured, not assumed — and are still left
 * off. A name on this barrel is a promise the guard must keep for as long as the name exists: it
 * constrains every module that name reaches, forever. Nothing in docs/10 asks for either, and a
 * surface widened past its consumers is this repository's signature defect wearing a different
 * hat. Adding them later is a two-line edit, and `browser.test.ts` will say immediately whether
 * they still qualify.
 *
 * Everything else is excluded because it fails the guard: `reports/` beyond `statistics.ts` and
 * `types.ts` — persistence, replay, re-analysis, `compare.ts` and `format.ts`, which reaches
 * persistence through `compare.ts` — the runner's execution half (`experiment.ts`,
 * `replication.ts`, `replicationRunner.ts`, `parallel.ts`, `worker.ts`), `benchmark/`,
 * `validation/`, and `tuning/{search,report}`. The last two only because they draw on the runner
 * and on `validation/harness.ts`, not because anything about a search is Node-bound.
 *
 * ## One name held back — `canonicalJson`
 *
 * `runner/crn.ts` and `reports/persistence.ts` each export a function of that name with different
 * and non-interchangeable semantics, and `src/index.ts` therefore exports neither under the bare
 * name. Only the runner's is reachable from here, so exporting it would be *safe* on this barrel
 * and would still be wrong: a consumer moving between the two barrels would silently get two
 * different serializers under one name, and the symptom is a wrong digest rather than a compile
 * error. The fingerprints a caller actually wants — {@link traceKeyOf} here, and
 * `traceDigest`/`runRecordFingerprint`/… on the Node barrel — are exported by name.
 *
 * ## Limitations, stated rather than discovered
 *
 * - **TypeScript does not apply the `browser` condition.** Under `moduleResolution: NodeNext`, a
 *   browser-only file importing `@elevator-sim/experiments` sees the *Node* types — the full
 *   surface — even though the bundle will contain only what is below. `core` records the same
 *   limitation (§ D31 § Consequences) where the gap was one function; here it is most of the
 *   package, so the mitigation matters more: **browser-only code should import
 *   `@elevator-sim/experiments/browser`**, whose types are `dist/browser.d.ts` and therefore match
 *   what the bundler will actually give it.
 *
 *   **Closed mechanically 2026-07-28** (DECISIONS.md § D127). "Should" is now "must":
 *   `packages/viz/src/boundaries.test.ts` fails on a bare `@elevator-sim/experiments` specifier
 *   anywhere in that package — **tests included**, because nothing in a renderer has a legitimate
 *   use for this package's Node surface. Manufactured and watched: on the violation
 *   `tsc -p packages/viz --noEmit` exits **0** and the guard names the offending file. `tsc`
 *   exiting zero is the point — the compiler cannot see this, so something else has to.
 * - **This barrel had no non-test caller**, and that was said plainly rather than dressed up. It
 *   could not have one: the consumer it exists for is W4, which docs/10 recorded as unable to start
 *   without it. Tracked as `C34`.
 *
 *   **`C34` is closed** (DECISIONS.md § D127, docs/10 **M25**). W4 landed as
 *   `packages/viz/src/controls/`, mounted by `packages/viz/src/dev/parameterForm.ts`, and the count
 *   is **measured with this repository's own scanner** rather than asserted — `corpus`, `isBarrel`
 *   and `auditModules` from `tuning/callers.test-helper.ts`, comments stripped so a `{@link}` tag
 *   is not an import: **0 → 3** non-test, non-barrel importers, and `tuning/space`'s uncalled
 *   exports **6 → 3**, because `activeParameters`, `parameterOf` and `defaultCandidate` were
 *   written for a generic editor and now have one. `browser.test.ts` remains the mechanical owner
 *   of this file's *contents*; `boundaries.test.ts` is the mechanical owner of how it is reached.
 *
 * **Do not add an export here whose module reaches a Node builtin**, and do not add one whose
 * module reaches `loadConfig` — under the `browser` condition `@elevator-sim/core` resolves to
 * `core`'s browser barrel, which does not have it. Both are asserted in `browser.test.ts`.
 */

/* -------------------------------------------------------------------------- *
 * tuning/space — the self-describing search space (CLAUDE.md invariant 8).
 *
 * docs/10 § 11 W4. Discovery off `core`'s own `*_PARAMETERS` schemas, the
 * `activeWhen` gate, sampling from an injected `Rng` (never `Math.random`,
 * invariant 2), and the point ⇄ profile map that ends in a real
 * `DispatcherProfile` validated by the parser `loadConfig` uses.
 *
 * The whole of `tuning/space/index.ts`, with no name added or dropped: this
 * module was already environment-free and says so in its own docstring, and the
 * only thing that stopped a browser using it was the resolver.
 * -------------------------------------------------------------------------- */

export {
  PARAMETER_SCHEMA_SUFFIX,
  PROFILE_OBJECT_SECTIONS,
  PROFILE_SECTIONS,
  SearchSpaceError,
  activeParameters,
  activeWhenSatisfied,
  applyPatch,
  buildingFeasibility,
  candidateFromProfile,
  candidateProfile,
  candidateSampler,
  candidatesEqual,
  collectSearchSpace,
  decodeCandidate,
  decodeInto,
  defaultCandidate,
  discoverParameterSchemas,
  encodeCandidate,
  fromVector,
  isActive,
  isActiveWhenRange,
  isProfileAuthorable,
  materializer,
  parameterOf,
  parseProfile,
  perturbCandidate,
  perturbValue,
  policyNoiseStream,
  readerFor,
  reflectInto,
  sampleCandidate,
  sampleCandidates,
  sampleValue,
  searchSpace,
  subspace,
  toVector,
  validateValues,
  vectorDimensions,
  vectorSpace,
} from './tuning/space/index.js';

export type {
  ActiveWhenCondition,
  ActiveWhenConditions,
  BooleanParameter,
  Candidate,
  CandidateProfileOptions,
  CategoricalParameter,
  CollectOptions,
  ContinuousParameter,
  GateReader,
  IntegerParameter,
  NumericParameter,
  ParameterScale,
  ParameterValue,
  PerturbOptions,
  ProfilePatch,
  ProfileSection,
  ProfileSource,
  SampleOptions,
  SearchParameter,
  SearchParameterCommon,
  SearchSpace,
  VectorDimension,
} from './tuning/space/index.js';

/* -------------------------------------------------------------------------- *
 * stats — the interval arithmetic (`reports/statistics.ts`), and the one
 * function that reads a verdict off an interval (`reports/types.ts`).
 *
 * Student-t at `n - 1`, at every `n`, and every estimate records the family it
 * used (docs/03 § Part 4, DECISIONS.md § D7). Pure: no RNG, no clock, no
 * mutation of an input.
 *
 * `intervalContainsZero` comes with it on purpose. CLAUDE.md § Statistical
 * discipline forbids concluding from two overlapping intervals, and the only
 * cheap defence is that the legitimate question — *does the paired interval
 * exclude zero?* — is one import away.
 * -------------------------------------------------------------------------- */

export {
  DEFAULT_CONFIDENCE,
  PUBLISHED_INTERVAL_FAMILY,
  estimateMean,
  meanOf,
  normalQuantile,
  pairedDifferenceEstimate,
  sampleStdDevOf,
  studentTCdf,
  studentTQuantile,
} from './reports/statistics.js';

export type { EstimateOptions, PublishedMeanEstimate } from './reports/statistics.js';

export { ReportsError, intervalContainsZero } from './reports/types.js';

export type { IntervalMethod, MeanEstimate } from './reports/types.js';

/* -------------------------------------------------------------------------- *
 * runner/crn.ts — the common-random-numbers manager.
 *
 * docs/10 § 13 q1 and § 11 W3 name this directly. Seed derivation through the
 * `'replication:'` stream (invariant 2 and invariant 5: the seed is what makes a
 * run replay), the trace-comparability equivalence class, and the audit of a
 * finished result against it.
 *
 * `canonicalJson` is held back — see the module docstring above.
 * -------------------------------------------------------------------------- */

export {
  REPLICATION_STREAM_PREFIX,
  assertCrnAligned,
  crnCohortsOf,
  normalizeExperimentSeed,
  replicationSeed,
  replicationSeeds,
  traceKeyOf,
  verifyCrnAlignment,
} from './runner/crn.js';

export type { CrnAlignmentReport, CrnMismatch } from './runner/crn.js';

/* -------------------------------------------------------------------------- *
 * runner/metrics.ts — `RunSummary` → one number per named metric.
 *
 * The single place that says which scalar "the AWT" is. `NaN` is passed through
 * rather than coalesced, because "no passengers waited" and "passengers waited
 * zero seconds" are different facts.
 * -------------------------------------------------------------------------- */

export {
  REPLICATION_METRICS,
  isReplicationMetric,
  metricOf,
  metricsOf,
} from './runner/metrics.js';

export type { ReplicationMetric } from './runner/metrics.js';

/* -------------------------------------------------------------------------- *
 * runner/stopping.ts — the sequential rule, and the fixed-budget one.
 *
 * A non-finite half-width means "not yet precise enough" and never the reverse,
 * which is the safe direction: an experiment that runs too long wastes CPU and
 * one that stops too early publishes a number it did not earn.
 * -------------------------------------------------------------------------- */

export { fixedBudgetStoppingRule, halfWidthStoppingRule } from './runner/stopping.js';

export type {
  HalfWidthEstimate,
  HalfWidthEstimator,
  HalfWidthStoppingOptions,
} from './runner/stopping.js';

/* -------------------------------------------------------------------------- *
 * benchmark/matrixCells.ts — the experiment matrix's eight operating points.
 *
 * Everyday Mode's suite (docs/18 § Slice 7) runs one comparison over multiple
 * fixed cells, and its fixture list must be imported from `MATRIX_CELLS`,
 * never retyped — the matrix's eight are building × traffic-pattern cells and
 * a hand copy would be a second source of truth about which operating points
 * this project measures. The cells are pure frozen data (their one import is
 * a type from `runner/types.ts`, already on this graph); the machinery that
 * runs a cell stays on the Node barrel. § D406 rules it; the module's
 * docstring carries the argument.
 *
 * Deliberately narrow: `EXCLUDED_CELLS` and the study runners are not here —
 * a name on this barrel is a promise the guard must keep, and the suite
 * consumes exactly the list and the lookup.
 * -------------------------------------------------------------------------- */

export { MATRIX_CELLS, matrixCell } from './benchmark/matrixCells.js';

export type { BudgetBasis, MatrixCell } from './benchmark/matrixCells.js';

/* -------------------------------------------------------------------------- *
 * runner/types.ts — only the types the values above need in their signatures.
 *
 * Deliberately not the whole module: most of what it declares describes the
 * execution machinery this barrel does not offer, and a type for a thing you
 * cannot call is an invitation to look for it.
 * -------------------------------------------------------------------------- */

export { RunnerError } from './runner/types.js';

export type {
  CellResult,
  CellSimulationConfig,
  CrnCohort,
  ExperimentCell,
  ReplicationRecord,
  StoppingRule,
  StoppingRuleInput,
  StoppingVerdict,
} from './runner/types.js';
