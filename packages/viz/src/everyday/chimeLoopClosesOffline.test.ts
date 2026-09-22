/**
 * **Earn and spend, with no `apiOrigin`, no account and no network** — GitHub issue **#579**,
 * [§ D911](../../../../DECISIONS.md).
 *
 * ## Why this file exists rather than an assertion inside each module's own suite
 *
 * `deviceChimes.test.ts` drives the ledger, `fixit/budgetRungReachesTheRun.test.ts` drives the
 * legs, `chimesPanel.test.ts` drives the words. Each is true of its own module and **none of them
 * is the claim**, which is that a player who never signs in and never reaches a server can finish
 * something, be paid for it, spend what they were paid, and have the run come out different. That
 * is a chain, and a chain is exactly the thing this repository keeps shipping in pieces —
 * `CLAUDE.md`'s eleven dead seams in code and two in `data/`, every one of them a part that worked.
 *
 * It is also the claim that has been **made and withdrawn** here before: wave AC-2's roadmap row
 * said the chimes loop *"closes at both ends"* while two of the three sinks were non-functional and
 * the third was account- and server-gated. So this file asserts the chain rather than the parts,
 * and asserts it under the conditions the deployed bundle actually has.
 *
 * ## What *no server* means here, exactly
 *
 * `dev/main.ts` builds no leaderboard client without an `apiOrigin` (`<meta>` tag absent), **and
 * the deployed bundle is built that way**. Nothing in this file constructs a client, a token or a
 * fetch, and the two halves of the chain are driven through the shipped modules:
 *
 * - the **store** is `everyday/chimeStore.ts` over a fake backing, which is what a browser with
 *   `localStorage` and no network has;
 * - the **binding** that calls it on a clear is `dev/main.ts#bankCompletion`, which is not
 *   importable under Node (it is the boot closure), so it is checked **structurally** — that it is
 *   defined unconditionally and reaches the store — and the check is named as the weaker half
 *   rather than dressed up as the run.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { caseAtRung, nextBudgetStepOf } from '../fixit/budgetRungs.js';
import { emptyFixitState, toggleRepair } from '../fixit/engine.js';
import { fixitResourcesFromDisk, shippedFixitCases } from '../fixit/resources.test-helper.js';
import { FIXIT_RUN_SWITCHES, fixitRunPlanOf } from '../fixit/run.js';
import { recordRun } from '../record/recordRun.js';
import { createDeviceChimeStore } from './chimeStore.js';
import { chimesPanelViewOf } from './chimesPanel.js';
import { boughtStepIdOf } from './deviceChimes.js';
import { fixitBudgetRungRow } from './fixitScreenModel.js';
import type { SessionStore } from '../persist/types.js';
import type { FixitCase, FixitState } from '../fixit/types.js';

const VIZ_SRC = fileURLToPath(new URL('..', import.meta.url));

const resources = await fixitResourcesFromDisk();
const loaded = await shippedFixitCases(resources);
const schedule = loaded.schedule;
const steps = loaded.budgetSteps;

/** A browser that keeps things and reaches nothing. No token anywhere in this file. */
function deviceOnly(): SessionStore {
  const slots = new Map<string, string>();
  return {
    read: (key) => slots.get(key) ?? null,
    write: (key, value) => {
      slots.set(key, value);
    },
    remove: (key) => {
      slots.delete(key);
    },
  };
}

function selecting(entry: FixitCase, ids: readonly string[]): FixitState {
  let state = emptyFixitState();
  for (const id of ids) state = toggleRepair(entry, state, id, schedule);
  return state;
}

function legsOf(entry: FixitCase, state: FixitState): string {
  return JSON.stringify(
    recordRun(fixitRunPlanOf(entry, state, resources).asRepaired, FIXIT_RUN_SWITCHES).recording.legs.map(
      (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1],
    ),
  );
}

describe('the loop closes for one sink in one mode, off an account and off a server — #579', () => {
  it('pays a cleared scenario, and the balance a player reads afterwards is the one the clear produced', () => {
    const store = createDeviceChimeStore(deviceOnly());
    expect(store.balance(), 'a device that has played nothing owes nothing').toBe(0);
    const after = store.bank({ completion: 'scenario-cleared', scenarioId: loaded.cases[0]?.id ?? '' });
    expect(after).toBeGreaterThan(0);
    expect(store.balance(), 'the panel and the rail would read two different numbers').toBe(after);
    /*
     * And the Settings panel draws **that** number, on the arm a signed-out player is on. Driven
     * through the view rather than asserted about it, because the chooser
     * (`settingsView.ts#settingsScreenViewOf`) is what decides which tally is this player's.
     */
    const panel = chimesPanelViewOf({ balanceChimes: store.balance(), home: 'device' });
    expect(panel.balanceLine).toContain(String(after));
    expect(panel.homeNote).toMatch(/kept on this device/u);
  });

  it('earns enough from two clears to buy a rung, spends it, and keeps the purchase', () => {
    const store = createDeviceChimeStore(deviceOnly());
    const step = steps[0];
    expect(step, 'the shipped fix cases author no rung to buy').toBeDefined();
    if (step === undefined) return;
    const target = loaded.cases[1];
    expect(target).toBeDefined();
    if (target === undefined) return;

    /* Short before anything is finished, and the refusal says by how much rather than being silent. */
    expect(store.spend({ scenarioId: target.id, stepId: step.id, chimes: step.chimes })).toEqual({
      kind: 'refused',
      refusal: { kind: 'short', shortBy: step.chimes },
    });

    let banked = 0;
    let cleared = 0;
    for (const entry of loaded.cases) {
      if (banked >= step.chimes) break;
      banked = store.bank({ completion: 'scenario-cleared', scenarioId: entry.id });
      cleared += 1;
    }
    expect(banked, 'no number of clears on the shipped file reaches one rung').toBeGreaterThanOrEqual(
      step.chimes,
    );
    /*
     * The figure worth stating: how many turns one rung costs. It is **read off the shipped files**
     * rather than written down, so a rebalance of either moves it rather than turning this red.
     */
    expect(cleared).toBeGreaterThan(0);

    const bought = store.spend({ scenarioId: target.id, stepId: step.id, chimes: step.chimes });
    expect(bought.kind).toBe('bought');
    expect(store.balance()).toBe(banked - step.chimes);
    expect(boughtStepIdOf(store.record(), target.id)).toBe(step.id);
    /* And a second press on the same rung buys nothing rather than charging for nothing. */
    expect(store.spend({ scenarioId: target.id, stepId: step.id, chimes: step.chimes }).kind).toBe(
      'refused',
    );
  });

  it('survives the tab: a second store over the same slot reads the same tally and the same purchase', () => {
    const backing = deviceOnly();
    const step = steps[0];
    const target = loaded.cases[1];
    if (step === undefined || target === undefined) return;
    const first = createDeviceChimeStore(backing);
    for (const entry of loaded.cases) {
      if (first.balance() >= step.chimes) break;
      first.bank({ completion: 'scenario-cleared', scenarioId: entry.id });
    }
    first.spend({ scenarioId: target.id, stepId: step.id, chimes: step.chimes });
    const reopened = createDeviceChimeStore(backing);
    expect(reopened.balance()).toBe(first.balance());
    expect(boughtStepIdOf(reopened.record(), target.id)).toBe(step.id);
  });

  it('the rung a device bought changes the run, compared on the legs', () => {
    /*
     * The narrow legs proof lives in `fixit/budgetRungReachesTheRun.test.ts`, which searches the
     * shipped file for a case whose base budget splits a repair pair. What is proved **here** is
     * that the case the *device ledger* says was bought is the case the screen then runs — the
     * join, rather than the effect.
     */
    const step = steps[0];
    if (step === undefined) return;
    const store = createDeviceChimeStore(deviceOnly());
    const subject = loaded.cases.find((entry) => {
      const diagnosed = entry.repairs.find((repair) => repair.role === 'diagnosed');
      if (diagnosed === undefined) return false;
      const widened = caseAtRung(entry, steps, step.id);
      return entry.repairs.some((extra) => {
        if (extra.id === diagnosed.id) return false;
        const pair = [diagnosed.id, extra.id];
        return (
          selecting(entry, pair).selectedRepairIds.length === 1 &&
          selecting(widened, pair).selectedRepairIds.length === 2
        );
      });
    });
    expect(subject, 'no shipped case has a pair the base splits and the rung admits').toBeDefined();
    if (subject === undefined) return;

    for (const entry of loaded.cases) {
      if (store.balance() >= step.chimes) break;
      store.bank({ completion: 'scenario-cleared', scenarioId: entry.id });
    }
    expect(store.spend({ scenarioId: subject.id, stepId: step.id, chimes: step.chimes }).kind).toBe(
      'bought',
    );

    /* What `fixitScreen.ts#currentEntry` does, in one line, out of what the store says. */
    const asPlayed = caseAtRung(subject, steps, boughtStepIdOf(store.record(), subject.id));
    expect(asPlayed.budgetUnits).toBe(subject.budgetUnits + step.addsUnits);

    const diagnosed = subject.repairs.find((repair) => repair.role === 'diagnosed');
    const extra = subject.repairs.find(
      (candidate) =>
        candidate.id !== diagnosed?.id &&
        selecting(subject, [diagnosed?.id ?? '', candidate.id]).selectedRepairIds.length === 1 &&
        selecting(caseAtRung(subject, steps, step.id), [diagnosed?.id ?? '', candidate.id])
          .selectedRepairIds.length === 2,
    );
    if (diagnosed === undefined || extra === undefined) return;
    const pair = [diagnosed.id, extra.id];
    expect(legsOf(asPlayed, selecting(asPlayed, pair))).not.toBe(
      legsOf(subject, selecting(subject, pair)),
    );
  });

  it('offers the press on the screen only once the tally covers it', () => {
    const step = steps[0];
    if (step === undefined) return;
    const target = loaded.cases[1];
    if (target === undefined) return;
    const rowAt = (balanceChimes: number) =>
      fixitBudgetRungRow({
        unitsNow: target.budgetUnits,
        nextChimes: nextBudgetStepOf(steps, undefined)?.chimes,
        balanceChimes,
        laddered: steps.length > 0,
        currency: { one: 'chime', many: 'chimes' },
      });
    expect(rowAt(0)?.offer).toBe('none');
    expect(rowAt(step.chimes - 1)?.offer).toBe('short');
    expect(rowAt(step.chimes)?.offer).toBe('buy');
    expect(rowAt(step.chimes)?.readout).toBe(`${String(target.budgetUnits)} u`);
  });
});

describe('the binding that pays a clear is not gated on a server — the weaker half, named as one', () => {
  /*
   * `dev/main.ts` is the boot closure and cannot be imported under Node, so this is a **structural**
   * check rather than a run, and saying which it is matters: it establishes that the wiring was not
   * written behind `client === undefined`, and it does not establish that a browser reaches it. The
   * browser tier is where that would be established, and it is the integrator's to run.
   */
  it('defines bankCompletion unconditionally and reaches the device store from it', async () => {
    const source = await readFile(`${VIZ_SRC}dev/main.ts`, 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|\s)\/\/.*$/gmu, '$1');
    expect(code, 'bankCompletion went back behind a client check').not.toMatch(
      /bankCompletion:\s*\n?\s*client === undefined/u,
    );
    expect(code).toMatch(/bankCompletion: async \(turn\) => \{/u);
    expect(code).toMatch(/everydayDeviceChimeStore\(\)\.bank\(turn\)/u);
  });

  it('keeps the account read gated, because a read with no server is a different answer', async () => {
    /*
     * The half that must **not** change: `chimeBalance` is the **account's** balance and stays
     * absent without an origin, so `everyday/host.ts#EverydayChimeBalance`'s `no-server` arm goes
     * on meaning what it says. The device tally is read by `settingsScreen.ts` off the store
     * directly, which is why the two do not have to be one call.
     */
    const source = await readFile(`${VIZ_SRC}dev/main.ts`, 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|\s)\/\/.*$/gmu, '$1');
    expect(code).toMatch(/chimeBalance:\s*\n?\s*client === undefined/u);
    expect(code).toMatch(/spendChime:\s*\n?\s*client === undefined/u);
  });
});
