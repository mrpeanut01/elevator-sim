# M2_MEASUREMENT

**Lane M2-MEASURE, 2026-08-24.** A measurement and verification lane: **no product source and no
test file was changed on this branch.** Two questions were asked and both were answered by running
something rather than by reading something.

1. M2's exit criterion *"the slice runs on the target browser matrix from #203"* has no instrument.
   Build one, or say honestly why it cannot exist here.
2. [`TEST_MATRIX.md`](TEST_MATRIX.md) records T1 `passing` and twenty rows `planned`, with a warning
   that T1 had been *stale by omission*. Determine every row's real status.

**Every number below carries the command that produced it.** That is
[`CLAUDE.md`](CLAUDE.md)'s standing rule — *a published number goes stale the same way* — and this
document is written to be re-derivable rather than believed. Where a cell could not be measured, it
says so and says what would make it reachable; it does not leave a blank and it does not reason a
result into existence.

**Base:** `000852a`, branch `test/m2-measure`, worktree
`.claude/worktrees/agent-a9e61d3b55e94f210`.

---

## 1. The machine, and exactly what it bounds

Everything in this document is a claim about **this machine**. It is stated first because it is the
boundary on every result below.

| item | value | command |
|---|---|---|
| OS | macOS **26.5.2** (build 25F84) | `sw_vers` |
| Architecture | **arm64** | `uname -m` |
| Node | **v26.5.0** | `node -v` |
| `engines.node` | `>=26` — **met here** | `node -e "console.log(require('./package.json').engines)"` |
| `playwright-core` | **1.62.1** | `node -e "console.log(require('./node_modules/playwright-core/package.json').version)"` |
| `tsc -b` | **clean, 9.155 s** | `time npx tsc -b` |

**This is a different machine from the one the programme baseline was taken on**, and the difference
matters in the direction that helps: [`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md)'s baseline records
**Node v22.22.2 against a package declaring `>=26`**, on Linux x86-64. Here the declared engine is
satisfied. So a red result here cannot be blamed on the Node floor, and a green one is on the
supported runtime for the first time in this programme's record.

### 1.1 The browser pins, and the mismatch that bounds every engine claim

`playwright-core` 1.62.1 asks for one revision per engine. This machine has none of the three.

| engine | `browsers.json` pin | present in `~/Library/Caches/ms-playwright` | usable? |
|---|---|---|---|
| chromium | **1234** | 1181, 1208, 1217, 1224, **1228** | **yes** — CDP is stable across these revisions |
| chromium-headless-shell | **1234** | 1181, 1208, 1217, 1224, **1228** | **yes** |
| firefox | **1538** | **1489** | **no** — see below |
| webkit | **2336** | **2191** | **no** — see below |

```
node -e "const b=require('./node_modules/playwright-core/browsers.json');
  for (const x of b.browsers) console.log(x.name, x.revision, x.installByDefault);"
ls ~/Library/Caches/ms-playwright/
```

**For Chromium the mismatch is harmless and is now measured to be harmless**, which is worth more
than assuming it: the product was driven end to end on **two different Chromium revisions and two
different build shapes** (§ 3), and they agree on every cell.

**For Firefox and WebKit the mismatch is fatal, not cosmetic**, and this is the single most
important bound in this document. Playwright does not drive Gecko or WebKit over a stable public
protocol the way it drives Chromium over CDP — it drives **patched builds** whose protocol is
version-locked to the `playwright-core` that shipped with them. Measured directly:

```
[probe] firefox-1489 @ 1280x800: could not open a page at all:
  Error: browser.newPage: Protocol error (Browser.setDefaultViewport):
  ERROR: failed to call method 'Browser.setDefaultViewport' with parameters { … }
  Found property "<root>.viewport.isMobile" - false which is not described in this scheme
```

Firefox r1489 **launches** and then rejects the first call 1.62.1 makes against it, because 1.62.1
sends a field that build's Juggler has never heard of. Both context shapes were tried
(`newContext({ viewport })` and `newPage()` + `setViewportSize`); both go through the same call. So
**the Gecko cell is not merely untested here — it is unreachable here**, and the fix is one command
(§ 4), not an argument.

**WebKit r2191 failed differently and worse: `webkit.launch()` never returned.** It was left for
roughly twenty minutes at 0 % CPU with no Playwright-spawned WebKit process on the machine, and then
terminated. So the WebKit cell has **no result at all** — not a pass, not a fail, and specifically
not "WebKit cannot run this product". It is reported as *no measurement*, which is the only honest
value for it.

**The task brief said the pin was 1234 and that Chromium 1181 is what works. Both halves check out,
and the brief understated it:** the mismatch is not Chromium-specific. All three engines are behind,
and only Chromium survives being behind.

---

## 2. The target matrix, as #203 states it

Transcribed from [`docs/31-support-matrix.md`](docs/31-support-matrix.md) § 1, which is the
specification of record. Four tiers, and **the tier boundary is what evidence exists**, not what is
likely to work.

### Tier 1 — supported and tested in CI, defended by a red run

| platform | browser | what CI actually runs |
|---|---|---|
| Linux x86-64 (`ubuntu-latest`) | Chromium **headless shell**, from `playwright-core` | the `viz-browser` project |
| macOS (`macos-latest`, ARM64) | Chromium **headless shell**, same gate | the same files |

Three properties of tier 1 the document states explicitly, all three of which bear on what this lane
could measure:

- **The Chromium version floats with the `playwright-core` devDependency.** `ci.yml` reads the path
  back from `chromium.executablePath()` rather than pinning a revision, deliberately. **Nothing
  tests an old Chromium.**
- **It is the headless shell, not a full browser.**
- **The architecture axis (macOS ARM64 vs Linux x86-64) was not chosen for browsers**, and nobody has
  measured whether any browser behaviour differs across it.

### Tier 2 — supported, driven by hand, with the date of the last drive

| platform | browser | last driven |
|---|---|---|
| Desktop Chromium 1280×800 | Chromium | continuous (`fold1280.browser.test.ts` — really tier 1) |
| Narrow layouts 375×667, 414×896, 767×700 | Chromium | **2026-07-30**, commit `5d4b782` ([`packages/viz/UX.md`](packages/viz/UX.md) `RX-03`, `RX-04b`, `RX-12`) |

**No row in tier 2 names Firefox, Safari or Edge**, because no record in the tree says the product
has ever been opened in one.

### Tier 3 — best effort: expected to work, nothing tests it

Windows Chrome/Edge · macOS Chrome/Edge · **Firefox (current), all desktop OSes** · **Safari
(current), macOS** · Chrome OS · **Android Chrome** · **iOS/iPadOS Safari and every other iOS
browser**. Every row is a claim with one shared argument — the page is standards-track HTML/CSS/ES
modules built by Vite 8 with no `build.target`, so it compiles to `baseline-widely-available`.

The document names its own weakest rows: *"Read the Firefox and Safari rows as the two most likely
places this matrix is already wrong."*

### Tier 4 — not supported

IE and anything outside the Vite baseline · JavaScript disabled · **CSS width below 360 px**.

### The viewport commitment, which is the half a browser name does not capture

§ 2's commitment, stated as two clauses that can each fail:

- **In scope:** at **360 px** of CSS width and above, in a tier-1 browser, the product lays out
  **without horizontal overflow**, keeps the stage canvas at **60 % or more of viewport height**, and
  exposes no control that is drawn but unreachable.
- **Out of scope for launch, as a refusal:** tap-target sizing, gesture affordances, touch-first
  layout, hover equivalents, and any claim that a phone is a *supported* way to play.

De-facto floor today: **1280 px for asserted geometry, ~~420 px~~ 360 px for anything driven at
all** — 420 was true until issue #292 put 360×800 and 375×667 into the tier, where geometry is now
asserted at both (`packages/viz/src/everyday/viewportGates.browser.test.ts`).

---

## 3. What this machine measured — the cells, with the command for each

**The shipped browser tier cannot answer this criterion, and that is a fact about the code rather
than about this machine.** Measured:

```
grep -rl "chromium.launch" packages --include="*.browser.test.ts" | wc -l   # → 33
find packages -name "*.browser.test.ts" | wc -l                            # → 33
grep -rn "firefox\|webkit\|Firefox\|WebKit\|Gecko" packages --include="*.ts"  # → no output
```

**33 of 33** browser-tier files call `chromium.launch()` as a literal, and the strings `firefox`,
`webkit` and `Gecko` do not occur anywhere in `packages/**/*.ts`. The tier is **single-engine by
construction**.

> **This figure read `26 of 26` until 2026-08-27, and it was wrong by two before anybody re-ran the
> command.** `docs/31-support-matrix.md` § 1 published **25** for the same set on the same tree, so
> the two documents did not even agree with each other — and § 7 item 7 of that document had already
> named this exact number as one that *"will drift silently … Re-derive them, do not copy them
> forward."* Naming a risk is not a check. It is derived now, from disk, in both of the shapes above
> and in both documents, by `packages/viz/src/everyday/viewportGateClaims.test.ts`;
> `viewportGates.browser.test.ts` beside it — the browser gate that issue closed — is **itself the
> twenty-ninth**, which is the whole lesson in one line: a hand-written `28` would have been stale
> before it was pushed. GitHub issue #292.
>
> **Both halves of that sentence were wrong for a wave, and each in its own way.** It named
> `viewportGates.browser.test.ts` as the file that reads the count, which it is not and its own
> docstring says it is not — a citation is a claim about a mechanism, and this one sent a reader to
> a browser test to look for a `globSync`. And *"derived now … in both documents"* was true of the
> shapes the guard could reach and not of three live claims that wrapped across a line or spelled
> the count in no shape at all, two of them in § 4 of this document. Both are corrected, and the
> guard's shapes are whitespace-tolerant with a third phrasing added. GitHub issue #230.

A criterion measured on one engine is not a matrix, so the instrument had to be built outside the
tier — and it had to be built outside because a measurement lane may not edit the tier. **That second
clause is a rule about a lane's remit and not a property of an instrument**, and § 3.1 below records
where it stopped applying.

### 3.1 The instrument

`matrixProbe.mjs`, an out-of-band script held in this session's scratchpad and **not committed to the
tree**, because a measurement lane changes no source and no test. It boots the *same* Vite dev server
the tier boots (`packages/viz/vite.config.ts`) and drives the *same* journey
`packages/viz/src/dev/browserTier.test-helper.ts#enterEverydayStage` drives — menu tile → front door
→ brief → stage — asserting the same four arrival facts that helper asserts (canvas in the page,
non-zero laid-out box, sized backing store, playhead at the start of the day). Per engine it also
loads the page at six viewports and reads horizontal overflow, tile count and page errors.

```
node matrixProbe.mjs /path/to/worktree
```

**The second half of that sentence has stopped applying, and this is where.** *"A measurement lane
changes no source and no test"* is a rule about **that lane's remit**, and it is not a property of an
instrument — an uncommitted script cannot keep proving anything, and § 4.1 quotes #203 § 4's own rule
that *"every tier-1 row must be a row a red run defends."* § 2 puts 360 px in scope for launch, so
the successor instrument for § 2's three clauses is **in the tier**, at
`packages/viz/src/everyday/viewportGates.browser.test.ts`. What stays out of band is the **matrix**
half — the multi-engine question — which is a fact about this machine rather than about the tier.

### 3.2 The cells

**Boot and layout, six viewports per engine.** `tiles` is the four Everyday mode tiles; `overflow` is
`max(documentElement.scrollWidth, body.scrollWidth) − documentElement.clientWidth`, ~~which is § 2's
first clause~~ — **which it is not, and cannot be over this shell.** See the correction under the
table; it is the load-bearing half of this section now.

| engine | 1280×800 | 1440×900 | 768×1024 | 414×896 | 375×667 | 360×640 |
|---|---|---|---|---|---|---|
| Chromium headless shell **r1181** | ✅ 4 tiles, 0 px | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px |
| Chromium headless shell **r1228** | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px |
| Chromium **full build r1228** (Chrome for Testing) | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px | ✅ 4, 0 px |
| **Firefox r1489** | ⛔ no page (protocol) | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| **WebKit r2191** | ⛔ **no measurement** — `launch()` never returned | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |

⛔ is *not measured*, and it is deliberately not the same mark as a failure. Neither engine got as
far as loading the page, so **neither row says anything about whether this product works in Gecko or
WebKit.** Tier 3 stays exactly as unevidenced as `docs/31-support-matrix.md` § 7 item 1 says it is.

**Zero page errors and zero console errors in every green cell**, and **zero horizontal overflow at
every width down to 360 px** — ~~which is § 2's first commitment clause, measured for the first time
at the floor it names.~~

> ### The `0 px` column is correct, and it is evidence for nothing — GitHub issue #292
>
> **The measurement stands. The conclusion drawn from it is withdrawn.** Every `0 px` above is a true
> statement about the **document scroll box**, and this product's overflow does not go there.
>
> `packages/viz/src/everyday/shell.ts:299` makes the Everyday root `position:fixed`, `:304` gives it
> `overflow:hidden`, and `:330` gives `.everyday-main` `overflow:hidden` as well. Content that
> overruns a clipping box is **clipped, not scrolled**, so it never reaches `documentElement` and
> `scrollWidth` there stays exactly equal to `clientWidth` — however far outside the viewport a
> control is drawn. A `position:fixed; overflow:hidden` shell is invisible to this metric **by
> construction**: it reads `0` in precisely the case § 2's clause exists to catch. The six cells were
> not close calls that a better run would have caught; the quantity was null over this shell.
>
> **Which shell, and this is the half a reader will otherwise assume wrongly.** The row was taken
> with the page on **Everyday Mode**, which is what `packages/viz/index.html` has loaded since
> **2026-08-12** (§ D335). `UX.md`'s `RX-03` and `RX-04b` — the prose § 2 says its clauses restate —
> were driven, broken, fixed and re-driven on **2026-07-30 in `5d4b782`**, against the **Engineer**
> surface and its `@media (max-width: 767px)` block. Six weeks separate them. So this row is not a
> re-confirmation of `RX-03` at a new floor: **the Everyday shell had never been measured against any
> of § 2's three clauses**, and it still had not been when this row was published.
>
> **Corrected by measurement rather than by argument.**
> `packages/viz/src/everyday/viewportGates.browser.test.ts` reads the per-element quantity —
> `scrollWidth − clientWidth` on every drawn box whose own `overflow-x` clips — beside the metric
> above, on the same page at the same instant, and adds the two clauses this section measured
> nothing of. Chromium headless shell r1194, 2026-08-27:
>
> | viewport | screen | the metric above | clipped | controls no gesture reaches | stage canvas |
> |---|---|---|---|---|---|
> | 360×800 | main menu | **0 px** | **93 px** | **5** | — |
> | 360×800 | stage | **0 px** | **337 px** | **12** | 340 px = **42.5 %** |
> | 375×667 | main menu | **0 px** | **78 px** | **5** | — |
> | 375×667 | stage | **0 px** | **322 px** | **11** | 340 px = **51.0 %** |
> | 1280×800 | main menu | 0 px | 0 px | 0 | — |
> | 1280×800 | stage | 0 px | 0 px | 0 | 340 px = **42.5 %** |
>
> The five controls at 360×800 are the whole main menu: all four mode tiles, and § 3.3's primary
> `Play today's tower`, drawn at `left: 360` and **wholly outside the viewport**. The rail is
> `RAIL_WIDTH_PX = 212` at every width (`everyday/shell.ts:129`, inline, no breakpoint), which leaves
> the screen region 148 px at 360 and 163 px at 375 for content that lays out at 241 px. The stage
> canvas is a literal `height:340px` (`everyday/stageScreen.ts:530`), so **clause 2 fails at 1280×800
> as well** — a tier-1 desktop viewport, and outside #240's stated subject.
>
> **All of that is registered rather than fixed, and the suite is green.** The layout is #240's, open
> and unstarted; the register is asserted in both directions, so a new failure is red and a fixed one
> is red as *delete this entry*. This lane fixed the instrument and the claim, not the shell.

**The slice itself, at the tier-1 viewport 1280×800**, driven through the player's own controls:

| engine | menu | door | brief | stage | first frame drawn | clock | wall |
|---|---|---|---|---|---|---|---|
| Chromium shell r1181 | ✅ | ✅ | ✅ | ✅ | ✅ | **08:30** | 697 ms |
| Chromium shell r1228 | ✅ | ✅ | ✅ | ✅ | ✅ | **08:30** | 593 ms |
| Chromium full r1228 | ✅ | ✅ | ✅ | ✅ | ✅ | **08:30** | 825 ms |
| Firefox r1489 | — | — | — | — | — | — | no page |
| WebKit r2191 | — | — | — | — | — | — | no page |

### 3.3 Two things this bought that were not the question

**The tier-1 gap between *headless shell* and *full browser* is now measured, and it is empty.**
[`docs/31-support-matrix.md`](docs/31-support-matrix.md) § 1 names the shell as a known weakness of
tier 1 — *"not where a printing bug, an extension conflict, or a media-codec problem shows up"*. The
full Chrome-for-Testing build at r1228 drives the whole slice identically. That does not discharge
the concern (this slice touches none of those three subsystems) but it converts one row of the
weakness from *unknown* to *measured, no difference on this journey*.

**The stage opens at 08:30, measured on the page.** Not 06:00. This is an independent confirmation of
[`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md)'s correction that `startOfDayMin` is per-template with
a shipped default of 08:30, and it is the reason T2 cannot be upgraded (§ 6).

### 3.4 The shipped tier's own state on this machine — and why it was measured twice

**The first run of the tier was red in 19 of 26 files, and reporting that as a product defect would
have been wrong.** It is recorded here because the difference between the two runs is the most
useful thing this section contains.

```
export ELEVATOR_SIM_CHROMIUM="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1181/chrome-mac/headless_shell"
npx vitest run --project viz-browser
```

> `Test Files  19 failed | 7 passed (26)` · `Tests  75 failed | 45 passed | 34 skipped (154)` ·
> `Duration 385.70s` — of which `tests 3064.27s`, i.e. roughly **8× file parallelism**. Almost every
> failure was one timeout: `enterEngineerStage` waiting 30 s for `.menu-overlay` to go `hidden`.

**Re-measured with the tier given the machine to itself:**

```
export ELEVATOR_SIM_CHROMIUM="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1181/chrome-mac/headless_shell"
npx vitest run --project viz-browser --no-file-parallelism \
  --reporter=default --reporter=json --outputFile=tier-serial.json
```

> `Test Files  1 failed | 25 passed (26)` · `Tests  148 passed | 6 skipped (154)` ·
> **`0 failed`** · `Duration 232.90s`

**Seventy-five failures became zero, and the wall clock went *down*.** So the first run measured
this machine under load, not the product — and the `enterEngineerStage` wait is the specific thing
that is not robust to it: `everyday/boot.ts` presses the Engineer menu's Resume when that menu
finishes rendering, and under starvation that does not happen inside 30 s. **This is worth a
sentence in the tier rather than a shrug**, because CI runs the tier on a shared runner and this
repository has 4–5 agent worktrees building at once by design.

Per-file, serial (from `tier-serial.json`):

| file | passed | failed |
|---|---|---|
| `everyday/shell.browser.test.ts` | 15 | 0 |
| `dev/compareLab.browser.test.ts` | 17 | 0 |
| `everyday/stageScreen.browser.test.ts` | 11 | 0 |
| `dev/liveMetrics.browser.test.ts` | 11 | 0 |
| `everyday/standaloneScreens.browser.test.ts` | 8 | 0 |
| `everyday/workshopScreen.browser.test.ts` | 8 | 0 |
| `everyday/campaignScreens.browser.test.ts` | 7 | 0 |
| **`everyday/dailyLoop.browser.test.ts`** | **6** | **0** |
| **`everyday/fixitScreen.browser.test.ts`** | **6** | **0** |
| `everyday/benchScreen.browser.test.ts` | 6 | 0 |
| `dev/noteContrast.browser.test.ts` | 6 | 0 |
| `everyday/reportScreen.browser.test.ts` | 5 | 0 |
| `dev/keyboard.browser.test.ts` | 5 | 0 |
| `dev/dispatcherStrip.browser.test.ts` | 5 | 0 |
| `dev/menu.browser.test.ts`, `dev/dispatcherFamilies.browser.test.ts`, `dev/paperShell.browser.test.ts` | 4 each | 0 |
| `everyday/settingsScreen.browser.test.ts`, `everyday/boardScreen.browser.test.ts`, `dev/fixit.browser.test.ts`, `dev/fold1280.browser.test.ts`, `dev/menuExit.browser.test.ts` | 3 each | 0 |
| `dev/closedFormPlate.browser.test.ts`, `dev/stageHeight.browser.test.ts` | 2 each | 0 |
| `dev/watch.browser.test.ts` | 1 | 0 |
| **`dev/boot.browser.test.ts`** | **0** | **hook error — see § 7.1** |

The two bold rows are the ones this lane's matrix work turns on: **T1's test is watched green at
6/6, and T10's browser leg at 6/6**, both on the run above.

---

## 4. The cells this machine could not measure, and what would make each reachable

**Stated as work, not as a blank.** This is the half of the criterion that stays open.

| cell | why unreachable here | what makes it reachable |
|---|---|---|
| **Firefox / Gecko**, any OS | the installed build r1489 is 49 revisions below `playwright-core` 1.62.1's pin (1538); its Juggler rejects the first call the driver makes | `npx playwright-core install firefox` on this machine — one command, one download. Then re-run the probe. It is the **highest-value single addition**, and § 4 of the matrix already recommends it on the Linux leg |
| **WebKit / Safari**, macOS | build r2191 vs pin 2336; `launch()` never returned and no result was obtained | `npx playwright-core install webkit`, then re-run. Note the matrix's own caveat: **Playwright's Linux WebKit is not Safari**, so this cell belongs on the macOS leg |
| **Windows** Chrome/Edge | no Windows host | a `windows-latest` **browser-tier-only** leg, which is what § 4 says it should be if it is ever added — it must run no statistical pins, because § D201 found 26 pins exactly inverted between two platforms |
| **Android Chrome, real device** | no device | § 4 refuses a device cloud on cost. The affordable proxy is Playwright's `hasTouch`/`isMobile` on the already-installed Chromium — **also unreachable here**, because `isMobile` is the very field the older builds reject, and no shipped tier file sets it |
| **iOS / iPadOS Safari** | no device, and the WebKit cell above | unchanged: the matrix's own weakest row |
| **Old Chromium** | — | § 4 refuses this deliberately; the Vite baseline target is the control |
| **200 % browser zoom** (§ 5's accessibility row) | not attempted — it rode on #240's viewport gates, ~~which do not exist~~ **which exist now**: `packages/viz/src/everyday/viewportGates.browser.test.ts` drives 360, 375 and 1280 and measures all three of § 2's clauses at each (issue #292) | trivial now: 200 % at 1280 is geometrically the 640 px layout, and the sweep takes a viewport list |
| **Screen readers** | no assistive stack | unchanged; § 5 already labels this best-effort and untested |

### 4.1 The honest verdict on M2's box

**The criterion cannot be ticked from this machine, and it also cannot be ticked from CI as CI
stands.** Two independent reasons, and only the second is about hardware:

1. **The product's own tier is single-engine** (§ 3). Even a machine with all three browsers
   installed could not make `npx vitest run --project viz-browser` cover a matrix, because
   **33 of 33** browser-tier files name `chromium`. Until a browser-tier file takes its engine as a
   parameter, *"the slice runs on the target browser matrix"* is a claim no tier command can
   produce evidence for.
2. **Tier 1 is two rows and both are Chromium.** #203 § 4's rule is explicit: *"Every tier-1 row must
   be a row a red run defends, and adding a tier-1 row means adding its gate in the same change."*
   There is no gate for a second engine, so there is no second engine in tier 1.

**What this lane can put in the box instead of a tick:** the slice is now **measured green on three
Chromium builds across two build shapes and six viewports including the 360 px floor**, with zero
page errors and zero horizontal overflow — which is more Chromium evidence than the criterion has
ever had — and the two engines that would make it a *matrix* are named, with the one command each
that would reach them. **That is a partial answer and it is labelled one.** A box ticked on Chromium
alone would be the defect [`docs/31-support-matrix.md`](docs/31-support-matrix.md) § 6 exists to
prevent.

### 4.2 The cheapest three things that would move this box

Not a wish list — each is small, and each converts a *claim* into something a red run defends.

> **The counts in § 4 are live claims, not dated records, and that was settled rather than
> inherited** ([§ D423](DECISIONS.md)). § 4 is a recommendation in the present tense: the `while`
> clause in item 2 is the *reason* a reader is being told not to install Gecko yet, so it is a
> statement about the tree today and is re-derived. § 5 below is this document's dated section, and
> its figures are left exactly as they were taken. The test is not *"is the document dated?"* —
> every document is — but *"does the sentence say when?"*
>
> They read **29 of 30** here and **29 of 29** in item 2 until 2026-09-01: two answers to one
> question in one section, for a set of **33**, while `viewportGateClaims.test.ts` reported green
> over both. Its shapes wanted a literal space and Markdown had wrapped these two sentences between
> the tokens. The shapes are whitespace-tolerant now. GitHub issue #230.

1. **Fix `boot.browser.test.ts`'s port** (§ 7.1). Four lines. Until it is fixed, the tier is red on
   any machine with a Vite server running, which means the criterion's own instrument is not
   dependable on the machines it will be run on.
2. **Take the engine as a parameter.** `browserTier.test-helper.ts` already owns the gate in one
   module and `browserTier.test.ts` already enforces that every tier file goes through it — so the
   engine belongs in the same place. That single change is what turns *"the slice runs on the target
   browser matrix"* from an unanswerable sentence into a command, and it is a **precondition for the
   Firefox row #203 § 4 already recommends**: installing Gecko buys nothing while **33 of 33**
   browser-tier files name `chromium`.
3. **One touch cell.** § 2's `best effort` becomes measurable with `hasTouch`/`isMobile` on the
   Chromium already installed, at one phone viewport, through one real journey. §&nbsp;4 of the matrix
   calls this *"Recommended, and cheapest of all"* and it is #240's gate.

**In that order**, because 2 and 3 are worth nothing while 1 makes the tier unreliable.

---

## 5. Published numbers that have gone stale, found while measuring

Reported, not fixed — this lane edits no file outside its two.

### 5.1 `docs/31-support-matrix.md` says 25 browser-tier files; there are 26

```
git ls-tree -r --name-only acf1b88 | grep -c "\.browser\.test\.ts"   # → 25
git ls-tree -r --name-only HEAD    | grep -c "\.browser\.test\.ts"   # → 26
git log --oneline --diff-filter=A -- packages/viz/src/everyday/reportScreen.browser.test.ts
#   → 8764620 fix(everyday): the report lays its small print out … (#211, #213)
```

The figure was **correct when written** at `acf1b88` and is wrong at HEAD. It appears four times:
`docs/31-support-matrix.md:53`, `:54`, `:350`, `:355`. The document's own § 6 review trigger
*"Any new browser-tier file is added"* has fired and the count was not re-derived.
[`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md)'s `25` is **not** stale — it is explicitly dated at
`c8fd6fa` and was right there.

### 5.2 `docs/22-charter.md` § S10's evidence row is stale in both halves

`docs/22-charter.md:183` reads: *"All **21** journey rows in `TEST_MATRIX.md` read `planned`.
Verified: `grep -cE '^\| T[0-9]+ \|' TEST_MATRIX.md` → 21; the single `passing` occurrence in the
file is the header's status legend."*

```
grep -cE '^\| T[0-9]+ \|' TEST_MATRIX.md   # → 21   (still right)
grep -c "passing" TEST_MATRIX.md           # → 2    (was 1)
```

T1 has read `passing` since `0d6fc0d`. The charter's `charter S10` row still says every row is
`planned`, so the one criterion in the charter that points at this file is asserting a state the file
left. **This is the class the charter itself is about**, and it is a *status* claim rather than a
count, which makes it the more dangerous half.

### 5.3 Two live documents cite a `TEST_MATRIX.md § 3` that no longer exists

`packages/viz/UX.md:653` — *"because `TEST_MATRIX.md` § 3 currently holds ten placeholder rows
waiting for exactly this"* — and `docs/05-roadmap.md:435` — *"The ids are reproduced in
`TEST_MATRIX.md` § 3"*. The file has exactly one heading:

```
grep -n "^#" TEST_MATRIX.md    # → 1:# TEST_MATRIX
```

Both instruct a reader to copy `RV-`/`PB-`/`ED-` ids into a section that is gone, which is the
[`CLAUDE.md`](CLAUDE.md) stale-instruction class rather than a broken link — `citations.test.ts`
cannot see it, because the **file** exists and only the **section** does not.

### 5.4 And this is the finding the charter asked for by name

[`CHARTER_PROGRAMME.md`](CHARTER_PROGRAMME.md)'s M0 note says #193's defect *"is a class, not an
instance"*, that commit `1b7a2f1` overwrote `RISKS.md` and `MULTI_AGENT_PLAN.md` in one sitting, and
that **#193's scope should be widened to the class — which *other* project-level registers did that
commit touch?** Measured:

```
git show --stat 1b7a2f1 -- MULTI_AGENT_PLAN.md AGENT_STATUS.md RISKS.md TEST_MATRIX.md
#   AGENT_STATUS.md     | 1058 +----------------------
#   MULTI_AGENT_PLAN.md |  453 ++-------
#   RISKS.md            |  135 +---
#   TEST_MATRIX.md      |  411 ++-------
#   4 files changed, 134 insertions(+), 1923 deletions(-)
```

**Four registers, not two, and 1 923 deleted lines.** [`TEST_MATRIX.md`](TEST_MATRIX.md) went from
**383 lines and six sections** to **28 lines and one table**:

```
git show 1b7a2f1^:TEST_MATRIX.md | grep -n "^## "
#   128:## 1. Wave 1 — correctness foundation
#   152:## 2. Regression — must stay green through every merge
#   171:## 3. UI scenarios — the live ledger is the shift viewer's, and it is not green
#   312:## 4. Phase 8 — testing campaign
#   334:## 5. Phase 6 — destination dispatch
#   350:## 6. Wave 13 — the building-behaviour program
```

**That deleted § 3 is exactly the section § 5.3's two documents still point at.** The commit message
names all four files itself — *"MULTI_AGENT_PLAN, AGENT_STATUS, RISKS and TEST_MATRIX open the
wave"* — so nothing was hidden; what was missing is that the register the *test* programme is judged
by was one of them, and it is the one nobody restored. `AGENT_STATUS.md` (1 058 lines) is the other
unrestored one.

---

## 6. `TEST_MATRIX.md` — every row measured

**The standard is [`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) § Z's:** a row
reads `passing` only with a named test file and a watched green run, and **a row is not upgraded on a
test that covers part of its scenario.** § Z records T1 having been *stale by omission*; every row
below was read clause by clause against the test that would satisfy it, and where coverage is partial
the missing leg is named rather than rounded off.

`owned` is used in this file's own sense — the scenario has a real test that covers it in part, and
the gap is named. `planned` means nothing in the tree covers the scenario.

### 6.1 There is no T22

The brief asked for T1–T22. **[`TEST_MATRIX.md`](TEST_MATRIX.md) has twenty-one rows**
(`grep -cE '^\| T[0-9]+ \|' TEST_MATRIX.md` → 21). T22 exists only as a **proposal**:
[`docs/27-flow-maps.md`](docs/27-flow-maps.md) § 7.2 proposes thirteen new rows, T22–T34, *"numbered
from T22 so nothing existing is renumbered"*, and says in terms that it is **proposals only** and
*"Nothing here edits that file."* T22 as proposed is *cold boot with `data/` unreachable*; it is
**`planned` and unwritten**, and adopting the proposals is a product-owner decision this lane does
not take.

That flow-map section also proposes **rewording** T1, T7, T8, T12, T14, T16 and T20. Where its
verdict was checked against the tests it was **optimistic on all five of T2–T6** (§ 6.3), which is
recorded here because a matrix updated from that table alone would have repeated § Z's failure.

### 6.2 The measured table

See [`TEST_MATRIX.md`](TEST_MATRIX.md) for the committed rows. Summary of movement:

| direction | rows |
|---|---|
| **stays `passing`** | T1 |
| **`planned` → `passing`** | **T10**, **T11** |
| **`planned` → `owned`** | T2, T3, T4, T5, T6, T9, T12, T13, T14, T15, T16, T17, T20, T21 |
| **stays `planned`** | T7, T8, T18, T19 |

**No row moved downward**, and one that could have been argued up was not: T18's declared type is
`grep + review`, and a row whose acceptance is a human reading a table cannot be made `passing` by
any run (§ 6.4).

### 6.3 The rows whose published status was wrong, and in which direction

**Every wrong status was wrong in the same direction — understated.** Nineteen rows read `planned`
and only four of those are genuinely uncovered. That is the opposite of the failure § Z warns about,
and it is worth saying plainly: the risk in this file today is not over-claiming, it is that a lane
reads `planned` and rebuilds a test that already exists.

The two rows that were understated by a full grade:

- **T10 (Fix-a-building)** — `planned`, and every clause is asserted in **both** declared tiers. The
  pass clause is driven over all **18** shipped cases, not a sample.
- **T11 (Bench)** — `planned`, and all three clauses are asserted with a negative control beside each.

And the one place the flow map would have led a lane wrong:

- **T2 (Stage entry)** — [`docs/27-flow-maps.md`](docs/27-flow-maps.md) § 7.1 marks it *Covers*, citing
  *"the paused-at-06:00 and first-frame cases"*. **There is no paused-at-06:00 case.**
  `packages/viz/src/everyday/stageScreen.browser.test.ts:324` asserts only `/^\d{2}:\d{2}$/`, and its
  own docstring at `:306-317` records that the literal `06:00` was tried and **failed against the
  product**. `packages/viz/src/everyday/stageScreen.test.ts:141` exists specifically to stop the
  source restating `06:00`. **Independently confirmed on the page by this lane's probe: the clock
  reads 08:30** (§ 3.2). Upgrading T2 on § 7.1's verdict would have been stale-by-omission with a
  citation attached.

### 6.4 Three rows are process claims, not test claims

This is the finding most relevant to the stale-by-omission failure mode, because these three cannot
legitimately reach `passing` on any watched run and will keep tempting one.

- **T17's** *"corpus measured once post-integration, both tiers"* — the *measured once after
  integration* half is a process rule (`docs/21-engineer-reimagined-contract.md` § 1.3 clause (c),
  and its L-10 row). No test pins any corpus figure: the published counts appear in
  [`CLAUDE.md`](CLAUDE.md) and [`docs/05-roadmap.md`](docs/05-roadmap.md) and **nowhere in
  `packages/**/*.ts`**. The *both tiers* half is also unreachable on an ungated run — the deep case is
  `it.runIf(deepCampaignRequested(...))` and CI never sets `ELEVATOR_SIM_HONESTY`.
- **T18's** type is literally `grep + review`. `docs/21-engineer-reimagined-contract.md` § 1.2 lists
  **15** surface blocks and § 1.3 makes the check *"a reviewer greps the finished surface against this
  table"*. The nearest mechanisation, `packages/viz/src/dev/paperShell.browser.test.ts:186`, reads
  carriers for **6 of the 15** and asserts element counts (`expect(ledger.tabs).toBeGreaterThan(5)`),
  which a plate that lost a qualifier still passes — the file says so itself at `:249-252`.
- **T21's** operative words are *"green at **every integration point**"*. CI genuinely runs `tsc -b`
  then `npm test` over every registered project including `viz-browser`, and
  `packages/viz/src/dev/browserTier.test.ts:301` genuinely refuses a CI run in which the tier would
  skip. But nothing enumerates the integration points or records greenness at each, and a green suite
  today says nothing about that.

**Recommendation, not taken here:** give these three rows a `type` the matrix can honour — a review
gate with a named reviewer and commit — or retype them as tests derived from data (§ 1.2's rows as a
table the test iterates). Leaving them typed as tests guarantees somebody eventually ticks them.

---

## 7. Defects found and **not** fixed

A measurement lane that edits source cannot be trusted as a measurement, so every one of these is
reported only. Four other lanes are writing code against this tree.

### 7.1 `boot.browser.test.ts` binds a port it cannot move off, and its own docstring names the wrong one

**This is the defect to fix first, and it is four lines.** `packages/viz/src/dev/boot.browser.test.ts:61`
passes `server: { port: 0 }`. Measured, it binds **5173** — Vite's default — with `strictPort: true`
inherited from `packages/viz/vite.config.ts:190`. So it cannot move, and it goes red on any machine
where anything holds 5173:

```
npx vitest run --project viz-browser packages/viz/src/dev/boot.browser.test.ts
#   Error: Port 5173 is already in use
#    ❯ src/dev/boot.browser.test.ts:64:3
#   Test Files  1 failed (1) · Tests  6 skipped (6)

lsof -nP -iTCP:5173 -sTCP:LISTEN
#   node    15109 nrene ... TCP [::1]:5173 (LISTEN)
ps -o pid,lstart,command -p 15109
#   15109  Thu Aug 20 12:06:49 2026  node /private/tmp/.../02-new-business-portal/.../scratchpad/…
```

The holder is a dev server **from an unrelated project**, running since four days before this
session. Nothing in this repository can see it and nothing in this repository is wrong — which is
precisely `browserTier.test-helper.ts`'s own stated worry, *"the one tier that can fail for reasons
that are not about this repository — a missing browser, a busy port."*

**Three separate things are true here and they should not be merged:**

- **Every other file in the tier already solved this**, each taking an explicit port with `strictPort: false`
  — `liveMetrics` 5205, `closedFormPlate` 5206, and so on, several with a comment calling it *"the
  tier's convention"*. `boot.browser.test.ts` is the **last file on the old convention** and nobody
  noticed, because the tier skips without `ELEVATOR_SIM_CHROMIUM` and 5173 is usually free.
- **Its docstring is a stale stated mechanism.** Lines 66-76 assert that `server: { port: 0 }`
  *"does not win: `vite.config.ts` pins `{ port: 5174, strictPort: true }`, so the server serves
  where the **config** says."* Measured, the config's **port** does not win — `port: 0` overrides
  5174 and resolves to 5173 — while the config's **`strictPort`** does. The paragraph is right that
  the port is not what the caller asked for and wrong about which port it is, which is the
  [`CLAUDE.md`](CLAUDE.md) class: a sentence that survived the thing it described.
- **5173 is the worst possible port to be stuck on**, because it is Vite's default — the port any
  developer running any other Vite project already has taken.

**Not fixed here**, per this lane's terms. The fix is to give this file an explicit port with
`strictPort: false` like its 25 siblings, and to correct the paragraph to say which port it binds.

### 7.2 The rest

1. **`packages/server/src/challenge/challenge.test.ts:271-277` asserts nothing.** The case
   *"does not depend on which dispatcher a player chose — that is the free axis"* is
   `expect(challengeDataHashOf(issuedChallengeFor(0), FACTS)).toBe(challengeDataHashOf(issuedChallengeFor(0), FACTS))`
   — a value compared with itself. `challengeDataHashOf` (`challenge/submission.ts:175-189`) takes no
   dispatcher argument, so there is nothing to vary and the assertion cannot fail. The claim it names
   *is* honestly covered twenty lines above, at `:113-119`, where `Object.keys(issued.config)` is
   pinned to four names with the dispatcher absent by construction. This is a test that looks like a
   gate and is a comment.

2. **`packages/viz/src/everyday/campaignModel.ts:258-268` — the fourth daily test is refused, not
   evaluated**, while `campaignModel.test.ts:292`'s describe block is titled *"the four daily tests"*.
   `campaignTestGoals` (`:175-202`) returns three graded goals; the fourth `trips` row carries
   `reading: undefined` and `refusal: TRIPS_REFUSAL`. Not a defect in itself — the refusal is honest —
   but the **title** invites exactly the upgrade T8 must not get.

3. **`campaign` works never take a car out of service.** The handoff's
   `docs/design/design_handoff_casual_mode/ENGINE_CONTRACT.md` § 8.2 (line 442)
   specifies it and `packages/viz/src/everyday/campaignModel.ts:579` renders the tooltip
   *"· works, a car out of service"*, but `outOfServiceCarIds` has **zero writers** under
   `packages/viz/src/campaign/` or `everyday/campaign*`. The only mapping onto that field is
   `packages/viz/src/shift/calendar.ts:18`, on the Engineer shift path, unreachable from campaign.
   **This is the `CLAUDE.md` dead-seam shape with the polarity of a stale claim**: a sentence on a
   player surface describing a mechanism the run does not have.

4. **`packages/viz/src/everyday/dailyLoop.browser.test.ts:166` contradicts itself** — the comment
   *"the one press that has no Everyday home yet"* against a case 280 lines below that presses it.
   Already recorded by [`ISSUE_VERIFICATION_FINDINGS.md`](ISSUE_VERIFICATION_FINDINGS.md) § Z and
   still open at HEAD; re-confirmed here.

5. **The ghost picker ships three options, and two documents ask for five.**
   `packages/viz/src/live/raceStrip.ts:74` is `'none' | 'plain-baseline' | 'latest-saved'`, under a
   docstring at `:69-73` recording the omission as a decision. T7's scenario as written is
   unsatisfiable, and nothing asserts the option list at all.

6. **The stale figures in § 5.** Four sites in `docs/31-support-matrix.md`, one status claim in
   `docs/22-charter.md:183`, two dangling section citations (`packages/viz/UX.md:653`,
   `docs/05-roadmap.md:435`).

---

## 8. What remains unmeasurable from this machine

| # | thing | why |
|---|---|---|
| 1 | Gecko and WebKit, at all | § 1.1 — the installed builds predate `playwright-core` 1.62.1's protocol. **One `npx playwright-core install` command away**, and that command was not run because installing browsers is a change to the machine rather than a measurement of the tree |
| 2 | Windows | no host |
| 3 | Real touch devices | no device; and the emulation proxy needs the `isMobile` field the old builds reject |
| 4 | `charter S9`'s cold-load budget | no instrument exists anywhere (#238); §&nbsp;3's B1/B2/B3 are specified and unbuilt. This lane measured **wall-clock slice completion of 593–825 ms on a warm dev server**, which is *not* time-to-interactive on a production build with a cold cache and must not be quoted as one |
| 5 | The six **[tester]** gates | no agent lane can reach them, by [§ D349](DECISIONS.md)'s own split |
| 6 | CI's own two legs | a claim about `ubuntu-latest`/`macos-latest`; this is one macOS ARM64 host |

---

## 9. Re-deriving this document

```
git log --oneline -1                                        # base commit
uname -m && sw_vers && node -v                              # § 1
node -e "const b=require('./node_modules/playwright-core/browsers.json');
  for (const x of b.browsers) console.log(x.name, x.revision)"   # § 1.1
ls ~/Library/Caches/ms-playwright/                          # § 1.1
grep -rl "chromium.launch" packages --include="*.browser.test.ts" | wc -l   # § 3
find packages -name "*.browser.test.ts" | wc -l                             # § 3
git ls-tree -r --name-only HEAD | grep -c "\.browser\.test\.ts"             # § 5.1
grep -cE '^\| T[0-9]+ \|' TEST_MATRIX.md                                    # § 5.2, § 6.1
git show --stat 1b7a2f1 -- MULTI_AGENT_PLAN.md AGENT_STATUS.md RISKS.md TEST_MATRIX.md  # § 5.4
```

**And the rule this document is written under, restated because it is the one that decays:** every
figure above is a claim about one machine on one day. Re-measure after integration, or not at all.
