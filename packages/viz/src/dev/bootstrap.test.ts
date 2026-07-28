/**
 * `RV-17` and `RV-21` at the seam — the load-then-Retry sequence, without a browser.
 *
 * These rows were ⚠️ for two waves because "the app cannot be *loaded* from a stopped dev
 * server". That argument was true of the method and false of the requirement: a `data/` **fetch**
 * failure is not a stopped server, and `T39` drove it by deleting `data/elevator-specs.json`
 * while the server ran. Doing so found `RV-21` to be false — Retry refetched, then threw
 * `ReferenceError: Cannot access 'started' before initialization` into a floating promise, so the
 * page cleared its own error message and stopped, for ever, at `loading data…`.
 *
 * The tests below are the ones that would have been red against that code. The last of them is
 * the one that matters most: a failure inside `start` must reach the caller, because a recovery
 * that dies quietly is indistinguishable from one that worked.
 */

import { describe, expect, it } from 'vitest';

import { createLoader } from './bootstrap.js';

describe('createLoader — RV-17 / RV-21', () => {
  it('starts once with the loaded value when the first attempt succeeds', async () => {
    const started: string[] = [];
    const failures: unknown[] = [];
    const loader = createLoader<string>({
      load: () => Promise.resolve('resources'),
      start: (value) => started.push(value),
      fail: (error) => failures.push(error),
    });

    expect(await loader.attempt()).toBe(true);
    expect(started).toEqual(['resources']);
    expect(failures).toEqual([]);
  });

  it('reports the failure, refetches on Retry, and then starts — the RV-21 regression', async () => {
    let attempts = 0;
    const started: string[] = [];
    const reported: string[] = [];
    let retry: (() => Promise<boolean>) | undefined;

    const loader = createLoader<string>({
      load: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error('could not fetch /elevator-specs.json: 404 Not Found'))
          : Promise.resolve('resources');
      },
      start: (value) => started.push(value),
      fail: (error, handedBack) => {
        reported.push(error instanceof Error ? error.message : String(error));
        retry = handedBack;
      },
    });

    expect(await loader.attempt()).toBe(false);
    expect(reported).toEqual(['could not fetch /elevator-specs.json: 404 Not Found']);
    expect(started).toEqual([]);
    expect(retry).toBeDefined();

    // The row: refetches without a page reload, and the page comes into service.
    expect(await retry?.()).toBe(true);
    expect(attempts).toBe(2);
    expect(started).toEqual(['resources']);
  });

  it('keeps offering Retry while the failure persists, and starts nothing', async () => {
    let attempts = 0;
    const started: string[] = [];
    let retry: (() => Promise<boolean>) | undefined;
    const loader = createLoader<string>({
      load: () => {
        attempts += 1;
        return Promise.reject(new Error('still missing'));
      },
      start: (value) => started.push(value),
      fail: (_error, handedBack) => {
        retry = handedBack;
      },
    });

    await loader.attempt();
    await retry?.();
    await retry?.();
    expect(attempts).toBe(3);
    expect(started).toEqual([]);
  });

  it('starts at most once however many attempts succeed', async () => {
    const started: string[] = [];
    const loader = createLoader<string>({
      load: () => Promise.resolve('resources'),
      start: (value) => started.push(value),
      fail: () => {
        throw new Error('not reached');
      },
    });

    await loader.attempt();
    await loader.attempt();
    await loader.attempt();
    expect(started).toEqual(['resources']);
  });

  it('rejects rather than swallowing a throw from start', async () => {
    // The shape of the shipped bug. Under the old code this threw inside a floating async IIFE
    // and nothing anywhere said so; here the caller cannot avoid learning about it.
    const loader = createLoader<string>({
      load: () => Promise.resolve('resources'),
      start: () => {
        throw new Error('boot exploded');
      },
      fail: () => {
        throw new Error('a broken page is not a failed fetch, so Retry must not be offered');
      },
    });

    await expect(loader.attempt()).rejects.toThrow('boot exploded');
  });
});
