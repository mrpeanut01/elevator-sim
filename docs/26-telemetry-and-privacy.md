# 26 — Telemetry and privacy

**Status: M1 pre-production specification. Written 2026-08-24 on the charter programme branch,
against issues #201 (the telemetry schema and the player KPI set) and #202 (privacy, consent and
data retention).** Specification only — nothing here changes a `.ts` file, a `data/*.json` file or a
shipped string, and **this document does not create a telemetry module.** A specification that
ships a module is a production issue wearing a specification's clothes, and M1's own character
clause ([`CHARTER_PROGRAMME.md`](../CHARTER_PROGRAMME.md) § M1) refuses it.

**A decision number is owed** for the posture in § 1. It is allocated at integration, never inside a
lane, and this document carries no `§ D` citation of itself until that entry exists.

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
| 1 | **There is no telemetry or analytics code anywhere in this tree** | `grep -ril telemetry packages/*/src --include='*.ts'` and the same for `analytics` | was **0 files** each; `telemetry` is now **2 files / 6 lines**, every one of them prose — see the note below |
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

**Fact 6 was the one that was wrong, and it is the one that has since moved.** It is struck through
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
> **P-4 — No free text, ever.** Every field is a number, a boolean, or a member of a vocabulary
> derived from the product. A player-authored string — a building name, a dispatcher name, a display
> name — can contain anything, including somebody else's personal data, and there is no field in
> this schema it can reach.
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

**Not a legal opinion, and not a privacy notice.** It states a posture and the mechanisms that
implement it. Whether consent is the correct lawful basis in a given jurisdiction, what a published
notice must say, and whether the product needs an age statement are questions for the product owner;
they are listed in § 11 as open, and they are human decisions rather than lane decisions.

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
`demandTemplateId`, `arrivalRatePctPop5min`, `durationS`, `windowStartS`, `seed` — together with the
`ResolvedDataFacts` digests that `configHashOf` folds in, so a `data/` change starts a new
population rather than corrupting an old one ([§ D214](../DECISIONS.md) § 4). Telemetry reuses that
type unchanged. Two pointer shapes would be two answers to *what is a run*, and the first time they
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
| **Any player-authored string** | P-4. Names of saved buildings, dispatchers, patterns and display names are free text |
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
exists not to hold. There is no telemetry endpoint to be the second request, because there is no
telemetry (§ 0, fact 1). When there is one, it is a second route.

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
person.** A KPI table row is a date, a build, a count and a rate. A minimum cell size is declared
before the first table is published and a row under it is refused rather than published — and it is
refused *by name*, in the product's own idiom: a cell that is too small says so, exactly as a
suppressed mean does, rather than disappearing.

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

**No field in this schema has an unbounded string type** except `buildId` and the two random ids.
That is P-4 expressed as a type rather than as a rule, and § 7.6's third test asserts it.

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
`POST /api/telemetry/forget` beside it, taking a `playerId` and nothing else. **Two routes, and no
third** — a schema that acquires a read route acquires a way to look a player up.

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

1. **No monetisation of any kind, and no event that exists to support one.** No purchase, no price,
   no paywall, no store, no conversion event, no lifetime-value figure.
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

- **A decision number is owed** for § 1's posture, and is allocated at integration.
- **The lawful basis, the published privacy notice, and whether an age statement is needed** are
  human decisions and are not taken here (§ 1.3). No data class in § 7 is special-category, and the
  product's one existing moderation surface — a player-chosen display name on a board — is
  already governed where it lives.
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
- **The minimum aggregate cell size** (§ 5.4) is declared before the first KPI table is published,
  not here.
- **The recruited cohort itself** — how it is recruited, what it is told, and what it consents to —
  is the playtest programme's (#205), and a recruited cohort's consent is a different conversation
  from an anonymous player's.
- **Nothing in this document has been built, and no part of it may be reported as an instrument that
  exists.** Until the code lands, every `charter S1`–`charter S4` claim stays recorded as
  **unevaluated**, exactly as `RISKS.md` R31 requires.

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
  `SubmittedRun` and `configHashOf` (§ 2.1); `store/store.ts` supplies `SESSION_TTL_MS`,
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
