# Building Configurations

See [docs/04-test-buildings.md](../../docs/04-test-buildings.md) for the rationale behind
each building and what it is designed to stress.

## Status

**This table was three buildings stale**: Secure Tower, Mixed-Use High-Rise and Vertical City were
listed as unbuilt Phase 1 deliverables long after they shipped, and nothing failed, because no test
reads it. It was then repaired into a list of what is on disk, **which was checkable by looking** —
and *checkable by looking* is the mechanism that failed again one building later.
`burj-class-reference.json` landed in PR #402 and appeared in neither this table nor
[docs/04-test-buildings.md](../../docs/04-test-buildings.md), so nine shipped while both registers
said eight, and `grep -i burj` found nothing in either. It is now **checked by a test**, which is a
different and better claim: `packages/experiments/src/validation/buildingRegisters.test.ts` reads
`data/buildings/*.json` off disk and asserts, in both directions, that every config has a row here
and a section there — matched on the **config file**, never on a prose title, so a renamed heading
cannot satisfy it.

**So a new building owes three things, and two of them are documents**: the config, a row in this
table, and a numbered section in `docs/04-test-buildings.md` saying what it is designed to stress.
Adding the file alone turns the suite red, which is the intended way to find out.

| Building | Config | Notes |
|---|---|---|
| Garden Apartments | [`garden-apartments.json`](garden-apartments.json) | Complete |
| Midtown Office | [`midtown-office.json`](midtown-office.json) | Complete — primary validation building |
| Secure Tower | [`secure-tower.json`](secure-tower.json) | Complete — access control × dispatch |
| Mixed-Use High-Rise | [`mixed-use-high-rise.json`](mixed-use-high-rise.json) | Complete — sky lobby, transfer modelling |
| Vertical City | [`vertical-city.json`](vertical-city.json) | Complete — double-deck, three sky lobbies |
| Chancery House | [`chancery-house.json`](chancery-house.json) | Complete — the only `office-prestige` caller |
| Crown Hotel | [`crown-hotel.json`](crown-hotel.json) | Complete — two-way demand, unlike cars |
| St Jude Hospital | [`st-jude-hospital.json`](st-jude-hospital.json) | Complete — `hospital` profile, first shipped stair |
| Burj-class reference tower | [`burj-class-reference.json`](burj-class-reference.json) | Complete — 165 levels, 57 cars, **reference only**: no Career contract, and the stage cannot draw it |

## Schema

Two forms are supported for declaring floors.

### Explicit form

Used by the two existing configs. One object per floor. Preferred for buildings under
~30 floors where per-floor variation matters.

```json
{ "id": "12", "index": 12, "heightM": 43.0, "population": 90 }
```

| Field | Meaning |
|---|---|
| `id` | Display label, string (allows "G", "P1", "M") |
| `index` | Numeric ordering; may be negative for basements |
| `heightM` | Height above datum, metres. Drives travel time. |
| `population` | Occupants; drives arrival rate as % pop / 5 min |
| `isEntrance` | Ground-level source of incoming traffic |
| `label` | Optional human name |

### Range form

For tall buildings where hand-authoring 100 floor entries is impractical. Expands to the
explicit form at load time.

```json
"floorRanges": [
  {
    "fromIndex": 32,
    "toIndex": 60,
    "startHeightM": 124.0,
    "floorToFloorM": 3.2,
    "populationPerFloor": 40,
    "idPattern": "{index}"
  }
]
```

A config may use `floors`, `floorRanges`, or both (explicit entries win on index collision).

## Bank and car fields

```json
{
  "id": "high",
  "servesFloors": ["G", "16", "17", "..."],
  "cars": [
    { "id": "A", "spec": "gearless-traction", "ratedSpeedMps": 4.0, "ratedLoadLb": 3000, "doorType": "centerOpening" }
  ]
}
```

`spec` references a class id in [`../elevator-specs.json`](../elevator-specs.json) and
supplies defaults for acceleration, jerk, and door timing. Explicit fields on the car
override the class defaults.

`servesFloors` is **service zoning** — a hard physical feasibility filter. It is a distinct
concept from `accessZones` (credential-based) and from any operational zoning the
dispatcher applies dynamically. See
[docs/01-architecture.md](../../docs/01-architecture.md#security-zones-are-three-different-things).

`duty` says what a car is *for* — a goods, bed, service or passenger lift — and it is none of those
three zoning concepts either. See § *Duty* below.

## Duty — the fourth thing

**A car may declare what it is for, and this section is the contract for it.** GitHub issue #481,
[§ D549](../../DECISIONS.md). Two shipped screens still refuse the control from opposite sides —
`everyday/designerModel.ts` and `everyday/fixitScreen.ts` — because the control is the one step below
that is not built.

**Duty is what a car is *for*: a goods lift, a bed lift, a passenger lift, a service lift.** It is a
property of the shaft as built, and it does not change during a run.

```json
{ "id": "A", "spec": "gearless-traction", "duty": "goods" }
```

`duty` is one of `passenger`, `goods`, `bed` or `service` — a closed list, declared per car, by the
project owner's ruling of 2026-09-10. **Absent means a passenger car.** A building in which no car
declares a duty runs exactly as it did before the field existed: its riders are drawn a duty and the
draw is thrown away, so its traces and its legs are byte-identical (`traffic/dutyIdentity.test.ts`,
all nine shipped buildings). **No shipped building declares one.**

### What duty is not, and each of these already exists

Four neighbours, and collapsing duty into any of them is the failure this section is written to
prevent — three of them are the trio the paragraph above forbids collapsing, and the fourth is the
one most likely to be mistaken for duty:

| not duty | what it actually is | where |
|---|---|---|
| `CarConfig.mode` | **operational state** — how the car is running *now* | `SERVICE_MODES` = `in-service`, `independent`, `fire-recall`, `out-of-service` |
| `servesFloors` | **service zoning** — a hard physical feasibility filter | the paragraph above |
| `accessZones` | **access zoning** — a credential filter | § Access zones |
| the dispatcher's own grouping | **operational zoning**, applied dynamically | `docs/01` |

**`mode` is the one to read twice, because it answers a question people ask duty for.** *"The one out
of service"* is **not** a duty — it is `mode: 'out-of-service'`, authorable today, and a
`ServiceEventConfig` can put the car back mid-run. `CarConfig.mode`'s own docstring settles it: *"A
building with a car under maintenance, a bank in fire recall, an attendant-operated car — all of them
are `mode`."* So duty is
**purpose**, and nothing else.

**And duty filters nothing, which is what keeps it out of all four.** `servesFloors` and
`accessZones` decide which cars *may* take a call; a duty only says what it costs to send one that
is not for the trip, so a car whose duty differs is still sent when it is the only one.

### How a duty reaches a run

1. **The demand side.** Every journey draws a duty — one uniform per passenger from the `duty`
   stream, in final trace order — against `../traffic-profiles.json → duty.shares` (goods, bed and
   service; everybody else is a passenger). It is recorded on the journey, on every leg and in the
   leg record only where some car of the building declares a duty.
2. **Dispatch.** The landing call carries the duty of the passenger it speaks for, under every call
   type, and the `dutyMismatch` cost term prices 1 when that duty is not the car's. The weight a
   profile gives it is the whole price: a small weight is a preference, and a weight above the sum
   of the profile's other weights is near-exclusive use. **No shipped profile weights it yet**: while
   no shipped building declares a duty a weight would be decoration, and `traffic/dutyIdentity.test.ts`
   refuses one; § D549 drafts `capacity-aware` at 0.35 for when one does. The shares — 0.02 goods,
   0.01 bed and 0.02 service — are applied, and are **proposals awaiting the owner's approval**.
3. **The control.** Not built: the picker the two screens want, on § D219's test.

**The precedent that set that order is `accessZones`, this defect with its polarity reversed**
([§ D265](../../DECISIONS.md)): loaded, validated, indexed and consulted, and unable to change a
result, because every generated trip was authorised by construction. A duty field would have landed
in the same position without step 1, so step 1 came first — and `sim/dutySeam.test.ts` moves the
weight on a building that declares a duty and requires the legs to change.

**Decided by § D549**, which this section used to leave open: a closed vocabulary rather than free
text; on the car rather than the bank; and *scored* — one weighted mismatch term — rather than
preferred or reserved by a filter.

## Access zones

```json
"accessZones": [
  { "id": "tenant-a", "floors": ["6", "7", "8"], "credentialGroups": ["tenant-a-staff"] },
  { "id": "exec",     "floors": ["30"],          "credentialGroups": ["exec"] }
]
```

Floors not covered by any access zone are unrestricted.

## Transport modes — the connections that are not lifts

```json
"transportModes": [
  { "id": "lobby-escalator", "name": "Ground lobby escalator pair", "connects": ["G", "2"], "traversalTimeS": 21.2 }
]
```

| Field | On | Meaning |
|---|---|---|
| `id` | mode | Unique within the building. |
| `name` | mode | Optional human name. |
| `connects` | mode | Exactly two floor ids, which must differ and must both exist. Order carries no meaning — the edge is traversed either way at the same cost. |
| `traversalTimeS` | mode | Landing-to-landing seconds, **including** stepping on and stepping off. Deterministic. |

A transport mode is an **edge of the routing graph beside the banks**, and where a floor is
reachable in the same number of segments by both a mode and a lift, the mode wins — that is the
whole preference rule, and it is expansion order rather than a cost comparison. A hop is **not** a
leg: it lights no landing button, joins no queue and occupies no car, so it does not appear in
`awtS`, `wt95S` or `rideMeanS`. Its seconds *are* charged, to `ttdMeanS`, either as a delay before
the next leg starts waiting or as seconds added after the last alighting.

The `traversalTimeS` is reference data and must be cited in the mode's `$comment`; see
[docs/02 § Non-lift transport](../../docs/02-elevator-reference.md). Declared by
[`vertical-city.json`](vertical-city.json) and by no other shipped building, which declares **four**
— one per two-level lobby, `G ↔ 2` and the three sky lobbies `26 ↔ 27`, `51 ↔ 52`, `76 ↔ 77`, all at
21.2 s because every lobby pair rises exactly the 4.5 m deck separation. Before any of them existed,
**292 of that building's 3,549 lift legs at the standard seed were the `G ↔ 2` lobby hop**, which
was the single largest modelling limit the repository had recorded
([`DECISIONS.md` § D147](../../DECISIONS.md) § 6); the four together bring the same 1,956 journeys
down to **3,245** lift legs.

Three things a mode deliberately cannot express, because nothing would read them: what kind of
machine it is, a direction (so a one-way escalator is not expressible), and a capacity or headway.

**Declaring a mode is not the same as its being used, and the difference is worth measuring.** Two
of `vertical-city`'s four — `51 ↔ 52` and `76 ↔ 77` — carry **0 hops**, because the local bank at
each of those sky lobbies serves *both* of its levels, so the two levels are already the same
breadth-first depth apart and the escalator never shortens a route any passenger can ask for. That
is a fact about the building's zoning rather than about the schema, and it is pinned as a per-mode
census in `traffic/transportRoute.test.ts` rather than left to be rediscovered — a declared field
that changes no decision is the shape [`DECISIONS.md`](../../DECISIONS.md) found in
`data/dispatcher-profiles.json`, and `data/buildings/` is not exempt from it. If you add a mode, add
its measured hop count beside it.


## Landing call types

| Field | On | Meaning |
|---|---|---|
| `landingCallType` | floor, range | What the hall fixture at that landing is — `up-down-buttons`, `destination-entry` or `mobile-credential`, the vocabulary of a dispatcher's `dispatch.callType`. Absent means the dispatcher's own call type, which is every floor of every shipped building. A range copies it to every floor it expands to. |

A panel is none of the three zonings: it decides what a call registered at that landing discloses,
and restricts no car and no rider. A dispatcher that names a car at the panel
(`passengerAssignment: panel`) does so only at destination landings, so declaring buttons on some
landings and not others makes a run **hybrid**, and its wait metrics pair only with a run whose
panels are on the same landings — [`DECISIONS.md`](../../DECISIONS.md) § D553.

## Transfer floors and per-floor traffic

| Field | On | Meaning |
|---|---|---|
| `isTransferFloor` | floor | Sky lobby. A passenger alighting here is re-injected as a new arrival on the next leg while keeping its original journey identity, so time-to-destination spans both trips. Parallels `isEntrance`. |
| `trafficProfile` | floor, range | Overrides the building-level `trafficProfile` for arrivals originating on that floor. A mixed-use tower cannot express "office down-peak and residential up-peak overlap" with one building-level profile. |
| `label` | range | Applies to every floor the range expands to, same meaning as `label` on an explicit floor. |

Used by [`mixed-use-high-rise.json`](mixed-use-high-rise.json) (sky lobby at 31, residential
floors on the `residential` profile) and [`vertical-city.json`](vertical-city.json) (three
two-level sky lobbies, hotel and residential ranges).

## Passenger transfer time

`passengerTransferS` — seconds per passenger per direction — is the term the round trip is most
sensitive to after travel, and it is a property of the **population**, not of the hardware. It is
normally resolved from the building `type` against
[`../elevator-specs.json`](../elevator-specs.json) → `timing.passengerTransferS`: office 1.2 s,
hotel 1.5 s, residential 1.75 s (ISO 4190-6 — luggage, strollers, carts). A car may state its own
value, which wins.

| Field | On | Meaning |
|---|---|---|
| `passengerTransferS` | car | Overrides the building type's row. **Required** on every car of a `mixed-use` building. |

**There is no `mixed-use` row, on purpose.** A mixed tower's banks serve populations that load at
different speeds, so no single building-wide figure describes it, and the loader raises a
`missing-passenger-transfer` error rather than defaulting — refusing to guess, because the office
value on a residential car understates the round trip by about 6 % and understating it is the
optimistic direction [CLAUDE.md § Statistical discipline](../../CLAUDE.md) warns about. So both
mixed-use buildings declare the value per car:

| Building | Bank | `passengerTransferS` |
|---|---|---|
| `mixed-use-high-rise` | `office-local` (retail 2–5, office 6–30) | 1.2 |
| | `residential-local` (31, 32–60) | 1.75 |
| | `shuttle` (G ↔ 31) | 1.75 — it is the only route to 32–60, so residents ride it every trip |
| `vertical-city` | `zone-1`…`zone-4-local` (office) | 1.2 |
| | `zone-5-local` (hotel) | 1.5 |
| | `zone-6-local` (residential) | 1.75 |
| | `shuttle` (all four sky lobbies) | 1.75 — it feeds the hotel and residential zones too |

Where a bank carries more than one population, the **slower** value is chosen: understating the
transfer time flatters the result, and a shuttle that a resident boards is a residential trip for
as long as they are aboard. That choice is visible downstream — it is what makes those shuttles'
full-load door hold 39.8 s, which is longer than Midtown Office's entire shortest round trip, and
therefore why no single departure-clustering constant can serve every building.

## Descent speed and cabin pressurisation

Two optional car fields, GitHub issue #444. Omit both — and every shipped building does — for a car
that descends exactly as fast as it climbs, which is the model this project ran on until they
existed and is what every pinned run still runs.

```json
{ "id": "S1", "spec": "ultra-high-speed", "ratedSpeedMps": 14.0, "cabinPressurised": true }
```

| Field | On | Meaning |
|---|---|---|
| `descentSpeedMps` | car | Top speed **downwards**, where the machine is asymmetric by design. TWIN is about 7 m/s up and 4 m/s down, and cannot be written at all without this. Not where the air-pressure cap goes — that is a property of the shaft and is applied by the loader. |
| `cabinPressurised` | car | The cabin holds pressure and releases it slowly, so `elevator-specs.json`'s `airPressure` descent cap does not apply to it. One World Trade Center's answer to the problem. |

The cap itself is not authored per building. `elevator-specs.json`'s `airPressure` block says a car
descends no faster than `descentCapMps` (10.0 m/s) once its bank's travel exceeds
`appliesAboveTravelM` (300 m), unless the cabin is pressurised; `resolveBuilding` computes the bank's
travel and applies it. Where a car declares its own `descentSpeedMps` as well, **the lower binds**.

Three advisory warnings come out of it, and each names a state that is legal and probably not what
the author meant: `descent-capped-by-air-pressure` (the cap is biting on this car),
`descent-above-rated-speed` (a car quicker down than up — legal, and no reference asymmetry is of
that sign) and `pressurisation-buys-nothing` (a cabin fitted where nothing was capping it).

## Double-deck cars

```json
{
  "id": "shuttle",
  "servesFloors": ["G", "2", "26", "27"],
  "servesFloorPairs": [["G", "2"], ["26", "27"]],
  "cars": [
    { "id": "S1", "spec": "ultra-high-speed", "ratedSpeedMps": 10.0,
      "ratedLoadLb": 4000, "ratedLoadLbPerDeck": 2000,
      "doubleDeck": true, "deckSeparationM": 4.5, "doorType": "centerOpening" }
  ]
}
```

| Field | On | Meaning |
|---|---|---|
| `doubleDeck` | car | Two decks, one floor apart, that open simultaneously. Absent means single-deck. |
| `deckSeparationM` | car | Vertical distance between the decks. |
| `ratedLoadLbPerDeck` | car | Per-deck rating; `ratedLoadLb` stays the whole-car rating and is twice this. Persons per deck follows the usual `ratedLoadLb / 150`. |
| `servesFloorPairs` | bank | The floor pairs served simultaneously. First element is the lower deck, second the upper. `servesFloors` is the flattened union. |

Every pair must be exactly `deckSeparationM` apart in `heightM` — a pair that is not is a
physically impossible car, and load-time validation should reject it. Which deck a
passenger boards is a dispatch decision whenever more than one deck can reach their
destination, and is forced whenever the destination's local bank is anchored to a single
lobby level.
