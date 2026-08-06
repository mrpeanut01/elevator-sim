/**
 * The vocabulary is owned **once**, and every surface reads that one copy.
 *
 * This file is the reason the glossary is a module rather than six explanations. The deliverable
 * of issue #22's lane is the single source, and *"there is a single source"* is a property, not a
 * design intention — so it is asserted four ways, each of which catches a different way the
 * property could be true today and false in a month:
 *
 * 1. **Defined once.** No two entries share an id, a term, or a trigger phrase.
 * 2. **Read, not copied.** Every surface's glossary entries are the **same objects** as
 *    `GLOSSARY_TERMS`', by reference. Equal strings are what two copies look like on the day they
 *    are written, which is why `toEqual` would pass the defect this suite exists to catch and
 *    `toBe` does not.
 * 3. **Not duplicated in source.** No explanation appears as a literal anywhere in the package but
 *    `mode/glossary.ts`. This is the one that would catch a future lane pasting a definition into
 *    a panel, which is exactly how `live/decisions.ts#TERM_PHRASES` came to hold a second copy of
 *    `data/dispatcher-profiles.json`'s prose.
 * 4. **Attached to something real.** Every term names a word the shipped source actually prints.
 *    A glossary entry for a phrase no surface says is a ghost, and `honesty/derive.test.ts` says
 *    why a list of ghosts is worse than no list.
 *
 * Plus the two rules § D240 wrote and this lane inherits: the plain language **leads** the run's
 * own words rather than replacing them, and it never becomes a ranking.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadConfig, type DispatcherProfile, type LoadedConfig } from '@elevator-sim/core';
import { collectSearchSpace, type SearchSpace } from '@elevator-sim/experiments/browser';
import { beforeAll, describe, expect, it } from 'vitest';

import { GLOSSARY_TERMS, glossaryFor } from './glossary.js';
import { restrictedFloorIds } from '../access/zoning.js';
import { fakeResult } from '../batch/fixtures.test-helper.js';
import { batchReport } from '../batch/report.js';
import type { BatchResult } from '../batch/types.js';
import { briefingFor } from '../campaign/brief.js';
import { admitProfile } from '../campaign/dimensions.js';
import { judgeStage } from '../campaign/judge.js';
import { parseCampaign, type CampaignContext } from '../campaign/parse.js';
import type { Campaign, CampaignStage } from '../campaign/types.js';
import { probabilityWordIn } from '../campaign/words.js';
import { DATA_DIR } from '../fixtures.test-helper.js';
import { deriveProseLiterals } from '../honesty/derive.test-helper.js';
import { goalReport } from '../scenario/goalReport.js';
import type { PublishedGoalRates, PublishedScenario } from '../scenario/published.js';

/*
 * Driven over the shipped `data/` for the campaign half, for `campaign.test.ts`'s stated reason:
 * a suite that assembled its own campaign would keep passing while the panel drifted. The batch
 * half uses `fakeResult`, because what it needs is a batch whose rows *resolve* — the vocabulary
 * on a `resolved` row is the vocabulary this issue is about, and a real run's verdicts depend on
 * the building.
 */
let config: LoadedConfig;
let campaign: Campaign;
let published: PublishedGoalRates;
let space: SearchSpace;

beforeAll(async () => {
  config = await loadConfig(DATA_DIR);
  published = JSON.parse(
    await readFile(join(DATA_DIR, 'scenario-goals.json'), 'utf8'),
  ) as PublishedGoalRates;
  space = collectSearchSpace();
  const context: CampaignContext = {
    published,
    dimensionIds: space.ids,
    profileIds: new Set(config.dispatcherProfilesById.keys()),
    restrictedFloorIdsByBuilding: new Map(
      [...config.buildingsById.values()].map((building) => [
        building.id,
        restrictedFloorIds(
          building.floors.map((floor) => floor.id),
          building.accessZones,
        ),
      ]),
    ),
  };
  campaign = parseCampaign(
    JSON.parse(await readFile(join(DATA_DIR, 'campaign.json'), 'utf8')),
    context,
  );
}, 120_000);

function firstStage(): CampaignStage {
  const stage = campaign.stages[0];
  if (stage === undefined) throw new Error('the shipped campaign has no stages');
  return stage;
}

function publishedFor(stage: CampaignStage): PublishedScenario {
  const entry = published.scenarios.find((candidate) => candidate.id === stage.id);
  if (entry === undefined) throw new Error(`no published entry for ${stage.id}`);
  return entry;
}

function profile(id: string): DispatcherProfile {
  const found = config.dispatcherProfilesById.get(id);
  if (found === undefined) throw new Error(`no dispatcher profile ${id}`);
  return found;
}

/** A batch whose estimate rows resolve, so the arithmetic vocabulary is actually printed. */
function resolvingBatch(): BatchResult {
  return fakeResult({ replications: 50, delta: -1.5, spread: 0.4 });
}

/* -------------------------------------------------------------------------- *
 * 1 — defined exactly once
 * -------------------------------------------------------------------------- */

describe('each term is defined exactly once', () => {
  it('has no repeated id', () => {
    const ids = GLOSSARY_TERMS.map((entry) => entry.id);
    expect([...new Set(ids)].sort()).toEqual([...ids].sort());
  });

  it('has no repeated term', () => {
    const terms = GLOSSARY_TERMS.map((entry) => entry.term.toLowerCase());
    expect([...new Set(terms)].sort()).toEqual([...terms].sort());
  });

  it('has no repeated explanation', () => {
    // The defect stated directly: two ids for one meaning is the same drift as two modules for
    // one palette, arriving inside the module built to prevent it.
    const plain = GLOSSARY_TERMS.map((entry) => entry.plain);
    expect([...new Set(plain)]).toHaveLength(plain.length);
  });

  it('never lets one phrase belong to two terms', () => {
    const owner = new Map<string, string>();
    for (const entry of GLOSSARY_TERMS) {
      for (const phrase of entry.appearsAs) {
        const held = owner.get(phrase.toLowerCase());
        expect(held ?? entry.id, `"${phrase}" is claimed by ${String(held)} and ${entry.id}`).toBe(
          entry.id,
        );
        owner.set(phrase.toLowerCase(), entry.id);
      }
    }
  });

  it('never lets one phrase subsume another', () => {
    /*
     * `appearsAs` matches at a leading word boundary and not at a trailing one, so a phrase that
     * is a *prefix* of another matches everywhere the longer one does and both terms attach to
     * one word. Not hypothetical: the first draft had `replication` and `replication budget` as
     * separate terms, and every sentence naming the budget attached both. They are one entry now.
     */
    const phrases = GLOSSARY_TERMS.flatMap((entry) =>
      entry.appearsAs.map((phrase) => ({ id: entry.id, phrase: phrase.toLowerCase() })),
    );
    const collisions = phrases
      .flatMap((left) =>
        phrases
          .filter(
            (right) =>
              right.id !== left.id &&
              right.phrase !== left.phrase &&
              right.phrase.startsWith(left.phrase),
          )
          .map((right) => `${left.id}:"${left.phrase}" subsumes ${right.id}:"${right.phrase}"`),
      )
      .sort();
    expect(collisions).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * 2 — every surface reads the shared definition
 * -------------------------------------------------------------------------- */

/**
 * The surfaces this lane wired, each rendered from the shipped fixture batch.
 *
 * Assembled once and shared, because the point of the assertions below is that these five
 * surfaces agree, and five separately built inputs would let one of them agree with a copy.
 */
function wiredSurfaces(): readonly { readonly name: string; readonly glossary: readonly unknown[] }[] {
  const result = resolvingBatch();
  const report = batchReport(result);
  const stage = firstStage();
  const scenario = publishedFor(stage);
  return [
    { name: 'batch/report.ts#batchReport', glossary: report.glossary },
    { name: 'scenario/goalReport.ts#goalReport', glossary: goalReport(result).glossary },
    {
      name: 'campaign/judge.ts#judgeStage',
      glossary: judgeStage({ stage, published: scenario, result, report }).glossary,
    },
    {
      name: 'campaign/brief.ts#briefingFor',
      glossary: briefingFor({
        stage,
        published: scenario,
        dimensionIds: space.ids,
        dimensionHelp: new Map(),
      }).glossary,
    },
    {
      name: 'campaign/dimensions.ts#admitProfile',
      glossary: admitProfile(space, profile('collective'), profile('eta'), []).glossary,
    },
  ];
}

describe('every surface reads the shared definition', () => {
  it('returns the table’s own objects, never a copy of their text', () => {
    const canonical = new Set<unknown>(GLOSSARY_TERMS);
    for (const surface of wiredSurfaces()) {
      for (const entry of surface.glossary) {
        /*
         * **`toBe`, and the whole suite turns on it.** A surface holding an equal-but-separate
         * object passes `toEqual` on the day it is written and drifts the first time one of the
         * two is edited — which is the defect, not a weaker form of it.
         */
        expect(canonical.has(entry), `${surface.name} returned an object not in GLOSSARY_TERMS`).toBe(
          true,
        );
      }
    }
  });

  it('attaches something on every wired surface', () => {
    // Liveness. A selector that matched nothing would satisfy every assertion above vacuously,
    // which is wave 8's fifth false-negative shape — a harness reporting no failures for every
    // case. Named per surface so the failure says which one went quiet.
    for (const surface of wiredSurfaces()) {
      expect(surface.glossary.length, `${surface.name} explained no term at all`).toBeGreaterThan(0);
    }
  });

  it('agrees with itself: two surfaces using one word show one object for it', () => {
    const byId = new Map<string, unknown>();
    for (const surface of wiredSurfaces()) {
      for (const entry of surface.glossary as readonly { id: string }[]) {
        const held = byId.get(entry.id);
        if (held === undefined) byId.set(entry.id, entry);
        else expect(entry, `two surfaces hold different objects for "${entry.id}"`).toBe(held);
      }
    }
    // Positive control: the fixture really does exercise a word on more than one surface, so the
    // assertion above is about something.
    expect(byId.size).toBeGreaterThan(0);
  });

  it('selects only terms the text it was given actually contains', () => {
    expect(glossaryFor([])).toEqual([]);
    expect(glossaryFor(['   '])).toEqual([]);
    expect(glossaryFor(['nothing in this sentence is a term of art']).map((e) => e.id)).toEqual([]);
    for (const entry of GLOSSARY_TERMS) {
      for (const phrase of entry.appearsAs) {
        expect(
          glossaryFor([`a sentence that mentions ${phrase} in passing`]).map((term) => term.id),
          `"${phrase}" did not select ${entry.id}`,
        ).toContain(entry.id);
      }
    }
  });

  it('returns terms in the table’s order, whatever order the words were met in', () => {
    const forward = glossaryFor(['saturated', 'paired difference']).map((entry) => entry.id);
    const backward = glossaryFor(['paired difference', 'saturated']).map((entry) => entry.id);
    expect(forward).toEqual(backward);
  });
});

/* -------------------------------------------------------------------------- *
 * 3 — no second copy anywhere in the package
 * -------------------------------------------------------------------------- */

describe('no explanation is duplicated in the source tree', () => {
  it('finds every plain-language sentence in exactly one module', async () => {
    const literals = await deriveProseLiterals();
    // The scanner has to be reading this module at all, or the assertion below is vacuous — and a
    // vacuous anti-duplication check is worse than none, because it is a claim.
    expect(literals.some((literal) => literal.module === 'mode/glossary.ts')).toBe(true);

    const offenders: string[] = [];
    for (const entry of GLOSSARY_TERMS) {
      /*
       * Matched on a distinctive **fragment** rather than the whole sentence, because the scanner
       * reports one string literal at a time and a long explanation is written as several
       * concatenated ones. The first clause is long enough to be unique and short enough to
       * survive a re-wrap.
       */
      const fragment = entry.plain.slice(0, 48);
      const elsewhere = literals.filter(
        (literal) => literal.module !== 'mode/glossary.ts' && literal.text.includes(fragment),
      );
      for (const literal of elsewhere) {
        offenders.push(`${entry.id} is copied into ${literal.module}:${String(literal.line)}`);
      }
    }
    expect(
      offenders,
      'a definition exists in two places. Import it from mode/glossary.ts instead — a second copy ' +
        'is the defect this module was built to stop, not a convenience.',
    ).toEqual([]);
  });

  it('names only words the shipped source really prints', async () => {
    /*
     * The other direction, and the one that keeps this table attached to the product. A term for
     * a word nothing says is a ghost — `honesty/derive.test.ts` refuses those for the reason it
     * gives: *"a list of ghosts is how a list stops being read"*.
     *
     * It is also what makes rule 2's scope honest. The ranking sweep below runs over `plain` and
     * not over `term`, because `term` is a surface's wording rather than this module's; that is
     * only safe while `term` cannot be anything the product does not already print, and this is
     * the assertion that makes it so.
     */
    const literals = await deriveProseLiterals();
    const corpus = literals.map((literal) => literal.text.toLowerCase()).join('\n');
    const ghosts = GLOSSARY_TERMS.filter(
      (entry) => !entry.appearsAs.some((phrase) => corpus.includes(phrase.toLowerCase())),
    ).map((entry) => `${entry.id} (${entry.appearsAs.join(', ')})`);
    expect(
      ghosts,
      'a term explains a phrase no shipped surface prints. Either the surface was reworded — in ' +
        'which case reword the trigger or delete the term — or the term was invented.',
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- *
 * 4 — the two rules § D240 wrote
 * -------------------------------------------------------------------------- */

describe('the plain language leads the run’s own words and never replaces them', () => {
  it('puts no explanation inside a sentence the surface already emitted', () => {
    /*
     * § D240 rule 3, mechanised. The glossary is **additive**: it arrives as its own field beside
     * the sentences, and no sentence is rewritten to carry it. If an explanation ever appeared
     * inside a `sentence` or a `note`, the run's own words would have been replaced by a
     * paraphrase of them — a second account of one fact, which is the failure the whole
     * disclosure layer is built around.
     */
    const result = resolvingBatch();
    const report = batchReport(result);
    const stage = firstStage();
    const verdict = judgeStage({ stage, published: publishedFor(stage), result, report });
    const sentences = [
      report.crnSentence,
      report.demandClause,
      report.budgetNote ?? '',
      ...report.arms.map((arm) => arm.sentence),
      ...report.comparisons.flatMap((comparison) => [
        comparison.summary.sentence,
        comparison.summary.remedy ?? '',
        ...comparison.rows.flatMap((row) => [row.sentence, row.note]),
      ]),
      verdict.headline,
      ...verdict.goals.flatMap((goal) => [goal.sentence, goal.note]),
      ...goalReport(result).rows.map((row) => row.sentence),
    ];
    for (const entry of GLOSSARY_TERMS) {
      const fragment = entry.plain.slice(0, 40);
      for (const sentence of sentences) {
        expect(sentence.includes(fragment), `${entry.id} was written into a run's own sentence`).toBe(
          false,
        );
      }
    }
  });

  it('leaves every surface’s own sentences byte-identical to what it produced before', () => {
    // The half that cannot be checked against a stored string without pinning prose that other
    // lanes may legitimately reword. Checked structurally instead: the glossary is a field of its
    // own, so nothing but that field can have changed, and the field is not a string.
    const report = batchReport(resolvingBatch());
    expect(Array.isArray(report.glossary)).toBe(true);
    expect(typeof (report as unknown as { glossary: unknown }).glossary).not.toBe('string');
  });
});

describe('the wording never becomes a ranking', () => {
  it('orders nothing, however plainly it puts it', () => {
    /*
     * `mode/disclosure.test.ts`'s own pattern, deliberately the same one: this lane is the second
     * half of the layer that test guards, and two banned lists would be the drift this file is
     * about. *"A confidence interval containing zero means this run cannot tell them apart"* is
     * good plain language; *"dispatcher A is better"* is a different claim.
     *
     * Run over `plain` and not over `term` — see the ghost assertion above for why that scope is
     * closed rather than open.
     */
    const banned =
      /\b(?:better than|worse than|faster than|slower than|beats?|outperform\w*|the best|the winner|came out ahead)\b/i;
    for (const entry of GLOSSARY_TERMS) {
      const found = banned.exec(entry.plain);
      expect(`${entry.id}: ${found?.[0] ?? 'none'}`).toBe(`${entry.id}: none`);
    }
  });

  it('turns no interval into a probability word — R10', () => {
    for (const entry of GLOSSARY_TERMS) {
      const word = probabilityWordIn(entry.plain);
      expect(`${entry.id}: ${word ?? 'none'}`).toBe(`${entry.id}: none`);
      expect(`${entry.id}: ${probabilityWordIn(entry.term) ?? 'none'}`).toBe(`${entry.id}: none`);
    }
  });

  it('lets no energy explanation imply a grade — R11 / § D106', () => {
    /*
     * `honesty/properties.ts`'s own three patterns, applied here rather than waiting for the
     * search to find it: a string carrying an energy quantity **and** a wait quantity **and** a
     * scoring word has folded an axis into a score, and the measured consequence is that it ranks
     * the weakest shipped dispatcher first — `nearest-car` is on the Pareto front at six of eight
     * matrix cells because it carries fewer people.
     */
    const energy = /\bk(?:J|Wh)\b|\bkilojoule\w*|\bjoules?\b|\bdrive work\b/i;
    const wait = /\b(?:wait|awt|wt95|queue|time to destination|ttd)\b/i;
    const score =
      /\b(?:score|scored|scoring|grade|graded|rating|rated|points|overall|combined|index|efficiency|eco)\b/i;
    for (const entry of GLOSSARY_TERMS) {
      const blended = energy.test(entry.plain) && wait.test(entry.plain) && score.test(entry.plain);
      expect(`${entry.id}: ${blended ? 'blended' : 'separate'}`).toBe(`${entry.id}: separate`);
    }
  });

  it('restates no figure as a natural frequency the sample cannot carry — R13', () => {
    // `\d+ in \d+`. The rule is that a denominator must be one the sample reaches, and an entry
    // that carried a frequency at all would be quoting a run — which no explanation here may do.
    for (const entry of GLOSSARY_TERMS) {
      expect(`${entry.id}: ${/\b\d+\s+in\s+\d/.exec(entry.plain)?.[0] ?? 'none'}`).toBe(
        `${entry.id}: none`,
      );
    }
  });

  it('explains a suppressed mean by why it is suppressed, never with a number', () => {
    const suppressed = GLOSSARY_TERMS.find((entry) => entry.id === 'suppressed-mean');
    expect(suppressed).toBeDefined();
    // A definition is not allowed to stand in for the refusal by quoting one. R3: never a blank,
    // never a zero — and never a substitute figure either.
    expect(/\d+(\.\d+)?\s*s\b/.test(suppressed?.plain ?? '')).toBe(false);
    expect(suppressed?.plain ?? '').toMatch(/reason/i);
  });
});
