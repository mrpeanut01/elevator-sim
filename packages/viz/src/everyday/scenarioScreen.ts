/**
 * **The Scenario hub, drawn — § D525's first tile.**
 *
 * Every word on this screen comes from `scenarioModel.ts`; this file is the mount and nothing else,
 * which is the split `everyday/` keeps so the words are sweepable without a document.
 *
 * The one behaviour worth naming: each entry routes with `context.go(entry.screen)`, the same
 * navigation a rail row performs. That is what keeps `door` and `fixit` reachable after § D525
 * retired their tiles.
 *
 * **Which file drives those presses, corrected.** This sentence read *"and `scenarioScreen.test.ts`
 * drives the presses rather than asserting the rows exist"* and **that file did not exist** — a
 * docstring citing a test nobody had written, which is `CLAUDE.md`'s stale-claim class pointed at
 * the evidence rather than at the product. It exists now and it does not drive a press either:
 * `vitest.config.ts` sets `environment: 'node'` for every project and there is no jsdom here, so no
 * node test in this package can click anything. The presses are driven in
 * `scenarioScreen.browser.test.ts`, against the built bundle, by the player's own route;
 * `scenarioScreen.test.ts` holds what is decidable without a document, and the two **entry** presses
 * are driven by every browser file that reaches a re-homed screen through
 * `browserTier.test-helper.ts#openScenarioEntry` — `shell`, `fixitScreen`, `standaloneScreens`,
 * `progress`, `campaignJourney`, `chimeTurns` and `keyboardJourneys`.
 *
 * ## The ordered path, and the two things drawing it costs — § D649
 *
 * The ten campaign stages are drawn from `scenarioLadderPort.ts`, which `dev/main.ts` provides
 * once `loadCampaign` resolves. Two consequences this mount owns:
 *
 * - **It redraws when the path arrives.** The shell mounts before that boot finishes, so a player
 *   who opens Scenario early would otherwise keep the absence for the rest of the session. The
 *   subscription is torn down in `destroy`, and a redraw re-reads the port rather than caching it.
 * - **A held row is not a control at all.** An offered stage's head is a `<button>`; a held one's
 *   is a `<div>`, and its refusal is drawn under it either way. Drawing a disabled button there
 *   would be GAMEPLAY § 20.12's dead control, and `viewportGates.browser.test.ts`'s clause 3 counts
 *   what a player can reach — a held stage must not be in that count. **The head rather than the
 *   whole card**, since `smallScreen.browser.test.ts` measured a card at 620–788 px against a
 *   250 px scrollport at 360 px: see the mount site for the measurement.
 *
 * ## Where an offered stage opens — § D787
 *
 * Two calls in one turn, and neither is a second door. `context.enterEngineer()` hands the page
 * over, exactly as the rail's footer row and `reportScreen.ts`'s lever button do, and writes no
 * `inert` of its own. `scenarioOpenPort.ts#scenarioOpen` then puts **that row's** stage in the
 * campaign picker and brings its tab to the front.
 *
 * This paragraph used to end at the first call, and so did the code: every offered row called
 * `enterEngineer()`, which takes no argument, so three buttons performed one swap and the player
 * arrived at whatever stage the picker was holding. The row's face said *"Opens on the Engineer
 * surface"*, which was true of the swap and is why this was a gap rather than a lie — but a hub
 * whose every press lands in the same place is a table of contents, and `docs/38` § 2.1 makes this
 * the one mode a first-time player meets.
 */
import type { EverydayScreenModule } from './screens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';
import { scenarioHubViewOf } from './scenarioModel.js';
import { onScenarioLadderProvided, scenarioLadder } from './scenarioLadderPort.js';
import { everydayDeviceChimeStore } from './chimeStore.js';
import { closeStageInFixit, openStageInFixit } from './stagePlayScreen.js';
import { el } from './screenDom.js';
import { EVERYDAY_COLORS as C, EVERYDAY_RADII as R, EVERYDAY_TYPE as TYPE } from './tokens.js';

/**
 * The stages this device has been paid a clear for — § D1129 clause 4. Read off the device ledger,
 * the record the pay line itself writes to, so the hub's mark and the award are one fact.
 */
function clearedStageIds(): ReadonlySet<string> {
  return new Set(
    everydayDeviceChimeStore()
      .record()
      .turns.filter((turn) => turn.completion === 'scenario-cleared')
      .map((turn) => turn.key),
  );
}

function mount(host: HTMLElement, context: EverydayScreenShellContext): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let root: HTMLElement | undefined;

  function draw(): void {
    /*
     * The port is re-read on every draw rather than captured at mount. A captured path would be
     * the state this screen was built in, redrawn — which is the defect `EverydayScreenHandle.reread`
     * exists one seam over to fix.
     */
    const view = scenarioHubViewOf(scenarioLadder(), clearedStageIds());

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
        /* *Fix a building* opens the cases, never a stage left open from the path (§ D1129). */
        if (entry.screen === 'fixit') closeStageInFixit();
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
    /*
     * **No `context.refreshBar()` here, and the absence is the point.** The § 3.3 primary is the
     * first *entry*, which the path does not touch — see the comment on it below — so asking for a
     * bar redraw would be motion over a row that cannot have changed, and `shell.ts` keeps a guard
     * for a confirm strip a redraw would wipe. A screen asks for that redraw when one of its own
     * bar facts moves; none of this screen's do.
     */
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
 * **An offered stage's head is a `<button>` and a held one is not a control at all.** A disabled
 * button is GAMEPLAY § 20.12's dead control, and `viewportGates.browser.test.ts`'s clause 3 counts
 * the controls a player can reach: a held stage must not be in that count. Every word on both comes
 * from `scenarioModel.ts`; the only decisions here are which element carries it and — since the
 * measurement in the loop below — how much of the card the control is.
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

  /*
   * Every cell inside a card is a `div`, never a `p`. An offered row's head **is** a button, and
   * `<p>` inside `<button>` is outside that element's content model — the two entry cards above
   * have used `div` for the same reason since they were written. Held rows follow so that the two
   * shapes are one stylesheet rather than two.
   */
  for (const row of path.rows) {
    const item = el(doc, 'li', 'everyday-scenario-path-row');
    item.style.cssText = 'margin:0;padding:0;min-width:0';

    const card = el(doc, 'div', 'everyday-scenario-path-card');
    card.dataset.stage = row.id;
    card.dataset.playable = row.playable ? 'yes' : 'no';
    card.style.cssText =
      `display:block;width:100%;text-align:left;padding:16px 18px 17px;border:1px solid ${C.rule};` +
      `border-radius:${R.card};background:${row.playable ? C.paper : 'transparent'};min-width:0`;

    /*
     * **The control is the row's head, not the whole card, and that is a measurement rather than a
     * preference.** The card was the `<button>` until `smallScreen.browser.test.ts` measured it at
     * 360 px: a stage's card runs **620 to 788 px tall** there, because eight stacked paragraphs
     * wrap hard at 268 px, and the shell leaves `main.everyday-screen` a **250 px** scrollport at
     * that width — the consent ask takes 408 px of the 750 px under the narrow header and the
     * pinned bar takes 92. So no gesture could bring a whole card inside the viewport, and § 2's
     * clause 3 reported three controls out of reach: stages 1, 3 and 5, the three offered ones.
     * The held rows were invisible to it for the reason below — they are not controls.
     *
     * A control cannot be made reachable by scrolling when it is taller than the box it scrolls in,
     * so the fix is the one the two entry cards above already demonstrate: **a control the size of
     * the row's identity**, with the rest of the words beside it rather than inside it. The head is
     * ~140 px, every word the row had is still drawn, in the same order, and the invariant this
     * block was written for is untouched — an offered stage has exactly one button and a held one
     * has none, so `viewportGates.browser.test.ts`'s clause 3 counts what it counted before.
     *
     * Borderless and transparent on purpose: the card keeps the frame, so the head is a control
     * without being a second box drawn inside a box.
     */
    const head = el(doc, row.playable ? 'button' : 'div', 'everyday-scenario-path-head');
    head.style.cssText =
      'display:block;width:100%;text-align:left;padding:0;border:none;background:transparent;' +
      `color:${C.ink};min-width:0` + (row.playable ? ';cursor:pointer' : '');
    if (head instanceof HTMLButtonElement) {
      head.type = 'button';
      head.addEventListener('click', () => {
        /*
         * **The stage opens in the fix-it editor, in this world** — [§ D1129](../../../../DECISIONS.md),
         * the swarm's Q3 ruling. This press used to swap to the Engineer surface and open the stage
         * in the Lab (§ D787), which played it under another building's header, with a budget it did
         * not show and an admission the hub's census did not share, and paid nothing for a clear.
         * The Lab is still one press away, from the stage's own page.
         */
        openStageInFixit(row.id);
        context.go('fixit');
      });
    }

    const position = el(doc, 'div', 'everyday-scenario-path-position', String(row.position));
    position.style.cssText = `font:500 11px ${TYPE.mono};letter-spacing:.06em;color:${C.label}`;
    const name = el(doc, 'div', 'everyday-scenario-path-title', row.title);
    name.style.cssText = `font-family:${TYPE.heading};font-size:18px;font-weight:650;letter-spacing:-.02em;color:${C.ink};margin:4px 0 0`;
    const teaches = el(doc, 'div', 'everyday-scenario-path-teaches', row.teaches);
    teaches.style.cssText = `font-size:13.5px;line-height:1.5;color:${C.inkSoft};margin:5px 0 0`;
    const opening = el(doc, 'div', 'everyday-scenario-path-opening', row.openingLine);
    opening.style.cssText = `font-size:14px;line-height:1.55;color:${C.inkSoft};margin:9px 0 0;max-width:58ch;text-wrap:pretty`;
    const shape = el(doc, 'div', 'everyday-scenario-path-shape', row.shape);
    shape.style.cssText = `font:500 11px ${TYPE.mono};letter-spacing:.04em;color:${C.label};margin:10px 0 0`;
    const budget = el(doc, 'div', 'everyday-scenario-path-budget', row.budgetLine);
    budget.style.cssText = `font-size:13px;line-height:1.5;color:${C.inkSoft};margin:7px 0 0;max-width:58ch;text-wrap:pretty`;
    /*
     * The count, in `scenario/survivors.ts`'s own words — `docs/38` § 2.1's *"drawn on the
     * scenario's own face in the player's words"*. It is drawn on **every** row, held or not: a
     * count that appeared only where it was flattering would be the one curated figure in the
     * product.
     */
    const ways = el(doc, 'div', 'everyday-scenario-path-ways', row.waysThrough);
    ways.style.cssText = `font-size:13px;line-height:1.5;color:${C.inkSoft};margin:7px 0 0;max-width:58ch;text-wrap:pretty`;

    head.append(position, name, teaches);
    card.append(head, opening, shape, budget, ways);

    if (row.cleared !== undefined) {
      card.dataset.cleared = 'yes';
      const done = el(doc, 'div', 'everyday-scenario-path-cleared', row.cleared);
      done.style.cssText = `font:600 12px ${TYPE.body};color:${C.moss};margin:9px 0 0;max-width:58ch`;
      card.append(done);
    }

    const tail = row.playable ? row.note : row.refusal;
    if (tail !== undefined) {
      const line = el(doc, 'div', row.playable ? 'everyday-scenario-path-note' : 'everyday-scenario-path-refusal', tail);
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
