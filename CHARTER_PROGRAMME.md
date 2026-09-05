# CHARTER_PROGRAMME

**The page a returning human reads first.** One section per milestone: entry criteria, exit
criteria, the issues in it, the review that closes it, and its current state.

**Opened:** 2026-08-24 · **Branch:** `claude/elevator-sim-charter-kickoff-rexfw8` ·
**Programme state:** **M0 and M1 have both EXITED and M2 is OPEN**, all on 2026-08-24. #206 was
fast-tracked ahead of milestone order and has landed, green on both CI platforms. M3–M6 are not
open.

The plan, the dependency map and the serialization hazards are in
[`MULTI_AGENT_PLAN.md`](MULTI_AGENT_PLAN.md). The lane board is [`AGENT_STATUS.md`](AGENT_STATUS.md).
Evidence for every scheduled issue is in
[`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md).

---

## Programme state at a glance

| milestone | issues | count | gate | state |
|---|---|---|---|---|
| [M0](#m0--concept-and-direction) Concept and direction | #186–#193 | 8 | Direction review | ✅ **EXITED** (2026-08-24) |
| [M1](#m1--pre-production) Pre-production | #194–#205 | 12 | Pre-production gate | ✅ **EXITED** (2026-08-24) — 9 of 12, 3 deferred |
| [M2](#m2--vertical-slice) Vertical slice | #206–#218 | 13 | Vertical slice review | **OPEN** (2026-08-24) |
| [M3](#m3--alpha-feature-complete) Alpha, feature complete | #219–#230 | 12 | Alpha gate + feature freeze | not open |
| [M4](#m4--beta-content-complete-and-balanced) Beta, content complete | #231–#240 | 10 | Beta gate + content freeze | not open |
| [M5](#m5--launch) Launch | #241–#246 | 6 | Launch readiness review | not open |
| [M6](#m6--live-operations) Live operations | #247–#252 | 6 | Monthly review | not open |

**Milestones are sequential and gated. No milestone opens before the previous one exits**, with the
single exception the charter allows: M1 may begin on concept artefacts M0 has already accepted.

**Opening a gate and declaring one exited are both human decisions.** The orchestrator prepares the
evidence; it does not open or close a milestone.

---

## The baseline this programme starts from

Measured on this tree at `c8fd6fa`, before any charter work:

| item | value |
|---|---|
| `npm run build` (`tsc -b`) | **clean**, 8.8 s |
| Node | v22.22.2 — **below the declared `engines.node: >=26`** |
| Platform | Linux x86_64, single container |
| Test suite | **440 files / 440 passed · 8 688 passed, 11 skipped (8 699)** · green |
| Browser tier | **ran** — 25 of the 440 files; `ELEVATOR_SIM_CHROMIUM` pointed at the container's Chromium |
| Wall clock | 3 771 s (62 m 52 s) — **contended, not comparable**; see the caveat below |
| Next free decision number | **D489** — wave R reserved **D479–D487** and spent every one, the **second** block to return no holes; **D488 was then taken outside the block**, by the lane that made the browser tier green after integration, for a defect no lane could see on its own branch: a disabled `<select>` still renders its options, so § D482's ghost picker went on saying *your latest saved* over somebody else's day, and the reason it was disabled sat in a `title` where no player reads it. Taken with the reservation already closed and this row reconciled on the same commit, which is the rule when `OPEN_RESERVATION` is `null`. The block itself: D479 an outcome is written to the world that holds the page, D480 the content plan sets targets from arithmetic and the two proof-case towers are authored, D481 the challenge client derives the report window too, D482 the ghost is exposed as a port and a rival that drove the same way says so, and the integrator's five — D483 a test-cost figure is a claim about a machine, D484 the world distribution is a quantile ladder with no typical run, D485 a blocker is a fact in the issue body rather than a state in a register, D486 a submission carries causes and the server derives effects, D487 the corpus move is nineteen a case and two lanes forecast it exactly. The sizing lesson this wave adds: a lane's allocation is one number per issue and an integrator's is a **stream** rather than a batch, because it is spent per finding and a wave's findings are not enumerable at dispatch — this block was widened twice, once reactively and once pre-emptively, and the record of both is in `documentation.test.ts`. Before that, D474 through D478 were taken outside a wave, on a direct request and four product-owner answers in one sitting: D474 the CI policy, one leg per vitest project with cancelling made conditional on the event; D475 every eligible building can carry the first session drawn at random, where *eligible* is a measurement rather than a synonym for shipped; D476 a first-run cover conditioned on derived state is not the override non-goal 10 forbids; D477 Endless rush is kept and its fail state is the lobby overfilling; D478 the arrival-rate band binds the demand selector and an authored case outside it declares itself. Before that, wave Q reserved **D469–D473**, one number per lane, and spent every one with **no holes returned**, the first block to do so: D469 the preview allowlist is membership and the pattern is derived, D470 the stage draws five goals as readings only, D471 the deploy CSP gate names its permitted origins, D472 a shared inflection helper and a guard `everyday/` did not have, D473 the accessibility standard is adopted while its conformance target is not. The sizing is wave P’s lesson applied: a block belongs to the issues it will close rather than to the lanes that close them. Before that, wave P reserved **D464–D471**, spent two, and returned **three holes** plus three numbers never reached: D464 the store gets a versioned migration table, and a row that predates `entries.legs` keeps its rank and loses its count; D468 the energy bar is 80 kJ per delivered leg, derived over 400 pooled seeds rather than chosen, and it does not harden. D465–D467 are holes because § D468 is written above them; lane C’s D469–D471 were reserved and never reached, so they are free rather than holed, and the guard in `documentation.test.ts` is what drew that distinction after the integrator had registered all six as holes and named D472. The sizing lesson stands either way: blocks of four went to lanes that closed one issue each, and one issue closed end to end is one decision however many modules it touches. Before that, wave O took **D458–D463** and closed it: D462 the CI matrix is one leg and D463 the preview deploy stops commenting on pull requests, both the product owner's call on cost, and D462 writes what it gives up into `ci.yml`'s own header rather than dropping it; D458 two product calls on the social layer, the server names the day (#331) and Everyday grows its own sign-in (#332), both taken against #221's implementation map before any of it was built; D459 a mean's denominator is the server's measurement and sits beside the claim rather than inside it, which the honesty corpus found on 49 cases the day the row was written; and D460 a refusal a surface cannot check is withdrawn rather than reworded, three stale *this build has no server* sentences corrected three different ways because they were not wrong in the same way. D461 the corpus move is exactly nineteen strings a case in both tiers, and the nineteen decompose without remainder. Before that, wave N took **D456–D457** and closed it: D456 the honesty pillars are constraints on the session and not the reason for it, the product owner's own ruling, which gives `charter P2` a second refusal test pointing the other way and rewords `charter S6`; and the integrator's D457, waves L and M each moved the corpus by zero, one of the zeros arithmetic. Before that, wave M took **D455** alone and closed it: D455 an ownership boundary is not an absence, so two designer entries left the register by deletion while their words moved to the controls they qualify, and the stage camera stayed because § 7.3 of the handoff lists it. A one-number block, because the wave carried one ruling and the rest of its work was a guard whose own docstring is the record § D405 asks for. Before that, wave K took D443–D454 and closed it: D443 the batch library seam, **D444 a hole**, D445 the bench’s suite is the forty, D446 the seed does not move with the list, D447 the Sound row is a queue item, D448 the Units preference converts, D449 three stated costs measured, **D450 a hole**, D451 an absence deleted whole and re-taken, **D452 a hole**, and the integrator’s D453 a loud conflict a tool cannot resolve and D454 wave K’s corpus move. Three holes in one block, the most any has returned. Before that, — wave J took D431–D442 and closed it: D431 `trips` is one measurement with two lifetimes, D432 the campaign build select is a record, D433 earned progress goes in the Everyday slot, D434 a stored rating is its forty cases, D435 where § 3.3 and § 14.1 disagree the defect condition wins, D436 a route away from a dead seam is the same defect, D437 the corpus runs fitted towers, **D438 a hole** (lane D folded its second subject into § D437, registered under § D430), D439 a board is keyed by the date or by the player, D440 an Everyday run is postable, and the integrator’s D441 two lanes can each be right and be wrong together and D442 wave J’s corpus move — and before it, **D431** — D346 write-disclosure, D347 the gate's own hole, D348 #200 into M2, D349 M2's two halves, D350 #217 split, wave B's ten: D351 the count bound to `data/`, D352 the withdrawn 1280 px rule, D353 the tier's `port: 0` mechanism, D354 the honest speed ladder, D355 the campaign's hold-out seeds, D356 the whole Everyday day, D357 reconcile's re-entrancy, D358 the deletion route, D359 one horizon, D360 the Campaign tab's two batches — and wave C's five: D361 no transactions in `Store`, D362 the tenth honesty property, D363 the rest bar, D364 the cars an incident schedules, D365 four stale claims — and **D366–D374, a block of nine product-owner rulings taken in one sitting**, which landed on `main` from another session while wave C was open and took the number this file published as next-free — and **wave E's three, allocated at integration** as the process says they must be: D375 the tab title that names no world, D376 a licence drawn on the thing it licenses, D377 a corpus seeds every cell a row draws, D378 a viewport gate measures the clause and lands red rather than silent, D379 one answer to when a wait ended, D380 a censored maximum is qualified and is not a lower bound, D381 the tuner applies a spec only when something moved, D382 a sandbox day moves nothing the rail publishes, D383 the Engineer end-of-day close is armed only while the Engineer surface has the page, D384 a stage row describes rather than instructs, D385 the stage's fourth row state is a seed rather than a fourth flag — and **wave F's block, pre-allocated to its lanes at dispatch rather than at integration**, D386–D392, of which **D392** is issue #299's ruling that an instruction about what a control achieves is pinned to a run like a number, and one the control cannot carry out is withdrawn rather than reworded; the other six are their own lanes' to name, and this row is the one place that can go stale if a lane does not land — and **wave G's block, pre-allocated the same way**, D393–D395, of which **D395** is issue #175's ruling that `metrics/serializeRunRecord` and `metrics/runSeed` are deleted rather than wired, because the worked example they existed to spell claimed a replay that a bare `RunRecord` cannot perform; D393 and D394 are their own lanes' to name |

**The skip count is 11, and it is the number this programme was told to watch.** All eleven are
deep-tier opt-ins behind `describe.skipIf(!DEEP)` / `!deepRequested()` in `packages/experiments`
(`matrixCensus`, `collectiveAdoption`, `fuzz/deep`, `perfScaling`, `perfSweep`, `goldenRuns`,
`oracle/deepCampaign`) — the tiers GitHub issue **#163** reports have never run in CI. **The browser
tier did *not* skip**: 440 of 440 files on disk ran, all 25 `*.browser.test.ts` among them, because
`HAS_BROWSER` is `existsSync(CHROMIUM)` and the variable named a real binary.
[`GAPS.md`](GAPS.md) records **10** at wave 12 (2026-07-30) and says the number *"has not moved all
wave"*. It has moved since, by one. **This session cannot have moved it** — nothing but markdown was
edited — so when it moved is a question for #163, not a finding against this work, and it is stated
here rather than quietly reconciled.

**The wall-clock figure is not comparable, and that is my error rather than a property of the tree.**
The local suite was started before the verification lanes and ran concurrently with them and then with
four document lanes, on a **4-core** container at load 4.36. [`GAPS.md`](GAPS.md)'s reference figure of
1 918 s was *"measured serially on an idle machine with no lanes running"*, so the two cannot be
compared. **The pass/fail/skip counts stay valid — only the wall clock is contaminated.** The clean
measurement is CI's two-platform matrix, and that is the figure of record; the local run is reported
beside it with this qualifier attached. Next time the baseline runs first, alone.

**Two further baseline caveats that must not be lost.** First, this container runs **Node 22 against a
package declaring Node ≥ 26**, and this repository has already recorded a case where the same pins
failed in opposite directions on two machines ([§ D201](DECISIONS.md)) — so a suite figure here is a
claim about *this* machine, and the two-platform CI matrix remains the judge. Second,
`playwright-core`'s pinned revision resolves to a Chromium that is **not present** in this
container; the tier was pointed at the pre-installed browser instead. CI's own resolution step is
unaffected.

---

## M0 — Concept and direction

**Issues:** #186 (EPIC, charter) · #187 vision and player promise · #188 the two audiences ·
#189 competitive teardown · #190 the positioning question · #191 core loop statement ·
#192 "done" with criteria that can fail · #193 project-level risk register.

**Entry criteria.** The backlog is verified far enough that the milestone's own premises are known
to be true. Baseline suite and typecheck recorded.

**Character — and this is the constraint that gets broken first.** **Documents and decisions only.
No production code is written in this milestone.** An agent proposing an implementation here is
refused and asked for the specification instead.

**Exit criteria.**
- [x] **The charter is merged, with a decision number** — [`docs/22-charter.md`](docs/22-charter.md),
      adopted by the product owner as [§ D342](DECISIONS.md), which records in the decision itself
      that four of the five pillars are reconstruction.
- [x] **The positioning question (#190) is closed by a written decision** in
      [`DECISIONS.md`](DECISIONS.md) — [§ D299](DECISIONS.md), reaffirmed by the product owner on
      2026-08-24 and recorded on the issue. Satisfied on entry rather than by work in this milestone.
      **This criterion required no document to be written**, which is the whole value of having
      verified it first.
- [x] **Every pillar and non-goal is stated in a form a reviewer can hold a pull request against** —
      charter § 2 gives each pillar an explicit refusal test, and § 5 indexes the non-goals to
      `docs/10` § 5.5 and `docs/21` § 6 rather than restating them.
- [x] **The project-level risk register is restored** (#193) — [`RISKS.md`](RISKS.md), rebuilt with
      **all 39 ids present and none renumbered**. Scope was widened at the gate and the widened scope
      is met: the **six ids that dangle across eleven sites** (R9, R17, R22, R24, R25, R26) all
      resolve again, R1/R5/R7/R10 are back as live rows, R27 is recorded **discharged** by wave 13's
      fifth `awtIsValid` ground, and R28/R29 are live. The wave board the file carried for twelve
      days is kept in an appendix rather than deleted. **R37 is new and is the class itself** — a
      project that loses its own registers to a wave-opening commit will do it again.

**Review.** Direction review — held 2026-08-24. **Output: [§ D342](DECISIONS.md) and
[§ D343](DECISIONS.md).**

**State: ✅ EXITED 2026-08-24.** Opened and exited the same day, by the product owner, with all four
criteria met and every one of the eight issues closed on GitHub. Verification of all eight is in
[`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) §§ O–R.

**The milestone's cheapest criterion was the one nobody had to work.** Exit criterion 2 was satisfied
**on entry**, by a decision that already existed, and finding that out cost one verification lane an
afternoon instead of costing a documentation lane a week.

**#190 is CLOSED, and exit criterion 2 is already satisfied.** #190 stated the positioning question
*"has never been answered in writing"*. It was answered on 2026-08-08 by [§ D299](DECISIONS.md),
*"the positioning decision, taken by the product owner"* — and **#190's own proposed answer
contradicted it**, so working it as written would have silently reversed a decision six sections of
[`docs/21-engineer-reimagined-contract.md`](docs/21-engineer-reimagined-contract.md) are built on.
**The product owner ruled on 2026-08-24 that § D299 stands.** #190 was closed as `not_planned` with
the refutation written into the issue rather than dropped. Superseding § D299 remains available as a
separate, explicitly-scoped decision; nothing in this milestone does it by accident.

Three more M0 issues need rescoping rather than refuting: **#188** (five roles are already defined in
`packages/viz/UX.md`, not zero), **#189** (a cited four-title prior-art survey already exists; the
*teardown* does not), **#191** (both `README.md` and the design-canonical handoff already state a
loop, the latter per mode).

Two findings bear on the milestone directly:

- **#193's defect is a class, not an instance.** The commit that overwrote `RISKS.md`
  (`1b7a2f1`, 2026-08-12) overwrote `MULTI_AGENT_PLAN.md` in the same sitting, replacing 373 lines
  of the waves 1–4 record — including the five recorded process mistakes `WAVE5_PLAN.md` calls *"the
  most transferable thing that delivery produced"* — with an 80-line wave board. That record is
  restored byte-identical at `MULTI_AGENT_PLAN-waves-1-4.md`. **#193's scope should be widened to
  the class**, and the sweep should ask which *other* project-level registers that commit touched.
- **The charter is now written** — [`docs/22-charter.md`](docs/22-charter.md), covering
  #186, #187 and #192. **It is drafted, not yet adopted:** adoption is the decision entry, which is
  allocated at integration, and the document carries no `§ D` citation of itself until that entry
  exists. Read its § 8 first — it is honest that **only pillar 3's wording is directly attested**
  (`MULTI_AGENT_PLAN.md:75`) and that the other four pillars are reconstruction, since the kickoff's
  charter text is not in this tree. **Amending a pillar is a human decision** and belongs at the
  direction review.

---

## M1 — Pre-production

**Issues:** #194 (EPIC, GDD) · #195 art direction · #196 audio brief **or a written cut** ·
#197 UX flow maps including failure paths · #198 vertical slice definition · #199 content plan ·
#200 difficulty curve · #201 telemetry schema and KPI set · #202 privacy, consent and retention ·
#203 platform and browser support matrix · #204 accessibility standard · #205 playtest programme.

**Entry criteria.** M0 exited — met 2026-08-24.

**Character.** Still specification work. The disciplines that currently have no owner get one here:
audio, art direction, telemetry, privacy, accessibility, support matrix, playtest recruitment.

**Exit criteria.**
- [ ] Every deliverable merged and referenced by at least one milestone that will build against it.
- [ ] **No production issue can be opened without a specification it points at.**
- [ ] #202 (privacy posture) lands **before** any telemetry ships — it is a prerequisite for both
      telemetry and accounts, and shipping in the other order is not recoverable.

**Review.** Pre-production gate — held 2026-08-24. **Go on the vertical slice scope.**

**State: ✅ EXITED 2026-08-24, on nine of twelve issues, with three deferred as a named deviation.**

**The exit test is the second criterion, not the first**: *no production issue can be opened without
a specification it points at*. Every one of M2's thirteen issues now points at one — the slice
definition, the flow maps, the art direction, and the audio decision between them cover the set.

| landed | issue |
|---|---|
| [`docs/25-vertical-slice.md`](docs/25-vertical-slice.md) | #198 |
| [`docs/26-telemetry-and-privacy.md`](docs/26-telemetry-and-privacy.md) | #201, #202 |
| [`docs/27-flow-maps.md`](docs/27-flow-maps.md) | #197 |
| [`docs/28-art-direction.md`](docs/28-art-direction.md) | #195 |
| [`docs/29-audio-direction.md`](docs/29-audio-direction.md) | #196 — decided, [§ D344](DECISIONS.md) |
| [`docs/30-playtest-programme.md`](docs/30-playtest-programme.md) | #205 |
| [`docs/31-support-matrix.md`](docs/31-support-matrix.md) | #203 |
| [`docs/32-game-design.md`](docs/32-game-design.md) | #194 |

**Deferred to before M4, by product-owner decision, and recorded here so the debt is not silent:**
**#199** content plan, **#200** difficulty curve, **#204** accessibility standard. None of the three
gates an M2 issue. #200 in particular now has a prerequisite it did not have this morning —
[§ D345](DECISIONS.md) amended what difficulty is allowed to move, so the curve is specified against
a settled clause rather than a contested one.

**The milestone produced two decisions and four findings nobody had asked for**, which is the
argument for having run it: [§ D344](DECISIONS.md) (audio ships, on a narrower palette than the
issue proposed), [§ D345](DECISIONS.md) (difficulty may raise the stakes and may not move the bar),
and issues **#254**, **#255**, **#256**, **#257**.

**State at open (superseded):** Three lanes are running on the highest-leverage deliverables:
**#198** the vertical-slice definition (it gates every M2 build issue), **#201 + #202** telemetry and
privacy in one document with privacy first (that order is not recoverable, and `RISKS.md` R31 records
that five of the ten criteria cannot be evaluated at all until it lands), and **#197** the flow maps
(they gate #210 and are what `TEST_MATRIX.md`'s twenty-one `planned` rows should be derived from).
The remaining nine issues are not yet scoped.

---

## M2 — Vertical slice

**Issues:** #206 the loop dead-end (P0) · #207 the front door sells absences (P0) · #208 no problem
to solve (P0) · #209 tutorial building refuses both headline numbers (P0) · #210 first-run
experience (P0) · #211 cut copy without losing a claim · #212 rebuild the stage (P0) · #213
actionable report advice · #214 rail contradicts the week screen · #215 "ATTEMPT 4" after one run ·
#216 Monday described as Tuesday-shaped · #217 promote Fix a building · #218 hold the slice review
(P0).

**Entry criteria.** M1 exited. #198's slice definition and quality bar exist. #197's flow maps exist,
because #210 builds against them.

**Character.** The first code milestone, and the first genuine go or no-go on the game.

**Exit criteria — measured, not opined. And they are two halves, not one list
([§ D349](DECISIONS.md)):** a **code half** the orchestrator drives to done, and a **tester half**
no agent lane can reach. The milestone stays formally open until a human runs
[`docs/30-playtest-programme.md`](docs/30-playtest-programme.md)'s tier ladder — the code half being
finished reports as *code-complete, playtest pending* and **ticks nothing below it**. Six gates need
first-time testers: the three marked **[tester]**, plus #208's AC4, #210's AC5 and #218's recorded
sessions. The build those testers would use is not reachable from this container either — § X
measured the preview answering `403` to `CONNECT`.

- [ ] **[tester]** **Ten testers who have never seen the game complete the slice.**
- [ ] **[tester]** **Six of ten can state what went wrong and why their change helped.**
- [x] **MET — Nothing on a player surface refers to a section number, a source filename or a code
      identifier.** This is a mechanical check and it is part of the gate. **It now has an
      instrument, and a number: 19 → 0.** `internal-notation`, the ninth honesty property, landed on
      2026-08-24 and was watched failing first — 49 of 49 always-on cases. Nineteen findings are
      registered in `honesty.test.ts`'s `OUTSTANDING` (seventeen in both tiers, two the deep tier
      alone reaches). **This box is ticked when that register is empty and at no earlier moment.**
      **#207 has landed and the register is empty in both tiers** — verified by the integrator on the
      committed tree, always-on 68 passed and deep 25 passed. The six registers moved to a
      build-information panel in Settings that is a real non-test caller of all six arrays, so the
      dead-code audit that put them on player surfaces does not re-fire, and **no register lost a
      row**. Two gaps the instrument cannot see are recorded in
      [`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) § Y: the Everyday stage's
      canvas, and three register headings outside the corpus. **Both are now closed.** The headings
      by construction — their renderers are gone and the new panel's own headings are seeded. The
      canvas by [§ D347](DECISIONS.md)'s lane, which moved the Everyday stage's words out of the DOM
      mount into a pure seam the corpus drives, including the live `riders/capacity` figure that no
      property could read. **Ticked 2026-08-24**, register empty and both tiers green, verified by
      the integrator on the committed tree.

      **Two bounds a reader should carry.** The gate checks **notation, not truth**
      ([§ D350](DECISIONS.md)): a false sentence carrying no notation passes it. And it is scoped to
      the player-facing adapters, derived from `covers` — a screen that never registers an adapter is
      a screen this criterion has never read. The criterion does **not** reach a control's own write-disclosure
      ([§ D346](DECISIONS.md)), which is why the number is 19 and not 56.
- [ ] The slice runs on the target browser matrix from #203.
- [ ] **[tester]** **`charter S6` — a player can say, unprompted, what a refusal means for their next
      change**, on at least six of ten, **and no tester is stopped by one**. Reworded 2026-09-02
      ([§ D456](DECISIONS.md)); the zero-tolerance half is new and this row is harder than it was. **Placed here at the 2026-08-24 review, and the placement is open to the
      owner**: it was gated at no milestone at all until then (see the note below). Measured by
      `docs/30-playtest-programme.md`'s tier ladder, where **only a tier-0 answer counts** — one the
      tester reached with no word from the moderator naming the figure or the refusal.
- [x] **MET — T1 (menu → door → brief → stage → report → week) reads `passing` in**
      [`TEST_MATRIX.md`](TEST_MATRIX.md) — it is the test that would have caught #206.
      **Ticked 2026-08-26, and it was met before it was ticked.** `TEST_MATRIX.md` has read
      `passing` since the M2-MEASURE lane, with
      [`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) § Z as the run behind it —
      *"Verified 2026-08-24 by running the browser tier, not by reading the matrix"*, 6 of 6 — and
      **this box stayed unticked for two days over evidence that already existed.** That is the
      shape this gate exists to catch, landing on the gate itself.

      **Not ticked from that row either.** § Z's figure was taken at `000852a` and forty-five
      commits have landed since, so the case was **re-run on the integrated tree**:
      `npx vitest run --project viz-browser --no-file-parallelism`
      `packages/viz/src/everyday/dailyLoop.browser.test.ts` → **6 passed, 18.81 s**, on
      `claude/github-issue-worker-9ol0cy` at `b20cace`. A box ticked from a stale row is what the
      box is for.

      **Two bounds a reader should carry.** The tier launched from
      `browserTier.test-helper.ts#PROVISIONED_FALLBACK` with `ELEVATOR_SIM_CHROMIUM` **unset** —
      which contradicts that helper's own docstring (*"on every machine this repository has been
      measured on since, it does not exist, and the tier skips"*) and
      [`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md) W18-5. Both were true when written; this
      host has one. And T1 is **passing across two cases, not one continuous drive** — § Z says so,
      and the seam is between the filing case and the week case.

**Review.** Vertical slice review, with recorded sessions.

**State: not open — with one fast-tracked exception.** **#206 is being fixed now**, ahead of
milestone order, by product-owner decision on 2026-08-24. The charter's own § 7 lists it as an
immediate next action, it is a defect fix rather than a feature so it needs no specification, and
every journey test written before it lands asserts a dead end. **No other M2 issue is open.**

**Verification of all thirteen issues is complete** — evidence in
[`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) §§ M–N, S–U, and dispositions in
[`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md).

**#206 is confirmed exactly and is the first thing to fix** — a game whose loop does not close has
nothing else worth measuring. It is two independent gaps, not one: the stage's primary never
navigates, and the breadcrumb's enabling rule asks *position in the timeline* rather than *does the
destination have anything to show*. Campaign shares the path; Fix a building does not.

**Three of this milestone's five P0s changed shape under verification, and all three got smaller.**
**#209 is refuted** — fixed on 2026-08-11, thirteen days before it was filed, with all four of its
acceptance criteria already met and 0 of 100 seeds suppressing. **#212 is largely refuted** — people,
doors and queues are all drawn on the shipped stage; the real defect is that door leaves paint over
the entire car body when shut, which is a fill inversion rather than a renderer rebuild. **That fill
is now measured**: the occupancy marks read `paper` on `ink` at 14.54:1 while the doors are open and
`paper` on `sun` at **1.83:1** once they shut — exactly the ratio [§ D336](DECISIONS.md) measured and
refused for text on this palette. **And #212's second defect was refuted in turn, by this
programme's own rewrite of it**: the orchestrator repeated a stale docstring
(`stageScreen.ts:634-638`, *"06:00 on the clock"*) as fact. `startOfDayMin` is per-template and the
shipped default is **08:30**, ramping from its first second, so there is no empty opening on the
common run at all. Corrected on the issue.

**One of this milestone's own exit criteria was measurably failing when this milestone opened**, and
the check for it was cheap: `EVERYDAY_SHELL_ABSENCES` was rendered to the player carrying section
numbers, a source filename and two code identifiers. `honesty/surfaces.ts` already drove that array,
so the mechanical no-identifiers check needed no new plumbing. **Build the check before the fixes**,
so the gate has an instrument rather than an opinion.

**Both halves have now happened, in that order.** The check is `internal-notation`, the **ninth**
honesty property (not the eighth — `withheld-figure-published` had already landed). It was watched
failing first, at 49 of 49 always-on cases, then **19 findings were registered**. #207 then took the
register to **empty in both tiers**, and the registers themselves moved to a build-information panel
in Settings that is a real non-test caller of all six arrays — so the dead-code audit that put them
on player surfaces in the first place does not re-fire.

---

## M3 — Alpha, feature complete

**Issues:** #219 (EPIC) · #220 endless rush engine · #221 turn on the social layer · #222 seed the
boards · #223 campaign days must file · #224 progress must survive the tab · #225 the Sandbox
verdict · #226 ghost racing second recording · #227 six engineering briefs · #228 custom dispatchers
reach Compare/suite/Lab · #229 Settings must not be a list of refusals · #230 correct stale
statements on player-facing surfaces.

**Entry criteria.** M2 exited on measured results.

**Exit criteria.**
- [ ] **No shipped surface carries a refusal caused by an unbuilt feature.**
- [ ] Every mode is completable end to end **without leaving the mode** (S10).
- [ ] The feature list is frozen, and the freeze is **recorded**.

**Review.** Alpha gate and feature freeze. **The freeze is a human decision.**

**State: not open.** Many pre-existing open issues are the concrete children of this milestone —
#156 (rush engine), #160/#181 (campaign filing), #164 (progress dies with the tab), #161/#179
(server-dependent half), #167/#162 (Compare and the briefs), #168 (ghost), #170 (Settings rows).
The mapping is produced by verification and lands in
[`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md).

---

## M4 — Beta, content complete and balanced

**Issues:** #231 (EPIC) · #232 expand the building set · #233 expand Fix a building + authoring
pipeline · #234 rebalance the campaign · #235 traffic-realism programme · #236 tune difficulty
against measured behaviour · #237 build the twenty-one journey tests · #238 performance budget in
CI · #239 accessibility sweep · #240 small-screen and touch layout.

**Entry criteria.** M3 exited with a recorded feature freeze.

**Exit criteria.**
- [ ] Content freeze, **recorded**.
- [ ] **`charter S1` through `charter S4` met on a recruited cohort, measured by telemetry** — and
      **`charter S5` met by an automated sweep**, which is a different instrument. This line used to
      read *"telemetry shows S1 through S5"*; charter § 4 assigns `charter S5` to a paired sweep over
      every stage × dispatcher under common random numbers, so telemetry can never show it. Four are
      telemetry's and the fifth is not. (Cite the series with its document — [§ D343](DECISIONS.md).)
- [ ] **`charter S7` — an enthusiast rates the model credible after inspecting it**, a majority of
      at least five recruited practitioners. **Placed here at the 2026-08-24 review, and the
      placement is open to the owner.** *After inspecting it, not after being told about it* is a
      structural constraint on the session, not a wording preference — `docs/30`'s cohort-B protocol
      has no advocacy segment, and the moderator's only answer to *"is this right?"* is *"what would
      you check?"*
- [ ] **No open P0 or P1 defects.**
- [ ] **All twenty-one journey rows in [`TEST_MATRIX.md`](TEST_MATRIX.md) read `passing`** — today
      all twenty-one read `planned`, which is the single largest testing gap in the repository.
- [ ] #234's criterion is met by an **automated sweep over all dispatchers per stage**
      (`charter S5`), not by a judgement — and **no test derives that count across all ten shipped
      stages today**, which is why its published figure went stale twice without failing anything.
      Building the sweep *is* the instrument.

**Review.** Beta gate.

**State: not open.**

---

## M5 — Launch

**Issues:** #241 (EPIC) · #242 error monitoring and incident runbook · #243 launch checklist ·
#244 landing page · #245 player support surface · #246 release notes and versioning.

**Entry criteria.** M4 exited on a content freeze and a measured cohort.

**Exit criteria.**
- [ ] Launch checklist complete — browser matrix, cold-load budget (S9: under 3 s on a mid-range
      laptop), save migration, rollback.
- [ ] **A rollback has been rehearsed rather than written down.**

**Review.** Launch readiness review. **Any deploy is a human decision.**

**State: not open.**

---

## M6 — Live operations

**Issues:** #247 (EPIC) · #248 operate the daily challenge · #249 content cadence · #250 KPI
dashboard and monthly review · #251 community and feedback loop · #252 ladder and season reset
policy.

**Entry criteria.** Launched.

**Exit criteria.** Continuous. **The monthly review is the gate.**

**The one rule this milestone must not lose:** the community and feedback loop (#251) **preserves
verify-before-schedule**. Inbound feedback on this product has a measured error rate high enough
that acting on it unverified has repeatedly caused harm — five of six lanes in one wave found the
reported issue's own claim to be wrong. A community loop that schedules from reports directly
would industrialise that.

**State: not open.**

---

## Two criteria were gated nowhere, and that was this page's defect

**`charter S6` and `charter S7` appeared nowhere in this file until 2026-08-24.** M4 gated
`charter S1`–`S5`, M5 gated `charter S9`, M3 and M4 gated `charter S10` — and the two that can only
ever be met by a moderated playtest were checked at no gate at all. The programme's definition of
done requires all ten *met and measured*, so two of them were binding in the charter and
unreachable in the plan.

Found by the `docs/30-playtest-programme.md` lane (#205) while mapping its protocol onto the gates
that would consume it, and **recorded rather than quietly patched**, because a criterion that is
absent from every gate fails in exactly the way a criterion is supposed to make impossible: nothing
ever comes back to check it. The placements above are the lane's proposal, adopted at the review and
open to the owner to move.

**One measurement rule travels with them.** The six-of-ten bar is a *count*, never a rate: the
Clopper–Pearson 95 % interval for 6/10 is **[26 %, 88 %]**. `docs/30` forbids publishing any rate
from this programme with an interval, or generalising one to *players*. A gate that reads *six of
ten testers* is a decision rule about ten people, and it is honest only while it stays that.

---

## Definition of done for the whole programme

- [ ] Every milestone has exited against its own criteria, **recorded rather than asserted**.
- [ ] S1–S10 are met **and measured**, not claimed.
- [ ] All twenty-one journey rows read `passing`.
- [ ] The honesty corpus covers every player-facing surface and is green on both tiers.
- [ ] No shipped surface carries a refusal caused by an unbuilt feature.
- [ ] Every mode is completable end to end without leaving the mode.
- [ ] The pins are unmoved, or every movement is explained and accepted.
- [ ] [`GAPS.md`](GAPS.md), [`RISKS.md`](RISKS.md) and [`README.md`](README.md) describe the build
      that actually exists.
- [ ] Remaining risks are documented and **accepted by a human**.
