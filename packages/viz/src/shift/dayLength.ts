/**
 * **The whole authored day a building may run** — derived from `data/`, never listed here.
 *
 * ## What was wrong
 *
 * `ISSUE_VERIFICATION_FINDINGS.md` § AB, raised by the product owner: *the day appears to clock
 * only one hour in the morning, not a full cycle.* Verified, and the diagnosis is sharper than the
 * report. The Everyday day was **thirty minutes of `rise-and-fall`, on every building**, and not by
 * a decision anybody wrote down: `dev/state.ts#shiftDemandTemplateId` resolves
 * `state.freePlay?.demandTemplateId ?? fromPattern`, an Everyday player never writes
 * `state.freePlay`, and the opening `pattern: 'building'` makes `selectedPatternSpec` answer
 * `undefined` — so every day fell through to a **hard-coded `'rise-and-fall'`** one line later. A
 * residential tower and a thirty-floor office met the same 08:30–09:00 up-peak.
 *
 * Meanwhile `office-day` had shipped since § D273: `durationMin: 600`, `startOfDayMin: 480`,
 * seventeen phases, three cited peaks, schema-valid and loaded — and reachable **only** through
 * Free Play's template select on the Engineer side. Not a dead seam (Free Play is a real non-test
 * caller) but the same shape one level up: the content exists and the audience the charter cares
 * about cannot get to it.
 *
 * ## Why this is a derivation and not a table, and why that matters here specifically
 *
 * § D286 **deleted** two day-length controls — `SHIFT_LENGTHS`' four narrative options and Free
 * Play's five numeric *Run length* options, both writing one field (issue #82) — and replaced them
 * with `menu/partsOfDay.ts`, whose options come from the loaded records' own hours. Its rule is the
 * rule here: *a part's length is the period it names and its label is its clock.* **Nothing in this
 * module is a length a player sets.** The day's length is the period the record declares, and the
 * player chooses no part of it, so the control § D286 removed does not come back wearing a new
 * name.
 *
 * What is derived is **which** authored day a building may run, and the condition is one line:
 *
 * > a day offers itself to a building when some phase of it, **at the day's own peak intensity**,
 * > declares exactly the mix that building's traffic profile is designed around.
 *
 * A `demandTemplates` phase carries `startSplit`/`endSplit`, and those **override** the building's
 * profile for the run — which is precisely why the condition has to exist. `rise-and-fall` authors
 * no split at all, so every building keeps its own; `office-day` authors an office mix phase by
 * phase, so running Garden Apartments on it would send 85 % of a residential tower *up* from the
 * lobby at nine in the morning. That is not a longer day, it is a different building.
 *
 * Measured against the shipped file, the condition admits and excludes exactly the right records
 * without naming one. `office-day`'s phases at intensity `1.0` declare the mixes
 * `85/5/10`, `0/90/10`, `37.5/52.5/10`, `52.5/37.5/10`, `90/0/10` and `5/85/10`; the morning hold's
 * `85/5/10` **is** `office-standard`'s and `office-prestige`'s own `directionalSplit`, so the five
 * office buildings are admitted. `residential` (`15/75/10`), `hotel` (`40/40/20`) and `hospital`
 * (`35/35/30`) match no phase of it, so Garden Apartments, Crown Hotel and St Jude's are excluded
 * **structurally rather than by three ids this file knows to skip** — and a residential day authored
 * tomorrow with a residential peak would be picked up without a line here changing. That is
 * `partsOfDay`'s own property and the reason its idiom was copied rather than a list written.
 *
 * **Three contracts therefore keep their thirty-minute slice, and the absence is stated rather than
 * papered over.** No day-shaped record ships for a residential, hotel or hospital crowd; authoring
 * one is a demand-data claim (`CLAUDE.md` § Reference data) and not this seam's to make.
 *
 * ## Why a whole day travels as a **window** and can travel no other way
 *
 * `traffic/demandTemplate.ts#requireNoPhaseListOverrides` refuses `templateOverrides.durationS` on
 * a phase-list record **by name** — *"its phases are authored, not computed, so there is no geometry
 * to refit and a new duration would rescale a whole day's schedule into whatever length was asked
 * for"* (§ D285). `dev/state.ts#shiftRunConfigOf` writes `durationS` **or** a window and never both,
 * and it writes `durationS` exactly when `ViewerState.windowStartS` is `null`. So a state carrying
 * `windowStartS: null` and a phase-list template does not run long — it **throws**, before a frame
 * is drawn.
 *
 * That is why {@link wholeDayRun} writes `windowStartS: 0` rather than leaving the `null` that
 * means *the whole of this period* everywhere else in this codebase. `0` with a length equal to the
 * record's own period is `partsOfDay`'s spelling for the same thing (`partIdOf(0, 36000)`), and it
 * is the only spelling `core` accepts for a day. Verified by running it: a `36000` `durationS`
 * against `office-day` raises `TrafficError`, and the same run windowed `0 → 36000` produces 7 308
 * legs on Midtown Office.
 *
 * ## What it costs, which is not nothing and is not what § AB estimated
 *
 * § AB says *"a ten-hour day is roughly twenty times the trips of a thirty-minute one"*. **Measured,
 * it is ten**, and the estimate is refuted rather than rounded: a day is twenty times the wall
 * clock but it is not twenty times the *demand*, because three peaks and a 0.25 inter-peak level
 * integrate to about half of what twenty peak-shaped slices would. One replication, seed
 * 20 260 824, `collective`, the shipped defaults, in Node:
 *
 * | building | slice — 1 800 s | whole day — 36 000 s | legs | wall | recording |
 * |---|---|---|---|---|---|
 * | Garden Apartments | 18 legs · 32 ms · 0.1 MB | 190 legs · 38 ms · 1.1 MB | ×10.6 | ×1.2 | ×11 |
 * | Midtown Office | 682 legs · 298 ms · 2.8 MB | 7 308 legs · 3 506 ms · 32.1 MB | ×10.7 | ×11.8 | ×11 |
 * | Vertical City | 3 172 legs · 1 692 ms · 10.2 MB | 32 724 legs · 9 200 ms · 145.5 MB | ×10.3 | ×5.4 | ×14 |
 *
 * **Vertical City is the row to worry about and it is stated rather than glossed.** 145.5 MB is
 * two and a half times the 57.3 MB `dev/shiftRunner.ts` measured `structuredClone` taking 1.6–2.3 s
 * over, and that clone is on the path between the worker and the frame that draws. Nine seconds of
 * simulation plus a clone of that size is a real hitch on the largest shipped building, on a device
 * slower than this one it is worse, and no measurement here was taken in a browser.
 *
 * **Two things bound the exposure today.** Only the Everyday run press reaches this, so nothing in
 * `benchmark/`, `campaign/` or any published figure runs a day; and the suite cost is one file —
 * `dayLength.test.ts` runs two Secure Tower simulations and finishes in **1.7 s**, against a
 * `--project viz` total that did not move (126 s).
 *
 * A decision number is owed for all of the above.
 */

import type {
  BuildingConfig,
  DirectionalSplit,
  TrafficProfiles,
} from '@elevator-sim/core/browser';

import type { RunHorizon } from './types.js';

/**
 * A whole authored day, and the three facts a caller needs to run one.
 *
 * `periodS` is the record's own `durationMin`, never a length anybody chose — which is the whole of
 * why this type has no `length` field a control could write to. See the module docstring.
 */
export interface WholeDay {
  /** The `demandTemplates` id — `office-day` today, and nothing here knows that. */
  readonly templateId: string;
  /** The record's own `durationMin × 60`. Ten hours, for the one day that ships. */
  readonly periodS: number;
  /** `startOfDayMin × 60`, so a caller can put a clock on it without restating 08:00. */
  readonly startOfDayS: number;
}

/** Two mixes are the same when all three shares are, to the precision `data/` authors them at. */
function sameSplit(left: DirectionalSplit, right: DirectionalSplit): boolean {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  return (
    near(left.incoming, right.incoming) &&
    near(left.outgoing, right.outgoing) &&
    near(left.interfloor, right.interfloor)
  );
}

/**
 * The whole authored day `building` may run, or `undefined` when the file carries none for it.
 *
 * `undefined` is a real answer and the common one — five of the eight shipped buildings have a day
 * and three do not — so callers are expected to keep their slice rather than to treat it as a gap.
 * See the module docstring for the condition and for why the three exclusions are facts about the
 * records rather than ids this file skips.
 *
 * A record with no `phases` can never answer here even if its mix matched, and that is deliberate
 * rather than incidental: a phase list is what makes a record a *day* — a sequence of cited peaks
 * separated by derived interpolations (§ D273) — and it is also exactly what refuses a `durationS`
 * refit, which is the property {@link wholeDayRun} is built around.
 */
export function wholeDayFor(
  trafficProfiles: TrafficProfiles,
  building: BuildingConfig | undefined,
): WholeDay | undefined {
  if (building === undefined) return undefined;
  const profile = trafficProfiles.profiles.find(
    (candidate) => candidate.id === building.trafficProfile,
  );
  if (profile === undefined) return undefined;

  for (const record of trafficProfiles.demandTemplates) {
    const phases = record.phases;
    if (phases === undefined || phases.length === 0) continue;
    if (record.startOfDayMin === undefined) continue;
    if (record.durationMin <= 0) continue;

    // The day's own maximum, read off the record rather than assumed to be 1.0 — a day profile
    // authored tomorrow that never reaches full nominal rate still has a busiest moment, and it is
    // that moment's mix which says whose day this is.
    const peak = phases.reduce(
      (highest, phase) => Math.max(highest, phase.startIntensity, phase.endIntensity),
      0,
    );
    const declaresOurPeak = phases.some((phase) => {
      const startSplit = phase.startSplit;
      const endSplit = phase.endSplit;
      const atPeakStart = phase.startIntensity >= peak && startSplit !== undefined;
      const atPeakEnd = phase.endIntensity >= peak && endSplit !== undefined;
      return (
        (atPeakStart && sameSplit(startSplit, profile.directionalSplit)) ||
        (atPeakEnd && sameSplit(endSplit, profile.directionalSplit))
      );
    });
    if (!declaresOurPeak) continue;

    return Object.freeze({
      templateId: record.id,
      periodS: record.durationMin * 60,
      startOfDayS: record.startOfDayMin * 60,
    });
  }
  return undefined;
}

/**
 * The two `ViewerState` fields that run `day` whole — *which part of the day you run*, set to all
 * of it.
 *
 * One function rather than two field writes at each press, for the reason `calendarAskInputOf`
 * gives about its own four: two expressions for *what the day is* is how a run and the sentence
 * describing it come to disagree, and here it would be worse than a caption — `windowStartS: null`
 * beside a phase-list template throws rather than draws. The pair is one selection and it travels
 * as one, exactly as `DayPart` carries both halves of its id.
 */
export function wholeDayRun(day: WholeDay): {
  readonly shiftLengthS: number;
  readonly windowStartS: number;
} {
  return { shiftLengthS: day.periodS, windowStartS: 0 };
}

/**
 * Whether a state's run **is** `day` run whole — the inverse of {@link wholeDayRun}.
 *
 * Read by `dev/state.ts#shiftDemandTemplateId` to decide which template the run resolves against,
 * so that the window and the template are one decision rather than two that agree by habit. A run
 * that covers some *other* span of the same period is a part of a day and is not this; a run that
 * covers the whole of it is asking for the day, and the only record with that period is the day.
 */
export function runsWholeDay(
  day: WholeDay,
  shiftLengthS: number,
  windowStartS: number | null,
): boolean {
  const run = wholeDayRun(day);
  return windowStartS === run.windowStartS && shiftLengthS === run.shiftLengthS;
}

/**
 * **What kind of run a state is** — `shift/goals.ts#goalsForDay`'s second argument, derived once
 * for every surface in both products.
 *
 * ## Why this is a function in `shift/` and not three expressions in two shells
 *
 * This is a fix for a defect the horizon parameter shipped with. `goalsForDay` grew `over` and
 * **one of its four callers passed it**: `everyday/host.ts` did, `dev/main.ts#closeShift` and
 * `dev/leftRail.ts#drawShift` did not, and `honesty/surfaces.ts` correctly does not (see below).
 * So an Everyday player who pressed *Run* on a whole authored day was told by the Everyday rail
 * that the day asked for a worst wait inside **460 s** and by the Engineer rail, one door away and
 * about the same run, that it asked for **230 s**. Neither figure was wrong on its own. Publishing
 * both about one run is what `TEST_MATRIX.md` T1's *figures consistent* clause forbids, and it is
 * the class of defect this repository's honesty tier exists to catch.
 *
 * `everyday/host.ts` had already written the warning over its own private copy of this lookup —
 * *"one expression, read by the two things that must not disagree … a second copy of this lookup is
 * how a ten-hour run comes to be graded against a thirty-minute ceiling"* — and the copy it warned
 * about was never going to be a second copy in the Everyday shell. It was the Engineer shell having
 * no copy at all. So the expression moved **down** rather than sideways: here, beside the two
 * functions it is composed of, in the one directory both shells already import. Copying `horizonOf`
 * into `dev/` would have been the same defect with a third instance, and
 * `CLAUDE.md`'s standing rule about the Everyday/Engineer boundary forbids the shorter fix anyway —
 * `dev/main.ts` may not import the Everyday shell, because `everyday/boot.ts` already imports
 * `dev/main.ts` and closing that cycle is what produced this directory's last module-init
 * `undefined`.
 *
 * ## Why it takes a `run` object rather than two numbers
 *
 * {@link runsWholeDay} takes the two window fields separately because it is the inverse of
 * {@link wholeDayRun} and answers about a pair. This takes them as one object for the reason
 * `wholeDayRun`'s docstring gives about writing them: *the pair is one selection and it travels as
 * one*. A `ViewerState` satisfies the shape structurally, so all three call sites pass their state
 * whole and no site can split the pair on the way in.
 *
 * The building is resolved by the caller rather than looked up here, and that is a layering fact
 * rather than a preference: resolving one needs `BrowserResources` and `dev/state.ts`, and
 * `dev/state.ts` imports this module. Nothing in `shift/`'s source imports `dev/`, and a cycle here
 * would be paid for at module-init time.
 *
 * `'period'` for a building with no authored day, which is three of the eight shipped ones and is
 * {@link wholeDayFor}'s `undefined` passed straight through — **and it is keyed on the day, never on
 * a number of seconds.** A residential tower whose window happens to say ten hours is running a
 * long slice of a thirty-minute template, not a day, and `goals.ts#WORST_WAIT_WHOLE_DAY_FACTOR`
 * carries the measurement that says a long slice truncates its tail exactly as a short one does.
 *
 * ## It is not a text producer, and `honesty/derive.test.ts` cannot tell yet
 *
 * **This function leaves the tree red on exactly one test, and the red is a classification gap
 * rather than a defect** — said here rather than left for whoever runs the suite next.
 * `derive.test-helper.ts` reads two adjacent alphabetic words as prose, so the discriminated-union
 * tag `'whole-day'` reads as a phrase and this becomes a derived *text producer* that no adapter
 * drives and no exclusion names. It is the **id/key case** `NOT_PLAYER_FACING` already records three
 * times — `dev/elementMap.ts#ELEMENT_IDS`, `menu/screens.ts#withChosenValue`,
 * `everyday/profile.ts#loadProfile` — and the entry it wants is:
 *
 * > A union tag with no sentence in it. `runHorizonOf` answers *which of the two kinds of run this
 * > state is*, and both of its values are members of `shift/types.ts#RunHorizon` — `period`, and
 * > `whole-day`, which is derived only because the hyphen reads to the two-adjacent-words scanner
 * > as a phrase. Nothing it returns is shown to anybody: what a player reads is the **bar**
 * > `goals.ts#goalsForDay` builds from it, and `goalsForDay` is driven already.
 * > `shift/dayLength.test.ts` asserts both of its answers against the template the same state
 * > resolves to.
 *
 * `packages/viz/src/honesty/` belongs to another lane this wave, so the entry is owed rather than
 * written. **Three ways to make it green were considered and refused**, and they are worth stating
 * so nobody re-derives them: spelling the tag `'wholeDay'`, hiding the declaration behind a bare
 * `export { … }` so the deriver reads it as unexported, and widening `goalsForDay`'s parameter to
 * take a boolean so the tag never leaves the one span that already carries it. The first two make
 * an honesty instrument miss something on purpose, which is the false negative its own docstring
 * warns about; the third distorts a type to satisfy a scanner. A classification entry is the honest
 * repair, and it belongs to the file that owns the classification.
 *
 * A decision number is owed; this docstring is the argument.
 */
export function runHorizonOf(
  trafficProfiles: TrafficProfiles,
  building: BuildingConfig | undefined,
  run: { readonly shiftLengthS: number; readonly windowStartS: number | null },
): RunHorizon {
  const day = wholeDayFor(trafficProfiles, building);
  if (day === undefined) return 'period';
  return runsWholeDay(day, run.shiftLengthS, run.windowStartS) ? 'whole-day' : 'period';
}
