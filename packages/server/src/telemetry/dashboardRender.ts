/**
 * **The KPI dashboard's reader** — GitHub issue #250,
 * [`docs/26-telemetry-and-privacy.md`](../../../../docs/26-telemetry-and-privacy.md) § 20.
 *
 * `dashboard.ts` is the route and this is the surface. The division is § 18.2's, R-1's bound:
 * *"the minimum cell size is enforced in the route, not in the reader — a dashboard that filters
 * small cells is one query away from a dashboard that does not."*
 *
 * **So this file has nothing to filter with.** A {@link RefusedCell} carries no value, no count and
 * no interval; there is no number in it to draw, hide, round or merge. That is not a promise this
 * module keeps — it is a shape it is handed.
 *
 * ## What it draws, and the two things it must not
 *
 * - **Every success criterion with its target** (#250 AC2), on the four panels that have one. And
 *   an explicit *no target* line on the four that do not, naming § 6.1: a diagnostic explains why a
 *   KPI moved and may **not** be a gate, so a blank column would read as an oversight rather than
 *   as the decision it is.
 * - **No score.** Eight panels stay eight. [§ D106](../../../../DECISIONS.md) forbids a weight, a
 *   combined figure, a letter or a star, and forbids ordering two things on energy; a dashboard is
 *   the most natural place in this repository for a scalar over a person to appear, and § 6.4's
 *   first bullet forbids that outright.
 * - **No date picker, and no control at all.** {@link renderDashboard} takes a view and returns
 *   text. § D219 is this repository's signature defect — a control that writes no field of the
 *   state it claims to edit — and the cheapest way to not have it is to have no control. Said out
 *   loud because a reader will look for one: the grain is fixed and pre-declared (§ 20.3 ground 2),
 *   and the one convenience that would defeat the floor is the one this surface deliberately lacks.
 *
 * ## It is plain text, and that is a decision
 *
 * § 20.5: *"the output is written, dated, and names the figures it read — a note in this
 * repository, not a screenshot. A screenshot of a dashboard is a measurement with no deriver."*
 * Text is what pastes into that note. It also keeps this surface off every player path by
 * construction: there is no DOM here, nothing mounts, and `packages/viz` cannot import this package
 * at all.
 */

import {
  DASHBOARD_PANELS,
  MIN_CELL_PEOPLE,
  type Cell,
  type DashboardView,
  type Figure,
  type PanelTarget,
  type PanelView,
  type PartitionView,
} from './dashboard.js';

/** Where the cadence, the agenda and the owner's role are written. Cited, never restated. */
const REVIEW_CITATION =
  'The review is monthly and its agenda is four items, the fourth of which is one decision — ' +
  'docs/26 § 20.5, which is the only account of it. Two accounts of one rule drift apart, so this ' +
  'surface points at that section rather than repeating it.';

/**
 * The owner, and why no name is drawn.
 *
 * § 20.6 specifies the role and the decisions; who holds it is a staffing question the document
 * cannot answer (§ 18.4), and it is registered as owed in § 11 *before the first table is
 * published*. Inventing a name here would discharge a registered debt with a fiction, which is the
 * one thing this document's own § 0 rule about registers forbids.
 */
const OWNER_CITATION =
  'Owner: not named. docs/26 § 20.6 specifies the role — who holds access (which may not be ' +
  'delegated), whether a panel is added or removed, whether a refused cell may be published in ' +
  'another form, and the signature on each month’s written output — and § 18.4 says this project ' +
  'is not staffed by a document. The holder is registered as owed in § 11, before the first table ' +
  'is published. No name is invented here.';

function percent(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function seconds(value: number): string {
  return `${value.toFixed(1)} s`;
}

function millisAsMinutes(value: number): string {
  return `${(value / 60000).toFixed(1)} min`;
}

function figureValue(figure: Figure, value: number): string {
  switch (figure.statistic) {
    case 'share':
      return percent(value);
    case 'median-seconds':
      return seconds(value);
    case 'median-milliseconds':
      return millisAsMinutes(value);
    case 'count':
      return String(value);
  }
}

/**
 * A target, in the criterion's own direction.
 *
 * `at-most` reads `≤`, `at-least` reads `≥`. The direction is drawn rather than implied because
 * #250's fourth criterion is about which way a target may move, and a reader who cannot see the
 * direction cannot see a raise.
 */
function targetLine(target: PanelTarget): string {
  const relation = target.direction === 'at-most' ? '≤' : '≥';
  const value =
    target.unit === 'share'
      ? percent(target.value)
      : target.unit === 'seconds'
        ? `${String(target.value)} s`
        : `${String(target.value)} min`;
  return `Target: ${relation} ${value} (${target.criterion}). A met criterion is raised, never weakened — docs/26 § 20.5.`;
}

function figureLine(figure: Figure): string {
  const interval =
    figure.interval === null
      ? ''
      : `  [${figureValue(figure, figure.interval.lo)}, ${figureValue(figure, figure.interval.hi)}]`;
  return `      ${figure.label}: ${figureValue(figure, figure.value)}${interval}`;
}

function cellLines(cell: Cell): readonly string[] {
  const axes = Object.entries(cell.axes)
    .map(([name, value]) => `${name}=${value}`)
    .join('  ');
  if (cell.kind === 'refused') {
    return [`    ${axes}`, `      refused: ${cell.reason}`];
  }
  return [
    `    ${axes}`,
    ...cell.figures.map(figureLine),
    `      n = ${String(cell.counts.people)} people, ${String(cell.counts.observations)} observations`,
  ];
}

function partitionLines(partition: PartitionView): readonly string[] {
  const head = Object.entries(partition.axes)
    .map(([name, value]) => `${name}=${value}`)
    .join('  ');
  return [
    `  ${head}`,
    ...(partition.refusalNote === null ? [] : [`    (${partition.refusalNote})`]),
    ...partition.cells.flatMap(cellLines),
  ];
}

function panelLines(view: PanelView): readonly string[] {
  const { panel } = view;
  const lines = [
    '',
    `${panel.id} — ${panel.reads}  [${panel.kind}]`,
    panel.target === null
      ? '  No target. A diagnostic explains why a KPI moved and may not be a gate — docs/26 § 6.1. ' +
        'A target column here would turn an explanation into a gate.'
      : `  ${targetLine(panel.target)}`,
    view.baseline === null
      ? '  No baseline: a baseline belongs to a KPI, and this is a diagnostic (docs/26 § 20.4).'
      : `  Baseline: ${view.baseline.reading} — ${view.baseline.why}`,
    `  Grain: ${panel.axes.join(' × ')} (fixed and pre-declared — docs/26 § 20.3 ground 2)`,
  ];
  if (view.silence !== null) return [...lines, `  ${view.silence}`];
  if (view.partitions.length === 0) return [...lines, '  No cells: the source holds nothing for this panel.'];
  return [...lines, ...view.partitions.flatMap(partitionLines)];
}

/**
 * Render R-1.
 *
 * A pure function of the view: same view, same text. Nothing here reads a clock, a file or an
 * environment variable, so a note pasted from this output can be re-derived from the same rows —
 * which is § 20.5's own requirement that the review's output *names the figures it read*.
 */
export function renderDashboard(view: DashboardView): string {
  const lines = [
    'The KPI dashboard — docs/26 § 20, reader R-1 (docs/26 § 18.2)',
    '='.repeat(72),
    '',
    view.source.sentence,
    '',
    `Minimum cell size: ${String(view.minCellPeople)} distinct players. A cell under it is refused ` +
      'by name, in the route rather than in this reader (docs/26 § 20.3). Refusals inside one group ' +
      'read identically whether the cause was the floor or the complement rule — a cell that ' +
      'announced itself as a complement would announce that it is not under the floor.',
    '',
    `Panels: ${String(view.panels.length)}. docs/26 § 18.2 grants R-1 exactly § 6’s four KPIs and ` +
      '§ 6.3’s four diagnostics; a ninth needs § 18.2 to move first.',
    '',
    OWNER_CITATION,
    '',
    REVIEW_CITATION,
    '',
    'Not shown to a player, ever (docs/26 § 6.4, § 20.7 item 4). No score, no rank, no combined ' +
      'figure over the eight panels (§ D106, docs/26 § 6.4). No drill-through from a cell to a row ' +
      '(§ 20.7 item 2). No date range: this surface has no control at all (§ 20.7 item 1).',
    '',
    '-'.repeat(72),
    ...view.panels.flatMap(panelLines),
    '',
    '-'.repeat(72),
    `Derived from docs/26 § 20.2's own table: ${DASHBOARD_PANELS.length} panels, floor ` +
      `${String(MIN_CELL_PEOPLE)} people.`,
  ];
  return `${lines.join('\n')}\n`;
}
