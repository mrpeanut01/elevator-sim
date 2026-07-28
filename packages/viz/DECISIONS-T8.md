# Decisions — T8, `packages/viz` remediation

Staged here rather than in the repository's `DECISIONS.md` because another builder is appending
to that file in the same wave. **The orchestrator should fold these entries in and delete this
file.** Nothing outside `packages/viz/` was touched.

---

## D-T8-1 — The recording schema is not frozen; § 7 said more than it meant

**Decision.** `UX.md` § 7 is restated. The four structural decisions it lists stay frozen. The
**field set of `VizRecording` is explicitly not frozen**, and growing it is a deliberate
`VIZ_SCHEMA_VERSION` bump rather than a contract violation.

**Why.** Read as a shape freeze, § 7 made two of this project's own commitments unreachable:

1. `foldPassengers` discards `PassengerRecord.carId` and `bankId`. UX.md `RV-T3` — hovering a
   landing highlights the car assigned to it, and the assignment shown matches the record —
   cannot be built from a recording under any amount of cleverness, because the data is gone.
2. The roadmap's **live metrics overlay** can show exactly the three cumulative counters in
   `VizProgress`. Every windowed figure the project actually reports — rolling AWT, peak-5-minute
   AWT, a per-bank split — needs per-leg data the fold drops.

A freeze that forbids the fix to its own gaps is not a contract, it is a trap. Wave 2 would have
had to break it in its first week and would have been right to.

**What was widened now, and what was not.**

| Change | Done? | Reason |
|---|---|---|
| `buildLayout` narrowed from `readonly VizShaft[]` to `readonly ShaftGeometry[]` (carId, bankId, label, servedFloorIds) | **yes** | Costs nothing — `VizShaft` satisfies it structurally, so no caller changed — and it removes a hard blocker: `ED-01`/`ED-02` promise a live editor preview with **no run**, and the old signature demanded motions, door marks, occupancy series and a capacity, all of which only a finished run has. |
| `VizProgress.served` / `Frame.served` renamed `boardedLegs`; `VIZ_SCHEMA_VERSION` 1 → 2 | **yes** | The counter counts **leg boardings** and the header drew it as people. On a sky-lobby building that overstates the population served by exactly the transfer rate. Both counters in the frame are now in the same unit as `waiting`, which was always legs. |
| Adding the per-leg array `RV-T3` and a windowed overlay need | **no** | Nothing in wave 1 would read it. A configurable, unit-tested field with no consumer is the exact defect class this repository has shipped five times; shipping one here to be helpful would make it six. Wave 2 adds it **with its first consumer** and bumps to 3. |

**Consequence for the version number.** `VIZ_SCHEMA_VERSION` is stamped on every recording and
currently read by nothing — see D-T8-2. It is carried because a wave-2 file-load path will check
it, and bumping it now is how a deliberate shape change is recorded rather than discovered.

---

## D-T8-2 — Two dead exports deleted, not wired

**`isSupportedRecording`** (was `frame/frameAt.ts`): deleted. It compared a recording's
`schemaVersion` with the constant compiled into the same bundle. In the shipped path the only
producer of a recording is `recordRun` from that same bundle, so the comparison could not fail —
a guard that guards nothing. Wiring it into `dev/main.ts` would have made the tautology look
like a check. The version check belongs with the wave-2 load path (`PB-07`/`PB-15`), where a
recording arrives from a file and the versions can genuinely differ.

**`displayMsAt`** (was `playback/mapping.ts`): deleted, with its test. `Playback` uses
`simTimeAt` and `reanchor`; the inverse had no caller but its own test. Wave 2's click-to-seek
on a timeline is where an inverse acquires one.

**`loadResources`** (was `fixtures.test-helper.ts`): deleted. Zero callers, tests included. A
test helper whose only defensible caller is a test, with no test calling it, is dead.

---

## D-T8-3 — `frameTimes` refuses to truncate rather than truncating in silence

`maxFrames` used to clip: the grid stopped at `maxFrames - 1` points and jumped to `endedAt`, so
a caller asking for a long run at a slow speed silently received the head of the replay plus one
final instant. A comparison over such a sequence is not evidence about the span it never
sampled — a truncated replay could report "identical" about a tail it never looked at, in the
one harness whose entire job is to detect divergence.

It now throws a `RangeError` naming the requested count, the ceiling and the three ways out;
`truncate: true` is the explicit opt-in for a caller who has decided it does not need the tail.
Memory is still bounded. The cap is no longer silent.

---

## D-T8-4 — `KB-15` re-marked rather than papered over

The row claimed "colour is never the only signal — door state, direction and overload each carry
a glyph as well as a colour ✅ w1". Direction does (▲/▼). Door state is a fill-width gap and
overload is `theme.carHeavy` — colour, and only colour. Worse, that colour changes at load factor
0.8, which is the 80 % fill rule, not the 1.1 overload alarm `RV-14` describes.

The row is split into `KB-15` (direction, ✅ w1) and `KB-15a`/`KB-15b` (door state, overload,
🔲 w2). Adding the two glyphs is renderer work with its own tests and belongs with `RV-14`;
claiming them was the defect, not lacking them.

---

## Handed back — things T8 could not change

- **`docs/05-roadmap.md` § Phase 4.** Its acceptance criterion is "a stored run replays
  identically". That criterion was satisfied, in full, by a recorder that drew every car at its
  final position on three of four buildings — because a wrong picture replays exactly as
  faithfully as a right one. The criterion needs a second clause: *and the first frame places
  every car where the run says it started.* T8 does not own `docs/`.
- **`DECISIONS.md`.** These four entries.
- **A finding for whoever owns the runner seam.** `recordRun` inherits `onTimeout: 'throw'`, so
  a shipped building that ends a run with people still in the system produces **no recording at
  all** — `Simulation` throws and there is nothing to draw. At the shipped traffic rates that is
  Mixed-Use High-Rise, Secure Tower and Vertical City at 900 s on ordinary seeds. Statistically
  the throw is right; a *viewer* still has to be able to draw that run, and `UX.md` `RV-16` says
  so. The viz breadth suites pass `onTimeout: 'report'` and record the `timed-out` status. Wave 2
  should decide whether the dev viewer does the same rather than showing an error for a run the
  user can see is interesting.
