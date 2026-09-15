/**
 * **A walkthrough of the accessibility tree, screen by screen, on the artifact players load** —
 * GitHub issue **#406**, split from **#239**, against the standard adopted in
 * [`docs/36-accessibility-standard.md`](../../../../docs/36-accessibility-standard.md)
 * ([§ D473](../../../../DECISIONS.md)).
 *
 * Recorded here rather than in `DECISIONS.md` under [§ D405](../../../../DECISIONS.md) for
 * everything that binds only this file — the seven rules, the register, and what each finding costs.
 * The three changes it forced in the product reach past this module and carry numbers:
 * [§ D591](../../../../DECISIONS.md) (the landmark name and the stage's heading),
 * [§ D592](../../../../DECISIONS.md) (the two live regions written on every frame) and
 * [§ D593](../../../../DECISIONS.md) (a disabled control saying why).
 *
 * ## 1. What this is NOT, said first because the issue is about the difference
 *
 * #406 asks for **a screen-reader walkthrough**: a person driving NVDA, JAWS or VoiceOver over the
 * served build, with the reader and its version recorded. `docs/36` § 6.6 lists it among the human
 * checks and § 6.7 says why in terms — *"a screen reader is a real assistive stack with its own
 * heuristics and its own users"*, and that promise *"is not mechanisable at any price"*.
 *
 * **No screen reader was run to produce this file, and nothing here should be read as if one had
 * been.** There is no NVDA, no JAWS and no VoiceOver in the environment that wrote it, and a file
 * claiming otherwise would be manufacturing the single piece of evidence #406 exists to obtain.
 * § 7 below says exactly which of this walkthrough's subjects a real session would still have to
 * confirm, and it is not a short list.
 *
 * What this file *is* is the other promise in `docs/36` § 6.7, driven rather than asserted: **the
 * accessibility tree is well formed**, on every screen, reached the way a player reaches it. That
 * is a real audit and it is reproducible, which a listening session is not.
 *
 * **It found nine things. Six are fixed on this commit and three are registered** in
 * {@link OUTSTANDING} and {@link OBSCURED_OUTSTANDING} with the reason and the owner. Two results
 * that are not findings are worth as much and are recorded here because a green column says nothing
 * on its own: **no control a player operates reaches the tree without a name**, on any of the
 * twenty-one screens — which is the axe sweep's `select-name` and `label` fixes still holding — and
 * **the covered world is silent on every one of them**, which is `inert` doing the job
 * `menuPanel.ts#coverShell` gives it.
 *
 * ## 2. The instrument: Chromium's own accessibility tree, over CDP
 *
 * `Accessibility.getFullAXTree` — the tree Chromium hands to the platform accessibility APIs a
 * screen reader reads through. Not the DOM, and not a rule set's model of the DOM.
 *
 * **Three candidates were tried and two were wrong, which is worth recording because `docs/36`
 * § 6.2 prices one of them as this file's natural instrument.**
 *
 * 1. `page.accessibility.snapshot()` — **gone**. It was Playwright's own AX-tree reader and does not
 *    exist in `playwright-core` 1.62.1, the version the root `package.json` pins. `docs/36` § 6.2's
 *    closing note asked for exactly this check — *"confirm the API against that pin rather than
 *    against the current release"* — and this is that note earning its keep.
 * 2. `locator.ariaSnapshot()` — present, and **it does not honour `inert`**. Measured: on the
 *    Workshop screen it returns the whole Engineer surface — its banner, its `Skip to the building`
 *    link, its tablist, its building combobox — all of which sit under `menuPanel.ts#coverShell`'s
 *    `inert` while Everyday Mode has the page. A walkthrough written on it would have audited a
 *    surface no player can open, which is the failure `browserTier.test-helper.ts` exists to stop
 *    one level down. That is a fact about the tool rather than about the product, and it is the
 *    reason the cheaper column of `docs/36` § 6.2's table is not what this file uses.
 * 3. **CDP's `getFullAXTree`**, which does honour it: on all twenty-one screens the Engineer half of
 *    the document is `ignored`, and between 147 and 665 nodes of roughly two to three thousand are
 *    exposed. {@link RULES} keeps that as its own rule rather than as a note, because *the covered
 *    world is silent* is a property the product has to keep and not a property of Chromium.
 *
 * ## 3. The screens: derived from the registry, and the routes are the player's
 *
 * `browserTier.test-helper.ts#EVERYDAY_SCREEN_ROUTES`, the same table
 * `accessibilitySweep.browser.test.ts` drives — a tile, a rail row, a bar primary, never a reach
 * into the shell. The last case asserts its key set equals `screens.ts#EVERYDAY_SCREENS_BUILT` in
 * both directions, so a twenty-second screen is a failing case rather than a silent gap.
 *
 * The routes were **moved** into that helper on this commit rather than copied: two instruments
 * that visit every screen needed the same twenty-one routes, and two copies kept identical by a
 * sentence is the shape that file's header was written about.
 *
 * ## 4. The seven rules, and why each is here rather than in the axe sweep
 *
 * `everyday/accessibilitySweep.browser.test.ts` already runs WCAG 2.1 A and AA over these same
 * screens. Everything below is something that sweep **cannot** decide, and the issue's own comment
 * names the class: *"reading order, announcement quality, whether a live region interrupts, whether
 * a disabled control says why"*.
 *
 * **Six of the seven are predicates over one screen's tree and live in {@link RULES}**, so they run
 * off a single CDP round trip per screen. `focus-not-obscured` is the seventh and is not one of
 * them: it needs the keyboard driven, so it has its own case and its own register.
 *
 * - **`every-control-named`** — the one rule that overlaps axe, kept as this file's anchor. If it
 *   ever fails here and passes there, the two instruments disagree and one of them is broken.
 * - **`screen-heading`** — exactly one exposed level-1 heading, none empty, no level skipped.
 *   axe's `heading-order` and `page-has-heading-one` are tagged `best-practice` and are therefore
 *   outside that sweep's tag set by its own § 2. Heading navigation is one of the two ways a
 *   non-visual reader answers *where am I*.
 * - **`main-landmark-named`** — exactly one exposed `main`, carrying a name. `landmark-one-main` is
 *   `best-practice` too, and `shell.ts` already says why the count cannot be left to axe.
 * - **`covered-world-silent`** — § 2 item 3.
 * - **`disabled-says-why`** — every exposed disabled node carries an accessible description. No
 *   rule set has an opinion about this: a disabled control with no name is a violation everywhere,
 *   and a disabled control with a perfect name and no reason is a violation nowhere and a dead end
 *   for the player.
 * - **`focus-not-obscured`** — WCAG 2.2 SC 2.4.11, which `docs/36` § 1.2 prices as *"Small. One
 *   browser check: focus every focusable in turn, compare its box against the pinned chrome's.
 *   Unmeasured today"* and § 5.3 repeats as unmeasured. It is measured now, and it is the finding
 *   this file could not fix.
 * - **`live-region-politeness`** — no exposed live region is `assertive`. Green on arrival, and
 *   kept for `every-control-named`'s reason rather than deleted for being green: `assertive` is the
 *   one thing a live region can do that a player cannot get out of the way of, and a product that
 *   plays a simulated day in real time is exactly the kind that acquires one. Measured: every screen
 *   exposes one polite `status` (the shell's sign-in notice) and the stage exposes three more.
 *
 * An eighth check sits beside them and is deliberately not called a rule: the AX-3 case below asks
 * a question about a **sequence** of trees rather than about one, and it needs the day playing to
 * have a sequence at all.
 *
 * ## 5. The register, and the three entries in it
 *
 * {@link OUTSTANDING} is `honesty.test.ts`'s and `accessibilitySweep.browser.test.ts`'s pattern,
 * asserted the same three ways: nothing outside it may fail, everything in it must still
 * reproduce, and a negative control so that a predicate matching everything cannot satisfy both at
 * once. A register of ghosts is a suppression list, and those three clauses are what stop this
 * becoming one. Two entries, both on the works shop, and the second of them is a real finding that
 * is not a real defect — which is the argument for reading a register rather than counting it.
 *
 * {@link OBSCURED_OUTSTANDING} is the third, in the SC 2.4.11 case's own terms, and it carries the
 * mechanism it was measured with rather than a note saying somebody should look.
 *
 * ## 6. What a green run does not buy
 *
 * 1. **Nothing drawn on a canvas.** The stage is a canvas; a bitmap is not in any accessibility
 *    tree. What the canvas *says* is `render/describeFrame.ts`'s sentence, and the honesty corpus
 *    already holds that surface — `docs/36` § 3.3 requirement 4 and `AX-16`.
 * 2. **One viewport**, 1440 × 900, above `tokens.ts#EVERYDAY_RAIL_DRAWER_MAX_PX`, so the rail is a
 *    column and never the drawer a narrow page draws. Nothing here is evidence about the narrow
 *    layout; `everyday/viewportGates.browser.test.ts` is where that axis lives.
 * 3. **One state per screen** — whatever the route arrives in. A screen has more states than a route
 *    reaches, and a finding that only shows up in the seventh state of the Workshop is a finding
 *    this file will not see.
 * 4. **One engine.** Chromium's accessibility tree is not Firefox's or WebKit's, and the mapping
 *    from that tree to what a reader actually says is the reader's, not the browser's.
 *
 * ## 7. What a real screen-reader session would still have to confirm — #406's residual
 *
 * This is the deliverable half that is **not** a test, and it is written as a list so it can be
 * handed to whoever runs the session.
 *
 * 1. **Whether the announcements are any good.** Every rule above asks whether something is
 *    *present*. None asks whether it is *right*. `docs/36` § 6.1 puts five of its seventeen clauses
 *    in that group and this file does not pretend to reach them.
 * 2. **Whether the live regions land.** {@link RULES} counts writes; it cannot hear whether the
 *    stage's two-second cadence is a companion or a nuisance while a day is playing, nor whether
 *    `AX-3`'s policy is the right policy.
 * 3. **Reading order as experienced.** Tab order and heading order are measured here. *Meaningful
 *    sequence* — SC 1.3.2 — is a judgement about whether the order tells the story, and no rule
 *    decides it.
 * 4. **The stage as a thing you play.** `describeFrame`'s sentence is checked for honesty by the
 *    corpus and for presence by `AX-1`. Whether a non-visual player can notice a building going
 *    wrong *from it, in time* is `charter P3` and it needs a person.
 * 5. **Reader-specific behaviour.** Browse versus focus mode, whether a `role="status"` inside a
 *    replaced subtree is announced at all, how each reader treats `aria-describedby` on a disabled
 *    control — the last of these is exactly what two of this commit's fixes rely on, so it is the
 *    first thing a session should check.
 * 6. **The residual is not a failure.** `docs/36` § 6.7 commits the project to the first promise
 *    and *"treats the second as a tier-3 claim until a walkthrough is recorded with its date, its
 *    reader and its platform"*. That claim is still tier 3 after this file, and this file's own
 *    existence does not move it.
 */
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CHROMIUM,
  EVERYDAY_SCREEN_ROUTES,
  HAS_BROWSER,
  leaveTutorialIfOffered,
  openPage,
  startShippedSite,
  type ShippedSite,
} from '../dev/browserTier.test-helper.js';
import { EVERYDAY_SCREENS_BUILT, SCREEN_NAMES } from './screens.js';
import type { EverydayScreen } from './types.js';

/* ========================================================================== *
 * The tree, as Chromium hands it to an assistive stack
 * ========================================================================== */

/** One node of `Accessibility.getFullAXTree`, narrowed to what this file reads. */
interface AXNode {
  readonly nodeId: string;
  readonly ignored: boolean;
  readonly role?: { readonly value?: string };
  readonly name?: { readonly value?: string };
  readonly description?: { readonly value?: string };
  readonly properties?: readonly { readonly name: string; readonly value: { readonly value?: unknown } }[];
}

/** A node flattened into the four things every rule below asks about. */
interface Exposed {
  readonly role: string;
  readonly name: string;
  readonly description: string;
  readonly disabled: boolean;
  readonly level: number | undefined;
  readonly live: string;
}

/**
 * The roles a player operates, and therefore the ones an empty name is a defect on.
 *
 * `option` is in the set because a `combobox`'s options are read one by one, and an unnamed one is a
 * choice a reader cannot make. `img` is deliberately **not**: a decorative image with no name is
 * correct, and deciding which images are decorative is `AX-2`'s human half.
 */
const OPERABLE: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'combobox',
  'link',
  'listbox',
  'menuitem',
  'option',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'textbox',
]);

/** Read the tree once and flatten it. One CDP round trip per screen. */
async function treeOf(page: Page): Promise<readonly Exposed[]> {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: readonly AXNode[] };
  await cdp.detach();
  const read = (node: AXNode, key: string): unknown =>
    node.properties?.find((property) => property.name === key)?.value.value;
  return nodes
    .filter((node) => !node.ignored)
    .map((node) => {
      const level = read(node, 'level');
      const live = read(node, 'live');
      return {
        role: node.role?.value ?? '',
        name: (node.name?.value ?? '').replace(/\s+/gu, ' ').trim(),
        description: (node.description?.value ?? '').replace(/\s+/gu, ' ').trim(),
        disabled: read(node, 'disabled') === true,
        level: typeof level === 'number' ? level : undefined,
        live: typeof live === 'string' ? live : 'off',
      };
    });
}

/* ========================================================================== *
 * The rules
 * ========================================================================== */

/** One thing that is wrong on one screen, in the words a reader of a red run can act on. */
interface Finding {
  readonly screen: EverydayScreen;
  /** Which of {@link RULES} saw it. */
  readonly ruleId: string;
  /** The subject, stable enough to register: a role and a name, never a count. */
  readonly at: string;
  readonly detail: string;
}

/** A predicate over one screen's exposed tree. */
interface Rule {
  readonly id: string;
  readonly of: (tree: readonly Exposed[], screen: EverydayScreen) => readonly Finding[];
}

const finding = (screen: EverydayScreen, ruleId: string, at: string, detail: string): Finding => ({
  screen,
  ruleId,
  at,
  detail,
});

/**
 * Names only the Engineer surface draws, used to ask whether the covered world is in the tree.
 *
 * Read as **markers rather than an inventory**: three is enough to detect a cover that has come off,
 * and a full list would go stale the first time that surface was reworded. The skip link is the
 * sharpest of them — `docs/36` § 5.3 measured it as *"inside the covered Engineer subtree and
 * therefore `inert` while Everyday Mode has the page, so it is not a tab stop at all"*, which makes
 * its presence in the tree a direct contradiction of a published measurement.
 */
const ENGINEER_MARKERS: readonly string[] = Object.freeze([
  'Skip to the building',
  '‹ Everyday Mode',
  'Engineer — technical detail',
]);

const RULES: readonly Rule[] = Object.freeze([
  {
    id: 'every-control-named',
    of: (tree, screen) =>
      tree
        .filter((node) => OPERABLE.has(node.role) && node.name === '')
        .map((node) =>
          finding(
            screen,
            'every-control-named',
            `${node.role} with no name`,
            'a control a player operates reaches the accessibility tree with no accessible name, ' +
              'so a reader who does not point is told only what kind of thing it is — WCAG SC 4.1.2',
          ),
        ),
  },
  {
    id: 'screen-heading',
    of: (tree, screen) => {
      const headings = tree.filter((node) => node.role === 'heading');
      const out: Finding[] = [];
      const ones = headings.filter((node) => node.level === 1);
      if (ones.length !== 1) {
        out.push(
          finding(
            screen,
            'screen-heading',
            `${String(ones.length)} level-1 headings`,
            'a screen exposes exactly one level-1 heading naming it, or a reader navigating by ' +
              'heading cannot answer *where am I* — `docs/36` AX-15',
          ),
        );
      }
      for (const node of headings.filter((heading) => heading.name === '')) {
        out.push(
          finding(
            screen,
            'screen-heading',
            `empty heading at level ${String(node.level ?? 0)}`,
            'an empty heading is a stop on the heading tour that says nothing',
          ),
        );
      }
      /* Skipped levels, read in tree order — h1 → h3 leaves a reader guessing what the h2 was. */
      let previous = 0;
      for (const node of headings) {
        const level = node.level ?? 0;
        if (previous !== 0 && level > previous + 1) {
          out.push(
            finding(
              screen,
              'screen-heading',
              `level ${String(previous)} → ${String(level)} at ${node.name.slice(0, 40)}`,
              'the heading outline skips a level, so the tour implies a section that is not there',
            ),
          );
        }
        previous = level;
      }
      return out;
    },
  },
  {
    id: 'main-landmark-named',
    of: (tree, screen) => {
      const mains = tree.filter((node) => node.role === 'main');
      if (mains.length !== 1) {
        return [
          finding(
            screen,
            'main-landmark-named',
            `${String(mains.length)} exposed main landmarks`,
            'exactly one main landmark is exposed at a time; the world without the page is covered',
          ),
        ];
      }
      return mains[0]?.name === ''
        ? [
            finding(
              screen,
              'main-landmark-named',
              'main with no name',
              'the landmark list is the other way a non-visual reader navigates, and twenty-one ' +
                'entries all reading *main* is a list that has stopped being navigation',
            ),
          ]
        : [];
    },
  },
  {
    id: 'covered-world-silent',
    of: (tree, screen) =>
      tree
        .filter((node) => ENGINEER_MARKERS.some((marker) => node.name === marker))
        .map((node) =>
          finding(
            screen,
            'covered-world-silent',
            `${node.role} "${node.name}"`,
            'the Engineer surface is in the accessibility tree while Everyday Mode has the page. ' +
              'Both roots are covered and neither is hidden — `inert` is what keeps the covered ' +
              'one out of the tree, and a reader who can reach it can reach a whole product the ' +
              'player cannot see',
          ),
        ),
  },
  {
    id: 'live-region-politeness',
    of: (tree, screen) =>
      tree
        .filter((node) => node.live === 'assertive')
        .map((node) =>
          finding(
            screen,
            'live-region-politeness',
            `${node.role} region is assertive`,
            'an assertive live region interrupts whatever the reader is in the middle of. Nothing ' +
              'this product says about a simulated day is an emergency, and `docs/36` AX-3 asks ' +
              'for a policy rather than for volume',
          ),
        ),
  },
  {
    id: 'disabled-says-why',
    of: (tree, screen) =>
      tree
        .filter((node) => node.disabled && node.description === '')
        /*
         * **An `option` of a disabled `combobox` is excluded, and the exclusion is measured rather
         * than assumed.** Chromium propagates `disabled` from a `<select>` down to every `<option>`
         * in the accessibility tree and does **not** propagate `aria-describedby`, so the Workshop's
         * five inert selects arrived here as sixty-five findings about controls no reader ever
         * lands on: an option is read as part of its combobox's list, and a disabled combobox is not
         * opened. That is an artefact of the tree's shape, not a defect in the product, and sixty-
         * five copies of one real finding would have buried it.
         *
         * Say the cost: if an option is ever disabled **inside an enabled** combobox — a choice a
         * player can see and not take — this rule will not ask why, and nothing else will either.
         * No such option exists today (every disabled option in the tree is a child of a disabled
         * select), and this sentence is what the next author needs if that changes.
         */
        .filter((node) => node.role !== 'option')
        .map((node) =>
          finding(
            screen,
            'disabled-says-why',
            `${node.role} "${node.name.slice(0, 60)}"`,
            'a disabled control announces as dimmed with no reason. A sighted player reads the ' +
              'sentence beside it; a reader on the control hears only that it will not work',
          ),
        ),
  },
]);

/* ========================================================================== *
 * The register — findings recorded rather than fixed
 * ========================================================================== */

/**
 * What the walkthrough found and this commit did **not** fix, with the reason and the owner.
 *
 * Asserted three ways, on `honesty.test.ts`'s precedent: nothing outside it may fail, everything in
 * it must still be found, and a negative control so a predicate that matched everything could not
 * satisfy the first two at once.
 *
 * Both entries are on one screen each and are matched by `ruleId` + `screen` + a fragment of the
 * subject, never by a count — the count of disabled cells on a campaign calendar is a function of
 * which day the fixture is on, and a ratchet over it would fire for a reason nobody can act on.
 */
const OUTSTANDING: readonly {
  readonly ruleId: string;
  readonly screen: EverydayScreen;
  /** A fragment of {@link Finding.at}; the stable part of it. */
  readonly atContains: string;
  readonly finding: string;
}[] = Object.freeze([
  {
    ruleId: 'disabled-says-why',
    screen: 'contract',
    atContains: 'button "day ',
    finding:
      'The month grid draws one `<button>` per day of a twenty-day contract and disables every day ' +
      'that is not a legal start. Nineteen of them announce as `day 7, button, dimmed` and carry ' +
      'no description: `campaignModel.ts#cellFor` gives the `works`, `missed` and `cleared` states ' +
      'a suffix on the tip and gives `ahead` none, because there is nothing to say about a day ' +
      'that has not happened. Recorded rather than fixed because the remedy needs a new ' +
      'player-facing sentence, and because the cheaper remedy — `aria-hidden` on a future day, or ' +
      'drawing it as text rather than a button — is `docs/36` AX-0 exactly: discharging a clause ' +
      'by deleting its subject. Which of the two it should be is a decision about whether a future ' +
      'day is a control at all, and that belongs with whoever owns § 8.4 of the campaign. Owner: ' +
      'GitHub issue #239’s remaining clauses, `docs/36` AX-16.',
  },
  {
    ruleId: 'disabled-says-why',
    screen: 'contract',
    atContains: 'button "L',
    finding:
      'The works shop draws thirteen unaffordable or out-of-order tiers as disabled buttons with no ' +
      'description — and each one **does** say why, in the last phrase of its own name: `L2 Better ' +
      'sensors 9 u · 1n Doors stop re-opening for people who were not coming. needs level 1 ' +
      'first`. So the reason reaches a reader, and it reaches them after ninety-odd characters of ' +
      'cost and effect. Recorded rather than fixed because moving `everyday-contract-tier-state` ' +
      'out of the button and into a description would change what a sighted player sees, which is ' +
      'a design decision this lane may not take; and because a rule that accepted *the reason is ' +
      'somewhere in the name* would accept every long button in the product. Owner: the same. This ' +
      'entry is the argument for reading the register rather than the count — it is a real finding ' +
      'and it is not a real defect.',
  },
]);

/** Whether this entry is the one that finding is about. One place, so the two directions agree. */
function entryMatches(known: (typeof OUTSTANDING)[number], found: Finding): boolean {
  return (
    known.ruleId === found.ruleId &&
    known.screen === found.screen &&
    found.at.includes(known.atContains)
  );
}

const isRegistered = (found: Finding): boolean =>
  OUTSTANDING.some((known) => entryMatches(known, found));

const describeFinding = (found: Finding): string =>
  `${found.screen}: ${found.ruleId} at ${found.at} — ${found.detail}`;

/* ========================================================================== *
 * Driving the page
 * ========================================================================== */

let site: ShippedSite;
let browser: Browser;
let origin: string;

beforeAll(async () => {
  if (!HAS_BROWSER) return;
  // The artifact players load, and not a `vite dev` server — GitHub issue #281, § D425.
  site = await startShippedSite({ preview: { port: 5311, strictPort: false } });
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

/**
 * The screens the SC 2.4.11 case drives, and why it is a subset rather than all twenty-one.
 *
 * Ninety presses of <kbd>Tab</kbd> with two animation frames between them costs seconds a screen,
 * and a case that also has to reach the report has a day to simulate first. These five are the ones
 * with a scrolling screen region *and* content past the fold: the Workshop and the works shop are
 * the two longest screens in the product, the report and the week are the two that grow with a run,
 * and the stage is the screen a player spends the day on. Naming the subset is the honest form — a
 * case that claimed twenty-one and drove five would be the coverage hole this file exists to close,
 * one file over.
 */
const OBSCURING_SCREENS: readonly EverydayScreen[] = Object.freeze([
  'workshop',
  'contract',
  'report',
  'week',
  'stage',
]);

/**
 * **The one SC 2.4.11 finding, recorded rather than fixed, with its mechanism measured.**
 *
 * The Workshop's left column is `aside.everyday-workshop-panel`, `position: sticky; top: 0`, and it
 * is **1 525 px tall inside a 675 px scrollport**. A sticky box taller than the scrollport does not
 * move: it pins at its offset and the 850 px below the fold stay below it, whatever the region
 * scrolls. Measured rather than reasoned:
 *
 * - focusing the fourth *style* card moves `main.everyday-screen`'s `scrollTop` to 71 and leaves the
 *   card at `top: 838, bottom: 915` in a 900 px viewport, with the pinned action bar over it from
 *   844 down;
 * - `scrollIntoView({ block: 'center' })` on the sixth card scrolls the region to 639 and moves that
 *   card *further away*, to `top: 1027`;
 * - sweeping the region's whole scroll range, the card stays at 1 027 until `scrollTop` passes about
 *   1 560, at which point the containing block finally unsticks the panel and it comes into view.
 *
 * So the controls are **reachable** — this is not a control drawn out of reach — and they are not
 * reachable *at the moment focus lands on them*, which is precisely what the criterion is about.
 *
 * **Recorded rather than fixed because every remedy is a design decision.** Making the panel static
 * loses the following-the-scroll behaviour it was given; bounding it with `max-height` and
 * `overflow-y: auto` puts a second scrollbar inside the screen; splitting the column changes the
 * Workshop's layout. `docs/36` § 8 item 2 handles `tapping-foot` the same way — the floor is set and
 * the remedy is left to whoever owns the surface — and `AX-0` rules out the cheapest answer, which
 * is to stop drawing the three cards. Owner: `docs/36` AX-11, GitHub issue #239.
 *
 * Written as the expected value of the case rather than as a filter, so the two directions are one
 * assertion: a new obscured control fails, and this one ceasing to reproduce fails too.
 */
const OBSCURED_OUTSTANDING: Readonly<Partial<Record<EverydayScreen, readonly string[]>>> =
  Object.freeze({
    workshop: Object.freeze([
      'button.everyday-workshop-style takes focus while its box is outside the viewport and ' +
        'div.everyday-bar is drawn over its centre',
    ]),
  });

/** Every screen's tree, filled in by the per-screen cases and read by the ghost check. */
const walked = new Map<EverydayScreen, readonly Finding[]>();

describe.skipIf(!HAS_BROWSER)('a walkthrough of the accessibility tree — GitHub issue #406', () => {
  it.each([...EVERYDAY_SCREENS_BUILT])(
    'the %s screen’s tree holds nothing the register does not already name',
    async (screen) => {
      const open = EVERYDAY_SCREEN_ROUTES[screen];
      expect(
        open,
        `no route to the ${screen} screen. Every key screens.ts builds needs one, or this ` +
          'walkthrough is a claim about the screens somebody remembered.',
      ).toBeDefined();

      const page = await coldLoad();
      await open(page);
      const tree = await treeOf(page);
      await page.close();

      expect(
        tree.length,
        `the ${screen} screen exposed no accessibility tree at all, so every rule below is ` +
          'vacuous of it. That is a broken route or a broken CDP session, not a clean screen.',
      ).toBeGreaterThan(20);

      const found = RULES.flatMap((rule) => rule.of(tree, screen));
      walked.set(screen, found);

      expect(
        found.filter((each) => !isRegistered(each)).map(describeFinding),
        `the ${screen} screen’s accessibility tree breaks a rule OUTSTANDING does not name. Fix ` +
          'it, or record it there with the reason and the owner — and do not narrow RULES, which ' +
          'is meeting a criterion by weakening it.',
      ).toEqual([]);
    },
    120_000,
  );

  it('still finds every violation the register records — a register of ghosts is a suppression list', () => {
    expect(
      [...EVERYDAY_SCREENS_BUILT].filter((screen) => !walked.has(screen)),
      'these screens were never walked, so this case would be asserting over a partial run',
    ).toEqual([]);

    for (const known of OUTSTANDING) {
      expect(
        [...walked.values()].flat().some((found) => entryMatches(known, found)),
        `the walkthrough no longer finds ${known.ruleId} at ${known.atContains} on the ` +
          `${known.screen} screen. If it was fixed, delete the OUTSTANDING entry; if the ` +
          'walkthrough stopped being able to see it, that is the defect this assertion exists to ' +
          'catch.',
      ).toBe(true);
    }
  });

  it('negative control: the rules fire, and the register accepts nothing it does not name', async () => {
    /*
     * Three mutations of the product's own DOM rather than an injection — `accessibilitySweep`'s
     * argument, measured there: an appended node lands outside the shell's clipping rectangle and
     * is correctly reported as hidden. Each takes one thing away that a rule is about, so a run in
     * which the rules had silently stopped seeing the tree cannot be green.
     */
    const page = await coldLoad();
    await leaveTutorialIfOffered(page);
    const before = await treeOf(page);
    const clean = RULES.flatMap((rule) => rule.of(before, 'menu'));
    expect(
      clean.map(describeFinding),
      'the menu screen is not clean before the mutation, so the comparison below says nothing',
    ).toEqual([]);

    const mutated = await page.evaluate(() => {
      /*
       * **The tag is deliberately not in these two selectors**, and it is not style. A quoted
       * `main` followed by a dot and a word is the shape `menu/screens.test.ts` scans this tier
       * for — an Engineer menu affordance id, of which `free-play` is one — so a selector written
       * that way is read there as *a menu row this file presses that no screen produces*, and that
       * guard goes red about a CSS selector. It is the false positive that file's own docstring
       * anticipates one dot over, and it caught this file twice: once for the selector and once for
       * the first draft of this comment, which quoted the shape while explaining it. A class
       * selector matches exactly the same element and does not carry the shape at all.
       */
      const region = document.querySelector<HTMLElement>('.everyday-screen');
      const heading = document.querySelector<HTMLElement>('.everyday-screen h1');
      const control = document.querySelector<HTMLElement>('.everyday-rail-settings');
      if (region === null || heading === null || control === null) return false;
      region.removeAttribute('aria-label');
      heading.remove();
      control.replaceChildren();
      control.setAttribute('disabled', '');
      return true;
    });
    expect(
      mutated,
      'the three elements this case mutates are not in the page, so nothing was taken away and ' +
        'the assertions below would be about an unmutated screen',
    ).toBe(true);

    const damaged = await treeOf(page);
    const after = RULES.flatMap((rule) => rule.of(damaged, 'menu'));
    await page.close();
    const ids = new Set(after.map((each) => each.ruleId));
    expect(
      [...ids].sort(),
      'the mutation took the landmark’s name, the screen’s only h1 and a rail row’s name away, ' +
        'and disabled that row with no reason. Every one of those is a rule above, and a rule that ' +
        'does not fire here is a rule that is not connected to the tree.',
    ).toEqual(['disabled-says-why', 'every-control-named', 'main-landmark-named', 'screen-heading']);
    /*
     * `honesty.test.ts`'s third assertion in this register's terms: an `isRegistered` that returned
     * `true` for everything would satisfy both directions above whatever OUTSTANDING held.
     */
    expect(after.filter((each) => !isRegistered(each))).not.toEqual([]);
  }, 120_000);

  /**
   * **A live region is written when its sentence changes, and at no other time** — `docs/36`
   * `AX-3`, [§ D592](../../../../DECISIONS.md).
   *
   * `docs/36` § 3.2 names the stage's alarm strip as *"the clearest example in the product of why
   * this standard exists"* and `docs/28` AD-A3 had named it before that: `alarm.replaceChildren(...)`
   * ran on every frame the alarm was up, which on a `role="status"` region is a reader talking over
   * the player for as long as the trouble lasts. No visual test can see it, and the axe sweep cannot
   * either — a region that announces too often is perfectly well formed.
   *
   * **Measured as a sequence, not a count.** A `MutationObserver` over the stage's three
   * announcement regions records what each one said at each write; the property is that **no two
   * consecutive writes to one region say the same thing**. A count would need a frame rate to
   * compare against, and a frame rate is a property of the machine.
   *
   * ## The fixture is three deliberate choices, and the first draft of this case was vacuous
   *
   * Written first against `midtown-office` at the default speed, this case **passed with the defect
   * in place**, which is the more useful half of it. Measured on that run: the alarm never came up
   * (`display:none` for all 180 frames, so nothing was written), the stamp was the empty string and
   * Chromium queues no mutation for `textContent = ''` on an element that has no children, and the
   * description — the one region that was already guarded — wrote twice. A green run over a defect
   * nobody could reach.
   *
   * So the fixture reaches the two states on purpose:
   *
   * 1. **`vertical-city`**, because its morning actually goes wrong. Measured with the guards
   *    reverted: the alarm strip is up for 28 of 300 frames and is rewritten on every one of them.
   *    `midtown-office` never raises it; `mixed-use-high-rise` does.
   * 2. **The last speed chip**, so the playhead covers the whole day rather than its first ninety
   *    seconds. The run reaches its end inside this case either way, so the alarm's window is
   *    traversed whatever the frame rate is.
   * 3. **One intervention pressed**, because the stamp is empty until there is something to stamp.
   *    With the guards reverted that write repeats **91 times** on this fixture — the same sentence,
   *    once a frame, for the rest of the day.
   *
   * Both regions are required to have been written at least once, so this cannot quietly go vacuous
   * again. If a demand change means `vertical-city` stops raising an alarm, that assertion fails and
   * the fix is a fixture that does — never deleting the requirement.
   *
   * ## Two properties, because one of the two regions needed both
   *
   * *No consecutive repeat* is `AX-3` read literally, and it is the whole answer for the stamp.
   * It is **not** the whole answer for the alarm: `stageScreenModel.ts#stageAlarmOf` carries a live
   * count, so its sentence genuinely changes on most frames and a region that obeyed the letter of
   * the clause would still be talking continuously. So this case also measures the **cadence** — no
   * two writes to the announcement closer than `stageScreen.ts`'s `STAGE_ANNOUNCE_MS`. The floor
   * asserted here is deliberately looser than that constant, because a scheduler that runs a frame
   * late is not a defect and a red that means *the box was busy* is a red people learn to ignore.
   */
  it('writes an announcement region only when its sentence changes — AX-3', async () => {
    const page = await openPage(browser, { viewport: { width: 1440, height: 900 } });
    /* A pinned building and seed, so what the regions say is the same run every time. */
    await page.goto(`${origin}?building=vertical-city&seed=424242`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>('.menu-overlay')?.hidden === true,
      undefined,
      { timeout: 30_000 },
    );
    await EVERYDAY_SCREEN_ROUTES.stage(page);

    const said = await page.evaluate(async () => {
      /*
       * The three regions that announce. `.everyday-stage-alarm` is deliberately **not** among them
       * any more: it is the visible strip and carries no `role`, and its announcement is the hidden
       * sibling below it. A case that went on watching the strip would be measuring a picture.
       */
      const regions = [
        '.everyday-stage-alarm-say',
        '.everyday-stage-stamp',
        '.everyday-stage-description',
      ];
      const writes: { region: string; text: string; at: number }[] = [];
      const observers = regions.map((selector) => {
        const node = document.querySelector(selector);
        if (node === null) return undefined;
        const observer = new MutationObserver(() => {
          writes.push({
            region: selector,
            text: (node.textContent ?? '').trim(),
            at: performance.now(),
          });
        });
        observer.observe(node, { childList: true, characterData: true, subtree: true });
        return observer;
      });
      /* § 4.6's fastest rung, so the playhead crosses the whole morning inside this case. */
      const speeds = [...document.querySelectorAll<HTMLElement>('.everyday-stage-speed')];
      speeds[speeds.length - 1]?.click();
      document.querySelector<HTMLElement>('.everyday-stage-start')?.click();
      /* § 7.6's own control, pressed the way a player does — the stamp says nothing until one is. */
      const pressable = [
        ...document.querySelectorAll<HTMLButtonElement>('.everyday-stage-intervene'),
      ].filter((button) => !button.disabled);
      pressable[0]?.click();
      let frames = 0;
      let alarmUpFrames = 0;
      await new Promise<void>((done) => {
        const tick = (): void => {
          frames += 1;
          if (
            document.querySelector<HTMLElement>('.everyday-stage-alarm')?.style.display !== 'none'
          ) {
            alarmUpFrames += 1;
          }
          if (frames >= 300) {
            done();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      for (const observer of observers) observer?.disconnect();
      return {
        frames,
        alarmUpFrames,
        pressed: pressable.length,
        writes,
        present: regions.filter((selector) => document.querySelector(selector) !== null),
      };
    });
    await page.close();

    expect(
      said.present,
      'the stage did not draw its three announcement regions, so this case is about nothing',
    ).toEqual([
      '.everyday-stage-alarm-say',
      '.everyday-stage-stamp',
      '.everyday-stage-description',
    ]);
    expect(
      said.frames,
      'the stage rendered no frames, so nothing could have been written too often',
    ).toBeGreaterThan(60);
    expect(
      said.pressed,
      'no intervention was pressable on this fixture, so the stamp stays empty and half of this ' +
        'case measures nothing. Restore a fixture whose § 7.6 controls are live.',
    ).toBeGreaterThan(0);
    expect(
      said.alarmUpFrames,
      'the alarm strip never came up on this fixture, so the region `docs/36` § 3.2 names as the ' +
        'clearest example of AX-3 was never written and this case would be green over the defect. ' +
        'That is exactly how its first draft passed. Point it at a building whose morning goes ' +
        'wrong — never delete this assertion.',
    ).toBeGreaterThan(0);

    const written = [...new Set(said.writes.map((write) => write.region))].sort();
    expect(
      written,
      'both of the regions this case exists for have to have been written at least once, or the ' +
        'sequence below is empty and proves nothing',
    ).toContain('.everyday-stage-alarm-say');
    expect(written).toContain('.everyday-stage-stamp');

    const repeats: string[] = [];
    const last = new Map<string, string>();
    for (const write of said.writes) {
      if (last.get(write.region) === write.text) {
        repeats.push(`${write.region} re-announced "${write.text.slice(0, 60)}" unchanged`);
      }
      last.set(write.region, write.text);
    }
    expect(
      [...new Set(repeats)],
      `over ${String(said.frames)} frames the stage wrote an announcement region without its ` +
        'sentence having changed. `aria-live` re-reads on every write, so that is a screen reader ' +
        'talking over the player — `docs/36` AX-3, and `docs/28` AD-A3 before it. The guard is ' +
        "`stageScreen.ts`'s `alarmSaid` and `stampSaid`; do not fix this by taking role=status " +
        'off the announcement, which is AX-0 exactly.',
    ).toEqual([]);

    /*
     * The cadence half. `STAGE_ANNOUNCE_MS` is 2 000; 1 200 is the floor asserted, so a frame
     * arriving late cannot turn a correct rate limit into a red. A region written every frame
     * reads about 16 ms apart, so the gap between *correct* and *the defect* is two orders of
     * magnitude and nothing about this floor is finely balanced.
     */
    const tooSoon: string[] = [];
    const saidAt = new Map<string, number>();
    for (const write of said.writes) {
      /*
       * **An empty write is a clearing, not an announcement, and is exempt.** When the queue drains
       * the alarm's region is emptied so a reader who arrives later is not told about trouble that
       * has passed — and a region emptied to `''` says nothing to anybody, so charging it against
       * the cadence would be counting a silence as speech. Measured: without this clause the case
       * is red on *"announced again 171 ms later"*, which is exactly that clearing landing behind
       * the last real sentence.
       */
      if (write.text === '') continue;
      const previous = saidAt.get(write.region);
      if (previous !== undefined && write.at - previous < 1_200) {
        tooSoon.push(
          `${write.region} announced again ${String(Math.round(write.at - previous))} ms later`,
        );
      }
      saidAt.set(write.region, write.at);
    }
    expect(
      [...new Set(tooSoon)],
      'an announcement region was written twice inside the cadence `STAGE_ANNOUNCE_MS` sets. The ' +
        'alarm needs this half as well as the equality guard, because its sentence carries a live ' +
        'count and therefore really does change on most frames — `docs/36` AX-3, and ' +
        '`stageScreen.ts`’s `alarm` docstring for why the strip and the announcement are two ' +
        'elements.',
    ).toEqual([]);
  }, 120_000);

  /**
   * **WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum), measured** — `docs/36` § 1.2 and § 5.3 both
   * record it as unmeasured, and § 1.2 prices it as *"Small. One browser check"*.
   *
   * Tab through each screen from the top of the document, and require every stop to be at least
   * partly inside the viewport and its centre not covered by something else. `elementFromPoint` at
   * the centre is the check, because the pinned action bar and the rail are ordinary elements: if
   * the point belongs to a different subtree, the focused control is behind it.
   *
   * **Its own limits, stated.** SC 2.4.11 asks that the focused item is not *entirely* hidden, and
   * this case is stricter — it fails a control whose centre is covered even when a sliver shows. The
   * stricter reading is the one `docs/36` AX-11 writes (*"Focus is always visible and is never
   * obscured by pinned chrome"*), and the one finding it produces fails the criterion's own weaker
   * reading too: two of the three controls are entirely below the region.
   */
  it.each([...OBSCURING_SCREENS])(
    'every focus stop on the %s screen is visible and not covered — SC 2.4.11',
    async (screen) => {
      const page = await coldLoad();
      await EVERYDAY_SCREEN_ROUTES[screen](page);
      /* Start where a reader arriving does, rather than wherever the route's last click left it. */
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        document.body.focus();
      });
      const obscured: string[] = [];
      const seen = new Set<string>();
      let stops = 0;
      for (let press = 0; press < 90; press += 1) {
        await page.keyboard.press('Tab');
        /* Two frames, so a focus-driven scroll has settled before the box is read. */
        await page.evaluate(
          () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
        );
        const here = await page.evaluate(() => {
          const node = document.activeElement as HTMLElement | null;
          if (node === null || node === document.body) return undefined;
          const box = node.getBoundingClientRect();
          const x = Math.min(Math.max(box.left + box.width / 2, 1), window.innerWidth - 1);
          const y = Math.min(Math.max(box.top + box.height / 2, 1), window.innerHeight - 1);
          const over = document.elementFromPoint(x, y);
          const behind =
            over === null || node.contains(over) || over.contains(node)
              ? ''
              : `${over.tagName.toLowerCase()}.${String(over.className).split(/\s+/u)[0] ?? ''}`;
          return {
            at: `${node.tagName.toLowerCase()}.${String(node.className).split(/\s+/u)[0] ?? ''}`,
            offscreen: box.bottom > window.innerHeight || box.top < 0,
            behind,
          };
        });
        if (here === undefined) break;
        stops += 1;
        if (!here.offscreen && here.behind === '') continue;
        /*
         * Both facts, never the first one that happens to be true: the Workshop's three cards are
         * below the fold **and** behind the pinned bar, and a message that named only one of them
         * would send the next reader after the wrong mechanism.
         */
        const why = [
          here.offscreen ? 'its box is outside the viewport' : '',
          here.behind === '' ? '' : `${here.behind} is drawn over its centre`,
        ]
          .filter((clause) => clause !== '')
          .join(' and ');
        const said = `${here.at} takes focus while ${why}`;
        /* One line per distinct control-and-reason, not one per press: focus revisits. */
        if (seen.has(said)) continue;
        seen.add(said);
        obscured.push(said);
      }
      await page.close();

      expect(
        stops,
        `<kbd>Tab</kbd> reached nothing on the ${screen} screen, so this case asserts nothing ` +
          'about it. A screen with no focus stop at all is either a broken route or a screen no ' +
          'keyboard reader can use.',
      ).toBeGreaterThan(0);
      expect(
        obscured,
        `a control on the ${screen} screen took focus where the player cannot see it. This is ` +
          'WCAG 2.2 SC 2.4.11, and it is also just a defect: a focused control nobody can see is ' +
          'a control they have lost. OBSCURED_OUTSTANDING carries the instances measured on ' +
          '2026-09-15 with their mechanism — a finding that has stopped reproducing must come out ' +
          'of it, and a new one may not go into it without the same measurement.',
      ).toEqual(OBSCURED_OUTSTANDING[screen] ?? []);
    },
    120_000,
  );

  it('has a route for every screen the registry builds, and none for a screen it does not', () => {
    expect(Object.keys(EVERYDAY_SCREEN_ROUTES).sort()).toEqual([...EVERYDAY_SCREENS_BUILT].sort());
    /*
     * And every built screen has the word the landmark name is drawn from. `SCREEN_NAMES` is keyed
     * over the whole inventory rather than over what is built, so this is one direction only —
     * asserting equality would fail the day a screen leaves the registry with its name still
     * written, which is a state `screens.ts` deliberately allows.
     */
    expect(
      [...EVERYDAY_SCREENS_BUILT].filter((screen) => (SCREEN_NAMES[screen] ?? '') === ''),
      'a screen the registry builds has no name in SCREEN_NAMES, so `shell.ts` would label its ' +
        'main landmark with nothing and the walkthrough’s main-landmark-named rule would fail on it',
    ).toEqual([]);
    /* The obscuring subset is a subset of what is built, or it drives a screen that is not there. */
    expect(
      OBSCURING_SCREENS.filter((screen) => !EVERYDAY_SCREENS_BUILT.includes(screen)),
    ).toEqual([]);
  });
});
