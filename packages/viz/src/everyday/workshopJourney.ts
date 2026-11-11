/**
 * **One call, start to finish** — the dispatcher workshop's editor, laid out as the journey a call
 * takes through the engine's own stages.
 *
 * `everyday/workshopScreen.ts` is the non-test caller of every export: it draws one card per
 * {@link JOURNEY_STAGES} entry, heads each with {@link journeyOf}'s sentence, and at the *Detailed*
 * and *Engineer* depths draws {@link STAGE_FAMILIES}' control blocks inside it.
 *
 * ## Why a journey
 *
 * The editor this replaces stacked five drawers — levers, terms, behaviour, switching, rules — and
 * under them a list headed *carried, and not drawn here*: the settings a dispatcher holds that the
 * page had no control for. A player could not tell from it what order anything happens in, and for
 * six families of setting could not change them at all.
 *
 * `core` already has the order. `CALL_STAGES` is the seven stages a call passes through, and
 * `dev/familyControls.ts#FAMILY_ORDER` is *"the order a call travels through the engine's stages"*.
 * So the page follows a call: how it is made, which cars may answer, what decides between them,
 * when that is decided, whether it can be changed, what happens at the landing, and what a car does
 * with nothing to do — and then, outside any one call, how the dispatcher changes over a day.
 *
 * ## Every card reads its setting back
 *
 * {@link journeyOf} writes one sentence per stage from the profile **as it would run** —
 * `core`'s `resolveDispatchConfig` over the profile a save would write — so a default nobody
 * authored is read back the same as a value somebody set, and the eight sentences together are the
 * dispatcher in plain words. They describe what it does and never how well: nothing here is a
 * paired-t interval.
 *
 * The sentences are authored here, and that is deliberate. They are not names for engine values
 * (§ 16 rule 11's table) but compositions over several of them — *until the doors open, at most 4
 * times* is three fields — and `core` has no sentence for a stage. Each is swept by the honesty
 * corpus over every shipped profile.
 */

import {
  resolveDispatchConfig,
  type DispatcherProfile,
  type ResolvedDispatchConfig,
} from '@elevator-sim/core/browser';

import type { DispatcherFamily as ControlFamily } from '../dev/familyControls.js';

import { prioritiesOf } from './workshopModel.js';

/** The eight cards, in the order a call meets them; the last is outside any one call. */
export const JOURNEY_STAGES = Object.freeze([
  'calling',
  'eligible',
  'priorities',
  'deciding',
  'rethinking',
  'landing',
  'idle',
  'day',
] as const);

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

/** How much of each card is open. One dispatcher at every depth: a depth is an order to read in. */
export const WORKSHOP_DEPTHS = Object.freeze(['simple', 'detailed', 'engineer'] as const);

export type WorkshopDepth = (typeof WORKSHOP_DEPTHS)[number];

/** Every sentence the journey authors about itself. */
export const JOURNEY_COPY = Object.freeze({
  heading: 'ONE CALL, START TO FINISH',
  hint:
    'Each card is one moment in a call’s life, in the order it happens. The sentence under a ' +
    'heading says what this dispatcher does there now.',
  depthLabel: 'HOW MUCH TO SHOW',
  depths: Object.freeze({ simple: 'Simple', detailed: 'Detailed', engineer: 'Engineer' }),
  depthNotes: Object.freeze({
    simple: 'The plain controls. Every other setting is still in force, and each card says what it is.',
    detailed: 'Every setting the simulator declares, with its range, in the card it belongs to.',
    engineer: 'Every setting, with the name the simulator knows it by and the function that reads it.',
  }),
  titles: Object.freeze({
    calling: 'How riders call',
    eligible: 'Which cars may answer',
    priorities: 'What matters most',
    deciding: 'When it decides',
    rethinking: 'Second thoughts',
    landing: 'At the landing',
    idle: 'When a car has nothing to do',
    day: 'As the day changes',
  }),
  /** Drawn in place of a sentence when the settings as they stand cannot be run. */
  unrunnable:
    'These settings cannot run together as they stand. Put back the control you moved last, or ' +
    'discard the changes.',
} as const);

/**
 * Which control families belong to which card.
 *
 * Total over `dev/familyControls.ts#FAMILY_ORDER` — `workshopJourney.test.ts` asserts every family
 * is in exactly one card — so a family added to the Engineer editor that no card claims fails a
 * test rather than going undrawn here, which is the *carried, and not drawn* list returning.
 */
export const STAGE_FAMILIES: Readonly<Record<JourneyStage, readonly ControlFamily[]>> = Object.freeze({
  calling: Object.freeze(['panel'] as const),
  eligible: Object.freeze(['constraints'] as const),
  priorities: Object.freeze(['normalization'] as const),
  deciding: Object.freeze(['timing', 'zoning', 'auction'] as const),
  rethinking: Object.freeze(['reassignment'] as const),
  landing: Object.freeze(['load', 'doors'] as const),
  idle: Object.freeze(['parking', 'forecast'] as const),
  day: Object.freeze([] as const),
});

/** One card's heading and sentence. */
export interface JourneyCard {
  readonly stage: JourneyStage;
  /** `1` to `7` for a stage of a call; `∞` for the card that is about the whole day. */
  readonly mark: string;
  readonly title: string;
  /** What this dispatcher does at this stage, as it would run. */
  readonly readback: string;
}

const percent = (fraction: number): string => `${String(Math.round(fraction * 100))} %`;
const times = (count: number): string => (count === 1 ? 'once' : `${String(count)} times`);
const seconds = (value: number): string => `${String(Number(value.toFixed(1)))} s`;

function callingOf(config: ResolvedDispatchConfig): string {
  if (config.dispatch.callType === 'up-down-buttons') {
    return 'Riders press up or down at the landing. Nobody knows where they are going until they board.';
  }
  return config.dispatch.passengerAssignment === 'panel'
    ? 'Riders give their floor before they board, and a panel at the landing tells each of them which car to take.'
    : 'Riders give their floor before they board. Any car that opens may take whoever fits.';
}

function eligibleOf(config: ResolvedDispatchConfig): string {
  const parts = [
    config.constraints.noDirectionReversal
      ? 'A car that would have to turn round is not offered the call.'
      : 'Any car may be offered the call.',
  ];
  if (config.eligibility.enRouteDiversion) parts.push('A moving car may stop for a landing on its way past.');
  if (config.eligibility.maxLoadFactorForAssignment < 1) {
    parts.push(
      `A car more than ${percent(config.eligibility.maxLoadFactorForAssignment)} full is given no new pickups.`,
    );
  }
  return parts.join(' ');
}

function prioritiesSentenceOf(profile: DispatcherProfile): string {
  const names = prioritiesOf(profile, 3).map((bar) => bar.name);
  const weighed = Object.values(profile.weights).filter((weight) => weight > 0).length;
  if (names.length === 0) return 'It weighs nothing, so every car scores the same and the first one is sent.';
  if (names.length === 1) return `It weighs one thing: ${names[0] ?? ''}.`;
  const lead = names.length === 2 ? `${names[0] ?? ''}, then ${names[1] ?? ''}` : `${names[0] ?? ''}, then ${names[1] ?? ''}, then ${names[2] ?? ''}`;
  const rest = weighed - names.length;
  return rest > 0
    ? `It weighs ${lead} most, and ${String(rest)} more after them.`
    : `It weighs ${lead}.`;
}

function decidingOf(config: ResolvedDispatchConfig, profile: DispatcherProfile): string {
  const parts = [
    config.dispatch.assignmentTiming === 'deferred'
      ? `It holds a call for ${seconds(config.dispatch.deferWindowS)} and decides the waiting calls together.`
      : 'It gives a call to a car the moment the call is made.',
  ];
  if (config.dispatch.assignmentMode === 'split-demand') {
    parts.push(
      `A landing with ${String(config.dispatch.splitThresholdPassengers)} or more waiting is split across cars.`,
    );
  }
  if (profile.auction?.aggregation === 'contract-net') {
    const rounds = profile.auction.rounds ?? 1;
    parts.push(
      rounds > 1
        ? `The cars bid for it over ${String(rounds)} rounds, and a car may take its bid back.`
        : 'The cars bid for it in one sealed round.',
    );
  }
  return parts.join(' ');
}

function rethinkingOf(config: ResolvedDispatchConfig): string {
  const budget = times(config.dispatch.maxReassignmentsPerCall);
  switch (config.dispatch.reassignmentPolicy) {
    case 'never':
      return 'Once a call has a car, it keeps that car.';
    case 'continuous':
      return `A call can be moved to a better car at any time, at most ${budget}.`;
    case 'until-commitment': {
      const until =
        config.dispatch.commitmentPoint === 'on-door-open'
          ? 'until the doors open'
          : config.dispatch.commitmentPoint === 'on-deceleration'
            ? 'until its car starts to slow for the floor'
            : 'only up to the moment it is assigned, which is no time at all';
      return `A call can be moved to a better car ${until}, at most ${budget}.`;
    }
  }
}

function landingOf(config: ResolvedDispatchConfig, profile: DispatcherProfile): string {
  const threshold = profile.answer?.bypassLoadThreshold;
  const parts = [
    threshold !== undefined && threshold < 1
      ? `A car more than ${percent(threshold)} full passes a landing call` +
        (config.answer.allowBypassIfSoleEligibleCar ? ', unless it is the only car that serves that floor.' : '.')
      : 'A car stops for every call it has been given, however full it is.',
  ];
  if (profile.answer?.dwellPolicy === 'adaptive') {
    parts.push(
      profile.answer.maxDwellS === undefined
        ? 'The doors stay open longer for a crowd.'
        : `The doors stay open longer for a crowd, up to ${seconds(profile.answer.maxDwellS)}.`,
    );
  }
  return parts.join(' ');
}

function idleOf(config: ResolvedDispatchConfig): string {
  switch (config.idle.parkingStrategy) {
    case 'stay':
      return 'An idle car stays where it last stopped.';
    case 'lobby':
      return 'An idle car goes down and waits at the lobby.';
    case 'zone-center':
      return 'An idle car waits in the middle of its own part of the tower.';
    case 'predicted-demand':
      return 'An idle car moves to where the next crowd is expected.';
    case 'fixed-floor':
      return `An idle car waits ${String(config.idle.parkingFloorIndex)} floors above the lobby.`;
  }
}

function dayOf(profile: DispatcherProfile): string {
  const policy = profile.selection?.policy ?? 'off';
  if (policy === 'rules') {
    const count = profile.rules?.rows?.length ?? 0;
    return count === 1
      ? 'It follows one rule of yours, and falls back to the settings above when the rule does not fit.'
      : `It follows ${String(count)} rules of yours, first match first, and falls back to the settings above when none fits.`;
  }
  return policy === 'off'
    ? 'One setting, all day. It does not watch the traffic.'
    : 'It watches the traffic and changes what it weighs when the pattern turns over.';
}

/**
 * The eight cards for a profile, each with what the dispatcher does there.
 *
 * `profile` is the document a save would write (`authoring/dispatcherShelf.ts#builtProfileOf`), so
 * a lever, a flag and a family control all change the sentence the moment they move. A combination
 * `core` refuses to resolve is said so on every card, in plain words, rather than read back as
 * though it would run.
 */
export function journeyOf(profile: DispatcherProfile): readonly JourneyCard[] {
  let config: ResolvedDispatchConfig | undefined;
  try {
    /*
     * Resolved without `selection` and `rules`. Under a switching policy the resolver also wants
     * the file-level pattern library, which is a fact about the run rather than about the seven
     * stage settings read here; the last card reads `selection` off the profile itself.
     */
    const { selection: _selection, rules: _rules, ...stages } = profile;
    config = resolveDispatchConfig(stages);
  } catch {
    /*
     * `core`'s own reason is deliberately not drawn. It is written for whoever reads a stack trace
     * — it names engine values and cites this repository's documents — and the honesty corpus
     * refused it on a player's screen the first time it was swept. The schema controls refuse an
     * edit with the schema's reason at the control; this sentence covers what is left.
     */
    config = undefined;
  }
  const sentenceOf = (stage: JourneyStage): string => {
    if (config === undefined) return JOURNEY_COPY.unrunnable;
    switch (stage) {
      case 'calling':
        return callingOf(config);
      case 'eligible':
        return eligibleOf(config);
      case 'priorities':
        return prioritiesSentenceOf(profile);
      case 'deciding':
        return decidingOf(config, profile);
      case 'rethinking':
        return rethinkingOf(config);
      case 'landing':
        return landingOf(config, profile);
      case 'idle':
        return idleOf(config);
      case 'day':
        return dayOf(profile);
    }
  };
  return Object.freeze(
    JOURNEY_STAGES.map((stage, index) =>
      Object.freeze({
        stage,
        mark: stage === 'day' ? '∞' : String(index + 1),
        title: JOURNEY_COPY.titles[stage],
        readback: sentenceOf(stage),
      }),
    ),
  );
}
