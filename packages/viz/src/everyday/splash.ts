/**
 * **The opening doors, drawn** — the splash a cold launch plays over the lobby.
 *
 * A pair of lobby doors fills the window under a lintel with the floor indicator. The arrival
 * lantern lights, the doors slide apart onto the lobby, and the frame fades. The timeline and its
 * five-second ceiling are `splashModel.ts`'s; this file is the mount.
 *
 * ## Laid over the menu, never in front of it ([§ D1627](../../../../DECISIONS.md))
 *
 * `boot.ts` plays this **after** the shell has mounted, so the lobby is drawn and live underneath
 * from the first frame. The splash takes no pointer events, so a press lands on whatever it is over;
 * it is `aria-hidden`, so a screen reader meets the lobby straight away; and the first press, key or
 * scroll clears it on the spot without being consumed. It writes no `inert` (CLAUDE.md names that
 * attribute's three writers, and this is not a fourth). With reduced motion it is never drawn.
 *
 * ## Why one timer and the Web Animations API
 *
 * The motion is four `Element.animate` calls with delays, so the browser runs the whole timeline and
 * nothing here ticks. The one `setTimeout` takes the element off the page at
 * `SPLASH_TIMINGS.goneAtMs`, which is what makes the ceiling a property of the page rather than of
 * an animation event that a hidden tab might never fire. A browser without `animate` gets no splash.
 */

import { REDUCED_MOTION_QUERY } from '../dev/motion.js';
import { engineerSettings } from './engineerBridge.js';
import { LOBBY_COPY } from './lobbyModel.js';
import { LOBBY_GROUND } from './lobbyScreen.js';
import { el } from './screenDom.js';
import { SPLASH_ARROWS, SPLASH_CEILING_MS, SPLASH_FLOOR, splashTimingsFor } from './splashModel.js';
import { EVERYDAY_COLORS as C, EVERYDAY_TYPE as TYPE } from './tokens.js';

/** Above the shell (60) and everything the Engineer surface raises (40). */
const SPLASH_Z_INDEX = 1000;

/** The lobby's door easing, so the two door motions read as one building. */
const EASING = 'cubic-bezier(.65,0,.25,1)';

const STEEL =
  'repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 1px,transparent 1px 3px),' +
  'linear-gradient(180deg,#38332C,#26221D)';
const DOOR_STEEL =
  'repeating-linear-gradient(90deg,rgba(0,0,0,.05) 0 1px,transparent 1px 3px),' +
  'linear-gradient(180deg,#CFC4B0,#A89C87)';
const BEZEL = '#3A352E';
const AMBER_HOT = '#FFC56B';

/** The events that mean a player is already doing something, so the picture gets out of the way. */
const DISMISS_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export interface PlayingSplash {
  /** Take the splash off the page now. Idempotent. */
  dismiss(): void;
}

/**
 * Play the opening doors over the page, or do nothing and return `undefined` when motion is
 * reduced, the tab is hidden, or the browser cannot animate.
 */
export function mountOpeningDoors(doc: Document): PlayingSplash | undefined {
  const win = doc.defaultView;
  if (win === null || doc.visibilityState === 'hidden') return undefined;
  const reduced =
    engineerSettings()?.reduceMotion() === true || win.matchMedia(REDUCED_MOTION_QUERY).matches;
  const timings = splashTimingsFor(reduced);
  if (timings === undefined) return undefined;

  const root = el(doc, 'div', 'everyday-splash');
  root.setAttribute('aria-hidden', 'true');
  if (typeof root.animate !== 'function') return undefined;
  root.style.cssText = [
    'position:fixed',
    'inset:0',
    `z-index:${String(SPLASH_Z_INDEX)}`,
    'pointer-events:none',
    'display:flex',
    'flex-direction:column',
    'overflow:hidden',
  ].join(';');

  /* --- The lintel: the building's name, the floor indicator, the arrival lantern. --- */
  const lintel = el(doc, 'div', 'everyday-splash-lintel');
  lintel.style.cssText = [
    'flex:none',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:10px',
    'padding:clamp(14px,3vh,28px) 16px',
    `background:${STEEL}`,
    `border-bottom:1px solid ${BEZEL}`,
    'box-shadow:0 6px 18px rgba(0,0,0,.4)',
    'position:relative',
    'z-index:2',
  ].join(';');

  const name = el(doc, 'div', undefined, LOBBY_COPY.building);
  name.style.cssText = `font:700 clamp(18px,3.4vw,26px) ${TYPE.heading};letter-spacing:-.01em;color:#E6DCCB`;

  const indicator = el(doc, 'div', 'everyday-splash-indicator');
  indicator.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:12px',
    'padding:6px 16px',
    'background:#120F0C',
    `border:1px solid ${BEZEL}`,
    'border-radius:6px',
    `font:500 22px ${TYPE.mono}`,
    `color:${C.sun}`,
    'text-shadow:0 0 10px rgba(242,166,59,.55)',
  ].join(';');
  const up = el(doc, 'span', undefined, SPLASH_ARROWS.up);
  up.style.cssText = `font-size:12px;color:${BEZEL};text-shadow:none`;
  const floor = el(doc, 'span', undefined, SPLASH_FLOOR);
  const down = el(doc, 'span', undefined, SPLASH_ARROWS.down);
  down.style.cssText = `font-size:12px;color:${BEZEL};text-shadow:none`;
  indicator.append(up, floor, down);

  const lantern = el(doc, 'div', 'everyday-splash-lantern');
  lantern.style.cssText = [
    'width:min(180px,40vw)',
    'height:6px',
    'border-radius:3px',
    `background:${AMBER_HOT}`,
    'box-shadow:0 0 14px rgba(242,166,59,.7)',
    'opacity:.12',
  ].join(';');
  lintel.append(name, indicator, lantern);

  /* --- The opening: two jambs and two leaves meeting in the middle. --- */
  const opening = el(doc, 'div');
  opening.style.cssText = 'flex:1 1 auto;display:flex;min-height:0';
  const jamb = (side: 'left' | 'right'): HTMLDivElement => {
    const node = el(doc, 'div', 'everyday-splash-jamb');
    node.style.cssText = [
      'flex:none',
      'width:clamp(12px,3vw,32px)',
      `background:${STEEL}`,
      `border-${side === 'left' ? 'right' : 'left'}:1px solid ${BEZEL}`,
      'position:relative',
      'z-index:2',
    ].join(';');
    return node;
  };
  const leftJamb = jamb('left');
  const rightJamb = jamb('right');

  const doors = el(doc, 'div');
  /* The car's ground shows only while the doors are shut, so the seam has something to sit on. */
  doors.style.cssText = `flex:1 1 auto;position:relative;overflow:hidden;background:${LOBBY_GROUND}`;
  const leaf = (side: 'left' | 'right'): HTMLDivElement => {
    const node = el(doc, 'div', 'everyday-splash-door');
    node.style.cssText = [
      'position:absolute',
      'top:0',
      'bottom:0',
      `${side}:0`,
      'width:50%',
      `background:${DOOR_STEEL}`,
      `border-${side === 'left' ? 'right' : 'left'}:1px solid rgba(0,0,0,.45)`,
      'box-shadow:inset 0 0 40px rgba(0,0,0,.18)',
    ].join(';');
    return node;
  };
  const leftLeaf = leaf('left');
  const rightLeaf = leaf('right');
  doors.append(leftLeaf, rightLeaf);
  opening.append(leftJamb, doors, rightJamb);
  root.append(lintel, opening);
  doc.body.append(root);

  /* --- The timeline. Every motion is the browser's; nothing here ticks. --- */
  const at = (delay: number, duration: number): KeyframeAnimationOptions => ({
    delay,
    duration,
    easing: EASING,
    fill: 'both',
  });
  lantern.animate([{ opacity: 0.12 }, { opacity: 1 }], at(timings.lanternAtMs, 180));
  /* The ground behind the leaves goes as they open, so the lobby is what is revealed. */
  doors.animate(
    [{ backgroundColor: LOBBY_GROUND }, { backgroundColor: 'transparent' }],
    at(timings.doorsAtMs, 120),
  );
  leftLeaf.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-101%)' }],
    at(timings.doorsAtMs, timings.doorsMs),
  );
  rightLeaf.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(101%)' }],
    at(timings.doorsAtMs, timings.doorsMs),
  );
  lintel.animate(
    [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-30%)' }],
    at(timings.fadeAtMs, timings.fadeMs),
  );
  for (const side of [leftJamb, rightJamb]) {
    side.animate([{ opacity: 1 }, { opacity: 0 }], at(timings.fadeAtMs, timings.fadeMs));
  }

  let gone = false;
  const dismiss = (): void => {
    if (gone) return;
    gone = true;
    win.clearTimeout(timer);
    for (const type of DISMISS_EVENTS) win.removeEventListener(type, dismiss, true);
    root.remove();
  };
  /* Clamped as well as tested, so no edit to the timeline can hold the doors past the ceiling. */
  const timer = win.setTimeout(dismiss, Math.min(timings.goneAtMs, SPLASH_CEILING_MS));
  /* Capture and passive: the press still reaches what it was aimed at, this only hears it. */
  for (const type of DISMISS_EVENTS) win.addEventListener(type, dismiss, { capture: true, passive: true });

  return { dismiss };
}
