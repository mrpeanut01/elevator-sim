/**
 * **Many verb logs on one stage, what it cost, and the dominant-verb ranking.**
 *
 * `campaign.ts`'s shape on the persona's axis: a pinned corpus of play seeds for the `standard` tier,
 * a contiguous range for `deep`, every failure shrunk, and the cost printed rather than assumed. The
 * tier is a flag on the command (`elevator-sim fuzz --scenario <id> --tier deep`), never an
 * environment variable.
 *
 * ## P-DESIGN-1 is a ranking, never a pass or a fail
 *
 * {@link rankVerbs} lays one **canonical instance** of each verb on the stage and takes a paired-t
 * interval on the difference in mean time to destination against the empty log, under common random
 * numbers (both arms on replication `i` of the stage's tuning seeds, and the crowd checked equal by
 * digest on every pair), through `experiments`' own `pairedDifferenceEstimate` and
 * `intervalContainsZero`. 50 replications on `standard`, 200 on `deep`, which is CLAUDE.md's budget.
 * Each row reads BETTER, WORSE or INDISTINGUISHABLE, or is suppressed when either arm refuses its mean
 * on any replication; two separate intervals are never compared. Whether a verb that wins here is
 * *dominant* is the design director's call across scenarios, and nothing here exits non-zero on it.
 *
 * The canonical instances, chosen once and stated here:
 *
 * - `park-cars-lobby` and `spread-cars` at `t = 0`;
 * - `switch-dispatcher` and `adopt-dispatcher` at `t = 0`, **one row per shipped target `core`
 *   schedules on the stage** other than the opening profile, because a handover is only as good as
 *   what it hands over to;
 * - `answer-incident`, `equipment-change` and `building-change` at `t = 0` with **no service
 *   events**, the cheapest row of the kind's tier for the two purchases. The three kinds carry no
 *   behaviour of their own: what they do is the service-event list, and no shipped data authors one
 *   for a Scenario stage. So their rows ask one question, whether the stamp alone moves the run, and
 *   the expected answer is an exact tie. A row that is not a tie is a finding about the stamp.
 *
 * The decisions here bind nothing outside `fuzz/` (§ D405).
 */

import { INTERVENTION_KINDS, type RunInterventionConfig, type SimulationResult } from '@elevator-sim/core';

import { pairedDifferenceEstimate } from '../reports/statistics.js';
import { intervalContainsZero } from '../reports/types.js';
import { metricOf } from '../runner/metrics.js';
import { traceDigest } from '../runner/replication.js';
import { isPlayFailure, PlaySessions, type PlayOutcome } from './play.js';
import { shrinkPlayCase, type PlayShrinkResult } from './playShrink.js';
import { deepSeeds } from './campaign.js';
import {
  playCaseFromSeed,
  type PlayCase,
  type PlayContext,
  type PlayKind,
  type PlaySpace,
} from './verbs.js';

/* -------------------------------------------------------------------------- *
 * Corpora
 * -------------------------------------------------------------------------- */

/**
 * The `standard` tier: 64 pinned play seeds. A seed is decoded against a stage and against the
 * shipped data it draws payloads from, so the same seed on two stages is two different sessions,
 * and a profile or a price row added to `data/` re-maps every seed exactly as a new profile re-maps
 * the building corpus (`run.ts#CORPUS_DISPATCHER_PROFILE_IDS`). That is why a fixed finding is pinned
 * **whole**, as its printed log, in {@link PLAY_REGRESSIONS}, rather than as a seed: the log means
 * the same run whatever ships beside it.
 */
export const STANDARD_PLAY_CORPUS: readonly number[] = Object.freeze(
  Array.from({ length: 64 }, (_, index) => 3_000_001 + index),
);

/** The `deep` tier's seeds: a contiguous range from `from`, disjoint from the pinned corpus by default. */
export function deepPlaySeeds(count: number, from = 3_100_001): readonly number[] {
  return deepSeeds(count, from);
}

/* -------------------------------------------------------------------------- *
 * The campaign
 * -------------------------------------------------------------------------- */

export interface PlayCampaignStats {
  readonly cases: number;
  readonly failures: number;
  readonly entries: number;
  readonly generatedPassengers: number;
  readonly simulatedSeconds: number;
  /** Entries per kind, over every case. A kind at zero was never exercised. */
  readonly kinds: Readonly<Record<string, number>>;
  readonly shapes: Readonly<Record<string, number>>;
  readonly statuses: Readonly<Record<string, number>>;
  /** Cases whose session refused its mean, and on which ground. */
  readonly refusals: number;
}

export interface PlayCampaignResult {
  readonly outcomes: readonly PlayOutcome[];
  readonly failures: readonly PlayShrinkResult[];
  readonly stats: PlayCampaignStats;
}

export interface PlayCampaignOptions {
  readonly sessions: PlaySessions;
  readonly seeds: readonly number[];
  /** Cases replayed beside the seeds — the pinned regressions — and counted with them. */
  readonly pinned?: readonly PlayCase[] | undefined;
  readonly space: PlaySpace;
  readonly shrink?: boolean | undefined;
  readonly shrinkBudget?: number | undefined;
}

/** Run every seed on the stage, check all nine properties, and shrink whatever failed. */
export function runPlayCampaign(options: PlayCampaignOptions): PlayCampaignResult {
  const { sessions } = options;
  const outcomes: PlayOutcome[] = [];
  const failures: PlayShrinkResult[] = [];
  const kinds: Record<string, number> = Object.fromEntries(INTERVENTION_KINDS.map((kind) => [kind, 0]));
  const shapes: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  let entries = 0;
  let generatedPassengers = 0;
  let simulatedSeconds = 0;
  let refusals = 0;

  const cases = [
    ...options.seeds.map((seed) => playCaseFromSeed(seed, sessions.context, options.space)),
    ...(options.pinned ?? []),
  ];
  for (const playCase of cases) {
    const outcome = sessions.evaluate(playCase);
    outcomes.push(outcome);
    for (const entry of playCase.log) kinds[entry.change.kind] = (kinds[entry.change.kind] ?? 0) + 1;
    entries += playCase.log.length;
    shapes[playCase.shape] = (shapes[playCase.shape] ?? 0) + 1;
    statuses[outcome.status] = (statuses[outcome.status] ?? 0) + 1;
    generatedPassengers += outcome.generatedPassengers;
    simulatedSeconds += outcome.simulatedSeconds;
    if (outcome.awtIsValid === false) refusals += 1;
    if (!isPlayFailure(outcome)) continue;
    failures.push(
      options.shrink === false
        ? { original: outcome, minimal: outcome, steps: 0, evaluations: 0 }
        : shrinkPlayCase(outcome, sessions, options.shrinkBudget),
    );
  }

  return {
    outcomes: Object.freeze(outcomes),
    failures: Object.freeze(failures),
    stats: Object.freeze({
      cases: cases.length,
      failures: failures.length,
      entries,
      generatedPassengers,
      simulatedSeconds,
      kinds: Object.freeze(kinds),
      shapes: Object.freeze(shapes),
      statuses: Object.freeze(statuses),
      refusals,
    }),
  };
}

/** One line per fact. Printed, never inferred. */
export function formatPlayStats(stats: PlayCampaignStats): string {
  const histogram = (record: Readonly<Record<string, number>>): string =>
    Object.entries(record)
      .map(([id, count]) => `${id}=${String(count)}`)
      .join(' ');
  return [
    `cases            ${String(stats.cases)}`,
    `failures         ${String(stats.failures)}`,
    `log entries      ${String(stats.entries)}`,
    `verbs pressed    ${histogram(stats.kinds)}`,
    `log shapes       ${histogram(stats.shapes)}`,
    `passengers       ${String(stats.generatedPassengers)}`,
    `simulated time   ${(stats.simulatedSeconds / 3600).toFixed(2)} h (${stats.simulatedSeconds.toFixed(0)} s)`,
    `run statuses     ${histogram(stats.statuses)}`,
    `refused means    ${String(stats.refusals)} of ${String(stats.cases)} sessions`,
  ].join('\n');
}

/* -------------------------------------------------------------------------- *
 * The regression corpus
 * -------------------------------------------------------------------------- */

/**
 * A fixed finding, pinned so it cannot come back: the shrunk session in the printed JSON form, with
 * handovers by shipped profile id. Replayed by `play.test.ts` on every run, beside the pinned corpus.
 */
export interface PinnedPlayCase {
  readonly caseId: string;
  /** The play seed of the unshrunk parent, so the finding's provenance is one integer. */
  readonly playSeed: string;
  readonly stageId: string;
  readonly replication: number;
  readonly budgetUnits: number;
  /** What it broke, and where the fix landed. Reported, never branched on. */
  readonly found: string;
  readonly log: readonly unknown[];
}

/**
 * **Every fixed P-PLAY finding, pinned.** Each entry is the shrunk counterexample as the command
 * printed it, with the play seed of its unshrunk parent. The `standard` tier replays every entry for
 * the stage it is run on, beside {@link STANDARD_PLAY_CORPUS}, and `play.test.ts` replays all of them
 * on every run, so a fixed finding cannot come back silently.
 */
export const PLAY_REGRESSIONS: readonly PinnedPlayCase[] = Object.freeze([
  {
    caseId: "play-3000033-s7",
    playSeed: "3000033",
    stageId: "stage-1-first-call",
    replication: 0,
    budgetUnits: 4,
    found: "conservation, standard tier: a rezone that stranded the whole crowd read as nineteen lost passengers, because P1 knew three termini and § D523 added a fifth. Fixed in properties.ts#checkConservation (§ D1590).",
    log: [
      {
        atS: 0,
        change: {
          kind: "answer-incident",
          option: "answer 9",
          serviceEvents: [
            {
              atS: 0,
              bankId: "main",
              servesFloors: [
                "6"
              ]
            }
          ]
        }
      }
    ]
  },
  {
    caseId: "play-3000007-s5",
    playSeed: "3000007",
    stageId: "stage-1-first-call",
    replication: 0,
    budgetUnits: 24,
    found: "capacity, standard tier: a derate at the opening instant read as the load cell misreporting its load factor, because P3 read the plate for the whole run. Fixed in properties.ts#checkCapacity (§ D1590).",
    log: [
      {
        atS: 0,
        change: {
          kind: "building-change",
          changeId: "rezone-bank",
          name: "Rezone a bank",
          serviceEvents: [
            {
              atS: 0,
              bankId: "main",
              carId: "A",
              ratedLoadLb: 1440,
              ratedLoadKg: 657
            }
          ]
        }
      }
    ]
  },
  {
    caseId: "play-3000045-s7",
    playSeed: "3000045",
    stageId: "stage-1-first-call",
    replication: 0,
    budgetUnits: 4,
    found: "capacity, standard tier: the same P3 gap with the derate landing mid-day, after the car had carried riders at its plate. Fixed in properties.ts#checkCapacity (§ D1590).",
    log: [
      {
        atS: 0,
        change: {
          kind: "answer-incident",
          option: "answer 3",
          serviceEvents: [
            {
              atS: 261,
              bankId: "main",
              carId: "A",
              ratedLoadLb: 1440,
              ratedLoadKg: 657
            }
          ]
        }
      }
    ]
  },
  {
    caseId: "play-1000003-s8",
    playSeed: "1000003",
    stageId: "stage-1-first-call",
    replication: 0,
    budgetUnits: 4,
    found: "no-softlock, deep tier: P-PLAY-1's first draft read the engine's disclaimer that a switch keeps the run's passenger model as a refusal. The property was wrong; fixed in play.ts#checkNoSoftlock (§ D1590).",
    log: [
      {
        atS: 0,
        change: {
          kind: "switch-dispatcher",
          shippedProfileId: "destination-panel"
        }
      }
    ]
  },
  {
    caseId: "play-1000872-s12",
    playSeed: "1000872",
    stageId: "stage-1-first-call",
    replication: 33,
    budgetUnits: 54,
    found: "termination, deep tier at 2 000 cases: a rezone retired a call the only serving car had just been handed, the car kept the call's direction with nothing ahead, and under noDirectionReversal it refused the next down call for the rest of the day. An engine defect, fixed in core: Car.withdrawHallCall (§ D1591).",
    log: [
      {
        atS: 276,
        change: {
          kind: "equipment-change",
          changeId: "counterweight-rebalance",
          name: "Rebalance the counterweights",
          serviceEvents: [
            {
              atS: 276,
              bankId: "main",
              carId: "A",
              mode: "out-of-service"
            }
          ]
        }
      },
      {
        atS: 425,
        change: {
          kind: "equipment-change",
          changeId: "zone-the-tower",
          name: "Zone the tower",
          serviceEvents: [
            {
              atS: 425,
              bankId: "main",
              servesFloors: [
                "G",
                "2",
                "5"
              ]
            }
          ]
        }
      }
    ]
  },
  {
    caseId: "play-1000256-s11",
    playSeed: "1000256",
    stageId: "stage-1-first-call",
    replication: 6,
    budgetUnits: 54,
    found: "termination, deep tier at 2 000 cases: the same engine defect reached through a car returned to service and the other withdrawn before the rezone. Fixed in core: Car.withdrawHallCall (§ D1591).",
    log: [
      {
        atS: 124,
        change: {
          kind: "equipment-change",
          changeId: "counterweight-rebalance",
          name: "Rebalance the counterweights",
          serviceEvents: [
            {
              atS: 190,
              bankId: "main",
              carId: "B",
              mode: "out-of-service"
            },
            {
              atS: 758,
              bankId: "main",
              servesFloors: [
                "G",
                "4",
                "6"
              ]
            }
          ]
        }
      },
      {
        atS: 124,
        change: {
          kind: "equipment-change",
          changeId: "faster-doors",
          name: "Faster doors",
          serviceEvents: [
            {
              atS: 661,
              bankId: "main",
              carId: "B",
              mode: "in-service"
            }
          ]
        }
      },
      {
        atS: 124,
        change: {
          kind: "equipment-change",
          changeId: "queue-marshalling",
          name: "Queue marshalling",
          serviceEvents: [
            {
              atS: 708,
              bankId: "main",
              carId: "A",
              mode: "out-of-service"
            }
          ]
        }
      }
    ]
  },
  {
    caseId: "play-1001042-s16",
    playSeed: "1001042",
    stageId: "stage-1-first-call",
    replication: 21,
    budgetUnits: 54,
    found: "termination, deep tier at 2 000 cases: the same engine defect with one car in independent service and three range changes. Fixed in core: Car.withdrawHallCall (§ D1591).",
    log: [
      {
        atS: 0,
        change: {
          kind: "equipment-change",
          changeId: "tenant-floors",
          name: "Move or stagger a tenancy",
          serviceEvents: [
            {
              atS: 0,
              bankId: "main",
              carId: "A",
              mode: "independent"
            }
          ]
        }
      },
      {
        atS: 198,
        change: {
          kind: "equipment-change",
          changeId: "counterweight-rebalance",
          name: "Rebalance the counterweights",
          serviceEvents: [
            {
              atS: 761,
              bankId: "main",
              servesFloors: [
                "G",
                "2",
                "3",
                "4",
                "5",
                "6"
              ]
            }
          ]
        }
      },
      {
        atS: 198,
        change: {
          kind: "equipment-change",
          changeId: "queue-marshalling",
          name: "Queue marshalling",
          serviceEvents: [
            {
              atS: 198,
              bankId: "main",
              servesFloors: [
                "G",
                "2",
                "3",
                "4",
                "5"
              ]
            }
          ]
        }
      },
      {
        atS: 252,
        change: {
          kind: "building-change",
          changeId: "rezone-bank",
          name: "Rezone a bank",
          serviceEvents: [
            {
              atS: 472,
              bankId: "main",
              servesFloors: [
                "3",
                "4",
                "5"
              ]
            }
          ]
        }
      }
    ]
  }
] as const);

/** The pinned regressions about one stage. */
export function playRegressionsFor(stageId: string): readonly PinnedPlayCase[] {
  return PLAY_REGRESSIONS.filter((pinned) => pinned.stageId === stageId);
}

/**
 * Rebuild a pinned case against a stage's context.
 *
 * @throws Error when the pin names a stage other than the context's, or a profile that no longer ships.
 */
export function playCaseFromPinned(pinned: PinnedPlayCase, context: PlayContext): PlayCase {
  if (pinned.stageId !== context.stage.id) {
    throw new Error(`pinned case "${pinned.caseId}" is about stage "${pinned.stageId}", not "${context.stage.id}"`);
  }
  const profiles = new Map(context.resources.dispatcherProfiles.profiles.map((profile) => [profile.id, profile]));
  const log = pinned.log.map((raw): RunInterventionConfig => {
    const entry = raw as { atS: number; change: { kind: string; shippedProfileId?: string } };
    if (entry.change.kind === 'switch-dispatcher' || entry.change.kind === 'adopt-dispatcher') {
      const profile = profiles.get(entry.change.shippedProfileId ?? '');
      if (profile === undefined) {
        throw new Error(`pinned case "${pinned.caseId}" hands over to "${String(entry.change.shippedProfileId)}", which no longer ships`);
      }
      return { atS: entry.atS, change: { kind: entry.change.kind, profile } };
    }
    return raw as RunInterventionConfig;
  });
  return {
    caseId: pinned.caseId,
    playSeed: pinned.playSeed,
    stageId: pinned.stageId,
    replication: pinned.replication,
    budgetUnits: pinned.budgetUnits,
    shape: 'pinned',
    log,
  };
}

/* -------------------------------------------------------------------------- *
 * P-DESIGN-1
 * -------------------------------------------------------------------------- */

export type VerbVerdict = 'BETTER' | 'WORSE' | 'INDISTINGUISHABLE' | 'SUPPRESSED';

export interface VerbRankingRow {
  readonly kind: PlayKind;
  /** What the canonical instance is, in words. */
  readonly instance: string;
  /** Replications asked for. */
  readonly replications: number;
  /** Pairs the interval is taken over: the replications whose shared crowd was not empty. */
  readonly pairs: number;
  /** Replications whose crowd held nobody, so neither arm had a time to destination to pair. */
  readonly emptyCrowds: number;
  /** ΔTTD, the verb's arm minus the empty log, seconds. `NaN` on a suppressed row. */
  readonly meanS: number;
  readonly lowerS: number;
  readonly upperS: number;
  readonly verdict: VerbVerdict;
  /** Why the row is suppressed, when it is. */
  readonly suppressedBecause?: string | undefined;
}

/** The canonical instance of each verb on this stage, labelled. See the module docstring. */
export function canonicalVerbs(context: PlayContext): readonly { kind: PlayKind; instance: string; log: RunInterventionConfig[] }[] {
  const opening = context.resources.openingProfile;
  const rows: { kind: PlayKind; instance: string; log: RunInterventionConfig[] }[] = [
    { kind: 'park-cars-lobby', instance: 'at 0 s', log: [{ atS: 0, change: { kind: 'park-cars-lobby' } }] },
    { kind: 'spread-cars', instance: 'at 0 s', log: [{ atS: 0, change: { kind: 'spread-cars' } }] },
  ];
  for (const kind of ['switch-dispatcher', 'adopt-dispatcher'] as const) {
    const targets = kind === 'switch-dispatcher' ? context.switchTargets : context.adoptTargets;
    for (const profile of targets) {
      if (profile === opening) continue;
      rows.push({ kind, instance: `to ${profile.id} at 0 s`, log: [{ atS: 0, change: { kind, profile } }] });
    }
  }
  rows.push({
    kind: 'answer-incident',
    instance: 'at 0 s, no effect (the stamp alone)',
    log: [{ atS: 0, change: { kind: 'answer-incident', option: 'canonical', serviceEvents: [] } }],
  });
  for (const kind of ['equipment-change', 'building-change'] as const) {
    const cheapest = context.purchases
      .filter((row) => row.kind === kind)
      .sort((a, b) => a.units - b.units || (a.id < b.id ? -1 : 1))[0];
    if (cheapest === undefined) continue;
    rows.push({
      kind,
      instance: `${cheapest.id} at 0 s, no effect (the stamp alone)`,
      log: [{ atS: 0, change: { kind, changeId: cheapest.id, name: cheapest.name, serviceEvents: [] } }],
    });
  }
  return rows;
}

/**
 * P-DESIGN-1: every canonical verb against the empty log, paired, on the stage's own crowds.
 *
 * A row whose two arms ever saw different crowds is a CRN failure and throws rather than ranks,
 * because an interval over unpaired runs is the confident nonsense CLAUDE.md is written against.
 */
export function rankVerbs(sessions: PlaySessions, replications: number): readonly VerbRankingRow[] {
  /*
   * **A crowd of nobody is left out of the pairing, and counted.** Stage 1's residential trickle
   * draws an empty day now and then (replications 124 and 175 of its tuning seeds, at 200), and on
   * an empty day neither arm has a time to destination: there is no pair to take. Which days are
   * empty is a property of the trace, which both arms share by construction, so leaving them out
   * conditions on something the verb cannot touch rather than on the outcome. Every other refused
   * mean still suppresses the whole row.
   */
  const baselines: SimulationResult[] = [];
  const indices: number[] = [];
  for (let i = 0; i < replications; i += 1) {
    const baseline = sessions.baseline(i);
    if (baseline.trace.passengerCount === 0) continue;
    baselines.push(baseline);
    indices.push(i);
  }
  const emptyCrowds = replications - baselines.length;
  return canonicalVerbs(sessions.context).map(({ kind, instance, log }) => {
    const arm: SimulationResult[] = [];
    for (const [at, baseline] of baselines.entries()) {
      const replication = indices[at] ?? 0;
      const result = sessions.run(log, replication);
      if (traceDigest(result.trace) !== traceDigest(baseline.trace)) {
        throw new Error(`P-DESIGN-1 ${kind} ${instance}: replication ${String(replication)} did not see the empty log's crowd`);
      }
      arm.push(result);
    }
    const refused = [...arm, ...baselines].find((result) => !result.summary.awtIsValid);
    if (refused !== undefined || baselines.length < 2) {
      return {
        kind,
        instance,
        replications,
        pairs: baselines.length,
        emptyCrowds,
        meanS: Number.NaN,
        lowerS: Number.NaN,
        upperS: Number.NaN,
        verdict: 'SUPPRESSED' as const,
        suppressedBecause: refused === undefined ? 'fewer than two pairs' : (refused.summary.awtInvalidGround ?? 'refused'),
      };
    }
    const estimate = pairedDifferenceEstimate(
      arm.map((result) => metricOf(result.summary, 'ttdMeanS')),
      baselines.map((result) => metricOf(result.summary, 'ttdMeanS')),
    );
    const verdict: VerbVerdict = intervalContainsZero(estimate)
      ? 'INDISTINGUISHABLE'
      : estimate.upper < 0
        ? 'BETTER'
        : estimate.lower > 0
          ? 'WORSE'
          : 'SUPPRESSED';
    return {
      kind,
      instance,
      replications,
      pairs: baselines.length,
      emptyCrowds,
      meanS: estimate.mean,
      lowerS: estimate.lower,
      upperS: estimate.upper,
      verdict,
      ...(verdict === 'SUPPRESSED' ? { suppressedBecause: 'no interval could be formed' } : {}),
    };
  });
}
