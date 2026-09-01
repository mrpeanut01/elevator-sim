# Platform and browser support matrix

**Status: adopted as the specification of record for what this product runs on.** GitHub issue
**#203**. Written in M1, which is specifications only — this document changes no behaviour, and every
gap it names is an open item rather than a plan already executed.

**The document's main content is the distance between two sets.** One is *what CI tests today*, and
it is small enough to state in a sentence: **Chromium only, on two desktop operating systems, at a
handful of desktop viewports, with no touch device anywhere.** The other is *what a browser-delivered
simulator is expected to run on*, which is every current browser on every current desktop, and a
phone. Everything below is an attempt to say which parts of that distance are commitments, which are
guesses, and which are refusals — because a tier that nothing tests is a claim, and this repository
has a long record of claims that outlived the thing that made them true.

---

## 0. What is measured, and what is asserted

Read this first. It is the difference between the rest of this document and a wish list.

| Fact | Where it is true |
|---|---|
| CI runs **two** legs: `ubuntu-latest` and `macos-latest` | `.github/workflows/ci.yml`, an explicit `include:` matrix |
| Node is pinned to **one** version, `26`, on purpose | Same file; the header block gives the reason (§ D196/§ D201 found digests bit-identical across Node versions, so a Node axis re-confirms the eliminated variable) |
| The Linux leg must be **x86-64** or the run goes red | Same file, step *The Linux leg is x86-64, or it is a third pin environment* |
| The browser tier installs **Chromium and nothing else**, on **both** legs | Same file: `npx playwright-core install --with-deps chromium`, path read back from `chromium.executablePath()` |
| A browser tier that would skip in CI is a **red run**, with no opt-out variable | `packages/viz/src/dev/browserTier.test.ts` |
| The suite takes **33 min** (Linux) and **56 min** (macOS) per leg | `AGENT_STATUS.md`, commit `aadaaaf` — the first uncancelled CI result on this branch |
| The browser tier itself is **~157 s** of that | `.github/workflows/ci.yml`, the browser-tier comment block |
| The build declares **no `build.target`**, so it inherits Vite 8's default | `packages/viz/vite.config.ts` — `build:` sets `copyPublicDir`, `outDir`, `sourcemap`, and no target |
| No touch-specific code path exists anywhere in the product | Measured: a tree-wide search for `touchstart`/`touchend`/`TouchEvent`/`maxTouchPoints`/`pointer: coarse`/`hover: none` returns **nothing**. The two hits for `touch-action` are one CSS declaration on `.elev-occ` and the docstring of `dev/dom.ts#onHorizontalDrag` that explains it |
| Cold first load of the pre-CDN deployment was **32.2 s**; warm was **0.13 s** | [`16-static-site-deployment.md`](16-static-site-deployment.md) § 1 |

**Everything in §§ 1–3 below that is not in that table is a commitment, not a measurement**, and each
one says which it is in its own row.

---

## 1. The supported set, in tiers

Four tiers. The tier boundary is **what evidence exists**, not what is likely to work — a browser
that almost certainly works and that nothing has ever opened the product in belongs in tier 3, and
saying so is the point of having four tiers rather than a list of logos.

### Tier 1 — Supported and tested in CI

The only tier backed by a gate that can fail. Everything here runs on every pull request, on both
legs, and a run in which it would silently skip is red rather than green
(`packages/viz/src/dev/browserTier.test.ts`).

| Platform | Browser | Evidence |
|---|---|---|
| Linux, x86-64 (`ubuntu-latest`) | **Chromium** headless shell, from `playwright-core` | 33 `*.browser.test.ts` files, driven through a real Vite dev server against the built `core` |
| macOS (`macos-latest`, ARM64 today) | **Chromium** headless shell, from `playwright-core` | The same 33 `*.browser.test.ts` files, same gate |

Three things about this tier that a reader will otherwise assume wrongly:

- **The Chromium version is Playwright's, not a policy.** `ci.yml` deliberately reads the path back
  from `chromium.executablePath()` rather than pinning a revision number, because a pinned revision
  goes stale on the next Playwright bump *with the tier silently skipping again*, which was the
  original defect (issue #142). The consequence for this matrix is that **the tested Chromium
  version floats with the `playwright-core` devDependency** (`^1.62.1` at the time of writing) and is
  not independently chosen. That is the right trade for the tier's own purpose and a weakness for
  this document's: nothing here tests an *old* Chromium.
- **It is the headless shell, not a full browser.** The headless shell is missing the pieces a
  support matrix sometimes cares about — it is not where a printing bug, an extension conflict, or a
  media-codec problem shows up.
- **macOS on ARM64 and Linux on x86-64 is a real architecture axis, and it was not chosen for
  browsers.** It exists because `ci.yml`'s header records pins that inverted between the two
  (§ D201). The browser tier gets it for free. Nobody has measured whether any *browser* behaviour
  differs across it, and this document does not claim it has been.

### Tier 2 — Supported, tested by hand, with the date of the last drive

Tier 2 is the honest home for everything the product has actually been opened in by a person, with
the result written down. **A tier-2 row with no date is a tier-3 row that has not admitted it.**

| Platform | Browser | Last driven | Evidence |
|---|---|---|---|
| Desktop Chromium at 1280×800 | Chromium | continuous | `packages/viz/src/dev/fold1280.browser.test.ts` — this is really tier 1, listed here because § 2 needs the viewport |
| Desktop, narrow layouts at 375×667, 414×896, 767×700 — **the Engineer surface** | Chromium | 2026-07-30 (wave 12 drive phase, commit `5d4b782`) | `packages/viz/UX.md` rows `RX-03`, `RX-04b`, `RX-12`. The shell those three were fixed against is the one `@media (max-width: 767px)` restyles; `packages/viz/index.html` did not load `everyday/boot.ts` until 2026-08-12 ([§ D335](../DECISIONS.md)), so this row says nothing about the shell a player now meets first |
| Narrow layouts at 360×800 and 375×667 — **the Everyday shell** | Chromium | continuous, since GitHub issue #292 | `packages/viz/src/everyday/viewportGates.browser.test.ts` — really tier 1. It measures all three of § 2's clauses and **currently registers 18 failures across them** — ~~*21*~~ until GitHub issue #303 closed the three clause-2 rows on 2026-08-29 ([§ D391](../DECISIONS.md)) — which is the state § 2 commits against and #240 is open to fix. Every one of the 18 is now #240's |

**And that is the whole of tier 2, which is the finding.** No row in this table names Firefox, Safari,
or Edge, because no record in this tree says the product has been opened in one. If you have driven
it in one, add the row with the date and what you saw; if you cannot date it, do not add it.

### Tier 3 — Best effort: expected to work, nothing tests it

Everything here is a **claim**, in this document's sense: a statement with an argument behind it and
no instrument. The argument is the same for every row and is stated once — the product is a single
static page of standards-track HTML, CSS and ES modules, built by Vite 8 with **no `build.target`
override**, so it compiles to Vite's `baseline-widely-available` default. That target is by
definition the feature set available across current Chrome, Edge, Firefox and Safari. The page has no
polyfills, no vendor prefixes anybody wrote deliberately, and no browser sniffing.

| Platform | Browser | Why it is expected to work | Why it is not tier 1 or 2 |
|---|---|---|---|
| Windows 10/11 | Chrome, Edge | Same Chromium engine the tier-1 gate drives | No Windows leg exists in `ci.yml`, and adding one is § 4's cost question |
| macOS | Chrome, Edge | Same engine as tier 1, different host OS from the tier-1 macOS leg only in browser build | Never driven |
| Windows, macOS, Linux | **Firefox** (current) | Inside the Vite baseline target; no Chromium-only API is used | **Nothing has ever loaded this product in Gecko.** Canvas text metrics, `container` queries and flex shrink behaviour are exactly the places the layout assertions in `fold1280.browser.test.ts` would be engine-sensitive, and every one of those assertions is Chromium-only |
| macOS | **Safari** (current) | Inside the baseline target | As Firefox, plus: WebKit is the engine most likely to differ on canvas rendering and on the `@container` rules `index.html` uses for the dispatcher editor's two-column layout |
| Chrome OS | Chrome | Chromium | Never driven |
| **Android** | Chrome | Chromium engine, and § 2's layout commitment covers the width | **Touch interaction is out of scope for launch** (§ 2). The layout is best effort at 360 px and above; the *interaction* is unspecified. A phone is not a promised way to play |
| **iOS / iPadOS** | Safari, and every other browser on the platform | — | The union of the Safari row and the Android row: an untested engine **and** an unspecified interaction model. **This is the weakest row in the whole matrix** and the one most likely to be simply broken |

**Read the Firefox and Safari rows as the two most likely places this matrix is already wrong.** The
product draws its main surface on a `<canvas>` and asserts *where boxes land* in CSS; those are the
two subsystems where engines diverge, and the entire body of evidence is from one engine.

### Tier 4 — Not supported

| What | Why | What a user sees |
|---|---|---|
| Internet Explorer, and any browser outside Vite's `baseline-widely-available` target | The bundle ships untranspiled modern syntax | A blank page or a module parse error. No graceful message is planned, and none is promised |
| Any browser with JavaScript disabled | The product *is* the script; there is no server-rendered view | A blank page |
| Screen sizes below **360 px** of CSS width | Below the narrowest width anything has ever been driven at | Unspecified. Nothing has looked |

**A tier nothing tests is a claim.** Tiers 3 and 4 are entirely claims. Tier 2's second row is a
claim about a drive that happened once, twenty-five days before this document, on a commit that has
since been superseded many times. Only tier 1 is a fact that a red run defends.

**Note what tier 4 does *not* contain: phones.** Touch devices are tier **3**, not tier 4, and § 2 is
the reason — the layout work is in scope and the interaction work is not, which is a `best effort`
shape rather than a refusal. Putting them in tier 4 would have been the tidier table and the less
honest one.

---

## 2. Touch and small screens — the decision, not the gap

This section exists because issue **#240** needs a target and the charter's non-goals do not settle
this one. [`22-charter.md`](22-charter.md) § 5 lists ten refusals and none of them is about devices.
So the question is open, and leaving it open would hand #240 a layout task with no acceptance
criterion — which is how a screen gets built, shipped, and never measured.

### What exists today, measured rather than assumed

Three separate facts, and they do not point the same way:

1. **There is no touch code.** No `touchstart`, no `TouchEvent`, no `pointer: coarse` media query, no
   `hover: none` query, no `maxTouchPoints` check anywhere in `packages/`. There is no tap-target
   sizing rule and no gesture handler.
2. **There is, nevertheless, one control that would work under a finger.** The elevation view's
   occupancy bar is driven by `dev/dom.ts#onHorizontalDrag` / `#onVerticalDrag`, which use **pointer
   events rather than mouse events specifically so a touch drag works**, and the stylesheet sets
   `touch-action: none` on `.elev-occ` so the page does not scroll under it. That is one control, and
   its docstring says it was a deliberate choice.
3. **The stylesheet already has small-screen layouts, and they have been driven once.**
   `packages/viz/index.html` carries media queries at **1339, 1179, 899, 767 and 720 px**, and
   `packages/viz/UX.md` records the 767 px block being reproduced broken at 375×667 (a 236 px rail
   with the canvas at **0 %** of the height), fixed in `5d4b782`, and re-driven green at 375, 414 and
   767. `render/layout.ts` has a companion fix: at 360 px the shipped gutter request was *wider than
   the canvas*, which drew every building as one shaft on every phone (issue #73).

So the product is not touch-hostile by construction, and it is not touch-ready either. What it is, is
**a desktop product with responsive CSS that somebody fixed twice under pressure and nothing watches.**

### The commitment

**Touch is `best effort` — tier 3 — and small-screen *layout* is in scope for launch while touch
*interaction* is explicitly out of scope for launch.** The split is the whole decision, so it is
stated as two clauses that can each fail:

- **In scope, and #240 builds to it:** at **360 px** of CSS width and above, in a tier-1 browser, the
  product **lays out without horizontal overflow, keeps the stage canvas at 60 % or more of the
  viewport height, and exposes no control that is drawn but unreachable.** That is not an aspiration —
  it is the three things `UX.md`'s `RX-03`, `RX-04b` and `RX-12` already assert in prose, given a
  width and a gate. 360 px is chosen because it is the narrowest width any evidence in this tree
  touches (`layout.test.ts`'s 360 px case), so committing to it costs a test rather than a redesign.

  **The gate exists now, it measures all three clauses, and the product fails ~~*all three*~~ two of
  the three** (`packages/viz/src/everyday/viewportGates.browser.test.ts`, GitHub issue #292).
  Measured 2026-08-27 on the Everyday shell: at 360×800 the screen region is 148 px against content
  that lays out at 241, `.everyday-main` clips **93 px** on the main menu and **337 px** on the
  stage, **five** controls on the menu cannot be brought into the viewport by any gesture — all four
  mode tiles, and the pinned action bar's primary, `Play today's tower`, drawn at `left: 360` and so
  wholly outside the viewport — and the stage canvas held **42.5 %** of the height against this
  clause's 60 %. At 375×667: 78 px, 322 px, five controls, **51.0 %**. The **cost of the
  commitment is now visible**, which is what a gate is for; the layout work is #240's and the
  findings are registered rather than suppressed, so a new one is red and a fixed one is red as
  *delete this entry*.

  That paragraph is the 2026-08-27 measurement and its figures are left as they were taken. The
  stage-canvas half of it has since moved, and the correction is the next paragraph rather than an
  edit to those numbers — a dated measurement with its figures struck out records nothing.

  **Clause 2 is met, and that changed on 2026-08-29** — GitHub issue #303, [§ D391](../DECISIONS.md).
  `everyday/stageScreen.ts` declared the Everyday stage canvas as a literal `height:340px`, with no
  breakpoint, no viewport unit and no clamp, so it held **42.5 %** at 1280×800 and at 360×800 and
  **51.0 %** at 375×667 — failing at a tier-1 desktop viewport as well as at phone widths, which is
  why it was filed apart from #240 rather than folded into it. It is now `60vh`, and the gate's own
  sweep reports **60.0 %** at all three viewports. The other two clauses are unmoved and still #240's:
  a taller canvas created no new clipping and put no control out of reach at any of the three widths.

  Read the margin honestly: `60vh` **is** the clause's number, so the margin is zero by construction
  and the same figure `RX-03` already uses on the Engineer shell. A layout change that put anything
  inside the canvas's own box would take it under and the gate would go red — which is the direction
  a commitment should fail in, and the reason no larger figure was invented to buy slack.
- **Out of scope for launch, and stated as a refusal rather than a backlog item:** tap-target sizing,
  gesture affordances, a touch-first control layout, hover-dependent affordances having non-hover
  equivalents, and any claim that a phone is a *supported* way to play. **A phone user is not
  promised a working product**, and the matrix says so where a user can see it rather than only here.

### Why this way, and what it would take to change

Three reasons, in the order they carried weight.

1. **A `supported` claim we cannot test is the exact defect this repository records.** Committing to
   touch support today would put a tier-1-sounding promise behind zero instruments: no touch device
   in CI, no emulation in the browser tier, no tap-target rule anywhere in the stylesheet. Playwright
   can emulate touch (`hasTouch`, `isMobile`) on the Chromium the tier already installs — so this is
   cheap to *start* testing, which is why touch is `best effort` rather than `not supported`. But
   emulated touch on a desktop Chromium is not a phone, and a matrix that said `supported` on that
   evidence would be a claim wearing a gate.
2. **The product's core surface is a dense instrument, and shrinking it is a design question this
   document may not answer.** The Engineer surface at 1280 px is a canvas plus a rail plus a
   contextual drawer; the honest small-screen answer is probably *Everyday Mode only, with the
   Engineer door hidden below some width* — and that is an art-direction and product decision, not a
   support-matrix decision. It also collides with [`22-charter.md`](22-charter.md) § 5 non-goal 10,
   which forbids an entry-screen override that survives a reload *whatever storage it wears*
   ([§ D335](../DECISIONS.md), [§ D338](../DECISIONS.md)) — a viewport-conditional entry screen is
   not that, but it is close enough that somebody has to rule on it. Deciding it here would be this
   document overreaching.
3. **Hover is load-bearing in at least one place and nobody has enumerated them.** `UX.md`'s `LR-22`
   is about the live rail's hover surviving a 60 Hz redraw. A touch device has no hover. Until
   somebody has counted the hover-dependent affordances, a touch-support promise is a promise about
   an unmeasured surface.

**What would move touch from `best effort` to `supported`:** an enumeration of hover-dependent
affordances with a non-hover equivalent for each; a tap-target minimum in the stylesheet with a test
that reads it the way `surfaces.test.ts` already reads `DRAWER_BREAKPOINT_PX` against the
`@media (max-width: 1339px)` rule; and at least one browser-tier file driving `hasTouch: true` at a
phone viewport through a real journey rather than a static render. None of those is expensive. All
three are #240's, not this document's.

### The viewport floor, and why 1280 is not it

There **is** a de-facto floor in the tree today and it is worth naming precisely, because it is easy
to read it as narrower or wider than it is.

| Width | What is true at it | Where |
|---|---|---|
| **1600, 1440, 1400, 1280** | Every browser-tier file's default viewport is one of these. 1280×800 is the only width at which **laid-out geometry** — where boxes land, whether text is clipped — is asserted continuously | `packages/viz/src/dev/fold1280.browser.test.ts`, whose whole argument is that no node test in the package can see a box |
| **1340** | The right rail becomes an overlay drawer. The constant and the stylesheet rule are asserted **against each other**, so they cannot drift | `packages/viz/src/dev/surfaces.ts` `DRAWER_BREAKPOINT_PX = 1340`, checked in `surfaces.test.ts` against `index.html`'s `@media (max-width: 1339px)` |
| **1280** | **Nothing.** There is no 1280 px rule in the stylesheet — see the note below this table | — |
| **1180** | `[data-hide-narrow]` hides the header's spec line and the banner. § D236 took the **phase pill** and the **mode select** back out of that set: hiding the mode select was a functional lockout, because `display: none` removed it from the tab order and no other control anywhere changes Casual/Engineer (issue #72) | `packages/viz/index.html`, `@media (max-width: 1179px)`; `dev/shellChrome.test.ts` asserts which elements carry the attribute and which may not |
| **899, 767, 720** | Further layout blocks, each asserted only as *the stylesheet contains this rule* | `index.html`; `surfaces.test.ts` finds the 767 px block with `indexOf` and reads the rules inside it |
| **420** | ~~The single narrowest viewport driven anywhere in the browser tier~~ — one live-metrics card overflow case, and no longer the narrowest | `packages/viz/src/dev/liveMetrics.browser.test.ts:191` |
| **375** | Driven **continuously**, on the Everyday shell, against all three of § 2's clauses. ~~Driven by hand once, 2026-07-30, and by nothing since~~ — that remains true of the **Engineer** shell, which `RX-03` is about | `packages/viz/src/everyday/viewportGates.browser.test.ts`; `packages/viz/UX.md` `RX-03` for the hand-drive |
| **414** | Driven by hand once, 2026-07-30, and by nothing since | `packages/viz/UX.md` `RX-03` |
| **360** | ~~The narrowest width any test in the tree names, in a pure layout unit test~~ — **driven** now, at 360×800, on the main menu and the stage, with geometry asserted at both | `packages/viz/src/everyday/viewportGates.browser.test.ts`; `render/layout.test.ts` for the pure unit |

~~**So the current de-facto support floor is 1280 px for asserted geometry and 420 px for anything
being driven at all**~~ — **that was true until GitHub issue #292.** The floor for *asserted geometry*
is **360 px** now, on the Everyday shell, at both of § 2's named widths. What has not changed is the
thing that sentence was really reporting: the 360–767 band is still CSS that was correct on one
afternoon, and the gate that now watches it is watching it **fail** — 21 registered findings across
the three clauses, listed in `viewportGates.browser.test.ts`'s `OUTSTANDING`. A gate at a width is
not the same as a product that passes at it, and turning the second column of that table into gates
is done for § 2's three clauses and undone for everything else. #240 is the layout work. This document's commitment above — 360 px, three
clauses — is what those gates should assert.

**And one row of that table was wrong before it was written, which is worth recording rather than
quietly fixing.** `packages/viz/src/render/canvas.ts`'s docstring for the unanswered-call surface says
the landing `<select>` *"is `wide-only` (dropped below 1280 px)"*, and `packages/viz/UX.md`'s `RS-02`
records a drive at 1024 px reporting that *"the bank filter, landing selector and PNG export collapse
below 1280 px"*. **There is no `wide-only` class anywhere in `packages/viz`, and no 1280 px media
query in `index.html`** — the stylesheet's breakpoints are 1339, 1179, 899, 767 and 720. Whatever
mechanism the drive observed, the sentence naming it has outlived it. It is a **stale statement about
a viewport**, and it is the same class as `CLAUDE.md`'s recorded stale refusals: prose that tells a
reader a control is absent at a width where nothing makes it absent. A support matrix built by reading
that sentence would have published 1280 px as a support boundary that does not exist. **Fixing the
docstring is not this document's to do** — M1 changes no `.ts` — so it is filed here and in § 7.

---

## 3. The performance budget for `charter S9`

[`22-charter.md`](22-charter.md) § 4 states **`charter S9`**: *cold load to interactive under 3 s on a
mid-range laptop*, instrument *CI budget, failing the build*, failing when *the measured cold load
exceeds 3 s on the target matrix*. § 4's own honesty table records that its instrument **does not
exist**: `.github/workflows/` carries three workflows and no load budget, and
`validation/perfScaling.test.ts` measures simulation throughput rather than page load. Issue **#238**
builds the instrument. This section specifies what it should measure so that it can fail.

### What [`16-static-site-deployment.md`](16-static-site-deployment.md) already measured, and what it does not settle

[`16-static-site-deployment.md`](16-static-site-deployment.md) § 1 measured the live deployment:
**32.2 s** cold first page load with the container asleep, **0.13 s** warm, and a separately measured
28.7 s cold `GET /api/challenges`. That is the reason the page moved to a CDN and the API stayed in a
scale-to-zero Container App: *"nothing can call `/api/wake` until the page that would call it has
arrived."*

**Neither number is a `charter S9` measurement, and it matters which way each one misleads.**

- **32.2 s was container cold-start, not page weight.** It is a measurement of an architecture that no
  longer serves the page. Quoting it as the `charter S9` baseline would overstate the problem by an
  order of magnitude and would make any CDN deployment look like a triumph on a budget it never had
  to meet.
- **0.13 s was a warm *page load*, not *time to interactive*.** It is the transport, not the boot: it
  does not include parsing the bundle, fetching the eight reference-data documents and
  `/__buildings.json` that `vite.config.ts` emits, constructing the shell, or running whatever the
  boot path runs before a player can press anything. Quoting it as the `charter S9` baseline would
  understate the problem, which is the more dangerous direction, because it would let `charter S9`
  be declared met by a number that was never about `charter S9`.

So: **`16-static-site-deployment.md`'s figures bound the problem from both sides and settle nothing
in the middle.** The budget below has to be measured, not inferred from them.

### The budget, stated so CI can enforce it and so it can fail

Three numbers, on a **production build** (`npm run build:web -w @elevator-sim/viz`) served as static
files, loaded with a cold HTTP cache, in the tier-1 Chromium, at 1280×800:

| # | Metric | Budget | Why this number |
|---|---|---|---|
| **B1** | **Time to interactive** — from navigation start to the first moment a player-facing control responds | **≤ 3 000 ms** | `charter S9` verbatim. This is the criterion; B2 and B3 exist so that a B1 failure can be diagnosed rather than merely observed |
| **B2** | **Total transferred bytes** for the first load, compressed, excluding source maps | **≤ 1 200 kB** | A ceiling, not a target. `16-static-site-deployment.md` § 1 calls the bundle *"a few hundred kilobytes"*; this leaves headroom and still fails loudly on an accidental dependency. **Set it to the measured value plus 25 % on the first run and tighten it, rather than adopting this figure unmeasured** |
| **B3** | **Main-thread blocking time** during boot | **≤ 800 ms** | The half of B1 that a faster network cannot fix. A simulator that boots by simulating is exactly the product that fails here first |

**Interactivity needs a definition that a machine can check, or B1 is unfalsifiable.** The definition:
*the first moment at which the primary action control of the opening screen is present in the
document, enabled, and its handler bound.* The opening screen is Everyday Mode
(`packages/viz/index.html` loads `everyday/boot.ts`), so this is a specific element and a specific
enabled state, not a heuristic. **Do not use a vendor metric whose definition can change under you** —
a budget defined by someone else's algorithm is a published number pinned to nothing, which
[`../CLAUDE.md`](../CLAUDE.md) already refuses in the statistical register.

### "A mid-range laptop", when the runner is not one

This is the part of `charter S9` that cannot be met literally, and pretending otherwise would put a
number in a table that means nothing.

**A GitHub-hosted runner is not a mid-range laptop, and it is not consistently anything.**
`ubuntu-latest` and `macos-latest` are shared virtual machines whose throughput varies with what else
is on the host; the same suite measured **33 min** on Linux and **56 min** on macOS on one commit
(`AGENT_STATUS.md`, `aadaaaf`). A wall-clock budget on hardware with that spread will produce flaky
red runs, and a flaky gate gets an exemption, and an exemption *"is where this class of problem goes
to be forgotten"* — `ci.yml`'s own words about the browser tier, and the reason it refused a one-leg
matrix.

So the honest specification is three-part:

1. **B2 is exact and deterministic.** Bytes do not vary with runner load. **Enforce B2 as a hard gate
   on both legs.** It is the only one of the three that can be a plain assertion, and it is the one
   that catches the most common real regression: somebody adds a dependency.
2. **B3 is enforced on a fixed CPU-throttle factor, not on raw wall clock.** Drive the tier-1
   Chromium through CDP with a stated throttling rate, so the measurement is *"this much work"*
   rather than *"this fast a machine"*. The throttle factor is then the thing that stands in for
   "mid-range laptop", it is a **named constant in the repository** rather than an implicit property
   of the runner, and changing it is a visible edit that a reviewer can refuse. **The factor itself
   must be calibrated against a real mid-range laptop once, and that calibration recorded with its
   date and machine** — exactly as `ci.yml`'s header records the environment its pins are true of.
3. **B1 is reported on every run and gates only on a rolling comparison, never on a single run.**
   Fail the build when the median of the last *N* runs on `main` crosses 3 000 ms, or when a pull
   request's measurement exceeds the `main` median by more than a stated margin. A single-run wall
   clock on a shared VM is a coin flip; a median is a measurement. **This is a weaker gate than
   `charter S9` asks for and this document says so plainly** rather than quietly redefining the
   criterion — which [`22-charter.md`](22-charter.md) § 4 forbids in terms: *a criterion that work
   fails to meet is raised, not weakened*.

**What that means for the `charter S9` verdict.** It is met when B1's rolling median is under
3 000 ms **and** the throttle factor has been calibrated against a named real machine. Until the
calibration exists, `charter S9` is *partially instrumented* and must be reported as such — not as
met. A criterion satisfied by an uncalibrated proxy is a criterion satisfied by assertion, which is
the failure [§ D163](../DECISIONS.md) refused to write.

**One prohibition, inherited rather than invented.** [`22-charter.md`](22-charter.md) § 6 already
says it about `charter S9`: if the load budget can only be met by cutting a figure, the criterion is
**not met**, and the change is refused under `charter P2`. A budget met by deleting a number the run
produced is not a budget.

---

## 4. What CI would have to add, and what it costs

**A matrix nobody can afford to test is a matrix that will quietly become a lie.** That sentence is
the reason this section is here rather than a list of browsers somebody would like. The costs below
are derived from the one measurement this repository has: **33 min on Linux and 56 min on macOS per
leg**, of which the browser tier is **~157 s** (`ci.yml`).

### The arithmetic, and the one number that matters

The browser tier is **~157 s out of ~2 000–3 400 s**. That is roughly **5–8 %** of a leg. So the
cost of a second browser engine is *not* a second CI leg — it is a second pass over the tier, on the
same leg, at roughly the tier's own cost. **The ~157 s was measured over the 25 files the tier held
then; the tier holds 33** and the timing has not been re-measured, so read the percentage as the
shape of the answer rather than as a current figure.

> **Two numbers in that sentence and only one of them is a claim about now.** The 25 is a *dated*
> figure — a correct record of what the ~157 s was measured over — so it is written without the
> backticked filename that `viewportGateClaims.test.ts`'s shape keys on, and no guard re-derives it,
> because re-deriving it would replace a true record with today's count. The 33 is a claim about the
> tree and sits in a shape that guard reads. It said **29** through the wave that corrected four of
> its siblings, because the sentence wrapped between `29` and the shape's next token and the regex
> matched a literal space. GitHub issue #230, [§ D423](../DECISIONS.md).

| What to add | What it buys | What it costs | Verdict |
|---|---|---|---|
| **Firefox** on the existing Linux leg | Tier 3's largest claim becomes a fact. Gecko is where the canvas and `@container` assertions are most likely to differ | ~157 s per leg when the tier held 25 files and the tier holds 33 now, so somewhat more, plus one more Playwright browser download (size unmeasured — `playwright-core install firefox` reports it), and a real risk of an initial burst of engine-specific failures that are the product's, not the tier's | **Recommended, and the highest-value single addition.** Run it on the **Linux leg only** — the engine is the variable, not the host OS |
| **WebKit** on the existing macOS leg | Safari — and, more to the point, **every browser on iOS**, all of which are WebKit whatever their name | ~157 s on the leg that already takes 56 min; a Playwright WebKit download | **Recommended second.** On macOS, because Playwright's Linux WebKit is a build that is not Safari, and testing a not-Safari to claim Safari support is the shape of defect this repository records |
| **A Windows leg** (`windows-latest`) | The largest desktop user base by share, on an engine tier 1 already covers | A **whole third leg** — ~33–56 min of runner time per PR, plus the pin-portability question `ci.yml`'s header opens: a third platform is *a third pin environment whose pin set nobody has measured*, and § D201 found 26 pins **exactly inverted** between two platforms | **Refused for now, and the reason is not the minutes.** It would fork the pinned-digest question three ways. If Windows support ever needs to be a tier-1 claim, it should be a **browser-tier-only** leg that runs no statistical pins |
| **A touch/mobile emulation pass** | § 2's `best effort` becomes measurable | Small: Playwright's `hasTouch`/`isMobile` on the **already-installed** Chromium. A handful of files at a phone viewport | **Recommended, and cheapest of all.** It is #240's gate |
| **A real device cloud** | Actual Safari on actual iOS; actual Android Chrome | A paid third-party service, credentials in CI, and a standing bill against a deployment whose entire design principle is that it *"bills nothing at rest"* ([`16-static-site-deployment.md`](16-static-site-deployment.md) § 2) | **Refused.** Out of proportion to a project viewer |
| **An old-Chromium leg** | Coverage of the "floats with `playwright-core`" weakness in § 1 | A pinned second browser download, and the maintenance of a version that goes stale by definition | **Refused.** The Vite baseline target is the control here; a stale pinned browser is a worse instrument than a stated target |

### The rule this section is really specifying

**Every tier-1 row must be a row a red run defends, and adding a tier-1 row means adding its gate in
the same change.** This is `browserTier.test.ts`'s own argument generalised: a browser named in tier 1
whose tests skip is worse than a browser named in tier 3, because tier 1 is where a reader stops
checking. If Firefox is added to tier 1 and its files are allowed to skip when the download fails,
the matrix has acquired precisely the defect issue #142 fixed — **a skip and a pass render identically
in the summary line.**

And the converse, which is the part that will actually be tempting: **if a tier-1 addition turns out
to be unaffordable, the browser moves back to tier 3 in this document — it does not stay in tier 1
with an exemption.** `ci.yml` refused a per-leg exemption for exactly this reason, and
`dispatch/deadCode.test.ts` says the same thing about its own allowlist.

---

## 5. The accessibility intersection

Issue **#204** writes the accessibility standard. **This section does not write it**, and a reader
looking for the standard should stop here and read that document when it exists. What belongs in a
*support matrix* is narrower: which assistive configurations are part of the supported set, on which
tier, and with which instrument — because a screen reader and an OS zoom level are as much a platform
as an operating system is.

**The matrix commits to four rows and defers the fifth entirely.**

| | Commitment | Tier | Instrument today |
|---|---|---|---|
| **OS / browser zoom** | The product lays out without horizontal overflow and without clipped text at **200 % browser zoom** at the 1280 px tier-1 viewport | Supported, tested — **once #240's viewport gates exist** | None yet. This is nearly free once they do: 200 % zoom at 1280 is geometrically the 640 px layout, so it rides on the same gates rather than needing its own device |
| **`prefers-reduced-motion`** | Already honoured, and already tested | **Tier 1 today** | `packages/viz/UX.md` `KB-14`, `packages/viz/src/dev/motion.ts`, `motion.test.ts` — the decision was moved out of `main.ts` specifically so it could be asserted without an OS that has the preference set. **This is the model for every row in this table** |
| **Keyboard-only operation** | Every control reachable and operable without a pointer | **Best effort** — asserted in places, never swept | `keyboard.browser.test.ts` and `UX.md`'s `KB-` rows cover named journeys. Nothing enumerates the surface, so this is a claim about the parts somebody checked |
| **Screen readers** (VoiceOver, NVDA, JAWS, Orca) | **Best effort, and named as untested.** No screen reader has ever been pointed at this product, on any platform | Best effort | **None**, and none is cheap: a screen reader is a real assistive stack, not an emulation. Playwright can assert the *accessibility tree* — roles, names, states — which is a genuine and affordable instrument, and it is not the same claim as *a screen-reader user can complete a journey*. #204 decides which of the two the project promises |
| **`prefers-contrast`, forced-colors, high-contrast modes** | Deferred to #204 entirely | Unspecified | `noteContrast.browser.test.ts` measures contrast ratios of drawn notes; nothing reads a contrast preference |

**The one thing this document asserts about accessibility that #204 may not weaken:** whatever
standard #204 writes, **a row in it that no instrument checks is a tier-3 claim and must be labelled
one.** That is not this document colonising #204's scope — it is the same rule §§ 1 and 4 apply to
browsers, applied to the same table, and it is [`../CLAUDE.md`](../CLAUDE.md)'s standing requirement
in its accessibility form: name the non-test caller, or say there isn't one.

---

## 6. Review trigger — what makes this matrix stale

**Browser support decays silently, and this document has no gate.** Every table above is prose. That
is a deliberate M1 outcome — this milestone is specifications only — and it means this document is
exactly the kind of artefact [`../CLAUDE.md`](../CLAUDE.md) records going stale four times in one
status row: *a published number goes stale the same way, a stated mechanism goes stale the same way,
and a stated **refusal** goes stale the same way, which is the more dangerous half.*

**The refusal in § 2 is this document's most dangerous sentence** — *touch interaction is out of scope
for launch* — because it tells a reader not to build something. The moment #240 lands a touch
affordance, that sentence is a stale refusal guarding a live control, which is § D227's defect
exactly.

### Re-read this document when any of these happens

Each row names an observable event rather than a date, because a calendar reminder is the thing
everybody snoozes.

| Trigger | Why it invalidates something here | What to re-measure |
|---|---|---|
| **`.github/workflows/ci.yml`'s matrix changes** — a leg added, removed, or retargeted | § 1 tier 1 is a transcription of that file | The whole of § 1 and § 4's arithmetic |
| **`playwright-core` is bumped** in `package.json` | The tested Chromium version floats with it (§ 1) | Whether the tier still passes, and whether the new browser's baseline moved |
| **A `build.target` appears in `packages/viz/vite.config.ts`** | Tier 3's *entire* argument is that no target is set, so the Vite 8 default applies | Every tier-3 row, and tier 4's first row |
| **#240 lands any touch or small-screen work** | § 2's refusal becomes a stale refusal the moment a touch affordance ships | § 2's commitment, both clauses, and the § 5 zoom row that rides on #240's gates |
| **#238 lands the performance budget** | § 3 is a specification for work that will then exist | Replace § 3's proposed numbers with the measured ones, **and record the throttle calibration's machine and date** |
| **#204 lands the accessibility standard** | § 5 defers to it | § 5's table, which should shrink to a pointer once the standard exists |
| **Any new browser-tier file is added** | § 2's viewport table is a census of driven widths | The viewport table, which is derived from the tier and will drift the moment somebody drives a new width |
| **A `@media` breakpoint is added to or removed from `packages/viz/index.html`** | § 2's viewport table transcribes them, and § 7 item 6 records one figure in this repository's prose that already does not correspond to any rule in that file | The viewport table, by `grep -n "@media" packages/viz/index.html` and nothing else |
| **A user reports a defect in a tier-3 browser** | A tier-3 row is a claim; a report is evidence against it | Move the row to tier 4, or add the gate that makes it tier 1. **Do not leave it in tier 3 with a footnote** |

### And the standing one

**Re-read this document at every milestone gate**, and re-derive § 0's table from the tree rather than
from the previous version of this file. § 0 is nine rows of measurement and every one of them is a
`grep` or a `sed` away. `CLAUDE.md`'s Phase 9 row records the same lesson four times over — figures
re-measured per branch are stale the moment the branch merges — so the rule here is the one that row
arrived at: **measure once, after integration, or not at all.**

---

## 7. What this document could not settle from the tree

Recorded because a specification that hides its own open items is the defect it exists to prevent.

1. **No browser other than Chromium has ever loaded this product**, as far as any record in this tree
   shows. Tiers 3's Firefox and Safari rows are reasoned, not observed. If somebody has driven one,
   that evidence exists outside the repository and should be written into § 1 with its date.
2. **No `charter S9` measurement exists at all.** § 3's three budgets are specified, and the only two
   figures in the tree that touch page load — `32.2 s` cold and `0.13 s` warm,
   [`16-static-site-deployment.md`](16-static-site-deployment.md) § 1 — measure a superseded
   architecture and a metric that is not time-to-interactive. **B2's 1 200 kB in particular
   is a ceiling reasoned from a prose description of the bundle** — *"a few hundred kilobytes"* — and
   should be replaced by the measured value on #238's first run.
3. **The Windows/Chromium share of real users is unknown** because there is no telemetry
   ([`22-charter.md`](22-charter.md) § 4 records `grep -ril telemetry` returning zero files). § 4's
   refusal of a Windows leg is therefore a cost judgement made without a usage measurement, and it
   should be revisited when [`26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md)'s posture
   produces one — if it ever does.
4. **Nobody has enumerated the hover-dependent affordances**, which § 2 names as one of the three
   things blocking a touch `supported` claim. It is a count somebody can do in an afternoon and it
   has not been done.
5. **The macOS leg's architecture is ARM64 today and is not asserted**, unlike the Linux leg's x86-64,
   which `ci.yml` fails the run over. If GitHub changed what `macos-latest` means, this matrix's
   tier-1 second row would silently become a different claim and nothing would say so.
6. **A stale statement about a viewport was found while writing § 2 and is left in place**, because
   M1 changes no source. `packages/viz/src/render/canvas.ts` describes the landing `<select>` as
   `wide-only`, *"dropped below 1280 px"*, and `packages/viz/UX.md`'s `RS-02` records the same
   1280 px boundary from a drive. **Neither a `wide-only` class nor a 1280 px media query exists in
   `packages/viz`.** Either the mechanism moved and the sentences did not, or the drive observed
   something with another cause. It is one docstring, one `UX.md` row, and a `grep` to settle it —
   and until somebody does, the 1280 px figure in this repository's prose should not be read as a
   support boundary.
7. **One of the two counts in this document that were read off the tree drifted, exactly as this
   item said it would.** It read ~~*25*~~ where the tree held **28** when GitHub issue #292 re-ran
   the command, and `M2_MEASUREMENT.md` § 3 published **26** for the same set at the same moment, so
   the two documents disagreed with each other as well as with the tree. The tier holds **33** now
   and the figure is **derived** — `packages/viz/src/everyday/viewportGateClaims.test.ts` reads the
   count off disk and requires every published shape of it in both documents to match, which is why
   the number moved again on the commit that closed it: `viewportGates.browser.test.ts` is the
   twenty-ninth. **Two corrections in that sentence, and the second is the interesting one.** The
   count had drifted to 29 while the guard reported green: three live claims — this one and two in
   § 5 — spelled the figure in a phrasing the guard read no shape for, or wrapped it across a line
   the shape's literal space could not cross. The shapes are whitespace-tolerant now and there is a
   third of them; a guard defeated by where a paragraph breaks is not the derivation this item asked
   for. And this sentence named the **wrong file** for the whole of that time —
   `viewportGates.browser.test.ts` is the browser gate, and the file that reads the count off disk
   is `viewportGateClaims.test.ts` beside it, which its own docstring says. A citation is a claim
   about a mechanism and goes stale the same way a number does, with the difference that it sends
   the next reader to a file that will not explain itself. GitHub issue #230, [§ D423](../DECISIONS.md). The
   *eight* reference-data documents `vite.config.ts` emits is still transcribed and still exactly the
   kind of figure § 6's standing rule exists for. Re-derive it, do not copy it forward — and note
   that this item naming the risk did not stop the risk, which is the argument for a check over a
   sentence.
