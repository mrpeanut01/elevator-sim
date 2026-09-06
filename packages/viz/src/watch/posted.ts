/**
 * **A board row, as something a spectator can watch** — GitHub issue #337, GAMEPLAY § 14.1.
 *
 * § 14.1 opens with *"a board row is a run, and a run can be watched"*, and until this module the
 * second clause was true only of the player's own filed days and of shipped reference fixtures.
 * The daily board reads (`everyday/boardScreen.ts`), every row on it is a run the server verified
 * by replay, and `watch/` already does the hard parts — replaying a record rather than re-running
 * with the viewer's dispatcher, gating on reproduction, and grepping its own screen for
 * first-person copy. What was missing was one route, and this is it.
 *
 * ## What a posted run is, on this end
 *
 * A `RunSubmission` is *"the same fields Free Play selects, by construction"*
 * (`menu/client.ts`), and a {@link WatchRecord} is a free-play state with the player's rules and
 * their intervention log on it. So the record is the submission, field by field, with the two
 * halves the wire carries as ids resolved against **this build's** `data/` the way the server
 * resolves them against its own: the base profile is the shipped id (rules are re-applied at
 * replay by `stateFromWatchRecord`, which is why the rows travel and the profile does not), and a
 * handover is `scope/switchWire.ts#switchTargetFromWire`, the inverse of what the client sent.
 *
 * The week is free play's — day 1, weekday index 0 — because that is the week the server replays
 * under (`verify.ts#configFor` carries no day at all, and `menu/enterFreePlay.ts` opens the same
 * week for the same run), and a record that said otherwise would replay a grown building against
 * a claim measured on the one as built.
 *
 * ## What the row claims, and why it is not a `PostedResult`
 *
 * A filed day is checked on four **counts** (`reproduce.ts#postedResultOf`). A board row never
 * carried those; it carries the four figures the server ranked on, so the claim is those four
 * and the gate compares them (`reproduce.ts#claimRefusalFor`) to the server's own tolerance. The
 * figures the spectator reads are therefore the board's, not a count this device derived and then
 * labelled as posted.
 *
 * ## The row that cannot be watched
 *
 * § 14.1: *"Your own row cannot be watched. Its button reads `your run` and does nothing."* The
 * row's author is known by display name only, so the rule is applied on the name the signed-in
 * account holds; a signed-out player has no own row to refuse. That is a fact about the wire
 * rather than a shortcut, and `everyday/boardScreen.ts` is where it is applied.
 */

import {
  RULE_ACTIONS,
  RULE_CONDITIONS,
  type DispatcherProfile,
  type RuleRowConfig,
  type RunInterventionConfig,
} from '@elevator-sim/core/browser';

import type { RuleRow } from '../authoring/ruleSpec.js';
import { buildingConfigOf } from '../dev/state.js';
import type { BrowserResources } from '../dev/data.js';
import { switchTargetFromWire } from '../scope/switchWire.js';
import { WATCH_RECORD_VERSION, type WatchableRun, type WatchRecord } from './types.js';

/**
 * The board row as this module reads it — `menu/client.ts#BoardEntry`'s fields, restated rather
 * than imported. `boundaries.test.ts` § 16 rule 15 keeps `watch/` free of the leaderboard client so
 * a spectator's replay stays local, and the way it does that is by the row arriving **as data**:
 * `everyday/host.ts#postedRun` hands a `BoardEntry` in, which satisfies this shape structurally,
 * and nothing here can reach a server.
 */
export interface PostedRow {
  readonly id: string;
  readonly displayName: string;
  readonly run: {
    readonly buildingId: string;
    readonly dispatcherProfileId: string;
    readonly demandTemplateId: string;
    readonly arrivalRatePctPop5min: number | null;
    readonly durationS: number;
    readonly windowStartS: number | null;
    readonly seed: string;
    readonly ruleRows?: readonly WireRow[] | undefined;
    readonly interventions?: readonly WireIntervention[] | undefined;
  };
  readonly measured: {
    readonly awtS: number;
    readonly wt95S: number;
    readonly ttdMeanS: number;
    readonly pctOverLongWait: number;
    readonly awtIsValid: boolean;
  };
  readonly legs: number | undefined;
}

/** One entry of the wire's log — `menu/client.ts#SubmittedIntervention`, restated for the reason above. */
export interface WireIntervention {
  readonly atS: number;
  readonly change:
    | { readonly kind: 'park-cars-lobby' }
    | { readonly kind: 'spread-cars' }
    | { readonly kind: 'switch-dispatcher'; readonly toProfileId: string; readonly ruleRows?: readonly WireRow[] | undefined };
}

/** The subtitle a posted row carries — where it sits on the board it was read from. */
export function postedSubtitleOf(place: number): string {
  return `#${String(place)} on today's board`;
}

/** A wire row's shape — `menu/client.ts#SubmittedRuleRow`, strings until they are checked. */
export interface WireRow {
  readonly when: string;
  readonly whenValue?: number | string | undefined;
  readonly then: string;
  readonly thenValue?: number | string | undefined;
}

/**
 * The wire's rows as `core`'s, or the reason they cannot be — a condition or action this build does
 * not ship. The same check and the same sentence `record.ts#recordUnreadableReason` makes for a
 * record's own rows, made here for the rows a handover carries as well, because a row naming a
 * rule nothing implements would replay with the rule silently dropped, which is § 1.5's forbidden
 * approximate replay.
 */
function rowsFromWire(rows: readonly WireRow[]): readonly RuleRowConfig[] | string {
  for (const row of rows) {
    if (!(RULE_CONDITIONS as readonly string[]).includes(row.when)) {
      return `this build does not ship the rule condition “${row.when}”`;
    }
    if (!(RULE_ACTIONS as readonly string[]).includes(row.then)) {
      return `this build does not ship the rule action “${row.then}”`;
    }
  }
  return rows.map((row) => ({
    when: row.when,
    ...(row.whenValue === undefined ? {} : { whenValue: row.whenValue }),
    then: row.then,
    ...(row.thenValue === undefined ? {} : { thenValue: row.thenValue }),
  })) as readonly RuleRowConfig[];
}

/**
 * The wire's log as `core` runs it, or the reason it cannot be replayed here — a handover to a
 * dispatcher this build does not ship, or a handover carrying a rule it does not ship. The same
 * sentence shape as `record.ts#recordUnreadableReason` gives an unshipped base profile, and never
 * first-person.
 */
export function postedLogOf(
  entry: PostedRow,
  shipped: readonly DispatcherProfile[],
): readonly RunInterventionConfig[] | string {
  const log: RunInterventionConfig[] = [];
  for (const intervention of entry.run.interventions ?? []) {
    const change = intervention.change;
    if (change.kind === 'switch-dispatcher') {
      const rows = rowsFromWire(change.ruleRows ?? []);
      if (typeof rows === 'string') return `${rows}, and this run's handover is written on it`;
      const profile = switchTargetFromWire({ toProfileId: change.toProfileId, ruleRows: rows }, shipped);
      if (profile === undefined) {
        return (
          `this run handed over to a dispatcher this build does not ship (${change.toProfileId}), ` +
          'so the handover cannot be replayed here and the row cannot be watched'
        );
      }
      log.push({ atS: intervention.atS, change: { kind: 'switch-dispatcher', profile } });
    } else {
      log.push({ atS: intervention.atS, change: { kind: change.kind } });
    }
  }
  return log;
}

/**
 * The row as a spectator's row. `blocked` is set here only for a log this build cannot replay;
 * an unshipped building or base profile is left to `watch/library.ts#watchGateBefore`, which
 * refuses it through `recordUnreadableReason` exactly as it refuses a filed day naming one.
 */
export function postedRunOf(entry: PostedRow, place: number, resources: BrowserResources): WatchableRun {
  const run = entry.run;
  const log = postedLogOf(entry, resources.dispatcherProfiles.profiles);
  const record: WatchRecord = {
    version: WATCH_RECORD_VERSION,
    seed: run.seed,
    buildingId: run.buildingId,
    dispatcherId: run.dispatcherProfileId,
    pattern: 'building',
    demandTemplateId: run.demandTemplateId,
    arrivalRatePctPop5min: run.arrivalRatePctPop5min,
    shiftLengthS: run.durationS,
    windowStartS: run.windowStartS,
    day: 1,
    dayIdx: 0,
    outOfServiceCarIds: [],
    interventions: typeof log === 'string' ? [] : log,
    /*
     * The base profile's rows are copied as strings here and checked by name on read:
     * `record.ts#recordUnreadableReason` refuses a record naming a condition or action this build
     * lacks before the gate simulates, so an unknown rule is a refusal rather than a rule silently
     * dropped. The handover's rows are checked above because no reader of the record sees inside a
     * resolved profile.
     */
    ruleRows: (run.ruleRows ?? []).map((row) => ({
      when: row.when,
      ...(row.whenValue === undefined ? {} : { whenValue: row.whenValue }),
      then: row.then,
      ...(row.thenValue === undefined ? {} : { thenValue: row.thenValue }),
    })) as readonly RuleRow[],
  };
  return {
    id: `posted-${entry.id}`,
    source: 'posted-run',
    label: entry.displayName,
    buildingName: buildingConfigOf(resources, [], run.buildingId)?.name ?? run.buildingId,
    subtitle: postedSubtitleOf(place),
    record,
    posted: undefined,
    claim: {
      awtS: entry.measured.awtS,
      wt95S: entry.measured.wt95S,
      ttdMeanS: entry.measured.ttdMeanS,
      pctOverLongWait: entry.measured.pctOverLongWait,
      awtIsValid: entry.measured.awtIsValid,
      legs: entry.legs,
    },
    blocked: typeof log === 'string' ? { ground: 'unreadable-record', reason: log } : null,
  };
}
