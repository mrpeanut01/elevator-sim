/**
 * **§ 7.5's dock, as words** — the money-and-incident column beside the campaign stage. GitHub
 * issue #171, § D507.
 *
 * Pure, on `everyday/`'s founding split: the words are the model's and `stageScreen.ts` decides
 * which element they go in, so every sentence here reaches the honesty corpus through
 * `honesty/surfaces.ts`'s stage adapter and none of them is authored in a mount the sweep cannot
 * read. The design file's dock (`design.html` :1378–1433) is the layout; the figures under it are
 * `campaign/economy.ts`'s and never the prototype's.
 *
 * ## The three figures
 *
 * *on hand* is `purseOf`, the same purse the desk shows (§ 8.5: *"The dock and the desk read the
 * same purse"*). *if today clears* is `rateOnDay` for the tower's difficulty and day — what a
 * cleared day pays, which is the number the desk's options footer already prints. *spent today* is
 * `spentTodayUnits`, the answers paid for on this day and nothing else: a works booking made this
 * morning left the purse eight days before its nights (`economy.test.ts`), and folding it in here
 * would make the dock disagree with the month grid about when money left.
 *
 * ## The incident, and when it is live
 *
 * A breakdown is true of the run from its `atS`; before that second the dock shows the day as
 * quiet, because a caption about a red-tagged car over a picture in which every car is running is
 * the thing the honesty card exists to prevent. A coach party is known before the day starts and
 * is live from the first frame. Once the run's log carries an answer the options come down and the
 * footer changes to the design's second sentence, read off the record rather than latched.
 *
 * ## Refusals are sentences
 *
 * § 7.6's fourth rule at row scope, exactly as the stage's own arms do it: a row the purse cannot
 * afford stays visible, dimmed, and says what it is short by (§ 16 rule 6); a return the day would
 * end before says so; a second answer says the first stands. None of them is a bare disabled
 * button.
 */

import type { CampaignIncident, CampaignIncidentOption } from '../campaign/incidents.js';
import { answerChangeOf } from '../campaign/incidents.js';
import type { CampaignTower } from '../campaign/career.js';
import { CONTRACT_DAYS, DIFFICULTIES, dayIndexOf, purseOf, rateOnDay, spentTodayUnits } from '../campaign/economy.js';
import { clockAt } from '../live/timeline.js';

/** Every fixed string the dock draws. `honesty/surfaces.ts` iterates these generically. */
export const CAMPAIGN_DOCK_COPY = Object.freeze({
  onHand: 'on hand',
  ifTodayClears: 'if today clears',
  spentToday: 'spent today',
  happeningNow: 'HAPPENING NOW',
  quietHeading: 'NOTHING HAPPENING',
  quietNote: 'The building is running on the order you gave it this morning. If that changes, it appears here with a clock on it.',
  /** § 7.5's footer, verbatim. */
  footerOpen: 'Choose whenever you like — nothing changes until you do, and the day carries on without an answer.',
  /** § 7.5's footer once answered, verbatim. */
  footerAnswered: 'Maintenance is on it. Anything temporary reverts on its own when this closes.',
  answeredEyebrow: 'ANSWERED',
  /** Where the parking and the handover live, so the dock does not duplicate them as options. */
  otherLevers: 'Parking the cars and handing the day to another dispatcher are the arms under the stage.',
  optionsHint: 'options, with what each costs and when it takes effect',
  /*
   * `everyday/host.ts#answerIncident`'s refusals, authored here rather than in the façade so they
   * reach the corpus with the rest of the dock's words. Each is § 7.6's fourth rule at press scope.
   */
  refusedNoIncident: 'no incident is open on this day',
  refusedAnswered: 'the incident has been answered — one answer a day, stamped where it was given',
  refusedUnknownOption: 'that option is not one this incident offers',
  refusedNoRun: 'no day is running',
  refusedPurse: 'the purse refused it',
});

/** `everyday/host.ts#answerIncident`'s purse refusal, worded once with the figure in it. */
export function purseRefusalOf(units: number): string {
  return `${String(units)} u is more than this building has on hand`;
}

/** One radio row, worded. */
export interface CampaignDockOptionView {
  readonly id: string;
  readonly label: string;
  /** `free` · `3 u`, with § 16 rule 6's shortfall appended when the purse cannot cover it. */
  readonly cost: string;
  readonly when: string;
  readonly effect: string;
  readonly isDefault: boolean;
  /** Why this row cannot be pressed now, or `undefined` when it can. */
  readonly refusal: string | undefined;
}

export interface CampaignDockView {
  readonly buildingName: string;
  /** `day 6 of 20` — `CONTRACT_DAYS`'s, never a literal. */
  readonly dayLine: string;
  readonly figures: readonly { readonly value: string; readonly label: string }[];
  /** The block under HAPPENING NOW, or the quiet block. */
  readonly incident:
    | {
        readonly kind: 'quiet';
        readonly heading: string;
        readonly note: string;
      }
    | {
        readonly kind: 'open';
        readonly heading: string;
        /** The clock the incident became true at — `09:14`. */
        readonly clock: string;
        readonly title: string;
        readonly note: string;
        readonly options: readonly CampaignDockOptionView[];
        readonly footer: string;
      }
    | {
        readonly kind: 'answered';
        readonly heading: string;
        readonly clock: string;
        readonly title: string;
        /** The stamp the log carries — `09:14 · answered the incident — …`. */
        readonly stamp: string;
        readonly footer: string;
      };
  readonly otherLevers: string;
}

/** What {@link campaignDockViewOf} needs. */
export interface CampaignDockInput {
  readonly tower: CampaignTower;
  readonly buildingName: string;
  readonly incident: CampaignIncident | undefined;
  readonly runLengthS: number;
  /** The stage's playhead, in simulated seconds. */
  readonly simTimeS: number;
  readonly dayStartS?: number | undefined;
  /** The answer already on the run's log, if any — `live/interventions.ts`'s stamp for it. */
  readonly answeredStamp: string | undefined;
  /** Whether a run is on the stage at all — the options are refused without one. */
  readonly hasRun: boolean;
}

function units(value: number): string {
  return `${String(value)} u`;
}

function costOf(option: CampaignIncidentOption, purse: number): string {
  const base = option.units === 0 ? 'free' : units(option.units);
  return option.units <= purse ? base : `${base} · need ${String(option.units - purse)} more`;
}

function optionViewOf(
  incident: CampaignIncident,
  option: CampaignIncidentOption,
  input: CampaignDockInput,
  purse: number,
): CampaignDockOptionView {
  const refusal = !input.hasRun
    ? 'no day is running — nothing to answer yet'
    : option.units > purse
      ? purseRefusalOf(option.units)
      : (() => {
          const composed = answerChangeOf(incident, option, input.simTimeS, input.runLengthS);
          return composed.kind === 'refused' ? composed.reason : undefined;
        })();
  return {
    id: option.id,
    label: option.label,
    cost: costOf(option, purse),
    when: option.when,
    effect: option.effect,
    isDefault: option.isDefault === true,
    refusal,
  };
}

/** The dock, resolved for a tower, its day's incident and the playhead. */
export function campaignDockViewOf(input: CampaignDockInput): CampaignDockView {
  const { tower, incident } = input;
  const purse = purseOf(tower);
  const difficulty = DIFFICULTIES[tower.difficultyId];
  const figures = [
    { value: units(purse), label: CAMPAIGN_DOCK_COPY.onHand },
    { value: units(rateOnDay(difficulty, dayIndexOf(tower))), label: CAMPAIGN_DOCK_COPY.ifTodayClears },
    { value: units(spentTodayUnits(tower)), label: CAMPAIGN_DOCK_COPY.spentToday },
  ];
  const base = {
    buildingName: input.buildingName,
    dayLine: `day ${String(tower.day)} of ${String(CONTRACT_DAYS)}`,
    figures,
    otherLevers: CAMPAIGN_DOCK_COPY.otherLevers,
  };
  if (incident === undefined || input.simTimeS < incident.atS) {
    return {
      ...base,
      incident: { kind: 'quiet', heading: CAMPAIGN_DOCK_COPY.quietHeading, note: CAMPAIGN_DOCK_COPY.quietNote },
    };
  }
  const clock = clockAt(incident.atS, input.dayStartS);
  if (input.answeredStamp !== undefined) {
    return {
      ...base,
      incident: {
        kind: 'answered',
        heading: CAMPAIGN_DOCK_COPY.answeredEyebrow,
        clock,
        title: incident.title,
        stamp: input.answeredStamp,
        footer: CAMPAIGN_DOCK_COPY.footerAnswered,
      },
    };
  }
  return {
    ...base,
    incident: {
      kind: 'open',
      heading: CAMPAIGN_DOCK_COPY.happeningNow,
      clock,
      title: incident.title,
      note: incident.note,
      options: incident.options.map((option) => optionViewOf(incident, option, input, purse)),
      footer: CAMPAIGN_DOCK_COPY.footerOpen,
    },
  };
}

/** Every string a dock view draws, for the corpus and for the first-person sweep. */
export function campaignDockStrings(view: CampaignDockView): readonly string[] {
  const out: string[] = [view.buildingName, view.dayLine, view.otherLevers];
  for (const figure of view.figures) out.push(figure.value, figure.label);
  const block = view.incident;
  out.push(block.heading);
  if (block.kind === 'quiet') out.push(block.note);
  else {
    out.push(block.clock, block.title, block.footer);
    if (block.kind === 'open') {
      out.push(block.note);
      for (const option of block.options) {
        out.push(option.label, option.cost, option.when, option.effect);
        if (option.refusal !== undefined) out.push(option.refusal);
      }
    } else out.push(block.stamp);
  }
  return out;
}
