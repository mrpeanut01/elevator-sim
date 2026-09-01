/**
 * **Which shop tiers move this corpus's runs — the measurement behind `fitOut.ts#HONESTY_KITS`.**
 *
 * ## Why the choice could not be inherited
 *
 * [§ D427](../../../../DECISIONS.md) publishes a table of which of the sixteen § 8.2 tiers move the
 * legs, and it is measured at **`garden-apartments`/3 600 s** — the campaign's own cell, which is
 * what `everyday/host.ts#runCampaignDay` writes. This corpus runs five buildings at **600–900 s** in
 * the always-on tier and 600–1 800 s in the deep one, over seven dispatchers and five demand levels.
 * They are different cells, and the difference is not academic: `scope/probes.test-helper.ts` already
 * records that `doors` L1 — the tier its own probe buys — is **inert** at `garden-apartments`/900 s,
 * *"because two hydraulic cars over fifteen minutes of a residential trickle make too few stops for a
 * second off each of them to change a decision."* A kit chosen off § D427's table would have been a
 * kit measured where this corpus never runs.
 *
 * ## The comparison is the legs, and never a window statistic
 *
 * § D177's rule, `scope/probes.test-helper.ts#legsOf`'s comparison string: passenger, car and
 * boarding instant, in the recording's own order. *A mean can be unchanged for a run that is entirely
 * different, and a mean can move because the window moved.*
 *
 * ## Two tiers are not measured here, and that is a property of this corpus's seams
 *
 * A case is a building, a shipped dispatcher profile and a demand axis of its own. So the two
 * appliers `campaign/fitOut.ts` offers beyond the building and the profile have no writer here:
 *
 * | tier | delta | why it is not drivable at this corpus's seams |
 * |---|---|---|
 * | `control` L1 | `zonesTheTower` | `leversWithKit` writes a `GroupLevers`, which `authoring/dispatcherSpec.ts#profileFromSpec` turns into a profile. A case names a **shipped** profile and builds no spec. |
 * | `tenants` L2 | `arrivalRateFactor` | a case's demand is either an explicit rate or `null` for the building's own profile, and multiplying `null` means resolving a schedule into a constant — a second change to the run beside the one being measured. |
 *
 * `honesty.test.ts` asserts that no shipped kit carries either field, so the exclusion is a refusal
 * pinned by a run rather than by this sentence (§ D227).
 *
 * ## It asserts nothing, for `measure.corpus.test.ts`'s reason
 *
 * A gate here would be a pin on a table that moves whenever `data/buildings/` does, and
 * [`RISKS.md`](../../../../RISKS.md) R38's remedy is a derivation rather than a pin. The assertion
 * that the seeded kits **do** move the legs lives in `honesty.test.ts`, where it runs on every
 * `vitest run`. This holds the survey that chose them.
 *
 * ## Skipped unless asked for
 *
 * ```
 * FITOUT_OUT=/tmp/fit-out-tiers.txt npx vitest run packages/viz/src/honesty/measure.fitOut.test.ts
 * ```
 */
import { beforeAll, describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';

import { freshTower } from '../campaign/career.js';
import { SHOP, type ShopCategoryId } from '../campaign/economy.js';
import { fitOutOf } from '../campaign/fitOut.js';
import { recordRun } from '../record/recordRun.js';

import { fittedBuildingFor, fittedProfileFor } from './fitOut.js';
import { caseFromSeed, recordingConfigFor, STANDARD_CORPUS, STANDARD_SPACE, type HonestyResources } from './index.js';
import { loadHonestyResources } from './resources.test-helper.js';

const out = process.env['FITOUT_OUT'];

let resources: HonestyResources;

/** The legs of a run, as a comparable string — `scope/probes.test-helper.ts#legsOf`'s own shape. */
function legsOf(config: Parameters<typeof recordRun>[0]): string {
  return JSON.stringify(
    recordRun(config, { recordDecisions: false }).recording.legs.map((leg) => [
      leg.passengerId,
      leg.carId ?? '',
      leg.boardedAt ?? -1,
    ]),
  );
}

describe.skipIf(out === undefined)('which shop tiers move this corpus, measured on the legs', () => {
  beforeAll(async () => {
    ({ resources } = await loadHonestyResources());
  }, 900_000);

  it('sweeps every shipped tier over every always-on case', () => {
    const started = Date.now();
    const rows: string[] = [];
    const detail: string[] = [];

    const asBuilt = new Map<number, string>();
    for (const seed of STANDARD_CORPUS) {
      const honestyCase = caseFromSeed(seed, { space: STANDARD_SPACE });
      asBuilt.set(seed, legsOf(recordingConfigFor(honestyCase, resources)));
    }

    for (const category of SHOP) {
      for (const tier of category.tiers) {
        const fit = fitOutOf({
          ...freshTower({
            contractId: 'c1',
            buildingId: 'garden-apartments',
            dispatcherId: 'collective',
            rate: 3,
          }),
          fitted: { [category.id]: tier.level } as Partial<Record<ShopCategoryId, number>>,
        });
        if (fit.arrivalRateFactor !== 1 || fit.zonesTheTower) {
          rows.push(
            `${category.id} L${String(tier.level)}`.padEnd(14) +
              'not drivable at this corpus’s seams — see the module docstring',
          );
          continue;
        }
        let moved = 0;
        const inert: string[] = [];
        for (const seed of STANDARD_CORPUS) {
          const honestyCase = caseFromSeed(seed, { space: STANDARD_SPACE });
          const base = recordingConfigFor(honestyCase, resources);
          const fitted = legsOf({
            ...base,
            building: fittedBuildingFor(base.building, fit, resources.elevatorSpecs),
            dispatcherProfile: fittedProfileFor(base.dispatcherProfile, fit),
          });
          if (fitted === asBuilt.get(seed)) {
            inert.push(
              `${String(seed)}/${honestyCase.buildingId}/${honestyCase.baselineProfileId}/` +
                `${String(honestyCase.durationS)}s/${honestyCase.arrivalRatePctPop5min === null ? 'own' : String(honestyCase.arrivalRatePctPop5min)}`,
            );
          } else moved += 1;
        }
        rows.push(
          `${category.id} L${String(tier.level)}`.padEnd(14) +
            `${String(moved)} of ${String(STANDARD_CORPUS.length)} cases move`,
        );
        if (inert.length > 0) {
          detail.push(`${category.id} L${String(tier.level)} inert on: ${inert.join(' ')}`);
        }
      }
    }

    writeFileSync(
      out ?? '',
      [
        'tier           cases whose legs move (always-on corpus, as built vs fitted)',
        ...rows,
        '',
        'INERT CELLS (seed/building/profile/horizon/demand):',
        ...detail,
        '',
        `wall clock     ${String(Date.now() - started)} ms`,
        '',
      ].join('\n'),
      'utf8',
    );
  }, 3_600_000);
});
