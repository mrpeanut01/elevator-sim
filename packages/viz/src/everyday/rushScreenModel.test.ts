/**
 * **The rush setup's arithmetic, pinned against ENGINE_CONTRACT § 3.2's stated values.**
 *
 * The point of this file is that the screen's five bands are *computed* rather than transcribed, so
 * what is worth asserting is that the computation is the contract's. Every case below quotes § 3.2
 * or § 20.5 and checks the module against it — not against a remembered figure, which is the shape
 * of thing `CLAUDE.md` opens on.
 */

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
    expect(refined.primary.inert).toBe(true);
    // The bar carries the reason, which is the one element § 3.1 pins above a fold.
    expect(refined.note).toBe(RUSH_PRIMARY_REFUSAL);
    // And the control says it too, which is all a screen module can reach of the AX tree.
    expect(refined.primary.label).toBe(RUSH_SCREEN_COPY.primaryInertLabel);
    expect(refined.primary.label).toMatch(/not built/);
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
     * The half of #262 that is not about geometry: *Nothing to set up. It ends when it ends.* is
     * true of a rush, and beside a button nobody can press it reads as confirmation.
     */
    expect(refined.note).not.toBe(base.note);
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
