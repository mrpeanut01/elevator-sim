/**
 * **The wire from § 7.4's picker to a second simulation, pinned where no document is needed** —
 * GitHub issue **#226**, [§ D482](../../../../DECISIONS.md).
 *
 * ## Why this file exists at all
 *
 * The claim this issue turns on is *press the control and the run changes*, and the honest place to
 * make it is on the shipped page: `stageScreen.browser.test.ts`'s `the § 7.4 race` drives the
 * player's own `<select>` and compares the two recordings **on the legs**. That case is the
 * evidence and nothing here replaces it.
 *
 * It is also `describe.skipIf(!HAS_BROWSER)`. A tree with no Chromium runs every node test and skips
 * that one — so on that tree the entire wire could be cut and the suite would stay green, which is
 * the exact shape `CLAUDE.md`'s standing requirement is a list of eleven instances of. This file is
 * the cheap guard against that: it does not prove the run changes, it proves **the call chain that
 * makes it change is still connected**, at every link, with no document and no browser.
 *
 * ## Why it reads source rather than exercising the modules
 *
 * Two of the four links cannot be reached any other way from here. `everyday/stageScreen.ts`'s
 * handler needs a `Document` to be constructed at all, and `dev/main.ts#setGhostPick` lives inside
 * `boot()`'s closure and is exported by nothing — deliberately, because it writes closure state that
 * no module outside may hold. `stageScreen.test.ts` already pins its own mount decision this way and
 * says why: *"a pure rule the mount has stopped asking is a rule that passes its own test while the
 * product does the old thing."*
 *
 * ## What each assertion is actually worth, said plainly
 *
 * A source match is a weak instrument and it is used here for a narrow purpose: it fails on the
 * specific edits that would silently sever the wire — a handler that stops calling the host, a
 * façade method that stops reaching the shell, a binding that records the pick instead of pressing
 * the seam, or a seam that stops issuing the request. It would not notice a rewrite that kept the
 * spellings and changed the meaning. That case is the browser tier's, and this file's own last
 * assertion is the pointer to it: the browser case must exist and must be named.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GHOST_OPTIONS } from '../live/raceStrip.js';

const sourceOf = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const STAGE = sourceOf('./stageScreen.ts');
const HOST = sourceOf('./host.ts');
const MAIN = sourceOf('../dev/main.ts');
const BROWSER_CASE = sourceOf('./stageScreen.browser.test.ts');

describe('the ghost port is wired end to end — issue #226', () => {
  /**
   * **Link 1 — the player's control reaches the façade.**
   *
   * The `<select>`'s `change` handler calls `host.raceAgainst`. A handler that validated the pick
   * and did nothing with it is the shape this repository has shipped eleven times: the screen looks
   * right, the control moves, and the run does not change.
   */
  it('has the stage’s picker call the host, and decide nothing about the rival itself', () => {
    expect(STAGE).toContain("racePicker.addEventListener('change'");
    expect(STAGE).toContain('host.raceAgainst(');
    /*
     * And it reads the rival back through the façade rather than composing one. A screen that
     * reached for `ghostPlanOf` would be importing across the boundary this port exists to keep,
     * and `everyday/boot.ts` already imports `dev/main.ts` — closing that cycle is what produced
     * this directory's last module-init `undefined` (§ D338).
     */
    expect(STAGE).toContain('host.ghostRace()');
    expect(STAGE).not.toContain('ghostPlanOf');
    expect(STAGE).not.toMatch(/from '\.\.\/dev\/(main|ghostRun)\.js'/u);
  });

  /**
   * **Link 2 — the façade reaches the shell, and composes nothing on the way.**
   *
   * Both methods are one expression over the bindings. A `createEverydayHost` that decided which
   * profile the rival runs would be a second answer to `ghostPlanOf`'s question, and the two would
   * drift; `host.test.ts` drives the pass-through, and this is the shape of it.
   */
  it('has the façade pass both halves straight through to the shell’s bindings', () => {
    expect(HOST).toContain('ghostRace: () => b.ghostRace()');
    expect(HOST).toContain('b.raceAgainst(pick)');
    /*
     * And it does not *import* the decision — the docstrings name `ghostPlanOf` because a reader
     * needs to know whose question it is, which is the opposite of holding a second answer to it.
     */
    expect(HOST).not.toMatch(/^import .*ghostRun\.js/mu);
  });

  /**
   * **Link 3 — the shell's binding presses the same seam the Engineer picker presses.**
   *
   * This is the link the issue's own brief warns about most directly. A binding that assigned
   * `ghostPick` and returned would leave a player moving a control that changes a variable and no
   * run. It calls `setGhostPick`, which is the function the Engineer strip's `<select>` calls, so
   * there is one answer to *who is the rival* rather than two that can disagree across § 3.2's door.
   */
  it('has the binding press dev/main’s own seam, not a private copy of it', () => {
    expect(MAIN).toContain('raceAgainst: (pick) => {\n      setGhostPick(pick);\n    },');
    /* The Engineer `<select>` calls the same function — one seam, two controls. */
    expect(MAIN).toContain('setGhostPick(\n        GHOST_OPTIONS.some(');
    /* Exactly one definition of it, so *the same function* is a fact and not a spelling. */
    expect(MAIN.match(/function setGhostPick\(/gu)?.length).toBe(1);
  });

  /**
   * **Link 4 — the seam issues a second simulation.**
   *
   * `setGhostPick` reaches `scheduleGhost`, which is what actually asks `shiftRunner` for the
   * rival's day. Without this line the whole chain above is intact and nothing ever runs — the
   * failure mode `everyday/host.ts` refused a ghost method for two waves to avoid: *"a ghost method
   * with no rival behind it would be worse than none."*
   */
  it('has that seam commission the rival’s day rather than only record the pick', () => {
    const seam = MAIN.slice(MAIN.indexOf('function setGhostPick('));
    const body = seam.slice(0, seam.indexOf('\n  }\n'));
    expect(body).toContain('scheduleGhost(lastShiftPlan, primary)');
    /* And `nobody` is free by construction: the *none* arm returns before the request is made. */
    expect(body).toContain("if (ghostPick === 'none')");
    expect(body.indexOf("if (ghostPick === 'none')")).toBeLessThan(
      body.indexOf('scheduleGhost(lastShiftPlan, primary)'),
    );
  });

  /**
   * **And the end-to-end case exists**, because everything above is a spelling check and says so.
   *
   * Named rather than counted: if that case is renamed the pointer breaks here, which is the correct
   * failure — a lane that deletes the only test comparing two recordings on the legs should not be
   * able to do it while a file whose whole docstring defers to it stays green.
   */
  it('defers to a browser case that presses the control and compares the two runs on the legs', () => {
    expect(BROWSER_CASE).toContain('the § 7.4 race — issue #226');
    expect(BROWSER_CASE).toContain(
      "await page.selectOption('.everyday-stage-ghost', 'plain-baseline')",
    );
    /* The two halves of the comparison, by the names the reading carries them under. */
    expect(BROWSER_CASE).toContain('crowdMatches');
    expect(BROWSER_CASE).toContain('serviceDiffers');
  });

  /**
   * The picker offers the model's own options and no fourth — `GHOST_OPTIONS`, never markup.
   *
   * § 7.4 describes four arms and this build honestly has three: the world's middle needs a
   * distribution nothing in this build posts to (GitHub issue #327), and a board row needs posting
   * (#332). `live/raceStrip.ts` omits both rather than stubbing them, and a stubbed option would be
   * precisely the inert control the rest of this file is about.
   */
  it('builds the picker from the model’s honest three, and authors no option in the mount', () => {
    expect(STAGE).toContain('for (const option of GHOST_OPTIONS)');
    for (const option of GHOST_OPTIONS) {
      expect(STAGE).not.toContain(`'${option.label}'`);
    }
  });
});
