# 26 — Telemetry and privacy

> # ⚠ THIS DOCUMENT HAS NOT BEEN REVIEWED BY A LAWYER, AND IT MAY NOT GO LIVE UNTIL IT HAS
>
> **Part B (§§ 12–19) is a draft privacy posture written by a non-lawyer.** It is not legal advice,
> it is not settled, and no sentence in it may be published to a player, quoted in a privacy notice,
> put on a consent surface, or relied on as a compliance position until a qualified professional has
> reviewed it and the review is recorded here.
>
> **The lawful basis in § 14 is deliberately undecided.** It is written as options with their
> consequences, for a reviewer to choose between. A lane that reads one of those options as the
> answer has misread the section. The same is true of § 17's position on children.
>
> **§ 19 is the reviewer's checklist** — every question this draft could not answer, in one table, so
> the review is a list rather than a reading. **Nineteen items.** Where an item is also raised in
> the body it is marked `LAWYER` at the point it arises, with the item number beside it.
>
> This is the product owner's own condition, stated on issue #202 on 2026-09-09: *"I draft the
> posture … and it ships marked as requiring professional legal review before it goes live. I am not
> able to make that call and the document will say so on its face. Nothing that touches player data
> ships on my judgement alone."*

**Status: M1 pre-production specification. Written 2026-08-24 on the charter programme branch,
against issues #201 (the telemetry schema and the player KPI set) and #202 (privacy, consent and
data retention). Part B added 2026-09-09 for #202, under three owner rulings taken that day
(§ 12.1).** Specification only — nothing here changes a `.ts` file, a `data/*.json` file or a
shipped string, and **this document does not create a telemetry module.** A specification that
ships a module is a production issue wearing a specification's clothes, and M1's own character
clause ([`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M1) refuses it.

**Three rules in Part A were changed by those rulings rather than excepted, and each carries its
correction where it stands** — `docs/26 P-4` (§ 1.1), the read-route refusal (§ 8) and § 1.3's
parking of the legal questions. A rule left saying one thing while the product does another is this
repository's documented stale-refusal defect ([`CLAUDE.md`](../CLAUDE.md)), and it is the reason
none of the three was handled with an exception list.

**The posture in § 1 is [§ D412](../DECISIONS.md)** (2026-08-29). That entry is an anchor: it adopts
the posture and the ordering this document argues, and it does **not** license the schema — § 11's
remaining items stay unsettled.

**#202's material comes first in this document, and the order is the point rather than a
preference.** Issue #202 must land before any telemetry ships because that order is not
recoverable: data collected without a posture cannot be un-collected, and a schema written first
becomes the posture by default — whatever it happened to collect turns into what the project decided
to collect. So §§ 1–5 are the posture, and §§ 6–8 are the schema, written *inside* it. Every event
in § 7 is refusable against § 1, and a reviewer may refuse one by citing a rule number.

**What this document is answerable to.** [`docs/22-charter.md`](22-charter.md) § 4 — adopted at
[§ D342](../DECISIONS.md) — states ten player-facing success criteria and, for each, the instrument
that can fail it. Four of them have no instrument and are telemetry-shaped: `charter S1`, `charter
S2`, `charter S3` and `charter S4`. This document specifies exactly the instrument those four need
and stops there. Series are cited with their document throughout, per [§ D343](../DECISIONS.md);
this document's own series is cited from outside as `docs/26 K1` and `docs/26 E3`.

---

## 0. What was measured on this tree before any of this was written

**Six facts, each with the command that produces it**, because a posture argued from an assumed
starting state is a posture about a different repository. Verified 2026-08-24.

| # | Claim | Command / site | Result |
|---|---|---|---|
| 1 | ~~**There is no telemetry or analytics code anywhere in this tree**~~ — **closed 2026-09-10**, see below | `grep -ril telemetry packages/*/src --include='*.ts'` and the same for `analytics` | was **0 files** each, then **2 files / 6 lines** of prose; the instrument now exists and the fact is struck |
| 2 | **The product already stores exactly one piece of personal data** — an email address, for the sign-in link | `users.email` in `packages/server/src/store/store.ts`; `normaliseEmail` is its only writer | one column, one purpose |
| 3 | **No IP address is persisted anywhere** | `clientIp` reaches exactly one consumer — `limiters.perCaller.charge(...)` in `packages/server/src/http/api.ts` — which is an in-memory `FixedWindowLimiter`. It is never handed to `Store` | never written |
| 4 | **The server writes no request log** | the only `console.*` calls outside tests are two boot lines and one fatal in `packages/server/src/main.ts` | no access log |
| 5 | **A third-party tracker is already forbidden at the policy level** | `packages/viz/staticwebapp.config.json` ships `connect-src 'self'`, widened only to a declared API origin ([`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 4) | one origin, or none |
| 6 | ~~**There is no way to delete an account**~~ — **closed 2026-08-24**, see below | `grep -rn deleteUser packages/server/src` and `grep -rn 'DELETE FROM users' packages/server/src` | was **0 matches**; now `Store.deleteUser` and `DELETE /api/me` — see § 5.3 |

Facts 2 to 5 are the posture this repository already has without having written one down, and this
document's first job is to **not contradict them**.

**Fact 1's command stopped reproducing its published result, and the command is not narrowed to make
it reproduce again.** Issue #254's route cites § 3.3 in three docstrings and a test asserts the
deletion response says nothing about telemetry, so `grep -ril telemetry packages/*/src` now returns
`packages/server/src/http/api.ts` and `packages/server/src/http/api.test.ts`. Run
`grep -rin telemetry packages/server/src` and every one of the six lines is a comment or a test
regex: there is still **no telemetry code, no telemetry route, no telemetry table and no telemetry
event**, which is the claim. The command is left exactly as published, because a measurement whose
command is retuned until it gives the old answer is the defect this table exists to prevent — the
honest move is to re-measure and say what moved. `analytics` is still 0 files.
*(That paragraph is a record of 2026-08-24 and every clause in it is false today; the paragraph
below says what moved and when.)*

**Fact 1 stopped being true on 2026-09-10, and this is what closed it.** GitHub issue #340 built the implementation this document designed: `packages/viz/src/telemetry/` holds the schema, the consent slot, the batching recorder and the ask's words; `packages/viz/src/everyday/` emits § 7's events from the player's own screens; `POST /api/telemetry` and `POST /api/telemetry/forget` receive and erase; and `telemetry_events` holds the rows under § 5.2's sweep, on ingest and at boot. The row above is **struck through rather than rewritten**, on this table's own rule: what § 0 recorded on 2026-08-24 is what was true on 2026-08-24, and a table whose rows are silently rewritten is one nobody can use to date a claim.

**The command is still not retuned, and now it says the opposite thing.** `grep -ril telemetry packages/*/src` returns a directory in each of two packages plus every emitter, and `grep -rin telemetry packages/server/src` no longer finds only comments. The measurement that replaced it is a run rather than a grep: `packages/experiments/src/validation/documentation.test.ts` asks the **code** — comments and string literals stripped — whether the four halves of an instrument exist, and asserts `docs/22-charter.md` § 4's S1 cell against the answer in both directions. That cell now reads *instrumented and unevaluated*, which is the distinction S8 already made and the one this document's § 6.4 insists on: a KPI moving is evidence, never a verdict.

**Fact 6 was the one that was wrong, and it is the one that had already moved.** It is struck through
rather than deleted, because a measurement table whose rows are silently rewritten when the tree
changes is a table nobody can use to date a claim: what § 0 recorded on 2026-08-24 is what was true
on 2026-08-24, and the correction belongs beside it. GitHub issue #254 built the route this document
said was owed; § 5.3 is rewritten from *the gap this document found and does not close* to what
closed it, and § 5.1's `Deleted by` column no longer reads **nothing**. Both greps now match, so
re-running them reproduces the correction rather than the fact.

---

## 1. The posture — six rules, and they govern everything below

### 1.1 The rules

> **P-1 — Nothing is collected without an explicit grant.** No event is queued, no identifier is
> minted and no request is made before a player has said yes. The default is off, and a refusal is
> silent: the refusal itself is not transmitted (§ 4.2).
>
> **P-2 — Name the run; do not describe it.** Where a figure can be re-derived from a seed and a
> configuration, the seed and the configuration are what is stored (§ 2.1). A payload of derived
> numbers is strictly worse on both axes — it tells you less later and says more about a person now.
>
> **P-3 — The schema is the allowlist.** An event not in § 7's table does not ship. An event that
> answers no question stated in § 6 does not ship. Both directions are tested (§ 7.6).
>
> **P-4 — Typed text is composed, never captured.** A player may type words this product keeps —
> a display name, a name for something they saved, a problem report. Every such string is
> **composed on purpose, for a destination the player is shown before they send it**, and carries
> the three things § 13.4 requires of one: a stated destination, a retention row, and a deletion
> path. What is forbidden is the other direction: **no string a player typed is swept into a
> measurement, attached to a metric, or carried by an event they did not compose.** So every field
> in § 7's schema is still a number, a boolean, or a member of a vocabulary derived from the
> product, and there is no field in it a typed string can reach — not because typed text is
> forbidden, but because **a telemetry event is composed by nobody**, and a string harvested into
> one was never offered to a destination. The hazard the old rule named is unchanged and is why the
> three requirements exist: a typed string can contain anything, including somebody else's personal
> data.
>
> **P-5 — The client records; it never judges.** Every classification an event carries — a verdict,
> a refusal ground, a screen — is read from the shipped surface's own classification, not recomputed.
> This is `packages/viz/src/honesty/surfaces.ts`'s rule for its adapters, applied to the instrument
> that measures players rather than strings, and it is [`CLAUDE.md`](../CLAUDE.md) invariant 7 and
> the charter's non-goal against a second set of statistics arriving by another door.
>
> **P-6 — Telemetry may not change the product.** With the transport absent, unreachable, blocked or
> refused, every mode, every screen and every figure behaves identically. A build whose telemetry
> refusal breaks the game has not offered a choice, and a run whose result depends on whether
> anybody was watching is not a run.

#### P-4 was rewritten on 2026-09-09, and this is what it said before

It read **"No free text, ever"**, and under it: *"Every field is a number, a boolean, or a member of
a vocabulary derived from the product. A player-authored string — a building name, a dispatcher
name, a display name — can contain anything, including somebody else's personal data, and there is
no field in this schema it can reach."*

**Rewritten rather than excepted**, on the product owner's ruling of 2026-09-09 (GitHub issue #242):
*"An exception list would leave the rule saying one thing and the product doing another, which is the
stale-refusal defect this project keeps catching."* Three issues need words a player typed — #245's
problem report, #242's error monitoring, and the display name that already ships — and a rule
carrying three carve-outs is a rule nobody reads past the headline.

**Three things worth saying about the old wording, because two of them were already wrong when it
was written and nobody noticed.**

1. **The headline over-stated the body.** *No free text, ever* is a claim about the product; the
   sentence under it is a claim about **this schema** — *"there is no field in this schema it can
   reach"* — and that narrower claim is still true and still enforced (§ 7.4, § 7.6's third test).
   The rewrite keeps the enforcement and drops the over-statement.
2. **The product already held player-typed text on the day the rule was written.**
   `users.display_name` is a string a person types, 2–32 characters, refused only for control and
   formatting characters (`packages/server/src/http/api.ts#displayNameIssues`), **rendered on every
   board a stranger can read**, and it has been there since [§ D241](../DECISIONS.md). A posture
   whose headline said *ever* was describing a product that had some. The old rule's own § 2.2 row
   named the display name as an example of what could not reach the schema, which is exactly right
   and is not what the headline said.
3. **The hazard was never wrong.** A typed string can carry somebody else's personal data, and the
   rewrite does not soften that — it moves it from a prohibition to a set of obligations that
   attach wherever typed text is kept (§ 13.4), because obligations survive the arrival of a fourth
   feature and a prohibition with three carve-outs does not.

Every other site that quoted the old wording is corrected on the same commit —
[`docs/30-playtest-programme.md`](30-playtest-programme.md) § 9.1 quoted it in full and is the only
one outside this file.

**On the numbering, because this document has just created a collision and saying so is cheaper
than discovering it.** The charter's pillars are `charter P1`–`charter P5`. These rules are
`docs/26 P-1`–`docs/26 P-6`, hyphenated and cited with their document, so that a bare `P4` — which
would now name two different things in `docs/` — never has to be disambiguated by context. That is
[§ D343](../DECISIONS.md)'s rule applied before the collision does any damage rather than after,
which is the one improvement available on the way `charter S1`–`charter S10` met
[`docs/16-change-scope-contract.md`](16-change-scope-contract.md)'s own S-series.

### 1.2 Why the posture is written before the schema, in this file and in the ship order

Three reasons, and the third is the one that is specific to this repository.

1. **Collection is not reversible.** Deleting a row is not the same as never having had it, and a
   posture written after the fact is a description of what was already taken.
2. **A schema written first silently becomes the posture.** Whatever the first draft happened to
   collect turns into the norm, and every later argument is about removing something rather than
   about adding it — which is a much harder argument to win.
3. **This repository's characteristic defect is a specification with no owner at the seam.**
   [`docs/05-roadmap.md`](05-roadmap.md)'s standing requirement — *name the non-test caller* — exists
   because behaviour that is configurable, tested in isolation and reached by nothing has shipped
   eleven times here. Telemetry has the same shape and a worse failure: a field that no KPI reads is
   not merely dead, it is **data held for no stated reason**, which is the exact thing a privacy
   posture is for. P-3 makes the two failures the same test.

### 1.3 What this document is not

**Not a legal opinion.** It states a posture and the mechanisms that implement it. Whether consent
is the correct lawful basis in a given jurisdiction, what a published notice must say, and whether
the product needs an age statement are **not answered by anybody in this repository**.

**That sentence used to end differently and the change is the point.** It read *"are questions for
the product owner … human decisions rather than lane decisions"*, and § 11 parked all three. The
product owner's ruling of 2026-09-09 on issue #202 declines that framing for himself as well: he is
not able to make the call either, so the three questions are **drafted** in Part B — as options with
their consequences, and never as answers — and the draft ships marked for professional review. What
changed is not who decides; it is that the questions are now written down in a form somebody
qualified can decide *from*, instead of being a bullet saying they are open.

**Still not a privacy notice.** § 15 drafts the words a player would be shown and says where they
go; the published notice is the reviewed version of that, and it does not exist yet.

**Not a licence to collect the maximum this posture permits.** Every rule below is a ceiling. The
schema in § 7 sits well under it, and a later proposal that fills the remaining headroom has to make
its own case against § 6's KPIs rather than pointing at § 1.

---

## 2. What is deliberately not collected

### 2.1 The pointer, not the payload — and it is the better instrument, not the polite one

[`CLAUDE.md`](../CLAUDE.md) invariant 5: **every persisted run record carries its seed**, so any run
replays exactly. Invariant 2 keeps every draw on a named stream, and invariant 3 keeps the wall
clock out of `core/`. Together they say something unusual about this product that most telemetry
designs cannot use: **a run is fully reconstructible from a small tuple of ids, a rate, a duration,
a window and a seed.**

So a telemetry event that wants to say something about a run **names the run** and stores nothing
derived from it:

| | A payload of figures | A run pointer |
|---|---|---|
| What is stored | AWT, WT95, TTD, undelivered, energy … per event | seven ids and numbers, plus the data digests |
| What can be asked later | only the questions somebody thought of in advance | **any** question, including ones nobody has thought of |
| What it says about a person | a profile of how well they play, retained | which configuration they chose, replayable by anyone with the same `data/` |
| Size | grows with every figure the product gains | fixed |
| Correctness risk | a second computation of a figure `core` already computes — a second set of statistics | none: the figure is re-derived by `core` on demand |

**The pointer's type already exists and a second one may not be invented.** It is `SubmittedRun` in
`packages/server/src/leaderboard/submission.ts` — `buildingId`, `dispatcherProfileId`,
`demandTemplateId`, `arrivalRatePctPop5min`, `durationS`, `windowStartS`, `seed`, and since
[§ D440](../DECISIONS.md) the Everyday pair `ruleRows` and `interventions` — together with the
`ResolvedDataFacts` digests that `leaderboard/boardKey.ts#runDataHashOf` folds in, so a `data/`
change starts a new population rather than corrupting an old one ([§ D214](../DECISIONS.md) § 4).
Telemetry reuses that type unchanged. Two pointer shapes would be two answers to *what is a run*, and the first time they
disagreed the disagreement would be invisible.

**The cost of the pointer, stated.** Re-deriving a figure costs a simulation, and
`ACCEPTED_DURATIONS_S` in the same file is bounded *because a submission commands server CPU*. So
replay is an **analyst-initiated, offline** operation over stored pointers, never work done on
ingest. Ingest writes rows and computes nothing.

### 2.2 The list

Everything below is refused by name, so that a later proposal has to argue against a specific line
rather than into a silence.

| Not collected | Why not |
|---|---|
| **IP addresses** | Never persisted today (§ 0, fact 3), and telemetry does not change that. The socket peer is used in memory for a rate-limit key and is dropped |
| **Email addresses, in any telemetry row** | The address exists for one purpose — mailing a sign-in link — and joining it to behaviour would give it a second purpose it was not collected for. § 3 makes the join structurally impossible rather than merely forbidden |
| **Any player-authored string** | P-4's second half. Names of saved buildings, dispatchers, patterns and display names are typed by a person, and none of them was composed for a telemetry event. That they are *permitted to exist* since 2026-09-09 does not make them collectable here: the destination a player was shown is a board or their own device, and this schema is neither |
| **URLs, referrers and query strings** | A deep link is somebody sending a finding to somebody else, and it can carry anything. The entry *screen key* is collected; the URL is not |
| **Device fingerprints** | No user-agent string, no screen or viewport size, no timezone, no language, no font or canvas probe, no hardware counters. A fingerprint is an identifier that survives the player deleting theirs, which makes § 4.3's withdrawal a lie |
| **Geolocation, precise or coarse** | Answers no question in § 6 |
| **Pointer, scroll or keystroke streams; session replay; heatmaps** | Answers no question in § 6, and is the collection class with the highest chance of catching something nobody meant to collect |
| **Wall-clock timestamps from the client** | Only elapsed time within a session is recorded, rounded to 100 ms (§ 7.1). The server's receive time is the only absolute clock, and it is the server's own |
| **Per-run derived figures** | § 2.1 |
| **Anything at all from a player who refused, including the refusal** | § 4.2 |
| **Anything from a third party, to a third party, or through a third party** | § 10 non-goal 2 |

### 2.3 Two fields this document's own rule cut from its own draft

P-3 is worth exactly as much as the first thing it deletes, so here are the two.

- **`referrerClass`** — *direct / search / social / other*, on `session_start`. It answers an
  acquisition question, and there is no acquisition criterion in the charter. Cut. If a later
  milestone adopts an acquisition KPI, the field arrives with it and not before.
- **`controlValueBefore` / `controlValueAfter`** — on `docs/26 E4`. Tempting, and unnecessary: where
  the changed control is one of the seven fields of a run pointer, the *next* run's pointer already
  carries the new value, exactly and without a second encoding. Where it is not, no KPI in § 6 reads
  it. Cut, and the consequence is stated rather than hidden: the schema cannot answer *what did they
  change it to* for a control outside the pointer. That question belongs to a playtest.

---

## 3. Identity — what a player is

### 3.1 With no account: a browser profile, and the document says so in those words

A **`playerId`** is 128 bits from `crypto.getRandomValues`, written to one `localStorage` slot, minted
**after** consent and never before. It is derived from nothing: not from the device, not from the
clock, not from anything about the person. A derived identifier is one that reconstitutes itself
after deletion, which would make § 4.3 false.

**The unit is a browser profile, not a person**, and every KPI in § 6 is a claim about browser
profiles that gets *called* a claim about players. Two known biases follow, and both are published
beside the figures rather than footnoted (the same footing `workPerServedLegKJ` sits beside raw
energy, [§ D106](../DECISIONS.md)):

- **Cleared storage inflates first sessions.** A returning player whose site data was cleared is a
  new player to this instrument, so `docs/26 K1`–`docs/26 K3`'s denominator is too large and
  `docs/26 K4`'s numerator is too small.
- **A shared machine deflates them.** Two people on one browser profile are one player.

Neither is fixable without collecting more, and collecting more to fix a measurement bias is how a
posture erodes one reasonable step at a time. They are stated, not corrected.

### 3.2 With an account: nothing changes, and that is the decision

`packages/server` already has an identity model — `users.id`, a `randomUUID`, created when a sign-in
link is *asked for* ([§ D241](../DECISIONS.md)), with `sessions` and `login_tokens` beside it. **This
document does not extend it, mirror it, or place a second one next to it.**

> **A telemetry row never carries `users.id`, and a telemetry request never carries a session token.**

That is a stronger statement than *we would not join them*: with no account id on the row and no
bearer token on the request, **the join does not exist to be made**, by this team or by anybody who
later obtains the database. Telemetry cannot be used to profile a named person because there is no
name on it and no key that reaches one.

**What it costs, stated plainly.** A player who signs in on a laptop and a phone is two players to
this instrument, so `docs/26 K4` under-counts cross-device return. That is a real loss and it is
accepted: the alternative buys a more accurate retention number with a permanent, un-revocable link
between an email address and a behavioural record.

### 3.3 Erasure spans two stores without the server ever holding the join

The obvious objection to § 3.2: if telemetry and the account are unjoinable, then deleting an
account cannot delete that person's telemetry.

**It can, because the client holds both keys at the same moment and the server never has to.** A
player pressing *delete my data* while signed in sends two independent requests — one authenticated
by the session token, which deletes the account; one carrying the `playerId`, which deletes the
telemetry — and then clears both local slots. The server sees two deletions and no relationship
between them. Signed out, only the second fires, and it is enough, because § 3.2 means the telemetry
never referenced the account anyway.

This is the one place where the two stores are named in the same sentence, and it is a client
behaviour rather than a server one. That is the whole trick.

**The first of those two requests now exists and the second does not.** `DELETE /api/me` — one
authenticated route, the account named by the session token and by nothing else the request can
carry — landed for issue #254 (§ 5.3). It deletes the account and the four tables that cascade off
it, and **says nothing about telemetry in its response**, which is this section's shape rather than
an omission: a route that spoke for the other store would be claiming exactly the join this design
exists not to hold.

**That second request exists as of 2026-09-10** (GitHub issue #340), and it is a second route
rather than a second branch, as this paragraph said it would have to be: `POST /api/telemetry/forget`
takes a `playerId` and nothing else, reads no session token, and answers an id it has never seen
exactly as it answers one it has just cleared. `DELETE /api/me` is unchanged and still says nothing
about telemetry — `api.test.ts` asserts that in both directions — so the two stores are still
erased by two requests the server sees no relationship between. The sentence this replaced read
*"there is no telemetry endpoint to be the second request"*, which was true until that commit.

### 3.4 `sessionId`

128 random bits per session, in memory only, never written to `localStorage`. It groups a batch's
events and dies with the tab. It is not durable, so it cannot be a second identity, and a schema
where the durable id was optional but the session id was durable would be exactly the identity model
this section refuses, spelled differently.

---

## 4. Consent

### 4.1 What is asked, and when

**Asked once, on first load, before any identifier exists**, in the register of the screen the
player is on (`charter P5`). One question with two answers that are equally easy to give and equally
easy to reach — no pre-tick, no *by continuing you agree*, no styling that makes one answer look
like the way forward.

What the question owes:

- **It says what is collected in the player's own vocabulary**, using the restatement rule in
  [`docs/23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) § 1.4: a figure may be
  renamed or restated, never softened. *"Which screens you reach and how long you play"* is a
  restatement; *"help us improve"* is a request with the content removed.
- **It says what is not collected** — § 2.2's list is what makes the ask credible, and the short
  form of it belongs on the surface.
- **It obeys the charter's non-goal 8**: no section number, no filename, no code identifier. The
  consent surface may not cite this document by path.
- **It enters the honesty corpus.** Every string it draws goes into
  `packages/viz/src/honesty/surfaces.ts` before it ships, or `charter S8` is not met — a surface
  that renders strings and is absent from the corpus is not finished.

**Where it lives.** Beside the existing Everyday settings screen and profile store
(`packages/viz/src/everyday/settingsScreen.ts`, `profile.ts`), in **its own versioned slot** — not
spliced into `persist/`'s session envelope and not into the profile envelope. `profile.ts` already
states the reason in its own docstring: a lane that puts a key inside another module's envelope
creates two writers for one version number.

### 4.2 What happens on refusal, and what still works

**Everything still works. All of it.** Every mode, every screen, every figure, every refusal, every
seed, every interval. `docs/26 P-6` is not a courtesy; it is the property that makes the question a
question. A telemetry-gated feature, a nag, a degraded mode or a second ask on the next load would
each turn the ask into a toll.

**Nothing is transmitted, including the refusal.** No identifier is minted, no request is made, and
the fact that somebody said no does not itself become a datum. This has a cost and the cost is the
honest one:

> **The consent rate is unmeasurable, and therefore `docs/26 K1`–`docs/26 K4` are measured on the
> consenting subset only.** That is a self-selection bias of unknown size and unknown direction, and
> it is published beside every KPI, every time, in the same box.

The alternative — a single anonymous *refused* counter — is collection after a refusal, which is the
one thing a refusal is supposed to prevent. A biased number with its bias stated is worth more than
an unbiased one obtained by ignoring the answer.

### 4.3 Withdrawal, and it deletes rather than stops

Reachable from the same place as the ask, at any time. Withdrawal does three things, in order:

1. stops the client emitting — immediately, including anything already queued and unsent;
2. sends one deletion request naming the `playerId` (§ 3.3), which is the only request it makes;
3. clears the local slot, so the `playerId` is gone from the device.

**A withdrawal that only stops future collection is not a withdrawal**, and a *pause* is not offered
because a pause is a state a player has to remember they are in.

If step 2 fails — offline, cold container, blocked — the client clears the slot anyway and the
retention horizon in § 5 is what eventually deletes the rows. Say it in the surface: the local half
is immediate, the server half is a request that can fail and a horizon that cannot.

### 4.4 Two things the consent surface may not become

- **A gate.** No screen waits on an answer. If the question is unanswered, the answer is no.
- **A place to put anything else.** Not terms, not a newsletter, not an account prompt. A consent
  surface bundled with a second ask is a consent surface that gets clicked through.

---

## 5. Retention

### 5.1 The classes and their horizons

| Class | What it is | Horizon | Deleted by |
|---|---|---|---|
| **Raw events** | § 7's rows, carrying `playerId`, `sessionId` and run pointers | **90 days** from receipt | § 5.2's sweep |
| **Daily aggregates** | § 6's KPI table: counts, rates and quantiles with their `n` | **indefinite** | nothing — they carry no identifier and no pointer (§ 5.4) |
| **`playerId`** | § 3.1's slot | lives with the events | the sweep, withdrawal (§ 4.3), or the browser's own site-data clear |
| **Consent state** | one `localStorage` slot | until cleared | the player |
| **Sessions** (existing) | `sessions` table | **30 days** — `SESSION_TTL_MS` | deleted on the way past by `Store.userForSession`, and by `POST /api/logout` |
| **Sign-in links** (existing) | `login_tokens` | **15 minutes** — `LOGIN_TTL_MS` | swept inside `Store.consumeLoginToken` |
| **Accounts and board entries** (existing) | `users`, `entries`, `challenge_entries` | **no horizon today** | `DELETE /api/me`, at the player's request — § 5.3. Still no horizon: an account nobody deletes is kept |

**Why 90 days.** `docs/26 K4` needs a 7-day return window plus the cohort's own day, and a KPI is
read as a trend rather than a point, so a quarter is the shortest horizon over which a
build-to-build movement can be seen with the previous build's cohort still present. Nothing in § 6
needs a year. If a later question needs one, it argues for it in the open rather than benefiting
from a horizon that was generous by default.

### 5.2 The mechanism, named — and it is one this codebase already runs twice

**A horizon with no mechanism is an intention.** The mechanism is the one `store.ts` already uses in
two places, rather than a scheduler this deployment does not have:

- `Store.consumeLoginToken` runs `DELETE FROM login_tokens WHERE expires_at_ms <= $1` on the way
  past every redemption;
- `Store.userForSession` deletes an expired session as it refuses it, *"so the table does not grow a
  permanent tail"*.

So: **every telemetry ingest sweeps rows older than the horizon**, as a second statement, bounded and
not atomic with the insert. It needs no cron, no timer and no wall clock beyond the one this package
is already allowed.

**The failure mode of sweep-on-write is stated because it is real**: a deployment nobody uses never
sweeps, so an abandoned instance retains until it is next written to. The second half closes it —
**the sweep also runs at boot**, beside the `CREATE TABLE IF NOT EXISTS` that `bootstrap.ts` already
applies. A Container App at `minReplicas: 0` boots often, which for once is an advantage.

### 5.3 The gap this document found, and what closed it

**The finding, as it stood.** There was no way to delete an account (§ 0, fact 6). `Store` had no
`deleteUser` and no route called one, so a player who asked for a sign-in link once had an email
address in `users` with no horizon and no erasure path. This section recorded it rather than fixing
it, because the lane writing the posture could not write server code and a posture that quietly
required some was a posture that would have shipped as prose.

**What closed it (2026-08-24, GitHub issue #254).** `DELETE /api/me` in
`packages/server/src/http/api.ts`, over `Store.deleteUser` — one authenticated route, one statement,
and the cascade for the rest. The three mitigations this section listed all held, and the middle one
turned out to be exactly as described:

- the schema was already built for it — `sessions`, `login_tokens`, `entries` and
  `challenge_entries` all declare `user_id … REFERENCES users (id) ON DELETE CASCADE`, verified by
  reading `pg_constraint` rather than by reading the schema text, and all four carry
  `confdeltype = 'c'`;
- the address is stored normalised and for one purpose, and is never logged (§ 0, facts 2 and 4) —
  **with one exception that is not a log and is worth naming**: `OutboxMailer` appends every message
  it sends, address included, to `.outbox.jsonl` in the clear and never sweeps it, so a deleted
  address survives in a developer's outbox after the route has removed it from `users`. It is
  unreachable in production rather than tolerated there — `bootstrap.ts` refuses to start when
  `NODE_ENV=production` and the mailer is an `OutboxMailer`, and both the `Dockerfile` and
  `infra/azure/main.bicep` set that variable — so this is a fact about development machines, and the
  erasure route makes no claim over files on one;
- `packages/server`'s own docstrings say the deployed database *"has never held an account"*.

Four things about the route are load-bearing here rather than in its own docstring, because they are
what makes it agree with this document:

- **The account is named by the session token and by nothing else the request can carry** — no path
  segment, no query parameter, no body field. Not a check that a supplied id matches the session's:
  an argument that does not exist cannot be got wrong on a later branch. `api.test.ts` sends one
  anyway, three ways, and requires the named account to survive.
- **It claims nothing about telemetry** (§ 3.3). Erasure spans two stores as two independent
  requests, and a response that spoke for the other one would be asserting the join this design
  exists not to hold.
- **The test that matters derives the child tables from the catalog**, not from a list written
  beside it — so a fifth table declaring `user_id … REFERENCES users (id)` is covered on the day it
  is added rather than on the day someone remembers this file.

  **What that derivation does not cover, stated because an earlier draft of this bullet implied it
  covered the schema generally.** It reads **direct foreign keys to `users`** and nothing else, and
  two shapes survive it. A **grandchild** — say `device_pins(token REFERENCES sessions(token))` —
  is invisible to it, and a grandchild without its own cascade does not merely leak: it makes
  `DELETE FROM users` **fail outright** once populated, so erasure would stop working rather than
  quietly under-work. A **non-foreign-key identity table** — say `mail_bounces(email TEXT)` — is
  invisible to it too, and would hold an address after the account holding it was gone. Neither
  exists today: the four are the whole set, no table denormalises `display_name` or `email`, and
  the schema is one file. The test is a guard against the schema growing *in one direction*, and
  the other two directions are still a reader's job.
- **No shipped screen calls it, and the absence is stated where the account is offered.** The route
  is reachable from `curl` and from nothing a player can press; `packages/viz/src/menu/client.ts`
  reaches `GET /api/me` and `POST /api/me/display-name` and no third route on `/api/me`. Issue
  #254's AC3 is a **disjunction** — reachable from a player-facing surface **or** the absence stated
  on the surface that offers the account — and the **second limb is met**: § D241 makes the sign-in
  mail the surface on which an account comes into existence, and that mail now says *"Deleting that
  account is something the server can do and no screen offers yet."*

  **That sentence is pinned by a run rather than by this paragraph.** `packages/server/src/mail/mailer.test.ts`
  asserts it is in the body *and* that no shipped viz source reaches `/api/me` with a `DELETE`, so
  the day a lane wires the control the server suite goes red and hands them the sentence they owe.
  Without that test the sentence could be deleted with the suite still green, which is the stale
  refusal `CLAUDE.md` calls the more dangerous half — and it would have been this document's own
  correction committing it.

**One thing the route made reachable, since erasure that misbehaves under concurrency is an erasure
claim too.** `Store.recordEntry` and `recordChallengeEntry` read the account and then insert, and
`Store` has no transaction seam. Before deletion existed a `users` row could not disappear between
those two statements; afterwards it can, and a player deleting their account while a submission is
verifying put the insert on the wrong side of the foreign key — surfacing as PostgreSQL's own
message rather than as an answer. Both paths now raise the store's `NoSuchUserError` and the
submission routes answer `401`, so the outcome is the same whether the account vanished a second
before the write or a millisecond into it. **Nothing was deleted twice and no entry outlived its
account**; what was wrong was the reporting.

**Those were two of five, and the question this paragraph used to leave open is now answered**
([§ D361](../DECISIONS.md#d361), issue **#266**). The read-then-write pairs are **derived** from
`store.ts` and its own schema rather than listed — five of them — and the set that carries a stated
remedy is wider still, because `createSession` and `createLoginToken` read nothing inside the store
and are check-then-acts anyway, with the read one frame up in the route. **`Store` gains no
transactions**, and not because they are expensive: `PgSql.query` takes a pooled connection per
call, so a `BEGIN` and its `COMMIT` would land on different connections; and even a real transaction
would not close these, because under `READ COMMITTED` the deletion still commits and the insert
still fails the key. What would close it is a row lock, and a row lock buys the player a *worse*
answer — the submission wins and the cascade erases it a moment later.

**What that changes for somebody caught mid-erasure**: asking for a sign-in link while the account
is being deleted used to answer `500`, on the one route whose whole design is a response that says
nothing about the address; it now answers the uniform `202` with a link to a freshly created
account, which is what § 3.3's *asking for a link is what creates the account* already implies.
Redeeming a link whose account has just gone was reported as *"that link has already been used"* — a
true-sounding sentence about something that did not happen — and now says the link is not valid,
which is what it is.

**No claim in this document about *what* is erased changed.** Nothing is deleted twice, no entry
outlives its account, and the cascade set is still read out of `pg_constraint`. What changed is what
a raced request is **told**.

The decision numbers for the route and the store method are [§ D358](../DECISIONS.md#d358) and, for
the general question it left open, [§ D361](../DECISIONS.md#d361).

**No retention horizon came with it, and that is deliberate rather than forgotten.** An account
nobody deletes is kept; the route is a player's request, not a sweep. A horizon over `users` would
mean deleting the board entries of somebody who simply has not played this quarter, which is a
different decision from the one issue #254 asked for and is not taken here.

### 5.4 What makes an aggregate safe to keep forever

Only this: **an aggregate carries no identifier, no run pointer and no cell small enough to be one
person.** A KPI table row is a date, a build, a count and a rate. **The minimum cell size is declared in § 20.3**, which is
the only place in this document that states it — this sentence deferred it until the first table was
specified, and that has now happened. A row under the floor is refused rather than published, and it is refused *by name*, in the
product's own idiom: a cell that is too small says so, exactly as a suppressed mean does, rather than
disappearing.

---

## 6. The KPI set

### 6.1 A KPI is not a diagnostic, and the difference is what happens when it moves

| | **KPI** | **Diagnostic** |
|---|---|---|
| What it is | a figure the team steers by | a figure that explains why a KPI moved |
| How many | **four**, and they are stable across milestones | as many as have a stated question |
| Tied to | one `charter S` criterion each | none directly |
| When it moves | the milestone gate is affected | somebody investigates |
| May it be a gate? | yes | **no** |
| May it be shown to a player? | **no** (§ 10 non-goal 4) | **no** |

**There are four KPIs because there are four telemetry-shaped charter criteria.** That is the whole
mandate. A fifth KPI means either a fifth criterion or a metric the project steers by that the
charter never named, and both of those are decisions above this document.

### 6.2 The four

Each is stated so it can fail, in the charter's own idiom.

---

**`docs/26 K1` — reach, and time, to visible trouble.** Serves **`charter S1`** (*a first-time
player reaches a building in visible trouble within 90 s of first load*).

*Two figures, always published together.* (a) The share of first sessions that emit `trouble_visible`
at all; (b) among those, the **median** `atMs` of that event.

*Definition.* `trouble_visible` fires at the first moment in a session at which the stage the player
is looking at draws a waiting figure at or above the visible-trouble threshold **and has drawn it
continuously for the declared dwell**, with `document.visibilityState === 'visible'`. The dwell is
not decoration: passengers arrive in batches ([`CLAUDE.md`](../CLAUDE.md)), so an instantaneous count
crossing a line is a normal arrival rather than a building failing to drain, and a threshold with no
dwell would fire on every session and measure nothing.

*Fails when* the median exceeds 90 s, **or** the reach share is low enough that the median is a
survivorship figure. Both halves are needed: a median of 40 s over the 9 % of sessions that saw
anything would satisfy `charter S1` on a product that is quiet for everybody else — which is
precisely the state `docs/23-audiences-and-core-loop.md` `docs/23 A1` measured, at *worst wait ≤ 60 s
on 91 of 100 consecutive seeds* on the shipped day-one configuration.

*One constant is owed and is not this document's to set.* The threshold and the dwell belong to the
stage, which M2 rebuilds (#212). This document requires that they exist **once**, declared beside the
stage, cited by the schema and never re-stated in the telemetry client — `docs/26 P-5`. Two
definitions of *visible trouble* would be a second set of statistics, and the first time they
disagreed nobody would know which one the gate had used.

---

**`docs/26 K2` — first-session loop completion.** Serves **`charter S2`** (*60 % of first sessions
complete one diagnose–change–prove cycle*).

*Definition.* The share of first sessions that emit the ordered chain

> `session_start` → `run_observed` → `change_made` → `rerun_same_crowd` → `verdict_shown`

with each event's `atMs` at or after the previous one's, counted **once per session** (the first
completed chain; a player who does it four times is one completion, because the criterion is about
sessions).

*The chain is the five beats*, not a funnel invented here:
`docs/23-audiences-and-core-loop.md` § 3.2 numbers them **observe, diagnose, change one thing,
re-run the same crowd, read a verdict**, and states that they are `charter P4`'s three opened out.
Beat 2 — *diagnose* — has deliberately **no event**: it happens in the player's head, and in Fix a
building the product hands them the diagnosis outright. An event named `diagnosed` would be this
schema asserting something it cannot see. Its absence is why `charter S6` needs a playtest (§ 9.1).

*Fails when* the share is under 60 %. **Reported as a lower bound**, always: a lost `verdict_shown`
subtracts a completion and can never add one (§ 9.2), so the estimator can only make the gate harder
to pass, which is the correct direction for a gate.

---

**`docs/26 K3` — first-session length.** Serves **`charter S3`** (*median first session is 10 minutes
or longer*).

*Definition.* The median, over first sessions, of the `atMs` of the session's **last** event.
A session is closed at the first of: an explicit `session_end`, or **30 minutes** with no event.

*Why the last event rather than a session-end event.* `session_end` is best-effort — a closed tab, a
killed process and a crashed page all skip it — so a definition that required it would measure
tab-closing etiquette. Why no heartbeat: a heartbeat is collection whose only purpose is to make a
number larger, and a run's playback already bounds itself with `run_observed` at its end.

*The direction of the error is stated.* This under-reports, always — the interval between the last
event and the moment the player actually left is never counted. `charter S3` is therefore harder to
pass than reality, which is the safe direction and is the reason the estimator was chosen.

---

**`docs/26 K4` — day-one to seven-day return.** Serves **`charter S4`** (*25 % of day-one players
return within 7 days*).

*Definition.* Take the cohort of `playerId`s whose **first** `session_start` was received on UTC day
*D*. `docs/26 K4` is the share of that cohort emitting a `session_start` in (*D*, *D*+7]. Reported no
earlier than *D*+8, so that no cohort is published on a partial window.

*Fails when* the share is under 25 %.

*It is the KPI most damaged by § 3's identity choices*, in both directions: cleared storage and a
second device both look like a player who never came back. It under-reports, and it is published
with that sentence attached.

---

### 6.3 The diagnostics, and what they are forbidden to be

| Diagnostic | The question it answers | What it is **not** |
|---|---|---|
| **Beat-drop profile** | At which of the five beats, and on which screen, does a first session that did not complete `docs/26 K2` stop? | not a KPI, and not evidence about *why* — the screen where a session ends is not the reason it ended |
| **Refusal encounters** | Which of the five `awtIsValid` grounds, and which other refusals, do players actually meet? | **emphatically not a proxy for `charter S6`.** It counts refusals *drawn*, never refusals *understood* (§ 9.1) |
| **Field cold load** | Does the field distribution of time-to-interactive agree with the CI budget? | not the `charter S9` instrument. `charter S9`'s instrument is a CI budget that fails the build; a field distribution can **refute** the budget's representativeness and can never satisfy the criterion |
| **Screen reach** | Which registered screen keys are reached at all, in a real session? | not a `charter S10` instrument — that is the twenty-one journey rows in [`TEST_MATRIX.md`](../TEST_MATRIX.md) |

### 6.4 What a KPI may not be used for

- **Not shown to a player.** Not as a score, a streak, a rank, a percentile or a *you're in the top
  X %*. The charter's non-goal 1 forbids a scalar score over a run; a scalar score over a *person*
  is the same prohibition with a worse subject.
- **Not compared across builds without an interval and its counts.** The paired-CRN discipline in
  [`CLAUDE.md`](../CLAUDE.md) does not transfer — you cannot feed the same person to two builds — so
  a build-to-build comparison is **unpaired** and needs correspondingly more n. What does transfer is
  the rule that produced it: *a difference is reported with an interval and the count it was computed
  over, or it is not reported*. The failure mode named at the top of `CLAUDE.md` § Statistical
  discipline — a real difference smaller than the noise, published as a finding — is available here
  exactly as it is in a dispatcher comparison.
- **Not read as a criterion met.** `charter S1`–`charter S4` are met on a **recruited cohort** at the
  M4 gate. A KPI moving in the right direction on organic traffic is evidence, not a verdict, and
  [`docs/22-charter.md`](22-charter.md) § 4's rule stands: no criterion is reported as met before its
  instrument exists, and a criterion that work fails is raised rather than weakened.

---

## 7. The event schema

### 7.1 The envelope

One POST is one **batch**, and the identity lives on the batch rather than on each event — so a
single event has no identity of its own and cannot be sent alone.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | integer | `1`. An unknown version is **refused**, not guessed at — the both-directions refusal `persist/types.ts` and `everyday/profile.ts` already make about their own envelopes |
| `buildId` | string, build-time constant | Which build produced this. A constant baked at build time, never a user-agent string. If the viewer has no such constant when the client is built, one is added **there** rather than inferred here |
| `playerId` | 128-bit random hex | § 3.1 |
| `sessionId` | 128-bit random hex | § 3.4 |
| `events` | array, **≤ 64** | Over the cap, the batch flushes; over the batch cap for a session, events are **dropped rather than queued** — `FixedWindowLimiter`'s fail-closed choice, applied to memory on the client |

Every event carries exactly two common fields:

| Field | Type | Notes |
|---|---|---|
| `name` | enum of the ten below | P-3: the schema is the allowlist |
| `atMs` | integer | **Session-elapsed**, from a monotonic source, **rounded to 100 ms**. There is no client wall clock in this schema at all (§ 2.2). 100 ms resolves the 90 s threshold nine hundred ways and the ten-minute one six thousand, which is more resolution than either criterion can use |

The only absolute clock is the server's `receivedAtMs`, stamped at ingest, which is what orders
sessions relative to one another and what § 5.2's sweep reads.

### 7.2 The funnel events

**The funnel is the five beats of [`docs/23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md)
§ 3.2, and it is named here explicitly because `charter S1` and `charter S2` are funnel claims.**

| # | `name` | Beat | Fields | The question it answers |
|---|---|---|---|---|
| **E1** | `session_start` | — | `entryScreenKey` | How many sessions are there, where do they begin, and — derived server-side from this `playerId`'s first receipt — is this a first one? Denominator of every KPI |
| **E2** | `run_observed` | 1 | `run`, `reachedEndedAt` | Did the player watch a day? Beat 1 of `docs/26 K2`'s chain |
| **E3** | `trouble_visible` | 1 | `run`, `atRunS` | `charter S1`, exactly. `atMs` is the player's ninety seconds; `atRunS` is where in the simulated day it happened, which is a different clock and both are needed |
| **E4** | `change_made` | 3 | `controlKey`, `screenKey` | Did they change one thing? Beat 3 |
| **E5** | `rerun_same_crowd` | 4 | `run`, `crowdHeld` | Did they re-run, and was the crowd actually held? `crowdHeld` is **derived** by comparing this pointer with the previous run's on seed and demand fields — not asserted by the client (P-5) |
| **E6** | `verdict_shown` | 5 | `verdictKind`, `refusalGround`, `screenKey` | Was a verdict **drawn**? Beat 5 |
| **E7** | `session_end` | — | `endReason` | Best-effort session close. `docs/26 K3` does **not** depend on it |

**`verdict_shown`, not `verdict_read`.** Whether a player read anything is not observable, and a
field name that claimed it would be the first false thing in the schema. The event says a verdict
was drawn to a visible document; § 9.1 says what that does and does not license.

**`trouble_visible` ships once per session** — the first crossing only. A second one answers no
question in § 6 and would turn a funnel event into a stream.

### 7.3 The diagnostic events

| # | `name` | Fields | The question, from § 6.3 |
|---|---|---|---|
| **E8** | `screen_entered` | `screenKey`, `fromScreenKey` (nullable) | Beat-drop profile: where does an incomplete chain stop? |
| **E9** | `refusal_shown` | `refusalKind`, `screenKey` | Refusal encounters. Never `charter S6` |
| **E10** | `cold_load` | `msToInteractive` | Field cold load against the CI budget. Never `charter S9` |

### 7.4 The vocabularies

**Every enum is derived from the product, never authored here** — P-5, and the reason is `docs/26`'s
whole premise: a vocabulary retyped in a telemetry module is a vocabulary that goes stale silently.

| Vocabulary | Derived from |
|---|---|
| `screenKey`, `entryScreenKey`, `fromScreenKey` | the registry in `packages/viz/src/everyday/screens.ts`, whose key set is already asserted both ways against the mode inventory |
| `verdictKind` | the shipped comparison row's own classification — `BatchComparisonRow.verdict` and `favours`, the same fields `honesty/surfaces.ts` reads |
| `refusalGround` | the five grounds on which `awtIsValid` fails, listed in [`CLAUDE.md`](../CLAUDE.md) § Statistical discipline: saturation, an empty window, censoring above the unserved limit, a leg past the 900 s abandonment horizon, and an abandonment rate above 2 % |
| `refusalKind` | the shipped figure's own `SummaryFigure.kind` |
| `controlKey` | a declared control registry, owed by M2 with the controls themselves. **A control that changes a run and is not in the registry is a finding**, not a silent omission — which is `charter P4`'s *move the control and require the run to change* pointed at the instrument |
| `endReason` | `hidden`, `navigated`, `unknown`. Three values, closed |
| `run` | `SubmittedRun` from `packages/server/src/leaderboard/submission.ts`, unchanged (§ 2.1) |

**The chime ledger emits no event, and its absence from the table above is the allowlist doing its
job** — GitHub issue #368, [§ D526](../DECISIONS.md) clause 6, amended into § 10 non-goal 1 on the
commit that landed the ledger. A balance earned and a balance spent are **account state**, held by
`packages/server/`, and they are deliberately **not** E1 to E10: P-3 says the schema is the
allowlist, so an event named `chimes_earned` or `chimes_spent` would have to be added here to exist,
and adding one is what non-goal 1 refuses. There is no `chimeBalance` field on the envelope and none
on any event; `playerId` never joins an account id (§ 3.2), so nothing here could be correlated with
a balance even if somebody wanted to. **What this costs is stated rather than hidden**: no funnel
question about the currency can be answered from this schema — not whether a spend follows a clear,
not what a balance is at the moment a session ends, not whether the sign-in gift changes anything.
[§ D531](../DECISIONS.md) already records that last one as forfeited for a different reason, and the
other two are the price of an allowlist that means what it says.

**No field in this schema has an unbounded string type** except `buildId` and the two random ids.
That is P-4's second half expressed as a type rather than as a rule, and § 7.6's third test asserts
it. **The 2026-09-09 rewrite does not relax this by one field.** P-4 now permits typed text where a
player composed it for a destination they were shown; nobody composes a telemetry event, so the
schema's shape is unchanged and the test that pins it is unchanged. If a later proposal wants a
typed string in an event, the thing it has to defeat is not P-4's headline — it is the absence of a
destination the player was ever offered.

### 7.5 What a first session looks like on the wire

One batch, flushed when the tab is hidden, from a player who completed the loop:

```
{ schemaVersion: 1, buildId: "…", playerId: "…", sessionId: "…", events: [
  { name: "session_start",    atMs:      0, entryScreenKey: "menu" },
  { name: "cold_load",        atMs:    900, msToInteractive: 2100 },
  { name: "screen_entered",   atMs:   4300, screenKey: "stage", fromScreenKey: "menu" },
  { name: "trouble_visible",  atMs:  38200, run: { … }, atRunS: 412 },
  { name: "run_observed",     atMs: 121500, run: { … }, reachedEndedAt: true },
  { name: "verdict_shown",    atMs: 138000, verdictKind: "refused", refusalGround: "saturated", screenKey: "report" },
  { name: "change_made",      atMs: 196400, controlKey: "dispatcher", screenKey: "fixit" },
  { name: "rerun_same_crowd", atMs: 214900, run: { … }, crowdHeld: true },
  { name: "verdict_shown",    atMs: 331200, verdictKind: "better", refusalGround: null, screenKey: "report" },
  { name: "session_end",      atMs: 402000, endReason: "hidden" } ] }
```

Ten events, about 1 KB, well inside the 64 KB `MAX_BODY_BYTES` this server already enforces. This
session contributes: a reach and 38.2 s to `docs/26 K1`; one completion to `docs/26 K2` (the chain
completes on the **second** `verdict_shown`, because the first precedes the change); 402 s to
`docs/26 K3` — which **fails** `charter S3`'s ten minutes, and is a good example of a session that
felt complete and was short.

### 7.6 The three tests the schema owes before it ships

1. **Both polarities of the dead-seam rule** ([§ D219](../DECISIONS.md), [§ D227](../DECISIONS.md)).
   Every event name the client can emit is in § 7's table with a question and a KPI beside it; and
   every entry in the table has a **non-test emitter** in shipped code. An event nobody emits is a
   dead seam. An event no KPI reads is data held for no reason, which is worse.
2. **Absent-tolerance.** With the transport unset — the `vite dev` case, and any deployment with no
   API origin tag ([`docs/16-static-site-deployment.md`](16-static-site-deployment.md) § 4) — a
   session completes all five beats and every screen behaves identically. This is `docs/26 P-6`, and
   it is a browser-tier test rather than an argument.
3. **No unbounded string, and no clock in `core/`.** Asserted over the schema's declared types; plus
   the boundary rule that the telemetry client is importable by neither `packages/core` nor any
   module `boundaries.test.ts` keeps DOM-free. `CLAUDE.md` invariant 6 and invariant 3 both bite
   here: events need a monotonic clock, so the client lives where the DOM already does.

A fourth is implied by `charter S8` and is not this document's to write: every string the consent
surface draws is in `packages/viz/src/honesty/surfaces.ts` (§ 4.1).

---

## 8. Where an event can go — the deployment decides this, not the schema

[`docs/16-static-site-deployment.md`](16-static-site-deployment.md) is binding here and constrains
three things.

**One origin, and it is the API's.** The page is served from a CDN; the API is a Container App at a
second origin declared at build time. `staticwebapp.config.json` ships `connect-src 'self'`, widened
**only** to that declared origin. So a telemetry endpoint anywhere else is blocked by the page's own
policy before any code runs — the product's Content-Security-Policy is already the enforcement
mechanism for § 10's non-goal 2, and it predates this document. Ingest is therefore
`POST /api/telemetry` on the existing API and nowhere else, and § 3.3's and § 4.3's erasure is
`POST /api/telemetry/forget` beside it, taking a `playerId` and nothing else.

**This paragraph used to end *"Two routes, and no third — a schema that acquires a read route
acquires a way to look a player up"*, and that refusal was lifted on 2026-09-09.** The product owner
ruled on issue #250 that the product may read its own collected data back; the KPI dashboard is the
first consumer, and the ruling names this line by its old address (`docs/26:765`). **The refusal is
rewritten rather than annotated**, for `docs/26 P-4`'s reason one section up: a refusal left standing
after it stops being the rule is the more dangerous half of this repository's stale-refusal defect —
it tells the next reader not to build the thing that has just been authorised.

**What the withdrawn sentence got right is kept, because it was a true consequence rather than a
false one.** A read route *is* a way to look a player up, and saying so was correct. What was wrong
was treating that as unanswerable. **§ 18 is the answer**: three routes rather than two — ingest,
forget, and a read route that is bounded so that the lookup the old sentence feared is the one shape
it cannot perform. Read § 18 before building any of it; the ruling made the dashboard possible and
made this section's bound a requirement rather than a preference.

**And what #250 built on 2026-09-10 is *not* a third endpoint, which is worth saying here because
this is the section a reader consults to learn what the server answers.** R-1 is an offline,
analyst-initiated read over the store — `npm run dashboard --workspace @elevator-sim/server`, no
socket, no URL, nothing added to `http/api.ts`. The endpoint count on this deployment is therefore
still **two**. A URL would have decided who holds access, and § 20.6 leaves that open; R-3's route,
which genuinely would be a third, is drafted and not required (§ 18.2, `LAWYER` — § 19 item 11).

**Unauthenticated, and deliberately.** No bearer token, no cookies — the session is a bearer token in
an `Authorization` header and never a cookie, and `Access-Control-Allow-Credentials` appears nowhere
in this server. Sending the session token with telemetry would create the join § 3.2 exists to
prevent. Bounded by the existing 64 KB `MAX_BODY_BYTES` and rate-limited with the existing
`FixedWindowLimiter` pattern, keyed on the in-memory caller key that is never persisted.

**Never wake the container for a single event.** The app runs at `minReplicas: 0` and a cold start on
this deployment has been measured twice — **28.7 s** on `/api/challenges`
(`packages/server/src/accounts/credentials.ts`) and **32.2 s** in `docs/16`. Consequences, all three
of them requirements rather than optimisations:

- **Batch per session; flush on `visibilitychange` and at a declared interval, never per event.**
- **Never block the page, never retry aggressively, and treat total failure as normal.** A dropped
  batch is a data point lost, which § 9.2 already accounts for; a page waiting on a 30-second cold
  start is a product defect visible to the player.
- **Do not use telemetry as a warmer.** `GET /api/wake` exists for that and is the product's own
  choice about when to spend a cold start.

**Cost.** Ingest lands on infrastructure that already exists, so the marginal cost is rows in the
existing database — bounded by § 5's horizon, which is the reason the horizon is a number and not a
sentiment. The static host's egress quota is untouched: telemetry never goes to the CDN.

---

## 9. The honest limits

### 9.1 What no funnel can measure — `charter S6` and `charter S7`

> **`charter S6`** — *6 of 10 testers can state, unprompted, why the simulator refused a number.*
> **`charter S7`** — *lift-industry testers rate the model credible after inspecting it.*
>
> **Neither is funnel-measurable, and this document proposes no proxy for either.**

`charter S6` is about a sentence a person can produce without being prompted. The nearest thing an
instrument can see is `docs/26 E9` — a refusal was drawn on a screen — and the distance between
*drawn* and *understood, and articulable, unprompted* is the entire criterion. `charter S7` is worse
still: it is a **verdict** an expert reaches after a hands-on inspection, and the charter is explicit
that it must be reached *after inspecting it, not after being told about it*.

**A proxy metric for an unmeasurable thing is exactly the class of defect this repository exists to
prevent.** `docs/22-charter.md` § 4 already assigns both to a moderated playtest and a structured
interview; `RISKS.md` R31 puts the playtest programme in M1 beside this document, as issue #205.
Their instrument is people in a room, and this document's contribution to them is to **not** offer a
number that would let somebody skip the room.

The same applies with less drama to `charter S5` (an automated sweep over stages × profiles with
paired intervals under common random numbers), `charter S8` (the `docs/10` R1–R13 corpus, both tiers) and
`charter S10` (the twenty-one journey rows in [`TEST_MATRIX.md`](../TEST_MATRIX.md)). None is
telemetry's, and asking telemetry for any of them would produce a number that answered a different
question.

### 9.2 Absence is not evidence

Events are lost — a closed tab, an offline moment, a cold container, a blocking extension, a
corporate proxy, a crash. Therefore:

> **The absence of an event is never evidence that the behaviour did not happen.**

Which is why `docs/26 K2` is published as a **lower bound** and `docs/26 K3` as an
**under-estimate**, and why neither is ever quoted as *the* completion rate or *the* session length.
Both estimators were chosen so that loss makes the gate harder rather than easier: an instrument
whose errors flatter the thing it is gating is not an instrument.

### 9.3 The cohort is the consenting subset

§ 4.2. Unknown size, unknown direction, published in the same box as the figure. There is no version
of this that goes away, and the only way to make the bias smaller is to make the consent question
worse.

### 9.4 What telemetry cannot tell you at all

- **Why.** Every KPI is a rate. A rate never contains a reason, and the temptation to read one into
  it is strongest exactly when the rate is bad.
- **What a player understood, believed, enjoyed or would say about it.** § 9.1.
- **Whether the product is good.** `charter S1`–`charter S4` are thresholds on behaviour that a
  product can pass while being unpleasant, and can fail while being excellent for the ten people it
  is for. The charter's other six criteria exist because of this, and four of them are not
  telemetry's.
- **Anything about a person.** By construction (§ 3.2) — and this is a limit worth stating as a
  limit, because it is the one somebody will eventually ask to remove.

### 9.5 One discrepancy this document records rather than resolves

[`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M4's second exit criterion reads *"Telemetry
shows **S1 through S5** met on a recruited cohort"*, and `RISKS.md` R31 counts five criteria on the
same grouping. But [`docs/22-charter.md`](22-charter.md) § 4 assigns **`charter S5`** to *an
automated sweep over every stage × every admitted profile, paired intervals under common random
numbers* — an instrument telemetry cannot be, and § 9.1 says why it must not be asked to imitate one.

**Four of the five are telemetry's; the fifth is a sweep.** The wording is a gate assigning a
criterion to the wrong instrument, and correcting it is a change to a milestone page this lane does
not own. It is raised here so the pre-production gate meets it in writing rather than discovering it
at M4, when the gate is being read to decide whether the milestone exits.

---

## 10. Non-goals

**These are refusals, and a reviewer may refuse a pull request against one exactly as against a
charter pillar.** They extend `docs/22-charter.md` § 5 into this discipline and contradict none of
it.

1. **No purchase, price, store, conversion event or supporting telemetry ships anywhere.** No
   paywall, no lifetime-value figure, and no vendor to reach one through.

   **Amended by [§ D526](../DECISIONS.md) clause 6, on the commit that landed the chime ledger
   (GitHub issue #368), which is when § D526's own obligation says it may be amended and not
   before.** It read *"No monetisation of any kind, and no event that exists to support one"*, and
   that sentence was true of a product with no currency in it. There is one now — chimes, earned by
   completing turns and spent on a mode's modifiers ([§ D530](../DECISIONS.md),
   [`38-what-the-game-is.md`](38-what-the-game-is.md) § 2.4) — and it is **not** monetisation: no
   real money enters this product at any point, and none can.

   **What changed is the shape of the refusal rather than its strength.** The old form forbade a
   category; this forbids the machinery, which is the half a reviewer can actually check. A ledger
   has sources; today they are three completed turns and one unconditional gift. An external add —
   a purchase, a gift card, an operator's correction — would be **one more source on the same
   ledger**, and because the play surface reads only the balance, nothing on it would move when such
   a source appeared: no store, no price in money, no purchase screen, no conversion event and no
   telemetry that exists to support one. That is what *the ledger is built so one could be a source
   later* means, and it is the reason it is safe to write down.

   **Such a source is added only by a decision that cites a measured `charter S4`**, and until then
   there is no purchase anywhere. Three checks hold this rather than a reviewer's attention:
   `packages/core/src/config/chimeLedger.ts` refuses a source earned by anything but a completion or
   a gift, and refuses any unrecognised key in the document — which is where a price in money would
   otherwise land; no route on the account takes an amount from a request, so a client has no
   argument in which to name one; and
   `packages/experiments/src/validation/documentation.test.ts` reads every source file under
   `packages/` with its comments and strings removed and requires that none of them names a
   payment processor, a storefront, a bundle or an amount in money, deriving the population from
   disk so a new file cannot escape by not being on a list. Non-goal 4 below is restated for the
   currency: the balance is a tally of completed turns, not a metric over a person built from
   telemetry.
2. **No advertising, and no third-party ad, marketing or analytics tracker.** No vendor SDK, no
   CDN-hosted script, no pixel, no tag manager. This is enforced today by `connect-src 'self'` (§ 8),
   and **widening the policy for an analytics vendor is refused**, not negotiated.
3. **No dark pattern in the consent flow.** No pre-ticked box, no *by continuing you agree*, no
   asymmetric buttons, no repeated asking after a refusal, no consent wall, no feature gated on
   agreeing, no *are you sure* on withdrawal.
4. **No metric that becomes a number shown to a player.** No score, grade, rank, streak, percentile
   or peer comparison built from telemetry. The charter's non-goal 1 forbids a scalar score over a
   run; this forbids one over a person. *(The leaderboard is not this: it ranks measured run figures
   that the server re-simulates, and it carries no behavioural data at all.)*
5. **No session replay, heatmap, pointer track or keystroke capture.**
6. **No data sold, shared, exported or made available to a third party**, in raw or aggregate form.
   **One thing this does not forbid, stated because it would otherwise read as a contradiction the
   day #245 lands.** A player who writes a problem report and presses send is **publishing their own
   words**, to a destination named on the surface they typed into — the owner's ruling of 2026-09-09
   sends those reports to public issues in this repository. That is the player disclosing, not the
   product sharing, and the distinction only holds while the surface says so **before** the press
   and in plain words (§ 13.4, § 15.4). Take that sentence off the surface and this non-goal is
   breached, which is why the sentence is a requirement of the ruling rather than a nicety.
7. **No profiling of an individual.** No per-player view, no segmentation into cohorts a person
   belongs to by behaviour, no targeting of anything at anyone.
8. **No collection outside the schema.** § 7's table is the allowlist and § 7.6's first test is how
   it stays one.
9. **No second engine and no second statistics.** Telemetry never recomputes a figure the run
   already computed; it names the run (§ 2.1). This is the charter's non-goal 7 arriving through a
   door nobody was watching.
10. **No telemetry inside `packages/core/`.** Invariant 3 forbids the clock, invariant 6 forbids the
    dependency, and a simulation that behaves differently when somebody is watching is not a
    simulation.

---

## 11. What this document does not settle

Recorded here because a specification that hides its own open items is the defect it exists to
prevent.

- ✅ **§ 1's posture is [§ D412](../DECISIONS.md)** (2026-08-29), which adopts it and nothing more.
- ~~**The lawful basis, the published privacy notice, and whether an age statement is needed** are
  human decisions and are not taken here (§ 1.3).~~ — **moved to Part B on 2026-09-09, and moved is
  not settled.** They are now drafted: the lawful basis as options in § 14, the notice's words and
  placement in § 15, children in § 17. **Every one of them is flagged `LAWYER` in § 19 and none is
  decided.** Struck through rather than deleted, on this document's own § 0 rule: a register whose
  rows are silently rewritten is one nobody can date. The two substantive claims in the old bullet
  survive the move and are re-checked in § 13: no data class in § 7 is special-category, and the
  display name is governed where it lives.
- **The visible-trouble threshold and dwell** (`docs/26 K1`) belong to the stage and are owed by M2.
  Until they exist, `charter S1` has a schema and no constant.
- **The control registry** (`controlKey`) is owed by M2 with the controls.
- ~~**The account erasure route** (§ 5.3) is owed by whoever owns `packages/server`~~ — **landed
  2026-08-24** (issue #254), and its AC3 is met on the second limb: the absence is stated on the
  surface that offers the account, and pinned by `mailer.test.ts` rather than by prose.

  What is **not** owed by that criterion and is nonetheless worth doing is **a surface that reaches
  it**, because a route a cohort cannot press is not an erasure path a cohort can use, whatever the
  criterion says. That belongs to whoever owns `packages/viz/src/everyday/settingsScreen.ts` and is
  not a one-line change: `menu/client.ts` needs a method, the screen needs a row and a
  confirmation, and both enter the honesty corpus. **When it is wired, the mail's sentence stops
  being true and must go** — and the server suite will say so on that commit, which is this
  repository's stale-refusal rule mechanised rather than restated.
- **`CHARTER_PROGRAMME.md` § M4's *S1 through S5*** (§ 9.5) is a milestone-page correction this lane
  does not own.
- ~~**The minimum aggregate cell size** (§ 5.4) is declared before the first KPI table is published,
  not here.~~ — **declared 2026-09-09 in § 20.3**, which states the figure and the grounds it rests
  on. Struck through rather than deleted, on this document's own § 0 rule. A register that quietly drops a row it has
  paid is one nobody can date; a register that keeps carrying a debt it has paid is decoration.
- **The KPI dashboard's owner is not named** (§ 20.6). The role and the decisions that come with it
  are specified; who holds it is a staffing question this document cannot answer, and the name is
  owed **before the first table is published** rather than before the dashboard is built. Recorded
  here because the last gap in this criterion was worse for being unrecorded: GitHub issue #201's
  fifth criterion was unmet **and absent from this register**, so a reader consulting it to learn
  what was left would not have learned that a criterion had been skipped.
- **All four KPI baselines read `unmeasured`** (§ 20.4) and will until the instrument exists. The
  protocol for taking them is specified, so that the first number is not argued about after it
  exists.
- **The recruited cohort itself** — how it is recruited, what it is told, and what it consents to —
  is the playtest programme's (#205), and a recruited cohort's consent is a different conversation
  from an anonymous player's.
- ~~**Nothing in this document has been built, and no part of it may be reported as an instrument that
  exists.**~~ — **built 2026-09-10** (GitHub issue #340): §§ 3, 4, 5 and 7 are code, and § 8's two routes
  exist. Struck rather than deleted, on § 0's own rule. **The second half of the sentence is unchanged and
  is now the whole of it**: every `charter S1`–`charter S4` claim stays recorded as **unevaluated**, because
  an instrument is not a measurement and no cohort has been recruited. What #340 did *not* build is named
  in its own report rather than here: `rerun_same_crowd` has no shipped emitter and is registered as such
  in `telemetry/schema.ts#UNEMITTED_EVENTS`, asserted in both directions; § 6.2's **dwell** is still owed by
  M2 with the stage, so `docs/26 K1` fires on the stage's own alarm threshold and on no wall-clock dwell;
  and ~~§ 18's read route is unbuilt, which is #250's~~ — **built 2026-09-10** (GitHub issue #250):
  R-1 is `packages/server/src/telemetry/dashboard.ts`, reached by
  `npm run dashboard --workspace @elevator-sim/server`, and § 20.3's floor is enforced in it rather
  than described. Struck rather than deleted, on § 0's own rule. **What #250 did not build is named
  here because it belongs in this register**: the holder's name (§ 20.6, its own row above), the four
  baselines (§ 20.4, its own row above), and P1's figures, which are refused whole for as long as
  the **dwell** row above is open — the dashboard derives that refusal from the missing constant, so
  the two cannot drift.

  **And P2's and P5's figures, for the `rerun_same_crowd` clause of this very row.** `docs/26 K2`'s
  chain runs through beat 4, so while that beat has no emitter the chain cannot close: P2's
  completion share can only read **0 %** — against `charter S2`'s 60 % target — and P5's every cell
  would attribute a drop to a beat no player can be observed reaching. Both panels are refused whole
  rather than re-defined over the beats that do emit, because § 6.2 owns K2 and a second definition
  is P-5's failure. The dashboard derives that refusal by reading `UNEMITTED_EVENTS` itself, so this
  row and the code go red together whichever of them moves first. **This was found while building
  #250 and not while specifying it**: § 20.2 was written the day before #340 landed and its refusal
  column could not have known, which is this register's own argument for dating a row rather than
  trusting it.
- **The consent surface may not be turned on until Part B has been reviewed**, and nothing in the code
  enforces that — a deployment turns it on by serving a build with an API origin tag. The client is
  built, the words are drafted, and the decision to show them to a person is the product owner's
  condition on this document's own face.
- **Part B's own open items are in § 19 and not repeated here**, so that a reader does not have to
  reconcile two registers of the same debt. § 19 is a checklist for a legal reviewer; this section
  is a register of engineering debt, and the two are different audiences.

---

# Part B — the privacy posture for the whole product

*Written 2026-09-09 for GitHub issue #202, under the three owner rulings in § 12.1. **Draft. Not
reviewed. Not legal advice.** The banner at the top of this document is the condition it ships
under, and § 19 is the reviewer's list.*

---

## 12. Why Part B is here, and what it governs

### 12.1 The three rulings that produced it

All three were made by the product owner on 2026-09-09 and each is quoted from the GitHub issue that
carries it, because a ruling paraphrased is a ruling that drifts.

| # | Issue | The ruling | What it changed here |
|---|---|---|---|
| **1** | **#242** | *"`docs/26` P-4 — no free text, ever — is **rewritten rather than excepted**. An exception list would leave the rule saying one thing and the product doing another."* | `docs/26 P-4` (§ 1.1), its correction note, § 2.2's row, § 7.4, and [`docs/30`](30-playtest-programme.md) § 9.1 |
| **2** | **#250** | *"The product may read its own collected data back. The read route `docs/26:765` forbade is allowed."* — conditional on this posture: *"who may read it and how long it is kept are part of that posture, and the dashboard should not ship ahead of it."* | § 8's refusal, and § 18 |
| **3** | **#202** | *"I draft the posture … and it ships marked as **requiring professional legal review before it goes live**. I am not able to make that call and the document will say so on its face."* | The banner, § 1.3, § 14, § 17, § 19 |

A fourth ruling on **#245** is not a privacy ruling and binds Part B anyway: problem reports go to
**public issues in this repository**, and *"the surface has to say, plainly and next to the box, that
what they write will be publicly visible. That is a requirement of this ruling, not a nicety."*
§ 13.4 and § 15.4 carry it.

### 12.2 Why this is a Part of `docs/26` and not a new document

The obvious alternative was a sibling document — a new numbered file under `docs/`, the next free
number being 40 — and it was rejected for a reason this repository has a name for. (Named without a
backtick and without its extension on purpose: `validation/citations.test.ts` resolves every
backticked markdown path against disk, and a file this section exists to say was *not* created would
fail that guard. The same fix its own header recommends for a decision number written in prose.)

**Three of Part A's rules had to change whichever way this went** — `docs/26 P-4`, § 8's read-route
refusal, and § 1.3's parking of the legal questions. A posture whose rules live in one file and
whose corrections live in another is a rule saying one thing while the product does another, one
directory over: a reader who finds § 8 finds *"two routes, and no third"* and has no reason to go
looking for a second document that lifted it. Ruling 1 exists precisely to refuse that shape, and
taking it seriously means the correction sits where the rule sits.

Three supporting reasons, none of them decisive alone:

- **`docs/26` is already the privacy home in practice.** It carries the account data (§ 5.3), the
  board entries and their seeds (§ 2.1), the erasure route, the two on-device slots telemetry
  introduces (§ 5.1) and the whole consent design (§ 4). Issue #202's own verification comments
  score its acceptance criteria against this file, section by section.
- **§ 11 is a register of what this document does not settle, and Part B is that register being
  discharged.** Discharging it from another file would leave § 11 pointing at debt it no longer
  owns.
- **Six lanes are running in parallel on this repository today**, and the next free document number
  is one any of them could also take. That is the weakest reason and it is real.

**The cost, stated rather than hidden.** This file is now long, and a reader who wants the account
posture must scroll past a telemetry schema that is not built. The mitigation is structural rather
than apologetic: **Part A is the telemetry instrument, Part B is the product's posture**, the
banner says so at the top, and § 13's inventory is the entry point for anybody who came here to
find out what the product holds.

### 12.3 The rule that stops the two halves drifting

> **One item, one row, one home.** Part B does not restate a retention horizon Part A already
> carries. **§ 5.1 owns the seven classes in its own table**; § 16 owns everything else, and points
> at § 5.1 for those seven by name rather than repeating them.

Two tables answering *how long is a session kept* is how they come to disagree, and a figure that
went stale because two places carried it is the failure [`CLAUDE.md`](../CLAUDE.md) records against
this repository more often than any other.

---

## 13. What is collected, itemised, and why

### 13.1 How to read this section, and what was measured

**Every row is a thing that exists on this tree today unless its Status says otherwise.** Three
statuses are used and the difference matters more than any other column:

- **SHIPS** — in the product now. The row cites the code.
- **SPECIFIED** — designed in Part A, **no code**, and it may not be described to anybody as an
  instrument that exists (§ 11).
- **PROPOSED** — an open issue wants it and nothing is designed. The row exists so the posture is
  written *before* the collection, which is § 1.2's whole argument.

**The six facts in § 0 were re-measured on 2026-09-09 before this section was written**, because an
inventory argued from an assumed starting state is an inventory of a different repository. Commands
as published, results as found:

| § 0 fact | Re-measured 2026-09-09 | Moved? |
|---|---|---|
| 1 — no telemetry or analytics code *(refuted 2026-09-10 by GitHub issue #340; the row below is the 2026-09-09 measurement and is left as the dated record it is)* | `grep -ril telemetry packages/*/src --include='*.ts'` → **3 files**, all of them a test, a test's regex or a comment saying there is none; `analytics` → **2 files**, both tests. `grep -rin telemetry packages/server/src` → **6 lines**, every one a comment or a test regex | **no** — the claim (*no telemetry code, route, table or event*) holds; the file count moved when `validation/documentation.test.ts` gained the case that asserts it |
| 2 — one piece of personal data, an email address | `users.email`; `normaliseEmail` is still its only writer (`store.ts:243`, `:414`, `:441`) | **no** |
| 3 — no IP address persisted | `clientIp` reaches `limiters.perCaller.charge` (`api.ts:412`) and nothing else; `grep clientIp packages/server/src/store/store.ts` → **nothing** | **no** |
| 4 — no request log | three `console.*` sites outside tests, all in `main.ts` — two boot lines (`:80`, `:388`) and one fatal (`:407`). None carries a request, an address or a name | **no** |
| 5 — third-party trackers forbidden at the policy level | `packages/viz/staticwebapp.config.json:10` still ships `connect-src 'self'` | **no** |
| 6 — no way to delete an account | `Store.deleteUser` (`store.ts:536`) under `DELETE /api/me` (`api.ts:333`, handler at `:785`) | **already corrected in § 0**, and it still reproduces |

**One thing that has changed since § 0 was written and is not one of the six.** The old fact 3
sentence said the socket peer *"is never handed to `Store`"*; that is still true, and the reason is
now narrower than it was: `clientIpOf` records the caller's own text rather than any hop's
observation ([§ D242](../DECISIONS.md), `serve.ts:413`), which changes what the value **is** without
changing where it goes.

### 13.2 The inventory

**On the server.** Everything here is in `packages/server/src/store/store.ts`'s `SCHEMA`, which is
one file and is the whole of what this product persists.

| # | Item | Status | What it is | Why it is held |
|---|---|---|---|---|
| **S1** | `users.email` | **SHIPS** | An email address, normalised (trimmed, lower-cased) | The product's **only** credential is an emailed sign-in link ([§ D241](../DECISIONS.md)). Without an address there is no way to prove the same person is returning, and no way to send the link they asked for |
| **S2** | `users.display_name` | **SHIPS** | **Player-typed**, 2–32 characters, refused only for control and formatting characters (`api.ts#displayNameIssues`) | A board row needs something to say other than an id. **It is public**: every leaderboard a stranger can open renders it |
| **S3** | `users.display_name_chosen` | **SHIPS** | A boolean | Distinguishes a name a person typed from the `player-<hex>` placeholder an account gets before anybody signs in (`api.ts:656`). A screen that asked *choose a name* of somebody who had would be wrong |
| **S4** | `users.id`, `users.created_at_ms` | **SHIPS** | A `randomUUID` and an epoch millisecond | The key everything else hangs off, and the row's own age |
| **S5** | `sessions` | **SHIPS** | A bearer token, the account it names, an expiry | Keeps a signed-in player signed in. A table rather than a stateless token because **revocation is a `DELETE`** ([§ D214](../DECISIONS.md)) |
| **S6** | `login_tokens` | **SHIPS** | A token **identity** (`jti`) and never the token | What makes a sign-in link single-use. The signature stays valid forever, so the row's absence is the only thing that can say a link was spent |
| **S7** | `entries` | **SHIPS** | A board row: the seed, the run pointer as JSON, four measured figures, the served-leg count, the submission time, the account | The leaderboard. The **server's own replay** produces every figure; a client never sends one, because a denominator is the number a cheat would most want to choose |
| **S8** | `challenge_entries` | **SHIPS** | The same shape over a challenge's seed set | The six engineering challenges' boards |
| **S9** | `challenges` | **SHIPS** | Ids, a window, the issued configuration | Not personal data at all. Listed so the inventory is the whole schema and a reader can check it against `SCHEMA` |
| **S10** | The rate-limit key | **SHIPS**, in memory | The caller's own text for its address, in a `FixedWindowLimiter` | Refusing a flood. **Never written** — § 0 fact 3, re-measured above |
| **S11** | `.outbox.jsonl` | **SHIPS**, development only | Every mail the `OutboxMailer` sends, address in the clear, never swept | A developer needs to read the link they were mailed. **Unreachable in production**: `packages/server/src/bootstrap.ts:121` refuses to start when `NODE_ENV=production` and the mailer is an `OutboxMailer`, and the `Dockerfile` and `infra/azure/main.bicep` both set that variable. § 5.3 already names it |
| **S12** | Telemetry rows | **SPECIFIED** (§ 7) | The batch envelope and its ten events, carrying `playerId`, `sessionId` and run pointers | `charter S1`–`charter S4`, and nothing else (§ 6) |
| **S13** | Problem reports | **SHIPS** (#245), **and it is in no table above** | **Player-typed text**, plus the seed, the configuration, the build and the browser | A report the team can replay is worth more than one it cannot. **Destination: a public issue in this repository** (§ 12.1's fourth ruling). Listed here and marked as outside the schema on purpose: `packages/viz/src/everyday/support.ts` composes the report in the page and the **player** posts it from the repository's own form, so nothing about a report passes through this product's API and no row is written for one. § 8's *two routes, and no third* is untouched by it |
| **S14** | Error reports | **PROPOSED** (#242) | A client or server error: message, stack, build, and whatever the runtime attaches | Nobody currently finds out when the deployed page throws |

**On the player's device.** Every one of these is `window.localStorage` at the page's own origin. It
is on their machine, it is readable by anybody who has that machine, and **none of it reaches the
server unless the player posts a run**.

| # | Slot | Status | What it holds | Why |
|---|---|---|---|---|
| **D1** | `elevator-sim.session` | **SHIPS** | The Engineer session, **and the saved library beside it**: buildings, dispatchers, patterns and machine classes, each with **the name the player typed** (`persist/types.ts#SavedLibrary`, `DroppedEntry`) | Work a player authored and cannot recover any other way — which is why `persist/` gives it the larger of the two character budgets |
| **D2** | `elevator-sim.everyday-profile` | **SHIPS** | **The player-typed name and an avatar colour** (`profile.ts#EverydayProfile`), plus progress, units, default speed and the sound preference | The name and colour travel with every posted run; the four siblings are preferences, kept as siblings so a display preference cannot ride along with a submission ([§ D448](../DECISIONS.md)) |
| **D3** | `elevator-sim:career`, `elevator-sim:career:refused` | **SHIPS** | Career progress, and the quarantine slot for an envelope this build refused | A career that persists across sessions ([§ D525](../DECISIONS.md) names the mode; the slot is `campaign/careerPersist.ts`'s). The quarantine exists so a refusal is inspectable rather than a deletion |
| **D4** | `elevator-sim.viewMode`, `elevator-sim.revealedTabs` | **SHIPS** | Which Engineer view, and which tabs have been revealed | Interface state |
| **D5** | The account bearer token | **SHIPS**, **in memory only** | The session token | `menu/account.ts:73` keeps it out of `localStorage` deliberately, and `dev/main.ts:1597` says a persistence layer may not widen that decision from a directory that does not own it. **Listed because its absence from the list would look like an omission** |
| **D6** | `playerId`, consent state | **SPECIFIED** (§ 3.1, § 5.1) | 128 random bits, and one answer | Telemetry's unit, and the answer that gates it |

**What is deliberately not collected** is § 2.2, and it is unchanged by any ruling in § 12.1. The
one row that had to be re-argued is *any player-authored string*, and it is re-argued in place.

### 13.3 Two things this inventory says that a reader should not skim past

**The public field is `display_name` and there is exactly one of it.** A player can type their own
legal name into it, and some will. The product cannot prevent that and should not pretend to; what
it owes is that the field's own surface says the name is public **before** it is set, which § 15.3
drafts. `LAWYER` — § 19 item 7.

**The device holds more player-authored text than the server does.** D1 and D2 together hold every
name a player has typed for a building, a dispatcher, a pattern, a machine class and themselves.
None of it leaves the device except the profile's name and colour, which `everyday/profile.ts`
states travel with every posted run. That is a good posture and it
has a consequence people get wrong in both directions: it is **not** a reason to treat the device as
out of scope (§ 16.3 gives it retention rows and a deletion path, which is issue #202's AC6), and it
is **not** collection by this product either.

### 13.4 The three things that attach to any typed string, anywhere

This is `docs/26 P-4`'s positive half, stated once so that #245, #242 and any later feature inherit
it rather than re-arguing it.

> **T-1 — A destination, stated on the surface, before the press.** In plain words, next to the box,
> in the player's own vocabulary. Not in a notice they could go and read; on the thing they are
> typing into. For #245 this is *what you write here will be publicly visible* — the fourth ruling's
> requirement.
>
> **T-2 — A retention row.** § 16 gains a row before the feature ships, with a horizon and the
> mechanism that enforces it. A horizon with no mechanism is an intention (§ 5.2).
>
> **T-3 — A deletion path, and it is named on the same surface.** What happens if they want it gone,
> and whether the product can actually do it. **Where it cannot, the surface says so before the
> press** — a public issue in a public repository is the case where this bites, because the product
> cannot unpublish a copy somebody has already read.

**T-3 is the one that will get argued with**, so the argument is here. The temptation is to promise
deletion because it reads better. A promise the product cannot keep is worse than the honest
sentence, and this repository has the precedent in code rather than in principle: `fuzz-1000384` was
closed *"by revoking a promise a withdrawn car cannot keep"* ([`CLAUDE.md`](../CLAUDE.md), Phase 8).

---

## 14. The lawful basis — options, consequences, and no decision

> ### `LAWYER` — this whole section
>
> **Nothing below is chosen.** This is the part of the posture a non-lawyer must not invent, and the
> product owner has said the same of himself (§ 12.1, ruling 3). What follows is the option set with
> the engineering consequence of each, so that a reviewer is choosing between described things
> rather than starting from a blank page.

### 14.1 Four facts a reviewer needs before the options mean anything

Stated first because three of the four change the answer, and none of them is obvious from the code.

1. **There is no controller named anywhere in this repository.** No legal entity, no registered
   address, no contact point for a data question. The repository is one person's GitHub account.
   A notice cannot be written without this. **`LAWYER` — § 19 item 1.**
2. **The deployed API runs in a United States region.** [`docs/16`](16-static-site-deployment.md)
   § 0's *what is true now* table records the Container App at
   `https://elevsim-app.salmonstone-4576d6f7.eastus2.azurecontainerapps.io` and the page at
   `https://yellow-glacier-0ff81230f.7.azurestaticapps.net`; `infra/azure/main.bicep` defaults
   `location` to the resource group's, so the region is a deployment choice rather than a constant
   in the tree. Whoever reviews this needs to know where the database actually is on the day it
   holds a row. **`LAWYER` — § 19 item 2.**
3. **There are processors, and they are named.** Microsoft Azure (Container Apps, PostgreSQL flexible
   server, the static host) and **Azure Communication Services** for the sign-in mail
   (`packages/server/src/mail/acsMailer.ts`). No analytics vendor, no ad network, no CDN-hosted
   script — enforced by `connect-src 'self'` (§ 8) rather than by policy. **`LAWYER` — § 19 item 3.**
4. **The product may need more than one basis, and that is normal rather than a defect.** The email
   address exists to deliver a thing the player asked for; the telemetry exists because the project
   wants to know something. Those are different processing, and § 13.2 is itemised so that a basis
   can be chosen **per item** instead of once for everything.

### 14.2 The options for telemetry (S12) and error reports (S14)

| Option | What it would mean here | The consequence, stated |
|---|---|---|
| **A — Consent** | What Part A already designs: § 4's ask, § 4.2's silent refusal, § 4.3's withdrawal-that-deletes | **Already specified and costed.** The cost is § 4.2's: the consent rate is unmeasurable and every KPI is measured on the consenting subset, with the bias published beside it. The ask must be genuinely free — § 10 non-goal 3 already forbids every dark pattern that would compromise it |
| **B — Legitimate interests** | Measure without asking, offer an objection route instead of a consent one | **Whether it is available here at all is the reviewer's call and is not assumed.** What this project can say about it is engineering: it removes § 4.2's bias, which is the only thing it buys; it costs the product the sentence it currently gets to say — *nothing is collected without an explicit grant*; the ask in § 4 would be replaced by an objection route that has to be built and has no design; and it may not reach the device at all (§ 14.3) |
| **C — Consent for telemetry, something else for error reports** | Split the two: measurement is optional, a crash report is arguably operational | Two asks, or one ask and one notice. The hazard is § 4.4's — a consent surface that acquires a second question is a consent surface that gets clicked through. If this is chosen, they are two surfaces, not two checkboxes |
| **D — Neither: do not collect** | The KPI programme does not exist; `charter S1`–`charter S4` have no instrument and the M4 gate has no evidence | The honest option, and it is on the list because a list that omits *do nothing* is a list arguing for collection |

**`LAWYER` — § 19 item 6**, and the two halves may be answered differently: telemetry (S12) and
error reports (S14) are one row here only because they share a transport, not because they share a
purpose.

### 14.3 The question that survives whichever option is chosen

**The question, asked and not answered: is *storing something on a player's device* governed by
anything other than the personal-data question above?** The author's understanding is that in some
jurisdictions it is treated separately, and that understanding is not worth relying on — it is
recorded here as the reason the item exists on the checklist, not as a statement of law.

**What this document can supply is the facts.** This product writes **six** slots today (§ 13.2,
D1–D4) and would write **two** more (D6). None is for advertising, none is a tracker, none is read
by any third party, and most of them hold work the player authored — a saved building, a career, a
name. What a reviewer needs beyond that list is nothing this repository holds.

It is flagged as its own item because it is the one a reader is most likely to assume was settled by
choosing option A or B in § 14.2, and choosing one of those settles nothing about it.
**`LAWYER` — § 19 item 4.**

### 14.4 The account (S1–S8) and the board

**The facts, and then the question.** The email address is used for one thing: delivering the
sign-in link the player asked for (S1, § 0 fact 2). The board row exists because the player pressed
*submit*, and every figure on it is the server's own replay rather than anything the client sent
(S7). Neither is collected in order to learn something about the person.

**Which basis that is, whether it is the same basis as telemetry's, and whether the board's public
display of a typed name needs treatment of its own, is not decided here.** The shapes are different
enough that a reviewer may well reach a different answer for the account than for § 14.2 — which is
the whole reason § 13.2 is itemised. **`LAWYER` — § 19 items 5 and 7.**

---

## 15. What players are told, and where

**Drafted copy.** None of it ships in this commit; every string here enters
`packages/viz/src/honesty/surfaces.ts` on the commit that renders it, or `charter S8` is not met
(§ 4.1). The wording is subject to § 19's review, and to the restatement rule in
[`docs/23`](23-audiences-and-core-loop.md) § 1.4: a figure may be renamed or restated, never
softened.

### 15.1 Four places, and each is answering a different question

| Where | When the player meets it | What it answers |
|---|---|---|
| **The consent ask** (§ 4.1) | Once, on first load, before any identifier exists | *Is anything being collected about me, and can I say no?* |
| **The point of collection** | Next to the box, at the moment of typing | *Where do these words go?* (T-1) |
| **The settings screen** | Whenever they look | *What is being kept, and how do I stop it and delete it?* |
| **The published notice** | From a link on the settings screen and on the consent ask | *Everything else* — the controller, the processors, the retention table, the rights |

**The consent ask may not cite this document by path** (§ 4.1, charter non-goal 8), and the notice
is the only one of the four that may be long.

### 15.2 The consent ask — drafted copy and the four states

`docs/26` § 4.1 said what the question owes and drafted none of it, which is issue #202's AC5. This
is the draft. Two answers, equally easy to give and equally easy to reach; no pre-tick, no *by
continuing you agree*, no styling that makes one look like the way forward (§ 10 non-goal 3).

> **Heading** — *Can we count how the game is going?*
>
> **Body** — *We would like to record which screens you reach, how long you play, and which building
> and settings each run used. It stays on our own server and goes nowhere else.*
>
> *We do not record anything you type, your name, your email address, where you are, or what you do
> on any other site. Saying no changes nothing about the game — every mode, every screen and every
> number works exactly the same.*
>
> **Answers** — `No` · `Yes, count it`
>
> **Under both** — *You can change this later in Settings. Turning it off there also asks us to
> delete what was already recorded.*

**One word in that last line is doing work and is not a hedge.** *Asks* rather than *deletes*: the
local half is immediate and the server half is a request that can fail (§ 4.3), and a consent screen
that promised deletion outright would be making exactly the promise T-3 refuses (§ 13.4). It is the
same sentence one state further on, in the withdrawn row below, said before the player has to rely
on it.

Four states, and the third is the one a design usually forgets:

| State | What the player sees | What the product does |
|---|---|---|
| **unasked** | The question | Nothing is collected. **The screen behind it is fully usable** — § 4.4: no screen waits on an answer, and an unanswered question is a no |
| **granted** | A settings row reading *Counting how the game is going: **on***, with a control to turn it off | Mints the `playerId`, begins the batch (§ 7.1) |
| **refused** | The same row reading ***off***, and never the question again | Nothing. **Not even the refusal** (§ 4.2) |
| **withdrawn** | *Off. What was recorded has been asked to be deleted.* | § 4.3's three steps, in order, including the honest sentence about the half that can fail |

**The withdrawn state's sentence is drafted here because it is the one that can lie**, and § 4.3
already requires it to say so: *"The local half is immediate. Deleting what reached our server is a
request, and if you were offline it may not have arrived — in that case it is deleted when it ages
out."* Blunt, and true. **`LAWYER` — § 19 item 8**, on whether that is an adequate description.

### 15.3 The display name, at the point it is set

One line beside the field, drafted: *This name is shown on every leaderboard. Anyone can read it, so
use something you are happy to be seen.*

It does not exist today. **`LAWYER` — § 19 item 7.**

### 15.4 The problem report, at the point it is typed (#245)

Two lines beside the box, drafted, and the first is the fourth ruling's requirement verbatim in
substance:

> *What you write here is posted publicly, as an issue in this game's public code repository.
> Anyone can read it, and it stays there.*
>
> *We attach the seed, the building and the settings of the run you were on, plus the build and your
> browser version, so we can reproduce it. We do not attach your name or your email address.*

**The second line is a T-1 obligation and not a courtesy**: a report that silently carries a run
pointer is collection the player did not compose. **`LAWYER` — § 19 items 9 and 10**, on the public
destination and on whether anything else must be said before a child can press that button (§ 17).

**Both lines are drawn now — one of them verbatim — and the surface says two more things this draft
did not ask for.** `packages/viz/src/everyday/support.ts` is the block, on the settings screen.

The first line is this section's, **word for word, plus one clause**: *do not put anything about
yourself or anyone else in the box that you would not put on a public page*. It is drawn immediately
**above** the box rather than beside it, because a reader who has already typed has already decided.

The second is reworded rather than quoted, and the rewording is the point: this draft names what is
attached (*the seed, the building and the settings … the build and your browser version*), and the
shipped surface **shows those lines** and says the words travel with them. A sentence describing an
attachment the reader can see beside it would be a second answer to the same question, and the one
that goes stale is the sentence. What it keeps is the half a list cannot carry: that the name, the
picture and the address are not attached, and that nothing else about the reader is either.

What the surface adds:

- **T-3, on the surface** rather than only in a notice — the product cannot unpublish a report, and
  the sentence says a takedown is something a person who looks after the repository does.
- **What the press actually does.** The deployed page's own content security policy makes both
  posting routes unavailable (`connect-src 'self'`, `form-action 'none'`), so the button opens the
  repository's own form with the whole report already written into it and **the player posts it**.
  That is stated before the press. It also answers **§ 19 item 10** in the direction the item leans
  whichever way a reviewer decides it: the exact payload is on the reader's screen — twice, once
  here and once on the form — before anything is public.

**§ 19 item 9 is untouched by any of that and is still open**, which is the one to read twice: this
section's question is whether the pre-press warning is *sufficient*, and a lane shipping the warning
is not a lane answering it.

### 15.5 The published notice — what it must contain, not its words

Drafted as a **contents list** rather than as copy, because a notice's wording is exactly the part a
reviewer will rewrite and a draft that reads finished invites nobody to.

1. Who the controller is, and how to reach them (**§ 19 item 1** — unknown today).
2. Each item in § 13.2, in plain words, and why it is held.
3. The lawful basis for each (**§ 19 items 5 and 6** — undecided today).
4. The processors in § 14.1 fact 3, and where the data is (**§ 19 items 2 and 3**).
5. The retention table, § 16, in the player's units rather than in constants.
6. How to delete: § 16.4's three paths and § 16.7's walk-through, and what each one does and does
   not reach.
7. Rights, and how to exercise them (**§ 19 item 11**).
8. The position on children, § 17 (**§ 19 items 12–14**).
9. The date it was last changed, and what changed.

**Item 9 is the one this repository is best placed to keep honest and most likely to drop.** A notice
with no date is a notice nobody can tell has gone stale — and an undated claim going quietly out of
date is the failure this repository catches most often about its own numbers
([`CLAUDE.md`](../CLAUDE.md), and § 0's own struck-through fact 6).

---

## 16. Retention and deletion

### 16.1 The rule this section obeys

§ 12.3: one item, one row, one home. **§ 5.1 owns the seven classes in its own table** — raw events
at 90 days, daily aggregates indefinitely, the `playerId`, the consent state, `sessions` at 30 days,
`login_tokens` at 15 minutes, and accounts and board entries with no horizon — and this section does
not restate any of them. What follows is everything § 5.1 does not carry, plus the two items that
existed then and had no row.

### 16.2 What is drafted rather than derived, and how to tell

**Two of the horizons below are judgements and are marked so.** This repository has a documented
history of published numbers that did not reproduce from the code that was supposed to produce them,
and the mitigation is the same one `docs/26` § 5.1 used for its 90 days: say what the number is for,
so a reviewer can disagree with the reason rather than with the digit.

| Row | Derived or drafted | What would settle it |
|---|---|---|
| Session, sign-in link | **Derived** — they are constants: `SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000` (`store.ts:233`) and `LOGIN_TTL_MS = 15 * 60 * 1000` (`credentials.ts:82`) | Nothing. Read the constant |
| Raw telemetry events, 90 days | **Derived**, in § 5.1, from `docs/26 K4`'s 7-day window plus a build-to-build trend | Already argued there |
| Error reports (S14) | **DRAFTED** | What an incident actually needs: #242's runbook has to name a severity model and a first response, and the horizon is *long enough to work an incident and see whether the fix held*. Until that runbook exists, any figure here is a guess with a unit |
| Problem reports (S13) | **NOT DRAFTED, and deliberately** | They are public issues in this repository, so their retention **is the repository's**, and a horizon written here would be a promise this posture cannot enforce. § 16.5 says what that means |

### 16.3 The rows § 5.1 does not carry

| Item | Horizon | What deletes it |
|---|---|---|
| **S2 `display_name`** | Lives with the account | `DELETE /api/me` (§ 5.3). No separate horizon: a name with no account is not reachable |
| **S10 rate-limit key** | The limiter's own window, in memory | Process restart, and the window. Never written |
| **S11 `.outbox.jsonl`** | **No horizon, and it is never swept** | Nothing in the product. It is a file on a developer's machine and is unreachable in production (§ 5.3). Stated rather than fixed, because the erasure route makes no claim over files on a development machine |
| **D1 `elevator-sim.session`** | **Until the player clears it**, or the browser does | *Clear saved progress* on the settings screen — GitHub issue #229, `settingsScreen.ts:459`, a two-press arc whose second press calls `engineerBridge.clearSavedSession()` and then reloads. Also the browser's own site-data clear |
| **D2 `elevator-sim.everyday-profile`** | **Until the player clears it**, or the browser does | The same control, in the same press: `store.clear()` runs immediately after the bridge call. The row's `ready` string names this slot's contents exactly — *"the solved cases and the ratings, and the name and picture above"* |
| **D3 `elevator-sim:career`, `:career:refused`** | **Until the player clears it** | ***Clear saved progress*** removes both keys and seals the store, so the running session cannot write the career back (§ 16.6). Was not reached until 2026-09-09 |
| **D4 `elevator-sim.viewMode`, `.revealedTabs`** | **Until the browser's own site-data clear** | **Not reached by *Clear saved progress*, deliberately** — `dev/main.ts` calls both *disclosure, per-browser, and neither is progress*, so a control named for progress leaves them (§ 16.6) |
| **D5 the bearer token** | The tab | Held in memory only (`menu/account.ts:73`); closing the page ends it |
| **S13 problem reports** | § 16.5 | § 16.5 |
| **S14 error reports** | **DRAFTED** — see § 16.2 | The sweep-on-write-and-boot mechanism § 5.2 already runs twice, if they land in this database at all |

### 16.4 The three deletion paths, and what each one reaches

**They are three because the stores are three, and the design refuses to hold the join between them
(§ 3.2). A single button that claimed to reach all three would be claiming a join that does not
exist.**

| Path | Reaches | Does not reach | Exists today? |
|---|---|---|---|
| **`DELETE /api/me`** | The account, and by cascade `sessions`, `login_tokens`, `entries`, `challenge_entries` — the set read out of `pg_constraint` rather than out of a list (§ 5.3) | Anything on the device; anything telemetry holds | **The route: yes** (`api.ts:333`). **A screen that presses it: no** |
| **`POST /api/telemetry/forget`** | Telemetry rows for one `playerId` | The account; the device's other slots | **Yes**, since 2026-09-10 (#340) — the route, **and** a screen that presses it: the consent row on Settings, which is § 4.3's withdrawal |
| ***Clear saved progress*** | D1, D2 and **D3** | Anything on the server; D4, which is disclosure rather than progress (§ 16.6) | **Yes** (#229) |

**The first path's missing surface is the honest gap in this posture and it is not new.** § 11 has
carried it since #254 landed: a route a player cannot press is not an erasure path a player can use.
It is worse now than it was, because a posture that says *you can delete your account* while the only
way to do it is `curl` would be a stated remedy that is not reachable — the shape
[`CLAUDE.md`](../CLAUDE.md) calls a stale refusal, pointed the other way. **The mail's sentence is
pinned by `packages/server/src/mail/mailer.test.ts`, so the suite goes red on the commit that wires
the control**, which is the mechanism that stops the notice and the product drifting apart. Wiring it
belongs to whoever owns `settingsScreen.ts`. **`LAWYER` — § 19 item 15**, on whether a posture may be
published while the account path is `curl`-only.

### 16.5 Problem reports are public, and this posture cannot promise to delete them

A report becomes an issue in a public repository. The product can delete a copy it holds; it cannot
unpublish what somebody has read, and it should not imply otherwise. So:

- **T-1 carries the weight** (§ 13.4, § 15.4): the surface says the words are public **before** the
  press, in the ruling's own terms.
- **The path is the platform's**, not this product's: a player asking for a report to be taken down
  is asking a repository maintainer, and the notice says so rather than offering a button that
  cannot do it.
- **A report should not need to carry an identifier at all.** The run pointer is a seed and a
  configuration (§ 2.1) and reproduces without knowing who sent it.

**`LAWYER` — § 19 item 9.** This is the item most likely to come back changed.

### 16.6 A finding, and its fix: *Clear saved progress* reached two slots of six

**Found while writing this section on 2026-09-09; fixed the same day.** This section recorded the
defect and deliberately did not fix it, because a documentation lane rewriting a shipped promise is
how a posture starts contradicting a product. It is kept in full below rather than replaced, because
what it got right about the *shape* of the defect is what decided the fix.

**What was measured.** `everyday/settingsScreen.ts`'s handler called `bridge.clearSavedSession()` —
sealing the Engineer session and removing `elevator-sim.session` — and then `store.clear()`, which
removed `elevator-sim.everyday-profile`. That is **two** slots, against **six** the origin holds
(§ 13.2, D1–D4; keys derived by grepping the literals rather than by reading a list).

**Two of the row's four strings disagreed with each other**, and that was the precise shape of it:

- **`ready`** enumerated, and its enumeration was **exactly right** for the code — D1 and D2 and
  nothing else.
- **`cleared`** summarised, and its summary **over-stated**: *"Nothing this device kept survives."*
  Four slots survived it, one of them the career, which is progress in the plainest sense.

So it was **a summary sentence broader than the enumeration two states earlier**, not a control that
did less than it was designed to. The enumeration was written against the code; the summary against
the intention.

#### Which of the two possible fixes, and why it was not the cheaper one

The section above left the choice open and said so. It has been made, and **the deciding evidence is
a date rather than a preference**:

- The handler and its copy landed **2026-09-06**, in a commit whose own subject reads *"Clear saved
  progress clears **both slots** and seals the session"*. On that day two slots **were** every byte
  of progress the device held, and `ready` was complete.
- Career persistence landed **2026-09-07** — the next day, GitHub issue #375 — and nobody came back
  to the clear control.

So `ready`'s enumeration was **not a deliberate boundary**; it was a correct statement that went
stale when something else landed, which is the defect class `CLAUDE.md` records for published
numbers, stated mechanisms and stated refusals. Narrowing `cleared` to match it would have written
the staleness into the product's promise and called the result honest.

**So the handler was widened.** *Clear saved progress* now clears the career — both
`elevator-sim:career` and the quarantined `:career:refused`, because a refused career is still a
career this device kept — and `ready` names it. `cleared`'s *"nothing this device kept survives"* is
true as written for everything the control claims.

**D4 is left, and that is also a decision rather than an omission.** `dev/main.ts` calls
`viewMode` and `revealedTabs` *"disclosure, both per-browser, and neither is progress"*, in its own
words and before this question arose. A control named *Clear saved progress* that reset which tabs a
player had revealed would be reaching past its name. They go with the browser's own site-data clear,
and § 16.3 says so.

**The seal is the half that is easy to miss.** #229's criterion is not *removes the bytes* — it is
*"Clear saved progress works, **including preventing the running session from rewriting the store**"*.
The host holds the career in memory and saves it on the player's next action, so a `clear` that only
removed would be undone before the reload it is followed by. `CareerStore.clear()` seals first and
removes second, which is `dev/main.ts#clearSavedSession`'s own order. Two cases in
`campaign/careerPersist.test.ts` hold it, and both fail if the seal is taken out — checked by taking
it out.

### 16.7 What a player who wants everything gone actually does today, end to end

**Written as a walk-through rather than as a policy, because a deletion story that has never been
walked is a deletion story with a gap in it.** Everything below is the tree as it is on 2026-09-09.

1. **On the device.** Settings → *Clear saved progress* → press twice. Reaches D1, D2 and **D3** —
   the week, this side's own slot, and the career including a quarantined one — and seals each so
   the running session cannot write any of them back before the reload. It does **not** reach D4,
   which is disclosure rather than progress (§ 16.6). The rest of the origin goes with the browser's
   own *clear site data*, which the player does themselves and this product cannot do for them.
2. **The account.** `DELETE /api/me`, with a session bearer token, from `curl`. **There is no screen
   for it** (§ 16.4). A player who cannot use `curl` has no route at all today, and the honest
   consequence is that the deletion story is *incomplete* rather than *documented*.
3. **The board rows.** Nothing separate: they cascade off the account (§ 5.3), read out of
   `pg_constraint` rather than out of a list.
4. **Telemetry.** Nothing to delete, because nothing is collected. When it is, it is
   `POST /api/telemetry/forget` (§ 8) and the withdrawal control in Settings (§ 4.3).
5. **A problem report.** Not deletable by this product at all (§ 16.5). It is a public issue and the
   route is a maintainer's.
6. **Asking a human instead of pressing a button.** **There is nowhere to write.** No contact point
   exists anywhere in this repository (§ 14.1 fact 1), and a posture that expects a player to be able
   to ask needs one to exist first.

**Two of those six are gaps and both are on the checklist rather than hidden in prose** — step 2 as
item 15, step 6 as item 1. The reason for walking it at all is that each individual mechanism reads
fine in its own row, and only the walk shows that a player who simply wants out has one control, one
`curl` command, and no address.

---

## 17. Children

> ### `LAWYER` — this whole section
>
> **No position is taken.** What follows is the product's own facts, then the options a reviewer
> chooses between, then the thing that makes the choice bind. A non-lawyer asserting an age position
> would be the same defect as a non-lawyer choosing a lawful basis, and the product owner has ruled
> that neither is his to make either (§ 12.1, ruling 3).

### 17.1 The facts about this product a reviewer needs

Each is a claim about the tree and can be checked.

1. **It is a lift-traffic simulator.** The charter's audiences are a curious general player and a
   lift-industry professional ([`docs/23`](23-audiences-and-core-loop.md)). Nothing in `data/`, the
   art direction or the copy is aimed at children, and nothing is aimed away from them either.
2. **There is no chat, no messaging, no comment, no profile page and no way for one player to send
   anything to another.** The only thing one player sees of another is **a display name** (S2) —
   on a board, and on a posted run they can replay (`packages/viz/src/watch/posted.ts:65`,
   `:203`). A run replays from its seed and carries nothing about the person who took it.
3. **No real money is ever asked for, and that is a charter non-goal rather than a present
   absence**: no payment, no paywall, no advertising, no third-party tracker (§ 10 non-goals 1 and
   2). **Said precisely, because the game does have a shop and a price ladder**: the currency is
   *chimes*, earned by completing turns and spent on a mode's modifiers, *"nothing resetting on time,
   no purchase shipping, and the ledger built so an add from outside is invisible to the play
   surface"* ([§ D526](../DECISIONS.md), [§ D530](../DECISIONS.md)). An in-game price is not a
   transaction, and a reviewer should be told the difference rather than left to find the shop.
4. **There is no age question anywhere in the product**, and no field that could answer one.
   Verified by grep on 2026-09-09.
5. **An account requires an email address** (S1), which is the only route by which the product learns
   anything durable about a person.
6. **A player can publish typed words** (S13, #245, shipped) — to a public repository, under
   § 15.4's warning, which is now drawn on the screen rather than drafted here.
7. **`display_name` is public** (S2), and a child may type their own name into it.

Facts 6 and 7 are the two that carry the risk, and neither is telemetry's.

### 17.2 The options

| Option | What it would mean | The consequence |
|---|---|---|
| **A — Not directed at children; no age gate** | The product states it is not aimed at children and collects the same minimal set from everybody | Simplest, and it rests entirely on *not directed at* being the right characterisation, which is the reviewer's call rather than the author's. It does nothing about facts 6 and 7 |
| **B — An age self-declaration before the consent ask** | A single question; below a threshold the telemetry ask is not shown and the answer is a no | Costs nothing in playability — § 4.2 already requires the game to be whole without consent. **But the age question is itself a collection**, it is unverifiable, and it puts a gate in front of the first screen, which § 4.4 forbids the consent surface from becoming. If chosen, it needs its own row in § 13.2 and its own retention row |
| **C — A minimum age for the account only** | Anyone plays; an account needs a declared age | Confines the check to the one route that learns an address (fact 5), leaves anonymous play untouched, and still does nothing about fact 6 unless the report surface is account-gated |
| **D — No telemetry consent asked of anybody** | Removes the child-consent question by removing the consent | Kills the KPI programme (§ 6) and with it the M4 gate's evidence. On the list because a list without it is a list arguing for collection |

**A jurisdictional point the reviewer will already know and the author should not pretend to
resolve**: where consent is the lawful basis, several regimes set a digital age below which a child's
own consent is not sufficient. That interacts directly with § 14's option A, which is why these two
sections are not independent. **`LAWYER` — § 19 items 12, 13 and 14.**

### 17.3 What makes whichever option is chosen actually bind

Whatever is decided, it needs a mechanism or it is an intention (§ 5.2's rule, applied to a policy
instead of a horizon).

- Option A binds through the **notice** and through nothing else, so its wording is the whole of it.
- Options B and C bind through a **field**, which means a row in § 13.2, a retention row in § 16, a
  screen, and strings in the honesty corpus. Cheapest to specify, most expensive to build.
- Option D binds by **deletion** — the consent surface § 4 designs is not built — which is the only
  option on the list whose mechanism is the absence of one, and the only one that cannot drift.
- **None of them binds through good intentions**, and a posture that says *we do not intend children
  to use this* with no mechanism should say that it is a statement rather than a control.

---

## 18. The read route — who and what may read collected data back

Permitted by ruling 2 (§ 12.1), which lifted § 8's refusal. This section is that ruling's condition:
*who may read it and how long it is kept are part of that posture.*

### 18.1 The thing the old refusal was right about

*"A schema that acquires a read route acquires a way to look a player up."* True, and unfixable in
general. So the design is not *a read route that cannot be misused*; it is **three named readers,
each with the narrowest shape that answers its question** (§ 18.2), and an explicit list of what may
not read at all (§ 18.3).

**The ruling's condition has two halves and this section owes both.** *Who may read it* is §§ 18.2
and 18.3. *How long it is kept* is unchanged and lives where it already did — § 5.1's 90 days for
raw events and its *indefinite* for aggregates, which § 5.4 earns by requiring an aggregate to carry
no identifier, no pointer and no cell small enough to be one person. **A read route does not extend a
horizon**, and a dashboard that wanted a longer one would be asking for § 5.1 to move rather than for
§ 18 to.

### 18.2 The three readers

| # | Reader | What it may read | What bounds it |
|---|---|---|---|
| **R-1** | **The KPI dashboard** (#250, the first consumer) | **Aggregates only** — § 6's four KPIs and § 6.3's diagnostics, as dates, builds, counts and rates | § 5.4: an aggregate carries **no identifier, no run pointer, and no cell small enough to be one person**. **The minimum cell size is enforced in the route, not in the reader** — a dashboard that filters small cells is one query away from a dashboard that does not. A cell under it is **refused by name**, in the product's own idiom, exactly as a suppressed mean is |
| **R-2** | **An analyst replaying a run** | Raw rows, **offline** | Already the design in § 2.1: *"replay is an analyst-initiated, offline operation over stored pointers, never work done on ingest"*. A pointer replays to a run and never to a person; there is no name on it and no key that reaches one (§ 3.2) |
| **R-3** | **A player reading their own data** | Rows for one `playerId`, presented to the person whose device holds it | The id is 128 random bits from `crypto.getRandomValues` (§ 3.1) and is the only key. Requires: the existing `FixedWindowLimiter` on the route; **an unknown id and an id with no rows answer identically**, so the route cannot be used to test whether an id exists; and it reads and never writes |

**R-3 is drafted, not required.** Whether the product owes a player a copy of their own data, and in
what form, is a legal question. It is designed here so that the answer *yes* does not arrive later
as a surprise with no shape to put it in. **`LAWYER` — § 19 item 11.**

### 18.3 What may not read, and this list is the point of the section

1. **No per-player view for the team.** § 10 non-goal 7 is unchanged by ruling 2. The dashboard reads
   aggregates; nobody on this project gets a screen that shows one person's sessions.
2. **No route keyed on an account.** A read keyed on `users.id` would be the join § 3.2 exists to
   make impossible, arriving through the reader instead of through the writer.
3. **No behavioural cohort.** Non-goal 7's second clause: no segmentation into groups a person
   belongs to by how they played.
4. **Nothing read back to the player as a figure about themselves.** § 6.4 and non-goal 4 — no score,
   rank, streak or percentile. **R-3 is a copy of their rows, not a profile of their play**, and the
   difference is that a copy makes no claim.
5. **No third party**, in raw or aggregate form. Non-goal 6, and its one non-exception is § 10's
   added clause about a player publishing their own words.

### 18.4 Two consequences for #250

**The dashboard may not ship ahead of this posture, and it also may not ship ahead of the
instrument.** That was written when there was no telemetry at all (§ 0 fact 1, as it then stood), so
a dashboard would have been a dashboard over an empty source — which was #340's finding and not this
document's. **#340 landed on 2026-09-10 and the instrument now exists**, so the second half of that
sentence has stopped binding: the source is no longer empty. **The first half is unchanged and is
now the whole of it** — the posture is drafted and marked as requiring legal review, and
~~§ 18's read route is still unbuilt, which is #250's own work. A dashboard needs a route that does
not exist yet; what it no longer needs is an instrument.~~ — **the route was built on 2026-09-10**
(GitHub issue #250) and that clause goes with it, struck rather than deleted. **What survives the
build is the half that was never about work**: the posture is still only *drafted*, § 19's items are
still unanswered, and nothing in the code can enforce the condition that Part B is reviewed before
the consent surface is shown to anyone. So R-1 exists and reads an empty source, which is the
correct state rather than an awkward one — a dashboard built against that fact says *nobody has
consented yet*, and a dashboard built later against a populated one would never have had to.

**When it ships, it inherits § 6.4 whole**: not shown to a player, not compared across builds without
an interval and the counts it was computed over, and not read as a criterion met. A dashboard is the
surface on which a rate most easily becomes a verdict, and § 6.4's third bullet is the one that will
be under the most pressure the first time a number moves.

**And it needs a named owner, which is #250's own third criterion and is a privacy requirement as
well as a review one.** R-1 is *a* reader rather than *anyone*; a dashboard nobody owns is a dashboard
whose access nobody is deciding. **Who that is, is not named here** — this document does not staff the
project — but the posture is that the answer exists in writing before the first table is published.
**The dashboard's shape is now specified in § 20**, the owner's role in § 20.6, and the minimum cell
size § 5.4 used to defer alongside it is declared in § 20.3. **And as of 2026-09-10 the shape is
built** — `packages/server/src/telemetry/dashboard.ts`, with § 20.3's floor inside it rather than in
front of it. The name is still not here, and that is the row § 11 carries: R-1 has a role and no
holder, so *the answer exists in writing before the first table is published* is the condition it is
still waiting on rather than one this build discharged.

---

## 19. The reviewer's checklist

**Nineteen items.** Each is a question this draft could not answer, with the section it comes from
and what turns on it. It is a checklist rather than prose because the review is a decision, and a
decision needs a list.

| # | § | The question | What turns on it |
|---|---|---|---|
| **1** | 14.1 | **Who is the controller?** No legal entity, address or contact point exists anywhere in this repository | A notice cannot be written at all. Blocks § 15.5 |
| **2** | 14.1 | **Where is the data?** The deployed API is in a US Azure region; `main.bicep` leaves the region a deployment parameter | Transfer position, and what the notice says |
| **3** | 14.1 | **The processors** — Azure (compute, database, static host) and Azure Communication Services (mail). Are they correctly characterised, and is anything missing? | The notice, and whatever agreements are needed |
| **4** | 14.3 | **Does storing the six on-device slots need its own treatment**, separately from the personal-data question? | Whether the consent ask must cover the device at all, and whether a saved game is *strictly necessary* |
| **5** | 14.4 | **The lawful basis for the account** (S1–S6) | The notice; whether anything about the sign-in flow changes |
| **6** | 14.2 | **The lawful basis for telemetry** (S12) and **for error reports** (S14) — options A–D, and whether they may differ from each other | Whether § 4's consent design ships as specified, and whether #242 needs a second surface |
| **7** | 13.3, 14.4, 15.3 | **The public display name.** A player may type their real name into a field every stranger can read. Is § 15.3's one line enough? | A shipped surface gains a sentence, or more than a sentence |
| **8** | 15.2 | **The withdrawal sentence.** Is *"deleted when it ages out"* an adequate account of the half that can fail? | The consent surface's copy |
| **9** | 15.4, 16.5 | **Problem reports are published to a public repository** and cannot be unpublished. Is the pre-press warning sufficient, and is *the path is the platform's* an acceptable answer on deletion? | Whether #245 ships in the ruled shape |
| **10** | 15.4 | **The automatic attachment** on a problem report — seed, configuration, build, browser. Must the player see the exact payload before sending, rather than a description of it? | #245's surface |
| **11** | 18.2 | **Does the product owe a player a copy of their own data**, and in what form? R-3 is designed and not required | Whether R-3 is built, and whether the account side needs an equivalent |
| **12** | 17.2 | **Which of options A–D on children**, and is *not directed at children* the right characterisation of a lift simulator? | Everything downstream in § 17.3 |
| **13** | 17.2 | **If consent is the basis, what happens below a jurisdiction's digital age?** § 14 and § 17 are not independent | Whether an age field exists at all |
| **14** | 17.1 | **Facts 6 and 7** — a child publishing typed words, and a child's name on a public board. Do they need handling that the telemetry position does not reach? | #245's surface, and S2's |
| **15** | 16.4 | **May this posture be published while account deletion is `curl`-only?** The route exists; no screen presses it | Whether a viz lane is a blocker for the notice |
| **16** | 16.6 | **Resolved 2026-09-09 — the control was fixed rather than the notice narrowed.** *Clear saved progress* now reaches D1, D2 and D3 and seals each, so `cleared`'s *"nothing this device kept survives"* holds for everything it claims. What is left for a reviewer is narrower: **D4 (`viewMode`, `revealedTabs`) survives it deliberately**, so a notice saying *everything* would still over-state. Does the notice have to enumerate, or is *your saved progress* enough? | Whether the notice may say *progress* and leave interface state unsaid |
| **17** | 5.1, 5.3 | **Accounts and board entries have no retention horizon** — *"an account nobody deletes is kept"*. Is a stated policy an acceptable answer where a period is expected? | Issue #202's AC2, and whether a horizon has to be invented |
| **18** | 16.2 | **The error-report horizon is drafted and blank.** #242's runbook has to exist before a number here means anything | Whether #242 can ship before its runbook |
| **19** | — | **Is anything in § 13.2 special-category?** The author's reading is no — no health, biometric, political or similar field exists — but the reading is a non-lawyer's | Whether a whole additional regime applies |

**Two things that are deliberately not on this list.** The **minimum aggregate cell size** (§ 5.4)
was a statistical judgement this project could make for itself, and it has: **§ 20.3 declares it.**
Nothing about that decision is characterised here — not the figure, not how many grounds it rests on,
not what they cover — because this line has gone stale three times doing exactly that, and a summary
that restates is a summary that will. The **90-day event horizon** is derived in § 5.1 from `docs/26 K4`'s window; a reviewer
may of course move it, but it is not a question the product is asking.

---

## 20. The KPI dashboard — the shape § 18.2 promised for R-1

**Numbered after § 19 rather than beside § 18, deliberately.** This section extends the read route
and belongs next to it by subject; putting it there would have moved § 19, and every ordinal in this
repository is a name rather than a position ([`CLAUDE.md`](../CLAUDE.md), on the dead-seam count).
A reader arriving from § 18.2 is sent here by name and loses nothing; a reader holding a citation to
§ 19 would have lost it.

### 20.1 What this is, and the two things it is not

It is the specification GitHub issue #201's fifth criterion asks for, made possible by ruling 2
(§ 12.1) and bounded by § 18. **It is not an instrument**, and until 2026-09-10 there was no telemetry in this tree at all (§ 0
fact 1, re-measured § 13.1), so every panel below reads an empty source today, and § 18.4's sentence
governs — the dashboard may not ship ahead of this posture and may not ship ahead of the thing it
reads. **It is not a second definition of anything.** Every KPI here is § 6.2's, every diagnostic is
§ 6.3's, every horizon is § 5.1's. A figure defined twice is `docs/26 P-5`'s failure, and the first
time the two disagreed nobody would know which one the review had read.

**Built on 2026-09-10** (GitHub issue #250), and this section is still the specification rather than
a description of the code. The route is `packages/server/src/telemetry/dashboard.ts`, the reader is
`dashboardRender.ts`, and an analyst reaches it with
`ELEVATOR_SIM_DB=… npm run dashboard --workspace @elevator-sim/server` — an offline, analyst-initiated
read, on the footing § 2.1 already puts run replay on. **There is deliberately no HTTP route**:
§ 18.2 grants R-1 aggregates and does not grant a URL, and serving these figures over one would
settle *who holds access* — which is § 20.6's question and is still open. `dashboardSpec.test.ts`
derives the panel set from § 6.2 and § 6.3, the targets from
[`docs/22-charter.md`](22-charter.md) § 4 and the floor from § 20.3, so the code cannot hold a second
copy of any of them; a fifth KPI here with no panel there is red, and a panel there for a KPI § 6
does not define is red.

**Three of the eight panels draw nothing today, and each says so by name rather than by drawing an
empty chart.** P1, because `docs/26 K1`'s threshold-and-dwell constant does not exist (§ 11); P2 and
P5, because `docs/26 K2`'s chain carries a beat nothing emits (§ 20.2, § 11). **None of the three
refusals is written into a panel** — each is computed from a constant the test holds against the
document or the register that owns it, in both directions, so a refusal cannot outlive its cause and
a cause cannot arrive without the refusal. That is § D227 mechanised, and it is the half of the
stale-sentence rule this project calls the more dangerous one: a dead seam merely does nothing, while
a stale refusal tells a reader not to look at a panel that works. A refused panel still draws its
target, its baseline and its grain, because a panel that hid those while refusing would answer one of
#250's criteria by failing another.

### 20.2 The panels

Eight, and the set is not free: § 18.2 grants R-1 *"§ 6's four KPIs and § 6.3's diagnostics"*, so the
panels are exactly those eight and a ninth needs § 18.2 to move first. Targets are the charter's, not
this document's. Every baseline is refused today and § 20.4 says why.

| # | Reads | Target | Baseline | Refused when | Grain |
|---|---|---|---|---|---|
| **P1** | `docs/26 K1` — reach, and time, to visible trouble | `charter S1` — median ≤ **90 s**, on a reach share high enough that the median is not survivorship (§ 6.2) | `unmeasured` — § 20.4 | either figure's cell is under § 20.3's floor; or the threshold and dwell constant does not yet exist (§ 11) | build × UTC month |
| **P2** | `docs/26 K2` — first-session loop completion | `charter S2` — **60 %** of first sessions complete the five-beat chain | `unmeasured` — § 20.4 | the cell is under § 20.3's floor; **or the chain cannot close** — a beat of it has no shipped emitter (§ 11), so a completion share over it can only read 0 % | build × UTC month |
| **P3** | `docs/26 K3` — first-session length | `charter S3` — median **≥ 10 minutes** | `unmeasured` — § 20.4 | the cell is under § 20.3's floor | build × UTC month |
| **P4** | `docs/26 K4` — day-one to seven-day return | `charter S4` — **25 %** of a day's cohort returns within 7 days | `unmeasured` — § 20.4 | the cohort is under § 20.3's floor, **or** the window has not closed — no cohort is drawn before *D*+8 (§ 6.2) | first-seen UTC day × build |
| **P5** | Beat-drop profile | none — a diagnostic has no target (§ 6.1) | not applicable | any beat × screen cell under the floor, **and § 20.3's complement rule**; or the chain cannot close, as P2 — this panel's base is exactly the sessions P2 cannot count (§ 11) | build × UTC month × beat × screen key |
| **P6** | Refusal encounters | none | not applicable | any ground's cell under the floor | build × UTC month × refusal ground |
| **P7** | Field cold load | none. **It may refute the CI budget's representativeness and can never satisfy `charter S9`** (§ 6.3) | not applicable | the cell is under the floor | build × UTC month |
| **P8** | Screen reach | none. Not a `charter S10` instrument — that is [`TEST_MATRIX.md`](../TEST_MATRIX.md)'s journey rows | not applicable | any screen's cell under the floor | build × UTC month × screen key |

**Four of the eight carry no target and that is the point of the column.** § 6.1 draws the line: a
KPI is a figure the team steers by and may be a gate; a diagnostic explains why a KPI moved and may
**not** be. A target column on P5–P8 would turn four explanations into four gates, which is the
single most likely way this dashboard does damage.

**Every panel is a rate or a median over a cell, and every cell carries its count and an interval.**
That is § 6.4's second bullet, and it is the reason § 20.3's floor does not have to do statistical
work as well as disclosure work.

**P2's and P5's second refusal ground was added on 2026-09-10 by GitHub issue #250, and the reason
it was missing is worth more than the ground itself.** This table was written on 2026-09-09, the day
*before* #340 landed the instrument — so it could not know that the shipped emitter would leave beat
4 of `docs/26 K2` unemitted (`rerun_same_crowd`, registered with what blocks it in
`packages/viz/src/telemetry/schema.ts#UNEMITTED_EVENTS`). A chain carrying an event nothing emits
**cannot close**, so P2's completion share can only read **0 %** — and it would read it directly
under `charter S2`'s 60 % target, where it looks like a product failing its criterion rather than an
instrument with a hole in it. #250's own issue thread predicted exactly that before any of this was
built: *"a dashboard drawing K2 as a funnel would show a flat zero and look like a bug"*, and
[`docs/22-charter.md`](22-charter.md)'s S2 cell had already been corrected to **Partly — the chain
cannot close today** for the same reason. Every other place in the tree knew; this table was the
last one that did not. **The chain is not re-defined over the beats that do emit** — § 6.2 owns K2,
and a second definition in a dashboard is P-5's own failure — so both panels are refused whole,
derived from the register rather than from a sentence, and they start drawing on the commit that
wires the emitter.

**This paragraph and `dashboard.ts`'s own docstring are the record, under
[§ D405](../DECISIONS.md).** The decision reaches no further than the section it corrects and the
module that implements it: it binds no other package's code, moves no `DECISIONS.md` entry, and
changes no charter row — `docs/22-charter.md`'s S2 cell already said *Partly — the chain cannot close
today* before this was written, which is what made the omission visible rather than arguable.

### 20.3 The minimum cell size

**The minimum cell size is 20 people.** § 5.4 and § 11 both recorded this as owed before the first
table was published; this is the declaration, and both stop registering it on this commit.

**Ground 1 — disclosure.** § 5.4's rule is *no cell small enough to be one person*. The conventional
floor for tabular disclosure control over people is 5. This is four times it, because the
conventional 5 assumes a table published **once**, by an office with legal and procedural controls
around the release; this one is re-drawn every month over an overlapping population by a small team
with neither.

**Ground 2 — differencing, which a floor does not fix.** A floor on each cell does not stop anyone
subtracting two overlapping windows to recover the difference between them, and no choice of integer
would. What answers it is the **grain column above**: cells are computed over fixed, pre-declared,
non-overlapping calendar windows, and **the dashboard offers no arbitrary date range**. A date
picker is the one feature that would defeat the floor while looking like a convenience, which is why
it is named in § 20.7 rather than left to be noticed.

**Why not 50, which is the integer already lying around.** [`CLAUDE.md`](../CLAUDE.md) budgets 50–200
*replications* per configuration. That budget is about a simulation run under common random numbers,
and § 6.4 already records that the paired-CRN discipline does not transfer to people — you cannot
feed the same person to two builds. Borrowing its integer would be the same false transfer wearing a
different hat, and a number is easier to borrow than a method, which is what makes it worth refusing
in writing.

**Ground 3 — the complement, which is the one a per-cell floor is blindest to.** A floor applied cell
by cell does not stop a refused cell being *recovered by subtraction*, and this panel set contains
exactly that path. § 20.2 requires every cell to carry its count, so **P2** publishes the number of
first sessions that did not complete the chain for a build and a month; **P5** partitions those same
sessions by beat and screen. Refuse one P5 cell for holding three people and its value is the P2
total less the P5 cells still published — no overlapping window involved, and the floor satisfied at
every step. **A floor on a cell is not a floor on what the table implies.**

So the floor is applied to the **partition**, not to the cell:

1. When any cell in a partition is refused, **at least one further cell in that partition is refused**
   — chosen so that no refused value can be recovered from the published cells and any total this
   dashboard publishes over the same base.
2. **If fewer than two cells can be refused, the whole partition is refused.** A partition with one
   publishable cell publishes nothing.
3. **Every refusal inside a partition reads identically**, and a complement cell does *not* say it
   is a complement. An earlier draft of this rule had it the other way round — labelling the two
   causes differently, on the reasoning that a reader who cannot tell them apart cannot tell a quiet
   month from a suppressed one. That reasoning is right about legibility and **wrong about
   disclosure**, which is the direction that binds: a cell announcing itself as a complement
   announces that it is *not* under the floor, and the bound on the cell it was suppressed to
   protect tightens by whatever that cell actually holds. Take A = 3, B = 22, C = 100, D = 150 over
   a published total of 275. Suppress A and B and label both *too small*, and each is known only to
   be at most 19 while the pair sums to 25 — which puts A in [6, 19]. Label B *a complement* and B
   is known to be **at least** 20 instead, so B lies in [20, 24] and A in [1, 5]. The label does not
   merely narrow the bound, it moves it to a **disjoint** range: honest labelling says A is at least
   six, and the complement label says A is at most five, which is the only one of the two that
   contains A's true value of three. **The
   cost is stated rather than hidden**: at cell level a reader cannot tell a quiet month from a
   suppressed one, and the partition — not the cell — is where the refusal is explained.

This is standard complementary suppression and it is written down because the draft of this section
that lacked it *looked complete*: it named a differencing exposure, answered the window species, and
left the within-table species unmentioned. It was caught in review rather than in use.

**What the floor counts is distinct `playerId`s, never events.** P6 and P8 count encounters — a
refusal drawn, a screen reached — and one person can produce twenty of either in one session. So a
cell on those panels is measured against the number of distinct players behind it, and the event
count it publishes is not what clears the floor. A floor stated in people and applied to events
would be a floor of one person twenty times over, which is the disclosure it exists to prevent
wearing the arithmetic of the thing that prevents it.

**The floor is enforced in the route and not in the reader** (§ 18.2, R-1's bound). A cell under it is
**refused by name**, in the product's own idiom — it says it is too small, exactly as a suppressed
mean does — rather than being dropped, rounded, or quietly merged into its neighbour. A dashboard
that filters small cells in the client is one query away from a dashboard that does not.

*As built (2026-09-10), that is structural rather than disciplined.* A refused cell in
`packages/server/src/telemetry/dashboard.ts` is an object with an axis map and a sentence and **no
numeric field at all** — no value, no interval, no count. The renderer is not trusted with the
number; it is never handed one, so there is no client-side filter to write. The same file's option
type carries a single member, so the fixed window this section's second ground rests on is not a
convention a caller can widen.

**What the floor is not for.** It is not a precision bar. A cell of exactly 20 clears disclosure and
is still far too small to steer by: a share over 20 has a 95 % half-width of up to ±0.220, so an
observed 60 % is an interval running from 38 % to 82 % — it does not separate a month that clears
`docs/26 K2` from one that misses it by twenty points. Precision is answered where it already was —
by drawing the interval and the count beside the figure (§ 6.4) — and a reader who sees an interval
that wide has been told the truth rather than protected from it.

*An earlier draft of this paragraph said ±0.22 was "wider than the distance between any two of the
charter's four targets", and that was **false**: `charter S2` at 60 % and `charter S4` at 25 % are
the only two share-valued targets and they are 0.35 apart, which is wider rather than narrower. No
other pair has a distance at all — `charter S1` is 90 s and `charter S3` is ten minutes, so the
remaining pairs put a share beside a duration or a duration beside a duration on a different clock,
and neither comparison has a common scale to be measured on. The conclusion held and the sentence supporting it did not, which is this document's own lesson
about a stated mechanism arriving in the section that exists to state one. The half-width is now
re-derived from the floor by `telemetryDashboard.test.ts` rather than transcribed.*

### 20.4 The baselines, and why all four are refused

**Every KPI baseline reads `unmeasured` today**, and the reason moved on 2026-09-10 without the
reading changing. It was § 0 fact 1 — there was no telemetry at all — and it is now § 4.2 and the
absence of a cohort: the instrument exists, it collects only from players who have said yes, and
nobody has recruited or measured anyone, so no KPI has ever been computed. A number here would be
invented. The cell says `unmeasured` rather
than sitting blank on the same principle the rest of this document applies to a refused figure — a
refusal states itself.

**The protocol, so that the first number is not argued about after it exists.**

1. A KPI's baseline is its value over the **first complete** window after ingest begins. A window
   that began before the first event was received is not complete and is not a baseline.
2. `docs/26 K4`'s baseline is the first cohort drawn no earlier than *D*+8 (§ 6.2), for the same
   reason: a partial window is not a smaller measurement, it is a different one.
3. A baseline is published **once**, with the counts it was computed over, and is not re-based when
   the product changes. If a change makes the old baseline meaningless, a second baseline is
   published **beside** it with its date and the reason, and the first is not deleted — § 0's rule
   about tables whose rows are silently rewritten is what makes a baseline datable at all.
4. **A baseline is not a target and not a gate.** The targets are the charter's four. A KPI above its
   own baseline and below `charter S1`–`S4` has moved and has not passed, and § 6.4's third bullet
   is the sentence that will be under pressure the first time that happens.

### 20.5 The review — monthly, with an agenda and a written output

**Monthly**, which is #250's own word for it, beginning in the month after the first complete window.
Between reviews the dashboard is a source; at the review it is the input to one decision.

**The agenda is four items and the fourth is the point of the other three.**

1. Each panel against its target, read with its interval and its counts.
2. The refused cells — which panels went unpublished this month, and whether the reason was the floor
   (§ 20.3), a window that had not closed, or a constant that still does not exist (§ 11).
3. What changed in the product that could explain a move, taken from the `buildId` on each panel
   rather than from memory.
4. **One decision: what changes, or explicitly nothing.** #250 states the job — *"to check the
   success criteria and to decide what changes, not to admire the graphs"* — and *nothing changes*
   is a legitimate output that has to be said out loud, because a review with no null outcome is a
   review that will invent a finding.

**The output is written, dated, and names the figures it read** — a note in this repository, not a
screenshot. A screenshot of a dashboard is a measurement with no deriver, which is `RISKS.md` R38
arriving through the review instead of through the prose.

**A criterion that is met is raised, never weakened** (#250's fourth criterion). That is
[`CLAUDE.md`](../CLAUDE.md)'s working agreement and [`docs/22-charter.md`](22-charter.md) § 4's rule.
**Read with § 6.4's third bullet it needs one clause, or the two contradict each other**: this
review may not declare `charter S1`–`charter S4` met, because they are met on a recruited cohort at
the M4 gate and not on organic traffic. So the raise duty is discharged by **recording a candidate
raise and referring it** — a panel that clears its target on organic traffic in three consecutive
months is minuted as clearing it, and the raise is made where the criterion is decided. The
prohibition needs no such clause and has none: **a target is never moved down**, at this review or
anywhere else, whatever the month looks like.

**And since 2026-09-10 the prohibition is a test rather than a sentence.**
`packages/server/src/telemetry/dashboardSpec.test.ts` derives every target from
[`docs/22-charter.md`](22-charter.md) § 4 — so the dashboard cannot hold a second copy of one — and
holds each against a watermark in the criterion's **own direction**: `charter S1` is a ceiling, so a
raise is a smaller number, and `charter S2` is a floor, so a raise is a larger one. A target that
moves towards being easier to meet is red. It is a ratchet rather than a pin for the reason
`documentation.test.ts` gives about its own: a pin goes red on the commit that *raises* a criterion,
which is the commit this rule exists to reward, and a gate that fails when its subject improves
teaches exactly one lesson — delete the gate.

**What the review may not turn into.** Not a conversation about a person — § 18.3 item 1 is not
suspended because eight people are in a room. Not a verdict on `charter S1`–`S4`, which are met on a
recruited cohort at the M4 gate and not on organic traffic (§ 6.4).

### 20.6 The owner

**The role, and what it decides.** One named person owns R-1: who holds access to it, whether a panel
is added or removed (which requires § 18.2 to move first), whether a refused cell may be published
in some other aggregate form, and the signature on each month's written output.

**Access may not be delegated.** Everything else in the list may be.

**The holder is not named here, and the reason is not shyness.** This document does not staff the
project (§ 18.4). What it can require, and does: **the name is written into this section before the
first table is published**, and until it is, that is an unmet condition rather than an oversight —
**registered in § 11**, where the rest of this document's engineering debt lives. § 18.4 states why
this is a privacy requirement and not merely a review one: R-1 is *a* reader rather than *anyone*,
and a dashboard nobody owns is a dashboard whose access nobody is deciding.

### 20.7 What the dashboard may not become

It inherits § 6.4 and § 18.3 whole. Four consequences are worth stating in this section's own terms,
because each is a feature somebody will ask for and three of them are one afternoon's work:

1. **No arbitrary date range.** § 20.3 ground 2 — the fixed window is what the floor rests on.
2. **No drill-through from a cell to the rows behind it.** That reader is R-2, it is offline, and it
   reads pointers rather than people (§ 18.2). A link from a dashboard cell to a row is R-1
   acquiring R-2's licence without anyone deciding to grant it.
3. **No cohort a person belongs to by how they played** — § 18.3 item 3, and it is the one most
   likely to be proposed as an insight rather than as a read route.
4. **Nothing on it is ever shown to a player** — § 6.4's first bullet and § 10 non-goal 4.

---

## Sources

- [`docs/22-charter.md`](22-charter.md) — adopted at [§ D342](../DECISIONS.md). § 4's ten criteria
  and their instruments, § 5's non-goals, and the rule that a criterion is raised rather than
  weakened. The four criteria this document instruments are `charter S1`–`charter S4`.
- [`docs/23-audiences-and-core-loop.md`](23-audiences-and-core-loop.md) — the five beats § 7.2's
  funnel is built from (§ 3.2), the restatement rule § 4.1 uses (§ 1.4), and the `docs/23 A1`–`docs/23 A4`
  and `docs/23 B1`–`docs/23 B4` conditions written to be **playtest-checkable without telemetry**, which is why
  this schema does not duplicate them.
- [`docs/16-static-site-deployment.md`](16-static-site-deployment.md) — the CDN/Container App split,
  the API-origin tag, the CSP, the cold start, and the cost model. Binding on § 8.
- [`CLAUDE.md`](../CLAUDE.md) — invariant 2 (no global RNG), invariant 3 (no wall clock in `core/`),
  invariant 5 (every persisted run record carries its seed — § 2.1's whole basis), invariant 6, and
  § *Statistical discipline*, whose failure mode § 6.4 inherits.
- [`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) — M1's character clause (specification only),
  M1's exit criterion that #202 lands before any telemetry ships, and M4's cohort gate.
- [`RISKS.md`](../RISKS.md) — **R31**, *no player is measured*: the risk this document's instrument
  exists to retire, and the source of the rule that until then every claim is recorded as
  unevaluated. **R32**, the competitive layer judged by a round trip rather than by either end.
- `packages/server/src/` — the existing account model. `leaderboard/submission.ts` supplies
  `SubmittedRun` (§ 2.1) and `leaderboard/boardKey.ts` supplies `runDataHashOf`; `store/store.ts` supplies `SESSION_TTL_MS`,
  `LOGIN_TTL_MS`, the cascade, and the sweep-on-write mechanism § 5.2 reuses;
  `accounts/credentials.ts` supplies the cold-start measurement; `http/api.ts` and `http/serve.ts`
  supply the in-memory rate-limit key and `MAX_BODY_BYTES`.
- [§ D106](../DECISIONS.md) — energy is an axis, never a score. The footing on which § 3.1's biases
  are published beside the figures they bias.
- [§ D214](../DECISIONS.md) — the board identity and the `configHash`; sessions as a table because
  *revocation is a `DELETE`*.
- [§ D219](../DECISIONS.md) and [§ D227](../DECISIONS.md) — both polarities of the dead-seam rule,
  which § 7.6's first test applies to events.
- [§ D241](../DECISIONS.md) — the emailed sign-in link, and the account created when a link is asked
  for. The identity model § 3.2 declines to extend.
- [§ D242](../DECISIONS.md) — the two rate-limit budgets and the fail-closed bound § 7.1 borrows.
- [§ D243](../DECISIONS.md) — the API-origin tag, and what a viewer that cannot find its own server
  does.
- [§ D299](../DECISIONS.md) — two products, one engine. Telemetry is measured over one product with
  two registers, and `mode` is not an axis this schema splits a KPI on.
- [§ D343](../DECISIONS.md) — a numbered series carries its document, which is why every criterion
  above reads `charter S…` and this document's own series is cited as `docs/26 K…`.

### Part B's own sources

- **The four owner rulings of 2026-09-09**, on GitHub issues **#242**, **#245**, **#250** and
  **#202**, quoted in § 12.1. They are the whole authority for Part B, and they are quoted rather
  than paraphrased for the reason [§ D256](../DECISIONS.md) gives about plausible sentences standing
  in for measured ones.
- [§ D405](../DECISIONS.md) — **why Part B takes no `DECISIONS.md` number.** Decision numbers are
  allocated to a lane before it starts and this lane holds no block; a number taken from outside one
  is the collision § D404 was written to stop. § D405's own test is whether the decision reaches past
  the module that took it, and Part B's substance is either a ruling somebody else made (§ 12.1) or a
  question explicitly left to a legal reviewer (§ 19) — neither of which is this lane's decision to
  record. **Part B is itself the record**, and the three corrections it makes to Part A each carry
  the ruling that caused them where the rule stands.
- [`docs/30-playtest-programme.md`](30-playtest-programme.md) § 9 — the **second** consent, and the
  one place in this repository that quoted `docs/26 P-4` in full. Corrected on the same commit as the
  rewrite, and its § 9.1 remains the statement of how a playtest's data handling parallels this
  posture rather than extending it.
- `packages/server/src/store/store.ts` — the whole of what this product persists, in one `SCHEMA`
  constant, which is what makes § 13.2's server half checkable rather than remembered.
  `packages/server/src/http/api.ts#displayNameIssues` is S2's bound;
  `packages/server/src/mail/acsMailer.ts` is § 14.1's named mail processor.
- `packages/viz/src/persist/types.ts`, `everyday/profile.ts`, `everyday/settingsScreen.ts` and
  `everyday/settingsView.ts` — the on-device half of § 13.2, and the control § 16.6 measures.
