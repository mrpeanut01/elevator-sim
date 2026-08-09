/**
 * A page whose elements remember what a **mount** did to them — the document-recorder tier, pointed
 * at construction rather than at a render.
 *
 * ## Why this exists next to `menuPanel.test.ts`'s recorder rather than reusing it
 *
 * That one answers *does the panel decide correctly given where focus is* — it grew `contains`,
 * `focus` and an `activeElement` for the modal trap, and it hands back one root the panel renders
 * into. This one answers a different question, and the difference decides the shape: **did the mount
 * put its node on the page, and next to which element.** So it hands back the whole
 * `dev/elementMap.ts` manifest resolved against minted nodes, each with a parent of its own, and it
 * has no focus, no keyboard and no root.
 *
 * They are two instruments rather than one grown to cover both because a recorder that answered both
 * would need a real tree — ids nested under the parents `index.html` actually nests them under — and
 * that is jsdom, which `docs/05` rules out and neither of these smuggles in.
 *
 * ## What it can prove, and the one thing it cannot
 *
 * The five panel mounts write their static nodes during **construction**: `mountRightRail`'s four
 * `Open … editor →` handlers, `mountDispatcherEditor`'s *Run this dispatcher*, and — GitHub issue
 * #104 — the scope notes. None of that needs a `render`, which is what makes driving all five cheap
 * enough to be worth doing at all: `render` is where the sliders, the plates and the pick lists are,
 * and reaching those would need most of a browser.
 *
 * So this proves a node with that text is in the document, in that position, put there by the
 * shipped mount. It proves **nothing about appearance** — `index.html`'s stylesheet is not consulted
 * here, and `menuPanel.test.ts`'s own statement of that limit applies word for word.
 *
 * ## Ids resolve rather than nest, and the cost is stated
 *
 * `resolveElements` asks a document for ids and never for structure, so a source that mints one node
 * per id satisfies it exactly. Each minted node gets a fresh parent, so a mount calling
 * `x.parentElement?.insertBefore(node, x)` lands somewhere a test can read — and *only* the siblings
 * that mount inserted are there. That is the limit: this cannot tell whether the note ended up above
 * the right block on the real page, only that it was inserted before the element the mount named.
 */

import { ELEMENT_IDS, resolveElements, type Elements } from './elementMap.js';

/** One element as a mount built or found it. Enough to assert against; nothing a browser would add. */
export interface Recorded {
  readonly tag: string;
  /** The id it was minted for, or `''` for a node a mount created itself. */
  readonly id: string;
  className: string;
  textContent: string;
  value: string;
  checked: boolean;
  hidden: boolean;
  title: string;
  readonly attrs: Map<string, string>;
  readonly props: Map<string, string>;
  readonly children: Recorded[];
  readonly childNodes: Recorded[];
  readonly listeners: Map<string, (event?: unknown) => void>;
  parentElement: Recorded | null;
}

export interface MountRecorder {
  /** The manifest, resolved against minted nodes — what `dev/main.ts` hands each mount. */
  readonly elements: Elements;
  /** Every node in the page, minted or created, in creation order. */
  readonly nodes: () => readonly Recorded[];
  /** The siblings a mount inserted around the element it named. */
  readonly around: (node: unknown) => readonly Recorded[];
}

/**
 * Build the page.
 *
 * Every member below is one the five mounts actually call during construction. The set is small on
 * purpose and is grown only by a mount starting to call something, which is the rule
 * `menuPanel.test.ts`'s recorder has always been grown by: a member nobody uses would be a second,
 * unasserted implementation of the DOM sitting in a test directory.
 */
export function mountRecorder(): MountRecorder {
  const nodes: Recorded[] = [];
  let doc: Document;

  const make = (tag: string, id: string): Recorded => {
    const children: Recorded[] = [];
    const node: Recorded = {
      tag,
      id,
      className: '',
      textContent: '',
      value: '',
      checked: false,
      hidden: false,
      title: '',
      attrs: new Map(),
      props: new Map(),
      children,
      childNodes: children,
      listeners: new Map(),
      parentElement: null,
    };
    const built = Object.assign(node, {
      ownerDocument: (): Document => doc,
      setAttribute(key: string, value: string) {
        node.attrs.set(key, value);
      },
      getAttribute(key: string) {
        return node.attrs.get(key) ?? null;
      },
      removeAttribute(key: string) {
        node.attrs.delete(key);
      },
      append(...kids: Recorded[]) {
        for (const kid of kids) {
          kid.parentElement = node;
          node.children.push(kid);
        }
      },
      replaceChildren(...kids: Recorded[]) {
        node.children.length = 0;
        for (const kid of kids) {
          kid.parentElement = node;
          node.children.push(kid);
        }
      },
      removeChild(kid: Recorded) {
        const at = node.children.indexOf(kid);
        if (at >= 0) node.children.splice(at, 1);
        return kid;
      },
      insertBefore(kid: Recorded, before: Recorded | null) {
        const already = node.children.indexOf(kid);
        if (already >= 0) node.children.splice(already, 1);
        kid.parentElement = node;
        const at = before === null ? -1 : node.children.indexOf(before);
        if (at < 0) node.children.push(kid);
        else node.children.splice(at, 0, kid);
        return kid;
      },
      addEventListener(type: string, handler: (event?: unknown) => void) {
        node.listeners.set(type, handler);
      },
      querySelector: () => null,
      focus() {
        /* nothing here reads focus; recorded as a no-op rather than omitted */
      },
      style: {
        setProperty(key: string, value: string) {
          node.props.set(key, value);
        },
        getPropertyValue: (key: string) => node.props.get(key) ?? '',
      },
    });
    /*
     * `ownerDocument` is a getter on a real element and a mount reads it as a property. Defined
     * rather than assigned because `doc` is not built yet when the first node is minted.
     */
    Object.defineProperty(built, 'ownerDocument', { get: () => doc });
    nodes.push(node);
    return node;
  };

  /*
   * A parent per minted id, so `parentElement` is never `null` on a manifest element. Every mount's
   * insert is `x.parentElement?.insertBefore(…)`, and an optional chain over `null` would make a
   * missing note indistinguishable from a note the recorder could not hold.
   */
  const minted = new Map<string, Recorded>();
  const mint = (id: string): Recorded => {
    const held = minted.get(id);
    if (held !== undefined) return held;
    const parent = make('div', '');
    const node = make('div', id);
    node.parentElement = parent;
    parent.children.push(node);
    minted.set(id, node);
    return node;
  };

  doc = {
    createElement: (tag: string) => make(tag, ''),
    getElementById: (id: string) => mint(id),
  } as unknown as Document;

  const resolved = resolveElements<Elements>(
    { getElementById: (id) => mint(id) as unknown as Element },
    ELEMENT_IDS,
  );
  if (!resolved.ok) throw new Error(`the manifest did not resolve: ${resolved.missing.join(', ')}`);

  return {
    elements: resolved.elements,
    nodes: () => nodes,
    around: (node: unknown) => (node as Recorded).parentElement?.children ?? [],
  };
}

/** All the text on a node, whatever a mount wrote it through. */
export const textOf = (node: Recorded): string => node.textContent;
