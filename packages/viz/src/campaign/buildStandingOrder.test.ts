/**
 * **The build select changes no run, pinned by a run** — GitHub issue #313, § D227.
 *
 * § 8.1 draws the standing order as two inline selects, dispatcher and build. One of them reaches
 * the day and the other does not, and until this file said so with a measurement the screen offered
 * them as though they were the same kind of control — CLAUDE.md's standing requirement wearing a
 * `<select>`, which this repository has shipped twelve times.
 *
 * ## Why the refusal rather than a mechanism
 *
 * `campaign/career.ts#CampaignTower.buildId` holds that argument in full. In short: the design file
 * authors `build` as a descriptive line per building and its own prototype stores the select in
 * `st.builds[t.id]` and reads it back only to mark an option selected; `ENGINE_CONTRACT.md` § 8
 * gives it no expression; and what changes a building's fabric there is § 8.2's shop, which is
 * bought and which does reach the run ([§ D427](../../../../DECISIONS.md)). Wiring this select to
 * the group levers would hand a player for free what the `control` tier charges six units and a
 * night for.
 *
 * ## The shape of the proof, which is the part that matters
 *
 * *A refusal is pinned by a run, never by another sentence.* So this is § D177's own comparison run
 * in the **refusing** direction: same seed, same building, same cell, the control moved against not
 * moved, compared on `legsOf`. Two things make it evidence rather than a tautology.
 *
 * **It goes through the shipped press.** `everyday/host.ts#runCampaignDay` is what turns a tower into
 * a day, and it is what is driven here — not a hand-rolled patch that reproduces what it currently
 * writes. So the day somebody wires `buildId` into that function, this file reddens and the sentence
 * on the select has to be rewritten rather than quietly becoming false.
 *
 * **The cell is proved able to show a change.** `fitOut.test.ts`'s own finding is that three of
 * sixteen shop tiers move nothing at this cell for physical reasons, so a leg comparison that came
 * back identical could mean the control is inert *or* that the cell is empty. The positive control
 * is the other select in the same group: `set-dispatcher` moves the legs here, through the same
 * press, on the same seed. An identical pair from the build select is therefore a fact about the
 * control.
 *
 * ## The cell
 *
 * `garden-apartments` at the length `shift/contracts.ts` declares for `c1` — the campaign's own cell,
 * for `fitOut.test.ts`'s reason: `openingCareer` holds `c1` and nothing else, and `runCampaignDay`
 * writes that contract's length itself, so a proof taken anywhere else is a proof about a day the
 * campaign never runs.
 *
 * ## One mutation this file does **not** catch, recorded so it is not mistaken for a hole
 *
 * Wiring `buildId` into `shiftLengthS` — `+ 60` on any build but `as-built` — leaves every case here
 * green, and that is a fact about the cell rather than about the assertions. Measured directly:
 * `legsOf` at 3 600 s and at 3 660 s on this building returns the **same string**, so an extra minute
 * of shift adds no leg. The demand this building declares is spent well before the hour is, and the
 * tail is drain.
 *
 * It is the trap § D427's own lane recorded one level up — a leg comparison at a cell where the
 * effect cannot bite reports nothing — arriving here as a *mutation* that cannot bite. The mutation
 * that does is `dispatcherId`, which the positive control below independently proves reaches the run
 * at this cell; a future reader checking this file's teeth should use that one.
 */

import { describe, expect, it } from 'vitest';

import {
  createEverydayHost,
  type EverydayHostBindings,
  type EverydayHost,
} from '../everyday/host.js';
import { RESOURCES, baseState, legsOf } from '../scope/probes.test-helper.js';
import { shiftLengthForContract, type ViewerState } from '../dev/state.js';

import { BUILD_IDS, towerById, type BuildId } from './career.js';

/**
 * A host over a captured state, whose `applyPatch` **merges** — `host.test.ts`'s own harness shape,
 * and the merge is what makes `runCampaignDay`'s patch land so the state read back afterwards is the
 * state the press wrote.
 *
 * Everything else is a stub because nothing else is exercised: `startRun` is where the real shell
 * hands the state to the transport, and what this file wants is the state it would have handed over.
 */
function harness(): { readonly host: EverydayHost; state: () => ViewerState } {
  let state: ViewerState = { ...baseState(), buildingId: 'garden-apartments' };
  const bindings: EverydayHostBindings = {
    resources: RESOURCES,
    state: () => state,
    playheadS: () => 0,
    dayClosed: () => false,
    runIsOwn: () => true,
    playerHasChosen: () => true,
    dayStartS: () => undefined,
    startRun: () => {},
    intervene: () => {},
    closeDay: () => {},
    openRunTab: () => {},
    applyPatch: (patch) => {
      state = { ...state, ...patch };
    },
      /*
       * The six spectator bindings, which wave J's lane C added to this type after this fixture was
       * written. Neither of these cases drives watching, so five of them **throw**: a silent stub
       * answering `enterWatch` or `simulateRecord` would let a future change reach the spectator
       * state through a campaign test and still pass, which is the shape of defect this repository
       * keeps finding. `watching()` is the exception and returns `undefined` because that is simply
       * true here — nothing is being watched — rather than a stand-in for an answer.
       */
      loadReferenceRuns: () => {
        throw new Error('this fixture does not drive watching');
      },
      simulateRecord: () => {
        throw new Error('this fixture does not drive watching');
      },
      enterWatch: () => {
        throw new Error('this fixture does not drive watching');
      },
      stopWatching: () => {
        throw new Error('this fixture does not drive watching');
      },
      playThisCrowd: () => {
        throw new Error('this fixture does not drive watching');
      },
      watching: () => undefined,
    /* No page, so no API origin, so nothing to ask — the honest no-server arm. */
    dailyBoard: undefined,
    signIn: undefined,
    onChange: () => () => {},
  };
  return { host: createEverydayHost(bindings), state: () => state };
}

/** The legs of the day `Lock it in and run day N` would start, with this build picked. */
function legsForBuild(buildId: BuildId): string {
  const h = harness();
  h.host.campaignAct({ kind: 'set-build', towerId: 'c1', buildId });
  h.host.runCampaignDay('c1');
  return legsOf(h.state());
}

describe('§ 8.1’s build select', () => {
  it('writes the record, so the run being indifferent is the control’s fault and not the action’s', () => {
    /*
     * The distinction § D219 is about: an action the reducer **refused** and an action that landed
     * on a field nothing reads are two different defects with the same symptom. This is the second,
     * and the assertion below is what says so.
     */
    const h = harness();
    expect(towerById(h.host.campaign(), 'c1')?.buildId).toBe('as-built');
    h.host.campaignAct({ kind: 'set-build', towerId: 'c1', buildId: 'big-cars' });
    expect(towerById(h.host.campaign(), 'c1')?.buildId).toBe('big-cars');
  });

  it('runs the day at the campaign’s own cell, which is what the comparison below is taken at', () => {
    const h = harness();
    h.host.runCampaignDay('c1');
    expect(h.state().buildingId).toBe('garden-apartments');
    expect(h.state().shiftLengthS).toBe(shiftLengthForContract('c1'));
  });

  it('moves no leg at that cell, whichever of the five shapes is picked', () => {
    const asBuilt = legsForBuild('as-built');
    // Non-vacuity: a comparison string that came back empty would make every case below pass.
    expect(asBuilt.length).toBeGreaterThan(100);
    for (const buildId of BUILD_IDS) {
      expect(legsForBuild(buildId), `${buildId} moved the legs`).toBe(asBuilt);
    }
    // And all five are actually offered, so the loop is over the select's own options.
    expect(BUILD_IDS).toHaveLength(5);
  });

  it('and the other select in the same group does move them, so the cell is not the empty one', () => {
    /*
     * The positive control, at the same cell, through the same press, on the same seed —
     * `fitOut.test.ts`'s rule that an empty cell must be diagnosed rather than reported as a dead
     * control. `runCampaignDay` writes `dispatcherId` from the tower, so this is the standing
     * order's *other* half reaching the day the build's half does not.
     */
    const h = harness();
    h.host.campaignAct({ kind: 'set-dispatcher', towerId: 'c1', dispatcherId: 'nearest-car' });
    h.host.runCampaignDay('c1');
    const moved = legsOf(h.state());
    expect(moved).not.toBe(legsForBuild('as-built'));
  });
});
