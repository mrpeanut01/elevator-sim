/**
 * The flagship building's labels — GitHub issue #115 § 4, *"renders as an unreadable barcode"*.
 *
 * Three distinct defects were reported as one symptom, and they are asserted separately here
 * because they have separate causes and separate fixes. All three were measured on `vertical-city`
 * at the 910 × 547 canvas a 1600 × 1000 viewport gives the stage:
 *
 * | symptom | measured before | cause |
 * |---|---|---|
 * | 25 of 33 shaft labels read `Z…` | `fitLabel('Z1-A', 18.5)` → `Z…` at every column | the clip takes the **tail**, and these labels differ at the tail |
 * | the bank row read `z…` 33 times | one bank label per **column**, budgeted by one column | a label drawn 33 times in the room for one |
 * | floor labels overstruck each other | 4 gaps of **4.4 px** between consecutive labelled rows | `roomBehind` did not bind a **forced** row, and the paired lobbies are forced twice over |
 *
 * Nothing here reads a colour or a coordinate it could have got from the layout, which is the rule
 * `render/headerBand.test.ts` states and the reason it caught a collision four other files were
 * green through.
 */

import { loadConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { stageLayoutFor } from '../dev/main.js';
import { BUILDING_IDS, DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { frameAt } from '../frame/frameAt.js';
import { recordRun } from '../record/recordRun.js';
import type { VizRecording } from '../contract/types.js';
import { DEFAULT_THEME, drawScene, fitLabel, type Canvas2DLike } from './canvas.js';
import type { Layout } from './layout.js';

const SHIPPED_CANVAS = { width: 910, height: 547 } as const;
const LAPTOP_CANVAS = { width: 750, height: 308 } as const;

/**
 * One line box at the 12 px face the label gutter uses — `render/layout.ts`'s own
 * `MIN_LABEL_PITCH_PX`, which is the threshold `FloorRow.labelled` thins at. Two labelled rows
 * closer together than this are drawn through each other.
 */
const LINE_BOX_PX = 14;

class Faces implements Canvas2DLike {
  readonly drawn: { readonly text: string; readonly x: number; readonly y: number }[] = [];
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
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  quadraticCurveTo(): void {}
  arc(): void {}
  fill(): void {}
  stroke(): void {}
  fillText(text: string, x: number, y: number): void {
    this.drawn.push({ text, x, y });
  }
}

const recordings = new Map<string, VizRecording>();

beforeAll(async () => {
  const config = await loadConfig(DATA_DIR);
  for (const id of BUILDING_IDS) {
    recordings.set(
      id,
      recordRun(fixtureConfig(config, { buildingId: id, durationS: 600, onTimeout: 'report' }))
        .recording,
    );
  }
});

function stageFor(id: string, canvas: { readonly width: number; readonly height: number }): Layout {
  const recording = recordings.get(id);
  if (recording === undefined) throw new Error(`no recording for ${id}`);
  return stageLayoutFor({
    ...canvas,
    floors: recording.floors,
    shafts: recording.shafts,
    wantsOverlay: canvas.width >= 900,
  });
}

function paint(id: string, layout: Layout): Faces {
  const recording = recordings.get(id);
  if (recording === undefined) throw new Error(`no recording for ${id}`);
  const ctx = new Faces();
  drawScene(ctx, {
    recording,
    frame: frameAt(recording, recording.startedAt + 300),
    layout,
    theme: DEFAULT_THEME,
    unservedFloorIds: [],
    unansweredCallFloorIds: [],
    lockedOutLandings: [],
  });
  return ctx;
}

describe('floor labels do not overstrike each other — issue #115 § 4', () => {
  it('leaves a line box between every pair of labelled rows, on every shipped building', () => {
    for (const id of BUILDING_IDS) {
      for (const canvas of [SHIPPED_CANVAS, LAPTOP_CANVAS]) {
        const layout = stageFor(id, canvas);
        const labelled = layout.rows.filter((row) => row.labelled);
        for (let index = 1; index < labelled.length; index += 1) {
          const gap = Math.abs((labelled[index]?.y ?? 0) - (labelled[index - 1]?.y ?? 0));
          expect(
            gap,
            `${id} @${String(canvas.width)}: "${String(labelled[index - 1]?.label)}" and "${String(labelled[index]?.label)}" are ${gap.toFixed(1)} px apart`,
          ).toBeGreaterThanOrEqual(LINE_BOX_PX);
        }
      }
    }
  });

  it('still labels the entrance on the building where the collisions were', () => {
    /*
     * The half that would make this a bad fix. A forced row now yields to a row already drawn, and
     * a rule that yielded too eagerly would take the reader's two orientation points — the
     * entrance and the transfer floors — off a hundred-storey tower. Vertical City's paired
     * lobbies are two rows 4.4 px apart, so exactly one of each pair survives and the *floor*
     * survives with it: the label is thinned, the row, the line, the shaft and the car are not.
     */
    const layout = stageFor('vertical-city', SHIPPED_CANVAS);
    expect(layout.rows).toHaveLength(100);
    const labelled = layout.rows.filter((row) => row.labelled);
    expect(labelled.length).toBeGreaterThan(15);
    expect(labelled.some((row) => row.isEntrance)).toBe(true);
    expect(labelled.filter((row) => row.isTransferFloor).length).toBeGreaterThanOrEqual(3);
  });
});

describe('shaft labels stay distinguishable — issue #115 § 4', () => {
  it('draws thirty-three different labels on Vertical City, not twenty-five copies of `Z…`', () => {
    const layout = stageFor('vertical-city', SHIPPED_CANVAS);
    const ctx = paint('vertical-city', layout);
    const shaftRow = ctx.drawn.filter((entry) => entry.y === layout.header.shaftY);
    expect(shaftRow).toHaveLength(layout.columns.length);

    /*
     * The measurement issue #115 reports: `Z…` appeared 25 times. What makes a label a label is
     * that it is not the label next to it, so the claim is stated as a count of *distinct* strings
     * within each bank — across banks, `A` under `Z1-*` and `A` under `Z2-*` are different labels
     * because the row above them differs, which the next assertion is about.
     */
    const byBank = new Map<string, string[]>();
    for (const [index, entry] of shaftRow.entries()) {
      const bankId = layout.columns[index]?.bankId ?? '';
      byBank.set(bankId, [...(byBank.get(bankId) ?? []), entry.text]);
    }
    expect(byBank.size).toBeGreaterThan(1);
    for (const [bankId, labels] of byBank) {
      expect(new Set(labels).size, `${bankId} draws ${String(labels.length)} labels`).toBe(
        labels.length,
      );
    }
  });

  it('puts the elided part back, once, over the columns it belongs to', () => {
    /*
     * This is what stops the fix from being a trade. `Z1-A` is not on the picture any more as one
     * string, but `Z1-*` is drawn over the five columns that carry `A`…`E`, so a reader can still
     * read every car's name off the canvas — which is what `Export PNG` writes to a file and what
     * [§ D299](../../../../DECISIONS.md) means by *may not say less*.
     */
    const layout = stageFor('vertical-city', SHIPPED_CANVAS);
    const ctx = paint('vertical-city', layout);
    const bankRow = ctx.drawn.filter((entry) => entry.y === layout.header.bankY);
    expect(bankRow.length).toBeGreaterThan(0);
    // One heading per contiguous run of columns sharing a bank, never one per column.
    expect(bankRow.length).toBeLessThan(layout.columns.length);

    const shaftRow = ctx.drawn.filter((entry) => entry.y === layout.header.shaftY);
    const headings = bankRow.map((entry) => entry.text).join(' ');
    let elided = 0;
    for (const [index, entry] of shaftRow.entries()) {
      const column = layout.columns[index];
      if (column === undefined) continue;
      const full = column.label;
      if (entry.text === full) continue;
      if (entry.text === fitLabel(full, column.width)) {
        /*
         * The unchanged clip. It survives in exactly one place — a bank whose *only* drawn column
         * is past `hiddenShaftCount`, where the group spans one shaft and cannot hold `Z6-*` over
         * it. `planShaftLabels` refuses the elision there rather than taking the shared part off
         * the picture altogether, so that column keeps the label it has always drawn: no better,
         * and not worse.
         */
        continue;
      }
      // Otherwise it is an elision: a proper suffix, with the removed head on the row above.
      expect(full.endsWith(entry.text), `${full} → "${entry.text}" is neither a clip nor a suffix`).toBe(
        true,
      );
      const prefix = full.slice(0, full.length - entry.text.length);
      expect(headings, `${full} lost "${prefix}" and nothing says so`).toContain(`${prefix}*`);
      elided += 1;
    }
    // The building this issue is about: most of its columns take this path, or the test above
    // passed for some other reason.
    expect(elided).toBeGreaterThan(20);
  });

  it('leaves every building whose labels already fitted exactly as it was', () => {
    /*
     * The inertness claim. Chancery House draws `A`…`F` and Mixed-Use draws `S1`/`O1`/`R1`; none
     * of them overflows its column, so no prefix is elided and every string is the authored one.
     */
    for (const id of ['chancery-house', 'crown-hotel', 'garden-apartments', 'midtown-office']) {
      const layout = stageFor(id, SHIPPED_CANVAS);
      const ctx = paint(id, layout);
      const shaftRow = ctx.drawn.filter((entry) => entry.y === layout.header.shaftY);
      expect(shaftRow.map((entry) => entry.text), id).toStrictEqual(
        layout.columns.map((column) => column.label),
      );
    }
  });

  it('never draws a label wider than the room it names', () => {
    for (const id of BUILDING_IDS) {
      for (const canvas of [SHIPPED_CANVAS, LAPTOP_CANVAS]) {
        const layout = stageFor(id, canvas);
        const ctx = paint(id, layout);
        const columnWidth = layout.columns[0]?.width ?? 0;
        for (const entry of ctx.drawn.filter((row) => row.y === layout.header.shaftY)) {
          expect(entry.text.length * 7.2, `${id}: "${entry.text}"`).toBeLessThanOrEqual(columnWidth);
        }
        const plotWidth = layout.plot.width;
        for (const entry of ctx.drawn.filter((row) => row.y === layout.header.bankY)) {
          expect(entry.text.length * 7.2, `${id}: "${entry.text}"`).toBeLessThanOrEqual(plotWidth);
        }
      }
    }
  });
});
