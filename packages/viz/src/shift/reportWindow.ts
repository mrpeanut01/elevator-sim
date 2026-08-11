/**
 * **Which window a shift's figures are read over** — `docs/20` defect 5.
 *
 * ## The defect this exists to close
 *
 * Garden Apartments day 1 is the first sheet a new player ever sees, and it **withheld both of its
 * headline numbers**: `AVERAGE WAIT withheld`, `WORST WAIT not recorded`, both under *"the
 * reporting window held no arrivals"* — beside a goal row reading a perfectly good `38 s` and a
 * rail saying *"the lifts kept up with the door"*. Forty people rode that day. None of them arrived
 * in the five minutes the sheet was reading.
 *
 * The cause is an **absence**: `dev/state.ts#shiftRunConfigOf` set no `reportWindow`, so `core`
 * fell back to the demand template's own measurement band — `rise-and-fall`'s five-minute hold, at
 * a fixed position in the schedule. On a building whose whole day is forty arrivals over an hour,
 * a fixed five-minute band is empty about as often as not, and `awtIsValid`'s *empty window* ground
 * fires on a run that coped perfectly well.
 *
 * ## The rule is read, not invented
 *
 * This project has already measured this exact question, on this exact building, and written the
 * answer down. `packages/experiments/src/benchmark/arms.ts` § 2:
 *
 * > **Garden Apartments needs the full-run window, not peak-5min.** At the sparse rates where
 * > parking policy actually dominates … the peak-5-minute window contains **1 to 11 arrivals**, and
 * > a window with none has no AWT at all. Measured: at 1 % the peak-5min cell is invalid on **54
 * > replications in 100**, at 2 % on 20, at 4 % on 11, at 6 % on 1, and only at 8 % is it clean.
 *
 * and `EXCLUDED_CELLS` reproduces it independently at n = 200: `garden-up-peak` is excluded because
 * *"at 2 % the peak-5min window is invalid on 57 of 200 replications for every one of the twelve
 * arms simultaneously"*.
 *
 * So the shift path does not get a threshold of its own. It reads the **conclusion** the matrix
 * already encodes: `MATRIX_CELLS` is where each measured operating point declares the window it is
 * reported over, and Garden's two cells both declare `full-run` while every other building's cells
 * leave the template's band alone. A second rule here — an arrival-count threshold, a population
 * heuristic — would be a second answer to a question this repository has already answered with a
 * run, and the first thing that would happen is that the two would disagree.
 *
 * ## Why unanimity, and why that is not a hedge
 *
 * The predicate is *every* matrix cell on this building declares `full-run`, not *any*. The
 * distinction decides Midtown Office, which has three cells: `midtown-interfloor` declares
 * `full-run` and the up-peak and down-peak cells do not. That cell is full-run because it is a
 * 1 800 s interfloor study, not because Midtown's peak band is ever empty — at 1 % of 1 710 people
 * it never is. So *any* would move a building whose window is fine, on the strength of a cell that
 * says nothing about emptiness.
 *
 * What unanimity actually reads is: **at every rate this project has measured this building at,
 * the narrow window was the wrong instrument.** That is a property of the building, which is what
 * the shift path needs, and it is why the rule is stated over cells rather than over one cell.
 *
 * ## Re-measured on the shift path itself, because `arms.ts` measured a different run
 *
 * `arms.ts`' numbers are a **900 s** experiment cell, and the shift path runs Garden for **3 600 s**
 * — `shift/contracts.ts` gives `c1` an hour of its own and says why. A rule justified by one horizon
 * and applied at another is a published number going stale, so the shipped configuration was
 * measured rather than assumed. Driven through `shiftRunConfigOf` at `garden-apartments`,
 * `collective`, day 1 of an open week, over **500 consecutive seeds from 20260804**:
 *
 * | window | sheets withholding AVERAGE WAIT or WORST WAIT | arrivals the window held |
 * |---|---|---|
 * | the template's band (before) | **14 of 500** | **0 to 25**, of a day averaging 38.6 |
 * | `full-run` (after) | **0 of 500** | all of them |
 *
 * The fourteen are exactly the seeds whose band held **zero** arrivals; there is no other ground
 * firing here, which is what makes this the empty-window defect rather than a saturation one. At
 * 900 s — a length the shift-length control offers — the same sweep gives **6 of 100**, and
 * `arms.ts`' 54-in-100 is that same trend at 1 % of population rather than this building's own
 * profile. The direction is the one arms.ts predicts and the magnitude is this horizon's.
 *
 * **2.8 % is not the whole cost, and quoting it alone would understate the defect.** A band holding
 * zero arrivals withholds *both* headline figures at once, on a building whose day 1 is the first
 * sheet a new player ever sees, beside a goal row that grades perfectly well — so the fourteen are
 * fourteen first impressions, not fourteen degraded ones.
 *
 * ## What it costs, stated rather than glossed
 *
 * A day statistic instead of a peak statistic, on the buildings it moves — exactly the trade
 * `arms.ts` names and defends: *"That trades a peak statistic for a day statistic and says so; it
 * does not trade a valid interval for an invalid one."* The sheet says so too: every window-bearing
 * caption on the Day report prints `summary.reportWindow.id`, so a full-run sheet reads *over 40
 * legs in the full-run window* and its small print names the span, rather than claiming a peak it
 * did not measure (`shift/report.ts#smallPrintFor`).
 *
 * A building the matrix does not measure at all — `chancery-house` — keeps the template's band,
 * which is the honest default: this module knows nothing about it, and inventing an answer for a
 * building nobody censused is the thing the paragraph above refuses.
 */

import { MATRIX_CELLS } from '@elevator-sim/experiments/browser';
import type { SimulationConfig } from '@elevator-sim/core/browser';

/** The selection this module may return, which is `core`'s own type narrowed to what it decides. */
export type ShiftReportWindow = SimulationConfig['reportWindow'];

/**
 * The window a shift on this building reports over, or `undefined` for *the template's own*.
 *
 * `undefined` rather than `'peak-5min'` on the default path, and the difference is not cosmetic:
 * `'peak-5min'` is a **selection** that makes `core` search the arrivals for their busiest five
 * minutes, while `undefined` leaves the demand template's declared band in place. Those are
 * different windows on the same run, and every shipped sheet before `docs/20` defect 5 was read
 * over the second. Passing the first here would silently re-measure every building in the product
 * to fix one, which is a change nobody asked for wearing a bug fix's clothes.
 *
 * @param buildingId the id a shift is being run on — `ViewerState.buildingId`, unresolved, because
 *   a building the reader authored has no matrix cell and correctly falls through to `undefined`.
 */
export function shiftReportWindowFor(buildingId: string): ShiftReportWindow {
  const cells = MATRIX_CELLS.filter((cell) => cell.building === buildingId);
  if (cells.length === 0) return undefined;
  // Unanimity — see the docstring. `every` over an empty list is vacuously true, which is why the
  // length is checked first rather than relied upon.
  return cells.every((cell) => cell.traffic.reportWindow === 'full-run') ? 'full-run' : undefined;
}
