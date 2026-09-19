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
 * ## One of the three can be bought, and the other two say why they cannot
 *
 * This panel shipped with a single sentence across the whole list —
 * *"None of these can be bought yet"* — which was true of the build and is not true of this one.
 * [§ D672](../../../../DECISIONS.md) builds the spend, and § D227 says a refusal that stops being
 * true is **deleted on the commit that makes it false**, not reworded, so `spendRefusal` is gone
 * rather than softened.
 *
 * What replaced it is narrower and harder: **a reason per row**. `rush-prefit` is offered because
 * it reaches a run — `everyday/rush.ts#rushPatchOf` fits the building for a claimed one,
 * `packages/server`'s replay fits it with the same three effects, and
 * `leaderboard/rushHoldAgreement.json`'s two `prefit` cells are each required to differ from the
 * same cell as built, which is `CLAUDE.md`'s *move the control and require the run to change*
 * discharged by a run. The two `purse-units` top-ups are **not** offered, and each says so on its
 * own line: `campaign/economy.ts#purseOf` is `carriedIn + earnedSoFar − committed` and has no term
 * a purchase could enter, and no between-round rebuild travels for the rush
 * ([§ D606](../../../../DECISIONS.md) § 2). Selling either would be a control that writes nothing,
 * which `CLAUDE.md`'s standing requirement names and `docs/22` non-goal 5 forbids in **both**
 * polarities — so a price listed without its refusal is the same defect as the refusal without the
 * price.
 *
 * **{@link SPEND_ABSENCES} is `screens.ts#UNBUILT_REASONS`' shape, deliberately**: a table keyed by
 * id, one sentence each, and `chimesPanel.test.ts` asserting in both directions that every sink is
 * either offered or carries a reason and none is both. That is what stops an offer and its reason
 * from drifting apart the way a pair of hand-maintained lists would.
 *
 * ## Prices, and never a price in money — and one of them buyable
 *
 * The sinks are drawn with what they cost **in chimes**, from `data/chime-ledger.json`, because
 * *top up this tower's purse: 10 chimes* is one of the two sentences
 * [§ D530](../../../../DECISIONS.md) chose the name against. There is no other kind of price in
 * this file and no field in the table that could carry one — the parser refuses an unrecognised key
 * by name, citing the decision that refuses it.
 *
 * ## The document is bundled rather than fetched
 *
 * `shift/ladder.ts`'s precedent and its reason: the table is pinned to the commit by construction,
 * so the price a screen draws and the price the server charges cannot drift apart between a deploy
 * and a cache. `wrinkles/library.ts` makes the same choice for the same reason.
 */

import {
  RUSH_PREFIT_SINK_ID,
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

/**
 * **Why a sink this build lists is not one it sells** — `screens.ts#UNBUILT_REASONS`' shape, and
 * its argument one directory over: a key that is not offered carries **that key's own sentence**,
 * so an offer and its refusal move on one commit or not at all.
 *
 * Keyed by sink id rather than by modifier kind, because the two `purse-units` sinks are not
 * refused for one reason: a tower's purse and a rush's purse are different quantities with
 * different things missing behind them, and one sentence about *purses* would be a reader's summary
 * rather than either file's fact.
 *
 * Both are `CLAUDE.md`'s standing requirement in the polarity it says binds hardest — *a control
 * that writes nothing must say so* — and both are checked rather than asserted:
 * `pricing/spendWidensTheBudget.test.ts` is the shipped instrument for the other direction.
 */
export const SPEND_ABSENCES: Readonly<Record<string, string>> = Object.freeze({
  'career-purse-top-up':
    'Not offered. A tower\u2019s purse is worked out from what the contract carried in and what its ' +
    'days have earned, and nothing adds to it from outside \u2014 so units bought here would land in ' +
    'a figure no day reads.',
  'rush-purse-top-up':
    'Not offered. The rush works out a purse for every round and there is still nothing to spend it ' +
    'on: rebuilding the tower between rounds is not built, so a wider purse would change no run.',
});

/**
 * What a row can be, and **pressability is `offer === 'buy'` and nothing else**.
 *
 * Five rather than two, because five different things are true of five different players standing
 * in front of the same row, and a screen that collapsed them would tell at least one of them
 * something false. Every arm but `buy` carries a {@link ChimesSpendRowView.note}.
 */
export type ChimesSpendOffer =
  /** Offered, affordable, and there is an account and a route to spend through. */
  | 'buy'
  /** Offered and the balance does not cover it. The note carries the shortfall. */
  | 'short'
  /** Bought already, up to what one run may claim. A second purchase would buy nothing. */
  | 'owned'
  /** Nothing is wrong with the sink; something is missing here and now — no account, or no server. */
  | 'unavailable'
  /** This build does not sell it, and {@link SPEND_ABSENCES} says why. */
  | 'not-offered';

/** One thing chimes are spent on, as a row a player reads. */
export interface ChimesSpendRowView {
  readonly id: string;
  /** What it is called — *Top up this tower's purse*. */
  readonly name: string;
  /** *10 chimes*, in the currency's own words and never in money. */
  readonly price: string;
  /** What this row is for this player right now. A control is live exactly when this is `buy`. */
  readonly offer: ChimesSpendOffer;
  /**
   * The one sentence this row owes — what buying it does, or why it cannot be bought.
   *
   * **Never `undefined` on any arm but `buy`**, and a field that could vanish is a field a renderer
   * forgets to draw. On `buy` it is the effect and its cost, because a player is entitled to know
   * what a purchase does to their next run **before** they press — including that a fitted sitting
   * is posted to its own board.
   */
  readonly note: string;
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
   * **The fourth thing `docs/38` § 2.4 says chimes buy, and why it is not on this list.**
   *
   * It read *"None of these can be bought yet"* and was deleted on the commit that made it false
   * ([§ D227](../../../../DECISIONS.md), [§ D672](../../../../DECISIONS.md)) rather than reworded.
   * The per-row refusals took over its job; this took over the half it also did, which was telling
   * a player the list is not the whole of what a chime is for.
   *
   * A scenario's budget is priced **by the scenario** — § 2.4 in terms, and
   * `core/config/chimeLedger.ts#REFUSED_MODIFIER_KINDS` refuses a second price for it by name — so
   * it cannot be a row here and must not become one. Saying so is what stops a reader concluding
   * the design shrank.
   *
   * Never `undefined`: a field that could vanish is a field a renderer forgets to draw.
   */
  readonly spendNote: string;
  /**
   * What the **server** said about the last press, or `undefined` before one.
   *
   * Carried unrewritten, which is `docs/22` non-goal 3: a client that composed its own *you need
   * three more* would be publishing an arithmetic nobody did, and softening a refusal because it
   * reads badly is the thing that non-goal names.
   */
  readonly notice: string | undefined;
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
  spendHeading: 'WHAT THEY BUY',
  spendNote:
    'A wider budget for a scenario is the fourth thing chimes are for, and it is not on this list ' +
    'because each scenario sets its own price for it rather than this table \u2014 so nothing here ' +
    'charges one.',
  /** What the one offered row does, said before the press rather than after it. */
  prefitOffer:
    'Your next rush starts with the doors, the control and the tenancies already fitted, and it is ' +
    'bought once. A rush played on a fitted tower is posted to its own board rather than ranked ' +
    'against towers as built.',
  /** And what it does once it is bought, which is the same thing in the past tense. */
  prefitOwned:
    'Bought. Your next rush starts fitted, and is posted to its own board rather than ranked ' +
    'against towers as built.',
  /** No account: there is no tally to spend, which is {@link signedOutHome} pointed at a row. */
  rowSignedOut: 'Sign in and there is a tally to spend this from.',
  /** The account bridge has not answered, so whether this can be pressed is not yet known. */
  rowBooting: 'Still finding out whether you are signed in, so this is not offered for a moment.',
  /** Served with no API origin: there is no ledger on this build to spend out of. */
  rowNoLedger: 'This build was served without a ledger, so there is nothing here to spend.',
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

/** What this panel needs. */
export interface ChimesPanelInput {
  /** The one read. Zero for an account with nothing banked, and for a device with no tally. */
  readonly balanceChimes: number;
  readonly home: ChimesHome;
  /**
   * What the account already owns — `EverydayHost.chimeBalance()`'s `owns`
   * ([§ D671](../../../../DECISIONS.md)), summed by sink on the server.
   *
   * `undefined` is **nobody has asked yet** and is deliberately not `[]`: drawing a row as buyable
   * over an account that already owns it would sell a player the same thing twice, and the server
   * would take the chimes for it. It draws `unavailable` until a read lands.
   */
  readonly owns?: readonly { readonly sinkId: string; readonly steps: number }[] | undefined;
  /**
   * Whether this build has a spend route at all — `false` on a page served with no API origin.
   *
   * Separate from {@link home}, because *nobody is signed in* and *there is no server* are
   * different sentences and this panel has had that exact conflation before (the review of
   * PR #485). Defaults to `false`, which is the arm that promises least: a caller that forgot to
   * say draws a row that cannot be pressed rather than one that can and then cannot.
   */
  readonly spendable?: boolean | undefined;
  /** The server's own sentence about the last press, carried unrewritten. */
  readonly notice?: string | undefined;
  /** Overridden by the corpus and by tests; the shipped table otherwise. */
  readonly table?: ChimeSpendTable | undefined;
}

/**
 * What one row is for this player, right now.
 *
 * The order of the tests is the order the sentences are worth saying in, and it is a decision:
 * **the build first, then the account, then the ledger.** A sink this build does not sell is not
 * sold to a signed-in player either, so that answer comes before anything about the account; and
 * whether there is an account comes before whether there are enough chimes, because a visitor has
 * no balance to be short of.
 */
function offerOf(
  sink: ChimeSink,
  input: ChimesPanelInput,
  balance: number,
): { readonly offer: ChimesSpendOffer; readonly note: string } {
  const absence = SPEND_ABSENCES[sink.id];
  if (absence !== undefined) return { offer: 'not-offered', note: absence };
  if (input.spendable !== true) {
    return { offer: 'unavailable', note: CHIMES_PANEL_COPY.rowNoLedger };
  }
  if (input.home === 'booting') return { offer: 'unavailable', note: CHIMES_PANEL_COPY.rowBooting };
  if (input.home !== 'account') {
    return { offer: 'unavailable', note: CHIMES_PANEL_COPY.rowSignedOut };
  }
  if (input.owns === undefined) {
    return { offer: 'unavailable', note: CHIMES_PANEL_COPY.rowBooting };
  }
  const held = input.owns.find((entry) => entry.sinkId === sink.id)?.steps ?? 0;
  /*
   * At the cap this run may claim, a second purchase buys nothing — `chimeSpendPrice` would take
   * the chimes and `unbackedModifiers` would still cap the claim at `maxSteps`. So the row says
   * *bought* rather than offering a step the ledger will not honour.
   */
  if (held >= sink.maxSteps) return { offer: 'owned', note: CHIMES_PANEL_COPY.prefitOwned };
  if (balance < sink.priceChimes) {
    /*
     * The shortfall, in the currency's own words — `fixit/engine.ts#affordabilityOf`'s *short by
     * N u* one screen over. It is a subtraction of two counts of completed turns and not a figure
     * any run produced, which is what keeps it on the right side of `docs/22` non-goal 2.
     */
    const short = sink.priceChimes - balance;
    const unit = short === 1 ? CHIME_PRICES.currency.one : CHIME_PRICES.currency.many;
    return { offer: 'short', note: `Short by ${String(short)} ${unit}.` };
  }
  return { offer: 'buy', note: CHIMES_PANEL_COPY.prefitOffer };
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
    rows: table.sinks.map((sink) => ({
      id: sink.id,
      name: sink.name,
      price: priceOf(table, sink),
      ...offerOf(sink, input, balance),
    })),
    spendNote: CHIMES_PANEL_COPY.spendNote,
    ...(input.notice === undefined ? { notice: undefined } : { notice: input.notice }),
  };
}

/**
 * The sinks this build actually sells — every sink the shipped table holds that
 * {@link SPEND_ABSENCES} does not refuse.
 *
 * Derived rather than listed, which is `screens.ts`'s own rule: a second hand-written list is the
 * thing that goes stale against the first. `chimesPanel.test.ts` asserts what this comes out as —
 * exactly `core`'s {@link RUSH_PREFIT_SINK_ID} — in both directions, so a sink that gained or lost
 * an absence fails a test rather than a player.
 */
export function offeredSinkIds(table: ChimeSpendTable = CHIME_PRICES): readonly string[] {
  return table.sinks.map((sink) => sink.id).filter((id) => SPEND_ABSENCES[id] === undefined);
}

/** Whether the shipped table's one offered sink is the pre-fit — used by `rushScreenModel.ts`. */
export const PREFIT_SINK_ID = RUSH_PREFIT_SINK_ID;
