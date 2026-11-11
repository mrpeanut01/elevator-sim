/**
 * Escalator queues: the carrying capacity of a transport mode, as a run sees it — § D1631.
 *
 * ## What existed, and what this adds
 *
 * An escalator has been an edge with a fixed time and unlimited throughput: a hop took
 * `traversalTimeS` and any number of riders could start one at the same instant. That is still
 * exactly what an escalator declaring no `capacityPersonsPerHour` is, and {@link join} returns
 * `undefined` for it so that every caller keeps the arithmetic it had — which is what makes a
 * building with no declared capacity replay bit-identically.
 *
 * With a capacity, each **direction** of the mode has a first-come, first-served queue at its
 * boarding landing. The server is deterministic: riders step on one at a time,
 * `3600 / capacityPersonsPerHour` seconds apart, and then ride for `traversalTimeS`.
 *
 * ## Why there is no queue object and no boarding event
 *
 * Because nobody leaves this queue. With a deterministic server, first-come-first-served order
 * and no reneging, a rider's turn is fixed at the instant they join: it is the later of *now* and
 * the end of the previous rider's slot. So the whole queue is one number per direction —
 * {@link Belt.nextFreeAt} — and joining is one `max` and one addition. That is the same discrete
 * queue a list and a per-boarding event would produce, computed without either, and it adds no
 * event whose position among simultaneous events could matter.
 *
 * Riders join in the order the kernel fires the events that bring them — `(time, sequence)`,
 * invariant 4 — and within one batch in trace order. Nothing here draws a random number
 * (invariant 2: a new stream would shift every downstream draw and desynchronise common random
 * numbers against every stored run) or reads a clock (invariant 3).
 *
 * ## The limits of the model, each one chosen and each one tested
 *
 * - **A mode is a pair of belts**, one up and one down, each at the full declared rate. A single
 *   reversible belt is not modelled; see `TransportModeConfig.capacityPersonsPerHour`.
 * - **The route does not change.** `traffic/route.ts` plans a journey over an escalator because
 *   the geometry connects the floors, before the run starts and without a cost comparison. A
 *   saturated escalator therefore does **not** divert riders to a lift that serves both landings:
 *   the queue grows and is reported. A real crowd would spill, so past saturation this
 *   over-states the escalator's queue and under-states the lifts' load.
 * - **Nobody gives up.** `sim.patience` is armed when a leg starts waiting at a *lift* landing. A
 *   rider at the foot of an escalator has no leg yet, so they never abandon.
 * - **Only lift journeys load it.** A journey whose whole route is the escalator is refused by the
 *   trace generator as `no-lift-leg` — it is not lift demand — so it is never generated and
 *   never stands in this queue. A lobby escalator's real crowd includes those riders; this
 *   model's does not, so a queue here is a floor on the real one rather than an estimate of it.
 * - **Slots are evenly spaced.** One rider per headway, not two abreast on alternate steps. Over
 *   any interval the count boarded differs from a paired-step pattern's by at most one rider.
 */

import type { ResolvedBuilding } from '../config/types.js';
import type { SimTime } from '../kernel/types.js';
import type { TransportQueueRecord } from '../metrics/transportQueue.js';
import type { Direction } from '../model/index.js';
import type { TraceTransportHop } from '../traffic/types.js';

/** One direction of one capacity-bearing escalator. */
interface Belt {
  readonly header: Omit<TransportQueueRecord, 'boardings'>;
  /** Seconds between successive riders stepping on. */
  readonly headwayS: number;
  /** The earliest instant the next rider may step on. `0` until somebody has. */
  nextFreeAt: SimTime;
}

/** What joining a queue settles: when the rider steps on, and when they step off. */
export interface EscalatorTurn {
  readonly modeId: string;
  readonly direction: Direction;
  /** When the rider reached the landing. */
  readonly enteredAt: SimTime;
  /** When their turn comes. */
  readonly boardedAt: SimTime;
  /** `boardedAt - enteredAt`. Zero when nobody was ahead. */
  readonly waitS: number;
  /** When they reach the far landing: `boardedAt + traversalTimeS`. */
  readonly arrivesAt: SimTime;
}

function beltKey(modeId: string, direction: Direction): string {
  return `${modeId}/${direction}`;
}

/**
 * Every escalator queue of one building, for one run.
 *
 * Mutable — it is the run's state, like a landing's waiting list — and owned by exactly one
 * `Simulation`.
 */
export class EscalatorQueues {
  readonly #belts = new Map<string, Belt>();

  constructor(building: ResolvedBuilding) {
    const floorIndex = new Map(building.floors.map((floor) => [floor.id, floor.index] as const));
    for (const mode of building.transportModes ?? []) {
      const capacity = mode.capacityPersonsPerHour;
      if (capacity === undefined || (mode.kind ?? 'escalator') !== 'escalator') continue;
      const [a, b] = mode.connects;
      const aIsLower = (floorIndex.get(a) ?? 0) <= (floorIndex.get(b) ?? 0);
      const lower = aIsLower ? a : b;
      const upper = aIsLower ? b : a;
      // `up` before `down`, in declared mode order: this is the order of the record's table.
      for (const direction of ['up', 'down'] as const) {
        this.#belts.set(beltKey(mode.id, direction), {
          header: Object.freeze({
            modeId: mode.id,
            direction,
            boardingFloorId: direction === 'up' ? lower : upper,
            capacityPersonsPerHour: capacity,
          }),
          headwayS: 3600 / capacity,
          nextFreeAt: 0,
        });
      }
    }
  }

  /** True when no mode of the building declares a capacity — every shipped building. */
  get isEmpty(): boolean {
    return this.#belts.size === 0;
  }

  /** Every queue's declaration, in the order the record lists them. */
  headers(): readonly Omit<TransportQueueRecord, 'boardings'>[] {
    return [...this.#belts.values()].map((belt) => belt.header);
  }

  /** Whether `hop` is ridden on an escalator that declares a capacity. Pure. */
  governs(hop: TraceTransportHop): boolean {
    return this.#belts.has(beltKey(hop.modeId, directionOf(hop)));
  }

  /**
   * Join the queue for `hop` at `at`, and learn when the rider steps on and off.
   *
   * `undefined` when the mode declares no capacity: the caller then charges `traversalTimeS`
   * from `at`, exactly as it did before this module existed.
   *
   * **Mutates** the queue — the next rider's turn is one headway later — so call it once per
   * rider per hop, at the instant they reach the landing.
   */
  join(hop: TraceTransportHop, at: SimTime): EscalatorTurn | undefined {
    const direction = directionOf(hop);
    const belt = this.#belts.get(beltKey(hop.modeId, direction));
    if (belt === undefined) return undefined;
    const boardedAt = Math.max(at, belt.nextFreeAt);
    belt.nextFreeAt = boardedAt + belt.headwayS;
    return {
      modeId: hop.modeId,
      direction,
      enteredAt: at,
      boardedAt,
      waitS: boardedAt - at,
      arrivesAt: boardedAt + hop.traversalTimeS,
    };
  }
}

/** Which of the pair a hop rides: `up` when it ends on a higher floor than it began. */
function directionOf(hop: TraceTransportHop): Direction {
  return hop.destinationFloorIndex > hop.originFloorIndex ? 'up' : 'down';
}
