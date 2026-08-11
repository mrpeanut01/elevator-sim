/**
 * The exported report card — GitHub issue #118 § 1.
 *
 * The load-bearing assertions are the two a *share* artefact can get wrong in a way no other
 * surface can, because the picture is read with none of the product around it:
 *
 * 1. **A withheld figure is drawn withheld.** The tempting card drops the suppressed tile so the
 *    picture looks clean, and the result is a run that could not publish a mean being shared as
 *    though it had. Asserted on a real saturated recording, not on a hand-built summary.
 * 2. **A run that cannot be reproduced says so on the card.** The footer's job is to be a recipe;
 *    a recipe that rebuilds a different run is worse than none, which is `provenanceLineOf`'s own
 *    rule applied to the artefact that leaves the browser.
 *
 * Everything else here exists so those two mean something: the card is compared against the filed
 * sheet's own strings, so *"the tile says what the sheet says"* is a claim about copying rather than
 * about formatting, and the painter is driven against a recording context so *"it is on the
 * bitmap"* is checked rather than assumed.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';

import type { VizRecording } from '../contract/types.js';
import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { contractById } from '../shift/contracts.js';
import { SHIFT_EVENTS } from '../shift/events.js';
import { goalsForDay, readGoals } from '../shift/goals.js';
import { shiftObservationsOf } from '../shift/observations.js';
import { dayReportOf, type ShapedDayReport } from '../shift/report.js';
import { closeDay, openWeek, outcomeOf } from '../shift/week.js';

import { DEFAULT_THEME, type Canvas2DLike } from './canvas.js';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  NO_SHEET_YET,
  drawReportCard,
  reportCardOf,
  type CardRecipe,
} from './reportCard.js';

/* -------------------------------------------------------------------------- *
 * A recording context — `render/canvas.test.ts`'s, narrowed to what a card uses
 * -------------------------------------------------------------------------- */

/**
 * Records the text and the rectangles, and ignores the paths.
 *
 * A card is text on plates; nothing in it draws an arc or a curve, so the stub implements those as
 * no-ops rather than pretending to record them. `canvas.test.ts`'s fuller stub exists because the
 * stage's claim is about *call sequences*; this one's claim is about what a reader can read.
 */
class CardContext implements Canvas2DLike {
  readonly texts: { readonly text: string; readonly x: number; readonly y: number }[] = [];
  readonly rects: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[] =
    [];
  readonly inks: string[] = [];
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
  fillRect(x: number, y: number, w: number, h: number): void {
    this.rects.push({ x, y, w, h });
  }
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
    this.texts.push({ text, x, y });
    this.inks.push(this.fillStyle);
  }

  /** Every string on the bitmap, joined — what a reader would read off the picture. */
  get all(): string {
    return this.texts.map((entry) => entry.text).join('\n');
  }
}

/* -------------------------------------------------------------------------- *
 * Two real runs, because the interesting failure is one the simulator produces
 * -------------------------------------------------------------------------- */

let config: LoadedConfig;
let clean: VizRecording;
let saturated: VizRecording;

function runOf(buildingId: string, arrivalRatePctPop5min: number, durationS: number): VizRecording {
  const base: SimulationConfig = fixtureConfig(config, {
    buildingId,
    durationS,
    onTimeout: 'report',
  });
  return recordRun({ ...base, demand: { arrivalRatePctPop5min } }, { recordDecisions: false })
    .recording;
}

/** A filed sheet over a real recording, with the week already closed on it — `report.test.ts`'s. */
function sheetOf(recording: VizRecording, day = 4): ShapedDayReport {
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const goals = goalsForDay(day);
  const opened = { ...openWeek('c2'), day, dayIdx: (day - 1) % 7 };
  const week = closeDay(
    opened,
    outcomeOf({
      record: null,
      day,
      dayIdx: opened.dayIdx,
      eventId: 'ordinary',
      arrived: observations.arrived,
      carried: observations.carried,
      minutePct: observations.minutePct,
      readings: readGoals(goals, observations),
    }),
  );
  return dayReportOf({
    recording,
    observations,
    goals,
    week,
    contract: contractById('c2'),
    event: SHIFT_EVENTS.ordinary,
    calendar: null,
    subject: { kind: 'week-day' },
    // What the day was set to run — issue #126. The card copies the sheet's strings and never reads
    // the basis, so this is here to say what the sheet is *of* rather than to be asserted on.
    plan: { shiftLengthS: 900, windowStartS: null, patternId: 'building' },
  });
}

const LINK: CardRecipe = { ok: true, line: 'https://example.test/?seed=42' };
const REFUSED: CardRecipe = {
  ok: false,
  reasons: ['the building “my-tower” is yours alone and data/buildings/ does not ship it'],
};

const cardOf = (recording: VizRecording, recipe: CardRecipe = LINK) =>
  reportCardOf({
    report: sheetOf(recording),
    buildingName: 'Chancery House',
    seed: recording.seed.toString(),
    recipe,
  });

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  clean = runOf('garden-apartments', 12, 900);
  saturated = runOf('midtown-office', 25, 900);
}, 180_000);

describe('the premises this suite rests on', () => {
  it('has one run whose mean is publishable and one whose is not', () => {
    // Stated rather than assumed: a change in `core`'s saturation detector should show up here as
    // a premise failure and not as a mysteriously passing honesty assertion.
    expect(clean.summary.awtIsValid && !clean.summary.saturated).toBe(true);
    expect(saturated.summary.awtIsValid).toBe(false);
  });
});

describe('the card copies the sheet, and computes nothing', () => {
  it('takes its title, verdict, lede and tiles from the filed sheet', () => {
    const sheet = sheetOf(clean);
    const card = cardOf(clean);
    expect(card.title).toBe(sheet.title);
    expect(card.verdictLine).toBe(sheet.verdictLine);
    expect(card.verdict).toBe(sheet.verdict);
    // The lede is wrapped, never reworded: joining the lines gives the sheet's own sentence back.
    expect(card.lede.join(' ')).toBe(sheet.lede);
    expect(card.sectionHeading).toBe(sheet.diagnosisHeading.toUpperCase());
    expect(card.tiles.length).toBeGreaterThan(0);
    for (const [index, tile] of card.tiles.entries()) {
      const figure = sheet.figures[index];
      expect(tile.value, tile.label).toBe(figure?.value);
      expect(tile.note, tile.label).toBe(figure?.note);
      expect(tile.tone, tile.label).toBe(figure?.tone);
    }
  });

  it('names the building a stranger would recognise, not its id', () => {
    // The issue's complaint about the old artefact in one line: *"no building name in a form a
    // stranger would read"*. The id is in the filename; the name is on the picture.
    expect(cardOf(clean).eyebrow).toContain('CHANCERY HOUSE');
  });
});

describe('a withheld figure is drawn withheld, not dropped', () => {
  it('keeps the suppressed tile, with the sheet’s own word and its reason', () => {
    /*
     * The clause this card exists to keep. A share artefact that omits the refusal is how a run
     * whose mean the product would not publish gets shared as though it had — and the omission is
     * invisible in the picture, because a missing tile looks like a card with four tiles.
     */
    const sheet = sheetOf(saturated);
    const withheld = sheet.figures.filter((figure) => figure.tone === 'withheld');
    expect(withheld.length, 'the saturated run should refuse at least one figure').toBeGreaterThan(0);

    const card = cardOf(saturated);
    const drawn = card.tiles.filter((tile) => tile.tone === 'withheld');
    expect(drawn.length).toBeGreaterThan(0);
    for (const tile of drawn) expect(tile.value).toBe('withheld');

    // …and it reaches the bitmap, which is a different claim from being in the model.
    const ctx = new CardContext();
    drawReportCard(ctx, card, DEFAULT_THEME);
    expect(ctx.all).toContain('withheld');
  });

  it('draws the clean run’s figures uncoloured or toned, and never as “withheld”', () => {
    // The control. Without it the row above would pass on a card that printed `withheld` on
    // everything, which is the other way to be wrong about a refusal.
    expect(cardOf(clean).tiles.every((tile) => tile.value !== 'withheld')).toBe(true);
  });
});

describe('the footer is a recipe, or the reason there is none', () => {
  it('carries the seed and the link', () => {
    const card = cardOf(clean);
    expect(card.footer[0]).toBe(`seed ${clean.seed.toString()}`);
    expect(card.footer.join(' ')).toContain('https://example.test/?seed=42');
  });

  it('carries the refusal instead when the run does not reproduce, and still carries the seed', () => {
    const card = cardOf(clean, REFUSED);
    expect(card.footer[0]).toBe(`seed ${clean.seed.toString()}`);
    const rest = card.footer.slice(1).join(' ');
    expect(rest).toContain('does not reproduce');
    expect(rest).toContain('my-tower');
    // The link is not there to be found — the point is that no artefact is offered, not that a
    // different one is.
    expect(card.footer.join(' ')).not.toContain('https://');
  });
});

describe('the painter fills the frame it declares', () => {
  it('covers 1200×630 opaquely before it writes anything', () => {
    /*
     * A PNG with an alpha channel reads as a hole on every surface that composites it, which is
     * every one of the places a shared card goes. The background fill is therefore the first
     * rectangle and it is the whole frame.
     */
    const ctx = new CardContext();
    drawReportCard(ctx, cardOf(clean), DEFAULT_THEME);
    expect(ctx.rects[0]).toStrictEqual({ x: 0, y: 0, w: CARD_WIDTH, h: CARD_HEIGHT });
    expect(CARD_WIDTH / CARD_HEIGHT).toBeCloseTo(1200 / 630, 6);
  });

  it('puts every line of the card on the bitmap, inside the frame', () => {
    const card = cardOf(clean);
    const ctx = new CardContext();
    drawReportCard(ctx, card, DEFAULT_THEME);

    for (const line of [card.title, card.verdictLine, card.eyebrow, ...card.footer]) {
      expect(ctx.all, line).toContain(line);
    }
    for (const tile of card.tiles) expect(ctx.all, tile.label).toContain(tile.value);
    // Nothing is written off the top or the left, and nothing below the frame. The right edge is
    // not asserted: the stub has no `measureText`, which is `render/overlay.ts`'s own limitation
    // and the reason the wrap is an approximation rather than a measurement.
    for (const entry of ctx.texts) {
      expect(entry.x, entry.text).toBeGreaterThanOrEqual(0);
      expect(entry.y, entry.text).toBeGreaterThanOrEqual(0);
      expect(entry.y, entry.text).toBeLessThan(CARD_HEIGHT);
    }
  });

  it('draws the verdict in the verdict’s ink, and the ungraded one in neither band', () => {
    /*
     * KB-15's rule holds here too: the colour is a second signal and the *word* is the first, which
     * is why `verdictLine` is on the card at all. What this asserts is that the second signal
     * agrees with the first rather than being decorative — and that `ungraded` is the dim ink, not
     * amber, because a day nobody judged is not a day that went wrong (§ D234).
     */
    const sheet = sheetOf(clean);
    const ctx = new CardContext();
    drawReportCard(ctx, cardOf(clean), DEFAULT_THEME);
    const index = ctx.texts.findIndex((entry) => entry.text === sheet.verdictLine);
    expect(index).toBeGreaterThanOrEqual(0);
    const expected =
      sheet.verdict === 'cleared'
        ? DEFAULT_THEME.queueBands.settling
        : sheet.verdict === 'missed'
          ? DEFAULT_THEME.queueBands.waiting
          : DEFAULT_THEME.textDim;
    expect(ctx.inks[index]).toBe(expected);
  });
});

describe('the refusal the control itself shows', () => {
  it('names what to do instead, rather than only what went wrong', () => {
    // `docs/16` S1: an absence indistinguishable from an oversight is refused. Pressing the control
    // with no filed sheet used to export the stage, which is the artefact the issue is about.
    expect(NO_SHEET_YET).toContain('run a shift');
    expect(NO_SHEET_YET).toContain('report card');
  });

  it('names the control by the label the page actually carries', async () => {
    /*
     * A refusal that names a control the screen does not have sends a reader hunting. The label
     * moved with this lane — *Export PNG* to *Export report PNG*, because a button called *Export
     * PNG* beside a canvas reads as a screenshot button — so the sentence and the button are
     * asserted against each other rather than kept in step by hand.
     */
    const html = await readFile(
      fileURLToPath(new URL('../../index.html', import.meta.url)),
      'utf8',
    );
    const label = /id="export-png"[^>]*>([^<]+)</u.exec(html)?.[1];
    expect(label, 'the export control is gone from index.html').toBeDefined();
    expect(NO_SHEET_YET).toContain(String(label));
  });
});
