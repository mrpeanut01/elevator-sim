/// <reference types="node" />

/**
 * The chime ledger's policy: what a completed turn is worth, what a modifier costs, and whether a
 * posted run's modifiers were ever paid for — GitHub issue **#368**,
 * [§ D526](../../../../DECISIONS.md), [§ D530](../../../../DECISIONS.md),
 * [§ D531](../../../../DECISIONS.md), `docs/38` § 2.4.
 *
 * `store.ts` owns the arithmetic and the race; this owns the **table**. The split is the one
 * `leaderboard/verify.ts` and `store.ts#recordEntry` already draw: the store decides whether a row
 * can be written, and a module beside it decides what the row should say.
 *
 * ## The boundary, and it is the whole design
 *
 * [§ D526](../../../../DECISIONS.md) clause 5: *the play surface reads one balance and posts two
 * verbs, earn and spend, and never knows a source.* Three things follow, and every one of them is
 * mechanical rather than a habit:
 *
 * - **A client names a completion, never a source.** {@link earnCompletion} takes a
 *   `ChimeCompletion` — one of three strings, closed in `core`'s own vocabulary — and the table
 *   turns it into a source. The sign-in gift is a source with no completion, so there is no
 *   completion a client could name that would reach it, and {@link awardSignInGift} is called by
 *   the redemption route rather than by anything a request chooses.
 * - **A client names a turn, and a turn is not an amount** — GitHub issue #499. First time only needs
 *   to know *which* scenario was cleared and *how many* waves a rush outlasted; {@link earnCompletion}
 *   takes both as a `ChimeTurn`, bounds each by what the shipped build can produce
 *   ({@link ChimeTurnBounds}), and still reads every award out of the table.
 * - **A client never names an amount.** Neither verb has a chimes argument. What an earn pays and
 *   what a spend costs are read out of `data/chime-ledger.json`. A purchase is, mechanically, a
 *   client naming an amount, so this absence is [§ D526](../../../../DECISIONS.md) clause 6
 *   expressed as a function signature rather than as a rule somebody has to remember.
 * - **Nothing here can enumerate an account's entries.** The store can, because the store is the
 *   ledger; there is no function in this module that returns one, and `http/api.ts` serves a
 *   balance and nothing else. An external add would be one more source on the same ledger and
 *   nothing on the play surface would move, which is the property clause 5 was built for.
 *
 * ## What a posted modified run is checked against
 *
 * {@link unbackedModifiers} is the acceptance criterion *the server checks a posted modified run
 * against a real spend* in one function. A submission may claim modifiers; the account's spends say
 * what it actually bought; a claim that exceeds what was bought is refused **by sink**, because a
 * budget bought in two steps and a budget bought in one are the same budget and a run that claims
 * three steps against two paid for is a run whose configuration was never affordable.
 *
 * **The board half of that has landed and this paragraph used to refuse it.** It read *"two runs
 * with different modifier sets still rank on the same board"*, and GitHub issue #371 made that
 * false: `leaderboard/boardKey.ts#placeSubmission` keys the daily board by the set, and
 * `#runDataHashOf` carries it into the measurement identity. § D227 says a refusal that stops being
 * true is **deleted rather than reworded**, so it is gone rather than softened — a sentence telling
 * a reader that two purses rank together would send them to build a separation that exists.
 *
 * **What is still not built, stated narrowly so it is not read as the whole gap coming back.**
 * `docs/16`'s `ranked` row and `scope/runIdentity.ts` do not carry the modifier set, and cannot:
 * no field of `viz`'s `ViewerState` holds a modifier, because no mode spends a purse into a run
 * yet. That is GitHub issue #372's, and `docs/16` § 3 says the same thing where a reader of the
 * contract will meet it.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  chimeAwardFor,
  chimeGiftSource,
  chimeGrantUnits,
  chimeSinkById,
  chimeSpendPrice,
  parseChimeLedger,
  type ChimeLedgerTable,
  type ChimeTurn,
  type TrafficProfiles,
} from '@elevator-sim/core';

import type { ChimeSpentModifier, Store } from '../store/store.js';

/** What `data/` calls the ledger. Private: {@link loadChimeLedger} is the only thing that needs it. */
const CHIME_LEDGER_FILE = 'chime-ledger.json';

/** Read and validate `<dataDir>/chime-ledger.json`. Throws, because a server with no table has no ledger. */
export async function loadChimeLedger(dataDir: string): Promise<ChimeLedgerTable> {
  const raw = await readFile(join(dataDir, CHIME_LEDGER_FILE), 'utf8');
  return parseChimeLedger(JSON.parse(raw) as unknown);
}

/** What a verb did, or why it did nothing. Never an exception: a refusal is an answer. */
export type ChimeOutcome =
  | { readonly ok: true; readonly balanceChimes: number }
  | { readonly ok: false; readonly reason: ChimeRefusal };

/**
 * Why a verb was refused.
 *
 * `not-enough-chimes` is the only one a player can reach by playing; the others are a client
 * naming something the shipped table does not sell, which is a build mismatch rather than a
 * shortfall and reads differently on the wire.
 */
export type ChimeRefusal =
  | 'unknown-completion'
  | 'unknown-scenario'
  | 'unknown-wave'
  | 'unknown-modifier'
  | 'not-enough-chimes';

/**
 * The template `data/traffic-profiles.json` authors for the rush. It is
 * `packages/viz/src/everyday/rush.ts#RUSH_TEMPLATE_ID`'s literal, which this package may not import;
 * a rename there fails {@link loadChimeTurnBounds} at boot rather than bounding nothing.
 */
const RUSH_TEMPLATE_ID = 'endless-rush';

/**
 * Which turns a shipped build will pay for — GitHub issue **#499**.
 *
 * First time only needs a turn to have a name, and a name a client can invent is a turn a client can
 * farm: an unbounded scenario id pays for `a`, `b`, `c` … once each, which is every post paying again
 * with extra steps. So the names are the shipped ones and nothing else, and a wave count stops at the
 * waves the stream generates.
 */
export interface ChimeTurnBounds {
  /** Every scenario a shipped path can clear: the week's contracts and the fix cases, by id. */
  readonly scenarioIds: ReadonlySet<string>;
  /** How many waves the rush's stream generates — the most a run can outlast before it breaks. */
  readonly rushWaves: number;
}

/**
 * How many waves `endless-rush` generates, counted off the template rather than transcribed — or
 * `undefined` when the profiles carry no such template, or one with no waves in it.
 *
 * A wave is a phase whose intensity holds: the stream holds each wave's rate and climbs to the next
 * over a phase of its own, and the last wave holds to the end. `packages/viz/src/everyday/rush.test.ts`
 * pins these holds against `rushScreenModel.ts#LAST_GENERATED_WAVE` on the other side of the package
 * boundary, and `chimes/ledger.test.ts` pins this count on the shipped template, so the two readings
 * meet in `data/` rather than in a transcription.
 */
export function rushWaveCountOf(profiles: TrafficProfiles): number | undefined {
  const template = profiles.demandTemplates.find((candidate) => candidate.id === RUSH_TEMPLATE_ID);
  const holds = (template?.phases ?? []).filter((phase) => phase.startIntensity === phase.endIntensity).length;
  return holds > 0 ? holds : undefined;
}

/**
 * Read the turns a shipped build pays for, at boot — GitHub issue **#499**.
 *
 * The scenario ids come from `data/contract-ladder.json` (the week's contracts, each keyed
 * `contractId`) and `data/fixit-cases.json` (the fix cases, each keyed `id`): the two kinds of
 * scenario a shipped path files a clear for. Only the ids are read, because the documents' shapes are
 * the viewer's to validate and this package may not import that validation.
 *
 * **Throws**, on {@link loadChimeLedger}'s ground: a server that cannot say which turns it pays would
 * refuse every scenario clear at the moment a player finished one. It refuses a missing or empty
 * list, an entry with no id, an id named twice, an id both documents claim — one clear would then
 * name two scenarios — and a rush it cannot count.
 */
export async function loadChimeTurnBounds(dataDir: string, profiles: TrafficProfiles): Promise<ChimeTurnBounds> {
  const [contracts, cases] = await Promise.all([
    idsIn(join(dataDir, 'contract-ladder.json'), 'contracts', 'contractId'),
    idsIn(join(dataDir, 'fixit-cases.json'), 'cases', 'id'),
  ]);
  const shared = contracts.filter((id) => cases.includes(id));
  if (shared.length > 0) {
    throw new Error(
      `chime turns: ${shared.join(', ')} is both a contract and a fix case, so one clear would name two scenarios.`,
    );
  }
  const rushWaves = rushWaveCountOf(profiles);
  if (rushWaves === undefined) {
    throw new Error(
      `chime turns: the traffic profiles carry no "${RUSH_TEMPLATE_ID}" template with waves in it, so no rush result can be bounded.`,
    );
  }
  return Object.freeze({ scenarioIds: new Set([...contracts, ...cases]), rushWaves });
}

/** The `field` of every entry in one document's list, refusing the shapes {@link loadChimeTurnBounds} names. */
async function idsIn(path: string, key: string, field: string): Promise<readonly string[]> {
  const document = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown> | null;
  const entries: unknown = document?.[key];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`chime turns: ${path} has no "${key}" list, so none of its scenarios could be paid.`);
  }
  const ids: unknown[] = entries.map((entry: unknown) => (entry as Record<string, unknown> | null)?.[field]);
  const missing = ids.findIndex((id) => typeof id !== 'string' || id === '');
  if (missing !== -1) throw new Error(`chime turns: ${path} ${key}[${String(missing)}] has no ${field}.`);
  const named = ids as string[];
  const repeated = named.filter((id, index) => named.indexOf(id) !== index);
  if (repeated.length > 0) throw new Error(`chime turns: ${path} names ${repeated.join(', ')} twice.`);
  return named;
}

/**
 * Bank a completed turn, at the flat award the table names for it — and a scenario or a rush wave
 * **once per account**.
 *
 * ## First time only — GitHub issue #499, the owner's ruling of 2026-09-10
 *
 * - **A scenario pays once per account.** The entry carries the scenario id as its turn, and
 *   `store.ts#recordChimeEntry` refuses a second entry for that turn in the same statement that
 *   writes it, so a second clear — posted later, or twice at once — answers the balance and pays
 *   nothing.
 * - **A rush pays only the waves beyond the account's best.** Each wave outlasted is its own turn,
 *   numbered from one, so the account's best is the waves already paid rather than a second figure
 *   that could disagree with them. A run that beats the best writes the waves above it; one that
 *   does not writes none.
 * - **A contract day is untouched.** The ruling does not reach it, and nothing here can tell a second
 *   day from one day posted twice.
 *
 * Every entry is the table's flat award whatever the run measured, which is § D526 clause 2: a wave
 * count is a count of turns, and nothing else a run measured reaches this function.
 *
 * **What is unchecked, and first-time-only is the cap on it:** nothing here can tell whether the
 * clear happened or the rush got that far. A client can post every shipped scenario once and a rush
 * at the stream's last wave once, and be paid for each exactly once.
 *
 * ## The band that used to be here, and why it is not
 *
 * This function took a `bandId` and paid a scenario more for being hard, and this docstring called
 * that band *"the scenario's own pre-simulated survivor band … a property of the scenario and known
 * before anybody plays"*. **That was false about the code beside it.** The band arrived verbatim in
 * the earn request's body — `http/api.ts` read `body.band` and passed it here — so a client could
 * post `single` on the easiest scenario and be paid ten instead of four. Nor could it have been
 * derived: `data/scenario-survivors.json` carries survivor **counts** and no band, nothing anywhere
 * maps a count to one, and this route was not then told which scenario was cleared.
 *
 * [§ D256](../../../../DECISIONS.md) decides what happens next — a stated mechanism is measured or
 * **withdrawn**, and a second plausible sentence in its place is the same defect with new wording.
 * So the argument is gone rather than validated, because a validated band is still a band the payee
 * chose, and `data/chime-ledger.json`'s parser refuses a `bands` key by name so the table cannot
 * grow one back without the mapping arriving with it.
 *
 * What would bring it back, in order: a band on each scenario's pinned record (or a boundary table
 * turning `survivors` into one), and this function resolving the band from that record by the
 * scenario id the earn now carries (#499) rather than from the request. The id alone maps to no band.
 */
export async function earnCompletion(input: {
  readonly store: Store;
  readonly table: ChimeLedgerTable;
  readonly bounds: ChimeTurnBounds;
  readonly userId: string;
  readonly turn: ChimeTurn;
}): Promise<ChimeOutcome> {
  const { store, table, bounds, userId, turn } = input;
  const award = chimeAwardFor(table, turn.completion);
  const source = table.sources.find(
    (candidate) => candidate.earnedBy === 'completion' && candidate.completion === turn.completion,
  );
  if (award === undefined || source === undefined) return { ok: false, reason: 'unknown-completion' };
  const entry = { userId, direction: 'earn', entryKey: source.id, chimes: award } as const;
  switch (turn.completion) {
    case 'career-day-paid': {
      const written = await store.recordChimeEntry(entry);
      /*
       * An earn with no turn cannot be refused by the balance — it only ever moves it up — so
       * `undefined` here is unreachable. Answered rather than asserted, so a future guard on this
       * statement refuses instead of reporting a balance nobody wrote.
       */
      return written === undefined
        ? { ok: false, reason: 'unknown-completion' }
        : { ok: true, balanceChimes: written.balanceAfter };
    }
    case 'scenario-cleared': {
      if (!bounds.scenarioIds.has(turn.scenarioId)) return { ok: false, reason: 'unknown-scenario' };
      const written = await store.recordChimeEntry({ ...entry, turnKey: turn.scenarioId });
      /* `undefined` is the clear already paid: answered with the balance, because re-posting is not a fault. */
      return { ok: true, balanceChimes: written?.balanceAfter ?? (await store.chimeBalance(userId)) };
    }
    case 'rush-wave-survived': {
      if (!Number.isInteger(turn.waves) || turn.waves < 1 || turn.waves > bounds.rushWaves) {
        return { ok: false, reason: 'unknown-wave' };
      }
      /*
       * Ascending, so the waves paid are always a run from one: a write that fails part-way leaves
       * the best where the last written wave put it, and the next post pays the rest. The read is a
       * shortcut past waves already paid; the statement's turn clause is the guard.
       */
      const paid = await store.chimeTurnKeys(userId, source.id);
      for (let wave = 1; wave <= turn.waves; wave += 1) {
        if (!paid.has(String(wave))) await store.recordChimeEntry({ ...entry, turnKey: String(wave) });
      }
      return { ok: true, balanceChimes: await store.chimeBalance(userId) };
    }
  }
}

/**
 * Buy `steps` of one modifier.
 *
 * The price comes from the table and the balance check happens inside one statement in the store,
 * so there is no moment at which a second request can spend the same chimes. A refusal writes
 * nothing, which is why {@link unbackedModifiers} can treat the spends as the whole truth.
 */
export async function spendOnModifier(input: {
  readonly store: Store;
  readonly table: ChimeLedgerTable;
  readonly userId: string;
  readonly sinkId: string;
  readonly steps: number;
}): Promise<ChimeOutcome & { readonly grantUnits?: number }> {
  const sink = chimeSinkById(input.table, input.sinkId);
  if (sink === undefined) return { ok: false, reason: 'unknown-modifier' };
  const price = chimeSpendPrice(sink, input.steps);
  if (price === undefined) return { ok: false, reason: 'unknown-modifier' };
  const written = await input.store.recordChimeEntry({
    userId: input.userId,
    direction: 'spend',
    entryKey: sink.id,
    chimes: price,
    modifier: { sinkId: sink.id, steps: input.steps },
  });
  if (written === undefined) return { ok: false, reason: 'not-enough-chimes' };
  return {
    ok: true,
    balanceChimes: written.balanceAfter,
    grantUnits: chimeGrantUnits(sink, input.steps),
  };
}

/**
 * The sign-in gift — [§ D531](../../../../DECISIONS.md), and its three promises are kept by the
 * statement rather than by this function.
 *
 * *It does not compound* and *there is no streak* are one property: the store refuses a second gift
 * inside the source's own `awayHours` window, so calling this on every redemption is safe and a
 * player who signs in four times in an evening is given one gift. *Missing it costs nothing* is the
 * absence of any other code — nothing anywhere reduces a balance because time passed, which is
 * [§ D526](../../../../DECISIONS.md) clause 4.
 *
 * Silent by construction: it returns nothing and the redemption route does not report it. A gift
 * that announced itself on a results page would be the currency figure clause 3 forbids, and a gift
 * the player has to acknowledge is a timer wearing a bow.
 */
export async function awardSignInGift(input: {
  readonly store: Store;
  readonly table: ChimeLedgerTable;
  readonly userId: string;
}): Promise<void> {
  const gift = chimeGiftSource(input.table);
  if (gift === undefined || gift.awayHours === undefined) return;
  await input.store.recordChimeEntry({
    userId: input.userId,
    direction: 'earn',
    entryKey: gift.id,
    chimes: gift.awardChimes,
    notWithinMs: gift.awayHours * 60 * 60 * 1000,
  });
}

/** One modifier a submission says its run was played with. The wire shape, and nothing else. */
export interface ClaimedModifier {
  readonly sinkId: string;
  readonly steps: number;
}

/**
 * Whether a submission's `modifiers` field is a list of modifier claims at all.
 *
 * The cheap gate, on `submissionIssues`'s own ground: *an unauthenticated shape error must not be
 * able to command a simulation*, and here it must not be able to command a database read either.
 */
export function claimedModifierIssues(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return ['modifiers must be an array when it is present'];
  if (value.length > 16) return ['modifiers must name at most 16 modifiers'];
  const issues: string[] = [];
  for (const [index, entry] of value.entries()) {
    const at = `modifiers[${String(index)}]`;
    if (typeof entry !== 'object' || entry === null) {
      issues.push(`${at} must be an object`);
      continue;
    }
    const claim = entry as Partial<Record<'sinkId' | 'steps', unknown>>;
    if (typeof claim.sinkId !== 'string' || claim.sinkId === '') issues.push(`${at}.sinkId must be a name`);
    if (typeof claim.steps !== 'number' || !Number.isInteger(claim.steps) || claim.steps < 1) {
      issues.push(`${at}.steps must be a whole number of steps, at least one`);
    }
  }
  return issues;
}

/**
 * Which claimed modifiers this account never paid for — **the run-against-a-real-spend check**.
 *
 * Compared **by sink and summed**, because a budget bought in two steps and a budget bought in one
 * are the same budget: what matters is that the run did not claim more of a sink than the ledger
 * says was bought. A modifier the account bought and this run does not claim is not an error; a
 * spend is permanent and a player may play a standard run afterwards.
 *
 * ## Two bounds, and the second one was missing
 *
 * `ChimeSink.maxSteps` says *how many times **one run** may buy this*. `chimeSpendPrice` refuses a
 * **spend** above it, and that was the whole of the enforcement — so an account that bought a sink
 * twice at its cap could post a run claiming twice the cap and be believed, and `rush-prefit`,
 * whose note is *"one step only — a building is fitted or it is not"*, accepted two. The
 * accumulation is correct on the *spends*: a spend is permanent and a player plays many runs. It is
 * the **claim** that is per-run, so the cap belongs here, which is why this needs the table.
 *
 * A sink the shipped table does not sell is unbacked whatever was bought, rather than being given
 * an unknown cap and waved through.
 *
 * Empty means every claim is backed. A non-empty answer is a refusal, and it names the sinks so the
 * player is told which claim the ledger cannot support rather than that something was wrong.
 */
export function unbackedModifiers(
  claimed: readonly ClaimedModifier[],
  bought: readonly ChimeSpentModifier[],
  table: ChimeLedgerTable,
): readonly string[] {
  const boughtSteps = new Map<string, number>();
  for (const spend of bought) {
    boughtSteps.set(spend.sinkId, (boughtSteps.get(spend.sinkId) ?? 0) + spend.steps);
  }
  const claimedSteps = new Map<string, number>();
  for (const claim of claimed) {
    claimedSteps.set(claim.sinkId, (claimedSteps.get(claim.sinkId) ?? 0) + claim.steps);
  }
  const unbacked: string[] = [];
  for (const [sinkId, steps] of claimedSteps) {
    const sink = chimeSinkById(table, sinkId);
    if (sink === undefined || steps > sink.maxSteps || steps > (boughtSteps.get(sinkId) ?? 0)) {
      unbacked.push(sinkId);
    }
  }
  return Object.freeze(unbacked.sort((a, b) => a.localeCompare(b)));
}
