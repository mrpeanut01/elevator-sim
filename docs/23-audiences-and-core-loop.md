# 23 — Audiences and the core loop

**Status: M0 concept artefact. Written 2026-08-24 on the charter programme branch, against issues
#188 (the two audiences) and #191 (the core loop statement), and answering the dependency #217
names.** Documents and decisions only — nothing here changes a `.ts` file, a `data/*.json` file, or
a shipped string.

**This is the sibling of [`docs/22-charter.md`](22-charter.md), and the charter delegates to it
twice by name.** Charter § 3 carries a five-row summary of the two audiences and states that it *"is
not the definition of record"*, naming this file as the full treatment and the reconciliation of the
five roles as an M0 exit item. Charter pillar **P5** — *plain language is not less information* —
ends by delegating *"the rule for how one figure is worded two ways"* here; it is § 1.4 below. **The
charter governs; this document discharges two of its obligations and adds none of its own.** Where
the two touch, the charter's wording wins and this file supplies the detail beneath it.

**This document does not open on a blank page, and that is the first thing to know about it.** Both
issues state that their subject has never been written down, and both premises are **partially
false** — verification traced five existing role definitions and a per-mode loop table to file and
line ([`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § Q). Writing two fresh
audiences and one fresh loop over the top of those, without saying which document is authoritative
for what, would give this repository **two role inventories with neither superseding the other** —
which is the stale-statement defect class [`CLAUDE.md`](../CLAUDE.md) exists to record, manufactured
on purpose. So § 2 is the reconciliation, and it is the load-bearing section of this file.

---

## 0. What this document decides, and what it does not

**Decides.** Who the product is for, what each audience must have by the end of a first session, the
observable condition that says whether they got it, the core loop in one quotable paragraph, and
what every shipped mode's declaration against that loop is.

**Does not decide.** Mode ordering, the default entry point, or the front door's structure. Issue
#217 asks that Fix a building be promoted to the front of the game; **the loop statement below is
written from Fix a building, as #217 asks, and the positioning change is not taken here.** Cutting,
merging or re-ranking a shipped mode is a human decision
([`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) § 9) and an M2 one. What § 4 and § 6 contribute is
an argument #217 does not itself make: Fix a building is the only shipped mode whose **fifth beat is
reachable**, which is a structural reason rather than a quality judgement.

**Governed by, and not reopened by, this document:** [§ D299](../DECISIONS.md) — *two products, one
engine*. Casual and Engineer are two doors into one building, not one product with a depth slider,
and **Casual carries full capability**. Every definition below is written so that it cannot be read
as licensing a capped Casual product, because § D299 § 2 forbids exactly that.

**Also governed by, and not reopened:** [`docs/22-charter.md`](22-charter.md)'s five pillars and its
ten success criteria S1–S10. Nothing below amends a pillar, adds a criterion, or restates one in
different words. The conditions in § 1 are **numbered A1–A4 and B1–B4** precisely so they cannot be
mistaken for charter criteria, and each names the charter criterion it serves.

---

## 1. The two audiences

Two, not five. The five roles in [`packages/viz/UX.md`](../packages/viz/UX.md) answer a different
question and are reconciled in § 2 rather than replaced.

### 1.1 The curious player

**What they arrive with.** No lift knowledge and no vocabulary for it. Roughly ten minutes of
patience. They arrived from a link, they did not come to learn anything, and they will leave the
moment the screen asks them a question they cannot parse.

**What they must get in the first session.** A building that is visibly failing somebody, a reason
they can say out loud in their own words, and one change of their own that the product agrees
helped.

**They must never be required to know what AWT stands for.** That is a hard clause, not an aspiration:
the design handoff already fixes the vocabulary that replaces it — *away inside a minute* and *the
longest anybody stood* are the two figures named as the game's spine
(`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 2, lines 64-96).

| # | Observable success condition | How it fails | Instrument |
|---|---|---|---|
| **A1** | Within **90 seconds** of a first load, with nothing configured, a queue is on screen that the building is visibly not draining | The first session is quiet and the player has nothing to be curious about | Measured. **Failing today**: [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § S swept 100 consecutive seeds at the shipped day-one configuration — worst wait ≤ 60 s on **91 of 100**, `AWT SUPPRESSED: 0 of 100`, median 40 arrivals over the hour |
| **A2** | Within **3 minutes**, the player can state what is wrong in a sentence containing no engine term | They watch something happen and learn nothing from it | Playtest. This is exactly [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2's *"six of ten can state what went wrong and why their change helped"* |
| **A3** | Before they leave, they make **one change**, re-run **the same crowd**, and read a verdict they did not grant themselves | They change something and nothing tells them whether it worked | Journey test. Only **Fix a building** does all three without leaving the screen (`packages/viz/src/fixit/run.ts:285` `runFixitPair`) |
| **A4** | **No string on a player surface names a section number, a source filename or a code identifier** | The player is shown the development team's notes and concludes the product is not for them | Mechanical. **Failing today**: `packages/viz/src/everyday/shell.ts:113-153` and `packages/viz/src/everyday/rushScreenModel.ts:269-278` carry `§ 6.1`, `§ 9.2`, `live/timeline.ts`, `dev/reportPanel.ts#LEVER_SURFACES` and `rushScreenModel.ts#RUSH_PRIMARY_REFUSAL` on surfaces a player reads |

**Which charter criterion each serves.** A1 is the audience-side reading of **S1** (*a building in
visible trouble within 90 s*) and of the promise's first clause. A2 and A3 together are **S2** (*60 %
of first sessions complete one diagnose–change–prove cycle*), with A2 additionally serving **S6**
(*6 of 10 can state, unprompted, why the simulator refused a number*). A4 has no charter criterion of
its own and is closest to **S8**; it is stated here because it is the clause a plain-language product
fails first, and because it is cheap to mechanise.

**A1 and A4 are already measurably failing**, and both are named here rather than softened.
[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2 proposes the instrument for A4 — an eighth
honesty property over `honesty/surfaces.ts`, which already drives `EVERYDAY_SHELL_ABSENCES` — so the
gate gets a measurement rather than an opinion. **A1's instrument does not exist**: charter § 4
records that `grep -ril telemetry packages/*/src --include='*.ts'` returns **0 files**, so S1, S2,
S3 and S4 have no funnel behind them. Every condition in § 1 is therefore also written to be
checkable by a moderated playtest, so that M2's gate does not wait on M1's telemetry.

### 1.2 The enthusiast or practising engineer

**What they arrive with.** Domain knowledge, and a working suspicion that the model is fake. They
have seen tower sims before and they expect the numbers to be decoration. They are not looking for a
game; they are looking for the place where the product overclaims, and they will find it in under
ten minutes if it exists.

**What they must get in the first session.** Four things, all reachable without asking anybody: the
closed-form check the simulation is held against, the seed, a paired interval, and the grounds on
which a mean is refused. **Their loyalty is bought by the model surviving scrutiny**, which means the
refusals matter more than the results — a product that declines to answer is the only kind whose
answers are worth anything.

| # | Observable success condition | How it fails | Where it is served today |
|---|---|---|---|
| **B1** | The **closed-form Barney/CIBSE round-trip** figures are on a screen, beside the simulated ones, with the basis stated | They assume the arithmetic is invented | `packages/viz/src/dev/buildingEditor.ts:1449`, `packages/viz/src/dev/rightRail.ts:894,1053`, driven by `packages/viz/src/dev/closedFormPlate.browser.test.ts` |
| **B2** | The **seed** is visible, copyable, and the copied line reproduces **the run they were looking at** | They cannot replay what they just saw, so nothing they see is checkable | **Partially failing today, and the tree already says so**: [`packages/viz/UX.md`](../packages/viz/UX.md) RV-T7 records that the provenance line names no `--traffic`, so a shift on a non-default pattern copies a line that reproduces a *different* run |
| **B3** | A **paired confidence interval** is *drawn*, not described in prose | They are shown a winner and no evidence, which is the thing they came to catch | `packages/viz/src/dev/suitePanel.ts:284-290` via `packages/viz/src/batch/intervalPlot.ts`; `elevator-sim compare` prints it — reproduced in [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § C |
| **B4** | A **refused mean shows its ground** on every surface that would otherwise have printed it | One surface quietly prints a number the run will not stand behind, and the whole edifice is worthless | `packages/viz/src/frame/overlay.ts:170` `meansAreSuppressed`, asserted separately in the left rail, right rail, report, canvas, `live/` and the exported PNG ([`packages/viz/UX.md`](../packages/viz/UX.md) § 8) |

**Which charter criterion each serves.** B1 and B4 together are **S7** (*lift-industry testers rate
the model credible after inspecting it, not after being told about it*) — the inspection S7 names is
B1 through B4, performed. B2 is the audience-side reading of `CLAUDE.md` invariant 5 and has no
charter criterion; B3 has none either, and both are stated here because S7's interview cannot be run
against a product where they are not reachable.

**B4 is the condition this audience is actually testing**, and it is worth saying why it is stated as
a first-session requirement rather than a quality bar. `CLAUDE.md` lists **five** grounds on which
`awtIsValid` fails — saturation, an empty window, censoring above the unserved limit, a leg past the
900 s abandonment horizon, and an abandonment rate above 2 %. An engineer who finds one of those
firing, correctly, in their first session has learned more about whether to trust the product than
any result could have told them.

### 1.3 What the two audiences share, and it is not a compromise

**The same run, the same buildings, the same figures.** Not "the same engine underneath" — the same
artefact. That sentence is charter pillar **P5**'s first line and is quoted rather than restated:
*"The two audiences get the same run, the same buildings and the same figures. What differs is the
wording."*

The mechanical form of that claim already exists and is worth adopting verbatim rather than
paraphrasing: [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md):725 states it
as an acceptance criterion — *"for every scenario, the recording produced in Basic mode is
byte-identical to the recording produced in Advanced mode"* — and adds the test that makes it
falsifiable: **if a mode switch can change a run, it is not the same product.** That criterion is the
instrument for #188's third acceptance clause, and it requires no new plumbing.

Three consequences, each of which forecloses a shortcut somebody will otherwise take:

1. **Casual may not be a subset.** § D299 § 2 is explicit: every parameter that can be edited is
   editable there, a Casual player can author and tune their own dispatcher completely, and named
   play styles are *an entry point, never a ceiling*. A mode that quietly caps what a player can
   build is the broken promise in a better layout.
2. **Engineer may not be simplified into saying less.** § D299 § 1's standing test: *a change to
   Engineer may make it easier to use; it may not make it say less.* Drawing an interval is in
   scope. Dropping one is not.
3. **Neither audience gets its own numbers.** There is one report, one suppression rule, one set of
   grounds. What differs is the sentence around the figure.

### 1.4 The restatement rule — how one figure is worded twice without being softened

This is #188's fourth acceptance clause and the rule charter pillar **P5** delegates here by name. It
is the clause most likely to be violated by somebody trying to be kind, which is why P5's refusal
test is phrased as a question about loss — *which figure did this wording lose?*

> **A figure may be renamed, re-united, or restated as a natural frequency. It may not be
> re-quantified, rounded into an adjective, or separated from its refusal.**

| Permitted | Forbidden |
|---|---|
| `WT95 = 62 s` → *"1 in 20 riders waited more than 62 seconds"* | `WT95 = 62 s` → *"most people got away quickly"* |
| `Δ = [+0.58, +1.38] s` → *"faster, by between half a second and one and a half seconds"* | `Δ = [+0.58, +1.38] s` → *"a solid improvement"* |
| An interval containing zero → *"too close to call at this many runs"* | An interval containing zero → the better-looking arm, named as the winner |
| A suppressed mean → *"we cannot stand behind an average for this day, because …"* + the ground | A suppressed mean → a running mean wearing the same label, or an em dash with no reason |

**The forbidden column is not a style preference — it is a measured failure mode.**
[`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) § 3.4 records the finding
(Budescu et al., 2009 and 2014) that readers misinterpret calibrated likelihood words *regressively*,
pulling *very likely* down and *unlikely* up toward 50 %, with the error correlated to their prior
beliefs — and that the remedy the IPCC adopted was **dual presentation**, the number printed beside
the word, because a carefully defined term alone did not reduce the misreading. **A likelihood word
without a number is the documented defect.** The natural-frequency restatements in the permitted
column carry a number by construction, which is why they are the default rather than a concession.

The design handoff supplies the vocabulary this rule is executed with — *away inside a minute*, not
*AWT*; *the longest anybody stood*, not *WT95* — and states the same constraint in its own voice:
Everyday Mode *"may change what it says and how it asks. It may never change what is true"*
(`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 1, lines 31-62).

---

## 2. Reconciliation — the five existing roles and the two audiences

### 2.1 The prior art, traced

| Where | What it defines | Lines |
|---|---|---|
| [`packages/viz/UX.md`](../packages/viz/UX.md) § 1 | **Analyst, Designer, Reviewer, Newcomer** — who they are, primary goal, what failure costs them | `packages/viz/UX.md:757-764` |
| [`packages/viz/UX.md`](../packages/viz/UX.md) § 8 | **Operator** — added by the shift viewer, same four columns | `packages/viz/UX.md:82-89` |
| [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) § 4 | Reasons **from** the Newcomer's stated failure cost to a product decision (Basic is the default) | `docs/10-experience-layer-contract.md:778-781` |

That third row is why this cannot be a fresh start. A shipped product decision is already derived
from one of those five role definitions. Superseding the role table would silently orphan the
reasoning behind the decision.

### 2.2 The mapping

| Role | Maps to | How, and what it costs |
|---|---|---|
| **Analyst** | Engineer audience | Wholly. *"Ships a conclusion whose mechanism they never checked"* is B3's failure restated as a person |
| **Designer** | Engineer audience | Wholly. *"Wastes a 200-replication sweep on an unbuildable configuration"* — B1's closed-form plate is the cheap check that prevents it |
| **Reviewer** | Engineer audience | Wholly, and this is the role that owns **B2**. `CLAUDE.md` invariant 5 exists for the Reviewer; the RV-T7 gap is the Reviewer's failure with a name |
| **Newcomer** | **Neither — it is a phase, not an audience** | Both audiences are Newcomers for their first minute. Its failure cost, *"concludes the tool does not work"*, is the **first-session** failure of both, which is why it appears as A1's and B1's cost and not as a third audience |
| **Operator** | **Neither cleanly — it is a posture, not an audience** | Playing the week is something either audience can do. Its failure cost — *"learns a lesson the simulator never taught"* — is an **engineer's** failure cost applied to a casual player, and it is exactly why B4's no-suppressed-mean rule is enforced on Casual surfaces too |

### 2.3 The finding, stated as a finding

**No role is orphaned. Two of the five do not map to an audience at all, and they fail to map for
different reasons.** That is not a gap in the mapping — it is the mapping telling us the two
inventories are on **different axes**, and it is the reason neither supersedes the other:

- `packages/viz/UX.md` §§ 1 and 8 enumerate **roles**: what a person is *doing at a surface*. The
  inventory is used to derive surface requirements — the seed control, the suppression rule, the
  useful-before-configured rule. Five is the right number for that job, and a sixth would be a
  finding rather than a tidy-up.
- This document enumerates **audiences**: who is being *acquired and retained*. The inventory is
  used to judge whether a screen is doing its job in a first session. Two is the right number for
  that job.

A Newcomer is a *state* both audiences pass through; an Operator is a *posture* either can adopt.
Neither is a market segment, and promoting either into one would produce a third and a fourth
audience that no acquisition decision can be made against.

### 2.4 Authority, split so that neither document supersedes the other by accident

| Question | Authoritative document |
|---|---|
| What a **surface** must do, and for whom | [`packages/viz/UX.md`](../packages/viz/UX.md) §§ 1 and 8. Nothing here weakens or restates its three derived consequences |
| What an **audience** must have by the end of a first session, and the condition that can fail | This document, § 1 |
| What the **screen looks like**, its copy, its interaction | [`docs/design/`](design/) — the vendored handoff, per [`CLAUDE.md`](../CLAUDE.md) and [`docs/12-design-handoff.md`](12-design-handoff.md) |
| What a **number means** | The simulator, and `CLAUDE.md` § Statistical discipline |
| **Positioning** — two products or one | [§ D299](../DECISIONS.md), and nothing below it |

**Where the two touch, `UX.md` is the premise and this document is the consumer.**
`docs/10-experience-layer-contract.md:778-781` reasons from the Newcomer's failure cost; this
document reads the same cost as the first-session cost of both audiences. It does not restate the
role, redefine it, or move it. **If these two ever disagree, the disagreement is a defect to record,
not to arbitrate silently** — which is `CLAUDE.md`'s standing rule about a stated refusal going stale,
applied to a stated audience.

### 2.5 One trap the mapping sets, and § D299 disarms it

It is natural to read § 2.2 as **Analyst / Designer / Reviewer → the Engineer product** and
**Newcomer / Operator → the Casual product**. **That reading is forbidden.** § D299 § 2 says Casual
carries full capability and that named play styles are an entry point and never a ceiling. An Analyst
who prefers the Casual door is still an Analyst and must still reach the interval.

So the mapping is **audience → what must be reachable**, never **audience → which product they are
allowed in**. The doors differ in vocabulary, layout, and the order things are met in. They do not
differ in what can be reached.

### 2.6 One live tension, named rather than resolved

[`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) § 3.3 (`:713-727`) is
titled *"Progressive disclosure, not a forked product"* and states that Basic and Advanced are *"one
product with one state, not two apps"*. [§ D299](../DECISIONS.md) — five months later in the record,
taken by the product owner, and named the parent of the #90–#119 backlog — decides **two products
over one engine**.

**§ D299 governs positioning; it is later, it is the owner's, and six sections of
[`docs/21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) are built on it.**

**But § 3.3's byte-identity criterion survives § D299 untouched**, because it is a claim about *runs*
rather than about *products*, and § D299 § 2's *"different door into the same building"* requires it
just as strongly as § 3.3's *"one product with one state"* did. That is why § 1.3 adopts it. Both
halves are stated here so that a reader meeting § 3.3 does not conclude the positioning question is
open, and a reader meeting § D299 does not conclude the byte-identity criterion was withdrawn with it.

---

## 3. The core loop

### 3.1 The statement

> **The core loop.** You are given a building that is failing somebody, and a crowd you cannot argue
> with. You watch one day of it; you form a view about *why* it failed; you change one thing, inside
> a constraint you did not choose; and you re-run **the same crowd**. Then the simulator tells you
> whether the change moved anything, whether you are looking at noise, or that it will not stand
> behind an answer at all. **The moment of satisfaction is the fifth beat, not the third** — not
> making the change, but being told you were right by something that had no reason to agree with you
> and has visibly refused to agree before. **One turn is three to five minutes.** You cannot steer a
> day, only re-roll one — so the verb this game is built out of is the **retry**, and what separates
> the modes is not what you do, but what a retry is allowed to cost you.

### 3.2 The numbered sequence, and where it amends #191

| Beat | What the player does | The constraint that makes it a game |
|---|---|---|
| 1 | **Observe** a building under load — one day, run to completion, played back | The day is over before you see it. There is no intervening |
| 2 | **Diagnose** — form a view about what is wrong | Some modes hand you this and some do not; see § 3.4 |
| 3 | **Change one thing**, inside a constraint you did not choose | A budget, a contract, a works night, a play style. Never a free hand |
| 4 | **Re-run the same crowd** | Common random numbers. This is the only reason beat 5 can be honest, and it is worth 5–20× in required run count (`CLAUDE.md` § Statistical discipline) |
| 5 | **Read a verdict that is measured, not granted** | Including *too close to call*, and including *no answer at all* |

**These five beats are charter pillar P4's three, opened out — they are not a competing loop.** P4
states the loop as **diagnose → change one thing → prove it**. Beat 1 is the observation P4's
*diagnose* is performed on, beat 2 is *diagnose*, beat 3 is *change one thing*, and beats 4 and 5
together are *prove it* — which is split in two here because **beat 4 is where the honesty comes
from and beat 5 is where the satisfaction does**, and a mode can serve one without serving the other.
Endless rush is exactly that case (§ 3.4). Quote P4 when refusing a pull request; quote the five when
asking a mode what it serves.

**Two amendments to #191's proposed list**, both stated rather than made silently:

1. #191's beat 2 is *"form a hypothesis about what is wrong"*. It is renamed **diagnose**, because
   the modes differ most at this beat and one of them removes it deliberately (§ 3.4).
2. #191's list stops at five beats and does not name the time budget. **One turn is three to five
   minutes**, taken from the handoff's own session shapes for the two modes that contain a whole
   turn: Fix a building at *~5 min a case*, Today's tower at *~3 min*
   (`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`:249-254). A *session* is
   several turns; a *turn* is one pass through the five beats.

### 3.3 The structural fact the loop is built on, and it is not a limitation

`Simulation.run()` is one synchronous call that returns when the replication is over, and
`CLAUDE.md` invariant 3 keeps the wall clock out of `core/`. **There is no *now* inside a run.**
[`docs/17-play-experience-audit.md`](17-play-experience-audit.md):30-34 draws the conclusion the
design had never claimed out loud: *"So the player never steers a day. They re-roll one."*
[`docs/16-change-scope-contract.md`](16-change-scope-contract.md):23-25 states the same fact as a
contract — *"there is no such thing as a mid-day change"* — and observes what follows: the product's
most-used verb is an unlimited, invisible retry, and until it was named, nothing modelled it.

**This is the genre, not a defect to design around.** It is what makes the product a simulator rather
than a game about reflexes. The design consequence is sharp and it is the one § 4 declares against:
**a mode is a rule about what a retry costs.** Fix a building makes it free and says so. Campaign
prices it in units and works nights. Today's tower allows exactly one per day. Endless rush does not
permit one at all.

### 3.4 The thesis test — *make diagnosis the game and the simulator the referee*

The charter's strategic conclusion is that every container — the week, the campaign, the boards, the
workshop — is a different way to deliver a diagnosis. Tested against the four shipped modes, **it
holds for three and fails for one, and it needs one amendment before it holds for the three.**

**The amendment, and it comes from the mode the thesis fits best.** In Fix a building the diagnosis
is **given to the player, printed plainly, before any decision is made**. The handoff says so and
says why it was changed: *"There is no guess-the-fault quiz. An earlier draft asked the player to
pick the cause from three candidates before repairing. It was cut: it gated the interesting decision
(what to spend) behind a comprehension test"*
(`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 10, lines 786-792). So:

- Read **"diagnosis" as the inference step** — the player works out what is wrong — and the thesis
  **fails in the very mode it fits best**, because that step was deliberately removed there.
- Read **"diagnosis" as the whole clinical act** — symptom, stated cause, chosen intervention, and an
  adjudication of whether the intervention worked — and the thesis **holds**.

The second reading is the one to adopt, so the thesis is amended rather than accepted:

> **Make the diagnosis and its adjudication the game, and the simulator the referee.**

**The mode it does not hold for is Endless rush**, and the reason is structural rather than
incidental. The rush has no beat 4: the crowd is *defined by how far you got*, so it cannot be held
constant across a change, and with no held crowd there is no counterfactual and nothing for a referee
to adjudicate. What the rush produces is a **limit** — *where does this configuration break* — not a
differential. That is a legitimate and useful thing for a mode to produce, and no other mode asks it.
It is simply not this loop.

Two notes on that verdict. First, it is convenient rather than costly: the rush is also the one mode
with no engine behind it (§ 6), so nothing needs deciding about it yet. Second, **the honest form is
that the rush is a calibration instrument, not a turn of the loop** — and #191's fourth acceptance
clause (*any mode that cannot make the declaration is flagged for cut or merge*) should read this as
a **declaration of a different purpose**, not as a failure to declare. Cutting or merging it is a
human decision and is not proposed here.

---

## 4. The per-mode declaration

Built **from** the design handoff's session-shapes table
(`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`:249-254), which
[`CLAUDE.md`](../CLAUDE.md) makes canonical for the interface. The first three columns are the
handoff's, unchanged. The last three are this document's, and where the shipped build disagrees with
the handoff it is named in § 4.1 rather than smoothed over.

| Mode | Length (handoff) | The loop (handoff) | Beats emphasised | Why it exists separately | Retry costs |
|---|---|---|---|---|---|
| **Today's tower** | ~3 min | one day, one score, once a day | **1 and 5** | It is the only container where the verdict is against *other people's* runs on the same seed rather than against your own previous attempt. It makes the loop social | one per day |
| **Campaign** | ongoing, ~2 min a building-day | clear days, spend units, keep contracts | **3**, by pricing it | The only container that makes a change *cost* something and persist past the day. It turns the retry from free into a decision | units, and a works night |
| **Endless rush** | ~5 min | one climbing day until it stops draining | **1 only** — see § 3.4 | It answers *where does this configuration break*, which no other mode asks. A calibration instrument, not a turn of the loop | nothing — no retry exists |
| **Fix a building** | ~5 min a case | diagnose, reconfigure, re-run, pass or retry | **all five, on one screen** | The only container where the diagnosis is given and the play is what to do about it — and the only one that closes without navigating | free, and it says so |

**The shipped tiles carry the handoff's lengths verbatim.** `packages/viz/src/everyday/modes.ts:73`,
`:88`, `:108` and `:127` each set a `shape` field reproducing the handoff's length and lose-condition
word for word. The handoff's table is not an alternative statement to be reconciled with — **it is
already the shipped build's source for this data**, which is the strongest possible argument for
building on it rather than over it.

**Fix a building's self-containment is verified, not assumed.** `packages/viz/src/everyday/actionBar.ts:309-321`
gives the `fixit` row no `timeline` and no `back`; `packages/viz/src/everyday/fixitScreen.ts:769`
calls `runFixitPair(plan)` in-screen. The mode never calls `closeDay` and never navigates. That is
what "all five beats on one screen" means mechanically, and it is confirmed independently in
[`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § M.

### 4.1 Where the shipped build and the handoff disagree

**Five disagreements. None is the handoff being wrong.** In four of five the handoff describes
something the build has not finished; in the fifth the build quotes the handoff as though it had.

| # | Disagreement | Evidence |
|---|---|---|
| **1** | **The Fix a building tile's refusal sentence is stale on both of its clauses.** It reads *"the three cases run, but their Everyday screen is not built yet"*. `data/fixit-cases.json` holds **18** cases and the module's own docstring says eighteen; the screen is registered | `packages/viz/src/everyday/modes.ts:44` vs `:129` and `:134`; `data/fixit-cases.json` |
| **2** | **Endless rush advertises a session shape for an engine that does not exist.** The tile opens, carrying *"~5 min · the run always ends; the question is when"*, onto a setup screen whose primary refuses | `packages/viz/src/everyday/modes.ts:108`; `packages/viz/src/everyday/rushScreenModel.ts:269-274` (four separate absences) and `:277-278` |
| **3** | **Campaign's loop is *clear days*, and nothing clears one.** *"the month grid marks a day cleared or missed when the campaign day is filed, and nothing files one automatically"* | `packages/viz/src/campaign/career.ts:173` |
| **4** | **Today's tower's score has no world to be placed in.** The handoff's front door opens on yesterday's world result and two histograms of other people's runs; the build has no server to post or verify them | `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 6.1; `packages/viz/src/everyday/shell.ts:124` |
| **5** | **The handoff's stage → report step dead-ends in the build**, in Today's tower and Campaign and **not** in Fix a building | `packages/viz/src/everyday/stageScreen.ts:878-882` files the day and does not navigate; `packages/viz/src/everyday/shell.ts:965-982` enables a breadcrumb stop by *position in the timeline* rather than by *whether the destination has anything to show*. Traced in [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § M (issue #206) |

**Disagreement 1 is issue #217's third and fourth acceptance criteria, confirmed** — and it is worth
saying *why* it survived. The sentence is an argument to `unlessBuilt(...)`, which returns it only
when a named screen is missing. The `fixit` screen is registered, so the call resolves to `undefined`
and **no player ever reads it**. That is [§ D227](../DECISIONS.md)'s stale-refusal defect with the
fuse removed rather than the defect removed: the sentence is what a reader would be told the moment
the screen were unregistered, and it would be wrong by a factor of six about the content and wrong
outright about the screen.

**Disagreement 5 is the structural argument for #217 that #217 does not make.** #217 argues for Fix a
building on quality grounds — both prior playtests independently called its first case the best
moment in the product. The loop analysis gives an independent reason: **it is the only shipped mode
whose fifth beat is reachable.** In two of the other three, the verdict exists and the player cannot
get to it.

---

## 5. What the player is doing at minute 1, minute 10 and hour 3

**The first two are the charter's player promise, restated as behaviour rather than as an offer.**
The promise reads: *"Ninety seconds from now you will understand why the lobby is backing up. Ten
minutes from now you will have proved that your fix worked, and you will be able to hand that proof
to someone else"* ([`docs/22-charter.md`](22-charter.md) § 1). Minute 1 is that first sentence from
the inside; minute 10 is the second. **Hour 3 is not in the promise, and it is the one the product's
retention depends on**, which is why it is here.

**Minute 1 — watching, and being given something to notice.** The only demand on the player is to see
that one floor is not draining while the others are. No control has been touched, no vocabulary has
been required, and nothing has been explained yet. This is A1, and **it is not what the shipped build
does**: over 100 consecutive seeds at the shipped day-one configuration the worst wait stays under a
minute on 91 of them ([`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § S).
The building is not at fault — `data/buildings/garden-apartments.json` states that sparseness is its
purpose. Putting it in the opening slot is what produces a quiet first minute, and the fix is a slot
decision.

**Minute 10 — the first verdict they did not grant themselves.** They have completed one turn: seen
the day, been told or worked out what was wrong, changed one thing under a budget, re-run the same
crowd, and read a sheet that either credits them, tells them it is too close to call, or declines to
answer. This is the moment the product either earns a second session or does not, for **both**
audiences — the difference is only that the engineer is reading the interval and the curious player
is reading the sentence built from it.

**Hour 3 — the unit of interest has moved from the run to the dispatcher.** They are no longer
playing a day; they are maintaining a policy. The day has become the *test* and the dispatcher has
become the *thing being tested* — which is what the workshop, the bench and the gauntlet's ladder
are for, and it is the point at which the two audiences converge completely. The engineer at hour 3
and the curious player at hour 3 are doing the identical thing over the identical artefacts; only the
labels differ. **That convergence is the strongest argument for § D299's one-engine half**, and the
reason § 1.3's byte-identity criterion is not a technicality.

---

## 6. Where a mode does not currently serve the loop — the honest register

Every row is drawn from a register the product already publishes on its own surfaces, or from
verification. Nothing here is new information; what is new is reading it against the loop.

| Mode | Beat that does not work | What is actually missing | Named at |
|---|---|---|---|
| **Endless rush** | **1** — the observation itself | No demand template ramps without a ceiling, so the climbing stream cannot be generated. § 9.2's held-time stage and § 9.3's result screen are unbuilt. The five standings shown are the handoff's fixtures, not runs this build measured | `packages/viz/src/everyday/rushScreenModel.ts:269-274`; `packages/viz/src/everyday/shell.ts:153` |
| **Campaign** | **5** — twice over | The stage's primary does not navigate to the report (#206), *and* nothing files a day as cleared or missed, so the career cannot register the outcome | `packages/viz/src/campaign/career.ts:172-174`; [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § M |
| **Today's tower** | **5** — the private half by #206, the public half by having no server | Same navigation defect as Campaign; and the world result the front door is built around needs a server to post and verify runs | `packages/viz/src/everyday/shell.ts:124`; [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § M |
| **Today's tower** | **4** — no held crowd against a rival | No run in this build races a second dispatcher over the same crowd, so *Race against* states what it would be instead of offering it | `packages/viz/src/everyday/shell.ts:114` |
| **Fix a building** | — | **All five beats work.** The gap is documentary: the tile's unreachable refusal sentence (§ 4.1 row 1) | `packages/viz/src/everyday/modes.ts:129,134` |

**Read down the last column and the shape is unmistakable:** three of the four modes are complete in
front and incomplete behind, and the one that is complete throughout is the one issue #217 asks to be
promoted. **That is a finding about the build, not an argument this document is making** — the
positioning decision stays where § 0 leaves it.

**Two absences that are not loop defects and should not be filed as such**, because both are
correctly refused on their own surfaces: the tuner has one of its two specified doors
(`packages/viz/src/everyday/shell.ts:152`), and § 7.4's ghost lane is undrawn because the host exposes
no second recording ([`AGENT_STATUS.md`](../AGENT_STATUS.md)). Neither is a beat that fails; both are
a beat that is offered once instead of twice.

---

## 7. How this document is used

**As an acceptance test for a mode proposal** (#191's fourth acceptance clause). A proposed mode
answers three questions, in writing, before it is built:

1. **Which beats of § 3.2 does it emphasise, and which does it deliberately not serve?**
2. **What does a retry cost in it?** *Nothing* is a valid answer — Fix a building's answer — but it
   must be the answer rather than an omission.
3. **Which audience's first-session condition does it move?** A mode that moves neither is a mode
   whose value has not been stated yet.

A proposal that cannot answer question 1 is not a mode. A proposal that answers it identically to a
shipped mode is that mode with a different name.

**As an acceptance test for a screen.** A screen serves an audience's numbered condition in § 1, or
it serves a role's requirement in [`packages/viz/UX.md`](../packages/viz/UX.md) §§ 1 and 8, or it is
asked what it is for. Those two are the whole inventory, and § 2.4 says which answers which.

**As a refusal.** This document may not be cited to justify withholding a capability from either
audience. § D299 § 2 forbids a capped Casual product and § D299 § 1 forbids an Engineer that says
less. **An audience definition is a statement about what somebody must be given, never about what
they may be denied.**

---

## 8. What this document does not settle, stated so nobody assumes it did

- **The mode hierarchy and the default entry point.** #217's positioning change is an M2 decision and
  a human one. § 3 is written *from* Fix a building, as #217 asks; the front door is untouched.
- **Whether the two products share one build, one URL and one toggle.** § D299 § 4 leaves this open
  explicitly, and nothing here narrows it.
- **Whether Endless rush is cut, merged, or kept as a calibration instrument.** § 3.4 states what it
  is; the disposition is a human decision.
- **The telemetry that would measure A2 and B-anything on a cohort.** That is #201's schema and M1's
  work. Every condition in § 1 is written to be measurable by playtest **without** telemetry, so that
  M2's gate does not wait on M1's instrument.
- **The `S1`–`S10` token now names two different sets in `docs/`, and this document does not fix it.**
  [`docs/22-charter.md`](22-charter.md) § 4 numbers the ten player-facing success criteria
  **S1–S10**; [`docs/16-change-scope-contract.md`](16-change-scope-contract.md):22-30 already numbers
  ten change-scope rules **S1–S10**, and says in its own text that it chose that letter *"to avoid
  collision with `docs/10`'s R1–R13"*. Both sets are ten items long, both are cited as bare `S<n>`,
  and neither knows about the other. **A bare `S5` is now ambiguous in this directory** — charter S5
  is *no campaign stage clears from the dispatcher dropdown alone*, and `docs/16`'s S5 is *a run
  offered for ranking may carry no state outside `between-games`*. Recorded rather than resolved:
  renaming a set is an M0-A and human decision, and the conditions above are numbered **A1–A4** and
  **B1–B4** so that this document adds no third claimant to the letter.

---

## Sources

- [`docs/22-charter.md`](22-charter.md) — the charter this document is the sibling of. Its § 3
  delegates the audience treatment and the five-role reconciliation here; its **P5** delegates the
  restatement rule here; its **P4** is the loop this document opens out into five beats; its § 1
  carries the player promise § 5 is written against; its § 4 carries S1–S10.
- Issues **#188**, **#191**, **#217** — the briefs this document answers.
- [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) §§ C, M, Q, S — the
  verification that established both issues' premises to be partially false, and the measurements
  quoted in § 1.1, § 4.1 and § 5.
- [`packages/viz/UX.md`](../packages/viz/UX.md) §§ 1 and 8 — the five roles, authoritative for
  surface requirements.
- [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) §§ 3.3, 3.4, 4 — the
  byte-identity criterion, the Budescu finding and the dual-presentation remedy, and the Newcomer
  reasoning.
- `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` §§ 1, 2, 5, 6.1, 10 — the
  premise, the fixed vocabulary, the session-shapes table, the front door, and the cut quiz.
  Canonical for the interface; **not** for numbers.
- [`docs/16-change-scope-contract.md`](16-change-scope-contract.md) § 0 and § 1, and
  [`docs/17-play-experience-audit.md`](17-play-experience-audit.md) § 1.2 — there is no *now* inside
  a run, and the retry is the verb.
- [`docs/20-everyday-playtest-audit-2.md`](20-everyday-playtest-audit-2.md):117 — *advice → control →
  visible mechanism → measured delta*, the chain #191 cites as evidence the loop now exists.
- [§ D299](../DECISIONS.md) — two products, one engine. The positioning decision, and the parent of
  every constraint in § 1.3 and § 2.5.
- [§ D227](../DECISIONS.md) — the stale-refusal defect class, which § 4.1 row 1 is an instance of.
- [`CLAUDE.md`](../CLAUDE.md) — the eight invariants, the statistical discipline, and the standing
  rule that a published number and a stated refusal go stale the same way.
- [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2 — the gate that measures A2 and A4.
