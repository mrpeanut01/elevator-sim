/**
 * What the header's mode select and the transport's buttons are **called** — play-test issues
 * #14 and #18.
 *
 * ## Why the assertions compute a name instead of reading an attribute
 *
 * Both defects were invisible to an attribute check, in opposite directions.
 *
 * `#view-mode` had no `aria-label` at all and looked fine: a `<label class="dim">` wrapped the word
 * *view* and the `<select>` together. But a labelable control inside its own label is an **embedded
 * control** to the accessible-name algorithm, and a `<select>`'s contribution is its *chosen
 * option's* text — so the computed name was `view Casual`, and it became `view Engineer` the moment
 * the reader used the control. A test asserting `aria-label` would have found nothing to look at; a
 * test asserting the label's text would have read `view` and passed. Only computing the name sees
 * it.
 *
 * The transport's buttons had the mirror problem. Every one of them carried a `title`, so a check
 * for tooltips passed — and a play-tester who used the app reported the row as unlabelled anyway,
 * because `title` waits about a second for a hover, cannot be reached from a keyboard, and does not
 * exist on a touch device. `◀|` and `|▶` are punctuation, so *name from content* produced a name
 * made of glyphs, which is no name. The tooltips stay; nothing may depend on them alone.
 *
 * ## What {@link accessibleNameOf} implements, and what it does not
 *
 * The subset of accname 1.2 / HTML-AAM that this page actually exercises, in the spec's own
 * precedence: `aria-label`, then a `for=`-associated `<label>`, then an **ancestor** `<label>` with
 * the embedded control's value folded in, then name-from-content. It does not implement
 * `aria-labelledby`, `title` as a last-resort name, or `alt` — nothing here uses them, and a
 * fallback nobody exercises is a fallback nobody has checked. If one arrives, this helper is where
 * it lands.
 *
 * `index.html` is read as text because `vitest.config.ts` is `environment: 'node'` for every
 * project — there is no jsdom here, and the algorithm is small enough that inlining it is honest
 * about what is being asserted.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SPEEDS } from './main.js';

async function indexHtml(): Promise<string> {
  return readFile(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
}

async function mainSource(): Promise<string> {
  return readFile(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');
}

/* -------------------------------------------------------------------------- *
 * A very small slice of the accessible-name algorithm
 * -------------------------------------------------------------------------- */

/** Text content with tags dropped and whitespace collapsed. */
function flatten(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One attribute off an opening tag, or `undefined`. */
function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return match?.[1];
}

/** The opening tag of the element carrying `id`, and where it starts. */
function openingTagOf(html: string, id: string): { readonly tag: string; readonly at: number } {
  const at = html.indexOf(`id="${id}"`);
  expect(at, `index.html has no #${id}`).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<', at);
  const end = html.indexOf('>', at);
  expect(end).toBeGreaterThan(start);
  return { tag: html.slice(start, end + 1), at: start };
}

/** The whole element carrying `id`, opening tag to matching close. Non-nesting tags only. */
function elementOf(html: string, id: string): string {
  const { tag, at } = openingTagOf(html, id);
  const name = /^<([a-z]+)/.exec(tag)?.[1] ?? '';
  const close = `</${name}>`;
  const end = html.indexOf(close, at);
  return end === -1 ? tag : html.slice(at, end + close.length);
}

/**
 * The `<label>` element that *encloses* `id`, if any — the shape that pollutes a name.
 *
 * Scans every `<label …>…</label>` in the document and returns the one whose span contains the
 * element. Labels do not nest in this page, so a flat scan is exact rather than approximate.
 */
function enclosingLabel(html: string, at: number): string | undefined {
  for (const match of html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)) {
    const start = match.index;
    if (start < at && at < start + match[0].length) return match[0];
  }
  return undefined;
}

/** The `<label for="id">` associated with `id`, if any. */
function associatedLabel(html: string, id: string): string | undefined {
  return new RegExp(`<label\\b[^>]*\\sfor="${id}"[^>]*>[\\s\\S]*?</label>`).exec(html)?.[0];
}

/**
 * What a `<select>` contributes when it is folded into a label as an embedded control: the text of
 * the option that is `selected`, or of the first option when none is.
 */
function selectValueOf(element: string): string {
  const options = [...element.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];
  const chosen = options.find((option) => (option[1] ?? '').includes('selected')) ?? options[0];
  return flatten(chosen?.[2] ?? '');
}

/**
 * The computed accessible name of the element carrying `id`.
 *
 * `selected` overrides which option a `<select>` is showing, so the name can be computed in both
 * of the states a reader can put the control into rather than only in the shipped default.
 */
export function accessibleNameOf(html: string, id: string, selected?: string): string {
  const { tag, at } = openingTagOf(html, id);
  const label = attr(tag, 'aria-label');
  if (label !== undefined) return label.trim();

  const associated = associatedLabel(html, id);
  if (associated !== undefined) return flatten(associated);

  const wrapping = enclosingLabel(html, at);
  if (wrapping !== undefined) {
    // The embedded-control rule: the label's own text, with the control's *value* in its place.
    const element = elementOf(html, id);
    const value =
      selected === undefined ? selectValueOf(element) : selectValueOf(withSelected(element, selected));
    return flatten(`${wrapping.replace(element, ' ')} ${value}`);
  }

  return flatten(elementOf(html, id));
}

/** The same `<select>` with `selected` moved to the option whose value is `value`. */
function withSelected(element: string, value: string): string {
  return element
    .replace(/\sselected/g, '')
    .replace(new RegExp(`(<option[^>]*value="${value}")`), '$1 selected');
}

/**
 * Whether a name is made of language rather than of glyphs.
 *
 * One word is enough — `#play-pause`'s `Play` is a complete name — so the bar is a pronounceable
 * run, plus the requirement that the name is not simply the glyph the button draws. `◀|` fails
 * both halves, which is the case this exists for.
 */
function isWords(name: string): boolean {
  return /[A-Za-z]{3,}/.test(name) && !/^[^A-Za-z]+$/.test(name);
}

/** Two or more real words — for a control whose name has to distinguish it from its twin. */
function isPhrase(name: string): boolean {
  return /[A-Za-z]{2,}[\s-][A-Za-z]{2,}/.test(name);
}

/* -------------------------------------------------------------------------- *
 * The instrument, before the assertions that lean on it
 * -------------------------------------------------------------------------- */

/**
 * A name check that cannot fail is a name check that proves nothing, and this one is inlined rather
 * than imported from a library, so it is asserted against the shapes it exists to tell apart —
 * including the exact markup this page used to ship, which no longer exists to be tested against.
 */
describe('accessibleNameOf tells the shapes apart', () => {
  /** What `index.html` carried before the fix: the select wrapped in its own label. */
  const WRAPPED =
    '<label class="dim">view<select id="wrapped">' +
    '<option value="basic" selected>Casual</option>' +
    '<option value="advanced">Engineer</option></select></label>';

  it('folds a wrapped select’s chosen option into the name — the bug, reproduced', () => {
    expect(accessibleNameOf(WRAPPED, 'wrapped')).toBe('view Casual');
    expect(accessibleNameOf(WRAPPED, 'wrapped', 'advanced')).toBe('view Engineer');
  });

  it('does not fold it in once the label is associated instead of wrapping', () => {
    const fixed =
      '<label class="dim" for="fixed">view</label><select id="fixed">' +
      '<option value="basic" selected>Casual</option>' +
      '<option value="advanced">Engineer</option></select>';
    expect(accessibleNameOf(fixed, 'fixed')).toBe('view');
    expect(accessibleNameOf(fixed, 'fixed', 'advanced')).toBe('view');
  });

  it('prefers aria-label over both, and falls back to a button’s own content', () => {
    expect(accessibleNameOf('<button id="a" aria-label="Pause">❚❚</button>', 'a')).toBe('Pause');
    expect(accessibleNameOf('<button id="b">◀|</button>', 'b')).toBe('◀|');
    expect(isWords(accessibleNameOf('<button id="b">◀|</button>', 'b'))).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * #18 — the mode select's name is the intended word and nothing else
 * -------------------------------------------------------------------------- */

describe('the view-mode select is called what it is called', () => {
  it('computes to exactly the intended word, not to the word plus an option', async () => {
    const html = await indexHtml();
    expect(accessibleNameOf(html, 'view-mode')).toBe('view');
  });

  it('keeps that name when the reader changes the value — the defect that was there', async () => {
    /*
     * The whole shape of the old bug: the name tracked the control's own value, so the same
     * element announced itself as two different things depending on what it was set to. Both
     * states are computed here rather than the shipped one only.
     */
    const html = await indexHtml();
    for (const value of ['basic', 'advanced']) {
      const name = accessibleNameOf(html, 'view-mode', value);
      expect(name, `#view-mode announces its value at mode=${value}`).toBe('view');
      expect(name).not.toContain('Casual');
      expect(name).not.toContain('Engineer');
    }
  });

  it('is associated rather than wrapped, which is what makes the above true', async () => {
    const html = await indexHtml();
    const { at } = openingTagOf(html, 'view-mode');
    expect(
      enclosingLabel(html, at),
      'the select is inside a <label> again — a labelable control in its own label folds its ' +
        'value into the computed name',
    ).toBeUndefined();
    // …and the visible word still points at the control, so clicking it still focuses the select.
    expect(associatedLabel(html, 'view-mode')).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- *
 * #15 — the two modes say what they change
 * -------------------------------------------------------------------------- */

describe('Casual and Engineer explain themselves', () => {
  /** The `<select id="view-mode">` element. */
  async function modeSelect(): Promise<string> {
    return elementOf(await indexHtml(), 'view-mode');
  }

  it('keeps the handoff’s two words as the leading token of each option', async () => {
    // § 1.5 B1's own vocabulary. The values stay `mode/`'s, so `mode/parity.ts` is untouched.
    const element = await modeSelect();
    expect(element).toContain('value="basic"');
    expect(element).toContain('value="advanced"');
    expect(/<option[^>]*value="basic"[^>]*>\s*Casual\b/.test(element)).toBe(true);
    expect(/<option[^>]*value="advanced"[^>]*>\s*Engineer\b/.test(element)).toBe(true);
  });

  it('says what each one changes, permanently visible rather than behind a hover', async () => {
    /*
     * The play-tester's complaint was that the two words are unexplained, and a tooltip is not an
     * explanation a reader finds: it waits for a hover that never comes on a touch device. So the
     * clause rides in the option text itself, where it is on screen with no interaction at all.
     */
    const element = await modeSelect();
    for (const value of ['basic', 'advanced']) {
      const option = new RegExp(`<option[^>]*value="${value}"[^>]*>([^<]*)</option>`).exec(
        element,
      )?.[1];
      expect(option, `#view-mode has no option for ${value}`).toBeDefined();
      expect(isWords(option ?? ''), `the ${value} option is a bare noun: "${option ?? ''}"`).toBe(
        true,
      );
    }
  });

  it('describes a difference the code actually implements, in the full sentence', async () => {
    /*
     * The long form is on the label's `title`, and every clause in it is a thing `mode/` does:
     *
     * - `mode/disclosure.ts#BASIC_HIDES` — Basic leaves out the interval spread and the energy proxy;
     * - `mode/disclosure.ts#BASIC_WINDOW_VALUE` — Basic replaces the window's exact bounds;
     * - `dev/rightRail.ts#nameplateVisibleIn` — the machines nameplate is engineer-only;
     * - `live/honesty.ts` / `leftRail.ts#mathsDisclosureOf` — the suppression rule is engineer-only;
     * - and mode parity, which is why the *never hides* clause is safe to write down.
     *
     * The claim that costs the most if it is wrong is the first: that the mode changes what is
     * *shown* and nothing that is *computed*. `scope/surface.ts` classes `viewer.mode` as
     * `presentation` and `scope.test.ts` moves it and requires the legs byte-identical, so this
     * sentence is measured elsewhere rather than asserted here.
     */
    const html = await indexHtml();
    const label = associatedLabel(html, 'view-mode') ?? '';
    const title = attr(label, 'title') ?? '';
    expect(title, 'the mode label carries no long-form description').not.toBe('');
    for (const clause of ['nameplate', 'energy proxy', 'interval spread', 'seed', 'editor tab']) {
      expect(title, `the description does not mention the ${clause}`).toContain(clause);
    }
    // The load-bearing reassurance: switching mode does not change the run.
    expect(title).toContain('nothing it computes');
  });

  it('is checked against the source of truth for what each mode hides', async () => {
    /*
     * The other direction, so the copy cannot keep describing a split the code stopped making.
     * `BASIC_HIDES` holds exactly the two figure ids the sentence names, and a third would mean
     * the sentence is now incomplete.
     */
    const { BASIC_HIDES } = await import('../mode/disclosure.js');
    const { ENERGY_ID, INTERVAL_ID } = await import('../render/runSummary.js');
    expect([...BASIC_HIDES].sort()).toEqual([ENERGY_ID, INTERVAL_ID].sort());
  });

  it('is checked against the tab gate too, which is the newest thing the modes differ on', async () => {
    /*
     * The same direction, for the clause § D330 added (issue #130). The sentence now claims
     * Engineer carries *every editor tab from the first frame* and Casual reveals them — so the
     * source of truth is `surfaceStateFor` itself, driven in both modes.
     *
     * **No count rides in this sentence, deliberately.** The strip carries the number, derived
     * from the very `hidden` flags it draws; a second copy of it in a `title` would be a figure
     * with a second source, which is the drift § D227 is about and the reason § D330's second
     * condition is worded the way it is. What the label describes is the *rule*, and this case is
     * that the rule is real.
     */
    const { CONTEXTUAL_TABS, TABS } = await import('./elementMap.js');
    const { surfaceStateFor } = await import('./surfaces.js');
    const nothingRevealed = new Set<never>();

    const engineer = surfaceStateFor('run', nothingRevealed, 'engineer');
    expect(engineer.tabs.filter((entry) => entry.hidden)).toEqual([]);
    expect(engineer.ring).toEqual([...TABS]);

    const casual = surfaceStateFor('run', nothingRevealed, 'casual');
    expect(casual.tabs.filter((entry) => entry.hidden).map((entry) => entry.tab)).toEqual([
      ...CONTEXTUAL_TABS,
    ]);
    // …and the strip is where the count lives, which is the other half of the sentence's claim.
    expect(casual.gate?.hiddenCount).toBe(CONTEXTUAL_TABS.length);
  });
});

/* -------------------------------------------------------------------------- *
 * #14 — the transport's controls are named, and still carry their tooltips
 * -------------------------------------------------------------------------- */

/** Every transport control that had a tooltip and no usable name. */
const TRANSPORT_CONTROLS: readonly string[] = Object.freeze([
  'step-back',
  'step-forward',
  'loop',
  'play-pause',
]);

describe('every transport control has a name a screen reader can use', () => {
  it('computes to real words, not to the glyph the button draws', async () => {
    const html = await indexHtml();
    for (const id of TRANSPORT_CONTROLS) {
      const name = accessibleNameOf(html, id);
      expect(name, `#${id} has no accessible name`).not.toBe('');
      expect(isWords(name), `#${id}'s name is "${name}", which is not words`).toBe(true);
    }
  });

  it('tells the two step buttons apart — a shared name would be worse than none', async () => {
    /*
     * `◀|` and `|▶` sit next to each other and do opposite things, so "step" alone would announce
     * two controls identically. The direction is the part that has to survive into the name.
     */
    const html = await indexHtml();
    const back = accessibleNameOf(html, 'step-back');
    const forward = accessibleNameOf(html, 'step-forward');
    expect(isPhrase(back), `#step-back's name is "${back}"`).toBe(true);
    expect(isPhrase(forward), `#step-forward's name is "${forward}"`).toBe(true);
    expect(back.toLowerCase()).toContain('back');
    expect(forward.toLowerCase()).toContain('forward');
    expect(back).not.toBe(forward);
  });

  it('contains the visible text where there is any — WCAG 2.5.3', async () => {
    /*
     * `#loop` draws the word *loop*. A name that replaced it would break speech input for a reader
     * who can see the control and says what it says. `#step-back` and `#step-forward` draw `◀|` and
     * `|▶`, which is why they are exempt: there is no visible *text* for a name to contain.
     */
    const html = await indexHtml();
    expect(accessibleNameOf(html, 'loop').toLowerCase()).toContain('loop');
  });

  it('keeps every tooltip that was already there — the long form is not deleted', async () => {
    /*
     * Finding that the tooltips existed is not the same as finding that the row was labelled, and
     * neither finding cancels the other. The `aria-label`s are the fix; removing the `title`s
     * while making it would have traded one hidden explanation for another.
     */
    const html = await indexHtml();
    const tooltips: Readonly<Record<string, string>> = {
      'step-back': 'one display frame back (,)',
      'step-forward': 'one display frame forward (.)',
      loop: 'when the shift ends, start it again from the beginning',
    };
    for (const [id, expected] of Object.entries(tooltips)) {
      expect(attr(openingTagOf(html, id).tag, 'title'), `#${id} lost its tooltip`).toBe(expected);
    }
  });

  it('leaves the speed chips’ group label alone, since it was already right', async () => {
    const html = await indexHtml();
    const tag = openingTagOf(html, 'speed-chips').tag;
    expect(tag).toContain('role="group"');
    expect(attr(tag, 'aria-label')).toBe('playback speed');
  });
});

describe('the speed row reads as a speed row without a hover', () => {
  it('carries a visible caption, hidden from the accessible tree because the group is named', async () => {
    /*
     * The handoff draws these five chips bare (`:823–827`) — no caption, no tooltip — so it settles
     * nothing here; what it settles is the vocabulary, and an uppercase tracked eyebrow over a row
     * of short items is its own, used directly above by M4's `.legend-title`. Without a caption the
     * row is five unexplained numbers, and a reader who never finds ×900 cannot reach the end of a
     * long shift, which is a playability failure rather than a nitpick.
     */
    const html = await indexHtml();
    const tail = html.slice(
      html.indexOf('<div class="transport-tail">'),
      html.indexOf('id="loop"'),
    );
    const caption = /<span class="transport-caption"[^>]*>([^<]*)<\/span>/.exec(tail);
    expect(caption, 'the speed chips have no visible caption').not.toBeNull();
    expect((caption?.[1] ?? '').trim()).toBe('speed');
    // Not announced: `#speed-chips` is already a named group, and "speed playback speed" is worse
    // than either half of it.
    expect(caption?.[0] ?? '').toContain('aria-hidden="true"');
    // Styled from the same three properties the legend title uses, not eyeballed per component.
    expect(html.split('.transport-caption {')).toHaveLength(2);
  });

  it('names every chip with its own visible label and its own tooltip sentence', async () => {
    /*
     * The chips are built in `drawTransportChrome`, inside `boot()`, which no Node test can call —
     * `boundaries.test.ts` confines the DOM to `dev/` precisely so the rest of the package stays
     * testable without a jsdom. So the wiring is asserted against the source, which is weaker than
     * driving it and is stated as a limitation rather than presented as coverage.
     *
     * What it does establish is the property that matters: the name is **composed from the same two
     * locals** as the visible label and the tooltip, so there is one wording and no second copy to
     * drift out of step with the ladder.
     */
    const source = await mainSource();
    const start = source.indexOf('...SPEEDS.map((speed)');
    expect(start, 'main.ts no longer builds the speed chips from SPEEDS').toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf('const recording = view.recording', start));
    expect(block).toContain('const label = `×${String(speed)}`');
    expect(block).toContain('const title = `${String(speed)} simulated ${unit} per real second`');
    expect(block).toContain("node.setAttribute('aria-label', `${label} — ${title}`)");
    // The tooltip is still passed to the chip: the name is an addition, not a replacement.
    expect(block).toMatch(/\btitle,/);
    // …and the ×1 chip says "second". The plural was wrong on the tooltip before this, which is
    // the kind of thing promoting a sentence to a second channel doubles rather than reveals.
    expect(block).toContain("speed === 1 ? 'second' : 'seconds'");
  });

  it('covers the whole ladder, so no chip is left unnamed', () => {
    // The names are built by mapping `SPEEDS`, so this is what "every chip" means. ×900 is the one
    // the play-tester could not find, and the ladder reaching it is why it has to be findable.
    expect(SPEEDS.length).toBeGreaterThan(1);
    expect(SPEEDS).toContain(900);
  });
});
