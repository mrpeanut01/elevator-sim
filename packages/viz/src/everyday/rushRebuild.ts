/**
 * **The rush rebuild between rounds, as a player meets it** — GitHub issue **#372**'s second
 * criterion, `docs/38` § 2.3's *"Rebuilds the building between rounds, from the same price schedule
 * as Scenario"*, [§ D1295](../../../../DECISIONS.md). Drawn by `everyday/reportScreen.ts` on the
 * rush's result, under the round that just ended and above the post block; the presses go to
 * `EverydayHost.pickRushRebuild`, and `EverydayHost.startRush` fits what was picked for the next round.
 *
 * ## What this module decides, and what it borrows
 *
 * It decides every sentence and every pressable/inert state of the menu, on `postRun.ts`'s split: the
 * screen owns the DOM, this owns the words, and a pure function is what lets the honesty corpus drive
 * every state without a document. **What it borrows is everything that has to agree with the server.**
 * The tiers, the fold, what a tier may add and whether it would change nothing are `core`'s
 * `config/rushRebuild.ts`, the same functions `packages/server`'s replay calls; the price is the
 * schedule's, through `core`'s `rushRebuildUnits`; and the purse is `core`'s `rushPurseRounds` over the
 * rounds this device recorded, the one derivation the server also reads.
 *
 * ## The purse is counted here now, and that moves § D606
 *
 * § D606 kept every purse figure out of this package: the one a player read was the server's reply to
 * their own post. That held while a purse bought nothing. A purse a player spends between rounds has
 * to be known **before** they post, so {@link rushPurseBeforeNextOf} counts it, with `core`'s function,
 * from the waves each round outlasted at its own hold moment (`core`'s `rushWavesOutlasted`, the reading
 * the server takes off its replay) and the price of each rebuild. **It is a count and never a claim**:
 * nothing it returns goes on the wire, the server derives the same figure from its own replay and refuses
 * a rebuild its purse could not pay for (`rebuild-over-purse`), and `rushHoldAgreement.json` pins this
 * device's hold moments to the server's. A board row still shows no purse (§ D543 clause 5).
 *
 * ## Why the menu says less than the shop does
 *
 * The career shop's tiers carry effect sentences (`campaign/economy.ts#SHOP`), and some of them claim a
 * gain — *the largest gain short of building*. On a rush that is not true of every tower, **and that is
 * measured** (wave AN lane AP-2's probe, `collective`, the rush's one seed): Doors 1 held Midtown Office
 * 44 s longer and Garden Apartments 100 s shorter, Control 3 held Garden 228 s shorter, and Control 1 and
 * Control 2 left every one of Garden's legs where they were. So a row here says what the tier fits, in
 * numbers read off `core`'s own table, and {@link RUSH_REBUILD_COPY.unmeasured} says once that what it
 * does to the next hold is not known until the round is played. The tier *names* are the shop's.
 *
 * Recorded under [§ D405](../../../../DECISIONS.md) where it binds only this module; the rebuild it
 * serves, the purse it counts and the boundary it moves are § D1295.
 */

import {
  RUSH_REBUILD_OFF_MENU,
  RUSH_REBUILD_TIERS,
  parseRushPurse,
  rushPurseOpeningUnits,
  rushPurseRounds,
  rushRebuildTierOf,
  rushRebuildUnits,
  rushTierChangesNothing,
  rushWavesOutlasted,
  type BuildingConfig,
  type ElevatorSpecs,
  type PriceSchedule,
  type RushFitDelta,
  type RushFitLevels,
  type RushRebuildTier,
  type RushPrefitClaim,
} from '@elevator-sim/core/browser';

import { SHOP, type ShopCategory } from '../campaign/economy.js';

/*
 * Named `rushPurseDocument` rather than `document`: `boundaries.test.ts` confines the DOM to the dev
 * entry point by looking for bare globals, and a binding called `document` is one.
 */
import rushPurseDocument from '../../../../data/rush-purse.json' with { type: 'json' };

import { CHIME_PRICES } from './chimesPanel.js';

/**
 * `data/rush-purse.json`, parsed at module init — bundled rather than fetched, on `chimesPanel.ts`'s
 * ground: the figure a screen counts with and the figure the server derives with cannot drift apart
 * between a deploy and a cache.
 */
export const RUSH_PURSE = parseRushPurse(rushPurseDocument);

/* -------------------------------------------------------------------------- *
 * The purse, counted the way the server derives it
 * -------------------------------------------------------------------------- */

/** One finished round, as the purse needs it: where it held, and what was bought before it. */
export interface RushPurseRoundInput {
  /** The recording's own hold moment, seconds from the round's start, or `null` when it never crossed. */
  readonly holdS: number | null;
  readonly rebuild?: readonly string[] | undefined;
}

/**
 * **What the purse holds for the next round** — the sitting's opening (what the listed top-ups the
 * account claims grant), plus what every round so far was paid, less what every rebuild took.
 *
 * `core`'s `rushPurseOpeningUnits` and `rushPurseRounds`, over this device's rounds; see the module
 * docstring for why this is counted here and why it is never sent. The opening reads the spend half of
 * the ledger, which is the only half this package binds (`chimesPanel.ts#CHIME_PRICES`).
 */
export function rushPurseBeforeNextOf(input: {
  readonly rounds: readonly RushPurseRoundInput[];
  readonly modifiers: readonly RushPrefitClaim[];
  readonly schedule: PriceSchedule;
}): number {
  const opening = rushPurseOpeningUnits(RUSH_PURSE, CHIME_PRICES, input.modifiers);
  const waves = input.rounds.map((round) => rushWavesOutlasted(round.holdS === null ? undefined : round.holdS, 0));
  const spends = input.rounds.map((round) => rushRebuildUnits(input.schedule, round.rebuild ?? []));
  return rushPurseRounds(RUSH_PURSE, opening, waves, spends).at(-1)?.purseAfterUnits ?? opening;
}

/**
 * **What a sitting may claim of the purse top-ups this account owns** — one claim per listed top-up
 * (`data/rush-purse.json#topUpSinkIds`, never a literal here), at the steps owned and no more than the
 * sink's own `maxSteps`, which is the most the server's `chimes/ledger.ts#unbackedModifiers` backs.
 *
 * GitHub issue #372's third criterion, [§ D1295](../../../../DECISIONS.md): a top-up widens the purse a
 * rebuild between rounds spends, so it reaches a run through what it pays for, and claiming it is no
 * longer a modifier that separated a player's runs and changed none of them.
 */
export function rushTopUpClaimsOf(
  owned: readonly { readonly sinkId: string; readonly steps: number }[],
): readonly { readonly sinkId: string; readonly steps: number }[] {
  return RUSH_PURSE.topUpSinkIds.flatMap((sinkId) => {
    const held = owned.filter((entry) => entry.sinkId === sinkId).reduce((total, entry) => total + entry.steps, 0);
    const cap = CHIME_PRICES.sinks.find((sink) => sink.id === sinkId)?.maxSteps ?? 0;
    const steps = Math.min(held, cap);
    return steps >= 1 ? [{ sinkId, steps }] : [];
  });
}

/* -------------------------------------------------------------------------- *
 * The words
 * -------------------------------------------------------------------------- */

/**
 * Every sentence the menu authors, frozen so the corpus sweeps all of them.
 *
 * The tier and category **names** are not here: they are the shop's (`campaign/economy.ts#SHOP`), so a
 * player meets one name for one purchase on either screen.
 */
export const RUSH_REBUILD_COPY = Object.freeze({
  eyebrow: 'REBUILD BEFORE THE NEXT ROUND',
  purse: (units: number): string => `${String(units)} ${units === 1 ? 'unit' : 'units'} in the purse for the next round.`,
  /**
   * How the figure above was reached and what a purchase does to the sitting — the owner's ruling that a
   * sitting is runs from an as-shipped start, and the swarm's default that a bought tier stays fitted.
   */
  purseNote:
    'Counted here from how many waves each round outlasted, the way the server counts it when you post ' +
    'the sitting. Whatever you buy stays fitted for every later round of this sitting, and the next ' +
    'sitting starts from the building as shipped.',
  /** The measured reason the rows say what a tier fits rather than what it is worth — see the module docstring. */
  unmeasured:
    'What a tier does to how long the next round holds is not known until you play it. On the towers ' +
    'measured, the same tier held longer on one, shorter on another, and changed nothing on a third.',
  fitted: 'Fitted for the rest of this sitting.',
  picked: 'Bought for the next round. Press it again to put the units back.',
  buy: (units: number): string => `Buy for ${String(units)} ${units === 1 ? 'unit' : 'units'}`,
  undo: 'Put it back',
  short: (units: number): string => `Short by ${String(units)} ${units === 1 ? 'unit' : 'units'}.`,
  /** `core`'s `rushTierChangesNothing` — the structural check, which is all this screen can know before a run. */
  changesNothing: 'Changes nothing on this tower: it would build the tower this sitting already has.',
  /** Shafts and Machines — refused by name, with the reason, which is what the ruling asked for. */
  needsCommissioning:
    'Not sold between rush rounds. It rebuilds how a whole bank is made, and the server that checks a ' +
    'posted sitting cannot build that, so a round played with it could not be ranked.',
  /** Tenants 2 and 3. */
  changesTheCrowd:
    'Not sold between rush rounds. It changes who arrives, and a rush board ranks sittings that met the ' +
    'same crowd.',
  pending: (units: number, left: number): string =>
    `This rebuild costs ${String(units)} ${units === 1 ? 'unit' : 'units'}, leaving ${String(left)} in the purse. ` +
    'Run the rush again to play the next round with it.',
  noneYet: 'Nothing bought for the next round yet.',
  /* What a tier fits, from `core`'s own numbers. Each fragment is a clause of one line. */
  fitsDoors: (seconds: number): string => `${String(seconds)} s off every door cycle`,
  fitsHallDwell: (seconds: number): string => `${String(seconds)} s off the time doors stand open at a landing`,
  fitsZones: 'the cars worked as zones',
  fitsDestination: 'passengers give their floor in the lobby, and the dispatcher weighs ride time',
  fitsPanel: 'the lobby panel names each passenger’s car',
  fitsCars: (persons: number): string => `cars rated for ${String(persons)} people where they are smaller and their class allows it`,
  fitsBoarding: (seconds: number): string => `boarding no slower than ${String(seconds)} s a person`,
} as const);

/* -------------------------------------------------------------------------- *
 * The view
 * -------------------------------------------------------------------------- */

/** What one tier row is for this sitting, right now. Pressable exactly on `buy` and `picked`. */
export type RushRebuildRowState = 'fitted' | 'picked' | 'buy' | 'short' | 'changes-nothing' | 'off-menu';

export interface RushRebuildRowView {
  readonly priceId: string;
  /** The shop's tier name. */
  readonly name: string;
  /** What it fits, in plain numbers. Empty on an off-menu row, which fits nothing here. */
  readonly fits: string;
  /** `9 units`. Empty on an off-menu row, which this screen does not price. */
  readonly price: string;
  readonly state: RushRebuildRowState;
  /** The button's words on a pressable row, `undefined` otherwise. */
  readonly action: string | undefined;
  /** The one sentence a row that is not plainly buyable owes. */
  readonly note: string | undefined;
  readonly pressable: boolean;
}

export interface RushRebuildCategoryView {
  readonly id: string;
  /** The shop's category name. */
  readonly name: string;
  readonly rows: readonly RushRebuildRowView[];
  /** A category the rush does not sell at all, with why. `undefined` on one it does. */
  readonly refusal: string | undefined;
}

export interface RushRebuildView {
  readonly eyebrow: string;
  readonly purseLine: string;
  readonly purseNote: string;
  readonly unmeasured: string;
  readonly categories: readonly RushRebuildCategoryView[];
  /** What the picks so far cost and leave, or that nothing is picked. Never empty. */
  readonly pendingLine: string;
}

export interface RushRebuildInput {
  /** What the sitting has fitted so far, the pre-fit's levels included. */
  readonly levels: RushFitLevels;
  /** What is picked for the next round, in pick order. */
  readonly pending: readonly string[];
  /** {@link rushPurseBeforeNextOf}'s answer. */
  readonly purseUnits: number;
  readonly schedule: PriceSchedule;
  /** The tower as shipped, for `core`'s structural check. `undefined` checks nothing. */
  readonly building: BuildingConfig | undefined;
  readonly specs: ElevatorSpecs;
}

/**
 * The shop's name for the tier a price row prices — what the round list calls a rebuild — or the id
 * itself for a row no shop tier names, which no menu press can produce and which a record from another
 * build could carry. One name for one purchase on either screen.
 */
export function rushTierNameOf(priceId: string): string {
  for (const category of SHOP) {
    const tier = category.tiers.find((entry) => entry.priceId === priceId);
    if (tier !== undefined) return tier.name;
  }
  return priceId;
}

/** What a tier fits, as one line — read off `core`'s numbers, never retyped. */
export function rushFitsLineOf(fits: RushFitDelta): string {
  const clauses: string[] = [];
  if ((fits.doorSecondsSaved ?? 0) > 0) clauses.push(RUSH_REBUILD_COPY.fitsDoors(fits.doorSecondsSaved ?? 0));
  if ((fits.hallDwellSecondsSaved ?? 0) > 0) clauses.push(RUSH_REBUILD_COPY.fitsHallDwell(fits.hallDwellSecondsSaved ?? 0));
  if (fits.zonesTheTower === true) clauses.push(RUSH_REBUILD_COPY.fitsZones);
  if (fits.callType !== undefined) clauses.push(RUSH_REBUILD_COPY.fitsDestination);
  if (fits.passengerAssignment !== undefined) clauses.push(RUSH_REBUILD_COPY.fitsPanel);
  if (fits.carPersons !== undefined) clauses.push(RUSH_REBUILD_COPY.fitsCars(fits.carPersons));
  if (fits.transferCeilingS !== undefined) clauses.push(RUSH_REBUILD_COPY.fitsBoarding(fits.transferCeilingS));
  const line = clauses.join('; ');
  return line.length === 0 ? line : `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

/** The picks other than any in `tier`'s category — what a press on `tier` would sit beside. */
function picksBeside(pending: readonly string[], tier: RushRebuildTier): readonly string[] {
  return pending.filter((priceId) => rushRebuildTierOf(priceId)?.categoryId !== tier.categoryId);
}

function units(value: number): string {
  return `${String(value)} ${value === 1 ? 'unit' : 'units'}`;
}

function menuRowOf(tier: RushRebuildTier, name: string, input: RushRebuildInput): RushRebuildRowView {
  const price = rushRebuildUnits(input.schedule, [tier.priceId]);
  const base = { priceId: tier.priceId, name, fits: rushFitsLineOf(tier.fits), price: units(price) };
  if ((input.levels[tier.categoryId] ?? 0) >= tier.level) {
    return { ...base, state: 'fitted', action: undefined, note: RUSH_REBUILD_COPY.fitted, pressable: false };
  }
  if (input.pending.includes(tier.priceId)) {
    return { ...base, state: 'picked', action: RUSH_REBUILD_COPY.undo, note: RUSH_REBUILD_COPY.picked, pressable: true };
  }
  if (input.building !== undefined && rushTierChangesNothing(input.building, input.levels, tier, input.specs)) {
    return { ...base, state: 'changes-nothing', action: undefined, note: RUSH_REBUILD_COPY.changesNothing, pressable: false };
  }
  /* A press replaces a pick of the same category, so what it can spend is the purse less the others. */
  const besideUnits = rushRebuildUnits(input.schedule, picksBeside(input.pending, tier));
  const left = input.purseUnits - besideUnits;
  if (price > left) {
    return { ...base, state: 'short', action: undefined, note: RUSH_REBUILD_COPY.short(price - left), pressable: false };
  }
  return { ...base, state: 'buy', action: RUSH_REBUILD_COPY.buy(price), note: undefined, pressable: true };
}

function offMenuRowOf(priceId: string, name: string, note: string): RushRebuildRowView {
  return { priceId, name, fits: '', price: '', state: 'off-menu', action: undefined, note, pressable: false };
}

/**
 * The menu for this sitting, in the shop's category order. Total: every shop category is drawn, the two
 * the rush does not sell with their reason, so a player looking for Shafts finds why rather than nothing.
 */
export function rushRebuildViewOf(input: RushRebuildInput): RushRebuildView {
  const pendingUnits = rushRebuildUnits(input.schedule, input.pending);
  const categories = SHOP.map((category: ShopCategory): RushRebuildCategoryView => {
    const sold = RUSH_REBUILD_TIERS.filter((tier) => tier.categoryId === category.id);
    if (sold.length === 0) {
      return { id: category.id, name: category.name, rows: [], refusal: RUSH_REBUILD_COPY.needsCommissioning };
    }
    const rows = category.tiers.map((shopTier) => {
      const tier = sold.find((entry) => entry.level === shopTier.level);
      if (tier !== undefined) return menuRowOf(tier, shopTier.name, input);
      const off = RUSH_REBUILD_OFF_MENU.find((entry) => entry.categoryId === category.id && entry.level === shopTier.level);
      return offMenuRowOf(
        shopTier.priceId,
        shopTier.name,
        off?.reason === 'crowd' ? RUSH_REBUILD_COPY.changesTheCrowd : RUSH_REBUILD_COPY.needsCommissioning,
      );
    });
    return { id: category.id, name: category.name, rows, refusal: undefined };
  });
  return {
    eyebrow: RUSH_REBUILD_COPY.eyebrow,
    purseLine: RUSH_REBUILD_COPY.purse(input.purseUnits),
    purseNote: RUSH_REBUILD_COPY.purseNote,
    unmeasured: RUSH_REBUILD_COPY.unmeasured,
    categories,
    pendingLine:
      input.pending.length === 0
        ? RUSH_REBUILD_COPY.noneYet
        : RUSH_REBUILD_COPY.pending(pendingUnits, input.purseUnits - pendingUnits),
  };
}

/**
 * Whether pressing `priceId` may change the picks, and the picks after it — `EverydayHost.pickRushRebuild`'s
 * one rule, so the host and the menu cannot disagree about a press.
 *
 * A picked tier is put back. A tier of a category already picked replaces that pick. Anything else is
 * added, if the menu row for it is `buy`. The refusal is the row's own note, so a keyboard route that
 * reaches a press the screen draws inert is told what the screen says.
 */
export function rushRebuildPressOf(
  input: RushRebuildInput,
  priceId: string,
): { readonly ok: true; readonly pending: readonly string[] } | { readonly ok: false; readonly reason: string } {
  if (input.pending.includes(priceId)) {
    return { ok: true, pending: Object.freeze(input.pending.filter((entry) => entry !== priceId)) };
  }
  const row = rushRebuildViewOf(input)
    .categories.flatMap((category) => category.rows)
    .find((entry) => entry.priceId === priceId);
  const tier = rushRebuildTierOf(priceId);
  if (row === undefined || tier === undefined) {
    return { ok: false, reason: row?.note ?? RUSH_REBUILD_COPY.needsCommissioning };
  }
  if (row.state !== 'buy') return { ok: false, reason: row.note ?? RUSH_REBUILD_COPY.fitted };
  return { ok: true, pending: Object.freeze([...picksBeside(input.pending, tier), priceId]) };
}
