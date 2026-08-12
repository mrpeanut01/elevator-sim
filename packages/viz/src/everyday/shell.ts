/**
 * **The Everyday Mode shell** — GAMEPLAY § 3.1's geometry, § 3.2's rail, § 3.3's action bar.
 *
 * ## What it owns, and what it hands off
 *
 * It owns the frame: a 212 px rail, a scroll region showing **one screen at a time**, and a pinned
 * action bar. It draws the menu itself, because the menu is the shell's own front door (§ 3.5).
 * Every other screen it either hands off to the existing Engineer surface — which is what actually
 * runs a day today — or refuses with the reason, per `modes.ts` and `rail.ts`.
 *
 * ## The hand-off, stated plainly
 *
 * `dev/main.ts` builds and drives the whole existing application inside `div.shell`. The stage is
 * that surface. Rather than re-implement a working simulator view, this shell **covers and uncovers
 * it**: off-stage the shell is a full-viewport overlay, and on `stage` it shrinks to the 212 px rail
 * strip and insets `div.shell` beside it. That is a deliberate, reversible seam — the Engineer
 * product is untouched and still reachable, which is what the § 3.2 footer's *Switch to Engineer*
 * row is for once it is built.
 *
 * **It covers rather than hides, and the difference is load-bearing.** `div.shell` holds canvases
 * that size themselves from their laid-out box; a `display:none` ancestor gives them a zero box, and
 * a simulator view that was measured while hidden draws nothing when revealed. So the Engineer root
 * stays laid out for its whole life and the shell simply sits on top of it — and when the strip
 * changes the width beneath it, {@link mountEverydayShell} dispatches a `resize` so anything
 * listening re-measures.
 *
 * It is also honest about being a seam rather than the finished § 4 product: the stage a player
 * reaches is the Engineer stage with Casual copy, not § 7's Everyday stage with its race strip
 * geometry and campaign dock. {@link EVERYDAY_SHELL_ABSENCES} is the register, and the menu and
 * rail both read from the same refusal strings rather than each inventing their own.
 *
 * ## Why the app opens here and cannot be told not to
 *
 * § 3.5: *"The app always opens on the main menu, and this is not overridable. There is no
 * deep-link parameter and no `startScreen` prop; the prop was removed outright and must not come
 * back."* So this module exposes no initial-screen argument. A caller that wants to test a screen
 * calls {@link EverydayShell.go} after mounting, which is a navigation a player could also perform.
 */

import { EVERYDAY_MODES, isPlayable } from './modes.js';
import { railModel } from './rail.js';
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
  "§ 7's Everyday stage — the stage shown is the Engineer surface with Casual copy",
  '§ 6.1 front door and § 6.2 brief — Today’s tower opens the day directly',
  '§ 3.3’s timeline segments and note field in the action bar',
  '§ 3.3’s action bar is not drawn over the handed-off stage — the rail’s Main menu row is the way out',
  '§ 14 boards and § 12.2 ladder — both need a server this build has none of',
  '§ 9 Endless rush — no held time, no setup screen',
]);

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

/** The mounted shell. */
export interface EverydayShell {
  readonly root: HTMLElement;
  /** Navigate. Exposed for tests and for the rail; there is no initial-screen argument (§ 3.5). */
  go(screen: EverydayScreen): void;
  state(): EverydayState;
  /** Remove the shell and restore the Engineer surface. Used by the Engineer swap once built. */
  destroy(): void;
}

export interface EverydayShellHost {
  /**
   * The existing Engineer application root, shown for `stage` and hidden otherwise.
   *
   * Optional so the shell can be mounted in a test document that has no Engineer surface — the
   * menu, the rail and the refusals are all drawable without one.
   */
  readonly engineerRoot?: HTMLElement | undefined;
  /**
   * Called when the player leaves the menu into a mode that hands off to the Engineer surface.
   *
   * The shell does not reach into `dev/main.ts`; the host decides what "start Today's tower" means
   * so this module stays free of the other shell's internals.
   */
  readonly onEnter?: ((screen: EverydayScreen) => void) | undefined;
}

/**
 * Mount the shell into `document.body`.
 *
 * Always opens on the menu. See § 3.5 and the module docstring for why that is a rule rather than
 * a default.
 */
export function mountEverydayShell(doc: Document, host: EverydayShellHost = {}): EverydayShell {
  let state: EverydayState = { screen: EVERYDAY_ROOT, ctx: 'daily', history: [] };

  const root = el(doc, 'div', EVERYDAY_ROOT_CLASS);

  /*
   * Two geometries, one element. Off-stage the shell is the whole viewport; on-stage it is the rail
   * strip alone and the Engineer surface is inset beside it. Keeping both here rather than in a
   * stylesheet means the 212 px appears exactly once, in {@link RAIL_WIDTH_PX}.
   */
  const RAIL = String(RAIL_WIDTH_PX) + 'px';
  const COMMON = [
    'position:fixed',
    'top:0',
    'bottom:0',
    'left:0',
    'display:grid',
    'overflow:hidden',
    'background:var(--bg,#0b0d12)',
    'color:var(--ink,#e8ecf4)',
    `z-index:${String(SHELL_Z_INDEX)}`,
  ].join(';');
  const FULL = COMMON + `;right:0;grid-template-columns:${RAIL} minmax(0,1fr)`;
  const STRIP = COMMON + `;width:${RAIL};grid-template-columns:${RAIL}`;
  root.style.cssText = FULL;

  /* --- The rail (§ 3.2). Scrolls independently of the screen region. --- */
  const rail = el(doc, 'nav', 'everyday-rail');
  rail.setAttribute('aria-label', 'Everyday Mode');
  rail.style.cssText = [
    'overflow-y:auto',
    'border-right:1px solid var(--edge,#222836)',
    'padding:14px 12px',
    'display:flex',
    'flex-direction:column',
    'gap:14px',
  ].join(';');

  /* --- Main: the screen region above, the pinned bar below (§ 3.1). --- */
  const main = el(doc, 'div', 'everyday-main');
  main.style.cssText =
    'display:grid;grid-template-rows:minmax(0,1fr) auto;overflow:hidden;min-width:0';

  const screenRegion = el(doc, 'div', 'everyday-screen');
  screenRegion.style.cssText = 'overflow-y:auto;padding:28px 32px;min-width:0';

  /* § 3.3. Owned by the shell — no screen declares its own footer. */
  const bar = el(doc, 'div', 'everyday-bar');
  bar.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:10px',
    'padding:10px 16px',
    'border-top:1px solid var(--edge,#222836)',
    'background:var(--card,#11141c)',
    'min-height:52px',
  ].join(';');

  main.append(screenRegion, bar);
  root.append(rail, main);
  doc.body.append(root);

  /**
   * Uncover the Engineer surface, or cover it again.
   *
   * Never touches `hidden` or `display` — see the module docstring. Uncovering insets the surface by
   * the rail width and dispatches one `resize`, because `.shell` is `width:100%` and the canvases
   * inside it size from their laid-out box rather than from a media query.
   */
  function setEngineerUncovered(uncovered: boolean): void {
    root.style.cssText = uncovered ? STRIP : FULL;
    /*
     * `hidden` **and** an explicit `display`, because on this element `hidden` alone does nothing.
     * The attribute works through the user-agent rule `[hidden] { display: none }`, and this element
     * carries `display:grid` in its own `style` attribute — an inline declaration outranks any
     * stylesheet, so the region kept painting under the rail with the Engineer stage beside it. The
     * attribute stays for the accessibility tree; the property is what removes the box.
     */
    main.hidden = uncovered;
    main.style.display = uncovered ? 'none' : 'grid';
    const engineer = host.engineerRoot;
    if (engineer !== undefined) {
      engineer.style.marginLeft = uncovered ? RAIL : '';
      engineer.style.width = uncovered ? `calc(100% - ${RAIL})` : '';
    }
    setCoveredInert(!uncovered);
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
    const history =
      screen === EVERYDAY_ROOT ? [] : [...state.history, state.screen].filter((s) => s !== screen);
    state = { ...state, screen, history };
    draw();
    /*
     * **After the draw, and that ordering is a fix rather than a preference.** `draw` is what lifts
     * {@link setCoveredInert} off the page, and an `inert` subtree swallows clicks — including
     * scripted ones. Called before it, a host that hands off by pressing a control on the covered
     * surface (which is exactly what `everyday/boot.ts` does to dismiss the Engineer menu) presses
     * nothing at all, silently, and the player lands on a stage with that menu still over it.
     */
    if (screen !== EVERYDAY_ROOT) host.onEnter?.(screen);
  }

  function back(): void {
    const previous = state.history[state.history.length - 1] ?? EVERYDAY_ROOT;
    state = { ...state, screen: previous, history: state.history.slice(0, -1) };
    draw();
  }

  /* ---------------------------------------------------------------- *
   * Drawing
   * ---------------------------------------------------------------- */

  function drawRail(): void {
    rail.replaceChildren();
    const model = railModel(state);

    const brand = el(doc, 'div');
    brand.append(
      el(doc, 'div', undefined, model.brand),
      el(doc, 'div', undefined, model.mode),
    );
    const [name, mode] = [brand.children[0] as HTMLElement, brand.children[1] as HTMLElement];
    name.style.cssText = 'font-weight:650;font-size:15px';
    mode.style.cssText =
      'font-size:10px;letter-spacing:.14em;color:var(--dim,#8b93a7);margin-top:2px';
    rail.append(brand);

    /* Main menu, with § 3.2's live subline. Pressing it runs the same exit as the bar's left. */
    const menuRow = el(doc, 'button', 'everyday-rail-menu');
    menuRow.type = 'button';
    menuRow.style.cssText = [
      'text-align:left',
      'background:transparent',
      'border:1px solid var(--edge,#222836)',
      'border-radius:8px',
      'padding:8px 10px',
      'color:inherit',
      'cursor:pointer',
    ].join(';');
    const menuLabel = el(doc, 'div', undefined, 'Main menu');
    menuLabel.style.cssText = 'font-size:13px';
    const sub = el(doc, 'div', undefined, model.subline);
    sub.style.cssText = 'font-size:10px;letter-spacing:.1em;color:var(--dim,#8b93a7);margin-top:2px';
    menuRow.append(menuLabel, sub);
    menuRow.addEventListener('click', () => {
      go(EVERYDAY_ROOT);
    });
    rail.append(menuRow);

    for (const group of model.groups) {
      const block = el(doc, 'div');
      const title = el(doc, 'div', undefined, group.title);
      title.style.cssText =
        'font-size:10px;letter-spacing:.12em;color:var(--dim,#8b93a7);margin:0 0 6px 2px';
      block.append(title);
      for (const item of group.items) {
        const row = el(doc, 'button');
        row.type = 'button';
        row.disabled = item.unavailable !== undefined;
        row.style.cssText = [
          'display:block',
          'width:100%',
          'text-align:left',
          'background:transparent',
          'border:0',
          'padding:5px 2px',
          'font-size:13px',
          'cursor:' + (item.unavailable === undefined ? 'pointer' : 'not-allowed'),
          'color:' + (item.unavailable === undefined ? 'inherit' : 'var(--dim,#8b93a7)'),
        ].join(';');
        row.textContent = item.label;
        if (item.unavailable !== undefined) row.title = item.unavailable;
        else
          row.addEventListener('click', () => {
            go(item.screen);
          });
        block.append(row);
      }
      rail.append(block);
    }

    /* § 3.2's footer. The Engineer swap is a product-level route and is stubbed. */
    const footer = el(doc, 'div');
    footer.style.cssText = 'margin-top:auto;display:flex;flex-direction:column;gap:6px';
    const swap = el(doc, 'button', 'everyday-engineer-swap');
    swap.type = 'button';
    swap.textContent = 'Switch to Engineer';
    swap.disabled = true;
    swap.title = 'not built yet — Everyday Mode is the only play style in this build';
    swap.style.cssText = [
      'text-align:left',
      'background:transparent',
      'border:1px solid var(--edge,#222836)',
      'border-radius:8px',
      'padding:7px 10px',
      'font-size:12px',
      'color:var(--dim,#8b93a7)',
      'cursor:not-allowed',
    ].join(';');
    footer.append(swap);
    rail.append(footer);
  }

  function drawBar(): void {
    bar.replaceChildren();
    if (state.screen === EVERYDAY_ROOT) {
      const hint = el(doc, 'span', undefined, 'Pick how you want to play.');
      hint.style.cssText = 'color:var(--dim,#8b93a7);font-size:12px';
      bar.append(hint);
      return;
    }
    const leave = el(doc, 'button', undefined, 'Leave mode');
    leave.type = 'button';
    leave.style.cssText =
      'background:transparent;border:1px solid var(--edge,#222836);border-radius:8px;padding:6px 12px;color:inherit;cursor:pointer;font-size:12px';
    leave.addEventListener('click', () => {
      go(EVERYDAY_ROOT);
    });
    const backBtn = el(doc, 'button', undefined, '‹ Back');
    backBtn.type = 'button';
    backBtn.style.cssText = leave.style.cssText;
    backBtn.addEventListener('click', back);
    bar.append(leave, backBtn);
  }

  function drawMenu(): void {
    screenRegion.replaceChildren();
    const h = el(doc, 'h1', undefined, 'Elevator Sim');
    h.style.cssText = 'margin:0 0 4px;font-size:26px';
    const lede = el(
      doc,
      'p',
      undefined,
      'Pick a way to play. Every mode runs the same simulator on the same seeds — what changes is how long you are in it and what it asks of you.',
    );
    lede.style.cssText = 'margin:0 0 22px;color:var(--dim,#8b93a7);max-width:62ch;font-size:13px';
    screenRegion.append(h, lede);

    const list = el(doc, 'div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:10px;max-width:640px';
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
    block.style.cssText = 'margin-top:26px;max-width:640px';
    const title = el(doc, 'h2', undefined, 'What this build does not do yet');
    title.style.cssText =
      'font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim,#8b93a7);margin:0 0 8px';
    const list = el(doc, 'ul');
    list.style.cssText =
      'margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dim,#8b93a7)';
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
      'border:1px solid var(--edge,#222836)',
      'border-radius:12px',
      'background:var(--card,#11141c)',
      'color:inherit',
      'cursor:' + (playable ? 'pointer' : 'not-allowed'),
      'opacity:' + (playable ? '1' : '.55'),
    ].join(';');

    const title = el(doc, 'div', undefined, mode.title);
    title.style.cssText = 'font-weight:600;font-size:15px';
    const blurb = el(doc, 'div', undefined, mode.blurb);
    blurb.style.cssText = 'font-size:13px;color:var(--ink,#e8ecf4);opacity:.85;margin-top:3px';
    const shape = el(doc, 'div', undefined, mode.shape);
    shape.style.cssText = 'font-size:11px;color:var(--dim,#8b93a7);margin-top:6px';
    tile.append(title, blurb, shape);

    if (!playable) {
      /*
       * The refusal is drawn, not only a `title` attribute: a tooltip is not a sentence a player
       * reads, and the handoff requires the control to *say* it does not reach the simulation.
       */
      const why = el(doc, 'div', undefined, mode.unavailable ?? '');
      why.style.cssText = 'font-size:11px;color:var(--warn,#d8a24a);margin-top:8px';
      tile.append(why);
    } else {
      tile.addEventListener('click', () => {
        go(mode.screen);
      });
    }
    return tile;
  }

  /** A screen the shell routes to but has not built: say which, and how to get back. */
  function drawStub(screen: EverydayScreen): void {
    screenRegion.replaceChildren();
    const h = el(doc, 'h1', undefined, screen === 'door' ? "Today's tower" : screen);
    h.style.cssText = 'margin:0 0 8px;font-size:22px;text-transform:capitalize';
    const p = el(
      doc,
      'p',
      undefined,
      'This screen is not built yet. Everyday Mode’s shell and menu are in; the screen behind this route is not.',
    );
    p.style.cssText = 'color:var(--dim,#8b93a7);font-size:13px;max-width:60ch';
    screenRegion.append(h, p);
  }

  function draw(): void {
    drawRail();
    const onStage = state.screen === 'stage';
    setEngineerUncovered(onStage);
    if (onStage) return;
    drawBar();
    if (state.screen === EVERYDAY_ROOT) drawMenu();
    else drawStub(state.screen);
  }

  draw();

  return {
    root,
    go,
    state: () => state,
    destroy: () => {
      setCoveredInert(false);
      root.remove();
      const engineer = host.engineerRoot;
      if (engineer !== undefined) {
        engineer.style.marginLeft = '';
        engineer.style.width = '';
      }
      doc.defaultView?.dispatchEvent(new Event('resize'));
    },
  };
}
