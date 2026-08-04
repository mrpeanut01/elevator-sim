/**
 * The five scenarios, and the stat line that is generated rather than authored.
 *
 * ## Five scenarios, five shipped buildings, nothing re-authored
 *
 * The handoff re-authors each building inline as a `PRESETS` entry with rounded floor heights and
 * populations. `docs/12-design-handoff.md` § 4.4 refuses that: the implementation uses
 * `data/buildings/*.json` verbatim — same five ids, same order, same teaching point, same
 * `needClean` — and where a handoff stat line disagrees with the file, **the file wins**. So
 * {@link CONTRACTS} carries the handoff's *prose* (which is the deliverable) and none of its
 * *numbers* (which are a prototype's), and {@link statLineOf} derives the numbers from the
 * building the reader is actually about to run.
 *
 * Every prose field below is byte-for-byte the handoff's (`design.html` :1381–1417) and
 * `contracts.test.ts` asserts it against the vendored copy is not attempted — the vendored file is
 * a record, not a fixture — but the strings are pinned here and reviewed against it.
 *
 * ## All five are open, and there is no state in which they are not
 *
 * `design.html` :1616 returns `true` unconditionally from `algoUnlocked` and says why in the same
 * breath: *"Every dispatcher is available from the start — scenarios teach, they do not gate."*
 * § 1.5 B4 restates it for the scenarios themselves. {@link contractStatus} therefore has three
 * answers and none of them is `locked`; the dead code beneath the design's early return — a
 * completion-based unlock ladder — is deliberately **not** ported, because porting a branch the
 * design disabled is how a gate arrives by accident.
 *
 * The `unlocks` field the handoff carries is not ported either, for the same reason: it feeds only
 * that disabled ladder. What the reader is told they have earned is the contract's `reward`
 * sentence, which is prose about what the scenario taught, and that is kept.
 *
 * ## Why the building is named by id and not held as an object
 *
 * A contract is a *pinned list*, and pinning a `ResolvedBuilding` would mean this module loaded
 * `data/`. It does not, and cannot: `boundaries.test.ts` confines `node:` imports to `dev/` and the
 * test helpers. The caller resolves the id against the `LoadedConfig` it already has, and
 * `contracts.test.ts` asserts all five resolve — which is the check that a renamed building file
 * cannot silently orphan a scenario.
 */

import type { ResolvedBuilding } from '@elevator-sim/core/browser';

import type { ContractStatus, ScenarioContract, WeekState } from './types.js';

/**
 * The handoff's five, in the handoff's order.
 *
 * Frozen, and every member frozen: this is shared, read-only reference data of exactly the kind
 * CLAUDE.md invariant 7 says belongs in data rather than in code — and it *would* be in
 * `data/scenario-goals.json`'s neighbourhood if it were tunable. It is not: these are the
 * handoff's authored words, and the only numeric field, `needClean`, is a design decision rather
 * than a parameter an optimizer could search. A `data/` file for five frozen sentences would add a
 * schema, a parser and a loader to protect nothing.
 */
/**
 * **Eight contracts, and the handoff specifies five.** `docs/12` § 4.4 fixes the campaign at the
 * five buildings shipped when the design was written; three more buildings landed afterwards, and a
 * shipped building with no contract is a scenario the reader can never take. The deviation is
 * recorded in `docs/12` § 4.7 rather than absorbed, which is the rule the handoff itself sets: it
 * wins every disagreement about what the screen looks like, and a disagreement it does not cover is
 * a decision to be written down.
 */
export const CONTRACTS: readonly ScenarioContract[] = Object.freeze([
  Object.freeze({
    id: 'c1',
    buildingId: 'garden-apartments',
    label: 'Scenario 1',
    title: 'Learn the ropes',
    teaches: 'a call, a car, a wait',
    brief:
      'Six floors, two hydraulic cars at 0.63 m/s, and a gentle trickle of residents. Nothing here is hard — it exists so the next four have something to be different from.',
    needClean: 1,
    reward: 'Minimum estimated wait · Energy aware · one spare shaft',
  }),
  Object.freeze({
    id: 'c2',
    buildingId: 'midtown-office',
    label: 'Scenario 2',
    title: 'The morning rush',
    teaches: 'up-peak, and the gap between demand offered and carried',
    brief:
      '1,710 people on twenty uniform floors with four geared cars. At the peak they all want the same thing at the same time, and the queue in the lobby is where you find out whether your dispatcher is any good.',
    needClean: 2,
    reward: 'Operational zoning · Capacity aware · one spare shaft',
  }),
  Object.freeze({
    id: 'c3',
    buildingId: 'secure-tower',
    label: 'Scenario 3',
    title: 'Two banks, one lobby',
    teaches: 'zoning, and calls nobody may legally answer',
    brief:
      'Thirty-one floors split across a low and a high bank, with credentialed floors above 21. A call a car cannot legally take looks nothing like a slow one — and must never be reported as one.',
    needClean: 2,
    reward: 'Destination disclosure · Fairness first · one spare shaft',
  }),
  Object.freeze({
    id: 'c4',
    buildingId: 'mixed-use-high-rise',
    label: 'Scenario 4',
    title: 'The sky lobby',
    teaches: 'transfers, and why a two-leg journey waits twice',
    brief:
      'Forty floors, an 8 m/s shuttle and a transfer level at 20. A rider changing cars is waiting twice and must be counted once — get that wrong and every figure below flatters you.',
    needClean: 2,
    reward: 'Predictive balanced · Contract-net auction · two more shafts',
  }),
  Object.freeze({
    id: 'c5',
    buildingId: 'vertical-city',
    label: 'Scenario 5',
    title: 'Vertical City',
    teaches: 'supertall traffic, and knowing when to stop',
    brief:
      'A hundred and one floors, 4,887 occupants, six local zones hanging off three two-level sky lobbies, and eight double-deck shuttles at 10 m/s. Every journey above floor 25 is two legs — three when the destination zone is anchored to the far lobby level. Clear three shifts here and the week simply keeps going.',
    needClean: 3,
    reward: 'Multi-round auction · Landing-panel destination dispatch · endless mode',
  }),
  Object.freeze({
    id: 'c6',
    buildingId: 'chancery-house',
    label: 'Scenario 6',
    title: 'The headline address',
    teaches: 'that spare cars are not the same as a short interval',
    brief:
      'Nineteen floors, 612 people and six cars at 5 m/s — the smallest crowd in the week on the tightest promise: a 25 s interval and a 20 s wait. You have more lift than you need and it still is not free. Where the spare cars wait between bursts is the whole of this one.',
    needClean: 3,
    reward: 'Pre-positioning · Energy aware · one spare shaft',
  }),
  Object.freeze({
    id: 'c7',
    buildingId: 'crown-hotel',
    label: 'Scenario 7',
    title: 'Both ways at once',
    teaches: 'demand with no dominant direction, and a car unlike its neighbours',
    brief:
      'Guests arrive and leave all day, so there is no rush hour to point a dispatcher at. Four guest cars share the shaft group with one service lift at 1.75 m/s — less than two thirds their speed. Send it to the wrong call and the guest waits for the slowest car in the building.',
    needClean: 3,
    reward: 'Split demand · Capacity aware · one spare shaft',
  }),
  Object.freeze({
    id: 'c8',
    buildingId: 'st-jude-hospital',
    label: 'Scenario 8',
    title: 'The bed and the visitor',
    teaches: 'that two cars in one bank can be the wrong car',
    brief:
      'A hospital never empties. Two of the five cars are bed lifts — bigger, slower, and the wrong answer to an ordinary hall call — and nothing in the configuration says so. Outpatients on floor 1 empties downward when a clinic ends, which is a crowd from the middle of the building rather than the lobby.',
    needClean: 3,
    reward: 'Destination dispatch · Fairness first · endless mode',
  }),
]);

/** The first contract, which is where a fresh week opens. */
export const FIRST_CONTRACT_ID = 'c1';

/** `undefined` rather than a throw: a stale id in restored state is a recoverable condition. */
export function contractById(id: string): ScenarioContract | undefined {
  return CONTRACTS.find((contract) => contract.id === id);
}

/** The contract that runs a given building, or `undefined` for a building the reader built. */
export function contractForBuilding(buildingId: string): ScenarioContract | undefined {
  return CONTRACTS.find((contract) => contract.buildingId === buildingId);
}

/** The contract after this one in declared order, or `undefined` at the end of the list. */
export function nextContract(id: string): ScenarioContract | undefined {
  const index = CONTRACTS.findIndex((contract) => contract.id === id);
  if (index === -1) return undefined;
  return CONTRACTS[index + 1];
}

/**
 * What a scenario card says about itself.
 *
 * Three answers, never `locked`. See the module docstring: the design's own unlock ladder is
 * disabled at its head with a comment explaining that scenarios teach rather than gate.
 */
export function contractStatus(week: WeekState, contractId: string): ContractStatus {
  if (week.completed.includes(contractId)) return 'cleared';
  if (week.contractId === contractId) return 'current';
  return 'open';
}

/* -------------------------------------------------------------------------- *
 * The stat line — § 4.4's "generated from the building JSON, not authored"
 * -------------------------------------------------------------------------- */

/**
 * `21 floors · 4 cars · 2.5 m/s · 1,710 people` — derived from the building, never authored.
 *
 * ## Why this is a function and not a string on {@link ScenarioContract}
 *
 * `docs/12` § 4.4. The handoff hard-codes each card's stat line beside a re-authored `PRESETS`
 * entry, so the line and the building it describes are two copies of the same facts — and this
 * repository has closed that defect class ten times. Derived here, a building edit (a floor added
 * in the elevation, a shaft removed) moves the card, and a stale line is not expressible.
 *
 * It is also what makes the line true **of the day being played**: `grownBuilding` returns a
 * building whose populations have grown, and passing that building's resolved form here prints the
 * grown occupancy rather than the shipped one.
 *
 * ## The four parts, and what each is
 *
 * - **floors** — expanded floors, so a building declared with `floorRanges` counts the same way as
 *   one declared floor by floor.
 * - **cars** — physical cars across every bank. A double-deck car is one car: it occupies one
 *   shaft, and `vertical-city`'s eight shuttles are eight, not sixteen.
 * - **m/s** — the **fastest** rated speed in the building, which is the number a spec sheet leads
 *   with and the one the handoff's own lines quote (`8 m/s` for Mixed-Use, whose local cars are far
 *   slower). Stated rather than averaged: a mean speed over a mixed fleet describes no car.
 * - **people** — `ResolvedBuilding.totalPopulation`, which `resolveBuilding` computes as the sum of
 *   expanded floor populations and treats as authoritative over the declared value.
 */
export function statLineOf(building: ResolvedBuilding): string {
  const cars = building.banks.reduce((total, bank) => total + bank.cars.length, 0);
  const speeds = building.banks.flatMap((bank) => bank.cars.map((car) => car.ratedSpeedMps));
  const parts = [
    `${String(building.floors.length)} floors`,
    `${String(cars)} cars`,
    // A building with no car has no rated speed, and printing `0 m/s` would describe a lift that
    // cannot move rather than a building that has none. `resolveBuilding` refuses an empty bank,
    // so this is unreachable from `data/` and is handled because a hand-built `ResolvedBuilding`
    // reaches this function too.
    speeds.length === 0 ? 'no cars' : `${formatSpeed(Math.max(...speeds))} m/s`,
    `${groupThousands(building.totalPopulation)} people`,
  ];
  return parts.join(' · ');
}

/**
 * `0.63`, `2.5`, `10` — up to two decimals, trailing zeros trimmed.
 *
 * Hand-rolled rather than `toLocaleString`, because a locale-dependent separator would make the
 * string depend on the machine the browser is running on and on the machine a test runs on, which
 * is the same class of non-determinism CLAUDE.md invariant 2 forbids one layer down.
 */
function formatSpeed(mps: number): string {
  const fixed = mps.toFixed(2);
  return fixed.replace(/\.?0+$/, '');
}

/** `1710` → `1,710`. Comma-grouped explicitly, for {@link formatSpeed}'s reason. */
function groupThousands(value: number): string {
  const rounded = String(Math.round(value));
  return rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
