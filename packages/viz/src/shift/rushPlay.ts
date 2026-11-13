/**
 * **What a rush card decides about a round, as the viewer reads it** — [§ D1636](../../../../DECISIONS.md).
 *
 * `core`'s `sim/rushCards.ts` owns the arithmetic and the server replays a posted sitting through it.
 * This module holds the viewer's copy of `data/rush-cards.json`, parsed once, and the two readings
 * the viewer needs: the play of a card on a building ({@link rushPlayOf}, read by
 * `everyday/rush.ts` and `everyday/host.ts`), and the card a run's own identity names
 * ({@link rushCardOfRun}, read by `dev/state.ts#shiftRunConfigOf`, which is how the incidents reach
 * every run built from a rush's state without a field of their own).
 *
 * It sits in `shift/` because `dev/state.ts` reads it and `dev/` may not import `everyday/`.
 */

import {
  RUSH_CLASSIC_CARD,
  RUSH_CLASSIC_LINE,
  RUSH_STREAM,
  parseRushCards,
  rushIncidentsOf,
  rushRoundLineOf,
  rushWaveModelOf,
  type ResolvedBuilding,
  type RushCard,
  type RushCards,
  type RushIncident,
  type RushRoundLine,
  type RushWaveModel,
} from '@elevator-sim/core/browser';

import rushCardsDocument from '../../../../data/rush-cards.json' with { type: 'json' };

/** `data/rush-cards.json`, checked at load. */
export const RUSH_CARDS: RushCards = parseRushCards(rushCardsDocument as unknown);

/** A card on a building: its model, the incidents of a round, and the line that round ends on. */
export interface RushPlay {
  readonly card: RushCard;
  readonly model: RushWaveModel;
  readonly incidents: readonly RushIncident[];
  readonly line: RushRoundLine;
}

/** The classic climb's play: no incidents, the standing line. */
export function rushClassicPlay(): RushPlay {
  const model = RUSH_CARDS.waveModels[0];
  if (model === undefined) throw new Error('rush-cards: no wave model');
  return { card: RUSH_CLASSIC_CARD, model, incidents: [], line: RUSH_CLASSIC_LINE };
}

/** The play of `card` on `building`. A card this build does not know plays as the classic climb. */
export function rushPlayOf(building: ResolvedBuilding, card: RushCard): RushPlay {
  const model = rushWaveModelOf(RUSH_CARDS, card);
  if (model === undefined) return rushClassicPlay();
  const incidents = rushIncidentsOf(RUSH_CARDS, building, card);
  return { card, model, incidents, line: rushRoundLineOf(RUSH_CARDS, card, incidents) };
}

/**
 * The card a run's identity names: the model whose template the run plays and the roll its seed is
 * past the rush's own. `undefined` for a template no wave model owns, which is every run that is not
 * a rush.
 */
export function rushCardOfRun(demandTemplateId: string | undefined, seed: bigint): RushCard | undefined {
  const model = RUSH_CARDS.waveModels.find((entry) => entry.templateId === demandTemplateId);
  if (model === undefined) return undefined;
  const roll = Number(seed - BigInt(RUSH_STREAM.seed));
  return Number.isSafeInteger(roll) && roll >= 0 ? { model: model.id, roll } : undefined;
}
