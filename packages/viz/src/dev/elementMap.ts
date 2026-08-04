/**
 * Every element id the viewer resolves, as one typed manifest — and a resolver that reports **all**
 * of them missing at once instead of dying on the first.
 *
 * ## The problem this fixes
 *
 * `main.ts` used to resolve 73 elements with a local helper that threw on the first absent id:
 *
 * ```text
 * missing #stage in index.html
 * ```
 *
 * True, and nearly useless to anyone replacing the markup. It names one id out of however many are
 * actually absent, so a new page is fixed one reload at a time — and it names *no* id at all if
 * `#error` is the one that went, because the page's own last-resort error slot was itself one of
 * the 73. There was also no list anywhere of what the page must contain: the answer was 73 calls
 * spread down a 1 600-line file, in among the event wiring.
 *
 * So the ids are data now, the resolution is one pass that collects everything it could not find,
 * and the list is a document a UI author can read.
 *
 * **That claim was tested by the design refactor and it held.** The page below is not the page the
 * manifest was extracted from: `docs/12-design-handoff.md` replaced the five-tab instrument panel
 * with the handoff's three-column shift surface, and the whole markup was rewritten. The manifest
 * moved in the same commit, `elementMap.test.ts` named every id that had gone, and nothing had to
 * be found by reloading.
 *
 * ## Why the manifest is typed as {@link IdsFor}<{@link Elements}> rather than a plain object
 *
 * Because a manifest that can drift from the interface is the thing this repository has shipped
 * eleven times over: a declaration nothing consults. {@link IdsFor} makes the two the *same*
 * shape — a field on `Elements` with no id in the manifest does not compile, and an id in the
 * manifest with no field does not either. That is stronger than a test, because it holds for the
 * shape rather than for the ids a test happened to enumerate.
 *
 * The ids themselves are checked against `index.html` in `elementMap.test.ts`, in both directions:
 * every id here must exist there, and every id there that is *not* here is listed, because the
 * second list is the honest answer to *"what may a new page drop?"*
 *
 * ## What this module does not do
 *
 * **It does not make any element optional.** Every id below is required, because the mounts
 * dereference every one of them unconditionally — a `requirement: 'optional'` field here would be
 * a promise the page does not keep, which is exactly the failure mode described above wearing the
 * opposite mask. Making a surface genuinely optional means guarding its wiring, one surface at a
 * time, and is a change to a mount rather than to this list.
 *
 * What it does do is turn *"the page died"* into *"the page is missing these four things"*, which
 * is the difference between a crash and a diagnosis.
 */

import type { BatchPanelElements } from './batchPanel.js';
import type { CampaignPanelElements } from './campaignPanel.js';

/**
 * The surfaces, in tab order — `D11`, and the `tab` key in the URL.
 *
 * A list rather than a pair of fields. It was a pair until W4 (`docs/10` § 11) added a third
 * surface, and the pair form had the tab machinery written out twice: two `setAttribute` calls,
 * two `tabIndex` assignments, two `hidden` assignments and a hand-written arrow-key table of
 * `[tab, other, which]` triples that only works for exactly two tabs. Three of anything is where
 * that stops being cheaper than a loop.
 *
 * It lives here rather than in `main.ts` because {@link Elements} keys two of its records by it, so
 * the tab list and the ids for those tabs are one fact. Adding an eleventh surface is then a
 * compile error until both its button and its panel have an id.
 *
 * **The first three are the handoff's** (`docs/12-design-handoff.md` § 1.3 M1) and are the only
 * ones visible at rest. The four editors are *contextual*: their buttons carry `hidden` in the
 * markup and are revealed when the rail opens one, which is the handoff's only route to them.
 * The last three are the instrument surfaces retained from the shipped viewer — § 2.3 of the
 * handoff doc argues why deleting them to match a design that had not heard of them would delete
 * the only surface on which *"this dispatcher is better"* can ever be said (R2).
 */
export const TABS = [
  'run',
  'report',
  'scenarios',
  'dispatcher',
  'traffic',
  'machines',
  'building',
  'compare',
  'campaign',
  'parameters',
] as const;
export type TabName = (typeof TABS)[number];

/** The four the handoff reaches only from the right rail, never from the strip at rest. */
export const CONTEXTUAL_TABS: readonly TabName[] = Object.freeze([
  'dispatcher',
  'traffic',
  'machines',
  'building',
]);

export const isTabName = (value: string | null): value is TabName =>
  value !== null && (TABS as readonly string[]).includes(value);

/** The right rail's four segments — `docs/12` § 1.4 R1. */
export const RAIL_SEGMENTS = ['dispatcher', 'traffic', 'building', 'machines'] as const;
export type RailSegment = (typeof RAIL_SEGMENTS)[number];

export const isRailSegment = (value: string | null): value is RailSegment =>
  value !== null && (RAIL_SEGMENTS as readonly string[]).includes(value);

/* -------------------------------------------------------------------------- *
 * The surfaces, one interface each.
 *
 * Grouped rather than flat, for the reason `batch` and `campaign` were already
 * grouped: a mount takes its own sub-record and cannot reach a sibling's
 * elements, so "which surface owns this element" is answered by the type rather
 * than by grep.
 * -------------------------------------------------------------------------- */

/** § 1.1 S3 — the header. */
export interface HeaderElements {
  readonly buildingName: HTMLElement;
  readonly buildingSub: HTMLElement;
  readonly clock: HTMLElement;
  readonly phaseLabel: HTMLElement;
  readonly dayLabel: HTMLElement;
  readonly tenantsLine: HTMLElement;
  /** § 4's mode toggle, and the place `mode/parity.ts` puts a refusal it finds. */
  readonly viewMode: HTMLSelectElement;
  readonly modeParity: HTMLElement;
  readonly banner: HTMLElement;
  /** The container the narrow-viewport rule steps aside — § 1.1 S5. */
  readonly right: HTMLElement;
  /**
   * The way back to the main menu — `docs/16` § 5 clause 5.
   *
   * There was none. `closeMenu()` only ever wrote `hidden = true`, nothing anywhere wrote `false`,
   * and `applyDeepLink` read seven fields of which none was the screen — so pressing Start or
   * Campaign ended the menu for the session.
   */
  readonly openMenu: HTMLButtonElement;
}

/** § 1.2 L1–L3 — the mood card and the four live stats. */
export interface MoodElements {
  readonly face: HTMLElement;
  readonly headline: HTMLElement;
  readonly sub: HTMLElement;
  readonly bar: HTMLElement;
  readonly legend: HTMLElement;
  /** Where `render/mood.ts`'s driver rows go — `docs/10` § 6 / D4, W6's U4. */
  readonly drivers: HTMLElement;
  readonly stats: HTMLElement;
}

/** § 1.2 L4, L5 — YOUR RUN and TODAY'S SHIFT. */
export interface ShiftElements {
  readonly streakLine: HTMLElement;
  readonly runFigures: HTMLElement;
  readonly history: HTMLElement;
  readonly event: HTMLElement;
  readonly note: HTMLElement;
  readonly goals: HTMLElement;
  readonly best: HTMLElement;
}

/** § 1.2 L6 — the honesty card. */
export interface HonestyElements {
  readonly card: HTMLElement;
  readonly glyph: HTMLElement;
  readonly title: HTMLElement;
  readonly plain: HTMLElement;
  readonly toggle: HTMLButtonElement;
  readonly maths: HTMLElement;
}

/** § 1.3 M2 — the coach ribbon. */
export interface CoachElements {
  readonly label: HTMLElement;
  readonly title: HTMLElement;
  readonly hint: HTMLElement;
  readonly progress: HTMLElement;
  readonly building: HTMLSelectElement;
  readonly pattern: HTMLSelectElement;
  /** § 4.1 — the select the handoff does not have, because a shift is a run and a run has a length. */
  readonly shiftLength: HTMLSelectElement;
  /**
   * § 4.7 — the control that runs what the three selects above it describe.
   *
   * It lived on the transport's second row until § 4.7, which put it three controls away from its
   * own inputs. The handoff has no requirement row for it at all: its prototype simulator steps in
   * real time, so pressing play *is* running.
   */
  readonly run: HTMLButtonElement;
  readonly allScenarios: HTMLButtonElement;
}

/** § 1.3 M3, M4 — the stage, its alarm and its legend. */
export interface StageElements {
  readonly canvas: HTMLCanvasElement;
  readonly alarm: HTMLElement;
  readonly alarmText: HTMLElement;
  readonly alarmSub: HTMLElement;
  readonly description: HTMLElement;
  /** The legend's row. Its four entries are filled from `WAIT_BANDS` — `main.ts`'s `drawLegend`. */
  readonly legend: HTMLElement;
  /**
   * The legend's static heading, resolved rather than rebuilt.
   *
   * The row's four entries are derived from `live/bands.ts` and its title is design copy, so the
   * title stays in the markup and the fill re-appends *this element* ahead of the entries. Without
   * a handle the shell would have to either carry the string a second time or reach for
   * `firstElementChild`, and the manifest exists so that neither is necessary.
   */
  readonly legendTitle: HTMLElement;
}

/**
 * § 1.3 M5 — the transport, plus the provenance block under it (`docs/12` § 4.7).
 *
 * The six the handoff specifies are {@link playPause}, {@link timeline}, {@link playhead},
 * {@link ticks}, {@link speedChips} and the click-to-scrub the timeline carries. Everything else
 * here is an obligation this simulator has and the handoff's prototype does not — a seed to
 * reproduce from, a replay to verify against, a recording to write and read, an export that leaves
 * the building. § 4.7 names each one and the obligation behind it; `run` is on {@link CoachElements}
 * rather than here, because it belongs beside its own inputs.
 */
export interface TransportElements {
  readonly playPause: HTMLButtonElement;
  readonly timeline: HTMLElement;
  readonly playhead: HTMLElement;
  readonly ticks: HTMLElement;
  readonly speedChips: HTMLElement;
  readonly stepBack: HTMLButtonElement;
  readonly stepForward: HTMLButtonElement;
  /** A `.chip[aria-pressed]`, not a checkbox — the handoff's own toggle. `docs/12` § 4.7. */
  readonly loop: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly error: HTMLElement;
  readonly verify: HTMLButtonElement;
  readonly saveRecording: HTMLButtonElement;
  readonly loadRecording: HTMLInputElement;
  readonly exportPng: HTMLButtonElement;
  readonly seed: HTMLInputElement;
  readonly bankFilter: HTMLSelectElement;
  readonly landingSelect: HTMLSelectElement;
}

/** § 1.3 M6 — the daily observation sheet. */
export interface ReportElements {
  readonly title: HTMLElement;
  readonly meta: HTMLElement;
  readonly lede: HTMLElement;
  readonly figures: HTMLElement;
  readonly verdict: HTMLElement;
  readonly streak: HTMLElement;
  readonly contract: HTMLElement;
  readonly cleared: HTMLElement;
  readonly clearedNote: HTMLElement;
  readonly takeNext: HTMLButtonElement;
  readonly goals: HTMLElement;
  readonly diagnosis: HTMLElement;
  readonly levers: HTMLElement;
  readonly forecastName: HTMLElement;
  readonly forecastNote: HTMLElement;
  readonly forecastDemand: HTMLElement;
  readonly taught: HTMLElement;
  readonly smallPrint: HTMLElement;
  readonly nextDay: HTMLButtonElement;
  readonly back: HTMLButtonElement;
}

/** § 1.3 M8 — the dispatcher editor. */
export interface DispatcherEditorElements {
  readonly list: HTMLElement;
  readonly editing: HTMLElement;
  readonly yoursCount: HTMLElement;
  readonly name: HTMLInputElement;
  readonly termsUsed: HTMLElement;
  readonly copyCurrent: HTMLButtonElement;
  readonly terms: HTMLElement;
  readonly flags: HTMLElement;
  readonly levers: HTMLElement;
  readonly dwellChips: HTMLElement;
  readonly dwellHint: HTMLElement;
  readonly summary: HTMLElement;
  readonly advice: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly save: HTMLButtonElement;
  readonly dirty: HTMLElement;
  readonly error: HTMLElement;
  readonly yours: HTMLElement;
}

/**
 * The weight-set selector's panel — `docs/17` § 5 finding 6, and the product's one genuine mid-run
 * mechanism.
 *
 * It lives **inside** the dispatcher surface rather than behind a tab of its own, because it is a
 * group lever in exactly the sense `group-levers` is: applied on top of whichever dispatcher is
 * driving, never a fork of one. An eleventh tab would also be an eleventh entry in {@link TABS},
 * which the rail, the deep link and the surface machinery all key on — a lot of machinery for a
 * block that belongs beside the door dwell.
 *
 * `controls` is the whole block and is hidden when the loaded file declares no patterns
 * (`docs/16` S7); `unavailable` sits outside it and carries the reason, so an absent panel is never
 * indistinguishable from an oversight.
 */
export interface SelectorEditorElements {
  /** Everything that is offered. Hidden when there is no pattern library to switch between. */
  readonly controls: HTMLElement;
  /** Why the panel is not offered. Hidden when it is. */
  readonly unavailable: HTMLElement;
  readonly policy: HTMLElement;
  readonly policyIssue: HTMLElement;
  readonly line: HTMLElement;
  readonly scalars: HTMLElement;
  readonly patterns: HTMLElement;
  /** Refusals about the arm map as a whole, rather than about one pattern. */
  readonly mapIssue: HTMLElement;
  readonly reset: HTMLButtonElement;
  readonly changed: HTMLElement;
}

/** § 1.3 M9 — the traffic editor. */
export interface TrafficEditorElements {
  readonly editing: HTMLElement;
  readonly summary: HTMLElement;
  readonly name: HTMLInputElement;
  readonly orderChips: HTMLElement;
  readonly orderNote: HTMLElement;
  readonly rows: HTMLElement;
  readonly preview: HTMLElement;
  readonly previewTicks: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly save: HTMLButtonElement;
  readonly dirty: HTMLElement;
  readonly error: HTMLElement;
  readonly footnote: HTMLElement;
}

/** § 1.3 M10 — the machine-class editor. */
export interface MachinesEditorElements {
  readonly editing: HTMLElement;
  readonly name: HTMLInputElement;
  readonly rows: HTMLElement;
  readonly speedChips: HTMLElement;
  readonly summary: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly save: HTMLButtonElement;
  readonly dirty: HTMLElement;
  readonly error: HTMLElement;
}

/** § 1.3 M11 — the building editor's spec column and its elevation. */
export interface BuildingEditorElements {
  readonly editing: HTMLElement;
  readonly blank: HTMLButtonElement;
  readonly name: HTMLInputElement;
  readonly rows: HTMLElement;
  readonly occupancy: HTMLElement;
  readonly openMachines: HTMLButtonElement;
  readonly classChips: HTMLElement;
  readonly classPlain: HTMLElement;
  readonly classLimits: HTMLElement;
  readonly classWarning: HTMLElement;
  readonly loadChips: HTMLElement;
  readonly speedChips: HTMLElement;
  readonly skyChips: HTMLElement;
  readonly summary: HTMLElement;
  readonly advice: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly save: HTMLButtonElement;
  readonly dirty: HTMLElement;
  readonly error: HTMLElement;
  readonly elevationBody: HTMLElement;
  readonly elevationOccNote: HTMLElement;
  readonly elevationLevelOcc: HTMLButtonElement;
  readonly elevationClearRanges: HTMLButtonElement;
  readonly elevationLegend: HTMLElement;
  readonly elevationNote: HTMLElement;
  readonly elevationWarning: HTMLElement;
  readonly addShaft: HTMLButtonElement;
  readonly removeShaft: HTMLButtonElement;
  /**
   * `docs/10` § 10.2's access-zoning controls — W8's open half.
   *
   * A separate block from the elevation above, because the elevation draws **service** zoning and
   * these draw **access** zoning; `CLAUDE.md` forbids collapsing the two and `WAVE10_PLAN.md` § 6
   * records the stage lane refusing the handoff's `⚿` floor badge on the same ground.
   */
  readonly zoneChips: HTMLElement;
  readonly addZone: HTMLButtonElement;
  readonly removeZone: HTMLButtonElement;
  /** The floor multi-select, over the building's own floors and nothing else. */
  readonly zoneFloors: HTMLElement;
  readonly zoneGroups: HTMLElement;
  readonly groupName: HTMLInputElement;
  readonly groupAdd: HTMLButtonElement;
  readonly accessMatrix: HTMLElement;
  readonly accessLegend: HTMLElement;
  readonly accessWarning: HTMLElement;
  readonly accessNote: HTMLElement;
  /**
   * `docs/14` § 5a's sky-lobby controls — the escalators joining the two levels of a lobby.
   *
   * A third block, beside the elevation's **service** zoning and the **access** zoning above,
   * because a transport mode is neither: it is an edge outside every bank, and the floors it joins
   * are floors some shaft already serves. Marking a floor a transfer level (the sky chips, service
   * zoning) and joining two floors by escalator are separate authorings, and
   * `authoring/buildingSpec.ts`'s header says why they are not derived from one another.
   */
  readonly transportChips: HTMLElement;
  readonly addTransport: HTMLButtonElement;
  readonly removeTransport: HTMLButtonElement;
  /** The two landing pickers, each over this building's own floors and nothing else. */
  readonly transportLower: HTMLElement;
  readonly transportUpper: HTMLElement;
  readonly transportSeconds: HTMLInputElement;
  readonly transportNote: HTMLElement;
  /** § 4.5 — the document editor kept whole beneath the elevation. */
  readonly document: HTMLDetailsElement;
}

/** § 1.4 — the right rail. Four segments, each a list, a plate and a link. */
export interface RailElements {
  readonly root: HTMLElement;
  readonly drawerToggle: HTMLButtonElement;
  readonly segments: Readonly<Record<RailSegment, HTMLButtonElement>>;
  readonly panels: Readonly<Record<RailSegment, HTMLElement>>;
  readonly dispatcherNote: HTMLElement;
  readonly dispatcherList: HTMLElement;
  readonly dispatcherPlate: HTMLElement;
  /**
   * `docs/10` § 10.3's pre-run compatibility note.
   *
   * It lived above the canvas on the old page. It lives beside the dispatcher list here because
   * that is where the pairing it is about is chosen — the note says *this dispatcher cannot read
   * the credential this building issues*, and a reader who is about to pick a different one should
   * not have to look somewhere else to find out. Empty when there is nothing to say.
   */
  readonly accessNote: HTMLElement;
  readonly openDispatcher: HTMLButtonElement;
  readonly trafficNote: HTMLElement;
  readonly trafficList: HTMLElement;
  readonly trafficPlate: HTMLElement;
  readonly openTraffic: HTMLButtonElement;
  readonly buildingNote: HTMLElement;
  readonly buildingList: HTMLElement;
  readonly buildingPlate: HTMLElement;
  readonly openBuilding: HTMLButtonElement;
  readonly machinesNote: HTMLElement;
  readonly machinesList: HTMLElement;
  /** Engineer-only — § 1.4 R3. */
  readonly nameplateBlock: HTMLElement;
  readonly machinesPlate: HTMLElement;
  readonly machinesWarning: HTMLElement;
  readonly openMachines: HTMLButtonElement;
}

/** § 1.1 S4 — the footer. */
export interface FooterElements {
  readonly statusLine: HTMLElement;
  readonly seedLine: HTMLElement;
  readonly copyRun: HTMLButtonElement;
  readonly right: HTMLElement;
}

/** Everything the mounts hold a reference to, in the shape they hold it. */
export interface Elements {
  readonly bodyGrid: HTMLElement;
  readonly header: HeaderElements;
  readonly mood: MoodElements;
  readonly shift: ShiftElements;
  readonly honesty: HonestyElements;
  /** § 1.2 L7 — the decision log's container. */
  readonly decisionLog: HTMLElement;
  readonly coach: CoachElements;
  readonly stage: StageElements;
  readonly transport: TransportElements;
  readonly report: ReportElements;
  /** § 1.3 M7 — where the five scenario cards go. */
  readonly scenarioList: HTMLElement;
  readonly dispatcherEditor: DispatcherEditorElements;
  /** The weight-set selector, drawn inside the dispatcher surface. */
  readonly selectorEditor: SelectorEditorElements;
  readonly trafficEditor: TrafficEditorElements;
  readonly machinesEditor: MachinesEditorElements;
  readonly buildingEditor: BuildingEditorElements;
  readonly rail: RailElements;
  readonly footer: FooterElements;
  /** Tab button and its panel, per surface. Keyed by {@link TabName}. */
  readonly tabs: Readonly<Record<TabName, HTMLButtonElement>>;
  readonly panels: Readonly<Record<TabName, HTMLElement>>;
  readonly paramSource: HTMLSelectElement;
  readonly paramForm: HTMLElement;
  readonly paramStatus: HTMLElement;
  readonly paramRefusal: HTMLElement;
  /** The Compare surface's controls — `docs/10` § 11 **W3**. */
  readonly batch: BatchPanelElements;
  /** The Campaign surface's controls — `docs/10` § 5, W5. */
  readonly campaign: CampaignPanelElements;
  readonly confirm: HTMLDialogElement;
  readonly confirmMessage: HTMLElement;
  readonly confirmOk: HTMLButtonElement;
  readonly confirmCancel: HTMLButtonElement;
}

/**
 * The same shape as `T`, with an element id wherever `T` has an element.
 *
 * The conditional is on `Element` rather than `HTMLElement` so a future `SVGElement` field does not
 * silently fall through to the recursive branch and ask for a nested object of ids.
 */
export type IdsFor<T> = {
  readonly [K in keyof T]: T[K] extends Element ? string : IdsFor<T[K]>;
};

/**
 * Every id the viewer needs, keyed exactly as {@link Elements}.
 *
 * Checked against `index.html` in both directions by `elementMap.test.ts`.
 */
export const ELEMENT_IDS: IdsFor<Elements> = Object.freeze({
  bodyGrid: 'body-grid',
  header: Object.freeze({
    buildingName: 'building-name',
    buildingSub: 'building-sub',
    clock: 'clock',
    phaseLabel: 'phase-label',
    dayLabel: 'day-label',
    tenantsLine: 'tenants-line',
    viewMode: 'view-mode',
    modeParity: 'mode-parity',
    banner: 'banner',
    right: 'topbar-right',
    openMenu: 'open-menu',
  }),
  mood: Object.freeze({
    face: 'mood-face',
    headline: 'mood-headline',
    sub: 'mood-sub',
    bar: 'mood-bar',
    legend: 'mood-legend',
    drivers: 'mood-drivers',
    stats: 'live-stats',
  }),
  shift: Object.freeze({
    streakLine: 'streak-line',
    runFigures: 'run-figures',
    history: 'history',
    event: 'shift-event',
    note: 'shift-note',
    goals: 'shift-goals',
    best: 'shift-best',
  }),
  honesty: Object.freeze({
    card: 'honesty',
    glyph: 'honesty-glyph',
    title: 'honesty-title',
    plain: 'honesty-plain',
    toggle: 'honesty-toggle',
    maths: 'honesty-maths',
  }),
  decisionLog: 'decision-log',
  coach: Object.freeze({
    label: 'coach-label',
    title: 'coach-title',
    hint: 'coach-hint',
    progress: 'coach-progress',
    building: 'pick-building',
    pattern: 'pick-pattern',
    shiftLength: 'pick-shift',
    run: 'run',
    allScenarios: 'open-scenarios',
  }),
  stage: Object.freeze({
    canvas: 'stage',
    alarm: 'alarm',
    alarmText: 'alarm-text',
    alarmSub: 'alarm-sub',
    description: 'frame-description',
    legend: 'legend',
    legendTitle: 'legend-title',
  }),
  transport: Object.freeze({
    playPause: 'play-pause',
    timeline: 'timeline',
    playhead: 'playhead',
    ticks: 'timeline-ticks',
    speedChips: 'speed-chips',
    stepBack: 'step-back',
    stepForward: 'step-forward',
    loop: 'loop',
    status: 'status',
    error: 'error',
    verify: 'verify',
    saveRecording: 'save-recording',
    loadRecording: 'load-recording',
    exportPng: 'export-png',
    seed: 'seed',
    bankFilter: 'bank-filter',
    landingSelect: 'landing-select',
  }),
  report: Object.freeze({
    title: 'report-title',
    meta: 'report-meta',
    lede: 'report-lede',
    figures: 'report-figures',
    verdict: 'report-verdict',
    streak: 'report-streak',
    contract: 'report-contract',
    cleared: 'report-cleared',
    clearedNote: 'report-cleared-note',
    takeNext: 'report-take-next',
    goals: 'report-goals',
    diagnosis: 'report-diagnosis',
    levers: 'report-levers',
    forecastName: 'report-forecast-name',
    forecastNote: 'report-forecast-note',
    forecastDemand: 'report-forecast-demand',
    taught: 'report-taught',
    smallPrint: 'report-small-print',
    nextDay: 'report-next-day',
    back: 'report-back',
  }),
  scenarioList: 'scenario-list',
  dispatcherEditor: Object.freeze({
    list: 'dispatcher-list',
    editing: 'dispatcher-editing',
    yoursCount: 'dispatcher-yours-count',
    name: 'dispatcher-name',
    termsUsed: 'dispatcher-terms-used',
    copyCurrent: 'dispatcher-copy-current',
    terms: 'dispatcher-terms',
    flags: 'dispatcher-flags',
    levers: 'group-levers',
    dwellChips: 'dwell-chips',
    dwellHint: 'dwell-hint',
    summary: 'dispatcher-summary',
    advice: 'dispatcher-advice',
    close: 'dispatcher-close',
    save: 'dispatcher-save',
    dirty: 'dispatcher-dirty',
    error: 'dispatcher-error',
    yours: 'dispatcher-yours',
  }),
  selectorEditor: Object.freeze({
    controls: 'selector-controls',
    unavailable: 'selector-unavailable',
    policy: 'selector-policy',
    policyIssue: 'selector-policy-issue',
    line: 'selector-line',
    scalars: 'selector-scalars',
    patterns: 'selector-patterns',
    mapIssue: 'selector-map-issue',
    reset: 'selector-reset',
    changed: 'selector-changed',
  }),
  trafficEditor: Object.freeze({
    editing: 'traffic-editing',
    summary: 'traffic-summary',
    name: 'traffic-name',
    orderChips: 'traffic-order-chips',
    orderNote: 'traffic-order-note',
    rows: 'traffic-rows',
    preview: 'traffic-preview',
    previewTicks: 'traffic-preview-ticks',
    close: 'traffic-close',
    save: 'traffic-save',
    dirty: 'traffic-dirty',
    error: 'traffic-error',
    footnote: 'traffic-footnote',
  }),
  machinesEditor: Object.freeze({
    editing: 'machines-editing',
    name: 'machines-name',
    rows: 'machines-rows',
    speedChips: 'machines-speed-chips',
    summary: 'machines-summary',
    close: 'machines-close',
    save: 'machines-save',
    dirty: 'machines-dirty',
    error: 'machines-error',
  }),
  buildingEditor: Object.freeze({
    editing: 'building-editing',
    blank: 'building-blank',
    name: 'building-spec-name',
    rows: 'building-rows',
    occupancy: 'building-occupancy',
    openMachines: 'building-open-machines',
    classChips: 'building-class-chips',
    classPlain: 'building-class-plain',
    classLimits: 'building-class-limits',
    classWarning: 'building-class-warning',
    loadChips: 'building-load-chips',
    speedChips: 'building-speed-chips',
    skyChips: 'building-sky-chips',
    summary: 'building-summary',
    advice: 'building-advice',
    close: 'building-close',
    save: 'building-save',
    dirty: 'building-dirty',
    error: 'building-spec-error',
    elevationBody: 'elevation-body',
    elevationOccNote: 'elevation-occ-note',
    elevationLevelOcc: 'elevation-level-occ',
    elevationClearRanges: 'elevation-clear-ranges',
    elevationLegend: 'elevation-legend',
    elevationNote: 'elevation-note',
    elevationWarning: 'elevation-warning',
    addShaft: 'elevation-add-shaft',
    removeShaft: 'elevation-remove-shaft',
    zoneChips: 'building-zone-chips',
    addZone: 'building-add-zone',
    removeZone: 'building-remove-zone',
    zoneFloors: 'building-zone-floors',
    zoneGroups: 'building-zone-groups',
    groupName: 'building-group-name',
    groupAdd: 'building-group-add',
    accessMatrix: 'building-access-matrix',
    accessLegend: 'building-access-legend',
    accessWarning: 'building-access-warning',
    accessNote: 'building-access-note',
    transportChips: 'building-transport-chips',
    addTransport: 'building-add-transport',
    removeTransport: 'building-remove-transport',
    transportLower: 'building-transport-lower',
    transportUpper: 'building-transport-upper',
    transportSeconds: 'building-transport-seconds',
    transportNote: 'building-transport-note',
    document: 'building-document',
  }),
  rail: Object.freeze({
    root: 'rail-right',
    drawerToggle: 'drawer-toggle',
    segments: Object.freeze({
      dispatcher: 'seg-dispatcher',
      traffic: 'seg-traffic',
      building: 'seg-building',
      machines: 'seg-machines',
    }),
    panels: Object.freeze({
      dispatcher: 'rail-panel-dispatcher',
      traffic: 'rail-panel-traffic',
      building: 'rail-panel-building',
      machines: 'rail-panel-machines',
    }),
    dispatcherNote: 'rail-dispatcher-note',
    dispatcherList: 'rail-dispatcher-list',
    dispatcherPlate: 'rail-dispatcher-plate',
    accessNote: 'rail-access-note',
    openDispatcher: 'rail-open-dispatcher',
    trafficNote: 'rail-traffic-note',
    trafficList: 'rail-traffic-list',
    trafficPlate: 'rail-traffic-plate',
    openTraffic: 'rail-open-traffic',
    buildingNote: 'rail-building-note',
    buildingList: 'rail-building-list',
    buildingPlate: 'rail-building-plate',
    openBuilding: 'rail-open-building',
    machinesNote: 'rail-machines-note',
    machinesList: 'rail-machines-list',
    nameplateBlock: 'rail-nameplate-block',
    machinesPlate: 'rail-machines-plate',
    machinesWarning: 'rail-machines-warning',
    openMachines: 'rail-open-machines',
  }),
  footer: Object.freeze({
    statusLine: 'status-line',
    seedLine: 'seed-line',
    copyRun: 'copy-run',
    right: 'footer-right',
  }),
  tabs: Object.freeze({
    run: 'tab-run',
    report: 'tab-report',
    scenarios: 'tab-scenarios',
    dispatcher: 'tab-dispatcher',
    traffic: 'tab-traffic',
    machines: 'tab-machines',
    building: 'tab-building',
    compare: 'tab-compare',
    campaign: 'tab-campaign',
    parameters: 'tab-parameters',
  }),
  panels: Object.freeze({
    run: 'panel-run',
    report: 'panel-report',
    scenarios: 'panel-scenarios',
    dispatcher: 'panel-dispatcher',
    traffic: 'panel-traffic',
    machines: 'panel-machines',
    building: 'panel-building',
    compare: 'panel-compare',
    campaign: 'panel-campaign',
    parameters: 'panel-parameters',
  }),
  paramSource: 'param-source',
  paramForm: 'param-form',
  paramStatus: 'param-status',
  paramRefusal: 'param-refusal',
  batch: Object.freeze({
    building: 'batch-building',
    baseline: 'batch-baseline',
    candidate: 'batch-candidate',
    duration: 'batch-duration',
    seed: 'batch-seed',
    replications: 'batch-replications',
    demand: 'batch-demand',
    run: 'batch-run',
    cancel: 'batch-cancel',
    progress: 'batch-progress',
    status: 'batch-status',
    error: 'batch-error',
    output: 'batch-output',
  }),
  campaign: Object.freeze({
    stage: 'campaign-stage',
    profile: 'campaign-profile',
    run: 'campaign-run',
    cancel: 'campaign-cancel',
    progress: 'campaign-progress',
    status: 'campaign-status',
    error: 'campaign-error',
    brief: 'campaign-brief',
    output: 'campaign-output',
    edit: 'campaign-edit',
    weightsBar: 'campaign-weights-bar',
    weights: 'campaign-weights',
    weightsStatus: 'campaign-weights-status',
    weightsRefusal: 'campaign-weights-refusal',
  }),
  confirm: 'confirm',
  confirmMessage: 'confirm-message',
  confirmOk: 'confirm-ok',
  confirmCancel: 'confirm-cancel',
});

/**
 * The one method a resolver needs from a `Document`.
 *
 * Structural, so `elementMap.test.ts` drives this under Node with a `Set` of ids and no jsdom —
 * the same reason `playback/` takes an injected `DisplayClock` and `render/` draws through a
 * structural 2D context. A real `Document` satisfies it without an adapter.
 */
export interface ElementSource {
  getElementById(id: string): Element | null;
}

/** Every id in the manifest, in the order a depth-first walk of it reaches them. */
export function elementIdsIn(ids: unknown): readonly string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    for (const value of Object.values(node as Record<string, unknown>)) walk(value);
  };
  walk(ids);
  return out;
}

export type ElementResolution<T> =
  | { readonly ok: true; readonly elements: T }
  | {
      readonly ok: false;
      /** Every id the source did not have, in manifest order. Never just the first. */
      readonly missing: readonly string[];
      /** How many ids were looked for, so a report can say "4 of 73". */
      readonly total: number;
    };

/**
 * Resolve a whole manifest against a document, collecting every miss.
 *
 * Does **not** stop at the first absent id, and that is the entire behavioural change: a page being
 * brought up against this viewer for the first time gets one list rather than one reload per id.
 */
export function resolveElements<T>(source: ElementSource, ids: IdsFor<T>): ElementResolution<T> {
  const missing: string[] = [];
  let total = 0;

  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      total += 1;
      const found = source.getElementById(node);
      if (found === null) missing.push(node);
      return found;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = walk(value);
    }
    return out;
  };

  const tree = walk(ids);
  if (missing.length > 0) return { ok: false, missing, total };
  /*
   * The one unchecked cast in this module, and it is why `ids` is typed `IdsFor<T>` rather than a
   * loose tree: the walk above reproduces the manifest's shape key for key, `IdsFor<T>` has `T`'s
   * shape by construction, and the `missing` check above establishes that no leaf is `null`. So the
   * three facts that make this cast true are all local to this function. A caller performs no cast
   * of its own, which is the point — a cast at 73 call sites is what the old `find<T>()` was.
   */
  return { ok: true, elements: tree as T };
}

/**
 * Thrown when the page is missing elements the viewer needs.
 *
 * Carries {@link missing} as data as well as in the message, so a caller that wants to render the
 * list rather than print it does not have to parse a sentence.
 */
export class MissingElementsError extends Error {
  override readonly name = 'MissingElementsError';
  readonly missing: readonly string[];

  constructor(missing: readonly string[], total: number) {
    super(
      `the page is missing ${String(missing.length)} of the ${String(total)} elements the viewer ` +
        `needs: ${missing.map((id) => `#${id}`).join(', ')}. ` +
        'Every id is listed in src/dev/elementMap.ts beside the field that holds it.',
    );
    this.missing = missing;
  }
}
