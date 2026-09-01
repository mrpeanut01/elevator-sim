/**
 * **What a player earns survives the tab, driven through a real reload** — GitHub issue #224,
 * [`DECISIONS.md`](../../../../DECISIONS.md) § D433.
 *
 * ## Why this file exists rather than another case in `profile.test.ts`
 *
 * Persistence is exactly where a vacuous test hides. A node case that writes a value and reads it
 * back proves **serialisation**, and serialisation is not survival: it passes identically against a
 * store held in a module-scope `Map`, which is precisely the defect this issue was opened about.
 * The claim is *close the tab, come back, and the buildings you fixed are still fixed*, and the only
 * way to make that claim is to load the page, do the thing, **reload**, and look again.
 *
 * `everyday/profile.test.ts` keeps what this file cannot, and the split is drawn by what a page can
 * be made to hold rather than by convenience. A corrupt store and a version-1 envelope are both a
 * string in `localStorage`, so both are driven here **and** there. The **oversized** store is only
 * there: crossing `PROGRESS_BUDGET_CHARACTERS` needs about fifty stored ratings, and seeding them
 * through `page.evaluate` would mean transcribing the budget constant into this file — a copied
 * number that goes stale the moment the constant moves, which is the defect this repository counts.
 * So the write-refusal path is asserted where the constant lives, exactly, and its ordering (refuse
 * **before** the store is touched) is mutation-validated there; what is asserted on the page is the
 * read-refusal path a player can actually arrive at with a browser somebody else's build wrote to.
 *
 * ## Which artifact, and why it is the built one
 *
 * `startShippedSite` — `dist-web/`, the bundle a player receives (§ D425, GitHub issue #281). This
 * file is **not** in `DEV_SERVER_FILES` and must not become one: it drives no module by URL, and
 * everything it asserts happens through the page's own `localStorage`, which is the same object in
 * both artifacts. A dev-server run would be a claim about a build nobody receives, for no gain.
 *
 * ## What is deliberately not asserted, and where the positive control comes from
 *
 * **Not what the run measured.** § D220 § 4 and `fixitScreen.browser.test.ts`'s own rule: whether a
 * repair clears a case's three pass conditions is the engine's answer, and asserting it here would
 * make this file fail when a shipped building changed. So the journey case asserts *the state the
 * product produced survived the reload*, in both directions against the slot.
 *
 * That leaves one thing to say honestly about vacuity, in two halves.
 *
 * - **The write half cannot go vacuous.** `keepSolved` runs on every press that finishes a run,
 *   whatever the verdict, so `schemaVersion: 2` is in the slot either way — measured by removing
 *   the call, which reddens this case.
 * - **The read half would, if the run solved nothing**, because two empty badge sets compare equal.
 *   Measured on this host 2026-09-01: the shipped catalogue's diagnosed free repair solves exactly
 *   **one** case, so the comparison is over a non-empty set today. That is a fact about `data/` and
 *   not a property, which is why it is recorded here rather than asserted — an assertion would be
 *   this tier claiming what a run measured, and it would fail the day a building was retuned.
 *
 * The standing positive control is therefore the second case, which seeds the slot the way a
 * **previous sitting** left it — using a case id read from the product's own catalogue rather than
 * written here — and requires the badge, the count and the landing case to come back. Between the
 * two, neither *the write happened* nor *the read happened* can pass while the other is broken.
 */

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  // A port of its own, `strictPort: false` — files in one project run concurrently.
  site = await startShippedSite({ preview: { port: 5217, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  // Browser first, then site — `browserTierSite.test-helper.ts#startShippedSite` records why.
  await browser?.close();
  await site?.close();
});

/** The one slot, spelled here as a player's browser holds it. `everyday/profile.ts` owns it. */
const SLOT = 'elevator-sim.everyday-profile';

/** A cold load, waited out to the point where the Engineer menu has been dismissed. */
async function coldLoad(page: Page): Promise<void> {
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
}

/** The same wait, after a reload rather than a navigation. */
async function reload(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
}

/**
 * Enter § 10's screen the way a player does — the fourth mode tile — and wait for the case file.
 *
 * Through the tile rather than by calling `go`, which is `fixitScreen.browser.test.ts`'s own
 * argument: the tile is only enabled because `screens.ts` registered the module, so a registry that
 * regressed fails here, at the click.
 */
async function openFixit(page: Page): Promise<void> {
  await page.locator('.everyday-mode[data-screen="fixit"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('.everyday-fixit-case').length > 0,
    undefined,
    { timeout: 60_000 },
  );
}

/** What the case rail says, as a player reads it. Row order is the case file's and is stable. */
interface RailState {
  readonly count: string;
  readonly tags: readonly string[];
  readonly notice: string | null;
  /** The case the screen opened on — the prototype's *start at the first unsolved* rule. */
  readonly landedOn: string | null;
}

async function railState(page: Page): Promise<RailState> {
  return page.evaluate(() => ({
    count: document.querySelector('.everyday-fixit-count')?.textContent ?? '',
    tags: [...document.querySelectorAll('.everyday-fixit-tag')].map((n) => n.textContent ?? ''),
    notice: document.querySelector('.everyday-fixit-progress-notice')?.textContent ?? null,
    landedOn:
      document.querySelector('.everyday-fixit-case[aria-current="true"]')?.textContent ?? null,
  }));
}

/** What is actually in the player's browser, parsed. `null` where nothing or unreadable. */
async function slotContents(page: Page): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return 'unparseable';
    }
  }, SLOT);
}

/** The catalogue's own ids, through the product's own data door rather than written down here. */
async function shippedCaseIds(page: Page): Promise<readonly string[]> {
  return page.evaluate(async () => {
    const response = await fetch('/fixit-cases.json');
    const parsed = (await response.json()) as { cases?: readonly { id?: string }[] };
    return (parsed.cases ?? []).map((entry) => entry.id ?? '');
  });
}

/** The index of the first repair row that is free and pressable — the case's diagnosed fix. */
async function freeRepairIndex(page: Page): Promise<number> {
  const index = await page.evaluate(() =>
    [...document.querySelectorAll('.everyday-fixit-repair')].findIndex((row) => {
      if (row instanceof HTMLButtonElement && row.disabled) return false;
      return /^free/.test(row.querySelector('.everyday-fixit-price')?.textContent ?? '');
    }),
  );
  expect(index, 'no free repair on this case').toBeGreaterThanOrEqual(0);
  return index;
}

describe.skipIf(!HAS_BROWSER)('what a player earns survives a reload — issue #224', () => {
  it('solves a building, reloads the page, and finds the same badges still there', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page);
      await openFixit(page);

      const before = await railState(page);
      expect(before.count).toMatch(/^\d+\/\d+ fixed$/);
      // Nothing has been kept, so nothing is owed — the silent state is correct exactly here.
      expect(before.notice).toBeNull();

      await page.locator('.everyday-fixit-repair').nth(await freeRepairIndex(page)).click();
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-fixit-outcome', { timeout: 120_000 });

      const ran = await railState(page);
      const stored = (await slotContents(page)) as {
        schemaVersion?: number;
        progress?: { solvedCaseIds?: readonly string[] };
      } | null;

      /*
       * The write happened, in the shape this build writes — and it agrees with the screen. Both
       * directions, because that is what makes the reload assertion below mean something: a store
       * holding ids the rail does not badge, or a rail badging cases the store does not hold, is a
       * seam that will restore the wrong afternoon.
       */
      expect(stored?.schemaVersion).toBe(2);
      const kept = stored?.progress?.solvedCaseIds ?? [];
      expect(kept.length).toBe(ran.tags.filter((tag) => tag === 'FIXED').length);

      await reload(page);
      await openFixit(page);
      const after = await railState(page);

      /*
       * The claim. Not *the case was solved* — that is what the run measured and this tier does not
       * assert it (§ D220 § 4) — but *whatever the product answered, a reload did not take it
       * away*. The case below is the positive control that stops this being a comparison of two
       * empty sets.
       */
      expect(after.count).toBe(ran.count);
      expect(after.tags).toEqual(ran.tags);
      expect(after.notice).toBeNull();
      expect(
        ((await slotContents(page)) as { progress?: { solvedCaseIds?: readonly string[] } } | null)
          ?.progress?.solvedCaseIds,
      ).toEqual(kept);
    } finally {
      await page.close();
    }
  });

  it('comes back to a building a previous sitting fixed, badged and skipped over', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page);
      const ids = await shippedCaseIds(page);
      expect(ids.length, 'the catalogue shipped no cases, so this control is vacuous').toBeGreaterThan(1);
      const solvedId = ids[0] ?? '';

      /*
       * What a previous sitting left behind, written in the version this build writes and with a
       * case id taken from the product's own catalogue — never a literal here, which is how this
       * case survives a catalogue edit rather than pinning one.
       */
      await page.evaluate(
        ([key, id]) => {
          window.localStorage.setItem(
            key ?? '',
            JSON.stringify({
              schemaVersion: 2,
              profile: { name: 'Nadia R.', avatarColor: '#4F8A5B' },
              progress: { solvedCaseIds: [id], ratings: [] },
            }),
          );
        },
        [SLOT, solvedId] as const,
      );

      await reload(page);
      await openFixit(page);
      const rail = await railState(page);

      // One building is fixed, and it is the first row — the count and the badge agree.
      expect(rail.count).toBe(`1/${String(rail.tags.length)} fixed`);
      expect(rail.tags[0]).toBe('FIXED');
      expect(rail.tags.filter((tag) => tag === 'FIXED')).toHaveLength(1);
      expect(rail.notice).toBeNull();

      /*
       * And the screen behaves as though the afternoon happened: the prototype's menu-entry rule is
       * *start at the first unsolved case*, so a restored badge has to move where the player lands.
       * A restore that painted the badge and left the selection on the solved case would look right
       * and be a screen that had not really restored anything.
       */
      expect(rail.landedOn).not.toBeNull();
      const landedIsSolved = await page.evaluate(
        () =>
          [...document.querySelectorAll('.everyday-fixit-case')].findIndex(
            (row) => row.getAttribute('aria-current') === 'true',
          ) === 0,
      );
      expect(landedIsSolved, 'the screen opened on the case a previous sitting had fixed').toBe(
        false,
      );

      // The profile the same envelope carries came back with it — one slot, two payloads.
      expect(
        await page.evaluate(
          () => document.querySelector('.everyday-identity')?.textContent ?? '',
        ),
      ).toContain('Nadia R.');
    } finally {
      await page.close();
    }
  });

  it('degrades a corrupt store to a labelled refusal rather than a silent empty state', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page);
      await page.evaluate((key) => {
        window.localStorage.setItem(key, '{ this is not the envelope');
      }, SLOT);

      await reload(page);
      await openFixit(page);
      const rail = await railState(page);

      /*
       * The acceptance criterion, on the page. An empty rail is exactly what a player who has done
       * nothing sees, so *nothing is badged* is not evidence of anything on its own — the sentence
       * beside it is what tells a player their afternoon is in there and this build cannot read it.
       */
      expect(rail.count).toBe(`0/${String(rail.tags.length)} fixed`);
      expect(rail.notice).not.toBeNull();
      expect(rail.notice ?? '').toContain('not readable text');
      // Never a placeholder, and never an identifier: § 13 and § 19's rule about what a player reads.
      expect(rail.notice ?? '').not.toContain('undefined');
      expect(rail.notice ?? '').not.toContain(SLOT);

      // A refusal is evidence: the bytes are still there for a build that can read them.
      expect(await slotContents(page)).toBe('unparseable');
    } finally {
      await page.close();
    }
  });

  it('puts a rating a previous sitting earned back on the ladder, rebuilt from its cases', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page);
      /*
       * **The forty are not run here, and that is `boardScreen.browser.test.ts`'s own rule**: § 1.4
       * puts one simulation at 181 ms to 1 521 ms and forty of them is minutes, which is not what a
       * page test is for. What this case drives is the whole restore chain on the shipped bundle —
       * bytes, `loadProgress`, `savedRatingIssue`, `ladderEntryOf`, `ladderRowsOf`, the table — and
       * the one thing it therefore does **not** cover is `boardScreen.ts#onFinished`'s single call
       * to `savedRatingOf`, which `everyday/profile.test.ts` and `gauntlet/ladder.test.ts` drive
       * directly. That limitation is stated rather than implied.
       *
       * The rating is written as its **cases**, which is § D434: nothing folded is stored, so the
       * `62.5%` the table draws below has to be arithmetic this page performed on the two scores
       * seeded here rather than a number copied out of storage.
       */
      await page.evaluate((key) => {
        const caseOf = (index: number, score: number): unknown => ({
          caseId: `tower-${String(index)}/crowd`,
          buildingId: `tower-${String(index)}`,
          crowdId: 'crowd',
          seed: `seed-${String(index)}`,
          score,
          noScoreReason: null,
        });
        window.localStorage.setItem(
          key,
          JSON.stringify({
            schemaVersion: 2,
            profile: { name: 'you', avatarColor: '#F2A63B' },
            progress: {
              solvedCaseIds: [],
              ratings: [
                {
                  dispatcherId: 'a-dispatcher-of-mine',
                  dispatcherName: 'A dispatcher of mine',
                  isReference: false,
                  fingerprint: 'waitTime=1',
                  casesTotal: 2,
                  cases: [caseOf(0, 50), caseOf(1, 75)],
                },
              ],
            },
          }),
        );
      }, SLOT);

      await reload(page);
      await page.click('button:has-text("Boards & ladder")');
      await page.waitForSelector('.everyday-board-tab-ladder', { timeout: 30_000 });

      const ladder = await page.evaluate(() => ({
        rows: [...document.querySelectorAll('.everyday-ladder-row')].map(
          (row) => row.textContent ?? '',
        ),
        empty: document.querySelector('.everyday-ladder-empty')?.textContent ?? null,
        notice: document.querySelector('.everyday-ladder-progress-notice')?.textContent ?? null,
      }));

      // The empty state is gone, which is the half a restore that drew nothing would fail.
      expect(ladder.empty).toBeNull();
      expect(ladder.notice).toBeNull();
      expect(ladder.rows).toHaveLength(1);
      expect(ladder.rows[0]).toContain('A dispatcher of mine');
      // `(50 + 75) / 2`, computed here from the stored cases — § D434's whole point.
      expect(ladder.rows[0]).toContain('62.5%');
      expect(ladder.rows[0]).toContain('2 of 2');
    } finally {
      await page.close();
    }
  });

  it('reads a store the previous build wrote, and does not call that a refusal', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    try {
      await coldLoad(page);
      /*
       * The migration, on the page a player loads. A version-1 envelope is what every build before
       * issue #224 wrote: a name and a picture, and no third key. It has to keep the name — the
       * whole cost of the migration to somebody who had one is nothing — and it must **not** draw
       * a refusal, because that build kept no progress and telling this player theirs could not be
       * read would be a false statement about a version that had none.
       */
      await page.evaluate((key) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            schemaVersion: 1,
            profile: { name: 'Nadia R.', avatarColor: '#4F8A5B' },
          }),
        );
      }, SLOT);

      await reload(page);
      expect(
        await page.evaluate(
          () => document.querySelector('.everyday-identity')?.textContent ?? '',
        ),
      ).toContain('Nadia R.');

      await openFixit(page);
      const rail = await railState(page);
      expect(rail.notice).toBeNull();
      expect(rail.count).toBe(`0/${String(rail.tags.length)} fixed`);

      /*
       * And the next write carries the migrated profile into the version-2 envelope. This is the
       * half a migration usually gets wrong: reading the old shape is not the same as keeping what
       * it held, and the write that stores the first solved building is the one that could lose the
       * name.
       */
      await page.locator('.everyday-fixit-repair').nth(await freeRepairIndex(page)).click();
      await page.locator('.everyday-bar-primary').click();
      await page.waitForSelector('.everyday-fixit-outcome', { timeout: 120_000 });

      expect(await slotContents(page)).toMatchObject({
        schemaVersion: 2,
        profile: { name: 'Nadia R.', avatarColor: '#4F8A5B' },
      });
    } finally {
      await page.close();
    }
  });
});
