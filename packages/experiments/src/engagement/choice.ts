/**
 * **Proxy 1, the meaningful-choice rate: of the choices a session made, how many changed the run.**
 *
 * Pillar 4 asks for *frequent meaningful choices*, and a choice is meaningful only if making it
 * changed the outcome. So each entry of a verb log gets its **paired counterfactual**: the same
 * stage, the same replication seeds, the log with that one entry removed and every other entry held.
 * The entry is meaningful on that replication set iff the paired-t interval on ΔTTD (with the entry
 * minus without it, seconds of mean time to destination) excludes zero. ΔAWT is computed and printed
 * beside it, never instead of it. The replications are the bands file's `meaningfulChoice.replications`
 * of the stage's **tuning** seeds, the set a player iterates against.
 *
 * This is a premise about people: that a choice which moves the time to destination is one a player
 * experiences as mattering. Nothing here is `Measured`.
 *
 * ## The rule is P-DESIGN-1's, so the two cannot disagree about one comparison
 *
 * `fuzz/playCampaign.ts#rankVerbs` already pairs one canonical press of each verb against the empty
 * log, and for a one-entry log that **is** this counterfactual. So {@link judgeChoice} applies its rule
 * and no other: a replication whose crowd held nobody is left out of the pairing and counted (which
 * days are empty is a property of the trace, shared by both arms, so leaving them out conditions on
 * nothing the choice can touch); the crowd is checked equal by digest on every pair and a mismatch
 * throws; any other refused mean in either arm suppresses the choice; and a choice needs two pairs.
 * `choice.test.ts` holds the two to the same interval on a shipped stage.
 *
 * ## Four statuses, and which ones the rate counts
 *
 * | status | in `n` | in `k` |
 * |---|---|---|
 * | `meaningful` (the interval excludes zero, either sign) | yes | yes |
 * | `null` (the interval contains zero) | yes | no |
 * | `suppressed` (a refused mean: shown in its own bucket) | yes | no |
 * | `not-yet-replayable` | no | no |
 *
 * A suppressed choice stays in the denominator and is never a pass: that is the same § D158 argument
 * the tension band makes, since a refused mean is likelier on the hard runs. A **not-yet-replayable**
 * entry is one whose kind a session cannot replay from its verbs and seed alone, the way a leaderboard
 * submission is replayed (`core`'s `sim/interventionWire.ts`): `answer-incident` (permanently,
 * § D486), `equipment-change` and `building-change`. Which kinds those are is **asked of `core`**
 * through `interventionKindRefusal`, and the entry is reported with that kind's own refusal, counted in
 * its own bucket, and kept out of both sides of the rate.
 *
 * ## The two baselines a cycle can use
 *
 * - **The player session.** On a Scenario stage no player presses a verb: the stage is played as a
 *   judged move (a shipped profile and its dials), and the verbs live only on the live day screen. So
 *   a stage-1 player session has nothing to judge, and {@link meaningfulChoiceRate} says `0 of 0`.
 * - **The engine baseline**, {@link engineBaselineChoices}: the canonical presses `rankVerbs` uses
 *   (`canonicalVerbs`: one per kind, and one per shipped target `core` schedules on the stage for the
 *   two handovers), each judged against the empty log. It is labelled an engine-level baseline
 *   wherever it is printed, because no player made those choices.
 *
 * ## The persona's half
 *
 * The spec's reconciliation needs the persona's belief, per choice, that it mattered. Those beliefs do
 * not exist until the playtest phase, so {@link beliefDisagreements} takes them as an argument and the
 * baseline passes none.
 *
 * Nothing here reads a clock, a file or a random stream; the runs come from `PlaySessions`, which
 * builds each one from the stage's plain data (`fuzz/stageSession.ts`, held to the game's own run by
 * `packages/viz/src/campaign/stageSessionAgreement.test.ts`). The decisions bind nothing outside
 * `engagement/` (§ D405); the proxies as a whole are § D1595.
 */

import { interventionKindRefusal, type RunInterventionConfig, type SimulationResult } from '@elevator-sim/core';

import { canonicalVerbs } from '../fuzz/playCampaign.js';
import type { PlaySessions } from '../fuzz/play.js';
import type { PlayKind } from '../fuzz/verbs.js';
import { traceDigest } from '../runner/replication.js';
import { metricOf } from '../runner/metrics.js';
import type { MeaningfulChoiceBands, TensionBand } from './bands.js';
import { pairedComparison, type KOfN, type PairedComparison } from './counts.js';
import { pairedTension, tensionOf } from './tension.js';

export type ChoiceStatus = 'meaningful' | 'null' | 'suppressed' | 'not-yet-replayable';

/** One entry of a log, judged. */
export interface ChoiceVerdict {
  /** Where the entry sits in its log. */
  readonly entryIndex: number;
  readonly kind: PlayKind;
  /** The entry in words. */
  readonly instance: string;
  readonly status: ChoiceStatus;
  /** Replications asked for: the bands file's count. `0` on a not-yet-replayable entry, which runs nothing. */
  readonly replications: number;
  /** Replications whose crowd held nobody, so neither arm had a time to destination to pair. */
  readonly emptyCrowds: number;
  /** ΔTTD, with the entry minus without it, seconds. Absent on a suppressed or not-yet-replayable entry. */
  readonly ttd?: PairedComparison | undefined;
  /** ΔAWT, beside ΔTTD and never instead of it. Absent exactly when `ttd` is. */
  readonly awt?: PairedComparison | undefined;
  /**
   * Δ in band: the two arms' tension-band indicators (proxy 2) paired on every replication, with the
   * entry minus without it. Present on a replayable entry when a band was supplied. It is printed
   * beside the choice and never combined with it.
   */
  readonly tension?: PairedComparison | undefined;
  /** The `awtIsValid` ground that refused a mean, or why no interval could be formed. */
  readonly suppressedBecause?: string | undefined;
  /** `core`'s own refusal for the kind, on a not-yet-replayable entry. */
  readonly notReplayableBecause?: string | undefined;
}

/**
 * Why an entry of this kind cannot be judged yet, or `undefined` for a kind that replays from its
 * verbs and seed alone. `core`'s answer, verbatim.
 */
export function notYetReplayable(kind: PlayKind): string | undefined {
  return interventionKindRefusal(kind);
}

/** What {@link judgeChoice} reads: one entry and both arms' runs, replication by replication. */
export interface ChoiceArms {
  readonly entryIndex: number;
  readonly kind: PlayKind;
  readonly instance: string;
  /** The log as played, on replications `0 … replications − 1`. */
  readonly withEntry: readonly SimulationResult[];
  /** The log with this one entry removed, on the same replications in the same order. */
  readonly withoutEntry: readonly SimulationResult[];
  /** The scenario's tension band, to pair the two arms' in-band indicators beside the choice. */
  readonly band?: TensionBand | undefined;
}

/**
 * One replayable entry, judged from its two arms. Pure: it reads the runs it is given.
 *
 * @throws Error when the arms differ in length or a pair did not see the same crowd.
 */
export function judgeChoice(arms: ChoiceArms): ChoiceVerdict {
  const { entryIndex, kind, instance, withEntry, withoutEntry } = arms;
  if (withEntry.length !== withoutEntry.length) {
    throw new Error(`choice ${String(entryIndex)} (${instance}): ${String(withEntry.length)} runs with the entry against ${String(withoutEntry.length)} without`);
  }
  const replications = withEntry.length;
  const pairs: { readonly with: SimulationResult; readonly without: SimulationResult }[] = [];
  for (const [index, without] of withoutEntry.entries()) {
    const run = withEntry[index] as SimulationResult;
    if (traceDigest(run.trace) !== traceDigest(without.trace)) {
      throw new Error(`choice ${String(entryIndex)} (${instance}): replication ${String(index)} did not see the same crowd in both arms`);
    }
    if (without.trace.passengerCount === 0) continue;
    pairs.push({ with: run, without });
  }
  const emptyCrowds = replications - pairs.length;
  /*
   * Over every replication, empty crowds included: the tension band keeps a flagged run in its
   * denominator as a run that is not in band, so its paired form does the same.
   */
  const band = arms.band;
  const tension =
    band === undefined
      ? undefined
      : pairedTension(
          withEntry.map((run) => tensionOf(run.record, run.summary, band)),
          withoutEntry.map((run) => tensionOf(run.record, run.summary, band)),
        );
  const base = { entryIndex, kind, instance, replications, emptyCrowds, ...(tension === undefined ? {} : { tension }) };
  const refused = pairs.flatMap((pair) => [pair.with, pair.without]).find((run) => !run.summary.awtIsValid);
  if (refused !== undefined || pairs.length < 2) {
    return Object.freeze({
      ...base,
      status: 'suppressed',
      suppressedBecause: refused === undefined ? 'fewer than two pairs' : (refused.summary.awtInvalidGround ?? 'refused'),
    });
  }
  const metric = (runs: readonly SimulationResult[], id: 'ttdMeanS' | 'awtS'): number[] =>
    runs.map((run) => metricOf(run.summary, id));
  const ttd = pairedComparison(
    metric(pairs.map((pair) => pair.with), 'ttdMeanS'),
    metric(pairs.map((pair) => pair.without), 'ttdMeanS'),
    2,
  );
  const awt = pairedComparison(
    metric(pairs.map((pair) => pair.with), 'awtS'),
    metric(pairs.map((pair) => pair.without), 'awtS'),
    2,
  );
  if (ttd.verdict === 'SUPPRESSED') {
    return Object.freeze({ ...base, status: 'suppressed', suppressedBecause: ttd.suppressedBecause });
  }
  return Object.freeze({ ...base, status: ttd.verdict === 'INDISTINGUISHABLE' ? 'null' : 'meaningful', ttd, awt });
}

/** An entry of a kind that cannot be replayed yet, reported with `core`'s reason and judged on nothing. */
function stubbedChoice(entryIndex: number, kind: PlayKind, instance: string, refusal: string): ChoiceVerdict {
  return Object.freeze({
    entryIndex,
    kind,
    instance,
    status: 'not-yet-replayable',
    replications: 0,
    emptyCrowds: 0,
    notReplayableBecause: refusal,
  });
}

/**
 * Every entry of a player's log, each against the log without it, on the bands file's replications of
 * the stage's tuning seeds. An empty log returns no verdicts, which is a stage-1 player session.
 *
 * @param describe the entry in words, for the report (`fuzz/playShrink.ts#describePlayEntry`).
 */
export function measureChoices(
  sessions: PlaySessions,
  log: readonly RunInterventionConfig[],
  bands: MeaningfulChoiceBands,
  describe: (entry: RunInterventionConfig) => string,
  band?: TensionBand,
): readonly ChoiceVerdict[] {
  if (log.length === 0) return Object.freeze([]);
  const replications = Array.from({ length: bands.replications }, (_, index) => index);
  const played = replications.map((replication) => sessions.run(log, replication));
  return Object.freeze(
    log.map((entry, entryIndex) => {
      const kind = entry.change.kind;
      const refusal = notYetReplayable(kind);
      if (refusal !== undefined) return stubbedChoice(entryIndex, kind, describe(entry), refusal);
      const rest = log.filter((_, index) => index !== entryIndex);
      return judgeChoice({
        entryIndex,
        kind,
        instance: describe(entry),
        withEntry: played,
        withoutEntry: replications.map((replication) =>
          rest.length === 0 ? sessions.baseline(replication) : sessions.run(rest, replication),
        ),
        band,
      });
    }),
  );
}

/**
 * **The engine-level baseline**: each canonical press `rankVerbs` lays on the stage, as a one-entry
 * log judged against the empty log. The replayable kinds are judged; the other three come back
 * not-yet-replayable with their reasons, so the report can name them. No player made these choices.
 */
export function engineBaselineChoices(
  sessions: PlaySessions,
  bands: MeaningfulChoiceBands,
  band?: TensionBand,
): readonly ChoiceVerdict[] {
  const replications = Array.from({ length: bands.replications }, (_, index) => index);
  return Object.freeze(
    canonicalVerbs(sessions.context).map(({ kind, instance, log }) => {
      const refusal = notYetReplayable(kind);
      if (refusal !== undefined) return stubbedChoice(0, kind, instance, refusal);
      return judgeChoice({
        entryIndex: 0,
        kind,
        instance,
        withEntry: replications.map((replication) => sessions.run(log, replication)),
        withoutEntry: replications.map((replication) => sessions.baseline(replication)),
        band,
      });
    }),
  );
}

/** The rate, as counts, with every bucket beside it. */
export interface ChoiceRate {
  /** Every entry handed in, judged or not. */
  readonly entries: number;
  /** Meaningful, of every replayable entry (meaningful, null and suppressed). */
  readonly meaningful: KOfN;
  readonly null: number;
  readonly suppressed: number;
  readonly notYetReplayable: number;
  /** Each not-yet-replayable kind once, with how many entries it held and `core`'s reason. */
  readonly stubbedKinds: readonly { readonly kind: PlayKind; readonly entries: number; readonly refusal: string }[];
}

export function meaningfulChoiceRate(verdicts: readonly ChoiceVerdict[]): ChoiceRate {
  const count = (status: ChoiceStatus): number => verdicts.filter((verdict) => verdict.status === status).length;
  const stubbed = new Map<PlayKind, { kind: PlayKind; entries: number; refusal: string }>();
  for (const verdict of verdicts) {
    if (verdict.status !== 'not-yet-replayable') continue;
    const row = stubbed.get(verdict.kind) ?? { kind: verdict.kind, entries: 0, refusal: verdict.notReplayableBecause ?? '' };
    row.entries += 1;
    stubbed.set(verdict.kind, row);
  }
  const judged = verdicts.length - count('not-yet-replayable');
  return Object.freeze({
    entries: verdicts.length,
    meaningful: Object.freeze({ k: count('meaningful'), n: judged }),
    null: count('null'),
    suppressed: count('suppressed'),
    notYetReplayable: count('not-yet-replayable'),
    stubbedKinds: Object.freeze([...stubbed.values()].map((row) => Object.freeze(row))),
  });
}

/* -------------------------------------------------------------------------- *
 * The persona's half
 * -------------------------------------------------------------------------- */

/** What the persona logged about one of its choices. */
export interface ChoiceBelief {
  readonly entryIndex: number;
  readonly believedMattered: boolean;
}

export interface BeliefDisagreements {
  /** Believed to matter, measured null: a dominated or cosmetic verb (pillar 3), or a feedback defect. */
  readonly feltButNull: readonly ChoiceVerdict[];
  /** Measured meaningful, believed not to matter: the game did something and did not say so (pillar 2). */
  readonly unperceived: readonly ChoiceVerdict[];
  /** Beliefs about an entry that was suppressed, not yet replayable, or not in the log at all. */
  readonly unjudged: readonly ChoiceBelief[];
}

/**
 * The persona's beliefs against the measurement, entry by entry. The baseline passes no beliefs and
 * gets three empty lists back.
 *
 * @throws Error when one entry carries two beliefs, which would make the disagreement ambiguous.
 */
export function beliefDisagreements(verdicts: readonly ChoiceVerdict[], beliefs: readonly ChoiceBelief[]): BeliefDisagreements {
  const byEntry = new Map(verdicts.map((verdict) => [verdict.entryIndex, verdict]));
  const seen = new Set<number>();
  const feltButNull: ChoiceVerdict[] = [];
  const unperceived: ChoiceVerdict[] = [];
  const unjudged: ChoiceBelief[] = [];
  for (const belief of beliefs) {
    if (seen.has(belief.entryIndex)) throw new Error(`entry ${String(belief.entryIndex)} carries two beliefs`);
    seen.add(belief.entryIndex);
    const verdict = byEntry.get(belief.entryIndex);
    if (verdict === undefined || (verdict.status !== 'meaningful' && verdict.status !== 'null')) unjudged.push(belief);
    else if (belief.believedMattered && verdict.status === 'null') feltButNull.push(verdict);
    else if (!belief.believedMattered && verdict.status === 'meaningful') unperceived.push(verdict);
  }
  return Object.freeze({
    feltButNull: Object.freeze(feltButNull),
    unperceived: Object.freeze(unperceived),
    unjudged: Object.freeze(unjudged),
  });
}
