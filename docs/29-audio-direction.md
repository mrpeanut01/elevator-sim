# 29 — Audio: the decision, and the cut

**Issue:** #196 · **Milestone:** M1, pre-production · **Written:** 2026-08-24 on
`claude/elevator-sim-charter-kickoff-rexfw8` · **Character:** a recommendation, not an adoption.

**Status: RECOMMENDED — CUT. Awaiting the product owner.**
[`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) § 9 names *"the audio decision (#196)"* in the list
of escalations the orchestrator does not decide. This document therefore does what a lane may do —
reach a recommendation with its evidence, and specify the change precisely enough that no further
judgement is needed to execute it — and stops short of the thing it may not do. **Nothing in § 7
happens until a human says yes.**

M1 writes no production code. No `.ts` file, no `data/*.json` file and no shipped string is changed
by this document; § 7 is an instruction for a later lane, not a diff.

Series are cited with their document — `charter S9`, `docs/16 S2`, `docs/10 R13`, `RISKS.md R39` —
never bare ([§ D343](../DECISIONS.md)). The design guide's `§ 15.1` and `§ 20.12` are
`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md`'s, which
[`CLAUDE.md`](../CLAUDE.md) makes canonical for the interface.

---

## 1. The recommendation

**Audio does not ship. The Sound row is deleted from the Settings screen rather than left refusing,
the screen's lede stops promising a thing the product does not do, and the decision carries three
named conditions that reopen it.**

Three facts drive that, and each is checkable in one command:

1. **The stage has no real-time speed.** `everyday/stageScreenModel.ts#STAGE_SPEEDS` ships five
   values in *simulated seconds per real second*: **8, 30, 90, 240, 600**. The slowest is 8×
   compressed and the default is 30×. A hall-call door cycle taken from
   [`data/elevator-specs.json`](../data/elevator-specs.json) — open 1.8 s, dwell 5 s, close 3.0 s —
   is **9.8 s** of simulated time, which is **0.33 s** of wall time at the default speed and
   **16 ms** at 30×. Door chimes, motor whine and the texture of a door closing are the material
   #196 names, and none of them survives that. § 4.1 does the arithmetic.
2. **Audio is forbidden from carrying information, by #196's own acceptance criterion** — *"no cue
   conveys information the screen does not also convey"*. That is the right rule and it caps the
   ceiling: whatever audio does here, it cannot be the thing that shows the player the trouble,
   because the screen has to show it anyway. So audio cannot serve **P3**
   ([`22-charter.md`](22-charter.md) § 2), the pillar the build currently fails outright and the
   only one whose wording is attested. It decorates a pillar it cannot discharge.
3. **Nobody builds it.** [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M1 says the disciplines
   with no owner get one in this milestone. M1 can assign a *specification* owner to audio; it
   cannot conjure a person who makes sound. A brief specifying cues nobody is scheduled to record is
   the spec-level form of the defect this repository has now shipped **eleven times in code plus
   twice in `data/`** — a thing that is correct in every respect except that nothing reaches it.
   **P4**'s refusal test is *name the non-test caller*, and *the plan says it already exists* is not
   an answer ([§ D219](../DECISIONS.md)).

**This is a cut, not a deferral.** The current state — the row drawn as a stated absence — is the
holding position #170 calls *"a reasonable holding position, but not an ending"*, and #196 exists to
end it. § 9 says what would reopen it, so that the cut is revisitable by argument rather than
permanent by neglect.

---

## 2. What is in the tree today, verified

### 2.1 There is no audio, anywhere

```
grep -rniE "AudioContext|HTMLAudioElement|new Audio\(|howler|\.(mp3|ogg|wav|m4a|aac|opus)\b" \
  packages/*/src --include='*.ts' | wc -l          →  0
find . -path ./node_modules -prune -o -type f \
  \( -name '*.mp3' -o -name '*.ogg' -o -name '*.wav' -o -name '*.m4a' -o -name '*.opus' \) \
  -print | wc -l                                    →  0
grep -riE "howler|tone|audio|sound" package.json packages/*/package.json | wc -l   →  0
```

Zero in all three. This was worth running rather than assuming: a looser grep for the *words*
returns fourteen files, and every hit is the adjective (*"empty means it is sound"*), a colour named
`mute` in `live/timeline.ts`, a fictional irrigation schema's `volume`, or `.wave` matching `\.wav`.
The word is everywhere and the machinery is nowhere.

### 2.2 The product has never shipped a binary asset

```
find packages/viz -path '*/node_modules' -prune -o -path '*/dist' -prune -o \
  -type f ! -name '*.ts' ! -name '*.json' ! -name '*.md' -print
  →  packages/viz/apiOrigin.mjs
     packages/viz/index.html
```

Two files. The viewer is TypeScript, JSON, one HTML file and one `.mjs`. There are no images, no
fonts, no media of any kind — the design is drawn in canvas and CSS. **Audio would be the first
binary asset class this project has ever shipped**, and § 4.4 prices that.

### 2.3 The two player-visible traces of audio

Only two strings in the tree mention sound to a player, and they disagree with each other.

**The refusal**, `packages/viz/src/everyday/settingsView.ts:144`, first of six entries in
`SETTINGS_ABSENCES`:

> Sound — nothing in this build plays a sound, and a toggle that toggles nothing is a lie in a
> settings panel

**The lede**, same file at `:187`, drawn at the top of the same screen:

> Your name and picture travel with every run you post, so somebody watching your Friday sees them.
> Everything else here only changes how the game looks **and sounds** to you.

That second one is a finding, and § 7.2 is about it. The Sound row itself is **not drawn** — there
is no dead toggle to delete, which is the one piece of good news here: the screen ships one live
toggle (`playing.rows` is `['motion']`, asserted at `settingsView.test.ts:100-108`) and six named
absences. Nothing else in the tree says *sound* to a player: the rail's row is labelled `Settings`
with no subtitle, and the prototype's `title="Name, picture, motion, sound, units"` was not
transcribed.

### 2.4 What the design guide asked for

`docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 15.1, repeated in § 20.12 and
in `docs/design/design_handoff_casual_mode/BUILD_PLAN.md`:

> `Sound` has nothing behind it in the prototype. Either give it doors, chimes and lobby murmur, or
> remove the row (§20.12) — a toggle that toggles nothing is a lie in a settings panel.

**The prototype had no audio either.** Its Sound row toggles a local `mute` boolean and nothing
reads it. So the handoff is not asking us to reproduce something it built; it is handing us the same
open question with a deadline attached. [`CLAUDE.md`](../CLAUDE.md) makes the handoff canonical for
*what the screen looks like* — and this is one of the places where it explicitly declines to decide,
offering two options and requiring one of them. **This document takes the second.**

---

## 3. The case for shipping, at its strongest

Stated properly, because a cut argued against a weak version of the alternative is not a decision.

**The domain really is unusually rich.** #196 is right about that. Lift audio is not generic UI
sound: the door operator's motor, the chime differentiated by direction, the change in a car's
acoustic signature under load, the specific quality of a lobby that is filling. A schematic of
coloured rectangles is exactly the kind of surface that audio flatters most, and there is a
respectable tradition of simulation games where the sound *is* the feedback channel — a factory line
that starves, a queue that backs up, an engine under strain.

**Audio is cheap per unit of felt life.** A dozen samples and a mixer is a small amount of code
against a large change in how a build reads to a first-time player. `charter S1` (visible trouble
within 90 s) and `charter S3` (a ten-minute median first session) are both engagement criteria that
a livelier build plausibly helps.

**One class of cue does survive time compression**, and it is the strongest form of the argument
against this document's recommendation: an *analogue, aggregate* bed rather than discrete events.
Crowd murmur whose density tracks the number of people waiting; a low hum whose pitch tracks car
utilisation; a rising tension that tracks the longest current wait. These are continuous functions
of state sampled per frame, not events, so 30× compression makes them *smoother*, not faster. § 6
takes that argument seriously and says why it still does not carry.

**And there is a real cost to refusing.** The Settings screen is one of the few places where this
product is measured against a design guide that specified five Playing rows, and it will ship four.
That is a visible subtraction from a specified surface.

---

## 4. The case against

### 4.1 Time compression, and the arithmetic that kills the discrete cues

The transport is `everyday/stageScreen.ts` over `everyday/stageScreenModel.ts`. Five speeds, in
simulated seconds per real second:

| Chip | `simPerRealS` | Real time for a 9.8 s door cycle | For the slowest shipped door, 13.5 s |
|---|---|---|---|
| `½×` | 8 | 1.23 s | 1.69 s |
| `1×` *(default)* | 30 | **0.33 s** | 0.45 s |
| `4×` | 90 | 0.11 s | 0.15 s |
| `12×` | 240 | 41 ms | 56 ms |
| `30×` | 600 | **16 ms** | 23 ms |

The door figures are from [`data/elevator-specs.json`](../data/elevator-specs.json), not invented: a
centre-opening hall-call stop is `openS 1.8 + dwellHallCallS.typical 5 + closeS 3.0 = 9.8 s`, and the
slowest shipped combination is a side-opening door at maximum hall dwell,
`2.5 + 7 + 4.0 = 13.5 s`. Passenger transfer at `1.2 s` per person per direction lengthens both;
including it makes audio's case *better* and does not change the conclusion.

**The label `1×` does not mean real time.** It means "the normal speed for watching a day", and a
day is watched in minutes. There is no speed on this transport at which a lift behaves at the rate a
lift behaves. Read the table again with a real chime in mind — a recorded door chime is roughly
0.5–1.5 s of audio. At the **default** speed, a one-second chime outlasts the entire door cycle it
announces by a factor of three. At `30×` it outlasts it by sixty. A cue that is still sounding when
the car has departed two floors is not a cue; it is a smear.

**And the smear is polyphonic.** `midtown-office` ships **4 cars** over 21 floors — the small end.
`vertical-city` ships **35 cars across seven banks**, eight of them `doubleDeck: true`, which means
paired stops and therefore two door events per stop. Take a deliberately conservative assumption —
one stop per car per 30 simulated seconds in a busy bank; the real figure is unmeasured and this
document does not claim it — and at the default speed `midtown-office`'s four cars produce **four
chimes per real second, continuously, for the length of the run**, and eighty per second at `30×`.
`vertical-city` produces thirty-five and seven hundred. Halve the assumption and it is still a tone
rather than a sequence of events.

There are three ways out and each fails on inspection:

- **Gate cues above a speed.** Then audio is a `½×`-and-`1×` feature, and `12×`/`30×` — the speeds a
  player uses to get through a day — are silent. The Sound toggle now describes something the player
  mostly does not hear, which is § D227's defect wearing a speed condition.
- **Throttle: play one chime in N.** Then the cue no longer corresponds to an event and cannot mean
  what its sound means. A chime that fires for one door in twelve is decoration that looks like
  information, which is worse than decoration.
- **Rate-limit by loudness rather than by count.** This is the analogue bed of § 3, and it is a
  different feature from the one #196 describes. § 6.

### 4.2 Audio is forbidden from carrying information, so it cannot serve P3

#196's own acceptance criterion — *"a rule that no cue conveys information the screen does not also
convey"* — is correct and this document endorses it without reservation. It is also the ceiling.

**P3** is *the stage shows what the report will later say*, and its refusal test is *where on the
stage would a player have seen this?* — **seen**. A cue that is redundant by mandate cannot be the
antecedent P3 requires, because the visible antecedent has to exist anyway for the cue to be
permitted. Audio's best case under P3 is to make an existing visual antecedent *more likely to be
noticed*, which is a real benefit and is not the pillar.

This matters more than it would in another product, because P3 is the pillar the build **currently
fails outright** ([`22-charter.md`](22-charter.md) § 2, citing `MULTI_AGENT_PLAN.md` § 1 goal 4) and
the only one whose wording is attested rather than reconstructed. Effort that decorates the failing
pillar instead of discharging it is effort spent in the wrong place, and M2 already carries a stage
issue as a P0 for exactly this reason.

### 4.3 The load budget: audio spends the only slack `charter S9` has

`charter S9` is *cold load to interactive under 3 s on a mid-range laptop*, and the charter's own
honest table says its instrument is **`No`** — `.github/workflows/` carries no load budget, and the
two perf tests measure simulation throughput rather than page load. So the budget audio would spend
is a budget nobody currently measures.

What *is* measured is worse. [`16-static-site-deployment.md`](16-static-site-deployment.md) § 1:

| | Time |
|---|---|
| Cold first page load (container asleep) | **32.2 s** |
| Warm page load | **0.13 s** |

That 32.2 s is the problem the CDN split exists to solve, and the argument for the split is
explicitly *"the bundle is a few hundred kilobytes of static files"* — small enough that a CDN serves
it while the container sleeps. Audio is the one asset class that changes that sentence. A modest set
— a dozen cues plus one or two ambience loops — is a few hundred kilobytes to a couple of megabytes
compressed, which is to say **the same order as, or larger than, the entire application**.

The Free plan's 250 MB cap is not the binding constraint (the artifact uses under 1 % of it) and
neither is the 100 GB/month egress. The binding constraint is `charter S9`'s three seconds, and the
charter closes the obvious escape route:

> **No player criterion in § 4 may be met by moving any of the above.** If S9's load budget can only
> be met by cutting a figure, S9 is not met — and the change is refused under **P2**.

Read that with audio in the bundle. Figures may not be cut to make room; the eight invariants,
the statistical discipline, the honesty corpus and the published pins may not be moved. **The
non-figure weight is the only slack `charter S9` has**, and audio proposes to spend all of it on the
one payload that is forbidden from carrying information. That is the trade stated plainly.

Two smaller deployment costs, both real and both easy to miss:

- `packages/viz/staticwebapp.config.json` declares `mimeTypes` for `.json` and `.js` **only**, and
  sets `X-Content-Type-Options: nosniff`. An `.ogg` or `.mp3` served without a declared type will
  not be sniffed into working; it will fail. A media type entry is required.
- The same file's CSP has no `media-src` directive. `default-src 'self'` covers it today, so
  same-origin audio would load — but a CSP that governs media by fallback rather than by statement
  is the kind of thing that breaks silently on the next tightening. An explicit `media-src 'self'`
  would be required.
- `vite.config.ts` sets `publicDir` to the repository's `data/` directory. `data/` is the
  reference-data directory under [`CLAUDE.md`](../CLAUDE.md)'s citation discipline — *"if you change
  a reference value, cite why"*. Audio files do not belong in it, so shipping audio also means
  introducing a second public path and a build step that has never existed.

### 4.4 The first binary asset class costs more than its bytes

§ 2.2 established that the viewer ships zero binary assets. Introducing the first one is not a file
copy; it is a set of standing obligations this project has never carried:

- **Licensing and provenance.** Every sample needs a licence compatible with the repository, a
  recorded source, and — for most permissive libraries — an attribution surface the product does not
  have. This repository is unusually strict about provenance for *numbers*; it would be strange to
  be looser about media. The obligation is permanent and it is nobody's job today.
- **A pipeline.** Encoding, format fallbacks, cache headers, a licence manifest, and a size guard in
  CI so the asset budget cannot rot the way three published figures in this repository already did.
- **A test story.** `docs/16 S8` says a control that says anything enters the honesty sweep or
  carries a reasoned exclusion, and `honesty/surfaces.ts` is the chokepoint. A Sound toggle's strings
  enter the corpus (cheap). The *audio* cannot — there is no property in R1–R13 that reads a
  waveform — so audio ships permanently outside the one criterion in `charter S1`–`charter S10` that
  has a working instrument today (`charter S8`).

### 4.5 The owner problem, which is the one that decides it

[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M1: *"The disciplines that currently have no
owner get one here: audio, art direction, telemetry, privacy, accessibility, support matrix, playtest
recruitment."*

Six of those seven are disciplines a specification can discharge — a telemetry schema, a privacy
posture, an accessibility standard and a support matrix are documents, and the people who write them
are the people already here. **Audio is the one that is not.** Its deliverable is recorded sound, and
this programme has no sound designer, no budget line for one, and no scheduled milestone in which
audio would be built. #198's vertical slice bar names art and audio direction under *"what the bar
deliberately does not require"* precisely because neither has an owner:

> **Art or audio direction.** #195 and #196 are M1 siblings; the slice ships against whatever they
> decide and is not held to an unwritten standard.

The slice, in other words, is already built to ship silent. Writing a brief in that situation
produces a document describing cues that will not exist, referenced by a milestone that does not
build them — and this repository has a name for that shape and eleven instances of it. The roadmap's
standing requirement is not *is it reachable?* but **name the non-test caller**, and for an audio
brief written today the honest answer is that there is not one.

---

## 5. Which side of the line audio sits on, and how it would cross

The determinism question has a clean answer and a specific hazard, and both are worth writing down
even under a cut — because the reopen in § 9 inherits them.

**Audio is `presentation`**, in the sense [`16-change-scope-contract.md`](16-change-scope-contract.md)
§ 2 defines: *provably cannot change what a run computes*. [`CLAUDE.md`](../CLAUDE.md) invariant 3
forbids wall-clock time in `core/` and invariant 2 forbids a global RNG; audio lives in
`packages/viz/`, reads an already-computed recording, and is downstream of every decision the
simulation made. `AudioContext.currentTime` is a wall clock and is legal *there* for the same reason
`requestAnimationFrame` is: it schedules a picture, not a leg.

**`docs/16 S2` binds it in both directions** — a `presentation` control must reach a sink **and**
must not reach the legs, with the legs byte-identical and a declared sink observably changed. A Sound
toggle would need a declared sink that is the shipped decision rather than a restatement of it, which
for audio means something like *the mixer's gain node was actually set*, not *a probe recomputed what
the gain should be*. That is buildable and it is not free.

**Three ways it crosses accidentally**, named so a future implementer does not have to rediscover
them:

1. **Back-pressure into the transport.** The moment anything throttles, delays or skips a frame so a
   sound can finish — or drives the playhead from the audio clock instead of the frame clock —
   presentation has reached the run. The transport re-schedules from inside its own tick
   (`stageScreen.ts`); an audio scheduler that participates in that loop is the hazard.
2. **Randomised variation drawn from the wrong place.** Sound designers want per-instance variation —
   pitch, sample round-robin. The naive implementation is `Math.random()`, which is not literally an
   invariant 2 violation outside `core/` but is exactly the habit invariant 2 exists to prevent; the
   *dangerous* implementation is reaching for the simulation's `StreamSet` to get a "proper" stream,
   which desynchronises common random numbers and destroys comparison power across every paired
   comparison the project makes. The rule would be: audio variation uses its own presentation-only
   generator, never a named simulation stream, and never appears in a persisted record.
3. **Cue selection that reads something the screen does not.** If a cue is chosen by a quantity the
   visual layer does not draw, audio has become an information channel and #196's own criterion is
   breached — and, worse, it is breached invisibly, because no honesty property reads a waveform.

None of these is an argument that audio *cannot* be built correctly. They are the reason that
building it correctly is not a weekend.

---

## 6. The strongest argument against this recommendation

**The analogue bed.** § 3 stated it; here is why it does not carry, and it is the closest call in
this document.

The argument is good as far as it goes: an ambience whose density tracks the waiting population is a
continuous function of state, so time compression smooths it rather than shattering it. It genuinely
would survive `30×`. It is also the one thing on the list that plausibly serves P3, because a bed
that thickens as the lobby fills is a *pre-verbal* antecedent for a report that later says the lobby
filled.

Four things defeat it.

1. **It is not the feature that was asked for.** #196's material is *"door chimes, motor whine under
   load, the specific texture of a lobby crowd growing"* — two of those three are discrete and die on
   § 4.1's table. Adopting the bed alone is a much smaller feature than the issue imagines, and it
   should be adopted as its own decision rather than smuggled in under a brief that promises chimes.
2. **It is the most expensive kind of asset for the smallest cue.** Loops are long, they compress
   badly compared with short transients, and convincing crowd ambience is layered. The one surviving
   cue class is the one that spends the most of `charter S9`'s budget per unit of information — and
   the information is zero by mandate (§ 4.2).
3. **It duplicates a channel the stage already owes.** If the lobby filling is not already legible on
   the stage, the fix is the stage, and M2 carries that as a P0. If it *is* legible, the bed is a
   second encoding of a thing already encoded. Neither branch produces "build audio next".
4. **It does not save the Settings row.** A Sound toggle over an ambience bed and nothing else is a
   control whose label promises `doors, chimes, lobby murmur` and delivers the third. Under
   [§ D227](../DECISIONS.md) that is the wrong-wording defect: not a dead control, but a live one
   describing something other than what it does.

**If the product owner overrules this document, the bed is the right thing to overrule it with** —
and § 9's reopen path is written so that it is a small, honest decision rather than a re-litigation.

---

## 7. The cut, precisely

Everything below is one lane's work in `packages/viz/`, gated on the product owner's yes. It changes
no behaviour and removes no figure. Nothing here is done by this document.

### 7.1 The Settings row: delete the entry, do not reword it

Delete the first entry of `SETTINGS_ABSENCES` in
`packages/viz/src/everyday/settingsView.ts:144`. The register goes from **six entries to five**.

**Delete, not replace, and there is a precedent in the same file.** The `Switch to Engineer` entry
was removed rather than reworded when its seam went live ([§ D335](../DECISIONS.md),
[§ D338](../DECISIONS.md)), and the comment left in its place reasons that it must not be replaced
by a *statement* either, because this section's contract is *rows this screen does not draw* and a
statement about a live control would be the two-wordings defect the array exists to prevent. **The
Sound entry leaves for the mirror-image reason:** `Switch to Engineer` stopped being an absence
because the thing became real; `Sound` stops being an absence because the row stops being owed. A
register of absences lists rows the product intends to have and does not; a row that has been cut is
not missing.

This is also #196's explicit acceptance criterion — *"the settings row is removed, not left
refusing"* — so a reworded refusal does not satisfy the issue.

Leave a comment where the entry stood, in the shape of the one the swap left, saying that Sound was
cut by this decision and not merely unbuilt. **That comment is load-bearing**: without it the module
docstring's grep-based reasoning (§ 7.3) invites the next reader to build audio and re-add the row.

### 7.2 The lede: this is a finding, and it must ship with the cut

`packages/viz/src/everyday/settingsView.ts:187` currently reads:

> Everything else here only changes how the game looks **and sounds** to you.

**Change it to** *"…only changes how the game looks to you."* — a two-word deletion, and it is not
cosmetic.

Right now that sentence is a claim about a capability the product does not have, and it is arguably
survivable only because the absence register three sections below corrects it on the same screen.
**Delete the register entry without touching the lede and the correction goes with it**, leaving the
false promise standing alone as the only audio-related string on a player surface. Executing § 7.1
without § 7.2 makes the screen *less* honest than it is today.

Three things to know about it:

- **The honesty sweep does not catch this and will not.** The lede *is* swept — `honesty/surfaces.ts`
  seeds it as `${label}.lede` with role `prose` across all six settings cases — and both tiers are
  green. R1–R13 are properties about figures, counts, refusals and estimates; **a promised capability
  that does not exist is not in the corpus**. `charter S8` is the only success criterion with a
  working instrument and it is silent here, which is precisely why this instruction is written out
  rather than left to the sweep.
- **It is a third deviation from the prototype.** The lede is transcribed verbatim from
  `docs/design/design_handoff_casual_mode/GAMEPLAY_AND_NAVIGATION.md` § 15.1 and from the prototype
  markup. `settingsView.ts`'s docstring carries a section headed *"Two copy deviations from the
  prototype, each with its constraint"*; **this becomes the third**, and its constraint is this
  decision. The handoff wins disagreements about what the screen looks like, and it does not win the
  right to have the product claim a feature that was cut.
- **It is pinned by a test.** `settingsView.test.ts:24` asserts the string exactly. The assertion
  moves with the string; do not delete it.

### 7.3 The module docstring: a decision, not a grep

`settingsView.ts`'s docstring currently justifies the row's absence with a measurement:

> **Sound — not drawn.** `grep -rn "mute\|Audio\|chime" packages/viz/src --include='*.ts'` finds no
> audio machinery anywhere in the tree […]

That reasoning is true and it is now the **wrong** reasoning, and the difference is the whole point
of this document. A grep describes a *state*, and a state invites the reader to change it. Replace
it with the decision, citing this file: the row is not drawn because audio is out of scope, and the
conditions that would reopen it are `docs/29-audio-direction.md` § 9. Roster arithmetic in the same
docstring moves too — § 15.1's *Playing* **five** become four.

### 7.4 The count that goes stale, and every site that carries it

*"Six refused rows"* is written down in four places outside the array. This repository has recorded
the same lesson four times about published figures; here is the list so it is not learned a fifth
time:

| Site | What it says |
|---|---|
| `packages/viz/src/everyday/settingsView.ts` | the docstring roster — § 15.1's *Playing* five, and the *Sound — not drawn* bullet |
| `packages/viz/src/everyday/stageScreenModel.ts:111-112` | *"`everyday/settingsView.ts` ships one Motion switch and six refused rows"* — wraps across two comment lines, so a line-based grep for `six refused rows` misses it |
| `packages/viz/src/honesty/surfaces.ts:7676` | *"for six of § 15.1's rows — why the control is not there at all"* |
| `packages/viz/src/honesty/surfaces.ts:7679` | *"The register in {@link SETTINGS_ABSENCES} is six such refusals in one array"* |
| `packages/viz/src/honesty/surfaces.ts:7706` | *"the register is six entries rather than seven"* — the `Switch to Engineer` note; it becomes five rather than seven, and the sentence needs both cuts named |

### 7.5 The tests, including one inversion

- `settingsView.test.ts:127` lists `'Sound'` among the labels that must appear in the register.
  **Remove it from that list and add a case asserting its absence**, in the shape of the
  `Switch to Engineer` case the same file already carries at `:162` and `:169` — *"the inverse of the
  case this replaces, and the inversion is the point"*. A register that merely stops mentioning Sound
  is one careless re-add away from carrying it again.
- `settingsView.test.ts:24` moves with the lede (§ 7.2).
- `settingsView.test.ts:100-108` (`playing.rows` is `['motion']`) is **unchanged**, and that is
  correct: it was never a claim about audio.
- Expect the honesty corpus's string counts to move by a small negative on both tiers — one deleted
  entry across six cases, plus the lede's two words. Cases, simulations, surfaces and failing cases
  should all be **unmoved**. Per the standing rule in [`CLAUDE.md`](../CLAUDE.md), **re-measure once
  after integration, never on the branch.**

### 7.6 What deliberately does not change

- **No new module, not even an empty one.** No `audio/` directory, no stub, no interface "for later".
  A named seam with no implementation is the defect in its purest form.
- **No `mimeTypes` entry, no `media-src`, no second public directory.** § 4.3 lists them as costs of a
  yes; under a no they are not paid.
- **The other five refused rows stay refused**, with their reasons unchanged. #170 § *Not in scope* is
  right about all of them.
- **`DECISIONS.md` gets an entry, written by whoever adopts this** — not by this lane, and not by a
  lane that does not own the file. The next free number is **D344**; **D343 is the highest that
  exists**, and a citation to an unassigned number is caught by
  `packages/experiments/src/validation/citations.test.ts`.

---

## 8. What happens to #170 and #196

**#196 closes on adoption**, against its own four criteria: a decision is recorded (this document);
the two *if audio ships* clauses do not apply; and *"if audio does not ship: the settings row is
removed, not left refusing"* is § 7.1. Note that the row is removed from a **register of absences**
rather than from a live panel — there was never a drawn toggle — so the criterion is met by deleting
the refusal, which is exactly what it asks for.

**#170's Sound half closes with it; its Units half does not, and must not be closed by association.**
#170 is one issue over two rows joined by a shared diagnosis — *"both are a preference with no
reader"* — and this decision breaks that symmetry. Sound closes because **the work is cancelled**:
there is no consumer to build. Units stays open because **the work is merely unstarted**, and it has
a correctness bite that has nothing to do with audio —
`docs/design/design_handoff_casual_mode/ENGINE_CONTRACT.md` § 13 requires the Units switch to
*convert, not relabel*, and [`CLAUDE.md`](../CLAUDE.md)'s units convention keeps imperial values in
reference data with the unit in the identifier (`ratedLoadLb`, `speedFpm`), so a display-layer
conversion must not leak into a stored figure.

Concretely, for whoever holds the tracker:

- Retitle #170 to the Units row alone and delete its Sound section, leaving a comment that the Sound
  half was closed by #196 with a link to this document. Its shared framing —
  *"the work in each case is a consumer, not a control"* — is true of Units and is no longer true of
  Sound, so it is rewritten rather than kept.
- Do **not** close #170 outright. Half of it is live work.

---

## 9. What would reopen this

A cut that cannot be revisited is a cut made permanent by neglect, which is not what was decided.
**Any one** of these reopens #196 as a new issue; none of them requires re-arguing this document.

1. **A sound designer joins, or a budget line for one appears.** § 4.5 is the argument that decides
   this document, and it is a fact about staffing rather than about the product. If it changes, the
   decision should be re-taken and most of §§ 4.1–4.4 still applies — but the balance is different
   when the cues will actually exist.
2. **The transport gains a speed at which lifts behave like lifts.** § 4.1 is arithmetic over
   `STAGE_SPEEDS`. A `1×`-means-`1×` mode — a close-up on one car, a real-time replay of a single
   incident, an inspection view — makes discrete cues coherent again for the first time, and door
   chimes become the obvious thing to put in it. **This is the likeliest of the three**, because a
   real-time inspection view is a plausible thing for P3's stage work to want on its own merits.
3. **`charter S9` gets an instrument and shows headroom.** § 4.3's argument is partly that the budget
   is unmeasured. Once a CI load budget exists and the measured cold load sits comfortably under
   three seconds on the target matrix, the size objection becomes a number to check rather than a
   risk to avoid — and an ambience bed can be argued on its own (§ 6), separately from chimes.

**What does not reopen it:** a playtest finding that the build feels lifeless. That is a real
finding and audio is not the first answer to it, because P3 is failing for reasons the stage owns and
a sound layer over a stage that does not show the trouble is decoration on a known defect. Fix the
stage; then ask again.

---

## 10. What this document does not decide, and what it could not measure

Recorded because a recommendation that hides its own soft spots is not one.

- **It does not decide anything.** [`MULTI_AGENT_PLAN.md`](../MULTI_AGENT_PLAN.md) § 9 escalates
  #196. Until a human adopts it, the tree is unchanged and the Sound row keeps refusing.
- **The stop rate in § 4.1 is an assumption, not a measurement.** One stop per car per 30 simulated
  seconds is stated as an assumption with its reasoning attached, in the shape
  [`CLAUDE.md`](../CLAUDE.md) requires of the `accessZones` share. The *door cycle* figures are read
  from [`data/elevator-specs.json`](../data/elevator-specs.json) and the *speeds* from
  `everyday/stageScreenModel.ts`, and the single-cycle arithmetic — the column that carries the
  argument — needs no assumption at all.
- **No asset size was measured, because there are no assets.** The "few hundred kilobytes to a couple
  of megabytes" in § 4.3 is an industry order-of-magnitude, not a figure from this tree. It is not
  load-bearing: § 4.3's argument is that `charter S9` has no instrument and that the non-figure weight
  is its only slack, and both of those are facts about this repository.
- **No accessibility standard exists yet to check against.** #204 is an M1 sibling and unwritten, so
  § 4.2 cites #196's own criterion rather than a standard. If #204 lands with a rule about audio
  cues, this document should be re-read against it — the expected direction is that it strengthens
  § 4.2 rather than weakening it.
- **Whether audio would actually help retention is unmeasured and unmeasurable here.** `charter S1`
  through `charter S4` have no instrument (`grep -ril telemetry packages/*/src --include='*.ts'`
  returns **0 files**), so the engagement half of § 3's case cannot be tested either way. This
  document does not claim audio would fail to help; it claims the cost is known, the benefit is not,
  and nobody is scheduled to build it. **If that reads as an argument for measuring rather than for
  cutting, note that measuring requires shipping it first.**
