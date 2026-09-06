/**
 * The campaign, checked against the measurement it is built on — `docs/10` § 5, § 1 R2–R13.
 *
 * Five separable claims, each of which fails on its own:
 *
 * 1. **The shipped campaign parses**, against the shipped goal table, the shipped buildings, the
 *    shipped dispatcher profiles and the **discovered** search space. Nothing is mocked: a campaign
 *    validated against a fixture would prove a fixture is well formed.
 * 2. **No goal was authored.** Every stage's goal list is exactly its `goals` bucket in
 *    `data/scenario-goals.json` — subset because [§ D160](../../../../DECISIONS.md) forbids inventing
 *    one, superset because a measured goal quietly dropped looks like a goal nobody measured.
 * 3. **The guard fires.** Twelve mutations, applied to the **real** parsed campaign rather than to
 *    a hand-built object, for `goalRates.test.ts`'s stated reason.
 * 4. **The honesty rules hold on the strings a player actually reads** — the authored ones *and*
 *    the generated ones, over real batches on real buildings.
 * 5. **The bar reproduces.** The shipped setting is run as an arm of every judged batch, and its
 *    count is compared with the count the published table says it scored on those very seeds. This
 *    is the clause that catches a campaign quietly running a different configuration from the one
 *    its goals were measured on.
 *
 * ## Where the played stages went — GitHub issue #356
 *
 * Claims 1–3 and the load-time half of claim 4 are this file. **Claim 5 and the batch half of
 * claim 4 are the sibling files**, one per played stage, and the reason is a measurement rather
 * than taste: with every played stage in here this file was **33.34 % of the `viz` leg's serial
 * cost** (279.5 s of 838.4 s on 2026-09-05; 285.4 s of 897.1 s the morning it was split), and
 * vitest runs a file's cases in series, so the leg could not use more than three cores however many
 * it had. The shared apparatus — the loaded campaign and the play-a-stage path — is
 * `campaign.test-helper.ts`, so the split duplicates no setup; each file carries only the batch its
 * own cases read.
 *
 * | file | what it plays |
 * |---|---|
 * | `countGoalStage.test.ts` | the first stage that carries a count goal, derived — the bar reproduces, standing still clears nothing |
 * | `stageTwoEdited.test.ts` | stage 2 on an authored weight vector, both seed sets — W6 and the overfitting gate |
 * | `stageThreeOverwhelmed.test.ts` | stage 3 — Overwhelmed as a result, the refusal reaching the reader |
 * | `stageFourFront.test.ts` | stage 4 — the front, swept over every shipped profile |
 * | `stageFiveCredential.test.ts` | stage 5 — the credential named, the lockout cleared |
 * | `stageFiveClears.test.ts` | stage 5 — whether a stage can be won from the dropdown, swept over every shipped profile on both seed sets |
 * | `stageSixEscalators.test.ts` | stage 6 — three goals after the escalators, and no profile clears it |
 *
 * `documentation.test.ts`'s S5 check reads the `describe('stage N, played` titles off every file in
 * this directory, so a played stage added or removed still reaches `docs/22`'s charter cell.
 */

import { readFile, readdir } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { briefingFor } from './brief.js';
import { useCampaignFixture } from './campaign.test-helper.js';
import { admitProfile } from './dimensions.js';
import { batchRequestForStage, demonstrationConfigFor, stageReplicationSeed } from './stageRun.js';
import { editableIdsOf, parseCampaign, playerFacingStrings, validateCampaign } from './parse.js';
import { FAIL_STATES } from './types.js';
import { PROBABILITY_WORDS, playerSafeDescription, probabilityWordIn } from './words.js';
import { GOAL_READS, isPerReplicationGoal, type GoalKind } from '../scenario/goals.js';
import { validatePublishedGoalRates } from '../scenario/published.js';
import { requireBuilding } from '../fixtures.test-helper.js';

const fixture = useCampaignFixture();
const { stageAt, mutate, publishedFor, requireProfile, playStage, failStatesFor } = fixture;

/* -------------------------------------------------------------------------- *
 * 1 — the shipped campaign
 * -------------------------------------------------------------------------- */

describe('the shipped campaign', () => {
  it('parses against the shipped goal table, buildings, profiles and the discovered space', () => {
    expect(validateCampaign(fixture.campaign, fixture.context)).toEqual([]);
  });

  it('is one stage per measured scenario, in order', () => {
    // Derived from the goal table, which is the point: a stage without a measured pass rate is a
    // level shipped on a goal nobody has taken a rate of, and R12 forbids it. The length is checked
    // against the table rather than against a literal, which had been `7` and is now the campaign's
    // to grow.
    const { campaign, published } = fixture;
    expect(campaign.stages.map((stage) => stage.id)).toEqual(
      published.scenarios.map((scenario) => scenario.id),
    );
    expect(campaign.stages).toHaveLength(published.scenarios.length);
    expect(campaign.stages.length).toBeGreaterThanOrEqual(7);
  });

  it('starts from a goal table that is itself valid', () => {
    /* A campaign checked against a malformed table is checked against nothing. */
    expect(validatePublishedGoalRates(fixture.published)).toEqual([]);
  });

  it('names no dimension the search space does not declare, and never writes the list down', async () => {
    const { campaign, space } = fixture;
    const declared = new Set(space.ids);
    for (const stage of campaign.stages) {
      for (const id of editableIdsOf(stage.dispatcher.editable, space.ids)) {
        expect(declared.has(id), `${stage.id} offers ${id}`).toBe(true);
      }
    }
    /*
     * The other half of *"derive, never hard-code"*: no source file in `campaign/` may contain a
     * dimension id as a literal. `parse.ts` checks the data against the space; this checks the
     * code against the same rule, because a default written into a module would be exactly the
     * list this lane was told not to write.
     *
     * **The file list is read off the directory, not written here.** A hand-written list is the
     * shape `src/index.test.ts` had to fix in `experiments`: it covers the files that existed when
     * somebody wrote it, and the next module added to `campaign/` is the one nothing checks.
     *
     * `campaign.test-helper.ts` is in that list — it is a `.ts` and not a `.test.ts` — and is held
     * to the rule on purpose: the filter is the one this guard has always had, and a helper that
     * needed a dimension literal would be a helper carrying a test's subject. Stage 2's authored
     * vector stayed in `stageTwoEdited.test.ts` for exactly that reason.
     */
    const files = (await readdir(new URL('.', import.meta.url))).filter(
      (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
    );
    expect(files.length).toBeGreaterThan(4);
    for (const file of files) {
      const source = await readFile(new URL(file, import.meta.url), 'utf8');
      /*
       * Both comment forms are stripped, and the id is looked for **bare** rather than inside a
       * particular pair of quotes. The first draft matched `'weights.waitTime'` only, so a
       * double-quoted or backticked literal would have walked straight past a guard whose
       * assertions all still passed — § D159's fourth variant, in the guard rather than in the code.
       */
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const id of space.ids) {
        expect(code.includes(id), `${file} names the dimension ${id}`).toBe(false);
      }
    }
  });
});

describe('what running a stage is, on every stage', () => {
  it('puts the shipped setting first and everything the trace depends on on the request', () => {
    for (const stage of fixture.campaign.stages) {
      const request = batchRequestForStage(stage, 'nearest-car');
      expect(request.buildingId).toBe(stage.building);
      expect(request.seed).toBe(stage.seeds.seed);
      expect(request.durationS).toBe(stage.durationS);
      expect(request.replications).toBe(stage.replications);
      expect(request.arrivalRatePctPop5min).toBe(stage.traffic.arrivalRatePctPop5min);
      expect(request.arms[0]?.dispatcherProfileId).toBe(stage.dispatcher.startingProfileId);
      expect(request.arms[1]?.dispatcherProfileId).toBe('nearest-car');
    }
  });

  it('replays replication 0 at the same seed, horizon and demand — including the override', () => {
    /*
     * The demand-override branch fires on four of the seven stages and on none of the three whose
     * demonstration runs are asserted in the played-stage files, so without this the half of
     * `demonstrationConfigFor` that ships on stages 2, 4, 6 and 7 has no test at all. Asserted
     * over **every** stage rather than a chosen one, which is what makes that impossible again.
     *
     * `shippedRunConfig.test.ts` reads this file for the `onTimeout` assertion below, by text,
     * as the one pre-existing assertion about that property — it stays here, and stays worded so.
     */
    let withOverride = 0;
    const loaded = fixture.config;
    for (const stage of fixture.campaign.stages) {
      const config = demonstrationConfigFor({
        stage,
        building: requireBuilding(loaded, stage.building),
        dispatcherProfile: requireProfile(stage.dispatcher.startingProfileId),
        trafficProfiles: loaded.trafficProfiles,
        elevatorSpecs: loaded.elevatorSpecs,
        dispatcherProfiles: loaded.dispatcherProfiles,
      });
      expect(config.seed).toBe(stageReplicationSeed(stage, 0));
      expect(config.durationS).toBe(stage.durationS);
      expect(config.onTimeout).toBe('report');
      if (stage.traffic.arrivalRatePctPop5min === null) {
        expect(config.demand?.arrivalRatePctPop5min).toBeUndefined();
      } else {
        withOverride += 1;
        expect(config.demand?.arrivalRatePctPop5min).toBe(stage.traffic.arrivalRatePctPop5min);
      }
    }
    expect(withOverride).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — no goal was authored
 * -------------------------------------------------------------------------- */

describe('every shipped goal came from the measured table', () => {
  it('is a subset of this stage’s "goals" bucket — a goal cannot be added by hand', () => {
    for (const stage of fixture.campaign.stages) {
      const measured = new Set<GoalKind>(publishedFor(stage).goals.map((record) => record.kind));
      for (const goal of stage.goals) {
        expect(measured.has(goal.kind), `${stage.id} declares ${goal.kind}`).toBe(true);
      }
    }
  });

  it('is also a superset of it — a measured goal cannot be dropped by hand', () => {
    for (const stage of fixture.campaign.stages) {
      const measured = publishedFor(stage).goals.map((record) => record.kind).sort();
      expect([...stage.goals.map((goal) => goal.kind)].sort()).toEqual(measured);
    }
  });

  it('carries no goal whose disposition is anything but "batch" — R12 left no other category', () => {
    for (const stage of fixture.campaign.stages) {
      for (const record of publishedFor(stage).goals) {
        expect(record.disposition).toBe('batch');
      }
    }
  });

  it('reads no quantity R1 forbids a score to be computed from', () => {
    const forbidden = new Set(['awtS', 'wt95S', 'ttdMeanS']);
    for (const stage of fixture.campaign.stages) {
      for (const goal of stage.goals) {
        if (!isPerReplicationGoal(goal.kind)) continue;
        for (const metric of GOAL_READS[goal.kind]) {
          expect(forbidden.has(metric), `${stage.id}/${goal.kind} reads ${metric}`).toBe(false);
        }
      }
    }
  });

  it('states every constant in the brief instead, and withholds what cannot be judged', () => {
    const { space, dimensionHelp } = fixture;
    for (const stage of fixture.campaign.stages) {
      const entry = publishedFor(stage);
      const briefing = briefingFor({ stage, published: entry, dimensionIds: space.ids, dimensionHelp });
      expect(briefing.facts).toHaveLength(entry.configurationFacts.length);
      expect(briefing.withheld).toHaveLength(entry.withheld.length);
      /* `everyone-can-get-there` is published as withheld and must reach the reader as withheld. */
      expect(briefing.withheld.join(' ')).toContain('everyone-can-get-there');
    }
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — the guard fires
 * -------------------------------------------------------------------------- */

describe('the guard fires — negative controls, applied to the shipped campaign', () => {
  it('positive control: the unmutated campaign produces no violation at all', () => {
    expect(validateCampaign(fixture.clone(), fixture.context)).toEqual([]);
  });

  it('catches a goal invented by hand', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.goals as { kind: GoalKind; threshold: number | null }[]).push({
        kind: 'nobody-abandoned',
        threshold: null,
      });
    });
    expect(violations.join('\n')).toContain('is not in this stage\'s measured "goals" bucket');
  });

  it('catches a measured goal dropped by hand', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.goals as unknown[]).shift();
    });
    expect(violations.join('\n')).toContain('the measured table ships');
  });

  it('catches a threshold moved away from the one the rate was measured at', () => {
    const violations = mutate((mutated) => {
      for (const stage of mutated.stages) {
        for (const goal of stage.goals) {
          if (goal.kind === 'long-waits-under') (goal as { threshold: number }).threshold = 15;
        }
      }
    });
    expect(violations.join('\n')).toContain('A different threshold is a different measurement');
  });

  it('catches a stage run at a demand level its goals were not measured at', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[1];
      if (stage === undefined) return;
      (stage.traffic as { arrivalRatePctPop5min: number | null }).arrivalRatePctPop5min = 4;
    });
    expect(violations.join('\n')).toContain('and its goals were measured at');
  });

  it('catches a stage run on a different building from the one measured', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage as { building: string }).building = 'midtown-office';
    });
    expect(violations.join('\n')).toContain('A pass rate is a property of one configuration');
  });

  it('catches a stage started on a dispatcher the bar was not measured against', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.dispatcher as { startingProfileId: string }).startingProfileId = 'nearest-car';
    });
    expect(violations.join('\n')).toContain('the bar was set by a different arm');
  });

  it('catches an editable dimension the search space does not declare', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage?.dispatcher.editable.mode !== 'listed') return;
      (stage.dispatcher.editable.ids as string[]).push('weights.enthusiasm');
    });
    expect(violations.join('\n')).toContain('which the search space does not declare');
  });

  it('catches a lever pointing at a dial the stage does not open', () => {
    const { space } = fixture;
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      const outside = space.ids.find(
        (id) => !editableIdsOf(stage.dispatcher.editable, space.ids).includes(id),
      );
      if (outside === undefined) return;
      (stage.levers as Record<string, string | null>)['overwhelmed'] = outside;
    });
    expect(violations.join('\n')).toContain('does not let the player move');
  });

  it('catches a credential hint on a building with no credentials', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage?.dispatcher.editable.mode !== 'listed') return;
      const id = stage.dispatcher.editable.ids[0];
      (stage.levers as Record<string, string | null>)['locked-out'] = id ?? null;
    });
    expect(violations.join('\n')).toContain('declares no access-controlled floor');
  });

  it('catches a missing credential hint on a building that has them', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages.find((entry) => entry.building === 'secure-tower');
      if (stage === undefined) return;
      (stage.levers as Record<string, string | null>)['locked-out'] = null;
    });
    expect(violations.join('\n')).toContain('has no suggested lever');
  });

  it('catches a probability word in an authored brief — R10, at load time', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.brief as string[])[0] = 'A faster car is very likely to help here.';
    });
    expect(violations.join('\n')).toContain('R10');
    expect(violations.join('\n')).toContain('"likely"');
  });

  it('catches a holdout set that is not disjoint from the tuning set', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage.holdoutSeeds as { seed: string }).seed = stage.seeds.seed;
    });
    expect(violations.join('\n')).toContain('the holdout validates nothing');
  });

  it('catches a stage judged over fewer runs than the project budgets for', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage as { replications: number }).replications = 10;
    });
    expect(violations.join('\n')).toContain('CLAUDE.md budgets');
  });

  it('catches a stage whose goals were never measured at all', () => {
    const violations = mutate((mutated) => {
      const stage = mutated.stages[0];
      if (stage === undefined) return;
      (stage as { id: string }).id = 'stage-0-invented';
    });
    expect(violations.join('\n')).toContain('has no entry in the published goal table');
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — which dimensions the player may move, enforced
 * -------------------------------------------------------------------------- */

describe('a stage judges only the changes it offered', () => {
  it('admits a profile that stays inside the stage’s dials, and names what it moved', () => {
    const { space } = fixture;
    const stage = stageAt(0);
    const admission = admitProfile(
      space,
      requireProfile(stage.dispatcher.startingProfileId),
      requireProfile('nearest-car'),
      editableIdsOf(stage.dispatcher.editable, space.ids),
    );
    expect(admission.admissible).toBe(true);
    expect(admission.withinScope.map((moved) => moved.id)).toContain('weights.waitTime');
    expect(admission.sentence).toContain('weights.waitTime');
  });

  it('refuses one that moves a dial the stage did not open, and names the dial', () => {
    const { space } = fixture;
    const stage = stageAt(0);
    const admission = admitProfile(
      space,
      requireProfile(stage.dispatcher.startingProfileId),
      requireProfile('energy-aware'),
      editableIdsOf(stage.dispatcher.editable, space.ids),
    );
    expect(admission.admissible).toBe(false);
    expect(admission.outOfScope.length).toBeGreaterThan(0);
    expect(admission.sentence).toContain('this stage does not open');
  });

  it('reports an unchanged choice as the control it is', () => {
    const { space } = fixture;
    const stage = stageAt(0);
    const profile = requireProfile(stage.dispatcher.startingProfileId);
    const admission = admitProfile(space, profile, profile, editableIdsOf(stage.dispatcher.editable, space.ids));
    expect(admission.admissible).toBe(true);
    expect(admission.withinScope).toEqual([]);
    expect(admission.sentence).toContain('the control this surface is meant to survive');
  });

  it('opens every declared dimension on the stage that says so, without listing them', () => {
    const { campaign, space } = fixture;
    const stage = campaign.stages[6];
    expect(stage?.dispatcher.editable.mode).toBe('every-declared-dimension');
    expect(editableIdsOf(stage?.dispatcher.editable ?? { mode: 'listed', ids: [] }, space.ids)).toEqual(
      space.ids,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * 5 — the honesty rules, over real batches: see the played-stage files named above
 * -------------------------------------------------------------------------- */

describe('the decoder refuses rather than dropping', () => {
  it('throws on a structurally broken stage instead of quietly shipping six', () => {
    /*
     * `decodeStage` returns `undefined` for a stage it cannot read, and a dropped stage would
     * validate perfectly — the campaign would simply be one shorter, which is the silent shape
     * this repository keeps finding. `parseCampaign` composes the two passes so it cannot happen;
     * this is the assertion that composition is what ships.
     */
    const broken = JSON.parse(JSON.stringify(fixture.raw)) as { stages: Record<string, unknown>[] };
    delete broken.stages[0]?.['seeds'];
    expect(() => parseCampaign(broken, fixture.context)).toThrow(/seeds/);
  });
});

/* -------------------------------------------------------------------------- *
 * R10 over every string a player can read
 * -------------------------------------------------------------------------- */

describe('R10 — no probability word reaches a player-facing string', () => {
  it('holds over every authored string in data/campaign.json', () => {
    for (const stage of fixture.campaign.stages) {
      for (const [label, text] of playerFacingStrings(stage)) {
        expect(probabilityWordIn(text), `${stage.id} ${label}: ${text}`).toBeNull();
      }
    }
  });

  it('holds over every generated briefing sentence', () => {
    const { space, dimensionHelp } = fixture;
    for (const stage of fixture.campaign.stages) {
      const briefing = briefingFor({
        stage,
        published: publishedFor(stage),
        dimensionIds: space.ids,
        dimensionHelp,
      });
      const texts = [
        briefing.configuration,
        briefing.seedNote,
        ...briefing.sentences,
        ...briefing.facts,
        ...briefing.withheld,
        ...briefing.goals,
        ...briefing.editable.map((dimension) => dimension.help ?? ''),
      ];
      for (const text of texts) expect(probabilityWordIn(text), text).toBeNull();
    }
  });

  it('holds over every verdict and every fail-state sentence a played stage produces', () => {
    const stage = stageAt(0);
    const played = playStage(stage, 'nearest-car');
    const reports = failStatesFor(stage, played.result, 'nearest-car');
    const texts = [
      played.verdict.headline,
      ...played.verdict.goals.flatMap((goal) => [goal.sentence, goal.note]),
      ...reports.flatMap((report) => [report.frequency, report.sentence, report.diagnosis, report.lever]),
    ];
    for (const text of texts) expect(probabilityWordIn(text), text).toBeNull();
  }, 120_000);

  it('replaces a schema description that carries one, and passes a clean one through', () => {
    /*
     * Independent of whether `core`'s prose still contains the word: this pins the *filter*, so
     * the rule survives somebody rewriting `idle.predictorHorizonS`'s description, and it fails if
     * the filter is turned into an identity function.
     */
    expect(playerSafeDescription('Seconds a chosen weight set must be held.')).toBe(
      'Seconds a chosen weight set must be held.',
    );
    expect(playerSafeDescription(undefined)).toBeNull();
    const refused = playerSafeDescription('the horizon sets what "likely to appear soon" means');
    expect(refused).not.toBeNull();
    expect(refused).toContain('is not reproduced here');
    expect(probabilityWordIn(refused ?? '')).toBeNull();
  });

  it('positive control: the word list catches the sentences R10 names', () => {
    for (const banned of [
      'your setting is probably a bit better',
      'the new weights are very likely faster',
      'there is a 95 % chance the difference is real',
      'that outcome is unlikely on this building',
    ]) {
      expect(PROBABILITY_WORDS.test(banned), banned).toBe(true);
    }
  });

  it('is at least as strict as the two suites that already hold a copy of this rule', () => {
    /*
     * `batch/report.test.ts` and `scenario/goals.test.ts` each declare their own pattern. Rewriting
     * theirs to import this one would edit a landed lane's guard, which is how a guard's meaning
     * erodes without its assertions changing (§ D159). This pins the divergence instead: every
     * word those suites name must trip this list too.
     */
    for (const word of [
      'likely',
      'unlikely',
      'probably',
      'probability',
      'chance',
      'chances',
      'odds',
      'certainly',
      'certain',
      'maybe',
      'perhaps',
      'presumably',
      'plausible',
      'good bet',
      'fifty-fifty',
    ]) {
      expect(PROBABILITY_WORDS.test(`it is ${word} so`), word).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- *
 * The four fail states are all four, always
 * -------------------------------------------------------------------------- */

describe('the fail states', () => {
  it('are R4’s four, in R4’s order of preference, on every stage', () => {
    expect([...FAIL_STATES]).toEqual(['overwhelmed', 'abandoned', 'stranded', 'locked-out']);
    for (const stage of fixture.campaign.stages) {
      expect(Object.keys(stage.levers).sort()).toEqual([...FAIL_STATES].sort());
    }
  });
});
