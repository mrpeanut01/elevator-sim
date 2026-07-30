# Project Brief

## Vision

An elevator simulator where you can design buildings — varying floor counts, elevator
counts, and security zones — then simulate realistic passenger traffic for apartment
buildings, office towers, hotels, and mixed-use high-rises. The purpose is to develop and
rigorously benchmark **smart dispatch algorithms** that predict where cars should
pre-position, bypass calls intelligently, coordinate cars in parallel, and respect real
capacity limits driven by a load sensor.

## Scope

### In scope

- Building configuration: floors, elevator banks, cars per bank, service zoning, access-control zoning
- Elevator physics: S-curve motion profiles (acceleration and jerk limited), door state machines, load weighing
- Passenger traffic generation: Poisson batch arrivals against per-building-type demand profiles
- Pluggable dispatch policies, from naive baselines to learned controllers
- Multi-replication experiment runner with confidence-interval-based stopping
- Comparative analysis between dispatchers using common random numbers and paired-t intervals
- Visualization of a single running simulation

### Out of scope (for now)

- Escalators and moving walkways **as machines**. They are now in scope as *edges*: a building may
  declare one as a connection between two floors with a landing-to-landing traversal time, so a
  journey is not charged an elevator leg for a hop the real building serves with an escalator. What
  stays out of scope is the machine — no capacity, no headway, no direction, no failure modes. See
  [`docs/02` § Non-lift transport](02-elevator-reference.md).
- Structural, electrical, or code-compliance engineering
- Real hardware integration or safety-critical control
- Freight/service elevator scheduling as a distinct discipline
- Evacuation modeling (may become a later extension)

## Non-goals

- **Not** a building-code compliance tool. Reference values are drawn from published
  standards for realism, but this is a research simulator, not a certification instrument.
- **Not** an attempt to reproduce any specific vendor's proprietary dispatcher.

## Success criteria

1. **Validated against theory.** Under pure up-peak, simulated handling capacity and
   interval agree with the closed-form Barney/CIBSE round-trip-time calculation within a
   few percent. This is the primary correctness oracle.
2. **Statistically honest.** Every reported comparison carries a confidence interval.
   No dispatcher is declared better than another without a paired-t interval that excludes zero.
3. **Reproducible.** Any run can be replayed exactly from its stored seed.
4. **Fast enough to sweep.** Capable of thousands of headless replications across a
   configuration matrix in reasonable wall-clock time.
5. **A learned dispatcher beats the naive baselines** on average waiting time and
   95th-percentile waiting time, on at least the mixed-use building.

## Key design assumptions

These are decisions made to unblock implementation. Any of them can be revisited.

| Assumption | Rationale |
|---|---|
| TypeScript, headless core + separate web visualization | Same code runs in Node for batch experiments and in-browser for demos |
| Discrete-event kernel, not fixed-timestep | Statistics demand thousands of runs; DES is ~100× cheaper than 100 ms ticking |
| Deterministic execution, stochastic model | Enables common random numbers and replayable bugs at effectively no cost |
| Destination dispatch is v2, not v1 | It changes the passenger model fundamentally (destination known at call time) |
| Metric distributions persisted per run, not just aggregates | Re-analysis without re-simulation |

## Primary metrics

Average waiting time is the headline number, but means hide exactly what makes elevators
feel bad. Every experiment records:

- **AWT** — average waiting time, with confidence interval
- **WT95** — 95th percentile waiting time (what people experience as "bad")
- **% waiting > 60 s** — standard long-wait quality metric
- **TTD** — time to destination (wait + ride); the metric destination dispatch optimizes,
  and the one AWT alone unfairly penalizes it on
- **Car load factor distribution** — validates the capacity model
- **Achieved handling capacity** — persons per 5 minutes

## Open questions

- Should evacuation / fire-service Phase I & II recall be modeled, or only stubbed as car modes?
- Do we model passenger balking (giving up and taking stairs) at long waits?
- How faithfully should double-deck elevators be modeled — do we need even/odd floor
  assignment logic in v1, or can the supertall building wait?
