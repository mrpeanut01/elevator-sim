/**
 * The credential lens, **drawn** — `docs/10-experience-layer-contract.md` § 10.1.
 *
 * `zoning.test.ts` proves the states are computed correctly. This file proves they reach the
 * picture as three different marks, and — the assertion that actually matters — that a reader
 * with no colour still gets all three. `D18` split `KB-15` for exactly this reason: a claim of
 * three redundant signals that ships one.
 *
 * The context is a stub that records `fillStyle` on every call, so *"remove the colour"* is a
 * mechanical operation here rather than a squint at a screenshot.
 */

import { describe, expect, it } from 'vitest';

import {
  STATE_GLYPHS,
  STATE_WORDS,
  credentialLensFor,
  type CredentialLens,
} from '../access/zoning.js';
import type { VizFloor } from '../contract/types.js';
import type { PreviewGeometry } from '../editor/editorPreview.js';
import { DEFAULT_THEME, type Canvas2DLike } from './canvas.js';
import { buildLayout } from './layout.js';
import { describePreview, drawPreview } from './preview.js';

/** A 2D context that records what was drawn, and in what colour. */
class Recorder implements Canvas2DLike {
  readonly texts: { text: string; x: number; y: number; fill: string }[] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  font = '';
  textAlign: Canvas2DLike['textAlign'] = 'start';
  textBaseline: Canvas2DLike['textBaseline'] = 'alphabetic';
  globalAlpha = 1;

  save(): void {}
  restore(): void {}
  clearRect(): void {}
  fillRect(): void {}
  strokeRect(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
  fillText(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y, fill: this.fillStyle });
  }

  /** Everything drawn, with the colour thrown away. The greyscale printout. */
  get colourless(): readonly string[] {
    return this.texts.map((entry) => entry.text);
  }
}

/*
 * A building with one of each failure, which no shipped building has: `RV-08` records that no
 * shipped building has an unserved floor, and the access case only arises on Secure Tower. The
 * lens has to draw both at once, so the fixture is the one place both exist.
 */
const FLOORS: readonly VizFloor[] = [
  { id: 'G', index: 0, heightM: 0, isEntrance: true, isTransferFloor: false, population: 0 },
  { id: '2', index: 1, heightM: 3, isEntrance: false, isTransferFloor: false, population: 10 },
  { id: '3', index: 2, heightM: 6, isEntrance: false, isTransferFloor: false, population: 10 },
];

const GEOMETRY: PreviewGeometry = {
  floors: FLOORS,
  shafts: [{ carId: 'a-A', bankId: 'a', label: 'A', servedFloorIds: ['G', '2'] }],
  unservedFloorIds: ['3'],
  expansion: '3 floors, G … 3',
};

const ACCESS_ZONES = [{ id: 'z', floors: ['2'], credentialGroups: ['staff'] }];

function lensFor(group: string): CredentialLens {
  return credentialLensFor({
    floors: GEOMETRY.floors,
    shafts: GEOMETRY.shafts,
    accessZones: ACCESS_ZONES,
    credentialGroup: group,
  });
}

function draw(lens?: CredentialLens | undefined): Recorder {
  const ctx = new Recorder();
  drawPreview(ctx, {
    geometry: GEOMETRY,
    layout: buildLayout({ width: 900, height: 640, floors: GEOMETRY.floors, shafts: GEOMETRY.shafts }),
    title: 'Fixture — preview (no run)',
    theme: DEFAULT_THEME,
    lens,
  });
  return ctx;
}

describe('the lens is a mode, not a second picture', () => {
  it('draws exactly what it drew before when no credential is selected', () => {
    const off = draw(undefined).colourless.join('\n');
    expect(off).toContain(' ⊘'); // the pre-existing unserved mark, unchanged
    expect(off).not.toContain(STATE_GLYPHS['not-permitted']);
    expect(off).not.toContain('credential lens');
  });
});

describe('not served and not permitted are different marks', () => {
  const ctx = draw(lensFor('visitor'));
  const drawn = ctx.colourless.join('\n');

  it('draws a distinct glyph for each of the three states', () => {
    for (const glyph of Object.values(STATE_GLYPHS)) expect(drawn).toContain(glyph);
  });

  it('puts the word beside the glyph, so the distinction survives the colour being removed', () => {
    // The whole assertion: with every `fillStyle` discarded, both failures are still readable
    // *and* still tell apart. If the renderer ever leaned on colour alone this goes red.
    expect(drawn).toContain(STATE_WORDS['not-served']);
    expect(drawn).toContain(STATE_WORDS['not-permitted']);
    expect(STATE_WORDS['not-served']).not.toBe(STATE_WORDS['not-permitted']);
  });

  it('marks the right floor with the right barrier', () => {
    // Floor 3 has no shaft; floor 2 has one and this credential does not open it. The gutter
    // label is `<floor> <glyph>`, so the pairing is asserted as a whole string rather than by
    // finding a glyph anywhere on the canvas.
    expect(ctx.colourless).toContain(`3 ${STATE_GLYPHS['not-served']}`);
    expect(ctx.colourless).toContain(`2 ${STATE_GLYPHS['not-permitted']}`);
    expect(ctx.colourless).toContain(`⌂ G ${STATE_GLYPHS.reachable}`);
  });

  it('never draws the same glyph for the two failures', () => {
    expect(STATE_GLYPHS['not-served']).not.toBe(STATE_GLYPHS['not-permitted']);
    const marks = ctx.texts.filter(
      (entry) =>
        entry.text.includes(STATE_GLYPHS['not-served']) ||
        entry.text.includes(STATE_GLYPHS['not-permitted']),
    );
    expect(new Set(marks.map((entry) => entry.fill)).size).toBeGreaterThan(1);
  });

  it('draws a legend row per state, naming the zoning that produced it', () => {
    expect(drawn).toContain('(service zoning)');
    expect(drawn).toContain('(access zoning)');
    expect(drawn).toContain('credential lens: visitor');
    expect(drawn).toContain('operational zoning is a dispatcher setting');
  });
});

describe('the text alternative carries the lens', () => {
  it('names both barriers when the lens is on, and neither when it is off', () => {
    const withLens = describePreview(GEOMETRY, lensFor('visitor'));
    expect(withLens).toContain('service zoning');
    expect(withLens).toContain('access zoning');
    expect(describePreview(GEOMETRY)).not.toContain('access zoning');
  });
});
