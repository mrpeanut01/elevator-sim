/**
 * The post block's seven states, and the two properties that make it worth having.
 *
 * Pure over {@link postRunViewOf}, so every state is driven without a document — which is the split
 * `everyday/boardScreen.test.ts` already makes for the read half and the reason the view function
 * exists at all.
 */

import { describe, expect, it } from 'vitest';

import { POST_RUN_NO_SERVER, type EverydayPostOutcome } from './host.js';
import { POST_RUN_COPY, postRunViewOf } from './postRun.js';

const READY = {
  hasRun: true,
  hasServer: true,
  signedIn: true,
  posting: false,
  outcome: undefined,
} as const;

const textOf = (view: { readonly lines: readonly { readonly text: string }[] }): string =>
  view.lines.map((line) => line.text).join(' ');

describe('everyday/postRun.ts — what the post block says', () => {
  it('offers the press with a run, a server and an account', () => {
    const view = postRunViewOf(READY);
    expect(view.pressable).toBe(true);
    expect(view.label).toBe(POST_RUN_COPY.button);
    expect(textOf(view)).toBe(POST_RUN_COPY.note);
  });

  it('says there is nowhere to post before it says anything else, and does not offer the press', () => {
    const view = postRunViewOf({ ...READY, hasServer: false, hasRun: false, signedIn: false });
    expect(view.pressable).toBe(false);
    // The build's property first: a player with no run and no account on a server-less build is not
    // owed three sentences, and the one they get is the only one they can act on.
    expect(textOf(view)).toBe(POST_RUN_NO_SERVER);
  });

  it('names the missing run rather than greying the button in silence', () => {
    const view = postRunViewOf({ ...READY, hasRun: false });
    expect(view.pressable).toBe(false);
    expect(textOf(view)).toContain('no finished run');
  });

  it('says what signing in takes before the press, and still offers it', () => {
    const view = postRunViewOf({ ...READY, signedIn: false });
    // Live rather than greyed — § D456's *say what to do rather than greying a control*. The press
    // produces the same sentence again from `postCurrentRun`, which is the backstop.
    expect(view.pressable).toBe(true);
    expect(textOf(view)).toContain('Sign in to post this run');
    expect(textOf(view)).toContain('no password');
  });

  it('draws no absence while a press is in flight', () => {
    const view = postRunViewOf({ ...READY, hasRun: false, signedIn: false, posting: true });
    expect(view.label).toBe(POST_RUN_COPY.posting);
    expect(view.pressable).toBe(false);
    // The in-flight state outranks every known-before-the-press answer: a block that swapped to
    // *there is no run* mid-request would publish an absence about a request that is still running.
    expect(textOf(view)).toBe(POST_RUN_COPY.note);
  });
});

describe('everyday/postRun.ts — a refusal is carried, never paraphrased', () => {
  /**
   * The load-bearing property of the whole block: whatever the outcome says is what the player
   * reads. A screen that summarised a refusal would be inventing a reason, and the one refusal this
   * product spends is an accusation — `menu/client.ts`'s own argument about `refusalDetail`.
   */
  const carried: readonly Extract<EverydayPostOutcome, { readonly detail: string }>[] = [
    { kind: 'no-server', detail: 'a sentence about the build' },
    { kind: 'signed-out', detail: 'a sentence about the player' },
    { kind: 'refused', detail: 'a sentence about the run' },
    { kind: 'failed', detail: 'a sentence about the server' },
  ];

  for (const outcome of carried) {
    it(`draws the ${outcome.kind} detail verbatim`, () => {
      const view = postRunViewOf({ ...READY, outcome });
      expect(view.lines.some((line) => line.text === outcome.detail)).toBe(true);
    });
  }

  it('leaves the press live on everything but a build with no server', () => {
    for (const outcome of carried) {
      expect(postRunViewOf({ ...READY, outcome }).pressable).toBe(outcome.kind !== 'no-server');
    }
  });

  it('says nothing was sent when this shell was the one that refused', () => {
    const view = postRunViewOf({ ...READY, outcome: { kind: 'refused', detail: 'no.' } });
    // The distinction `refused` and `failed` exist to keep: a player told *the server refused this*
    // about a request that never happened has been told something false about a machine they cannot
    // inspect. Only the shell's own refusal carries this line.
    expect(textOf(view)).toContain('nothing was sent');
    expect(textOf(postRunViewOf({ ...READY, outcome: { kind: 'failed', detail: 'no.' } }))).not.toContain(
      'nothing was sent',
    );
  });
});

describe('everyday/postRun.ts — where the run landed is the server’s answer', () => {
  const posted: EverydayPostOutcome = {
    kind: 'posted',
    boardKey: 'personal:user-1',
    placement: 'Your own record log, because this run is not today’s fixture.',
    entry: {
      id: 'entry-1',
      displayName: 'Someone',
      run: {
        buildingId: 'garden-apartments',
        dispatcherProfileId: 'collective',
        demandTemplateId: 'residential-day',
        arrivalRatePctPop5min: null,
        durationS: 900,
        windowStartS: null,
        seed: '20260804',
      },
      dataHash: 'hash',
      measured: { awtS: 1, wt95S: 2, ttdMeanS: 3, pctOverLongWait: 4, awtIsValid: true },
      legs: 10,
      submittedAtMs: 0,
    },
  };

  it('draws the server’s placement sentence and derives no board name of its own', () => {
    const view = postRunViewOf({ ...READY, outcome: posted });
    expect(textOf(view)).toContain(posted.kind === 'posted' ? posted.placement : '');
    // The key is never rendered and never parsed. GitHub issue #331 is the record of what happens
    // when a client decides which board a run went to: `placeSubmission` answers `daily:<date>` only
    // for the day's exact fixture, so a shell announcing *today's board* would be wrong for most
    // runs a player plays.
    expect(textOf(view)).not.toContain('personal:');
    expect(textOf(view)).not.toContain('daily:');
  });

  it('says the server replayed the seed, and says it on no other state', () => {
    expect(textOf(postRunViewOf({ ...READY, outcome: posted }))).toContain('replayed your seed');
    for (const outcome of [
      { kind: 'failed', detail: 'no.' },
      { kind: 'refused', detail: 'no.' },
    ] as const) {
      expect(textOf(postRunViewOf({ ...READY, outcome }))).not.toContain('replayed your seed');
    }
  });

  it('leaves the press live after a success, because a duplicate is the server’s question', () => {
    expect(postRunViewOf({ ...READY, outcome: posted }).pressable).toBe(true);
  });
});
