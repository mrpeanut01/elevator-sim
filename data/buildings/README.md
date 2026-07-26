# Building Configurations

See [docs/04-test-buildings.md](../../docs/04-test-buildings.md) for the rationale behind
each building and what it is designed to stress.

## Status

| Building | Config | Notes |
|---|---|---|
| Garden Apartments | [`garden-apartments.json`](garden-apartments.json) | Complete |
| Midtown Office | [`midtown-office.json`](midtown-office.json) | Complete — primary validation building |
| Secure Tower | — | **Phase 1 deliverable** |
| Mixed-Use High-Rise | — | **Phase 1 deliverable** |
| Vertical City | — | **Phase 1 deliverable** (may defer past v1) |

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

## Transfer floors and per-floor traffic

| Field | On | Meaning |
|---|---|---|
| `isTransferFloor` | floor | Sky lobby. A passenger alighting here is re-injected as a new arrival on the next leg while keeping its original journey identity, so time-to-destination spans both trips. Parallels `isEntrance`. |
| `trafficProfile` | floor, range | Overrides the building-level `trafficProfile` for arrivals originating on that floor. A mixed-use tower cannot express "office down-peak and residential up-peak overlap" with one building-level profile. |
| `label` | range | Applies to every floor the range expands to, same meaning as `label` on an explicit floor. |

Used by [`mixed-use-high-rise.json`](mixed-use-high-rise.json) (sky lobby at 31, residential
floors on the `residential` profile) and [`vertical-city.json`](vertical-city.json) (three
two-level sky lobbies, hotel and residential ranges).

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
