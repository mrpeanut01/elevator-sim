/**
 * The element manifest, against the page it describes — and the resolver's one behavioural promise.
 *
 * Two things are checked here and they are different in kind:
 *
 * 1. **The resolver reports every miss.** A property of the function, driven under Node against a
 *    structural {@link ElementSource}. This is the change: the old helper threw on the first absent
 *    id, so a page brought up against this viewer for the first time was fixed one reload at a time.
 * 2. **The manifest matches `index.html`.** A property of the *pair*, and the only one a type
 *    cannot state: `IdsFor<Elements>` makes the manifest and the interface the same shape, but no
 *    type knows whether `'stage'` is an id the page actually has.
 *
 * The second is asserted in **both** directions, because the two directions mean different things
 * to a UI author. An id here that the page lacks is a crash. An id in the page that is not here is
 * the opposite — something the viewer never looks up, which is exactly the list of what a new page
 * is free to rename or drop.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ELEMENT_IDS,
  MissingElementsError,
  TABS,
  elementIdsIn,
  isTabName,
  resolveElements,
  type ElementSource,
  type Elements,
} from './elementMap.js';

/** A document that has exactly the ids given, and returns a stand-in carrying its own id. */
function pageWith(ids: Iterable<string>): ElementSource {
  const present = new Set(ids);
  return {
    getElementById: (id) => (present.has(id) ? ({ id } as unknown as Element) : null),
  };
}

const ALL_IDS = elementIdsIn(ELEMENT_IDS);

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

/**
 * Ids `index.html` carries that the viewer never resolves through {@link ELEMENT_IDS}.
 *
 * Every one belongs to the building editor, which resolves its own controls inside
 * `dev/editor.ts` against the panel it is handed rather than against the whole document — plus
 * `#preview`, its canvas, and `#stage-fallback`, the `<noscript>`-style message behind the viewer
 * canvas that nothing needs a handle to.
 *
 * Frozen and asserted exactly, not as a lower bound. The list is the answer to *"what may a new
 * page drop?"*, and an answer that silently grows is not one — a new unclaimed id is either a
 * control somebody forgot to wire or a genuine addition to this list, and the difference is worth a
 * red test.
 */
const NOT_RESOLVED_BY_THE_VIEWER: readonly string[] = Object.freeze([
  'ed-access-note',
  'ed-add-bank',
  'ed-add-floor',
  'ed-add-range',
  'ed-add-zone',
  'ed-banks',
  'ed-expansion',
  'ed-floors',
  'ed-id',
  'ed-issues',
  'ed-json',
  'ed-json-help',
  'ed-lens',
  'ed-lens-note',
  'ed-name',
  'ed-operational',
  'ed-ranges',
  'ed-traffic',
  'ed-type',
  'ed-verdict',
  'ed-warnings',
  'ed-zones',
  'editor-blank',
  'editor-discard',
  'editor-download',
  'editor-error',
  'editor-import',
  'editor-open',
  'editor-redo',
  'editor-run',
  'editor-status',
  'editor-undo',
  'preview',
  'stage-fallback',
]);

describe('the resolver reports every missing element, not the first', () => {
  it('resolves the whole manifest when the page has everything', () => {
    const resolved = resolveElements<Elements>(pageWith(ALL_IDS), ELEMENT_IDS);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    // Nested groups come back as objects, not as the ids that named them — the shape the 1 600-line
    // caller depends on, and the part a hand-written walk gets wrong.
    expect((resolved.elements.canvas as unknown as { id: string }).id).toBe('stage');
    expect((resolved.elements.tabs.compare as unknown as { id: string }).id).toBe('tab-compare');
    expect((resolved.elements.batch.replications as unknown as { id: string }).id).toBe(
      'batch-replications',
    );
    expect((resolved.elements.campaign.weightsRefusal as unknown as { id: string }).id).toBe(
      'campaign-weights-refusal',
    );
  });

  it('names all four when four are missing — the whole point of the change', () => {
    const absent = ['stage', 'error', 'batch-run', 'campaign-weights'];
    const resolved = resolveElements<Elements>(
      pageWith(ALL_IDS.filter((id) => !absent.includes(id))),
      ELEMENT_IDS,
    );
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    // Order is the manifest's, so the list reads the same way twice on the same page.
    expect(resolved.missing).toEqual(ALL_IDS.filter((id) => absent.includes(id)));
    expect(resolved.missing).toHaveLength(4);
    expect(resolved.total).toBe(ALL_IDS.length);
  });

  it('reports a nested miss by its id and not by the key that held it', () => {
    // `batch.replications` is the field; `#batch-replications` is what a page author has to add.
    // Reporting the key would send them looking for an element called `replications`.
    const resolved = resolveElements<Elements>(
      pageWith(ALL_IDS.filter((id) => id !== 'batch-replications')),
      ELEMENT_IDS,
    );
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.missing).toEqual(['batch-replications']);
  });

  it('reports an empty page as every id missing rather than giving up at the first', () => {
    const resolved = resolveElements<Elements>(pageWith([]), ELEMENT_IDS);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.missing).toEqual(ALL_IDS);
    expect(resolved.missing.length).toBeGreaterThan(60);
  });
});

describe('the error a page author actually reads', () => {
  it('carries the count, the total and every id, and points at the manifest', () => {
    const error = new MissingElementsError(['stage', 'error'], 73);
    expect(error.message).toContain('missing 2 of the 73 elements');
    expect(error.message).toContain('#stage, #error');
    expect(error.message).toContain('src/dev/elementMap.ts');
    // As data too: a surface that wants to list them should not have to parse the sentence.
    expect(error.missing).toEqual(['stage', 'error']);
    expect(error.name).toBe('MissingElementsError');
  });
});

describe('the manifest and index.html agree', () => {
  it('has no id twice, so no two fields share one node', async () => {
    // Two keys pointing at one id resolves without error and silently aliases two features to the
    // same element. Nothing else in the suite would notice.
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
  });

  it('asks for nothing index.html does not have', async () => {
    const html = await indexHtml();
    const present = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1] ?? ''));
    const absent = ALL_IDS.filter((id) => !present.has(id));
    expect(
      absent,
      'the manifest names elements the shipped page does not contain, so the viewer cannot boot',
    ).toEqual([]);
  });

  it('lists exactly which of the page’s ids the viewer never resolves', async () => {
    const html = await indexHtml();
    const present = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1] ?? '');
    const claimed = new Set(ALL_IDS);
    const unclaimed = [...new Set(present)].filter((id) => !claimed.has(id)).sort();
    expect(
      unclaimed,
      'an id in index.html that the viewer never looks up is either an editor control (which ' +
        'resolves its own, inside dev/editor.ts) or a control somebody forgot to wire. Add it to ' +
        'NOT_RESOLVED_BY_THE_VIEWER only once you know which.',
    ).toEqual([...NOT_RESOLVED_BY_THE_VIEWER]);
  });

  it('has a button and a panel id for every tab, and no tab without both', async () => {
    const html = await indexHtml();
    const present = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1] ?? ''));
    for (const tab of TABS) {
      expect(ELEMENT_IDS.tabs[tab], tab).toBe(`tab-${tab}`);
      expect(ELEMENT_IDS.panels[tab], tab).toBe(`panel-${tab}`);
      expect(present.has(`tab-${tab}`), `#tab-${tab}`).toBe(true);
      expect(present.has(`panel-${tab}`), `#panel-${tab}`).toBe(true);
    }
    expect(isTabName('compare')).toBe(true);
    expect(isTabName('nope')).toBe(false);
    expect(isTabName(null)).toBe(false);
  });
});
