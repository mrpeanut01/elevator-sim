# ISSUE_VERIFICATION_FINDINGS.md

Evidence gathered while triaging the open backlog. Every claim below is either **measured by a run
recorded here** or **traced to file:line in the tree at the snapshot commit**. Reporter claims that
did not survive verification are recorded as prominently as the ones that did.

Snapshot: 2026-08-07, branch `feat/azure-app-deployment`, clean. `npm run typecheck` passes.

---

## A. #108 — the St Jude crash. CONFIRMED, root cause exact.

Verified directly, no agent involved.

| where | what it says |
|---|---|
| `packages/viz/src/authoring/buildingSpec.ts:166` | `readonly traversalTimeS: number;` |
| `packages/viz/src/authoring/buildingSpec.ts:790` | `const declared = mode.traversalTimeS.toFixed(1);` |
| `packages/viz/src/dev/buildingEditor.ts:2197` | `const seconds = … mode.traversalTimeS.toFixed(1);` |
| `data/buildings/st-jude-hospital.json` | `traversalTimeS = {"upS": 26.0, "downS": 19.0}` |
| `data/buildings/vertical-city.json` | `traversalTimeS = 21.2` ×4 |

Enumerated **all 8** shipped buildings: `st-jude-hospital` is the **only** one carrying the stairs
(object) form. Every other building either declares the escalator (number) form or no transport
modes at all. `.toFixed` on `{upS, downS}` is the reported `TypeError`. The viewer narrows a union
`core` declares deliberately.

**The reporter's recommendation 3 is the right one and matches this repo's own § D192 technique:**
load every building in `data/buildings/` through the viewer's spec path, with the list **derived
from disk**, not hand-written. That test is worth more than the fix — it is the same defect class
as the eleven dead seams.

---

## B. #99 / #116 § 1 — the Free play default. Reporters DISAGREE; #116 is right, #99 is wrong.

The two issues state contradictory defaults, 17 minutes apart on the same tree:

- **#99:** *"Free play defaults to Midtown Office (1,710 people, four cars) paired with the
  Conventional collective baseline dispatcher"*
- **#116 § 1:** *"Free play defaults to Chancery House (alphabetically first) with `Nearest car` —
  the deliberately weakest dispatcher"*

**#116 is correct.** `packages/viz/src/menu/menu.ts:49` `initialMenuState`:

```ts
buildingId: catalogue.buildings[0]?.id ?? '',
dispatcherProfileId: catalogue.dispatchers[0]?.id ?? '',
```

Both are **array index 0**, not a curated choice. `elevator-sim list` resolves those to
**Chancery House** and **Nearest car** respectively. #99's stated repro is not the shipped default.

### The measurement — and the default is worse than either issue reported

Same building, same seed, same duration, same 81 served riders. **Only the dispatcher differs.**

| | `nearest-car` (the shipped default) | `collective` |
|---|---|---|
| AWT | **146.72 s** | **10.34 s** |
| WT95 | 215.35 s | 22.99 s |
| waits over 60 s | **87.7 %** (71 of 81) | **0.0 %** (0 of 81) |
| longest wait | 227.9 s | 29.6 s |
| handling capacity | **54.0 /5 min** | **86.0 /5 min** |
| demand offered | 81.0 /5 min | 81.0 /5 min |

```
elevator-sim run --building chancery-house --dispatcher nearest-car --seed 20260804 --duration 1800
elevator-sim run --building chancery-house --dispatcher collective  --seed 20260804 --duration 1800
```

**The mechanism is clean and quotable:** handling capacity `54.0 < 81.0` offered on the default
(under-capacity), against `86.0 > 81.0` on `collective`. A **14× AWT difference produced by an
array index.** Not saturated — all 360 delivered, so the mean is legitimately quotable — which
makes it worse, not better: the product confidently reports a 2.4-minute average wait as a new
player's first run.

**Disposition consequence.** #99's *conclusion* survives and is strengthened; its *premise* must be
corrected before the issue is actioned, or an engineer will go looking at Midtown Office and find
nothing. The fix is to curate the opening pair rather than take index 0.

### Separately: 2 of 8 buildings saturate at a nearby configuration

At `collective` / seed 424242 / 900 s, **`midtown-office` and `mixed-use-high-rise`** saturate and
suppress AWT; the other six do not. #116 § 1 reports the saturating pair as `midtown-office` and
`vertical-city` under the viewer's own per-building defaults. **My configuration is not #116's**, so
this neither confirms nor refutes its specific pair — it confirms the *shape* (some shipped
buildings saturate at ordinary defaults) and the *count* (two of eight). #116's per-building default
table should be reproduced on its own terms before being quoted.

---

## C. #119 § 1 — the Compare default resolves nothing. CONFIRMED exactly.

```
elevator-sim compare --building chancery-house --a collective --b eta --reps 50 --seed 424242
```

```
AWT             SUPPRESSED                          14.53 s  [12.72, 16.34]
WT95            SUPPRESSED                          36.13 s  [32.26, 40.01]
% waits > 60 s  SUPPRESSED                          1.83 %  [0.33, 3.33]
TTD             SUPPRESSED                          106.56 s  [103.55, 109.58]
saturated       1 of 50 replications                0 of 50 replications

VERDICT: NONE — a saturated arm cannot be ranked.
```

**1 of 50** `collective` replications diverged, and the complete-case rule correctly nullifies all
four wait metrics for the whole batch. Reproduced at 2.9 s, workers ×8, common RNs verified 50 of
50. This is precisely what #119 describes.

### The CLI already says the useful thing the viewer does not

```
What can be said: A (collective) diverges at this load and B (eta) does not. That is a
finding about capacity, and it does not need a mean to be true.
```

That framing exists **today**, in `cli`. #119's complaint is that the viewer renders the same
result as *nothing*. So the fix is largely **presentational parity with a surface that already gets
it right** — cheaper than the issue assumes.

### #119's recommendation 1 is confirmed — with a caveat that changes the recommendation

*"Ship defaults that resolve. … A run at a slightly lower demand would do it."* Swept three rates,
50 reps each, seed held:

| `--rate` | saturated | AWT difference (A − B) | verdict |
|---|---|---|---|
| 6.0 | 0 of 50 / 0 of 50 | −0.19 s [−0.40, +0.03] | INDISTINGUISHABLE |
| **5.5** | 0 of 50 / 0 of 50 | **−0.46 s [−0.78, −0.15]** | **A is BETTER** |
| 5.0 | 0 of 50 / 0 of 50 | +0.03 s [−0.25, +0.31] | INDISTINGUISHABLE |

**Lowering the demand does remove the saturation — at every rate tried.** But only one of three
rates separates, and it sits *between* two that do not.

> **Flagged as a risk, not a recommendation.** Selecting `5.5` *because* it is the rate that
> returns BETTER would be choosing a default to manufacture a verdict. It is also a **−0.46 s**
> effect, and this repository has refused effects on exactly these grounds before — § D156 refused
> two cells that cleared Holm–Bonferroni *"because the effect is a third to a half of what the
> apparatus can resolve there"*. Whether −0.46 s clears the resolution limit **at this cell** is
> unmeasured, and § D151's rule is that the limit is measured per cell rather than inherited.
>
> **The defensible fix is to pick a non-saturating default on grounds that have nothing to do with
> its verdict, and to render INDISTINGUISHABLE as a real answer rather than as nothing.**
> "These two dispatchers are indistinguishable at n = 50" is informative, correct, and is what the
> feature is *for*. Shipping a default chosen for its outcome would be a new instance of the
> failure mode `CLAUDE.md` spends its longest section warning about.

---

## D. #105 — CONFIRMED, and it is #109's root cause, not its own bug.

`packages/viz/src/render/canvas.ts:1780`:

```ts
`${recording.status} · ${String(recording.summary.generated)} generated · ${windowClause(recording.summary)}`
```

`recording.status` is assigned from `result.status` at `packages/viz/src/record/recordRun.ts:360` —
the **whole-run simulation result**, not the playback state. The strip therefore reads `completed`
from the moment the recording exists, regardless of where the playhead is. #109's recommendation 1
already names this exact strip. **Clean combine into #109.**

#105's cheaper alternative (rename to `arrivals generated`) should be preserved as a fallback if
the gating work in #109 is deferred — it is independently shippable.

---

## E. #106 — CONFIRMED for two surfaces; the reporter's mechanism is WRONG; one claim unsupported.

Verified by task V-106 against the tree.

**The defect is real** for the email field and the display-name field, and the smallest fix is in
`packages/viz/src/dev/main.ts:1531-1534`.

**The reporter's diagnosis is wrong in a way that matters.** The issue says the rebuild is triggered
by `input` (per keystroke). There is **no `input` listener anywhere in the menu overlay** — the
listener is `change` (`packages/viz/src/dev/menuPanel.ts:865`), which fires on **blur**, and blur is
the default action of mousedown. Same symptom, different trigger.

> **This correction is load-bearing.** The obvious fix suggested by the issue's own wording —
> switch the field from `change` to `input` — would make the defect **strictly worse**, firing the
> full `replaceChildren` rebuild on every keystroke, which is the failure mode the reporter
> imagined already existed. An engineer who implements the issue as written will damage the product.

**The Settings claim is not supported by the code.** `main.ts:1269-1313` writes `menuState` and
calls `applyTheme()` **synchronously at 1281, before `drawMenu()` at 1313**; `applyTheme` writes
`root.dataset['theme']` directly. There is no debounce and no batching, and the Settings screen has
no text field, so it has no blur-commit source. Either the reporter conflated it with the account
screen, or it needs a runtime repro. **Split it off rather than fixing it blind.**

**Two additional defects found that the issue does not name:**
1. **Enter does not submit** — confirmed and *independent*. `accountForm` builds a plain `div`
   (`menuPanel.ts:630`), the submit is `<button type="button">` with a click listener only, and the
   overlay's keydown handler (`menuPanel.ts:381`) covers Escape and Tab and nothing else.
2. **Tab-then-Enter is broken for keyboard users.** After the swallowed click, `restoreFocus`
   (`menuPanel.ts:432-442`) yanks focus to `controls[0]` — the field itself. There is no
   mouse-free path around the bug.

**Test coverage: none, and the document tier is structurally incapable of catching it.**
`menuPanel.test.ts` fires handlers by reaching into a `Map` (`:405`, `:847`), so a **detached
node's handler still runs** — the exact thing the bug depends on cannot be observed there. No test
currently clicks twice, so nothing is accidentally hiding it; the gap is that nothing types-then-
clicks. A regression test for this must live in the browser tier
(`dev/keyboard.browser.test.ts`), which is **excluded from the default run**
(`vitest.config.ts:39-40`, opted in as the `viz-browser` project).

**Riskiest part of the fix:** dropping the redraw changes when validation output appears.
`updateForm` clears `notice` on every commit (`packages/viz/src/menu/account.ts:149`) specifically
so a stale *"a link is on its way"* cannot survive an edited address — the deception
`account.ts:135-139` says the clearing exists to prevent. Any fix must redraw at a moment that does
not straddle a pointer press.

---

## F. #114 — the Machines rail. Dead seam CONFIRMED, but the issue's fix is backwards.

Verified by task V-114.

### The write path terminates at `packages/viz/src/dev/rightRail.ts:967`

```ts
onPick: () => {
  context.update({ editingClassId: entry.id });
},
```

That is the entire write. `shiftRunConfigOf` (`packages/viz/src/dev/state.ts:838`) — the single
function that turns a `ViewerState` into a run — **never reads `editingClassId`**. The asymmetry is
visible inside the same `render` body: the three sibling rail segments each call
`context.runShift()` after their write (`rightRail.ts:869`, `:904`, `:934`); the Machines segment
does not, and cannot.

### But this is NOT an undiscovered dead seam, and that changes the fix entirely

`packages/viz/src/scope/surface.ts:244-247` **already declares** the field:

```ts
'viewer.editingClassId': control(
  'presentation',
  'Which machine class the machines editor is pointed at. Names the draft’s subject and reaches no run.',
),
```

and `packages/viz/src/scope/scope.test.ts:61-77` **already runs** this repo's standing
"move the control" harness against it — in the **negative** direction, asserting the legs are
byte-identical when `editingClassId` moves.

> **#114's recommendation 4 is exactly backwards.** It says *"add the test … Today that test would
> fail."* The test exists and today it **passes**, because the field is declared `presentation` and
> the harness requires inertness. Implementing #114 as written — making the panel live — would turn
> the suite **red** unless `SCOPE_OF['viewer.editingClassId']` is re-scoped in the same change.
> An engineer following the issue will be ambushed by this.

### So what IS the defect

**A declared-`presentation` pointer is drawn in the right rail as a six-card selection list, in the
identical `pick`-card form as the three live selectors above it, with no read-only marking and no
refusal sentence.** That is the § D227 rule violated in its first direction — *a control that
writes nothing must say so* — and `CLAUDE.md` rates a missing refusal above a missing behaviour.

**This is a new defect class for this repository, and it is the most valuable finding in the
triage.** The harness verifies that *state fields* are inert. It does not verify that an inert
field is *drawn as inert*. `mountRightRail` sits on the undriven-DOM-mount exemption list
(`packages/viz/src/honesty/derive.test.ts:72`) and no test invokes it at all, so nothing asserts
which card the rail marks pressed. **The same gap is open for `editingDispatcherId`,
`editingPatternId` and `editingBuildingId`** if any of them is ever drawn this way.

### Sub-claim verdicts

| claim | verdict |
|---|---|
| (a) rail renders cards **twice**, lists disagree | **Duplication REFUTED, disagreement CONFIRMED.** There is one rail list. The second is the Building editor's `#building-class-chips` (`buildingEditor.ts:2257-2284`), a different panel with a different selection source. The reporter's snapshot spanned both. "Render it once" is therefore not actionable as written. |
| (b) two cards pressed at once | **REFUTED within the rail** — exactly one is pressed. True only across the two panels. |
| (c) validity line prints **unconditionally** | **REFUTED as stated, real defect underneath.** `machineWarningOf` (`rightRail.ts:665-697`) *is* gated — on rise (`:676`) and floor count (`:681`). Hydraulic does fire ⚠ on Chancery House. **Rated speed is never compared anywhere**, which is why Ultra high-speed passes at 5 m/s. The panel contradicts itself two rows up, where the nameplate says *"A car outside the band is not a car of this class."* (`rightRail.ts:587-590`). |
| (d) run is bit-identical | **CONFIRMED — and structurally guaranteed**, already pinned by `scope.test.ts:61-77`. |
| (e) speed editable only via Building editor + Save | **PARTLY REFUTED.** The **commissioning screen** (Menu → Campaign → *Commission the building*) writes per-bank `machineClass` **and** `ratedSpeed` **live, with no save** — `main.ts:1477` → `state.ts:870-871` → `commissioning/building.ts:225-226`, declared a real `between-games` control at `surface.ts:156-161`. The issue misses this entirely. The Building-editor path is also building-wide, not per-car (`buildingSpec.ts:186`, `:930`), and needs **two** steps (Save, then *Run this building*). |

### The wrong pre-selection is worse than reported

`packages/viz/src/dev/state.ts:676-677`:

```ts
editingClassId: classes[2]?.id ?? classes[0]?.id ?? 'geared-traction',
```

`classes[2]` is `geared-traction`. It is a **positional index into the shipped class array, seeded
once at boot and never re-derived** — `withBuilding` (`state.ts:482-544`) re-seeds `buildingSpec`
and `editingBuildingId` but touches neither `editingClassId` nor `machineSpec`. So the rail shows
Geared traction on **every building, forever**. It is not mis-indexed for Chancery House; it is not
indexed by the building at all.

### Recommended disposition

**Mark it read-only — do not make it live.** A machine class is an *envelope*, not a thing a run
has; cars carry `spec` + `ratedSpeedMps` per bank. Writing a class into a run means choosing a
speed inside its band, re-fitting the load, and deciding per bank — which is exactly what the
commissioning screen **already does**. Making the rail live would be a second, weaker answer to a
question that already has one.

Four edits, smallest correct form: drop `onPick` and add the refusal sentence (`rightRail.ts:951-971`);
derive the highlight from the building rather than `editingClassId` (`:953-954`), which fixes the
disagreement and the wrong pre-selection together; add the speed comparison to `machineWarningOf`
(`:665-697`) — **note this requires changing `rightRail.test.ts:477-484`, which currently pins the
speed-blind behaviour**; and correct the stale register sentence at `probes.test-helper.ts:688`,
which names the wrong reader and omits `mountRightRail`.

---

## H. #112 / #113 / #101 — the competitive loop. All CONFIRMED; both nominated fixes are wrong.

Verified by task V-112.

### #101 folds into #112

Board rendering **does exist** and draws real rows — `packages/viz/src/dev/menuPanel.ts:701-717`
builds `<ol class="menu-board">` per `page.entries`. The labelled example appears **only** when the
fetched board list is empty (`:683`, `:691-697`). After a successful post the list is empty because
of #112's fetch latch, so #101's leaderboard half is a **symptom**. Its challenge half — no board
markup at all — is #112 claim 1 verbatim, because `boardTable` is gated to one screen
(`menuPanel.ts:260`).

There is also **no score seeding on the server** — `recordEntry` has no non-test caller outside
`api.ts`/`store.ts` — so a fresh deployment genuinely has zero entries. **That is correct
behaviour, not a defect.** #101's "seed the boards" ask remains a product decision, unchanged.

**Disposition: combine #101 into #112.** It contributes no independent root cause.

### #112 and #113 are independent, but share one habit

No file, function or type is common to the two. Three of six root causes are the same anti-pattern
— *populate once at mount, never again*: the `boardsRequested` latch (`main.ts:1092-1093`), the
`prefilled` latch (`batchPanel.ts:632-633`), and the mount-time loops filling the Compare selects
(`batchPanel.ts:95-97`, `:109-113`). **Fixing one does not fix the other. Ship separately.**

### The three corrections that change the work

**1. #113's stated cause for vanishing dispatchers is REFUTED — and the real cause is better news.**

The issue infers two storage paths from "the custom building persisted". There is **one writer**
(`packages/viz/src/persist/session.ts:188-195`) and **one reader**
(`packages/viz/src/persist/validate.ts:866-916`) for all four shelves. The real cause is *when*,
not *where*: `saveSessionNow()` has exactly **two call sites, and neither is a Save button** —
`main.ts:1311` (a menu setting) and `main.ts:3029` (`closeDay()`). There is no `beforeunload`
handler anywhere in `packages/viz/src/dev`.

That explains 1-of-4 survival exactly: a dispatcher saved via *"Save it and run it"*
(`dispatcherEditor.ts:539-562` → `runShift()` → day close → write) survives; one saved via
*"Save as a new dispatcher"* does not. **The fix is ~5 lines at the single `context.update` choke
point (`main.ts:2001-2004`) — persist when the patch touches a `saved*` key.**

**2. #113's own nominated "highest-value, no new features" fix is NOT small, and does not close the
loop.**

The issue nominates feeding custom profiles into `#batch-candidate` / `#batch-baseline` /
`#campaign-profile`. But the batch runs in a **Worker that reloads `data/` independently and never
receives the player's library**:

- `packages/viz/src/batch/types.ts:370-373` — `BatchWorkerRequest` carries no resources.
- `packages/viz/src/dev/batchWorker.ts:51-70` — the worker calls `loadBrowserResources()` itself.
- `packages/viz/src/batch/runBatch.ts:271-278` — `armProfile` **throws**: *"is not in this build's
  `data/`. A batch cannot run an arm it cannot resolve."*

So adding the options alone would turn a silent omission into a **runtime `BatchError`** — strictly
worse. Minimum touch set is five files across a worker boundary, in the subsystem this repo treats
as its statistical authority. **Medium, not small, and gated on fix 1** — listing a dispatcher that
does not survive a reload is not worth doing.

Two further instances the issue missed: the **challenge** screen's dispatcher select has the same
defect (`packages/viz/src/menu/catalogue.ts:125`), and `batchPanel.ts:635-637` silently inherits
nothing when the viewer sits on a custom building, so Compare runs the shipped default.

**3. #112's "nothing in the UI mentions replay verification" is REFUTED.**

Five sites say it: `packages/viz/src/menu/screens.ts:766`, `:831`, `:1050`, the example board's rule
line (`menuPanel.ts:792-794`), and the post-success notice at `main.ts:1822` — *"Posted. The server
replayed your seed and it reproduced."* **It is under-sold, not absent.** The recommendation stands
but its premise must be corrected.

### The auth token is a deliberate, documented security choice — do NOT just persist it

`packages/viz/src/menu/account.ts:73-74` and `packages/viz/src/dev/main.ts:1111-1113` **both**
record that the token is held in memory *on purpose*. #112's recommendation 3 asks for
`localStorage` "at minimum", which would reverse a deliberate decision without revisiting it.

**Escalate rather than implement.** The lock-out #112 describes is real and the arithmetic checks
out (`api.ts:201` `maxRequests: 3`; `credentials.ts:82` `LOGIN_TTL_MS = 15 min`) — but it should be
fixed **at the rate limiter or with a refresh path**, not by moving a token the code twice says
must not move.

### The fastest route to a working competitive loop — and neither issue named it

| # | fix | size | kills |
|---|---|---|---|
| 1 | Persist on library change (`main.ts:2001-2004`) | **~5 lines, 1 file** | #113.2 outright |
| 2 | Drop the `boardsRequested` latch; refetch after a successful post (`main.ts:1092-1093`, `:1821-1826`) | **~5 lines, 1 file** | #112.2 and the live half of #101 |
| 3 | Render `challenge.board.entries` — reuse `boardTable`, widen the gate at `menuPanel.ts:260`. Data already arrives, CSS classes already exist, `ChallengeBoardRow` already typed. | **~40 lines, 1–2 files** | #112.1, and makes "Order the board on" mean something |

**~50 lines across three files.** Everything both issues actually asked for is downstream of these.

### Test coverage

Server side is thorough (`api.test.ts:507-640`, `challengeApi.test.ts:160-439`, the 422 forgery
pinned at `verify.ts:215`). **Every defect in this report sits in the client-side gap:** no test
renders the challenge screen through `menuPanel` at all (`menuPanel.test.ts:259` passes
`challenge: () => undefined`); nothing tests `loadBoards`/`boardsRequested`; nothing asserts the
contents of the Compare selects; and nothing drives *editor Save → reload → still there*.

---

## I. #111 / #97 — setup validation and the missing scenario list.

Verified by task V-111. **Both issues were evaluated against exactly the tree the reporters saw** —
HEAD is `faf935b` (2026-08-06 23:44) and no commit exists after either was filed.

### ⚠ THE MOST IMPORTANT FINDING IN THIS TRIAGE: #111 and #106 have conflicting fixes

**#111's obvious fix would make #106 dramatically worse, and neither issue knows it.**

- **#111** asks for validation on `input` rather than only `change`.
- **#106's** root cause (§ E) is that committing a menu field triggers a **full
  `replaceChildren` rebuild** of the overlay, which detaches the button between mousedown and
  mouseup and swallows the click.

Adding an `input` listener fires that rebuild **on every keystroke** — which is precisely the
failure mode #106's reporter *imagined* already existed, and which V-106 independently flagged as
the trap. V-111 found the same collision from the other side and adds a second consequence:
`restoreFocus` (`menuPanel.ts:432-442`) restores focus by `data-menu-control` but **restores no
caret position**, so mid-string edits would jump the cursor to the end on every character.

> **Hard sequencing constraint: #106 must land first.** Only once the overlay stops rebuilding on
> field commit can #111 safely validate on `input`. If #111 is fixed first, or the two are given to
> different agents in parallel, the product regresses. **This is the single most important
> serialization constraint in the batch plan.**

The alternative minimal fix for #111 — make `textRow` reuse the existing node when the key matches
instead of rebuilding it — is the *same* fix #106 needs, which is a strong signal the two issues
should be **one workstream, not two**.

### #111 (2a) — CONFIRMED

`packages/viz/src/dev/menuPanel.ts:863-867` registers `change` only. **There is no `input` listener
anywhere in `menuPanel.ts`** — the file's only registrations are `keydown` (`:381`), `click`
(`:509`), and three `change` handlers (`:829`, `:865`, `:885`). `canStart` (`menu.ts:321`) is
computed from the lagging state, so the reported sequence follows directly.

The refusal itself is correct (`menu.ts:310`, `/^\d{1,20}$/u`) and **is not injectable** — all issue
text is written with `setText` → `textContent` (`menuPanel.ts:581`, `dom.ts:84`), so the reporter's
`<script>alert(1)</script>` renders as literal text. Worth stating in the issue, since it reads
like a security finding and is not one.

### #111 (2b) — CONFIRMED, but it is NOT "one edit behind"

2a is a lag. **2b is a stale value the select cannot represent**, so the box and the model disagree
*permanently* rather than by one step. `freePlayPatch` (`screens.ts:1890-1891`) sets
`demandTemplateId` and **does not touch `windowStartS`/`durationS`**; the part select is then
rebuilt with the **new options and the old value** (`screens.ts:1003-1012`), no option matches, and
the browser falls back to index 0.

Verified against real data: the opening template `rise-and-fall` has one part (`null:1800`);
`office-day` derives exactly four, none of them `null:1800`. **Exact match to the report.**

> **The issue's stated recovery is probably wrong.** *"Re-picking the identical option clears it"* —
> a native `<select>` fires `change` only when the value actually changes, so re-choosing the
> already-displayed option 0 fires nothing. **The defect is stickier than reported**, and a fix
> verified against the issue's recovery step would be verified against a step that does not work.

**This behaviour is currently pinned as intended** — `menu/menu.test.ts:251-258` asserts it
("*The template moves and the part does not, which is the state a select can produce*"). Fixing 2b
requires amending that test.

### #111 seed contracts — PARTIALLY CONFIRMED, and the framing is inverted

The contracts do differ, but two specifics are false and the conclusion is backwards.

| | setup (menu) | sim screen |
|---|---|---|
| `inputmode` / `placeholder` / `size` | absent | `numeric` / `random` / `12` |
| **`maxlength`** | absent | **absent — the issue's `maxlength=20` DOES NOT EXIST** |
| empty value | refused | draws a fresh seed |
| upper bound | **20 digits** | **unbounded** (`^\d+$`, `main.ts:4007`) |

`maxlength`/`maxLength` **appears nowhere** in `packages/viz/src` or `packages/viz/index.html`. The
reporter's `pattern=""` / `maxlength=-1` are DevTools' rendering of *absent* attributes, not
attributes. And a 21-digit seed is **legal on the sim screen and illegal in the menu** — so the
menu is the **stricter** of the two, the opposite of the issue's framing. The ask (give the setup
field the sim screen's affordances) is still right; the justification needs rewriting.

### #97 — REFUTED as filed, but it found two real one-line bugs

**A scenario list exists and is rendered.** `packages/viz/index.html:1795` `<div id="scenario-list">`,
mounted at `packages/viz/src/dev/main.ts:2052` (`mountScenarios`), eight cards built by
`scenarioCardsOf`. The tab is not in `CONTEXTUAL_TABS`, so nothing gates it.

**`?mode=scenarios` is impossible.** `mode` accepts only `basic`/`advanced` (`mode/types.ts:51`).
The param the code writes is `tab=scenarios`, via `replaceState` — **not a reload**. Clicking
*Scenarios* navigates to a distinct menu screen with four different rows
(`screens.ts:1142-1193`) and **changes no URL at all**. The list is one press further
(`campaign.open` → `open-campaign` → `main.ts:1365-1374`).

**But the reporter's quoted string is real, and it exposes two genuine defects:**

**(a) The boot menu is painted stale and never refreshed.** `boot()` calls `drawMenu()` at
`main.ts:1967`, then `runShift()` at `:2167`. Neither `renderAll` (`:2243-2256`) nor `runShift`
(`:2735-2769`) calls `drawMenu`. So the first-session menu is painted with `hasRun: false` and
**stays that way even though a shift has run** — which is exactly why the reporter saw
*"There is no shift on screen to go back to yet"* (`resumeRow.disabledWhy`, `screens.ts:634-636`).
**Fix: one `drawMenu()` after `runShift()` in `boot()`.** Do *not* put it inside `renderAll` — that
would rebuild the overlay on every stage change and steal focus, re-creating #106.

**(b) The copy says "below" and the row is rendered last.** `mainRows` (`screens.ts:662-690`) puts
`resumeRow` at `:689` — **there is literally nothing below it**, which is the *"no scenario list
rendered below"* the reporter describes. The docstring at `:617` still claims *"It is first…"*, so
the code and its own comment disagree. **Fix: move the row, or change one word.**

**(c)** `campaign.open` is labelled *"Open the doors — Take the current scenario and start the
week"* (`screens.ts:1145-1152`) but the arm only switches tab; it starts no week.

**Disposition: rescope #97, do not close it.** Its premise is wrong; its observation is real. The
hierarchy half genuinely overlaps #90/#98; (a) and (b) are independent one-line bugs.

### The test hole, named precisely

`playthrough/walk.test.ts:283-327` applies every option but re-reads **only the same row**
(`:318`), so *a select changing another select's validity is invisible*. That is the exact hole 2b
falls through. **The missing invariant: after applying any option, every select on the screen still
contains its own value.**

---

## J. #109 / #117 — the rail publishes the ending. CONFIRMED; the two issues do NOT share a fix.

Verified by task V-109.

### #117 is NOT caused by #109 — and fixing #109 as filed would not fix it

Both trace to boot's unrequested simulation — `packages/viz/src/dev/main.ts:2164-2167` runs a full
`recordRun` on a cold load with zero clicks. But the link to #117 runs through a **third, distinct
defect**:

`closeMenu()` latches `playerHasChosen = true` on **all four** ways out (`main.ts:1961-1965`),
including **Resume/Escape** — whose own docstring says *"Resume itself starts nothing."* That
un-gates `closeShift`'s guard at `main.ts:2924`, so the boot recording can be filed as a real day
and rotate into the `was` column (`reportPanel.ts:1174-1180`).

> **Correction to my earlier triage.** I provisionally recorded #117 as a probable consequence of
> #109. **It is not.** Gating the rail (#109's fix) leaves `mountReport`'s rotation untouched.
> #117 needs the `playerHasChosen` split, which is neither issue's stated fix.

**And #117's headline symptom is unexplained.** *Three consecutive* runs showing an identical
Garden Apartments baseline is **not producible from the code**: `runShift` writes
`report: undefined` (`main.ts:2763`) so no rotation happens on an unfiled sheet; each filed sheet
carries a different `attempt N` identity and rotates; and `reportDeltaOf` emits a row only where
the strings differ (`reportPanel.ts:781-782`), so `was Garden Apartments` **cannot appear on a
Chancery→Chancery pairing at all**. The confirmed defect can poison **one** delta, not three.

**Do not close #117 against #109's fix.** The rotation is entirely untested — `filedIdentity` /
`currentSheet` / `previousSheet` are module-private closure variables in `mountReport`
(`reportPanel.ts:897-911`) and the suite is `environment: 'node'`. Extract the rotation into a pure
reducer so it can be driven, *then* decide.

### The finding that matters most: the provisional retraction never reaches the screen

`packages/viz/src/render/mood.test.ts:325-330` asserts, in words:

```
it('says it in the headline, not only in a flag', () => {
  // A flag no renderer is obliged to read is not a retraction. The words carry it too.
  expect(buildingMood(observations({}, [], 100)).headline).toContain('So far');
```

**The only shipped renderer drops that headline.** `dev/leftRail.ts:924-946` uses `mood.drivers`,
`mood.caveat` and `mood.provisional` and **never `mood.headline`** — the card's headline comes from
a different source (`leftRail.ts:842-849` ← `moodOf(bands)`). The sole surviving provisional signal
is a CSS class whose entire effect is `packages/viz/index.html:1128`:
`.mood-provisional { font-style: italic; }`.

> **A typographic-only signal, with no text**, on a card whose own docstring (`leftRail.ts:33-47`)
> is a KB-15 table promising every signal has a second channel. **This is a test asserting a
> property of a field no renderer reads** — the honesty-harness analogue of a dead seam, and a new
> instance of the § D227 class.

Four of the five rail drivers are whole-run (`mood.ts:287-315`, `:317-326`, `:346-366`, `:278-285`);
only `standing` reads the playhead. `atS` reaches `buildingMood` for exactly one purpose —
`mood.ts:380`, `const provisional = atS < endedAt;` — and that flag dead-ends in italics.

**The rail already owns the correct predicate and does not use it:** `shiftIsOver`
(`leftRail.ts:894-896`) is used by `basisAt` for the mood and honesty cards and **not** by
`drawDrivers`. The Day report's § D223 rule (`reportPanel.ts:830-836`, `:750-758`) is the shape to
copy, and its precedent is thoroughly tested at `reportPanel.test.ts:445-520`.

### `All N` is gated on the wrong complement — and the viz layer cannot currently fix it

`mood.ts:320,322` branches on `summary.undelivered > 0`. But the conservation identity is
`generated === delivered + undelivered + abandoned + accessRefused`
(`packages/core/src/sim/types.ts:801-802`), and **`accessRefused` riders are in neither bucket**
(`types.ts:789-790`). **Seven of eight shipped buildings declare `accessZones`**, and refusals
actually occur. So the rail prints *"All 34 people got where they were going"* while seven were
turned away at the door — the reporter's `All 34` / `41 generated` pair, exactly.

**`VizSummary` cannot see it.** `describeSummary` (`recordRun.ts:487-489`) copies only `generated`,
`delivered`, `undelivered` — neither `abandoned` nor `accessRefused` crosses into the recording.
**Interim fix with no schema change: print `${delivered} of ${generated}` unconditionally.** It
never lies; it just stops asserting a quantifier the summary cannot support.

*(The issue's "abandoned" wording is right in principle, wrong about which field bites: no shipped
building declares `sim.patience`, so `conservation.abandoned` is absent on the shipped path.)*

### The number disagreements are labelling defects, not arithmetic ones

| pair | verdict |
|---|---|
| `taking the stairs 357` vs `TOOK THE STAIRS 18` | **Legitimate basis difference, documented.** Band 4 counts people *still standing* past **120 s** (`live/bands.ts:120-128`); the tile counts legs past the **900 s** horizon (`shift/report.ts:776-782`). `bands.ts:24-30` states the distinction and shipped anyway. The defect: the band's `legendLabel` is `'gave up'` — **the report's claim attached to the band's number**. |
| `longest wait 119 s` vs `43 s` | **Three strings, two bases, one card.** The rail rows are *instantaneous at the playhead*; the driver is *whole-run within the reporting window* (`metrics/summarize.ts:1780`) — the same field the report's `WORST WAIT` uses, so driver and report agree and disagree with the rows above them. The report names its basis (`report.ts:1317-1321`); the driver names none. |

**No number is computed wrongly.** Three quantities carry one name each on one screen, and two of
the three surfaces state no basis. That is #109's real point and it survives intact.

### The honesty sweep already contains the bad string and passes

`honesty/surfaces.ts:427-430` samples at `[0, .25, .5, .75, 1]`, and **`0` is `startedAt`** — so the
corpus already contains *"All 34 people got where they were going"* at the cold-load instant and
the sweep is green. **No property refuses a whole-run claim at a playhead short of `endedAt`.**

> **This is a named gap in Phase 9's accepted verdict, found by a run.** `CLAUDE.md` records the
> honesty property holding under search — 60 cases, 271 985 strings, 0 violations. That result
> stands; what it does **not** cover is temporal honesty. Worth a decision record either way.

### Corrections to #109's own claims

1. **`completed · 41 generated · window …` is not on the rail** — it is the **canvas footer**,
   `render/canvas.ts:1780`. *(Independently confirmed during this triage, § D.)* **A rail-only fix
   leaves it on screen**, which is the sequencing point for the #105 combine.
2. **`average wait 23.5 s (over 3 rides)` is not a rail string either.** `live/noMeans.test.ts`
   asserts *mechanically* that no module in `live/` even names `meanWaitS`. It comes from
   `render/runSummary.ts#AWT_ID` via `mode/disclosure.ts`.
3. **"`delivered · All N` matches NO other figure"** — **refuted**. It matches
   `conservation.delivered` exactly, and on Chancery House it matches `carried today` at `endedAt`
   exactly. Vertical City's gap is legs-vs-journeys (transfers, and stairs journeys that have
   **zero** legs by construction — `types.ts:749-763`); Chancery's is the playhead. Not an orphan.
4. **"Stale figures survive into the next run" — refuted for the rail** (`runShift` replaces
   `state.recording` wholesale). **True for the Day report**, via a defect the issue does not
   mention: `runShift` writes `report: undefined` but leaves `filedReportInput` holding the previous
   run's input (`main.ts:2763`, `:1294-1300`), so **toggling *show energy axis* mid-run resurrects
   the previous run's filed sheet**. `main.ts:585-588` documents an invariant that is false.

### Test coverage

**Nothing compares any rail string to any report tile.** `drawDrivers` and `.mood-provisional` have
zero test references. `mountReport`'s rotation — the entire #117 mechanism — is untested. The one
correct precedent (§ D223) is well covered at `reportPanel.test.ts:445-520`.

---

## K. The tester report — provenance for wave B, and two corrections

Source: `docs/elevator-sim-playtest-report.md`, tester "Claude (Cowork)". **Read after the wave-B issues
were triaged**, and it changes two dispositions.

### It is the source document for #99–#105

Its seven numbered recommendations map **one-to-one, in order**, onto #99, #100, #101, #102, #103,
#104, #105. That settles provenance: **those seven are one author in one session, not seven
independent corroborations.** They should be weighted as a single observation, which is what the
wave rule in `ISSUE_TRIAGE_PLAN.md` § 2 already assumed.

### ✅ E-7 RESOLVED — the deployed build is content-identical to this tree

> *"playing the build at `elevsim-app.salmonstone-4576d6f7.eastus2.azurecontainerapps.io`"*

The tester played a deployment, not the local tree, which initially put every
`NOT REPRODUCIBLE-FROM-CODE` verdict in doubt. **It is now settled, from the deployment history.**

`gh run list --workflow=deploy-viz.yml`:

| time (UTC) | commit | branch | result |
|---|---|---|---|
| 02:13:46 | `2f2a7b4` | main | **success** |
| **03:02:14** | **`769eb61`** | feat/azure-app-deployment | **success** |
| 03:44:12 | `faf935b` | main | cancelled |
| 03:44:13 | `769eb61` | feat/azure-app-deployment | skipped |

**`git diff 769eb61 faf935b` is EMPTY.** `faf935b` (local HEAD, the tree every verification lane
read) is a **merge commit** — parents `2f2a7b4` and `769eb61` — whose tree is identical to
`769eb61`. **`faf935b` was never deployed, and did not need to be: it is the same content.**

**Waves B and C (#99–#119, filed 03:42–04:00) were played against `769eb61` ≡ HEAD.** So every
code-level verdict in this document is a verdict about exactly what the tester saw.

**Wave A (#90–#98, filed 03:00–03:04) straddles the 03:02 deploy** and was mostly authored against
`2f2a7b4`. The delta `2f2a7b4 → 769eb61` is **purely additive** — a new `frame/pinnedQueue.ts`
plus honesty and canvas additions, 450 insertions, 0 deletions — and touches **none** of wave A's
subject matter (menu, scenarios, free-play defaults, onboarding). #97's claim is unaffected.

> **Consequence: the refutations stand.** #99's Midtown Office default, #117's three identical
> baselines, #106's Settings symptom and #97's missing scenario list are **not** deployment
> artifacts. They are refuted against the build that was actually played.

### The Midtown Office default, reconciled

The report repeats #99's claim verbatim (*"Free play's defaults on a fresh visit are Midtown
Office … paired with Conventional collective"*), and identifies the building precisely — 1 710
people is exactly `midtown-office`. So the observation is real; only its attribution to a *default*
is wrong.

**The local tree cannot produce it as a cold default, verified two ways:**
- CLI: `elevator-sim list` orders `chancery-house` first.
- Browser: `loadBrowserResources` reads `/__buildings.json`, assembled by `readBuildings()` in
  `packages/viz/vite.config.ts:89-99`, which **sorts filenames** (`.sort()`, line 91). The
  docstring at `:31-33` states dev and deployment deliberately share this function *"because a
  manifest that was built one way for the developer and another way for the deployment is two
  implementations of one contract."* So the manifest does not explain it either.

**What does explain it:** `menu.freePlay` is **persisted** (`persist/session.ts:176`) and restored
(`main.ts:1196`), and `saveSessionNow()` fires on `closeDay()`. The tester's own scope line says
they passed through onboarding and Scenarios *before* Free play — so their session was **not
cold**, and any building they had selected once would persist into every later "fresh visit".

> **This strengthens #99 rather than dismissing it, and adds a second defect.** The shipped cold
> default is **worse** than reported (Chancery House + `nearest-car`, AWT 146.72 s, 87.7 % over
> 60 s), *and* a player's one bad selection persists silently with no way to tell it apart from a
> default. #99's disposition is unchanged; its premise correction now has two parts.

### ✗ #116's "there is no economy" is REFUTED — and #116 missed the same screen twice

#116 § 3 asserts: *"There is no economy. The Building editor's own copy says 'A smarter dispatcher
is free; a fifth shaft is not' — but a shaft **is** free, and instant."*

The tester found the economy:

> *"the **Commission the building** screen: a genuinely good capital-budget mechanic where more
> shafts, faster cars, or a taller-rated machine class each cost against a fixed 'capital unit'
> ceiling, and the choice is locked in before the week starts."*

**V-114 independently reached the same screen from the other direction** (§ F, claim (e)): the
commissioning screen writes per-bank `machineClass` **and** `ratedSpeed` **live, with no save** —
`main.ts:1477` → `state.ts:870-871` → `commissioning/building.ts:225-226`, declared a real
`between-games` control at `surface.ts:156-161`.

> **#116 missed `Commission the building` twice** — once when claiming no economy exists, once when
> claiming speed is only editable behind *Save as a new building* (#114 § "Where speed actually
> is", same omission). It is the screen that answers both complaints. **#116 § 3's "give it an
> economy" ask should be rescoped to "surface the economy that exists"**, which is a far smaller
> piece of work and changes the priority of escalation **E-1**.

### What the report adds that no issue carries

- **The Lab curriculum is the strongest thing in the product** — *"close to a genre of its own: a
  properly gamified introduction to traffic-engineering optimization."* No open issue says this,
  and #92/#113 propose changes near it. **Protect it.**
- **Free play is day-one-only by design**, *"so a leaderboard run stays replayable"* — a constraint
  #94 and #107's save-model rewrite must not break.
- **The real strategic question, stated better than #116 states it:** *"is this primarily a
  teaching tool and research sandbox … or a mass-market management-sim game that happens to be
  built on real traffic engineering?"* **This is the parent of both E-1 and E-2** and should be
  decided first — the two escalations are downstream of it.

---

## L. Deconfliction decisions taken with the user

Recorded 2026-08-07, in response to the V-112 findings.

1. **Auth token (#112 § 3): fix at the rate limiter.** The token stays in memory. Raise/reset the
   3-per-15-minute limit or add a refresh path so a reload does not burn a link. **The deliberate
   memory-only decision recorded at `account.ts:73-74` and `main.ts:1111-1113` is not reversed**, so
   no `DECISIONS.md` entry is needed to justify moving it — and #112's recommendation 3 is
   explicitly **not** adopted as written.
2. **Branching: one owner, one sequenced branch** for #106 → #111 → #97a → #112 → #113. This
   resolves the `main.ts` contention (four fixes land in that file) and enforces the
   #106-before-#111 constraint structurally rather than by discipline.

---

# Charter programme — verification wave 1

**Snapshot:** 2026-08-24, branch `claude/elevator-sim-charter-kickoff-rexfw8` at `c8fd6fa`.
`npm run build` clean. Issues #186–#252 were written from outside the tree by an evaluator who
played the deployed build; they are claims, and this wave is the check on them. `packages/viz/src/everyday/`
last changed in `dc273e6` (2026-08-13), eleven days before the issues were filed, with no
intervening commits — so the deployed build and this tree agree on everything below.

**Milestones verified first:** M2 (#206–#218), because it carries the P0s, and M0 (#186–#193),
because it is the gate everything else waits behind.

**The wave's headline is the one this project keeps recording: the issues' own claims are
frequently wrong.** Of the eleven issues fully settled here, **one is refuted outright at its
central premise** (#190), **six carry at least one false or materially misleading clause**, and
**two would have produced a worse product if acted on as written** (#190's proposed answer
contradicts a standing decision; #206's fix, applied naively, fires on run contexts that cannot
file a day).

---

## M. #206 — the core loop dead-ends. CONFIRMED at the mechanism; three claims wrong.

**Verdict: PARTLY CONFIRMED.** The defect is real, and it is two independent gaps rather than one.

| where | what it says |
|---|---|
| `packages/viz/src/everyday/stageScreen.ts:878-882` | `primary: () => { playback?.pause(); host.closeDay(); syncTransport(); }` — the whole of *Close the day*. **No `context.go(...)`.** |
| `packages/viz/src/everyday/shell.ts:965-966` | `const reached = index + 1 <= model.timeline.step; const current = index + 1 === model.timeline.step;` |
| `packages/viz/src/everyday/shell.ts:969` | `step.disabled = !reached \|\| current;` |
| `packages/viz/src/everyday/shell.ts:978-982` | `if (reached && !current) step.addEventListener('click', …)` — **no listener is bound at all** to an unreached stop |
| `packages/viz/src/everyday/actionBar.ts:209` | daily stage row: `timeline: { flow: 'daily', step: 3 }` |
| `packages/viz/src/everyday/actionBar.ts:233-243` | daily report row: `step: 4` — step 4 exists only on the report screen's own row |
| `packages/viz/src/everyday/stageScreenModel.ts:501-513` | `stageBarModelOf` on `dayClosed` edits `primary` and `note` only; `timeline` passes through untouched |
| `packages/viz/src/everyday/weekScreen.ts:127-142` | `'How it went ›'` → `context.go('report')` — with the timeline stop, one of only **two** producers of `go('report')` in the tree |
| `packages/viz/src/everyday/dailyLoop.browser.test.ts:164-172` | *"Close the day, then come back through Your week — which is the loop's tail as this build has it"* — **the existing journey test routes around the defect and says so** |

**Verified independently by the orchestrator**, not only by the verification lane: the three
mechanism sites above were re-read directly. On the stage `timeline.step === 3`, so breadcrumb
step 4 evaluates `4 <= 3` false, is therefore `disabled`, **and never has a listener attached**.
It is inert on both counts, in every state, by construction.

**Root cause — two gaps, both needed.**
1. **No navigation on filing:** `everyday/stageScreen.ts:878-882` is the function that should
   navigate and does not.
2. **No route to an unreached stop:** `everyday/shell.ts:965-982` enables a stop by *position in
   the timeline*, never by *whether the destination has anything to show*, and nothing ever raises
   `timeline.step`.

The handoff's intended behaviour **is** implemented — `dev/main.ts:5539-5541` auto-opens the report
— but into `ViewerState.tab`, which only the covered Engineer shell reads. The Everyday shell has no
equivalent.

**What the issue got wrong.**
1. *"the label changes to 'the day is filed, its report is written'"* — the **label** does not
   change; it stays `Close the day`. The **note** cell changes, and the real string uses an em dash:
   `'the day is filed — its report is written'` (`stageScreenModel.ts:506`). An engineer grepping
   for a label change finds nothing.
2. *"reachable only by leaving the mode entirely"* — false. `shell.ts:581-584`'s `go()` preserves
   `ctx` and the rail is drawn on every screen, so *Your week* is a sidestep **inside** the mode.
   Only `requestLeave`/`doLeave` (`shell.ts:594-613`) clear `ctx`.
3. *"the same check applies to Campaign and Fix a building, since both share the filing path"* —
   **half wrong, and it is the load-bearing half of AC4.** Campaign shares it exactly (same
   `STAGE_SCREEN`, same `primary`, `timeline: {flow:'campaign', step:4}` against a report at step 5
   — identical defect). **Fix a building shares nothing**: `fixitScreen.ts` never calls `closeDay`,
   never calls `go`, runs `runFixitPair(plan)` in-screen, and its bar row (`actionBar.ts:309-321`)
   has no `timeline` and no `back`. There is no report screen and no breadcrumb to fix.

**Blast radius.** Daily and Campaign, one code path (`STAGE_SCREEN`, `screens.ts:124`). Fix a
building unaffected.

**Risk if fixed naively — this is why the fix is not a one-liner.**
- `stageScreen.ts`'s `primary` is **one function for all four run contexts**. A blanket
  `go('report')` fires on the rush stage (primary *End the rush*; its report row has no timeline)
  and on the watch stage, where `closeShift` refuses via `bankingRefusalFor`
  (`dev/main.ts:5322-5327`) — landing the player on `NOTHING_FILED_YET` after a press that promised
  a sheet.
- `closeShift` has **three silent early returns** (`dev/main.ts:5297, 5313, 5323`). Navigating on
  the *press* rather than on the *outcome* converts each into an empty report. The fix must re-read
  `host.runState()` / `host.lastReport()` and navigate on the confirmed file.
- `actionBar.test.ts:78,88,108,119` pins stage→3 and report→4/5, so **raising the step number is
  not available**; the guide's table wins. The *disabled state of a forward stop* is unpinned, and
  is the free surface.
- **Already live and directly on this route:** the report row's `back: {label:'The day',
  screen:'stage'}` (`actionBar.ts:237`) re-mounts the stage, and `stageScreen.ts:862` runs
  `if (!host.runState().open) host.startRun();`. After filing, `open` is false — so **`‹ The day`
  starts a brand-new run** instead of returning to the day just read about. Closing the stage↔report
  loop makes this reachable in one more place.

**The corpus cannot catch this class.** `honesty/surfaces.ts:7391-7399` seeds the timeline stop
**labels** as `role:'label'`. A button that is drawn, labelled truthfully, and navigates nowhere
produces no dishonest string. **No property in `honesty/` can catch a navigation dead-end** — which
is precisely why T1 exists and why it is the first journey test to build.

---

## N. #207 — the front door sells the absences. CONFIRMED and UNDERCOUNTED; three claims wrong.

**Verdict: PARTLY CONFIRMED.** The registers exist, are drawn on player surfaces, and are written
in internal notation. **Full tally: six surfaces, 27 register entries, 17 carrying a `§` or a code
identifier** — the issue names four surfaces.

| where | what it says |
|---|---|
| `packages/viz/src/everyday/shell.ts:90-154` | `EVERYDAY_SHELL_ABSENCES` — 5 entries, **5 of 5** open with a `§`; one carries `` `dev/reportPanel.ts#LEVER_SURFACES` `` |
| `packages/viz/src/everyday/shell.ts:1130` | `'What this build does not do yet'`, rendered caps by `screenDom.ts:47`'s `EYEBROW` |
| `packages/viz/src/everyday/stageScreenModel.ts:454-459` | `STAGE_ABSENCES` — 4 entries, 3 carry `§` |
| `packages/viz/src/everyday/settingsView.ts:143-149` | `SETTINGS_ABSENCES` — **exactly 6**, 1 carries `§` |
| `packages/viz/src/everyday/settingsView.ts:209-223` | `playing.rows` — **one** live toggle, against those six refusals |
| `packages/viz/src/everyday/rushScreenModel.ts:211` | `absencesEyebrow: 'WHAT THIS BUILD DOES NOT DO YET'` — literal caps in source |
| `packages/viz/src/everyday/designerModel.ts:95` | `'WHAT THIS DRAWING BOARD DOES NOT DO'` — 5 entries, **5 of 5** carry `§` |
| `packages/viz/src/campaign/career.ts:171-175` | `CAMPAIGN_ABSENCES` — 3 entries, **0** carry any notation |

**Root cause — not a bug, a documented decision.** `shell.ts:1119-1126`: *"A register of what a
build does not do is worth exactly as much as the number of people who read it, and a constant no
renderer touches is read by nobody — which is the shape `deadCode.test.ts` caught this array in on
its first run, before this function existed."* **The registers were put on player surfaces because
a dead-code audit flagged them as unread.** The issue is right that the problem is placement; it is
arguing against a decision, not reporting a defect.

**What the issue got wrong.**
1. *"The first thing a new player reads on the main menu"* — false. `shell.ts:1100-1116` appends
   h1 → lede → four tiles → **then** the register. Its own docstring says *"Putting it under the
   tiles"*.
2. *"occupying more vertical space than the four mode tiles combined"* — **not reproducible from
   source and probably wrong**: register ≈ 250 px against four tiles ≈ 390 px at a shared
   `max-width:640px`. It **is** the largest single contiguous text block by character count
   (1 122 vs ~490). Settling it needs a browser measurement.
3. *"the same block appears on … the brief"* — **false.** The brief has no register. It has
   per-control refusal cards (`briefView.ts:185, 224`) carrying no section number, no filename and
   no identifier — **which is exactly the shape the issue's own AC4 asks for.**
4. **Three surfaces missed** — the rush setup screen, the drawing board and the campaign triage
   screen also ship the register. AC1 is scoped to four surfaces and needs six.
5. **The notation is not uniform**, and the counter-example matters: `CAMPAIGN_ABSENCES` is three
   entries of plain English with zero notation, and 5 of 6 settings entries are the same. **AC1 can
   be met by rewriting 17 strings** without touching the mechanism or the guarantee.

**Constraint that binds the fix.** `packages/viz/src/deadCode.test.ts` — an array no renderer touches
is what put these on player surfaces originally, so a build-information panel must be a **real
non-test caller of all six arrays**, or the audit re-fires. This is the standing requirement pointed
directly at the proposed fix.

**Corpus note.** Every register's **entries** are swept, all as `role:'reason'` — the role the rules
**exempt from R3** — so no honesty property could ever have flagged this content. **Three register
headings are outside the corpus** (`shell.ts:1130`, `stageScreen.ts:563`, `campaignModel.ts:323`).
A heading the search has never read is a finding in its own right.

**Adjacent finding, in no issue — a false mechanism on a player surface.**
`settingsView.ts:236-243` draws *"Every run you post is re-simulated by the server before it appears
on a board. It cannot be turned off…"* while `EVERYDAY_SHELL_ABSENCES[2]` (`shell.ts:124`), two
blocks above, states this build **has no server**. A `THIS DEVICE` fact asserting a server-side
mechanism on a build with none, two screens from the register that denies it. It is inside a swept
adapter but lands on a role the mechanism-claim properties do not interrogate.

---

## O. #190 — the positioning question. **REFUTED at its central premise.**

**Verdict: REFUTED.** #190 states *"That question has never been answered in writing."* **It was
answered on 2026-08-08.**

| where | what it says |
|---|---|
| `docs/elevator-sim-playtest-report.md:58` | the question, as the outside playtest posed it |
| `DECISIONS.md:21160` § D299 | titled *two products, one engine*; labelled **"the positioning decision, taken by the product owner, and the parent of every design issue in the #90–#119 backlog"**; quotes the question verbatim and answers it: *"**The answer is neither of the two the report offered. It is an explicit split: two products over one engine.**"* |
| `DECISIONS.md:21303` § D301 | the follow-on thesis |
| `docs/21-engineer-reimagined-contract.md:14` | *"The binding test is § D299 § 1's, and every section below answers to it"* |

**Why this matters more than a wrong sentence.** #190's own proposed answer — *"The Engineer surface
is a depth setting on the same product, never a second product"* — **directly contradicts § D299**.
Acting on #190 as written would have silently reversed a product-owner decision that six sections of
`docs/21` (lines 14, 54, 321, 449, 454, 815, 829) and `DECISIONS.md:21244` are built on, without
anyone noticing that a supersession was happening.

**#190 remains actionable, but as a supersede, not a first answer**, and its blast radius is far
larger than its body implies. **Escalate:** superseding § D299 is a product-owner decision, not an
orchestrator one.

**#186's own framing survives, though.** `docs/00-project-brief.md` uses the word *game* **zero**
times (positive control: `elevator` returns 8, so this is not a silent-search miss — the R24 class),
and its five success criteria at `docs/00:42-53` are all engineering criteria.

---

## P. #193 — the risk register. CONFIRMED, and **materially understated**.

**Verdict: CONFIRMED; scope too narrow.**

| claim | verdict | evidence |
|---|---|---|
| `RISKS.md` holds a single eight-row wave-scoped table | CONFIRMED | `RISKS.md:3-12`; **no ID column at all**, so the "stable row identifiers" criterion is well-founded |
| `WAVE13_PLAN.md` still references R24, R25, R26 | CONFIRMED | `WAVE13_PLAN.md:108-111` |
| those rows are not in the file | CONFIRMED | `RISKS.md` contains no `R<n>` token anywhere |
| "the register was rewritten and the project-level rows were lost" | **CONFIRMED and understated** | not three rows — **all 29** |

**The overwriting commit is `1b7a2f1`** (mrpeanut01, 2026-08-12), *"chore(design,plan): vendor the
full Casual prototype and open the orchestration wave"*. It removed 123 lines of `RISKS.md` and
added 12. **No note was left saying the project register had been dropped.** Everything is
recoverable: `git show 1b7a2f1^:RISKS.md`.

**R24, R25 and R26 are recovered in full** and are reproduced in the lane record; each is a
realised, closed-at-the-cause risk with a named escalation trigger. R24 in particular — *a search
tool that fails silently makes every negative finding unreliable* — is the reason this ledger
treats a bare "nothing does X" as evidence about the tool as well as the tree.

**Four more rows the file itself declared permanent were lost with them**: R1 (the dead-seam class),
R5 (statistical nonsense), R7 (an agent reports a green suite that is red), R10 (scope pressure
weakens an acceptance criterion). `RISKS.md:96-97` read *"Still live and permanent: R1, R5, R7,
R10"*. Three further rows the file declared project-level — R27 abandonment flatters AWT (since
discharged by wave 13's fifth `awtIsValid` ground), R28 variance leaking outside the shared trace,
R29 two traffic models — were lost undischarged for R28 and R29.

**The dangling-citation surface is larger than #193 states: six ids across eleven sites.**

| id | citing sites |
|---|---|
| R9 | `docs/09-destination-dispatch-contract.md:24` and `:1027`, `docs/11-twin-shaft-contract.md:863` |
| R17 | `DECISIONS.md:9124`, `:9149` |
| R22 | `DECISIONS.md:4244`, `docs/05-roadmap.md:1552` |
| R24 | `WAVE12_PLAN.md:64`, `WAVE13_PLAN.md:108` |
| R25 | `WAVE12_PLAN.md:57`, `WAVE13_PLAN.md:108`, `WAVE13_RESUME.md:191` |
| R26 | `WAVE13_PLAN.md:109` |

`docs/09` is the worst: **its opening sentence justifies the document's existence by a register row
that no longer exists.**

**And the defect is a class with four members, not one.** The same commit replaced four
project-level registers with wave-scoped boards in one sitting:

| file | before | after |
|---|---|---|
| `AGENT_STATUS.md` | 1 047 lines | 17 |
| `TEST_MATRIX.md` | 383 | 28 |
| `MULTI_AGENT_PLAN.md` | 375 | 82 |
| `RISKS.md` | 123 | 12 |

The `MULTI_AGENT_PLAN.md` instance is restored byte-identical at `MULTI_AGENT_PLAN-waves-1-4.md`,
because rewriting that path for this programme is what surfaced the class. **The other three are
left for #193**, whose scope should be widened to all four.

**The old `TEST_MATRIX.md` was a different document with the same name** — a project-level ledger of
integration, e2e, unit and mechanical rows across six sections, with a regression set marked *must
stay green through every merge*, and two hard-won rules: *a fixture-only row is not a covered row*
(wave 11) and *a control-only row is not a covered row either* (wave 13). The current file is a
21-row journey matrix, a narrower scope. **The journey gap the charter names is real and this does
not soften it** — but #237 should begin by recovering the ledger rather than assuming the tree
carries no coverage record.

---

## Q. M0's remaining premises — four more claims that did not survive

| # | claim | verdict | evidence |
|---|---|---|---|
| #189 | *"docs/10 observes the lesson without saying which lesson or where"* | **REFUTED** | `docs/10-experience-layer-contract.md:699-711` states it exactly (SimTower's elevator micromanagement became unwieldy at scale; Project Highrise abstracted elevators away) and cites its source |
| #189 | *"No competitive analysis exists in the repository"* | **PARTIALLY REFUTED** | `docs/10:673-770` § 3 is a cited four-title prior-art survey (Mini Metro, SimTower, Project Highrise, Factorio) with 13 sources at `docs/10:2402-2419`. **No teardown against a common template exists** — that half is true. Elevator Saga, Mini Motorways, Two Point Hospital, Opus Magnum and Shapez appear nowhere in the tree |
| #191 | *"no written statement of what the player actually does"* | **PARTIALLY REFUTED** | `README.md:14-24` is a five-step player loop; `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md:249-254` carries a **per-mode** loop table with lengths and lose-conditions — in the document `CLAUDE.md` makes canonical for the interface. The charter's loop statement must reconcile with that table, not silently replace it |
| #188 | *"…without ever having written down who they are"* | **PARTIALLY REFUTED** | `packages/viz/UX.md:757-764` defines four roles (Analyst, Designer, Reviewer, Newcomer) with goal and failure-cost; `:82-89` adds a fifth (Operator). Not two market audiences and not in `docs/`, but not blank. **If the charter defines two audiences without reconciling the five roles, the repository acquires the stale-statement defect class it exists to record** |
| #194 | *"twenty-two numbered design contracts in `docs/`"* | **IMPRECISE** | 23 files carry an `NN-` prefix; **22 distinct ordinals**, because `16-` is used twice (`16-change-scope-contract.md`, `16-static-site-deployment.md`) |
| #192 | playability excluded from the Phase 9 criterion as unfalsifiable | **CONFIRMED, two sources** | `docs/05-roadmap.md:1996-1999` (verbatim) and `DECISIONS.md:10066-10069` inside § D163 |

**Two drafting notes for #192.** § D163's own text (`DECISIONS.md:10068`) says *"three of seven
stages clear from the dispatcher dropdown alone"* while `docs/05:1998` says *"four of seven"* —
#234 accounts for this as a correction upward, so quote `docs/05`. And § D163 excludes playability
**alongside feature completeness** (`DECISIONS.md:10061-10064`); #192 should say whether that second
exclusion also survives.

---

## R. Two defects in `DECISIONS.md` itself, found while checking the numbering

1. **`## D63` is a duplicate heading** — `DECISIONS.md:1888` (*"Pre-existing failure this branch did
   not cause — HANDBACK"*) and `:1904` (*"`VIZ_SCHEMA_VERSION` 2 → 3"*) are **two distinct
   decisions sharing one number**, so a `§ D63` citation is ambiguous.
   `validation/citations.test.ts` asserts a `§ Dnnn` **resolves to a heading**; it does not assert
   the heading is **unique**, which is why nothing caught it. (`D125` at `:5622`/`:5653` is *not* a
   collision — the first is a preface.)
2. **The gap note at `DECISIONS.md:16` is stale.** It reads *"142 entries span D1–D149"*. Measured:
   **334 `## D<n>` headings carrying 332 distinct numbers, spanning D1–D341.** The nine documented
   gaps (D44, D55, D78–D84) are confirmed absent and **no undocumented gap exists**.

**Next free decision number: D342.**

## S. #208 — the first session presents no problem. CONFIRMED in conclusion; two figures are seed-lucky.

**Verdict: PARTLY CONFIRMED.** The conclusion is sound and is corroborated inside the tree. Two of
the issue's four numbers are properties of a *distribution* stated as constants.

**Shipped day-one configuration, traced** — and it is not an array-index accident:

| axis | value | file:line |
|---|---|---|
| building | `garden-apartments` = `CONTRACTS[0].buildingId` | `dev/state.ts:987`; `shift/contracts.ts:70-71` |
| dispatcher | `collective` via `PREFERRED_VIEWER_DISPATCHERS[0]` | `dev/state.ts:988,1079`; `dev/defaults.ts:56` |
| duration | **3600 s** — the only contract naming its own hour | `dev/state.ts:1010`; `shift/contracts.ts:93` |
| seed | **`randomSeed()` — non-deterministic per load** | `dev/main.ts:698, 7003` |
| day-1 event | `ordinary` → `NO_EFFECT`, no car held, 2 working cars | `shift/events.ts:196-208, 233-239` |
| day-1 growth | factor exactly `1` | `shift/growth.ts:75-77, 86-88` |
| report window | **`full-run`**, set explicitly | `dev/state.ts:1411, 1469` |

**Substitution stated: the shipped seed is random, so there is no single day-one run to reproduce.**
Swept **100 consecutive seeds** at the exact configuration:

```
node packages/cli/dist/index.js run --building garden-apartments --dispatcher collective \
  --seed <20260804..20260903> --duration 3600 --window full-run --no-color
```

| figure | min | median | mean | max |
|---|---|---|---|---|
| arrivals over the hour | 20 | **40** | 40.2 | 67 |
| AWT (s) | 6.72 | 15.68 | 15.83 | 23.02 |
| worst wait (s) | 19.8 | **31.4** | 37.4 | 72.4 |
| % waits over 60 s | 0.0 | 0.0 | 0.38 | 9.1 |

`AWT SUPPRESSED: 0 of 100`. `undelivered > 0: 0 of 100`. Worst wait ≤ 60 s on **91 of 100**.

**What is true.** Six floors, 120 people, two lifts (`data/buildings/garden-apartments.json:8-26`).
*"Forty-four journeys"* — median 40, mean 40.2; correct as a typical day. *"Worst wait thirty
seconds"* — median 31.4 s, modal 29.3 s; correct as a typical day. **The brief's grading copy is
real and exact**: `everyday/today.ts:225-236` computes `perCar = 120 / 2 = 60` and picks
`Comfortable` because `60 <= COMFORTABLE_PER_CAR = 400` (`today.ts:62`) — **and the 400 is not
measured**, it is a citation to the design prototype, which the docstring says outright.

**The conclusion is independently corroborated inside the tree**, which is the strongest part of
this finding: `dev/defaults.ts:72-79` already measured Garden Apartments and **rejected it as the
Free Play opener** — *"serves 2 to 8 riders in the reported window across six seeds"*, `WT95 == AWT`
on three, and *"`nearest-car` and `collective` return the same numbers"*.
`data/buildings/garden-apartments.json:29` measures **8 of 78 ordered dispatcher pairs bit-identical
on the legs**. `docs/10-experience-layer-contract.md:940-943`: *"no shipped dispatcher profile clears
stage 1"*.

**What the issue got wrong.**
1. *"Every rider was away inside a minute"* is **a property of most days, not of day one**. The seed
   is random, and **9 of 100** first loads already produce a wait over 60 s, reaching 72.4 s worst
   and 9.1 % of riders over a minute.
2. **The tail seeds do separate the dispatcher menu.** At seed 20260833 (63 arrivals) `nearest-car`
   gives 194.0 s worst wait and 23.8 % over a minute against `collective`'s 67.3 s / 1.6 %. So
   *"nothing can be learned"* is true of the median day and false of the top decile — **which makes
   a seed policy a candidate fix the issue does not consider.** (Single replications, a data point
   each; not a dispatcher ranking.)
3. *"The deepest queue was five"* is **not reproducible from the CLI** — it is a viewer-side figure
   from `Observations` sampling (`shift/report.ts:1215-1218, 1400`). Reported as unverified rather
   than guessed at.

**Root cause: not a defect.** `data/buildings/garden-apartments.json:29-30` states the sparseness is
**the building's purpose** — *"parking policy dominates here precisely because traffic is too thin
for assignment cleverness to matter"*. The building is correct; **putting it in the tutorial slot is
what produces the empty first session.**

**The fix is a slot decision, not a data one**, and the building file forecloses the other route in
capitals: *"NOTHING IN THIS FILE IS THE RIGHT PLACE TO FIX THAT."* Raising Garden's arrival rate past
the `residential` profile's declared `max: 7` would invent a CIBSE-unsupported rate — barred by
`CLAUDE.md` § Reference data and by #208's own scope sentence (*difficulty is demand and building
fabric*). Candidates: move `CONTRACTS[0]`/campaign stage 1 off Garden (`dev/defaults.ts:80-84`
already measured Chancery House as the building where the dispatcher axis is most legible); or open
Garden under a **booked event** rather than an ordinary day, machinery that already exists
(`shift/events.ts`, `shift/incidents.ts#carsToDerate`); or stop drawing a random seed for the
first-ever load, so the first session is not a lottery over the distribution above.

---

## T. #209 — the tutorial building refuses both headline numbers. **REFUTED — fixed 13 days before the issue was filed.**

**Verdict: REFUTED on this tree.** All four of the issue's acceptance criteria are already met.

The issue's central factual assertion, quoted from `docs/20-everyday-playtest-audit-2.md:83`, is
**"The shift path sets no `reportWindow`."** That has been false since commit **`e6a1a3d`**
(2026-08-11 16:24), *"the honest reporting window per building"* — confirmed an ancestor of HEAD.
**Issue #209 was filed 2026-08-24.** The decisive line is `dev/state.ts:1411`:

```ts
const reportWindow = shiftReportWindowFor(authored.id);
```

carried onto the config at `dev/state.ts:1469`, implemented at `shift/reportWindow.ts:109`. For
`garden-apartments` it returns **`'full-run'`**.

**Measured, the same 100 seeds, both windows:**

| window | AWT suppressed | band held 0 arrivals | arrivals measured over |
|---|---|---|---|
| **`full-run`** (shipped today) | **0 of 100** | n/a | all of them, 20–67 |
| template band (pre-fix behaviour) | 1 of 100 | 1 of 100 | 0–25, median 6, of a day averaging 40 |

On the five seeds `shift/reportWindow.test.ts:117` pins as the defect's own population, the CLI
reproduces both halves exactly: all five **suppress** under the template band with `0 arrived` while
32–51 riders rode the day, and all five **publish** under `--window full-run`.

**The refusal ground, named:** `empty-window` — the **second** of the five in
`packages/core/src/metrics/awtValidity.ts:150-153`, `fires: evidence.waiting.count === 0`. Not
saturation, not censoring, not the 900 s horizon, not abandonment (`patience: null`, 0 undelivered
on 100 of 100).

**The two readings, distinguished — this is the part worth keeping.**
- **Reading A — the refusal was on a false ground.** FALSE, and always was. The window genuinely
  held zero arrivals; `empty-window` fired correctly and said so correctly. **Nothing was fixed by
  moving a bound.**
- **Reading B — the refusal was true about the wrong window.** TRUE, and that was the defect. A
  fixed five-minute band at a fixed position is the wrong *instrument* for a building whose whole
  day is forty arrivals. The fix chose the window from a measurement the repo already owned, and
  `shift/reportWindow.ts:109-115` requires **unanimity** across a building's matrix cells, so
  Midtown Office deliberately does not move.

**Root cause of the issue itself: it treats `docs/20`, a dated audit, as live status.** This is the
repository's own *"a published number goes stale"* failure mode applied to a **defect list**. Cheap
mitigation: `docs/20`'s entries carry no *fixed-in* marker, so a reader cannot tell an open defect
from a closed one — `shift/reportWindow.ts:1-2` names *"docs/20 defect 5"*, but the pointer runs
only one way.

**One genuine residual, on a path the issue does not name.** The **campaign** path sets no
`reportWindow`: `campaign/stageRun.ts:62-75` and `:110-125` both omit the field. Measured at the
stage-1 configuration over 50 consecutive seeds from the stage's own `20260730`: **the template
`peak-5min` band held zero arrivals on 2 of 50, and AWT suppressed on 2 of 50**, mean 11.4 arrivals
per 900 s. Seed 20260730 itself is one of the two — `0 arrived`, `AWT SUPPRESSED`, on a run that
delivered 10 of 10.

**Cost of closing it, stated before anyone starts:** it is one call, but `data/scenario-goals.json`
holds pass **counts** measured under the current window and `campaign/judge.ts` refuses to judge
when the baseline arm does not reproduce its published count. **Re-windowing the campaign
invalidates that table** and needs regeneration via `scenario/regenerate.test-helper.ts`. That is a
bigger change than #209 describes and **should be its own issue**.

---

## U. #210–#218 — the nine remaining M2 issues

**#212 (P0, "rebuild the stage so the crowd is visible") — REFUTED as stated, and this is the
largest scope change in the wave.** People, doors and queues **are all drawn** on the shipped
Everyday stage: `stageScreen.ts:228-253` draws one capsule per waiting rider coloured by wait age
via `stageInkFor`, `:268-273` draws door leaves, `:276-288` draws up to nine rider marks inside each
car, and `:290-301` draws the `0/10` occupancy label the issue itself quotes — which proves the
reporter was on this screen. Two real causes, both narrow:
1. **The stage opens paused at 06:00** (`stageScreen.ts:636-638`). At that instant nobody has
   arrived, so the true picture *is* an empty building.
2. **A shut car is painted entirely amber.** At `doorFraction = 0`, `leaf = (width−3)/2` — the full
   half-width — so the two `C.sun` leaves paint over the whole `C.ink` body. **Door state is drawn
   and is invisible in the state a car spends most of its time in.** These are the "pale yellow
   bars" the issue describes.

**This is a door-fill inversion and an opening-playhead decision, not a renderer rebuild.**

**#213 — CONFIRMED and worse than reported.** `everyday/reportScreen.ts:266` renders a button
labelled `` `Open the simulator's ${panel} panel` `` — and `:280-282`'s handler is
**`context.go('stage')`**. That was correct when `stage` meant *hand off to the Engineer surface*;
§ D335 (`screens.ts:35-41`) made `stage` the Everyday day stage and **this call site did not move**.
The button promises a panel it does not open — a *label describing a feature that does not exist*,
a charter non-goal. Second finding: `shell.ts:152` tells the player *"the report's **four** lever
cards **each** route to the Engineer panel … which is what `dev/reportPanel.ts#LEVER_SURFACES`
names"*. `LEVER_SURFACES` names **two** (`reportPanel.ts:243-246`), and the other two are absent **by
argued decision** (`:231-237`: routing dispatcher advice off one replication is `docs/10` R2).
**The issue's own criterion — "every lever opens what it names" — would ship a non-goal violation if
taken literally.** Only *add a car* and *zone the tower* may ever be routed.

**#214 — CONFIRMED, and the root cause is the more serious half.** `rail.ts:235` reads
`options.profile?.streak ?? 'no days saved yet — this build keeps no career'`, and **no producer in
the tree ever supplies `streak`** — `shell.ts:642-647` is the only `railModel` caller and passes
`{name, avatarColor}` only; `profile.ts:57-61` has **no field for it**. So the rail is not *stale*,
it is **unconditional**: that sentence is the only string the line can ever render, and it will keep
saying it after a hundred days. This is a control-that-writes-nothing with its polarity reversed —
**a refusal nothing can retract**. The week screen reads a different store entirely
(`persist/types.ts:82`), and both strings are drawn on the same frame.

**#215 — CONFIRMED in effect; the stated mechanism is wrong in a way that matters.** The counter
does **not** increment on navigation — that path was closed by § D232 (`dev/main.ts:3386`). It
increments **once per close** (`shift/week.ts:395`). The real mechanism is one step back:
`everyday/stageScreen.ts:862` runs `if (!host.runState().open) host.startRun();` on mount, and after
a close `open` is false — so **re-entering the stage silently starts a new run**, bit-identical
because the seed is unchanged (`dev/state.ts:1431`), which the Engineer's tick then auto-files
behind the cover (`main.ts:4153`). Report → stage → report yields *attempt 2* with the player having
asked for nothing and nothing having changed. `week.ts:288-304` already has the right exemption
(`recordGrew`) for exactly this class and it is not applied here.

> **CORRECTED 2026-08-24, by the lane that fixed it.** Step 5 above — *the Engineer's tick auto-files
> it behind the cover* — is **wrong**. `dev/main.ts`'s `tick` files only while `state.tab === 'run'`,
> and the first file switches that tab to `report`. The lane polled the host for **150 s** after
> re-entry and never saw `attempt` reach 2, with `dayClosed` false throughout and the second playback
> long past its end. **The count climbs by the other half of the same defect**: the silent re-run
> makes § 3.3's primary pressable again over a day already finished, so *"attempt 4"* is **four
> presses of *Close the day* against one press of *Run***.
>
> Same root cause, same fix, wrong intermediate step — and it is recorded because a verification that
> quietly drops its wrong steps is worth less than one that keeps them. The chain was traced
> statically and read plausibly; it took driving the product for 150 s to find that one link does not
> hold. **That is the verification wave's own rule turned on the verification wave.**
>
> The fix chosen was **not** `recordGrew`. That exemption is refuted by pins that already exist:
> `week.test.ts:576` is a deliberate negative control asserting a re-close of a byte-identical
> `DayOutcome` **does** count, and `closeDay`'s docstring says why — *a retry of an unchanged
> selection reproduces the same `{seed, config}` too, so intent is the only discriminator there is.*

**#216 — CONFIRMED exactly.** `shift/events.ts:196-199` hard-codes
`name: 'An ordinary Tuesday-shaped day'`; `:234-241` maps day 1 → slot 1 → `ordinary`;
`shift/types.ts:76-84` makes day 1 **Monday**. Both strings come from **one function call**
(`everyday/today.ts:272-273`), so this is one record carrying a contradiction, not two components
disagreeing. A weekday hard-coded in a **code** constant rather than in `data/` — a `CLAUDE.md`
invariant 7 case, and the precedent is already set two entries above it (`events.ts:166-171` stripped
an hour from *"Fire drill, 14:00"* for the same reason). **One string literal; the cheapest
confirmed fix in the set.**

**#211 — PARTLY CONFIRMED; both word counts overstated.** The closing block is one unbroken
paragraph (`everyday/reportScreen.ts:333-334`) — but it is **338 words** in the Casual register the
reporter saw and **218** in the Engineer one, not *"roughly four hundred"*. The stairs card is
**70 words** on a zero-abandonment day, not *"roughly a hundred and twenty"* — overstated by ~1.7×.
The fix must land in the two **views**, never in `shift/report.ts`, and `reportPanel.ts:1461`
requires `shaped.smallPrint` to sit between lead and reach **byte for byte**.

**#210 — CONFIRMED as an absence.** No first-run experience exists; no `onboarding`/`coach`/
`firstRun` module is in the tree. *How to play* is three navigations deep, ending in a `<details>`
inside the **Engineer** menu (`dev/menuPanel.ts:868-896`) — the surface a new player is deliberately
kept off. One misattribution: the quoted phrase *"onboarding is effectively absent"* appears in **no
document in this repository**.

**#217 — NOT-A-DEFECT (positioning proposal); its two mechanical criteria are half wrong.** Fix a
building is 4th of 4 in `everyday/modes.ts:120-134` and tiles draw in array order — true. But the
*"stale refusal"* it asks to remove **never renders**: `unlessBuilt` (`modes.ts:30-32`) returns
`undefined` because `fixit` is registered. And *"the count in the same file's docstring is
corrected"* — **the docstring is already correct** (`modes.ts:43` says eighteen); the **inline
comment** at `:126` is the one still saying three. Acting on the criterion as written edits a line
that needs no edit and leaves the one that does.

**#218 — NOT-A-DEFECT (process); duplicates the M2 milestone definition, and one of its exit
criteria is already failing.** The criteria it lists are `CHARTER_PROGRAMME.md` § M2 almost verbatim.
It also cannot be scheduled: its entry criteria depend on #198, and M1 is not open. **But its
criterion 3 fails today** — `EVERYDAY_SHELL_ABSENCES` is rendered to the player at `shell.ts:1134`
and contains `§ 6.5`, `§ 3.2`, `§ 14`, `§ 12.2`, `§ 9`, a source filename and two code identifiers.
`honesty/surfaces.ts:7271` already drives that array, so the mechanical check can be an **eighth
honesty property with no new plumbing** — and it is cheap, already specified, and red now.

---

## V. What this wave found that no issue carries

1. `everyday/reportScreen.ts:281` — the lever button's target is the **Everyday stage**, not the
   Engineer Building panel its label names. § D335 redefined the `stage` key underneath the call
   site.
2. `everyday/shell.ts:152` — the shell register makes a **false statement about `LEVER_SURFACES`**
   ("four … each route"; it is two, deliberately), on a string drawn to the player.
3. `everyday/rail.ts:235` — the streak refusal is **unconditional**, not stale.
4. `everyday/stageScreen.ts:268-273` — a car with shut doors is painted **entirely amber**.
5. `everyday/stageScreen.ts:862` — re-entering the stage after a close **silently re-runs a
   bit-identical day**.
6. `everyday/settingsView.ts:236-243` — a **false mechanism on a player surface**: *"Every run you
   post is re-simulated by the server"* two blocks below a register stating this build has no server.
7. `campaign/stageRun.ts` sets **no `reportWindow`** — #209's defect, still live on the campaign path.
8. **`## D63` is a duplicate heading**, and `DECISIONS.md:16`'s gap note is stale
   (*"142 entries span D1–D149"* against 334 headings spanning D1–D341).

## W. The "four of ten stages clear from the dispatcher dropdown alone" claim — misattributed and stale twice over

**It is not in #208.** The body was fetched, its comments are empty, and a repository issue search
for *dropdown* returns 0. Its real home is `docs/10-experience-layer-contract.md:1680-1694`, and
there it says **four of *seven***.

- **The denominator is stale.** `docs/10:918-936` lists a seven-stage progression; `data/campaign.json`
  and `data/scenario-goals.json` both ship **ten**.
- **The numerator is stale, and the tree already says so.** `campaign/campaign.test.ts:1023` now
  asserts **stage 6 is not clearable** by any shipped profile and `:791-797` asserts **nothing clears
  stage 4** — both attributed to § D254 — while `:740` asserts stage **5 now does**. Two of the
  doc's four named clearers have flipped and one new one appeared since 2026-07-29.

**This matters because it is success criterion S5**, and S5 is an M4 exit gate. **Not checkable
statically** — `verdict.cleared` needs a paired interval over the stage's replications. The sweep
that would settle it: for each of 10 stages × the 13 profiles `campaign/dimensions.ts#admitProfile`
admits, run `batchRequestForStage` at 2 arms × 50 replications under CRN — an upper bound of
**~13 000 simulations**. `campaign.test.ts` already runs exactly that sweep **for stages 4, 5 and 6
only**. **No test derives the count across all ten, which is why the published figure went stale
twice without failing anything.** Deriving it from the categorical is the fix, and it is S5's
instrument.


---

## X. #206 — the fix, and the test watched failing before it landed

**Recorded by the orchestrator directly**, on 2026-08-24, because *a test nobody has watched fail is
not yet a test* and this repository has already found six tests that could not fail, by five
different mechanisms. The FIX-206 lane produced the fix and the tests; the failure and pass below
were re-run and observed here rather than taken from its report.

### Watched failing — the fixed sources reverted to `a1841fa`, the new tests kept

```
git checkout a1841fa -- packages/viz/src/everyday/{stageScreen,shell,stageScreenModel,actionBar}.ts
ELEVATOR_SIM_CHROMIUM=/opt/pw-browsers/chromium npx vitest run --project viz-browser \
  packages/viz/src/everyday/dailyLoop.browser.test.ts \
  packages/viz/src/everyday/stageScreen.browser.test.ts
```

```
× files the day on § 3.3's own primary and lands on the report — no rail detour
× closes the day, and leaving afterwards does not warn
× lights the report stop once the day behind it is filed, and it goes there
× files a campaign day on the same primary and lands on the campaign report

Test Files  2 failed (2)
     Tests  4 failed | 10 passed (14)
```

### Watched passing — the same two files on the fix

```
Test Files  2 passed (2)
     Tests  14 passed (14)
```

**Four cases fail without the fix and pass with it**, and the four are the right four: the daily
primary landing on the report without the rail detour, the breadcrumb stop lighting *and*
navigating, the campaign flow on the same primary, and the leave-warning behaviour that a naive fix
would have broken. **The campaign case is the one that matters most**, because verification § M found
that Campaign shares the defect exactly while Fix a building shares nothing — so a fix covering only
the daily flow would have looked complete and left half the defect standing.

**Ten cases passed in both runs**, which is the other half of the evidence: the tests are not
failing because the suite is broken, and the fix did not disturb what already worked.

**Both CI platforms are green on the commit carrying the fix** (`aadaaaf`): `suite (linux)` and
`suite (macos)`, plus `invariant gates`, `claude review`, `build site` and `deploy`.

**What is still not verified, and it is the last mile:** nobody has clicked this on the deployed
build. The Azure preview environment is unreachable from the programme's container — the egress
policy answers `403` to `CONNECT` for that host, and Chromium cannot route through the agent proxy
at all. That belongs to #205's playtest protocol, and it is adjacent to open issue **#123**
(*preview environments cannot reach the API, so the surfaces most likely to break are the ones a
preview cannot test*) — the same shape from the other direction.

---

## Y. The M2 gate has a number, and the number is 19 → 0

`CHARTER_PROGRAMME.md` § M2's third exit criterion said of itself that it *"is a mechanical check
and it is part of the gate"* and had no mechanism. Landed in `24281ca` as the ninth honesty
property, `internal-notation`.

**It was watched failing before anything was registered** — 49 of 49 always-on cases, 1 078 reported
violation lines — which is the only condition under which a new gate means anything. Nineteen
findings are registered in `honesty.test.ts`'s `OUTSTANDING`: seventeen measured in both tiers, two
only the deep tier reaches. **The criterion is met when that block is empty and at no earlier
moment.**

**The instrument agrees with § N's hand count on all seventeen sentences**, and the two counts never
spoke to each other. That is the strongest available statement about a new instrument's calibration.
The counts differ on *surfaces* and the search is right: § N's six are source files, four of which
reach the player through three adapters.

### Two coverage gaps, both measured today rather than assumed

**1. The Everyday stage's canvas is outside the gate.** `PLAYER_FACING_SURFACES` resolves to 12 of
49 adapters, and no adapter drives the Everyday stage's own canvas text.

> **CORRECTED, same day, before the lane was briefed.** This paragraph first said the uncovered
> renderer was `render/canvas.ts#drawScene`, and that closing the gap meant teaching its adapter to
> *"distinguish the two mounts"*. **Both halves were wrong.** `drawScene`'s only non-test caller is
> `dev/main.ts` — it paints the **Engineer** schematic and nothing else — and
> `everyday/stageScreen.ts:13` says so on its own face: *"`render/canvas.ts` draws the Engineer
> schematic and keeps drawing it."* They are two separate renderers, per § D299 § 3, so there is no
> shared adapter to split. The wrong version is kept visible because it would have sent a lane to
> rebuild an adapter that was never the problem.

**What is actually uncovered, measured.** `everyday/stageScreen.ts#STAGE_SCREEN` is the Everyday
stage's own renderer and is **excluded from the corpus**, on the DOM mounts' shared ground — it needs
a document, a canvas and an animation frame. The exclusion is legitimate; **the claim attached to it
is not.** `surfaces.ts:8302` says what the mount authors of its own is *"geometry, class names and
two static captions"*. It draws **five** `fillText` sites, and three of them are none of those things:

| site | what a player reads | composed where | swept? |
|---|---|---|---|
| `stageScreen.ts:202` | the floor label | injected `floorLabelOf` | via its source |
| `:221` | `OUT OF SERVICE` | **mount** — the literal appears nowhere else | **no** |
| `:254` | `+N`, the waiting-rider overflow | `stageScreenModel.ts:728`, a **covered** declaration | **yes** |
| `:297` | `${occupants}/${capacity}` | **mount** — neither identifier appears in the model | **no** |
| `:307` | the `▲`/`▼` direction glyph | mount | **no** |

**Counted twice before it was right, so the number is stated carefully.** `+N` looked like an
uncovered figure and is not — `stageCrowdCapOf` composes it in the model and the adapter drives it.
What survives is **one live figure**, `${occupants}/${capacity}`, composed in the mount and read by
**no property at all**: not the M2 gate, not R6's temporal axis. `OUT OF SERVICE` is plausibly one of
the *"two static captions"* the docstring means; a live occupancy figure is not, and that is the part
of the sentence that is wrong.

So this is the **stale-refusal class** rather than a scoping question: a sentence describing what a
seam says, gone wrong while the seam works.

**The fix follows the split this directory already has.** `CLAUDE.md`: *"the pure/DOM split in
`everyday/` exists so that the words are drivable without one."* The stage's words need that same
seam, which is why this is a lane and not a line — and it is a **larger** lane than the one first
described here.

**2. Three register headings are still outside the corpus** — `shell.ts:1130`, `stageScreen.ts:563`,
`campaignModel.ts:323`, as § N recorded. A heading the search has never read is a finding in its own
right, and it pairs with the gap above: both are *surfaces the gate cannot see*, not strings the gate
forgives.

### What the derivation gets right, verified rather than trusted

The scope is keyed on **where a string is read**, not which file authored it — and that was tested
against a case from this wave. `shift/events.ts`'s day name, the string fixed for #216, is authored
in neither player directory and **renders on `everyday/today.ts#todayOf` `[IN]`**. A string from an
Engineer-side module is inside the gate when a player surface draws it. Measured over seven seeds.

### The figures, and why CLAUDE.md's row was deliberately left alone

Both tiers, one sitting, one tree: always-on **49 cases / 566 506 strings / 606 simulations /
48 surfaces**; deep **60 / 706 214 / 4 710 / 49**. Cases, simulations and surfaces are unmoved from
the published row; strings moved **+98** and **+120**, which is this wave's landed copy (#211, #213,
#214, #216) and not the new property, which renders nothing.

**CLAUDE.md's canonical row is not updated by this commit.** § D343 requires that measurement once
after the wave integrates, and M2 is still open — #207 will move the strings again. A figure
re-measured per lane is stale the moment the next lane merges, which this repository has now recorded
five times. The row is updated when M2 integrates, not before.

---

## Z. #206's AC4 rests on a false premise, and T1 is passing on every leg

Verified 2026-08-24 by running the browser tier, not by reading the matrix.

### T1 is passing, in two tests rather than one

`TEST_MATRIX.md` T1 — *menu → door → brief → stage → report → week* — read `planned`. **It is
passing.** Watched: `packages/viz/src/everyday/dailyLoop.browser.test.ts`, **6 of 6, exit 0**, on
the Chromium the tier defaults to.

Every leg is driven, across two cases rather than one:

| leg | where | how |
|---|---|---|
| menu → door | `enterEverydayStage` → `openEverydayDoor` | the mode tile, clicked |
| door → brief → stage | both cases | § 3.3's primary at each step |
| stage → file → report | the *no rail detour* case | the press that files is the press that navigates |
| report → week | both cases | the report's own primary |

**The split is worth stating rather than smoothing over.** No single case drives menu → week
continuously; the seam is between the filing case and the week case. Every leg is covered and
watched, which is why T1 moves to `passing` — but a reader who assumed one continuous drive would be
wrong, and the row now says so.

### #206's AC3 is met. **AC4 is not, and cannot be as written.**

AC3 — *"a journey test covers menu, front door, brief, stage, file, report and asserts the report
screen is reached"* — is met exactly by the *no rail detour* case, which starts at the mode tile and
asserts a filed sheet with figures rather than the empty one.

AC4 — *"the same check is applied to Campaign and Fix a building, **since both share the filing
path**"* — **the premise is false.** Measured: `host.closeDay()` has exactly one non-test caller in
the tree, `everyday/stageScreen.ts:884`. Nothing under `campaign/` or `fixit/` calls it or
`closeShift`.

- **Campaign cannot file a day at all in this build**, which this repository's own status has been
  saying: *"no campaign day is filed yet from § 8's screens — running one is wired end to end, but
  marking it cleared or missed needs `closeShift` to know which tower it belonged to."* There is no
  filing path there to apply the check to.
- **Fix a building has its own outcome route**, not the shared one — `fixit/engine.ts#classifyOutcome`
  — and it *is* driven, at `fixitScreen.browser.test.ts:311` (*runs the day from the bar's primary,
  holds it inert meanwhile, and draws the outcome*).

**This is the fourth refuted claim on #206** and it is the load-bearing one: AC4 asks for a check on
a path that does not exist. The nearest true thing is that fix-a-building's own outcome route is
already covered, and campaign's filing path is unbuilt work rather than an untested one. **AC4 should
be struck or rewritten against the campaign filing path when that is built** — closing #206 with AC4
ticked as written would assert a shared mechanism this tree does not have, which is the stated-
mechanism class § D280 exists about.

### One stale refusal, found in passing and not fixed here

`dailyLoop.browser.test.ts:166` says *"See {@link closeDay} for the one press that has no Everyday
home yet."* **That press has a home**, and the case 280 lines below proves it by pressing it. The
helper's own docstring was already corrected — it now reads *"and that button now exists"* — so the
file currently contradicts itself in two directions.

Not fixed in this sitting because `packages/viz/src/everyday/` is serialized to the #207 lane. It is
a one-line comment and it is the § D227 class: a sentence describing a seam, gone stale while the
seam works.

---

## AA. #208, #210 and #217 verified — and M2 cannot exit on code alone

Verified 2026-08-24, before scheduling any of the three.

### #208 — CONFIRMED, and confirmed by the code's own mouth

Every factual claim checks out: `shift/contracts.ts:71` makes `garden-apartments` the first contract;
the building is **6 floors, 120 residents, 2 cars**; `shiftLengthS: 3600` is an hour and the only
contract that names one.

**The unusual part is that the issue is not reporting a defect.** Contract `c1`'s own brief reads:

> *"Six floors, two hydraulic cars at 0.63 m/s, and a gentle trickle of residents. **Nothing here is
> hard — it exists so the seven that follow have something to be different from.**"*

So #208 argues against a **deliberate design decision**, exactly as #207 did. Its own docstring
already measured the consequence: over twelve seeds the median is **18 calls in thirty minutes**, and
seven of twelve fall under the `WAKE_UP_ARRIVALS` line — which is why `shiftLengthS` was authored on
this contract at all.

**It is also blocked, and by a deferral the programme itself made.** #208 says *"the difficulty
specification governs it"*. That specification is **#200**, which the product owner deferred to
before M4. A P0 in M2 cannot be governed by a spec scheduled after M2. **This needs a
product-owner decision**: unblock #200 for M2, or let #208 proceed under a stated assumption, or move
#208.

### #210 — CONFIRMED

*"A 'How to play' page exists in the Engineer menu, which a new player never reaches"* — true.
It lives in `menu/screens.ts:1029` and `dev/menuPanel.ts`, both Engineer surfaces. Nothing under
`everyday/` carries onboarding, a coach mark or a guided day. *"Never reaches"* is now slightly
strong — [§ D338](DECISIONS.md) built a door — but no new player would find it, and the substance
holds.

### #217 — CONFIRMED in substance, **WRONG in its framing, and the difference matters**

AC3 says the stale refusal *"still reads 'the three cases run, but their Everyday screen is not built
yet'"*. The string is in `everyday/modes.ts:134`. **It is never drawn to a player.**

`modes.ts:31` — `unlessBuilt(refusal, ...screens)` returns `undefined` when `screens.every(isScreenBuilt)`.
`screens.ts:224`'s `UNBUILT_REASONS` is **empty**: every § 4 key is registered. So all four mode
refusals — Today's tower, Campaign, Rush, Fix a building — are **dead branches**.

So the defect is a stale **comment** beside a dead branch, not a live player-facing lie:
`modes.ts:129` still says *"Three authored cases exist and § 10's Everyday screen is not built"*
while `:44` in the same file says *"ships all **eighteen**"*. The file contradicts itself, and the
comment at `:60` had already named this exact risk — *"the comment claiming they do not would be
§ D227's stale refusal in a code path."*

**AC3 and AC4 are worth doing; the sentence describing them should not claim the player sees it.**

### The finding that changes M2's schedule

**The M2 gate cannot be closed by any agent lane, and three separate things say so.**

| gate | what it requires |
|---|---|
| M2 exit criterion 1 | *ten testers who have never seen the game complete the slice* |
| M2 exit criterion 2 | *six of ten can state what went wrong and why their change helped* |
| M2 exit criterion `charter S6` | six of ten, **tier-0 answers only** |
| #208 AC4 | ten first-time testers, 6 of 10 |
| #210 AC5 | ten first-time testers |
| #218 | the slice review, with recorded sessions |

**No lane can produce a first-time tester.** And the one surface those testers would use is not
reachable from here: § X recorded that the Azure preview answers `403` to `CONNECT` through the
agent proxy, so the deployed build cannot even be driven from this container.

This is not a reason to slow the code work — #207 landed, #212 + § D347 is running, and #217's
cleanup is small. It is a reason to say plainly that **M2's remaining path is a human one**, and to
stop treating the milestone as if finishing the issues finishes the milestone. `docs/30`'s tier
ladder is the protocol; somebody has to run it.

### Two notes for whoever picks these up

- **The M2 gate's property cannot see a stale refusal.** `internal-notation` checks *notation*, not
  *truth*: `'the three cases run…'` carries no `§`, no filename and no identifier, so it passes the
  gate while being false. The two defect classes are disjoint, and nothing in this suite reads the
  second.
- **#217's AC1 is a decision, not code** — *"a decision recorded on Fix a building's position in the
  mode hierarchy"* — and it collides with [§ D299](DECISIONS.md)'s positioning answer and § D335's
  front door. It belongs to the product owner before any lane starts.

---

## AB. The day is a thirty-minute morning slice, and a ten-hour day already ships

Raised by the product owner 2026-08-24: *the day appears to clock only one hour in the morning, not a
full cycle, and should be resolved together with the speed settings.* **Verified. The observation is
right, and the diagnosis is sharper than the report.**

### What the day actually is

| where | value |
|---|---|
| `dev/state.ts:137` | `DEFAULT_SHIFT_LENGTH_S = 1800` — **thirty minutes** |
| `shift/contracts.ts` c1 | `shiftLengthS: 3600` — an hour, and *"the only contract that names one"* |
| `rise-and-fall` | `durationMin: 30`, `startOfDayMin: 510` (08:30) |

Every other shipped template is a slice too: `lunch-two-way` 30 min, `shift-change` 30 min,
`office-down-peak` 30 min, `evening-egress` 20 min, `constant-iso` 120 min.

### The finding: a full day exists and the player cannot reach it

**`office-day` ships today — `durationMin: 600`, `startOfDayMin: 480`, seventeen phases.** Ten hours,
authored, loaded, schema-valid.

`dev/state.ts:175` resolves the day's template as
`state.freePlay?.demandTemplateId ?? fromPattern`. The Everyday player never writes
`state.freePlay`, so they always get the building's pattern template — a slice — and **`office-day`
is reachable only through Free Play's select on the Engineer side.** `menu/types.ts:177` says as
much in its own words: *"when the slice control lands, this entry stops being the only way to reach
`office-day`."*

This is not a dead seam — `office-day` has a real non-test caller in Free Play — but it is the same
shape one level up: **the content exists, and the audience the charter cares about cannot get to
it.**

### The speed half is already a decided defect

[§ D344](DECISIONS.md) measured `stageScreenModel.ts:98-104` and found the labels lie:

| label | `simPerRealS` | actual |
|---|---|---|
| `½×` | 8 | **8× real time** |
| `1×` | 30 | **30× real time** |
| `4×` | 90 | 90× |
| `12×` | 240 | 240× |
| `30×` | 600 | 600× |

*"There is no 1:1 speed, and the control that says `1×` is thirty times faster than one."* § D344
already rules that the ladder is to be fixed. **So the owner's instinct to lump the two is right, and
one of the two is already decided** — the ladder is what makes a ten-hour day watchable at all: at
600× it is one real minute; at the honest `1×` it would be ten real hours.

### What this would cost, and the cheap path

**The published pins need not move.** `DEFAULT_SHIFT_LENGTH_S` is *"the horizon every number in
`docs/05-roadmap.md` was measured over"*, and moving it is a § 12 escalation. **It does not have to
move**: a contract already declares its own length (c1 overrides it to 3600), so the Everyday day can
be lengthened per contract and template while the default — and every figure measured over it —
stays exactly where it is.

**What does move is the day's goals.** A goal measured over thirty minutes is not a goal over ten
hours. Under `CLAUDE.md` a goal that changes is *"a finding to report, not a number to edit"*, and
`campaign/judge.ts` refuses to judge when the baseline arm does not reproduce its published count.

> **CORRECTED, same day.** This paragraph first said the work *"regenerates `data/scenario-goals.json`
> — which is already owed three times over"* and called it *"the fourth rider"* on the regeneration
> § D345 sequences with #255 and #234. **That was wrong twice**, and it was wrong by repeating
> § D345's own error rather than checking it: `DIFFICULTIES.tests` never touches
> `data/scenario-goals.json` (it lives in `campaign/economy.ts` and is read by
> `everyday/campaignModel.ts`), so there is no three-way queue to be fourth in. § D345 is corrected.
>
> What a longer Everyday day actually moves is **the week's day goals**, `shift/goals.ts#goalsForDay`
> — which docs/33 § 1.4 now specifies as the single post-fix bar's source. Whether the **stage**
> campaign's published table moves at all depends on whether stage runs lengthen too, which is a
> scoping question for the lane rather than a settled consequence.
>
> Found by the SPEC-200 lane measuring the curve, not by this note being re-read. A sequencing claim
> inherited from a decision is still a claim; this one should have been checked before it was
> repeated.

**And simulation cost scales with it.** A ten-hour day is roughly twenty times the trips of a
thirty-minute one, per replication, everywhere the day length is inherited.

### Sequencing

It **collides with FIX-212**, which owns `everyday/stageScreen.ts` — the clock and the transport —
right now. Nothing starts here until that lands.

### One piece of history any lane must read first

[§ D286](DECISIONS.md) **removed** the length controls: `SHIFT_LENGTHS`' four narrative options
(*Short shift — 15 min* … *Full period — 2 h*) and Free Play's five numeric *Run length* options, both
writing the same field (issue #82). They were replaced by `partsOfDay`, derived from the loaded
records' own hours — *"a part's length is the period it names and its label is its clock"* — and
`menu/partsOfDay.ts` records **why a length control could not be relabelled into an honest one**. A
lane that adds a fresh day-length control without reading that will re-introduce what § D286 deleted.

---

## AC. #200 landed, and its own central figure is refuted

The SPEC-200 lane wrote `docs/33-difficulty-curve.md` and measured rather than inherited every number
it needed. **Six claims came back wrong**, and one of them was mine.

### #200's central figure

*"Four of ten stages clear from the dispatcher dropdown alone."* **Measured: three of ten** — stage 3
`fairness-first`, stage 5 `eta`, stage 7 `destination-panel`. Ten stages × thirteen profiles, 77
admitted cells, two arms × 50 replications under common random numbers.

**Its real home is `docs/10:1680-1694`, where it says four of *seven*** — so the issue restated a
figure about a different denominator.

### The rest

1. **`docs/10:1683-1691`'s own correction is stale.** It says *"stage 6 clears under `destination-eta`
   and `destination-panel`"*. Stage 6 clears under **nothing**. `campaign.test.ts` had already
   inverted that case; `docs/10` was never re-read against it. A correction that went stale is the
   same class this repository has now recorded five times.
2. **Stage 5's clearer moved** — `destination-eta` → `eta`. `destination-eta` does not clear.
3. **`campaign.test.ts`'s stage-6 docstring says *"all twelve shipped profiles"*.** There are
   **thirteen**.
4. **"Every rider away inside a minute"** — § S measured **9 of 100 seeds** over 60 s. #200's opening
   figures are distribution properties stated as constants.
5. **#200 conflates two products.** Campaign stage 1 *does* present a failure on `garden-apartments`
   (`nearest-car` fails `answer-the-demand`); it is the **week's** day 1 on that building that does
   not. The issue argues from one and asks for a change to the other.

### And the sixth was mine

**§ D345's sequencing note named the wrong table**, and § AB repeated it an hour later without
checking. `DIFFICULTIES.tests` lives in `campaign/economy.ts` and is read by
`everyday/campaignModel.ts`; `data/scenario-goals.json` is the **stage** campaign's table under
§ D160 and no tier touches it. Both are corrected in place with the wrong version kept visible,
because the sequencing that error recommended would have held a small independent fix behind two
large ones.

### What the measurements returned beyond the refutations

- **Week** — 8 contracts × days {1, 5, 10, 20} × 30 seeds. Day-1 miss rate in shipped contract order:
  **0, 30, 7, 24, 30, 1, 9, 0** of 30. The opening contract misses nothing at days 1, 5 *and* 10, and
  the **last** contract ties the first for easiest day one. The shipped order is not a ramp.
- **Fix cases** — doing nothing clears **0 of 18**; ten cases have exactly one affordable clearing
  repair; the shipped order is not a ramp either.

### The open question the lane refused to close, and it is the important one

**O7: every rule judges a stage on the same seeds the player tunes against.** So *tune until the
judged seeds clear* is a shortcut none of the nine rules can see — and the one existing witness takes
it, clearing on tuning and being beaten on holdout on three measures. This is `CLAUDE.md`'s
hold-out-traffic-seeds discipline, unenforced at the campaign layer.

Closing it changes `judge.ts` and what every published count in `data/scenario-goals.json` counts.
The lane correctly refused: that is not a specification lane's call. **It is the first thing to decide
before the curve's obligations are built.**

### Owed

Decision numbers for **C6** (four stale sites the curve found) and **§ 1.5**. #208 is unblocked and is
governed by docs/33 §§ 4.4 and 1.1.
