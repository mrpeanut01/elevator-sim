# The play-through audit — the game, mode by mode

**Companion to [`docs/16-change-scope-contract.md`](16-change-scope-contract.md), which is the rule
this document argues for.** § 16 says *when* a control may move. This one walks the product as a
player and says what each mode is for, whether it makes sense, what moves at each scope inside it,
and what its results page has to say. It ends with four modes that do not exist and an argument for
each.

The findings themselves are `docs/16` § 5 and the verdict is `DECISIONS.md` § D217. They are not
repeated here.

---

## 1. The game, whole

### 1.1 The object graph, as built

```
a game      one contract (c1–c8), which fixes the building
  └ a week  seven days; tenants +11 %/day, linearly; one event per day; bars that harden
      └ a day        one recorded run of 15/30/60/120 simulated minutes
          └ an attempt  a re-run of that day, because a control cannot steer one
```

Everything above the run is `packages/viz/src/shift/`. The run is `core`. The attempt did not exist
until this wave, and its absence is the single most consequential thing the audit found.

### 1.2 The fact the design has to be built around

`Simulation.run()` is one synchronous call that returns when the replication is over, and invariant
3 keeps the wall clock out of `core/`. There is no *now* inside a run.

**So the player never steers a day. They re-roll one.** Every control in the shell calls `runShift()`
when it moves, which is correct — and means the verb the player uses most is a retry that was, until
this wave, free, unlimited, unrecorded, and able to bank a scenario on a single Monday.

This is not a defect to design around. It is the genre. It is what makes the product a *simulator*
rather than a game about reflexes: you form a hypothesis, you change one thing, you re-run, you
compare. What was missing was the game admitting it.

### 1.3 The one real mid-run lever, and it is invisible

The simulator *does* have a mechanism that adapts inside a run: the weight-set selector
(`selection.policy`, over `patternSwitching`'s five patterns with a 120 s hysteresis). The dispatcher
detects up-peak, down-peak, two-way, interfloor or idle and switches weight vectors mid-run.

So the player's genuine within-day lever is **configuring an automatic policy in advance**, which is
a better mechanic than a slider — it is the difference between driving and designing a controller.
It is currently reachable from no mode's own surface, and § D145/§ D156 measured that the learned
version of it does not beat `collective`. That refusal is about the *learned* selector; the
hand-authored one is a shipped, working, hidden mechanic. **Recommendation: give it a surface.**

---

## 2. What changes when

The full table is `docs/16` § 2 and is derived in `packages/viz/src/scope/surface.ts`. The player-facing
summary:

| | What moves | Why there |
|---|---|---|
| **Presentation** | Casual/Engineer, theme, reduce motion, playback speed, energy axis, which tab and rail segment | Provably cannot change a run. Measured, not asserted: the legs must be byte-identical. |
| **Within a day** | Dispatcher weights, group levers, cars held out of service, saved machine classes | Re-runs today. **This is an attempt**, and the sheet now says which one. |
| **Between days** | The week itself — the day, the streak, what is banked | `day` drives growth and the day's event, so moving it mid-day changes the building under the run. |
| **Between games** | Building, contract, dispatcher, traffic template, arrival rate, run length, seed | The run's identity. Exactly what a leaderboard submission carries, and exactly what `provenanceLineOf` accepts. |

Two consequences worth stating plainly, because they answer the question this audit was asked:

- **Nothing is genuinely "inter-day" in the sense of changing something mid-run.** The engine cannot
  do it. What looks like a mid-day change is a new day-1-of-today.
- **The only true between-days decision the product has today is `nextDay` itself.** Everything else
  a player might want to decide overnight — book a maintenance window, reserve a goods car, order a
  faster machine — does not exist. That is the gap § 4 fills.

---

## 3. Mode by mode

### 3.1 Contract week — the game

**Verb:** *survive a week that gets harder.* Eight scenarios, one per shipped building, all open from
the start (`contractStatus` has no `locked` state, deliberately — *"scenarios teach, they do not
gate"*).

**Does it make sense?** Yes, and it is the strongest part of the product. Growth is a real building
edit through `parseBuilding`, not a header multiplier; goals read only observations, so they can be
graded on a day the building was outrun — which is the day a reader most needs a verdict; and the
bars harden on a schedule the player can see coming.

**What was wrong:** the retry banked. Fixed — a day banks once and a re-run replays it.

**What is still thin:** the week is seven days of the same thing with a rising number. `eventFor` is
the only variation and it is a five-item cycle keyed on the day index, so a player who plays two
weeks sees the same week twice. That is deliberate (it makes a week replayable) and it is also why
§ 4's calendar and incidents matter: the *shape* of a week should be able to differ.

**Its results page** is the Day report, and it is the best surface in the product. Observation-sheet
layout, one suppressible figure clearly marked `WITHHELD` with the run's own reason beside it, energy
drawn as two `unranked` cells. It now carries the attempt count.

### 3.2 Free play — one run, and the only postable one

**Verb:** *ask the simulator a question.* Six axes, all derived from `data/`.

**Did it make sense?** Not as built. It shared the campaign's week, so it silently inherited tenant
growth and the day's event; and its Start did not run anything. Both fixed — it now opens on day one
with a fresh week, and the screen says so in a sentence.

**What it is for, now that it works:** it is the mode where the player is the experimenter, and it is
the only mode whose runs can be posted, because it is the only one whose run is fully described by
its own selection. `nearest-car` is offered in it even though it is the weakest shipped dispatcher —
a profile that fails to beat the baseline is a result about that profile.

**Its results page** is the same Day report, and that is a *mismatch worth naming*: the sheet says
*"1 of 2 clean shifts banked"* and names a scenario, on a run that is banking nothing. The contract
line is honest when there is no contract, but the sheet is still shaped like a day of a week when
free play has no week. **Open finding — see § 5.**

### 3.3 Stage campaign — the laboratory, wearing the same name

**Verb:** *prove an improvement, over a batch.* Ten stages in `data/campaign.json`, each judged over
N replications against bars published in `data/scenario-goals.json`, with a per-stage editable
dimension set and four fail states each mapped to a suggested lever.

**Does it make sense?** As a teaching instrument, yes — it is the only place in the product where R2
can be discharged at all, because it is the only one that runs a batch. As a *mode*, it is confusing:
it is called Campaign, so is the contract week, and a third surface called Scenarios is a fourth
framing of the same idea.

**Recommendation:** rename in the interface. The contract week is the **Campaign**; the batch-judged
stages are the **Lab**. The scope model already separates them (`shift-week` against
`stage-campaign`); what remains is the two words on screen. Recorded as a decision rather than done
here, because renaming a surface the handoff drew is a disagreement the handoff should settle.

### 3.4 Compare — the only surface allowed to say one thing beats another

**Verb:** *settle it.* Paired-t over common random numbers, and it returns `INDISTINGUISHABLE` when
the interval contains zero.

**Does it make sense?** Completely, and it is the load-bearing surface for the whole product's
honesty: everything else may show a number, and only this may show a *verdict*. It should be reachable
from the report when a player asks "is this better?" — today they have to know it exists.

### 3.5 Ranked — a mode in the model, and barely one on screen

**Verb:** *post it.* Not a place a player goes; a property a run has.

**What was wrong:** `client.submit` had no caller at all, so the leaderboard could be read and never
posted to, and the Account row's own subtitle described something no player could do. Fixed.

**What is still wrong, and is a design question rather than a bug:** a board is keyed by a digest over
the building, the dispatcher, the template, the rate, the duration and the loaded `data/` —
everything **except the seed**. So every entry on one board is the same configuration on a different
seed, and picking a better dispatcher does not beat anybody: it moves you to a different board.

The competitive axis is therefore seed luck, and the skill axis forks the leaderboard. The screen now
says so plainly rather than letting the word *leaderboard* imply a ranking it is not — but saying so
is a mitigation, not a fix. § 4.3 is the fix.

### 3.6 Endless, and Sandbox

Both were strings. `c5`'s reward promised *endless mode* and nothing implemented it; `Sandbox`
appears in the coach ribbon when the building has no contract and no mode sits behind it. Two labels
that describe features. **They should be built or the strings should go**, and the first is better:
an endless week is `nextDay` with no contract and a growth curve that keeps going, which is close to
free.

**Endless is now built, and it is the smallest mode in the product on purpose.** `shift/week.ts`'s
`openEndless` opens a week carrying a contract id no contract answers to, and every consumer already
handled that — `contractById` returns `undefined` *"rather than a throw"*, `closeDay` banks the day
and clears nothing, and the report has a no-contract line. So the mode needed a *value*, not a
branch, and `menu/enterEndless.ts` is nine lines. If it were larger, that would be the signal that
endless had become a second day loop maintained beside the first one.

Two things it deliberately does not do. It does **not** re-pick the building: *keep going* means the
tower you have been learning, and a mode that re-selected would be Free Play with a different label.
And it does **not** clear the held cars or the levers, which `enterFreePlay` does — the argument
there was never S6 (`free-play` permits `within-day` too) but that the Free Play *screen* had just
described the run in six axes and a held car was not one of them. This screen describes nothing of
the sort.

One thing it did force. The no-contract report line read *"Your own building — nothing is being
banked"*, and endless reuses that path, so a player who pressed **Keep going** on Midtown Office
would have been told they were on their own building — false in the one way a reader acts on, since
they would go looking for the scenario they think they lost. Reusing the path is right; reusing the
wording is the cost of it, and the two sentences are now separate.

Sandbox stays open, and it is a different shape: endless was a missing *mode*, Sandbox is a missing
*meaning*. Nobody has decided what it is, and building the wrong thing is worse than the label.

---

## 4. Four modes worth building

Each is designed against the same constraints: difficulty is demand and building fabric, never a
fudge factor on a metric (`docs/10` § 5.5); a caption must describe the run under it; and every new
control lands with a test that moves it and requires the legs to change.

### 4.1 Incidents & maintenance — the seam that already exists

`BuildingConfig.serviceEvents` is `{ atS, carId, bankId?, mode }` — a **working mid-run service-mode
scheduler**, resolved in `config/parse.ts`, applied in `sim/`, seam-tested — and called by **no
shipped building**. It is a dead seam in `data/`, the same class as `destination-eta`'s
`rideTime: 0`, and it is the most game-ready thing in the repository.

Three incidents, all expressible today:

| | What it is | Scope |
|---|---|---|
| **Breakdown** | A car out from `t` to `t'`, drawn from a named stream so it replays | within-day |
| **Planned maintenance** | Announced on yesterday's report; **the player picks the window** | **between-days** |
| **Modernisation** | A car out for several consecutive days, returning at a better spec | between-games |

Planned maintenance is the important one: it would be the **first genuine between-days decision the
product has**. Today the only thing a player decides at a day boundary is whether to open the doors.

It also repairs a stated narrowing. `move-in`'s design note ends *"until 11:30"*, and `events.ts` had
to rewrite it to *"for the whole shift"* because the shift layer does not own the building the runner
receives. An incident layer does own it, so the note can go back to what the design wrote and be true.

**Fire alarm, stated honestly.** `fire-recall` exists as a *car mode* — a car in it parks and serves
nobody — but there is **no recall sequence**: no phase-1 return-to-entrance, no phase-2 firefighter
service, and `config/types.ts` says so in its own comment. What is shippable is a *recall drill*: all
cars sent to the entrance, then held for a window, with the demand swing `fire-drill` already applies.
That is worth building and worth labelling as a drill, because a caption implying Phase-1 firefighter
service over a run that does not simulate one is exactly the failure the honesty card exists to
prevent.

### 4.2 Calendar — seasons, holidays, a moving week

A **between-games** axis above the week: a period that sets a population factor and a directional-split
bias across a stretch of days, with per-day overrides.

- **Vacation** — occupancy well down, the split flatter. The week where the goals feel easy while the
  growth curve keeps rising underneath, which is a good lesson badly served by a flat difficulty ramp.
- **Public holiday** — one day at a fraction of demand.
- **Moving week** — `move-in` every day plus a reserved goods car; needs § 4.1 to be expressible.
- **Quarter-end** — demand up and a sustained evening egress, which is what `evening-egress` was
  authored for and has never been paired with a caller.

It attaches at exactly `growth.ts`'s seam — a real edit to a real `BuildingConfig` put back through
`parseBuilding`/`resolveBuilding`, never a multiplier on a header. And it finally makes `WEEKDAYS`
mean something: today only `dayIdx >= 5` does anything at all.

**Legality, up front:** § 5.5 bans *"a difficulty setting that changes anything other than declared
`TRAFFIC_PARAMETERS` and building fabric."* A calendar changes demand and fabric and nothing else, so
it is admissible — and the doc should say so rather than leaving a reader to wonder.

### 4.3 Daily challenge — the fix to the leaderboard

Everyone plays **the same seeds on the same configuration**, and the dispatcher is what varies. This
is the mode that makes a board mean something (§ 3.5).

Two design constraints shape it:

1. **The challenge is issued by the server, as data.** `core/` may not have a wall clock and the
   client's is not trustworthy for a competition. The server is already this repository's first wall
   clock (§ D214), so a challenge is an id, a configuration, a fixed seed set and an opens/closes
   pair, and the client never computes which challenge today is.
2. **A challenge is scored over a small fixed seed set, not one run.** The server already re-runs to
   verify; running the five seeds it names instead of one costs little and means the board is not a
   single-run verdict. Every row shows all four metrics unblended with its `n`, per R13.

**The tension, recorded rather than glossed.** § 5.5 bans *"a leaderboard ranking dispatchers from
single runs"*. Making the dispatcher the competitive axis points straight at that ban — which is why
the seed set is fixed and plural, why the `n` is on every row, and why **Compare remains the only
surface allowed to say one dispatcher beats another**. A challenge board says *"these players, on
these five seeds, in this order"*. It does not say a dispatcher is better, and it must never be worded
as though it did.

### 4.4 Commissioning and retrofit — the pre-week design phase

`data/elevator-specs.json` is already an upgrade tree with real gates (`maxRiseM`, `maxFloors`,
`doubleDeckPersonsPerDeck`), and `contracts.ts`'s rewards already read like unlock strings — *"one
spare shaft"*, *"two more shafts"*.

- **Commissioning** — before the week opens, choose shafts, machine classes and rated speeds under a
  declared constraint; then live with them all week. Pure between-games, and the mode that makes the
  handoff's reward strings mean something.
- **Retrofit** — the inverse: the fabric is fixed and only dispatch may move. This is what makes
  *"geometry beats dispatch at scale"* land as a lesson, because it takes the geometry away.

**The decision this needs made out loud:** a capital constraint is a *limit on the configuration* and
never a *metric*. § 5.5 bans grade letters, efficiency scores and energy scores; it does not ban a
budget you build against. The failure mode is a currency that quietly becomes a score, and the way to
avoid it is that the number is spent before the week and never displayed as an outcome.

---

## 5. Open findings this wave did not close

Each is a real thing found by walking the product, left with an owner rather than absorbed.

1. **The Day report is shaped like a day of a week even in free play.** It names a scenario and a
   banked count on a run banking nothing. The lines are individually honest; the sheet is the wrong
   shape.
2. **Two surfaces called Campaign, and a third called Scenarios.** The scope model separates them;
   the words on screen do not. § 3.3.
3. ~~**The leaderboard's competitive axis is the seed.**~~ **Closed.** § 4.3's challenge board is
   built and wired end to end ([§ D218](../DECISIONS.md) is the criterion, dated before the code):
   the server fixes the building, the traffic, the run length and a seed set, and the dispatcher is
   what varies. The config board stays and keeps saying what it is. The § 5.5 tension is answered
   structurally rather than promised — a seed set with its `n` on every row, four metrics never
   blended, and Compare still the only surface allowed to order two dispatchers.
4. ~~**`showEnergyAxis` and `theme` reach nothing**~~, and were carried in a register with a
   staleness assertion so an entry could not outlive its bug. **Both closed**, and the register is
   pinned empty rather than deleted — an empty list nothing checks is how a list stops being read.
   `theme` took two waves: the shell first, then the stage, because a light shell around a dark
   stage is the same defect wearing a smaller radius.
5. **Sandbox is a string with no feature behind it.** Endless is built — § 3.6.
6. ~~**The weight-set selector has no surface**~~ — **closed, and mounting it found that half the
   seam did not exist.** A profile's `selection` block already reached a run; `patternSwitching` was
   loaded, carried, and writable by nothing in the viewer, so an arm-map editor over it would have
   been a slider on a dead seam. Two of the six sliders were inert at the default cell and each now
   names its own operating point and the reason — findings about the shipped calibration, not about
   the panel.
7. ~~**Compare is unreachable from the moment a player wants it** — the report never points at it.~~ **Closed.** `ReportNextStep` is on `DayReport`, so *both* sheets carry it: the pointer was first built for the Free Play sheet alone, which answered the finding for the mode that provokes the question least. A player finishing a campaign day has just read a levers card saying *try a different dispatcher — a smarter one is free*, and the sheet's own small print refuses to answer it.

---

## Sources

- [`docs/16-change-scope-contract.md`](16-change-scope-contract.md) — S1–S10, and the failing clauses.
- [`docs/10-experience-layer-contract.md`](10-experience-layer-contract.md) — R1–R13, § 5.4's
  progression, § 5.5's prohibitions.
- [`docs/12-design-handoff.md`](12-design-handoff.md) — canonical for the interface; § 5 clause 9.
- [`DECISIONS.md`](../DECISIONS.md) § D106, § D131, § D145, § D156, § D177, § D213, § D214–§ D217.
