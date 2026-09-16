import { describe, expect, it } from 'vitest';

import {
  evaluateTtiGate,
  median,
  MIN_HISTORY_FOR_GATE,
  PR_MARGIN_MS,
  ROLLING_WINDOW_N,
  TTI_BUDGET_MS,
} from './ttiGate.js';

describe('median', () => {
  it('throws on an empty list rather than returning NaN or undefined', () => {
    expect(() => median([])).toThrow(RangeError);
  });

  it('is the middle value of an odd-length list', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values of an even-length list', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('does not mutate its input', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('evaluateTtiGate — main branch', () => {
  it('is advisory with no history at all — the state this repository ships in today', () => {
    const result = evaluateTtiGate({ mainHistoryMs: [], currentTtiMs: 2_000, isMainBranch: true });
    expect(result.verdict).toBe('advisory');
    expect(result.rollingMedianMs).toBeNull();
    expect(result.sampleSize).toBe(1); // this run alone
  });

  it('stays advisory one short of the window, and the message names how many are needed', () => {
    const history = Array.from({ length: ROLLING_WINDOW_N - 2 }, () => 2_000);
    const result = evaluateTtiGate({
      mainHistoryMs: history,
      currentTtiMs: 2_000,
      isMainBranch: true,
    });
    expect(result.verdict).toBe('advisory');
    expect(result.sampleSize).toBe(ROLLING_WINDOW_N - 1);
    expect(result.reason).toContain(String(MIN_HISTORY_FOR_GATE));
  });

  it('gates once exactly N samples are available, including the current run', () => {
    const history = Array.from({ length: ROLLING_WINDOW_N - 1 }, () => 2_000);
    const result = evaluateTtiGate({
      mainHistoryMs: history,
      currentTtiMs: 2_000,
      isMainBranch: true,
    });
    expect(result.sampleSize).toBe(ROLLING_WINDOW_N);
    expect(result.verdict).toBe('pass');
    expect(result.rollingMedianMs).toBe(2_000);
  });

  it('only ever reads the most recent N-1 prior samples, not the whole history', () => {
    const ancientBadRun = Array.from({ length: 5 }, () => 999_999);
    const recentGoodRuns = Array.from({ length: ROLLING_WINDOW_N - 1 }, () => 1_000);
    const result = evaluateTtiGate({
      mainHistoryMs: [...ancientBadRun, ...recentGoodRuns],
      currentTtiMs: 1_000,
      isMainBranch: true,
    });
    expect(result.rollingMedianMs).toBe(1_000);
    expect(result.verdict).toBe('pass');
  });

  it('fails when the rolling median crosses the budget', () => {
    const history = Array.from({ length: ROLLING_WINDOW_N - 1 }, () => TTI_BUDGET_MS + 500);
    const result = evaluateTtiGate({
      mainHistoryMs: history,
      currentTtiMs: TTI_BUDGET_MS + 500,
      isMainBranch: true,
    });
    expect(result.verdict).toBe('fail');
    expect(result.rollingMedianMs).toBeGreaterThan(TTI_BUDGET_MS);
  });

  it('passes when the median sits exactly at the budget — the budget is a ceiling, not a strict cut', () => {
    const history = Array.from({ length: ROLLING_WINDOW_N - 1 }, () => TTI_BUDGET_MS);
    const result = evaluateTtiGate({
      mainHistoryMs: history,
      currentTtiMs: TTI_BUDGET_MS,
      isMainBranch: true,
    });
    expect(result.rollingMedianMs).toBe(TTI_BUDGET_MS);
    expect(result.verdict).toBe('pass');
  });

  it('is not swayed by one bad run inside an otherwise-fast window — the whole reason a median was chosen over a single measurement', () => {
    const history = Array.from({ length: ROLLING_WINDOW_N - 2 }, () => 1_000).concat([9_000]);
    const result = evaluateTtiGate({
      mainHistoryMs: history,
      currentTtiMs: 1_000,
      isMainBranch: true,
    });
    expect(result.verdict).toBe('pass');
  });
});

describe('evaluateTtiGate — pull request', () => {
  it('is advisory with fewer than N main samples to compare against', () => {
    const history = Array.from({ length: ROLLING_WINDOW_N - 1 }, () => 2_000);
    const result = evaluateTtiGate({
      mainHistoryMs: history,
      currentTtiMs: 5_000,
      isMainBranch: false,
    });
    expect(result.verdict).toBe('advisory');
  });

  it('never adds the PR run itself to the window it is compared against', () => {
    const history = Array.from({ length: ROLLING_WINDOW_N }, () => 1_000);
    const result = evaluateTtiGate({
      mainHistoryMs: history,
      currentTtiMs: 50_000, // wildly high — must not be able to move its own comparison median
      isMainBranch: false,
    });
    expect(result.rollingMedianMs).toBe(1_000);
    expect(result.verdict).toBe('fail'); // 50 000 exceeds 1 000 + margin
  });

  it('passes within the margin of the main median', () => {
    const history = Array.from({ length: ROLLING_WINDOW_N }, () => 2_000);
    const result = evaluateTtiGate({
      mainHistoryMs: history,
      currentTtiMs: 2_000 + PR_MARGIN_MS,
      isMainBranch: false,
    });
    expect(result.verdict).toBe('pass');
  });

  it('fails just past the margin of the main median', () => {
    const history = Array.from({ length: ROLLING_WINDOW_N }, () => 2_000);
    const result = evaluateTtiGate({
      mainHistoryMs: history,
      currentTtiMs: 2_000 + PR_MARGIN_MS + 0.01,
      isMainBranch: false,
    });
    expect(result.verdict).toBe('fail');
  });
});
