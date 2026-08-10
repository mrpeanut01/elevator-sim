# Issue adjudication — Everyday Mode design

Every open issue in `mrpeanut01/elevator-sim`, adjudicated against the Everyday Mode design
(`GAMEPLAY_AND_NAVIGATION.md`, `ENGINE_CONTRACT.md`). One block per issue, written to be pasted
as a comment on that issue.

Verdicts used:

- **Fixed by design** — the design as written already resolves it; the block says where.
- **Fixed, with an adjustment** — the issue changed the design; the block says what changed.
- **Adopted as a requirement** — the issue's request is now a rule in the spec.
- **Out of scope, with a design consequence** — infrastructure, but it constrains a screen.

Sources: #116 and #147 were read in full. #91, #93, #94, #96, #98, #123, #130, #145, #146 and
#149 were adjudicated from their titles plus #116's cross-references; if a body contains
something these blocks miss, the adjudication is what needs correcting, not the issue.

---

## #116 — Point of view: how the game should work before a run, during a day, and between days

**Verdict: fixed, with an adjustment — this issue changed the design in two places.**

The thesis is right and it is now the spine of Everyday Mode. Taking the three acts in order.

**Before a run.** *A building is a commitment, not a setting* is adopted verbatim. In the
campaign a building keeps its own purse, its own carried units, its own standing order, its own
wear clock and its own contract day; switching buildings resumes rather than resets, and the
triage row prints exactly the resume line you asked for (`day 4 · 4 cleared · 0 missed`). The
picker sells the building: every row carries its quirk in one line (*Everyone leaves within the
same twenty minutes*), its complexity 1–5, its fee, and its record. The daily mode needs no
picker at all — one tower a day for everybody — which removes the whole class of
"three tabs disagree about which building you are on".

Your saturation point became a content gate. §17 now requires that a candidate day only ships
if it **changes which dispatcher wins**, and §20 adds day-one gradeability: a contract's day 1
must land inside the gradeable band, and saturation must be something the player causes by
week two, never the state a level ships in. The suppression rule stays exactly as strict.

**During the day — the adjustment.** The design previously said dispatching is a policy you
commit to and then observe, with one exception for the campaign incident. Your measurements
retire that position: 181 ms / 828 ms / 1,521 ms a run, and 100 runs in 4.3 s warm, is not a
budget that justifies a movie. §7.6 is new and specifies the model you proposed:

> A run is `(seed, config, interventions[])`. An intervention is `{ atS, change }`, appended
> when the player makes it; the run re-simulates from t = 0 and playback resumes at the same
> playhead. The prefix is bit-identical, so the picture does not jump; only the future changes.
> Replay verification replays the intervention log, so nothing about the honesty of a posted
> score changes.

It starts with one lever, and it is the one you named: *Park the cars in the lobby*. Dispatcher
switching is second. The campaign incident answer was already this shape — an answer stamped
with the simulated time it was given — so the mechanism existed and was scoped to one mode; it
is now general, and the report lists every intervention with its timestamp.

The honesty requirement you set for the minimum pass is also now a rule: a control that cannot
take effect mid-run must say `takes effect on the next run` and offer the re-run, because a
control that does nothing and says nothing is worse than one that is disabled (§16).

*Something to watch* is settled: the stage is the screen, not 6% of it — a warm cutaway with
figures drawn per person and **coloured by how long they have stood** (green under 30 s, amber
to a minute, terracotta to two, grey once they have taken the stairs). That ramp is specified
as the game's core read.

**Between days.** Your ordering is adopted as the required sequence for a campaign report
(§6.5): the verdict, what it cost you, **what changed overnight**, what you can spend, one
button into tomorrow. Two specific fixes came from your notes: the next day now opens **paused**
on its first frame, and **speed no longer carries across days** — it resets to the player's
default, so a day can never vanish in three seconds at ×900.

The economy you said the copy was describing now exists and is the campaign's whole tension:
a perfect standard month pays 98 units, the shop is worth 324, a fourth shaft costs 34 units
**and eight nights of works that take a car out on days you still have to clear**. A shaft is
never free and never instant. Growth is bounded by the building: tenants are occupancy against
design capacity, so a 120-person building cannot reach 370, and every `N of M` counter derives
both numbers from one expression.

*A day should be a day* is fixed: Everyday Mode's day is 06:00–19:00, 46,800 simulated seconds,
with a morning peak, a lunch flow and an evening exodus, not a 30-minute rush.

**The meta.** Board fragmentation cannot happen here by construction: there is exactly one
daily board, keyed by the day, and the fixed forty-case gauntlet is the only other ranking.
Nothing about a player's configuration enters a board key, and a run cannot post if the tower,
machines or crowd differ from the day's fixture. Replay verification is advertised on the board
itself rather than hidden.

**What must not be lost** is §1 of the guide, promoted to the one rule that cannot bend. The
bench still answers *too close to call* when the interval contains zero; energy stays an axis
and never a grade; an unfinished figure is `—` and never a zero.

---

## #96 — The simulation stage is passive: no in-run decisions, no real-time interventions, no moment where the player feels like the dispatcher

**Verdict: fixed, with an adjustment.** Same change as #116 §2, and this issue is why it is
specified rather than argued.

§7.6 gives the player timestamped interventions during a day, re-simulated deterministically
from t = 0 with playback resuming at the playhead. The campaign dock makes the strongest version
of it: a live incident with real options and real costs, answered when you have seen enough,
stamped with the time you answered, and printed on the report. *Nothing changes until you do,
and the day carries on without an answer.*

What the design deliberately does **not** do is let the player steer cars. There is no joystick,
because a joystick would make the dispatcher irrelevant and the scores incomparable. The fantasy
being served is the supervisor's — you change policy and watch the building answer — and the
interface says so plainly rather than leaving a newcomer hunting for a control that should not
exist. If that reads as too little agency once #116 §2 is in, the next lever to open up is
holding a named car at a named floor, which is a policy statement with a timestamp and survives
replay verification.

---

## #91 — Inter-day loop is invisible: no 'Tomorrow' screen, no building growth reveal, no sense of progression between days

**Verdict: fixed by design.**

Everyday Mode has three between-day surfaces and each has a job. **Your week** is the seven-day
strip with today withheld until it is closed. **The report** ends a day with a verdict and, in a
campaign, the required sequence from #116 §3 — including *what changed overnight*: tenants
moving in, an event booked, a car out for service. **The rolling calendar** on All buildings is
the progression made visible: a thirty-column sliding window, one row per building, with
cleared, missed, works, decisions due and today all marked, and a career band above it counting
days worked, months held, standing, service windows due and contracts lost.

The day card you asked for is the brief, and the next day now opens **paused** on it rather than
already running. Progression is not cosmetic: standing opens slots, slots gate offers, offers
are gated again by whether anything you hold is one miss from ending, and renewals are priced
off your record.

---

## #94 — Building selection is not persistent: switching resets traffic and dispatcher config with no confirmation

**Verdict: fixed by design, and promoted to a rule.**

State in the campaign is keyed per building, not global: purse and carried units, standing order
(dispatcher and build), fitted kit, booked works, wear, contract day, cleared and missed. The
triage list edits a building's standing order **inline** without opening it, so the common case
never navigates at all. Nothing about opening one building disturbs another.

Two rules now cover the general case (§16): **nothing in the rail changes what is running** —
navigating away from a running day scores nothing and discards nothing, because `screen` and the
simulation are separate — and a switch that genuinely would discard work states the consequence
before it happens, in the same confirm-strip pattern used for leaving a day mid-run. Resume is
always preferred to reset.

---

## #98 — [UX] No onboarding or guided first-run experience

**Verdict: fixed by design, with one addition.**

**Fix a building is the onboarding**, and it is designed for the job: eighteen cases, each one
building with exactly one thing wrong, a tenant's complaint in their own words, the diagnosis
printed plainly, and a repair budget small enough that the decision is legible. It teaches the
vocabulary the other three modes assume — dwell, zoning, parking, service range, capacity
against crowd — and each case teaches exactly one transferable idea. It is also the cheapest
content in the game to author.

The addition: the main menu's first-run state routes a new player to Fix a building's first
unsolved case rather than to today's tower, and the front door carries three numbered steps
(*pick who drives · watch the day · read what happened*) so a stranger knows the shape of the
next three minutes before committing to any of it.

On #116's related note that "Casual" appears nowhere outside a `<select>`: the mode names itself
in the rail (`EVERYDAY MODE`), the menu explains what it is and is not
(*Nothing in Everyday mode is a simplified model — only a plainer way of asking it questions*),
and the view choice is asked once on first run rather than hidden in a dropdown.

No modal tour, no coach marks, no dismissible tooltips. The teaching is the content.

---

## #93 — Leaderboard has no social hooks: no "Beat this score", no player profiles, no "How did they do it" dispatcher reveal

**Verdict: adopted as a requirement, in an honest form.**

Two of the three are in, and they are the two that make the game better rather than louder.

**"How did they do it" is adopted outright** and is the best idea in the issue. Every posted run
is a dispatcher, and the design already treats a dispatcher as a first-class, nameable,
inspectable object: what it started from, how many levers moved, how many rules, what it was
proved on. A board row therefore expands to show that, and offers **load it into the workshop as
a copy** — which converts the board from a wall of strangers into a source of material.

**"Beat this score" becomes `Race this run`.** The daily mode already runs a second dispatcher
beside yours on the identical crowd; a board row simply becomes a fifth option in the ghost
picker, alongside the world's middle, your best, the plain baseline and nobody. You do not chase
a number, you watch their line and yours diverge on the same morning. The strip's standing
caveat still applies: *one day each on the same crowd — that is a race, not proof.*

**Player profiles are declined in the form requested.** A profile page invites vanity metrics,
and vanity metrics are exactly what the honesty rules exist to keep out. What ships instead is a
name, their posted runs, and their dispatchers — the things that are verifiable. No streak
badges, no levels, no titles.

---

## #147 — A hard constraint has no player-facing name, so a card can say what a constraint *is* but never what `noDirectionReversal` does

**Verdict: adopted as a requirement, and it corrected the design.**

This issue caught a mistake before it shipped. The natural instinct when writing Casual copy is
exactly the thing invariant 7 forbids: a lookup table in the renderer mapping engine ids to
friendly prose. Everyday Mode is a copy-heavy surface, so it is the most likely place in the
product for that table to appear, and it would have.

Three rules are now in the spec:

1. **No engine identifier may reach a Casual surface.** Not as a fallback, not in a tooltip,
   not in a debug corner.
2. **The player-facing name and its one-clause effect are declared beside the parameter in
   `core`** — next to the constraint in `DISPATCH_PARAMETERS`, the way `CostTermSpec.measures`
   already works — and Casual reads them. A constraint added tomorrow arrives with its own
   sentence. The thirteen cost-term names, their `serves` clause and both of their ends, which
   Everyday Mode prints on sliders, are covered by the same rule: they belong to the model, not
   to the screen.
3. **Two readers, two fields.** The optimizer's description exists to let a generic search
   explore the space; the player's name exists to let a person act. Collapsing them to save a
   field produces a sentence addressed to nobody. Everyday Mode's voice guide is explicit about
   its reader, which makes the shared-string version unusable in practice as well as in
   principle.

The id-only fallback survives, unchanged and asserted: a constraint with no player-facing name
still renders *a filter no weight can buy past* plus its id, so adding a constraint degrades
gracefully instead of silently.

---

## #146 — The dispatcher editor prints `cost = 1.00·wait + 0.30·starvation` in one register — the string #100 quoted, on the surface it did not name

**Verdict: fixed by design.**

The compiled cost line is genuinely worth showing — it is the moment a player realises the
dispatcher is arithmetic and not magic — but it cannot be dropped into a screen in a different
register than everything around it. In Everyday Mode it lives behind a disclosure labelled
*show me the maths*, inside the tinker drawer, and three things are required of it (§11.3, §16):

- **A plain sentence comes first, always:** *Every time somebody presses a button, each car is
  given a score for answering it. The lowest score wins the call. It is a way of choosing between
  cars, not a measure of how the day is going.*
- **The formula may only appear on a surface where every symbol in it is named.** The terms in
  the line are the same terms the sliders above it are labelled with, in the same words, so
  `wait` and `starvation` are never the reader's first encounter with either.
- **The signs are explained**, because an unexplained minus is worse than no formula:
  *distance and a full car push a score up; a long wait pushes it down, which is why the minus
  sign is there.*

Combined with #147, the words in that line come from `core`, so the formula and the sliders
cannot drift into two vocabularies.

---

## #130 — Four editor tabs are hidden until the rail opens one, the reveal is not persisted, and nothing tells a player they exist

**Verdict: adopted as a requirement.**

Everyday Mode leans hard on progressive disclosure — the tinker drawer, the thirteen cost terms,
the advanced rules, the design document, the full building editor in each fix case — so this
issue's failure mode is a live risk here rather than a distant one. Three rules now govern every
disclosure in the mode (§16):

1. **A collapsed header states what is inside and how much of it**, so the thing announces
   itself: *Advanced: write your own rules — when this happens, do that · 3 rules*;
   *the 13 cost terms — 4 weighted*. Never a bare chevron.
2. **Disclosure state persists per player.** `tinker`, `rules`, `showAllTerms`, the design
   document and each fix case's editor are saved. A player who has found the rules editor should
   never have to find it twice.
3. **A disclosure is never the only route to a surface.** Everything reachable by opening a
   drawer is also reachable from the rail, from the brief's *Open the workshop*, or from a
   report lever — which is why the report's levers hand off directly into the exact panel that
   answers them rather than dropping the player on a tab.

---

## #145 — The honesty sweep's week fixtures are hand-written, so a week state a player can produce was never swept

**Verdict: adopted as a requirement.**

This is the right critique of the whole honesty apparatus: a sweep over authored fixtures proves
the fixtures are honest. Everyday Mode has four independent reasons a figure must be withheld,
and they combine, which is exactly the combinatorial surface a hand-written fixture set will
miss:

- the day is not closed (`dayClosed` is false),
- the run was a replay of a past day,
- the run was a sandbox run (tower, machines or crowd changed),
- posting is off (`noPost`).

The rule: **the sweep enumerates states from the state model, not from a fixture list.** Every
combination of those four, across Your week, Today's board, the ladder, the percentile line and
the report, must render `—` or a labelled unavailable state and never a zero, a spinner or a
stale figure. §18 of the guide is the enumeration source; §20.11 marks every authored fixture
still standing in the prototype so none of them can be mistaken for truth.

The prototype's own week and board rows are hand-written today, and are listed as fixtures
needing a real source for exactly the reason this issue gives.

---

## #123 — Preview environments cannot reach the API, so the surfaces most likely to break are the ones a preview cannot test

**Verdict: out of scope for the design, with one design consequence.**

The deployment fix is not a design question. The consequence is, and it is now a rule (§16):
**every screen must render correctly with the API absent.** World figures — yesterday's
distribution, the two histograms, the board, the ladder, the style split — degrade to a labelled
*world figures unavailable* state. Never a zero, never a spinner, never a silently empty chart
that reads as "nobody played".

That rule is worth having independently of previews: it is also what a player sees on a train.
And it makes the surfaces this issue is about testable in a preview without an API, because the
API-absent state is a specified state rather than an accident.

---

## #149 — `core` has the same default-timeout exposure as `viz` did: 8 tests over 5 s, slowest 39.2 s

**Verdict: out of scope for the design.**

Test-harness timeouts, no player-facing surface. One adjacent number from the design side that
may be useful when setting budgets: #116 measured a full simulation at 181 ms (Garden
Apartments), 828 ms (Midtown Office) and 1,521 ms (Vertical City), and the bench runs 100
simulations in 4.3 s warm. Everyday Mode's test bench multiplies that deliberately — a field of
four dispatchers over eight tests at 200 reps is 6,400 runs — so whatever timeout policy lands
here, the bench needs a progress model and a cancel rather than a longer timeout.

---

## Nuggets harvested into the design

For the record, the specific requests taken from these issues and where they landed:

| From | Nugget | Landed in |
|---|---|---|
| #116 §2, #96 | Timestamped interventions, re-simulated from t = 0, playback resumes at the playhead | guide §7.6, contract §1.4 |
| #116 §2 | Start with one lever: *park the cars in the lobby* | guide §7.6 |
| #116 §2 | A control that cannot act now must say so and offer the re-run | guide §16 |
| #116 §1, #94 | A building is a commitment; save per building; resume, never reset | guide §8.1, §16 |
| #116 §1 | The picker sells the building: hook, complexity, record | guide §8.1 |
| #116 §1 | Day 1 must be gradeable; saturation is player-caused | guide §17, §20.13 |
| #116 §3, #91 | The between-day sequence, and *what changed overnight* | guide §6.5 |
| #116 §3 | The next day opens paused; speed never carries across days | guide §6.2, §7.1 |
| #116 §3 | Growth bounded by design capacity; counters derive both numbers | guide §8.7, §20.13 |
| #116 §3 | One day record narrates the brief, the stage, the report and the calendar | guide §16 |
| #116 §4 | One board a day; no configuration in a board key; advertise replay verification | guide §14, contract §12 |
| #93 | *How did they do it* — the dispatcher behind every posted run | guide §14 |
| #93 | *Race this run* — a board row as a ghost | guide §6.2, §14 |
| #147 | Plain names declared in `core`; no engine id on a Casual surface; two readers, two fields | guide §16, contract §6.3 |
| #146 | The formula only where every symbol is named, plain sentence first | guide §11.3, §16 |
| #130 | Disclosures announce their contents, persist, and are never the only route | guide §16 |
| #145 | Honesty sweep enumerates from the state model | guide §20.11, contract §12 |
| #123 | Every screen renders with the API absent | guide §16 |
| #98 | Fix a building is the onboarding; first run routes there | guide §10, §15 |
