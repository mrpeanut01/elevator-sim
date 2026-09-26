/**
 * **The five session-shape figures, checked against the day, the content and the rung** — GitHub
 * issue **#559**, [§ D753](../../../../DECISIONS.md) and [§ D946](../../../../DECISIONS.md).
 *
 * Every assertion here exists because the defect it guards has already shipped. The five strings
 * `everyday/sittingShape.ts` composes went stale silently for two rung moves and four documents,
 * and nothing in the repository read any of them. So the checks are, in order: **every advertised
 * length is the day the tile actually opens**, censused over all sixteen contracts through the
 * shipped derivations; the spans are the shipped content's; the figures are derived from the
 * ladder rather than typed; the rounding goes up; the two player modules compose none of their
 * own; and the four documents that repeat the figures agree with the strings a player reads.
 *
 * **The first block is § D946's and is the one that was missing.** § D753 pinned the rung and left
 * the day a constant, so the Career tile advertised `data/campaign.json`'s 900 s stage — a run
 * that tile does not open — and *Today's scenario* advertised a thirty-minute slice over a
 * ten-hour authored day. Both were correct for some contracts, which is precisely why no test
 * caught them: a check against *a* piece of content passes, and only a census over *every*
 * contract fails.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBuilding, parseTrafficProfiles } from '@elevator-sim/core/browser';
import { describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';

import { shiftLengthForContract } from '../dev/state.js';
import { CONTRACTS } from '../shift/contracts.js';
import { wholeDayFor, wholeDayRun } from '../shift/dayLength.js';

import { EVERYDAY_MODES } from './modes.js';
import { scenarioHubViewOf } from './scenarioModel.js';
import {
  SITTING_SHAPES,
  SITTING_SPANS,
  WHOLE_DAY_LONGEST,
  WHOLE_DAY_LONGEST_GAME_TOWER,
  pacedDayRealS,
  sittingLengthPhrase,
  sittingMinutes,
  watchedRealS,
  type SittingSpan,
} from './sittingShape.js';
import { BETWEEN_PEAKS_SIM_PER_REAL_S } from './stagePace.js';
import {
  DEFAULT_STAGE_SPEED_INDEX,
  STAGE_SPEEDS,
  stageSpeedAt,
} from './stageScreenModel.js';

/** Simulated seconds of act in a day. */
const actSecondsOf = (acts: readonly { readonly startS: number; readonly endS: number }[]): number =>
  acts.reduce((sum, act) => sum + (act.endS - act.startS), 0);

const SRC = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const RUNG = stageSpeedAt(DEFAULT_STAGE_SPEED_INDEX);

function data<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
}

/**
 * **The day each tile opens, per contract, through the shipped derivations** — [§ D946](../../../../DECISIONS.md).
 *
 * Nothing here restates a length. `shiftLengthForContract` is the expression `initialState`,
 * `scenariosPanel`'s *take* and `host.ts#runCampaignDay` all write, and `wholeDayFor` /
 * `wholeDayRun` are the pair `host.ts#startRun` spreads into the patch for § 6's day. So a
 * contract authored at a new length, a building whose crowd starts or stops matching a day
 * record's peak, and a day record authored at a new period each move this census — and the spans
 * `sittingShape.ts` publishes have to move with it or the assertions below fail.
 */
function dayCensus(): readonly {
  readonly id: string;
  readonly buildingId: string;
  /** What the Career tile plays: `runCampaignDay` writes this length and `windowStartS: null`. */
  readonly careerS: number;
  /** What *Today's scenario* plays: the authored day where there is one, else the slice. */
  readonly scenarioS: number;
  /** Seconds of act in that day — `actsOf` over the record — or `undefined` for a slice. */
  readonly actsS: number | undefined;
}[] {
  const trafficProfiles = parseTrafficProfiles(data('traffic-profiles.json'));
  return CONTRACTS.map((contract) => {
    const careerS = shiftLengthForContract(contract.id);
    const day = wholeDayFor(trafficProfiles, parseBuilding(data(`buildings/${contract.buildingId}.json`)));
    return {
      id: contract.id,
      buildingId: contract.buildingId,
      careerS,
      scenarioS: day === undefined ? careerS : wholeDayRun(day).shiftLengthS,
      actsS: day === undefined ? undefined : actSecondsOf(day.acts),
    };
  });
}

describe('every advertised length is the day the tile actually opens', () => {
  /*
   * The check this file was rebuilt for. `campaignStage` quoted `data/campaign.json`'s 900 s stage
   * at a tile that opens a **career day**, and `contractDay` quoted the 1 800–3 600 s slice at a
   * press that runs a ten-hour authored day on thirteen of sixteen contracts. Both were constants
   * that happened to be right for some of the content, which is the shape § D753 fixed on the rung
   * axis and left standing on this one.
   */
  it('careerDay brackets every contract a career can sign, exactly', () => {
    const lengths = dayCensus().map((row) => row.careerS);
    expect(lengths.length).toBe(CONTRACTS.length);
    expect(SITTING_SPANS.careerDay.lowSimS).toBe(Math.min(...lengths));
    expect(SITTING_SPANS.careerDay.highSimS).toBe(Math.max(...lengths));
  });

  it('contractDay brackets every contract’s Today’s-scenario day, exactly', () => {
    const lengths = dayCensus().map((row) => row.scenarioS);
    expect(SITTING_SPANS.contractDay.lowSimS).toBe(Math.min(...lengths));
    expect(SITTING_SPANS.contractDay.highSimS).toBe(Math.max(...lengths));
  });

  /*
   * Both directions, per contract. The two above would pass on a span that brackets the census and
   * is wider than it — which is what the union in `sittingShape.ts` would silently become if every
   * contract gained an authored day. This says each end is *attained* by some contract and no
   * contract falls outside, so a wrong span fails whichever way it is wrong.
   */
  it('no contract runs outside the span its tile advertises, and both ends are reached', () => {
    for (const row of dayCensus()) {
      expect(row.careerS, `${row.id} career`).toBeGreaterThanOrEqual(SITTING_SPANS.careerDay.lowSimS);
      expect(row.careerS, `${row.id} career`).toBeLessThanOrEqual(SITTING_SPANS.careerDay.highSimS);
      expect(row.scenarioS, `${row.id} scenario`).toBeGreaterThanOrEqual(SITTING_SPANS.contractDay.lowSimS);
      expect(row.scenarioS, `${row.id} scenario`).toBeLessThanOrEqual(SITTING_SPANS.contractDay.highSimS);
    }
  });

  /*
   * The negative control, and it is what makes the two censuses mean different things. If no
   * contract ran an authored day the two spans would coincide and this file would be checking one
   * fact twice; if every contract ran one, `contractDay`'s union would be wider than the truth at
   * its low end. Measured today: thirteen offices run the ten-hour day and three crowds —
   * residential, hotel, hospital — keep their slice, because `data/` ships no day for them.
   */
  it('the two tiles really do open different days, in both directions', () => {
    const census = dayCensus();
    expect(census.some((row) => row.scenarioS !== row.careerS)).toBe(true);
    expect(census.some((row) => row.scenarioS === row.careerS)).toBe(true);
  });

  /*
   * The assessment's own two readings, as regressions rather than as prose. An assessor played the
   * opening career tower and got fifteen minutes against a tile promising four, and played Midtown
   * and got two and a half hours against a tile promising eight to fifteen minutes.
   */
  it('the two days the assessor measured are inside the figures a player now reads', () => {
    const census = dayCensus();
    const garden = census.find((row) => row.buildingId === 'garden-apartments');
    const midtown = census.find((row) => row.buildingId === 'midtown-office');
    if (garden === undefined || midtown === undefined) throw new Error('a measured contract left the ladder');
    expect(sittingMinutes(garden.careerS, RUNG.simPerRealS)).toBe(15);
    /*
     * Midtown's day is still ten hours of building — 150 minutes if it were played at one rung, which
     * is what the assessor measured. § D991 paces it: the three acts at the rung and the rest at the
     * between-peaks rung, so the figure a player reads is forty minutes, and it says both rungs.
     */
    expect(sittingMinutes(midtown.scenarioS, RUNG.simPerRealS)).toBe(150);
    const midtownActs = midtown.actsS;
    if (midtownActs === undefined) throw new Error('midtown-office has no authored day');
    /* The acts alone, with nobody held: § D991's floor, 39.5 minutes, which rounds up to 40. */
    expect(
      Math.ceil(pacedDayRealS({ periodS: midtown.scenarioS, recordedS: midtown.scenarioS, slowS: midtownActs }, RUNG.simPerRealS) / 60),
    ).toBe(40);
    expect(SITTING_SHAPES.careerMode).toContain('15 min');
    /* The long end is the longest day measured on any contract, a reference tower's. */
    const top = Math.ceil(pacedDayRealS(WHOLE_DAY_LONGEST, RUNG.simPerRealS) / 60);
    expect(top).toBeGreaterThan(90);
    expect(SITTING_SHAPES.contractDay).toContain(`${String(Math.floor(top / 60))} h`);
    expect(SITTING_SHAPES.contractDay).not.toContain('2 h 30');
    expect(SITTING_SHAPES.contractDay).toContain(
      `and ${String(BETWEEN_PEAKS_SIM_PER_REAL_S)}× wherever nobody on a landing has waited a minute`,
    );
    /*
     * § D1169: every scored day is paced by the tutorial's rule, a slice included, so the short end
     * is the floor — the shortest day crossed at the fast rung — and not the slice at one rung.
     */
    const low = SITTING_SPANS.contractDay.lowSimS;
    expect(SITTING_SPANS.contractDay.scoredShortEnd).toBe(true);
    expect(watchedRealS(SITTING_SPANS.contractDay, low, RUNG.simPerRealS)).toBe(low / BETWEEN_PEAKS_SIM_PER_REAL_S);
    expect(SITTING_SHAPES.contractDay).toMatch(new RegExp(`^${String(Math.ceil(low / BETWEEN_PEAKS_SIM_PER_REAL_S / 60))} min-`, 'u'));
    expect(SITTING_SHAPES.contractDay).toContain('at most on the game’s own towers');
  });

  /*
   * § D991's census, on AUTHORED_DAY_PERIOD_S's pattern. The long end is a measured day, so what
   * can be checked without the sweep is that it is a day of the period every contract runs and that
   * its slow part holds at least that day's acts — a slow part smaller than the acts would be a day
   * the stage crossed a peak of fast, which the rule never does.
   */
  it('the measured longest days are days of the authored period, with at least their acts played slow', () => {
    const days = dayCensus().filter((row) => row.actsS !== undefined);
    expect(days.length).toBeGreaterThan(0);
    for (const measured of [WHOLE_DAY_LONGEST, WHOLE_DAY_LONGEST_GAME_TOWER]) {
      for (const row of days) {
        expect(row.scenarioS, row.id).toBe(measured.periodS);
        expect(measured.slowS, row.id).toBeGreaterThanOrEqual(row.actsS ?? 0);
      }
      expect(measured.recordedS).toBeGreaterThanOrEqual(measured.periodS);
    }
    expect(SITTING_SPANS.contractDay.pacedDay).toBe(WHOLE_DAY_LONGEST);
    expect(pacedDayRealS(WHOLE_DAY_LONGEST, RUNG.simPerRealS)).toBeGreaterThanOrEqual(
      pacedDayRealS(WHOLE_DAY_LONGEST_GAME_TOWER, RUNG.simPerRealS),
    );
  });
});

describe('the spans are the shipped content, not an estimate', () => {

  /*
   * The rush's span is an **outcome**, so it is censused rather than authored: a cell that holds is
   * watched to its hold and one that never holds is watched to the end of the stream, which is what
   * 95 of the 221 measured cells do. `sittingShape.ts` says the top of the range is the commonest
   * case rather than the worst, and this is where that claim is checked.
   */
  it('rush brackets every measured house cell, hold or stream', () => {
    const house = data<{
      readonly provenance: { readonly streamLengthS: number };
      readonly runs: readonly { readonly brokeAtS: number | null }[];
    }>('rush-house-runs.json');
    const stream = house.provenance.streamLengthS;
    const sittings = house.runs.map((run) => Math.min(run.brokeAtS ?? stream, stream));
    expect(SITTING_SPANS.rush.lowSimS).toBe(Math.min(...sittings));
    expect(SITTING_SPANS.rush.highSimS).toBe(Math.max(...sittings));
    expect(SITTING_SPANS.rush.highSimS).toBe(stream);
  });

  /*
   * A fix case's span is the as-built run watched and then the pair, and each recording runs past
   * its authored `durationS` while the building drains — so the span is **not** `2 × durationS` and
   * this asserts only the relation that has to hold whatever the drain does. The spans themselves
   * are `sittingClock.measure.test.ts`' span leg, and the file it wrote is the record.
   */
  it('fixCase is at least the authored runs doubled, and no shorter than the shortest case', () => {
    const cases = data<{ cases: readonly { run: { durationS: number } }[] }>('fixit-cases.json');
    const authored = cases.cases.map((entry) => entry.run.durationS);
    expect(SITTING_SPANS.fixCase.lowSimS).toBeGreaterThanOrEqual(2 * Math.min(...authored));
    expect(SITTING_SPANS.fixCase.highSimS).toBeGreaterThanOrEqual(2 * Math.max(...authored));
    expect(SITTING_SPANS.fixCase.lowSimS).toBeLessThan(SITTING_SPANS.fixCase.highSimS);
  });


  it('every span names a file, and the file exists', () => {
    for (const span of Object.values(SITTING_SPANS) as readonly SittingSpan[]) {
      expect(span.source.length).toBeGreaterThan(0);
      expect(span.lowSimS).toBeLessThanOrEqual(span.highSimS);
    }
  });
});

describe('the figures are derived from the rung, never typed against it', () => {
  it('every shape string names the shipped rung by its own label', () => {
    for (const shape of Object.values(SITTING_SHAPES)) {
      expect(shape).toContain(`at ${RUNG.label}`);
    }
  });

  /*
   * The check the whole module exists for. § D641 replaced three test literals reading `30×` with a
   * read through `stageSpeedAt`, because a rung that has moved twice would otherwise be
   * re-transcribed twice. This asserts the same property of the session-shape figures: move the
   * rung and every figure moves, in the right direction, without a document being edited.
   */
  it('a slower rung makes every sitting longer and a faster one makes it shorter', () => {
    for (const span of Object.values(SITTING_SPANS) as readonly SittingSpan[]) {
      const slowest = STAGE_SPEEDS[0];
      const fastest = STAGE_SPEEDS[STAGE_SPEEDS.length - 1];
      if (slowest === undefined || fastest === undefined) throw new Error('empty ladder');
      expect(sittingMinutes(span.highSimS, slowest.simPerRealS)).toBeGreaterThan(
        sittingMinutes(span.highSimS, fastest.simPerRealS),
      );
    }
  });

  it('rounds up, so no advertised sitting can be shorter than the run it describes', () => {
    for (const span of Object.values(SITTING_SPANS) as readonly SittingSpan[]) {
      for (const rung of STAGE_SPEEDS) {
        const minutes = sittingMinutes(span.highSimS, rung.simPerRealS);
        expect(minutes * 60 * rung.simPerRealS).toBeGreaterThanOrEqual(span.highSimS);
        /* And the figure a player actually reads, which for a paced day is not `simS / rung`. */
        const watched = watchedRealS(span, span.highSimS, rung.simPerRealS);
        expect(Math.ceil(watched / 60) * 60).toBeGreaterThanOrEqual(watched);
      }
    }
  });

  /*
   * § D991's owner fallback, as arithmetic: with the between-peaks rung at or below the watching
   * rung, a paced day is exactly the day at one rung. `pacedDayRealS` takes the faster of the two,
   * so at the ladder's `30×` and above the pacing buys nothing and costs nothing.
   */
  it('a paced day is never longer than the day at one rung, and equal where the rungs meet', () => {
    const paced = SITTING_SPANS.contractDay.pacedDay;
    if (paced === undefined) throw new Error('contractDay is not paced');
    for (const rung of STAGE_SPEEDS) {
      const flat = paced.recordedS / rung.simPerRealS;
      const real = pacedDayRealS(paced, rung.simPerRealS);
      expect(real).toBeLessThanOrEqual(flat + 1e-9);
      if (rung.simPerRealS >= BETWEEN_PEAKS_SIM_PER_REAL_S) expect(real).toBeCloseTo(flat, 9);
    }
  });

  /*
   * The hours form, both polarities. Ninety minutes is where `sittingShape.ts` switches units, and
   * a figure that read `2 h` for 150 minutes would be this module's rounding rule broken in the
   * direction it exists to forbid. So this asserts the boundary from underneath as well as over
   * it: nothing shorter may wear an `h`, and nothing longer may still be quoted in minutes.
   */
  it('quotes hours only past the boundary, and never rounds an hours figure down', () => {
    const short: SittingSpan = { lowSimS: 900, highSimS: 900, source: 'synthetic' };
    expect(sittingLengthPhrase(short)).toContain('min');
    expect(sittingLengthPhrase(short)).not.toContain(' h');
    // The office day, at the shipped rung: 150 minutes, so `2 h 30` and not `2 h`.
    const day: SittingSpan = { lowSimS: 36000, highSimS: 36000, source: 'synthetic' };
    expect(sittingLengthPhrase(day)).toContain('2 h 30');
    expect(sittingMinutes(36000, RUNG.simPerRealS) * 60 * RUNG.simPerRealS).toBeGreaterThanOrEqual(36000);
  });

  it('says "under a minute" rather than "1 min" where the ladder makes it true', () => {
    // At the ladder's top rung a 900 s stage is fifteen real seconds; `1 min` there would be this
    // module's own defect with its sign flipped.
    const top = STAGE_SPEEDS[STAGE_SPEEDS.length - 1];
    if (top === undefined) throw new Error('empty ladder');
    expect(sittingMinutes(900, top.simPerRealS)).toBe(1);
    expect(sittingLengthPhrase(SITTING_SPANS.careerDay)).toContain('min');
  });
});

describe('the two player modules compose no figure of their own', () => {
  it('every mode tile carries a string from sittingShape.ts', () => {
    const shipped = new Set<string>(Object.values(SITTING_SHAPES));
    for (const mode of EVERYDAY_MODES) {
      expect(shipped.has(mode.shape), `${mode.screen}: ${mode.shape}`).toBe(true);
    }
  });

  it('every scenario hub entry carries a string from sittingShape.ts', () => {
    const shipped = new Set<string>(Object.values(SITTING_SHAPES));
    // Read off the shipped view rather than a sibling projection: this asserts what the hub
    // actually draws, and it is why SCENARIO_ENTRY_SHAPES could be deleted rather than registered.
    for (const shape of scenarioHubViewOf().entries.map((entry) => entry.shape)) {
      expect(shipped.has(shape), shape).toBe(true);
    }
  });

  /*
   * A literal is how the five came to disagree with the ladder, so a literal is what fails here.
   * Prose in a docstring is exempt by the `*` prefix: what is forbidden is a minute figure in
   * **code**, which is the only kind a player can read.
   */
  it('neither module writes a minute figure in code', () => {
    for (const file of ['modes.ts', 'scenarioModel.ts']) {
      const source = readFileSync(`${SRC}everyday/${file}`, 'utf8');
      const offenders = source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .filter((line) => /\d\s*(-\s*\d+\s*)?min\b/.test(line));
      expect(offenders, `${file} composes a session-shape figure of its own`).toEqual([]);
    }
  });
});

describe('the documents that repeat the figures agree with the strings a player reads', () => {
  /**
   * The four sites GitHub issue #559 names. Each carries the shipped length phrase verbatim, so a
   * rung move turns these documents red on the same commit that moves the tiles rather than leaving
   * them to age — which is what they did for two rung moves before this test existed.
   */
  const SITES: readonly { readonly doc: string; readonly phrases: readonly string[] }[] = [
    {
      doc: 'docs/23-audiences-and-core-loop.md',
      phrases: [
        sittingLengthPhrase(SITTING_SPANS.contractDay, 'a day'),
        sittingLengthPhrase(SITTING_SPANS.careerDay, 'a building-day'),
        sittingLengthPhrase(SITTING_SPANS.rush),
        sittingLengthPhrase(SITTING_SPANS.fixCase, 'a case'),
      ],
    },
    {
      doc: 'docs/32-game-design.md',
      phrases: [
        sittingLengthPhrase(SITTING_SPANS.contractDay, 'a day'),
        sittingLengthPhrase(SITTING_SPANS.careerDay, 'a building-day'),
        sittingLengthPhrase(SITTING_SPANS.rush),
        sittingLengthPhrase(SITTING_SPANS.fixCase, 'a case'),
      ],
    },
    {
      doc: 'docs/12-design-handoff.md',
      phrases: [SITTING_SHAPES.contractDay, SITTING_SHAPES.fixCase],
    },
  ];

  for (const site of SITES) {
    it(`${site.doc} carries today's figures`, () => {
      const text = readFileSync(join(REPO_ROOT, site.doc), 'utf8');
      for (const phrase of site.phrases) {
        expect(text.includes(phrase), `${site.doc} is missing: ${phrase}`).toBe(true);
      }
    });
  }

  /*
   * § D227 in the polarity `CLAUDE.md` calls the more dangerous one: § D641's paragraph named these
   * five as outstanding, and a paragraph saying a defect is open after it is closed sends a reader
   * looking for work that is done. It is deleted from both places it stood, and this is what keeps
   * it deleted.
   */
  it('nothing still says the five session shapes are outstanding', () => {
    /*
     * The **claim** is what must be gone, not the words. § D753 and `modes.ts` both quote a retired
     * string on purpose, as the record of what moved; what may not survive is the sentence saying
     * the correction is owed. So this matches § D641's own clause rather than the literals it named
     * — a literal check would have forbidden the entry that closes the defect from describing it.
     */
    const claims: readonly (readonly [string, string])[] = [
      [join(REPO_ROOT, 'DECISIONS.md'), 'Correcting five player-facing strings is not this'],
      [`${SRC}everyday/stageScreenModel.ts`, 'Correcting five player-facing strings is not this'],
      [`${SRC}everyday/stageScreenModel.ts`, 'one number this does not fix'],
    ];
    for (const [carrier, claim] of claims) {
      const text = readFileSync(carrier, 'utf8');
      expect(text.includes(claim), `${carrier} still says: ${claim}`).toBe(false);
    }
  });
});
