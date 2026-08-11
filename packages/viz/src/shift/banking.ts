/**
 * **What a run has to be before it may close a day — GitHub issue #136.**
 *
 * A `DECISIONS.md` number is **owed** for this and for issue #135, which landed with it. The whole
 * argument is here rather than only in a commit message, per this repository's working agreement,
 * and the section that will carry the number should cite this file rather than restate it — a
 * second copy of a decision is the shape § D227 is about.
 *
 * ## The defect
 *
 * `dev/main.ts#loadRecordingFile` puts a `VizRecording` read off disk on screen. `adopt` then arms
 * the filing gate (`filedRunId = undefined`), the transport plays it, and `tick` reaches
 * `closeShift` at `endedAt` exactly as it would for a run the shell had just simulated. `closeShift`
 * takes the *day's* facts from `ViewerState`: the day number, the contract, the calendar period and
 * so the event, `ShiftPlan`'s three axes, the dispatcher's display name, and the run's own start
 * hour from a closure the loader never touched. It then calls `closedWeekOf`, which writes the
 * streak, the clean-run count and the cleared contract, and `saveSessionNow` puts all of it in
 * `localStorage`.
 *
 * So a file can bank a day against a plan it was not run under, and afterwards nothing distinguishes
 * that day from one the player played.
 *
 * ## The decision: **refuse**, and refuse in words
 *
 * The issue offered three. The argument that decides between them is not about trust — a campaign
 * that keeps its week in `localStorage` is not defending against an editor — it is that **the facts
 * a day is banked from are not in the file, and no amount of checking puts them there.**
 *
 * `VizRecording` carries `buildingId`, `seed`, `dispatcherProfileId`, an optional
 * `trafficProfileId`, `outOfServiceCarIds`, and the outcome: floors, shafts, landings, legs,
 * progress, summary, phases. Against the eight things `closeShift` needs:
 *
 * | what closing a day needs | in the recording? |
 * |---|---|
 * | the week's day number | no |
 * | the contract it banks against | no |
 * | the calendar period, and so the day's event | no |
 * | `shiftLengthS` | no — § D322 measured why: `endedAt` is `max(lastEventAt, demandEndedAt)` and moves with the traffic, so the span is an *outcome* |
 * | `windowStartS` | no |
 * | the arrival pattern | `trafficProfileId` names a profile, not the shift's pattern selection |
 * | the run's start hour | no — `dev/main.ts#runStartOfDayS`'s own docstring says so, in those words |
 * | the dispatcher's display name | **yes**, via `dispatcherProfileId` |
 *
 * One of eight. That kills **(b) rebuild the day's facts from the recording** outright: there is
 * nothing to rebuild them from, and the only way to produce them is to invent them — which is
 * precisely the trap issues #126 and #135 both record, *the recording knows what happened, not what
 * was scheduled*.
 *
 * It kills **(c) allow when the configuration matches** for the same reason, one step later and
 * less obviously. *Matching* can only ever be checked on the axes the file carries — three of them —
 * and the eight above are the ones that decide a campaign day. A gate that compares a quarter of the
 * configuration and then reports *"this matches, bank it"* is a true-sounding claim about a check
 * that did not happen, which is the failure this repository has named more times than any other. It
 * would also be a **second** answer to *is this recording trustworthy?*: the product already has one
 * and it is server-side replay (§ D321 — a leaderboard score is accepted only when the replay
 * reproduces), deliberately on the server because the viewer is CDN-served in front of a separately
 * deployed API. A weaker client-side lookalike beside it is worse than none.
 *
 * So **(a)**. A loaded recording is for watching and comparing; it does not close a day. And it says
 * so — {@link LOADED_RUN_CANNOT_BANK} lands on the status line rather than the shell quietly doing
 * nothing, because a control that silently declines is `docs/16` S1's absence-indistinguishable-
 * from-oversight, and this one declines something the player just watched happen.
 *
 * ## What it costs, stated rather than glossed
 *
 * *Export report PNG* over a loaded recording. It went through `closeShift` to get a sheet, so under
 * this refusal it has none — and it now names *this* reason rather than `NO_SHEET_YET`'s *"run a
 * shift to the end"*, which would be false advice to somebody who did exactly that.
 *
 * ## What this is not
 *
 * A judgement about the recording. It is not corrupt, not unverified and not somebody else's; it is
 * simply not the run this shell's week is a week of. The sentence is worded to say that, and
 * deliberately **does not name a difference** — naming the building would imply that a matching
 * building would be bankable, which is option (c) smuggled back in as a hint.
 */

import type { VizRecording } from '../contract/types.js';

/**
 * Why a run read off disk may not close a day — as a value the shell puts on the status line.
 *
 * A `null` return from {@link bankingRefusalFor} would be an absence indistinguishable from an
 * oversight (`docs/16` S1), which is why the refusal is a sentence rather than a boolean, and why
 * it names what a loaded recording *is* good for instead of only what it is not.
 */
export const LOADED_RUN_CANNOT_BANK =
  'this run was loaded from a file, so it is not a day of this week and nothing is banked from it — ' +
  'watch it, scrub it and compare it, and run the shift here to bank one';

/**
 * Why a run nobody started may not close a day — § D232's ground, given the sentence issue #136's
 * already had.
 *
 * The gate itself lives in `dev/main.ts` (`closeShift`'s `if (!playerHasChosen) return;`) and is a
 * closure flag this module cannot read, so unlike {@link bankingRefusalFor} the *decision* is not
 * here — only the words are, beside the other answer to the same question: *what does a run have to
 * be before it may close a day?* Issue #136's answer is *simulated by this shell*; § D232's is
 * *asked for by the player*. The play-experience audit (`docs/19` defect 1) found the second ground
 * refusing in silence: boot's own recording, watched to its end after **Resume**, produced a sheet
 * reading *"Nothing filed yet — press 'Run this shift'"* with no sentence anywhere saying why the
 * day had not filed. A refusal that does not speak is `docs/16` S1's
 * absence-indistinguishable-from-oversight, and this is the sentence.
 *
 * It says what the run *is* — the page's own, made so the stage is not blank on load — for
 * {@link LOADED_RUN_CANNOT_BANK}'s reason: a refusal that only says no sends the reader hunting a
 * defect. And it names the control that does count, because the empty sheet this sentence replaces
 * was naming the same control as advice the player had (from their view) already followed.
 */
export const UNCHOSEN_RUN_CANNOT_BANK =
  'this run was set going by the page when it loaded, not by you, so it banks nothing — ' +
  'press “Run this shift”, or pick a scenario, and the day you start files itself here';

/**
 * The refusal, or `null` when the run on screen **is** the run this shell simulated.
 *
 * ## Reference identity, and the finding that forced it
 *
 * The obvious comparison is `onScreen.runId === simulated.runId`, and it is wrong in a way worth
 * recording rather than merely avoiding: **`runId` is not a per-run identity.**
 * `sim/simulation.ts` defaults it to `` `${building.id}-${profile.id}-${masterSeed}` `` — a digest of
 * three configuration axes — and `dev/state.ts#shiftRunConfigOf` passes no `runId`, so that default
 * is what the shell's runs carry. `viz`'s own test fixture goes further and hard-codes
 * `runId: 'viz-fixture'` for every run it builds, which is how this was found: the first draft of
 * `banking.test.ts` let a Chancery House file bank a Midtown Office day, and passed.
 *
 * So an id comparison here would have been the issue's option (c) — *allow when the configuration
 * matches* — arriving by accident, on three axes, wearing a unique identifier's name. That is the
 * shape this module refused on purpose one screen up, and it would have shipped as an
 * implementation detail.
 *
 * Object identity has none of that. `readRecordingDocument` returns a freshly parsed object, so a
 * loaded recording is never `===` a simulated one — not even a byte-identical re-load of the run
 * currently on screen, which `banking.test.ts` drives and which this correctly refuses. It compares
 * nothing, so it can misreport nothing.
 *
 * `undefined` for `simulated` is *this shell has simulated nothing yet*. It refuses, and it must: a
 * run that arrived from somewhere other than this shell's simulator is the whole of the question.
 */
export function bankingRefusalFor(
  onScreen: VizRecording | undefined,
  simulated: VizRecording | undefined,
): string | null {
  if (onScreen === undefined) return null;
  return onScreen === simulated ? null : LOADED_RUN_CANNOT_BANK;
}
