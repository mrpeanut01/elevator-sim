/**
 * `experiments/validation` — the Phase 3 acceptance gate.
 *
 * Not a library the rest of the project builds on: an executable argument that the experiment
 * infrastructure can be trusted. `docs/05-roadmap.md` § Phase 3 states four acceptance criteria,
 * and each has a suite here that measures it against the real `data/` directory and the real
 * simulator, prints the numbers, and asserts the criterion rather than a tolerance:
 *
 * | Suite | Criterion |
 * |---|---|
 * | `nullComparison.test.ts` | 1 — a dispatcher against itself: exactly zero under CRN, and a calibrated interval across disjoint seeds |
 * | `crippledVariant.test.ts` | 2 — a config-only crippled variant is detected, plus the power curve that gives the project's resolution limit |
 * | `crnVarianceReduction.test.ts` | 3 — the measured variance reduction from common random numbers, and how it varies with how similar the two arms are |
 * | `storedRunReplay.test.ts` | 4 — a stored record, reloaded from disk and **re-executed**, reproduces its result |
 * | `sequentialStopping.test.ts` | the stopping rule against the doc's ±2 s / 90 % target and its 50–200 budget |
 * | `operatingPoint.test.ts` | the saturation-suppression census that decides where the gate can legitimately measure |
 *
 * ## Phase 8's three verification tracks live here too
 *
 * | Suite | Track |
 * |---|---|
 * | `goldenRuns.test.ts` (+ `golden.ts`, `golden/manifest.json`, `goldenChild.ts`) | determinism regression — golden runs replay byte-identically from stored seeds, with a per-field negative control |
 * | `perfScaling.test.ts`, `perfSweep.test.ts` (+ `perfInstrument.ts`) | scale & performance — the 100-floor building, the scaling curve, the 20 000-replication sweep, the memory profile |
 * | `adversarial.test.ts` (+ `serviceMode.ts`, `syntheticBuilding.ts`) | adversarial edge cases — saturation, single car, all calls to one landing, access lockout, service mode |
 *
 * They are here rather than in a `perf/` directory of their own because `moduleTree.test.ts`
 * requires every source directory to be named in `docs/01-architecture.md`, which has a different
 * owner; `perfInstrument.ts` records that in full.
 *
 * Only {@link harness} is exported. The suites are the deliverable; the harness is what they
 * share, and it is exported so a Phase 5 or Phase 7 comparison can reuse the same paired-t
 * plumbing rather than growing a second one. **Nothing from the Phase 8 modules is exported**,
 * deliberately: a barrel entry whose only consumers are its own tests is the exact shape
 * `docs/05-roadmap.md`'s standing requirement is about, and adding one here would make a gate
 * look like a library.
 */

export {
  DATA_DIR,
  GATE_BUILDING,
  GATE_REPLICATIONS,
  GATE_SEED,
  MIDTOWN_UP_PEAK,
  cellOf,
  comparePaired,
  derivedProfile,
  digestsOf,
  formatEstimate,
  gardenAt,
  intervalExcludesZero,
  loadResources,
  measureCrnBenefit,
  midtownUpPeakAt,
  productionStoppingRule,
  runGateExperiment,
  samplesOf,
  withProfiles,
} from './harness.js';

export type {
  CrnStudy,
  CrnStudyInput,
  GateRunInput,
  PairedComparison,
} from './harness.js';
