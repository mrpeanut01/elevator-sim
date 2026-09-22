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
 * ## Two of the three can be bought, and the third says why it cannot
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
 * discharged by a run.
 *
 * **`career-purse-top-up` is offered now, and its refusal went the same way on the commit that
 * made it false** — GitHub issue #557, [§ D738](../../../../DECISIONS.md). That row's sentence read
 * *"A tower's purse is worked out from what the contract carried in and what its days have earned,
 * and nothing adds to it from outside"*, and it was exactly true until `campaign/economy.ts`
 * gained a `PurseGrant` record and a fourth term in `purseOf`. It is **deleted rather than reworded**,
 * § D227 again, and `campaign/purseTopUpReachesTheRun.test.ts` is the run that earns the deletion:
 * a tower that bought a top-up and one that did not, same seed, compared on the legs.
 *
 * `rush-purse-top-up` is still **not** offered and still says why on its own line: no between-round
 * rebuild travels for the rush ([§ D606](../../../../DECISIONS.md) § 2). It is a **separate case
 * with a different cause**, which is why issue #557 refuses to have the two folded together and why
 * one sentence about *purses* would be a reader's summary rather than either file's fact.
 *
 * Selling a sink that reaches nothing would be a control that writes nothing, which `CLAUDE.md`'s
 * standing requirement names and `docs/22` non-goal 5 forbids in **both** polarities — so a price
 * listed without its refusal is the same defect as the refusal without the price.
 *
 * **{@link SPEND_ABSENCES} is `screens.ts#UNBUILT_REASONS`' shape, deliberately**: a table keyed by
 * id, one sentence each, and `chimesPanel.test.ts` asserting in both directions that every sink is
 * either offered or carries a reason and none is both. That is what stops an offer and its reason
 * from drifting apart the way a pair of hand-maintained lists would.
 *
 * **There is no exported *"which sinks are offered"* helper, and the absence is deliberate.** One
 * was written and deleted: nothing but a test called it, which is `CLAUDE.md`'s standing
 * requirement in its plainest form — *name the non-test caller*. The offered set is a **property of
 * the rendered rows** ({@link ChimesSpendRowView.offer}), so the tests read it off the view a
 * player sees rather than off a second derivation that could come to disagree with one.
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
  chimeSpendTableOf,
  parseChimeLedger,
  type ChimeSink,
  type ChimeSpendTable,
} from '@elevator-sim/core/browser';

import { CAREER_PURSE_TOP_UP_SINK_ID } from '../campaign/economy.js';

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
  /*
   * **`career-purse-top-up`'s entry is deleted, not reworded** — GitHub issue #557, § D227, and the
   * module docstring carries the sentence it used to say so that a reader can see what stopped
   * being true. `campaign/economy.ts#purseOf` now has a fourth term and
   * `campaign/purseTopUpReachesTheRun.test.ts` runs the day twice to prove it reaches the legs.
   *
   * `rush-purse-top-up` stays, and staying is a decision rather than an oversight: issue #557 says
   * in terms that it is a separate case with a different cause and must not be folded in.
   */
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
  /**
   * **What the career top-up does, said before the press** — GitHub issue #557.
   *
   * Three clauses, and each is there because leaving it out would be a small lie a player could
   * only find by playing. *Into the tower your desk is open on*, because the sink's name says
   * *this tower* and a purchase made from Settings has to say which one it means. *Spent on works
   * like any other unit*, because that is `docs/32` GD12's surviving clause — units buy works and
   * nothing else, so a top-up buys the same things a cleared day buys. And the last sentence is
   * `docs/32` GD11 and GD13 clause 5 on the face of the control: the works still take their
   * nights, and a missed day is not for sale at any price.
   *
   * The figure is **not** in this string. It is composed beside the price, out of
   * `data/chime-ledger.json`'s own `grantUnits`, for the reason the price is: one authority for
   * what a step buys, and a copy of it here would be a second.
   */
  purseOffer:
    'into the purse of the tower your Career desk is open on, to spend on works there like any ' +
    'other unit. Works still take the nights they take, and nothing here buys back a missed day.',
  /** And what it did, which is the same thing in the past tense. */
  purseOwned:
    'Bought, as many times as one contract may be topped up. The units are in the purse of the ' +
    'tower each was bought for, and they are spent on works like any other unit.',
  /**
   * No campaign desk is open, so a top-up would be charged and land nowhere.
   *
   * The one arm of this panel that is about the **state of play** rather than about the build, the
   * account or the ledger — and it exists because the alternative is issue #557's own defect with
   * a second cause: a purchase that reaches no run.
   */
  purseNoTower:
    'Open a building on the Career screen first — this tops up that tower\u2019s purse, so there ' +
    'has to be one.',
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

/**
 * **What an offered sink says about itself, keyed by id** — {@link SPEND_ABSENCES}' mirror.
 *
 * Two tables rather than one with an optional half, because the question *is this sold?* is the
 * question a row's pressability turns on, and `chimesPanel.test.ts` asserts in **both** directions
 * that every sink the shipped table holds is in exactly one of them. A sink added to
 * `data/chime-ledger.json` with an entry in neither goes red here rather than drawing a blank row,
 * and one with an entry in both goes red too — which is the pair of failures a single table with a
 * nullable field cannot express.
 *
 * `needsOpenTower` is the one thing an offer can require of the **state of play** rather than of
 * the account. `career-purse-top-up`'s own name is *top up **this tower's** purse*, and with no
 * desk open there is no *this tower*: the units would be charged and land nowhere, which is issue
 * #557's own defect bought a second time. `everyday/host.ts#spendChime` refuses the same press on
 * the same ground before the ledger is asked, so the row being inert is the first lock and the host
 * is the second.
 */
export interface ChimesSpendCopy {
  /** What buying it does, said before the press. */
  readonly offer: string;
  /** What it did, once it is bought to its cap — the same sentence in the past tense. */
  readonly owned: string;
  /** Whether it needs a career desk open to land in. */
  readonly needsOpenTower: boolean;
}

export const SPEND_OFFERS: Readonly<Record<string, ChimesSpendCopy>> = Object.freeze({
  [CAREER_PURSE_TOP_UP_SINK_ID]: Object.freeze({
    offer: CHIMES_PANEL_COPY.purseOffer,
    owned: CHIMES_PANEL_COPY.purseOwned,
    needsOpenTower: true,
  }),
  'rush-prefit': Object.freeze({
    offer: CHIMES_PANEL_COPY.prefitOffer,
    owned: CHIMES_PANEL_COPY.prefitOwned,
    needsOpenTower: false,
  }),
});

/**
 * A sink the shipped table sells that this build has neither an offer nor a refusal for.
 *
 * Unreachable while `chimesPanel.test.ts`'s both-directions check is green, and written anyway:
 * {@link ChimesSpendRowView.note} promises it is never empty on a row that is not `buy`, and a
 * promise kept by a test in another file is a promise a renderer can still break.
 */
const UNDESCRIBED_SINK =
  'Not offered. This build has nothing to say about this one, which is a fault rather than a price.';

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
   * Whether a career desk is open for a {@link SPEND_OFFERS} row that needs one — issue #557.
   *
   * `campaign/career.ts#openTowerOf` is the question, asked by the caller rather than here: this
   * module holds no career and must not learn to, on exactly the ground it holds no source. A lost
   * contract clears `openTowerId`, so `false` is a state a player reaches by playing rather than an
   * edge case.
   *
   * Defaults to `false`, which is {@link spendable}'s convention and the arm that promises least: a
   * caller that forgot to say draws a row that cannot be pressed rather than one that can and then
   * takes the chimes for nothing.
   */
  readonly careerTowerOpen?: boolean | undefined;
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
  /*
   * A sink the shipped table sells and this build has no words for. It cannot happen while
   * `chimesPanel.test.ts`'s both-directions check is green, and drawing a blank note would be the
   * one thing {@link ChimesSpendRowView.note} promises never to be, so it is refused rather than
   * rendered empty.
   */
  const copy = SPEND_OFFERS[sink.id];
  if (copy === undefined) return { offer: 'not-offered', note: UNDESCRIBED_SINK };
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
  if (held >= sink.maxSteps) return { offer: 'owned', note: copy.owned };
  /*
   * **After *bought* and before *short*, and the order is the decision.** A row already bought to
   * its cap says so whatever desk is open — that sentence is true of the account and does not
   * depend on where the player is standing. *Nowhere to land* comes before *short by N*, because
   * it is the one a player can act on: opening a desk is a press away, and earning chimes is not.
   */
  if (copy.needsOpenTower && input.careerTowerOpen !== true) {
    return { offer: 'unavailable', note: CHIMES_PANEL_COPY.purseNoTower };
  }
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
  return { offer: 'buy', note: offerNoteOf(sink, copy) };
}

/**
 * The offer sentence, with the figure the ledger authors in front of it where there is one.
 *
 * A `purse-units` sink is worth a number — *6 units into the purse of…* — and a `prefit` grants
 * none, so its sentence stands on its own. The figure is `data/chime-ledger.json`'s own, for the
 * reason the price is: two authorities for what a step buys is the defect this whole file is
 * careful about, and one of them being prose makes it worse rather than better.
 *
 * **Read off the sink rather than through `core`'s `chimeGrantUnits`, and the reason is a guard
 * rather than a preference.** `pricing/spendWidensTheBudget.test.ts` greps for that helper to keep
 * the **charging** half of this seam inside three named modules — a screen that takes a chime, a
 * binding that holds the token, and the host verb between them. This module draws a row; it charges
 * nothing and grants nothing. Calling the charging side's arithmetic to *say a number* would have
 * widened a landed boundary to make a sentence convenient, and the row offers exactly one step, so
 * the helper's whole contribution over the authored field would have been multiplying by 1.
 */
function offerNoteOf(sink: ChimeSink, copy: ChimesSpendCopy): string {
  const granted = sink.modifier.grantUnits;
  if (granted <= 0) return copy.offer;
  return `${String(granted)} ${granted === 1 ? 'unit' : 'units'} ${copy.offer}`;
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

