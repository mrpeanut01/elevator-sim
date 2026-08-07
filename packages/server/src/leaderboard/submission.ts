/**
 * What a player submits, and the digest that decides **which board it belongs to**.
 *
 * `DECISIONS.md` § D214 § 3–4. A client-reported score measures willingness to cheat, so nothing
 * here trusts one: a submission carries the **seed and the resolved configuration**, and
 * `verify.ts` re-runs the simulation and accepts the score only if it reproduces.
 *
 * ## Why a board is keyed by a content hash
 *
 * A score is *"this seed, on this building, under this dispatcher, scored X"* — and every one of
 * those nouns lives in `data/`. Change `midtown-office`'s population and every stored score silently
 * stops describing the run it names, **and stops re-verifying**, so honest old entries begin failing
 * the check that exists to catch forgeries.
 *
 * This repository has paid for that lesson twice in one branch. § D205 found a recorded fuzz case
 * losing its subject when a dispatcher profile was added; § D213 found the same defect one field
 * over, where adding a traffic profile moved `fuzz-1001074`'s arrival count from 177 to 188 while
 * the case still ran and still reported cleanly. A leaderboard is that shape with money on it.
 *
 * So {@link configHashOf} digests the **fully resolved inputs a run depended on**, and a board is
 * that digest. A `data/` change does not corrupt an old board — it starts a new one, and the old
 * board stays readable and stays verifiable against the data it was set on.
 */

import { createHash } from 'node:crypto';

/* -------------------------------------------------------------------------- *
 * The submitted run
 * -------------------------------------------------------------------------- */

/**
 * The configuration half of a submission: everything needed to reproduce the run.
 *
 * Ids rather than inline objects, deliberately. A submission that carried its own building would
 * let a player invent a two-floor tower with sixteen cars and post a superb wait; ids mean the
 * server resolves against **its own** `data/`, and {@link configHashOf} records which `data/` that
 * was.
 */
export interface SubmittedRun {
  readonly buildingId: string;
  readonly dispatcherProfileId: string;
  readonly demandTemplateId: string;
  /** `null` means the building's own traffic profile — a distinct selection, and hashed as one. */
  readonly arrivalRatePctPop5min: number | null;
  readonly durationS: number;
  /**
   * Where in the day the run starts, or `null` for the whole period — `DECISIONS.md` § D285/§ D286.
   *
   * **The far end is `windowStartS + durationS`**, so this is one field rather than two: the viewer
   * carries the window as a start and a length (`menu/types.ts`), and a second end here would be a
   * second source of truth for a number `durationS` already fixes.
   *
   * Without it a windowed run could not be posted at all, and § D288 refused it in the client for
   * exactly that reason. The refusal was right and the reason is worth keeping, because it is not
   * *"the row would be mislabelled"*: the board does not store what a client claims, it
   * **re-simulates the seed itself** (§ D214 § 3). A lunch peak submitted without this field is
   * replayed over the whole day, and the server either refuses it by name — `office-day` at
   * `durationS: 1800` reaches `core` as `templateOverrides.durationS` on an authored phase list and
   * is rejected (§ D275) — or, on a shape template, quietly returns a different and entirely
   * correct answer to a different question. Neither number is wrong; they are about two different
   * runs, and nothing in the exchange could have said so.
   */
  readonly windowStartS: number | null;
  /** Decimal digits, 1–20. Validated before it reaches the kernel. */
  readonly seed: string;
}

/** The metrics a player claims. Every one is re-derived by the server and compared. */
export interface ClaimedMetrics {
  readonly awtS: number;
  readonly wt95S: number;
  readonly ttdMeanS: number;
  readonly pctOverLongWait: number;
  /**
   * Whether the run's own AWT is quotable.
   *
   * Submitted so that a **client claiming a valid mean for a saturated run is caught by the same
   * comparison as a client claiming the wrong number** — rather than being silently corrected by
   * the server and ranked anyway. `verify.ts` rejects a run whose real value is `false` regardless
   * of what was claimed (§ D214 § 6): a mean over a system whose queue grows without bound may not
   * be ranked, and the leaderboard is the one surface where a player is motivated to ignore that.
   */
  readonly awtIsValid: boolean;
}

export interface Submission {
  readonly run: SubmittedRun;
  readonly claimed: ClaimedMetrics;
}

/* -------------------------------------------------------------------------- *
 * The board identity
 * -------------------------------------------------------------------------- */

/**
 * The facts about the server's own `data/` that a run's result depends on.
 *
 * Supplied by the caller rather than read here, so this module stays pure and the test can pin a
 * digest without loading a configuration. `store.ts` builds it once at boot.
 */
export interface ResolvedDataFacts {
  /** A digest of the building document as loaded — floors, banks, cars, zones, transport modes. */
  readonly buildingDigest: string;
  /** A digest of the dispatcher profile as loaded — weights, constraints, every stage setting. */
  readonly dispatcherDigest: string;
  /** A digest of the demand template record as loaded. */
  readonly templateDigest: string;
  /**
   * The engine's own model version.
   *
   * `TRAFFIC_DEFAULTS.trafficModel` names *which simulator* produced a number, the way a file
   * format version names which writer produced a file. A `v1` score and a `v2` score are not
   * comparable however identical the rest of the configuration is, so the version is part of the
   * board's identity rather than a footnote on it.
   */
  readonly trafficModel: string;
}

/**
 * The board a submission belongs to: a digest over what it measured, **not** over who ran it or
 * what they scored.
 *
 * Two runs share a board exactly when every input that could move the result is the same. The seed
 * is deliberately **not** in it — a board is a leaderboard across seeds, and hashing the seed would
 * give every player a private board of one.
 *
 * The digest is over a canonical JSON string with sorted keys, so a field reordered in a record does
 * not silently fork a board.
 *
 * ## Why the window is `undefined` when absent rather than `null`
 *
 * Two runs of one seed over two parts of a day are **different runs** and belong on different
 * boards, so `windowStartS` has to be in here. But writing it as `null` for a whole-period run
 * would put a key in the canonical string that was never there before and **fork every board that
 * already exists** — every honest score posted before the window field, moved to a new board for a
 * selection its player did not make.
 *
 * `canonicalJson` drops `undefined` entries, so a whole-period run digests to **exactly** the string
 * it digested before this field existed, and a windowed run gets its own board. That is the same
 * argument the module makes at the top, applied to itself: a change that does not alter what a run
 * measured must not move the board it is on.
 *
 * `0` is a window and is not dropped — `windowStartS: 0` means *starts at the top of the day*,
 * which is a selection, and `?? undefined` distinguishes it from `null` correctly where `|| undefined`
 * would not.
 */
export function configHashOf(run: SubmittedRun, facts: ResolvedDataFacts): string {
  const canonical = canonicalJson({
    buildingId: run.buildingId,
    dispatcherProfileId: run.dispatcherProfileId,
    demandTemplateId: run.demandTemplateId,
    arrivalRatePctPop5min: run.arrivalRatePctPop5min,
    durationS: run.durationS,
    windowStartS: run.windowStartS ?? undefined,
    buildingDigest: facts.buildingDigest,
    dispatcherDigest: facts.dispatcherDigest,
    templateDigest: facts.templateDigest,
    trafficModel: facts.trafficModel,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/**
 * JSON with object keys in sorted order, recursively.
 *
 * `JSON.stringify` preserves insertion order, so two records that differ only in key order would
 * digest differently and fork a board for no reason. Arrays keep their order, because an array's
 * order is data.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

/** A digest of any loaded record, for {@link ResolvedDataFacts}. */
export function digestOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 32);
}

/* -------------------------------------------------------------------------- *
 * Shape validation, before anything is simulated
 * -------------------------------------------------------------------------- */

/** Run lengths the server will simulate. Bounded because a submission commands server CPU. */
export const ACCEPTED_DURATIONS_S: readonly number[] = Object.freeze([300, 900, 1800, 3600, 7200]);

/**
 * The outer bound on a window, in seconds.
 *
 * A day, not a template's period. The named record's own length is the kernel's business and it
 * refuses a window past it **by name** (`windowIdentity.test.ts`, *"refuses a window past the end
 * of the period, naming both lengths"*); this constant only stops a number that could not be a
 * time of day at all from reaching a simulation. `viz`'s stored-selection validator uses the same
 * bound for the same reason.
 */
const SECONDS_IN_A_DAY = 86_400;

/**
 * Everything structurally wrong with a submission, or an empty array.
 *
 * Runs **before** the simulation, because verification costs real CPU and an unauthenticated shape
 * error must not be able to command it. This is the cheap gate; `verify.ts` is the expensive one.
 */
export function submissionIssues(submission: Submission): readonly string[] {
  const issues: string[] = [];
  const { run, claimed } = submission;

  if (!/^\d{1,20}$/u.test(run.seed)) issues.push('seed must be 1–20 decimal digits');
  if (!ACCEPTED_DURATIONS_S.includes(run.durationS)) {
    issues.push(`durationS must be one of ${ACCEPTED_DURATIONS_S.join(', ')}`);
  }
  const rate = run.arrivalRatePctPop5min;
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || rate > 100)) {
    issues.push('arrivalRatePctPop5min must be null or a percentage in (0, 100]');
  }
  /*
   * Bounded by a day, and by the day rather than by the named template's own period — the same
   * bound `viz`'s `validate.ts` puts on the stored selection, for the same reason it gives: a
   * window naming a part that `data/` has since moved is a run the kernel will refuse **by name**,
   * which is a better answer than a shape error here.
   *
   * The far end is checked too, because `durationS` is validated against a fixed list above and a
   * window is not: `windowStartS + durationS` past the end of a day is a submission the generator
   * would reject, and refusing it here keeps an unauthenticated shape error from commanding a
   * simulation — which is this function's whole job.
   */
  const windowStartS = run.windowStartS;
  if (windowStartS !== null) {
    if (!Number.isFinite(windowStartS) || windowStartS < 0 || windowStartS >= SECONDS_IN_A_DAY) {
      issues.push(`windowStartS must be null or a second within a day [0, ${SECONDS_IN_A_DAY})`);
    } else if (windowStartS + run.durationS > SECONDS_IN_A_DAY) {
      issues.push(
        `windowStartS + durationS must not run past the end of a day (${SECONDS_IN_A_DAY} s)`,
      );
    }
  }
  for (const [name, id] of [
    ['buildingId', run.buildingId],
    ['dispatcherProfileId', run.dispatcherProfileId],
    ['demandTemplateId', run.demandTemplateId],
  ] as const) {
    if (typeof id !== 'string' || id.length === 0 || id.length > 64) {
      issues.push(`${name} must be a non-empty id under 64 characters`);
    }
  }
  for (const [name, value] of [
    ['awtS', claimed.awtS],
    ['wt95S', claimed.wt95S],
    ['ttdMeanS', claimed.ttdMeanS],
    ['pctOverLongWait', claimed.pctOverLongWait],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) issues.push(`${name} must be a non-negative number`);
  }
  if (typeof claimed.awtIsValid !== 'boolean') issues.push('awtIsValid must be a boolean');

  return Object.freeze(issues);
}
