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
 * 3. **Exactly one shipped chime sink reaches a run, and the other two say on the screen why they
 *    do not.** This clause read *"no shipped chime sink reaches a run at all"* and ended *"what
 *    would put the first branch back [is] a screen that spends, and a seam that applies what it
 *    bought"*. [§ D672](../../../../DECISIONS.md) is that screen and that seam, for `rush-prefit`
 *    alone: `everyday/rush.ts#rushPatchOf` fits the building for a claimed one and the server's
 *    replay fits it with the same three effects. `career-purse-top-up` and `rush-purse-top-up` are
 *    **not** sold — `campaign/economy.ts#purseOf` is `carriedIn + earnedSoFar − committedUnits`
 *    with no term a grant could enter, and no between-round rebuild travels for the rush
 *    ([§ D606](../../../../DECISIONS.md) § 2) — and `everyday/chimesPanel.ts#SPEND_ABSENCES` says
 *    which and why on the screen that lists the prices.
 *
 * **Where the legs proof for the one sold sink lives, and why it is not here.** Point 2's rule,
 * applied to itself: `packages/server/src/leaderboard/rushHoldAgreement.test.ts` pairs every
 * pre-fit cell with the same cell unfitted and requires the two to differ, in `CLAUDE.md`'s own
 * words. Re-proving that here against a second table would be the authority defect this file
 * exists to record, wearing a test. What this file asserts is the **join**: that the sinks the
 * panel offers are the sinks something applies, and that the ones it does not offer say why.
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

describe('§ D219 on the spend verb — one sink is sold, and the rest say why not', () => {
  it('names the issue each sink’s seam belongs to, built or not', () => {
    /*
     * Named rather than counted, so that a sink acquiring a seam has to come here and say so. A
     * kind that appears without an owner is a sink somebody added without deciding what applies it.
     *
     * **Two of the three seams are built now.** `rush-prefit` is § D672's, and `career-purse-top-up`
     * is GitHub issue **#557**'s — the owner moved from #371 because the purse seam it was waiting
     * on was built by the issue that found it dead: `campaign/economy.ts#purseOf` gained a fourth
     * derived term, and `campaign/purseTopUpReachesTheRun.test.ts` is the legs comparison that
     * earns it. `rush-purse-top-up` is the one still waiting, for its own cause (§ D606 § 2).
     */
    const owners: Readonly<Record<string, string>> = {
      'career-purse-top-up': '#557',
      'rush-purse-top-up': '#372',
      'rush-prefit': '#372',
    };
    expect(Object.keys(owners).sort()).toEqual(ledger().sinks.map((sink) => sink.id).sort());
  });

  it('lets exactly one module name the spend route, and no second one', async () => {
    /*
     * **The sharp half of what the case below used to assert, kept sharp.** *Is there a second
     * spend surface?* is a question about the **route**: a module that names `POST /api/chimes/spend`
     * is a module that can take a player's chimes. There is one, and a second would be a second
     * answer to *what does a spend cost* — the whole subject of this file.
     */
    const route = /chimes\/spend/u;
    const reaching = (await vizSourceFiles())
      .filter((file) => !file.id.includes('.test.') && !file.id.includes('test-helper'))
      .filter((file) => route.test(file.code))
      .map((file) => file.id);
    expect(reaching, 'a second module can take a chime').toEqual(['menu/client.ts']);
  });

  it('accounts for every module that touches a granted unit, with a role each', async () => {
    /*
     * **This assertion was inverted rather than deleted, and then it grew by two.** It read *"has
     * no module in the viewer that applies a bought modifier to a run"* and expected `[]`, under a
     * docstring saying that a spend surface is what would put the other branch back.
     * [§ D672](../../../../DECISIONS.md) put it back at three; GitHub issue **#557** and
     * [§ D738](../../../../DECISIONS.md) take it to five, and the list is *named with a role each*
     * because the grep cannot tell charging from recording from drawing:
     *
     * - `menu/client.ts` — the only module that names the route (the case above).
     * - `dev/main.ts` — the only binding that holds a token, handing the server's answer back.
     * - `everyday/host.ts` — the one verb between them, and the only module that posts the grant.
     * - `campaign/career.ts` — the **apply**, and the reason this list could grow honestly: the
     *   reducer that records a granted unit into a tower's purse, which is the `purse-units`
     *   counterpart of `rush.ts`'s pre-fit claim below. It charges nothing; it is what a charge
     *   reaches.
     * - `everyday/chimesPanel.ts` — draws `6 units into the purse of…` from the sink's own
     *   authored figure. It charges nothing and grants nothing, and it reads the field rather than
     *   `core`'s `chimeGrantUnits` precisely so that the charging side's arithmetic stays where the
     *   case above keeps it.
     *
     * A sixth arrival has to come here and say which of those it is.
     */
    const applying = /grantUnits|chimeSpendPrice|chimeGrantUnits|chimes\/spend/u;
    const reaching = (await vizSourceFiles())
      .filter((file) => !file.id.includes('.test.') && !file.id.includes('test-helper'))
      .filter((file) => applying.test(file.code))
      .map((file) => file.id)
      .sort((a, b) => a.localeCompare(b));
    expect(
      reaching,
      'a module touches a granted unit and is not one of the five this seam runs through. Either ' +
        'it is a second spend surface, or this list is stale — say which.',
    ).toEqual([
      'campaign/career.ts',
      'dev/main.ts',
      'everyday/chimesPanel.ts',
      'everyday/host.ts',
      'menu/client.ts',
    ]);
  });

  it('applies the rush’s bought modifier in exactly one module, which is none of those five', async () => {
    /*
     * **Charging and applying are different greps and the separation is the point.** A screen that
     * took a chime and a module that changed a run are the two halves this repository has shipped
     * apart eleven times — the standing requirement's whole subject. `claimsRushPrefit` is the
     * apply: `everyday/rush.ts#rushPatchOf` writes `campaignFitOut` for a claimed `rush-prefit`,
     * and the server's replay fits the same three effects.
     *
     * One module, and none of the three above, which is what says the seam is joined at the host
     * rather than duplicated: the charge comes back through `spendChime` and the claim goes out
     * through `startRush`, and neither file knows the other exists.
     */
    const claiming = /claimsRushPrefit/u;
    const reaching = (await vizSourceFiles())
      .filter((file) => !file.id.includes('.test.') && !file.id.includes('test-helper'))
      .filter((file) => claiming.test(file.code))
      .map((file) => file.id)
      .sort((a, b) => a.localeCompare(b));
    expect(reaching).toEqual(['everyday/rush.ts']);
  });

  it('positive control: that grep really would catch a consumer', async () => {
    const applying = /grantUnits|chimeSpendPrice|chimeGrantUnits|chimes\/spend/u;
    /* Assembled, so this file is not the first offender if the filter above is ever widened. */
    expect(applying.test(`const units = ${['chime', 'GrantUnits'].join('')}(sink, 2);`)).toBe(true);
    expect(applying.test('const rows = table.sinks.map(price);')).toBe(false);
    /* And the corpus it runs over is real, rather than an empty list agreeing with everything. */
    expect((await vizSourceFiles()).length).toBeGreaterThan(100);
  });

  it('says on the screen that lists the prices which of them can be bought and which cannot', async () => {
    /*
     * **The half § D227 says binds hardest, in both polarities now.** This asserted a single
     * sentence — *"None of these can be bought yet"* — and that sentence is **deleted** on the
     * commit that made it false rather than reworded. What replaced it is a reason per row, which
     * is a stronger claim and a harder one to let go stale: every sink the shipped table holds is
     * either offered or carries its own refusal, and none is both.
     *
     * Where the legs proof lives, named rather than duplicated — point 2 of this file's own
     * docstring: `packages/server/src/leaderboard/rushHoldAgreement.test.ts` pairs every pre-fit
     * cell with the same cell unfitted and requires the two to differ, which is `CLAUDE.md`'s
     * *move the control and require the run to change* on the one sink that is sold.
     */
    const { CHIMES_PANEL_COPY, SPEND_ABSENCES, chimesPanelViewOf } = await import(
      '../everyday/chimesPanel.js'
    );
    expect(Object.hasOwn(CHIMES_PANEL_COPY, 'spendRefusal')).toBe(false);
    /*
     * Driven through the view a player reads rather than through a helper — there is no exported
     * *which sinks are offered*, deliberately, because nothing outside a test would have called one.
     */
    const rows = chimesPanelViewOf({
      balanceChimes: 999,
      home: 'account',
      spendable: true,
      owns: [],
    }).rows;
    expect(rows.map((row) => row.id).sort()).toEqual(ledger().sinks.map((sink) => sink.id).sort());
    for (const row of rows) {
      const refused = SPEND_ABSENCES[row.id] !== undefined;
      expect(
        (row.offer === 'not-offered') === refused,
        `${row.id} is both offered and refused, or neither`,
      ).toBe(true);
    }
    /*
     * And the one remaining refusal really says why, rather than saying *not yet* about nothing in
     * particular. **`career-purse-top-up`'s entry is gone rather than reworded** — GitHub issue
     * #557, § D738, § D227 in the direction it says bites hardest: the sentence said a tower's
     * purse has no term anything outside the contract can enter, which stopped being true on the
     * commit that gave it one. Asserted absent, so a reworded version of it cannot creep back.
     */
    expect(SPEND_ABSENCES['career-purse-top-up']).toBeUndefined();
    expect(SPEND_ABSENCES['rush-purse-top-up']).toMatch(/between rounds/u);
  });
});
