# Project Charter — the game layer

**Status: ADOPTED, 2026-08-24, by the product owner — [§ D342](../DECISIONS.md).** Supersedes
nothing. Governs the game layer only; where this document and [`CLAUDE.md`](../CLAUDE.md) disagree,
`CLAUDE.md` wins.

**Four of the five pillars are reconstruction, and § D342 adopts them knowing that.** Only **P3**'s
wording is directly attested; P1, P2, P4 and P5 are this document's construction, adopted as they
stand and amendable at the direction review. § 8 is the paragraph to read first if a pillar looks
wrong.

**Cite the criteria as `charter S1`…`charter S10`, never bare** — [§ D343](../DECISIONS.md).
`docs/16-change-scope-contract.md` also numbers a set `S1`–`S10`, having chosen that letter to avoid
colliding with `docs/10`'s `R1`–`R13`, and this document collided with it anyway.

Satisfies issues **#186** (adopt a charter), **#187** (vision and player promise) and **#192**
("done", with criteria that can fail). The milestone pages are
[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md); the plan is
[`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md).

**Why this document exists.** [`00-project-brief.md`](00-project-brief.md) is a research brief and
says so. It uses the word *game* **zero times** — `grep -ci game` against that file returns `0` — and
all five of its success criteria are engineering criteria. Every document downstream inherited
that omission, which is how Phase 9 could be accepted while [§ D163](../DECISIONS.md) excluded playability from its criterion *as
unfalsifiable* ([`05-roadmap.md`](05-roadmap.md) lines 1996–1999; `DECISIONS.md:10066-10069`). The
brief is not wrong and is not amended. **The charter is the half that was missing.**

---

## 1. Vision and the player promise

> **Vision.** Elevator Sim makes a hard engineering problem legible. You take charge of a building
> that is failing its tenants, work out why, change one thing, and find out whether you were right.
> The building is real, the physics are real, and the answer is measured rather than granted.

> **Promise.** Ninety seconds from now you will understand why the lobby is backing up. Ten minutes
> from now you will have proved that your fix worked, and you will be able to hand that proof to
> someone else.

Both are short enough to quote from memory, which is the point of them. The promise names **two
times and two observable outcomes**, so a playtest can measure it rather than agree with it: the
90 s clause is criterion **S1**, the ten-minute clause is **S3**, and *proved that your fix worked*
is **S2**. A promise no instrument can refuse is marketing, not a charter clause.

**The promise is a claim about the product, so it is falsifiable and it is currently unproven.**
Nothing in this tree measures a first session — see § 4.

---

## 2. The five design pillars

A pillar is not a value. **A pillar is a sentence a reviewer may quote to refuse a pull request**,
and every player-facing pull request names the pillar it serves
([`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) § 8).

### P1 — The building is real

Every number on a player surface comes from the run, the batch, or `core/analytical`. No figure is
computed for effect, rounded for pacing, or generated to fill a layout.

**Refusal test.** *Name the run this number came from.* If the answer is a formula written to make
the screen look right, the change is refused. The vendored design handoff at
[`design/`](design/) is a prototype with its own toy simulator — its report sheet computes average
wait as `28 + (100 − pct) × 0.9` — and [`12-design-handoff.md`](12-design-handoff.md) already
splits the two: **the handoff wins every disagreement about what the screen looks like; the
simulator wins every disagreement about what a number means.**

### P2 — A refusal is a feature, not an error state

When the run cannot support a figure, the product says so and says why. Refusals are drawn, worded
for the audience in front of them, and never softened, deferred or replaced with a plausible
number.

**Refusal test.** *Does this change make the product say less?* A change that removes a figure,
widens a threshold, hides a qualifier, or rewords a refusal into reassurance is refused — this is
[§ D299](../DECISIONS.md)'s standing test, and it binds the game layer in both registers, not only
Engineer. A stale refusal is the more dangerous half: a control that writes something may not claim
it writes nothing ([§ D227](../DECISIONS.md)).

### P3 — The stage shows what the report will later say

What the player watches and what the report concludes are the same run. The stage must make the
conclusion **visible before it is stated**, so the report confirms something the player already
suspected rather than announcing something they never saw.

**Refusal test.** *Where on the stage would a player have seen this?* If the report's headline has
no visible antecedent during the run, either the stage is missing a cue or the report is asserting
something the run did not show. **This is the pillar the build currently fails outright**
([`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) § 1, goal 4), and it is why M2 carries a stage
issue as a P0.

### P4 — One change, measured

The loop is **diagnose → change one thing → prove it**, and every session closes it. A screen that
cannot be reached from the loop, or that the loop cannot return from, is not a screen — it is a
dead end with art on it.

**Refusal test.** *Move the control and require the run to change*, compared on the legs rather
than on a window statistic. A control that fails this is deleted, not documented
([§ D219](../DECISIONS.md)). The same question is asked of requirements: **name the non-test
caller.** *The plan says it already exists* is not an answer.

### P5 — Plain language is not less information

The two audiences get the same run, the same buildings and the same figures. What differs is the
wording. A plain-language register may change the words around a number; it may not change the
number, drop its qualifier, or omit the ground on which it was refused.

**Refusal test.** *Which figure did this wording lose?* If the plain register carries a claim the
technical register does not, or drops one the technical register does, the change is refused. The
rule for how one figure is worded two ways is in `23-audiences-and-core-loop.md`, this directory's
next document.

**Provenance.** P3's wording is attested — [`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) line 75
names it as *pillar 3* and as the one the build fails. **P1, P2, P4 and P5 are reconstructed** from
the goals, refusals and standing rules this repository already carries, because the kickoff text is
not in the tree; see § 8. Their ordinals are load-bearing from this commit onward and are not to be
renumbered.

---

## 3. The two audiences

Full treatment — what each arrives with, what loses them, what they must have achieved by the end
of the first session, and the wording rule P5 names — is in `23-audiences-and-core-loop.md`, the
sibling of this document in this directory. **This section is the summary the charter needs to
state its own criteria against, and it is not the definition of record.**

| | **The curious player** | **The enthusiast or practising engineer** |
|---|---|---|
| Arrives with | No lift knowledge, about ten minutes of patience | Domain knowledge and a working suspicion that the model is fake |
| Wants | To see something wrong and fix it | To find out whether the numbers survive being checked |
| Loses them | Being asked to know what AWT stands for | One unsupported claim, or one figure they cannot trace to a run |
| Must have, first session | Seen a building visibly struggling inside 90 s, understood why within three minutes, made one change that measurably helped | Found the closed-form CIBSE check, the seed, the paired interval, and the grounds on which a mean was refused |

**What they share is not negotiable: the same run, the same buildings, the same figures.** The
split is register, never substance — P5.

**One reconciliation this section owes and does not discharge.** `packages/viz/UX.md` already
defines five roles (Analyst, Designer, Reviewer, Newcomer at `:757-764`; Operator at `:82-89`).
They are engineering roles rather than market audiences, and they were written before this charter.
**Two audiences and five roles must be reconciled rather than left to coexist** — a repository that
carries both without saying how they relate has acquired the stale-statement defect class it exists
to record. The reconciliation belongs to `23-audiences-and-core-loop.md` and is an M0 exit item.

---

## 4. Success criteria S1–S10

These are the player-facing criteria. **Each names its instrument, and each can fail.** They stand
beside the engineering criteria in [`00-project-brief.md`](00-project-brief.md) § *Success
criteria*, which are untouched by this document and remain binding in full.

| # | Criterion — stated so it can fail | Instrument | Fails when |
|---|---|---|---|
| **S1** | A first-time player reaches a building in visible trouble **within 90 s of first load** | First-session funnel, timestamped | The median time-to-visible-trouble exceeds 90 s, or the funnel cannot identify the moment |
| **S2** | **60 %** of first sessions complete one diagnose–change–prove cycle | Telemetry event chain, ordered | Under 60 % of first sessions emit the full chain |
| **S3** | **Median first session is 10 minutes or longer** | Session-length distribution | The median falls below 10 minutes |
| **S4** | **25 %** of day-one players return within 7 days | Cohort retention | Under 25 % of the day-one cohort returns inside the window |
| **S5** | **No campaign stage clears from the dispatcher dropdown alone** | Automated sweep over every stage × every admitted profile, paired intervals under CRN | Any stage records `verdict.cleared` on a dispatcher change with no other intervention |
| **S6** | **6 of 10** testers can state, unprompted, why the simulator refused a number | Moderated playtest, recorded | Fewer than 6 of 10 can state the ground |
| **S7** | Lift-industry testers rate the model credible **after inspecting it**, not after being told about it | Structured interview following a hands-on inspection | A majority of recruited practitioners name a modelling defect that changes their verdict |
| **S8** | **Every player-facing claim survives the honesty search** | The R1–R13 corpus, both tiers, extended to every new surface | Either tier reports a violation not held in `honesty.test.ts`'s `OUTSTANDING` register |
| **S9** | Cold load to interactive **under 3 s** on a mid-range laptop | CI budget, failing the build | The measured cold load exceeds 3 s on the target matrix |
| **S10** | **Every shipped mode is completable end to end without leaving the mode** | Journey tests in [`TEST_MATRIX.md`](../TEST_MATRIX.md) | Any mode requires a detour through another mode, or any journey row regresses from `passing` |

### Which of these can be evaluated today, and which cannot

**This table is the honest part of § 4 and it is not flattering.** Verified on this tree,
2026-08-24.

| # | Instrument exists? | Evidence |
|---|---|---|
| S1 | **No** | `grep -ril telemetry packages/*/src --include='*.ts'` returns **0 files**. There is no funnel, no event chain and no session record anywhere in the tree |
| S2 | **No** | Same measurement |
| S3 | **No** | Same measurement |
| S4 | **No** | Same measurement. `packages/server/src/` carries accounts, leaderboard, challenge and store — and no analytics of any kind |
| S5 | **Partial** | `campaign/campaign.test.ts` runs the paired sweep for stages **4, 5 and 6 only**. `data/campaign.json` ships **10** stages. No test derives the count across all ten, which is why the published figure went stale twice without failing anything |
| S6 | **Process only** | A moderated playtest needs recruits and a script, not code. Neither exists yet; M1 owns the playtest programme |
| S7 | **Process only** | As S6, plus a recruited practitioner cohort that does not exist |
| S8 | **Yes** | `packages/viz/src/honesty/` — the R1–R13 corpus, its surface list and both tiers. The only criterion here with a working instrument today |
| S9 | **No** | `.github/workflows/` carries `ci.yml`, `deploy-viz.yml`, `review.yml` and **no load budget**. `validation/perfScaling.test.ts` and `perfSweep.test.ts` measure simulation throughput, not page load |
| S10 | **No** | All **21** journey rows in [`TEST_MATRIX.md`](../TEST_MATRIX.md) read `planned`. Verified: `grep -cE '^\| T[0-9]+ \|' TEST_MATRIX.md` → 21; the single `passing` occurrence in the file is the header's status legend |

**Eight of ten criteria cannot currently be evaluated at all, and a ninth only in part.** That is
the finding, not a caveat on it. Building the instruments is M1's work (telemetry schema and KPI
set, privacy posture before any telemetry ships, playtest programme, performance budget), and **no
criterion may be reported as met before its instrument exists** — a criterion satisfied by
assertion is exactly the failure [§ D163](../DECISIONS.md) refused to write.

### The rule that governs these criteria

**A criterion that work fails to meet is raised, not weakened.** This is
[`CLAUDE.md`](../CLAUDE.md)'s working agreement applied to the game layer without amendment, and it
is why Phase 6c was refused three times rather than re-scored ([§ D145](../DECISIONS.md),
[§ D156](../DECISIONS.md)). Lowering a threshold, widening a window, or re-defining an instrument
to produce a pass is a charter violation and any reviewer may refuse it as one.

**S8 and S10 are also engineering criteria, and the engineering reading wins.** Where a player
criterion and an invariant appear to conflict, § 6 settles it.

### What [§ D163](../DECISIONS.md)'s second exclusion still says

§ D163 excluded **two** things from Phase 9's criterion: playability, *and* feature completeness
(`DECISIONS.md:10061-10064`). **This charter replaces the first exclusion and preserves the
second.** Playability is now measured — badly, by instruments that do not yet exist, but measured
rather than declared unfalsifiable. Feature completeness stays excluded from every quality gate for
§ D163's own reason: *a gate that requires every designed feature measures ambition rather than
quality*. **Anything unbuilt at a gate is named in the verdict** instead, the way Phase 6's status
names 6c.

---

## 5. Non-goals

**These are refusals and they are as load-bearing as the pillars.** A reviewer may refuse a pull
request against a non-goal exactly as against a pillar, and none of them may be relaxed by a lane.

1. **No scalar score, grade or rating over a run.** No stars, no letters, no points, no "efficiency
   rating". [`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 5.5 is the list
   of record and is cited rather than restated;
   [`21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) § 6 non-goal 3 says
   the same thing for the other product. **Energy in particular is an axis, never a score**
   ([§ D106](../DECISIONS.md)): the weakest shipped dispatcher sits on the Pareto front at six of
   eight cells because it drives less by carrying fewer people, and an eco score ranks it first.
2. **No number that the run did not produce.** P1 as a prohibition. This includes a figure computed
   by the design prototype's own formulas, and a figure displayed without the count it was computed
   from (R13).
3. **No softened refusal, in either register.** Including a refusal reworded as encouragement, a
   suppressed mean shown "provisionally", and a refusal that is silently dropped because it looked
   discouraging in a playtest.
4. **No mechanism sentence that has not been measured.** Copy may not state *why* a configuration
   performs better unless the mechanism is measured ([§ D280](../DECISIONS.md)) — and where a
   mechanism has been withdrawn, **no replacement plausible sentence goes in its place**, because a
   second plausible sentence is the same defect with new wording.
5. **No control that writes nothing, and no silence about it.** Both polarities
   ([§ D219](../DECISIONS.md), [§ D227](../DECISIONS.md)): a dead control may not look live, and a
   live control may not claim to be dead.
6. **No difficulty setting that moves the bar a run is judged against.** Difficulty may vary what
   the building faces — declared traffic parameters and building fabric — and **what a miss costs
   you**: the purse, the miss allowance, what a contract ends on. It may **not** vary the threshold
   a result is compared to. Two players on different difficulties who post the same run read the
   same figures and receive the same verdict; only the consequences differ.
   **The test is mechanical**: take a run and a difficulty, and ask whether changing the difficulty
   changes any figure or verdict the run produces. If it does, it is forbidden.
   Amended by [§ D345](../DECISIONS.md) from *"nothing other than declared traffic parameters and
   building fabric"*, which the shipped campaign had never satisfied — `campaign/economy.ts`'s
   tiers vary the purse and the miss allowance, which this clause now permits, **and the goal bars,
   which it does not**. It is never a fudge factor on a metric.
7. **No second engine and no second statistics.** The game layer consumes `packages/core/`; it does
   not approximate it for speed, for pacing, or for a smoother curve.
8. **No section number, source filename or code identifier on a player surface.** This is a
   mechanical check and it is part of the M2 gate. It currently **fails** — `EVERYDAY_SHELL_ABSENCES`
   is rendered to the player carrying section numbers, a filename and two code identifiers.
9. **No development register on a player surface.** The registers are not deleted — **not a single
   claim is dropped** — they move to where a developer reads them.
10. **No entry-screen override that survives a reload.** A remembered world is the override the
    design guide forbids, whatever storage it wears ([§ D335](../DECISIONS.md),
    [§ D338](../DECISIONS.md)).

**Where a non-goal here overlaps § 5.5 or § 6 of the two contracts, those documents are the text of
record and this list is the index.** Two lists that restate each other drift apart; one list that
cites the other cannot.

---

## 6. What this charter does not touch

**This charter governs the game layer. Where it and [`CLAUDE.md`](../CLAUDE.md) disagree,
[`CLAUDE.md`](../CLAUDE.md) wins.** That is not a courtesy. Everything expensive in this repository
is on the other side of that line, and a charter that could overrule it would be a mechanism for
trading rigour for pacing one pull request at a time.

Specifically untouched, and binding on every lane this charter opens:

| | What it is | Where it lives |
|---|---|---|
| **The engine** | `packages/core/` — release-candidate quality. Reopened only where the game needs a capability it cannot reach, and that is an escalation, not a lane | [`01-architecture.md`](01-architecture.md) |
| **The eight invariants** | Pure `estimateCost`, no global RNG, no wall-clock in `core/`, deterministic tie-breaks, seeds on every record, `core/` independent of `viz/`, tunables are data, every tunable declares its schema | [`CLAUDE.md`](../CLAUDE.md) § *Non-negotiable invariants* |
| **The statistical discipline** | Paired-t intervals that exclude zero, common random numbers, 50–200 replications, no conclusion from overlapping intervals, saturation and the **five** grounds on which a mean is suppressed | [`CLAUDE.md`](../CLAUDE.md) § *Statistical discipline*, [`03-traffic-and-statistics.md`](03-traffic-and-statistics.md) |
| **The correctness oracle** | Simulated interval and handling capacity against the closed-form Barney/CIBSE round-trip time. If they diverge, the simulation is wrong until proven otherwise | [`CLAUDE.md`](../CLAUDE.md) § *Correctness oracle* |
| **The honesty corpus** | The R1–R13 properties, both tiers, and the rule that a surface rendering strings and absent from `honesty/surfaces.ts` is not finished | `packages/viz/src/honesty/` |
| **The published pins** | **997** pinned estimates, re-derived by tests and never retyped. **A moved pin is a finding to report, not a number to edit** | `packages/experiments/src/benchmark/published.ts` |
| **The dead-seam guards** | `core/src/sim/seam.test.ts` and all **seven** `deadCode.test.ts` audits. Never deleted, weakened or skipped to make a task pass | [`05-roadmap.md`](05-roadmap.md) § *Standing requirement* |

**No player criterion in § 4 may be met by moving any of the above.** If S9's load budget can only
be met by cutting a figure, S9 is not met — and the change is refused under P2.

---

## 7. What this charter does not yet discharge

Recorded here because a charter that hides its own open items is the defect it exists to prevent.

- **A decision number is owed** for this adoption, and is allocated at integration.
- [`00-project-brief.md`](00-project-brief.md) must link here and state that this document governs
  the game layer (#186). Not done by this document — it does not own that file.
- The vision and promise must be quoted verbatim in [`README.md`](../README.md)'s opening section
  (#187). Not done by this document — it does not own that file.
- The README *Documentation* table needs a row for this file, or
  `validation/documentation.test.ts` fails. Owned by the integrator.
- The audiences' full definitions, the five-role reconciliation, and P5's wording rule are owed by
  `23-audiences-and-core-loop.md` (#188, #191).
- **The positioning question (#190) is not reopened by this charter.** It was answered on
  2026-08-08 by [§ D299](../DECISIONS.md) — two products over one engine, Engineer's rigour
  protected absolutely and its playability explicitly *not* frozen — and this charter is written
  downstream of that answer, not across it.

---

## 8. What was corrected before adoption

**This repository treats a stale true statement as a defect**, and this is the document proposing to
govern it. Three figures in the source text were checked against this tree; **two did not
reproduce and the third turned out not to be wrong at all.** All three are stated here with the
command that produces them, before adoption rather than after.

| figure | source text | this tree | command |
|---|---|---|---|
| Pinned estimates | 981 | **997** | `grep -cE '\{ *n: .*mean: .*standardError: .*lower: .*upper: .*\}' packages/experiments/src/benchmark/published.ts` |
| `deadCode.test.ts` audits | five | **seven** | `find . -path ./node_modules -prune -o -name deadCode.test.ts -print` |
| `packages/viz/index.html` | 198 KB | **198 182 bytes** — a units disagreement, not a stale figure | `stat -c %s packages/viz/index.html` |

**On the pin count.** `benchmark/published.ts` is the **only** pin table in the tree —
`packages/viz/src/scenario/published.ts` shares the name and holds no estimates. The table is a
single frozen `Record` at `packages/experiments/src/benchmark/published.ts:1006`; the raw
`standardError` grep returns 1 001, of which one is the interface field at `:149`, one is the
mapping at `:257`, one is a prose mention at `:21` and one is a field-name array at `:653`. **997 is
the count of pin-shaped entries.**

**On the audits.** Derived from disk rather than listed: `core/src/dispatch`, `viz/src`,
`server/src`, and `experiments/src/` `runner`, `teaching`, `tuning`, `fuzz`.
[`CLAUDE.md`](../CLAUDE.md) counts four rising to five, and is **not** in conflict — it is counting
Phase 9's clause-4 coverage, which is a different question from how many audits exist. **The rule
binds the set, not the number**, so the set is derived from disk wherever it is cited.

**On the page size — and this one is not a correction, which matters more than the number.**
`packages/viz/index.html` is 198 182 bytes: **193.5 KiB** at 1024, **198.2 kB** at 1000. The
kickoff's *198 KB* and this programme's own earlier *194 KB* are **the same measurement in two unit
conventions, and neither is wrong.** Publishing it as a corrected figure would have manufactured a
defect rather than recorded one; [`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) § 6 has since
retracted it on the same ground and keeps the retraction, because the mistake is more instructive
than the number. **The charter states bytes**, because bytes are the only form of this figure that
cannot go stale by being read in the other convention — and because the reason to carry the figure
at all is that somebody will eventually budget from it.

**A fourth figure is stale and is not this document's to fix.** Criterion **S5**'s legacy published
form — *four of seven campaign stages clear from the dispatcher dropdown alone* — is stale in both
halves. The denominator is seven against **ten** shipped stages in `data/campaign.json`; the
numerator's named clearers have flipped in the tree since. § 4 therefore states S5 as a **derived
sweep** rather than a figure. The full trace is in
[`ISSUE_VERIFICATION_FINDINGS.md`](../ISSUE_VERIFICATION_FINDINGS.md) § W.

**On this document's own provenance.** The charter text delivered with the programme kickoff is not
in this tree. § 1's vision and promise, § 3's audience sketches and § 4's ten criteria are
reconstructed from the bodies of issues #186, #187, #188 and #192, which restate them. § 2's pillars
are reconstructed from [`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) §§ 1 and 8 and from the
standing rules this repository already enforces — **only P3's wording is directly attested**
(`MULTI_AGENT_PLAN.md:75`). P1, P2, P4 and P5 are this document's construction and are open to
amendment at the direction review; **amending them is a human decision** and P3's ordinal is fixed
by prior citation. This paragraph is the thing to read first if a pillar looks wrong.
