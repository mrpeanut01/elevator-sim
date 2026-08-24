/**
 * **What the § 7 stage decides on the way in** — GitHub issue **#215**.
 *
 * `stageScreen.ts` is the stage's DOM half and needs a document, so almost everything about it is
 * driven in `stageScreen.browser.test.ts`. One decision it makes is not about pixels at all: whether
 * walking onto the screen should ask the data host for a day. That one is pure, and this file drives
 * it here rather than paying a browser for it — the browser case beside it walks the whole reported
 * route and takes a minute and a half.
 *
 * The two files are deliberately both present. This one says *the rule is right*; the browser one
 * says *the mount obeys it, on the product, over the walk the reporter walked*. Neither substitutes
 * for the other, and the last assertion below is the hinge between them: a pure rule the mount has
 * stopped asking is a rule that passes its own test while the product does the old thing.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stageEntryStartsARun } from './stageScreen.js';

/** The shape `EverydayHost.runState()` hands back, narrowed to what the entry rule reads. */
const runState = (open: boolean, dayClosed: boolean): { open: boolean; dayClosed: boolean } => ({
  open,
  dayClosed,
});

describe('the stage’s entry rule', () => {
  /*
   * § 7.3's own sentence: entering the stage is entering *the player's* day. `open` is false for
   * boot's demo run (§ D232 — nobody chose it) and for a watched or file-loaded run, and in both
   * cases what stands on the stage is somebody else's day.
   */
  it('asks for a day when the player has not got one of their own on the stage', () => {
    expect(stageEntryStartsARun(runState(false, false))).toBe(true);
  });

  it('does not ask for a second day while the player’s own is open', () => {
    expect(stageEntryStartsARun(runState(true, false))).toBe(false);
  });

  /**
   * **The defect, as a rule.**
   *
   * `open` is false for a **filed** day too, so `!open` alone started a run on the way back onto a
   * day that was already finished. `dev/state.ts#startRun` does not re-roll the seed, so that run is
   * bit-identical to the one just filed; `adopt` clears `filedRunId` and re-arms the filing gate;
   * and the next close counts an attempt at a day nobody re-ran. *"attempt 4 at this day"*, one
   * press of *Run*.
   */
  it('does not ask for a day when the one on the stage has been filed', () => {
    expect(stageEntryStartsARun(runState(false, true))).toBe(false);
  });

  /*
   * Belt: `open` is `hasRun && runIsOwn && !dayClosed && playerHasChosen`, so a filed day makes it
   * false by construction and this state is unreachable through the host. It is pinned anyway
   * because the rule reads two independent booleans and must not depend on their correlation —
   * whichever way a future `open` is composed, a filed day starts nothing.
   */
  it('refuses a filed day whatever `open` says about it', () => {
    expect(stageEntryStartsARun(runState(true, true))).toBe(false);
  });

  /**
   * The rule and the mount, pinned to each other.
   *
   * The mount needs a document, so this tier cannot press it; what it can do is refuse to let the
   * call site drift back to the shape that produced the issue. Both halves are asserted — the mount
   * asks {@link stageEntryStartsARun}, and the bare `!host.runState().open` it used to ask is gone
   * — because either one alone passes over a file that does both.
   */
  it('is what the mount asks, and the bare `open` test it replaced is gone', () => {
    const source = readFileSync(fileURLToPath(new URL('./stageScreen.ts', import.meta.url)), 'utf8');
    expect(source).toContain('if (stageEntryStartsARun(host.runState())) host.startRun();');
    expect(source).not.toContain('if (!host.runState().open) host.startRun();');
  });
});
