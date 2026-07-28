/**
 * The viewer's load-then-retry state machine — `UX.md` `RV-17` and `RV-21`.
 *
 * ## Why this is a module and not four lines inside `main()`
 *
 * It *was* four lines inside `main()`, and driving `RV-21` for the first time found that the
 * Retry button refetched `data/` successfully and then killed the page:
 *
 * ```text
 * ReferenceError: Cannot access 'started' before initialization
 *     at start (src/dev/main.ts:124:3)
 * ```
 *
 * The failure path did `if (!(await load())) return;` **above** the `let started = false` that
 * `start()` closes over, so a first load that failed left that binding in its temporal dead zone
 * for the lifetime of the page. Retry then refetched, called `start()`, and threw — inside a
 * `void (async () => …)()` with no `catch`, so nothing was printed and nothing was shown. The
 * symptom was a cleared error message, a status line reading `loading data…` for ever, and an
 * empty building list. Recovery is exactly the path nobody exercises, so it is exactly the path
 * that must not depend on the statement order of the function it happens to live in.
 *
 * So the sequencing lives here, where {@link createLoader}'s own state is declared before
 * anything can reach it and `bootstrap.test.ts` drives fail → retry → succeed directly.
 *
 * Two guarantees, both asserted by that test:
 *
 * 1. **`start` runs at most once**, whichever attempt succeeds, and it is handed the loaded value
 *    rather than reading a shared `let` that a failed attempt may have left unwritten.
 * 2. **Nothing is swallowed.** If `start` throws, {@link Loader.attempt} rejects, and the caller
 *    is obliged to say so. A recovery that dies quietly is worse than one that never ran.
 */

export interface LoaderOptions<T> {
  /** Fetch everything the page needs. Rejecting is the `RV-17` path. */
  readonly load: () => Promise<T>;
  /** Put the page into service. Called at most once per loader, with the loaded value. */
  readonly start: (value: T) => void;
  /**
   * Report a failed attempt, and wire `retry` to a control.
   *
   * `retry` returns the attempt's promise on purpose: the caller has to decide what a *second*
   * failure looks like, and cannot decide it by ignoring the result.
   */
  readonly fail: (error: unknown, retry: () => Promise<boolean>) => void;
}

export interface Loader {
  /** Try once. Resolves `true` when the page is in service, `false` when `fail` was called. */
  readonly attempt: () => Promise<boolean>;
}

export function createLoader<T>(options: LoaderOptions<T>): Loader {
  let started = false;

  const attempt = async (): Promise<boolean> => {
    let value: T;
    try {
      value = await options.load();
    } catch (error) {
      options.fail(error, attempt);
      return false;
    }
    // Deliberately outside the `try`: a throw from `start` is a bug in the page, not a failure to
    // load `data/`, and offering Retry for it would loop on the same broken frame.
    if (!started) {
      started = true;
      options.start(value);
    }
    return true;
  };

  return { attempt };
}
