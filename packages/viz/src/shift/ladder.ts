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
 * ## No `DECISIONS.md` number
 *
 * [§ D405](../../../../DECISIONS.md): a number is allocated to a lane before it starts, and this
 * lane has no block. The decisions here are local to this module and to `docs/33` § 4.7, which is
 * the document that governs them; this docstring is the record § D405 says it is.
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
  return Object.freeze({
    occupancy: asNumber(record['occupancy']) ?? 1,
    banks: Object.freeze(banks.map(bankChoiceOf)),
  });
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
  /** `id → speed band` from `data/elevator-specs.json`. */
  readonly speedBandFor: (
    machineClassId: string,
  ) => { readonly min: number; readonly max: number } | undefined;
}

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
