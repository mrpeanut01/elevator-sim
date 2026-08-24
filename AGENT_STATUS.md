# AGENT_STATUS

**Current programme: the charter programme** (milestones M0–M6, issues #186–#252). The plan is
[`MULTI_AGENT_PLAN.md`](MULTI_AGENT_PLAN.md); the milestone pages are
[`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md).

> **This file is appended to, not overwritten.** The record below it — the Everyday-and-Engineer
> wave — stays. Commit `1b7a2f1` cut this file from 1 047 lines to 17 in one sitting, along with
> three other project-level registers, and issue #193 exists because of what that cost. A status
> board that replaces its own history is a board nobody can audit.

## Charter programme — active lanes

**Opened 2026-08-24.** M0 is **not open**, and opening it is a human decision the orchestrator has
prepared evidence for rather than taken. The lanes below are verification only, which is the one
kind of work that runs *ahead* of a gate rather than behind it.

| Lane | Task | Issues | Branch / worktree | Status | Blockers | Next action |
|---|---|---|---|---|---|---|
| V1 | Verify the loop dead-end and the front door | #206, #207 | read-only, no branch | **reported** | — | recorded, findings § M–N |
| V2 | Verify the first session and the refused headline numbers | #208, #209 | read-only, no branch | **reported** | — | recorded, findings § S–T |
| V3 | Verify the nine remaining M2 issues | #210–#218 | read-only, no branch | **reported** | — | recorded, findings § U |
| V4 | Verify the M0 premises | #186–#193 | read-only, no branch | **reported** | — | recorded, findings § O–R |

All four lanes were read-only and none modified a file. **#206's mechanism was additionally
re-verified by the orchestrator directly** rather than accepted from a single lane, because it is
the P0 every other M2 issue is sequenced behind.

**No implementation lane is open, and none may open before M0 and M1 have exited.** M0 is documents
and decisions only; M1 is specifications only.

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
(`engine-strict` is not set, so it runs). `npm run build` clean in 8.8 s. Suite measured this
session with the browser tier pointed at the container's pre-installed Chromium, because
`playwright-core`'s pinned revision resolves to a browser this container does not carry.

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
5. **`packages/viz/index.html` is 194 KB**, not the 198 KB the kickoff states.
6. **The charter carries at least three figures that do not reproduce from this tree**, and #186
   adopts the charter — so they are worth correcting *before* adoption rather than after. The pin
   count is **997**, not 981: `benchmark/published.ts` is the only pin table in the tree and it holds
   997 `{ n, mean, standardError, lower, upper }` entries. With the two above, that is three. This is
   the repository's own *"a published number goes stale the same way"* rule applied to the document
   proposing to govern it, and the rule's remedy is the same — pin the number to the run, or to the
   command, that produces it.
7. **[`GAPS.md`](GAPS.md) is 25 days stale, not the six weeks the kickoff states** — its header
   reads *"As of: 2026-07-30, wave 12"*, and it still carries that date's suite figure of
   **262 files / 4 883 tests / 10 skipped**. Six waves have landed since. The staleness is real and
   the correction runs *towards* the document, which is worth saying only because this programme
   corrects figures in both directions or it is not correcting them at all.

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
