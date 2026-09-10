/**
 * **An automated accessibility sweep, over the artifact players load** — GitHub issue **#407**,
 * split from **#239**, against the standard adopted in
 * [`docs/36-accessibility-standard.md`](../../../../docs/36-accessibility-standard.md)
 * ([§ D473](../../../../DECISIONS.md)).
 *
 * Recorded here rather than in `DECISIONS.md`, under [§ D405](../../../../DECISIONS.md): everything
 * this file decides — which rule set, which artifact, which screens, and what happens to a finding —
 * binds this file and the register below it. The one thing it deliberately does **not** decide is
 * the conformance target, which § 1 of `docs/36` reserves for the product owner; § 2 of this
 * docstring is the argument for why running this sweep does not quietly take that decision.
 *
 * ## 1. What was missing, and why breadth is the whole point
 *
 * The accessibility work in this tree is real, hand-written and good: `render/theme.test.ts` computes
 * contrast ratios over the ink ladder, `dev/noteContrast.test.ts` does it for pairings,
 * `dev/keyboard.browser.test.ts` drives the Engineer transport's focus order, `dev/motion.test.ts`
 * holds `prefers-reduced-motion`, and `deadControls.browser.test.ts` asserts `aria-pressed` in both
 * directions. Every one of them is a claim about a place somebody thought to look.
 *
 * What none of them can do is **look everywhere**. `docs/36` § 7 puts the shape of that gap in one
 * sentence — *"No clause is wholly tier 1. Every row that has an instrument has it on one shell, and
 * the shell it has it on is the one a player meets second."* This file is the instrument for the
 * machine-decidable half, on the shell a player meets **first**.
 *
 * ## 2. The standard: WCAG 2.1 Level A and AA, and why that choice takes no decision away
 *
 * `docs/36` § 1 sets out three conformance targets — **A** WCAG 2.2 AA, **B** WCAG 2.1 AA, **C** no
 * external standard — and marks the choice as **needing an owner**, because *"picking one quietly
 * inside an engineering document is how a project acquires a commitment nobody agreed to"*. A test
 * file is an engineering document. So the rule set here is chosen to be **invariant across A and B**:
 *
 * - {@link SWEEP_TAGS} is `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` — axe's tags for every Level A
 *   and AA success criterion in WCAG **2.1**.
 * - WCAG 2.2 differs from 2.1 at A and AA by exactly the six criteria `docs/36` § 1.2 prices, plus
 *   the **removal** of SC 4.1.1 Parsing. It adds; at A and AA it relaxes nothing else.
 * - So this set is a **subset** of Option A's requirements and **equal** to Option B's. A violation
 *   it reports is a violation under either target, and passing it claims neither.
 * - The subset half turns on 4.1.1 being the only relaxation, so it is **asserted rather than
 *   argued**: the first case below requires that no rule the tags select carries `wcag411`. It
 *   holds because axe already retired those two rules to `wcag2a-obsolete` and ships them
 *   disabled — which is a fact about this version of axe, and therefore a thing to check on every
 *   run rather than to read once.
 *
 * Option C is the one this file cannot serve, and refusing to serve it is deliberate. `docs/36`
 * § 1.1 says a home-grown standard *"makes every clause unfalsifiable from outside, since the only
 * authority for them would be the document asserting them"*. A sweep whose rules were written in
 * this repository, tagged with success criteria this repository chose, would be exactly that — so
 * the rules come from a third party with a published mapping to the criteria, and the tag set is
 * read **off axe at run time** rather than transcribed (the first case below).
 *
 * **What this sweep therefore does not claim.** It is not a conformance statement. `docs/36` § 6.1
 * names five of its seventeen clauses — `AX-0`, `AX-2`, `AX-5`, `AX-8`, `AX-10` — as not mechanisable
 * by any general rule set, and § 6.7 keeps *"a screen-reader user can complete a journey"* a tier-3
 * claim until a walkthrough is recorded with its date, its reader and its platform. This file buys
 * the other promise in that section: **the accessibility tree is well formed**.
 *
 * Two named gaps inside even that, so nobody reads a green run as more than it is:
 *
 * 1. **Nothing drawn on a canvas is reached.** `AX-1`'s Everyday half — a `<canvas>` at `60vh` with
 *    no accessible name — is invisible to every rule here, because a rule set can only read the DOM.
 *    It is `docs/36` § 3.3's work and not this file's.
 * 2. **`AX-15`'s landmark clause is not in the gate.** axe classifies `region`, `landmark-one-main`
 *    and `page-has-heading-one` as `best-practice` rather than as a WCAG success criterion, so they
 *    are outside the tag set above. Adding them would mean gating on rules the named standard does
 *    not require, which is a different decision from this one and belongs with `AX-15`.
 * 3. **One viewport.** Every route below runs at 1440 × 900, above
 *    `tokens.ts#EVERYDAY_RAIL_DRAWER_MAX_PX`, so the rail is a column and never the drawer a narrow
 *    page draws. Nothing here is evidence about the narrow layout, and nothing here is evidence
 *    about SC 1.4.10 Reflow, which `docs/36` § 1.3 item 1 already flags as an exclusion any
 *    conformance target would have to name. A second viewport is a second register and was not
 *    taken on; `everyday/viewportGates.browser.test.ts` is where that axis lives today.
 *
 * ## 3. The instrument: axe-core, and the dependency it costs
 *
 * `docs/36` § 6.2 prices two candidates and hands the choice to whoever builds it. This is that
 * choice, with the argument.
 *
 * **`axe-core` 4.13.0, one new root devDependency**, on a toolchain that was four packages plus
 * `vite`. That is a real cost and § 6.2 says so. What it buys is the half the cheaper candidate
 * cannot: a rule set whose mapping to WCAG success criteria is **maintained and published by
 * somebody outside this repository**. The alternative — `locator.ariaSnapshot()`, no new
 * dependency — is priced there as *"a regression instrument and not a conformance one"*, and that is
 * the accurate reading: it pins the role-and-name structure a screen currently has, so it catches a
 * control that silently **loses** its name and says nothing about one that never had one. Every
 * finding below is of the second kind.
 *
 * The package is dev-only, has no runtime dependencies of its own, and never reaches `dist-web/`.
 * It is injected into the page as a script tag ({@link axeSource}) and torn down with the page.
 *
 * ## 4. The artifact: `dist-web/`, not a hand-assembled DOM and not a dev server
 *
 * #407's first acceptance criterion. This file serves the built bundle through
 * `browserTierSite.test-helper.ts#startShippedSite`, like the other twenty-nine files of the tier and
 * for the reason `builtBundle.browser.test.ts` records: the dev server and the shipped bundle are
 * different artifacts, and a defect has already lived in the difference. `browserTier.test.ts`
 * derives the dev-server exception list from the tier's own sources and would fail this file if it
 * acquired one.
 *
 * ## 5. The screens: derived from the registry, never listed
 *
 * {@link ROUTES} holds one route per screen key, and the last case asserts its key set **equals**
 * `screens.ts#EVERYDAY_SCREENS_BUILT` in both directions. A twenty-first screen is therefore a
 * failing case rather than a silent gap, and a screen that leaves the registry is one too — the
 * discipline `screens.ts` already applies to `UNBUILT_REASONS` and `honesty/surfaces.ts` applies to
 * `RUN_CONTEXTS`.
 *
 * Every route is the player's own path: a tile, a rail row, a bar primary. None of them reaches into
 * the shell, and none loads a second entry point. `enterEverydayStage`'s argument, one file over — a
 * tier that reaches a surface by a path no player has is a tier that tests a surface nobody can open.
 *
 * ## 6. What is gated, and what is only reported
 *
 * **Gated: `violations`.** A node axe decided fails a rule in the set.
 *
 * **Not gated: `incomplete`.** Those are the checks axe could not decide — on every screen of this
 * product that is `color-contrast` against a gradient or an image, and `duplicate-id-aria` where the
 * id it would compare is generated. Gating on *undecidable* is how a suite acquires a flake, and
 * a rule that cannot decide is not a rule that found something. The ids are reported beside the
 * violations so the set is visible; **their node counts deliberately are not**, because
 * `resultTypes: ['violations']` truncates the node list of every other bucket and a count taken from
 * it would be wrong.
 *
 * ## 7. What it found, what was fixed, and what is recorded
 *
 * The first run of this sweep over all twenty screens found violations of **four** rules. Two were
 * fixed on the commit that built this file, one has since been fixed by GitHub issue #404, and one
 * is in {@link OUTSTANDING} with a ghost check holding it.
 *
 * | rule | criterion | where | what happened |
 * |---|---|---|---|
 * | `select-name` | SC 4.1.2 | Career, building, Workshop — **9** nodes from **3** call sites | **fixed**: `campaignScreens.ts#select` now requires a name, and `workshopScreen.ts`'s pattern select carries one |
 * | `label` | SC 4.1.2 | Design a building, Tune the tower — **21 to 41** inputs | **fixed**: `designerScreen.ts#sliderRow`, `#numberField` and `tunerScreen.ts#drawSliderRow` name their inputs |
 * | `color-contrast` | SC 1.4.3 | **every one of the twenty screens**, **265** nodes | **recorded** — see {@link OUTSTANDING}, its one entry |
 * | `scrollable-region-focusable` | SC 2.1.1 | the shell's own screen region, on Endless rush and the tutorial's second screen | **fixed** by issue #404 — see below |
 *
 * **The fourth row moved from *recorded* to *fixed*, and the register entry was deleted rather than
 * reworded.** Its recorded reason was a precondition, not a doubt: *"the remedy — `tabindex="0"` on
 * the region every screen mounts into — puts a new stop in the Tab order of all twenty, which is
 * `docs/36` `AX-9` and `AX-10` work and needs the written keyboard journeys § 5.2 specifies before
 * anybody moves focus order."* Those journeys are `everyday/keyboardJourneys.browser.test.ts`, and
 * `shell.ts` now writes `main`, an `id` and `tabindex="0"` onto `.everyday-screen` — so the region
 * is in the tab order, `focusable-element` passes, and the rule reports nothing on any of the
 * twenty. **The ghost check below is what said so**: it went red on the commit that made the
 * finding stop reproducing, which is the direction a register is worth keeping for. A registered
 * finding that has been fixed must stop being registered, or the register becomes decoration.
 *
 * The counts in that table are a **dated record of one host on 2026-09-09**, taken by driving the twenty
 * routes outside vitest — which is how they can be read at all, since vitest 4 intercepts
 * `console.log` and this file's own assertions publish only what is unregistered. They are
 * deliberately not asserted anywhere: see the paragraph below on why a count is not a sound key.
 *
 * *21 to 41* is not vagueness. The `label` count on Design a building moved between two runs of the
 * same probe script on the same host — 37 nodes, then 17 — because that screen draws two number
 * fields per shaft and the shaft count of the design it opens with is not fixed. That is the reason
 * the register below matches on a **selector fragment** and never on a node count: a ratchet over a
 * quantity that moves on its own is a ratchet that fires for a reason nobody can act on. Why the
 * shaft count moves is **unmeasured**; it is named here rather than explained, because a plausible
 * sentence in place of a measurement is what [§ D256](../../../../DECISIONS.md) refuses.
 *
 * ## 8. What it costs, stated rather than glossed
 *
 * **92.7 s for twenty-five cases**, measured on this host on 2026-09-09 on a quiet box — one cold
 * page per screen, an axe injection and a run on each, plus the four cases that are not a screen.
 * The tier it joins measured ~157 s, so this is a real addition to it and not a rounding error. It
 * is worth paying because the alternative is the coverage `docs/36` § 7 describes, and § D220's rule
 * for this tier is that it *"is allowed to be slow, but not to be flaky"*.
 *
 * **Under load the same file took 331 s, and both figures are given because only the pair says
 * anything.** The second was measured on the same host with a full `npx vitest run` in flight
 * beside it — which is `vitest.config.ts`'s own governing condition, *under load*, and roughly the
 * 3.6× it prices there. **No case passed its 120 000 ms ceiling in either run**, which is the thing
 * that actually matters: the file gets slower, and the cases do not get closer to timing out,
 * because the cost is spread over twenty-five of them rather than concentrated in one.
 *
 * One route inside that total needs a **simulation**: `report` is hard-gated on a closed day —
 * `shell.ts#nextStopIsLive` lights its stop only once `dayClosed` and a report exist — so its case
 * walks the brief's primary onto the stage, waits the four-fact latch out, and presses *Close the
 * day*. No case here is annotated above the `viz-browser` project's own 120 000 ms ceiling, which is
 * `testCost.test.ts`'s ratchet and may only fall.
 *
 * ## 9. Proving the sweep can fail
 *
 * A guard nobody has watched reject anything cannot fail, and a sweep that comes back clean on its
 * first run is likelier to be miswired than good. Two controls, and the first one is here because it
 * caught this file being miswired.
 *
 * **The one that failed first.** The negative control was originally a `<div>` of deliberately
 * inaccessible markup — an empty `<button>`, an `<img>` with no `alt`, an unlabelled `<input>` —
 * appended to `document.body`. axe reported **`button-name` as a pass**. The reason is measured
 * rather than guessed: the shell's root fills the viewport and clips it, so the injected node laid
 * out at `y = 910` in a 900 px-tall page, outside the clipping rectangle, and axe correctly treats a
 * clipped element as hidden and skips it. Appended inside `.everyday-main` instead, at `y = 891`, the
 * same three elements produced `button-name`, `image-alt` and `label`. **An injected control that
 * lands where nothing is drawn proves nothing**, and the first version of this file would have
 * shipped a control that never fired.
 *
 * **What is checked now** is a mutation of the product's own DOM, which cannot land off-screen
 * because it does not add anything: {@link takeTheNameAway} strips the text out of a control the
 * page already draws, asserts the sweep now reports `button-name` **on that element's own
 * selector**, puts the text back, and asserts the sweep returns to exactly what it said before. It
 * proves the three things a control has to prove — the sweep reads the served page, it fails on a
 * real defect, and its clean answer is a measurement rather than a default.
 *
 * The register gets the same treatment. `honesty.test.ts`'s third assertion exists because *"a
 * predicate that returned `true` for every violation would satisfy both directions at once whatever
 * the register holds"*, and the same is true here: the last negative control asserts that the
 * mutation's `button-name` finding is **not** matched by any entry.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openEverydayDoor,
  openPage,
  openScenarioEntry,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { EVERYDAY_SCREENS_BUILT } from './screens.js';
import type { EverydayScreen } from './types.js';

/* ========================================================================== *
 * The instrument
 * ========================================================================== */

/**
 * The tags that name the standard — see the header § 2.
 *
 * Read by axe **in the page** rather than compared against a list here: the first case asks axe for
 * the rules these tags select and asserts properties of the answer, so a version of axe that
 * retagged a rule is visible rather than silently absorbed.
 */
const SWEEP_TAGS: readonly string[] = Object.freeze(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);

/**
 * axe-core's own bundle, read off disk once.
 *
 * `axe.min.js` rather than `axe.js` because it is injected into twenty pages and the two carry the
 * same rules. Resolved through `createRequire` rather than by a relative path, so it comes from the
 * dependency the lockfile pins rather than from wherever a `node_modules` happens to sit.
 */
const axeSource = (): string =>
  readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/** One node axe reported, flattened to the two things the register matches on. */
interface Finding {
  readonly screen: EverydayScreen;
  readonly ruleId: string;
  /** axe's CSS path to the offending element, joined — its `target`. */
  readonly target: string;
  /** axe's own one-line summary, for a reader of a red run. */
  readonly help: string;
}

/** What one screen's sweep produced. */
interface SweepResult {
  readonly findings: readonly Finding[];
  /** Rule ids axe could not decide. Reported, never gated — header § 6. */
  readonly undecided: readonly string[];
}

/* ========================================================================== *
 * The register — GitHub issue #407's fourth acceptance criterion
 * ========================================================================== */

/**
 * Violations found on landing that are **recorded rather than fixed**, on
 * `honesty/honesty.test.ts`'s `OUTSTANDING` precedent and asserted the same three ways:
 *
 * - nothing outside it may fail — a new violation is red;
 * - everything in it must still be found — a finding that is fixed, or that the sweep stops being
 *   able to see, is also red, with a message saying to delete the entry;
 * - and a negative control, because a predicate that matched everything would satisfy both
 *   directions at once whatever the register held.
 *
 * **A register of ghosts is a suppression list**, and the second and third clauses are what stop
 * this becoming one.
 *
 * ## Why an entry may name `'every'` rather than a screen
 *
 * `honesty.test.ts`'s `tier: 'both'` marker exists because *"seventeen findings on copy that renders
 * in both tiers would be thirty-four rows, deleted in two places on the day each is fixed, and a
 * half-deletion is exactly the ghost this register exists to catch"*. The same asymmetry is sharper
 * here: the rail, the identity card and the action bar are **one component drawn on twenty
 * screens**, so a per-screen register would hold the same finding twenty times.
 *
 * The cost is stated rather than glossed. `'every'` weakens the ghost check to *found on at least
 * one screen*, which is weaker than *found where it was recorded*. It is accepted for the one entry
 * that remains because it is a rule reproducing on every screen measured, so per-screen precision
 * would buy a longer register and no extra information. **It was accepted for a second entry that
 * has since been deleted**, and that deletion is the argument for the marker rather than against
 * it: `scrollable-region-focusable` was one element in `everyday/shell.ts`, drawn on all twenty, and
 * fixing it took one entry out rather than twenty.
 *
 * ## Why the match is a selector fragment and never a node count
 *
 * Header § 7: the node count of one of these rules moved between two runs of the same script on the
 * same host, because the screen's own content is not fixed run to run. A count is therefore not a
 * sound key, and a ratchet over it would fire for a reason nobody can act on.
 */
const OUTSTANDING: readonly {
  readonly ruleId: string;
  /** The screen it reproduces on, or `'every'` — see above. */
  readonly screen: EverydayScreen | 'every';
  /**
   * A fragment of axe's `target` selector; the stable part of it.
   *
   * **Omitted only for a rule registered whole**, which is the strongest form an entry can take and
   * the one to distrust: it accepts every node of that rule on the screens it names, so a *new*
   * defect on the same rule arrives unregistered and silent. It is used once below, for
   * `color-contrast`, where the finding is on every one of the twenty screens and a per-node
   * register would be a hundred rows of the same sentence. An entry that omits it must name the
   * owner who will close it, because nothing else will notice it is still open.
   */
  readonly targetContains?: string;
  readonly finding: string;
}[] = Object.freeze([
  {
    ruleId: 'color-contrast',
    screen: 'every',
    finding:
      'WCAG SC 1.4.3. Every one of the twenty screens reports text below the 4.5:1 floor, and it ' +
      'is one small family of tokens rather than twenty defects: the eyebrows, captions and notes ' +
      'drawn in `everyday/tokens.ts#EVERYDAY_COLORS`\'s two faintest inks — `label` (#8D8271) and ' +
      '`faint` (#A79B87) — over `paper` and `card`. Read off the failing selectors and then off ' +
      'the modules that draw them: the rail group titles and the rail subline, the identity ' +
      'heading, the figure labels, the `writes` line under every slider, the chip notes. It is ' +
      'recorded rather than fixed because the remedy is a decision ' +
      'this file may not take: `docs/36` § 8 item 2 records it as unmade, and names the three ways ' +
      'to close it — move the ink, which crosses the design handoff\'s § 19 palette; move the ' +
      'ground, which crosses the surface token; or change what is drawn, which is `docs/28` AD-S7. ' +
      'Owner: `docs/36` `AX-6` and `AX-7`, and GitHub issue #239\'s remaining clauses. The rule ' +
      'stays in the gate: what is registered is this finding, not the criterion.',
  },
  /*
   * **`scrollable-region-focusable` used to be the second entry and is deleted, not reworded** —
   * GitHub issue #404. Its own recorded reason named the precondition rather than a doubt: the
   * remedy needed `docs/36` § 5.2's written keyboard journeys to exist first, because it moves
   * focus order on all twenty screens. They exist (`everyday/keyboardJourneys.browser.test.ts`),
   * `shell.ts`'s screen region is now a `main` with an `id` and `tabindex="0"`, and the ghost check
   * below went red on the commit that made the finding stop reproducing — which is what took the
   * entry out. The rule itself stays in the gate: what was registered was that finding, not the
   * criterion, so a *new* unfocusable scrolling region arrives unregistered and red.
   */
]);

/** Whether this entry is the one that finding is about. One place, so the two directions agree. */
function entryMatches(known: (typeof OUTSTANDING)[number], found: Finding): boolean {
  return (
    known.ruleId === found.ruleId &&
    (known.screen === 'every' || known.screen === found.screen) &&
    (known.targetContains === undefined || found.target.includes(known.targetContains))
  );
}

function isRegistered(found: Finding): boolean {
  return OUTSTANDING.some((known) => entryMatches(known, found));
}

/* ========================================================================== *
 * Driving the page
 * ========================================================================== */

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5301, strictPort: false } });
  origin = site.origin;
  browser = await chromium.launch({ executablePath: CHROMIUM });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/**
 * A cold page with the Everyday shell up and the Engineer menu settled, at a width above
 * `EVERYDAY_RAIL_DRAWER_MAX_PX` so the rail is a column and a rail-row route needs no drawer press.
 */
async function coldLoad(): Promise<Page> {
  const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(
    () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForSelector('.everyday-landing, .everyday-tutorial, .everyday-mode[data-screen]', {
    timeout: 30_000,
  });
  return page;
}

/** A rail row, by its § 3.2 label — the rows carry no class of their own. */
async function railRow(page: Page, label: string): Promise<void> {
  await page.locator('nav.everyday-rail button', { hasText: label }).first().click();
}

/** The Career tile, then the building the campaign opens with. */
async function openCampaignBuilding(page: Page): Promise<void> {
  await leaveTutorialIfOffered(page);
  await page.locator('.everyday-mode[data-screen="towers"]').click();
  await page.waitForSelector('.everyday-towers', { timeout: 15_000 });
  await page.locator('.everyday-towers-open').first().click();
  await page.waitForSelector('.everyday-building', { timeout: 15_000 });
}

/** § 6.1's front door, then § 3.3's primary onto the brief. */
async function openBrief(page: Page): Promise<void> {
  await openEverydayDoor(page);
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-brief', { timeout: 15_000 });
}

/**
 * The brief's primary onto the stage, with the day drawn rather than merely mounted.
 *
 * The four-fact latch is `browserTier.test-helper.ts#enterEverydayStage`'s, and it is written out
 * here rather than imported because this file needs the **brief** on the way past (the tuner's only
 * shipped door is a card on it) and the helper does not stop there. What it asserts is unchanged: a
 * canvas in the page, with a real box, with a sized backing store, with the transport at the start
 * of a day.
 */
async function enterStage(page: Page): Promise<void> {
  await openBrief(page);
  await page.locator('.everyday-bar-primary').click();
  await page.waitForSelector('.everyday-stage-canvas', { timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector<HTMLCanvasElement>('.everyday-stage-canvas');
      if (canvas === null || canvas.width === 0) return false;
      if (canvas.getBoundingClientRect().width === 0) return false;
      if (document.querySelector<HTMLElement>('.everyday-stage-start')?.style.display !== '') {
        return false;
      }
      return /^\d{2}:\d{2}$/u.test(
        document.querySelector('.everyday-stage-clock')?.textContent ?? '',
      );
    },
    undefined,
    { timeout: 90_000 },
  );
}

/**
 * One route per screen the registry builds — the player's own path in every case.
 *
 * Typed as a total `Record` over `EverydayScreen` so a new key in `types.ts#EVERYDAY_SCREENS` fails
 * to compile, and asserted against `EVERYDAY_SCREENS_BUILT` at run time in both directions by the
 * last case, because *built* is a filter this type cannot see.
 */
const ROUTES: Readonly<Record<EverydayScreen, (page: Page) => Promise<void>>> = Object.freeze({
  /*
   * The shell's own front door. `leaveTutorialIfOffered` first because every page this tier opens is
   * a fresh context and therefore a first visit, which `shell.ts#offerTutorial` bounces to the
   * walkthrough.
   */
  menu: async (page) => {
    await leaveTutorialIfOffered(page);
    await page.waitForSelector('.everyday-mode[data-screen]', { timeout: 15_000 });
  },
  /*
   * GitHub issue #244's landing page. Reached by **not leaving it**: it is what a fresh context
   * meets, which is the whole of what the page is for, so the route is to wait for it rather than
   * to navigate to it. That also makes this the one route here that sweeps a screen in the state a
   * stranger actually arrives in.
   *
   * Its canvas is outside what any rule set can read — a bitmap is not the accessibility tree — so
   * this sweep says nothing about what is drawn on it. The screen labels it `role="img"` with the
   * caption as its name, which is the half the tree *can* carry, and the sweep does check that.
   */
  landing: async (page) => {
    await page.waitForSelector('.everyday-landing', { timeout: 30_000 });
  },
  /*
   * § D529's walkthrough is not reached by a tile or a row: `shell.ts:2262` is the only `go`, inside
   * the first-visit offer. So the route is to wait for it — which is also why every other route here
   * has to leave it.
   */
  tutorial: async (page) => {
    /*
     * Reached through the landing page's own call to action since GitHub issue #244 — a fresh
     * context now meets the landing page and the walkthrough is one press behind it. Pressed here
     * rather than waited for, because waiting for a screen nothing opens is how a route quietly
     * stops testing anything.
     */
    await page.waitForSelector('.everyday-landing-cta', { timeout: 30_000 });
    await page.locator('.everyday-landing-cta').click();
    await page.waitForSelector('.everyday-tutorial', { timeout: 30_000 });
  },
  /*
   * The walkthrough's own primary, *Show me a building losing*. Deliberately not the skip button and
   * not the collapse screen's primary: both call `tutorialScreens.ts#leave`, which files a real day
   * (§ D476), so pressing either would run a shift this sweep has no use for and hand the rest of the
   * page a week that is not the fixture.
   */
  collapse: async (page) => {
    await page.waitForSelector('.everyday-landing-cta', { timeout: 30_000 });
    await page.locator('.everyday-landing-cta').click();
    await page.waitForSelector('.everyday-tutorial', { timeout: 30_000 });
    await page.locator('.everyday-bar-primary').click();
    await page.waitForSelector('.everyday-collapse', { timeout: 20_000 });
  },
  scenario: async (page) => {
    await leaveTutorialIfOffered(page);
    await page.locator('.everyday-mode[data-screen="scenario"]').click();
    await page.waitForSelector('.everyday-scenario', { timeout: 15_000 });
  },
  door: openEverydayDoor,
  brief: openBrief,
  stage: enterStage,
  /*
   * The only route in this table that needs a run, and it needs a *closed* one:
   * `shell.ts#nextStopIsLive` lights the report's stop only once the day is closed and a report
   * exists. Reached by the two presses a player makes rather than by `page.evaluate` into the host,
   * because that route needs a dev server and this file may not have one.
   */
  report: async (page) => {
    await enterStage(page);
    await page.locator('.everyday-bar-primary').click();
    await page.waitForSelector('.everyday-report', { timeout: 60_000 });
  },
  towers: async (page) => {
    await leaveTutorialIfOffered(page);
    await page.locator('.everyday-mode[data-screen="towers"]').click();
    await page.waitForSelector('.everyday-towers', { timeout: 15_000 });
  },
  building: openCampaignBuilding,
  contract: async (page) => {
    await openCampaignBuilding(page);
    await page.locator('.everyday-building-to-contract').click();
    await page.waitForSelector('.everyday-contract', { timeout: 15_000 });
  },
  rush: async (page) => {
    await leaveTutorialIfOffered(page);
    await page.locator('.everyday-mode[data-screen="rush"]').click();
    await page.waitForSelector('.everyday-rush', { timeout: 15_000 });
  },
  fixit: async (page) => {
    await openScenarioEntry(page, 'fix-a-building');
    await page.waitForSelector('.everyday-fixit', { timeout: 30_000 });
    /*
     * The case rail arrives with the screen; the figures arrive from a worker. Waiting for a case
     * button rather than for a figure is deliberate — this file sweeps what is drawn, and a screen
     * still filling in is a state a player meets too.
     */
    await page.waitForSelector('.everyday-fixit-case', { timeout: 60_000 });
  },
  workshop: async (page) => {
    await railRow(page, 'Dispatcher workshop');
    await page.waitForSelector('.everyday-workshop', { timeout: 20_000 });
  },
  bench: async (page) => {
    await railRow(page, 'Test bench');
    await page.waitForSelector('.everyday-bench-test', { timeout: 30_000 });
  },
  designer: async (page) => {
    await railRow(page, 'Design a building');
    await page.waitForSelector('.everyday-designer', { timeout: 20_000 });
  },
  /*
   * § 3.2 forbids the tuner a rail row and a tile — *it is a thing you do to a day, not a place you
   * live* — and `standaloneScreens.browser.test.ts` asserts that absence in both directions. Its one
   * shipped door is the brief's locked-for-score card, so that is the route.
   */
  tuner: async (page) => {
    await openBrief(page);
    await page.locator('.everyday-brief-locked-go').click();
    await page.waitForSelector('.everyday-tuner', { timeout: 15_000 });
  },
  week: async (page) => {
    await railRow(page, 'Your week');
    await page.waitForSelector('.everyday-week', { timeout: 20_000 });
  },
  board: async (page) => {
    await railRow(page, 'Boards & ladder');
    await page.waitForSelector('.everyday-board-tab-ladder', { timeout: 30_000 });
  },
  settings: async (page) => {
    await page.locator('.everyday-rail-settings').click();
    await page.waitForSelector('.everyday-settings', { timeout: 20_000 });
  },
});

/* ========================================================================== *
 * The sweep itself
 * ========================================================================== */

/** What `axe.run` hands back, narrowed to what this file reads. */
interface AxeReport {
  readonly violations: readonly {
    readonly id: string;
    readonly help: string;
    readonly nodes: readonly { readonly target: readonly string[] }[];
  }[];
  readonly incomplete: readonly { readonly id: string }[];
}

/** Inject axe, run the named rule set over the whole document, and flatten the answer. */
async function sweep(page: Page, screen: EverydayScreen): Promise<SweepResult> {
  await page.addScriptTag({ content: axeSource() });
  const report = await page.evaluate(async (tags: readonly string[]): Promise<AxeReport> => {
    const runner = (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<AxeReport> } })
      .axe;
    return runner.run(document, {
      runOnly: { type: 'tag', values: [...tags] },
      resultTypes: ['violations'],
    });
  }, SWEEP_TAGS);
  return {
    findings: report.violations.flatMap((rule) =>
      rule.nodes.map((node) => ({
        screen,
        ruleId: rule.id,
        target: node.target.join(' '),
        help: rule.help,
      })),
    ),
    undecided: [...new Set(report.incomplete.map((rule) => rule.id))].sort(),
  };
}

/** One line a reader of a red run can act on. */
const describeFinding = (found: Finding): string =>
  `${found.screen}: ${found.ruleId} at ${found.target} — ${found.help}`;

/**
 * Every screen's sweep, filled in by the per-screen cases and read by the ghost check.
 *
 * The ghost check asserts this map is complete before it reads it, so a run in which some screen's
 * case failed early cannot be mistaken for one in which a registered finding stopped reproducing.
 */
const swept = new Map<EverydayScreen, SweepResult>();

describe.skipIf(!HAS_BROWSER)('the accessibility sweep — WCAG 2.1 A and AA over the served bundle', () => {
  it('runs the rule set the standard names, read off axe rather than transcribed', async () => {
    const page = await coldLoad();
    await leaveTutorialIfOffered(page);
    await page.addScriptTag({ content: axeSource() });
    const derived = await page.evaluate((tags: readonly string[]) => {
      const runner = (
        window as unknown as {
          axe: {
            version: string;
            getRules: (tags?: readonly string[]) => readonly { ruleId: string; tags: string[] }[];
          };
        }
      ).axe;
      const chosen = runner.getRules([...tags]);
      return {
        version: runner.version,
        all: runner.getRules().length,
        chosen: chosen.map((rule) => rule.ruleId).sort(),
        stray: chosen
          .filter((rule) => !rule.tags.some((tag) => tags.includes(tag)))
          .map((rule) => rule.ruleId),
        parsing: chosen.filter((rule) => rule.tags.includes('wcag411')).map((rule) => rule.ruleId),
      };
    }, SWEEP_TAGS);
    await page.close();

    /*
     * Pinned to the version the lockfile carries. axe retags rules between releases — that is how a
     * rule set stays honest about which criterion it maps to — and a bump that silently changed the
     * gate is exactly the move this assertion exists to make visible.
     */
    expect(derived.version).toBe('4.13.0');
    /*
     * A selection, not the catalogue. If these were equal the tag filter would be doing nothing and
     * the sweep would be gating on axe's best-practice rules under the name of a standard.
     */
    expect(derived.chosen.length).toBeGreaterThan(50);
    expect(derived.chosen.length).toBeLessThan(derived.all);
    /* Every selected rule carries one of the tags that names the standard. */
    expect(derived.stray).toEqual([]);
    /*
     * **The one clause that makes the header § 2 subset claim exact, mechanised rather than
     * argued.** SC 4.1.1 Parsing is the only Level A criterion WCAG 2.2 *removes*, so a rule
     * mapping to it would be required by Option B and not by Option A — and this sweep would then
     * be gating on something one of the two candidate targets does not ask for. It is not: axe's
     * two 4.1.1 rules (`duplicate-id`, `duplicate-id-active`) are tagged `wcag2a-obsolete` and
     * `deprecated` rather than `wcag2a`, and are shipped disabled, so the tag set above cannot
     * reach them. Asserted here so a release that put one back is a red run rather than a silent
     * widening of what this file claims.
     */
    expect(derived.parsing).toEqual([]);
    /*
     * Three rules named by hand, because *the set is non-empty* is satisfied by a set that has lost
     * the rule you cared about. One name, one contrast floor, one keyboard rule.
     */
    expect(derived.chosen).toContain('button-name');
    expect(derived.chosen).toContain('color-contrast');
    expect(derived.chosen).toContain('scrollable-region-focusable');
  }, 120_000);

  it.each([...EVERYDAY_SCREENS_BUILT])(
    'the %s screen draws no violation the register does not already name',
    async (screen) => {
      const open = ROUTES[screen];
      expect(
        open,
        `no route to the ${screen} screen. Every key screens.ts builds needs one here, or this ` +
          'sweep is a claim about the screens somebody remembered.',
      ).toBeDefined();

      const page = await coldLoad();
      await open(page);
      const result = await sweep(page, screen);
      await page.close();
      swept.set(screen, result);

      expect(
        result.findings.filter((found) => !isRegistered(found)).map(describeFinding),
        `the ${screen} screen violates the standard in a way OUTSTANDING does not name. Fix it, or ` +
          'record it there with the reason and the owner — and do not narrow SWEEP_TAGS, which is ' +
          'meeting a criterion by weakening it. axe could not decide: ' +
          (result.undecided.length === 0 ? 'nothing' : result.undecided.join(', ')),
      ).toEqual([]);
    },
    120_000,
  );

  it('still finds every violation the register records — a register of ghosts is a suppression list', () => {
    expect(
      [...EVERYDAY_SCREENS_BUILT].filter((screen) => !swept.has(screen)),
      'these screens were never swept, so this case would be asserting over a partial run',
    ).toEqual([]);

    const seen = [...swept.values()].flatMap((result) => result.findings);
    expect(seen.length, 'no violation was found at all, so this case asserts nothing').toBeGreaterThan(0);

    for (const known of OUTSTANDING) {
      expect(
        seen.some((found) => entryMatches(known, found)),
        `the sweep no longer finds ${known.ruleId} at ${known.targetContains ?? '<the rule, whole>'}. ` +
          'If it was fixed, delete the OUTSTANDING entry; if the sweep stopped being able to see ' +
          'it, that is the defect this assertion exists to catch.',
      ).toBe(true);
    }
  });

  it('fails when a control the product draws has its name taken away', async () => {
    const page = await coldLoad();
    await leaveTutorialIfOffered(page);
    const before = await sweep(page, 'menu');

    const mutated = await takeTheNameAway(page, '.everyday-rail-settings');
    expect(
      mutated,
      'the rail row this case mutates is not in the page, so nothing was taken away and the ' +
        'assertion below would be about an unmutated page. Point it at a control the shell draws.',
    ).toBe(true);
    const during = await sweep(page, 'menu');
    expect(
      during.findings.filter(
        (found) => found.ruleId === 'button-name' && found.target.includes('.everyday-rail-settings'),
      ),
      'the sweep did not report a button with no accessible name. Something between the page and ' +
        'the rule set is not connected — which is the state this case exists to make impossible to ' +
        'ship. Read the header § 9: the first version of this control appended a nameless button ' +
        'to `document.body`, landed it outside the shell\'s clipping rectangle, and axe correctly ' +
        'reported it as a pass.',
    ).not.toEqual([]);

    await putTheNameBack(page, '.everyday-rail-settings');
    const after = await sweep(page, 'menu');
    await page.close();
    /*
     * The other half, and the one that makes a clean run mean anything: restored, the sweep says
     * exactly what it said before. A control that only shows the sweep going red would be satisfied
     * by an instrument that is red about everything.
     */
    expect(after.findings.map(describeFinding)).toEqual(before.findings.map(describeFinding));
  }, 120_000);

  it('negative control: the register accepts nothing it does not name', async () => {
    const page = await coldLoad();
    await leaveTutorialIfOffered(page);
    await takeTheNameAway(page, '.everyday-rail-settings');
    const result = await sweep(page, 'menu');
    await page.close();

    const injected = result.findings.filter((found) => found.ruleId === 'button-name');
    expect(injected.length, 'the mutation produced no finding, so this case asserts nothing').toBeGreaterThan(0);
    /*
     * `honesty.test.ts`'s third assertion, in this register's terms: an `isRegistered` that returned
     * `true` for everything would satisfy the two directions above at once, whatever OUTSTANDING
     * held. So a real violation on a rule no entry names is asserted **not** matched.
     */
    expect(injected.filter((found) => !isRegistered(found))).not.toEqual([]);
  }, 120_000);

  it('has a route for every screen the registry builds, and none for a screen it does not', () => {
    expect(Object.keys(ROUTES).sort()).toEqual([...EVERYDAY_SCREENS_BUILT].sort());
  });
});

/* ========================================================================== *
 * The mutation the negative controls drive
 * ========================================================================== */

/**
 * Take the accessible name off a control the page already draws, and say whether it was there.
 *
 * A **mutation of the product's own DOM** rather than an injection, for the reason the header § 9
 * measures: an injected node lands wherever the layout puts it, and the shell clips its own
 * viewport, so a control appended to `document.body` sat outside the clipping rectangle and axe —
 * correctly — treated it as hidden. Nothing is added here, so nothing can land in the wrong place.
 *
 * The text is parked on the element rather than thrown away, so {@link putTheNameBack} restores the
 * page exactly and the third sweep is comparable with the first.
 */
async function takeTheNameAway(page: Page, selector: string): Promise<boolean> {
  /*
   * Written over three lines rather than as `}, selector);` on one, and that is not a style
   * preference. `testCost.test-helper.ts`'s annotation scanner reads a line matching `}, <arg>);`
   * as a test's trailing timeout and attributes it to the nearest opener at the same indent — so
   * this shape, inside a `describe`, was censused as an annotation whose value is the identifier
   * `selector`, and `testCost.test.ts` failed it as an *unresolved constant*. The scanner is right
   * to refuse what it cannot price; this is the call moving out of its way.
   */
  return page.evaluate(
    (css: string) => {
      const node = document.querySelector<HTMLElement>(css);
      if (node === null) return false;
      node.dataset['a11ySweepName'] = node.innerHTML;
      node.replaceChildren();
      return true;
    },
    selector,
  );
}

/** And put it back, so the sweep either side of the mutation is comparable. */
async function putTheNameBack(page: Page, selector: string): Promise<void> {
  /* The same three-line shape, for {@link takeTheNameAway}'s reason. */
  await page.evaluate(
    (css: string) => {
      const node = document.querySelector<HTMLElement>(css);
      if (node === null) return;
      node.innerHTML = node.dataset['a11ySweepName'] ?? '';
      delete node.dataset['a11ySweepName'];
    },
    selector,
  );
}
