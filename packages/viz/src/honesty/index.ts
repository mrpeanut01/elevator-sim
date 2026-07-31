/**
 * `honesty/` — [§ D163](../../../../DECISIONS.md) clause 1: the honesty property under **search**.
 *
 * ## The named non-test caller
 *
 * `honesty/campaign.ts` — `runHonestyCampaign` — is this directory's driver, and it is called on
 * every `vitest run` by `honesty.test.ts` over {@link STANDARD_CORPUS}. That is the same answer
 * `packages/experiments/src/index.ts` gives for `fuzz/`, and it is the same answer for the same
 * reason: *"a search is a driver plus a corpus, and the corpus runs in the suite."* Every other
 * module here is reached from that driver — `generate.ts` makes the case, `run.ts` runs it,
 * `surfaces.ts` renders it, `properties.ts` judges it, `shrink.ts` reduces what failed.
 *
 * `faults.ts` and `derive.test-helper.ts` are the two exceptions, and each is a *test* instrument
 * by construction: one injects a violation so a property can be shown to fire, the other reads
 * the source tree, which a browser-facing module may not do.
 *
 * ## Where the mode dimension plugs in
 *
 * `HONESTY_MODES` in `types.ts`, which now names both `'basic'` and `'advanced'`. Every case
 * carries a mode, the corpus distributes across both, and `context.case.mode` reaches every
 * adapter — see the tuple's own docstring for what the axis does and does not buy today.
 */

export { caseFromSeed, formatHonestyCase, DEEP_SPACE, STANDARD_SPACE } from './generate.js';
export type { GenerateOptions, HonestySpace } from './generate.js';

export {
  deepCampaignRequested,
  deepCampaignSize,
  deepSeeds,
  formatFailure,
  formatHonestyStats,
  runHonestyCampaign,
  STANDARD_CORPUS,
} from './campaign.js';
export type { HonestyCampaignOptions, HonestyCampaignResult } from './campaign.js';

export { checkAll, PROPERTY_CHECKS } from './properties.js';

export {
  batchRequestFor,
  contextFor,
  evaluateCase,
  isFailure,
  recordingConfigFor,
  UnrunnableCase,
} from './run.js';
export type { HonestyResources } from './run.js';

export { shrinkCase } from './shrink.js';
export type { HonestyShrinkResult, ShrinkOptions } from './shrink.js';

export {
  coveredDeclarations,
  renderAll,
  sampleTimes,
  suppressionOf,
  SURFACE_ADAPTERS,
  textCapturingContext,
} from './surfaces.js';
export type { ControlSpace, HonestyContext, StageBundle, SurfaceAdapter } from './surfaces.js';

export { HONESTY_MODES, HONESTY_PROPERTIES, HONESTY_SKIP_REASONS } from './types.js';
export type {
  HonestyCampaignStats,
  HonestyCase,
  HonestyMode,
  HonestyOutcome,
  HonestyProperty,
  HonestySkipReason,
  HonestyViolation,
  RenderedText,
  TextProvenance,
  TextRole,
} from './types.js';
