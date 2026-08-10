/**
 * opcheck — operational-health harness for the elevator simulator.
 *
 * Not a performance harness. It asks one question of a (building × dispatcher × traffic ×
 * template) cell: **does the lift group actually operate?** Cars move, banks serve, floors get
 * visited, riders eventually board, transfers complete, escalators carry, decks pair, and nothing
 * throws. A saturated run is NOT a finding here — a building can be over its capacity and still be
 * operating correctly. A car parked at the lobby while its own bank's riders stand for the whole
 * run IS a finding, saturated or not.
 *
 * Usage:
 *   node opcheck.mjs --cells cells.json --out results.ndjson
 *   node opcheck.mjs --building X --dispatcher Y [--traffic Z] [--template T] [--seed N] [--pretty]
 *
 * Severity:
 *   error  — the group is not operating: a stuck car, an unserved bank, a lost rider, a throw.
 *   warn   — suspicious, needs a human look, may be legitimate given the configuration.
 *   info   — measured facts worth recording (saturation, abandonment, refusals).
 */

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadConfig, runSimulation } from '@elevator-sim/core';

const DATA_DIR = process.env['ELEVATOR_SIM_DATA'] ?? fileURLToPath(new URL('../../data', import.meta.url));

/* ------------------------------------------------------------------ *
 * Thresholds — every one of them is a judgement, so every one is named.
 * ------------------------------------------------------------------ */
export const T = {
  /** A car that travelled less than this over a whole run never really moved. */
  deadCarDistanceM: 1.0,
  /** Riders standing, summed over the building, that makes an idle car indefensible. */
  stackedQueuePersons: 5,
  /** Seconds a car may sit still while that queue persists before it is "stuck". */
  stackedIdleS: 180,
  /** A served leg waiting longer than this is a starvation smell (not proof). */
  longWaitS: 600,
  /** Share of a bank's own riders it may leave entirely unserved. */
  bankUnservedShare: 1.0,
};

/* ------------------------------------------------------------------ */

let CONFIG = null;
export async function config() {
  if (CONFIG === null) CONFIG = await loadConfig(DATA_DIR);
  return CONFIG;
}

const finding = (severity, code, message, detail) => ({ severity, code, message, ...(detail ? { detail } : {}) });

/**
 * Which bank could have served a leg, derived from the building rather than from the run.
 * A leg is servable by a bank when the bank serves both its origin and its destination.
 */
function banksServing(building, originId, destinationId) {
  const out = [];
  for (const bank of building.banks) {
    const serves = new Set(bank.servesFloors);
    if (serves.has(originId) && serves.has(destinationId)) out.push(bank.id);
  }
  return out;
}

/**
 * Run one cell and check it.
 * @returns {{cell, ok, status, findings, facts}}
 */
export async function checkCell(cell) {
  const cfg = await config();
  const {
    building: buildingId,
    dispatcher: dispatcherId,
    traffic: trafficId,
    template = 'rise-and-fall',
    seed = 20260810,
    durationS,
    demand,
    patience,
    serviceEvents,
    doorObstructionProbability,
    label,
  } = cell;

  const building = cfg.buildingsById.get(buildingId);
  const dispatcherProfile = cfg.dispatcherProfilesById.get(dispatcherId);
  if (!building) return { cell, ok: false, status: 'no-building', findings: [finding('error', 'unknown-building', `no building "${buildingId}"`)], facts: {} };
  if (!dispatcherProfile) return { cell, ok: false, status: 'no-dispatcher', findings: [finding('error', 'unknown-dispatcher', `no dispatcher "${dispatcherId}"`)], facts: {} };

  // --traffic override: replace the building's declared profile id.
  let effectiveBuilding = building;
  if (trafficId && trafficId !== building.trafficProfile) {
    if (!cfg.trafficProfilesById.has(trafficId)) {
      return { cell, ok: false, status: 'no-traffic', findings: [finding('error', 'unknown-traffic', `no traffic profile "${trafficId}"`)], facts: {} };
    }
    effectiveBuilding = { ...building, trafficProfile: trafficId };
  }

  // Service events live on the *building*, not on SimulationConfig — a schedule handed to
  // runSimulation() would be silently ignored, so it is attached here instead. `withdraw: N`
  // is sugar: take the first N cars of the first bank out of service mid-run and give them back.
  if (serviceEvents !== undefined) {
    const schedule = Array.isArray(serviceEvents)
      ? serviceEvents
      : (() => {
          const bank = effectiveBuilding.banks[0];
          const take = bank.cars.slice(0, serviceEvents.withdraw ?? 1);
          return take.flatMap((car) => [
            { atS: serviceEvents.atS ?? 300, bankId: bank.id, carId: car.id, mode: serviceEvents.mode ?? 'out-of-service' },
            ...(serviceEvents.restoreAtS === undefined ? [] : [{ atS: serviceEvents.restoreAtS, bankId: bank.id, carId: car.id, mode: 'in-service' }]),
          ]);
        })();
    effectiveBuilding = { ...effectiveBuilding, serviceEvents: schedule };
  }

  const findings = [];
  let result;
  const startedWall = Date.now();
  try {
    result = runSimulation({
      building: effectiveBuilding,
      dispatcherProfile,
      trafficProfiles: cfg.trafficProfiles,
      dispatcherProfiles: cfg.dispatcherProfiles,
      elevatorSpecs: cfg.elevatorSpecs,
      seed,
      demandTemplate: template,
      ...(durationS === undefined ? {} : { durationS }),
      ...(demand === undefined ? {} : { demand }),
      ...(patience === undefined ? {} : { patience }),
      ...(doorObstructionProbability === undefined ? {} : { doorObstructionProbability }),
      // A run that cannot drain by the deadline throws by default. That is right for a
      // benchmark and wrong for a survey: it collapses "the simulator broke" into "this
      // configuration is over capacity", and the second is a legitimate thing for a player to
      // build. `report` keeps the result so the two can be told apart, and the timeout itself
      // is raised as its own finding below.
      onTimeout: 'report',
    });
  } catch (error) {
    return {
      cell, ok: false, status: 'threw',
      findings: [finding('error', 'threw', `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`, {
        stack: String(error?.stack ?? '').split('\n').slice(0, 12).join('\n'),
        issues: error?.issues,
      })],
      facts: { wallMs: Date.now() - startedWall },
    };
  }
  const wallMs = Date.now() - startedWall;

  const { record, conservation: cons, summary, stageActivity: sa, undelivered } = result;
  const legs = record.passengers ?? [];
  const travel = record.travelSamples ?? [];
  const loads = record.loadSamples ?? [];
  const queues = record.queueSamples ?? [];
  const carIds = record.carIds ?? [];

  /* ---- 0. did anything happen at all ---- */
  if (cons.legsCreated === 0) {
    findings.push(finding('error', 'no-demand', 'the trace generated no lift legs at all — nothing was exercised'));
  }

  /* ---- 1. termination ---- */
  if (result.status !== 'completed') {
    findings.push(finding('warn', `status-${result.status}`,
      `run ended "${result.status}" at ${result.endedAt.toFixed(1)} s (deadline ${result.deadlineS.toFixed(1)} s) with ${cons.undelivered} journeys still in the system — this throws SimulationError unless the caller passes onTimeout:'report'`,
      { undelivered: cons.undelivered, events: result.events }));
  }

  /* ---- 2. conservation: the books ---- */
  const booked = cons.delivered + cons.undelivered + (cons.abandoned ?? 0) + (cons.accessRefused ?? 0);
  if (booked !== cons.generated) {
    findings.push(finding('error', 'conservation-imbalance',
      `generated ${cons.generated} != delivered ${cons.delivered} + undelivered ${cons.undelivered} + abandoned ${cons.abandoned ?? 0} + refused ${cons.accessRefused ?? 0} = ${booked}`));
  }
  if (cons.wrongCarBoardings > 0) {
    findings.push(finding('error', 'wrong-car-boarding', `${cons.wrongCarBoardings} passengers boarded a car the panel did not name them`));
  }
  // brokenPromises is expressly a *result*, not a failure (§ D29): a passenger bumped from the
  // car they were promised keeps the assignment and waits for it, and that cost is what the
  // destination arm exists to quantify. So it is a fact — except when it is so large per assigned
  // leg that the panel is effectively promising cars it never delivers, which a player will read
  // as a stuck lift.
  if (cons.legsAssigned > 0 && cons.brokenPromises / cons.legsAssigned > 1.0) {
    findings.push(finding('warn', 'promise-churn',
      `${cons.brokenPromises} broken promises over ${cons.legsAssigned} assigned legs (${(cons.brokenPromises / cons.legsAssigned).toFixed(2)} per leg) — riders are being passed by the car they were named repeatedly`));
  }
  if (cons.legsAlighted > cons.legsBoarded) {
    findings.push(finding('error', 'alighted-exceeds-boarded', `${cons.legsAlighted} alighted but only ${cons.legsBoarded} boarded`));
  }

  /* ---- 3. fleet liveness: cars that never moved ---- */
  const distanceByCar = new Map(carIds.map((id) => [id, 0]));
  const lastMoveByCar = new Map(carIds.map((id) => [id, record.startedAt]));
  const movesByCar = new Map(carIds.map((id) => [id, 0]));
  for (const s of travel) {
    distanceByCar.set(s.carId, (distanceByCar.get(s.carId) ?? 0) + s.distanceM);
    movesByCar.set(s.carId, (movesByCar.get(s.carId) ?? 0) + 1);
    if (s.at > (lastMoveByCar.get(s.carId) ?? 0)) lastMoveByCar.set(s.carId, s.at);
  }
  const boardedLegs = legs.filter((l) => l.boardedAt !== undefined);
  const carriedByCar = new Map(carIds.map((id) => [id, 0]));
  for (const l of boardedLegs) if (l.carId) carriedByCar.set(l.carId, (carriedByCar.get(l.carId) ?? 0) + 1);

  // The car id in the RECORD is bank-qualified — `Simulation` builds it as `${bankId}-${spec.id}`
  // — while `bank.cars[].id` is bank-local ("A", "S1"). Keying this map on the bare id resolved
  // 0 of 79 cars across all 8 buildings and silently disabled seven checks: `dead-car`,
  // `car-carried-nobody`, `stuck-car-with-queue` and all four double-deck codes could not fire at
  // all. Their zero counts across the first sweep were not evidence of anything.
  const bankOfCar = new Map();
  const carSpecById = new Map();
  for (const bank of building.banks) {
    for (const car of bank.cars) {
      bankOfCar.set(`${bank.id}-${car.id}`, bank.id);
      carSpecById.set(`${bank.id}-${car.id}`, car);
    }
  }
  const unresolvedCars = carIds.filter((id) => !bankOfCar.has(id));
  if (unresolvedCars.length > 0) {
    findings.push(finding('error', 'car-id-unresolved',
      `${unresolvedCars.length} of ${carIds.length} recorded car ids match no car in the resolved building — every per-car check below is blind for them: ${unresolvedCars.slice(0, 6).join(', ')}`));
  }

  // Demand a bank actually saw, from the trace rather than from the dispatcher.
  const legsOfferedToBank = new Map(building.banks.map((b) => [b.id, 0]));
  for (const l of legs) {
    for (const bankId of banksServing(building, l.originFloorId, l.destinationFloorId)) {
      legsOfferedToBank.set(bankId, (legsOfferedToBank.get(bankId) ?? 0) + 1);
    }
  }

  const deadCars = [];
  const idleCars = [];
  for (const carId of carIds) {
    const bankId = bankOfCar.get(carId);
    const bankHadWork = (legsOfferedToBank.get(bankId) ?? 0) > 0;
    const dist = distanceByCar.get(carId) ?? 0;
    const carried = carriedByCar.get(carId) ?? 0;
    if (dist < T.deadCarDistanceM && bankHadWork) deadCars.push({ carId, bankId, distanceM: dist, carried, offeredToBank: legsOfferedToBank.get(bankId) });
    else if (carried === 0 && bankHadWork) idleCars.push({ carId, bankId, distanceM: dist, moves: movesByCar.get(carId) ?? 0, offeredToBank: legsOfferedToBank.get(bankId) });
  }
  if (deadCars.length > 0) {
    findings.push(finding('error', 'dead-car',
      `${deadCars.length} of ${carIds.length} cars never moved while their bank had riders to serve: ${deadCars.map((c) => c.carId).join(', ')}`,
      { cars: deadCars }));
  }
  if (idleCars.length > 0) {
    findings.push(finding('warn', 'car-carried-nobody',
      `${idleCars.length} of ${carIds.length} cars moved but carried nobody: ${idleCars.map((c) => c.carId).join(', ')}`,
      { cars: idleCars }));
  }

  /* ---- 4. bank liveness ---- */
  const servedByBank = new Map(building.banks.map((b) => [b.id, 0]));
  for (const l of boardedLegs) if (l.bankId) servedByBank.set(l.bankId, (servedByBank.get(l.bankId) ?? 0) + 1);
  const deadBanks = [];
  for (const bank of building.banks) {
    const offered = legsOfferedToBank.get(bank.id) ?? 0;
    const served = servedByBank.get(bank.id) ?? 0;
    if (offered > 0 && served === 0) deadBanks.push({ bankId: bank.id, cars: bank.cars.length, offered });
  }
  if (deadBanks.length > 0) {
    findings.push(finding('error', 'dead-bank',
      `${deadBanks.length} bank(s) served nobody although riders were routable through them: ${deadBanks.map((b) => `${b.bankId} (${b.cars} cars, ${b.offered} legs offered)`).join('; ')}`,
      { banks: deadBanks }));
  }

  /* ---- 5. floor liveness ---- */
  const arrivedAtFloor = new Map();
  const boardedAtFloor = new Map();
  const alightedAtFloor = new Map();
  for (const l of legs) {
    // A rider who walked away or was turned away at the reader was not *failed by the lifts*.
    // Counting them here made every patience run report a floor as unserved on the strength of
    // two riders who left of their own accord.
    if (l.abandonedAt === undefined && l.refusedAt === undefined) {
      arrivedAtFloor.set(l.originFloorId, (arrivedAtFloor.get(l.originFloorId) ?? 0) + 1);
    }
    if (l.boardedAt !== undefined) {
      boardedAtFloor.set(l.originFloorId, (boardedAtFloor.get(l.originFloorId) ?? 0) + 1);
      if (l.alightedAt !== undefined) alightedAtFloor.set(l.destinationFloorId, (alightedAtFloor.get(l.destinationFloorId) ?? 0) + 1);
    }
  }
  const neverBoardedFloors = [];
  for (const [floorId, arrived] of arrivedAtFloor) {
    const boarded = boardedAtFloor.get(floorId) ?? 0;
    if (boarded === 0) neverBoardedFloors.push({ floorId, arrived });
  }
  if (neverBoardedFloors.length > 0) {
    const total = neverBoardedFloors.reduce((a, f) => a + f.arrived, 0);
    findings.push(finding('error', 'floor-never-served',
      `${neverBoardedFloors.length} floor(s) had riders arrive and nobody ever boarded there (${total} legs): ${neverBoardedFloors.slice(0, 12).map((f) => `${f.floorId}×${f.arrived}`).join(', ')}`,
      { floors: neverBoardedFloors }));
  }

  // Same filter as the origin side above, and it was missing here for one wave: a rider refused at
  // the reader or gone home is not a floor the lifts failed to reach. Unfiltered, this raised 468
  // warnings of which 454 were riders who were turned away three floors from where they started.
  const destinationFloors = new Set(
    legs.filter((l) => l.abandonedAt === undefined && l.refusedAt === undefined).map((l) => l.destinationFloorId),
  );
  const neverAlighted = [...destinationFloors].filter((f) => (alightedAtFloor.get(f) ?? 0) === 0);
  if (neverAlighted.length > 0) {
    findings.push(finding('warn', 'floor-never-reached',
      `${neverAlighted.length} floor(s) were a destination and nobody ever alighted there: ${neverAlighted.slice(0, 12).join(', ')}`,
      { floors: neverAlighted }));
  }

  /* ---- 5b. demand the generator could not place ----
   * The check above cannot see an unreachable floor, and that is structural rather than a
   * threshold: the trace generator never emits a leg for a destination the route planner cannot
   * route — it drops the demand and says so in a warning. So the floor has no legs, is absent
   * from every set derived from legs, and a check built on legs is silent by construction. Three
   * injected unreachability faults (a floor removed from every bank, a shuttle orphaned from its
   * zone, a transfer floor stripped of `isTransferFloor`) all went undetected until this was
   * added. The evidence was in `result.warnings` the whole time.
   */
  const REACHABILITY_WARNINGS = /cannot be reached|origin-destination pairs dropped|can place none of its|dropped because/i;
  const unroutable = (result.warnings ?? []).filter((w) => REACHABILITY_WARNINGS.test(w));
  if (unroutable.length > 0) {
    findings.push(finding('error', 'demand-dropped-unroutable',
      `the trace generator dropped demand it could not route — ${unroutable.length} warning(s): ${unroutable[0]}`,
      { warnings: unroutable.slice(0, 8) }));
  }

  /* ---- 6. the stacked-lobby check ----
   * A car that completes no move through a stretch in which its own bank's landing queue never
   * drops below the threshold. This is the check that maps to the stated worry, so its two
   * earlier defects are worth naming rather than quietly fixing:
   *
   * 1. It took `min(waiting)` over the whole gap between two consecutive travel samples. The
   *    gap's LEFT edge is the instant the car stopped being busy and its RIGHT edge is often
   *    `endedAt` — both moments when the queue is low by construction — so one sub-threshold
   *    sample at either end suppressed the finding. Ten injected parked-car faults: it caught
   *    three. The stretch has to be found INSIDE the gap, not measured across it.
   * 2. It read the per-bank queue from `QueueSample.byFloorId`, which no non-test caller ever
   *    populates (`Simulation` calls `sampleQueue(time, count)` with two arguments), so the
   *    per-bank branch was dead and every car was charged with the whole building's queue.
   *
   * Both are fixed by not using `queueSamples` at all: the per-bank queue is reconstructed from
   * the leg records, which carry exact arrival, boarding, abandonment and refusal times. That
   * also removes the drain-tail blind spot — queue samples stop at the demand horizon, and the
   * interesting idling often happens after it.
   */
  const GRID_S = 10;
  const gridEnd = result.endedAt;
  const grid = [];
  for (let t = record.startedAt; t <= gridEnd; t += GRID_S) grid.push(t);

  /**
   * Riders this bank could actually carry, standing at each grid point, from the legs.
   *
   * Both ends, not just the origin. Filtering on the origin alone charges a `zone-1-local` car
   * with the riders standing in the shared ground lobby bound for floor 51 — a trip its shaft
   * cannot make. Measured over the sweep, that inflated 1 000 of 2 077 car findings, by a median
   * of 9 riders and a maximum of 5 457, and 43.5 % of them fell below the threshold outright once
   * the destination was required.
   */
  function waitingSeriesFor(bank) {
    const serves = new Set(bank.servesFloors);
    const mine = legs.filter((l) => serves.has(l.originFloorId) && serves.has(l.destinationFloorId));
    const series = new Array(grid.length).fill(0);
    for (const l of mine) {
      const leaves = l.boardedAt ?? l.abandonedAt ?? l.refusedAt ?? gridEnd;
      for (let i = 0; i < grid.length; i += 1) {
        if (grid[i] >= l.arrivedAt && grid[i] < leaves) series[i] += 1;
      }
    }
    return series;
  }

  // A car the run deliberately took out of service is not stuck — it is parked on purpose, and
  // counting it here turned every failure-mode cell into a finding. Withdrawn cars are excluded
  // from the moment they leave service; a car that is restored becomes eligible again.
  // Intervals, not a single "withdrawn from" instant: a `withdraw-restore` schedule emits
  // [out@300, in@900], and treating the restore as a deletion made the car count as in-service for
  // the whole run — including the 600 s it was parked in a cupboard. That turned every
  // withdraw-restore cell into a false positive whose reported idle window was, exactly, the
  // withdrawal window.
  const outOfServiceWindows = new Map();
  const schedule = [...(effectiveBuilding.serviceEvents ?? [])].sort((a, b) => a.atS - b.atS);
  for (const ev of schedule) {
    const id = `${ev.bankId}-${ev.carId}`;
    if (!outOfServiceWindows.has(id)) outOfServiceWindows.set(id, []);
    const windows = outOfServiceWindows.get(id);
    const open = windows.length > 0 && windows[windows.length - 1].to === Infinity;
    if (ev.mode === 'in-service') { if (open) windows[windows.length - 1].to = ev.atS; }
    else if (!open) windows.push({ from: ev.atS, to: Infinity });
  }
  for (const bank of building.banks) {
    for (const car of bank.cars) {
      if (car.mode !== undefined && car.mode !== 'in-service') {
        const id = `${bank.id}-${car.id}`;
        if (!outOfServiceWindows.has(id)) outOfServiceWindows.set(id, [{ from: record.startedAt, to: Infinity }]);
      }
    }
  }
  const inServiceAt = (carId, t) => {
    const windows = outOfServiceWindows.get(carId);
    if (windows === undefined) return true;
    return !windows.some((w) => t >= w.from && t < w.to);
  };

  const stacked = [];
  const waitingByBank = new Map();
  for (const bank of building.banks) waitingByBank.set(bank.id, waitingSeriesFor(bank));

  for (const carId of carIds) {
    const bankId = bankOfCar.get(carId);
    if (bankId === undefined) continue;
    const series = waitingByBank.get(bankId);
    const stamps = new Set();
    for (const s of travel) if (s.carId === carId) stamps.add(Math.floor((s.at - record.startedAt) / GRID_S));

    // Longest contiguous stretch with no completed move AND a persistently loaded bank queue.
    let best = null;
    let runStart = null;
    let runMin = Infinity;
    for (let i = 0; i < grid.length; i += 1) {
      const busy = stamps.has(i);
      const inService = inServiceAt(carId, grid[i]);
      const loaded = series[i] >= T.stackedQueuePersons;
      if (!busy && loaded && inService) {
        if (runStart === null) { runStart = i; runMin = series[i]; }
        else runMin = Math.min(runMin, series[i]);
      } else {
        if (runStart !== null) {
          const idleS = (i - runStart) * GRID_S;
          if (idleS >= T.stackedIdleS && (best === null || idleS > best.idleS)) {
            best = { carId, bankId, fromS: grid[runStart], toS: grid[i - 1], idleS, minWaitingOnBankFloors: runMin };
          }
        }
        runStart = null; runMin = Infinity;
      }
    }
    if (runStart !== null) {
      const idleS = (grid.length - runStart) * GRID_S;
      if (idleS >= T.stackedIdleS && (best === null || idleS > best.idleS)) {
        best = { carId, bankId, fromS: grid[runStart], toS: grid[grid.length - 1], idleS, minWaitingOnBankFloors: runMin };
      }
    }
    if (best) stacked.push({ ...best, carriedAllRun: carriedByCar.get(carId) ?? 0, distanceAllRunM: Math.round(distanceByCar.get(carId) ?? 0) });
  }
  if (stacked.length > 0) {
    stacked.sort((a, b) => b.idleS - a.idleS);
    findings.push(finding('error', 'stuck-car-with-queue',
      `${stacked.length} car(s) sat motionless for ≥${T.stackedIdleS} s while ≥${T.stackedQueuePersons} riders waited on their own bank's floors throughout — worst: ${stacked[0].carId} idle ${stacked[0].idleS.toFixed(0)} s with ≥${stacked[0].minWaitingOnBankFloors} waiting`,
      { cars: stacked.slice(0, 10) }));
  }

  /* ---- 7. starvation / stranding ---- */
  const waits = boardedLegs.map((l) => l.boardedAt - l.arrivedAt);
  const maxWait = waits.length ? Math.max(...waits) : 0;
  const strandedWaiting = undelivered.filter((u) => u.reason === 'waiting');
  const strandedRiding = undelivered.filter((u) => u.reason === 'riding');
  const strandedTransferring = undelivered.filter((u) => u.reason === 'transferring');
  if (result.status === 'completed' && strandedWaiting.length > 0) {
    findings.push(finding('error', 'stranded-on-completed-run',
      `${strandedWaiting.length} rider(s) were still standing at a landing on a run that reported "completed"`,
      { sample: strandedWaiting.slice(0, 5) }));
  }
  if (strandedRiding.length > 0) {
    findings.push(finding('warn', 'stranded-in-car',
      `${strandedRiding.length} rider(s) were still inside a car when the run stopped`,
      { sample: strandedRiding.slice(0, 5) }));
  }
  if (maxWait > T.longWaitS) {
    findings.push(finding('warn', 'very-long-wait',
      `longest served wait ${maxWait.toFixed(1)} s`, { legs: boardedLegs.filter((l) => l.boardedAt - l.arrivedAt > T.longWaitS).length }));
  }

  /* ---- 8. transfers, escalators, decks ---- */
  const hasTransferFloors = building.transferFloors.length > 0;
  const multiLeg = legs.some((l) => l.legIndex > 0) || cons.transfers > 0;
  if (hasTransferFloors && building.banks.length > 1 && cons.transfers === 0) {
    findings.push(finding('warn', 'no-transfers',
      `building declares ${building.transferFloors.length} transfer floor(s) and ${building.banks.length} banks, but no journey transferred`));
  }
  if (building.transportModes.length > 0 && cons.transportHops === 0 && (cons.stairsJourneys ?? 0) === 0) {
    findings.push(finding('warn', 'no-transport-hops',
      `building declares ${building.transportModes.length} non-lift transport mode(s) (escalator/stairs) and none was used`,
      { modes: building.transportModes.map((m) => m.id ?? m.kind) }));
  }
  const doubleDeckCars = carIds.filter((id) => carSpecById.get(id)?.doubleDeck === true);
  if (doubleDeckCars.length > 0) {
    const stops = sa.doubleDeckStops ?? 0;
    const paired = sa.doubleDeckPairedStops ?? 0;
    const [lower, upper] = sa.doubleDeckBoardings ?? [0, 0];
    if (stops === 0) {
      findings.push(finding('error', 'double-deck-idle',
        `${doubleDeckCars.length} double-deck car(s) and not one deck stop was recorded`, { stageActivity: sa }));
    } else if (paired === 0) {
      findings.push(finding('warn', 'double-deck-never-paired',
        `${stops} deck stops and none of them opened both decks — the second deck is dead weight`, { stageActivity: sa }));
    } else if (upper === 0 || lower === 0) {
      findings.push(finding('error', 'double-deck-one-sided',
        `deck boardings are lower=${lower} upper=${upper} — one deck carried nobody all run`, { stageActivity: sa }));
    }
    // A *partial* pairing collapse was invisible: the chain above only asks whether pairing is
    // zero, so 137 paired stops out of 472 raised nothing. On a bank whose `servesFloorPairs`
    // covers every floor it serves, pairing is 100 % by geometry — so anything below it is a
    // defect, and 99 % would have been silent.
    //
    // Honest caveat: this is an INVARIANT GUARD, not an externally falsifiable check. Every
    // injection that lowers the pairing ratio does so by un-pairing floors, which also trips the
    // geometry precondition below and is caught by `double-deck-one-sided` first. It fires only if
    // the model fails to pair a stop it should have — which is exactly the regression it exists to
    // catch, and which nothing outside the model can manufacture. Measured silent on all 13
    // dispatchers on `vertical-city`, the only shipped double-deck building.
    for (const bank of building.banks) {
      const pairs = bank.servesFloorPairs ?? [];
      if (pairs.length === 0) continue;
      const pairedFloors = new Set(pairs.flat());
      if (!bank.servesFloors.every((f) => pairedFloors.has(f))) continue; // geometry does not demand it
      if (stops > 0 && paired < stops) {
        findings.push(finding('error', 'double-deck-pairing-incomplete',
          `bank "${bank.id}" pairs every floor it serves, so every deck stop must open both decks — ${paired} of ${stops} did`,
          { stageActivity: sa }));
        break;
      }
    }
    // `deckMismatchLegs` counts legs the model REFUSED (`#deckAllows`), not legs that boarded the
    // wrong deck — a wrong-deck boarding is a conservation failure and would have thrown. The
    // message said "boarded" for one wave and would have misled whoever read it.
    if ((sa.deckMismatchLegs ?? 0) > 0) {
      findings.push(finding('error', 'deck-mismatch',
        `${sa.deckMismatchLegs} leg(s) were refused because the deck that stopped does not serve their floor`,
        { stageActivity: sa }));
    }
  }

  /* ---- 9. access control ---- */
  if (building.accessZones.length > 0) {
    const refused = cons.accessRefused ?? 0;
    if (refused >= cons.generated && cons.generated > 0) {
      findings.push(finding('error', 'everyone-refused', `all ${refused} journeys were turned away for want of a credential`));
    }
  }

  /* ---- 10. facts (never findings) ---- */
  const facts = {
    wallMs,
    status: result.status,
    endedAtS: result.endedAt,
    demandEndedAtS: result.demandEndedAt,
    events: result.events,
    cars: carIds.length,
    banks: building.banks.length,
    generated: cons.generated,
    delivered: cons.delivered,
    undelivered: cons.undelivered,
    legsCreated: cons.legsCreated,
    legsBoarded: cons.legsBoarded,
    legsAlighted: cons.legsAlighted,
    legsAssigned: cons.legsAssigned,
    brokenPromises: cons.brokenPromises,
    promisesRevoked: cons.promisesRevoked,
    wrongCarBoardings: cons.wrongCarBoardings,
    transfers: cons.transfers,
    transportHops: cons.transportHops,
    stairsJourneys: cons.stairsJourneys ?? null,
    accessRefused: cons.accessRefused ?? null,
    abandoned: cons.abandoned ?? null,
    saturated: summary.saturation?.saturated ?? null,
    awtIsValid: summary.awtIsValid,
    awtInvalidGround: summary.awtInvalidGround ?? null,
    meanWaitS: summary.awtIsValid ? summary.waiting.meanS : null,
    maxServedWaitS: maxWait,
    strandedWaiting: strandedWaiting.length,
    strandedRiding: strandedRiding.length,
    strandedTransferring: strandedTransferring.length,
    totalTravelM: [...distanceByCar.values()].reduce((a, b) => a + b, 0),
    perCarDistanceM: Object.fromEntries(distanceByCar),
    perCarCarried: Object.fromEntries(carriedByCar),
    perBankServed: Object.fromEntries(servedByBank),
    perBankOffered: Object.fromEntries(legsOfferedToBank),
    multiLeg,
    stageActivity: sa,
    warnings: result.warnings,
  };

  const ok = !findings.some((f) => f.severity === 'error');
  return { cell: { ...cell, label: label ?? `${buildingId}/${dispatcherId}/${trafficId ?? building.trafficProfile}/${template}` }, ok, status: result.status, findings, facts };
}

/* ------------------------------------------------------------------ *
 * driver
 * ------------------------------------------------------------------ */

function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const a = parseArgv(process.argv.slice(2));
  const cells = a.cells
    ? JSON.parse(readFileSync(a.cells, 'utf8'))
    : [{
        building: a.building, dispatcher: a.dispatcher,
        ...(a.traffic ? { traffic: a.traffic } : {}),
        ...(a.template ? { template: a.template } : {}),
        ...(a.seed ? { seed: Number(a.seed) } : {}),
      }];
  if (a.out) writeFileSync(a.out, '');
  let errors = 0;
  for (const cell of cells) {
    const r = await checkCell(cell);
    if (!r.ok) errors += 1;
    const line = JSON.stringify(r);
    if (a.out) appendFileSync(a.out, line + '\n');
    if (a.pretty || !a.out) {
      const mark = r.ok ? '✓' : '✗';
      process.stdout.write(`${mark} ${r.cell.label ?? ''} — ${r.status}\n`);
      for (const f of r.findings) process.stdout.write(`    [${f.severity}] ${f.code}: ${f.message}\n`);
      if (a.pretty === true && cells.length === 1) process.stdout.write(JSON.stringify(r.facts, null, 2) + '\n');
    } else {
      process.stderr.write(`${r.ok ? '.' : 'F'}`);
    }
  }
  if (!a.pretty && a.out) process.stderr.write('\n');
  process.exit(errors > 0 ? 1 : 0);
}
