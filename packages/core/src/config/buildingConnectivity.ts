/**
 * Does this building's lift service actually *connect*?
 *
 * A building can be schema-valid in every field and still be unusable: a populated floor no
 * bank serves, a bank whose only junction with the rest of the tower was deleted, a sky lobby
 * that lost its `isTransferFloor` flag. Nothing in `schema.ts` can see any of that, because
 * every individual value is fine — the defect is in the *graph* they describe.
 *
 * ## Why this is a load-time check and not only a run-time one
 *
 * The trace generator already refuses an unroutable pair and says so
 * (`traffic/generator.ts`'s rejection census). That is the right behaviour and it is not
 * enough, for two reasons:
 *
 * 1. It arrives **per run**, after a dispatcher and a seed have been chosen, and it arrives as
 *    demand *quietly redistributed or dropped* — a building that generates 1 570 journeys where
 *    the author meant 1 833 is a building whose every published figure is about a smaller
 *    problem than the one on screen.
 * 2. A building editor validates by *loading*, not by running. `resolveBuilding` accepting an
 *    edit is the editor's whole definition of valid (`DECISIONS.md` § D67), so a defect the
 *    loader cannot see is a defect the author is never shown.
 *
 * This model was a **test** for most of the project's life — `buildingConnectivity.test.ts`
 * held the eight files in `data/buildings/` to exactly these properties, and its own docstring
 * said *"this is the failure mode the schema cannot catch"*. A test bound to a data directory
 * covers the files on disk and nothing a UI creates, which is why the model is promoted here
 * and the test now imports it rather than restating it.
 *
 * ## What it models, and what it deliberately does not
 *
 * **Lifts alone.** Banks are edges, a journey may change banks only on a floor flagged
 * `isTransferFloor`, and a double-deck bank's decks travel together so a leg boarded on a
 * lower-deck floor alights on a lower-deck floor. A declared `transportModes` edge — an
 * escalator, a stair — is **not** an edge here, which makes the check *stronger* rather than
 * stale: an escalator can never be what rescues a zoning mistake. `traffic/route.ts` plans the
 * real journeys and does use those edges, so whatever this model can reach the planner reaches
 * in no more lift legs. `buildingConnectivity.test.ts` asserts that relation directly, on the
 * shipped data, in both directions.
 *
 * **Credential-blind, and that is a decision rather than an omission.** Access zoning
 * constrains *who* may travel, not *whether the shafts connect* — the same narrowing
 * `traffic/route.ts` states in its own header. `secure-tower` deliberately drops
 * origin-destination pairs for credential reasons (its `facilities` group reaches four tenant
 * zones and not the executive floor), and a building that refuses a journey on purpose is
 * correctly configured. Turning that into a load-time diagnostic would fire on a shipped
 * building for doing the thing it was authored to do, and the author would learn to ignore the
 * category. So the credential question stays where it already is: the generator's
 * `no-credential` rejection, per run, where the rider exists.
 *
 * ## Warning, not error, except when nobody can be served
 *
 * A building with an unreachable floor still runs, still serves everyone else, and is a
 * legitimate thing to have half-built in an editor. Rejecting it would make the loader refuse
 * an intermediate state a player passes through on the way to a valid one. So the verdict is a
 * warning carried on {@link ResolvedBuilding.warnings}, which the building editor already
 * renders (`viz/src/editor/editorValidate.ts`, `viz/src/dev/buildingEditor.ts`) and the CLI
 * already carries as a load-time disclaimer.
 *
 * The one hard refusal is the building that connects **nothing**: no ordered pair the demand
 * generator could use is routable, so the run would produce no legs at all and every figure it
 * reported would be about an empty building.
 *
 * ## The canonical API, and the weaker copy that should call it
 *
 * `viz/src/authoring/buildingSpec.ts#unreachableFloors` is a second implementation of this
 * question over `BuildingSpec` rather than over a resolved building, and it is weaker in two ways
 * that matter: it seeds its search at **floor 0 only**, so a building whose entrance is a basement
 * is judged from a floor nobody walks in at; and it expands `transportModes` as edges, so an
 * escalator can rescue a zoning mistake there that this model refuses. It is also a different
 * *question* — it answers "which floor numbers are stranded" for a control, where this answers
 * "which ordered pairs the generator would draw are unroutable" for a diagnostic.
 *
 * Three exports are the seam for replacing it, and they are exported for that rather than for
 * completeness. {@link measureConnectivity} returns the facts — pairs considered, pairs routable,
 * and the gaps themselves — so a caller drawing which floors are cut off never has to parse them
 * back out of a warning message. {@link legCountsFrom} answers one origin, which is what a control
 * highlighting a single shaft's band needs. {@link connectivityDiagnostics} is the loader's own
 * verdict, so an editor can render exactly the sentence the loader would raise. All three take a
 * {@link ConnectivitySource}, which is the four fields of a `ResolvedBuilding` this model reads —
 * so `buildingFromSpec` → `parseBuilding` → `resolveBuilding` is the only bridge the viz side
 * needs, and it already runs that chain.
 */

import { ISSUE_CODES, WARNING_CODES } from './schema.js';
import type { ConfigIssue, ConfigWarning, FloorConfig, ResolvedBank } from './types.js';

/**
 * How many lift legs a journey should ever need from a street entrance.
 *
 * Three covers a double-deck supertall — position for the correct deck, shuttle, local — and
 * anything more means a zone is anchored to a lobby level the entrance cannot reach directly,
 * which is a layout bug rather than a long trip. `mixed-use-high-rise` needs exactly three
 * (45 → 31 → G → 20), so the bound is `> 3` and the tightest shipped building sits on it.
 *
 * **This is a *design* bound and not `traffic.maxLegs`.** `TRAFFIC_DEFAULTS.maxLegs` is 6 and is
 * the point at which the generator stops emitting the journey; this is the point at which a
 * human should look at the zoning. They are different numbers on purpose, and importing the
 * traffic one here would make the lower layer depend on the upper.
 */
export const MAX_LEGS_FROM_ENTRANCE = 3;

/** How many example pairs a diagnostic names before it summarises the rest. */
const EXAMPLES = 6;

/** The subset of a resolved bank this model needs. */
export interface ConnectivityBank {
  readonly id: string;
  readonly servesFloors: readonly string[];
  readonly servesFloorPairs?: readonly (readonly [string, string])[] | undefined;
}

/** The routing fabric: banks as edges, transfer floors as the only place to change one. */
export interface ConnectivityTopology {
  readonly banks: readonly ConnectivityBank[];
  /** Floors where a journey may change banks and keep its identity. */
  readonly transferFloors: ReadonlySet<string>;
}

/** Just the parts of a building this model reads. */
export interface ConnectivitySource {
  readonly floors: readonly FloorConfig[];
  readonly entranceFloors: readonly FloorConfig[];
  readonly transferFloors: readonly FloorConfig[];
  readonly banks: readonly (ConnectivityBank | ResolvedBank)[];
}

export function connectivityTopologyOf(building: ConnectivitySource): ConnectivityTopology {
  return {
    banks: building.banks,
    transferFloors: new Set(building.transferFloors.map((floor) => floor.id)),
  };
}

/**
 * Where one leg on `bank` boarded at `from` can put a passenger down.
 *
 * For a single-deck bank that is every floor it serves. For a double-deck bank the decks
 * travel together, so a passenger who boards the lower deck alights on a lower-deck floor:
 * boarding at `G` of the pair `["G", "2"]` reaches `26`, never `27`.
 */
export function deckAwareDestinations(bank: ConnectivityBank, from: string): readonly string[] {
  const pairs = bank.servesFloorPairs ?? [];
  if (pairs.length === 0) return bank.servesFloors;

  const lower = pairs.some((pair) => pair[0] === from);
  const upper = pairs.some((pair) => pair[1] === from);
  // A floor outside every pair is served by the car as a whole, so either deck will do.
  if (!lower && !upper) return bank.servesFloors;

  const paired = new Set(pairs.flatMap((pair) => [pair[0], pair[1]]));
  const reachable = new Set(bank.servesFloors.filter((floor) => !paired.has(floor)));
  for (const pair of pairs) {
    if (lower) reachable.add(pair[0]);
    if (upper) reachable.add(pair[1]);
  }
  return [...reachable];
}

/**
 * Membership index for the breadth-first search's inner test.
 *
 * The search asks *"does this bank serve the floor I am standing on?"* once per (frontier floor ×
 * bank), and `measureConnectivity` runs one search per origin — on `vertical-city` that is 99
 * origins over 7 banks whose `servesFloors` run to 25 entries. As a linear `includes` that is a
 * few million string comparisons per `resolveBuilding`, on a function every test in the repository
 * calls; as a `Set` it is nothing. Built once per search rather than once per building because
 * `legCountsFrom` also takes hand-built topologies, and a second required field on
 * {@link ConnectivityTopology} would be a trap for every one of those callers.
 */
function servesIndexOf(topology: ConnectivityTopology): readonly ReadonlySet<string>[] {
  return topology.banks.map((bank) => new Set(bank.servesFloors));
}

/** Minimum number of lift legs from `origin` to every floor it can reach. */
export function legCountsFrom(
  topology: ConnectivityTopology,
  origin: string,
  servesIndex: readonly ReadonlySet<string>[] = servesIndexOf(topology),
): ReadonlyMap<string, number> {
  const legs = new Map<string, number>([[origin, 0]]);
  // The origin is boardable because the passenger starts there; anywhere else, a second
  // leg may only begin on a declared transfer floor.
  let frontier = [origin];
  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const next: string[] = [];
    for (const at of frontier) {
      for (let bankIndex = 0; bankIndex < topology.banks.length; bankIndex += 1) {
        if (servesIndex[bankIndex]?.has(at) !== true) continue;
        const bank = topology.banks[bankIndex];
        /* c8 ignore next -- the index came from this array's own length. */
        if (bank === undefined) continue;
        for (const dest of deckAwareDestinations(bank, at)) {
          if (legs.has(dest)) continue;
          legs.set(dest, depth);
          if (topology.transferFloors.has(dest)) next.push(dest);
        }
      }
    }
    frontier = next;
  }
  return legs;
}

/** Populated floor ids, in floor order. These are the origins and destinations demand uses. */
export function populatedFloorIds(building: ConnectivitySource): readonly string[] {
  return building.floors.filter((floor) => floor.population > 0).map((floor) => floor.id);
}

/** One ordered pair the demand generator could ask for, and what the lifts say about it. */
export interface ConnectivityGap {
  readonly originFloorId: string;
  readonly destinationFloorId: string;
  /** `undefined` when nothing connects them; otherwise the leg count, above the bound. */
  readonly legs: number | undefined;
}

/** What the model found. Counts are over ordered pairs, which is what demand is drawn over. */
export interface BuildingConnectivity {
  /** Ordered pairs considered: `(entrances ∪ populated) × populated`, excluding the diagonal. */
  readonly pairsConsidered: number;
  readonly pairsRoutable: number;
  /** Populated floors an entrance cannot reach. Incoming demand for these is **lost**. */
  readonly strandedFromEntrance: readonly ConnectivityGap[];
  /** Populated → populated pairs with no route. Interfloor demand is **redistributed**. */
  readonly unroutableInterfloor: readonly ConnectivityGap[];
  /** Reachable, but in more than {@link MAX_LEGS_FROM_ENTRANCE} legs from an entrance. */
  readonly longChains: readonly ConnectivityGap[];
}

/**
 * Measure the lift-only connectivity of a resolved building. Pure; no diagnostics, no opinions.
 *
 * Exported so a caller that wants the *facts* — a building editor drawing which floors are
 * cut off, `buildingConnectivity.test.ts` asserting the shipped data — does not have to parse
 * them back out of a warning message.
 */
export function measureConnectivity(building: ConnectivitySource): BuildingConnectivity {
  const topology = connectivityTopologyOf(building);
  // One index for every search, rather than one per origin: this is the only caller that runs
  // the search in a loop, so it is the only one where the sharing is worth the extra argument.
  const servesIndex = servesIndexOf(topology);
  const targets = populatedFloorIds(building);
  const entrances = building.entranceFloors.map((floor) => floor.id);
  const origins = [...new Set([...entrances, ...targets])];
  const isEntrance = new Set(entrances);

  const strandedFromEntrance: ConnectivityGap[] = [];
  const unroutableInterfloor: ConnectivityGap[] = [];
  const longChains: ConnectivityGap[] = [];
  let pairsConsidered = 0;
  let pairsRoutable = 0;

  for (const origin of origins) {
    const legs = legCountsFrom(topology, origin, servesIndex);
    for (const destination of targets) {
      if (destination === origin) continue;
      pairsConsidered += 1;
      const count = legs.get(destination);
      if (count === undefined) {
        const gap: ConnectivityGap = {
          originFloorId: origin,
          destinationFloorId: destination,
          legs: undefined,
        };
        if (isEntrance.has(origin)) strandedFromEntrance.push(gap);
        else unroutableInterfloor.push(gap);
        continue;
      }
      pairsRoutable += 1;
      if (isEntrance.has(origin) && count > MAX_LEGS_FROM_ENTRANCE) {
        longChains.push({
          originFloorId: origin,
          destinationFloorId: destination,
          legs: count,
        });
      }
    }
  }

  return {
    pairsConsidered,
    pairsRoutable,
    strandedFromEntrance,
    unroutableInterfloor,
    longChains,
  };
}

/** `"G" -> "28", "G" -> "29", … and 74 more`. */
function formatGaps(gaps: readonly ConnectivityGap[]): string {
  const named = gaps
    .slice(0, EXAMPLES)
    .map((gap) =>
      gap.legs === undefined
        ? `"${gap.originFloorId}" -> "${gap.destinationFloorId}"`
        : `"${gap.originFloorId}" -> "${gap.destinationFloorId}" (${gap.legs} legs)`,
    )
    .join(', ');
  const more = gaps.length > EXAMPLES ? `, and ${gaps.length - EXAMPLES} more` : '';
  return `${named}${more}`;
}

/** The distinct destination floors named by a set of gaps, in first-seen order. */
function destinationsOf(gaps: readonly ConnectivityGap[]): string[] {
  return [...new Set(gaps.map((gap) => gap.destinationFloorId))];
}

export interface ConnectivityDiagnosticsOptions {
  /** File name used in diagnostics. */
  readonly file?: string | undefined;
  /** Building id, for the message. */
  readonly buildingId?: string | undefined;
}

/**
 * Turn {@link measureConnectivity} into loader diagnostics.
 *
 * One error and three warnings, and the split between them is the one this module's header
 * argues: a building missing a connection is suspicious and runnable, a building missing every
 * connection is unusable.
 *
 * Called by `resolveBuilding`, so it runs for `loadConfig` **and** for every hand-built object
 * the editor, the fixtures and the fuzzers hand to the public entry point.
 */
export function connectivityDiagnostics(
  building: ConnectivitySource,
  options: ConnectivityDiagnosticsOptions = {},
): { readonly issues: readonly ConfigIssue[]; readonly warnings: readonly ConfigWarning[] } {
  const file = options.file ?? '<building config>';
  const id = options.buildingId ?? '<building>';
  const issues: ConfigIssue[] = [];
  const warnings: ConfigWarning[] = [];

  // A building with no populated floor, or no banks, has nothing to say here: the population
  // and empty-bank diagnostics own those cases and stacking a third would bury them.
  const measured = measureConnectivity(building);
  if (measured.pairsConsidered === 0) return { issues, warnings };

  if (measured.pairsRoutable === 0) {
    issues.push({
      file,
      path: 'banks',
      message: `no journey in building "${id}" is servable by its lifts: all ${measured.pairsConsidered} origin-destination pairs the demand generator would draw over are unroutable. A run would create no legs at all and every figure it reported would describe an empty building. Check that some bank serves an entrance and a populated floor, and that any floor where a journey must change banks is flagged "isTransferFloor".`,
      code: ISSUE_CODES.disconnectedBuilding,
    });
    // The three warnings below would restate the same fact 1 406 times. The error is the verdict.
    return { issues, warnings };
  }

  if (measured.strandedFromEntrance.length > 0) {
    const floors = destinationsOf(measured.strandedFromEntrance);
    warnings.push({
      file,
      path: 'banks',
      message: `${floors.length} populated floor${floors.length === 1 ? '' : 's'} of building "${id}" cannot be reached from an entrance by any chain of banks (${formatGaps(measured.strandedFromEntrance)}). Incoming demand for such a floor has no surviving share to fall back on, so it is dropped and the building's total arrival rate runs below what its traffic profiles specify — quietly, at run time. Either a bank must serve both ends, or an intermediate floor served by both must be flagged "isTransferFloor".`,
      code: WARNING_CODES.unreachableFromEntrance,
    });
  }

  if (measured.unroutableInterfloor.length > 0) {
    const floors = destinationsOf(measured.unroutableInterfloor);
    warnings.push({
      file,
      path: 'banks',
      message: `${measured.unroutableInterfloor.length} of ${measured.pairsConsidered} origin-destination pairs in building "${id}" are unroutable between populated floors, covering ${floors.length} destination${floors.length === 1 ? '' : 's'} (${formatGaps(measured.unroutableInterfloor)}). Outgoing and interfloor demand for them is redistributed at run time, so the building's total arrival rate survives and its directional split does not — the run stays plausible and stops describing the building as authored.`,
      code: WARNING_CODES.unroutableInterfloor,
    });
  }

  if (measured.longChains.length > 0) {
    warnings.push({
      file,
      path: 'banks',
      message: `${measured.longChains.length} journey${measured.longChains.length === 1 ? '' : 's'} from an entrance of building "${id}" need more than ${MAX_LEGS_FROM_ENTRANCE} lift legs (${formatGaps(measured.longChains)}). Three legs cover a double-deck supertall — position, shuttle, local — so more than three usually means a zone is anchored to a lobby level the entrance cannot reach directly. That is a layout problem rather than a long trip, and past traffic.maxLegs the demand is dropped outright.`,
      code: WARNING_CODES.excessiveTransferChain,
    });
  }

  return { issues, warnings };
}
