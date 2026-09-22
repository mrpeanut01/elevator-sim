/**
 * The scenarios, and the stat line that is generated rather than authored.
 *
 * ## One scenario per shipped building, nothing re-authored
 *
 * The handoff re-authors each building inline as a `PRESETS` entry with rounded floor heights and
 * populations. `docs/12-design-handoff.md` § 4.4 refuses that: the implementation uses
 * `data/buildings/*.json` verbatim — same ids, same teaching point — and where a handoff stat line
 * disagrees with the file, **the file wins**. So
 * {@link CONTRACTS} carries the handoff's *prose* (which is the deliverable) and none of its
 * *numbers* (which are a prototype's), and {@link statLineOf} derives the numbers from the
 * building the reader is actually about to run.
 *
 * Every prose field below is the handoff's (`design.html` :1381–1417), and it is no longer
 * byte-for-byte: four cards quoted a number the file contradicts, and § 4.4's rule that **the file
 * wins** does not stop at the stat line. `c4` said *"Forty floors … a transfer level at 20"* over a
 * building that expands to 60 floors with its sky lobby at 31; `c3` said *"Thirty-one"* over 30 and
 * `c5` *"A hundred and one"* over 100; and `c1` counted *"the next four"* on a list that is now
 * **ten** (issue #37, and re-counted again when `c9` and `c10` landed — the count is a fact about
 * the array and goes stale every time it grows, which is why it is annotated rather than derived:
 * a brief is authored prose and `statLineOf`'s rule does not reach inside a sentence). Each
 * correction is annotated where it sits, with the file's own figure.
 *
 * `contracts.test.ts` asserts the prose against the vendored copy is not attempted — the vendored
 * file is a record, not a fixture — so these strings are pinned here and reviewed against it.
 *
 * ## The order is this repository's now, and it is measured — GitHub issue #382
 *
 * The array used to be the handoff's order plus three appended buildings, and `docs/33` § 4.2
 * measured what that added up to: day-1 miss rates of 0.00, 1.00, 0.23, 0.80, 1.00, 0.03, 0.30 and
 * 0.00, which is trivial → unpassable → trivial, and **DC-6 red**. The order is now
 * **non-decreasing in measured day-1 miss rate** — `docs/33` § 4.7 carries the table and the run —
 * and it happens to be non-decreasing in bank count too (1, 1, 1, 1, 1, 1, 2, 2, 3, 7), which is
 * the curriculum reading the same ramp gives: six single-bank buildings of rising subtlety, then
 * two banks and a credential, then two banks and a service zone, then one transfer, then three.
 *
 * **Two contracts were added to that ramp rather than appended to it** — `c9` (Harbour Point) and
 * `c10` (Ashgate Mixed-Use), GitHub issues #500 and #501. Each was measured on the shipped path
 * before it was placed, at `docs/33` § 4.7d's own budget and seeds: 21 of 50 and 26 of 50, so
 * **0.42** and **0.52**, which puts one between St Jude and Midtown and the other beside Secure
 * Tower. Appending them would have been the defect #382 was filed about — Harbour Point's own
 * building file is over-subscribed by construction and would have read 1.00 at the end of the
 * ladder, and Ashgate as built reads 0.13, which is under DC-4's floor. The bank-count reading
 * above survived the insertion, and that was **checked rather than hoped for**: a one-bank tower
 * placed by its miss rate could easily have landed after a three-bank one, and `contracts.test.ts`
 * asserts the sequence so that it would have been a red test rather than a quiet change to what
 * the campaign teaches.
 *
 * ## Three more, and this time the measurement could not order them — `DECISIONS.md` § D581
 *
 * `c11` (CTF-class), `c12` (Shanghai-class) and `c13` (Merdeka-class) are GitHub issues #425, #424
 * and #430. Measured on the shipped path at § 4.7d's budget and seeds, **every one reads 1.00** —
 * and so do `c4` and `c5`, re-measured beside them. Five contracts tied at the ceiling is a
 * measurement that has stopped discriminating, and the reason is one this repository already
 * recorded: `shift/goals.ts`'s energy bar asks for 80 kJ per delivered ride, and a leg in a
 * supertall costs **86.8 to 242.6 kJ** measured across the five. *(That figure is the **period**
 * bar and this measurement is a period run — § 4.7d's budget is each contract's own shift length —
 * so [§ D962](../../../../DECISIONS.md)'s second bar, 350 kJ over a whole authored day, does not
 * move it. What § D962 does establish is that the same five towers read 284.6 to 611.1 kJ over the
 * day a player actually runs, where the tie is not at the energy bar at all.)* § D468 found that the bar is
 * dominated by building fabric rather than by play and left it as `docs/33` O2 and GitHub issue
 * #234; this is the same finding at three more towers, and no rung in `data/contract-ladder.json`
 * can move it, which is why all three are handed **as built**.
 *
 * **So the tie is broken by the curriculum reading, and that is a design choice stated as one.**
 * Ordered by bank count, the five read 3, 4, 5, 6, 7 — `mixed-use-high-rise`, Merdeka-class,
 * CTF-class, Shanghai-class, `vertical-city` — and the whole ladder becomes
 * **1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 7**, which is the first time this sequence has run without a
 * jump. It moves `c5` from the end of the array to the end of a longer array and `c4` not at all;
 * every contract before position 9 is where its own measured rate put it and is untouched. The
 * alternative was to append the three in the order they were authored, which is ordering by arrival
 * inside a tie — the defect #382 was filed about, one level down.
 *
 * ## Three more again, and this time the tie needed a second key — `DECISIONS.md` § D599
 *
 * `c14` (One-WTC-class), `c15` (Empire-State-class) and `c16` (Willis-class) are GitHub issues
 * #428, #427 and #426. Measured on the shipped path at § 4.7d's budget and seeds, **every one reads
 * 1.00**, for the reason the three before them did: `shift/goals.ts`'s energy bar asks 80 kJ per
 * delivered ride and a ride in any of them costs more. *(Again the **period** bar on a period run;
 * see the note above and [§ D962](../../../../DECISIONS.md).)* So the tie at the ceiling is now **eight**
 * contracts, and ordering it by bank count alone is no longer a total order — `one-wtc-class-reference`
 * and `shanghai-class-reference` both have six banks, and `vertical-city` and `willis-class-reference`
 * both have seven.
 *
 * **The second key is the car count, and it is a design choice stated as one.** Within a bank-count
 * tie the smaller group runs first: 73 cars before 106, and 35 before 104. It is the same reading
 * § D581 used one level up — *what a reader has to hold at once* — applied to the only other
 * quantity of the arrangement that a reader meets on the screen. The sequence becomes
 * **1, 1, 1, 1, 1, 1, 2, 2, 3, 4, 5, 6, 6, 7, 7, 8**, still non-decreasing and still with no step
 * larger than one, and `contracts.test.ts` asserts both.
 *
 * **The ids do not move with the order and never will.** `c1`–`c10` are names, and a saved week, a
 * career tower, a `data/` row and this repository's own prose all hold them; renumbering would make
 * an id mean two things. What moves is the array's order, each contract's `label` (which is its
 * *position*, so `c6` is now *Scenario 2* and `c2` is now *Scenario 5*) and `needClean` (the same
 * ladder shape at ten — 1, 2, 2, 2, 2, 3, 3, 3, 3, 3 — re-attached to the new positions, because a
 * stake that fell in the middle of the campaign would be a campaign with two finales). The
 * deviation from the handoff's own order is recorded in `docs/12` § 4.7, which is where § 4.4 says
 * a disagreement it does not cover belongs.
 *
 * ## What a contract hands the player is `data/contract-ladder.json`, not this file
 *
 * A scenario's **crowd** and the **tower it hands over** are declared per contract in
 * `data/contract-ladder.json` and applied by `shift/ladder.ts`. That is why three briefs below
 * describe a building `data/buildings/` does not hold: `c1` runs its block with one car and 234
 * residents, `c2` runs its tower four tenths let, and `c6` runs five cars at 3.5 m/s. The stat line
 * beside each card is drawn from `ladderTowersOf`, the same derivation the run is built from, so
 * the card and the run cannot disagree about the tower.
 *
 * ## Every contract is open, and there is no state in which one is not
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
 * `contracts.test.ts` asserts every one resolves — which is the check that a renamed building file
 * cannot silently orphan a scenario.
 */

import type { ResolvedBuilding } from '@elevator-sim/core/browser';

import type { ContractStatus, ScenarioContract, WeekState } from './types.js';

/**
 * The handoff's five, and eleven more, in **measured difficulty order** rather than the handoff's —
 * see the module docstring and `docs/33` § 4.7.
 *
 * Frozen, and every member frozen: this is shared, read-only reference data of exactly the kind
 * CLAUDE.md invariant 7 says belongs in data rather than in code — and it *would* be in
 * `data/scenario-goals.json`'s neighbourhood if it were tunable. It is not: these are the
 * handoff's authored words, and the only numeric field, `needClean`, is a design decision rather
 * than a parameter an optimizer could search. A `data/` file for five frozen sentences would add a
 * schema, a parser and a loader to protect nothing.
 */
/**
 * **Sixteen contracts, and the handoff specifies five.** `docs/12` § 4.4 fixes the campaign at the five
 * buildings shipped when the design was written; five more buildings have landed since, and a
 * shipped building with no contract is a scenario the reader can never take. The deviation is
 * recorded in `docs/12` § 4.7 rather than absorbed, which is the rule the handoff itself sets: it
 * wins every disagreement about what the screen looks like, and a disagreement it does not cover is
 * a decision to be written down.
 *
 * **Sixteen rather than seventeen, and the exception is a list rather than a silence.**
 * `burj-class-reference` is a *reference* building and has no contract;
 * `contracts.test.ts#REFERENCE_ONLY` names it, asserts it ships, and asserts it has none, so the
 * exception cannot quietly widen into the rule. **Six more reference towers landed on 2026-09-15
 * and every one of them has a contract**, on the owner's 2026-09-10 ruling on #232 that the target
 * is 22 buildings and 22 contracts and that every building is playable — so the list did not widen,
 * and the one member it still holds is the building that predates that ruling.
 */
export const CONTRACTS: readonly ScenarioContract[] = Object.freeze([
  Object.freeze({
    id: 'c1',
    buildingId: 'garden-apartments',
    label: 'Scenario 1',
    title: 'Learn the ropes',
    teaches: 'a call, a car, a wait',
    brief:
      'Six floors, two hydraulic cars at 0.63 m/s, and a gentle trickle of residents. Nothing here is hard — it exists so the nine that follow have something to be different from.',
    needClean: 1,
    reward: 'Minimum estimated wait · Energy aware · one spare shaft',
    /*
     * An hour, and the only contract that names one — § D234, issue #27.
     *
     * 120 residents on a gentle trickle do not produce twenty calls in thirty minutes: over twelve
     * seeds at the shipped defaults the median is **18**, and seven of the twelve are under the
     * `WAKE_UP_ARRIVALS` line. So the scenario whose own brief says *"nothing here is hard"* was
     * the one scenario a player could not clear without changing a control nothing points them at,
     * and it told them *"Shift missed. Streak reset."* over a perfect day while it happened.
     *
     * Named here rather than by moving `DEFAULT_SHIFT_LENGTH_S`: 1 800 s is `rise-and-fall`'s own
     * horizon and the horizon every published figure in `docs/05-roadmap.md` was measured over, and
     * moving it would silently change what the viewer's opening run is comparable with. This is a
     * fact about one small building, so it is authored on that building's contract.
     */
    shiftLengthS: 3600,
  }),
  Object.freeze({
    id: 'c6',
    buildingId: 'chancery-house',
    label: 'Scenario 2',
    title: 'The headline address',
    teaches: 'that spare cars are not the same as a short interval',
    brief:
      'Nineteen floors, 649 people and five cars at 3.5 m/s — the smallest crowd in the week on the tightest promise: a 25 s interval and a 20 s wait. You have about as much lift as you need and not a car to spare. Where the cars wait between bursts is the whole of this one.',
    needClean: 2,
    reward: 'Pre-positioning · Energy aware · one spare shaft',
  }),
  Object.freeze({
    id: 'c8',
    buildingId: 'st-jude-hospital',
    label: 'Scenario 3',
    title: 'The bed and the visitor',
    teaches: 'that two cars in one bank can be the wrong car',
    brief:
      'A hospital never empties. Two of the five cars are bed lifts — bigger, slower, and the wrong answer to an ordinary hall call — and nothing in the configuration says so. Outpatients on floor 1 empties downward when a clinic ends, which is a crowd from the middle of the building rather than the lobby.',
    needClean: 2,
    reward: 'Destination dispatch · Fairness first · endless mode',
  }),
  Object.freeze({
    id: 'c9',
    buildingId: 'harbour-point',
    label: 'Scenario 4',
    title: 'The building at its limit',
    teaches: 'where a lift group runs out, on the one tower with no other problem',
    /*
     * **Three fifths let, and the brief says so** — `data/contract-ladder.json`'s `c9` rung.
     *
     * Harbour Point as authored is over-subscribed on purpose: thirteen shipped dispatcher
     * profiles × five seeds give 64 of 65 runs a diverging queue and a suppressed mean, which is
     * the role `docs/37` § 7.2 authors it for and is **not** a scenario, because a day nobody can
     * pass teaches nothing. The rung lets it at 0.60 — 930 desks rather than 1 560 — exactly as
     * `c2` lets Midtown Office at 0.395, and the stat line beside this card is drawn from
     * `ladderTowersOf`, so the card and the run cannot disagree about which tower this is.
     */
    brief:
      'Sixteen floors and six cars on a building let at three fifths. One bank, no zoning, no credential and nothing clever to find: the only questions are where the cars wait and which call each one takes. Let the other two fifths and no dispatcher in the list clears the morning at all — this is the tower where the answer is a shaft rather than a strategy.',
    needClean: 2,
    reward: 'Capacity aware · Fairness first · one spare shaft',
  }),
  Object.freeze({
    id: 'c2',
    buildingId: 'midtown-office',
    label: 'Scenario 5',
    title: 'The morning rush',
    teaches: 'up-peak, and the gap between demand offered and carried',
    brief:
      'A twenty-floor tower four tenths let — 675 tenants — on four geared cars. At the peak they all want the same thing at the same time, and the queue in the lobby is where you find out whether your dispatcher is any good. The floors above are empty for now, which is the only reason this is winnable.',
    needClean: 2,
    reward: 'Operational zoning · Capacity aware · one spare shaft',
  }),
  Object.freeze({
    id: 'c7',
    buildingId: 'crown-hotel',
    label: 'Scenario 6',
    title: 'Both ways at once',
    teaches: 'demand with no dominant direction, and a car unlike its neighbours',
    brief:
      'Guests arrive and leave all day, so there is no rush hour to point a dispatcher at. Four guest cars share the shaft group with one service lift at 1.75 m/s — less than two thirds their speed. Send it to the wrong call and the guest waits for the slowest car in the building. And one of the four is booked out for scheduled maintenance for part of every day here and comes back before the end, so for a stretch of the morning the tower is three guest cars and the slow one.',
    needClean: 3,
    reward: 'Split demand · Capacity aware · one spare shaft',
  }),
  Object.freeze({
    id: 'c3',
    buildingId: 'secure-tower',
    label: 'Scenario 7',
    title: 'Two banks, one lobby',
    teaches: 'zoning, and calls nobody may legally answer',
    brief:
      'Thirty floors split across a low and a high bank, with credentialed floors above 21. A call a car cannot legally take looks nothing like a slow one — and must never be reported as one.',
    needClean: 3,
    reward: 'Destination disclosure · Fairness first · one spare shaft',
  }),
  Object.freeze({
    id: 'c10',
    buildingId: 'ashgate',
    label: 'Scenario 8',
    title: 'The car park nobody serves',
    teaches: 'that a service zone is a decision, and a transfer costs a second wait',
    brief:
      'Twenty-two floors: two car-park decks below the datum, a ground of shops, and sixteen floors of offices over them. One of the five cars reaches the car park, so most of the people arriving ride twice and wait twice. Nothing here is out of service and nothing is broken.',
    needClean: 3,
    reward: 'Operational zoning · Destination disclosure · one spare shaft',
  }),
  Object.freeze({
    id: 'c4',
    buildingId: 'mixed-use-high-rise',
    label: 'Scenario 9',
    title: 'The sky lobby',
    teaches: 'transfers, and why a two-leg journey waits twice',
    brief:
      /*
       * **Sixty floors, transfer level 31** — issue #37, and the file wins (`docs/12` § 4.4).
       *
       * The handoff wrote *"Forty floors … and a transfer level at 20"*. `mixed-use-high-rise.json`
       * expands to **60** floors and declares exactly two `isTransferFloor` floors: `G` and `31`,
       * the sky lobby. So the card carried a floor count twenty out from the stat line printed two
       * lines beneath it, and named a transfer level the building does not have — the two numbers
       * a reader would use to decide whether to take the assignment.
       *
       * `docs/12` § 4.4's rule is *where a handoff stat line disagrees with the file, the file
       * wins*, and § 4.7 records a deviation rather than absorbing it. This is that rule applied to
       * the **prose** for the first time: the stat line has been generated from the building since
       * this module was written, which is exactly why the drift was visible side by side. The
       * shuttle's 8 m/s is the file's own and is unchanged.
       */
      'Sixty floors, an 8 m/s shuttle and a sky lobby at 31. A rider changing cars is waiting twice and must be counted once — get that wrong and every figure below flatters you.',
    needClean: 3,
    reward: 'Predictive balanced · Contract-net auction · two more shafts',
  }),
  Object.freeze({
    id: 'c13',
    buildingId: 'merdeka-class-reference',
    label: 'Scenario 10',
    title: 'One change, not three',
    teaches: 'what a transfer costs, by taking most of them away',
    brief:
      'Fifty-six office floors reached from the street in a single ride, over a rise that would be three sky lobbies in an older tower. Most of this building never transfers at all — so when a rider does wait twice, there is nowhere for the second wait to hide.',
    needClean: 3,
    reward: 'Predictive balanced · Fairness first · endless mode',
  }),
  Object.freeze({
    id: 'c11',
    buildingId: 'ctf-class-reference',
    label: 'Scenario 11',
    title: 'Twenty up, ten down',
    teaches: 'that a car is not one speed, and that the way back costs more than the way out',
    brief:
      'A hundred and eleven floors on three sky lobbies, and a shuttle that climbs at 20 m/s and comes down at 10 — the descent is held for the ears of the people inside, not by the machine. Every figure you read about that bank was measured on a round trip the textbook charges at one speed and it makes at two.',
    needClean: 3,
    reward: 'Destination dispatch · Energy aware · two more shafts',
  }),
  Object.freeze({
    id: 'c14',
    buildingId: 'one-wtc-class-reference',
    label: 'Scenario 12',
    title: 'The floor you press before you get in',
    teaches: 'what a landing panel is for, on the building that made it famous',
    brief:
      'A hundred and four floors, six banks and one change on the way up — and the only sky lobby in the set with two levels, because the cars that go higher leave from the upper one. The escalator between them is not scenery: an eighth of this tower’s rides use it instead of a lift.',
    needClean: 3,
    reward: 'Destination dispatch · Destination panel · two more shafts',
  }),
  Object.freeze({
    id: 'c12',
    buildingId: 'shanghai-class-reference',
    label: 'Scenario 13',
    title: 'A hundred and six cars',
    teaches: 'that the fastest lift in the catalogue is not fast on a short hop',
    brief:
      'A hundred and twenty-eight floors, four sky lobbies and a hundred and six cars, fourteen of them the quickest machines this simulator can express. Three of the shuttle’s four hops are too short for it to ever reach its rated speed. Finding the one that is not is the whole of this building.',
    needClean: 3,
    reward: 'Multi-round auction · Pre-positioning · two more shafts',
  }),
  Object.freeze({
    id: 'c5',
    buildingId: 'vertical-city',
    label: 'Scenario 14',
    title: 'Vertical City',
    teaches: 'supertall traffic, and knowing when to stop',
    brief:
      'A hundred floors, 4,887 occupants, six local zones hanging off three two-level sky lobbies, and eight double-deck shuttles at 10 m/s. Every journey above floor 25 is two legs — three when the destination zone is anchored to the far lobby level. Clear three shifts here and the week simply keeps going.',
    needClean: 3,
    reward: 'Multi-round auction · Landing-panel destination dispatch · endless mode',
  }),
  Object.freeze({
    id: 'c16',
    buildingId: 'willis-class-reference',
    label: 'Scenario 15',
    title: 'Which deck are you on?',
    teaches: 'that a double-decker is two cars that cannot disagree',
    brief:
      'Sixteen double-deckers, and they are the locals rather than the shuttles — every floor in a zone is paired with the one above it, so the floor you are going to decides which deck you board and the lobby you board from. At two and a half metres a second the stops are most of the round trip, which is exactly what the second deck is for.',
    needClean: 3,
    reward: 'Capacity aware · Pre-positioning · two more shafts',
  }),
  Object.freeze({
    id: 'c15',
    buildingId: 'empire-state-class-reference',
    label: 'Scenario 16',
    title: 'Change at eighty',
    teaches: 'what a building does when nobody has invented the express yet',
    brief:
      'Eight banks, a hundred and two floors and not one express in the tower. The top is reached by riding a local to eighty, changing, riding to eighty-six, and changing again — three rides and two waits, which is the most this simulator will route. Every other tall building you have run hides its second leg behind a shuttle; this one cannot.',
    needClean: 3,
    reward: 'Fairness first · Energy aware · endless mode',
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
