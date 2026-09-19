/**
 * **Stage 1 is doable with a tweak and failable with the wrong tweak, and both halves are a run** —
 * `docs/38` § 2.1, `docs/33` DC-3, GitHub issue **#234**, [§ D691](../../../../DECISIONS.md).
 *
 * > *"The first one or two scenarios are doable with a tweak to the dispatcher and failable with the
 * > wrong tweak: that is DC-2 and DC-3 together, a stage the dropdown alone does not clear and **a
 * > witness vector that does**."*
 *
 * Until this file there was no witness vector anywhere in the campaign, and the reason was a reading
 * error rather than the content. `data/scenario-survivors.json` publishes `dials: 0/12` on every one
 * of its thirty cells, and that was circulated — in `CLAUDE.md`-adjacent briefing notes, in a war
 * room and in my own dispatch brief — as ***"0 of 360 dial judgements; not one clears"***, a
 * statement about the game. It is not one. `survivors.ts` says so on its own face: **the dropdown is
 * a census and the dials are a sample**, `SURVIVOR_SAMPLE_SIZE` is **12**, and
 * `survivors.ts#dialShareInterval` derives an exact Clopper–Pearson interval at read time, which at
 * twelve draws and zero survivors bounds the clearing share at **about a quarter** rather than at
 * nothing. Nothing was measured to be impossible; twelve draws found nothing.
 *
 * ## What the wider draw found, and the command that found it
 *
 * `witnessSearch.test-helper.ts` extends the published draw rather than replacing it — the sampler
 * runs one seeded loop and only its stopping point depends on `sampleSize`, so the first twelve
 * configurations at k = 200 **are** the twelve the published cell judged. Measured 2026-09-19 on
 * this tree, `stage-1-first-call`, master seed 20 260 910, the stage's own 50 tuning and 50 holdout
 * replications under common random numbers, judged by `campaign/stageSequence.ts#runStageToVerdict`:
 *
 * | rung | dials | cleared | exact 95 % interval on the share |
 * |---|---|---|---|
 * | base (4 u) | 200 | **3** — draw indices **30, 91, 143** | [0.0031, 0.0433] |
 * | equipment (24 u) | 200 | **2** — draw indices **141, 142** | [0.0012, 0.0357] |
 *
 * **All three base-rung witnesses buy the same two changes — `idle-parking` and `cost-scaling` —
 * and `idle-parking` is the dial this stage exists to teach.** `data/campaign.json`'s own brief
 * says it in the player's words: *"between calls the two cars simply sit wherever the last passenger
 * left them … You can tell them where to wait instead, and the ground floor is only the first
 * guess."* So the way through is the intended one, and what the published cell got wrong was its
 * density, not its direction.
 *
 * ## What this file does and does not assert
 *
 * It re-draws the base rung at k = 200 — pure, no simulation — and judges **four** of the two
 * hundred: the three witnesses, which must clear, and {@link FAILING_DRAW}, which must not. That is
 * both halves of § 2.1's sentence held by a run, at the cost of four cells rather than two hundred.
 * The negative half is not decoration: a file that only asserted the witnesses would go green on a
 * stage that had become trivially clearable, which is DC-1 (*"a rung where every configuration
 * clears has nothing for a player to fail"*) and the thing `survivors.ts` refuses a table for.
 *
 * It does **not** publish a survivor count and does not touch `data/scenario-survivors.json`. That
 * table stays at `SURVIVOR_SAMPLE_SIZE = 12` because `data/scenario-survivor-bands.json` records
 * `approvedAtSampleSize: 12` and `survivorBands.test-helper.ts#sampleSizeIssue` refuses a table
 * regenerated at any other size until the product owner re-approves the band — a band is a share of
 * what was judged, so widening `k` would silently move all ten band readings. **The shipped count and
 * this witness are answers to two different questions and are deliberately not reconciled into one
 * number.**
 *
 * ## The measured share is far below the band, and that is the finding this file does not close
 *
 * Three of two hundred is **1.5 %**. `data/scenario-survivor-bands.json` puts positions one and two
 * at a floor of **0.25** of the configurations judged. So stage 1 is not unwinnable by dials — it is
 * about seventeen times narrower than the owner approved, and at k = 12 a player-facing count will
 * report zero roughly **five times out of six**. The rebalance #234 asks for is still owed; what has
 * changed is that it now has a measured target and a cheap instrument to aim at.
 *
 * A gate would be wrong here and is refused rather than forgotten: `deepTiers.test.ts` derives the
 * env-gated tier set from disk, and a tenth tier arriving unwired is a red pull request. Four cells
 * on `garden-apartments` cost seconds, so this runs always-on and skips nothing.
 */

import { describe, expect, it } from 'vitest';

import {
  drawDialConfigurations,
  judgeDialDraws,
  witnessFixtureFor,
  type DialVerdict,
  type WitnessFixture,
} from './witnessSearch.test-helper.js';

/** The stage `docs/38` § 2.1's *"first one or two scenarios"* sentence is measured on here. */
const STAGE_ID = 'stage-1-first-call';

/**
 * The sample size the witnesses were found at, and the one their indices are only meaningful in.
 *
 * An index names a configuration **in a draw**, so this constant and {@link WITNESS_DRAWS} move
 * together or not at all. Drawing is pure, so re-deriving two hundred configurations to judge four
 * of them costs nothing measurable.
 */
const SEARCH_SAMPLE_SIZE = 200;

/**
 * Draw indices at the base rung that cleared both seed sets, measured 2026-09-19.
 *
 * Pinned by index rather than by value because the index is what makes the claim reproducible: a
 * reader re-runs the same sampler at the same master seed and gets the same two hundred vectors in
 * the same order. The values are asserted to buy `idle-parking` below, which is the substantive half.
 */
const WITNESS_DRAWS: readonly number[] = [30, 91, 143];

/**
 * A drawn configuration at the same rung that does **not** clear — § 2.1's *"failable with the wrong
 * tweak"*, and DC-1 as a reading of this file.
 *
 * Index 0 rather than a hand-written bad vector, for `measureSurvivors.ts`'s reason: a vector this
 * file invented would be a failure the sampler cannot produce, and the claim is about the space a
 * player's budget actually reaches.
 */
const FAILING_DRAW = 0;

/** The change every measured base-rung witness bought, and the one the stage's brief points at. */
const TAUGHT_CHANGE = 'idle-parking';

describe('stage 1 has a dial witness, and a dial that misses — docs/38 § 2.1, issue #234', () => {
  it('clears on three drawn dial edits and misses on a fourth', async () => {
    const fixture: WitnessFixture = await witnessFixtureFor(STAGE_ID);
    const drawn = await drawDialConfigurations({ fixture, sampleSize: SEARCH_SAMPLE_SIZE });

    expect(
      drawn.length,
      `the sampler returned ${String(drawn.length)} configurations at k = ` +
        `${String(SEARCH_SAMPLE_SIZE)}, so the pinned indices name nothing. The draw budget or the ` +
        'reachable space moved; that is a finding, not a number to edit.',
    ).toBe(SEARCH_SAMPLE_SIZE);

    const wanted = [...WITNESS_DRAWS, FAILING_DRAW];
    const draws = drawn.filter((draw) => wanted.includes(draw.index));
    const verdicts = await judgeDialDraws({ fixture, draws });
    const byIndex = new Map<number, DialVerdict>(verdicts.map((entry) => [entry.index, entry]));

    /* § 2.1's first half: a witness vector that does clear. */
    expect(
      WITNESS_DRAWS.filter((index) => byIndex.get(index)?.cleared !== true),
      'a pinned dial witness stopped clearing stage 1 on both seed sets. docs/38 § 2.1 asks the ' +
        'first scenarios to be "doable with a tweak", and this file is the only run that says one ' +
        'is. Something moved — the stage, the building, a profile, the price schedule or a goal ' +
        'bar — and the thing to do is find out which, then re-search rather than delete the pin.',
    ).toEqual([]);

    /* § 2.1's second half, and DC-1: a wrong tweak that does not. */
    expect(
      byIndex.get(FAILING_DRAW)?.cleared,
      'every configuration this file judges now clears stage 1, so nothing in the sampled space ' +
        'fails and there is nothing for a player to get wrong. That is DC-1, which survivors.ts ' +
        'refuses a table for: "a rung where every configuration clears has nothing for a player ' +
        'to fail."',
    ).toBe(false);

    /* The substantive half of the pin: the way through is the dial the stage teaches. */
    for (const index of WITNESS_DRAWS) {
      expect(
        byIndex.get(index)?.changeIds,
        `witness ${String(index)} no longer buys "${TAUGHT_CHANGE}". The stage's brief tells the ` +
          'player to move where the idle cars wait; a witness that wins by buying something else ' +
          'is a way through that the scenario does not teach.',
      ).toContain(TAUGHT_CHANGE);
    }
  }, 300_000);
});
