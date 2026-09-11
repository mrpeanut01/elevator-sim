/**
 * **A rush sitting, posted whole** — GitHub issue #372, under the owner's ruling of 2026-09-10: *a
 * sitting is consecutive runs from an as-shipped start. The posted result carries every round's
 * intervention log, and the server replays the chain and derives each round's purse from the
 * previous round's hold moment.*
 *
 * Against the real `data/` and the real kernel, on `verify.test.ts`'s ground: a replay tested against
 * a stub would prove the stub agrees with itself. Every truth below is measured through the server's
 * own path — `verify.ts#rushRoundConfigFor`, `runSimulation`, `core`'s hold reader — and never through
 * a second hand-built configuration.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  chimeGrantUnits,
  chimeSinkById,
  loadConfig,
  parseChimeLedger,
  parseRushPurse,
  rushHoldAtLegs,
  rushWavesOutlasted,
  runSimulation,
  type ChimeLedgerTable,
  type PassengerRecord,
  type RushPurseTable,
} from '@elevator-sim/core';

import {
  loadRushPurse,
  replayRushSitting,
  rushSittingIssues,
  type SubmittedRushRound,
  type SubmittedRushSitting,
} from './rushSitting.js';
import { rushRoundConfigFor, type VerificationResources } from './verify.js';

const DATA_DIR = new URL('../../../../data/', import.meta.url).pathname;
/**
 * Midtown Office, and the choice is measured rather than convenient. On Garden Apartments — two cars —
 * a mid-run handover changes 1 688 of 3 466 legs and **no hold moment**: the lobby is already
 * holding 1 514 people when the line is crossed, so which car answers a call no longer decides when
 * forty have stood two minutes, and every logged change held at 1 178 s. On Midtown Office's four cars
 * the log still decides it: collective 1 640 s, a switch to nearest-car at 60 s 1 510 s, the cars parked
 * at 60 s 1 536 s. A round whose log cannot move its hold is not a round that shows the log reaching
 * the replay, so the fixture is the tower where it does.
 */
const BUILDING = 'midtown-office';

let resources: VerificationResources;
let ledger: ChimeLedgerTable;
let purse: RushPurseTable;

interface Truth {
  readonly startedAt: number;
  readonly heldS: number | null;
  readonly wavesOutlasted: number;
  readonly passengers: readonly PassengerRecord[];
}

/** One round, measured the way the server measures it — see the module docstring. */
function truthOf(round: Omit<SubmittedRushRound, 'claimedHeldS'>, buildingId = BUILDING): Truth {
  const config = rushRoundConfigFor(buildingId, round, resources);
  if (typeof config === 'string') throw new Error(`the fixture does not resolve: ${config}`);
  const { record } = runSimulation(config);
  const holdAtS = rushHoldAtLegs(record.passengers, record.startedAt, record.endedAt);
  return {
    startedAt: record.startedAt,
    heldS: holdAtS === undefined ? null : holdAtS - record.startedAt,
    wavesOutlasted: rushWavesOutlasted(holdAtS, record.startedAt),
    passengers: record.passengers,
  };
}

const PLAIN: Omit<SubmittedRushRound, 'claimedHeldS'> = Object.freeze({ dispatcherProfileId: 'collective' });
let switched: Omit<SubmittedRushRound, 'claimedHeldS'>;
let plain: Truth;
let withSwitch: Truth;

beforeAll(async () => {
  const config = await loadConfig(DATA_DIR);
  resources = {
    buildingsById: config.buildingsById,
    dispatcherProfilesById: config.dispatcherProfilesById,
    trafficProfiles: config.trafficProfiles,
    elevatorSpecs: config.elevatorSpecs,
    dispatcherProfiles: config.dispatcherProfiles,
  };
  ledger = parseChimeLedger(JSON.parse(await readFile(join(DATA_DIR, 'chime-ledger.json'), 'utf8')) as unknown);
  purse = parseRushPurse(JSON.parse(await readFile(join(DATA_DIR, 'rush-purse.json'), 'utf8')) as unknown);
  plain = truthOf(PLAIN);
  // A minute in, the day is handed to the weakest shipped dispatcher — a mid-run change on the log.
  switched = {
    dispatcherProfileId: 'collective',
    interventions: [{ atS: plain.startedAt + 60, change: { kind: 'switch-dispatcher', toProfileId: 'nearest-car' } }],
  };
  withSwitch = truthOf(switched);
}, 300_000);

function claimed(round: Omit<SubmittedRushRound, 'claimedHeldS'>, truth: Truth): SubmittedRushRound {
  return { ...round, claimedHeldS: truth.heldS };
}

function honestSitting(): SubmittedRushSitting {
  return { buildingId: BUILDING, rounds: [claimed(PLAIN, plain), claimed(switched, withSwitch)] };
}

/* -------------------------------------------------------------------------- *
 * The cheap gate
 * -------------------------------------------------------------------------- */

describe('the cheap gate — everything refused before a simulation starts', () => {
  const round = { dispatcherProfileId: 'collective', claimedHeldS: 900 };

  it('accepts a sitting that carries a building, its rounds and nothing else', () => {
    expect(rushSittingIssues({ buildingId: BUILDING, rounds: [round, round] }, purse)).toEqual([]);
  });

  it('refuses a purse or an amount the client names, by name, on the sitting and on a round', () => {
    for (const key of ['purse', 'purseUnits', 'paidUnits', 'purseBeforeUnits', 'purseAfterUnits', 'wavesOutlasted', 'budgetUnits', 'units']) {
      const onSitting = rushSittingIssues({ buildingId: BUILDING, rounds: [round], [key]: 999 }, purse);
      expect(onSitting.join(' '), key).toContain(`"${key}"`);
      expect(onSitting.join(' '), key).toMatch(/derives? .*purse|purse .*derived/u);
      const onRound = rushSittingIssues({ buildingId: BUILDING, rounds: [{ ...round, [key]: 999 }] }, purse);
      expect(onRound.join(' '), key).toContain(`rounds[0]`);
      expect(onRound.join(' '), key).toContain(`"${key}"`);
    }
  });

  it('refuses the run identity a round could otherwise choose — the seed, the stream and the length are derived', () => {
    for (const key of ['seed', 'demandTemplateId', 'arrivalRatePctPop5min', 'durationS', 'windowStartS']) {
      expect(rushSittingIssues({ buildingId: BUILDING, rounds: [round], [key]: 1 }, purse).join(' '), key).toContain(`"${key}"`);
      expect(rushSittingIssues({ buildingId: BUILDING, rounds: [{ ...round, [key]: 1 }] }, purse).join(' '), key).toContain(`"${key}"`);
    }
  });

  it('refuses no rounds, more rounds than a sitting may command, and a claim that is not a held time', () => {
    expect(rushSittingIssues({ buildingId: BUILDING, rounds: [] }, purse).join(' ')).toMatch(/at least one round/u);
    expect(rushSittingIssues({ buildingId: BUILDING, rounds: Array.from({ length: 1_000 }, () => round) }, purse).join(' ')).toMatch(
      /at most \d+ rounds/u,
    );
    for (const claimedHeldS of [-1, Number.NaN, '900', undefined]) {
      expect(
        rushSittingIssues({ buildingId: BUILDING, rounds: [{ dispatcherProfileId: 'collective', claimedHeldS }] }, purse).join(' '),
        String(claimedHeldS),
      ).toContain('claimedHeldS');
    }
  });

  it('refuses a mid-run change that cannot travel, on the kind a single run is refused on', () => {
    const issues = rushSittingIssues(
      {
        buildingId: BUILDING,
        rounds: [
          {
            ...round,
            interventions: [{ atS: 30, change: { kind: 'equipment-change', changeId: 'door-dwell', name: 'x', serviceEvents: [] } }],
          },
        ],
      },
      purse,
    );
    expect(issues.join(' ')).toContain('rounds[0].interventions[0]');
    expect(issues.join(' ')).toContain('equipment-change');
  });

  it('refuses a modifier that does not top up this purse — a fitted building this server cannot build, or a career purse', () => {
    const withModifier = (sinkId: string): readonly string[] =>
      rushSittingIssues({ buildingId: BUILDING, rounds: [round], modifiers: [{ sinkId, steps: 1 }] }, purse);
    expect(withModifier('rush-purse-top-up')).toEqual([]);
    expect(withModifier('rush-prefit').join(' ')).toContain('rush-prefit');
    expect(withModifier('career-purse-top-up').join(' ')).toContain('career-purse-top-up');
  });
});

/* -------------------------------------------------------------------------- *
 * The replay
 * -------------------------------------------------------------------------- */

describe('the replay — every round re-simulated, every purse derived', () => {
  it('verifies an honest sitting, reading each round’s hold moment off its own replay', () => {
    const verified = replayRushSitting(honestSitting(), { resources, purse, ledger });
    if (!verified.ok) throw new Error(`${verified.code}: ${verified.detail}`);
    expect(verified.simulations).toBe(2);
    expect(verified.rounds.map((entry) => entry.heldS)).toEqual([plain.heldS, withSwitch.heldS]);
    expect(verified.rounds.map((entry) => entry.wavesOutlasted)).toEqual([plain.wavesOutlasted, withSwitch.wavesOutlasted]);
    expect(verified.heldS).toBe(withSwitch.heldS);
  }, 300_000);

  it('pays each round its waves outlasted, and opens the next round with the balance the last one left', () => {
    const verified = replayRushSitting(honestSitting(), { resources, purse, ledger });
    if (!verified.ok) throw new Error(`${verified.code}: ${verified.detail}`);
    const [first, second] = verified.rounds;
    expect(first?.purseBeforeUnits).toBe(0);
    expect(first?.paidUnits).toBe(plain.wavesOutlasted * purse.unitsPerWaveOutlasted);
    expect(second?.purseBeforeUnits).toBe(first?.purseAfterUnits);
    expect(second?.paidUnits).toBe(withSwitch.wavesOutlasted * purse.unitsPerWaveOutlasted);
    expect(second?.purseAfterUnits).toBe((first?.purseAfterUnits ?? Number.NaN) + (second?.paidUnits ?? Number.NaN));
  }, 300_000);

  it('opens the purse at what the listed top-up bought, and at nothing on the standard board', () => {
    const sink = chimeSinkById(ledger, 'rush-purse-top-up');
    if (sink === undefined) throw new Error('the shipped ledger sells no rush-purse-top-up');
    const topped = replayRushSitting(
      { buildingId: BUILDING, rounds: [claimed(PLAIN, plain)], modifiers: [{ sinkId: 'rush-purse-top-up', steps: 2 }] },
      { resources, purse, ledger },
    );
    if (!topped.ok) throw new Error(`${topped.code}: ${topped.detail}`);
    expect(topped.rounds[0]?.purseBeforeUnits).toBe(chimeGrantUnits(sink, 2));
    expect(topped.rounds[0]?.paidUnits).toBe(plain.wavesOutlasted * purse.unitsPerWaveOutlasted);
    /*
     * **And the purse it opens moves no run, pinned by a run rather than by a sentence** (§ D227). No
     * between-round rebuild travels, so a bought top-up widens a purse nothing spends: the replay holds
     * at the same moment it holds without one. The day a rebuild travels, this is the assertion that
     * has to change with it — which is what makes the absence a stated refusal rather than a quiet one.
     */
    expect(topped.rounds[0]?.heldS).toBe(plain.heldS);
  }, 300_000);

  it('ignores a purse the client smuggles past the gate — every purse is the replay’s, whatever the body says', () => {
    const honest = replayRushSitting(honestSitting(), { resources, purse, ledger });
    const smuggled = {
      ...honestSitting(),
      purseUnits: 999,
      rounds: honestSitting().rounds.map((entry) => ({ ...entry, paidUnits: 999, purseAfterUnits: 999, wavesOutlasted: 30 })),
    } as unknown as SubmittedRushSitting;
    const replayed = replayRushSitting(smuggled, { resources, purse, ledger });
    if (!honest.ok || !replayed.ok) throw new Error('both sittings should verify');
    expect(replayed.rounds).toEqual(honest.rounds);
    expect(replayed.rounds.every((entry) => entry.paidUnits !== 999 && entry.purseAfterUnits !== 999)).toBe(true);
  }, 300_000);

  it('moves the control and requires the run to change: the intervention log reaches the replay, compared on the legs', () => {
    const boardings = (truth: Truth): readonly (number | undefined)[] => truth.passengers.map((leg) => leg.boardedAt);
    expect(boardings(withSwitch)).not.toEqual(boardings(plain));
    expect(withSwitch.heldS).not.toBe(plain.heldS);
    // The same round posted without its log claims a hold moment its own replay does not reach.
    const logDropped = replayRushSitting(
      { buildingId: BUILDING, rounds: [{ dispatcherProfileId: 'collective', claimedHeldS: withSwitch.heldS }] },
      { resources, purse, ledger },
    );
    expect(logDropped.ok).toBe(false);
    if (!logDropped.ok) expect(logDropped.code).toBe('held-does-not-reproduce');
  }, 300_000);

  it('refuses a claim that does not reproduce, and names the round it came from', () => {
    const forged = honestSitting();
    const rounds = [forged.rounds[0], { ...forged.rounds[1], claimedHeldS: (withSwitch.heldS ?? 0) + 2 }] as SubmittedRushRound[];
    const verified = replayRushSitting({ ...forged, rounds }, { resources, purse, ledger });
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.code).toBe('held-does-not-reproduce');
      expect(verified.round).toBe(2);
    }
  }, 300_000);

  it('refuses a sitting whose last round never breaks — a tower that held the whole stream has no breaking point to post', () => {
    // Measured in `rushSitting.cost.test.ts`: Vertical City's thirty-five cars hold all thirty waves.
    const held = truthOf(PLAIN, 'vertical-city');
    expect(held.heldS).toBeNull();
    expect(held.wavesOutlasted).toBe(30);
    const verified = replayRushSitting(
      { buildingId: 'vertical-city', rounds: [{ ...PLAIN, claimedHeldS: null }] },
      { resources, purse, ledger },
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.code).toBe('no-breaking-point');
      expect(verified.round).toBe(1);
      expect(verified.simulations).toBe(1);
    }
  }, 300_000);

  it('refuses a round under a dispatcher this server does not ship, before anything simulates', () => {
    const verified = replayRushSitting(
      { buildingId: BUILDING, rounds: [claimed(PLAIN, plain), { dispatcherProfileId: 'saved-on-a-device', claimedHeldS: 900 }] },
      { resources, purse, ledger },
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.code).toBe('unknown-dispatcher');
      expect(verified.round).toBe(2);
      expect(verified.simulations).toBe(0);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * Loading the purse
 * -------------------------------------------------------------------------- */

describe('loadRushPurse — at boot, against the ledger the server also loaded', () => {
  it('reads the shipped purse', async () => {
    expect(await loadRushPurse(DATA_DIR, ledger)).toEqual(purse);
  });

  it('refuses to start on a purse whose top-up the ledger does not sell', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'rush-purse-'));
    try {
      const raw = JSON.parse(await readFile(join(DATA_DIR, 'rush-purse.json'), 'utf8')) as Record<string, unknown>;
      await writeFile(join(scratch, 'rush-purse.json'), JSON.stringify({ ...raw, topUpSinkIds: ['rush-prefit'] }));
      await expect(loadRushPurse(scratch, ledger)).rejects.toThrow(/rush-prefit/u);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
});
