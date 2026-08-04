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
  'viewer.outOfServiceCarIds': control(
    'within-day',
    'Cars the reader took out of service by clicking a badge. Re-runs the day; the CLI has no flag ' +
      'that holds a car, so a run carrying one is not reproducible from its selection.',
  ),

  /* ------------------------------------------------------- viewer: the day boundary */
  'viewer.week': control(
    'between-days',
    'The contract, the day, the streak and what has been banked. day drives grownBuilding’s 11 %/day ' +
      'and eventFor’s twist, so it is the one field that must move only when the doors open on tomorrow.',
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
    'The menu’s name for viewer.shiftLengthS. Cross-checked against the chosen template’s own ' +
      'declared minimum in freePlayIssues, because constant-iso needs two hours to leave a window.',
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
});
