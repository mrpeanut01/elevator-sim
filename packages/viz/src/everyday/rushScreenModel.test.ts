/**
 * **The rush setup's arithmetic, pinned against ENGINE_CONTRACT § 3.2's stated values.**
 *
 * The point of this file is that the screen's five bands are *computed* rather than transcribed, so
 * what is worth asserting is that the computation is the contract's. Every case below quotes § 3.2
 * or § 20.5 and checks the module against it — not against a remembered figure, which is the shape
 * of thing `CLAUDE.md` opens on.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { actionBarFor } from './actionBar.js';
import { routeFor } from './screens.js';
import { WAIT_BANDS } from '../live/bands.js';
import { clockAt } from '../live/timeline.js';
import {
  arrivalsPerMinute,
  climbPerWavePct,
  expectedPerBucket,
  playerWaveAt,
  rushBandViews,
  rushBarModel,
  rushDrivingLine,
  rushFactViews,
  rushGeneratedRangeLine,
  rushHoldLineFigure,
  rushOpeningLine,
  waveIndexAt,
  LAST_GENERATED_WAVE,
  RUSH_ABSENCES,
  RUSH_BANDS,
  RUSH_BESTS,
  MORNING_RUSH_RATE,
  RUSH_HOLD_LINE,
  RUSH_PRIMARY_REFUSAL,
  RUSH_SCREEN_COPY,
  RUSH_STREAM,
} from './rushScreenModel.js';

describe('§ 3.2’s stream, as the contract states it', () => {
  it('carries the contract’s own constants', () => {
    // Ninety minutes, two-second buckets, `wave = floor(t / 180)`, `(0.34 + wave * 0.11) * 2 / 3`,
    // a constant `upShare` of 0.62, one seed. Each is quoted from § 3.2 rather than remembered.
    expect(RUSH_STREAM.lengthS).toBe(5400);
    expect(RUSH_STREAM.bucketS).toBe(2);
    expect(RUSH_STREAM.waveS).toBe(180);
    expect(RUSH_STREAM.baseRate).toBe(0.34);
    expect(RUSH_STREAM.waveStep).toBe(0.11);
    expect(RUSH_STREAM.scale).toBeCloseTo(2 / 3, 12);
    expect(RUSH_STREAM.upShare).toBe(0.62);
    expect(RUSH_STREAM.seed).toBe(90210);
  });

  it('reads `wave = floor(t / 180)` zero-based, and the player’s wave one-based', () => {
    // The off-by-one the module docstring keeps apart by name. `t` is seconds since the rush
    // opened, so § 3.2's `t − OPEN` is already applied.
    expect(waveIndexAt(0)).toBe(0);
    expect(waveIndexAt(179)).toBe(0);
    expect(waveIndexAt(180)).toBe(1);
    expect(playerWaveAt(0)).toBe(1);
    expect(playerWaveAt(179)).toBe(1);
    expect(playerWaveAt(180)).toBe(2);
  });

  it('computes `expected = (0.34 + wave × 0.11) × 2 / 3` per two-second bucket', () => {
    expect(expectedPerBucket(0)).toBeCloseTo((0.34 * 2) / 3, 12);
    expect(expectedPerBucket(1)).toBeCloseTo(((0.34 + 0.11) * 2) / 3, 12);
    expect(expectedPerBucket(10)).toBeCloseTo(((0.34 + 1.1) * 2) / 3, 12);
    // Thirty buckets a minute, because a bucket is two seconds.
    expect(arrivalsPerMinute(0)).toBeCloseTo(expectedPerBucket(0) * 30, 12);
  });

  it('prints the climb as the contract’s own coefficient, with its basis named', () => {
    /*
     * § 3.2 says *about 11 % of a normal morning's rate every three minutes*, and the **about** is
     * load-bearing: the coefficient reads 11 %, and the same step against § 3.1's morning-rush
     * rate reads 11.6 %. Both are pinned so neither can quietly become the other, and the printed
     * one is the coefficient — the number a reader can find in the contract.
     */
    expect(climbPerWavePct()).toBeCloseTo(11, 12);
    expect((RUSH_STREAM.waveStep / MORNING_RUSH_RATE) * 100).toBeCloseTo(11.58, 2);
    // And the same denominator is what the screen's opening line is measured against, so the two
    // readings of *about 11 %* sit beside a stated basis rather than beside nothing.
    expect(rushOpeningLine()).toContain('36%');
    expect(rushOpeningLine()).toContain('11%');
    /*
     * And it is not the compounding reading. Against the previous wave the step starts near 32 %
     * and falls away, which is not a constant and is not what *every wave, forever* claims.
     */
    const compounding = expectedPerBucket(1) / expectedPerBucket(0) - 1;
    expect(compounding).toBeCloseTo(0.11 / 0.34, 12);
    expect(compounding).not.toBeCloseTo(climbPerWavePct() / 100, 2);
  });

  it('ends the generated climb on the wave ninety minutes reaches', () => {
    expect(LAST_GENERATED_WAVE).toBe(playerWaveAt(RUSH_STREAM.lengthS - 1));
    expect(LAST_GENERATED_WAVE).toBe(30);
    expect(rushGeneratedRangeLine()).toContain('90 minutes');
    expect(rushGeneratedRangeLine()).toContain('wave 30');
    expect(rushGeneratedRangeLine()).toContain('90210');
  });
});

describe('§ 9.1’s bands are labels on the ramp', () => {
  it('spans the guide’s five bands with no gap and no overlap', () => {
    expect(RUSH_BANDS).toHaveLength(5);
    let expectedFrom = 1;
    for (const band of RUSH_BANDS) {
      expect(band.fromWave, band.waves).toBe(expectedFrom);
      if (band.toWave === undefined) {
        // Only the last band is open-ended — § 9.1's `wave 17+`.
        expect(band).toBe(RUSH_BANDS.at(-1));
        break;
      }
      expect(band.toWave, band.waves).toBeGreaterThanOrEqual(band.fromWave);
      expectedFrom = band.toWave + 1;
    }
  });

  it('keeps every band’s label and its span in agreement', () => {
    // The label is the guide's; the span is what the arithmetic reads. A band whose words and
    // numbers disagreed would print a rate for waves it does not name.
    for (const band of RUSH_BANDS) {
      if (band.toWave === undefined) {
        expect(band.waves).toBe(`wave ${String(band.fromWave)}+`);
        continue;
      }
      expect(band.waves).toBe(`waves ${String(band.fromWave)}–${String(band.toWave)}`);
    }
  });

  it('rises monotonically, and prices its bars against the heaviest band', () => {
    const views = rushBandViews();
    expect(views).toHaveLength(RUSH_BANDS.length);
    const rates = views.map((view) => Number.parseFloat(view.perMinute));
    for (const [index, rate] of rates.entries()) {
      if (index === 0) continue;
      expect(rate, views[index]?.waves).toBeGreaterThan(rates[index - 1] ?? 0);
    }
    // The last band is the heaviest, so its bar is full and no other reaches 100.
    expect(views.at(-1)?.barPct).toBe(100);
    for (const view of views.slice(0, -1)) expect(view.barPct).toBeLessThan(100);
  });

  it('prices the first band at the ramp’s own opening rate', () => {
    /*
     * *waves 1–4 · a normal day* is the mean of § 3.2's expression over zero-based waves 0–3, and
     * this is the case that would fail if the bands were transcribed from the prototype's five
     * hand-set bar widths instead of computed.
     */
    const mean = (arrivalsPerMinute(0) + arrivalsPerMinute(1) + arrivalsPerMinute(2) + arrivalsPerMinute(3)) / 4;
    expect(rushBandViews()[0]?.perMinute).toBe(`${mean.toFixed(1)} a minute`);
    expect(rushBandViews()[0]?.against).toBe(`${(mean / arrivalsPerMinute(0)).toFixed(1)}× wave 1`);
  });
});

describe('§ 20.5’s hold line', () => {
  it('is forty people **and** over two minutes, not forty people standing', () => {
    /*
     * The whole of § 20.5. The prototype's `sim.standing() >= 40` is the first half alone; nothing
     * in `packages/` implemented either, so this is the line built right rather than a fix.
     */
    expect(RUSH_HOLD_LINE.people).toBe(40);
    expect(RUSH_HOLD_LINE.overS).toBe(120);
  });

  it('takes its two minutes from `live/bands.ts`’s own past-two-minutes band', () => {
    /*
     * The seam a measured rush would go through: `waitBandsAt(recording, t)`'s fourth count against
     * forty. Asserting the boundary here is what stops the model's 120 and the band's 120 from
     * being two numbers that happen to agree today.
     */
    const past = WAIT_BANDS.at(-1);
    expect(past?.toS).toBeUndefined();
    expect(past?.fromS).toBe(RUSH_HOLD_LINE.overS);
  });

  it('prints the rule as a figure beside the sentence that spells it out', () => {
    expect(rushHoldLineFigure()).toBe('120 s × 40 people');
    // The prose says the same thing in words — § 9.1's copy, and § 9.2's rule.
    expect(RUSH_SCREEN_COPY.holdLine).toContain('forty people');
    expect(RUSH_SCREEN_COPY.holdLine).toContain('over two minutes');
  });
});

describe('what the screen refuses, and where the refusal sits', () => {
  /**
   * **This case used to hold the defect in place** — GitHub issue #262.
   *
   * It asserted `refined.note === base.note` and `refined.primary.label === base.primary.label`,
   * which is to say: it required the refinement to leave the reason off the control's own row. The
   * screen drew the sentence 905 px down a 720 px viewport instead, and this case was green about
   * it. So the three cells it now pins are the three the fix moves.
   */
  it('marks the § 3.3 primary inert and puts the reason on its own row', () => {
    const base = actionBarFor({ screen: 'rush', ctx: 'rush' });
    const refined = rushBarModel(base);
    /*
     * **The reason is the cell, and the table's note is left alone.** `shell.ts#drawBar` draws an
     * inert primary's own sentence *in place of* the note, so this refinement does not have to
     * overwrite § 3.3's cell to stop *"Nothing to set up. It ends when it ends."* appearing beside
     * a dead button — which is what GitHub issue #262 measured on the deployed build.
     */
    expect(refined.primary.inert).toBe(RUSH_PRIMARY_REFUSAL);
    expect(refined.primary.label).toBe(base.primary.label);
    expect(refined.note).toBe(base.note);
    expect(refined.leave).toEqual(base.leave);
    // § 3.3: *a rush has no timeline at all*. The row carries none, and the refinement adds none.
    expect(refined.timeline).toBeUndefined();
  });

  /**
   * The substitution is a **refinement**, not an edit to § 3.3's table.
   *
   * `ACTION_BAR_ROWS` still ships *Nothing to set up. It ends when it ends.* and *Start the rush*,
   * and a lane that fixed #262 by rewriting the guide's own row would have changed what the table
   * transcribes rather than what this state draws. Asserted from the resolved row rather than from
   * a restated string, so a reworded § 3.3 cell moves this case with it.
   */
  it('leaves § 3.3’s own cells alone and substitutes over them', () => {
    const base = actionBarFor({ screen: 'rush', ctx: 'rush' });
    expect(base.note).toContain('Nothing to set up');
    expect(base.primary.label).toBe('Start the rush');
    expect(base.primary.inert).toBeUndefined();

    const refined = rushBarModel(base);
    /*
     * **The model leaves § 3.3's cells alone; the shell substitutes.** This assertion used to read
     * `expect(refined.note).not.toBe(base.note)`, and it was true of a different fix for the same
     * defect — one that overwrote the note here. Two sessions closed #262 independently and the
     * merge is what caught the contradiction: under the resolved design the refusal rides on
     * `primary.inert`, and `shell.ts#drawBar` draws it *in place of* the note, so a model that
     * overwrote the cell would be deciding at the wrong layer and every other screen would need
     * the same edit.
     *
     * The half of #262 that is not about geometry still holds, and is checked where it now lives:
     * *"Nothing to set up. It ends when it ends."* is true of a rush and reads as confirmation
     * beside a button nobody can press, so the shell prefers the reason over the table's note.
     */
    expect(refined.note).toBe(base.note);
    expect(refined.primary.inert).toBe(RUSH_PRIMARY_REFUSAL);
    expect(refined.primary.variants).toEqual(base.primary.variants);
  });

  it('names each absence rather than the feeling of one, and puts the reason on the control', () => {
    expect(RUSH_ABSENCES.length).toBeGreaterThanOrEqual(3);
    for (const absence of RUSH_ABSENCES) expect(absence.trim().length).toBeGreaterThan(20);
    expect(RUSH_PRIMARY_REFUSAL).toMatch(/not built/);
  });

  /*
   * The three cases below replace a check that asserted only that every entry was longer than
   * twenty characters. That check passed for two waves over an entry whose subject had expired —
   * see {@link RUSH_ABSENCES}' docstring — which is the same failure the driving-line case at the
   * bottom of this file already records: a case that pins a refusal's *form* keeps passing for
   * exactly as long as its *subject* is wrong. So these pin the subject, and derive it.
   */

  it('names the ordinary stage as what a run plays on, because that is what the registry routes', () => {
    /*
     * **Keyed on the words rather than on a section number, and the re-keying is GitHub issue
     * #207's doing.** This entry used to open *"§ 9.2's stage"* and this case found it by
     * `includes('9.2')`. Nothing a player reads may carry a section number now, so the entry says
     * what it is about in words and the case looks for the same subject in the same way: the row
     * about the rush's own stage. The claim under test has not moved an inch.
     */
    const stage = RUSH_ABSENCES.find((absence) => absence.startsWith('a rush stage of its own'));
    expect(stage).toBeDefined();
    /*
     * Derived, not remembered. `routeFor` answering `'screen'` *is* the fact that § D335's hand-off
     * is retired and `stage` is an ordinary registered Everyday screen — so the moment that is true,
     * a register calling the Engineer surface the thing a player watches is making a false statement
     * about this build. The assertion is conditioned on the registry rather than asserted beside it,
     * so a future lane that genuinely hands the stage back off does not fail this case for the wrong
     * reason.
     */
    expect(routeFor('stage')).toBe('screen');
    expect(stage).not.toMatch(/Engineer/);
    expect(stage).toMatch(/the ordinary stage screen/);
  });

  it('claims an absence the seam it names actually has — the clock reads the hour', () => {
    /*
     * The other half of a register entry: having named the right screen, it must also be right about
     * what that screen lacks. § 9.2 wants *held time*, and `stageScreenModel.ts#stageHeaderOf` builds
     * its clock from `clockAt`, which answers a time of day. Forty-two minutes into a run is `06:42`
     * on the fallback start — an hour, not a duration — so the entry's claim is true of the seam it
     * cites rather than merely plausible.
     */
    expect(clockAt(42 * 60, undefined)).toBe('06:42');
    const stage = RUSH_ABSENCES.find((absence) => absence.startsWith('a rush stage of its own'));
    /*
     * The entry used to name `clockAt` outright. It may not now — a player surface carries no
     * identifiers — so what is asserted is the *claim* the identifier was evidence for: the clock
     * on that screen reads a time of day, which the line above measures, and the entry says so in
     * words.
     */
    expect(stage).toMatch(/clock reads the time of day/);
    expect(stage).toMatch(/time held/);
  });

  it('does not let any entry name the Engineer surface as an Everyday run’s stage', () => {
    /*
     * The register-wide form of the case above. Every § 4 key the shell routes to a module is drawn
     * in the Everyday screen region, so no entry on any Everyday register may describe a run as
     * playing on the other shell. Kept over the whole array rather than the one entry that was wrong,
     * because the next stale subject will not be in the same row.
     */
    for (const absence of RUSH_ABSENCES) expect(absence).not.toMatch(/Engineer surface/);
  });

  it('withholds the two facts no run in this build has produced, and computes the third', () => {
    const [furthest, held, climb] = rushFactViews();
    expect(furthest?.withheld).toBe(true);
    expect(furthest?.value).toBe(RUSH_SCREEN_COPY.noRun);
    expect(held?.withheld).toBe(true);
    // The climb is arithmetic rather than a measurement, so it is the one fact that is not `—`.
    expect(climb?.withheld).toBe(false);
    expect(climb?.value).toBe(`+${climbPerWavePct().toFixed(0)}%`);
    expect(climb?.value).toBe('+11%');
  });

  it('labels the two reference runs as reference runs, and withholds the player’s own row', () => {
    // § 9.1: *five entries including two reference runs, labelled as reference runs*.
    expect(RUSH_BESTS).toHaveLength(5);
    expect(RUSH_BESTS.filter((best) => best.reference)).toHaveLength(2);
    for (const best of RUSH_BESTS.filter((entry) => entry.reference)) {
      expect(best.who).toBe('reference run');
    }
    const mine = RUSH_BESTS.find((best) => best.who.startsWith('you'));
    expect(mine?.wave).toBe(RUSH_SCREEN_COPY.noRun);
    expect(mine?.held).toBe(RUSH_SCREEN_COPY.noRun);
  });

  it('states who would drive rather than offering a select that writes another mode’s run', () => {
    const line = rushDrivingLine('Collective control');
    expect(line).toContain('Collective control');
    /*
     * The screen the copy points at, not the shape of a refusal. The first version of this case
     * asserted `/not built/`, and the sentence it pinned named the front door as unbuilt long after
     * the door had landed — a test that holds a refusal's *form* keeps passing while its *subject*
     * goes stale, which is § D227 with a green tick over it.
     */
    expect(line).toContain('brief');
    expect(line).not.toMatch(/not built/);
  });
});

/**
 * **Where each of these constants is drawn, checked against the import graph rather than believed.**
 *
 * This suite is GitHub issue #293's third acceptance criterion — *a case ties the claim to the
 * renderer, so a register that moves again takes the sentence that describes it with it*. It exists
 * because of what #293 found, which is worth stating precisely, because the shape recurs and the
 * two earlier instances recorded in this file were both caught only after they had shipped.
 *
 * {@link RUSH_BESTS} prints two invented handles against held times — `delft_vt · wave 19 · 57 min`
 * and one more — and is the only place this build prints another player's name against a figure.
 * What licensed that was its own docstring: *"this build has measured none of them, which
 * {@link RUSH_ABSENCES} says **on the same screen**"*. The register left this screen on the merge
 * that closed issue #207. `rushScreen.ts` has not imported it since, and `modes.ts` carried the same
 * claim in the same words.
 *
 * So the sentence that went stale was not a description of a control — it was the **licence**. An
 * ordinary § D227 refusal tells a reader not to touch something that works; this one answered *why
 * may unmeasured names be drawn at all*, and answered by pointing at a disclosure two clicks away in
 * Settings. That is the failure this suite is pointed at.
 *
 * ## Why it checks module names rather than reading the prose
 *
 * The stale claims said *on the same screen* and *on the screen itself*. Deixis is exactly what
 * cannot be checked: it means whatever page the reader last had in mind, so it stays grammatical
 * after the thing it points at has moved, and it is silent about which module was supposed to draw
 * it. A **module name** is checkable, which is why the docstrings above now carry one.
 *
 * Scanning the prose for the phrase was tried and rejected: {@link RUSH_ABSENCES}' own docstring
 * says *"not on this screen"* and {@link RUSH_BESTS_FIXTURE_NOTE}'s says *"putting `RUSH_ABSENCES`
 * back on this screen would re-litigate #207"*. Both are true, and both match any pattern loose
 * enough to catch the defect. A test a truthful author trips over is a test that gets deleted.
 *
 * ## What this can catch, and what it cannot
 *
 * It **can** catch: a constant whose declared renderer stopped importing it (the #207 move, from
 * either end); a new player-facing constant with no declared renderer at all; a docstring naming a
 * module that no longer draws the thing it describes; and the standings being drawn on a surface
 * that does not also draw their fixture marker.
 *
 * It **cannot** catch: a module that imports a constant and never renders it — an import is
 * evidence, not proof, and the browser tier is what proves a string reaches a page; whether the
 * *rest* of a docstring's sentence is true, only that it names the right module; or a claim written
 * in a file outside `everyday/`. It also exempts the constants drawn in this module by its own
 * functions, because a file naming itself is not a claim that can go stale — the cross-module claim
 * is the one that expires silently, and it is the one #207 broke.
 */
describe('every rush constant names the module that draws it — § D227, GitHub issue #293', () => {
  const HERE = fileURLToPath(new URL('.', import.meta.url));
  const MODEL = readFileSync(`${HERE}rushScreenModel.ts`, 'utf8');

  /**
   * Which modules under `everyday/` import a given name from the rush model — parsed, not listed.
   *
   * `honesty/` is deliberately out of scope. Its adapter imports half of this file, and it is the
   * *search* rather than a screen: counting it as a renderer would let a constant that reaches no
   * player look drawn. That is the distinction `derive.test.ts` draws between a surface and the
   * thing sweeping it, and it matters here for the same reason.
   */
  function importersOf(symbol: string): readonly string[] {
    return readdirSync(HERE)
      .filter(
        (file) =>
          file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'rushScreenModel.ts',
      )
      .filter((file) => {
        const block = /import\s*\{([^}]*)\}\s*from\s*'\.\/rushScreenModel\.js'/u.exec(
          readFileSync(`${HERE}${file}`, 'utf8'),
        );
        /*
         * The imported name, never the local alias: `RUSH_SCREEN_COPY as COPY` is an import of the
         * former. Matching the alias would miss every renamed import, which is most of them.
         */
        return (block?.[1] ?? '')
          .split(',')
          .map((entry) => entry.trim().split(/\s+as\s+/u)[0]?.trim())
          .includes(symbol);
      })
      .sort();
  }

  /**
   * The **lead** of the doc comment above `export const NAME` — everything before its first `##`.
   *
   * The lead rather than the whole block, and the reason is a defect this case had on its first
   * draft. It asked whether the docstring contained the module's name anywhere, and
   * {@link RUSH_BESTS} satisfied that from a section recording the history of #293, which mentions
   * `rushScreen.ts` only to say what it *does not* import. Restoring the exact stale wording the
   * issue reported left the case green: the instrument was measuring a word, not a claim.
   *
   * A docstring's lead is where it says what the thing is and who draws it; the `##` sections below
   * are argument and history, and a module named only down there is a mention rather than a claim.
   * So the convention this enforces is *name the renderer in the summary*, which is both where a
   * reader looks first and the one position an incidental reference cannot occupy.
   */
  function leadOf(symbol: string): string {
    const at = MODEL.indexOf(`export const ${symbol}`);
    if (at < 0) return '';
    const opened = MODEL.lastIndexOf('/**', at);
    const closed = MODEL.lastIndexOf('*/', at);
    if (opened < 0 || closed < opened) return '';
    const block = MODEL.slice(opened, closed);
    const section = block.indexOf('\n * ## ');
    return section < 0 ? block : block.slice(0, section);
  }

  /**
   * Every exported constant of the rush model, and the module that puts it in front of a player.
   *
   * `null` is *not player-facing*: arithmetic that reaches a reader only through a sentence
   * elsewhere in this file. It is spelled out per constant rather than inferred from the type,
   * because a number that quietly grows a label is exactly the case worth failing on.
   *
   * `'rushScreenModel.ts'` means this file draws it through one of its own functions. Those rows
   * are exempt from the docstring case below, for the reason the suite docstring gives.
   */
  const DRAWN_BY: Readonly<Record<string, string | null>> = Object.freeze({
    RUSH_STREAM: null,
    MORNING_RUSH_RATE: null,
    RUSH_HOLD_LINE: null,
    LAST_GENERATED_WAVE: null,
    /* `rushBandViews` shapes these into the screen's five rows; the raw table is never imported. */
    RUSH_BANDS: 'rushScreenModel.ts',
    /* `rushBarModel` substitutes it into the § 3.3 bar the shell draws — GitHub issue #262. */
    RUSH_PRIMARY_REFUSAL: 'rushScreenModel.ts',
    RUSH_SCREEN_COPY: 'rushScreen.ts',
    /*
     * The register moved here on the merge that closed #207. This row is what makes that fact
     * checkable rather than remembered, and it is the row #293 would have failed on.
     */
    RUSH_ABSENCES: 'buildNotes.ts',
    RUSH_BESTS: 'rushScreen.ts',
    RUSH_BESTS_FIXTURE_NOTE: 'rushScreen.ts',
  });

  it('declares a renderer for every exported constant, so a new one cannot arrive unclaimed', () => {
    /*
     * Derived from the file, never typed twice. A constant added without a row here fails on the
     * commit that adds it — the half of § D370's register discipline that applies to a mapping
     * rather than to a queue.
     */
    const exported = [...MODEL.matchAll(/^export const (\w+)/gmu)].map((match) => match[1]);
    expect(exported.length).toBeGreaterThan(0);
    expect([...exported].sort()).toEqual(Object.keys(DRAWN_BY).sort());
  });

  it('keeps no row naming a module that has stopped importing the constant — the #207 move', () => {
    const wrong: string[] = [];
    for (const [symbol, drawnBy] of Object.entries(DRAWN_BY)) {
      const importers = importersOf(symbol);
      if (drawnBy === null || drawnBy === 'rushScreenModel.ts') {
        if (importers.length > 0) {
          wrong.push(
            `${symbol} is declared undrawn or in-file, but ${importers.join(', ')} imports it`,
          );
        }
      } else if (!importers.includes(drawnBy)) {
        wrong.push(
          `${symbol} is declared drawn by ${drawnBy}, which does not import it ` +
            `(importers: ${importers.join(', ') || 'none'})`,
        );
      }
    }
    expect(
      wrong,
      'a constant and the module said to draw it have parted company. § D227: the sentence that ' +
        'describes a register must move with the register — GitHub issue #293 is what happens ' +
        'when it does not, and there the claim was the licence for printing unmeasured names.',
    ).toEqual([]);
  });

  it('makes every cross-module claim name its module, so the sentence cannot stay behind', () => {
    const silent: string[] = [];
    for (const [symbol, drawnBy] of Object.entries(DRAWN_BY)) {
      if (drawnBy === null || drawnBy === 'rushScreenModel.ts') continue;
      if (!leadOf(symbol).includes(drawnBy)) silent.push(`${symbol} → ${drawnBy}`);
    }
    /*
     * This is the case that fails on the base commit of #293. `RUSH_BESTS` is drawn by
     * `rushScreen.ts` and its docstring named no module at all — it said *on the same screen*, and
     * pointed at a register that had left. A docstring that names its renderer is one a reader can
     * check in a second, and one a mechanical check can hold.
     */
    expect(
      silent,
      'these docstrings describe where a constant is drawn without naming the module that draws ' +
        'it. Deixis — *this screen*, *the same screen* — survives the thing it points at moving, ' +
        'which is exactly how GitHub issue #293 shipped.',
    ).toEqual([]);
  });

  it('draws the standings’ fixture marker wherever it draws the standings, and nowhere else', () => {
    /*
     * **The § 20.11 relation, and the one case here that is not about a docstring.** § 20.11 lists
     * `RUSH_BESTS` among the authored fixtures and gives each one a real source or *"an explicit
     * `FIXTURE` marker so nobody ships them as truth"*. The engine that would be the real source is
     * GitHub issue #220's and is not built, so the marker is the whole of the compliance — and a
     * marker on a different surface from the fixture is not one.
     *
     * Asserted as set equality rather than as *the note is drawn somewhere*, which is the direction
     * that matters: a second screen that grew a standings list without the marker would satisfy the
     * weaker form and be precisely the defect back again. Neither side may be empty, or two absent
     * things would compare equal and the case would pass over a build that draws no standings at
     * all.
     */
    const rows = importersOf('RUSH_BESTS');
    const marker = importersOf('RUSH_BESTS_FIXTURE_NOTE');
    expect(rows.length).toBeGreaterThan(0);
    expect(
      marker,
      'the five standings carry two invented handles against held times, and § 20.11 lets a ' +
        'fixture ship only with a real source or a marker beside it. These two must be drawn by ' +
        'the same modules — moving one without the other is GitHub issue #293 exactly.',
    ).toEqual(rows);
  });
});
