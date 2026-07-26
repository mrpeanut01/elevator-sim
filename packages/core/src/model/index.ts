/**
 * `core/model` — the runtime objects that wrap the static config.
 *
 * The config layer produces a validated, resolved *description* of a building. This module
 * produces the thing the simulation actually runs against: floors with queues and lit
 * buttons, banks that answer service-zoning questions in O(1), passengers whose journeys
 * survive a sky-lobby transfer.
 *
 * ```ts
 * const loaded = await loadConfig('data');
 * const building = createBuilding(loaded.buildingsById.get('mixed-use-high-rise')!);
 * const factory = new PassengerFactory({
 *   streams,                                   // one StreamSet per replication
 *   massConfig: loaded.trafficProfiles.passengerMass,
 *   topology: building,
 * });
 * ```
 *
 * Three things this module deliberately does **not** do:
 *
 * - **No wall clock.** Every timestamp is a kernel `SimTime` in simulated seconds.
 * - **No RNG of its own.** The one stochastic quantity here — passenger mass — is drawn from
 *   the injected `StreamSet`'s `passengerMass` stream.
 * - **No operational zoning.** Service zoning (physical) and access zoning (credential) are
 *   building facts and live here as two separate methods; dynamic floor partitioning among
 *   cars is a dispatcher strategy and belongs to `dispatch/`.
 *
 * `model/car/` — the car entity, its kinematics, doors and pure `estimateCost()` — is a
 * sibling barrel rather than a re-export from here, so importing the building model does
 * not drag in `physics/`. The package barrel (`src/index.ts`) exports both.
 */

export {
  DECK_POSITIONS,
  DIRECTIONS,
  ModelError,
  SERVICE_MODES,
  acceptsCarCalls,
  acceptsHallCalls,
  directionBetween,
  hallCallId,
  oppositeDirection,
} from './types.js';

export type {
  CarCall,
  CredentialGroup,
  DeckPosition,
  Direction,
  FloorPair,
  FloorTopology,
  HallCall,
  ServiceMode,
} from './types.js';

export {
  Passenger,
  PassengerFactory,
  SUPPORTED_MASS_DISTRIBUTIONS,
  drawPassengerMass,
} from './passenger.js';

export type {
  ArrivalRequest,
  NextLegInit,
  PassengerFactoryOptions,
  PassengerInit,
  TransferRequest,
} from './passenger.js';

export { Floor } from './floor.js';

export { Bank } from './bank.js';

export type { BankInit, CarLike, DeckAssignment } from './bank.js';

export { Building, createBuilding } from './building.js';

export type { BuildingOptions, CarCreationContext, CreateBuildingOptions } from './building.js';
