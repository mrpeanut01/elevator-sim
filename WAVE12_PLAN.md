# Wave 12 — the known open items, and a playability baseline

> **Scope.** Close every open item the registers name that has a stated fix direction: the seven 🔲
> UX rows ([`TEST_MATRIX.md`](TEST_MATRIX.md) § 3), Phase 9's clause-4 mechanism (the fifth
> dead-code audit, under `packages/viz`), the honesty harness's three named seeding gaps, the
> `$comment`-on-a-driven-surface route [`GAPS.md`](GAPS.md) § 3 bounds by nothing, and the
> documentation drift the wave-12 census found. Then take the viewer to a **playability testing
> baseline**: the UX ledger's § 26 drive list executed in a real browser, defects filed and fixed.
> **Phase 6c's re-measurement ([`docs/13`](docs/13-phase-6c-handover.md)) is in scope as its own
> serial phase** — after integration, on an otherwise idle machine, never concurrent with lanes.
>
> Board: this file · open-item census: § 2 below · gap register at open: [`GAPS.md`](GAPS.md) ·
> UX ledger: [`packages/viz/UX.md`](packages/viz/UX.md).

## 1 — What this wave is

Wave 11 closed with five findings and a deliberately-open list. This wave is that list, verified
against the code before any lane was cut: every item below was re-confirmed at file:line by a
read-only pass at wave open, not inherited from prose — because the register has now been wrong
about itself in both directions (wave 6: six optimistic errors; wave 12 census: six *pessimistic*
stale entries in [`docs/07`](docs/07-handoff.md) § 8's short list, each closed by the tables above
it in the same section).

The wave's second half is the reason the first half matters: **0 of the UX ledger's 219 rows have
ever been driven in a browser** (`TEST_MATRIX.md` § 3: "the pass that wrote the ledger held no
browser"). A playability baseline is not "the suite is green" — it is the § 26 drive list executed,
row by row, with every defect found either fixed or filed with an ID.

## 2 — The census, at wave open

Verified 2026-07-30 against `ba9d851`:

| Item | State at wave open | Lane |
|---|---|---|
| **T93 / SG-15** — `#bank-filter` inert | Confirmed: only writer `dev/main.ts:1060-1063`, only reader re-selects itself; `drawStage()` never consults it. § D180 recorded it load-bearing citing RS-05, which is false of this viewer | **V** |
| **SH-12 / KX-11** — `Escape` does not dismiss the drawer | Confirmed: `wireKeyboard` (`dev/main.ts:1255-1284`) has no `Escape` case; only dismissal is the toggle's `click` | **V** |
| **SH-09** — nothing writes the URL back | Confirmed: `applyDeepLink` reads 7 params; zero `pushState`/`replaceState` in the package; `applyDeepLink` itself untested | **V** |
| **KX-10, RX-03** — remaining 🔲 keyboard/responsive rows | Per `UX.md` § 26 | **V** (KX-10) / **drive phase** (RX-03) |
| **TP-13 / RV-T7** — `copy run` emits a line reproducing a different run (no `--traffic`) | Carried since the retired board | **V** |
| **ME-07** — machines editor has no run-change test | Confirmed: `authoring.test.ts:410`'s four cases are all spec-object claims; no `recordRun`. Three sibling editors have "is not decoration" suites to copy | **T** |
| **CO-02** — ribbon arrival-pattern select asserted only for the negative | Adjacent, same file, same shape | **T** |
| **Clause 4 mechanism** — no dead-code audit reaches `packages/viz` | Confirmed: 4 audits cover 7 of 49 `packages/*/src` dirs, none of viz's 18; evidence is a hand table in `viz/src/index.ts` re-derived by nothing | **A** |
| **G3-h** — honesty `mode` axis single-valued | `HONESTY_MODES = ['advanced']`, `honesty/types.ts:199`; adding `'basic'` is one line and the corpus assertion tightens automatically | **H** |
| **G3-k** — express toggle's two strings unseeded | `expressLabel`/`expressTitle` outside `honesty/surfaces.ts` | **H** |
| **G3-q** — access block statically swept | Needs a `covers` entry in `honesty/surfaces.ts` | **H** |
| **G3-o** — `patternOptionsOf.help` reads a traffic profile's `$comment` onto a driven surface | The identical route § D186 closed one surface over; bounded by nothing | **P** |
| **Docs drift** (census findings) | `docs/07` § 8: six stale-pessimistic short-list entries, one double count, closing paragraph citing superseded § D145; `docs/10` states schema 4 where 8 ships (G3-d); `docs/13`'s "add the README row first" already done; `runner/types.ts:373` docstring names two templates where three ship; `render/mood.ts` docstring omits `awtInvalidGround` (G3-c); `TEST_MATRIX.md` 55 vs 59; `AGENT_STATUS.md` close line "Phase 9 still carries no status row" — stale, the row landed in `b876724` | **D** |
| **Phase 6c re-measurement** | `docs/13` protocol, § D162 gate, not run; third refusal permitted | **M** (serial phase) |
| **U6 / U7 rider models / Basic's curated subset** | Unbuilt, named in Phase 9's verdict; U6+U7 collapse into one generated-form unit per `docs/10` § 9.2 | **deferred to wave 13 decision** — see § 7 |

## 3 — The rules this wave carries forward

1. **Move the control and require the run to change** — every control touched or added gets the
   legs-fingerprint test (§ D177). T93's fix is not done when the filter filters; it is done when a
   test moves the filter and requires the picture to change, and RS-05's no-silent-truncation
   clause is satisfied with a visible count.
2. **One worktree per concurrent lane** (R25, § D182). File ownership partitions editing; only a
   worktree partitions committing. Every `git add` names explicit paths; `git add -A` is forbidden.
3. **Name the non-test caller** — and lane A now mechanises it for the one package where it was
   prose.
4. **Parallelise the work, serialise the measurement.** Lanes run *targeted* tests only. The full
   suite runs serially at integration, by the orchestrator, on an otherwise idle machine. Lane M
   (6c) runs with no other lane active.
5. **A negative finding needs a loud instrument** (R24). No lane may record "nothing does X" from a
   silent grep; confirm by driving, by types, or by a reader that fails on unreadable input.

## 4 — Lanes

| Lane | Task IDs | Owns (exclusive) | Deliverable |
|---|---|---|---|
| **V — viewer interactions** | T94 (Escape/KX-10), T95 (URL write-back), T93 (bank filter), T96 (TP-13) | `packages/viz/index.html`, `src/dev/main.ts`, `src/dev/elementMap.ts`, `src/dev/surfaces.ts`, `src/dev/state.ts`, `src/render/canvas.ts`, their tests | Serial commits inside one worktree, one item per commit; each control change carries its run-change or round-trip test |
| **T — editor test debt** | T97 (ME-07), T98 (CO-02) | `packages/viz/src/authoring/authoring.test.ts` | `describe('the machines editor is not decoration')` beside the three sibling suites, on the legs fingerprint; the arrival-pattern positive assertion |
| **H — honesty seeding** | T99 | `packages/viz/src/honesty/types.ts`, `src/honesty/surfaces.ts`, their tests | `'basic'` in `HONESTY_MODES`; express-toggle and access-block strings seeded; always-on tier re-run and any violations reported, not suppressed |
| **A — the fifth audit** | T100 | new `packages/viz/src/deadCode.test.ts` (+ inlined scanner, as `core` did) | Every viz `src` directory in `AUDITED_MODULES`; every zero classified dead / deliberate-public-API / allowlisted-with-reason, asserted in both directions |
| **P — a real field for player copy** | T101 | `data/traffic-profiles.json`, its schema/loader, `patternOptionsOf` site, tests | The `$comment` route closed the way § D186 closed it for dispatchers: an authored field, validated, with the `$comment` path refused |
| **D — register corrections** | T102 | `docs/07-handoff.md`, `docs/10-experience-layer-contract.md`, `docs/13-phase-6c-handover.md`, `packages/experiments/src/runner/types.ts` (docstring), `packages/viz/src/render/mood.ts` (docstring) | Each correction in place per the retire-in-place convention; present-tense vs past-tense distinguished (G3-d is *not* a find-and-replace) |
| **M — Phase 6c measurement** | T103 | `packages/experiments/src/benchmark/` (new study only), `docs/05`, `GAPS.md` § 1 verdict updates | `docs/13` executed exactly: census first, § D162's five conditions, G1–G12, registration's six obligations; **runs alone, after integration** |

Orchestrator-owned, lanes report changes rather than edit: `WAVE12_PLAN.md`, `AGENT_STATUS.md`,
`DECISIONS.md`, `GAPS.md` (except lane M's § 1 verdict), `RISKS.md`, `TEST_MATRIX.md`,
`packages/viz/UX.md` row marks.

**Merge order:** T, H, A, P in any order (disjoint) → V (largest, rebases last) → D (writes against
the landed tree) → full serial suite → **M** → drive phase.

## 5 — The drive phase (playability baseline)

After integration is green: execute `packages/viz/UX.md` § 26's ordered drive list in a real
browser (Chromium + Playwright, `npm run dev -w @elevator-sim/viz`), highest risk first — the three
leaders are the wave's own fixes (SG-15, SH-09) plus RX-03. For each row: drive it, mark it ✅ run
or file the defect with an ID. The ⚠️ unverified column (55 rows) is the backlog; the exit
criterion is not 219 ✅ run — it is: **every 🔲 row resolved, every primary flow driven end-to-end
(shift select → run → report → editors → campaign), and every defect found either fixed in-wave or
filed with an ID and an owner.** RX-03 (no stacked layout below 768 px) is expected to graduate
from finding to fix during this phase.

## 6 — Definition of done for this wave

1. All seven 🔲 rows in `TEST_MATRIX.md` § 3 are closed by a fix with a test, or reclassified with
   a recorded argument. No row is marked from reading the code.
2. `packages/viz` has a dead-code audit whose `AUDITED_MODULES` names every `src` directory, and
   Phase 9's clause 4 is re-stated as mechanised — without rounding anything else up.
3. The honesty corpus's `mode` axis has two values and the two named string groups are seeded; the
   resulting corpus figures replace the old ones wherever they are quoted, with any new violations
   reported first.
4. Phase 6c's § D162 protocol has been executed to a recorded verdict — acceptance in the one
   permitted sentence, or a third refusal recorded with the same care as the first two. Either
   outcome updates `docs/05`, `GAPS.md` § 1, `docs/07`, `README.md`, `CLAUDE.md` together.
5. The drive phase's exit criterion (§ 5) holds, and `TEST_MATRIX.md` § 3's "✅ run" count is no
   longer zero.
6. `npx tsc -b` clean and `npx vitest run` green, measured serially on an idle machine, red runs
   reported.
7. No phase verdict rounded up, no criterion weakened. New decisions continue the numbering
   after [§ D186](DECISIONS.md).

## 7 — Deliberately deferred

**U6, U7's rider models, Basic's curated three-dimension subset.** Named unbuilt in Phase 9's
verdict; building them is feature work with its own UX cycle, not an open defect. The wave-13
decision — build them or record why the curated substitutes stand — is taken after the drive
phase, with driven evidence about whether their absence blocks playability, rather than before it.
