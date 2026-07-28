/**
 * The printed tuning page — the last place a search result can be misread, and the place a search
 * result is *most* likely to be misread, because it arrives with a winner already attached.
 *
 * ```
 * Round 4 — predictive-balanced neighbourhood, Garden Apartments
 * 95% confidence. Objectives are reported as a Pareto front over AWT, Energy (proxy), WT95 and
 * are never scalarized …
 *
 * SEED SETS
 *   tuning            tune-a · 12 replications
 *   holdout           hold-b · 12 replications
 *   split             DISJOINT — no seed appears in both sets
 *
 * PARETO FRONT · basis: paired-t intervals on differences · 2 of 4 non-dominated
 *   ON FRONT   c-lo
 *     AWT (mean wait) 15.204 s · 95% CI [14.88, 15.53] · ±0.33 · n=12 · t(11)
 *     Energy (proxy)  suppressed — no replication produced a value for Energy (proxy)
 *   …
 *
 * INDISTINGUISHABLE — reported, not ranked
 *   c-lo ~ c-mid
 *     AWT (mean wait) difference +0.021 s · 95% CI [−0.104, +0.146] · noise floor ±0.125 s …
 * ```
 *
 * The illustration above is a 12-replication page, so its intervals are `t(11)` and are unchanged
 * by the 2026-07 switch of published intervals to Student-t at every `n` (review finding #14):
 * `n <= 25` was always `t`. Re-measured, not assumed — T2-BLAST-RADIUS.md § 4c.
 *
 * ## What this formatter refuses to print
 *
 * - **A bare mean.** Every value goes through `reports/format.ts`'s {@link formatMeanEstimate},
 *   which prints the bounds, the half-width, `n` and the quantile family, or through an explicit
 *   `suppressed` / `NOT COMPARABLE`. There is no third path, and `format.test.ts` walks every line
 *   of a rendered page to prove it — because a mean alone is the form in which noise gets published
 *   as a finding.
 * - **A winner the intervals do not support.** `NO SINGLE WINNER` is printed in capitals with the
 *   whole leading group beside it. A search hands over an arg-min; this page will only call it a
 *   winner when it beats *every* rival with an interval excluding zero.
 * - **A scalar score.** There is no "overall" column and no weighted total anywhere on the page. The
 *   front is printed as a set.
 * - **A sorted table.** Candidates print in the order supplied, on the front and off it. Sorting a
 *   set of mutually non-dominated points by one of its axes is a rank order wearing a table's
 *   clothes.
 * - **A holdout number without its tuning number.** The two are always on the same line, in that
 *   order, so the shrinkage is visible without arithmetic.
 *
 * Deterministic byte-for-byte from the report value alone: no clock, no locale, no environment
 * (CLAUDE.md invariant 3's spirit, applied one layer out). A regression test can diff the whole
 * page, which is the cheapest way to notice a verdict changed.
 */

import {
  SUPPRESSED_LABEL,
  formatCandidateReport,
  formatMeanEstimate,
  formatNumber,
  formatSigned,
} from '../../reports/format.js';
import type { CandidateReport, MeanEstimate, MetricEstimate } from '../../reports/types.js';
import type {
  CandidateSummary,
  HoldoutAssessment,
  IndistinguishablePair,
  ObjectiveComparison,
  ObjectiveWinner,
  ParetoFront,
  SeedSetAccounting,
  TuningReport,
} from './types.js';

/* -------------------------------------------------------------------------- *
 * Layout
 * -------------------------------------------------------------------------- */

/** Matched to `reports/format.ts` so a candidate block imported from there stays in column. */
const LINE_WIDTH = 96;
const LABEL_WIDTH = 26;
const INDENT = '  ';
const PART = ' · ';

/** Printed where a comparison exists but may not be quoted. Greppable, never an empty cell. */
export const NOT_COMPARABLE_LABEL = 'NOT COMPARABLE';

/* -------------------------------------------------------------------------- *
 * Pieces
 * -------------------------------------------------------------------------- */

/**
 * One objective of one candidate: an interval, or an explicit refusal.
 *
 * Delegates to Phase 3's `MetricEstimate` rendering rather than re-deriving one, so a suppressed
 * energy axis prints the same words here as it does in a Phase 3 comparison report.
 */
export function formatObjectiveEstimate(metric: MetricEstimate): string {
  if (metric.suppressed || metric.estimate === undefined) {
    return field(metric.label, `${SUPPRESSED_LABEL} — ${metric.suppressedReason ?? 'no reason recorded'}`);
  }
  return field(metric.label, formatMeanEstimate(metric.estimate, metric.precision, metric.unit));
}

/**
 * One paired objective comparison: the verdict first, in capitals, before any number.
 *
 * The ordering is the design. A reader who stops after four words has read the conclusion the
 * statistics support rather than a difference they will interpret for themselves — and in this phase
 * the difference is very often inside the noise floor, which is exactly the case where a reader's own
 * interpretation goes wrong.
 */
export function formatObjectiveComparison(comparison: ObjectiveComparison): string {
  const unit = comparison.unit === '' ? '' : ` ${comparison.unit}`;

  if (comparison.estimate === undefined) {
    return [
      field(comparison.label, `${NOT_COMPARABLE_LABEL} (${comparison.verdict})`),
      continuation(comparison.reason ?? 'the comparison is not statistically supportable'),
    ].join('\n');
  }

  const level = `${(comparison.estimate.confidence * 100).toFixed(0)}%`;
  const difference = `difference ${formatSigned(comparison.meanDifference, comparison.precision)}${unit}`;
  const bounds = `${level} CI [${formatSigned(comparison.estimate.lower, comparison.precision)}, ${formatSigned(comparison.estimate.upper, comparison.precision)}]`;
  const floor = `noise floor ±${formatNumber(comparison.noiseFloor, comparison.precision)}${unit}`;
  const pairs = `n=${comparison.pairs} paired`;

  const head =
    comparison.verdict === 'BETTER'
      ? `${comparison.candidateId} is BETTER than ${comparison.referenceId}`
      : comparison.verdict === 'WORSE'
        ? `${comparison.candidateId} is WORSE than ${comparison.referenceId}`
        : comparison.verdict;

  const parts = [head, difference, bounds, floor, pairs];
  if (comparison.exactZeroPairs > 0) {
    parts.push(`${comparison.exactZeroPairs}/${comparison.pairs} differences exactly zero`);
  }
  const required = formatRequiredReplications(comparison.requiredReplications, comparison.pairs);
  if (required !== undefined) parts.push(required);
  if (Number.isFinite(comparison.correlation)) {
    parts.push(`rho=${formatNumber(comparison.correlation, 3)}`);
  }

  const lines = [field(comparison.label, parts.join(PART))];
  if (comparison.reason !== undefined) lines.push(continuation(comparison.reason));
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * Sections
 * -------------------------------------------------------------------------- */

/** The two seed sets and, in capitals, whether the split is real. */
export function formatSeedSets(accounting: SeedSetAccounting): string {
  const lines = ['SEED SETS'];
  lines.push(
    field(
      'tuning',
      `${accounting.tuning.seedSetId}${PART}${accounting.tuning.replications} replication${accounting.tuning.replications === 1 ? '' : 's'}`,
    ),
  );
  if (accounting.holdout === undefined) {
    lines.push(
      field(
        'holdout',
        'NONE — the tuning-set numbers below are not validated against traffic the search never saw',
      ),
    );
    return lines.join('\n');
  }
  lines.push(
    field(
      'holdout',
      `${accounting.holdout.seedSetId}${PART}${accounting.holdout.replications} replication${accounting.holdout.replications === 1 ? '' : 's'}`,
    ),
  );
  lines.push(
    field(
      'split',
      accounting.disjoint
        ? 'DISJOINT — no seed appears in both sets, so the holdout set is genuinely unseen traffic'
        : `NOT DISJOINT — ${accounting.sharedSeeds.length} seed${accounting.sharedSeeds.length === 1 ? '' : 's'} appear in both sets, so every generalization verdict below is void`,
    ),
  );
  return lines.join('\n');
}

/**
 * The front, as a set.
 *
 * Each member's objective values are printed as intervals from its own candidate report, and each
 * exclusion names the candidates that dominate it, so a reader can check the exclusion rather than
 * take it.
 */
export function formatParetoFront(
  front: ParetoFront,
  summaries: ReadonlyMap<string, CandidateSummary>,
  role: 'tuning' | 'holdout' = 'tuning',
): string {
  const lines: string[] = [];
  lines.push(
    `PARETO FRONT (${front.activeObjectiveIds.join(', ') || 'no measurable objective'})${PART}${role} seed set${PART}basis: ${
      front.basis === 'paired-interval'
        ? 'paired-t intervals on differences'
        : 'pointwise means (no noise floor)'
    }${PART}${front.front.length} of ${front.entries.length} non-dominated`,
  );
  if (front.inactiveObjectiveIds.length > 0) {
    lines.push(
      field(
        'axes dropped',
        `${front.inactiveObjectiveIds.join(', ')} — no candidate produced a value on this seed set, so the front below is silent about ${front.inactiveObjectiveIds.length === 1 ? 'that axis' : 'those axes'}. That is not evidence they are unaffected.`,
      ),
    );
  }
  lines.push(
    wrap(
      'A candidate is excluded only where another is significantly better on at least one objective and significantly worse on none. Members are printed in the order supplied and are not ranked against each other — the tradeoff between them is the building operator’s decision, not this report’s.',
      INDENT,
      INDENT,
    ),
  );

  for (const entry of front.entries) {
    const status = entry.indeterminate
      ? 'UNPLACEABLE'
      : entry.onFront
        ? 'ON FRONT'
        : 'DOMINATED';
    lines.push(`${INDENT}${status.padEnd(12, ' ')}${entry.candidateId}`);
    if (entry.note !== undefined) lines.push(continuation(entry.note));
    if (!entry.onFront && entry.dominatedBy.length > 0) {
      lines.push(continuation(`dominated by ${entry.dominatedBy.join(', ')}`));
    }
    const summary = summaries.get(entry.candidateId);
    const report = summary === undefined ? undefined : reportFor(summary, role);
    if (report === undefined) continue;
    for (const metric of report.metrics) lines.push(formatObjectiveEstimate(metric));
  }
  return lines.join('\n');
}

/** Every pair the experiment could not separate, stated as such rather than ordered. */
export function formatIndistinguishable(pairs: readonly IndistinguishablePair[]): string {
  if (pairs.length === 0) {
    return [
      'INDISTINGUISHABLE — reported, not ranked',
      wrap(
        'No pair of candidates was inside the noise floor on every objective. Every pair below the front was separated by an interval excluding zero on at least one axis.',
        INDENT,
        INDENT,
      ),
    ].join('\n');
  }

  const lines = ['INDISTINGUISHABLE — reported, not ranked'];
  lines.push(
    wrap(
      'These pairs differ by less than the confidence-interval half-width on every objective, so no rank order between them is supportable. IDENTICAL marks pairs whose every paired difference was exactly zero: bit-identical runs, a plateau in the objective surface, and no replication budget resolves them.',
      INDENT,
      INDENT,
    ),
  );
  for (const pair of pairs) {
    lines.push(
      `${INDENT}${pair.a} ~ ${pair.b}${pair.identical ? `${PART}IDENTICAL — bit-identical runs` : ''}`,
    );
    for (const comparison of pair.objectives) lines.push(formatObjectiveComparison(comparison));
  }
  return lines.join('\n');
}

/** The best candidate per objective, or the leading group where there is no single best. */
export function formatWinners(winners: readonly ObjectiveWinner[]): string {
  const lines = ['BEST BY OBJECTIVE'];
  for (const winner of winners) {
    const beatenBy = winner.beatenBy ?? [];
    const value =
      winner.estimate === undefined
        ? `${SUPPRESSED_LABEL} — ${winner.reason}`
        : winner.winnerId === undefined
          ? `NO SINGLE WINNER${PART}${winner.leaderId ?? 'no leader'} leads at ${formatMeanEstimate(winner.estimate, winner.precision, winner.unit)}${
              beatenBy.length === 0
                ? ''
                : `${PART}BEATEN on shared seeds by ${beatenBy.join(', ')}`
            }`
          : `${winner.winnerId}${PART}${formatMeanEstimate(winner.estimate, winner.precision, winner.unit)}`;
    lines.push(field(winner.label, value));
    lines.push(continuation(winner.reason));
  }
  return lines.join('\n');
}

/**
 * Tuning-set and holdout-set performance, side by side, one line per candidate per objective.
 *
 * docs/05-roadmap.md § Phase 7 acceptance is a claim about **held-out seeds**, so the holdout
 * number is the one that answers it, and the tuning number is printed beside it so the shrinkage is
 * visible without arithmetic.
 */
export function formatHoldout(assessments: readonly HoldoutAssessment[]): string {
  const lines = ['HOLDOUT — tuning seeds against held-out seeds'];
  if (assessments.length === 0) {
    lines.push(
      wrap(
        'No holdout assessment was produced: there were no candidates, or no candidate carried holdout replications.',
        INDENT,
        INDENT,
      ),
    );
    return lines.join('\n');
  }
  lines.push(
    wrap(
      'Both sets are compared against the same reference under common random numbers within each set; nothing is paired across the split, because the sets share no seeds. "shrinkage" is the Welch interval on tuning gain minus holdout gain — positive means the gain was smaller on traffic the search never saw.',
      INDENT,
      INDENT,
    ),
  );

  for (const assessment of assessments) {
    const unit = assessment.unit === '' ? '' : ` ${assessment.unit}`;
    const parts: string[] = [assessment.verdict.toUpperCase()];
    parts.push(`tuning ${intervalOf(assessment.tuning, assessment.precision, unit)}`);
    parts.push(
      assessment.holdout === undefined
        ? `holdout ${NOT_COMPARABLE_LABEL}`
        : `holdout ${intervalOf(assessment.holdout, assessment.precision, unit)}`,
    );
    if (assessment.shrinkage !== undefined) {
      parts.push(
        Number.isFinite(assessment.shrinkage.halfWidth)
          ? `shrinkage ${signedInterval(assessment.shrinkage, assessment.precision, unit)}`
          : 'shrinkage not measurable — one of the two gains has no spread to form an interval from',
      );
    }
    if (Number.isFinite(assessment.retainedFraction)) {
      parts.push(`retained ${(assessment.retainedFraction * 100).toFixed(0)}%`);
    }
    lines.push(field(`${assessment.candidateId} · ${assessment.label}`, parts.join(PART)));
    lines.push(continuation(assessment.reason));
  }
  return lines.join('\n');
}

/* -------------------------------------------------------------------------- *
 * The page
 * -------------------------------------------------------------------------- */

/** The whole report, deterministic byte-for-byte from the report value alone. */
export function formatTuningReport(report: TuningReport): string {
  const sections: string[] = [];
  const level = `${(report.confidence * 100).toFixed(0)}%`;

  sections.push(
    [
      report.title,
      wrap(
        `${level} confidence. Objectives (${report.objectiveIds.join(', ')}) are reported as a Pareto front and are never combined into a score: reducing energy generally costs waiting time, and that tradeoff is the building operator's decision. Comparisons are paired-t intervals on per-replication differences over shared seeds; a candidate is ranked only where the interval excludes zero.`,
        '',
      ),
    ].join('\n'),
  );

  sections.push(formatSeedSets(report.seedSets));

  const summaries = new Map<string, CandidateSummary>();
  for (const summary of [report.reference, ...report.candidates]) {
    summaries.set(summary.candidateId, summary);
  }

  sections.push(formatCandidateSummary(report.reference, 'REFERENCE'));
  for (const candidate of report.candidates) {
    sections.push(formatCandidateSummary(candidate, 'CANDIDATE'));
  }

  sections.push(formatParetoFront(report.front, summaries, 'tuning'));
  if (report.holdoutFront !== undefined) {
    sections.push(formatParetoFront(report.holdoutFront, summaries, 'holdout'));
  }
  sections.push(formatIndistinguishable(report.front.indistinguishablePairs));
  sections.push(formatWinners(report.winners));

  for (const comparison of report.comparisons) {
    const lines = [
      `${comparison.candidateId} vs ${comparison.referenceId} — tuning seed set`,
      ...comparison.tuning.map(formatObjectiveComparison),
    ];
    if (comparison.holdout !== undefined) {
      lines.push(`${comparison.candidateId} vs ${comparison.referenceId} — holdout seed set`);
      lines.push(...comparison.holdout.map(formatObjectiveComparison));
    }
    sections.push(lines.join('\n'));
  }

  sections.push(formatHoldout(report.holdout));

  if (report.notes.length > 0) {
    sections.push(
      ['NOTES', ...report.notes.map((note) => wrap(note, '    ', `${INDENT}- `))].join('\n'),
    );
  }

  sections.push(['CONCLUSION', wrap(conclusionOf(report), INDENT)].join('\n'));

  return `${sections.join('\n\n')}\n`;
}

/**
 * The bottom line, in the shapes it is allowed to take.
 *
 * The acceptance criterion for this phase is a claim about **held-out seeds**, so that is what the
 * conclusion answers. "Nothing generalized", "nothing could be distinguished" and "no holdout set
 * was run" are three different findings, and a page that rendered them with one sentence would have
 * thrown away the two actionable ones.
 */
function conclusionOf(report: TuningReport): string {
  const level = `${(report.confidence * 100).toFixed(0)}% confidence`;
  const parts: string[] = [];

  if (report.candidates.length === 0) {
    return `No candidate was compared against ${report.reference.candidateId}.`;
  }

  const generalizing = [
    ...new Set(
      report.holdout
        .filter((assessment) => assessment.verdict === 'generalizes' || assessment.verdict === 'degraded')
        .map((assessment) => assessment.candidateId),
    ),
  ];

  /*
   * "A holdout set exists" and "a candidate was measured on it against the reference" are different
   * facts, and a page may have the first without the second: a paired comparison needs both arms on
   * the same seeds, so a reference with no holdout replications leaves every candidate unvalidated
   * however many of them ran one. Reporting the second as though it followed from the first would
   * put a generalization sentence on a page where nothing was generalized.
   */
  const measuredOnHoldout = report.holdout.some((assessment) => assessment.holdout !== undefined);

  if (report.seedSets.holdout === undefined) {
    parts.push(
      `No holdout set was run, so nothing on this page meets the Phase 7 acceptance criterion, which is a claim about held-out seeds. ${report.front.front.length} of ${report.front.entries.length} candidates are non-dominated on the tuning seeds alone.`,
    );
  } else if (!report.seedSets.disjoint) {
    parts.push(
      `The holdout set shares ${report.seedSets.sharedSeeds.length} seed(s) with the tuning set, so it validates nothing. No conclusion about generalization can be drawn from this page.`,
    );
  } else if (!measuredOnHoldout) {
    parts.push(
      `A holdout set was run, but no candidate could be compared against ${report.reference.candidateId} on it — a paired comparison needs both arms on the same seeds. Nothing on this page meets the Phase 7 acceptance criterion, which is a claim about held-out seeds.`,
    );
  } else if (generalizing.length === 0) {
    parts.push(
      `No candidate's tuning-set improvement reproduced on held-out seeds at ${level}. The Phase 7 acceptance criterion is not met by anything on this page — which is a result, and a more useful one than a winner that would not have survived new traffic.`,
    );
  } else {
    parts.push(
      `${generalizing.length} candidate${generalizing.length === 1 ? '' : 's'} improved on ${report.reference.candidateId} on held-out seeds with a paired interval excluding zero at ${level}: ${generalizing.join(', ')}.`,
    );
  }

  if (report.flaggedOverfitting.length > 0) {
    parts.push(
      `${report.flaggedOverfitting.length} candidate${report.flaggedOverfitting.length === 1 ? '' : 's'} lost a measurable part of the tuning-set gain on held-out seeds (${report.flaggedOverfitting.join(', ')}); read the tuning-set number for those as an upper bound, not an estimate.`,
    );
  }
  if (report.unconfirmed.length > 0) {
    parts.push(
      `${report.unconfirmed.length} could not be confirmed either way on the holdout set (${report.unconfirmed.join(', ')}) — the holdout replication count, not the dispatcher, is what is limiting there.`,
    );
  }
  if (report.front.indistinguishablePairs.length > 0) {
    parts.push(
      `${report.front.indistinguishablePairs.length} pair${report.front.indistinguishablePairs.length === 1 ? ' is' : 's are'} indistinguishable on every objective and are deliberately left unranked.`,
    );
  }
  parts.push('The front is reported as a set; no objective weighting is applied anywhere above.');
  return parts.join(' ');
}

/* -------------------------------------------------------------------------- *
 * Internals
 * -------------------------------------------------------------------------- */

function reportFor(
  summary: CandidateSummary,
  role: 'tuning' | 'holdout',
): CandidateReport | undefined {
  return role === 'tuning' ? summary.tuning : summary.holdout;
}

/**
 * One candidate: its parameter vector, then its own intervals on each seed set it has runs for.
 *
 * The parameter vector is printed with keys sorted, because a search's iteration order is an
 * implementation detail and two renderings of the same candidate must diff to nothing.
 */
function formatCandidateSummary(summary: CandidateSummary, role: string): string {
  const lines: string[] = [formatCandidateReport(summary.tuning, { role: `${role} · tuning` })];
  if (summary.parameters !== undefined) {
    const entries = Object.entries(summary.parameters)
      .map(([key, value]) => `${key}=${String(value)}`)
      .sort();
    lines.push(field('parameters', entries.length === 0 ? '(none recorded)' : entries.join(', ')));
  }
  if (summary.holdout !== undefined) {
    lines.push(formatCandidateReport(summary.holdout, { role: `${role} · holdout` }));
  }
  return lines.join('\n');
}

/**
 * How many replications the observed effect would need — where that number means anything.
 *
 * Above {@link UNRESOLVABLE_REPLICATIONS} it does not. When the point estimate is floating-point
 * residue around zero — which is exactly what a plateau or a genuinely null difference produces —
 * `n >= (z·s/|d|)²` is a number like `1.2e29`, and printing it invites a reader to imagine a budget
 * that would settle the question. There is no such budget: the effect is not small, it is absent.
 */
const UNRESOLVABLE_REPLICATIONS = 1e6;

function formatRequiredReplications(
  required: number | undefined,
  pairs: number,
): string | undefined {
  if (required === undefined || required <= pairs) return undefined;
  if (required > UNRESOLVABLE_REPLICATIONS) {
    return 'no affordable budget resolves this — the point estimate is indistinguishable from exactly zero';
  }
  return `would need n≈${required.toFixed(0)}`;
}

/** `−1.400 s · 95% CI [−1.62, −1.18]`, or an explicit refusal. Never a bare mean. */
function intervalOf(comparison: ObjectiveComparison, precision: number, unit: string): string {
  if (comparison.estimate === undefined) return `${NOT_COMPARABLE_LABEL} (${comparison.verdict})`;
  const level = `${(comparison.estimate.confidence * 100).toFixed(0)}%`;
  return `${formatSigned(comparison.meanDifference, precision)}${unit}${PART}${level} CI [${formatSigned(comparison.estimate.lower, precision)}, ${formatSigned(comparison.estimate.upper, precision)}]`;
}

function signedInterval(estimate: MeanEstimate, precision: number, unit: string): string {
  const level = `${(estimate.confidence * 100).toFixed(0)}%`;
  return `${formatSigned(estimate.mean, precision)}${unit}${PART}${level} CI [${formatSigned(estimate.lower, precision)}, ${formatSigned(estimate.upper, precision)}]`;
}

/** `  label            value`, with the value wrapped and hanging-indented under itself. */
function field(label: string, value: string): string {
  const padded = label.length >= LABEL_WIDTH ? `${label} ` : label.padEnd(LABEL_WIDTH, ' ');
  const head = `${INDENT}${padded}`;
  return wrap(value, ' '.repeat(head.length), head);
}

/** A wrapped continuation line under a field's value column. */
function continuation(text: string): string {
  const indent = ' '.repeat(INDENT.length + LABEL_WIDTH);
  return wrap(text, indent, indent);
}

/**
 * Greedy word wrap with a hanging indent.
 *
 * Hand-rolled because the alternative is a dependency, and this package may take none beyond `core`.
 */
function wrap(text: string, indent: string, firstPrefix = indent): string {
  const width = Math.max(LINE_WIDTH - indent.length, 24);
  const words = text.split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return firstPrefix.trimEnd();

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current === '') current = word;
    else if (`${current} ${word}`.length <= width) current = `${current} ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);

  return lines.map((line, index) => `${index === 0 ? firstPrefix : indent}${line}`).join('\n');
}
