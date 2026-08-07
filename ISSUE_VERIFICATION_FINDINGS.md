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

Source: `elevator-sim-playtest-report.md`, tester "Claude (Cowork)". **Read after the wave-B issues
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
