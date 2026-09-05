# AGENT_STATUS

**Current programme: the charter programme** (milestones M0–M6, issues #186–#252). The plan is
[`MULTI_AGENT_PLAN.md`](MULTI_AGENT_PLAN.md); the milestone pages are
[`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md).

> **This file is appended to, not overwritten.** The record below it — the Everyday-and-Engineer
> wave — stays. Commit `1b7a2f1` cut this file from 1 047 lines to 17 in one sitting, along with
> three other project-level registers, and issue #193 exists because of what that cost. A status
> board that replaces its own history is a board nobody can audit.

## Charter programme — active lanes

**Opened 2026-08-24.** **M0 and M1 have both exited and M2 is open**, all by product-owner decision
the same day. #206 was fast-tracked ahead of milestone order on the charter's own § 7 grounds — a
defect fix needs no specification — and landed before M2 opened.

### Active — M2 · wave D, opened 2026-08-26 on a third host

**The host changed again, and it changes what this wave can measure.** This container arrived with
**no `node_modules` at all** — `npm run typecheck` failed on *"Cannot find module 'vitest'"* and
*"Cannot find type definition file for 'node'"*, which reads exactly like a broken tree and is not
one. `npm install` fixed it in 8 s and `tsc -b` is clean. **Record this before anything else:** a
lane that reads a fresh clone's red typecheck as a repository defect will file a phantom issue. It is
Node **22.22.2** against a package declaring `>= 26`, so `npm install` warns `EBADENGINE` and
proceeds.

**The browser tier runs here, and it runs from the fallback rather than the variable.**
`browserTier.test-helper.ts#PROVISIONED_FALLBACK` —
`/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` — **exists on this
machine**, so `HAS_BROWSER` is true with `ELEVATOR_SIM_CHROMIUM` unset. That contradicts
[`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md) W18-5, which says the path *"exists on no machine
this repo has been measured on"*, and the helper's own docstring, which says *"on every machine this
repository has been measured on since, it does not exist, and the tier skips."* Both were true when
written and are false here. It is [`RISKS.md`](RISKS.md) R38 landing on a sentence about the
environment rather than about the product — and the correction is *this host has one*, not *the
sentence was wrong*.

**This wave opened on reconciliation rather than on new work, because the backlog said to.** 94
issues are open. No pull request is open. `main` is at `2c7b308` and this branch is identical to it.
The wave-C merge says *"every known issue burned down"*, and the open list disagrees with it in both
directions — which is the thing to establish before scheduling anything.

| Lane | Task | Issues | Status |
|---|---|---|---|
| R1 | Are the four landed M2 fixes closable against their own criteria? | #211, #213, #214, #215 | dispatched |
| R2 | Are the six M1 specification issues closable? | #194, #195, #197, #198, #201, #202 | dispatched |
| R3 | Duplicate adjudication across the two cohorts | #156–#182 ↔ #219–#252 | dispatched |
| R4 | Did wave B/C's work land for the issues it named? | #170, #173, #229, #234, #254, #255, #257, #258, #275, #279 | dispatched |
| R5 | Is the pre-charter backlog still true after thirteen waves? | #93, #123, #130, #145, #146, #147, #149 | **reported** |

**All five reported. Of seventeen issues verified against their own acceptance criteria, five were
closable and twelve were not** — and the twelve fail in one shape. **The criteria that got met were
the ones about writing prose; the criteria that went unchecked were the ones about anything else.**
#201's telemetry document is excellent and contains **no occurrence of the word *dashboard***.
#197's flow maps are complete and `TEST_MATRIX.md` was never rewritten against them — which *both*
files state in terms. #202's posture lists what the consent question owes and drafts no copy, which
is *described, not designed*, the exact half its own criterion excludes. Every one of the twelve had
a lane recorded as **landed** in this file.

**Twelve issues closed, one filed, seventeen dispositioned; 94 open → 83.**

| closed | ground |
|---|---|
| #194, #198, #215 | completed, every criterion re-verified against the code |
| #254, #255, #257, #279 | completed; #279 needed one docstring the lane that built its mechanism never wrote |
| #156, #160, #164, #168, #180 | duplicate — **each after its unique scope was transferred to the canonical**, which was the whole of the work |

**No duplicate was closed on a title.** Five pairs met the bar and **eleven did not**, the sharpest
being **#170 ↔ #229**, which is now the *opposite* of a duplicate: § D368 retitled #229 after its
premise was refuted, and `buildNotes.test.ts#ABSENCE_TRIAGE` partitions the six Settings rows across
**four** owners, so the two share no row at all. Closing either against the other would have
silently dropped the Units conversion that `ENGINE_CONTRACT.md` § 13 requires to *convert, not
relabel*.

**The cross-cohort mapping [`MULTI_AGENT_PLAN.md:122`](MULTI_AGENT_PLAN.md) promised did not
exist**, and now does — it is in [`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md), which that file
names as its home and which covered only #186–#193 and #206–#218.

**A new risk class, and it is not R1.** [`RISKS.md`](RISKS.md) **R42** — *a ruling with no consumer*.
R1 is a behaviour with no caller; this fails one level earlier and **no dead-code audit can see it,
because a decision has no exports to scan**. Three realised instances: § D330 answered #123 and #130
on 2026-08-09 and neither was built — **#130 closed 2026-08-29**, the gate is mode-aware, the reveal
survives a reload and the strip says what is behind it; #123 is still open — and § D367 ruled on the
energy bar while § D106 — the entry a reader lands on — carried no pointer to it, which is why four lanes read the rule and got the wrong
answer. The compounding half is what earned it a row: `docs/16:357` said *"Issue #123 holds the
decision that has not been made"* and the issue's own comment said *"No decision is recorded"*, so a
reader who checked was told **twice** that an answer which existed did not.

**Three lanes refuted something I told them, which is the process working rather than a lane going
off-brief.** R5 was told `internal-notation` might now bar #146's string; it ran the property's own
five regexes and **refuted it twice over** — the string matches none of them, and the Engineer editor
is outside `PLAYER_FACING_SURFACES` anyway. R1 was told the browser tier runs on this host; it hit
playwright's *default* resolution path (revision **1234**) rather than the repo's
`PROVISIONED_FALLBACK` (**1194**), so the tier's own launch works and a default-path launch does not.
And R4 found that **#255's headline evidence was wrong about the population** — `20260730` is a
master seed, not a run the campaign ever makes.

**One measurement was refused rather than taken, and the refusal is the right one.** R5 declined to
re-measure #149's *"8 tests over 5 s, slowest 39.2 s"* because this host was running the full suite
concurrently at load 5.7–6.9 on 4 cores. A duration distribution taken under that load, published as
a refresh of a figure taken on another tree, is the per-branch-figure defect
[`CLAUDE.md`](CLAUDE.md) records five times.

**Every lane is investigation-only and forbidden to write.** That is why five run at once: they share
every file and conflict on none. The rule that serializes *code* lanes is untouched.

### Wave D, second half — four issues advanced with code

Reconciliation closed twelve. These four were then **worked** rather than triaged, and two of them
are refusals that are worth more than the code.

| issue | outcome | the thing to read |
|---|---|---|
| **#147** | **closed** | The rail card says what a hard constraint *does*, in `core`'s words. The dense blurb keeps the id **deliberately** — engineer audience, greppable against `data/` — with the consequence recorded: it would trip `internal-notation` on a player surface |
| **#145** | **closed** | Coverage of `coachWeekLines`' four branches was complete **by coincidence**. `WEEK_CONTRACT_SENTINELS` is now mapped by the corpus and `week.test.ts` reads `week.ts` **from disk** to require both directions |
| **#281** | **open, 2 of 5** | The tier gained a case that drives the built bundle — and **it does not bite** |
| **#173** | **open, premise partly refuted** | The reservation mechanism **exists** (`CHARTER_PROGRAMME.md:50`) and was unguarded. It is now derived |

**#281 is the refusal to read first.** Its third criterion asks for a case that fails when either
half of `shell.ts#go`'s reset is removed. Mutation-tested: deleting the `.everyday-screen` reset
leaves the new file **3 of 3 green** — the same weakness that got two earlier cases deleted.
Measured at `375×667` on the locally-served bundle: the document does not scroll at all,
`.everyday-screen` overflows by **335 px**, and the offset after tapping a tile with the reset
removed is **0**. `reconcile`'s incidental clamp covers it here. **The defect was measured on the
*deployed* build, and that build answers `curl` with status `000` from this container** — which is
issue #123's gap, arriving as a blocker on the issue about a different gap. So the case is a
regression guard on the right *kind* of artifact and is labelled as exactly that, in its own
docstring, before a reader reaches the assertions.

**Four measurements were corrected mid-flight, and each would have shipped a wrong claim.**

1. A probe read the fixit screen's overflow as **0** — it is **8 772**. The probe measured before
   layout settled, and the 0 would have supported a tidier and wrong conclusion.
2. A margin in `rightRail.ts`'s docstring was written as **73** from memory; measured, it is **221**.
3. A heading pattern of `^## D(\d+)` reports **two** duplicate decision numbers where the tree has
   **one** — `## D125 preface —` is a preface *to* D125, not a second D125.
4. **The #173 ratchet counted itself.** The test states the phrase it counts in its pattern, its
   prose and its failure message, so the first run read **69** against a tree of **64**, and all
   five extras were its own words. Excluded by path rather than by a cleverer pattern, because one
   contrived to miss its own text would miss a real site written the same way.

**One guard was widened rather than worked around.** `browserTier.test.ts` derives every tier file's
port from source text; a preview server needs one for the same reason, so `startBuiltSite` takes
Vite's own `preview` options as an object and the guard reads `preview: { port }` beside
`server: { port }`. Every property it asserts is unchanged, and pointing the new file at 5201 turns
the collision case red naming both files.

**One suite run was killed rather than reported.** The first local baseline began before the first
commit and was reading a tree that changed underneath it. It was killed and re-run clean:
**430 files, 8 838 passed, 11 skipped, exit 0** in 3 325 s — which corroborates CI's two green
platform legs rather than substituting for them.

**Cost of the new tier file, on a quiet machine:** cold `dist-web/` build **4 152 ms**, whole file
**6.34 s**. It never reaches the always-on path — `viz-browser` is opted into by name and gated on
`HAS_BROWSER`.

**Two findings before any lane reported, and one of them was already fixed.** The M2 exit criterion
*"T1 reads `passing` in `TEST_MATRIX.md`"* is **unticked in
[`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md) § M2 while `TEST_MATRIX.md` reads `passing`**, and
[`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) § Z is the run behind it — a gate
box left unticked over evidence that already exists. And § Z's parting finding, the stale
`{@link closeDay}` refusal at `dailyLoop.browser.test.ts:166`, was **deliberately left for the #207
lane and has since been fixed** — the comment now records its own staleness. Checked before
scheduling, which is the only reason it was not done twice.

### Active — M2 · wave B, opened 2026-08-24 on a new host

**PR #253 is merged.** M0, M1 and the eight landed M2 lanes are on `main` at `000852a`, and the
production deploy went green on that commit. The full loop was then **driven on the deployed build**
— main menu → front door → brief → stage → report → week — so #206 is verified in production and not
only in CI. The integration branch for this wave is `integration/m2-wave-b`, cut from `000852a`.

**The host changed, and it changes what this programme can measure.** The previous session ran in a
4-core container on **Node 22** against a package declaring ≥ 26, with `playwright-core`'s pinned
Chromium absent and the Azure preview answering `403` to `CONNECT`. This host runs **Node 26.5**,
drives the browser tier locally, and reaches the deployed site. Two consequences: the local suite is
**1 089 s** rather than 3 771 s, and the `[tester]` gates are *still* out of reach — a machine that
can drive a browser is not a first-time tester, and § D349's split stands untouched.

| Lane | Task | Issue | Status |
|---|---|---|---|
| FIX-217 | The stale count beside a dead branch | #217 AC3/AC4 | **merged** into `integration/m2-wave-b` |
| FIX-256 | The 1280 px rule that never existed | #256 | **merged** into `integration/m2-wave-b` |
| TIER-PORT | The browser tier's fourth `port: 0` | *(no issue — found here)* | **merged** into `integration/m2-wave-b` |
| FIX-257 | The speed ladder, and a true 1:1 | #257 | in flight |
| FIX-CAMPAIGN-INTEGRITY | The campaign `reportWindow` **and** O7's hold-out seeds | #255 + O7 | in flight — **high risk, moves published pins** |
| FIX-254 | The account-deletion route | #254 | in flight |
| M2-MEASURE | The browser matrix, and the truth of all 22 `TEST_MATRIX.md` rows | M2 exit criteria | **merged** |
| FIX-HORIZON | One expression answers which horizon a run is | — | **merged** ([§ D359](DECISIONS.md)) |
| FIX-O8 | The Campaign tab runs the hold-out batch | O8 | **merged** ([§ D360](DECISIONS.md)) |
| FIX-268 | The tier fails on an unhandled page error | #259 AC4, #268 | **merged** |
| FIX-267 | A whole day is postable, and the cooldown repriced with it | #267 | **merged** |
| FIX-STAGE1 | The measurement that stage 1 cannot carry a goal, and the gate | #270 | **merged** — the gate only |
| FIX-STAGE1B | The fabric route | #270 | **refused and preserved unmerged** on `fix/stage-1-fabric` |

**One lane was deliberately not merged, and it is the most useful refusal of the wave.** FIX-STAGE1B
did everything asked — one car, `eta` as baseline, DC-1 and DC-2 both holding — and then measured
what it cost. **Two of stage 1's three editable dials go inert** (one car is one candidate for the
argmin, so `weights.waitTime` and `weights.distanceTravelled` stop moving the legs), **78 tests fail
across 32 files** including 352 published matrix figures and three golden digests, and the
correctness oracle's premise fails with bunching structurally unmeetable on a one-car bank.

A stage whose goal is failable and whose controls are inert is worse for a player than a stage with
no goal, so the change was refused on a **player-facing** ground rather than a cost one. Branch,
measurement and the three honest routes are preserved in [#270](https://github.com/mrpeanut01/elevator-sim/issues/270).

**The tier-port lane was not scheduled; it fell out of measuring the baseline, and it is the most
useful thing this wave has found so far.** `boot.browser.test.ts` is the file the other three notes
about this trap cite by name, and it is the one nobody repaired. Measured before and after, on this
host, same command:

| | test files | tests | skipped | wall clock |
|---|---|---|---|---|
| before | 25 passed, **1 failed** | 148 | **6** | 90.9 s |
| after | **26 passed** | **154** | **0** | **70.4 s** |

**The six skips were `boot.browser.test.ts`'s own cases**, and they had never run on this tier — the
file died in `beforeAll` and reported its contents as skipped rather than failed, which is why a red
tier read as a mostly-green one. The run is also twenty seconds faster, because eleven files across
five collisions had been standing each other up and retrying. Both halves of the new guard were
mutation-tested rather than assumed.

**The wave-B integration point, measured on `integration/m2-wave-b` after five merges.** Both tiers,
one host, one sitting:

| tier | files | tests | wall clock |
|---|---|---|---|
| non-browser (`core`·`experiments`·`server`·`cli`·`viz`) | **418 passed** | **8 623 passed, 11 skipped** | 901 s |
| `viz-browser`, **default parallelism** | **26 passed** | **154 passed, 0 skipped** | 62–65 s, twice |

**That 154 became 151 later in the wave and the row is left as measured**, because it dates a run.
#268's gate folded three hand-rolled page-error collectors into one shared check, so three duplicate
cases went away while the check itself moved from 3 files to 26 — **fewer tests covering more.** The
figure to carry forward is **151**, and the reason it moved is the reason a bare count is a poor
summary of a tier.

The browser figure is the one that matters and it is deliberately taken at **default parallelism**
rather than serially. M2-MEASURE measured that same tier at **19 failed files / 75 failed tests** on
`000852a`, against **1 failed / 0 failed tests** serially — so a serial green here would have proved
nothing. Two consecutive runs on **10 cores at load 17.75–21.64**, roughly twice oversubscribed and
at least as contended as the run that failed, returned zero. That is [#263](https://github.com/mrpeanut01/elevator-sim/issues/263)'s first
acceptance criterion, and the issue is deliberately **left open**: absence of a load-dependent
failure is not proof of its removal, CI has not spoken, and the tier still does not fail on an
unhandled page error — both runs emitted `dev/dom.ts:115`'s `removeChild` throw and stayed green.

The eleven skips are unmoved and are the same eleven the programme baseline recorded: deep-tier
opt-ins behind `describe.skipIf` in `packages/experiments`, which GitHub issue #163 reports have
never run in CI. **The browser tier's six skips are gone**, and that is a different number entirely —
they were a file that never ran, not an opt-in.

**The corpus, measured once after integration — and the surfaces column was a correction, not a
move.** Both tiers on the integrated tree, 2026-08-25, one sitting:

| tier | cases | strings | simulations | surfaces | failing cases |
|---|---|---|---|---|---|
| always-on | 49 | **569 184** | 606 | **49** | **0** |
| deep | 60 | **710 048** | 4 710 | **50** | **0** |

Strings **+2 776** and **+3 954**; cases and simulations unmoved. The surfaces column read 48 and 49
and is now 49 and 50 — **and it is 49 on `000852a`, the commit the old row described.** The two
surface *sets* were probed at base and at head and diffed: **identical**. Wave B added no surface;
the figure had been stale since M2-GATE and #207. Published as a correction, because a changed number
beside *"surfaces unmoved"* reads as *this wave added one* and sends the next reader hunting.

**The § D343 check was run and is clean.** `honesty/properties.ts` untouched, `STANDARD_SPACE` /
`DEEP_SPACE` / `maxDurationS` / `stageProbability` / `OUTSTANDING` unmoved. The whole of `honesty/`
in forty-five commits is one 18-line classification entry. A gate held at zero by moving the gate
looks identical in the summary line; only the diff separates them.

**Three product-owner calls were taken on 2026-08-24 and they set this wave's shape.** Merge and
deploy #253 immediately, rather than stacking further on the branch. The longer day is **Everyday
only** — campaign stage runs keep their length, so `data/scenario-goals.json` moves for the window
and the seed split and for nothing else. And **O7 is fixed now rather than deferred to M4**, which is
why it is inside the campaign lane rather than behind it: the two regenerate one table and the
repository's own advice on #255 is to *sequence the two rather than regenerate twice*.

**The parallelism rule held, and it is the same rule.** Seven lanes ran at once only because their
file sets are disjoint: `everyday/modes.ts`, `everyday/stageScreenModel.ts`, `render/canvas.ts`,
`campaign/`, `packages/server/`, and a measurement lane forbidden to touch source at all. The longer
day and #208 are **not** in this wave, because both write `everyday/` behind FIX-257 and `shift/`
behind the campaign lane. They are wave C, and the order is still forced.

**Two lanes independently reported their worktree was provisioned at the old `main` (`c8fd6fa`)
rather than the base named in the brief**, and both corrected it by branching explicitly from the
named commit before working. The handoff records this trap and says *"one agent caught this; do not
rely on that."* Two did. **Do not rely on that either** — every brief in this wave named its base
commit and told the lane to confirm it with `git log --oneline -1` and stop if it disagreed, and that
instruction is why both corrections happened before any code was written rather than after.

**They ran in parallel because they shared no file.** FIX-212 owns `everyday/` and `honesty/`;
SPEC-200 wrote [`docs/33-difficulty-curve.md`](docs/33-difficulty-curve.md) and one README row and
was forbidden both directories. That is the only condition under which this programme parallelizes.

**Next, in this order, and the order is forced.** `honesty/surfaces.ts` is now the tightest
serialization hazard in the tree — every lane that builds or renames a player surface writes it, and
unlike the other hazards it has no interface to lock first, because an adapter *is* the surface.

1. **#212 + [§ D347](DECISIONS.md), as one lane** — they were scheduled as two and are one piece of
   work. Both write `everyday/stageScreen.ts`, and #212's own AC5 already asks for what § D347
   requires. **#212 was nearly run in parallel with #207** on the belief its defects were in
   `render/canvas.ts`; they are not, and that would have put two lanes in `everyday/` at once.
   It is now the **only** thing standing between the M2 gate and a ticked box.
2. **#217's cleanup only** — AC3 and AC4, the stale comment and the wrong count in
   `everyday/modes.ts`. AC1 and AC2 are held for the product owner ([§ D350](DECISIONS.md)).
3. **#208**, which cannot start until SPEC-200 lands ([§ D348](DECISIONS.md)), then #210, then the
   #218 slice review.

**And the milestone does not end when that list does.** [§ D349](DECISIONS.md) splits M2's exit into
a code half and a **tester half**: six gates need first-time testers, no lane can produce one, and
the preview build is unreachable from this container. The code half reports as *code-complete,
playtest pending* and ticks nothing in the tester half.

**M2-GATE was deliberately first, and it is landed.** The criterion it instruments *"is a mechanical
check and is part of the gate"*, it had no instrument, and it **failed on its first run** — watched,
at 49 of 49 always-on cases, before anything was registered. A gate with an instrument is a gate; a
gate with an opinion is a negotiation. It does **not** fix the violations; that is FIX-207.

### Landed — M2

| Lane | Issue | What landed |
|---|---|---|
| FIX-206 | #206 | The daily and campaign loops close. Green on **both** CI platforms. Test watched failing by the integrator rather than taken on report |
| FIX-216 | #216 | *"An ordinary Tuesday-shaped day"* → *"An ordinary day"*, plus a weekday rule swept over `SHIFT_EVENT_IDS` and derived from `WEEKDAYS` |
| FIX-211/213 | #211, #213 | The report lays its small print out, and its lever button goes where it says |
| FIX-214 | #214 | The rail's streak replaced by a career line with the week behind it |
| FIX-215 | #215 | Re-entering a filed day stops silently re-running it |
| FIX-212 | #212 + [§ D347](DECISIONS.md) | **A shut car reads as a car, and the stage's words entered the corpus.** The door leaves became a seam — asserted geometrically, *at most a fifth of a shut car painted amber at every shipping size*, not claimed. The cutaway's `riders/capacity`, its out-of-service caption and its direction glyph moved from the DOM mount into `stageCarReadoutOf`, a pure seam the corpus drives. **§ D347 closed; M2 exit criterion 3 ticked** |
| SPEC-200 | #200 | **The difficulty curve specification, and six refuted claims.** #200's own central figure — *four of ten stages clear from the dropdown* — is **three of ten**, measured over 77 admitted cells at 50 replications under CRN. Nine named rules, each with a testable form; the sweep specified rather than built. **#208 is unblocked** |
| FIX-207 | #207 | **The M2 gate's register went 19 → 0, in both tiers.** The six registers moved to a build-information panel in Settings — a real non-test caller of all six arrays, so the audit that put them on player surfaces does not re-fire — and **no register lost a row**: 27 entries in, 27 out. The front door keeps one sentence pointing at it. Two deep-tier findings closed in the product, `packages/core/` untouched |
| M2-GATE | M2 exit criterion 3 | **The ninth honesty property, `internal-notation`.** Watched failing first — 49 of 49 always-on cases, 1 078 violation lines — then **19 findings registered**, 17 in both tiers and 2 the deep tier alone reaches. The gate now has a number: **19 → 0**. Green on **both** CI platforms |

**Both tiers were run before it landed, in one sitting on one tree**: always-on 49 cases / 566 506
strings / 606 simulations / 48 surfaces; deep 60 / 706 214 / 4 710 / 49. Cases, simulations and
surfaces are unmoved from the published row; strings moved **+98** and **+120**, which is this wave's
landed copy and not the property, which renders nothing. **`CLAUDE.md`'s canonical row is deliberately
not updated** — [§ D343](DECISIONS.md) wants that measurement once after the wave integrates, and M2
is still open.

**CI, measured on `90ecd26`:** `suite (macos)` 35 min, `suite (linux)` 44 min, both green. That
**inverts** the timings recorded earlier in this programme (linux 33, macos 56); the earlier pair was
taken on one commit and so is this one, so neither is a rule. It is recorded because the earlier
figure is what the *hold the push* tactic was sized against.

### Closed — M1's specification lanes

| Lane | Deliverable | Issues |
|---|---|---|
| M1-SLICE | [`docs/25-vertical-slice.md`](docs/25-vertical-slice.md) | #198 |
| M1-TELEMETRY | [`docs/26-telemetry-and-privacy.md`](docs/26-telemetry-and-privacy.md) | #201, #202 |
| M1-FLOWS | [`docs/27-flow-maps.md`](docs/27-flow-maps.md) | #197 |
| M1-ART | [`docs/28-art-direction.md`](docs/28-art-direction.md) | #195 |
| M1-AUDIO | [`docs/29-audio-direction.md`](docs/29-audio-direction.md) | #196 — [§ D344](DECISIONS.md) |
| M1-PLAYTEST | [`docs/30-playtest-programme.md`](docs/30-playtest-programme.md) | #205 |
| M1-MATRIX | [`docs/31-support-matrix.md`](docs/31-support-matrix.md) | #203 |
| M1-GDD | [`docs/32-game-design.md`](docs/32-game-design.md) | #194 |

**M1 exited on nine of twelve**, with #199, #200 and #204 deferred to before M4 as a **named**
deviation. M1-ART died on an API error after its research phase and before writing anything, and was
relaunched with instructions to write early and extend — which is why its brief now says so, and
why every brief since has.

### Closed — the verification wave

| Lane | Task | Issues | Status |
|---|---|---|---|
| V1 | The loop dead-end and the front door | #206, #207 | **reported**, findings § M–N |
| V2 | The first session and the refused headline numbers | #208, #209 | **reported**, findings § S–T |
| V3 | The nine remaining M2 issues | #210–#218 | **reported**, findings § U |
| V4 | The M0 premises | #186–#193 | **reported**, findings § O–R |

### Closed — M0's document lanes

| Lane | Deliverable | Issues | Status |
|---|---|---|---|
| M0-A | `docs/22-charter.md` | #186, #187, #192 | **adopted**, § D342 |
| M0-B | `docs/23-audiences-and-core-loop.md` | #188, #191 | landed |
| M0-C | `RISKS.md` — 39 ids, none renumbered | #193 | landed |
| M0-D | `docs/24-competitive-teardown.md` | #189 | landed |

**M0 exited 2026-08-24; all eight of its issues are closed on GitHub** (#190 closed as refuted).
**M1 exited the same day. M2 is open.** #209 was closed as refuted and four issues were filed from
findings — **#254**, **#255**, **#256**, **#257** — so the open count went **101 → 93 → 96**.

> **A lane's in-flight deliverable is named here without backticks, and that is deliberate.**
> `validation/citations.test.ts` requires every backticked path containing `/` and ending `.md` to
> exist on disk. This board named three of them while two were still unwritten, and **that broke the
> guard on commit `eb765cc`** — the orchestrator writing the same defect it had put in all four lane
> briefs as a rule. A path becomes a link when its file exists, and not before.

All four lanes were read-only and none modified a file. **#206's mechanism was additionally
re-verified by the orchestrator directly** rather than accepted from a single lane, because it is
the P0 every other M2 issue is sequenced behind.

**Implementation lanes are open now, because M0 and M1 have exited.** They were not open before
that: M0 was documents and decisions only, M1 specifications only, and the one exception — #206 —
was an explicit product-owner fast-track recorded as such rather than a lane that slipped through.

## What the verification wave returned

Thirteen issues settled. **Two are refuted at their central premise**, **eight carry at least one
false or materially misleading clause**, and **three would have shipped a new defect, a reversed
product decision, or a wasted edit** if acted on as written. The repository's measured
inbound-feedback error rate held.

- **#209 is refuted: it was fixed on 2026-08-11, thirteen days before it was filed.** It quotes a
  dated audit as live status — the *"a published number goes stale"* failure mode applied to a
  defect list.
- **#190 is refuted: the positioning question was answered on 2026-08-08 by § D299**, and #190's
  own proposed answer **contradicts** it. Escalated.
- **#212, a P0, is largely refuted.** People, doors and queues are all drawn. The real defect is
  that door leaves paint over the whole car body when shut. A door-fill inversion, not a rebuild.
- **#206 is confirmed exactly**, and is two independent gaps rather than one.

Seven findings in no issue at all were recorded, including a lever button that opens the wrong
screen, a player-facing register making a false claim about the code it cites, and success criterion
S5's published figure being stale in both its numerator and its denominator.

## Baseline recorded at programme open

`c8fd6fa`, clean tree, Linux x86_64, **Node v22.22.2 against a package declaring `>=26`**
(`engine-strict` is not set, so it runs). `npm run build` clean in 8.8 s.

**CI, both platforms, green — and it took fifteen attempts to get one.** Commit `aadaaaf`:
`suite (linux)` **success** (33 min) and `suite (macos)` **success** (56 min), plus `invariant
gates`, `claude review`, `build site` and `deploy`. **This is the first uncancelled CI suite result
on this branch.** The fourteen runs before it were all `cancelled` — by me, pushing faster than CI
could report — so until this commit the branch had the evidentiary value of one with no CI at all,
which is `RISKS.md` **R7** arriving from the direction nobody watches. It is green on the first
commit carrying a **code** change, `#206`'s fix, which is where platform divergence would bite.

**Local suite: 440 files / 440 passed · 8 688 passed, 11 skipped (8 699) · green**, 3 771 s wall clock.
The browser tier **ran** — all 25 `*.browser.test.ts` files among the 440 — with
`ELEVATOR_SIM_CHROMIUM` pointed at the container's pre-installed Chromium, because
`playwright-core`'s pinned revision resolves to a browser this container does not carry. A gated
tier that skips is a red run here, so this is stated as measured rather than assumed: 440 files
exist on disk and 440 ran.

**The skip count is 11.** All eleven are deep-tier opt-ins in `packages/experiments` behind
`describe.skipIf(!DEEP)` / `!deepRequested()` — issue #163's *"the deep tiers have never run in
CI"*. [`GAPS.md`](GAPS.md) records 10 at wave 12 and says it *"has not moved all wave"*; it has
moved by one since. **Nothing in this session could have moved it** — only markdown was edited —
so *when* it moved belongs to #163.

**The wall clock is not comparable to `GAPS.md`'s 1 918 s** and the difference is my sequencing, not
the tree: that figure was taken *"serially on an idle machine with no lanes running"*, while this
ran alongside four verification lanes and then four document lanes on a **4-core** container. The
counts stand; the duration does not. The clean measurement is CI's two-platform matrix.

## Findings from programme open, before any issue was scheduled

1. **Issue #193's defect is a class with four members, not one.** Commit `1b7a2f1` (2026-08-12)
   replaced four project-level registers with wave-scoped boards in a single commit:
   `AGENT_STATUS.md` 1 047 → 17, `TEST_MATRIX.md` 383 → 28, `MULTI_AGENT_PLAN.md` 375 → 82,
   `RISKS.md` 123 → 12. #193 reports only the `RISKS.md` instance. **Its scope should be widened**,
   and every one of the four is recoverable from `1b7a2f1^`.
2. **The waves 1–4 plan is restored**, byte-identical, at `MULTI_AGENT_PLAN-waves-1-4.md` — because
   rewriting that path for this programme is what surfaced the loss, and `packages/viz/UX.md` cites
   a section of it that had stopped existing. The other three are left for #193 to rebuild rather
   than repaired here.
3. **The old `TEST_MATRIX.md` was a different document with the same name** — a project-level
   ledger of integration, e2e, unit and mechanical rows across six sections, carrying a regression
   set marked *must stay green through every merge*, and two hard-won rules about what a row may
   claim: *a fixture-only row is not a covered row* (wave 11) and *a control-only row is not a
   covered row either* (wave 13). The current file is a 21-row journey matrix, a narrower scope.
   **The journey gap the charter names is real and this does not soften it** — but #237 should
   start by recovering the ledger, not by assuming the tree has no coverage record.
4. **Seven `deadCode.test.ts` audits exist, not five.** Derived from disk: `core/src/dispatch`,
   `viz/src`, `server/src`, and `experiments/src/{runner,teaching,tuning,fuzz}`.
5. ~~**`packages/viz/index.html` is 194 KB**, not the 198 KB the kickoff states.~~ **RETRACTED —
   this was not a finding.** The file is **198 182 bytes**: 193.5 KiB at 1024, 198.2 kB at 1000. The
   kickoff's figure and mine are the same measurement in two unit conventions. Caught by lane M0-A
   while writing the charter's corrections table, which is the reverse of the direction these
   corrections usually run. **Recorded rather than deleted**, because a register that quietly drops
   its own withdrawn entries is the thing this file exists to prevent.
6. **The charter carries two figures that do not reproduce from this tree** (three were claimed; see the retraction above), and #186
   adopts the charter — so they are worth correcting *before* adoption rather than after. The pin
   count is **997**, not 981: `benchmark/published.ts` is the only pin table in the tree and it holds
   997 `{ n, mean, standardError, lower, upper }` entries. With the audit count above, that is two. This is
   the repository's own *"a published number goes stale the same way"* rule applied to the document
   proposing to govern it, and the rule's remedy is the same — pin the number to the run, or to the
   command, that produces it.
8. **R25 was broken by the orchestrator minutes after being restored, and the register caught it.**
   Commit `52b2f69` restored `RISKS.md` — including **R25**, *"file-level lane ownership partitions
   editing and does not partition committing: `git add -A` stages the whole repository regardless of
   who owns what"* — and that same commit swept lane M0-B's `docs/23-audiences-and-core-loop.md` in
   unreviewed and without the README row `documentation.test.ts` requires. R25's escalation trigger is
   *"any commit whose diff touches a file its message does not mention"*, and it fired exactly as
   written.

   **CORRECTION, and it is the more useful half.** `245a49d`'s message says *"CI was red on the
   branch between `52b2f69` and this commit"*. **That was never observed.** Every CI run on this
   branch before `553cf8d` was **cancelled** by the next push — `a796710`, `7a51391`, `aac8d17`,
   `52b2f69`, `245a49d` and `6a7447a` all carry `conclusion: cancelled` on the `CI` workflow — so
   **no suite result exists for any commit on this branch**, red or green. What is supportable is
   narrower: the tree was in a state `documentation.test.ts` fails on **by construction**, because
   its assertion requires every `docs/*.md` on disk to appear in README's table
   (`documentation.test.ts:778-790`) and `docs/23` was on disk and absent from it. **"A test that
   would fail" and "CI was red" are different claims**, and only the first had evidence. The
   `Review` workflow — `invariant gates` and `claude review` — *did* complete green on every commit;
   only the suite was cancelled.

   **The process finding underneath it: I was pushing faster than CI could report.** Seven pushes in
   nineteen minutes, each cancelling the previous run's suite. A branch that never lets its own
   suite finish has the evidentiary value of one with no CI at all — which is **R7** arriving from
   the direction nobody watches: not a false green, but **no observation at all**, presented as
   though CI were covering the work. The mitigation is R25's own:
   explicit paths at every `git add` while lanes are running. **A restored register earned its keep
   inside ten minutes**, which is the argument for restoring the other two rather than a consolation
   for this mistake.
9. **[`GAPS.md`](GAPS.md) is 25 days stale, not the six weeks the kickoff states** — its header
   reads *"As of: 2026-07-30, wave 12"*, and it still carries that date's suite figure of
   **262 files / 4 883 tests / 10 skipped**. Six waves have landed since. The staleness is real and
   the correction runs *towards* the document, which is worth saying only because this programme
   corrects figures in both directions or it is not correcting them at all.
10. **A `verbatim` claim in `shift/events.ts` had already been false for two of five entries**, and
   the #216 lane found it while changing a third. The record's docstring read *"Names and notes are
   **verbatim** from `design.html` :1419–1426"* — but the fire drill had lost `, 14:00` to
   [§ D175](DECISIONS.md) and the ordinary note had lost its second person, both before this
   programme opened. It now names the design as the **source** and lists the three deviations.
   Nobody had caught it because nothing checks a prose claim about provenance; the weekday rule
   `events.test.ts` now carries is a guard for the *strings*, not for the sentence about them.
11. **The orchestrator's own commit message omitted that fix**, which is `RISKS.md` **R25** at finer
   grain than the rule states it. R25's escalation trigger is *"any commit whose diff touches a file
   its message does not mention"*; `be7fe82` mentions `shift/events.ts` and describes only the
   string change, while the diff also carries the provenance correction above. **The cause was
   committing a lane's work before the lane reported** — defensible, since the fix was independently
   watched failing and passing and `tsc -b` was clean, but a commit written from a diff the author
   had not yet explained is a commit whose message is a summary of what the integrator noticed. The
   lane's own report caught it. Recorded rather than amended, because the history is accurate even
   where the message was incomplete.
12. **The orchestrator shipped a dead seam, and no existing guard could have caught it.** `d6e00a2`
   committed `rail.ts`'s new `week` option and left `shell.ts`'s `weekRailOptions()` — its only
   supplier — uncommitted, so the rail read a field nothing passed and the shipped card kept
   rendering the refusal the fix retired. Measured on that commit: **one reader, zero suppliers.**
   Closed by `a667957`.

   **The transferable part is why nothing would have flagged it.** `viz/src/deadCode.test.ts` audits
   **exports** — 1 017 of them over 19 directories — and `week` is a **property on an interface**,
   not an export, so the scanner is structurally blind to it. `seam.test.ts` is behavioural but
   scoped to `core`. And `rail.test.ts` passed all 23 cases because it constructs `RailOptions`
   directly: **a fixture proves the mechanism is correct and cannot prove it is reached**, which is
   `RISKS.md` **R26** verbatim.

   So the guard family catches *an exported symbol nobody imports* and misses *an option nobody
   supplies*. For a view option the analogous instrument is not a static audit at all — it is a
   **driven test of the real shell with a real host**, which is what [`TEST_MATRIX.md`](TEST_MATRIX.md)'s
   journey rows are for, and why all twenty-one reading `planned` is the largest testing gap here.
   Worth stating plainly: the reviewer's question *name the non-test caller*, asked of my own commit,
   caught this. **No test would have.**

---

# The Everyday-and-Engineer wave — the prior programme, as it landed

As it landed. All lanes merged; no worktree or lane branch remains.

## What each lane left behind

| Lane | Task | What it left behind |
|---|---|---|
| GAP | Gap analysis vs the ten slices | slices 1/2/5/8 done, 6's mechanism done, 3/4/7/10 partial, 9 missing; the sixteen screens named as the dominant gap |
| B0-S | Three surveys for the Engineer contract | dev/ surface inventory, documentary precedents, challenge-seam map |
| B0 | Engineer-reimagined contract | `docs/21` — the survival ledger, the restyle and MORE contracts, six briefs, lanes B1–B5 |
| A0 | Screen frame | router over all 17 keys, § 3.3 bar as one data table, § 3.2 rail, `everyday/tokens.ts`, `EVERYDAY_SCREENS_BUILT` |
| C | docs/20 polish six | all six closed; two were misdiagnosed in the audit and the fixes say so |
| G | Fix-a-building content | 18 of 18 cases, and `run.ts`'s bank-aliasing defect a second run would have hit |
| A3 | Interventions two and three | the handover and the answered incident on one log; ten review findings fixed; a core test flake diagnosed and annotated |
| B1 | § 19 tokens onto the Engineer shell | the shell is paper ([§ D336](DECISIONS.md)); five § 19 values moved by the contrast floor and pinned as measurements; `SHAFT_TINTS` was mode-blind |
| B3 | The inspector | LIVE METRICS leaves the canvas for a DOM card ([§ D337](DECISIONS.md)); the closed-form plate row states its own basis; the scope-note audit |
| B4 | Authoring the families | six of seven blocks authorable, 37 controls from the schema; `selection` refused on a named ground |
| S7 | Fix-a-building screen | the first registered screen |
| S-HOST | Everyday data host | the `EverydayHost` façade; § 3.4's confirm strip got a real writer |
| S8 | Settings screen | six rows refused for having nothing behind them, each saying so |
| S-STAGE | § 7's stage | the cutaway, the transport, the intervention control — and the hand-off retired |
| SWAP | The door between the worlds | § 3.2's swap and the Engineer return ([§ D338](DECISIONS.md)); found the browser tier red in 25 cases against a working product |
| S-DAILY | § 6's daily loop | door · brief · report · week, and the § 3.3 primary that was dead on every screen's first draw |
| S-CAMP | § 8's campaign | towers · building · contract, over an economy that did not exist |
| S-WORK | § 11 and § 12 | workshop · bench; the six play styles became data |
| S-MISC | § 9, § 13, the tuner | rush · designer · tuner — the last three keys |
| D | The gauntlet | the forty proof cases as data, the rating, the ladder |

## The state at the end of the wave

**Every one of § 4's seventeen screen keys is registered**, so `UNBUILT_REASONS` is empty for the
first time and all four mode tiles open. Both products co-exist: the page opens on Everyday Mode,
§ 3.2's footer row crosses to the Engineer surface, and the Engineer header carries the way back.

Suites, measured on the integrated tree: viz **4 253**, experiments **1 338**, core/server/cli
**2 916**, browser tier **141** — all green, typecheck clean. The honesty corpus was measured once,
after integration: always-on **49 cases / 566 408 strings / 48 surfaces / 0 failures**, deep
**60 / 706 094 / 49 / 0**.

## What is honestly still absent

Named on screen in the products' own registers rather than only here:

- **No rush engine.** No demand template ramps without a ceiling, so § 9's climbing stream cannot be
  generated; the setup screen's primary is inert with the reason on the control, and § 9.3's result
  screen is deliberately unbuilt rather than printing invented figures.

  **That sentence was false for as long as it has stood here, and it is true as of GitHub issue
  #262's fix rather than corrected into something smaller.** The reason was on the *screen* — a
  paragraph 184 px below the fold at 1280 × 720 — and on no control: the primary carried
  `title: null`, `aria-describedby: null`, full primary amber at `opacity: .6`, and the note beside
  it read *"Nothing to set up. It ends when it ends."*, which next to a dead button reads as
  confirmation. It is recorded rather than quietly reworded because this register is where a reader
  goes to find out whether the screen is honest, and a claim that was aspirational for four waves is
  worth more as a caught one than as a tidy one.

  **The class was eight sites wide, not one.** `BarPrimary.inert` was a `boolean`, so four of the
  eight `bar()` refinements that set it happened to put a reason in the row's note and four did not,
  and nothing could tell them apart. The field now carries the sentence, which makes the reasonless
  state unrepresentable; `shell.ts#drawBar` draws it in the **pinned** bar — above the fold at every
  height by construction — and binds it to the button with `title` and `aria-describedby`;
  `screens.test.ts` asserts it over the whole registry, so a screen registered tomorrow fails on the
  commit that registers it. The bench's bar gained a reason it never had: its `mountedBench` handle
  carried a `ready` bit, and now carries `benchFieldRefusal`/`benchTestsRefusal`'s own sentence.
  generated; the setup screen's primary is inert, with the reason in the § 3.3 bar beside it and on
  the control's accessible name, and § 9.3's result screen is deliberately unbuilt rather than
  printing invented figures. **This row said *"with the reason on the control"* from `0dd8cae`
  (2026-08-13) until now, and the reason was on the screen, sometimes** — GitHub issue #262 measured
  it at `scrollY: 0` on the
  deployed build: 905.8 px down a 720 px viewport, 3 443.2 px down the 667 px one
  `docs/31-support-matrix.md` supports, and the button carried no `title`, `aria-label` or
  `aria-describedby` at all. It is the class [`RISKS.md`](RISKS.md) R38 tracks — prose nothing
  re-derives, drifting away from the thing it describes — landing on the register a reader consults
  to find out whether a screen is honest, which is what made the defect invisible. Two browser
  cases now re-derive it: one drives the fold at the matrix's shortest supported height, one reads
  Chromium's own AX node. The `aria-describedby`
  channel is still empty and is `shell.ts`'s to provide (issue #239), so the sentence says *name*
  rather than *description*, which is what a screen module can reach.
- **The daily board needs a server.** The ladder beside it is live because a rating is measured on
  this device; the board's tab carries § 12.2's labelled unavailable state.
- ~~**No campaign day is filed yet** from § 8's screens~~ — **built (GitHub issue #223,
  [§ D400](DECISIONS.md)), and the stated blocker was wrong, which is the half worth keeping.** This
  row read *"marking it cleared or missed needs `closeShift` to know which tower it belonged to"*.
  `closeShift` never needed to know: it writes `ViewerState.week`, the campaign career is
  deliberately not on `ViewerState`, and both facts a filing needs — which tower, and what the run
  read — are inside `everyday/host.ts`'s own closure, where `runCampaignDay` arms them and
  `closeDay` reads them back. A sentence naming the obstacle sends the next reader to the wrong
  file, and this one pointed at a 7 000-line module. **The trip budget was the last thing absent in
  § 8 and it is absent no longer** — § 8.6's fourth test grades from wave J
  ([§ D431](DECISIONS.md#d431), GitHub issue #169), off a `core` measurement of
  `ENGINE_CONTRACT.md` § 5's own run metric; `campaignModel.ts#TRIPS_REFUSAL` is deleted rather than
  reworded, and the same wave gave § 8.3's wear clock the writer it had never had. The sentence
  above said the row was *owned by no issue*, which was true when it was written and stopped being
  true when #169 was filed.
- **§ 7.4's ghost lane** is not drawn: the host exposes no second recording.
- **B2 and B5 of `docs/21`** (Compare/report surfaces, the six engineering briefs) are specified and
  unbuilt.

---

## Where a new agent picks up — written 2026-08-24, end of the charter session

Read [`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md) first, then this section, then
[`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) §§ Y–AD.

### State

**M0 and M1 exited; M2 is open.** Landed in M2: **#206, #211, #213, #214, #215, #216, #207, #200**,
plus the M2 gate instrument. All pushed to `claude/elevator-sim-charter-kickoff-rexfw8` (PR **#253**).

**The M2 gate has an instrument and a number.** `internal-notation` is the ninth honesty property.
It found 19 violations, #207 took the register to **empty in both tiers**, and the box is **still not
ticked** — [§ D347](DECISIONS.md)'s canvas gap is the one thing left.

### Decisions taken this session, and what each obliges

| decision | what it obliges |
|---|---|
| [§ D346](DECISIONS.md) | a control's write-disclosure is **not** internal notation — the gate's number is 19, not 56. Do not widen that clause. |
| [§ D347](DECISIONS.md) | the Everyday stage's words come inside the corpus **before M2 exits**. In flight as FIX-212. |
| [§ D348](DECISIONS.md) | #200 pulled into M2. **Landed.** #208 is unblocked and governed by docs/33 §§ 4.4 and 1.1. |
| [§ D349](DECISIONS.md) | **M2's gate is two halves.** The code half reports *code-complete, playtest pending* and ticks nothing in the tester half. |
| [§ D350](DECISIONS.md) | #217 is split — AC3/AC4 are a small lane, AC1/AC2 are the owner's. |

### The queue, in the order the hazards force

`packages/viz/src/honesty/surfaces.ts` is the tightest serialization hazard in the tree: every lane
that adds a player surface writes it, and it has **no interface to lock first** — an adapter *is* the
surface. `packages/viz/src/everyday/` is the second.

1. ~~**FIX-212** (#212 + § D347)~~ — **landed and verified.** The instrument was untouched, the
   register stayed empty, and both tiers were re-run by the integrator on the committed tree. The
   check that mattered: diff `honesty/properties.ts` and the scope constants against the commit that
   landed them — a lane asked to keep a gate at zero can do it by fixing strings **or** by moving the
   gate, and only a diff tells you which. Do this for every lane that touches `honesty/`.
2. **#217 cleanup** — AC3/AC4 only, per § D350. Touches `everyday/modes.ts`.
3. **The longer day** — product owner ruled: point the Everyday loop at `office-day`'s ten hours and
   fix the speed ladder per § D344. See § AB. **`DEFAULT_SHIFT_LENGTH_S` need not move**; what moves
   is `shift/goals.ts#goalsForDay`.
4. **#208**, then **#210**, then **#218**.

### Owed, and not done

- **Decision numbers** for docs/33's **C6** and **§ 1.5**.
- **O7 — the one to settle first.** Every curve rule judges a stage on the same seeds the player
  tunes against, so *tune until the judged seeds clear* is invisible to all nine, and the one existing
  witness takes it. That is `CLAUDE.md`'s hold-out-seeds discipline unenforced at the campaign layer.
  Closing it changes `judge.ts` and what every published count counts — **a product-owner call**.
- **`CLAUDE.md`'s corpus row is stale and deliberately so.** [§ D343](DECISIONS.md) wants that
  measurement **once, after M2 integrates**. Do not re-measure per branch; this file has recorded that
  lesson five times.
- **§ AD's remaining count sites** — five left, three of which must **not** be changed.
- **`TEST_MATRIX.md`** — T1 is `passing`; the other 21 rows have not been re-verified, and T1 turned
  out to be stale-by-omission.
- **§ N's adjacent finding**, in no issue: `settingsView.ts` tells the player runs are *"re-simulated
  by the server"* on a build whose own register says there is no server. No property reads that role.

### Traps this session actually hit

- **I broke `citations.test.ts` three times**, always the same way: backticking a `.md` path that did
  not exist yet. Run it before every commit that touches a document.
- **A lane's uncommitted work is not yours to commit.** `d6e00a2` shipped a dead seam by committing a
  reader while its only supplier sat uncommitted, with all 23 unit tests green.
- **Never re-measure the honesty corpus on a branch.** Three lanes in one wave produced three correct
  numbers, none of which was correct after integration.
- **Verify the issue before scheduling it.** This session refuted #200's central figure (four of ten →
  **three of ten**), #206's AC4 premise, #217's framing, and two claims of my own.

---

## Wave E — the 2026-08-27 playtest cohort (in flight)

**Opened** 2026-08-27 on base `55f2bca` = `origin/main`. **Integration branch:**
`claude/github-issue-worker-tfg581`, PR **#302**. Seven lanes: six in worktrees, one read-only
verifier run **concurrently with** the build lanes rather than after them, which is the change
GitHub issue #295's own retrospective asked for.

| lane | task | issues | branch | status | next action |
|---|---|---|---|---|---|
| A | WAVE-E1-A | #287 (P0) | `worktree-agent-acc4acea97ce19e81` | in flight | — |
| B | WAVE-E1-B | #288 | `worktree-agent-ad4341180185f9af3` | in flight | — |
| C | WAVE-E1-C | #289, #290 | `worktree-agent-a137e33d73e5b6e16` | in flight | — |
| D | WAVE-E1-D | #291, #294 | `worktree-agent-acc8987f3045d668d` | **merged** `f08be59` | close on merge to `main` |
| E | WAVE-E1-E | #293 | `worktree-agent-aa54a147347d57612` | **merged** `98b7176` | close on merge to `main` |
| F | WAVE-E1-F | #292 | `worktree-agent-ab356710d43b178da` | in flight | — |
| V | WAVE-E1-V | #295 | none — read-only | **complete** | six filed, #295 stays open |

### The integrator's own finding, which no lane could have had

**The owed-decision ratchet sits *on* its ceiling.** Measured on `55f2bca` rather than inherited:
**64 against a ceiling of 64, zero headroom.** Every lane brief in this repository says *put the
argument in a docstring and say a number is owed; the integrator allocates at merge* — correct for a
lane, and **incomplete for a wave**. Three lanes each wrote one marker, the count went to 67, and the
branch could not go green until all three were settled.

Settled at integration as **D375** (the tab title names no world), **D376** (a licence is drawn on the
thing it licenses), **D377** (a corpus seeds every cell a row draws). Added three, settled three:
**net zero, 64 either side of the wave.** `CHARTER_PROGRAMME.md`'s next-free row moved 375 → 378 on
the same commit, because the gate derives it from `DECISIONS.md` and a lane trusting a stale row
reuses a number that is taken.

**The near-miss is recorded at the gate rather than tidied away.** The ceiling was briefly written
down to 63, on an assumption that the base stood there and this wave had cleared one. It had not. **A
ceiling of 63 over a tree of 64 is red for a reason that flatters the wave that wrote it**, which is
the one direction this gate must never be adjusted in — and it would have been indistinguishable, six
months later, from a genuine fall.

**For the next lane:** with no headroom, allocation is no longer deferrable. A lane that follows the
standard brief to the letter now hands the integrator a red gate.

### Two lanes reported something the issue did not contain, and one reported it against itself

- **#291's defect had a twin two sentences away** (`CASUAL_SMALL_PRINT_LEAD`), joined into the same
  paragraph by `reportPanel.ts:1466`. Fixing only the reported entry leaves AC3 red.
- **#293's stale sites were four, not three**, and `RUSH_ABSENCES[3]` itself read *"the five entries
  **below**"* while drawn in Settings with *The drawing board* underneath it — a register row gone
  stale about **where it is drawn**.
- **Lane E caught its own first instrument passing against the defect it was written for.** v1 asked
  whether a docstring named the renderer *anywhere*; the history section named it only to say what it
  does *not* import. Narrowed to the lead, it fails on the base wording.
- **Lane E then corrected its own test report, unprompted.** Two long runs it had reported as
  completing had produced no result — the `exit code 0` was the `| tail` pipeline's, not vitest's.
  It said so rather than letting a false green stand. **That correction is the single most valuable
  thing in the lane's report**, because every other claim in it is only worth what the reporting
  discipline is worth.

### What the integrator has and has not run

**Green on the merged tree:** `npm run typecheck`; `validation/documentation.test.ts` 28/28;
`validation/citations.test.ts` 4/4. Both merged lanes' new instruments **mutation-validated by the
integrator**, not only by the lane that wrote them — and the results differ in the way that matters:
reverting the tab title turns 2 of 4 cases red, while dropping the rush note from the renderer leaves
the import-graph case **green** and the browser case red. An import survives the deletion of the
`append`; Lane E said exactly that and built the browser case for it.

**Run, and the result stated:** the full suite on the integrated tree — **463 files, 9 106 passed, 11
skipped** locally, and **green on both CI legs** at `0c694b1`. The deep honesty tier was **not** run
and the corpus is **not** re-measured: § D343 takes that once, **after this merges to `main`**, and it
is owed to the next session because three lanes added player-facing strings.

**Two CI failures were worked to green, and the first diagnosis was withdrawn.** The count gate caught
its own author's per-branch figure (29 on the branch, 30 integrated). Then the viewport register went
red on **both** legs byte-identically — which ruled out the timing race that had been proposed, since
identical output from two runners is not what a race produces. Root cause: `MEASURE` pinned each
`hidden`/`clip` box to its **current** scroll offset, so reachability was read from wherever the
browser had left the container rather than from the arrival origin. Every control existed everywhere;
only which fell outside the viewport differed, and the two answers were **near complements**.

**The register is unchanged by that fix** — a no-op on the green leg, a definition on the red ones —
and **no register entry was added, deleted or reworded to reach green.**

**Could not be reproduced here, and that is recorded rather than glossed:** CI installs the Chromium
`playwright-core` pins (**1234**); this container has **1194** and the download is blocked. Five local
conditions were green before the fix.

**Unreachable from this container, re-confirmed today:** the PR's Azure preview. `CONNECT` returns
**403**, exactly as § D374 recorded on 2026-08-25. So no landed fix in this wave has been verified
against a deployed artifact, and none is described as though it had been.

---

## Wave F — the 2026-08-27 verifier's own findings (in flight)

**Opened** 2026-08-29 on base `f13d455` = `origin/main` (wave E merged). **Integration branch:**
`claude/github-issue-worker-5rz7vo`, PR **#304**. Five build lanes in worktrees, plus one read-only
triage lane run **concurrently** with them.

All five worktrees were confirmed provisioned at `f13d455` by the integrator, not merely asked to check
— wave B lost two lanes to a stale base and wave E's brief added the check that caught it.

| lane | task | issues | status | next action |
|---|---|---|---|---|
| A | WAVE-F-A | #296 (P1) | in flight | — |
| B | WAVE-F-B | #297 (P1) | in flight | — |
| C | WAVE-F-C | #298 (P1), #301 (P3) | in flight | — |
| D | WAVE-F-D | #300 (P2), #303 (P2) | in flight | — |
| E | WAVE-F-E | #299 (P2) | in flight | — |
| T | WAVE-F-T | 26 unledgered | **complete** | recorded as `ISSUE_TRIAGE_PLAN.md` § C |

### What the integrator changed in the standard brief, and why

**Decision numbers were pre-allocated, D386–D392, one or two per lane.** Every brief in this repository
has said *put the argument in a docstring, say a number is owed, the integrator allocates at merge*.
That instruction is now **actively harmful**: `validation/documentation.test.ts`'s ratchet counts the
literal phrase across `.ts` and `.md` and stands at **64 with zero headroom**, so a lane following the
standard brief to the letter hands the integrator a red gate. Wave E discovered that at its own
integration and said so; this is the first wave to act on it before dispatch rather than after.

Lanes were told: use your number and write **both** the citation and the `DECISIONS.md` section, or take
no number at all — never the phrase. `citations.test.ts` requires a cited `§ Dnnn` to resolve, so the
two halves cannot be split across lanes.

**Two files are wanted by two lanes each, and ownership is declared by function rather than by file.**
`dev/state.ts` — Lane A owns `drivingProfileOf`, Lane D owns `resolvedBuildingOf`, ~60 lines apart.
`batch/report.ts` — Lane E owns `remedyFor`, Lane C owns `answerFor`, ~90 lines apart. A file-level lock
would have serialised four lanes into two.

### The environment differs from the last handoff, and it is measured rather than inherited

- **Node v22.22.2** against `engines.node: >=26`. The last handoff reported Node 26.5. The `EBADENGINE`
  warning is expected and is not an error; typecheck and both test tiers pass on it here.
- **Chromium headless shell r1194** at `/opt/pw-browsers/`, against the **1234** `playwright-core` pins.
  `ELEVATOR_SIM_CHROMIUM` reaches it and the browser tier runs — verified on a real browser file before
  any lane was dispatched, rather than assumed from the handoff.
- **The PR's Azure preview is still unreachable.** `CONNECT` returns **403**, re-measured on #304's own
  stage URL rather than carried over on [§ D374](DECISIONS.md)'s word. **Fourth consecutive wave with no
  fix verified against a deployed artifact.**

### The measurement wave E left owed, half discharged

[§ D343](DECISIONS.md) takes the honesty corpus **once, after integration, never per branch**, and wave E
closed owing it. Measured on `f13d455`, always-on tier: **49 cases · 570 217 strings · 606 simulations ·
51 surfaces · 0 failing**, against the published **569 663** strings — **+554, everything else unmoved**,
which is the shape wave E predicted for itself. The deep tier is still running and **`CLAUDE.md`'s row is
not edited until both halves are measured in one sitting.**

**The figures could not be read off a run at all**, which is why this kept being skipped:
`honesty.test.ts` computes every one of them and prints them with `console.log`, which **vitest 4
intercepts**. `honesty/measure.corpus.test.ts` (`e2626d4`) writes them to a file instead, dumps the
surface **set** rather than only the count, asserts nothing, and is gated on `CORPUS_OUT` so the default
suite does not pay for it. `RISKS.md` R38's own mitigation names the hole it fills — *"published study
intervals already have a guard that re-derives them; prose counts do not"*.

### The triage lane's finding that outranks its own table

**Five of the 26 unledgered issues already carried adjudications — three with allocated decision numbers,
§ D330, § D367 and § D372, posted as GitHub comments on 2026-08-25/26 — and not one reached the ledger.**
Zero ledger mentions across all 26, confirmed mechanically. The ledger is **competing with a second
record**, which is R38 aimed at this board rather than at the product, compounding R42 (*a ruling with no
consumer*).

**And #280 merged on 2026-08-26, silently unblocking #270 and #275.** Both issues' own comments sequence
them behind it; nobody re-read either. **A blocker that clears is not an event this process watches
for** — every dependency in the ledger is recorded as a blocker and none is recorded as a thing to
re-check when its blocker lands.

---

## Wave M — opened 2026-09-02 at `c3953bb`, beside an open sibling wave

**The unusual condition, and the one that shaped every decision below: a second wave was already in
flight.** Pull request #322 is a sibling session's wave L, unmerged, holding twenty-six files
including `honesty/surfaces.ts` and `vitest.config.ts`. Wave M was planned to be disjoint from it
rather than sequenced behind it, and disjointness was **checked per lane** rather than asserted once.

| Lane | Task | Issues | Status |
|---|---|---|---|
| V-159 | Does the wrinkle library exist, and would building it produce a dead seam? | #159 | **reported** |
| V-283 | What do the absence registers hold, and what does their test actually enforce? | #283 | **reported** |
| V-146 | Is the one-register claim still true, and is it still aimed at a live surface? | #146 | **reported** |
| V-177/178 | How much of two umbrella lists is closed by ten waves of work? | #177, #178 | **reported** |
| M-323 | The staleness guard, taken by the integrator | #323 | **landed** |
| M-283 | The three placeholder rows, taken by the integrator | #283, #324 | **landed** |

**All four verification lanes were read-only and none touched a file.** That is worth stating because
it is what made running them concurrently with a sibling wave safe.

### Three of four premises did not survive whole, and the two directions are both represented

The habit this repository has built is *verify before you build*, and its usual payoff is finding an
issue that overstates a defect. **This wave got one of each.**

- **#159 understates the tree.** Its example wrinkle is not in the tree at all, and a five-template
  library with real engine effects and a mechanically enforced single caller already exists.
- **#146 overstates it, but only in aim.** The string is still drawn in one register; the surface it
  was aimed at is no longer reachable from the product that complained.
- **#178 does both, in one item.** Its energy-axis item was built **eleven minutes before the issue
  was filed**, and its Bayesian item is real but its supporting count is wrong by one in the other
  direction.

### What the integrator ran into

**The decision-number gate is worth its keep and it caught me.** § D455 was appended and
`documentation.test.ts` immediately refused the commit: it *derives* the next-free number from
`DECISIONS.md` and compares it with the charter row, which still said D455. The charter is reconciled
to D456 on the same commit, which is the only way that row has ever stayed true.

**The corpus is deliberately not re-measured on this branch.** Two copy keys enter it and two register
entries leave. [§ D343](DECISIONS.md) puts that measurement on the integrator of the integrated tree,
and with #322 open this branch is not it. A forecast is published in the ledger instead, so the next
integrator can check it rather than trust it.

### Verified

`npx tsc -b` clean · `--project viz` **214 files, 4 945 passed, 4 skipped** · `--project experiments`
`src/validation/` + `src/runner/` **31 files, 355 passed, 6 skipped** · `--project viz-browser` on the
touched file **11 passed** · `runner/coreBuildState.test.ts` **12 passed in 17 ms** ·
`runner/parallel.test.ts` **12 passed, run in the state that used to fail the guard**.

---

## Wave N — opened 2026-09-02 at `aea42b5`, on a tree with no sibling wave in flight

**The condition that shaped wave M is gone**: #322 and #326 both merged, no pull request is open, and
this wave had the tree to itself. That changes what is safe — `honesty/surfaces.ts` and
`vitest.config.ts` are no longer held by anybody — and it is why the corpus measurement could be
taken here rather than deferred again.

| Lane | Task | Issues | Status |
|---|---|---|---|
| B1 | Have the R42-class rulings been built, and do their blockers still hold? | #123, #275, #130 | **reported** |
| B2 | What does *blocked on a server* mean at HEAD? | #161, #179, #221, #222, #226, #248 | **reported** |
| B3 | Which tester-gated criteria are actually tester-gated? | #208, #210, #211, #218 | **reported** |
| B4 | Does #237's premise hold four waves later? | #237 | **reported** |
| N-1 | The owner's charter ruling, across four documents | § D456 | **landed** |
| N-2 | The corpus measurement owed under § D343 | § D457 | **landed** |

All four verification lanes were read-only. **Every one found its issue's recorded state wrong**,
which is a worse hit rate than wave M's three-of-four and is the reason snapshot F recommends the
blocked set be re-read every wave until #329 exists.

### What the integrator got wrong, recorded because it was written down first

I wrote *"the row is stale by two waves"* into a scheduled check-in before measuring the corpus, on
the reasoning that `CLAUDE.md` was last touched by wave K while wave L had edited
`honesty/surfaces.ts`. **Measured, wave L moved both tiers by zero and the row was accurate.** The
inference was reasonable and the measurement was cheap, which is exactly the combination this
repository has recorded five times before and now six.

### One claim I checked rather than relayed

Lane B3 reported a human comment on #211 lifting its tester gate. That is load-bearing enough — it
contradicts a snapshot and re-aims an issue — that I fetched the comment thread myself before acting
on it, rather than taking the lane's word. It is there, it is from a different author than the
Claude-generated comments on the same issue, and it is dated three days before the snapshot that
contradicted it.

### Verified

`npx tsc -b` clean · `validation/documentation.test.ts` + `citations.test.ts` **35 passed** ·
the four suites that read the changed documents (`refusalsAreCurrent`, `buildNotes`, `honesty/faults`,
`honesty/honesty`) **4 files, 63 passed, 1 skipped** · corpus measured on the integrated tree, both
tiers, base re-measured first.

---

## Wave O — opened 2026-09-02 at `d4636a5`, one worker, no lanes

Wave N's own hand-off said what to do first: *"#221 first. No blocker, and it gates four other
things."* This wave did that half. It is a single-worker wave rather than a dispatch, because the
work is one seam built end to end and splitting a wire change across lanes is how two lanes each
publish a correct figure that is wrong in the integrated tree.

| Piece | Issue | Status |
|---|---|---|
| `boards()` returns the whole answer, not a third of it | #331 | **landed** `1ebba96` |
| The daily board reads, and a row carries its own `n` | #221 | **landed** `5ea3805` |
| Three refusals the read made false | #221, § D460 | **landed** `75b3071` |
| The corpus, measured on the integrated tree | § D461 | **landed** — +19 strings a case, both tiers, exact |
| The macOS CI leg removed, on the owner's call | § D462 | **landed** — six files claimed two legs and all six corrected |
| The preview deploy stops commenting on pull requests | § D463 | **landed** — `repo_token` withheld, checked against the action's own `action.yml` first |
| One push per wave, not one per commit | working agreement | **landed** — the fix for noise this session generated itself |

### What found the defect, and what did not

The board row drew a mean wait with no denominator. Nothing in this repository would have caught
that except the honesty corpus, and it did, within an hour of the row being written — 49 always-on
cases, all reporting `estimate-without-n`. The row was internally consistent, every number on it was
real, and it typechecked. **A screen can be wrong in a way only a property can see**, and this is the
clearest instance of it since the corpus was built.

The fix reaches the server's wire, which is more than the read half was scoped for. It went in
anyway, because the alternative was either a row that prints a bare mean or a role change that
quiets the property — and `CLAUDE.md` names the second by name as moving the gate.

### What I got wrong, in the order I got it wrong

**I nearly shipped the row.** The seed loop I wrote marked the wait `role: 'estimate'` and set no
`countShown`, which is correct and is why the search fired. Had I written `role: 'observation'` — a
plausible-looking choice for a figure the server measured — the sweep would have been silent and the
defect would have shipped inside the instrument meant to catch it.

**A default parameter ate two test fixtures.** `legs: number | undefined = 312` takes the default
when `undefined` is passed explicitly, so both *"the server sent no count"* cases silently ran with a
count. Both tests passed against the wrong fixture until an assertion said otherwise. Fixed by taking
`null` for *deliberately none*. It is the same shape as this wave's mutation-testing lesson two
sittings ago, where a stub's date coincided with the real one.

**The deep-tier corpus measurement needs `CORPUS_TIER=deep`, not `ELEVATOR_SIM_HONESTY=deep` alone.**
Two runs wrote always-on figures into a file named `deep`. They were caught only because the file
states its own tier on line one, which is why it does.

### The refusal cluster, and the one I did not touch

Five sentences said *this build has no server*. Three are corrected. **Two are not, and that is a
finding rather than an omission**: `everyday/world.ts`'s and `everyday/rushScreenModel.ts`'s speak
about endpoints that genuinely do not exist — a distribution (#327) and another player's rush — so
they are still true and pinned. A lane that had swept all five as *the stale-refusal cluster* would
have replaced two accurate refusals with two inaccurate ones.

### Verified

`npx tsc -b` clean · **viz** 216 files / 4 987 passed · **server** 14 / 337 · **core** 112 / 2 552 ·
**cli** 10 / 158 · **viz-browser** 36 / 216 · **experiments** run separately, sequentially, never in
parallel with another suite · corpus measured on the integrated tree, both tiers, with the base
re-measured first in a detached worktree, where it reproduced its published row **exactly in both
tiers** — the seventh consecutive wave.

---

# Wave P — dispatched 2026-09-04 at `eb5b3b6`

**Opened at `origin/main`, wave O merged, working tree clean, zero open pull requests. Open issues at
the start: 71.**

Wave O's hand-off named the next batch in order: **#332**, **#333**, then **#275 and #329**. This
wave is that batch, with one addition the hand-off could not have known about. A reconciliation pass
over the seven issues filed on 2026-09-01 and 2026-09-02 found, before any lane was dispatched, that
at least two of them describe defects the tree has already fixed. `vitest.config.ts` names GitHub
issue #320 in its own body and says the sentence that issue quotes was retracted; `.gitignore`
line 23 carries #321's first fix with the four-cell measurement in its header, and
`.worktree-setup.sh`'s header carries the second. So the wave opens with three read-only
verification lanes rather than with a build.

## Decision block allocation

Pre-allocated per lane before any lane started, per the working agreement. `CHARTER_PROGRAMME.md`'s
next-free row read **D464** and is the integrator's input rather than a lane's.

| lane | block | may not take |
|---|---|---|
| A — #333 | **D464–D467** | D468 and above |
| B — #332 | **D468–D471** *(reserved; map first, build not yet dispatched)* | — |
| C — #275 | **D468–D471** | D472 and above |
| integrator | **D472–D475** | — |

**The B/C collision is real and is recorded rather than tidied.** Lane B was dispatched as a
read-only mapping task that allocates nothing, and lane C was dispatched afterwards into the block B
had been pencilled for. Only one lane can spend it and lane C is the one that will. If B's build
follows in this wave it takes a fresh block above the integrator's. This is the failure § D404 was
written for, arriving one wave later, and it is written down because two lanes both computing § D336
is how the rule came to exist.

## Lanes

| task | issue | kind | branch | worktree | status |
|---|---|---|---|---|---|
| **P-V1** | #315, #317, #320 | read-only verification | — | main checkout | dispatched |
| **P-V2** | #316, #318, #321 | read-only verification | — | main checkout | dispatched |
| **P-V3** | #324, #325, #327, #328, #329 | read-only verification | — | main checkout | dispatched |
| **P-A** | #333 | build | `fix/issue-333-store-migrations` | `.worktrees/wave-p-lane-a` | dispatched |
| **P-B-MAP** | #332 | architect, investigation only | — | main checkout | dispatched |
| **P-C** | #275 | build | `feat/issue-275-energy-goal` | `.worktrees/wave-p-lane-c` | dispatched |

Three read-only lanes share the main checkout, which is safe because none of them writes. The two
builders have their own worktrees, provisioned by `.worktree-setup.sh` so that built artifacts
resolve against the worktree's own packages rather than the main checkout's. Every lane brief
carries the `pkill -f` prohibition; three concurrent suites in one container is the exact condition
that hazard needs.

## The rulings taken at dispatch rather than at integration

**#333's open question is answered before the lane starts.** The issue left the pre-existing-row
answer as a decision to record. It is recorded: migration 1 adds `legs` as a **nullable** column and
there is no replay backfill in the runner. `BoardEntry.legs` is already `number | undefined` on the
client and a row with no count withholds its mean, so a `NULL` row keeps its rank and its name and
loses a figure the server cannot substantiate. A replay backfill inside a migration runner would
couple schema versioning to the simulation engine and make container startup unbounded, and the
store's own docstring already refuses that shape for `board_key`, calling it a backfill only the
application can write. The lane may return **needs decision** with evidence if it finds the ruling
wrong; it may not quietly pick a different answer.

**#275 needed no ruling and that is the finding.** § D367 permitted the independent energy bar on
2026-08-25, § D106 absorbed the clause on 2026-08-26, and the blocker recorded on the issue was a
pull request that merged hours after the comment naming it. The issue has been unblocked for over a
week and three consecutive waves have passed it over. That is #329's own subject arriving for the
fourth time, on the issue that is the clearest instance of it.

## Wave P closed

| task | issue | outcome |
|---|---|---|
| **P-V1** | #315, #317, #320 | reported; none closed, all three carry residue past the code fix |
| **P-V2** | #316, #318, #321 | **all three closed**, two of them fixed within hours of filing |
| **P-V3** | #324, #325, #327, #328, #329 | reported; #328 and #329 moved to **needs decision**, #325's preferred fix found unsound |
| **P-D** | overlap clusters | **#162 closed as duplicate of #227**; **#161 split into #337, #338 and closed** |
| **P-A** | #333 | **merged** — `d4d2e4f` |
| **P-B-MAP** | #332 | map returned; **#332 is blocked on a product decision**, and the map found **#336** |
| **P-C** | #275 | **merged** — `2808a0a` |

**Verified by the integrator rather than accepted**, each in the lane's own worktree: lane A
`--project server` **15 files / 356 passed** against a base of 14 / 337; lane C `--project viz`
**216 files / 4 999 passed, 4 skipped** against a base of 216 / 4 987. `tsc -b` exit 0 in both
worktrees and again on the integrated tree.

**The B/C decision-block collision recorded at dispatch cost nothing**, because lane B was a mapping
task that allocated no number and its build was not dispatched. The collision that did cost
something was the integrator's own hole convention, and `documentation.test.ts` caught it: see
[`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md) § P.3.

**Both worktrees are kept until the push is confirmed green**, then removed with their branches.
Neither holds uncommitted work.

---

# Wave Q — dispatched 2026-09-04 at `771e65f`

**Five builders in parallel, one integration branch, one regression run.** The combining is the point:
five separate pull requests would cost five ~50-minute suites and five chances to cancel each other,
and the working agreement's *one push per wave* exists for exactly that arithmetic.

## Decision block, sized to the lesson wave P learned rather than to the lanes

Wave P reserved four numbers per lane and spent one each, returning **six** unspent, the most any
block has returned. The cause was sizing a block to a lane when the unit that consumes a number is an
**issue**. So wave Q allocates **one number per lane** and no more:

| lane | issue | number | worktree | branch |
|---|---|---|---|---|
| **Q-A** | #123 origin membership | **D469** | `.worktrees/q-a` | `fix/issue-123-origin-membership` |
| **Q-B** | #277 the stage shows its goals | **D470** | `.worktrees/q-b` | `feat/issue-277-stage-goals` |
| **Q-C** | #341 CSP gate, plus wave P's doc debt | **D471** | `.worktrees/q-c` | `fix/issue-341-csp-gate` |
| **Q-D** | #295's three confirmed defects | **D472** | `.worktrees/q-d` | `fix/issue-295-confirmed-defects` |
| **Q-E** | #204 the accessibility standard | **D473** | `.worktrees/q-e` | `docs/issue-204-a11y-standard` |
| integrator | — | **D474** | main checkout | — |

Every brief carries the same instruction: **if you need a second number, report it and stop.** Taking
the next one is what produced two lanes computing § D336, and asking is cheap.

## The conflict map, declared before dispatch rather than discovered at merge

| file | owner | note |
|---|---|---|
| `packages/server/src/main.ts`, `http/static.test.ts` | Q-A | nobody else may touch `packages/server` |
| `everyday/stageScreen.ts`, `stageScreenModel.ts` | Q-B | Q-D forbidden here |
| `.github/workflows/deploy-viz.yml`, `docs/33`, `docs/25` | Q-C | nobody else may touch `.github` or those two documents |
| `campaign/judge.ts`, `everyday/designerScreen.ts`, `gauntlet/rating.ts` | Q-D | Q-B forbidden here |
| `docs/` new file, `docs/28` § 7.2, `docs/31` § 5 | Q-E | — |
| **`honesty/surfaces.ts`** | **shared, Q-B and Q-D** | both add player-facing copy; both told to keep the edit minimal and localised, integrator resolves |
| **`DECISIONS.md`** | **shared, all five** | all append; a conflict here is certain and is resolved in numeric order |

Two files are deliberately shared rather than assigned. `honesty/surfaces.ts` is shared because both
lanes ship new player copy and the corpus must sweep it; refusing one lane access would ship an
unswept string, which is worse than a merge conflict. `DECISIONS.md` is shared because appending is
what the file is for.

## What each lane was told about its premise

All five premises were verified read-only at `771e65f` before dispatch, and every brief nonetheless
opens with *verify the premise first, and a refuted premise is a successful outcome*. Wave P closed
five issues whose premises had expired, and three of those would have become build lanes if anybody
had trusted the titles. The instruction costs a lane two minutes and has already saved this process
three lanes.

**One brief carries a correction rather than a specification.** Q-B's issue #277 says *four goals* in
its own title and there are **five** since § D468 landed yesterday. A lane building four would drop
the goal the report grades, which is the defect that issue exists to fix, committed while fixing it.
The brief says so in those terms.
