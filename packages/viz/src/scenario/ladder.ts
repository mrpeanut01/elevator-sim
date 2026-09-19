/**
 * **The ordered path through Scenario, as one reading of two shipped files** — `docs/38` § 2.1's
 * *"The ten campaign stages, each with its `teaches` line. They are the ordered path through the
 * mode."* GitHub issue **#364**'s missing half, [§ D649](../../../../DECISIONS.md).
 *
 * ## Why this module exists, and what it is **not**
 *
 * It is not a schema and it authors nothing. `data/campaign.json`'s stage record **is** the
 * scenario schema — `campaign/types.ts#CampaignStage` has carried `budget: ScenarioBudget` as a
 * required field, refused rather than defaulted, since GitHub issue #365 landed — and
 * `data/scenario-survivors.json` is the measured count against it. The two have never been read
 * together by anything a player can open, so the largest block of authored, priced, measured
 * content in the repository has been invisible from the front door. This function is that join and
 * nothing else.
 *
 * **Every field below is derived.** No count, no building, no budget figure and no difficulty
 * word is a literal here. A rebalance that moves `data/campaign.json` and regenerates
 * `data/scenario-survivors.json` moves these rows on the next load without an edit in this file,
 * which is the only arrangement that survives a rebalance landing in the same wave as the wiring.
 *
 * ## The offer decision, and the one thing it may not say
 *
 * `docs/38` § 2.1: *"**Zero is not a scenario** unless it declares itself a diagnosis."* So the
 * decision is derived from the measurement in one place:
 *
 * - base-rung `survivors ≥ 1`, or a declared `diagnosis` → **offered**;
 * - base-rung `survivors === 0` with `diagnosis: null` → **held**, listed with its count.
 *
 * A held stage is listed rather than hidden, because the ten stages *are* the ordered path and a
 * player who cannot see positions 2 and 4 cannot see that there is one. It is not drawn as a
 * control at all — GAMEPLAY § 20.12's rule that an unavailable thing is a row with a reason and
 * never a dead button.
 *
 * **And it may not call a held stage unwinnable**, which is the whole of the care this module
 * takes. `survivors.ts` is explicit that the two strata are different kinds of number: the
 * dropdown is a **census** — thirteen shipped profiles is a population, so a zero there is exact —
 * and the dials are a **sample** at every rung, drawn at `sampleSize` per cell.
 * {@link dialShareInterval} puts 0 of 12 at *about a quarter or fewer, with 95 % confidence*. So
 * the sentence a held row draws is *none of the ways tried got through*, never *there is no way
 * through*, and {@link survivorSentenceFor} — which already names `examined` before `survivors` so
 * a reader meets the denominator first — is reused verbatim rather than paraphrased. A second
 * sentence about the same count is a second authority on it.
 *
 * ## The rung this reads, said rather than assumed
 *
 * The **base** rung, always. `docs/38` § 2.1 asks that *"the scenario shows the count for the
 * budget the player actually has"*, and nothing in this build has bought a rung: the bought-budget
 * ladder is authored and priced and no surface spends a chime on it yet (the chimes panel says so
 * on its own face). Showing a bought rung's count beside a budget nobody has bought would be a
 * figure the player's own state does not support, which is `docs/22` non-goal 2. When a spend
 * surface ships, {@link scenarioLadderOf} takes the rung it has bought and this docstring is the
 * paragraph that changes.
 *
 * Pure. No DOM, no host, no `data/` read — the caller supplies both documents, exactly as
 * `scenario/survivors.ts#validatePublishedSurvivors` takes its context rather than fetching one.
 */

import { rungsOf, type ScenarioBudget } from './budget.js';
import {
  survivorSentenceFor,
  type PublishedSurvivorScenario,
  type PublishedSurvivorStep,
  type PublishedSurvivors,
} from './survivors.js';

/* -------------------------------------------------------------------------- *
 * The shape
 * -------------------------------------------------------------------------- */

/**
 * The half of `campaign/types.ts#CampaignStage` this reading needs.
 *
 * Structural rather than the nominal type, for `survivors.ts#SurvivorContext`'s stated reason: a
 * reading that names the whole stage would make `scenario/` depend on the campaign, when
 * `docs/38` § 2.1 makes the campaign **one of the schema's four authors** rather than the schema.
 * The eighteen fix cases and the six Engineer challenges join this ladder by satisfying this
 * interface, not by becoming stages.
 */
export interface LadderStage {
  readonly id: string;
  readonly name: string;
  readonly teaches: string;
  readonly brief: readonly string[];
  readonly building: string;
  readonly durationS: number;
  readonly replications: number;
  readonly budget: ScenarioBudget;
}

/** Whether a scenario is offered to play, and it is a reading of the measurement. */
export type ScenarioOffer = 'offered' | 'held';

/** One scenario on the ordered path, with its measured face. */
export interface ScenarioLadderRung {
  /** `data/campaign.json`'s stage id — the key every published table is joined by. */
  readonly id: string;
  /** 1-based position on the ordered path. The array's order **is** the order. */
  readonly position: number;
  readonly name: string;
  /** § 5.4's *"each stage adding exactly one concept"*, in the stage's own words. */
  readonly teaches: string;
  /** The stage's own first sentence. Authored, never derived. */
  readonly openingLine: string;
  readonly buildingId: string;
  /** How long a run is and how many of them stand behind the verdict. Derived. */
  readonly shape: string;
  /** What it opens on, what can be bought, and which rung the count below is taken at. */
  readonly budgetLine: string;
  /** {@link survivorSentenceFor} on the base rung, verbatim. The count in the player's words. */
  readonly waysThrough: string;
  readonly offer: ScenarioOffer;
  /** Why it is held. Present exactly when {@link offer} is `held`. */
  readonly heldReason: string | undefined;
  /** Where pressing it opens, and what a clear there does. Present exactly when it is offered. */
  readonly openNote: string | undefined;
}

/* -------------------------------------------------------------------------- *
 * The player's words
 * -------------------------------------------------------------------------- */

/**
 * Every sentence this reading writes. One place, so no screen invents a second.
 *
 * Deliberately small: the count's own sentence is {@link survivorSentenceFor}'s and is not restated
 * here. What is here is only what that sentence does not say — what a run is made of, what the
 * budget is, and what pressing the row does.
 */
export const SCENARIO_LADDER_COPY = Object.freeze({
  heading: 'The path',
  /** Drawn over the ladder. Says what the ordering is, since the rows carry no number a player set. */
  lede: 'Ten buildings in the order they are meant to be met, each one adding a single idea to the last.',
  /** A stage that is offered. It opens where the stages are played today. */
  openNote:
    'Opens on the Engineer surface, which is where the stages are played. Clearing one there banks no chimes and does not reach a career yet.',
  /** A stage held back. Never the word unwinnable — see the module docstring. */
  heldLead: 'Held back:',
  heldBody:
    'nothing that was tried at this budget got through. It is on the list because it is the next step on the path, and it is not offered to play until there is a way through it or it says outright that there is none.',
  /** The rung the count is taken at, on every row, because no surface spends a chime yet. */
  baseRungNote: 'Nothing here has bought a wider budget, so the count is the count at the budget it opens on.',
});

/* -------------------------------------------------------------------------- *
 * The reading
 * -------------------------------------------------------------------------- */

/** What a scenario ladder is read from: the ordered stages, and the measured table. */
export interface ScenarioLadderInput {
  /** In play order. The array's order **is** the ladder, as `Campaign.stages` already is. */
  readonly stages: readonly LadderStage[];
  readonly survivors: PublishedSurvivors;
}

/** The base rung of a published scenario — `stepId: null`, the budget it opens on. */
function baseStepOf(scenario: PublishedSurvivorScenario): PublishedSurvivorStep | undefined {
  return scenario.steps.find((step) => step.stepId === null);
}

/**
 * How long a run is and how many stand behind the verdict, in the player's units.
 *
 * Minutes where the duration divides into them and seconds otherwise, rather than a rounded figure:
 * a stage authored at 950 s would otherwise read *"16 min"* and no run in it would be 16 minutes
 * long. The unit named is **building time**, not real time, because the stage plays a recording
 * back at a speed the player picks and a bare *"15 min"* would be a claim about their evening.
 */
function shapeOf(stage: LadderStage): string {
  const minutes = stage.durationS / 60;
  const span = Number.isInteger(minutes)
    ? `${String(minutes)} min in the building`
    : `${String(stage.durationS)} s in the building`;
  return `${span} · ${String(stage.replications)} runs behind the verdict`;
}

/**
 * What the budget opens on, what chimes can buy, and which rung the count is taken at.
 *
 * Every figure is `rungsOf`'s, so a screen, this sentence and the survivor table cannot disagree
 * about what a player standing on a rung actually has — the reason that function exists.
 */
function budgetLineOf(budget: ScenarioBudget): string {
  const rungs = rungsOf(budget);
  const base = rungs[0]?.units ?? budget.startingUnits;
  const opens = `Opens on ${String(base)} units of change.`;
  if (budget.steps.length === 0) {
    return `${opens} No wider budget is authored for it.`;
  }
  const bought = budget.steps
    .map((step) => `${step.name} (${String(step.chimes)} chimes)`)
    .join(', ');
  const ladder =
    budget.steps.length === 1
      ? `One wider budget can be bought: ${bought}.`
      : `${String(budget.steps.length)} wider budgets can be bought, in order: ${bought}.`;
  return `${opens} ${ladder} ${SCENARIO_LADDER_COPY.baseRungNote}`;
}

/**
 * The ordered path, joined from the stages and the measured table.
 *
 * A stage the table holds no row for is **dropped rather than drawn without a count**: a scenario
 * offered with no measured difficulty is the one thing `docs/38` § 2.1's whole definition is
 * against, and a row saying *we do not know* would be a fourth kind of answer nothing has ruled on.
 * `scenario/ladder.test.ts` asserts the shipped files leave none behind, so a dropped row is a
 * regeneration somebody owes rather than a state the player ever meets.
 */
export function scenarioLadderOf(input: ScenarioLadderInput): readonly ScenarioLadderRung[] {
  const byId = new Map(input.survivors.scenarios.map((scenario) => [scenario.id, scenario]));
  const out: ScenarioLadderRung[] = [];
  for (const [index, stage] of input.stages.entries()) {
    const scenario = byId.get(stage.id);
    if (scenario === undefined) continue;
    const base = baseStepOf(scenario);
    if (base === undefined) continue;

    /*
     * The offer, derived. `docs/38` § 2.1: zero is not a scenario unless it declares itself a
     * diagnosis — and a diagnosis is a scenario *saying* nothing gets through, which is a thing to
     * play rather than a thing to hide, so it is offered and its own sentence does the refusing
     * (`survivorSentenceFor` draws `diagnosisLead` in place of the count's verdict).
     */
    const offered = scenario.diagnosis !== null || base.survivors > 0;
    out.push(
      Object.freeze({
        id: stage.id,
        position: index + 1,
        name: stage.name,
        teaches: stage.teaches,
        openingLine: stage.brief[0] ?? '',
        buildingId: stage.building,
        shape: shapeOf(stage),
        budgetLine: budgetLineOf(stage.budget),
        waysThrough: survivorSentenceFor(scenario, base),
        offer: offered ? ('offered' as const) : ('held' as const),
        heldReason: offered
          ? undefined
          : `${SCENARIO_LADDER_COPY.heldLead} ${SCENARIO_LADDER_COPY.heldBody}`,
        openNote: offered ? SCENARIO_LADDER_COPY.openNote : undefined,
      }),
    );
  }
  return Object.freeze(out);
}

/**
 * How many of the path's scenarios are offered and how many are held — counts, never a share.
 *
 * `published.ts`'s rule, inherited by name: a stored rate drifts from its own counts, so the two
 * counts are published and the reader divides. The register sentence this feeds is the one place
 * the hub says *why* a listed row cannot be pressed, and it says it as a count of content rather
 * than as a judgement about the player.
 */
export function ladderOfferCounts(rungs: readonly ScenarioLadderRung[]): {
  readonly listed: number;
  readonly offered: number;
  readonly held: number;
} {
  const offered = rungs.filter((rung) => rung.offer === 'offered').length;
  return { listed: rungs.length, offered, held: rungs.length - offered };
}
