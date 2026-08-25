# MULTI_AGENT_PLAN — the charter programme

> ## ⚠️ SUPERSEDED CONTENT — this path has carried three different plans
>
> This file is the coordination artifact for the **charter programme** (GitHub milestones M0–M6,
> issues #186–#252), opened 2026-08-24. Two earlier bodies lived at this path and are retired, not
> deleted — because five documents still cite `MULTI_AGENT_PLAN.md` by path for material that is now
> in one of them:
>
> | body | where it is now | who cites it |
> |---|---|---|
> | waves 1–4 (375 lines, § 1–§ 8, the planning-first rule, the five recorded process mistakes) | `MULTI_AGENT_PLAN-waves-1-4.md`, restored **byte-identical** to `1b7a2f1^` | `packages/viz/UX.md` § planning-first · `WAVE5_PLAN.md` § 2 (as "§ 3") · `WAVE6_PLAN.md` · `docs/01`, `docs/05`, `docs/08`, `core/src/analytical/` per `WAVE5_PLAN.md` |
> | the Everyday-and-Engineer wave board (82 lines) | `docs/archive/MULTI_AGENT_PLAN-everyday-and-engineer.md` | `AGENT_STATUS.md` records what it left behind |
>
> **The waves 1–4 record was lost, and finding that is why it is restored here.** Commit `1b7a2f1`
> (2026-08-12) replaced 373 of its lines with 80. [§ D105](DECISIONS.md) says retired boards *"stay
> retired in place"*; `WAVE5_PLAN.md` calls that body's five process mistakes *"the most transferable
> thing that delivery produced"*; and the body itself carried a note saying it was kept *"because it
> is the record of how the work was done — including the mistakes"*. All of that went in one commit,
> leaving `packages/viz/UX.md`'s citation of `§ planning-first` pointing at a section that no longer
> existed on this path.
>
> **This is issue #193's defect in a second file.** #193 reports the same commit's overwrite of
> `RISKS.md` and the loss of rows R24–R26. It is a class, not an instance, and the class has at least
> two members. Restoring this one is verbatim and mechanical; the register is #193's to rebuild.
> Nothing here rewrites a retired board — § D105's rule holds.

---

## 0. What this programme is, and what it is not

The engine is finished and is held to a higher evidentiary standard than most production software.
The game layer on top of it is at prototype quality. **This programme is the game layer.** The
engine is not reopened by any milestone except where the game needs a capability it cannot reach,
and that exception is an escalation, not a lane.

Two halves, both load-bearing, and they are the tie-breakers for every disagreement:

- **The design handoff wins every disagreement about what the screen looks like.**
- **The simulator wins every disagreement about what a number means.**

### Governing sources, in precedence order

1. [`docs/22-charter.md`](docs/22-charter.md) — vision, player promise, five pillars, two audiences,
   ten success criteria S1–S10, the non-goals. **Written in M0 and pending its decision number**,
   which is allocated at integration; until that entry exists the charter is drafted rather than
   adopted, and it says so on its own face. It is honest about its provenance: the kickoff's charter
   text is not in this tree, so **only pillar 3's wording is directly attested** and the other four
   are reconstruction open to amendment at the direction review.
2. [`CLAUDE.md`](CLAUDE.md) — the eight non-negotiable invariants, the statistical discipline, the
   tuning discipline, the working agreements. Binding on every agent, unchanged by anything below.
3. [`docs/05-roadmap.md`](docs/05-roadmap.md) § *Standing requirement* — the dead-seam guards.
4. [`docs/10-experience-layer-contract.md`](docs/10-experience-layer-contract.md) § 5.5 *What must
   never be built*, and [`docs/21-engineer-reimagined-contract.md`](docs/21-engineer-reimagined-contract.md)
   § 6's nine non-goals with [§ D299](DECISIONS.md)'s test: *a change to Engineer may make it easier
   to use; it may not make it say less.*
5. [`docs/design/`](docs/design/) — the vendored *Elevator Sim Reimagined* handoff, canonical for the
   interface and **not** for numbers.
6. [`DECISIONS.md`](DECISIONS.md) — **334 `## D<n>` headings carrying 332 distinct numbers**, D1–D341
   with the nine documented gaps (D44, D55, D78–D84) confirmed and no undocumented ones. Next free
   number: **D355**. Allocated at integration, never inside a sub-agent — D342 adopted the charter,
   D343–D350 ran the programme to the M2 gate, and D351–D354 are wave B's.
   Two headings share a number: `D125` is a preface plus its entry, which is deliberate, and **`D63`
   is a genuine collision** — two distinct decisions at `DECISIONS.md` lines 1888 and 1904, so a
   `§ D63` citation is ambiguous. `validation/citations.test.ts` asserts a `§ Dnnn` resolves to a
   heading; it does not assert the heading is unique, which is why nothing caught this.

---

## 1. Goals

1. Close the loop. A player who does what the game asks reaches the payoff. (#206)
2. Get the development team's registers off the surfaces a player is trying to enjoy, without
   deleting a single claim. (#207)
3. Make the first session present a problem worth solving. (#208, #209)
4. Make the stage show what the report will later say — pillar 3, and the only pillar the build
   currently fails outright. (#212)
5. Reach a measured vertical-slice verdict, on ten first-time testers, not on opinion. (#218)
6. Do all of it without moving a pin, weakening a refusal, or adding a control that writes nothing.

---

## 2. Architecture snapshot

- `packages/core/` — the engine. Release-candidate quality. **Engine liaison is the only role
  permitted to touch it**, and only against an issue naming a capability the game needs and cannot
  reach. Every such change escalates to the human first.
- `packages/viz/src/everyday/` — the Casual shell: 212 px rail, pinned action bar, four-tile menu,
  and a registry in which all seventeen of § 4's screen keys are now registered
  ([§ D335](DECISIONS.md), [§ D338](DECISIONS.md)). **Highest-collision directory in the repository.**
- `packages/viz/src/dev/` — the Engineer shell, reached through `everyday/swap.ts`'s provided port.
  `dev/main.ts` may not import the Everyday shell; closing that cycle is what produced this
  directory's last module-init `undefined`.
- `packages/viz/src/render/` — the stage canvas. Both roots are covered and neither is ever hidden;
  `visibility:hidden` keeps the box, `display:none` does not.
- `packages/viz/src/honesty/` — the R1–R13 corpus and its surface list. **A surface that renders
  strings and is not in `honesty/surfaces.ts` is not finished.**
- `packages/server/` — accounts, leaderboard, daily challenge, replay verification. Built, tested,
  and dark to the player-facing shell.
- `packages/experiments/` — benchmarks, pins, the validation guards.

---

## 3. Task tree, keyed to issue numbers

Milestones are GitHub milestones and the issue blocks map to them exactly (verified against the
milestone field on #193 → M0 and #194 → M1):

| milestone | issues | count | character |
|---|---|---|---|
| M0 Concept and direction | #186–#193 | 8 | documents and decisions only |
| M1 Pre-production | #194–#205 | 12 | specifications only |
| M2 Vertical slice | #206–#218 | 13 | first code milestone; carries the P0s |
| M3 Alpha, feature complete | #219–#230 | 12 | ends in a recorded feature freeze |
| M4 Beta, content complete | #231–#240 | 10 | ends in a recorded content freeze |
| M5 Launch | #241–#246 | 6 | ends in a rehearsed rollback |
| M6 Live operations | #247–#252 | 6 | continuous; monthly review is the gate |

Per-milestone entry and exit criteria, and current state, are in
[`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md). That file is the one a returning human reads first.

**The 34 pre-existing open issues** (#93, #123, #130, #145, #146, #147, #149, #156–#182) are not
superseded by the charter tree. Several are children of it; the mapping is produced by verification
and recorded in [`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md), not asserted here.

---

## 4. Verification gate — nothing enters a wave unverified

Issues #186–#252 were written from outside the tree by an evaluator who played the deployed build.
**They are claims.** This project has measured its own inbound-feedback error rate: in one wave five
of six lanes found the reported issue's own claim to be wrong, and three would have shipped a new
defect if acted on directly.

1. A verification task reproduces the claim against the tree, or traces it to file and line.
2. The outcome goes in [`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) in the
   existing format. **A refuted claim is recorded as prominently as a confirmed one**; a wave that
   records only its confirmations has lost the thing that makes the ledger worth keeping.
3. A confirmed claim gets a row in [`ISSUE_WORKER_LEDGER.md`](ISSUE_WORKER_LEDGER.md) and becomes
   schedulable. A refuted one is closed with the refutation written down.

Verification lanes are read-only and safe to parallelize. They never fix what they find.

---

## 5. Dependency map and merge order

```
M0 ──▶ M1 ──▶ M2 ──▶ M3 ──▶ M4 ──▶ M5 ──▶ M6
 │      │      │
 │      │      └── #206 first (the loop), then {#207, #214, #215, #216} ──▶ #208/#209 ──▶ #212
 │      └── #197 (flow maps) gates #210; #198 (slice definition) gates every M2 build issue
 └── #186 (charter) gates all of M1; #193 (risk register) is used by every later gate
```

Within M2 the ordering is forced by collision, not by preference:

1. **#206** — the loop. It is small, it is blocking, and every journey test written before it lands
   asserts a dead end.
2. **#214, #215, #216** — small, precisely stated, disjoint files where verification allows.
3. **#207** — moves the registers. Touches `everyday/` broadly; serializes against everything.
4. **#208 / #209** — content and refusal-ground work; touches `data/` and serializes against pins.
5. **#212** — the stage rebuild. Largest surface, owns `render/canvas.ts` alone.
6. **#210, #211, #213, #217** — scheduled once the above have landed and the copy is stable.
7. **#218** — the review that closes the milestone. Cannot be scheduled; it is held.

---

## 6. Serialization hazards — one owner, one branch at a time

These have collided before:

- `packages/viz/src/everyday/` — the highest-collision area in the repository.
- `packages/viz/src/persist/` — schema version and migrations.
- `packages/viz/src/render/canvas.ts`.
- `packages/viz/src/menu/`.
- `packages/viz/index.html` — one **198 182-byte** file carrying markup and inline styles for
  **both** shells. Stated in bytes on purpose: that is **193.5 KiB** at 1024 and **198.2 kB** at
  1000, so the kickoff's *198 KB* and an earlier draft of this line's *194 KB* are the same
  measurement in two unit conventions and **neither is wrong**. This line previously published the
  discrepancy as a correction, which manufactured a defect rather than recording one — the retraction
  is kept because the mistake is more instructive than the number.
- `data/*.json` — content changes serialize against each other and against the pins.
- **`packages/viz/src/honesty/surfaces.ts`** — added 2026-08-24, and it is now the tightest of these.
  Every lane that builds or renames a player surface must register it here, so the three M2 lanes
  below all write this one file. It has no interface to lock first: an adapter is the surface.

### The M2 order this forces, and the consolidation it revealed

1. **#207** — the absence registers. Writes `everyday/shell.ts`, `settingsView.ts`,
   `stageScreenModel.ts`, `designerModel.ts`, `rushScreenModel.ts`, `campaign/career.ts` and
   `honesty/surfaces.ts`. **Running now, alone in `everyday/`.**
2. **#212 + [§ D347](DECISIONS.md), as one lane.** They were scheduled as two and are one piece of
   work: both write `everyday/stageScreen.ts` and `honesty/surfaces.ts`, and **#212's own AC5 already
   asks for what § D347 requires** — *"any string this work touches enters the corpus"*. Splitting
   them would have two lanes fight over the same file to satisfy the same criterion. The stage's
   words need the pure/DOM split this directory already has; the door-fill inversion is in the same
   renderer.
3. **The rest of M2** — #208, #210, #217, then the #218 slice review.

**#212 was very nearly scheduled in parallel with #207 on the belief that its defects were in
`render/canvas.ts`.** They are not: the issue puts that file explicitly out of scope as the Engineer
arm, and both defects are in `everyday/stageScreen.ts`. That would have been two lanes in the
highest-collision directory at once — the exact hazard this section exists to name — and it was
caught by re-reading the issue rather than trusting a note about it.

Safe to parallelize: documentation and specification tasks in M0 and M1, verification tasks,
independent journey tests, content authoring in different files, read-only analysis.

**Not** safe: two tasks touching `everyday/`; anything moving a pinned estimate alongside anything
else; a refactor mixed with a feature in the same area.

When in doubt, assign a contract task first, lock the interface, then fan out.

---

## 7. Branching and worktrees

- `main` is protected. Everything stages through an integration branch.
- One branch per task, named with the issue number: `fix/206-close-the-loop`.
- One worktree per concurrent implementation track at `.worktrees/<task-id>`; one agent, one branch.
- Never remove a worktree with uncommitted changes. After a verified merge: remove, delete, prune.

---

## 8. Definition of done, per milestone

A milestone is done when its exit criteria in [`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md) are
**recorded as met**, not asserted. Across every milestone, these hold without exception:

- Every player-facing pull request names the pillar it serves, and any reviewer may refuse it
  against one.
- The reviewer's first question is **name the non-test caller**, asked of requirements as well as of
  symbols. *The plan says it already exists* is not an answer.
- **Move the control and require the run to change**, compared on the legs rather than on a window
  statistic. A control that fails this is deleted, not documented.
- Every new rendered string is in the honesty corpus, and both tiers stay green.
- The **997** pinned estimates are re-derived by tests, never retyped. A moved pin is a finding to
  report, not a number to edit.
- Byte-identity when unused: a new capability nobody has switched on leaves every pin and both
  identity digests unchanged, on **both** CI platforms.
- `packages/core/src/sim/seam.test.ts` and **all seven** `deadCode.test.ts` audits are never deleted,
  weakened or skipped to make a task pass. The programme kickoff says *five*; derived from disk
  there are seven — `core/src/dispatch`, `viz/src`, `server/src`, and `experiments/src/` `runner`,
  `teaching`, `tuning`, `fuzz`. (`CLAUDE.md` counts four rising to five, but in the narrower context
  of Phase 9's clause-4 coverage, which is a different question from how many audits exist.) The
  rule binds the set, not the number, so the set is derived from disk here rather than listed.
- **Do not weaken an acceptance criterion to make work pass. Raise it instead.**
- No player-facing surface carries a section number, a source filename or a code identifier.

---

## 9. Escalations — the orchestrator does not decide these

Adopting or amending the charter, the pillars or the success criteria · the positioning answer
(#190) · opening or exiting any milestone gate · feature freeze and content freeze · anything
touching `packages/core/` · anything moving a published pin · weakening a refusal, a non-goal or an
acceptance criterion · cutting a mode, a screen or a shipped feature · any push to `main`, any
deploy, any destructive git or filesystem operation · the Sandbox verdict (#225), the audio decision
(#196) and the ladder reset policy (#252).
