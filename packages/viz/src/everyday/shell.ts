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
 * ## The hand-off retired, and what that cost
 *
 * § D335 shipped `stage` as a *hand-off*: the shell shrank to the 212 px rail strip, uncovered
 * `div.shell` and inset the whole Engineer application beside it. It was honest, it was reversible,
 * and it was not § 7. `everyday/stageScreen.ts` is now § 7's stage — a registered screen like any
 * other — so `screens.ts` has no `'handoff'` route left to return and this module has no second
 * geometry to draw.
 *
 * **The shell therefore covers the Engineer surface for its whole life, and it still covers rather
 * than hides.** The difference stays load-bearing: `div.shell` holds canvases that size themselves
 * from their laid-out box, a `display:none` ancestor gives them a zero box, and a simulator view
 * measured while hidden draws nothing when revealed. The Engineer root stays laid out, `inert`, and
 * exactly as it was — it boots and runs unchanged, which is what makes reverting one line of
 * `packages/viz/index.html` a working product rather than a hope.
 *
 * What it no longer has is a **door**: the § 3.2 footer's *Switch to Engineer* row is that door and
 * it is not built, so nothing in this build opens the Engineer surface. That is the one thing this
 * change took away and it is the second entry of {@link EVERYDAY_SHELL_ABSENCES} rather than a
 * discovery waiting to happen. It also makes `types.ts#ENGINEER_SWAP_REFUSAL` — *"Everyday Mode is
 * the only play style in this build"* — true, which it was not while the stage handed off.
 *
 * ## Why the app opens here and cannot be told not to
 *
 * § 3.5: *"The app always opens on the main menu, and this is not overridable. There is no
 * deep-link parameter and no `startScreen` prop; the prop was removed outright and must not come
 * back."* So this module exposes no initial-screen argument. A caller that wants to test a screen
 * calls {@link EverydayShell.go} after mounting, which is a navigation a player could also perform.
 */

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
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_RAIL_SURFACES as RAIL_SURFACE,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayMode, EverydayScreen, EverydayState } from './types.js';
import { EVERYDAY_ROOT, EVERYDAY_ROOT_CLASS } from './types.js';

/**
 * What this shell does not yet do, in one place.
 *
 * `docs/18`'s register of honest absences does not name the shell, because the build plan's § 0
 * recorded it as already existing. This is the entry that was missing, kept next to the code so it
 * cannot go stale the way a prose row in a plan did.
 */
export const EVERYDAY_SHELL_ABSENCES: readonly string[] = Object.freeze([
  '§ 6.1 front door and § 6.2 brief — Today’s tower opens the day directly',
  'the Engineer surface still boots and runs behind this shell, and nothing here opens it — the rail’s Switch to Engineer row is that door and it is not built; one line of packages/viz/index.html reverts the whole product to it',
  '§ 14 boards and § 12.2 ladder — both need a server this build has none of',
  '§ 9 Endless rush — no held time, no setup screen',
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
  /** Remove the shell and restore the Engineer surface. Used by the Engineer swap once built. */
  destroy(): void;
}

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

  function drawRail(): void {
    rail.replaceChildren();
    const stored = profileStore.current();
    const model: RailModel = railModel(
      state,
      stored === undefined
        ? {}
        : { profile: { name: stored.name, avatarColor: stored.avatarColor } },
    );

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

    /* § 3.2's footer: identity card, the bordered Settings row, the stubbed Engineer swap. */
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

    const swap = el(doc, 'button', 'everyday-engineer-swap');
    swap.type = 'button';
    swap.textContent = model.footer.engineerSwap.label;
    swap.disabled = model.footer.engineerSwap.unavailable !== undefined;
    if (model.footer.engineerSwap.unavailable !== undefined) {
      swap.title = model.footer.engineerSwap.unavailable;
    }
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
      `color:${C.warmGrey}`,
      'cursor:not-allowed',
    ].join(';');
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
        const step = el(doc, 'button', undefined, `${String(index + 1)} ${stop.label}`);
        step.type = 'button';
        step.disabled = !reached || current;
        step.style.cssText = [
          'border:0',
          'background:transparent',
          `font:500 10.5px ${TYPE.mono}`,
          'padding:2px 3px',
          `color:${current ? C.ink : reached ? C.label : C.ruleMid}`,
          'cursor:' + (reached && !current ? 'pointer' : 'default'),
        ].join(';');
        if (reached && !current) {
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
        state = { ...state, modePick: mode.pick };
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
        };
        mounted = module.mount(screenRegion, context);
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

  return {
    root,
    go,
    state: () => state,
    setRunOpen: (open) => {
      runOpen = open;
    },
    destroy: () => {
      stopProfileWatch();
      unmountCurrent();
      // The host wiring goes first: a destroyed shell must not hear another notification and
      // write a latch for a page it is no longer on.
      slotUnsubscribe?.();
      dataHostUnsubscribe?.();
      dataHost = undefined;
      setCoveredInert(false);
      root.remove();
      doc.defaultView?.dispatchEvent(new Event('resize'));
    },
  };
}
