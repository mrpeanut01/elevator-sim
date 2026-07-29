# Wave 8 — Phase 9, the experience layer: a game that cannot lie

**Opened:** 2026-07-28 · **Branch:** `integration` · **Governing contract:**
[`docs/10-experience-layer-contract.md`](docs/10-experience-layer-contract.md) · **Creative input:**
the owner's *Gamifying elevator-sim* directions document

## 0. What is binding, and what is creative

Two documents feed this wave and they do **not** have equal standing.

- [`docs/10`](docs/10-experience-layer-contract.md) is **binding**. Its **R1–R13** are the rules that
  keep a gamified surface honest, its **W1–W8** are the engineering units, and its **§ 5.2** already
  specifies the scenario schema and the goal table. It is a contract, not a suggestion.
- The owner's directions document is **creative input** — five design directions and a recommended
  composition. It explicitly agrees that `docs/10` is binding, and it is right to.

Where they differ, `docs/10` wins. Where the directions document adds colour that `docs/10` does not
forbid, take it.

### One correction to the creative input, carried here so it is not re-imported

The directions document states the tunable surface as **"99 declared parameter rows … narrowing to
49 dimensions."** Those are the **pre-§ D146** numbers. [§ D146](DECISIONS.md) moved the space to
**56 dimensions / 106 declared rows** when `selection` was added to `PROFILE_OBJECT_SECTIONS`, and
**T54 of wave 7 is changing how that list is derived at all** — from a hand-written array to a
derivation off `dispatcherProfileSchema`'s own shape.

**The consequence is a design rule, not a footnote: no Phase 9 surface may hard-code a dimension
count, a section list, or a parameter list.** Every one of them is derived from the discovered
schema at runtime, or it is wrong the next time the schema moves. This is the same property W4
already proved against a *fictional* schema the product does not ship, and it is why that test
exists.

## 1. The composition

The directions document's recommended layering is adopted, mapped onto `docs/10`'s units:

| Layer | Direction | `docs/10` unit |
|---|---|---|
| Visual substrate — building cross-section, per-floor queues, offered-vs-carried bars | **D1 "The Belt Never Lies"** | **U4 / W6**, plus § 3.5's ratio bars |
| Emotional skin — rider mood from wait-age bands, building mood gauge | **D4 "Mood Ring City"** | **U4 / W6** rendering treatment |
| Progression — seeded scenarios, goal sets, batch verdicts | **D2 "Prove It"** | **U3 / W3 + scenario schema § 5.2** |
| One stage inside the campaign — the credential lens puzzle | **D5 "Access Control Heist"** | **U8 / W7** |
| Meta-layer — schema-derived gadget unlocks | **D3 "The Odometer"** | built on **W4** (landed) |

**D1 + D4 are the default view everyone sees. D2 is the spine. D5 is one stage of it. D3 is
optional and lands last**, because the directions document is right that collecting gadgets without
consequences is *"a spreadsheet with stickers."*

## 2. The constraint that will actually bite

Not the rendering. **R12**, and `docs/10` § 5.2 already measured why.

Of the seven goal kinds in the contract's own table, measured on Secure Tower — this campaign's own
stage 5 — across seeds 1000–1019 (**M18**):

| goal | pass rate | what it actually is |
|---|---|---|
| `deliver-everyone` | **0/20** | a constant — the player cannot move it |
| `nobody-abandoned` | **20/20** | a constant |
| `answer-the-demand` | **0/20** | a constant |
| `long-waits-under` | **11/20** | a **coin flip**, whose rate is set by the author's threshold rather than by play |
| `everyone-can-get-there` | — | **not checkable at all today**; blocked on W7 |

So **five of seven** single-run goals in the shipped contract do not survive R12 as written. A
campaign built on them would be a campaign whose levels are won or lost before the player touches a
dial.

**Therefore: no goal ships in this wave without its across-seed pass rate measured on its own
scenario and published in the scenario file.** Anything strictly between 0 and 1 becomes a **batch**
goal. This is a measurement lane (W9 below), and it gates the campaign — not the other way round.

## 3. Fail states — the four that already exist

Per R4, and adopted verbatim rather than invented: **Overwhelmed**, **Abandoned**, **Stranded**,
**Locked out**. The directions document's instinct here is right and worth restating: *saturation is
a better fail state than an invented score threshold, because it is a real, diagnosable, fixable
property of the building.* Each fail state gets a plain sentence, a one-line diagnosis naming the
floor or credential, and a **suggested lever** drawn from the scenario's own editable dimensions —
a hint, never an automatic fix, and never *"the right answer"*, because there is a Pareto front here
and not an optimum (R11).

## 4. The task tree

| ID | Unit | Depends on | Isolation |
|---|---|---|---|
| **T60** | **W2** — widen `VizSummary` to what U5/U3 need, **one field, one renderer, same commit**; `VIZ_SCHEMA_VERSION` → 5 | — (blocks most) | worktree |
| **T61** | **W6/U4** — per-floor rider queues, glyph→bar degradation, wait-age bands **distinguishable by shape not colour alone**, rider + building mood (D1 + D4) | T60 | worktree |
| **T62** | **W3** — replication batch runner in a worker, with progress; main thread never blocks | T60 | worktree |
| **T63** | **W7/U8** — `VizLeg.credentialGroup`, the credential lens (reachable / not served / not permitted), and the **pre-run compatibility warning** that ten of twelve profiles cannot read credentials (D5) | T60 | worktree |
| **T64** | **W9 (new)** — measure every candidate goal's across-seed pass rate; publish it; demote anything strictly between 0 and 1 to a batch goal | T62 | worktree |
| **T65** | Scenario schema + campaign, seven stages (D2), goals **only** from T64's measured set | T62, T64 | worktree |
| **T66** | **D3** gadget-unlock meta-layer, entirely schema-derived | T61, W4 | worktree |

T60 is the foundation and blocks nearly everything, so it goes first and alone.

## 5. Merge order and gates

1. `feat/t60-vizsummary` → `integration`
2. `feat/t61-queues-mood` and `feat/t62-batch-runner` in parallel
3. `feat/t63-credentials`
4. `feat/t64-goal-rates` → then `feat/t65-campaign`
5. `feat/t66-gadgets` last, and droppable without harming the product

Full suite after every merge. No lane merges on its own report.

## 6. Definition of done

- [ ] Every added `VizSummary` field is **drawn somewhere in the shipped viewer** — the one field /
      one renderer / same commit rule, because W2 is the unit most likely to acquire a field with no
      consumer, which is this repository's signature defect.
- [ ] Every unit **names its non-test caller**.
- [ ] R1–R13 hold, checked rather than assumed; in particular R3 (suppression replaces the number,
      never hides it), R7 (the seed is visible and copyable in **every** mode including Basic), and
      R13 (no estimate without its `n`).
- [ ] **Every shipped goal carries its measured across-seed pass rate.** No exceptions.
- [ ] No surface hard-codes a dimension count, section list or parameter list.
- [ ] `tsc -b` clean; full suite green; the viewer driven, not read.
- [ ] Anything unbuilt is in `docs/07` § 8 with its measurement rather than dropped.
