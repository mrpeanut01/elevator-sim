/**
 * The two listeners, and the import order that decides whether they see anything — GitHub issue
 * **#242**, AC1.
 *
 * ## The order case is the one that matters
 *
 * The failure this issue names is a boot failure, and a throw during module evaluation is only
 * catchable by a listener that is **already installed**. Module evaluation runs before any statement
 * in the module that imported it, so the only thing standing between this watcher and the dead page
 * it was built for is `boot.ts` importing it above `../dev/main.js`. That is invisible in a diff and
 * cannot be tested by calling anything, so it is asserted as text — and the positive control is
 * below in words: swapping those two lines in `boot.ts` fails this file.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ClientFaultRegister } from './faults.js';
import { watchForFaults } from './faultWatch.js';

/** The smallest thing that behaves like a window for two `addEventListener` calls. */
function recordingTarget(): {
  readonly target: EventTarget;
  readonly fire: (type: string) => void;
  readonly types: readonly string[];
  readonly options: readonly (AddEventListenerOptions | boolean | undefined)[];
} {
  const listeners = new Map<string, () => void>();
  const types: string[] = [];
  const options: (AddEventListenerOptions | boolean | undefined)[] = [];
  const target = {
    addEventListener(
      type: string,
      handler: EventListenerOrEventListenerObject | null,
      given?: AddEventListenerOptions | boolean,
    ): void {
      types.push(type);
      options.push(given);
      listeners.set(type, () => {
        if (typeof handler === 'function') handler(new Event(type));
      });
    },
    removeEventListener(): void {
      /* never called */
    },
    dispatchEvent(): boolean {
      return true;
    },
  } as unknown as EventTarget;
  return {
    target,
    fire: (type) => listeners.get(type)?.(),
    types,
    options,
  };
}

describe('what it listens for', () => {
  it('takes both events, and the asynchronous one is not optional', () => {
    const view = recordingTarget();
    watchForFaults(view.target, new ClientFaultRegister());
    expect([...view.types].sort()).toEqual(['error', 'unhandledrejection']);
  });

  /*
   * `dev/main.ts`'s `main()` is async and self-invoked at module scope, and every screen's data load
   * is a promise. A rejected promise produces no `error` event at all, so a watcher with only the
   * first listener would miss the whole asynchronous half of the boot — which is most of it.
   */
  it('counts a rejected promise, which produces no error event', () => {
    const view = recordingTarget();
    const register = new ClientFaultRegister();
    watchForFaults(view.target, register);

    view.fire('unhandledrejection');

    expect(register.tally()).toEqual({ startingUp: 1, playing: 0 });
  });

  it('counts a thrown error', () => {
    const view = recordingTarget();
    const register = new ClientFaultRegister();
    watchForFaults(view.target, register);

    view.fire('error');
    view.fire('error');

    expect(register.tally()).toEqual({ startingUp: 2, playing: 0 });
  });

  /*
   * A screen that called `stopPropagation` on an error event in the bubble phase would otherwise
   * be able to hide a fault from this register without anybody intending it.
   */
  it('listens in the capture phase, so nothing downstream can hide an event', () => {
    const view = recordingTarget();
    watchForFaults(view.target, new ClientFaultRegister());
    for (const given of view.options) expect(given).toEqual({ capture: true });
  });
});

describe('the import order in the entry point', () => {
  const boot = readFileSync(
    fileURLToPath(new URL('./boot.ts', import.meta.url)),
    'utf8',
  );

  /*
   * **The positive control, stated because it cannot be automated any more cheaply than this:**
   * swap the two import lines in `boot.ts` and this case fails. That swap is the whole of the
   * difference between a watcher that sees the boot failure this issue is about and one that is
   * installed a fraction of a second too late to see anything.
   */
  it('installs the watcher before the Engineer surface is evaluated', () => {
    const watcher = boot.indexOf("import './faultWatch.js'");
    const engineer = boot.indexOf("import '../dev/main.js'");
    expect(watcher, 'boot.ts must import the fault watcher').toBeGreaterThan(-1);
    expect(engineer, 'boot.ts must import the Engineer surface').toBeGreaterThan(-1);
    expect(watcher).toBeLessThan(engineer);
  });

  it('imports it for its side effect rather than calling something', () => {
    /*
     * A named export invoked from `bootEveryday` would run after every import had already been
     * evaluated, which is after the failure. The bare import is the mechanism, not a style.
     */
    expect(boot).toContain("import './faultWatch.js';");
  });

  it('tells the shell when it has mounted, or every fault reads as a boot failure', () => {
    expect(boot).toContain('CLIENT_FAULTS.shellMounted()');
  });
});
