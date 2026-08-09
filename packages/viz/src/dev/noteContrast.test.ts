/**
 * The change-scope notes are legible — a **number** per class, per theme, per ground.
 * GitHub issue #124. A decision number is owed for this file; the argument is here.
 *
 * ## What was missing, and why it mattered more here than for most text
 *
 * § D309 added nine change-scope notes across the right rail and five editor blocks — *this
 * re-runs the day*, *this applies to your next run*, *this is a draft*. They render in two existing
 * classes, `.advice` and `.rail-prose`, and **neither had ever been measured for contrast.** The
 * tier that drives them cannot measure it: `scopeNotes.test.ts` builds the DOM through
 * `mountRecorder.test-helper.ts` and reads the sentence back out, and that recorder consults no
 * stylesheet at all — its own docstring says so, and `menuPanel.test.ts` puts a figure on the blind
 * spot. That figure is **1.03:1**, and it is a figure for a *pairing* rather than for a token:
 * `.menu-row-detail` inherited a grey styled for a card and was drawn on `.menu-start`'s accent
 * fill, so the one sentence explaining why Start would not start was present in the DOM and
 * invisible on the screen. The negative control below re-derives that pairing through this file's
 * own resolver — 1.16 and 1.66 on today's raised ink ladder, 1.03 and 1.46 on the one that shipped
 * it — which is how the instrument is shown to be able to fail.
 *
 * These nine sentences exist *because* a control's commitment was previously unstated. A note that
 * cannot be read is exactly as good as the absent note it replaced, and it is worse in one respect:
 * the code now believes the thing has been said. They are also the smallest text on their panels —
 * 12 px and 11.5 px, derived below rather than asserted.
 *
 * ## Why `render/theme.test.ts` did not already cover this, although it looks as if it does
 *
 * That file holds `INK_LADDER` — `--text`, `--dim`, `--dimmer`, `--faint` — to 4.5:1 against all
 * five surface tokens in both modes (§ D235). Every ratio this file measures therefore *lands*
 * inside a bound that already exists, and the classes pass. But the claim it checks is about
 * **tokens**, and the 1.03:1 defect was not a token defect: `--dim` was fine, the card it was
 * styled for was fine, and the pairing was wrong. Nothing in the suite connected *this class* to
 * *this ground*, so a rule that changed `.advice` to `var(--fainter)` — a token deliberately
 * exempted there because nothing draws it — or a panel whose background moved to `var(--accent)`
 * would have left every existing contrast test green. This file checks the **pairing**, which is
 * the thing that broke, and it checks it for the class rather than for one note: the classes are
 * shared, so checking the class is checking every future user of it.
 *
 * ## The measurement, taken 2026-08-09 on this branch
 *
 * The ground is the nearest ancestor that declares a background, resolved through the cascade
 * below. All nine notes land on exactly two of them.
 *
 * | class | ink | size | ground | dark | light | AA 4.5:1 |
 * |---|---|---|---|---|---|---|
 * | `.advice` | `--dim` | 12 px | `--card` (`.editor-panel`) | **7.21:1** | **8.25:1** | pass |
 * | `.rail-prose` | `--dimmer` | 11.5 px | `--rail` (`.rail`) | **6.35:1** | **5.92:1** | pass |
 *
 * **The issue's concern is unfounded for both classes, and that is a result rather than an
 * absence.** Nothing was changed to make it so, and no note was moved: § D235 had already raised
 * the ink ladder past 4.5:1 on every surface, and both classes happen to sit on surfaces in that
 * ladder's set. What did not exist was anything that would notice if one of them stopped.
 *
 * Two further pairings are measured, because the classes are shared and the point of checking a
 * class rather than a note is that its future users are covered too:
 *
 * - `#rail-access-note` carries `class="rail-prose warn"`. Every ink any matching rule *proposes*
 *   is held to the bar, not merely the one the cascade elects — `--dimmer` at 6.35 / 5.92 and
 *   `--warn` (an alias of `--band-1`) at 9.27 / 4.83 — so the verdict below does not depend on this
 *   file's re-implementation of the cascade being right about which of the two wins. It is not:
 *   `.warn` is declared far above `.rail-prose` and they tie on specificity, so the browser gives
 *   that paragraph `--dimmer` and the `warn` class changes nothing. Confirmed in the browser tier,
 *   recorded there, and **not** fixed here — a class named `warn` that does not warn is § D227's
 *   stale-refusal shape in a stylesheet and wants an issue of its own, not a silent reorder inside
 *   a contrast lane.
 * - The tenth paragraph the mount sweep finds is `dispatcherEditor.ts`'s own § D227 refusal, a
 *   `.helpful` with an inline `color: var(--warn)` on `--card`: 8.77 / 5.33. It is in because the
 *   sweep is *every paragraph a mount inserts beside a manifest element* rather than *paragraphs in
 *   two named classes*, which is the difference between a derivation and a list.
 *
 * ## Confirmed once against a browser, which is what makes the gate worth having
 *
 * `noteContrast.browser.test.ts` reads the same fifteen paragraphs off the booted page through
 * `getComputedStyle`, with the real cascade and the real tree, in both modes — driven by
 * `colorScheme` emulation so that `themeFor`'s `system` branch and `applyTheme` are the path, not a
 * `data-theme` stamp. It agrees with this file to two decimals on all four figures and finds the
 * same fifteen sites. It skips wherever `ELEVATOR_SIM_CHROMIUM` names no Chromium (§ D220), which
 * is why the gate is here and the confirmation is there.
 *
 * ## Which bar, and why there is no carve-out available
 *
 * WCAG 2.2 AA 1.4.3 asks **4.5:1** for normal text and 3:1 only for *large* text, which is 24 px,
 * or 18.66 px at bold. Both classes are derived below at 12 px and 11.5 px, so neither is large at
 * any weight and the 3:1 carve-out is unavailable to either. {@link LARGE_TEXT_PX} asserts that
 * rather than assuming it: a class that grew past the boundary would turn the size case red and
 * make somebody choose the bar deliberately.
 *
 * This is the *standard*, not `theme.test.ts`'s `FLOOR`. That file keeps a 4.0 no-regression bound
 * for the hue tokens and reserves 4.5 for the ink ladder; these two classes carry prose out of the
 * ink ladder, so the standard is the right bar and no bound was weakened to reach it.
 *
 * ## What this tier can see, and — stated plainly — what it cannot
 *
 * `docs/16` S9: `static sweep < model walk < document recorder < browser`. This file is a static
 * sweep of `index.html`'s stylesheet **joined to** a document-recorder run of the six shipped
 * mounts, and the join is what makes the number real. Concretely:
 *
 * - **Derived, not listed.** The ink token, the font size and the ground all come out of the
 *   stylesheet. The *set of places each class appears* comes from two derivations rather than a
 *   hand-written list of panels — the markup, for the static users, and the shipped mounts driven
 *   through `mountRecorder`, for the nine notes. A hand-written list of three panels passes while a
 *   fourth goes unchecked, and this repository has shipped that shape repeatedly.
 * - **The cascade here is a re-implementation.** It handles comma-separated selector lists,
 *   descendant and child combinators, type/class/id compounds, specificity and source order, and
 *   inline `style`. It does **not** handle pseudo-classes, attribute selectors, `*`, `!important`
 *   or at-rules. Two cases below turn that from a caveat into a check: no skipped rule mentions a
 *   subject class, and no at-rule body declares a `color` or a `background` at all.
 * - **It is not a browser and proves nothing about appearance.** No layout, no compositing, no
 *   `opacity` inherited from an ancestor, no font smoothing. `noteContrast.browser.test.ts` is the
 *   tier that can see those; it reads `getComputedStyle` off the shipped page with the mounts run,
 *   and it skips wherever `ELEVATOR_SIM_CHROMIUM` names no Chromium. The two are deliberately
 *   redundant: this one always runs and is the gate, that one is the confirmation that this one is
 *   reading the same page a player does.
 *
 * ## The controls, because a green derivation is worth nothing on an empty set
 *
 * Three, in the shape wave 12's rule 5 asks for. The derivation is asserted to find a known count
 * of notes in known classes; the resolver is asserted to answer three known pairings, one of which
 * (`.menu-start`) is decided by **source order** rather than specificity and is therefore the case
 * that exercises the part of the cascade this file's answer depends on; and the historical defect
 * is re-derived, so the instrument is shown to be able to fail.
 *
 * They are not ornamental. The first draft of {@link mountedNotes} parented each virtual note one
 * box too high and measured four of the six editor notes against `.sheet`'s `--panel` instead of
 * `.editor-panel`'s `--card` — a different number, a plausible number, and a number about a box the
 * sentence is not drawn on. It passed the 4.5 bar either way. Only the pinned figures caught it,
 * which is the argument for pinning figures beside a gate rather than trusting the gate alone.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { themeFor, type ColorSchemeProbe, type ThemeName } from '../render/theme.js';
import { mountBuildingEditor } from './buildingEditor.js';
import { mountDispatcherEditor } from './dispatcherEditor.js';
import { mountMachinesEditor } from './machinesEditor.js';
import { mountRightRail } from './rightRail.js';
import { mountSelectorEditor } from './selectorEditor.js';
import { mountTrafficEditor } from './trafficEditor.js';
import { mountRecorder, type Recorded } from './mountRecorder.test-helper.js';
import type { MountContext } from './mountTypes.js';

/* -------------------------------------------------------------------------- *
 * The subject
 * -------------------------------------------------------------------------- */

/** The two classes § D309's notes render in — the subject of GitHub issue #124. */
const SUBJECT_CLASSES = ['advice', 'rail-prose'] as const;

/** WCAG 2.2 AA 1.4.3 Contrast (Minimum), normal text. */
const AA_BODY = 4.5;

/**
 * The large-text boundary, in CSS pixels, at the *lighter* of the two thresholds 1.4.3 gives.
 *
 * 1.4.3 calls text large at 18 pt (24 px), or at 14 pt (18.66 px) when it is bold. 18.66 is used
 * here because it is the boundary that admits the 3:1 carve-out **soonest**: a class under it is
 * normal text whatever its weight, so the bar can be chosen without also deriving `font-weight`.
 */
const LARGE_TEXT_PX = 18.66;

const HTML = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');

/* -------------------------------------------------------------------------- *
 * The stylesheet, parsed
 * -------------------------------------------------------------------------- */

interface Compound {
  readonly tag: string;
  readonly id: string;
  readonly classes: readonly string[];
}

interface Selector {
  readonly text: string;
  /** Left to right. `parts[i]` is joined to `parts[i + 1]` by `combinators[i]`. */
  readonly parts: readonly Compound[];
  readonly combinators: readonly ('descendant' | 'child')[];
  readonly specificity: number;
}

interface Rule {
  readonly selectors: readonly Selector[];
  readonly declarations: ReadonlyMap<string, string>;
  readonly order: number;
}

/**
 * Every top-level `selector { … }` in the one `<style>` block, plus the at-rule bodies skipped.
 *
 * Brace-counted rather than regex-matched, because `@media` and `@keyframes` nest and a
 * non-greedy `\{([^}]*)\}` would cut a media block in half and hand back its first inner rule as a
 * top-level one. The at-rules are **returned** rather than discarded so a case below can assert
 * that none of them declares a colour, which is what turns *"at-rules are skipped"* from a caveat
 * into a checked limit.
 */
function parseStylesheet(css: string): { rules: readonly Rule[]; atRuleBodies: readonly string[] } {
  const rules: Rule[] = [];
  const atRuleBodies: string[] = [];
  let at = 0;
  let order = 0;
  while (at < css.length) {
    const open = css.indexOf('{', at);
    if (open < 0) break;
    const prelude = css.slice(at, open).trim();
    let depth = 1;
    let scan = open + 1;
    while (scan < css.length && depth > 0) {
      if (css[scan] === '{') depth += 1;
      else if (css[scan] === '}') depth -= 1;
      scan += 1;
    }
    const body = css.slice(open + 1, scan - 1);
    if (prelude.startsWith('@')) atRuleBodies.push(body);
    else {
      const selectors = prelude
        .split(',')
        .map((piece) => parseSelector(piece.trim()))
        .filter((selector): selector is Selector => selector !== undefined);
      if (selectors.length > 0) {
        rules.push({ selectors, declarations: declarationsIn(body), order });
      }
      order += 1;
    }
    at = scan;
  }
  return { rules, atRuleBodies };
}

/** `prop: value;` pairs. First colon wins, so `url(…)` and `rgb(… / …)` survive intact. */
function declarationsIn(body: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const piece of body.split(';')) {
    const colon = piece.indexOf(':');
    if (colon < 0) continue;
    const property = piece.slice(0, colon).trim();
    const value = piece.slice(colon + 1).trim();
    if (property === '' || value === '') continue;
    found.set(property, value);
  }
  return found;
}

const COMPOUND = /^([a-zA-Z][\w-]*)?((?:[.#][A-Za-z_-][\w-]*)*)$/;

/** One compound, or `undefined` for anything with a pseudo-class, an attribute or a `*` in it. */
function parseCompound(text: string): Compound | undefined {
  const match = COMPOUND.exec(text);
  if (match === null) return undefined;
  const classes: string[] = [];
  let id = '';
  for (const piece of (match[2] ?? '').match(/[.#][A-Za-z_-][\w-]*/g) ?? []) {
    if (piece.startsWith('.')) classes.push(piece.slice(1));
    else id = piece.slice(1);
  }
  return { tag: match[1] ?? '', id, classes };
}

/** One selector, or `undefined` when any part of it is outside what this file resolves. */
function parseSelector(text: string): Selector | undefined {
  if (text === '') return undefined;
  const pieces = text.replace(/\s*>\s*/g, ' > ').split(/\s+/);
  const parts: Compound[] = [];
  const combinators: ('descendant' | 'child')[] = [];
  let pendingChild = false;
  for (const piece of pieces) {
    if (piece === '>') {
      pendingChild = true;
      continue;
    }
    const compound = parseCompound(piece);
    if (compound === undefined) return undefined;
    if (parts.length > 0) combinators.push(pendingChild ? 'child' : 'descendant');
    pendingChild = false;
    parts.push(compound);
  }
  if (parts.length === 0) return undefined;
  const ids = parts.filter((part) => part.id !== '').length;
  const classes = parts.reduce((total, part) => total + part.classes.length, 0);
  const tags = parts.filter((part) => part.tag !== '').length;
  return { text, parts, combinators, specificity: ids * 10_000 + classes * 100 + tags };
}

const STYLE_BLOCK = (/<style>([\s\S]*?)<\/style>/.exec(HTML)?.[1] ?? '').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const { rules: RULES, atRuleBodies: AT_RULE_BODIES } = parseStylesheet(STYLE_BLOCK);

/** Selector text this file declined to parse, so a case below can prove none of it matters here. */
const UNPARSED_SELECTORS: readonly string[] = (() => {
  const skipped: string[] = [];
  let at = 0;
  while (at < STYLE_BLOCK.length) {
    const open = STYLE_BLOCK.indexOf('{', at);
    if (open < 0) break;
    const prelude = STYLE_BLOCK.slice(at, open).trim();
    let depth = 1;
    let scan = open + 1;
    while (scan < STYLE_BLOCK.length && depth > 0) {
      if (STYLE_BLOCK[scan] === '{') depth += 1;
      else if (STYLE_BLOCK[scan] === '}') depth -= 1;
      scan += 1;
    }
    if (!prelude.startsWith('@')) {
      for (const piece of prelude.split(',')) {
        const text = piece.trim();
        if (text !== '' && parseSelector(text) === undefined) skipped.push(text);
      }
    }
    at = scan;
  }
  return skipped;
})();

/* -------------------------------------------------------------------------- *
 * The markup, parsed
 * -------------------------------------------------------------------------- */

interface El {
  readonly tag: string;
  readonly id: string;
  readonly classes: readonly string[];
  readonly inline: ReadonlyMap<string, string>;
  readonly parent: El | null;
  /** A path a failure message can be read from — `div.shell > aside#rail-right.rail`. */
  readonly where: string;
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/**
 * Every element in the body, with a parent pointer.
 *
 * The same technique `elementMap.test.ts` and `dev/tokens.test.ts` use on the same file, for the
 * same reason: no jsdom (`docs/05`), and the markup is the contract. Comments are skipped by the
 * alternation rather than stripped first, so a commented-out `<div>` cannot unbalance the stack.
 */
function parseMarkup(html: string): readonly El[] {
  const body = html.slice(html.indexOf('</style>'));
  const stack: El[] = [];
  const all: El[] = [];
  const tagPattern =
    /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|<!--[\s\S]*?-->/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(body)) !== null) {
    if (match[0].startsWith('<!--')) continue;
    const closing = match[1] === '/';
    const tag = (match[2] ?? '').toLowerCase();
    const attrs = match[3] ?? '';
    if (closing) {
      while (stack.length > 0 && stack[stack.length - 1]?.tag !== tag) stack.pop();
      stack.pop();
      continue;
    }
    const id = /\bid\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? '';
    const classAttr = /\bclass\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? '';
    const styleAttr = /\bstyle\s*=\s*"([^"]*)"/.exec(attrs)?.[1] ?? '';
    const parent = stack[stack.length - 1] ?? null;
    const node: El = {
      tag,
      id,
      classes: classAttr.split(/\s+/).filter((name) => name !== ''),
      inline: declarationsIn(styleAttr),
      parent,
      where: `${parent === null ? '' : `${parent.where} > `}${describe_(tag, id, classAttr)}`,
    };
    all.push(node);
    if (!VOID_TAGS.has(tag) && match[4] !== '/') stack.push(node);
  }
  return all;
}

const describe_ = (tag: string, id: string, classAttr: string): string =>
  `${tag}${id === '' ? '' : `#${id}`}${classAttr === '' ? '' : `.${classAttr.trim().split(/\s+/).join('.')}`}`;

const MARKUP = parseMarkup(HTML);

const byId = (id: string): El => {
  const found = MARKUP.find((node) => node.id === id);
  if (found === undefined) throw new Error(`index.html declares no element with id "${id}"`);
  return found;
};

/* -------------------------------------------------------------------------- *
 * The cascade, as much of it as this file resolves
 * -------------------------------------------------------------------------- */

function matchesCompound(node: El, compound: Compound): boolean {
  if (compound.tag !== '' && compound.tag !== node.tag) return false;
  if (compound.id !== '' && compound.id !== node.id) return false;
  return compound.classes.every((name) => node.classes.includes(name));
}

function matchesFrom(node: El | null, index: number, selector: Selector): boolean {
  if (index < 0) return true;
  const compound = selector.parts[index];
  if (compound === undefined) return true;
  if (selector.combinators[index] === 'child') {
    if (node === null) return false;
    return matchesCompound(node, compound) && matchesFrom(node.parent, index - 1, selector);
  }
  for (let at: El | null = node; at !== null; at = at.parent) {
    if (matchesCompound(at, compound) && matchesFrom(at.parent, index - 1, selector)) return true;
  }
  return false;
}

function matches(node: El, selector: Selector): boolean {
  const last = selector.parts.length - 1;
  const rightmost = selector.parts[last];
  if (rightmost === undefined || !matchesCompound(node, rightmost)) return false;
  return matchesFrom(node.parent, last - 1, selector);
}

interface Proposal {
  readonly value: string;
  readonly from: string;
  readonly weight: number;
}

/**
 * Every value any matching rule proposes for one property on one element, weakest first.
 *
 * *Every* one, and not only the winner, because the ink assertion holds all of them to the bar.
 * A pairing whose verdict depended on this file agreeing with a browser about which rule wins
 * would be a contrast number computed against a guess, which is the failure the whole exercise is
 * about. Inline `style` outranks every rule, which is the one specificity fact that is not a count.
 */
function proposalsFor(node: El, property: string): readonly Proposal[] {
  const found: Proposal[] = [];
  for (const rule of RULES) {
    const value = rule.declarations.get(property);
    if (value === undefined) continue;
    let best: Selector | undefined;
    for (const selector of rule.selectors) {
      if (!matches(node, selector)) continue;
      if (best === undefined || selector.specificity > best.specificity) best = selector;
    }
    if (best === undefined) continue;
    found.push({ value, from: best.text, weight: best.specificity * 1_000_000 + rule.order });
  }
  const inline = node.inline.get(property);
  if (inline !== undefined) {
    found.push({ value: inline, from: `${node.where} [style]`, weight: Number.MAX_SAFE_INTEGER });
  }
  return found.sort((a, b) => a.weight - b.weight);
}

const tokensIn = (value: string): readonly string[] =>
  [...value.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => match[1] as string);

const NOT_A_COLOUR = new Set(['transparent', 'none', 'inherit', 'initial', 'unset']);

/**
 * Which custom properties an element's ink could be, and where each came from.
 *
 * `color` inherits, so an element with no rule of its own takes the nearest ancestor that has one.
 */
function inkTokensOf(node: El): { readonly tokens: readonly string[]; readonly at: El } {
  for (let at: El | null = node; at !== null; at = at.parent) {
    const proposals = proposalsFor(at, 'color');
    const tokens = new Set<string>();
    for (const proposal of proposals) for (const token of tokensIn(proposal.value)) tokens.add(token);
    if (tokens.size > 0) return { tokens: [...tokens], at };
    if (proposals.length > 0) {
      throw new Error(
        `${at.where} sets \`color: ${proposals[proposals.length - 1]?.value ?? ''}\`, which names no ` +
          'custom property. This file measures tokens; a literal here has to be resolved by hand ' +
          'or deleted, and it is red rather than skipped so that nobody reads a green as coverage.',
      );
    }
  }
  throw new Error(`nothing in the ancestor chain of ${node.where} declares a colour`);
}

/**
 * The ground: the nearest ancestor-or-self whose **winning** background is opaque, and every token
 * that background names.
 *
 * The winner rather than every proposal, because a background is a property of one box: measuring
 * against a rule the cascade discarded would be exactly the *"ratio against the wrong background"*
 * this exercise exists to avoid. A gradient contributes every stop it names, because text over a
 * ramp has to clear the bar at both ends. Anything opaque that this file cannot turn into tokens —
 * a `color-mix` over `transparent`, an `rgba` — throws, rather than being walked past: a
 * translucent ground is a real ground and skipping it would silently measure the box behind it.
 */
function groundTokensOf(node: El): { readonly tokens: readonly string[]; readonly at: El } {
  for (let at: El | null = node; at !== null; at = at.parent) {
    const proposals = [...proposalsFor(at, 'background'), ...proposalsFor(at, 'background-color')]
      .sort((a, b) => a.weight - b.weight);
    const winner = proposals[proposals.length - 1];
    if (winner === undefined) continue;
    if (NOT_A_COLOUR.has(winner.value.trim())) continue;
    const tokens = tokensIn(winner.value);
    if (tokens.length === 0) {
      throw new Error(
        `${at.where} draws its background as \`${winner.value}\` (from \`${winner.from}\`), which ` +
          'names no custom property. A ground this file cannot resolve is a ground it must not ' +
          'walk past, so this is red rather than skipped.',
      );
    }
    return { tokens, at };
  }
  throw new Error(`nothing in the ancestor chain of ${node.where} declares a background`);
}

/* -------------------------------------------------------------------------- *
 * The tokens, from the shipped resolver
 * -------------------------------------------------------------------------- */

const NEVER_ASKED: ColorSchemeProbe = (query) => {
  throw new Error(`the probe was asked "${query}" for an explicit choice`);
};

/**
 * `--warn: var(--band-1)` and friends — the aliases `:root` declares and `render/theme.ts` does
 * not carry, because they hold no colour of their own and a theme that restated them would be a
 * second place `--band-1` has to change.
 */
const ALIASES: ReadonlyMap<string, string> = (() => {
  const block = /:root\s*\{([\s\S]*?)\}/.exec(STYLE_BLOCK);
  const found = new Map<string, string>();
  for (const line of (block?.[1] ?? '').split('\n')) {
    const match = /^\s*(--[a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\)\s*;/.exec(line);
    if (match !== null) found.set(match[1] as string, match[2] as string);
  }
  return found;
})();

/**
 * A token's hex in one theme, through `themeFor` — the function `dev/main.ts#applyTheme` calls.
 *
 * Not a second parse of `:root`. `render/theme.test.ts` already pins both palettes to the
 * stylesheet in both directions, so going through the resolver means this file measures the values
 * a player is actually painted with and gains no third copy of a palette.
 */
function hexOf(token: string, theme: ThemeName): string {
  let name = token;
  for (let hops = 0; hops < 4 && ALIASES.has(name); hops += 1) name = ALIASES.get(name) as string;
  const value = themeFor(theme, NEVER_ASKED).tokens[name];
  if (value === undefined) {
    throw new Error(`\`${token}\` resolves to \`${name}\`, which no palette carries`);
  }
  return value;
}

/** WCAG relative luminance of a `#rrggbb`, and the ratio — the same arithmetic as `theme.test.ts`. */
function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const ratio = (ink: string, ground: string, theme: ThemeName): number =>
  contrast(hexOf(ink, theme), hexOf(ground, theme));

/* -------------------------------------------------------------------------- *
 * Where the classes actually appear — derived twice, from two sources
 * -------------------------------------------------------------------------- */

/** One place a subject class is drawn, and how this file came to know about it. */
interface Site {
  readonly className: string;
  readonly node: El;
  /** `markup` for a `<p class="…">` in `index.html`, `mount` for one a shipped mount inserted. */
  readonly origin: 'markup' | 'mount';
  readonly label: string;
}

const inertContext = (): MountContext => ({
  update: () => undefined,
  runShift: () => undefined,
  openTab: () => undefined,
  fail: () => undefined,
});

/**
 * The nine notes, taken off the **shipped mounts** rather than off a list of panels.
 *
 * `mountRecorder` mints one node per manifest id with a parent of its own, so a mount's
 * `anchor.parentElement?.insertBefore(note, anchor)` lands somewhere readable — and the sibling
 * carrying an id is the manifest element the mount named. That id is the join to the markup: the
 * note's ground is whatever the *anchor's parent* sits on, which is a fact the recorder cannot know
 * and `index.html` can.
 *
 * The recorder's own limit applies and is worth restating: it resolves ids without nesting them, so
 * this proves the note was inserted beside the element the mount named, not that the real page
 * nests that element where this file thinks it does. The browser tier is what closes that.
 */
function mountedNotes(): readonly Site[] {
  const made = mountRecorder();
  const context = inertContext();
  mountRightRail(made.elements.rail, context);
  mountDispatcherEditor(made.elements.dispatcherEditor, context);
  mountSelectorEditor(made.elements.selectorEditor, context);
  mountTrafficEditor(made.elements.trafficEditor, context);
  mountMachinesEditor(made.elements.machinesEditor, context);
  mountBuildingEditor(made.elements.buildingEditor, context);

  const sites: Site[] = [];
  for (const node of made.nodes()) {
    if (node.tag !== 'p' || node.id !== '' || node.className === '') continue;
    /*
     * A `<p>` a mount *inserted beside a manifest element*, and not one it merely built. The
     * difference is the whole join: a paragraph created as a child of another created node — the
     * `.helpful` labels the editors assemble, for instance — has no id anywhere in its sibling list,
     * so `index.html` has nothing to resolve it against and this file cannot say what it sits on.
     * Those are skipped rather than guessed at, and the skip is the honest half of the derivation:
     * the notes § D309 added are all of the first kind by construction, because each one is
     * `anchor.parentElement?.insertBefore(note, anchor)` over a manifest id.
     */
    const anchor = (node.parentElement?.children ?? []).find(
      (sibling: Recorded) => sibling.id !== '',
    );
    if (anchor === undefined) continue;
    const host = byId(anchor.id).parent;
    if (host === null) throw new Error(`#${anchor.id} has no parent in index.html`);
    /*
     * `parent: host`, and the emphasis is earned: the first draft of this function spread the host
     * (`{ ...host }`) and so handed the note the host's **own** parent, one box too high. Four of
     * the six editor notes then measured against `.sheet`'s `--panel` instead of
     * `.editor-panel`'s `--card` — different numbers, both plausible, both green against a 4.5
     * bar, and one of them about a box the sentence is not drawn on. That is the *"ratio computed
     * against the wrong background"* this issue names, produced by this file inside an hour of
     * being written, which is why the three resolver controls below exist.
     *
     * The inline declarations come off the recorder rather than being dropped, because a mount
     * that writes `style: { color: 'var(--warn)' }` has set the ink and a virtual node without it
     * would inherit something the reader never sees.
     */
    sites.push({
      className: node.className,
      node: {
        tag: 'p',
        id: '',
        classes: node.className.split(/\s+/).filter((name) => name !== ''),
        inline: new Map(node.props),
        parent: host,
        where: `${host.where} > p.${node.className.trim().split(/\s+/).join('.')}`,
      },
      origin: 'mount',
      label: `<p class="${node.className}"> inserted before #${anchor.id}`,
    });
  }
  return sites;
}

/** A node that no document holds — the two-element chain a resolver control needs. */
function synthetic(tag: string, classAttr: string, parent: El | null): El {
  return {
    tag,
    id: '',
    classes: classAttr.split(/\s+/).filter((name) => name !== ''),
    inline: new Map(),
    parent,
    where: `${parent === null ? '' : `${parent.where} > `}${describe_(tag, '', classAttr)}`,
  };
}

/** Every `<p class="advice">` and `<p class="rail-prose">` `index.html` ships statically. */
function markupSites(): readonly Site[] {
  return MARKUP.filter((node) =>
    SUBJECT_CLASSES.some((name) => node.classes.includes(name)),
  ).map((node) => ({
    className: node.classes.join(' '),
    node,
    origin: 'markup' as const,
    label: node.where.split(' > ').slice(-2).join(' > '),
  }));
}

const SITES: readonly Site[] = [...markupSites(), ...mountedNotes()];

/* -------------------------------------------------------------------------- *
 * 1 — the derivation found something, and found all of it
 * -------------------------------------------------------------------------- */

describe('the places these classes are drawn are derived, not listed', () => {
  it('finds every static user in the markup and every note in the mounts', () => {
    /*
     * The positive control. Without it every assertion below could pass on an empty set — the
     * silent-instrument shape wave 12's rule 5 forbids, and the one this repository has been caught
     * by. The counts are the shipped page's: six static paragraphs (two `.advice`, four
     * `.rail-prose`) and the nine notes § D309 added.
     */
    const markup = SITES.filter((site) => site.origin === 'markup');
    const notes = SITES.filter(
      (site) => site.origin === 'mount' && SUBJECT_CLASSES.some((n) => site.node.classes.includes(n)),
    );
    expect(markup.length, 'no static user of either class was found').toBe(6);
    expect(notes, 'the mounts inserted a different number of notes than § D309 added').toHaveLength(
      9,
    );
    expect(MARKUP.length).toBeGreaterThan(500);
    expect(RULES.length).toBeGreaterThan(100);
  });

  it('measures every paragraph a mount inserts, not only the two classes the issue names', () => {
    /*
     * The derivation guard, and it is deliberately wider than the subject. The issue asks about two
     * classes; a check that filtered to two class names would go green on the day a mount inserted
     * a note in a third, which is the hand-written-list shape this repository has shipped
     * repeatedly. So the set is *every `<p>` a mount inserted beside a manifest element*, whatever
     * class it carries, and the classes are read off the result rather than into it.
     *
     * Today that is ten paragraphs rather than nine: `dispatcherEditor.ts`'s § D227 refusal is a
     * `.helpful` with an inline `color: var(--warn)`, and it is measured beside the notes on the
     * same ground. `.helpful` paragraphs a mount builds as children of its own nodes are **not**
     * here — no manifest id in their sibling list means `index.html` has nothing to resolve them
     * against — and that is a limit rather than an oversight; the browser tier is where they can be
     * reached.
     */
    const mounted = SITES.filter((site) => site.origin === 'mount');
    const classes = new Set(mounted.flatMap((site) => site.node.classes));
    expect(mounted.length, 'the mount sweep found fewer paragraphs than § D309 alone added').toBeGreaterThanOrEqual(
      10,
    );
    for (const name of SUBJECT_CLASSES) expect([...classes]).toContain(name);
  });

  it('lands them all on grounds the stylesheet names, and on only two of them', () => {
    // Stated as a fact rather than assumed by the table above: every site resolves to `--rail` or
    // `--card`. A note that moved onto a third surface is a pairing nobody has looked at, and it is
    // worth being loud about even though the case below would measure it anyway.
    const grounds = new Set(SITES.flatMap((site) => groundTokensOf(site.node).tokens));
    expect([...grounds].sort()).toEqual(['--card', '--rail']);
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — the resolver answers known pairings, including one source order decides
 * -------------------------------------------------------------------------- */

describe('the cascade this file re-implements answers pairings whose answer is known', () => {
  it('reads `.rail` as `--rail` and `.editor-panel` as `--card`', () => {
    expect(groundTokensOf(byId('rail-right')).tokens).toEqual(['--rail']);
    const panel = MARKUP.find((node) => node.classes.includes('editor-panel'));
    expect(panel, 'index.html ships no `.editor-panel`').toBeDefined();
    expect(groundTokensOf(panel as El).tokens).toEqual(['--card']);
  });

  it('lets source order decide where specificity ties — the `.menu-start` case', () => {
    /*
     * The control that matters, because every answer above rests on it. `.menu-start` is given
     * `background: var(--card)` in a five-selector list and `background: var(--accent)` on its own
     * line further down; both are one class, so the *later* rule wins and the button is blue. A
     * resolver that took the first match, or the shortest selector, would say `--card` here and
     * would go on to say something confident and wrong about `.advice` on a panel.
     *
     * Built rather than found: the menu is `menu/screens.ts`'s and `dev/menuPanel.ts` draws it, so
     * `index.html` ships no `.menu-start` to point at. A control is allowed to name its own subject
     * — the *answer* is still the stylesheet's — and this one is here precisely because the answer
     * is known independently: `§ D235` and `menuPanel.test.ts` both say the button is the accent.
     */
    expect(groundTokensOf(synthetic('button', 'menu-start', null)).tokens).toEqual(['--accent']);
    expect(groundTokensOf(synthetic('button', 'menu-row', null)).tokens).toEqual(['--card']);
  });

  it('follows a descendant selector, so the § D235 override is visible to it', () => {
    // `.menu-start .menu-row-detail { color: var(--accent-ink) }` is two compounds and the only
    // reason the refusal under a disabled Start is legible. A resolver blind to descendants would
    // report `--dim` here and would "measure" a defect that was fixed in wave 11.
    const onAccent = synthetic(
      'span',
      'menu-row-detail',
      synthetic('button', 'menu-start', null),
    );
    const onCard = synthetic('span', 'menu-row-detail', synthetic('button', 'menu-row', null));
    expect(inkTokensOf(onAccent).tokens).toContain('--accent-ink');
    expect(inkTokensOf(onCard).tokens).toEqual(['--dim']);
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — the deliverable: a number per class, per theme, per ground
 * -------------------------------------------------------------------------- */

describe('the change-scope notes clear WCAG 2.2 AA where they are actually drawn', () => {
  it('is normal text at every site, so 4.5:1 is the bar and 3:1 is unavailable', () => {
    /*
     * Derived rather than assumed. 1.4.3's 3:1 carve-out is for large text only, and both classes
     * are far under the boundary — 12 px and 11.5 px, the smallest text on their panels. If a class
     * ever grows past {@link LARGE_TEXT_PX} this goes red and somebody has to choose the bar on
     * purpose instead of inheriting it from a docstring.
     */
    const sizes = new Map<string, number>();
    for (const name of SUBJECT_CLASSES) {
      const site = SITES.find((candidate) => candidate.node.classes.includes(name));
      expect(site, `no site draws .${name}`).toBeDefined();
      let found: number | undefined;
      for (let at: El | null = (site as Site).node; at !== null && found === undefined; at = at.parent) {
        const proposals = [...proposalsFor(at, 'font-size'), ...proposalsFor(at, 'font')].sort(
          (a, b) => a.weight - b.weight,
        );
        const winner = proposals[proposals.length - 1];
        const px = winner === undefined ? null : /(\d+(?:\.\d+)?)px/.exec(winner.value);
        if (px !== null) found = Number(px[1]);
      }
      expect(found, `.${name} has no resolvable font size`).toBeDefined();
      sizes.set(name, found as number);
      expect(found as number, `.${name} is large text; reconsider the bar`).toBeLessThan(
        LARGE_TEXT_PX,
      );
    }
    // The figures the docstring's table publishes, pinned so the table cannot go stale in silence.
    expect(sizes.get('advice')).toBe(12);
    expect(sizes.get('rail-prose')).toBe(11.5);
  });

  it(`holds every ink any rule proposes to ${String(AA_BODY)}:1 on the ground it sits on, in both themes`, () => {
    /*
     * **The deliverable.** Fifteen sites × every candidate ink × every ground stop × two themes,
     * and each cell is a real ratio between two hex triples the shipped resolver hands out.
     *
     * *Every ink a rule proposes*, not only the elected one, and the reason is `#rail-access-note`:
     * it carries `class="rail-prose warn"`, `.warn` sets `--warn` and `.rail-prose` sets `--dimmer`,
     * the two tie on specificity and `.rail-prose` is declared later. So the cascade elects
     * `--dimmer` — and if this file has that backwards, the verdict must not move. Holding the loser
     * to the bar as well costs one loop and removes the re-implementation from the answer.
     */
    const failures: string[] = [];
    for (const site of SITES) {
      const ink = inkTokensOf(site.node);
      const ground = groundTokensOf(site.node);
      for (const theme of ['dark', 'light'] as const) {
        for (const token of ink.tokens) {
          for (const surface of ground.tokens) {
            const measured = ratio(token, surface, theme);
            if (measured >= AA_BODY) continue;
            failures.push(
              `${theme}: ${token} on ${surface} is ${measured.toFixed(2)}:1 at ${site.label}`,
            );
          }
        }
      }
    }
    expect(failures, 'these notes are drawn below AA on the surface they sit on').toEqual([]);
  });

  it('publishes the four figures the docstring quotes, so the table cannot rot', () => {
    /*
     * The bound above is a gate and says nothing about *where* the pairings sit. These four are the
     * table, re-derived: a change that moved `.advice` from 7.21 to 4.6 would keep the gate green
     * and would be a real loss of headroom on the smallest text on the panel. Pinned to two
     * decimals, which is the precision the table prints.
     */
    const at = (name: string, theme: ThemeName): number => {
      const site = SITES.find(
        (candidate) => candidate.node.classes.join(' ') === name && candidate.origin === 'mount',
      );
      expect(site, `no mounted note is drawn in exactly .${name}`).toBeDefined();
      const ink = inkTokensOf((site as Site).node).tokens;
      const ground = groundTokensOf((site as Site).node).tokens;
      expect(ink).toHaveLength(1);
      expect(ground).toHaveLength(1);
      return Number(ratio(ink[0] as string, ground[0] as string, theme).toFixed(2));
    };
    expect(at('advice', 'dark')).toBe(7.21);
    expect(at('advice', 'light')).toBe(8.25);
    expect(at('rail-prose', 'dark')).toBe(6.35);
    expect(at('rail-prose', 'light')).toBe(5.92);
  });

  it('negative control: re-derives the 1.03:1 pairing `menuPanel.test.ts` records', () => {
    /*
     * A gate that cannot fail is a description. This is the historical defect run back through the
     * instrument: `.menu-row-detail`'s own rule is `var(--dim)`, `.menu-start`'s ground is
     * `var(--accent)`, and that pairing is far under the bar in both themes. The **1.03** and
     * **1.46** `index.html` and `menuPanel.test.ts` both quote were measured against the
     * pre-§ D235 `--dim` (`#8b98a9`); on today's raised ladder the same pairing is **1.16** and
     * **1.66**, which is what this asserts. Either way it is a failure, and the point is that this
     * file would have said so before a player did.
     *
     * The token is read out of the stylesheet's own base rule rather than named here, so the
     * control tracks `.menu-row-detail` if it moves.
     */
    const onCard = synthetic('span', 'menu-row-detail', synthetic('button', 'menu-row', null));
    const cardInk = inkTokensOf(onCard).tokens;
    expect(cardInk).toEqual(['--dim']);
    const accent = groundTokensOf(synthetic('button', 'menu-start', null)).tokens[0] as string;
    expect(Number(ratio('--dim', accent, 'dark').toFixed(2))).toBe(1.16);
    expect(Number(ratio('--dim', accent, 'light').toFixed(2))).toBe(1.66);
    for (const theme of ['dark', 'light'] as const) {
      expect(ratio('--dim', accent, theme), `${theme}: the control passed the bar`).toBeLessThan(
        AA_BODY,
      );
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — the stated limits, turned into checks
 * -------------------------------------------------------------------------- */

describe('what this tier cannot see is bounded rather than merely disclaimed', () => {
  it('skips no selector that could decide one of these pairings', () => {
    /*
     * Pseudo-classes, attribute selectors and `*` are not resolved here, and a caveat that says so
     * is worth nothing on its own — the skipped set could grow a rule about `.advice` tomorrow. So
     * the set is enumerated and asserted to mention neither subject class, and to stay small enough
     * that a reader can look at it. `:hover` and `[hidden]` may do what they like.
     */
    expect(UNPARSED_SELECTORS.length, 'the skipped set should be a tail, not the stylesheet').toBeLessThan(
      RULES.length,
    );
    const touching = UNPARSED_SELECTORS.filter((selector) =>
      SUBJECT_CLASSES.some((name) => selector.includes(`.${name}`)),
    );
    expect(
      touching,
      'a selector this file cannot parse names one of the note classes, so the ratios above may ' +
        'be measuring a rule the browser overrides',
    ).toEqual([]);
  });

  it('sees no colour or background hidden inside an at-rule', () => {
    /*
     * `@media` and `@keyframes` bodies are skipped wholesale. Today none of them declares a `color`
     * or a `background` — the responsive blocks move grid tracks and the two keyframes animate
     * `opacity` and `transform` — so the skip costs nothing. The day one does, this is red and the
     * ratios above stop being the whole story before anybody trusts them.
     */
    const offending = AT_RULE_BODIES.filter((body) =>
      /(^|[;{\s])(color|background(-color)?)\s*:/.test(body),
    );
    expect(AT_RULE_BODIES.length, 'no at-rule was found at all, so this control is inert').toBeGreaterThan(
      5,
    );
    expect(offending, 'an at-rule repaints something, and this file does not read at-rules').toEqual(
      [],
    );
  });

  it('measures no site whose ground it had to guess', () => {
    // `groundTokensOf` throws on an opaque background it cannot turn into tokens rather than
    // walking past it, so this is the assertion that the throw never fired quietly. Stated as its
    // own case because the alternative — a `try` that skipped — is the shape that produces a green
    // test over an unmeasured surface.
    for (const site of SITES) {
      expect(() => groundTokensOf(site.node), site.label).not.toThrow();
      expect(() => inkTokensOf(site.node), site.label).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 5 — an ink decided by source order rather than by intent — GitHub issue #143
 * -------------------------------------------------------------------------- */

/**
 * **Two rules of equal specificity proposing different inks for one element is an accident, and
 * this is where an accident becomes a red test.**
 *
 * A `DECISIONS.md` number is **owed** for this section and for the `.rail-prose.warn` rule it
 * guards; the argument is here and in `index.html` rather than only in a commit message, per this
 * repository's working agreement.
 *
 * ## The finding
 *
 * `#rail-access-note` is authored `class="rail-prose warn"`. `.warn { color: var(--warn) }` is
 * declared at index.html:480 and `.rail-prose { … color: var(--dimmer) }` some four hundred lines
 * below it. Both are single-class selectors, so they tie at (0,1,0), and the later rule takes it:
 * the paragraph docs/10 § 10.3 calls *the dispatcher compatibility warning* rendered as ordinary
 * dim prose. Confirmed in a real browser — `noteContrast.browser.test.ts` read `rgb(139, 152, 169)`
 * off the element before the fix.
 *
 * **It was never a contrast defect**, which is why the lane that found it recorded it instead of
 * fixing it: both candidate inks clear AA on `--rail` (`--dimmer` 6.35 dark / 5.92 light, `--warn`
 * 9.27 / 4.83). Nothing was unreadable. What was wrong is that the markup claimed a register the
 * screen did not deliver — § D227's stale-refusal shape, living in a stylesheet instead of a
 * docstring — and the editor's counterpart `#ed-access-note`, which carries `warn` **alone** and so
 * had nothing to tie with, had been rendering the same sentence in `--warn` the whole time. One
 * fact, the two surfaces § 10.3 requires, two registers.
 *
 * ## Why the check is general and not a pin on that one element
 *
 * Pinning `#rail-access-note`'s ink would assert the fix and leave the mechanism: `.warn` is early
 * in a stylesheet with **eighty** single-class rules that set `color`, so it loses to any of them a
 * future element pairs it with, silently, and looking exactly like a class that is doing something.
 *
 * So the property asserted is *no element's ink is decided by source order between rules that
 * disagree*. A tie at equal specificity where both rules propose the **same** value is harmless and
 * allowed. A tie where they disagree must be settled by a compound selector that outranks both —
 * which is a statement of intent a reader can see, rather than a consequence of where somebody
 * happened to paste a rule.
 *
 * Swept over the whole shipped markup rather than a list of ids, so the day a second element pairs
 * two disagreeing classes it is red on that commit. Today exactly one element carries two
 * colour-setting classes at all, and after the `.rail-prose.warn` rule its winner is a compound.
 */
describe('no element’s ink is decided by source order between rules that disagree', () => {
  /** Every element in the shipped markup whose `color` has more than one proposal. */
  const contested = MARKUP.map((node) => ({ node, proposals: proposalsFor(node, 'color') })).filter(
    (entry) => entry.proposals.length > 1,
  );

  it('finds the contested elements by sweeping the markup, not by naming them', () => {
    // The control on the sweep itself. A parse that matched nothing would make every assertion
    // below vacuously true — the failure mode this repository calls a measured null.
    expect(contested.length, 'no element has a contested colour, so this whole section is inert')
      .toBeGreaterThan(0);
  });

  it('settles every disagreement between different selectors with one that outranks the tie', () => {
    /*
     * ## The discriminator, and it was found by the check going red on a rule that is correct
     *
     * The first draft asserted that *no* tie may decide an ink, and `#copy-cli` failed it: the
     * footer declares `#copy-run, #copy-cli { color: var(--dim) }` and then `#copy-cli { color:
     * var(--dimmer) }` a few lines below, with a comment saying why — *"the CLI line … is a step
     * quieter rather than a second primary"* (issue #118 § 2). That is the ordinary override, and
     * source order is exactly the mechanism it is supposed to use.
     *
     * So the property is narrower than *no tie*, and the line is **whether the two rules name the
     * same subject**:
     *
     * - **Same selector text** — the later rule can only have been written to override the earlier
     *   one. You do not write `#copy-cli` twice by accident, and CSS's later-wins rule is the tool
     *   being used on purpose. Allowed.
     * - **Different selector texts** — neither rule mentions the other, so which one wins is
     *   decided by their relative position in a 3 000-line file. `.warn` and `.rail-prose` are the
     *   case: two independent registers that happen to meet on one element, and the outcome is
     *   wherever somebody pasted a rule. Must be settled explicitly.
     *
     * That distinction is a judgement, and it is written here rather than assumed so the next
     * reader can disagree with it in one place.
     */
    for (const { node, proposals } of contested) {
      /*
       * `proposalsFor` returns weakest first and weights specificity above source order, as
       * `specificity * 1_000_000 + order` — so equal specificity means the two weights agree in
       * their millions component, and the last two entries are the decision.
       */
      const winner = proposals.at(-1);
      const runnerUp = proposals.at(-2);
      if (winner === undefined || runnerUp === undefined) continue;

      const tied = Math.floor(winner.weight / 1_000_000) === Math.floor(runnerUp.weight / 1_000_000);
      if (!tied || winner.from === runnerUp.from) continue;
      expect(
        runnerUp.value,
        `${node.where} takes its colour from “${winner.from}” only because that rule is declared ` +
          `after “${runnerUp.from}”; the two name different subjects, propose different inks and ` +
          'tie on specificity, so the winner is where somebody pasted a rule rather than what ' +
          'anybody decided. Settle it with a compound selector naming both.',
      ).toBe(winner.value);
    }
  });

  it('still allows a same-selector override, and `#copy-cli` is the one that proves it', () => {
    // The negative control on the discriminator above. Without this, narrowing the rule to
    // *different selectors* could be quietly widened back to *nothing* and the section would still
    // be green — a check that exempts everything looks exactly like a check that finds nothing.
    const cli = proposalsFor(byId('copy-cli'), 'color');
    expect(cli.length, '#copy-cli no longer has two colour proposals').toBeGreaterThan(1);
    expect(cli.at(-1)?.from).toBe(cli.at(-2)?.from);
    expect(cli.at(-1)?.value).not.toBe(cli.at(-2)?.value);
  });

  it('gives `#rail-access-note` the warning register, by a rule that beats both singles', () => {
    /*
     * The specific case, kept beside the general rule because the general rule would also be
     * satisfied by *deleting* `warn` from the markup — and that was the live alternative. It is
     * rejected on evidence rather than taste: docs/10 § 10.3 titles this "the dispatcher
     * compatibility **warning**" and calls it "a warning rather than a block",
     * `access/dispatcherCredentials.ts#checkAccessCompatibility` returns it in a field named
     * `warning`, and the editor already draws it in `--warn`.
     *
     * `role="status"` is **not** evidence for the quieter reading, which is the trap here. The role
     * governs how an assistive technology interrupts; the class governs the register the sentence
     * reads in. Choosing `status` over `alert` says the note must not barge in — Run stays enabled,
     * ED-15 — and says nothing about what colour it should be.
     */
    const note = byId('rail-access-note');
    expect(note.classes).toContain('warn');

    /*
     * The **elected** ink, which is `proposalsFor`'s last entry. `inkTokensOf` deliberately reports
     * every ink any matching rule proposes — `['--warn', '--dimmer']` here, and it still is, because
     * the losing rules have not gone anywhere — since the contrast assertions hold all of them to
     * the bar rather than trusting this file's cascade to pick the winner. That is the right answer
     * for a contrast question and the wrong one for this question, which is precisely *which rule
     * won*.
     */
    const winner = proposalsFor(note, 'color').at(-1);
    expect(winner?.value).toBe('var(--warn)');
    expect(winner?.from, 'the warning register is back to depending on source order').toBe(
      '.rail-prose.warn',
    );

    // And the register it now reads in is still legible on the rail, in both themes — the thing
    // that was true before the fix and had to stay true after it.
    for (const theme of ['dark', 'light'] as const) {
      expect(ratio('--warn', '--rail', theme), `--warn on --rail, ${theme}`).toBeGreaterThanOrEqual(
        AA_BODY,
      );
    }
  });

  it('leaves the editor’s counterpart alone, and says why it never needed the fix', () => {
    // `#ed-access-note` carries `warn` and nothing else that sets a colour, so it had no tie to
    // lose and has always drawn in the warning register. Asserted so that a future edit adding a
    // second class to it — the exact way the rail note got into this state — is red here.
    const editorNote = byId('ed-access-note');
    expect(editorNote.classes).toEqual(['warn']);
    expect(inkTokensOf(editorNote).tokens).toEqual(['--warn']);
  });
});
