/**
 * The first session's draw — GitHub issue #208's code half, § D475, § D512, § D514.
 *
 * Three of the issue's four criteria are properties of the run and are held here; the fourth, ten
 * first-time testers, is not a property of code (§ D349). AC1 and AC2 — a building visibly failing
 * inside ninety seconds, legible on the stage before the report — are the legibility instrument's
 * own question asked of every member of the drawn set, on `legibility.test.ts`'s pinned seeds; AC3,
 * one change that measurably helped, is the report's lever path, which `campaign/works.test.ts` and
 * `dev/reportPanel` already pin on the legs and is not re-pinned here.
 */

import { describe, expect, it } from 'vitest';

import { recordRun } from '../record/recordRun.js';
import {
  buildingConfigOf,
  initialState,
  shiftLengthForContract,
  shiftRunConfigOf,
  withFirstSession,
} from '../dev/state.js';

import { contractBuildings, contractDayState } from './contractDay.test-helper.js';

import { CONTRACTS, FIRST_CONTRACT_ID, contractById } from './contracts.js';
import { dailySeedFor } from './dailySeed.js';
import { scenarioHorizonFor } from './dayLength.js';
import {
  ELIGIBLE_FIRST_CONTRACT_IDS,
  FIRST_SESSION_LINE,
  FIRST_SESSION_LINE_CHOSEN,
  FIRST_SESSION_LINE_PINNED,
  FIRST_SESSION_LINE_PINNED_BY_NUMBER,
  firstDayDealOf,
  firstSessionDayFor,
  firstSessionLineFor,
  FIRST_SESSION_STREAM,
  LEGIBILITY_SWEEP_N,
  firstSessionContractFor,
  isDealtPinnedDay,
  isFirstDayOnALegibleTower,
} from './firstSession.js';
import { FIRST_DAY_CONTRACT_IDS } from './firstSession.js';
import { admittedPressDayIds, pressDayFor, pressDayStanding } from './ladder.js';
import { LEGIBILITY_SWEEP, legibilityOf } from './legibility.js';
import { openWeek } from './week.js';

describe('the eligible set — § D512’s table read by arithmetic', () => {
  it('is every contract legible on more than a third of fifty seeds, in contract order', () => {
    /*
     * **`c9` joined on 2026-09-14** — GitHub issue #500. Harbour Point is legible on 50 of 50 at a
     * median 1 343 s, the second-most legible tower in the catalogue, because the group cannot
     * clear its crowd. `c10` (Ashgate) did **not** join: 10 of 50, below the threshold, because its
     * problem is a second leg rather than a held landing. Both are the table's reading rather than
     * a choice, and this list is derived from it.
     *
     * **`c11`, `c12` and `c13` joined on 2026-09-15** — GitHub issues #425, #424 and #430 — all
     * three at 50 of 50, which takes the set from six to nine and moves
     * {@link FIRST_SESSION_LINE}'s own word with it. **That is not a compliment to those towers.**
     * Legible means *somebody stood past a minute on a landing for two contiguous minutes*, and on a
     * tower of four to eight thousand people that is the building rather than a problem a first
     * session can see and solve: their median stretches are 1 221 s, 729 s and 459 s, and the two
     * towers already at 50 of 50 are the two this table records as legible all day **because the
     * group cannot cope**. The threshold is § D512's reading of its own table and is not moved here;
     * whether a first session should open on a supertall at all is a design question this file
     * cannot answer and does not pretend to.
     */
    /*
     * **`c15` and `c16` joined on 2026-09-15 and `c14` did not** — GitHub issues #427, #426 and
     * #428 — which is the first wave where three towers of one class split across this threshold.
     * Empire-State-class is legible on 45 of 50 at a median 472 s and Willis-class on 50 of 50 at
     * 2 347 s, so both clear it; **One-WTC-class is legible on 1 of 50 at a median 13 s** and is the
     * first supertall this table has found ineligible. The paragraph above reads the three before
     * them as legible *because* they are towers of thousands, and that reading is now refuted as a
     * claim about size: these three span 4 810 to 9 200 occupants and span the whole range the
     * instrument reports. The threshold is still § D512's and is still not moved here.
     */
    /*
     * **`c9` left and `c10` joined on 2026-09-22** — GitHub issue #584,
     * [§ D961](../../../../DECISIONS.md). The sweep this set is derived from had been measuring
     * every tower **as built**: its states paired a contract's `buildingId` with `baseState()`'s
     * `c1` week, and `shift/ladder.ts#rungFor` keys a rung on both, so no rung reached any run.
     * Measured as the contracts hand their towers over, Harbour Point — let at the three fifths its
     * own rung declares — is legible on **11 of 50** rather than 50 and drops below the threshold,
     * and Ashgate, at the rate its rung declares, rises from 10 to **32** and clears it.
     *
     * **The set is the same size and not the same set**, which is the case worth stating out loud:
     * eleven members before and eleven after, so {@link FIRST_SESSION_LINE}'s own count does not
     * move and nothing downstream of the count does either. What moved is which tower a new player
     * can be handed, and Harbour Point — the second-most legible contract in the catalogue by the
     * old table — is now one a first session never opens on.
     */
    /*
     * **The set gains three members on the integrated tree, and its published count moves for the
     * first time since it was derived** — [§ D963](../../../../DECISIONS.md). GitHub issue #587's
     * lane booked a car out of seven contracts' day 1 and rebalanced six of their rungs
     * ([§ D914](../../../../DECISIONS.md)); the sweep above was pinned before that landed. Measured
     * on the merged tree at the same 800-day budget, `c6` goes 14 of 50 → **25**, `c8` **3 → 43**
     * and `c9` 11 → **20**, so all three cross § D512's threshold from below. `c10` stays in at 27.
     *
     * **The threshold is not moved and neither is any rung.** Eleven members → **fourteen**, and
     * only `c1` and `c14` of the sixteen are now out. That does move a player-facing sentence —
     * {@link FIRST_SESSION_LINE} reads *fourteen towers* — and it moves `shift/dailySeed.ts`'s two
     * published rotation figures with it, because those are functions of this set's **length**.
     *
     * **Two long-standing readings stop being true, and they are named rather than dropped.**
     * *Chancery House and St Jude's are legible rarely, which is the same verdict for a first
     * session as never* was measured on days with every car in service. Both now book cars out —
     * St Jude's books two — and both are eligible. A first session can now open on the hospital.
     */
    /*
     * **Fourteen → fifteen on 2026-09-24, and it is the horizon that moved rather than a rung** —
     * [§ D991](../../../../DECISIONS.md), GitHub issue #592. The table was measured on each
     * contract's slice while the first session plays Today's scenario, which is the whole authored
     * day on thirteen of sixteen contracts. Re-measured on the day actually played, `c14`
     * (One-WTC-class) goes 1 of 50 → **31** and joins; nothing leaves, and only `c1` — no authored
     * day, so its slice is its day — is out. The threshold is untouched.
     */
    expect(ELIGIBLE_FIRST_CONTRACT_IDS).toEqual([
      'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16',
    ]);
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) {
      const row = LEGIBILITY_SWEEP.find((entry) => entry.contractId === id);
      expect(row?.legibleOf50 ?? 0).toBeGreaterThan(50 / 3);
    }
    /* The two the instrument still finds never or rarely legible are out, the campaign's opener
     * first. It was five until the rungs moved; `c6`, `c8` and `c9` are in now, and shrinking this
     * list is the measurement rather than a concession — every one of the three is above the
     * threshold § D512 set and nothing here moved that threshold. */
    for (const id of ['c1']) expect(ELIGIBLE_FIRST_CONTRACT_IDS).not.toContain(id);
    expect(ELIGIBLE_FIRST_CONTRACT_IDS).not.toContain(FIRST_CONTRACT_ID);
  });

  it('names contracts the product ships, and only those', () => {
    const shipped = new Set(CONTRACTS.map((contract) => contract.id));
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) expect(shipped.has(id)).toBe(true);
    expect(new Set(LEGIBILITY_SWEEP.map((row) => row.contractId))).toEqual(shipped);
  });
});

describe('the draw — a named stream off the session’s seed', () => {
  it('is a function of the seed, lands inside the first-day set, and reaches every member', () => {
    /*
     * **The set it lands in is the first-day set since § D1047**, not the legible one. Over the
     * legible set this drew fifteen towers, six of them reference towers no shipped dispatcher
     * clears on a whole day (§ D962); over the first-day set it deals six pinned days.
     */
    expect(FIRST_SESSION_STREAM).toBe('first-session');
    const seen = new Map<string, number>();
    for (let n = 0; n < 2_000; n += 1) {
      const seed = 20_260_906n + 7_919n * BigInt(n);
      const drawn = firstSessionContractFor(seed);
      expect(firstSessionContractFor(seed)).toBe(drawn);
      expect(FIRST_DAY_CONTRACT_IDS).toContain(drawn);
      seen.set(drawn, (seen.get(drawn) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([...FIRST_DAY_CONTRACT_IDS].sort());
    /*
     * No member is starved: each lands at least a fifth of its share. The bound is **derived from
     * the set's own size** rather than written as `2 000 / 25`, which was five squared and read as a
     * constant — a hard-coded denominator would have moved from *a fifth of a share* to something
     * else every time the set did, without anybody choosing that.
     */
    const share = 2_000 / FIRST_DAY_CONTRACT_IDS.length;
    for (const id of FIRST_DAY_CONTRACT_IDS) expect(seen.get(id) ?? 0).toBeGreaterThan(share / 5);
  });

  it('opens a fresh week on the drawn contract, on its pinned crowd under its standing order — § D1047', () => {
    const resources = contractBuildings();
    const seed = 424_242n;
    const drawn = withFirstSession(initialState(resources, seed), resources, { crowdFromAddress: false });
    const contract = contractById(firstSessionContractFor(seed));
    const press = pressDayFor(contract?.id);
    expect(contract).toBeDefined();
    expect(press).toBeDefined();
    expect(drawn.week).toEqual(openWeek(contract?.id));
    expect(drawn.buildingId).toBe(contract?.buildingId);
    expect(drawn.shiftLengthS).toBe(shiftLengthForContract(contract?.id ?? ''));
    expect(drawn.parkedWeeks).toEqual([]);
    expect(isFirstDayOnALegibleTower(drawn.week)).toBe(true);
    /* The pair `everyday/host.ts#playPressDay` writes, read from the same row. */
    expect(drawn.seed.toString()).toBe(press?.seedText);
    expect(drawn.dispatcherId).toBe(press?.standingOrder);
    expect(firstSessionDayFor(seed)).toEqual({
      contractId: contract?.id,
      seed: BigInt(press?.seedText ?? '0'),
      standingOrder: press?.standingOrder,
    });
    /* And it is the pinned day as the picker and the brief recognise one — one predicate, § D973. */
    const horizon = scenarioHorizonFor(
      resources.trafficProfiles,
      buildingConfigOf(resources, [], contract?.buildingId ?? ''),
    );
    expect(
      pressDayStanding({
        contractId: drawn.week.contractId,
        day: drawn.week.day,
        eventId: 'ordinary',
        hasCalendar: drawn.calendar !== null,
        seed: drawn.seed,
        horizon,
      }),
    ).toBe(press);
    expect(isDealtPinnedDay(drawn.week.contractId, drawn.seed, seed)).toBe(true);
  });

  it('lets a `?seed=` in the address win: the tower is drawn from it and played on it — § D1047', () => {
    const resources = contractBuildings();
    const seed = 424_242n;
    const linked = withFirstSession(initialState(resources, seed), resources, { crowdFromAddress: true });
    expect(linked.week.contractId).toBe(firstSessionContractFor(seed));
    expect(linked.seed).toBe(seed);
    expect(linked.dispatcherId).toBe(initialState(resources, seed).dispatcherId);
    expect(isDealtPinnedDay(linked.week.contractId, linked.seed, seed)).toBe(false);
  });

  it('stores nothing: a reload re-derives the same day, and what is saved is what an unpinned first day saves', () => {
    /*
     * § D993's forward rule — no field whose only reader is the first-visit gate. Two halves. The
     * state it returns has exactly the fields it was handed, so there is no new field to persist;
     * and the pin reaches the run through `seed` and `dispatcherId`, which `persist/session.ts`'s
     * snapshot (week, parked weeks, settings, free play) does not carry, so what the pinned day
     * saves is what the same week saves on the address's crowd. A reload that restores no session
     * therefore draws again, and the date hands it the same pin.
     */
    const resources = contractBuildings();
    const daySeed = dailySeedFor('2026-09-25');
    const first = withFirstSession(initialState(resources, daySeed), resources, { crowdFromAddress: false });
    const reload = withFirstSession(initialState(resources, daySeed), resources, { crowdFromAddress: false });
    expect(Object.keys(first).sort()).toEqual(Object.keys(initialState(resources, daySeed)).sort());
    expect(reload.seed).toBe(first.seed);
    expect(reload.week).toEqual(first.week);
    expect(reload.dispatcherId).toBe(first.dispatcherId);
    const unpinned = withFirstSession(initialState(resources, daySeed), resources, { crowdFromAddress: true });
    const saved = (state: typeof first): string =>
      JSON.stringify({ week: state.week, parkedWeeks: state.parkedWeeks });
    expect(saved(first)).toBe(saved(unpinned));
    expect(first.seed).not.toBe(unpinned.seed);
  });

  it('gives a pin whose own number draws its tower an arm of its own, and names which pins do', () => {
    /*
     * This case was written first as *no pin draws its own tower*, so that three arms would do — and
     * it was red on its first run: `c8`'s `20276662` draws `c8`, and `c10`'s `20355852` draws
     * `c10`. The pins were searched on the same sequence the draw is handed, and with six members a
     * pin draws its own tower one time in six, so two of six is no surprise. A `?seed=20276662`
     * link therefore lands on St Jude's pinned day as measured, and of the three arms one says the
     * date chose it, one that the crowd is not the measured one, and one that the week was moved
     * rather than drawn — all false. So it has a fourth, and the literal below says which pins reach
     * it, so a re-pin that moves them is seen.
     */
    const selfDrawing = FIRST_DAY_CONTRACT_IDS.filter(
      (id) => firstSessionContractFor(BigInt(pressDayFor(id)?.seedText ?? '0')) === id,
    );
    expect(selfDrawing).toEqual(['c8', 'c10']);
    for (const id of selfDrawing) {
      const pin = BigInt(pressDayFor(id)?.seedText ?? '0');
      const notTheDate = dailySeedFor('2026-09-25');
      if (firstSessionContractFor(notTheDate) === id) continue;
      expect(firstSessionLineFor(id, pin, notTheDate)).toBe(FIRST_SESSION_LINE_PINNED_BY_NUMBER);
    }
    expect(FIRST_SESSION_LINE_PINNED_BY_NUMBER).toContain('that crowd, and it is also the draw');
    expect(FIRST_SESSION_LINE_PINNED_BY_NUMBER).not.toMatch(/\b(park|parking|spread|lobby|today)\b/iu);
  });
});

describe('the door’s line — derived from the week, never stored', () => {
  it('is true of a first day nobody has played on a legible tower, and of nothing else', () => {
    expect(isFirstDayOnALegibleTower(openWeek('c2'))).toBe(true);
    expect(isFirstDayOnALegibleTower(openWeek('c1'))).toBe(false);
    expect(isFirstDayOnALegibleTower({ ...openWeek('c2'), day: 2 })).toBe(false);
    expect(isFirstDayOnALegibleTower({ ...openWeek('c2'), attempt: 1 })).toBe(false);
    /*
     * It was said here that the line is *worded to be true however the player arrived*. It was not
     * — its last sentence names the draw — and GitHub issue #595 gave it a second arm for a first
     * day the draw did not choose; see the case below.
     */
    /*
     * **Both figures are checked against the table rather than against a literal** — GitHub issues
     * #500 and #501. This read `toContain('five towers')` and `toContain('400 days')`, which pinned
     * a sentence that was true of an eight-contract sweep; the sweep is ten now and both numbers
     * moved. A test that asserts the same literal the module authors cannot tell a correct sentence
     * from a stale one, so it asserts the *derivation*: the count is the eligible set's length and
     * the days are `rows × n`. `docs/37` § 6's rule, applied to the check as well as to the string.
     */
    /*
     * **Extended past `ten` on 2026-09-15** (GitHub issues #428, #427 and #426), on the same commit
     * as `firstSession.ts`'s own list and for the same reason: the eligible set reached **eleven**,
     * so `words[11]` was `undefined`, the `?? ''` arm made the assertion read `toContain(' towers')`
     * — which passes on any sentence containing the word — and the non-vacuity bound below caught
     * it. That bound is the whole reason this failed loudly rather than quietly, and it is why the
     * list here is a **second, independent copy** rather than an import: a check that read
     * `NUMBER_WORDS` from the module would agree with a wrong module.
     */
    const words = [
      'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
      'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    ];
    /* § D1047: the drawn arms count the set the draw is over, which is the first-day set. */
    for (const line of [FIRST_SESSION_LINE, FIRST_SESSION_LINE_PINNED]) {
      expect(line).toContain(`${words[FIRST_DAY_CONTRACT_IDS.length] ?? ''} towers`);
      expect(line).toContain(`${String(LEGIBILITY_SWEEP.length * LEGIBILITY_SWEEP_N)} days`);
      expect(line).not.toMatch(/\b(you|your|yours)\b/iu);
      /* § D529 clause 4: no worked answer outside the tutorial — neither verb, nor which one. */
      expect(line).not.toMatch(/\b(park|parking|spread|lobby)\b/iu);
    }
    expect(FIRST_SESSION_LINE_CHOSEN).toContain(`${words[ELIGIBLE_FIRST_CONTRACT_IDS.length] ?? ''} towers`);
    expect(FIRST_DAY_CONTRACT_IDS.length).toBeGreaterThan(1);
    // Non-vacuity: the set is neither empty nor past the word list, so neither `toContain` above
    // is asserting the presence of a bare ` towers`.
    expect(ELIGIBLE_FIRST_CONTRACT_IDS.length).toBeGreaterThan(1);
    expect(ELIGIBLE_FIRST_CONTRACT_IDS.length).toBeLessThan(words.length);
    expect(FIRST_SESSION_LINE).not.toMatch(/\b(you|your|yours)\b/iu);
  });
});

describe('AC1 and AC2, asked of every member of the set on the pinned seeds', () => {
  it('every eligible contract’s day 1 is legible on most of the first ten seeds, and says when', () => {
    const resources = contractBuildings();
    const legibleAt: Record<string, number[]> = {};
    for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) {
      const contract = contractById(id);
      if (contract === undefined) throw new Error(id);
      const moments: number[] = [];
      for (let n = 0; n < 10; n += 1) {
        /* The pair, built together — GitHub issue #584, § D961; see `contractDay.test-helper.ts`. */
        const state = contractDayState(id, { seed: 20_260_824n + 7_919n * BigInt(n) });
        const plan = shiftRunConfigOf(resources, state);
        const day = legibilityOf(
          recordRun(plan.config, {
            recordDecisions: false,
            outOfServiceCarIds: plan.outOfServiceCarIds,
          }).recording,
        );
        if (day.legible) moments.push(day.legibleAtS ?? -1);
        expect(day.legible).toBe(day.legibleAtS !== undefined);
      }
      legibleAt[id] = moments;
    }
    /*
     * The slice `legibility.test.ts` pins, read for the set: c3 is the two-fifths member, and `c10`
     * replaced `c9` on 2026-09-22 (GitHub issue #584, § D961) when the sweep stopped measuring
     * every tower as built. Ashgate's day 1 holds a landing past the band on seven of the ten
     * pinned seeds at the rate its own rung declares; Harbour Point's, let at the three fifths its
     * rung declares, holds one on **one**, which is why it is no longer in this walk at all.
     *
     * **`c15` and `c16` joined on 2026-09-15** (GitHub issues #427 and #426) at eight and ten of
     * ten. `c14` is absent from this walk because it is absent from the set — One-WTC-class is
     * legible on 1 of 50 and did not clear the threshold — and its absence here is the same
     * measurement the row above records, arriving through the derivation rather than through a
     * second list.
     */
    /*
     * **Re-measured on the integrated tree** — § D963. The walk is three members longer, because
     * `c6`, `c8` and `c9` crossed the threshold when their rungs booked a car out; six of the
     * eleven earlier members moved with their own rungs and five are unmoved. `c9` at **5 of 10**
     * is below half and this case's own heading says *most* — the count is the measurement, and
     * neither it nor the heading is adjusted to flatter the other.
     */
    expect(Object.fromEntries(Object.entries(legibleAt).map(([id, list]) => [id, list.length]))).toEqual({
      c2: 8,
      c3: 7,
      c4: 6,
      c5: 8,
      c6: 6,
      c7: 7,
      c8: 8,
      c9: 5,
      c10: 6,
      c11: 10,
      c12: 10,
      c13: 10,
      /*
       * **`c14` joined the set on 2026-09-24 and reads one of ten here, and both are right** —
       * [§ D991](../../../../DECISIONS.md). This walk builds each member's **slice**
       * (`contractDayState`), and the set is now derived from the day Today's scenario plays, which
       * for One-WTC-class is the whole authored day: 31 of 50 there, 1 of 50 on its slice. So this
       * case reads the slice of a member admitted on its whole day. It is kept on the slice because
       * walking fifteen whole days × ten seeds here would cost the default suite most of an hour;
       * the whole-day rows are held at budget by `everyday/stagePace.sweep.test.ts` and
       * `legibility.sweep.test.ts`, and one whole day is pinned per run by `stagePace.test.ts`.
       */
      c14: 1,
      c15: 8,
      c16: 10,
    });
    /* AC1's clock: on every legible day the moment is inside the day, and never before the window. */
    for (const [id, list] of Object.entries(legibleAt)) {
      for (const at of list) {
        expect(at).toBeGreaterThanOrEqual(120);
        expect(at).toBeLessThanOrEqual(shiftLengthForContract(id));
      }
    }
  /*
   * **Thirteen contracts × ten seeds, and three of the thirteen are supertalls** — GitHub issues
   * #425, #424 and #430. This slice cost well inside 300 000 ms while the ladder was ten mid-rise
   * towers; measured on this tree it is about 190 s alone and **393 s under a full
   * `--project viz` run** at load average 27, so it failed on the budget rather than on the slice
   * and named a case that says nothing about legibility.
   *
   * Annotated rather than sampled down. The set this walks is derived from the sweep's own table, so
   * dropping seeds or members would make AC1 and AC2 claims about a subset of the eligible set
   * rather than about it. `vitest.config.ts`'s rule is that a site that knows it runs a simulation
   * may say so.
   *
   * **900 000 → 1 800 000 on 2026-09-15** — GitHub issues #427 and #426 put `c15` and `c16` into
   * the eligible set, taking this walk from nine members to **eleven**, two of them supertalls, and
   * it **timed out at 900 000 ms** on the tree that added them. Raised on the commit that made the
   * tree exceed it, with the ratchet's sum re-derived on the same commit.
   *
   * **Measured at 685 s alone earlier the same day** on a box already at load 25, against the old
   * 900 s bound — so the margin was already thin before the two members landed, and a second file
   * running beside it was enough to cross. The figure is quoted as what it is, a loaded-box reading
   * rather than a per-case cost, because attributing seconds to members under that much contention
   * would be arithmetic dressed as a measurement.
   */
  }, 1_800_000);
});

describe('the line has two arms, and the draw picks between them — issue #595, § D973', () => {
  it('says the number opens the tower only where the number’s own draw opens it', () => {
    /*
     * The picker (§ D912) and the pinned days both reach a legible first day the seed did not
     * choose, and *the same number opens the same tower* is false of both. So the arm is the draw's
     * own answer: across a run of seeds, every contract the draw names gets the first arm and every
     * other eligible contract gets the second.
     *
     * **Except on a contract's own pin** (§ D1047), and this run of seeds meets five of them: the
     * pins were searched on this very sequence (`20 260 824 + 7 919 n`, § D974 and § D1029), so
     * `n` = 2, 6, 8, 12 and 32 are the crowds c2 and c8, c3, c7, c10 and c6 were measured on. On its
     * pin a contract never reads the drawn arm — that arm says the crowd is not the measured one —
     * and reads the pinned arm only where the **day's** draw dealt it, which a date this case holds
     * fixed decides.
     */
    const daySeed = dailySeedFor('2026-09-25');
    let drawn = 0;
    let chosen = 0;
    let onPin = 0;
    for (let n = 0; n < 40; n += 1) {
      const seed = 20_260_824n + 7_919n * BigInt(n);
      const opened = firstSessionContractFor(seed);
      for (const id of ELIGIBLE_FIRST_CONTRACT_IDS) {
        const line = firstSessionLineFor(id, seed, daySeed);
        if (pressDayFor(id)?.seedText === seed.toString()) {
          expect(line, `${id} on its pin`).toBe(
            firstSessionContractFor(daySeed) === id
              ? FIRST_SESSION_LINE_PINNED
              : id === opened
                ? FIRST_SESSION_LINE_PINNED_BY_NUMBER
                : FIRST_SESSION_LINE_CHOSEN,
          );
          onPin += 1;
        } else if (id === opened) {
          expect(line, `${id} at ${String(seed)}`).toBe(FIRST_SESSION_LINE);
          drawn += 1;
        } else {
          expect(line, `${id} at ${String(seed)}`).toBe(FIRST_SESSION_LINE_CHOSEN);
          chosen += 1;
        }
      }
    }
    expect(drawn).toBeGreaterThan(30);
    expect(chosen).toBeGreaterThan(0);
    expect(onPin, 'the run of seeds meets no pin, so the case above tests nothing about one').toBeGreaterThan(0);
  });

  it('says the crowd is the pinned one exactly where the date dealt the tower and the crowd is its pin — § D1047', () => {
    /*
     * The pinned arm is the one a fresh device meets, and its chooser asks the draw on the **day's**
     * seed, because the printed number is the pin's. Over a year of dates: the date's dealt tower on
     * its pin reads the pinned arm; every other first-day tower on its own pin reads the chosen arm
     * (the picker's press-day row reaches it); and the day's own crowd on the dealt tower reads the
     * drawn arm — a player who came back to it from the picker — because the draw on that number
     * does deal it.
     */
    const reached = new Set<string>();
    for (let day = 0; day < 365; day += 1) {
      const date = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString().slice(0, 10);
      const daySeed = dailySeedFor(date);
      const dealt = firstSessionContractFor(daySeed);
      reached.add(dealt);
      for (const id of FIRST_DAY_CONTRACT_IDS) {
        const pin = BigInt(pressDayFor(id)?.seedText ?? '0');
        expect(firstSessionLineFor(id, pin, daySeed), `${id} on ${date}`).toBe(
          id === dealt
            ? FIRST_SESSION_LINE_PINNED
            : firstSessionContractFor(pin) === id
              ? FIRST_SESSION_LINE_PINNED_BY_NUMBER
              : FIRST_SESSION_LINE_CHOSEN,
        );
        expect(isDealtPinnedDay(id, pin, daySeed)).toBe(id === dealt);
      }
      expect(firstSessionLineFor(dealt, daySeed, daySeed)).toBe(FIRST_SESSION_LINE);
    }
    expect([...reached].sort()).toEqual([...FIRST_DAY_CONTRACT_IDS].sort());
    /* The pinned arm names the crowd as the measured one and not the day's; the drawn arm, the reverse. */
    expect(FIRST_SESSION_LINE_PINNED).toContain('that crowd, not the day’s');
    expect(FIRST_SESSION_LINE_PINNED).toContain('today’s date chose the tower');
    expect(FIRST_SESSION_LINE).toContain('it is not the crowd that was measured');
    expect(FIRST_SESSION_LINE).not.toContain('today’s date');
  });

  it('keeps the chosen arm’s counts derived and its words the same register as the first', () => {
    expect(FIRST_SESSION_LINE_CHOSEN).toContain(
      `${String(LEGIBILITY_SWEEP.length * LEGIBILITY_SWEEP_N)} days`,
    );
    expect(FIRST_SESSION_LINE_CHOSEN).not.toContain(`${String(ELIGIBLE_FIRST_CONTRACT_IDS.length)} towers`);
    expect(FIRST_SESSION_LINE_CHOSEN).not.toMatch(/\b(you|your|yours)\b/iu);
    expect(FIRST_SESSION_LINE_CHOSEN).not.toContain('same number opens the same tower');
  });
});

describe('the first scored day’s set — legible ∩ admitted, § D1029', () => {
  it('is non-empty, and every member is legible and admitted', () => {
    expect(FIRST_DAY_CONTRACT_IDS.length, 'no tower is both legible and admitted').toBeGreaterThan(0);
    for (const id of FIRST_DAY_CONTRACT_IDS) {
      expect(ELIGIBLE_FIRST_CONTRACT_IDS, id).toContain(id);
      expect(admittedPressDayIds(), id).toContain(id);
    }
  });

  it('is, on this data, the six § D1029 admitted — and each pin is measured on the day the Scenario press plays', () => {
    /*
     * The ghost check: the literal is here so a move is seen and explained on the commit that makes
     * it, not so the set is typed — the case below derives it. And § D1047's guard that every
     * member's pin carries the horizon `scenarioHorizonFor` runs its building on: a pin measured on a
     * slice and dealt on a whole day would be a day nobody measured.
     */
    expect(FIRST_DAY_CONTRACT_IDS).toEqual(['c2', 'c3', 'c6', 'c7', 'c8', 'c10']);
    const resources = contractBuildings();
    for (const id of FIRST_DAY_CONTRACT_IDS) {
      const horizon = scenarioHorizonFor(
        resources.trafficProfiles,
        buildingConfigOf(resources, [], contractById(id)?.buildingId ?? ''),
      );
      expect(horizon, id).toBeDefined();
      expect(pressDayFor(id)?.horizon, id).toBe(horizon);
    }
  });

  it('is exactly the intersection, in contract order — never the legible set as a fallback', () => {
    const admitted = admittedPressDayIds();
    expect(FIRST_DAY_CONTRACT_IDS).toEqual(ELIGIBLE_FIRST_CONTRACT_IDS.filter((id) => admitted.includes(id)));
    /*
     * The fallback the guard exists to refuse: the legible set standing in for the intersection.
     * Some legible tower pins no day, so the two cannot be equal unless something substituted one.
     */
    expect(FIRST_DAY_CONTRACT_IDS).not.toEqual(ELIGIBLE_FIRST_CONTRACT_IDS);
    expect(FIRST_DAY_CONTRACT_IDS.every((id) => admitted.includes(id))).toBe(true);
  });
});

describe('what a fresh device’s address adds to the date — wave AJ, § D1096', () => {
  /*
   * The post-AI panel's seat A, defect 3: `?building=st-jude-hospital&seed=20260925&…` — the
   * address this page writes on a Scenario day — handed a newcomer the date's crowd and no pinned
   * day, where `/` dealt the pin. Asked over a date whose draw deals a real tower, found rather than
   * assumed, so the case holds on any date the suite runs.
   */
  const daySeed = dailySeedFor('2026-09-25');
  const dealt = contractById(firstSessionContractFor(daySeed))?.buildingId ?? '';
  const other = CONTRACTS.find((contract) => contract.buildingId !== dealt)?.buildingId ?? '';

  it('deals the pinned day to an address that only restates the date', () => {
    expect(dealt).not.toBe('');
    expect(firstDayDealOf({ building: null, seed: null }, daySeed)).toEqual({ deal: true, crowdFromAddress: false });
    expect(firstDayDealOf({ building: null, seed: daySeed }, daySeed)).toEqual({ deal: true, crowdFromAddress: false });
    expect(firstDayDealOf({ building: dealt, seed: daySeed }, daySeed)).toEqual({ deal: true, crowdFromAddress: false });
    expect(firstDayDealOf({ building: dealt, seed: null }, daySeed)).toEqual({ deal: true, crowdFromAddress: false });
    /* The address this page writes on the pinned day itself: the pin's crowd on the dealt tower. */
    const pin = firstSessionDayFor(daySeed).seed;
    expect(firstDayDealOf({ building: dealt, seed: pin }, daySeed)).toEqual({ deal: true, crowdFromAddress: false });
  });

  it('keeps the reader’s own crowd and the reader’s own tower as § D1047 ruled', () => {
    /* `?seed=` alone: the draw on the reader's crowd, which is D1047's arm. */
    expect(firstDayDealOf({ building: null, seed: 12345n }, daySeed)).toEqual({ deal: true, crowdFromAddress: true });
    /* A tower the date did not deal is the reader's, and nothing is dealt over it. */
    expect(firstDayDealOf({ building: other, seed: daySeed }, daySeed).deal).toBe(false);
    /* The dealt tower beside a crowd of the reader's own is a run the link describes. */
    expect(firstDayDealOf({ building: dealt, seed: 12345n }, daySeed)).toEqual({ deal: false, crowdFromAddress: true });
  });
});
