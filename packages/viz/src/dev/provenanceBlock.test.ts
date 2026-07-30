/**
 * The transport's second row, against `docs/12` § 4.7 — and the check that keeps the two honest.
 *
 * ## Why this file exists
 *
 * `docs/12` § 5 point 11 requires that § 4 and `DECISIONS.md` agree about every deviation, and the
 * thirteen controls on the transport's second row satisfied it **vacuously**: neither document
 * mentioned them, so neither could contradict the other. A *both documents agree* check cannot see
 * a block that is in neither. What was on the screen was a raw `Choose File / No file chosen`, bare
 * `<select>` chrome and a bare checkbox, in a viewer whose whole vocabulary is chips, ghosts and
 * plates.
 *
 * So the assertions here run in **both** directions, which is the pair that makes the requirement
 * non-vacuous:
 *
 * 1. **Every control the page still carries is named in § 4.7.** A control added to this block and
 *    not written down goes red here rather than being noticed in a browser six weeks later.
 * 2. **Every control § 4.7 names is on the page, in the handoff's vocabulary.** A doc that keeps
 *    describing a control the markup dropped is the *published number that does not reproduce*
 *    failure wearing a UI mask.
 *
 * The vocabulary half is asserted structurally rather than by eye: the file input is `.sr-only`
 * behind a `.ghost` label, `#loop` is a `.chip` with `aria-pressed` and not an `<input>`, and the
 * three text/select controls sit in `.field-inline` rather than in the ad-hoc `class="dim"` labels
 * they had. `index.html` is read as text because `vitest.config.ts` is `environment: 'node'` for
 * every project — there is no jsdom here, and none is needed to ask what the shipped page contains.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ELEMENT_IDS } from './elementMap.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

async function handoffDoc(): Promise<string> {
  return readFile(
    fileURLToPath(new URL('../../../../docs/12-design-handoff.md', import.meta.url)),
    'utf8',
  );
}

/** § 4.7's own section, from its heading to the next one. */
async function section47(): Promise<string> {
  const doc = await handoffDoc();
  const start = doc.indexOf('### 4.7');
  expect(start, 'docs/12 has no § 4.7').toBeGreaterThan(-1);
  const end = doc.indexOf('\n## ', start);
  return doc.slice(start, end === -1 ? undefined : end);
}

/** The `.transport` card, from the M5 comment to the end of the Simulation tabpanel. */
async function transportBlock(): Promise<string> {
  const html = await indexHtml();
  const start = html.indexOf('<div class="transport">');
  const end = html.indexOf('</section>', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

/** The coach ribbon, § 1.3 M2. */
async function coachBlock(): Promise<string> {
  const html = await indexHtml();
  const start = html.indexOf('<div class="coach">');
  const end = html.indexOf('<!-- M3', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

/**
 * The controls § 4.7 accounts for, as ids.
 *
 * Deliberately **not** derived from `ELEMENT_IDS.transport`: the whole point of the pair of
 * assertions below is that the manifest, the markup and the prose are three independent statements
 * that have to agree. Deriving this list from one of them would delete one of the three.
 */
const ACCOUNTED_FOR: readonly string[] = Object.freeze([
  'seed',
  'verify',
  'save-recording',
  'load-recording',
  'export-png',
  'bank-filter',
  'landing-select',
  'run',
  'loop',
  'step-back',
  'step-forward',
  'status',
  'error',
]);

describe('docs/12 § 4.7 and the transport agree in both directions', () => {
  it('names every id the block still carries', async () => {
    const section = await section47();
    for (const id of ACCOUNTED_FOR) {
      expect(
        section.includes(`\`#${id}\``),
        `docs/12 § 4.7 does not name #${id}. A control in this block that no requirement row and ` +
          'no deviation mentions is exactly what § 4.7 was written to stop.',
      ).toBe(true);
    }
  });

  it('leaves no control in the block unaccounted for', async () => {
    const block = await transportBlock();
    const ids = [...block.matchAll(/id="([^"]+)"/g)].map((match) => match[1] ?? '');
    // The six the handoff *does* specify (M5), plus the two ids its timeline is built from.
    const specifiedByM5 = ['play-pause', 'timeline', 'playhead', 'timeline-ticks', 'speed-chips'];
    const unaccounted = ids.filter(
      (id) => !ACCOUNTED_FOR.includes(id) && !specifiedByM5.includes(id),
    );
    expect(
      unaccounted,
      'an id on the transport card that is neither an M5 requirement nor named in § 4.7. Write it ' +
        'into § 4.7 with the obligation that requires it, or take it off the card.',
    ).toEqual([]);
  });

  it('describes only controls that are still there — #copy-provenance is gone from all three', async () => {
    const html = await indexHtml();
    const section = await section47();
    // The markup, the manifest and the wiring moved in one change; the prose says why.
    expect(html).not.toContain('id="copy-provenance"');
    expect(JSON.stringify(ELEMENT_IDS)).not.toContain('copy-provenance');
    // The footer's control is the handoff's own S4 requirement and is what survives.
    expect(html).toContain('id="copy-run"');
    expect(ELEMENT_IDS.footer.copyRun).toBe('copy-run');
    expect(section).toContain('#copy-provenance');
    expect(section).toContain('#copy-run');
  });
});

describe('the block speaks the handoff’s vocabulary, not the browser’s', () => {
  it('has no native checkbox and no visible file input left on the card', async () => {
    const block = await transportBlock();
    expect(
      block,
      'a bare checkbox appears nowhere in the handoff; a toggle here is a .chip[aria-pressed]',
    ).not.toContain("type=\"checkbox\"");
    // The file input survives — it is the control — but only behind the ghost label.
    const fileInput = /<input[^>]*id="load-recording"[^>]*>/.exec(block)?.[0] ?? '';
    expect(fileInput, '#load-recording is missing from the transport card').not.toBe('');
    expect(
      fileInput,
      'the raw "Choose File / No file chosen" is the single most visible departure from the handoff',
    ).toContain('class="sr-only"');
    expect(block).toContain('<label class="ghost file-ghost" for="load-recording">');
  });

  it('makes #loop a pressed chip rather than a checkbox, beside the speed chips', async () => {
    const block = await transportBlock();
    const loop = /<button[^>]*id="loop"[^>]*/s.exec(block)?.[0] ?? '';
    expect(loop, '#loop is not a <button>').not.toBe('');
    expect(loop).toContain('class="chip"');
    expect(loop).toContain('aria-pressed="false"');
    // Beside the speed chips, inside the transport's tail, because it is the same kind of claim:
    // how the transport behaves, not what the run contains.
    const tailStart = block.indexOf('<div class="transport-tail">');
    const tailEnd = block.indexOf('</div>', block.indexOf('id="loop"'));
    expect(tailStart).toBeGreaterThan(-1);
    const tail = block.slice(tailStart, tailEnd);
    expect(tail).toContain('id="speed-chips"');
    expect(tail.indexOf('id="speed-chips"')).toBeLessThan(tail.indexOf('id="loop"'));
  });

  it('gives the seed, the bank filter and the landing selector the editors’ own field styling', async () => {
    const block = await transportBlock();
    for (const id of ['seed', 'bank-filter', 'landing-select']) {
      expect(
        block,
        `#${id} is not inside a .field-inline label, so it draws native chrome`,
      ).toContain(`<label class="field-inline" for="${id}">`);
    }
    // The ad-hoc inline-styled labels these replaced.
    expect(block).not.toContain('<label class="dim" style="font: 500 10.5px var(--mono)">');
  });

  it('declares .field-inline, .file-ghost and .provenance once, in the stylesheet', async () => {
    const html = await indexHtml();
    for (const rule of ['.field-inline {', '.file-ghost {', '.provenance {']) {
      expect(html.split(rule)).toHaveLength(2);
    }
    // KB-02: the ghost label carries the ring the .sr-only input can no longer draw.
    expect(html).toContain('.file-ghost:focus-within { outline: 2px solid var(--accent);');
  });

  it('groups what remains under an eyebrow rather than trailing it off the row', async () => {
    const block = await transportBlock();
    expect(block).toContain('<span class="eyebrow">Provenance and replay</span>');
    expect(block).toContain('<div class="provenance">');
  });
});

describe('#run sits with its own inputs', () => {
  it('is in the coach ribbon, beside the three selects that decide what it runs', async () => {
    const coach = await coachBlock();
    expect(coach).toContain('id="run"');
    for (const select of ['pick-building', 'pick-pattern', 'pick-shift']) {
      expect(coach).toContain(`id="${select}"`);
    }
    // The ribbon's own scale, not the report sheet's.
    expect(coach).toContain('class="primary" id="run"');
  });

  it('is off the transport card, and the manifest agrees which surface owns it', async () => {
    const block = await transportBlock();
    expect(block).not.toContain('id="run"');
    expect(ELEMENT_IDS.coach.run).toBe('run');
    expect(Object.keys(ELEMENT_IDS.transport)).not.toContain('run');
  });
});
