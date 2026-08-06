/**
 * The stage briefing — the authored sentences, plus the facts R12 says belong in a brief rather
 * than on a scoreboard.
 *
 * ## Why half of a brief is derived
 *
 * **R12**: *"A pass rate of 0 or 1 makes it a statement about the configuration — state it in the
 * brief instead."* Nineteen of the thirty-five measured (goal × stage) cells landed there, and
 * they are genuinely worth telling: on Mixed-Use High-Rise **nobody** is delivered on any of fifty
 * runs, and a player who is not told that will spend the stage trying to move it. But they are
 * facts about the building, so they are read out of `data/scenario-goals.json` at display time and
 * never transcribed into `data/campaign.json`. A number written down twice is a number that can
 * drift, and this repository has three of those on the record.
 *
 * The `withheld` bucket is read out too, for the reason W9 gives about the table itself: *"a kind
 * missing from the table is indistinguishable from a kind that passed."* The same holds one level
 * up. A brief that silently omitted `everyone-can-get-there` would read as a stage on which
 * everybody can get everywhere.
 */

import { editableIdsOf } from './parse.js';
import { playerSafeDescription } from './words.js';
import type { CampaignStage } from './types.js';
import { goalLabel } from '../scenario/goals.js';
import type { PublishedScenario } from '../scenario/published.js';
import { glossaryFor, type GlossaryTerm } from '../mode/glossary.js';

/** One editable dial, as the briefing lists it. */
export interface BriefedDimension {
  readonly id: string;
  /** The schema's own `description`, or `null` where the declaration carries none. */
  readonly help: string | null;
}

export interface StageBriefing {
  readonly stageId: string;
  readonly name: string;
  readonly teaches: string;
  /** The authored sentences, unchanged. */
  readonly sentences: readonly string[];
  /** What the run will be: building, demand, horizon, replications. Every one of them derived. */
  readonly configuration: string;
  /** R7 / invariant 5: the seed set, named, with the seed the whole batch replays from. */
  readonly seedNote: string;
  /** R12's constants, in the published table's own words. */
  readonly facts: readonly string[];
  /** What cannot be judged here at all, and why. Never omitted. */
  readonly withheld: readonly string[];
  /** What each goal will be judged on, before it is judged. */
  readonly goals: readonly string[];
  readonly editable: readonly BriefedDimension[];
  /**
   * The words the brief used, explained — issue #22.
   *
   * A brief is the one surface that says them **before** the run rather than after it: the seed
   * note names a holdout set, the goal lines name the kebab-case kinds, and the editable list is
   * a set of dimensions. Explaining them here is the cheapest place in the product to do it,
   * because the reader has not yet been handed a number to misread.
   */
  readonly glossary: readonly GlossaryTerm[];
}

export interface BriefingInput {
  readonly stage: CampaignStage;
  readonly published: PublishedScenario;
  /** Every declared dimension id — `collectSearchSpace().ids`. Resolves `every-declared-dimension`. */
  readonly dimensionIds: readonly string[];
  /** `SearchParameter.description` by id, so a dial is described in the schema's own words. */
  readonly dimensionHelp: ReadonlyMap<string, string>;
}

export function briefingFor(input: BriefingInput): StageBriefing {
  const { stage, published } = input;
  const demand =
    stage.traffic.arrivalRatePctPop5min === null
      ? "at the building's own traffic profile"
      : `at ${String(stage.traffic.arrivalRatePctPop5min)} % of population arriving per 5 minutes`;

  const briefing = {
    stageId: stage.id,
    name: stage.name,
    teaches: stage.teaches,
    sentences: stage.brief,
    configuration:
      `${published.name} · ${stage.building} ${demand} · ${String(stage.durationS)} s per run · ` +
      `${String(stage.replications)} runs per setting · starting on ${stage.dispatcher.startingProfileId}`,
    seedNote:
      `Seed ${stage.seeds.seed} (${stage.seeds.name}). Every run in this stage is ` +
      `replicationSeed(${stage.seeds.seed}, i), so this one number replays all ` +
      `${String(stage.replications)} of them. The holdout set ${stage.holdoutSeeds.name} ` +
      `(seed ${stage.holdoutSeeds.seed}) is disjoint from it and is what a gain has to survive.`,
    facts: published.configurationFacts.map((record) => record.reason),
    withheld: published.withheld.map((record) => record.reason),
    goals: stage.goals.map((spec) => {
      const record = published.goals.find((entry) => entry.kind === spec.kind);
      const counts = record?.tuning;
      if (counts === undefined || counts === null) {
        return `${goalLabel(spec)} — judged on the difference between the two settings, by a paired interval that has to exclude zero.`;
      }
      return (
        `${goalLabel(spec)} — judged over ${String(stage.replications)} runs. The shipped setting ` +
        `passed ${String(counts.passes)} of ${String(counts.n)} on these seeds, and that count is the bar.`
      );
    }),
    /*
     * R10 reaches the derived text too. `playerSafeDescription` replaces a schema description
     * that carries a probability word with the reason it is not being printed — one shipped
     * declaration does, and it would otherwise arrive here unread by any rule.
     */
    editable: editableIdsOf(stage.dispatcher.editable, input.dimensionIds).map((id) => ({
      id,
      help: playerSafeDescription(input.dimensionHelp.get(id)),
    })),
  } as const;

  return { ...briefing, glossary: glossaryFor(briefingText(briefing)) };
}

/**
 * Every string the briefing shows, for {@link glossaryFor} to read.
 *
 * The authored `sentences` are in it. A stage author writing *"watch what happens to the 95th-
 * percentile wait"* in `data/campaign.json` has used a word this vocabulary owns, and a glossary
 * that read only the derived half would explain the words the code wrote and not the words a
 * person did — which is the half a reader is most likely to meet first.
 */
function briefingText(briefing: Omit<StageBriefing, 'glossary'>): readonly string[] {
  return [
    briefing.teaches,
    ...briefing.sentences,
    briefing.configuration,
    briefing.seedNote,
    ...briefing.facts,
    ...briefing.withheld,
    ...briefing.goals,
    ...briefing.editable.map((dimension) => dimension.help ?? ''),
  ];
}
