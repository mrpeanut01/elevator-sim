/**
 * **What a chime spend reaches, and what it does not** — GitHub issue **#368**,
 * [§ D526](../../../../DECISIONS.md) clause 3, and `CLAUDE.md`'s standing requirement pointed at a
 * currency.
 *
 * > *"Move the control and require the run to change, compared on the legs — or say plainly that no
 * > control exists yet."*
 *
 * This file used to take the first branch, and it was measuring the wrong thing. It widened a
 * shipped fix case by `scenario-budget-step`'s grant and compared the legs, which passed — and the
 * sink it drove **was a second price for an act `data/campaign.json` already authors**. That sink is
 * gone (the review of PR #485, blocking 3; `core/config/chimeLedger.ts#REFUSED_MODIFIER_KINDS`
 * refuses the kind by name), so the subject of that test no longer exists and the file takes the
 * second branch instead. It says plainly, and mechanically, what is true today.
 *
 * ## The three things asserted, and why each is a run rather than a sentence
 *
 * 1. **One authority for a scenario's budget, and it is the scenario.** `data/campaign.json` prices
 *    every rung in chimes and says what it adds in units; `data/chime-ledger.json` prices none.
 *    Both halves are read off disk, so a lane that re-added a budget sink or dropped the ladder's
 *    prices goes red here as well as in `core`.
 * 2. **The legs proof for that ladder already exists and is not duplicated.**
 *    `scenario/budgetReachesTheRun.test.ts` drives `scenario/budget.ts#rungsOf` over the shipped
 *    stages and asserts, on the boarding identities, that a change the base rung cannot pay for is
 *    refused and the *same* change at the bought rung moves the run. Re-proving it here against a
 *    second document would be the authority defect this file exists to record, wearing a test.
 *    What is asserted here is the join: the rungs that test reads are the rungs whose chime prices
 *    are authored beside them.
 * 3. **No shipped chime sink reaches a run at all**, and this is the refusal. The three that
 *    survive grant a career purse (GitHub issue **#371**), a rush purse and a pre-fitted rush
 *    (**#372**); nothing in `packages/viz/src` consumes a sink's modifier, no screen posts
 *    `POST /api/chimes/spend`, and the panel that lists the prices says so on its own face
 *    (`everyday/chimesPanel.ts#ChimesPanelView.spendRefusal`). A price list with a green legs test
 *    beside it and no spend anywhere would be exactly the inert control this repository has shipped
 *    eleven times in code and twice in `data/`.
 *
 * **What would put the first branch back.** A screen that spends, and a seam that applies what it
 * bought — then this file compares the legs across it, on `tiersReachTheRun.test.ts`'s shape and
 * with `legsKey` as its key, the way it did before it was measuring a duplicate.
 */

import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseChimeLedger, type ChimeLedgerTable } from '@elevator-sim/core/browser';

const DATA_DIR = fileURLToPath(new URL('../../../../data', import.meta.url));
const VIZ_SRC = fileURLToPath(new URL('..', import.meta.url));

/**
 * Every `.ts` in this package, with comments stripped — `boundaries.test.ts`'s own shape and its
 * own reason: *a rule is about code rather than about prose*, and half the value of these files is
 * docstrings that name the thing they are avoiding.
 *
 * Walked here rather than imported from `boundaries.test.ts`, which does not export it. Extracting a
 * shared helper would edit that file for a caller outside its subject, and it is a file more than
 * one lane is currently in.
 */
async function vizSourceFiles(): Promise<readonly { id: string; code: string }[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith('.ts')) files.push(path);
    }
  };
  await walk(VIZ_SRC);
  return Promise.all(
    files.sort((a, b) => a.localeCompare(b)).map(async (path) => ({
      id: relative(VIZ_SRC, path).split('\\').join('/'),
      code: (await readFile(path, 'utf8'))
        .replace(/\/\*[\s\S]*?\*\//gu, '')
        .replace(/(^|\s)\/\/.*$/gmu, '$1'),
    })),
  );
}

const dataFile = (name: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as unknown;

const ledger = (): ChimeLedgerTable => parseChimeLedger(dataFile('chime-ledger.json'));

interface AuthoredRung {
  readonly stageId: string;
  readonly stepId: string;
  readonly addsUnits: number;
  readonly chimes: number;
}

/** Every bought-budget rung the shipped campaign authors, read off disk rather than transcribed. */
function authoredRungs(): readonly AuthoredRung[] {
  const campaign = dataFile('campaign.json') as {
    stages: readonly {
      id?: string;
      budget?: { steps?: readonly { id?: string; addsUnits?: number; chimes?: number }[] };
    }[];
  };
  return campaign.stages.flatMap((stage) =>
    (stage.budget?.steps ?? []).map((step) => ({
      stageId: String(stage.id ?? ''),
      stepId: String(step.id ?? ''),
      addsUnits: Number(step.addsUnits),
      chimes: Number(step.chimes),
    })),
  );
}

describe('a scenario budget has one price, and it is the scenario that names it — issue #368', () => {
  it('authors a chime price and a unit grant on every rung, in data/campaign.json', () => {
    const rungs = authoredRungs();
    expect(rungs.length, 'the shipped campaign authors no bought-budget rung at all').toBeGreaterThan(1);
    for (const rung of rungs) {
      const where = `${rung.stageId}/${rung.stepId}`;
      expect(Number.isInteger(rung.addsUnits) && rung.addsUnits > 0, where).toBe(true);
      expect(Number.isInteger(rung.chimes) && rung.chimes > 0, where).toBe(true);
    }
  });

  it('prices no budget in the chime ledger, so the two documents cannot disagree', () => {
    /*
     * The defect, asserted from the play side as well as from `core`. The shipped table sold a
     * budget step at 12 chimes for 8 units — 1.5 a unit — against a ladder authored at one chime a
     * unit, and `data/scenario-survivors.json` pre-simulates against the ladder. Two prices for one
     * act is not a display defect across a network boundary; it is an authority defect.
     */
    expect(ledger().sinks.map((sink) => sink.modifier.kind)).not.toContain('budget-units');
  });

  it('positive control: the ledger would refuse a budget sink rather than quietly holding two prices', () => {
    const document = dataFile('chime-ledger.json') as { sinks: Record<string, unknown>[] };
    const withBudget = {
      ...document,
      sinks: document.sinks.map((sink, index) =>
        index === 0 ? { ...sink, modifier: { kind: 'budget-units', grantUnits: 8 } } : sink,
      ),
    };
    expect(() => parseChimeLedger(withBudget)).toThrow(/data\/campaign\.json/u);
  });
});

describe('§ D219 on the spend verb — no control exists yet, said rather than implied', () => {
  it('sells only sinks whose seam is unbuilt, and names the issue each is waiting on', () => {
    /*
     * Named rather than counted, so that a sink acquiring a seam has to come here and say so. A
     * kind that appears without an owner is a sink somebody added without deciding what applies it.
     */
    const owners: Readonly<Record<string, string>> = {
      'career-purse-top-up': '#371',
      'rush-purse-top-up': '#372',
      'rush-prefit': '#372',
    };
    expect(Object.keys(owners).sort()).toEqual(ledger().sinks.map((sink) => sink.id).sort());
  });

  it('has no module in the viewer that applies a bought modifier to a run', async () => {
    /*
     * The refusal, as a grep rather than as a sentence — `boundaries.test.ts`'s own instrument, for
     * the reason that file gives: *agents have reported green suites that were red*. `grantUnits`
     * is what a spend would have to reach to change a configuration, and `chimeSpendPrice` is what
     * a screen would have to call to charge for one.
     */
    const applying = /grantUnits|chimeSpendPrice|chimeGrantUnits|chimes\/spend/u;
    const offenders = (await vizSourceFiles())
      .filter((file) => !file.id.includes('.test.') && !file.id.includes('test-helper'))
      .filter((file) => applying.test(file.code))
      .map((file) => file.id)
      .sort((a, b) => a.localeCompare(b));
    expect(
      offenders,
      'a module in the viewer applies or charges for a chime modifier. That is good news and this ' +
        'test is now wrong: § D219 asks for the legs, so replace this refusal with the comparison ' +
        'this file used to hold — `tiersReachTheRun.test.ts`’s shape, keyed on boarding identities.',
    ).toEqual([]);
  });

  it('positive control: that grep really would catch a consumer', async () => {
    const applying = /grantUnits|chimeSpendPrice|chimeGrantUnits|chimes\/spend/u;
    /* Assembled, so this file is not the first offender if the filter above is ever widened. */
    expect(applying.test(`const units = ${['chime', 'GrantUnits'].join('')}(sink, 2);`)).toBe(true);
    expect(applying.test('const rows = table.sinks.map(price);')).toBe(false);
    /* And the corpus it runs over is real, rather than an empty list agreeing with everything. */
    expect((await vizSourceFiles()).length).toBeGreaterThan(100);
  });

  it('says it on the screen that lists the prices, which is where a player meets the claim', async () => {
    /*
     * The other half of the same refusal, and the half § D227 says binds hardest: *a control that
     * writes nothing must say so.* A register entry nobody opens would not have done — the sentence
     * has to be beside the ladder it is about.
     */
    const { CHIMES_PANEL_COPY } = await import('../everyday/chimesPanel.js');
    expect(CHIMES_PANEL_COPY.spendRefusal).toMatch(/can be bought yet/u);
    expect(CHIMES_PANEL_COPY.spendRefusal).toMatch(/no screen that|has no screen/u);
  });
});
