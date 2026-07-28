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
 * shafts) and **service** zoning — a shaft covering only the floors its bank serves. Access
 * zoning is a credential fact and is listed in the form, never drawn as geometry; operational
 * zoning is not building geometry at all (see `editorEdits.ts`).
 */

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
  ctx.fillText(title, 12, 10);

  ctx.font = FONT;
  ctx.fillStyle = theme.textDim;
  ctx.fillText(input.caption ?? geometry.expansion, 12, 30);

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
    const mark = unserved.has(row.floorId) ? ' ⊘' : '';
    ctx.fillStyle = mark !== '' ? theme.restricted : badge === '' ? theme.textDim : theme.badge;
    const budget = layout.plot.x - 8 - (badge.length + mark.length) * 8;
    ctx.fillText(`${badge}${fitLabel(row.label, budget)}${mark}`, layout.plot.x - 8, row.y);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.textDim;
    ctx.fillText(`${row.heightM.toFixed(1)} m`, layout.plot.x + layout.plot.width + 10, row.y);
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
    ctx.fillText(column.label, column.centreX, layout.plot.y - 4);
    ctx.fillStyle = theme.badge;
    ctx.fillText(column.bankId, column.centreX, layout.plot.y - 18);
  }

  if (layout.hiddenShaftCount > 0) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.font = FONT;
    ctx.fillStyle = theme.warning;
    ctx.fillText(
      `showing ${String(layout.columns.length)} of ${String(layout.columns.length + layout.hiddenShaftCount)} shafts`,
      layout.plot.x,
      layout.plot.y - 32,
    );
  }

  ctx.restore();
}

/**
 * The preview's text alternative — `KB-13` applied to the editor's canvas.
 *
 * The editor's canvas is as opaque to a screen reader as the viewer's, and the information in it
 * (which shafts reach which floors) is the whole point of the surface.
 */
export function describePreview(geometry: PreviewGeometry): string {
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
  return parts.join(' ');
}
