/**
 * The rules a **authored phase list** has to keep, in one place, for both the schema and the
 * resolver. `DECISIONS.md` § D273.
 *
 * ## Why this exists at all
 *
 * `traffic/demandTemplate.ts` builds five shapes in code and defends that at the top of the file:
 * *"Shape is code, numbers are data. A ramp is a ramp."* That is right for a ramp and wrong for a
 * **schedule**. A day is not a shape; it is a *sequence* of them, and a sixth `if (record.id === …)`
 * per day profile is exactly the `if (phase === 'evening')` CLAUDE.md invariant 7 forbids. So a
 * record may instead author its phases outright, and the evaluator — which is already piecewise
 * linear over one knot list, and already ships a six-phase template with two interior peaks — needs
 * nothing new to run one.
 *
 * What it does need is the validation the five shape builders previously supplied **by
 * construction**. `riseAndFallTemplate` cannot emit a gap, an overlap, a descending pair or a run
 * that stops before its own `durationS`, because it computes every knot from two numbers. An
 * authored list can do all four, and every one of them is silent: {@link intensityAt} returns `0`
 * outside every phase, so a gap is a stretch of the day in which nobody arrives and nothing says so.
 *
 * ## The rules, and which failure each one is protecting against
 *
 * 1. **At least one phase.** An empty list is a template that generates nothing.
 * 2. **Every segment has positive span.** A zero-length phase is a discontinuity the evaluator
 *    resolves by `if (span <= 0) return phase.endIntensity`, which is a rule nobody authored.
 * 3. **Intensities in `[0, 1]`.** The multiplier's documented range; `1` is the profile's nominal
 *    rate, and a template cannot raise the building's rate — that is what `demandLevel` and
 *    `arrivalRatePctPop5min` are for.
 * 4. **The first phase starts at 0 and the last ends at `duration`.** Exact coverage. A list that
 *    stops early leaves a silent dead stretch; one that overruns describes demand outside the run,
 *    and `intensityAt` clamps it away without comment.
 * 5. **Contiguous and ascending.** `phases[i].start === phases[i-1].end`, exactly. A gap is silent
 *    for the reason above; an overlap is worse, because `intensityAt` returns the *first* matching
 *    phase and the second one is simply not there.
 * 6. **No undeclared step.** `phases[i].startIntensity === phases[i-1].endIntensity`, and the same
 *    for the mix. A step *is* expressible — `intensityAt` resolves a shared boundary in favour of
 *    the earlier phase, so the value before the step wins — but which side wins is an accident of
 *    iteration order rather than something an author chose. This repository already has a template
 *    whose defining feature is a step, and `evening-egress` expresses it as a **60-second ramp**
 *    rather than as a discontinuity. That is the precedent, and it is the fix this rule names.
 * 7. **The mix is declared on every phase or on none.** Both endpoints per phase is the existing
 *    rule (`requireCoherentMix`, and the schema's `directionalSplitAtStart` refinement). All-or-none
 *    across the list is a new one, and it is the sharpest of the seven: `meanSplitOf` **skips**
 *    phases that declare no mix, so a list that declared one on half its phases would still resolve
 *    to a template with a `meanDirectionalSplit` — and `generator.ts`'s `mixScheduleFor` reads
 *    `splitAt(template, t) ?? mean`, so the undeclared stretch would silently run at the *whole
 *    day's average mix* while the screen said the template varied it.
 * 8. **Every declared share is finite and non-negative, and no triple is all-zero.** The same rule
 *    `normalizedSplit` enforces, applied where the author can still be told which phase.
 *
 * ## Unit-agnostic on purpose
 *
 * The record authors minutes (`startMin`, beside `durationMin`) and the resolver works in seconds,
 * so the same seven rules have to hold in two units. They are checked once, here, against a
 * structural view — and `unit` only decides what the field is *called* in the message, so a
 * `data/` author is told `startMin` and a caller who hand-built a resolved template is told `startS`.
 * Conversion is an exact multiply by 60, so a list that passes in one unit passes in the other; the
 * schema still runs it in minutes because that is where a path (`demandTemplates[3].phases[7]`) can
 * be attached to the complaint.
 */

import type { DirectionalSplit } from './types.js';

/** One segment of an authored phase list, in whatever unit the caller is working in. */
export interface DemandPhaseSegment {
  readonly start: number;
  readonly end: number;
  readonly startIntensity: number;
  readonly endIntensity: number;
  readonly startSplit?: DirectionalSplit | undefined;
  readonly endSplit?: DirectionalSplit | undefined;
}

/** A rule a phase list broke, with enough to build either a zod path or a thrown sentence. */
export interface DemandPhaseIssue {
  /** Index into the phase list, or `-1` for a complaint about the list as a whole. */
  readonly index: number;
  /** The field to blame, already spelled in the caller's unit (`startMin` / `startS`). */
  readonly field: string;
  readonly message: string;
}

/** Which spelling of the time fields to use in messages. */
export type DemandPhaseUnit = 'min' | 's';

const SUFFIX: Readonly<Record<DemandPhaseUnit, string>> = { min: 'Min', s: 'S' };

/** Exact equality of three shares — exact, not tolerant: an ulp of mix is an ulp of arrival time. */
function sameSplit(a: DirectionalSplit, b: DirectionalSplit): boolean {
  return a.incoming === b.incoming && a.outgoing === b.outgoing && a.interfloor === b.interfloor;
}

function splitIssues(
  split: DirectionalSplit,
  index: number,
  field: string,
): readonly DemandPhaseIssue[] {
  const issues: DemandPhaseIssue[] = [];
  for (const [name, value] of Object.entries(split)) {
    if (!Number.isFinite(value) || value < 0) {
      issues.push({
        index,
        field,
        message: `${field}.${name} must be non-negative and finite; received ${String(value)}`,
      });
    }
  }
  if (issues.length === 0 && split.incoming + split.outgoing + split.interfloor <= 0) {
    issues.push({
      index,
      field,
      message: `${field} gives every direction a zero share, which is a building nobody travels in rather than a demand pattern`,
    });
  }
  return issues;
}

/**
 * Every rule an authored phase list breaks, in list order. Empty means the list is well formed.
 *
 * Returns rather than throws: `config/schema.ts` turns each issue into a zod issue with a path, and
 * `traffic/demandTemplate.ts` turns the first into a `TrafficError`. One authority, two renderings —
 * the alternative is the shape this repository keeps paying for, where the two places a rule is
 * written disagree and the one nobody is reading is the one that is right.
 */
export function demandPhaseIssues(
  phases: readonly DemandPhaseSegment[],
  duration: number,
  unit: DemandPhaseUnit,
): readonly DemandPhaseIssue[] {
  const suffix = SUFFIX[unit];
  const startKey = `start${suffix}`;
  const endKey = `end${suffix}`;
  const durationKey = `duration${suffix}`;
  const issues: DemandPhaseIssue[] = [];

  if (phases.length === 0) {
    return [
      {
        index: -1,
        field: 'phases',
        message:
          'a phase list must declare at least one phase; an empty one is a template that generates nothing over its whole period',
      },
    ];
  }

  phases.forEach((phase, index) => {
    for (const [key, value] of [
      [startKey, phase.start],
      [endKey, phase.end],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        issues.push({
          index,
          field: key,
          message: `${key} must be a finite, non-negative time; received ${String(value)}`,
        });
      }
    }
    for (const [key, value] of [
      ['startIntensity', phase.startIntensity],
      ['endIntensity', phase.endIntensity],
    ] as const) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        issues.push({
          index,
          field: key,
          message: `${key} must lie in [0, 1]; received ${String(value)}. It is a multiplier on the building's own arrival rate, where 1 is that rate — a period busier than the profile is a higher rate, not an intensity above 1`,
        });
      }
    }
    if (Number.isFinite(phase.start) && Number.isFinite(phase.end) && phase.end <= phase.start) {
      issues.push({
        index,
        field: endKey,
        message: `${endKey} (${String(phase.end)}) must be strictly after ${startKey} (${String(phase.start)}). A zero-length phase is a discontinuity the evaluator resolves by a rule nobody authored; a step is expressed as a short ramp, the way evening-egress expresses its 60 s one`,
      });
    }
    const { startSplit, endSplit } = phase;
    if ((startSplit === undefined) !== (endSplit === undefined)) {
      issues.push({
        index,
        field: startSplit === undefined ? 'startSplit' : 'endSplit',
        message:
          'a phase declares both endpoint mixes or neither. It interpolates between the two, so one alone would give the run an endpoint nobody authored',
      });
    }
    if (startSplit !== undefined) issues.push(...splitIssues(startSplit, index, 'startSplit'));
    if (endSplit !== undefined) issues.push(...splitIssues(endSplit, index, 'endSplit'));
  });

  const first = phases[0];
  if (first !== undefined && first.start !== 0) {
    issues.push({
      index: 0,
      field: startKey,
      message: `the first phase must begin at 0; it begins at ${String(first.start)}, which leaves the opening of the period with no phase to evaluate — and a time no phase covers draws no arrivals at all, silently`,
    });
  }
  const last = phases[phases.length - 1];
  if (last !== undefined && last.end !== duration) {
    issues.push({
      index: phases.length - 1,
      field: endKey,
      message: `the last phase must end exactly at ${durationKey} (${String(duration)}); it ends at ${String(last.end)}. A list that stops early leaves a dead stretch nothing announces, and one that overruns describes demand outside the run that the evaluator clamps away`,
    });
  }

  for (let index = 1; index < phases.length; index += 1) {
    const previous = phases[index - 1];
    const phase = phases[index];
    if (previous === undefined || phase === undefined) continue;
    if (phase.start !== previous.end) {
      issues.push({
        index,
        field: startKey,
        message: `phases are contiguous and ascending: this one begins at ${String(phase.start)} and the one before it ends at ${String(previous.end)}. A gap draws no arrivals and says nothing; an overlap is worse, because the evaluator returns the first phase that matches and the second is simply not there`,
      });
      continue;
    }
    if (phase.startIntensity !== previous.endIntensity) {
      issues.push({
        index,
        field: 'startIntensity',
        message: `an undeclared step: this phase starts at intensity ${String(phase.startIntensity)} where the one before it ended at ${String(previous.endIntensity)}. The evaluator resolves a shared boundary in favour of the earlier phase, so which side of a step wins is iteration order rather than a choice — author the step as a short ramp instead, the way evening-egress authors its 60 s one`,
      });
    }
    const before = previous.endSplit;
    const after = phase.startSplit;
    if (before !== undefined && after !== undefined && !sameSplit(before, after)) {
      issues.push({
        index,
        field: 'startSplit',
        message:
          'an undeclared step in the directional mix: this phase starts at a mix the phase before it did not end at. The mix is piecewise linear over the same knots the intensity is, so the same rule applies — ramp it over a short phase rather than stepping it at a boundary',
      });
    }
  }

  const declaring = phases.filter((phase) => phase.startSplit !== undefined).length;
  if (declaring > 0 && declaring < phases.length) {
    issues.push({
      index: -1,
      field: 'phases',
      message: `the directional mix is declared on every phase or on none; ${String(declaring)} of ${String(phases.length)} declare one. A partial list still resolves to a template with a period mean, and the generator reads that mean wherever a phase declares nothing — so the undeclared stretch would quietly run at the whole period's average mix while the template claimed to vary it`,
    });
  }

  return issues;
}
