/**
 * **Running the forty** — that every case runs, that progress is reported as it goes, and that a
 * gauntlet which did not finish reports **nothing** (GAMEPLAY § 20.10, `dev/batchWorker.ts`'s own
 * cancellation rule one level up).
 *
 * The worker is a double that answers each `postMessage` synchronously, which is the whole reason
 * `runGauntlet` takes a factory: the real one is a bundler seam and a DOM global, and a module
 * holding one cannot be driven without a browser.
 */

import { describe, expect, it } from 'vitest';

import { fakeArm, fakeReplication } from '../batch/fixtures.test-helper.js';
import type { BatchRequest, BatchResult, BatchWorkerMessage } from '../batch/types.js';

import { proofCasesOf, type ProofCaseSet } from './proofCases.js';
import { RATING_METRIC, type RatingSummary } from './rating.js';
import { runGauntlet, GAUNTLET_CANCELLED, type GauntletWorker } from './run.js';

const SET: ProofCaseSet = {
  version: 1,
  towers: [
    { id: 'tower-a', arrivalRatePctPop5min: 1, why: 'a' },
    { id: 'tower-b', arrivalRatePctPop5min: 2, why: 'b' },
  ],
  crowds: [
    { id: 'one', label: 'The morning', tests: 't', durationS: 900, demand: {} },
    { id: 'two', label: 'The evening', tests: 't', durationS: 600, demand: {} },
  ],
};

const nameOf = (id: string): string => (id === 'tower-a' ? 'Tower A' : 'Tower B');

function resultWith(pct: number): BatchResult {
  return {
    buildingId: 'tower-a',
    buildingName: 'Tower A',
    seed: '1',
    durationS: 900,
    arrivalRatePctPop5min: null,
    arms: [
      fakeArm('candidate', 'eta', [
        fakeReplication(0, 10, { metrics: { [RATING_METRIC]: pct } }),
      ]),
    ],
    crn: { traceKey: 'k', checkedComparisons: 0, mismatches: [], aligned: true },
    elapsedMs: 1,
  };
}

/** A worker that answers synchronously, recording the request it was posted. */
function doubleFor(
  answer: (posted: number) => BatchWorkerMessage | 'silent',
  posted: BatchRequest[],
): () => GauntletWorker {
  return () => {
    let handler: ((event: { data: unknown }) => void) | undefined;
    let terminated = false;
    return {
      postMessage: (message: { readonly request: BatchRequest }) => {
        posted.push(message.request);
        const reply = answer(posted.length - 1);
        if (reply !== 'silent' && !terminated) handler?.({ data: reply });
      },
      terminate: () => {
        terminated = true;
      },
      addEventListener: (type: string, listener: unknown) => {
        if (type === 'message') handler = listener as (event: { data: unknown }) => void;
      },
    } as unknown as GauntletWorker;
  };
}

describe('the forty run', () => {
  it('runs every case once, in the list’s own order, each on its own seed', () => {
    const posted: BatchRequest[] = [];
    let finished: RatingSummary | undefined;
    runGauntlet({
      set: SET,
      dispatcherProfileId: 'eta',
      replications: 1,
      towerNameOf: nameOf,
      createWorker: doubleFor(() => ({ kind: 'done', result: resultWith(20) }), posted),
      onProgress: () => {},
      onFinished: (summary) => {
        finished = summary;
      },
      onStopped: () => {
        throw new Error('a finished gauntlet must not stop');
      },
    });
    const cases = proofCasesOf(SET);
    expect(posted).toHaveLength(cases.length);
    expect(posted.map((request) => request.seed)).toEqual(cases.map((entry) => entry.seed));
    expect(finished?.rating).toBe(80);
    expect(finished?.casesTotal).toBe(cases.length);
    expect(finished?.complete).toBe(true);
  });

  it('reports where the reader is, in the case’s own words, before each case', () => {
    const lines: string[] = [];
    runGauntlet({
      set: SET,
      dispatcherProfileId: 'eta',
      replications: 1,
      towerNameOf: nameOf,
      createWorker: doubleFor(() => ({ kind: 'done', result: resultWith(20) }), []),
      onProgress: (progress) => lines.push(progress.line),
      onFinished: () => {},
      onStopped: () => {},
    });
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Proof case 1 of 4 — Tower A · The morning');
    expect(lines[3]).toBe('Proof case 4 of 4 — Tower B · The evening');
  });

  it('runs each arm as the dispatcher it was sent with, one arm per case', () => {
    const posted: BatchRequest[] = [];
    runGauntlet({
      set: SET,
      dispatcherProfileId: 'my-dispatcher',
      replications: 1,
      towerNameOf: nameOf,
      createWorker: doubleFor(() => ({ kind: 'done', result: resultWith(20) }), posted),
      onProgress: () => {},
      onFinished: () => {},
      onStopped: () => {},
    });
    for (const request of posted) {
      expect(request.arms).toHaveLength(1);
      expect(request.arms[0]?.dispatcherProfileId).toBe('my-dispatcher');
    }
  });
});

describe('a gauntlet that did not finish reports nothing', () => {
  it('cancels, and the rating is not published over the cases it did run', () => {
    const posted: BatchRequest[] = [];
    let finished = false;
    let stopped: string | undefined;
    const handle = runGauntlet({
      set: SET,
      dispatcherProfileId: 'eta',
      replications: 1,
      towerNameOf: nameOf,
      /* Silent after the first case, so the gauntlet is genuinely mid-run when it is cancelled. */
      createWorker: doubleFor(
        (index) => (index === 0 ? { kind: 'done', result: resultWith(20) } : 'silent'),
        posted,
      ),
      onProgress: () => {},
      onFinished: () => {
        finished = true;
      },
      onStopped: (reason) => {
        stopped = reason;
      },
    });
    handle.cancel();
    expect(finished).toBe(false);
    expect(stopped).toBe(GAUNTLET_CANCELLED);
    expect(GAUNTLET_CANCELLED).toContain('Nothing is rated');
  });

  it('ignores a second cancel — a stopped gauntlet stops once', () => {
    let stops = 0;
    const handle = runGauntlet({
      set: SET,
      dispatcherProfileId: 'eta',
      replications: 1,
      towerNameOf: nameOf,
      createWorker: doubleFor(() => 'silent', []),
      onProgress: () => {},
      onFinished: () => {},
      onStopped: () => {
        stops += 1;
      },
    });
    handle.cancel();
    handle.cancel();
    expect(stops).toBe(1);
  });

  it('stops on a failed case rather than rating thirty-nine of forty', () => {
    let finished = false;
    let stopped: string | undefined;
    runGauntlet({
      set: SET,
      dispatcherProfileId: 'eta',
      replications: 1,
      towerNameOf: nameOf,
      createWorker: doubleFor(
        (index) =>
          index === 0
            ? { kind: 'done', result: resultWith(20) }
            : { kind: 'failed', message: 'the building went missing' },
        [],
      ),
      onProgress: () => {},
      onFinished: () => {
        finished = true;
      },
      onStopped: (reason) => {
        stopped = reason;
      },
    });
    expect(finished).toBe(false);
    expect(stopped).toContain('Tower A · The evening');
    expect(stopped).toContain('the building went missing');
    expect(stopped).toContain('Nothing is rated');
  });

  it('does not finish after a cancel that landed between two cases', () => {
    /*
     * The race the handle has to survive: the worker for case two has been created and the reader
     * pressed stop. `runGauntlet` terminates it and marks itself stopped, so a message arriving
     * from a worker that was already on its way cannot resume the run.
     */
    let finished = false;
    let handle: { cancel(): void } | undefined;
    const late: ((event: { data: unknown }) => void)[] = [];
    handle = runGauntlet({
      set: SET,
      dispatcherProfileId: 'eta',
      replications: 1,
      towerNameOf: nameOf,
      createWorker: () => {
        let handler: ((event: { data: unknown }) => void) | undefined;
        return {
          postMessage: () => {
            if (handler !== undefined) late.push(handler);
          },
          terminate: () => {},
          addEventListener: (type: string, listener: unknown) => {
            if (type === 'message') handler = listener as (event: { data: unknown }) => void;
          },
        } as unknown as GauntletWorker;
      },
      onProgress: () => {},
      onFinished: () => {
        finished = true;
      },
      onStopped: () => {},
    });
    handle.cancel();
    for (const handler of late) handler({ data: { kind: 'done', result: resultWith(20) } });
    expect(finished).toBe(false);
  });
});
