/**
 * **The four daily-loop screens' shared drawing vocabulary** — the elements and the § 19 dressings
 * that door, brief, report and week all use.
 *
 * ## Why this exists when `fixitScreen.ts` and `settingsScreen.ts` each declare their own `el`
 *
 * Two copies of a four-line helper is a shrug. Six is a decision, and it is the wrong one: the day
 * § 19's eyebrow letter-spacing moves, six files have to move with it and one will not. So the
 * shapes that appear on *every* daily screen — the eyebrow, the card, the figure cell, the quiet
 * note — are here, and each screen keeps only the layout that is its own.
 *
 * The two shipped screens are deliberately **not** migrated onto this in the same commit. They
 * work, their literals are cited against the prototype region each of them transcribes, and a
 * refactor that touched them would put four screens' worth of new code and two screens' worth of
 * churn in one review. The lane that next edits either of them can move it across.
 *
 * ## Inline styles, and why there is no stylesheet
 *
 * The handoff's own rule (§ 19): *"Inline styles throughout, no stylesheet."* Everything here
 * returns a `cssText` string or writes one, so a reader of a screen file sees the values beside
 * the element rather than in a class name they have to go and look up.
 *
 * Nothing in this module reads a global. Every function takes the `Document` it draws into, which
 * is what lets a screen be mounted into a detached document by a test as easily as into the page.
 */

import {
  EVERYDAY_COLORS as C,
  EVERYDAY_RADII as R,
  EVERYDAY_TYPE as TYPE,
} from './tokens.js';

/** Create an element, optionally classed and filled. The one constructor every screen uses. */
export function el<K extends keyof HTMLElementTagNameMap>(
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

/** § 19's eyebrow: 10–10.5 px mono, `.12–.16em` tracking, upper case, in the label grey. */
export const EYEBROW = `font:500 10.5px ${TYPE.mono};letter-spacing:.14em;color:${C.label};text-transform:uppercase`;

/** § 19's mono figure, at a size and colour the caller picks. */
export const MONO = (size: number, color: string): string =>
  `font:500 ${String(size)}px ${TYPE.mono};color:${color}`;

/** A card: § 19's 14 px radius, the card ground, the rule border. */
export const CARD = [
  `border:1px solid ${C.rule}`,
  `border-radius:${String(R.card)}px`,
  `background:${C.card}`,
  'padding:18px 20px',
].join(';');

/** A sunk well inside a card — the § 19 `Card sunk` ground at the smaller radius. */
export const WELL = [
  `border:1px solid ${C.ruleLight}`,
  `border-radius:${String(R.well)}px`,
  `background:${C.cardSunk}`,
  'padding:13px 16px',
].join(';');

/** Body copy at § 19's 13–14.5 px / 1.5, in the soft ink. */
export const BODY = `font-size:13.5px;line-height:1.5;color:${C.inkSoft}`;

/** A quiet caption — the warm grey, one step down. */
export const QUIET = `font-size:12.5px;line-height:1.45;color:${C.warmGrey}`;

/** § 19's lede: 16.5–19 px / 1.55, `text-wrap: pretty`. */
export const LEDE = `font-size:16.5px;line-height:1.55;color:${C.inkSoft};max-width:64ch;text-wrap:pretty`;

/** A pill — § 19's 20 px radius, mono, at the caller's two colours. */
export function pill(doc: Document, text: string, ink: string, ground: string): HTMLElement {
  const node = el(doc, 'span', undefined, text);
  node.style.cssText = [
    `border-radius:${String(R.pill)}px`,
    'padding:4px 11px',
    `background:${ground}`,
    `color:${ink}`,
    `font:500 10.5px ${TYPE.mono}`,
    'letter-spacing:.1em',
    'white-space:nowrap',
  ].join(';');
  return node;
}

/**
 * A section: an eyebrow heading and the region under it, returned together.
 *
 * The heading is created **with** its region rather than beside it, because `dev/reportPanel.ts`'s
 * `cardOf` records what the other arrangement costs — a caption left standing over a box that was
 * emptied, which is `index.html`'s issue #56 one element down. A caller that hides the region
 * hides the pair.
 */
export function section(
  doc: Document,
  heading: string,
): { readonly root: HTMLElement; readonly body: HTMLElement } {
  const root = el(doc, 'section');
  root.style.cssText = 'margin-top:26px';
  const title = el(doc, 'h2', undefined, heading);
  title.style.cssText = `${EYEBROW};font-size:11px;margin:0 0 10px`;
  const body = el(doc, 'div');
  root.append(title, body);
  return { root, body };
}

/**
 * A figure cell: the value in mono, the label as an eyebrow, and the note under both.
 *
 * `note` is not optional, for `dev/reportPanel.ts#FigureView`'s reason: it carries the
 * denominator, the window or the refusal's ground, and it is the non-colour half of every signal
 * on a grid (KB-15). `colour` is `undefined` for *do not rank this*, which is the energy pair's
 * `axisOnly` arriving here rather than being decided here.
 */
export function figureCell(
  doc: Document,
  cell: {
    readonly label: string;
    readonly value: string;
    readonly note: string;
    readonly colour?: string | undefined;
  },
): HTMLElement {
  const root = el(doc, 'div', 'everyday-figure');
  root.style.cssText = `${WELL};min-width:0`;
  const value = el(doc, 'div', 'everyday-figure-value', cell.value);
  value.style.cssText = MONO(22, cell.colour ?? C.ink);
  const label = el(doc, 'div', 'everyday-figure-label', cell.label);
  label.style.cssText = `${EYEBROW};margin-top:6px`;
  const note = el(doc, 'div', 'everyday-figure-note', cell.note);
  note.style.cssText = `${QUIET};margin-top:5px`;
  root.append(value, label, note);
  return root;
}

/**
 * A band that says what it does not have — `everyday/world.ts`'s labelled unavailable state.
 *
 * One drawing, two screens (§ 6.1's world result and § 14's split), so the two cannot degrade
 * differently. It is a **drawn** register rather than an omission: § 16 rule 15 is explicit that
 * a world figure degrades to a labelled state and never to a zero, a spinner, or an empty chart
 * that reads as *nobody played*.
 */
export function unavailableBand(
  doc: Document,
  band: { readonly label: string; readonly reason: string; readonly absent: readonly string[] },
): HTMLElement {
  const root = el(doc, 'div', 'everyday-world-absent');
  root.style.cssText = [
    `border:1px dashed ${C.amberEdge}`,
    `border-radius:${String(R.card)}px`,
    `background:${C.amberWash}`,
    'padding:16px 18px',
  ].join(';');
  const label = el(doc, 'div', 'everyday-world-label', band.label);
  label.style.cssText = `${EYEBROW};color:${C.terracotta}`;
  const reason = el(doc, 'p', undefined, band.reason);
  reason.style.cssText = `${QUIET};margin:8px 0 0;max-width:70ch`;
  const list = el(doc, 'ul');
  list.style.cssText = `margin:10px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:4px;${QUIET}`;
  for (const entry of band.absent) list.append(el(doc, 'li', undefined, entry));
  root.append(label, reason, list);
  return root;
}
