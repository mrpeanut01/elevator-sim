/**
 * **Running the forty** — GAMEPLAY § 20.10, over `dev/batchWorker.ts`'s existing seam.
 *
 * ## Off the painting thread, one case at a time
 *
 * § 20.10 wants the forty run *"with progress shown in place"*. `dev/batchWorker.ts`'s docstring
 * measured what happens without a worker: a replication is one synchronous `Simulation.run()` with
 * no tick to yield between, 196 ms of dropped frames each on Vertical City, and § 1.4's own figures
 * put a full simulation at 181 ms on Garden Apartments, 828 ms on Midtown Office and 1 521 ms on
 * Vertical City. Forty of those is a minute or two of a page that does not answer a click. So the
 * gauntlet uses the same worker the bench does, and this module never touches a `Simulation`.
 *
 * Cases run **sequentially**, one worker per case, restarted per case — `dev/suitePanel.ts`'s
 * arrangement and its reason: each batch already saturates one core, and the progress account is
 * honest about the whole job either way.
 *
 * ## Cancellation reports nothing, and that is the honest form
 *
 * `dev/batchWorker.ts`: *"A terminated batch reports nothing, which is correct: it has no result."*
 * The same holds one level up and more strongly — a rating is a mean over the forty, so a gauntlet
 * stopped at case twelve has no rating, and publishing the twelve as a rating would be the figure
 * § 12.3 forbids by construction (*"the cases never move"*, so a mean over a different set is a
 * different quantity). {@link runGauntlet} therefore calls `onCancelled` and never `onFinished`.
 *
 * A **failed** case is treated the same way, for the reason `dev/suitePanel.ts` states about a
 * cell: *"Nothing is reported — a suite with a missing cell would be a different suite."*
 *
 * ## Why the worker arrives as a factory
 *
 * `new Worker(new URL(…))` is a bundler seam and a DOM global; a module holding one cannot be
 * driven without a browser. The one non-test caller —
 * {@link import('../everyday/boardScreen.js')} — supplies the real factory, and the tests supply a
 * double that answers from a fixture. That is the same split `everyday/` uses throughout: the
 * decisions are drivable without a document.
 */

import type { BatchResult, BatchWorkerMessage, BatchWorkerRequest } from '../batch/types.js';

import { caseNameOf } from './ladder.js';
import { proofCaseRequestOf, proofCasesOf, type ProofCase, type ProofCaseSet } from './proofCases.js';
import { ratedCaseOf, ratingOf, type RatedCase, type RatingSummary } from './rating.js';

/** The two members of `Worker` this module uses, so it needs no `lib: ["WebWorker"]`. */
export interface GauntletWorker {
  postMessage(message: BatchWorkerRequest): void;
  terminate(): void;
  addEventListener(type: 'message', handler: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', handler: (event: { message: string }) => void): void;
}

/** Where the reader is, mid-run — § 20.10's *progress shown in place*. */
export interface GauntletProgress {
  /** Cases finished. Never counted before a result lands. */
  readonly done: number;
  readonly total: number;
  /** The case now running, named for a reader. */
  readonly current: string;
  /** The whole line, authored here so no renderer composes a claim about how far along it is. */
  readonly line: string;
}

/** What the gauntlet needs, and what it hands back. */
export interface GauntletOptions {
  readonly set: ProofCaseSet;
  /** The saved dispatcher being proved. The gate in `ladder.ts` decides whether it may be here. */
  readonly dispatcherProfileId: string;
  /** How a tower is named for a reader. No engine identifier reaches a progress line. */
  towerNameOf(towerId: string): string;
  createWorker(): GauntletWorker;
  onProgress(progress: GauntletProgress): void;
  /** The finished rating. Called exactly once, and only on a gauntlet that ran every case. */
  onFinished(summary: RatingSummary): void;
  /** Cancelled or failed — a gauntlet with a missing case has no rating. `reason` says which. */
  onStopped(reason: string): void;
  /**
   * Replications per case. **1** is the gauntlet's, and `rating.ts` states what a mean over forty
   * single runs may be used to say. It is a parameter rather than a constant so a caller with time
   * can raise it and get the same rating shape from more runs.
   */
  readonly replications: number;
}

/** Stop the forty. Idempotent; a gauntlet already finished ignores it. */
export interface GauntletHandle {
  cancel(): void;
}

/** The message a cancelled gauntlet stops with. Named so the screen and the tests agree on it. */
export const GAUNTLET_CANCELLED =
  'Stopped. Nothing is rated — a rating is the mean of all forty, so a part of them is a ' +
  'different figure rather than a smaller one.';

/**
 * Run the forty and hand back a rating, or stop and hand back nothing.
 *
 * Returns as soon as the first case is posted; everything after arrives on the callbacks. The
 * handle's `cancel` terminates the worker in flight, which is immediate — a replication cannot be
 * interrupted, so a cooperative flag would leave the reader waiting up to a second and a half while
 * adding a second way for the run to end (`dev/batchWorker.ts` § Cancellation).
 */
export function runGauntlet(options: GauntletOptions): GauntletHandle {
  const cases = proofCasesOf(options.set);
  const rated: RatedCase[] = [];
  let worker: GauntletWorker | undefined;
  let stopped = false;

  const stopWorker = (): void => {
    worker?.terminate();
    worker = undefined;
  };

  const nameOf = (proofCase: ProofCase): string =>
    caseNameOf(proofCase, options.towerNameOf(proofCase.tower.id));

  const report = (done: number, proofCase: ProofCase): void => {
    const current = nameOf(proofCase);
    options.onProgress({
      done,
      total: cases.length,
      current,
      line: `Proof case ${String(done + 1)} of ${String(cases.length)} — ${current}`,
    });
  };

  const runCase = (index: number): void => {
    if (stopped) return;
    const proofCase = cases[index];
    if (proofCase === undefined) {
      stopWorker();
      stopped = true;
      options.onFinished(ratingOf(rated, cases.length));
      return;
    }
    report(index, proofCase);
    const next = options.createWorker();
    worker = next;
    next.addEventListener('message', (event) => {
      if (stopped || worker !== next) return;
      const message = event.data as BatchWorkerMessage;
      if (message.kind === 'progress') return;
      if (message.kind === 'failed') {
        stopWorker();
        stopped = true;
        options.onStopped(
          `${nameOf(proofCase)} could not run: ${message.message}. Nothing is rated — a rating ` +
            'over thirty-nine cases is not the rating the forty define.',
        );
        return;
      }
      rated.push(ratedCaseOf(proofCase, message.result as BatchResult));
      stopWorker();
      runCase(index + 1);
    });
    next.addEventListener('error', (event) => {
      if (stopped || worker !== next) return;
      stopWorker();
      stopped = true;
      options.onStopped(`the gauntlet worker failed to start: ${event.message}. Nothing is rated.`);
    });
    next.postMessage({
      kind: 'run',
      request: proofCaseRequestOf(
        proofCase,
        [{ armId: 'candidate', dispatcherProfileId: options.dispatcherProfileId }],
        options.replications,
        /*
         * § 1's gauntlet rule — `hash(towerId, crowdIndex)`, fixed forever, which is the whole
         * reason two ratings a month apart are comparable. The bench runs the same forty cases
         * under `benchSeedOf` instead (§ D446); passing the case's own seed is a choice this call
         * makes and not a default it inherits.
         */
        proofCase.seed,
      ),
    });
  };

  runCase(0);

  return {
    cancel: () => {
      if (stopped) return;
      stopped = true;
      stopWorker();
      options.onStopped(GAUNTLET_CANCELLED);
    },
  };
}
