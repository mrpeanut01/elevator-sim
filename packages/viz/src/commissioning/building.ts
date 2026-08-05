/**
 * The choices, put back into a **real** `BuildingConfig`.
 *
 * ## Why this is a building edit and not a header multiplier
 *
 * `shift/growth.ts` is the pattern and it states the argument in one line: the handoff's own
 * population growth *"must reach the simulation rather than only the header"*, so tenants moving in
 * is a **real edit to a real `BuildingConfig`**, put back through `parseBuilding` and
 * `resolveBuilding` — the same path the building editor already uses. A growth factor that only
 * reached a caption would be a dead seam, and a *lying* one.
 *
 * Commissioning has the same shape and the same hazard, one dimension over. A "+1 shaft" that only
 * reached the commissioning screen's own summary would be a control the player watched move while
 * the week ran the building they started with — and unlike growth, the player *chose* it, so the
 * caption would be a lie they authored. So {@link commissionedBuilding} returns a config the loader
 * accepts, and `commissioning.test.ts` asserts that on real buildings by running them and comparing
 * the **legs**.
 *
 * The parse and the resolve happen at the caller, exactly as they do for `grownBuilding`: this
 * function's contract is *"the result is accepted by `parseBuilding`/`resolveBuilding`"*, and
 * `refusals.ts` is the thing that runs them in order to read the loader's own gates rather than
 * re-implement them.
 *
 * ## It is total, and that is a division of labour rather than a looseness
 *
 * {@link commissionedBuilding} applies whatever it is handed. It does not decide whether a choice
 * *should* be run — that is `reviewCommissioning`, in the same way `campaign/dimensions.ts`'s
 * `admitProfile` decides and `stageRun` applies. Splitting them is what lets the refusal list be
 * computed **from the loader's verdict on the edited building**, which needs the edit to exist
 * first. A function that refused inside itself could only ever refuse things it knew about.
 *
 * ## Identity when nothing moved
 *
 * The input object comes back — not a copy that happens to be equal — when no bank's choice differs
 * from what the building already stands as. `shift/incidents.ts` established this and gave the
 * reason: a run's building document is digested into a leaderboard board, so a config layer that
 * returned a fresh object for a no-op would move every board. It is also the negative control this
 * module owes, and it is what makes *retrofit* free: with the fabric frozen, the week runs the
 * byte-identical building it would have run if this module did not exist.
 */

import { expandFloors, type BuildingConfig, type CarConfig } from '@elevator-sim/core/browser';

import { asBuiltChoices, choiceForBank } from './choices.js';
import {
  classById,
  isDoubleDeckClass,
  type BankChoice,
  type CommissionableClass,
  type CommissioningChoices,
} from './types.js';

/**
 * The building the week will actually run, given the player's choices.
 *
 * Returns a **new** `BuildingConfig`; the input is neither mutated nor retained. A bank with no
 * choice, a bank whose choice matches what it already is, and a bank naming a class the list does
 * not contain are all left exactly as authored — the last because an unknown class is a refusal
 * with a name, and substituting a plausible machine for it would run a building nobody chose.
 */
export function commissionedBuilding(
  base: BuildingConfig,
  choices: CommissioningChoices,
  classes: readonly CommissionableClass[],
): BuildingConfig {
  const asBuilt = asBuiltChoices(base, classes);
  const floorHeights = heightsOf(base);
  let moved = false;

  const banks = base.banks.map((bank) => {
    const choice = choiceForBank(choices, bank.id);
    const built = choiceForBank(asBuilt, bank.id);
    if (choice === undefined || built === undefined) return bank;
    if (
      choice.shafts === built.shafts &&
      choice.machineClassId === built.machineClassId &&
      choice.ratedSpeedMps === built.ratedSpeedMps
    ) {
      return bank;
    }
    const machineClass = classById(classes, choice.machineClassId);
    if (machineClass === undefined) return bank;

    moved = true;
    const separationM = deckSeparationOf(bank.servesFloorPairs, floorHeights);
    return {
      ...bank,
      cars: shaftsOf(bank.cars, choice.shafts).map((car) =>
        recommissioned(car, choice, machineClass, separationM),
      ),
    };
  });

  return moved ? { ...base, banks } : base;
}

/* -------------------------------------------------------------------------- *
 * Shafts
 * -------------------------------------------------------------------------- */

/**
 * The bank's car list, grown or cut to `wanted` shafts.
 *
 * **A bank keeps at least one car**, which is `shift/incidents.ts`'s rule and its reason: a bank
 * with none is a set of floors nobody can reach, which is a different building rather than a
 * smaller one. `refusals.ts` refuses a choice below one so a player is told; this clamp is what
 * stops a caller that skipped the review from producing a config the loader would reject on a
 * different ground and blame on a different field.
 *
 * Cars are cut from the **end** and added at the end, so the first `min(before, after)` cars keep
 * their ids across a change of shaft count — which is what makes a per-car observation from one
 * run readable beside the next one.
 */
function shaftsOf(cars: readonly CarConfig[], wanted: number): readonly CarConfig[] {
  const target = Math.max(1, Math.round(wanted));
  if (cars.length === 0) return cars;
  if (target <= cars.length) return cars.slice(0, target);

  const taken = new Set(cars.map((car) => car.id));
  const grown = [...cars];
  let template = cars[cars.length - 1] as CarConfig;
  while (grown.length < target) {
    const id = nextCarId(template.id, taken);
    taken.add(id);
    const next = { ...template, id };
    grown.push(next);
    template = next;
  }
  return grown;
}

/**
 * The next unused car id after `previous`, in that id's own scheme.
 *
 * Shipped ids come in two shapes — `A`, `B`, `C` and `S1`, `S2`, or the two combined as `Z1-A` —
 * so the rule is: increment the **trailing run** of letters or digits, keeping whatever prefix it
 * hangs off, and keep going until the id is unused. `A` becomes `B`, `S8` becomes `S9`, `Z1-A`
 * becomes `Z1-B`.
 *
 * A deterministic total order, never a draw: invariant 2 forbids a random draw outside the
 * injected `StreamSet`, and an id that wobbled would give two runs of the same choice two
 * different building documents.
 */
function nextCarId(previous: string, taken: ReadonlySet<string>): string {
  let candidate = previous;
  for (let guard = 0; guard < 1000; guard += 1) {
    candidate = increment(candidate);
    if (!taken.has(candidate)) return candidate;
  }
  return `${previous}-${String(taken.size + 1)}`;
}

function increment(id: string): string {
  const match = /^(.*?)([A-Za-z]+|\d+)$/.exec(id);
  if (match === null) return `${id}2`;
  const prefix = match[1] ?? '';
  const tail = match[2] ?? '';
  if (/^\d+$/.test(tail)) return `${prefix}${String(Number(tail) + 1)}`;
  return `${prefix}${nextLetters(tail)}`;
}

/** `A` → `B`, `Z` → `AA`, `AZ` → `BA`. Base-26 over the alphabet the ids are written in. */
function nextLetters(letters: string): string {
  const chars = [...letters.toUpperCase()];
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const code = (chars[index] ?? 'A').charCodeAt(0);
    if (code < 'Z'.charCodeAt(0)) {
      chars[index] = String.fromCharCode(code + 1);
      return chars.join('');
    }
    chars[index] = 'A';
  }
  return `A${chars.join('')}`;
}

/* -------------------------------------------------------------------------- *
 * The machine
 * -------------------------------------------------------------------------- */

/**
 * One car, rebuilt to the choice.
 *
 * Three fields move and a fourth is derived:
 *
 * - `spec` and `ratedSpeedMps` are the choice, verbatim. A speed outside the class's band is left
 *   outside it rather than clamped, because `core` raises `speed-outside-class-range` for exactly
 *   that and `refusals.ts` reads the loader's verdict. Clamping here would silence a gate.
 * - `ratedLoadLb` **is** clamped into the class's `capacityLbRange`, and that is a different case:
 *   the load is not a dimension the player chose, so leaving a 1 600 lb car in a class built from
 *   2 500 lb upwards would refuse the choice on a field the screen has no control for. Choosing a
 *   class is choosing the sizes that class is built in, and the smallest of them is what a car too
 *   small for it becomes.
 * - the deck fields are **cleared and re-derived**, so changing away from a double-deck class
 *   really does return a single-deck car. A `doubleDeck: true` left behind on a car whose class no
 *   longer declares a per-deck range is a building describing hardware that does not exist.
 *
 * ## The double-deck class in a bank with no pairs
 *
 * It is commissioned as a **single deck**, and the loader is the reason. `deckSeparationM` is
 * *required* when `doubleDeck` is set — `deck-configuration` is an issue, not a warning — so a car
 * marked double-deck in a bank with no pairs to read a separation from makes the whole building
 * unloadable, and `commissionedBuilding` would then be a function that returns configs the loader
 * refuses. That would break the contract this module's docstring states.
 *
 * Running it as a single deck is also what `core` itself does one step later: `missing-floor-pairs`
 * says in as many words that such a car *"runs as a single deck of the same whole-car capacity,
 * makes up to twice the stops the declared hardware would"*. So the config is honest and the choice
 * is still refused — by `refusals.ts`'s third gate, which is raised there precisely because the
 * loader never gets to say it.
 */
function recommissioned(
  car: CarConfig,
  choice: BankChoice,
  machineClass: CommissionableClass,
  separationM: number | undefined,
): CarConfig {
  const load = clamp(
    car.ratedLoadLb ?? machineClass.loadMinLb,
    machineClass.loadMinLb,
    machineClass.loadMaxLb,
  );
  const single = withoutDeckFields(car);
  const rebuilt: CarConfig = {
    ...single,
    spec: choice.machineClassId,
    ratedSpeedMps: choice.ratedSpeedMps,
    ratedLoadLb: load,
  };
  // No separation means the bank declares no pairs, and a double-deck car without one is a
  // building the loader refuses outright. See the docstring: it is commissioned single-deck and
  // refused by name.
  if (!isDoubleDeckClass(machineClass) || separationM === undefined) return rebuilt;
  return { ...rebuilt, doubleDeck: true, deckSeparationM: separationM };
}

/**
 * The car without its deck fields.
 *
 * `delete` on a copy rather than a rest destructure, because `exactOptionalPropertyTypes` makes
 * *absent* and *present-and-`undefined`* different values and a rest pattern would leave three
 * unused bindings behind to say so. The cast is over a shape this function only ever narrows.
 */
function withoutDeckFields(car: CarConfig): CarConfig {
  const copy: Record<string, unknown> = { ...car };
  delete copy['doubleDeck'];
  delete copy['deckSeparationM'];
  delete copy['ratedLoadLbPerDeck'];
  return copy as unknown as CarConfig;
}

/**
 * The vertical distance between the decks, read from the bank's own first floor pair.
 *
 * Derived rather than chosen: `core` raises `deck-separation-mismatch` as an **error** when a
 * declared pair is not exactly `deckSeparationM` apart, so a number invented here would make the
 * building unloadable. `undefined` for a bank with no pairs — there is no separation to read, and
 * that absence is itself the gate.
 */
function deckSeparationOf(
  pairs: readonly (readonly [string, string])[] | undefined,
  heights: ReadonlyMap<string, number>,
): number | undefined {
  const first = pairs?.[0];
  if (first === undefined) return undefined;
  const lower = heights.get(first[0]);
  const upper = heights.get(first[1]);
  if (lower === undefined || upper === undefined) return undefined;
  return Number((upper - lower).toFixed(6));
}

/**
 * Floor heights by id, through `core`'s own `expandFloors`.
 *
 * The same reason `grownBuilding` reaches for it: range expansion and the explicit-floor
 * precedence rule have one implementation, and a second copy here would agree with it until
 * somebody changed one. A source `expandFloors` refuses is one `resolveBuilding` would also
 * refuse, so an empty map is returned and the loader states the problem in its own words.
 */
function heightsOf(base: BuildingConfig): ReadonlyMap<string, number> {
  try {
    return new Map(expandFloors(base).map((floor) => [floor.id, floor.heightM]));
  } catch {
    return new Map();
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
