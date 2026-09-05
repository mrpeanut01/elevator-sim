/**
 * The race strip's pure half — GAMEPLAY §7.4, slice 4d.
 *
 * The three claims that decide the surface, each asserted rather than trusted:
 *
 * 1. **The lanes agree with the rest of the product about who is standing.** `raceSamplesOf`
 *    reaches its counts through `frame/overlay.ts#isWaitingAt`, and the suite still compares its
 *    answer against `live/observations.ts#observationsAt` — different code over the same legs —
 *    at every grid point, because agreement between two paths is evidence and a call is only
 *    plumbing.
 * 2. **With nobody picked the strip invents no rival**: one line per lane, no note, no verdict —
 *    the verdict slot carries the plain figure, and the ghost polyline is the empty string.
 * 3. **No interval claim, ever.** One day each is an anecdote; the footer is §7.4's permanent
 *    sentence verbatim, and no producer's output may smuggle interval language past it.
 */

import { describe, expect, it } from 'vitest';

import { observationsAt } from './observations.js';
import {
  GHOST_OPTIONS,
  LEVEL_WITHIN_POINTS,
  RACE_FOOTER,
  RACE_NOT_RUN,
  RACE_PENDING,
  RACE_SAMPLE_INTERVAL_S,
  RACE_WATCHING,
  SAME_CROWD_NOTE,
  SAME_RUN_NOTE,
  raceLaneOf,
  raceSamplesOf,
  raceSlotsOf,
  raceStripViewOf,
  raceVerdictOf,
  servedIdentically,
} from './raceStrip.js';
import { servedLeg, syntheticRecording, waitingLeg } from './synthetic.test-helper.js';

/** A 600 s day: one rider served quickly, one standing from 100 s to the end. */
function recordingOf(): ReturnType<typeof syntheticRecording> {
  return syntheticRecording({
    legs: [
      servedLeg('p-served', 50, 110, 200),
      waitingLeg('p-standing', 100),
    ],
  });
}

describe('raceSamplesOf', () => {
  it('samples the four-minute grid from startedAt, plus the playhead tip', () => {
    const samples = raceSamplesOf(recordingOf(), 500);
    expect(samples.map((sample) => sample.atS)).toEqual([0, 240, 480, 500]);
  });

  it('clamps the tip into the recording’s own span', () => {
    const samples = raceSamplesOf(recordingOf(), 10_000);
    const tip = samples[samples.length - 1];
    expect(tip?.atS).toBe(600);
  });

  it('counts the standing and averages their own waits — zero when nobody stands', () => {
    const samples = raceSamplesOf(recordingOf(), 480);
    // At 0 s nobody has arrived: no wait, not a missing value.
    expect(samples[0]).toEqual({ atS: 0, standing: 0, standingWaitS: 0 });
    // At 240 s the served rider boarded at 110; only p-standing (since 100 s) stands: 140 s.
    expect(samples[1]).toEqual({ atS: 240, standing: 1, standingWaitS: 140 });
    // At 480 s the same rider has stood 380 s.
    expect(samples[2]).toEqual({ atS: 480, standing: 1, standingWaitS: 380 });
  });

  it('agrees with observationsAt about who is standing, at every grid point', () => {
    const recording = recordingOf();
    for (const sample of raceSamplesOf(recording, recording.endedAt)) {
      expect(sample.standing).toBe(observationsAt(recording, sample.atS).waitingNow);
    }
  });
});

describe('raceVerdictOf', () => {
  it('is level under three points, in §6.5’s own words', () => {
    expect(raceVerdictOf(50, 48.5)).toBe('level with');
    expect(raceVerdictOf(50, 52.9)).toBe('level with');
    expect(LEVEL_WITHIN_POINTS).toBe(3);
  });

  it('names the direction and the points at three or more', () => {
    expect(raceVerdictOf(55, 50)).toBe('ahead by 5 points');
    expect(raceVerdictOf(50, 55.4)).toBe('behind by 5 points');
    expect(raceVerdictOf(53, 50)).toBe('ahead by 3 points');
  });

  it('refuses in words when either side has no share yet', () => {
    expect(raceVerdictOf(undefined, 50)).toBe('no score yet — too few served on one side to say');
    expect(raceVerdictOf(50, undefined)).toBe('no score yet — too few served on one side to say');
  });
});

describe('raceStripViewOf', () => {
  it('with a ghost: both series, the same-crowd note, and the verdict from both shares', () => {
    const recording = recordingOf();
    const view = raceStripViewOf({ recording, ghost: recording, simTimeS: 480 });
    expect(view.ghost).toBeDefined();
    expect(view.note).toBe(SAME_CROWD_NOTE);
    // The same recording on both sides is level with itself by construction.
    expect(view.verdict).toBe('level with');
    expect(view.footer).toBe(RACE_FOOTER);
  });

  it('with nobody: one line, no band, no verdict — the plain figure in its place', () => {
    const view = raceStripViewOf({ recording: recordingOf(), ghost: undefined, simTimeS: 480 });
    expect(view.ghost).toBeUndefined();
    expect(view.note).toBe('');
    expect(view.verdict).toBe('1 standing now');
    // The footer is permanent — it does not depend on there being a rival.
    expect(view.footer).toBe(RACE_FOOTER);
    // And the lane geometry draws nothing for the rival: the strip never invents one.
    const lane = raceLaneOf(view.yours, view.ghost, (sample) => sample.standing, { width: 640, height: 40 }, 600, 10);
    expect(lane.ghost).toBe('');
    expect(lane.you.length).toBeGreaterThan(0);
  });

  it('carries §7.4’s footer verbatim', () => {
    expect(RACE_FOOTER).toBe('One day each on the same crowd. That is a race, not proof.');
  });

  it('sampling interval is §7.4’s four simulated minutes', () => {
    expect(RACE_SAMPLE_INTERVAL_S).toBe(240);
  });
});

/**
 * **The three cells a shell writes that are not a polyline** — GitHub issue **#226**,
 * [§ D482](../../../../DECISIONS.md).
 *
 * `raceSlotsOf` exists because there are two strips now — `dev/main.ts`'s and
 * `everyday/stageScreen.ts`'s — and the order these states are decided in is a claim rather than a
 * formatting choice. A strip that printed *waiting for the rival's day* over a pick the picker had
 * already declined to run would be describing a request that was never made.
 */
describe('raceSlotsOf — the honesty order, once, for both shells', () => {
  const noRival = {
    pick: 'plain-baseline' as const,
    recording: undefined,
    refusal: undefined,
    watching: false,
  };

  /**
   * **GAMEPLAY § 14.1, and it outranks the refusal rather than sitting beside it.**
   *
   * This is the state the browser tier caught on two surfaces at once: the *nobody* pick's own note
   * reads *"no second run, no rival line, no score — just your day"*, and printed under somebody
   * else's lanes that is § 14.1's stated defect condition — *"the word `you` on a watched run is a
   * defect"*. The rank matters and is driven here with a refusal **and** a rival in flight beneath
   * it: both of those are sentences about a race this reader is not in, so either winning would put
   * the wrong words on a spectator's card.
   *
   * The verdict is emptied rather than filled, which is § 14.1's *"no verdict — you are not in this
   * comparison"* read literally. Each shell fills that cell with its own identity treatment — the
   * Everyday stage writes the record's eyebrow into it — and a slot function that guessed which
   * would be answering a question only the shell can.
   */
  it('lets a watched run outrank every state, including a refusal, and says why in the note', () => {
    const view = raceStripViewOf({ recording: recordingOf(), ghost: undefined, simTimeS: 480 });
    const slots = raceSlotsOf(
      view,
      { ...noRival, refusal: 'nothing saved yet', pending: true, watching: true },
      recordingOf(),
    );
    expect(slots.note).toBe(RACE_WATCHING);
    expect(slots.verdict).toBe('');
    expect(slots.rivalName).toBe('');
    /* The reason is a reason: it says why, not only no. */
    expect(RACE_WATCHING.length).toBeGreaterThan('no rival'.length);
    /*
     * And it may not address the reader, which is the constraint that forced the rewording rather
     * than a preference. The sentence it replaced said *"not while **you** are watching…"*, so
     * drawing it would have traded an unread `title` for a loud violation of the very rule it
     * explains. Asserted here rather than only in the browser sweep because this is where the
     * sentence lives, and a lane rewording it will run this file first.
     */
    const words = RACE_WATCHING.toLowerCase().match(/[a-z']+/gu) ?? [];
    expect(words.filter((word) => ['you', 'your', 'yours'].includes(word))).toEqual([]);
  });

  /* A drawn rival is still drawn when nobody is watching — the negative control for the arm above. */
  it('does not withhold the note when the run on screen is the reader’s own', () => {
    const recording = recordingOf();
    const view = raceStripViewOf({ recording, ghost: recording, simTimeS: 480 });
    expect(
      raceSlotsOf(
        view,
        { pick: 'plain-baseline', recording, refusal: undefined, pending: false, watching: false },
        recording,
      ).note,
    ).not.toBe(RACE_WATCHING);
  });

  it('lets a refusal outrank every state below it, including one still in flight', () => {
    const view = raceStripViewOf({ recording: recordingOf(), ghost: undefined, simTimeS: 480 });
    const slots = raceSlotsOf(
      view,
      { ...noRival, refusal: 'nothing saved yet', pending: true },
      recordingOf(),
    );
    expect(slots.verdict).toBe('nothing saved yet');
    // …and names nobody, because a refused pick drew no line to attribute.
    expect(slots.rivalName).toBe('');
  });

  it('says a rival is coming while one is in the worker, and says none has run when one is not', () => {
    const view = raceStripViewOf({ recording: recordingOf(), ghost: undefined, simTimeS: 480 });
    expect(raceSlotsOf(view, { ...noRival, pending: true }, recordingOf()).verdict).toBe(
      RACE_PENDING,
    );
    expect(raceSlotsOf(view, { ...noRival, pending: false }, recordingOf()).verdict).toBe(
      RACE_NOT_RUN,
    );
  });

  it('carries the plain figure under *nobody*, and the pick’s own note rather than nothing', () => {
    const view = raceStripViewOf({ recording: recordingOf(), ghost: undefined, simTimeS: 480 });
    const slots = raceSlotsOf(
      view,
      { pick: 'none', recording: undefined, refusal: undefined, pending: false, watching: false },
      recordingOf(),
    );
    expect(slots.verdict).toBe('1 standing now');
    expect(slots.rivalName).toBe('');
    /*
     * The note used to be `''` here, which was defensible beside the Engineer picker and is not on a
     * card whose only other words are a figure. It is the option's own sentence, from `GHOST_OPTIONS`
     * rather than authored twice — no new string, and the corpus already sweeps it.
     */
    expect(slots.note).toBe(GHOST_OPTIONS.find((option) => option.id === 'none')?.note);
  });

  it('names the drawn line by the picked option’s own label, and only when one is drawn', () => {
    const recording = recordingOf();
    const view = raceStripViewOf({ recording, ghost: recording, simTimeS: 480 });
    const slots = raceSlotsOf(
      view,
      { pick: 'plain-baseline', recording, refusal: undefined, pending: false, watching: false },
      recording,
    );
    expect(slots.rivalName).toBe(
      GHOST_OPTIONS.find((option) => option.id === 'plain-baseline')?.label,
    );
  });
});

/**
 * **A rival that drove the same way says so** — GitHub issue #226, § D482.
 *
 * ## The state this is about is measured rather than hypothetical
 *
 * A fresh shift opens on `collective` and *the plain baseline* resolves to `collective`, so at the
 * shipped defaults the rival's recording comes back **identical on the legs** — measured on
 * `garden-apartments`, not argued. The lines coincide exactly and the verdict reads *level with*,
 * which is true and is a comparison of one run with itself.
 *
 * That picture is indistinguishable from a picker bound to nothing, which is why it needs a
 * sentence: without one, the shape § D177 exists to catch and a correct, honest state look the same
 * on screen. `SAME_RUN_NOTE` is what tells them apart, and the assertions below are what keep it
 * attached to the right one.
 *
 * ## And the predicate is exact, which the alternative was not
 *
 * The first draft refused the pick **in front** — decline a rival naming the dispatcher already
 * driving — and it was measured and thrown away: `dev/state.ts#drivingProfileOf` runs the primary's
 * profile through the lever/selector/rules chain and the engine fills its own defaults, so the
 * driving profile carries `engine` and `answer` keys the raw `data/` profile does not. The objects
 * differ; the runs do not. Every predicate over the configs is guessing which differences are
 * behavioural, and guessing wrong in the refusing direction declines a race that was real.
 */
describe('servedIdentically — telling a vacuous race from an inert control', () => {
  it('is true of a recording against itself, and drives the note that says so', () => {
    const recording = recordingOf();
    expect(servedIdentically(recording, recording)).toBe(true);
    const view = raceStripViewOf({ recording, ghost: recording, simTimeS: 480 });
    const slots = raceSlotsOf(
      view,
      { pick: 'plain-baseline', recording, refusal: undefined, pending: false, watching: false },
      recording,
    );
    expect(slots.note).toBe(SAME_RUN_NOTE);
    /* The rival is still drawn and still named: this is a statement about the day, not a refusal. */
    expect(slots.rivalName).toBe(
      GHOST_OPTIONS.find((option) => option.id === 'plain-baseline')?.label,
    );
  });

  it('is false when the service differs, even though the crowd is the same crowd', () => {
    const yours = recordingOf();
    /* The same two arrivals — same ids, same seconds, same floors — served four seconds later. */
    const rival = syntheticRecording({
      legs: [servedLeg('p-served', 50, 114, 204), waitingLeg('p-standing', 100)],
    });
    expect(servedIdentically(yours, rival)).toBe(false);
    const view = raceStripViewOf({ recording: yours, ghost: rival, simTimeS: 480 });
    const slots = raceSlotsOf(
      view,
      { pick: 'plain-baseline', recording: rival, refusal: undefined, pending: false, watching: false },
      yours,
    );
    expect(slots.note).toBe(SAME_CROWD_NOTE);
  });

  it('is false when one side served somebody the other never did', () => {
    const yours = recordingOf();
    const rival = syntheticRecording({
      legs: [servedLeg('p-served', 50, 110, 200), servedLeg('p-standing', 100, 300, 400)],
    });
    expect(servedIdentically(yours, rival)).toBe(false);
  });

  it('is false on a different-length record without walking off the end of the shorter one', () => {
    const yours = recordingOf();
    const rival = syntheticRecording({ legs: [servedLeg('p-served', 50, 110, 200)] });
    expect(servedIdentically(yours, rival)).toBe(false);
    expect(servedIdentically(rival, yours)).toBe(false);
  });
});

describe('raceLaneOf', () => {
  it('draws both lines on one shared scale over one shared clock', () => {
    const yours = [
      { atS: 0, standing: 0, standingWaitS: 0 },
      { atS: 240, standing: 4, standingWaitS: 30 },
    ];
    const ghost = [
      { atS: 0, standing: 0, standingWaitS: 0 },
      { atS: 240, standing: 8, standingWaitS: 30 },
    ];
    const box = { width: 640, height: 40 };
    const lane = raceLaneOf(yours, ghost, (sample) => sample.standing, box, 480, 10);
    // 240 of 480 s is mid-box for both lines; the ghost's 8 of max(15, …) sits below your 4's y.
    const yourPoints = lane.you.split(' ').map((pair) => pair.split(',').map(Number));
    const ghostPoints = lane.ghost.split(' ').map((pair) => pair.split(',').map(Number));
    expect(yourPoints[1]?.[0]).toBeCloseTo(320, 0);
    expect(ghostPoints[1]?.[0]).toBeCloseTo(320, 0);
    expect(ghostPoints[1]?.[1] ?? 0).toBeLessThan(yourPoints[1]?.[1] ?? 0);
    // The marker sits inside the box.
    expect(lane.markY).toBeGreaterThan(0);
    expect(lane.markY).toBeLessThan(box.height);
  });
});

describe('no interval claim, ever', () => {
  it('keeps interval language out of every string the strip can produce', () => {
    const recording = recordingOf();
    const texts = [
      RACE_FOOTER,
      SAME_CROWD_NOTE,
      RACE_PENDING,
      RACE_NOT_RUN,
      ...GHOST_OPTIONS.flatMap((option) => [option.label, option.note]),
      raceVerdictOf(55, 50),
      raceVerdictOf(50, 55),
      raceVerdictOf(50, 49),
      raceVerdictOf(undefined, undefined),
      raceStripViewOf({ recording, ghost: recording, simTimeS: 480 }).verdict,
      raceStripViewOf({ recording, ghost: undefined, simTimeS: 480 }).verdict,
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/interval|confidence|±|significan|p\s*[<=]/i);
      // R2's line: no dispatcher is named better/worse — the verdict is about two shares.
      expect(text).not.toMatch(/\bbetter than\b|\bworse than\b|\bbeats\b/i);
    }
  });
});
