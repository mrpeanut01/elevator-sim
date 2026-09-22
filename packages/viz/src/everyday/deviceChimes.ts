/**
 * **The device chime ledger — turns in, a balance derived, and one thing it can spend on** —
 * [§ D711](../../../../DECISIONS.md) clauses 1–6 built, and its clause 7 amended by
 * [§ D911](../../../../DECISIONS.md). GitHub issue **#579**.
 *
 * ## What was wrong, and it was the whole of a first session
 *
 * `docs/38` § 2.4 makes chimes *"one currency earned by playing"* and § D526 makes them the thing
 * that carries a player between sittings. Served, none of it existed: `dev/main.ts` builds no
 * ledger client at all without an `apiOrigin` — and **the deployed bundle is built that way** — so
 * `bankCompletion` answered `no-server` on every clear and the Settings panel told the player
 * *"this build keeps none on this device"*. Every one of those sentences was true. A retention
 * loop that is scrupulously honest about not existing is still a retention loop that does not
 * exist.
 *
 * ## Turns, never a balance — § D711 clause 2, and the reason is not tidiness
 *
 * What is stored is the same vocabulary the wire already accepts (`core`'s `CHIME_COMPLETIONS`)
 * plus, per spend, what it bought. **The balance is derived on every read** from the shipped
 * table, so there is no stored number for a hostile edit to set, none for two readers to disagree
 * about, and no amount anywhere in this file — which is § D526 clause 6 expressed as a signature,
 * exactly as `core/config/chimeLedger.ts` expresses it: there is no function here that takes a
 * quantity of chimes from a caller.
 *
 * ## Why it may spend now, when § D711 § 5 said it may not
 *
 * That clause was a **measurement**, not a caution, and it said so: *"no sink reaches a run except
 * through what the server says the account owns … the day a device-reachable sink exists is the
 * day this clause is revisited, by a decision that cites a run rather than a plan."* One exists.
 * A scenario's budget is priced **by the scenario** — `docs/38` § 2.4, and
 * `core/config/chimeLedger.ts#REFUSED_MODIFIER_KINDS` refuses a second price for it by name — so a
 * rung is bought against a figure the content file authors and needs no route, no account and no
 * sink. `fixit/budgetRungs.ts` is the ladder and
 * `fixit/budgetRungReachesTheRun.test.ts` is the run that earns this paragraph: the same case at
 * the same seed, a repair the base budget refuses and the bought rung admits, compared on the
 * boarding legs.
 *
 * **The three ledger sinks are untouched by that and stay refused off an account**, each for its
 * own cause, which `everyday/chimesPanel.ts` draws per row. A scenario rung is not one of them and
 * may not become one.
 *
 * ## What is deliberately not here
 *
 * No source id — this module holds an {@link ChimeEarnTable}, which `core` projects the sources
 * away from before the viewer holds anything, on `chimeSpendTableOf`'s own rule and for
 * `boundaries.test.ts`' reason. No history a screen could draw, no *earned today*, no streak, no
 * gift: a gift has no completion and the play surface therefore cannot post one at all.
 *
 * Pure. The `localStorage` half is `everyday/chimeStore.ts`, on the split
 * `campaign/careerPersist.ts` / `everyday/careerStore.ts` already keeps.
 */

import {
  CHIME_COMPLETIONS,
  chimeEarnTableOf,
  parseChimeLedger,
  type ChimeCompletion,
  type ChimeEarnTable,
  type ChimeTurn,
} from '@elevator-sim/core/browser';

/*
 * Named `chimeLedgerDocument` rather than `document` — `boundaries.test.ts` confines the DOM to the
 * dev entry point by looking for bare globals, and a binding called `document` is one. The same
 * name `chimesPanel.ts` uses, for the same reason.
 */
import chimeLedgerDocument from '../../../../data/chime-ledger.json' with { type: 'json' };

/**
 * The shipped table's **earn half**, projected in one expression at module init.
 *
 * `chimeEarnTableOf` is applied to the parse expression itself, so no binding in this package ever
 * holds a table with sources on it — `chimesPanel.ts#CHIME_PRICES`' rule, and the review of PR
 * #485's finding is why it is a rule rather than a habit.
 */
export const CHIME_AWARDS: ChimeEarnTable = chimeEarnTableOf(parseChimeLedger(chimeLedgerDocument));

/** The slot this device keeps its turns in. */
export const DEVICE_CHIMES_KEY = 'elevator-sim.device-chimes.v1';
/** Where a record this build cannot read is set aside — `careerStore.ts`' shape and its reason. */
export const DEVICE_CHIMES_QUARANTINE_KEY = 'elevator-sim.device-chimes.quarantine';
/** The shape this build writes and reads. A record at another version is quarantined, never coerced. */
export const DEVICE_CHIMES_VERSION = 1;

/**
 * One finished turn, as this device recorded it.
 *
 * `key` is what makes a turn distinguishable from the same turn again — a fix case's id for a
 * scenario, the wave number for a rush — and it is **the empty string for a contract day**, which
 * is [§ D533](../../../../DECISIONS.md) clause 4 arriving as a field rather than as a caveat:
 * nothing on the wire can tell a second day from one day posted twice, so nothing here can either,
 * and a career day is therefore counted rather than de-duplicated. {@link withTurn} is where that
 * distinction lives and it is the clause to distrust first.
 */
export interface DeviceTurn {
  readonly completion: ChimeCompletion;
  readonly key: string;
}

/**
 * One rung this device bought, and the **only** kind of spend it can make.
 *
 * It names a scenario and a step on that scenario's own ladder, never a sink and never a price
 * from `data/chime-ledger.json` — the whole of why this is allowed to exist is that a scenario's
 * budget has one authority and it is the scenario. The `chimes` recorded is what that rung cost at
 * the moment it was bought, kept so a later rebalance of the content file cannot rewrite what a
 * player already paid.
 */
export interface DeviceSpend {
  readonly scenarioId: string;
  readonly stepId: string;
  readonly chimes: number;
}

/** What this device has finished and what it bought with it. No balance is stored — see the docstring. */
export interface DeviceChimeRecord {
  readonly version: number;
  readonly turns: readonly DeviceTurn[];
  readonly spends: readonly DeviceSpend[];
}

/** Nothing finished and nothing bought. What a device that has never played reads as. */
export function emptyDeviceChimes(): DeviceChimeRecord {
  return Object.freeze({ version: DEVICE_CHIMES_VERSION, turns: [], spends: [] });
}

/* -------------------------------------------------------------------------- *
 * The balance, derived
 * -------------------------------------------------------------------------- */

/**
 * What this device has earned, in whole chimes — the sum over its turns of the shipped award.
 *
 * A turn whose completion the table pays nothing for contributes nothing rather than throwing: a
 * record written by a build whose table named a fourth completion is a record this one can still
 * read, and silently paying it an invented award would be the one thing a derived balance exists
 * to make impossible.
 */
export function deviceEarnedOf(record: DeviceChimeRecord, awards: ChimeEarnTable = CHIME_AWARDS): number {
  return record.turns.reduce((sum, turn) => sum + (awards.awards[turn.completion] ?? 0), 0);
}

/** What this device has spent, in whole chimes — the sum of what each rung cost when it was bought. */
export function deviceSpentOf(record: DeviceChimeRecord): number {
  return record.spends.reduce((sum, spend) => sum + spend.chimes, 0);
}

/**
 * The balance a player reads, never below zero.
 *
 * Clamped rather than allowed to go negative, and the clamp is not defensive dressing: the stored
 * artefact is a file on the player's own machine, and a hand-edited record with a spend and no turn
 * would otherwise draw *"You have −6 chimes"*. A balance is a count of turns finished less what
 * they bought, and neither half of that can be negative.
 */
export function deviceBalanceOf(record: DeviceChimeRecord, awards: ChimeEarnTable = CHIME_AWARDS): number {
  return Math.max(0, deviceEarnedOf(record, awards) - deviceSpentOf(record));
}

/* -------------------------------------------------------------------------- *
 * Writing
 * -------------------------------------------------------------------------- */

/** The turn key for a posted completion — see {@link DeviceTurn.key} for why a day has none. */
export function turnKeyOf(turn: ChimeTurn): string {
  switch (turn.completion) {
    case 'scenario-cleared':
      return turn.scenarioId;
    case 'rush-wave-survived':
      return String(turn.waves);
    default:
      return '';
  }
}

/**
 * Record a finished turn, **first time only** where the turn has an identity.
 *
 * [§ D533](../../../../DECISIONS.md)'s rule, kept on the device rather than re-derived: a scenario
 * pays once and a rush pays only the waves beyond the best this device has seen, so a re-clear and
 * a replayed climb add nothing. Returns the record unchanged where nothing is owed, so a caller can
 * compare by identity to learn whether a turn was new.
 *
 * **A rush turn is recorded per wave rather than as a high-water mark**, because the award is per
 * wave: outlasting five waves after a best of three pays two. Each wave is its own key, so a second
 * run that reaches five pays nothing and a run that reaches seven pays the two above five.
 */
export function withTurn(record: DeviceChimeRecord, turn: ChimeTurn): DeviceChimeRecord {
  const add = (keys: readonly string[]): DeviceChimeRecord => {
    const held = new Set(
      record.turns.filter((held_) => held_.completion === turn.completion).map((held_) => held_.key),
    );
    const fresh = keys.filter((key) => !held.has(key));
    if (fresh.length === 0) return record;
    return Object.freeze({
      ...record,
      turns: Object.freeze([
        ...record.turns,
        ...fresh.map((key) => Object.freeze({ completion: turn.completion, key })),
      ]),
    });
  };
  if (turn.completion === 'rush-wave-survived') {
    if (!Number.isInteger(turn.waves) || turn.waves < 1) return record;
    return add(Array.from({ length: turn.waves }, (_, index) => String(index + 1)));
  }
  if (turn.completion === 'career-day-paid') {
    /*
     * No identity, so no de-duplication — § D533 clause 4 in the one place it can be honoured. The
     * key is the count of days already recorded, which makes each day its own row without claiming
     * to tell a second day from a re-post.
     */
    const days = record.turns.filter((held) => held.completion === 'career-day-paid').length;
    return add([String(days + 1)]);
  }
  return add([turnKeyOf(turn)]);
}

/** Why a rung could not be bought. Never `undefined` on a refusal — a caller draws this as it stands. */
export type DeviceSpendRefusal =
  /** The balance does not cover it. `shortBy` is the subtraction, in chimes. */
  | { readonly kind: 'short'; readonly shortBy: number }
  /** This device already bought this rung on this scenario. A second purchase would buy nothing. */
  | { readonly kind: 'owned' };

/** What {@link withSpend} answers: the record to keep, or why nothing was bought. */
export type DeviceSpendOutcome =
  | { readonly kind: 'bought'; readonly record: DeviceChimeRecord }
  | { readonly kind: 'refused'; readonly refusal: DeviceSpendRefusal };

/**
 * Buy a scenario's budget rung out of this device's tally.
 *
 * The price is the caller's, read off the scenario's own ladder, and this function neither knows
 * nor invents one — which is the same discipline `everyday/host.ts#spendChime` keeps against the
 * server, where the ledger prices the sink and the client names only what it wants. What this
 * function owns is the two refusals, and **both are computed here rather than drawn by the
 * screen**: a row that worked out its own shortfall would be a second arithmetic, which is what
 * `docs/22` non-goal 3 names one boundary over.
 */
export function withSpend(
  record: DeviceChimeRecord,
  spend: DeviceSpend,
  awards: ChimeEarnTable = CHIME_AWARDS,
): DeviceSpendOutcome {
  const owned = record.spends.some(
    (held) => held.scenarioId === spend.scenarioId && held.stepId === spend.stepId,
  );
  if (owned) return { kind: 'refused', refusal: { kind: 'owned' } };
  const balance = deviceBalanceOf(record, awards);
  if (balance < spend.chimes) {
    return { kind: 'refused', refusal: { kind: 'short', shortBy: spend.chimes - balance } };
  }
  return {
    kind: 'bought',
    record: Object.freeze({ ...record, spends: Object.freeze([...record.spends, spend]) }),
  };
}

/** Which rung of a scenario's ladder this device has bought, or `undefined` for the base. */
export function boughtStepIdOf(record: DeviceChimeRecord, scenarioId: string): string | undefined {
  const bought = record.spends.filter((spend) => spend.scenarioId === scenarioId);
  return bought[bought.length - 1]?.stepId;
}

/* -------------------------------------------------------------------------- *
 * The envelope
 * -------------------------------------------------------------------------- */

/** Why a stored record was not read. `empty` is not a refusal — there was nothing there. */
export type DeviceChimeRefusal = 'empty' | 'unreadable' | 'wrong-shape' | 'wrong-version';

/** What a load answers: a record, and a refusal where the stored bytes were not it. */
export interface DeviceChimeLoad {
  readonly record: DeviceChimeRecord;
  readonly refusal: DeviceChimeRefusal | undefined;
}

function isTurn(raw: unknown): raw is DeviceTurn {
  if (typeof raw !== 'object' || raw === null) return false;
  const row = raw as Record<string, unknown>;
  return (
    typeof row['key'] === 'string' &&
    (CHIME_COMPLETIONS as readonly string[]).includes(String(row['completion']))
  );
}

function isSpend(raw: unknown): raw is DeviceSpend {
  if (typeof raw !== 'object' || raw === null) return false;
  const row = raw as Record<string, unknown>;
  return (
    typeof row['scenarioId'] === 'string' &&
    typeof row['stepId'] === 'string' &&
    typeof row['chimes'] === 'number' &&
    Number.isInteger(row['chimes']) &&
    row['chimes'] >= 0
  );
}

/**
 * Read a stored record, or say why not.
 *
 * **Quarantine rather than coerce**, `campaign/careerPersist.ts`' rule: a record this build cannot
 * read is a record the player still has, and a build that repaired it in place would delete a
 * tally an older or newer build could still show them. A row that is not a turn is dropped and the
 * whole record refused — a partially-read ledger is a balance nobody can account for, which is
 * exactly what deriving the balance exists to prevent.
 */
export function decodeDeviceChimes(raw: string | null): DeviceChimeLoad {
  if (raw === null || raw === '') return { record: emptyDeviceChimes(), refusal: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { record: emptyDeviceChimes(), refusal: 'unreadable' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    /*
     * An array is named here rather than falling through to the version check, and the difference
     * is what a reader is told: *this is not a record* and *this is a record from another build*
     * are different faults, and only the second is worth a player reinstalling nothing over.
     */
    return { record: emptyDeviceChimes(), refusal: 'wrong-shape' };
  }
  const row = parsed as Record<string, unknown>;
  if (row['version'] !== DEVICE_CHIMES_VERSION) {
    return { record: emptyDeviceChimes(), refusal: 'wrong-version' };
  }
  const turns = row['turns'];
  const spends = row['spends'];
  if (!Array.isArray(turns) || !Array.isArray(spends)) {
    return { record: emptyDeviceChimes(), refusal: 'wrong-shape' };
  }
  if (!turns.every(isTurn) || !spends.every(isSpend)) {
    return { record: emptyDeviceChimes(), refusal: 'wrong-shape' };
  }
  return {
    record: Object.freeze({
      version: DEVICE_CHIMES_VERSION,
      turns: Object.freeze(turns.map((turn) => Object.freeze({ ...turn }))),
      spends: Object.freeze(spends.map((spend) => Object.freeze({ ...spend }))),
    }),
    refusal: undefined,
  };
}

/** Write a record to the bytes {@link decodeDeviceChimes} reads. */
export function encodeDeviceChimes(record: DeviceChimeRecord): string {
  return JSON.stringify({
    version: DEVICE_CHIMES_VERSION,
    turns: record.turns,
    spends: record.spends,
  });
}
