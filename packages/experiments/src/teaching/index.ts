/**
 * `experiments/teaching` — docs/14 § 4.2's teaching surface, and its round.
 *
 * Two modules, one barrel:
 *
 * | | |
 * |---|---|
 * | `teaching/spec.ts` | the declaration: building, traffic, observations, action space, objective, budget, and the held-out traffic seeds a policy may never see — every clause of § 4.2 as a refusal |
 * | `teaching/round.ts` | the driver: census and resolution limit on the training traffic, the search on the training traffic, and **every published interval on the holdout traffic** |
 *
 * Names are listed explicitly and nothing is `export *`, matching `tuning/index.ts` and `core`'s
 * barrel: adding an export is then a deliberate widening of the surface.
 *
 * **This barrel is not a caller.** `docs/05-roadmap.md` § *Standing requirement* and eleven shipped
 * instances say so: a barrel re-export and a `{@link}` tag look exactly like a caller and are not
 * one. The non-test caller of this module is `packages/cli/src/commands/tune.ts` under
 * `--teaching`, which is the same answer Phase 7 gave for `tuning/` and for the same reason —
 * the surface has to be *reached from something a user runs*, or it is the twelfth instance.
 *
 * ## Why this sits beside `benchmark/` rather than inside it
 *
 * `benchmark/`'s modules carry six registration obligations (`published.ts`'s
 * `STUDY_ENTRY_POINTS`, a pin table, a `checkPinned` call, a driver that is not a test, a figures
 * function, and count pins for every headline count), and `published.test.ts` enforces them by
 * scanning that **directory**. Those obligations exist for a study that publishes a figure the
 * repository then quotes. This module is not a study: it is the surface a study is declared
 * *against*, and a run of it publishes nothing until somebody pins the numbers it returned. A
 * measurement taken through it belongs in `benchmark/` with all six obligations discharged.
 */

export {
  ACTION_PARAMETER_PREFIX,
  MAX_VERDICT_REPLICATIONS,
  MIN_VERDICT_REPLICATIONS,
  OBSERVATION_CAUSALITIES,
  TeachingError,
  parseTeachingSpec,
  teachingSeedSets,
} from './spec.js';

export type {
  ObservationCausality,
  ObservationFeature,
  TeachingActionSpace,
  TeachingBudget,
  TeachingObjective,
  TeachingSeedPlan,
  TeachingSeedSets,
  TeachingSpec,
} from './spec.js';

export { formatTeachingRound, runTeachingRound } from './round.js';

export type {
  TaughtCandidate,
  TaughtPolicy,
  TeachingCellResult,
  TeachingRound,
  TeachingRoundInput,
} from './round.js';
