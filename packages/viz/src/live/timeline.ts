/**
 * The transport's phase-segmented timeline, the o'clock ticks under it, and the header clock.
 *
 * ## The clock is an offset, not a wall clock — `docs/12-design-handoff.md` § 4.1
 *
 * The design's header shows `08:42` at 22 px and its timeline is ruled `06:00 10:00 14:00 18:00
 * 22:00`. This simulator has no such day, and could not have one: CLAUDE.md invariant 3 says no
 * wall-clock time in `core/`, `Simulation.run()` returns a whole result, and `frameAt(recording,
 * t)` samples it — which is exactly what makes scrubbing backwards free and replay bit-identical.
 * Nothing in `core/` was ever asked for a clock and nothing here asks it for one.
 *
 * So the time of day is `DAY_START_S + simTimeS`, a **presentation offset applied to the kernel's
 * own seconds**. It adds no state, survives a round trip through JSON, and moves backwards when
 * the playhead does. `boundaries.test.ts` rule 2 confines `Date.now()`/`performance.now()` to
 * `playback/clock.ts`; this module reads neither, and could not usefully — a run's simulated
 * 08:42 has nothing to do with the reader's afternoon.
 *
 * ## The segments are the run's own demand, not an invented sixteen hours
 *
 * § 4.1 again, and this is the deviation the whole file exists to keep honest. The design
 * generates seven office phases — `TRICKLE`, `AM PEAK`, `LUNCH`, … — from an authored pattern
 * object. The shipped demand templates do not describe a sixteen-hour day: `rise-and-fall` is
 * thirty minutes and `constant-iso` is two hours. Drawing `AM PEAK` over a thirty-minute
 * rise-and-fall run would be a label that does not describe the demand underneath it, which is
 * precisely what the honesty card exists to prevent.
 *
 * So the segments are `recording.demandPhases` — the resolved template's own phases, with their
 * real `%pop/5 min` — and when that array is **empty**, which is the legal value for a recording
 * written before schema 7 or one whose template would not resolve, {@link timelineOf} returns
 * **one unlabelled band** covering the run. It never invents a schedule.
 *
 * Layout, hierarchy, segment colouring, playhead, tick row, click-to-scrub and speed chips are
 * all as drawn. What changed is that the labels are true.
 */

import type { SimTime } from '@elevator-sim/core/browser';

import type { VizPhase, VizRecording } from '../contract/types.js';

import type { TickLabel, TimelineSegment } from './types.js';

/**
 * The hour a run starts at when it declares none. 06:00, as the design rules its timeline.
 *
 * The **only** number in this module that is not the run's own, and it is a caption rather than a
 * modelling constant: nothing statistical reads it, no simulated quantity changes if it moves,
 * and the demand template underneath is unaffected. It exists so that a reader sees *07:12* over
 * a morning peak instead of *4 320 s*.
 *
 * **It is now the fallback rather than the answer** — issue #83. Every shipped template but one
 * declares its own hour (§ D244), a *part* of a day declares the part's (§ D285), and
 * `dev/main.ts` reads the run's and passes it in. A `lunch-two-way` drawn at 06:00 was worse than
 * no clock at all, because a player concluded from it that the traffic pattern did not matter much.
 * The default survives for the two cases that genuinely have no hour: `constant-iso`, which
 * declares none on purpose, and a recording restored from a file, whose hour `VizRecording` does
 * not carry.
 */
export const DAY_START_S = 6 * 3600;

const SECONDS_PER_DAY = 24 * 3600;

/**
 * `hh:mm` from a time of day in seconds — the design's `hhmm`, `:1361–1364`.
 *
 * Wrapped into `[0, 24 h)` rather than allowed to print `26:10`. A shift long enough to wrap is
 * not a run this project produces today — the coach ribbon defaults to 1 800 s — but a caller may
 * set any duration, and a clock that grew a third hour digit would silently break the transport's
 * fixed-width tick row.
 */
export function hhmm(todS: number): string {
  const wrapped = ((todS % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const hours = Math.floor(wrapped / 3600);
  const minutes = Math.floor((wrapped % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Time of day at a playhead position, seconds since midnight.
 *
 * `dayStartS` is the run's own hour and defaults to {@link DAY_START_S} — see that constant for why
 * the default is a fallback rather than the answer. `undefined` is accepted as well as omission, so
 * a caller holding `trace.startOfDayS` for a template that declares no hour can pass it straight
 * through rather than restating the default at the call site.
 */
export function timeOfDayAt(simTimeS: SimTime, dayStartS: number | undefined = DAY_START_S): number {
  return (dayStartS ?? DAY_START_S) + simTimeS;
}

/** The header's clock, `hh:mm`, at a playhead position. See {@link timeOfDayAt} for `dayStartS`. */
export function clockAt(simTimeS: SimTime, dayStartS?: number | undefined): string {
  return hhmm(timeOfDayAt(simTimeS, dayStartS));
}

/* -------------------------------------------------------------------------- *
 * The segment palette
 * -------------------------------------------------------------------------- */

interface SegmentPalette {
  readonly bg: string;
  readonly fg: string;
}

/**
 * The design's six segment pairs — `:988–994` — mapped onto the four real {@link VizPhase} kinds.
 *
 * The design's palette encodes *how hard the building is being pushed*, on a scale of visual
 * weight: `QUIET` and `TRICKLE` are the two dimmest blues, `STEADY` is a neutral mid, and the
 * three loud pairs — green `LUNCH`, amber `PM PEAK`, violet `AM PEAK` — mark the segments the
 * prototype flags `peak: true`. The mapping below preserves that ordering against the kinds this
 * simulator actually has, and every pair is used exactly once:
 *
 * | design pair | design segment | mapped to | why |
 * |---|---|---|---|
 * | `#2a2033/#c69ad8` | `AM PEAK` | `hold` | The loudest pair for the only kind that is genuinely a peak: `recordRun`'s `labelOfPhase` reserves the word `PEAK` for a segment holding the template's peak intensity, so the two agree by construction. Violet is the one hue in the strip, which makes the peak findable at a glance on a 240 px bar. |
 * | `#2c2418/#dbb075` | `PM PEAK` | `ramp-up` | Warm amber for demand climbing toward that peak. The prototype's second-loudest pair for the run-up to its second peak. |
 * | `#20291f/#9fc48a` | `LUNCH` | `ramp-down` | Green for the queue clearing. `LUNCH` is the prototype's churn segment — busy but not the worst — which is what a drain is. |
 * | `#161e2a/#6d7b8d` | `STEADY` | `flat`, above zero | Neutral mid for a template that simply holds below its peak. `constant-iso` is two hours of this and is `STEADY`, not a two-hour rush. |
 * | `#131a24/#5d6b7d` | `QUIET` | `flat`, at zero | The dimmest pair for a segment asking for nothing at all. |
 * | `#151c27/#5d6b7d` | `TRICKLE` | the unlabelled fallback | Dim and mute, for the band drawn when the recording carries no schedule. It has to *look* like it is not claiming anything, because it is not. |
 *
 * ## The values are token names now, and the hexes above are history — § D251
 *
 * Every pair in that table used to be *written here*, and `dev/main.ts` puts a segment's `bg` and
 * `fg` into an inline `style`. **An inline style is not reached by `:root[data-theme='light']`**,
 * so the strip stayed dark on a light page however complete the palette was, and the label — a
 * pre-§ D235 `#6d7b8d`, a value the ink ladder had already left behind — measured **3.15:1 in
 * both modes**. That is this repository's signature defect, wearing a transport bar's hat: a
 * palette held in a second place, where nothing that themes the page can see it.
 *
 * So the six pairs are `--phase-*` in `index.html`, derived from tokens the palette already
 * declares, and this module names them. The hexes stay in the table above because they are what
 * the handoff drew and the derivation is answerable to them; they are no longer what the page
 * paints. `live/palette.test.ts` asserts that no colour literal survives anywhere in this
 * directory, and that every custom property named here is one `index.html` declares.
 */
export const PHASE_PALETTE: Readonly<Record<VizPhase['kind'], SegmentPalette>> = Object.freeze({
  'ramp-up': Object.freeze({ bg: 'var(--phase-rising)', fg: 'var(--phase-rising-ink)' }),
  hold: Object.freeze({ bg: 'var(--phase-peak)', fg: 'var(--phase-peak-ink)' }),
  'ramp-down': Object.freeze({ bg: 'var(--phase-clearing)', fg: 'var(--phase-clearing-ink)' }),
  flat: Object.freeze({ bg: 'var(--phase-steady)', fg: 'var(--phase-ink)' }),
});

/** `flat` at zero intensity is not the same segment as `flat` below peak. See {@link PHASE_PALETTE}. */
export const QUIET_PALETTE: SegmentPalette = Object.freeze({
  bg: 'var(--phase-quiet)',
  fg: 'var(--phase-ink-quiet)',
});

/** The band drawn when nothing is known. See {@link PHASE_PALETTE}. */
export const UNKNOWN_PALETTE: SegmentPalette = Object.freeze({
  bg: 'var(--phase-unknown)',
  fg: 'var(--phase-ink-quiet)',
});

export interface TimelineOptions {
  /**
   * Where the shift's clock starts, seconds since midnight. Defaults to {@link DAY_START_S}.
   *
   * A parameter rather than a constant read from module scope so that a test can pin a clock
   * without reaching into this file, and so a future *shift starts at 07:00* control has
   * somewhere to write.
   */
  readonly dayStartS?: number;
}

/* -------------------------------------------------------------------------- *
 * The timeline
 * -------------------------------------------------------------------------- */

/**
 * The transport's segments, contiguous over `[startedAt, endedAt]`.
 *
 * **The schedule is shorter than the run, and that is the normal case rather than the corner.**
 * `VizPhase` promises contiguity over `[0, demandEndedAt]`, not over the run: `recordRun` scales
 * the template's knots onto `config.durationS`, and `Simulation` then keeps going until the
 * people already in the system have been delivered. Measured at the shipped 900 s configuration,
 * four of the five buildings run past it — Midtown Office to 1 938 s. The tail gets its own
 * `DRAIN` band rather than being left as a hole the playhead can sit in.
 *
 * The phases are also clipped to the run rather than trusted to fit inside it, because a
 * recording loaded from a file was written by a build this one cannot vouch for. Between the two,
 * the bar always covers the run exactly, which is what a playhead percentage depends on.
 *
 * When `recording.demandPhases` is empty — the legal value for a pre-schema-7 recording, or one
 * whose template would not resolve — the result is **exactly one** unlabelled band spanning the
 * run. See the module docstring: the alternative is a caption that does not describe the picture.
 */
export function timelineOf(
  recording: VizRecording,
  options: TimelineOptions = {},
): readonly TimelineSegment[] {
  const dayStartS = options.dayStartS ?? DAY_START_S;
  const { startedAt, endedAt } = recording;
  const runSpan = Math.max(endedAt - startedAt, 0);

  const clipped = recording.demandPhases
    .map((phase) => ({
      phase,
      startS: Math.max(phase.startS, startedAt),
      endS: Math.min(phase.endS, endedAt),
    }))
    .filter((entry) => entry.endS > entry.startS);

  const geometry = (startS: SimTime, endS: SimTime): Pick<TimelineSegment, 'span' | 'startPct' | 'widthPct'> => ({
    span: endS - startS,
    startPct: runSpan === 0 ? 0 : ((startS - startedAt) / runSpan) * 100,
    widthPct: runSpan === 0 ? 100 : ((endS - startS) / runSpan) * 100,
  });

  if (clipped.length === 0) {
    return [
      {
        id: 'whole-run',
        kind: undefined,
        label: '',
        startS: startedAt,
        endS: endedAt,
        ...geometry(startedAt, endedAt),
        bg: UNKNOWN_PALETTE.bg,
        fg: UNKNOWN_PALETTE.fg,
        // No phase name, because none is known. The clock span alone is a fact about the run.
        title: `${hhmm(dayStartS + startedAt)}–${hhmm(dayStartS + endedAt)}`,
        ratePctPop5min: null,
        inReportWindow: true,
      },
    ];
  }

  const segments: TimelineSegment[] = [];

  // Whether an unscheduled band overlaps the only quotable part of the run, computed rather than
  // assumed `false`: `VizPhase.inReportWindow` is a fact about a segment, and an inferred one
  // would be a second answer to a question the summary already settles.
  const reportWindow = recording.summary.reportWindow;
  const overlapsWindow = (startS: SimTime, endS: SimTime): boolean =>
    endS > reportWindow.startS && startS < reportWindow.endS;

  // A schedule that begins after the run does. Not produced by any shipped template — every one
  // of them starts at 0 — but the bar's contiguity is what a playhead percentage depends on, so
  // the gap is closed structurally rather than assumed away.
  const first = clipped[0];
  if (first !== undefined && first.startS > startedAt + EPSILON_S) {
    segments.push(
      unscheduledBand({
        id: 'before-schedule',
        startS: startedAt,
        endS: first.startS,
        dayStartS,
        geometry,
        note: 'before the demand schedule',
        inReportWindow: overlapsWindow(startedAt, first.startS),
      }),
    );
  }

  for (const { phase, startS, endS } of clipped) {
    const palette = paletteFor(phase);
    segments.push({
      id: phase.id,
      kind: phase.kind,
      label: phase.label,
      startS,
      endS,
      ...geometry(startS, endS),
      bg: palette.bg,
      fg: palette.fg,
      title: titleOf(phase, dayStartS + startS),
      ratePctPop5min: phase.ratePctPop5min,
      inReportWindow: phase.inReportWindow,
    });
  }

  // The drain, and it is the common case rather than the corner: `recordRun` scales the template
  // onto `config.durationS`, and four of the five shipped buildings run **past** that — Midtown
  // Office to 1 938 s against a 900 s schedule — because `Simulation` keeps going until the people
  // already in the system have been delivered. `VizPhase` says so in as many words: the phases are
  // contiguous over `[0, demandEndedAt]`, which is not `endedAt`.
  //
  // The band is labelled `DRAIN` and titled *past the demand schedule*, which is exactly what it
  // is, and no rate is claimed for it. It deliberately does **not** say *nobody is arriving*:
  // measured, Mixed-Use High-Rise registers its last leg at 1 322 s against a 900 s schedule,
  // because a journey through a sky lobby registers its second leg when the first one lands.
  const last = clipped[clipped.length - 1];
  if (last !== undefined && endedAt > last.endS + EPSILON_S) {
    segments.push(
      unscheduledBand({
        id: 'drain',
        startS: last.endS,
        endS: endedAt,
        dayStartS,
        geometry,
        note: 'past the demand schedule',
        label: 'DRAIN',
        inReportWindow: overlapsWindow(last.endS, endedAt),
      }),
    );
  }

  return segments;
}

/** How close two boundaries have to be before they count as the same instant. */
const EPSILON_S = 1e-6;

/**
 * A band the demand template says nothing about — the drain, or a schedule that starts late.
 *
 * `ratePctPop5min` is `null` rather than `0`, for the reason {@link VizPhase} gives about its own:
 * `0 %` reads as a *measurement* that nobody is coming, and this band has not measured anything.
 */
interface UnscheduledBand {
  readonly id: string;
  readonly startS: SimTime;
  readonly endS: SimTime;
  readonly dayStartS: number;
  readonly geometry: (
    startS: SimTime,
    endS: SimTime,
  ) => Pick<TimelineSegment, 'span' | 'startPct' | 'widthPct'>;
  readonly note: string;
  readonly label?: string;
  readonly inReportWindow: boolean;
}

function unscheduledBand(band: UnscheduledBand): TimelineSegment {
  const label = band.label ?? '';
  return {
    id: band.id,
    kind: undefined,
    label,
    startS: band.startS,
    endS: band.endS,
    ...band.geometry(band.startS, band.endS),
    bg: UNKNOWN_PALETTE.bg,
    fg: UNKNOWN_PALETTE.fg,
    title:
      `${label === '' ? '' : `${label} · `}` +
      `${hhmm(band.dayStartS + band.startS)}–${hhmm(band.dayStartS + band.endS)} · ${band.note}`,
    ratePctPop5min: null,
    inReportWindow: band.inReportWindow,
  };
}

/**
 * `PEAK · 07:12 · 11.4 %pop/5 min`.
 *
 * The rate clause is **omitted** rather than zeroed when `ratePctPop5min` is `null`, which is what
 * `VizPhase` means by it: the run's record carries no population to divide by, and `0 %` there
 * would read as *nobody is coming*.
 */
function titleOf(phase: VizPhase, todS: number): string {
  const parts = [phase.label, hhmm(todS)];
  if (phase.ratePctPop5min !== null) {
    parts.push(`${phase.ratePctPop5min.toFixed(1)} %pop/5 min`);
  }
  return parts.join(' · ');
}

function paletteFor(phase: VizPhase): SegmentPalette {
  if (phase.kind === 'flat' && phase.startIntensity === 0 && phase.endIntensity === 0) {
    return QUIET_PALETTE;
  }
  return PHASE_PALETTE[phase.kind];
}

/**
 * The segment the playhead is in, for the header's phase pill (requirement S3).
 *
 * Right-continuous, matching every other sampler in this package: an instant exactly on a
 * boundary belongs to the segment that is starting. The last segment owns `endedAt` itself, so
 * a playhead parked at the end of the run has a pill rather than a blank.
 */
export function phaseAt(
  recording: VizRecording,
  simTimeS: SimTime,
  options: TimelineOptions = {},
): TimelineSegment | undefined {
  const segments = timelineOf(recording, options);
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  const found = segments.find((segment) => t >= segment.startS && t < segment.endS);
  return found ?? segments[segments.length - 1];
}

/**
 * The o'clock row under the timeline — `count` labels, evenly spaced, both ends inclusive.
 *
 * The design's row is five fixed labels of an authored sixteen-hour day. These are the run's
 * **actual** simulated times, which is § 4.1's whole point: a 1 800 s shift is ruled
 * `06:00 06:07 06:15 06:22 06:30`, and that ruler is true of the picture above it.
 *
 * `count` below 2 yields a single label at the start; a caller asking for one tick has asked for
 * a start marker, and returning an empty row instead would silently drop the design's element.
 */
export function tickLabelsOf(
  recording: VizRecording,
  count: number,
  options: TimelineOptions = {},
): readonly TickLabel[] {
  const dayStartS = options.dayStartS ?? DAY_START_S;
  const { startedAt, endedAt } = recording;
  const span = Math.max(endedAt - startedAt, 0);
  const ticks = Math.max(1, Math.floor(count));
  if (ticks === 1) {
    return [{ atS: startedAt, todS: dayStartS + startedAt, label: hhmm(dayStartS + startedAt), pct: 0 }];
  }
  return Array.from({ length: ticks }, (_unused, index): TickLabel => {
    const fraction = index / (ticks - 1);
    const atS = startedAt + span * fraction;
    return {
      atS,
      todS: dayStartS + atS,
      label: hhmm(dayStartS + atS),
      pct: fraction * 100,
    };
  });
}

/** Where the playhead sits along the bar, `0`–`100`. */
export function playheadPctOf(recording: VizRecording, simTimeS: SimTime): number {
  const span = recording.endedAt - recording.startedAt;
  if (span <= 0) return 0;
  const t = clamp(simTimeS, recording.startedAt, recording.endedAt);
  return ((t - recording.startedAt) / span) * 100;
}

function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}
