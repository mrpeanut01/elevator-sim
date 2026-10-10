/**
 * **`rush-prefit`: the one fixed kit a rush sitting may start fitted with, and the two appliers that
 * put it into a run** — GitHub issue **#372**, `docs/38` § 2.3 and § 2.4,
 * [§ D640](../../../../DECISIONS.md).
 *
 * `data/chime-ledger.json` has sold *Start with the building fitted* for fifteen chimes since the
 * ledger shipped, and **what *fitted* meant was authored nowhere**. That is the third of the three
 * questions [§ D606](../../../../DECISIONS.md) § 2 named and declined to answer, and it is the
 * reason `packages/server`'s `leaderboard/rushSitting.ts#rushSittingIssues` refused the modifier by
 * name: a claim the replay could not build would have put a sitting on a board that says
 * *pre-fitted* for a run of the building as shipped.
 *
 * This module answers it, for **one** kit and no other.
 *
 * ## Why this is in `core` and why it is not a shop
 *
 * `packages/server` has to replay a posted sitting and may not import the viewer, so a rule both
 * ends need lives in the package both already depend on — `rushPurse.ts` and `chimeLedger.ts` sit
 * here for exactly that reason and say so. § D606 § 2 weighed **moving the derivation into `core`**
 * and declined it, and the clause it declined is worth reading precisely: what it refused to move
 * was `packages/viz/src/campaign/economy.ts#SHOP`, *"a shop: its tiers carry player-facing names,
 * subtitles and effect sentences, and moving them into `core` puts product copy inside the
 * simulator and outside the honesty corpus's reach."*
 *
 * Nothing of that shape is here. {@link RUSH_PREFIT_KIT} carries **three numbers and no words** — no
 * name, no subtitle, no effect sentence, no tier, no price in units, no ladder and no second kit —
 * so no string in this file can reach a player and the honesty corpus has nothing here to sweep.
 * **The general between-round rebuild is built now, in this shape** (`rushRebuild.ts`, GitHub issue
 * #372, [§ D1295](../../../../DECISIONS.md)): the copy-free half of the shop moved, tier by tier, and
 * this kit became three of its levels. This sentence said the rebuild *"still needs one of § D606's
 * three shapes and is not built"*, and it is replaced rather than left standing on § D227's ground.
 *
 * ## The kit, and why these three tiers
 *
 * Doors L1 + Control L1 + Tenants L1, which is `SHOP`'s three cheapest first rungs and
 * `data/price-schedule.json`'s `faster-doors` (4 units), `zone-the-tower` (6) and
 * `queue-marshalling` (5) — **fifteen units against the sink's own fifteen chimes**, one chime per
 * unit, the rate `data/campaign.json`'s scenario budget rungs already use and the ledger's own
 * `$comment` already cites. It is deliberately not the ~1.6 chimes-per-unit the `purse-units` sinks
 * charge: those sell a scalable grant and this is a flat one-time kit, where the round number is
 * the more legible anchor.
 *
 * **Machines, Shafts and Car size are deliberately absent.** `SHOP`'s own subtitle calls Shafts
 * *"the real fix, and the real cost"*, and a flat currency purchase that gave a taste of comfort is
 * a different thing from one that pre-solves the tower. **Control is deliberately capped at
 * tier 1** — `zone-the-tower`, which sets nothing but *the group is worked as zones* — rather than
 * the L2/L3 destination panels, which rewrite `callType`, `passengerAssignment` and the ride-time
 * weight floor: a flat purchase may not pre-decide the dispatcher-strategy question the player is
 * there to make live.
 *
 * Every figure here is **CHOSEN**, in the product owner's 2026-09-08 sense: an agent's proposal,
 * drafted for the owner to accept, tighten or reject, and not one of them is measured. The lever is
 * this constant and the sink's `priceChimes`, and nothing else.
 *
 * ## Why the two appliers stop where they do
 *
 * Between them the three effects are two per-car field edits and one dispatch lever, and **not one
 * of them needs the commissioning machinery** `packages/viz/src/commissioning/` owns: no
 * `extraShafts`, no `machineClassId`, no floor populations. So the kit is a plain edit to a
 * `BuildingConfig` and three fields on a `DispatcherProfile`, and both are `rushRebuild.ts`'s general
 * appliers (`rushRebuiltBuilding`, `rushRebuiltProfile`) at {@link RUSH_PREFIT_LEVELS}, which is the
 * same edit by construction rather than by agreement. The kit's own two wrappers were deleted in
 * wave AN once [§ D1295](../../../../DECISIONS.md) moved the server onto those appliers and they
 * kept no caller outside their tests.
 *
 * ## The two ends, and how they are held to one answer
 *
 * - **`packages/viz`** keeps its own generic applier: the prefit reaches a rush as the
 *   `CampaignFitOut` `everyday/rush.ts#rushFitOutOf` builds from {@link RUSH_PREFIT_LEVELS}, folded
 *   by `campaign/fitOut.ts` like any other kit, because a fit-out is what this is.
 * - **`packages/server`** has no `SHOP`: it folds {@link RUSH_PREFIT_LEVELS} with `rushFitOf` and
 *   applies `rushRebuiltBuilding` and `rushRebuiltProfile`, the appliers a rebuild between rounds
 *   uses.
 *
 * Two paths, one set of values, and the agreement is **pinned by runs rather than by this
 * paragraph**: `packages/server/src/leaderboard/rushHoldAgreement.json` carries `prefit` cells that
 * each half plays through its own path and pins to one held figure, and
 * `packages/viz/src/everyday/rushPrefit.test.ts` asserts the two building appliers agree to the
 * byte on every shipped tower. {@link doorCycleWithSaving} and {@link MIN_DOOR_S} moved here from
 * `campaign/fitOut.ts` when the second caller appeared, and on to `rushRebuild.ts` with the general
 * appliers, so the one piece of arithmetic in the kit has one implementation rather than two.
 *
 * ## What a prefitted round does **not** get
 *
 * A mid-round *switch dispatcher* press carries no kit, in either half. `viz` writes the zoning
 * lever into the **driving** profile only (`dev/state.ts#drivingProfileOf`) and the stage's switch
 * target is a shipped profile as shipped (`dev/main.ts`'s `plainBaselineOf`), so the server applies
 * the zoning lever (`rushRebuild.ts#zonedProfileOf`) to a round's base profile and to no switch target. That is parity
 * with what a player's own run does, which is the only thing a replay may be: whether a bought
 * zoning *should* survive a switch is a product question and is not answered here.
 */

import type { ChimeLedgerTable } from './chimeLedger.js';
import { chimeSinkById } from './chimeLedger.js';
import { rushRebuildTierOf, type RushFitLevels } from './rushRebuild.js';

/* -------------------------------------------------------------------------- *
 * The kit
 * -------------------------------------------------------------------------- */

/**
 * The `data/chime-ledger.json` sink this kit is the answer to.
 *
 * Named rather than matched on a prefix, and checked against the shipped ledger by
 * {@link violationsInRushPrefit}: a `prefit` sink this module does not know is a kit nothing
 * defines, which is § D606's hole arriving a second time.
 */
export const RUSH_PREFIT_SINK_ID = 'rush-prefit';

/** What one shop tier of the kit is worth, for the arithmetic that sets the sink's price. */
export interface RushPrefitRung {
  /** `data/price-schedule.json`'s row id, which is also `campaign/economy.ts#ShopTier.priceId`. */
  readonly priceId: string;
  /**
   * That row's `priceUnits` **as measured on the commit that authored this kit** (2026-09-16).
   *
   * A dated transcription rather than a live read. When it was written `core` parsed no price
   * schedule; it does now (`priceSchedule.ts`, moved from the viewer in wave AN, § D1295), but this
   * module still holds no schedule, because the kit's price is the sink's chimes and these units are
   * only the arithmetic that set them. A figure copied out of a file is a figure that goes stale, so
   * `packages/viz/src/everyday/rushPrefit.test.ts` re-derives the sum from the shipped schedule and
   * goes red if a row moves, which is what keeps this honest.
   */
  readonly priceUnits: number;
}

/** The three effects this kit has on a run, and the unit arithmetic behind its chime price. */
export interface RushPrefitKit {
  /** Seconds off each stop's door cycle — `SHOP`'s `doors` L1, `FitOutDelta.doorSecondsSaved`. */
  readonly doorSecondsSaved: number;
  /** A ceiling on seconds per passenger per direction — `tenants` L1, `FitOutDelta.transferCeilingS`. */
  readonly transferCeilingS: number;
  /** The group is worked as zones — `control` L1, `FitOutDelta.zonesTheTower`. */
  readonly zonesTheTower: boolean;
  /** The shop rows this kit is, in `SHOP` order. */
  readonly rungs: readonly RushPrefitRung[];
  /** The rungs' units, summed — the figure the sink's `priceChimes` is set to at one chime per unit. */
  readonly totalUnits: number;
}

/**
 * **The kit, and the whole of what *fitted* means to a rush.** CHOSEN — see the module docstring.
 *
 * `1.2 s` and `1 s` are not invented here: the transfer ceiling is
 * `data/elevator-specs.json`'s `timing.passengerTransferS.office`, the fastest condition that file
 * prices, and the second off the door cycle is `SHOP`'s `doors` L1's own sentence. Both arrive
 * through `campaign/economy.ts`'s `fits` for those tiers, which is where they are argued.
 */
export const RUSH_PREFIT_KIT: RushPrefitKit = Object.freeze({
  doorSecondsSaved: 1,
  transferCeilingS: 1.2,
  zonesTheTower: true,
  rungs: Object.freeze([
    Object.freeze({ priceId: 'faster-doors', priceUnits: 4 }),
    Object.freeze({ priceId: 'zone-the-tower', priceUnits: 6 }),
    Object.freeze({ priceId: 'queue-marshalling', priceUnits: 5 }),
  ]),
  totalUnits: 15,
});

/**
 * **The kit as levels** — Doors 1, Control 1, Tenants 1 (§ D640) — read off {@link RUSH_PREFIT_KIT}'s
 * rungs through the rebuild menu, so which tiers the pre-fit is has one statement rather than two.
 * Both ends fold it with `rushRebuild.ts#rushFitOf` and apply it like any rebuild
 * ([§ D1295](../../../../DECISIONS.md)): the server in `leaderboard/rushSitting.ts`, the viewer in
 * `everyday/rush.ts`. A rung the menu has no tier for throws as the module loads, because a kit the
 * menu cannot build is the hole § D606 named. `rushPrefit.test.ts` holds the kit's three named effects
 * equal to this fold.
 */
export const RUSH_PREFIT_LEVELS: RushFitLevels = Object.freeze(
  Object.fromEntries(
    RUSH_PREFIT_KIT.rungs.map((rung) => {
      const tier = rushRebuildTierOf(rung.priceId);
      if (tier === undefined) {
        throw new Error(`rush-prefit's rung "${rung.priceId}" is no tier on the rebuild menu, so no fold can build it.`);
      }
      return [tier.categoryId, tier.level];
    }),
  ) as RushFitLevels,
);

/* -------------------------------------------------------------------------- *
 * The claim
 * -------------------------------------------------------------------------- */

/** One purchase a run claims to have been played with — `chimes/ledger.ts#ClaimedModifier`'s shape. */
export interface RushPrefitClaim {
  readonly sinkId: string;
  readonly steps: number;
}

/**
 * Whether this claim list says the building started fitted.
 *
 * **By id, and the id is the contract**, because both ends have to ask this and only one of them
 * holds a ledger: `packages/viz` deliberately never binds a parsed `ChimeLedgerTable` — its
 * `everyday/chimesPanel.ts` projects the spend half at module init and `boundaries.test.ts` forbids
 * a play-side module reaching a source at all — so a predicate that needed one could not be asked
 * on the side that plays the rush. What holds the ledger to this id is
 * {@link violationsInRushPrefit}, which `packages/server` runs at boot, so a renamed or re-kinded
 * sink is a server that will not start rather than a run that quietly played unfitted.
 *
 * The claims arrive already checked against the account's spends (`packages/server`'s
 * `chimes/ledger.ts#unbackedModifiers`); this only asks what they are. A sitting with no modifiers,
 * which is the standard case and every sitting this build can currently produce, is `false`.
 */
export function claimsRushPrefit(claimed: readonly RushPrefitClaim[] | undefined): boolean {
  return (claimed ?? []).some((claim) => claim.sinkId === RUSH_PREFIT_SINK_ID && claim.steps >= 1);
}

/**
 * Every way the shipped ledger disagrees with this kit, as sentences. Empty means it agrees.
 *
 * **Structural only, and the price is deliberately not checked here.** That a pre-fit costs fifteen
 * chimes is a CHOSEN figure the owner may move in one field, and a server that refused to boot over
 * it would make a tuning decision an outage. What *is* refused is a ledger this module cannot serve:
 * a missing sink, a sink of the wrong kind, or a **second** `prefit` sink — which would be a kit
 * nothing defines, the hole § D606 named, re-opened quietly.
 */
export function violationsInRushPrefit(ledger: ChimeLedgerTable): readonly string[] {
  const issues: string[] = [];
  const sink = chimeSinkById(ledger, RUSH_PREFIT_SINK_ID);
  if (sink === undefined) {
    issues.push(`data/chime-ledger.json does not sell "${RUSH_PREFIT_SINK_ID}", which is the one pre-fit this build can apply.`);
  } else if (sink.modifier.kind !== 'prefit') {
    issues.push(`sink "${RUSH_PREFIT_SINK_ID}" sells a ${sink.modifier.kind} modifier and not a pre-fit.`);
  }
  const prefits = ledger.sinks.filter((entry) => entry.modifier.kind === 'prefit').map((entry) => entry.id);
  const strangers = prefits.filter((id) => id !== RUSH_PREFIT_SINK_ID);
  if (strangers.length > 0) {
    issues.push(
      `data/chime-ledger.json sells ${strangers.length === 1 ? 'a pre-fit' : 'pre-fits'} this build cannot ` +
        `build (${strangers.join(', ')}): config/rushPrefit.ts holds exactly one kit, and a second pre-fit ` +
        'sink would be a fitted building nothing defines — DECISIONS.md D606 section 2.',
    );
  }
  return issues;
}

/* -------------------------------------------------------------------------- *
 * The building
 * -------------------------------------------------------------------------- */

/*
 * {@link MIN_DOOR_S} and {@link doorCycleWithSaving} lived here and moved to `rushRebuild.ts` with the
 * appliers that call them, when the general rebuild arrived (GitHub issue #372, § D1295). Re-exported
 * from this module so nothing that imported them from here moved.
 */
export { MIN_DOOR_S, doorCycleWithSaving } from './rushRebuild.js';
