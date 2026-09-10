/**
 * The chime balance a player actually meets — GitHub issue **#368**,
 * [§ D526](../../../../DECISIONS.md) clause 5, [§ D530](../../../../DECISIONS.md), `docs/38` § 2.4.
 *
 * ## One read, and it is the only thing this side of the wire knows
 *
 * *The play surface reads one balance and posts two verbs, earn and spend, and never knows a
 * source.* This module is the read. It takes a number and the state of the account and produces the
 * words; it has no idea where any of the number came from, and there is nothing in `viz` that
 * could tell it — the sources are the server's own vocabulary and `boundaries.test.ts` asserts that
 * no module here names one. That is not tidiness. It is the property an add from outside would rely
 * on: one more source on the ledger moves this number and nothing else, because there is nothing
 * else here to move.
 *
 * **What it therefore cannot draw, and the absence is the design.** No history, no *where this came
 * from*, no *earned today*, no streak, no next reward. A screen that could draw any of those would
 * have had to be handed a source.
 *
 * ## Without an account, and it says so in the player's words
 *
 * `docs/38` § 2.4: *without an account the ledger is on this device alone, says so in the tree's
 * existing device-only shape, and a run played with device-only chimes can be played and not
 * posted.* Both halves are on the face of the panel rather than in a note somebody might not read,
 * and the second half is the one that matters — a player who spends on this device and then finds
 * their run refused by a board has been misled, so the panel says it before they spend.
 *
 * ## Prices, and never a price in money
 *
 * The sinks are drawn with what they cost **in chimes**, from `data/chime-ledger.json`, because
 * *widen this budget: 12 chimes* is one of the two sentences [§ D530](../../../../DECISIONS.md)
 * chose the name against. There is no other kind of price in this file and no field in the table
 * that could carry one — the parser refuses an unrecognised key by name, citing the decision that
 * refuses it.
 *
 * ## The document is bundled rather than fetched
 *
 * `shift/ladder.ts`'s precedent and its reason: the table is pinned to the commit by construction,
 * so the price a screen draws and the price the server charges cannot drift apart between a deploy
 * and a cache. `wrinkles/library.ts` makes the same choice for the same reason.
 */

import { parseChimeLedger, type ChimeLedgerTable, type ChimeSink } from '@elevator-sim/core/browser';

/*
 * Named `chimeLedgerDocument` rather than `document`: `boundaries.test.ts` confines the DOM to the
 * dev entry point by looking for bare globals, and a binding called `document` is one.
 */
import chimeLedgerDocument from '../../../../data/chime-ledger.json' with { type: 'json' };

/** The shipped table, parsed once at module init. */
export const CHIME_LEDGER: ChimeLedgerTable = parseChimeLedger(chimeLedgerDocument);

/** Where the balance is kept, from the player's point of view. */
export type ChimesHome =
  /** Signed in: the account holds it, and runs bought with it can be posted. */
  | 'account'
  /** Not signed in: this device holds it, and runs bought with it cannot be posted. */
  | 'device'
  /** The account bridge has not answered yet, which is a real window a player can meet. */
  | 'booting';

/** One thing chimes can be spent on, as a row a player reads. */
export interface ChimesSpendRowView {
  readonly id: string;
  /** What the button says — *Widen this budget*. */
  readonly name: string;
  /** *12 chimes*, in the currency's own words and never in money. */
  readonly price: string;
  /** Whether the balance in hand covers one step of it. */
  readonly affordable: boolean;
}

/** § 15.1's account block gains a tally — the balance, where it lives, and what it buys. */
export interface ChimesPanelView {
  readonly heading: string;
  /** *You have 40 chimes.* The one read, and the whole of it. */
  readonly balanceLine: string;
  /** What chimes are and are not, in two sentences a player meets once. */
  readonly lede: string;
  /** Where the tally lives, and — off an account — that its runs cannot be posted. */
  readonly homeNote: string;
  readonly spendHeading: string;
  readonly rows: readonly ChimesSpendRowView[];
}

/**
 * Every sentence this panel can say, in one object.
 *
 * Kept as a constant rather than inlined so that `honesty/surfaces.ts` can iterate it generically —
 * the shape `BOARD_SCREEN_COPY` and `CAMPAIGN_DOCK_COPY` already have — and so that a reader
 * looking for the words a player meets finds them in one place.
 */
export const CHIMES_PANEL_COPY = Object.freeze({
  heading: 'CHIMES',
  lede:
    'Chimes are what finishing something pays you. Spend them to widen what a scenario, a tower ' +
    'or a rush lets you reach. Nothing about them changes while you are away — none of this ' +
    'refills, runs out, or asks you to come back on a particular day.',
  spendHeading: 'WHAT THEY BUY',
  accountHome:
    'Your tally lives with your account, so it follows you to whatever you sign in on next, and a ' +
    'run you widened can be posted like any other.',
  deviceHome:
    'You are not signed in, so this tally is kept on this device alone. Anything you spend it on ' +
    'is yours to play, and those runs cannot be posted to a board — a board only ranks runs an ' +
    'account stands behind. Sign in above and the tally moves with you.',
  bootingHome: 'Still finding out whether you are signed in, so this tally may yet change hands.',
  none: 'You have no chimes yet. Finishing anything is what pays them.',
});

/** *You have 40 chimes.* Singular where it should be, because a player meets this sentence often. */
function balanceLineOf(table: ChimeLedgerTable, balanceChimes: number): string {
  if (balanceChimes <= 0) return CHIMES_PANEL_COPY.none;
  const unit = balanceChimes === 1 ? table.currency.one : table.currency.many;
  return `You have ${String(balanceChimes)} ${unit}.`;
}

/** *Widen this budget: 12 chimes.* */
function priceOf(table: ChimeLedgerTable, sink: ChimeSink): string {
  const unit = sink.priceChimes === 1 ? table.currency.one : table.currency.many;
  return `${String(sink.priceChimes)} ${unit}`;
}

/** What this panel needs, and it is deliberately three fields. */
export interface ChimesPanelInput {
  /** The one read. Zero for an account with nothing banked, and for a device with no tally. */
  readonly balanceChimes: number;
  readonly home: ChimesHome;
  /** Overridden by the corpus and by tests; the shipped table otherwise. */
  readonly table?: ChimeLedgerTable | undefined;
}

/**
 * The panel for this state. Total: every sentence a player can meet starts here.
 *
 * **No arm of this function knows a source**, and none can be added that does — the input is a
 * number and a home, and neither carries one.
 */
export function chimesPanelViewOf(input: ChimesPanelInput): ChimesPanelView {
  const table = input.table ?? CHIME_LEDGER;
  const balance = Math.max(0, Math.trunc(input.balanceChimes));
  const homeNote =
    input.home === 'account'
      ? CHIMES_PANEL_COPY.accountHome
      : input.home === 'device'
        ? CHIMES_PANEL_COPY.deviceHome
        : CHIMES_PANEL_COPY.bootingHome;
  return {
    heading: CHIMES_PANEL_COPY.heading,
    balanceLine: balanceLineOf(table, balance),
    lede: CHIMES_PANEL_COPY.lede,
    homeNote,
    spendHeading: CHIMES_PANEL_COPY.spendHeading,
    rows: table.sinks.map((sink) => ({
      id: sink.id,
      name: sink.name,
      price: priceOf(table, sink),
      affordable: balance >= sink.priceChimes,
    })),
  };
}
