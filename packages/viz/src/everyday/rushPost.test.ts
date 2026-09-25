/**
 * The rush's round list and post block — GitHub issue **#372**'s fourth criterion, as words.
 *
 * `postRun.test.ts`'s shape one screen over, and the two claims worth checking mechanically are the
 * ones that block's own history produced: **a control that cannot act is never drawn without a
 * sentence saying why**, and **no refusal this file did not author is reworded here**.
 */

import { describe, expect, it } from 'vitest';

import { SIGNED_OUT, postingRefusal } from '../menu/account.js';

import { POST_RUN_NO_SERVER } from './host.js';
import type { RushOutcome } from './rush.js';
import { RUSH_POST_COPY, rushPostViewOf } from './rushPost.js';
import { RUSH_SITTING_COPY, rushSittingOf, type RushRoundRecord } from './rushSitting.js';

const outcome = (kind: RushOutcome['kind'], heldS: number): RushOutcome => ({
  kind,
  atS: heldS,
  wave: Math.floor(heldS / 180) + 1,
  heldS,
  arrived: 200,
  carried: 150,
  longestWaitS: 130,
  overLine: 40,
  where: [],
  saturation: undefined,
});

function round(over: Partial<RushRoundRecord> = {}): RushRoundRecord {
  const record: RushRoundRecord = {
    dispatcherProfileId: 'collective',
    dispatcherName: 'Collective',
    drivers: [],
    changes: [],
    ruleRows: [],
    wireInterventions: [],
    interventionCount: 0,
    holdS: 1640,
    outcome: outcome('broke', 1640),
    unpostable: [],
    ...over,
  };
  /*
   * `drivers` follows the round's own name unless a case names its own — GitHub issue #565, § D859.
   * A default of `['Collective']` would have made every override's driver line read *Collective*
   * over a round driven by somebody else, which is the defect this field exists to close.
   */
  return record.drivers.length === 0 ? { ...record, drivers: [record.dispatcherName] } : record;
}

const ROUNDS = [round({ dispatcherProfileId: 'eta', dispatcherName: 'ETA', interventionCount: 1 }), round()];
const ready = {
  rounds: ROUNDS,
  check: rushSittingOf({ buildingId: 'midtown-office', rounds: ROUNDS }),
  hasServer: true,
  signedIn: true,
  posting: false,
  outcome: undefined,
} as const;

describe('the sitting’s post block — GitHub issue #372', () => {
  it('never draws a dead control without a reason beside it', () => {
    /*
     * `postRun.ts`'s rule, restated here because this block has its own states: *`false` is always
     * accompanied by a `reason` line*. GitHub issue #21's finding is that a filled primary which
     * consumes a click and produces nothing is worse than a disabled one, and § D456's charter
     * refusal test is *can the player still play?* — which a greyed control with no sentence fails
     * while looking tidy.
     */
    const states: Parameters<typeof rushPostViewOf>[0][] = [
      ready,
      { ...ready, posting: true },
      { ...ready, hasServer: false },
      { ...ready, signedIn: false },
      { ...ready, rounds: [], check: rushSittingOf({ buildingId: 'midtown-office', rounds: [] }) },
      { ...ready, check: { ok: false, reasons: [RUSH_SITTING_COPY.handStopped] } },
      { ...ready, outcome: { kind: 'refused', detail: 'nope' } },
      { ...ready, outcome: { kind: 'failed', detail: 'the service did not answer' } },
      { ...ready, outcome: { kind: 'no-server', detail: POST_RUN_NO_SERVER } },
      { ...ready, outcome: { kind: 'signed-out', detail: 'sign in' } },
      { ...ready, outcome: { kind: 'posted', rounds: [] } },
    ];
    for (const input of states) {
      const view = rushPostViewOf(input);
      expect(view.lines.length, 'a state with nothing to say is a state that lies').toBeGreaterThan(0);
      if (!view.pressable && !input.posting) {
        expect(view.lines.some((line) => line.role === 'reason')).toBe(true);
      }
    }
  });

  it('borrows the two sentences it does not own rather than rewording them', () => {
    /*
     * *There is no server* and *nobody is signed in* are claims about the page and the player, not
     * about a sitting, and the day's post block already says both. Two wordings for one claim is
     * what `honesty/agreement.ts#surfaces-disagree` exists to catch, so this asserts the strings are
     * the same object's, not merely similar.
     */
    expect(rushPostViewOf({ ...ready, hasServer: false }).lines[0]?.text).toBe(POST_RUN_NO_SERVER);
    expect(rushPostViewOf({ ...ready, signedIn: false }).lines[0]?.text).toBe(postingRefusal(SIGNED_OUT));
  });

  it('says signed-out before the press and leaves the button live — issue #332’s fourth clause', () => {
    const view = rushPostViewOf({ ...ready, signedIn: false });
    expect(view.pressable).toBe(true);
    expect(view.lines.map((line) => line.text)).toContain(RUSH_POST_COPY.note);
  });

  it('carries a refusal verbatim and never paraphrases it', () => {
    const detail = 'Round 2 did not replay on this server.';
    const view = rushPostViewOf({ ...ready, outcome: { kind: 'failed', detail } });
    expect(view.lines[0]?.text).toBe(detail);
  });

  it('lists every round in order, with what drove it, how far it got and what was pressed', () => {
    const view = rushPostViewOf(ready);
    expect(view.rounds).toHaveLength(2);
    expect(view.rounds[0]?.label).toBe(RUSH_POST_COPY.roundLabel(1));
    expect(view.rounds[0]?.driver).toContain('ETA');
    expect(view.rounds[0]?.presses).toBe(RUSH_POST_COPY.presses(1));
    expect(view.rounds[1]?.presses).toBe(RUSH_POST_COPY.noPresses);
    expect(view.roundsEmpty).toBeUndefined();
    /* Nothing is pressed, and *nothing* is a fact about the round rather than an absent field. */
    expect(view.rounds[1]?.presses.length).toBeGreaterThan(0);
  });

  /**
   * **GitHub issue #565's third defect** — the sheet said `1 change while it played` and named the
   * dispatcher the round *opened* on.
   *
   * The round below is the assessor's own: opened on *Conventional collective*, handed to *Capacity
   * aware* at 26:31, ended at 41:02 in wave 14. Four claims, and each was missing:
   *
   * 1. the driver line names **both**, in the order they drove;
   * 2. the change carries its **clock**;
   * 3. it carries **what it was**, in the stage stamp's own words;
   * 4. it carries **what followed** — the stretch the round went on to play, which is a
   *    subtraction over two moments the round already holds and not a claim about what the press
   *    was worth.
   *
   * And the fifth is the one that keeps the other four honest: the note saying what was **not**
   * measured. A sheet that put *drove the remaining 14:31* beside *held 41:02* and said nothing
   * else invites the reader to subtract a counterfactual that was never run.
   */
  it('names every driver and every change, with its clock and what followed — GitHub issue #565', () => {
    const handed = round({
      dispatcherName: 'Conventional collective',
      drivers: ['Conventional collective', 'Capacity aware'],
      changes: [{ atS: 1591, verb: 'switched to Capacity aware' }],
      interventionCount: 1,
      outcome: outcome('broke', 2462),
    });
    const [line] = rushPostViewOf({ ...ready, rounds: [handed] }).rounds;
    expect(line?.driver).toBe('driven by Conventional collective, then Capacity aware');
    expect(line?.changes).toEqual(['26:31 · switched to Capacity aware — drove the remaining 14:31, to wave 14']);
    expect(line?.changesNote).toBe(RUSH_POST_COPY.changesNote);
    /* Not measured is said in those words — CLAUDE.md's rule about a mechanism nobody ran. */
    expect(line?.changesNote).toContain('not measured');
  });

  /**
   * **The note stops saying the sitting has one round once it has two** — wave AJ, § D1099, the
   * post-AI panel's seat A defect 7: round 1 pressed twice, round 2 *Run the rush again* with
   * nothing pressed, and round 1's note still read *this sitting has only the round you played*.
   */
  it('compares a pressed round with an untouched round that started the same way, and says nothing past this crowd', () => {
    const pressed = round({
      changes: [{ atS: 900, verb: 'parked the cars in the lobby' }],
      interventionCount: 1,
      outcome: outcome('broke', 2796),
      startKey: 'same-start',
    });
    const untouched = round({ outcome: outcome('broke', 3012), startKey: 'same-start' });
    const [first, second] = rushPostViewOf({ ...ready, rounds: [pressed, untouched] }).rounds;
    expect(first?.changesNote).not.toContain('only the round you played');
    expect(first?.changesNote).toBe(
      RUSH_POST_COPY.changesNoteTwin('Round 2', '50:12', outcome('broke', 3012).wave, 'held 3:36 less'),
    );
    expect(first?.changesNote).toContain('one crowd');
    /* The gap's three words, signed from the pressed round's side. */
    expect(RUSH_POST_COPY.twinGap(216, '3:36')).toBe('held 3:36 longer');
    expect(RUSH_POST_COPY.twinGap(0, '0:00')).toBe('held exactly as long');
    /* The untouched round has no changes, so it carries no note of its own. */
    expect(second?.changesNote).toBeUndefined();
  });

  it('does not compare rounds that started differently, or set a hand-stopped round beside one that broke', () => {
    const pressed = round({
      changes: [{ atS: 900, verb: 'parked the cars in the lobby' }],
      interventionCount: 1,
      startKey: 'one-start',
    });
    const elsewhere = round({ startKey: 'another-start' });
    const [line] = rushPostViewOf({ ...ready, rounds: [pressed, elsewhere] }).rounds;
    expect(line?.changesNote).toBe(RUSH_POST_COPY.changesNoteNoTwin);
    expect(line?.changesNote).not.toContain('only the round you played');

    const byHand = round({ outcome: outcome('stopped', 1200), startKey: 'one-start' });
    const [handLine] = rushPostViewOf({ ...ready, rounds: [pressed, byHand] }).rounds;
    expect(handLine?.changesNote).toBe(RUSH_POST_COPY.changesNoteTwinByHand('Round 2'));
  });

  it('draws no change list and no note on a round nobody touched', () => {
    const [line] = rushPostViewOf({ ...ready, rounds: [round()] }).rounds;
    expect(line?.changes).toEqual([]);
    /* A caption over an empty list is a caption over nothing — `docs/10` R3. */
    expect(line?.changesNote).toBeUndefined();
    /* And one driver still reads exactly as it always did. */
    expect(line?.driver).toBe('driven by Collective');
  });

  /**
   * A press stamped past the end draws its clock and stops there.
   *
   * `core` warns about an entry past a run's deadline rather than refusing it, so a record can hold
   * one; *drove the remaining −0:09* is what a subtraction with no guard would print, and it would
   * be the only negative duration anywhere in this product.
   */
  it('says nothing about what followed a press stamped past the round’s end', () => {
    const late = round({
      changes: [{ atS: 1700, verb: 'parked the cars in the lobby' }],
      interventionCount: 1,
      outcome: outcome('broke', 1640),
    });
    const [line] = rushPostViewOf({ ...ready, rounds: [late] }).rounds;
    expect(line?.changes).toEqual(['28:20 · parked the cars in the lobby']);
  });

  it('tells a round that broke from one the player stopped, on the round’s own line', () => {
    const rounds = [round({ outcome: outcome('stopped', 480) }), round()];
    const view = rushPostViewOf({ ...ready, rounds, check: rushSittingOf({ buildingId: 'midtown-office', rounds }) });
    expect(view.rounds[0]?.held).toContain('ended by hand');
    expect(view.rounds[1]?.held).toContain('held');
    expect(view.rounds[1]?.held).not.toContain('ended by hand');
  });

  it('draws a round’s own refusal on its line and the whole set under the button', () => {
    const refusal = 'the building “mine” is saved on this device alone';
    const rounds = [round({ unpostable: [refusal, 'and a second thing'] }), round()];
    const check = rushSittingOf({ buildingId: 'midtown-office', rounds });
    const view = rushPostViewOf({ ...ready, rounds, check });
    expect(view.rounds[0]?.refusal).toBe(refusal);
    expect(view.rounds[1]?.refusal).toBeUndefined();
    expect(view.pressable).toBe(false);
    /* The line shows one; the block shows all of them, which is `runIdentityIssues`' own rule. */
    expect(view.lines).toHaveLength(2);
  });

  it('shows no purse until the server has answered, and never computes one — § D543 clause 5', () => {
    const before = rushPostViewOf(ready);
    expect(before.purseNote).toBeUndefined();
    expect(before.rounds.every((entry) => entry.earned === undefined)).toBe(true);

    const after = rushPostViewOf({
      ...ready,
      outcome: {
        kind: 'posted',
        rounds: [
          { heldS: 900, wavesOutlasted: 5, purseBeforeUnits: 0, paidUnits: 10, purseAfterUnits: 10 },
          { heldS: 1640, wavesOutlasted: 9, purseBeforeUnits: 10, paidUnits: 18, purseAfterUnits: 28 },
        ],
      },
    });
    expect(after.rounds[0]?.earned).toBe(RUSH_POST_COPY.earned(5, 10, 10));
    expect(after.rounds[1]?.earned).toBe(RUSH_POST_COPY.earned(9, 18, 28));
    /* The figure is the server's and the sentence beside it says the purse buys nothing yet. */
    expect(after.purseNote).toBe(RUSH_POST_COPY.purseNote);
    expect(after.lines.map((line) => line.text)).toEqual([RUSH_POST_COPY.posted, RUSH_POST_COPY.placement]);
  });

  it('matches the server’s rounds to the list by position and by nothing else', () => {
    /*
     * `replayRushSitting` answers for every round it verified, in order, which is the only identity
     * the wire carries. A list that matched on a held time would be inventing one — and two rounds
     * of a sitting can hold for the same number of seconds.
     */
    const view = rushPostViewOf({
      ...ready,
      outcome: {
        kind: 'posted',
        rounds: [{ heldS: 1, wavesOutlasted: 1, purseBeforeUnits: 0, paidUnits: 2, purseAfterUnits: 2 }],
      },
    });
    expect(view.rounds[0]?.earned).toBe(RUSH_POST_COPY.earned(1, 2, 2));
    expect(view.rounds[1]?.earned).toBeUndefined();
  });

  it('says the list is empty rather than drawing nothing, and refuses the press', () => {
    const view = rushPostViewOf({
      ...ready,
      rounds: [],
      check: rushSittingOf({ buildingId: 'midtown-office', rounds: [] }),
    });
    expect(view.rounds).toEqual([]);
    expect(view.roundsEmpty).toBe(RUSH_POST_COPY.noRounds);
    expect(view.pressable).toBe(false);
    expect(view.lines[0]?.text).toBe(RUSH_SITTING_COPY.noRounds);
  });

  it('puts the build’s refusal before the sitting’s, so a serverless page is told that first', () => {
    /*
     * `postRun.ts`'s ladder: a property of the build, then of the sitting, then of the player. A
     * page with no API origin holding a hand-stopped sitting is told there is nowhere to post —
     * telling them to play the round out first would send them to do work that changes nothing.
     */
    const view = rushPostViewOf({
      ...ready,
      hasServer: false,
      check: { ok: false, reasons: [RUSH_SITTING_COPY.handStopped] },
    });
    expect(view.lines[0]?.text).toBe(POST_RUN_NO_SERVER);
  });

  it('keeps the button live after a post, because listing a player once is the server’s question', () => {
    const view = rushPostViewOf({ ...ready, outcome: { kind: 'posted', rounds: [] } });
    expect(view.pressable).toBe(true);
    expect(view.label).toBe(RUSH_POST_COPY.button);
  });

  it('refuses a second press while one is in flight', () => {
    const view = rushPostViewOf({ ...ready, posting: true });
    expect(view.pressable).toBe(false);
    expect(view.label).toBe(RUSH_POST_COPY.posting);
  });

  it('publishes no figure of its own in the block’s standing note', () => {
    /*
     * The note says what is sent and who checks it. A digit in it would be a claim about a run this
     * block does not measure — the hold line, the wave count and the purse all belong to producers
     * that read a recording or the server's reply, and none of them is this sentence.
     */
    expect(RUSH_POST_COPY.note).not.toMatch(/\d/u);
    expect(RUSH_POST_COPY.posted).not.toMatch(/\d/u);
    expect(RUSH_POST_COPY.placement).not.toMatch(/\d/u);
  });
});
