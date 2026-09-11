# 39 — Decisions in force for the game's shape

**Status: index, written 2026-09-06 beside [`38-what-the-game-is.md`](38-what-the-game-is.md). Read
this before [`DECISIONS.md`](../DECISIONS.md) if you are about to touch the game layer.** It is
maintained: a decision that supersedes another adds a row here and a marker on the old entry, on the
same commit.

## 0. Why this page exists

[`DECISIONS.md`](../DECISIONS.md) holds 527 entries and about 370 000 words, and an agent reading it
from the top meets the four-tile front door, a mode called *Fix a building*, a campaign that does
not persist and a product with no currency, all stated as fact and all true when written. **Nothing
in that file is deleted or renumbered.** Ids are names ([§ D404](../DECISIONS.md),
[§ D405](../DECISIONS.md)), `citations.test.ts` requires every `§ Dnnn` written anywhere in the tree
to keep resolving to a heading, and a decision record preserves superseded text as history. So the
tidy is done the only way it can be: the entries the owner's 2026-09-06 rulings overtake carry a
**status line under their heading**, and this page is the map.

## 1. In force

The rulings that declare the game's shape, taken and confirmed by the product owner on 2026-09-06 —
the first three in one conversation, the last three later the same day:

| decision | what it rules |
|---|---|
| [§ D525](../DECISIONS.md) | Three modes, **Scenario** first, then **Career**, then **Rush**. *Fix a building* and *Today's tower* become Scenario content. No fixes are proposed; a budget, the whole editor, and a price ladder that runs dispatcher, equipment settings, building. Difficulty is the number of affordable configurations that survive, pre-simulated. Everything plays live. A rush round with recorded mid-run changes is postable |
| [§ D526](../DECISIONS.md) | One currency across the modes, earned by completing turns and spent on a mode's modifiers. Nothing resets on time. No purchase ships; the ledger is built so an add from outside is invisible to the play surface |
| [§ D527](../DECISIONS.md) | The model carries a building up to and slightly beyond the largest in the world: 165 levels, 57 lifts, 10 m/s, unpopulated mechanical floors, escalators. What already carries it is read off the tree; what is owed is five measurements |
| [§ D528](../DECISIONS.md) | Difficulty is the **survivor count**, budgeted by ladder position, positions one and two exempt from the dropdown clause. The **budget joins demand and fabric** as DC-R1's third substrate, and per-scenario scarcity is **a price, never a removed control**. DC-1, DC-2, DC-2b and DC-7 fold into one measurement; DC-9 is re-aimed from repairs to controls; DC-5 splits; a floor is added on the first hour |
| [§ D529](../DECISIONS.md) | The first session is a **two-screen tutorial** before Scenario — walk the player through the editor, then let a building fall apart and show the fix. Screen two is reused as the Rush tutorial. **A worked answer is permitted in the tutorial and nowhere else** |
| [§ D530](../DECISIONS.md) | The cross-mode currency is named **chimes**, closing the first of § D526's two open items |
| [§ D531](../DECISIONS.md) | The **sign-in bonus ships at launch**, in the one shape § D526 clause 7 permits — small, flat, unconditional, no compounding, no streak, nothing lost by missing it. Closes § D526's second open item, so `docs/38` § 5 has none left |

One ruled later, on 2026-09-10, narrowing how often § D526's awards pay rather than what they are:

| decision | what it rules |
|---|---|
| [§ D533](../DECISIONS.md) | **First time only.** A scenario pays once per account; a rush pays only the waves beyond the account's best; the server keeps the record, so posting a turn again pays nothing. A contract day is outside the ruling and still pays each day posted. **Scenario-mode clears only**, ruled the same day after the review of PR #505: a fix case pays today, campaign stages and the E1–E6 briefs pay once they are playable in Everyday, and a daily-loop week contract's clear pays no scenario award |

The standing decisions those three rest on, unchanged and cited rather than restated:

| decision | what it still says |
|---|---|
| [§ D299](../DECISIONS.md) | Two products over one engine; Everyday is a door, never a subset; named play styles are an entry point, never a ceiling |
| [§ D456](../DECISIONS.md) | The pillars are constraints on a session and not the reason for it; not at the expense of game play |
| [§ D345](../DECISIONS.md) | Difficulty may raise the stakes and may not move the bar |
| [§ D343](../DECISIONS.md) | The honesty corpus is measured once, after integration, on the integrator |
| [§ D366](../DECISIONS.md) | No entry-screen override survives a reload |
| [§ D372](../DECISIONS.md) | Stage 1 gets a building authored to be failable; `garden-apartments` is left alone |
| [§ D400](../DECISIONS.md), [§ D401](../DECISIONS.md) | A campaign day files and runs the length its contract is graded over |
| [§ D427](../DECISIONS.md) | What a tower buys reaches the run, proved on the legs |
| [§ D477](../DECISIONS.md) | The rush ends when the lobby overfills; the ramp is traffic and/or breakdowns |
| [§ D486](../DECISIONS.md) | A submission carries causes and the server derives effects |
| [§ D214](../DECISIONS.md), [§ D458](../DECISIONS.md), [§ D489](../DECISIONS.md), [§ D490](../DECISIONS.md), [§ D494](../DECISIONS.md) | Accounts, a replay-verified leaderboard, Everyday's own sign-in, one display name the account holds |
| [§ D344](../DECISIONS.md) | Sound ships, speed-tiered |
| [§ D404](../DECISIONS.md), [§ D405](../DECISIONS.md) | Decision numbers are reserved before work starts; a docstring is the record unless the decision reaches past its module |
| [§ D167](../DECISIONS.md), [§ D131](../DECISIONS.md), [§ D518](../DECISIONS.md) | Non-lift transport modes exist, the designer writes escalator rows, and double-deck operation is simulated |
| [§ D504](../DECISIONS.md), [§ D507](../DECISIONS.md) | A works night takes a car out; a campaign day's event is the campaign's own, drawn from the calendar and the odds. The two halves docs/32 named as owed, both landed |
| [§ D512](../DECISIONS.md) | A day is legible when a landing holds somebody in the third wait band for two contiguous minutes, and the sweep says which buildings ever are |
| [§ D503](../DECISIONS.md), [§ D516](../DECISIONS.md) | Every report lever opens the surface that changes it; a screen inside a mode offers only what the mode permits |
| [§ D506](../DECISIONS.md), [§ D509](../DECISIONS.md), [§ D521](../DECISIONS.md), [§ D522](../DECISIONS.md) | Boards publish a quantile ladder withheld below twenty players; ratings never reset and boards reset by construction; the house seeds a daily board on a schedule |
| [§ D520](../DECISIONS.md) | The dropdown sweep is built and tiered, and names the stages that still clear from the dropdown |
| [§ D537](../DECISIONS.md) | The survivor band **narrows by ladder position**, authored in `data/scenario-survivor-bands.json` as shares of the configurations judged at a scenario's base rung. The owner ruled the shape on 2026-09-10; **every figure is a draft awaiting approval**, and the band's only reader is an acceptance check |

## 2. Superseded or amended

Each of these carries a status line under its heading in [`DECISIONS.md`](../DECISIONS.md) saying
the same thing in one sentence.

| entry | what it said | status now | by |
|---|---|---|---|
| [§ D373](../DECISIONS.md) | *Fix a building* is a main-menu mode, not the default entry | **Superseded.** It is Scenario's first content, not a tile | § D525 |
| [§ D335](../DECISIONS.md) | The page opens on Everyday Mode with a four-tile menu | **Superseded in part.** Everyday first stands; the menu carries three tiles, Scenario first | § D525 |
| [§ D350](../DECISIONS.md) | #217 is split: the cleanup is code, the position is a decision | **Amended.** The position was ruled by § D373 and is now ruled by § D525 | § D525 |
| [§ D354](../DECISIONS.md) | The stage speed ladder is honest and opens at `30×` | **Amended.** The ladder stands; the opening speed moves to a watching rung, `1×` or `4×`, chosen by playtest | § D525 |
| [§ D475](../DECISIONS.md), [§ D514](../DECISIONS.md) | Every eligible building can carry the first session, drawn at random; built as a draw among the five legible contracts on a named stream | **Narrowed.** The first session is Scenario's first entry, authored to be doable with a tweak and failable with the wrong one; the draw among the legible five stands only where every candidate passes that test | § D525 |
| [§ D477](../DECISIONS.md) | Endless rush is kept; placement left open | **Amended.** Placement settled: the front door, as Rush, where § D515 had built it | § D525 |
| [§ D515](../DECISIONS.md) | Endless rush runs as a week of its own, ends on the hold line, quotes the sheet's trend test | **Amended.** The build stands; a round gains recorded interventions, a per-wave purse chimes can widen, and a postable result keyed by modifier set | § D525, § D526 |
| [§ D497](../DECISIONS.md) | A purchase may not change the crowd, the diagnosed repair may, and the basis line says which | **Amended.** With no authored repair roles, one rule per change: a fabric purchase may not change the crowd, a demand-side change may, and the basis line says which it did | § D525 |
| [§ D411](../DECISIONS.md) | `docs/25`'s slice definition is adopted | **Amended.** The slice is unchanged in content; its mode is *today's scenario* in Scenario rather than *Today's tower* | § D525 |
| [§ D414](../DECISIONS.md) | `docs/35` is adopted | **Amended.** § 6's placement question is settled and § 7's repair lists retire; the rest stands, including the stage a fix case has, which wave T built | § D525 |
| [§ D218](../DECISIONS.md) | A challenge board, and the prohibition it survives | **Amended.** Boards are keyed by modifier set as well as by day; a run carries its modifiers and never the chimes spent | § D526 |
| [§ D224](../DECISIONS.md) | The Engineer menu explains the game, checked against the game | **Re-derive.** The check stands; the explanation it checks changes with the mode set | § D525 |
| `docs/32` GD4 | Endless rush is a calibration instrument beside the bench | **Withdrawn** | § D525 |
| `docs/32` § 9 Q4 | The only day-2 mechanism is the daily seed | **Answered.** The daily seed, a record to beat, and a balance to save up | § D526 |
| `docs/26` § 10 non-goal 1 | No monetisation of any kind, and no event that supports one | **Amended.** No purchase ships anywhere; the ledger is built so an add from outside would be one more source and move nothing on the play surface; such a source is added only by a decision citing a measured `charter S4` | § D526 |
| `docs/04`, `data/buildings/README.md` | The shipped set tops out at `vertical-city`, 100 floors and 35 cars | **Extended.** A reference building at 165 levels and 57 lifts is owed, with the five measurements § D527 names | § D527 |
| `docs/33` DC-R1 | Difficulty may move declared traffic parameters and building fabric, **and nothing else** | **Amended.** A third substrate joins them: the budget and the price schedule. Scarcity is expressed as a price with its reason, never as a removed control | § D528 |
| `docs/33` DC-2 | No stage may clear from the dispatcher dropdown alone | **Superseded in part.** The blanket form is withdrawn; it becomes a per-tier budget on the survivor count, and **positions one and two are exempt** | § D528 |
| `docs/33` DC-2b | A stage must admit at least two profiles other than its baseline | **Superseded.** Deleted — § D525 clause 2 retires per-scenario control lists, so every scenario admits everything | § D528 |
| `docs/33` DC-1, DC-7 | Every stage must fail a goal under some plausible move; fix cases are ordered by how many offered repairs clear | **Superseded.** Both fold into the survivor count; DC-7's offered-repair list is retired by § D525 clause 2 | § D528 |
| `docs/33` DC-9 | No case may offer a repair that is inert unless it declares it inert | **Amended.** Re-aimed from repairs to controls: no control the editor offers may be inert in a scenario unless the scenario says so | § D528 |
| `docs/33` DC-5 | A contract's miss rate must be non-decreasing across days 1, 5, 10 and 20 | **Superseded in part.** The *growth reaches the run* half stands; the monotonicity half is dropped, because it bans a designed breather | § D528 |
| `docs/23` § 4 | The per-mode declaration, built from the handoff's four-row session-shapes table | **Superseded in part.** The mode set is three; the per-mode loop analysis stands unchanged and is marked as standing | § D525 |
| `docs/32` § 3.1 | There are three currencies, not one, and only one of them is money | **Amended.** A fourth ships — chimes, earned by completing turns and spent on modifiers; the three-currency analysis stands | § D526, § D530 |
| `docs/12` § 4 | The deviation register carried thirteen rows, 4.1–4.13 | **Extended.** Two rows added — § 4.14 the four-mode session table, § 4.15 the authored repair lists. CLAUDE.md's canonical-for-the-interface rule is **unchanged and still wins**; a deviation recorded in the register that exists for deviations is that rule working, not an exception to it | § D525 |

## 3. The rename map

Older entries use the names that were true when they were written. Read them with this table.

| where an older entry says | read | note |
|---|---|---|
| *Campaign* | **Career** | Same mechanics, same economy rules GD11 to GD14, and it persists |
| *Today's tower* | **today's scenario**, inside Scenario | The daily seed, the world board and the brief move whole |
| *Fix a building*, a *fixit case* | **a scenario**, one of Scenario's eighteen fix-case entries | The complaint stays; the repair menu, the decoys and the diagnosis line go |
| *Endless rush* | **Rush** | § D477's mechanic, on the front door |
| *the daily challenge* (Engineer surface, [§ D221](../DECISIONS.md)) | unchanged | The Engineer-side name for the same daily seed; the Engineer surface is not renamed |
| *units* | unchanged | Money inside a mode. Not the cross-mode currency |
| *credits* | **chimes** | The cross-mode currency of § D526. *Credits* was the placeholder; the name was ruled by [§ D530](../DECISIONS.md) on 2026-09-06 |

## 4. What was and was not re-read

This index was built by reading every decision heading, filtering on the words a mode, tile, front
door, currency, board, difficulty, speed, account or building-size ruling would carry, and reading
the body of every hit whose heading did not settle it. **An entry not named in § 2 is presumed to
stand.** Waves T to X, [§ D497](../DECISIONS.md) to [§ D524](../DECISIONS.md), landed on `main` while
this page was being written on a branch that had not seen them; they were read at merge time, which is
why the three rulings carry the numbers D525 to D527 rather than the D497 to D499 they were drafted
under, and the entries among them the rulings touch are placed in §§ 1 and 2. Two ranges were not re-read and are presumed untouched by the rulings, because the rulings
do not reach them: the engine and phase decisions up to about [§ D170](../DECISIONS.md), and the
viewer, corpus and handoff decisions from there to about [§ D300](../DECISIONS.md). A reader who
finds an entry contradicting [`38-what-the-game-is.md`](38-what-the-game-is.md) adds a row to § 2
and a status line to the entry, and does not edit the entry's text.

[`CLAUDE.md`](../CLAUDE.md) is not tidied by this page. Its status section describes the four-tile
front door and the modes by their old names in several paragraphs, and it is a project file whose
rewrite is the owner's; a pointer to this page sits at its top so nobody builds against those
paragraphs without seeing it.

## 5. The marker's shape

Under the heading of a superseded or amended entry, one blockquote line, first thing a reader
meets:

> **Status 2026-09-06: SUPERSEDED by [§ D525](../DECISIONS.md).** One sentence saying what stands
> instead. See [`docs/39`](39-decisions-in-force.md).

`SUPERSEDED`, `SUPERSEDED IN PART`, `AMENDED`, `NARROWED` or `RE-DERIVE`, in that vocabulary and no
other, so a grep for `Status 20` finds every one.

## Sources

- [`38-what-the-game-is.md`](38-what-the-game-is.md) — the page these rulings are the record of
- [`DECISIONS.md`](../DECISIONS.md) § D525, § D526, § D527, and every entry named in §§ 1 and 2
- [`32-game-design.md`](32-game-design.md) GD4 and § 9 Q4 — withdrawn and answered above
- [`26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) § 10 — non-goal 1, amended above
