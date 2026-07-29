/**
 * Every player-facing item of a run, in both modes at once — `docs/10-experience-layer-contract.md`
 * § 4, and the thing [`DECISIONS.md` § D163](../../../../DECISIONS.md) clause 2 is measured against.
 *
 * ## What this module is, and what it deliberately is not
 *
 * It is **not** a second run summary. `render/runSummary.ts` decides what every figure says, what
 * its `n` is, whether it is suppressed and whether a natural-frequency restatement is admissible;
 * `campaign/failStates.ts` decides what each fail state means, how often it happened and where.
 * This module takes both, unaltered, and answers one further question: *which of these may Basic
 * leave out, and what must survive when it does?*
 *
 * That split is the reason the parity check can be a check. If Basic re-derived a suppression
 * reason or re-counted a fail state, parity would compare two computations and would pass whenever
 * both were wrong in the same way. It compares two **presentations of one datum**, and the datum is
 * carried verbatim.
 *
 * ## The three sets § D163 names, and where each one's members come from
 *
 * | set | derived from | a ninth member arrives by |
 * |---|---|---|
 * | failure states | `failStateReports(…)`, which maps `FAIL_STATES` | adding one to `campaign/types.ts` |
 * | suppression reasons | figures `runSummaryFigures` returns with `kind: 'suppressed'` | a fifth `awtIsValid` ground in `core` |
 * | fail-state diagnoses | the same reports' `diagnosis` field | the same edit as the first row |
 *
 * Plus § 4's other four non-negotiables, each from its own source: the seed from the recording,
 * the undelivered count from the summary, the warnings from `recording.warnings`, and the
 * locked-out landings from `access/lockedOut.ts`. **No list in this file enumerates a member of
 * any of them.**
 *
 * ## The one thing Basic cannot do, stated rather than faked
 *
 * § 4's table says the raw `awtInvalidReason` goes *"behind 'why?' on the plain-language form"*,
 * and R3 allows Basic to **shorten** a reason. Basic here does not shorten it, and that is a
 * finding rather than an omission: `core` emits the reason as **prose with no ground code**
 * (`metrics/summarize.ts` builds one of four sentences and returns a `string`), so a per-ground
 * Basic rewording would have to decide *which* ground fired by re-reading `saturated`,
 * `waitCount`, `unservedCount` and `serviceLevel.verdict` in `core`'s own precedence order. That
 * is a second source of truth about a question `core` has already answered — **R9**, exactly — and
 * it would be wrong in the case that matters: the fourth ground exists precisely because a run can
 * look unsaturated and uncensored and still be refused.
 *
 * So Basic leads with a **ground-free** plain sentence and carries the measurement layer's reason
 * verbatim underneath. Closing this properly needs `core` to carry the ground beside the prose;
 * until it does, the honest Basic form is the one that cannot contradict Advanced.
 */

import type { PassengerModel } from '@elevator-sim/core/browser';

import type { LockedOutLanding } from '../access/lockedOut.js';
import type { FailStateReport } from '../campaign/failStates.js';
import type { VizRecording } from '../contract/types.js';
import {
  ENERGY_ID,
  INTERVAL_ID,
  RUN_ID,
  WINDOW_ID,
  runSummaryFigures,
  type SummaryFigure,
} from '../render/runSummary.js';
import type { DisclosureItem, Rendering, Severity } from './types.js';

/* -------------------------------------------------------------------------- *
 * The negotiable half — § 4's "What Basic hides"
 * -------------------------------------------------------------------------- */

/**
 * Run-summary figures Basic leaves out, by id.
 *
 * This *is* a list, and it is the only one in the module. It is the negotiable half of § 4 — the
 * complexity, not the failures — and it is guarded from both sides:
 *
 * - a figure named here that {@link runSummaryFigures} does not produce is caught by
 *   `mode/disclosure.test.ts`, which checks every id against `FIGURE_ORDER`;
 * - a figure named here that turns out to carry a failure is caught by the parity check, because
 *   a suppressed figure never reaches this list — it becomes a `suppression` item first.
 *
 * Both entries are § 7.2's *"technical only"* column, quoted rather than judged:
 * `intervalCoV` *"gets **no** plain-language form … Show it as a number with its definition, or
 * not at all"*, and the energy proxy is R11's axis, which **may** be displayed and is never
 * required to be — a Basic reader who cannot see it cannot mistake it for a score.
 */
export const BASIC_HIDES: ReadonlySet<string> = new Set([INTERVAL_ID, ENERGY_ID]);

/**
 * § 4: the window bounds label is *"replaced by 'the busiest 5 minutes'; exact bounds in
 * Advanced"*. The only figure whose Basic **value** differs from its Advanced one.
 */
export const BASIC_WINDOW_VALUE = 'the busiest 5 minutes of this run';

/* -------------------------------------------------------------------------- *
 * Input
 * -------------------------------------------------------------------------- */

/**
 * A fail state as this module needs it: {@link FailStateReport} with its `state` **widened to
 * `string`**.
 *
 * `FailStateReport.state` is `FailState`, a union of the four `FAIL_STATES` ship. A shipped report
 * is assignable here and nothing about the campaign loosens — but a **fifth** state can be handed
 * in, which is [§ D134](../../../../DECISIONS.md)'s fictional-schema technique applied to a union
 * instead of a schema. Without it the only ninth failure state a test could construct would be one
 * `FAIL_STATES` already contains, and the parity check's genericity would be unprovable: it would
 * pass because the shipped four fit, which § D152 says is not the same as being derived.
 *
 * The widening is on the **consumer**, exactly as `CollectOptions.nullDefault` was — see § D166.
 */
export interface FailStateDisclosure extends Omit<FailStateReport, 'state'> {
  readonly state: string;
}

export interface DisclosureInput {
  readonly recording: VizRecording;
  /**
   * The dispatcher's display name, for § 4's *"the id replaced by its display name"*.
   *
   * Optional because a `VizRecording` carries the **id** and nothing else — a recording loaded
   * from a file has no `data/` beside it. When it is absent Basic shows the id, which is a worse
   * reading and not a false one.
   */
  readonly dispatcherName?: string | undefined;
  /**
   * § 5.3's fail states, already counted and diagnosed. Empty on the single-run viewer, which has
   * no batch to count over and must not invent one (**R2**).
   */
  readonly failStates?: readonly FailStateDisclosure[] | undefined;
  /** § 10.4's locked-out landings, from the caller that knows this run's access zoning. */
  readonly lockedOut?: readonly LockedOutLanding[] | undefined;
}

/* -------------------------------------------------------------------------- *
 * How a row is classed
 * -------------------------------------------------------------------------- */

/**
 * The CSS classes one item's row carries, derived and never written at a mount.
 *
 * Three parts, and the first is the one that keeps the existing stylesheet true. A row used to be
 * classed by `SummaryFigureKind` — `figure-observation`, `figure-estimate`, `figure-suppressed`,
 * `figure-absent` — and `index.html` styles all four. Moving the mount onto items would have
 * replaced that vocabulary with the **origin** kind and silently un-styled every row, which is a
 * regression a suite cannot see and a driven session can: it was found by driving, in the same
 * session, before this function existed.
 *
 * So the figure kind survives where there is one, the origin kind is added as a hook for the rows
 * that are not figures, and `figure-warning` is emitted from the **rendering's** severity — which
 * is the mode-sensitive half, and therefore the half `parity.ts` rule 3 guards.
 */
export function rowClassesOf(
  item: DisclosureItem,
  rendering: Rendering,
): readonly string[] {
  /*
   * `figure-origin-…` rather than `figure-…`, and the prefix is a finding rather than a
   * preference: the origin kind `warning` produced the class `figure-warning`, which is the class
   * the **severity** emits, so a warning row was indistinguishable from a de-escalated one and the
   * severity half of this function could not be observed. Caught by the test that was written to
   * watch it work.
   */
  const classes = ['figure', `figure-origin-${item.origin.kind}`];
  if (item.origin.kind === 'figure') classes.push(`figure-${item.origin.figureKind}`);
  /* A refused statistic keeps the class the stylesheet already gives one. */
  if (item.origin.kind === 'suppression') classes.push('figure-suppressed');
  if (rendering.severity === 'warning') classes.push('figure-warning');
  return classes;
}

/* -------------------------------------------------------------------------- *
 * Building the items
 * -------------------------------------------------------------------------- */

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

function rendering(
  value: string,
  note: string | undefined,
  severity: Severity,
  figure?: SummaryFigure | undefined,
): Rendering {
  return {
    value,
    ...(figure?.count === undefined ? {} : { count: figure.count }),
    ...(note === undefined ? {} : { note }),
    bars: figure?.bars ?? [],
    severity,
  };
}

/**
 * The ground-free lead sentence for a refused statistic.
 *
 * Says the same thing whichever ground fired, because this package cannot know which one did
 * without re-deciding it — see the module docstring. It never replaces the reason; it precedes it.
 */
export const SUPPRESSION_LEAD =
  'There is no number here, and that is a result rather than a gap: this run’s own statistics ' +
  'refuse to stand behind one. The measurement’s reason follows, in its own words — rewriting it ' +
  'would be a second answer to the same question.';

/**
 * Every item a run puts in front of a player, with both modes' renderings.
 *
 * Order is the run summary's own order (`FIGURE_ORDER`), then the run-level facts § 4 names, then
 * the fail states in **R4's order of preference**, which is the order `failStateReports` returns.
 */
export function disclosureItems(input: DisclosureInput): readonly DisclosureItem[] {
  const { recording } = input;
  const { summary } = recording;
  const items: DisclosureItem[] = [];

  for (const figure of runSummaryFigures(recording)) {
    items.push(itemForFigure(figure, input));
  }

  /*
   * § 4 item 2. Not a run-summary figure — `runSummaryFigures` has no row for `undelivered`, and
   * before this the count reached the screen only through `dev/main.ts`'s status line, which is
   * one string on one surface. A count of people who never arrived is a failure by § 4's own list
   * and it now has an item that says so in both modes.
   */
  const undelivered = summary.undelivered;
  const undeliveredText =
    undelivered === 0
      ? 'Everybody who called was carried before the clock ran out.'
      : `${String(undelivered)} ${plural(undelivered, 'person', 'people')} never got where they ` +
        'were going before the clock ran out.';
  const undeliveredSeverity: Severity = undelivered > 0 ? 'warning' : 'normal';
  items.push({
    id: 'undelivered',
    label: 'people left behind',
    origin: { kind: 'undelivered' },
    advanced: rendering(undeliveredText, `The run ended ${recording.status}.`, undeliveredSeverity),
    basic: rendering(undeliveredText, `The run ended ${recording.status}.`, undeliveredSeverity),
    mustCarry: [undeliveredText],
  });

  /*
   * § 4 item 7. `VizRecording.warnings` has been on the contract since schema 1 and **no surface
   * in this package read it** — `recordRun` copies `result.warnings` in and nothing took them out
   * again, so `double-deck-not-simulated` was carried honestly by the recording and drawn by
   * nobody. The roadmap's standing requirement is *"name the non-test caller"*; there was none.
   *
   * **One row per warning, and it is a lot of rows.** Measured by driving: Secure Tower at seed
   * 20260729 raises **thirteen** — a floor that can place none of its interfloor demand, 56
   * origin-destination pairs dropped, and eleven landing calls no car ever collected. Grouping
   * them behind a count would read better and is deliberately not done here: § 4 puts warnings on
   * the never-hide list, the parity check requires each one's **text** in Basic, and a grouping
   * that summarised them would be the first place a warning could go missing. Left as a stated
   * limitation rather than solved badly.
   */
  for (const [index, warning] of recording.warnings.entries()) {
    items.push({
      id: `warning-${String(index)}`,
      label: 'warning from this run',
      origin: { kind: 'warning', index },
      advanced: rendering(warning, undefined, 'warning'),
      basic: rendering(warning, undefined, 'warning'),
      mustCarry: [warning],
    });
  }

  items.push(passengerModelItem(recording.passengerModel));

  const lockedOut = input.lockedOut ?? [];
  if (lockedOut.length > 0) {
    const named = lockedOut
      .map(
        (landing) =>
          `${landing.floorId} (${String(landing.legCount)} ` +
          `${plural(landing.legCount, 'call', 'calls')})`,
      )
      .join(', ');
    const text = `A call no car may legally answer was registered at ${named}.`;
    items.push({
      id: 'locked-out',
      label: 'locked out',
      origin: { kind: 'locked-out' },
      advanced: rendering(
        text,
        'This is not congestion. The rider’s credential is not one this dispatcher can read, or ' +
          'the rider holds none at all — the fix is in the building’s access zoning.',
        'warning',
      ),
      basic: rendering(
        text,
        'This is not congestion — nobody was allowed to come, which is a different problem from ' +
          'nobody being free to.',
        'warning',
      ),
      mustCarry: [text],
    });
  }

  for (const report of input.failStates ?? []) {
    items.push(...failStateItems(report));
  }

  return items;
}

/* -------------------------------------------------------------------------- *
 * One run-summary figure
 * -------------------------------------------------------------------------- */

function itemForFigure(figure: SummaryFigure, input: DisclosureInput): DisclosureItem {
  const severity: Severity = figure.severity;

  /*
   * A refused statistic, first and unconditionally. It is decided by the figure's own `kind`,
   * which `render/runSummary.ts` sets from `meansAreSuppressed` — one gate, R9 — so a fifth
   * ground added in `core` produces a fifth suppressed figure and lands in the must-show set with
   * no edit anywhere in this package.
   */
  if (figure.kind === 'suppressed') {
    const reason = figure.note ?? '';
    return {
      id: figure.id,
      label: figure.label,
      origin: { kind: 'suppression', figureId: figure.id },
      advanced: rendering(figure.value, reason, severity, figure),
      basic: rendering(figure.value, `${SUPPRESSION_LEAD} ${reason}`, severity, figure),
      mustCarry: [figure.value, reason],
    };
  }

  const origin = { kind: 'figure', figureId: figure.id, figureKind: figure.kind } as const;
  const advanced = rendering(figure.value, figure.note, severity, figure);

  if (figure.id === RUN_ID) {
    /* § 4: the profile id is replaced by its display name; the **seed** is not negotiable (R7). */
    const name = input.dispatcherName;
    const basicValue =
      name === undefined
        ? figure.value
        : `${input.recording.buildingName} · ${name}`;
    return {
      id: figure.id,
      label: figure.label,
      origin: { kind: 'run-identity' },
      advanced,
      basic: rendering(
        basicValue,
        `run #${input.recording.seed} — copy that number to watch this exact run again.`,
        severity,
        figure,
      ),
      mustCarry: [input.recording.seed],
    };
  }

  if (figure.id === WINDOW_ID) {
    return {
      id: figure.id,
      label: figure.label,
      origin,
      advanced,
      basic: rendering(BASIC_WINDOW_VALUE, figure.note, severity, figure),
      mustCarry: [],
    };
  }

  return {
    id: figure.id,
    label: figure.label,
    origin,
    advanced,
    basic: BASIC_HIDES.has(figure.id) ? null : advanced,
    mustCarry: [],
  };
}

/* -------------------------------------------------------------------------- *
 * The passenger model, and the fail states
 * -------------------------------------------------------------------------- */

function passengerModelItem(model: PassengerModel): DisclosureItem {
  const isDestination = model === 'destination-dispatch';
  const value = isDestination
    ? 'riders are told which car to walk to before it arrives'
    : 'riders press up or down and take whichever car answers';
  const note = isDestination
    ? 'There is no up or down button on a landing here, and a queue is a set of people already ' +
      'assigned to different cars rather than a set of people waiting for the same one.'
    : undefined;
  return {
    id: 'passenger-model',
    label: 'how a call is made',
    origin: { kind: 'passenger-model', model },
    advanced: rendering(`${model} — ${value}`, note, 'normal'),
    basic: rendering(value, note, 'normal'),
    mustCarry: isDestination ? [value] : [],
  };
}

/**
 * Two items per fail state: what it is and how often, and where it happened.
 *
 * Two rather than one because § D163 names *"failure states"* and *"fail-state diagnoses"* as
 * separate sets, and a check that could only say *"the `abandoned` row is missing"* would pass a
 * Basic mode that kept the row and dropped the floor it names.
 */
function failStateItems(report: FailStateDisclosure): readonly DisclosureItem[] {
  const severity: Severity = report.occurredInDemonstration ? 'warning' : 'normal';
  const note = report.lever === '' ? report.sentence : `${report.sentence} ${report.lever}`;
  return [
    {
      id: `fail-state-${report.state}`,
      label: report.state,
      origin: { kind: 'fail-state', state: report.state },
      advanced: rendering(report.frequency, note, severity),
      /*
       * Identical in both modes, and that is § 4 rather than laziness: a fail state is on the
       * non-negotiable list, so there is nothing here for Basic to hide. What Basic gains is that
       * the batch's own words are already in the reader's register — `failStates.ts` writes them
       * that way because it has no second, technical form to fall back on.
       */
      basic: rendering(report.frequency, note, severity),
      mustCarry: [report.frequency, report.sentence],
    },
    {
      id: `fail-state-${report.state}-diagnosis`,
      label: `${report.state} — where`,
      origin: { kind: 'fail-state-diagnosis', state: report.state },
      advanced: rendering(report.diagnosis, undefined, severity),
      basic: rendering(report.diagnosis, undefined, severity),
      mustCarry: [report.diagnosis],
    },
  ];
}
