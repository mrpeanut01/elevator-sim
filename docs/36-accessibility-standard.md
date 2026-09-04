# 36 — The accessibility standard this game holds itself to

**Issue:** #204 · **Milestone:** M1, pre-production · **Written:** 2026-09-04 on
`docs/issue-204-a11y-standard` · **Character:** the standard, its instruments, and one conformance
decision left unmade on purpose.

**This document is [§ D473](../DECISIONS.md)**, which records what it decides, what it deliberately
leaves unmade, and the one measurement it took.

M1 writes no production code. No `.ts` file, no `.json` file, no CSS and no shipped string is changed
by this document. What it changes is what a reviewer may refuse work against, which is the thing that
did not exist before. Accessibility work in this repository is real and it is ad hoc, and *ad hoc*
is another word for *no way to say whether a new surface passes*.

**This document is the standard. It is not the sweep.** GitHub issue **#239** runs the sweep against
it, remediates what the sweep finds, and owns every acceptance criterion about a run. Nothing below
is written as an acceptance criterion for that issue. Where the two overlap, § 6.5 says so and hands
the criterion over by name.

**Series are cited with their document**, never bare ([§ D343](../DECISIONS.md)): `guide § 7.2` means
[`design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`](design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md),
`UX.md KB-13` means [`../packages/viz/UX.md`](../packages/viz/UX.md) § 5, `docs/28 AD-A1` means
[`28-art-direction.md`](28-art-direction.md) § 7.3, and `WCAG 2.2 SC 1.1.1` means the W3C
Recommendation named in Sources. This document's own rows are prefixed **`AX-`** and are cited that
way from everywhere else.

---

## 0. What is measured here, and what is asserted

Read this before anything else. It is the difference between a standard and a wish list, and it is
[`31-support-matrix.md`](31-support-matrix.md) § 0's device pointed at a different subject.

Every figure in the table below was taken on `771e65f` in this worktree, by the command in its own
row. None of them is transcribed from another document.

| Fact | How it was taken |
|---|---|
| The Everyday stage canvas carries **no** accessible name, **no** role and **no** fallback content | `packages/viz/src/everyday/stageScreen.ts` lines 671 and 672 create it and set `style.cssText`. Nothing else in the file touches that element except `getBoundingClientRect`, `width`, `height` and `getContext` |
| The Engineer canvas carries one, rewritten every frame from a pure function | `packages/viz/src/dev/main.ts:5895` sets `aria-label` from `render/describeFrame.ts#describeFrame` |
| That text alternative is **already inside the honesty corpus** | `packages/viz/src/honesty/surfaces.ts:951`, adapter id `render/describeFrame.ts#describeFrame`. The corpus holds **52** surface adapters, **11** of them with an `everyday/` id |
| Nothing in the tree reads a contrast preference | A tree-wide search for `prefers-contrast`, `forced-colors`, `forcedColors` and `ms-high-contrast` returns three hits, all prose: two docstrings and `docs/31` § 5's own row |
| No password field exists anywhere | `grep -rn password packages/viz/src` returns 18 lines, every one of them a comment about the field [§ D241](../DECISIONS.md) **deleted** in favour of a mailed link |
| The eight shaft tints are separated by hue and almost nothing else, in **both** themes | § 4.3 below. 28 pairs each; the widest luminance separation in the light set is **1.43:1** and in the dark set **1.66:1** |
| The Everyday shell has a `<nav>` rail and an `<h1>` per screen, and **no** `<main>` landmark and **no** skip link | `everyday/shell.ts:336` is the `nav`; `:350` makes the main region a `div`; `packages/viz/index.html:1764` is the only skip link in the product and it targets `#stage`, the Engineer canvas |
| There is no automated accessibility sweep | `axe` appears in no `package.json` in the tree. The test toolchain is four root `devDependencies` (`playwright-core`, `typescript`, `vitest`, `@types/node`) plus `vite` on `packages/viz` |
| The browser tier is **36** files and drives no zoom level | `find packages/viz/src -name '*.browser.test.ts' \| wc -l`; `viewportGates.browser.test.ts` contains no `zoom` and no `deviceScaleFactor` |

**Everything outside that table is a commitment**, and § 7 says which tier each commitment sits in.

### 0.1 The rule every clause obeys

`docs/31` § 5 states the one rule it says this document may not weaken:

> a row in the standard that no instrument checks is a tier-3 claim and must be labelled one.

Adopted without amendment, and extended by one sentence that follows from it. **Where a clause can
only be checked by a person, this document says so and names the role.** A guard that pretends to
check something is worse than an honest gap, because the gap can be scheduled and the pretence
cannot. That is [`../CLAUDE.md`](../CLAUDE.md)'s standing requirement wearing an accessibility hat:
name the instrument, or say there is not one.

### 0.2 The refusal test this standard applies to itself

[§ D456](../DECISIONS.md) gave `charter P2` a second test pointing the other way, and it binds here
with unusual force:

> **`AX-0`** — no clause in this document is discharged by deleting its subject.

A colour set with no second channel can be made to pass by removing the colour. A canvas with no text
equivalent can be made to pass by removing the canvas. Both would satisfy the letter of a clause and
leave the game worse, and a review that accepted either would be running the ratchet § D456 exists to
stop. The resolution is never to weaken the clause and never to accept the loss quietly. Where a
clause below has an obvious deletion that would discharge it, the clause says which one and refuses
it in advance.

### 0.3 One census this standard deliberately does not use as a gate

There is a lot of hand-rolled ARIA in the tree. Counted on `771e65f` across the **33** non-test
modules that carry any, `grep -rho --include='*.ts' --exclude='*.test.ts'` returns **41**
`aria-label`, **29** `aria-pressed`, **20** `aria-describedby`, **13** `aria-hidden` and **3**
`aria-live`.

Two things about those numbers, and the second is why they are not a gate.

**They correct a published set.** #204's own verification comment reports 66, 49, 38 and 19 for the
same four attributes across the same 33 modules. Three of those four reproduce exactly when test
files are counted, and the fourth reproduces at neither 66 nor any variant tried. So the published
figures are a mixed census, and this row is the correction rather than a second opinion. It is the
class `CLAUDE.md` files under *a published number goes stale the same way*, arriving in the document
written to prevent it.

**And a census of ARIA is a measure of effort, not of coverage.** An `aria-label` that is wrong is
counted the same as one that is right, and a screen with no ARIA at all may be perfectly accessible
because it used the right elements. No clause below is satisfied by adding an attribute, and no
review may cite this count as evidence of anything.

---

## 1. The conformance target, which this document does not choose

**A conformance target is a product decision with a real cost, and picking one quietly inside an
engineering document is how a project acquires a commitment nobody agreed to.** So the three
candidates are set out with their costs, and the choice is marked as needing an owner.

> ### ⬜ DECISION NEEDED — owner: the product owner
>
> **Which of the three options below the game commits to, and which exclusions come with it.**
> Recorded here rather than taken here, on the same footing [`29-audio-direction.md`](29-audio-direction.md)
> put its recommendation before [§ D344](../DECISIONS.md) ruled on it. Until it is answered, § 2's
> clauses bind at the strengths § 7 gives them, because every one of them is invariant across the
> three options. **Nothing in this document is blocked on the answer.** What the answer changes is
> the size of the claim the product may make in public and the shape of §§ 6.5 and 8's follow-on work.

### 1.1 The three candidates

**Option A — WCAG 2.2 Level AA, with named exclusions.** The current W3C Recommendation, and what a
public accessibility statement is normally read against. Its cost over Option B is six success
criteria that 2.2 adds at A and AA, and § 1.2 prices all six against this tree.

**Option B — WCAG 2.1 Level AA, with named exclusions.** The version most procurement language and
most national regulation still names. It costs less than A by exactly the six criteria in § 1.2 and
nothing else, since 2.2 removed only SC 4.1.1 Parsing, which was obsoleted rather than relaxed.

**Option C — no external standard; this document's clauses alone.** Cheapest to satisfy and the
weakest thing to say. It costs the ability to answer *is this product accessible* with anything a
reader outside the project can check, and it makes every clause below unfalsifiable from outside,
since the only authority for them would be the document asserting them. Recorded because refusing a
standard is a legitimate choice and an unrecorded refusal is not.

### 1.2 What Option A costs over Option B, priced against this tree

The six criteria WCAG 2.2 adds at Level A or AA, each with what it would bite on here. Four of the
six are cheap or already satisfied; one is unmeasured; one is a real piece of work.

| New in 2.2 | Level | What it bites on here | Cost |
|---|---|---|---|
| **2.4.11** Focus Not Obscured (Minimum) | AA | The Everyday shell pins an action bar and a 212 px rail over a fixed root. A focused control scrolled under the pinned bar is exactly this criterion | **Small.** One browser check: focus every focusable in turn, compare its box against the pinned chrome's. Unmeasured today |
| **2.5.7** Dragging Movements | AA | `dev/dom.ts#onHorizontalDrag` and its vertical sibling, used by the Engineer building editor's occupancy and band handles | **Probably nil, and verify it.** `onHorizontalDrag`'s `pointerdown` calls `handle(event)` before any move listener is attached, so a single click already sets the value without a drag. The vertical sibling is unchecked |
| **2.5.8** Target Size (Minimum) | AA | Every interactive target in both shells, at 24 × 24 CSS px | **The real one.** Unmeasured, and this product draws small controls: `docs/28` § 7.2 measures a 4.5 px mark. Mechanisable in the browser tier by reading bounding boxes off every focusable |
| **3.2.6** Consistent Help | A | A help mechanism repeated across screens, in a consistent order | **Nil, probably not applicable.** No repeated help mechanism exists to be inconsistent |
| **3.3.7** Redundant Entry | A | A multi-step process re-asking for information already given | **Nil, and worth preserving.** Building setup and contract flows carry their state forward |
| **3.3.8** Accessible Authentication (Minimum) | AA | Any cognitive function test in a sign-in | **Nil, and it is not luck.** [§ D241](../DECISIONS.md) deleted the password field in favour of a mailed link, which is the criterion's own worked example of how to pass it. `AX-0` applies: this is a property to preserve |

**So the honest summary is that Option A costs one unmeasured criterion and one small check over
Option B.** That is a much smaller gap than the version numbers suggest, and it is worth saying
before the owner reads *2.2* as *more expensive*.

### 1.3 The three exclusions any option would have to name

These are places where the product's **existing, recorded commitments** already conflict with a
Level AA criterion. They are surfaced so the owner excludes them deliberately or funds them, and not
so that they are quietly excluded here.

1. **SC 1.4.10 Reflow, at 320 px.** The criterion asks for content at 320 CSS px without
   two-dimensional scrolling. `docs/31` § 2 commits the product to **360 px and above**, which is a
   narrower promise, and `everyday/viewportGates.browser.test.ts` records the product **failing two
   of three of its own clauses at 360** today. Adopting AA unqualified adopts a criterion the product
   misses at a width below its own floor. Either the floor moves to 320 or 1.4.10 is excluded with
   the floor as its reason.
2. **SC 1.4.4 Resize Text, and 1.4.10 at 200 % zoom.** `docs/31` § 5 already commits the 200 % row
   and makes it conditional on #240's viewport gates. **Those gates now exist** and drive no zoom
   level, so the commitment's precondition is met and its instrument is still missing. This is the
   cheapest row in this document to close, and § 6.3 says how.
3. **SC 1.2.x, time-based media.** There is no audio and no video in the tree today, so the whole
   guideline has no subject. [§ D344](../DECISIONS.md) rules that audio **ships**, speed-tiered, and
   names #258 as the lane. The exclusion is therefore correct now and has a known expiry, which is a
   different thing from a permanent one and must be written as such.

### 1.4 What binds regardless, and why the clauses below are not blocked

Every clause in § 2 is invariant across A, B and C. The contrast floors, the keyboard requirement,
the colour rule, the focus rule and the reduced-motion rule are identical in WCAG 2.1 AA and 2.2 AA,
and each is independently required by `UX.md`'s `KB-` rows, `docs/28` § 7.3 or `docs/10`, all of
which predate this document. **The target decides what the project may claim in public. It does not
decide what the product owes a player**, and the clauses below are the second thing.

---

## 2. The standard

Seventeen clauses. Each says what it requires, and each names the instrument that checks it or says
plainly that there is none and who does it instead. `AX-0` is § 0.2.

The whole table is here so a reviewer can read it in one screen; §§ 3 to 5 argue the three that need
arguing.

| Id | Clause | Instrument | Tier |
|---|---|---|---|
| **AX-0** | No clause is discharged by deleting its subject | Human, at review. § D456's second P2 test | 3 |
| **AX-1** | Every `<canvas>` a player reads carries an accessible name that describes the current frame, produced by a pure function of that frame | Node test per canvas, plus a browser assertion that the attribute exists and is non-empty | 1 Engineer · 3 Everyday |
| **AX-2** | The text equivalent carries the same observations as the picture, and where both state one fact they state it the same way | Half mechanised: `honesty/agreement.ts`'s `surfaces-disagree` over a declared pair. The *same observations* half is human, against § 3.3's ledger | 2 |
| **AX-3** | A live region is written when its sentence changes, and at no other time | Node test on the view function; browser mutation count over N frames | 3 today, **failing** |
| **AX-4** | No canvas is a focus trap, and no fact is reachable only by pointing at one | Browser tab traversal per screen | 1 Engineer · 3 Everyday |
| **AX-5** | Nothing a player must distinguish is distinguished by hue alone | Token-set luminance test (§ 4), plus human review of each new signal | 3 today, **failing** |
| **AX-6** | Text meets the contrast floor against the ground it is actually drawn on | `render/theme.test.ts`'s `INK_LADDER`; `dev/noteContrast.test.ts` for pairings | 1 for covered pairings · 3 elsewhere |
| **AX-7** | A graphical object a player must read meets the non-text floor against its own adjacent colour | New token test, on `noteContrast.test.ts`'s model | 3 today, **failing** at `tapping-foot` |
| **AX-8** | A colour set used to group is declared either *load-bearing* or *decorative*, and a load-bearing set carries a second channel | New test asserting a declaration exists per set, plus § 4.3's measurement | 3 today |
| **AX-9** | Every control is reachable and operable from the keyboard, in the order it is read | Browser traversal per screen, on `deadControls.browser.test.ts`'s model | 2 Engineer · 3 Everyday |
| **AX-10** | Every mode is completable from the keyboard alone, and its journey is written down before it is driven | Browser tier, one journey per mode (§ 5) | 3 today, **none exists** |
| **AX-11** | Focus is always visible and is never obscured by pinned chrome | `:focus-visible` presence asserted today; the obscuring half is a new browser check | 2 · 3 for obscuring |
| **AX-12** | Focus moves to what just happened, and never because of the render loop | `UX.md KB-10`, `KB-11`; driven | 2 Engineer · 3 Everyday |
| **AX-13** | `prefers-reduced-motion` is honoured on every surface, canvas included | `dev/motion.test.ts` for the CSS guard and the autoplay verdict; canvas is unreached | 1 for CSS · 3 for canvas |
| **AX-14** | A contrast or forced-colours preference is honoured, or the product declares in the tree that it reads neither | Nothing today. § 6.4 proposes the declaration | 3, **undeclared** |
| **AX-15** | Every screen exposes a main landmark, one `h1` naming it, and a way past repeated chrome | New browser check per screen key | 1 Engineer skip link · 3 Everyday |
| **AX-16** | A refusal reaches a non-visual reader in the same words and at the same moment as a sighted one | The honesty corpus's ten properties, once the surface is registered | 1 where registered |

**Five clauses are recorded as failing on `771e65f`.** They are `AX-3`, `AX-5`, `AX-7`, `AX-10` and
`AX-14`, and every one of them is #239's to remediate. A standard adopted with its known failures
listed is worth more than one adopted clean, because the clean one has not been pointed at anything
yet.

---

## 3. The canvas, which is the hard case

### 3.1 Why a generic citation does not settle it

WCAG SC 1.1.1 asks for a text alternative that *serves the equivalent purpose*. For a photograph
that is a sentence. For a live simulation of thirty-five cars across seven banks it is not, and
saying *the canvas has an `aria-label`, so 1.1.1 is met* would be the kind of claim this repository
has spent several waves learning to distrust.

The stage exists so that a player can **notice something going wrong before a number tells them**,
which is [`35-problem-per-mode.md`](35-problem-per-mode.md)'s central constraint and `charter P3`'s.
Showing a picture is how it does that, and the picture is a means. A text equivalent that describes the frame but arrives too late, or
arrives sixty times a second, or arrives only when asked, fails that purpose while passing an
attribute check.

So this standard splits what the canvas owes into three, and requires all three.

### 3.2 The three parts

**One — a name, always (`AX-1`).** The canvas has an accessible name that describes the current
frame and is produced by a pure function of that frame. *Pure function of that frame* is the
load-bearing half. `render/describeFrame.ts`'s own docstring gives the reason and it is the right
one: a description assembled from the DOM would be a second source of truth about what is on screen,
and the picture and the sentence would drift. They read the same frame or they are two claims.

**Two — a live region with a policy (`AX-3`).** Something must announce change, and the policy is
that a live region is written **when its sentence changes**. The Everyday stage violates this today
and `docs/28` § 7.3 AD-A3 already named it: `stageScreen.ts:1204` calls
`alarm.replaceChildren(...)` unconditionally on every frame the alarm is up, which is up to sixty
rewrites a second of an announcement region. That is a paint habit with an assistive-technology cost
no visual test can see, and it is the clearest example in the product of why this standard exists.

**Three — a structured equivalent that can be read at rest (`AX-4`'s second half, *no fact is
reachable only by pointing*).** A single string is a *summary*, and a player who cannot see the stage
needs to be able to **interrogate** it: which floor, how many, how long. `docs/10` § 6.3 already specifies the shape, per floor with anybody on it, one
clause: *"Floor 7: 6 people waiting, the longest for 41 seconds."* Its own note is the constraint
that keeps this from becoming a manifest, and this document adopts it verbatim: `KB-13` asks for a
description, not a manifest. `render/describeFrame.ts:312` already emits those clauses through
`describeQueue`, ranked and capped.

### 3.3 What the Everyday side owes, exactly

The asymmetry is the whole finding, and it is not a small one. Since [§ D335](../DECISIONS.md) the
Everyday stage is **the stage a player meets first**, and its canvas is `60vh`
(`everyday/stageScreen.ts:222`), so it is the largest thing on the screen. It has no name, no
role and no fallback.

The remedy is an adapter and not new prose. The words exist, in a module that is already pure,
already tested under Node, and already swept by the honesty corpus. Four requirements on that
adapter, and one refusal:

1. **Same observations.** Every fact the picture carries reaches the text: the clock, the run's
   status, any suppression, who is waiting and where, the doors, the overload, the cars held out of
   service, the landings no car answers, and the credential a locked-out rider is missing.
   `describeFrame` names all of these today and each has its own argument in the file.
2. **Same source.** Produced from the frame, not from the DOM, for § 3.2's reason.
3. **Its own register.** The Engineer sentence says *legs waiting*, *dispatcher*, *seed*. Those are
   the Engineer's words and `docs/10` § 7's translation table exists precisely because the Everyday
   surface may not use them. **The adapter translates the register and may not translate the
   observation**; a fact that survives into Casual with a softer word is fine, and a fact that does
   not survive at all is a picture the text does not carry.
4. **Registered in `honesty/surfaces.ts`.** This is the mechanisation, and it is the strongest one
   available in this tree. `render/describeFrame.ts#describeFrame` is already registered there
   (`honesty/surfaces.ts:951`), which means the Engineer text alternative is **already held to all
   ten honesty properties** on every corpus case. A registered Everyday equivalent inherits `suppressed-mean`,
   `estimate-without-n`, `probability-word`, `internal-notation` and the rest on the day it lands,
   with no new instrument written. That is `AX-16`, and it is why `AX-16` is the only clause in this
   document that is tier 1 without anybody building anything.

**The refusal.** The adapter may not be a second wording of the same fact maintained by hand beside
the first. Two sentences about one run drift, and `honesty/agreement.ts`'s `surfaces-disagree`
property exists because they already have.

---

## 4. Colour

### 4.1 Method, and the control that licenses it

WCAG 2.x relative luminance, ratio `(L₁ + 0.05) / (L₂ + 0.05)`, computed over the literal hex values
in the tree at `771e65f`. This is the same function `docs/28` § 7.2 used, and it was validated the
same way before any new number was published: **it reproduces all ten of that section's figures
exactly**, the four band-against-ground ratios (3.58, 1.78, 4.64, 4.94) and all six
band-against-band pairs (1.06, 1.30, 1.38, 2.01, 2.61, 2.77). A derived number whose instrument
cannot reproduce a published one is a number nobody should read.

### 4.2 The queue-age ramp, cited rather than restated

`docs/28` § 7.2 has already measured it and this document does not repeat the tables. What this
document adds is the ruling that section asks for by name:

> **The non-text floor is 3:1**, and it is measured against the ground the mark is actually drawn
> on. `tapping-foot` at **1.78:1** against `cardSunk` fails it. (`AX-7`.)

Three things follow, and the third is the one to read.

**A floor is a floor, and it is not a ruling about a token.** `docs/28` § 7.2 argues at length that the four inks are
`guide § 19`'s, that they are the same four the Engineer mood card paints, and that AD-S15 forbids a
second ramp. This document does not overrule any of that. A floor is satisfied by moving the ink, by
moving the ground, or by changing what is drawn; which one is #239's call, and § 8 records that it
is unmade.

**Hue may not be the ramp's only channel** (`AX-5`), which `docs/28` AD-S7 already discharges by
encoding the band in capsule **height** as well as colour. Adopted by reference.

**And `AX-0` bites here.** The cheapest way to make a 1.78:1 mark pass is to stop drawing it. The
ramp is `guide § 7.2`'s *"core read"*; a stage that satisfied this clause by removing the band that
means *this is starting to go wrong* would have satisfied a checklist and broken the game.

### 4.3 The eight shaft tints, measured here for the first time

`docs/28` § 8 item 4 records these as unmeasured and Engineer-only. They are measured now, in both
themes, by § 4.1's function over `render/tokens.ts`'s literals: `LIGHT_PALETTE.shaftGold` and its
seven siblings at lines 577 to 584, and `SHAFT_GOLD` and its siblings at lines 192 to 199.

**Twenty-eight pairs per theme. Not one pair in either theme reaches 2:1, let alone 3:1.**

| | light | dark |
|---|---|---|
| widest separation in the set | **1.43:1** (`--shaft-1` vs `--shaft-7`) | **1.66:1** (`--shaft-7` vs `--shaft-8`) |
| narrowest | **1.02:1** (`--shaft-1` vs `--shaft-6`) | **1.0014:1** (`--shaft-3` vs `--shaft-5`) |
| pairs under 1.10:1 | 7 of 28 | 7 of 28 |
| pairs under 1.50:1 | **28 of 28** | 20 of 28 |
| pairs at or over 3:1 | **0** | **0** |

The dark set is worse than the summary row suggests, and the detail is worth one table because it
names the failure precisely. Four of the eight tints are one greyscale value:

| dark pair | ratio |
|---|---|
| `--shaft-3` vs `--shaft-5` | **1.0014:1** |
| `--shaft-5` vs `--shaft-7` | **1.0018:1** |
| `--shaft-3` vs `--shaft-7` | **1.0032:1** |
| `--shaft-3` vs `--shaft-4` | 1.0228:1 |
| `--shaft-4` vs `--shaft-5` | 1.0243:1 |
| `--shaft-4` vs `--shaft-7` | 1.0261:1 |

Banks 3, 4, 5 and 7 are, to a reader with no colour, the same colour.

**What this measurement establishes, and what it does not.** It does not simulate any particular form
of colour blindness, and it does not need to. A luminance measurement is **model independent**: it
says that the eight tints are separated by hue and by essentially nothing else, and that conclusion
holds whichever dichromat model you would have reached for next. A simulation would change *which*
pairs collapse. It could not produce a set in which hue is a reliable channel for a viewer who has
fewer hue channels than the set assumes. This is why `AX-8` asks for a second channel rather than for
a ratio between simulated colours: the requirement is the same under every model, so specifying the
model would add an argument and no constraint.

**What it does not establish is that anything is broken for a player.** That is the honest half.
`dev/buildingEditor.ts:815` gives each car a `legend` reading `${id} · ${role} · ${serves}`, so the
bank's identity, its role and the floors it serves are already in words beside the tint. On the
evidence in the tree the tints are a **grouping affordance** layered over information that survives
without them, and a greyscale reader loses the grouping and keeps the facts.

That is exactly why `AX-8` is worded as a declaration rather than as a threshold. **Declare each
colour set load-bearing or decorative, and hold the declaration to a test.** If the shaft tints are
decorative, the measurement above is a curiosity and the clause is discharged by saying so in
`render/tokens.ts` where the next author will read it. If any future surface makes them load-bearing,
the same declaration is the thing that goes red. An undeclared set is the defect, because it is the
one where nobody can tell which case they are in.

---

## 5. Keyboard, and what a journey is

### 5.1 What exists, and where the zero is

`UX.md` § 5 holds seventeen `KB-` rows, seven of them marked non-negotiable, and it opens *"applies to
every surface"*. That sentence is a commitment the document cannot keep: **`UX.md` contains no
mention of Everyday Mode at all**, and its rows are written against the Engineer shell's transport,
tabs, editor and dialogs. `dev/keyboard.browser.test.ts` is likewise the transport's keyboard on the
Engineer surface, driven, and its own docstring says so.

So keyboard coverage is not partial on the Everyday side. It is **zero**, and `AX-10` starts from
nothing.

### 5.2 What a journey is, so that #239 can drive one

A clause reading *every mode is completable using the keyboard alone* is unusable until *completable*
means something a test can decide. This document defines it, and this is the definition #239's sweep
should be written against.

**A keyboard journey is written down before it is driven, and it names four things.**

1. **The start state**, as a screen key from `everyday/screens.ts#SCREEN_NAMES` plus the run context
   from `everyday/types.ts#RUN_CONTEXTS`. There are seventeen screen keys and four contexts, so a
   journey that says *the stage* has not said which of four stages.
2. **The acts**, as keystrokes and nothing else. No `page.click`, no direct focus call, no helper
   that reaches into the shell. If the journey needs a helper the player does not have, the journey
   has proved the opposite of what it set out to.
3. **The end state**, as an observable the mode itself defines: a scored day for Today's tower, a
   judged stage for Campaign, a closed case for Fix a building, a completed rush for Endless rush.
4. **What the player can read at every step**, which is `AX-1` and `AX-16` arriving inside the
   journey rather than beside it. A mode completable by a sighted keyboard user and opaque to a
   non-visual one has passed half a clause.

**One journey per mode**, and the modes are `everyday/modes.ts#EVERYDAY_MODES`: Today's tower,
Campaign, Endless rush, Fix a building. Deriving the list from that array rather than writing four
names is the same discipline `honesty/surfaces.ts` applies to `RUN_CONTEXTS`, and for the same
reason: a fifth mode should become a fifth missing journey, loudly.

### 5.3 The two rows that are not journeys and still matter

**`AX-15`, the way past repeated chrome.** The Everyday rail is 212 px at every width and sits before
the screen region in DOM order, so a keyboard reader traverses it on every screen. The product has
exactly one skip link and it is in the Engineer markup, targeting `#stage`. The Everyday main region
is a `div`, so there is also no `main` landmark to skip to. Both halves are one small change and
neither exists.

**`AX-11`, focus not obscured.** The Everyday shell pins an action bar over a fixed root. This is
2.2's SC 2.4.11 and it is also just a defect: a focused control the player cannot see is a control
they have lost. `:focus-visible` is asserted in `index.html` and the obscuring half is unmeasured.

---

## 6. The instruments

### 6.1 What an automated rule can decide, and what it cannot

This matters more than which tool is chosen, so it is stated first and structurally rather than as a
coverage percentage.

An automated rule can decide **machine-decidable** properties: that an element has an accessible
name, that a contrast ratio clears a number, that a role is valid for its element, that an id
referenced by `aria-describedby` exists, that focus order follows DOM order.

An automated rule **cannot** decide whether a name is *correct*, whether an order is *meaningful*,
whether an alternative *carries the same observations*, or whether a journey is *completable*. Those
are judgements about meaning, and no rule set decides them.

**Five of § 2's seventeen clauses fall in the second group.** `AX-0`, `AX-2`, `AX-5`, `AX-8` and
`AX-10` are not mechanisable in a general sweep, and this document does not pretend they are. What it does
instead is give each of them either a **narrow, product-specific instrument** that can decide the one
question it needs (the honesty corpus for `AX-2` and `AX-16`, a token test for `AX-5` and `AX-8`, a
written journey for `AX-10`) or an honest human owner.

### 6.2 The sweep: two candidates, with costs

| | `axe-core`, injected in the browser tier | `locator.ariaSnapshot()`, pinned per screen |
|---|---|---|
| Dependency | **One new devDependency**, added to a test toolchain that is four packages at the root plus `vite` on `packages/viz`. A small set kept small on purpose, so a sixth is a real decision rather than a formality | **None.** `playwright-core` is already a devDependency and already drives 36 browser test files |
| What it catches | The standard rule set: missing names, invalid roles, broken `aria-*` references, contrast on DOM text, duplicate ids | Every change to the role and name structure of a screen, including a control that silently loses its name |
| What it misses | Everything in § 6.1's second group, and everything drawn on a canvas | The same, plus anything a snapshot does not encode. It is a regression instrument and not a conformance one |
| Would it have caught the Everyday canvas? | **Yes**, as a canvas with no accessible name | **Yes**, and it is the cheaper of the two ways to find out |
| Runtime | Adds to the browser tier's ~157 s | Negligible; it reads a tree the page already has |

Both are defensible and they are not exclusive. The cheap one first is the reasonable order, and the
choice belongs to whoever builds it. One thing to check before committing to the second:
`locator.ariaSnapshot()` is a `playwright-core` API and the version in this tree is pinned in the
root `package.json`, so confirm the API against that pin rather than against the current release.

### 6.3 The zoom row, which is the cheapest thing in this document

`docs/31` § 5 commits the product to laying out at **200 % browser zoom** at the 1280 px tier-1
viewport, conditional on #240's viewport gates existing. **They exist**:
`everyday/viewportGates.browser.test.ts` drives 360 × 800 and 1280 × 800 and measures three clauses
at each. It drives no zoom level and contains neither `zoom` nor `deviceScaleFactor`.

The row's own note gives the method: 200 % zoom at 1280 is geometrically the 640 px layout, so it
rides the gates that exist rather than needing a device. This is a row that has been commitment-only
for one milestone and has had its instrument for less time than anybody noticed.

### 6.4 `prefers-contrast` and forced colours, which are undeclared rather than unsupported

Nothing in the tree reads either preference. That is a defensible position for a product this size
and it is currently held by nobody, which is the problem: two docstrings, `dev/dom.ts:484` and
`dev/reportPanel.ts:34`, already reason about what happens *"under `prefers-contrast`"*, and both
cite **"this project's own accessibility ledger"**.

**There has never been such a ledger.** A tree-wide search returns those two docstrings and nothing
else. They are citations to a document that did not exist, which is [§ D227](../DECISIONS.md)'s class
in its quietest form: a sentence that is correct in what it reasons and wrong in what it points at.
**This document is that ledger**, and § 9 asks for both citations to be repointed here.

`AX-14` is therefore satisfiable two ways and unsatisfied by silence. Read the preference, or write
in the tree that the product does not read it and say what a player in forced-colours mode should
expect. An undeclared preference is a claim nobody made and nobody can check.

### 6.5 The criterion this document hands to #239

#204's second acceptance criterion, *an automated sweep added to CI*, is **word for word** #239's
first, and #239 states that its sweep runs against the standard adopted in pre-production, meaning
this one. Both issues' verification comments identify the duplication and give the same resolution:
whichever lands first owns the criterion.

**This document does not own it.** It is a specification lane in a milestone that writes no
production code, it cannot touch `.github/**` or `packages/**`, and a sweep specified but not built
is not a sweep. So the criterion goes to #239 with § 6.2's two candidates priced, and #204's
remaining four criteria are discharged here: the standard is § 2, the stage text equivalent is § 3,
the colour-blind check is § 4, and the keyboard journey is § 5.

### 6.6 The human checks, and who does them

Five things in this document cannot be mechanised at all. Each names a role rather than a person, so
that the row survives the person leaving.

| Check | Who | When |
|---|---|---|
| `AX-0`, the deletion test | The reviewer of any pull request touching a player surface | Every review |
| `AX-2`, *same observations* | The author of the surface, against § 3.3's four requirements | When a surface gains or loses a fact |
| `AX-5` and `AX-8`, for a **new** signal | The author, at the moment the signal is invented | Before it ships |
| The screen-reader walkthrough | A tester with a screen reader they use, on the stack they use | #239, and § 6.7 |
| The conformance target | The product owner | § 1 |

### 6.7 Screen readers: what this standard promises, and what it will not assert

`docs/31` § 5 records that **no record exists** of any screen reader having been pointed at this
product, on any platform. This document repeats that carefully and adds nothing to it. **Absence of a
record is not evidence of absence.** Somebody may have run one; if so the evidence is outside this
repository and belongs in `docs/31` § 1 with its date.

What matters for a standard is that there are two different promises here and they are often
conflated:

- **The accessibility tree is well formed.** Roles, names and states are correct and stable.
  Mechanisable, affordable, and what §§ 6.2 and 6.3 buy.
- **A screen-reader user can complete a journey.** Not mechanisable at any price, because a screen
  reader is a real assistive stack with its own heuristics and its own users.

**This standard commits to the first and treats the second as a tier-3 claim until a walkthrough is
recorded with its date, its reader and its platform.** Anything stronger would be a claim about
people the project has not met.

---

## 7. Tiering, per `docs/31` § 5's rule

Applying that rule honestly to § 2 gives an uncomfortable table, which is the point of applying it.

| Tier | Meaning | Clauses | Count |
|---|---|---|---|
| **1** | An instrument checks it in CI today | `AX-1` (Engineer), `AX-4` (Engineer), `AX-6` (covered pairings), `AX-13` (CSS half), `AX-15` (Engineer skip link), `AX-16` (registered surfaces) | 6 partial |
| **2** | Checked by hand, with a date | `AX-2`, `AX-9` (Engineer), `AX-11` (visible half), `AX-12` (Engineer) | 4 partial |
| **3** | Best effort; nothing checks it | `AX-0`, `AX-3`, `AX-5`, `AX-7`, `AX-8`, `AX-10`, `AX-14`; the Everyday half of `AX-1`, `AX-4`, `AX-9`, `AX-12`, `AX-15`; the canvas half of `AX-13`; and the obscuring half of `AX-11` | 7 whole, 7 halves |
| **4** | Not supported | none | 0 |

**No clause is wholly tier 1.** Every row that has an instrument has it on one shell, and the shell
it has it on is the one a player meets second. That single sentence is the most useful thing this
document produces, and it is what a sweep run against § 2 will find first.

---

## 8. What this document does not decide, and what it could not measure from the tree

Named rather than quietly omitted, on `docs/28` § 8's model.

1. **The conformance target**, § 1. Marked for the product owner, with all three options priced.
2. **How `tapping-foot` reaches 3:1.** The floor is set here and the remedy is not. Moving the ink
   crosses `guide § 19`; moving the ground crosses the plot's own surface token; changing what is
   drawn is `docs/28` AD-S7's height encoding, which discharges `AX-5` and leaves `AX-7` open. Three
   viable answers, and picking one is a design change this milestone may not make.
3. **Whether the shaft tints are load-bearing.** § 4.3 measures them and refuses to rule, because the
   answer belongs to whoever draws the surface that uses them, and `docs/28` § 2.3 already refuses to
   export a constant ahead of its consumer.
4. **Target size.** SC 2.5.8 is unmeasured and this document did not measure it, because it needs a
   laid-out box in a browser and a specifications lane adds no browser test. It is the one item in § 1.2 with
   a real cost and no number.
5. **Whether `onVerticalDrag` has a single-pointer alternative.** `onHorizontalDrag` does, verified by
   reading it. Its sibling was not read.
6. **Anything about audio.** [§ D344](../DECISIONS.md) rules that audio ships and names #258. When it
   does, SC 1.2.x acquires a subject and § 1.3 item 3's exclusion expires. This document takes no
   position on the ruling and records the expiry so it is not missed.
7. **What a non-visual player experiences today.** Nobody knows, and § 6.7 is why. This document
   describes what the product *exposes*; a walkthrough is the only thing that describes what it is
   *like*, and none has been recorded.

**One finding that belongs to nobody, recorded here so it is not lost.** `docs/34` and `docs/35` are
filed as separate documents and **both open with the heading `# 34`**. One of the two titles is
wrong. It is outside this lane's scope to fix and is a thirty-second change for whoever owns either
file.

---

## 9. Requests to files this document does not own

⬜ **`packages/viz/src/dev/dom.ts:484` and `packages/viz/src/dev/reportPanel.ts:34`** — both cite
*"this project's own accessibility ledger"*, which has never existed (§ 6.4). Repoint both at this
document. The reasoning in each is sound and only the citation is stale, so this is a two-line change
and not a rewrite.

⬜ **`packages/viz/UX.md` § 5** — its header reads *"applies to every surface"* and its seventeen `KB-`
rows are the Engineer shell's; the file does not mention Everyday Mode (§ 5.1). Either scope the
sentence to the surface it describes, or add the Everyday rows. Leaving it is a stale claim of
coverage, which is the more dangerous half of the class [§ D227](../DECISIONS.md) is about.

⬜ **Issue #239** — owns `AX-3`, `AX-5`, `AX-7`, `AX-10` and `AX-14`, the five clauses recorded as
failing, plus the automated sweep criterion handed over in § 6.5 and the screen-reader walkthrough in
§ 6.7. This document writes no acceptance criteria for it.

⬜ **`DECISIONS.md`** — one entry for the adoption of this standard, which is
[§ D473](../DECISIONS.md); and one when the product owner answers § 1, because a conformance target
binds documents and code this module does not own.

⬜ **`docs/05-roadmap.md`** — no new phase row for this work while it is unstarted.

---

## Sources

- **W3C, *Web Content Accessibility Guidelines (WCAG) 2.2*, W3C Recommendation** —
  <https://www.w3.org/TR/WCAG22/>. The success criteria cited by number throughout § 1 and § 2.
  WCAG 2.1 is its predecessor Recommendation at <https://www.w3.org/TR/WCAG21/>; the two differ at
  Level A and AA by the six criteria in § 1.2 plus the removal of SC 4.1.1 Parsing.
- **W3C, *Accessible Rich Internet Applications (WAI-ARIA) 1.2*** — <https://www.w3.org/TR/wai-aria-1.2/>,
  and *ARIA in HTML* — <https://www.w3.org/TR/html-aria/>, for the live-region and role rules `AX-3`
  and `AX-15` rely on.
- [`28-art-direction.md`](28-art-direction.md) § 7 — the queue-age ramp measurement, the method § 4.1
  reuses, and AD-A1 to AD-A6, which this document adopts by reference rather than restating.
- [`31-support-matrix.md`](31-support-matrix.md) § 5 — the four committed assistive rows, the tiering
  vocabulary § 7 uses, and the rule § 0.1 adopts unamended.
- [`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 6.3 and § 7 — the
  screen-reader form's shape, and the plain-language translation table § 3.3 requirement 3 binds to.
- [`../packages/viz/UX.md`](../packages/viz/UX.md) § 5 — the seventeen `KB-` rows, seven of them
  non-negotiable, and § 5.1's finding about their scope.
- [`22-charter.md`](22-charter.md) § 2 and [§ D456](../DECISIONS.md) — `charter P2`'s second test,
  which is `AX-0`.
- [`30-playtest-programme.md`](30-playtest-programme.md) — the programme a screen-reader walkthrough
  would run under, and the recruitment problem § 6.7 inherits from it: this project has recruited
  nobody yet, and a reader who uses a screen reader daily is a harder cohort to seat than either of
  the two that document already prices.
