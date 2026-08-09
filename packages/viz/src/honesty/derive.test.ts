/**
 * The surface set is **derived**, and an unclassified producer is red.
 *
 * This is the file [§ D163](../../../../DECISIONS.md)'s *"derive the surface set, do not list
 * it"* lives in. It computes the set of player-facing text producers from the source tree and
 * partitions it into two, exhaustively:
 *
 * - **driven** — named in some `SURFACE_ADAPTERS` entry's `covers`, and therefore rendered on
 *   every case of every campaign;
 * - **excluded** — named in {@link NOT_PLAYER_FACING} with a reason.
 *
 * Anything in neither fails this test. So a new text producer is unchecked → red, which is the
 * clause the decision spells out: *"a hand-written parity list … would fail the same way —
 * silently, when a ninth failure state is added."*
 *
 * Three further guards keep the partition from rotting in the other direction:
 *
 * 1. **No stale coverage.** An adapter may not claim a declaration the derivation does not find —
 *    a `covers` entry for a renamed export is a claim about nothing.
 * 2. **No stale exclusion.** An exclusion for a declaration that no longer exists is deleted, not
 *    kept "just in case": a list of ghosts is how a list stops being read.
 * 3. **No overlap.** A declaration may not be both driven and excluded.
 */

import { describe, expect, it } from 'vitest';

import { coveredDeclarations, SURFACE_ADAPTERS } from './surfaces.js';
import { deriveProseLiterals, deriveTextProducers } from './derive.test-helper.js';
import { probabilityWordIn } from '../campaign/words.js';

/**
 * Every derived producer the search does **not** drive, with the reason it does not.
 *
 * Grouped by why, because the reasons genuinely repeat and a hundred hand-written sentences would
 * be a hundred places to stop reading. Every name is still listed individually: a group is a
 * shared reason, never a pattern that could quietly absorb a new export.
 */
const NOT_PLAYER_FACING: readonly { readonly reason: string; readonly ids: readonly string[] }[] =
  Object.freeze([
    {
      reason:
        'DOM-bound. These mount the page and author their status text inline, so they cannot be ' +
        'driven under Node — `boundaries.test.ts` confines the DOM to `dev/` precisely so the rest ' +
        'of the package stays testable without a jsdom. Their authored literals are swept ' +
        'statically below, which is weaker than driving them and is stated as a limitation rather ' +
        'than presented as coverage.',
      ids: [
        'dev/batchPanel.ts#mountBatchPanel',
        'dev/campaignPanel.ts#mountCampaignPanel',
        'dev/editor.ts#mountEditor',
        'dev/parameterForm.ts#mountParameterForm',
        'dev/parameterForm.ts#collectFormSource',
        'dev/parameterForm.ts#formStatusLine',
        'dev/data.ts#loadBrowserResources',
        'dev/data.ts#loadCampaign',
        'dev/data.ts#resolveEdited',
        'dev/motion.ts#REDUCED_MOTION_QUERY',
        'dev/motion.ts#prefersReducedMotion',
        'dev/motion.ts#shouldAutoplay',
        'dev/motion.ts#shouldAutoplayWith',
        /*
         * The design refactor's three mounts. Each is the DOM half of a split whose **pure** half
         * is driven: `RAIL_VIEW` renders everything `mountLeftRail` writes, `REPORT_PANEL`
         * everything `mountReport` writes, `SCENARIOS` every card `mountScenarios` instantiates.
         * `mountScenarios` is the one that authors a sentence of its own — the dashed sixth card's
         * *"Build your own scenario"* copy, which is inline and therefore reaches only the static
         * sweep below. That is a stated limitation, not coverage.
         */
        'dev/leftRail.ts#mountLeftRail',
        'dev/reportPanel.ts#mountReport',
        'dev/scenariosPanel.ts#mountScenarios',
        'dev/rightRail.ts#mountRightRail',
        'dev/buildingEditor.ts#mountBuildingEditor',
        'dev/dispatcherEditor.ts#mountDispatcherEditor',
        'dev/machinesEditor.ts#mountMachinesEditor',
        'dev/trafficEditor.ts#mountTrafficEditor',
        /*
         * Reads a mounted row back out of the document to update it in place. There is no string
         * in it at all — its literals are the class selectors it queries by — and it cannot run
         * without a document.
         */
        'dev/dispatcherEditor.ts#sliderHandlesOf',
        /*
         * § D214 § 2's menu. Same split as the design refactor's three mounts above, and the same
         * honest accounting: the parts of the menu that *say something about a run* are pure and
         * are driven — `MENU` renders `catalogueOf`'s building details, every `freePlayIssues`
         * refusal and `canStart`'s label, on a whole selection and a deliberately broken one. What
         * is left here is the row copy and the settings note, authored inline, reaching only the
         * static sweep below. That is weaker than driving them and is stated as a limitation.
         */
        'dev/menuPanel.ts#renderMenu',
      ],
    },
    {
      reason:
        'Diagnostics for a failed **save**, and for the shape check beneath a failed restore — ' +
        'developer strings on the same footing as `SCOPE_OF`’s `why`. Nothing puts one on a screen: ' +
        '`saveSession` refuses in a value the shell drops, `jsonRoundTripIssue` and `snapshotIssue` ' +
        'name a path inside an envelope, and `SESSION_KEY` is a storage key. ' +
        '**`loadSession` is deliberately no longer in this list.** Its sentences now reach a player, ' +
        'quoted by `persist/notice.ts#restoreNoticeFor` on the `parse` and `shape` arms, and the ' +
        '`RESTORE_NOTICE` adapter drives it through three broken stores for exactly that reason. ' +
        'This entry’s previous reason ended *“the day that sentence reaches a screen it stops being ' +
        'excludable, and this reason stops being true”* — that day arrived with the notice, and the ' +
        'narrowing above is what it cost.',
      ids: [
        'persist/jsonSafety.ts#jsonRoundTripIssue',
        'persist/session.ts#saveSession',
        'persist/types.ts#SESSION_KEY',
        'persist/validate.ts#snapshotIssue',
      ],
    },
    {
      reason:
        'A component factory. `dev/dom.ts` produces no sentence of its own — every string it puts ' +
        'on the page is one it was handed by a caller, and every one of those callers is either ' +
        'driven here or excluded above. Its own literals are class names, ARIA attribute values ' +
        'and the two-letter `on`/`off` state word, which is KB-15\'s second signal for a toggle ' +
        'rather than a claim about a run. The module says so itself: *"every helper below is ' +
        'deliberately decision-free … there is nothing in it a test would want to assert"*, and ' +
        'the honest consequence is that driving it would put the caller\'s string into the corpus ' +
        'twice under the factory\'s name.',
      ids: [
        'dev/dom.ts#chip',
        'dev/dom.ts#chipRow',
        'dev/dom.ts#figure',
        'dev/dom.ts#fillPlate',
        'dev/dom.ts#pick',
        'dev/dom.ts#plateRow',
        'dev/dom.ts#slider',
        'dev/dom.ts#toggle',
        /*
         * The exported report card's painter — `dev/dom.ts`'s case exactly, one layer over. Every
         * string it puts on the bitmap is one `reportCardOf` handed it, and `reportCardOf` is
         * **driven** by the `REPORT_CARD` adapter, both sheet shapes and both arms of the recipe.
         * Its own literals are the seven font declarations; it is derived because
         * `600 15px ui-monospace, SFMono-Regular, Menlo, monospace` reads as adjacent words, which
         * is `render/theme.ts#themeFor`'s reason a few entries up. Driving it would put the
         * caller's sentences in the corpus twice under the painter's name.
         */
        'render/reportCard.ts#drawReportCard',
      ],
    },
    {
      reason:
        'Navigation state and page plumbing, not a claim about a run. `dev/surfaces.ts` decides ' +
        'which tab is present, which is focusable and whether the right rail is a column or a ' +
        'drawer; its one authored string is the drawer toggle — `Controls ▸` / `Close controls` — ' +
        'which names a control rather than a result, and `surfaces.test.ts` asserts it directly ' +
        'alongside the breakpoint it must agree with. `dev/state.ts` is configuration: it answers ' +
        '*what is the simulator being asked for*, and it now authors no string table at all — ' +
        '`SHIFT_LENGTHS` was its one, and § D286 deleted it in favour of `menu/partsOfDay.ts`, ' +
        'whose labels are player-facing and are **driven** by the `MENU` adapter rather than ' +
        'excused here. What is left returns ids. Both modules are derived only because the ' +
        'two-adjacent-words scanner reads hyphenated ids (`garden-apartments`, `lunch-two-way`) ' +
        'as prose.',
      ids: [
        /*
         * `shift/incidents.ts` is the same false positive one directory over. It returns
         * `ServiceEventConfig` values — an `atS`, a car id and a `mode` — and authors no sentence at
         * all; it is derived only because `'out-of-service'` and `'in-service'` are hyphenated ids
         * that the two-adjacent-words scanner reads as prose. The *player-facing* half of an
         * incident is its event's `note`, which `SHIFT_EVENTS` owns and `RAIL_VIEW` drives, and the
         * refusals it can produce are `ShiftRunPatch.withheld`'s, authored in `events.ts`.
         */
        'shift/incidents.ts#serviceEventsFor',
        'shift/incidents.ts#withIncidents',
        /*
         * `render/theme.ts` is the same false positive again, and the most clear-cut instance of it:
         * it returns a record of CSS custom-property names to hex values — `--edge-mid` to
         * `#26303d` — and the scanner reads the hyphenated token names as adjacent words. There is
         * no sentence in the module and no figure; the palette is asserted against `index.html`'s
         * own `:root` in both directions by `theme.test.ts`, which is a stronger check than a string
         * search over something no reader reads.
         */
        'render/theme.ts#themeFor',
        /*
         * `summaryFigureIds` is the *order* the figures are drawn in, not the figures. It returns an
         * array of ids — `long-waits`, `energy` — and is derived only because those ids are
         * hyphenated. Its sibling `runSummaryFigures`, which produces the labels, values and notes a
         * reader actually sees, is driven by the `RUN_SUMMARY` adapter as it always has been.
         */
        'render/runSummary.ts#summaryFigureIds',
        /*
         * `menu/enterFreePlay.ts` joined this list the moment it gained `playMode: 'free-play'` —
         * a hyphenated id, read by the two-adjacent-words scanner as prose. It returns a
         * `ViewerState` and authors no sentence; the refusal a player actually sees when a
         * selection cannot start is `freePlayIssues`', which `MENU` drives on a broken selection.
         */
        'menu/enterFreePlay.ts#enterFreePlay',
        'dev/surfaces.ts#applyDrawerState',
        'dev/surfaces.ts#applyRailState',
        'dev/surfaces.ts#applySurfaceState',
        'dev/surfaces.ts#drawerStateFor',
        // Derived only through `drawerStateFor`'s toggle label; it returns a boolean and
        // authors nothing. Same plumbing, same reason — SH-12/KX-11's Escape decision.
        'dev/surfaces.ts#escapeClosesDrawer',
        // SH-09's serializer. Its output is a URL query string — `?seed=42&tab=report` — and its
        // literals are the seven param keys, single words all; it is derived only because the
        // scanner keeps a template substitution's text (`params.toString`) and reads it as
        // adjacent words. The keys' agreement with the reader is what `main.test.ts`'s
        // round-trip asserts.
        'dev/main.ts#deepLinkSearchOf',
        /*
         * `shareLinkOf` is the same false positive one line down: its whole body is
         * `` `${base}${deepLinkSearchOf(state, defaults)}` ``, and the scanner keeps a template
         * substitution's text and reads `deepLinkSearchOf(state, defaults)` as adjacent words. It
         * authors no sentence at all — its `ok` arm is a URL and its refusal arm is
         * `runIdentityIssues`', excluded below under its own name and driven through the report
         * card, which quotes those sentences on the one surface that leaves the browser.
         */
        'dev/main.ts#shareLinkOf',
        'dev/state.ts#initialState',
        /*
         * The other half of the same answer — issue #99. `PREFERRED_OPENING_BUILDINGS` is a list of
         * building **ids** (`chancery-house`, `garden-apartments`) that `initialState`'s neighbour
         * above and `menu/menu.ts#initialMenuState` resolve the opening selection through; the
         * scanner reads the hyphens as word breaks, exactly as it does for `initialState` itself.
         * Its sibling `PREFERRED_VIEWER_DISPATCHERS` is not derived at all, because `collective`
         * and `eta` carry no separator — which is the whole of the difference between them. What a
         * player *reads* about the building it names is `CatalogueEntry.name` and `.detail`, both
         * driven by the `MENU` adapter.
         */
        'dev/defaults.ts#PREFERRED_OPENING_BUILDINGS',
        /*
         * Returns a demand template **id** — `rise-and-fall`, `office-day` — so the scanner reads
         * the hyphen as a word break and nothing else. It authors no sentence; what a player reads
         * about the template it names is the part labels `partsOfDay` produces from it, which the
         * `MENU` adapter drives.
         */
        'dev/state.ts#shiftDemandTemplateId',
        /*
         * Its § D318 wrapper, excluded for the same reason and no other: it returns that same id
         * plus a nullable number, and the scanner reads `rise-and-fall`'s hyphen as a word break.
         *
         * Worth saying which way the honesty question runs here, because it is the opposite of the
         * usual one. This function exists so that the leaderboard submission and the Day report's
         * subject describe the run **that was simulated** rather than what the menu currently has
         * selected — so it is machinery *for* honesty rather than a surface to be swept, and what a
         * player reads about the template it names is drawn elsewhere and driven elsewhere.
         */
        'dev/state.ts#shiftSubmittedSelection',
        'dev/state.ts#shiftRunConfigOf',
        /*
         * § D231's three, here for `enterFreePlay`'s reason above and no other: the scanner reads
         * the `PlayMode` members they switch on — `shift-week`, `free-play` — as prose, because
         * they are hyphenated. They return a boolean and three `WeekState`s between them and author
         * no sentence at all. What a player is *told* about a free-play run is the report sheet's
         * `single-run` framing, which the `REPORT_PANEL` adapter already drives on both subjects.
         *
         * `weeksForSession` was `weekForSession` until issue #107 gave it a second week to hold
         * back; it switches on the same union and still authors nothing.
         */
        'dev/state.ts#advancesTheWeek',
        'dev/state.ts#closedWeekOf',
        'dev/state.ts#weeksForSession',
        /*
         * The fourth of the same shape — GitHub issue #125. `FREE_PLAY_CONTRACT_ID` is the string
         * `free-play`, and it is derived for the one reason every id above it is: the hyphen reads
         * as a word break. Its two siblings in the same file, `ENDLESS_CONTRACT_ID` and
         * `SANDBOX_CONTRACT_ID`, are not derived at all, because `endless` and `sandbox` carry no
         * separator — which is the whole of the difference between them.
         *
         * What a player *reads* about a week carrying it is `coachWeekLines`' fourth branch —
         * **Free play** on the eyebrow — and that is driven rather than excused: `surfaces.ts`
         * renders `coachWeekLines` on a free-play week beside the scenario, endless and sandbox
         * ones, for the reason that sweep already states about the branches nothing could print.
         */
        'shift/week.ts#FREE_PLAY_CONTRACT_ID',
      ],
    },
    {
      reason:
        'TP-13’s provenance emitter. Its `ok` line is CLI flags — machine text the CLI parses, ' +
        'pinned flag-for-flag and leg-for-leg by `main.test.ts` — but its refusal reasons are ' +
        'authored sentences that reach `#status` through `copyProvenance`, so this exclusion is ' +
        'a stated limitation, not a claim of coverage: the sentences are swept statically below ' +
        'like the DOM-bound mounts’ status text, which is weaker than driving them. An adapter ' +
        'that renders the refusals per campaign case is the better home, and belongs to the ' +
        'honesty lane rather than to a hand-edit here.',
      ids: ['dev/main.ts#provenanceLineOf'],
    },
    {
      reason:
        'TP-08’s seed parse (§ D198). Its `run` and `draw` arms carry no prose; the refuse arm ' +
        'authors one sentence that reaches `#status` through the seed field’s change handler — ' +
        'the same shape as `provenanceLineOf`’s refusals above, and the same stated limitation ' +
        'rather than a claim of coverage: the sentence is swept statically below, and ' +
        '`main.test.ts` pins all three arms, including that the refusal names what was typed. ' +
        'An adapter driving the refusal per campaign case belongs to the honesty lane, not to a ' +
        'hand-edit here.',
      ids: ['dev/main.ts#seedEntryOf'],
    },
    {
      reason:
        'The change-scope model (`docs/16`, § D216). `CHANGE_SCOPES` and `PLAY_MODES` are the two ' +
        'id tuples every exhaustive switch in `scope/` walks — the same id-table case as ' +
        '`campaign/types.ts#FAIL_STATES`. `SCOPE_OF`’s `why` field is **developer** prose: it is ' +
        'the argument for a field’s scope, addressed to whoever changes that field, and it reaches ' +
        'no screen — `surface.test.ts` asserts every row carries one and `scope.test.ts` decides ' +
        'whether the row is true by running both arms, which is a stronger check than a string ' +
        'search over a sentence no player reads. `permits` returns a boolean and authors nothing. ' +
        '`COMMITMENTS` is a third id tuple of the same kind and `commitmentOf` returns one of its ' +
        'members — both derived only because a hyphen reads as a word break, so `re-runs-now` is ' +
        'two adjacent words to the scanner’s eye and `docs/16`’s own `within-day` is too. The ' +
        'sentences a player actually reads from that code are authored beside each control, in ' +
        'the five mounts already excluded above as DOM-bound; issue #104’s note is that, and ' +
        '`commitment.ts`’s own docstring states the limitation — a mount’s copy reaches the static ' +
        'sweep and not the driven one.',
      ids: [
        'scope/types.ts#CHANGE_SCOPES',
        'scope/types.ts#PLAY_MODES',
        'scope/surface.ts#SCOPE_OF',
        'scope/permits.ts#permits',
        'scope/commitment.ts#COMMITMENTS',
        'scope/commitment.ts#commitmentOf',
        /*
         * GitHub issue #129's two, and both are the `SCOPE_OF` case above rather than a new one.
         *
         * `EXPRESSIBLE_IN_A_SELECTION` names the `between-games` fields a `RunSubmission` and a deep
         * link carry, one row per field, and its values are **developer** prose in exactly
         * `SCOPE_OF.why`'s sense: each is the argument for why that field travels, addressed to
         * whoever changes the wire, and it reaches no screen. `runIdentity.test.ts` decides whether
         * a row is true by reading `packages/server/src/leaderboard/submission.ts`'s own source,
         * which is a stronger check than a string search over a sentence no player reads.
         *
         * `fieldsAnsweredFor` returns `SurfaceKey`s and field names — `viewer.commissioning`,
         * `outOfServiceCarIds` — and authors no sentence at all. It is derived only because the
         * hyphen and the dot read as word breaks, which is the same false positive `commitmentOf`
         * is excluded for two lines up.
         */
        'scope/runIdentity.ts#EXPRESSIBLE_IN_A_SELECTION',
        'scope/runIdentity.ts#fieldsAnsweredFor',
      ],
    },
    {
      reason:
        'The refusal sentences `provenanceLineOf` used to author itself, moved one layer down by ' +
        '`docs/16` S5 so the leaderboard’s submit path cannot grow a second copy of them. They ' +
        'reach `#status` through `copyProvenance` exactly as before, so this inherits the exclusion ' +
        'directly above it and inherits its limitation too: swept statically, not driven, which is ' +
        'weaker and is said rather than dressed up. What changed is that the better fix got ' +
        'cheaper — these sentences are now produced by a pure function of a state and the loaded ' +
        'resources, so the adapter that exclusion has been asking for no longer needs a document. ' +
        '`CARRY_CHECKS` is the same sentences and not a second set: GitHub issue #129 moved the ' +
        'body of `runIdentityIssues`’ `switch` into a table keyed by field, so that the key set ' +
        'became a value a test could compare against the fields the walk visits — the assertion ' +
        'this module’s docstring claimed and did not have. Every string in it is returned by ' +
        '`runIdentityIssues` and by nothing else, so it reaches a reader by exactly the route above ' +
        'and is accounted for by exactly the same limitation.',
      ids: ['scope/runIdentity.ts#runIdentityIssues', 'scope/runIdentity.ts#CARRY_CHECKS'],
    },
    {
      reason:
        'A vocabulary or a schema, not prose. `GOAL_OBSERVATION_IDS` and `SHIFT_EVENT_IDS` are the ' +
        'id tuples the two shift unions are derived from — the same id-table case as ' +
        '`campaign/types.ts#FAIL_STATES` above — and every event a reader sees is its ' +
        '`ShiftEvent.name` and `note`, both of which `SHIFT_REPORT` drives. ' +
        '`contract/types.ts#VIZ_SCHEMA_VERSION` is the integer 8; it is derived only because the ' +
        'declaration scanner gives a `const` the span up to the next `const`, which in a file of ' +
        'interfaces swallows the string-literal unions of the types below it. A version number ' +
        'reaches a reader only through `record/document.ts#verifyReplay`, which is driven.',
      ids: [
        'shift/types.ts#GOAL_OBSERVATION_IDS',
        'shift/types.ts#SHIFT_EVENT_IDS',
        'contract/types.ts#VIZ_SCHEMA_VERSION',
      ],
    },
    {
      reason:
        'A stylesheet value. `SCENARIO_ART` and `FALLBACK_ART` are CSS gradients, derived because ' +
        '`linear-gradient` reads as two adjacent words. This is `mode/disclosure.ts#rowClassesOf`\'s ' +
        'case exactly: a gradient asserts nothing to a reader, and driving it would put ' +
        '`linear-gradient(180deg,#1a2430,#10151e 70%)` into the corpus as though a surface had ' +
        'said it. The card that carries the swatch is driven — `scenarioCardsOf` — and the ' +
        'scenariosPanel module states in its own docstring that the art *"makes no claim about"* ' +
        'the building it decorates.',
      ids: [
        'dev/scenariosPanel.ts#SCENARIO_ART',
        'dev/scenariosPanel.ts#FALLBACK_ART',
        /*
         * The 3 px track under the occupancy slider — a `linear-gradient` whose stops are the
         * value and the over-capacity threshold. The *sentence* that goes with it is
         * `overCapacityNote`, which `EDITOR_PANELS` drives; the gradient is the second signal, and
         * KB-15's point is that it is never the only one.
         */
        'dev/buildingEditor.ts#specTrackOf',
        /*
         * The transport timeline's segment palettes, exported so the traffic editor's preview
         * strip can draw the same bands rather than keep a second copy of them — the duplication
         * `dev/tokens.test.ts` exists to stop. Six background/foreground pairs assert nothing; the
         * segment's own `label` and `title` are prose and `LIVE_RAIL` drives both.
         *
         * The two singles joined the group in § D251 and the reason is worth stating, because they
         * were classified by accident before it. Every value in all three used to be a hex, and a
         * hex is not prose to {@link PROSE}'s eye — `PHASE_PALETTE` was derived only because its
         * *keys* are `'ramp-up'` and `'ramp-down'`. The values are `var(--phase-quiet)` and the
         * rest now, which read as prose on the hyphen, so the two that had been silently
         * unclassified became visibly unclassified. Their reason was always this one.
         */
        'live/timeline.ts#PHASE_PALETTE',
        'live/timeline.ts#QUIET_PALETTE',
        'live/timeline.ts#UNKNOWN_PALETTE',
      ],
    },
    {
      reason:
        'Returns a boolean, or a config block with no sentence in it. `specIsDirty` and ' +
        '`machineIsDirty` answer *has the reader changed anything* and are derived only through ' +
        'the transitive clause — they call `specFromProfile` / `specFromClass`, whose `Copy of …` ' +
        'name is the prose, and that name **is** driven by the `AUTHORING` adapter. ' +
        '`demandFromSpec` returns the `SimulationDemandOptions` fragment the runner consumes; the ' +
        'reader sees that choice as `patternSummary` and as `PEAK_ORDER_INFO`\'s label and note, ' +
        'both driven. Same group as `batch/runBatch.ts#runBatch` above, for the same reason.',
      ids: [
        'authoring/dispatcherSpec.ts#specIsDirty',
        'authoring/machineSpec.ts#machineIsDirty',
        'authoring/patternSpec.ts#demandFromSpec',
      ],
    },
    {
      reason:
        'An id, key or glyph table. Derived because the scanner admits any two adjacent words and ' +
        'a few of these carry a phrase; none of them is a sentence a player reads, and each is ' +
        'reported through a surface that *is* driven.',
      ids: [
        'access/zoning.ts#CREDENTIAL_STATES',
        'access/zoning.ts#STATE_GLYPHS',
        'campaign/types.ts#FAIL_STATES',
        'controls/render.ts#helpIdOf',
        'controls/render.ts#inputIdOf',
        'render/runSummary.ts#FIGURE_ORDER',
        'render/runSummary.ts#LONG_WAITS_ID',
        'render/runSummary.ts#SERVICE_LEVEL_ID',
        'scenario/goals.ts#GOAL_JUDGEMENT',
        'scenario/goals.ts#GOAL_KINDS',
        'scenario/goals.ts#GOAL_READS',
        'scenario/goals.ts#GOAL_TAKES_THRESHOLD',
        'scenario/goals.ts#isPerReplicationGoal',
        'scenario/candidates.ts#CANDIDATE_GOALS',
        'scenario/candidates.ts#CANDIDATE_SCENARIOS',
        /*
         * The six menu screen ids the `MenuScreen` union is derived from — `main`, `campaign`,
         * `free-play`, … — derived here only because `free-play` reads as two adjacent words. What
         * a player sees is `titleOf`'s heading, authored in `menuPanel.ts` and swept statically
         * with the rest of that mount's copy.
         */
        'menu/types.ts#MENU_SCREENS',
        /*
         * The account screen's shape used to be here — `EMPTY_FORM`, `SIGNED_OUT` and
         * `MAX_DISPLAY_NAME` — and it is gone rather than moved.
         *
         * They were producers by accident: the two-adjacent-words scanner read the mode id
         * `sign-in` as prose, and `MAX_DISPLAY_NAME`'s span reached the `'sign-in' | 'register'`
         * union beneath it. § D241 § 7 deleted the mode, because a form that asked for a display
         * name only when the address was new would tell the person filling it in whether the
         * address was new. With no mode there is no string in any of the three, so the derivation
         * no longer finds them and an exclusion for them would be a ghost.
         */
      ],
    },
    {
      reason:
        'Author-facing or load-time validation. These refuse a malformed `data/` document to the ' +
        'person editing it; they never reach a player, and `campaign.test.ts` and ' +
        '`goalRates.test.ts` already mutate the real parsed campaign twelve ways to prove they ' +
        'fire.',
      ids: [
        'campaign/parse.ts#CampaignError',
        'campaign/parse.ts#editableIdsOf',
        'campaign/parse.ts#parseCampaign',
        'campaign/parse.ts#validateCampaign',
        'scenario/published.ts#classOfCounts',
        'scenario/published.ts#validatePublishedGoalRates',
        'editor/editorValidate.ts#validateBuildingText',
      ],
    },
    {
      /*
       * The exclusion this repository's reference-data rule *requires*, rather than one it
       * tolerates. `TransportModeConfig.traversalTimeS` is a reference value and its own contract
       * says it "must be cited in the declaring building's `$comment`", so `transportModesOf`
       * writes the EN 115-1 derivation onto every escalator it emits. That comment is a **JSON
       * document field** — the same field `data/buildings/vertical-city.json` writes by hand four
       * times, which no honesty sweep has ever looked at because `data/` is not a viewer surface.
       *
       * Driving it would be a category error in the direction that costs something: it would put
       * *"inclination 30 degrees, which BS EN 115-1 makes the only permitted angle above a 6 m
       * rise"* into the player-facing corpus and judge a standards citation by R1/R2/R13, which
       * are written for what a reader is shown about a run. The same argument `elementMap.ts`'s
       * exclusion makes, and answered the same way: the wording is asserted **directly**, in
       * `authoring.test.ts`, in both branches — the derived one for the arithmetic it prints, and
       * the hand-set one for the sentence that refuses to call itself a citation.
       *
       * `specIsDirty` is here only through the transitive clause: it returns a boolean, and it
       * reaches this text because `normalize` compares the emitted document. Its sibling
       * `dispatcherSpec.ts#specIsDirty` is excluded a few groups above for that same shape.
       */
      reason:
        'A `data/` document field, not a viewer surface. `transportModesOf` writes the citation ' +
        '`TransportModeConfig.traversalTimeS` requires into each emitted escalator’s `$comment`, ' +
        'which is read by whoever opens the downloaded JSON and is never shown to a player — the ' +
        'same standing as the hand-written `$comment`s in `data/buildings/vertical-city.json`. ' +
        'Its wording is asserted directly by `authoring.test.ts`, in both the derived and the ' +
        'set-by-hand branch, which is what makes this an exclusion rather than a gap. ' +
        '`specIsDirty` returns a boolean and is derived only through the transitive clause.',
      ids: ['authoring/buildingSpec.ts#transportModesOf', 'authoring/buildingSpec.ts#specIsDirty'],
    },
    {
      reason:
        'Produces data, not prose. Derived only through the transitive clause — it names a helper ' +
        'that has a sentence in it — and its own return value carries ids, counts or geometry. ' +
        'Every string it does carry reaches a player through a surface that is driven.',
      ids: [
        'batch/runBatch.ts#runBatch',
        'batch/runBatch.ts#firstTraceDisagreement',
        'frame/overlay.ts#queueAt',
        'frame/overlay.ts#landingAssignmentsAt',
        'frame/sequence.ts#frameSequence',
        'frame/sequence.ts#frameTimes',
        'record/recordRun.ts#recordRun',
        'record/document.ts#readRecordingDocument',
        'editor/editorEdits.ts#blankBuilding',
        'editor/editorEdits.ts#serializeBuilding',
        /*
         * Returns a boolean, or a record whose prose came from somewhere already driven.
         * `canSubmitForm` answers *may this be sent* and is derived only through `formIssues`,
         * which `MENU` drives directly.
         *
         * `linkRetryInMsOf` returns a **number of milliseconds** out of a 429 body. Its one
         * literal is the wire code `too-many-link-requests`, which the scanner reads as two
         * adjacent words and which no player ever sees: the sentence beside that refusal is the
         * server's, carried by `Failure.detail` and shown unrewritten, because § D242 § 4 has the
         * server word it — it names a duration and deliberately does not name which of the two
         * budgets was spent.
         *
         * `signedOut` is no longer here and is not a gap: it passes the caller's notice through
         * unchanged and its one literal was `SIGNED_OUT`'s mode id, which § D241 § 7 deleted, so
         * the derivation no longer finds it at all.
         */
        'menu/account.ts#canSubmitForm',
        'menu/account.ts#linkRetryInMsOf',
        /*
         * Transport plumbing. `createClient` no longer authors a sentence — its three own wordings
         * moved to `CLIENT_FAILURES`, which `MENU` drives — and everything else it carries is the
         * *server's* prose, unrewritten on purpose: a rejection is not an accusation and the server
         * is the one place that decides how one is worded. `fetchTransport` builds a request and
         * has no string in it but header names.
         */
        'menu/client.ts#createClient',
        'menu/client.ts#fetchTransport',
      ],
    },
    /*
     * The mode-split lane's three, and the reason is stated **per name** rather than shared,
     * because the group is small and each one is excluded for its own reason. Everything else
     * `mode/` exports is driven: `disclosureItems` renders both projections of every item, and
     * `parityViolations` / `parityRefusal` run on exactly what was rendered.
     */
    {
      reason:
        'Produces a classification or a stylesheet hook, not a sentence — and each is checked ' +
        'where it is used rather than here. `rowClassesOf` returns CSS class names (`figure`, ' +
        '`figure-origin-suppression`, `figure-warning`); a class asserts nothing to a reader, and ' +
        'driving it would put "figure-warning" in the corpus as though a surface had said it. ' +
        '`disclosureClassOf` returns `must-show` or `may-hide` — § 4\'s line, which `parityViolations` ' +
        'is derived over and which is driven through it. `isViewMode` is a type guard over the ' +
        'two mode ids and returns a boolean.',
      ids: [
        'mode/disclosure.ts#rowClassesOf',
        'mode/types.ts#disclosureClassOf',
        'mode/types.ts#isViewMode',
      ],
    },
    {
      reason:
        'The offline measurement pipeline, not a viewer surface. `measureScenario` runs the ' +
        'across-seed campaign that *produces* `data/scenario-goals.json`; a player never calls it, ' +
        'and what it publishes is checked where it is read — `scenario/goalReport.ts` and ' +
        '`campaign/brief.ts`, both driven.',
      ids: ['scenario/measure.ts#measureScenario', 'scenario/measure.ts#publishedScenarioFor'],
    },
    {
      reason:
        'Returns the *facts* about why a goal cannot be judged and deliberately authors none of ' +
        'the words. Derived only because its literals are goal-kind ids and `GoalJudgement` keys, ' +
        'which the two-adjacent-words scanner reads as phrases. Carrying a sentence here would ' +
        'have been a third authored wording for one fact — `goalReport.ts` and `measure.ts` each ' +
        'phrase a withheld goal for the surface it appears on, and both of those are driven. So ' +
        'the exclusion is not "this is not player-facing text"; it is "this is where player-' +
        'facing text was kept out on purpose", and the two surfaces downstream are the coverage.',
      ids: ['scenario/goals.ts#asPerReplicationGoal'],
    },
    {
      reason:
        'About the page’s own markup, not about a run. `ELEMENT_IDS` is a table of element ids — ' +
        'the id/key case again, and derived only because hyphenated ids read as adjacent words. ' +
        '`MissingElementsError` reports which ids a document lacks, so it can only be seen when ' +
        'the viewer did not start; it makes no claim about a simulation, a statistic or a goal, ' +
        'and there is nothing for R1, R2 or R13 to be true or false of. `elementMap.test.ts` ' +
        'asserts its wording directly — the count, the total, every id, and the file to look in.',
      ids: ['dev/elementMap.ts#ELEMENT_IDS', 'dev/elementMap.ts#MissingElementsError'],
    },
    {
      reason:
        'Moves a string the player chose from one field of a `MenuIntent` to another, and authors ' +
        'none of its own. **The id/key case a third time**: every literal in it is a `case` tag of ' +
        'a discriminated union — `set-free-play`, `set-commissioning` — which the two-adjacent-' +
        'words scanner reads as a phrase because the tags are hyphenated. Nothing it returns is ' +
        'shown; what it returns is an intent, whose *value* is an option id `menu/screens.ts#screenOf` ' +
        'produced and the `MENU` adapter already sweeps, and whose effect on the screen arrives ' +
        'through `applyIntent` — driven, and covered there. Putting it in an adapter instead would ' +
        'have been a coverage claim for prose that does not exist.',
      ids: ['menu/screens.ts#withChosenValue'],
    },
  ]);

const excludedIds = new Set(NOT_PLAYER_FACING.flatMap((group) => group.ids));

describe('the surface set is derived from the source tree', () => {
  it('finds text producers across the package, not in one directory', async () => {
    // A derivation that collapsed to nothing would make every assertion below vacuous — the
    // fifth false-negative shape wave 8 found, arriving in the instrument that is supposed to
    // prevent it. So the shape of the derived set is asserted before it is used.
    const producers = await deriveTextProducers();
    expect(producers.length).toBeGreaterThan(60);
    const directories = new Set(producers.map((producer) => producer.module.split('/')[0]));
    expect(directories.size).toBeGreaterThanOrEqual(7);
    expect([...directories].sort()).toContain('render');
    expect([...directories].sort()).toContain('campaign');
  });

  it('classifies every derived producer as driven or excluded — an unclassified one is red', async () => {
    const producers = await deriveTextProducers();
    const covered = coveredDeclarations();
    const unclassified = producers
      .filter((producer) => !covered.has(producer.id) && !excludedIds.has(producer.id))
      .map((producer) => `${producer.id}  (${producer.direct ? 'own prose' : producer.evidence})`);
    expect(
      unclassified,
      'a player-facing text producer is in neither an adapter nor NOT_PLAYER_FACING. Add an ' +
        'adapter in surfaces.ts, or an exclusion with a reason — an unchecked surface is red, ' +
        'not skipped.',
    ).toEqual([]);
  });

  it('claims no coverage of a declaration the derivation does not find', async () => {
    const producers = new Set((await deriveTextProducers()).map((producer) => producer.id));
    const stale = [...coveredDeclarations()].filter((id) => !producers.has(id)).sort();
    expect(
      stale,
      'an adapter names a declaration that is not a derived text producer — it was renamed, ' +
        'deleted, or never produced prose. A `covers` entry for nothing is a coverage claim for ' +
        'nothing.',
    ).toEqual([]);
  });

  it('keeps no exclusion for a declaration that no longer exists', async () => {
    const producers = new Set((await deriveTextProducers()).map((producer) => producer.id));
    const ghosts = [...excludedIds].filter((id) => !producers.has(id)).sort();
    expect(ghosts, 'delete the exclusion; a list of ghosts is how a list stops being read').toEqual(
      [],
    );
  });

  it('never lists a declaration as both driven and excluded', () => {
    const overlap = [...coveredDeclarations()].filter((id) => excludedIds.has(id)).sort();
    expect(overlap).toEqual([]);
  });

  it('gives every exclusion a reason long enough to be one', () => {
    for (const group of NOT_PLAYER_FACING) {
      expect(group.ids.length, JSON.stringify(group.reason.slice(0, 40))).toBeGreaterThan(0);
      expect(group.reason.length, group.ids[0]).toBeGreaterThan(80);
    }
  });

  it('excludes only producers that still exist — a ghost exclusion is red', async () => {
    /*
     * The mirror of *every adapter is attached to something real*, which sits a few lines below and
     * has always been asserted. Exclusions had no such check, so an id whose producer was later
     * deleted stayed in {@link NOT_PLAYER_FACING} forever — carrying a reason for a decision about
     * a symbol that no longer exists, and quietly widening the exemption list against a future
     * producer that happens to take the same name.
     *
     * Not hypothetical: three ghosts accumulated behind `mode` and had to be removed by hand when
     * § D241 deleted the sign-in/register split. Nothing was red while they sat there.
     */
    const ids = new Set((await deriveTextProducers()).map((producer) => producer.id));
    const ghosts = [...excludedIds].filter((id) => !ids.has(id)).sort();
    expect(
      ghosts,
      'NOT_PLAYER_FACING names a producer that no longer exists. Delete the id — an exclusion ' +
        'outliving the thing it excused is the stale-assertion defect this repository counts, ' +
        'and it silently pre-approves whatever takes that name next.',
    ).toEqual([]);
  });

  it('negative control: an invented producer would be unclassified', async () => {
    // The classification test above passes trivially if `deriveTextProducers` returns things that
    // are always in one of the two sets. This asserts the partition can actually refuse.
    const covered = coveredDeclarations();
    const invented = 'render/newBanner.ts#drawTheNewBanner';
    expect(covered.has(invented) || excludedIds.has(invented)).toBe(false);
  });
});

describe('every adapter is attached to something real', () => {
  it('names at least one derived producer per adapter', async () => {
    const producers = new Set((await deriveTextProducers()).map((producer) => producer.id));
    for (const adapter of SURFACE_ADAPTERS) {
      expect(adapter.covers.length, adapter.id).toBeGreaterThan(0);
      expect(
        adapter.covers.some((id) => producers.has(id)),
        `${adapter.id} covers nothing the derivation found`,
      ).toBe(true);
    }
  });

  it('uses its own id as one of the declarations it covers', () => {
    for (const adapter of SURFACE_ADAPTERS) {
      expect(adapter.covers, adapter.id).toContain(adapter.id);
    }
  });
});

/**
 * R10 over the authored literals, including the surfaces the generated search cannot drive.
 *
 * The static half of the net. It reaches inside `dev/main.ts`'s function bodies — where the
 * viewer's status line is written — which the producer derivation cannot: an earlier version of
 * this sentence said main.ts *"has no exports"*, which stopped being true when
 * `waitLegendEntries`/`WaitLegendEntry` landed in declaration form (plus the export *clause* at
 * the bottom that exists for `main.test.ts`). The exported producers the derivation does find
 * there (`deepLinkSearchOf`, `provenanceLineOf`) are classified above; the inline
 * `ui.status.textContent = '…'` literals are what only this sweep sees.
 */
describe('R10 statically — no authored prose literal contains a probability word', () => {
  /**
   * The two literals that legitimately contain one, each with the reason it does.
   *
   * Kept as a two-entry list rather than as a regex carve-out: `campaign/words.ts` records that
   * *"a rule with one carve-out is a rule with a place to hide"*, so each exemption names its
   * file and its text and is asserted to still be there.
   */
  const KNOWN: readonly { readonly module: string; readonly contains: string; readonly why: string }[] =
    Object.freeze([
      {
        module: 'campaign/parse.ts',
        contains: 'a probability word; say a frequency over runs',
        why: 'the refusal `validateCampaign` gives an author who wrote one. Naming the rule is not breaking it.',
      },
    ]);

  it('holds across every module, dev entry points included', async () => {
    const literals = await deriveProseLiterals();
    expect(literals.length).toBeGreaterThan(200);
    const offenders = literals
      .filter((literal) => probabilityWordIn(literal.text) !== null)
      .filter(
        (literal) =>
          !KNOWN.some((known) => known.module === literal.module && literal.text.includes(known.contains)),
      )
      .map((literal) => `${literal.module}:${String(literal.line)} ${JSON.stringify(literal.text.slice(0, 120))}`);
    expect(offenders).toEqual([]);
  });

  it('positive control: the sweep still sees the literals it exempts', async () => {
    // Without this the rule above passes when the scanner reads nothing, which is exactly the
    // shape of wave 8's fifth false negative — a harness reporting "no failures" for every case.
    const literals = await deriveProseLiterals();
    for (const known of KNOWN) {
      expect(
        literals.some((literal) => literal.module === known.module && literal.text.includes(known.contains)),
        `${known.module} no longer contains its exempted literal — delete the exemption`,
      ).toBe(true);
    }
  });

  it('positive control: the sweep reaches the DOM entry points', async () => {
    const literals = await deriveProseLiterals();
    for (const module of ['dev/main.ts', 'dev/batchPanel.ts', 'dev/campaignPanel.ts']) {
      expect(
        literals.some((literal) => literal.module === module),
        `${module} produced no prose literal — the scanner is not reading it`,
      ).toBe(true);
    }
  });
});
