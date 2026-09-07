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
 */
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import { scenarioHubViewOf } from './scenarioModel.js';
import { el } from './screenDom.js';
import { EVERYDAY_COLORS as C, EVERYDAY_RADII as R, EVERYDAY_TYPE as TYPE } from './tokens.js';

function mount(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;
  const view = scenarioHubViewOf();

  const root = el(doc, 'div', 'everyday-scenario');
  root.style.cssText = `padding:30px 32px 34px;background:linear-gradient(160deg,${C.paper},${C.paperDeep} 65%,${C.paperDeeper});min-width:0`;

  const eyebrow = el(doc, 'div', 'everyday-scenario-eyebrow', view.eyebrow);
  eyebrow.style.cssText = `font:500 10.5px ${TYPE.mono};letter-spacing:.16em;color:${C.label};text-transform:uppercase`;
  const title = el(doc, 'h1', 'everyday-scenario-title', view.title);
  title.style.cssText = `font-family:${TYPE.heading};font-size:44px;line-height:1.02;font-weight:700;letter-spacing:-.03em;margin:10px 0 0;max-width:20ch`;
  const lede = el(doc, 'p', 'everyday-scenario-lede', view.lede);
  lede.style.cssText = `font-size:17px;line-height:1.55;color:${C.inkSoft};margin:13px 0 0;max-width:56ch;text-wrap:pretty`;
  root.append(eyebrow, title, lede);

  /* ------------------------------------------------------------- entries */
  const list = el(doc, 'div', 'everyday-scenario-entries');
  list.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin:26px 0 0;max-width:760px';

  for (const entry of view.entries) {
    /*
     * A button, not a card with a handler: the § 3.3 bar and the keyboard both need a real control,
     * and `viewportGates.browser.test.ts`'s clause 3 counts what a player can reach.
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
  root.append(list);

  /* ------------------------------------------------------------ absences */
  const note = el(doc, 'p', 'everyday-scenario-note', view.note);
  note.style.cssText = `font-size:13.5px;line-height:1.55;color:${C.inkSoft};margin:24px 0 0;max-width:60ch;text-wrap:pretty`;
  root.append(note);

  if (view.absences.length > 0) {
    const absences = el(doc, 'ul', 'everyday-scenario-absences');
    absences.style.cssText = `list-style:none;margin:12px 0 0;padding:14px 0 0;border-top:1px solid ${C.rule};max-width:60ch;display:grid;gap:9px`;
    for (const absence of view.absences) {
      const row = el(doc, 'li', 'everyday-scenario-absence', absence);
      row.style.cssText = `color:${C.inkSoft};font-size:13.5px;line-height:1.5;min-width:0`;
      absences.append(row);
    }
    root.append(absences);
  }

  host.append(root);

  /*
   * § 3.3's primary plays the first entry. The cards reach every entry; this reaches the one a
   * player who never leaves the bar would expect, which is what keeps the row live rather than
   * inert — see the row's own comment in `actionBar.ts`.
   */
  const first = view.entries[0];
  // Spread rather than assign `undefined`: `exactOptionalPropertyTypes` is on, so an explicit
  // `primary: undefined` is a different type from an absent one.
  return first === undefined ? {} : { primary: () => context.go(first.screen) };
}

export const SCENARIO_SCREEN: EverydayScreenModule = {
  key: 'scenario',
  mount,
};
