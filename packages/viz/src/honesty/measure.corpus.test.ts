/**
 * The deriver for the corpus figures `CLAUDE.md`'s Phase 9 row publishes in prose.
 *
 * [`RISKS.md`](../../../../RISKS.md) **R38** names this hole in its own mitigation — *"published
 * study intervals already have a guard that re-derives them; **prose counts do not**"* — and
 * `CLAUDE.md` has now recorded the same lesson **five times** about the same row. The figures went
 * stale twice before anybody looked; the surfaces column was wrong by one in both tiers for a whole
 * wave; and three lanes in one wave each measured on a different base and reported three different
 * pairs, every one correct where it was taken and none correct after integration.
 *
 * ## Why this is not `honesty.test.ts`
 *
 * `honesty.test.ts` already runs the campaign and already computes every figure. It prints them
 * with `console.log`, which **vitest 4 intercepts**, so on this toolchain the numbers a publisher
 * needs cannot be read off a run's stdout at all. That is the whole reason the measurement kept
 * being skipped: the instrument existed and its output did not reach anyone. This writes to a file
 * instead of a stream, so the figure survives the reporter.
 *
 * It also dumps the **surface set**, not only the surface count. Wave B found the surfaces column
 * had been wrong by one in both tiers *before* that wave, and it was caught only by probing the
 * surface sets at base and head and diffing them rather than by trusting the counts. That probe was
 * built ad hoc and thrown away; this is it, kept.
 *
 * ## It asserts nothing, and that is deliberate
 *
 * A gate here would be a pin, and [`RISKS.md`](../../../../RISKS.md) R38's own remedy is a ratchet
 * or a derivation, never a pin — an exact pin on a string count goes red on every commit that adds
 * a word, which trains people to edit the number rather than read it. `honesty.test.ts` holds the
 * assertions (`failures`, the alive-search shapes, the tier gap). This holds the arithmetic.
 *
 * ## Skipped unless asked for
 *
 * Gated on `CORPUS_OUT` so the default suite neither runs it nor pays for it, and neither tier buys
 * a gate. **Measured on this container rather than inherited from the handoff:** the always-on tier
 * is ~2 min and the deep tier **~23**, not the ~7 an earlier note claimed — that figure came from a
 * 10-core Mac and was carried forward without being re-taken. Budget accordingly, and see the
 * timeout note at the foot of the `it`. Run it **once, after integration, never per branch**
 * ([§ D343](../../../../DECISIONS.md)):
 *
 * ```
 * CORPUS_OUT=/tmp/always-on.txt npx vitest run packages/viz/src/honesty/measure.corpus.test.ts
 * CORPUS_TIER=deep CORPUS_OUT=/tmp/deep.txt ELEVATOR_SIM_HONESTY=deep \
 *   npx vitest run packages/viz/src/honesty/measure.corpus.test.ts
 * ```
 *
 * Then publish the pair with the tree they were measured on beside them, which is the half of R38
 * a deriver cannot do for you.
 */
import { beforeAll, describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';

import {
  DEEP_SPACE,
  deepSeeds,
  formatHonestyStats,
  runHonestyCampaign,
  STANDARD_CORPUS,
  type HonestyResources,
} from './index.js';
import { loadHonestyResources } from './resources.test-helper.js';

const out = process.env['CORPUS_OUT'];
const deep = process.env['CORPUS_TIER'] === 'deep';

let resources: HonestyResources;

describe.skipIf(out === undefined)('the corpus figures, derived rather than transcribed', () => {
  beforeAll(async () => {
    ({ resources } = await loadHonestyResources());
  }, 900_000);

  it('measures the tier and writes the figures where a reporter cannot swallow them', () => {
    const seeds = deep ? deepSeeds(60) : STANDARD_CORPUS;
    const started = Date.now();
    const result = runHonestyCampaign({
      resources,
      seeds,
      shrinkBudget: 40,
      ...(deep ? { space: DEEP_SPACE } : {}),
    });
    const elapsedMs = Date.now() - started;

    /*
     * The surface *set* is written out in full, sorted. The count alone is what went stale for a
     * whole wave, and a count cannot tell you whether a move is a new screen or a correction —
     * only a diff of the two sets can, which is what wave B had to reconstruct by hand.
     */
    const surfaces = Object.keys(result.stats.surfaces).sort();
    const body = [
      `tier            ${deep ? 'deep' : 'always-on'}`,
      formatHonestyStats(result.stats),
      `surface count   ${String(surfaces.length)}`,
      `failing cases   ${String(result.failures.length)}`,
      `wall clock      ${String(elapsedMs)} ms`,
      '',
      'SURFACE SET:',
      ...surfaces.map((id) => `  ${id}`),
      '',
      'FAILING CASES:',
      ...result.failures.map(
        (failure) =>
          `  ${failure.original.case.caseId}: ` +
          failure.original.violations
            .map((violation) => `${violation.property}@${violation.surfaceId}`)
            .join(', '),
      ),
      '',
    ].join('\n');

    writeFileSync(out ?? '', body, 'utf8');
    /*
     * **An hour, because 15 minutes was not enough and the failure was silent-ish.** The deep tier
     * took **1 385 s** here against a 900 s deadline, and vitest reported the test *failed* while
     * the figures it wrote were complete and correct — `runHonestyCampaign` is synchronous, so
     * there is nothing for a timeout to interrupt: the campaign runs to the end, `writeFileSync`
     * lands, and only then is the deadline noticed. A reader who trusted the exit code would have
     * thrown away a good measurement; one who trusted the file without checking `cases` would have
     * been right by luck. The file states `cases n (n evaluated, 0 skipped)` and its own wall clock
     * for exactly that reason — they are what distinguishes a complete run from a truncated one.
     */
  }, 3_600_000);
});
