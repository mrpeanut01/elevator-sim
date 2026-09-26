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
 * ladder is authored and priced and **no surface in the product spends a chime on it**. Showing a
 * bought rung's count beside a budget nobody has bought would be a figure the player's own state
 * does not support, which is `docs/22` non-goal 2. When a spend surface ships,
 * {@link scenarioLadderOf} takes the rung it has bought and this docstring is the paragraph that
 * changes.
 *
 * ## The row says that itself, because no other surface can — [§ D786](../../../../DECISIONS.md)
 *
 * This paragraph used to end *"(the chimes panel says so on its own face)"* and that mitigation was
 * **false on the commit it was written on**. [§ D672](../../../../DECISIONS.md) deleted the panel's
 * blanket *"None of these can be bought yet"* in the same wave and replaced it with a reason per
 * **sink**, keyed by sink id — and a scenario's budget is not a sink and, by
 * `data/chime-ledger.json`'s own ruling, may never become one: the file refuses a
 * `scenario-budget-step` by name and `core/config/chimeLedger.ts#REFUSED_MODIFIER_KINDS` refuses
 * the modifier kind, because `data/campaign.json` already prices every rung and two authorities for
 * one price is a player paying a different amount depending on which screen they stand on. So
 * `everyday/chimesPanel.ts#SPEND_ABSENCES` **cannot** carry this — a row there would assert a sink
 * that does not exist and would fail that file's own both-directions check — and
 * `CHIMES_PANEL_COPY.spendNote` correctly says only that *nothing there* charges one, which sends
 * the reader here.
 *
 * Which leaves this module as the only surface that can say it, and until § D786 it said the
 * opposite: {@link budgetLineOf} drew *"2 wider budgets **can be bought**, in order: … (20 chimes),
 * … (30 chimes)"* on every row of the mode `docs/38` § 2.1 makes *"the only mode a first-time
 * player should meet"*, and the mitigating clause under it — *"Nothing **here** has bought a wider
 * budget"* — reads as *you have not saved up yet* rather than as *nobody can*. That is
 * [§ D227](../../../../DECISIONS.md) in both polarities at once, on the first screen of the first
 * mode, and it shipped in `dist-web`.
 *
 * **The prices go and the ladder stays.** The rungs are real — `scenario/budgetReachesTheRun.test.ts`
 * drives `rungsOf` over the shipped stages and proves on the boarding identities that a change the
 * base rung cannot pay for is refused and the *same* change at the bought rung moves the run — so a
 * player is told how many wider budgets a stage has and what each widens, which is a fact about the
 * content. What is **not** drawn is the chime figure, because a price is an instruction to act and
 * there is no act: it is the only part of that sentence a player could have tried to use, and it is
 * the part that reads as an offer. Nothing in `data/campaign.json` moves; `pricing/spendWidensTheBudget.test.ts`
 * still reads the same prices off disk and still asserts the scenario is their one authority. When a
 * spend surface ships, {@link budgetLineOf} takes the prices back on that commit.
 *
 * **A spend surface has shipped and it is not this one** — GitHub issue #579,
 * [§ D911](../../../../DECISIONS.md). The fix-a-building screen sells a rung on *its* ladder out of
 * a device tally that needs no account and no server (`everyday/deviceChimes.ts`,
 * `fixit/budgetRungs.ts`), and `fixit/budgetRungReachesTheRun.test.ts` is the legs comparison that
 * earns it. **These ten stages are unaffected**: they are played on the Engineer surface, which has
 * no budget control at all, so there is still nothing here to buy and the prices stay off these
 * rows. What changed is one clause of {@link SCENARIO_LADDER_COPY.baseRungNote} — *these ten*
 * rather than *no screen in this build* — because the blanket half of that sentence stopped being
 * true.
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
  /** What it opens on, what sits above that, and which rung the count below is taken at — § D786. */
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
  /**
   * A stage that is offered. It opens **this** stage where the stages are played today.
   *
   * It read *"Opens on the Engineer surface"* while every row's press called
   * `shell.ts#enterEngineer()`, which takes no argument — so all three offered rows performed the
   * same swap and the player arrived with whatever stage the campaign picker was holding. The
   * sentence was true of the swap and said nothing false; it was the press that carried no
   * identity. [§ D787](../../../../DECISIONS.md) gives the press its stage, and this word changes
   * with it: *this stage*, singular, is now a claim about what the press does and is checked by
   * `everyday/scenarioScreen.test.ts` pressing three different rows and requiring three different
   * ids to arrive.
   */
  openNote:
    'Opens this stage in the fix-it editor, on its own building and at the budget it opens on. The first clear of it pays chimes and a second pays nothing. A clear unlocks nothing, because nothing on this path is locked: each stage is open, or held for the reason written on it.',
  /** A stage held back. Never the word unwinnable — see the module docstring. */
  heldLead: 'Held back:',
  /*
   * **The second sentence is not softening, it is the measurement.** The dial half of the count is
   * a sample of twelve, and a way through that only a small share of configurations reach is
   * missed by such a sample most of the time — measured, a cell whose true clearing share is about
   * 1.5 % reports zero roughly five times in six. A lane searching at k = 200 found three dial
   * witnesses on a stage whose published count at k = 12 is unchanged, which is that arithmetic
   * happening rather than a hypothetical. So the row says what a zero here is and is not.
   */
  heldBody:
    'The dials among them were a sample rather than everything there is, so a rare way through is missed here rather than ruled out. It is on the list because it is the next step on the path, and it is not offered to play until one is found or it says outright that there is none.',
  /**
   * **A stage whose count names ways through that its own admission check refuses** — § D1129
   * clause 3. The check's sentence follows it, so the reader meets the price and the budget rather
   * than a summary of them.
   */
  heldRefusedBody:
    'the ways through its count names are refused by the stage’s own admission check at the budget it opens on, so none of them is a press you could make. The first refusal:',
  /*
   * **The refusal, on every row that has a rung above its base** — § D786.
   *
   * It read *"Nothing here has bought a wider budget, so the count is the count at the budget it
   * opens on"*, under a sentence saying the wider budgets *can be bought*. Both halves were wrong
   * in the way § D227 names: the first is a promise nothing in the product can keep, and the second
   * reads as *you have not saved up yet* to the one reader it is drawn for. This says who cannot
   * sell it rather than who has not bought it, which is the difference between a refusal and a
   * price tag with no till. It stops being drawn on the commit that makes it false — see the module
   * docstring for what that commit has to contain.
   */
  /*
   * **Narrowed on the commit that made the blanket claim false** — GitHub issue #579, § D911,
   * § D227. It read *"No screen in this build sells a wider budget"*, exactly true until the
   * fix-a-building screen began selling one out of the device tally. It is **still true of these
   * ten stages**: § D1129 moved them from the Engineer surface into the fix-it editor, and the
   * stage page there plays every press at the base rung and draws no budget control, so there is
   * still nowhere for a bought rung to be spent.
   * Saying *these ten* rather than *no screen* is the difference between a refusal a reader can
   * check and one that has quietly stopped being true somewhere else.
   */
  baseRungNote:
    'Nothing sells a wider budget for these ten, so the count below is the count at the budget it opens on.',
});

/* -------------------------------------------------------------------------- *
 * The reading
 * -------------------------------------------------------------------------- */

/** What a scenario ladder is read from: the ordered stages, and the measured table. */
export interface ScenarioLadderInput {
  /** In play order. The array's order **is** the ladder, as `Campaign.stages` already is. */
  readonly stages: readonly LadderStage[];
  readonly survivors: PublishedSurvivors;
  /**
   * **Why a named way through is refused by the stage's own admission check**, or `undefined` —
   * `campaign/stagePress.ts#routeRefusalsOf`, [§ D1129](../../../../DECISIONS.md) clause 3.
   *
   * A stage whose count names ways through, **every one** of which the check refuses, is held with
   * the first refusal as its reason, because offering it would advertise a route no press can make.
   * Absent answers nothing, which is how a caller holding no search space reads the table as it is.
   */
  readonly refusalOf?: ((stageId: string, routeName: string) => string | undefined) | undefined;
}

/**
 * **Which half of the judge stopped a held stage**, as a count off its base rung — [§ D1183](../../../../DECISIONS.md).
 *
 * A clear needs the stage's own crowds and then the crowds held back, so a stage nothing clears is
 * held for one of two measured reasons, and the row says which: some of what was tried met every
 * goal on the stage's own crowds and none of those held on the others, or nothing tried met every
 * goal even on the stage's own crowds. Both are counts over `examined`, named with it, and neither
 * says a way through does not exist.
 */
function heldMeasurementOf(step: PublishedSurvivorStep): string {
  const tried = `${String(step.examined)} ${step.examined === 1 ? 'way' : 'ways'} tried at this budget`;
  if (step.metOnTuning > 0) {
    return (
      `${String(step.metOnTuning)} of the ${tried} met every goal on the stage’s own crowds, ` +
      'and none of them met every goal again on the crowds held back.'
    );
  }
  return `None of the ${tried} met every goal even on the stage’s own crowds.`;
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
 * What the budget opens on, what sits above it, and which rung the count is taken at.
 *
 * Every figure is `rungsOf`'s, so a screen, this sentence and the survivor table cannot disagree
 * about what a player standing on a rung actually has — the reason that function exists.
 *
 * **No chime price is drawn and that is § D786 rather than an omission.** The rungs' prices are
 * authored in `data/campaign.json` and read by `scenario/budget.ts#rungsOf`,
 * `scenario/budgetReachesTheRun.test.ts` and `pricing/spendWidensTheBudget.test.ts`; what no module
 * in the product does is charge one. A price on a row a player cannot buy from is the only part of
 * this sentence they could act on, so it is the part that goes while nothing sells it. What each
 * rung *widens* stays, because that is a fact about the stage. `ladder.test.ts` asserts both
 * halves, in both directions.
 */
function budgetLineOf(budget: ScenarioBudget): string {
  const rungs = rungsOf(budget);
  const base = rungs[0]?.units ?? budget.startingUnits;
  const opens = `Opens on ${String(base)} units of change.`;
  if (budget.steps.length === 0) {
    return `${opens} No wider budget is authored for it.`;
  }
  const named = budget.steps.map((step) => step.name).join(', ');
  const ladder =
    budget.steps.length === 1
      ? `One wider budget sits above it: ${named}.`
      : `${String(budget.steps.length)} wider budgets sit above it, in order: ${named}.`;
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
    const counted = scenario.diagnosis !== null || base.survivors > 0;
    /*
     * § D1129 clause 3: a count is a way through only if a press is admitted to it. The census now
     * asks the same check, so on a table regenerated since then no named route is refused; this is
     * for a table that has aged under a moved price, profile or stage.
     */
    const refusals = base.survivorNames.map((name) => input.refusalOf?.(stage.id, name));
    const allRefused =
      scenario.diagnosis === null && refusals.length > 0 && refusals.every((reason) => reason !== undefined);
    const offered = counted && !allRefused;
    const firstRefusal = refusals.find((reason) => reason !== undefined);
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
          : allRefused
            ? `${SCENARIO_LADDER_COPY.heldLead} ${SCENARIO_LADDER_COPY.heldRefusedBody} ${firstRefusal ?? ''}`.trim()
            : `${SCENARIO_LADDER_COPY.heldLead} ${heldMeasurementOf(base)} ${SCENARIO_LADDER_COPY.heldBody}`,
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
