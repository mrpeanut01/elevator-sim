/**
 * **The lobby, drawn** — the elevator hall a cold launch opens on,
 * [§ D1445](../../../../DECISIONS.md) as redrawn by [§ D1627](../../../../DECISIONS.md).
 *
 * The hall shows the building in section: a hoistway on the left with a car in it, and six landings
 * beside it, each a button. Pointing at a landing (hover or focus) glides the car to it and the
 * display says what is on that floor; pressing one steps out onto it on the same frame. Every word
 * and the whole of the small machine are `lobbyModel.ts`'s; this file is the mount, the car's
 * motion, and one sound.
 *
 * ## Motion is laid over the press, never in front of it
 *
 * The car's glide, the doors opening on arrival and the lantern are decoration. No handler waits on
 * a timer before it navigates, which is the difference from the § D1445 build this replaced and the
 * thing `lobby.browser.test.ts` measures. With reduced motion the car is simply drawn where it is.
 *
 * ## Why the shell owns the route rather than the registry
 *
 * The lobby is the first thing on the page and it needs nothing from the simulation host to draw.
 * A registered screen is held behind the host until `dev/main.ts` publishes it
 * (`shell.ts#drawHostPending`), which would put a waiting sentence on the one screen that has
 * nothing to wait for. So the shell routes `lobby` itself, the way it routes the menu, and hands
 * this mount {@link LobbyPorts}.
 *
 * ## Sound
 *
 * Sound follows Settings → Sound, and the `AudioContext` is built on the first press that makes a
 * noise, never before, so a player with Sound off never causes one to exist (the stage's own rule,
 * `stageScreen.ts#sound`).
 */

import { REDUCED_MOTION_QUERY } from '../dev/motion.js';
import { engineerSettings } from './engineerBridge.js';
import { floorDirection, GAME_FLOOR_ORDER, type GameFloor, type GameFloorKey } from './floors.js';
import {
  LOBBY_COPY,
  LOBBY_INITIAL,
  lobbyPoint,
  lobbyPress,
  lobbyTimingsFor,
  lobbyTurnKey,
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

/** What the lobby may do to the rest of the product. The shell supplies it. */
export interface LobbyPorts {
  /** Step out onto a floor, in the Engineer view when the key is turned. */
  stepOut(floor: GameFloor, engineer: boolean): void;
  /** The landing page, which the lobby replaced as the first screen and still links to. */
  toLanding(): void;
  /** Whether this is a first visit, or `undefined` while the host has not said. */
  firstVisit(): boolean | undefined;
  /**
   * The menu's *Continue your week*, when there is one, so a returning player can resume from the
   * lobby exactly as from the menu's tile. `undefined` when there is nothing to continue.
   */
  resume(): { readonly title: string; readonly line: string } | undefined;
  /** Press it, through the same code the menu's tile runs. */
  pressResume(): void;
}

export interface MountedLobby {
  unmount(): void;
  /** Redraw the host's answers (the welcome line and *Continue*) without moving the car. */
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
 * The sounds — the handoff's synthesis
 * -------------------------------------------------------------------------- */

interface LobbySound {
  chime(): void;
  click(): void;
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
  const tone = (frequency: number, at: number, duration: number, gain: number, type: OscillatorType = 'sine'): void => {
    const c = audio();
    if (c === undefined) return;
    const oscillator = c.createOscillator();
    const amp = c.createGain();
    const t = c.currentTime + at;
    oscillator.type = type;
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
      tone(1318.5, 0, 0.9, 0.14);
      tone(2637, 0, 0.3, 0.02);
    },
    click: () => {
      tone(1700, 0, 0.035, 0.03, 'square');
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
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', LOBBY_COPY.regionLabel);
  root.style.cssText = [
    'box-sizing:border-box',
    'min-height:100%',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:18px',
    'padding:26px 18px 30px',
    `color:${P.cream}`,
    'background:repeating-linear-gradient(90deg,transparent 0 179px,rgba(0,0,0,.22) 179px 180px),' +
      'linear-gradient(180deg,#322D27,#26221D)',
    `font-family:${TYPE.body}`,
  ].join(';');

  const nameBlock = el(doc, 'div');
  nameBlock.style.cssText = 'text-align:center';
  const kicker = el(doc, 'div', undefined, LOBBY_COPY.kicker);
  kicker.style.cssText = MONO(500, 10.5, `letter-spacing:.3em;color:${P.taupe}`);
  /* The screen's one level-1 heading (`docs/36` AX-15): the name over the doors. */
  const building = el(doc, 'h1', undefined, LOBBY_COPY.building);
  building.style.cssText = `font:700 23px ${TYPE.heading};letter-spacing:.14em;color:${P.sand};margin:3px 0 0`;
  nameBlock.append(kicker, building);

  const row = el(doc, 'div');
  row.style.cssText = 'display:flex;align-items:stretch;justify-content:center;gap:22px;width:100%;max-width:940px';

  /* --- The building in section: the hoistway, and the landings beside it. --- */
  const section = el(doc, 'div', 'everyday-lobby-building');
  section.style.cssText = [
    'display:flex',
    'flex:1 1 0',
    'min-width:0',
    'max-width:580px',
    `border:1px solid ${P.bezel}`,
    'border-radius:14px',
    'overflow:hidden',
    `background:${STEEL}`,
    `box-shadow:0 14px 30px rgba(0,0,0,.35),inset 0 0 0 1px ${P.rule}`,
  ].join(';');

  const hoist = el(doc, 'div', 'everyday-lobby-hoist');
  hoist.setAttribute('aria-hidden', 'true');
  hoist.style.cssText = [
    'position:relative',
    'flex:none',
    'width:92px',
    /* The pit and the two guide rails: the hoistway's own drawing, behind the car. */
    'background:linear-gradient(90deg,transparent 0 13px,rgba(230,220,203,.16) 13px 14px,transparent 14px 71px,' +
      'rgba(230,220,203,.16) 71px 72px,transparent 72px),linear-gradient(180deg,#171411,#0F0D0B)',
    `border-right:1px solid ${P.bezel}`,
  ].join(';');

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
    readonly button: HTMLButtonElement;
    readonly plate: HTMLElement;
    readonly name: HTMLElement;
    readonly body: HTMLElement;
    readonly status: HTMLElement;
    readonly rooms: HTMLElement;
  }
  const landings: LandingParts[] = [];

  const press = (key: GameFloorKey): void => {
    const pressed = lobbyPress(state, key);
    sound.chime();
    ports.stepOut(pressed.floor, pressed.engineer);
  };

  const point = (key: GameFloorKey): void => {
    const next = lobbyPoint(state, key);
    if (next === state) return;
    const from = state.car;
    state = next;
    render();
    travel(from, key);
  };

  for (const key of GAME_FLOOR_ORDER) {
    /*
     * The lobby's floor is also the way to the main menu, so it carries the class the browser tier
     * and every earlier description of this screen knows that way by.
     */
    const button = el(doc, 'button', key === 'L' ? 'everyday-lobby-floor-button everyday-lobby-menu' : 'everyday-lobby-floor-button');
    button.type = 'button';
    button.dataset['floor'] = key;
    button.style.cssText = [
      'display:grid',
      'grid-template-columns:44px minmax(0,1fr)',
      'align-items:center',
      'column-gap:14px',
      'flex:1 1 auto',
      'min-height:76px',
      'box-sizing:border-box',
      'padding:10px 16px 10px 14px',
      'text-align:left',
      'background:transparent',
      'border:0',
      /* The floor slab, running through to the hoistway. */
      `border-bottom:${key === 'B' ? '0' : `2px solid ${P.bezel}`}`,
      `color:${P.cream}`,
      'cursor:pointer',
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
    const rooms = el(doc, 'span');
    rooms.style.cssText = MONO(500, 10, `display:block;letter-spacing:.04em;color:${P.taupe};margin-top:4px`);
    text.append(name, body, status, rooms);
    button.append(plate, text);

    button.addEventListener('mouseenter', () => {
      point(key);
    });
    button.addEventListener('focus', () => {
      point(key);
    });
    button.addEventListener('click', () => {
      press(key);
    });
    /* Up and down walk the landings, as the arrows on a real panel would. */
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      const index = GAME_FLOOR_ORDER.indexOf(key) + (event.key === 'ArrowUp' ? -1 : 1);
      const target = landings[index];
      if (target === undefined) return;
      event.preventDefault();
      target.button.focus();
    });

    landings.push({ key, button, plate, name, body, status, rooms });
    list.append(button);
  }
  section.append(hoist, list);

  /* --- The display beside the shaft, and the three quiet things under it. --- */
  const side = el(doc, 'div');
  side.style.cssText = 'display:flex;flex-direction:column;gap:12px;flex:none;width:292px';

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
    'flex:1 1 auto',
    'box-sizing:border-box',
    `background:${STEEL}`,
    `border:1px solid ${P.bezel}`,
    'border-radius:14px',
    'padding:18px 18px 20px',
    'min-height:196px',
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

  /* A returning player's quick way back into their week — the menu tile's words and press. */
  const resume = el(doc, 'button', 'everyday-lobby-continue');
  resume.type = 'button';
  resume.style.cssText = [
    'display:none',
    'flex-direction:column',
    'align-items:flex-start',
    'gap:2px',
    `background:${P.amber}`,
    `color:${P.ink}`,
    'border:0',
    'border-radius:10px',
    'padding:10px 16px',
    'cursor:pointer',
    'text-align:left',
    `font:600 14px ${TYPE.heading}`,
  ].join(';');
  const resumeTitle = el(doc, 'span');
  const resumeLine = el(doc, 'span');
  resumeLine.style.cssText = MONO(500, 10.5, 'letter-spacing:.04em');
  resume.append(resumeTitle, resumeLine);
  resume.addEventListener('click', () => {
    sound.click();
    ports.pressResume();
  });

  /* The Engineer key: a switch, drawn as the key plate on a car panel. */
  const keyButton = el(doc, 'button', 'everyday-lobby-key');
  keyButton.type = 'button';
  keyButton.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:10px',
    'background:transparent',
    `border:1px solid ${P.bezel}`,
    'border-radius:10px',
    'padding:9px 12px',
    'cursor:pointer',
    `color:${P.stone}`,
    'text-align:left',
  ].join(';');
  const keyBarrel = el(doc, 'span');
  keyBarrel.setAttribute('aria-hidden', 'true');
  keyBarrel.style.cssText = [
    'flex:none',
    'width:26px',
    'height:26px',
    'border-radius:50%',
    `border:1.5px solid ${P.bezel}`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
  ].join(';');
  const keySlot = el(doc, 'span');
  keySlot.style.cssText = `width:3px;height:14px;border-radius:2px;background:${P.stone};transition:transform .18s ${EASING}`;
  keyBarrel.append(keySlot);
  const keyText = el(doc, 'span');
  keyText.style.cssText = 'display:block;min-width:0';
  const keyLabel = el(doc, 'span', undefined, LOBBY_COPY.engineerKey);
  keyLabel.style.cssText = MONO(500, 10, 'display:block;letter-spacing:.16em');
  const keyFace = el(doc, 'span');
  keyFace.style.cssText = MONO(500, 10, `display:block;letter-spacing:.08em;margin-top:2px;color:${P.taupe}`);
  keyText.append(keyLabel, keyFace);
  keyButton.append(keyBarrel, keyText);
  keyButton.addEventListener('click', () => {
    sound.click();
    state = lobbyTurnKey(state);
    render();
  });
  const keyNote = el(doc, 'div', 'everyday-lobby-hint');
  keyNote.setAttribute('aria-live', 'polite');
  keyNote.style.cssText = MONO(500, 10.5, `letter-spacing:.03em;color:${P.amber};min-height:1.3em`);

  const landing = el(doc, 'button', 'everyday-lobby-landing', LOBBY_COPY.whatThisIs);
  landing.type = 'button';
  landing.style.cssText = [
    'align-self:flex-start',
    'background:transparent',
    'border:0',
    `border-bottom:1px solid ${P.taupe}`,
    'padding:6px 0 2px',
    'min-height:24px',
    'cursor:pointer',
    MONO(500, 11, `letter-spacing:.08em;color:${P.taupe}`),
  ].join(';');
  landing.addEventListener('click', () => {
    ports.toLanding();
  });

  side.append(indicator, display, resume, keyButton, keyNote, landing);
  row.append(section, side);
  root.append(nameBlock, row);
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
    side.style.width = narrow ? '100%' : '292px';
    side.style.maxWidth = narrow ? '580px' : '';
    display.style.minHeight = narrow ? '0' : '196px';
    root.style.justifyContent = narrow ? 'flex-start' : 'center';
    root.style.padding = narrow ? '16px 12px 22px' : '26px 18px 30px';
    hoist.style.width = narrow ? '64px' : '92px';
    car.style.left = narrow ? '9px' : '16px';
    car.style.width = narrow ? '40px' : '53px';
    rope.style.left = narrow ? '29px' : '42px';
    hoist.style.backgroundImage = narrow
      ? 'linear-gradient(90deg,transparent 0 6px,rgba(230,220,203,.16) 6px 7px,transparent 7px 51px,' +
        'rgba(230,220,203,.16) 51px 52px,transparent 52px),linear-gradient(180deg,#171411,#0F0D0B)'
      : '';
    weight.style.right = narrow ? '3px' : '6px';
    weight.style.width = narrow ? '6px' : '9px';
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
    const top = at.button.offsetTop + 8;
    const height = Math.max(40, at.button.offsetHeight - 18);
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
      const landingView = view.landings.find((candidate) => candidate.key === parts.key);
      if (landingView === undefined) continue;
      parts.name.textContent = landingView.name;
      parts.body.textContent = landingView.body;
      parts.status.textContent = landingView.status;
      parts.status.style.display = landingView.status === '' ? 'none' : 'block';
      parts.rooms.textContent = landingView.rooms;
      parts.rooms.style.display = landingView.rooms === '' ? 'none' : 'block';
      parts.plate.style.background = landingView.here ? BUTTON_LIT : BUTTON_OFF;
      parts.plate.style.color = landingView.here ? P.amberHot : P.stone;
      parts.plate.style.borderColor = landingView.here ? P.amber : P.bezel;
      parts.plate.style.boxShadow = landingView.here ? GLOW_LIT : 'none';
      parts.button.style.background = landingView.here ? 'rgba(242,166,59,.07)' : 'transparent';
    }

    keyButton.setAttribute('aria-pressed', view.keyOn ? 'true' : 'false');
    keyButton.style.borderColor = view.keyOn ? P.amber : P.bezel;
    keySlot.style.transform = view.keyOn ? 'rotate(90deg)' : 'none';
    keySlot.style.background = view.keyOn ? P.amber : P.stone;
    keyFace.textContent = view.keyOn ? LOBBY_COPY.engineer : LOBBY_COPY.casual;
    keyNote.textContent = view.keyNote;

    const entry = ports.resume();
    resume.style.display = entry === undefined ? 'none' : 'flex';
    if (entry !== undefined) {
      resumeTitle.textContent = entry.title;
      resumeLine.textContent = entry.line;
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
