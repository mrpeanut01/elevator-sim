/**
 * `reconcile`'s ordering rule, driven against a host that blurs — GitHub issue #259.
 *
 * ## Why this file exists when the module's own docstring says it should not
 *
 * `dev/dom.ts` argues, at length and correctly, that a DOM helper here is *decision-free*: it puts
 * a string somewhere and returns the node, and anything that **chooses** belongs in a pure module
 * where a test can reach it without a browser. Issue #259 gave {@link reconcile} a choice —
 * a host is written by one call at a time, and a nested call's children supersede rather than
 * interleave — and a choice is the thing that paragraph says a helper should not be making
 * unasserted. So this is the exception the module names, rather than a widening of the rule.
 *
 * ## What the fake has to model, and why the recorder next door could not
 *
 * Exactly one browser behaviour: **removing the node that holds focus fires its blur handler
 * synchronously, from inside `removeChild`.** That is the whole mechanism. The outer removal loop
 * is walking an `Array.from` snapshot, the blur handler redraws the same host, and the outer loop
 * then asks the host to remove a node the nested draw already detached.
 *
 * `menuPanel.test.ts`'s recorder cannot see any of this, and the reason is worth stating because it
 * is the same reason the browser tier could not see it either. Its `removeChild` reads
 * `if (at >= 0) node.children.splice(at, 1)` — it *silently ignores* a node that is not a child. It
 * has the cheap fix baked in, permanently and invisibly, so under that recorder the defect does not
 * exist and never could. The fake below therefore throws exactly where a browser throws, with the
 * browser's own message, and {@link NOT_FOUND} is that string rather than a paraphrase of it.
 *
 * ## What this cannot prove
 *
 * That a browser fires blur where this fake fires it. `focus` here moves a variable and `removeChild`
 * calls a function; a real Blink dispatches `focusout`, `blur` and `change` through a capture and a
 * bubble phase, and whether it does so synchronously is a fact about Blink rather than about this
 * file. That claim is `menu.browser.test.ts`'s, against a real Chromium, and the two are deliberately
 * not merged: this tier pins the **ordering** the fix chose, and that one pins that the shipped page
 * stops throwing.
 */

import { describe, expect, it } from 'vitest';

import { reconcile } from './dom.js';

/**
 * What Chromium says, verbatim.
 *
 * Copied from a real run rather than written from memory — driving *Enter in the Free play seed
 * field* against the shipped page on 2026-08-24 raised it with the trailing hint attached, and the
 * hint is the browser's own guess at the cause. It happens to be right, which is a nice thing for a
 * canned string and not a reason to trust one.
 */
const NOT_FOUND =
  "Failed to execute 'removeChild' on 'Node': The node to be removed is no longer a child of " +
  "this node. Perhaps it was moved in a 'blur' event handler?";

/** One node in the fake page. Nothing here a browser would not have. */
interface Fake {
  readonly name: string;
  parent: Fake | null;
  readonly childNodes: Fake[];
  /**
   * What the browser runs when this node is removed while it holds focus.
   *
   * One handler rather than a listener map, because the whole of the mechanism is *a blur redraws
   * something*, and a map would be a second, unasserted event system living in a test directory —
   * `mountRecorder.test-helper.ts`'s rule, which this file is a much smaller instance of.
   */
  onBlur: (() => void) | undefined;
  removeChild(kid: Fake): Fake;
  insertBefore(kid: Fake, before: Fake | null): Fake;
}

interface Page {
  /** Mint a node, optionally with children already under it. */
  readonly node: (name: string, ...kids: Fake[]) => Fake;
  /** Put focus somewhere, as a click or a Tab would. */
  readonly focus: (node: Fake) => void;
  /** The names a host is holding, in order — what every assertion below reads. */
  readonly names: (host: Fake) => readonly string[];
}

function page(): Page {
  let active: Fake | null = null;

  const holds = (root: Fake, node: Fake): boolean =>
    root === node || root.childNodes.some((kid) => holds(kid, node));

  const node = (name: string, ...kids: Fake[]): Fake => {
    const childNodes: Fake[] = [];
    const self: Fake = {
      name,
      parent: null,
      childNodes,
      onBlur: undefined,
      removeChild(kid) {
        const at = childNodes.indexOf(kid);
        // Strict, and this is the line the whole file turns on. See the header.
        if (at < 0) throw new Error(NOT_FOUND);
        childNodes.splice(at, 1);
        kid.parent = null;
        /*
         * The blur, fired from inside the removal — synchronously, before `removeChild` returns,
         * which is what leaves the caller's snapshot stale halfway through its own loop. Focus is
         * cleared **before** the handler runs, so a handler that removes more nodes cannot blur a
         * second time; that is Blink's order and it is also what bounds the coalescing.
         */
        if (active !== null && holds(kid, active)) {
          const blurred = active;
          active = null;
          blurred.onBlur?.();
        }
        return kid;
      },
      insertBefore(kid, before) {
        const already = childNodes.indexOf(kid);
        if (already >= 0) childNodes.splice(already, 1);
        const at = before === null ? -1 : childNodes.indexOf(before);
        if (at < 0) childNodes.push(kid);
        else childNodes.splice(at, 0, kid);
        kid.parent = self;
        return kid;
      },
    };
    for (const kid of kids) self.insertBefore(kid, null);
    return self;
  };

  return {
    node,
    focus: (target) => {
      active = target;
    },
    names: (host) => host.childNodes.map((kid) => kid.name),
  };
}

/** `reconcile` over the fake. The cast is the whole of the adaptation. */
function draw(host: Fake, ...kids: Fake[]): void {
  reconcile(host as unknown as Element, ...(kids as unknown as Node[]));
}

describe('reconcile survives a removal that redraws its own host', () => {
  it('does not throw when the blur its removal fires redraws the same host', () => {
    /*
     * The shipped path, reduced to its skeleton. `.menu-list` holds four rows; the first holds the
     * focused seed field; the draw wants only two of the four. Removing row A blurs the field,
     * the commit closes the menu, and the close redraws `.menu-list` — from inside the outer
     * removal loop, which has three more entries to walk.
     *
     * **Watched failing before the fix.** Against `reconcile` as issue #259 found it this reports
     * `Failed to execute 'removeChild' on 'Node': The node to be removed is no longer a child of
     * this node.` — thrown on `rowD`, which the nested draw had already detached.
     */
    const p = page();
    const field = p.node('seed-field');
    const rowA = p.node('row-a', field);
    const rowB = p.node('row-b');
    const rowC = p.node('row-c');
    const rowD = p.node('row-d');
    const closed = p.node('row-closed');
    const list = p.node('menu-list', rowA, rowB, rowC, rowD);

    let blurs = 0;
    field.onBlur = () => {
      blurs += 1;
      // What `closeMenu → drawMenu → renderMenu` does: reconcile the same host, from in here.
      draw(list, closed);
    };
    p.focus(field);

    expect(() => {
      draw(list, rowB, rowC);
    }, 'removing the focused row re-entered reconcile and the outer loop then removed a node the nested draw had already detached').not.toThrow();

    /*
     * The path was actually driven. Without this the case would pass just as well against a
     * `reconcile` that never removed anything, which is the shape of a test that goes green for the
     * wrong reason and stays there.
     */
    expect(blurs, 'the removal never fired the blur, so nothing re-entered and this proves nothing').toBe(1);
  });

  it('the outer call does not overwrite the nested draw', () => {
    /*
     * The half that decides which of the two fixes is right, and the reason the cheap one is not.
     *
     * Testing parentage before removing — `existing.parentNode === host` — also stops the throw
     * above. What it does not stop is the outer loop carrying on and its insert pass re-imposing the
     * children the outer draw computed **before** the nested one ran. On the shipped page the outer
     * draw is the menu as it was while it was still open, and the nested draw is the menu closing;
     * the stale one would win, and `renderMenu` would then hand `asModal` and `restoreFocus` a
     * `controls` array from a screen that is no longer up.
     *
     * So the assertion is not *it did not throw* but **whose children are on the host**. Under the
     * parentage check this reads `['row-b', 'row-c']`. Under coalescing it reads `['row-closed']`:
     * one writer, last request wins.
     */
    const p = page();
    const field = p.node('seed-field');
    const rowA = p.node('row-a', field);
    const rowB = p.node('row-b');
    const rowC = p.node('row-c');
    const rowD = p.node('row-d');
    const closed = p.node('row-closed');
    const list = p.node('menu-list', rowA, rowB, rowC, rowD);

    field.onBlur = () => {
      draw(list, closed);
    };
    p.focus(field);
    draw(list, rowB, rowC);

    expect(
      p.names(list),
      'the outer draw re-imposed the children it built before the nested draw ran, so the stale frame won',
    ).toEqual(['row-closed']);
  });

  it('completes an insert pass rather than being unwound halfway — the truncation', () => {
    /*
     * **The truncation, pinned on its own, because it is the half that outlives the throw.** The
     * exception unwound `renderMenu` at its *first* `reconcile`, so the outer draw's insert pass
     * never ran and neither did `asModal`, `coverShell` or `restoreFocus` after it. The screen
     * looked right because the nested draw had drawn the same thing, which is luck rather than a
     * mechanism — and luck is exactly what a test is for.
     *
     * The nested handler redraws **both** hosts, which is the shipped trace rather than a reduction
     * of it: `closeMenu → drawMenu → renderMenu` reconciles `.menu-list` and then `.menu-overlay`,
     * an ancestor, and the outer call is standing in the first of those when it happens.
     *
     * Two assertions, and they fail for two different reasons, which is the point of writing them
     * separately. **Not throwing** is what the unfixed function loses: it reports
     * `The node to be removed is no longer a child of this node`, thrown on `row-d`. **The host
     * holding the whole ordered list** is what a truncation would lose: `banner` is not on the host
     * when the call starts, so only an insert pass can put it there, and a call that gave up after
     * its removals leaves `['row-b', 'row-c']` where this reads three names in an order.
     */
    const p = page();
    const field = p.node('seed-field');
    const rowA = p.node('row-a', field);
    const rowB = p.node('row-b');
    const rowC = p.node('row-c');
    const rowD = p.node('row-d');
    const banner = p.node('row-banner');
    const list = p.node('menu-list', rowA, rowB, rowC, rowD);
    const overlay = p.node('menu-overlay', list, p.node('stale-title'));
    const title = p.node('fresh-title');

    field.onBlur = () => {
      draw(list, banner, rowB, rowC);
      draw(overlay, list, title);
    };
    p.focus(field);

    expect(() => {
      draw(list, rowB, rowC);
    }, 'the outer call was unwound by the removal it was in the middle of, so everything after it was skipped').not.toThrow();

    expect(
      p.names(list),
      'the insert pass did not run to completion — the host is holding less than was asked for, or holding it out of order',
    ).toEqual(['row-banner', 'row-b', 'row-c']);
    expect(
      p.names(overlay),
      'the nested draw of the ancestor did not land',
    ).toEqual(['menu-list', 'fresh-title']);
  });

  it('stops rather than spinning when a handler redraws its host on every write', () => {
    /*
     * The bound, and why there is one. `reconcile` re-writes a host that a nested call moved under
     * it, and *while superseded* is a loop condition a caller controls. The mechanism this fix is
     * for cannot drive it — focus is cleared before the blur runs, so the second pass has nothing
     * left to blur — but a handler that refocuses into the host it redraws could, and this is a
     * renderer: an unbounded loop here is a hung tab, which is strictly worse than a frame that is
     * one write behind.
     *
     * So the contract asserted is **it returns**, and the host is left holding a coherent set
     * rather than a half-emptied one. Without the budget this case does not fail — it hangs, and
     * vitest reports it three hundred seconds later as a timeout.
     */
    const p = page();
    /*
     * Twenty rows and a handler that gives up exactly one of them per write. Each pass removes the
     * single focused row, that removal's blur focuses the next one and asks for a draw without it,
     * and so the next pass has something to blur again — one supersede per pass, which is the only
     * shape that actually exercises the loop. A handler that dropped everything at once would blur
     * twenty times inside **one** removal pass and never test the loop at all.
     */
    const pool = Array.from({ length: 20 }, (_, index) => p.node(`row-${String(index)}`));
    const list = p.node('menu-list', ...pool);

    let blurs = 0;
    let at = 0;
    const churn = (): void => {
      blurs += 1;
      at += 1;
      const next = pool[at];
      if (next === undefined) return;
      p.focus(next);
      draw(list, ...pool.slice(at + 1));
    };
    for (const row of pool) row.onBlur = churn;
    p.focus(pool[0] as Fake);

    expect(() => {
      draw(list, ...pool.slice(1));
    }).not.toThrow();

    /*
     * Eight, which is `dom.ts#COALESCED_PASSES` written down where a reader of the test can see it.
     * The duplication is deliberate: the bound is a promise about how long this function will hold
     * the main thread, and a promise nothing checks is the sort of number this repository keeps
     * finding stale.
     */
    expect(blurs, 'the coalescing loop did not run to its budget, so the bound is untested').toBe(8);
    expect(
      p.names(list),
      'the budget did not bite — the host was drained, so this ran to convergence rather than stopping',
    ).toEqual(pool.slice(8).map((row) => row.name));
  });

  it('leaves an ordinary draw exactly as it was — nothing above changes the uncontested path', () => {
    /*
     * The regression fence. Everything above is about a host being written twice at once; the
     * overwhelming majority of draws are not, and issue #106's whole point is that a child already
     * in the right place is **not touched**. `moved` is the check that the guard did not quietly
     * turn `reconcile` into `fill`: `rowB` keeps its identity and its position across a redraw that
     * inserts a node in front of it.
     */
    const p = page();
    const rowA = p.node('row-a');
    const rowB = p.node('row-b');
    const rowNew = p.node('row-new');
    const list = p.node('menu-list', rowA, rowB);

    draw(list, rowNew, rowA, rowB);

    expect(p.names(list)).toEqual(['row-new', 'row-a', 'row-b']);
    expect(list.childNodes[2], 'the retained row was rebuilt rather than left alone').toBe(rowB);
  });
});
