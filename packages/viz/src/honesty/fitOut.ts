/**
 * **The fit-out axis: the corpus's towers, with something bought.**
 *
 * ## The null result this exists to answer
 *
 * [§ D427](../../../../DECISIONS.md) made a campaign purchase reach the run — thirteen of the
 * sixteen shop tiers move the legs at the campaign's own cell — and predicted its own effect on this
 * corpus in one sentence: *"any corpus case that ever carries a non-`AS_BUILT` fit-out would move."*
 * The corpus was then measured on the integrated tree against a re-measured base and **every figure
 * was identical**: 49 / 571 205 / 606 / 53 / 0 and 60 / 712 547 / 4 710 / 54 / 0, surface sets
 * diffed and identical. None does.
 *
 * So **the corpus held no case in which anything had been bought**. Every campaign case the ten
 * honesty properties saw was a tower as built, and a surface can be honest about a tower as built
 * and dishonest about a fitted one. That is a hole in the corpus's coverage of GAMEPLAY § 8 found by
 * a null result rather than by a violation, and this module is the seed that closes it.
 *
 * ## Why an axis rather than a case
 *
 * `HONESTY_MODES` (§ D194) is the precedent and it is cited with its own measured null: the mode
 * axis's second value produced **zero** new strings the day it landed, and that stopped being true
 * later when two adapters became mode-aware. The value of generating an axis is the day a fitted
 * surface lands — it is driven from that day rather than from the day somebody remembers to check
 * it. A single new case would be a screen the search reads once, on one building, at one horizon.
 *
 * This axis is **not** that null. It changes the run at every case it is drawn on, which is asserted
 * on the legs rather than argued — see {@link HONESTY_KITS} for which kit and why, and
 * `honesty.test.ts`'s *the fit-out axis moves the legs* case for the assertion.
 *
 * ## Drawn last, so the pinned corpus keeps its meaning
 *
 * `generate.ts#caseFromSeed` draws the kit **after** the mode, which is after everything else. The
 * 49 pinned cases therefore keep their building, dispatcher, seed, horizon, demand, batch shape and
 * mode exactly as they had them, and only gain a field. A corpus whose cases moved under an axis
 * would be a corpus whose regression history had been silently rewritten.
 *
 * ## Folded rather than written out
 *
 * A kit is a set of *purchases* — `{ doors: 3 }` — put through the shipped `campaign/economy.ts` and
 * `campaign/fitOut.ts` derivation, exactly as `scope/probes.test-helper.ts`'s `DOORS_FITTED` is and
 * for its stated reason: a hand-built `CampaignFitOut` would move the field while saying nothing
 * about whether a **purchase** reaches it, which is the half GitHub issue #181 was about.
 */

import {
  parseBuilding,
  resolveBuilding,
  type DispatcherProfile,
  type ElevatorSpecs,
  type ResolvedBuilding,
} from '@elevator-sim/core/browser';

import { freshTower } from '../campaign/career.js';
import type { ShopCategoryId } from '../campaign/economy.js';
import {
  fitOutIsAsBuilt,
  fitOutOf,
  fittedBuilding,
  profileWithKit,
  type CampaignFitOut,
} from '../campaign/fitOut.js';

/**
 * One kit a case may run under: a set of § 8.2 purchases, by category and level.
 *
 * The purchases rather than the folded record, so the axis exercises `fitOutOf` — see the module
 * docstring's *folded rather than written out*.
 */
export interface HonestyKit {
  /** What a case carries, and what a counterexample prints. `null` on a case is *as built*. */
  readonly id: string;
  /** § 8.2 categories at their fitted level, as `TowerEconomy.fitted` holds them. */
  readonly fitted: Readonly<Partial<Record<ShopCategoryId, number>>>;
  /** Why this kit and not another. A measurement, never a taste — see {@link HONESTY_KITS}. */
  readonly why: string;
}

/**
 * The kits the axis draws from, **chosen by measuring the shipped tiers at this corpus's own
 * cells** rather than at the campaign's.
 *
 * ## How the choice was established
 *
 * `measure.fitOut.test.ts` runs every one of the sixteen shipped tiers against every case of
 * `campaign.ts#STANDARD_CORPUS`, as built and fitted, and compares **the legs** — passenger, car and
 * boarding instant in the recording's own order, which is `scope/probes.test-helper.ts#legsOf`'s
 * comparison string and § D177's rule. Never a window statistic: *a mean can be unchanged for a run
 * that is entirely different, and a mean can move because the window moved.*
 *
 * That is the same instrument § D427 used, pointed at a different cell — and the cell is the whole
 * reason it had to be re-run. § D427's table is measured at `garden-apartments`/3 600 s, which is
 * what `everyday/host.ts#runCampaignDay` writes; this corpus runs five buildings at **600–900 s**
 * in the always-on tier, and `scope/probes.test-helper.ts` already records that `doors` L1 — the
 * tier its own probe uses — is **inert** at `garden-apartments`/900 s, because two hydraulic cars
 * over fifteen minutes of a residential trickle make too few stops for a second off each of them to
 * change a decision. A kit inherited from § D427's table would have been a kit measured where this
 * corpus never runs, which is the defect CLAUDE.md's *published number goes stale* rule is about.
 *
 * ## What the survey found, over the 49 always-on cases
 *
 * | tier | legs move | tier | legs move |
 * |---|---|---|---|
 * | `doors` L1 | 38 | `machines` L1 | 41 |
 * | `doors` L2 | 38 | `machines` L2 | **49** |
 * | `doors` L3 | 40 | `machines` L3 | **49** |
 * | `control` L1 | not drivable at this corpus's seams | `cars` L1 | **0** |
 * | `control` L2 | 31 | `cars` L2 | 26 |
 * | `control` L3 | 33 | `shafts` L1 / L2 | 44 |
 * | `tenants` L1 | 24 | `tenants` L2 | not drivable at this corpus's seams |
 * | `tenants` L3 | 27 | | |
 *
 * Two rows are worth reading before the choice. **`cars` L1 moves nothing at all here** — 0 of 49,
 * where § D427 found it inert at the campaign's cell and live at the same cell at 15 % of population
 * per 5 min. Every always-on horizon is 600–900 s and no cell in this corpus fills a car, so
 * *16-person cars* is an empty control across the whole tier rather than at one point of it. And
 * **`machines` L1 is inert on exactly the eight `secure-tower` cases** and nowhere else, which is a
 * fact about one building's fleet rather than about the tier.
 *
 * ## What is seeded, and why two kits rather than one
 *
 * `machines` **L2** — every car rebuilt to `gearless-traction` at 5 m/s — is the seed, because with
 * L3 it is the only rung that moves **49 of 49**. A kit inert on a case is a case that adds strings
 * without adding coverage, so an axis drawn from a 33-of-49 tier would put a dead fit-out on a third
 * of the cases it touched.
 *
 * The second kit buys `control` **L3** *on top of* it, and the *on top of* is the point. § 8 has two
 * appliers and they are separate seams — `fittedBuilding` edits the tower, `profileWithKit` edits the
 * dispatcher — and a corpus that only ever drove the first would leave the second's non-identity
 * branch unreached, because `machines` L2 names no `dispatch` field and `profileWithKit` then returns
 * its input by object identity. `control` L3 alone moves only 33 of 49, so it is bought **beside** a
 * tier that always moves rather than instead of one: every case the second kit is drawn on still
 * moves, and on 33 of the 49 cells the panel is what moves it.
 *
 * ## Why that is not the *turn the whole shop on* mistake
 *
 * `probes.test-helper.ts` states it: *"an arm that turned the whole shop on would still be green if
 * five of the six categories had come unwired."* Two categories is not six, and the claim is not left
 * to this table anyway — `honesty.test.ts`'s § D177 pair drives **each category on its own**, against
 * a case measured to move under it, which is what makes an unwired seam red rather than masked.
 * `campaign/fitOut.test.ts` is where each of the sixteen tiers is proved at the campaign's own cell.
 */
export const HONESTY_KITS: readonly HonestyKit[] = Object.freeze([
  Object.freeze({
    id: 'machines-2',
    fitted: Object.freeze({ machines: 2 }),
    why: 'every car rebuilt to gearless-traction at 5 m/s — 49 of 49 always-on cases move on the legs, and only the machines rungs do',
  }),
  Object.freeze({
    id: 'machines-2+control-3',
    fitted: Object.freeze({ machines: 2, control: 3 }),
    why: 'the same speed with a Level-1 destination panel over it — the dispatcher seam, which machines alone leaves at profileWithKit’s identity branch',
  }),
]);

/** Kit ids a case may carry, for the generator to draw from and for a reader to grep. */
export const HONESTY_KIT_IDS: readonly string[] = Object.freeze(
  HONESTY_KITS.map((kit) => kit.id),
);

/**
 * A kit folded into the record a run is built from, through the shipped derivation.
 *
 * The tower is a `freshTower` on the campaign's own opening contract with the categories written
 * onto `fitted` — kit that *belongs to the building* (§ 8.3) rather than a booking, so
 * `fittedLevel` reports it live with no day arithmetic. `bookings` is empty for the same reason:
 * this axis is about what a fitted tower's surfaces say, not about when a purchase becomes live,
 * which `campaign/economy.test.ts` owns.
 */
function fitOutOfKit(kit: HonestyKit): CampaignFitOut {
  return fitOutOf({
    ...freshTower({
      contractId: 'c1',
      buildingId: 'garden-apartments',
      dispatcherId: 'collective',
      rate: 3,
    }),
    fitted: kit.fitted,
  });
}

/**
 * The kit a case names, folded — `undefined` for a case that names none, which is *as built*.
 *
 * @throws Error if the id is not a shipped kit. A case naming a kit that does not exist is a
 *   generator defect and must not silently run as built, which is the shape that makes an axis look
 *   swept while it is inert.
 */
export function fitOutForCase(fitOutId: string | null): CampaignFitOut | undefined {
  if (fitOutId === null) return undefined;
  const kit = HONESTY_KITS.find((entry) => entry.id === fitOutId);
  if (kit === undefined) throw new Error(`unknown honesty fit-out kit "${fitOutId}"`);
  return fitOutOfKit(kit);
}

/**
 * The building a fitted case runs in, resolved.
 *
 * `dev/state.ts#shiftRunConfigOf`'s own sequence, minus the two steps this corpus has no state for
 * (a reader's commissioning and the week's growth): edit the authored `BuildingConfig`, then put it
 * back through `parseBuilding`/`resolveBuilding` so a fitted building is validated like any other.
 * Reconstructing the edit here rather than calling `fittedBuilding` would be the second answer that
 * drifts, so it is the shipped applier that is called.
 *
 * Returns its input **by object identity** at *nothing bought*, which is `campaign/fitOut.ts`'s own
 * contract one layer up and matters for the same reason: a corpus that re-resolved every building
 * would move every case's `source` and every board digest taken off it.
 */
export function fittedBuildingFor(
  base: ResolvedBuilding,
  fit: CampaignFitOut | undefined,
  specs: ElevatorSpecs,
): ResolvedBuilding {
  if (fitOutIsAsBuilt(fit)) return base;
  const edited = fittedBuilding(base.config, fit, specs);
  if (edited === base.config) return base;
  return resolveBuilding(parseBuilding(edited as unknown), specs, { file: base.source });
}

/**
 * The dispatcher a fitted case is driven by — the landing hardware on whichever profile drives.
 *
 * `profileWithKit` is the shipped applier and is called rather than copied, for
 * {@link fittedBuildingFor}'s reason. It returns its input by object identity when the kit names
 * neither field, so an as-built case reaches `estimateCost` with the shipped profile it always had.
 */
export function fittedProfileFor(
  profile: DispatcherProfile,
  fit: CampaignFitOut | undefined,
): DispatcherProfile {
  return profileWithKit(profile, fit);
}
