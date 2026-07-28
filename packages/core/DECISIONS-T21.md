# T21 — starvation is not saturation

The Phase 8 property campaign's deep tier was red on one counterexample, `fuzz-1001074`, handed
back to `core` by `packages/experiments/src/validation/DECISIONS-T20.md` § D83. Phase 8 findings
block release, so this is the resolution and the evidence behind it.

---

## The reproduction

`caseFromSeed(1001074, generateOptionsFrom(config, DEEP_SPACE))`, simSeed 2110294577, run through
`fuzzSimulationConfigFor` — which reports over `full-run`, deliberately, so that a starvation bound
computed over five minutes of a twenty-seven-minute run cannot exempt most of the passengers.

```
topology  single-bank, 15 floors, 2 cars (main-2 = independent)   status completed, 177 legs
window    full-run [0, 1616.02) = 1616.0 s                        undelivered 0

saturation  verdict stable      saturated false     source recorded, 120 samples
            slope     0.4159 persons/min   (gate 0.5)   →  FAILS gate 1
            growth   11.202 persons        (gate 8)     →  passes gate 2
            g2n       1.323                (gate 4)     →  FAILS gate 3
            t         3.711                (gate 2)     →  passes gate 4
            queue: mean 20.8, peak 41, first sample 0, last sample 0

waiting     n 177   arrivals 177   unserved 0
            mean 172.067 s   median 101.79 s   p90 450.46 s   p95 686.43 s   p99 897.52 s
            max 922.65 s     67.8 % of legs waited over 60 s

awtIsValid  true            ← the defect
```

The shrinker reduces it in five steps to an **eleven-floor, single-bank, single-car,
all-in-service** building — `main-2` was `independent`, so it never answered a hall call and
removing it changes nothing — and the reduced case reproduces every figure above to the last digit.
It is not a service-mode artefact and not an exotic corner.

Two legs waited **922.7 s** in a run publishing a mean.

### Little's Law says the model is internally consistent

`λ = 177 / 1433 s = 0.1235 legs/s`; `λ · W = 0.1235 × 172.07 = 21.2`, against a measured mean queue
of **20.8**. The simulator is not wrong about anything. The queue really is that long, the waits
really are that long, and the two agree. **What was wrong was the report.**

---

## T21-D1 — the finding is a defect, and it is a hole in `awtIsValid`'s coverage

`checkStarvation` and `summarize.ts` were each right about a different claim, and the claims were
being treated as one.

`awtIsValid` had three grounds, and the two substantive ones are **both proxies for a single
question — did the backlog clear? — detected in two specific shapes**:

| gate | the shape it sees |
|---|---|
| trend (`SaturationDiagnosis`) | a queue that never clears and is **still growing** at the horizon |
| censoring (`DEFAULT_MAX_UNSERVED_FRACTION`) | a queue that has not cleared **by** the horizon, so the people in it are unserved legs |

Neither sees the third shape: **a queue that grew enormously and then drained before the horizon.**
`fuzz-1001074` is exactly that. It escapes the trend gate because a hump fits a shallow line with
large residuals — `g2n` 1.32 against a gate of 4, which is the *false negative* twin of the false
positive `SaturationThresholds` already documents — and it escapes the censoring gate because
everybody was eventually collected, 177 of 177.

That the run *recovered just in time* is precisely what let it publish, and the passengers in the
backlog absorbed the whole cost. That is the "statistics improve as the bug gets worse" failure
`CLAUDE.md` § Statistical discipline is written against.

**So this is a defect, not a defensible report**, and the fix belongs in `core`.

---

## T21-D2 — the gate is a **fourth `awtIsValid` ground**, not a fourth `SaturationVerdict`

The handback offered "a distinct verdict between `stable` and `diverging-queue`". Rejected, for a
mechanical reason rather than a stylistic one.

`detectSaturation` takes `readonly QueueSample[]` and nothing else. To produce a
"bounded-but-unacceptable" verdict from inside it, the rule would have to threshold **queue level**,
and queue level cannot be made scale-free: Little's Law is `L = λW`, so forty people waiting is a
normal morning in a 4 000-person tower and a catastrophe in an eleven-floor building with one car.
The observable that is *already normalised by the arrival rate* is the **wait**, which is why the
gate is stated in seconds and lives where the other AWT gates live.

Two consequences, both deliberate:

- `saturation.verdict === 'stable'` still means exactly "the trend test said stable". Every
  consumer reads it that way — `benchmark/arms.ts`'s ceilings, `saturationCensus.test.ts`, the viz
  overlay, `reports/compare.ts` — and widening it would have quietly changed all of them.
- `SaturationDiagnosis.saturated` is untouched, so `stopOnSaturation`, `CellAggregate.saturated`
  and every early-stopping path behave identically. **This is why no pinned estimate moved.**

The evidence lands on a **second diagnosis**, `RunSummary.serviceLevel`, modelled on
`SaturationDiagnosis` for the reason that interface gives: *a flag with no evidence is
un-auditable*. It names the passenger, the floors, the seconds, the horizon and the count.

### Censoring runs in the safe direction

A leg that never boarded has no waiting time but does have a waiting time *so far*:
`record.endedAt - arrivedAt`, a **lower bound**. It counts at that bound, and
`longestWaitIsCensored` says when the reported figure is one. Excluding the unserved would put the
gate's blind spot exactly where service is worst — the same argument
`DEFAULT_MAX_UNSERVED_FRACTION` is built on, applied to the tail instead of to the mean. This is
also why the CLI reads `serviceLevel.longestWaitS` rather than `waiting.maxS`, which is computed
over the legs that **boarded** and is therefore blind to the worst passenger in the building.

### The horizon is 900 s, and it is measured against, not chosen

Not a service-quality target. It is the point past which a wait stops being a bad wait and becomes
evidence that a passenger was *forgotten*, fixed the way `DEFAULT_MAX_UNSERVED_FRACTION` is — by
distance from the regime the project publishes in. Measured at the budgets the benchmark actually
uses, over every shipped operating point at every shipped profile:

| operating point | n | longest single wait | margin under 900 s |
|---|---|---|---|
| Midtown Office, up-peak 1 % | 250 | 203.7 s (`destination-panel`) | 4.4× |
| Garden Apartments, residential 2 %, full run | 500 | 136.6 s (`destination-panel`) | 6.6× |
| Secure Tower, up-peak 2 % | 150 | 121.2 s (`nearest-car`) | 7.4× |
| Midtown Office, interfloor-mix 1.5 %, full run | 1000 | **344.8 s** (`nearest-car`) | **2.6×** |

Every replication of every one of those cells returns `serviceLevel.verdict: 'served'`. The gate
does not fire anywhere the project quotes a number.

The cells that *do* produce longer waits — Secure Tower interfloor-mix under the conventional arms,
where an access-restricted pickup carries no credential and the call is permanently unassignable —
already lose their AWT at replication index 0 on gates 1 and 2, and are published as counts rather
than as an interval (`arms.ts`, `admissibleReplications: 0`). So the horizon sits clear above
everything the project publishes and below everything it already refuses to.

`benchmark/saturationCensus.test.ts` **re-measures and asserts** all of it, at the same budgets, so
none of those figures can go stale. T17's rule cuts both ways and this is the half that answers it:
a suppression rule that fires everywhere computes nothing, and this one fires nowhere it should not.

### Gate ordering

Saturation → emptiness → censoring → starvation. A run tripping more than one reports the most
fundamental reason, so **every existing `awtInvalidReason` string is unchanged**; only runs that
tripped *nothing* before can acquire the new text.

---

## T21-D3 — `checkStarvation` is not touched, and what it still catches

`packages/experiments/src/fuzz/properties.ts` is **unchanged, line for line**, and
`PROPERTY_BOUNDS.starvationBoundS` is still 900 s. P6's escape clause already reads

```ts
const flagged = !result.summary.awtIsValid || result.summary.saturation.verdict !== 'stable';
```

and its docstring already says *"a fifteen-minute wait is legitimate in a run that says so"*. The
run now says so, so P6 passes **for the reason it was written to accept**, without the property, the
bound or the generator moving.

`DEFAULT_MAX_WAIT_HORIZON_S` is deliberately the same 900 s **and deliberately not imported from
`PROPERTY_BOUNDS`**. The project should state one abandonment horizon and it belongs in the model
rather than in a test bound — which is the handback D83 made — but a constant shared between a check
and the thing it checks makes the check vacuous.

**The honest cost, stated rather than discovered later.** For a run whose starved legs lie inside
the report window, the core gate is strictly stronger than P6's condition, so P6 can no longer be
the thing that fires. Under the fuzz harness's own `reportWindow: 'full-run'` that is every run.
What P6 still covers, and the core gate does not:

- **Legs outside the report window.** `serviceLevel` is a statement *about a window* — under
  `peak-5min` a passenger starved at minute 25 is outside the cohort by construction, and is not
  something `summarize` is lying about. P6 scans the **whole record**.
- **Servability.** P6 re-derives from the building whether the fleet could legally have carried the
  leg, and exempts an access lockout or an unreachable floor. `core` has no such notion, so the two
  computations genuinely differ.
- **The window bounds and the censoring instant themselves.** P6 uses `record.endedAt` and its own
  selection; a bug in either of `summarize`'s would show as a disagreement.

`fuzz/faults.test.ts`'s P6 demonstration was rewritten rather than weakened, and now asserts the
whole chain on one real faulted run (`fuzz-102`, floor 4 starved to t = 1896):

1. with the model gate **off** — `maxWaitHorizonS` past anything the run reaches, the gate's own off
   switch — `checkStarvation` fires on three legs (worst 1147.5 s), and P1–P4 stay quiet;
2. with the gate **on**, the same run reports `serviceLevel: 'starved'`, `awtIsValid: false`, leg
   `leg10` at 1147.5 s, and P6 is correctly silent.

A version of that test still demanding a P6 violation would have been demanding that the simulator
go back to publishing a mean beside an abandoned passenger.

---

## What moved, and what did not

**Pins: none moved.** `PINNED_ESTIMATES` records `(n, mean, standardError, lower, upper)` from
`aggregateMetric`, which reads `record.metrics[metric]` and never consults `awtIsValid`. The only
path from that flag to a number is `stopOnSaturation`, which keys on `saturated` — untouched by
T21. Verified by the whole suite running green, including every `assertPinned` call site.

**`validation/golden/manifest.json`: unmoved.** It carries no simulator output, and `envelopeKeys`
is derived from `summarizeOptionsOf`, which stores only `window` and `terminalFloorIds`. The new
option is optional and unset on every golden run.

**`METRICS_SCHEMA_VERSION`: not bumped.** It versions `RunRecord` on disk. `RunSummary` is derived,
never persisted; the one stored artefact about it is `summaryFingerprint`, which is computed and
re-derived in the same build.

**`VIZ_SCHEMA_VERSION`: not bumped.** `VizSummary` copies `awtIsValid` and `awtInvalidReason`
rather than recomputing them, so the overlay, the canvas banner and `describeFrame` all inherit the
new suppression with no contract change — which is the payoff of D64's rule that the viz never
holds a second opinion about a `core` verdict.

### Consumers of the verdict vocabulary, checked

| consumer | reads | effect |
|---|---|---|
| `cli/format.ts` · `renderAwt` | `awtIsValid`, `awtInvalidReason` | inherits; prints the new reason |
| `cli/format.ts` · `renderLongestWait` | `serviceLevel` | **new**, and the non-test caller for the diagnosis |
| `cli/commands/run.ts` | both of the above | `longest wait` is no longer suppressed — see below |
| `viz` overlay / canvas / `describeFrame` | `summary.saturated \|\| !summary.awtIsValid` | inherits |
| `runner/replicationRunner.ts` | `saturation.saturated`, `awtIsValid` | inherits; `saturated` unchanged, so stopping is unchanged |
| `reports/compare.ts`, `reanalyze.ts` | `awtIsValid` per replication | inherits |
| `tuning/search/objective.ts` | `cell.aggregate.awtIsValid` | inherits |
| `benchmark/saturationCensus.test.ts` | first invalid replication per arm | re-measured; every recorded ceiling holds |
| `reports/persistence.ts` | `StoredSummarizeOptions` | new optional key, added to the `rejectUnknownKeys` allowlist |
| `tuning/space/collect.ts` | `METRICS_PARAMETERS` | one new declared row; `metrics.*` is excluded from the searchable space, so `SPACE.parameters.length` is unmoved at 49 |

### One behaviour change outside the gate, deliberately

`cli/commands/run.ts` printed `longest wait: SUPPRESSED` whenever the AWT was suppressed, off
`waiting.maxS`. That was wrong twice over. The mean is an *estimate* and the suppression rules are
about estimates; the longest wait is an **observation**, and it is the observation a suppressed mean
is usually hiding — the same distinction `viz`'s D64 draws. And `waiting.maxS` covers only the legs
that **boarded**, so on a run whose worst passenger never boarded it reported the longest wait among
the people who *were* collected. It now reads `serviceLevel`, is never suppressed, names the leg,
and says when the figure is a lower bound.

---

## A separate finding, uncovered while verifying — **HANDBACK**

The deep tier is green at its own default budget (250 cases, 0 failures). At the 2 000-case
overnight budget — the one that originally found `fuzz-1001074` — it reports **one** failure, and it
is **not** this one:

```
case      fuzz-1000384      simSeed 205687583
topology  sky-lobby   tags: sky-lobby, access-zones, mixed-use, initial-service-mode, service-schedule
status    timed-out, 480 passengers
  [termination] deadlock: the last passenger boarded or alighted anywhere at t=1734.7, and
                nothing has happened for the 1694.3 s before this run's hard deadline of
                t=3429, while journey "j35" (G to 4, waiting) was servable and outstanding
                since t=152.9
```

**P5 termination, not P6 starvation, and proven pre-existing.** Re-run on `c072f97` — the branch
point, with every T21 change stashed — it produces the identical violation to the same decimal. It
is also mechanically untouchable by this change: `checkTermination` reads `result.status`,
`deadlineS`, the boarding and alighting timestamps and the servability of an undelivered journey,
and consults neither `awtIsValid` nor `serviceLevel`. The shrinker reduces it in 33 steps to a
29-passenger case that still deadlocks, on a bank whose remaining car is `mode: "independent"` —
the same family as `DECISIONS-T20.md` § D79. It belongs to `sim/` and `dispatch/`, not to the
metrics layer. Recorded in `fuzz/deep.test.ts`'s header rather than filtered out.

---

## Known limitations

1. **The gate is per-window, so a `peak-5min` report cannot see a passenger starved at minute 25.**
   That is correct — a window statistic is a statement about its window — but it means the gate's
   coverage depends on the analyst's window choice, and the fuzz harness's `full-run` choice is what
   makes it total there. P6's whole-record scan is the backstop.
2. **900 s is a stated horizon, not a derived one.** It is defended by distance from the shipped
   operating points (2.6× at the tightest) and by the 60 s long-wait metric being two orders of
   magnitude below it, but a project with a different service target would state a different number.
   It is declared in `METRICS_PARAMETERS` and settable per-summary for exactly that reason.
3. **The gate cannot distinguish an abandoned passenger from an unservable one.** `core` has no
   servability notion and acquiring one would mean `metrics/` importing the building model. A run
   with a permanent access lockout is therefore reported as `starved`, which is arguably the right
   answer for a report and is definitely not the same claim P6 makes.
4. **`overHorizonCount` is a count, not a rate.** A run with one abandoned passenger and a run with
   two hundred both come back `starved`. The count is on the diagnosis so a reader can tell them
   apart; the *flag* deliberately does not, because one abandoned passenger is already enough to
   make the mean a description of a system nobody experienced.
