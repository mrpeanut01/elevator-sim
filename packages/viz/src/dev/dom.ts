/**
 * The shared DOM vocabulary — the helpers that stop eleven mounts writing `createElement` eleven
 * different ways.
 *
 * ## Why this exists now and did not before
 *
 * The shipped viewer had **no** shared DOM helper module. It did not need one: `dev/editor.ts` had
 * a local `button()` and `labelled()`, `dev/batchPanel.ts` and `dev/campaignPanel.ts` each had
 * their own identical `row()`, and everything else was `document.createElement` inline. Two copies
 * of a four-line helper is cheaper than a module.
 *
 * The design handoff changes the arithmetic. `docs/12-design-handoff.md` § 1 is fifty-odd distinct
 * components across a header, two rails, seven surfaces and a footer, and they share a small
 * vocabulary — an eyebrow, a card, a chip, a slider, a plate row, a figure. Fifty copies of a
 * four-line helper is not cheaper than a module; it is the way a design system stops being one.
 *
 * ## The rules every helper here keeps
 *
 * - **`textContent`, never `innerHTML`.** There is not one `innerHTML` in `packages/viz` and this
 *   module does not start. Every string that reaches the page here comes from a recording, a
 *   building the reader loaded, or a name they typed, and exactly one of those three is under
 *   their control — which is the one that makes the rule load-bearing rather than stylistic.
 * - **A class, never a style, for anything a stylesheet can express.** The handoff is written in
 *   inline styles because a mockup has no stylesheet; the implementation is not, because a rule
 *   keyed on a class can be changed once. Inline styles survive here only where the value is
 *   *computed per instance* — a bar's width, a band's colour — and those are the only ones.
 * - **No helper keys on an id.** Not a figure id, not a term id, not a goal kind. `index.html`'s
 *   own comment says why: there is no list of metric names anywhere in this product's UI and a
 *   helper that started one would be the first.
 *
 * ## Why it is not tested directly
 *
 * It is DOM glue, and this repository has no jsdom (`vitest.config.ts` sets `environment: 'node'`
 * for every project). The pattern that makes UI decisions testable here is the one
 * `controls/render.ts` established: the *decision* is a pure function returning a descriptor, and
 * the DOM is the dumb instantiator. Every helper below is deliberately decision-free — it puts a
 * string somewhere and returns the node — so that there is nothing in it a test would want to
 * assert. Anything in a mount that *chooses* what to say belongs in a pure module, and every one of
 * this refactor's mounts has one.
 */

/** Every element this module makes, keyed so `el('button')` returns a `HTMLButtonElement`. */
type TagMap = HTMLElementTagNameMap;

export interface ElementSpec {
  readonly className?: string | undefined;
  readonly text?: string | undefined;
  /** A `title` attribute. The tooltip *is* the explanation; the dotted underline is the affordance. */
  readonly title?: string | undefined;
  /** Inline styles, for values computed per instance only. See the module docstring. */
  readonly style?: Readonly<Record<string, string>> | undefined;
  readonly attrs?: Readonly<Record<string, string>> | undefined;
  readonly children?: readonly (Node | null | undefined)[] | undefined;
}

/** Make an element. The one place `document.createElement` is called in a mount. */
export function el<K extends keyof TagMap>(
  doc: Document,
  tag: K,
  spec: ElementSpec = {},
): TagMap[K] {
  const node = doc.createElement(tag);
  if (spec.className !== undefined) node.className = spec.className;
  if (spec.text !== undefined) node.textContent = spec.text;
  if (spec.title !== undefined) node.title = spec.title;
  if (spec.style !== undefined) {
    for (const [key, value] of Object.entries(spec.style)) node.style.setProperty(key, value);
  }
  if (spec.attrs !== undefined) {
    for (const [key, value] of Object.entries(spec.attrs)) node.setAttribute(key, value);
  }
  if (spec.children !== undefined) {
    for (const child of spec.children) if (child != null) node.append(child);
  }
  return node;
}

/** Replace a container's children in one go, so a redraw never shows a half-built panel. */
export function fill(host: Element, ...children: readonly (Node | null | undefined)[]): void {
  host.replaceChildren(...children.filter((child): child is Node => child != null));
}

/**
 * The same thing as {@link fill}, except that a child which is **already in the right place is not
 * touched** — GitHub issue #106.
 *
 * ## Why the difference is a correctness one and not a saving
 *
 * A browser decides whether to fire `click` by remembering the element the pointer went **down**
 * on, and it throws that memory away the moment the element is removed from the document — Blink
 * does it in `MouseEventManager::NodeWillBeRemoved`, and the comment there says why: *"we don't
 * dispatch click events if the mousedown node is removed before a mouseup event."* Re-inserting the
 * same node does not bring the memory back.
 *
 * `replaceChildren` removes every child and re-inserts them, so it destroys that memory even when
 * the list it is handed is identical to the one already there. That is issue #106: `mousedown` on
 * the account screen's submit blurs the email field, the blur fires `change`, the shell redraws,
 * and by `mouseup` the button the reader pressed is a node the browser has stopped tracking. No
 * request, no error, no notice — and the second press works, because by then nothing has changed
 * and nothing redraws.
 *
 * So this is the write a panel uses when something in the container can be **pressed**, and `fill`
 * stays for containers of plain text. Neither is faster than the other in any way worth measuring;
 * the difference is whether a pointer press survives the redraw it causes.
 *
 * Node identity is the caller's problem: reconciling against freshly built children removes and
 * inserts exactly as `fill` would. See `dev/menuPanel.ts#retainer` for the half that keeps the
 * nodes.
 */
export function reconcile(host: Element, ...children: readonly (Node | null | undefined)[]): void {
  const wanted = children.filter((child): child is Node => child != null);
  // Dropped first, so the second pass indexes into a list that holds nothing but survivors — and
  // `Array.from` because `childNodes` is live and is about to be mutated under the loop.
  for (const existing of Array.from(host.childNodes)) {
    if (!wanted.includes(existing)) host.removeChild(existing);
  }
  for (const [index, node] of wanted.entries()) {
    if (host.childNodes[index] === node) continue;
    host.insertBefore(node, host.childNodes[index] ?? null);
  }
}

/**
 * The listener registry for elements that outlive a draw.
 *
 * Keyed on the node, so an element that is dropped takes its handlers with it.
 */
const HANDLERS = new WeakMap<Element, Map<string, (event: Event) => void>>();

/**
 * Attach a listener **once per node and type**, and let later draws replace what it does.
 *
 * A retained element is handed a new closure on every draw — a new `row.intent`, a new form patch —
 * and calling `addEventListener` again would add a second listener rather than replace the first,
 * so by the tenth redraw one click would dispatch ten intents. Removing the old one first would
 * work and would need every caller to keep the exact function reference it passed, which is the
 * kind of bookkeeping that is right nine times and wrong once.
 *
 * So the node gets one listener, ever, and it reads the current handler out of this map. It is the
 * same shape `dev/menuPanel.ts` already uses for the overlay's own keydown and for the same reason:
 * a closure captured at wiring time pins the first draw's world forever.
 */
export function on(node: Element, type: string, handler: (event: Event) => void): void {
  let handlers = HANDLERS.get(node);
  if (handlers === undefined) {
    handlers = new Map();
    HANDLERS.set(node, handlers);
  }
  const wired = handlers.has(type);
  handlers.set(type, handler);
  if (wired) return;
  node.addEventListener(type, (event: Event) => {
    HANDLERS.get(node)?.get(type)?.(event);
  });
}

/** Set text only when it changed, so a 60 Hz redraw does not churn the accessibility tree. */
export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Set an inline custom property or style, only when it changed. */
export function setStyle(node: HTMLElement, property: string, value: string): void {
  if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
}

/** Show or hide by the `hidden` attribute, which is what the stylesheet keys on. */
export function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden;
}

/* -------------------------------------------------------------------------- *
 * The handoff's components
 * -------------------------------------------------------------------------- */

export interface ChipSpec {
  readonly label: string;
  readonly selected: boolean;
  readonly title?: string | undefined;
  readonly onPick: () => void;
}

/**
 * A selectable pill.
 *
 * `aria-pressed` rather than a class, because the selected state is a fact a screen reader needs
 * and a class is not one. The stylesheet keys on the attribute for the same reason KB-15 exists:
 * one source for the state, and the colour is the second signal rather than the only one.
 */
export function chip(doc: Document, spec: ChipSpec): HTMLButtonElement {
  const node = el(doc, 'button', {
    className: 'chip',
    text: spec.label,
    title: spec.title,
    attrs: { type: 'button', 'aria-pressed': spec.selected ? 'true' : 'false' },
  });
  node.addEventListener('click', spec.onPick);
  return node;
}

export function chipRow(doc: Document, chips: readonly ChipSpec[]): HTMLElement {
  return el(doc, 'span', {
    className: 'chip-row',
    children: chips.map((spec) => chip(doc, spec)),
  });
}

export interface PickSpec {
  readonly title: string;
  readonly sub: string;
  readonly tag?: string | undefined;
  readonly tagClass?: string | undefined;
  readonly selected: boolean;
  readonly help?: string | undefined;
  readonly onPick: () => void;
}

/** A selectable card in a rail list — `docs/12` § 1.4 R2. */
export function pick(doc: Document, spec: PickSpec): HTMLButtonElement {
  const head = el(doc, 'div', {
    style: { display: 'flex', 'justify-content': 'space-between', 'align-items': 'baseline', gap: '8px' },
    children: [
      el(doc, 'span', { className: 'pick-title', text: spec.title }),
      spec.tag === undefined
        ? null
        : el(doc, 'span', {
            className: 'eyebrow-note',
            text: spec.tag,
            style: spec.tagClass === undefined ? {} : { color: spec.tagClass },
          }),
    ],
  });
  const node = el(doc, 'button', {
    className: 'pick',
    title: spec.help,
    attrs: { type: 'button', 'aria-pressed': spec.selected ? 'true' : 'false' },
    children: [head, el(doc, 'div', { className: 'pick-sub', text: spec.sub })],
  });
  node.addEventListener('click', spec.onPick);
  return node;
}

/** One row of a monospace schedule plate — `docs/12` § 1.4 R3. */
export function plateRow(doc: Document, key: string, value: string, help?: string): HTMLElement {
  return el(doc, 'div', {
    className: 'plate-row',
    title: help,
    children: [
      el(doc, 'span', { className: 'plate-key', text: key }),
      el(doc, 'span', { className: 'plate-value', text: value }),
    ],
  });
}

export interface PlateEntry {
  readonly k: string;
  readonly v: string;
  readonly help?: string | undefined;
}

export function fillPlate(host: Element, rows: readonly PlateEntry[]): void {
  const doc = host.ownerDocument;
  fill(host, ...rows.map((row) => plateRow(doc, row.k, row.v, row.help)));
}

export interface SliderSpec {
  readonly label: string;
  readonly value: string;
  readonly raw: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The group heading that precedes this row, when it starts a new group. */
  readonly heading?: string | undefined;
  /** A line under the slider — the handoff's *serves AWT* / over-capacity note. */
  readonly sub?: string | undefined;
  readonly subClass?: string | undefined;
  readonly help: string;
  readonly labelColor?: string | undefined;
  readonly accent?: string | undefined;
  readonly onInput: (value: number) => void;
}

/**
 * A labelled range with its value, its tooltip and its sub-line — the handoff's slider row, used
 * by all four editors.
 *
 * `input` and not `change`, so the number beside the thumb tracks the drag. The handler is
 * debounced by nothing: writing a number into a state object is cheap, and re-running the
 * simulation is not something a slider does.
 */
export function slider(doc: Document, spec: SliderSpec): HTMLElement {
  const input = el(doc, 'input', {
    attrs: {
      type: 'range',
      min: String(spec.min),
      max: String(spec.max),
      step: String(spec.step),
      value: String(spec.raw),
      'aria-label': spec.label,
    },
    style: spec.accent === undefined ? {} : { 'accent-color': spec.accent },
  });
  input.addEventListener('input', () => {
    spec.onInput(Number(input.value));
  });
  return el(doc, 'div', {
    className: 'slider',
    children: [
      spec.heading === undefined || spec.heading === ''
        ? null
        : el(doc, 'div', { className: 'slider-group', text: spec.heading }),
      el(doc, 'div', {
        className: 'slider-head',
        children: [
          el(doc, 'span', {
            className: 'helpful',
            text: spec.label,
            title: spec.help,
            style: spec.labelColor === undefined ? {} : { color: spec.labelColor },
          }),
          el(doc, 'span', { className: 'slider-value', text: spec.value }),
        ],
      }),
      input,
      spec.sub === undefined || spec.sub === ''
        ? null
        : el(doc, 'div', {
            className: 'slider-sub',
            text: spec.sub,
            style: spec.subClass === undefined ? {} : { color: spec.subClass },
          }),
    ],
  });
}

export interface ToggleSpec {
  readonly label: string;
  readonly hint: string;
  readonly on: boolean;
  readonly help?: string | undefined;
  readonly onToggle: () => void;
}

/**
 * A labelled on/off row.
 *
 * The state is spelled `on`/`off` **as text** beside the label, not only as a colour — KB-15, and
 * the reason is not abstract: the two states differ by a green that reads as grey in the
 * `prefers-contrast` and monochrome cases this project's own accessibility ledger covers.
 */
export function toggle(doc: Document, spec: ToggleSpec): HTMLButtonElement {
  const node = el(doc, 'button', {
    className: 'toggle',
    title: spec.help,
    attrs: { type: 'button', 'aria-pressed': spec.on ? 'true' : 'false' },
    children: [
      el(doc, 'div', {
        className: 'toggle-line',
        children: [
          el(doc, 'span', { className: 'toggle-label', text: spec.label }),
          el(doc, 'span', {
            className: 'toggle-state',
            text: spec.on ? 'on' : 'off',
            style: { color: spec.on ? 'var(--ok)' : 'var(--dimmer)' },
          }),
        ],
      }),
      el(doc, 'div', { className: 'toggle-hint', text: spec.hint }),
    ],
  });
  node.addEventListener('click', spec.onToggle);
  return node;
}

export interface FigureSpec {
  readonly label: string;
  readonly value: string;
  readonly note?: string | undefined;
  /** Extra classes from a pure module — `mode/disclosure.ts`'s `rowClassesOf`, never a figure id. */
  readonly classes?: readonly string[] | undefined;
  readonly valueColor?: string | undefined;
}

/** One figure. The vocabulary the report grid, the batch report and the campaign result share. */
export function figure(doc: Document, spec: FigureSpec): HTMLElement {
  const classes = ['figure', ...(spec.classes ?? [])].join(' ');
  return el(doc, 'div', {
    className: classes,
    children: [
      el(doc, 'div', { className: 'figure-label', text: spec.label }),
      el(doc, 'div', {
        className: 'figure-value',
        text: spec.value,
        style: spec.valueColor === undefined ? {} : { color: spec.valueColor },
      }),
      spec.note === undefined || spec.note === ''
        ? null
        : el(doc, 'p', { className: 'figure-note', text: spec.note }),
    ],
  });
}

/**
 * Drag a horizontal value out of an element, `0..1` of its width.
 *
 * Pointer events rather than mouse events, so a touch drag on the elevation's occupancy bar works
 * the same way; `touch-action: none` on the target is what stops the page scrolling under it, and
 * the stylesheet sets it rather than this function, so a caller cannot forget.
 *
 * Returns the teardown, because a mount that redraws its rows on every state change would
 * otherwise leak one `pointermove` listener per row per redraw.
 */
export function onHorizontalDrag(
  target: HTMLElement,
  onValue: (fraction: number) => void,
): () => void {
  const handle = (event: PointerEvent): void => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return;
    onValue(clamp01((event.clientX - rect.left) / rect.width));
  };
  const down = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    handle(event);
    const move = (moved: PointerEvent): void => {
      handle(moved);
    };
    const up = (): void => {
      target.ownerDocument.defaultView?.removeEventListener('pointermove', move);
      target.ownerDocument.defaultView?.removeEventListener('pointerup', up);
    };
    target.ownerDocument.defaultView?.addEventListener('pointermove', move);
    target.ownerDocument.defaultView?.addEventListener('pointerup', up);
  };
  target.addEventListener('pointerdown', down);
  return () => {
    target.removeEventListener('pointerdown', down);
  };
}

/** The vertical twin, for the elevation's shaft-band grips. Returns `0..1` from the top. */
export function onVerticalDrag(
  target: HTMLElement,
  within: HTMLElement,
  onValue: (fraction: number) => void,
): () => void {
  const handle = (event: PointerEvent): void => {
    const rect = within.getBoundingClientRect();
    if (rect.height <= 0) return;
    onValue(clamp01((event.clientY - rect.top + within.scrollTop) / rect.height));
  };
  const down = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    handle(event);
    const move = (moved: PointerEvent): void => {
      handle(moved);
    };
    const up = (): void => {
      within.ownerDocument.defaultView?.removeEventListener('pointermove', move);
      within.ownerDocument.defaultView?.removeEventListener('pointerup', up);
    };
    within.ownerDocument.defaultView?.addEventListener('pointermove', move);
    within.ownerDocument.defaultView?.addEventListener('pointerup', up);
  };
  target.addEventListener('pointerdown', down);
  return () => {
    target.removeEventListener('pointerdown', down);
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * A `fill` that only fills when the content it would produce has changed.
 *
 * **A correctness measure, not an optimisation**, and it is worth being precise about why. The
 * shell renders the left rail sixty times a second (`main.ts`'s `renderLive`), and an unkeyed
 * `fill` replaces every child on every frame. Three things break, none of them cosmetic:
 *
 * 1. **The decision log's `riseIn` animation restarts on every frame**, so *"a row just appeared"*
 *    — the one signal that panel exists to give — becomes a permanent shimmer that means nothing.
 * 2. **Focus is dropped.** A reader tabbing through a list of dispatchers loses their place 60
 *    times a second, which makes the rail unusable by keyboard.
 * 3. **Hover is dropped**, so a `title` tooltip can never appear: it is cancelled before the
 *    browser's delay elapses.
 *
 * The key is a string the caller derives from what it is about to draw. Deriving it is the
 * caller's job because only the caller knows which of its inputs are visible — a key over the whole
 * state would change every frame and defeat the point.
 */
export function keyedFill(host: Element): (key: string, build: () => readonly Node[]) => void {
  let last: string | undefined;
  return (key, build) => {
    if (key === last) return;
    last = key;
    fill(host, ...build());
  };
}

/** Fill a `<select>` from options, preserving the current value when it is still offered. */
export function fillSelect(
  select: HTMLSelectElement,
  options: readonly { readonly value: string; readonly label: string }[],
  selected: string,
): void {
  const wanted = options.some((option) => option.value === selected) ? selected : options[0]?.value;
  select.replaceChildren(
    ...options.map((option) => new Option(option.label, option.value, false, option.value === wanted)),
  );
  if (wanted !== undefined) select.value = wanted;
}
