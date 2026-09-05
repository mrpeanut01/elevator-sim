# 37 — The content plan, and the target counts

> **Status: adopted.** [`DECISIONS.md` § D480](../DECISIONS.md) is the entry; this document is the
> specification it rules on. It closes GitHub issue **#199** and is the target that **#232**
> (buildings), **#233** (Fix a building), **#249** (content cadence) and **#158** (the two missing
> proof-case buildings) each reference and none of which could be scheduled without it.

## 0. What this document decides, and what it does not

**It decides four things.**

1. **What ships today**, measured from the tree rather than transcribed (§ 1).
2. **A target count per content type for beta**, with the play-hours arithmetic behind it (§§ 2–4).
3. **How each type is produced and validated** (§ 6).
4. **The capability rule** — new content may not require a new engine capability unless that
   capability is separately scheduled (§ 5) — and the proof-case building substitution, resolved
   rather than deferred (§ 7).

**It does not decide** the release cadence (that is #249, at M6, and § 8 says what this document
hands it), the difficulty ordering of any content type ([`docs/33-difficulty-curve.md`](33-difficulty-curve.md)
owns that and this document defers to it in full), or what any individual piece of content contains.

**A target count is a goal and is therefore prose.** Every *current* count it is compared against is
derived from `data/` or from the module that holds the list, and
`packages/experiments/src/validation/contentPlan.test.ts` re-derives all seven and fails when § 1's
table and the tree disagree. That split is [`RISKS.md`](../RISKS.md) **R38** applied deliberately:
the thing that drifts is the measurement, not the ambition.

---

## 1. What ships today — measured, not quoted

Issue #199 opens with five figures: *eight buildings, ten campaign stages, five contracts, eighteen
fix cases and forty proof cases*. **Four are right and one is wrong.**

| content type | key | ships today | derived from |
|---|---|---|---|
| Buildings | `buildings` | **8** | `.json` files in [`data/buildings/`](../data/buildings/), and pinned both ways by `packages/viz/src/fixtures.test-helper.ts#BUILDING_IDS` against `readdirSync` |
| Campaign stages | `campaign-stages` | **10** | `stages` in [`data/campaign.json`](../data/campaign.json) |
| Contracts (the daily loop's scenarios) | `contracts` | **8** | `CONTRACTS` in `packages/viz/src/shift/contracts.ts` — `c1`–`c8` |
| Fix-a-building cases | `fix-cases` | **18** | `cases` in [`data/fixit-cases.json`](../data/fixit-cases.json) |
| Proof cases | `proof-cases` | **40** | `towers` × `crowds` in [`data/proof-cases.json`](../data/proof-cases.json) — 8 × 5 |
| Dispatcher profiles | `dispatchers` | **13** | `profiles` in [`data/dispatcher-profiles.json`](../data/dispatcher-profiles.json) |
| Traffic demand templates | `demand-templates` | **7** | `demandTemplates` in [`data/traffic-profiles.json`](../data/traffic-profiles.json) |

**The correction is the contracts row: there are eight, not five.** The issue's *five* is the number
the design handoff specifies and the number this project shipped until `chancery-house`,
`crown-hotel` and `st-jude-hospital` landed. `docs/12-design-handoff.md` § 4.7 records the deviation
and gives its reason — *a shipped building with no contract is a scenario the reader can never take*
— and `shift/contracts.ts` appends `c6`–`c8` accordingly. [`docs/33-difficulty-curve.md`](33-difficulty-curve.md)
§ 4.2 already measures *"each of the eight contracts"*, so the tree has been consistent about this
since the three contracts landed; only the issue was stale.

**Three stale docstrings found beside it, named rather than fixed here.** The same *five* survives in
prose in `packages/viz/src/shift/contracts.ts` (*"The five scenarios"*, and *"`contracts.test.ts`
asserts all five resolve"* — twenty lines above the block that correctly says **eight**), in
`packages/viz/src/shift/contracts.test.ts` (*"The five scenarios name five buildings that exist"*),
and in `packages/viz/src/dev/scenariosPanel.ts` (*"asserts all five resolve against
`data/buildings/`"*). That is R38 at the shortest possible range: a prose count sitting in the file
that owns the list. They are left for one commit that fixes all three, because the three sites span
two directories and fixing two of them is how the third becomes the only one anybody trusts.

**Two counts worth having beside the seven, because § 4 uses them.** The **6** named play styles in
`data/dispatcher-profiles.json#playStyles` are the Casual presentation of the thirteen profiles and
not additional dispatchers; the **5** crowd shapes in `data/proof-cases.json#crowds` are what makes
the forty forty, and § 4 derives the demand-template target from them.

---

## 2. What a play-hour is here, and how it is counted

**Simulated seconds are not play seconds, and the conversion is a shipped constant.** The stage runs
at `DEFAULT_STAGE_SIM_PER_REAL_S = 30` — thirty simulated seconds per real second — set in
`packages/viz/src/everyday/stageScreenModel.ts` and argued there rather than defaulted. So a
1 800-second day is **60 real seconds** of watching.

**Not all content is watched.** Splitting the shipped modes on this is the single most useful thing
this section does, because it changes which content type buys play-hours:

| mode | how a run reaches the player | consequence for the plan |
|---|---|---|
| Daily loop (contracts) | watched on the stage at 30× | simulated seconds convert to play-minutes |
| Campaign | one demonstration replication watched; the judging batch of 50 is headless | as above, for the one replication |
| Fix a building | **never watched.** `fixit/run.ts` runs a pair headless and the screen shows figures — [`docs/35-problem-per-mode.md`](35-problem-per-mode.md) reports that the mode has no stage at all and discards a full recording of the failing building on every case open | play-time is reading and deciding only |
| The gauntlet | 40 headless runs behind one press | a rating event, not content-hours |
| Endless rush | watched, unbounded — a ramp against a fail state ([§ D477](../DECISIONS.md)) | replay, excluded from the finite total |

**The session multiplier: watching is at most a fifth of a session, so a play-hour is at least five
times its watch-minutes.** The charter's `S3` commits to a **median first session of 10 minutes or
longer** ([`docs/22-charter.md`](22-charter.md) § 4). The watched part of a first session is at most
`c1`'s whole day — 3 600 simulated seconds at 30×, **2 real minutes**. Two minutes in ten is 20 %,
and that is an *upper* bound on the watch fraction because it assumes the player watches the entire
day. So the multiplier is **at least 5×**, and 5 is what this document uses.

> **This is an assumption with its reasoning attached, in the manner
> [`data/traffic-profiles.json`](../data/traffic-profiles.json)'s credential-gap share is.** `S3` is
> a *target*, not a measurement — [`docs/22-charter.md`](22-charter.md) § 4 says outright that
> nothing in this tree measures a first session — and the ongoing median session is assumed equal to
> the first. The instrument that replaces both is
> [`docs/26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md)'s **K3**, first-session length.
> When K3 has data, § 3 and § 4 are re-derived from it and this paragraph is what says so.

---

## 3. The shipped inventory in play-hours

**Every simulated second this game ships, measured.**

| mode | simulated seconds shipped | derivation | watched? | real watch minutes at 30× |
|---|---|---|---|---|
| Daily loop | **36 000** | 19 clean days is the floor — `needClean` over `c1`–`c8` is 1+2+2+2+3+3+3+3 — at 1 800 s each, except `c1`'s authored 3 600 s: 3 600 + 18 × 1 800 | yes | **20.0** |
| Campaign | **9 000** | 10 stages × `durationS` 900 | yes | **5.0** |
| Fix a building | 33 900 | 18 cases, `run.durationS` 1 500–2 700 | no | 0 |
| The gauntlet | 38 400 | 8 towers × (900 + 900 + 1 200 + 1 200 + 600) crowd horizons | no | 0 |
| **watched total** | **45 000** | | | **25.0** |

**Twenty-five minutes.** That is the whole of what this game asks a player to watch, and it is worth
stating in one line because it is the figure the issue's *"a few hours of content"* is hiding: the
hours are real, and almost none of them are the simulator running.

**The finite play-hours, then:**

| mode | arithmetic | play-hours |
|---|---|---|
| Daily loop + campaign | 25.0 watch-minutes × 5 (§ 2) = 125 min | **2.08** |
| Fix a building | 18 cases × 7.67 min (below) = 138 min | **2.30** |
| The gauntlet | one press per dispatcher a player wants rated | ~0 |
| Endless rush | unbounded by construction | excluded |
| **total** | | **≈ 4.4** |

**Where 7.67 minutes a case comes from.** A clean solve is: understand the fault (the charter's own
first-session standard is *understood why within three minutes*), choose among four repairs against a
budget (2 min), read the three-row before/after (1 min) — **6 minutes**.
[`docs/33-difficulty-curve.md`](33-difficulty-curve.md) § 5.2 measured that on **10 of the 18** cases
exactly one affordable repair clears both bars, so a wrong first spend is the expected outcome on
those; add one choose-and-read cycle of 3 minutes to each. `(8 × 6 + 10 × 9) ÷ 18 = 7.67`. The three
per-step figures are assumptions; the 10-of-18 split is a measurement.

**So the issue's adjective was right even though its contracts count was wrong.** Four and a bit
hours is a few hours.

---

## 4. The target, and the arithmetic that sets it

### 4.1 The total

**Beta must carry the median returning player for one quarter without the release cadence being the
only thing between them and an empty game.** That is #249's own window — *meet the cadence for one
quarter* — and it is the only stated commitment this project has that a content total can be
measured against.

- 13 weeks × 3 sessions a week × 10 minutes (`S3`) = 390 min = **6.5 h**
- at 4 sessions a week = **8.7 h**
- at 5 sessions a week = **10.8 h**

The session rate is an assumption and the sensitivity is published rather than hidden, because it is
the only free parameter: charter `S4` commits to **25 % of day-one players returning within 7 days**
and to nothing about frequency. **The target is the midpoint of that band: 8.5 finite play-hours**,
up from the measured 4.4.

### 4.2 The per-type targets, each derived separately

None of the seven is set by dividing 8.5 by anything. Each is derived from a rule the project has
already written, and the point of the exercise is that they **land inside the band from § 4.1
independently**.

| content type | key | today | **target** | how the target is derived | play-hours it adds |
|---|---|---|---|---|---|
| Buildings | `buildings` | 8 | **12** | § 4.3 | 0 directly; multiplies every other row |
| Contracts | `contracts` | 8 | **12** | one per shipped building — `docs/12` § 4.7's own rule, *a shipped building with no contract is a scenario the reader can never take* | 4 × 3 clean days × 1 800 s = 21 600 s = 12 watch-min × 5 = **+1.00** |
| Campaign stages | `campaign-stages` | 10 | **14** | one per building, plus the two stages that teach a mechanic rather than a tower (stage 3 *Overwhelmed* and stage 7 *Tune it*, both on `midtown-office`). Today that rule gives exactly the shipped 10 | 4 × 900 s = 3 600 s = 2 watch-min × 5 = **+0.17** |
| Fix cases | `fix-cases` | 18 | **44** | § 10.6 of the gameplay guide names **26** further cases by name, with authoring rules; 18 + 26. **16 of the 26 are authorable today** — § 5.2 | 26 × 7.67 min = **+3.32** |
| Proof cases | `proof-cases` | 40 | **40** | **unchanged, by rule.** A rating is only comparable if the cases never move; growing the building set must not touch this list. § 7 is the one permitted move | 0 |
| Dispatchers | `dispatchers` | 13 | **13** | **unchanged.** `CLAUDE.md` invariant 7: only a genuinely new *cost term* justifies new dispatcher code, and a weight vector adds no run to watch | 0, by construction |
| Demand templates | `demand-templates` | 7 | **9** | § 4.4 | 0 directly; multiplies the rotation |
| Wrinkle templates | *(new)* | 0 | **20** | § 4.3, and it is the gameplay guide's own figure | unbounded — this is the row that makes the daily loop not run out |

**4.38 + 1.00 + 0.17 + 3.32 = 8.87 play-hours**, against a band of 6.5–10.8 and a midpoint target of
8.5. Seven independently derived targets landing inside a band derived from a different document is
the strongest form this argument can take; it would have been worth recording had they landed
outside it too.

**And the number that would be reached by doing only the unblocked work is stated beside it, because
that is the schedule anybody will actually run.** Sixteen of the twenty-six fix cases are authorable
today (§ 5.2), so a beta that ships the four new buildings, the four new contracts, the four new
stages and **only the unblocked cases** reaches `4.38 + 1.00 + 0.17 + (16 × 7.67 min) = 7.60
play-hours` — inside the 6.5–10.8 band and **below the 8.5 midpoint**. The four schema-blocked cases
are worth `+0.51` and cost one `fixit/` schema change; the six engine-blocked ones are worth `+0.77`
and cost six scheduled engine issues. **That ordering is the plan's actual recommendation**: the
schema widening buys more play-hours per unit of engine work than anything else on this list.

### 4.3 Buildings and wrinkles: the rotation rules set both

The gameplay guide § 17 specifies how the daily tower stays fresh — a day is a draw from (tower,
wrinkle, crowd) — and states three rotation rules: **no tower twice in seven days; no wrinkle
template twice in fourteen; the pair (tower, template) never inside a month.** Those are arithmetic
constraints and they are where the building target comes from.

| rule | minimum for satisfiability | legal choices a day at the minimum | at the target |
|---|---|---|---|
| no tower twice in 7 days | **8 towers** | `8 − 7 = 1` — a fixed cycle, not a draw | **12** → `12 − 7 = 5` |
| no template twice in 14 days | **15 templates** | `15 − 14 = 1` — same defect | **20** → `20 − 14 = 6` |
| pair never inside a month | 31 pairs | — | 12 × 20 = **240** against a 30-day window |

**Eight buildings satisfies the first rule and defeats its purpose**, which is the finding: at
exactly the minimum there is one legal tower each day and the rotation is a deterministic cycle a
player learns in a fortnight. Twelve leaves five. The guide's own *"twenty templates × their
parameters is thousands of legible days"* fixes the second target at 20 rather than at the
satisfiability floor of 15, for the same reason.

**A bound stated rather than glossed.** `5 × 6 = 30` candidate pairs a day is before the month rule
filters, and the exact surviving count depends on the draw's history. This document does not fix a
daily figure; #159's generator must **assert non-exhaustion over a simulated year** rather than
inherit it from this table, which is the same discipline as its own requirement that the generator's
output be pinned to a commit.

### 4.4 Demand templates: the gauntlet already names the missing two

The five crowd shapes the proof cases run — up-peak, down-peak, two-way, interfloor, surge — are
authored in `data/proof-cases.json` as bare `directionalSplit` overrides, not as templates. Of the
seven shipped `demandTemplates`, `rise-and-fall`, `office-down-peak`, `evening-egress`,
`lunch-two-way`, `shift-change`, `office-day` and `constant-iso` cover up, down and two-way. **No
template is interfloor-dominant and none is a surge.** Target **9**: one of each, so every crowd
shape the rating measures a dispatcher against has a template a day can be built from.

**This is [§ D156](../DECISIONS.md)'s lesson pointed forward.** The learned-control refusal turned in
part on the demand template set varying the *level* and never the *directional split*; the missing
condition had to be built (`lunch-two-way`, [§ D169](../DECISIONS.md)) before the question could even
be asked. A template family that covers the level axis and half the mix axis is how that happens
again.

---

## 5. CR-4 — the capability rule

> **CR-4.** A piece of content ships only if every fault, constraint and crowd it declares is
> expressible in fields the shipped engine already reads **and the content type's own schema already
> carries**. Where it is not, the content does not ship until the missing capability is separately
> scheduled as an engine issue with its own acceptance criteria.

**How a reader decides whether a proposed piece of content violates it.** For each element the
content declares:

1. **Name the field.** The `data/` key, the `BuildingConfig` member, or the
   `SimulationDemandOptions` member that carries it. If you cannot name one, the content is blocked
   — and say which of the two blockages it is, because they have different fixes:
   - **(a) the engine has no such capability** → an engine issue, scheduled separately;
   - **(b) the engine has it and the content type's schema does not reach it** → widen that
     schema, which is a much smaller job and belongs to the content lane.
2. **Run the standing requirement.** `docs/05-roadmap.md`'s rule: *move the control and require the
   run to change, compared on the legs*. A field you can name whose legs do not move is an inert
   seam, and the content is blocked for a second reason. This project has shipped a configurable,
   tested, dead behaviour eleven times in code and twice in `data/`; a content plan that does not
   carry the check inherits the twelfth.

**CR-4 is not a veto and the worked examples are here to show that.**

### 5.1 The wrinkle library (#159) — the case that made the rule necessary

§ 17 names six wrinkle kinds. Checked against the engine, **four are fully authorable and two are
authorable only in their all-day form:**

| wrinkle kind | field | verdict |
|---|---|---|
| a shaft out (which, from when, until when) | `BuildingConfig.serviceEvents` + `ServiceMode 'out-of-service'` | **passes** — including the timing, which is the whole point of `serviceEvents` |
| a floor's occupancy spiked | `FloorConfig.population` | **passes** |
| a timed arrival burst (coaches, caterers, a fire drill) | `demandTemplates[].phases` intensity arc; a coach is `batchSize.mean` + `batchSharesDestination`; a drill read as *cars into recall* rather than *people arriving* is `serviceEvents` + `ServiceMode 'fire-recall'` | **passes**, with a bound: phase intensity is `[0, 1]` and a template may not raise the building's rate, so a burst is authored by lowering the baseline rather than raising the peak |
| doors slowed on one car | `CarConfig.doorOpenS`, `doorCloseS`, `dwellCarCallS`, `dwellHallCallS` — per car, and every one of them overridable | **passes** |
| a sky lobby closed | `BankConfig.servesFloors` | **all-day only.** `serviceEvents` moves a car's `mode`, never a bank's service range — *closed from 12:00* is **blocked (a)** |
| capacity derated | `CarConfig.ratedLoadLb` | **all-day only**, same reason — a mid-run derate is **blocked (a)** |

**So #159 is four-sixths authorable today, and the one engine capability it needs is nameable in a
sentence:** *a service event that changes a car's or a bank's service range and rated load, not only
its service mode.* That is the issue #159 must open and schedule before it can build the
mid-run half of its library, and it is exactly the shape of thing CR-4 exists to force into the open
before twenty templates have been authored against it.

### 5.2 The fix-case catalogue (#233) — six of twenty-six are blocked, and four more only by a schema

§ 10.6 names 26 further cases. Checked the same way, the split is **6 blocked, 4 schema-blocked,
16 authorable today**, and it is not where one would guess.

> **The classification is a reading of the types and the case titles, and CR-4 says how to confirm
> it**: for each case the authoring lane names the field and then *moves the control and requires the
> run to change, compared on the legs*. Where the reading below and that run disagree, the run wins.
> Publishing the reading with the check named beside it is the point; publishing it as settled would
> be the thing this document's own § 7 complains about.

**Blocked (a) — the engine has no such capability (4):**

- *Both directions answered at once* — a hall call registering up **and** down. `model/floor.ts`
  keeps *"at most one live hall call per direction"* and registers by the direction the passenger is
  actually travelling; content cannot make one call register both.
- *The photocell that sees the queue* — no door-reopening-on-obstruction model.
- *The pram floor* — `passengerTransferS` is a property of the **car**, not of the landing.
- *The trading floor* (a 07:10 peak two hours before the rest) — phase lists vary intensity and mix
  for the **whole building**; there is no per-floor arrival schedule.

**Also blocked (a), at the traffic model rather than the building (2):** *The serviced-office floor*
(visitors who press everything) and *The concierge who calls cars ahead* both need rider behaviour
the generator does not produce — a call with no rider, and a rider who makes calls they do not
need. **That is six blocked outright**, and each of the six is an engine issue that must be
scheduled before its case is authored, or the case does not ship.

**Blocked (b) — the engine has it and the fix-case schema does not (4), and this is the consequential
half.** **`FixitCase.run` carries three fields — `seed`, `durationS` and `arrivalRatePctPop5min`** —
and `BuildingPatch` reaches `floorPopulations`, `banks`, `cars` and `addCars`. So a case can change
the demand **level** and the building, and **cannot** declare a directional split, a demand template,
a batch-size curve, patience, lobby crowding, `serviceEvents`, `accessZones` or `transportModes`,
every one of which the engine reads. Four catalogue cases turn on the *shape* of demand rather than
its level and are blocked by that alone: *The canteen at half twelve*, *Shift change at a factory*,
*School run in a residential block* and *Half the building on Fridays* — the last of which also wants
its fix judged across five days, where the harness runs one seed at one horizon. **This is a schema
widening in `fixit/`, not an engine issue**: the cheapest item in this whole plan, worth four cases,
and the one #233 should do first.

**The remaining 16 are authorable now**, and two are worth naming because they look blocked and are
not: *The evacuation drill that never ended* is `serviceEvents` holding cars in `fire-recall`
indefinitely, and *Levelling that misses by 40 mm* is `CarConfig.levelingSettleS` — the engine does
not model a 40 mm miss, but it models the seconds it costs at every stop, and the case is about the
seconds. **A case is authorable when its *effect* is expressible; insisting on the mechanism is what
turns a content item into an engine issue.**

### 5.3 The traffic-realism programme (#235) is the scheduled half of CR-4

#235 restarts wave 13 — patience, crowding, stair-taking, group size, day-to-day variation — and
several of those have already landed in `core`, at **two different reachabilities that CR-4 has to
tell apart**. Stair-taking is reachable from **content**: a building declares a
`transportModes` entry with `kind: 'stairs'`, and `st-jude-hospital` ships one, so a case or a tower
that wants riders to have a stairwell can have one today. `patience`, `lobbyCrowding`, `batchSize`
and `dayVariation` are reachable only from **`SimulationConfig`**, which is code — no building
document, campaign stage or fix case carries any of them. **So content that needs a rider to give up
is unblocked at the engine and blocked at the schema**, which is exactly the (a)/(b) distinction
earning its keep, and the fix is § 5.2's schema widening rather than anything #235 owns. #235 is
where the rest is scheduled, and CR-4's contract with it is one-directional: this plan asks #235 for
nothing, and content that wants what #235 has not landed waits.

### 5.4 The rule pointed at this document's own targets

CR-4 applies to § 4 first. **Neither of § 7's two buildings needs a new capability** — floors with
negative indices for Ashgate's car park, one restricted `servesFloors` bank, an arrival rate above
the group's handling capacity for Harbour Point — and that is checked in § 7 rather than assumed. The
**20 wrinkle templates are the target that CR-4 bites**: § 5.1 says which two of six kinds must be
authored in their all-day form or wait.

---

## 6. The authoring path per type

Every row states what is authored, what validates it, and what the validation would catch.

| type | authored as | validated by | what the validation catches |
|---|---|---|---|
| **Building** | a JSON document in [`data/buildings/`](../data/buildings/) — see its README for the schema | `config/schema.ts` → `parseBuilding` → `resolveBuilding` at load; `packages/viz/src/shippedBuildings.test.ts` sweeps **every file on disk** through the viewer's own spec round trip and refuses `[object Object]`, `NaN` and `undefined` on any emitted string; #232 AC3 adds a closed-form Barney/CIBSE round-trip-time check per building | a schema-valid building the viewer cannot render (issue #108's shape), and a building whose simulated interval does not agree with the closed form |
| **Fix case** | an entry in [`data/fixit-cases.json`](../data/fixit-cases.json) — complaint, four figures, diagnosis, four repairs with costs, an as-built patch, a before/after | `fixit/parse.ts`; `fixit/cases.test.ts` pins every measured number and compares each repair's as-repaired run to the as-built run **on the legs, in both directions**; `docs/33` DC-7/DC-8/DC-9 | an effect line quoting a figure that has stopped reproducing, an inert repair, and a case the do-nothing arm clears |
| **Campaign stage** | an entry in [`data/campaign.json`](../data/campaign.json) | `campaign/parse.ts`; `campaign/difficultyCurve.test.ts` for DC-1/DC-2/DC-2b/DC-3; goal pass rates published in [`data/scenario-goals.json`](../data/scenario-goals.json) over both 50-replication seed sets | a stage that clears from the dispatcher dropdown alone (charter `S5`), and a stage that is unwinnable |
| **Contract** | an entry in `shift/contracts.ts#CONTRACTS` — prose only; every number is derived by `statLineOf` from the building | `contracts.test.ts` resolves every `buildingId` against `data/buildings/` | a renamed building file silently orphaning a scenario |
| **Dispatcher** | a weight vector in [`data/dispatcher-profiles.json`](../data/dispatcher-profiles.json) — never code (`CLAUDE.md` invariant 7) | `dispatcher-profiles.json`'s schema; the bench and the gauntlet | a profile whose weights change no decision — `destination-eta` shipped bit-identical to `eta` at 8 of 8 matrix cells with `rideTime: 0` |
| **Demand template** | a `demandTemplates` entry in [`data/traffic-profiles.json`](../data/traffic-profiles.json), authored as a phase list | `config/demandPhases.ts` — seven structural rules covering gaps, overlaps, undeclared steps and a partially declared mix | a template with a silent dead stretch, and a mix declared on half its phases |
| **Proof case** | ids, rates and horizons in [`data/proof-cases.json`](../data/proof-cases.json); **names and specs are resolved from `data/buildings/` at load** | `gauntlet/proofCases.test.ts`, over all three readers in both directions, including that the gauntlet's and the bench's seed sets are disjoint | a second copy of the tower names anywhere in `packages/`, and a bench that could tune against the exact runs the ladder rates |
| **Wrinkle template** | *does not exist.* `data/wrinkles.json`, specified by § 17 and owned by **#159** | to be built with it: § 17's own gate — *a day only earns its place if it changes which dispatcher wins*, run offline over candidate days with the bench's paired machinery | a cosmetic day that shuffles nothing |

**The authoring cost is measured, and it is why #233 asks for a pipeline.**
`data/fixit-cases.json` is **5 139 lines for 18 cases — 285 lines of hand-written JSON per case**,
because a repair's patch restates whole banks: `two-cars-out-wrong-month`'s diagnosed repair
re-authors both of `secure-tower`'s banks in full to remove one car. By contrast a building is
**142 lines** (1 140 over 8) and a campaign stage **65** (654 over 10). Twenty-six more fix cases at
the current shape is roughly **7 400 lines of hand-written JSON**, which is the number #233's
"does not scale" refers to and the number a pipeline has to beat.

**One rule for every type, stated once.** A count published on any player-facing surface is derived
from the list, never authored beside it — `dev/main.ts#dispatcherNameOf`'s refusal and
`statLineOf`'s derivation are the two shipped instances, and [§ D227](../DECISIONS.md) is why the
inverse (a stale *refusal*) is worse than a stale figure.

---

## 7. The proof-case building substitution — resolved

### 7.1 What is actually standing in, and it is more than two

§ 12.3 of the engine contract names eight proof-case towers. **Two are not in `data/buildings/`** —
**Harbour Point** (16 fl · 6 lifts, *"more demand than the group can clear, whatever you do"*) and
**Ashgate Mixed-Use** (22 fl · 5 lifts, *"offices over shops, and a car park below"*) — and
`data/proof-cases.json` puts `mixed-use-high-rise` and `secure-tower` in their places, recording the
substitution and its cost in its own `$comment`. That is #158, and
[`docs/18-everyday-mode-tree-audit.md`](18-everyday-mode-tree-audit.md) carries it.

**The finding this document adds: the same substitution runs through Fix a building, at six times
the scale, and nothing records it.** § 10.5 of the gameplay guide specifies eighteen cases on
**eighteen distinct buildings. Five of those ship.** Thirteen — Fenwick Chambers, Ashgate Mixed-Use,
Calder Tower, Northgate Retail, Harbour Point, Elmsworth College, Weald Conference Centre,
Ravensbourne House, Meridian Plaza, Sable Court, Lansdowne Mansions, Bellhaven Works and Quayside
Residences — do not. **Thirteen of the eighteen shipped cases therefore run on a substitute
building**, including the two the specification places on Harbour Point and on Ashgate: *One start
time for eleven hundred* ships as *One start time for **seventeen** hundred* on `midtown-office`,
re-themed to that building's occupancy, and *The car park nobody serves* likewise. The `$comment` in
[`data/fixit-cases.json`](../data/fixit-cases.json) says only that *"each case names a shipped
building"* and records no departure, where `data/proof-cases.json` names its two outright. **That
asymmetry is the defect, not the substitution** — and the re-theming is what makes it invisible: a
case whose copy has been fitted to the substitute leaves nothing on the surface to notice.

### 7.2 The rule that decides both, and it is one rule

> **A substitution is acceptable where the content brings its own configuration to a shipped
> building, and unacceptable where the content's identity *is* the building.**

A **fix case** carries an `asBuilt` patch, four repair patches, its own complaint and its own
figures; the tower is a stage for a fault the case supplies. Re-basing it onto a shipped building
changes nothing a player is told and saves thirteen buildings' worth of authoring. **A proof case
carries nothing but a tower and a crowd shape.** Its identity is the tower, the tower's `why` line
is the reason it is in the set, and the substitutes' own `why` lines say something different from the
ones they replace: `secure-tower` reads *"a credential on every call"* where Harbour Point's role in
the set is *a group that cannot cope*. **No tower in the shipped forty is authored to hold that
role**, and its absence is a coverage hole in the rating rather than a naming inconvenience.

**Stated precisely, because the looser version would be a claim nobody measured.** What is measured
is the *authoring*: the eight towers declare rates of 0.75 % to 2 % of population per five minutes
and eight `why` lines, none of which is Harbour Point's. Whether any of the forty runs in fact
saturates is **unmeasured here** and is not asserted — [§ D256](../DECISIONS.md)'s rule is that a
plausible sentence may not stand in for a measurement, and the argument in § 7.3 does not need one.

### 7.3 The decision

**Author both buildings, and do it before the daily board ships.** Three reasons, in the order that
decides it:

1. **The set loses a role it was chosen for.** § 7.2. `secure-tower` does not test what Harbour Point
   is there to test.
2. **The comparability cost is at its all-time minimum now and rises the day a server exists.** § 12.3's
   *"the cases never move"* is what makes two ratings comparable, and swapping a tower changes that
   case's seed (`hash(towerId, crowdIndex)`), so every prior rating stops being comparable. Today
   ratings live in one device's own storage slot ([§ D433](../DECISIONS.md), [§ D434](../DECISIONS.md))
   and **the daily board — the only surface that compares ratings across players — is not built**.
   There is no cross-player comparison to break. There will be.
3. **Neither building needs a new capability, and the rating survives the harder one.** CR-4 passes:
   Harbour Point is floors, one bank of six cars and an arrival rate above the group's handling
   capacity; Ashgate is 22 floors with negative-index basements and a `servesFloors` restriction that
   leaves one of five cars reaching B1–B2. And the objection a reader should raise — *an
   over-subscribed tower saturates, and a saturated run has its mean suppressed* — does not bite:
   `gauntlet/rating.ts` scores on `pctOverLongWait`, an **observation**, precisely so that *"a rating
   that silently dropped a third of the forty whenever a tower saturated would move with the
   saturation rather than with the dispatcher"*. The case scores.

**§ 12.3 is not amended, because it cannot be.** Issue #158 offers *"amend § 12.3 to name the eight
buildings this project actually ships"* as its second exit. That exit is unavailable:
`docs/12-design-handoff.md` states of the vendored handoff, *"Do not edit the vendored copy. It is a
record, not a source file"*, and the same rule is restated for the Casual handoff. The equivalent
honest move is a recorded deviation in `docs/12` § 4.7's manner — which is what
`data/proof-cases.json`'s `$comment` **already is**. So the choice is genuinely binary: author the
two towers, or leave the recorded deviation standing permanently. This document chooses the first.

**What is owed either way, and it is owed now.** `data/fixit-cases.json`'s `$comment` gains the
paragraph `data/proof-cases.json` already has: the thirteen buildings § 10.5 names that this build
does not ship, the thirteen cases re-based onto shipped towers, and the reason that is correct for a
fix case and not for a proof case. **This is #233's cheapest acceptance item and it is not
optional** — an undisclosed substitution is the false statement about the thing asked after that
this repository refuses by name elsewhere.

**And the eleven other missing buildings are formally accepted, permanently.** Fenwick Chambers,
Calder Tower, Northgate Retail, Elmsworth College, Weald Conference Centre, Ravensbourne House,
Meridian Plaza, Sable Court, Lansdowne Mansions, Bellhaven Works and Quayside Residences are **never
authored**, by § 7.2's rule. What is lost is the flavour of thirteen distinct addresses; what is kept
is thirteen buildings' worth of authoring, validation and closed-form checks that would buy a player
nothing a display name does not already buy them.

---

## 8. What each issue now has to hit

| issue | what this document gives it |
|---|---|
| **#232** — expand the building set | **AC1 target: 12 buildings** (§ 4.3, from § 17's rotation arithmetic). **AC2:** Harbour Point and Ashgate Mixed-Use are **authored**, not accepted (§ 7.3) — two of the four new buildings are therefore already specified, and § 7.3 states what each needs. **AC3/AC4** are unchanged and this document adds one clause to AC4: a new building's validation includes CR-4 — every configuration block it declares must be one a shipped code path reads |
| **#233** — expand Fix a building | **AC1 target: 44 cases** (§ 4.2, from § 10.6's own catalogue of 26). **Do the schema widening first** (§ 5.2): `FixitCase.run`'s three fields reach the demand *level* and not its *shape*, which blocks four catalogue cases for a `fixit/` reason rather than an engine one. **Six of the 26 are blocked outright** and § 5.2 names all ten and the check that confirms the classification. So the realistic first tranche is **16**, not 26. **AC4** is already specified — `docs/33` § 5.3's DC-7 bands, and new cases take a band rather than an index. **Plus the disclosure paragraph** § 7.3 says is owed |
| **#249** — publish a content cadence | **The honest input, which is not the one the issue expects.** At the § 4.1 rate a median player consumes ~40 min a week; one fix case is 7.67 min. **A cadence cannot be justified as content replacement** — a weekly case replaces a sixth of a week's play — so it must be justified as *a reason to return*, which is a different design argument and belongs in #249 rather than here. What this document does give it: the per-type authoring costs in § 6 (285 lines a fix case today), so the cadence is set by what the pipeline sustains rather than by ambition |
| **#158** — the two proof-case buildings | **Resolved: option 1, author them** (§ 7.3), with the deadline condition — **before the daily board ships**, after which option 2 becomes the only honest exit and must be recorded rather than applied to the vendored file. #158's own option 2 as worded (*amend § 12.3*) is **unavailable**; § 7.3 says why and what replaces it |
| **#159** — the wrinkle library | **Target: 20 templates** (§ 4.3, its own figure). **Four of its six named kinds are authorable today and two are all-day only** (§ 5.1); the one engine capability it needs is named in a sentence and must be opened as its own issue. **#159 is on #249's critical path** — § 4.2's finite targets reach 8.87 h and the quarter needs up to 10.8; the daily rotation is what covers the difference, and it does not exist |
| **#235** — traffic realism | Unchanged by this document. § 5.3 records that patience, lobby crowding and the stairs metrics have landed in `core` and that what blocks content using them is the content schemas, not the engine |

---

## 9. What this document does not do, and one figure it declines to publish

**It sets no cadence.** § 8 says why, and the reasoning is #249's to accept or refute.

**It does not order any content.** [`docs/33-difficulty-curve.md`](33-difficulty-curve.md) owns
difficulty for all three modes, and a second account of an ordering in a second document is how two
accounts of one rule drift apart.

**It declines to publish a play-hours figure for Endless rush.** The mode is a ramp against a fail
state ([§ D477](../DECISIONS.md)), so its content-hours are a property of the player rather than of
the content, and a number derived from an assumed survival time would be an adjective wearing
arithmetic. It is excluded from § 3 and § 4 and named rather than silently dropped.

**Two assumptions carry the whole of § 2 and § 4.1** — the 5× session multiplier and the 3-to-5
sessions a week — and both are anchored on charter targets rather than measurements, because
[`docs/22-charter.md`](22-charter.md) § 4 states that nothing in this tree measures a first session.
[`docs/26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md)'s **K3** is the instrument that
replaces them. When it has data, § 3 and § 4 are re-derived; the per-type derivations in § 4.2 and
§ 4.3 do not move, because none of them is derived from the total.

---

## Sources

- Counts in § 1 are derived from `data/` and from `packages/viz/src/shift/contracts.ts`, and are
  re-derived by `packages/experiments/src/validation/contentPlan.test.ts`.
- The playback constant is `packages/viz/src/everyday/stageScreenModel.ts#DEFAULT_STAGE_SIM_PER_REAL_S`.
- Session-length and retention targets are [`docs/22-charter.md`](22-charter.md) § 4 (`S3`, `S4`);
  their replacement instrument is [`docs/26-telemetry-and-privacy.md`](26-telemetry-and-privacy.md) `K3`.
- Fix-case difficulty measurements are [`docs/33-difficulty-curve.md`](33-difficulty-curve.md) § 5.2.
- Rotation rules, the wrinkle library and the fix-case catalogue are
  [`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`](design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md)
  §§ 10.5, 10.6 and 17; the proof-case set is
  [`docs/design/design_handoff_casual_mode/ENGINE_CONTRACT.md`](design/design_handoff_casual_mode/ENGINE_CONTRACT.md)
  § 12.3. Both are vendored records and are not edited — [`docs/12-design-handoff.md`](12-design-handoff.md).
