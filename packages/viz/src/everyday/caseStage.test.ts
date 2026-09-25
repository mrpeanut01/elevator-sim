/**
 * **The fix case's stage block, driven through a document recorder** — `docs/16` S9's third
 * evidence tier, which `dev/menuPanel.test.ts` built and this file borrows whole.
 *
 * ## What this tier can settle, and what it hands to the browser
 *
 * `mountCaseStage` is a DOM mount: it builds canvases and a transport, so the honesty corpus
 * excludes it (`honesty/derive.test.ts`) and every claim about it was, before this file, a claim
 * about a pure function next door or a regex over the source. That is the shape of the eleven dead
 * seams `CLAUDE.md` counts, and this module had just grown a second block.
 *
 * So the recorder below is about sixty lines and is **not a browser**: no layout, no CSS, no
 * selector engine, no event dispatch beyond calling the handler this module registered. The canvas
 * context is a proxy that records the calls made against it and returns nothing.
 *
 * What that settles, and it is the claim worth settling: **a pair block paints both of its panes,
 * each from its own recording, inside one animation frame.** Two panes drawn in one callback is
 * what *one playhead* means here — `paint` reads `playback.simTimeS` once and passes the same value
 * to both `frameAt` calls — and it is the whole argument for why this block shows a comparison
 * rather than two runs. The floor labels prove the panes are not the same recording drawn twice,
 * because each recording is given labels the other does not have.
 *
 * What it cannot settle is that the picture **looks** like anything, which is
 * `fixitScreen.browser.test.ts`'s, and it is stated here rather than left for a reader to infer
 * from a green test.
 */

import { describe, expect, it } from 'vitest';

import { syntheticFloor, syntheticRecording, syntheticShaft } from '../live/synthetic.test-helper.js';
import { mountCaseStage } from './caseStage.js';

/* -------------------------------------------------------------------------- *
 * The recorder
 * -------------------------------------------------------------------------- */

interface Recorded {
  tag: string;
  className: string;
  textContent: string;
  type: string;
  width: number;
  height: number;
  isConnected: boolean;
  style: { cssText: string };
  children: Recorded[];
  listeners: Map<string, () => void>;
  ownerDocument: unknown;
  rect: { width: number; height: number };
  /** Every canvas-context call this node's context received, in order, as `name` strings. */
  ops: string[];
  /** Every string `fillText` was asked to draw on this node's context. */
  texts: string[];
  append(...kids: Recorded[]): void;
  addEventListener(type: string, handler: () => void): void;
  getBoundingClientRect(): { width: number; height: number };
  getContext(kind: string): unknown;
}

interface Recorder {
  doc: Document;
  /** Run every animation frame that has been requested since the last call, once each. */
  tick(): void;
  /** How many frames are outstanding — `0` once the block has finished or been disposed. */
  pending(): number;
}

function recorder(rect: { width: number; height: number } = { width: 400, height: 300 }): Recorder {
  let frames: (() => void)[] = [];
  let nextHandle = 1;
  const handles = new Map<number, () => void>();

  const doc = {
    createElement(tag: string): Recorded {
      const node: Recorded = {
        tag,
        className: '',
        textContent: '',
        type: '',
        width: 0,
        height: 0,
        isConnected: true,
        style: { cssText: '' },
        children: [],
        listeners: new Map(),
        ownerDocument: undefined,
        rect,
        ops: [],
        texts: [],
        append(...kids: Recorded[]) {
          node.children.push(...kids);
        },
        addEventListener(type: string, handler: () => void) {
          node.listeners.set(type, handler);
        },
        getBoundingClientRect() {
          return node.rect;
        },
        getContext(kind: string): unknown {
          if (kind !== '2d') return null;
          /*
           * Any member is a no-op function and any assignment is accepted — `drawCutaway` sets
           * `fillStyle`, `font`, `textAlign` and four more, and calls twenty-three methods. A hand
           * written stub would be a list that goes stale the first time the painter grows a call,
           * and a painter call this tier silently dropped would make a pane that drew nothing look
           * like a pane that drew.
           */
          return new Proxy(
            {},
            {
              get: (_target, key) => {
                const name = String(key);
                return (...args: unknown[]): undefined => {
                  node.ops.push(name);
                  if (name === 'fillText' && typeof args[0] === 'string') node.texts.push(args[0]);
                  return undefined;
                };
              },
              set: () => true,
            },
          );
        },
      };
      node.ownerDocument = { defaultView: { devicePixelRatio: 1 } };
      return node;
    },
    defaultView: {
      devicePixelRatio: 1,
      requestAnimationFrame(callback: () => void): number {
        const handle = nextHandle;
        nextHandle += 1;
        handles.set(handle, callback);
        frames.push(callback);
        return handle;
      },
      cancelAnimationFrame(handle: number): void {
        const callback = handles.get(handle);
        handles.delete(handle);
        if (callback !== undefined) frames = frames.filter((queued) => queued !== callback);
      },
    },
  };

  return {
    doc: doc as unknown as Document,
    tick(): void {
      const due = frames;
      frames = [];
      for (const callback of due) callback();
    },
    pending(): number {
      return frames.length;
    },
  };
}

/** Walk a recorded tree. */
function walk(node: Recorded): Recorded[] {
  return [node, ...node.children.flatMap(walk)];
}

const canvasesOf = (root: unknown, className: string): Recorded[] =>
  walk(root as Recorded).filter((node) => node.tag === 'canvas' && node.className === className);

const CLASSES = { root: 'block', canvas: 'pane', skip: 'skip' } as const;
const COPY = { eyebrow: 'WATCH', note: 'a note', skip: 'Skip' } as const;

/** Two recordings that cannot be mistaken for one another: their floor labels are disjoint. */
const before = syntheticRecording({
  floors: [syntheticFloor('L0', 0, 'BeforeLobby'), syntheticFloor('L1', 1, 'BeforeOne')],
  endedAt: 600,
});
const after = syntheticRecording({
  floors: [syntheticFloor('L0', 0, 'AfterLobby'), syntheticFloor('L1', 1, 'AfterOne')],
  endedAt: 600,
});

describe('the fix case stage block', () => {
  it('refuses to be a stage with no run to play', () => {
    const { doc } = recorder();
    expect(() =>
      mountCaseStage(doc, {
        panes: [],
        speedSimPerRealS: 30,
        copy: COPY,
        classes: CLASSES,
        onDone: () => undefined,
      }),
    ).toThrow(/no run to play/);
  });

  it('draws one canvas and no caption for a single pane', () => {
    const { doc, tick } = recorder();
    const stage = mountCaseStage(doc, {
      panes: [{ recording: before }],
      speedSimPerRealS: 30,
      copy: COPY,
      classes: CLASSES,
      onDone: () => undefined,
    });
    tick();
    const canvases = canvasesOf(stage.root, 'pane');
    expect(canvases).toHaveLength(1);
    // The caption is what a pair needs and a single pane does not: a label on the only thing there.
    expect(walk(stage.root as unknown as Recorded).map((node) => node.textContent)).not.toContain(
      'As it stands',
    );
    stage.dispose();
  });

  /**
   * **The claim this file exists for.** Both panes are painted inside one animation frame, each
   * from its own recording — which is what one playhead over two runs means, and is the difference
   * between a comparison and two runs that happen to be near each other.
   */
  it('paints both panes of a pair in one frame, each from its own recording', () => {
    const { doc, tick } = recorder();
    const stage = mountCaseStage(doc, {
      panes: [
        { recording: before, caption: 'As it stands' },
        { recording: after, caption: 'With your change' },
      ],
      speedSimPerRealS: 30,
      copy: COPY,
      classes: CLASSES,
      onDone: () => undefined,
    });

    const canvases = canvasesOf(stage.root, 'pane');
    expect(canvases).toHaveLength(2);
    // Nothing is painted before a frame is asked for — the block does not draw in its constructor.
    expect(canvases.map((canvas) => canvas.ops.length)).toEqual([0, 0]);

    tick();

    /*
     * One frame, two paints. `setTransform` is `sizeCanvas`'s and `clearRect` is `drawCutaway`'s
     * first call, so this pair of assertions is *the canvas was sized and then the painter ran* on
     * both panes — a pane that was sized and never painted is the failure it separates out.
     */
    expect(canvases[0]?.ops[0]).toBe('setTransform');
    expect(canvases[0]?.ops).toContain('clearRect');
    expect(canvases[1]?.ops[0]).toBe('setTransform');
    expect(canvases[1]?.ops).toContain('clearRect');
    // And each pane drew its own building's floor labels, so this is not one recording twice.
    expect(canvases[0]?.texts).toContain('BeforeLobby');
    expect(canvases[0]?.texts).not.toContain('AfterLobby');
    expect(canvases[1]?.texts).toContain('AfterLobby');
    expect(canvases[1]?.texts).not.toContain('BeforeLobby');

    stage.dispose();
  });

  it('carries a caption over each pane of a pair', () => {
    const { doc } = recorder();
    const stage = mountCaseStage(doc, {
      panes: [
        { recording: before, caption: 'As it stands' },
        { recording: after, caption: 'With your change' },
      ],
      speedSimPerRealS: 30,
      copy: COPY,
      classes: CLASSES,
      onDone: () => undefined,
    });
    const texts = walk(stage.root as unknown as Recorded).map((node) => node.textContent);
    expect(texts).toContain('As it stands');
    expect(texts).toContain('With your change');
    expect(texts).toContain('WATCH');
    expect(texts).toContain('a note');
    stage.dispose();
  });

  it('finishes once on the skip press, and stops asking for frames', () => {
    const { doc, tick, pending } = recorder();
    let done = 0;
    const stage = mountCaseStage(doc, {
      panes: [{ recording: before }],
      speedSimPerRealS: 30,
      copy: COPY,
      classes: CLASSES,
      onDone: () => {
        done += 1;
      },
    });
    tick();
    expect(pending()).toBe(1);

    const skip = walk(stage.root as unknown as Recorded).find((node) => node.className === 'skip');
    skip?.listeners.get('click')?.();
    expect(done).toBe(1);
    expect(pending()).toBe(0);

    // A second press is not a second finish — `onDone` is the screen's one hand-back.
    skip?.listeners.get('click')?.();
    expect(done).toBe(1);
  });

  /**
   * The re-append case, which is why `fixitScreen.ts` keeps the block across redraws: the screen
   * rebuilds its main column on every press, so a block whose canvas is momentarily out of the
   * document must wait rather than stop. A block that stopped here would be a run that restarts
   * every time a repair is toggled.
   */
  it('keeps asking for frames while detached, and paints again once re-appended', () => {
    const { doc, tick, pending } = recorder();
    const stage = mountCaseStage(doc, {
      panes: [{ recording: before }],
      speedSimPerRealS: 30,
      copy: COPY,
      classes: CLASSES,
      onDone: () => undefined,
    });
    const canvas = canvasesOf(stage.root, 'pane')[0];
    expect(canvas).toBeDefined();

    tick();
    const painted = canvas?.ops.length ?? 0;
    expect(painted).toBeGreaterThan(0);

    if (canvas !== undefined) canvas.isConnected = false;
    tick();
    expect(canvas?.ops.length).toBe(painted); // nothing drawn while detached
    expect(pending()).toBe(1); // and it has not given up

    if (canvas !== undefined) canvas.isConnected = true;
    tick();
    expect(canvas?.ops.length ?? 0).toBeGreaterThan(painted);
    stage.dispose();
  });

  it('is disposable twice and asks for no frame afterwards', () => {
    const { doc, tick, pending } = recorder();
    let done = 0;
    const stage = mountCaseStage(doc, {
      panes: [{ recording: before }, { recording: after }],
      speedSimPerRealS: 30,
      copy: COPY,
      classes: CLASSES,
      onDone: () => {
        done += 1;
      },
    });
    tick();
    stage.dispose();
    stage.dispose();
    tick();
    expect(pending()).toBe(0);
    // Dispose is the screen taking the block away; it is not the player finishing the watch.
    expect(done).toBe(0);
  });

  /**
   * A zero box is *not* a size — `cutaway.ts#sizeCanvas`'s own rule. A pane measured while an
   * ancestor is `display:none` reports `0 × 0`, and painting to that produces a blank canvas that
   * stays blank. The block must ask again rather than draw.
   */
  it('draws nothing into a zero box and keeps asking', () => {
    const { doc, tick, pending } = recorder({ width: 0, height: 0 });
    const stage = mountCaseStage(doc, {
      panes: [{ recording: before }],
      speedSimPerRealS: 30,
      copy: COPY,
      classes: CLASSES,
      onDone: () => undefined,
    });
    tick();
    expect(canvasesOf(stage.root, 'pane')[0]?.ops).toEqual([]);
    expect(pending()).toBe(1);
    stage.dispose();
  });

  /*
   * **The bank view** — the post-AI playability panel's Vertical City finding. Thirty-three cars
   * in a 400 px pane have no room for a readout between two shafts, so none is printed and the
   * block offers one bank at a time; a bank of three has room, so its readouts come back and the
   * other bank's cars leave the picture. Both panes follow the one select.
   */
  it('offers one bank at a time where the whole tower cannot print its readouts, and both panes follow it', () => {
    const shafts = [
      ...['A', 'B', 'C'].map((id) => ({ ...syntheticShaft(`low-${id}`, id), bankId: 'low' })),
      ...Array.from({ length: 30 }, (_, index) => ({
        ...syntheticShaft(`high-${String(index)}`, `H${String(index)}`),
        bankId: 'high',
      })),
    ];
    const wide = (label: string) =>
      syntheticRecording({ floors: [syntheticFloor('L0', 0, label), syntheticFloor('L1', 1), syntheticFloor('L2', 2)], shafts });
    const { doc, tick } = recorder({ width: 400, height: 300 });
    const stage = mountCaseStage(doc, {
      panes: [
        { recording: wide('BeforeLobby'), caption: 'As it stands' },
        { recording: wide('AfterLobby'), caption: 'With your change' },
      ],
      speedSimPerRealS: 30,
      copy: { ...COPY, bankView: 'Show one bank:', bankViewWhole: 'Whole tower' },
      classes: CLASSES,
      banks: [
        { id: 'low', name: 'Low rise' },
        { id: 'high', name: 'High rise' },
      ],
      onDone: () => undefined,
    });
    const nodes = walk(stage.root as unknown as Recorded) as (Recorded & { hidden?: boolean; value?: string })[];
    const row = nodes.find((node) => node.className === 'block-banks');
    const picker = nodes.find((node) => node.className === 'block-bank');
    expect(row, 'no bank view was built for a two-bank tower').toBeDefined();
    expect(picker?.children.map((option) => option.textContent)).toEqual(['Whole tower', 'Low rise', 'High rise']);

    tick();
    const canvases = canvasesOf(stage.root, 'pane');
    const readouts = (canvas: Recorded | undefined): string[] =>
      (canvas?.texts ?? []).filter((text) => /^\d+\/\d+$/u.test(text));
    expect(row?.hidden, 'the bank view is hidden on a tower whose readouts do not fit').toBe(false);
    expect(readouts(canvases[0]), 'a readout was printed with no room for it').toEqual([]);

    if (picker !== undefined) picker.value = 'low';
    picker?.listeners.get('change')?.();
    for (const canvas of canvases) canvas.texts.length = 0;
    tick();
    expect(readouts(canvases[0]), 'the low bank drew other cars, or none').toEqual(['0/13', '0/13', '0/13']);
    expect(readouts(canvases[1]), 'the second pane did not follow the select').toEqual(['0/13', '0/13', '0/13']);
    stage.dispose();
  });

  it('offers no bank view on a tower that prints every readout whole', () => {
    const { doc, tick } = recorder({ width: 400, height: 300 });
    const stage = mountCaseStage(doc, {
      panes: [{ recording: before }],
      speedSimPerRealS: 30,
      copy: { ...COPY, bankView: 'Show one bank:', bankViewWhole: 'Whole tower' },
      classes: CLASSES,
      banks: [
        { id: 'main', name: 'Main' },
        { id: 'other', name: 'Not in this run' },
      ],
      onDone: () => undefined,
    });
    tick();
    const nodes = walk(stage.root as unknown as Recorded) as (Recorded & { hidden?: boolean })[];
    const row = nodes.find((node) => node.className === 'block-banks');
    /* One bank in play is no choice at all, so the row stays hidden with nothing in it. */
    expect(row?.hidden).toBe(true);
    expect(row?.children).toEqual([]);
    stage.dispose();
  });
});
