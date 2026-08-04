# Building Configurations

See [docs/04-test-buildings.md](../../docs/04-test-buildings.md) for the rationale behind
each building and what it is designed to stress.

## Status

**This table was three buildings stale**: Secure Tower, Mixed-Use High-Rise and Vertical City were
listed as unbuilt Phase 1 deliverables long after they shipped, and nothing failed, because no test
reads it. It is now a list of what is on disk, which is checkable by looking.

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
