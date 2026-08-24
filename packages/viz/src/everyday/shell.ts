/**
 * **The Everyday Mode shell** — GAMEPLAY § 3.1's geometry, § 3.2's rail, § 3.3's action bar,
 * § 3.4's leave friction, and the router over § 4's seventeen screen keys.
 *
 * ## What it owns, and what it hands off
 *
 * It owns the frame: a 212 px rail, a scroll region showing **one screen at a time**, and a pinned
 * action bar drawn from `actionBar.ts`'s table — no screen declares its own footer (§ 3.1). It
 * draws the menu itself, because the menu is the shell's own front door (§ 3.5). Every other key
 * is routed by `screens.ts`: a registered screen module mounts into the region, and an unregistered
 * key draws that key's one refusal sentence — the same sentence the rail's caption and the mode
 * tiles read, so no two surfaces refuse in different words.
 *
 * ## The hand-off retired, and the door that replaced it
 *
 * § D335 shipped `stage` as a *hand-off*: the shell shrank to the 212 px rail strip, uncovered
 * `div.shell` and inset the whole Engineer application beside it. It was honest, it was reversible,
 * and it was not § 7. `everyday/stageScreen.ts` is now § 7's stage — a registered screen like any
 * other — so `screens.ts` has no `'handoff'` route left to return and this module has no second
 * geometry to draw.
 *
 * Retiring it left the Engineer surface **booting, running, covered, and unreachable**: for one
 * wave nothing in the shipped page opened it, which was the second entry of
 * {@link EVERYDAY_SHELL_ABSENCES}. § 3.2's footer row is the door, and it is built now — see
 * {@link enterEngineer} and {@link returnToEveryday}, which are the whole of it.
 *
 * **Both worlds are covered, never hidden, and the symmetry is the design rather than a
 * coincidence.** `div.shell` holds canvases that size themselves from their laid-out box, a
 * `display:none` ancestor gives them a zero box, and a simulator view measured while hidden draws
 * nothing when revealed — so the Engineer root has always stayed laid out and `inert` behind this
 * shell. The Everyday root now gets exactly the same treatment on the other side of the door: it
 * keeps its box, its § 7 stage stays mounted with a canvas that still measures, and it steps out of
 * the paint and out of the page rather than out of the layout. `visibility:hidden` is the primitive
 * that does that and `display:none` is the one that does not, and the difference is the whole
 * argument — see {@link setEverydayCovered}.
 *
 * The consequence a player meets is that **nothing is discarded by a swap**: no screen is unmounted,
 * no run is stopped, no context is cleared, and the return lands on the screen they left. That is
 * why the door has no § 3.4 confirm strip — a strip states a consequence, and this transition has
 * none to state.
 *
 * ## Why the app opens here and cannot be told not to
 *
 * § 3.5: *"The app always opens on the main menu, and this is not overridable. There is no
 * deep-link parameter and no `startScreen` prop; the prop was removed outright and must not come
 * back."* So this module exposes no initial-screen argument. A caller that wants to test a screen
 * calls {@link EverydayShell.go} after mounting, which is a navigation a player could also perform.
 *
 * **The Engineer swap does not remember, and that is the same rule rather than a separate one.**
 * Nothing anywhere writes down which world had the page. A reload therefore lands on Everyday Mode's
 * main menu whichever world the player was in, and the reasoning is § 3.5's own: a remembered world
 * *is* an entry-screen override — a `startScreen` prop wearing `localStorage` — and it fails worse
 * than the prop would, because the screen it would restore is a developer tool the player has no
 * memory of choosing and no obvious way out of. It would also need a second boot path: the Engineer
 * menu opens itself at boot and `everyday/boot.ts#closeEngineerMenuWhenReady` presses it away
 * *behind the cover*, which is only correct while the cover is up. The swap is therefore a fact
 * about this visit, and the rail's own row says so in
 * `types.ts#ENGINEER_SWAP_NOTE` rather than leaving the player to find out by reloading.
 */

import { openTowerOf } from '../campaign/career.js';
import type { WeekState } from '../shift/types.js';
import { actionBarFor, confirmStripFor, TIMELINE_STEPS } from './actionBar.js';
import type { ActionBarModel } from './actionBar.js';
import { HOST_PENDING_REASON } from './host.js';
import type { EverydayHost, EverydayHostSlot } from './host.js';
import { EVERYDAY_MODES, isPlayable } from './modes.js';
import { everydayProfileStore } from './profileStore.js';
import { railModel } from './rail.js';
import type { RailModel } from './rail.js';
import { routeFor, SCREEN_NAMES, screenModuleFor, unbuiltReasonFor } from './screens.js';
import type { EverydayScreenContext, EverydayScreenHandle } from './screens.js';
import { provideEverydaySwap } from './swap.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_RAIL_SURFACES as RAIL_SURFACE,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayMode, EverydayScreen, EverydayState, RunContext } from './types.js';
import { EVERYDAY_ROOT, EVERYDAY_ROOT_CLASS } from './types.js';

/**
 * What this shell does not yet do, in one place.
 *
 * `docs/18`'s register of honest absences does not name the shell, because the build plan's § 0
 * recorded it as already existing. This is the entry that was missing, kept next to the code so it
 * cannot go stale the way a prose row in a plan did.
 */
export const EVERYDAY_SHELL_ABSENCES: readonly string[] = Object.freeze([
  /*
   * **Four rows left this register on the merge that brought § 6's daily loop in beside § 7's
   * stage, and every one of them left because its screen landed rather than because anybody
   * tidied.** Written down because a register whose deletions are invisible is a register a reader
   * cannot audit, and because two of the four were deleted by the *other* lane's work:
   *
   * - *"§ 6.1 front door and § 6.2 brief — Today's tower opens the day directly"* — both are
   *   registered screens now and the tile routes through them (`modes.ts` says so in the tile's
   *   own comment);
   * - *"§ 7's Everyday stage — the stage shown is the Engineer surface with Casual copy"* —
   *   `everyday/stageScreen.ts` is § 7's stage, mounted in the screen region like any other;
   * - *"§ 3.3's action bar is not drawn over the handed-off stage"*, with its consequence that
   *   *Close the day* had no home — the hand-off retired with the stage becoming a screen, so the
   *   bar is drawn under it and `actionBar.ts` gives that row the primary the note promises
   *   (`stageScreenModel.test.ts` pins the label);
   * - *"§ 14 boards and § 12.2 ladder — both need a server"* — true of the daily board and never
   *   true of the ladder, which is measured on this device. It is replaced below by the half that
   *   is still an absence.
   *
   * A register that kept naming any of them would be § D227's stale refusal — the defect this
   * register exists to prevent — reproduced by the register itself.
   */
  '§ 6.1’s replay — a past day can be read from the front door’s week strip, not re-opened: a week moves forward and nothing here stands it back up',
  '§ 6.2’s ghost — no run in this build races a second dispatcher over the same crowd, so *Race against* states what it would be instead of offering it',
  /*
   * **A fifth row left on the very next merge, and it is the one this register existed to make
   * findable.** It read: *"the Engineer surface still boots and runs behind this shell, and nothing
   * here opens it — the rail's Switch to Engineer row is that door and it is not built"*. That row
   * is built (see {@link enterEngineer}), so the entry goes on the commit that closes it — the same
   * direction `screens.ts`'s refusal table is keyed both ways to enforce one level down. A register
   * is worth the number of people who read it, and an entry naming a closed absence is how one
   * stops being read.
   */
  '§ 14’s daily board — a ranking of other people’s runs needs a server to post and verify them, and this build has none: the board screen opens on § 12.2’s labelled unavailable state for that tab, the ladder beside it is live because a rating is measured on this device, and Your week states what a board would be keyed on rather than drawing an empty one',
  /*
   * **A sixth row left on the merge that registered § 9.1's rush setup, § 13's drawing board and
   * § 3.3's tuner — and it left because this merge closed it, which is the one case this register
   * has not recorded before.**
   *
   * It read: *"§ 3.3's Tune the tower is registered and routable, and no shipped control opens it:
   * § 3.2 forbids a rail row (*a thing you do to a day, not a place you live*) and names its two
   * doors as the brief's *Take it to the sandbox* and the report's third lever, neither of which is
   * built"*. That was true on the lane that wrote it and false the moment it met a tree carrying
   * § 6.2's brief: the first of those two doors exists here, and `briefView.ts#lockedForScore` now
   * carries the route through it. § 3.2's rail-row prohibition is unchanged and still asserted
   * (`rail.test.ts`), so the screen is reached the way the guide says and by no other way.
   *
   * **What is left of it is the second door, and it is a row below rather than a deletion.** The
   * report draws four § 6.5 lever cards and every one of them routes to the Engineer panel that
   * carries out a fabric change; none is the sandbox lever. One door out of two is not the absence
   * this row named, so the row is rewritten to the half that is still true rather than kept for the
   * half that is not.
   *
   * **And the § 9 row below was rewritten on the same merge, in the other direction.** It read
   * *"§ 9 Endless rush — no held time, no setup screen"*; the setup screen landed, so half of that
   * sentence became false while the other half stayed exactly as true as it was. A row that has
   * become half wrong is the most dangerous shape in a register — it reads as verified and is not —
   * so it is narrowed to what remains missing, and where the refusal moved to (the screen's own
   * § 3.3 primary, `rushScreenModel.ts#RUSH_PRIMARY_REFUSAL`) is named rather than left for a reader
   * to discover.
   */
  '§ 6.5’s third lever does not open the tuner — two of the report’s four lever cards route to the Engineer panel that carries the advice out, which is the two `dev/reportPanel.ts#LEVER_SURFACES` names, the other two are a dispatcher recommendation a single day may not make and say so on the card, and § 3.2 gives the tuner two doors of which only the brief’s *Take it to the sandbox* is drawn here',
  '§ 9 Endless rush — the setup screen draws, and the climbing stream behind it does not exist, so its primary refuses; § 9.2’s held-time stage and § 9.3’s own result screen are unbuilt',
]);

/**
 * What the shell actually hands a screen's `mount` — the registry's contract plus the one seam
 * only the shell can provide: **the § 3.3 bar is the shell's element**, so a screen whose state
 * changes one of its cells (the fixit primary going `Run the day → Run it again`, the solved
 * inversion) cannot redraw it and must ask. `refreshBar` re-resolves the row through the mounted
 * module's `bar()` refinement and repaints, nothing else.
 *
 * Declared here rather than widening `screens.ts`'s {@link EverydayScreenContext}, deliberately:
 * the registry's contract stays the minimum a screen needs, and this is the shell's own extension
 * — every context the shell constructs satisfies it, and a screen that accepts this type is
 * saying it can only be mounted by the shell, which is true of every screen (`screens.ts`'s
 * registry has exactly one consumer).
 */
export interface EverydayScreenShellContext extends EverydayScreenContext {
  /** Redraw the § 3.3 row for the current state, through the mounted module's `bar()`. */
  refreshBar(): void;
  /**
   * § 3.2's *Switch to Engineer*, as a call — {@link EverydayShell.enterEngineer}, unchanged.
   *
   * Here rather than in `screens.ts`' {@link EverydayScreenContext} for that interface's own stated
   * reason: the swap is the shell's, not the registry's, and there is exactly one implementation of
   * it. It is **not a second door** — the rail's footer row calls the same function, both are
   * idempotent, and neither writes `inert` itself.
   *
   * Its one non-test caller is `everyday/reportScreen.ts`'s lever button (GitHub issue #213). That
   * button's label names an Engineer panel, and until this seam existed its handler navigated
   * *inside* this shell, so it named a surface it did not open.
   */
  enterEngineer(): void;
}

/**
 * What a mounted screen may hand back beyond `unmount`: the answer to the § 3.3 primary.
 *
 * The primary is the shell's button (§ 3.1 — no screen declares its own footer), so a registered
 * screen receives its press through the handle rather than drawing a second primary in the
 * region. Optional because a screen whose primary is resolved inert (`BarPrimary.inert`) or whose
 * row's primary navigates (none shipped yet) may have nothing to answer — and the shell draws an
 * inert primary disabled, so a missing handler is never a live button that silently does nothing.
 */
export interface MountedEverydayScreen extends EverydayScreenHandle {
  primary?(): void;
}

const RAIL_WIDTH_PX = 212;

/**
 * Above every overlay the Engineer surface raises.
 *
 * `dev/main.ts` mounts its menu, Fix-a-building and watch overlays as *siblings* of `div.shell` at
 * `z-index: 40`, so a shell at 40 loses the tie to whichever mounted last — which at boot is the
 * Engineer menu, and the page opens on the wrong front door. This is deliberately far above 40
 * rather than 41: the rail must stay reachable over any overlay, because it is the way out.
 */
const SHELL_Z_INDEX = 60;

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** The eyebrow style § 19 specifies — mono, small, tracked, `label` grey. */
const EYEBROW = `font:500 10px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;

/** The mounted shell. */
export interface EverydayShell {
  readonly root: HTMLElement;
  /** Navigate. Exposed for tests and for the rail; there is no initial-screen argument (§ 3.5). */
  go(screen: EverydayScreen): void;
  state(): EverydayState;
  /**
   * § 3.4's mid-run latch. While `true` and the player is on the stage, the bar's left button
   * (and the rail's Main menu row, which runs the same exit) shows the confirm strip instead of
   * leaving.
   *
   * **The data host is the shipped writer**: when {@link EverydayShellHost.host} is supplied the
   * shell syncs this latch from `EverydayHost.runState().open` on every host notification, so a
   * run the player started reaching the stage arms the strip and the day being filed disarms it.
   * The § 7 stage screen writes the same value through its context's `setRunOpen` on every host
   * notification, which is deliberate rather than redundant: the screen states its participation,
   * and because both writers read one fact — `runState().open` — they cannot disagree.
   */
  setRunOpen(open: boolean): void;
  /**
   * § 3.2's footer row, as a call — hand the page to the Engineer surface.
   *
   * Exposed for the same reason {@link go} is: it is a press a player makes, and a test that
   * performed the transition by reaching past this method would be testing a transition the product
   * does not have. Idempotent.
   */
  enterEngineer(): void;
  /** Which world has the page. `'engineer'` between the two presses, `'everyday'` otherwise. */
  world(): EverydayWorld;
  /**
   * Remove the shell and restore the Engineer surface **permanently**.
   *
   * Not what the swap does — the swap covers, and everything it covers stays mounted and running.
   * Nothing in the shipped page calls this; it is the mount's own teardown, and it exists so a test
   * that mounts a second shell into one document can take the first one down.
   */
  destroy(): void;
}

/** Which of the two shells the page belongs to at this moment. */
export type EverydayWorld = 'everyday' | 'engineer';

/**
 * What the shell is mounted over.
 *
 * **Two fields retired with the hand-off** and are named here rather than deleted silently, because
 * `everyday/boot.ts` passed both and a reader of that file will look for them: `engineerRoot` was
 * the element the shell inset beside the rail on `stage`, and `onEnter` was the hook that dismissed
 * the Engineer menu as the player crossed into it. § 7's stage is a screen, nothing is ever inset,
 * and the Engineer menu is closed once at boot by `boot.ts#closeEngineerMenuWhenReady` — which was
 * always the belt to `onEnter`'s brace and is now the whole fastening. An option the shell reads
 * nowhere is the dead seam this repository keeps a count of, so they went with their use.
 */
export interface EverydayShellHost {
  /**
   * The data host's slot — `everyday/boot.ts` passes {@link EVERYDAY_HOST} here, and
   * `dev/main.ts` publishes into it once its boot closure exists.
   *
   * A slot rather than a host, because the two shells boot in the wrong order for anything
   * simpler: this mount runs synchronously while `dev/main.ts`'s async `main()` is still fetching
   * `data/`. The shell reads `current()` for the screens' context and `whenReady` for two jobs —
   * syncing § 3.4's run-open latch from `runState().open`, and redrawing a registered screen that
   * was entered before the host arrived. Optional so a test document can mount the shell with no
   * simulation behind it — the menu, the rail and the refusals all draw without one.
   */
  readonly host?: EverydayHostSlot | undefined;
}

/**
 * Mount the shell into `document.body`.
 *
 * Always opens on the menu. See § 3.5 and the module docstring for why that is a rule rather than
 * a default.
 */
export function mountEverydayShell(doc: Document, options: EverydayShellHost = {}): EverydayShell {
  let state: EverydayState = { screen: EVERYDAY_ROOT, ctx: 'daily', modePick: 'today' };

  /** § 3.4's latch — see {@link EverydayShell.setRunOpen}. */
  let runOpen = false;

  /**
   * Whether § 3.4's confirm strip is standing in the bar's place, so a screen's `refreshBar` does
   * not wipe a question the player has not answered.
   *
   * A screen asks for a bar redraw whenever one of its own facts moves, and on the stage those
   * facts move on **host notifications** — a run landing, an intervention re-simulating. Both can
   * arrive while the strip is up, and an unguarded redraw would replace *Leave the day unfinished?*
   * with the ordinary row under the player's cursor: the click aimed at *Leave it* would land on
   * *Close the day*. The strip owns the bar until it is answered.
   */
  let confirmShowing = false;

  /** The data host, once `dev/main.ts` publishes it. See {@link EverydayShellHost.host}. */
  let dataHost: EverydayHost | undefined;

  /** The current host's own change unsubscribe, so a re-published host does not double-fire. */
  let dataHostUnsubscribe: (() => void) | undefined;

  /** The registered screen currently mounted in the region, so navigation can unmount it. */
  let mounted: MountedEverydayScreen | undefined;

  /*
   * § 20.15: the rail card and the settings screen read the name and avatar colour from one
   * place. This is that place's one page-wide instance; the subscription below is what makes a
   * name typed on the settings screen move the `PLAYING AS` card without a reload.
   */
  const profileStore = everydayProfileStore();

  const root = el(doc, 'div', EVERYDAY_ROOT_CLASS);

  /*
   * One geometry: the shell is the whole viewport, rail then screen region. It was two while the
   * stage handed off — a strip beside the inset Engineer surface — and collapsed to this when § 7's
   * stage became a screen. Keeping it here rather than in a stylesheet means the 212 px appears
   * exactly once, in {@link RAIL_WIDTH_PX}.
   */
  const RAIL = String(RAIL_WIDTH_PX) + 'px';
  const COMMON = [
    'position:fixed',
    'top:0',
    'bottom:0',
    'left:0',
    'display:grid',
    'overflow:hidden',
    `background:${C.paperDeep}`,
    `color:${C.ink}`,
    `font-family:${TYPE.body}`,
    `z-index:${String(SHELL_Z_INDEX)}`,
  ].join(';');
  const FULL = COMMON + `;right:0;grid-template-columns:${RAIL} minmax(0,1fr)`;
  root.style.cssText = FULL;

  /* --- The rail (§ 3.2). Dark ink ground; scrolls independently of the screen region. --- */
  const rail = el(doc, 'nav', 'everyday-rail');
  rail.setAttribute('aria-label', 'Everyday Mode');
  rail.style.cssText = [
    'overflow-y:auto',
    `background:${C.ink}`,
    `color:${C.paper}`,
    'padding:18px 14px',
    'display:flex',
    'flex-direction:column',
    `gap:${String(GAP.section)}px`,
    'box-sizing:border-box',
  ].join(';');

  /* --- Main: the screen region above, the pinned bar below (§ 3.1). --- */
  const main = el(doc, 'div', 'everyday-main');
  main.style.cssText =
    'display:grid;grid-template-rows:minmax(0,1fr) auto;overflow:hidden;min-width:0';

  const screenRegion = el(doc, 'div', 'everyday-screen');
  screenRegion.style.cssText = [
    'overflow-y:auto',
    'padding:28px 32px',
    'min-width:0',
    `background:linear-gradient(160deg,${C.paper},${C.paperDeep} 60%,${C.paperDeeper})`,
  ].join(';');

  /* § 3.3. Owned by the shell — no screen declares its own footer. */
  const bar = el(doc, 'div', 'everyday-bar');
  bar.style.cssText = [
    'display:flex',
    'align-items:center',
    `gap:${String(GAP.row + 2)}px`,
    'padding:10px 16px',
    `border-top:1px solid ${C.rule}`,
    `background:${C.card}`,
    'min-height:52px',
  ].join(';');

  main.append(screenRegion, bar);
  root.append(rail, main);

  doc.body.append(root);

  /**
   * Cover the page behind this shell, and keep the screen region laid out.
   *
   * **Never touches `hidden` or `display` on anything behind it** — see the module docstring: the
   * Engineer surface holds canvases that size from their laid-out box, and one measured under a
   * `display:none` ancestor paints nothing when revealed. Covering leaves it laid out and inert.
   *
   * The one `resize` is dispatched because this shell's own arrival changes what is on screen and
   * `everyday/stageScreen.ts` re-measures its canvas on that event like every other listener.
   */
  function coverEngineer(): void {
    setCoveredInert(true);
    doc.defaultView?.dispatchEvent(new Event('resize'));
  }

  /* ---------------------------------------------------------------- *
   * § 3.2's door — the swap, in both directions
   * ---------------------------------------------------------------- */

  /** Which world has the page. See {@link EverydayShell.world}. */
  let world: EverydayWorld = 'everyday';

  /**
   * Take this shell out of the paint and out of the page — **without taking it out of the layout**.
   *
   * `visibility` rather than `display`, and the reason is the module docstring's, pointed the other
   * way. A `display:none` ancestor collapses every box beneath it to zero, and this shell's screen
   * region can hold `everyday/stageScreen.ts` — a canvas sized from `getBoundingClientRect()` by a
   * `resize` listener that is still attached while the player is in the Engineer world. Hidden that
   * way, the first `resize` after the swap would size it to nothing and the return would paint an
   * empty stage. `visibility:hidden` suppresses the paint and leaves the box, so the rect the canvas
   * reads is the rect it will have when it is visible again.
   *
   * The other two writes are what `visibility` alone does not settle. `inert` is belt to
   * `visibility`'s braces — the attribute is what `menuPanel.ts#coverShell` and
   * {@link coverObserver} both speak, so writing it here keeps this root's state legible in the same
   * vocabulary as everything else on `body`. `aria-hidden` goes with it for `coverShell`'s own
   * stated reason: `inert` is the newer of the two, and a reader on an assistive technology that has
   * not implemented it would otherwise still be walked through a shell nobody can see.
   *
   * It is written through {@link setInert} like every other `inert` on this path. This root is
   * excluded from {@link coverObserver} so it cannot start the cycle, but the guard costs nothing
   * and the write that forgets it is the one that hangs.
   */
  function setEverydayCovered(covered: boolean): void {
    root.style.visibility = covered ? 'hidden' : '';
    setInert(root, covered);
    if (covered) root.setAttribute('aria-hidden', 'true');
    else root.removeAttribute('aria-hidden');
  }

  /**
   * § 3.2's *Switch to Engineer* — hand the page to the other shell.
   *
   * **The order of the two writes is the whole of the `inert` contract and is not interchangeable.**
   * {@link setCoveredInert}`(false)` goes first: it disconnects {@link coverObserver} *before*
   * anything else moves, so the re-assert that keeps the page inert while this shell is up cannot
   * fire against the transition and put back what this function is clearing. § D335's rule — *the
   * outer cover wins while it is up* — is not weakened by that; it is honoured, because this is the
   * moment the outer cover stops being up. `menuPanel.ts#coverShell` is then the only writer again,
   * which is exactly the state the Engineer surface expects to be in when nobody is covering it.
   *
   * Both writes are in one synchronous block, so no frame is painted between an uncovered Engineer
   * surface and a stepped-aside Everyday one. The `resize` at the end is § D335's own: this shell's
   * departure changes what is on screen, and every canvas on the surface now receiving it
   * re-measures on that event.
   */
  function enterEngineer(): void {
    if (world === 'engineer') return;
    world = 'engineer';
    setCoveredInert(false);
    setEverydayCovered(true);
    doc.defaultView?.dispatchEvent(new Event('resize'));
  }

  /**
   * The way back — `dev/main.ts`'s header control, through `everyday/swap.ts`'s port.
   *
   * The mirror of {@link enterEngineer}, in the mirrored order: this shell comes back first, then
   * {@link coverEngineer} re-inerts everything behind it and re-arms the observer. Nothing is
   * re-drawn and nothing is re-mounted — `state`, the mounted screen, § 3.4's latch and the data
   * host's subscription were all untouched by the trip, which is what makes the return land on the
   * screen the player left rather than at the front door.
   */
  function returnToEveryday(): void {
    if (world === 'everyday') return;
    world = 'everyday';
    setEverydayCovered(false);
    coverEngineer();
  }

  /**
   * Take the covered page out of the tab order, and put it back.
   *
   * A `z-index` decides what is *painted* on top and nothing else: while the shell covers the page,
   * every control behind it is still focusable and still announced, so <kbd>Tab</kbd> from the menu
   * walks into an Engineer menu the player cannot see. `menuPanel.ts#coverShell` already makes this
   * exact argument for the Engineer menu's own overlay.
   *
   * It sweeps `body`'s children rather than naming the Engineer roots, because the surfaces to cover
   * are that shell's business — it mounts three overlays as siblings and may mount more — and a
   * hard-coded list would be a fourth one waiting to be missed.
   *
   * **A single sweep is not enough, and that was measured rather than reasoned about.** `dev/main.ts`
   * boots asynchronously and mounts its menu overlay *after* this shell has already covered the
   * page, so the one-shot sweep left the Engineer menu fully interactive underneath: a click aimed
   * at a mode tile landed on the row behind it. {@link coverObserver} is what closes that window —
   * it inerts anything that arrives at `body` while the cover is up.
   */
  function setCoveredInert(covered: boolean): void {
    for (const child of doc.body.children) {
      if (child === root || !(child instanceof HTMLElement)) continue;
      setInert(child, covered);
    }
    if (covered) {
      coverObserver.observe(doc.body, { childList: true });
      for (const child of doc.body.children) watchInert(child);
    } else coverObserver.disconnect();
  }

  /**
   * Write `inert` only when it is actually changing — the guard that stops this from hanging.
   *
   * **`el.inert = true` on an element that is already inert is not a no-op.** The property reflects
   * an attribute, so the assignment calls `setAttribute` again, and `setAttribute` runs the attribute
   * change steps and records a mutation **even when the value is identical**. The re-assert in
   * {@link coverObserver} is therefore its own trigger: one write, one record, one callback, one
   * write. Measured, that starved the renderer completely — `page.evaluate` never returned and the
   * page never reached `load`, with no error anywhere, which is what a microtask loop looks like from
   * outside.
   *
   * Reading first costs nothing and breaks the cycle at the only place it can be broken. It is a
   * function rather than four inline `if`s because every write on this path needs it and the one
   * that forgets is the one that hangs.
   */
  function setInert(element: HTMLElement, inert: boolean): void {
    if (element.inert !== inert) element.inert = inert;
  }

  /**
   * Watch one element's `inert`, and nothing else's.
   *
   * A `MutationObserver` reports attribute changes on the **node it was given**, so watching `body`
   * alone sees `body`'s own attributes and never a child's. The obvious fix — `subtree: true` — is
   * the one to avoid: it also widens the `childList` half to every node added anywhere in the
   * document, and `dev/main.ts` rebuilds panel DOM sixty times a second. Measured, that wedged the
   * renderer hard enough that `page.evaluate` never returned and the page never fired `load`.
   *
   * So each of `body`'s direct children is observed individually, and a new one is picked up in the
   * callback below as it arrives. One observer, many targets, no traversal.
   */
  function watchInert(child: Element): void {
    if (child === root) return;
    coverObserver.observe(child, { attributes: true, attributeFilter: ['inert'] });
  }

  /**
   * Keep the page behind the cover inert — against arrivals, and against the other writer.
   *
   * Two halves, both measured rather than anticipated:
   *
   * 1. **Arrivals.** `dev/main.ts` boots asynchronously and mounts its overlays *after* the sweep in
   *    {@link setCoveredInert} has run, so a one-shot sweep left the Engineer menu fully interactive
   *    underneath this one and a click aimed at a mode tile landed on the row behind it.
   * 2. **The other writer.** `menuPanel.ts#coverShell` writes this same attribute, on the same
   *    elements, from the opposite direction: when the Engineer menu closes it *clears* `inert` on
   *    everything behind it — including `div.shell`, which this shell is covering. So closing that
   *    menu handed the Engineer surface back its whole tab order underneath an opaque overlay.
   *
   * Which is to say `inert` has two writers here, and the rule between them is **the outer cover
   * wins while it is up**: `coverShell` writes only when the Engineer menu is drawn, and this
   * re-asserts only while the Everyday shell is covering. What stops the pair from becoming a loop
   * is {@link setInert}, and nothing else — see its docstring for why the obvious version of this
   * function hangs the renderer.
   */
  const coverObserver = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target;
        if (target === root || !(target instanceof HTMLElement)) continue;
        setInert(target, true);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node === root || !(node instanceof HTMLElement)) continue;
        setInert(node, true);
        watchInert(node);
      }
    }
  });

  function go(screen: EverydayScreen): void {
    state = { ...state, screen };
    draw();
  }

  /**
   * § 3.4, in one place: the bar's left button and the rail's Main menu row both land here.
   *
   * A watched run never warns — `⤺ Stop watching` returns to the board immediately and clears the
   * spectator context. Mid-run only — the stage, with a run open — the bar becomes the confirm
   * strip. Everywhere else it leaves immediately: a report is already after the fact, and warning
   * about it would be theatre. Leaving clears the context.
   */
  function requestLeave(): void {
    if (state.screen === EVERYDAY_ROOT) return;
    if (state.ctx === 'watch') {
      state = { ...state, ctx: 'daily' };
      go('board');
      return;
    }
    const strip = confirmStripFor(state.ctx);
    if (state.screen === 'stage' && runOpen && strip !== undefined) {
      drawConfirm(strip.question, strip.consequence, strip.leaveLabel, strip.stayLabel);
      return;
    }
    doLeave();
  }

  /** Leave for real: clear the flow and land on the menu. */
  function doLeave(): void {
    runOpen = false;
    state = { ...state, ctx: 'daily' };
    go(EVERYDAY_ROOT);
  }

  /* ---------------------------------------------------------------- *
   * Drawing
   * ---------------------------------------------------------------- */

  /**
   * § 3.2's two campaign options, from the career the host holds.
   *
   * `inCampaign` and `openBuilding` are what gate the rail's `CAMPAIGN` group and name its middle
   * row, and both are facts about the campaign rather than about the shell — so they are read from
   * the host at draw time rather than latched. No host (a cold load, or a build with no campaign)
   * answers `{}`, which is the group not being drawn: a desk row labelled from nothing would be the
   * invented-label defect `rail.ts` refuses one layer down.
   */
  function campaignRailOptions(): { inCampaign?: boolean; openBuilding?: string | undefined } {
    if (state.ctx !== 'campaign' || dataHost === undefined) return {};
    const career = dataHost.campaign();
    const open = career.towers.find((tower) => tower.id === career.openTowerId);
    return {
      inCampaign: career.towers.length > 0,
      openBuilding: open === undefined ? undefined : dataHost.buildingById(open.buildingId)?.name,
    };
  }

  /**
   * § 3.2's career line, from the week the host holds — issue #214.
   *
   * The same shape as {@link campaignRailOptions} and for the same reason: the week is a fact about
   * the *host*, so it is read at draw time and no host answers `{}`. What made #214 worth a lane is
   * that the card was not reading a stale week — it was reading the **profile store**, which holds
   * a name and a colour and has no day count to hold, so its refusal was unconditional. The two
   * stores stay two (`profile.ts` argues why the profile is not a fourth key in `persist/`'s
   * envelope); the card now asks the one that keeps days.
   *
   * `dayClosed` travels with it because *Close the day* alone sets it and a restored week can carry
   * today's outcome without it — the same authority § 14's own cards answer to.
   */
  function weekRailOptions(): { week?: WeekState; dayClosed?: boolean } {
    if (dataHost === undefined) return {};
    return { week: dataHost.week(), dayClosed: dataHost.runState().dayClosed };
  }

  function drawRail(): void {
    rail.replaceChildren();
    const stored = profileStore.current();
    const model: RailModel = railModel(state, {
      ...campaignRailOptions(),
      ...weekRailOptions(),
      ...(stored === undefined
        ? {}
        : { profile: { name: stored.name, avatarColor: stored.avatarColor } }),
    });

    /* The brand block — the little lift glyph beside the two-line name, per the prototype. */
    const brand = el(doc, 'div');
    brand.style.cssText = 'display:flex;align-items:center;gap:10px';
    const glyph = el(doc, 'div');
    glyph.style.cssText = [
      'width:24px',
      'height:30px',
      'border-radius:4px',
      `background:${C.sun}`,
      'display:flex',
      'align-items:flex-end',
      'justify-content:center',
      'overflow:hidden',
      'flex:none',
    ].join(';');
    const door = el(doc, 'div');
    door.style.cssText = `width:100%;height:11px;background:${C.ink};opacity:.85`;
    glyph.append(door);
    const names = el(doc, 'div');
    const name = el(doc, 'div', undefined, model.brand);
    name.style.cssText = `font:700 16px ${TYPE.heading};letter-spacing:-.01em`;
    const modeLine = el(doc, 'div', undefined, model.mode);
    modeLine.style.cssText = `font:500 9.5px ${TYPE.mono};color:${C.fainter};letter-spacing:.14em;margin-top:1px`;
    names.append(name, modeLine);
    brand.append(glyph, names);
    rail.append(brand);

    /* Main menu, with § 3.2's live subline. Pressing it runs the same exit as the bar's left. */
    const onMenu = state.screen === EVERYDAY_ROOT;
    const menuRow = el(doc, 'button', 'everyday-rail-menu');
    menuRow.type = 'button';
    menuRow.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:10px',
      'text-align:left',
      `background:${onMenu ? C.sun : 'transparent'}`,
      `border:1px solid ${onMenu ? C.sun : RAIL_SURFACE.edge}`,
      'border-radius:11px',
      'padding:11px 13px',
      `color:${onMenu ? C.ink : C.fainter}`,
      'cursor:pointer',
      'width:100%',
      'box-sizing:border-box',
    ].join(';');
    const home = el(doc, 'span', undefined, '⌂');
    home.style.cssText = 'flex:none;font-size:12px';
    const menuText = el(doc, 'span');
    menuText.style.cssText = 'min-width:0';
    const menuLabel = el(doc, 'span', undefined, 'Main menu');
    menuLabel.style.cssText = `display:block;font:600 15px ${TYPE.heading}`;
    const sub = el(doc, 'span', undefined, model.subline);
    sub.style.cssText = `display:block;font:500 9.5px ${TYPE.mono};letter-spacing:.06em;color:${onMenu ? C.ink : C.label};margin-top:1px`;
    menuText.append(menuLabel, sub);
    menuRow.append(home, menuText);
    menuRow.addEventListener('click', requestLeave);
    rail.append(menuRow);

    for (const group of model.groups) {
      const block = el(doc, 'div');
      const title = el(doc, 'div', undefined, group.title);
      title.style.cssText = `${EYEBROW};margin:0 0 7px 4px`;
      block.append(title);
      for (const item of group.items) {
        const open = item.unavailable === undefined;
        const active = open && item.screen === state.screen;
        const row = el(doc, 'button');
        row.type = 'button';
        row.disabled = !open;
        row.style.cssText = [
          'display:block',
          'width:100%',
          'text-align:left',
          `background:${active ? C.sun : 'transparent'}`,
          'border:0',
          `border-radius:${String(R.control)}px`,
          'padding:8px 10px',
          'font-size:13px',
          'font-weight:600',
          'cursor:' + (open ? 'pointer' : 'not-allowed'),
          `color:${active ? C.ink : open ? C.fainter : C.warmGrey}`,
        ].join(';');
        const label = el(doc, 'span', undefined, item.label);
        row.append(label);
        if (item.unavailable !== undefined) {
          /*
           * The refusal is a drawn caption, not only a tooltip — the same argument the mode tiles
           * make: a `title` attribute is not a sentence a player reads.
           */
          const why = el(doc, 'span', undefined, item.unavailable);
          why.style.cssText = `display:block;font-size:10px;font-weight:400;color:${C.label};margin-top:2px`;
          row.append(why);
        } else {
          row.addEventListener('click', () => {
            go(item.screen);
          });
        }
        block.append(row);
      }
      rail.append(block);
    }

    /* § 3.2's footer: identity card, the bordered Settings row, the Engineer swap. */
    const footer = el(doc, 'div');
    footer.style.cssText = 'margin-top:auto;padding-top:18px';

    const card = el(doc, 'div', 'everyday-identity');
    card.style.cssText = `border-radius:${String(R.well)}px;background:${RAIL_SURFACE.card};padding:11px 12px`;
    const cardTop = el(doc, 'div');
    cardTop.style.cssText = 'display:flex;align-items:center;gap:8px';
    const avatar = el(doc, 'span', 'everyday-identity-avatar', model.footer.identity.initial);
    avatar.style.cssText = [
      'width:24px',
      'height:24px',
      'border-radius:50%',
      /* § 15.1's curated colour, from the same store the settings screen writes (§ 20.15). */
      `background:${model.footer.identity.avatarColor}`,
      `color:${C.ink}`,
      'display:flex',
      'align-items:center',
      'justify-content:center',
      `font:700 12px ${TYPE.heading}`,
      'flex:none',
    ].join(';');
    const idText = el(doc, 'div');
    idText.style.cssText = 'min-width:0';
    const idHeading = el(doc, 'div', undefined, model.footer.identity.heading);
    idHeading.style.cssText = `font:500 9px ${TYPE.mono};letter-spacing:.12em;color:${C.label}`;
    const idName = el(doc, 'div', undefined, model.footer.identity.name);
    idName.style.cssText = 'font-size:13px;font-weight:600;margin-top:1px';
    idText.append(idHeading, idName);
    cardTop.append(avatar, idText);
    const streak = el(doc, 'div', undefined, model.footer.identity.streak);
    streak.style.cssText = `font:500 11px ${TYPE.mono};color:${C.fainter};margin-top:6px`;
    card.append(cardTop, streak);
    footer.append(card);

    const settingsOpen = model.footer.settings.unavailable === undefined;
    const settingsRow = el(doc, 'button', 'everyday-rail-settings');
    settingsRow.type = 'button';
    settingsRow.disabled = !settingsOpen;
    settingsRow.style.cssText = [
      'width:100%',
      'box-sizing:border-box',
      'text-align:left',
      'margin-top:8px',
      'cursor:' + (settingsOpen ? 'pointer' : 'not-allowed'),
      `border:1px solid ${RAIL_SURFACE.edge}`,
      `border-radius:${String(R.row)}px`,
      'padding:9px 11px',
      'font-size:13px',
      'font-weight:600',
      'background:transparent',
      `color:${settingsOpen ? C.fainter : C.warmGrey}`,
      'display:flex',
      'align-items:center',
      'gap:9px',
      'flex-wrap:wrap',
    ].join(';');
    const gear = el(doc, 'span', undefined, '⚙');
    gear.style.cssText = 'flex:none;font-size:13px';
    settingsRow.append(gear, el(doc, 'span', undefined, model.footer.settings.label));
    const hint = el(doc, 'span', undefined, model.footer.settings.hint);
    hint.style.cssText = `margin-left:auto;font:500 9.5px ${TYPE.mono};color:${C.label}`;
    settingsRow.append(hint);
    if (model.footer.settings.unavailable !== undefined) {
      const why = el(
        doc,
        'span',
        undefined,
        model.footer.settings.unavailable,
      );
      why.style.cssText = `flex-basis:100%;font-size:10px;font-weight:400;color:${C.label}`;
      settingsRow.append(why);
    } else {
      settingsRow.addEventListener('click', () => {
        go(model.footer.settings.screen);
      });
    }
    footer.append(settingsRow);

    /*
     * § 3.2's last row, and the one control on this rail that is not a navigation: it hands the
     * whole page to the other shell. It is drawn like the Settings row above it rather than like a
     * mode tile, because it is chrome — and its note is drawn rather than left on `title`, on the
     * mode tiles' own argument that a tooltip is not a sentence a player reads. The note is not a
     * refusal; it is the two facts the label cannot carry.
     */
    const swap = el(doc, 'button', 'everyday-engineer-swap');
    swap.type = 'button';
    swap.style.cssText = [
      'width:100%',
      'box-sizing:border-box',
      'text-align:left',
      'margin-top:9px',
      'background:transparent',
      `border:1px solid ${RAIL_SURFACE.edge}`,
      `border-radius:${String(R.control)}px`,
      'padding:7px 10px',
      'font-size:11.5px',
      'font-weight:600',
      `color:${C.fainter}`,
      'cursor:pointer',
    ].join(';');
    const swapLabel = el(doc, 'span', undefined, model.footer.engineerSwap.label);
    swapLabel.style.cssText = 'display:block';
    const swapNote = el(doc, 'span', undefined, model.footer.engineerSwap.note);
    swapNote.style.cssText = `display:block;font-size:10px;font-weight:400;color:${C.label};margin-top:2px`;
    swap.append(swapLabel, swapNote);
    swap.addEventListener('click', enterEngineer);
    footer.append(swap);
    rail.append(footer);
  }

  /* --- § 3.3: the pinned bar, drawn from the table --- */

  const BUTTON = [
    'background:transparent',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.control)}px`,
    'padding:7px 12px',
    `color:${C.ink}`,
    'cursor:pointer',
    'font-size:12.5px',
    'font-weight:600',
  ].join(';');
  const PRIMARY = [
    `background:${C.sun}`,
    `border:1px solid ${C.sun}`,
    `border-radius:${String(R.row)}px`,
    'padding:9px 15px',
    `color:${C.ink}`,
    'cursor:pointer',
    'font-size:13px',
    'font-weight:600',
  ].join(';');
  const QUIET = [
    'background:transparent',
    `border:1px solid ${C.rule}`,
    `border-radius:${String(R.row)}px`,
    'padding:9px 15px',
    `color:${C.warmGrey}`,
    'cursor:pointer',
    'font-size:13px',
    'font-weight:600',
  ].join(';');

  /**
   * § 3.3's row for the current state. On an unbuilt screen the row is drawn **refusing**: the
   * left button and any back stop work — they are navigation, and navigation is built — while the
   * primary is disabled and the note is the screen's own refusal sentence, because a filled
   * primary over a screen that does not exist is a control that silently does nothing.
   */
  /**
   * A timeline stop's drawn label, with § 3.3's one placeholder in that table substituted.
   *
   * `TIMELINE_STEPS.campaign` carries the guide's cell verbatim as `⟨building⟩`, and the frame's own
   * rule is that **a `⟨…⟩` cell is never drawn** — a screen's `bar()` substitutes it. The timeline is
   * the one place no `bar()` can reach, because the shell reads the stops from the table rather than
   * from the model, so the substitution has to happen here.
   *
   * Found by `screens.test.ts`'s registry-wide placeholder guard, which was written after the brief
   * shipped `Running the lifts: ⟨style⟩` to a deployed page for a wave. The brief was the instance a
   * player met; this is the one the guard found next, and it is the reason the guard iterates the
   * whole registry in every run context rather than the screen that was broken.
   *
   * The fallback names no building rather than drawing the marker: with no tower open there is
   * nothing true to put here, and *the building* is a smaller claim than a typesetting mark.
   */
  function timelineLabel(label: string): string {
    if (!label.includes('⟨')) return label;
    const open = dataHost === undefined ? undefined : openTowerOf(dataHost.campaign());
    const named =
      open === undefined || dataHost === undefined
        ? undefined
        : dataHost.buildingById(open.buildingId)?.name;
    return label.replace('⟨building⟩', named ?? 'The building');
  }

  /**
   * Whether the stop **one past** the current step already holds something to read.
   *
   * § 3.3's strip was drawn from the row's own step alone, so every stop past the current screen
   * was faint and carried no listener. On the daily stage that made *4 How it went* evaluate
   * `4 <= 3` and be inert **in every state, by construction**, which is half of GitHub issue #206:
   * the day was filed, the sheet was written, and the one control naming it could not be pressed.
   *
   * Two bounds, and both are what keep this from becoming a shortcut through the flow.
   *
   * **The next stop only.** A stop two ahead is a screen the player has not produced yet, and a
   * lit one would offer a way past the step that produces it. Only the immediately-next stop is
   * ever asked about, which is why a `report` five steps along a campaign the player has not opened
   * cannot light because a *daily* day happens to be filed — the campaign stage runs its own day on
   * the way in, so the two flows cannot lend each other a sheet.
   *
   * **The report only, and only for the run on the stage.** It is the one stop whose screen can be
   * full before the flow arrives at it, because § 6.4 step 5 writes the sheet at the close rather
   * than on arrival; every other stop is a screen the player has yet to fill in. `dayClosed` is a
   * fact about the recording currently loaded, so this lights for the day in front of the player
   * and never for a sheet left standing from an earlier one — a lit *How it went* over an
   * unfinished day would be § 16 rule 4, *a button does what it says*, read the wrong way round.
   */
  function nextStopIsLive(screen: EverydayScreen): boolean {
    if (screen !== 'report' || dataHost === undefined) return false;
    return dataHost.runState().dayClosed && dataHost.lastReport() !== undefined;
  }

  function drawBar(): void {
    confirmShowing = false;
    bar.replaceChildren();
    /*
     * A registered screen refines the resolved row through its module's `bar()` — the § 3.3 cells
     * the guide leaves state-dependent are that screen's to substitute, and the shell draws
     * whatever comes back (`screens.ts`'s contract: an edited row, never a new shape).
     */
    const route = routeFor(state.screen);
    const module = route === 'screen' ? screenModuleFor(state.screen) : undefined;
    const model: ActionBarModel = module?.bar?.(state) ?? actionBarFor(state);
    const refusing = route === 'refusal';

    const leaveBtn = el(doc, 'button', 'everyday-bar-leave', model.leave.label);
    leaveBtn.type = 'button';
    leaveBtn.disabled = model.leave.inert;
    leaveBtn.style.cssText =
      BUTTON + (model.leave.inert ? `;color:${C.faint};cursor:default` : '');
    if (!model.leave.inert) leaveBtn.addEventListener('click', requestLeave);
    bar.append(leaveBtn);

    if (model.back !== undefined) {
      const backBtn = el(doc, 'button', 'everyday-bar-back', `‹ ${model.back.label}`);
      backBtn.type = 'button';
      backBtn.style.cssText = BUTTON;
      const target = model.back.screen;
      backBtn.addEventListener('click', () => {
        go(target);
      });
      bar.append(backBtn);
    }

    if (model.timeline !== undefined) {
      const stops = TIMELINE_STEPS[model.timeline.flow];
      const strip = el(doc, 'div', 'everyday-bar-timeline');
      strip.style.cssText = `display:flex;align-items:center;gap:${String(GAP.tight)}px;margin-left:6px`;
      for (const [index, stop] of stops.entries()) {
        const reached = index + 1 <= model.timeline.step;
        const current = index + 1 === model.timeline.step;
        /*
         * **Position in the flow is not the whole of it** — GitHub issue #206. The stop one past
         * the current step is live when the screen behind it already holds something to read; see
         * {@link nextStopIsLive}, which is the only reason a stop past the current step is ever
         * pressable. Everything else is unchanged: the current stop is where you are and never a
         * button, and a reached stop goes back.
         */
        const live =
          !current && (reached || (index === model.timeline.step && nextStopIsLive(stop.screen)));
        const step = el(doc, 'button', undefined, `${String(index + 1)} ${timelineLabel(stop.label)}`);
        step.type = 'button';
        step.disabled = !live;
        step.style.cssText = [
          'border:0',
          'background:transparent',
          `font:500 10.5px ${TYPE.mono}`,
          'padding:2px 3px',
          `color:${current ? C.ink : live ? C.label : C.ruleMid}`,
          'cursor:' + (live ? 'pointer' : 'default'),
        ].join(';');
        if (live) {
          step.addEventListener('click', () => {
            go(stop.screen);
          });
        }
        strip.append(step);
        if (index < stops.length - 1) {
          const sep = el(doc, 'span', undefined, '›');
          sep.style.cssText = `color:${C.ruleMid};font-size:10px`;
          strip.append(sep);
        }
      }
      bar.append(strip);
    }

    const spacer = el(doc, 'div');
    spacer.style.cssText = 'flex:1';
    bar.append(spacer);

    const noteText = refusing ? unbuiltReasonFor(state.screen) : model.note;
    if (noteText !== undefined) {
      const note = el(doc, 'span', 'everyday-bar-note', noteText);
      note.style.cssText = `color:${C.warmGrey};font-size:12px;max-width:44ch;text-align:right`;
      bar.append(note);
    }

    /*
     * § 3.3's emphasis inversion: on a last-step screen the way out is the loud button and the
     * primary goes quiet — the onward action stays available, quietly.
     */
    if (model.inverted && model.wayOut !== undefined) {
      const wayOut = el(doc, 'button', 'everyday-bar-wayout', model.wayOut);
      wayOut.type = 'button';
      wayOut.style.cssText = PRIMARY;
      wayOut.addEventListener('click', () => {
        if (state.ctx === 'campaign') go('towers');
        else if (state.ctx === 'rush') go('rush');
        else doLeave();
      });
      bar.append(wayOut);
    }

    const primaryBtn = el(doc, 'button', 'everyday-bar-primary', model.primary.label);
    primaryBtn.type = 'button';
    primaryBtn.style.cssText = model.inverted ? QUIET : PRIMARY;
    if (refusing) {
      primaryBtn.disabled = true;
      primaryBtn.style.cssText = QUIET + ';cursor:not-allowed';
      primaryBtn.title = unbuiltReasonFor(state.screen);
    } else if (model.primary.inert === true) {
      /* A resolved-inert primary — a screen state in which the press genuinely cannot act, e.g.
       * the fixit pair mid-run. Disabled rather than ignoring the click, so the button never
       * looks pressable while doing nothing. */
      primaryBtn.disabled = true;
      primaryBtn.style.cssText += ';opacity:.6;cursor:default';
    } else if (state.screen === EVERYDAY_ROOT) {
      /* § 3.3's menu row: the primary plays the selected card. */
      primaryBtn.addEventListener('click', () => {
        const picked = EVERYDAY_MODES.find((mode) => mode.pick === (state.modePick ?? 'today'));
        if (picked !== undefined && isPlayable(picked)) go(picked.screen);
      });
    } else if (route === 'screen' && mounted?.primary !== undefined) {
      /* A registered screen answers the primary through its mount handle — see
       * {@link MountedEverydayScreen}. */
      const press = mounted.primary;
      primaryBtn.addEventListener('click', () => {
        press();
      });
    } else if (state.screen === 'settings') {
      /*
       * § 3.3's settings row: the primary is `Back to the modes`, which is the same exit the left
       * button performs — wired here rather than in the screen module because the bar is the
       * shell's (§ 3.1), and a filled primary that did nothing would be the exact control this
       * frame refuses to draw.
       *
       * It sits below the registered-screen branch rather than above it because that branch now
       * asks whether the screen answers its own primary at all. Settings does not: its primary is
       * an *exit*, and `requestLeave` — the watch case, the § 3.4 strip, the `ctx` clear — is the
       * shell's to perform, not a screen's to reimplement through `go`.
       */
      primaryBtn.addEventListener('click', requestLeave);
    }
    bar.append(primaryBtn);
  }

  /**
   * § 3.4's confirm strip — replaces the whole bar until the player decides.
   *
   * *Leave it* leaves for real; *Stay* puts things back and nothing else changes.
   *
   * **One home again.** It had two while the stage handed off, because the handed-off stage drew no
   * § 3.3 bar and a strip painted into a hidden bar is a leave press that visibly does nothing. § 7's
   * stage is a screen with the shell's own bar under it, so § 3.4's own rule — the strip replaces
   * the bar — holds everywhere, and the second element and its `display` toggle went with the route
   * that needed them.
   */
  function drawConfirm(
    question: string,
    consequence: string,
    leaveLabel: string,
    stayLabel: string,
  ): void {
    bar.replaceChildren();
    const q = el(doc, 'span', 'everyday-bar-question', question);
    q.style.cssText = 'font-weight:600;font-size:13px';
    const why = el(doc, 'span', 'everyday-bar-consequence', consequence);
    why.style.cssText = `color:${C.warmGrey};font-size:12px`;
    const spacer = el(doc, 'div');
    spacer.style.cssText = 'flex:1';
    const leaveIt = el(doc, 'button', 'everyday-bar-confirm-leave', leaveLabel);
    leaveIt.type = 'button';
    leaveIt.style.cssText = BUTTON + `;color:${C.alarm};border-color:${C.alarm}`;
    leaveIt.addEventListener('click', doLeave);
    const stay = el(doc, 'button', 'everyday-bar-confirm-stay', stayLabel);
    stay.type = 'button';
    stay.style.cssText = PRIMARY;
    stay.addEventListener('click', drawBar);
    bar.append(q, why, spacer, leaveIt, stay);
    confirmShowing = true;
  }

  function drawMenu(): void {
    screenRegion.replaceChildren();
    const h = el(doc, 'h1', undefined, 'Elevator Sim');
    h.style.cssText = `margin:0 0 4px;font:700 26px ${TYPE.heading};letter-spacing:-.02em`;
    const lede = el(
      doc,
      'p',
      undefined,
      'Pick a way to play. Every mode runs the same simulator on the same seeds — what changes is how long you are in it and what it asks of you.',
    );
    lede.style.cssText = `margin:0 0 22px;color:${C.inkSoft};max-width:62ch;font-size:13px;line-height:1.5`;
    screenRegion.append(h, lede);

    const list = el(doc, 'div');
    list.style.cssText = `display:flex;flex-direction:column;gap:${String(GAP.row + 2)}px;max-width:640px`;
    for (const mode of EVERYDAY_MODES) list.append(modeTile(mode));
    screenRegion.append(list, absencesBlock());
  }

  /**
   * {@link EVERYDAY_SHELL_ABSENCES}, on the screen.
   *
   * **Drawn rather than only declared, and that is the whole point of it.** A register of what a
   * build does not do is worth exactly as much as the number of people who read it, and a constant
   * no renderer touches is read by nobody — which is the shape `packages/viz/src/deadCode.test.ts`
   * caught this array in on its first run, before this function existed. Putting it under the tiles
   * makes the list a thing a player sees and a thing a stale entry gets noticed in.
   */
  function absencesBlock(): HTMLElement {
    const block = el(doc, 'section');
    block.style.cssText = `margin-top:${String(GAP.wide)}px;max-width:640px`;
    const title = el(doc, 'h2', undefined, 'What this build does not do yet');
    title.style.cssText = `${EYEBROW};font-size:11px;margin:0 0 8px`;
    const list = el(doc, 'ul');
    list.style.cssText = `margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:${C.warmGrey}`;
    for (const absence of EVERYDAY_SHELL_ABSENCES) list.append(el(doc, 'li', undefined, absence));
    block.append(title, list);
    return block;
  }

  function modeTile(mode: EverydayMode): HTMLElement {
    const playable = isPlayable(mode);
    const tile = el(doc, 'button', 'everyday-mode');
    tile.type = 'button';
    tile.disabled = !playable;
    tile.setAttribute('data-screen', mode.screen);
    tile.style.cssText = [
      'text-align:left',
      'display:block',
      'width:100%',
      'padding:14px 16px',
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.tile)}px`,
      `background:${C.card}`,
      `color:${C.ink}`,
      'cursor:' + (playable ? 'pointer' : 'not-allowed'),
      'opacity:' + (playable ? '1' : '.62'),
    ].join(';');

    const title = el(doc, 'div', undefined, mode.title);
    title.style.cssText = `font:600 15px ${TYPE.heading}`;
    const blurb = el(doc, 'div', undefined, mode.blurb);
    blurb.style.cssText = `font-size:13px;color:${C.inkSoft};margin-top:3px`;
    const shape = el(doc, 'div', undefined, mode.shape);
    shape.style.cssText = `font:500 11px ${TYPE.mono};color:${C.label};margin-top:6px`;
    tile.append(title, blurb, shape);

    if (!playable) {
      /*
       * The refusal is drawn, not only a `title` attribute: a tooltip is not a sentence a player
       * reads, and the handoff requires the control to *say* it does not reach the simulation.
       */
      const why = el(doc, 'div', undefined, mode.unavailable ?? '');
      why.style.cssText = `font-size:11px;color:${C.terracotta};margin-top:8px`;
      tile.append(why);
    } else {
      tile.addEventListener('click', () => {
        /*
         * § 18's `ctx` follows the mode the tile commits to, and it is set **here** rather than
         * inferred from the screen: `stage` and `report` are one component per flow, § 3.3 splits
         * their bar rows by `ctx`, and `rail.ts` draws the `CAMPAIGN` group only inside one. A
         * campaign entered with `ctx: 'daily'` would put the daily timeline under § 8's screens
         * and hide the group that navigates them.
         */
        const ctx: RunContext =
          mode.pick === 'campaign' ? 'campaign' : mode.pick === 'rush' ? 'rush' : 'daily';
        state = { ...state, modePick: mode.pick, ctx };
        go(mode.screen);
      });
    }
    return tile;
  }

  /**
   * The router's refusal screen — a sentence a player reads, never a blank region.
   *
   * The sentence is `screens.ts`'s, the same one the rail caption and the mode tiles carry, so no
   * two surfaces refuse the same screen in different words.
   */
  function drawRefusal(screen: EverydayScreen): void {
    screenRegion.replaceChildren();
    const h = el(doc, 'h1', undefined, SCREEN_NAMES[screen]);
    h.style.cssText = `margin:0 0 8px;font:700 22px ${TYPE.heading}`;
    const p = el(doc, 'p', undefined, unbuiltReasonFor(screen));
    p.style.cssText = `color:${C.inkSoft};font-size:13px;max-width:60ch;line-height:1.5`;
    const back = el(
      doc,
      'p',
      undefined,
      'The rail’s Main menu takes you back to the modes.',
    );
    back.style.cssText = `color:${C.warmGrey};font-size:12px;max-width:60ch`;
    screenRegion.append(h, p, back);
  }

  /** Unmount whatever registered screen is in the region, if one is. */
  function unmountCurrent(): void {
    mounted?.unmount?.();
    mounted = undefined;
  }

  function draw(): void {
    unmountCurrent();
    drawRail();
    const route = routeFor(state.screen);
    coverEngineer();
    drawBar();
    if (route === 'menu') {
      drawMenu();
      return;
    }
    if (route === 'screen') {
      const module = screenModuleFor(state.screen);
      if (module !== undefined) {
        const screenHost = dataHost;
        if (screenHost === undefined) {
          drawHostPending(state.screen);
          return;
        }
        screenRegion.replaceChildren();
        const context: EverydayScreenShellContext = {
          ctx: state.ctx,
          host: screenHost,
          go,
          setRunOpen: (open) => {
            runOpen = open;
          },
          /*
           * Guarded rather than `drawBar` directly — see {@link confirmShowing}. A screen may ask
           * for a redraw at any moment, and one of those moments is while § 3.4's question is
           * standing where the row would be.
           */
          refreshBar: () => {
            if (!confirmShowing) drawBar();
          },
          /* § 3.2's swap, handed to the screen unchanged — see the interface's own docstring. */
          enterEngineer,
        };
        mounted = module.mount(screenRegion, context);
        /*
         * **Draw the bar again, now that there is a mount to answer its primary.**
         *
         * `drawBar()` above runs before this line, so on the *first* draw of a registered screen it
         * resolved the § 3.3 row while `mounted` was still `undefined` — and its
         * `route === 'screen' && mounted?.primary !== undefined` branch is what wires the press. The
         * result was a filled, enabled primary that did nothing until something else caused a
         * redraw: the exact silently-does-nothing control the handoff's definition of done forbids,
         * on the loudest button on the screen.
         *
         * It shipped unnoticed because the only registered screen with a `primary` was
         * `fixitScreen.ts`, which calls `refreshBar` from its own load handler a beat later and so
         * always had one by the time anybody pressed. A screen whose row is static — the front door,
         * the brief, the report, Your week — has nothing to trigger that beat, and the browser tier
         * found all four dead on the first press.
         *
         * Here rather than in each screen's `mount`, and that is the fix rather than a convenience:
         * a screen cannot call `refreshBar` early enough, because `mounted` is assigned by *this*
         * statement. The bar is the shell's element (§ 3.1) and its wiring is the shell's to get
         * right once.
         */
        drawBar();
        return;
      }
    }
    drawRefusal(state.screen);
  }

  /**
   * A registered screen entered before `dev/main.ts` published the host — reachable only in the
   * first instants of a cold load. Drawn rather than blanked, in the refusal screen's own shape;
   * {@link connectDataHost} redraws the moment the host arrives.
   */
  function drawHostPending(screen: EverydayScreen): void {
    screenRegion.replaceChildren();
    const h = el(doc, 'h1', undefined, SCREEN_NAMES[screen]);
    h.style.cssText = `margin:0 0 8px;font:700 22px ${TYPE.heading}`;
    const p = el(doc, 'p', undefined, HOST_PENDING_REASON);
    p.style.cssText = `color:${C.inkSoft};font-size:13px;max-width:60ch;line-height:1.5`;
    screenRegion.append(h, p);
  }

  /**
   * Take the published host — § 3.4's shipped writer, and the screens' data supply.
   *
   * The run-open latch is synced immediately and on every host notification, so the strip arms
   * when a run the player started lands on the stage and disarms when the day files. The redraw
   * arm covers the one early state {@link drawHostPending} draws: a registered screen mounted
   * before the host existed gets its real mount the moment it does.
   */
  function connectDataHost(next: EverydayHost): void {
    dataHostUnsubscribe?.();
    dataHost = next;
    const sync = (): void => {
      runOpen = next.runState().open;
    };
    sync();
    dataHostUnsubscribe = next.subscribe(sync);
    if (routeFor(state.screen) === 'screen' && mounted === undefined) draw();
  }

  const slotUnsubscribe = options.host?.whenReady(connectDataHost);

  draw();

  /*
   * § 20.15's check, made true by wiring rather than by luck: a profile write from any surface —
   * today that is the settings screen's name field and swatches — redraws the rail, so the
   * `PLAYING AS` card shows the new name and colour without a reload. Only the rail: the screen
   * region belongs to whatever is mounted in it, and the writer redraws its own words.
   */
  const stopProfileWatch = profileStore.subscribe(drawRail);

  /*
   * The return half of § 3.2's door — `everyday/swap.ts` has the argument for why it is a provided
   * port rather than an import. Published after the first `draw()`, so the header control cannot be
   * revealed over a shell that has not covered the page yet.
   */
  provideEverydaySwap({ returnToEveryday });

  return {
    root,
    go,
    state: () => state,
    setRunOpen: (open) => {
      runOpen = open;
    },
    enterEngineer,
    world: () => world,
    destroy: () => {
      stopProfileWatch();
      unmountCurrent();
      // The host wiring goes first: a destroyed shell must not hear another notification and
      // write a latch for a page it is no longer on.
      slotUnsubscribe?.();
      dataHostUnsubscribe?.();
      dataHost = undefined;
      /*
       * And the port goes with it, for the same reason one level up: a header button holding a
       * closure over a removed root would put an empty cover back over the page.
       */
      provideEverydaySwap(undefined);
      setCoveredInert(false);
      root.remove();
      doc.defaultView?.dispatchEvent(new Event('resize'));
    },
  };
}
