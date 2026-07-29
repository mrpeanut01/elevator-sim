/**
 * The editor's preview renderer: a building drawn from geometry alone, with **no run**.
 *
 * Separate from `drawScene` rather than a mode of it, because the two draw genuinely different
 * things. `drawScene` needs a {@link Frame} — cars at analytic heights, doors part-open, landing
 * queues — and none of that exists for a building nobody has simulated. Threading an
 * "is there a run?" flag through every one of `drawScene`'s six passes would produce a function
 * half of whose branches are unreachable in each of its two uses.
 *
 * What it draws is the four things `UX.md` § 4 says the editor edits: floors, banks, cars (as
 * shafts) and **service** zoning — a shaft covering only the floors its bank serves.
 *
 * ## The credential lens — `docs/10-experience-layer-contract.md` § 10.1
 *
 * The sentence above used to end *"access zoning is a credential fact and is listed in the form,
 * never drawn as geometry"*, and that was the defect § 10.1 named: prose in a form is the weakest
 * way to teach that service zoning and access zoning are different things, because a reader skims
 * it. So the preview gains a **mode**, not a second picture: pick a credential group and every
 * floor label carries one of three glyphs — reachable, not served, not permitted — with three
 * legend rows and one sentence each.
 *
 * The lens is a mode rather than a permanent overlay because *"not permitted"* is meaningless
 * without a credential to be un-permitted for, and the building has no default one. With no
 * credential selected the preview draws exactly what it drew before.
 *
 * Operational zoning is still not drawn, and now says so: it is a dispatcher weight vector, not
 * building geometry, so there is no floor state it could produce (see `access/zoning.ts`'s
 * `LENS_OPERATIONAL_NOTE` and `editorEdits.ts`).
 */

import type { CredentialLens } from '../access/zoning.js';
import { LENS_LEGEND, STATE_GLYPHS, STATE_WORDS, describeCredentialLens } from '../access/zoning.js';
import type { PreviewGeometry } from '../editor/editorPreview.js';
import type { Canvas2DLike, Theme } from './canvas.js';
import { DEFAULT_THEME, fitLabel } from './canvas.js';
import type { Layout } from './layout.js';

const FONT = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT_BOLD = 'bold 14px ui-monospace, SFMono-Regular, Menlo, monospace';

export interface PreviewInput {
  readonly geometry: PreviewGeometry;
  readonly layout: Layout;
  readonly title: string;
  readonly theme?: Theme;
  /** Shown under the title. The validity summary, so the picture and the verdict travel together. */
  readonly caption?: string | undefined;
  /**
   * The credential lens, when the reader has picked a credential group. Omitted, the preview is
   * exactly what it was before this mode existed.
   */
  readonly lens?: CredentialLens | undefined;
}

export function drawPreview(ctx: Canvas2DLike, input: PreviewInput): void {
  const { geometry, layout, title } = input;
  const theme = input.theme ?? DEFAULT_THEME;

  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = FONT_BOLD;
  ctx.fillStyle = theme.text;
  ctx.fillText(title, 12, layout.header.titleY);

  ctx.font = FONT;
  ctx.fillStyle = theme.textDim;
  ctx.fillText(input.caption ?? geometry.expansion, 12, layout.header.metaY);

  if (geometry.floors.length === 0) {
    // The editor's empty state, drawn rather than left as a black rectangle (UX.md § C.3).
    ctx.font = FONT;
    ctx.fillStyle = theme.textDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'no floors yet — add a floor or a floor range to see the building',
      layout.width / 2,
      layout.height / 2,
    );
    ctx.restore();
    return;
  }

  const unserved = new Set(geometry.unservedFloorIds);
  const lensByFloor = new Map((input.lens?.rows ?? []).map((row) => [row.floorId, row]));

  ctx.font = FONT;
  ctx.textBaseline = 'middle';
  for (const row of layout.rows) {
    ctx.strokeStyle = theme.floorLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layout.plot.x, row.y);
    ctx.lineTo(layout.plot.x + layout.plot.width, row.y);
    ctx.stroke();

    if (!row.labelled) continue;
    ctx.textAlign = 'right';
    const badge = row.isTransferFloor ? '⇄ ' : row.isEntrance ? '⌂ ' : '';
    // With the lens on, the state glyph replaces the bare `⊘` — and it *includes* `⊘`, because
    // `not-served` is the same fact under the same spelling. Off, nothing changes.
    const lensRow = lensByFloor.get(row.floorId);
    const mark =
      lensRow !== undefined
        ? ` ${STATE_GLYPHS[lensRow.state]}`
        : unserved.has(row.floorId)
          ? ' ⊘'
          : '';
    ctx.fillStyle =
      lensRow !== undefined
        ? lensRow.state === 'reachable'
          ? theme.text
          : lensRow.state === 'not-served'
            ? theme.restricted
            : theme.warning
        : mark !== ''
          ? theme.restricted
          : badge === ''
            ? theme.textDim
            : theme.badge;
    const budget = layout.plot.x - 8 - (badge.length + mark.length) * 8;
    ctx.fillText(`${badge}${fitLabel(row.label, budget)}${mark}`, layout.plot.x - 8, row.y);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.textDim;
    // The word beside the height, so the state survives a font with no `▩` in it and a printout
    // with no colour in it. `D18`'s rule — never one signal — applied to zoning.
    const word = lensRow === undefined ? '' : `  ${STATE_WORDS[lensRow.state]}`;
    ctx.fillText(
      `${row.heightM.toFixed(1)} m${word}`,
      layout.plot.x + layout.plot.width + 10,
      row.y,
    );
  }

  const servedById = new Map(
    geometry.shafts.map((shaft) => [shaft.carId, new Set(shaft.servedFloorIds)]),
  );
  for (const column of layout.columns) {
    const served = servedById.get(column.carId);
    const rows = layout.rows.filter((row) => served === undefined || served.has(row.floorId));
    if (rows.length === 0) continue;
    const top = rows.reduce((min, row) => Math.min(min, row.y), Number.POSITIVE_INFINITY);
    const bottom = rows.reduce((max, row) => Math.max(max, row.y), Number.NEGATIVE_INFINITY);
    ctx.fillStyle = theme.shaft;
    ctx.fillRect(column.x, top, column.width, Math.max(1, bottom - top));
    ctx.strokeStyle = theme.shaftEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(column.x, top, column.width, Math.max(1, bottom - top));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = theme.textDim;
    // Both rows come from the layout's header band, so the preview and the run viewer cannot
    // drift apart about where a bank label goes — `render/layout.ts`'s {@link HeaderBand}.
    ctx.fillText(column.label, column.centreX, layout.header.shaftY);
    ctx.fillStyle = theme.badge;
    ctx.fillText(column.bankId, column.centreX, layout.header.bankY);
  }

  drawLensLegend(ctx, input, theme);

  if (layout.hiddenShaftCount > 0) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = FONT;
    ctx.fillStyle = theme.warning;
    ctx.fillText(
      `showing ${String(layout.columns.length)} of ${String(layout.columns.length + layout.hiddenShaftCount)} shafts`,
      layout.plot.x,
      layout.header.noticeY,
    );
  }

  ctx.restore();
}

/**
 * § 10.1's *"three states, three glyphs, three legend rows, one sentence each"*, drawn.
 *
 * Bottom-left, above the shaft-count note, and only with the lens on. Every row carries its
 * glyph **and** its word **and** the kind of zoning that produced it, because a legend that
 * only decoded colours would be the thing the lens exists to replace.
 */
function drawLensLegend(ctx: Canvas2DLike, input: PreviewInput, theme: Theme): void {
  const lens = input.lens;
  if (lens === undefined) return;
  const { layout } = input;
  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  let y = layout.height - 8;
  ctx.fillStyle = theme.textDim;
  ctx.fillText(
    'operational zoning is a dispatcher setting, not building geometry — it has no floor state',
    12,
    y,
  );
  y -= 16;
  for (const entry of [...LENS_LEGEND].reverse()) {
    ctx.fillStyle =
      entry.state === 'reachable'
        ? theme.text
        : entry.state === 'not-served'
          ? theme.restricted
          : theme.warning;
    const count = lens.counts[entry.state];
    ctx.fillText(
      `${entry.glyph} ${entry.word} (${entry.zoning}) — ${String(count)} floor${count === 1 ? '' : 's'}`,
      12,
      y,
    );
    y -= 16;
  }
  ctx.fillStyle = theme.badge;
  ctx.fillText(`credential lens: ${lens.credentialGroup}`, 12, y);
}

/**
 * The preview's text alternative — `KB-13` applied to the editor's canvas.
 *
 * The editor's canvas is as opaque to a screen reader as the viewer's, and the information in it
 * (which shafts reach which floors) is the whole point of the surface.
 *
 * With the lens on it carries the lens too, produced by `describeCredentialLens` rather than
 * reassembled here — the picture and its sentence read one function, exactly as the run canvas
 * and `describeFrame` do.
 */
export function describePreview(
  geometry: PreviewGeometry,
  lens?: CredentialLens | undefined,
): string {
  if (geometry.floors.length === 0) return 'No floors declared yet.';
  const parts = [`${geometry.expansion}.`];
  const byBank = new Map<string, string[]>();
  for (const shaft of geometry.shafts) {
    const cars = byBank.get(shaft.bankId) ?? [];
    cars.push(shaft.label);
    byBank.set(shaft.bankId, cars);
  }
  for (const [bankId, cars] of byBank) {
    const served = geometry.shafts.find((shaft) => shaft.bankId === bankId)?.servedFloorIds ?? [];
    parts.push(
      `Bank ${bankId}: ${String(cars.length)} car${cars.length === 1 ? '' : 's'} (${cars.join(', ')}), ` +
        `serving ${String(served.length)} floors ${served[0] ?? '?'} to ${served[served.length - 1] ?? '?'}.`,
    );
  }
  if (geometry.shafts.length === 0) parts.push('No cars declared.');
  if (geometry.unservedFloorIds.length > 0) {
    parts.push(`Floors no bank serves: ${geometry.unservedFloorIds.join(', ')}.`);
  }
  if (lens !== undefined) parts.push(describeCredentialLens(lens));
  return parts.join(' ');
}
