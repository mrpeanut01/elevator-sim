# 39 — Decisions in force for the game's shape

**Status: index, written 2026-09-06 beside [`38-what-the-game-is.md`](38-what-the-game-is.md). Read
this before [`DECISIONS.md`](../DECISIONS.md) if you are about to touch the game layer.** It is
maintained: a decision that supersedes another adds a row here and a marker on the old entry, on the
same commit.

## 0. Why this page exists

[`DECISIONS.md`](../DECISIONS.md) holds 499 entries and about 370 000 words, and an agent reading it
from the top meets the four-tile front door, a mode called *Fix a building*, a campaign that does
not persist and a product with no currency, all stated as fact and all true when written. **Nothing
in that file is deleted or renumbered.** Ids are names ([§ D404](../DECISIONS.md),
[§ D405](../DECISIONS.md)), `citations.test.ts` requires every `§ Dnnn` written anywhere in the tree
to keep resolving to a heading, and a decision record preserves superseded text as history. So the
tidy is done the only way it can be: the entries the owner's 2026-09-06 rulings overtake carry a
**status line under their heading**, and this page is the map.

## 1. In force

The three rulings that declare the game's shape, taken by the product owner on 2026-09-06 and
recorded as drafts until the owner confirms their text:

| decision | what it rules |
|---|---|
| [§ D497](../DECISIONS.md) | Three modes, **Scenario** first, then **Career**, then **Rush**. *Fix a building* and *Today's tower* become Scenario content. No fixes are proposed; a budget, the whole editor, and a price ladder that runs dispatcher, equipment settings, building. Difficulty is the number of affordable configurations that survive, pre-simulated. Everything plays live. A rush round with recorded mid-run changes is postable |
| [§ D498](../DECISIONS.md) | One currency across the modes, earned by completing turns and spent on a mode's modifiers. Nothing resets on time. No purchase ships; the ledger is built so an add from outside is invisible to the play surface |
| [§ D499](../DECISIONS.md) | The model carries a building up to and slightly beyond the largest in the world: 165 levels, 57 lifts, 10 m/s, unpopulated mechanical floors, escalators. What already carries it is read off the tree; what is owed is five measurements |

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
| [§ D167](../DECISIONS.md), [§ D131](../DECISIONS.md) | Non-lift transport modes exist; double-deck operation is simulated |

## 2. Superseded or amended

Each of these carries a status line under its heading in [`DECISIONS.md`](../DECISIONS.md) saying
the same thing in one sentence.

| entry | what it said | status now | by |
|---|---|---|---|
| [§ D373](../DECISIONS.md) | *Fix a building* is a main-menu mode, not the default entry | **Superseded.** It is Scenario's first content, not a tile | § D497 |
| [§ D335](../DECISIONS.md) | The page opens on Everyday Mode with a four-tile menu | **Superseded in part.** Everyday first stands; the menu carries three tiles, Scenario first | § D497 |
| [§ D350](../DECISIONS.md) | #217 is split: the cleanup is code, the position is a decision | **Amended.** The position was ruled by § D373 and is now ruled by § D497 | § D497 |
| [§ D354](../DECISIONS.md) | The stage speed ladder is honest and opens at `30×` | **Amended.** The ladder stands; the opening speed moves to a watching rung, `1×` or `4×`, chosen by playtest | § D497 |
| [§ D475](../DECISIONS.md) | Every eligible building can carry the first session, drawn at random | **Narrowed.** The first session is Scenario's first entry, which is authored to be doable with a tweak and failable with the wrong one; a random draw among buildings is permitted only where every candidate passes that test | § D497 |
| [§ D477](../DECISIONS.md) | Endless rush is kept; placement left open | **Amended.** Placement settled: the front door, as Rush | § D497 |
| [§ D411](../DECISIONS.md) | `docs/25`'s slice definition is adopted | **Amended.** The slice is unchanged in content; its mode is *today's scenario* in Scenario rather than *Today's tower* | § D497 |
| [§ D414](../DECISIONS.md) | `docs/35` is adopted | **Amended.** § 6's placement question is settled and § 7's repair lists retire; the rest stands, including the stage a fix case gains | § D497 |
| [§ D218](../DECISIONS.md) | A challenge board, and the prohibition it survives | **Amended.** Boards are keyed by modifier set as well as by day; a run carries its modifiers and never the credits spent | § D498 |
| [§ D224](../DECISIONS.md) | The Engineer menu explains the game, checked against the game | **Re-derive.** The check stands; the explanation it checks changes with the mode set | § D497 |
| `docs/32` GD4 | Endless rush is a calibration instrument beside the bench | **Withdrawn** | § D497 |
| `docs/32` § 9 Q4 | The only day-2 mechanism is the daily seed | **Answered.** The daily seed, a record to beat, and a balance to save up | § D498 |
| `docs/26` § 10 non-goal 1 | No monetisation of any kind, and no event that supports one | **Amended.** No purchase ships anywhere; the ledger is built so an add from outside would be one more source and move nothing on the play surface; such a source is added only by a decision citing a measured `charter S4` | § D498 |
| `docs/04`, `data/buildings/README.md` | The shipped set tops out at `vertical-city`, 100 floors and 35 cars | **Extended.** A reference building at 165 levels and 57 lifts is owed, with the five measurements § D499 names | § D499 |

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
| *credits* | placeholder | The cross-mode currency of § D498, name pending the owner |

## 4. What was and was not re-read

This index was built by reading every decision heading, filtering on the words a mode, tile, front
door, currency, board, difficulty, speed, account or building-size ruling would carry, and reading
the body of every hit whose heading did not settle it. **An entry not named in § 2 is presumed to
stand.** Two ranges were not re-read and are presumed untouched by the rulings, because the rulings
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

> **Status 2026-09-06: SUPERSEDED by [§ D497](../DECISIONS.md).** One sentence saying what stands
> instead. See [`docs/39`](39-decisions-in-force.md).

`SUPERSEDED`, `SUPERSEDED IN PART`, `AMENDED`, `NARROWED` or `RE-DERIVE`, in that vocabulary and no
other, so a grep for `Status 20` finds every one.

## Sources

- [`38-what-the-game-is.md`](38-what-the-game-is.md) — the page these rulings are the record of
- [`DECISIONS.md`](../DECISIONS.md) § D497, § D498, § D499, and every entry named in §§ 1 and 2
- [`32-game-design.md`](32-game-design.md) GD4 and § 9 Q4 — withdrawn and answered above
- [`26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) § 10 — non-goal 1, amended above
