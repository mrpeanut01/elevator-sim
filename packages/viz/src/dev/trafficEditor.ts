/**
 * The traffic editor, mounted — `docs/12-design-handoff.md` § 1.3 **M9**, under § 4.3.
 *
 * ## The deviation this file implements
 *
 * The handoff's ten sliders (`amStart`, `amHours`, `amMult`, `pmStart`, …) describe a sixteen-hour
 * office day. This simulator does not have one: `rise-and-fall` is thirty minutes and
 * `constant-iso` is two hours, and § 4.1 is the argument for why inventing a day would be a label
 * that does not describe the demand underneath it. So the **layout, grouping, tooltip discipline,
 * preview strip and save-as-new flow** are the handoff's, and the rows are `PATTERN_ROWS` — the
 * engine's real parameters, each row's tooltip naming the field it writes.
 *
 * ## The preview strip is the day this *actually* makes
 *
 * Not seven office phases. `demandFromSpec(spec)` names the template, `resolveDemandTemplate`
 * resolves it against `data/traffic-profiles.json`'s own `demandTemplates` **with the same
 * overrides `Simulation` will build** — `durationS`, `peakWindowS`, `baselineFraction`,
 * `mixAmplitude`, exactly `traceConfigFor`'s list — and the segments drawn are the phases that come
 * back. A preview built from a different override set would be a picture of a run nobody is about
 * to make, which is the whole failure mode § 4.1 exists to prevent.
 *
 * ## Two rows that write nothing, drawn as refusals rather than as sliders
 *
 * `docs/05-roadmap.md`'s standing requirement is *name the non-test caller*, and the version of it
 * that applies to a control is *name the field it writes*. Two rows in `PATTERN_ROWS` cannot:
 *
 * - **`batchMean`** has no field. `SimulationDemandOptions` carries `batchSharesDestination` and no
 *   batch *size*: the mean comes off `data/traffic-profiles.json`'s `batchSize.mean` through
 *   `config.trafficProfiles`, and `demandFromSpec` does not write it. A slider bound to it would
 *   move `PatternSpec.batchMean`, change the summary line, and change no passenger.
 * - **`interfloorShare` under the two-way order.** `demandFromSpec` only writes a
 *   `directionalSplit` when the order declares one, and `two-way` declares none — the lunch
 *   template states the period's own mix, and `planDemand` **refuses** a `directionalSplit`
 *   alongside it rather than letting one win silently. So the row is live under the other two
 *   orders and inert under this one.
 *
 * Both are drawn as named refusals in the reader's register — `docs/10` § 11 W4's pattern, the same
 * one `renderUnsearchable` uses — rather than as controls that look live. What cannot be moved is
 * **said**, never dropped.
 */

import {
  resolveDemandTemplate,
  type DemandPhase,
  type DemandTemplate,
  type ResolvedDemandTemplate,
} from '@elevator-sim/core/browser';

import {
  PEAK_ORDERS,
  PEAK_ORDER_INFO,
  demandFromSpec,
  patternIsDirty,
  patternSummary,
  rowsFor,
  specFromTrafficProfile,
  type PatternRow,
  type PatternSpec,
  type PeakOrder,
} from '../authoring/patternSpec.js';
import { DAY_START_S, PHASE_PALETTE, QUIET_PALETTE, hhmm } from '../live/timeline.js';

import { sliderHandlesOf, nextSavedId, updateSliderRow, type SliderHandles } from './dispatcherEditor.js';
import { chipRow, el, fill, setHidden, setText, slider, toggle } from './dom.js';
import type { BrowserResources } from './data.js';
import type { TrafficEditorElements } from './elementMap.js';
import type { MountContext, Panel, ViewAt } from './mountTypes.js';
import { buildingConfigOf, type ViewerState } from './state.js';

/* -------------------------------------------------------------------------- *
 * The peak-order chips
 * -------------------------------------------------------------------------- */

export interface OrderChip {
  readonly order: PeakOrder;
  readonly label: string;
  readonly note: string;
  readonly pressed: boolean;
}

export function orderChipsOf(spec: PatternSpec): readonly OrderChip[] {
  return PEAK_ORDERS.map((order): OrderChip => {
    const info = PEAK_ORDER_INFO[order];
    return { order, label: info.label, note: info.note, pressed: spec.order === order };
  });
}

/* -------------------------------------------------------------------------- *
 * The rows
 * -------------------------------------------------------------------------- */

/** One drawn row: the model's row, plus what this spec makes of it. */
export interface PatternRowView {
  readonly row: PatternRow;
  /** The group heading, when this row opens a new group. Empty otherwise. */
  readonly heading: string;
  /** The slider position, or `0`/`1` for the one boolean row. */
  readonly raw: number;
  /** The formatted figure beside the label. */
  readonly value: string;
  /** `true` when this row is a toggle rather than a slider. */
  readonly boolean: boolean;
  /**
   * Whether moving this control changes the run.
   *
   * `false` is drawn as a refusal and never as a control. See the module docstring for the two
   * rows this is `false` for and why.
   */
  readonly live: boolean;
  /** Why it is not live. `undefined` exactly when {@link live}. */
  readonly refusal: string | undefined;
}

/** What the engine will not read, for a given spec. The list, and the reason for each entry. */
export function inertPatternRows(spec: PatternSpec): Readonly<Record<string, string>> {
  const out: Record<string, string> = {
    batchMean:
      'writes PatternSpec.batchMean, which no field of SimulationDemandOptions carries — the run ' +
      'reads batchSize.mean off data/traffic-profiles.json. Moving it would change this summary ' +
      'line and no passenger.',
  };
  if (spec.order === 'two-way') {
    out['interfloorShare'] =
      'inert under two-way: the lunch template states the period’s own directional mix, and ' +
      'planDemand refuses a demand.directionalSplit beside it rather than letting one win ' +
      'silently. Choose up-first or down-first to move this share.';
  }
  return out;
}

/** The rows this spec offers, with their headings, figures and refusals. */
export function patternRowsOf(spec: PatternSpec): readonly PatternRowView[] {
  const inert = inertPatternRows(spec);
  let group = '';
  return rowsFor(spec).map((row): PatternRowView => {
    const heading = row.group === group ? '' : row.group;
    group = row.group;
    const refusal = inert[row.key];
    return {
      row,
      heading,
      raw: rawOf(spec, row.key),
      value: formatPatternValue(spec, row),
      boolean: row.key === 'batchSharesDestination',
      live: refusal === undefined,
      refusal,
    };
  });
}

function rawOf(spec: PatternSpec, key: PatternRow['key']): number {
  const value = spec[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

/** The figure beside a row's label, in the row's own declared unit. */
export function formatPatternValue(spec: PatternSpec, row: PatternRow): string {
  switch (row.key) {
    case 'ratePctPop5min':
      return `${spec.ratePctPop5min.toFixed(1)}${row.unit}`;
    case 'baselineFraction':
      return `${spec.baselineFraction.toFixed(2)}${row.unit}`;
    case 'peakWindowS':
      return `${String(Math.round(spec.peakWindowS))}${row.unit}`;
    case 'mixAmplitude':
      return `${spec.mixAmplitude.toFixed(2)}${row.unit}`;
    case 'interfloorShare':
      return `${String(Math.round(spec.interfloorShare * 100))}%`;
    case 'batchMean':
      return `${spec.batchMean.toFixed(1)}${row.unit}`;
    case 'batchSharesDestination':
      return spec.batchSharesDestination ? 'together' : 'separately';
    default:
      return '';
  }
}

/** A row's edit as a patch. Total over `PATTERN_ROWS`'s keys; anything else patches nothing. */
export function patternPatchFor(key: PatternRow['key'], raw: number): Partial<PatternSpec> {
  switch (key) {
    case 'ratePctPop5min':
      return { ratePctPop5min: raw };
    case 'baselineFraction':
      return { baselineFraction: raw };
    case 'peakWindowS':
      return { peakWindowS: raw };
    case 'mixAmplitude':
      return { mixAmplitude: raw };
    case 'interfloorShare':
      return { interfloorShare: raw };
    case 'batchMean':
      return { batchMean: raw };
    case 'batchSharesDestination':
      return { batchSharesDestination: raw > 0.5 };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- *
 * The preview strip — the day this makes
 * -------------------------------------------------------------------------- */

/**
 * The four segment palettes, mirroring `live/timeline.ts`'s `PHASE_PALETTE`.
 *
 * **A second copy, and it is here under protest.** The transport's palette is the authority — it is
 * the one a reader sees under the stage, and the whole argument for one palette declared once is in
 * `docs/12` § 2.2 — but `PHASE_PALETTE` is module-private in `live/timeline.ts` and `timelineOf`
 * takes a whole `VizRecording`, which a preview of a run nobody has made yet does not have. The
 * values below are that module's, unchanged, and the fix is to export them: see this lane's report.
 */
/**
 * The transport's own palette, imported rather than copied.
 *
 * It was copied for one lane's duration, with a comment promising the export — and a palette
 * duplicated with a promise is still a palette duplicated, which is the defect `docs/12` § 2.2 is
 * about and `dev/tokens.test.ts` exists to stop. `live/timeline.ts` exports it now. The `quiet`
 * entry is that module's `QUIET_PALETTE`, which is a fifth kind here because the preview
 * distinguishes *holding below peak* from *asking for nothing*, and the transport does too.
 */
const PREVIEW_PALETTE: Readonly<Record<string, { readonly bg: string; readonly fg: string }>> =
  Object.freeze({ ...PHASE_PALETTE, quiet: QUIET_PALETTE });

/** Intensities within this of each other are the same intensity. Guards a float comparison. */
const INTENSITY_EPSILON = 1e-9;

export type PreviewKind = 'ramp-up' | 'hold' | 'ramp-down' | 'flat' | 'quiet';

export interface PreviewSegment {
  readonly id: string;
  readonly kind: PreviewKind;
  /** The long name — § 4.1's own vocabulary. */
  readonly label: string;
  /** The chip label, short enough to survive a 44 px segment. */
  readonly short: string;
  readonly startS: number;
  readonly endS: number;
  /** `endS - startS`. Bound straight to `flex`, as the handoff does. */
  readonly span: number;
  readonly bg: string;
  readonly fg: string;
  readonly title: string;
  /** Demand at the segment's midpoint, in the unit a traffic study is written in. */
  readonly ratePctPop5min: number;
  /** Whether the segment lies inside the template's own measurement window. */
  readonly inReportWindow: boolean;
}

/** Which shape a phase is, from its two endpoint intensities and the template's peak. */
export function previewKindOf(phase: DemandPhase, peakIntensity: number): PreviewKind {
  const { startIntensity: from, endIntensity: to } = phase;
  if (to - from > INTENSITY_EPSILON) return 'ramp-up';
  if (from - to > INTENSITY_EPSILON) return 'ramp-down';
  if (from <= INTENSITY_EPSILON) return 'quiet';
  return from >= peakIntensity - INTENSITY_EPSILON ? 'hold' : 'flat';
}

const PREVIEW_LABELS: Readonly<Record<PreviewKind, { readonly long: string; readonly short: string }>> =
  Object.freeze({
    'ramp-up': Object.freeze({ long: 'ramp up', short: 'FILLING' }),
    hold: Object.freeze({ long: 'peak hold', short: 'PEAK' }),
    'ramp-down': Object.freeze({ long: 'ramp down', short: 'EASING' }),
    flat: Object.freeze({ long: 'steady', short: 'STEADY' }),
    quiet: Object.freeze({ long: 'quiet', short: 'QUIET' }),
  });

/**
 * The resolved template's own phases, as the strip draws them.
 *
 * The rate is `spec.ratePctPop5min × intensity at the midpoint`, which is what the phase means: the
 * template carries a multiplier and the spec carries the nominal rate. Nothing here is a placeholder
 * — the handoff's `28 + (100 − pct) × 0.9` school of figure is § 4.2's list, and this is not on it.
 */
export function previewSegmentsOf(
  template: ResolvedDemandTemplate,
  spec: PatternSpec,
  dayStartS: number = DAY_START_S,
): readonly PreviewSegment[] {
  return template.phases.map((phase, index): PreviewSegment => {
    const kind = previewKindOf(phase, template.peakIntensity);
    const names = PREVIEW_LABELS[kind];
    const palette = PREVIEW_PALETTE[kind] ?? PREVIEW_PALETTE['flat'];
    const midpoint = (phase.startIntensity + phase.endIntensity) / 2;
    const rate = spec.ratePctPop5min * midpoint;
    const inReportWindow =
      phase.endS > template.reportWindowStartS && phase.startS < template.reportWindowEndS;
    return {
      id: `${String(index)}-${kind}`,
      kind,
      label: names.long,
      short: names.short,
      startS: phase.startS,
      endS: phase.endS,
      span: phase.endS - phase.startS,
      bg: palette?.bg ?? '#161e2a',
      fg: palette?.fg ?? '#6d7b8d',
      title:
        `${names.long} · ${hhmm(dayStartS + phase.startS)}–${hhmm(dayStartS + phase.endS)} · ` +
        `${rate.toFixed(1)} %pop/5 min${inReportWindow ? ' · inside the reported window' : ''}`,
      ratePctPop5min: rate,
      inReportWindow,
    };
  });
}

export interface PreviewTick {
  readonly atS: number;
  readonly label: string;
}

/**
 * The tick row under the strip: the shift's **real** clock span, not a fixed `06:00 … 22:00` ruler.
 *
 * Evenly spaced rather than on the hour, because a thirty-minute template has no o'clock in it and
 * a row with one label is not a ruler. The transport's own ticks are o'clock ones because a shift
 * can be two hours; this strip is always exactly the template's duration.
 */
export function previewTicksOf(
  durationS: number,
  dayStartS: number = DAY_START_S,
  count = 5,
): readonly PreviewTick[] {
  const steps = Math.max(2, count);
  const ticks: PreviewTick[] = [];
  for (let index = 0; index < steps; index += 1) {
    const atS = (durationS * index) / (steps - 1);
    ticks.push({ atS, label: hhmm(dayStartS + atS) });
  }
  return ticks;
}

export type PreviewResolution =
  | { readonly ok: true; readonly template: ResolvedDemandTemplate }
  | { readonly ok: false; readonly reason: string };

/**
 * Resolve the template this spec selects, **with the overrides the run will use**.
 *
 * The override list is `sim/simulation.ts`'s `traceConfigFor`, field for field: `durationS` from the
 * shift length, then whichever of `peakWindowS`, `baselineFraction` and `mixAmplitude` the spec's
 * own demand block declares. Mirroring it is the only way the strip can claim to be the day the
 * shift makes; a preview assembled from a different set would be a different run.
 *
 * A `TrafficError` is a fact about the spec, not a crash, so it comes back as a reason.
 */
export function previewTemplateOf(
  spec: PatternSpec,
  templates: readonly DemandTemplate[],
  durationS: number,
): PreviewResolution {
  const { demandTemplate, demand } = demandFromSpec(spec);
  try {
    return {
      ok: true,
      template: resolveDemandTemplate(demandTemplate, templates, {
        durationS,
        ...(demand.peakWindowS === undefined ? {} : { peakWindowS: demand.peakWindowS }),
        ...(demand.baselineFraction === undefined
          ? {}
          : { baselineFraction: demand.baselineFraction }),
        ...(demand.mixAmplitude === undefined ? {} : { mixAmplitude: demand.mixAmplitude }),
      }),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The spec the editor was opened from, so *edited — not saved* means something.
 *
 * `'building'` is the building's own `trafficProfile`, which is the demand every published figure
 * in this repository was measured under; a reader who has not touched anything is on it and is not
 * dirty.
 */
export function sourcePatternOf(resources: BrowserResources, state: ViewerState): PatternSpec {
  const saved = state.savedPatterns.find((entry) => entry.id === state.editingPatternId);
  if (saved !== undefined) return saved.spec;
  if (state.editingPatternId !== 'building') {
    return specFromTrafficProfile(resources.trafficProfiles, state.editingPatternId);
  }
  const building = buildingConfigOf(resources, state.savedBuildings, state.buildingId);
  return specFromTrafficProfile(resources.trafficProfiles, building?.trafficProfile);
}

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

export function mountTrafficEditor(
  elements: TrafficEditorElements,
  context: MountContext,
): Panel {
  const doc = elements.rows.ownerDocument;
  let view: ViewAt | undefined;

  let builtRowKeys = '';
  const rowNodes = new Map<string, SliderHandles>();

  const spec = (): PatternSpec | undefined => view?.state.patternSpec;

  function patch(next: Partial<PatternSpec>): void {
    const current = spec();
    if (current === undefined) return;
    context.update({ patternSpec: { ...current, ...next } });
  }

  elements.name.addEventListener('input', () => {
    patch({ name: elements.name.value });
  });

  elements.close.addEventListener('click', () => {
    context.openTab('run');
  });

  elements.save.addEventListener('click', () => {
    const at = view;
    const current = spec();
    if (at === undefined || current === undefined) return;
    const id = nextSavedId('pat', [
      ...at.state.savedPatterns.map((entry) => entry.id),
      ...at.resources.trafficProfiles.profiles.map((profile) => profile.id),
    ]);
    const saved: PatternSpec = {
      ...current,
      name: current.name.trim() === '' ? 'My pattern' : current.name.trim(),
    };
    context.update({
      savedPatterns: [...at.state.savedPatterns, { id, spec: saved }],
      // Selected as well as saved: a pattern the run cannot be pointed at is the dead seam this
      // repository keeps finding, and the rail's list reads `savedPatterns` for exactly this.
      pattern: id,
      editingPatternId: id,
      patternSpec: saved,
    });
    setText(elements.error, '');
    context.openTab('run');
  });

  /* --- the rows ----------------------------------------------------------- */

  function drawRows(rows: readonly PatternRowView[]): void {
    /*
     * A slider is updated in place, because replacing it mid-drag would drop the pointer capture.
     * A **toggle** and a **refusal** have no drag to protect and no handles to write into, so their
     * current value goes in the signature and they are simply rebuilt when it moves — without
     * which the toggle would show `off` for ever after the first press.
     */
    const keys = rows
      .map((row) => {
        const live = row.live ? '1' : '0';
        const rebuilt = row.boolean || !row.live ? `:${String(row.raw)}` : '';
        return `${row.row.key}:${live}${rebuilt}`;
      })
      .join('|');
    if (keys !== builtRowKeys) {
      rowNodes.clear();
      fill(elements.rows, ...rows.map((row) => buildRow(row)));
      builtRowKeys = keys;
    }
    for (const row of rows) {
      const handles = rowNodes.get(row.row.key);
      if (handles === undefined) continue;
      updateSliderRow(handles, {
        raw: row.raw,
        value: row.value,
        sub: row.row.help,
        subColor: 'var(--faint)',
        labelColor: 'var(--text)',
      });
    }
  }

  function buildRow(view_: PatternRowView): HTMLElement {
    const row = view_.row;
    if (!view_.live) return refusalRow(doc, view_);
    if (view_.boolean) {
      return el(doc, 'div', {
        children: [
          view_.heading === ''
            ? null
            : el(doc, 'div', { className: 'slider-group', text: view_.heading }),
          toggle(doc, {
            label: row.label,
            hint: row.help,
            help: row.help,
            on: view_.raw > 0.5,
            onToggle: () => {
              // Read the live spec, never the value this row was built with: the build is stale by
              // construction, and a toggle that flipped off its own snapshot would flip once.
              const current = spec();
              if (current === undefined) return;
              patch(patternPatchFor(row.key, rawOf(current, row.key) > 0.5 ? 0 : 1));
            },
          }),
        ],
      });
    }
    const node = slider(doc, {
      label: row.label,
      value: view_.value,
      raw: view_.raw,
      min: row.min,
      max: row.max,
      step: row.step,
      heading: view_.heading,
      // The tooltip *and* the sub-line name the field, because a tooltip is not discoverable and
      // the field name is the thing that makes the row's claim checkable.
      sub: row.help,
      help: row.help,
      onInput: (raw) => {
        patch(patternPatchFor(row.key, raw));
      },
    });
    const handles = sliderHandlesOf(node);
    if (handles !== undefined) rowNodes.set(row.key, handles);
    return node;
  }

  /* --- render ------------------------------------------------------------- */

  function render(at: ViewAt): void {
    view = at;
    const state = at.state;
    const current = state.patternSpec;

    setText(elements.editing, `Editing — ${current.name}`);
    setText(elements.summary, patternSummary(current));
    if (elements.name.value !== current.name) elements.name.value = current.name;

    fill(
      elements.orderChips,
      chipRow(
        doc,
        orderChipsOf(current).map((entry) => ({
          label: entry.label,
          selected: entry.pressed,
          title: entry.note,
          onPick: () => {
            patch({ order: entry.order });
          },
        })),
      ),
    );
    setText(elements.orderNote, PEAK_ORDER_INFO[current.order].note);

    drawRows(patternRowsOf(current));

    /* The preview strip, and the tick row under it. */
    const resolution = previewTemplateOf(
      current,
      at.resources.trafficProfiles.demandTemplates,
      state.shiftLengthS,
    );
    if (!resolution.ok) {
      fill(elements.preview);
      fill(elements.previewTicks);
      setText(elements.error, resolution.reason);
    } else {
      const template = resolution.template;
      const segments = previewSegmentsOf(template, current);
      fill(
        elements.preview,
        ...segments.map((segment) =>
          el(doc, 'div', {
            className: 'phase-seg',
            title: segment.title,
            style: {
              flex: String(Math.max(segment.span, 1)),
              background: segment.bg,
              opacity: segment.inReportWindow ? '1' : '0.72',
            },
            children: [el(doc, 'span', { text: segment.short, style: { color: segment.fg } })],
          }),
        ),
      );
      fill(
        elements.previewTicks,
        ...previewTicksOf(template.durationS).map((tick) =>
          el(doc, 'span', { text: tick.label }),
        ),
      );
      setText(elements.error, '');
    }

    setHidden(elements.dirty, !patternIsDirty(current, sourcePatternOf(at.resources, state)));
    setText(
      elements.footnote,
      'A shift runs the building’s own traffic profile until you pick or save a pattern here — ' +
        'which is the demand every published figure in this repository was measured under, so ' +
        'leaving it alone is what keeps a run comparable with the project’s own results.',
    );
  }

  return { render };
}

/**
 * A row that cannot act, drawn as a sentence rather than as a control.
 *
 * `docs/10` § 11 W4's register: what cannot be searched is said, never dropped. The same rule for a
 * demand parameter the engine has no field for — a slider that looked live would be worse than
 * either drawing this or drawing nothing, because it would be a claim about the run.
 */
function refusalRow(doc: Document, view: PatternRowView): HTMLElement {
  return el(doc, 'div', {
    children: [
      view.heading === '' ? null : el(doc, 'div', { className: 'slider-group', text: view.heading }),
      el(doc, 'div', {
        className: 'slider-head',
        children: [
          el(doc, 'span', {
            className: 'helpful',
            text: view.row.label,
            title: view.row.help,
            style: { color: 'var(--dimmer)' },
          }),
          el(doc, 'span', { className: 'slider-value', text: view.value }),
        ],
      }),
      el(doc, 'div', {
        className: 'slider-sub',
        text: `not a control here — ${view.refusal ?? ''}`,
        style: { color: 'var(--warn)' },
      }),
    ],
  });
}
