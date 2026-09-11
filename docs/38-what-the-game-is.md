# 38 — What the game is

**Status: adopted. Written 2026-09-06 and decided the same day by the product owner as
[§ D525](../DECISIONS.md), [§ D526](../DECISIONS.md) and [§ D527](../DECISIONS.md), with
[§ D528](../DECISIONS.md) to [§ D531](../DECISIONS.md) taken later the same day.** **No question on
this page is open** — the two § 2.4 once carried, the currency's name and the sign-in bonus, are ruled
by § D530 and § D531, and no `[OWNER: …]` marker remains. [`39-decisions-in-force.md`](39-decisions-in-force.md) is the
index of which older decisions this page supersedes and how their names map.

This page comes before the charter. [`22-charter.md`](22-charter.md) says how we build the game.
This page says what we are building. Where a pillar and the quality of a session collide, the answer
is to change the design until both hold, and to say so ([§ D456](../DECISIONS.md)). Where this page
and [`CLAUDE.md`](../CLAUDE.md) disagree, `CLAUDE.md` wins, for the reason the charter gives in its
§ 6.

---

## 1. The game, on one page

Elevator Sim is a game about running the lifts in buildings full of people who are trying to get
somewhere. You take a building, watch it struggle, change things, and find out whether the people
got there.

The fun is watching the people. Every mode plays out in front of you, at a speed where you can see
a car arrive and a queue thin. If you would rather not watch, you can speed it up or skip to the
end, but watching is the point, not a replay.

The engine underneath is a real lift simulator. It does not round in your favour. It will not give
you an average for a queue that never cleared, and it will not call a fix a win from one lucky run.
That is the hook, not the small print. When this game tells you your change worked, it worked.

There are three ways to play, and Scenario is first on the menu.

**Scenario.** Somebody hands you a building with a problem and a budget. Everything is on the table
at a price: tuning the dispatcher is cheap, changing how the equipment is set is dearer, and
changing the building itself is dearest. You fix it or you do not, and there is usually more than
one way. The first one or two can be solved with a tweak and lost with the wrong one.

**Career.** You take on several buildings at once and keep them running, month after month, on
money you earn by keeping the tenants moving. Buildings age, contracts end, and a bad month costs
you. It waits for you between sessions.

**Rush.** One building, and the crowd keeps growing until the lobby overflows. You swap dispatchers
while it runs and rebuild between rounds. The only question is how long you last, and the board is
the same crowd for everyone.

Everything you finish earns chimes, in every mode. Chimes buy a wider budget on the scenario, the
contract or the rush you are saving up for. Nothing resets while you are away, and nothing is ever
locked: you play to earn, and you spend to reach.

What it is not. It is not a programming toy. It is not a tycoon game with lifts in it. It is not a
demonstration of statistical honesty. The honesty is what makes the win mean something, and it is
never the point of a session.

---

## 2. The three modes

Four tiles become three. Each mode is stated in one sentence, with what it absorbs from the shipped
build and what it retires.

| Mode | In one sentence | What it absorbs | What it retires |
|---|---|---|---|
| **Scenario** | A building, a problem, a budget, and a verdict on whether you fixed it | The eighteen *Fix a building* cases in `data/fixit-cases.json`; the ten campaign stages in `data/campaign.json`; the six Engineer challenges in [`21-engineer-reimagined-contract.md`](21-engineer-reimagined-contract.md) § 4; the daily seed, as *today's scenario* | The *Fix a building* and *Today's tower* tiles, and every authored repair list |
| **Career** | Several buildings at once, run on money you earn, that waits for you between sessions | The Campaign as built: towers, slots, purse, works, wear, contracts | The name *Campaign*, and the sentence that the career is this session's only |
| **Rush** | One building, a crowd that grows until the lobby overflows, and a board of how long people lasted | [§ D477](../DECISIONS.md)'s ruling, and the handoff's § 9 as written | The recommendation that the rush is a bench instrument |

**Two rules apply to all three, and both are the owner's.** Every scenario and every rush plays
live, which is § 2.3's first paragraph and holds for Career too. And every mode earns and spends the
one currency, which is § 2.4.

### 2.1 Scenario

**What it is for.** The first session, and every session where the player wants a problem handed to
them. It is first on the menu, and it is the only mode a first-time player should meet. The first
one or two scenarios are doable with a tweak to the dispatcher and failable with the wrong tweak:
that is [`33-difficulty-curve.md`](33-difficulty-curve.md)'s DC-2 and DC-3 together, a stage the
dropdown alone does not clear and a witness vector that does. And it is visibly in trouble first:
[§ D512](../DECISIONS.md)'s measure, a landing holding somebody in the third wait band for two contiguous
minutes, is the instrument, and [§ D514](../DECISIONS.md)'s five legible contracts are where a first scenario
may be set.

**One shape, four sources.** A scenario is a building, a crowd, a seed set, a goal set, **a
budget**, and **a price schedule**. `data/campaign.json`'s stage record already carries everything
but the budget: `building`, `traffic`, `durationS`, `dispatcher`, `seeds`, `holdoutSeeds`,
`replications`, `goals`, `levers`. That record, plus a budget, is the scenario schema, and four
kinds of content that have never been called one thing are authored to it:

- The ten campaign stages, each with its `teaches` line. They are the ordered path through the mode.
- The eighteen fix cases. The complaint in a named person's words stays; it is the best writing in
  the product and [`35-problem-per-mode.md`](35-problem-per-mode.md) § 1.4 says why it is portable.
  **The four-repair menu and the five decoys go**, and with them the printed line that says what
  kind of fix it is. Read from the ruling: the owner does not want fixes proposed, and a line saying
  *it is a setting, not a shaft* is a proposed fix with the price removed. The player watches the
  building, reads the letter, and has the whole editor.
- The six Engineer challenges, `E1` to `E6`, in the technical register. `E6`, the Pareto trade study,
  is the one [`32-game-design.md`](32-game-design.md) § 1.5 said did not map onto the loop because it
  varies more than one thing on purpose. Under a budget with more than one way through, it maps.
- Today's scenario. One seed, the same for everybody, once a day. The board stays exactly as
  [`32-game-design.md`](32-game-design.md) GD2 has it: it publishes what happened on a day and never
  which dispatcher is better. Today's tower's world board, brief and report move here whole.

**No proposed fixes.** The player has a budget and can change anything and everything, up to it.
The whole editor is open in every scenario: the dispatcher's weights and rules, the equipment's
settings, and the building's fabric. What varies between scenarios is the budget and the building,
never which controls are offered. There have to be enough knobs that the player can change what
they want to change, and every knob is priced.

**The price ladder.** One schedule, in `data/`, because a price is a tunable and
[`CLAUDE.md`](../CLAUDE.md) invariant 7 makes tunables data. Its ordering is the owner's:

| tier | what it covers | price |
|---|---|---|
| dispatcher | weights, rules, idle strategy, the weight-set selector | cheap, and tuning is nearly free |
| equipment settings | door dwell, door speed, a car's parking floor, anything set on kit already installed | dearer |
| building | a new shaft or car, a faster or larger machine, a rezoned bank, destination panels | dearest |

Three price lists ship today and the schedule replaces all of them: the fix cases' per-patch
`costUnits`, the campaign shop's tiers in units and nights, and commissioning's `CapitalConstraint`
as a fraction of the as-built figure. One distinction the tree already draws survives into the
ladder: *tuning* a destination dispatcher is a dispatcher change and cheap, while *installing*
destination panels is equipment, which is the 6a-disclosure against 6b-dispatch line
[§ D112](../DECISIONS.md) drew.

**Difficulty is the number of ways through.** The owner's definition, and it is measured rather
than chosen: take every configuration the budget can reach on the schedule, judge each on the
scenario's seeds under common random numbers against the scenario's goals, and count the ones that
clear. Many survivors is easy. One survivor is the hardest a scenario is allowed to be. **Zero is
not a scenario** unless it declares itself a diagnosis in the shape of
[`10-experience-layer-contract.md`](10-experience-layer-contract.md) § 5.4's stage 3, *unwinnable as
configured and it says so*; DC-3 is what stops the ladder from ending in cruelty. The count is
pre-simulated before the scenario ships, pinned the way every published figure in this repository
is pinned so that a moved count is a finding rather than a number to edit, and drawn on the
scenario's own face in the player's words. The space is too large to enumerate at the building
tier, so the count is a sample there and says so; how it is sampled is the lane's, and it is
published beside the count.

Two things this definition does not touch. [`33-difficulty-curve.md`](33-difficulty-curve.md)
DC-R1 says what difficulty is *made of*, demand and fabric; this says how it is *counted*, and the
two are compatible. And the budget bounds the space the count is taken over without moving the bar
any run is judged against, so charter non-goal 6 holds: two players who post the same run read the
same verdict whatever their budget was.

**A wider budget can be bought.** Chimes (§ 2.4) buy a scenario's budget up, in steps the scenario
authors. The count is pre-simulated at each step and the scenario shows the count for the budget the
player actually has, so buying up is choosing an easier version of the same puzzle and the screen
says so. A clear at a bought budget is recorded with its budget.

**Build your own.** A player-made scenario is a scenario file with the player's own building,
dispatcher and traffic in it, under the same schema. The authoring surfaces already ship: *Design
a building*, the dispatcher workshop, and Free Play. Nothing new is invented; a scenario is what
those three produce when saved with a goal and a budget. Its count is measured before it is shared
with anyone else.

### 2.2 Career

**What it is for.** The long game. Several buildings held at once, a purse in units, works booked
in nights, a wear clock, contracts you can lose. This is the Campaign as built and specified in
[`32-game-design.md`](32-game-design.md) § 3, under a name that says what it is.

**What changes.** One thing, and it is the thing the mode cannot be a career without: **it
persists**. `packages/viz/src/campaign/career.ts` says on its own screen that *"the career is this
session's"*, and [`27-flow-maps.md`](27-flow-maps.md) F2 records that a reload loses a campaign
three days in without saying so. A career that vanishes on reload is a session, not a career. The
module names what persistence costs, a schema, a migration, and a reconciliation with the week, and
that is engineering work to file rather than a design question to reopen.

**What does not change.** The economy rules GD11 to GD14 stand. Units are money, nights are time,
standing opens slots and buys nothing. No currency buys access, a verdict, or a retry. One
consequence of § 2.1: the shop prices its works from the same schedule Scenario uses, with nights on
top, so a fourth car costs the same units in both modes and a career day costs time as well.

**Chimes in a career.** A contract day that pays earns chimes, per § 2.4. Chimes can top up a
tower's purse. They cannot open a slot, because slots are the one scarcity that is attention rather
than money and standing is what opens them (GD14); and they cannot buy a missed day back, because
that is relief on a failure.

**The two halves docs/32 § 3.6 and § 9 named as owed have both landed**: a works night takes a car
out of passenger service ([§ D504](../DECISIONS.md)), and a campaign day's event is drawn from the contract's
calendar and § 8.3's odds on a stream off the seed ([§ D507](../DECISIONS.md)). What the rename leaves owed is
persistence, above.

### 2.3 Rush

**Every scenario and every rush plays live, and this is how.** The engine runs a whole day in
milliseconds and the stage plays the recording back
([`16-change-scope-contract.md`](16-change-scope-contract.md) § 0). That is not a second engine and
does not become one; charter non-goal 7 forbids it. Live means: the stage plays at a speed where
people can be watched, the player presses a control while it plays, the press is stamped at the
playhead and written into the run record as an intervention with the moment it happened
(`{ seed, config, interventions[] }`, `packages/viz/src/live/interventions.ts`), and the day is
re-simulated with it. The crowd is the same crowd either side of the press, so nothing the player
already watched changes. **Six** intervention kinds exist: park the cars in the lobby, spread them
across the tower, switch dispatcher, answer an incident, and — since GitHub issue #370 — an
equipment change and a building change, priced from the schedule and on the same record
(`core/src/sim/types.ts#INTERVENTION_KINDS`). (Stairs are a **transport mode**,
`TRANSPORT_MODE_KINDS`, not an intervention; an earlier draft of this paragraph counted them as a
fifth kind and GitHub issue #370 inherited the error.) *Record what changes to what and when* is
that record.

**The two bought kinds add no engine.** Their effect travels in `ResolvedServiceEvent` — a car's
mode, a bank's serving range, a car's rated load — which is the one plain-data vocabulary the
simulator already has for the building changing mid-run, and it rides the same service schedule an
incident answer's effects ride. What the two kinds are *for* is the price: the record has to say
which rung of the ladder a change was paid on, or the day's spend cannot be re-derived from it.
Neither travels to a board, and for a stated reason — a purchase is made against a scenario budget
and no submission carries a budget, so a replay would hold the change and not the entitlement to it
(`core/src/sim/interventionWire.ts`).

**What the vocabulary reaches and what it does not, measured rather than assumed.** A rezone at
either tier and a change of rated load reach the run; door timings and rated speed do not, because
`Car.doorConfig` and `Car.constraints` are frozen for the run by construction. Anything that would
move `floorPopulations` is refused for a stronger reason: the crowd is drawn from the seed before
the first event fires, and *the crowd is the same crowd either side of the press* is the property
these kinds exist to protect. And a bought change costs the live path **no more** than a dispatcher
switch — measured at 1.8 / 80.6 / 325.2 ms against a switch's 2.6 / 94.6 / 354.5 ms on the three
shipped sizes, because the day is re-simulated whole either way and a narrowed bank then serves
fewer legs. The top of the range is § D527's second measurement, 1.33–1.38 s at the Burj-class
reference, which bounds every kind at once.

**Speed.** The stage ships seven rungs from `1×`, which is real time, to `600×`, and four of them
sit inside the range where a door cycle is still a cue ([§ D344](../DECISIONS.md)). **Settings now carries a
*Default speed* row** (GitHub issue #229), and it defaults to `30×` ([§ D354](../DECISIONS.md)), a rung for
watching a day rather than a car. The ruling that watching is the point moves that default to a
watching rung, `1×` or `4×`, and a playtest picks which. A *skip to the end* control does not exist and is new.

**What is settled, and built.** [§ D477](../DECISIONS.md): the run ends when the lobby overfills, and
the ramp is traffic and/or breakdowns. [§ D515](../DECISIONS.md) built it: the rush is a week of its own on
the contract's stream, each wave holding its rate and climbing into the next, ending on the hold
line, forty people standing over two minutes at once, which is the overfill read with the wait
clause § 20.5 gives it. The sheet quotes its own trend test, the waves come from one seed so every
player faces the same climb, and a run stopped by hand has no breaking point to post.

**How it ends, as built.** `core/` runs a trace to a declared duration and has no stop condition,
and § D515 did not add one: the run is simulated to its horizon and the recording is read for the
first moment the hold line holds. That is the first of the two ways this page's first draft weighed,
and the one that needed no engine change.

**What the player does.** Swaps dispatchers while the run plays, as above. Rebuilds the building
between rounds, from the same price schedule as Scenario. The fit-out kit the career already
reaches the run through ([§ D427](../DECISIONS.md)) is the same kit. A between-round change is
between-games scope on the next round's record; a mid-round change is an intervention on this one.

**The between-round budget.** Each wave survived pays a fixed purse of units into the next round,
authored in the rush's own data, so a player who lasts longer has more to rebuild with. Chimes
(§ 2.4) can top that purse up, and a rush started with a wider purse or a pre-fitted building
carries those modifiers on its record. Nothing about the purse changes because time passed; it is
earned inside the run and widened only by spending.

**The board, and it is postable.** How long you lasted, on the shared seed. The submission carries
the intervention log and the server replays it, which is the shape [§ D486](../DECISIONS.md)
already takes: a submission carries causes and the server derives effects.
[`16-change-scope-contract.md`](16-change-scope-contract.md)'s `ranked` row permits between-games
state only, because until now nothing else survived the replay; it widens to *between-games plus
recorded interventions*, and S5's rule that the predicate has one derivation and two consumers is
unchanged. `scope/runIdentity.ts` is where the refusal lives and where it moves. A rush board is
permitted for the same reason today's board is: it ranks runs on one crowd, never dispatchers.
**A run carries its modifiers onto the board.** The standard board is the standard purse and the
building as shipped, the same for everyone; a run with a bought purse or a pre-fitted building ranks
among runs with the same modifiers and shows them. What the board never shows is the chimes spent:
a modifier is a fact about the run's configuration, and a currency figure on a results page is what
GD13 forbids. A modifier-set board inherits [§ D506](../DECISIONS.md)'s twenty-player floor, so a rare
modifier set shows no ladder, and it resets as every board does under [§ D509](../DECISIONS.md).

### 2.4 Chimes — one currency across the three modes

**What they are.** A tally the player earns by finishing things, in every mode, and spends to widen
what a mode lets them reach. They are the reason to save up: a scenario you cannot yet afford the
right change for, a contract that needs a bigger purse, a rush record that needs a better start.

**Earned by completing a turn, never by a run's figures.** A scenario cleared, a contract day paid,
a rush wave survived. Each pays a flat amount authored in `data/` (invariant 7). Harder scenarios
may pay more, by their survivor-count band, because that is a property of the scenario and not of
the run — **that permission is not taken up, and the shipped table pays every scenario the same**:
`data/scenario-survivors.json` records survivor *counts* and no band, nothing the earn route reads
turns a count into one — GitHub issue #234's approved difficulty band,
`data/scenario-survivor-bands.json`, is read only by an acceptance check — and a band the client
chose was what the first attempt at this shipped (the review of PR #485;
`packages/core/src/config/chimeLedger.ts` now refuses a `bands` key by name). A band becomes
available when a scenario's pinned record carries one. **No chime is ever scaled by a wait figure or
any quantity the run can suppress.** That is
the argument [`32-game-design.md`](32-game-design.md) § 3.4 makes for standing, a tally of completed
turns rather than a statistic over a run, and it is what keeps chimes outside charter non-goal 1.

**Spent on modifiers, never on access.** Chimes buy budget: a scenario's budget up, a tower's purse
up, a rush's between-round purse up or a pre-fitted start. **A scenario's budget is priced by the
scenario** — § 2.1's *"in steps the scenario authors"* — so `data/campaign.json` holds that ladder
and `data/chime-ledger.json` holds the other three; a price for one act in both documents is an
authority defect, and the ledger's parser refuses one. **No screen spends a chime yet**: the tally
is banked and shown, the prices are listed, and the panel that lists them says on its own face that
nothing buys them, which is GitHub issues #371 and #372. That is GD13 clause 1's one permission, a
limit on a configuration. Everything else in GD13 holds and is restated here so nobody reads the
currency as relaxing it: chimes never open a mode, a screen, a building, a dispatcher, a case or a
figure (GD9); they never buy a verdict, a retry the mode declares free, or relief on a measurement,
including a missed day or a suppressed mean; and they never appear on a results page, beside a
wait figure, or in any comparison between players.

**Nothing resets on time.** The balance is earned by playing and spent by choosing. Nothing refills,
expires, or decays while the player is away, and no streak exists. A player who comes back after a
month has exactly what they had.

**Where the balance lives, and what the play surface is allowed to know.** On the account.
`packages/server/` already carries accounts ([§ D214](../DECISIONS.md)) and Everyday its own sign-in
([§ D458](../DECISIONS.md)); the balance is a ledger of entries on that account and the server holds
it. **The play surface has one read and two verbs against it: the balance, earn, and spend.** It
never knows where an entry came from. A scenario cleared posts an earn; a budget widened posts a
spend; the screen shows what is in the account and lets the player spend or earn against it, and
that is the whole of its contract. Without an account the ledger is on this device alone and says
so, in the shape the tree already uses for device-only artefacts, and a run played with device-only
chimes can be played and not posted.

**That last sentence is a requirement and is not built**, and it is flagged here because the first
attempt shipped its *face* without its *store*: the Settings panel told a signed-out player their
tally was kept on this device while `everyday/profile.ts` — `localStorage`'s owner — had no chime
field, so the balance was a hard zero described as a ledger (the review of PR #485). The panel now
says there is no tally until you sign in, which is true of this build and contradicts the paragraph
above on purpose. What is missing is not code but a ruling: **what happens to a device balance when
an account arrives** — merged, discarded, or which one wins — and a device ledger built without
answering that would either silently double a balance or silently drop one.

**No purchase ships, and the ledger is built so an add from outside is invisible to play.** A
ledger has sources; today they are the three completions above. Any external add, a purchase or a
gift, is one more source on the same ledger, and because the play surface reads only the balance,
nothing on it moves when that source is added: no store, no price, no purchase screen, no
conversion event, and no telemetry that exists to support one lives on the play side, now or later.
Until a decision citing a real retention measurement (`charter S4`) adds such a source, there is no
purchase anywhere. [`26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) § 10 non-goal 1 is
amended to say exactly that, in [§ D526](../DECISIONS.md).

**A sign-in bonus, and it ships at launch** ([§ D531](../DECISIONS.md), 2026-09-06). In this shape
only: a small, flat, unconditional award of chimes on the first session after `x` hours away. It does
not compound, there is no streak, and missing it costs nothing, so it is a gift and not a timer.
`x` and the size of the award are data, authored in the earn table beside the rest of the ledger.
**The trade the ruling accepts, recorded rather than lost:** shipping it at launch forfeits the
baseline, so no `charter S4` claim may be made about the bonus in either direction on the evidence it
ships with.

**The name is ruled: chimes** ([§ D530](../DECISIONS.md), 2026-09-06). The arrival sound —
distinctive, dry enough for the voice rule, and it reads correctly in the two sentences a player
actually meets (*you have 40 chimes · widen this budget: 12 chimes*). The name may not be a quantity
the run measures, so *rides*, *calls*, *stops*, *floors*, *landings*, *trips* and *waits* were out; and
it may not be *units*, which is money inside a mode and stays so. *Fares* and *bells* were the
alternatives offered and not taken. *Credits* was the placeholder and is replaced throughout.

### 2.5 The building ceiling

**The model carries a building up to and slightly beyond the largest in the world.** The owner's
reference is the Burj Khalifa: 163 floors above ground and 2 below, 165 levels; 57 lifts; rated
speeds to 10 m/s; about 154 populated floors, with floors 155 to 163 mechanical and unpopulated;
8 escalators. The reference is a floor, not a ceiling, and a building at that size ships in
`data/buildings/` beside the eight that exist.

**Most of it is expressible today, and none of it is measured.** The schema already allows basement
floors, unpopulated floors, banks that skip floors, sky-lobby transfers, escalators as timed hops
([§ D167](../DECISIONS.md)), double-deck banks ([§ D131](../DECISIONS.md)), and a speed catalogue to
20.5 m/s. The tallest shipped building, `vertical-city`, is 100 floors, 7 banks and 35 cars, so the
reference is about 1.6× anything the engine has run. [§ D527](../DECISIONS.md) names the five
measurements owed before the ruling is met: that a day at the reference runs under the event valve;
what one replication costs on a named machine, which bounds the live re-simulation, the survivor
count and every published interval; that the round-trip oracle holds at 10 m/s; that the stage can
draw 165 floors, which is design work; and that eight escalators change a decision, measured by hop
count before capacity or direction is added.

---

## 3. What this moves in the tree

Named so the next lane does not discover it. None of it is built by this page.

- `packages/viz/src/everyday/modes.ts`: four tiles become three, Scenario first. The *Today's
  tower* and *Fix a building* tiles retire into Scenario.
- **One scenario schema in `data/`**, `data/campaign.json`'s stage record plus a budget and its
  bought-budget steps, and the four content sources re-authored to it: ten stages, eighteen fix
  cases without their repair lists, six Engineer challenges, and the daily seed.
- **One price schedule in `data/`**, replacing the fix cases' `costUnits`, the campaign shop's tier
  prices and commissioning's `CapitalConstraint`.
- **A survivor count per scenario per budget step**, pre-simulated, pinned, published on the
  scenario, with its sampling method beside it where the space is sampled.
- **A chime ledger on the account**, with its sources and sinks authored in `data/`, a device-only
  fallback that says so, and the server checking a posted modified run against a real spend.
  **Partly built**: the ledger, the balance read, the earn, the spend route and the posted-run check
  ship, and the balance is read by Settings and paid by a filed contract day. The **device-only
  fallback** does not — see § 2.4 for the ruling it is waiting on — and **no screen spends a chime
  yet**, which the panel that lists the prices says on its own face (#371, #372).
- The stage's opening speed moves to a watching rung, reopening [§ D354](../DECISIONS.md)'s
  default, and a *skip to the end* control is added.
- ~~Two new intervention kinds, equipment and building changes, on the run record.~~ **Built**
  (GitHub issue #370): the kinds, their effects on the one service schedule, their price from
  `data/price-schedule.json` and the refusal that names the price and the budget. What is **not**
  built is the rung a player spends against — `scenario/budget.ts` is validated at load and read by
  nothing while a day plays — so no screen offers a purchase yet and the stage's own register says
  so. That remainder belongs to the survivor-count bullet above it.
- `docs/16`'s `ranked` row and `scope/runIdentity.ts` widen to carry recorded interventions and the
  run's modifiers, and the server's replay consumes them; boards are keyed by modifier set.
- The rush ships ([§ D515](../DECISIONS.md)); it gains a per-wave purse authored in its own data, recorded
  interventions on its round, and a postable result.
- The design handoff's § 5 session-shapes table names four modes and § 10 authors repair lists, and
  [`CLAUDE.md`](../CLAUDE.md) makes the handoff canonical for the interface. Both are deviations,
  recorded in [`12-design-handoff.md`](12-design-handoff.md) § 4 like every other one, with this
  page as the reason.
- [`32-game-design.md`](32-game-design.md) § 1.2's table and GD4, and
  [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 4, are superseded on the mode
  set; docs/32 § 3.1's *three currencies* gains a fourth, and its § 9 Q4 is answered. Their loop
  analysis stands; it is what a scenario, a career day and a rush round are each measured against.
- [§ D373](../DECISIONS.md) is superseded by [§ D525](../DECISIONS.md): *Fix a building* stops
  being a tile and becomes Scenario's first content.
- [`26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) § 10 non-goal 1 is amended by
  [§ D526](../DECISIONS.md) from *no monetisation of any kind* to *no purchase ships, and the ledger
  is built so one could be a source later*.
- The honesty corpus's strings move with the tiles. Measured once, after integration, on the
  integrator, per [§ D343](../DECISIONS.md).
- Career persistence is filed as engineering work against `career.ts`'s own stated cost.
- A reference building at 165 levels and 57 lifts is authored, and [§ D527](../DECISIONS.md)'s five
  measurements are taken before it is called carried; the stage gains a zoned or scrolled drawing,
  recorded as a handoff deviation.
- [`25-vertical-slice.md`](25-vertical-slice.md)'s slice is unchanged in content and its mode is
  renamed: one *today's scenario*.

## 4. What this does not change

The engine, the eight invariants, the statistical discipline, the correctness oracle, and the R1 to
R13 honesty properties. No scalar score over a run. No difficulty setting that moves a bar. No
number a run did not produce. No second engine: *live* is the stage's property, not the
simulator's. Nothing locked, ever, and no currency that buys access. The handoff still wins every
disagreement about what a screen looks like, and the simulator still wins every disagreement about
what a number means.

## 5. Rulings, and what is still open

Ruled by the owner on 2026-09-06, in conversation, and recorded in [§ D525](../DECISIONS.md),
[§ D526](../DECISIONS.md) and [§ D527](../DECISIONS.md):

1. Scenario is first on the menu, and its first one or two are doable with a tweak and failable
   with the wrong one.
2. The six Engineer challenges join Scenario as content.
3. No fixes are proposed to the player. A budget, the whole editor, and a price ladder that runs
   dispatcher, then equipment settings, then building.
4. Difficulty is the number of affordable configurations that survive, pre-simulated.
5. Every scenario and every rush plays live; speed and skip-to-end are for players who would rather
   not watch.
6. A rush round with mid-run changes is postable; the changes are recorded with their moments and
   replayed.
7. One currency across the modes, earned by completing turns and spent on a mode's modifiers.
   Nothing resets on time. No purchase ships; the account is built so one could later.
8. The model carries a building up to and slightly beyond the largest in the world, with the
   Burj Khalifa as the reference (§ 2.5).

Ruled later the same day, in the same conversation:

9. Difficulty is the survivor count budgeted by ladder position; the budget joins demand and fabric
   as a third substrate; four rules fold into one measurement; scarcity is a price and never a
   removed control ([§ D528](../DECISIONS.md)).
10. The first session is a two-screen tutorial, and a worked answer is permitted there and nowhere
    else ([§ D529](../DECISIONS.md)).
11. The currency is named **chimes** ([§ D530](../DECISIONS.md)).
12. The sign-in bonus **ships at launch**, in the one shape § D526 clause 7 permits
    ([§ D531](../DECISIONS.md)).

Nothing on this page is still open.

---

## Sources

- [`22-charter.md`](22-charter.md) — the pillars this page is built under, and § 6's precedence rule
- [`23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) — the five-beat loop and the honest register of modes
- [`26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) — § 10 non-goal 1, amended by § D526
- [`32-game-design.md`](32-game-design.md) — the four-mode declaration this page supersedes, the economy it keeps, and § 3.4's argument the currency borrows
- [`33-difficulty-curve.md`](33-difficulty-curve.md) — DC-R1, DC-2 and DC-3, which the survivor count is stated against
- [`35-problem-per-mode.md`](35-problem-per-mode.md) — what is portable about *Fix a building*, and the stage its cases gain
- [`16-change-scope-contract.md`](16-change-scope-contract.md) — § 0's whole-day-then-playback fact, and S5, the ranked-run rule the rush board widens
- `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 5, § 9 and § 10 — the session shapes, the rush mechanic, and the repair lists this page retires
- [`39-decisions-in-force.md`](39-decisions-in-force.md) — which older decisions this page supersedes, and the rename map
- [`DECISIONS.md`](../DECISIONS.md) § D131, § D167, § D214, § D344, § D354, § D373, § D456, § D458, § D477, § D486, § D504, § D505, § D506, § D507, § D509, § D512, § D514, § D515, § D518, § D525, § D526, § D527
