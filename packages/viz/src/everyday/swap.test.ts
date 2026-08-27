/**
 * The swap port's one contract: what the shell provides is what the Engineer header reads, arrival
 * and **departure** are both heard, and before any arrival the answer is honestly `undefined` — the
 * state `dev/main.ts` turns into a hidden control rather than a refusal about a world that is not
 * there.
 *
 * The departure half is the one that has no counterpart in `engineerBridge.ts` and is asserted for a
 * reason: the header button holds a closure over whatever this module last returned, and a revoked
 * shell that stayed provided would let a press put an empty cover back over the page.
 */

import { describe, expect, it } from 'vitest';

import {
  everydaySwap,
  onEverydaySwapProvided,
  provideEverydaySwap,
  type EverydaySwapPort,
} from './swap.js';

function fakePort(
  world: 'everyday' | 'engineer' = 'everyday',
): EverydaySwapPort & { readonly presses: number[] } {
  const presses: number[] = [];
  return {
    presses,
    returnToEveryday: () => {
      presses.push(presses.length + 1);
    },
    hasThePage: () => world === 'everyday',
  };
}

describe('the Everyday swap port', () => {
  it('answers undefined before a shell mounts — a page with no Everyday Mode to go back to', () => {
    // First in the file on purpose: module state is per-file under vitest isolation, so this is the
    // state a build that loads `dev/main.ts` alone is permanently in.
    expect(everydaySwap()).toBeUndefined();
  });

  it('hands back exactly what the shell provided, and the press reaches it', () => {
    const port = fakePort();
    provideEverydaySwap(port);
    expect(everydaySwap()).toBe(port);
    everydaySwap()?.returnToEveryday();
    expect(port.presses).toEqual([1]);
  });

  it('goes back to undefined when the shell revokes it, and says so', () => {
    let heard = 0;
    const stop = onEverydaySwapProvided(() => {
      heard += 1;
    });
    provideEverydaySwap(fakePort());
    expect(heard).toBe(1);
    provideEverydaySwap(undefined);
    /*
     * Both halves. The notification is what un-reveals the header control; the `undefined` is what
     * makes a press that raced the revocation a no-op rather than a call into a removed root.
     */
    expect(heard).toBe(2);
    expect(everydaySwap()).toBeUndefined();
    stop();
    provideEverydaySwap(fakePort());
    expect(heard).toBe(2);
  });

  /**
   * The read half — GitHub issue **#287**, and both branches, because `dev/main.ts` turns this
   * answer into *may the end of the day file it*.
   *
   * The `undefined` arm is the one worth stating: **no shell provided reads as the Engineer surface
   * having the page**, which is why `dev/main.ts` writes `=== true` rather than `!== false`. A build
   * that loads `dev/main.ts` alone has no other world for a day to belong to, and a fix that
   * disarmed the close there would have turned issue #287 into an Engineer surface that can never
   * file a day at all.
   */
  it('says which world has the page, and answers for a page that has no Everyday Mode', () => {
    provideEverydaySwap(undefined);
    expect(everydaySwap()?.hasThePage() === true).toBe(false);
    provideEverydaySwap(fakePort('everyday'));
    expect(everydaySwap()?.hasThePage()).toBe(true);
    provideEverydaySwap(fakePort('engineer'));
    expect(everydaySwap()?.hasThePage()).toBe(false);
  });

  it('replaces the port on a re-mount rather than keeping the first', () => {
    const first = fakePort();
    const second = fakePort();
    provideEverydaySwap(first);
    provideEverydaySwap(second);
    everydaySwap()?.returnToEveryday();
    expect(first.presses).toEqual([]);
    expect(second.presses).toEqual([1]);
  });
});
