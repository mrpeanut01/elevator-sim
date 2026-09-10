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
 * **What this does not build, stated so nobody reads it as built.** `docs/38` § 3 also asks that
 * `docs/16`'s `ranked` row and `scope/runIdentity.ts` widen to carry the modifier set, and that
 * boards be *keyed* by it. That is separate work: a modifier is checked here and is not yet part of
 * a run's identity, so two runs with different modifier sets still rank on the same board. Until it
 * lands, a bought purse is refused when it is claimed and unpaid, and is not yet separated on the
 * ladder.
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
  type ChimeCompletion,
  type ChimeLedgerTable,
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
export type ChimeRefusal = 'unknown-completion' | 'unknown-modifier' | 'not-enough-chimes';

/**
 * Bank a completed turn, at the flat award the table names for it.
 *
 * ## The band that used to be here, and why it is not
 *
 * This function took a `bandId` and paid a scenario more for being hard, and this docstring called
 * that band *"the scenario's own pre-simulated survivor band … a property of the scenario and known
 * before anybody plays"*. **That was false about the code beside it.** The band arrived verbatim in
 * the earn request's body — `http/api.ts` read `body.band` and passed it here — so a client could
 * post `single` on the easiest scenario and be paid ten instead of four. Nor could it have been
 * derived: `data/scenario-survivors.json` carries survivor **counts** and no band, nothing anywhere
 * maps a count to one, and this route is never told which scenario was cleared.
 *
 * [§ D256](../../../../DECISIONS.md) decides what happens next — a stated mechanism is measured or
 * **withdrawn**, and a second plausible sentence in its place is the same defect with new wording.
 * So the argument is gone rather than validated, because a validated band is still a band the payee
 * chose, and `data/chime-ledger.json`'s parser refuses a `bands` key by name so the table cannot
 * grow one back without the mapping arriving with it.
 *
 * What would bring it back, in order: a band on each scenario's pinned record (or a boundary table
 * turning `survivors` into one), a scenario id on the earn, and this function resolving the band
 * from the record rather than from the request.
 */
export async function earnCompletion(input: {
  readonly store: Store;
  readonly table: ChimeLedgerTable;
  readonly userId: string;
  readonly completion: ChimeCompletion;
}): Promise<ChimeOutcome> {
  const { table, completion } = input;
  const award = chimeAwardFor(table, completion);
  if (award === undefined) return { ok: false, reason: 'unknown-completion' };
  const source = table.sources.find(
    (candidate) => candidate.earnedBy === 'completion' && candidate.completion === completion,
  );
  if (source === undefined) return { ok: false, reason: 'unknown-completion' };
  const written = await input.store.recordChimeEntry({
    userId: input.userId,
    direction: 'earn',
    entryKey: source.id,
    chimes: award,
  });
  /*
   * An earn cannot be refused by the balance — it only ever moves it up — so `undefined` here is
   * unreachable. Answered rather than asserted, so a future guard on this statement refuses instead
   * of reporting a balance nobody wrote.
   */
  return written === undefined
    ? { ok: false, reason: 'unknown-completion' }
    : { ok: true, balanceChimes: written.balanceAfter };
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
