/**
 * **The instrument behind the press ladder** — every contract's day, as built and under each of the
 * two parking presses, plus the dispatcher census that says which standing orders make it moot.
 *
 * ## Why it exists
 *
 * [§ D871](../../../../DECISIONS.md) authored **one** day whose verdict turns on a press, and an
 * assessor then found the two things that stopped it counting: the day was unreachable on purpose,
 * and its tension was conditional on leaving the standing order alone — 8 of 13 shipped dispatchers
 * cleared the same day with no press at all. Both findings are measurements, so the answer to both
 * is a measurement, and `CLAUDE.md`'s oldest lesson about published figures says where it lives: an
 * instrument that can be re-run, not a table somebody typed once.
 *
 * ## What it measures, and on which path
 *
 * Per contract, over `n` seeds of `docs/33` § 4.6's own sequence, on **day 1** under the standing
 * order:
 *
 * - **as built** — the day with no press;
 * - **spread the cars** — one `spread-cars` intervention at {@link PRESS_FRACTION} of the shift;
 * - **park the cars in the lobby** — one `park-cars-lobby` at the same instant.
 *
 * A day is **missed** when any `goalsForDay` reading is anything but `met` —
 * `shift/week.ts#outcomeOf`'s own rule, *unjudged is not passed*, which is the same predicate
 * `contractCurve.sweep.test.ts` counts with. The **verdict line** a player reads is quoted off
 * `dayReportOf` in `pressLadder.test.ts` rather than here: a sweep needs a predicate and a pin needs
 * the sheet's own words, and the two agreeing is asserted there on the pinned seeds.
 *
 * Everything is built through `dev/state.ts#shiftRunConfigOf` with the shipped
 * `data/contract-ladder.json`, so what is measured is the day a player is handed —
 * `docs/05-roadmap.md`'s standing requirement, and the reason `plan.outOfServiceCarIds` is carried
 * to `recordRun` beside the config rather than dropped.
 *
 * ## The census mode
 *
 * `PRESS_LADDER_CENSUS=1` runs each contract's **pinned** seed as built under every shipped
 * dispatcher profile and writes which of them clear it. That is the assessor's own sweep, kept as
 * an instrument, and its output is what `shift/pressLadder.ts#MOOT_UNDER` carries as data and what
 * the stage tells the player before the day starts.
 *
 * ## Why it writes a file rather than printing
 *
 * `CLAUDE.md` records the trap: vitest 4 intercepts `console.log`, so a sweep whose deliverable is a
 * table cannot hand it back on stdout. `PRESS_LADDER_OUT` names the path and an absent one is a
 * failure rather than a silent no-op.
 *
 * ## What it is not
 *
 * It compares no two dispatchers and calls neither better; every cell is a verdict on one day, with
 * its seed printed beside it, and no interval is offered because none is claimed.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseBuilding, resolveBuilding, type RunInterventionConfig } from '@elevator-sim/core';

import { buildingConfigOf, shiftLengthForContract, shiftRunConfigOf } from '../dev/state.js';
import type { BrowserResources } from '../dev/data.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { observationsAt } from '../live/observations.js';
import { recordRun } from '../record/recordRun.js';
import { RESOURCES, baseState } from '../scope/probes.test-helper.js';

import { contractDayState } from './contractDay.test-helper.js';
import { CONTRACT_LADDER, pressDayFor } from './ladder.js';
import { pressDayArmOf, windowTries } from './pressDay.test-helper.js';
import type { RunHorizon } from './types.js';
import { CONTRACTS, contractById } from './contracts.js';
import { runHorizonOf, wholeDayFor, wholeDayRun } from './dayLength.js';
import { goalsForDay, readGoals } from './goals.js';
import { SHIFT_EVENTS } from './events.js';
import { shiftObservationsOf } from './observations.js';
import { dayReportOf } from './report.js';
import { openWeek } from './week.js';

const SEEDS = Number(process.env['PRESS_LADDER_SEEDS'] ?? '20');
const FROM_N = Number(process.env['PRESS_LADDER_FROM'] ?? '0');

/** Where the press falls, as a fraction of the shift — after the car has gone (§ D871's 0.28). */
const PRESS_FRACTION = Number(process.env['PRESS_LADDER_PRESS_AT'] ?? '0.28');

const seedAt = (n: number): bigint => 20_260_824n + 7_919n * BigInt(n);

/**
 * **Which horizon the day is run on** — GitHub issue #595, [§ D973](../../../../DECISIONS.md).
 *
 * `period` (the default) is the contract's own `shiftLengthForContract` slice, which is what every
 * row of § D914's table was measured on. `whole-day` is what the Everyday run press actually runs
 * for any building `wholeDayFor` answers — `everyday/host.ts#startRun` spreads `wholeDayRun(day)`
 * into the state before the press — and a building with no authored day keeps its slice under
 * either setting, because that is also what the press does there.
 */
const HORIZON = process.env['PRESS_LADDER_HORIZON'] === 'whole-day' ? 'whole-day' : 'period';

/** The two window fields the day runs at, under {@link HORIZON} — `startRun`'s own patch. */
function horizonFields(
  resources: BrowserResources,
  contractId: string,
  buildingId: string,
): { readonly shiftLengthS: number; readonly windowStartS: number | null } {
  const slice = { shiftLengthS: shiftLengthForContract(contractId), windowStartS: null };
  if (HORIZON === 'period') return slice;
  const day = wholeDayFor(resources.trafficProfiles, buildingConfigOf(resources, [], buildingId));
  return day === undefined ? slice : wholeDayRun(day);
}

function allBuildings(): BrowserResources {
  const ids = [...new Set(CONTRACTS.map((contract) => contract.buildingId))];
  const entries = ids.map((id) => {
    const config = parseBuilding(
      JSON.parse(readFileSync(join(DATA_DIR, 'buildings', `${id}.json`), 'utf8')),
    );
    return { file: `${id}.json`, config, resolved: resolveBuilding(config, RESOURCES.elevatorSpecs) };
  });
  return { ...RESOURCES, buildings: entries.map((entry) => entry.resolved), entries };
}

interface Cell {
  readonly missed: boolean;
  readonly worstWaitS: number;
  readonly legs: string;
  readonly failing: string;
}

function runOne(
  resources: BrowserResources,
  contractId: string,
  buildingId: string,
  dispatcherId: string,
  seed: bigint,
  interventions: readonly RunInterventionConfig[],
): Cell {
  const base = baseState();
  const state = {
    ...base,
    buildingId,
    dispatcherId,
    ...horizonFields(resources, contractId, buildingId),
    seed,
    campaignEventId: 'ordinary' as const,
    week: { ...base.week, contractId, day: 1 },
  };
  const plan = shiftRunConfigOf(resources, state);
  const { recording } = recordRun(
    { ...plan.config, interventions },
    { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds },
  );
  const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
  const horizon = runHorizonOf(
    resources.trafficProfiles,
    buildingConfigOf(resources, state.savedBuildings, buildingId),
    state,
  );
  const readings = readGoals(goalsForDay(1, horizon), observations);
  const failing = readings.filter((r) => r.state !== 'met').map((r) => r.goal.id);
  return {
    missed: failing.length > 0,
    worstWaitS: observations.worstWaitS,
    legs: JSON.stringify(
      recording.legs.map((leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1]),
    ),
    failing: failing.join('+'),
  };
}

describe.runIf(process.env['PRESS_LADDER_SWEEP'] === '1')('the press ladder sweep', () => {
  it('writes each contract’s day as built and under each parking press', () => {
    const out = process.env['PRESS_LADDER_OUT'];
    expect(out, 'PRESS_LADDER_OUT names the file the table is written to').toBeTypeOf('string');
    const resources = allBuildings();
    const only = process.env['PRESS_LADDER_ONLY'];
    const wanted =
      only === undefined ? CONTRACTS : CONTRACTS.filter((c) => only.split(',').includes(c.id));
    const dispatcherId = process.env['PRESS_LADDER_DISPATCHER'] ?? 'collective';
    const lines: string[] = ['contract\tn\tseed\tbuilt\tspread\tpark\tw_built\tw_spread\tw_park\tlegs_spread\tlegs_park\tfail_built'];
    for (const contract of wanted) {
      const lengthS = horizonFields(resources, contract.id, contract.buildingId).shiftLengthS;
      const at = lengthS * PRESS_FRACTION;
      const spread: RunInterventionConfig = { atS: at, change: { kind: 'spread-cars' } };
      const park: RunInterventionConfig = { atS: at, change: { kind: 'park-cars-lobby' } };
      for (let n = FROM_N; n < FROM_N + SEEDS; n += 1) {
        const seed = seedAt(n);
        const a = runOne(resources, contract.id, contract.buildingId, dispatcherId, seed, []);
        const s = runOne(resources, contract.id, contract.buildingId, dispatcherId, seed, [spread]);
        const p = runOne(resources, contract.id, contract.buildingId, dispatcherId, seed, [park]);
        lines.push(
          [
            contract.id,
            String(n),
            String(seed),
            a.missed ? 'missed' : 'cleared',
            s.missed ? 'missed' : 'cleared',
            p.missed ? 'missed' : 'cleared',
            a.worstWaitS.toFixed(1),
            s.worstWaitS.toFixed(1),
            p.worstWaitS.toFixed(1),
            s.legs === a.legs ? 'same' : 'moved',
            p.legs === a.legs ? 'same' : 'moved',
            a.failing,
          ].join('\t'),
        );
        writeFileSync(String(out), `${lines.join('\n')}\n`);
      }
    }
  }, 14_400_000);
});

describe.runIf(process.env['PRESS_LADDER_CENSUS'] === '1')('the dispatcher census', () => {
  /**
   * **Fifteen minutes rather than the sweep's four hours, and the difference is measured.**
   *
   * This case landed annotated at the same `14_400_000` as the sweep above it, and lane AG-FIX-1's
   * re-derivation of `testCost.test.ts`'s above-ceiling ratchet is what asked whether it earned
   * one. It does not, by a factor that is not close: the register's own standard is that *an
   * annotation shorter than the job it holds is an annotation that fails for a reason that is not
   * the code*, and the converse has to hold too or the census counts bounds that say nothing about
   * their jobs.
   *
   * Measured 2026-09-22 on this container at load average 3.3, `PRESS_LADDER_PINNED` set to the
   * shipped ladder's seven press days: **91 runs in 10.18 s**. Four hours is 1 414× that.
   *
   * The bound has to cover the largest census anybody can ask for rather than the shipped one, and
   * that set is bounded by the data: `PRESS_LADDER_PINNED` is one seed per contract, so the most
   * that can ever run is sixteen contracts × thirteen shipped profiles = **208 runs**. Priced from
   * the same sitting — the six supertall contracts cost 63.72 s over 18 runs (3.54 s a run) and the
   * other ten cost 4.25 s over 30 (0.142 s) — that worst case is **295 s**. Fifteen minutes is
   * 3.05× it, and reproduces the shipped map's measurement to within 27 % from the same two rates,
   * which is what says the model is the job rather than a curve fitted to it.
   *
   * The sweep above keeps its four hours and earns them on the opposite arithmetic: at the default
   * `PRESS_LADDER_SEEDS=20` it is 20 × 67.97 s = **22.7 minutes** measured in the same sitting, and
   * the same instrument is re-run by hand at larger seed counts — `SEEDS=200` is **3.78 h**, which
   * is what four hours brackets. That is `contractCurve.sweep.test.ts`'s own argument, and it is an
   * argument about *this* case's job rather than a bound copied from the one above it.
   */
  it('writes which standing orders clear each pinned day with no press', () => {
    const out = process.env['PRESS_LADDER_OUT'];
    expect(out, 'PRESS_LADDER_OUT names the file').toBeTypeOf('string');
    const pinned = JSON.parse(process.env['PRESS_LADDER_PINNED'] ?? '{}') as Record<string, string>;
    const resources = allBuildings();
    const lines: string[] = ['contract\tseed\tdispatcher\tbuilt\tworst'];
    for (const [contractId, seedText] of Object.entries(pinned)) {
      const contract = CONTRACTS.find((c) => c.id === contractId);
      if (contract === undefined) continue;
      for (const profile of resources.dispatcherProfiles.profiles) {
        const cell = runOne(
          resources,
          contract.id,
          contract.buildingId,
          profile.id,
          BigInt(seedText),
          [],
        );
        lines.push(
          [contract.id, seedText, profile.id, cell.missed ? 'missed' : 'cleared', cell.worstWaitS.toFixed(1)].join('\t'),
        );
        writeFileSync(String(out), `${lines.join('\n')}\n`);
      }
    }
  }, 900_000);
});

describe.runIf(process.env['PRESS_LADDER_VERIFY'] === '1')('a candidate pin, on the report', () => {
  /**
   * **A pin checked the way `pressLadder.test.ts` checks a shipped one, before it is shipped** —
   * GitHub issue #595, [§ D973](../../../../DECISIONS.md).
   *
   * The sweep above reads a goal predicate; the always-on file reads the verdict line off
   * `dayReportOf`, which is what a player sees. A candidate pin taken from the sweep is re-run here
   * three ways on the report, with the prefix before the press compared on the legs and the longest
   * standing wait at the press instant recorded — the second is what a stage that crosses quiet
   * hours fast decides its pace by, so a pin between peaks can be judged on whether a player could
   * make the press at their own speed. `PRESS_LADDER_PINNED` carries
   * `{ contractId: { seed, clearedBy, missedBy, at } }` and `PRESS_LADDER_HORIZON` the horizon.
   *
   * **It carries no timeout annotation, and is run with `--testTimeout`** on the command line: a
   * handful of pins is minutes rather than hours, the ordinary suite never runs it, and an
   * annotation here would be an above-ceiling budget `testCost.test.ts` counts as a claim.
   */
  it('writes each candidate’s three verdict lines and its prefix check', () => {
    const out = process.env['PRESS_LADDER_OUT'];
    expect(out, 'PRESS_LADDER_OUT names the file').toBeTypeOf('string');
    const pins = JSON.parse(process.env['PRESS_LADDER_PINNED'] ?? '{}') as Record<
      string,
      { seed: string; clearedBy: string; missedBy: string; at: number }
    >;
    const resources = allBuildings();
    const lines: string[] = [
      'contract\tseed\tatS\tbuilt\tcleared_arm\tmissed_arm\tw_built\tw_cleared\tw_missed\tprefix_same\tlegs_moved\tlongest_standing_at_press',
    ];
    for (const [contractId, pin] of Object.entries(pins)) {
      const contract = contractById(contractId);
      if (contract === undefined) continue;
      const fields = horizonFields(resources, contractId, contract.buildingId);
      const atS = fields.shiftLengthS * pin.at;
      const arm = (
        interventions: readonly RunInterventionConfig[],
      ): {
        readonly verdict: string;
        readonly worst: number;
        readonly legs: string;
        readonly prefix: string;
        readonly standing: number;
      } => {
        /* The pair, built together — issue #584's helper, so the rung reaches the run. */
        const state = contractDayState(contractId, {
          seed: BigInt(pin.seed),
          dispatcherId: 'collective',
          over: fields,
        });
        const plan = shiftRunConfigOf(resources, state);
        const { recording } = recordRun(
          { ...plan.config, interventions },
          { recordDecisions: false, outOfServiceCarIds: plan.outOfServiceCarIds },
        );
        const observations = shiftObservationsOf(observationsAt(recording, recording.endedAt));
        const horizon = runHorizonOf(
          resources.trafficProfiles,
          buildingConfigOf(resources, state.savedBuildings, contract.buildingId),
          state,
        );
        const report = dayReportOf({
          recording,
          observations,
          goals: goalsForDay(1, horizon),
          week: openWeek(contractId),
          contract,
          event: SHIFT_EVENTS.ordinary,
          plan: {
            shiftLengthS: fields.shiftLengthS,
            windowStartS: fields.windowStartS,
            patternId: 'building',
          },
          calendar: null,
          subject: { kind: 'week-day' },
        });
        const legs = recording.legs.map(
          (leg) => [leg.passengerId, leg.carId ?? '', leg.boardedAt ?? -1] as const,
        );
        return {
          verdict: report.verdictLine,
          worst: observations.worstWaitS,
          legs: JSON.stringify(legs),
          prefix: JSON.stringify(legs.filter((leg) => leg[2] >= 0 && leg[2] < atS)),
          /* Nobody standing reads as zero, which is below every hold threshold. */
          standing: observationsAt(recording, atS).longestCurrentWaitS ?? 0,
        };
      };
      const change = (kind: string): RunInterventionConfig[] => [
        { atS, change: { kind } as RunInterventionConfig['change'] },
      ];
      const built = arm([]);
      const cleared = arm(change(pin.clearedBy));
      const missed = arm(change(pin.missedBy));
      lines.push(
        [
          contractId,
          pin.seed,
          String(atS),
          built.verdict,
          cleared.verdict,
          missed.verdict,
          built.worst.toFixed(1),
          cleared.worst.toFixed(1),
          missed.worst.toFixed(1),
          String(cleared.prefix === built.prefix && missed.prefix === built.prefix),
          String(cleared.legs !== built.legs && missed.legs !== built.legs),
          built.standing.toFixed(1),
        ].join('\t'),
      );
      writeFileSync(String(out), `${lines.join('\n')}\n`);
    }
  });
});

describe.runIf(process.env['PRESS_LADDER_CALL'] === '1')('the call window — wave AI, § D1029', () => {
  /**
   * **The admission criterion's instrument** — [§ D1029](../../../../DECISIONS.md).
   *
   * For each pin (the shipped ones, or `PRESS_LADDER_PINNED`), run the day as built, ask
   * `shift/pressCall.ts#pressCallOf` for its call, then press each parking verb at every
   * `PRESS_LADDER_STEP` seconds from the call to `PRESS_LADDER_SEARCH` seconds after it, plus
   * `PRESS_LADDER_INTERIOR` seeded off-grid seconds inside the unbroken stretch the grid found. The
   * **window** is the longest stretch from the call at which the clearing verb clears and the other
   * misses at every tried moment; the **holes** are the tried offsets past it that fail. A pin is
   * admitted when its window is at least `PRESS_CALL_MIN_WINDOW_S` long, and
   * `data/contract-ladder.json`'s `call` block is this table's row for it.
   *
   * `PRESS_LADDER_CALL_SEARCH='c3:0-60'` searches crowds instead: seeds `20 260 824 + 7 919 n`,
   * each missed as built screened at offsets 0, 60 and 120 in both orientations, and the full grid
   * run only on a crowd that passes the screen. That is how a failing pin is re-pinned; nothing is
   * written to the data by this file.
   *
   * No timeout annotation, `PRESS_LADDER_VERIFY`'s reason: run by hand with `--testTimeout`.
   */
  it('writes each pin’s call, window, tried count and holes', () => {
    const out = process.env['PRESS_LADDER_OUT'];
    expect(out, 'PRESS_LADDER_OUT names the file').toBeTypeOf('string');
    const stepS = Number(process.env['PRESS_LADDER_STEP'] ?? '10');
    const searchS = Number(process.env['PRESS_LADDER_SEARCH'] ?? '300');
    const interior = Number(process.env['PRESS_LADDER_INTERIOR'] ?? '5');
    const lines: string[] = [
      'contract\tn\tseed\tcleared_by\tbuilt\trule\tcall_s\taway_s\tback_s\tact\twindow_s\ttried\tinterior_ok\tholes\tgrid',
    ];
    const write = (): void => writeFileSync(String(out), `${lines.join('\n')}\n`);

    interface Candidate {
      readonly contractId: string;
      readonly n: string;
      readonly seedText: string;
      readonly horizon: RunHorizon;
      readonly orientations: readonly (readonly [string, string])[];
    }
    const candidates: Candidate[] = [];
    const search = process.env['PRESS_LADDER_CALL_SEARCH'];
    if (search !== undefined) {
      for (const clause of search.split(';')) {
        const [contractId = '', range = '0-0'] = clause.split(':');
        const [from = 0, to = 0] = range.split('-').map(Number);
        const horizon = pressDayFor(contractId)?.horizon ?? 'period';
        for (let n = from; n <= to; n += 1) {
          candidates.push({
            contractId,
            n: String(n),
            seedText: String(seedAt(n)),
            horizon,
            orientations: [
              ['spread-cars', 'park-cars-lobby'],
              ['park-cars-lobby', 'spread-cars'],
            ],
          });
        }
      }
    } else {
      const given = JSON.parse(process.env['PRESS_LADDER_PINNED'] ?? 'null') as Record<
        string,
        { seed: string; clearedBy: string; missedBy: string }
      > | null;
      for (const row of CONTRACT_LADDER.rows) {
        const pin = row.pressDay;
        if (pin === undefined) continue;
        const chosen =
          given === null
            ? { seed: pin.seedText, clearedBy: pin.clearedBy, missedBy: pin.missedBy }
            : given[row.contractId];
        if (chosen === undefined) continue;
        candidates.push({
          contractId: row.contractId,
          n: 'pin',
          seedText: chosen.seed,
          horizon: pin.horizon,
          orientations: [[chosen.clearedBy, chosen.missedBy]],
        });
      }
    }

    for (const candidate of candidates) {
      const seed = BigInt(candidate.seedText);
      const built = pressDayArmOf(candidate.contractId, seed, 'collective', candidate.horizon, []);
      const call = built.call;
      const head = [candidate.contractId, candidate.n, candidate.seedText];
      if (!built.missed || call === undefined) {
        lines.push([...head, '', built.missed ? 'missed' : 'cleared', call?.rule ?? 'none'].join('\t'));
        write();
        continue;
      }
      const facts = [
        call.rule,
        String(call.atS),
        String(call.awayAtS),
        String(call.backAtS ?? ''),
        call.act === undefined ? '' : `${String(call.act.startS)}-${String(call.act.endS)}`,
      ];
      for (const [clearedBy, missedBy] of candidate.orientations) {
        const press = {
          seedText: candidate.seedText,
          standingOrder: 'collective',
          clearedBy,
          missedBy,
          horizon: candidate.horizon,
        };
        if (search !== undefined) {
          /* Short-circuit: the first failing offset settles the screen, and a search is mostly fails. */
          let passes = true;
          for (const offset of [0, 120, 60]) {
            const [one] = windowTries(candidate.contractId, press, call.atS, [offset]);
            if (one === undefined || !(one.clears && one.otherMisses)) {
              passes = false;
              break;
            }
          }
          if (!passes) {
            lines.push([...head, clearedBy, 'missed', ...facts, 'screen-failed'].join('\t'));
            write();
            continue;
          }
        }
        const offsets: number[] = [];
        for (let offset = 0; offset <= searchS; offset += stepS) offsets.push(offset);
        const tries = windowTries(candidate.contractId, press, call.atS, offsets);
        const firstFail = tries.findIndex((one) => !(one.clears && one.otherMisses));
        const windowS =
          firstFail === -1 ? searchS : firstFail === 0 ? -1 : (tries[firstFail - 1]?.offsetS ?? -1);
        const holes = tries
          .filter((one) => !(one.clears && one.otherMisses))
          .map((one) => one.offsetS);
        /* Seeded off-grid seconds inside the window: a hole between two grid points is what they are for. */
        let interiorOk = 0;
        let interiorTried = 0;
        if (windowS > stepS) {
          let lcg = Number(seed % 2_147_483_647n) || 1;
          const offs: number[] = [];
          for (let i = 0; i < interior; i += 1) {
            lcg = (lcg * 48_271) % 2_147_483_647;
            const at = 1 + (lcg % (windowS - 1));
            offs.push(at % stepS === 0 ? at + 1 : at);
          }
          const extra = windowTries(candidate.contractId, press, call.atS, offs);
          interiorTried = extra.length;
          interiorOk = extra.filter((one) => one.clears && one.otherMisses).length;
          lines.push(`# ${candidate.contractId} interior offsets ${offs.join(',')}`);
        }
        const tried = windowS < 0 ? 0 : Math.floor(windowS / stepS) + 1 + interiorTried;
        lines.push(
          [
            ...head,
            clearedBy,
            'missed',
            ...facts,
            String(windowS),
            String(tried),
            `${String(interiorOk)}/${String(interiorTried)}`,
            holes.join(','),
            tries.map((one) => `${one.clears ? 'C' : 'm'}${one.otherMisses ? 'm' : 'C'}`).join(' '),
          ].join('\t'),
        );
        write();
      }
    }
  });
});
