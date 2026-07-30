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
 * **It does not make any element optional.** Every id below is required, because `main.ts`
 * dereferences every one of them unconditionally — a `requirement: 'optional'` field here would be
 * a promise the page does not keep, which is exactly the failure mode described above wearing the
 * opposite mask. Making a surface genuinely optional means guarding its wiring, one surface at a
 * time, and is a change to `main.ts` rather than to this list.
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
 * the tab list and the ids for those tabs are one fact. Adding a sixth surface is then a compile
 * error until both its button and its panel have an id.
 */
export const TABS = ['viewer', 'editor', 'parameters', 'compare', 'campaign'] as const;
export type TabName = (typeof TABS)[number];

export const isTabName = (value: string | null): value is TabName =>
  value !== null && (TABS as readonly string[]).includes(value);

/** Everything `main.ts` holds a reference to, in the shape it holds it. */
export interface Elements {
  readonly canvas: HTMLCanvasElement;
  readonly building: HTMLSelectElement;
  readonly dispatcher: HTMLSelectElement;
  readonly duration: HTMLInputElement;
  readonly speed: HTMLSelectElement;
  readonly seed: HTMLInputElement;
  readonly run: HTMLButtonElement;
  readonly verify: HTMLButtonElement;
  readonly copyProvenance: HTMLButtonElement;
  readonly saveRecording: HTMLButtonElement;
  readonly loadRecording: HTMLInputElement;
  readonly bankFilter: HTMLSelectElement;
  readonly landingSelect: HTMLSelectElement;
  readonly exportPng: HTMLButtonElement;
  readonly playPause: HTMLButtonElement;
  readonly stepBack: HTMLButtonElement;
  readonly stepForward: HTMLButtonElement;
  readonly loop: HTMLInputElement;
  readonly scrub: HTMLInputElement;
  readonly status: HTMLElement;
  readonly error: HTMLElement;
  readonly banner: HTMLElement;
  readonly description: HTMLElement;
  /** Where `render/runSummary.ts`'s figures are drawn — `docs/10` § 11 W2. */
  readonly runSummary: HTMLElement;
  /** § 4's mode toggle, and the place `mode/parity.ts` puts a refusal it finds. */
  readonly viewMode: HTMLSelectElement;
  readonly modeParity: HTMLElement;
  /** § 10.3's pre-run compatibility note. Empty when there is nothing to say. */
  readonly accessNote: HTMLElement;
  /** Where `render/mood.ts`'s gauge is drawn — `docs/10` § 6 / D4, W6's U4. */
  readonly mood: HTMLElement;
  /** Tab button and its panel, per surface. Keyed by {@link TabName}, so a sixth is one entry. */
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
 * The ids are the ones `index.html` already used — this manifest was extracted from the resolution
 * calls rather than authored beside them, so no id changed when it landed and
 * `elementMap.test.ts` pins that against the page.
 */
export const ELEMENT_IDS: IdsFor<Elements> = Object.freeze({
  canvas: 'stage',
  viewMode: 'view-mode',
  modeParity: 'mode-parity',
  building: 'building',
  dispatcher: 'dispatcher',
  duration: 'duration',
  speed: 'speed',
  seed: 'seed',
  run: 'run',
  verify: 'verify',
  copyProvenance: 'copy-provenance',
  saveRecording: 'save-recording',
  loadRecording: 'load-recording',
  bankFilter: 'bank-filter',
  landingSelect: 'landing-select',
  exportPng: 'export-png',
  playPause: 'play-pause',
  stepBack: 'step-back',
  stepForward: 'step-forward',
  loop: 'loop',
  scrub: 'scrub',
  status: 'status',
  error: 'error',
  banner: 'banner',
  description: 'frame-description',
  runSummary: 'run-summary',
  accessNote: 'access-note',
  mood: 'building-mood',
  tabs: Object.freeze({
    viewer: 'tab-viewer',
    editor: 'tab-editor',
    parameters: 'tab-parameters',
    compare: 'tab-compare',
    campaign: 'tab-campaign',
  }),
  panels: Object.freeze({
    viewer: 'panel-viewer',
    editor: 'panel-editor',
    parameters: 'panel-parameters',
    compare: 'panel-compare',
    campaign: 'panel-campaign',
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
