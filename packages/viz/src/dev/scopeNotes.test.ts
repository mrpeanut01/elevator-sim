/**
 * The scope notes reach the page, and each one says the true thing about the block it sits over —
 * GitHub issue #104.
 *
 * ## Why this file spans five mounts instead of colocating with one
 *
 * The claim is not *the dispatcher editor says something*. It is that **the three behaviours a
 * player meets on these panels are told apart**, and that claim is only checkable across the panels
 * that hold them: a card that discards the day, a lever that waits for the next run, and a slider
 * that is a draft, drawn in the same components within a few hundred pixels of each other. Split
 * three ways, each half of it would pass while the product still said one thing about three.
 *
 * `chromeLabels.test.ts` and `shellChrome.test.ts` are the precedent for a cross-mount file here.
 *
 * ## Driven, and what that is worth
 *
 * Every assertion below runs the **shipped mount** — `mountRightRail`, `mountDispatcherEditor` and
 * the rest, over `dev/elementMap.ts`'s real manifest — and reads the node back out of the page it
 * was inserted into. That is the third of `docs/16` S9's four evidence tiers, and it is what the
 * roadmap's standing requirement asks for: the note is reachable from the path `dev/main.ts` takes,
 * not from a test that calls a helper.
 *
 * It is **not** the browser tier. Nothing here consults `index.html`'s stylesheet, so a note drawn
 * at 1.03:1 would pass — `menuPanel.test.ts` records that exact failure and why the distinction is
 * stated rather than glossed. And the recorder mints one node per id rather than nesting them, so
 * *above the sliders* is checked as *inserted before the element the mount named*.
 *
 * ## The negative halves, which are the point of the issue
 *
 * Two assertions here exist to fail if somebody "fixes" #104 as the report words it. The rail may
 * not say **locked**, because a card there discards the day outright; and the levers block may not
 * say **draft**, because `shiftRunConfigOf` really does read what it writes. § D227's rule binds
 * both ways, and this is that rule pointed at a sentence rather than at a control.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { MountContext, Panel } from './mountTypes.js';
import { mountBuildingEditor } from './buildingEditor.js';
import { mountDispatcherEditor } from './dispatcherEditor.js';
import { mountMachinesEditor } from './machinesEditor.js';
import { mountRightRail } from './rightRail.js';
import { mountSelectorEditor } from './selectorEditor.js';
import { mountTrafficEditor } from './trafficEditor.js';
import { mountRecorder, type Recorded } from './mountRecorder.test-helper.js';

/** A context that records and does nothing. No mount asks anything of it while being built. */
const inertContext = (): MountContext => ({
  update: () => undefined,
  runShift: () => undefined,
  openTab: () => undefined,
  fail: () => undefined,
});

/**
 * Build every panel that carries a note, and hand back the page.
 *
 * All five in one recorder rather than one each, because they share `index.html` and the assertion
 * *no other panel picked up this sentence* is only meaningful over the whole page.
 */
function page(): { readonly around: (node: unknown) => readonly Recorded[]; readonly texts: readonly string[] } {
  const made = mountRecorder();
  const context = inertContext();
  const built: readonly Panel[] = [
    mountRightRail(made.elements.rail, context),
    mountDispatcherEditor(made.elements.dispatcherEditor, context),
    mountSelectorEditor(made.elements.selectorEditor, context),
    mountTrafficEditor(made.elements.trafficEditor, context),
    mountMachinesEditor(made.elements.machinesEditor, context),
    mountBuildingEditor(made.elements.buildingEditor, context),
  ];
  expect(built.every((panel) => typeof panel.render === 'function')).toBe(true);
  return { around: made.around, texts: made.nodes().map((node) => node.textContent) };
}

/** The sentence a mount inserted beside `node`, or `''` when it inserted none. */
const noteBeside = (
  around: (node: unknown) => readonly Recorded[],
  node: unknown,
): string =>
  around(node)
    .filter((sibling) => sibling.tag === 'p' && sibling.id === '')
    .map((sibling) => sibling.textContent)
    .join(' ');

const sourceOf = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('the right rail says a pick discards the day', () => {
  it('carries the sentence above all three live lists', () => {
    const made = mountRecorder();
    mountRightRail(made.elements.rail, inertContext());
    for (const list of [
      made.elements.rail.dispatcherList,
      made.elements.rail.trafficList,
      made.elements.rail.buildingList,
    ]) {
      const note = noteBeside(made.around, list);
      expect(note, 'a live list drew no scope note').toContain('does not steer the shift on screen');
      expect(note).toContain('simulates a different one from the start');
    }
  });

  it('does not say locked — the word the report asked for and the code refutes', () => {
    /*
     * The load-bearing negative. `onPick` writes and then calls `context.runShift()`, so a card here
     * is not disabled, not deferred and not inert: it throws the day away. *Locked for this shift*
     * over that is a refusal a run refutes, which § D227 rates worse than saying nothing.
     */
    const made = mountRecorder();
    mountRightRail(made.elements.rail, inertContext());
    const note = noteBeside(made.around, made.elements.rail.dispatcherList);
    expect(note.toLowerCase(), 'the rail claimed a lock the code does not have').not.toContain(
      'locked for this shift',
    );
    expect(note).toContain('Nothing on this panel is locked');
  });

  it('leaves the Machines segment alone, because it picks nothing', () => {
    // The fourth segment draws a plate rather than cards — issue #114 — and already carries its own
    // refusal. A second sentence there would be this rail telling a reader twice about a control it
    // does not have.
    const made = mountRecorder();
    mountRightRail(made.elements.rail, inertContext());
    expect(noteBeside(made.around, made.elements.rail.machinesList)).toBe('');
  });
});

describe('the dispatcher editor tells its two blocks apart', () => {
  it('calls the weights a draft and names the verb that files them', () => {
    const made = mountRecorder();
    mountDispatcherEditor(made.elements.dispatcherEditor, inertContext());
    const note = noteBeside(made.around, made.elements.dispatcherEditor.terms);
    expect(note).toContain('reaches a run yet');
    /*
     * Pinned to the module that authors the label rather than to a copy of it — `rightRail.ts`'s
     * machines refusal makes the same move: a refusal is worth what the door it points at is worth.
     */
    const source = sourceOf('./dispatcherEditor.ts');
    expect(source).toContain("label: 'Run this dispatcher'");
    expect(note).toContain('Run this dispatcher');
  });

  it('gives the group levers the reporter’s own words, because they are true there', () => {
    /*
     * `viewer.levers` is a live `within-day` control and the toggle beside it calls **no**
     * `runShift` — so the day on screen keeps the levers it was simulated under, which is exactly
     * *locked for this shift, changes apply to your next run*. The issue is quoted rather than
     * reworded.
     */
    const made = mountRecorder();
    mountDispatcherEditor(made.elements.dispatcherEditor, inertContext());
    const note = noteBeside(made.around, made.elements.dispatcherEditor.levers);
    expect(note).toContain('Locked for this shift: changes apply to your next run');
    expect(note, 'the levers were called a draft, and they are not one').not.toContain('draft');
  });

  it('does not put the draft sentence over the levers, or the lever sentence over the weights', () => {
    // The two blocks sit in one panel in identical components. Crossing the sentences would be
    // worse than drawing neither, and nothing else in the suite would notice.
    const made = mountRecorder();
    mountDispatcherEditor(made.elements.dispatcherEditor, inertContext());
    expect(noteBeside(made.around, made.elements.dispatcherEditor.terms)).not.toContain(
      'Locked for this shift',
    );
    expect(noteBeside(made.around, made.elements.dispatcherEditor.levers)).not.toContain(
      'Run this dispatcher',
    );
  });
});

describe('the selector separates a mid-shift mechanism from a mid-shift control', () => {
  it('says the choice waits for the next run, and does not deny that the policy switches', () => {
    /*
     * The panel's own heading calls this *"the one thing that changes mid-shift"*, which is true of
     * the mechanism and false of the control. A note that simply said *nothing here changes the
     * shift* would contradict the heading and be wrong about `core`.
     */
    const made = mountRecorder();
    mountSelectorEditor(made.elements.selectorEditor, inertContext());
    const note = noteBeside(made.around, made.elements.selectorEditor.policy);
    expect(note).toContain('Locked for this shift: changes apply to your next run');
    expect(note).toContain('does switch weight sets while a day runs');
    expect(sourceOf('../../index.html')).toContain('the one thing that changes mid-shift');
  });
});

describe('the traffic, machines and building editors each say they hold a draft', () => {
  it('names the traffic editor’s own verb', () => {
    const made = mountRecorder();
    mountTrafficEditor(made.elements.trafficEditor, inertContext());
    const note = noteBeside(made.around, made.elements.trafficEditor.orderChips);
    expect(note).toContain('reaches a run yet');
    expect(sourceOf('./trafficEditor.ts')).toContain("label: 'Use this pattern'");
    expect(note).toContain('Use this pattern');
  });

  it('says the machine class needs no selection, and reaches no car', () => {
    /*
     * The one draft of the four whose second half differs: `savedClasses` is *"the one save that
     * then reaches a run with no further selection"* (`scope/surface.ts`). Saying *and then select
     * it* here would be the stale-refusal defect with the polarity reversed — a sentence describing
     * a step the product does not have. The car clause keeps this agreeing with the rail's own
     * machines refusal instead of competing with it.
     */
    const made = mountRecorder();
    mountMachinesEditor(made.elements.machinesEditor, inertContext());
    const note = noteBeside(made.around, made.elements.machinesEditor.rows);
    expect(note).toContain('no further selection');
    expect(note).toContain('does not put the class in any car');
    expect(sourceOf('../../index.html')).toContain('Save as a new class');
  });

  it('names both of the building editor’s verbs, because Save does not select', () => {
    const made = mountRecorder();
    mountBuildingEditor(made.elements.buildingEditor, inertContext());
    const note = noteBeside(made.around, made.elements.buildingEditor.rows);
    expect(note).toContain('Save as a new building');
    expect(note).toContain('Run a day on it');
    expect(sourceOf('../../index.html')).toContain('Save as a new building');
    expect(sourceOf('./buildingEditor.ts')).toContain("const RUN_SAVED_LABEL = 'Run a day on it'");
  });
});

describe('the whole page, so a sentence cannot appear where it is untrue', () => {
  it('draws the lock wording only where no run is asked for', () => {
    /*
     * Counted over every panel at once. Two blocks in the product write a run-reaching field and
     * ask for no run — the group levers and the selector — and the count is the assertion: a third
     * copy of this sentence means somebody put it over a control that does re-run.
     */
    const built = page();
    const locked = built.texts.filter((text) =>
      text.includes('Locked for this shift: changes apply to your next run'),
    );
    expect(locked, 'the lock wording spread to a block that re-runs the day').toHaveLength(2);
  });

  it('has every note come from a mount rather than from the shipped markup', () => {
    // `index.html` cannot derive a claim from `scope/surface.ts`, which is the whole reason these
    // are built in the mounts. A sentence that had migrated into the page would be a hand-written
    // refusal again, and would stop moving when a field is re-scoped.
    const markup = sourceOf('../../index.html');
    expect(markup).not.toContain('Locked for this shift');
    expect(markup).not.toContain('reaches a run yet');
  });
});
