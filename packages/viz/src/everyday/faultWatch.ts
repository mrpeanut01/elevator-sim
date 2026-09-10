/**
 * **The two listeners** — GitHub issue **#242**, AC1. The DOM half of `everyday/faults.ts`.
 *
 * A separate file from the register for the split `everyday/` already draws and
 * `boundaries.test.ts` enforces by name: the counting is pure and testable in the node tier, and
 * the document is not. This file is on that test's exempt list; `faults.ts` is not and must never
 * be.
 *
 * ## The import order in `boot.ts` is load-bearing, and it is the whole reason this file exists
 *
 * The failure this issue names is a **boot** failure: `docs/05-roadmap.md` records a `let` declared
 * below the `boot()` sequence that assigns it, throwing on boot's second statement, with 2 100 tests
 * green over a dead page. A throw during a module's *evaluation* is reported to the global `error`
 * handler — so it is catchable, but only by a listener that is already installed, and module
 * evaluation runs before any statement in the module that imported it.
 *
 * So `boot.ts` imports this module **above** `../dev/main.js`, and this module installs its
 * listeners as a side effect at evaluation time. Import order in a module body is evaluation order,
 * so the listeners are live before the Engineer surface's graph is evaluated. Reordering those two
 * imports silently removes the cover from the failure this was built for, which is why the reason
 * is written in both files.
 *
 * **The alternative was refused.** Installing from an inline `<script>` in `index.html` would be
 * earlier still and is impossible: the deployed page ships `script-src 'self'`. A *second* module
 * script tag would work and would add a second entry point to the bundle, changing the built
 * artifact `everyday/builtBundle.browser.test.ts` asserts the surface of, for a handful of
 * milliseconds of earliness. One entry point, one import order.
 *
 * ## Both events, and the reason `unhandledrejection` is not the afterthought
 *
 * `error` catches a synchronous throw and a module that fails to evaluate. `unhandledrejection`
 * catches the shape this application actually fails in: `dev/main.ts`'s `main()` is async and
 * self-invoked at module scope, every screen's data load is a promise, and a rejected one produces
 * no `error` event at all. A watcher that installed only the first would have missed the whole
 * asynchronous half of the boot.
 *
 * Neither listener reads its event. There is no argument to {@link ClientFaultRegister.record}, so
 * there is nothing an error could be passed through even by accident — see `faults.ts` for why that
 * is the enforcement rather than a style.
 */

import { CLIENT_FAULTS, type ClientFaultRegister } from './faults.js';

/**
 * Install the two listeners on a window.
 *
 * Takes the window and the register rather than reaching for either, so `faultWatch.test.ts` can
 * drive it against a stub and this file stays a wiring decision with nothing to get wrong. It is
 * called once, below, as this module's side effect.
 *
 * `capture: true` on both, so a listener a screen adds later cannot stop one of these seeing an
 * event by calling `stopPropagation` in the bubble phase.
 */
export function watchForFaults(view: EventTarget, register: ClientFaultRegister): void {
  view.addEventListener(
    'error',
    () => {
      register.record();
    },
    { capture: true },
  );
  view.addEventListener(
    'unhandledrejection',
    () => {
      register.record();
    },
    { capture: true },
  );
}

/*
 * The side effect, and the same guard `boot.ts` and `dev/main.ts` both use: under vitest's node
 * environment a test may import this module for {@link watchForFaults} with no window to install
 * into.
 */
if (typeof window !== 'undefined') watchForFaults(window, CLIENT_FAULTS);
