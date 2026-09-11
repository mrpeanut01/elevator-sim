/**
 * A shipped building with duty declared on named cars — GitHub issue #481, `DECISIONS.md` § D549.
 *
 * **No shipped building declares a duty, and that is deliberate rather than an omission.** A
 * declaration moves that building's runs, `data/` is draft-and-approve, and the control that lets a
 * player declare one is step 4 of `data/buildings/README.md` § *Duty*. So every test that needs a
 * building that declares one derives it here from a real building rather than authoring a new one.
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
