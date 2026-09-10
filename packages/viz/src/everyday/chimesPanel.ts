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
 * ## Without an account there is no tally, and the panel says **that** rather than the opposite
 *
 * `docs/38` § 2.4 asks for a device-only ledger that *"says so in the tree's existing device-only
 * shape"*. **The face shipped and the ledger did not.** The panel told a signed-out player their
 * tally was *"kept on this device alone"* while nothing in `packages/viz/src` stored or spent a
 * chime on the device at all — `everyday/profile.ts` owns `localStorage` and has no chime field —
 * so off an account the balance was a hard zero that nothing could move, described as a store.
 *
 * That is [§ D227](../../../../DECISIONS.md) with its polarity reversed, which `CLAUDE.md` names as
 * the worse half: *a control that writes nothing must say so, and a control that writes something
 * may not claim it writes nothing.* A screen describing a mechanism that does not exist is the
 * second sentence's shape, and the honesty corpus cannot catch it — it asks whether a string is
 * internally consistent, never whether the thing it describes is real.
 *
 * **So the sentence changed rather than the store.** Building a device ledger would mean deciding
 * what happens to a device balance when an account arrives (merge? discard? which wins?), and that
 * is a ruling rather than a lane's choice. The panel now says there is no tally until you sign in,
 * which is true today and stops being drawn the moment a device ledger exists.
 *
 * ## Prices, and never a price in money — and none of them buyable yet
 *
 * The sinks are drawn with what they cost **in chimes**, from `data/chime-ledger.json`, because
 * *top up this tower's purse: 10 chimes* is one of the two sentences
 * [§ D530](../../../../DECISIONS.md) chose the name against. There is no other kind of price in
 * this file and no field in the table that could carry one — the parser refuses an unrecognised key
 * by name, citing the decision that refuses it.
 *
 * **And the panel says, on its own face, that none of them can be bought yet**
 * ({@link ChimesPanelView.spendRefusal}). No screen in this build posts a spend: the career purse
 * is GitHub issue #371's and the two rush sinks are #372's. A price list with no refusal beside it
 * is a control that writes nothing failing to say so, which is the rule above in the direction it
 * usually bites.
 *
 * ## The document is bundled rather than fetched
 *
 * `shift/ladder.ts`'s precedent and its reason: the table is pinned to the commit by construction,
 * so the price a screen draws and the price the server charges cannot drift apart between a deploy
 * and a cache. `wrinkles/library.ts` makes the same choice for the same reason.
 */

import {
  chimeSpendTableOf,
  parseChimeLedger,
  type ChimeSink,
  type ChimeSpendTable,
} from '@elevator-sim/core/browser';

/*
 * Named `chimeLedgerDocument` rather than `document`: `boundaries.test.ts` confines the DOM to the
 * dev entry point by looking for bare globals, and a binding called `document` is one.
 */
import chimeLedgerDocument from '../../../../data/chime-ledger.json' with { type: 'json' };

/**
 * The shipped table's **spend half**, parsed and projected in one expression at module init.
 *
 * It used to be the whole parsed table, exported as `CHIME_LEDGER`. The review of PR #485 showed
 * what that cost: `boundaries.test.ts` forbids a play-side module *naming* a source, and one
 * property access — `CHIME_LEDGER.sources[i].name` — walked round the grep with nothing going red.
 * Two changes close it, and only together. This one removes the data: {@link chimeSpendTableOf} is
 * applied to the parse expression itself, so **no binding in this package ever holds a table with
 * sources on it**. The other is in `boundaries.test.ts`, which now additionally forbids `.sources`
 * anywhere in a non-test module here — because the raw JSON import below still has one, and a rule
 * that only watched this file would be a rule about this file rather than about the boundary.
 */
export const CHIME_PRICES: ChimeSpendTable = chimeSpendTableOf(parseChimeLedger(chimeLedgerDocument));

/** Whether an account is holding the balance, from the player's point of view. */
export type ChimesHome =
  /** Signed in: the account holds it, and runs widened with it can be posted. */
  | 'account'
  /**
   * Not signed in — **and therefore there is no tally at all**.
   *
   * It was called `device` and the panel told a player their tally was *"kept on this device
   * alone"*. Nothing in `packages/viz/src` stores or spends a chime on the device: `profile.ts`
   * owns `localStorage` and has no chime field, so off an account the balance is a hard zero that
   * nothing can move. The review of PR #485 named it as [§ D227](../../../../DECISIONS.md)'s rule
   * in its more dangerous direction — a **screen describing a mechanism that does not exist** — and
   * the arm is renamed as well as reworded so that a future `device` ledger has to introduce its
   * own name rather than inherit a sentence.
   */
  | 'signed-out'
  /** The account bridge has not answered yet, which is a real window a player can meet. */
  | 'booting';

/** One thing chimes will be spent on, as a row a player reads. */
export interface ChimesSpendRowView {
  readonly id: string;
  /** What it is called — *Top up this tower's purse*. Not a button: nothing here presses. */
  readonly name: string;
  /** *10 chimes*, in the currency's own words and never in money. */
  readonly price: string;
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
  /**
   * **That none of the rows above can be bought yet, said on the screen that lists them.**
   *
   * `CLAUDE.md`'s standing requirement, in the half it says binds hardest: *a control that writes
   * nothing must say so.* There is no spend control anywhere in this build — no screen posts
   * `POST /api/chimes/spend` — so a price list drawn without this line would be the eleven-times
   * defect wearing a ladder, and a player would go looking for the button.
   *
   * Never `undefined`. When a spend surface exists this becomes the sentence saying where, and a
   * field that could vanish is a field a renderer forgets to draw.
   */
  readonly spendRefusal: string;
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
    'Chimes are what finishing something pays you. Nothing about them changes while you are away ' +
    '— none of this refills, runs out, or asks you to come back on a particular day, and there is ' +
    'nothing here to buy with money.',
  spendHeading: 'WHAT THEY WILL BUY',
  spendRefusal:
    'None of these can be bought yet. This build banks what you finish and has no screen that ' +
    'spends it, so the prices above are what is planned rather than what is offered.',
  accountHome:
    'Your tally lives with your account, so it follows you to whatever you sign in on next, and a ' +
    'run you widened can be posted like any other.',
  signedOutHome:
    'You are not signed in, so there is no tally yet — chimes are kept with an account and this ' +
    'build keeps none on this device. Sign in above and finishing something starts paying them.',
  bootingHome: 'Still finding out whether you are signed in, so this tally may yet change hands.',
  none: 'You have no chimes yet. Finishing anything is what pays them.',
});

/** *You have 40 chimes.* Singular where it should be, because a player meets this sentence often. */
function balanceLineOf(table: ChimeSpendTable, balanceChimes: number): string {
  if (balanceChimes <= 0) return CHIMES_PANEL_COPY.none;
  const unit = balanceChimes === 1 ? table.currency.one : table.currency.many;
  return `You have ${String(balanceChimes)} ${unit}.`;
}

/** *Widen this budget: 12 chimes.* */
function priceOf(table: ChimeSpendTable, sink: ChimeSink): string {
  const unit = sink.priceChimes === 1 ? table.currency.one : table.currency.many;
  return `${String(sink.priceChimes)} ${unit}`;
}

/** What this panel needs, and it is deliberately three fields. */
export interface ChimesPanelInput {
  /** The one read. Zero for an account with nothing banked, and for a device with no tally. */
  readonly balanceChimes: number;
  readonly home: ChimesHome;
  /** Overridden by the corpus and by tests; the shipped table otherwise. */
  readonly table?: ChimeSpendTable | undefined;
}

/**
 * The panel for this state. Total: every sentence a player can meet starts here.
 *
 * **No arm of this function knows a source**, and none can be added that does — the input is a
 * number and a home, and neither carries one.
 */
export function chimesPanelViewOf(input: ChimesPanelInput): ChimesPanelView {
  const table = input.table ?? CHIME_PRICES;
  const balance = Math.max(0, Math.trunc(input.balanceChimes));
  const homeNote =
    input.home === 'account'
      ? CHIMES_PANEL_COPY.accountHome
      : input.home === 'signed-out'
        ? CHIMES_PANEL_COPY.signedOutHome
        : CHIMES_PANEL_COPY.bootingHome;
  return {
    heading: CHIMES_PANEL_COPY.heading,
    balanceLine: balanceLineOf(table, balance),
    lede: CHIMES_PANEL_COPY.lede,
    homeNote,
    spendHeading: CHIMES_PANEL_COPY.spendHeading,
    rows: table.sinks.map((sink) => ({ id: sink.id, name: sink.name, price: priceOf(table, sink) })),
    spendRefusal: CHIMES_PANEL_COPY.spendRefusal,
  };
}
