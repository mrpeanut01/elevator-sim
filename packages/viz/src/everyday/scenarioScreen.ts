/**
 * **The Scenario hub, drawn — § D525's first tile.**
 *
 * Every word on this screen comes from `scenarioModel.ts`; this file is the mount and nothing else,
 * which is the split `everyday/` keeps so the words are sweepable without a document.
 *
 * The one behaviour worth naming: each entry routes with `context.go(entry.screen)`, the same
 * navigation a rail row performs. That is what keeps `door` and `fixit` reachable after § D525
 * retired their tiles, and `scenarioScreen.test.ts` drives the presses rather than asserting the
 * rows exist.
 *
 * ## The ordered path, and the two things drawing it costs — § D649
 *
 * The ten campaign stages are drawn from `scenarioLadderPort.ts`, which `dev/main.ts` provides
 * once `loadCampaign` resolves. Two consequences this mount owns:
 *
 * - **It redraws when the path arrives.** The shell mounts before that boot finishes, so a player
 *   who opens Scenario early would otherwise keep the absence for the rest of the session. The
 *   subscription is torn down in `destroy`, and a redraw re-reads the port rather than caching it.
 * - **A held row is not a control at all.** An offered stage is a `<button>`; a held one is a
 *   `<div>` with its refusal in it. Drawing a disabled button there would be GAMEPLAY § 20.12's
 *   dead control, and `viewportGates.browser.test.ts`'s clause 3 counts what a player can reach —
 *   a held stage must not be in that count.
 *
 * Where the offered stages open is `context.enterEngineer()`, the seam the shell already provides
 * and `reportScreen.ts`'s lever button already uses. The row says so on its own face; it is not a
 * second door, and it writes no `inert` of its own.
 */
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import { scenarioHubViewOf } from './scenarioModel.js';
import { onScenarioLadderProvided, scenarioLadder } from './scenarioLadderPort.js';
import { el } from './screenDom.js';
import { EVERYDAY_COLORS as C, EVERYDAY_RADII as R, EVERYDAY_TYPE as TYPE } from './tokens.js';

function mount(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let root: HTMLElement | undefined;

  function draw(): void {
    /*
     * The port is re-read on every draw rather than captured at mount. A captured path would be
     * the state this screen was built in, redrawn — which is the defect `EverydayScreenHandle.reread`
     * exists one seam over to fix.
     */
    const view = scenarioHubViewOf(scenarioLadder());

    const next = el(doc, 'div', 'everyday-scenario');
    next.style.cssText = `padding:30px 32px 34px;background:linear-gradient(160deg,${C.paper},${C.paperDeep} 65%,${C.paperDeeper});min-width:0`;

    const eyebrow = el(doc, 'div', 'everyday-scenario-eyebrow', view.eyebrow);
    eyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;color:${C.label};text-transform:uppercase`;
    const title = el(doc, 'h1', 'everyday-scenario-title', view.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:44px;line-height:1.02;font-weight:700;letter-spacing:-.03em;margin:10px 0 0;max-width:20ch`;
    const lede = el(doc, 'p', 'everyday-scenario-lede', view.lede);
    lede.style.cssText = `font-size:17px;line-height:1.55;color:${C.inkSoft};margin:13px 0 0;max-width:56ch;text-wrap:pretty`;
    next.append(eyebrow, title, lede);

    /* ------------------------------------------------------------- entries */
    const list = el(doc, 'div', 'everyday-scenario-entries');
    list.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin:26px 0 0;max-width:760px';

    for (const entry of view.entries) {
      /*
       * A button, not a card with a handler: the § 3.3 bar and the keyboard both need a real
       * control, and `viewportGates.browser.test.ts`'s clause 3 counts what a player can reach.
       */
      const card = el(doc, 'button', 'everyday-scenario-entry');
      card.type = 'button';
      card.dataset.entry = entry.id;
      card.style.cssText = `display:block;width:100%;text-align:left;padding:18px 20px 19px;border:1px solid ${C.rule};border-radius:${R.card};background:${C.paper};cursor:pointer;min-width:0`;

      const name = el(doc, 'div', 'everyday-scenario-entry-title', entry.title);
      name.style.cssText = `font-family:${TYPE.heading};font-size:20px;font-weight:650;letter-spacing:-.02em;color:${C.ink}`;
      const blurb = el(doc, 'div', 'everyday-scenario-entry-blurb', entry.blurb);
      blurb.style.cssText = `font-size:14px;line-height:1.5;color:${C.inkSoft};margin:7px 0 0;text-wrap:pretty`;
      const shape = el(doc, 'div', 'everyday-scenario-entry-shape', entry.shape);
      shape.style.cssText = `font:500 11px ${TYPE.mono};letter-spacing:.04em;color:${C.label};margin:11px 0 0`;

      card.append(name, blurb, shape);
      card.addEventListener('click', () => {
        context.go(entry.screen);
      });
      list.append(card);
    }
    next.append(list);

    /* ---------------------------------------------------------------- path */
    if (view.path !== undefined) next.append(pathBlock(doc, context, view.path));

    /* ------------------------------------------------------------ absences */
    const note = el(doc, 'p', 'everyday-scenario-note', view.note);
    note.style.cssText = `font-size:13.5px;line-height:1.55;color:${C.inkSoft};margin:24px 0 0;max-width:60ch;text-wrap:pretty`;
    next.append(note);

    if (view.absences.length > 0) {
      const absences = el(doc, 'ul', 'everyday-scenario-absences');
      absences.style.cssText = `list-style:none;margin:12px 0 0;padding:14px 0 0;border-top:1px solid ${C.rule};max-width:60ch;display:grid;gap:9px`;
      for (const absence of view.absences) {
        const row = el(doc, 'li', 'everyday-scenario-absence', absence);
        row.style.cssText = `color:${C.inkSoft};font-size:13.5px;line-height:1.5;min-width:0`;
        absences.append(row);
      }
      next.append(absences);
    }

    root?.remove();
    root = next;
    host.append(next);
  }

  draw();
  /*
   * The path arrives after this shell has mounted — `scenarioLadderPort.ts` has the window. A
   * screen that drew the absence once would keep it for the session, so it redraws, and the
   * subscription is torn down below.
   */
  const stopListening = onScenarioLadderProvided(() => {
    draw();
    context.refreshBar();
  });

  /*
   * § 3.3's primary plays the first entry. The cards reach every entry; this reaches the one a
   * player who never leaves the bar would expect, which is what keeps the row live rather than
   * inert — see the row's own comment in `actionBar.ts`.
   *
   * It stays the first **entry** rather than the path's first stage, and that is deliberate: the
   * path's first row may be held, and a § 3.3 primary that refused would be the dead control the
   * rows themselves are careful not to be.
   */
  const first = scenarioHubViewOf().entries[0];
  // Spread rather than assign `undefined`: `exactOptionalPropertyTypes` is on, so an explicit
  // `primary: undefined` is a different type from an absent one.
  return first === undefined
    ? { unmount: stopListening }
    : { unmount: stopListening, primary: () => context.go(first.screen) };
}

/**
 * The ordered path, drawn — § D649.
 *
 * **An offered stage is a `<button>` and a held one is not a control at all.** A disabled button
 * is GAMEPLAY § 20.12's dead control, and `viewportGates.browser.test.ts`'s clause 3 counts the
 * controls a player can reach: a held stage must not be in that count. Every word on both comes
 * from `scenarioModel.ts`; the only decision here is which element carries it.
 */
function pathBlock(
  doc: Document,
  context: EverydayScreenShellContext,
  path: NonNullable<ReturnType<typeof scenarioHubViewOf>['path']>,
): HTMLElement {
  const block = el(doc, 'section', 'everyday-scenario-path');
  block.style.cssText = `margin:30px 0 0;padding:22px 0 0;border-top:1px solid ${C.rule};max-width:760px;min-width:0`;

  const heading = el(doc, 'h2', 'everyday-scenario-path-heading', path.heading);
  heading.style.cssText = `font-family:${TYPE.heading};font-size:24px;font-weight:650;letter-spacing:-.02em;margin:0;color:${C.ink}`;
  const lede = el(doc, 'p', 'everyday-scenario-path-lede', path.lede);
  lede.style.cssText = `font-size:14.5px;line-height:1.55;color:${C.inkSoft};margin:8px 0 0;max-width:58ch;text-wrap:pretty`;
  const offer = el(doc, 'p', 'everyday-scenario-path-offer', path.offerLine);
  offer.style.cssText = `font:500 11px ${TYPE.mono};letter-spacing:.04em;color:${C.label};margin:10px 0 0`;
  block.append(heading, lede, offer);

  const rows = el(doc, 'ol', 'everyday-scenario-path-rows');
  rows.style.cssText = 'list-style:none;margin:16px 0 0;padding:0;display:grid;gap:12px';

  for (const row of path.rows) {
    const item = el(doc, 'li', 'everyday-scenario-path-row');
    item.style.cssText = 'margin:0;padding:0;min-width:0';

    const card = el(doc, row.playable ? 'button' : 'div', 'everyday-scenario-path-card');
    card.dataset.stage = row.id;
    card.dataset.playable = row.playable ? 'yes' : 'no';
    card.style.cssText =
      `display:block;width:100%;text-align:left;padding:16px 18px 17px;border:1px solid ${C.rule};` +
      `border-radius:${R.card};background:${row.playable ? C.paper : 'transparent'};min-width:0` +
      (row.playable ? ';cursor:pointer' : '');
    if (card instanceof HTMLButtonElement) {
      card.type = 'button';
      card.addEventListener('click', () => {
        context.enterEngineer();
      });
    }

    const position = el(doc, 'div', 'everyday-scenario-path-position', String(row.position));
    position.style.cssText = `font:500 11px ${TYPE.mono};letter-spacing:.06em;color:${C.label}`;
    const name = el(doc, 'div', 'everyday-scenario-path-title', row.title);
    name.style.cssText = `font-family:${TYPE.heading};font-size:18px;font-weight:650;letter-spacing:-.02em;color:${C.ink};margin:4px 0 0`;
    const teaches = el(doc, 'div', 'everyday-scenario-path-teaches', row.teaches);
    teaches.style.cssText = `font-size:13.5px;line-height:1.5;color:${C.inkSoft};margin:5px 0 0`;
    const opening = el(doc, 'p', 'everyday-scenario-path-opening', row.openingLine);
    opening.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:9px 0 0;max-width:58ch;text-wrap:pretty`;
    const shape = el(doc, 'div', 'everyday-scenario-path-shape', row.shape);
    shape.style.cssText = `font:500 11px ${TYPE.mono};letter-spacing:.04em;color:${C.label};margin:10px 0 0`;
    const budget = el(doc, 'p', 'everyday-scenario-path-budget', row.budgetLine);
    budget.style.cssText = `font-size:13px;line-height:1.5;color:${C.inkSoft};margin:7px 0 0;max-width:58ch;text-wrap:pretty`;
    /*
     * The count, in `scenario/survivors.ts`'s own words — `docs/38` § 2.1's *"drawn on the
     * scenario's own face in the player's words"*. It is drawn on **every** row, held or not: a
     * count that appeared only where it was flattering would be the one curated figure in the
     * product.
     */
    const ways = el(doc, 'p', 'everyday-scenario-path-ways', row.waysThrough);
    ways.style.cssText = `font-size:13px;line-height:1.5;color:${C.inkSoft};margin:7px 0 0;max-width:58ch;text-wrap:pretty`;

    card.append(position, name, teaches, opening, shape, budget, ways);

    const tail = row.playable ? row.note : row.refusal;
    if (tail !== undefined) {
      const line = el(doc, 'p', row.playable ? 'everyday-scenario-path-note' : 'everyday-scenario-path-refusal', tail);
      line.style.cssText = `font-size:13px;line-height:1.5;color:${C.inkSoft};margin:9px 0 0;max-width:58ch;text-wrap:pretty`;
      card.append(line);
    }

    item.append(card);
    rows.append(item);
  }
  block.append(rows);
  return block;
}

export const SCENARIO_SCREEN: EverydayScreenModule = {
  key: 'scenario',
  mount,
};
