/**
 * **The mailed sign-in link's outcome, carried to whichever world holds the page** — GitHub issue
 * #336, and [§ D383](../../../../DECISIONS.md)'s boundary applied to a second flow.
 *
 * ## The defect this exists for, measured before it was fixed
 *
 * `packages/viz/index.html` loads `everyday/boot.ts`; that file imports `dev/main.js` for its side
 * effect and mounts the Everyday shell over the Engineer surface. `dev/main.ts`'s boot then calls
 * `redeemLinkFromHash()` unconditionally, and that function's own docstring states the intent it
 * was written with:
 *
 * > Opening a link is a request to sign in, so the screen that shows the outcome is the one the
 * > player is put on. A result written to a panel nobody navigates to is a result nobody reads.
 *
 * § D335 shipped a shell over that panel five months later, and the sentence stopped being true of
 * the page without a word of it changing. Driven on the built artifact at `ba32799` — a cold load of
 * `/#sign-in=<token>` at 1280 × 720 — the Everyday shell contained **no acknowledgement of any
 * kind**, while the covered Engineer menu sat on its account screen with the outcome on it, `.shell`
 * `inert` and the Everyday root holding the page.
 *
 * **And the same line has a second consequence the issue did not name**, found by the same probe and
 * worth more than the first because nothing was looking for it. `everyday/boot.ts`'s
 * `closeEngineerMenuWhenReady` dismisses the Engineer menu by pressing its *Resume* row — a row that
 * exists on the `main` screen and nowhere else. The redemption navigates that menu to `account`
 * before the observer ever sees a row, so `dismissEngineerMenu` returns `false` for the rest of the
 * visit and the covered menu **stays open for the whole session**. Measured on the same two loads:
 * with a link in the fragment `.menu-overlay` reported `hidden: false` with 3 rows (the account
 * screen); without one, `hidden: true` with 9 (the main screen, dismissed). That is also why
 * `dev/browserTier.test-helper.ts#enterEngineerStage` — which waits on exactly that latch — cannot
 * cross the door on a page that redeemed a link.
 *
 * ## Why the navigation is withdrawn rather than kept beside the banner
 *
 * The first draft of this fix left `navigate(menuState, 'account')` in place on both arms and added
 * the banner beside it, on the grounds that a player who later crossed § 3.2's door would find the
 * outcome waiting where accounts live. **That is not what happens.** `dev/main.ts#dispatchMenu`'s
 * `reopen` arm — the one control that puts the Engineer menu back up, and the same intent `?screen=`
 * uses — runs `menuState = navigate(menuState, 'main')`. So the navigation is discarded by the only
 * route back into that menu, and what it *does* achieve is the stuck overlay above. A write no
 * player can observe, whose only observable effect is a defect, is withdrawn rather than gated
 * around.
 *
 * ## Why a provided value rather than an import, and why not through the data host
 *
 * The same argument `everyday/engineerBridge.ts` makes, pointed the same way. `dev/main.ts` holds
 * `accountState` as a local inside an async boot and exports no accessor to it; an Everyday module
 * importing `dev/main.js` for one closure would be importing a module whose side effect is the whole
 * application, and `everyday/boot.ts` already imports it, so the cycle would close. This module
 * imports nothing, so neither end can be caught in one.
 *
 * **`everyday/host.ts` was the obvious channel and is the wrong one.** `EverydayHost` is the *run*
 * host — the day, the week, the campaign — and its subscribers are drained at the end of
 * `dev/main.ts#renderAll`, which no account path calls: all of them call `drawMenu()` instead.
 * Widening that drain to `drawMenu` would notify every Everyday screen on every keystroke in the
 * Engineer account form, which is a redraw storm in the direction GitHub issue #106 documents. A
 * two-function channel that nothing else subscribes to costs less and claims less.
 *
 * ## What travels, and what deliberately does not
 *
 * The **sentence** travels, because it is the server's own or the client's own and rewording it here
 * would be a second answer to a question already answered — `menu/client.ts` says so in terms of the
 * link refusals, each of which is *"worded around whether asking again will help"*. The **token**
 * never travels: nothing in this module is reachable from the request, and `redeemLinkFromHash`
 * clears the fragment before it starts.
 *
 * The words this module *does* author are the two the outcome cannot carry — what the banner is
 * about, and where the account screen is — and they live here beside the view that draws them,
 * on `everyday/rail.ts`'s precedent rather than in `everyday/types.ts`. Nothing outside `everyday/`
 * draws them, so they need no shared home.
 */

/**
 * How the redemption ended, as far as anything a player reads is concerned — **as a value**, so a
 * sweep or a test iterates them rather than restating them.
 *
 * `everyday/types.ts#RUN_CONTEXTS` is the precedent and the reason: a hand-written list of contexts
 * in `honesty/surfaces.ts` went quietly stale the day a fourth one landed, and the fix was to make
 * the loop read the constant.
 *
 * - `working` — the request is in flight. The server sleeps at zero replicas; § D243 § 4 measured a
 *   cold start at 28.7 s, so this is a state a player genuinely sits in.
 * - `signed-in` — a session exists.
 * - `refused` — it does not, and the sentence says why: expired, spent, invalid, rate-limited, or
 *   there being no account server behind this site at all.
 */
export const SIGN_IN_LINK_STAGES = ['working', 'signed-in', 'refused'] as const;

export type SignInLinkStage = (typeof SIGN_IN_LINK_STAGES)[number];

/**
 * One redemption's outcome, as the shell is told about it.
 *
 * `text` is the sentence a player reads and is never composed here: it is the server's refusal, the
 * client's own unavailability sentence, or `dev/main.ts`'s one-line confirmation of a session.
 */
export interface SignInLinkReport {
  readonly stage: SignInLinkStage;
  readonly text: string;
}

/** The banner's eyebrow — what this block is about, before the sentence that is about the outcome. */
export const SIGN_IN_NOTICE_LABEL = 'SIGN-IN LINK';

/**
 * Where the account screen is, said once the outcome is known.
 *
 * It is drawn on both settled arms and never while the request is in flight, and both arms need it
 * for different reasons: a refused link is asked for again from that screen, and a session that
 * exists is named from it.
 *
 * ## It pointed across § 3.2's door and does not any more — GitHub issue #332
 *
 * It read: *"Your account lives on the Engineer surface — Switch to Engineer at the foot of this
 * rail, then open the menu and choose Account."* That was true when this module landed and stopped
 * being true on the commit that put the account on § 15.1's own screen
 * ([§ D489](../../../../DECISIONS.md)) — a pointer at a door the reader no longer has to cross,
 * which is § D227's stale sentence in the shape that costs a player the most: it sends them through
 * a whole other product to reach a control two rows below the banner. Substituted rather than
 * added to, so this surface still says exactly one thing about where the account is.
 *
 * There is no button here that performs it, and that is unchanged. § 3.2's swap is one control with
 * one home and `everyday/swap.ts` refuses a second verb in terms; the same argument applies to a
 * navigation into a screen, which the rail's own Settings row already is.
 */
export const SIGN_IN_NOTICE_POINTER =
  'Your account is on the Settings screen — the gear row at the foot of this rail, under YOU.';

/** The banner's one control. It withdraws the report; it does not undo the sign-in. */
export const SIGN_IN_NOTICE_DISMISS = 'Dismiss';

/**
 * The banner as a value — the pure half, so the words are drivable with no document.
 *
 * The pure/DOM split in this directory exists for exactly this: `everyday/shell.ts#mountEverydayShell`
 * needs a `Document` and is excluded from the honesty sweep on the DOM mounts' shared ground, so a
 * string only reachable through the mount is a string the search never reads.
 */
export interface SignInNoticeView {
  readonly label: string;
  /** The outcome sentence, carried verbatim from whoever produced it. */
  readonly text: string;
  /** Absent while the request is in flight — there is nothing settled to point anywhere about yet. */
  readonly pointer?: string | undefined;
  /** Absent for the same reason: a request in flight is not a thing to dismiss. */
  readonly dismiss?: string | undefined;
}

/** What the shell draws for a report, or `undefined` when there is nothing to say. */
export function signInNoticeViewOf(
  report: SignInLinkReport | undefined,
): SignInNoticeView | undefined {
  if (report === undefined) return undefined;
  if (report.stage === 'working') {
    return { label: SIGN_IN_NOTICE_LABEL, text: report.text };
  }
  return {
    label: SIGN_IN_NOTICE_LABEL,
    text: report.text,
    pointer: SIGN_IN_NOTICE_POINTER,
    dismiss: SIGN_IN_NOTICE_DISMISS,
  };
}

let reported: SignInLinkReport | undefined;

const listeners = new Set<() => void>();

/**
 * `dev/main.ts#redeemLinkFromHash` is the one intended caller — twice on a redemption the Everyday
 * shell is holding the page for (in flight, then settled), and never at all when the Engineer
 * surface holds it.
 *
 * `undefined` withdraws the report, which is what the banner's own *Dismiss* presses. Calling it
 * again replaces the report and re-notifies; a second redemption in one visit is a second answer,
 * not an addition.
 */
export function reportSignInLink(report: SignInLinkReport | undefined): void {
  reported = report;
  for (const listener of [...listeners]) listener();
}

/** The outcome to draw, or `undefined` when no link has been redeemed in this visit. */
export function signInLinkReport(): SignInLinkReport | undefined {
  return reported;
}

/**
 * Hear it arrive, change or go. Returns the unsubscribe, which `everyday/shell.ts#destroy` calls so
 * a torn-down shell does not redraw into a region something else now owns.
 */
export function onSignInLinkReport(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
