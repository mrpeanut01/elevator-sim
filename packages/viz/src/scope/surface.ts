/**
 * Every player-writable field, and the scope it may be written at — S1.
 *
 * ## Why this is a table and the key set is not
 *
 * The **scopes** are a judgement somebody has to make and defend, so they are written down with the
 * reason beside them. The **keys** are a fact about the code, so they are derived: `surface.test.ts`
 * builds the expected set from `Object.keys` of the state's own opening values —
 * `initialState()`, `DEFAULT_SETTINGS`, and `initialMenuState().freePlay` — and asserts this table
 * matches it **in both directions**. A field added to `ViewerState` with no entry here is red on the
 * next run; an entry for a field that no longer exists is red on the same run.
 *
 * That is § D213's rule, and § D213 is not a hypothetical: five hand-written lists in one branch had
 * to be widened by hand when three buildings landed, and **two of them were guards that could no
 * longer see what they were guarding**. A scope table maintained by hand would be the sixth, and it
 * would fail in the worst direction — silently declaring a smaller surface scoped than exists.
 *
 * ## How the scopes were assigned, and why the assignment is checkable
 *
 * Not by taste. `shiftRunConfigOf` is the single function that turns a `ViewerState` into a run, and
 * the fields it reads are exactly the fields that can move a leg:
 *
 * > `savedBuildings`, `buildingId`, `savedClasses`, `levers`, `week`, `savedDispatchers`,
 * > `dispatcherId`, `pattern`, `savedPatterns`, `freePlay`, `seed`, `shiftLengthS`,
 * > `outOfServiceCarIds`
 *
 * Everything else in `ViewerState` — the disclosure flags, the four navigation fields, the four
 * editor working copies, the four `editing*Id` pointers, and the three run outputs — is unread by
 * it. So `presentation` is not a claim about intent; it is a claim about reachability, and
 * `scope.test.ts` decides it by running both arms rather than by trusting this paragraph.
 *
 * ## The `between-games` set is the `ranked` set, and it already existed
 *
 * `buildingId`, `dispatcherId`, `pattern`, `shiftLengthS`, `freePlay`, `seed` — the run's identity,
 * and precisely what a leaderboard submission carries. `dev/main.ts#provenanceLineOf` accepts
 * exactly these six and refuses everything else, which is how this row was found rather than
 * invented. See `runIdentity.ts`.
 */

import type { ChangeScope, ScopeEntry, SurfaceKey } from './types.js';

/* -------------------------------------------------------------------------- *
 * Helpers, so a row is a scope and a sentence rather than a shape
 * -------------------------------------------------------------------------- */

const control = (scope: ChangeScope, why: string): ScopeEntry =>
  Object.freeze({ kind: 'control' as const, scope, why });

const latent = (realisedBy: SurfaceKey, why: string): ScopeEntry =>
  Object.freeze({ kind: 'latent' as const, realisedBy, why });

const output = (why: string): ScopeEntry => Object.freeze({ kind: 'output' as const, why });

/* -------------------------------------------------------------------------- *
 * The table
 * -------------------------------------------------------------------------- */

/**
 * The whole writable surface. Ordered by where a field lives, not by scope, so a reader checking
 * *"is this field scoped?"* looks it up the way they know it.
 */
export const SCOPE_OF: Readonly<Record<SurfaceKey, ScopeEntry>> = Object.freeze({
  /* -------------------------------------------------- viewer: which game this is */
  /*
   * An **output**, and the classification is worth arguing because the first attempt got it wrong.
   *
   * It was declared `between-games`, which reads correctly — a mode is chosen when a game starts and
   * not during one — and `scope.test.ts` immediately refused it: S3 requires a non-`presentation`
   * control to move the legs, and this moves none, because `shiftRunConfigOf` never reads it. The
   * run is the same run either way, which is exactly the property that lets a free-play sheet be
   * compared with the week-day sheet of the same day.
   *
   * The resolution is that **no control writes this field**. A player enters a mode by pressing
   * Start or Campaign, and those affordances carry the scope; this is what the shell writes down
   * afterwards, on the same footing as `recording` and `report`. Declaring it a control would have
   * put a scope on a consequence and then demanded the consequence behave like a cause.
   */
  'viewer.playMode': output(
    'Which play mode this state belongs to, written when one is entered. Named rather than inferred: ' +
      'the shell’s only signal was freePlay !== undefined, and “no contract” never meant “no week” — ' +
      'a free-play run keeps its building’s contract id, which is how the sheet came to bank nothing.',
  ),

  /* ------------------------------------------------------- viewer: disclosure */
  'viewer.mode': control(
    'presentation',
    'Casual against Engineer decides how much of a run is shown and none of what it computes. ' +
      'Mode parity is the separate guarantee that it never hides a failure — mode/parity.ts.',
  ),
  'viewer.showMaths': control(
    'presentation',
    'Discloses the honesty card’s maths paragraph in engineer mode. The prototype’s own version of ' +
      'this toggle was inert and docs/12 § 4 records the correction; the sink is mathsDisclosureOf.',
  ),

  /* ------------------------------------------------------ viewer: navigation */
  'viewer.tab': control(
    'presentation',
    'Which surface is showing. Navigation writes nothing a run reads, and surfaceStateFor is the ' +
      'sink — one selected tab, one focusable, the rest hidden.',
  ),
  'viewer.revealedTabs': control(
    'presentation',
    'Which contextual editor tabs the rail has opened this session. Changes the strip and nothing ' +
      'else; a revealed tab stays revealed, which is surfaces.ts’s stated accessibility rule.',
  ),
  'viewer.railSegment': control(
    'presentation',
    'Which of the right rail’s four segments is open. railStateFor is the sink.',
  ),
  'viewer.drawerOpen': control(
    'presentation',
    'Whether the rail is on screen below the 1340 px breakpoint. drawerStateFor is the sink, and it ' +
      'deliberately remembers the choice across the breakpoint rather than applying it in column mode.',
  ),

  /* --------------------------------------------------- viewer: the run’s identity */
  'viewer.buildingId': control(
    'between-games',
    'The building a game is played on. A contract fixes it, and changing it takes the week with it ' +
      'through takeContract — a sheet headed one building and footed another banked the wrong shift once.',
  ),
  'viewer.dispatcherId': control(
    'between-games',
    'The dispatcher profile. Part of the submitted configuration and of the leaderboard board’s own ' +
      'identity, so it is fixed for a ranked run rather than tuned inside one.',
  ),
  'viewer.pattern': control(
    'between-games',
    'Which arrival pattern is running — the building’s own, a shipped profile, or one the reader ' +
      'saved. A saved pattern is what makes a run unreproducible from its selection elsewhere.',
  ),
  'viewer.windowStartS': control(
    'between-games',
    'Where in the demand template’s period the shift begins, or null for the whole of it. Reaches ' +
      'the run as TrafficConfig windowStartS/windowEndS, which select part of the authored ' +
      'schedule rather than refitting it the way durationS does (§ D275, § D285).',
  ),
  'viewer.shiftLengthS': control(
    'between-games',
    'The run’s horizon. Comparability depends on it: every published figure in this repository was ' +
      'measured over a stated window, and a run of a different length is a different claim.',
  ),
  'viewer.freePlay': control(
    'between-games',
    'The demand template and arrival rate Free Play asked for, over the pattern select. Both are ' +
      'hashed into the leaderboard board a score belongs to, so both are fixed when a game starts.',
  ),
  'viewer.calendar': control(
    'between-games',
    'Which calendar period the week is under — a vacation, a public holiday, a moving week. It sets ' +
      'a population factor and a mix bias across a stretch of days, so it is a different game rather ' +
      'than a different day: moving it mid-week would rewrite the premise the days already closed ' +
      'were judged against.',
  ),
  'viewer.commissioning': control(
    'between-games',
    'The fabric the reader commissioned — shafts, machine class and rated speed, per bank. Pure ' +
      'between-games and the mode says so: you choose the building and then live with it for the ' +
      'week, which is the whole difference between commissioning and the shift week.',
  ),
  'viewer.commissioningConstraintId': control(
    'presentation',
    'Which capital constraint the fabric is judged against. Presentation, and the distinction is the ' +
      'whole of what a constraint is: it decides which choices the screen offers and what it ' +
      'refuses, and it moves no leg by itself. What moves the run is the choice a player then makes ' +
      'under it — a constraint that changed a run directly would be a difficulty setting, which ' +
      'docs/10 § 5.5 bans.',
  ),
  'viewer.seed': control(
    'between-games',
    'The seed names the run. It is between-games rather than within-day because it travels with a ' +
      'submission and the server replays it — a seed changed mid-week would rename days already banked.',
  ),

  /* ------------------------------------------------ viewer: what re-runs today */
  'viewer.levers': control(
    'within-day',
    'The group levers — parking, express, dwell — applied over a shipped profile without forking it. ' +
      'Moving one re-runs the day, and a run carrying moved levers cannot be reproduced from a CLI line.',
  ),
  'viewer.selectorSpec': control(
    'within-day',
    'The weight-set selector: which policy adapts the dispatcher mid-run, how long it dwells, and ' +
      'which weight vector each detected traffic pattern gets. It is the product’s one genuine ' +
      'mid-day mechanism, and it is within-day rather than presentation because the player is ' +
      'configuring an automatic policy in advance rather than intervening — the run still has to be ' +
      'simulated again to see it.',
  ),
  'viewer.ruleRows': control(
    'within-day',
    'The Everyday rules — when/then rows compiled onto the weight-set selector, first match ' +
      'wins. within-day for selectorSpec’s reason: a rule is the product’s one genuine mid-day ' +
      'mechanism configured in advance, and editing the list still re-runs the day. Written ' +
      'after the selector in shiftRunConfigOf, so a non-empty list drives the run under ' +
      'selection.policy rules and the switching panel says so.',
  ),
  'viewer.patience': control(
    'within-day',
    'How long a rider will stand at a landing before giving up — the one schema on the Parameters ' +
      'tab that reaches a run. within-day rather than between-games because it is a property of the ' +
      'crowd rather than of the contest: it does not name the run, it changes what the run costs, ' +
      'and it re-runs the day like the levers beside it. It is here at all because the audit found ' +
      '114 controls on that tab binding nothing, and the values living in a closure rather than in ' +
      'this state is what stopped this file from being able to say so.',
  ),
  'viewer.outOfServiceCarIds': control(
    'within-day',
    'Cars the reader took out of service by clicking a badge. Re-runs the day; the CLI has no flag ' +
      'that holds a car, so a run carrying one is not reproducible from its selection.',
  ),
  'viewer.interventions': control(
    'within-day',
    'The run record’s intervention log — Everyday Mode’s contract § 1.4, run = { seed, config, ' +
      'interventions[] }. Pressing the stage control appends { atS, park-cars-lobby } and re-runs ' +
      'the day from t = 0 with the prefix bit-identical; within-day because it is the product’s ' +
      'purest change-of-mind, and no selection, CLI line or submission carries a log yet.',
  ),

  /* ------------------------------------------------------- viewer: the day boundary */
  'viewer.week': control(
    'between-days',
    'The contract, the day, the streak and what has been banked. day drives grownBuilding’s 11 %/day ' +
      'and eventFor’s twist, so it is the one field that must move only when the doors open on tomorrow.',
  ),
  'viewer.parkedWeeks': latent(
    'viewer.buildingId',
    'The weeks the player is not currently playing — one per assignment they have stepped away from ' +
      '(issue #107). Latent rather than a control, and the classification is the whole of what the ' +
      'field is for: shiftRunConfigOf never reads it, so parking a week moves no leg — and picking ' +
      'that assignment’s building again resumes it, which moves every leg, because its day is what ' +
      'grownBuilding’s 11 %/day is applied to. A resumed day 4 is a different run from a fresh day 1, ' +
      'and that is the assertion issue #107’s fix is proved by. Two writers now reach it and not one ' +
      '(issue #125): Free Play’s Start parks the week it displaces too, through ' +
      'dev/state.ts#withFreePlayWeek, so the same resume applies to a campaign week a free-play run ' +
      'was started over.',
  ),

  /* --------------------------------------------------- viewer: authored artifacts */
  'viewer.savedDispatchers': latent(
    'viewer.dispatcherId',
    'A saved profile changes no run until dispatcherId selects it. Latent rather than inert, and the ' +
      'distinction matters: an unselected save is a draft, not a control that does nothing.',
  ),
  'viewer.savedPatterns': latent(
    'viewer.pattern',
    'A saved arrival pattern changes no run until the pattern select names it.',
  ),
  'viewer.savedClasses': control(
    'within-day',
    'A saved machine class widens the ElevatorSpecs the building resolves against, so it reaches the ' +
      'run on the next shift with no further selection — unlike the other three saves.',
  ),
  'viewer.savedBuildings': latent(
    'viewer.buildingId',
    'A saved building changes no run until buildingId selects it.',
  ),

  /* ------------------------------------------- viewer: the four editors’ working copies */
  'viewer.dispatcherSpec': latent(
    'viewer.savedDispatchers',
    'The dispatcher editor’s draft. shiftRunConfigOf never reads it; Save as new is what turns it ' +
      'into something dispatcherId can select.',
  ),
  'viewer.editingDispatcherId': control(
    'presentation',
    'Which profile the dispatcher editor is pointed at. Names the draft’s subject and reaches no run.',
  ),
  'viewer.patternSpec': latent('viewer.savedPatterns', 'The traffic editor’s draft — the peak order, the intensity and the shape of the period. ' +
      'shiftRunConfigOf never reads it; Save as new is what turns it into something pattern can select.'),
  'viewer.editingPatternId': control(
    'presentation',
    'Which pattern the traffic editor is pointed at. Names the draft’s subject and reaches no run.',
  ),
  'viewer.machineSpec': latent(
    'viewer.savedClasses',
    'The machines editor’s draft — speeds, acceleration, jerk, the load band. Realised by Save as ' +
      'new class, which is the one save that then reaches a run with no further selection.',
  ),
  'viewer.editingClassId': control(
    'presentation',
    'Which machine class the machines editor is pointed at. Names the draft’s subject and reaches no run.',
  ),
  'viewer.buildingSpec': latent(
    'viewer.savedBuildings',
    'The building editor’s draft — elevation, shafts, zones, transports. Realised by Save as new.',
  ),
  'viewer.editingBuildingId': control(
    'presentation',
    'Which building the building editor is pointed at. withBuilding re-seeds the draft only when the ' +
      'draft is pristine, so this pointer does not silently discard five minutes of dragging.',
  ),

  /* -------------------------------------------------------------- viewer: outputs */
  'viewer.recording': output(
    'The run the shell produced. Written by runShift, read by every surface, controlled by nobody.',
  ),
  'viewer.report': output('The day sheet, built by closeShift from the whole recording rather than from the playhead.'),
  'viewer.withheld': output(
    'What the last run refused to configure, from shiftRunPatch. Shown beside the event note, never swallowed.',
  ),
  'viewer.tomorrow': output(
    'The between-day beat (issue #91): the day that closed, what changed overnight, and what ' +
      'tomorrow is under. Built by closeShift from the closed day plus tomorrowFactsOf, which ' +
      'resolves tomorrow’s building rather than multiplying today’s caption. An output and not a ' +
      'control — nothing a player moves writes it, and it moves no leg: pressing Open the doors is ' +
      'what advances viewer.week, and that field is where the between-days probe already lives.',
  ),

  /* ------------------------------------------------------------------- settings */
  'settings.reduceMotion': control(
    'presentation',
    'Suppresses the 60 Hz stage animation. Structurally unable to reach a run: shiftRunConfigOf takes ' +
      'a ViewerState and Settings is not one of its inputs.',
  ),
  'settings.showEnergyAxis': control(
    'presentation',
    'Shows the energy proxy beside the wait figures — beside, never folded into a grade (§ D106). ' +
      'A display choice about a figure the run already computed.',
  ),
  'settings.playbackSpeed': control(
    'presentation',
    'How fast the recording is played back. Simulated time is already fixed by the time playback ' +
      'starts, so this cannot move a leg even in principle.',
  ),
  'settings.theme': control(
    'presentation',
    'Light, dark or the system’s. Drawing only, and the only one of the four settings whose sink ' +
      'would have to be built rather than merely connected — the stylesheet has one palette.',
  ),

  /* ------------------------------------------------------------------ free play */
  'free-play.buildingId': control(
    'between-games',
    'The menu’s name for viewer.buildingId. The six free-play keys are a *claim* that Start writes ' +
      'these six viewer fields and nothing else — which is the claim docs/16 § 5 clause 3 refutes.',
  ),
  'free-play.dispatcherProfileId': control(
    'between-games',
    'The menu’s name for viewer.dispatcherId, and part of the leaderboard board’s own identity — so ' +
      'two players who pick different dispatchers are not competing, they are on different boards.',
  ),
  'free-play.demandTemplateId': control(
    'between-games',
    'The demand template, one of the two axes the pattern editor’s vocabulary cannot express.',
  ),
  'free-play.arrivalRatePctPop5min': control(
    'between-games',
    'The arrival rate, or null for the building’s own profile — a distinct selection rather than a ' +
      'missing one, and hashed as one.',
  ),
  'free-play.durationS': control(
    'between-games',
    'The menu’s name for viewer.shiftLengthS. No longer chosen on its own: since § D286 it is the ' +
      'length of whichever part of the day was picked, written by the same control as ' +
      'free-play.windowStartS.',
  ),
  'free-play.windowStartS': control(
    'between-games',
    'Which part of the day the run covers, with durationS — the menu’s name for ' +
      'viewer.windowStartS. between-games rather than within-day: picking a different part of the ' +
      'day mid-week is choosing which exam to sit after seeing the questions. null is the whole ' +
      'period and is a selection rather than a missing one.',
  ),
  'free-play.seed': control(
    'between-games',
    'The seed as decimal digits. A string because a seed is an identity rather than a quantity, and ' +
      'because the server replays it and it has to survive JSON and a database byte for byte.',
  ),

  /* ----------------------------------------------------------------- menu shell */
  'menu.screen': control(
    'presentation',
    'Which menu screen is showing. Navigation; the reducer next door is the sink.',
  ),
  'menu.history': output(
    'The screens to return through, written by navigate and read by back. A stack rather than a ' +
      'parent pointer, because Free Play is reachable from two places that go back to different ones.',
  ),
  'menu.settings': output('A container. Its members are scoped under the settings. prefix.'),
  'menu.freePlay': output('A container. Its members are scoped under the free-play. prefix.'),
  /*
   * A **container with no prefix of its own**, and that difference from `menu.freePlay` is the
   * whole shape of a challenge: the run is the server's, so there is no `challenge.building`,
   * `challenge.seed` or `challenge.duration` for the table to scope. What a player writes is one
   * competitive axis and one way of ordering a published board, and both are declared below.
   */
  'menu.challenge': output(
    'A container. Its two members are the dispatcher a challenge is attempted with and the metric ' +
      'its board is ordered on; everything else about a challenge run is issued by the server.',
  ),
  'challenge.dispatcherProfileId': control(
    'between-games',
    'The one axis a challenge leaves open, and the reason its board is about dispatch rather than ' +
      'seed luck. Between-games because it is the run’s identity: changing it does not adjust a ' +
      'figure, it means the seeds already run on this browser are of a different configuration.',
  ),
  'challenge.metric': control(
    'presentation',
    'Which of the server’s four metrics the board is ordered on. It re-orders rows that are ' +
      'already published and changes no figure on any of them — and the four sit beside one ' +
      'another rather than being blended, which is § D106 at the board.',
  ),
});
