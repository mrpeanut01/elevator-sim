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
  RUSH_AS_SHIPPED,
  RUSH_PREFIT_LEVELS,
  chimeGrantUnits,
  chimeSinkById,
  loadConfig,
  parseChimeLedger,
  parsePriceSchedule,
  parseRushPurse,
  rushFitOf,
  rushHoldAtLegs,
  rushRebuildUnits,
  rushWavesOutlasted,
  runSimulation,
  type ChimeLedgerTable,
  type PassengerRecord,
  type PriceSchedule,
  type RushFit,
  type RushPurseTable,
} from '@elevator-sim/core';

import {
  loadRushPriceSchedule,
  loadRushPurse,
  replayRushSitting,
  rushSittingIssues,
  type RushSittingResources,
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
 *
 * **Those three are figures a player's rush produces, and that is pinned rather than claimed.** They
 * are the three Midtown Office cells of `rushHoldAgreement.json`, which this package's
 * `rushHoldAgreement.test.ts` replays here and `packages/viz/src/everyday/rushHoldAgreement.test.ts`
 * plays through the viewer's own *Start the rush* press. Until PR #513's review they were not: the
 * viewer sized the stream from the player's standing week, and from a day-1 `c2` week the same three
 * rounds held 664 s, 598 s and 664 s.
 */
const BUILDING = 'midtown-office';

let resources: VerificationResources;
let ledger: ChimeLedgerTable;
let purse: RushPurseTable;
let schedule: PriceSchedule;
/** Everything {@link replayRushSitting} reads, from the shipped `data/`; `over` swaps one part. */
const from = (over: Partial<RushSittingResources> = {}): RushSittingResources => ({ resources, purse, ledger, schedule, ...over });

interface Truth {
  readonly startedAt: number;
  readonly heldS: number | null;
  readonly wavesOutlasted: number;
  readonly passengers: readonly PassengerRecord[];
}

/** One round, measured the way the server measures it — see the module docstring. */
function truthOf(round: Omit<SubmittedRushRound, 'claimedHeldS'>, buildingId = BUILDING, fit: RushFit = RUSH_AS_SHIPPED): Truth {
  const config = rushRoundConfigFor(buildingId, round, resources, fit);
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
/** The same round on the tower with Doors 1 fitted — what a round after a 4-unit rebuild plays. */
let doors: Truth;

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
  schedule = parsePriceSchedule(JSON.parse(await readFile(join(DATA_DIR, 'price-schedule.json'), 'utf8')) as unknown);
  plain = truthOf(PLAIN);
  doors = truthOf(PLAIN, BUILDING, rushFitOf({ doors: 1 }));
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
    for (const key of ['purse', 'purseUnits', 'paidUnits', 'purseBeforeUnits', 'purseAfterUnits', 'spentUnits', 'wavesOutlasted', 'budgetUnits', 'units']) {
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

  it('refuses a modifier this sitting’s replay cannot reach, and takes the two it can', () => {
    const withModifier = (sinkId: string): readonly string[] =>
      rushSittingIssues({ buildingId: BUILDING, rounds: [round], modifiers: [{ sinkId, steps: 1 }] }, purse);
    expect(withModifier('rush-purse-top-up')).toEqual([]);
    /*
     * **`rush-prefit` used to be on the other side of this assertion** — GitHub issue #372, § D640.
     * It was refused because *fitted* was authored nowhere and a claim the replay could not build
     * would have put a sitting on a board keyed *bought* for a run of the tower as shipped (§ D606
     * § 2). It is one fixed kit now, `core`'s `config/rushPrefit.ts`, and the replay fits every
     * round with it — so the gate takes it, and the test below plays it.
     */
    expect(withModifier('rush-prefit')).toEqual([]);
    /* A career purse is still not a rush's, and a sink nothing sells is still nothing. */
    expect(withModifier('career-purse-top-up').join(' ')).toContain('career-purse-top-up');
    expect(withModifier('rush-prefit-deluxe').join(' ')).toContain('rush-prefit-deluxe');
  });
});

/* -------------------------------------------------------------------------- *
 * The replay
 * -------------------------------------------------------------------------- */

describe('the replay — every round re-simulated, every purse derived', () => {
  it('verifies an honest sitting, reading each round’s hold moment off its own replay', () => {
    const verified = replayRushSitting(honestSitting(), from());
    if (!verified.ok) throw new Error(`${verified.code}: ${verified.detail}`);
    expect(verified.simulations).toBe(2);
    expect(verified.rounds.map((entry) => entry.heldS)).toEqual([plain.heldS, withSwitch.heldS]);
    expect(verified.rounds.map((entry) => entry.wavesOutlasted)).toEqual([plain.wavesOutlasted, withSwitch.wavesOutlasted]);
    expect(verified.heldS).toBe(withSwitch.heldS);
  }, 300_000);

  it('pays each round its waves outlasted, and opens the next round with the balance the last one left', () => {
    const verified = replayRushSitting(honestSitting(), from());
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
      from(),
    );
    if (!topped.ok) throw new Error(`${topped.code}: ${topped.detail}`);
    expect(topped.rounds[0]?.purseBeforeUnits).toBe(chimeGrantUnits(sink, 2));
    expect(topped.rounds[0]?.paidUnits).toBe(plain.wavesOutlasted * purse.unitsPerWaveOutlasted);
    /*
     * **And the purse it opens moves no run by itself, pinned by a run rather than by a sentence**
     * (§ D227). This read *"no between-round rebuild travels, so a bought top-up widens a purse nothing
     * spends … the day a rebuild travels, this is the assertion that has to change with it"*. A rebuild
     * travels now (GitHub issue #372, § D1295), and the assertion still holds for the reason it now
     * states: the first round is the tower as shipped, so a wider purse reaches a run only through a
     * rebuild it pays for between rounds, and `the rebuild between rounds` below is that run.
     */
    expect(topped.rounds[0]?.heldS).toBe(plain.heldS);
  }, 300_000);

  it('fits the tower for a sitting that claims the pre-fit, and the run is a different run', () => {
    /*
     * **GitHub issue #372, § D640 — and this is the assertion the purse's own row above cannot
     * make.** A top-up widens a purse nothing spends, so it holds at the same moment; a pre-fit is
     * the one modifier that reaches the run, so it must not. Compared on the **hold moment**, which
     * is what this sitting ranks on and is read off the replay's own legs, rather than on a summary
     * line — `CLAUDE.md`'s standing requirement pointed at a purchase.
     *
     * The claim is honest on both sides: the round claims the held time a *fitted* replay produces,
     * because that is what a player who bought the kit would have watched.
     */
    const fitted = truthOf(PLAIN, BUILDING, rushFitOf(RUSH_PREFIT_LEVELS));
    expect(fitted.heldS, 'the kit changed nothing the rush can see on this cell').not.toBe(plain.heldS);

    const verified = replayRushSitting(
      { buildingId: BUILDING, rounds: [claimed(PLAIN, fitted)], modifiers: [{ sinkId: 'rush-prefit', steps: 1 }] },
      from(),
    );
    if (!verified.ok) throw new Error(`${verified.code}: ${verified.detail}`);
    expect(verified.heldS).toBe(fitted.heldS);
    /* A pre-fit grants no units, so the purse opens where the standard board's does. */
    expect(verified.rounds[0]?.purseBeforeUnits).toBe(0);

    /*
     * And the other direction, which is the half that says the fitting is driven by the claim rather
     * than always on: the same round, claiming the same fitted figure, with no modifier on it is
     * refused because the server replays the tower as shipped and gets a different moment.
     */
    const unclaimed = replayRushSitting({ buildingId: BUILDING, rounds: [claimed(PLAIN, fitted)] }, from());
    expect(unclaimed.ok).toBe(false);
    if (!unclaimed.ok) expect(unclaimed.code).toBe('held-does-not-reproduce');
  }, 300_000);

  it('refuses a claimed pre-fit it cannot build, rather than replaying the tower as shipped', () => {
    /*
     * The kit resolves each car's door timings against `data/elevator-specs.json`, so a resources
     * set without one cannot fit a tower. **Refused rather than replayed unfitted**: the alternative
     * compares an honest player's fitted hold against an as-shipped replay and blames their build.
     * No shipped server reaches it — `bootstrap.ts` always passes the specs — so it is driven here.
     */
    const blind: VerificationResources = { ...resources, elevatorSpecs: undefined };
    const verified = replayRushSitting(
      { buildingId: BUILDING, rounds: [claimed(PLAIN, plain)], modifiers: [{ sinkId: 'rush-prefit', steps: 1 }] },
      from({ resources: blind }),
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.code).toBe('cannot-fit');
      expect(verified.simulations, 'a refusal that cannot be built costs no simulation').toBe(0);
    }
  });

  it('ignores a purse the client smuggles past the gate — every purse is the replay’s, whatever the body says', () => {
    const honest = replayRushSitting(honestSitting(), from());
    const smuggled = {
      ...honestSitting(),
      purseUnits: 999,
      rounds: honestSitting().rounds.map((entry) => ({ ...entry, paidUnits: 999, purseAfterUnits: 999, wavesOutlasted: 30 })),
    } as unknown as SubmittedRushSitting;
    const replayed = replayRushSitting(smuggled, from());
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
      from(),
    );
    expect(logDropped.ok).toBe(false);
    if (!logDropped.ok) expect(logDropped.code).toBe('held-does-not-reproduce');
  }, 300_000);

  it('refuses a claim that does not reproduce, and names the round it came from', () => {
    const forged = honestSitting();
    const rounds = [forged.rounds[0], { ...forged.rounds[1], claimedHeldS: (withSwitch.heldS ?? 0) + 2 }] as SubmittedRushRound[];
    const verified = replayRushSitting({ ...forged, rounds }, from());
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.code).toBe('held-does-not-reproduce');
      expect(verified.round).toBe(2);
    }
  }, 300_000);

  it('refuses a sitting whose last round never breaks — a tower that held the whole stream has no breaking point to post', () => {
    // Measured in `rushSitting.cost.test.ts`: under collective, Vertical City's thirty-five cars hold all
    // thirty waves. Only under collective — nearest-car breaks it at 3 546 s (`rushHoldAgreement.json`).
    const held = truthOf(PLAIN, 'vertical-city');
    expect(held.heldS).toBeNull();
    expect(held.wavesOutlasted).toBe(30);
    const verified = replayRushSitting(
      { buildingId: 'vertical-city', rounds: [{ ...PLAIN, claimedHeldS: null }] },
      from(),
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
      from(),
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
 * The rebuild between rounds — GitHub issue #372's second criterion, § D1295
 * -------------------------------------------------------------------------- */

describe('the rebuild between rounds — the gate', () => {
  const round = { dispatcherProfileId: 'collective', claimedHeldS: 900 };
  const sittingWith = (rebuild: unknown, modifiers?: unknown): readonly string[] =>
    rushSittingIssues(
      { buildingId: BUILDING, rounds: [round, { ...round, rebuild }], ...(modifiers === undefined ? {} : { modifiers }) },
      purse,
    );

  it('accepts a rebuild of menu tiers on a later round, and two categories at once', () => {
    expect(sittingWith(['faster-doors'])).toEqual([]);
    expect(sittingWith(['advance-opening', 'larger-cars-21'])).toEqual([]);
    expect(sittingWith([])).toEqual([]);
  });

  it('refuses a rebuild before the first round, because a sitting starts from the building as shipped', () => {
    const issues = rushSittingIssues({ buildingId: BUILDING, rounds: [{ ...round, rebuild: ['faster-doors'] }] }, purse);
    expect(issues.join(' ')).toMatch(/rounds\[0\]\.rebuild .*first round is the building as shipped/u);
  });

  it('refuses Shafts and Machines by name, with the reason, and the two tenant tiers that change who arrives', () => {
    for (const priceId of ['new-car', 'fifth-car', 'machines-4mps', 'machines-5mps', 'machines-gearless']) {
      const issues = sittingWith([priceId]).join(' ');
      expect(issues, priceId).toContain(`"${priceId}"`);
      expect(issues, priceId).toMatch(/(shafts|machines) level \d, which a rush cannot rebuild: it needs the commissioning/u);
    }
    for (const priceId of ['staggered-starts', 'move-a-tenant']) {
      expect(sittingWith([priceId]).join(' '), priceId).toMatch(/changes who arrives, and a rush board ranks sittings that met the same crowd/u);
    }
    expect(sittingWith(['no-such-row']).join(' ')).toContain('not a tier the rush rebuild sells');
  });

  it('refuses a tier the sitting already has, the pre-fit’s Doors 1 included, and two tiers of one category', () => {
    expect(sittingWith(['faster-doors'], [{ sinkId: 'rush-prefit', steps: 1 }]).join(' ')).toMatch(/already has that category at level 1/u);
    expect(sittingWith(['door-sensors'], [{ sinkId: 'rush-prefit', steps: 1 }])).toEqual([]);
    expect(sittingWith(['faster-doors', 'door-sensors']).join(' ')).toMatch(/two doors tiers at once/u);
    const twice = rushSittingIssues(
      { buildingId: BUILDING, rounds: [round, { ...round, rebuild: ['faster-doors'] }, { ...round, rebuild: ['faster-doors'] }] },
      purse,
    );
    expect(twice.join(' ')).toMatch(/rounds\[2\]\.rebuild buys "faster-doors", and this sitting already has/u);
  });

  it('refuses a rebuild that is not a list of ids', () => {
    expect(sittingWith('faster-doors').join(' ')).toMatch(/must be a list of price-schedule row ids/u);
    expect(sittingWith([7]).join(' ')).toMatch(/must be a list of price-schedule row ids/u);
  });
});

describe('the rebuild between rounds — the replay', () => {
  it('moves the control and requires the run to change: a rebuilt round plays different legs, compared on the legs', () => {
    const boardings = (truth: Truth): readonly (number | undefined)[] => truth.passengers.map((leg) => leg.boardedAt);
    expect(boardings(doors)).not.toEqual(boardings(plain));
    expect(doors.heldS, 'Doors 1 changed nothing the rush can see on this cell').not.toBe(plain.heldS);
  });

  it('replays a rebuilt round on the rebuilt tower, keeps the tier for the rest of the sitting, and takes its price from the purse', () => {
    const verified = replayRushSitting(
      {
        buildingId: BUILDING,
        rounds: [claimed(PLAIN, plain), { ...claimed(PLAIN, doors), rebuild: ['faster-doors'] }, claimed(PLAIN, doors)],
      },
      from(),
    );
    if (!verified.ok) throw new Error(`${verified.code}: ${verified.detail}`);
    /* Round 3 bought nothing and still plays the rebuilt tower: a tier bought between rounds persists. */
    expect(verified.rounds.map((entry) => entry.heldS)).toEqual([plain.heldS, doors.heldS, doors.heldS]);
    const price = rushRebuildUnits(schedule, ['faster-doors']);
    const [first, second, third] = verified.rounds;
    expect(first?.spentUnits).toBe(0);
    expect(second?.purseBeforeUnits).toBe(first?.purseAfterUnits);
    expect(second?.spentUnits).toBe(price);
    expect(second?.purseAfterUnits).toBe((first?.purseAfterUnits ?? Number.NaN) - price + (second?.paidUnits ?? Number.NaN));
    expect(third?.spentUnits).toBe(0);
  }, 600_000);

  it('gives the standard purse with no rebuild exactly the run and the figures it gave before', () => {
    /*
     * The negative control. A second round nothing was bought for is the first round again, and its
     * purse adds what it earned and takes nothing: the figures this file pinned before the spend term
     * existed, with a zero where the term now sits.
     */
    const verified = replayRushSitting({ buildingId: BUILDING, rounds: [claimed(PLAIN, plain), claimed(PLAIN, plain)] }, from());
    if (!verified.ok) throw new Error(`${verified.code}: ${verified.detail}`);
    expect(verified.rounds[1]?.heldS).toBe(plain.heldS);
    expect(verified.rounds.map((entry) => entry.spentUnits)).toEqual([0, 0]);
    expect(verified.rounds[1]?.purseAfterUnits).toBe(2 * plain.wavesOutlasted * purse.unitsPerWaveOutlasted);
  }, 600_000);

  it('refuses a rebuild above the derived purse by name, and the same rebuild goes through on a wider purse', () => {
    /*
     * Car size 2 is dearer than what Midtown Office's first round pays on the standard purse, and not
     * dearer than that plus the top-up's three steps. So this is the issue's own control: a round
     * rebuilt with a larger purse produces a different run from the same seed, and on the standard
     * purse the rebuild is refused and the round cannot be played as posted.
     */
    const price = rushRebuildUnits(schedule, ['larger-cars-21']);
    const earned = plain.wavesOutlasted * purse.unitsPerWaveOutlasted;
    const sink = chimeSinkById(ledger, 'rush-purse-top-up');
    if (sink === undefined) throw new Error('the shipped ledger sells no rush-purse-top-up');
    const topUp = chimeGrantUnits(sink, sink.maxSteps);
    expect(price, 'the fixture needs a tier the standard purse cannot reach').toBeGreaterThan(earned);
    expect(price, 'and one the wider purse can').toBeLessThanOrEqual(earned + topUp);

    const cars = truthOf(PLAIN, BUILDING, rushFitOf({ cars: 2 }));
    expect(cars.heldS).not.toBe(plain.heldS);
    const sitting = { buildingId: BUILDING, rounds: [claimed(PLAIN, plain), { ...claimed(PLAIN, cars), rebuild: ['larger-cars-21'] }] };

    const standard = replayRushSitting(sitting, from());
    expect(standard.ok).toBe(false);
    if (!standard.ok) {
      expect(standard.code).toBe('rebuild-over-purse');
      expect(standard.round).toBe(2);
      expect(standard.detail).toContain(`${String(price)} units`);
      expect(standard.detail).toContain(`a purse of ${String(earned)}`);
      expect(standard.simulations, 'refused before the round it would have paid for simulates').toBe(1);
    }

    const wider = replayRushSitting({ ...sitting, modifiers: [{ sinkId: 'rush-purse-top-up', steps: sink.maxSteps }] }, from());
    if (!wider.ok) throw new Error(`${wider.code}: ${wider.detail}`);
    expect(wider.rounds[1]?.heldS).toBe(cars.heldS);
    expect(wider.rounds[1]?.spentUnits).toBe(price);
  }, 600_000);

  it('refuses a tier that would build the tower the sitting already has, before anything simulates', () => {
    /* Measured: Midtown Office's cars are already rated for sixteen, so Car size 1 moves no leg there. */
    const verified = replayRushSitting(
      { buildingId: BUILDING, rounds: [claimed(PLAIN, plain), { ...claimed(PLAIN, plain), rebuild: ['larger-cars'] }] },
      from(),
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.code).toBe('rebuild-refused');
      expect(verified.detail).toContain('would build the tower this sitting already has');
      expect(verified.simulations).toBe(0);
    }
  });

  it('refuses a rebuild it cannot build, rather than replaying the tower as shipped', () => {
    const blind: VerificationResources = { ...resources, elevatorSpecs: undefined };
    const verified = replayRushSitting(
      { buildingId: BUILDING, rounds: [claimed(PLAIN, plain), { ...claimed(PLAIN, doors), rebuild: ['faster-doors'] }] },
      from({ resources: blind }),
    );
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.code).toBe('cannot-fit');
      expect(verified.round).toBe(2);
      expect(verified.simulations).toBe(0);
    }
  });
});

describe('loadRushPriceSchedule — at boot', () => {
  it('reads the shipped schedule, which prices every tier on the rush menu', async () => {
    expect(await loadRushPriceSchedule(DATA_DIR)).toEqual(schedule);
  });

  it('refuses to start on a schedule that does not price a menu tier', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'rush-schedule-'));
    try {
      const raw = JSON.parse(await readFile(join(DATA_DIR, 'price-schedule.json'), 'utf8')) as { readonly changes: readonly { readonly id: string }[] };
      /* Renamed rather than removed, so the schedule's own rules (a tier's typical is its median) still pass. */
      await writeFile(
        join(scratch, 'price-schedule.json'),
        JSON.stringify({
          ...raw,
          changes: raw.changes.map((change) => (change.id === 'faster-doors' ? { ...change, id: 'quicker-doors' } : change)),
        }),
      );
      await expect(loadRushPriceSchedule(scratch)).rejects.toThrow(/faster-doors/u);
    } finally {
      await rm(scratch, { recursive: true, force: true });
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
