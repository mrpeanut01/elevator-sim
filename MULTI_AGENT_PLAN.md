# MULTI_AGENT_PLAN — Everyday Mode complete + Engineer reimagined

**Owner directive (2026-08-12):** both worlds co-exist. *Casual (Everyday Mode) is the way everyone
starts, implemented ENTIRELY from the Claude Design handoff. Engineer is re-imagined in the Casual
style with MUCH more information, controls and detail, and different (more engineering-related)
challenges.*

## Governing sources, in precedence order

1. `docs/design/design_handoff_casual_mode/` — README (precedence rules), GAMEPLAY_AND_NAVIGATION
   (behaviour), ENGINE_CONTRACT (numbers/seeds/formulas), BUILD_PLAN (slices), ISSUE_ADJUDICATION.
2. `docs/design/elevator-sim-casual.dc.html` — layout and copy reference (vendored this wave,
   byte-faithful, 512 302 bytes; the previous vendoring predated the design's third pass).
3. `DECISIONS.md` § D299 (two products, one engine; *a change to Engineer may make it easier to
   use; it may not make it say less*), § D301 (the draw is depth made legible, not removed),
   § D335 (the shell exists; § 4's sixteen screens do not — that is the unbuilt half).
4. `CLAUDE.md` invariants — statistical discipline, honesty rules, *name the non-test caller*,
   *move the control and require the run to change, compared on the legs*.

## Architecture snapshot

- `packages/viz/src/everyday/` — shell, rail, four-tile menu, screen-key registry (16 keys in
  `types.ts`), absences register. Three of four tiles refuse today; the stage hands off to the
  Engineer surface (§ D335).
- Everyday *machinery* largely landed inside the Engineer shell in earlier waves: plain levers
  (`mode/plainLevers.ts`), records/interventions (`record/`), watch (`watch/`), fixit engine
  (`fixit/`), bench (`batch/`), campaign judging (`campaign/`), menus/boards (`menu/`).
- Engine seams: `packages/core/src/dispatch/parameters.ts` (`DISPATCH_PARAMETERS`), `traffic/`,
  `sim/`, `analytical/`. `core/` never depends on `viz/`; anything tunable is data.
- Gap analysis (AGENT_STATUS: lane GAP) refines the slice-by-slice ledger below as it reports.

## Workstreams and task tree

### WS-A — Casual complete (the sixteen screens over the existing machinery)

| Lane | Scope | Depends on |
|---|---|---|
| A0 `feat/everyday-screens-frame` | Screen router in `everyday/`, § 3.3 action-bar contract, § 19 token module (shared with WS-B), stage run-context (`daily/campaign/rush/watch`) | — |
| A1 `feat/one-weight-vector` | Slice 1 + 2: levers as views onto the 13 terms; player-facing names beside parameters in `core` | — |
| A2 `feat/run-record-everyday` | Slice 3 gaps: intervention record on the Everyday stage, paused entry, speed reset | A0 |
| A3 `feat/wire-the-controls` | Slice 4: rules compile, flags/park, detector, ghost picker incl. `none` | A1, A2 |
| A4 `feat/campaign-screens` | Slices 5 + screens: towers, building desk, contract & works, daily tests from the run, "was" figures | A0 |
| A5 `feat/fixit-and-designer` | Slice 6 + screens: paired runs, editor, cases; designer analytic calc from `core/analytical` | A0 |
| A6 `feat/one-bench` | Slice 7 + screen: suite bench, pairwise interval iff field of two | A0, A1 |
| A7 `feat/watch-and-boards` | Slices 8 + 9 + screens: week, board/ladder, spectator branches, gauntlet route | A0 |
| A8 `feat/honesty-state-model` | Slice 10: sweep enumerates § 18 state model; fixtures marked or sourced; API-absent states | all of A0–A7 |

### WS-B — Engineer reimagined (Casual style, more depth, engineering challenges)

| Lane | Scope | Depends on |
|---|---|---|
| B0 `feat/engineer-reimagined-contract` | Design contract (architect lane): § 19 tokens applied to the Engineer surface; information/controls inventory (MORE than today, never less); the engineering-challenge set; § D299's test as the acceptance rule | A0 (token module) |
| B1..Bn | Implementation lanes cut from B0's contract (restyle, § D299 backlog: #119 drawn intervals, #92 run-this + delta, #117/#102 what-moved, #115 § 6, #104 why-locked; challenges) | B0 |

### WS-I — Integration

Merge order: A0 → A1 → A2 → A3 → {A4, A5, A6, A7 in any order} → B lanes → A8 last (it enumerates
what the others built). Each merge: unit tests green in the lane, review pass, then integration
branch `integration/everyday-and-engineer`, then `npm test` + typecheck at the root. The honesty
sweep (both tiers) and corpus figures are measured **once, after integration** — never per lane
(the repo has recorded this lesson four times).

## Definition of done (from the handoff README + owner directive)

- Every control on every screen reaches the simulation or says it does not. No control silently
  does nothing.
- Every comparable figure comes from a seeded, replayable run.
- No engine identifier on any Everyday surface, in any state.
- Honesty sweep enumerates from the state model; withheld figures render `—`/labelled states.
- Every screen renders with the API unreachable.
- The page opens on Everyday; all four mode tiles open real screens.
- Engineer: restyled in the Casual language, strictly more information and controls than before,
  engineering challenges present, and **nothing it used to say is now unsaid** (§ D299 test).
- Suite green at root; roadmap/docs updated; DECISIONS.md entries for the decisions taken.

## Working rules for every lane

- One branch, one worktree (`.worktrees/<lane>`), one owner agent, colocated `*.test.ts` for every
  meaningful change, structured completion report (files, decisions, tests, limitations, merge-ready).
- The prototype's copy is the copy; vocabulary from guide § 2 in code and copy.
- Derive, never assert; `—` for anything unfinished; unaffordable is visible, dimmed, inert.
- High-risk lanes (A2, A3, A8, B1) get independent reviewer + tester passes before merge.
