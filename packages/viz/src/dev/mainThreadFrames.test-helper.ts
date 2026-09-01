/**
 * **Is the thread that paints free?** — the browser tier's instrument for GitHub issue #165.
 *
 * ## Why a frame gap rather than a stopwatch
 *
 * The issue is not that a run is slow; a simulation takes what it takes, on a worker as much as on
 * the main thread. It is that the run happened **on the thread that paints**, so for its whole
 * length the page rendered nothing and answered no click. That is a property of the *page*, and
 * the honest way to read it is to ask the page how long it went without a frame.
 *
 * A `requestAnimationFrame` callback runs once per rendered frame and cannot run while the main
 * thread is inside a synchronous call. So a loop that records `performance.now()` on every frame
 * produces, as the largest gap between two consecutive entries, an approximation of the longest
 * single stretch the thread was seized for. Under a blocking `recordRun` that gap is the run;
 * with the run on a worker it is a frame interval.
 *
 * `dev/fixit.browser.test.ts#sampleRunFrames` already keeps a standing rAF loop for a different
 * question — *did a frame carrying the busy label reach the screen* — and records, in its own
 * docstring, that it **cannot** discriminate a defer, because its own loop supplies the frame
 * either way. This measures the complementary thing and has no such blind spot: an observer loop
 * cannot manufacture a frame during a stretch in which no callback can run at all.
 *
 * ## What it is not
 *
 * Not a benchmark, and § D220 § 4 still holds: nothing here reads a metric of a *run*. The number
 * it produces is a fact about the browser's frame delivery, and the assertions built on it are of
 * the shape *the page kept painting*, never *the run took N seconds*.
 *
 * ## The bound, measured on this container rather than chosen
 *
 * {@link BLOCKED_FRAME_GAP_MS} is the threshold the tier asserts against. It is far above a frame
 * interval and far below the smallest blocking run any of the three surfaces produced — see its
 * own docstring for both numbers. A bound picked between two measured populations fails loudly on
 * a regression and does not flake on a busy machine, which is what
 * `vitest.config.ts#SIMULATING_TIMEOUT_MS` argues at length about timeouts.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md): this helper binds only the browser cases that
 * import it, and this docstring is the record.
 */

import type { Page } from 'playwright-core';

/**
 * The longest a rendered frame may be missing before the page is called blocked.
 *
 * **Measured on both sides rather than chosen.** The population it has to separate:
 *
 * - *Blocking*, before this issue — `dev/measure.surfaceRuns.test.ts` over the shipped cases:
 *   Fix-a-building's open run 11–474 ms and its press 24–846 ms, Watch's worst offered row
 *   4 351 ms. The **smallest** of those is what the bound must sit under, because a bound above it
 *   would let a regression on the cheapest case through.
 * - *Free* — a frame at 60 Hz is 16.7 ms, and this tier runs headless Chromium in a container that
 *   is hosting several worktrees by design, so single frames are dropped routinely.
 *
 * And the same gap, measured through this tier in the shipped artifact — four samples each, base
 * commit `a622c6e` against this branch:
 *
 * | press | before | after |
 * |---|---|---|
 * | Fix-a-building, Engineer | **644–1 227 ms** over 11–18 frames | **113–247 ms** over more |
 * | Fix-a-building, Everyday | **947 ms** over 13 frames | **126 ms** over 158 frames |
 * | Watch, a reference row | **72–100 ms** over 9–11 frames | **38–102 ms** over 22–52 frames |
 *
 * 400 ms sits between the two fixit populations with room on both sides, and is roughly
 * twenty-four frame intervals — well clear of ordinary jank on a loaded host. It is deliberately
 * **not** tightened to the frame interval: a gate that fails on a dropped frame trains people to
 * re-run the suite rather than read it.
 *
 * **It discriminates nothing on the Watch row, and that is stated rather than left to be
 * discovered.** The only rows a cold page can offer are two cheap reference runs, so that press
 * never blocked long enough for any bound to catch — the frame *count* tripling is the visible
 * effect there. The assertion that carries all three surfaces without a threshold is
 * {@link paintedBusyFrame}; this bound is the regression guard beside it.
 */
export const BLOCKED_FRAME_GAP_MS = 400;

/** One frame the sampler saw: when it was rendered, and what the watched control's face said. */
interface FrameMark {
  readonly t: number;
  /**
   * `textContent` of the first **rendered** match for the selector, or `''`.
   *
   * *Rendered* rather than merely present, and it is measured with `getClientRects().length`
   * rather than assumed. **This was a correction, not a precaution.** The first draft read
   * `textContent` off any match, and `dev/watchPanel.ts`'s picker hides itself with
   * `style.display = 'none'` rather than emptying itself — so a row left mid-check stays in the
   * document, wearing its busy label, for as long as the overlay is down. Driven against a
   * deliberately broken runner that put every run back on the main thread, the Watch case passed:
   * the busy frames it found were all after the press had finished, on a button nobody could see.
   * An instrument that reports a state the reader cannot see is worse than no instrument.
   */
  readonly label: string;
  readonly disabled: boolean;
}

/** Where the sampler parks its readings. The tier's own name; the product neither writes nor reads it. */
type FrameWindow = Window & typeof globalThis & { __frameMarks?: FrameMark[] };

/**
 * Start recording, on every rendered frame, the time and the face of the first element matching
 * `selector` (`''` for a frame on which nothing matched).
 *
 * Installed **before** the press it is measuring, and that is not a convenience: an `evaluate`
 * issued after a press that blocks the thread queues behind the blocking task and first runs when
 * it is over — so a sampler installed afterwards would observe an idle page and report nothing,
 * which is the failure mode that makes this instrument useless exactly when it matters.
 * `everyday/fixitScreen.browser.test.ts` records the same lesson about its own observer.
 *
 * It samples in a `requestAnimationFrame` callback rather than in a `MutationObserver`, and the
 * difference is the whole point of {@link paintedBusyFrame}. An observer reports DOM **writes**; a
 * frame callback reports what was **rendered**. A busy label written in the same task as a
 * synchronous run is a label no frame can carry, and only the second instrument can tell those
 * apart.
 *
 * The element is re-queried every frame rather than held, because every surface here rebuilds its
 * controls: `dev/watchPanel.ts#draw` and `everyday/shell.ts#drawBar` both `replaceChildren`, so a
 * held node is detached from the first redraw onward — which is the same defect this seam's busy
 * states had to be rewritten to avoid.
 */
export async function recordFrames(page: Page, selector = ''): Promise<void> {
  await page.evaluate((watched: string) => {
    const w = window as FrameWindow;
    const marks: FrameMark[] = [];
    const tick = (): void => {
      const found = watched === '' ? null : document.querySelector<HTMLElement>(watched);
      // Rendered, not merely present — see `FrameMark.label`.
      const node = found !== null && found.getClientRects().length > 0 ? found : null;
      marks.push({
        t: performance.now(),
        label: node?.textContent ?? '',
        disabled: node instanceof HTMLButtonElement ? node.disabled : false,
      });
      w.requestAnimationFrame(tick);
    };
    w.__frameMarks = marks;
    w.requestAnimationFrame(tick);
  }, selector);
}

/** What the sampler saw: how many frames, and the longest stretch with none. */
export interface FrameReading {
  readonly frames: number;
  readonly longestGapMs: number;
}

/**
 * Read the sampler.
 *
 * `frames` is reported beside the gap and asserted beside it, because the gap alone is not
 * evidence: a sampler that never started reports a longest gap of zero, which reads exactly like a
 * page that never stuttered. A reading of *many frames and no long gap* is the claim; either half
 * alone can be produced by an instrument that is broken.
 */
export async function frameReading(page: Page): Promise<FrameReading> {
  return page.evaluate(() => {
    const marks = (window as FrameWindow).__frameMarks ?? [];
    let longest = 0;
    for (let index = 1; index < marks.length; index += 1) {
      const gap = (marks[index]?.t ?? 0) - (marks[index - 1]?.t ?? 0);
      if (gap > longest) longest = gap;
    }
    return { frames: marks.length, longestGapMs: longest };
  });
}

/**
 * The index of the first **rendered** frame whose watched control matched `busy`, or `-1`.
 *
 * This is the assertion that discriminates a run on a worker from a run on the main thread, and it
 * does so without depending on a threshold. A synchronous handler writes its busy label and then
 * calls `recordRun` **in the same task**: the browser cannot render between the two, and by the
 * time it can the handler has finished and put the label back. So a painted frame carrying the
 * busy face exists only if the thread was free while the run happened.
 *
 * `dev/fixit.browser.test.ts#sampleRunFrames` records that its own frame loop *cannot* discriminate
 * a `requestAnimationFrame` **defer**, because the standing loop supplies the frame the defer was
 * meant to guarantee. That limitation does not apply here and the difference is worth stating: a
 * defer schedules the block for a later task, so a frame is available in between either way; a
 * genuinely synchronous handler leaves no gap for any loop to render in.
 */
export async function paintedBusyFrame(page: Page, busy: RegExp): Promise<number> {
  const marks = await page.evaluate(() => (window as FrameWindow).__frameMarks ?? []);
  return marks.findIndex((mark) => busy.test(mark.label));
}

/** Every frame the sampler saw, for a failure message that names what it did see. */
export async function frameLabels(page: Page): Promise<readonly string[]> {
  const marks = await page.evaluate(() => (window as FrameWindow).__frameMarks ?? []);
  return [...new Set(marks.map((mark) => mark.label))];
}

/** Whether the frame at `index` had the watched control disabled. */
export async function frameDisabled(page: Page, index: number): Promise<boolean> {
  return page.evaluate(
    (at: number) => ((window as FrameWindow).__frameMarks ?? [])[at]?.disabled ?? false,
    index,
  );
}
