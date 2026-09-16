/**
 * The rolling-comparison gate for `charter S9` **B1** — GitHub issue #408, [`DECISIONS.md`](../../../../DECISIONS.md)
 * § D618.
 *
 * `docs/31-support-matrix.md` § 3 states the rule this file implements, in terms:
 *
 * > B1 is reported on every run and gates only on a rolling comparison, never on a single run. Fail
 * > the build when the median of the last *N* runs on `main` crosses 3 000 ms, or when a pull
 * > request's measurement exceeds the `main` median by more than a stated margin.
 *
 * That sentence names three quantities and specifies exactly one of them. This file's header says,
 * for each, whether it is **CITED** (quoted from the charter and not this file's to choose),
 * **CHOSEN** (an authored default, argued below, standing in until the product owner sets one), or
 * **MEASURED** (derived from real data — none of the three qualifies yet, because the store this
 * gate reads from ships empty; see `perf-history/README.md`). Writing "measured" over an authored
 * number is exactly the failure `CLAUDE.md`'s statistical-discipline section exists to catch, one
 * register over.
 *
 * | quantity | value | provenance |
 * |---|---|---|
 * | budget (B1 itself) | 3 000 ms | **CITED** — `docs/22-charter.md` § 4, `charter S9`, verbatim |
 * | window size *N* | {@link ROLLING_WINDOW_N} | **CHOSEN** |
 * | PR margin | {@link PR_MARGIN_MS} | **CHOSEN** |
 *
 * ## Why 20 runs and a 300 ms margin, stated so a reviewer can refuse them rather than trust them
 *
 * **`ROLLING_WINDOW_N = 20`.** `docs/31` does not name *N*, and there is no real history yet to fit
 * one against — the honest answer is that this is authored, not derived. Twenty is chosen for two
 * reasons rather than one: it is large enough that a single noisy run (a busy shared runner,
 * exactly the failure `docs/31` § 3 spends four paragraphs on) cannot move the median by itself,
 * and it is small enough that a real regression surfaces within roughly a day of `main` pushes
 * rather than being diluted for a month. `CLAUDE.md`'s own statistical-discipline section budgets
 * 50–200 *replications* for a simulated comparison — a different measurement (repeated draws of the
 * same configuration under CRN, not sequential wall-clock samples of a changing codebase) — so that
 * number is not reused here; the analogy is suggestive of the shape (more than a handful, fewer
 * than hundreds) and not a derivation.
 *
 * **`PR_MARGIN_MS = 300`**, ten percent of the 3 000 ms budget. Chosen as a round fraction of the
 * quantity it is a margin *on*, rather than an independently authored millisecond figure, so that
 * tightening or loosening the budget later moves the margin with it if this constant is re-derived
 * the same way. Ten percent is picked because it is comfortably larger than the run-to-run jitter a
 * warm, cache-primed Chromium shows on an otherwise idle machine (single-digit percent in adjacent
 * measurements elsewhere in this tier — see `builtBundle.browser.test.ts`'s own build-time gate,
 * which reports 4 152 ms cold on a quiet developer machine as its own baseline) and comfortably
 * smaller than the shared-runner noise `docs/31` § 3 documents (`BLOCKED_FRAME_GAP_MS` at 404.9 ms
 * against 41 ms and 39 ms on one host — more than 10× — which is exactly the kind of spread a
 * single-run wall clock gate cannot survive and this file's whole design is built not to trust).
 *
 * **Both numbers are pending owner sign-off**, per the issue's own acceptance criterion that a
 * number this file cannot derive must say so rather than claim it. `docs/31` § 3's rule that the
 * gate must be *reported as partially instrumented, not as met* until B1's rolling median is under
 * budget *and* B3's throttle factor is calibrated applies here without amendment — this file makes
 * the rolling half of that reportable, not both halves met.
 *
 * ## Why the gate is advisory today, and what changes that
 *
 * {@link MIN_HISTORY_FOR_GATE} main-branch records are required before this file will return
 * `'fail'` or `'pass'` at all; below that it returns `'advisory'`, which no caller may treat as a
 * failure. The store ships with **zero `main`-branch records** (`perf-history/README.md` — it does
 * carry one real, non-fabricated measurement from validating this change, tagged to the worktree
 * branch that produced it rather than to `main`, so it does not enter the window), so every
 * evaluation is `'advisory'` until real CI runs on `main` accumulate {@link ROLLING_WINDOW_N} of
 * them — which is
 * this file being honest about being uncalibrated rather than a permanent bypass flag: nothing here
 * special-cases "not enough history yet" as a separate mode that gets deleted later. The same
 * arithmetic that will gate the 21st run on `main` is what returns `'advisory'` for the 1st. See
 * GitHub issue #408's acceptance criterion: *"if the rolling comparison cannot be made to work, that
 * is a finding, not a reason to assert a single-run number"* — this module never falls back to one.
 */

/** `charter S9` verbatim — `docs/22-charter.md` § 4, `docs/31-support-matrix.md` § 3 B1. CITED. */
export const TTI_BUDGET_MS = 3_000;

/** How many of the most recent `main`-branch records the rolling window covers. CHOSEN — see header. */
export const ROLLING_WINDOW_N = 20;

/** How far a pull request's measurement may exceed the `main` rolling median. CHOSEN — see header. */
export const PR_MARGIN_MS = 300;

/** Below this many `main`-branch records, the window is not yet calibrated. Equal to {@link ROLLING_WINDOW_N}: a median of fewer than N samples is not the N-sample rolling median this gate is specified to compare against. */
export const MIN_HISTORY_FOR_GATE = ROLLING_WINDOW_N;

export type TtiGateVerdict = 'pass' | 'fail' | 'advisory';

export interface TtiGateResult {
  readonly verdict: TtiGateVerdict;
  /** The rolling median this run was compared against, or `null` when there was not enough history. */
  readonly rollingMedianMs: number | null;
  /** How many `main`-branch samples the median above was computed from. */
  readonly sampleSize: number;
  /** One sentence a test failure message or a log line can print as-is. */
  readonly reason: string;
}

/** The median of a non-empty list of finite numbers. Even-length lists average the two middles. */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError('median() of an empty list is undefined');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    const middle = sorted[mid];
    /* Unreachable: mid is in [0, sorted.length) whenever sorted.length > 0. Guarded rather than
     * asserted, because `noUncheckedIndexedAccess` cannot see that on its own. */
    if (middle === undefined) throw new RangeError('unreachable: median index out of range');
    return middle;
  }
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (lower === undefined || upper === undefined) {
    throw new RangeError('unreachable: median index out of range');
  }
  return (lower + upper) / 2;
}

export interface EvaluateTtiGateInput {
  /**
   * Every recorded `main`-branch TTI, in any order, **excluding** the run being evaluated. Pass
   * {@link recordsOnBranch}'s output filtered to `'main'` — this function does not filter by branch
   * itself, so a caller that means to compare against `main` and passes an unfiltered store would
   * silently widen the window with pull-request runs, which is the exact defect this gate exists to
   * avoid on the other side.
   */
  readonly mainHistoryMs: readonly number[];
  /** This run's own measured time to interactive, in milliseconds. */
  readonly currentTtiMs: number;
  /** Whether the run being evaluated is itself on `main` (and so a candidate to join the window) or on a pull request (compared against the window but never counted in it). */
  readonly isMainBranch: boolean;
}

/**
 * Evaluates one run against the rolling window, per `docs/31` § 3's rule quoted in this file's
 * header.
 *
 * On `main`: takes the most recent `min(ROLLING_WINDOW_N - 1, history.length)` prior main-branch
 * samples, adds this run's own measurement (the run being evaluated joins the window it is
 * evaluated against — a rolling median of "the last N runs" includes the run that just happened),
 * and fails when *that* median crosses the budget.
 *
 * On a pull request: takes the most recent `min(ROLLING_WINDOW_N, history.length)` main-branch
 * samples — this run is never added, because it is not on `main` and never will be — and fails when
 * this run's own measurement exceeds that median by more than {@link PR_MARGIN_MS}.
 *
 * Either way, fewer than {@link MIN_HISTORY_FOR_GATE} main-branch samples available for the window
 * returns `'advisory'` rather than computing a median from an under-sized sample and asserting it as
 * the real thing.
 */
export function evaluateTtiGate({
  mainHistoryMs,
  currentTtiMs,
  isMainBranch,
}: EvaluateTtiGateInput): TtiGateResult {
  const mostRecent = (n: number): readonly number[] => mainHistoryMs.slice(-n);

  if (isMainBranch) {
    const priorWindow = mostRecent(ROLLING_WINDOW_N - 1);
    const window = [...priorWindow, currentTtiMs];
    if (window.length < MIN_HISTORY_FOR_GATE) {
      return {
        verdict: 'advisory',
        rollingMedianMs: null,
        sampleSize: window.length,
        reason:
          `only ${String(window.length)} main-branch TTI record(s) exist ` +
          `(need ${String(MIN_HISTORY_FOR_GATE)} for a calibrated rolling median) — ` +
          'reported for visibility, not gated. See ttiGate.ts and perf-history/README.md.',
      };
    }
    const rollingMedianMs = median(window);
    const verdict: TtiGateVerdict = rollingMedianMs > TTI_BUDGET_MS ? 'fail' : 'pass';
    return {
      verdict,
      rollingMedianMs,
      sampleSize: window.length,
      reason:
        `main's rolling median over its last ${String(window.length)} runs (including this one) ` +
        `is ${rollingMedianMs.toFixed(1)} ms against a ${String(TTI_BUDGET_MS)} ms budget ` +
        `(charter S9 B1) — ${verdict === 'fail' ? 'over budget' : 'within budget'}.`,
    };
  }

  const window = mostRecent(ROLLING_WINDOW_N);
  if (window.length < MIN_HISTORY_FOR_GATE) {
    return {
      verdict: 'advisory',
      rollingMedianMs: null,
      sampleSize: window.length,
      reason:
        `only ${String(window.length)} main-branch TTI record(s) exist ` +
        `(need ${String(MIN_HISTORY_FOR_GATE)} to compare a pull request against) — ` +
        'reported for visibility, not gated. See ttiGate.ts and perf-history/README.md.',
    };
  }
  const rollingMedianMs = median(window);
  const ceiling = rollingMedianMs + PR_MARGIN_MS;
  const verdict: TtiGateVerdict = currentTtiMs > ceiling ? 'fail' : 'pass';
  return {
    verdict,
    rollingMedianMs,
    sampleSize: window.length,
    reason:
      `this run measured ${currentTtiMs.toFixed(1)} ms against main's rolling median of ` +
      `${rollingMedianMs.toFixed(1)} ms over its last ${String(window.length)} runs, ` +
      `plus a ${String(PR_MARGIN_MS)} ms margin (ceiling ${ceiling.toFixed(1)} ms) — ` +
      `${verdict === 'fail' ? 'regressed beyond the margin' : 'within the margin'}.`,
  };
}
