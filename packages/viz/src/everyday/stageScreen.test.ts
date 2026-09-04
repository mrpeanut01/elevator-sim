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
    expect(source).toContain('stageEntryStartsARun(host.runState())) host.startRun();');
    expect(source).not.toContain('if (!host.runState().open) host.startRun();');
  });

  /**
   * **And never on a watch** — GitHub issue #182, § D436.
   *
   * The guard is not a fifth clause of the rule above and is deliberately not asserted through it:
   * the rule answers *does the player need a day of their own*, and on the way into a watch its
   * honest answer is **yes** — `open` is false for somebody else's run by `everyday/host.ts`'s own
   * definition, and `dayClosed` is false. So the rule is right and the call site has to ask a second
   * question, which is § 18's: which flow is this screen serving?
   *
   * Pinned at the source for the same reason the line above it is — this tier has no document, and
   * the consequence of losing this guard is not a wrong pixel: the mount's first act would be
   * `startRun`, simulating the player's own day over the record they had just pressed `Watch it` on.
   * `everyday/watchStage.browser.test.ts` presses the shipped route and reads the result.
   */
  it('does not ask for a day on the way into a watch', () => {
    const source = readFileSync(fileURLToPath(new URL('./stageScreen.ts', import.meta.url)), 'utf8');
    expect(source).toContain(
      "if (context.ctx !== 'watch' && stageEntryStartsARun(host.runState())) host.startRun();",
    );
    /* The unguarded shape, by its own text — either half alone passes over a file that does both. */
    expect(source).not.toContain('if (stageEntryStartsARun(host.runState())) host.startRun();');
  });
});

/**
 * **The cutaway paints the plan, and the inverted arithmetic is gone** — GitHub issue **#212**.
 *
 * The same hinge the entry rule above is pinned by, for the same reason: `stageCarPaintOf` and
 * `stageCarReadoutOf` are pure and are driven hard in `stageScreenModel.test.ts`, and a mount that
 * stopped asking them would leave those rules passing their own tests while the product did the old
 * thing. `stageScreen.browser.test.ts` reads the pixels the mount actually paints; this asserts the
 * call sites, because a pixel case that never ran — no Chromium on the machine — is a silent skip.
 */
describe('what the cutaway paints', () => {
  const source = readFileSync(fileURLToPath(new URL('./stageScreen.ts', import.meta.url)), 'utf8');

  it('asks the model for the car’s rectangles rather than computing leaves itself', () => {
    expect(source).toContain('stageCarPaintOf({');
    expect(source).toContain('for (const leaf of paint.leaves)');
    expect(source).toContain('for (const mark of paint.marks)');
    /*
     * The defect, by its own text: two leaves half the body wide, painted from the outer edges, so
     * a shut car was a solid amber block. Both halves are asserted — the new call site and the
     * absence of the old formula — because either alone passes over a file that does both.
     */
    expect(source).not.toContain('const leaf = ((column.width - 3) / 2) * (1 - car.doorFraction)');
    expect(source).not.toContain('ctx.fillRect(column.x + 1.5, y + 1.5, leaf, carH - 3)');
  });

  it('asks the model for every word the cutaway says, and composes none of them', () => {
    expect(source).toContain('ctx.fillText(STAGE_OUT_OF_SERVICE, 0, 0)');
    expect(source).toContain('stageCarReadoutOf({');
    expect(source).toContain('ctx.fillText(readout.occupancy,');
    expect(source).toContain('ctx.fillText(readout.direction,');
    /* § D347's three: the caption, the live figure and the glyph, none of them composed here. */
    expect(source).not.toContain("'OUT OF SERVICE'");
    expect(source).not.toContain('`${String(car.occupants)}/${String(capacity)}`');
    expect(source).not.toContain("car.direction > 0 ? '▲' : '▼'");
  });

  it('draws the driving eyebrow from the model rather than from a second literal', () => {
    /*
     * Two arms now, and both are read off a model — GitHub issue #182. The player's own is
     * `stageHeaderOf`'s `drivingLabel`, unchanged and still the fallback; the spectator's is
     * `watch/view.ts#WatchingView.dispatcherEyebrow`, which is § 14.1's `THEIR DISPATCHER` and is
     * swept by `watch/view.test.ts`. Neither is a literal in this file, which is what this case has
     * always been about.
     */
    expect(source).toContain('watching?.dispatcherEyebrow ?? head.drivingLabel;');
    expect(source).toContain('STAGE_DRIVING_LABEL');
    /* `stageHeaderOf` already publishes this word and the corpus already sweeps it. */
    expect(source).not.toContain("el(doc, 'span', undefined, 'DRIVING')");
    /* And § 14.1's, likewise — it is the view's cell, never re-typed here. */
    expect(source).not.toContain("'THEIR DISPATCHER'");
  });

  it('takes the overlay’s three sentences from the model too', () => {
    expect(source).toContain('stageOpeningLineOf({');
    expect(source).toContain('STAGE_RECOMPUTING');
    expect(source).toContain('STAGE_AWAITING_RUN');
    /* The mount had re-typed this one as a literal beside the constant it already imported. */
    expect(source).not.toContain("'recomputing the day from the start…'");
    expect(source).not.toContain("'Paused at the start of the day. Nothing has happened yet.'");
  });

  /**
   * **The stale claim this file's own screen carried into an issue body.**
   *
   * `adopt`'s docstring said the transport opens *"at `recording.startedAt`, which is 06:00 on the
   * clock"*. It is the run's own hour — six of the seven shipped templates declare one and the
   * default opens at 08:30 — and the sentence was quoted out of here and filed as #212's second
   * defect before anybody measured it. Pinned so the correction cannot be tidied back out.
   */
  it('does not tell a reader the stage opens at 06:00', () => {
    expect(source).not.toContain('which is 06:00 on the clock');
    expect(source).toContain("the hour is the run's own");
  });
});

/**
 * **Pillar 3's strip, pinned at its call site** — GitHub issue **#277**,
 * [§ D470](../../../../DECISIONS.md).
 *
 * The strip's words and its ungraded projection are `stageScreenModel.ts`' and are driven hard in
 * `stageScreenModel.test.ts`. What that tier cannot see is **which instant the mount asks about**,
 * and on this screen that is the whole feature rather than a detail of it.
 *
 * `EverydayHost.goalsToday()` reads at `EverydayHostBindings.playheadS`, which `dev/main.ts` binds
 * to the **Engineer** transport's playback. That transport is not the one moving while the Everyday
 * shell has the page, so a mount that called `goalsToday()` would draw five figures that never
 * changed — a control that moves and a run that does not, which is the defect this repository's
 * standing requirement exists to catch. Both halves are asserted, because either alone passes over
 * a file that does both.
 */
describe('what the goal strip is read at', () => {
  const source = readFileSync(fileURLToPath(new URL('./stageScreen.ts', import.meta.url)), 'utf8');

  it('asks the host for the goals at this screen’s own playhead', () => {
    expect(source).toContain('readings: host.goalsAt(simTimeS),');
    /* The Engineer transport's instant, by its own text. */
    expect(source).not.toContain('host.goalsToday()');
  });

  it('asks the model for every word the strip says, and composes none of them', () => {
    expect(source).toContain('stageGoalsOf({');
    expect(source).toContain('goalHeading.textContent = strip.heading;');
    expect(source).toContain('goalNote.textContent = strip.note;');
    /*
     * And the verdict is the model's too. A mount that read `row.state` to *decide* met or missed,
     * rather than to pick ink, would be § D371's verdict reintroduced one layer down where no
     * honesty property can reach it — the mount needs a document and is outside the corpus.
     */
    expect(source).not.toContain("=== 'met' ?");
    expect(source).toContain('const ink = GOAL_INK[row.state];');
  });

  /**
   * The run's own last instant, never a constant and never the reporting window's end.
   *
   * § D371's gate is *the playhead reaches `endedAt`*, and `live/observations.ts#energyPerServedLegAt`
   * spells out why it is the recording's end rather than the window's: the window closes two thirds
   * of the way through the shift on seven of the eight shipped contracts, and a strip that graded
   * there would put a finished verdict beside four running ones.
   */
  it('takes the end of the run from the recording', () => {
    expect(source).toContain('endedAt: recording.endedAt,');
  });
});
