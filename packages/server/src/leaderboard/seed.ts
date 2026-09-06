/**
 * **Seeding a daily board with the house's runs** — GitHub issue #222, § D521; the clock that calls
 * it is GitHub issue #328, § D522.
 *
 * The outside playtest's sentence is the brief: *"A leaderboard with nobody on it does not create
 * competitive pull; it creates the impression the game has no players."* This project can answer
 * it without fabricating anything, because every shipped dispatcher can play any board
 * deterministically and its run is real, replayable and measured by the same replay that judges a
 * player's. So a new board is opened with one row per shipped dispatcher, each posted by the house,
 * each labelled as a run nobody played.
 *
 * ## What a baseline is and is not
 *
 * - **It is a run.** `measureRun` is the verifier's own replay; the figures stored are the server's,
 *   there is no claim, and a client's `Watch it` replays the row exactly as it replays a player's.
 * - **It is not a player.** Every row is posted by {@link HOUSE_USER_ID} and carries the dispatcher
 *   it ran in `baseline_profile_id`, so the ranking keeps one row per (player, baseline dispatcher)
 *   and the ladder counts players only.
 * - **It does not rank the dispatchers.** One crowd, one seed, one run each — the shape `CLAUDE.md`
 *   forbids drawing a conclusion from, and the board's own note says so. What a row offers is a
 *   target a person can measure themselves against on the day's crowd, which is a comparison
 *   between two runs on identical arrivals and nothing more.
 * - **A dispatcher whose mean is not quotable is not posted**, exactly as a player's run would be
 *   refused: `nearest-car` on the daily fixture is measured `awtIsValid: false` and is reported in
 *   {@link SeedReport.skipped} with the verifier's own sentence. The board would otherwise carry a
 *   figure the rest of the project suppresses.
 *
 * ## Idempotent by the store's conflict key
 *
 * Each row's data hash carries the dispatcher, so thirteen dispatchers are thirteen distinct rows,
 * and a second firing on the same date hits `(board_key, data_hash, user_id, seed)` and updates in
 * place. `seed.test.ts` fires it twice and asserts the ids are the same and the count did not move,
 * which is #328's second acceptance clause asserted rather than assumed.
 */

import type { Store } from '../store/store.js';
import { HOUSE_USER_ID } from '../store/store.js';

import { dailyDateOf, dailyFixtureAt, dailySeedFor, placeSubmission, runDataHashOf, type DailyFixture } from './boardKey.js';
import type { ResolvedDataFacts, SubmittedRun } from './submission.js';
import { measureRun, type RejectionCode, type VerificationResources } from './verify.js';

interface SeedDeps {
  readonly store: Store;
  readonly resources: VerificationResources;
  readonly factsFor: (run: SubmittedRun) => ResolvedDataFacts | undefined;
  readonly now: () => number;
}

interface SeededRow {
  readonly dispatcherProfileId: string;
  readonly entryId: string;
  readonly awtS: number;
  readonly legs: number;
}

interface SkippedRow {
  readonly dispatcherProfileId: string;
  readonly code: RejectionCode | 'no-data-facts';
  readonly detail: string;
}

/** What one firing did, in full, so the caller's log names every row rather than a count. */
export interface SeedReport {
  readonly date: string;
  readonly boardKey: string;
  readonly seed: string;
  readonly seeded: readonly SeededRow[];
  readonly skipped: readonly SkippedRow[];
  readonly elapsedMs: number;
}

/**
 * Seed the daily board for `date` — today's by default — with one run per shipped dispatcher.
 *
 * `date` is accepted so the workflow's firing a few minutes after midnight UTC and a re-run later the
 * same day mean the same board, and so a test can name one. It is always the daily fixture's own
 * date arithmetic: the seed is `dailySeedFor(date)` and the key is `placeSubmission`'s, so a house
 * row lands on exactly the board a player's run of the same fixture lands on.
 */
export async function seedDailyBoard(deps: SeedDeps, date: string = dailyDateOf(deps.now())): Promise<SeedReport> {
  const started = deps.now();
  const fixture: DailyFixture = { ...dailyFixtureAt(deps.now()), date, seed: dailySeedFor(date) };
  const seeded: SeededRow[] = [];
  const skipped: SkippedRow[] = [];
  let boardKey = `daily:${date}`;
  for (const profileId of deps.resources.dispatcherProfilesById.keys()) {
    const run: SubmittedRun = {
      buildingId: fixture.config.buildingId,
      dispatcherProfileId: profileId,
      demandTemplateId: fixture.config.demandTemplateId,
      arrivalRatePctPop5min: fixture.config.arrivalRatePctPop5min,
      durationS: fixture.config.durationS,
      windowStartS: fixture.config.windowStartS,
      seed: fixture.seed,
    };
    const facts = deps.factsFor(run);
    if (facts === undefined) {
      skipped.push({ dispatcherProfileId: profileId, code: 'no-data-facts', detail: 'the server could not digest its own data for this run' });
      continue;
    }
    const replayed = measureRun(run, deps.resources);
    if (!replayed.ok) {
      skipped.push({ dispatcherProfileId: profileId, code: replayed.code, detail: replayed.detail });
      continue;
    }
    const placement = placeSubmission(run, HOUSE_USER_ID, fixture);
    boardKey = placement.key;
    const entry = await deps.store.recordEntry({
      boardKey: placement.key,
      dataHash: runDataHashOf(run, facts),
      userId: HOUSE_USER_ID,
      run,
      measured: replayed.measured,
      legs: replayed.legs,
      baselineProfileId: profileId,
    });
    seeded.push({ dispatcherProfileId: profileId, entryId: entry.id, awtS: replayed.measured.awtS, legs: replayed.legs });
  }
  return Object.freeze({ date, boardKey, seed: fixture.seed, seeded: Object.freeze(seeded), skipped: Object.freeze(skipped), elapsedMs: deps.now() - started });
}
