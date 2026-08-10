# Everyday Mode — design handoff

Four documents. Read them in this order.

| # | Document | What it settles |
|---|---|---|
| 1 | **GAMEPLAY_AND_NAVIGATION.md** | What the player does and sees. Every screen, control, flow and rule |
| 2 | **ENGINE_CONTRACT.md** | What the machine computes. Every seed, formula, threshold and constant |
| 3 | **BUILD_PLAN.md** | What to change, in what order, in which files, and how to prove it |
| 4 | **ISSUE_ADJUDICATION.md** | How each open repo issue is answered, and which requests became rules |

The design prototype is `Elevator Sim Casual.dc.html` at the project root. It is the **layout and
copy reference**: sixteen screens, real data, real text, drawn at the intended density.

## Precedence, when two sources disagree

1. **Layout, spacing, type, copy** → the prototype wins.
2. **What a control does, what a number means, what happens next** → the gameplay guide wins.
3. **A number, a formula, a seed, a threshold** → the engine contract wins.
4. **Anything about the existing codebase** → the code wins. Read the seam before editing it; the
   file map in BUILD_PLAN.md names paths and exports, not internals.

Where the prototype fakes something — a score from a closed-form model rather than a run, a ghost
that ignores the picker, a hand-written board — it is listed in §20 of the gameplay guide as
work, not as design. The prototype is not the spec for anything that has to be computed.

## The one rule that cannot bend

Everyday Mode may change *what it says* and *how it asks*. It may never change *what is true*,
and it may never claim something the engine cannot support.

Three consequences, and they are non-negotiable:

- **Never declare a winner from one run.** A day is an anecdote. Only the bench compares, and it
  is allowed to answer *too close to call*.
- **Never show a figure whose basis has gone stale.** An unfinished day shows `—`, not `0%`. An
  edited dispatcher reads *not since your last change*, not its old bench result.
- **Never let two numbers on one screen disagree.** Derive every count from one expression. This
  was the single largest source of defects while prototyping.

## Definition of done, for the whole handoff

- Every control on every screen either reaches the simulation or says it does not (`takes effect
  on the next run`, plus the re-run). No control silently does nothing.
- Every figure a player can compare with another player comes from a seeded, replayable run.
- No engine identifier appears on any Everyday surface, in any state, including fallbacks.
- The honesty sweep enumerates states from the state model, not from a fixture list, and every
  withheld figure renders `—` or a labelled unavailable state.
- Every screen renders correctly with the API unreachable.

## Vocabulary

§2 of the gameplay guide is a fixed word list — day, run, dispatcher, play style, lever, cost
term, ghost, wrinkle, the bench, the board, the ladder, the gauntlet, unit, works night,
cleared/missed, standing, slot, case. Use those words in code, in copy, and in review comments.
Drift in these words is how two screens end up disagreeing.
