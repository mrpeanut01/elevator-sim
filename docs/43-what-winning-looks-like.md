# What winning looks like

**The termination condition for autonomous work on this project.** A standing panel of agents
scores the product on the nine axes below. When the primary four are at their bar and no assessor
can name an obvious next change of real size, the work stops. Until then it continues.

This document exists because the first version of that panel was wrong about what it was for.

## 1. The correction this document is

The panel was originally given five axes: depth, correctness, reachability, legibility and honesty.
Every one of them is an engineering axis. Together they answer *is this thing sound?*

**Not one of them would notice a game that is correct, honest, fully reachable and boring.**

That is the failure this project is actually exposed to. It has a discrete-event elevator simulator
with a closed-form correctness oracle, ten honesty properties, a fuzz tier and a statistical
discipline that refuses unearned claims. It has spent far more of its life on those than on whether
anyone wants to play. Six research agents reading the tree independently converged on one diagnosis
from six directions: the engine is years ahead of the game layer.

A panel scored only on soundness would have ratified that gap forever, because the gap does not
show up on any of its axes.

So the four axes below are **primary**, and the five engineering axes are demoted to a **floor**.
The floor is necessary and not sufficient. A game that fails the floor is not shippable. A game that
passes only the floor is not worth shipping.

**The goal is a winning game, not a science project.**

## 2. The primary axes

Each axis below gives the question, what good looks like for *this* game specifically, a protocol
that can actually be run, the failure mode, and the particular way this project is at risk on it.

**These four are judged by playing, not by reading.** An assessor who has not played a full sitting
has no score on them. Reading the source tells you what is implemented; it tells you nothing about
whether the ninety seconds after pressing Start are worth a person's evening.

---

### P1. Game-play — is the thing you do second to second any good?

**The question.** A player watches a tower fill up and changes how the lifts behave. Is that an
activity, or is it a progress bar with a settings screen attached?

**What good looks like here.** A player faces a real choice often enough to stay engaged; the
choices are not dominated by one obvious answer; the result of a choice arrives soon enough to
learn from; and a player who understands the system beats one who does not, by a margin they can
feel. The tower developing a problem in front of you, and you seeing it before the numbers do, is
the moment this game is built around. It should happen often.

**Protocols.**

- **Decision census.** Play one full sitting. Log every point where you had a genuine choice and
  the choice mattered. Report decisions per minute and the *longest gap* between them. The longest
  gap is the number that matters; an average hides a five-minute stretch of watching.
- **Dominance check.** Across the shipped content, is there one dispatcher, one dial setting or one
  opening move that wins nearly everywhere? If so, the choice space is decorative. Test by playing
  the dominant line and a second line and comparing.
- **Skill delta.** Same seed, same tower. One run played by an assessor who has read how dispatch
  works, one played naively. Is there a gap, and is it visible to the player without a spreadsheet?

**Failure mode.** Set it up, press go, read a table. The player is an observer of a simulation
rather than a participant in it.

**This project's specific risk.** The engine is very good at producing a correct answer from a
configuration. That makes "configure, then watch" the path of least resistance for every screen
built on it. The previous wave measured a real instance: three of 200 sampled dial configurations
cleared stage 1, which means that for most players, moving the dials did nothing they could see.

---

### P2. Usability — can a person operate it without being taught?

**The question.** Not "is it accessible" (there is already a standard for that, `docs/36`) and not
"is it pretty" (there is already a handoff for that, `docs/12`). Can someone sit down and *do the
thing they are trying to do*, without a manual and without getting stuck?

**What good looks like here.** A new arrival reaches something they are actually playing in well
under a minute. Every control does what its label says. When a player wants to change something,
they can find where. Nothing important is behind a door they have no reason to open.

**Protocols.**

- **Cold-start clock.** Measured on the built bundle, not in a test harness: navigation to the
  first moment the player is doing something that affects a run. Report the number in seconds and
  say what the intervening screens were.
- **Lost count.** Over one full session, count every moment the assessor did not know what to do
  next, or could not find a thing they wanted. Each one gets a sentence. A count of zero on a
  first-ever session is suspicious and probably means the assessor already knew the product.
- **Label truth.** This repository already has the right rule: *move the control and require the
  run to change, compared on the legs*. Apply it to every control a player can reach, and report
  any that do nothing, or that do something other than what they say.

**Failure mode.** Depth that is real and unreachable. Controls that are live but unfindable, or
findable but inert.

**This project's specific risk.** It is documented and repeated: behaviour that is configured,
validated, tested in isolation and called by nothing a player can reach has shipped eleven times in
code and twice in data. The same defect with its polarity reversed has also shipped: a control
described as doing nothing that had been live for many waves.

---

### P3. Understandability — can the player tell what happened, and why?

**The question.** The run ends. The player did better or worse than last time. Do they know *why*,
and could they have predicted it?

**What good looks like here.** A player can name the chain from what they changed to what happened.
When a day goes badly they can say which decision cost them, not merely that the number moved.
Crucially, a player who has played a few sittings can **predict** the direction of a change before
making it, and be right more often than chance without being right every time.

Prediction is the real test, and it is stronger than explanation. A system you can only explain
after the fact is one you are rationalising, not understanding.

**Protocols.**

- **Prediction test.** Before each change, write down the predicted direction and rough size of the
  effect. Then run it. Score across at least ten predictions. **Both tails are failures**: near
  chance means the game is noise and the player is gambling; near perfect means the game is
  arithmetic and there is nothing to learn.
- **Blind diagnosis.** Take a failed run. Without reading the source, name what went wrong and what
  would fix it. Then check against what actually happened. Report how close you were and what
  information the product gave you that got you there, or failed to.
- **Causal chain.** After a sitting, write the chain from one action to one outcome in plain
  sentences. If you cannot, say which link was missing and where you would have expected the
  product to supply it.

**Failure mode.** "The number went down and I do not know why." Or its quieter cousin: the player
invents a theory the game neither confirms nor denies, and plays on a superstition.

**This project's specific risk.** The honesty discipline correctly refuses to state a mechanism it
has not measured. That is right, and it creates a hazard: a product that refuses to explain is
honest and opaque at the same time. **A refusal is not an explanation.** Where the engine genuinely
knows why something happened, the game should say so; where it does not, the game owes the player a
way to find out by experiment rather than a blank.

---

### P4. Entertainment — is there a reason to come back tomorrow?

**The question.** Not "was that pleasant." Is there a specific pull that brings a person back
without a notification badge doing the work?

**What good looks like here.** A session ends at a satisfying point rather than simply running out.
Something is left open that the player wants to close. The twentieth run offers choices the second
run did not, rather than the same choices with larger numbers. And something that happens in a run
is worth telling somebody about.

**Protocols.**

- **The tomorrow question.** After a session, unprompted, name the specific thing that would bring
  you back. Not "it was fun." A thing. If the honest answer is "nothing", or "to finish the list",
  that is a finding and it should be reported as one.
- **Run 2 against run 20.** Play early and late. Is the late run meaningfully different in *kind*,
  or the same activity against bigger figures? Name what changed.
- **Stopping point.** Does a sitting end somewhere that feels like an ending? Note where you
  actually wanted to stop against where the product stops you.
- **The story test.** Describe one thing that happened in a run, to someone who does not play. Is
  it interesting? A game about a system produces stories when the system surprises you; if nothing
  is worth retelling, nothing surprising happened.

**Failure mode.** A daily chore with a streak counter. Or the opposite: a game that is complete
after three sittings and has nothing further to offer.

**This project's specific risk.** A simulator's natural end state is a solved configuration. Once a
player finds the setup that works, the reason to return is gone unless the content, the towers or
the demands keep changing underneath them. The campaign ladder is the intended answer to this and
it does not currently work: seven of ten stages have no measured way through, and a bought budget
rung reaches the same single configuration as the base rung.

---

## 3. The floor: five axes that gate rather than win

These are the original five. They are necessary and not sufficient, and they are scored the same
way, with evidence, but a high score on them earns nothing on its own.

| axis | the question |
|---|---|
| **Depth** | Is there genuinely a lot modelled, and genuinely a lot to play? |
| **Correctness** | Is it right, and is being right checked by something mechanical rather than asserted? |
| **Reachability** | Can each capability be driven from a shipped path? Engine side: *name the non-test caller*. Game side: *name the screen*. |
| **Legibility** | Can a competent reader tell what happened from what the product published? |
| **Honesty** | Does it refuse what it cannot support, and is the refusal itself checked? |

**Honesty is the one floor axis that may never be traded against a primary one.** Every other floor
axis can be argued about. This one cannot: a game that entertains by telling the player something
the run did not produce has not scored on P4, it has cheated on it, and the charter's non-goals bind
regardless of what any panel scores.

## 4. How the panel decides

Each assessor scores all nine axes 0 to 10 with evidence per score, and answers one question:
**is there an obvious next change of real size?**

The work stops when **all** of these hold:

1. Every primary axis at **8 or above**, from assessors who played.
2. Every floor axis at **7 or above**.
3. Honesty at **9 or above**, on its own, because it is the one that may not be traded.
4. **No assessor can name an obvious next change of real size.** Four independent assessors, none
   of whom can name one between them.

Condition 4 is the real gate and the other three are sanity checks on it. A panel that scores
everything at 9 while naming three obvious next changes has not reached the bar; it has just been
generous with numbers.

**The panel is told not to trust its own brief**, and given a reason: the integrator who writes
these briefs has been wrong about this tree repeatedly and in writing, including an overstated
premise about what the content could do, five citations to decision numbers that do not exist, and
a CI watcher that reported green while three jobs were still running.

## 5. The tension with the honesty discipline, and how it resolves

An obvious worry: does making this entertaining mean relaxing the rules that make it trustworthy?

**Measured answer: no.** Fifteen genre levers were tested against the charter's non-goals in the
previous wave and not one of them required a rule to be relaxed. The constraint binds on *how* you
entertain, not on *whether*:

- You may not show a number the run did not produce. You may absolutely make the numbers the run
  did produce arrive at a better moment, in a better form, with the thing that caused them attached.
- You may not soften a refusal. You may replace a bare refusal with a refusal plus a way for the
  player to go and find out.
- You may not add a difficulty setting that moves a measurement. You may add content whose
  difficulty varies, which is a different thing entirely.

And the stronger form of the same point: **the engine is the differentiator, not the tax.** Plenty
of games let you place lifts in a tower. None of them are sitting on a simulator that agrees with
the CIBSE closed form to about three percent. A player who learns something true about how lifts
actually behave has got something no competitor offers. That only pays off if the game surfaces
it, which is exactly what the primary axes measure.

## 6. What this document does not do

It does not score the product. The panel does that, and its reports are the record.

It does not rank the four primary axes against each other. They are named in a rough order of how
early a player meets them and not in order of importance.

It does not set the bar by argument about where it should be. The numbers in § 4 are a starting
position, and if a panel finds them wrong it should say so with evidence and they should move, in
the direction the evidence points. **The one thing that may not happen is the bar moving to let the
current state pass** — that is the working agreement this repository already has about acceptance
criteria, applied to itself.
