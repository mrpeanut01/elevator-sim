# Known gaps — stated, measured where possible, and not closed

**As of:** 2026-07-29, wave 9 · **Suite:** 225 files / ~4 117 tests · **Branch:** `integration`

This document exists because the alternative is worse. Every item here is something the project
**does not do**, **cannot yet say**, or **says with a caveat** — collected in one place rather than
distributed across commit messages where nobody planning work will find them.

Nothing in this file is a plan. Items are ordered by whether they can produce a **wrong number**, a
**wrong screen**, or neither.

---

## 1. The largest one: Phase 6c has not been re-measured

**Phase 6 is ⚠️ partial and stays partial.**

Learned weight-set selection was refused across eight pre-registered operating points
([§ D156](DECISIONS.md)), and the mechanism was named: the shipped demand model varied *how busy*
the building was and never *the mix* of up, down and interfloor traffic within a run, so the
condition selection exists to exploit did not occur anywhere.

**That condition now exists** — `lunch-two-way` ([§ D169](DECISIONS.md)) varies the directional mix
across the run, χ² 383.4 against a flat control's 4.8, cited to CIBSE Guide D and BCO where citable
and derived-with-the-arithmetic-shown where not.

**And nothing has been measured on it.** The protocol is pre-registered
([§ D162](DECISIONS.md), five conditions, including a flat-mix negative control at equal total
demand), the template is committed, and the commit that added it deliberately ran **no selector
arm** — the ordering is the evidence. The measurement is simply not done.

**What that means for anyone reading a status table:** the capability is built, the question is
still open, and a third refusal remains an explicitly permitted outcome. Do not read *"the template
landed"* as *"6c is closer to accepted."*

---

## 2. Gaps that can produce a wrong number

| Gap | State |
|---|---|
| **The `lunch-two-way` operating point has no saturation census** | One clean run at 1.5 % with a quotable mean is one seed, not a ceiling. Whoever measures arms there must derive the budget from their own census. |
| **The `lunch-two-way` arc is the widest amplitude consistent with its citation** | A real building's departures and returns overlap. **A wider arc is the one a selector finds easiest to exploit**, so this cuts against any future positive result and is stated first in three places rather than last. `mixAmplitude` narrows it. |
| **The `matrix` study's pins are re-derived by no test** | One study id of fifteen. Covered only by running the regeneration tool by hand, which was done (zero diff), but nothing turns red if it drifts. This is the harness-coverage shape. |
| **One door-hold figure is annotated rather than re-derived** | The 50-cell study behind it has **no shipped entry point** — it lives in the commit that measured it. 40 of 50 cells provably cannot have moved; 10 can have. Marked *"measured on the pre-escalator configuration"* rather than quietly kept. |
| **Double-deck's verdict is `BETTER-EVERYWHERE` on a narrower base than the answer it replaced** | Two cells at one operating point, where the previous answer had four at two; the 1.5 % point is unquotable at any budget in the band. **A better word on a narrower base is not a stronger result**, and a reader who skims will take the word at face value. |
| **A one-way escalator is not expressible** | Transport modes carry no direction, because nothing would read it and an unread field is the dead seam this repository has shipped twelve times. |
| **Two of `vertical-city`'s three sky-lobby escalators carry nobody** | The zone locals already serve both levels. Declared because the machines exist in the building being modelled, **measured and pinned in both directions** so it is loud rather than discovered. |
| **A zone cannot be changed mid-run** | Operational zoning is a shipped concept with no mechanism over time. Deliberately deferred this wave — nothing measures it and no published result depends on it. |
| **The double-deck closed-form round-trip-time check is single-deck** | The Barney/CIBSE derivation *is* the single-deck one; retiring the warning would be the over-claim. |

---

## 3. Gaps that can produce a wrong screen

| Gap | State |
|---|---|
| **A live weight editor makes overfitting the tuning seeds the dominant strategy** | Measured, not theorised: a stage cleared on an edited vector is **beaten on three measures on that stage's own declared holdout set**, and the sweep is sharp — three neighbouring values clear, the fourth does not. The campaign judges on tuning seeds only, and **nothing in the shipped surface says so**. This is `CLAUDE.md` § *Tuning discipline* arriving as a game-design defect. |
| **Basic mode cannot *shorten* a suppression reason** | `core` returns one of four sentences as a bare string with **no ground code**, so a per-ground rewording would re-decide which ground fired. Basic leads with a ground-free sentence and carries `core`'s words underneath. **Named fix: `core` must carry the ground beside the prose.** |
| **Thirteen warning rows on one building is a wall** | Grouping is deliberately **not** done: parity requires each warning's text in Basic, and a summarising group is the first place one could go missing. |
| **The three DOM panels are statically swept, not driven** | The generated honesty search reaches them only by scanning source for probability words. A sentence assembled at runtime there is invisible to it. Weaker than driving, and stated as a limitation rather than presented as coverage. |
| **The always-on honesty tier reaches no batch at 50+ replications** | So R2's budget clause is only satisfiable in the deep tier, behind a flag. |
| **The honesty search's `mode` dimension has one value** | It plugs in at one line — a tuple in `types.ts` — and the corpus assertion tightens automatically when it does. |
| **The structural-refusal reason is prose keyed on an id the leg record does not carry** | So it cannot be joined to a leg. **This was in the wave plan and I never briefed it** — an orchestration miss, recorded rather than dropped. |
| **Basic's curated three-dimension subset is not built** | The campaign editor is restricted to each stage's declared editable set instead, which is data. |

---

## 4. Real debt that cannot produce either, and is therefore out of scope

Listed so it does not read as forgotten. None of these can make the simulator compute a wrong
number or the viewer show a wrong screen.

`tuning/space`'s liveness sweep cannot probe seven `selection.*` rows (it passes no dispatcher
profiles) · `published.test.ts` holds nothing for a categorical study outside one case · a `'z'`
family label can still print on a convergence report whose half-width is already `NaN` ·
`estimateMean` returns a zero half-width on a zero-variance sample · `prepositionPlan` has zero
callers and is classified rather than deleted · `stats/` consolidation is unstarted.

---

## 5. Where a status claim is weaker than it looks

- **Phase 9 has a criterion for the first time** ([§ D163](DECISIONS.md)), written **after** seven of
  its nine units existed. Its defence is structural, not chronological: the clauses that decide it
  were ones the product **failed** at the time of writing. **It still has no status row**, because
  it has not been measured against as a whole — and the row and the verdict land together or
  neither does.
- **Phase 9's own contract has been wrong about the code four times** in this wave — a reachability
  claim, a field list, a hard-coded percentage in an example message, and a goal table disagreeing
  with the shipped data in three of five cells. Being *binding* does not make a document *right*.
- **"Three of seven campaign stages clear from the dispatcher dropdown alone" is four.** Corrected,
  and now pinned by a test that re-derives it.
