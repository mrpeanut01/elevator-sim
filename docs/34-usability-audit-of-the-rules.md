# 34 — A usability audit of this repository's own rules

**Date:** 2026-08-25 · **Method:** the shipped build, driven · **Scope:** decisions in
[`DECISIONS.md`](../DECISIONS.md), invariants in [`CLAUDE.md`](../CLAUDE.md), and the contracts they
cite, asked one question: *is this rule costing a player something, and if so is the cost the rule's
or the reading's?*

This is not an audit of the product. [`docs/17`](17-play-experience-audit.md) through
[`docs/20`](20-everyday-playtest-audit-2.md) are those, and they find defects. This one starts from
the other end: it asks whether any of the rules this repository holds itself to is *producing*
defects, and it separates a rule that is wrong from a rule that is right and has been read badly.
The distinction turned out to matter more than the findings: **of the six findings below, exactly
zero are a rule that should be weakened, and four are a rule that stopped one thought short.**

## How the evidence was taken

Every claim about what a player meets was measured by driving the built page in Chromium at
**1280 × 720** — the shortest height `packages/viz/index.html` carries a media block for, and the
viewport GitHub issue #262 measured. Nothing here is read off a docstring, because two of the
findings are docstrings that were wrong.

Where a finding is a *count*, the count is reproducible: it is what
`packages/viz/src/everyday/deadControls.browser.test.ts` prints when it fails.

---

## F1 — A control a player cannot press said nothing about why. **Fixed.**

**The rule.** `everyday/actionBar.ts`'s `BarPrimary.inert`, and the general practice of drawing an
unaffordable or unavailable control *visible, dimmed, inert* rather than hiding it. The practice is
right and is not in question — hiding a control teaches a player nothing, and a control that
vanishes is one they cannot ask about.

**What it cost, measured on the shipped build:**

| screen | disabled buttons | carrying no reason |
|---|---|---|
| main menu | 1 | 1 |
| Endless rush | 1 | 1 |
| Fix a building | 3 | 3 |
| All buildings | 5 | 5 |
| Front door | 5 | 5 |
| **total** | **15** | **14** |

**Whose fault the cost was.** Not the practice's — the *type's*. `inert` was a `boolean`, so of the
eight `bar()` refinements that set it, four happened to put a reason in the row's note and four did
not, and no reader and no test could tell those two groups apart. `true` says nothing, so nothing
was checkable.

**The second half is more interesting, and it is not about reasons at all.** Nine of the fifteen
were **timeline stops** — the `1 Front door › 2 Brief › 3 The day › 4 How it went` strip. Those were
not refusing anything. *Brief* is the second stop of four; it is not a button that will not work,
and there is no sentence that would have made it a good dead control. Asking *"what is the reason
here?"* has no answer, which is the signal that the question was wrong. A stop you cannot go to is
not a control.

**Verdict: the rule is right and was unenforceable.** `inert` now carries the sentence, which makes
the reasonless state unrepresentable; `shell.ts#drawBar` draws it in the pinned bar (above the fold
at every height by construction) and binds it to the control with `title` and `aria-describedby`;
an unreachable timeline stop is a `<span>` with `aria-current="step"` on the one you are on.
**15 dead controls → 6, and 14 unexplained → 0.** Two guards hold it: a registry-wide one in
`everyday/screens.test.ts` and a driven one in `everyday/deadControls.browser.test.ts`, both watched
failing first.

**The rule this leaves behind, in one line:** *a dead control says why, or stops being a control.*

---

## F2 — "No entry-screen override that survives a reload" is charging its cost in copy. **Escalated.**

**The rule.** [`docs/22-charter.md`](22-charter.md) § 5 non-goal 10, citing
[§ D335](../DECISIONS.md) and [§ D338](../DECISIONS.md): *"No entry-screen override that survives a
reload. A remembered world is the override the design guide forbids, whatever storage it wears."*
The charter says non-goals *"may not be relaxed by a lane"*, so this is escalated rather than acted
on.

**The argument for it is good and is not disputed here.** § D338: a remembered world *"fails worse
than the deleted `startScreen` prop would have: the screen it restores is a developer tool the
player has no memory of choosing."* That is exactly right about somebody who crossed the door once
by accident.

**What it costs.** The product has two audiences ([`docs/23`](23-audiences-and-core-loop.md)), and
this rule is written for one of them. An Engineer iterating on a dispatcher crosses the door on
every reload. The cost is not only the click: because the rule is surprising, the product has to
warn about it, and the warning is **115 characters — twenty words** (`types.ts#ENGINEER_SWAP_NOTE`)
drawn as the subtitle of a row in a **212 px** rail. That is the longest piece of copy on the
narrowest surface in the product, and it exists to explain a rule rather than to help anybody do
anything. It is an instance of GitHub issue #211 whose cause is a decision.

**The question to rule on, and it is narrower than the non-goal.** The product already accepts
**URL-borne state** — every browser-tier file loads `?building=garden-apartments&seed=424242`, and
[§ D314](../DECISIONS.md) made the run URL a sharing surface. A URL is not storage: it is not
*remembered*, it is *requested*, and a player who loads the bare address still lands on the main
menu. So a `?engineer` parameter would give the second audience a bookmark without granting the
thing the non-goal forbids — nobody is ever restored into a screen they do not remember choosing,
because arriving there required a link that says so.

**Recommendation.** The owner rules on one sentence: *does "whatever storage it wears" reach a query
parameter?* If it does, the non-goal is coherent and the rail note is its price, and the price
should be paid somewhere other than a 212 px row. If it does not, a `?engineer` entry is a
two-line change that removes the warning's reason to be long.

---

## F3 — #229's premise is stale: Settings is no longer a list of refusals. **Reported.**

**The rule.** § 20.12, quoted in `everyday/settingsView.ts`: *"a toggle that toggles nothing is a
lie in a settings panel"* — either there is a seam behind a row or the row is not drawn.

**Measured.** The rule is right and has been fully applied. Of § 15.1's rows, one is drawn (Motion,
wired through `engineerBridge.ts` to the Engineer's own switch) and six are not. GitHub issue #229
says *"six of the rows in Settings are refusals … together they make the settings panel read as a
list of things the game cannot do."* **That has not been true since #207 landed.** The six are not
rows at all: they are entries in `settingsView.ts#SETTINGS_ABSENCES`, which `#207` moved into a
build-information panel that is **closed by default** and reached from Settings rather than drawn in
it. Three of #229's five acceptance criteria are already met, including the one that names the
remedy — *"the build-information panel carries the explanation instead"*.

**What is left of the issue is real and is one row.** `SETTINGS_ABSENCES` says of *Default speed*
that the preference *"is buildable now and is not built"*. A register entry that says a thing is
buildable is a queue item wearing a refusal.

**The finding underneath the issue, which is the one worth keeping.** § 20.12 gives two outcomes —
build the seam, or do not draw the row — and only the second is free. So *not drawing* is a stable
equilibrium: it satisfies the rule permanently, at no cost, and nothing ever comes back to it. **A
register of honest absences is a queue only if something reads it as one.** Six registers and
twenty-six entries are drawn from `everyday/buildNotes.ts`; the number of them with an open issue is
not tracked anywhere.

**Recommendation.** Report the staleness on #229 (done), and treat the absence registers as a
backlog with a link per entry rather than as a display. That is a change to how the register is
*read*, not to § 20.12.

---

## F4 — § D106 forbids aggregating energy. It has been read as forbidding an energy **goal**. **Escalated.**

**The rule.** [§ D106](../DECISIONS.md), restated in `CLAUDE.md`: *"the energy proxy may be shown
**beside** AWT and WT95 and never aggregated into a grade"*, because `nearest-car` — the weakest
shipped dispatcher — is on the Pareto front at six of eight matrix cells purely by being worst on
wait. **The rule is correct and must not be weakened.** A grade that folded energy in would rank the
worst dispatcher first, and that is a measured fact rather than a worry.

**What it cost.** All four of the day's goals (`shift/goals.ts`: `carry`, `minute`, `queue`,
`worst-wait`) are wait-or-throughput shaped. `campaign/judge.ts` contains the word *energy* once,
in a comment explaining that it does **not** order two arms on it. So the game — whose own brief is
about a tradeoff — scores one side of the tradeoff and never the other, and a player can win every
goal the product offers without the second axis ever mattering.

**Whose fault the cost is.** Not the rule's. *Aggregating into a grade* and *setting an independent
bar* are different operations, and § D106 forbids only the first. A goal of the form *"keep the day
under X kJ per served leg"* is not an aggregation: it is a second bar, passed or failed on its own,
and it is specifically immune to the failure § D106 names, because `workPerServedLegKJ` has **people
served in its denominator** — the very field § D106 introduced so that *"a configuration that spends
less by serving fewer people has not saved anything"* is visible.

**Recommendation.** The owner rules on whether an independent, non-aggregated energy goal is inside
§ D106. If it is, the decision should say so in a sentence, because four lanes have now read it as
*energy is not scoreable* and built accordingly.

---

## F5 — The M2 gate checks notation, not truth, and this audit produced two more instances. **Recorded.**

**The rule.** [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M2 exit criterion 3 — *nothing on
a player surface refers to a section number, a source filename or a code identifier* — instrumented
by `honesty/properties.ts`'s `internal-notation`. [§ D350](../DECISIONS.md) states the bound
plainly: *"a false sentence carrying no notation passes it."*

**Two instances found while doing the other work in this pass, neither of which any instrument could
see:**

1. `AGENT_STATUS.md`'s register said of the rush setup screen that *"the primary is inert with the
   reason on the control"*. The reason was on the **screen**, 184 px below the fold, and on no
   control. It had been false for as long as it had stood.
2. `everyday/benchScreen.ts`'s `benchBar` docstring said the refusal *"is already on the screen
   beside the control it is about"*. True of the field card; false of the pinned primary, which is
   the control a player actually presses and which carried nothing.

Both are the class `CLAUDE.md` calls *a stated refusal goes stale the same way* — and both were
found by driving the page, which is the only instrument that has ever found one of these.

**Recommendation.** No rule change. GitHub issue **#269** — *the honesty corpus has no property that
gives two surfaces one state and asks whether they agree* — is the instrument this gap wants, and
this audit is two more data points for it. A cheaper partial: a claim of the form *"the reason is on
the control"* is exactly the shape `deadControls.browser.test.ts` now checks mechanically, so the
prose could cite the test instead of asserting.

---

## F6 — A hypothesis this audit set out to prove, and **refuted**

**The hypothesis.** That `CLAUDE.md`'s statistical discipline — *if a configuration saturates, flag
it and suppress the AWT interval* — had been escalated on the way to the player into *show the word
`withheld` and nothing else*, leaving somebody who had just played a bad day with a hole where their
result should be. This is the single most plausible way an honesty regime built for a benchmark
hurts a game, and it is what this audit expected to find.

**It is not what the product does.** `mode/casualDay.ts#casualNoteFor` routes a withheld cell
through `mode/disclosure.ts#suppressionLeadFor`, which leads with

> There is no number here, and that is a result rather than a gap: …

and then hands over to `core`'s own sentence, unedited. That is
[`docs/10`](10-experience-layer-contract.md) R3 (*suppression replaces the number, it never hides
it*) and R4 (*a suppressed run is not a lost run, it is a result*) both honoured, per ground, in the
player's register. The rule was implemented better than the hypothesis assumed.

**What survives, and it is much narrower.** R4 ranks four fail states — *Overwhelmed, Abandoned,
Stranded, Locked out* — and `campaign/failStates.ts` builds all four with their evidence and their
prose. Its consumers are `dev/campaignPanel.ts`, `honesty/surfaces.ts`, the package barrel and one
type import. **No Everyday screen reads it.** So the taxonomy that names what went wrong is on the
Engineer surface, and the player gets the per-cell reason without the name. Whether the name adds
anything on a single day is a design question and not a defect; the four-goal day already supplies a
verdict.

**Recorded because a refuted hypothesis is worth as much as a confirmed one here**, and because the
next person to have this idea should be able to find out that it was tested.

---

## What this audit changed, and what it did not

| finding | rule | verdict | action |
|---|---|---|---|
| F1 | `BarPrimary.inert`, *visible, dimmed, inert* | right, unenforceable | **fixed** — type carries the reason; 14 unexplained dead controls → 0 |
| F2 | charter § 5 non-goal 10 | coherent; its price is misplaced | **escalated** — one sentence for the owner |
| F3 | § 20.12 | right, fully applied | **reported** — #229's premise is stale; three of five ACs met |
| F4 | § D106 | right, read one step too far | **escalated** — is an independent energy bar an aggregation? |
| F5 | M2 exit criterion 3 | right, bounded — and the bound is known | **recorded** — two more instances for #269 |
| F6 | `awtIsValid` suppression | right, and implemented right | **refuted** — hypothesis withdrawn |

**No rule was weakened, and none was proposed for weakening.** `CLAUDE.md`'s working agreement —
*do not weaken an acceptance criterion to make a phase pass; raise it instead* — held under an audit
that went looking for the opposite, which is the most useful single result here.

**The shape the four live findings share is worth naming**, because it is likely to recur: each is a
rule that decides one thing correctly and is then read as having decided a second, adjacent thing.
`inert` decided *this control cannot act* and was read as *and that is all a reader needs*.
Non-goal 10 decided *do not remember a world* and was read as *and a URL is remembering*. § 20.12
decided *do not draw a lying toggle* and was read as *and not drawing it is the end of the matter*.
§ D106 decided *do not aggregate energy* and was read as *and therefore do not score it*. In every
case the rule is load-bearing and the extra step is not, and in every case the extra step is where
the usability went.

---

## Reproducing this

```bash
# The dead-control census, and the guard that holds it at zero.
ELEVATOR_SIM_CHROMIUM=/path/to/chromium \
  npx vitest run packages/viz/src/everyday/deadControls.browser.test.ts
```

Its failure message is the census: every disabled button on eleven Everyday screens that has no
accessible name, no reason, or an `aria-describedby` pointing at nothing.

## Sources

- [`DECISIONS.md`](../DECISIONS.md) §§ D106, D227, D299, D314, D335, D338, D350
- [`CLAUDE.md`](../CLAUDE.md) — Non-negotiable invariants, Statistical discipline, the standing
  requirement on integration seams
- [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) R3, R4, R5
- [`docs/22-charter.md`](22-charter.md) § 5 non-goals
- [`docs/31-support-matrix.md`](31-support-matrix.md) § 2, the viewport table
- GitHub issues #211, #229, #239, #262, #269
