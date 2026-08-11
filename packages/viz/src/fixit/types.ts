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
    readonly dwellCarCallS?: number | undefined;
    readonly dwellHallCallS?: number | undefined;
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
  /** New cars cloned from an existing one — how a case adds a shaft, or the as-built adds a car. */
  readonly addCars?: readonly { readonly bankId: string; readonly copyCarId: string; readonly id: string }[] | undefined;
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
  /** The deltas that make the shipped building this case's as-built one, plus its stand line. */
  readonly asBuilt: { readonly note: string; readonly patch: FixitPatch };
  readonly complaint: {
    readonly text: string;
    readonly complainer: string;
    readonly measure: ComplaintMeasure;
  };
  /** Printed on the failing band of the schematic (§ 10.1 item 2). */
  readonly symptom: string;
  readonly figures: readonly FigureSpec[];
  readonly diagnosis: { readonly text: string; readonly reasoning: string };
  readonly budgetUnits: number;
  readonly repairs: readonly FixitRepair[];
  /** The authored success copy — § 10.4's first outcome only; the other three are the engine's. */
  readonly result: { readonly head: string; readonly body: string };
}

export interface FixitCases {
  readonly version: number;
  readonly cases: readonly FixitCase[];
}

/** A standing extra — offered in every case, priced, and deliberately without a patch (§ 10.2). */
export interface FixitExtra {
  readonly id: string;
  readonly name: string;
  readonly costUnits: number;
  /** Why a defensible purchase fixes nothing, in the player's words. */
  readonly line: string;
}

/** What the player has selected on a case. The pure model the panel renders. */
export interface FixitState {
  readonly selectedRepairIds: readonly string[];
  readonly selectedExtraIds: readonly string[];
  /** Machinery bought in the editor: +0.5 m/s steps, priced by the contract. */
  readonly speedSteps: number;
  /** Machinery bought in the editor: +2-place steps, priced by the contract. */
  readonly capacitySteps: number;
}
