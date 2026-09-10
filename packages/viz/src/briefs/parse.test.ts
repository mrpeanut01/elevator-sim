/**
 * The brief validator, and — the half that matters — **every refusal's premise checked against the
 * tree** rather than against the sentence beside it.
 *
 * A refusal that says *"this kind cannot reach a run"* is a claim about `packages/viz/src`, and
 * `CLAUDE.md` records what happens to claims nothing re-derives: three published figures that did
 * not reproduce, seven sites asserting a mechanism that measured the other way, and a traffic
 * editor that told readers a live control was dead for a whole wave. § D227 binds in both
 * directions and the dangerous direction is this one — a stale refusal tells the next reader not to
 * look. So each seam below is asserted from the code it names, and opens this file red on the day
 * somebody widens it.
 */

import { describe, expect, it } from 'vitest';

import { useBriefsFixture } from './briefs.test-helper.js';
import { BRIEF_KINDS, BRIEF_KIND_SEAM, parseEngineeringBriefs, type BriefKind } from './parse.js';
import type { SuiteField } from '../batch/suite.js';
import { batchRequestForStage } from '../campaign/stageRun.js';
import type { CampaignStage } from '../campaign/types.js';

const fixture = useBriefsFixture();

/** The entries as the file holds them, so a mutation is of the real document and not a fixture. */
function entries(raw: Record<string, unknown>): Record<string, unknown>[] {
  return raw['briefs'] as Record<string, unknown>[];
}

function parse(raw: Record<string, unknown>): void {
  parseEngineeringBriefs(raw, fixture.context);
}

describe('the shipped briefs load', () => {
  it('parses, and every brief is one of docs/21 § 4’s six kinds', () => {
    const kinds = fixture.briefs.briefs.map((brief) => brief.kind);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) expect(BRIEF_KINDS).toContain(kind);
    /* One brief per kind. A repeated kind would make the kind a category, not the challenge. */
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('ships only kinds whose seam is open, and the register says why the others are absent', () => {
    const shipped = new Set<BriefKind>(fixture.briefs.briefs.map((brief) => brief.kind));
    for (const kind of BRIEF_KINDS) {
      const seam = BRIEF_KIND_SEAM[kind];
      /*
       * Both directions. A kind with an open seam that ships nothing is content owed; a kind with a
       * closed seam that ships anyway is the inert control this whole module exists to refuse.
       */
      if (seam === null) expect(shipped.has(kind), `${kind} has no seam and ships nothing`).toBe(true);
      else expect(shipped.has(kind), `${kind} ships behind a closed seam`).toBe(false);
    }
    /* Non-vacuous: the register must actually be refusing something, or the loop proves nothing. */
    expect(BRIEF_KINDS.filter((kind) => BRIEF_KIND_SEAM[kind] !== null).length).toBeGreaterThan(0);
  });

  it('exposes the same objects as briefs and as scenarios, never two lists that can drift', () => {
    const asScenarios = fixture.briefs.asScenarios.stages;
    expect(asScenarios.length).toBe(fixture.briefs.briefs.length);
    for (const [index, brief] of fixture.briefs.briefs.entries()) {
      expect(brief.stage).toBe(asScenarios[index]);
    }
  });
});

describe('trip-wire one — a batch-judged bar must already be measured', () => {
  it('every brief has its own row in data/scenario-goals.json', () => {
    for (const brief of fixture.briefs.briefs) {
      const row = fixture.published.scenarios.find((entry) => entry.id === brief.stage.id);
      expect(row, brief.stage.id).toBeDefined();
    }
  });

  it('accounts for every row of the published table exactly once, across both authors', () => {
    /*
     * **The half `campaign/campaign.test.ts` can no longer ask alone**, moved here on the commit
     * that made it unaskable there. That case compared `data/campaign.json`'s stages with
     * `data/scenario-goals.json`'s rows as whole lists, and the equality was a real guard: a
     * measured row nobody ships is a run somebody paid for and no player can reach, and a row two
     * sources both claim is two bars under one id. The table has two authors now, so the check is
     * the union rather than one side of it — and it stays here, where the second author lives,
     * because `campaign/` importing `briefs/` would make the campaign know about a content source
     * it is not.
     */
    const campaignIds = fixture.campaignStageIds;
    const briefIds = fixture.briefs.briefs.map((brief) => brief.stage.id);
    expect(campaignIds.length).toBeGreaterThan(0);
    expect(briefIds.length).toBeGreaterThan(0);

    const authored = [...campaignIds, ...briefIds];
    /* Authored once: no id claimed by both sources, and none twice within a source. */
    expect(new Set(authored).size, 'a scenario id is authored twice').toBe(authored.length);
    /* And the two sets are the table, in the table's own order — the appended-not-interleaved rule. */
    expect(fixture.published.scenarios.map((scenario) => scenario.id)).toEqual(authored);
  });

  it('refuses a brief with no measured row — the trip-wire firing, on the real document', () => {
    const raw = fixture.rawClone();
    const first = entries(raw)[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    first['id'] = 'a-brief-nobody-measured';
    expect(() => {
      parse(raw);
    }).toThrow(/has no entry in the published goal table/);
  });

  it('refuses a brief whose demand does not match the row its bar was measured on', () => {
    const raw = fixture.rawClone();
    const first = entries(raw)[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const traffic = first['traffic'] as Record<string, unknown>;
    const measured = traffic['arrivalRatePctPop5min'];
    traffic['arrivalRatePctPop5min'] = measured === null ? 2.5 : null;
    /*
     * A pass rate is a property of one configuration. A brief run at a demand the table did not
     * measure would judge the player against a bar taken from a different crowd — which is exactly
     * the defect `campaign/parse.ts` refuses, reached through this file rather than around it.
     */
    expect(() => {
      parse(raw);
    }).toThrow();
  });
});

describe('trip-wire two — nothing here speaks of required n or a resolution limit', () => {
  /*
   * `docs/21` § 4: *"Anything speaking of required n or resolvable effects rides § 3.7's declared
   * new seam, with its caveat sentence, or does not speak of them."* This is the second half taken
   * deliberately. `compareCell`, `replicationsToResolve` and `smallestDetectableEffect` still have
   * no viz caller, so a brief quoting one would be building an export path through
   * `experiments/browser.ts` — and § 3.7 (2) requires Compare's own caveat to travel with the
   * figure. The absence is asserted rather than trusted, because the tempting sentence to write on
   * an engineering brief is *"you would need n ≈ 206 to resolve this"*.
   */
  const FORBIDDEN = [
    /\brequired\s+n\b/i,
    /\bn\s*[≈~]\s*\d/i,
    /\bresolution limit\b/i,
    /\bsmallest detectable\b/i,
    /\breplications to resolve\b/i,
    /*
     * **Narrowed by what it caught, and the correction is worth the line.** This read
     * `/\brun it again\b/i` and matched E5's *"Change whatever you like and run it again"* —
     * which is an instruction to change the configuration and re-run, the opposite of the act
     * § 3.7 (2) guards against. The shape that is forbidden is *running the same arms again until
     * the interval separates*, which is sequential testing and chooses the answer; `until` is what
     * makes it that sentence rather than the other one. A guard wide enough to ban ordinary
     * instructions gets relaxed by whoever hits it next, and then it bans nothing.
     */
    /\b(?:run|running|running it|re-?run)\s+(?:it\s+)?again\s+until\b/i,
  ];

  it('no authored brief string quotes one', () => {
    for (const brief of fixture.briefs.briefs) {
      const strings = [brief.stage.name, brief.stage.teaches, ...brief.stage.brief];
      for (const text of strings) {
        for (const pattern of FORBIDDEN) {
          expect(pattern.test(text), `${brief.stage.id}: "${text}"`).toBe(false);
        }
      }
    }
  });

  it('the guard fires — a brief that quoted one would be caught', () => {
    /* Positive controls for the case above: the patterns match the sentences they are written for. */
    const tempting = 'At this cell, n ≈ 206 would resolve an effect of this size.';
    expect(FORBIDDEN.some((pattern) => pattern.test(tempting))).toBe(true);
    /* Compare's own caveat names the act; a brief that invited it would be caught. */
    const sequential = 'Running it again until it separates chooses the answer.';
    expect(FORBIDDEN.some((pattern) => pattern.test(sequential))).toBe(true);
    /* And the sentence the narrowing was made for is not caught, which is the other direction. */
    expect(FORBIDDEN.some((pattern) => pattern.test('Change something and run it again.'))).toBe(
      false,
    );
  });
});

describe('the kind register refuses, and the sentences fire', () => {
  it('refuses a kind that is not one of the six', () => {
    const raw = fixture.rawClone();
    const first = entries(raw)[0];
    if (first === undefined) return;
    first['kind'] = 'leaderboard';
    expect(() => {
      parse(raw);
    }).toThrow(/is not one of docs\/21 § 4's six/);
  });

  it('refuses a brief with no kind at all', () => {
    const raw = fixture.rawClone();
    const first = entries(raw)[0];
    if (first === undefined) return;
    delete first['kind'];
    expect(() => {
      parse(raw);
    }).toThrow(/has no "kind"/);
  });

  it('refuses two briefs of one kind', () => {
    const raw = fixture.rawClone();
    const list = entries(raw);
    const first = list[0];
    if (first === undefined) return;
    const twin = JSON.parse(JSON.stringify(first)) as Record<string, unknown>;
    twin['id'] = `${String(first['id'])}-again`;
    list.push(twin);
    expect(() => {
      parse(raw);
    }).toThrow(/a second brief of kind/);
  });

  it('refuses every kind whose seam is closed, one at a time, naming the seam', () => {
    for (const kind of BRIEF_KINDS) {
      const seam = BRIEF_KIND_SEAM[kind];
      if (seam === null) continue;
      const raw = fixture.rawClone();
      const first = entries(raw)[0];
      if (first === undefined) return;
      first['kind'] = kind;
      let thrown: unknown;
      try {
        parse(raw);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, kind).toBeInstanceOf(Error);
      expect(String((thrown as Error).message), kind).toContain('cannot reach a scenario run');
      /* The seam itself, not a generic refusal: a reader is told which function to go and look at. */
      expect(String((thrown as Error).message), kind).toContain(seam.slice(0, 60));
    }
  });

  it('refuses a file that is not an object, and one with no briefs array', () => {
    expect(() => {
      parseEngineeringBriefs([], fixture.context);
    }).toThrow(/not a JSON object/);
    expect(() => {
      parseEngineeringBriefs({ briefs: 3 }, fixture.context);
    }).toThrow(/has no "briefs" array/);
  });
});

describe('each closed seam’s premise, derived from the tree rather than asserted', () => {
  function anyStage(): CampaignStage {
    const stage = fixture.briefs.briefs[0]?.stage;
    if (stage === undefined) throw new Error('no brief to build a request from');
    return stage;
  }

  it('commission and design-to-interval: the building is on the request, and an arm cannot move it', () => {
    /*
     * `batch/types.ts#BatchArmRequest`'s own argument: the dispatcher is *"the one field the
     * passenger trace is not a function of, so two arms may differ here and only here without
     * breaking CRN"*. Two arms on two buildings would be two populations. This is that, measured.
     */
    const stage = anyStage();
    const request = batchRequestForStage(stage, 'collective');
    expect(request.buildingId).toBe(stage.building);
    for (const arm of request.arms) {
      expect(Object.keys(arm).sort()).toEqual(
        expect.not.arrayContaining(['building', 'buildingId']),
      );
    }
    expect(BRIEF_KIND_SEAM['commission']).not.toBeNull();
    expect(BRIEF_KIND_SEAM['design-to-interval']).not.toBeNull();
  });

  it('trade-study: the widening docs/21 § 4 asks for has already landed, and the refusal says so', () => {
    /*
     * **The premise here is a correction, which is why it is checked rather than quoted.** § 4 names
     * E6's blocker as *"a typed change to `SuiteField`"*, widening the suite's field *"from
     * exactly-two to the brief's candidate list"*. That clause is stale: the field already takes a
     * list. Asserted by **construction** — a three-arm field has to typecheck for this file to
     * compile at all — because a runtime check cannot see a type, and the claim is about the type.
     */
    const field: SuiteField = [
      { armId: 'a', dispatcherProfileId: 'collective' },
      { armId: 'b', dispatcherProfileId: 'eta' },
      { armId: 'c', dispatcherProfileId: 'nearest-car' },
    ];
    expect(field).toHaveLength(3);
    /* And the refusal says the widening is not the blocker, rather than asking for it again. */
    expect(BRIEF_KIND_SEAM['trade-study']).toContain('is NOT the blocker');
    /* A scenario run stays two arms, which is the half that is still true and still relevant. */
    expect(batchRequestForStage(anyStage(), 'collective').arms).toHaveLength(2);
  });

  it('what-moved: every published goals bucket carries beat-the-baseline, so no brief is goal-less', () => {
    /*
     * E4 declares no goal — its verdict is binary. `campaign/parse.ts` requires a stage to declare
     * every kind in its published `goals` bucket, and this asserts the premise that makes that
     * fatal: the bucket is never empty on any scenario the product ships.
     */
    expect(fixture.published.scenarios.length).toBeGreaterThan(0);
    for (const scenario of fixture.published.scenarios) {
      expect(
        scenario.goals.map((goal) => goal.kind),
        scenario.id,
      ).toContain('beat-the-baseline');
    }
    expect(BRIEF_KIND_SEAM['what-moved']).not.toBeNull();
  });

  it('what-moved: a goal-less brief is refused by the scenario schema, with the kind named', () => {
    const raw = fixture.rawClone();
    const first = entries(raw)[0];
    if (first === undefined) return;
    first['goals'] = [];
    expect(() => {
      parse(raw);
    }).toThrow(/beat-the-baseline/);
  });
});
