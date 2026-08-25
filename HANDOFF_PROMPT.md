# Handoff prompt — elevator-sim, the charter programme at M2

Paste everything below the line into a fresh session at
`/Users/nrene/Development/04-personal-projects/elevator-sim`.

---

You are taking over **elevator-sim**, an elevator traffic simulator that is also a game, running a
multi-agent delivery process. Your shift is open-ended: verify, implement, test, integrate, merge,
deploy, and push the design forward until the backlog is done or the user stops you.

## First, read these in this order

1. **`CLAUDE.md`** — the whole file. Its invariants and statistical discipline are binding and
   override your defaults. Do not skim it.
2. **`CHARTER_PROGRAMME.md`** — the page a returning human reads first. Milestones M0–M6, their entry
   and exit criteria, and which are open.
3. **`AGENT_STATUS.md`** — the lane board. **Append to it; never overwrite it.** Read § *Where a new
   agent picks up* and the wave-B board above it.
4. **`RISKS.md`** — the project register, R1–R41. Read R1, R7, R25, R38, R40 and R41 before you plan
   anything; they are the ways this project has actually failed.
5. **`MULTI_AGENT_PLAN.md`** for the task tree, **`ISSUE_VERIFICATION_FINDINGS.md`** for the evidence
   behind every scheduled issue, **`TEST_MATRIX.md`** for journey coverage.
6. **`DECISIONS.md`** is 1.7 MB — **grep it, never read it whole.** § D299 (two products, one
   engine), § D335/§ D338 (the two shells and the door between them), § D343 (measure the corpus once
   after integration), § D351–§ D360 (wave B).

## Where things stand

**The charter programme is open at M2 (vertical slice).** M0 and M1 exited on 2026-08-24. M3–M6 are
not open, and **opening or closing a milestone is a human decision** — the orchestrator prepares
evidence and does not declare a gate.

**`main` is deployed and deploys itself.** The viewer is Azure Static Web Apps at
`https://yellow-glacier-0ff81230f.7.azurestaticapps.net`; the API is a Container App. A push to
`main` deploys automatically. Verify the live site after a deploy, not just the build.

**Wave B is on `integration/m2-wave-b`.** Ten lanes merged, D351–D360 allocated, the honesty corpus
measured once after integration. Check whether it merged; if not, get it green and merge it, then
close its issues with evidence.

**M2 cannot exit on code.** § D349 splits its gate into a code half and a **tester half**: six gates
need ten first-time testers and no agent lane can produce one. The code half reports as
*code-complete, playtest pending* and ticks nothing below it. `docs/30-playtest-programme.md` is the
protocol; somebody human has to run it.

## The loop

Run this continuously, in waves of three to five parallel subagents in git worktrees
(`isolation: "worktree"`).

1. **Pick** from the open issues, respecting `ISSUE_WORKER_LEDGER.md`'s dispositions. Balance the
   Casual and Engineer halves; a wave that ships only one is the wrong shape.
2. **Verify before building.** This is the highest-value habit in this repository and it holds every
   time it is measured. In one wave, **eight of thirteen issues carried a false or misleading
   clause** and three would have shipped a new defect if actioned literally. In wave B, lanes
   refuted their own briefs four times — the day-length cost estimate (×20 → **×10**), the campaign
   issue's headline seed, #259's named test, and #256's breakpoint list, which was wrong in *both*
   directions. Record refutations as prominently as confirmations.
3. **Build**, matching the surrounding voice. This codebase explains *why* at length; reviewers
   expect that.
4. **Test.** `npm run typecheck`, then the project you touched. Full `npm test` is ~11 min on a
   10-core Mac. The browser tier needs `ELEVATOR_SIM_CHROMIUM` (see below).
5. **Integrate yourself.** Merge lane branches into one integration branch, resolve conflicts, re-run
   the suite, allocate decision numbers, update the registers.
6. **Merge and deploy.** PR → CI → merge to `main` → production deploys itself.
7. **File what you found.** Out-of-scope findings become issues with enough evidence to act on
   without your conversation. Wave B filed eleven that way.

## The environment, which is better than earlier handoffs describe

- **Node 26.5**, matching `engines.node: >=26`. Earlier sessions ran Node 22 in a container.
- **The browser tier runs here.** `playwright-core` 1.62.1 pins Chromium 1234, which is not
  installed; point at the shell that is:
  ```
  export ELEVATOR_SIM_CHROMIUM="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1181/chrome-mac/headless_shell"
  ```
- **Always run browser files with `--no-file-parallelism`** until #263 closes.
- **The deployed site is reachable** and can be driven. Driving it found #262.
- Suite timings on this host: non-browser ~11 min, browser tier ~1 min, deep honesty tier ~7 min.

## Rules that are not negotiable

- **Name the non-test caller.** A behaviour configurable, unit-tested and called from no shipped path
  has shipped **eleven** times here. For any new control, add the test that **moves the control and
  requires the run to change, compared on the legs** — not on a window statistic.
- **Never declare one configuration better than another without a paired-t interval that excludes
  zero**, on common random numbers, at 50–200 replications. An interval excluding zero is not a win
  when the effect is below the apparatus's measured resolution.
- **Hold out seeds.** Wave B applied this to the campaign layer for the first time and found that
  **five of six apparent stage-5 clearers were a fit to fifty passenger populations** (§ D355).
- **A refusal goes stale like a figure, and it is the more dangerous half.** A control that writes
  nothing must say so; one that writes something may not claim otherwise. Refusals are pinned by
  runs, never by another sentence (§ D227).
- **Energy is an axis, never a score.**
- **Do not weaken an acceptance criterion to make something pass. Raise it instead.**
- **Anything tunable is data, not code.**
- **Measure the honesty corpus once, after integration** (§ D343). Never per branch. This file has
  recorded that lesson five times.

## Traps this session actually hit — read these, they cost real time

- **Decision numbers collide.** Tell every subagent: *do not add a `## D3xx` heading; put the argument
  in a docstring and say a number is owed.* Allocate at integration. Two subagents once both wrote
  § D308. Next free number is in `CHARTER_PROGRAMME.md` and `MULTI_AGENT_PLAN.md` — **update both.**
- **Subagent worktrees can start on a stale commit.** Name the base commit in every brief and tell
  the lane to confirm it with `git log --oneline -1` and stop if it disagrees. Two lanes in wave B
  were provisioned at the wrong base and both caught it *because the brief told them to check*.
- **A lane that commits only at the end loses the lane, not a step** (`RISKS.md` R41). A session
  limit ended four lanes at once, three with nothing committed. Tell every lane to commit per piece.
- **A zero from an instrument nobody validated is worthless.** A page-error probe reported zero
  latent errors; it was measuring nothing, because it referenced a type-only `expect` and threw
  inside its own handler. Validated properly, an injected throw produced **628 captured errors while
  the run reported 4 of 4 tests passing.** Always mutate the thing you are measuring and confirm the
  instrument moves.
- **Never re-measure the honesty corpus on a branch.** Three lanes in one wave produced three correct
  numbers, none correct after integration.
- **CI is 30–44 min and `cancel-in-progress: true`.** Batch commits; do not push mid-run.
- **A published count with no test deriving it goes stale silently.** Wave B found the corpus surfaces
  column had been wrong by one in both tiers, **before** the wave — caught only by probing the
  surface *sets* at base and head and diffing them rather than trusting the counts.
- **Merges find defects neither branch could.** Always re-run the suite after integrating.

## Ask the user when

Something is genuinely their call — a product decision with no obviously right answer, a spend, a
milestone gate, or anything irreversible. Otherwise decide, record it in `DECISIONS.md`, keep moving.

## Start here

Read `CHARTER_PROGRAMME.md` § M2 and `AGENT_STATUS.md`'s wave-B board, confirm whether
`integration/m2-wave-b` merged, then open the next wave from the M2 queue and the open issues.
