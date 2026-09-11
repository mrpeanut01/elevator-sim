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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
        'The energy figure ids — GitHub PR #515’s review finding L1, § D539. `ENERGY_FIGURE_IDS` holds ' +
        '`energy-work` and `energy-per-leg`, the two `ReportFigure.id` keys `dev/reportPanel.ts#reportDeltaOf` ' +
        'reads to withhold those rows between two runs on different equipment, and it is derived only ' +
        'because the two-adjacent-words scanner reads a hyphenated id as prose. An id is a contract, not ' +
        'a string a player reads: the two figures’ labels, values and notes are `dayReportOf`’s, which ' +
        'the report adapters seed on every case, and the note the ids feed is seeded by the ' +
        '`other-equipment` pairing in `honesty/surfaces.ts#reportPairingsOf`.',
      ids: ['shift/report.ts#ENERGY_FIGURE_IDS'],
    },
    {
      reason:
        'The house’s rush table — GitHub issue #418, § D547. `parseRushHouseTable`’s literals are ' +
        'load-time refusals addressed to whoever edited `data/rush-house-runs.json` ("carried more ' +
        'people than had arrived", "measures a pair a second time"), and `RUSH_HOUSE_TABLE` is ' +
        'only the classifier following that parser. Neither reaches a player. What a player reads ' +
        'off the table is `rushStandingsOf`’s view — the names, the house tag, the waves and held ' +
        'times, the note and both refusals — and the EVERYDAY_STANDALONE_SCREENS adapter seeds all ' +
        'of it on every case. The wrinkle parser’s entry below is the same argument.',
      ids: ['everyday/rushHouse.ts#parseRushHouseTable', 'everyday/rushHouse.ts#RUSH_HOUSE_TABLE'],
    },
    {
      reason:
        'Telemetry’s machinery, which renders nothing — GitHub issue #340. Each of these is derived ' +
        'only because the two-adjacent-words scanner reaches a hyphenated key through it: the four ' +
        'consent writers and the reader all touch `CONSENT_KEY`, which is `elevator-sim.telemetry`, ' +
        'and `everydayTelemetry` reaches the `content-type` header its transport sets. None of them ' +
        'composes a string a player reads, and by construction none of them can: `docs/26` P-4 says ' +
        'every field in the schema is a number, a boolean or a member of a vocabulary derived from ' +
        'the product, so there is no prose in the whole subsystem except the consent surface. That ' +
        'surface is `telemetry/consentView.ts`, it is driven by the `TELEMETRY_CONSENT` adapter over ' +
        'all four states and both storage arms, and § 4.1 makes its presence there a ship condition ' +
        'rather than a choice. `UNEMITTED_EVENTS` is the register of events this build declares and ' +
        'does not emit; it is addressed to whoever wires the next one and is asserted in both ' +
        'directions by `telemetry/schema.test.ts`, never drawn.',
      ids: [
        'everyday/telemetryPort.ts#everydayTelemetry',
        'telemetry/consent.ts#clearConsent',
        'telemetry/consent.ts#grantConsent',
        'telemetry/consent.ts#readConsent',
        'telemetry/consent.ts#refuseConsent',
        'telemetry/consent.ts#withdrawConsent',
        'telemetry/schema.ts#UNEMITTED_EVENTS',
      ],
    },
    {
      reason:
        'The wrinkle library’s parser, its load-time rotation check and § 17’s content gate — ' +
        'GitHub issue #159. Every literal in these is addressed to whoever edited ' +
        '`data/wrinkles.json` or to whoever ran the gate: a load-time refusal naming the rule the ' +
        'document broke ("two templates share an id", "the pool for that kind of day is too ' +
        'small"), or a gate verdict naming the pair whose order moved. None of them reaches a ' +
        'player. The words a player reads about a wrinkle are its `name` and its composed `note`, ' +
        'and those are seeded — every concrete one, not only every template — by the ' +
        '`SHIFT_REPORT` adapter through `everyWrinkle`. `pricing/parse.ts`’s exclusion below is the same ' +
        'argument for the same reason. `eventById` is here for the narrower one: it resolves a ' +
        'stored id to a wrinkle and returns it, and the only prose the classifier finds in it is ' +
        'the `writes` field names `effectOfWrinkle` derives — `demand.arrivalRatePctPop5min` is a ' +
        'config path, and the tooltip that draws `writes` is seeded through `SHIFT_EVENTS`. ' +
        '`REQUIRED_TEMPLATE_IDS` is a list of ids with a comment per entry naming the caller that ' +
        'reaches it; the ids are `data/` keys and the comments are addressed to a reviewer. ' +
        '`BREAKDOWN_AT_FRACTION` is a number the classifier reaches only because it now reads its ' +
        'value off `SHIFT_EVENTS` rather than restating it, which is the fix for a second source ' +
        'of truth, not a new string.',
      ids: [
        'wrinkles/parse.ts#parseWrinkleLibrary',
        'wrinkles/parse.ts#REQUIRED_TEMPLATE_IDS',
        'wrinkles/library.ts#WRINKLE_LIBRARY',
        'wrinkles/gate.ts#gateWrinkle',
        'wrinkles/gate.ts#gateLibrary',
        'shift/events.ts#eventById',
        'shift/events.ts#BREAKDOWN_AT_FRACTION',
      ],
    },
    {
      reason:
        'The price schedule’s parser, validator and lookups — GitHub issue #366. Every literal in ' +
        'these is a **load-time refusal addressed to whoever authored `data/price-schedule.json`** ' +
        '("the new shaft costs 12 u; data/price-schedule.json prices it 34"), or a config path, or ' +
        'a tier id. None of them reaches a player: the words a player reads about a price are the ' +
        'change’s own `name`, which the FIXIT adapter drives through `standingExtrasFrom` and ' +
        '`repairRowOf`, and the schedule’s `note` fields, which are provenance for a reviewer and ' +
        'are drawn on no screen. `fixit/parse.ts`’s own exclusion three groups down is the same ' +
        'argument for the same reason, and this is that file’s pricing half.',
      ids: [
        'pricing/parse.ts#parsePriceSchedule',
        'pricing/parse.ts#violationsIn',
        'pricing/parse.ts#priceOf',
        'pricing/repairPrice.ts#pathsIn',
        'pricing/repairPrice.ts#changesBought',
        'pricing/repairPrice.ts#unpricedPathsIn',
        'pricing/repairPrice.ts#repairPriceUnits',
        'fixit/parse.ts#newShaftUnits',
        /*
         * Returns three numbers. `standingExtrasFrom` beside it is deliberately **not** here — it
         * returns the five extras' names and lines, which are player copy and are driven by the
         * FIXIT adapter, exactly as `STANDING_EXTRAS` was before #366 renamed it.
         */
        'fixit/engine.ts#editorPricingFrom',
        /*
         * Issue #422's two prices, and its two paths. `zonePriceUnits` and `parkingPriceUnits`
         * return one number each, off the schedule; `editorPathsOf` returns the `covers` paths the
         * editor buys — `building.banks[]`, `dispatcher.idle.parkingStrategy` — which are dotted
         * config paths on exactly the ground `survivorSpace.ts`'s are below: a path is not a
         * sentence. What the player reads about either is `fixitScreenModel.ts#fixitZoneRow` and
         * `#fixitParkingRow`, and the FIXIT adapter drives both.
         */
        'fixit/engine.ts#zonePriceUnits',
        'fixit/engine.ts#parkingPriceUnits',
        'fixit/engine.ts#editorPathsOf',
        /*
         * The parking vocabulary itself — `stay`, `lobby`, `zone-center`. Engine identifiers, and
         * GAMEPLAY § 16 rule 11 forbids one reaching a player, which is why `fixitParkingRow` maps
         * every one of them to a phrase before it is drawn. Seeding the ids here would put the
         * exact strings the product refuses to show into the corpus as if they were copy.
         */
        'fixit/types.ts#EDITOR_PARKING_STRATEGIES',
      ],
    },
    {
      reason:
        'The survivor count’s space walk and its schema — GitHub issue #367, § D525 clause 3. Two ' +
        'different arguments, and both are the group above’s: `survivorSpace.ts`’s six are ' +
        'reached by the classifier through **one** literal, `dispatcher.${parameter.id}`, which is ' +
        'the dotted config path `data/price-schedule.json` prices a change over — a path, not a ' +
        'sentence, and the same thing `shift/events.ts#eventById`’s `writes` names are excluded ' +
        'for. `validatePublishedSurvivors`’s literals are **load-time refusals addressed to ' +
        'whoever regenerated `data/scenario-survivors.json`** ("the count is keyed by a stable ' +
        'step id and never by an array position"), which is `pricing/parse.ts#violationsIn`’s ' +
        'exclusion one group up, word for word in its reasoning. The words a player reads about a ' +
        'survivor count are `SURVIVOR_COPY` and `survivorSentenceFor`, and **those are driven** — ' +
        'by the `SURVIVORS` adapter, over every scenario and every budget step the shipped table ' +
        'holds. That split is the whole of why this exclusion is safe: the half that speaks to a ' +
        'player is in the corpus and the half that speaks to a regenerator is here.',
      ids: [
        'scenario/survivors.ts#validatePublishedSurvivors',
        'scenario/survivorSpace.ts#dimensionsCoveredBy',
        'scenario/survivorSpace.ts#reachableChangesOf',
        'scenario/survivorSpace.ts#unreachableChangeIdsOf',
        'scenario/survivorSpace.ts#unpricedDimensionIds',
        'scenario/survivorSpace.ts#bundleSpaceOf',
        'scenario/survivorSpace.ts#dropdownConfigurationsOf',
        'scenario/survivorSpace.ts#sampleReachableConfigurations',
      ],
    },
    {
      reason:
        'DOM-bound. These mount the page and author their status text inline, so they cannot be ' +
        'driven under Node — `boundaries.test.ts` confines the DOM to `dev/` precisely so the rest ' +
        'of the package stays testable without a jsdom. Their authored literals are swept ' +
        'statically below, which is weaker than driving them and is stated as a limitation rather ' +
        'than presented as coverage.',
      ids: [
        'dev/batchPanel.ts#mountBatchPanel',
        /*
         * Everyday Mode slice 7's suite mount, beside the bench and excluded on the bench's own
         * ground: it mounts DOM, and its authored copy is the empty state, the derived cost line
         * and the worker-lifecycle status text. Every *claim about a run* it draws is authored in
         * `batch/suite.ts` — whose producers the SUITE_BENCH adapter drives — or is `batchReport`'s
         * own sentence re-rendered. The inline copy reaches the static sweep below, which is
         * weaker than driving it and is stated as a limitation, exactly as for the mount above.
         */
        'dev/suitePanel.ts#mountSuitePanel',
        'dev/campaignPanel.ts#mountCampaignPanel',
        'dev/editor.ts#mountEditor',
        'dev/parameterForm.ts#mountParameterForm',
        'dev/parameterForm.ts#collectFormSource',
        'dev/parameterForm.ts#formStatusLine',
        /*
         * The UI readiness audit's B4 line — *NOT APPLIED — nothing the Run button does reads X* —
         * and it is **player-facing prose that this search does not check**, said plainly rather
         * than dressed as a non-surface.
         *
         * It is here beside `formStatusLine` because the whole Parameters tab is: nothing on that
         * surface is in the corpus, and putting one sentence of it in while the status line it sits
         * above — *"41 dimensions, 41 live — authorable as a dispatcher profile"*, the sentence the
         * audit found a reader mistaking for a claim about the Run button — stays out would read as
         * coverage of a tab that is not covered. The tab belongs in the corpus as a unit; that is
         * follow-up work and is named here rather than half-done.
         *
         * What does hold it meanwhile: `dev/parameterForm.test.ts` drives it over every discovered
         * schema, and `dev/boot.browser.test.ts` reads it off a booted page. Both are weaker than
         * the search, and both are stated as such.
         */
        'dev/parameterForm.ts#appliedNoteFor',
        'dev/data.ts#loadBrowserResources',
        'dev/data.ts#loadCampaign',
        'dev/data.ts#loadFixitCases',
        'dev/data.ts#loadProofCases',
        'dev/data.ts#resolveEdited',
        'dev/motion.ts#REDUCED_MOTION_QUERY',
        'dev/motion.ts#prefersReducedMotion',
        'dev/motion.ts#shouldAutoplay',
        'dev/motion.ts#shouldAutoplayWith',
        /*
         * The design refactor's **four** mounts. Each is the DOM half of a split whose **pure**
         * half is driven: `RAIL_VIEW` renders everything `mountLeftRail` writes, `REPORT_PANEL`
         * everything `mountReport` writes, `SCENARIOS` every card `mountScenarios` instantiates,
         * and `RIGHT_RAIL` every plate, card and option row `mountRightRail` instantiates.
         * `mountScenarios` is the one that authors a sentence of its own — the dashed sixth card's
         * *"Build your own scenario"* copy, which is inline and therefore reaches only the static
         * sweep below. That is a stated limitation, not coverage.
         *
         * **This sentence said *three* and the list beneath it has held four since `mountRightRail`
         * joined it** — a docstring naming its own members going stale, which is the class
         * `packages/viz/src/deadCode.test.ts` caught twice in wave 12. It is the narrowest reading
         * of the *"three DOM panels"* figure Phase 9's verdict published, and it failed here, inside
         * the classifier, before the wider readings failed anywhere else. Corrected under
         * [§ D421](../../../../DECISIONS.md); the count that verdict publishes is now derived from
         * this array rather than transcribed from this comment, below.
         */
        'dev/leftRail.ts#mountLeftRail',
        'dev/reportPanel.ts#mountReport',
        'dev/scenariosPanel.ts#mountScenarios',
        'dev/rightRail.ts#mountRightRail',
        /*
         * The Everyday shell's mount, on the mounts' shared ground: it builds the rail, the screen
         * region and the pinned bar, so it cannot run without a document. The split it sits on is
         * deliberate rather than incidental — `everyday/modes.ts`, `everyday/rail.ts`,
         * `everyday/actionBar.ts` and `everyday/screens.ts` hold every word the mount draws about
         * what a mode is, where the player is, what each bar control does and why an unbuilt
         * screen refuses, and the `EVERYDAY_MENU` adapter drives all four over every screen, every
         * run context and both shapes of rail. What is left here is what the mount authors of its
         * own: the headings, the menu lede, the refusal screen's way-back line and the glyph
         * characters, which reach the static sweep below. Weaker than driving them, and stated as
         * a limitation rather than presented as coverage.
         */
        'everyday/shell.ts#mountEverydayShell',
        /*
         * GitHub issue #348's as-built stage on the fix-it screen and the painter it shares with
         * § 7's stage. `mountAsBuiltStage` builds a canvas and a transport, so it cannot run
         * without a document; every word it draws is `everyday/fixitScreenModel.ts`'s copy table,
         * whose three as-built keys the FIXIT adapter seeds by name because no model reaches them
         * — the first probe of this wave's corpus move found them in `covers` and in nothing's
         * output. `drawCutaway` paints geometry and floor labels onto a
         * canvas context and authors no sentence — it is derived because a floor label is a word
         * beside a word — and the labels it draws are the recording's own.
         */
        'everyday/asBuiltStage.ts#mountAsBuiltStage',
        'everyday/cutaway.ts#drawCutaway',
        /*
         * The brief's elevation painter, shared with the campaign's tower screen since GitHub
         * issue #353. It paints wells and slabs onto a canvas and authors three floor marks and a
         * car id's tail; the words beside it — the outage strip, the works strip — are
         * `today.ts`'s and `campaignModel.ts`'s, both driven.
         */
        'everyday/elevation.ts#drawElevation',
        /*
         * § 14's two-tabbed board screen, on the settings screen's split exactly: `BOARD_SCREEN` is
         * a registry row whose `mount` builds tab cards, a table and a `<details>`, so it cannot
         * run without a document. Every **word** it draws is authored elsewhere and driven by the
         * `GAUNTLET` adapter — the ladder's rows and refusals in `gauntlet/ladder.ts`, the rating's
         * basis and caveat in `gauntlet/rating.ts`, the gauntlet's progress and stop lines in
         * `gauntlet/run.ts` — and its own two string tables, `BOARD_SCREEN_COPY` and
         * `DAILY_BOARD_ABSENCE`, are driven there too rather than excused here. What the mount
         * authors of its own is geometry, class names and the load-failure line.
         */
        'everyday/boardScreen.ts#BOARD_SCREEN',
        /*
         * § 15.1's settings screen, on the same split and for the same reason: `SETTINGS_SCREEN`
         * is a registry row whose `mount` builds inputs, swatch buttons and rows, so it cannot run
         * without a document. Every **word** on that screen — the lede, the name note, the row
         * captions, the two statements of fact and all six refusals in the register — is authored
         * in `everyday/settingsView.ts`, which the `EVERYDAY_SETTINGS` adapter drives over every
         * state the view distinguishes, including the one where the Engineer bridge has not
         * arrived. What the mount authors of its own is geometry and two class names.
         */
        'everyday/settingsScreen.ts#SETTINGS_SCREEN',
        /*
         * GAMEPLAY § 8's three campaign screens, on the same split and the same ground: one module
         * with three registry rows, each `mount` building selects, a month grid and a shop out of a
         * document. Every **word** those screens draw — the triage row's record and wear lines, the
         * desk's decision and its four tests, the contract sheet's purse ledger, every shop tier's
         * derived state, both refusals and the register of absences — is authored in
         * `everyday/campaignModel.ts` over `campaign/economy.ts`, which the `EVERYDAY_CAMPAIGN`
         * adapter drives over four careers. What these three author of their own is geometry, class
         * names and the glyphs on the calendar cells.
         */
        'everyday/campaignScreens.ts#TOWERS_SCREEN',
        'everyday/campaignScreens.ts#BUILDING_SCREEN',
        'everyday/campaignScreens.ts#CONTRACT_SCREEN',
        'everyday/campaignScreens.ts#campaignInputOf',
        /*
         * GAMEPLAY § 7's stage screen, on the mounts' shared ground and on the same split: its
         * `mount` builds a canvas, sizes it from a bounding rect and drives a
         * `requestAnimationFrame` loop, none of which exists under Node. Every **word** it draws —
         * the clock, the phase pill, the next-stretch pill, the three § 7.1 figures with their
         * counts and their two refusals, the alarm sentence, the four legend rungs, the intervention
         * labels and stamp, all three intervention refusals, the § 3.3 primary's three, the
         * ghost-lane absence and the screen's own register — is authored in
         * `everyday/stageScreenModel.ts`, which the `EVERYDAY_STAGE` adapter drives at
         * `sampleTimes`' playheads and over every state the model distinguishes.
         *
         * **Three of those words were the mount's own until § D347**, and one of them was a live
         * figure: the cutaway's out-of-service caption, its `▲`/`▼` glyph and the car's
         * `riders/capacity` readout were composed here, where no property could read them. They are
         * the model's now, and so are the overlay's three sentences. What the mount authors of its
         * own is geometry, class names and its **chrome** — the two transport captions, the `Start`
         * button, the strip's title and its two lane captions — which reaches only the static sweep
         * below, weaker than driving it and stated as a limitation rather than presented as
         * coverage. That sweep is also the difference the three moved strings turned on: ordinary
         * DOM text reaches it, and a `fillText` argument composed from two numbers is prose to
         * nobody, so those three were read by nothing at all.
         */
        'everyday/stageScreen.ts#STAGE_SCREEN',
        'dev/buildingEditor.ts#mountBuildingEditor',
        'dev/dispatcherEditor.ts#mountDispatcherEditor',
        'dev/machinesEditor.ts#mountMachinesEditor',
        /*
         * The Everyday rules editor's mount, excluded on the editor mounts' shared ground: it
         * mounts DOM, and its authored copy is the `when`/`then` joining words, the row buttons'
         * titles and the next-run advice — swept statically below. Every *claim* it draws — the
         * readbacks, the lever lines, every refusal, the fallback line and the exclusivity note
         * — is authored in `authoring/ruleSpec.ts`, whose producers the RULES_EDITOR adapter
         * drives over the whole declared vocabulary.
         */
        'dev/ruleEditor.ts#mountRuleEditor',
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
        /*
         * The Fix-a-building overlay, `menuRoot`'s mount pattern: TypeScript-built, appended to
         * `document.body`, and undrivable under Node for the same reason as every mount above.
         * Every decision it draws is `fixit/engine.ts`'s or `fixit/run.ts`'s, which the FIXIT
         * adapter drives; its own literals (headings, the running-total line) reach only the
         * static sweep below, which is a stated limitation exactly as it is for the menu.
         */
        'dev/fixitPanel.ts#mountFixitPanel',
        /*
         * The Everyday Fix-a-building **screen** (GAMEPLAY § 10), on the mounts' shared ground and
         * on the same split the Everyday shell sits on: it draws into the shell's scroll region,
         * so it cannot run without a document. Its pure half is `everyday/fixitScreenModel.ts`,
         * whose six producers the FIXIT adapter drives — the rail chrome and its derived
         * `{fixed}/{total}`, the § 3.3 substitutions over all five screen states, the § 9-priced
         * stepper lines, the running-total split and the repair state word — beside the engine
         * and run producers both this screen and the Engineer panel above read. What is left here
         * is the one sentence the mount authors of its own: the load-failure line, which is mount
         * status text on exactly the footing of every mount in this group, reaching only the
         * static sweep below.
         */
        'everyday/fixitScreen.ts#FIXIT_SCREEN',
        /*
         * § 6's daily loop — the four screens that make *Today's tower* a loop rather than a
         * hand-off, on the mounts' shared ground and on the same pure/DOM split every Everyday
         * screen sits on: each draws into the shell's scroll region, so none can run without a
         * document, and `briefScreen.ts` additionally draws a canvas.
         *
         * Every **word** on all four is authored in `everyday/today.ts`, `everyday/doorView.ts`,
         * `everyday/briefView.ts`, `everyday/weekView.ts`, `everyday/reportView.ts` and
         * `everyday/world.ts`, whose producers the `EVERYDAY_DAILY_LOOP` adapter drives over both
         * arms of the day-closed axis, over a past day and today, and over four states of the
         * report — including the two withheld states § 12.2's matrix is about. The report's
         * *sheet* is `dev/reportPanel.ts#reportViewOf`'s, driven in both registers by
         * `DAY_REPORT_VIEW`.
         *
         * What the four mounts author of their own is geometry, class names and the elevation
         * drawing's floor labels, which reach only the static sweep below — weaker than driving
         * them, and stated as a limitation rather than presented as coverage.
         */
        'everyday/doorScreen.ts#DOOR_SCREEN',
        'everyday/briefScreen.ts#BRIEF_SCREEN',
        'everyday/reportScreen.ts#REPORT_SCREEN',
        'everyday/weekScreen.ts#WEEK_SCREEN',
        /*
         * The Everyday workshop (GAMEPLAY § 11) and bench (§ 12) **screens**, on the mounts'
         * shared ground. Both are registry rows whose `mount` builds sliders, selects, `<details>`
         * and — the bench — a batch `Worker`, so neither can run without a document. Their pure
         * halves are `everyday/workshopModel.ts` and `everyday/benchModel.ts`, which the
         * `EVERYDAY_WORKSHOP` and `EVERYDAY_BENCH` adapters drive over the shipped dispatcher
         * library, every play style, every cost term, both switching states and a rule list with
         * a live refusal in it. What the mounts author of their own is geometry, three class
         * names and the two joining words `when` and `then`.
         */
        'everyday/workshopScreen.ts#WORKSHOP_SCREEN',
        'everyday/benchScreen.ts#BENCH_SCREEN',
        /*
         * The three standalone Everyday screens (GAMEPLAY § 9.1, § 13 and § 3.3 over § 18), on the
         * mounts' shared ground and on the same split every other screen in this group sits on.
         * Each draws into the shell's scroll region, so none can run without a document; each has a
         * pure half — `everyday/rushScreenModel.ts`, `everyday/designerModel.ts`,
         * `everyday/tunerModel.ts` — and the `EVERYDAY_STANDALONE_SCREENS` adapter drives all
         * three, over both arms of everything with two: a sized design and a refused one, a class
         * the drawing fits and one it is past, a tuner with nothing moved and one with something.
         * What is left here is what the mounts author of their own: the designer's saved-and-run
         * confirmation, which quotes the allocated id, and its catch, which quotes the loader's own
         * refusal rather than paraphrasing it. Both reach the static sweep below, which is weaker
         * than driving them and is stated as a limitation.
         */
        'everyday/rushScreen.ts#RUSH_SCREEN',
        'everyday/designerScreen.ts#DESIGNER_SCREEN',
        'everyday/tunerScreen.ts#TUNER_SCREEN',
        /*
         * § D525's Scenario hub (GitHub issue #364), on the mounts' shared ground and on exactly
         * the same split. Its `mount` draws buttons into the shell's scroll region, so it cannot
         * run without a document; its pure half is `everyday/scenarioModel.ts`, and the
         * `EVERYDAY_DAILY` adapter drives `scenarioHubViewOf` whole — the eyebrow, the title, the
         * lede, every entry's title, blurb and shape, the note, and every absence.
         *
         * **What the mount authors of its own is nothing.** Every string it draws comes from the
         * model, which is why this exclusion is stronger than the four above it rather than
         * weaker: there is no residue left over for the static sweep to be the only reader of.
         */
        'everyday/scenarioScreen.ts#SCENARIO_SCREEN',
        /*
         * § D529's two-screen tutorial (GitHub issue #380), on the mounts' shared ground. Both
         * rows draw into the shell's scroll region and neither can run without a document; the
         * pure halves are `everyday/tutorialModel.ts` and `everyday/workedAnswer.ts`, and the
         * `EVERYDAY_TUTORIAL` adapter drives both screens whole — each in its pending state and
         * its landed one, and the worked answer from both of § D529 clause 2's entry points.
         *
         * `mountWorkedAnswer` is the third row and it is the same exclusion for the same reason:
         * it is the component clause 2 forbids building twice, it authors no string of its own,
         * and every word it draws is `workedAnswerViewOf`'s. What it does author is the run — it
         * asks `dev/offThreadRuns.ts` for the shipped `fixit/run.ts` pair — and a run is not a
         * string this corpus can read.
         */
        /*
         * GitHub issue #244's landing page, on the mounts' shared ground and the strongest case of
         * it in this group: it draws into the shell's scroll region, it holds a `<canvas>`, and it
         * asks a worker for a run — three things that need a document between them.
         *
         * **Every word it draws is `everyday/landingView.ts`'s**, which the `EVERYDAY_LANDING`
         * adapter drives over all six states the page distinguishes — the block pending, playing
         * and unavailable, each for a visitor who has played nothing and one who has. What this
         * mount authors of its own is geometry, class names and **the run**: a building, a
         * dispatcher, a seed and five minutes of demand. A run is not a string this corpus can
         * read, which is `everyday/tutorialScreens.ts#mountWorkedAnswer`'s position exactly, and
         * it is recorded here for the same reason.
         */
        'everyday/landingScreen.ts#LANDING_SCREEN',
        'everyday/tutorialScreens.ts#TUTORIAL_SCREEN',
        'everyday/tutorialScreens.ts#COLLAPSE_SCREEN',
        'everyday/tutorialScreens.ts#mountWorkedAnswer',
      ],
    },
    {
      reason:
        'An id naming a document in `data/`, never a word a player reads. The derivation cannot ' +
        'tell a hyphenated slug from a sentence, so it arrives here rather than in an adapter — ' +
        'and the screens that use it print the case’s own authored copy, which the tutorial ' +
        'adapter drives, rather than the id.',
      ids: [
        /*
         * § D529's tutorial names a shipped fix case rather than authoring one (GitHub issue
         * #380). The id reaches `fixit/parse.ts`'s loaded document and is never rendered; what a
         * player reads is the case's own complaint, diagnosis and repair, all of which
         * `fixit/parse.ts` validates for player-facing copy at load and `EVERYDAY_TUTORIAL`
         * sweeps.
         */
        'everyday/tutorialModel.ts#TUTORIAL_CASE_ID',
      ],
    },
    {
      reason:
        'The Everyday data façade. Its methods hand back plain data the screens word; the only ' +
        'literals it authors are the two fallback names a save allocates when the reader typed ' +
        'nothing — `My pattern`, beside `dev/trafficEditor.ts`’s identical one — and those are ' +
        'identifiers in a list, not claims about a run. Every sentence a player reads about a ' +
        'building or a pattern is authored by the screen that draws it, and those screens’ pure ' +
        'halves are driven. `HOST_PENDING_REASON` is the one sentence this module does put on a ' +
        'screen, and it is driven by `EVERYDAY_MENU` rather than excluded here.',
      ids: ['everyday/host.ts#createEverydayHost'],
    },
    {
      reason:
        'A predicate over two weight vectors, derived only because its docstring is prose — it ' +
        'returns a boolean and puts nothing on a screen. It decides *whether* § 7.6’s handover ' +
        'control can act; the sentence a player reads when it says no is ' +
        '`everyday/stageScreenModel.ts#STAGE_SWITCH_NO_CHANGE`, which the `EVERYDAY_STAGE` adapter ' +
        'drives in the state that produces it rather than excusing it here. Its other caller, the ' +
        'Engineer strip, draws no sentence at all and disables the button. The day this function ' +
        'returns a reason instead of a boolean it stops being excludable.',
      ids: ['live/interventions.ts#switchChangesNothing'],
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
        'The Everyday shell\'s boot seam: two CSS selectors and the functions that press what they ' +
        'find. No player reads any of it. The two `ENGINEER_*` selectors are ' +
        '`document.querySelector` arguments — derived only because the two-adjacent-words scanner ' +
        'reads `[data-menu-control="main.resume"]` as prose — and `closeEngineerMenuWhenReady` and ' +
        '`bootEveryday` return `void` and the mounted shell. ' +
        '**`dismissEngineerMenu` is deliberately no longer in this list, and it did not go the way ' +
        '`loadSession` went.** Its strings did not reach a player; it stopped being an export. ' +
        '§ D335\'s stage hand-off was its one cross-module caller, § D338 retired the hand-off, and ' +
        'the `export` stood for a wave with nothing importing it (GitHub issue #273) — so it is now ' +
        'module-scope, the derivation only sees exports, and an id kept here would be this list\'s ' +
        'second guard failing rather than a claim about anything. The function is unchanged and ' +
        'still called by `closeEngineerMenuWhenReady`, whose own derived strings are what carry it. ' +
        '**`ENGINEER_ROOT_SELECTOR` and the two `console.error` diagnostics left this entry ' +
        'with the hand-off**: § 7\'s stage is a screen, so the shell insets nothing and boot has no ' +
        'Engineer root to query and no hand-off at which to report a menu it could not close. The ' +
        'day a string here is drawn on a screen it stops being excludable, exactly as ' +
        '`loadSession`\'s did.',
      ids: [
        'everyday/boot.ts#ENGINEER_MENU_SELECTOR',
        'everyday/boot.ts#ENGINEER_RESUME_SELECTOR',
        'everyday/boot.ts#bootEveryday',
        'everyday/boot.ts#closeEngineerMenuWhenReady',
      ],
    },
    {
      reason:
        'A DOM `id`, not a sentence — GitHub issue #404. `shell.ts` writes it onto the screen ' +
        'region and the skip link puts it in an `href`, so the two halves of the fragment cannot ' +
        'disagree; it is derived only because the two-adjacent-words prose test cannot tell a ' +
        'hyphenated slug from prose, which is the same reason `EVERYDAY_ROOT_CLASS` two exports ' +
        'above it is *not* here — that one is a single word and the scanner never sees it. The ' +
        'words a player actually reads on that link are ' +
        '`everyday/types.ts#SHELL_SKIP_LABEL`, which the `EVERYDAY_MENU` adapter drives beside ' +
        '`RAIL_DRAWER_COPY`\'s two. The day this constant becomes something a player reads, it ' +
        'stops being excludable.',
      ids: ['everyday/types.ts#EVERYDAY_SCREEN_REGION_ID'],
    },
    {
      reason:
        'GAMEPLAY § 19\'s design tokens. The type stack\'s font-family values — ' +
        '"\'Familjen Grotesk\', sans-serif" and friends — are CSS, read by no player as a ' +
        'sentence, and are derived only because a two-word font name satisfies the ' +
        'two-adjacent-words prose test, exactly as the scanner\'s own docstring predicts for ' +
        'CSS tokens. The palette, radius and gap objects carry no prose at all and are not ' +
        'derived; the day a token module grows a sentence a player reads, it stops being ' +
        'excludable.',
      ids: ['everyday/tokens.ts#EVERYDAY_TYPE'],
    },
    {
      reason:
        'The daily loop\'s shared drawing vocabulary, on `dev/dom.ts`\'s precedent one group down: ' +
        'a component factory produces no sentence of its own. `EYEBROW`, `MONO`, `CARD`, `WELL`, ' +
        '`BODY`, `QUIET` and `LEDE` are inline CSS — derived only because a two-word font-family ' +
        'and a `1px solid` satisfy the two-adjacent-words prose test, exactly as ' +
        '`EVERYDAY_TYPE`\'s entry above predicts for CSS tokens — and `pill`, `section`, ' +
        '`figureCell` and `unavailableBand` put on the page only strings a caller handed them. ' +
        'Every one of those callers is `everyday/doorView.ts`, `briefView.ts`, `weekView.ts`, ' +
        '`reportView.ts` or `dev/reportPanel.ts`, all of which are driven. `percentFigure` is the ' +
        'same shape one level smaller: it turns a number into `81%` and its only literal is the ' +
        'per-cent sign. The day one of these grows a sentence a player reads, it stops being ' +
        'excludable — which is the wording `loadSession`\'s entry earned by having that day arrive.',
      ids: [
        'everyday/screenDom.ts#BODY',
        'everyday/screenDom.ts#CARD',
        'everyday/screenDom.ts#EYEBROW',
        'everyday/screenDom.ts#figureCell',
        'everyday/screenDom.ts#LEDE',
        'everyday/screenDom.ts#MONO',
        'everyday/screenDom.ts#pill',
        'everyday/screenDom.ts#QUIET',
        'everyday/screenDom.ts#section',
        /*
         * `sideBySide` writes a `grid`-replacing flex row and two `flex` shorthands and puts no
         * string on the page at all — GitHub issue #240. It is derived here for the reason this
         * group's own sentence gives: `flex-start` beside `flex-wrap` satisfies the
         * two-adjacent-words prose test, exactly as `EVERYDAY_TYPE`'s entry above predicts for
         * CSS. Its arguments are two elements and three numbers; there is no seat in its signature
         * for a sentence.
         */
        'everyday/screenDom.ts#sideBySide',
        'everyday/screenDom.ts#unavailableBand',
        'everyday/screenDom.ts#WELL',
        'everyday/figures.ts#percentFigure',
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
        'drawer; it authors two strings and neither is about a run. The drawer toggle — ' +
        '`Controls ▸` / `Close controls` — names a control rather than a result. The second is ' +
        '§ D330’s tab-gate notice (`4 more editors — open them from the Controls rail`, issue ' +
        '#130), which names four controls and the route to them: it carries no figure, no count ' +
        'of anything a run produced and no window, and its only number is how many buttons the ' +
        'strip is holding back, counted off the `hidden` flags in the same call. Both are ' +
        'asserted directly in `surfaces.test.ts` — the toggle beside the breakpoint it must agree ' +
        'with, the notice over all sixteen reveals × ten active tabs — which is a stronger check ' +
        'than a string search, and neither is a sentence this corpus’s properties can speak to. ' +
        '`dev/state.ts` is configuration: it answers ' +
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
        /*
         * Derived through `gateNoticeText`, the private helper it hands the count to — the
         * transitive clause working exactly as intended. It is here rather than in an adapter for
         * the group's reason: the sentence is *where four editors are*, and this corpus judges
         * claims about a run. The one instrument that could have spoken to it is `internal-notation`,
         * and the notice names no id — it says *editors* and *the Controls rail*, both of which are
         * words on the page.
         */
        'dev/surfaces.ts#surfaceStateFor',
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
        /*
         * Its issue #140 sibling, and derived for the same reason as the two above and no other:
         * it returns that same template id — `rise-and-fall` — inside a record of three other
         * values, and the scanner reads the hyphen as a word break.
         *
         * It authors no sentence at all. What it produces is the four *inputs*
         * `shift/calendar.ts#calendarAsks` decides a period's asks against, so that
         * `scope/runIdentity.ts` and `shiftRunConfigOf` cannot disagree about whether a period's
         * mix bias reached the run — a refusal naming a bias the engine withheld being the
         * wrong-reason failure § D227 rates below the gap it fixes. The prose a player reads about
         * a period is `calendarLine`'s caption, driven by the shift surfaces, and the refusal
         * built from these fields is `runIdentityIssues`', excluded below under its own name.
         */
        'dev/state.ts#calendarAskInputOf',
        'dev/state.ts#shiftRunConfigOf',
        /*
         * **Derived for the first time on 2026-08-29, and by a call rather than by a string** —
         * GitHub issue #300, § D390. It is worth stating that way round because the usual entry
         * in this group is a hyphenated id the scanner misreads, and this one is not: the evidence
         * line is `via shiftRunConfigOf: reader have between them.`, which is that function's own
         * `throw` — *"No building "x" — the page offers only what data/buildings/ and the reader
         * have between them."*
         *
         * `resolvedBuildingOf` used to answer from `resources.entries` by identity and reached no
         * sentence at all. #300 made it delegate to `shiftRunConfigOf`, so that the brief describes
         * the building the run will use rather than the shipped one, and it inherited that
         * function's whole text-producing chain in the same step. The chain is the reason it is
         * here; the exclusion is the neighbour's above, unchanged and for the same reason.
         *
         * It authors nothing of its own. Its two arms are a `ResolvedBuilding` and `undefined`, and
         * the `undefined` arm is what a caller gets for an unknown id — the throw it inherits is
         * **unreachable through this function**, because the lookup guard in front of the delegate
         * answers that case first and `today.test.ts` asserts it in both directions. What a player
         * reads about the building it resolves is `everyday/today.ts`'s five facts and lede, driven
         * by the Everyday adapters, and #300's own case requires those to agree with the run.
         */
        'dev/state.ts#resolvedBuildingOf',
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
        /*
         * The registry those three ids are collected into — GitHub issue #145. It is derived for
         * exactly the reason `FREE_PLAY_CONTRACT_ID` above it is: it holds `free-play`, whose
         * hyphen reads as a word break, and now also **keys** that read as words (`endless`,
         * `sandbox`, `free play`).
         *
         * Neither half is prose. The **values** are the same three contract ids already excused
         * above, and the **keys** are case names for `honesty/surfaces.ts`' own sweep — they land
         * in a seed's `field`, which is the string a reader greps when a violation names one, and
         * they reach no screen. The words a player actually reads about a week carrying any of
         * these are `coachWeekLines`' four branches, and this record is the thing that now makes
         * every one of them driven: the corpus maps it, so a fourth sentinel is swept on the commit
         * that declares it, and `week.test.ts` fails if one is declared without being registered.
         *
         * So this entry excuses the register that closed the gap, which is worth stating plainly
         * rather than leaving to look like the gap moving one file over.
         */
        'shift/week.ts#WEEK_CONTRACT_SENTINELS',
        /*
         * Reached through that table since GitHub issue #177 item 1: `PARKED_WEEKS_MAX` is its
         * key count and `switchWeek` reads the bound, so both inherit `free play`'s two words.
         * Neither authors a sentence. `replayPatchOf` returns a state patch keyed on ids.
         */
        'shift/week.ts#PARKED_WEEKS_MAX',
        'shift/week.ts#switchWeek',
        'everyday/replay.ts#replayPatchOf',
      ],
    },
    {
      reason:
        'Everyday slice 8’s watch seam, whose player-facing words are driven by the `WATCH` ' +
        'adapter and whose remaining derived “prose” is not prose. Four shapes, none of them a ' +
        'sentence anybody reads. (1) The scanner reads hyphenated **identifiers** as words, ' +
        'exactly as it does for `PlayMode`’s members above: `viewer.calendar`, `free-play`, ' +
        '`no-such-tower`, `filed-day`, `does-not-reproduce`, `park-cars-lobby`. (2) Two are id ' +
        '**templates** — `filedDayRuns`’ `day:${contractId}:${day}` selection key and the record ' +
        'shape number — which no surface prints. (3) `WATCH_RECORD_CARRIES` and ' +
        '`PERIOD_BOOKS_THE_EVENT` are refusals a **developer** reads: the first is a coverage ' +
        'table asserted against `WatchRecord`’s own fields, the second is a `ScopeIssue` message ' +
        'that stops a record being written and therefore never reaches a picker row — a day it ' +
        'fires on is filed with `record: null` and the row says `DAY_HAS_NO_RECORD`, which the ' +
        'adapter does drive. (4) The two mounts and the loader are DOM- or fetch-bound and are ' +
        'excluded on `dev/fixitPanel.ts`’s own established ground: every string they print comes ' +
        'from `watch/view.ts`, `watch/library.ts` or `watch/reproduce.ts`, all driven. ' +
        '`firstPersonWordsIn` authors the word list § 14.1 forbids, which is the opposite of ' +
        'player-facing text — it is the checker for it, and `watch/reference.ts` calls it at load ' +
        'time so an authored fixture cannot ship first-person copy.',
      ids: [
        'dev/data.ts#loadReferenceRuns',
        'dev/watchPanel.ts#mountWatchPanel',
        'dev/watchPanel.ts#WATCHING_HEADER_CLASS',
        /*
         * GitHub issue #165 split `checkedRun` into these two halves so `dev/watchPanel.ts` could
         * run the gate's simulation on a worker, and issue **#410** moved the Everyday press the
         * same way — at which point the composition had no non-test caller and was deleted, so its
         * id is no longer in this list. The two that remain are the same seam and carry the same
         * words — every refusal either of them returns is `watch/record.ts`'s or
         * `watch/reproduce.ts`'s, both driven — so they take the entry the whole gate already had
         * rather than an exclusion of their own, which would read as a second seam that is not
         * there.
         */
        'watch/library.ts#watchGateAfter',
        'watch/library.ts#watchGateBefore',
        'watch/library.ts#filedDayRuns',
        'watch/record.ts#PERIOD_BOOKS_THE_EVENT',
        'watch/record.ts#stateFromWatchRecord',
        'watch/record.ts#WATCH_RECORD_CARRIES',
        'watch/record.ts#watchRecordIssues',
        'watch/record.ts#watchRecordOf',
        'watch/record.ts#watchRunConfigOf',
        'watch/reference.ts#FIXTURE_MARKER',
        'watch/reference.ts#parseReferenceRuns',
        'watch/reproduce.ts#reproductionDrift',
        'watch/types.ts#WATCH_RECORD_VERSION',
        'watch/view.ts#firstPersonWordsIn',
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
        '`UX.md` `PB-09`’s two halves, and they are excluded for different reasons. ' +
        '`LOOP_WINDOW_IDLE_LABEL` is a **control’s accessible name** — the third face of the A–B ' +
        'chip, the one `index.html` ships and `setLoopMark` puts back — and it carries no figure, ' +
        'no mean and no claim about a run, so none of the ten properties has anything to say ' +
        'about it. It is a module-level export only so that the page and the code cannot hold two ' +
        'different sentences for one state, and `chromeLabels.test.ts` asserts exactly that, in ' +
        'both directions, against the page’s own opening tag. That is a stronger check than a ' +
        'string sweep for a label whose entire job is to equal a `aria-label` attribute. The rest ' +
        'of the transport’s chip names are authored inline in `drawTransportChrome` and reach the ' +
        'derivation not at all, on the DOM entry points’ shared ground. ' +
        '`Playback` is derived for one sentence, `setLoop`’s `RangeError` on a window with no ' +
        'positive length, and that is a developer diagnostic in `recordRun`’s own class: it ' +
        'reports that a caller asked for a loop the playhead cannot cross, fires before a frame ' +
        'is drawn, and is pinned by `playback.test.ts` in both directions rather than swept as ' +
        'player copy. No transport state reaches a reader through this class — the words a player ' +
        'sees about the loop are the chip’s names above and the timeline’s own bands.',
      ids: ['dev/main.ts#LOOP_WINDOW_IDLE_LABEL', 'playback/playback.ts#Playback'],
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
        /*
         * GitHub issue #178 item 1's two id-only exports beside it. `permittedScopes` returns
         * members of `CHANGE_SCOPES` and authors nothing; `MODE_OF_SCREEN` maps screen ids to
         * `PLAY_MODES` members or `null`. Both are derived only because a hyphen reads as a word
         * break — `stage-campaign`, `free-play` — which is `commitmentOf`'s case below. The
         * sentence the model draws is `permittedLineFor`, driven by the menu adapter.
         */
        'scope/permits.ts#permittedScopes',
        'menu/affordances.ts#MODE_OF_SCREEN',
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
        /*
         * `scope/runIdentity.ts#CARRIED_INTERVENTION_KINDS` stood here — GitHub issue #338's tuple
         * of the kinds the wire carries, derived only because a hyphenated id reads as two words.
         * **The tuple is gone** (GitHub issues #370, #371): the set is `core`'s
         * `sim/interventionWire.ts` now and this export is a one-line re-export of it, which
         * authors no literal and so is found by nothing. The exclusion goes with the thing it
         * excused rather than being left to pre-approve whatever takes the name next, which is what
         * the ghost check below is for and how this deletion was found.
         */
        /*
         * GitHub issue #353's works writer: returns the run's car ids, derived only because the
         * private `${bankId}-${carId}` composer reads as a phrase — `shift/events.ts#carRuntimeId`'s
         * own case, kept private there for the same reason. The words a player reads about the held
         * car are `campaignModel.ts#BUILDING_COPY`'s, driven.
         */
        'campaign/works.ts#worksHeldCarsOf',
        /*
         * GitHub issue #213's route table — lever ids to screens, derived because `add-a-car` and
         * `zone-the-tower` read as words. The strings a card draws from it, the button label and
         * the caveat, are `everydayReportViewOf`'s and the `EVERYDAY_DAILY_LOOP` adapter seeds both.
         */
        'everyday/reportView.ts#EVERYDAY_LEVER_ROUTES',
      ],
    },
    {
      reason:
        'The workshop’s § 3.3 note **decision**, GitHub issue #296 — `commitmentOf`’s case one ' +
        'group up, in the screen that consumes it. `WORKSHOP_WRITES` is a tuple of `SurfaceKey`s ' +
        '(`viewer.dispatcherSpec`) and `WORKSHOP_REACHES` a tuple of answer codes (`draft-only`), ' +
        'both derived only because a dot and a hyphen read as word breaks to the scanner — the ' +
        'identical false positive `scope/commitment.ts#COMMITMENTS` is excluded for. ' +
        '`workshopReachOf` returns one member of the second tuple and `workshopWriteReachesRun` ' +
        'returns a **boolean**; neither authors a sentence, and that split is deliberate rather ' +
        'than incidental. The wording a player reads is module-private in ' +
        '`everyday/workshopScreen.ts`, beside the control, on ' +
        '`dev/dispatcherEditor.ts#DRAFT_NOTE`’s precedent and under the same stated limitation — ' +
        'a mount’s copy reaches the static sweep and not the driven one. The two guide sentences ' +
        'this screen selects between are `everyday/actionBar.ts`’s and are already swept there, ' +
        'through the § 3.3 table’s own `noteVariants`. What is checked instead of a string search ' +
        'is stronger and lives in `everyday/workshopTravel.test.ts`: the answer these four produce ' +
        'must agree with the legs a run actually produces, measured through ' +
        '`shiftRunConfigOf` → `recordRun`.',
      ids: [
        'everyday/workshopModel.ts#WORKSHOP_WRITES',
        'everyday/workshopModel.ts#WORKSHOP_REACHES',
        'everyday/workshopModel.ts#workshopReachOf',
        'everyday/workshopModel.ts#workshopWriteReachesRun',
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
      ids: [
        'scope/runIdentity.ts#runIdentityIssues',
        'scope/runIdentity.ts#CARRY_CHECKS',
        /*
         * `scope/runIdentity.ts#ANSWER_INCIDENT_STAYS_REFUSED` stood here — GitHub issue #338's
         * permanent refusal for the incident answer. The constant is **deleted** (#370): its
         * sentence is a row on `core/src/sim/interventionWire.ts#INTERVENTION_WIRE` now, beside the
         * two the bought kinds carry, and `runIdentityIssues` reads whichever row applies instead of
         * using this one for every refused kind. It still reaches a reader by exactly the route
         * above, through `runIdentityIssues`, which is already listed.
         */
      ],
    },
    {
      reason:
        'A vocabulary or a schema, not prose. `GOAL_OBSERVATION_IDS` and `SHIFT_EVENT_IDS` are the ' +
        'id tuples the two shift unions are derived from — the same id-table case as ' +
        '`campaign/types.ts#FAIL_STATES` above — and every event a reader sees is its ' +
        '`ShiftEvent.name` and `note`, both of which `SHIFT_REPORT` drives. ' +
        '`contract/types.ts#VIZ_SCHEMA_VERSION` is the integer 9; it is derived only because the ' +
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
        // Returns a boolean — *is this a time condition* — and is derived only because the
        // scanner reads its hyphenated condition ids (`time-before`, `day-period`) as prose.
        // The sentences a player reads about time rules are `ruleIssues`' clock refusal and the
        // row readbacks, both driven by the RULES_EDITOR adapter.
        'authoring/ruleSpec.ts#isTimeCondition',
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
        /*
         * The three stages a mailed sign-in link's outcome can be in — GitHub issue #336 — derived
         * only because `signed-in` reads as two adjacent words, which is `menu/types.ts#MENU_SCREENS`
         * below and its `free-play` exactly. No stage id is drawn anywhere: what a player reads is
         * `signInNoticeViewOf`'s eyebrow, route and dismissal, which the `EVERYDAY_SIGN_IN_LINK`
         * adapter drives over all three stages, plus the outcome sentence, which the server or
         * `menu/client.ts` authors and this module only carries.
         */
        'everyday/signInLink.ts#SIGN_IN_LINK_STAGES',
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
         * Telemetry's own vocabularies and its one storage key — GitHub issue #340. All three are
         * derived by the two-adjacent-words scanner and none is a sentence: `under-budget` is one
         * member of `batch/report.ts#BatchVerdict`, `fixit-repair` is one of the five control kinds
         * `docs/26` § 7.4 asks a `change_made` event to carry, and `elevator-sim.telemetry` is a
         * `localStorage` key with a dot in it. What a player reads about any of this is
         * `telemetry/consentView.ts`'s ask and settings row, which the `TELEMETRY_CONSENT` adapter
         * drives over all four consent states and both storage arms.
         */
        'telemetry/schema.ts#BATCH_VERDICT_KINDS',
        'telemetry/schema.ts#CONTROL_KEYS',
        'telemetry/consent.ts#CONSENT_KEY',
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
        /*
         * `briefs/parse.ts` is `campaign/parse.ts` one `data/` document over — GitHub issue #227.
         * Every sentence in it refuses a malformed `data/engineering-briefs.json` to the person
         * authoring it: a kind that is not one of `docs/21` § 4's six, a second brief of one kind,
         * and — the one that matters — a brief whose kind cannot reach a scenario run, which names
         * the seam rather than the amount of work. `briefs/parse.test.ts` fires every one of them
         * and checks each seam's premise against the tree. What a *player* reads is the parsed
         * copy: the brief's `name`, `teaches` and `brief` sentences, which are a `CampaignStage`'s
         * and travel through `dev/campaignPanel.ts` and the judge exactly as the ten stages' do.
         */
        'briefs/parse.ts#BRIEF_KINDS',
        'briefs/parse.ts#BRIEF_KIND_SEAM',
        'briefs/parse.ts#EngineeringBriefsError',
        'briefs/parse.ts#parseEngineeringBriefs',
        /*
         * `fixit/parse.ts` is `campaign/parse.ts` one surface over, and the same argument holds:
         * its sentences refuse a malformed `data/fixit-cases.json` to the person authoring it,
         * `fixit/parse.test.ts` drives every refusal, and what a *player* reads is the parsed
         * copy, which travels through the panel and the FIXIT adapter's drivers.
         * `playerFacingStringsOf` returns that authored copy labelled for the copy sweep — the
         * validation instrument, not a surface.
         */
        'fixit/parse.ts#FixitCasesError',
        'fixit/parse.ts#parseFixitCases',
        'fixit/parse.ts#playerFacingStringsOf',
        /*
         * `gauntlet/proofCases.ts`'s parse, one `data/` document over, on the identical ground: its
         * sentences refuse a malformed `data/proof-cases.json` to the person editing it — a tower
         * naming a building this build does not ship, a duplicate id, an empty side — and
         * `gauntlet/proofCases.test.ts` fires every one of them. What a *player* reads is the
         * parsed list, through the `GAUNTLET` adapter's `whatAreTheFortyOf` and the ladder rows.
         */
        'gauntlet/proofCases.ts#parseProofCases',
        /*
         * § 1's bench seed rule (§ D446). Not prose, and derived only by the identifier clause the
         * `watch/` group above names first: the scanner reads the key template `bench#${caseId}` as
         * words. What it returns is a decimal seed string that no surface prints — `proofSeedOf`,
         * its gauntlet twin, is not derived at all, and the only difference between them is that
         * this one's key carries a literal word. `proofCases.test.ts` pins the value and asserts
         * the two seed sets are disjoint, which is the check that matters about it.
         */
        'gauntlet/proofCases.ts#benchSeedOf',
        /*
         * `scenario/budget.ts` — GitHub issue **#365**'s schema, and its two halves are excluded on
         * two different grounds, which is why they are commented rather than listed silently.
         *
         * `decodeScenarioBudget` and `budgetViolations` are `campaign/parse.ts` one field over: they
         * refuse a malformed budget in `data/campaign.json` to the person editing it — a step no
         * price schedule can reach, an `activeWhen` that disagrees with the ladder, a goal authored
         * on a budget — and `scenario/budget.test.ts` fires every one of them against the real
         * shipped budget rather than a fixture.
         *
         * `admitPurchase`'s refusal is the other kind and the exclusion is narrower: it is written
         * for a **player** — *"this change costs 13 units and the budget holds 4"* — and **no
         * screen draws it yet**, because the surface that will is #233's re-authoring of the
         * eighteen fix cases and #367's difficulty face. A string the sweep cannot see because
         * nothing renders it is the shape `CLAUDE.md` names for the stranded count, and the rule is
         * the same in both places: it enters an adapter on the commit that draws it, not before.
         */
        'scenario/budget.ts#admitPurchase',
        'scenario/budget.ts#budgetViolations',
        'scenario/budget.ts#decodeScenarioBudget',
        /*
         * `live/interventions.ts`'s **purchase** half — GitHub issue **#370**, and it is
         * `admitPurchase`'s exclusion one substrate over, deliberately quoting it rather than
         * inventing a second ground.
         *
         * The two bought kinds' **stamps** are swept and are not here: `interventionStampOf` and
         * `interventionLogOf` are in `LIVE_RAIL.covers` and `SHIFT_REPORT.covers`, the seeded log
         * carries all six kinds, and the two new past-tense verbs enter the corpus with the other
         * four. What is excluded is the pricing beside the press — the label with the price on it,
         * the arm's title, and the refusal naming the price and the budget — because **no screen
         * draws them yet**: `everyday/stageScreenModel.ts#stageInterventionsOf` builds the row when
         * a caller supplies an offer, and no caller supplies one until the scenario budget reaches
         * the stage (#365's ladder is validated at load and read by nothing at play time). Seeding
         * a string the product does not render would be coverage manufactured rather than earned,
         * which is precisely what the entry above refuses to do, and the rule is the same here: it
         * enters an adapter on the commit that draws it, not before. `live/interventions.test.ts`
         * drives every one of these directly against the shipped schedule in the meantime, so the
         * refusal is pinned by a run rather than by this paragraph (§ D227).
         */
        'live/interventions.ts#WORKS_ARM_EXPLAINS',
        'live/interventions.ts#WORKS_KIND_BY_TIER',
        'live/interventions.ts#admitWorks',
        'live/interventions.ts#spentOnWorks',
        'live/interventions.ts#worksKindOfTier',
        'live/interventions.ts#worksLabelOf',
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
        'The decision log’s collector and its two wrappers, producers since slice 4b’s selector ' +
        'trace. Their strings are `VizDecision`/`VizPatternSwitch` fields copied from core plus ' +
        'one thrown invariant — the policy-to-bank ordinal check in `buildPatternSwitches` — ' +
        'which is a developer diagnostic in exactly `recordRun`’s own class (excluded below): it ' +
        'reports a bug in this package’s construction, fires before any recording exists, and is ' +
        'pinned by `recordRun.test.ts` rather than swept as player copy. The sentences a player ' +
        'actually reads from a decision or a switch are `live/decisions.ts#decisionRowsAt`’s and ' +
        '`live/patternReadout.ts#patternReadoutAt`’s, both driven by the LIVE_RAIL adapter.',
      ids: [
        'record/decisionLog.ts#DecisionCollector',
        'record/decisionLog.ts#recordingPolicyFactory',
        'record/decisionLog.ts#wrapPolicy',
      ],
    },
    {
      reason:
        'Assertions that two runs met the same crowd — GitHub issue #350 — and the three sites ' +
        'that make them. `crowdDifferencesOf` returns sentences naming the first legs that differ, ' +
        '`sameCrowd` is the predicate over it, `assertSameCrowd` throws with the pair’s own name in ' +
        'front, and `assertPairMatchesRepairs` is the fix-it press’s call. Every one of those ' +
        'sentences is a developer diagnostic in `recordRun`’s own class: it reports that a surface ' +
        'paired two recordings it had no right to pair, fires before anything is drawn from the ' +
        'pair, and is pinned by `record/crowd.test.ts` and `fixit/run.test.ts` on fabricated ' +
        'recordings rather than swept as player copy. `wireInterventionsOf` is the same shape one ' +
        'module over — GitHub issue #338 — throwing on a log entry that `runIdentityIssues` should ' +
        'have refused first; the sentence a player reads about that state is ' +
        '`switchUnpostableReasonOf`’s, which the EVERYDAY_STAGE adapter drives.',
      ids: [
        'record/crowd.ts#crowdDifferencesOf',
        'record/crowd.ts#sameCrowd',
        'record/crowd.ts#assertSameCrowd',
        'fixit/run.ts#assertPairMatchesRepairs',
        'scope/switchWire.ts#wireInterventionsOf',
        /*
         * `scope/switchWire.ts#switchTargetFromWire` stood here — GitHub issue #337's inverse of the
         * wire form, derived only because the local `SwitchOnTheWire` **interface** it named carried
         * a hyphenated id that read as two words. That interface is now a one-line alias of `core`'s
         * (GitHub issues #370, #371), so the words it was derived through are in another package and
         * the derivation no longer finds this function at all. Deleted rather than left standing,
         * for the reason the ghost check gives: an exclusion that outlives its subject silently
         * pre-approves whatever takes the name next.
         */
      ],
    },
    {
      reason:
        'Produces data, not prose. Derived only through the transitive clause — it names a helper ' +
        'that has a sentence in it — and its own return value carries ids, counts or geometry. ' +
        'Every string it does carry reaches a player through a surface that is driven.',
      ids: [
        'batch/runBatch.ts#runBatch',
        'batch/runBatch.ts#firstTraceDisagreement',
        /*
         * The Fix-a-building run pairing and its measurement: configs in, numbers out. Both are
         * derived only transitively — `fixitRunPlanOf` through `configOf`'s thrown diagnostics
         * and a template file name, `measuredOf` through the scope-mode ids — and every sentence
         * built *from* their numbers is `fixit/engine.ts`'s, which the FIXIT adapter drives. The
         * two steppers return a `FixitState` and reach prose only through `affordabilityOf`,
         * which that adapter drives directly.
         */
        'fixit/run.ts#fixitRunPlanOf',
        'fixit/run.ts#measuredOf',
        'fixit/engine.ts#stepSpeed',
        'fixit/engine.ts#stepCapacity',
        /*
         * Issue #422's two reducers, on the two steppers' own ground: a `FixitState` in, a
         * `FixitState` out, reaching prose only through `affordabilityOf`, which this adapter drives
         * directly. What a player reads about either is the row, not the reducer.
         */
        'fixit/engine.ts#stepZoneOverlap',
        'fixit/engine.ts#setParkingStrategy',
        'frame/overlay.ts#queueAt',
        'frame/overlay.ts#landingAssignmentsAt',
        'frame/sequence.ts#frameSequence',
        'frame/sequence.ts#frameTimes',
        'record/recordRun.ts#recordRun',
        'record/document.ts#readRecordingDocument',
        'editor/editorEdits.ts#blankBuilding',
        'editor/editorEdits.ts#serializeBuilding',
        /*
         * GitHub issue #289's guard: *which documents does* Run it and watch *write*. It returns a
         * `BuildingSpec` and a `PatternSpec` — or neither, which is the whole point of it — and is
         * derived only through the transitive clause, because it calls `patternWithTune`. That
         * function's `Tuned — 6%pop/5 min, 40% through the lobby` **is** the prose, it is the one
         * string in the pair a player ever reads, and `EVERYDAY_STANDALONE_SCREENS` already claims
         * and renders it. Claiming it here as well would put one sentence under two owners, which
         * is the thing § D362's declared pair exists to make impossible.
         */
        'everyday/tunerModel.ts#tunePresses',
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
    /*
     * `shift/reportWindow.ts#shiftReportWindowFor` was excluded here and is not any more, and the
     * deletion is the record rather than an omission.
     *
     * The exclusion said, in as many words, that the expression *"is derived only because that
     * literal reads as a phrase to the two-adjacent-words scanner"* — the literal being `'full-run'`.
     * GitHub issue #315 moved the rule to `@elevator-sim/experiments`'s
     * `benchmark/matrixCells.ts#reportWindowForBuilding`, because `packages/server`'s replay
     * verifier has to choose the same window or an honest submission does not reproduce, and it may
     * not import a browser bundle to ask. `shiftReportWindowFor` is still this package's name for
     * the answer and still has its three producers; what it no longer holds is the literal, so the
     * scanner no longer derives it and an exclusion for it is a ghost. The two cases below this
     * block are what caught it.
     *
     * Nothing about the reasoning changed — a window selection is still not a sentence a player
     * reads — so a reader looking for it will find it on the function that now carries the literal.
     */
    {
      reason:
        'Chooses a horizon, and authors nothing — the same scanner artefact `shiftReportWindowFor` ' +
        'was excluded for until GitHub issue #315 moved its literal out of this package (see the ' +
        'note above). `runHorizonOf` answers *which of the two kinds of run this ' +
        'state is*, and both of its values are members of `shift/types.ts#RunHorizon`: `period`, ' +
        'and `whole-day`, which is derived **only** because the hyphen reads to the two-adjacent-' +
        'words scanner as a phrase. Nothing it returns is shown to anybody. What a player reads is ' +
        'the **bar** `shift/goals.ts#goalsForDay` builds from it, and `goalsForDay` is driven ' +
        'already — so putting this in an adapter would be a coverage claim for prose that does not ' +
        'exist. That its answer is *right* is not a string question either, and is asserted in ' +
        '`shift/dayLength.test.ts` against the template the same state resolves to, on four ' +
        'buildings across three windows. **The exclusion is load-bearing in a second way**: this ' +
        'is the one expression both shells read, and the defect it closed was the Everyday rail ' +
        'and the Engineer rail grading one run against different ceilings — so the thing worth ' +
        'checking here was never its literals, and `everyday/host.test.ts` checks it by giving ' +
        'both shells one state and requiring one set of bars.',
      ids: ['shift/dayLength.ts#runHorizonOf'],
    },
    {
      reason:
        'Refuses an illegal rung in `data/contract-ladder.json` — a rate outside its profile’s ' +
        'declared range, a bank the building does not have, a machine at a speed its class ' +
        'forbids — and every string it returns is addressed to a **content author**, not to a ' +
        'player. GitHub issue #382. It is derived only because a refusal has to say what is wrong ' +
        'in words, which the two-adjacent-words scanner reads as prose. No screen renders any of ' +
        'it: `dev/data.ts` folds the list into `BrowserResources.warnings` beside a building’s own ' +
        'cross-validation, which is the same disposition every other loader diagnostic in this ' +
        'repository has, and `shift/ladder.test.ts` is where an issue is a failing test rather ' +
        'than a sentence. Putting it in an adapter would be a coverage claim about words a player ' +
        'can never reach — and the thing that *is* worth checking about this function, that it ' +
        'refuses the right rungs, is asserted against the real `data/` rather than against its ' +
        'wording.',
      ids: ['shift/ladder.ts#contractLadderIssues'],
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
    {
      reason:
        'A decoder with no sentence in it. `patienceFromCandidate` turns the Parameters tab’s live ' +
        'point into a `PatienceConfig`, and every literal the derivation sees in it is a parameter ' +
        'id (`sim.patience.meanS`) or a distribution name (`exponential`) — `core`’s vocabulary, ' +
        'not prose, and nothing it returns is a string at all. It is `dev/dom.ts`’s case at the ' +
        'other end of the pipe: the strings near it belong to somebody else, and driving it would ' +
        'put a schema id in the corpus under a decoder’s name.',
      ids: ['dev/parameterForm.ts#patienceFromCandidate'],
    },
    {
      reason:
        'Worker-lifecycle prose — the shift runner’s two lines, *simulating the shift: 12 s so ' +
        'far, about 300 people expected … not progress*, and its cancel sentence. **Player-facing, ' +
        'and not driven here**, said plainly: producing either one means starting a run, holding a ' +
        'worker and advancing a clock, which is the same *cannot be reached from this context* the ' +
        'DOM-bound group above states about a mount — the corpus hands an adapter a finished ' +
        'recording, and these sentences exist only while there is not one yet. ' +
        '`dev/shiftRunner.test.ts` drives the shipped runner through a worker it answers for and ' +
        'asserts both, including the clause that stops the elapsed counter being read as progress; ' +
        'that is weaker than the search and is stated as a limitation rather than presented as ' +
        'coverage.\n\n' +
        '`createOffThreadRunner` joins it on exactly that ground and with one narrower sentence ' +
        '— *the run worker failed to start: …* — which three surfaces quote inside a refusal of ' +
        'their own (GitHub issue #165). It is the same unreachability: producing that string means ' +
        'a worker that did not load, and the corpus hands an adapter a finished recording. ' +
        '`dev/offThreadRuns.test.ts` drives it through a worker it answers for, including the ' +
        'failed-to-start arm and the ordering claims a moved run makes possible; that is weaker ' +
        'than the search and is said as a limitation rather than offered as coverage.',
      ids: ['dev/offThreadRuns.ts#createOffThreadRunner', 'dev/shiftRunner.ts#createShiftRunner'],
    },
    {
      reason:
        'A storage slot with no sentence in it — **the id/key case again**. It is derived only ' +
        'because `PROFILE_KEY`’s value, `elevator-sim.everyday-profile`, reads to the two-' +
        'adjacent-words scanner as a phrase; it is a `localStorage` key in the same family as ' +
        '`persist/types.ts#SESSION_KEY`, and nothing it returns is shown to anybody. What it ' +
        'carries is a player’s own name and one of six colours, and the screen that draws those ' +
        'is `everyday/settingsView.ts`, driven by `EVERYDAY_SETTINGS`. Its refusals are refusals ' +
        'to *restore* — a version this build cannot read, a colour outside the curated six — and ' +
        'they produce no words at all, only `undefined`, which is the whole reason the caller has ' +
        'a fallback profile. `everyday/profile.test.ts` asserts each of them directly. **This ' +
        'group held three ids and holds one**: `saveProfile` was deleted by GitHub issue #224 ' +
        '(one slot, one writer, and it takes both payloads), and `createProfileStore` moved to ' +
        'the group below because the clause *they produce no words at all* stopped being true of ' +
        'it the moment the store grew a progress notice — § D227’s stale exclusion, corrected on ' +
        'the commit that made it stale rather than a wave later. **It holds two again**: GitHub ' +
        'issue #170’s Units half added `loadUnits`, which is the same case exactly — it reads the ' +
        'same slot through the same `readEnvelope`, is derived for the same key, and returns one ' +
        'of two preference words that no screen prints. The words a player *reads* for that ' +
        'preference are `everyday/units.ts#UNITS_ROW_COPY`’s, driven by `EVERYDAY_SETTINGS`, and ' +
        'the figures it switches are `speedFigure`’s and `lengthFigure`’s, driven by ' +
        '`EVERYDAY_STANDALONE_SCREENS` in both preferences.',
      ids: [
        'everyday/profile.ts#loadProfile',
        'everyday/profile.ts#loadUnits',
        /*
         * GitHub issue #229's default speed, the same case a third time: read through the same
         * `readEnvelope` under the same key, returning a number no screen prints as a sentence. The
         * words a player reads for it are `everyday/settingsView.ts#DEFAULT_SPEED_ROW_COPY`’s,
         * driven by `EVERYDAY_SETTINGS`.
         */
        'everyday/profile.ts#loadDefaultSpeed',
        /*
         * GitHub issue #258's Sound preference, the same case a fourth time: read through the same
         * `readEnvelope` under the same key, returning a boolean no screen prints. The words a
         * player reads for it are `everyday/audio.ts#SOUND_ROW_COPY`'s, driven by
         * `EVERYDAY_SETTINGS` in both faces, and what it switches is a sound rather than a
         * sentence — which is the one thing in this build no honesty property can read, and is
         * said in `everyday/audioEngine.ts`'s own docstring rather than left implied here.
         */
        'everyday/profile.ts#loadSound',
      ],
    },
    {
      reason:
        'An address and a ceiling — **the id/key case again**, on GitHub issue #245’s report block ' +
        '(`everyday/support.ts`). Neither is a sentence and neither is drawn anywhere. ' +
        '`SUPPORT_REPORT_FORM` is the machine address of the repository’s own new-issue form, ' +
        'derived only because the scanner reads two hyphen-joined words in it as a phrase, in the ' +
        'same family as `persist/types.ts#SESSION_KEY`; the reader never sees it, they see the ' +
        'page it opens. `SUPPORT_BROWSER_LIMIT` is the number 300, derived for a stranger reason ' +
        'still and one worth recording rather than working around: a declaration’s span runs to the ' +
        '**next declaration**, and `interface` and `type` are not declarations to this scanner — so ' +
        'this constant’s span swallows the five type declarations below it, one of which is a union ' +
        'carrying `run-partly-carried`, which reads to the two-adjacent-words test as prose. The ' +
        'constant is therefore derived for a literal that is a member of a type rather than ' +
        'anything a surface renders. **What a reader actually ' +
        'meets for both is driven**: the block’s every sentence, in every state, by ' +
        '`EVERYDAY_SUPPORT`, which also drives the report the address carries.',
      ids: ['everyday/support.ts#SUPPORT_BROWSER_LIMIT', 'everyday/support.ts#SUPPORT_REPORT_FORM'],
    },
    {
      reason:
        'The Everyday slot’s progress half — **player-facing, and not driven here**, said plainly ' +
        'in `dev/shiftRunner.ts`’s own form a few groups above. GitHub issue #224 made the solved ' +
        'fix cases and the gauntlet rating survive the tab, and gave every refusing path a ' +
        'sentence: an empty ladder is exactly what a player who has earned nothing sees, so a ' +
        'silent refusal here would read as *your afternoon did not happen*. Producing one of ' +
        'those sentences means handing this module a `SessionStore` whose bytes are corrupt, ' +
        'whose version is unreadable, or whose payload is past `PROGRESS_BUDGET_CHARACTERS` — and ' +
        'the corpus hands an adapter a finished recording, never a storage port, which is the ' +
        'same *cannot be reached from this context* the DOM-bound group states about a mount. ' +
        '`everyday/profile.test.ts` asserts every sentence against a fabricated store, and ' +
        '`everyday/progress.browser.test.ts` asserts the corrupt-store one on the shipped page ' +
        'after a real reload; both are weaker than the search and are stated as a limitation ' +
        'rather than presented as coverage.',
      ids: [
        'everyday/profile.ts#PROGRESS_REFUSALS',
        'everyday/profile.ts#loadProgress',
        'everyday/profile.ts#saveEveryday',
        'everyday/profile.ts#createProfileStore',
      ],
    },
    {
      reason:
        'Validator reasons that reach no screen — the shape `persist/validate.ts` established and ' +
        'the reason this group is separate from the one above rather than folded into it. Both ' +
        'answer *why are these bytes not ours*, in a sentence rather than a boolean so that a ' +
        'refusal can name the field that was wrong; and `everyday/profile.ts#loadProgress` ' +
        'collapses every one of them to the single player sentence `PROGRESS_REFUSALS.shape`, so ' +
        'no string either of them composes is ever rendered. `ladderEntryOf` is here for the ' +
        '**id case** instead: it authors nothing at all, returning a `LadderEntry` whose only ' +
        'strings are a dispatcher id, a name the library supplied and a weight-vector digest — ' +
        'every word on the row it becomes is `ladderRowsOf`’s, which the `GAUNTLET` adapter ' +
        'drives. `gauntlet/ladder.test.ts` asserts all three directly.',
      ids: [
        'gauntlet/ladder.ts#savedRatingIssue',
        'gauntlet/ladder.ts#ladderEntryOf',
        'gauntlet/rating.ts#ratedCaseIssue',
      ],
    },
    {
      reason:
        'The **id case**, and it is derived only because GitHub issue #264 gave it a call it did ' +
        'not have. `calendarAsks` returns a list of `CalendarShift` field names — `goodsCars`, ' +
        '`splitBias` — and authors no sentence at all; the scanner reaches it because deciding ' +
        '`goodsCars` now means *reserving against a real bank* rather than reading the period’s ' +
        'declaration, so the chain runs through `reserveCars` to `carRuntimeId`, whose ' +
        '`${bankId}-${carId}` is a runtime **car id** and the hyphen is what the two-adjacent-' +
        'words scanner reads as a phrase. `shift/calendar.ts#calendarPatch`’s own caller, ' +
        '`dev/state.ts#shiftRunConfigOf`, is excluded above through the same chain and for the ' +
        'same reason. What a player is *told* about a period is `calendarLine`’s caption, driven ' +
        'by the shift surfaces, and the refusal these field names become is ' +
        '`scope/runIdentity.ts#runIdentityIssues`’, excluded under its own name — the two are ' +
        'required to agree in `scope/runIdentity.test.ts`, which is where issue #264’s defect is ' +
        'measured rather than argued.',
      ids: ['shift/calendar.ts#calendarAsks'],
    },
    {
      reason:
        'A **transcription that is never drawn** — GitHub issue #182, § D435. ' +
        '`GUIDE_WATCHING_NOTE` is `GAMEPLAY_AND_NAVIGATION.md` § 3.3’s own `stage · watching` ' +
        'cell, kept in the source so the deviation beside it can be read against the sentence it ' +
        'departs from rather than asserted. Nothing draws it: `ACTION_BAR_ROWS` carries ' +
        '`WATCHING_NOTE`, which `EVERYDAY_MENU` covers and this search sweeps through that ' +
        'adapter’s row loop. Excluded rather than driven, because seeding it would put the word ' +
        '§ 14.1 calls a defect into the corpus as though a surface had said it — and the deviation ' +
        'exists precisely so no surface does. What holds the pair honest is not this search: ' +
        '`everyday/actionBar.test.ts` asserts in both directions that the guide’s cell is still ' +
        'first-person and the shipped one is not, so a guide revision that drops the pronoun makes ' +
        'the deviation red rather than merely unnecessary.',
      ids: ['everyday/actionBar.ts#GUIDE_WATCHING_NOTE'],
    },
    {
      reason:
        'The second **transcription that is never drawn**, on the row above’s exact ground — ' +
        'GitHub issue #364, § D525. `GUIDE_MENU_PRIMARY` is `GAMEPLAY_AND_NAVIGATION.md` § 3.3’s ' +
        'own menu cell, which names four modes because it was written against § D335’s four-tile ' +
        'menu. § D525 replaced that with three and `docs/39` § 2 records § D335 as superseded in ' +
        'part, so the shipped cell is three labels and this constant is what it replaced. Nothing ' +
        'draws it: `ACTION_BAR_ROWS`’ menu row carries the shipped three, which `EVERYDAY_MENU` ' +
        'covers and this search sweeps through that adapter’s row loop. Seeding it would put two ' +
        'retired tiles’ labels into the corpus as though a menu still offered them. What holds the ' +
        'pair honest is `everyday/actionBar.test.ts`, which asserts in both directions that the ' +
        'transcription still names four and the shipped row does not match it — so a lane that ' +
        'quietly reverted the menu to four tiles goes red rather than passing by matching an old ' +
        'transcription.',
      ids: ['everyday/actionBar.ts#GUIDE_MENU_PRIMARY'],
    },
    {
      reason:
        'Two storage keys — GitHub issue #375. `CAREER_STORAGE_KEY` is the `localStorage` slot the ' +
        'career is written under, and `CAREER_QUARANTINE_KEY` is where a *refused* career\u2019s bytes ' +
        'are set aside so the refusal\u2019s promise is kept. Neither is prose and no surface draws ' +
        'either: they are the identifiers ' +
        '`everyday/careerStore.ts` addresses the slot with. The refusal *sentences* in the same ' +
        'file are player-facing and are driven rather than excluded — `decodeCareer` is the ' +
        'producer the sweep names, the `EVERYDAY_CAMPAIGN` adapter seeds all three grounds, and ' +
        '`everyday/campaignScreens.ts` draws whichever one the load produced.',
      ids: [
        'campaign/careerPersist.ts#CAREER_STORAGE_KEY',
        'campaign/careerPersist.ts#CAREER_QUARANTINE_KEY',
      ],
    },
    {
      reason:
        'A **composition that authors no string** — GitHub issue #221. `dailyBoardOf` turns two ' +
        'client reads into one of four states, and every word it can put on a screen belongs to ' +
        'somebody else: `detail` is `menu/client.ts`’s own failure sentence, `note` is the ' +
        'server’s. It has no literal of its own, and the deriver collected it because ' +
        '`literalsIn` scans comments too — a backticked module path in the docstring reads as ' +
        'prose to `PROSE`. Over-collection is this instrument’s safe direction, so the answer is ' +
        'to classify it rather than to loosen the scan. What holds it honest is not this search: ' +
        'the states are seeded through `everyday/boardScreen.ts#dailyBoardViewOf`, which is the ' +
        'surface that decides what any of them says, and `everyday/host.test.ts` drives the ' +
        'composition itself against stubs.',
      ids: ['everyday/host.ts#dailyBoardOf'],
    },
    {
      reason:
        'Two more compositions that author no string, and one metric name — GitHub issue #221. ' +
        '`challengeTodayOf` is `dailyBoardOf` again for the challenge read: two client calls in, ' +
        'one of four states out, and every word it can put on a screen is somebody else’s — ' +
        '`detail` is `menu/client.ts`’s failure sentence, the challenge’s name, brief and clock ' +
        'note are the server’s. What holds it honest is not this search: all five states are ' +
        'seeded through `everyday/boardScreen.ts#challengeTabViewOf`, which is the surface that ' +
        'decides what any of them says, and `everyday/host.test.ts` drives the composition itself ' +
        'against stubs. `DAILY_BOARD_METRIC` and `CHALLENGE_BOARD_METRIC` are the axes the two ' +
        'reads ask a board for — `awtS` and `meanAwtS`, wire field names rather than prose — and ' +
        'the deriver collects the first only because a declaration’s span runs to the next one and ' +
        '`EverydayPostOutcome`’s `no-server` tag reads as two hyphenated words to `PROSE`. ' +
        '`CHALLENGE_BOARD_METRIC` is deliberately **not** listed: the deriver does not collect it, ' +
        'because its own span holds no such literal — which is the difference between a name that ' +
        'needs excusing and one that never came up. ' +
        'Over-collection is this instrument’s safe direction, so the answer is to classify rather ' +
        'than to loosen the scan.',
      ids: [
        'everyday/host.ts#challengeTodayOf',
        'everyday/host.ts#DAILY_BOARD_METRIC',
      ],
    },
    {
      reason:
        'The wire body for a posted run — GitHub issue #221. `runSubmissionOf` is ids, numbers and ' +
        'a seed: a building id, a dispatcher id, a demand template id, a duration, a window and ' +
        'the run’s rule rows, every one of them a key the server resolves against its own `data/`. ' +
        'The deriver reaches it transitively through `shiftSubmittedSelection` → ' +
        '`shiftDemandTemplateId`, whose `rise-and-fall` is a template id that reads as two ' +
        'hyphenated words. Nothing it returns is drawn: what a player reads about posting is ' +
        '`everyday/postRun.ts#postRunViewOf`, which the daily loop’s adapter seeds in all seven ' +
        'states, and the server’s own refusals, which that view carries unparaphrased.',
      ids: ['dev/state.ts#runSubmissionOf'],
    },
    {
      reason:
        'A vocabulary id or a stream name, not prose — GitHub issues #171 and #169 item 1, § D507. ' +
        '`coach-party` and `campaign-incident` are hyphenated identifiers the derivation reads as ' +
        'two adjacent words: the first is a `ShiftEventId` the contract calendar files a day under, ' +
        'the second the name `deriveStreamSeed` mixes into the breakdown draw. Neither reaches a ' +
        'screen as itself. What a player reads of a calendared or drawn day is ' +
        '`shift/events.ts#SHIFT_EVENTS`’ name and note, which `EVERYDAY_STAGE` drives through ' +
        '`campaign/incidents.ts#campaignIncidentOf`, and the two ids here are classified rather ' +
        'than the scan loosened, on `dailyBoardOf`’s ground above.',
      ids: [
        'campaign/calendar.ts#CONTRACT_CALENDAR',
        'campaign/calendar.ts#calendarDaysOf',
        'campaign/calendar.ts#calendarEventIdFor',
        'campaign/incidents.ts#CAMPAIGN_INCIDENT_STREAM',
        'campaign/incidents.ts#campaignEventFor',
      ],
    },
    {
      reason:
        'A stream name and a table of measurements, not prose — GitHub issue #208, § D514. ' +
        '`first-session` is the name `deriveStreamSeed` mixes into the first tower’s draw, and ' +
        '`LEGIBILITY_SWEEP` is § D512’s table as data (`garden-apartments`, a count, a median), ' +
        'from which `shift/firstSession.ts` derives the eligible set. What a player reads of the ' +
        'draw is `FIRST_SESSION_LINE`, which `EVERYDAY_TODAY` seeds on a first day and covers.',
      ids: [
        'shift/firstSession.ts#FIRST_SESSION_STREAM',
        'shift/firstSession.ts#firstSessionContractFor',
        'shift/legibility.ts#LEGIBILITY_SWEEP',
      ],
    },
    {
      reason:
        'A template id, not prose — GitHub issue #220, § D515. `endless-rush` names the record in ' +
        '`data/traffic-profiles.json` and `rushPatchOf` writes it into `ViewerState.freePlay`; what ' +
        'a player reads of the rush is `EVERYDAY_RUSH`’s result and stage header, which it seeds.',
      ids: ['everyday/rush.ts#RUSH_TEMPLATE_ID', 'everyday/rush.ts#rushPatchOf'],
    },
    {
      reason:
        'A table keyed by building id and a kind vocabulary, not prose — GitHub issue #169 item 3, ' +
        '§ D510. `OFFER_FEES` is `garden-apartments: 3` six times over and `offerFeeOf` reads it; ' +
        '`offerRefusalOf` answers `held` / `unpriced` / `no-slot` / `at-risk` and a number, never a ' +
        'sentence. What a player reads of an offer — its terms, its quirk, its button and the ' +
        'guide’s two refusals — is `everyday/campaignModel.ts#offersView`’s, which the campaign ' +
        'adapter drives over every snapshot it renders.',
      ids: [
        'campaign/economy.ts#OFFER_FEES',
        'campaign/economy.ts#offerFeeOf',
        'campaign/career.ts#offerRefusalOf',
      ],
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

/**
 * **How many DOM entry points the sweep cannot drive, derived here rather than transcribed there**
 * — GitHub issue #176, [§ D421](../../../../DECISIONS.md).
 *
 * Phase 9's verdict is *accepted with named gaps*, and one of the named gaps is a count: *"three
 * DOM panels are statically swept rather than driven"*. It was published in six places, in five
 * files, and **not one of them named which three**. Two of those places sit inside the verdict
 * itself, where a named gap is part of the verdict rather than commentary on it.
 *
 * **Every reading of *three* fails, and the narrowest one fails inside this file.** The docstring
 * above `mountLeftRail` is the only place that ever enumerated the panels by name; it named three
 * and the id list beneath it has held four since `mountRightRail` joined. On the wide readings the
 * answer is **{@link MOUNT_SHAPE} 17** and **{@link SCREEN_ROW_SHAPE} 16**. `docs/14` shows how a
 * count becomes a label: it cites the phrase as the *name* of a category and then puts a fifth
 * panel, `mountBuildingEditor`, into it. Nothing there is wrong about the gap — what went wrong is
 * that the number stopped being a measurement, and a label cannot go stale visibly.
 *
 * ## The reading this gate publishes, decided rather than assumed
 *
 * **33 — every DOM entry point in {@link NOT_PLAYER_FACING} — published as its two components,
 * 17 mounts and 16 screen-registry rows.** Two halves to the argument:
 *
 * - *Why not 17.* The classifier's own reasons put all 33 in one class. Thirty-two are in the
 *   `DOM-bound` group, and `dev/watchPanel.ts#mountWatchPanel` is excluded a few groups later as
 *   *"DOM- or fetch-bound … on `dev/fixitPanel.ts`'s own established ground"*. A figure that
 *   stopped at the mounts would leave sixteen exclusions taken on that same ground uncounted —
 *   which is exactly how `docs/14` came to put a fifth panel into a class of three: the published
 *   class was narrower than the thing everybody meant by it.
 * - *Why not a bare 33.* Calling the screen rows *not driven* full stop would be a **new** false
 *   statement rather than a corrected count, which is § D227's trap one layer in. Each of the
 *   sixteen exclusions names the adapter that renders that screen's words — `EVERYDAY_CAMPAIGN`,
 *   `EVERYDAY_STAGE`, `GAUNTLET`, `EVERYDAY_SETTINGS` — so their **pure halves are driven**. So is
 *   most of what the mounts sit on. What is unswept, in both groups alike, is only what the entry
 *   point authors *inline*, and that reaches the static R10 sweep at the bottom of this file and
 *   **no other property of the ten**. The decomposition and that clause therefore travel with the
 *   number wherever it is published; the number alone is not the claim.
 *
 * ## Why the derivation lives in this file rather than in a gate of its own
 *
 * `everyday/viewportGateClaims.test.ts` is the model — re-derive the count from the artefact, fail
 * naming every stale site — and it is a separate file because its artefact is *on disk* and any
 * test can glob it. This artefact is a module-private literal in this file. A gate elsewhere would
 * have to re-parse it, and the measurement recorded on issue #176 says what that costs: the first
 * parser written over these literals extracted every quoted string and returned **279** "ids",
 * because the prose in each `reason` is full of apostrophes. Reading the array directly cannot
 * have that failure mode. The instrument is the thing being reported, so it is the short one.
 */
const MOUNT_SHAPE = /#mount[A-Z]/u;

/** A registry row whose `mount` needs a document — `everyday/stageScreen.ts#STAGE_SCREEN`. */
const SCREEN_ROW_SHAPE = /#[A-Z0-9_]+_SCREEN$/u;

/** Every exclusion matching `shape`, carrying the reason its group gives, so both can be asserted. */
const excludedEntryPoints = (
  shape: RegExp,
): readonly { readonly id: string; readonly reason: string }[] =>
  NOT_PLAYER_FACING.flatMap((group) =>
    group.ids.filter((id) => shape.test(id)).map((id) => ({ id, reason: group.reason })),
  );

describe('the count of statically swept DOM entry points is derived, not transcribed', () => {
  const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

  /**
   * The five files carrying the six sites, every one of which must state the figure.
   *
   * `docs/05-roadmap.md` holds two of the six; this gate reads whole files, so a document that
   * carries the claim twice is one entry here and both of its sentences are checked.
   */
  const CLAIM_SITES: readonly string[] = Object.freeze([
    'CLAUDE.md',
    'GAPS.md',
    'docs/05-roadmap.md',
    'docs/14-building-behaviour-contract.md',
    'docs/18-everyday-mode-tree-audit.md',
  ]);

  /** The total, in the one noun phrase every site is required to carry. */
  const TOTAL_SHAPE = /\*{0,2}(\d+)\*{0,2} statically swept DOM entry points/gu;

  /** The decomposition, wherever a site has room for it. Required somewhere, not everywhere. */
  const SPLIT_SHAPE =
    /\*{0,2}(\d+)\*{0,2} mounts and \*{0,2}(\d+)\*{0,2} screen-registry rows/gu;

  /**
   * The superseded figure, which may not stand as a live claim.
   *
   * Struck-through spans are removed before this runs, on `viewportGateClaims.test.ts`'s rule: this
   * repository keeps superseded figures standing with the correction beside them, so **the
   * machine-read shape belongs to the live claim only** and a figure written `~~three DOM panels~~`
   * is history rather than an assertion. Teaching the pattern to recognise supersession markers
   * would put the distinction in a regex where the next reader cannot see it.
   *
   * `DECISIONS.md`, `ISSUE_TRIAGE_PLAN.md` and `ISSUE_WORKER_LEDGER.md` also carry the phrase and
   * are deliberately **not** scanned: the first is the record of what was decided when, and the
   * other two are this issue's own triage. Quoting a wrong figure in order to correct it is not
   * publishing it.
   */
  const SUPERSEDED_SHAPE = /\b(?:three|3) DOM panels/giu;

  it('finds DOM entry points to count, and every one is excluded on DOM ground', () => {
    const mounts = excludedEntryPoints(MOUNT_SHAPE);
    const screenRows = excludedEntryPoints(SCREEN_ROW_SHAPE);

    /*
     * The non-vacuity guards, and they are on the instrument rather than on the defect. A shape
     * edited until it matched nothing would take every count to zero and make the case below pass
     * against any figure at all — wave 8's fifth false-negative shape, arriving in the instrument
     * built to prevent it.
     */
    expect(
      mounts.length,
      'no `#mountXxx` exclusion was found, so the mount count is derived from nothing',
    ).toBeGreaterThan(0);
    expect(
      screenRows.length,
      'no `#*_SCREEN` exclusion was found, so the screen-row count is derived from nothing',
    ).toBeGreaterThan(0);

    const both = mounts.filter((mount) => screenRows.some((row) => row.id === mount.id));
    expect(
      both.map((entry) => entry.id),
      'the two shapes must partition the DOM entry points; an id counted by both would be counted ' +
        'twice in the published total',
    ).toEqual([]);

    /*
     * What makes the count a class rather than a spelling. Both shapes are syntactic, and a
     * syntactic count is only worth publishing if every member is there for the reason the
     * sentence gives. Every one of the 33 is excluded by a group whose reason says *DOM* —
     * `DOM-bound` for thirty-two of them, `DOM- or fetch-bound` for `mountWatchPanel`. A future
     * `mountXxx` excluded for some other reason goes red here and asks the question, instead of
     * quietly joining a figure six documents publish.
     */
    const ungrounded = [...mounts, ...screenRows]
      .filter((entry) => !entry.reason.includes('DOM'))
      .map((entry) => entry.id)
      .sort((a, b) => a.localeCompare(b));
    expect(
      ungrounded,
      'an exclusion shaped like a DOM entry point is not excused on DOM ground. Either it belongs ' +
        'in a group whose reason says so, or it is not one of the surfaces the published figure is ' +
        'about — and a count that includes it would be a different claim from the sentence.',
    ).toEqual([]);
  });

  it('publishes the figure every claim site carries as the one this array derives', () => {
    const mounts = excludedEntryPoints(MOUNT_SHAPE).length;
    const screenRows = excludedEntryPoints(SCREEN_ROW_SHAPE).length;
    const total = mounts + screenRows;

    const wrong = new Set<string>();
    const silent: string[] = [];
    let splits = 0;
    for (const site of CLAIM_SITES) {
      const raw = readFileSync(join(REPO, site), 'utf8');
      /* See SUPERSEDED_SHAPE: a struck-through figure is history, so it is removed before any
         shape is read — including the live ones, so a corrected sentence cannot satisfy this gate
         by quoting the number it superseded. */
      const text = raw.replace(/~~[^~]*~~/gu, '');
      let totals = 0;
      for (const hit of text.matchAll(TOTAL_SHAPE)) {
        totals += 1;
        if (Number(hit[1]) !== total) wrong.add(`${site}: "${hit[0].trim()}" — expected ${String(total)}`);
      }
      for (const hit of text.matchAll(SPLIT_SHAPE)) {
        splits += 1;
        if (Number(hit[1]) !== mounts || Number(hit[2]) !== screenRows) {
          wrong.add(
            `${site}: "${hit[0].trim()}" — expected ${String(mounts)} mounts and ` +
              `${String(screenRows)} screen-registry rows`,
          );
        }
      }
      const superseded = [...text.matchAll(SUPERSEDED_SHAPE)];
      for (const hit of superseded) wrong.add(`${site}: "${hit[0]}" is the superseded figure, live`);
      if (totals === 0) silent.push(site);
    }

    expect(
      silent,
      'a document that carries the statically-swept-DOM-panels gap states no figure this gate ' +
        'reads. Either the sentence moved, in which case teach TOTAL_SHAPE, or the claim was ' +
        'deleted, in which case drop the file from CLAIM_SITES — but a site left out of both is a ' +
        'site free to acquire a bare count again, which is the whole defect.',
    ).toEqual([]);
    expect(
      splits,
      'no site states the decomposition. The bare total is not the claim: sixteen of the entry ' +
        'points are screen-registry rows whose pure halves ARE driven, so a figure published ' +
        'without its two components invites the reading that all 33 are unchecked.',
    ).toBeGreaterThan(0);
    expect(
      [...wrong].sort((a, b) => a.localeCompare(b)),
      `NOT_PLAYER_FACING excludes ${String(total)} DOM entry points — ${String(mounts)} mounts and ` +
        `${String(screenRows)} screen-registry rows. A count typed into a document is stale as of ` +
        'the next commit that adds a screen; this figure stood at *three* across six sites, in a ' +
        'phase verdict, while the narrowest reading of it was already four in this file. ' +
        'Re-derive, do not copy forward, and strike a superseded figure through rather than ' +
        'leaving it standing as a live one.',
    ).toEqual([]);
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
      {
        module: 'fixit/parse.ts',
        contains: 'probability word.',
        why: 'the same refusal, one data file over — `parseFixitCases` quoting the rule to a case author.',
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
