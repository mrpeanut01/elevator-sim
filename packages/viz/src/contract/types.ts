/**
 * The rendering contract: the seam between a simulation run and anything that draws it.
 *
 * ## What a renderer consumes, and why it is not a live `Simulation`
 *
 * A renderer consumes a {@link VizRecording} — a finished, serialisable, seed-bearing
 * description of one replication. It never consumes a live `Simulation`, and the reason is
 * structural rather than stylistic.
 *
 * `Simulation.run()` is one synchronous call that returns when the whole replication is over.
 * There is no live clock inside it to sample, and there could not be one: CLAUDE.md invariant 3
 * says no wall-clock time in `core/`, so `core` has no notion of "now, at 60 Hz". A renderer
 * that wanted to drive the kernel would have to invert that control, which means either a tick
 * loop (destroying the discrete-event guarantee) or a wall clock inside `core` (destroying
 * invariant 3). Both are worse than the alternative, which costs nothing: a replication of a
 * shipped building simulates in milliseconds, so the run happens *first* and playback samples
 * the result.
 *
 * That choice is what makes Phase 4's acceptance criterion mechanically checkable. "A stored
 * run replays visually identically" is, under this contract, the statement that
 * `frameAt(recording, t)` is a pure function and that `recordRun(config)` is deterministic in
 * the seed — both of which are testable in Node with no browser and no timers. See
 * `src/replay/replay.test.ts`.
 *
 * ## Why the recording is not the `RunRecord`
 *
 * A `RunRecord` is a statistical dataset. It carries passenger legs, load samples and queue
 * samples — but *not* where a car was at 12.34 s, because no statistic needs that. The
 * ingredients of `Car.positionAt` are per-move values (`fromHeightM` plus the `MotionProfile`
 * the kernel timed the move with) and they live on the {@link CarMotion} objects `departFor`
 * returns, which the record has no reason to keep.
 *
 * So a recording is a *second* projection of the same run, aimed at a screen instead of at a
 * confidence interval. It is derived from the run and from nothing else: every number in it is
 * either a `CarMotion`/`DoorMachineState` the kernel produced, or a step series folded out of
 * the `RunRecord`'s own passenger and load samples. The picture and the statistics therefore
 * cannot disagree, because there is only one source.
 *
 * ## Time
 *
 * Every time in this file is **simulated seconds**, sourced from the kernel, exactly as
 * everywhere else in the project. Display time — milliseconds off a wall clock or a test's
 * fake clock — appears only in `src/playback/`, which converts one to the other and is the
 * single place in the package where the two meet. Nothing here knows what a frame rate is.
 */

import type {
  AwtInvalidGround,
  CarMotion,
  Direction,
  DoorConfig,
  DoorMachineState,
  PassengerModel,
  ServiceLevelVerdict,
  SimTime,
  SimulationStatus,
} from '@elevator-sim/core/browser';

/**
 * Bumped when the shape below changes incompatibly.
 *
 * A recording is serialisable on purpose — the replay harness round-trips one through JSON
 * before sampling it, so a field that cannot survive `JSON.parse(JSON.stringify(x))` is a test
 * failure rather than a surprise in wave 2.
 *
 * ## Version history
 *
 * | Version | Change |
 * |---|---|
 * | 1 | Wave 1's first shape. |
 * | 2 | `VizProgress.served` / `Frame.served` renamed {@link VizProgress.boardedLegs}, because the counter counts **leg boardings** and the header called them people. See `the root DECISIONS.md`. |
 * | 3 | {@link VizRecording.legs} added — the per-leg array `UX.md` § 7.2 and `DECISIONS.md` D15 reserved for the wave that acquires a consumer. Wave 2 is that wave: `src/frame/overlay.ts` reads it for the windowed figures the live metrics overlay shows, and `landingAssignmentsAt` reads its `carId`/`bankId` for `RV-T3`. See `the root DECISIONS.md`. |
 * | 4 | {@link VizRecording.passengerModel}, {@link VizLeg.destinationFloorId} and {@link VizLeg.assignedCarId} added, so a **Level-1** (destination-dispatch) run can be drawn as the thing it is. `docs/09-destination-dispatch-contract.md` § 3.1 required either this bump or a refusal in `recordRun`; § T18-D1 of `the root DECISIONS.md` records which was chosen and what was measured. |
 * | 5 | {@link VizSummary} widened to what `docs/10-experience-layer-contract.md` § 11 **W2** names: the reporting {@link VizSummary.window}, the long-wait triple, **the count every estimate was computed from** (R13), {@link VizHandlingCapacity}, {@link VizAchievedInterval}, {@link VizServiceLevel} and {@link VizEnergy}. Every field lands with the figure that draws it — `src/render/runSummary.ts`, mounted by `src/dev/main.ts` — because a field with no consumer is this repository's signature defect and W2 is the unit the design says is most likely to acquire one. |
 * | 6 | {@link VizLeg.credentialGroup} added — `docs/10` § 10.4's *"one genuine contract widening U8 needs"*, so the recording can tell **nobody came** from **nobody may come**. Its consumers land in the same change: `src/access/lockedOut.ts` classifies a locked-out landing by it, `src/render/canvas.ts` marks the landing and banners it, and `src/render/describeFrame.ts` says which credential went unread. § 10.4 asked for version 5 and W2 took that number first; this is the same field at the next one. |
 * | 7 | {@link VizLeg.alightedAt}, {@link VizRecording.decisions} and {@link VizRecording.demandPhases} added, for `docs/12-design-handoff.md` § 3.1 BE1, BE2 and BE4. Each lands with the surface that reads it: *carried today* and the report's carried figure read `alightedAt`, the left rail's **WHY IT DID THAT** log reads `decisions`, and the transport timeline reads `demandPhases`. None of the three is derivable from version 6 — `boardedAt` is not delivery, a decision's losing bids are discarded by the time the run returns, and the phase schedule lives on the resolved template rather than on the result. |
 * | 8 | {@link VizSummary.awtInvalidGround} added — the machine-readable half of a refused mean, beside the sentence {@link VizSummary.awtInvalidReason} has carried since version 1. `core` publishes it on `RunSummary` from `metrics/awtValidity.ts`'s ground table (`the root DECISIONS.md` § D183), and **the consumer landed one commit before the transport**: `src/mode/disclosure.ts` already words a Basic suppression lead per ground and, without this field, fell back to the ground-free sentence on every recording this build produced. So this is the reverse of the usual order and the reason is stated rather than implied — a field arriving before its reader is this repository's dead seam, a reader arriving before its field is a fallback that fires. Not derivable from version 7: which of the four grounds fired is a decision `diagnoseAwtValidity` makes in its own precedence order, and re-deriving it here from `saturated`, `waitCount`, `unservedCount` and `serviceLevel` would be a second answer to a question `core` has already answered — wrong in exactly the case the fourth ground exists for. |
 *
 * ## What version 4 fixed, measured rather than predicted
 *
 * § 3.1 predicted that a Level-1 run would render an **empty** landing series, because
 * {@link VizLanding} is keyed `(floorId, direction)` and a panel has no direction button. That
 * symptom does **not** reproduce: Phase 6b kept `PassengerRecord.direction` populated under a
 * panel, so `foldPassengers` produces the same 28 landings on Midtown Office under either model.
 * The defect is one level subtler and was measured at seed 20260727, 900 s, `eta` weights plus
 * `mobile-credential` + `panel`:
 *
 * | building | landings drawn | landing **calls** under the panel | promise groups `(floor, destination, promised car)` |
 * |---|---|---|---|
 * | Midtown Office | 28 | 92 | **132** |
 * | Mixed-Use High-Rise | 48 | 93 | **230** |
 * | Secure Tower | 22 | 55 | **106** |
 * | Vertical City | 102 | 219 | **535** |
 *
 * A version-3 recording collapses those 132 promises into 28 direction buckets and carries no
 * field from which the collapse could be undone — `VizLeg` had seven fields and none of them was
 * the assignment. So the viewer could not tell a Level-1 recording from a Level-0 one and drew
 * them identically, which is the same class of defect as wave 1's cars-at-their-final-position:
 * deterministic, replay-identical, and a picture of a different building.
 *
 * ## Reading it
 *
 * Wave 1 *read* this number nowhere, and said so: the guard that existed compared a recording's
 * version with the constant compiled into the same bundle, which in the shipped path could not
 * differ. Wave 2 gives it the reader it was always waiting for —
 * {@link readRecordingDocument} in `src/record/document.ts`, on the **file-load** path, where
 * a recording arrives from somewhere other than this build and the versions genuinely can
 * disagree (`UX.md` `PB-07`/`PB-15`).
 */
export const VIZ_SCHEMA_VERSION = 8;

/* -------------------------------------------------------------------------- *
 * Geometry
 * -------------------------------------------------------------------------- */

/** One floor, as a renderer needs it: an id, a height, and the two flags that get a badge. */
export interface VizFloor {
  readonly id: string;
  readonly index: number;
  /** Height above datum, metres. May be negative — basements exist. */
  readonly heightM: number;
  readonly label?: string | undefined;
  readonly isEntrance: boolean;
  readonly isTransferFloor: boolean;
  readonly population: number;
}

/* -------------------------------------------------------------------------- *
 * Step series
 * -------------------------------------------------------------------------- */

/**
 * A right-continuous step function of simulated time, as two parallel arrays.
 *
 * `times` is strictly increasing. The value at `t` is `values[i]` for the greatest `i` with
 * `times[i] <= t`, and {@link StepSeries.before} for `t` earlier than every entry. Parallel
 * arrays rather than an array of pairs because a recording of a busy building holds tens of
 * thousands of these points and the flat form serialises to less than half the JSON.
 *
 * Sampled by `stepValueAt`, which binary-searches. That is what keeps {@link Frame} production
 * a *pure* function of `(recording, t)` rather than a stateful cursor that only works if frames
 * are requested in order — a scrubbing playhead moves backwards, and so does a replay test that
 * samples the same instant twice.
 */
export interface StepSeries {
  readonly times: readonly SimTime[];
  readonly values: readonly number[];
  /** Value before the first entry. */
  readonly before: number;
}

/* -------------------------------------------------------------------------- *
 * Cars
 * -------------------------------------------------------------------------- */

/** The door state machine as it stood at `at`; between two marks the fraction is interpolated. */
export interface VizDoorMark {
  readonly at: SimTime;
  readonly state: DoorMachineState;
}

/**
 * One shaft, and everything its car did.
 *
 * {@link motions} is the whole point of the contract: each entry carries the `MotionProfile`
 * the kernel timed that move with, so a renderer evaluates
 * `fromHeightM + positionAt(profile, t - startedAt)` and gets the car's *analytic* position —
 * the same arithmetic `Car.positionAt` performs, including the motor-start delay and the
 * levelling settle, because the profile clamps at both ends. Nothing is interpolated between
 * kernel events; the S-curve is evaluated.
 */
export interface VizShaft {
  readonly carId: string;
  readonly bankId: string;
  /** `carId` with the redundant bank prefix removed, for a narrow column header. */
  readonly label: string;
  readonly startFloorId: string;
  readonly startHeightM: number;
  /** Floor ids this shaft physically serves — service zoning, not access and not operational. */
  readonly servedFloorIds: readonly string[];
  /** Rated capacity in persons, for turning a load factor back into a crowd. */
  readonly capacityPersons: number;
  readonly doorConfig: DoorConfig;
  readonly motions: readonly CarMotion[];
  readonly doorMarks: readonly VizDoorMark[];
  /** Occupants aboard, as a step function. From the record's load samples. */
  readonly occupants: StepSeries;
  /** `massKg / ratedLoadKg`. Can exceed 1: 1.1 is the overload alarm, not the ceiling. */
  readonly loadFactor: StepSeries;
}

/* -------------------------------------------------------------------------- *
 * Landings and progress
 * -------------------------------------------------------------------------- */

/** How many people stand at one landing wanting one direction, as a step function. */
export interface VizLanding {
  readonly floorId: string;
  readonly direction: Direction;
  readonly waiting: StepSeries;
}

/**
 * The three headline counters, as step functions of simulated time.
 *
 * {@link meanWaitS} is a **running mean over everybody served so far**, not the windowed AWT of
 * the summary. The two answer different questions and quoting one as the other is exactly the
 * confident nonsense this project is built to avoid, so the field is named for what it is and
 * `Frame.runningMeanWaitS` is `undefined` — not zero — until somebody has actually boarded.
 *
 * {@link boardedLegs} is named for the same reason and was called `served` until a reviewer
 * pointed out that the header drew it as a count of people. It is not. A sky-lobby journey
 * boards twice, and `foldPassengers` counts a boarding — so on Mixed-Use High-Rise the old
 * label overstated the population served by exactly the transfer rate. Both counters here are
 * now in the same unit (legs), which is also what {@link waiting} has always been.
 */
export interface VizProgress {
  readonly waiting: StepSeries;
  /** Cumulative **leg** boardings. A journey that transfers contributes one per leg. */
  readonly boardedLegs: StepSeries;
  readonly meanWaitS: StepSeries;
}

/* -------------------------------------------------------------------------- *
 * Legs
 * -------------------------------------------------------------------------- */

/**
 * One passenger leg, kept whole rather than folded away.
 *
 * ## Why this exists, and why it did not exist in wave 1
 *
 * {@link VizProgress} is a *fold*: three cumulative step functions over the whole run. A fold
 * answers "how many have boarded by now" and nothing else. Every windowed figure the project
 * actually reports — a rolling mean wait, a per-bank split, the longest wait currently standing
 * on a landing — needs the individual legs back, and `foldPassengers` had already thrown them
 * away. `UX.md` § 7.2 and `DECISIONS.md` D15 both record that the recording's field set is
 * expected to grow for exactly this, as a deliberate {@link VIZ_SCHEMA_VERSION} bump.
 *
 * Wave 1 deliberately did **not** add it, because nothing would have read it, and a field with
 * no consumer is this repository's signature defect. It is added here *with* its consumers, in
 * one change: `src/frame/overlay.ts` (`overlayAt`, `landingAssignmentsAt`) and the overlay
 * panel `src/render/overlay.ts` draws from them.
 *
 * ## What is deliberately not here
 *
 * `massKg`, `journeyId`, `legIndex` and `alightedAt` are all on `PassengerRecord` and none of
 * them is copied. Nothing in this package reads them, and copying them "while we are here" is
 * how a contract acquires six fields and one consumer.
 *
 * {@link destinationFloorId} and {@link assignedCarId} *were* on that list until version 4, and
 * they come off it for the same reason `legs` came on in version 3: they acquire a consumer in
 * the same change. `landingAssignmentsAt` keys a Level-1 landing on the destination and reports
 * the promise, `describeSelection` says the promise out loud, and `describeFrame` puts it in the
 * sentence a screen reader hears. See {@link VizRecording.passengerModel}.
 *
 * {@link credentialGroup} comes off the list at version 6, on the same terms and for the same
 * stated reason — `src/access/lockedOut.ts`, the canvas banner and `describeFrame` all read it in
 * the change that adds it.
 *
 * ## Ordering
 *
 * {@link VizRecording.legs} is sorted by `(arrivedAt, passengerId)`. Strictly ordered, and by
 * nothing that a hash structure's iteration order could decide — invariant 4's rule applied to a
 * display artefact, the same one `foldPassengers` applies to the landings.
 */
export interface VizLeg {
  /** Identity of this leg. The tie-break that makes the array's order total. */
  readonly passengerId: string;
  /** Where the wait happened — the landing this leg registered a call at. */
  readonly originFloorId: string;
  /**
   * Where this leg is going. **The call identity under a panel** (docs/09 § 1.3): a Level-1
   * landing is one call per origin-destination pair, not one per direction.
   *
   * Present under both models, because it is a fact about the passenger rather than about the
   * dispatcher, and because a Level-0 viewer that wanted to show *why* a car was chosen would
   * need it too. It is only *keyed on* under `destination-dispatch`.
   */
  readonly destinationFloorId: string;
  readonly direction: Direction;
  /** When the wait began. The window membership key, exactly as in `PassengerRecord`. */
  readonly arrivedAt: SimTime;
  /** When the wait ended. `undefined` for a leg nobody ever served. */
  readonly boardedAt?: SimTime | undefined;
  /**
   * When this leg **left the car**. `undefined` for a leg that never boarded, and for one still
   * riding when the horizon closed.
   *
   * Boarding is not delivery, and the difference is a whole car-load. The left rail's *carried
   * today* and the report's `CARRIED` figure are both counts of people who **got where they were
   * going**; before this field the recording could only offer `boardedLegs`, and a surface that
   * called that "carried" would over-report by everyone currently in transit — largest at exactly
   * the moment a reader is watching, the peak. `docs/12-design-handoff.md` § 4.2.
   *
   * A projection of `PassengerRecord.alightedAt`, which `core` has always recorded; nothing in
   * `core` changed to add it here. Absent rather than `undefined` when there is none, by the same
   * JSON-round-trip rule the four fields below keep.
   */
  readonly alightedAt?: SimTime | undefined;
  /** The car that served this leg. `undefined` while unserved. */
  readonly carId?: string | undefined;
  /** The bank that served this leg. `undefined` while unserved. */
  readonly bankId?: string | undefined;
  /**
   * The car the **landing panel promised** this passenger, written once at arrival.
   *
   * `undefined` under the conventional model, where there is no panel and no promise. Under
   * `destination-dispatch` it is present on every leg from the instant it arrives — *including*
   * a leg that never boards, which is the distinction a version-3 recording could not draw:
   * `carId` is `undefined` for both an unassignable call and a promised passenger still waiting
   * when the horizon closed, and `describeSelection` said *"no car answered this call"* about
   * both. Measured reachable: Vertical City at 20 % of population per 5 minutes, seed 20260727,
   * ends `timed-out` with **25** promised-but-never-boarded legs.
   */
  readonly assignedCarId?: string | undefined;
  /**
   * The credential this rider holds, or **absent** when their route needs none.
   *
   * Copied from `PassengerRecord.credentialGroup`, which `traffic/generator.ts` sets to the first
   * group — in declared zone order — that covers every restricted floor on the route, and leaves
   * `undefined` when nothing on the route is restricted. So absence carries two facts that a
   * renderer must not confuse: *this journey crosses no access zone* (the common case), or *this
   * trace was generated with `credentialAssignment: 'none'` and this rider is unbadged on a
   * restricted floor*. The second is what makes `src/access/lockedOut.ts`'s
   * `rider-has-no-credential` cause visible; the origin floor is what tells them apart.
   *
   * Absent rather than `undefined` when there is none — `JSON.stringify` drops `undefined`, and a
   * recording that carried explicit ones would not equal itself after the replay harness's round
   * trip. The same rule the four fields above already keep.
   *
   * **Cost.** A short string on a fraction of legs. `docs/10` § 2.4 measures legs at 5–8 % of a
   * recording; on Secure Tower at 900 s, `garden-apartments`-style buildings carry none at all
   * because they declare no access zone.
   */
  readonly credentialGroup?: string | undefined;
}

/* -------------------------------------------------------------------------- *
 * Version 7 — the two things the run knew and the recording threw away
 * -------------------------------------------------------------------------- */

/**
 * One segment of the demand template this run was driven by.
 *
 * **Why the recording carries the schedule rather than the viewer inventing one.** The design
 * handoff draws a phase-segmented timeline under the stage — `AM PEAK`, `LUNCH`, `PM PEAK` — from
 * an authored sixteen-hour office day. This simulator has no such day: demand comes from a
 * {@link https://example.invalid | resolved demand template}, `rise-and-fall` over thirty minutes
 * or `constant-iso` over two hours, and the template's phases are the only true answer to *what
 * is the building being asked for right now*. A timeline labelled from anything else is a caption
 * that does not describe the picture under it, which is the failure mode the honesty card exists
 * to prevent. See `docs/12-design-handoff.md` § 4.1.
 *
 * Resolved at record time from `SimulationConfig.demandTemplate` through `core`'s own
 * `resolveDemandTemplate`, so the segments the viewer draws are the segments the generator drew
 * from — not a second reading of the same JSON.
 */
export interface VizPhase {
  /** Stable within a recording, for a key. `${index}-${kind}`. */
  readonly id: string;
  /** `ramp-up`, `hold`, `ramp-down` or `flat`, derived from the intensity at the two ends. */
  readonly kind: 'ramp-up' | 'hold' | 'ramp-down' | 'flat';
  /** A phrase for the timeline chip. Short enough to survive a 44 px segment. */
  readonly label: string;
  readonly startS: SimTime;
  readonly endS: SimTime;
  /** Intensity multiplier at each end, `0..1`, straight off the template. */
  readonly startIntensity: number;
  readonly endIntensity: number;
  /**
   * The demand rate at the phase's midpoint, in percent of population per five minutes — the
   * unit `docs/03-traffic-and-statistics.md` states demand in and the unit a traffic study is
   * written in.
   *
   * `null` when the run's record carries no population, for the same reason
   * {@link VizHandlingCapacity.pctPopulationPer5Min} is: a `0 %` there would read as *nobody is
   * coming*.
   */
  readonly ratePctPop5min: number | null;
  /** Whether this segment lies inside the reporting window. The window is the only quotable part. */
  readonly inReportWindow: boolean;
}

/**
 * One dispatch decision, as the left rail's **WHY IT DID THAT** log needs it.
 *
 * ## Why this is recorded and not reconstructed
 *
 * A viewer can already see *what* happened — a car came, a queue cleared. It has never been able
 * to say *why that car*, and the handoff makes the answer a first-class rail section. The answer
 * exists for exactly the duration of one `DispatchDecision`: every eligible car's weighted cost,
 * broken down per term, best first. `Simulation` uses the winner and discards the rest, and by the
 * time `run()` returns there is nothing left to reconstruct from. Reconstructing it afterwards
 * would mean re-scoring against a world that has moved, which is a plausible sentence about a
 * decision that was never made — the exact defect class this repository keeps finding.
 *
 * ## Why it costs nothing it should not
 *
 * Captured by wrapping the policy `Simulation` would have built anyway, through the
 * `SimulationConfig.createPolicy` hook whose own docstring names *"instrumenting a real run"* as
 * one of its two reasons to exist. The wrapper delegates and returns the delegate's value
 * unchanged, draws no random number, reads no clock and alters no input — the same four
 * properties `record/instrument.ts` argues for the car wrappers, and asserted the same way:
 * `decisionLog.test.ts` compares an instrumented run's `RunRecord` against an uninstrumented
 * one's and requires them equal.
 *
 * ## What it deliberately does not carry
 *
 * The losing cars' full breakdowns. A busy Vertical City run makes tens of thousands of decisions
 * against 35 cars; storing every bid would be the largest array in the recording by an order of
 * magnitude, to feed a panel that shows six rows. What is kept is the winner's own decomposition
 * and the runner-up's cost, which is everything the sentence *"A, 12 s away — it was 3.1 s
 * cheaper than B"* needs.
 */
export interface VizDecision {
  readonly at: SimTime;
  readonly callId: string;
  /** `assigned`, `reassigned` or `unassigned` — the three outcomes a reader can see happen. */
  readonly outcome: 'assigned' | 'reassigned' | 'unassigned';
  readonly floorId: string;
  readonly direction: Direction;
  /** The car that took it, or `undefined` when nobody could. */
  readonly carId?: string | undefined;
  /** Short label of {@link carId}, as the canvas draws it. */
  readonly carLabel?: string | undefined;
  /** Weighted cost of the winner. `undefined` when nothing was assigned. */
  readonly cost?: number | undefined;
  /** Weighted cost of the next-best eligible car, for *how close was it*. */
  readonly runnerUpCost?: number | undefined;
  /** How many cars were eligible at all. `0` names a locked-out or fully-filtered landing. */
  readonly eligibleCars: number;
  /**
   * The winner's cost decomposition, largest contribution first, truncated to the three that
   * carry the sentence. Empty for an `unassigned` decision.
   */
  readonly terms: readonly VizDecisionTerm[];
  /** `core`'s own `DecisionReason` when it gave one — `no-eligible-car` and friends. */
  readonly reason?: string | undefined;
  /** People standing at that landing when the decision was made, when the caller counted them. */
  readonly waitingPassengers?: number | undefined;
}

/** One weighted term's share of a decision. A projection of `core`'s `ScoreBreakdown`. */
export interface VizDecisionTerm {
  readonly termId: string;
  readonly weight: number;
  /** The term's own unit — seconds, metres, stops. */
  readonly raw: number;
  /** `weight × normalized`. What this term actually contributed to the total. */
  readonly contribution: number;
}

/* -------------------------------------------------------------------------- *
 * The recording
 * -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- *
 * The summary, and the four sub-shapes version 5 adds
 *
 * ## `null` where `RunSummary` has `NaN`, and why the difference is not cosmetic
 *
 * `core` uses `NaN` for *"this quantity was not measured"* — deliberately, so that an absent
 * measurement cannot arrive downstream disguised as a zero (`metrics/types.ts`, and
 * `docs/10-experience-layer-contract.md` § 7.3 clause 5 restates it for the energy axis:
 * *"`NaN`-not-zero when the run recorded no travel"*).
 *
 * A recording is not a `RunSummary`. It is **serialised**: the replay harness round-trips one
 * through `JSON.parse(JSON.stringify(x))`, **Save recording** writes one to a file and
 * `readRecordingDocument` reads one back. `JSON.stringify(NaN)` is `null`, and `JSON.parse` gives
 * `null` back — so a `number`-typed field carrying `NaN` becomes a `null` that the type system
 * says is a `number`, and the first renderer to call `.toFixed(1)` on it throws or prints
 * something invented. The failure appears only on the *loaded* copy, which is the half of the
 * viewer that no unit test builds by hand.
 *
 * So the contract spells the same fact the way JSON can carry it: **`null` means the run did not
 * measure this**, and the value is never `NaN` and never `0`. `describeSummary` in
 * `src/record/recordRun.ts` is the one place the conversion happens, and
 * `src/render/runSummary.ts` is the one place `null` is turned into words — *"not recorded"*,
 * never a dash and never a zero (R3, R11).
 * -------------------------------------------------------------------------- */

/**
 * The reporting window every cohort figure in a {@link VizSummary} was computed over.
 *
 * `UX.md` RV-T4 requires the window on screen and `docs/10` § 7.4 says why it is a prerequisite
 * for the whole of U5 rather than a label: *"riders waited 25 seconds on average"* is false
 * without *"during the busiest 5 minutes"*, and the shipped rise-and-fall template reports a
 * 300 s peak out of a 900 s run. Copied from `RunSummary.window`, which is a `ReportWindow`.
 */
export interface VizWindow {
  /** `full-run`, `peak-5min`, … — the window's own name, never re-derived here. */
  readonly id: string;
  /** Inclusive lower bound, simulated seconds. */
  readonly startS: SimTime;
  /** Exclusive upper bound, simulated seconds. */
  readonly endS: SimTime;
}

/**
 * Offered demand beside answered demand, in one unit — `docs/10` § 3.5.
 *
 * The design calls the paired bar built from these *"the highest-value single addition in the
 * whole of Phase 9"*, and the reason is that both numbers are **observations**: how many people
 * arrived and how many the lifts carried, per five minutes. Neither is suppressed on a saturated
 * run, and together they explain the saturation before the queue visibly diverges — the Factorio
 * belt backing up in front of the slow machine, in the units this project already reports demand
 * in.
 *
 * **People, not legs.** `HandlingCapacity` reports both and these two are the person-denominated
 * pair, because `%POP` and the demand targets in `docs/03` are quoted in people and four of the
 * five shipped buildings have a transfer floor that would inflate a leg count.
 */
export interface VizHandlingCapacity {
  /** `HC5`: people the lifts carried, per 5 minutes of the window. */
  readonly personsPer5Min: number;
  /** People who arrived, per 5 minutes of the same window. The demand the bar pairs it against. */
  readonly offeredPer5Min: number;
  /** `%POP`. `null` when the record carries no population to divide by — not `0`. */
  readonly pctPopulationPer5Min: number | null;
}

/**
 * Achieved **INT**: the spacing of car departures from the terminal.
 *
 * {@link count} is R13's clause one applied to this row — it is the number of *gaps* the mean was
 * fitted over, and a mean interval over two gaps is a different claim from one over sixty.
 *
 * {@link coefficientOfVariation} is carried and is **never translated**. `docs/10` § 7.2 is
 * explicit: mapping a dispersion statistic onto *"they arrived in clumps"* versus *"evenly"* is
 * the operation R10 bans, one type down, and it needs a threshold nothing in `core` supplies. The
 * renderer prints the number with its definition or nothing.
 */
export interface VizAchievedInterval {
  /** Mean gap between departures, seconds. `null` when no interval could be reconstructed. */
  readonly meanS: number | null;
  /** `stdDev / mean` — the bunching measure. `null` when there are too few gaps to say. */
  readonly coefficientOfVariation: number | null;
  /** Gaps the mean was computed from. R13: an estimate without its `n` may not be drawn. */
  readonly count: number;
}

/**
 * How long the worst-served passenger in the window waited — `RunSummary.serviceLevel`.
 *
 * `docs/10` R4 lists **Abandoned** (`verdict === 'starved'`) as Phase 9's second-preferred fail
 * state and notes that three of its four fail states were already in {@link VizSummary} and *"the
 * second is not"*. This is that second one.
 *
 * {@link longestWaitIsCensored} is the field that keeps the figure honest: a leg that never
 * boarded has no waiting time, only a waiting time *so far*, so the number is then a **lower
 * bound** and the plain-language form has to say *"waited at least …"* (§ 7.1). Drawing the
 * censored and uncensored cases identically would put the understatement precisely where the
 * service is worst.
 */
export interface VizServiceLevel {
  readonly verdict: ServiceLevelVerdict;
  /** The longest wait known in the window, seconds. `null` when the window held no arrivals. */
  readonly longestWaitS: number | null;
  /** Whether {@link longestWaitS} belongs to a leg that never boarded, and is therefore a floor. */
  readonly longestWaitIsCensored: boolean;
  /** Arrivals whose wait is known to exceed {@link horizonS}. */
  readonly overHorizonCount: number;
  /** Arrivals in the window, served or not — {@link overHorizonCount}'s denominator. R13. */
  readonly arrivalCount: number;
  /** The abandonment horizon applied, seconds. Copied, never assumed: the renderer names it. */
  readonly horizonS: number;
}

/**
 * What the fleet spent moving — **an axis, never a score** (`docs/10` R11, CLAUDE.md § Energy).
 *
 * Five numbers rather than one, and the plurality is the rule rather than generosity:
 *
 * - {@link workKJ} is the axis, and it is drawn **only beside** AWT and WT95. Measured across the
 *   full experiment matrix, `nearest-car` — the arm `docs/07` § 4 calls a poor reference, and which
 *   was the viewer's default until § D134 and `elevator-sim list`'s first example until T73 — is on
 *   the Pareto front at **six of eight cells**, because it is best on energy and worst on wait. A
 *   standalone eco score ranks the worst dispatcher first.
 * - {@link workPerServedLegKJ} goes beside it, always. *A configuration that spends less by
 *   serving fewer people has not saved anything*, and the total alone cannot tell the two apart.
 * - {@link deliveredLegCount} is that ratio's denominator — R13, and the reason a per-leg figure
 *   over four legs is not the same claim as one over four hundred.
 * - {@link distanceM} and {@link starts} are the two things that can move the work term, and a
 *   single scalar cannot say which did.
 *
 * {@link measured} distinguishes *"the cars did not move"* from *"nobody wrote down how far the
 * cars moved"*. When it is `false` every figure here is `null` and the renderer prints **"not
 * recorded"** — never `0 kJ`, which would make every arm tie on energy and quietly restore a
 * two-axis front under a three-axis name.
 *
 * **Units, on screen.** Kilojoules of *out-of-balance mechanical work*, not kWh: it omits
 * acceleration losses, drive and gearing efficiency, door motors and standby power. See
 * `docs/02-elevator-reference.md` § Energy and the counterweight.
 */
export interface VizEnergy {
  /** Whether the run recorded any travel at all. `false` ⇒ every figure below is `null`. */
  readonly measured: boolean;
  /** Out-of-balance mechanical work over the window, kilojoules. */
  readonly workKJ: number | null;
  /** {@link workKJ} per leg that alighted in the window. `null` when none did. */
  readonly workPerServedLegKJ: number | null;
  /** Legs that alighted in the window — {@link workPerServedLegKJ}'s denominator. */
  readonly deliveredLegCount: number;
  /** Metres the fleet travelled in the window. */
  readonly distanceM: number | null;
  /** Moves commanded in the window. Each is one motor start. */
  readonly starts: number | null;
}

/**
 * Statistics a viewer may show, and the one flag that decides whether it may show them.
 *
 * {@link awtIsValid} is copied from `RunSummary` rather than recomputed. A viewer that renders
 * `meanS` while this is `false` is reporting a mean for a system whose queues grow without
 * bound; the UX inventory makes suppressing it a required state, not a nicety.
 *
 * ## What the gate covers, stated once
 *
 * `meansAreSuppressed` in `src/frame/overlay.ts` is the **single** gate for *"may I show this"*
 * (`docs/10` R9), and it speaks for exactly the three figures `RunSummary.awtIsValid` speaks for:
 * {@link meanWaitS}, {@link wait95S} and {@link meanTimeToDestinationS}. Everything version 5
 * adds is either an observation — a count, a rate, a longest wait — or an estimate with its own
 * `n` and its own caveat, and none of them is routed through that flag. Widening the gate to
 * cover them would be a *second* claim wearing the first one's authority, which is the failure
 * R9 exists to prevent in the other direction.
 *
 * ## R13, in the type
 *
 * Every estimate here is adjacent to the count it was computed from: {@link waitCount} for the
 * two wait figures and for {@link pctOverLongWait}, {@link timeToDestinationCount} for TTD,
 * {@link VizAchievedInterval.count} for the interval, {@link VizServiceLevel.arrivalCount} for
 * the over-horizon count and {@link VizEnergy.deliveredLegCount} for the per-leg work. Measured
 * on Garden Apartments at `collective`, seed 42: the run's AWT is `11.319 s` with
 * `awtIsValid: true`, computed over **five** legs. It is a legitimately quotable mean by this
 * project's own rule and it is not a mean anybody should read without knowing the `n`.
 */
export interface VizSummary {
  readonly saturated: boolean;
  readonly awtIsValid: boolean;
  readonly awtInvalidReason?: string | undefined;
  /**
   * **Which** ground refused the mean, beside {@link awtInvalidReason}'s sentence — version 8.
   *
   * Copied from `RunSummary.awtInvalidGround`, so it is present exactly when
   * {@link awtInvalidReason} is and carries whatever `core`'s
   * `metrics/awtValidity.ts#AWT_INVALID_GROUND_SPECS` decided. Typed as `core`'s own
   * `AwtInvalidGround` rather than `string`, so a fifth ground widens this contract by existing and
   * a misspelt one does not compile.
   *
   * ## It is permission to shorten and never permission to replace
   *
   * The reason a renderer wants this is `docs/10` R3: *Basic mode may shorten the reason; it may not
   * remove it.* Shortening it **honestly** means saying something about *this* refusal, and before
   * this field the only way to know which one fired was to re-read `saturated`, `waitCount`,
   * `unservedCount` and `serviceLevel` in `core`'s own precedence order — a second answer to a
   * question `diagnoseAwtValidity` has already answered, and wrong in precisely the case the fourth
   * ground exists for (a run that looks unsaturated and uncensored and is refused anyway).
   *
   * So `src/mode/disclosure.ts` reads it to choose a **lead sentence** and nothing else.
   * {@link awtInvalidReason} still follows that lead verbatim and is still on the parity check's
   * must-carry list. A consumer handed a ground it has no wording for falls back to the ground-free
   * lead and still shows the prose; showing a bare code, or nothing, would turn a widened
   * vocabulary into a suppressed refusal, which is the one failure this whole gate exists to
   * prevent (`the root DECISIONS.md` § D111, § D183).
   *
   * **It decides no refusal.** Whether a figure is suppressed at all is still `awtIsValid` through
   * the single `meansAreSuppressed` gate (R9). A recording could carry a ground beside
   * `awtIsValid: true` only by being malformed, and a renderer that read the ground *instead of* the
   * flag would be a second gate.
   *
   * Copied beside {@link awtInvalidReason} in one place — `describeSummary` in
   * `src/record/recordRun.ts` — and never separately, because `core` emits the pair together or not
   * at all. `JSON.stringify` drops both when the run's mean is quotable, so a recording that
   * round-trips through a file is byte-identical to one that did not.
   */
  readonly awtInvalidGround?: AwtInvalidGround | undefined;
  readonly meanWaitS: number;
  readonly wait95S: number;
  readonly meanTimeToDestinationS: number;
  readonly generated: number;
  readonly delivered: number;
  readonly undelivered: number;

  /* ---- version 5 — `docs/10` § 11 W2 ---- */

  /** The window every cohort figure above and below was computed over. `docs/10` § 7.4. */
  readonly reportWindow: VizWindow;
  /** `reportWindow.endS - reportWindow.startS`. Carried, not subtracted, so the two cannot drift. */
  readonly windowSeconds: number;
  /** Legs the wait figures were computed over — R13's `n` for AWT, WT95 and % > long wait. */
  readonly waitCount: number;
  /** Journeys {@link meanTimeToDestinationS} was computed over — R13's `n` for TTD. */
  readonly timeToDestinationCount: number;
  /**
   * Served legs whose wait exceeded {@link longWaitThresholdS}, as a percentage, `0`–`100`.
   *
   * An **observation** — a count over served legs — so it is not suppressed. Its denominator is
   * *served* legs, and {@link unservedCount} is the size of the hole that leaves: the legs that
   * never boarded are precisely the ones that would have counted as long waits, so the renderer
   * shows the two together, always (§ 7.1). `null` when nothing was served.
   */
  readonly pctOverLongWait: number | null;
  /** The long-wait threshold applied, seconds. 60 s by default, and never assumed by a renderer. */
  readonly longWaitThresholdS: number;
  /** Legs that arrived in the window and had not boarded when the run ended. */
  readonly unservedCount: number;
  readonly handlingCapacity: VizHandlingCapacity;
  readonly achievedInterval: VizAchievedInterval;
  readonly serviceLevel: VizServiceLevel;
  readonly energy: VizEnergy;
}

/**
 * One replication, as a renderer sees it. Serialisable, and self-sufficient.
 *
 * Carries {@link seed} because CLAUDE.md invariant 5 says every persisted run record does, and
 * because the replay harness re-derives the whole recording from it: a recording whose seed did
 * not reproduce it would be decorative, and `replay.test.ts` proves it is not by tampering with
 * the seed and requiring the frames to change.
 */
export interface VizRecording {
  readonly schemaVersion: number;
  readonly runId: string;
  /** Master seed as a decimal string, matching `RunRecord.seed`. Invariant 5. */
  readonly seed: string;
  readonly buildingId: string;
  readonly buildingName: string;
  readonly dispatcherProfileId: string;
  readonly trafficProfileId?: string | undefined;
  /**
   * Which passenger model produced this run — **the one field a renderer branches on.**
   *
   * Copied from `RunRecord.passengerModel`, never re-derived from the profile: `core` computes it
   * from the *resolved* dispatch stage (`passengerModelOf`), and a viewer that re-read
   * `dispatcherProfile.dispatch.passengerAssignment` would be a second source of truth about a
   * question `core` has already answered — which is the failure this project has a rule about.
   *
   * `conventional` covers both the up/down button and destination *disclosure*. Only
   * `destination-dispatch` means the landing has no direction button and every waiting passenger
   * has already been told which car to walk to.
   */
  readonly passengerModel: PassengerModel;
  readonly status: SimulationStatus;
  /** Simulated time the run started. */
  readonly startedAt: SimTime;
  /** Simulated time the run stopped. Exclusive, matching `RunRecord.endedAt`. */
  readonly endedAt: SimTime;
  readonly floors: readonly VizFloor[];
  readonly shafts: readonly VizShaft[];
  readonly landings: readonly VizLanding[];
  /** Every passenger leg, sorted by `(arrivedAt, passengerId)`. See {@link VizLeg}. */
  readonly legs: readonly VizLeg[];
  readonly progress: VizProgress;
  readonly summary: VizSummary;
  /**
   * The demand template's segments, ascending and contiguous over `[0, demandEndedAt]`.
   *
   * Version 7. **Empty is a legal value and means the template could not be resolved**, which is
   * the case for a recording loaded from a file written before version 7. The transport draws a
   * single unlabelled band then, rather than inventing a schedule — see {@link VizPhase}.
   */
  readonly demandPhases: readonly VizPhase[];
  /**
   * Every dispatch decision, ascending by `(at, callId)`.
   *
   * Version 7, and **empty is a legal value**: a run recorded without the decision instrumentation
   * carries none, and the rail draws its *standing by* empty state rather than a blank box. See
   * {@link VizDecision} for why it is captured rather than reconstructed, and
   * {@link RecordRunOptions.recordDecisions} for how to turn it off.
   */
  readonly decisions: readonly VizDecision[];
  /**
   * Cars this run was configured to hold out of service, by runtime car id.
   *
   * Version 7. `recordRun` sets the mode through `Car.setMode` before the run, so the dispatcher
   * refuses them with `infeasibleReason: 'serviceMode'` and nothing else in the group changes.
   * Recorded because the picture must be able to draw the dark shaft it produced, and a viewer
   * that inferred *out of service* from *never moved* would mark an idle car on a quiet morning.
   */
  readonly outOfServiceCarIds: readonly string[];
  /** Non-fatal diagnostics from the run, for the viewer's warning strip. */
  readonly warnings: readonly string[];
}

/* -------------------------------------------------------------------------- *
 * Frames
 * -------------------------------------------------------------------------- */

/** Signed direction of travel: `1` up, `-1` down, `0` standing. */
export type TravelDirection = -1 | 0 | 1;

/** `opening` and `closing` are the two moving states, not a rounding of the fraction. */
export type DoorPhase = 'closed' | 'opening' | 'open' | 'closing';

/** One car, at one instant. */
export interface FrameCar {
  readonly carId: string;
  readonly bankId: string;
  readonly label: string;
  /** Height above datum, metres — the analytic S-curve position, not an interpolation. */
  readonly heightM: number;
  /** The floor a standing car is at, or the one a moving car left. */
  readonly floorId: string;
  readonly direction: TravelDirection;
  /** 0 shut to 1 fully open. */
  readonly doorFraction: number;
  readonly doorPhase: DoorPhase;
  readonly occupants: number;
  readonly loadFactor: number;
}

/** One landing, at one instant. */
export interface FrameLanding {
  readonly floorId: string;
  readonly waitingUp: number;
  readonly waitingDown: number;
}

/**
 * Everything on screen at one instant of simulated time.
 *
 * Deliberately a plain data value with no methods and no references back into the recording: it
 * is what a renderer draws, what a test serialises and compares, and what a future transport
 * (a worker, a socket) could post. Two frames produced from the same recording at the same `t`
 * are `===`-equal after `JSON.stringify`, and that is the property Phase 4's acceptance
 * criterion reduces to.
 */
export interface Frame {
  readonly schemaVersion: number;
  readonly runId: string;
  /** Simulated seconds. Clamped to `[recording.startedAt, recording.endedAt]`. */
  readonly simTimeS: SimTime;
  readonly cars: readonly FrameCar[];
  readonly landings: readonly FrameLanding[];
  /** Legs standing at a landing right now. */
  readonly totalWaiting: number;
  /** Cumulative leg boardings. **Legs, not people** — see {@link VizProgress.boardedLegs}. */
  readonly boardedLegs: number;
  /** Running mean wait over every leg boarded so far. `undefined` before the first boarding. */
  readonly runningMeanWaitS: number | undefined;
}
