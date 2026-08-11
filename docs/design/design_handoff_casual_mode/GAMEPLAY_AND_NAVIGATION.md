# Everyday Mode — Gameplay & Navigation Guide

*The mass-market door into elevator-sim. Written to be built from, not admired.*

Companions: **ENGINE_CONTRACT.md** — every number, formula and seed. **ISSUE_ADJUDICATION.md** —
how each open repo issue is answered here, and which of their requests became rules. This
document says what the player does and sees; the contract says what the machine must compute.
Where a mechanic has maths, this document names it and the contract defines it.

---

## 0. How to read this

`Elevator Sim Casual.dc.html` is the layout reference. This document is the behaviour
reference. Where they disagree:

- **On layout, spacing and copy**, the prototype wins.
- **On what a control does, what a number means, and what happens next**, this document wins.
- Where the prototype fakes something (a score computed from a closed-form model rather than a
  run, a ghost that ignores the picker), it is called out in §20 as work, not as design.

Read §1, then §3, then the mode you are building. §20 is the work order and the acceptance
checks; it is the only section that describes the gap between what exists and what is
specified.

Everything here has been traced against the prototype as it stands. Section numbers are stable
references — cite them in commits.

---

## 1. The premise, and the one rule that cannot bend

Elevator-sim is a rigorous vertical-transportation simulator that happens to be a game.
Everyday Mode is **a different door into the same building**, not a simplified copy of it.
Per § D299 of the main repo: two products over one engine, and neither is allowed to eat
the other.

**The rule:** Everyday Mode may change *what it says* and *how it asks*. It may never
change *what is true*, and it may never claim something the engine cannot support.

Three things this mode must never do:

1. **Never declare a winner from one run.** A day is an anecdote. The word "proof" belongs
   only to the bench, which runs matched crowds and is allowed to answer *too close to call*.
2. **Never show a figure whose basis has gone stale.** An unfinished day shows `—`, not `0%`.
   An edited dispatcher reads *not since your last change*, not its old bench result.
3. **Never let two numbers on one screen disagree.** Every count is derived from one source.
   If a row says "5 cleared" the calendar must draw five ticks, because both read the same
   expression. This was the single largest source of defects while prototyping — assume it
   will be yours too, and derive relentlessly.

Engineer Mode keeps the schematic view, the intervals, the parameter schema. Everyday Mode
gets a stage worth watching and plain language. Both reach the full weight vector; named
play styles are an entry point, never a ceiling.

**The voice.** Plain, specific, slightly dry. Say what happened and what it cost. Never
gamify with exclamation marks, never congratulate, never say "Oops!". A tenant took the
stairs; a lift was red-tagged; the queue stopped draining at wave nine. Numbers carry
units. Jargon is either replaced ("away inside a minute", not "AWT") or explained in place
("each car is given a score for answering the call; the lowest score wins").

---

## 2. Vocabulary — fixed names, used everywhere

Drift in these words is how two screens end up disagreeing. Use them in code, in copy, and
in this document identically.

| Term | Means | Never called |
|---|---|---|
| **day** | one simulated 06:00–19:00 shift in one building | level, mission, round |
| **run** | one execution of a day by one dispatcher | attempt, try |
| **dispatcher** | a named, saved weight vector + flags + rules | AI, algorithm, bot |
| **play style** | one of the six authored starting dispatchers | preset, difficulty |
| **lever** | a plain-language control that moves one or more cost terms | slider, param |
| **cost term** | one of the thirteen weights the dispatcher scores a call with | cost, penalty |
| **ghost** | a second dispatcher driving a second copy of the same crowd | rival, opponent |
| **wrinkle** | the day's one authored constraint (a shaft out, a coach at eleven) | modifier, event |
| **the bench** | the private comparison instrument. Scores nothing | leaderboard |
| **the board** | today's public ranking on today's tower. Resets daily | leaderboard |
| **the ladder** | the standing public rating for a dispatcher across 40 proof cases | leaderboard |
| **the gauntlet** | the 40-case run that produces a ladder rating | tournament |
| **unit (u)** | campaign and repair currency. Always written `4 u` | coin, credit, cash |
| **works night** | a night of installation that takes a car out for the next day's peak | downtime |
| **cleared / missed** | a campaign day that passed all four tests / failed one or more | win, lose |
| **standing** | career reputation number that opens slots | score, XP, rank |
| **slot** | permission to hold one more building | licence |
| **case** | one Fix-a-building scenario | puzzle, level |

Two figures are the game's spine and appear on almost every screen. Both are always
labelled in full:

- **away inside a minute** — the share of people who boarded within 60 s of arriving.
- **the longest anybody stood** — the single worst wait in the run, in seconds.

---

## 3. The shell

### 3.1 Geometry

```
┌──────────┬───────────────────────────────────────────────┐
│  RAIL    │  SCROLL REGION (one screen at a time)         │
│  212px   │                                               │
│          │                                               │
│  fixed   │                                               │
│          │                                               │
│          ├───────────────────────────────────────────────┤
│          │  PINNED ACTION BAR (owned by the shell)       │
└──────────┴───────────────────────────────────────────────┘
```

- App shell: `height:100vh; display:grid; grid-template-columns:212px minmax(0,1fr); overflow:hidden`.
- Main: `display:grid; grid-template-rows:minmax(0,1fr) auto; overflow:hidden`.
- **Only the app shell declares a viewport height.** No screen may use `100vh`, and no screen
  may declare its own footer. It was nine per-screen bars once; consolidating fixed both the
  layout drift and the inconsistent affordances.
- The scroll region scrolls; the rail scrolls independently; the bar never moves.

### 3.2 The rail, exactly

| Group | Items | Notes |
|---|---|---|
| — | brand block: `Elevator Sim` / `EVERYDAY MODE` | not a link |
| — | **Settings** | its own screen (§15.1). Sits under the identity card, above the Engineer swap, and is the one rail item drawn as a bordered row with a **gear icon** and a `›` — a destination, not a caption on the identity card |
| — | **Main menu** with a live subline | the subline names where you are: `YOU ARE HERE`, `TODAY'S TOWER`, `A DAY YOU MISSED`, `AT THE BRIEF`, `MID-DAY · 08:41`, `IN THE RUSH · HELD 12:04`, `READING THE REPORT`, `READING THE RUSH`, `CAMPAIGN`, `CAMPAIGN · CHANCERY HOUSE`, `FIX A BUILDING`, `WORKSHOP`, `TEST BENCH`, `BUILDING DESIGNER`, `TUNING`, `YOUR WEEK`, `TODAY'S BOARD`, `DISPATCHER LADDER`. Pressing it runs the same exit logic as the bar's left button (§3.4) |
| `CAMPAIGN` | All buildings · *the open building's name* · Contract & works | **only rendered while `ctx === 'campaign'`** |
| `DESIGN` | Dispatcher workshop · Test bench · Design a building | always available |
| `WORLD` | Your week · **Boards & ladder** | always available |
| footer | `PLAYING AS` card (avatar, name, streak line) · **Settings** · **Switch to Engineer** | Engineer swap is a product-level route, stubbed |

**The two boards are one rail item.** They are one tabbed screen, so they get one entry
(`Boards & ladder`), highlighted for either tab. Two entries into one screen made the rail lie
about how many places there are. The tabs themselves carry the distinction (§14).

**Tune the tower is not a rail item.** It is a per-day sandbox escape hatch reached from the
brief (*Take it to the sandbox*) and from the report's third lever. It is a thing you do to a
day, not a place you live. (Earlier drafts of this document listed it in the rail; that was
wrong.)

**The rail is not mode selection.** Modes are chosen on the menu, deliberately, one at a time.
The rail holds the always-available workshop and world surfaces plus, once you are inside the
campaign, that campaign's three stops.

### 3.3 The action bar

```
[leave mode] [‹ back] [1 ›2 ›3 ›4 timeline] ............ [note] [PRIMARY ›]
```

- **Back** appears only where there is a linear parent: brief → door, stage → brief,
  report → stage, building → all buildings, contract → all buildings. In a campaign run the
  parent of stage/report is the building desk.
- **The timeline** is per-flow, not global. Daily: `Front door › Brief › The day › How it went`.
  Campaign: `All buildings › <building> › Contract › The day › How it went`. **A rush has no
  timeline at all.** Reached steps are clickable; unreached steps are inert and dimmed.
- **One primary per screen, named for its effect.** Never "Next", never "Continue".
- **The note is the honest caveat**, not marketing.
- **On the last step of a mode the emphasis inverts:** on the report, and on a solved fix
  case, the primary loses its amber fill and the way out (`⌂ Return to Main Menu`,
  `⤺ All buildings`, `⤺ Leave the rush`) takes it. The onward action stays available, quietly.

Complete bar table — build from this, not from memory:

| screen | left button | back | timeline | primary | note |
|---|---|---|---|---|---|
| menu | `⌂ Modes` (inert) | — | — | `Play today's tower` / `Play the campaign` / `Play the rush` / `Play a broken building` (follows the selected card) | Pick a mode above, then play it. |
| door | `⤺ Leave today's tower` | — | 1/4 | `Set up today` · `Set up the replay` when a past day is selected | Pick who drives, then run it. |
| brief | `⤺ Leave today's tower` | Front door | 2/4 | `Start the day` | Running the lifts: *style* |
| stage · daily | `⤺ Leave today's tower` | Brief | 3/4 | `Close the day` | Stops the clock and writes the report. |
| stage · campaign | `⤺ Leave the campaign` | *building* | 4/5 | `Close the day` | Stops the clock and writes the report. |
| stage · rush | `⤺ Leave the rush` | Endless rush | — | `End the rush` | Stops the climb and counts the waves. |
| report · daily | `⤺ Leave today's tower` | The day | 4/4 | `Your week` | Seven days, and where the world landed. |
| report · campaign | `⤺ Leave the campaign` | The day | 5/5 | `Back to <building>` | — |
| report · rush | `⤺ Leave the rush` | The day | — | `Run the rush again` | Waves are identical for everyone. |
| towers | `⤺ Leave the campaign` | — | 1/5 | `Open <building>` | *N* buildings want a decision. |
| building | `⤺ Leave the campaign` | All buildings | 2/5 | `Run the day and decide as it goes` · `Run the day with that` once an option is picked · `Send your answer` / `Choose an option first` on a renewal · `Watch a day here` when quiet | the picked option's effect, or *the options travel with you — you can answer while the day plays* |
| contract | `⤺ Leave the campaign` | All buildings | 3/5 | `Lock it in and run day N` · `Start the month again` (red) when the allowance is spent | nights of works ahead, or the month-over sentence |
| rush setup | `⤺ Leave the rush` | — | — | `Start the rush` | Nothing to set up. It ends when it ends. |
| fixit | `⤺ Leave this building` | — | — | `Run the day` · `Run it again` · `Next building` once passed | what the run will measure |
| workshop | `⌂ Modes` | — | — | `Run a day with this` | Unsaved changes travel with the run. / Nothing changed yet. |
| bench | `⌂ Modes` | — | — | `Run the suite` · `Run the suite again` | Matched crowds for every dispatcher in the field. |
| tuner | `⌂ Modes` | — | — | `Run it and watch` | Sandbox — this run will not be scored. / Scored day — three things are fixed. |
| designer | `⌂ Modes` | — | — | `Run a day in it` | Nothing here is scored. It is a drawing board. |
| week · board | `⌂ Modes` | — | — | `Play today's tower` · `Replay today's tower` once closed | — |
| settings | `⌂ Modes` | — | — | `Back to the modes` | — |
| stage · watching | `⤺ Stop watching` | — | **none** | `Play this crowd yourself` | Their record, replayed. Nothing here is scored, and your own day is untouched. |

### 3.4 Leaving a mode has friction

- The left button **names what is being abandoned**, never "Back" or "Exit".
- **A watched run never warns.** It is somebody else's record; there is nothing of yours to
  lose, so `⤺ Stop watching` returns to the board immediately and clears the spectator state.
- **Mid-run only** — `screen === 'stage'` and the day not yet closed — pressing it replaces the
  entire bar with a confirm strip: the question (*Leave the day unfinished?* / *Leave the
  rush?*), the consequence (*Today's run will not be scored, and the board keeps whatever you
  posted before.* / *The climb is not saved, and a stopped rush has no wave to post.*), and
  **Leave it** / **Stay**.
- Everywhere else it leaves immediately. A report is already after the fact; warning about it
  would be theatre. Leaving clears `ctx` and `rush`.

### 3.5 Entry

**The app always opens on the main menu, and this is not overridable.** There is no
deep-link parameter and no `startScreen` prop; the prop was removed outright and must not
come back. A player's first frame is the mode choice, never a mode already in progress.

The only authored knobs on the prototype are `ghostRace` (draw the ghost lines or not) and
`careerStage` (which of the three campaign snapshots to inspect). Both are inspection aids,
not gameplay.

---

## 4. Screen inventory

Sixteen screens, one `screen` key each. `ctx` (`daily | campaign | rush`) tells the stage and
the report which flow they are serving; `modePick` is the menu's selection before commitment.

| key | name | reached from | leads to |
|---|---|---|---|
| `menu` | Main menu | rail, any exit | door · towers · rush · fixit |
| `door` | Front door | menu (Today's tower) | brief · workshop · tuner |
| `brief` | The brief | door | stage · workshop · tuner |
| `stage` | The day | brief · building · contract · rush · workshop · tuner · designer | report |
| `report` | How it went | stage | week · building · rush · workshop · tuner |
| `towers` | All buildings | menu (Campaign) | building · contract |
| `building` | Building desk | towers, rail | stage · contract · workshop |
| `contract` | Contract & works | building, rail | stage |
| `rush` | Endless rush setup | menu (Endless rush) | stage |
| `fixit` | Fix a building | menu (Fix a building) | — (self-contained) |
| `workshop` | Dispatcher workshop | rail, door, brief, report | stage · bench · board(ladder) |
| `bench` | Test bench | rail, workshop, stage | — |
| `designer` | Design a building | rail | stage |
| `tuner` | Tune the tower | brief, report | stage |
| `week` | Your week | rail, report | board · door |
| `board` | Today's board / Dispatcher ladder | rail, week, workshop | door · stage (watching) |
| `settings` | Settings | rail | menu |

The stage is shared by three modes and behaves differently in each: a daily run has a
timeline and a world ghost; a campaign run has a money-and-incident dock; a rush has held
time instead of a clock and no timeline at all. Implement it as **one component with a run
context**, never as three copies.

---

## 5. Session shapes

| Mode | Length | The loop | Can you lose? |
|---|---|---|---|
| Today's tower | ~3 min | one day, one score, once a day | no — a day is a score, not a pass |
| Campaign | ongoing, ~2 min a building-day | clear days, spend units, keep contracts | yes — three lost contracts ends the career |
| Endless rush | ~5 min | one climbing day until it stops draining | the run always ends; the question is when |
| Fix a building | ~5 min a case | diagnose, reconfigure, re-run, pass or retry | no — a case can be retried forever |

---

## 6. Mode 1 — Today's tower

One building, one crowd, one seed, everybody. The only variable is the dispatcher you bring.
Today's fixture is Chancery House: 14 floors, 1,180 people, 3 lifts, shaft C out until noon,
crowd seed 424242. The seed line is printed on the door and the brief so two players can
confirm they had the same morning.

### 6.1 Front door (`door`)

Order on screen, top to bottom:

1. **The date stepper** — `‹` and `›` either side of the day label, plus a seven-chip strip
   for the last week. `dayOffset` runs −6…0. The forward arrow dims at 0. Each chip shows the
   weekday, the tower, and your score or `—`; the selected chip is inked.
2. **The kind pill** — `TODAY'S TOWER` at offset 0, `REPLAY · DOES NOT COUNT` otherwise.
3. **Yesterday's world result, before any button.** Three figures across a ruled band:
   *14,203 people played this tower yesterday · the middle player got away inside a minute 78% ·
   the worst wait anyone recorded 3 m 21 s.*
4. **Two histograms** of the world's distribution — away-inside-a-minute, and the longest
   anybody stood — with axis labels (`30% · median 78% · 95%`; `40 s · median 165 s · 300 s`).
   **Your mark appears only once the day is closed.** Before that there is nothing to place.
5. **The lede**, naming the building in words a stranger understands.
6. **Three numbered steps** (pick who drives · watch the day · read what happened), so a
   first-time player knows the shape of the next three minutes.
7. **Today's top five** from the board, your row highlighted when you have one.
8. The seed line, and the sentence *Everyone plays the same tower, the same crowd, the same
   day. The only thing that differs is the dispatcher you bring.*

**Every past day stays playable.** A missed day fills the gap in your week without scoring; a
replay leaves your original result on the board. The primary states which:
`Play the day you missed` / `Replay tuesday's tower`, and the note under it says what the
replay does to your record. **Never silently rescore history.**

### 6.2 The brief (`brief`)

Left column, one card:

- **A cutaway elevation** of today's tower drawn to canvas: roof slab, storeys with windows,
  three shaft wells cut as dark voids, a car parked in each working well, the out-of-service
  well dashed in terracotta with a lettered badge, an entrance canopy, floor numbers at top,
  middle and ground.
- **The out-of-service strip**: `C` · *Shaft C is out of service until noon.*
- **The facts**, five rows: floors, people, lifts (`3 · one out until noon`), **each car holds
  `13 · 26 a trip this morning`**, rated speed. Capacity is always paired with the crowd it
  must clear; the bare number means nothing.
- **The load reading** in plain language, on a tinted panel: `Busy` ·
  *590 people per working car this morning. Comfortable is around 400.*

Right column:

- **Today's wrinkle** on an amber card: title, then what it does and the fact that everyone
  playing today gets the same one at the same time.
- **Who drives today** — three recommended style cards (dot, name, first sentence of the
  blurb, and `driving today` / `tap to choose`), plus a dropdown of **every** style and every
  dispatcher you have saved (`Morning Shift v3 — yours`), a count (`6 styles · 2 of yours`),
  and a link into the workshop.
- **Race against** — the ghost picker: *the world's middle · your best, <name> · the plain
  baseline · nobody*, each with a one-line note. Under it: *One day each is a race, not proof.
  The test bench settles it properly.*
- **Locked for score** — the tower, machines and crowd are the same for everyone today; you can
  change all of them and the run stops counting. Button: *Take it to the sandbox* → tuner.

**The ghost is always a dispatcher, never another day.** The tower changes daily, so
"yesterday you" is not comparable and must not be offered.

### 6.3 The day (`stage`) — see §7

### 6.4 Closing the day

`Close the day` is the **only** thing that sets `dayClosed`. Navigating to the report by any
other route must not set it. On close, and in this order:

1. Stop the clock; freeze both sims.
2. Compute the run's figures from the sim, not from anything cached: away %, longest wait,
   carried, gave up, trips, peak lobby queue.
3. Place the run in the world distribution (percentile) and, if `noPost` is off and the day is
   today, post it to the board.
4. In a campaign run, evaluate the four tests (§8.6) and mark the day cleared or missed.
5. Write the report.

An unfinished day shows `—` everywhere it would otherwise show a figure: today's card in Your
week, your row on the board, your percentile.

### 6.5 The report (`report`)

- **Head and lede** — a plain causal account naming the hour that decided it, the dispatcher
  by name, and the headline figure in words.
- **Four figures** — away inside a minute (with the world's middle beside it), the longest
  anybody stood (and where and when), people carried, and **took the stairs** (people who gave
  up before a car arrived, in grey).
- **Three beats**, each a time, what happened, and why, colour-keyed amber/terracotta/moss:
  the first real queue, the worst wait of the morning, and the moment the wrinkle lifted.
- **Three levers**, each a live handoff into the workshop (§11.6). Two carry a suggested
  change; the third is honest about being a building problem, not a dispatcher one, and routes
  to the tuner.
- **The closing honesty block** — *You finished level with the world's middle run on the same
  crowd. On a single day that is inside the noise.* The verdict wording comes from the same
  expression the stage's race verdict uses: under three points is `level with`.
- **Any interventions you made**, in time order, with their stamps (§7.6).

**In a campaign run the report is the between-day beat**, and its order is fixed, because this
is the screen that carries progression:

1. **The verdict** — cleared or missed, and which of the four tests decided it.
2. **What it cost you** — people who took the stairs, the worst wait and who had it, trips spent
   against the budget, units spent today.
3. **What changed overnight** — tenants moving in, an event booked, a car out for service
   tomorrow, a service window falling due. The calendar already knows all of it; say it here.
4. **What you can spend** — the purse and the two or three tiers actually reachable today, each
   with its nights of works, linking into the shop rather than describing it.
5. **One button into tomorrow**, which opens the next day **paused** on its brief.

A report is never a dead end and never a footnote: no statistical small print above the button,
and no second competing CTA pointing at a different building.

---

## 7. The stage

### 7.1 Header

`clock` (or held time in a rush) · phase pill (`Morning rush`, or `wave 9`) · `DRIVING` with
the dispatcher's dot and name · three live figures (away inside a minute, standing right now,
longest so far) · **Pause/Play** · five speed buttons `½× 1× 4× 12× 30×`.

Speeds are relative to each other, not to real time; the engine advances a fixed number of
simulated seconds per real second at each setting (contract §4.6). A day at `1×` takes about
26 minutes; at `30×` about eighty seconds. `Default speed` in settings cycles this.

### 7.2 What the canvas draws

A warm cutaway elevation: floor slabs with tenant names and floor numbers, shaft wells as
light voids, cars as dark boxes with amber doors that split as they open, riders as marks
inside the car, a `riders/capacity` readout above each car, and a direction arrow while it
travels.

Waiting people are small capsule figures at the landings, **coloured by how long they have
stood**: green under 30 s, amber to 75 s, terracotta to 150 s, grey once they have taken the
stairs. That ramp is the game's core read — a player should learn to see a bad morning before
reading a number. Landings draw up to 26 figures and then `+N`.

An out-of-service shaft is dashed, empty, and labelled `OUT OF SERVICE` down the well.

A legend sits under the stage naming the four colours in plain words.

An alarm strip appears top-right when more than forty people are standing:
*47 people waiting in the lobby*, with a breathing dot.

### 7.3 What you can touch

Speed, pause, the camera, and **a small set of policy changes that take effect during the day**
(§7.6). What you cannot do is steer a car: there is no joystick, because a joystick would make
the dispatcher irrelevant and two players' days incomparable. The fantasy is the supervisor's —
you change policy and watch the building answer — and the interface says so rather than leaving
a newcomer hunting for a control that should not exist.

The stage always enters **paused**, at 06:00, with the day's first frame drawn and a single
centred `Start` affordance. **Speed never carries across days**: each run opens at the player's
default speed, so a day can never vanish in three seconds because the last one ended at 30×.

### 7.4 The race strip

Two lanes under the stage, both plotted against the clock, sampled every four simulated
minutes:

- **Top — how long people are waiting**: the average wait of the people standing *right now*,
  in seconds, with a dashed sixty-second line so it reads without a legend. (It plotted
  cumulative away-in-a-minute once; that duplicated the header figure. The strip must say
  something the header does not.)
- **Bottom — still standing**: how many people are waiting anywhere in the building. One line
  climbs, one breathes.

Your line is terracotta and heavier; the ghost's is grey; behind the ghost sits a **band**
whose meaning is stated in the strip header and changes with the pick: *the middle half of
today's players* for the world ghost, *how much a different morning could move it* for a
baseline, *same crowd both runs — the gap is your change, not the morning* for a replay.

Header also carries the live verdict: `too close to call` under three points, else
`ahead by N points` / `behind by N points`. Footer, permanently: *One day each on the same
crowd. That is a race, not proof.* and a button to the bench.

With the ghost set to **nobody**, the ghost lines and band are not drawn and the verdict is
replaced by the plain figure. The strip never invents a rival.

### 7.5 The campaign dock

When `ctx === 'campaign'`, a 288 px column floats at the right of the stage:

- The building and its contract day, then three figures: **on hand**, **if today clears**,
  **spent today**.
- The open incident under `HAPPENING NOW` with a live clock, its title, its note, and its
  options as radio rows carrying cost and when it takes effect.
- Footer: *Choose whenever you like — nothing changes until you do, and the day carries on
  without an answer.* Once answered: *Maintenance is on it. Anything temporary reverts on its
  own when this closes.*

The answer is stamped with the simulated time it was given, and that stamp appears on the
report. This is the "budget for planning purposes": visible at the moment the decision is
made, not two screens away. Mechanically it is one instance of §7.6.

### 7.6 Interventions — changing policy during a day

A run is not a movie. It is a **record**:

```
run = (seed, config, interventions[])          intervention = { atS, change }
```

When the player changes something mid-day, the change is appended at the current simulated
second and the day **re-simulates from t = 0**, with playback resuming at the same playhead. The
prefix is bit-identical, so the picture does not jump; only the future changes, which is exactly
the drama worth having. Determinism is untouched and replay verification simply replays the log
too (contract §1.4).

What may be intervened on, in the order it should be built:

1. **Park the cars in the lobby** — one toggle, understandable, visible within seconds, already
   modelled. This is the whole first pass.
2. **Switch who is driving** — any style or saved dispatcher, from the stage.
3. **Answer a campaign incident** — already built (§7.5); it is the same mechanism, previously
   scoped to one mode.

Rules:

- **Every intervention is stamped and listed.** The stage shows the most recent one under the
  header (`09:14 · switched to Lobby anchor`); the report lists them all in its account of the
  day, in time order, beside the beats they caused.
- **A re-simulation is not a reset.** The clock, the figures and the strip continue from the
  playhead. On the two largest towers this costs about a second; show a `recomputing` beat rather
  than freezing silently.
- **Interventions do not disqualify a run.** They are part of the record, and every player has
  the same power. Changing the *tower, machines or crowd* still makes a run a sandbox run — that
  distinction is between changing the building and changing your mind.
- **A control that cannot take effect now must say so.** Anything mid-run that is next-run only
  reads `takes effect on the next run` and offers `Re-run this day with <name>` the moment the
  selection differs from what is running. A control that does nothing and says nothing is worse
  than one that is disabled.

---

## 8. Mode 2 — Campaign

You are the **supervisor**, not the operator. Buildings run on the standing order you gave
them; maintenance handles the rest; you hear from them when something changes. This is the
mode that makes tuning *gameplay* rather than sandboxing, and the only mode that can be lost.

### 8.1 All buildings (`towers`)

Top to bottom:

1. **Title, snapshot pill and one-line summary.** The screen announces which career snapshot
   it is showing (`WEEK ONE`, `SECOND MONTH`, `FIFTH MONTH`) and opens with that stage's
   sentence. It has **no switcher of its own** — `careerStage` is the only control.
2. **The career band** — five figures: day *N* of your career; months worked; standing (with
   what is banked from finished contracts and how far the next slot is); buildings due a
   service window (`2 of 6`); contracts lost (`1 of 3`).
3. **The rolling calendar** (§8.7).
4. **The triage list**, one row per building. **A building is a commitment, not a setting**: it
   keeps its own purse, carried units, standing order, fitted kit, booked works, wear clock and
   contract day, so opening one never disturbs another and returning to one resumes rather than
   resets. Each row must sell the building and state where you left it — name, spec, **quirk in
   one line** (*Everyone leaves within the same twenty minutes*), complexity and fee, contract
   day, record (`18 cleared · 1 missed`), wear (`5 months held · 62% to service`), **standing
   order** as two inline selects — dispatcher (every style plus everything you have saved) and build —
   what it wants you for, and one button. A quiet building reads *Nothing — it is running
   itself* in moss with what is next, and its button is `Look in`. A building with an incident
   is on an amber card, its title in terracotta, button `Open` (or `Renew` on a renewal).
5. **Slots** — six cards, `in hand` / `open` / `N needed`, each with its one-line note.
6. **Offers on the table** — see §8.8.
7. **What has happened lately** — a feed of events, none of them your doing, which is the
   point.
8. Footer: *N of M buildings want a decision · the rest need nothing from you today.*

### 8.2 The building desk (`building`)

One building, opened because it asked. In order:

- **The incident brief in prose**, with the deadline and `3 of 3 missed days used · standard`
  beside it — derived from the difficulty, never written into the copy.
- **What do you want done** — three or four options, each with cost, when it takes effect, and
  the honest trade. An option you cannot afford is dimmed and reads `· need 12 more`, and
  cannot be selected. Above them: *maintenance can handle any of it — they need you to choose*
  (or, on a renewal, *a finished contract frees its slot — that is how you move up*).
- **Dispatcher standing order** — what this building does every day without asking you, fully
  editable here: every named play style and every dispatcher you have saved, with the style's
  one-line trade printed beneath the picker, plus the build and a link into the workshop. A
  supervisor reassigns policy from the building's own desk; they should never have to leave the
  campaign to change who drives.
- **What is fitted** — one row per shop category: level fitted, level booked, or *as built*.
- **How the crowd behaves** — an hour-by-hour bar chart 07:00–18:00 split into lobby traffic
  and floor-to-floor traffic, the peak named (`08:00 · arriving`), the lobby/interfloor split
  as a proportional bar, the demand bands with their share of the population and their
  direction, and a plain reading of what the shape means for a zoning decision.
- **Condition** — trips against the service interval with a wear bar, the head
  (*Recently serviced* / *Wearing in* / *Service window due*), roughly how many working days
  are left, and what the window will cost (one lift a night for three nights).
- **Odds of a failure** — a percentage a day, with the honest note that every trip adds to it
  and that booking the window resets it.
- **Temporary changes** — what reverts, when, and a *Put it back now* button. An emergency
  setting must never quietly become the standing order.
- On a renewal, the **offer**: their rate, your record, and the reasoning (§8.9).

### 8.3 Contract & works (`contract`)

- **Title, spec, day *N* of twenty, fee**, and the lede: *A perfect month buys about a third of
  the shop, so the month is really a question about what this building will never get.*
- **Difficulty** — four buttons and the picked tier's note. Difficulty *is* the budget: same
  tower, same crowd, less money and less forgiveness. **Changing it starts a fresh month**, and
  the footer says so.
- **The four tests** (§8.6), each with its target, what it was last time, a tick or cross, and
  its tension sentence, then the conflict paragraph.
- **The month grid** — four weeks × five days: cleared ✓, missed ×, today `NOW`, works ⚒, and
  `+` on every day a pending booking could start.
- **The purse** — on hand, then the ledger: carried in from earlier months, earned this one,
  committed, nights of works running, and what tomorrow pays if today clears. Two notes: the
  purse belongs to this building alone and carries into next month; kit belongs to the building,
  so a contract you lose takes it with it.
- **The shop** — six categories in tiers (§8.4).
- **Terms** — days cleared so far, days left, missed days allowed, and the standing condition.

### 8.4 The shop, and booking works

Buying is two steps, and the second step is the interesting one.

1. Press a tier. If it needs no nights it is fitted immediately and works tomorrow.
2. If it needs nights, the tier goes into a **booking** and the month grid lights every legal
   start day with `+`. The prompt reads: *Pick the night Faster machines goes in. 2 nights of
   works, and a car is out for the peak on each of those days.* Pick a day and the works are
   scheduled; cancel and nothing is spent.

Rules: a booking may not run past the end of the contract; it may not overlap existing works;
money leaves the purse when it is **booked**, not when it goes live; and the kit is only live
once its nights are behind it. Until then the tier reads
`works day 12–13 · live on day 14`.

Every tier shows its own derived state: `in the building` · `booked` ·
`needs level 2 first` · `need 9 more` · `ready on day 11 · 10 days of benefit` ·
`works run past the contract`.

**The shaft is the signature decision.** 34 units and eight nights. Buy it in week two and you
hand back two cars for eight days you still have to clear, in exchange for a fortnight of a
building that finally works. Buy it in week four and you have paid for something you never get
to use. The alternative — four cheap permanent things — will out-perform it this month and
leave the building exactly as short as it was. Both are correct answers to different questions.
**Never resolve this for the player.**

Booked machine and door work also pushes the failure odds down; the desk shows the odds now
and the odds after, with the reason.

### 8.5 Running a campaign day

`Lock it in and run day N` (contract) or `Run the day and decide as it goes` (desk) enters the
stage with `ctx: 'campaign'`. During the run:

- The dock shows the money and the open incident.
- Answering is live and optional. Nothing changes until you answer; the day carries on without
  one; the answer is stamped with the time.
- An option you cannot afford is not selectable in the dock either. The dock and the desk read
  the same purse.
- Works scheduled for today take a car out for the whole peak, and the stage draws that shaft
  dashed like any other outage.

`Close the day` evaluates the four tests and marks the day cleared or missed. A missed day
increments the building's `missed`, costs three standing, and moves it closer to the end of the
contract.

### 8.6 Four tests a day, in tension

A day is cleared only if **all four** hold:

1. *N* in every hundred away inside a minute — rewards sending a car the instant anyone presses.
2. Nobody waits longer than *N* seconds — the one that fails when you optimise the average.
3. The lobby queue never passes *N* — wants a car parked downstairs, which is the car the upper
   floors were waiting for.
4. No more than *N* trips on the machines — a wear budget; punishes half-empty cars running up
   and down to look responsive.

| Tier | Purse | Rate per cleared day (wk 1–4) | Missed days allowed | Away | Worst wait | Queue cap | Trip budget |
|---|---|---|---|---|---|---|---|
| Easy | 16 | 6 / 7 / 8 / 9 | 6 | 65% | 240 s | 40 | 620 |
| Standard | 8 | 3 / 4 / 5 / 6 | 3 | 75% | 180 s | 25 | 520 |
| Hard | 5 | 2 / 3 / 4 / 5 | 1 | 82% | 150 s | 18 | 470 |
| Impossible | 3 | 2 / 2 / 3 / 3 | 0 | 88% | 120 s | 12 | 430 |

A perfect standard month pays **98 units**. The shop is worth **324**.

Tests 3 and 4 cannot both be satisfied by driving harder. That is the day's actual puzzle, and
the screen says so: *the only things that move both are grouping people by destination, bigger
cars, and starting the crowd later.*

The "was" figures beside each test are **last night's actual result for this building**, not a
constant. If there is no previous day, they read `—`.

### 8.7 The rolling career

Contracts are twenty working days each, starting whenever they start. The calendar is a
**thirty-column window that slides to keep today near the right edge** — one row per building,
blanks where the building was not yours or the contract has finished, marks for cleared ✓,
missed ×, today ▢, decision due !, works ⚒, and a flagged bad event ⚑. Never widen the grid to
fit a long career; window it. Emit the column count from the same value as the cells or they
drift; this cost a full defect cycle.

Every cell's tooltip names the building, its own contract day (`its day 14 of 20`) and any
event on it. A building's contract start is derived from today minus its day, so the rows
stagger naturally.

**Standing** = 2 per cleared day − 3 per missed day, plus carry from finished contracts.
Slots open at **0 / 14 / 30 / 60 / 110 / 180**.

**Growth is bounded by the building.** Tenants arriving is occupancy rising against the
building's design capacity, never a free-running counter: a 120-person building cannot reach 370
people, and a building at 100% let grows no further until floor area changes. Every `N of M`
counter derives both numbers from one expression, so `4/1` cannot happen.

**Buildings age in trips, not days.** A service window falls due at ~45,000 trips; a busy
tower reaches it in weeks. At ~85% of refit life the building starts failing inspections and
wants a **refurbishment** — 46 units and ten nights, which resets the wear clock. This is what
keeps a long-held, solved building interesting: it becomes a capital decision again.

### 8.8 Offers, and the gate on ambition

Offers are per snapshot, exclude buildings you already hold, and the caption counts what is
actually rendered.

An offer is takeable only when **a slot is free** *and* **nothing you hold is one miss from
ending**. Otherwise the button reads `Not yet` and the card states which of the two is
blocking: *No free slot — 12 more standing opens the next one* / *A tower is one miss from
ending. Fix that before adding another.* Ambition is gated by competence, not by time.

### 8.9 Renewals are performance-priced offers

The rate is the building's complexity (1–5) plus what your record earned: 100% of days cleared
moves it +2, ≥90% +1, ≥75% nothing, below that −1; the floor is 2 u. Garden Apartments goes
3 → 5 u a day after a clean month. The desk states the offer, the record and the reasoning:
*94% of days cleared · complexity 3 of 5. A harder building pays more because it will cost you
more days; a record like yours moves the rate by +1.*

Options: sign at their rate, ask for one more unit (risking the contract), renew *and
refurbish*, or hand it back and free the slot.

### 8.10 Losing

A contract is lost by exceeding the difficulty's missed-day allowance. Three lost contracts
and the agency stops calling. Better players hold more buildings for longer and are offered
worse buildings at better rates — the reward for competence is a harder problem, not an easier
one.

### 8.11 Set and forget, and why it works

The supervisor fantasy only survives if **doing nothing is a legitimate strategy most days**.

- A building with a good record and recent service should go quiet for stretches. Silence is
  the reward.
- Incidents arrive from the building, not from performance. A tower you have never mismanaged
  can still hand you a bad week — which is why a spare slot is worth more than a spare unit.
- Every incident has a **default** ("leave it to maintenance") with a stated, survivable
  consequence. Ignoring it is a choice, not a failure to find a button.
- Deadlines are days, not seconds. Nothing expires while you are looking at another building.

### 8.12 The three career snapshots

Authored states, selected by the single `careerStage` control, so progression can be *read*
rather than described. Keep them in the real build as fixtures; they are the best regression
test the campaign has.

| | Week one | Second month | Fifth month |
|---|---|---|---|
| Career day | 4 | 24 | 96 |
| Buildings | 1 | 3 | 6 |
| Standing | 6 | 34 | 229 (148 carried) |
| Contracts lost | 0 | 1 | 2 of 3 |
| The decision on the table | book a routine service window | a red-tagged lift, coaches booked, a renewal due | a theatre list moved into the shift change, a window falling due in wedding season |
| Offered | Chancery House, 4 u | St Jude 9 u, Ashgate 6 u | Vertical City 14 u, Northgate 4 u |

The arc: one forgiving building and a trivial choice → three buildings where something is
always wrong → six buildings, a refurbished veteran, a hospital that will end your run, and a
101-floor tower nobody else will take.

---

## 9. Mode 3 — Endless rush

One familiar tower. Arrivals climb ~11% every three minutes, forever.

### 9.1 Setup (`rush`)

- Three facts: your furthest wave and the dispatcher that got there, how long that held, and
  `+11% more arrivals every wave, forever`.
- **The ramp in plain bands**, each with a proportional bar: *waves 1–4 a normal day · 5–8 a
  busy Monday · 9–12 above design · 13–16 unreasonable · wave 17+ absurd, nobody holds this;
  the question is how gracefully you lose.*
- **How far anyone has held** — five entries including two reference runs, labelled as
  reference runs.
- Note: *Nothing to set up. It ends when it ends.*

### 9.2 The run

Same stage, `rush` context. The clock shows **held time**, not the hour. The phase pill shows
the wave. There is no timeline and no brief.

**The run ends when forty people have been standing over two minutes at once** — the point a
real building starts getting phone calls, and the same line for everybody. The waves are
pre-generated from one seed (90210), so two dispatchers face identical climbs.

The player may also stop it by hand with `End the rush`.

### 9.3 The result (`report` + `rush`)

**Its result screen is its own.** A rush has no noon, no shaft returning at midday, no
afternoon, so it must never fall through to the daily report. And it must branch on whether
the hold line was actually crossed:

| | Broke | Stopped by hand |
|---|---|---|
| head | `Wave 14 is where it stopped draining` / `Held to wave 17, which is further than most` | `You stopped at wave 9, still holding` |
| lede | how long it held before forty people were over two minutes, and what arrivals were by then | says plainly that this run **does not have a breaking point to report** |
| account | three beats: comfortable → the queue stopped emptying between cars → forty people over two minutes | two beats, the second naming the queue depth against the limit and saying where it breaks *is not yet known* |
| footer | *Waves are identical for everyone, generated once from seed 90210.* | *Ended by hand at wave 9 — not posted, because a stopped run has no breaking point.* |

Four figures either way: furthest wave, how long you held, people carried, longest anybody
waited (with *the run ends at 120 s × 40 people* as its note).

---

## 10. Mode 4 — Fix a building

A tower with exactly one thing wrong and a tenant who has written in. The cause is stated; the
decision is what to do about it.

**There is no guess-the-fault quiz.** An earlier draft asked the player to pick the cause from
three candidates before repairing. It was cut: it gated the interesting decision (what to
spend) behind a comprehension test, and the refutations read as a lesson rather than a game.
The case now opens with **the diagnosis** printed plainly, and the play is the reconfiguration.
The three candidate causes survive in the data only as the source of the diagnosis line and its
reasoning; the refutations of the two wrong ones are no longer shown, and no state tracks a
guess.

### 10.1 Layout

Left rail (288 px): the case list, each row name + tower + `OPEN`/`FIXED`, the open one inked,
with `4/18 fixed` above it.

Main column, in order:

1. **The complaint in the tenant's words**, attributed (*tenant, floor 62*).
2. **The building as it stands** — bands from the case's schematic, the failing one flagged in
   terracotta with its symptom printed on it, and the line *the fault is in how it is
   configured, not in what it is made of*.
3. **Four figures** — one bad, one or two mid, one healthy, so the reader can see that
   everything else is fine.
4. **The diagnosis**, stated plainly, with its reasoning underneath.
5. **Quick repairs** — the case's four, plus the five standing extras, as toggles.
6. **The full building editor** (§10.3), collapsed by default.
7. **The result** once run (§10.4).

### 10.2 The repair budget

Each case carries **10–16 units**, priced deliberately against the campaign shop so the same
values mean the same things. The diagnosed fix is free or nearly so (it is a configuration
change); useful-but-wrong purchases sit inside budget; and a new shaft is listed at its real
**34 units**, permanently out of reach and labelled `beyond a repair budget`. A player must be
able to see why more shafts is not the answer, which means the option has to be visible and
unaffordable rather than absent. Anything that would take you over budget cannot be selected.

**Nothing labels itself.** The repair list does not mark which option is the diagnosed one, and
the diagnosis panel does not name a purchase. The player connects the two. Alongside each
case's four repairs, five **standing extras** are offered in every case — traffic survey 3 u,
landing indicators 4 u, car interiors 5 u, call-out cover 6 u, tenant notices 1 u. All
defensible, none of them a fix. They exist so the budget can be spent badly.

### 10.3 The full building editor

Exposes the building as an engineer sees it, loaded from the case's as-built specification.

- **The elevation grid** — one row per floor band (bands never straddle a zone boundary), one
  column per shaft. A solid cell means the shaft opens there; a dashed cell means it passes
  without stopping; empty means it does not serve that band. **Click any cell to change it**,
  which switches that shaft's zone select to `drawn by hand`. The failing floor's symptom is
  printed on its row.
- **Zones** — add, rename, set from/to. Removing a zone returns its shafts to the whole
  building. Editing a zone clears hand-drawn overrides, because the two would otherwise
  disagree.
- **Shafts** — per shaft: zone (or *the whole building* / *drawn by hand*), a `local`/`shuttle`
  toggle, where it calls when it is not in its zone (*calls at the lobby* / *calls at floor 35*
  / *no terminal*), and duty (*carries anything* / *goods and trolleys only* / *beds and
  stretchers* / *out of service*). Each row prints in words what it serves and what it passes.
- **Add a shaft · 34 u** — present in every case, disabled when the budget cannot take it,
  with the tooltip *A repair budget does not buy a shaft. That is a capital conversation with
  the owner.*
- **Machinery, priced against the same budget** — rated speed at 6 u per half a metre per
  second, car capacity at 8 u per two places, both capped live at what the remaining budget
  allows and labelled `at the budget` when they are. **Door dwell is free — configuration.**
- **Where cars wait when idle** — all at the lobby / spread through the tower / one per zone /
  one held at the top.
- **Who drives** — the standing order, any stock style for nothing but the visit, or one of
  your own saved dispatchers for **3 u of commissioning**.
- A running total: `11 of 14 u committed`, what of it is steel, and one of three notes —
  everything you changed is a setting and settings are free / you are buying machinery, compare
  it against the free change first / over the budget, and this is where the owner stops reading
  and asks what you can do without buying anything.
- `Reset` appears once anything differs from as-built.

This is where the lesson that used to live in the quiz now lives: you can try buying your way
out and watch the budget refuse.

### 10.4 Running it, and the four outcomes

The primary is **`Run the day`** — not gated on anything. It re-runs the same crowd with
everything you have changed and scores the whole building on three rows:

| Row | Passes when |
|---|---|
| **The complaint** — how much of it went away | ≥ 80% |
| **The rest of the building** — away in a minute, before → after | did not fall by more than 2 points |
| **Spent** — of the case's budget, and how much of it was machinery | within budget |

All three must hold. Outcomes:

- **All three** — the case's authored result head and body, the three-row before/after (one row
  may get slightly worse; trade-offs are the point), and the case is marked FIXED. Primary
  becomes `Next building`, the bar's emphasis inverts to the way out.
- **Complaint fixed, building worse** — *The complaint is gone, and somebody else is paying for
  it.* … *Everyone else waits longer than they did this morning, which is a second letter you
  have not received yet.*
- **Over budget** — *Over the budget, and the owner has said no.* … *This is a repair budget.
  What you have specified is a capital project, and the owner will want a business case rather
  than a work order.*
- **Not enough** — *Better, and the complaint still stands.* … *Change something else and run
  it again.*

The before/after is labelled *one run before, one run after — enough to see a repair this size;
not enough to split hairs.* A failed run leaves everything selected so the player can adjust
rather than restart; `Run it again` re-runs.

### 10.5 The eighteen cases in the prototype

Each line is: **name** — building — the true cause → the diagnosed fix (cost).

1. **The sleeping sky lobby** — Vertical City, 101 fl — six of eight shuttles park at the ground
   floor, so the sky-lobby queue waits for cars that have gone home → park two shuttles at 35 (free).
2. **Zoning that starves the top** — Midtown Office, 32 fl — zones split by floor count, not
   headcount → redraw by population (6 u).
3. **The doors that never close** — Crown Hotel, 18 fl — 11 s dwell set for trolleys that arrive
   twice an hour → dwell that reacts to what is boarding (2 u).
4. **Three cars, one car's work** — Garden Apartments, 9 fl — nearest-car with no spreading term,
   so all three bunch → push idle cars apart (free).
5. **The cars that always go home** — Fenwick Chambers, 12 fl — lobby homing left on all day, so
   every afternoon down call starts from the ground → stop homing after the morning peak (free).
6. **The car park nobody serves** — Ashgate Mixed-Use, 22 fl — one of five cars reaches B1–B2,
   which a third of the building arrives through → extend a second car's service range (9 u).
7. **The express that stops everywhere** — Calder Tower, 26 fl — the express's service range was
   never restricted after commissioning → blank the low-zone landings (free).
8. **Deliveries on the passenger group** — Northgate Retail, 6 fl — 31 goods movements land inside
   the passenger peak → a delivery window in the tenancy agreement (1 u).
9. **One start time for eleven hundred** — Harbour Point, 16 fl — demand arrives faster than any
   six-car group can clear → stagger the shifts (2 u). *The case where the crowd, not the kit, is wrong.*
10. **Six minutes between classes** — Elmsworth College, 10 fl — every room changes on the hour,
    six times a day → offset half the timetable by ten minutes (2 u).
11. **Everyone leaves at once** — Weald Conference Centre, 12 fl — the group treats a down peak
    like an ordinary day → down-priority for the last hour (free).
12. **The bed lift that answers landings** — St Jude Hospital, 11 fl — a bed move collects every
    call en route → a porter key that clears the car (5 u).
13. **Two cars out in the wrong month** — Ravensbourne House, 20 fl — the refit is right, the
    timing is wrong → reschedule to August, one car at a time (4 u).
14. **Half of every double deck is empty** — Meridian Plaza, 44 fl — the lobby does not split the
    crowd by floor parity → odd floors to the upper deck (6 u).
15. **The restaurant above the offices** — Sable Court, 30 fl — two opposite flows in the same
    thirty minutes → dedicate one car to 1↔30 from 17:30 (3 u).
16. **A controller that forgot the down calls** — Lansdowne Mansions, 15 fl — down-collective was
    never enabled on the 1998 controller → switch it on (2 u).
17. **Let faster than the lifts can carry** — Bellhaven Works, 18 fl — population up 61% against an
    unchanged group → panels and lobby zoning buy a third, then it is a capital conversation (14 u).
    *The deliberate exception: the case where the honest answer is "you need another car, eventually".*
18. **The gym on the top floor at seven** — Quayside Residences, 22 fl — gym crowd up against the
    commute down → park one car at 22 from 06:15 (free).

### 10.6 The catalogue — specified, not mocked

Written to the same data shape; authoring one is content work, not engineering. Each needs:
complaint + complainer, four figures, the diagnosis and its reasoning, four repairs with costs,
an as-built specification, and a three-row before/after.

**Configuration left wrong** — *The park that never moved* (a car parked at a floor that stopped
being busy two lettings ago) · *Two groups, one building* (two banks commissioned separately,
each unaware of the other's calls) · *The floor that was locked out* (a service-range exclusion
left after a refurbishment) · *The nudge that became a shove* (an over-tuned spreading term;
cars now avoid the lobby) · *Both directions answered at once* (a hall call registering up and
down, so every car stops twice).

**Doors, loading, dwell** — *The photocell that sees the queue* · *The pram floor* (one landing
where boarding takes three times as long as the dwell allows) · *Full cars that stop anyway* (no
load-weighing bypass) · *The polite hold* (a hold-door button used as a courtesy every trip).

**Traffic shape and tenancy** — *The canteen at half twelve* · *Shift change at a factory* (100%
of the population reverses direction in four minutes) · *The trading floor* (a 07:10 peak two
hours before the rest of the building) · *Half the building on Fridays* (the fix must not cost
the other four days) · *School run in a residential block* · *The serviced-office floor*
(visitors who press everything).

**Zoning and structure** — *The mezzanine that counts as a floor* · *The sky lobby with no down
provision* · *Basement to roof in one car* · *Zone boundary through one tenant*.

**Machines and maintenance** — *The car that fails safe, slowly* · *Levelling that misses by
40 mm* · *The lift on a call-out contract* (mean time to repair, not group size, is the problem)
· *Annual service in the peak week*.

**Human and operational** — *The goods porter with a key* · *The concierge who calls cars ahead*
· *The evacuation drill that never ended*.

**Authoring rules for any new case**

1. Exactly one thing is wrong. Everything else in the figures must read as healthy, and be seen to.
2. The diagnosed fix costs 0–9 units. A new shaft appears at 34 units in every case, always visible
   and never affordable.
3. Of the four repairs, one is the diagnosed fix, one is *plausible and expensive* (the thing a
   real client would buy), one is *plausible and cheap* (the thing a keen player tries first),
   and one is the new shaft at 34 u.
4. Each repair's one-line effect cites a number that is on screen.
5. The before/after is three rows and one of them may get slightly worse.
6. The diagnosed fix must move the complaint by ≥ 80% on its own, and must not cost the rest of
   the building more than two points. Check this against a real run before shipping the case.

---

## 11. The dispatcher workshop

The headline draw. A Casual player can reach the full weight vector; they simply are not shown
it first. Six layers, disclosed in this order, in one scrolling column with a fixed left panel.

### 11.1 The left panel

- `START FROM A STYLE` — six cards: dot, name, one-line summary.
- `YOURS` — saved dispatchers, dashed, tagged `OPEN`/`SAVED`.
- **The nameplate.** Before anything is changed, a dashed panel: *Steady hand, unchanged —
  move a lever or add a rule and this becomes a dispatcher of your own, with a name you
  choose.* After a change: a name field, and four derived rows — started from, levers moved
  *n* of 4, rules *n*, and **proved on the bench**, which reads `not since your last change`
  while dirty.
- **Save** offers overwrite / save as a copy / cancel, and overwriting states what it costs:
  *That dispatcher has been run on the bench. Overwriting it replaces those results, and any
  board entry keeps the version it was posted with.* Save-as-copy auto-versions (`Patience v2`).
- *What this will feel like* — one plain sentence about the trade, not a claim of quality.
- `THREE DIFFERENT THINGS` — the three verbs (§11.5).

### 11.2 Layer 1 — named play styles

Six, each carrying a plain description of the *trade* it makes: **Steady hand** (the honest
baseline), **Lobby anchor**, **Chase the longest wait**, **Fill them up**, **Spread out**,
**Ask where they are going**. Selecting one resets the working copy to that style and clears
`dirty`.

### 11.3 Layer 2 — the tinker drawer

Four plain-language levers, each naming its ends and its effect:

| Lever | Reads | Ends |
|---|---|---|
| How long anyone should wait | chases the longest wait first | let it slide → nobody waits |
| Keep a car downstairs | holds a car at the lobby | never → always one |
| Spread the cars out | pushes cars apart across the tower | huddle → cover everything |
| How much room to leave in a car | stops sending pickups to a crowded car | cram them in → leave room |

A *show me the maths* disclosure prints the compiled cost line and explains what cost **is**:
each car is scored for answering a call, the lowest score wins, and it is a way of choosing
between cars — not a measure of the day. It also explains the signs: distance and a full car
push a score up; a long wait pushes it down.

### 11.4 Layers 3–5 — the engineer's controls, in Casual words

- **What it is optimising** — the thirteen cost terms. Four are shown by default (wait time,
  direction reversal, load factor, starvation); *show every term* reveals the rest. Each is a
  0–100 slider labelled with what it serves and both of its ends. A weighted term is inked, an
  unweighted one is grey. A `reset` returns to the style's own vector. The header counts what
  is weighted: *the 13 cost terms — 4 weighted*.
- **How it behaves** — two toggles: *Pool riders by destination* (fewer stops per trip, a longer
  wait in the lobby) and *Read the load sensor* (a car over 80% full is no longer offered new
  calls). Then `GROUP LEVERS — APPLY TO WHOEVER IS DRIVING`: *Park the cars in the lobby before
  the rush.* The header states the boundary plainly: **zoning and service ranges belong to the
  building, not the dispatcher — they live in Design a building.**
- **Traffic-pattern switching** — the one thing that can change mid-shift. Three modes: *One
  setting, all shift* · *Watch the traffic and change* · *Watch the traffic, with your tuning*.
  Six detector parameters (how long to stick with a decision, how long a window to judge on,
  the weight given to lobby arrivals / floor-to-floor trips / people heading down, and how much
  better a new pattern must look). Then five pattern cards — up-peak, down-peak, two-way,
  interfloor, idle — each with what it is, **how it is detected**, and a select binding it to
  whichever dispatcher runs while it holds. Under *one setting all shift* the whole block is
  visibly inert and says so: *Inert while one setting runs all shift: the dispatcher holds a
  single weight vector and never builds the detector.*

### 11.5 Layer 6 — Advanced: write your own rules

When/then rows, read top to bottom, first match wins. Nine conditions and ten actions:

| When | Values | Moves |
|---|---|---|
| a call has waited *v* | 30 s / 45 s / 60 s / 90 s / 2 min | patience |
| the lobby queue passes *v* | 6 / 12 / 20 / 30 / 50 people | lobby |
| a car is fuller than *v* | 50–90% | room |
| the time is before *v* | 08:00 / 09:00 / 09:30 / 10:00 / noon | patience |
| the time is after *v* | noon / 15:00 / 16:30 / 17:30 | lobby |
| the day is in *v* | the morning rush / the lunch hour / the evening / a quiet stretch | patience |
| a shaft is out of service | — | spread |
| calls are stacking above *v* | floor 4 / 6 / 8 / 10 | spread |
| nobody is waiting below *v* | floor 3 / 5 / 7 | spread |

| Then | Values | Moves |
|---|---|---|
| send the nearest free car | — | distance ↑ |
| send the emptiest car | — | room ↑ |
| let it jump the queue | — | patience ↑ |
| hold *v* at the lobby | one car / two cars | lobby anchor ↑ |
| park a spare car at *v* | the lobby / floor 5 / 7 / 9 / the top floor | spread ↑ |
| stop giving it new pickups | — | room ↑ |
| treat up-calls as urgent | — | patience ↑ |
| spread the other cars across the tower | — | spread ↑ |
| prefer a car already going that way | — | distance ↑ |
| skip everything above *v* | floor 7 / 9 / 11 | spread ↓ |

Every row shows **the lever it moves** and a plain readback (*Reads as: when the lobby queue
passes 12 people, hold one car at the lobby.*), so the two views can never disagree. Rows can
be reordered and deleted. A fallback line states who decides when no rule fits:
*If no rule fits, Steady hand decides.*

Value-carrying phrases are **templates with a placeholder** (`hold {v} at the lobby`, `park a
spare car at {v}`), never text + value concatenation — otherwise you get "park a spare car at
floor the lobby".

### 11.6 The report handoff

Arriving from a report lever, an amber banner sits above everything: `FROM THE FRIDAY REPORT`,
the lever's name, why it is suggested, and **Apply it** (which becomes `Applied` in moss).
Below it, a replay strip: *Replay Friday with this* **against** a select — *your previous run* /
*the world's middle* / *your previous run, world band behind* — a note (*Same building, same
crowd, same seed — only your change differs.*), and **Replay the same crowd ›**.

Applying stores the run you are trying to beat as the ghost's weights, so the replay's grey
line is genuinely your old day and the strip's band note says so.

### 11.7 Three verbs, and they are not the same thing

This confusion is the most likely thing to be got wrong. Name them on screen, in this order:

| Verb | What it is | Scored? |
|---|---|---|
| **Play today's day with it** | One watched run on today's tower | Yes — the daily board |
| **Send it through the gauntlet** | Forty fixed proof cases: 8 towers × 5 crowds | Yes — a standing rating on the ladder |
| **Compare it on the bench** | Two to four dispatchers, *N* matched crowds, a plain answer | **No.** Posts nothing, scores nothing |

Two boards, answering different questions. The **daily board** asks who had the best Friday and
resets tomorrow. The **dispatcher ladder** asks whose dispatcher holds up everywhere, moves
slowly, and shows *rating · proof cases · weakest at*. Editing a dispatcher makes its ladder
entry read **edited since** until the gauntlet runs again — the old rating belongs to the old
dispatcher.

The gauntlet has **no screen of its own**: pressing it runs the forty cases with progress in
place and lands on the ladder. A dispatcher must be saved before it can be sent.

---

## 12. The test bench

Nothing here is posted and nothing here is scored. It is the instrument that makes the boards
honest, and it is allowed to shrug.

### 12.1 Setting up a comparison

- **The field** — a list of every stock style, everything you have saved, and anything on the
  ladder. **Two at least, four at most**; the field note says so, and the toggles enforce it.
- **The tests** — eight authored shapes, ticked independently, because a dispatcher that wins
  one can lose another:

| Test | Building | Crowd | What it tests |
|---|---|---|---|
| The morning intake | Chancery House · 14 fl · 3 lifts | up-peak, 1,180 people in forty minutes | filling cars and getting back down |
| The evening exodus | Midtown Office · 32 fl · 8 lifts | down-peak, every floor calling at once | stopping answering up calls in time |
| Lunch, both directions | Ashgate · 22 fl · 5 lifts | two-way, offices over shops | serving opposite flows at once |
| A coach at eleven | Crown Hotel · 18 fl · 4 lifts | forty people and luggage, unannounced | reacting to an unpredictable surge |
| Beds and a theatre list | St Jude · 11 fl · 6 lifts | interfloor all day, two shift changes | priority traffic surviving ordinary traffic |
| A lift out of service | Chancery House · 2 of 3 lifts | an ordinary Tuesday, short a car | how gracefully it degrades |
| A quiet afternoon | Garden Apartments · 9 fl · 3 lifts | sparse, nobody in a hurry | whether idle cars end up anywhere useful |
| Sky lobby transfer | Vertical City · 101 fl · 8 shuttles | transfer crowd at 35, all morning | parking where the crowd actually is |

- **Days per dispatcher, per test** — 10 / 30 / 50 / 200, with the honest note that below thirty
  the bench can rarely tell anything apart, and a live count of the work:
  *3 tests · 450 days of simulation.*
- `Run the suite` / `Run the suite again`. With no test ticked the run is disabled and the note
  says *No tests ticked. Pick at least one.*

### 12.2 Reading the result

- **A matrix**: one row per ticked test, one column per entrant, each cell showing away-inside-a-
  minute large and the worst wait small. The best cell in each row is moss and bolder. Header:
  *away in a minute, and the longest anybody stood · green is the best in that test.*
- **A card per entrant**: name, where it came from, three figures (average away, worst wait
  across the suite, tests won), and a bar per test.
- **When the field is exactly two**, the pairwise verdict appears beneath: the interval drawn as
  a bar against a zero line, the range in words (*between −1.4 and +3.1 points · zero is
  inside*), and a plain paragraph — *Across 50 matched crowds your dispatcher was better on 28
  of them, and the average gain was under a point. That is small enough that the crowd, not the
  dispatcher, could explain it. The bench will not call this a win.*
- **The verdict is allowed to be `Too close to call`**, and with three or four entrants the
  bench reports the disagreement between tests rather than crowning a winner.

Three standing notes, always present:

1. *The same crowds for everyone* — every dispatcher in the field meets the identical arrivals
   in each test, so the crowd cancels out and only the decisions differ.
2. *Sometimes the answer is a shrug* — a field can be genuinely hard to separate. When the tests
   disagree the bench shows you that rather than crowning a winner, and you have saved yourself
   a week of chasing a difference that was never there.
3. *Only benched dispatchers reach the board* — a dispatcher you have never run here can still
   play any day you like; it just cannot be posted until the bench has seen it work.

**Never present a two-run subtraction as a comparison.**

---

## 13. Design a building

The engineer's surface in Casual clothing. Nothing here is scored; it is a drawing board. It
exists because half the lessons in Fix a building are about the building, and a player who has
understood them wants to draw one.

### 13.1 The header and the four figures

Name field, `Save as a new building`, `blank tower`, and four figures that update live:
**Population** (floors × design capacity × let share), **Rise** (m), **Interval** (s, with the
round trip and car count as its note), **Handling capacity** (% of the population in five
minutes).

A warning card appears under them when the design is not buildable or not comfortable:

- the chosen machine class is not built past its floor or rise limit, naming both numbers;
- handling capacity below 11% — *an office building will feel slow every morning*;
- an interval over forty seconds — *reads as a long wait, whatever the average says*.

### 13.2 The elevation

One row per floor band, top to bottom, inside a scroll box. Per row: the floor label, a
**transfer-level diamond** (click to make it a sky lobby), an **occupancy slider** (0–120% of
design capacity, over 100 drawn in terracotta), the headcount `28 / 40`, the zone name, an
escalator mark where one serves the landing, one **service cell per shaft** (lettered, tinted
by shaft), and one **credential dot per access group** (● admitted, × not, grey where the floor
is unrestricted).

Under it, a **rating plate** drawn as brushed metal: capacity kg, persons, rated speed, travel,
landings, class. Then the capacity line (*Capacity 800 · occupied 560 (70%) · 28 people on a
typical floor today*) and the round-trip reading — *dominated by stops and door time, not by
speed. A faster machine buys very little.* or *dominated by travel. Speed and rise are what you
are paying for.*

### 13.3 The panels

- **The building** — floors above the lobby (3–120), floors below (0–6, *a car only reaches them
  if you say so*), floor to floor (2.6–5 m), design capacity per floor, occupied share, shafts
  (1–12, *the most expensive thing in the building*), door dwell.
- **Sky lobbies** — seed transfer levels every 10 / 15 / 20 floors or none; the seeded list is
  printed in words; **escalators** as rows (from, to, seconds a landing) because a two-level
  lobby is joined by an escalator, not by a shaft.
- **Machine classes** — five: Hydraulic, MRL gearless, Geared traction, Gearless traction,
  High-speed gearless. Picking one shows its note, its limits (`2.5–7 m/s · up to 45 floors and
  170 m of rise`), and which shafts are driving on it. Rated speed and rated load are steps
  within the class, not free numbers. Five editable characteristics — acceleration, jerk, door
  opening, door closing, levelling — each with both ends in words. Edits are per class and
  `back to standard` reverts them.
- **Zones** — add, rename, from/to.
- **Shafts** — per shaft: zone, `local`/`shuttle`, what it calls at, duty, machine class, and
  the resulting machine printed underneath. Duty picks a sensible default class (a goods lift is
  geared or hydraulic; a high zone is gearless) until you override it.
- **Access** — named groups, each with a floor grid and a set of credential chips, `all`/`none`,
  and a derived line (`floors 1–12 · admits staff, visitors`). A text field adds new credential
  groups. The header states the distinction that matters: **who is allowed on a floor — not
  which car reaches it.**
- **The document** — a collapsed disclosure that prints the design as an engineer would write
  it: floors and rise, population against design capacity, the group, service zoning, transfer
  levels, and the estimated round trip, interval and handling capacity.

Saved buildings can be run as a day or handed to the test bench.

---

## 14. Your week, Today's board, the ladder

**Your week** — seven day cards (weekday, tower, score, note). Today's card shows `—` and
*today · not closed yet* until the day is closed. Below: your percentile line (*better than 64%
of today's players*, or *nothing to place yet — the day is still running*) and the world's
style split, captioned as **share of today's players, not a ranking. A popular style is not a
proven one.**

**Today's board** — one building, one crowd, one day; everybody plays the identical morning;
every posted run is replayed by the server before it appears; it resets tomorrow. Your row
reads `—` and *you · not posted yet* until the day is closed. Reference runs are labelled
`reference run` and shaded differently; they are never presented as players.

**The dispatcher ladder** — a standing rating for a dispatcher, not for a day: rating, proof
cases (`40 of 40`), and *weakest at*. A dirty dispatcher reads `unrated` / `edited since`.
Three notes explain why it is not the daily board, why the bench is neither, and that editing
costs your rating.

Both live on one screen behind two tabs, and the rail has an entry for each.

**Two board rules, and they are structural.**

- **One board a day, and nothing about a player's configuration enters a board key.** One tower,
  one crowd, one seed, everybody. A board keyed by building × dispatcher × traffic template ×
  arrival rate would fragment into thousands of one-entry boards where everyone is permanently
  first and nobody ever meets. Arbitrary configurations are a **personal-record log**, not a
  board.
- **Rows must be comparable.** Every row on the daily board ran the identical crowd; every row
  on the ladder ran the identical forty cases, scored as a mean. Sorting runs that met different
  passengers is a ranking of luck.

**How did they do it.** Every posted run is a dispatcher, and a dispatcher is a first-class
object here. A board row expands to show what it started from, how many levers moved, how many
rules it carries and what it was proved on, and offers **load it into the workshop as a copy** —
so the board is a source of material rather than a wall of strangers.

**Race this run.** A board row can be sent to the ghost picker as a fifth option, beside the
world's middle, your best, the plain baseline and nobody. You do not chase a number; you watch
their line and yours diverge on the same morning, under the same caveat: *one day each on the
same crowd — that is a race, not proof.*

**Say that the scores are verified.** Every posted run is replayed by the server before it
appears, and a forged submission is refused. Almost no competitive game can make that claim;
the board should make it in one line rather than hiding it.

---

## 14.1 Watching somebody else's run

A board row is a run, and a run can be watched. Pressing `Watch it` replays that player's
posted day on the stage from the server's record.

**It must not look like your own run.** A spectator who cannot tell whose day they are looking
at will read the figures as their own and the whole board becomes untrustworthy. The
differentiation is structural, not a caption:

| | Your run | A watched run |
|---|---|---|
| header | paper (`#FBF7EF`), light | **ink (`#23201C`), inverted** — the single strongest signal |
| identity | `DRIVING` + the dispatcher's dot and name | avatar disc with their initial, **their name at 19 px**, `#2 on today's board`, and `THEIR DISPATCHER` beside it |
| figures | three live figures (yours, now) | **their posted result** — `86% they posted, away in a minute` and `94 s their longest wait` — so the replay is read against what it achieved |
| canvas | nothing | a pill, top left: `REPLAY · <name> · VERIFIED BY THE SERVER` |
| race strip | `you` vs the ghost, with a verdict | **their name** vs the world's middle, and **no verdict** — you are not in this comparison |
| eyebrow | `YOU VS THE WORLD'S MIDDLE` | `<NAME> VS THE WORLD'S MIDDLE` |
| rail subline | `MID-DAY · 08:41` | `WATCHING · <NAME>` |
| action bar | four-step timeline, `Close the day` | **no timeline, no back**, `⤺ Stop watching` and `Play this crowd yourself` |

Rules:

- **No first-person copy anywhere in the mode.** Not `you`, not `your run`, not `your best`.
  The word `you` on a watched run is a defect.
- **A watched run cannot be closed, scored or posted.** There is no `Close the day`; the day
  belongs to somebody else and is already closed. `dayClosed` is untouched, and so is your own
  day's state — stopping the watch returns you exactly where you were.
- **Playback controls stay.** Pause and the five speeds are how you inspect a run; they are not
  interventions, and §7.6's intervention machinery is **disabled** while watching. A spectator
  who could intervene would be playing, not watching.
- **A reference run says so.** Where a player's rank would be, a baseline reads
  `reference run · not a player`.
- **Your own row cannot be watched.** Its button reads `your run` and does nothing; replaying
  your own day is the report's job.
- **The primary is the conversion.** `Play this crowd yourself` drops the spectator state and
  opens the brief for the same day, which is the whole reason watching exists.

## 14.2 Telling the two boards apart

They answer different questions (§11.7) and must not be distinguishable only by their titles.
The presentation carries it:

- **The tabs are two cards, not two pills.** Each states its nature in an eyebrow rather than a
  sentence: `ONE CROWD · RESETS TOMORROW` against `STANDING · 8 BUILDINGS × 5 CROWDS`. The daily
  board takes a terracotta dot (a day, a moment); the ladder takes a moss square (a standing
  rating). Selected is filled ink, unselected is outline.
- **The tables differ in weight.** The daily board's header band is sand on paper — a light,
  perishable thing. The ladder's is **ink**, with the rating column keyed moss: a plate, not a
  notice.
- **`What are the forty?`** — a disclosure beside the ladder, because a rating means nothing
  until you know what it was measured on. Open, it names all eight buildings with their spec and
  why each is in the set, all five crowd shapes with what each tests, and closes with the
  arithmetic: eight × five = forty runs, a rating is the mean of all forty, the cases never move
  so two ratings a month apart are still comparable, and a dispatcher that wins one shape and
  loses four sits mid-table. The eight buildings and five shapes are the **same fixtures the
  bench uses** (§12.1) — one set of proof cases, not two.

## 15. Main menu

Left: the question *What are you playing today?*, one paragraph on what the four modes share,
and **four mode cards** — name, session length, one sentence, and a live state line (*ready ·
counts on the board* / *3 buildings · standing 34* / *your furthest · wave 14* / *4 of 18
fixed*). Selecting a card only selects it; the bar's primary plays it.

**The menu holds nothing but the choice.** It is one column: the question, the paragraph, the
four cards, and the footer line — *Everything here is the same simulator the engineers use.
Nothing in Everyday mode is a simplified model — only a plainer way of asking it questions.* The
account block and the settings panel that used to sit on the right have moved to §15.1; a
settings tray on the first screen of the game asks a new player to configure before they have
anything to configure.

### 15.1 Settings (`settings`)

One screen off the rail, three sections. The lede states the stake: *Your name and picture
travel with every run you post, so somebody watching your Friday sees them. Everything else here
only changes how the game looks and sounds to you.*

**You** — the avatar (their initial on a coloured disc, six curated colours: sun, terracotta,
moss, sky, ochre, slate), a **display name** field, and the note that says where the name shows
up: *the daily board, the ladder, and any run somebody else watches*. Then the signed-in line
and **Sign out**. The name and colour are the same two values the board rows and the spectator
header read (§14.1), so a change here is visible on every surface immediately. **No image
upload** — an uploaded avatar is a moderation surface and a storage problem, and an initial on a
colour reads better at 22 px anyway.

**Playing** — the five existing rows, unchanged in behaviour: Motion, Sound, Default speed,
Units, *Post runs to the board*.

**This device** — two statements of fact and two actions: where progress lives (locally; signing
in elsewhere starts a separate career), **replay verification** (always on, cannot be turned
off, and the reason the boards are worth reading), **Clear saved progress** (destructive, states
exactly what goes and that boards keep what you already posted), and **Switch to Engineer**.

Two notes for the build:

- `Sound` has nothing behind it in the prototype. Either give it doors, chimes and lobby murmur,
  or remove the row (§20.12) — a toggle that toggles nothing is a lie in a settings panel.
- Settings never appears as a modal or a tray. It is a screen, it is in the rail, and it is
  reachable from anywhere without abandoning a run.

Entering `Fix a building` from here jumps to the **first unsolved case**, not to wherever you
left off.

---

## 16. Interaction rules worth stating

1. **An unfinished thing shows `—`.** Today's card in Your week, your row on the board, your
   percentile: all withheld until the day is closed. `dayClosed` is set by *Close the day*
   alone, never by navigating to the report.
2. **Every claim carries its basis.** "one run before, one run after"; "40 proof cases"; "one
   day each"; "share of today's players, not a ranking".
3. **Temporary is visibly temporary.** Anything set for an incident states what reverts and
   when, and can be reverted by hand.
4. **A button does what it says.** If a row says *Renew*, the destination contains a renewal
   decision. Do not label an affordance for a state you have not built.
5. **Derive, never assert.** `cleared = day − 1 − missed`. Option counts come from the rendered
   list. Statuses come from `missed` vs the difficulty's allowance. Every hardcoded count in the
   prototype eventually contradicted something.
6. **Unaffordable is visible, dimmed and inert** — never hidden, and never silently clickable.
   It always says what it is short by.
7. **A card header wraps rather than shrinking its title.** A flex title keeps intrinsic width;
   the meta pill drops to a second line. Applies to menu mode cards, campaign offer cards, brief
   style cards and shop tier rows.
8. **Reference runs are labelled.** On any board, any ladder, any bench field.
9. **Nothing in the rail changes what is running.** Navigating away from a running day pauses
   nothing and scores nothing; the run is still there when you come back, because `screen`
   and the sim are separate. A navigation that genuinely would discard work states the
   consequence first, in the confirm-strip pattern; resume is always preferred to reset.
10. **A control that cannot act now says so.** Anything that is next-run only carries
    `takes effect on the next run` and the re-run it needs (§7.6).
11. **No engine identifier ever reaches a Casual surface.** Not in copy, not in a tooltip, not
    as a fallback. Every parameter, cost term and hard constraint carries a **player-facing name
    and a one-clause effect declared beside it in `core`**, which Casual reads the way it reads
    the cost terms' own descriptions. A lookup table in the screen mapping ids to friendly prose
    is forbidden: it is `if (id === …)` wearing prose, it goes stale the day a parameter is
    added, and the screen is the wrong owner. The optimizer's description and the player's name
    are **two fields with two readers** — never one string doing both jobs. Anything that has no
    player-facing name yet renders the honest fallback (*a filter no weight can buy past*) and
    is a content bug, not a screen bug.
12. **A formula may only appear where every symbol in it is named on the same screen**, behind a
    disclosure, preceded by the plain sentence, with its signs explained (§11.3).
13. **A disclosure announces its contents, persists, and is never the only route.** A collapsed
    header states what is inside and how much of it (*Advanced: write your own rules — 3 rules*;
    *the 13 cost terms — 4 weighted*), never a bare chevron. Open/closed state is saved per
    player. Everything reachable by opening a drawer is also reachable from the rail or from a
    report lever.
14. **One day record narrates everything.** The wrinkle, the occupancy, the works, the cars out
    of service and the calendar's marks come from one object, and the brief, the stage, the
    report and the calendar all read it. A sim strip saying *vacation week · 70 of 120 people in*
    while the report says *nothing booked* is the same defect class as two disagreeing numbers.
15. **Every screen renders with the API absent.** World figures — yesterday's distribution, both
    histograms, the board, the ladder, the style split — degrade to a labelled *world figures
    unavailable* state. Never a zero, never a spinner, never an empty chart that reads as
    "nobody played". This is what a player sees on a train, and it is what makes these surfaces
    testable without a server.

---

## 17. Content generation — how a daily tower stays fresh

Nothing new gets designed daily. A day is a **draw**, from three parameters:

- **Tower** — the eight buildings in `data/buildings/`.
- **Wrinkle** — a library of parameterised constraints, authored as data (`data/wrinkles.json`),
  not one-offs: a shaft out (which, from when, until when), a floor's occupancy spiked, a timed
  arrival burst (coaches, caterers, a fire drill), doors slowed on one car, a sky lobby closed,
  capacity derated. Twenty templates × their parameters is thousands of legible days.
- **Crowd** — the seed, plus which profile from `data/traffic-profiles.json`.

**Rotation:** no tower twice in seven days; no wrinkle template twice in fourteen; the pair
(tower, template) never inside a month.

**Day one must be gradeable.** A contract's first day, and a daily tower's default dispatcher,
must land inside the band where a figure can honestly be reported — not in saturation, where the
right answer is to withhold the mean and print a paragraph of statistical justification. The
suppression rule is correct and stays strict; what must change is the demand. Tune each day's
opening load into the gradeable band and let tenant growth walk it toward saturation across the
contract. **Saturation is something the player causes by week two, never the state a level ships
in.**

**The gate that matters:** a day only earns its place if it **changes which dispatcher wins**.
Run the baseline dispatchers over a candidate day offline and keep it only if the ranking
differs from yesterday's by more than noise — the same paired-run machinery the bench uses. Days
that do not shuffle the ranking are cosmetic; discard them.

Two consequences: the wrinkle library must be data so a day is a row rather than code, and the
generator's output must be pinned to a commit, or everyone's "same tower" quietly diverges.

---

## 18. State model

```
screen      menu | door | brief | stage | report | towers | building | contract
            | rush | fixit | workshop | bench | designer | tuner | week | board
            | settings
ctx         daily | campaign | rush | watch   ← what the stage is serving
modePick    today | campaign | rush | fixit    ← menu selection, before commitment

watching    null | { who, name, rank, away, longest, ref }   ← the posted run being replayed
profile     { name, avatar }                                 ← shown on boards and to spectators
board       boardTab: today | ladder, proofOpen

run         running, speed(1..5), dayClosed, broke, rush, replaying, scrub
daily       dayOffset(-6..0), ghostId(world|best|plain|prev|none)
workshop    styleId, name, dirty, saved[], confirmOpen,
            lev{patience,lobby,spread,load}, terms{13 keys}, showAllTerms,
            flags{pool,sensor}, grp{park,express,dwell},
            sw{mode,hold,judge,wLobby,wInter,wDown,margin,pat{}},
            ruleList[{whenId,whenVal,thenId,thenVal}],
            tinker, rules, maths                ← disclosure state
handoff     fromReport{name,why,lev,style}, applied, replayGhost
bench       benchPicks[], benchTests{}, reps, benchRan, benchDone
campaign    careerStage, diff, openTower, responses{tower:option}, answeredAt,
            assign{tower:dispatcher}, builds{tower:build}, own{cat:level},
            works[{tower,catId,lvl,start,nights,cost,name}], booking, carry{tower:units}
fixit       fixIdx, fixSpend{case:[ids]}, fixEdit{case:{…}}, fixRun{case:bool}, fixSolved[]
designer    design{…}, designSaved, designDocOpen
tuner       sandbox, tune{floors,cars,speed,dwell,cap,rate,lobbyShare}
settings    reduceMotion, mute, imperial, noPost
```

Two hard-won implementation notes:

- **Declaration order matters.** The campaign group (`stage`, `TOWERS`, `bTower`, and the
  wear/offer derivations) must be computed *before* anything reads it. A `const` read above its
  declaration in the same function body is a temporal-dead-zone `ReferenceError` on every
  render, and the whole app goes blank.
- **One declaration per name.** Duplicate `const` in one scope is a hard `SyntaxError`. Both of
  these killed the prototype for a full cycle each.

---

## 19. Design tokens

```
Paper           #F7F2E8   page, cards
Paper deep      #EDE4D5 · #E4D8C4   gradients, wells
Card            #FBF7EF     Card sunk   #F5EFE3 · #F2EADB
Ink             #23201C   text, dark rail, primary buttons
Ink soft        #4C463D   body copy
Warm grey       #6E665A   secondary     #8D8271 labels     #A79B87 · #C6B79F faint
Rule            #D6C9B4 · #E2D6C1 · #DDD1BE
Sun             #F2A63B   primary accent, doors, active nav
Terracotta      #B8462B   your line, live figures     #D4573A alarm, missed, gave up
Moss            #4F8A5B   cleared, good     Sky #4E9DD8   windows
Amber wash      #FDF3E2   incident cards, today     Amber edge #E0B98A
Shaft tints     #C08A3E #7E8F86 #B8462B #8D6A2F #5F7268 #A5763B #6E665A #C9A227

Type   Familjen Grotesk 600/700  headings, big numbers in prose
       Instrument Sans 400/500/600  body, labels, buttons
       DM Mono 500  every figure, eyebrow, timestamp, code line

Eyebrow  10–10.5px, letter-spacing .12–.16em, uppercase, #8D8271
Body     13–14.5px / 1.5     Lede 16.5–19px / 1.55, text-wrap: pretty
Radius   5 · 8 · 9 · 10 · 12 · 14 (cards) · 20 (pills)
Gap      wide 26 · 16–18 · 12–14 · 7–9 · 5–6
```

Inline styles throughout, no stylesheet. Figures are always mono, always with units.

---

## 20. Work order — what to change in the existing screens

The prototype's layout is right and its data is real. What is missing is that several controls
do not yet reach the simulation, and two screens score from a model rather than a run. In
dependency order, each with the check that proves it.

### 20.1 One weight vector

Today `lev` (four levers) reaches the sim and `terms` (thirteen) does not; they are separate
state. Collapse them: **the thirteen cost terms are the model**, and the four plain levers are
named views onto them —

| Lever | Writes |
|---|---|
| How long anyone should wait | `starvation`, and the wait term's share of it |
| Keep a car downstairs | the lobby-anchor group term |
| Spread the cars out | the spreading group term |
| How much room to leave in a car | `load` |

Moving a lever moves its terms; moving a term updates the lever that owns it. *Check:* open the
maths line, move a lever, watch the printed cost line change; open the thirteen and see the
same numbers.

### 20.2 The rules must compile

`ruleList` is currently inert. Each row compiles to a conditional adjustment of the vector or a
behaviour flag, exactly as its `moves` label claims, evaluated top to bottom with first match
winning; the fallback is the style's own vector. *Check:* a rule that holds two cars at the
lobby when the queue passes 12 visibly parks a car and moves the lobby lever's readout.

### 20.3 The flags, group levers and the detector must run

`pool`, `sensor`, `park`, and the whole pattern-switching block must affect the sim, and the
detector must actually classify the last *judge* seconds and honour *hold* and *margin*. Until
they do, the panel is a promise. *Check:* with `Watch the traffic and change`, the stage header
names the detected pattern and it changes at the noon transition.

### 20.4 The ghost must be the ghost you picked

`ghostId` is written by the brief and ignored by `reset()`, which always runs Steady hand.
Wire all five: `world` (the reference median vector), `best` (your highest-rated saved
dispatcher), `plain` (Steady hand), `prev` (the run you are trying to beat, from the report
handoff), `none` (no second sim at all — do not draw lines, a band or a verdict). *Check:* pick
*nobody* and the strip has one line and no verdict.

### 20.5 The rush hold line

The run currently ends when forty people are standing at all. It must end when **forty people
have been standing over two minutes at once**, which needs a per-person timer the sim already
has. *Check:* a rush with a long queue of fresh arrivals does not end; one with forty
two-minute waits does.

### 20.6 The daily tests must be evaluated for real

The four tests are drawn from the difficulty but never computed. At close, evaluate all four
from the run (`away`, worst wait, peak lobby queue, trips) and derive cleared/missed from them.
The "was" figures beside each test must read the building's **previous day**, not constants.
*Check:* a day that peaks the lobby at 26 against a cap of 25 is missed, and the calendar draws
an ×.

### 20.7 Fix a building and the designer must run the engine

Both currently score from closed-form models (`fixPct`, `restDelta`, `hc5`). Replace with real
paired runs: as-built versus as-specified on the same crowd. Keep the three pass conditions and
the four outcome copies exactly as specified — they are correct, only their inputs are fake.
The designer's interval and handling capacity may stay analytic (they are a specification
calculation, not a simulation) but must be recomputed by the same code the engine uses.
*Check:* the before/after rows on a passed case match a fresh run of the same configuration.

### 20.8 The bench is one instrument

There are two benches in the prototype: the suite (field × tests × reps) and a legacy pairwise
panel (`benchArms`, `benchVerdict`, the interval bar). Keep **one screen**: the suite, plus the
pairwise interval and verdict rendered **only when the field is exactly two**. `reps` must
change the result, and the interval must come from the paired runs rather than a constant.
*Check:* 10 reps and 200 reps give visibly different interval widths.

### 20.9 Delete the dead quiz

`fixGuess` and the rendered candidate list are the removed diagnosis quiz. Delete the state and
the panel; keep `options` in the data as the source of the diagnosis line and its reasoning.
*Check:* nothing on the fix screen is clickable except repairs, the editor, and the primary.

### 20.10 The gauntlet needs a route

`Send it through the gauntlet` currently jumps to the ladder without running anything. It must
require a saved dispatcher, run the forty cases with progress shown in place, then land on the
ladder with the new rating and the case count. *Check:* a dirty dispatcher cannot be sent, and
the button says why.

### 20.11 Mark the fixtures

`contractDays`, `weekDays`, `doorBoardRows`, `boardRows`, `ladderRows`, `styleSplit`,
`RUSH_BESTS`, `doorStats`, the two histograms and the report's beats are authored fixtures.
Each needs a real source (the server's replay path for world figures, the run's own event log
for the beats) or an explicit `FIXTURE` marker so nobody ships them as truth. **World figures
must never be presented as players when they are reference runs.**

### 20.12 Interventions, and the loop's missing wires

From the repo's own playtest point of view (#116, #96, #91), and the largest single change in
this revision:

- Implement the intervention record (§7.6) and its re-simulation. Start with *park the cars in
  the lobby*, then dispatcher switching. *Check:* switching at 09:14 leaves every figure before
  09:14 identical and changes the ones after it.
- The stage enters paused at 06:00; speed resets to the player's default each run. *Check:* a
  day ended at 30× opens the next one at the default, paused.
- The campaign report follows the fixed order and carries *what changed overnight*; the button
  into tomorrow opens the brief paused. *Check:* nothing statistical sits above that button.
- The report's third lever (*a fourth shaft*) must actually apply the shaft in the sandbox and
  offer the re-run. A lever that navigates and changes nothing is the defect #116 §3 names.
- The `Sound` setting has nothing behind it. Either give it doors, chimes and lobby murmur, or
  remove the row. A toggle that toggles nothing is a lie in a settings panel.

### 20.13 Content and honesty gates

- Day-one gradeability (§17) and bounded growth (§8.7) are content gates: no day ships
  saturated, no counter can print `4/1`, no 120-person building reaches 370 people.
- The honesty sweep must **enumerate states from the state model** (§18), not from hand-written
  fixtures: every combination of *day not closed · replay · sandbox · noPost* across Your week,
  the board, the ladder, the percentile line and the report. *Check:* a state a player can reach
  cannot be a state the sweep has never seen.
- Plain names for every parameter and constraint live in `core` (§16 rule 11). *Check:* grep the
  Casual bundle for engine identifiers and find none.

### 20.15 Watching, settings and the boards

From this round of review:

- **Spectator mode is real replay, not a re-run with your weights.** The prototype replays the
  day with whatever dispatcher is currently loaded and dresses it as theirs. It must fetch the
  posted run's record — `(seed, config, interventions[])` — and replay that, which is the same
  path the server's verification already walks (contract §1.4). Until it does, the header's
  figures are theirs and the picture is not. *Check:* a watched run's away figure at 19:00 equals
  the figure printed on their board row.
- Every surface in §14.1's table must branch on the spectator context, including the strip
  eyebrow, the legend label and the bar. *Check:* the string `you` appears nowhere on screen
  while watching.
- `Play this crowd yourself` must open the brief for **that day's** fixture, not today's, when
  the row belongs to an archived day.
- Settings is a screen (§15.1) and the menu is one column. *Check:* the menu has no controls on
  it except the four mode cards and the primary.
- The display name and avatar colour are read by board rows, the spectator header and the rail
  card from one place. *Check:* changing the name updates all three without a reload.
- The ladder's `What are the forty?` panel must be generated from the **same fixture list the
  bench and the gauntlet use**, not from a second copy of the names (§14.2).

### 20.16 Small corrections

- The rail's `DESIGN` group is *Dispatcher workshop · Test bench · Design a building*. Tune the
  tower is reached from the brief and the report only.
- `runIncidentClock` must be the simulated time the answer was given, and must appear on the
  report.
- `testsCount` ("*3 of 4 held yesterday*") currently compares the difficulty's targets against
  constants. Derive from yesterday's run or show `—`.
- The speed buttons must be labelled from the same array the loop multiplies by, so `12×`
  cannot mean something else.

---

## 21. Keeping this document alive

This guide is maintained alongside the prototype, not written once. When a mechanic changes,
the section that describes it changes in the same turn. §8.6's tables, §19's tokens and §20's
work order rot fastest. A number in this document that disagrees with the build is a defect of
the same class as two numbers disagreeing on one screen (§1, rule 3).

### Changelog

- **This revision, third pass:** specified **watching another player's run** (§14.1) — an ink
  header, their name and posted result, a verified-replay pill, no timeline, no verdict, no
  first-person copy, and `Play this crowd yourself` as the way out; **told the two boards apart
  by presentation** and added the `What are the forty?` disclosure (§14.2); moved **settings onto
  its own screen** with display name, avatar colour and a this-device section (§15.1), leaving
  the menu as nothing but the choice; and merged the two board entries in the rail into one
  (§3.2).
- **This revision, second pass:** adjudicated against every open repo issue and folded their
  good requests in — timestamped in-day interventions with deterministic re-simulation (§7.6,
  from #116/#96), the fixed between-day sequence and *what changed overnight* (§6.5, from
  #116/#91), paused entry and non-inherited speed (§7.3), a building as a commitment (§8.1, from
  #94), bounded growth and day-one gradeability (§8.7, §17), the two board rules plus *how did
  they do it* and *race this run* (§14, from #93), and five new interaction rules covering plain
  names in `core` (#147), the cost formula's register (#146), disclosures (#130), one day record
  narrating everything, and API-absent rendering (#123). See ISSUE_ADJUDICATION.md.
- **This revision:** rewritten as a buildable spec. Added the vocabulary table (§2), the
  complete action-bar table (§3.3), the screen inventory (§4), session shapes (§5), the close-
  the-day sequence (§6.4), the works-booking flow (§8.4), the campaign-day sequence (§8.5), the
  rush result branch table (§9.3), Fix-a-building's real scoring and four outcomes (§10.4), the
  editor in full (§10.3), the workshop's six layers including the thirteen cost terms, the
  behaviour flags and traffic-pattern switching (§11.4–11.5), the bench as a suite (§12),
  **Design a building** (§13, previously undocumented), and the work order (§20). Corrected the
  rail's contents and Tune the tower's place in the app.
- Fix a building lost its diagnosis quiz; the diagnosis is printed and the play is the
  reconfiguration. Passing is now scored on a re-run, not on selecting the right button.
- Dispatcher assignment is editable per building on the building desk and on the triage list,
  from the full list of styles and saved dispatchers, with the style's trade shown inline.
- The prototype always opens on the main menu; the `startScreen` prop was **removed outright**.
  Do not re-add an entry-screen override.
- The campaign's in-screen career-stage switcher was removed; `careerStage` is the only control,
  and the screen labels the snapshot it is showing.
- Card headers wrap instead of shrinking their titles.
- Offers, incidents and pending contracts are per career stage; held buildings are filtered out
  of offers; the offers caption counts what is rendered.
- Renewals are performance-priced (complexity + record); contracts can be lost, three ends the
  career.
- The rolling calendar is a sliding thirty-column window, one row per building.
- The race strip's top lane plots the live average wait, not a second copy of the header.

---

## 22. Open questions, deliberately unresolved

- **Is six slots enough?** Six towers is already more than a person can watch. The late
  snapshot suggests the answer is to stop adding slots and start making buildings harder.
- **Should the ladder's gauntlet cost something?** Free re-runs make ratings churn; a cost makes
  them meaningful and punishes experimentation. Unresolved.
- **Energy** stays out of Everyday Mode entirely unless electricity spend becomes a scenario
  objective. If it does: a figure on the report and a column on the bench, never a grade
  (§ Energy is an axis, never a score).
- **Scrubbing the race strip.** The strip reads two lines; clicking a moment should rewind both
  towers to that instant. Needs per-second state history — worth it, not yet built. `scrub` is
  reserved in state for it.
- **Does the designer feed the campaign?** A saved building can be run as a day and handed to
  the bench. Whether an authored tower can ever appear as a contract is open; it would make the
  economy unbalanceable, and it is the most requested thing on the list.
- **The world's numbers** are authored in the prototype. Real ones need the server's replay
  path, and reference runs must stay labelled as reference, never presented as players.
