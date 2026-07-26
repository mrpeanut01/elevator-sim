/**
 * Rendering a {@link CaseResult} as something a human can argue with.
 *
 * Markdown, because the destination is a docstring, a pull request and a console, and because a
 * table whose columns are `d`, `[lower, upper]` and a verdict is exactly the shape that makes it
 * impossible to quote a point estimate without its interval next to it.
 *
 * **Every row carries the interval.** Not the mean, not a percentage, not a star. CLAUDE.md
 * § Statistical discipline forbids declaring a difference from anything but a paired interval that
 * excludes zero, and a formatter that could emit a difference without its interval would make that
 * rule unenforceable one convenience function at a time. There is deliberately no
 * `formatMean(cell)` here.
 *
 * Pure and clock-free; every number comes from the result passed in.
 */

import { METRIC_LABELS } from './arms.js';
import type { CaseResult } from './suite.js';
import { verdictCounts } from './suite.js';
import type { CellComparison, CellVerdict } from './verdict.js';

const num = (value: number, places = 2): string =>
  Number.isFinite(value) ? value.toFixed(places) : 'n/a';

/** `-6.86 [-8.19, -5.53]` — a difference that cannot be read without its interval. */
export function formatInterval(cell: CellComparison, places = 2): string {
  const { estimate } = cell;
  return `${num(estimate.mean, places)} [${num(estimate.lower, places)}, ${num(estimate.upper, places)}]`;
}

/** `−29.7 %`, or `n/a` when the baseline mean was zero. */
export function formatRelative(cell: CellComparison): string {
  return Number.isFinite(cell.relativeEffect)
    ? `${(cell.relativeEffect * 100).toFixed(1)} %`
    : 'n/a';
}

/**
 * The note a cell earns beyond its verdict.
 *
 * `IDENTICAL` says how many of `n` differences were exactly zero, because that count *is* the
 * evidence. `INDISTINGUISHABLE` says how many replications the observed effect would need and
 * whether the baseline's saturation ceiling allows them — which is the difference between "raise
 * `n`" and "this is unresolvable here at any budget".
 */
export function cellNote(cell: CellComparison, admissible: number | undefined): string {
  switch (cell.verdict) {
    case 'IDENTICAL':
      return `bit-identical: ${cell.comparison.exactZeroCount}/${cell.comparison.n} paired differences exactly 0`;
    case 'INDISTINGUISHABLE': {
      if (cell.requiredReplications === undefined) return 'point estimate is exactly zero';
      const need = `needs n ≈ ${cell.requiredReplications}`;
      if (admissible === undefined) return `${need} (no saturation ceiling)`;
      return cell.resolvableWithinCeiling === true
        ? `${need}, under the ceiling of ${admissible}`
        : `${need}, ABOVE the ceiling of ${admissible} — unresolvable at this operating point`;
    }
    case 'UNQUOTABLE':
      return 'AWT invalidated on one or both sides; no interval quoted';
    case 'BETTER':
    case 'WORSE':
      return `rho = ${num(cell.comparison.correlation, 3)}`;
  }
}

/** One case's full table: one block per metric, arms as rows. */
export function formatCase(result: CaseResult): string {
  const lines: string[] = [];
  lines.push(`### ${result.label}`);
  lines.push('');
  lines.push(
    `Building \`${result.building}\`, traffic \`${result.experiment.plan.cells[0]?.trafficArmId ?? '?'}\`, ` +
      `n = ${result.replications} under CRN (aligned: ${result.crnAligned ? 'yes' : '**NO**'}), ` +
      `baseline \`${result.baselineId}\`` +
      (result.admissibleReplications === undefined
        ? ', no saturation ceiling in 1000 replications.'
        : `, budget ceiling ${result.admissibleReplications} (the baseline saturates beyond it).`),
  );
  if (!result.baselineQuotable) {
    lines.push('');
    lines.push(
      `> **The baseline has no quotable AWT here** — ${result.baselineQuotabilityReason ?? 'invalidated'}. Every cell below is \`UNQUOTABLE\`.`,
    );
  }
  if (result.unquotableArms.length > 0) {
    lines.push('');
    lines.push(`> Arms with no quotable AWT: ${result.unquotableArms.map((id) => `\`${id}\``).join(', ')}.`);
  }
  const identical = result.identityClasses.filter((members) => members.length > 1);
  if (identical.length > 0) {
    lines.push('');
    lines.push(
      `> **Bit-identical arms** (same runs, all metrics, all ${result.replications} replications): ` +
        identical.map((members) => members.map((id) => `\`${id}\``).join(' ≡ ')).join('; ') +
        '.',
    );
  }

  for (const metric of Object.keys(result.baselineMeans)) {
    const label = METRIC_LABELS[metric] ?? metric;
    const counts = verdictCounts(result, metric as never);
    lines.push('');
    lines.push(
      `**${label}** — baseline ${num(result.baselineMeans[metric] ?? Number.NaN)}. ` +
        `${counts.BETTER} better, ${counts.WORSE} worse, ${counts.INDISTINGUISHABLE} indistinguishable, ` +
        `${counts.IDENTICAL} identical, ${counts.UNQUOTABLE} unquotable.`,
    );
    lines.push('');
    lines.push('| arm | mean | d = arm − baseline, 95 % paired-t | rel. | verdict | note |');
    lines.push('|---|---|---|---|---|---|');
    for (const arm of result.arms) {
      const cell = arm.cell(metric as never);
      lines.push(
        `| \`${arm.armId}\` | ${num(arm.means[metric] ?? Number.NaN)} | ${formatInterval(cell)} | ` +
          `${formatRelative(cell)} | **${cell.verdict}** | ${cellNote(cell, result.admissibleReplications)} |`,
      );
    }
  }
  return lines.join('\n');
}

/** Every case, plus the one line the acceptance criterion actually turns on. */
export function formatBenchmark(results: readonly CaseResult[]): string {
  const blocks = results.map((result) => formatCase(result));
  return [...blocks, '', formatCriterionVerdict(results)].join('\n\n');
}

/** Which arms satisfy *each dispatcher beats the baseline on at least one building*, and on what. */
export interface CriterionOutcome {
  readonly armId: string;
  /** Cases where at least one metric came back `BETTER`. */
  readonly betterOn: readonly { readonly caseId: string; readonly metrics: readonly string[] }[];
  /** Cases where at least one metric came back `WORSE`. */
  readonly worseOn: readonly { readonly caseId: string; readonly metrics: readonly string[] }[];
  /** `true` iff some (case, metric) cell is `BETTER`. The criterion, read literally. */
  readonly meetsCriterion: boolean;
  /** `true` iff the arm was bit-identical to some other arm on every case. */
  readonly identicalToOther: boolean;
}

/** Evaluate the roadmap's first sentence, arm by arm. */
export function criterionOutcomes(results: readonly CaseResult[]): readonly CriterionOutcome[] {
  const armIds = results[0]?.arms.map((arm) => arm.armId) ?? [];
  return Object.freeze(
    armIds.map((armId) => {
      const betterOn: { caseId: string; metrics: string[] }[] = [];
      const worseOn: { caseId: string; metrics: string[] }[] = [];
      let identicalEverywhere = results.length > 0;
      for (const result of results) {
        const arm = result.arms.find((entry) => entry.armId === armId);
        if (arm === undefined) continue;
        const better = arm.cells.filter((cell) => cell.verdict === 'BETTER').map((c) => c.metric);
        const worse = arm.cells.filter((cell) => cell.verdict === 'WORSE').map((c) => c.metric);
        if (better.length > 0) betterOn.push({ caseId: result.caseId, metrics: better });
        if (worse.length > 0) worseOn.push({ caseId: result.caseId, metrics: worse });
        const sharesClass = result.identityClasses.some(
          (members) => members.length > 1 && members.includes(armId),
        );
        if (!sharesClass) identicalEverywhere = false;
      }
      return Object.freeze({
        armId,
        betterOn: Object.freeze(betterOn.map((entry) => Object.freeze(entry))),
        worseOn: Object.freeze(worseOn.map((entry) => Object.freeze(entry))),
        meetsCriterion: betterOn.length > 0,
        identicalToOther: identicalEverywhere,
      });
    }),
  );
}

function formatCriterionVerdict(results: readonly CaseResult[]): string {
  const outcomes = criterionOutcomes(results);
  const lines: string[] = ['### The criterion, arm by arm', ''];
  lines.push('| arm | beats `nearest-car` on | loses on | criterion | note |');
  lines.push('|---|---|---|---|---|');
  for (const outcome of outcomes) {
    const better = outcome.betterOn
      .map((entry) => `${entry.caseId} (${entry.metrics.join(', ')})`)
      .join('; ');
    const worse = outcome.worseOn
      .map((entry) => `${entry.caseId} (${entry.metrics.join(', ')})`)
      .join('; ');
    lines.push(
      `| \`${outcome.armId}\` | ${better || '—'} | ${worse || '—'} | ` +
        `${outcome.meetsCriterion ? '**MET**' : '**NOT MET**'} | ` +
        `${outcome.identicalToOther ? 'bit-identical to another arm on every case — what it beats the baseline with is not its own mechanism' : ''} |`,
    );
  }
  const met = outcomes.filter((outcome) => outcome.meetsCriterion).length;
  lines.push('');
  lines.push(`${met} of ${outcomes.length} arms meet the criterion as literally written.`);
  return lines.join('\n');
}

/** A `CellVerdict` in a fixed width, for console output that lines up. */
export function padVerdict(verdict: CellVerdict): string {
  return verdict.padEnd(18);
}
