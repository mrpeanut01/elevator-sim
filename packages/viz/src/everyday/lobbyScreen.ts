/**
 * **The lobby, drawn** — the elevator cold-open, [§ D1445](../../../../DECISIONS.md).
 *
 * Every word and every decision about the doors is `lobbyModel.ts`'s; this file is the mount, the
 * timers that move the car, and the two sounds. It is built to
 * `docs/design/design_handoff_lobby_intro/README.md`, whose colours, spacing and timings are final,
 * and where the handoff and the shell's own tokens name the same colour the token is used.
 *
 * ## Why the shell owns the route rather than the registry
 *
 * The lobby is the first thing on the page and it needs nothing from the simulation host to draw:
 * the panel, the doors and the copy are all fixed. A registered screen is held behind the host until
 * `dev/main.ts` publishes it (`shell.ts#drawHostPending`), which would put a waiting sentence on the
 * one screen that has nothing to wait for, for the first half second of every visit. So the shell
 * routes `lobby` itself, the way it routes the menu, and hands this mount {@link LobbyPorts}: the
 * three things the lobby does to the rest of the product, and the one question it asks of the host.
 *
 * ## Sound and motion
 *
 * Sound follows Settings → Sound, and the `AudioContext` is built on the first press that makes a
 * noise, never before, so a player with Sound off never causes one to exist (the stage's own rule,
 * `stageScreen.ts#sound`). Motion follows the Engineer surface's *Motion* switch where it has
 * published and the operating system's `prefers-reduced-motion` always.
 */

import { REDUCED_MOTION_QUERY } from '../dev/motion.js';
import { engineerSettings } from './engineerBridge.js';
import {
  LOBBY_COPY,
  LOBBY_FLOORS,
  LOBBY_GROUPS,
  LOBBY_INITIAL,
  LOBBY_TIMINGS,
  lobbyArrived,
  lobbyCall,
  lobbyClearFlash,
  lobbyClose,
  lobbyDepart,
  lobbyDepartureStands,
  lobbyDirectionTo,
  lobbyFloorOf,
  lobbyHold,
  lobbyOpen,
  lobbyPick,
  lobbyRideBack,
  lobbyStepToward,
  lobbyTick,
  lobbyTimingsFor,
  lobbyTurnKey,
  lobbyViewOf,
  type LobbyEffect,
  type LobbyFloor,
  type LobbyFloorKey,
  type LobbyState,
  type LobbyStep,
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
  /** *Step out*: open the floor's screen, in the Engineer view when the key is turned. */
  stepOut(floor: LobbyFloor, engineer: boolean): void;
  /** The quiet way past the ride, to the existing menu. */
  toMenu(): void;
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
 * The handoff's palette, on the shell's tokens where they agree
 * -------------------------------------------------------------------------- */

const P = Object.freeze({
  ink: C.ink,
  cream: C.paper,
  sand: '#E6DCCB',
  stone: C.fainter,
  taupe: C.label,
  slate: C.warmGrey,
  warm: C.inkSoft,
  bezel: '#3A352E',
  rule: RAIL.edge,
  screen: '#1B1916',
  lcd: '#120F0C',
  hallLcd: '#141210',
  amber: C.sun,
  amberHot: '#FFC56B',
  amberDim: '#C9893A',
  rust: C.terracotta,
});

/** The handoff's door easing, verbatim. */
const DOOR_EASING = 'cubic-bezier(.65,0,.25,1)';

/**
 * The least the fit may scale the panel to on a phone: the 36 px floor buttons then draw 27 px tall,
 * over SC 2.5.8's 24 (`docs/36` § 1), and every other control on the panel is larger.
 */
const NARROW_MIN_SCALE = 0.75;

/** The frame's height on a phone before the call, short enough to keep CALL above the fold. */
const NARROW_IDLE_FRAME_PX = 180;

const STEEL =
  'repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 1px,transparent 1px 3px),' +
  'linear-gradient(180deg,#38332C,#26221D)';
const STEEL_SHADOW = `0 14px 30px rgba(0,0,0,.35),inset 0 0 0 1px ${P.rule}`;
const BUTTON_OFF = 'radial-gradient(circle at 50% 35%,#4A443A,#26221D)';
const BUTTON_LIT = 'radial-gradient(circle at 50% 40%,#5A4426,#2A2218)';
const GLOW_LIT = '0 0 0 3px rgba(242,166,59,.16),0 0 16px rgba(242,166,59,.5)';
const MONO = (weight: number, size: number, extra = ''): string =>
  `font:${String(weight)} ${String(size)}px ${TYPE.mono};${extra}`;

/* -------------------------------------------------------------------------- *
 * The two sounds — the handoff's synthesis, verbatim
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
      tone(1318.5, 0, 1.3, 0.16);
      tone(2637, 0, 0.4, 0.02);
      tone(1046.5, 0.38, 1.8, 0.16);
      tone(2093, 0.38, 0.4, 0.02);
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

/* -------------------------------------------------------------------------- *
 * Icons
 * -------------------------------------------------------------------------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function icon(doc: Document, paths: readonly string[], size: number): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';
  for (const d of paths) {
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
  }
  return svg;
}

const ICONS = Object.freeze({
  up: ['M12 6 L19 17 L5 17 Z'],
  open: ['M3 12 L9 6 L9 18 Z', 'M11 5 H13 V19 H11 Z', 'M21 12 L15 6 L15 18 Z'],
  close: ['M10 12 L4 6 L4 18 Z', 'M11 5 H13 V19 H11 Z', 'M14 12 L20 6 L20 18 Z'],
  hold: ['M7 5 H10.5 V19 H7 Z', 'M13.5 5 H17 V19 H13.5 Z'],
});

/* -------------------------------------------------------------------------- *
 * The mount
 * -------------------------------------------------------------------------- */

export function mountLobby(region: HTMLElement, ports: LobbyPorts): MountedLobby {
  const doc = region.ownerDocument;
  const win = doc.defaultView;
  const timers = new Set<number>();
  const sound = lobbySound();
  let state: LobbyState = LOBBY_INITIAL;
  let pressed: '' | 'call' | 'open' | 'close' = '';
  let unmounted = false;

  const reduced = (): boolean =>
    engineerSettings()?.reduceMotion() === true || win?.matchMedia(REDUCED_MOTION_QUERY).matches === true;
  const timings = (): ReturnType<typeof lobbyTimingsFor> => lobbyTimingsFor(reduced());

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
    /*
     * The region's height rather than the viewport's: the handoff sizes the frame from `100vh`, and
     * on this page the consent ask can stand above the region, which pushed the doors below the fold.
     * The frame takes what the column leaves instead, and the panel's fit-to-height does the rest.
     */
    'height:100%',
    'min-height:520px',
    'box-sizing:border-box',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:14px',
    'padding:22px 18px 26px',
    'overflow:hidden',
    'background:repeating-linear-gradient(90deg,#2C2823 0 178px,#24211C 178px 180px)',
    `color:${P.sand}`,
    `font-family:${TYPE.body}`,
  ].join(';');

  /* 1. The building's name. */
  const nameBlock = el(doc, 'div');
  nameBlock.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px';
  const eyebrow = el(doc, 'div', undefined, LOBBY_COPY.kicker);
  eyebrow.style.cssText = MONO(500, 10, `letter-spacing:.3em;color:${P.taupe}`);
  const heading = el(doc, 'h1', undefined, LOBBY_COPY.building);
  heading.style.cssText = `margin:0;font:700 22px ${TYPE.heading};letter-spacing:.14em;color:${P.sand}`;
  nameBlock.append(eyebrow, heading);

  /* 2. The hall position indicator. */
  const hallIndicator = el(doc, 'div', 'everyday-lobby-indicator');
  hallIndicator.setAttribute('aria-hidden', 'true');
  hallIndicator.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:16px',
    `background:${P.hallLcd}`,
    `border:2px solid ${P.rule}`,
    'border-radius:8px',
    'padding:7px 18px',
    'box-shadow:inset 0 2px 8px rgba(0,0,0,.6)',
  ].join(';');
  const hallUp = el(doc, 'span', undefined, '▲');
  const hallDigit = el(doc, 'span', 'everyday-lobby-floor');
  const hallDown = el(doc, 'span', undefined, '▼');
  for (const glyph of [hallUp, hallDown]) glyph.style.cssText = MONO(400, 15, 'width:14px;text-align:center');
  hallDigit.style.cssText = MONO(
    500,
    34,
    `line-height:1;color:${P.amber};min-width:44px;text-align:center;text-shadow:0 0 10px rgba(242,166,59,.55)`,
  );
  hallIndicator.append(hallUp, hallDigit, hallDown);

  /* 3. The door row: the frame and the hall call plate. */
  const doorRow = el(doc, 'div');
  doorRow.style.cssText =
    'display:flex;align-items:center;gap:22px;max-width:100%;flex:1 1 auto;min-height:0;max-height:730px';

  const frameColumn = el(doc, 'div');
  frameColumn.style.cssText =
    'display:flex;flex-direction:column;align-items:center;min-width:0;height:100%;min-height:0';
  const frame = el(doc, 'div');
  frame.style.cssText = [
    'width:min(76vw,820px)',
    'flex:1 1 auto',
    'min-height:320px',
    'max-height:720px',
    'box-sizing:border-box',
    'padding:16px 16px 0',
    'border-radius:6px 6px 0 0',
    'background:linear-gradient(180deg,#A89C87,#7E7465)',
    'box-shadow:0 20px 50px rgba(0,0,0,.45)',
    'display:flex',
  ].join(';');
  const sill = el(doc, 'div');
  sill.style.cssText =
    'width:calc(min(76vw,820px) + 24px);height:10px;background:linear-gradient(180deg,#C6B79F,#6E665A);border-radius:2px';
  const opening = el(doc, 'div');
  opening.style.cssText = `position:relative;overflow:hidden;flex:1;box-shadow:inset 0 0 0 2px #5C554A`;
  frame.append(opening);
  frameColumn.append(frame, sill);

  /* The car interior, behind the doors. */
  const layer = (css: string): HTMLElement => {
    const node = el(doc, 'div');
    node.setAttribute('aria-hidden', 'true');
    node.style.cssText = 'position:absolute;' + css;
    opening.append(node);
    return node;
  };
  layer('inset:0;background:linear-gradient(180deg,#F1E9DA,#D8CBB4)');
  layer('inset:0;background:repeating-linear-gradient(90deg,transparent 0 24.6%,rgba(110,102,90,.22) 24.6% 25%)');
  layer('left:8%;right:8%;top:0;height:9px;background:#FFF8EA;box-shadow:0 0 40px 12px rgba(255,240,210,.55)');
  layer('left:0;right:0;top:62%;height:7px;background:linear-gradient(180deg,#E8C27A,#A57A33);box-shadow:0 3px 4px rgba(0,0,0,.18)');
  layer('left:0;right:0;bottom:0;height:7%;background:linear-gradient(180deg,#6E665A,#4C463D)');

  /* The fit box: the display and the panel, scaled to the opening's height. */
  const fitBox = el(doc, 'div');
  fitBox.style.cssText =
    'position:absolute;inset:0;box-sizing:border-box;padding:22px 4% 40px;display:flex;align-items:center;justify-content:center;z-index:1';
  opening.append(fitBox);
  const fitInner = el(doc, 'div');
  fitInner.style.cssText =
    'display:flex;flex-wrap:wrap;gap:22px;align-items:stretch;justify-content:center;transform-origin:center';
  fitBox.append(fitInner);

  /* The doors, over everything inside. */
  const stripes = 'repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 1px,rgba(0,0,0,.04) 1px 3px)';
  const doorLeft = layer(
    `left:0;top:0;bottom:0;width:50%;z-index:2;background:${stripes},linear-gradient(90deg,#A99C86,#CDC2AE 60%,#B4A893);box-shadow:inset -2px 0 0 rgba(0,0,0,.3)`,
  );
  const doorRight = layer(
    `right:0;top:0;bottom:0;width:50%;z-index:2;background:${stripes},linear-gradient(90deg,#B4A893,#CDC2AE 40%,#A99C86);box-shadow:inset 2px 0 0 rgba(255,255,255,.25)`,
  );
  doorLeft.className = 'everyday-lobby-door';
  doorRight.className = 'everyday-lobby-door';

  /* --- The in-car display --- */
  const display = el(doc, 'div', 'everyday-lobby-display');
  display.style.cssText = [
    'flex:1 1 240px',
    'max-width:380px',
    'min-height:300px',
    'box-sizing:border-box',
    `background:${P.screen}`,
    `border:7px solid ${P.bezel}`,
    'border-radius:12px',
    'padding:22px 22px 18px',
    'display:flex',
    'flex-direction:column',
    'gap:10px',
    'box-shadow:0 10px 26px rgba(0,0,0,.28)',
  ].join(';');
  const displayTop = el(doc, 'div');
  displayTop.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';
  const kicker = el(doc, 'div');
  kicker.style.cssText = MONO(500, 10, `letter-spacing:.16em;color:${P.taupe}`);
  const heldBadge = el(doc, 'span', 'everyday-lobby-held', LOBBY_COPY.held);
  heldBadge.style.cssText = MONO(
    500,
    9.5,
    `letter-spacing:.14em;color:${P.ink};background:${P.amber};border-radius:4px;padding:3px 6px`,
  );
  displayTop.append(kicker, heldBadge);
  const title = el(doc, 'h2', 'everyday-lobby-title');
  title.style.cssText = `margin:0;font:700 30px/1.05 ${TYPE.heading};letter-spacing:-.02em;color:${P.cream}`;
  const body = el(doc, 'p');
  body.style.cssText = `margin:0;font:14.5px/1.55 ${TYPE.body};color:${P.stone}`;
  const status = el(doc, 'div');
  status.style.cssText = MONO(500, 11.5, `color:${P.amber};line-height:1.5`);
  const footer = el(doc, 'div');
  footer.style.cssText = `margin-top:auto;border-top:1px solid ${P.bezel};padding-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px`;
  const statusLine = el(doc, 'div', 'everyday-lobby-status');
  statusLine.setAttribute('role', 'status');
  const track = el(doc, 'div');
  track.setAttribute('aria-hidden', 'true');
  track.style.cssText = `width:70px;height:4px;background:${P.bezel};border-radius:2px;overflow:hidden;flex:none`;
  const fill = el(doc, 'div');
  fill.style.cssText = `height:100%;background:${P.amber};transition:width 1s linear`;
  track.append(fill);
  footer.append(statusLine, track);
  display.append(displayTop, title, body, status, footer);

  /* --- The car operating panel --- */
  const panel = el(doc, 'div', 'everyday-lobby-panel');
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', LOBBY_COPY.panelLabel);
  panel.style.cssText = [
    'position:relative',
    'width:304px',
    'box-sizing:border-box',
    'border-radius:8px',
    'padding:16px 18px',
    'display:flex',
    'flex-direction:column',
    'gap:9px',
    `background:${STEEL}`,
    `box-shadow:${STEEL_SHADOW}`,
  ].join(';');
  for (const [x, y] of [
    ['left', 'top'],
    ['right', 'top'],
    ['left', 'bottom'],
    ['right', 'bottom'],
  ] as const) {
    const screw = el(doc, 'span');
    screw.setAttribute('aria-hidden', 'true');
    screw.style.cssText = `position:absolute;${x}:7px;${y}:7px;width:6px;height:6px;border-radius:50%;background:${P.slate}`;
    panel.append(screw);
  }

  const lcd = el(doc, 'div');
  lcd.setAttribute('aria-hidden', 'true');
  lcd.style.cssText = `display:flex;align-items:center;gap:8px;background:${P.lcd};border-radius:5px;padding:8px 12px;box-shadow:inset 0 2px 6px rgba(0,0,0,.7)`;
  const lcdDigit = el(doc, 'span');
  lcdDigit.style.cssText = MONO(500, 26, `line-height:1;color:${P.amber};text-shadow:0 0 8px rgba(242,166,59,.5)`);
  const lcdDir = el(doc, 'span');
  lcdDir.style.cssText = MONO(400, 12, `color:${P.amber};width:12px`);
  const lcdLine = el(doc, 'span');
  lcdLine.style.cssText = MONO(
    500,
    10,
    `margin-left:auto;color:${P.amberDim};letter-spacing:.08em;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`,
  );
  lcd.append(lcdDigit, lcdDir, lcdLine);
  panel.append(lcd);

  const floorButtons = new Map<LobbyFloorKey, { button: HTMLButtonElement; numeral: HTMLElement; label: HTMLElement }>();
  for (const group of LOBBY_GROUPS) {
    const floors = LOBBY_FLOORS.filter((floor) => floor.group === group);
    if (floors.length === 0) continue;
    const header = el(doc, 'div', undefined, group);
    header.style.cssText = MONO(500, 9, `letter-spacing:.2em;color:${P.taupe};border-bottom:1px solid ${P.rule};padding:4px 0 3px`);
    const grid = el(doc, 'div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:9px 10px';
    for (const floor of floors) {
      const button = el(doc, 'button', 'everyday-lobby-floor-button');
      button.type = 'button';
      button.dataset['floor'] = floor.key;
      button.dataset['screen'] = floor.screen;
      button.setAttribute('aria-label', `Floor ${floor.key}, ${floor.name}`);
      button.style.cssText =
        'display:flex;align-items:center;gap:8px;background:none;border:0;padding:0;cursor:pointer;text-align:left;min-width:0';
      const numeral = el(doc, 'span', undefined, floor.key);
      numeral.setAttribute('aria-hidden', 'true');
      const label = el(doc, 'span', undefined, floor.name);
      label.style.cssText = `font:600 12.5px/1.2 ${TYPE.body};transition:color .18s`;
      button.append(numeral, label);
      button.addEventListener('click', () => {
        apply(lobbyPick(state, floor.key));
      });
      grid.append(button);
      floorButtons.set(floor.key, { button, numeral, label });
    }
    panel.append(header, grid);
  }

  /* Door controls. */
  const controls = el(doc, 'div');
  controls.style.cssText = `display:grid;grid-template-columns:repeat(3,1fr);gap:8px;border-top:1px solid ${P.rule};padding-top:12px;margin-top:3px`;
  const control = (
    caption: string,
    paths: readonly string[],
    className: string,
  ): { wrap: HTMLElement; button: HTMLButtonElement } => {
    const wrap = el(doc, 'div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px';
    const button = el(doc, 'button', className);
    button.type = 'button';
    button.setAttribute('aria-label', caption.charAt(0) + caption.slice(1).toLowerCase());
    button.style.cssText = `width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;border:2px solid ${P.slate};transition:all .18s`;
    button.append(icon(doc, paths, 18));
    const text = el(doc, 'span', undefined, caption);
    text.setAttribute('aria-hidden', 'true');
    text.style.cssText = MONO(500, 9, `letter-spacing:.16em;color:${P.stone}`);
    wrap.append(button, text);
    controls.append(wrap);
    return { wrap, button };
  };
  const openControl = control(LOBBY_COPY.open, ICONS.open, 'everyday-lobby-open');
  const closeControl = control(LOBBY_COPY.close, ICONS.close, 'everyday-lobby-close');
  const holdControl = control(LOBBY_COPY.hold, ICONS.hold, 'everyday-lobby-hold');
  openControl.button.addEventListener('click', () => {
    flashPressed('open');
    apply(lobbyOpen(state));
  });
  closeControl.button.addEventListener('click', () => {
    flashPressed('close');
    apply(lobbyClose(state));
  });
  holdControl.button.addEventListener('click', () => {
    apply(lobbyHold(state));
  });
  panel.append(controls);

  /* The key switch. */
  const keyRow = el(doc, 'div');
  keyRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding-top:4px';
  const casualCaption = el(doc, 'span', undefined, LOBBY_COPY.casual);
  const engineerCaption = el(doc, 'span', undefined, LOBBY_COPY.engineer);
  for (const caption of [casualCaption, engineerCaption]) {
    caption.setAttribute('aria-hidden', 'true');
    caption.style.cssText = MONO(500, 9, 'letter-spacing:.16em;transition:color .3s');
  }
  const keyButton = el(doc, 'button', 'everyday-lobby-key');
  keyButton.type = 'button';
  keyButton.setAttribute('role', 'switch');
  keyButton.setAttribute('aria-label', 'Engineer key');
  /*
   * The handoff's keyhole is 30 px, which the fit takes below SC 2.5.8's 24 px on any screen that
   * scales the panel under 0.8 (`docs/36` § 1). So the button is a 44 px hit area with a 7 px
   * negative margin, which lays out exactly as the 30 px circle did, and the circle is drawn inside.
   */
  keyButton.style.cssText =
    'width:44px;height:44px;margin:-7px;border-radius:50%;border:0;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;background:none';
  const keyhole = el(doc, 'span');
  keyhole.setAttribute('aria-hidden', 'true');
  keyhole.style.cssText =
    'width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle,#8D8271,#4A443A)';
  const slot = el(doc, 'span');
  slot.style.cssText = `width:4px;height:18px;border-radius:2px;background:${P.screen};transition:transform .3s`;
  keyhole.append(slot);
  keyButton.append(keyhole);
  keyButton.addEventListener('click', () => {
    apply(lobbyTurnKey(state));
  });
  keyRow.append(casualCaption, keyButton, engineerCaption);
  panel.append(keyRow);

  /*
   * Everything on the panel, which sits behind the doors: out of the Tab order while they are shut,
   * so a keyboard reaches CALL first rather than fourteen stops nobody can see. `tabIndex` rather
   * than `inert`, whose three writers are the shells' (see CLAUDE.md); a pointer is already stopped
   * by the doors themselves.
   */
  const panelControls: readonly HTMLButtonElement[] = [
    ...[...floorButtons.values()].map((parts) => parts.button),
    openControl.button,
    closeControl.button,
    holdControl.button,
    keyButton,
  ];

  /* --- The arrival view --- */
  const arrival = el(doc, 'div', 'everyday-lobby-arrival');
  arrival.style.cssText =
    'display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:6% 8% 10%;text-align:center;box-sizing:border-box;width:100%';
  const arrivalFloor = el(doc, 'div');
  arrivalFloor.style.cssText = MONO(500, 11, `letter-spacing:.24em;color:${P.slate}`);
  const arrivalName = el(doc, 'h2');
  arrivalName.style.cssText = `margin:0;font:700 clamp(34px,5vw,56px)/1 ${TYPE.heading};letter-spacing:-.03em;color:${P.ink}`;
  const arrivalBody = el(doc, 'p');
  arrivalBody.style.cssText = `margin:0;font-size:16px;line-height:1.55;color:${P.warm};max-width:46ch`;
  const arrivalActions = el(doc, 'div');
  arrivalActions.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:6px';
  const stepOut = el(doc, 'button', 'everyday-lobby-step-out', LOBBY_COPY.stepOut);
  stepOut.type = 'button';
  const STEP_OUT = `background:${P.ink};color:${P.cream};border:0;border-radius:10px;padding:12px 20px;font:600 16px ${TYPE.heading};cursor:pointer`;
  stepOut.style.cssText = STEP_OUT;
  stepOut.addEventListener('mouseenter', () => {
    stepOut.style.background = P.rust;
  });
  stepOut.addEventListener('mouseleave', () => {
    stepOut.style.background = P.ink;
  });
  const backButton = el(doc, 'button', 'everyday-lobby-back', LOBBY_COPY.backToLobby);
  backButton.type = 'button';
  backButton.style.cssText = `background:transparent;color:${P.ink};border:1.5px solid ${P.taupe};border-radius:10px;padding:11px 18px;font:600 16px ${TYPE.heading};cursor:pointer`;
  backButton.addEventListener('mouseenter', () => {
    backButton.style.borderColor = P.ink;
  });
  backButton.addEventListener('mouseleave', () => {
    backButton.style.borderColor = P.taupe;
  });
  arrivalActions.append(stepOut, backButton);
  const arrivalNote = el(doc, 'div');
  arrivalNote.style.cssText = MONO(400, 11, `color:${P.slate}`);
  arrival.append(arrivalFloor, arrivalName, arrivalBody, arrivalActions, arrivalNote);
  stepOut.addEventListener('click', () => {
    if (state.phase !== 'arrived' || state.sel === undefined) return;
    sound.click();
    ports.stepOut(lobbyFloorOf(state.sel), state.keyOn);
  });
  backButton.addEventListener('click', () => {
    apply(lobbyRideBack(state));
  });

  fitInner.append(display, panel);
  fitBox.append(arrival);

  /* --- The hall call plate --- */
  const plate = el(doc, 'div', 'everyday-lobby-plate');
  plate.style.cssText = [
    'width:86px',
    'flex:none',
    'box-sizing:border-box',
    'border-radius:8px',
    'padding:16px 0 14px',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:10px',
    `background:${STEEL}`,
    `box-shadow:${STEEL_SHADOW}`,
  ].join(';');
  const lantern = el(doc, 'span');
  lantern.setAttribute('aria-hidden', 'true');
  lantern.style.cssText = 'width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:8px solid';
  const callButton = el(doc, 'button', 'everyday-lobby-call');
  callButton.type = 'button';
  callButton.setAttribute('aria-label', 'Call the car');
  callButton.style.cssText =
    'width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer;transition:all .18s';
  callButton.append(icon(doc, ICONS.up, 20));
  const callCaption = el(doc, 'span', undefined, LOBBY_COPY.call);
  callCaption.setAttribute('aria-hidden', 'true');
  callCaption.style.cssText = MONO(500, 9, `letter-spacing:.18em;color:${P.stone}`);
  plate.append(lantern, callButton, callCaption);
  callButton.addEventListener('click', () => {
    flashPressed('call');
    apply(lobbyCall(state));
  });

  doorRow.append(frameColumn, plate);

  /* 4. The hint line, and the two quiet ways past the ride. */
  const hint = el(doc, 'div', 'everyday-lobby-hint');
  hint.setAttribute('aria-live', 'polite');
  hint.style.cssText = MONO(500, 11.5, `letter-spacing:.06em;color:${P.stone};min-height:16px;text-align:center`);
  const quiet = el(doc, 'div');
  quiet.style.cssText = 'display:flex;gap:18px;justify-content:center';
  const quietLink = (text: string, className: string, onPress: () => void): HTMLButtonElement => {
    const link = el(doc, 'button', className, text);
    link.type = 'button';
    link.style.cssText = MONO(
      500,
      10.5,
      /* 7 px above and below rather than the drawn 4, for SC 2.5.8's 24 px height (`docs/36` § 1). */
      `letter-spacing:.08em;color:${P.taupe};background:none;border:0;padding:7px 2px;cursor:pointer;text-decoration:underline;text-underline-offset:3px`,
    );
    link.addEventListener('click', onPress);
    return link;
  };
  quiet.append(
    quietLink(LOBBY_COPY.mainMenu, 'everyday-lobby-menu', () => {
      ports.toMenu();
    }),
    quietLink(LOBBY_COPY.whatThisIs, 'everyday-lobby-landing', () => {
      ports.toLanding();
    }),
  );

  /* A returning player's quick way back into their week — the menu tile's words and press. */
  const resume = el(doc, 'button', 'everyday-lobby-continue');
  resume.type = 'button';
  resume.style.cssText = [
    'display:none',
    'flex-direction:column',
    'align-items:center',
    'gap:2px',
    `background:${P.amber}`,
    `color:${P.ink}`,
    'border:0',
    'border-radius:10px',
    'padding:9px 18px',
    'cursor:pointer',
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

  root.append(nameBlock, hallIndicator, doorRow, hint, resume, quiet);
  region.replaceChildren(root);

  /* ---------------------------------------------------------------- *
   * Narrow screens — the shell's own drawer breakpoint
   * ---------------------------------------------------------------- */

  /*
   * The handoff draws one geometry, for a desktop. At phone width the call plate beside the doors
   * took a quarter of the width and the fit scaled the panel below legibility, so under the shell's
   * drawer breakpoint the plate becomes a slim row under the sill, the frame takes the full width,
   * and the display drops its minimum height. Nothing about the machine or the words changes.
   */
  /*
   * And on a phone the fit may not shrink the panel past {@link NARROW_MIN_SCALE}: at 390 × 844 it
   * scaled to 0.57 with the consent ask answered and to 0.29 with it up, which drew the floor buttons
   * 10 to 20 px tall, under SC 2.5.8's 24 px (`docs/36` § 1). Once the car is called the frame grows
   * to hold the panel at that scale and the page scrolls instead; before the call the frame stays
   * short, because a tall frame pushed the call plate under the doors and below the fold.
   */
  let narrowNow = false;
  const narrowQuery = win?.matchMedia(`(max-width: ${String(EVERYDAY_RAIL_DRAWER_MAX_PX)}px)`);
  const applyNarrow = (narrow: boolean): void => {
    narrowNow = narrow;
    root.style.height = narrow ? 'auto' : '100%';
    root.style.minHeight = narrow ? '100%' : '520px';
    doorRow.style.flexDirection = narrow ? 'column' : 'row';
    doorRow.style.gap = narrow ? '10px' : '22px';
    doorRow.style.width = narrow ? '100%' : '';
    doorRow.style.maxHeight = narrow ? 'none' : '730px';
    frameColumn.style.width = narrow ? '100%' : '';
    frameColumn.style.height = narrow ? 'auto' : '100%';
    frameColumn.style.flex = narrow ? '1 1 auto' : '';
    frame.style.width = narrow ? '100%' : 'min(76vw,820px)';
    frame.style.minHeight = narrow ? `${String(NARROW_IDLE_FRAME_PX)}px` : '320px';
    sill.style.width = narrow ? 'calc(100% + 12px)' : 'calc(min(76vw,820px) + 24px)';
    plate.style.flexDirection = narrow ? 'row' : 'column';
    plate.style.width = narrow ? 'auto' : '86px';
    plate.style.padding = narrow ? '8px 16px' : '16px 0 14px';
    plate.style.gap = narrow ? '14px' : '10px';
    display.style.minHeight = narrow ? '0' : '300px';
    root.style.padding = narrow ? '14px 12px 18px' : '22px 18px 26px';
    root.style.gap = narrow ? '10px' : '14px';
  };
  applyNarrow(narrowQuery?.matches === true);
  const onNarrow = (event: MediaQueryListEvent): void => {
    applyNarrow(event.matches);
    refit();
  };
  narrowQuery?.addEventListener('change', onNarrow);

  /* ---------------------------------------------------------------- *
   * Fit the panel to the opening's height — the handoff's § 2
   * ---------------------------------------------------------------- */

  const refit = (): void => {
    const styles = win?.getComputedStyle(fitBox);
    if (styles === undefined) return;
    const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const height = fitInner.offsetHeight;
    if (narrowNow && height > 0) {
      const called = state.phase !== 'idle';
      const opening = Math.ceil(height * NARROW_MIN_SCALE + padding);
      frame.style.minHeight = called
        ? `${String(opening + parseFloat(win?.getComputedStyle(frame).paddingTop ?? '0'))}px`
        : `${String(NARROW_IDLE_FRAME_PX)}px`;
    }
    const available = fitBox.clientHeight - padding;
    const scale = height > 0 && available > 0 ? Math.min(1, available / height) : 1;
    fitInner.style.transform = `scale(${String(scale)})`;
  };
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refit);
  observer?.observe(fitBox);
  observer?.observe(fitInner);

  /* ---------------------------------------------------------------- *
   * The machine's effects
   * ---------------------------------------------------------------- */

  function flashPressed(which: 'call' | 'open' | 'close'): void {
    pressed = which;
    render();
    later(() => {
      if (pressed === which) {
        pressed = '';
        render();
      }
    }, LOBBY_TIMINGS.pressedMs);
  }

  function apply(step: LobbyStep): void {
    const raised = step.state.flash !== '' && step.state.flash !== state.flash ? step.state.flash : undefined;
    state = step.state;
    if (step.click) sound.click();
    if (raised !== undefined) {
      later(() => {
        state = lobbyClearFlash(state, raised);
        render();
      }, LOBBY_TIMINGS.warningMs);
    }
    run(step.effect);
    render();
  }

  function run(effect: LobbyEffect): void {
    if (effect.kind === 'ride') {
      ride(effect.to);
      return;
    }
    if (effect.kind === 'depart') {
      const { closeId } = effect;
      later(() => {
        if (!lobbyDepartureStands(state, closeId)) return;
        apply(lobbyDepart(state));
      }, timings().doorMs + LOBBY_TIMINGS.closeSettleMs);
    }
  }

  function ride(to: LobbyFloorKey): void {
    state = { ...state, dir: lobbyDirectionTo(state, to) };
    const step = (): void => {
      if (state.car === to) {
        sound.chime();
        state = { ...state, dir: undefined, lantern: true };
        render();
        later(() => {
          state = lobbyArrived(state);
          render();
          if (state.phase === 'arrived') stepOut.focus();
          else if (state.phase === 'open') focusPanel();
        }, timings().chimeToDoorsMs);
        return;
      }
      state = lobbyStepToward(state, to);
      render();
      later(step, timings().stepMs);
    };
    later(step, timings().stepMs);
  }

  /*
   * The doors opened on a press of CALL, or on the ride back from a floor: focus goes to the first
   * floor, which is the next thing to press. Only from CALL or from a control the doors just put out
   * of reach, so a player who tabbed elsewhere while the car came is left where they are.
   */
  function focusPanel(): void {
    const active = doc.activeElement;
    const lost = active === null || active === doc.body || active === callButton || active === stepOut || active === backButton;
    if (lost) panelControls[0]?.focus();
  }

  const tick = win?.setInterval(() => {
    const step = lobbyTick(state);
    if (step.state === state) return;
    apply(step);
  }, 1000);

  /* ---------------------------------------------------------------- *
   * Drawing
   * ---------------------------------------------------------------- */

  function paintRound(button: HTMLElement, lit: boolean, glow: string): void {
    button.style.borderColor = lit ? P.amber : P.slate;
    button.style.background = lit ? BUTTON_LIT : BUTTON_OFF;
    button.style.boxShadow = glow;
    button.style.color = lit ? P.amber : P.stone;
  }

  function render(): void {
    const view = lobbyViewOf(state, { firstVisit: ports.firstVisit() });
    const door = timings().doorMs;

    hallDigit.textContent = view.car;
    hallUp.style.color = view.upLit ? P.amber : P.bezel;
    hallDown.style.color = view.downLit ? P.amber : P.bezel;

    for (const node of [doorLeft, doorRight]) {
      node.style.transition = `transform ${String(door)}ms ${DOOR_EASING}`;
    }
    doorLeft.style.transform = view.doorsOpen ? 'translateX(-100%)' : 'translateX(0)';
    doorRight.style.transform = view.doorsOpen ? 'translateX(100%)' : 'translateX(0)';
    root.dataset['phase'] = state.phase;

    fitInner.style.display = view.arrived ? 'none' : 'flex';
    arrival.style.display = view.arrived ? 'flex' : 'none';

    kicker.textContent = view.kicker;
    heldBadge.style.display = view.held ? 'inline-block' : 'none';
    title.textContent = view.title;
    body.textContent = view.body;
    status.textContent = view.status;
    status.style.display = view.status === '' ? 'none' : 'block';
    statusLine.textContent = view.statusLine;
    statusLine.style.cssText = MONO(500, 11, `color:${view.statusIsWarning ? P.amber : P.taupe}`);
    fill.style.width = `${String(Math.round(view.countFraction * 100))}%`;

    lcdDigit.textContent = view.car;
    lcdDir.textContent = view.dirGlyph;
    lcdLine.textContent = view.lcdLine;

    for (const [key, parts] of floorButtons) {
      const lit = state.sel === key && !view.arrived;
      parts.numeral.style.cssText = [
        'width:36px',
        'height:36px',
        'flex:none',
        'border-radius:50%',
        'box-sizing:border-box',
        `border:2px solid ${lit ? P.amber : P.slate}`,
        `background:${lit ? BUTTON_LIT : BUTTON_OFF}`,
        `box-shadow:${lit ? GLOW_LIT : '0 2px 0 #15130F'}`,
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'transition:all .18s',
        MONO(500, 14, `color:${lit ? P.amberHot : P.sand}`),
      ].join(';');
      parts.label.style.color = lit ? P.cream : P.stone;
      parts.button.setAttribute('aria-pressed', lit ? 'true' : 'false');
    }

    const reachable = view.doorsOpen || state.phase === 'closing';
    for (const control of panelControls) control.tabIndex = reachable ? 0 : -1;

    paintRound(openControl.button, pressed === 'open', '0 2px 0 #15130F');
    paintRound(closeControl.button, pressed === 'close' || view.closeLit, '0 2px 0 #15130F');
    paintRound(holdControl.button, view.held, view.held ? '0 0 16px rgba(242,166,59,.5)' : '0 2px 0 #15130F');
    holdControl.button.setAttribute('aria-pressed', view.held ? 'true' : 'false');

    slot.style.transform = state.keyOn ? 'rotate(90deg)' : 'rotate(0deg)';
    keyButton.setAttribute('aria-checked', state.keyOn ? 'true' : 'false');
    casualCaption.style.color = state.keyOn ? P.slate : P.sand;
    engineerCaption.style.color = state.keyOn ? P.amber : P.slate;

    lantern.style.borderBottomColor = view.lantern ? P.amber : P.bezel;
    const callLit = view.callState === 'arriving' || pressed === 'call';
    callButton.style.border = `2px solid ${callLit ? P.amber : view.callState === 'idle' ? P.sand : P.slate}`;
    callButton.style.color = callLit ? P.amber : view.callState === 'idle' ? P.sand : P.slate;
    callButton.style.background = BUTTON_OFF;
    callButton.style.boxShadow =
      view.callState === 'arriving'
        ? '0 0 18px rgba(242,166,59,.55)'
        : view.callState === 'idle'
          ? '0 0 0 4px rgba(230,220,203,.08)'
          : 'none';

    arrivalFloor.textContent = view.arrivalFloor;
    arrivalName.textContent = view.arrivalName;
    arrivalBody.textContent = view.arrivalBody;
    arrivalNote.textContent = view.arrivalNote;

    hint.textContent = view.hint;
    const resuming = ports.resume();
    resume.style.display = resuming === undefined ? 'none' : 'flex';
    resumeTitle.textContent = resuming?.title ?? '';
    resumeLine.textContent = resuming?.line ?? '';
    refit();
  }

  render();
  callButton.focus({ preventScroll: true });

  return {
    unmount: () => {
      unmounted = true;
      for (const id of timers) win?.clearTimeout(id);
      timers.clear();
      if (tick !== undefined) win?.clearInterval(tick);
      observer?.disconnect();
      narrowQuery?.removeEventListener('change', onNarrow);
      sound.close();
    },
    reread: () => {
      if (!unmounted) render();
    },
  };
}
