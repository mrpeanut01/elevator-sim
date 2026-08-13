/**
 * **The brief** — GAMEPLAY § 6.2, the DOM half. Every word is `briefView.ts`'s and every fact is
 * `today.ts`'s; this file draws them, draws the cutaway elevation, and wires the one control on
 * the screen that writes: the dispatcher picker.
 *
 * ## The elevation
 *
 * § 6.2 asks for *"a cutaway elevation of today's tower drawn to canvas: roof slab, storeys with
 * windows, three shaft wells cut as dark voids, a car parked in each working well, the
 * out-of-service well dashed in terracotta with a lettered badge, an entrance canopy, floor
 * numbers at top, middle and ground."* {@link drawElevation} draws exactly that, and **every**
 * quantity in it comes from the resolved building: the storey count is `floors.length`, the wells
 * are the building's own cars in bank order, and the dashed well is the car
 * `shift/incidents.ts#carsToDerate` actually holds today — the same call the run makes, so the
 * badge on this drawing and the car the kernel stands down are one decision (§ 16 rule 14).
 *
 * ENGINE_CONTRACT § 14's canvas rules are followed: the bounding rect is read and multiplied by
 * `min(2, devicePixelRatio)`, the transform is set rather than the CSS scaled, the drawing is
 * redrawn on resize, and the listener is dropped on unmount. A context this environment does not
 * provide is handled by drawing nothing — a node tier has no 2D context, and a screen that threw
 * there would make the rest of the brief untestable to protect a picture.
 */

import type { ResolvedBuilding } from '@elevator-sim/core/browser';

import { carsToDerate } from '../shift/incidents.js';

import { briefScreenViewOf, type BriefRefusalCard, type BriefScreenView } from './briefView.js';
import { dispatcherCardOf } from '../dev/rightRail.js';
import type { EverydayScreenModule } from './screens.js';
import {
  BODY,
  CARD,
  el,
  EYEBROW,
  MONO,
  pill,
  QUIET,
  section,
  WELL,
} from './screenDom.js';
import { todayOf, type TodayRecord } from './today.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_GAPS as GAP,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayScreenShellContext, MountedEverydayScreen } from './shell.js';

/** The drawing's aspect. The prototype's card is a tall panel; this is its ratio. */
const ELEVATION_HEIGHT_PX = 300;

/** ENGINE_CONTRACT § 14: *multiply by `min(2, devicePixelRatio)`*. */
const MAX_PIXEL_RATIO = 2;

function mountBrief(
  host: HTMLElement,
  context: EverydayScreenShellContext,
): MountedEverydayScreen {
  const doc = host.ownerDocument;
  let alive = true;

  const root = el(doc, 'div', 'everyday-brief');
  root.style.cssText = [
    'display:grid',
    'grid-template-columns:340px minmax(0,1fr)',
    `gap:${String(GAP.wide)}px`,
    'align-items:start',
  ].join(';');
  host.append(root);

  const canvas = doc.createElement('canvas');
  canvas.className = 'everyday-brief-elevation';
  canvas.style.cssText = `width:100%;height:${String(ELEVATION_HEIGHT_PX)}px;display:block`;

  /** The day and the view, rebuilt from the host on every draw. */
  function factsNow(): { readonly today: TodayRecord; readonly view: BriefScreenView } {
    const { host: data } = context;
    const selection = data.selection();
    const dispatchers = data.dispatchers();
    const today = todayOf({
      week: data.week(),
      calendar: data.calendarPeriod(),
      building: data.resolvedBuilding(),
      buildingId: selection.buildingId,
      dispatcherName: data.dispatcherById(selection.dispatcherId)?.name,
      goals: data.goalsToday(),
      seed: data.seed(),
    });
    return {
      today,
      view: briefScreenViewOf({
        today,
        dispatchers: dispatchers.map((profile) => ({
          id: profile.id,
          name: profile.name,
          /*
           * The Engineer's own player-facing sentence for this profile, in its Casual register —
           * `dev/rightRail.ts#dispatcherCardOf(profile, cards, 'basic').sub`. Read rather than
           * authored, and it is not a shortcut: `dispatcherBlurbOf`'s docstring argues at length
           * that a per-dispatcher sentence may not be authored *anywhere*, because a weight vector
           * is the one object in this repository a search writes and authored prose beside a
           * searched vector is stale on the first round that improves it. A second sentence here
           * would be that mistake with a Casual accent.
           */
          description: dispatcherCardOf(profile, dispatchers, 'basic').sub,
        })),
        savedIds: data.savedDispatchers().map((entry) => entry.profile.id),
        selectedId: selection.dispatcherId,
      }),
    };
  }

  function render(): void {
    if (!alive) return;
    const { today, view } = factsNow();
    root.replaceChildren();
    root.append(leftColumn(view), rightColumn(view));
    drawElevation(canvas, context.host.resolvedBuilding(), today);
  }

  /** The day card: elevation, out-of-service strip, five facts, load reading. */
  function leftColumn(view: BriefScreenView): HTMLElement {
    const column = el(doc, 'div', 'everyday-brief-card');
    column.style.cssText = `${CARD};min-width:0`;

    const frame = el(doc, 'div');
    frame.style.cssText = [
      `border:1px solid ${C.ruleLight}`,
      `border-radius:${String(R.well)}px`,
      `background:${C.paperDeep}`,
      'overflow:hidden',
    ].join(';');
    frame.append(canvas);
    column.append(frame);

    if (view.outOfService !== undefined) {
      const strip = el(doc, 'div', 'everyday-brief-outage');
      strip.style.cssText = [
        'display:flex',
        'align-items:center',
        `gap:${String(GAP.row)}px`,
        'margin-top:13px',
        'padding:9px 12px',
        `border:1px solid ${C.amberEdge}`,
        `border-radius:${String(R.row)}px`,
        `background:${C.amberWash}`,
      ].join(';');
      const badge = el(doc, 'span', 'everyday-brief-outage-badge', view.outOfService.badge);
      badge.style.cssText = [
        'flex:none',
        'padding:2px 8px',
        `border-radius:${String(R.tight)}px`,
        `background:${C.terracotta}`,
        `color:${C.paper}`,
        `font:500 12px ${TYPE.mono}`,
      ].join(';');
      const sentence = el(doc, 'span', undefined, view.outOfService.sentence);
      sentence.style.cssText = `font-size:12.5px;line-height:1.45;color:${C.inkSoft}`;
      strip.append(badge, sentence);
      column.append(strip);
    }

    const facts = el(doc, 'div', 'everyday-brief-facts');
    facts.style.cssText = 'display:grid;gap:0;margin-top:14px';
    for (const [index, fact] of view.facts.entries()) {
      const row = el(doc, 'div', 'everyday-brief-fact');
      row.style.cssText = [
        'display:flex',
        'justify-content:space-between',
        'gap:12px',
        'padding:8px 0',
        index === 0 ? '' : `border-top:1px solid ${C.ruleLight}`,
      ]
        .filter((part) => part !== '')
        .join(';');
      const label = el(doc, 'span', undefined, fact.label);
      label.style.cssText = `font-size:12.5px;color:${C.warmGrey}`;
      const value = el(doc, 'span', undefined, fact.value);
      value.style.cssText = MONO(12.5, C.ink);
      row.append(label, value);
      facts.append(row);
    }
    column.append(facts);

    if (view.load !== undefined) {
      const load = el(doc, 'div', 'everyday-brief-load');
      load.style.cssText = [
        'margin-top:14px',
        'padding:13px 15px',
        `border-radius:${String(R.well)}px`,
        `background:${C.amberWash}`,
        `border:1px solid ${C.amberEdge}`,
      ].join(';');
      const heading = el(doc, 'div', undefined, view.load.heading);
      heading.style.cssText = EYEBROW;
      const word = el(doc, 'div', 'everyday-brief-load-word', view.load.word);
      word.style.cssText = `font:700 20px ${TYPE.heading};margin-top:5px`;
      const note = el(doc, 'div', undefined, view.load.note);
      note.style.cssText = `${QUIET};margin-top:4px`;
      load.append(heading, word, note);
      column.append(load);
    }
    return column;
  }

  /** The wrinkle, what today asks, who drives, and the two refusals. */
  function rightColumn(view: BriefScreenView): HTMLElement {
    const column = el(doc, 'div');
    column.style.cssText = 'min-width:0;display:grid;gap:16px';

    const head = el(doc, 'div');
    const eyebrow = el(doc, 'div', 'everyday-brief-eyebrow', view.eyebrow);
    eyebrow.style.cssText = EYEBROW;
    const title = el(doc, 'h1', 'everyday-brief-title', view.title);
    title.style.cssText = `font-family:${TYPE.heading};font-size:30px;font-weight:700;letter-spacing:-.02em;margin:8px 0 0`;
    const seed = el(doc, 'div', 'everyday-brief-seed', view.seedLine);
    seed.style.cssText = `${MONO(11.5, C.label)};margin-top:6px`;
    head.append(eyebrow, title, seed);
    column.append(head);

    /* ---- today's wrinkle, on § 19's amber card ---- */
    const wrinkle = el(doc, 'div', 'everyday-brief-wrinkle');
    wrinkle.style.cssText = [
      'display:flex',
      `gap:${String(GAP.block)}px`,
      'padding:16px 18px',
      `border:1px solid ${C.amberEdge}`,
      `border-radius:${String(R.card)}px`,
      `background:${C.amberWash}`,
    ].join(';');
    const bang = el(doc, 'span', undefined, '!');
    bang.style.cssText = [
      'flex:none',
      'width:24px',
      'height:24px',
      'border-radius:50%',
      `background:${C.sun}`,
      `color:${C.ink}`,
      'display:flex',
      'align-items:center',
      'justify-content:center',
      `font:700 14px ${TYPE.heading}`,
    ].join(';');
    const wrinkleText = el(doc, 'div');
    wrinkleText.style.cssText = 'min-width:0';
    const wrinkleHeading = el(doc, 'div', undefined, view.wrinkle.heading);
    wrinkleHeading.style.cssText = EYEBROW;
    const wrinkleTitle = el(doc, 'div', 'everyday-brief-wrinkle-title', view.wrinkle.title);
    wrinkleTitle.style.cssText = `font:700 17px ${TYPE.heading};margin-top:5px`;
    const wrinkleBody = el(doc, 'p', undefined, view.wrinkle.body);
    wrinkleBody.style.cssText = `${BODY};margin:6px 0 0`;
    const shared = el(doc, 'p', undefined, view.wrinkle.shared);
    shared.style.cssText = `${QUIET};margin:6px 0 0`;
    wrinkleText.append(wrinkleHeading, wrinkleTitle, wrinkleBody, shared);
    wrinkle.append(bang, wrinkleText);
    column.append(wrinkle);

    /* ---- what today asks ---- */
    const asks = el(doc, 'div', 'everyday-brief-asks');
    asks.style.cssText = CARD;
    const asksHeading = el(doc, 'div', undefined, view.asks.heading);
    asksHeading.style.cssText = EYEBROW;
    asks.append(asksHeading);
    const asksList = el(doc, 'ul');
    asksList.style.cssText = `margin:10px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:5px;${BODY}`;
    for (const ask of view.asks.rows) {
      asksList.append(el(doc, 'li', 'everyday-brief-ask', ask));
    }
    const asksNote = el(doc, 'p', undefined, view.asks.note);
    asksNote.style.cssText = `${QUIET};margin:9px 0 0`;
    asks.append(asksList, asksNote);
    column.append(asks);

    /* ---- who drives today — the one control here that writes ---- */
    const drivers = el(doc, 'div', 'everyday-brief-drivers');
    drivers.style.cssText = CARD;
    const driversHeading = el(doc, 'div', undefined, view.drivers.heading);
    driversHeading.style.cssText = EYEBROW;
    drivers.append(driversHeading);
    const cards = el(doc, 'div');
    cards.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:${String(GAP.row)}px;margin-top:11px`;
    for (const option of view.drivers.cards) {
      const card = el(doc, 'button', 'everyday-brief-style');
      card.type = 'button';
      card.dataset['dispatcher'] = option.id;
      card.style.cssText = [
        'text-align:left',
        'cursor:pointer',
        'padding:11px 13px',
        `border:1.5px solid ${option.selected ? C.ink : C.rule}`,
        `border-radius:${String(R.row)}px`,
        `background:${option.selected ? C.cardSunkDeep : C.card}`,
        'display:grid',
        'gap:4px',
        'min-width:0',
      ].join(';');
      const name = el(doc, 'span', undefined, option.name);
      name.style.cssText = 'font-size:13.5px;font-weight:600';
      const blurb = el(doc, 'span', undefined, option.blurb);
      blurb.style.cssText = QUIET;
      const meta = el(doc, 'span', 'everyday-brief-style-meta', option.meta);
      meta.style.cssText = MONO(10.5, option.selected ? C.terracotta : C.label);
      card.append(name, blurb, meta);
      card.addEventListener('click', () => {
        context.host.setDispatcher(option.id);
      });
      cards.append(card);
    }
    drivers.append(cards);

    const pickerRow = el(doc, 'div');
    pickerRow.style.cssText = `display:flex;align-items:center;gap:${String(GAP.row)}px;margin-top:12px;flex-wrap:wrap`;
    const pickerLabel = el(doc, 'label', undefined, 'or pick another');
    pickerLabel.htmlFor = 'everyday-brief-dispatcher';
    pickerLabel.style.cssText = `font-size:12.5px;color:${C.warmGrey}`;
    const select = el(doc, 'select', 'everyday-brief-picker');
    select.id = 'everyday-brief-dispatcher';
    select.style.cssText = [
      `border:1px solid ${C.rule}`,
      `border-radius:${String(R.control)}px`,
      `background:${C.paper}`,
      'padding:7px 10px',
      `font-family:${TYPE.body}`,
      'font-size:13px',
      `color:${C.ink}`,
      'max-width:100%',
    ].join(';');
    for (const option of view.drivers.options) {
      const node = doc.createElement('option');
      node.value = option.id;
      node.textContent = option.mine ? `${option.name} — yours` : option.name;
      node.selected = option.selected;
      select.append(node);
    }
    select.addEventListener('change', () => {
      context.host.setDispatcher(select.value);
    });
    const count = el(doc, 'span', 'everyday-brief-count', view.drivers.count);
    count.style.cssText = MONO(11, C.label);
    pickerRow.append(pickerLabel, select, count);
    drivers.append(pickerRow);
    column.append(drivers);

    column.append(refusalCard(view.ghost, 'everyday-brief-ghost'));
    column.append(refusalCard(view.locked, 'everyday-brief-locked'));
    return column;
  }

  /**
   * A § 6.2 card this build states rather than draws as a live control — what it would be, why it
   * is not here (or what taking it costs), the caveat, and the door when it has one.
   *
   * The button is drawn from `BriefRefusalCard.door` and from nothing else, so *which* screen this
   * card opens, and whether it opens one at all, is `briefView.ts#lockedForScore`'s decision taken
   * against the screen registry. A `context.go('tuner')` written here would be this file holding a
   * second opinion about whether that screen exists — which is the shape the fuse that card's
   * docstring describes was made of.
   */
  function refusalCard(card: BriefRefusalCard, className: string): HTMLElement {
    const root_ = el(doc, 'div', className);
    root_.style.cssText = `${WELL};display:grid;gap:6px`;
    const heading = el(doc, 'div', undefined, card.heading);
    heading.style.cssText = EYEBROW;
    const what = el(doc, 'p', undefined, card.what);
    what.style.cssText = `${BODY};margin:0`;
    const why = el(doc, 'p', `${className}-why`, card.why);
    why.style.cssText = `${QUIET};margin:0;color:${C.terracotta}`;
    const caveat = el(doc, 'p', undefined, card.caveat);
    caveat.style.cssText = `${QUIET};margin:0`;
    root_.append(heading, what, why, caveat);
    const { door } = card;
    if (door !== undefined) {
      const button = el(doc, 'button', `${className}-go`, door.label);
      button.type = 'button';
      button.style.cssText = [
        'cursor:pointer',
        'justify-self:start',
        'margin-top:2px',
        `border:1px solid ${C.ink}`,
        `border-radius:${String(R.pill)}px`,
        `background:${C.card}`,
        `color:${C.ink}`,
        'padding:6px 13px',
        'font-size:12.5px',
      ].join(';');
      button.addEventListener('click', () => {
        context.go(door.screen);
      });
      root_.append(button);
    }
    return root_;
  }

  render();
  const stopListening = context.host.subscribe(render);
  const onResize = (): void => {
    drawElevation(canvas, context.host.resolvedBuilding(), factsNow().today);
  };
  const view = canvas.ownerDocument.defaultView;
  view?.addEventListener('resize', onResize);

  return {
    unmount: () => {
      alive = false;
      stopListening();
      view?.removeEventListener('resize', onResize);
    },
    /*
     * § 3.3's brief primary — *Start the day*, and it is the press that makes the day **yours**.
     *
     * `host.startRun()` is the same latching press as the Engineer shell's *Run this shift*, and
     * the latch is the whole point: `closeShift` refuses to file a run nobody started (§ D232's
     * `playerHasChosen`, so that boot's own demo shift can never be banked as a player's day). A
     * brief whose primary only navigated would put a player on a stage they could watch and never
     * close — the loop's four screens all built, and no day ever filed.
     *
     * § 7.3's *enters the stage paused* is about the **transport**, not about whether the day is
     * simulated: this simulator runs the whole shift in milliseconds and plays the recording back
     * (`docs/16` § 1), so *start* means *ask the question*. The transport that would pause the
     * playback is `everyday/host.ts`'s named absence, owned by the § 7 stage when it exists; the
     * handed-off Engineer stage carries its own.
     *
     * The run lands asynchronously — the simulation is on a worker — so this returns before there
     * is a recording, exactly as `MountContext.runShift` does, and the stage draws it when it
     * arrives.
     */
    primary: () => {
      context.host.startRun();
      context.go('stage');
    },
  };
}

/**
 * The cutaway elevation — § 6.2's list, drawn from the building.
 *
 * Every shape is derived: one well per car in bank order, storeys at `floors.length`, and the
 * dashed well is `carsToDerate`'s own choice for today. A building the shell could not resolve
 * draws nothing rather than a stand-in tower, on `everyday/host.ts#buildingById`'s rule that a
 * substituted answer is a false statement about the thing asked after.
 */
function drawElevation(
  canvas: HTMLCanvasElement,
  building: ResolvedBuilding | undefined,
  today: TodayRecord,
): void {
  const box = canvas.getBoundingClientRect();
  const view = canvas.ownerDocument.defaultView;
  const ratio = Math.min(MAX_PIXEL_RATIO, view?.devicePixelRatio ?? 1);
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(ELEVATION_HEIGHT_PX * ratio));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // No 2D context — a node tier, or a browser that refused one. The rest of the brief is unaffected.
  if (ctx === null) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const w = box.width;
  const h = ELEVATION_HEIGHT_PX;
  ctx.clearRect(0, 0, w, h);
  if (building === undefined || w <= 0) return;

  const storeys = Math.max(1, building.floors.length);
  const cars = building.banks.flatMap((bank) => bank.cars.map((car) => car.id));
  const held = new Set(
    carsToDerate(building, heldCountOf(today)).held.map((ref) => ref.carId),
  );

  const pad = 16;
  const roofH = 10;
  const groundH = 18;
  const bodyTop = pad + roofH;
  const bodyBottom = h - pad - groundH;
  const bodyH = Math.max(1, bodyBottom - bodyTop);
  const bodyLeft = pad;
  const bodyRight = w - pad;
  const bodyW = Math.max(1, bodyRight - bodyLeft);
  const storeyH = bodyH / storeys;

  /* the slab */
  ctx.fillStyle = C.warmGrey;
  ctx.fillRect(bodyLeft - 4, pad, bodyW + 8, roofH);

  /* the body */
  ctx.fillStyle = C.paperDeeper;
  ctx.fillRect(bodyLeft, bodyTop, bodyW, bodyH);

  /* storeys, and windows on the half that is not shafts */
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 1;
  for (let index = 0; index <= storeys; index += 1) {
    const y = Math.round(bodyTop + index * storeyH) + 0.5;
    ctx.beginPath();
    ctx.moveTo(bodyLeft, y);
    ctx.lineTo(bodyRight, y);
    ctx.stroke();
  }

  /* the shaft wells: one per car, right-hand two thirds, dark voids */
  const wellCount = Math.max(1, cars.length);
  const wellsLeft = bodyLeft + bodyW * 0.42;
  const wellsW = bodyRight - wellsLeft - 8;
  const wellW = Math.max(4, (wellsW - 6 * (wellCount - 1)) / wellCount);
  cars.forEach((carId, index) => {
    const x = wellsLeft + index * (wellW + 6);
    const out = held.has(carId);
    ctx.fillStyle = out ? C.paperDeep : C.ink;
    ctx.fillRect(x, bodyTop + 2, wellW, bodyH - 4);
    if (out) {
      ctx.save();
      ctx.strokeStyle = C.terracotta;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, bodyTop + 2.75, wellW - 1.5, bodyH - 5.5);
      ctx.restore();
    } else {
      /* a car parked in the well, one storey up from the ground */
      const carH = Math.min(storeyH * 0.8, 18);
      const carY = bodyBottom - storeyH * 1.5;
      ctx.fillStyle = C.sun;
      ctx.fillRect(x + 2, carY, Math.max(2, wellW - 4), carH);
    }
    /* the lettered badge */
    ctx.fillStyle = out ? C.terracotta : C.label;
    ctx.font = `500 9px ${TYPE.mono}`;
    ctx.textAlign = 'center';
    ctx.fillText(carId.slice(-3), x + wellW / 2, bodyTop - 3);
  });

  /* windows on the left third */
  ctx.fillStyle = C.sky;
  for (let index = 0; index < storeys; index += 1) {
    const y = bodyTop + index * storeyH + storeyH * 0.28;
    const wh = Math.max(2, storeyH * 0.4);
    for (let column = 0; column < 3; column += 1) {
      ctx.fillRect(bodyLeft + 10 + column * 22, y, 13, wh);
    }
  }

  /* the ground and the entrance canopy */
  ctx.fillStyle = C.warmGrey;
  ctx.fillRect(pad - 6, bodyBottom, bodyW + 12, 3);
  ctx.fillStyle = C.sun;
  ctx.fillRect(bodyLeft + 8, bodyBottom - 8, 58, 5);

  /* floor numbers: top, middle, ground */
  ctx.fillStyle = C.label;
  ctx.font = `500 9px ${TYPE.mono}`;
  ctx.textAlign = 'right';
  const marks: readonly [number, string][] = [
    [0, String(storeys)],
    [Math.floor(storeys / 2), String(Math.max(1, storeys - Math.floor(storeys / 2)))],
    [storeys - 1, 'G'],
  ];
  for (const [index, label] of marks) {
    ctx.fillText(label, bodyLeft - 3, bodyTop + index * storeyH + storeyH * 0.72);
  }
}

/** How many cars today holds — read off the day record's own strip rather than recomputed. */
function heldCountOf(today: TodayRecord): number {
  return today.outOfService === undefined ? 0 : today.outOfService.badge.split(' · ').length;
}

/** The registry row — GAMEPLAY § 6.2's screen, mounted by `shell.ts` through `screens.ts`. */
export const BRIEF_SCREEN: EverydayScreenModule = {
  key: 'brief',
  mount: mountBrief,
};
