# Handoff prompt — elevator-sim, continuous delivery on both products

Paste everything below the line into a fresh session at
`/Users/nrene/Development/04-personal-projects/elevator-sim`.

---

You are taking over continuous development of **elevator-sim**, an elevator traffic simulator that
is also a game. Your shift is open-ended: keep iterating — verify, implement, test, integrate, merge,
deploy, and push the design forward — until the backlog is genuinely done or the user stops you.
Work in waves, use subagents, and keep production current as you go.

## First, read these in this order

1. **`CLAUDE.md`** — the whole file. Its invariants and statistical discipline are binding and
   override your defaults. Do not skim it.
2. **`ISSUE_WORKER_LEDGER.md`** — one row per open issue, with an evidence-backed disposition. Its
   snapshot is the current state of play.
3. **`docs/05-roadmap.md`** — phase verdicts. Read the **Standing requirement — the integration seam
   has an owner** before planning anything.
4. **`docs/12-design-handoff.md`** and the vendored prototype at **`docs/design/`** — canonical for
   what the screen looks like.
5. **`DECISIONS.md`** § D299 (the two-products decision), § D307–§ D314 (the most recent work).
   The file is 1.5 MB; grep it, do not read it whole.

## Where things stand

- **`main`** is deployed. The viewer is served from Azure Static Web Apps at
  `https://yellow-glacier-0ff81230f.7.azurestaticapps.net`; the API stays on the Container App at
  `elevsim-app.salmonstone-4576d6f7.eastus2.azurecontainerapps.io`. A push to `main` deploys
  automatically. `gh variable delete AZURE_SWA_NAME` is the complete rollback.
- **`integration/issue-wave-14`** / **PR #128** — seven issues closed (#107, #117, #102, #104, #92,
  #99, #118). Check whether it merged; if not, get it green and merge it, then close those issues
  with evidence comments.
- **`feat/issue-90-cold-start`** — built, not yet integrated. Based on `integration/issue-wave-14`.
  Closes **#90 only**; #98 stays open because its per-panel tooltip half was not built. **Owes a
  decision number.**
- **`feat/issue-115-stage`** — may or may not have landed by the time you start. Check.
- Last decision number used: **D314**. Allocate the next at integration, never inside a subagent.

## The vision you are building toward, and it has two halves

§ D299 decided this is **two products over one engine**. Both halves are load-bearing and neither is
allowed to eat the other.

**Casual** is the mass-market door. It is *not* Engineer with the words swapped — that is issue #110's
complaint and it is correct. Casual gets a real layout: a stage worth watching, plain language, a
visible day-to-day loop, a first run that does not saturate. But it is a **door, not a ceiling** — a
Casual player can author a building, tune a weight vector, and reach the full capability. Named play
styles are an entry point. If you find yourself removing capability to make Casual simpler, stop:
that is the thing § D299 refused.

**Engineer** is protected absolutely in its *rigour* and is explicitly **not frozen** in its
*playability*. The test, quoted from the ledger:

> A change to Engineer may make it **easier to use**. It may not make it **say less**.

*Draw the interval* is in scope. *Stop printing the interval* is not. *Put the basis on the figure*
is in scope. *Drop the basis because it is noisy* is not.

The open design work sits mostly on the Casual side (#110, #100, #115, #103, #91, #90/#98, #93, #96,
#116) and the open rigour work on the Engineer side (#126, #127, #129). **Do not let one starve.** A
wave that ships only Casual polish while an honesty gap stays open is the wrong shape for this
project, and the reverse is how it stops being a game.

## The loop

Run this continuously, in waves of three to five parallel subagents in git worktrees
(`isolation: "worktree"`):

1. **Pick** from `ISSUE_WORKER_LEDGER.md`, respecting its dispositions and combines. Balance Casual
   and Engineer work in each wave.
2. **Verify before building.** This is the single highest-value habit in this repository. In the last
   wave, **seven of seven issues carried a claim that did not survive verification** — two of them
   such that implementing the issue as written would have shipped a *new* defect. Trace to
   `file:line` or reproduce by a driven run. When a claim fails, record it in the ledger's *Reporter
   claims that did NOT survive verification* table so nobody implements it later.
3. **Build**, matching the surrounding code's voice — this codebase explains *why* at length and
   reviewers expect that.
4. **Test.** `npm run typecheck`, then `npx vitest run --project viz` (or the project you touched).
   The full `npm test` is ~40 minutes; CI runs it. The `viz-browser` tier skips on this machine
   unless you point `ELEVATOR_SIM_CHROMIUM` at a local Playwright shell — do that when a change is
   only observable in a browser.
5. **Integrate yourself.** Merge subagent branches into one integration branch, resolve conflicts,
   re-run the suite, allocate decision numbers, update the ledger.
6. **Merge and deploy.** PR → CI → merge to `main` → production deploys itself. Verify the live site
   after, not just the build.
7. **File what you found.** Findings that are out of scope become issues with enough evidence to act
   on without your conversation. Eight were filed this way in one wave: #123–#127, #129, #130.

## Rules that are not negotiable

- **Name the non-test caller.** A behaviour that is configurable, unit-tested in isolation and called
  from no shipped path has shipped **eleven** times here. For any new control, add the test that
  **moves the control and requires the run to change, compared on the legs** — not on a window
  statistic.
- **Never declare one dispatcher better than another without a paired-t interval that excludes
  zero**, on common random numbers, at 50–200 replications. A one-click before/after that subtracts
  two single runs is this project's documented central failure mode shipped as a feature. If a
  surface cannot honestly compare, it must say so — see § D310 for how that was done once already.
- **A refusal goes stale like a figure, and it is the more dangerous half.** A control that writes
  nothing must say so; a control that writes something may not claim it writes nothing. Refusals are
  pinned by runs, never by another sentence (§ D227).
- **Energy is an axis, never a score.** Never aggregate it into a grade.
- **Do not weaken an acceptance criterion to make something pass. Raise it instead.**
- **Anything tunable is data, not code.**

## Gotchas that cost time this session

- **Decision numbers collide.** Two subagents both wrote § D308. Tell every subagent: *do not add a
  `## D3xx` heading; put the argument in docstrings and say a number is owed.* Allocate at
  integration.
- **Subagent worktrees can start on a stale commit.** Tell each one explicitly which branch to base
  on, and make the instruction self-consistent — verify your own "confirm X is present" check is
  true of the base you named. One agent caught this and picked correctly; do not rely on that.
- **Merges find defects neither branch could.** One lane wrote a DOM test recorder answering
  `insertBefore`; another wrote the page's only sibling insert. Both correct alone. Always re-run the
  suite after integrating, never just after each branch.
- **CI is ~40 minutes and pushes cancel it.** Batch your commits; do not push mid-run unless you mean
  to restart.
- **Reading the infrastructure is not verifying it.** Arming the deploy found four defects that
  reading it had not, and one of them was misdiagnosed as propagation delay for twenty minutes.
  When an error names two strings that look identical, read it as *the strings are not identical*
  before you read it as *the system is eventually consistent* (§ D308).

## Ask the user when

Something is genuinely their call — a product decision with no obviously right answer (#123's
preview/API trade, #130's disclosure gate, #116's charter), a spend, or anything irreversible.
Otherwise decide, record the decision in `DECISIONS.md`, and keep moving.

Start by checking PR #128 and the two unintegrated branches, then open the next wave.
