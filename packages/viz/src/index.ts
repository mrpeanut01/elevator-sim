/**
 * `@elevator-sim/viz` — the visualization package.
 *
 * ## The dependency direction, which is the whole point
 *
 * This package imports `@elevator-sim/core`. `core` imports nothing from here and must build
 * and test with this package absent — CLAUDE.md invariant 6, verified in its strong form by
 * physically removing the package and rebuilding, not by reading the imports.
 *
 * ## The four layers, in dependency order
 *
 * | Layer | Module | Depends on |
 * |---|---|---|
 * | Contract | `contract/` | `core` types only |
 * | Recording | `record/` | `core` — the only place a simulation is run |
 * | Frames | `frame/` | the contract. Pure: `(recording, t) → Frame` |
 * | Playback | `playback/` | frames, plus an injected {@link DisplayClock} |
 * | Rendering | `render/` | frames. Draws through a structural 2D context, never the DOM |
 *
 * Nothing points back up. A renderer cannot start a simulation, playback cannot draw, and the
 * frame producer cannot read a clock.
 *
 * ## Named non-test callers
 *
 * The roadmap's standing requirement is that a shipped behaviour must name a caller that is not
 * one of its own tests. This barrel is **not** that caller — a re-export looks exactly like one
 * and is not. The callers are:
 *
 * | Export | Non-test caller |
 * |---|---|
 * | {@link recordRun} | `src/dev/main.ts`, the browser viewer's load path |
 * | {@link frameAt} | `Playback.frame()`, called every animation frame by `src/dev/main.ts` |
 * | {@link frameSequence} / {@link serializeFrames} | `src/dev/main.ts`'s **Verify replay** control, and the replay test |
 * | {@link Playback}, {@link systemClock} | `src/dev/main.ts` |
 * | {@link buildLayout}, {@link drawScene} | `src/dev/main.ts` |
 * | {@link ManualClock} | tests only, by construction — it is the test double |
 *
 * `frameSequence` and `serializeFrames` exist because Phase 4's acceptance criterion needs a
 * headless, browser-free way to compare two replays. They would have shipped as "configurable,
 * unit-tested, never called from a shipped path" — the failure this repository has repeated
 * five times — so the dev viewer's **Verify replay** control runs exactly the comparison
 * `replay.test.ts` runs, from a button, on the run currently on screen.
 */

export {
  VIZ_SCHEMA_VERSION,
  type DoorPhase,
  type Frame,
  type FrameCar,
  type FrameLanding,
  type StepSeries,
  type TravelDirection,
  type VizDoorMark,
  type VizFloor,
  type VizLanding,
  type VizProgress,
  type VizRecording,
  type VizShaft,
  type VizSummary,
} from './contract/types.js';

export {
  StepSeriesBuilder,
  constantSeries,
  lastAtOrBefore,
  stepIndexAt,
  stepValueAt,
} from './contract/series.js';

export { instrumentCar, shortCarLabel, type CarTrack } from './record/instrument.js';
export { recordRun, type RecordedRun } from './record/recordRun.js';

export {
  carDirectionAt,
  carFloorIdAt,
  carHeightAt,
  doorFractionAt,
  doorPhaseAt,
  frameAt,
  isSupportedRecording,
} from './frame/frameAt.js';
export {
  frameSequence,
  frameTimes,
  serializeFrames,
  type SequenceOptions,
} from './frame/sequence.js';

export { ManualClock, systemClock, type DisplayClock } from './playback/clock.js';
export {
  MAX_SPEED,
  MIN_SPEED,
  assertSpeed,
  displayMsAt,
  reanchor,
  simTimeAt,
  type PlaybackAnchor,
} from './playback/mapping.js';
export { Playback, type PlaybackOptions, type PlaybackState } from './playback/playback.js';

export {
  buildLayout,
  type FloorRow,
  type Layout,
  type LayoutOptions,
  type Rect,
  type ShaftColumn,
} from './render/layout.js';
export {
  DEFAULT_THEME,
  drawScene,
  formatClock,
  type Canvas2DLike,
  type SceneInput,
  type Theme,
} from './render/canvas.js';
