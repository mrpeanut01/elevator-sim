/**
 * **WHY IT DID THAT**, against a real instrumented run and against the states one will not show.
 *
 * The property worth the run time is the last one in the file: **no row may name a floor or a car
 * the recording does not draw**. A rail that echoed a decision's own `carLabel` would pass every
 * other check here and still announce a shaft that is not on the canvas beside it — which is
 * reachable, because `record/document.ts` loads recordings from files this build did not write.
 *
 * The term phrase table is checked against `data/dispatcher-profiles.json` itself, so a term
 * renamed or reworded in `data/` fails a test rather than producing a rail row that describes a
 * cost term the dispatcher no longer has.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type LoadedConfig } from '@elevator-sim/core';
import { beforeAll, describe, expect, it } from 'vitest';

import type { VizDecision, VizRecording } from '../contract/types.js';
import { DATA_DIR, breadthConfig } from '../fixtures.test-helper.js';
import { recordRun } from '../record/recordRun.js';

import { TERM_PHRASES, decisionRowsAt } from './decisions.js';
import { syntheticRecording } from './synthetic.test-helper.js';

const BUILDING_ID = 'midtown-office';

let config: LoadedConfig;
let recording: VizRecording;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  recording = recordRun(breadthConfig(config, BUILDING_ID)).recording;
}, 300_000);

function sampleTimes(source: VizRecording): readonly number[] {
  const span = source.endedAt - source.startedAt;
  return Array.from({ length: 9 }, (_unused, i) => source.startedAt + (span * i) / 8);
}

describe('the phrase table is the cost-term library’s own wording', () => {
  it('names every shipped term, and quotes what `data/` says it measures and serves', async () => {
    const raw = await readFile(join(DATA_DIR, 'dispatcher-profiles.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      terms: readonly { id: string; measures: string; serves: string }[];
    };
    expect(Object.keys(TERM_PHRASES).sort((a, b) => a.localeCompare(b))).toEqual(
      parsed.terms.map((term) => term.id).sort((a, b) => a.localeCompare(b)),
    );
    for (const term of parsed.terms) {
      const phrase = TERM_PHRASES[term.id];
      expect(phrase, term.id).toBeDefined();
      // Lower-cased to sit inside a sentence, and otherwise verbatim.
      expect(phrase?.measures).toBe(
        term.measures.charAt(0).toLowerCase() + term.measures.slice(1),
      );
      expect(phrase?.serves).toBe(term.serves);
    }
  });
});

describe(`${BUILDING_ID} — the log reads the run`, () => {
  it('records decisions at all, so the rest of this file is not vacuous', () => {
    expect(recording.decisions.length).toBeGreaterThan(0);
  }, 300_000);

  it('is newest first, at or before the playhead, and never longer than the limit', () => {
    for (const t of sampleTimes(recording)) {
      const rows = decisionRowsAt(recording, t);
      expect(rows.length).toBeLessThanOrEqual(6);
      const times = rows
        .filter((row) => row.outcome !== 'empty')
        .map((row) => Number(row.key.split('-')[0]));
      for (let index = 1; index < times.length; index += 1) {
        expect(times[index] ?? 0).toBeLessThanOrEqual(times[index - 1] ?? 0);
      }
      for (const at of times) expect(at).toBeLessThanOrEqual(t + 1e-9);
    }
  }, 300_000);

  it('honours a caller that wants a different row count', () => {
    const rows = decisionRowsAt(recording, recording.endedAt, 3);
    expect(rows).toHaveLength(3);
  }, 300_000);

  it('never names a floor or a car this recording does not draw', () => {
    const floorTokens = new Set([
      ...recording.floors.map((floor) => floor.label ?? floor.id),
      ...recording.floors.map((floor) => floor.id),
    ]);
    const carTokens = new Set(recording.shafts.map((shaft) => shaft.label));
    for (const t of sampleTimes(recording)) {
      for (const row of decisionRowsAt(recording, t, 6)) {
        if (row.outcome === 'empty') continue;
        // `head` is `<car> <arrow> <floor>` or `no car for <floor>`. Both end in the floor label.
        const floorPart = row.head.startsWith('no car for ')
          ? row.head.slice('no car for '.length)
          : (row.head.split(/ [→⇄] /)[1] ?? '');
        expect(floorTokens.has(floorPart), `${row.head} → "${floorPart}"`).toBe(true);
        if (!row.head.startsWith('no car for ')) {
          const carPart = row.head.split(/ [→⇄] /)[0] ?? '';
          expect(carTokens.has(carPart), `${row.head} → "${carPart}"`).toBe(true);
        }
      }
    }
  }, 300_000);

  it('gives the same rows scrubbing backwards as forwards', () => {
    const times = sampleTimes(recording);
    const forwards = times.map((t) => JSON.stringify(decisionRowsAt(recording, t)));
    const backwards = [...times]
      .reverse()
      .map((t) => JSON.stringify(decisionRowsAt(recording, t)))
      .reverse();
    expect(backwards).toEqual(forwards);
  }, 300_000);

  it('says something with a number in it on every assignment row', () => {
    const rows = decisionRowsAt(recording, recording.endedAt, 6).filter(
      (row) => row.outcome === 'assigned' || row.outcome === 'reassigned',
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.why).toMatch(/\d/);
      // The margin is dimensionless — a weighted cost. Never dressed as seconds.
      expect(row.why).not.toMatch(/ s clear of/);
    }
  }, 300_000);
});

/* -------------------------------------------------------------------------- *
 * The states a real run will not produce on demand
 * -------------------------------------------------------------------------- */

function decision(overrides: Partial<VizDecision> = {}): VizDecision {
  return {
    at: 120,
    callId: 'call-1',
    outcome: 'assigned',
    floorId: 'L2',
    direction: 'up',
    carId: 'main-A',
    carLabel: 'A',
    cost: 4.2,
    runnerUpCost: 4.62,
    eligibleCars: 2,
    terms: [{ termId: 'waitTime', weight: 1, raw: 12.4, contribution: 3.1 }],
    ...overrides,
  };
}

describe('the empty state is the design’s', () => {
  it('draws one *standing by* row when the recording carries no decision', () => {
    const rows = decisionRowsAt(syntheticRecording(), 300);
    expect(rows).toEqual([
      {
        key: 'standing-by',
        t: '06:05',
        head: 'standing by',
        why: 'no calls registered yet — the building is still waking up',
        title: 'no calls registered yet — the building is still waking up',
        color: 'var(--faint)',
        outcome: 'empty',
      },
    ]);
  });

  it('draws it before the first decision, too', () => {
    const rows = decisionRowsAt(syntheticRecording({ decisions: [decision()] }), 60);
    expect(rows[0]?.outcome).toBe('empty');
  });
});

describe('the three outcomes each say something honest', () => {
  it('assigns with the dominant term’s raw value and a dimensionless margin', () => {
    const row = decisionRowsAt(syntheticRecording({ decisions: [decision()] }), 300)[0];
    expect(row?.head).toBe('A → Level 2');
    expect(row?.why).toBe('waitTime 12.4 s carried it · 0.42 clear of the next car');
    expect(row?.t).toBe('06:02');
    expect(row?.color).toBe('var(--band-0)');
  });

  it('does not call a reassignment an assignment', () => {
    const row = decisionRowsAt(
      syntheticRecording({ decisions: [decision({ outcome: 'reassigned' })] }),
      300,
    )[0];
    expect(row?.head).toBe('A ⇄ Level 2');
    expect(row?.color).toBe('var(--band-1)');
  });

  it('says nobody may answer when nobody bid', () => {
    const row = decisionRowsAt(
      syntheticRecording({
        decisions: [
          decision({
            outcome: 'unassigned',
            carId: undefined,
            carLabel: undefined,
            cost: undefined,
            runnerUpCost: undefined,
            eligibleCars: 0,
            terms: [],
            reason: 'no-eligible-car',
            waitingPassengers: 4,
          }),
        ],
      }),
      300,
    )[0];
    expect(row?.head).toBe('no car for Level 2');
    /*
     * Once, not twice. `no-eligible-car` is `core`'s reason for the clause the row already opens
     * with, so appending its phrase gave *"no car may answer this call · no car in the group may
     * answer this call"* — the same sentence said again. It is not hypothetical: Secure Tower under
     * `collective` produces that row on every credentialed floor, six at a time, and the rail shows
     * six rows.
     */
    expect(row?.why).toBe('no car may answer this call · 4 standing there');
    expect(row?.why.match(/no car/g)).toHaveLength(1);
    expect(row?.color).toBe('var(--band-3)');
  });

  it('distinguishes that from cars bidding and none being able to take it', () => {
    const row = decisionRowsAt(
      syntheticRecording({
        decisions: [
          decision({
            outcome: 'unassigned',
            carId: undefined,
            carLabel: undefined,
            cost: undefined,
            runnerUpCost: undefined,
            eligibleCars: 5,
            terms: [],
          }),
        ],
      }),
      300,
    )[0];
    expect(row?.why).toBe('5 cars bid and none could take it');
  });

  it('says *the only car* rather than inventing a margin against nobody', () => {
    const row = decisionRowsAt(
      syntheticRecording({
        decisions: [decision({ eligibleCars: 1, runnerUpCost: undefined })],
      }),
      300,
    )[0];
    expect(row?.why).toBe('waitTime 12.4 s carried it · the only car that could take it');
  });

  it('falls back to the design’s sentence when every term priced the same', () => {
    const row = decisionRowsAt(
      syntheticRecording({ decisions: [decision({ terms: [] })] }),
      300,
    )[0];
    expect(row?.why).toBe("cheapest bid on the group's own cost · 0.42 clear of the next car");
  });

  it('names the gap rather than a shaft it cannot draw', () => {
    const row = decisionRowsAt(
      syntheticRecording({ decisions: [decision({ carId: 'ghost-Z', carLabel: 'Z' })] }),
      300,
    )[0];
    expect(row?.head).toBe('a car outside this recording → Level 2');
    expect(row?.head).not.toContain('Z');
  });

  it('carries the term library’s wording into the tooltip', () => {
    const row = decisionRowsAt(syntheticRecording({ decisions: [decision()] }), 300)[0];
    expect(row?.title).toContain('estimated wait for the new passenger');
    expect(row?.title).toContain('serves AWT');
  });
});
