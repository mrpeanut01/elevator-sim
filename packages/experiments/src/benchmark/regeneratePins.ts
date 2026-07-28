/**
 * Regenerate {@link PINNED_ESTIMATES} for `published.ts`, by re-running every study that publishes
 * an interval and reading the full-precision estimate off the result.
 *
 * ```
 * npx tsc -b && node packages/experiments/dist/benchmark/regeneratePins.js > pins.txt
 * ```
 *
 * **This is a tool, not a fix.** T2 § 4.0 states the method it implements and the discipline that
 * goes with it: an old bound is recomputed from the estimate rather than by arithmetic on printed
 * text, and *a re-run that disagrees with the file is a question, not an answer*. Paste the output
 * only after establishing which of the two numbers is right — the previous revision of that
 * document reconstructed four bounds from rounded text and got all four wrong in the last digit.
 *
 * The rendering half is exported rather than inlined so `published.test.ts` can assert that what
 * this emits still covers what the pins hold. A generator whose output nothing checks is the same
 * dead-seam shape the pins exist to catch.
 */

import { runAccessControlStudy } from './accessControl.js';
import { runCapacityReassignmentStudy } from './capacityReassignment.js';
import { runDestinationDisclosureStudy } from './destinationDisclosure.js';
import { runDestinationDispatchStudy } from './destinationDispatchContrast.js';
import { runMixedUseHighRiseStudy } from './mixedUseHighRise.js';
import { auditForecastCausalityInRun } from './predictorLag.js';
import { runPrepositioningStudy } from './prepositioning.js';
import { TAIL_CENSUS_LOADS, runTailStudy } from './tailStudy.js';
import { runBenchmark } from './suite.js';
import { loadResources, withProfiles } from '../validation/harness.js';
import {
  PUBLISHED_STUDY_IDS,
  accessControlFigures,
  benchmarkFigures,
  dispatchContrastFigures,
  capacityFigures,
  causalityFigures,
  disclosureFigures,
  mixedUseFigures,
  prepositioningFigures,
  tailFigures,
  type PinnedEstimate,
  type PublishedStudyId,
} from './published.js';

/** Run every study in the domain, at its shipped defaults, and collect its figures. */
export async function measureAllPublishedFigures(): Promise<
  Readonly<Record<PublishedStudyId, ReadonlyMap<string, PinnedEstimate>>>
> {
  const resources = withProfiles(await loadResources(), []);
  return {
    benchmark: benchmarkFigures(await runBenchmark({ resources })),
    tail: tailFigures(await runTailStudy({ loads: TAIL_CENSUS_LOADS, resources })),
    prepositioning: prepositioningFigures(await runPrepositioningStudy({})),
    'capacity-reassignment': capacityFigures(await runCapacityReassignmentStudy({})),
    'forecast-causality': causalityFigures(await auditForecastCausalityInRun({ replications: 100 })),
    'destination-disclosure': disclosureFigures(await runDestinationDisclosureStudy({})),
    'destination-dispatch': dispatchContrastFigures(await runDestinationDispatchStudy({})),
    'access-control': accessControlFigures(await runAccessControlStudy({})),
    'mixed-use-high-rise': mixedUseFigures(await runMixedUseHighRiseStudy({ resources })),
  };
}

/** A number as TypeScript source that round-trips to the same double. */
function literal(value: number): string {
  if (Number.isNaN(value)) return 'Number.NaN';
  if (value === Number.POSITIVE_INFINITY) return 'Number.POSITIVE_INFINITY';
  if (value === Number.NEGATIVE_INFINITY) return 'Number.NEGATIVE_INFINITY';
  return String(value);
}

/** The `PINNED_ESTIMATES` block, ready to paste into `published.ts`. */
export function renderPinTable(
  measured: Readonly<Record<PublishedStudyId, ReadonlyMap<string, PinnedEstimate>>>,
): string {
  const lines: string[] = [
    'export const PINNED_ESTIMATES: Readonly<',
    '  Record<PublishedStudyId, Readonly<Record<string, PinnedEstimate>>>',
    '> = Object.freeze({',
  ];
  for (const studyId of PUBLISHED_STUDY_IDS) {
    lines.push(`  ${JSON.stringify(studyId)}: Object.freeze({`);
    for (const [key, pin] of [...measured[studyId]].sort(([a], [b]) => (a < b ? -1 : 1))) {
      lines.push(
        `    ${JSON.stringify(key)}: { n: ${literal(pin.n)}, mean: ${literal(pin.mean)}, ` +
          `standardError: ${literal(pin.standardError)}, lower: ${literal(pin.lower)}, ` +
          `upper: ${literal(pin.upper)} },`,
      );
    }
    lines.push('  }),');
  }
  lines.push('});');
  return lines.join('\n');
}

/* c8 ignore start -- the CLI shell; `renderPinTable` is what the suite exercises. */
if (process.argv[1]?.endsWith('regeneratePins.js') === true) {
  const measured = await measureAllPublishedFigures();
  process.stdout.write(`${renderPinTable(measured)}\n`);
}
/* c8 ignore stop */
