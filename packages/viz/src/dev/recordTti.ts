/**
 * Measures `charter S9` B1 on the built bundle and appends one record to the run-history store —
 * GitHub issue #408, [`DECISIONS.md`](../../../../DECISIONS.md) § D618.
 *
 * ## What this is, and what it is not
 *
 * This is the **writer** {@link ttiHistory.ts} and {@link ttiGate.ts} need to be more than a schema
 * nobody produces data for — the honest non-test caller those two modules' exports currently have,
 * following the shape `deadCode.test.ts` already recognises (`scenario/measureScenario`'s driver,
 * `shift/legibilityOf`'s gated sweep): an offline instrument, run by a person or a CI step, rather
 * than something the shipped page calls.
 *
 * **It is not wired into `.github/workflows/ci.yml`, and that is a deliberate, named gap rather
 * than an oversight.** Making a CI job commit a new row back onto `main` on every push is a real
 * mechanism — write permissions, a git identity, and a race with exactly the concurrent-push hazard
 * `CLAUDE.md`'s *"One push per wave"* section already documents for this repository's `main` — and
 * it is not something this change verifies by running it, because there is no CI job here to run it
 * against. Bolting on an unverified auto-commit step would trade one honesty problem (no history)
 * for another (a claimed mechanism nobody watched work). So today this script is **run by hand**,
 * and wiring a CI step that invokes it on `main` pushes is named follow-up work, not silently
 * assumed to exist. Run it locally, from the repository root, against the compiled package —
 * `node --experimental-strip-types` cannot resolve this module's `.js` specifiers back to `.ts`
 * sources the way `vitest`'s transform does, so it needs the real build:
 *
 * ```sh
 * npx tsc -b packages/viz
 * node packages/viz/dist/dev/recordTti.js
 * ```
 *
 * Run once against `cb0a24c` while this change was being tested (2026-09-16, worktree branch, so
 * `branch !== 'main'` and the record does not enter the rolling window): **569.7 ms**, comfortably
 * inside the 3 000 ms budget. Real, not fabricated — and still exactly one point, which is why the
 * store's own `README.md` and this file's header both say the gate is advisory rather than
 * calibrated.
 *
 * ## Why appending and gating are two different actions here
 *
 * This script always appends what it measures — it does not refuse to record a bad run — and only
 * afterwards evaluates and *prints* the gate. Refusing to record a regression would mean the store
 * stops containing the very data point that most needs to be in a rolling window; the gate exists to
 * flag a bad run, not to keep the history blind to it. Whether a *test* run may treat a `'fail'`
 * verdict as a failure is `builtBundle.browser.test.ts`'s decision, not this script's.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium, type Page } from 'playwright-core';

import { evaluateTtiGate } from './ttiGate.js';
import { appendTtiRecord, parseTtiHistory, recordsOnBranch, type TtiRecord } from './ttiHistory.js';
import { CHROMIUM, HAS_BROWSER, SKIP_REASON, startShippedSite } from './browserTierSite.test-helper.js';

/*
 * **This script does not import `browserTier.test-helper.ts`, deliberately.** That module is *the
 * gate* `browserTier.test.ts` polices — every one of its importers must be inside a project the
 * `viz-browser` tier actually runs, and a standalone script invoked by hand or by a future CI step
 * is not one (`browserTier.test.ts`'s own "strays" check is what would catch that, and did, before
 * this file stopped importing it). `browserTierSite.test-helper.ts` — the module that owns
 * {@link CHROMIUM}, {@link HAS_BROWSER} and {@link startShippedSite} — is not the gate that check
 * polices and is shared freely. The one helper this script cannot borrow because of that boundary,
 * `leaveTutorialIfOffered`, is reimplemented below at the four lines it costs.
 */

/**
 * Leaves the first-session tutorial or landing page if the boot path offered one, landing on the
 * main menu — the same race `browserTier.test-helper.ts#leaveTutorialIfOffered` resolves, kept in
 * sync with it by hand rather than by import (see the note above). If that file's selectors move,
 * this one goes stale silently; `builtBundle.browser.test.ts`'s own B1 case imports the real thing
 * and would be the first to notice.
 */
async function leaveTutorialIfOffered(page: Page): Promise<void> {
  await page.waitForSelector('.everyday-tutorial, .everyday-mode[data-screen]', { timeout: 30_000 });
  if ((await page.locator('.everyday-tutorial').count()) === 0) return;
  await page.locator('.everyday-bar-leave').click();
  await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
}

/** `packages/viz`, the Vite root — duplicated from `browserTierSite.test-helper.ts` rather than
 * imported, because that module's own is private and this script does not need its full surface. */
const VIZ_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VITE_CONFIG = fileURLToPath(new URL('../../vite.config.ts', import.meta.url));

/** `packages/viz/perf-history/tti-history.jsonl` — see that directory's README for why here. */
const HISTORY_PATH = fileURLToPath(new URL('../../perf-history/tti-history.jsonl', import.meta.url));

/**
 * Time to interactive per `docs/31-support-matrix.md` § 3's definition: *"the first moment at
 * which the primary action control of the opening screen is present in the document, enabled, and
 * its handler bound."*
 *
 * **What this measures, and the one clause it approximates.** Presence and the enabled state are
 * asserted directly, on the same selector `builtBundle.browser.test.ts` already treats as the
 * opening screen's primary control (`[data-screen="scenario"]`, reached through
 * {@link leaveTutorialIfOffered} exactly as that file reaches it). *"Its handler bound"* is not
 * independently observable from outside the page without instrumenting the boot path itself, which
 * this change does not do — that is a real gap in the definition's third clause, named rather than
 * quietly satisfied by assuming presence implies a bound handler. `waitForSelector`'s default
 * polling means a control could in principle be visible for a strictly earlier instant than a
 * dispatched click would resolve, which would make this measurement a slight underestimate of true
 * interactivity rather than an overestimate — the safer direction for a budget, but still a
 * documented approximation and not `docs/31`'s definition in full.
 */
async function measureTtiMs(origin: string): Promise<number> {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const startedAt = process.hrtime.bigint();
    await page.goto(origin, { waitUntil: 'commit' });
    await page.waitForSelector('.everyday-screen', { timeout: 30_000 });
    await leaveTutorialIfOffered(page);
    await page.waitForSelector('[data-screen="scenario"]:not([disabled])', { timeout: 30_000 });
    const endedAt = process.hrtime.bigint();
    return Number(endedAt - startedAt) / 1_000_000;
  } finally {
    await browser.close();
  }
}

function gitOutput(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd: VIZ_ROOT }).trim();
}

async function main(): Promise<void> {
  if (!HAS_BROWSER) {
    console.error(`${SKIP_REASON} Cannot measure charter S9 B1 without it.`);
    process.exitCode = 1;
    return;
  }

  const commit = process.env.GITHUB_SHA ?? gitOutput(['rev-parse', 'HEAD']);
  const branch = process.env.GITHUB_REF_NAME ?? gitOutput(['rev-parse', '--abbrev-ref', 'HEAD']);
  const ci = process.env.CI === 'true' || process.env.CI === '1';

  const { build } = await import('vite');
  await build({ configFile: VITE_CONFIG, root: VIZ_ROOT, logLevel: 'error' });

  const site = await startShippedSite({ preview: { port: 5_301, strictPort: false } });
  try {
    const ttiMs = await measureTtiMs(site.origin);

    const existingText = existsSync(HISTORY_PATH) ? readFileSync(HISTORY_PATH, 'utf8') : '';
    const priorMainHistory = recordsOnBranch(parseTtiHistory(existingText), 'main').map(
      (record) => record.ttiMs,
    );
    const gate = evaluateTtiGate({
      mainHistoryMs: priorMainHistory,
      currentTtiMs: ttiMs,
      isMainBranch: branch === 'main',
    });

    console.log(
      `charter S9 B1: measured ${ttiMs.toFixed(1)} ms on ${commit} (${branch}). ${gate.reason}`,
    );

    const record: TtiRecord = { commit, branch, timestampMs: Date.now(), ttiMs, ci };
    writeFileSync(HISTORY_PATH, appendTtiRecord(existingText, record));
    console.log(`Appended to ${HISTORY_PATH}.`);

    if (gate.verdict === 'fail') {
      console.error(
        'charter S9 B1: the rolling gate FAILED for this run. This script still exits non-zero ' +
          'below for that — see the header on why a bad run is recorded rather than dropped.',
      );
      process.exitCode = 1;
    }
  } finally {
    await site.close();
  }
}

/* Run only when invoked directly (`node recordTti.ts` / `node --experimental-strip-types
 * recordTti.ts`), never on import — importing this module for a future test or a future CI wiring
 * script must not launch a browser as a side effect. */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
