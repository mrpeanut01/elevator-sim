/**
 * **The Career's front page** — GitHub issue #536's permitted half, wave AN lane AP-3,
 * [§ D1301](../../../../DECISIONS.md): the intro a fresh career opens on, the tower cards' colour,
 * and the contract as a document.
 *
 * The card colour is graded off **real** recordings: Garden Apartments for its contract hour at a
 * pinned seed and crowd, measured on this tree to put its longest wait in the third band (83.6 s,
 * `checking watch`). A synthetic recording would let the test choose the band it then asserts.
 */

import { loadConfig, type LoadedConfig, type SimulationConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import { applyCampaignAction, needOf, openingCareer, type CampaignCareer } from '../campaign/career.js';
import { SERVICE_AT_TRIPS } from '../campaign/career.js';
import type { VizRecording } from '../contract/types.js';
import { DATA_DIR, fixtureConfig } from '../fixtures.test-helper.js';
import { WAIT_BANDS } from '../live/bands.js';
import { shippedPriceSchedule } from '../pricing/schedule.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import { DIFFICULTIES, DIFFICULTY_IDS } from '../campaign/economy.js';
import { GOAL_OBSERVATION_IDS } from '../shift/types.js';

import {
  CAREER_INTRO_COPY,
  TOWER_CARD_COPY,
  contractDocumentOf,
  contractView,
  filedDayBandOf,
  towersView,
  type CampaignInput,
  type FiledDayRecord,
} from './campaignModel.js';

const BUILDINGS = new Map([
  ['garden-apartments', { name: 'Garden Apartments', spec: '7 floors · 2 cars · 0.63 m/s · 240 people' }],
]);

function inputOf(career: CampaignCareer, patch: Partial<CampaignInput> = {}): CampaignInput {
  return {
    schedule: shippedPriceSchedule(),
    career,
    buildings: BUILDINGS,
    dispatchers: [{ id: 'collective', name: 'Collective control', note: undefined, saved: false }],
    observations: undefined,
    observationsBasis: 'whole-run',
    history: [],
    ...patch,
  };
}

/** The opening career, with day 1 filed — so it is no longer fresh, and the card has a day. */
function afterDayOne(): CampaignCareer {
  return applyCampaignAction(
    openingCareer('collective'),
    { kind: 'file-day', towerId: 'c1', verdict: 'cleared', trips: 300 },
    shippedPriceSchedule(),
  );
}

describe('the tower cards take their colour from the filed day’s recording — #536, § D716 § 3', () => {
  /** Longest wait 83.6 s: the third band. */
  let THIRD: VizRecording;
  /** Longest wait 29.3 s: the first band. */
  let CALM: VizRecording;
  let loaded: LoadedConfig;

  beforeAll(async () => {
    loaded = await loadConfig(DATA_DIR);
    const hour: SimulationConfig = fixtureConfig(loaded, {
      buildingId: 'garden-apartments',
      durationS: 3600,
      seed: 424242n,
      onTimeout: 'report',
    });
    CALM = recordRun(hour, { recordDecisions: false }).recording;
    THIRD = recordRun({ ...hour, demand: { arrivalRatePctPop5min: 20 } }, { recordDecisions: false }).recording;
  });

  const filedOf = (recording: VizRecording): ReadonlyMap<string, FiledDayRecord> =>
    new Map([['c1', { towerId: 'c1', day: 1, verdict: 'cleared' as const, recording }]]);

  it('reads the band off the recording: a third-band landing colours the card third-band', () => {
    expect(filedDayBandOf(THIRD).index).toBe(2);
    expect(filedDayBandOf(CALM).index).toBe(0);
    const career = afterDayOne();
    /* The desk wants nothing from this tower — the colour cannot have come from there. */
    expect(needOf(career.towers[0]!)).toBeUndefined();
    const card = towersView(inputOf(career, { filedDays: filedOf(THIRD) })).cards.rows[0];
    expect(card?.bandIndex).toBe(2);
    expect(card?.color).toBe(WAIT_BANDS[2]?.color);
    expect(card?.status).toBe('The longest wait was between 60 and 120 s.');
    expect(card?.filed).toBe('Day 1 · cleared');
    expect(card?.playable).toBe(true);
  });

  it('never derives the colour from the desk: a tower the desk wants keeps its recording’s colour', () => {
    const quiet = afterDayOne();
    const worn: CampaignCareer = {
      ...quiet,
      towers: [{ ...quiet.towers[0]!, trips: SERVICE_AT_TRIPS * 2 }],
    };
    expect(needOf(worn.towers[0]!), 'the desk wants a decision on this tower').toBeDefined();
    for (const recording of [THIRD, CALM]) {
      const asQuiet = towersView(inputOf(quiet, { filedDays: filedOf(recording) })).cards.rows[0];
      const asWanted = towersView(inputOf(worn, { filedDays: filedOf(recording) })).cards.rows[0];
      expect(asWanted?.bandIndex).toBe(asQuiet?.bandIndex);
      expect(asWanted?.color).toBe(asQuiet?.color);
      expect(asWanted?.status).toBe(asQuiet?.status);
    }
    /* And with no filed day the desk's need draws no colour at all. */
    const unfiled = towersView(inputOf(worn)).cards.rows[0];
    expect(unfiled?.color).toBeUndefined();
    expect(unfiled?.bandIndex).toBeUndefined();
    expect(unfiled?.playable).toBe(false);
    expect(unfiled?.status).toBe(TOWER_CARD_COPY.nothingFiled);
  });
});

describe('a fresh career opens on an intro to the career and to chimes — #536', () => {
  it('draws the intro on a fresh career, with the chimes half, and not once a day is filed', () => {
    const fresh = towersView(inputOf(openingCareer('collective')));
    expect(fresh.intro?.heading).toBe(CAREER_INTRO_COPY.heading);
    expect(fresh.intro?.paragraphs.join(' ')).toContain('twenty working days');
    expect(fresh.intro?.paragraphs.join(' ')).toContain('Nothing files a day without you');
    /* The second slot's standing is read from SLOTS, never typed. */
    expect(fresh.intro?.paragraphs.join(' ')).toContain('the second opens at 14.');
    expect(fresh.intro?.chimesHeading).toBe('CHIMES');
    expect(fresh.intro?.chimes.join(' ')).toContain('Chimes are what finishing something pays you');
    expect(fresh.intro?.chimes.join(' ')).toContain('never buy back a missed day');
    expect(towersView(inputOf(afterDayOne())).intro).toBeUndefined();
  });
});

describe('the contract reads like a contract, inside § D716 § 4’s bound — #536', () => {
  it('has no level reading a field outside GOAL_OBSERVATION_IDS: max wait, and never an average', () => {
    for (const id of DIFFICULTY_IDS) {
      const document = contractDocumentOf('Garden Apartments', DIFFICULTIES[id]);
      const levels = document.clauses.flatMap((clause) => clause.levels ?? []);
      expect(levels.length, id).toBe(4);
      for (const level of levels) expect(GOAL_OBSERVATION_IDS as readonly string[]).toContain(level.reads);
      expect(levels.map((level) => level.reads)).toContain('worstWaitS');
      const words = [
        document.title,
        document.parties,
        ...document.clauses.flatMap((clause) => [clause.heading, clause.body, clause.basisNote ?? '', ...(clause.levels ?? []).map((level) => level.text)]),
      ].join(' ');
      expect(words, id).not.toMatch(/\baverage\b|\bmean\b/iu);
      /* No energy grade: no level on energy, and no grade, letter, star or score anywhere. */
      expect(levels.map((level) => level.reads)).not.toContain('workPerServedLegKJ');
      expect(words, id).not.toMatch(/energy|\bkJ\b|\bgrade\b|\bstars?\b|\bscore\b/iu);
      /* The worst-wait level is the difficulty's own bar. */
      expect(levels.find((level) => level.reads === 'worstWaitS')?.text).toContain(String(DIFFICULTIES[id].tests.worstS));
    }
  });

  it('says where every threshold comes from: a cited source, or that it is the game’s own', () => {
    const document = contractDocumentOf('Garden Apartments', DIFFICULTIES.standard);
    const clause = document.clauses.find((entry) => entry.levels !== undefined);
    for (const level of clause?.levels ?? []) {
      expect(['assumed', 'cited']).toContain(level.basis.kind);
      if (level.basis.kind === 'cited') expect(level.basis.source.length).toBeGreaterThan(0);
    }
    /* Every shipped level is assumed, and the sheet says so in words beneath them. */
    expect((clause?.levels ?? []).every((level) => level.basis.kind === 'assumed')).toBe(true);
    expect(clause?.basisNote).toContain('None is taken from a study');
    /* And nothing calls a level research-based without a citation behind it. */
    const all = JSON.stringify(document);
    if (/research/iu.test(all)) {
      expect((clause?.levels ?? []).some((level) => level.basis.kind === 'cited')).toBe(true);
    }
  });

  it('is the sheet the contract screen draws, and its terms row names the difficulty’s own worst-wait bar', () => {
    const career = openingCareer('collective');
    const view = contractView(inputOf(career));
    expect(view?.document).toEqual(contractDocumentOf('Garden Apartments', DIFFICULTIES.standard));
    const easy = applyCampaignAction(career, { kind: 'set-difficulty', towerId: 'c1', difficultyId: 'easy' }, shippedPriceSchedule());
    expect(contractView(inputOf(easy))?.terms.rows[3]?.label).toBe('Nobody over 240 s, any day');
    expect(contractView(inputOf(easy))?.document.parties).toContain('Easy terms');
  });
});
