/**
 * **DC-12, a carried answer does not clear** — `docs/33` § 3.3h, [§ D1424](../../../../DECISIONS.md),
 * decision swarm DS's Q4 ruling, GitHub issue #234. Nothing here simulates: it reads
 * `data/scenario-survivors.json`, which `survivorSweep.test.ts` pins to the run that produced it.
 *
 * ## The rule, over the census
 *
 * From path position 3, every stage's base-rung survivors, as the pinned census names them:
 *
 * 1. **number at least one.** A stage with none is held (`scenario/ladder.ts`), and DC-3 and
 *    `survivors.test.ts#UNWINNABLE_AS_MEASURED` own it; it is registered here as `no-way-through`
 *    so the register accounts for every stage from position 3.
 * 2. **include no carried answer**: no survivor is also a base-rung survivor of any earlier stage on
 *    the path. A player who learned that earlier stage already owns that answer, and replaying it
 *    here asks them nothing new.
 * 3. **include no bare dropdown pick**: no survivor is a shipped profile picked by name alone,
 *    which is [§ D528](../../../../DECISIONS.md) clause 2 read off the census.
 *
 * Clauses 2 and 3 together with clause 1 are the ruling's *"at least one survivor that clears no
 * earlier stage and is not a bare dropdown pick"*, and they are stronger than it on purpose: the
 * ruling's own register (stages 3, 6, 7 and 8 failing) is the one the stronger reading derives,
 * since stages 6, 7 and 8 each already hold one fresh survivor beside their carried ones. Every
 * swarm member wrote the rule as *shares no configuration name*, and § D1424 records the reading.
 *
 * - **Positions 1 and 2 are exempt and asserted exempt** (§ D528's *"positions one and two are
 *   exempt and are asserted to be exempt"*): stage 2 shares two of its five survivors with stage 1
 *   and stage 1 clears from the dropdown, and neither is reported.
 * - **A drawn dial survivor is never carried.** `edit-<n>` names a position in one cell's draw, so
 *   `edit-3` on two stages is two different vectors; it has no name a player can carry. It still
 *   counts as a way through for clause 1.
 * - **The census's named configurations only.** A carried answer outside what the census examined
 *   (a dial vector it did not draw, a stage's wider rung) is not checked, and the rule says so
 *   rather than implying it was.
 * - **The base rung only**, the rung the ten stages are played at
 *   (`scenario/ladder.ts#SCENARIO_LADDER_COPY.baseRungNote`).
 *
 * ## The register, checked in both directions
 *
 * {@link CARRIED_ANSWERS} names every stage from position 3 that breaks the rule, with exactly
 * what breaks it. A stage that breaks it and is not registered is red; a registered stage whose
 * census row no longer breaks it as registered is red, and its row is deleted on the commit that
 * regenerates the census. A rebalance (demand or fabric, never a bar, DC-R1) empties it stage by
 * stage, and nothing can quietly reintroduce a carried answer.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_DIR } from '../fixtures.test-helper.js';
import { SCENARIO_SURVIVORS_PATH } from './regenerateSurvivors.test-helper.js';
import type { PublishedSurvivorScenario, PublishedSurvivors } from './survivors.js';

/** The first path position the rule binds. Positions before it are exempt (§ D528). */
const FIRST_BOUND_POSITION = 3;

/** How a registered stage breaks DC-12. Derived from its census row, never chosen. */
type CarriedAnswerKind = 'carried' | 'dropdown' | 'no-way-through';

/** One stage's breach, as the census shows it. */
interface CarriedAnswerRow {
  /**
   * `no-way-through` when the base rung names no survivor; `carried` when some survivor is also an
   * earlier stage's; `dropdown` when none is carried and some survivor is a bare shipped profile.
   */
  readonly kind: CarriedAnswerKind;
  /** The carried survivors, sorted. */
  readonly carried: readonly string[];
  /** The bare dropdown picks among the survivors, sorted. */
  readonly dropdown: readonly string[];
}

/** A register row with the measured reason a reader needs, which the comparison does not read. */
interface RegisteredRow extends CarriedAnswerRow {
  readonly why: string;
}

/**
 * **Every stage from position 3 that breaks DC-12, on the census regenerated with stage 7 at
 * 2.25 %pop/5 min** (`data/scenario-survivors.json`). The swarm's register, reproduced from the
 * file rather than copied from the ruling: stages 3, 6 and 8 carry answers, stages 5 and 9 are
 * named dropdown breaches (§ D1288 registered stage 9's in `campaign/difficultyCurve.test.ts`
 * first), and stages 4 and 10 have no way through. **Stage 7 left on 2026-10-13** (§ D1426), and
 * stage 8's carried set lost the two lobby answers it shared only with stage 7's old set. The next
 * wave takes stages 6, 3 and 4.
 */
const CARRIED_ANSWERS: Readonly<Record<string, RegisteredRow>> = Object.freeze({
  'stage-3-overwhelmed': {
    kind: 'carried',
    carried: [
      'fairness-first-parked-lobby',
      'fairness-first-parked-predicted-demand',
      'fairness-first-parked-zone-center',
    ],
    dropdown: ['fairness-first'],
    why:
      'Three of its four ways through are stages 1 and 2’s, and the fourth is the dropdown’s ' +
      'fairness-first. The demand axis is measured shut in both directions (docs/33 § 3.3f); it needs a ' +
      'new answer, which is next wave’s.',
  },
  'stage-4-two-banks': {
    kind: 'no-way-through',
    carried: [],
    dropdown: [],
    why: 'Held: no way through at any rung (survivors.test.ts#UNWINNABLE_AS_MEASURED). Next wave’s.',
  },
  'stage-5-credentials': {
    kind: 'dropdown',
    carried: [],
    dropdown: ['predictive-balanced'],
    why:
      'A named dropdown breach: predictive-balanced clears it picked by name, beside its parked-stay ' +
      'variant, which no earlier stage has. The demand that closes the dropdown also closes the stage ' +
      '(campaign/difficultyCurve.test.ts#DROPDOWN_CLEARS).',
  },
  'stage-6-the-tall-one': {
    kind: 'carried',
    carried: ['capacity-aware-parked-zone-center', 'collective-parked-zone-center'],
    dropdown: [],
    why: 'Two of its three ways through are stage 1’s mid-zone parking. Next wave’s.',
  },
  'stage-8-the-headline-address': {
    kind: 'carried',
    carried: ['capacity-aware-parked-lobby', 'eta-parked-lobby', 'fairness-first-parked-lobby'],
    dropdown: [],
    why:
      'Three of its six ways through are stage 2’s lobby parking. Measured at forty-one demands and not ' +
      'rebalanced: the two that pass do so only through the holdout (§ D1426).',
  },
  'stage-9-both-ways-at-once': {
    kind: 'dropdown',
    carried: [],
    dropdown: ['auction', 'auction-multi-round', 'destination-panel'],
    why:
      'A named dropdown breach, owner-reversible (§ D1288): three of its four ways through are shipped ' +
      'profiles picked by name, at the demand that let it be judged at all. The fourth, destination-panel ' +
      'parked at predicted demand, arrived with the census regenerated on the engine § D1603 fixed (§ D1607).',
  },
  'stage-10-the-bed-and-the-visitor': {
    kind: 'no-way-through',
    carried: [],
    dropdown: [],
    why: 'Held, its cause recorded (§ D1289): the credential gap counted as censoring.',
  },
});

let table: PublishedSurvivors;
let profileIds: ReadonlySet<string>;

beforeAll(async () => {
  table = JSON.parse(await readFile(SCENARIO_SURVIVORS_PATH, 'utf8')) as PublishedSurvivors;
  const profiles = JSON.parse(await readFile(join(DATA_DIR, 'dispatcher-profiles.json'), 'utf8')) as {
    readonly profiles: readonly { readonly id: string }[];
  };
  profileIds = new Set(profiles.profiles.map((profile) => profile.id));
}, 60_000);

/** The base rung's survivor names, the only rung these stages are played at. */
function baseNamesOf(scenario: PublishedSurvivorScenario): readonly string[] {
  const base = scenario.steps.find((step) => step.stepId === null);
  if (base === undefined) throw new Error(`${scenario.id} has no base rung`);
  return base.survivorNames;
}

/** A drawn dial survivor: its name is a position in one cell's draw, not a configuration. */
function isDrawnDial(name: string): boolean {
  return /^edit-\d+$/u.test(name);
}

/**
 * **What DC-12 finds on a census**, keyed by stage id, for every stage from
 * {@link FIRST_BOUND_POSITION} that breaks it. Pure, so the controls below can hand it mutations of
 * the real table.
 */
function carriedAnswersIn(
  scenarios: readonly PublishedSurvivorScenario[],
  shippedProfileIds: ReadonlySet<string>,
): Readonly<Record<string, CarriedAnswerRow>> {
  const ordered = [...scenarios].sort((a, b) => a.ladderPosition - b.ladderPosition);
  const earlier = new Set<string>();
  const found: Record<string, CarriedAnswerRow> = {};
  for (const scenario of ordered) {
    const names = baseNamesOf(scenario);
    if (scenario.ladderPosition >= FIRST_BOUND_POSITION) {
      const carried = names.filter((name) => !isDrawnDial(name) && earlier.has(name)).sort();
      const dropdown = names.filter((name) => shippedProfileIds.has(name)).sort();
      const kind: CarriedAnswerKind | undefined =
        names.length === 0 ? 'no-way-through' : carried.length > 0 ? 'carried' : dropdown.length > 0 ? 'dropdown' : undefined;
      if (kind !== undefined) found[scenario.id] = { kind, carried, dropdown };
    }
    for (const name of names) if (!isDrawnDial(name)) earlier.add(name);
  }
  return found;
}

/** The register without its prose, in the shape {@link carriedAnswersIn} returns. */
function registerAsFound(): Readonly<Record<string, CarriedAnswerRow>> {
  return Object.fromEntries(
    Object.entries(CARRIED_ANSWERS).map(([id, row]) => [
      id,
      { kind: row.kind, carried: [...row.carried].sort(), dropdown: [...row.dropdown].sort() },
    ]),
  );
}

/** A copy of `scenarios` (the real table by default) with one stage's base-rung survivors replaced. */
function withBaseNames(
  stageId: string,
  names: readonly string[],
  scenarios: readonly PublishedSurvivorScenario[] = table.scenarios,
): readonly PublishedSurvivorScenario[] {
  return scenarios.map((scenario) =>
    scenario.id !== stageId
      ? scenario
      : {
          ...scenario,
          steps: scenario.steps.map((step) =>
            step.stepId === null ? { ...step, survivors: names.length, survivorNames: [...names] } : step,
          ),
        },
  );
}

/** The real table's scenario at a path position. */
function atPosition(position: number): PublishedSurvivorScenario {
  const scenario = table.scenarios.find((entry) => entry.ladderPosition === position);
  if (scenario === undefined) throw new Error(`no scenario at position ${String(position)}`);
  return scenario;
}

describe('DC-12 — a carried answer does not clear, from path position 3 (§ D1424)', () => {
  it('the census breaks DC-12 at exactly the registered stages, in exactly the registered way', () => {
    expect(
      carriedAnswersIn(table.scenarios, profileIds),
      'a stage from position 3 carries an answer, clears from the dropdown or has no way through ' +
        'where the register does not say so, or a registered stage stopped breaking as registered. ' +
        'Rebalance the stage by demand or fabric and delete its row with the regenerated census; never ' +
        'edit the count.',
    ).toEqual(registerAsFound());
  });

  it('names only stages the campaign ships, each at position 3 or later', () => {
    const positions = new Map(table.scenarios.map((scenario) => [scenario.id, scenario.ladderPosition]));
    for (const id of Object.keys(CARRIED_ANSWERS)) {
      expect(positions.get(id), id).toBeGreaterThanOrEqual(FIRST_BOUND_POSITION);
    }
  });

  it('positions 1 and 2 are exempt, and the exemption is doing work on the shipped census', () => {
    const first = atPosition(1);
    const second = atPosition(2);
    /* The exemption is only exercised while one of the two would break the rule if it were bound. */
    const secondCarries = baseNamesOf(second).some((name) => baseNamesOf(first).includes(name));
    const firstHasPick = baseNamesOf(first).some((name) => profileIds.has(name));
    expect(secondCarries || firstHasPick).toBe(true);
    const found = carriedAnswersIn(table.scenarios, profileIds);
    expect(Object.keys(found)).not.toContain(first.id);
    expect(Object.keys(found)).not.toContain(second.id);
  });

  it('is red on a new carried answer: an earlier survivor copied into a later stage', () => {
    /* Stage 9 is registered for its dropdown picks; give it stage 2's first answer as well. */
    const nine = atPosition(9);
    const carriedName = baseNamesOf(atPosition(2))[0];
    if (carriedName === undefined) throw new Error('stage 2 names no way through');
    const found = carriedAnswersIn(withBaseNames(nine.id, [...baseNamesOf(nine), carriedName]), profileIds);
    expect(found[nine.id]?.kind).toBe('carried');
    expect(found[nine.id]?.carried).toEqual([carriedName]);
    expect(found).not.toEqual(registerAsFound());
  });

  it('is red on a registered stage that stops breaking: a stage given only a fresh answer', () => {
    const six = atPosition(6);
    const carried = carriedAnswersIn(table.scenarios, profileIds)[six.id]?.carried ?? [];
    expect(carried.length, 'stage 6 carries an answer on the shipped census').toBeGreaterThan(0);
    const fresh = baseNamesOf(six).filter((name) => !carried.includes(name));
    expect(fresh.length, 'stage 6 holds a survivor no earlier stage has').toBeGreaterThan(0);
    const found = carriedAnswersIn(withBaseNames(six.id, fresh), profileIds);
    expect(found[six.id]).toBeUndefined();
    expect(found).not.toEqual(registerAsFound());
  });

  it('never counts a drawn dial as carried, since edit-<n> on two stages is two vectors', () => {
    const six = atPosition(6);
    const seven = atPosition(7);
    const mutated = withBaseNames(six.id, [...baseNamesOf(six), 'edit-3'], withBaseNames(seven.id, ['edit-3']));
    const found = carriedAnswersIn(mutated, profileIds);
    expect(found[seven.id]).toBeUndefined();
  });

  it('reads a stage with no survivor as no way through, whatever came before it', () => {
    const found = carriedAnswersIn(table.scenarios, profileIds);
    for (const scenario of table.scenarios) {
      if (scenario.ladderPosition < FIRST_BOUND_POSITION) continue;
      if (baseNamesOf(scenario).length === 0) expect(found[scenario.id]?.kind, scenario.id).toBe('no-way-through');
    }
  });
});
