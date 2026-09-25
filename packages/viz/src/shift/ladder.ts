/**
 * **The contract ladder — what each scenario is made of, in `data/`.** GitHub issue **#382**,
 * `docs/33-difficulty-curve.md` § 4.7.
 *
 * ## Why this exists at all
 *
 * `docs/33` § 4.2 measured every contract's opening day and found **DC-4 red on 8 of 8** and
 * **DC-6 red on the shipped order**: the ladder went trivial → unpassable → moderate → hard →
 * unpassable → trivial → moderate → trivial. The reason it could go that way is that **nothing
 * declared what any contract's difficulty was supposed to be.** A contract named a building, and the
 * building's own traffic profile decided the crowd — so eight scenarios inherited eight buildings
 * that were authored as *reference fixtures for a simulator*, and the ramp a player walks up was
 * whatever those fixtures happened to add up to.
 *
 * This file is the declaration that was missing. Every row says, for one contract: the crowd it
 * runs at, the fabric it hands the player, the wrinkle its opening day is booked under, and the
 * miss rate the design is aiming for. `contractLadder.test.ts` checks the declaration against
 * `docs/33`'s own rules, and `contractCurve.sweep.test.ts` measures whether the product agrees.
 *
 * ## Every field is one of DC-R1's three substrates, and nothing else is admitted
 *
 * `docs/33` DC-R1: *a difficulty change may move declared traffic parameters, building fabric, and
 * the budget and its price schedule — and nothing else.* The schema is built so that a fourth kind
 * of knob is not expressible:
 *
 * | field | substrate | how it reaches the run |
 * |---|---|---|
 * | {@link ContractLadderRow.arrivalRatePctPop5min} | **demand** | `dev/state.ts#shiftRunConfigOf` writes it into the run's `demand`, where Free Play's own rate would go |
 * | {@link ContractFabric.occupancy} | **fabric** | `shift/growth.ts#scaledBuilding`, the same seam the overnight fill runs through |
 * | {@link ContractFabric.banks} | **fabric** | `commissioning/building.ts#commissionedBuilding`, the seam the player's own shaft and machine choices already run through |
 * | {@link ContractFabric.incidents} | **fabric** | `shift/incidents.ts#withIncidents`, the seam a drawn wrinkle's derate already runs through |
 *
 * **The fourth row is [§ D871](../../../../DECISIONS.md) and it is DC-R1's own line**, not a
 * widening of it: `docs/33` DC-R1's fabric substrate lists *availability — a car out of service, a
 * bank derated* and names `shift/incidents.ts` and `shift/events.ts` as where it is declared. Until
 * this row the only thing that could declare one was a **drawn wrinkle**, which is chosen by
 * `(day, dayIdx)` and is therefore the same on every contract's day 1. A contract could say how
 * many people were in its tower and could not say that one of its cars leaves passenger service at
 * half past eight — which is the one fabric fact a player can still do something about while the
 * day is running. See {@link ContractFabric.incidents} for why that matters and
 * `data/contract-ladder.json`'s `c7` row for the measurement.
 *
 * **There is deliberately no bar here, and no goal, and no tier.** `docs/33` § 4.3 and `CLAUDE.md`
 * both forbid buying difficulty by moving the mark, and the schema is where that refusal is cheapest
 * to keep: a field that does not exist cannot be authored. `goalsForDay` is untouched by this work
 * and `GOAL_BARS` is byte-identical to what it was before it.
 *
 * ## Two constraints DC-R1 rides on, and both are mechanical here
 *
 * **A rate must stay inside its profile's declared range.** `data/traffic-profiles.json` declares a
 * `min`/`max` per profile — the residential profile's is `3`–`7` — and a contract that asked for
 * more would be inventing a CIBSE-unsupported arrival rate. {@link contractLadderIssues} refuses it
 * against the loaded profiles rather than against a transcript of them.
 *
 * **Fabric edits the thing the simulation reads.** `shift/growth.ts`'s own rule, inherited: a
 * commissioning choice goes through `commissionedBuilding` and then `parseBuilding` and
 * `resolveBuilding` like any other building, so a shaft this file adds is a shaft the kernel runs.
 * A field that only reached a card would be the dead seam `docs/05-roadmap.md`'s standing
 * requirement is about.
 *
 * ## Why the fabric is a commissioning choice rather than an edit to `data/buildings/`
 *
 * The eight buildings are **reference fixtures before they are game levels**. `benchmark/published.ts`
 * pins measured intervals against `midtown-office`; `data/reference-runs.json`, `data/proof-cases.json`,
 * `data/fixit-cases.json` and `data/scenario-goals.json` all name them; `docs/04-test-buildings.md`
 * describes them. Adding two shafts to `midtown-office.json` to balance a scenario would move every
 * one of those figures, and the repository would then hold a published interval that no longer
 * reproduces — which is the exact defect `CLAUDE.md` records three instances of.
 *
 * A commissioning choice moves the same fabric without moving the fixture: `commissionedBuilding`
 * returns **the input object itself** when no bank's choice differs from what the building already
 * stands as, so a contract that declares no fabric runs the byte-identical building it ran before
 * this module existed. That identity is the negative control, and `contractLadder.test.ts` asserts
 * it on the legs.
 *
 * It is also the more honest description of what a scenario *is*: the tower you are handed. The
 * player keeps every control — `state.commissioning` is applied **after** this, so a reader who
 * re-commissions a bank overrides the contract rather than being overridden by it.
 *
 * ## The field that is deliberately **not** here
 *
 * A rung carries no wrinkle. `GAMEPLAY_AND_NAVIGATION.md` § 17's library landed hours before this
 * work (`data/wrinkles.json`, PR #403) and the owner's 2026-09-09 ruling asks which wrinkles each
 * contract draws — so an `openingEventId` and a `wrinklePool` were drafted here and then **removed
 * before this landed**. The reason is this repository's oldest rule: *which event is today* has
 * exactly one answer, `shift/calendar.ts#scheduledEventFor`, which is pure in `(period, day, dayIdx)`
 * and has five non-test callers plus every surface that captions a day. A field read by
 * `shiftRunConfigOf` alone would build the run from one wrinkle while the rail, the report, the
 * tomorrow card and `scope/runIdentity.ts` captioned another — GitHub issue #135 is the four
 * surfaces that already got that question wrong once. A field read by nothing at all would be the
 * dead seam `docs/05-roadmap.md`'s standing requirement records eleven instances of.
 *
 * So the wrinkle assignment is specified in `docs/33` § 4.7 as a design with an instrument
 * (`wrinkles/gate.ts`, whose gate keeps a day only if it changes which dispatcher wins) and is not
 * expressible here until `scheduledEventFor` carries the contract. Naming it is what stops the next
 * reader assuming it was overlooked.
 *
 * ## The `DECISIONS.md` numbers
 *
 * This module shipped without one and said so: [§ D405](../../../../DECISIONS.md) allocates a
 * number to a lane before it starts, the lane that wrote this file had no block, and every decision
 * it took was local to this module and to `docs/33` § 4.7. That paragraph is kept as the record it
 * was.
 *
 * {@link ContractFabric.incidents} is the first thing here that reaches past this module — it binds
 * `dev/state.ts#shiftRunConfigOf` to hand a rung's absences to `shift/incidents.ts#withIncidents`,
 * and it gives `data/contract-ladder.json` a fourth authorable fact — so it carries
 * [§ D871](../../../../DECISIONS.md), which is what § D405 asks for in exactly that case.
 */

// Named `ladderDocument` rather than `document`: `boundaries.test.ts` confines the DOM to the dev
// entry point by looking for bare globals, and a binding called `document` is one. The import
// follows `wrinkles/library.ts`'s precedent and its argument — a bundled document is pinned to the
// commit by construction, so two players cannot draw different ladders from one build.
import ladderDocument from '../../../../data/contract-ladder.json' with { type: 'json' };

import {
  parseBuilding,
  resolveBuilding,
  type BuildingConfig,
  type ElevatorSpecs,
  type ResolvedBuilding,
} from '@elevator-sim/core/browser';

import { commissionedBuilding } from '../commissioning/building.js';
import { commissionableClasses, type BankChoice } from '../commissioning/types.js';

import { contractForBuilding, CONTRACTS } from './contracts.js';
import { scaledBuilding } from './growth.js';
import { INCIDENT_KINDS, type Incident, type IncidentKind } from './incidents.js';
import { parseRunHorizon } from './dayLength.js';
import { PRESS_CALL_MIN_WINDOW_S, PRESS_CALL_RULES, type PressCallRule } from './pressCall.js';
import type { RunHorizon } from './types.js';

/** What the design intends a contract to be, so the measurement has something to disagree with. */
export interface ContractIntent {
  /**
   * The day-1 miss rate the design is aiming for, as a fraction of seeds.
   *
   * Inside DC-4's `[1/3, 2/3]` band, and **non-decreasing** down the ladder — DC-6, asserted on the
   * declaration by `contractLadder.test.ts` and measured on the product by
   * `contractCurve.sweep.test.ts`. A target is not a measurement and is never quoted as one.
   */
  readonly missRateTarget: number;
  /** Which of DC-R1's substrates carries this contract's difficulty. Prose, checked for membership. */
  readonly substrate: 'demand' | 'fabric' | 'demand+fabric' | 'budget';
  /** Why this row reads the way it does. The reasoning `data/` is required to carry with a figure. */
  readonly note: string;
}

/**
 * The tower a contract hands the player, in the two dimensions this ladder can move.
 *
 * ## Why occupancy is here and is not a demand knob
 *
 * `docs/33` DC-R1 lists **population** under fabric, beside floors, shafts, speed and capacity — and
 * the distinction is not pedantry. The arrival rate is *what share of the people in the building
 * turn up in five minutes*, and it is bounded by the profile's declared range because a rate outside
 * it is a CIBSE-unsupported claim about how a building of that type behaves. **How many people are
 * in the building** is a different fact and is bounded by nothing but the elevation: a tower that is
 * six tenths let is an ordinary tower, and its residents arrive at exactly the rate the profile
 * declares.
 *
 * It is applied through `shift/growth.ts#scaledBuilding` — the function the overnight fill already
 * uses, exported for exactly this reason ("*the whole of `grownBuilding`, with the day taken out*")
 * — so a floor this field empties is a floor the kernel generates no arrivals from. `growth.ts`'s
 * own rule is inherited whole: **it edits the thing the simulation reads, or it does not exist.**
 *
 * ## Why the bank choices are commissioning choices
 *
 * See the module docstring. The short of it: `data/buildings/` is pinned by published intervals, and
 * `commissionedBuilding` moves the same fabric without moving the fixture.
 *
 * **A bank whose shipped cars are not all the same machine may not be commissioned**, because a
 * `BankChoice` collapses class, speed and load to one value each and would flatten the difference.
 * Two shipped buildings are in that state — `crown-hotel`'s `main` and `st-jude-hospital`'s `main` —
 * and `commissioning/choices.ts#mixedBanks` names them. Neither declares a bank choice here, and
 * {@link contractLadderIssues} refuses one that does.
 */
export interface ContractFabric {
  /**
   * A multiplier on every floor's population. `1` is the building as authored and is the identity.
   *
   * Below 1 the tower is not fully let; above 1 it is denser than its own file declares. Bounded by
   * {@link OCCUPANCY_BOUNDS} rather than left open, because an unbounded multiplier is a difficulty
   * dial with no floor and no ceiling, which is the shape `docs/33` DC-R3 refuses.
   */
  readonly occupancy: number;
  readonly banks: readonly BankChoice[];
  /**
   * Cars this contract's tower loses for part of every day it runs — **fabric, and the only one of
   * the three substrates that arrives while the player is watching** ([§ D871](../../../../DECISIONS.md)).
   *
   * ## Why a contract needs one and a wrinkle would not do
   *
   * A drawn wrinkle (`shift/events.ts#eventFor`) is pure in `(day, dayIdx)`, so *the day 1 that
   * every contract's opening day is* draws the same wrinkle on all sixteen towers. Booking a car
   * out on day 1 to give one tower a decision would give it to every tower, and would re-derive
   * every figure this repository has pinned at day 1. A rung is per contract by construction, so
   * this is the narrow declaration the broad one could not be.
   *
   * ## What it is not
   *
   * Not a hidden bar. The building is a real `BuildingConfig` with real `serviceEvents` on it,
   * written through `shift/incidents.ts#withIncidents` — the seam a wrinkle's derate already uses —
   * and re-parsed and re-resolved like every other edit, so a car this names that no bank declares
   * is refused by `core`'s own service-event codes. Nothing about any goal moves.
   *
   * ## Fractions, not clocks
   *
   * `shift/incidents.ts#Incident`'s own units and its own reason: a shift is fifteen minutes to a
   * whole authored day long, and an absolute hour would be false at most of them.
   *
   * **A contract that declares none runs the building it always ran** — `withIncidents` returns its
   * input object for an empty list, so the identity is structural rather than promised.
   */
  readonly incidents: readonly ContractIncident[];
}

/**
 * One car this contract's tower loses, and when.
 *
 * The same four facts `shift/incidents.ts#Incident` carries, with the car named as a `(bankId,
 * carId)` pair rather than chosen by `carsToDerate`. **Named rather than counted**, and that is the
 * difference between a fabric declaration and a draw: `carsToDerate` picks whichever car it picks,
 * and a contract whose brief tells the player *which* lift is away has to be able to say which.
 */
export interface ContractIncident {
  /** `shift/incidents.ts#INCIDENT_KINDS` — what kind of absence this is, in the report's words. */
  readonly kind: IncidentKind;
  readonly bankId: string;
  readonly carId: string;
  /** Fraction of the run's own length at which the car leaves passenger service, `0`–`1`. */
  readonly fromFraction: number;
  /** When it comes back. At or beyond `1` it does not — see `shift/incidents.ts#Incident`. */
  readonly toFraction: number;
}

/**
 * What an occupancy factor may be, and why it is bounded at all.
 *
 * A building at less than a third of its authored population stops being the building the card
 * describes — the stat line, the brief and `docs/04-test-buildings.md` would all be describing
 * somebody else's tower — and one at more than double it is inventing tenants, which
 * `data/buildings/garden-apartments.json` refuses in capitals on its own face for the arrival rate
 * and refuses here for the same reason. The bounds are a design decision with the reasoning
 * attached rather than a citation, exactly as DC-4's band is, and they are stated so they can be
 * argued with.
 */
export const OCCUPANCY_BOUNDS = Object.freeze({ min: 0.3, max: 2 });

/** One rung. Every field is a DC-R1 substrate; see the module docstring's table. */
export interface ContractLadderRow {
  readonly contractId: string;
  readonly buildingId: string;
  /**
   * The crowd, as a percentage of population per five minutes.
   *
   * Must sit inside the building's own traffic profile's declared `min`–`max`
   * ({@link contractLadderIssues}). `undefined` means *the profile's own `typical`*, which is a
   * distinct declaration from asking for that number: it says the contract has no opinion.
   */
  readonly arrivalRatePctPop5min: number | undefined;
  /**
   * The fabric the contract hands the player.
   *
   * `{ occupancy: 1, banks: [] }` is **as built**, and it is the identity rather than a copy of it:
   * `commissionedBuilding` returns its input object when no bank's choice differs, and the occupancy
   * scale is skipped outright at `1`, so a contract that declares no fabric runs the byte-identical
   * building it ran before this module existed.
   */
  readonly fabric: ContractFabric;
  readonly intent: ContractIntent;
  /**
   * The pinned day whose verdict turns on a press, or `undefined` for a rung that has none.
   *
   * GitHub issue **#587**, [§ D914](../../../../DECISIONS.md). See {@link ContractPressDay}.
   */
  readonly pressDay: ContractPressDay | undefined;
}

/**
 * **One day on this contract whose verdict the standing order misses and a reachable press
 * clears** — the measurement, authored so the product can say it.
 *
 * ## Why this is data rather than a test's private constant
 *
 * [§ D871](../../../../DECISIONS.md) pinned one such day inside
 * `shift/pressDecidesTheDay.test.ts`, which is the right home for one. Seven of them are a
 * **property of the ladder** — they are what the rung's `incidents` were authored *for*, and the
 * product has two things to say about them that a test cannot: the picker tags the towers that
 * have one ({@link ContractFabric.incidents}), and the brief names the standing orders under which
 * the day comes out the same with no press at all ({@link ContractPressDay.mootUnder}).
 *
 * ## `mootUnder` is the assessor's finding turned into something the player is told
 *
 * The same panel that found § D871's day unreachable also swept it across all thirteen shipped
 * dispatchers and found **eight of them clear it as built, with no press at all**. Switching
 * dispatcher is a control on the same screen, so a player who changes it makes the day moot — and
 * discovers that by accident, having been told nothing. This field is that sweep, per pinned day,
 * and `everyday/today.ts` draws it before the run, where the dispatcher is chosen.
 *
 * It is **measured, never chosen**: `shift/pressLadder.sweep.test.ts`'s census mode produces it and
 * `shift/pressLadder.test.ts` re-derives one contract's row in full on every run, so a profile that
 * moved would fail rather than leave a sentence that had quietly stopped being true — which is
 * exactly the stale-refusal class [§ D227](../../../../DECISIONS.md) is about.
 */
export interface ContractPressDay {
  /**
   * The seed, as its decimal digits — a string because `JSON.parse` has no `bigint` and a seed past
   * 2^53 read as a `number` is a different day. `shift/pressLadder.test.ts` turns it back.
   */
  readonly seedText: string;
  /** The dispatcher the day is graded under — the contract's standing order. */
  readonly standingOrder: string;
  /** The press that clears it: one of the two parking verbs, by `InterventionChange` kind. */
  readonly clearedBy: string;
  /** The other parking verb, which must still miss — the two-sided half of the claim. */
  readonly missedBy: string;
  /**
   * **Where the day calls for its press, and how far the claim holds from there** — wave AI's
   * press-moment ruling, [§ D1029](../../../../DECISIONS.md). `undefined` only on a row that says
   * why it is {@link ContractPressDay.refused}, and {@link contractLadderIssues} refuses the rest.
   *
   * This replaced `pressAtFraction`, a typed instant — 0.43 of a whole day, 0.28 of a slice — at
   * which § D914 and § D974 proved the flip and a minute either side of which nothing was asked.
   * The instant is now derived by `shift/pressCall.ts#pressCallOf` from the run itself, so no clock
   * is authored anywhere, and what the data carries is the measurement over the window from it.
   */
  readonly call: ContractPressCall | undefined;
  /**
   * **Why this row is not offered**, or `undefined` for an admitted pin — § D1029's refusal arm.
   *
   * A pin whose window from its call is shorter than `PRESS_CALL_MIN_WINDOW_S`, and for which a
   * search found no crowd that passes, is kept in the data with its reason rather than deleted: the
   * picker draws it disabled with this sentence (§ D973's refused-row precedent), and the ladder's
   * both-directions check still sees a rung that books a car out and says what became of it.
   */
  readonly refused: string | undefined;
  /**
   * **Which kind of run the day was measured on** — GitHub issue #595,
   * [§ D973](../../../../DECISIONS.md).
   *
   * § D914 measured all seven pins at `shiftLengthForContract`'s thirty-minute slice, and five of
   * those towers are never played that way: `everyday/host.ts#startRun` spreads
   * `shift/dayLength.ts#wholeDayRun` into the state for every building `wholeDayFor` answers, so the
   * Scenario press runs Midtown, Secure Tower, Chancery House, Harbour Point and Ashgate as ten-hour
   * days. A seed is not a day on its own — the same seed over a different horizon is a different
   * crowd on a different schedule, and on Chancery House the slice's pinned seed run whole missed
   * under every press tried because the lobby failed before the press could land.
   *
   * So the pin says which horizon it is true of, and every reader of the pin —
   * {@link pressDayStanding}, the picker and the moot sentence — asks for it by this field rather
   * than assuming the slice. A day whose pin is on one horizon while the Scenario press runs its
   * tower on the other is **not offered and not described**: that is what those readers do with it.
   *
   * **Absent reads as `'period'`, and that is a fact rather than a fallback.** Every pin authored
   * before this field existed was measured by § D914 on the contract's slice, so a block that does
   * not say is a slice measurement. A value that is neither horizon parses as the empty string and
   * {@link contractLadderIssues} names it.
   */
  readonly horizon: RunHorizon;
  /**
   * The shipped dispatcher ids that clear this day **as built, with no press**, in profile order.
   * Never contains {@link ContractPressDay.standingOrder} — a standing order that cleared its own
   * day would mean the day does not turn on anything.
   */
  readonly mootUnder: readonly string[];
}

/**
 * **The measurement behind a pin's call** — `shift/pressLadder.sweep.test.ts`'s call mode, one row.
 *
 * The admission criterion, [§ D1029](../../../../DECISIONS.md): from the call instant, the clearing
 * press clears and the other misses at **every** tried moment of a window at least
 * `shift/pressCall.ts#PRESS_CALL_MIN_WINDOW_S` simulated seconds long. Every field is what the sweep
 * found, and `shift/pressLadder.test.ts` re-runs the window's two edges and a point inside it on every
 * suite run, so a figure here that stopped being true fails there rather than aging.
 */
export interface ContractPressCall {
  /** Which rule produced the instant — re-derived always-on and required to agree. */
  readonly rule: PressCallRule;
  /**
   * The unbroken stretch after the call, in simulated seconds, over which every tried moment held
   * both halves of the claim. It ends at the last tried moment before the first one that failed,
   * or at {@link searchedS} when none did — so a window equal to it is a floor rather than an edge.
   */
  readonly windowS: number;
  /** The grid's spacing, in simulated seconds. */
  readonly stepS: number;
  /** How far past the call the grid was tried. */
  readonly searchedS: number;
  /** How many moments were tried **inside the window** — the grid's points plus the off-grid ones. */
  readonly tried: number;
  /** Tried offsets past the window that failed either half, within {@link searchedS}. */
  readonly holes: readonly number[];
}

export interface ContractLadder {
  readonly version: number;
  readonly rows: readonly ContractLadderRow[];
}

/* -------------------------------------------------------------------------- *
 * Parsing
 * -------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function fabricOf(value: unknown): ContractFabric {
  const record = asRecord(value);
  const banks = Array.isArray(record['banks']) ? (record['banks'] as unknown[]) : [];
  const incidents = Array.isArray(record['incidents']) ? (record['incidents'] as unknown[]) : [];
  return Object.freeze({
    occupancy: asNumber(record['occupancy']) ?? 1,
    banks: Object.freeze(banks.map(bankChoiceOf)),
    incidents: Object.freeze(incidents.map(contractIncidentOf)),
  });
}

/*
 * Structure only, `bankChoiceOf`'s footing exactly. A kind this table does not know becomes the
 * empty string rather than a default member, so `contractLadderIssues` reports it by name instead
 * of a rung silently running a `breakdown` somebody spelled wrong.
 */
function contractIncidentOf(value: unknown): ContractIncident {
  const record = asRecord(value);
  const kind = asString(record['kind']);
  return Object.freeze({
    kind: kind as IncidentKind,
    bankId: asString(record['bankId']),
    carId: asString(record['carId']),
    fromFraction: asNumber(record['fromFraction']) ?? -1,
    toFraction: asNumber(record['toFraction']) ?? -1,
  });
}

/**
 * A rung's declared absences as the shape the run's own seam takes.
 *
 * One expression rather than a mapping at the call site, for `ladderTowerConfig`'s reason: the
 * thing `dev/state.ts#shiftRunConfigOf` hands `withIncidents` and the thing this file validates
 * have to be the same list, or a rung could pass `contractLadderIssues` and reach the kernel as
 * something else.
 */
/**
 * The contract's pinned press day, or `undefined` — GitHub issue #587, § D914.
 *
 * Keyed on the contract alone rather than on `(contractId, buildingId)` like {@link rungFor},
 * because a press day is a fact about **the day this contract hands you** rather than about a run:
 * it names its own seed and its own standing order, and a reader looking at another building is
 * not on it. The two callers are `everyday/today.ts`, which draws the moot sentence before the
 * run, and `shift/pressLadder.test.ts`, which proves every row of it.
 */
export function pressDayFor(contractId: string | undefined): ContractPressDay | undefined {
  return ladderRowFor(contractId)?.pressDay;
}

/**
 * **The run about to be pressed, as the four facts a pinned day was measured on** — GitHub issue
 * #595, [§ D973](../../../../DECISIONS.md).
 *
 * `shift/pressLadder.test.ts` measures a pin under `campaignEventId: 'ordinary'`, no calendar, day 1
 * of the contract, at the pinned seed and on {@link ContractPressDay.horizon}. A sentence quoting
 * that measurement, or a control that says it sets that day up, is true only while every one of
 * those holds of the run the player will actually press — so they are asked of that run, together,
 * in one place.
 */
export interface PressDayRun {
  readonly contractId: string;
  /** `WeekState.day`. A pin is a day 1. */
  readonly day: number;
  /** The wrinkle the day draws — `shift/calendar.ts#scheduledEventFor(...).id`. */
  readonly eventId: string;
  /** Whether a calendar period is set; the measurement ran with none. */
  readonly hasCalendar: boolean;
  readonly seed: bigint;
  /** The horizon the Scenario press runs this building on — `dayLength.ts#scenarioHorizonFor`. */
  readonly horizon: RunHorizon | undefined;
}

/**
 * The contract's pinned day when `run` **is** that day, else `undefined`.
 *
 * The one predicate `everyday/today.ts`'s moot sentence and `everyday/towerChoice.ts`'s pinned-day
 * rows share, so the brief cannot quote a census over a run the picker would not call the pinned
 * day, and the reverse. It used to be three conditions inside `today.ts#mootSentenceOf` — contract,
 * day 1, seed — and the missing fourth, the horizon, is the whole of #595's second finding: the seed
 * matched on five towers whose day the product runs ten hours long, so a sentence measured over a
 * thirty-minute slice would have been drawn over a whole day.
 */
export function pressDayStanding(run: PressDayRun): ContractPressDay | undefined {
  const press = pressDayFor(run.contractId);
  if (press === undefined) return undefined;
  if (run.day !== 1) return undefined;
  if (run.eventId !== 'ordinary' || run.hasCalendar) return undefined;
  if (run.horizon !== press.horizon) return undefined;
  if (run.seed.toString() !== press.seedText) return undefined;
  return press;
}

/**
 * **The run on the stage, as the facts a call is drawn under** — [§ D1029](../../../../DECISIONS.md).
 *
 * {@link PressDayRun}'s six, plus the two {@link pressDayStanding} never asked: who is driving, and
 * what has been pressed. The ruling's honesty lens found that gap — a claim measured under
 * `collective` could be drawn over a run somebody had handed to another dispatcher — and it is
 * closed here rather than in `pressDayStanding`, because the moot census that predicate also serves
 * is a fact about the as-built day under every profile and is true whoever is driving.
 */
export interface PressDayAttempt extends PressDayRun {
  /** `ViewerState.dispatcherId`. */
  readonly dispatcherId: string;
  /** `ViewerState.interventions` — the log the run on screen was simulated under. */
  readonly interventions: readonly { readonly atS: number; readonly change: { readonly kind: string } }[];
}

/**
 * **The pinned day, exactly as it was measured**, or `undefined` — [§ D1029](../../../../DECISIONS.md).
 *
 * Four conditions, each one a way the run could differ from the one `pressLadder.test.ts` proves:
 *
 * 1. {@link pressDayStanding} holds — the contract, day 1, the ordinary wrinkle with no calendar,
 *    the pinned seed, on the pinned horizon;
 * 2. the pin is **admitted** ({@link admittedPressDayIds}) — a refused row draws no call;
 * 3. the driver is the pin's standing order;
 * 4. every press on record is this attempt's own answer to the call: none at all, or exactly one
 *    parking press of the pin's two, stamped at the call second. `everyday/host.ts#startRun` clears
 *    the log on every attempt since § D1002, so a press standing here was made on this attempt, and
 *    a press at any other second — or a second press — is a day nobody measured.
 *
 * `callAtS` is `shift/pressCall.ts#pressCallOf`'s answer for the run, or `undefined` when it has
 * none; with no call only the untouched day qualifies.
 */
export function pressDayMeasuredAs(
  run: PressDayAttempt,
  callAtS: number | undefined,
): ContractPressDay | undefined {
  const press = pressDayStanding(run);
  if (press === undefined) return undefined;
  if (!admittedPressDayIds().includes(run.contractId)) return undefined;
  if (run.dispatcherId !== press.standingOrder) return undefined;
  if (run.interventions.length > 1) return undefined;
  for (const entry of run.interventions) {
    if (callAtS === undefined || entry.atS !== callAtS) return undefined;
    if (entry.change.kind !== press.clearedBy && entry.change.kind !== press.missedBy) return undefined;
  }
  return press;
}

export function rungIncidents(rung: ContractLadderRow | undefined): readonly Incident[] {
  if (rung === undefined) return [];
  return rung.fabric.incidents.map((entry) => ({
    kind: entry.kind,
    car: { bankId: entry.bankId, carId: entry.carId },
    fromFraction: entry.fromFraction,
    toFraction: entry.toFraction,
  }));
}

/**
 * A rung's pinned press day, or `undefined` when it declares none.
 *
 * Structure only, `contractIncidentOf`'s footing: a field this table does not understand becomes
 * the empty string rather than a default, so {@link contractLadderIssues} reports it by name. A
 * row with no `pressDay` key is the common case and is not an error — nine of the sixteen shipped
 * contracts have no such day, and `shift/pressLadder.test.ts` measures why for each.
 */
function pressDayOf(value: unknown): ContractPressDay | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = asRecord(value);
  const moot = Array.isArray(record['mootUnder']) ? (record['mootUnder'] as unknown[]) : [];
  return Object.freeze({
    seedText: asString(record['seedText']),
    standingOrder: asString(record['standingOrder']),
    clearedBy: asString(record['clearedBy']),
    missedBy: asString(record['missedBy']),
    call: pressCallBlockOf(record['call']),
    refused: typeof record['refused'] === 'string' ? record['refused'] : undefined,
    /*
     * Absent is `'period'` — § D914 measured every pin that predates the field on the slice — and
     * anything else that is not a horizon is the empty string, so {@link contractLadderIssues}
     * names it. See {@link ContractPressDay.horizon}.
     */
    horizon: parseRunHorizon(record['horizon']) as RunHorizon,
    mootUnder: Object.freeze(moot.map((id) => asString(id))),
  });
}

/*
 * Structure only, `pressDayOf`'s footing: a rule this table does not know becomes the empty string
 * and a missing figure `-1`, so {@link contractLadderIssues} names it rather than admitting a pin
 * on a default.
 */
function pressCallBlockOf(value: unknown): ContractPressCall | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = asRecord(value);
  const rule = asString(record['rule']);
  const holes = Array.isArray(record['holes']) ? (record['holes'] as unknown[]) : [];
  return Object.freeze({
    rule: ((PRESS_CALL_RULES as readonly string[]).includes(rule) ? rule : '') as PressCallRule,
    windowS: asNumber(record['windowS']) ?? -1,
    stepS: asNumber(record['stepS']) ?? -1,
    searchedS: asNumber(record['searchedS']) ?? -1,
    tried: asNumber(record['tried']) ?? -1,
    holes: Object.freeze(holes.map((hole) => asNumber(hole) ?? -1)),
  });
}

/**
 * **Whether a call block meets the admission criterion** — [§ D1029](../../../../DECISIONS.md).
 *
 * The one reading, so {@link contractLadderIssues}, {@link admittedPressDayIds} and the picker cannot
 * disagree about which pins are admitted. Every clause is a way the block could claim more than its
 * sweep found: a window under the floor, a tried count smaller than the grid inside the window, a
 * window longer than the search, a hole inside the window, or a window that stops short of the
 * search with no hole to stop it.
 */
function pressCallIssues(call: ContractPressCall | undefined): readonly string[] {
  if (call === undefined) return ['it carries no call measurement'];
  const issues: string[] = [];
  if ((call.rule as string) === '') {
    issues.push(`its call names a rule that is none of ${PRESS_CALL_RULES.join(', ')}`);
  }
  if (!(call.stepS > 0)) issues.push(`its call grid steps ${String(call.stepS)} s`);
  if (call.windowS < PRESS_CALL_MIN_WINDOW_S) {
    issues.push(
      `its call holds for ${String(call.windowS)} s, under the ${String(PRESS_CALL_MIN_WINDOW_S)} s ` +
        'a pin needs from its call',
    );
  }
  if (call.windowS > call.searchedS) {
    issues.push(`its window of ${String(call.windowS)} s is longer than the ${String(call.searchedS)} s searched`);
  }
  if (call.stepS > 0 && call.tried < Math.floor(call.windowS / call.stepS) + 1) {
    issues.push(`it states ${String(call.tried)} tried moments, fewer than its own grid inside the window`);
  }
  if (call.holes.some((hole) => hole <= call.windowS || hole > call.searchedS)) {
    issues.push('it reports a hole inside its window or past its search');
  }
  if (call.windowS < call.searchedS && !call.holes.includes(call.windowS + call.stepS)) {
    issues.push('its window stops short of the search with no hole at the next tried moment');
  }
  return issues;
}

/**
 * **The pinned days the admission criterion admits** — derived from the data, never typed
 * ([§ D1029](../../../../DECISIONS.md)). A row is admitted when it pins a day, is not
 * {@link ContractPressDay.refused}, and its call block passes {@link pressCallIssues}.
 */
export function admittedPressDayIds(ladder: ContractLadder = CONTRACT_LADDER): readonly string[] {
  return Object.freeze(
    ladder.rows
      .filter(
        (row) =>
          row.pressDay !== undefined &&
          row.pressDay.refused === undefined &&
          pressCallIssues(row.pressDay.call).length === 0,
      )
      .map((row) => row.contractId),
  );
}

function bankChoiceOf(value: unknown): BankChoice {
  const record = asRecord(value);
  return Object.freeze({
    bankId: asString(record['bankId']),
    shafts: asNumber(record['shafts']) ?? 0,
    machineClassId: asString(record['machineClassId']),
    ratedSpeedMps: asNumber(record['ratedSpeedMps']) ?? 0,
  });
}

/**
 * Structure only — the shape a bundled JSON import can be trusted to have.
 *
 * Everything that needs `data/buildings/`, `data/elevator-specs.json`, `data/traffic-profiles.json`
 * or `data/wrinkles.json` to answer is in {@link contractLadderIssues} instead, because those reach
 * the viewer through `dev/data.ts`'s fetch and are not available at module-init time.
 * `pricing/parse.ts`'s split, and its reason.
 */
export function parseContractLadder(input: unknown): ContractLadder {
  const record = asRecord(input);
  const rows = Array.isArray(record['contracts']) ? (record['contracts'] as unknown[]) : [];
  return Object.freeze({
    version: asNumber(record['version']) ?? 0,
    rows: Object.freeze(
      rows.map((row) => {
        const entry = asRecord(row);
        const demand = asRecord(entry['demand']);
        const intent = asRecord(entry['intent']);

        return Object.freeze({
          contractId: asString(entry['contractId']),
          buildingId: asString(entry['buildingId']),
          arrivalRatePctPop5min: asNumber(demand['arrivalRatePctPop5min']),
          fabric: fabricOf(entry['fabric']),
          intent: Object.freeze({
            missRateTarget: asNumber(intent['missRateTarget']) ?? 0,
            substrate: asString(intent['substrate'], 'demand') as ContractIntent['substrate'],
            note: asString(intent['note']),
          }),
          pressDay: pressDayOf(entry['pressDay']),
        });
      }),
    ),
  });
}

/** The shipped ladder. One row per contract, both directions — see {@link contractLadderIssues}. */
export const CONTRACT_LADDER: ContractLadder = parseContractLadder(ladderDocument);

/** The rung a contract stands on, or `undefined` for a run that is on no contract. */
export function ladderRowFor(contractId: string | undefined): ContractLadderRow | undefined {
  if (contractId === undefined) return undefined;
  return CONTRACT_LADDER.rows.find((row) => row.contractId === contractId);
}

/**
 * The rung that applies to **this building on this contract**, or `undefined`.
 *
 * The building check is load-bearing rather than defensive, and it was found by running the suite.
 * A `ViewerState` carries a `buildingId` and a `week.contractId` **independently**, and they
 * routinely disagree: `menu/enterFreePlay.ts` keeps the building's own contract id on a fresh week
 * *"to keep the scenario label honest"*, every probe in `scope/probes.test-helper.ts` switches the
 * building while leaving the week where it was, and a reader who opens another building from the
 * Engineer surface does the same. Keyed on the contract alone, Scenario 1's rung would have let
 * Midtown Office at Garden Apartments' occupancy — a scenario's fabric arriving on a building the
 * scenario does not run.
 *
 * So a rung reaches a run only when the run is **on that contract and in its building**, which is
 * what *the tower this scenario hands you* means.
 */
export function rungFor(
  contractId: string | undefined,
  buildingId: string,
): ContractLadderRow | undefined {
  const row = ladderRowFor(contractId);
  if (row !== undefined) return row.buildingId === buildingId ? row : undefined;
  /*
   * **A week on no shipped contract borrows the building's**, and the case that forced it is the
   * replay. `everyday/replay.ts#replayPatchOf` opens the replay week on `REPLAY_CONTRACT_ID`, one of
   * `WEEK_CONTRACT_SENTINELS` — a slot to park in rather than a scenario — so keyed on the week's id
   * alone a replay of day 2 would run the tower **as built** while the live day 2 ran the rung's,
   * and `replay.test.ts` compares the two on the legs and would have caught it as a product defect
   * rather than a test expectation. A replay is *the day it was*, so it gets the day's tower.
   *
   * Narrow on purpose: it fires only when the week's contract id names no shipped contract. A week
   * standing on a real contract while the reader looks at another building gets **nothing**, which
   * is what keeps a scenario's fabric off a building the scenario does not run.
   */
  if (contractId !== undefined && CONTRACTS.some((one) => one.id === contractId)) return undefined;
  const own = contractForBuilding(buildingId);
  return own === undefined ? undefined : ladderRowFor(own.id);
}

/* -------------------------------------------------------------------------- *
 * Cross-validation
 * -------------------------------------------------------------------------- */

/** What {@link contractLadderIssues} needs to answer, threaded rather than imported. */
export interface LadderValidationInput {
  /** `id → { min, max }` from `data/traffic-profiles.json`, per the building's own profile. */
  readonly rateRangeFor: (buildingId: string) => { readonly min: number; readonly max: number } | undefined;
  /** Bank ids of the building as authored, for a fabric row to name one of. */
  readonly bankIdsFor: (buildingId: string) => readonly string[] | undefined;
  /**
   * Banks whose shipped cars disagree on class, speed or load — `commissioning/choices.ts#mixedBanks`.
   * A `BankChoice` cannot describe one without rewriting it, so a rung may not name one.
   */
  readonly mixedBankIdsFor: (buildingId: string) => readonly string[] | undefined;
  /**
   * Traffic profile ids the building's **floors** declare beyond the building's own.
   *
   * A rate written into the run overrides *every* profile the building resolves
   * (`core`'s `traffic/generator.ts`: *"To sweep to an arbitrary rate instead, set
   * arrivalRatePctPop5min, which overrides every profile"*), so on a mixed-use tower one number
   * would drag the residential floors up to the office rate and out of **their** declared range.
   * Measured rather than reasoned about: declaring `12` on `mixed-use-high-rise` moved its day-1
   * mean arrivals from 957 to 1 332 against a profile default that is not 12 at all. So an absolute
   * rate is refused on a building whose floors carry a profile of their own, and such a contract
   * moves by fabric instead.
   */
  readonly floorProfilesFor: (buildingId: string) => readonly string[] | undefined;
  /**
   * Car ids of one bank of the building **as authored**, for {@link ContractIncident} to name one.
   *
   * Keyed on the pair rather than on the car alone because two banks may both have a car `A`, and a
   * rung that took `A` out of the wrong bank would be a legal-looking declaration that removed a
   * different lift from the one its brief names.
   */
  readonly carIdsFor: (buildingId: string, bankId: string) => readonly string[] | undefined;
  /** `id → speed band` from `data/elevator-specs.json`. */
  readonly speedBandFor: (
    machineClassId: string,
  ) => { readonly min: number; readonly max: number } | undefined;
  /**
   * Every shipped dispatcher id, from `data/dispatcher-profiles.json` — so a
   * {@link ContractPressDay} that names a standing order or a moot dispatcher this build does not
   * ship is refused here rather than drawn on the brief as a name nobody can select.
   *
   * Threaded like every other accessor on this interface: the profiles reach the viewer through
   * `dev/data.ts`'s fetch and are not available at module-init time.
   */
  readonly dispatcherIds: () => readonly string[];
  /**
   * The horizon the Scenario run press runs a building on — `'whole-day'` where
   * `shift/dayLength.ts#wholeDayFor` answers and `'period'` where it does not, which is
   * `dayLength.ts#scenarioHorizonFor`. `undefined` for a building this build cannot resolve.
   *
   * Threaded for {@link ContractPressDay.horizon}: a pin measured on a horizon the product never
   * runs its tower on is a measurement of a day nobody can play (GitHub issue #595, § D974).
   */
  readonly horizonFor: (buildingId: string) => RunHorizon | undefined;
}

/** The two parking verbs a {@link ContractPressDay} may name — `core`'s own kinds, not new ones. */
const PRESS_DAY_VERBS: readonly string[] = Object.freeze(['park-cars-lobby', 'spread-cars']);

/**
 * Every way the authored ladder can be wrong, collected rather than thrown one at a time.
 *
 * `pricing/parse.ts`'s idiom: a content author fixing one figure wants the whole list, not the
 * first line of it. The rules are `docs/33`'s, each named where it is checked.
 */
export function contractLadderIssues(
  ladder: ContractLadder,
  input: LadderValidationInput,
): readonly string[] {
  const issues: string[] = [];
  const declared = new Set(ladder.rows.map((row) => row.contractId));

  // Both directions, so neither a contract with no rung nor a rung with no contract can hide.
  for (const contract of CONTRACTS) {
    if (!declared.has(contract.id)) {
      issues.push(`contract ${contract.id} has no ladder row; every scenario declares its crowd`);
    }
  }
  for (const row of ladder.rows) {
    const contract = CONTRACTS.find((candidate) => candidate.id === row.contractId);
    if (contract === undefined) {
      issues.push(`ladder row ${row.contractId} names no shipped contract`);
      continue;
    }
    if (contract.buildingId !== row.buildingId) {
      issues.push(
        `ladder row ${row.contractId} names building ${row.buildingId} and the contract runs ` +
          `${contract.buildingId}`,
      );
    }

    // DC-R1's rate constraint, against the loaded profile rather than a transcript of it.
    const range = input.rateRangeFor(row.buildingId);
    const rate = row.arrivalRatePctPop5min;
    if (rate !== undefined) {
      const floorProfiles = input.floorProfilesFor(row.buildingId) ?? [];
      if (floorProfiles.length > 0) {
        issues.push(
          `ladder row ${row.contractId} asks an absolute rate and ${row.buildingId}'s floors ` +
            `declare ${floorProfiles.join(', ')} of their own; one rate would override every ` +
            'profile the building resolves',
        );
      }
      if (range === undefined) {
        issues.push(`ladder row ${row.contractId} asks a rate and ${row.buildingId} has no profile`);
      } else if (rate < range.min || rate > range.max) {
        issues.push(
          `ladder row ${row.contractId} asks ${String(rate)}% and ${row.buildingId}'s profile ` +
            `declares ${String(range.min)}–${String(range.max)}%; DC-R1 forbids a rate outside it`,
        );
      }
    }

    if (
      row.fabric.occupancy < OCCUPANCY_BOUNDS.min ||
      row.fabric.occupancy > OCCUPANCY_BOUNDS.max
    ) {
      issues.push(
        `ladder row ${row.contractId} lets ${row.buildingId} at ` +
          `${row.fabric.occupancy.toFixed(2)} of its authored population, outside ` +
          `${OCCUPANCY_BOUNDS.min.toFixed(2)}–${OCCUPANCY_BOUNDS.max.toFixed(2)}`,
      );
    }

    // Fabric names a real bank, a real machine, a legal speed and at least one shaft.
    const bankIds = input.bankIdsFor(row.buildingId);
    for (const choice of row.fabric.banks) {
      if (input.mixedBankIdsFor(row.buildingId)?.includes(choice.bankId) === true) {
        issues.push(
          `ladder row ${row.contractId} commissions ${row.buildingId}'s ${choice.bankId}, whose ` +
            'shipped cars are not all the same machine; a BankChoice would flatten them',
        );
      }
      if (bankIds !== undefined && !bankIds.includes(choice.bankId)) {
        issues.push(
          `ladder row ${row.contractId} commissions bank ${choice.bankId}, which ` +
            `${row.buildingId} does not have`,
        );
      }
      if (choice.shafts < 1) {
        issues.push(
          `ladder row ${row.contractId} gives bank ${choice.bankId} ${String(choice.shafts)} ` +
            'shafts; a bank with none is floors nobody can reach',
        );
      }
      const band = input.speedBandFor(choice.machineClassId);
      if (band === undefined) {
        issues.push(
          `ladder row ${row.contractId} names machine class ${choice.machineClassId}, which ` +
            'data/elevator-specs.json does not declare',
        );
      } else if (choice.ratedSpeedMps < band.min || choice.ratedSpeedMps > band.max) {
        issues.push(
          `ladder row ${row.contractId} runs ${choice.machineClassId} at ` +
            `${String(choice.ratedSpeedMps)} m/s, outside its declared ` +
            `${String(band.min)}–${String(band.max)} m/s`,
        );
      }
    }

    /*
     * A declared absence names a real car of a real bank, leaves a window that is a window, and
     * never empties its bank — `carsToDerate`'s own rule (*a bank with no in-service car is a set of
     * floors nobody can reach, which is a different scenario rather than a busier one*) applied to
     * the half of the vocabulary that names its car instead of counting.
     */
    for (const incident of row.fabric.incidents) {
      if (!(INCIDENT_KINDS as readonly string[]).includes(incident.kind)) {
        issues.push(
          `ladder row ${row.contractId} declares an absence of kind ${JSON.stringify(incident.kind)}, ` +
            `which is none of ${INCIDENT_KINDS.join(', ')}`,
        );
      }
      const carIds = input.carIdsFor(row.buildingId, incident.bankId);
      if (carIds === undefined) {
        issues.push(
          `ladder row ${row.contractId} takes a car out of bank ${incident.bankId}, which ` +
            `${row.buildingId} does not have`,
        );
      } else if (!carIds.includes(incident.carId)) {
        issues.push(
          `ladder row ${row.contractId} takes car ${incident.carId} out of ${row.buildingId}'s ` +
            `${incident.bankId}, which has ${carIds.join(', ')}`,
        );
      } else if (
        carIds.length <=
        row.fabric.incidents.filter((other) => other.bankId === incident.bankId).length
      ) {
        /*
         * Counted over the **whole rung**, not one row at a time. A bank of two with two declared
         * absences empties even though neither entry takes its only car, and a check that asked
         * about one entry would have passed it — the shape `carsToDerate` avoids by construction
         * and this vocabulary can express because it names its cars.
         */
        issues.push(
          `ladder row ${row.contractId} takes every car in ${row.buildingId}'s ` +
            `${incident.bankId}; a bank with none is floors nobody can reach`,
        );
      }
      if (incident.fromFraction < 0 || incident.fromFraction >= 1) {
        issues.push(
          `ladder row ${row.contractId} takes ${incident.carId} out at ` +
            `${String(incident.fromFraction)} of the run, outside [0, 1)`,
        );
      }
      if (incident.toFraction <= incident.fromFraction) {
        issues.push(
          `ladder row ${row.contractId} returns ${incident.carId} at ` +
            `${String(incident.toFraction)}, at or before it leaves at ` +
            `${String(incident.fromFraction)}; that is an absence that never happened`,
        );
      }
    }

    // DC-4 on the declaration. The measurement is the sweep's; this refuses a target that could
    // not be right even if the product hit it exactly.
    if (row.intent.missRateTarget < 1 / 3 || row.intent.missRateTarget > 2 / 3) {
      issues.push(
        `ladder row ${row.contractId} targets ${row.intent.missRateTarget.toFixed(2)}, outside ` +
          "DC-4's [1/3, 2/3]",
      );
    }
    if (row.intent.note.trim() === '') {
      issues.push(`ladder row ${row.contractId} carries no reasoning; data/ figures state theirs`);
    }

    /*
     * A pinned press day names a real seed, two different real verbs, a shipped standing order and
     * shipped moot dispatchers — and the standing order is never among them. The **verdicts** are
     * `shift/pressLadder.test.ts`'s to prove by running the day; this refuses a declaration that
     * could not be right even if every run agreed with it.
     */
    const press = row.pressDay;
    if (press !== undefined) {
      if (!/^\d+$/.test(press.seedText)) {
        issues.push(
          `ladder row ${row.contractId} pins a press day at seed ${JSON.stringify(press.seedText)}, ` +
            'which is not a decimal seed',
        );
      }
      if (row.fabric.incidents.length === 0) {
        issues.push(
          `ladder row ${row.contractId} pins a press day on a rung that books no car out; the ` +
            'absence is the event the day asks to be answered',
        );
      }
      for (const [field, verb] of [
        ['clearedBy', press.clearedBy],
        ['missedBy', press.missedBy],
      ] as const) {
        if (!PRESS_DAY_VERBS.includes(verb)) {
          issues.push(
            `ladder row ${row.contractId} pins ${field} ${JSON.stringify(verb)}, which is none of ` +
              PRESS_DAY_VERBS.join(', '),
          );
        }
      }
      if (press.clearedBy === press.missedBy) {
        issues.push(
          `ladder row ${row.contractId} pins the same verb as clearing and missing; a day with ` +
            'one button that always works is a switch rather than a choice',
        );
      }
      /*
       * § D1029: an offered pin is an admitted one. A refused row says why in its own words; every
       * other row's call block must meet the criterion, so a pin that fails it cannot reach the
       * picker by being left in the data unmarked.
       */
      if (press.refused !== undefined) {
        if (press.refused.trim() === '') {
          issues.push(`ladder row ${row.contractId} refuses its press day and gives no reason`);
        }
      } else {
        for (const issue of pressCallIssues(press.call)) {
          issues.push(`ladder row ${row.contractId} pins a press day and ${issue}`);
        }
      }
      const shipped = input.dispatcherIds();
      if (!shipped.includes(press.standingOrder)) {
        issues.push(
          `ladder row ${row.contractId} grades its press day under ${press.standingOrder}, which ` +
            'no shipped dispatcher profile declares',
        );
      }
      for (const id of press.mootUnder) {
        if (!shipped.includes(id)) {
          issues.push(
            `ladder row ${row.contractId} says ${id} makes its day moot, and no shipped ` +
              'dispatcher profile declares that id',
          );
        }
      }
      if ((press.horizon as string) === '') {
        issues.push(
          `ladder row ${row.contractId} pins a press day on a horizon that is neither 'period' ` +
            "nor 'whole-day'; a pin says which kind of run it was measured on (GitHub issue #595)",
        );
      } else {
        /*
         * § D974: a pin on a horizon the Scenario press does not run its tower on is a measurement of
         * a day no player can take, which is what five of § D914's seven were until they were
         * re-measured on the whole day.
         */
        const horizon = input.horizonFor(row.buildingId);
        if (press.horizon !== horizon) {
          issues.push(
            `ladder row ${row.contractId} pins a press day measured on ` +
              `${JSON.stringify(press.horizon)}, and the Scenario press runs ${row.buildingId} on ` +
              `${JSON.stringify(horizon ?? 'nothing')}; a pin on a horizon nobody plays is a day ` +
              'nobody can meet',
          );
        }
      }
      if (press.mootUnder.includes(press.standingOrder)) {
        issues.push(
          `ladder row ${row.contractId} lists its own standing order ${press.standingOrder} as ` +
            'making the day moot; then the day turns on nothing',
        );
      }
    }
  }

  // DC-6 on the declaration, in the order a player meets them.
  let previous = -1;
  let previousId = '';
  for (const contract of CONTRACTS) {
    const row = ladder.rows.find((candidate) => candidate.contractId === contract.id);
    if (row === undefined) continue;
    if (row.intent.missRateTarget < previous) {
      issues.push(
        `DC-6: ${contract.id} targets ${row.intent.missRateTarget.toFixed(2)} after ${previousId} ` +
          `targets ${previous.toFixed(2)}; the order must not fall`,
      );
    }
    previous = row.intent.missRateTarget;
    previousId = contract.id;
  }

  return issues;
}

/* -------------------------------------------------------------------------- *
 * The tower a rung hands over
 * -------------------------------------------------------------------------- */

/**
 * The building a contract hands the player: the authored one, let at the rung's occupancy and
 * commissioned to the rung's banks.
 *
 * **One derivation, and both the run and the card read it.** `dev/state.ts#shiftRunConfigOf` builds
 * the run from this, and `dev/scenariosPanel.ts` and `everyday/host.ts` draw the stat line from it —
 * because a card that said *2 cars* over a run with one would be the caption defect this repository
 * has closed a dozen times, and a second expression for *what does this scenario hand me* is how
 * that defect arrives.
 *
 * **Identity at a rung that declares nothing**, in both halves: the occupancy scale is skipped
 * outright at `1` (`scaledBuilding` returns a fresh object at every factor, and a run's building
 * document is digested into a leaderboard board, so a no-op that produced a new object would move
 * every board), and `commissionedBuilding` returns its input object when no bank's choice differs.
 * So a contract with no rung, or a rung with no fabric, gets the authored object back by identity.
 */
export function ladderTowerConfig(
  authored: BuildingConfig,
  contractId: string | undefined,
  specs: ElevatorSpecs,
): BuildingConfig {
  const rung = rungFor(contractId, authored.id);
  if (rung === undefined) return authored;
  const asLet =
    rung.fabric.occupancy === 1 ? authored : scaledBuilding(authored, rung.fabric.occupancy);
  if (rung.fabric.banks.length === 0) return asLet;
  return commissionedBuilding(asLet, rung.fabric.banks, commissionableClasses(specs));
}

/** What {@link ladderTowersOf} needs: the authored configs and the specs they resolve against. */
export interface LadderTowerInput {
  readonly entries: readonly { readonly config: BuildingConfig }[];
  readonly elevatorSpecs: ElevatorSpecs;
}

/**
 * Every loaded building, with each contract's own rung applied to the building that contract runs.
 *
 * A drop-in for `BrowserResources.buildings` at the surfaces that describe a **scenario**: each
 * contract names a distinct building, so a list keyed by building id still resolves the way every
 * caller already looks one up. A building no contract runs comes back untouched.
 *
 * A building the rung makes unresolvable comes back as the as-built resolution rather than throwing:
 * a scenario card is not the place to discover that authored data is wrong, and
 * `contractLadder.test.ts` is — it resolves every rung and fails there instead.
 */
export function ladderTowersOf(resources: LadderTowerInput): readonly ResolvedBuilding[] {
  return resources.entries.map((entry) => {
    const contract = contractForBuilding(entry.config.id);
    const config = ladderTowerConfig(entry.config, contract?.id, resources.elevatorSpecs);
    if (config === entry.config) return resolveBuilding(entry.config, resources.elevatorSpecs);
    try {
      return resolveBuilding(parseBuilding(config as unknown), resources.elevatorSpecs);
    } catch {
      return resolveBuilding(entry.config, resources.elevatorSpecs);
    }
  });
}
