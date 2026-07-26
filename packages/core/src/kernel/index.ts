/**
 * `core/kernel` — the discrete-event simulation kernel.
 *
 * The clock jumps event-to-event rather than ticking; execution order is the total order
 * `(time, sequenceNumber)`, so any schedule of events processes identically on every run.
 *
 * Nothing here reads a wall clock. `SimTime` is simulated seconds and originates only from
 * {@link SimKernel}. Neither the kernel nor its tests depend on any ambient environment
 * beyond `lib: ["ES2022"]` — no `node:*` imports, no `import.meta`, no DOM globals — so
 * `core/` type-checks and runs identically under Node and in the browser.
 *
 * ## Superseding scheduled work
 *
 * `schedule()`/`scheduleAfter()` return a {@link ScheduledEvent}, which is also the handle for
 * `kernel.cancel(handle)`. Prefer cancelling over defensive re-checking: when a door
 * obstruction supersedes a committed `door.close`, or a reassignment supersedes a committed
 * arrival, cancel the stale event rather than letting it fire and having its handler decide it
 * is irrelevant. Cancelled slots keep their `(time, sequence)` position, so cancellation never
 * perturbs the order of surviving events; they are excluded from `eventCount()` and never
 * consume the `maxEventsPerRun` budget.
 */

export { EventQueue, compareScheduledEvents } from './eventQueue.js';
export { SimKernel } from './kernel.js';
export type { SimKernelOptions } from './kernel.js';
export { createEvent } from './types.js';
export type {
  EventContext,
  EventHandler,
  EventScheduler,
  ScheduledEvent,
  SimEvent,
  SimTime,
} from './types.js';
