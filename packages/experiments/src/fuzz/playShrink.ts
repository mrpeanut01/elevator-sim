/**
 * **Shrinking a verb log to the smallest one that still breaks, and printing it whole.**
 *
 * `shrink.ts`'s rule, on the other axis: a candidate is accepted only if it still violates **a
 * property the original violated**, so a log that breaks P-PLAY-2 cannot wander into an unrelated
 * starvation finding and be reported as the minimal case. Every candidate is re-checked against
 * `verbs.ts#playLogRefusal` before it runs, so a shrunk log is always one the generator could have
 * produced: the same budget, the same serving-car rule, effects at or after their own press.
 *
 * The reductions, in the order they are tried, each deterministic:
 *
 * 1. **the empty log**, which answers first whether the verbs were needed at all;
 * 2. **halves**, then **one entry at a time**;
 * 3. **one service event at a time** out of an effect-carrying entry;
 * 4. **payloads toward the plainest**: a handover to the stage's own opening profile, a purchase of
 *    the cheapest row of its tier;
 * 5. **instants toward zero**: an entry moved to the press before it (or to `0`), its effects moved
 *    with it; an effect moved onto its own press;
 * 6. **the crowd and the purse**: replication 0, the stage's base rung.
 *
 * The greedy loop restarts from the top after every accepted reduction, which is what lets dropping
 * one entry open up dropping the effect that only mattered because of it.
 *
 * A shrunk case does not come back from its play seed; the seed reproduces its unshrunk parent, and
 * {@link formatPlayCase} prints the log in full, because three of the kinds carry service events no
 * wire form rebuilds. The decisions here bind nothing outside `fuzz/` (§ D405).
 */

import {
  isServiceModeEvent,
  isServiceRangeEvent,
  type ResolvedServiceEvent,
  type RunInterventionConfig,
} from '@elevator-sim/core';

import { isPlayFailure, type PlayOutcome, type PlayProperty, type PlaySessions } from './play.js';
import type { FuzzProperty } from './types.js';
import { playLogRefusal, playLogSpend, type PlayCase, type PlayContext } from './verbs.js';

export interface PlayShrinkResult {
  readonly original: PlayOutcome;
  readonly minimal: PlayOutcome;
  readonly steps: number;
  readonly evaluations: number;
}

type Log = readonly RunInterventionConfig[];

/** A size a reader feels: entries, then effects, then how late things happen, then the crowd. */
function sizeOf(playCase: PlayCase, context: PlayContext): number {
  const effects = playCase.log.reduce(
    (sum, entry) => sum + ('serviceEvents' in entry.change ? entry.change.serviceEvents.length : 0),
    0,
  );
  const lateness = playCase.log.reduce((sum, entry) => sum + entry.atS, 0) / Math.max(1, context.stage.durationS);
  const handovers = playCase.log.filter(
    (entry) =>
      (entry.change.kind === 'switch-dispatcher' || entry.change.kind === 'adopt-dispatcher') &&
      entry.change.profile !== context.resources.dispatcherProfile,
  ).length;
  return (
    playCase.log.length * 10_000 +
    effects * 1_000 +
    handovers * 100 +
    lateness * 10 +
    (playCase.replication === 0 ? 0 : 5) +
    (playCase.budgetUnits === context.stage.budgetRungs[0] ? 0 : 2)
  );
}

function withEntry(log: Log, index: number, entry: RunInterventionConfig): Log {
  return log.map((existing, at) => (at === index ? entry : existing));
}

/** Every candidate log one reduction away, in the order the module docstring gives. */
function candidateLogs(log: Log, context: PlayContext): Log[] {
  const out: Log[] = [];
  if (log.length > 0) out.push([]);
  if (log.length >= 4) {
    const half = Math.floor(log.length / 2);
    out.push(log.slice(half), log.slice(0, half));
  }
  for (let i = 0; i < log.length; i += 1) out.push([...log.slice(0, i), ...log.slice(i + 1)]);

  log.forEach((entry, index) => {
    const change = entry.change;
    if (!('serviceEvents' in change)) return;
    change.serviceEvents.forEach((_, drop) => {
      out.push(
        withEntry(log, index, {
          atS: entry.atS,
          change: { ...change, serviceEvents: change.serviceEvents.filter((__, at) => at !== drop) },
        }),
      );
    });
  });

  const opening = context.resources.dispatcherProfile;
  log.forEach((entry, index) => {
    const change = entry.change;
    if (change.kind === 'switch-dispatcher' && change.profile !== opening && context.switchTargets.includes(opening)) {
      out.push(withEntry(log, index, { atS: entry.atS, change: { kind: change.kind, profile: opening } }));
    }
    if (change.kind === 'adopt-dispatcher' && change.profile !== opening && context.adoptTargets.includes(opening)) {
      out.push(withEntry(log, index, { atS: entry.atS, change: { kind: change.kind, profile: opening } }));
    }
    if (change.kind === 'equipment-change' || change.kind === 'building-change') {
      const cheapest = context.purchases
        .filter((row) => row.kind === change.kind)
        .sort((a, b) => a.units - b.units || (a.id < b.id ? -1 : 1))[0];
      if (cheapest !== undefined && cheapest.id !== change.changeId) {
        out.push(
          withEntry(log, index, {
            atS: entry.atS,
            change: { ...change, changeId: cheapest.id, name: cheapest.name },
          }),
        );
      }
    }
  });

  log.forEach((entry, index) => {
    const target = index === 0 ? 0 : (log[index - 1]?.atS ?? 0);
    const change = entry.change;
    if (entry.atS > target) {
      const delta = entry.atS - target;
      const moved: RunInterventionConfig =
        'serviceEvents' in change
          ? {
              atS: target,
              change: {
                ...change,
                serviceEvents: change.serviceEvents.map((effect) => ({ ...effect, atS: effect.atS - delta })),
              },
            }
          : { atS: target, change };
      out.push(withEntry(log, index, moved));
    }
    if ('serviceEvents' in change && change.serviceEvents.some((effect) => effect.atS > entry.atS)) {
      out.push(
        withEntry(log, index, {
          atS: entry.atS,
          change: {
            ...change,
            serviceEvents: change.serviceEvents.map((effect) => ({ ...effect, atS: entry.atS })),
          },
        }),
      );
    }
  });
  return out;
}

function targetOf(outcome: PlayOutcome): { properties: ReadonlySet<PlayProperty | FuzzProperty>; threw: boolean } {
  return {
    properties: new Set(outcome.violations.map((violation) => violation.property)),
    threw: outcome.threw !== undefined,
  };
}

function stillFails(candidate: PlayOutcome, target: ReturnType<typeof targetOf>): boolean {
  if (target.threw && candidate.threw !== undefined) return true;
  return candidate.violations.some((violation) => target.properties.has(violation.property));
}

/**
 * Greedily reduce a failing session until nothing smaller still fails.
 *
 * @param budget candidate evaluations; each is one replication, a few milliseconds on stage 1.
 */
export function shrinkPlayCase(original: PlayOutcome, sessions: PlaySessions, budget = 150): PlayShrinkResult {
  if (!isPlayFailure(original)) return { original, minimal: original, steps: 0, evaluations: 0 };
  const { context } = sessions;
  const target = targetOf(original);
  let best = original;
  let steps = 0;
  let evaluations = 0;

  const attempt = (candidate: PlayCase): boolean => {
    if (playLogRefusal(context, candidate.log, candidate.budgetUnits) !== undefined) return false;
    if (sizeOf(candidate, context) >= sizeOf(best.case, context)) return false;
    evaluations += 1;
    const outcome = sessions.evaluate(candidate);
    if (!stillFails(outcome, target)) return false;
    best = outcome;
    steps += 1;
    return true;
  };

  let improved = true;
  while (improved && evaluations < budget) {
    improved = false;
    const parent = best.case;
    const caseId = `${parent.caseId.replace(/-s\d+$/u, '')}-s${String(steps + 1)}`;
    const candidates: PlayCase[] = candidateLogs(parent.log, context).map((log) => ({ ...parent, caseId, log }));
    if (parent.replication !== 0) candidates.push({ ...parent, caseId, replication: 0 });
    const base = context.stage.budgetRungs[0];
    if (base !== undefined && parent.budgetUnits !== base && playLogSpend(context, parent.log) <= base) {
      candidates.push({ ...parent, caseId, budgetUnits: base });
    }
    for (const candidate of candidates) {
      if (evaluations >= budget) break;
      if (attempt(candidate)) {
        improved = true;
        break;
      }
    }
  }
  return { original, minimal: best, steps, evaluations };
}

/* -------------------------------------------------------------------------- *
 * Printing
 * -------------------------------------------------------------------------- */

function describeEffect(effect: ResolvedServiceEvent): string {
  const at = `${String(effect.atS)} s`;
  if (isServiceRangeEvent(effect)) return `${at} bank ${effect.bankId} serves ${effect.servesFloors.join(',')}`;
  if (isServiceModeEvent(effect)) return `${at} ${effect.bankId}/${effect.carId} → ${effect.mode}`;
  return `${at} ${effect.bankId}/${effect.carId} rated ${String(effect.ratedLoadKg)} kg (${String(effect.ratedLoadLb)} lb)`;
}

/** One entry on one line: the instant, the kind, and its payload in full. */
export function describePlayEntry(entry: RunInterventionConfig, context: PlayContext): string {
  const change = entry.change;
  const at = `t=${String(entry.atS)} s`.padEnd(12);
  switch (change.kind) {
    case 'park-cars-lobby':
    case 'spread-cars':
      return `${at}${change.kind}`;
    case 'switch-dispatcher':
    case 'adopt-dispatcher':
      return `${at}${change.kind} → ${change.profile.id} (the shipped profile, verbatim, no rule rows)`;
    case 'answer-incident':
    case 'equipment-change':
    case 'building-change': {
      const head =
        change.kind === 'answer-incident'
          ? `${change.kind} "${change.option}"`
          : `${change.kind} ${change.changeId} "${change.name}" (${String(context.purchases.find((row) => row.id === change.changeId)?.units ?? '?')} u)`;
      const effects = change.serviceEvents.map(describeEffect);
      return `${at}${head}; effects: ${effects.length === 0 ? 'none' : effects.join('; ')}`;
    }
  }
}

/**
 * The log as JSON, with each handover's profile written as its shipped id.
 *
 * A generated or shrunk handover always carries a shipped profile verbatim, so the id is the whole
 * of it; everything else is printed as the record carries it.
 */
export function playLogJson(log: Log): string {
  return JSON.stringify(
    log.map((entry) =>
      entry.change.kind === 'switch-dispatcher' || entry.change.kind === 'adopt-dispatcher'
        ? { atS: entry.atS, change: { kind: entry.change.kind, shippedProfileId: entry.change.profile.id } }
        : entry,
    ),
    null,
    2,
  );
}

/** A session in full, in one string: the seed, the stage, the crowd, the purse and the whole log. */
export function formatPlayCase(playCase: PlayCase, context: PlayContext): string {
  const { stage } = context;
  return [
    `case      ${playCase.caseId}`,
    `playSeed  ${playCase.playSeed}   (playCaseFromSeed reproduces the *unshrunk* parent)`,
    `stage     ${stage.id} on ${stage.buildingId}, opening on ${stage.startingProfileId}, ${String(stage.durationS)} s`,
    `crowd     replication ${String(playCase.replication)} of the tuning set (master seed ${stage.tuningSeeds.seed})`,
    `budget    ${String(playCase.budgetUnits)} u rung; the log spends ${String(playLogSpend(context, playCase.log))} u`,
    `shape     ${playCase.shape}, ${String(playCase.log.length)} entr${playCase.log.length === 1 ? 'y' : 'ies'}`,
    ...playCase.log.map((entry, index) => `  [${String(index)}] ${describePlayEntry(entry, context)}`),
    'log (JSON; handovers by shipped profile id)',
    playLogJson(playCase.log),
  ].join('\n');
}

/** A counterexample and what it violated, ready to paste into a bug report. */
export function formatPlayOutcome(outcome: PlayOutcome, context: PlayContext): string {
  return [
    formatPlayCase(outcome.case, context),
    `status    ${outcome.status}, ${String(outcome.generatedPassengers)} passengers, ${outcome.simulatedSeconds.toFixed(1)} simulated s, verdict ${outcome.awtIsValid === undefined ? 'none' : outcome.awtIsValid ? 'valid' : 'refused'}`,
    'violations',
    ...outcome.violations.map((violation) => `  [${violation.property}] ${violation.message}`),
  ].join('\n');
}
