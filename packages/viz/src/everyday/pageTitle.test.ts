/**
 * **What the browser tab is called** — GitHub issue
 * [#294](https://github.com/mrpeanut01/elevator-sim/issues/294).
 *
 * `index.html` read `Elevator Sim — shift mode` on a page that opens on Everyday Mode. The
 * argument for the title it carries now, and the decision the issue asks to have recorded, are in
 * the HTML comment at the site, which is where the owed-decision marker sits too. This file is the
 * mechanised half.
 *
 * ## Why it reads the file as text
 *
 * `dev/shellChrome.test.ts`'s reason, unchanged: `vitest.config.ts` is `environment: 'node'` for
 * every project, so a claim about the page is a claim about the markup. A `<title>` is the purest
 * case of the shape that file exists for — static markup with no module behind it and no mount to
 * drive. It is also the one piece of chrome that is visible **before the page paints**, which is
 * why nothing that boots can be asked about it.
 *
 * ## Why the check derives the modes rather than listing them
 *
 * The issue's own third criterion is *"fails if it names a mode the menu does not offer"*, and a
 * hand-written list of four tile names is a list that goes stale the wave a fifth tile lands — the
 * § D152 failure, and the failure `RISKS.md` R38 tracks. So the offered set is
 * {@link EVERYDAY_MODES}' own titles plus the world the shell that draws them announces
 * (`rail.ts#railModel`'s `mode`), and both come from the modules the product renders.
 *
 * The two assertions are deliberately separate, because they are not the same claim:
 *
 * 1. **The rule** — no mode the main menu does not offer. That is the issue's criterion, and it
 *    would still pass a title reading `Elevator Sim — everyday mode`.
 * 2. **This build's choice** — the tab carries the wordmark and no world at all, pinned to
 *    `railModel().brand` byte for byte so the two cannot drift. That is stronger than the rule and
 *    is a decision rather than a requirement, which is why it is asserted on its own with its own
 *    reason rather than folded in.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EVERYDAY_MODES } from './modes.js';
import { railModel } from './rail.js';

async function pageTitle(): Promise<string> {
  const html = await readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
  const found = /<title>([^<]*)<\/title>/.exec(html);
  expect(found, 'index.html has no <title>').not.toBeNull();
  return (found?.[1] ?? '').trim();
}

/** The main menu as a player meets it: the tiles it offers, inside the world it announces. */
function menuOffers(): readonly string[] {
  const shell = railModel({ screen: 'menu', ctx: 'daily' });
  return [...EVERYDAY_MODES.map((mode) => mode.title), shell.mode];
}

/**
 * Every phrase in a title that reads as the name of a mode or a world.
 *
 * Two forms, because the defect took the first and the fix has to be safe against the second: an
 * `X mode` phrase — which is how both shells name a world on their own chrome — and any of the
 * product's own tile names appearing verbatim. Case-insensitive, because `SHIFT MODE` and
 * `shift mode` are the same claim written for two different type sizes.
 */
function modesNamedIn(title: string): readonly string[] {
  const phrases = [...title.matchAll(/\b([A-Za-z][\w'-]*)\s+mode\b/gi)].map(
    (found) => `${found[1] ?? ''} mode`,
  );
  const tiles = EVERYDAY_MODES.map((mode) => mode.title).filter((tile) =>
    title.toLowerCase().includes(tile.toLowerCase()),
  );
  return [...phrases, ...tiles];
}

const offers = (named: string): boolean =>
  menuOffers().some((offered) => offered.toLowerCase() === named.toLowerCase());

describe('the browser tab names no world the page does not open on — issue #294', () => {
  it('names no mode the main menu does not offer', async () => {
    const title = await pageTitle();
    for (const named of modesNamedIn(title)) {
      expect(offers(named), `the tab says “${named}” and the main menu does not offer it`).toBe(
        true,
      );
    }
  });

  it('would have caught the title that shipped, and passes the one it would have been swapped for', () => {
    /*
     * The instrument, driven against both. `Elevator Sim — shift mode` is the string at `55f2bca`
     * and `SHIFT MODE` is the Engineer header's own eyebrow — a real world, and the wrong one. The
     * second is the fix somebody reaching for the obvious one would have written; it clears this
     * rule, because the shell the menu is drawn in does announce that world, and it is refused by
     * the case below instead. Two rules, because they refuse different things.
     */
    expect(modesNamedIn('Elevator Sim — shift mode').some(offers)).toBe(false);
    expect(modesNamedIn('Elevator Sim — everyday mode').every(offers)).toBe(true);
    expect(modesNamedIn('Elevator Sim').length).toBe(0);
  });

  it('carries the wordmark both shells already use, and no world at all', async () => {
    /*
     * The decision, pinned. `railModel().brand` is what the Everyday rail calls this product and
     * `index.html`'s `.brand-name` is what the Engineer header calls it; each carries its world on
     * a separate eyebrow beside it, inside the world, where it cannot be wrong. The tab is the one
     * place the app is visible with no world under it, so it gets the half that is true there —
     * and pinning it to the rail's own string means a wordmark that ever changes changes here too.
     */
    const title = await pageTitle();
    expect(title).toBe(railModel({ screen: 'menu', ctx: 'daily' }).brand);
    expect(modesNamedIn(title)).toEqual([]);
  });

  it('is not written at runtime, so the markup is the whole claim', async () => {
    /*
     * The check that keeps this file honest. Every assertion above reads static markup, and all of
     * them would be vacuous the day something started writing `document.title` — the title on
     * screen would be that writer's and no test here would notice. Nothing in `packages/viz/src`
     * does today, which is also the third option's real cost in the decision at the site: it is
     * new machinery rather than a different string.
     */
    const { readdir } = await import('node:fs/promises');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = `${dir}${entry.name}`;
        if (entry.isDirectory()) await walk(`${path}/`);
        else if (path.endsWith('.ts') && !path.includes('.test.')) {
          if ((await readFile(path, 'utf8')).includes('document.title')) found.push(path);
        }
      }
    };
    await walk(root);
    expect(found).toEqual([]);
  });
});
