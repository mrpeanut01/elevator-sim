# Change scope — the contract

**Status: designed, and seven of its eight failing clauses are now closed.** The verdict is
[`DECISIONS.md`](../DECISIONS.md) § D217; the mode-by-mode analysis this contract was written for is
[`docs/17-play-experience-audit.md`](17-play-experience-audit.md). The eighth — two of the four
settings still reaching nothing — is carried in a register with a staleness assertion rather than
absorbed, so it cannot quietly become permanent.

**The criteria below are written before the implementation, and the clauses that decide this contract
are ones the shipped product did not satisfy when they were written.** That last half is
[`DECISIONS.md`](../DECISIONS.md) § D163's rule applied to itself: *a criterion whose every clause is
already met is a description, not a gate.* § 5 lists the failing clauses by name so this document
cannot later be read as having been fitted to the fix.

The verdict against these criteria is **not** recorded here. It is § D217, written after the code and
saying so, in the manner § D214/§ D215 established. A design document that quietly edits its own
findings is the drift this repository exists to guard against.

---

## 0. The one-paragraph summary

The simulator runs a whole day in milliseconds and then plays the recording back, so **there is no
such thing as a mid-day change** — every change re-runs the day from zero. The product's most-used
verb is therefore an unlimited, invisible retry, and nothing models it. This contract names four
**change scopes** (`presentation`, `within-day`, `between-days`, `between-games`), binds every
player-writable field to exactly one of them, derives that binding from the state's own keys rather
than from a list, and gives each play mode an exhaustive statement of which scopes it permits. Ten
rules, **S1–S10**, numbered to avoid collision with
[`docs/10`](10-experience-layer-contract.md)'s R1–R13, which remain in force and are never weakened
by anything here.

---

## 1. The structural fact everything else follows from

`Simulation.run()` is one synchronous call that returns when the replication is over
([`docs/01`](01-architecture.md), and `contract/types.ts`'s own docstring on why a renderer consumes
a finished `VizRecording` rather than a live simulation). CLAUDE.md invariant 3 keeps the wall clock
out of `core/`, so there is no "now" inside a run to intervene at.

Three consequences, and each is a game-design fact rather than an implementation detail:

1. **A control does not steer a day. It re-rolls one.** Moving a dispatcher weight does not change
   what happens next; it discards the day and simulates a different one.

   > **Corrected twice by GitHub issue #104's verification ([§ D309](../DECISIONS.md#d309)), and
   > both halves were wrong in the same direction — this paragraph was more confident than the
   > wiring.** It read *"`dev/main.ts` is honest about this in its wiring — every state changer calls
   > `runShift()` — but no surface says it."*
   >
   > **Not every state changer does.** The right rail's three lists and the stage's out-of-service
   > badge do, and the day on screen is discarded when they fire. The **group levers**, the **door
   > dwell** and the **weight-set selector** write a field `shiftRunConfigOf` reads and call no
   > `runShift` at all (`dev/dispatcherEditor.ts:1011`, `:1034`, `dev/selectorEditor.ts:443`), so
   > their change waits for the next run — which is a fourth thing a control can do to a day and is
   > why `scope/commitment.ts` distinguishes `re-runs-now` from `next-run`.
   >
   > **And a surface says it now**, on nine blocks across the right rail and the five editor mounts,
   > derived from `SCOPE_OF` so that a re-scoped field moves the sentence rather than stranding it.

2. **The only genuine mid-run adaptation the simulator has is the weight-set selector**
   (`selection.policy`, `core/src/dispatch/selector.ts`, with `patternSwitching` in
   `data/dispatcher-profiles.json`). Which means the player's real within-day lever is *configuring
   an automatic policy in advance*, not intervening. That is a good mechanic, and its last sentence
   here — *"it is currently invisible in every mode"* — **stopped being true with
   [§ D219](../DECISIONS.md#d219)**: `dev/selectorEditor.ts` is the panel, it sits under the
   dispatcher's own controls, and § D309 added the note that keeps this heading's *mid-shift* from
   reading as a promise about the control rather than about the mechanism.
3. **A retry is therefore free, unlimited and unrecorded**, and any progression counted across days
   measures persistence rather than skill unless something says otherwise. See S6 and § 5 clause 1.

---

## 2. The four scopes

```ts
export const CHANGE_SCOPES = ['presentation', 'within-day', 'between-days', 'between-games'] as const;
```

| Scope | Means | The test that decides membership |
|---|---|---|
| **`presentation`** | Provably cannot change what a run computes. | Move it: the legs are **byte-identical**, and a declared sink observably changed. Both halves, always — see S2. |
| **`within-day`** | Re-runs today. Legal, and it is an **attempt**. | Move it: the legs differ. |
| **`between-days`** | May only move at the day boundary. | Move it mid-day and the mode refuses (S7); move it at the boundary and the legs differ. |
| **`between-games`** | Fixed for the whole week. | Changing it invalidates the week's premise, so entering a mode **resets** it (S6). |

The scopes are **named**; a fifth is a compile error at every exhaustive `switch`. The **controls**
are derived; a new one with no scope is a red suite. That split is `mode/types.ts`'s own — *"the
members of those sets are derived, always; the categories are named by the criterion itself"* — and
it is the reason this table can be short without being a list that stops tracking the code.

**`presentation` is the load-bearing one**, because `menu/types.ts` already promises it in prose:
*"a setting that altered the simulation would make two players' scores incomparable while both looked
valid, and the leaderboard verifies a submission by replaying its seed."* A promise with no test is
how this repository's ten dead seams shipped. S2 is that promise made checkable.

---

## 3. The play modes, and the matrix

```ts
export const PLAY_MODES = [
  'shift-week', 'free-play', 'stage-campaign', 'ranked',
  'incidents', 'calendar', 'commissioning',
] as const;
```

| Mode | `presentation` | `within-day` | `between-days` | `between-games` |
|---|:--:|:--:|:--:|:--:|
| `shift-week` — the day loop: contracts, growth, events, goals that harden | ✅ | ✅ | ✅ | ✅ |
| `free-play` — one run, no week, no growth, no event | ✅ | ✅ | ❌ | ✅ |
| `stage-campaign` — `data/campaign.json`'s batch-judged stages | ✅ | derived | ❌ | ❌ |
| `ranked` — a run offered to the leaderboard | ✅ | ❌ | ❌ | ✅ |
| `incidents` — a week with scheduled and unscheduled service events | ✅ | ✅ | ✅ | ✅ |
| `calendar` — a week inside a declared period | ✅ | ✅ | ✅ | ✅ |
| `commissioning` — the pre-week design phase | ✅ | ❌ | ❌ | ✅ |

Three rows carry an argument rather than a preference:

- **`free-play` forbids `between-days`.** A free-play run is *one run*. Permitting a between-days
  field is precisely the defect § 5 clause 3 names, stated as a rule instead of found as a bug.
- **`stage-campaign`'s `within-day` set is derived, not authored** — from each stage's own
  `editable` block via `campaign/dimensions.ts`, which already refuses a dimension the discovered
  search space does not declare. Writing the ids here would make this document the second place that
  has to change when `core` declares a knob.
- **`ranked` permits `presentation` and `between-games` only**, because nothing else survives the
  server's replay (§ D214 § 3). **This row already exists in the tree, written by hand**:
  `dev/main.ts#provenanceLineOf` refuses to emit a CLI line for a run whose building, dispatcher or
  pattern is not shipped, whose `week.day !== 1`, whose event changes anything, which holds cars out
  of service, or whose group levers are off their defaults. That is the `ranked` row, and S5 exists
  so it is derived once and consumed twice rather than written twice and allowed to drift.

---

## 4. The rules

**S1 — Every player-writable field carries exactly one scope, and the field set is derived.**
Derived from the state's own keys — `initialState()`, `DEFAULT_SETTINGS`, the `FreePlaySelection`
axes — and asserted in **both directions**: a field with no entry is red, and an entry naming a field
that no longer exists is red. A field the shell writes and no player controls is declared an
**output**, with its reason, rather than left absent; an absence is indistinguishable from an
oversight, which is § D106's argument about `measured: false` versus `0`, applied to a control.

**S2 — A `presentation` control must reach a sink and must not reach the legs.** The sink must be
the **shipped** decision, not a restatement of it: a probe that recomputes the arithmetic asserts its
own correctness and passes whether or not the control is connected to anything. Both halves, and the
second is the inverse of § D177's rule. One clause catches a setting that secretly moves a run — which
would silently break `configHashOf`'s replay guarantee while both players' scores looked valid — and
the other catches a setting that reaches nothing at all.

**S3 — A non-`presentation` control must change the legs.** Compared on the legs, never on a window
statistic (§ D177). This is [`docs/12`](12-design-handoff.md) § 5 clause 9 — *"no control is inert"* —
mechanised for the first time across the whole writable surface rather than per editor.

**S4 — Scope and mode are named categories, controls are derived members.** `permits(mode, scope)` is
an exhaustive `switch` over both unions with no `default`, so a fifth scope or an eighth mode is a
compile error rather than a silently permissive row.

**S5 — A run offered for ranking may carry no state outside `between-games`, and that predicate has
one derivation and two consumers.** The consumers are `provenanceLineOf` and the leaderboard submit
path. Two implementations of *"can this run be reproduced elsewhere from its selection?"* is how the
client and the server come to disagree about what a selection meant, which a leaderboard verified by
replay cannot survive.

**S6 — Entering a play mode resets every scope that mode does not permit.** Not "warns about", not
"ignores": resets. A mode that forbids `between-days` and then runs against a week already on day 7
is showing a run its own screen does not describe.

**S7 — A control a mode forbids is not offered.** Not offered-and-refused. A disabled control with a
reason is correct where the *combination* is wrong (`freePlayIssues`' cross-field rule is the right
shape); a control that this mode can never permit is chrome that teaches a player a wrong model.

**S8 — A control that says anything enters the honesty sweep, or carries a reasoned exclusion.**
`honesty/surfaces.ts` is the chokepoint. An exclusion is a sentence long enough to be one, in
`derive.test.ts`'s existing accounting.

**S9 — Evidence tiers are named, and no claim is cited one tier above where it was earned.**
`static sweep < model walk < document recorder < browser`. This repository has no browser
([`docs/05`](05-roadmap.md): *"no Playwright, no Puppeteer, no jsdom"*), so nothing here earns the
top tier, and the play-through walk introduced by this contract must say so wherever it is cited.

**S10 — No `UX.md` row gains `✅ run` without a browser.** The ledger has burned itself on false
green marks three times and says so at its own head. A model walk earns `✅ test` on the decision
half and `⚠️` on the DOM half, and that is the whole of what it earns.

---

## 5. The clauses the product fails today

Named up front, per § D163. Each is a run rather than an opinion, and each gets its red output
recorded in § D217.

1. **A contract can be cleared without advancing a day.** `shift/week.ts#closeDay` increments
   `cleanRun` and `streak` and appends to `history` with no same-day guard, and `closeShift`'s only
   guard is `filedRunId === recording.runId`, which any re-run defeats. Move a slider, re-run,
   re-close: `needClean: 3` clears on Monday. This is S6 and § 1's retry, unmodelled.
2. **Free Play's Start does not run the selection.** `menuHost.start()` sets state and calls
   `renderAll()`; every other state changer calls `runShift()`.
3. **A Free Play run is not the run the menu described.** `start()` never resets `state.week`, so
   `shiftRunConfigOf` still applies `grownBuilding`'s 11 %/day and `eventFor`'s out-of-service car,
   rate multiplier and split swing — none of which the Free Play screen names. S6, and the reason
   an honest submission could not verify server-side today.
4. **The four `Settings` reach nothing.** `reduceMotion`, `showEnergyAxis`, `playbackSpeed` and
   `theme` are read only inside `menu/`. S2's second clause.
5. **Nothing reopens the menu.** `closeMenu()` only ever writes `hidden = true`; there is no button,
   no key, and no `?screen=` in `applyDeepLink`'s seven accepted fields.
6. **The campaign screen has no content**, and its row's handler selects nothing.
7. **The menu has no stylesheet.** Its class names appear only in the modules that emit them.
8. **`menu/client.ts#submit` has no non-test caller**, so the leaderboard cannot be posted to and the
   Account row's own subtitle describes something no player can do. S5's consumer, missing.

---

## 6. What this contract does not permit

Restating [`docs/10`](10-experience-layer-contract.md) § 5.5 where scope makes a new way to break it:

- **A scope is not a difficulty knob.** Difficulty is demand and building fabric, never a fudge
  factor on a metric. A calendar period that lowers occupancy is admissible for exactly that reason;
  one that adjusted a goal's bar to compensate would not be.
- **A capital constraint is a limit on a configuration, never a metric.** Commissioning may bound
  what a player builds. The moment a budget is displayed as an outcome it is a score, and § 5.5's
  ban on grade letters and efficiency scores applies to it in full.
- **An attempt count is an observation, and is published beside a result rather than folded into
  it** — the footing `workPerServedLegKJ` sits beside raw energy on (§ D106), and abandonment beside
  AWT. A day cleared on the fourth attempt is cleared; the sheet says which attempt it was.

---

## Sources

- [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) — R1–R13, and § 5.5's
  prohibitions, which this contract narrows and never relaxes.
- [`docs/12-design-handoff.md`](12-design-handoff.md) § 5 clause 9 — *no control is inert*.
- [`DECISIONS.md`](../DECISIONS.md) § D106 (energy is an axis), § D163 (a criterion must be
  falsifiable), § D177 (move the control, require the run to change), § D213 (derive the list),
  § D214–§ D215 (the menu, and the leaderboard verified by replay).
