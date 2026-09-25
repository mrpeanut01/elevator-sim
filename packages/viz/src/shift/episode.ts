/**
 * **A day's wrinkle as an episode inside the day** — [§ D1057](../../../../DECISIONS.md), the week
 * swarm's ruling (S1 + S3, 2–1; S2's condition kept).
 *
 * ## The defect
 *
 * On a whole authored day (`office-day`, 08:00–18:00, the day thirteen contracts run in Scenario)
 * `core` refuses a run-wide `directionalSplit` beside a template that varies its own mix, so a
 * wrinkle's mix was withheld, and its run-wide `arrivalRateMultiplier`, authored for a thirty-minute
 * slice where the slice roughly *is* the event, multiplied ten hours. Measured by the swarm on
 * Midtown: the conference was bit-identical to no wrinkle on 65 of 65 configurations, and the fire
 * drill carried 5 132 journeys against Tuesday's 2 844 and cleared 0 of 65 on every tower. A
 * different day wearing the name, and § D1040's sentence said so.
 *
 * ## What this does
 *
 * {@link spliceEpisode} writes the wrinkle **into the run's own copy of the day's phase list**: its
 * clock window, its mix, and its level (a phase intensity, or the day's own), with a 60-second ramp
 * at each edge because `core`'s rule 6 refuses an undeclared step and `evening-egress` is the
 * precedent for expressing one as a short ramp. Outside `[from − ramp, to + ramp]` every knot is the
 * day's own, value for value. No run-wide multiplier is written; a placement may state a lighter
 * whole day (`dayRateMultiplier ≤ 1`), which `shift/events.ts#shiftRunPatch` applies to the rate.
 *
 * `core` is untouched and its refusal in `planDemand` stands: the mix is the template's, which is
 * the one place `core` accepts it. The derived record keeps the day's id, so `wholeDayFor`,
 * `runsWholeDay` and the report window keep resolving, on `authoring/patternSpec.ts`'s precedent
 * for widening the run's own `trafficProfiles` rather than the shipped file.
 *
 * Pure: reads no clock, draws nothing, and returns fresh objects. A refusal is a value with its
 * reason, never a throw, because the caller's honest answer to *this day cannot hold that episode*
 * is to not draw it there (S2's condition) or to keep § D1040's sentence.
 */

import type {
  DemandPhaseRecord,
  DemandTemplate,
  DirectionalSplit,
  TrafficProfiles,
} from '@elevator-sim/core/browser';

import type { WholeDayEpisode } from '../wrinkles/types.js';

/**
 * The ramp at each edge of an episode, in minutes. `core`'s rule 6 and `evening-egress`'s 60 s
 * step, which is the file's own precedent for a step expressed as a ramp.
 */
export const EPISODE_RAMP_MIN = 1;

/** The part of a placement the splice reads: when, and how busy. */
export type EpisodeWindow = Pick<WholeDayEpisode, 'fromMin' | 'toMin' | 'intensity'>;

/** A spliced day: the derived record, and where the episode sits on the run's own clock. */
export interface SplicedDay {
  readonly kind: 'spliced';
  readonly record: DemandTemplate;
  /** Seconds after the run's start at which the episode's own mix begins and ends. */
  readonly startS: number;
  readonly endS: number;
}

/** Why a day cannot hold an episode. */
export interface SpliceRefusal {
  readonly kind: 'refused';
  readonly reason: string;
}

interface Knot {
  readonly intensity: number;
  readonly split: DirectionalSplit;
}

/**
 * The day's own value at `t` minutes, **exactly** a phase's authored endpoint when `t` is one, so a
 * cut at a knot reproduces the knot's value bit for bit (`core` compares boundaries with `===`).
 */
function knotAt(phases: readonly DemandPhaseRecord[], t: number): Knot {
  for (const phase of phases) {
    if (t < phase.startMin || t > phase.endMin) continue;
    const startSplit = phase.startSplit as DirectionalSplit;
    const endSplit = phase.endSplit as DirectionalSplit;
    if (t === phase.startMin) return { intensity: phase.startIntensity, split: startSplit };
    if (t === phase.endMin) return { intensity: phase.endIntensity, split: endSplit };
    const f = (t - phase.startMin) / (phase.endMin - phase.startMin);
    const lerp = (a: number, b: number): number => a + (b - a) * f;
    return {
      intensity: lerp(phase.startIntensity, phase.endIntensity),
      split: {
        incoming: lerp(startSplit.incoming, endSplit.incoming),
        outgoing: lerp(startSplit.outgoing, endSplit.outgoing),
        interfloor: lerp(startSplit.interfloor, endSplit.interfloor),
      },
    };
  }
  throw new Error(`episode: ${String(t)} is outside every phase`);
}

function segment(
  startMin: number,
  endMin: number,
  from: Knot,
  to: Knot,
  comment?: string,
): DemandPhaseRecord {
  return {
    startMin,
    endMin,
    startIntensity: from.intensity,
    endIntensity: to.intensity,
    startSplit: from.split,
    endSplit: to.split,
    ...(comment === undefined ? {} : { $comment: comment }),
  };
}

/**
 * The day's own phases over `[x, y]`, cut at both ends, with the knots at `x` and `y` taken from
 * `atX` and `atY` so the segments either side of the cut share the same values.
 */
function baseBetween(
  phases: readonly DemandPhaseRecord[],
  x: number,
  y: number,
  atX: Knot,
  atY: Knot,
  splitOverride?: DirectionalSplit,
): DemandPhaseRecord[] {
  const out: DemandPhaseRecord[] = [];
  const cuts = [x, ...phases.map((p) => p.endMin).filter((t) => t > x && t < y), y];
  for (let i = 1; i < cuts.length; i += 1) {
    const a = cuts[i - 1] as number;
    const b = cuts[i] as number;
    const from = i === 1 ? atX : knotAt(phases, a);
    const to = i === cuts.length - 1 ? atY : knotAt(phases, b);
    out.push(
      segment(
        a,
        b,
        splitOverride === undefined ? from : { intensity: from.intensity, split: splitOverride },
        splitOverride === undefined ? to : { intensity: to.intensity, split: splitOverride },
      ),
    );
  }
  /*
   * Interior knots are shared by construction only if `knotAt` answered the same object for both
   * neighbours; re-thread each segment's start from the one before so the equality is exact.
   */
  for (let i = 1; i < out.length; i += 1) {
    const before = out[i - 1] as DemandPhaseRecord;
    const here = out[i] as DemandPhaseRecord;
    out[i] = { ...here, startIntensity: before.endIntensity, startSplit: before.endSplit };
  }
  return out;
}

/**
 * **The day with the episode written into it**, or why it cannot be.
 *
 * `placement` is in clock minutes since midnight; `split` is the wrinkle's own mix. Refused when the
 * record is not a day (no phases, no clock, or a phase with no mix — `core`'s rule 7 makes that all
 * or none), when the window falls outside the day's clock, or when there is no room for a ramp
 * between the window and either end of the day. A window that starts at the day's opening or ends
 * at its close needs no ramp on that side: nothing precedes the first knot and nothing follows the
 * last.
 */
export function spliceEpisode(
  record: DemandTemplate,
  placement: EpisodeWindow,
  split: DirectionalSplit,
  label: string,
): SplicedDay | SpliceRefusal {
  const phases = record.phases;
  if (phases === undefined || phases.length === 0) {
    return { kind: 'refused', reason: `${record.id} is not authored as a phase list, so it has no day to splice into.` };
  }
  if (record.startOfDayMin === undefined) {
    return { kind: 'refused', reason: `${record.id} has no clock, so a clock window names no part of it.` };
  }
  if (phases.some((phase) => phase.startSplit === undefined || phase.endSplit === undefined)) {
    return { kind: 'refused', reason: `${record.id} declares no mix of its own, so an episode's mix has nothing to replace.` };
  }
  const duration = record.durationMin;
  const a = placement.fromMin - record.startOfDayMin;
  const b = placement.toMin - record.startOfDayMin;
  if (!(a >= 0 && b <= duration && a < b)) {
    return {
      kind: 'refused',
      reason: `the episode's window lies outside ${record.id}'s clock, so the day cannot hold it.`,
    };
  }
  const leadRamp = a > 0;
  const tailRamp = b < duration;
  if ((leadRamp && a < EPISODE_RAMP_MIN) || (tailRamp && b + EPISODE_RAMP_MIN > duration)) {
    return {
      kind: 'refused',
      reason: `the episode sits too close to an end of ${record.id} for its ramp.`,
    };
  }

  const lead = leadRamp ? a - EPISODE_RAMP_MIN : 0;
  const tail = tailRamp ? b + EPISODE_RAMP_MIN : duration;
  const atLead = knotAt(phases, lead);
  const atTail = knotAt(phases, tail);
  const episodeAt = (t: number): Knot => ({
    intensity: placement.intensity === 'authored' ? knotAt(phases, t).intensity : placement.intensity,
    split,
  });
  const atA = episodeAt(a);
  const atB = episodeAt(b);

  const out: DemandPhaseRecord[] = [];
  if (lead > 0) out.push(...baseBetween(phases, 0, lead, knotAt(phases, 0), atLead));
  if (leadRamp) out.push(segment(lead, a, atLead, atA, `ramp into ${label}`));
  if (placement.intensity === 'authored') {
    const inside = baseBetween(phases, a, b, atA, atB, split);
    out.push(...inside.map((phase) => ({ ...phase, $comment: label })));
  } else {
    out.push(segment(a, b, atA, atB, label));
  }
  if (tailRamp) out.push(segment(b, tail, atB, atTail, `ramp out of ${label}`));
  if (tail < duration) out.push(...baseBetween(phases, tail, duration, atTail, knotAt(phases, duration)));

  /* Thread every boundary through the segment before it, so `core`'s `===` holds everywhere. */
  for (let i = 1; i < out.length; i += 1) {
    const before = out[i - 1] as DemandPhaseRecord;
    const here = out[i] as DemandPhaseRecord;
    out[i] = { ...here, startIntensity: before.endIntensity, startSplit: before.endSplit };
  }

  return {
    kind: 'spliced',
    record: {
      ...record,
      $comment:
        `The shipped ${record.id} with ${label} spliced in by shift/episode.ts (DECISIONS.md ` +
        `section D1057): the phases outside the episode and its two one-minute ramps are the ` +
        `shipped record's own. ${record.$comment ?? ''}`,
      phases: out,
    },
    startS: a * 60,
    endS: b * 60,
  };
}

/**
 * The run's own `trafficProfiles` with `templateId`'s record replaced by `record` — the same id, so
 * everything keyed on it keeps resolving. `authoring/patternSpec.ts#trafficProfilesWithPattern`'s
 * precedent: the run widens its own copy of the file and never the shipped one.
 */
export function trafficProfilesWithRecord(
  profiles: TrafficProfiles,
  record: DemandTemplate,
): TrafficProfiles {
  return {
    ...profiles,
    demandTemplates: profiles.demandTemplates.map((entry) => (entry.id === record.id ? record : entry)),
  };
}
