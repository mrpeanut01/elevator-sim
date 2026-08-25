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
| M2-MEASURE | The browser matrix, and the truth of all 22 `TEST_MATRIX.md` rows | M2 exit criteria | in flight — measurement only, changes no source |

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
- **The daily board needs a server.** The ladder beside it is live because a rating is measured on
  this device; the board's tab carries § 12.2's labelled unavailable state.
- **No campaign day is filed yet** from § 8's screens — running one is wired end to end, but marking
  it cleared or missed needs `closeShift` to know which tower it belonged to.
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
