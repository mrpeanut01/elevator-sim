/**
 * The shape of the menu, free play and settings — data only, so the reducer beside it can be tested
 * without a document.
 *
 * `DECISIONS.md` § D214 § 2 is the reason this is a separate file from the panel that draws it: a
 * decision made inside a click handler needs a document, a canvas and a click to reach, so it
 * cannot be tested and it drifts. `dev/runConfig.ts` was that defect once already.
 */

/* -------------------------------------------------------------------------- *
 * Screens
 * -------------------------------------------------------------------------- */

/**
 * Every screen the shell can show.
 *
 * `main` is the root and is the only screen with no parent. The other five are reachable from it and
 * return to it, which is what {@link MenuState.history} records — a stack rather than a parent
 * pointer, because Free Play can be entered from the main menu *and* from a leaderboard row
 * ("play this board's configuration"), and those two entries go back to different places.
 */
export const MENU_SCREENS = [
  'main',
  'campaign',
  'free-play',
  'settings',
  'leaderboard',
  'challenge',
  'commissioning',
  'account',
] as const;

export type MenuScreen = (typeof MENU_SCREENS)[number];

/** The root. Named rather than assumed, so `back` from an empty history has somewhere to go. */
export const ROOT_SCREEN: MenuScreen = 'main';

/* -------------------------------------------------------------------------- *
 * Settings
 * -------------------------------------------------------------------------- */

/**
 * Player preferences. **Presentation only** — nothing here may change what a run computes.
 *
 * That restriction is the whole reason this type is small and this comment exists. A setting that
 * altered the simulation would make two players' scores incomparable while both looked valid, and
 * the leaderboard (§ D214 § 3) verifies a submission by **replaying its seed** — a presentation
 * setting cannot affect that replay, and a simulation setting silently would.
 *
 * Anything that changes a run belongs in {@link FreePlaySelection}, which is part of the submitted
 * configuration and is hashed into the board's identity.
 */
export interface Settings {
  /** Suppress the 60 Hz stage animation. The run is unchanged; only the drawing is. */
  readonly reduceMotion: boolean;
  /**
   * Show the energy proxy beside the wait figures.
   *
   * Off by default, and it shows energy **beside** AWT and WT95 rather than folded into a grade —
   * `DECISIONS.md` § D106: a dispatcher that drives less carries fewer people, so a configuration
   * that spends less by serving fewer people has not saved anything.
   *
   * ## What it actually reaches today, which is less than that sentence promises
   *
   * **This is the one field of the four whose promise is not yet true, and it is said here rather
   * than left for a player to discover** — `CLAUDE.md`'s rule that a stated mechanism goes stale the
   * same way a number does, pointed at a control instead of at a claim about performance.
   *
   * `render/runSummary.ts#summaryFigureIds` honours it, and that function's only shipped caller is
   * `mode/disclosure.ts#disclosureItems`, whose only shipped caller is `dev/main.ts#drawParity` —
   * which turns the item list into `parityRefusal`, a string that is **empty whenever mode parity
   * holds**, which is the shipped state. So the switch changes the parity checker's input and no
   * pixel. Measured in a browser at 1280×720 with a run on screen: the whole shell's text is
   * **byte-identical** with it on and off (GitHub issue #70).
   *
   * The two energy cells a player actually reads are `shift/report.ts#energyFigures`, which emits
   * both unconditionally; `DayReportInput` has no field for this preference, so the Day report
   * **cannot** honour it. That is where the fix goes, and it is one required field plus one caller
   * — filed in `GAPS.md` § 3 rather than closed here, because `shift/` and `dev/main.ts` are not
   * this lane's.
   *
   * It is left **offered rather than withdrawn**. `docs/16` S7's rule — *a control that cannot be
   * honoured is not offered* — is about a control that is structurally unhonourable (Basic hides
   * the energy figures anyway, which is why {@link Settings} `showEnergyAxis` has no row there).
   * This one is honourable and unwired, and withdrawing it would delete the only surface § D106's
   * axis has. Do not weaken the criterion; wire the report.
   */
  readonly showEnergyAxis: boolean;
  /** Playback rate for the viewer, as a multiple of simulated time. Drawing only. */
  readonly playbackSpeed: number;
  readonly theme: 'system' | 'dark' | 'light';
}

/** The defaults a fresh player gets. */
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  reduceMotion: false,
  showEnergyAxis: false,
  playbackSpeed: 1,
  theme: 'system',
});

/** Playback speeds the UI offers. Declared, so the panel and the validator agree. */
export const PLAYBACK_SPEEDS: readonly number[] = Object.freeze([0.5, 1, 2, 4, 8]);

/* -------------------------------------------------------------------------- *
 * Free play
 * -------------------------------------------------------------------------- */

/**
 * What the player picked, and everything a run needs to be reproduced from it.
 *
 * **Every field here is part of the run's identity**, because § D214 § 4 hashes this — together with
 * the resolved data it names — into the board a score belongs to. A field added here that changes
 * the simulation and is *not* hashed would let two different runs share a board, which is the
 * "recorded case loses its subject" defect § D205 and § D213 both paid for.
 *
 * `arrivalRatePctPop5min` is `null` for *"whatever this building's own traffic profile says"*, which
 * is a different selection from any particular number and has to survive as one: resolving it to a
 * number at selection time would silently pin a rate that `data/` is free to change.
 */
export interface FreePlaySelection {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly demandTemplateId: string;
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
  /**
   * Where in the template's period the run begins, seconds — or `null` for *the whole of it*.
   *
   * `DECISIONS.md` § D286, and the second half of one selection. {@link durationS} keeps meaning
   * exactly what it always meant — **how long the run's demand is** — and this says *where in the
   * day that length is cut from*, so the two together name a part of the day and neither has been
   * given a second meaning. That distinction is § D275's and it is not cosmetic: `durationS`
   * travels in every leaderboard submission, and a `durationS` that meant *which slice* would leave
   * every stored score a claim about a run nobody made.
   *
   * `null` rather than absent, following `arrivalRatePctPop5min`'s precedent in this same interface:
   * *the whole period* is a real selection rather than a missing one, and it has to survive as one
   * through persistence and through the board hash.
   *
   * The window's far end is `windowStartS + durationS`. Carried as a start and a length rather than
   * as two absolute times because that is what the two facts are — `core` takes both ends, and
   * `enterFreePlay` is where one becomes the other.
   *
   * ## The board cannot see this yet, and that is a named gap rather than a silence
   *
   * `SubmittedRun` and `runDataHashOf` live in `packages/server` and digest `durationS` without this,
   * so a morning and an evening of equal length would share a board — two different exams scored on
   * one table. Until the submission carries the window, {@link canStart} still starts a windowed run
   * and `freePlayIssues` declines to *post* one, with the reason said on the screen. See § D288.
   */
  readonly windowStartS: number | null;
  /** Decimal digits. A string because a seed is an identity, not a quantity to do arithmetic on. */
  readonly seed: string;
}

/**
 * The longest single run the menu will offer, seconds — a **bound**, no longer a ladder.
 *
 * `FREE_PLAY_DURATIONS_S` stood here: five lengths, later six, that a player chose between and that
 * `templateOverrides.durationS` then refitted the demand curve to. § D286 removed it, because that
 * control was three defects wearing one name (issues #80, #81, #82) and none of them was fixable by
 * relabelling it — a length that rescales the day is a scenario control presented as a time budget.
 * *Which part of the day you run* replaced it, and a part's length comes from the period it names.
 *
 * ## Why a bound survives the ladder
 *
 * `menu.test.ts` § *every shipped template can be run at some offered part* is the guard § D282 left
 * standing, and a guard with no bound cannot fail: every template can be run over the whole of
 * itself, so *"at some offered part"* would be a tautology. Two hours is what makes it a real claim
 * again — `office-day` declares 600 minutes and clears it **only through a window**, which is
 * exactly the fix § D276 named and § D282 could not build.
 *
 * Two hours rather than any other number, and it is a `data/` fact rather than a taste: it is
 * `constant-iso`'s own `durationMin`, the longest period any shipped template asks to be run over in
 * one piece (§ D213 § 8). The 36 000 s § D282 added is **dropped**, as that entry said it would be —
 * *"when the slice control lands, this entry stops being the only way to reach `office-day` and may
 * well be dropped"* — which also closes the half-applied state it left behind, where the client
 * offered a ten-hour run the server's own `ACCEPTED_DURATIONS_S` would have refused on post.
 *
 * ## That last clause is history now, and reading it as current status is the trap
 *
 * The server **accepts** a ten-hour run today (GitHub issue #267): `ACCEPTED_DURATIONS_S` carries
 * 36 000 beside the slice ladder, because § D356 made a whole authored day reachable again by
 * **derivation** — the Everyday day is the period the matching record declares — and a bound on what
 * is *offered* cannot see a derivation. So § D286's fix was on the client and the mismatch was
 * between two packages, which is why it came back.
 *
 * **The bound below is unaffected and is not a proxy for that mismatch.** It bounds what is
 * *offered*, which is the job the paragraphs above give it, and a whole day is still not offered:
 * it is granted by a building's own record. Postable and offered are different words here.
 * `menu/client.test.ts` asserts both halves — that this is still 7 200, and that every whole-day
 * length `shift/dayLength.ts#wholeDayFor` can derive is one the server takes.
 */
export const LONGEST_OFFERED_RUN_S = 7200;

/* -------------------------------------------------------------------------- *
 * The catalogue — what there is to choose from
 * -------------------------------------------------------------------------- */

/**
 * One selectable part of one template's period.
 *
 * Both of the run's identity fields are on it — {@link windowStartS} and {@link durationS} — because
 * they are one selection and a control that wrote one without the other would leave a run covering
 * a period nobody named.
 */
export interface DayPart {
  /**
   * Stable identity, and what a select hands back: `1800:1800`, or `null:36000` for a whole period.
   *
   * A compound id rather than a name, because `applyIntent` is a pure reducer with no catalogue to
   * look one up in — the string a select returns has to carry the whole selection. Start first, so
   * the two halves read in the order the sentence does.
   */
  readonly id: string;
  /** `Morning rush`, or the template's own name for a whole period. */
  readonly name: string;
  /** `Morning rush — 08:30–09:00`. The clock is omitted for a template that declares no hour. */
  readonly label: string;
  /**
   * `30 min of demand — 08:30 to 09:00, then however long it takes to clear`.
   *
   * **No end time is printed, and that is issue #80's actual fix rather than a shorter version of
   * it.** The tail is the drain, and the drain is an *outcome*: how long the building takes to clear
   * is what the run is measuring, and it depends on the dispatcher, the building and the seed. The
   * old labels were wrong by up to 1.9× precisely because they printed a number for it — implicitly,
   * by printing only the demand schedule and letting a player read it as the run. Naming the tail
   * without predicting it is the only honest thing this line can say. `sim.drainGraceS` bounds it at
   * an hour, which is a deadline rather than an estimate.
   */
  readonly detail: string;
  /** Seconds into the template's period at which this part begins, or `null` for the whole of it. */
  readonly windowStartS: number | null;
  /** Length of the run's demand, seconds. The part's own, never a rescale of the period. */
  readonly durationS: number;
  /** Seconds after local midnight at which the part begins, or `null` for a template with no hour. */
  readonly startOfDayS: number | null;
}

/**
 * One selectable thing, with enough to draw a row for it.
 *
 * Deliberately **not** the resolved config object. The menu needs an id and a label; handing it a
 * `ResolvedBuilding` would let a panel reach into the simulation model and start rendering
 * derived facts that no test covers.
 */
export interface CatalogueEntry {
  readonly id: string;
  readonly name: string;
  /** A short line the panel may show under the name. Never required to be present. */
  readonly detail?: string | undefined;
  /**
   * The shortest run this entry can be used for, seconds. Templates only.
   *
   * Carried because a demand template's own record declares a `durationMin` and the kernel
   * **throws** below it — `constant-iso` discards 15 minutes of warm-up and 5 of cool-down, so a
   * 15-minute run leaves no measurement window at all. Offering the template and refusing the
   * combination at Start would move an explainable error to the one place with no words for it.
   */
  readonly minimumDurationS?: number | undefined;
  /**
   * Which parts of this template's period a player may run. Templates only. § D286.
   *
   * Derived by `partsOfDay` from the loaded records and carried here so that the panel, the
   * validator and the opening state all read **one** answer to *what is offered*. A template entry
   * with no parts is one nothing can start, which `freePlayIssues` says in words rather than
   * leaving to a disabled button.
   */
  readonly parts?: readonly DayPart[] | undefined;
}

/**
 * Everything Free Play can offer, derived from `data/` rather than listed.
 *
 * § D213 is why this is derived. Five separate hard-coded lists in this repository had to be widened
 * by hand when three buildings landed, and two of them were guards that could no longer see what
 * they were guarding. A menu built from a literal would be the sixth.
 */
export interface MenuCatalogue {
  readonly buildings: readonly CatalogueEntry[];
  readonly dispatchers: readonly CatalogueEntry[];
  readonly demandTemplates: readonly CatalogueEntry[];
}

/* -------------------------------------------------------------------------- *
 * The whole of it
 * -------------------------------------------------------------------------- */

export interface MenuState {
  readonly screen: MenuScreen;
  /** Screens to return through, root-most first. Never contains {@link MenuScreen} `main`. */
  readonly history: readonly MenuScreen[];
  readonly settings: Settings;
  readonly freePlay: FreePlaySelection;
  readonly challenge: ChallengeSelection;
}

/**
 * The one thing a player chooses about a challenge — and the whole of the design in one field.
 *
 * A challenge fixes the building, the traffic, the run length and the seed set; **the dispatcher is
 * what varies**, which is what makes the board a board about dispatch rather than about seed luck.
 * `docs/17` § 4.3, and § D218.
 *
 * There is no seed here and there must not be. The seeds are the server's, issued with the
 * challenge, and a client that could choose one would be choosing which run to be judged on.
 */
export interface ChallengeSelection {
  readonly dispatcherProfileId: string;
  /** Which metric the board is ordered on. One of the server's four; never a blend (§ D106). */
  readonly metric: string;
}

/** A reason a selection cannot be started, in words a player can act on. */
export interface SelectionIssue {
  readonly field: keyof FreePlaySelection;
  readonly message: string;
}
