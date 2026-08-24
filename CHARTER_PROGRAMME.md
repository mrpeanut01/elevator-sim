# CHARTER_PROGRAMME

**The page a returning human reads first.** One section per milestone: entry criteria, exit
criteria, the issues in it, the review that closes it, and its current state.

**Opened:** 2026-08-24 · **Branch:** `claude/elevator-sim-charter-kickoff-rexfw8` ·
**Programme state:** **M0 is OPEN** — the product owner opened the gate on 2026-08-24, after the
verification wave reported. M1–M6 are not open.

The plan, the dependency map and the serialization hazards are in
[`MULTI_AGENT_PLAN.md`](MULTI_AGENT_PLAN.md). The lane board is [`AGENT_STATUS.md`](AGENT_STATUS.md).
Evidence for every scheduled issue is in
[`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md).

---

## Programme state at a glance

| milestone | issues | count | gate | state |
|---|---|---|---|---|
| [M0](#m0--concept-and-direction) Concept and direction | #186–#193 | 8 | Direction review | **OPEN** (2026-08-24) |
| [M1](#m1--pre-production) Pre-production | #194–#205 | 12 | Pre-production gate | not open |
| [M2](#m2--vertical-slice) Vertical slice | #206–#218 | 13 | Vertical slice review | not open |
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
| Test suite | measured this session; see [`AGENT_STATUS.md`](AGENT_STATUS.md) |
| Browser tier | gated on `ELEVATOR_SIM_CHROMIUM`; pointed at the pre-installed Chromium |
| Next free decision number | D342 |

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
- [ ] The charter is merged, with a decision number.
- [x] **The positioning question (#190) is closed by a written decision** in
      [`DECISIONS.md`](DECISIONS.md) — [§ D299](DECISIONS.md), reaffirmed by the product owner on
      2026-08-24 and recorded on the issue. Satisfied on entry rather than by work in this milestone.
      **This criterion required no document to be written**, which is the whole value of having
      verified it first.
- [ ] Every pillar and non-goal is stated in a form a reviewer can hold a pull request against.
- [ ] The project-level risk register is restored (#193) — **scope widened at the gate**: not the
      three ids the issue names but the **six that dangle across eleven sites** (R9, R17, R22, R24,
      R25, R26), each recovered or **formally retired with a note saying so**, plus R1/R5/R7/R10,
      which the old file declared permanent, and R27/R28/R29, which it declared project-level.

**Review.** Direction review — one session, whole team, output is a decision record.

**State: OPEN — the gate was opened by the product owner on 2026-08-24.** Verification of all eight issues is
complete — evidence in [`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) §§ O–R.

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
- **The charter is now written** — [`docs/22-charter.md`](docs/22-charter.md), 340 lines, covering
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

**Entry criteria.** M0 exited.

**Character.** Still specification work. The disciplines that currently have no owner get one here:
audio, art direction, telemetry, privacy, accessibility, support matrix, playtest recruitment.

**Exit criteria.**
- [ ] Every deliverable merged and referenced by at least one milestone that will build against it.
- [ ] **No production issue can be opened without a specification it points at.**
- [ ] #202 (privacy posture) lands **before** any telemetry ships — it is a prerequisite for both
      telemetry and accounts, and shipping in the other order is not recoverable.

**Review.** Pre-production gate — go or no-go on the vertical slice scope.

**State: not open.**

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

**Exit criteria — measured, not opined.**
- [ ] **Ten testers who have never seen the game complete the slice.**
- [ ] **Six of ten can state what went wrong and why their change helped.**
- [ ] **Nothing on a player surface refers to a section number, a source filename or a code
      identifier.** This is a mechanical check and it is part of the gate.
- [ ] The slice runs on the target browser matrix from #203.
- [ ] T1 (menu → door → brief → stage → report → week) reads `passing` in
      [`TEST_MATRIX.md`](TEST_MATRIX.md) — it is the test that would have caught #206.

**Review.** Vertical slice review, with recorded sessions.

**State: not open. Verification of all thirteen issues is complete** — evidence in
[`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) §§ M–N, S–U, and dispositions in
[`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md).

**#206 is confirmed exactly and is the first thing to fix** — a game whose loop does not close has
nothing else worth measuring. It is two independent gaps, not one: the stage's primary never
navigates, and the breadcrumb's enabling rule asks *position in the timeline* rather than *does the
destination have anything to show*. Campaign shares the path; Fix a building does not.

**Two of this milestone's five P0s changed shape under verification, and both got smaller.**
**#209 is refuted** — fixed on 2026-08-11, thirteen days before it was filed, with all four of its
acceptance criteria already met and 0 of 100 seeds suppressing. **#212 is largely refuted** — people,
doors and queues are all drawn on the shipped stage; the real defect is that door leaves paint over
the entire car body when shut, which is a fill inversion rather than a renderer rebuild.

**One of this milestone's own exit criteria is already measurably failing**, and the check for it is
cheap: `EVERYDAY_SHELL_ABSENCES` is rendered to the player and carries section numbers, a source
filename and two code identifiers. `honesty/surfaces.ts` already drives that array, so the mechanical
no-identifiers check can be an eighth honesty property with no new plumbing. **Build the check
before the fixes**, so the gate has an instrument rather than an opinion.

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
- [ ] Telemetry shows **S1 through S5 met on a recruited cohort**.
- [ ] **No open P0 or P1 defects.**
- [ ] **All twenty-one journey rows in [`TEST_MATRIX.md`](TEST_MATRIX.md) read `passing`** — today
      all twenty-one read `planned`, which is the single largest testing gap in the repository.
- [ ] #234's criterion is met by an **automated sweep over all dispatchers per stage** (S5), not by
      a judgement.

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
