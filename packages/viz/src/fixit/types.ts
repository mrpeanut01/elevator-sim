/**
 * Fix-a-building — the case shapes, as data.
 *
 * `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 10 is the surface;
 * `ENGINE_CONTRACT.md` § 9 is the scoring. The contract's closed-form model is **replaced by two
 * real single runs sharing the traffic seed** — the spec's own basis line (§ 10.4: *"one run
 * before, one run after"*) — so nothing in these types carries an authored effect size: a repair
 * carries a **config patch**, and what it buys is measured, never written down.
 *
 * ## Why the complaint declares its measure
 *
 * *"How much of the complaint went away"* has to be computable from the two runs, which means the
 * case must say which figure the complaint **is**. {@link ComplaintMeasure} names the figure
 * (a long-wait count or a scoped mean wait) and the legs it is taken over ({@link ComplaintScope}).
 * The alternative — an authored before/after — is the prototype's toy model, and the first thing
 * `docs/12`'s rule (*"the simulator wins every disagreement about what a number means"*) throws
 * out.
 *
 * ## Copy rules
 *
 * Every string a player reads is authored in `data/fixit-cases.json` and validated by
 * `parse.ts`: no probability words (R10), and **no engine identifier** — GAMEPLAY § 16 rule 11.
 * Buildings are named by display name, dispatch changes by what they do.
 */

import type { PriceSchedule } from '../pricing/types.js';
import type { BoughtBudgetStep } from '../scenario/budget.js';

/** Which legs the complaint is measured over. */
export interface ComplaintScope {
  /**
   * - `origin` — legs starting at one of {@link floorIds}.
   * - `touches` — legs starting **or** ending at one of {@link floorIds}.
   * - `origin-to-destination` — legs from {@link floorIds} to {@link destinationFloorIds}.
   *
   * The rest of the building — § 10.4's second row — is always the complement: every leg the
   * scope does not claim. One definition, both rows, so a leg cannot be counted in neither.
   */
  readonly mode: 'origin' | 'touches' | 'origin-to-destination';
  readonly floorIds: readonly string[];
  /** Required exactly when {@link mode} is `origin-to-destination`. */
  readonly destinationFloorIds?: readonly string[] | undefined;
}

/**
 * The figure the complaint is, computed from a run — never authored.
 *
 * - `long-waits` — how many scoped legs waited {@link thresholdS} or longer to board (a leg that
 *   never boarded counts: a wait the run outlived is not a short wait).
 * - `mean-wait` — the mean seconds to board over scoped legs that boarded, quoted with that count.
 */
export interface ComplaintMeasure {
  readonly kind: 'long-waits' | 'mean-wait';
  /** The measure named in the player's words, e.g. *"waits over a minute for a car down"*. */
  readonly label: string;
  readonly thresholdS: number;
  readonly scope: ComplaintScope;
}

/** A per-car spec override. Only these keys may appear in a patch's `set`. */
export interface CarPatch {
  /** Car ids within the building, or the single entry `"*"` for every car. */
  readonly carIds: readonly string[];
  readonly set: {
    /** Added to the car's current rated speed — the contract prices speed in +0.5 m/s steps. */
    readonly ratedSpeedDeltaMps?: number | undefined;
    /**
     * Pressurise the cabin, lifting the air-pressure descent cap — GitHub issue #444.
     *
     * The only entry in this table that buys **nothing at all** on most buildings, on purpose:
     * the cap only applies above `elevator-specs.json`'s `airPressure.appliesAboveTravelM` of
     * travel, so on a bank shorter than that the run is byte-identical with it and without it
     * and the loader says so (`pressurisation-buys-nothing`). That is the decision the issue
     * exists to create — speed stops being a dominant buy once the money spent on it has
     * somewhere it cannot be spent.
     */
    readonly cabinPressurised?: boolean | undefined;
    readonly dwellCarCallS?: number | undefined;
    readonly dwellHallCallS?: number | undefined;
  };
}

/**
 * A per-bank equipment setting — GitHub issue #431, `DECISIONS.md` § D539. Only these keys may appear
 * in a patch's `set`.
 *
 * **Both are energy-only**, by the owner's ruling of 2026-09-10: the counterweight's balance ratio and
 * a regenerative drive price a bank's moves in the energy proxy and reach nothing a dispatcher reads,
 * so a repair buying either moves `energyKJ`, `workPerServedLegKJ` and the fifth goal's verdict and
 * moves no leg. `pricing/bankEquipmentReachesTheGoal.test.ts` compares the legs whole to hold that.
 */
export interface BankEquipmentPatch {
  /** Bank ids within the building, or the single entry `"*"` for every bank. */
  readonly bankIds: readonly string[];
  readonly set: {
    /** The counterweight's share of rated load, 0.4–0.5 (`core` `config/schema.ts#BANK_ENERGY_TUNABLES`). */
    readonly counterweightBalanceRatio?: number | undefined;
    /** Fit a regenerative drive, priced by `elevator-specs.json`'s `regenerativeDrive` block. */
    readonly regenerativeDrive?: boolean | undefined;
    /**
     * Re-rope the shaft — GitHub issue #433, `DECISIONS.md` § D583. A class id from
     * `elevator-specs.json#ropeClasses.classes`; the loader checks that it exists and that the rope
     * reaches the bank's travel, where every other bank field's cross-reference is checked.
     *
     * Energy-only like the two above, with one addition that is not energy: a rope's
     * `maxSingleTravelM` is a **hard** ceiling, so on a shaft taller than the rope allows this is
     * the only setting in this table whose wrong value refuses the building rather than changing a
     * figure.
     */
    readonly ropeClass?: string | undefined;
  };
}

/** Fabric changes, applied to the authored building document and re-resolved through the loader. */
export interface BuildingPatch {
  /** Population overrides, floor id → headcount. */
  readonly floorPopulations?: readonly { readonly floorIds: readonly string[]; readonly population: number }[] | undefined;
  /**
   * A full replacement `banks` array in the building schema — service zoning is a bank property,
   * so a zoning change is a banks change. Validated by `parseBuilding` when applied, exactly as a
   * shipped file is.
   */
  readonly banks?: unknown;
  readonly cars?: readonly CarPatch[] | undefined;
  /** Per-bank equipment — the counterweight and the drive (GitHub issue #431). */
  readonly bankEquipment?: readonly BankEquipmentPatch[] | undefined;
  /** New cars cloned from an existing one — how a case adds a shaft, or the as-built adds a car. */
  readonly addCars?: readonly { readonly bankId: string; readonly copyCarId: string; readonly id: string }[] | undefined;
  /**
   * **Floor elevation changes — the one `BuildingPatch` field that moves a floor** — GitHub issue
   * #422. Floor id → the metres added to that floor's authored `heightM`. Every other field here
   * changes what serves or lives on a floor; this changes where the floor itself sits.
   *
   * Applied to the authored document and re-resolved through `parseBuilding`, exactly as `banks`
   * is (`fixit/run.ts#applyBuildingPatch`) — so a move that breaks `heightM`'s strict-increasing-
   * with-`index` rule, a double-deck pair's exact `deckSeparationM` separation, or a rope's hard
   * `maxSingleTravelM` ceiling is refused there rather than allowed to reach a run, the same door a
   * shipped file enters by.
   */
  readonly floors?: readonly { readonly floorIds: readonly string[]; readonly heightDeltaM: number }[] | undefined;
}

/** Dispatcher overrides, merged section-whole onto the case's named profile. */
export interface DispatcherPatch {
  readonly idle?: Readonly<Record<string, unknown>> | undefined;
  readonly dispatch?: Readonly<Record<string, unknown>> | undefined;
  readonly answer?: Readonly<Record<string, unknown>> | undefined;
}

/** What a repair (or the as-built delta) changes about the run. */
export interface FixitPatch {
  readonly dispatcher?: DispatcherPatch | undefined;
  readonly building?: BuildingPatch | undefined;
}

/**
 * The four roles of § 10.6 rule 3. Ids, not copy — nothing on screen names them (§ 10.2:
 * *"Nothing labels itself"*), and the parser requires exactly one of each per case.
 */
export type RepairRole = 'diagnosed' | 'costly-fix' | 'cheap-fix' | 'new-shaft';

export interface FixitRepair {
  readonly id: string;
  readonly role: RepairRole;
  readonly name: string;
  readonly costUnits: number;
  /** One line; § 10.6 rule 4 — it cites a number that is on screen. */
  readonly effect: string;
  readonly patch: FixitPatch;
}

/** One of the four figures the case shows before anything runs (§ 10.1 item 3). */
export interface FigureSpec {
  readonly kind: 'complaint' | 'scope-long-waits' | 'scope-mean-wait' | 'scope-worst-wait' | 'rest-away-pct';
  readonly label: string;
  /** Authored intent — one bad, one or two mid, one healthy — so a renderer can flag the bad one. */
  readonly reading: 'bad' | 'mid' | 'healthy';
}

export interface FixitCase {
  readonly id: string;
  readonly name: string;
  /** A shipped building id. Never player-facing — the screen prints the building's display name. */
  readonly buildingId: string;
  /** The standing order the building runs today. Never player-facing. */
  readonly dispatcherProfileId: string;
  readonly run: {
    /** Decimal seed string; both runs of the pair share it — that is the whole basis. */
    readonly seed: string;
    readonly durationS: number;
    readonly arrivalRatePctPop5min: number | null;
  };
  /**
   * The deltas that make the shipped building this case's as-built one, plus its stand line — and,
   * on a case whose crowd has a start time the owner can move, the **tenancy** that says which
   * (§ D1001).
   */
  readonly asBuilt: {
    readonly note: string;
    readonly patch: FixitPatch;
    readonly tenancy?: FixitTenancy | undefined;
  };
  readonly complaint: {
    readonly text: string;
    readonly complainer: string;
    readonly measure: ComplaintMeasure;
  };
  /**
   * Printed on the failing band of the schematic (§ 10.1 item 2). A **sight**, never a figure —
   * `parse.ts#symptomFigureIn` is the rule (GitHub issue #351).
   */
  readonly symptom: string;
  /**
   * § D478's declaration, present only on a case whose authored rate falls outside its building's
   * declared arrival-rate band, and **derived at parse time rather than authored** —
   * `parse.ts#demandDisclosureOf` says why. Drawn beside the as-built note on both fix-it surfaces,
   * and swept as player-facing copy.
   */
  readonly demandDisclosure?: string | undefined;
  readonly figures: readonly FigureSpec[];
  readonly diagnosis: { readonly text: string; readonly reasoning: string };
  readonly budgetUnits: number;
  readonly repairs: readonly FixitRepair[];
  /** The authored success copy — § 10.4's first outcome only; the other three are the engine's. */
  readonly result: FixitResultCopy;
}

/**
 * The authored success copy, with its one claim about **the rest of the building** held apart.
 *
 * `rest` exists because two authored bodies said the rest of the building did not notice the fix
 * (*"downstairs never noticed"*, *"their own three never notice the difference"*) and printed that
 * above the card's own fifty-morning row, which showed the rest down by an interval that excluded
 * zero — the post-AI panel's seat C, D2 and seat D, D8. How the rest fared is a measurement, and an
 * authored sentence about it may only print where the measurement agrees:
 * `fixit/judge.ts#judgedOutcomeOf` prints `rest` when the rest's fifty-morning interval contains
 * zero, and the measured sentence in its place when it does not. The body may not carry that claim
 * itself; `parse.ts` refuses a body that tries.
 */
export interface FixitResultCopy {
  readonly head: string;
  readonly body: string;
  /** An authored claim that the rest of the building was untouched by the fix. Optional. */
  readonly rest?: string | undefined;
}

export interface FixitCases {
  readonly version: number;
  readonly cases: readonly FixitCase[];
  /**
   * **The rungs a case's budget can be bought up to, with chimes** — `docs/38` § 2.1's *"in steps
   * the scenario authors"*, [§ D911](../../../../DECISIONS.md), GitHub issue **#579**.
   *
   * `BoughtBudgetStep` is `scenario/budget.ts`' own type rather than a fix-it copy of it, because
   * `docs/38` § 2.1 makes a fix case and a campaign stage two **sources** of one scenario schema
   * and not two schemas. A second step shape here would be the authority defect this ladder exists
   * to avoid, one level down from the one it avoids against `data/chime-ledger.json`.
   *
   * **On the set rather than on the case**, and that is a claim about what the ladder is: a fix
   * case's base budget is drawn from § 10.2's single 10–16 u band (`parse.ts#BUDGET_MIN_UNITS`),
   * so the rung above it is a property of the band and not of a case. `data/fixit-cases.json`'s
   * own block says the same thing and carries the provenance.
   *
   * Empty is a legitimate state and is not defaulted away: a file that authors no rung is a file
   * whose cases cannot be widened, which the screen says on its own face.
   */
  readonly budgetSteps: readonly BoughtBudgetStep[];
  /**
   * The schedule these cases were priced with — GitHub issue **#366**.
   *
   * Carried on the set rather than fetched again by each screen, so a surface that has the cases
   * has the prices, and there is no second load to go stale against the first. Every price a
   * player sees on a fix-a-building screen comes from here.
   */
  readonly schedule: PriceSchedule;
}

/** A standing extra — offered in every case, priced, and deliberately without a patch (§ 10.2). */
export interface FixitExtra {
  readonly id: string;
  readonly name: string;
  readonly costUnits: number;
  /** Why a defensible purchase fixes nothing, in the player's words. */
  readonly line: string;
}

/**
 * **The parking strategies the fix-it editor offers — all five of core's `PARKING_STRATEGIES`**,
 * GitHub issue **#422** for the first three and [§ D1000](../../../../DECISIONS.md) for the other
 * two.
 *
 * This was a subset of three, and both of the two it left out were refused on a written reason
 * that has stopped being true:
 *
 * - `predicted-demand` was refused because *"without Phase 5's learned one the stage reports
 *   `no-forecast`"*. [§ D706](../../../../DECISIONS.md) § 8 found that false: `core/src/sim/simulation.ts`
 *   resolves each bank's arrival model once and feeds the stage its forecast, and
 *   `sleeping-sky-lobby`'s diagnosed repair runs on that strategy and moves the legs. A control that
 *   works, withheld on a false sentence, is [§ D227](../../../../DECISIONS.md)'s stale refusal.
 * - `fixed-floor` was refused because the editor drew no floor control. It draws one now —
 *   `idle.parkingFloorIndex` is one of `fixit/families.ts`'s dials, live exactly when this select
 *   reads `fixed-floor`, and its options are the floors this building's banks actually serve.
 *
 * Both are proved on the legs in `fixit/families.test.ts`, which is the only thing that makes
 * offering them different from miming them. The list is still asserted against core's vocabulary
 * in `engine.test.ts`, so a strategy core stops declaring cannot go on shipping from here.
 */
export const EDITOR_PARKING_STRATEGIES = [
  'stay',
  'lobby',
  'zone-center',
  'predicted-demand',
  'fixed-floor',
] as const;
export type EditorParkingStrategy = (typeof EDITOR_PARKING_STRATEGIES)[number];

/** What the player has selected on a case. The pure model the panel renders. */
export interface FixitState {
  readonly selectedRepairIds: readonly string[];
  readonly selectedExtraIds: readonly string[];
  /** Machinery bought in the editor: +0.5 m/s steps, priced by the contract. */
  readonly speedSteps: number;
  /** Machinery bought in the editor: +2-place steps, priced by the contract. */
  readonly capacitySteps: number;
  /**
   * § 10.3's **zones and service ranges**, as one number: how many floors of overlap every bank
   * gains at each edge of the range it already serves. `0` leaves the ranges as the building draws
   * them.
   *
   * A widened range is a `banks` replacement, so this is `building.banks[]` and the schedule's
   * `rezone-bank` row prices it — the same row, at the same price, a repair that rezones pays.
   * Flat rather than per floor, which is the schedule's own finding: *"twelve fix repairs buy it
   * between 0 and 12 units with no rule relating the price to how much is rezoned"*.
   */
  readonly zoneOverlapFloors: number;
  /**
   * § 10.3's **parking**: where an idle car waits. `null` leaves the standing order's own choice
   * alone, which is what a case opens on — `emptyFixitState` cannot know a profile's value and a
   * default that guessed one would edit the building by being drawn.
   *
   * Writes `dispatcher.idle.parkingStrategy`, priced by the schedule's `idle-parking` row, which is
   * 0 u in every shipped list. Free is not the same as inert: `cases.test.ts` requires each offered
   * strategy to move the legs.
   */
  readonly parkingStrategy: EditorParkingStrategy | null;
  /**
   * § 10.3's **elevation** control, narrowed to the one move that is always safe to offer — GitHub
   * issue #422. Metres added to the building's topmost floor; `0` leaves it as the building draws
   * it.
   *
   * **This is not § 10.1 item 6's elevation grid** — a per-shaft, per-floor-band click-to-set grid —
   * which stays undrawn; `everyday/fixitScreen.ts`'s docstring says why the grid itself is still out
   * of scope. What this closes is narrower and more literal: `BuildingPatch` had no field that moved
   * a floor at all, and now it does.
   *
   * Only the topmost floor, because raising it can only *add* to the tallest riser in the building —
   * every other floor's `heightM` is untouched, so the loader's strict-increasing-with-`index` rule
   * can never be violated by this control, however far it is pushed. `fixit/run.ts#topFloorRaiseCeilingOf`
   * reports `0`, and the row is not drawn at all, where the topmost floor is served by no bank (a
   * press that writes a field and moves no leg), is one half of a double-deck pair (raising it alone
   * would move `heightM` off the exact separation its pair declares), or — the ground two of the
   * eighteen shipped cases' buildings actually raise — is declared as part of a compact
   * `FloorRange` rather than as an explicit floor, which `fixit/run.ts#applyBuildingPatch` cannot
   * look up by id.
   */
  readonly topFloorRaiseM: number;
  /**
   * **The dispatcher-tier dials** — every declared dimension of the schedule's `idle-parking`,
   * `dispatch-rules` and `dwell-policy` rows except `idle.parkingStrategy`, which keeps its own
   * select above. Dimension id → value, only what the player moved. `fixit/families.ts` says what is
   * offered and why; [§ D1000](../../../../DECISIONS.md) is the lane that built it.
   */
  readonly dispatcherDials: Readonly<Record<string, DialValue>>;
  /**
   * **Door hold, per car or for every car** — the schedule's `door-dwell` row. Key
   * {@link EVERY_CAR} or a car id; a car-specific entry is applied after the every-car one.
   */
  readonly doorDwell: Readonly<Record<string, DoorDwellSetting>>;
  /**
   * **Which bank a car runs in** — part of the schedule's `rezone-bank` row. Car id → an existing
   * bank's id, {@link KEYED_BANK} (a bank of its own, keyed to a run the player draws), or
   * {@link OUT_OF_SERVICE}. A car the as-built building has out for works is listed too, so it can
   * be put back.
   */
  readonly carBanks: Readonly<Record<string, string>>;
  /** **The floors a bank serves**, bank id → floor ids — `rezone-bank` again. */
  readonly bankFloors: Readonly<Record<string, readonly string[]>>;
  /**
   * **Banks whose cars weigh against their own plate** — `rezone-bank` again: the plated rated load
   * the shipped building authors, where the as-built building sets a different one.
   */
  readonly platedBankIds: readonly string[];
  /**
   * **Which authored position each tenancy cohort is moved to** — cohort id → position id, the
   * schedule's `tenant-floors` row charged once per cohort ([§ D1001](../../../../DECISIONS.md)). An
   * id the case does not author is never written: `engine.ts#setTenancyPosition` refuses it, so on
   * the fifteen cases that author no cohort this stays empty whatever is pressed.
   */
  readonly tenancyPositions: Readonly<Record<string, string>>;
}

/**
 * **A case's movable crowd** — [§ D1001](../../../../DECISIONS.md), the ruling on how the schedule's
 * `tenant-floors` row is offered in a fix case.
 *
 * The row is drawn on every case, and it can only move what the case authors here: named cohorts,
 * each with a few named **positions**, each position a per-floor headcount the watched window keeps.
 * There is no free per-floor population dial, because measured, a cut to a third of every floor
 * clears seventeen of the eighteen cases — fourteen of them cases whose fault is not the crowd — and
 * because any population edit redraws the whole trace, so even a one-person move is a re-roll. A
 * case that authors no cohort draws the row with a sentence saying so, and a press there changes
 * nothing.
 */
export interface FixitTenancy {
  readonly cohorts: readonly TenancyCohort[];
}

export interface TenancyCohort {
  readonly id: string;
  /** The tenancy, in the player's words. */
  readonly name: string;
  /** Why the owner can move this crowd's start: a lease clause, a letter, a memo. Never empty. */
  readonly reason: string;
  /** Every floor any of its positions sets. */
  readonly floorIds: readonly string[];
  readonly positions: readonly TenancyPosition[];
}

export interface TenancyPosition {
  readonly id: string;
  /** The position, in the player's words — *three start times, one watched*. */
  readonly name: string;
  /** The headcount each floor keeps in the watched window. Never above the as-built figure. */
  readonly watched: readonly { readonly floorIds: readonly string[]; readonly population: number }[];
}

/** A dial's value: a declared dimension's number, name or switch. */
export type DialValue = number | string | boolean;

/** One target's door hold. An absent side is left as the car has it. */
export interface DoorDwellSetting {
  readonly hallCallS?: number | undefined;
  readonly carCallS?: number | undefined;
}

/** {@link FixitState.doorDwell}'s key for every car in the building. */
export const EVERY_CAR = '*';
/** {@link FixitState.carBanks}'s target for a car taken out of service. */
export const OUT_OF_SERVICE = 'out-of-service';
/** {@link FixitState.carBanks}'s target for a car given a bank of its own. */
export const KEYED_BANK = 'keyed';
