/**
 * **The lobby, drawn** — the game's front door and its main menu, one screen
 * ([§ D1628](../../../../DECISIONS.md)).
 *
 * The lobby shows the building in section: a hoistway on the left with a car in it, and six
 * landings beside it. Pointing at a landing (hover or focus) glides the car to it and the display
 * says what is on that floor; pressing one steps out onto it on the same frame, and every room on a
 * floor is a press of its own. Every word and the whole of the small machine are `lobbyModel.ts`'s;
 * this file is the mount, the car's motion, and one sound.
 *
 * ## It is the menu, so it carries what the menu carried
 *
 * The three play landings are the mode tiles: they keep the tiles' class and `data-screen`, and a
 * press commits exactly as a tile's did. *Continue your week* is the shell's own tile, handed in
 * whole through {@link LobbyPorts.continueTile} so there is one of it. The build-notes pointer sits
 * at the foot. The screen is drawn inside the shell, with the tray, the bar and Settings where they
 * are on every other screen.
 *
 * ## Motion is laid over the press, never in front of it
 *
 * The car's glide, the doors opening on arrival and the lantern are decoration
 * ([§ D1627](../../../../DECISIONS.md)). No handler waits on a timer before it navigates. With
 * reduced motion the car is simply drawn where it is.
 *
 * ## Why the shell owns the route rather than the registry
 *
 * The lobby is the first thing on the page and it needs nothing from the simulation host to draw.
 * A registered screen is held behind the host until `dev/main.ts` publishes it
 * (`shell.ts#drawHostPending`), which would put a waiting sentence on the one screen that has
 * nothing to wait for. So the shell draws its root itself and hands this mount {@link LobbyPorts};
 * the two things the host does answer, the first-visit line and *Continue*, are repainted by
 * {@link MountedLobby.reread} when it arrives.
 *
 * ## Sound
 *
 * Sound follows Settings → Sound, and the `AudioContext` is built on the first press that makes a
 * noise, never before, so a player with Sound off never causes one to exist (the stage's own rule,
 * `stageScreen.ts#sound`).
 */

import { REDUCED_MOTION_QUERY } from '../dev/motion.js';
import { BUILD_NOTES_POINTER } from './buildNotes.js';
import { engineerSettings } from './engineerBridge.js';
import { floorDirection, GAME_FLOOR_ORDER, type GameFloor, type GameFloorKey } from './floors.js';
import {
  LOBBY_COPY,
  LOBBY_INITIAL,
  lobbyPoint,
  lobbyPress,
  lobbyTimingsFor,
  lobbyViewOf,
  type LobbyState,
} from './lobbyModel.js';
import { everydayProfileStore } from './profileStore.js';
import { el } from './screenDom.js';
import {
  EVERYDAY_COLORS as C,
  EVERYDAY_RAIL_DRAWER_MAX_PX,
  EVERYDAY_RAIL_SURFACES as RAIL,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';
import type { EverydayScreen } from './types.js';

/** What the lobby may do to the rest of the product. The shell supplies it. */
export interface LobbyPorts {
  /** Step out onto a floor: commit its mode as the tile did, and open its screen. */
  stepOut(floor: GameFloor): void;
  /** Open one room on a floor. */
  openRoom(screen: EverydayScreen): void;
  /** Whether this is a first visit, or `undefined` while the host has not said. */
  firstVisit(): boolean | undefined;
  /**
   * The shell's *Continue your week* tile, built and wired by the shell, or `undefined` when there
   * is nothing to continue. One tile, so the lobby and the tests that press it agree on what it is.
   */
  continueTile(): HTMLElement | undefined;
}

export interface MountedLobby {
  unmount(): void;
  /** Redraw the host's answers (the first-visit line and *Continue*) without moving the car. */
  reread(): void;
}

/* -------------------------------------------------------------------------- *
 * The palette — the lobby handoff's, on the shell's tokens where they agree
 * -------------------------------------------------------------------------- */

const P = Object.freeze({
  ink: C.ink,
  cream: C.paper,
  sand: '#E6DCCB',
  stone: C.fainter,
  taupe: C.label,
  bezel: '#3A352E',
  rule: RAIL.edge,
  lcd: '#120F0C',
  amber: C.sun,
  amberHot: '#FFC56B',
  amberDim: '#C9893A',
});

/** The ground the lobby stands on. The shell paints the screen region with it while the lobby shows. */
export const LOBBY_GROUND = '#2C2823';

/** The handoff's door easing, verbatim. */
const EASING = 'cubic-bezier(.65,0,.25,1)';

const STEEL =
  'repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 1px,transparent 1px 3px),' +
  'linear-gradient(180deg,#38332C,#26221D)';
const DOOR_STEEL =
  'repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 3px),' +
  'linear-gradient(180deg,#CFC4B0,#A89C87)';
const BUTTON_OFF = 'radial-gradient(circle at 50% 35%,#4A443A,#26221D)';
const BUTTON_LIT = 'radial-gradient(circle at 50% 40%,#5A4426,#2A2218)';
const GLOW_LIT = '0 0 0 3px rgba(242,166,59,.16),0 0 16px rgba(242,166,59,.5)';
const MONO = (weight: number, size: number, extra = ''): string =>
  `font:${String(weight)} ${String(size)}px ${TYPE.mono};${extra}`;

/* -------------------------------------------------------------------------- *
 * The sound — the handoff's synthesis
 * -------------------------------------------------------------------------- */

interface LobbySound {
  chime(): void;
  close(): void;
}

function lobbySound(): LobbySound {
  let context: AudioContext | undefined;
  const audio = (): AudioContext | undefined => {
    if (!everydayProfileStore().soundOn()) return undefined;
    if (context === undefined) {
      if (typeof AudioContext === 'undefined') return undefined;
      try {
        context = new AudioContext();
      } catch {
        return undefined;
      }
    }
    if (context.state === 'suspended') void context.resume();
    return context;
  };
  const tone = (frequency: number, duration: number, gain: number): void => {
    const c = audio();
    if (c === undefined) return;
    const oscillator = c.createOscillator();
    const amp = c.createGain();
    const t = c.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(amp);
    amp.connect(c.destination);
    oscillator.start(t);
    oscillator.stop(t + duration + 0.05);
  };
  return {
    chime: () => {
      tone(1318.5, 0.9, 0.14);
      tone(2637, 0.3, 0.02);
    },
    close: () => {
      void context?.close();
      context = undefined;
    },
  };
}

/** How long the arrival chime rings, so the context it rings on outlives the screen it left. */
const CHIME_TAIL_MS = 1200;

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

export function mountLobby(region: HTMLElement, ports: LobbyPorts): MountedLobby {
  const doc = region.ownerDocument;
  const win = doc.defaultView;
  const timers = new Set<number>();
  const sound = lobbySound();
  let state: LobbyState = LOBBY_INITIAL;
  let unmounted = false;

  const reduced = (): boolean =>
    engineerSettings()?.reduceMotion() === true || win?.matchMedia(REDUCED_MOTION_QUERY).matches === true;

  const later = (fn: () => void, ms: number): void => {
    if (win === null || unmounted) return;
    const id = win.setTimeout(() => {
      timers.delete(id);
      if (!unmounted) fn();
    }, ms);
    timers.add(id);
  };

  /* ---------------------------------------------------------------- *
   * The DOM, built once; {@link render} writes the moving parts
   * ---------------------------------------------------------------- */

  const root = el(doc, 'div', 'everyday-lobby');
  root.style.cssText = [
    'box-sizing:border-box',
    'min-height:100%',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:16px',
    'padding:24px 22px 26px',
    `color:${P.cream}`,
    'background:repeating-linear-gradient(90deg,transparent 0 179px,rgba(0,0,0,.22) 179px 180px),' +
      `linear-gradient(180deg,#322D27,${LOBBY_GROUND})`,
    `font-family:${TYPE.body}`,
  ].join(';');

  const nameBlock = el(doc, 'div');
  nameBlock.style.cssText = 'text-align:center';
  const kicker = el(doc, 'div', undefined, LOBBY_COPY.kicker);
  kicker.style.cssText = MONO(500, 10.5, `letter-spacing:.3em;color:${P.taupe}`);
  /* The screen's one level-1 heading (`docs/36` AX-15): the name over the doors. */
  const building = el(doc, 'h1', undefined, LOBBY_COPY.building);
  building.style.cssText = `font:700 26px ${TYPE.heading};letter-spacing:-.01em;color:${P.sand};margin:2px 0 0`;
  nameBlock.append(kicker, building);

  const row = el(doc, 'div');
  row.style.cssText = 'display:flex;align-items:stretch;justify-content:center;gap:20px;width:100%;max-width:960px';

  /* --- The building in section: the hoistway, and the landings beside it. --- */
  const section = el(doc, 'div', 'everyday-lobby-building');
  section.style.cssText = [
    'display:flex',
    'flex:1 1 0',
    'min-width:0',
    'max-width:600px',
    `border:1px solid ${P.bezel}`,
    'border-radius:14px',
    'overflow:hidden',
    `background:${STEEL}`,
    `box-shadow:0 14px 30px rgba(0,0,0,.35),inset 0 0 0 1px ${P.rule}`,
  ].join(';');

  const HOIST_WIDE =
    'linear-gradient(90deg,transparent 0 13px,rgba(230,220,203,.16) 13px 14px,transparent 14px 71px,' +
    'rgba(230,220,203,.16) 71px 72px,transparent 72px),linear-gradient(180deg,#171411,#0F0D0B)';
  const HOIST_NARROW =
    'linear-gradient(90deg,transparent 0 6px,rgba(230,220,203,.16) 6px 7px,transparent 7px 51px,' +
    'rgba(230,220,203,.16) 51px 52px,transparent 52px),linear-gradient(180deg,#171411,#0F0D0B)';
  const hoist = el(doc, 'div', 'everyday-lobby-hoist');
  hoist.setAttribute('aria-hidden', 'true');
  /* The pit and the two guide rails: the hoistway's own drawing, behind the car. */
  hoist.style.cssText = `position:relative;flex:none;width:92px;border-right:1px solid ${P.bezel}`;

  /* The hoist rope: from the head of the shaft down to the car's crosshead. */
  const rope = el(doc, 'div');
  rope.style.cssText = `position:absolute;left:42px;top:0;width:1px;height:0;background:${P.taupe};opacity:.7`;

  const car = el(doc, 'div', 'everyday-lobby-car');
  car.style.cssText = [
    'position:absolute',
    'left:16px',
    'width:53px',
    'top:0',
    'height:60px',
    'box-sizing:border-box',
    `border:2px solid ${P.amberDim}`,
    'border-radius:5px',
    /* The lit cab behind the doors. */
    'background:radial-gradient(ellipse at 50% 20%,#FFE2A8,#E9A94A 55%,#8A5A1C)',
    'box-shadow:0 0 18px rgba(242,166,59,.35)',
    'overflow:hidden',
  ].join(';');
  const leafLeft = el(doc, 'div', 'everyday-lobby-door');
  const leafRight = el(doc, 'div', 'everyday-lobby-door');
  for (const [leaf, side] of [[leafLeft, 'left'], [leafRight, 'right']] as const) {
    leaf.style.cssText = [
      'position:absolute',
      'top:0',
      'bottom:0',
      `${side}:0`,
      'width:50%',
      `background:${DOOR_STEEL}`,
      `border-${side === 'left' ? 'right' : 'left'}:1px solid rgba(0,0,0,.45)`,
      `transform-origin:${side} center`,
    ].join(';');
  }
  car.append(leafLeft, leafRight);

  /* The counterweight, on its own rail, going the other way. */
  const weight = el(doc, 'div');
  weight.style.cssText = [
    'position:absolute',
    'right:6px',
    'width:9px',
    'height:34px',
    'top:0',
    'border-radius:2px',
    'background:linear-gradient(180deg,#5A5348,#3A352E)',
    `border:1px solid ${P.bezel}`,
  ].join(';');
  hoist.append(rope, car, weight);

  const list = el(doc, 'div', 'everyday-lobby-floors');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', LOBBY_COPY.directoryLabel);
  list.style.cssText = 'position:relative;flex:1 1 0;min-width:0;display:flex;flex-direction:column';

  interface LandingParts {
    readonly key: GameFloorKey;
    readonly row: HTMLElement;
    /** The landing's own press, or its plain box on the lobby's floor. */
    readonly face: HTMLElement;
    readonly plate: HTMLElement;
    readonly name: HTMLElement;
    readonly body: HTMLElement;
    readonly status: HTMLElement;
    readonly rooms: HTMLElement;
  }
  const landings: LandingParts[] = [];

  const point = (key: GameFloorKey): void => {
    const next = lobbyPoint(state, key);
    if (next === state) return;
    const from = state.car;
    state = next;
    render();
    travel(from, key);
  };

  const view0 = lobbyViewOf(state);
  for (const key of GAME_FLOOR_ORDER) {
    const landing = view0.landings.find((candidate) => candidate.key === key);
    if (landing === undefined) continue;
    const rowEl = el(doc, 'div', 'everyday-lobby-landing-row');
    rowEl.dataset['floor'] = key;
    rowEl.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'justify-content:center',
      'flex:1 1 auto',
      'min-height:76px',
      'box-sizing:border-box',
      /* The floor slab, running through to the hoistway. */
      `border-bottom:${key === 'B' ? '0' : `2px solid ${P.bezel}`}`,
    ].join(';');

    const pressed = key === 'L' ? undefined : lobbyPress(key);
    /*
     * A play landing is the mode's tile: the class and `data-screen` the menu's tiles carried, so
     * there is one thing called a mode tile and it is this.
     */
    const face =
      pressed === undefined
        ? el(doc, 'div', 'everyday-lobby-here')
        : el(doc, 'button', pressed.pick === undefined ? 'everyday-lobby-floor-button' : 'everyday-lobby-floor-button everyday-mode');
    if (face instanceof HTMLButtonElement && pressed !== undefined) {
      face.type = 'button';
      face.dataset['floor'] = key;
      if (pressed.pick !== undefined) face.setAttribute('data-screen', pressed.screen);
      face.addEventListener('click', () => {
        sound.chime();
        ports.stepOut(pressed);
      });
      face.addEventListener('focus', () => {
        point(key);
      });
      /* Up and down walk the landings that open, as the arrows on a real panel would. */
      face.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        const faces = landings.map((parts) => parts.face).filter((node) => node instanceof HTMLButtonElement);
        const target = faces[faces.indexOf(face) + (event.key === 'ArrowUp' ? -1 : 1)];
        if (target === undefined) return;
        event.preventDefault();
        target.focus();
      });
    }
    face.style.cssText = [
      'display:grid',
      'grid-template-columns:44px minmax(0,1fr)',
      'align-items:center',
      'column-gap:14px',
      'width:100%',
      'box-sizing:border-box',
      'padding:10px 16px 6px 14px',
      'text-align:left',
      'background:transparent',
      'border:0',
      `color:${P.cream}`,
      `cursor:${pressed === undefined ? 'default' : 'pointer'}`,
      `font-family:${TYPE.body}`,
    ].join(';');

    const plate = el(doc, 'span', 'everyday-lobby-plate', key);
    plate.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'width:44px',
      'height:44px',
      'border-radius:50%',
      `border:1.5px solid ${P.bezel}`,
      MONO(500, 17),
    ].join(';');

    const text = el(doc, 'span');
    text.style.cssText = 'display:block;min-width:0';
    const name = el(doc, 'span');
    name.style.cssText = `display:block;font:600 17px ${TYPE.heading};letter-spacing:.01em`;
    const body = el(doc, 'span');
    body.style.cssText = `display:block;font-size:12.5px;line-height:1.35;color:${P.stone};margin-top:2px`;
    const status = el(doc, 'span');
    status.style.cssText = MONO(500, 10, `display:block;letter-spacing:.03em;color:${P.amberDim};margin-top:4px`);
    text.append(name, body, status);
    face.append(plate, text);

    /* The rooms, each a press of its own, under the landing they are on. */
    const rooms = el(doc, 'div');
    rooms.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 10px 72px';
    for (const room of landing.rooms) {
      /* *What this is* keeps the class the landing page's own link was always found by. */
      const chip = el(
        doc,
        'button',
        room.screen === 'landing' ? 'everyday-lobby-room everyday-lobby-landing' : 'everyday-lobby-room',
        room.label,
      );
      chip.type = 'button';
      chip.dataset['screen'] = room.screen;
      chip.style.cssText = [
        'background:transparent',
        `border:1px solid ${P.bezel}`,
        'border-radius:999px',
        'padding:4px 11px',
        'min-height:26px',
        'cursor:pointer',
        MONO(500, 10.5, `letter-spacing:.04em;color:${P.stone}`),
      ].join(';');
      chip.addEventListener('click', () => {
        ports.openRoom(room.screen);
      });
      chip.addEventListener('focus', () => {
        point(key);
      });
      rooms.append(chip);
    }
    if (landing.rooms.length === 0) rooms.style.display = 'none';

    rowEl.addEventListener('mouseenter', () => {
      point(key);
    });
    rowEl.append(face, rooms);
    landings.push({ key, row: rowEl, face, plate, name, body, status, rooms });
    list.append(rowEl);
  }
  section.append(hoist, list);

  /* --- The display beside the shaft, and what the menu carried under it. --- */
  const side = el(doc, 'div');
  side.style.cssText = 'display:flex;flex-direction:column;gap:12px;flex:none;width:300px';

  const indicator = el(doc, 'div', 'everyday-lobby-indicator');
  indicator.setAttribute('aria-hidden', 'true');
  indicator.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'gap:16px',
    `background:${P.lcd}`,
    `border:2px solid ${P.bezel}`,
    'border-radius:8px',
    'padding:6px 0',
    MONO(500, 30, `color:${P.amber}`),
  ].join(';');
  const arrowUp = el(doc, 'span', undefined, '▲');
  const indicatorKey = el(doc, 'span');
  const arrowDown = el(doc, 'span', undefined, '▼');
  for (const arrow of [arrowUp, arrowDown]) arrow.style.cssText = `font-size:12px;color:${P.bezel};transition:color .12s`;
  indicator.append(arrowUp, indicatorKey, arrowDown);

  const display = el(doc, 'div', 'everyday-lobby-display');
  display.setAttribute('aria-live', 'polite');
  display.style.cssText = [
    'box-sizing:border-box',
    `background:${STEEL}`,
    `border:1px solid ${P.bezel}`,
    'border-radius:14px',
    'padding:18px 18px 20px',
    'min-height:190px',
  ].join(';');
  const displayKicker = el(doc, 'div');
  displayKicker.style.cssText = MONO(500, 10.5, `letter-spacing:.2em;color:${P.amber}`);
  const displayTitle = el(doc, 'div', 'everyday-lobby-title');
  displayTitle.style.cssText = `font:700 27px ${TYPE.heading};letter-spacing:-.01em;margin-top:6px`;
  const displayBody = el(doc, 'div');
  displayBody.style.cssText = `font-size:14px;line-height:1.45;color:${P.stone};margin-top:8px`;
  const displayStatus = el(doc, 'div', 'everyday-lobby-status');
  displayStatus.style.cssText = MONO(500, 10.5, `letter-spacing:.03em;line-height:1.5;color:${P.amberDim};margin-top:12px`);
  display.append(displayKicker, displayTitle, displayBody, displayStatus);

  /* A first visit's own way in: the walkthrough, by name. Drawn only when the host says so. */
  const walkthrough = el(doc, 'button', 'everyday-lobby-walkthrough', LOBBY_COPY.walkthrough);
  walkthrough.type = 'button';
  walkthrough.style.cssText = [
    'display:none',
    `background:${P.amber}`,
    `color:${P.ink}`,
    'border:0',
    'border-radius:10px',
    'padding:11px 16px',
    'cursor:pointer',
    'text-align:left',
    `font:600 14px ${TYPE.heading}`,
  ].join(';');
  walkthrough.addEventListener('click', () => {
    ports.openRoom('tutorial');
  });

  /* Where the shell's *Continue your week* tile goes, when there is one. */
  const resumeSlot = el(doc, 'div');
  let resumeKey = '';

  side.append(indicator, display, walkthrough, resumeSlot);
  row.append(section, side);

  const notes = el(doc, 'p', 'everyday-menu-build-note', BUILD_NOTES_POINTER);
  notes.style.cssText = `margin:2px 0 0;max-width:960px;width:100%;font-size:12px;color:${P.taupe}`;

  root.append(nameBlock, row, notes);
  region.replaceChildren(root);

  /* ---------------------------------------------------------------- *
   * Narrow screens — the shell's own drawer breakpoint
   * ---------------------------------------------------------------- */

  const narrowQuery = win?.matchMedia(`(max-width: ${String(EVERYDAY_RAIL_DRAWER_MAX_PX)}px)`);
  const applyNarrow = (narrow: boolean): void => {
    row.style.flexDirection = narrow ? 'column' : 'row';
    row.style.alignItems = narrow ? 'center' : 'stretch';
    section.style.flex = narrow ? 'none' : '1 1 0';
    section.style.width = narrow ? '100%' : '';
    side.style.width = narrow ? '100%' : '300px';
    side.style.maxWidth = narrow ? '600px' : '';
    /* On a phone the walkthrough and *Continue* come first, above the six landings. */
    side.style.order = narrow ? '-1' : '0';
    /* On a phone the display would sit under six landings, so the landings' own words carry it. */
    indicator.style.display = narrow ? 'none' : 'flex';
    display.style.display = narrow ? 'none' : 'block';
    root.style.padding = narrow ? '14px 12px 20px' : '24px 22px 26px';
    hoist.style.width = narrow ? '64px' : '92px';
    hoist.style.background = narrow ? HOIST_NARROW : HOIST_WIDE;
    car.style.left = narrow ? '9px' : '16px';
    car.style.width = narrow ? '40px' : '53px';
    rope.style.left = narrow ? '29px' : '42px';
    weight.style.right = narrow ? '3px' : '6px';
    weight.style.width = narrow ? '6px' : '9px';
    for (const parts of landings) parts.rooms.style.paddingLeft = narrow ? '14px' : '72px';
  };
  applyNarrow(narrowQuery?.matches === true);
  const onNarrow = (event: MediaQueryListEvent): void => {
    applyNarrow(event.matches);
    placeCar(false);
  };
  narrowQuery?.addEventListener('change', onNarrow);

  /* The landings change height when the text wraps, so the car is placed from their boxes. */
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
    placeCar(false);
  });
  observer?.observe(list);

  /* ---------------------------------------------------------------- *
   * The car — where it stands, and the motion laid over a change
   * ---------------------------------------------------------------- */

  function setDoors(open: boolean, ms: number): void {
    for (const leaf of [leafLeft, leafRight]) {
      leaf.style.transition = ms > 0 ? `transform ${String(ms)}ms ${EASING}` : 'none';
      leaf.style.transform = open ? 'scaleX(.14)' : 'scaleX(1)';
    }
  }

  function placeCar(animated: boolean): void {
    const at = landings.find((candidate) => candidate.key === state.car);
    if (at === undefined) return;
    const glide = animated ? lobbyTimingsFor(reduced()).glideMs : 0;
    const top = at.row.offsetTop + 8;
    const height = Math.max(40, at.row.offsetHeight - 18);
    const move = glide > 0 ? `top ${String(glide)}ms ${EASING},height ${String(glide)}ms ${EASING}` : 'none';
    car.style.transition = move;
    car.style.top = `${String(top)}px`;
    car.style.height = `${String(height)}px`;
    rope.style.transition = glide > 0 ? `height ${String(glide)}ms ${EASING}` : 'none';
    rope.style.height = `${String(top)}px`;
    /* The counterweight mirrors the car about the middle of the shaft. */
    const travelPx = Math.max(0, list.offsetHeight - 34 - 16);
    weight.style.transition = glide > 0 ? `top ${String(glide)}ms ${EASING}` : 'none';
    weight.style.top = `${String(8 + Math.max(0, travelPx - top))}px`;
  }

  /** The glide between two landings: doors shut, lantern lit, then open on arrival. */
  function travel(from: GameFloorKey, to: GameFloorKey): void {
    const { glideMs } = lobbyTimingsFor(reduced());
    placeCar(true);
    if (glideMs === 0) return;
    const direction = floorDirection(from, to);
    arrowUp.style.color = direction === 'up' ? P.amberHot : P.bezel;
    arrowDown.style.color = direction === 'down' ? P.amberHot : P.bezel;
    setDoors(false, 90);
    const arriving = state.car;
    later(() => {
      if (state.car !== arriving) return;
      arrowUp.style.color = P.bezel;
      arrowDown.style.color = P.bezel;
      setDoors(true, 220);
    }, glideMs);
  }

  /* ---------------------------------------------------------------- *
   * Drawing
   * ---------------------------------------------------------------- */

  function render(): void {
    const view = lobbyViewOf(state, { firstVisit: ports.firstVisit() });
    indicatorKey.textContent = view.car;
    displayKicker.textContent = view.kicker;
    displayTitle.textContent = view.title;
    displayBody.textContent = view.body;
    displayStatus.textContent = view.status;
    displayStatus.style.display = view.status === '' ? 'none' : 'block';

    for (const parts of landings) {
      const landing = view.landings.find((candidate) => candidate.key === parts.key);
      if (landing === undefined) continue;
      parts.name.textContent = landing.name;
      parts.body.textContent = landing.body;
      parts.status.textContent = landing.opens ? landing.status : LOBBY_COPY.here;
      parts.status.style.display = parts.status.textContent === '' ? 'none' : 'block';
      parts.plate.style.background = landing.here ? BUTTON_LIT : BUTTON_OFF;
      parts.plate.style.color = landing.here ? P.amberHot : P.stone;
      parts.plate.style.borderColor = landing.here ? P.amber : P.bezel;
      parts.plate.style.boxShadow = landing.here ? GLOW_LIT : 'none';
      parts.row.style.background = landing.here ? 'rgba(242,166,59,.07)' : 'transparent';
    }

    walkthrough.style.display = view.offerWalkthrough ? 'block' : 'none';
    /* Replaced only when what it says or does has moved, so a host notification does not take focus off it. */
    const tile = ports.continueTile();
    const key = tile === undefined ? '' : `${tile.dataset['goes'] ?? ''}|${tile.textContent ?? ''}`;
    if (key !== resumeKey) {
      resumeKey = key;
      if (tile === undefined) resumeSlot.replaceChildren();
      else resumeSlot.replaceChildren(tile);
    }
  }

  render();
  placeCar(false);
  /* The doors open on the hall as it appears. Decoration: every landing is live from this frame. */
  const { doorMs } = lobbyTimingsFor(reduced());
  setDoors(doorMs === 0, 0);
  if (doorMs > 0) {
    later(() => {
      setDoors(true, doorMs);
    }, 60);
  }

  return {
    unmount: () => {
      unmounted = true;
      for (const id of timers) win?.clearTimeout(id);
      timers.clear();
      narrowQuery?.removeEventListener('change', onNarrow);
      observer?.disconnect();
      /* The chime a press just struck is still ringing; the context goes once it has finished. */
      if (win === null) sound.close();
      else win.setTimeout(sound.close, CHIME_TAIL_MS);
    },
    reread: () => {
      if (!unmounted) render();
    },
  };
}
