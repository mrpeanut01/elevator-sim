/**
 * **What the Scenario hub's press is wired to, checked where a browser is not needed** —
 * [§ D787](../../../../DECISIONS.md).
 *
 * `vitest.config.ts` sets `environment: 'node'` for every project and there is no jsdom here, so
 * the press itself is driven in `everyday/scenarioScreen.browser.test.ts` against the built bundle.
 * This file holds the three claims that are decidable without a document, and each one is a
 * sentence somewhere in the tree that would otherwise be true only until somebody moved something:
 *
 * 1. **The port behaves as its docstring says** — absent until provided, replaceable, and honest
 *    about a stage it cannot open.
 * 2. **`dev/main.ts` hands the opener over before the path.** `everyday/scenarioOpenPort.ts` claims
 *    that ordering as the reason a drawn row always has a live opener, and a claim about a boot's
 *    statement order is exactly the kind that survives the statement being moved. Read off disk.
 * 3. **`shell.ts`'s caller census for `enterEngineer` is true in both directions.** That docstring
 *    read *"Its one non-test caller is `everyday/reportScreen.ts`'s lever button"* for a wave after
 *    this screen became the second, which is `CLAUDE.md`'s *name the non-test caller* failing the
 *    way `deadCode.test.ts` has caught twice before. Naming callers correctly once is not the fix;
 *    deriving the set from disk is.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { SCENARIO_LADDER_COPY } from '../scenario/ladder.js';

const VIZ_SRC = fileURLToPath(new URL('..', import.meta.url));

function source(relative: string): string {
  return readFileSync(`${VIZ_SRC}${relative}`, 'utf8');
}

describe('the opener port', () => {
  it('is absent until something provides one, and answers with the port after', async () => {
    /*
     * A fresh module registry rather than a reset function on the port: the port deliberately has
     * no withdrawal (nothing in the shipped page tears the campaign panel down, and an unused
     * export is the dead seam this whole fix exists to stop repeating), so *before anyone provided*
     * is reachable only by loading the module again.
     */
    vi.resetModules();
    const port = await import('./scenarioOpenPort.js');
    expect(port.scenarioOpen()).toBeUndefined();
    const first = { openStage: () => true };
    port.provideScenarioOpen(first);
    expect(port.scenarioOpen()).toBe(first);
    // A re-mounted panel is a new opener, and the last one provided is the one a press reaches.
    const second = { openStage: () => false };
    port.provideScenarioOpen(second);
    expect(port.scenarioOpen()).toBe(second);
  });
});

describe('the boot hands the opener over before the path', () => {
  it('provides the opener earlier in dev/main.ts than the ladder it opens', () => {
    const main = source('dev/main.ts');
    const opener = main.indexOf('provideScenarioOpen({');
    const ladder = main.indexOf('provideScenarioLadderFrom(loaded.campaign.stages');
    expect(opener, 'dev/main.ts no longer provides the scenario opener').toBeGreaterThan(-1);
    expect(ladder, 'dev/main.ts no longer provides the scenario ladder').toBeGreaterThan(-1);
    /*
     * The whole of the guarantee `everyday/scenarioOpenPort.ts` states: the hub draws no row until
     * the ladder arrives, so handing the ladder over last is what makes *a drawn row always has a
     * live opener* true by construction. Reversing these two statements is a one-line tidy-up that
     * nothing else in the tree would notice.
     */
    expect(opener, 'the ladder is handed over before the thing that opens it').toBeLessThan(ladder);
    // Both inside the one `loadCampaign` resolution, so neither can be reached without the other.
    const resolution = main.indexOf('void loadCampaign(resources)');
    expect(resolution).toBeGreaterThan(-1);
    expect(resolution).toBeLessThan(opener);
  });

  it('presses the swap before the opener, because the opener takes focus', () => {
    /*
     * `everyday/reportScreen.ts`'s lever button established the order and the reason: the swap
     * clears the `inert` this shell holds over the Engineer surface, so what runs after it lands on
     * a live control. The opener's second half is `context.openTab('campaign')`, which focuses the
     * tab — a focus into an `inert` subtree goes nowhere and leaves no error behind it.
     */
    const screen = source('everyday/scenarioScreen.ts');
    const swap = screen.indexOf('context.enterEngineer();');
    const open = screen.indexOf('scenarioOpen()?.openStage(row.id);');
    expect(swap).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(-1);
    expect(swap).toBeLessThan(open);
  });
});

describe('shell.ts names the callers of enterEngineer, in both directions', () => {
  /**
   * Every shipped module that calls the seam, derived from disk — **with the comments stripped
   * first**, which is not a nicety.
   *
   * The first draft of this function searched the whole file and reported three callers: the two
   * real ones and `everyday/scenarioOpenPort.ts`, whose docstring quotes `context.enterEngineer()`
   * while explaining why it exists. A census that counts prose is the same defect as a census that
   * is out of date — this directory's own `{@link}` tags and barrel re-exports are what `CLAUDE.md`
   * warns *look exactly like a caller and are not one*, and a docstring is the third shape of that.
   *
   * `shell.ts` is excluded because it declares and implements the function and wires the rail's own
   * footer row to it, which is not a call through a screen's context.
   */
  function callers(): readonly string[] {
    const code = (text: string): string =>
      text.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/[^\n]*/gu, '');
    return readdirSync(`${VIZ_SRC}everyday`)
      .filter((name) => name.endsWith('.ts') && !name.includes('.test'))
      .filter((name) => name !== 'shell.ts')
      .filter((name) => code(source(`everyday/${name}`)).includes('context.enterEngineer()'))
      .sort();
  }

  it('has exactly the two callers its docstring names', () => {
    expect(callers()).toEqual(['reportScreen.ts', 'scenarioScreen.ts']);
  });

  it('names each of them in the seam’s own docstring', () => {
    /*
     * The half that made the old sentence wrong was not the list, it was the **count**: it read
     * *"Its one non-test caller is …"* while there were two. So both halves are checked — every
     * caller on disk appears in the docstring, and the docstring still opens its census with the
     * plural sentence rather than a singular one that a second caller would falsify.
     *
     * A bare *the docstring must not contain the old wording* was written first and is not what
     * landed: the corrected paragraph **quotes** the old sentence, because a decision entry and a
     * docstring both record what was wrong rather than erasing it, and a check that forbade the
     * quotation would forbid keeping the record.
     */
    const shell = source('everyday/shell.ts');
    const doc = shell.slice(0, shell.indexOf('  enterEngineer(): void;'));
    for (const caller of callers()) {
      expect(doc, `shell.ts does not name ${caller} as a caller`).toContain(caller);
    }
    expect(doc).toContain('Its non-test callers are');
  });
});

describe('the row’s face matches what the press does', () => {
  it('claims this stage rather than the surface — § D787', () => {
    /*
     * The wording is the behaviour's claim: *"Opens this stage"* is false of a press that carries
     * no identity, which is what shipped. `scenarioScreen.browser.test.ts` drives the press; this
     * is the half that goes red if the sentence drifts back while the wiring stays.
     */
    expect(SCENARIO_LADDER_COPY.openNote).toContain('Opens this stage');
  });

  it('sells nothing on the budget line — § D786', () => {
    /*
     * `scenario/ladder.test.ts` holds the full both-directions check over the shipped stages. This
     * is the constant on its own, so a lane editing the copy table meets the rule in the file that
     * owns the screen as well as in the one that owns the reading.
     */
    expect(SCENARIO_LADDER_COPY.baseRungNote).not.toMatch(/\bbought\b|\bchimes?\b|\bcan be bought\b/iu);
    expect(SCENARIO_LADDER_COPY.baseRungNote).toContain('No screen in this build sells');
  });
});
