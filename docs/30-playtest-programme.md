# 30 — The playtest programme

**Issue:** #205 · **Milestone:** M1, pre-production · **Written:** 2026-08-24 on
`claude/elevator-sim-charter-kickoff-rexfw8` · **Character:** a specification. It recruits nobody
and runs no session.

**Status: SPECIFICATION. No round has been run against it.** M1 writes no production code: no `.ts`
file, no `data/*.json` file and no shipped string is changed by this document. Where a section says
*the moderator does X*, it is an instruction for a round that has not happened yet, not a report of
one that has.

**§ 2's governing rule and § 6.5's verdict gate are [§ D413](../DECISIONS.md)** (2026-08-29). That
entry is an anchor and does not convert *the moderator does X* into a report of a round that has
happened; no round has been run against this document.

**Series are cited with their document** throughout — `charter S6`, `docs/23 A2`, `docs/25 X1`,
`docs/26 P-1`, `docs/10 R13`, `RISKS.md R35` — never bare ([§ D343](../DECISIONS.md)). This
document opens **one** series of its own, `docs/30 Q1`–`docs/30 Q12` in § 2.2. The letter was chosen
by checking it against the ones already in use rather than by preference, which is `RISKS.md` R39's
mitigation performed rather than quoted: `P`, `S`, `R`, `K`, `E`, `A`, `B`, `C`, `G`, `X`, `T`, `D`
and `M` are all taken by a governing document in this tree, and `Q` is not.

---

## 0. What this document is answerable to, and what was true of the tree before it

**Two of the charter's ten success criteria have no instrument other than this one, and neither can
ever acquire a different one.**

> **`charter S6`** — *6 of 10 testers can state, unprompted, why the simulator refused a number.*
> **`charter S7`** — *lift-industry testers rate the model credible after inspecting it, not after
> being told about it.*

[`docs/26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) § 9.1 does not merely decline to
measure them; it **refuses to offer a proxy**, in those words, and says why: *"a proxy metric for an
unmeasurable thing is exactly the class of defect this repository exists to prevent."* That refusal
is what creates this document. A criterion with a refused proxy and no programme is a criterion that
will be met by assertion the first time somebody needs it met, which is the failure
[§ D163](../DECISIONS.md) declined to write into a phase gate.

**Measured on this tree, 2026-08-24, before any of the below was drafted:**

| what | measured | how |
|---|---|---|
| Prior playtest write-ups in the tree | **2** | [`docs/19-everyday-playtest-audit.md`](19-everyday-playtest-audit.md), [`docs/20-everyday-playtest-audit-2.md`](20-everyday-playtest-audit-2.md) |
| Prior tester session notes, kept as a source rather than a finding | **1** | [`docs/elevator-sim-playtest-report.md`](elevator-sim-playtest-report.md) |
| Recruitment script, screener, consent form, rubric | **0 of 4** | Nothing in the tree; `docs/25` X1 records the same absence |
| Milestone gates naming `charter S6` | **0** | A grep of [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) for `S6` and `S7` matches **nothing**. § M2's second exit criterion is the *diagnosis* half in prose — *"Six of ten can state what went wrong and why their change helped"* — and cites no criterion |
| Milestone gates naming `charter S7` | **0** | Same measurement, and it has no prose restatement either. See § 5.5 — this is a finding, not a caveat |
| Testers who have never seen the game and are known to the project | **0 recorded** | No register exists. § 3.3 makes one a prerequisite rather than an afterthought |

**And the two write-ups that do exist were not produced by this programme.** Both were walked by an
agent driving Playwright, not by a person who had never seen the game
(`docs/19`: *"Driven as a player via Playwright against `npx vite`"*; `docs/20`: *"Driven as a player
through Playwright/Chromium at 1280×800"*). They are excellent instruments for *does the product
work* and they are **not** instruments for `charter S6`, because an agent that has read the codebase
cannot be unprompted about a refusal it can explain from source. § 8 keeps their format and § 10
says plainly what their method could not reach.

---

## 1. Why this exists now, and what it unblocks

**M2 cannot exit without it.** [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2 has five exit
criteria and the first two are this document's:

- *Ten testers who have never seen the game complete the slice.*
- *Six of ten can state what went wrong and why their change helped.*

Neither is executable without a protocol, a rubric, a consent posture and a recruited cohort.
[`docs/25-vertical-slice.md`](25-vertical-slice.md) § 3 restates them as **X1** and **X2** and marks
both *"instrument exists today? **No** — #205 is an unstarted M1 sibling; no script, no recruits, no
consent form (#202)."* This document is that instrument.

**It also settles half of #218.** Issue #218 asks to *"define and hold the vertical slice review"*
and verification found it duplicating `CHARTER_PROGRAMME.md` § M2's own definition. The half that
was genuinely missing is the *holding* — who is in the room, what they are asked, what counts as an
answer, and who writes the verdict. §§ 4, 6 and 8 are that half.

**One correction it carries forward.** `docs/25` X2 is **wider** than § M2's second criterion and
deliberately so: § M2 measures the *diagnosis* (*what went wrong and why their change helped*) and
never measures the *refusal*, which is `charter S6` and is the thing this product is actually for.
The two halves fail independently. This document measures both and never collapses them, because a
slice that is clear about the easy half and silent about the hard one would otherwise pass.

---

## 2. The governing rule — a playtest finding is a claim, not a defect

### 2.1 The measured reason, which is not an opinion about testers

**Inbound feedback on this product has a measured error rate.**

- In one wave, **five of six lanes found the reported issue's own claim to be wrong**
  ([`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M6 records this as the reason the community
  loop must preserve verify-before-schedule).
- In this programme's own verification wave, of thirteen M2 issues: **two were refuted at their
  central premise**, **eight carried at least one false or materially misleading clause**, and
  **three would have shipped a new defect, reversed a product decision, or produced a wasted edit**
  if actioned literally (`RISKS.md` R35, evidence in
  [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md)).
- **#209 had been fixed thirteen days before it was filed**, with all four of its own acceptance
  criteria already met and 0 of 100 seeds suppressing.
- Two reporters, **seventeen minutes apart on the same tree**, stated contradictory Free-play
  defaults (#99 and #116 § 1); neither matched the shipped code, which takes array index 0 from a
  catalogue.

**And this repository's own tester report is the worked example.**
[`README.md`](../README.md) marks [`docs/elevator-sim-playtest-report.md`](elevator-sim-playtest-report.md)
as *"a report rather than a finding"* — because verification has since **refuted or re-attributed a
large share of what it claims**, and the surviving dispositions live in
[`ISSUE_WORKER_LEDGER.md`](../ISSUE_WORKER_LEDGER.md)'s *claims that did not survive verification*
tables, which are the correction of record. That document is a good report by an attentive tester.
It is still, in places, wrong about the product. **Both of those are true at once, and a programme
that cannot hold both will either dismiss testers or industrialise their error rate.**

None of this is a claim that testers are unreliable observers. **A tester is a near-perfect
instrument for one thing and a poor one for another**, and the whole pipeline follows from telling
them apart:

| The tester is authoritative about | The tester is not authoritative about |
|---|---|
| What they saw, in the order they saw it | Which module produced it |
| What they expected | Whether the product is behaving as designed |
| What they believed the screen was telling them | Whether that belief is true |
| Where they stopped, and what they tried next | Why it stopped them |
| That a sentence confused them | What the sentence should say instead |

The right-hand column is exactly what a written-up finding usually contains, and it is exactly the
column verification exists to check.

### 2.2 The twelve rules

> **`docs/30 Q1` — A playtest finding is a claim, not a defect.** Nothing observed in a session
> opens a fix lane until its central premise has been traced to file and line, or measured by a run.
>
> **`docs/30 Q2` — The verifier is not the moderator.** Whoever ran the session may not be the
> person who confirms or refutes what it produced. A moderator who verifies their own session is
> checking their own note-taking.
>
> **`docs/30 Q3` — Verify against the build the tester played, not against `main`.** The claim
> carries the commit sha of the build in the room. #209 is what happens when a claim is checked
> against the wrong tree — or against a dated audit — rather than the one that produced it.
>
> **`docs/30 Q4` — A refuted claim is recorded, never dropped**, at the same prominence as a
> confirmed one, with the trace that refutes it (§ 7.5).
>
> **`docs/30 Q5` — When a claim is refuted, ask whether the product caused the false belief.** If it
> did, that is a second claim, against the wording, and it is usually confirmed. **A refuted claim
> about a mechanism is frequently a confirmed claim about a sentence.**
>
> **`docs/30 Q6` — Severity is assigned after verification, never at capture.** The measured error
> rate above is largely an error rate on *stated causes*, and severity is a function of cause.
>
> **`docs/30 Q7` — The moderator records observations, not diagnoses.** A session note that names a
> module, a cause or a fix is rewritten before it leaves the session (§ 7.1).
>
> **`docs/30 Q8` — The build is pinned for a round.** Every session in a round plays one sha. A
> round whose build moves has no denominator (§ 7.6).
>
> **`docs/30 Q9` — Which sessions count is decided by the order they were run, not by their
> outcome.** A round may not run twelve sessions and report the ten that went well.
>
> **`docs/30 Q10` — The bar is a gate the project agreed to in advance, not an estimate of a
> population.** No rate from this programme is published with a confidence interval, and none is
> generalised to *players* (§ 6.6).
>
> **`docs/30 Q11` — A criterion that a round fails is raised, not weakened.** This is
> [`CLAUDE.md`](../CLAUDE.md)'s working agreement and `docs/22-charter.md` § 4's rule, applied to a
> playtest: re-defining *unprompted*, widening *complete*, re-coding an answer after seeing the
> count, or recruiting a further practitioner because the majority went the wrong way are each a
> charter violation and any reviewer may refuse the round on one.
>
> **`docs/30 Q12` — The verdict is written by a human.** An agent may tabulate, quote and state
> which side of the bar a count falls on. **No agent records a review as passed** (§ 6.5).

### 2.3 The failure this prevents, stated as a failure

A programme that filed session observations straight into the backlog would take a channel with a
measured two-in-thirteen refutation rate and an eight-in-thirteen misleading-clause rate and give it
a direct line to a build queue — and at a volume nobody has measured, since no round has been run.
That is `RISKS.md` R35 industrialised, with the volume unknown rather than reassuring. The mitigation R35
already names is *"verify before scheduling"*, and this document's only contribution is to apply it
to a second inbound channel before that channel exists rather than after.

---

## 3. Recruitment

### 3.1 How many, and the honest reason for ten

**Ten completing sessions per gate round in cohort A.** The number is
[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2's and `docs/25` X1's, adopted unchanged
because refining another lane's criterion inside this one is how a threshold moves without anybody
deciding it.

**Ten is a usability instrument, not a sample.** Moderated sessions find *whether a screen defeats
people*, and they saturate quickly — the tenth session mostly re-confirms what the fourth found.
They do not estimate a rate in a population, and this document forbids reporting them as though they
did (`docs/30 Q10`). The arithmetic is worth writing down once so nobody re-derives it under
pressure: an observed **6 of 10** carries a 95 % exact binomial interval of roughly **[26 %, 88 %]**
(Clopper–Pearson; a property of `n = 10`, re-derivable by anyone, not a measurement of this
product). Publishing *"60 % of players can explain a refusal"* off that interval would be precisely
the confident nonsense [`CLAUDE.md`](../CLAUDE.md) § *Statistical discipline* names as this
project's most likely way to fail.

So: **six of ten is a gate the project set in advance and must clear.** It is not an estimate, it
does not get an interval, and `charter S2`'s 60 % — which *is* a population rate — belongs to
telemetry and may never be sourced from here.

**Recruit fourteen to seat ten.** No-shows, screening losses at the door (§ 3.3) and withdrawals
(§ 9.5) are normal, and each costs a slot. **The round's denominator is fixed at ten before it
starts**, and the surplus four are a **reserve, not a pool**: a reserve tester is seated only to
replace a no-show, a screening loss or a withdrawal, never to add an eleventh session. A round that
seats twelve and reports ten has chosen its own denominator, which is `docs/30 Q9`.

**Ten sessions are run, and all ten are reported**, whatever they produce. A session that goes badly
is not replaced — it is the finding. The only replacements are the three above, each of which is
settled by an eligibility fact or by the tester's own decision rather than by how the session went.

### 3.2 The two cohorts

| | **Cohort A — the curious player** | **Cohort B — the practising engineer** |
|---|---|---|
| Serves | `charter S6`, and `docs/25` X1/X2 | `charter S7` |
| Conditions measured | [`docs/23`](23-audiences-and-core-loop.md) **A1** (partly — see § 10), **A2**, **A3**, **A4** | **B1**, **B2**, **B3**, **B4** |
| Count per round | **10 completing**, recruit 14 | **5 minimum, fixed before the round** (§ 3.5) |
| Session | 45–60 min, think-aloud, hands-on (§ 4) | 75–90 min, hands-on inspection **then** structured interview (§ 4.7) |
| Must not have | Seen the game in any form (§ 3.3) | **Inspected** the model, or been told it is credible (§ 3.5) |
| Found by | § 3.4 | § 3.5, and it is a different problem |

**They are not two halves of one round.** A cohort-B session cannot be scored for `charter S6`: a
practitioner who explains a saturation refusal has demonstrated domain knowledge, not that the
product taught them anything. A cohort-A session cannot be scored for `charter S7`: a curious player
rating the model credible has rated the presentation. Mixing them would produce two numbers that
each answer the other's question, which is `docs/26` § 9.1's own objection to proxies.

### 3.3 "Has never seen the game", operationally

A candidate is eligible for cohort A only if **all** of the following are true, asked as separate
questions at screening and re-asked at the top of the session:

1. Has not opened any build of Elevator Sim, at any URL, on any device, at any time.
2. Has not seen a screenshot, a recording, a screen-share or a live demonstration of it.
3. Has not read any document in this repository — **including this one**, and including
   `docs/19`, `docs/20` and the tester report.
4. Is not a contributor to the project, and has not been briefed about it by one beyond the
   recruitment text in § 3.4.
5. **Has not been a tester in a previous round.**

**Point 5 is the expensive one and it is the reason recruitment is a standing cost rather than a
task.** A tester is first-time exactly once. Ten of them are consumed per gate round, they cannot be
recycled at the next gate, and the supply is the scarce resource of this entire programme. Planning
that assumes otherwise will discover it at the M2 review, which is the worst moment to discover it.

**Enforcing point 5 requires a register**, and the register is personal data with an indefinite
retention need. It is specified, minimally, in § 9.6 — because a rule that needs a store, and whose
store is not designed, is a rule that will be enforced by somebody's memory.

**Screening loss at the door is not a failure and is not a completion.** A candidate who discloses
at session start that they have in fact seen a screenshot is thanked, compensated in full, and
recorded as a screening loss. They do not count toward the ten and their session, if it ran, is not
coded. Making that disclosure cheap is a design requirement of the wording, because the incentive at
that moment runs the other way.

**A tester is not disqualified for playing simulation games, for being technical, or for being good
at it.** Only prior exposure to *this* product disqualifies. § 3.4's screener records the rest as
attributes, and § 6.7 reports the round's composition beside its result so a reader can see what kind
of ten produced it.

### 3.4 Finding cohort A — channels, and the bias each carries

**Which channel is used is a product-owner decision and this lane does not make it.** What a lane can
do is name the options with the cost each carries, so the choice is made with the bias visible:

| channel | what it supplies | the bias it carries |
|---|---|---|
| A contributor's own network, **at one remove** (a colleague of a colleague, never a friend of the project) | Fast, free, plausible for a first round | Politeness. People close to the project soften findings, and the softening is invisible in a transcript |
| A paid participant recruiter or research panel | Screening is enforced by a third party; scheduling is somebody else's problem | Professional participants. People who do many studies narrate more fluently than they think, which inflates the `charter S6` count specifically |
| An open call — a forum, a community, a social post | Cheap and quick | **Self-selection toward simulation enthusiasts**, which is cohort B leaking into cohort A. This is the bias to guard hardest against, because it makes the criterion easier in exactly the way `docs/30 Q11` forbids |
| A general-interest institution: a class, a library, a workplace with no building-services function | The closest thing to the audience the charter describes | Slow, and requires a real human relationship to arrange |

**The screener is short, and it may not describe the product.** Six questions:

1. Roughly how much time do you spend playing games in a week, and what kinds?
2. Have you ever worked in, studied, or been trained in building services, lifts or escalators,
   HVAC, architecture, facilities management, or construction?
3. Does the phrase *lift dispatcher* mean anything specific to you? *(Free text. An answer that
   defines it correctly routes the candidate to cohort B, or out.)*
4. Have you taken part in a product test or user-research session in the last twelve months, and
   roughly how many?
5. The five eligibility questions of § 3.3.
6. Access needs for the session, in the candidate's own words.

**The recruitment text is contamination-controlled** (§ 4.4). It describes *a game about running the
lifts in a building*, states the length, the recording ask and the compensation, and contains none
of: *refuse*, *refused*, *withheld*, *suppressed*, *average*, *wait time*, *confidence*, *saturated*,
*honest*, *statistics*. A candidate who arrives having been told the game refuses to tell you things
cannot produce an unprompted statement about it, and the round has spent a first-time tester on a
question it can no longer ask.

**Compensation is paid, equal, and paid on arrival rather than on completion.** Paying on completion
prices the exit, which is the one thing a session about *where does a player give up* must never do.
The amount is a product-owner decision.

### 3.5 Finding cohort B — and it is a different problem, named as one

`charter S7` reads: *lift-industry testers rate the model credible **after inspecting it**, not after
being told about it*, and it **fails when a majority of recruited practitioners name a modelling
defect that changes their verdict.* Five things follow, and none of them is a scaled-down version of
§ 3.4.

**1. The population is small, professional and busy.** There is no open call for lift engineers that
does not immediately produce non-lift-engineers. Candidate routes: vertical-transportation
consultancies; lift OEM field and design engineering; building-services engineering practices with a
VT specialism; the standards and institute community around CIBSE Guide D and ISO 8100-32 — the same
literature [`CLAUDE.md`](../CLAUDE.md) already cites as this simulator's reference data; and academic
groups publishing on lift traffic analysis. Each is a relationship, not a funnel.

**2. The qualification is a claim, and this document does not exempt it from § 2.** A stated
credential is verified before the session, not after: a named role at a named employer in vertical
transportation or building services; or authorship of a paper, standard, tool or published analysis
in lift traffic; or membership of a professional body with a VT remit. **What is not accepted:**
self-description alone, adjacency (a mechanical engineer who has specified a lift once), or an
enthusiast who has read the literature. The last exclusion will feel harsh and is the point —
`charter S7` is about practitioners, and an enthusiast admitted to cohort B makes the criterion
easier, which is `docs/30 Q11`.

**3. The denominator is fixed before the round and recorded in the round plan.** *A majority of
recruited practitioners* has a denominator that is set by recruitment, so a round that keeps
recruiting until the majority falls the right way has moved its own threshold. **Minimum five**, and
the number is written down before the first session. Recruiting an additional practitioner after any
session has been coded is a charter violation and any reviewer may refuse the round on it.

**4. Their exclusion list is narrower, and differently shaped.** Cohort B may have seen the product
exist; they may not have **inspected** it, and they may not have been told it is credible. The
criterion's own wording — *after inspecting it, not after being told about it* — makes the session's
structure part of the criterion:

- **No advocacy segment.** The moderator does not explain why the model is sound, does not cite
  `CLAUDE.md`'s invariants, does not mention the Barney/CIBSE oracle before the practitioner finds
  it, and does not defend a number.
- When asked *"is this right?"*, the moderator's only answer is **"what would you check?"** — which
  is the session's actual instrument.
- Nothing about the project's statistical discipline is stated up front. If the practitioner never
  finds the paired interval, **that is the finding**, and it is condition **B3** failing.

**5. Their claims are the ones most likely to be right, and most likely to have already been
measured here.** A practitioner's objection goes through § 7 like every other claim, with one added
first step: **check it against `DECISIONS.md` and the measured record before checking the code.**
Several plausible expert claims about this simulator have already been tested and settled in this
tree, in both directions — [§ D280](../DECISIONS.md) measured a widely-repeated mechanism claim about
destination dispatch under access control and found it **backwards** (`+1.020 s [+0.625, +1.414]`);
[§ D256](../DECISIONS.md) and [§ D279](../DECISIONS.md) refuted H-ACCESS-1 outright on 150 of 150
bit-identical replications. A verifier who does not read the record first will either re-run a
settled question or, worse, accept a plausible sentence about a mechanism as a finding — which is
the exact defect class [§ D280](../DECISIONS.md) exists to police.

---

## 4. The session protocol

### 4.1 Shape of a cohort-A session

**45–60 minutes**, one tester, one moderator, one observer where staffing allows. The build is the
round's pinned sha (`docs/30 Q8`), served from a URL the tester opens themselves on a machine they
are sitting at. Nothing is pre-opened; **cold load is part of the session**, because the first screen
is the one `docs/23` A1 is about.

| block | minutes | purpose |
|---|---|---|
| **0. Consent and framing** | 5 | § 9's asks, taken separately. The framing script of § 4.3 |
| **1. Cold open** | 5 | Tester opens the URL and does whatever they do. **No task is given.** This block measures A1's *visible* half and nothing else |
| **2. The slice, unaided** | 20–30 | The tester plays. `docs/25` § 1.2's route: `menu → door → brief → stage → report → week`, plus the tuner at beat 3. One task sentence, once, and only if the tester stalls in block 1 (§ 4.3) |
| **3. Reach the refusal** | 5 | The one steered moment in the session (§ 4.6). Steered toward the *screen*, never toward the *sentence* |
| **4. Open debrief** | 5–10 | Tier-0 and tier-1 questions only (§ 4.5). **`charter S6`'s window closes at the end of this block** |
| **5. Named debrief** | 5–10 | Tier-2 questions. Contaminating by design, and therefore last (§ 4.5) |
| **6. Close** | 2 | Compensation confirmed, withdrawal route restated, questions answered honestly — including *"what is this for?"*, which may now be answered in full |

**Blocks 4 and 5 are in that order for one reason and it is the whole of `charter S6`.** Once a
tier-2 question has named a refusal, no later statement by that tester counts as unprompted about it.
The ladder is **one-way and irreversible** (§ 4.5), so every tier-0 and tier-1 opportunity must be
exhausted before any tier-2 question is asked.

### 4.2 What the moderator does

- Reads the fixed scripts **verbatim**: the framing (§ 4.3), the one task sentence, the open prompt
  (§ 4.6) and the tier-2 questions. Everything else is improvised inside § 4.4's constraints.
- Keeps the tester talking, using only content-free continuers: *"mm-hm"*, *"keep going"*, *"say more
  about that"*, and — the most useful one — **silence**.
- **Counts ten seconds before speaking after any question.** Unprompted statements live in that gap
  and a moderator who fills it has destroyed the measurement they were sent to take.
- Times the beats against the wall clock and records where the tester is at 90 s (§ 10 on why that
  is an observation and not `charter S1`).
- Records observations, not diagnoses (`docs/30 Q7`).
- Grants at most **two re-orientation prompts** per session (§ 4.6), and records each.
- Stops the session immediately on a blocks-play observation (§ 7.6) or on any sign of distress.

### 4.3 The framing script, read verbatim

> *"You are going to play a game I did not make, and I am not going to help you play it. If you get
> stuck, being stuck is the useful part — say what you are thinking and stay stuck for a while.
> There are no wrong moves and nothing you can break. I will mostly be quiet. If you ask me a
> question I will probably ask you what you would do, which is not me being difficult — it is the
> only way I get an answer that is yours. Please think out loud: what you are looking at, what you
> expect to happen, and what surprised you."*

**"A game I did not make"** is deliberate and is the one small fiction the protocol permits, because
a tester who believes the moderator is the author will soften everything. Where the moderator *is* a
contributor, the sentence becomes *"I am not going to help you play it, and I am going to try very
hard not to defend it"* — which is honest, and does the same work less well.

**The one task sentence**, given only if the tester has not started the day by the end of block 1:

> *"Have a go at running today's building."*

It names no screen, no control, no number and no verb the interface uses. If the tester still does
not proceed, that is recorded as a finding against the front door and the moderator moves to block 2
with one re-orientation prompt.

### 4.4 The vocabulary constraint — how the session avoids leading

**The moderator's vocabulary is an allowlist, and it has two entries.** The moderator may say:

1. a word **the tester has already said** in this session, and
2. a word **visible on the screen the tester is currently looking at**, and then only to locate
   something (*"the thing at the top"*), never to characterise it.

Everything else is off-limits for the duration of blocks 1–4. The named prohibitions, which exist
because each is a word that would hand the tester the answer to `charter S6`:

- **refuse, refused, withheld, suppressed, hidden, missing, blank, unavailable, error, broken**
- **average, mean, wait, wait time, AWT, percentile, confidence, interval, saturated, queue**
- **why** — in the specific construction *"why do you think it did that?"* aimed at a figure. *Why*
  about the tester's own action (*"why did you press that?"*) is fine and useful.
- **should** — *"what should it say?"* invites design, and a tester's design proposal is the least
  reliable thing a session produces.

**The moderator never reads a screen aloud.** Reading a sentence to a tester and then asking what it
means measures reading comprehension of a sentence the moderator chose, which is a different study.

**The moderator does not confirm or deny anything about the simulation.** Not *"yes, that is right"*,
not *"actually it means…"*, not a nod at the correct answer. Block 6 is where honest answers are
given, and the tester is told at the framing that it exists.

### 4.5 The three tiers, and the ladder that makes *unprompted* operational

`charter S6` says **unprompted**. That word is a protocol constraint, so the protocol makes it a
recorded property of each answer rather than a judgement made afterwards.

**Every statement a tester makes about a refused figure is stamped with the tier of the highest
prompt that preceded it in the session. Only tier 0 counts.**

| tier | what the moderator did | counts for `charter S6`? |
|---|---|---|
| **Tier 0 — spontaneous** | Nothing, or an **open prompt** that names nothing: *"Tell me what you're looking at."* · *"What's going on here?"* · *"What are you thinking?"* | **Yes** |
| **Tier 1 — narrowed** | Directed attention without naming the thing: *"Is there anything on this screen you'd want to ask about?"* · reflecting the tester's own words back — *"you said it seemed odd"* | **No.** Recorded and reported |
| **Tier 2 — named** | Named the figure or the refusal: *"The average wait doesn't show a number. Why do you think that is?"* | **No.** Recorded, reported, and **contaminating** |

**Three rules make the ladder mean something:**

1. **It is one-way.** The session may go 0 → 1 → 2 and never back. Once tier 2 has touched a
   refusal, nothing later in that session counts as tier 0 about it.
2. **It is per-refusal, not per-session.** A tester may be at tier 2 about the withheld average and
   still at tier 0 about a censored worst-wait reading. The stamp is on the statement.
3. **Tier 2 is confined to block 5**, after the hands-on portion is over, so that no tier-2 question
   can contaminate a later tier-0 opportunity.

**Why tier 1 and tier 2 are asked at all, given they cannot count.** Three reasons, and each is worth
the minutes: a tier-2 answer distinguishes *did not notice* from *noticed and could not explain*,
which are different defects with different owners; the gap between the tier-0 count and the tier-2
count is the most useful diagnostic the session produces; and a tester who leaves without ever being
told what the screen meant has been used rather than met.

### 4.6 The refusal must be reachable, and the steering is toward the screen

`docs/25` § 6.2 is explicit that **a refusal is deliberately reachable in the slice** and that *"X2's
second half cannot be measured against a product that never refuses anything"* — while equally
refusing to manufacture one on the pinned first session, *"which would be the same defect in the
opposite direction."*

Block 3 is where the protocol meets that. **The moderator steers the tester toward a screen, never
toward a sentence**, using the fixed line:

> *"Try that again with the settings you had at the start."*

or whichever one-sentence instruction the round plan has pre-registered for the pinned build, worded
to name a **navigation target** and no figure. The instruction is written into the round plan
**before** the first session and read verbatim in every session, so that ten testers meet the refusal
by the same route. A moderator improvising this line has changed the instrument between sessions.

**If the tester reaches the refusal on their own during block 2, block 3 does not happen** and the
session records that they got there unaided — which is a stronger result and is reported as one.

**The two re-orientation prompts.** At most twice per session, when a tester has stalled for more
than roughly a minute, the moderator may ask: *"What would you try?"* Each is recorded with its
screen and its timestamp.

**A third prompt may be granted, and it costs the completion rather than the session.** `docs/25` X1
says *unaided*, and three prompts is aid — so a session that needed a third is recorded as **not
completing unaided**: it stays in the round, stays in the denominator, and fails X1's numerator. It
is still played to the end, still coded for `charter S6` and `docs/25` X2, and still produces
findings, because a tester who had to be helped past one screen can still tell you everything about
the next one.

**That ordering is deliberate and it closes a hole.** If a third prompt removed the session from the
round instead, a moderator could rescue a bad denominator by granting one — an outcome-driven
exclusion, which is exactly `docs/30 Q9`. Making the third prompt *cost* a completion means the
moderator's incentive at that moment runs the same way the criterion does.

### 4.7 The cohort-B session — the structured inspection

**75–90 minutes**, and the shape is inverted: hands-on first, verdict last, because the criterion is
about a verdict reached *after inspecting it*.

| block | minutes | what happens |
|---|---|---|
| **0. Consent and framing** | 5 | § 9, plus the no-advocacy statement (§ 3.5) |
| **1. Free inspection** | 25–35 | *"Have a look at it and tell me whether you believe it."* No route, no tour, no defence. The practitioner goes where they go |
| **2. The four conditions, if unreached** | 15 | Only conditions the practitioner did not reach on their own are steered to, and **the write-up says which were reached and which were steered.** They are `docs/23` **B1** (the closed-form Barney/CIBSE figures beside the simulated ones), **B2** (the seed is visible, copyable and reproduces *the run they were looking at*), **B3** (a paired interval **drawn**, not described) and **B4** (a refused mean shows its ground on every surface that would otherwise print it) |
| **3. The adversarial pass** | 15 | *"If you wanted to catch this model out, what would you do?"* — then they do it, with the machine |
| **4. The structured interview** | 15–20 | § 6.4's questions, in order, verbatim |
| **5. Close** | 5 | As § 4.1 block 6 |

**Block 3 is the criterion inverted into a question.** `charter S7` fails when a majority *name a
modelling defect that changes their verdict*, so the session asks directly for that defect rather
than waiting to see whether one surfaces politely. A practitioner who is invited to break the model
and cannot is a much stronger result than one who was never asked.

**Every objection raised in blocks 1–3 is a claim** and enters § 7's pipeline with § 3.5's added
first step. Several will be about things this tree has already measured; the write-up must say which
were confirmed, which were refuted **by the record rather than by argument**, and which were new.

---

## 5. Cadence

### 5.1 Gate rounds — where a round is mandatory

A **gate round** is a full round (ten completing cohort-A sessions, plus cohort B where the gate
names `charter S7`), run against a pinned build, written up in § 8's format, and delivered to the
review as evidence.

| gate | round required | why |
|---|---|---|
| **M2 — vertical slice review** (#218) | **Cohort A, full round** | § M2's first two exit criteria are the round. `docs/25` X1 and X2 |
| **M3 — alpha gate and feature freeze** | Cohort A, full round | A feature freeze is the last moment a first-time player's route can still be changed cheaply. Not currently in § M3's written criteria — see § 5.5 |
| **M4 — beta gate and content freeze** | **Cohort A and cohort B** | The first build worth a practitioner's time is a content-complete, balanced one. `charter S7` has no gate today — see § 5.5 |
| **M5 — launch readiness** | Cohort A, full round, on the shipping candidate | The launch build is not the alpha build, and the last round on a different build is not evidence about this one |

### 5.2 Between-gate rounds, and the thing they may not be used for

A **diagnostic round** is three sessions at the midpoint of a build milestone. Its purpose is that
the gate round is not the first time the build meets a stranger. It is written up in the same format
and its findings enter the same pipeline.

**A diagnostic round may not satisfy a gate criterion**, ever, and not because of formality: it is
three sessions on an unfinished build, and counting it would let a milestone reach *six of ten* by
addition across builds. `docs/30 Q8` and `docs/30 Q9` both forbid it. It also spends first-time
testers, so three is a real cost and the round plan says what question it is buying.

### 5.3 Unscheduled triggers

Each is falsifiable, and any one of them opens a round outside the schedule:

1. **A P0 lands on the slice route.** The route is `docs/25` § 1.2's; the last round's answer was
   about a different route.
2. **The route itself changes** — a screen added, removed or re-ordered.
3. **The first-session configuration changes**: the building, the seed, the dispatcher or the day
   (`docs/25` §§ 1.3–1.6). `docs/23` A1's condition is a property of that configuration, and
   changing it invalidates the previous round's answer to it. This is a live rather than theoretical
   trigger: [`docs/23`](23-audiences-and-core-loop.md) § 1.1 records A1 as **failing today**, on a
   sweep of 100 consecutive seeds at the shipped day-one configuration that found worst wait ≤ 60 s
   on **91 of 100** and `AWT SUPPRESSED` on **0 of 100**. Fixing that changes the configuration,
   which is exactly when the previous round's answer stops applying.
4. **A refusal wording changes** on any surface `meansAreSuppressed` is asserted on.
   **`charter S6` is measured on that wording**, so a round's result does not survive its rewrite.
5. **The consent surface ships.** It is the first screen a first-time player will meet after the
   Everyday menu ([§ D335](../DECISIONS.md)), it has never been in front of a stranger, and
   `docs/26` § 4.4 forbids the two things it is most likely to become.
6. **Two rounds disagree about the same condition.** Not resolved by argument; resolved by a round
   designed to separate them.

### 5.4 What does not trigger a round — and this half is load-bearing

- **A copy fix that is not a refusal wording.** Trigger 4 is deliberately narrow.
- **A defect the honesty corpus found.** That instrument has already answered; a round would spend
  ten first-time testers re-confirming a green test.
- **An internal disagreement about whether something is confusing.** This is the important refusal.
  A round is not a tie-breaker for the team, and running one to settle an argument consumes the
  scarcest resource the programme has (§ 3.3, point 5) to produce evidence the argument will not
  accept anyway. Write the disagreement down, wait for the scheduled round, and pre-register which
  observation would settle it.
- **A stakeholder wanting to see the game played.** That is a demo. Demos are fine and are not
  rounds; a demo may not be written up in § 8's format and may not be cited at a gate.

### 5.5 One finding this document records rather than papers over

**`charter S7` is named at no milestone gate in [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md).**
Measured on this tree: M4's exit criteria name `charter S1`–`charter S5`; M5 names `charter S9`; M3
and M4 name `charter S10`; the programme-level *definition of done* names *"S1–S10 … met and
measured"* collectively. **`charter S6` reaches a gate only through
[`docs/25-vertical-slice.md`](25-vertical-slice.md) X2's second half**, which is the vertical-slice
document's own addition and not § M2's text. **`charter S7` reaches no gate at all.**

That is `RISKS.md` R38 in a new place — a criterion published in one document and gated in another,
with nothing deriving the correspondence. § 5.1 above proposes M4 as `charter S7`'s home and M3 as a
cohort-A round, and **proposes is all it does**: amending `CHARTER_PROGRAMME.md` is a human decision
and this lane does not edit that file. Until it is amended, `charter S7` is a criterion in the
charter with a programme, no gate, and no date, and this section is where a reader finds that out.

---

## 6. What is measured, and how a verdict is reached

### 6.1 The rubric is written before the sessions, and it is the artefact that can fail

**The rubric is committed to the round plan before the first session runs**, and its wording is not
touched afterwards. `docs/25` X2 requires exactly this — *"transcript coded against a rubric written
before the sessions"* — and the reason is `docs/30 Q11`: a rubric edited after the transcripts are
read is a threshold moved to fit a result.

**`charter S6` — what counts as stating the ground, unprompted.** A tester's statement counts when
**all four** hold:

1. It is **tier 0** (§ 4.5).
2. It names a **cause** for the figure's absence that is consistent with the ground the product
   actually cited on the screen in front of them — in **any** vocabulary. Plain words count fully:
   *"it couldn't keep up, so an average of that would be nonsense"*, *"so many people were still
   waiting that the number wouldn't mean anything"*, *"it hadn't finished with the queue so it can't
   say yet."*
3. It is **not a read-back**. The product prints its own reason, so reciting the on-screen sentence
   demonstrates literacy rather than understanding. The statement must be in words that are not on
   the screen, **or** apply the reason — predicting that the number would return if the building
   coped, or that a different day would show one.
4. It attributes the absence to **the simulator's judgement**, not to a fault. *"It's broken"*,
   *"they haven't finished that bit"*, *"it didn't load"* do not count, and each is a **finding**
   against the wording — recorded in the round's own defect list, because a refusal that reads as a
   bug is `charter P2` failing.

**There is no partial credit.** A statement either meets all four or it does not. A rubric with
half-marks is a rubric whose result depends on who read it.

**`docs/25` X2's first half — what counts as stating what went wrong and why the change helped.** The
tester, in their own words: names something specific about the day that was wrong (not *"it was
bad"*), names the change they made, and connects the two with a mechanism they can state. The
mechanism does not have to be right — **a wrong but stated mechanism counts for X2 and is recorded as
a finding**, because a product that teaches a confident wrong model has done something worse than
teach nothing, and the round needs to be able to say so.

**`docs/25` X1 — what counts as completing the slice.** Reached beat 5 of `docs/25` § 1.2 and read a
verdict, in one sitting, with **no more than two re-orientation prompts** (§ 4.6) and no instruction
naming a control. A session is stopped and recorded as incomplete when the tester says they are done,
or asks what to do next and cannot proceed after the permitted prompts. **Where they stopped is
recorded to the screen and the second** — an incomplete session is one of the most informative
results the programme produces and it is never treated as a wasted slot.

### 6.2 Coding — two coders, independently, and the disagreement is data

1. **Two coders**, each working from the recording and transcript against the committed rubric,
   **independently and without conferring**.
2. The **moderator of a session may not be its sole coder**, and may never be the tie-breaker for
   their own session. Where staffing forces the moderator to code, the second coder must have run no
   session in the round.
3. **Disagreements are resolved by a third read, not by discussion between the two coders.**
   Discussion converges the second coder onto the first, which produces agreement and destroys the
   independence that made agreement worth having.
4. **The raw disagreement count is published in the write-up**, before the result. It is the measure
   of whether the rubric is any good.
5. **If the coders disagree on more than a fifth of the codable statements, the round reports the
   rubric's failure rather than a rate.** A rate produced by a rubric two careful readers cannot
   apply the same way is not a measurement, and reporting it would be the confident nonsense
   `CLAUDE.md` names. The round is re-coded against a repaired rubric **only if** the repair is
   applied to every session, or re-run.

### 6.3 The bar, and both halves fail independently

| criterion | bar | fails when |
|---|---|---|
| `docs/25` **X1** | **10 of 10 complete** the slice unaided, in one sitting | Fewer than ten complete, or the record cannot say where one stopped |
| `docs/25` **X2** first half | **6 of 10** state what went wrong and why their change helped | Fewer than six |
| `docs/25` **X2** second half = **`charter S6`** | **6 of 10** state, **tier 0**, the ground on which a figure was refused | Fewer than six |

**The two halves of X2 fail independently and are never averaged, summed, or reported as one
number.** A round producing 8 and 4 has failed, and reporting *"12 of 20 statements"* would be the
collapse `docs/25` wrote the second half to prevent.

**X1 is a 10-of-10 bar and that is not a typo.** `CHARTER_PROGRAMME.md` § M2 says *ten testers …
complete the slice*, not *most of*. A slice that defeats one stranger in ten has a defect the round
found, and the honest outcome is the defect, not a rounded pass.

### 6.4 `charter S7`'s verdict, and the questions that reach it

Block 4's interview, asked in this order and worded verbatim, after the practitioner has inspected
the model and tried to break it:

1. *"What did you check first, and what did you find?"*
2. *"Is there a number on any screen you would not put your name to?"*
3. *"Where does this model depart from how a real group behaves?"*
4. *"Does anything here make a claim it has not earned?"*
5. **The verdict question:** *"Would you believe a result this tool produced, for a building you were
   working on? What would have to change for the answer to be yes?"*
6. *"Name the modelling defect that most changes your answer to 5."*

**Scoring.** `charter S7` fails when **a majority of the recruited practitioners name a modelling
defect that changes their verdict** — the charter's own wording, unchanged. So each practitioner's
session yields one binary: did question 6 produce a **verdict-changing modelling defect**, or not.

Three definitional points, fixed before the round because each is where the criterion would
otherwise be negotiated afterwards:

- **A modelling defect is about the simulation**, not the interface. *"The report is confusing"* is a
  finding and is not a modelling defect. *"You are not modelling door dwell against boarding
  demand"* is.
- **Verdict-changing means the practitioner says so**, in answer to question 5's second half. A
  defect they name and then dismiss as immaterial does not count against the criterion, and is
  recorded anyway.
- **A defect that verification refutes still counts against the criterion for that round.** This is
  deliberate and it is the harder reading: `charter S7` measures whether practitioners *rate the
  model credible*, and a practitioner who believes a defect exists has not rated it credible even if
  they are mistaken. The refutation is recorded in full (`docs/30 Q4`), it is what would change the
  next round, and **§ 7.5's second question applies with force** — a practitioner who reached a wrong
  conclusion about the model from the screen has usually found something real about the screen.

### 6.5 Who decides — the verdict is a human gate

**No agent records the review as passed** (`docs/30 Q12`). This is not a formality; it is the same
rule [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) already applies to opening and closing a
milestone (*"the orchestrator prepares the evidence; it does not open or close a milestone"*), to the
feature freeze, to the content freeze, and to any deploy.

What an agent **may** do: assemble the transcripts, produce the tabulation, quote the coded
statements with their tier stamps, publish the disagreement count, state which side of each bar the
count falls on, and write the § 8 document up to but not including the verdict line.

What an agent **may not** do: write the verdict, code a statement as the tie-breaking third read,
decide that a borderline statement meets the rubric, or record a criterion as met.

**And a round that reaches six of ten does not pass by arithmetic.** The gate is a human reading the
six coded statements and agreeing they are what the rubric says they are. The count is necessary and
is not sufficient — because the one thing a count cannot catch is a rubric that was generous, and the
person who has to live with the product is the one who should notice.

### 6.6 What may never be published from a round

- **A confidence interval on any rate from this programme** (`docs/30 Q10`).
- **A generalisation to *players***. *"Six of ten testers"* is the only legitimate form; *"60 % of
  players"* is not, and `charter S2`'s 60 % is telemetry's number from a different instrument
  entirely.
- **A round-to-round delta reported as a paired comparison.** See § 10 — there are no common random
  numbers for people.
- **A pass on a denominator other than the one the round fixed before it started.**

### 6.7 What is reported beside the result, every time

Composition, so a reader can see what kind of ten produced the number: the channel each tester came
from; the count who described themselves as regular players of simulation or management games; the
count who had done a research session in the last twelve months; the count screened out at the door
and why; the count of re-orientation prompts granted; and the number of sessions run versus the
number counted, with the reason for every gap. **A result without its composition is a number whose
bias is unknown and unstated**, which is exactly the fault `docs/26` § 4.2 refuses to commit about
consent rates.

---

## 7. The finding pipeline — capture, verification, ledger, schedule

### 7.1 Capture — observations, not diagnoses

During the session the moderator writes only what happened: a timestamp, the screen, what the tester
did, what the tester said **verbatim**, and what was on screen when they said it.

**A note that names a module, a cause or a fix is rewritten before it leaves the session**
(`docs/30 Q7`). The rewrite is mechanical:

| written in the room | leaves the room as |
|---|---|
| *"the report panel is computing the window wrong"* | *"at 34:10, on the report, T4 said 'that says nothing happened but I watched people queue'"* |
| *"navigation is broken"* | *"at 12:40 T4 pressed the fourth breadcrumb step twice and nothing happened; they then pressed it a third time and said 'is it thinking?'"* |
| *"needs a tooltip"* | *"T4 hovered the figure for about four seconds, then moved on without comment"* |

The right-hand column is what verification can act on. The left-hand column is what the measured
error rate is made of.

### 7.2 Claims — what an observation becomes

After the session, each observation the moderator judges actionable becomes a **claim** with:

- a **claim id** — `PT<round>.<session>-<n>`, e.g. `PT2.4-3`. It is an identifier, not a numbered
  series in [§ D343](../DECISIONS.md)'s sense, and it is never cited as one;
- the **build sha** the tester played (`docs/30 Q3`);
- a **reproduction**: seed, screen, and the exact action sequence, in the form `docs/19` and
  `docs/20` already use — *"reload the page mid-campaign → press Resume → press Run this shift → play
  the day to its very end"*;
- **what the tester expected**, in their words;
- **what the product did**;
- **the tester's own words**, verbatim and attributed to `T<n>` only (§ 9.4).

**A claim has no severity and no owner at this point** (`docs/30 Q6`).

### 7.3 Verification — who, against what, and what comes out

**Who.** A verifier who did not run the session (`docs/30 Q2`).

**Against what.** The tree at the claim's recorded sha (`docs/30 Q3`), by the standard
[`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) sets for itself: *"every claim
is either measured by a run recorded here or traced to file:line."* Never against a dated audit,
never against another document's summary, and — for cohort B — never before reading `DECISIONS.md`'s
record on the point (§ 3.5).

**What comes out — three dispositions, and the third is the one that matters most.**

| disposition | what it means | what it produces |
|---|---|---|
| **CONFIRMED** | The observation is real and the stated cause holds | An issue, with the trace attached and the severity now assigned |
| **REFUTED** | The central premise does not hold on the recorded tree | A ledger row with the refutation, **and § 7.5's second question** |
| **RESHAPED** | The observation is real; the stated cause is wrong or the surface is a different one | A ledger row carrying **both** the original claim and the corrected one, then an issue against the corrected surface |

**RESHAPED needs its own name and this is why.** Filed as CONFIRMED, it ships a fix to the wrong
place; filed as REFUTED, it loses a real defect. **It is also where most of the measured error rate
sits**, and that reading is an inference from `RISKS.md` R35's own numbers rather than a separate
measurement: two of thirteen were refuted *at the central premise*, and eight carried a false or
materially misleading clause on a premise that survived — which is this disposition, under a name
that wave did not have. **#212 is the worked example**: a P0 asking for a renderer rebuild where the
real defect is a door-fill inversion, recorded in
[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2 as *largely refuted*. The observation was
true, the cause was wrong, and both facts had to survive.

**Verification may widen the scope, and often should.** `RISKS.md` R35's mitigation says a stated
criterion *"may be widened at the gate when verification shows the real surface is larger"*. A tester
who trips over one instance of a class has found the class; the issue is written against the class,
with the instance as its reproduction.

### 7.4 The ledger, and then scheduling

**Every claim lands in the round's write-up**, in one of the three tables of § 8. The write-up is the
ledger; there is no second private list, because a private list is how a refuted claim quietly
becomes a scheduled one.

**Only CONFIRMED and RESHAPED claims may open an issue.** The issue carries:
the verification trace — file and line, or the run; the reproduction; the tester's words as evidence,
never as the specification; the severity, assigned at this point from the vocabulary `docs/19` and
`docs/20` already use — **blocks-play**, **confusing**, **polish**; and the owning module, named by
the verifier and not by the moderator.

**An issue's acceptance criterion is written from the verified surface**, not from the claim. This is
the step where the measured error rate would otherwise re-enter: an acceptance criterion transcribed
from a tester's sentence inherits whatever was wrong with it.

### 7.5 The refutation path, first-class

**A refuted claim is recorded, never dropped** (`docs/30 Q4`), in a table of its own in the round's
write-up, at the same prominence as the confirmed ones, with the trace that refutes it. Three reasons,
and the third is the useful one:

1. **The tester was not wrong to report it.** They reported what they saw and believed. Deleting it
   makes the round's record a record of the team's agreement rather than of the session.
2. **The same claim will come back.** A refuted claim with its refutation written down is answered in
   ten seconds next round. Deleted, it costs a verification cycle every time.
3. **A refuted claim about a mechanism is frequently a confirmed claim about a sentence**
   (`docs/30 Q5`). **The verifier must ask, in writing, on every refutation: did the product cause
   this belief?** If a screen, a wording, a layout or an absence made a reasonable person conclude
   something untrue, that is a defect — and it is the kind this project cares about most, because
   [`docs/22-charter.md`](22-charter.md)'s `charter P2` is that *a refusal is a feature, not an error
   state*, and a player concluding *"it's broken"* is that pillar failing on the only surface where
   it can be observed.

The question has a written answer either way. *"No — the tester's expectation came from another
product's convention"* is a legitimate answer and is itself worth having on the record.

### 7.6 The one exception, and it is an exception about speed rather than about rigour

A **blocks-play** observation — the tester cannot continue the slice at all — stops the session
immediately and is **escalated** the same day. The M2 route has form here: `docs/19`'s defect 1 was a
trap that made every run silently unfileable after a reload, and it would have destroyed a round's
denominator inside two sessions.

**Escalating and scheduling are different things.** The escalation says *stop the round and look at
this now*; it does not open a fix lane. The claim is verified like any other, and it is verified
first because everything else is waiting on it. `docs/30 Q1` is not suspended for urgency — the
measured error rate does not fall when something is urgent, and the three claims in the verification
wave that *"would have shipped a new defect if actioned literally"* included a P0.

**The round pauses.** Sessions already run are written up and their findings kept; they **do not
count toward the ten**, because `docs/30 Q8`'s pinned build no longer describes the round. When the fix
lands, the round restarts on the new sha with fresh testers — which is the real cost of a blocks-play
defect and is the number to put in front of whoever is deciding whether to fix it now.

---

## 8. The write-up — the house format, and it already exists twice

**A round is not complete until its document exists.** The format is
[`docs/19-everyday-playtest-audit.md`](19-everyday-playtest-audit.md) and
[`docs/20-everyday-playtest-audit-2.md`](20-everyday-playtest-audit-2.md), because two of these
already exist and a third format would be drift. What follows is their shape, made explicit, plus
one section they do not have.

1. **A status blockquote**, first thing: which round, the pinned build sha, the date, which cohort,
   how many sessions, and the headline verdict. `docs/20`'s is the model — it states the counts
   (*"nine verified fixed, three partial, no regressions"*) and the two findings that matter before
   any detail.
2. **The method paragraph, including the base, stated honestly.** `docs/20` records that its
   checkout moved under it mid-walk and says which observations are on which tree. A round pins its
   build (`docs/30 Q8`) so this paragraph should be short — and when it cannot be, it says so rather
   than averaging.
3. **The per-flow verdict table**, with `docs/19`'s columns unchanged:
   **Flow | Playable | Navigable | Intuitive | Informative | The observation that decides it.**
   The last column is the one that carries the document; a table of yes/no with no deciding
   observation is a table nobody can check.
4. **The re-walk table**, where a round follows an earlier one: previous finding, verdict
   (`VERIFIED` / `PARTIALLY` / regression), evidence. `docs/20`'s Part A. **Re-walked as a player,
   not by reading the code** — `docs/20` says so in as many words and it is the difference between
   confirming a fix and confirming a diff.
5. **The ranked findings**, each with severity from the shipped vocabulary (**blocks-play**,
   **confusing**, **polish**), a reproduction a reader can follow, an owning module, and — the
   addition — **its verification disposition and trace**.
6. **The three claim tables.** Confirmed; reshaped, carrying both the original and corrected claim;
   and **claims that did not survive verification**, with the refutation and the written answer to
   § 7.5's *did the product cause this belief?*. **This is the section the two existing audits do not
   have**, and it is added deliberately: [`ISSUE_WORKER_LEDGER.md`](../ISSUE_WORKER_LEDGER.md)
   already carries such tables for issues, and a playtest write-up owes exactly the same.
7. **The gate arithmetic**: the coded counts, the tier stamps, the coder disagreement count, the
   composition of § 6.7, and which side of each bar the round falls on — **with the verdict line left
   blank for a human** (§ 6.5).
8. **The session narrative.** `docs/20`'s Part C, and it is not decoration: *is there a loop worth
   repeating*, *where a first-timer gets lost or bored*, *the single best moment*, *the single worst
   moment*. It is the only part of the format that can say a product is working, and the two existing
   audits are considerably more useful for having it.
9. **What I would do next** — ranked, few, and each pointing at a surface rather than a redesign.

**Screenshots and recordings are evidence and are not committed.** Both existing audits keep them in
a session workspace and say where; § 9.5's retention horizon then applies to them. The write-up is
the durable artefact.

**Numbering.** The next free document number in `docs/` at the time of writing. The round's document
cites this one as `docs/30`; this one does not list them, because a list of rounds in a specification
is a register that goes stale — [`README.md`](../README.md)'s documentation table is where a reader
finds them, and adding that row is the integrator's step.

---

## 9. Consent, recording and data handling

### 9.1 This is a second consent, and bundling it with the first is forbidden

A playtest collects personal data, and it collects a **kind the product deliberately never
collects**. [`docs/26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) `docs/26 P-4` is *no
free text, ever* — *"a player-authored string can contain anything, including somebody else's
personal data, and there is no field in this schema it can reach"* — and `docs/26 P-2` is *name the
run; do not describe it*. **Neither rule can be applied here.** A session is free text by
construction: a voice, a face, a screen, and a person's sentences. You cannot re-derive what somebody
said from a seed.

So the posture is not extended; it is **paralleled, with the difference stated**:

| | product telemetry (`docs/26`) | this programme |
|---|---|---|
| Default | Off. Nothing before an explicit grant (`docs/26 P-1`) | Off. No recording before a signed grant |
| What is held | Pointers: a seed, a configuration, a vocabulary member | **Content**: voice, screen, notes, quotes |
| Free text | Forbidden outright | **Unavoidable**, and it is the instrument |
| Identity | A browser-profile `playerId`, unjoined | A person, known to the recruiter (§ 9.6) |
| Grant | One question, on first load | **Five separate asks** (§ 9.2), in writing and again on camera |

**The two consents are never bundled.** `docs/26` § 4.4 forbids the consent surface becoming *"a
place to put anything else"*; the same rule runs the other way. A tester who agrees to be recorded
has not agreed to telemetry, and a player who agreed to telemetry has not agreed to be recorded.

### 9.2 What is asked, separately, before and again at the start

Five asks, each answerable independently, none pre-ticked, none phrased so that one answer looks like
the way forward — `docs/26` § 4.1's standard applied to a form instead of a screen:

1. **Record the screen.**
2. **Record the audio.**
3. **Record the face or webcam.** Optional, and **refusing it does not end the session**; the session
   runs on screen and audio.
4. **Quote verbatim in a published document**, attributed to `T<n>` and never to a name.
5. **Keep the recording after the round's write-up is accepted**, up to § 9.5's horizon.

Asked **in writing before the session** and **again, briefly, on camera at the start**, because a
form signed three days earlier is not a grant anybody remembers giving. The tester is told, in the
same breath, that they may stop at any moment without giving a reason and that compensation is
already theirs (§ 3.4).

**What the ask says.** In the tester's own vocabulary, what is recorded, who sees it, how long it is
kept, and what it is for — *"to work out where the game confused people"*. Not *"to help us
improve"*, which is `docs/26` § 4.1's example of a request with the content removed.

### 9.3 What must not be recorded

- **Anything on screen that is not the product.** The tester's other tabs, notifications, desktop and
  files are not in scope. The session runs in a window sized to the product, and the moderator says
  so before recording starts.
- **Anything identifying beyond the grant.** If a tester states an employer, a client, a building or
  a third party's name, the moderator notes the timestamp so it can be cut from any published clip
  and paraphrased in any quote.
- **Screener free text, joined to session data.** § 3.4's question 3 is free text; it is used to
  route the candidate and is then reduced to a cohort label. The free text is not kept with the
  session.

### 9.4 Quoting, and the sharper rule for cohort B

Quotes are attributed to **`T<n>` within a named round** — *"T4, round 2"* — never to a name, an
employer, a role, or a combination that identifies. Composition attributes (§ 6.7) are published in
aggregate only.

**A quote that could identify the tester is paraphrased, and the paraphrase is marked as one.** For
cohort B this binds harder and will bite often: practitioners talk about buildings they worked on,
clients they have, and specifications they wrote. A verbatim expert objection is frequently the most
valuable sentence in a round and simultaneously the most identifying. **Paraphrase it, mark it, and
if the paraphrase would lose the technical content, ask that practitioner for a specific release of
that specific sentence.**

### 9.5 Retention, and withdrawal

| class | horizon | why |
|---|---|---|
| **Raw recordings** (screen, audio, face) | **90 days** from the round's write-up being accepted | Matches `docs/26` § 5.1's raw-event horizon, for the same reason: the durable artefact is the write-up, and the recording exists so a second coder and a third read can check it (§ 6.2) |
| **Transcripts, identifiers stripped** | With the round | They are the evidence behind § 8's quotes |
| **Coded rubric outcomes and the write-up** | **Indefinite** | They carry no identifier and no pointer — `docs/26` § 5.4's footing for a safe aggregate |
| **Screener responses** | Deleted when the round closes | Their only purpose is eligibility and § 6.7's composition counts, which are aggregated first |
| **The spent-tester register** | Indefinite, minimal, separate | § 9.6 |

**Withdrawal.** A tester may withdraw at any point up to the acceptance of the round's write-up.
Withdrawal deletes their recording and transcript and removes their quotes — it does not merely stop
future use, which is `docs/26` § 4.3's rule (*"a withdrawal that only stops future collection is not
a withdrawal"*).

**And it has a consequence, stated plainly rather than absorbed.** A withdrawal takes the round below
ten. The round is **not** reported on nine: a gate met on a changed denominator is exactly the
widening `docs/30 Q11` forbids. A reserve tester is seated (§ 3.1), the round is not reported until
ten stand, and **a withdrawal after the round has been coded means the round is re-run rather than
re-reported** — because at that point the only way to reach ten again is to seat somebody after the
count is known, which is `docs/30 Q9`. That is expensive, and it is the honest price of a withdrawal
right that is real rather than nominal.

### 9.6 The spent-tester register — the one store with an indefinite need

§ 3.3 point 5 requires knowing who has already been a tester, forever. That is a personal identifier
with no horizon, in a document otherwise built on horizons, and pretending otherwise would be worse
than specifying it:

- It holds **a contact identifier and the round number. Nothing else.** No screener answers, no
  findings, no quotes, no session data.
- It is **held by whoever runs recruitment** and is **not joined** to session data at any point.
- **The tester is told it exists** at the same moment as § 9.2's asks, and told what it is for: so
  they are not invited back to a study that only works on people who have never seen the product.
- **They may ask for removal**, and the honest cost is stated to them: removal means they may be
  invited again, and would then be turned away at screening — or, worse, not turned away.
- It is **not a mailing list** and may not become one. `docs/26` § 4.4's *"not terms, not a
  newsletter, not an account prompt"* is the same rule wearing different clothes.

### 9.7 Where the tester's own data is not the only privacy question

A recorded session captures **the product**, and the product has a leaderboard, accounts and other
people's runs (`packages/server/src`). A round run against a build with real board entries records
other players' display names. The round plan says which build it is on; where a board is populated,
either the build is served with the board unpopulated, or the published clips are cropped. **This is
not the tester's consent to give.**

---

## 10. What this programme cannot measure

Stated plainly, because `docs/26` § 9.1 refused to offer a proxy for `charter S6` and it would be a
poor answer to that refusal to over-claim on the other side.

- **Anything about a population.** Ten people is not a sample (§ 3.1). No rate here estimates
  *players*, and `charter S1`–`charter S4` are telemetry's, without exception.

- **`charter S1`'s ninety seconds.** This is the precise one and it corrects a tempting over-claim.
  `docs/23` A1 has two halves — *a queue is on screen that the building is visibly not draining* and
  *within 90 seconds of a first load*. The programme measures the **first** half well: a person
  either saw trouble or did not, and can say so. It **cannot** measure the second, because
  think-aloud slows a player down, a moderator's presence removes the option of leaving, and a
  session clock is not a first session's clock. The round records where the tester was at 90 s as an
  **observation**, never as `charter S1`'s median, which is a funnel's number.

- **Whether a fix worked, compared across rounds.** Every round is a different cohort, so a
  round-to-round delta is confounded by the people. **This programme has no common random numbers.**
  `CLAUDE.md` is explicit that feeding the same traces to every alternative is worth 5–20× in
  required run count, and there is no equivalent for humans: you cannot replay a person against a
  changed build. Round two's *six of ten* against round one's *four of ten* is **not a paired
  comparison** and may not be reported as one. What a round can honestly do is the `docs/20` Part A
  re-walk — take the previous round's specific findings and check, on the new build, whether the
  behaviour that produced them still occurs.

- **Long-run behaviour.** Day three of a campaign, week two of a habit, whether anyone comes back.
  `charter S4`'s retention is a cohort measurement and there is no moderated equivalent.

- **Whether a tester would have kept playing.** A session ends when the protocol says so. Voluntary
  session length in the wild is `charter S3` and belongs to telemetry.

- **Accessibility conformance.** A round of sighted, mouse-using testers is not an accessibility
  audit and says nothing about #204's standard. Where a tester's own access needs shape the session
  (§ 3.4, question 6), that is recorded as evidence — and it is evidence, not a sweep.

- **Art, audio and aesthetic preference.** A tester's opinion about a colour is recorded as an
  observation and never as a verdict. Audio in particular is currently a *recommended cut* awaiting a
  human ([`docs/29-audio-direction.md`](29-audio-direction.md)), and a round may not be cited to
  reopen it.

- **Whether the simulation is correct.** That is the Barney/CIBSE oracle, the property corpus and the
  paired intervals. A cohort-B practitioner can find a modelling defect and that is exactly what
  § 6.4 asks for — but a practitioner failing to find one is **not** evidence the model is right, and
  `charter S7` is careful to be about a *verdict on credibility*, not about correctness.

- **Anything at all, before the instruments exist.** `docs/22-charter.md` § 4's rule binds this
  document like every other: **no criterion may be reported as met before its instrument exists.**
  This document is a specification. Until a round has been run, `charter S6` and `charter S7` are
  **unevaluated** — not failing, not met, and never *"expected to pass"*.

---

## 11. What this document does not discharge

- **It does not run a round.** No cohort is recruited, no session is scheduled, no build is pinned.
  M2's exit criteria are unmet and this document does not change that; it makes them reachable.
- **It does not choose a recruitment channel or a compensation figure** (§ 3.4). Both are
  product-owner decisions and a lane making them would be a lane setting a budget.
- **It does not write the rubric for a specific round.** § 6.1 fixes the rubric's *form* and the
  four conditions of the `charter S6` code; a round's own rubric — with the pinned build's actual
  refusal wordings in it — is written into that round's plan, before its first session.
- **It does not write the consent form or the screener as documents.** §§ 3.4 and 9.2 specify what
  they must contain and what they may not; the artefacts themselves are the first round's work, and
  the consent form in particular may need review this lane cannot give it.
- **It does not amend [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md).** § 5.5 records that
  `charter S7` is gated nowhere and `charter S6` only through `docs/25` X2; placing them is a human
  decision at a gate, and this lane may not edit that file.
- **It does not settle whether `docs/25` X1's ten-of-ten completion bar survives contact with a real
  round.** It might not. `docs/30 Q11` says what happens then: it is raised or it is met, never
  quietly widened.
- **It carries no decision number of its own.** One is owed for § 2's governing rule and § 6.5's
  human gate, allocated at integration.

---

## Sources

- [`docs/22-charter.md`](22-charter.md) § 3, § 4 — the two audiences, `charter S6` and `charter S7`,
  their instruments, and the rule that a failed criterion is raised rather than weakened. Adopted at
  [§ D342](../DECISIONS.md); series cited with their document per [§ D343](../DECISIONS.md).
- [`docs/23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 1 — conditions **A1–A4** and
  **B1–B4**, which criterion each serves, and § 1.4's restatement rule.
- [`docs/25-vertical-slice.md`](25-vertical-slice.md) § 1.2 (the route), § 2 (the quality bar),
  § 3 (**X1**, **X2** and why X2 has two independently-failing halves), § 6.2 (the refusal is
  deliberately reachable and is not manufactured).
- [`docs/26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) § 1.1 (`docs/26 P-1`–`P-6`),
  § 4 (consent, refusal, withdrawal), § 5 (retention classes and horizons), **§ 9.1** — the refusal
  to offer a proxy for `charter S6` and `charter S7`, which is why this document exists.
- [`docs/19-everyday-playtest-audit.md`](19-everyday-playtest-audit.md) and
  [`docs/20-everyday-playtest-audit-2.md`](20-everyday-playtest-audit-2.md) — the house write-up
  format: per-flow verdicts, ranked defects with reproductions and owning modules, the re-walk table
  and the session narrative.
- [`docs/elevator-sim-playtest-report.md`](elevator-sim-playtest-report.md) and
  [`README.md`](../README.md)'s note on it — *"a report rather than a finding"*, the worked example
  behind § 2.
- [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M1, § M2, § M4, § M6 — the milestone this
  document belongs to, the gate it unblocks, and the *verify-before-schedule* rule stated for the
  community loop.
- [`RISKS.md`](../RISKS.md) R31 (five criteria unevaluable), R35 (the measured feedback error rate),
  R38 (a published count with no deriver), R39 (cite a series with its document).
- [`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) and
  [`ISSUE_WORKER_LEDGER.md`](../ISSUE_WORKER_LEDGER.md) — the verification standard § 7.3 adopts, and
  the *claims that did not survive verification* tables § 8 extends to playtests.
- [`CLAUDE.md`](../CLAUDE.md) § *Statistical discipline* — never report a difference smaller than the
  noise, never compare overlapping intervals, and always use common random numbers. § 10 is what
  those rules mean when the subject is people.
- [`DECISIONS.md`](../DECISIONS.md) [§ D163](../DECISIONS.md) (a criterion satisfied by assertion),
  [§ D256](../DECISIONS.md) / [§ D279](../DECISIONS.md) / [§ D280](../DECISIONS.md) (measured
  mechanism claims a cohort-B verifier must read first), [§ D299](../DECISIONS.md) (a change may not
  make the product say less), [§ D335](../DECISIONS.md) (the page opens on Everyday Mode).
