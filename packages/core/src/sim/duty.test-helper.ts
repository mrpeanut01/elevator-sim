/**
 * A shipped building with duty declared on named cars — GitHub issue #481, `DECISIONS.md` § D549.
 *
 * **One shipped building declares a duty**: `st-jude-hospital`'s car E is a bed lift, drafted for
 * the owner's approval (GitHub issue #561, `DECISIONS.md` § D1290). A declaration is governed data
 * and the control that lets a player declare one is still unbuilt (`data/buildings/README.md`
 * § *Duty*), so a test that needs a duty anywhere else derives it here from a real building rather
 * than authoring a new one, and {@link withoutDuty} gives back the undeclared form of one that does.
 *
 * Cars are named the way a run's legs name them — `${bankId}-${carId}`, which is what
 * `Simulation` gives a `Car` and `PassengerRecord.carId` carries — so a test can price a leg against
 * the car that served it without a second lookup.
 */
import type { Duty, ResolvedBuilding } from '../config/types.js';

export function withDuty(
  building: ResolvedBuilding,
  duties: Readonly<Record<string, Duty>>,
): ResolvedBuilding {
  const unclaimed = new Set(Object.keys(duties));
  const banks = building.banks.map((bank) => ({
    ...bank,
    cars: bank.cars.map((car) => {
      const runCarId = `${bank.id}-${car.id}`;
      const duty = duties[runCarId];
      if (duty === undefined) return car;
      unclaimed.delete(runCarId);
      return { ...car, duty };
    }),
  }));
  if (unclaimed.size > 0) {
    throw new Error(
      `${building.id} has no car ${[...unclaimed].join(', ')}; name a car as <bankId>-<carId>.`,
    );
  }
  return { ...building, banks };
}

/** The same building with every car's duty removed: the form it had before any car declared one. */
export function withoutDuty(building: ResolvedBuilding): ResolvedBuilding {
  const banks = building.banks.map((bank) => ({
    ...bank,
    cars: bank.cars.map((car) => {
      if (car.duty === undefined) return car;
      const { duty: _declared, ...rest } = car;
      return rest;
    }),
  }));
  return { ...building, banks };
}
