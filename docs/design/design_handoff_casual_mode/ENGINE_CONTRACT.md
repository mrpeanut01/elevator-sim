# Engine Contract — Everyday Mode

*Every number, formula, seed and edge case behind `GAMEPLAY_AND_NAVIGATION.md`.*

The gameplay guide says what the player does. This says what the machine computes. Section
references in the form §8.6 point at the gameplay guide.

Two standing rules:

1. **Determinism first.** Every figure a player can compare with another player must come from a
   seeded, replayable run. If it cannot be replayed, it cannot be posted.
2. **One source per figure.** A number appears in exactly one expression and every screen reads
   that expression. Two computations of "cleared days" is a defect, not an optimisation.

---

## 1. Determinism and seeds

| Stream | Seed | Notes |
|---|---|---|
| Today's crowd | `424242` | printed on the door and brief as `crowd 424242 · everyone identical` |
| The rush | `90210` | one stream, generated once; two dispatchers face identical waves |
| A replay of a past day | that day's seed | a replay must reproduce the original crowd exactly |
| Bench, per test per rep | `hash(testId, repIndex)` | **the same for every entrant** — that is what "matched crowds" means |
| Gauntlet, 40 cases | `hash(towerId, crowdIndex)` | fixed forever; a rating is only comparable if the cases never move |

Generator: a 32-bit linear congruential sequence, `s = (s * 1664525 + 1013904223) >>> 0`,
returning `s / 2^32`. Any replacement must be equally cheap and equally reproducible across
platforms — no `Math.random`, no time-seeded state, no floating-point accumulation order that
differs between builds.

**The day generator's output must be pinned to a commit** (§17). If two clients disagree about
what Tuesday was, every world figure is worthless.

### 1.4 The run record, and interventions

A run is not a stream of mutations. It is a record:

```
run          = { seed, config, interventions: [ { atS, change } ] }
```

When the player intervenes at simulated second `atS` (guide §7.6), append the event and
**re-simulate the whole day from t = 0**, then resume playback at the same playhead. Everything
before `atS` is bit-identical by construction, so nothing on screen jumps; only the future
changes.

This keeps three properties that matter:

1. **Determinism.** One seed plus one config plus one ordered log always produces one day.
2. **Replay verification.** The server re-simulates the record, log included, and refuses a
   submission whose metrics do not reproduce.
3. **Comparability.** Two players' runs are comparable because the crowd is identical and the
   log is part of what is being compared.

The cost is affordable and has been measured (#116): a full simulation is **181 ms** on Garden
Apartments, **828 ms** on Midtown Office, **1,521 ms** on Vertical City, and the bench runs 100
simulations in **4.3 s** warm in the browser. Re-simulate synchronously below ~400 ms; above it,
show a `recomputing` beat rather than freezing.

An intervention **never** invalidates a run. Changing the tower, the machines or the crowd does —
that is a sandbox run, and the distinction is between changing the building and changing your
mind.

### 1.5 Replaying somebody else's run

The record is also the unit of spectating. `Watch it` on a board row fetches that run's
`{ seed, config, interventions[] }` and replays it locally — the identical computation the
server performs to verify a post, which is why the pill can honestly say *verified by the
server*.

- The spectator's own run state is untouched: no `dayClosed`, no posting, no scoring, and
  stopping the watch restores whatever they had.
- Interventions are **replayed, not offered**. The intervention API is disabled in this context;
  playback controls (pause, the five speeds) are not interventions.
- A run whose record fails to reproduce its posted metrics is not shown. A row that cannot be
  replayed loses its `Watch it` button rather than replaying something approximate.

---

## 2. The daily fixture

Chancery House, as the prototype runs it:

```
FLOORS      14 (0 = ground, drawn as G)
SHAFTS      3  (A, B, C)
OPEN        06:00      CLOSE 19:00        → 46,800 simulated seconds
TENANTS     G Lobby · 1 Post room · 2–3 Ashby & Co · 4–5 Verity Press ·
            6–7 Kestrel Labs · 8 Sixth floor cafe · 9–10 Marlow Legal ·
            11–12 Halden Group · 13 Roof plant
POPULATION  1,180
CARS        13 people, 2.5 m/s rated, 3.4 s dwell, 1.1 m/s² acceleration
WRINKLE     shaft C (index 2) out of service until 12:00
```

Shaft C returns at exactly `12 * 3600`. While out it is drawn dashed, holds no riders, takes no
assignments, and any passenger already assigned to it is reassigned on the next tick.

The sandbox flag (`allShafts`) suppresses the outage; a sandbox run is never posted.

---

## 3. Arrivals

### 3.1 The daily stream

Generated once, ahead of the run, in two-second buckets from 06:00 to 19:00. For each bucket:

```
phase        = phaseOf(minuteOfDay)
expected     = phase.rate * 2 / 3            // people in this two-second bucket
k            = floor(expected) + (rand() < frac(expected) ? 1 : 0)
for each of k:
    up       = rand() < phase.upShare
    other    = 1 + floor(rand() * (FLOORS - 2))     // 1..12, never the roof plant
    push { t, from: up ? 0 : other, to: up ? other : 0 }
```

| From | Until | Phase | rate | upShare |
|---|---|---|---|---|
| 06:00 | 08:00 | Early | 0.10 | 0.90 |
| 08:00 | 09:30 | Morning rush | 0.95 | 0.92 |
| 09:30 | 12:00 | Steady | 0.22 | 0.50 |
| 12:00 | 14:00 | Lunch | 0.62 | 0.42 |
| 14:00 | 16:30 | Afternoon | 0.26 | 0.50 |
| 16:30 | 18:30 | Going home | 0.80 | 0.08 |
| 18:30 | 19:00 | Winding down | 0.08 | 0.20 |

`phaseOf` also supplies the stage's phase pill, so the label and the arrival rate can never
disagree.

Every journey in this model touches the lobby or the roof-plant-free upper floors; genuine
floor-to-floor traffic (`from` and `to` both above ground) is a **required extension** — the
building desk already charts it (§8.2) and the tuner already exposes `lobbyShare`. When it is
added, `lobbyShare` chooses the split and `phase.upShare` applies only to the lobby portion.

### 3.2 The rush stream

Ninety minutes, two-second buckets, `wave = floor(t / 180)`:

```
expected = (0.34 + wave * 0.11) * 2 / 3
upShare  = 0.62 (constant)
```

Arrivals climb about 11% of a normal morning's rate every three minutes, forever. The setup
screen's bands (§9.1) are labels on this ramp, not separate content.

Wave numbering shown to the player is `floor((t − OPEN) / 180) + 1`, so the first three minutes
are "wave 1".

---

## 4. The simulation step

One `step(dt)` per slice, `dt ≤ 0.5` simulated seconds. Order is load-bearing.

### 4.1 Admit arrivals

Everything with `t ≤ now` joins its origin floor's queue as
`{ to, born: now, assigned: null }`.

### 4.2 Patience

For every waiting person, track `waited = now − born`; keep the run's maximum as **the longest
anybody stood**. A person on floors 0–3 who has waited **more than 210 s takes the stairs**:
remove them, increment `gaveUp`, and draw them grey for the remainder of the frame.

Only the lower floors have a staircase in this model. When the real building model lands, the
threshold and the eligible floors come from the building, not from a constant.

### 4.3 Assignment

Every waiting person with no assignment, or whose assigned car has gone out of service, is
assigned to the car with the lowest cost:

```
cost =   w.dist     * |car.y − floor|
       + w.load     * (riders / capacity) * 8
       − w.patience * waited * 0.05
       + w.lobby    * (car is idle and floor is the lobby ? −1.2 : 0)
       + w.spread   * (car already has riders ? 2.2 : 0)
```

Out-of-service cars are skipped. Lowest cost wins; ties go to the lower shaft index.

This is the four-lever reduction of the full thirteen-term function (§6). It is the sketch, and
§20.1 of the gameplay guide replaces it with the full vector. When it does, **this five-term
expression must remain derivable from the vector** so the *show me the maths* line stays honest.

### 4.4 Car loop

Per car, in order:

1. If out of service: empty it, clear its target, close its doors, skip.
2. If dwelling: count down, open the doors (`door` 0→1 at 1.6/s), skip. When the dwell expires
   the doors are considered shut.
3. If the doors are still closing: close them (1.6/s), skip.
4. If there is no target, choose one:
   - the nearest destination among its riders, or
   - the nearest floor with a person assigned to it,
   - whichever is closer; the riders' stop wins a tie;
   - if neither exists and the lobby-anchor weight is above 0.5, return to the lobby;
   - otherwise coast to a stop.
5. Travel: `stopDist = v² / (2 · accel)`. Within `max(0.04, stopDist)` of the target, arrive.
   Otherwise accelerate toward `±vmax` at `accel · dt` and integrate position.
6. On arrival: alight everyone whose destination is this floor (`carried += n`), then board from
   the queue up to capacity, preferring people assigned to this car. For each boarder record
   `waited`, add it to the running sum, count it as **away** if `waited ≤ 60`. Set
   `dwell = base + 0.55 · boarders`.

### 4.5 Sampling

Every 240 simulated seconds push `{ t, away, standing, wait }` where `wait` is the mean wait of
the people standing **right now** (0 if nobody is). This is the race strip's data (§7.4) and
nothing else may resample it.

### 4.6 Real-time pacing

```
speed index  1     2     3     4     5
label        ½×    1×    4×    12×   30×
sim s / real 8     30    90    240   600
```

Per animation frame: `budget = min(0.05, elapsed) * multiplier`, consumed in slices of ≤ 0.5 s,
stepping **both** sims (yours and the ghost's) by the same slice. A day at `1×` is about 26
minutes of real time; at `30×`, about 78 seconds.

Every run **enters paused** at 06:00 with its first frame drawn, and **speed is not inherited**:
it resets to the player's `Default speed` setting at the start of each run. A day must never
vanish in three seconds because the previous one ended at 30×.

The label array and the multiplier array must be the same array indexed twice, never two lists
(§20.12).

---

## 5. Run metrics

| Figure | Expression | Shown as |
|---|---|---|
| away inside a minute | `away / boardedCount` | `81%` |
| the longest anybody stood | `max(waited)` over the whole run | `134 s` |
| standing right now | `Σ queue lengths` | `47` |
| average wait right now | `Σ waited / count` over people standing | `52 s` |
| people carried | count of alightings | `1,043` |
| took the stairs | `gaveUp` | `9` |
| trips | count of car departures under load | `486` |
| peak lobby queue | `max(queue[0].length)` | `31` |

`away` must be counted **at boarding**, never estimated from the queue, or a run that ends with
people still standing will flatter itself.

---

## 6. The dispatcher

### 6.1 The four plain levers

Stored 0–100, default `{ patience: 30, lobby: 20, spread: 30, load: 40 }`. They scale the
style's base vector:

```
dist     = base.dist
load     = base.load     * (0.4 + load     / 60)
patience = base.patience * (0.4 + patience / 40)
lobby    = base.lobby    * (0.4 + lobby    / 40)
spread   = base.spread   * (0.4 + spread   / 50)
```

`leversMoved` counts levers differing from the defaults above; the nameplate reads it as
`2 of 4`.

### 6.2 The six play styles

| Style | dist | load | patience | lobby | spread | The trade |
|---|---|---|---|---|---|---|
| Steady hand | 1.0 | 0.4 | 0.3 | 0.2 | 0.3 | nothing clever, nothing stupid |
| Lobby anchor | 0.8 | 0.5 | 0.4 | 1.3 | 0.4 | fine at 8am, expensive at 3pm |
| Chase the longest wait | 0.5 | 0.3 | 1.4 | 0.2 | 0.5 | nobody waits long, everybody waits a little longer |
| Fill them up | 0.9 | 0.1 | 0.4 | 0.3 | 1.2 | fewer trips, less wear, a longer first wait |
| Spread out | 1.1 | 0.6 | 0.5 | 0.1 | 1.4 | good scattered, worst when everyone wants one floor |
| Ask where they are going | 0.9 | 0.7 | 0.8 | 0.5 | 0.9 | the biggest single win on a busy morning |

Steady hand is the yardstick: the plain baseline ghost, the ladder's reference row, and the
fallback when no rule fits.

### 6.3 The thirteen cost terms

Weights 0–100. Defaults marked ● are the four shown before *show every term*.

**Where these words live.** The name, the `serves` clause and both end labels below are
**properties of the model, not of the screen**: they are declared beside each term in `core`'s
dispatch parameters (as `CostTermSpec` already does) and Everyday Mode reads them. The same rule
covers hard constraints, which need a player-facing name and a one-clause effect added beside
their existing optimizer-facing description — two fields, two readers, never one string serving
both (#147). A table in the renderer mapping ids to friendly prose is forbidden; it goes stale
the day a parameter is added. The table below is therefore a **transcription of the model's
current values for reference**, not a source of truth to copy into a component.

| Key | Name | Serves | 0 | 100 | Default |
|---|---|---|---|---|---|
| `wait` ● | wait time | average wait | let a few wait long | nobody waits long | 100 |
| `ride` | ride time | time to destination | short waits, long rides | straight to the floor | 0 |
| `detour` | detour penalty | fairness to whoever is aboard | pick up on the way | never divert a loaded car | 0 |
| `diversion` | diversion detour | fairness to the boarded without taxing untouched traffic | divert freely | protect the people aboard | 0 |
| `existing` | existing call delay | the good of the whole group | answer this call | protect the calls already made | 0 |
| `reversal` ● | direction reversal | how the cars behave together | change direction freely | finish the sweep first | 0 |
| `load` ● | load factor | leaving room in a car | cram them in | leave room to board | 40 |
| `stops` | stop count | energy, and a stopping trip's annoyance | stop wherever it helps | fewer stops, longer walks | 0 |
| `distance` | distance travelled | energy, roughly | run the motors hard | save the motors | 0 |
| `starvation` ● | starvation | the worst wait rather than the average | optimise the average | protect the worst wait | 30 |
| `zone` | zone affinity | zoning strategies | ignore the zones | hold each car to its zone | 0 |
| `predicted` | predicted demand | pre-positioning | react only | move before the crowd does | 0 |
| `crowding` | crowding | parallel service | one car per call | send help to a busy floor | 0 |

The header counts weighted terms: `the 13 cost terms — 4 weighted`.

### 6.4 Behaviour flags

| Key | Name | On means |
|---|---|---|
| `pool` | Pool riders by destination | ask where they are going and group the car; fewer stops per trip, a longer wait in the lobby |
| `sensor` | Read the load sensor | a car over **80%** full is offered no new calls; off, it stops and the doors open on a wall of backs |

Group levers apply to whoever is driving, because they are properties of the installation:

| Key | Name | On means |
|---|---|---|
| `park` | Park the cars in the lobby before the rush | kills the first wait of the morning, costs a little motor time all day |

`dwell` (`snappy`/`normal`/`patient`) is an override of the building's door timing and is
labelled as a change to the building, not to the dispatcher. With no chip pressed there is no
override.

**Zoning and service ranges are not dispatcher settings.** They live in Design a building and in
each Fix-a-building case's editor.

### 6.5 Traffic-pattern switching

| Mode | Behaviour |
|---|---|
`one` | one vector for the whole run; the detector is never built |
`auto` | the detector runs and swaps to the canned weights named for the pattern |
`mine` | the detector runs and every pattern uses the vector currently being edited |

Detector parameters:

| Key | Range | Meaning | 0 end | max end |
|---|---|---|---|---|
| `hold` | 30–600 s | stick with a decision for at least | switches on a whim | rides out a false alarm |
| `judge` | 60–900 s | judge the traffic on the last | reacts to a single minute | slow to notice a real change |
| `wLobby` | 0–3 | weight given to lobby arrivals | blind to the morning intake | calls up-peak at the first queue |
| `wInter` | 0–3 | weight given to floor-to-floor trips | ignores meeting traffic | reads a quiet lobby as interfloor |
| `wDown` | 0–3 | weight given to people heading down | misses the evening | calls down-peak at the first leaver |
| `margin` | 0–50% | how much better a new pattern must look | changes its mind readily | holds what it has, right or wrong |

The five patterns, with the conditions the detector uses:

| Pattern | Detected when | Character |
|---|---|---|
| up-peak | the lobby is filling and few people are heading down | queue forms in the lobby and almost nowhere else |
| down-peak | the lobby is quiet and a lot of people are heading down | queue forms on every floor at once, cars come down full |
| two-way | the lobby is filling **and** a lot of people are heading down | a car is rarely empty in the direction somebody needs |
| interfloor | people are moving between upper floors | meeting-heavy afternoon, quiet lobby |
| idle | lobby quiet, upper floors quiet, few heading down | whatever the cars do, they are waiting for the next person |

Each pattern binds to a dispatcher whose weights run while it holds. Under `one` the whole block
is inert and the copy says so.

### 6.6 Rule compilation

`ruleList` rows are evaluated top to bottom every assignment tick; **the first row whose
condition holds wins** and its action applies for that tick. Every row's `moves` label names the
lever it adjusts, and the adjustment must be the one the label claims. The condition and action
vocabularies are in §11.5 of the gameplay guide, with their value lists.

Copy rule: value-carrying phrases are templates with a `{v}` placeholder. Never concatenate.

Fallback, always printed: `If no rule fits, <style name> decides.`

---

## 7. Daily tests (campaign)

Per difficulty (§8.6). A day is **cleared only if all four hold**, evaluated at close from the
run:

```
away    ≥ tests.away        (as a percentage of boarders)
worst   ≤ tests.worst       (seconds)
queue   ≤ tests.queue       (peak lobby queue length, any instant)
trips   ≤ tests.trips       (loaded car departures)
```

Failing any one increments `missed`. Exceeding `diff.miss` ends the contract.

The "was" figure beside each test is the same four measurements from this building's previous
day, or `—`.

---

## 8. Campaign economy

### 8.1 Days and money

```
dayIdx        = tower.day − 1                       // 0-based
cleared       = max(0, tower.day − 1 − tower.missed)
missedDays    = the last `missed` days before today
earnedSoFar   = Σ over past, non-missed days of diff.rates[floor(d / 5)]
carriedIn     = carry[tower] ?? diff.purse + round(tower.months * 3.5)
committed     = Σ cost of every tier owned or booked
purse         = max(0, carriedIn + earnedSoFar − committed)
perfectMonth  = diff.purse + Σ (rate × 5)           // standard: 8 + 90 = 98
shopTotal     = 324
```

Rates step every five days: `diff.rates[0]` for days 1–5, `[1]` for 6–10, and so on.

### 8.2 The shop

| Category | L1 | L2 | L3 |
|---|---|---|---|
| Doors | Faster doors · 4 u · 0 nights | Better sensors · 9 u · 1 | Advance opening · 16 u · 2 |
| Control | Zone the tower · 6 u · 1 | Destination panels · 13 u · 2 | Full destination dispatch · 24 u · 3 |
| Machines | 4.0 m/s · 14 u · 2 | 5.0 m/s softer ride · 25 u · 3 | Gearless 8.0 m/s · 40 u · 5 |
| Car size | 16-person · 18 u · 3 | 21-person · 32 u · 4 | — |
| Shafts | A fourth car · 34 u · 8 | A fifth car · 54 u · 10 | — |
| The tenants | Queue marshalling · 5 u · 0 | Staggered start times · 10 u · 0 | Move a tenant floor · 20 u · 4 |

Buying rules:

- A tier requires the tier below it (`needs level 2 first`).
- Money leaves the purse **when booked**, not when it goes live.
- Zero-night items are fitted immediately and work tomorrow.
- A booking of *n* nights starting on day *s* is legal when `s ≥ dayIdx`, `s + n ≤ 20`, and no
  other works occupy those days.
- Kit is **live** when `s + n ≤ dayIdx`; before that it is `booked`/`pending` and the row prints
  `works day s..s+n−1 · live on day s+n+1`.
- A works day takes a car out for that day's peak, and the day still has to clear.
- `ready on day N · M days of benefit` where `M = 20 − (dayIdx + nights)`; if `M ≤ 0` the row
  reads `works run past the contract` and is refused.

### 8.3 Wear, service and failure odds

```
wear      = min(1.3, trips / serviceAt)             // serviceAt ≈ 45,000 trips
odds      = 0.4 + 7.5 · wear^2.4 + 3 · max(0, refit − 0.6)      // % chance of a failure a day
freshOdds = 0.4
daysLeft  = round((serviceAt − trips) / 1400)
```

Head thresholds: `> 0.85` **Service window due** (terracotta) · `> 0.6` **Wearing in** (amber) ·
else **Recently serviced** (moss).

Booked works reduce the odds:

```
relief = Σ  (catId === 'machines' ? 0.55 : catId === 'doors' ? 0.2 : 0.08) × level
after  = max(0.4, odds × max(0.25, 1 − relief))
```

At ~85% of refit life the building starts failing inspections and wants a **refurbishment**:
46 u, ten nights, resets the wear clock.

### 8.4 Standing, slots and risk

```
standing  = stage.carry + Σ over towers (cleared × 2 − missed × 3)
slotsOpen = count of SLOTS whose threshold ≤ standing
SLOTS     = 0 / 14 / 30 / 60 / 110 / 180
atRisk    = towers with day < 19 and missed ≥ diff.miss
```

An offer is takeable only when `slotsOpen > towersHeld` **and** `atRisk === 0`. The card names
which condition blocks it and by how much.

### 8.5 Renewal pricing

```
clearRate = cleared / (day − 1)
bonus     = clearRate ≥ 1.00 ? +2
          : clearRate ≥ 0.90 ? +1
          : clearRate ≥ 0.75 ?  0
          :                    −1
offered   = max(2, tower.rate + bonus)
complexity = garden 1 · ashgate 2 · chancery 2 · crown 3 · midtown 3 · stjude 4 · vertical 5
```

The desk states the offer, the record (`94% of days cleared · complexity 3 of 5`) and the
reasoning, including the sign of the bonus.

### 8.6 The rolling calendar

```
SPAN      = 30 columns
CAL_FROM  = max(1, careerToday − 23)                 // window slides, never widens
start(t)  = careerToday − (t.day − 1)                // this building's contract day 1
end(t)    = start(t) + 19
```

For a column `c` inside `[start, end]`, the building's own day is `d = c − start + 1`. Marks:
today ▢ · decision due ! · works ⚒ · flagged event ⚑ · past cleared ✓ · past missed ×.
`missedHere` is `d > t.day − 1 − t.missed` among past days.

**Emit the column count from the same value as the cells.** Two constants drift.

---

## 9. Fix a building — scoring

The prototype's closed-form model, kept here because the pass conditions and the copy depend on
its shape. §20.7 replaces the inputs with real paired runs; the thresholds do not change.

```
base       = the case's as-built spec { cars, speed, dwell, cap }
gCars      = max(0, cars  − base.cars)
gSpeed     = max(0, round((speed − base.speed) / 0.5))
gCap       = max(0, round((cap   − base.cap)   / 2))
gDwell     = round((base.dwell − dwell) / 0.5)          // positive = quicker doors

capital    = gCars × 34 + gSpeed × 6 + gCap × 8 + dispatcherCost
spent      = Σ cost of selected repairs and extras
total      = spent + capital

machFix    = gCars × 0.30 + gSpeed × 0.04 + gCap × 0.03
             + max(0, gDwell) × 0.03 + dispatcherFix
miss       = Π (1 − repair.fix) × (1 − min(0.9, machFix))
complaint  = round((1 − miss) × 100)                    // % of the complaint gone

restDelta  = Σ repair.rest + gCars × 4 + gSpeed + gCap + gDwell + dispatcherRest
awayAfter  = clamp(awayBefore + complaint/100 × (target − awayBefore) + restDelta, 5, 99)

pass       = complaint ≥ 80  AND  restDelta ≥ −2  AND  total ≤ budget
```

Dispatcher choice in the editor:

| Choice | Cost | fix | rest |
|---|---|---|---|
| as it runs today | 0 | 0 | 0 |
| a stock style | 0 | 0.10 | +2 |
| one of yours | 3 u | 0.20 | +4 |

Editor pricing: **a shaft 34 u · speed 6 u per 0.5 m/s · capacity 8 u per 2 places · dwell,
zones, service ranges and parking free.** Speed and capacity sliders are capped live at what the
remaining budget allows, and say `at the budget` when they are. A repair that would take the
total over budget cannot be selected.

Budgets run 10–16 u per case; the diagnosed fix costs 0–9 u; a new shaft is 34 u in every case
and never affordable.

Standing extras, offered in every case, none of which fix anything: traffic survey 3 u · landing
indicators 4 u · car interiors 5 u · call-out cover 6 u · tenant notices 1 u.

---

## 10. Design a building — the specification calculation

This is a traffic-analysis calculation, not a simulation, and it is allowed to stay analytic —
but it must be the same code the engine uses to size a group.

```
rise        = floors × floorToFloor
capPeople   = round(ratedLoad / 75)                     // 75 kg a person
zones       = the zone list (default: one per shaft, round-robin)
stops       = max(2, min(floors, round(floors / zones.length × 0.5)))

rampTime    = v / accel + (v / jerk) × 0.35
travelTime  = 2 × rise / v + stops × rampTime
stopTime    = stops × (doorOpen + doorClose + levelling + dwell)
rtt         = round(travelTime + stopTime + 8)          // +8 s of lobby transfer
interval    = round(rtt / cars)

population  = Σ over lettable bands: floorsInBand × capacityPerFloor × occupancy
designCap   = floors × capacityPerFloor
hc5         = round(cars × capPeople × 0.8 × (300 / rtt))   // people carried in 5 minutes
hcPct       = round(hc5 / population × 1000) / 10
```

`stopTime > travelTime` prints *round-trip time here is dominated by stops and door time, not by
speed. A faster machine buys very little.*; otherwise *dominated by travel. Speed and rise are
what you are paying for.*

Warnings, in priority order:

1. class limits: `floors > class.maxFloors` or `rise > class.maxRise`, naming both numbers;
2. `hcPct < 11` — *an office building will feel slow every morning*;
3. `interval > 40` — *reads as a long wait, whatever the average says*.

### 10.1 Machine classes

| Class | Speeds (m/s) | Max floors | Max rise | Loads (kg) | accel | jerk | door open | door close | levelling |
|---|---|---|---|---|---|---|---|---|---|
| Hydraulic | 0.5 · 0.75 | 6 | 18 m | 630 · 1000 · 1600 · 2500 | 0.5 | 0.8 | 2.4 | 3.2 | 1.2 |
| MRL gearless | 1 · 1.6 | 12 | 45 m | 630 · 1000 · 1275 | 0.8 | 1.2 | 1.9 | 2.7 | 0.4 |
| Geared traction | 1 · 1.6 · 2.5 | 20 | 75 m | 1000 · 1275 · 1600 · 2000 · 2500 | 0.9 | 1.3 | 1.8 | 2.6 | 0.5 |
| Gearless traction | 2.5 · 3.5 · 5 · 7 | 45 | 170 m | 1275 · 1600 · 2000 · 2500 | 1.1 | 1.6 | 1.6 | 2.4 | 0.2 |
| High-speed gearless | 7 · 8 · 10 | 120 | 500 m | 1600 · 2000 · 2500 · 3000 | 1.2 | 1.8 | 1.5 | 2.3 | 0.15 |

Speed and load are **steps within the class**, never free numbers. The five characteristics are
editable per class, per design, and revert with `back to standard`.

Automatic class choice, used until a shaft is overridden:

```
duty === 'goods'  → floors > 20 ? geared : hydraulic
travel ≤ 18 m     → hydraulic
travel ≤ 45 m     → MRL gearless
travel ≤ 75 m     → geared traction
travel ≤ 170 m    → gearless traction
otherwise         → high-speed gearless
```

where `travel` is the top of the shaft's zone × floor-to-floor.

### 10.2 Service ranges

A shaft serves: its zone's bands, plus the floor it calls at when idle, unless it is a
**shuttle**, in which case it opens at its two terminals only. A shaft that would serve nothing
falls back to the lobby. A basement exists only if a shaft is given it — otherwise the car park
is drawn and unservable, which is case 6's whole lesson.

A hand-drawn service column overrides the zone and marks that shaft `drawn by hand`; changing
its zone or shuttle state clears the override, because the two cannot both be true.

Floors a shaft **passes without stopping** are those between where it calls and the bottom of
its zone. They are drawn dashed, and they are why an express that stops everywhere is legible on
screen.

---

## 11. Bench statistics

Per test, per entrant, run `reps` matched days. Crowd `k` of test `t` uses the same seed for
every entrant.

```
awayᵢ      = mean away-inside-a-minute over reps
worstᵢ     = max longest-wait over reps
winsᵢ      = tests where entrant i's away ≥ every other entrant's
```

With **exactly two** entrants, report the paired difference:

```
dₖ         = awayₖ(A) − awayₖ(B)          per matched crowd
mean       = mean(d)
interval   = mean ± t(0.95, n−1) × sd(d) / √n
verdict    = interval contains 0  →  "Too close to call"
             else                 →  A or B ahead by round(mean) points
```

Print the interval in words: `between −1.4 and +3.1 points · zero is inside`. Below thirty reps
the screen states that the bench can rarely tell anything apart. **Never present a two-run
subtraction as a comparison.**

The prototype fakes cell scores with a stable string hash so the same dispatcher on the same
test always scores the same. Keep that property when the real runs land: identical inputs,
identical output, cached.

---

## 12. World figures and the boards

Every world figure is a **replay-verified aggregate** or it does not ship. The prototype's
authored ones, and what replaces them:

| Fixture | Replace with |
|---|---|
| `14,203 people played this tower yesterday` | count of verified posts for that day |
| `78%` middle player, `3 m 21 s` worst | the day's median and max across verified posts |
| the two histograms | binned distributions of the same posts |
| `styleSplit` | share of posts by starting style, captioned *not a ranking* |
| board rows | top verified posts, your row inserted at its real rank |
| ladder rows | gauntlet ratings; reference runs labelled `reference run` |
| `RUSH_BESTS` | furthest verified wave per dispatcher |

Percentile, once the day is closed: your away figure against the day's distribution, expressed
as `better than N% of today's players`. Withheld entirely before close.

Posting is suppressed when: `noPost` is on · the run is a sandbox run · the run is a replay of a
past day · the day was not closed by *Close the day* · the tower, machines or crowd differ from
the day's fixture.

### 12.1 Board keys

```
daily board key  = date                      // one board a day, everybody on it
ladder key       = dispatcher id             // scored as a mean over the fixed 40 cases
personal log     = anything else
```

**No player-settable parameter may enter a board key.** A key of building × dispatcher ×
traffic template × arrival rate × run length fragments into thousands of one-entry boards where
everyone is permanently first. Arbitrary configurations post to a personal-record log instead.
Rows within a board must have met the identical crowd, or the sort is a ranking of luck.

### 12.2 The withheld matrix

Four independent reasons a figure is withheld — day not closed, replay, sandbox, `noPost` — and
they combine. The honesty sweep must **enumerate these from the state model** (guide §18) rather
than from hand-written fixtures, across Your week, the board, the ladder, the percentile line and
the report (#145). Every combination renders `—` or a labelled unavailable state; none renders a
zero, a spinner or a stale figure.

With the API unreachable, every world figure renders a labelled *world figures unavailable*
state and the screen is otherwise complete (#123).

---

### 12.3 The forty proof cases

Eight buildings × five crowd shapes, fixed forever, shared by the gauntlet, the ladder's
`What are the forty?` panel and the bench's suite. One list, three readers.

| Building | Spec | Why it is in the set |
|---|---|---|
| Chancery House | 14 floors · 3 lifts | a short building where one lift out changes everything |
| Garden Apartments | 9 floors · 3 lifts | sparse traffic, and idle cars in the wrong place |
| Harbour Point | 16 floors · 6 lifts | more demand than the group can clear, whatever you do |
| Crown Hotel | 18 floors · 4 lifts | unannounced surges and luggage |
| Ashgate Mixed-Use | 22 floors · 5 lifts | offices over shops, and a car park below |
| Midtown Office | 32 floors · 8 lifts | zoning, and a genuine evening exodus |
| St Jude Hospital | 11 floors · 6 lifts | priority traffic that must survive ordinary traffic |
| Vertical City | 101 floors · 8 shuttles | a sky lobby, where parking is the whole game |

Crowd shapes: **up-peak** (the morning intake) · **down-peak** (every floor calling down at
once) · **two-way** (lunch, both directions busy) · **interfloor** (a meeting-heavy afternoon) ·
**unannounced surge** (forty people, no warning, mid-shift).

A rating is the **mean of all forty**. The cases never move, so two ratings a month apart remain
comparable; a dispatcher that wins one shape and loses four sits mid-table.

## 13. Formatting and units

- Figures are **DM Mono 500**, always with units: `81%`, `134 s`, `2 m 51 s`, `4 u`, `2.5 m/s`,
  `45,000 trips`.
- Waits under 100 s in seconds; above, `m s` form (`3 m 21 s`).
- Money is always `N u`, never a currency symbol.
- Thousands separated with a comma.
- Percentages are integers except handling capacity, which carries one decimal.
- `—` (em dash) is the only placeholder for a figure that does not exist yet. Never `0`, never
  `N/A`, never a spinner where a dash will do.
- Metres by default; the `Units` setting switches machine specs to feet and must convert, not
  relabel.
- Time of day is 24-hour, zero-padded (`08:41`). Held time is `m:ss`.

---

## 14. Performance and safety

- One `requestAnimationFrame` loop for the whole app; it steps only when
  `running && screen === 'stage'`.
- Both sims step in the same slice, always, or the ghost drifts and the race becomes a lie.
- Canvas sizing: read the bounding rect, multiply by `min(2, devicePixelRatio)`, and set the
  transform — never scale by CSS.
- Redraw on resize for the stage, the race strip and the brief elevation.
- Cancel the frame and drop the resize listener on unmount.
- Landings draw at most 26 figures, then `+N`; cars draw at most 9 riders. A crowd of 400 must
  not cost a frame.
- Declaration order and duplicate names: see §18 of the gameplay guide. Both have taken the app
  to a blank screen for a full cycle.
