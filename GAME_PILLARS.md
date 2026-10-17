# Game pillars

A one-page brief that every agent reads before designing or building anything in the game layer.
It is a summary, not a source of record: what the game is lives in
[`docs/38-what-the-game-is.md`](docs/38-what-the-game-is.md), which decisions are in force lives in
[`docs/39-decisions-in-force.md`](docs/39-decisions-in-force.md), and where either disagrees with
[`CLAUDE.md`](CLAUDE.md), `CLAUDE.md` wins. Drafted 2026-10-17 from those documents; the product
owner has not yet confirmed this page.

## Pitch

You take a building whose lifts are struggling, watch the people queue, change something, and find
out whether they got where they were going. The engine is a real lift simulator, so when the game
says your change worked, it worked.

## Core loop

1. **Watch** a building in trouble, live, at a speed where a queue visibly thins or grows.
2. **Change** something, at a price: dispatcher tuning is cheap, equipment settings dearer, the
   building's fabric dearest.
3. **Run it again** on the same crowd and read the verdict: fixed, not fixed, or too close to call.
4. **Earn chimes** for what you finish, and spend them to widen a budget elsewhere.

Three modes, Scenario first on the menu: **Scenario** (a building, a problem, a budget, a verdict),
**Career** (several buildings over months, on money you earn), **Rush** (one building, a growing
crowd, how long you last).

## Player verbs

Watch, change a setting, buy a change, run, speed up or skip, read the verdict. A new verb has to
replace one of these or justify itself against pillar 3.

## Pillars

1. **Playable.** It runs, loads fast, takes input reliably and never strands the player. A crash,
   softlock or unreadable screen outranks any feature.
2. **Understandable.** A new player can state the goal within 30 seconds and make a correct first
   move without documentation. Every action gets feedback that says what happened and why.
3. **Simple.** Few verbs, clear consequences. Depth comes from simple rules interacting during a
   run, not from more systems, menus or modifiers.
4. **Engaging during a run.** Frequent meaningful choices, rising tension, visible progress, and a
   clear win or loss moment. Dead time, unreadable chaos and choices with no felt consequence are
   defects.

Where a pillar and the engine's honesty seem to collide, change the design until both hold. The
engine's rules in `CLAUDE.md` (no verdict without a paired interval that excludes zero, saturation
suppresses a mean) are never traded for a pillar.

## Simplicity budget

Before a feature or mechanic is approved, answer three questions in its issue or decision entry:

- Which pillar does it serve, and how would a player notice?
- Which existing verb, rule or screen does it add to, replace or remove?
- Can a new player understand it without a tutorial step?

Prefer work that removes friction, clarifies feedback or tightens pacing over work that adds a
system. When two solutions work, ship the simpler one.
