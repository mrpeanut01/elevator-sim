/**
 * **How long one dispatcher holds across the Rush's cards** — the instrument behind
 * [§ D1636](../../../../DECISIONS.md)'s table, and the measurement `data/rush-cards.json`'s tuned
 * lines and incident schedule were set against.
 *
 * The owner's requirement is that *the time the building lasts is relatively consistent with the
 * same dispatcher between wave models*, and that consecutive runs are not too inconsistent. So for
 * every building and dispatcher below, each wave model is played on several mornings through the
 * path a player's rush takes, and two things are read:
 *
 * - **between models**: each round's held time against the classic climb's on the same building and
 *   dispatcher, as a ratio, and the median of those ratios per model;
 * - **between mornings**: the coefficient of variation of the held time over the rolls of one
 *   building, dispatcher and model, and its median over the cells.
 *
 * These are descriptions of one seed set and say nothing about which dispatcher is better: no two
 * dispatchers are compared, and a ratio is one run against one run.
 *
 * Gated on `RUSH_CARD_SPREAD=1` and written to `RUSH_CARD_SPREAD_OUT` (vitest swallows
 * `console.log`):
 *
 * ```
 * RUSH_CARD_SPREAD=1 RUSH_CARD_SPREAD_OUT=/tmp/rush-card-spread.json \
 *   npx vitest run --project viz src/everyday/rushCardSpread.sweep.test.ts
 * ```
 */

import { writeFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BrowserResources } from '../dev/data.js';
import { initialState, shiftRunConfigOf, withBuilding, withDispatcher } from '../dev/state.js';
import { recordRun } from '../record/recordRun.js';
import { RUSH_CARDS, rushPlayOf } from '../shift/rushPlay.js';

import { RUSH_SEED, rushHoldAt, rushPatchOf } from './rush.js';
import { loadRushHouseResources } from './rushHouse.test-helper.js';

const OPEN = process.env['RUSH_CARD_SPREAD'] === '1';
const OUT = process.env['RUSH_CARD_SPREAD_OUT'];

const BUILDINGS = [
  'ashgate',
  'chancery-house',
  'crown-hotel',
  'garden-apartments',
  'harbour-point',
  'midtown-office',
  'secure-tower',
  'st-jude-hospital',
  'mixed-use-high-rise',
] as const;
const DISPATCHERS = ['collective', 'nearest-car', 'eta', 'predictive-balanced'] as const;
const ROLLS = [1, 2, 3, 4] as const;

interface Row {
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly model: string;
  readonly roll: number;
  readonly heldS: number | null;
  readonly incidents: number;
}

const rows: Row[] = [];
let resources: BrowserResources;

function heldOf(buildingId: string, dispatcherId: string, card: { model: string; roll: number }): Row {
  const standing = withDispatcher(withBuilding(initialState(resources, RUSH_SEED), resources, buildingId), resources, dispatcherId);
  const patch = rushPatchOf(resources, standing, [], undefined, card);
  if (patch === undefined) throw new Error(`no building ${buildingId}`);
  const plan = shiftRunConfigOf(resources, { ...standing, ...patch });
  const play = rushPlayOf(plan.config.building, card);
  const { recording } = recordRun(plan.config, { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds });
  const holdAt = rushHoldAt(recording, play.line);
  return {
    buildingId,
    dispatcherId,
    model: card.model,
    roll: card.roll,
    heldS: holdAt === undefined ? null : holdAt - recording.startedAt,
    incidents: play.incidents.length,
  };
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

describe.skipIf(!OPEN)('the rush cards hold about as long as each other', () => {
  beforeAll(async () => {
    resources = await loadRushHouseResources();
  });

  it.each(BUILDINGS)('plays every card on %s', (buildingId) => {
    for (const dispatcherId of DISPATCHERS) {
      rows.push(heldOf(buildingId, dispatcherId, { model: 'climb', roll: 0 }));
      for (const model of RUSH_CARDS.waveModels) {
        for (const roll of ROLLS) rows.push(heldOf(buildingId, dispatcherId, { model: model.id, roll }));
      }
    }
    expect(rows.length).toBeGreaterThan(0);
  });

  afterAll(() => {
    if (!OPEN) return;
    const classic = new Map(rows.filter((row) => row.model === 'climb' && row.roll === 0).map((row) => [`${row.buildingId}|${row.dispatcherId}`, row.heldS]));
    const summary = RUSH_CARDS.waveModels.map((model) => {
      const mine = rows.filter((row) => row.model === model.id && row.roll !== 0 && row.heldS !== null);
      const ratios = mine.flatMap((row) => {
        const base = classic.get(`${row.buildingId}|${row.dispatcherId}`);
        return base === null || base === undefined || row.heldS === null ? [] : [row.heldS / base];
      });
      const cells = new Map<string, number[]>();
      for (const row of mine) {
        const key = `${row.buildingId}|${row.dispatcherId}`;
        cells.set(key, [...(cells.get(key) ?? []), row.heldS ?? 0]);
      }
      const cvs = [...cells.values()]
        .filter((held) => held.length === ROLLS.length)
        .map((held) => {
          const mean = held.reduce((sum, value) => sum + value, 0) / held.length;
          return Math.sqrt(held.reduce((sum, value) => sum + (value - mean) ** 2, 0) / held.length) / mean;
        });
      const sorted = [...ratios].sort((a, b) => a - b);
      return {
        model: model.id,
        linePeople: model.holdLine.people,
        rounds: mine.length,
        medianRatioToClimb: Number(median(ratios).toFixed(3)),
        p10: Number((sorted[Math.floor(sorted.length / 10)] ?? 0).toFixed(3)),
        p90: Number((sorted[Math.floor((sorted.length * 9) / 10)] ?? 0).toFixed(3)),
        medianMorningCv: Number(median(cvs).toFixed(3)),
        worstMorningCv: Number(Math.max(0, ...cvs).toFixed(3)),
      };
    });
    if (OUT !== undefined) writeFileSync(OUT, `${JSON.stringify({ buildings: BUILDINGS, dispatchers: DISPATCHERS, rolls: ROLLS, summary, rows }, null, 1)}\n`);
    for (const entry of summary) {
      // The bounds the published table has to sit inside. A model outside them is a finding to retune on.
      expect(entry.medianRatioToClimb, entry.model).toBeGreaterThan(0.9);
      expect(entry.medianRatioToClimb, entry.model).toBeLessThan(1.12);
      expect(entry.medianMorningCv, entry.model).toBeLessThan(0.12);
    }
  });
});
