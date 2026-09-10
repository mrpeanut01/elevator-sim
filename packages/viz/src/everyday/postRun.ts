/**
 * **Putting a finished day on a leaderboard, as words** — GitHub issue #221's first acceptance
 * criterion, decided here and drawn by `everyday/reportScreen.ts`.
 *
 * The screen owns the DOM and this owns every sentence and every enabled/disabled decision, which
 * is the split `everyday/boardScreen.ts#dailyBoardViewOf` already makes for the read half. A pure
 * function is what lets the honesty corpus drive all seven states without a document, and it is
 * what stops the mount from acquiring a second opinion about when a control is live.
 *
 * ## The affordance is not the refusal, and both exist
 *
 * `dev/main.ts#postCurrentRun` refuses on its own before a request leaves — that is the gate, and it
 * is where the gate belongs, because issue #21's finding was that *"a refusal that exists only in a
 * disabled button is a refusal one keyboard route away from not existing"*. What this module adds is
 * the other half of the same issue: a **filled primary that consumes a click and produces nothing is
 * worse than a disabled one**, so where the answer is already known — no server, nobody signed in,
 * no finished run — the button is drawn with {@link PostRunView.pressable} false **and a sentence
 * saying why**. Never greyed and silent: § D456's second charter refusal test is *can the player
 * still play?*, and a dead control with no explanation fails it while looking tidy.
 *
 * ## What the outcome's own words are, and what this module is allowed to write
 *
 * Every refusal sentence a player reads is the outcome's `detail`, **carried and never
 * paraphrased** — the server's when the server spoke, the client's when the transport did not
 * reach it, `menu/account.ts`'s when nobody is signed in. This module authors exactly two
 * sentences that no outcome carries: the standing note under the button before any press, and the
 * success lede. The success lede is the only place the product may say *the server replayed your
 * seed*, and it may say it only on a `posted`, because that is the one state in which it is true:
 * `packages/server`'s `verifySubmission` re-runs the submitted seed from its own copy of `data/`
 * and a `201` is that replay having reproduced the claim.
 *
 * ## The board the run landed on is the server's answer, and this file does not derive it
 *
 * **The server's `placement` is a token, and this file turns it into words** — see
 * {@link placementLineOf}. `leaderboard/boardKey.ts#placeSubmission` puts a run on `daily:<date>`
 * only when it matches every axis of the day's fixture and on `personal:<user id>` otherwise, and
 * the wire carries the bare `kind` of that choice. So a shell that announced *"posted to today's
 * board"* on its own reckoning would be wrong for most runs a player actually plays — the failure
 * GitHub issue #331 records as the reason this issue split — and a shell that printed the token
 * said *"The server put it here: personal"*, which is the failure the other direction.
 *
 * What is carried unparaphrased is the **choice**; what is authored here is the **wording**.
 * Nothing here parses the key, nothing here decides which day it is, and nothing here decides
 * which board a run belongs on.
 */

// The type and the one sentence the host owns. `everyday/host.ts` imports nothing from here, so
// the graph is one-way — the module-init `undefined` this directory keeps a register of needs a
// cycle, and there is none.
import { POST_RUN_NO_SERVER, type EverydayPostOutcome } from './host.js';
// The signed-out sentence, borrowed rather than restated — see the `outcome === undefined` arm.
// `menu/account.ts` holds no client and is already value-imported across `everyday/`.
import { SIGNED_OUT, postingRefusal } from '../menu/account.js';

/**
 * The block's own chrome, frozen so the sweep renders every sentence.
 *
 * The eyebrow states the block's nature rather than describing it, which is § 14.2's rule about the
 * board's own tab cards applied one screen over.
 */
export const POST_RUN_COPY = Object.freeze({
  eyebrow: 'PUT IT ON THE BOARD',
  button: 'Post this run',
  posting: 'Posting this run…',
  /*
   * The standing note, before any press. Three claims, and each is there because a player who did
   * not know it would read the press as something else: what is sent (the run, not the player), who
   * checks it (the server, by replaying the seed), and that a refusal is not an accusation.
   */
  note:
    'Posting sends this run’s seed and settings, and the four figures it measured. The server ' +
    'replays the seed from its own copy of the reference data and compares — a run only reaches a ' +
    'board if it reproduces there.',
  /*
   * The one sentence this module authors about a success. It says what the server did rather than
   * congratulating anybody, and the placement line beside it says where the run went.
   */
  posted: 'Posted. The server replayed your seed and it reproduced.',
  /*
   * Where the run landed, one sentence per board the server has — see {@link placementLineOf}.
   *
   * These are **prose for a token**, not a paraphrase of a sentence. The wire's `placement` is
   * `BoardPlacement['kind']` (`packages/server/src/leaderboard/boardKey.ts`) — the bare words
   * `daily` and `personal` — so a line that carried it through said *"The server put it here:
   * personal"* on a player surface. The server does not author a sentence here; it authors a
   * choice, and this is the one place the product turns that choice into words.
   *
   * Each says the **consequence** rather than the name of the board, because the name is what the
   * player cannot check and the consequence is what they came to find out: whether anyone else is
   * on the thing they just joined.
   */
  postedDaily:
    'It went on today’s board: this run met the day’s fixture, so it is ranked against everyone ' +
    'else who played it.',
  postedPersonal:
    'It went in your own record log: this run is not today’s fixture, so there is nobody to rank ' +
    'it against. It is kept, and it is yours.',
  /*
   * A `placement` this build has no sentence for — a server ahead of this client, or a field it
   * omitted. Says the two things that are still true and does not guess the third.
   *
   * Deliberately **not** the token: printing an unrecognised wire word is the defect this arm
   * exists because of, one release later.
   */
  postedUnknownBoard:
    'The server accepted it and put it on a board this build does not have a name for. The run is ' +
    'recorded either way.',
  /*
   * Why a run this shell will not post cannot be posted from anywhere else either. Drawn beside the
   * refusal so the player does not go looking for a second button.
   */
  refusedNote:
    'This is checked here rather than on the server, so nothing was sent. The run is still on ' +
    'screen and still in your week.',
  /** The pressable-but-nothing-to-post case, in the note's own place. */
  noRun:
    'There is no finished run to post yet. Play a day, then come back — the run on screen is what ' +
    'gets posted.',
} as const);

/**
 * The sentence for a `placement` token — GitHub issue #221's second defect.
 *
 * **This is the only translation in this module, and it is here because the server does not do it.**
 * `http/api.ts` answers `{ placement: placement.kind }`, and `kind` is `'daily' | 'personal'` — two
 * words chosen to name a branch in a switch, not to be read by a player. This file drew them
 * through a *"The server put it here:"* lede for one commit, so the product said **"The server put
 * it here: personal"**.
 *
 * The docstrings above and in `everyday/host.ts` that called `placement` *"the server's sentence"*
 * were the mistake in prose form, and they are corrected rather than deleted: what the server
 * carries unparaphrased is the **choice of board**, which is the part this client must not derive.
 * `boardKey.ts#placeSubmission` is still the only thing that decides it. What the client owns is
 * the wording, which the server never had.
 *
 * The default arm is not a fallthrough for tidiness. `menu/client.ts` writes
 * `String(record['placement'] ?? '')`, so a server that omitted the field yields `''` here — which
 * under the old line produced the lede with nothing after the colon. An unrecognised token and an
 * absent one get the same honest sentence, because from a player's seat they are the same event:
 * the run was accepted, and this build cannot name where it went.
 */
export function placementLineOf(placement: string): string {
  switch (placement) {
    case 'daily':
      return POST_RUN_COPY.postedDaily;
    case 'personal':
      return POST_RUN_COPY.postedPersonal;
    default:
      return POST_RUN_COPY.postedUnknownBoard;
  }
}

/** One line of the block's prose. `note` is the quieter grey; `reason` is the refusal ink. */
export interface PostRunLine {
  readonly text: string;
  readonly className: string;
  readonly role: 'reason' | 'note';
}

/** What the post block says and offers, for any one of its seven states. */
export interface PostRunView {
  readonly eyebrow: string;
  /** The button's face — {@link POST_RUN_COPY.button}, or the in-flight wording. */
  readonly label: string;
  /**
   * Whether pressing it does anything.
   *
   * `false` is always accompanied by a `reason` line: see the module docstring on why a greyed
   * control with no sentence is the failure this rule exists to prevent.
   */
  readonly pressable: boolean;
  /** Prose under the button. Never empty — a state with nothing to say is a state that lies. */
  readonly lines: readonly PostRunLine[];
}

/**
 * What the report screen draws, from the three things it knows and the last press's answer.
 *
 * `outcome` is `undefined` before any press. `posting` outranks it, because a second press while
 * one is in flight is the double-submit this product has no idempotency key for.
 */
export function postRunViewOf(input: {
  /** Whether a finished run is on screen at all. */
  readonly hasRun: boolean;
  /** Whether this build was served with an API origin — the host's binding, not a guess. */
  readonly hasServer: boolean;
  /** Whether anybody is signed in. `menu/account.ts`'s `token`, read through the account port. */
  readonly signedIn: boolean;
  /** True between the press and the answer. */
  readonly posting: boolean;
  /** The last press's answer, or `undefined` before the first. */
  readonly outcome: EverydayPostOutcome | undefined;
}): PostRunView {
  const line = (text: string, className: string, role: 'reason' | 'note' = 'note'): PostRunLine => ({
    text,
    className,
    role,
  });

  if (input.posting) {
    return {
      eyebrow: POST_RUN_COPY.eyebrow,
      label: POST_RUN_COPY.posting,
      pressable: false,
      lines: [line(POST_RUN_COPY.note, 'everyday-post-note')],
    };
  }

  /*
   * The three answers that are known before a press, in the order a player can act on them: a
   * property of the build, then a property of the screen, then a property of the player. One
   * sentence for all three would tell a signed-in player with a finished run to sign in, which is
   * `dev/main.ts#postCurrentRun`'s own argument for keeping its three refusals distinct.
   */
  if (!input.hasServer) {
    return {
      eyebrow: POST_RUN_COPY.eyebrow,
      label: POST_RUN_COPY.button,
      pressable: false,
      /*
       * `everyday/host.ts`'s constant rather than a sentence of this file's own. The Engineer menu
       * reads the same one: three surfaces, one claim about one state, which is what
       * `honesty/agreement.ts#surfaces-disagree` exists to catch and this avoids structurally.
       */
      lines: [line(POST_RUN_NO_SERVER, 'everyday-post-absent', 'reason')],
    };
  }
  if (!input.hasRun) {
    return {
      eyebrow: POST_RUN_COPY.eyebrow,
      label: POST_RUN_COPY.button,
      pressable: false,
      lines: [line(POST_RUN_COPY.noRun, 'everyday-post-no-run', 'reason')],
    };
  }

  /*
   * Signed out is drawn as a **live** control rather than a dead one, and that is deliberate: the
   * press produces `signed-out`, whose `detail` is `menu/account.ts#postingRefusal` — the sentence
   * that says an address and no password is all it takes and where to do it. A greyed button would
   * have swallowed the one instruction the player needs, which is § D456's *say what to do rather
   * than greying a control* on the surface it was written for.
   */
  const outcome = input.outcome;
  if (outcome === undefined) {
    return {
      eyebrow: POST_RUN_COPY.eyebrow,
      label: POST_RUN_COPY.button,
      pressable: true,
      lines: input.signedIn
        ? [line(POST_RUN_COPY.note, 'everyday-post-note')]
        : [
            /*
             * **Signed out is said before the press, not after it** — issue #332's fourth
             * acceptance clause, *"signed-out is a first-class state on every surface that offers
             * posting, and it says what to do rather than greying a control"*, and issue #30's fix
             * ordering: tell the player what this needs before they spend a click finding out.
             *
             * `postingRefusal(SIGNED_OUT)` rather than a sentence of this file's own, so the line
             * drawn *before* a press and the `signed-out` detail carried *after* one are the same
             * string from the same owner. A second wording here would be two answers to one
             * question, differing on the day either was edited.
             */
            line(postingRefusal(SIGNED_OUT) ?? '', 'everyday-post-signed-out', 'reason'),
            line(POST_RUN_COPY.note, 'everyday-post-note'),
          ],
    };
  }

  switch (outcome.kind) {
    case 'posted':
      return {
        eyebrow: POST_RUN_COPY.eyebrow,
        label: POST_RUN_COPY.button,
        /*
         * Still pressable. Posting the same run twice is the server's question rather than this
         * screen's — it holds the digest and answers a duplicate as one — and a button that
         * disabled itself on success would be this client deciding an answer it does not hold.
         */
        pressable: true,
        lines: [
          line(POST_RUN_COPY.posted, 'everyday-post-posted'),
          line(placementLineOf(outcome.placement), 'everyday-post-placement'),
        ],
      };
    case 'no-server':
      return {
        eyebrow: POST_RUN_COPY.eyebrow,
        label: POST_RUN_COPY.button,
        pressable: false,
        lines: [line(outcome.detail, 'everyday-post-absent', 'reason')],
      };
    case 'signed-out':
      return {
        eyebrow: POST_RUN_COPY.eyebrow,
        label: POST_RUN_COPY.button,
        pressable: true,
        lines: [line(outcome.detail, 'everyday-post-signed-out', 'reason')],
      };
    case 'refused':
      return {
        eyebrow: POST_RUN_COPY.eyebrow,
        label: POST_RUN_COPY.button,
        pressable: true,
        lines: [
          line(outcome.detail, 'everyday-post-refused', 'reason'),
          line(POST_RUN_COPY.refusedNote, 'everyday-post-note'),
        ],
      };
    case 'failed':
      return {
        eyebrow: POST_RUN_COPY.eyebrow,
        label: POST_RUN_COPY.button,
        pressable: true,
        lines: [line(outcome.detail, 'everyday-post-failed', 'reason')],
      };
  }
}
