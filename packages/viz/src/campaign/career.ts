/**
 * **The career record, and every action that moves it** — GAMEPLAY § 8.1's *"a building is a
 * commitment, not a setting"*, as one immutable value and one reducer over it.
 *
 * ## One record, because § 16 rule 14 says so
 *
 * *"One day record narrates everything … the brief, the stage, the report and the calendar all read
 * it."* The three Everyday campaign screens are three readings of {@link CampaignCareer} and of
 * nothing else: the triage list, the desk and the contract sheet cannot disagree about how many
 * days are cleared, because none of them counts. `campaign/economy.ts` derives every figure from
 * this record and `everyday/campaignModel.ts` words it.
 *
 * ## A commitment, not a setting
 *
 * Each {@link CampaignTower} keeps its own purse (derived from its own day, missed count and
 * bookings), its own standing order, its own fitted kit, its own booked works, its own wear clock
 * and its own contract day. Opening one disturbs no other and returning to one **resumes**: there
 * is no per-tower reset anywhere in this file, and {@link openTower} writes one field.
 *
 * ## The opening career is a first day, not a fixture of somebody else's month
 *
 * GAMEPLAY § 8.12 authors three career snapshots — week one, second month, fifth month — and asks
 * for them as fixtures. Two of the three are **not shipped as the opening state**, and that is
 * § 20.11 rather than an omission: a screen that greets a player with *"day 4 · 3 cleared · 0
 * missed"* over a career they have not played presents an authored record as theirs, which is the
 * one thing the handoff's own honesty rule forbids outright. So {@link openingCareer} is a genuine
 * first day — day 1, nothing cleared, nothing missed, no trips — and the second and fifth month
 * snapshots live in `career.test.ts` and `everyday/campaignModel.test.ts` as the regression
 * fixtures § 8.12 asks for. Progression is reached by playing, which is what the mode is.
 *
 * ## What arrives from the building, and what does not
 *
 * § 8.11: *"Incidents arrive from the building, not from performance."* Two of § 8's four incident
 * kinds are **derivable from the record** and are derived here — a renewal falls due in the last
 * days of a contract (§ 8.9), and a service window falls due when the wear clock says so (§ 8.3).
 * The other two — a lift failing its safety check, a coach party booked in — are **draws against
 * the daily failure odds and against an authored event schedule**, and neither exists: there is no
 * named RNG stream for a campaign day (CLAUDE.md invariant 2 forbids a global one) and no event
 * calendar keyed to a contract. So this build's incidents are the two the state implies, and
 * {@link CAMPAIGN_ABSENCES} says so where a player reads it rather than only here.
 *
 * ## The career is this session's
 *
 * Nothing here writes storage. `everyday/profileStore.ts` persists a name and a colour because
 * § 20.15 asks for it; a career would need a schema, a migration and a reconciliation with
 * `ViewerState.week`, and shipping one that silently disagreed with the week is the defect this
 * repository keeps a register of. **{@link CAMPAIGN_ABSENCES}'s third entry is where the player
 * reads it** — *“The career is this session's. Nothing on these three screens is written to this
 * device.”* This used to point at the rail instead, and #214 took that away: the rail's career
 * line now reads the persisted **week**, so it no longer says the build keeps no career, and it
 * never spoke for the *campaign's* career anyway. The guarantee is unchanged; only the surface
 * that discloses it moved, and a pointer at the wrong surface is how a disclosure quietly
 * becomes nobody's.
 */

import {
  CONTRACT_DAYS,
  REFURBISHMENT,
  type DifficultyId,
  type ShopCategoryId,
  type TowerEconomy,
  type WorksBooking,
  bookingFor,
  clearedDays,
  contractIsLost,
  dayIndexOf,
  purseOf,
  renewalOffer,
  shopTierAt,
  startIsLegal,
  wearHeadOf,
} from './economy.js';

/* -------------------------------------------------------------------------- *
 * The record
 * -------------------------------------------------------------------------- */

/**
 * One held building.
 *
 * `id` is the **contract id** (`shift/contracts.ts`'s `c1`…`c8`) and `buildingId` is what it runs,
 * so a tower is exactly *an assignment on a shipped building* and nothing about it is authored twice.
 * The display name, the spec line and the floor count are **not** fields: they are the building's
 * own, read through `everyday/host.ts#buildingById` and `shift/contracts.ts#statLineOf` at the
 * moment they are drawn (`docs/12` § 4.4 — where a handoff stat line disagrees with the file, the
 * file wins).
 */
export interface CampaignTower extends TowerEconomy {
  /** The contract this assignment is. */
  readonly id: string;
  /** The shipped building it runs. */
  readonly buildingId: string;
  /**
   * § 8.1's *quirk in one line* — the thing that will catch you out.
   *
   * Authored per tower rather than derived, because it is the one field that is prose about
   * behaviour rather than a fact about the file. The shipped quirks are the design file's own
   * sentences for the buildings it and this repository share.
   */
  readonly quirk: string;
  /** The standing order's dispatcher — the id a run is built from. */
  readonly dispatcherId: string;
  /**
   * § 8.1's *build* column — which of the shop's shapes the standing order aims at.
   *
   * **It reaches no run, it is not going to, and that is recorded rather than left to be
   * rediscovered** — GitHub issue #313, § D227. `everyday/host.ts#runCampaignDay` builds a campaign
   * day from four facts about a tower: its `buildingId`, its `dispatcherId`, the kit
   * `campaign/fitOut.ts#fitOutOf` folds out of what it has actually had fitted, and the length
   * `shift/contracts.ts` declares for its contract. None of the four is a function of this field, so
   * the legs of the day are identical whichever build is picked — measured at the campaign's own
   * cell in `buildStandingOrder.test.ts`, against a control on the *other* select in the same group
   * that does move them.
   *
   * **Why it is a refusal rather than a defect to fix.** The design file authors `build` as a
   * descriptive line per building — `docs/design/elevator-sim-casual.dc.html` gives Garden Apartments
   * `build: 'As built'` beside its quirk — and its own prototype writes the select into
   * `st.builds[t.id]` and reads it back only to mark the option selected. `ENGINE_CONTRACT.md` § 8
   * gives it no expression at all: what changes a building's fabric there is § 8.2's shop, which is
   * bought, has costs and nights, and does reach the run ([§ D427](../../../../DECISIONS.md)). So
   * there is no mechanism in the handoff that this build dropped; wiring one would be inventing game
   * design, and wiring *this* one to the levers would hand a player for free what the `control`
   * tier charges six units and a night for.
   *
   * The player is told, on the control itself — `everyday/campaignModel.ts#BUILD_REFUSAL`, drawn
   * under the select on both surfaces that offer it. A control that writes nothing must say so.
   */
  readonly buildId: BuildId;
  /** 1-based contract days carrying a flagged bad event. Empty in this build — see the docstring. */
  readonly flaggedDays: readonly number[];
}

/** § 8.1's *build* select — the design file's `BUILDS`, in its order. */
export const BUILD_IDS = [
  'as-built',
  'doors-first',
  'zoned-panels',
  'big-cars',
  'everything-cheap',
] as const;

export type BuildId = (typeof BUILD_IDS)[number];

/** The design file's own labels for {@link BUILD_IDS}. */
export const BUILD_LABELS: Readonly<Record<BuildId, string>> = Object.freeze({
  'as-built': 'As built',
  'doors-first': 'Doors first',
  'zoned-panels': 'Zoned + panels',
  'big-cars': 'Big cars',
  'everything-cheap': 'Everything cheap',
});

/** The whole career. */
export interface CampaignCareer {
  /** § 8.4's `stage.carry` — standing banked from contracts that have finished. */
  readonly carry: number;
  /** 1-based career day. § 8.6's `careerToday`. */
  readonly today: number;
  /** Whole months worked across every building held. */
  readonly monthsWorked: number;
  /** Contracts lost. Three and the agency stops calling (§ 8.10). */
  readonly lost: number;
  readonly towers: readonly CampaignTower[];
  /** Which tower the desk and the contract sheet are about, or `undefined`. */
  readonly openTowerId: string | undefined;
  /** A works booking waiting for a start day — § 8.4's two-step buy. */
  readonly pendingBooking: PendingBooking | undefined;
}

/**
 * § 8.4's second step: a tier pressed, waiting for the night it goes in on.
 *
 * Held on the career rather than in the screen because the month grid and the prompt are two
 * surfaces reading one fact, and a pending buy that lived in the DOM would be lost the moment the
 * player looked at the calendar on the triage screen.
 */
export interface PendingBooking {
  readonly towerId: string;
  readonly categoryId: ShopCategoryId;
  readonly level: number;
}

/**
 * § 8.6's two marks — *"`Close the day` evaluates the four tests and marks the day cleared or
 * missed"*.
 *
 * **Two, and there is deliberately no third.** § 8.1's whole arithmetic is
 * `cleared = day − 1 − missed`, so the record partitions every past day into exactly these two;
 * `economy.ts#calendarRow` reads the same sentence a second time to place the marks on the grid.
 * A third value would have to be representable in that subtraction, and it is not.
 *
 * The consequence is stated where it bites rather than hidden here: a run the tests could not read
 * — an empty morning under `shift/goals.ts`'s wake-up gate, or a worst wait the run censored — is
 * **not filed at all**, because *unjudged is not passed* and *unjudged did not cost anything
 * either* ([§ D234](../../../../DECISIONS.md)) are both true and neither of these two marks can say
 * so. {@link CAMPAIGN_ABSENCES} carries that sentence to the player.
 */
export type CampaignDayVerdict = 'cleared' | 'missed';

/** § 8.10's ceiling — three lost contracts and the agency stops calling. */
export const LOST_CONTRACTS_MAX = 3;

/** § 8.3's service interval, in trips. */
export const SERVICE_AT_TRIPS = 45_000;

/* -------------------------------------------------------------------------- *
 * What this build does not have, said where a player reads it
 * -------------------------------------------------------------------------- */

/**
 * The campaign's honest absences, drawn on the triage screen.
 *
 * Each sentence names a thing GAMEPLAY § 8 specifies and this build does not do, so the screen
 * says it rather than a reader inferring it from a section that is quietly missing. The rule is
 * `everyday/screens.ts`'s one level down: a control that does nothing must say so, and a section
 * that is absent must be named.
 */
export const CAMPAIGN_ABSENCES: readonly string[] = Object.freeze([
  'Incidents here are the two the building implies — a renewal falling due, and a service window the wear clock has reached. A lift failing its safety check and a coach party booked in are draws this build cannot make: there is no seeded stream for a campaign day and no event calendar behind a contract.',
  /*
   * **This entry is unchanged, and issue #223 is why that is a decision rather than an oversight.**
   *
   * It reads as a description of behaviour now: the day *is* run from here, and *is* marked when the
   * player closes it. Before #223 the same words described something that never happened. Rewording
   * it was drafted and taken back out, because `buildNotes.test.ts#ABSENCE_TRIAGE`'s own rule is
   * that an entry whose words change is an entry whose owning issue must be re-checked.
   *
   * **The trip budget was the thing this comment named as still absent, and it is not absent any
   * more** — GitHub issue #169. § 8.6's fourth test grades from this wave, off
   * `ENGINE_CONTRACT.md` § 5's own run metric, so the sentence that said *nothing in this run
   * measures it* is deleted rather than left standing beside a row that now prints a figure: § D227
   * binds both ways, and a stale refusal is the more dangerous half. `campaignModel.ts#TRIPS_REFUSAL`
   * went with it, because the per-control refusal #207 left on the row itself was the same claim.
   *
   * The entry's own three sentences are untouched and still true, which is why nothing here moved
   * into or out of the player-facing list.
   */
  'A day is run from here and scored by the day itself; the month grid marks a day cleared or missed when the campaign day is filed, and nothing files one automatically.',
  'The career is this session’s. Nothing on these three screens is written to this device.',
]);

/* -------------------------------------------------------------------------- *
 * The opening career
 * -------------------------------------------------------------------------- */

/**
 * The quirk for each shipped building the campaign offers — GAMEPLAY § 8.1's one line.
 *
 * The four the design file names are its own sentences, verbatim. The two it does not name
 * (`midtown-office` beyond its short form, `vertical-city`) carry the design file's line for the
 * one and, for the other, the contract's own teaching sentence rather than an invented quirk.
 */
const QUIRKS: Readonly<Record<string, string>> = Object.freeze({
  'garden-apartments': 'Everyone leaves within the same twenty minutes.',
  'chancery-house': 'One lift is always in for repair.',
  'crown-hotel': 'Coaches arrive at 11 with forty people and luggage.',
  'midtown-office': 'Two crowds that never overlap.',
  'st-jude-hospital': 'A delayed bed is a missed day on its own.',
  'vertical-city': 'Every journey above the sky lobby is two of them.',
});

/** The quirk for a building, or `undefined` for one the campaign does not offer. */
export function quirkOf(buildingId: string): string | undefined {
  return QUIRKS[buildingId];
}

/**
 * A fresh tower on a contract — day one, nothing cleared, nothing missed, no trips.
 *
 * `rate` is the contract's fee in units a day, which the caller supplies: § 8.9 prices a renewal
 * from it, and a rate this file invented would be a fee nobody published.
 */
export function freshTower(input: {
  readonly contractId: string;
  readonly buildingId: string;
  readonly dispatcherId: string;
  readonly rate: number;
  readonly difficultyId?: DifficultyId;
}): CampaignTower {
  return {
    id: input.contractId,
    buildingId: input.buildingId,
    quirk: quirkOf(input.buildingId) ?? '',
    day: 1,
    missed: 0,
    months: 0,
    carry: undefined,
    difficultyId: input.difficultyId ?? 'standard',
    fitted: {},
    bookings: [],
    trips: 0,
    serviceAt: SERVICE_AT_TRIPS,
    refit: 0,
    rate: input.rate,
    dispatcherId: input.dispatcherId,
    buildId: 'as-built',
    flaggedDays: [],
  };
}

/**
 * The career a player starts on — one forgiving building, day one, standing zero.
 *
 * § 8.12's arc opens on *"one forgiving building and a trivial choice"*, which is
 * `garden-apartments` on `c1`: the smallest crowd this repository ships and § 8.5's complexity 1.
 * The rate is the design file's own fee for it (3 u a day) and the dispatcher is the caller's,
 * because which dispatcher drives is `dev/state.ts`'s decision and not this file's.
 */
export function openingCareer(dispatcherId: string): CampaignCareer {
  return {
    carry: 0,
    today: 1,
    monthsWorked: 0,
    lost: 0,
    towers: [
      freshTower({
        contractId: 'c1',
        buildingId: 'garden-apartments',
        dispatcherId,
        rate: 3,
      }),
    ],
    openTowerId: 'c1',
    pendingBooking: undefined,
  };
}

/** The open tower, or `undefined`. */
export function openTowerOf(career: CampaignCareer): CampaignTower | undefined {
  return career.towers.find((tower) => tower.id === career.openTowerId);
}

/** The tower with an id, or `undefined`. Honest lookup — never the first one. */
export function towerById(career: CampaignCareer, id: string): CampaignTower | undefined {
  return career.towers.find((tower) => tower.id === id);
}

/* -------------------------------------------------------------------------- *
 * § 8.2 / § 8.9 — what a building wants from you
 * -------------------------------------------------------------------------- */

export type TowerNeedKind = 'renewal' | 'service';

/**
 * One option on the desk — § 8.2's *"three or four options, each with cost, when it takes effect,
 * and the honest trade"*.
 */
export interface NeedOption {
  readonly id: string;
  readonly label: string;
  /** Units it costs. `0` is free. */
  readonly units: number;
  /** Nights of works it books. `0` is none. */
  readonly nights: number;
  /** § 8.2's *when it takes effect*. */
  readonly when: string;
  /** § 8.2's *honest trade*. */
  readonly effect: string;
  /** § 8.11's default — *leave it to maintenance*, with a stated survivable consequence. */
  readonly isDefault?: boolean;
}

export interface TowerNeed {
  readonly kind: TowerNeedKind;
  readonly title: string;
  /** § 8.11's deadline in days — the desk's `due` cell. */
  readonly due: string;
  readonly brief: string;
  readonly options: readonly NeedOption[];
}

/**
 * The renewal decision — § 8.9's four options, the design file's own labels and `when` cells.
 *
 * The refurbishment's price is § 8.7's (46 units, ten nights) read from
 * `economy.ts#REFURBISHMENT` rather than restated, which is why the label carries no numeral.
 */
function renewalNeed(tower: CampaignTower): TowerNeed {
  const offer = renewalOffer(tower);
  return {
    kind: 'renewal',
    title: 'The managing agent has offered a renewal',
    due: `answer by day ${String(CONTRACT_DAYS)}`,
    brief:
      'The contract ends this week. Their rate is set by what this building costs to run and by the record you have on it — you can sign it, push it, take the machines apart while you are at it, or hand the building back and free the slot.',
    options: [
      {
        id: 'sign',
        label: 'Sign the renewal at their rate',
        units: 0,
        nights: 0,
        when: 'another twenty days',
        effect: `${String(offer.offered)} u a day, from ${String(offer.wasRate)}. The purse, the kit and the wear clock all come with it.`,
      },
      {
        id: 'push',
        label: 'Ask for one more unit a day',
        units: 0,
        nights: 0,
        when: 'they answer on the first day of the month',
        effect: 'Risks the contract. A record like yours is what you are asking them to pay for.',
      },
      {
        id: 'refurbish',
        label: 'Renew, and refurbish the machines',
        units: REFURBISHMENT.units,
        nights: REFURBISHMENT.nights,
        when: 'a fortnight of works',
        effect: 'Resets the wear clock and the refit clock, and takes a lift out for each of those peaks.',
      },
      {
        id: 'hand-back',
        label: 'Hand it back',
        units: 0,
        nights: 0,
        when: 'ends with this contract',
        effect: 'Frees the slot. The kit stays with the building, because it always belonged to it.',
      },
    ],
  };
}

/**
 * The service window — § 8.3's clock reaching its head, priced from § 8.2's own sentence
 * (*one lift a night for three nights*) and § 8.7's refurbishment.
 *
 * Three options rather than four, and the missing one is stated rather than invented: the design
 * file's `outage` set is written for *a lift that has failed*, which is a different event from a
 * window falling due, and reusing its wording here would put an answer about a broken lift on a
 * building whose lifts all work.
 */
function serviceNeed(): TowerNeed {
  return {
    kind: 'service',
    title: 'The machines are due a service window',
    due: 'book it this week',
    brief:
      'Nothing has failed. The trips since the last window have reached the interval, and every trip from here raises how often something does. Booking the nights costs you peaks you still have to clear; not booking them costs you the rate.',
    options: [
      {
        id: 'window',
        label: 'Book the service window',
        units: 0,
        nights: 3,
        when: 'one lift a night for three nights',
        effect: 'Resets the wear clock. A car is out for the peak on each of those days.',
      },
      {
        id: 'refurbish',
        label: 'Refurbish the machines instead',
        units: REFURBISHMENT.units,
        nights: REFURBISHMENT.nights,
        when: 'a fortnight of works',
        effect: 'Resets the wear clock and the refit clock. Worth it only on a building you mean to keep.',
      },
      {
        id: 'leave',
        label: 'Leave it to maintenance',
        units: 0,
        nights: 0,
        when: 'nothing changes',
        effect: 'The rate keeps climbing with every trip, and the window is still there next week.',
        isDefault: true,
      },
    ],
  };
}

/**
 * What this building wants from you today, or `undefined` for § 8.11's silent one.
 *
 * Derived from the record, never drawn: a renewal is due once the contract is inside its last two
 * days (§ 8.9's *day ≥ 19*), and a service window once § 8.3's head says so. See the module
 * docstring for the two kinds this build cannot produce.
 */
export function needOf(tower: CampaignTower): TowerNeed | undefined {
  if (tower.day >= 19) return renewalNeed(tower);
  if (wearHeadOf(tower) === 'due') return serviceNeed();
  return undefined;
}

/**
 * § 8.1's *what is next* line for a quiet building — the second half of *Nothing — it is running
 * itself*.
 *
 * Derived, and every arm cites the clock it read: the next thing to happen to a quiet tower is
 * either the window its trips are heading for or the renewal its days are.
 */
export function nextLineOf(tower: CampaignTower): string {
  const daysToRenewal = 19 - tower.day;
  if (daysToRenewal <= 5) {
    return `Nothing booked. A renewal falls due in ${String(daysToRenewal)} working days.`;
  }
  if (wearHeadOf(tower) === 'wearing') {
    return 'Nothing booked. The machines are wearing in, and the window is not due yet.';
  }
  return 'Nothing booked. Recently serviced, and running on the order you gave it.';
}

/* -------------------------------------------------------------------------- *
 * The actions
 * -------------------------------------------------------------------------- */

/**
 * Everything a campaign screen may do, as plain data.
 *
 * One union rather than a method per verb, because the whole set crosses `everyday/host.ts`'s
 * façade and that façade's rule is *plain data in, plain data out*. An action is data; a callback
 * per verb would be eleven more methods on a surface whose docstring argues for the smallest one
 * that has callers.
 */
export type CampaignAction =
  /** § 8.1 — open a building's desk. Resumes; nothing is reset. */
  | { readonly kind: 'open-tower'; readonly towerId: string }
  /** § 8.1's inline selects, and § 8.2's *fully editable here*. */
  | { readonly kind: 'set-dispatcher'; readonly towerId: string; readonly dispatcherId: string }
  | { readonly kind: 'set-build'; readonly towerId: string; readonly buildId: BuildId }
  /** § 8.3 — *changing it starts a fresh month*. */
  | { readonly kind: 'set-difficulty'; readonly towerId: string; readonly difficultyId: DifficultyId }
  /** § 8.4's first step: press a tier. Zero-night tiers are fitted here and now. */
  | { readonly kind: 'press-tier'; readonly towerId: string; readonly categoryId: ShopCategoryId; readonly level: number }
  /** § 8.4's second step: pick the night. */
  | { readonly kind: 'pick-start'; readonly startIdx: number }
  /** § 8.4 — *cancel and nothing is spent*. */
  | { readonly kind: 'cancel-booking' }
  /** § 8.2's desk decision. */
  | { readonly kind: 'answer-need'; readonly towerId: string; readonly optionId: string }
  /**
   * § 6.4 step 4 — *"In a campaign run, evaluate the four tests and mark the day cleared or
   * missed"*, as the one thing that moves a contract forward. See {@link fileDay}.
   *
   * `trips` is the day's own loaded car departures — `ENGINE_CONTRACT.md` § 5's run metric — and it
   * rides on the action rather than being read from anywhere, because this module holds no
   * recording and must not learn to. The filer supplies it; see {@link fileDay} for why this is the
   * press that carries it and for what happens when the day could not measure one.
   */
  | {
      readonly kind: 'file-day';
      readonly towerId: string;
      readonly verdict: CampaignDayVerdict;
      readonly trips: number | undefined;
    };

/**
 * Apply an action. Total, pure, and **refusing rather than throwing**: an action the record cannot
 * legally take returns the record it was given.
 *
 * A refusal here is never the player's only signal. Every control the three screens draw is gated
 * on the same predicate this function checks — `economy.ts#shopTierState`'s `pressable`,
 * `startIsLegal`, the need's own option list — so an illegal press is not reachable from the
 * screen, and this arm is the second lock rather than the first (§ 16 rule 6: unaffordable is
 * visible, dimmed and **inert**, never silently clickable).
 */
export function applyCampaignAction(
  career: CampaignCareer,
  action: CampaignAction,
): CampaignCareer {
  switch (action.kind) {
    case 'open-tower': {
      if (towerById(career, action.towerId) === undefined) return career;
      return { ...career, openTowerId: action.towerId, pendingBooking: undefined };
    }
    case 'set-dispatcher':
      return mapTower(career, action.towerId, (tower) => ({
        ...tower,
        dispatcherId: action.dispatcherId,
      }));
    case 'set-build':
      return mapTower(career, action.towerId, (tower) => ({ ...tower, buildId: action.buildId }));
    case 'set-difficulty':
      /* § 8.3: *"Changing it starts a fresh month"* — the footer says so, and so does this. */
      return mapTower(career, action.towerId, (tower) => ({
        ...tower,
        difficultyId: action.difficultyId,
        day: 1,
        missed: 0,
        carry: undefined,
        bookings: [],
      }));
    case 'press-tier':
      return pressTier(career, action.towerId, action.categoryId, action.level);
    case 'pick-start':
      return pickStart(career, action.startIdx);
    case 'cancel-booking':
      return { ...career, pendingBooking: undefined };
    case 'answer-need':
      return answerNeed(career, action.towerId, action.optionId);
    case 'file-day':
      return fileDay(career, action.towerId, action.verdict, action.trips);
  }
}

function mapTower(
  career: CampaignCareer,
  towerId: string,
  edit: (tower: CampaignTower) => CampaignTower,
): CampaignCareer {
  if (towerById(career, towerId) === undefined) return career;
  return {
    ...career,
    towers: career.towers.map((tower) => (tower.id === towerId ? edit(tower) : tower)),
  };
}

/**
 * File the day the player just closed — GAMEPLAY § 8.5's *"a missed day increments the building's
 * `missed`, costs three standing, and moves it closer to the end of the contract"*, and the one
 * action that moves a contract forward.
 *
 * ## Three fields move, and everything else is derived from them
 *
 * `tower.day` advances, `tower.missed` grows on a miss, and `tower.trips` takes the day's loaded car
 * departures. **Nothing else is written**, and that is the decision rather than an omission —
 * `economy.ts` already derives every consequence from the first two:
 *
 * - the purse, because `earnedSoFar` sums `rateOnDay` over the past days that were not missed, so a
 *   cleared day pays this contract's rate for the week it fell in and a missed one pays nothing;
 * - the record (`clearedDays`), the month grid's ✓ and ✗ (`calendarRow`), the renewal's clear rate
 *   (`renewalOffer`), the at-risk list and `contractIsLost`;
 * - § 8.4's standing, which is banked as `carry` when the contract finishes and is already
 *   `clearedDays × 2 − missed × 3` in both arms of {@link answerNeed}.
 *
 * A latched purse or a latched cleared count would be a second answer to a question one of them
 * already contains — `careerIsOver`'s own argument, one function down.
 *
 * ## The wear clock, and on whose authority it moves here
 *
 * `tower.trips` is § 8.3's `wear = min(1.3, trips / serviceAt)` and `daysLeft = round((serviceAt −
 * trips) / 1400)`. **Nothing incremented it** — GitHub issue #313 — so `wearOf`, `failureOddsPct`,
 * `serviceDaysLeft` and `wearHeadOf` were four consumers of a constant, and every check they passed
 * was vacuous. That is `accessZones`' polarity ([§ D265](../../../../DECISIONS.md)): not a behaviour
 * with no caller, but a caller with no behaviour to reach.
 *
 * Who should move it and when is `ENGINE_CONTRACT.md`'s rather than this module's inference. § 5
 * defines `trips` as *count of car departures under load* — a **run** metric, one figure per day
 * played — and § 8.3 spends the accumulation of them, sized against `serviceAt ≈ 45 000` trips at
 * *"1400 trips a working day"*. So the quantity is the day's, and the moment is the day's filing:
 * closing a day is the only event § 8 has that turns a run into a record, and it is already the one
 * thing that moves a contract forward. Nothing else may move it — a press that spent units cannot
 * wear a machine down, and neither can a day that was watched and never filed.
 *
 * **A day that could not be measured adds nothing rather than adding zero.** `trips` arrives
 * `undefined` when the run carried no trip count at all (`shift/types.ts`'s
 * `GoalObservations.loadedDepartures`, whose absence is a gate); the clock then holds where it is.
 * Adding a zero would be the same arithmetic and a different claim — *the machines made no trips
 * today* — about a day nobody counted, and `daysLeft` would go on publishing a figure derived from
 * it.
 *
 * **Negative and non-finite counts are refused** rather than clamped at the consumer. `wearOf`
 * already floors nothing and `serviceDaysLeft` clamps only at zero, so a caller handing this a
 * `NaN` would poison the whole § 8.3 block through four functions before anybody saw it; the guard
 * is here, where the value enters the record, and it is the reducer's own convention — an action the
 * record cannot legally take returns the record it was given.
 *
 * ## Why the career day moves with it
 *
 * § 8.6 keys the rolling calendar off `career.today` and derives a contract's own start from it
 * (`start(t) = careerToday − (t.day − 1)`), so the two have to advance together or a filed day
 * would slide the whole contract under the grid rather than filling one cell of it.
 *
 * **What that costs with more than one building held, said rather than discovered.** Only the tower
 * whose day was run advances, so the unplayed towers' derived start slides forward by one career
 * day. This build has no shipped instance — {@link openingCareer} holds one contract and no action
 * acquires a second — and the alternative is worse: advancing every tower's `day` would pay the
 * player for days they never ran, because a day that is neither cleared nor missed is not
 * representable in `cleared = day − 1 − missed`.
 *
 * ## The two refusals
 *
 * A tower this career does not hold, and a month that is already over — `tower.day` is 1…20 while
 * the contract runs, and reaches 21 when its last day is filed. Past that the next press is § 8.9's
 * renewal, not another day: `rateOnDay` prices twenty days and `contractEndDay` draws twenty
 * columns, so a twenty-first would be a day nobody published a fee or a cell for. Refusing by
 * returning the record unchanged is this reducer's own convention, and the surface refuses first —
 * § 3.3's contract row goes to *Start the month again* once the month is over.
 */
function fileDay(
  career: CampaignCareer,
  towerId: string,
  verdict: CampaignDayVerdict,
  trips: number | undefined,
): CampaignCareer {
  const tower = towerById(career, towerId);
  if (tower === undefined) return career;
  if (tower.day > CONTRACT_DAYS) return career;
  const worn =
    trips === undefined || !Number.isFinite(trips) || trips < 0 ? 0 : Math.round(trips);
  return {
    ...mapTower(career, towerId, (current) => ({
      ...current,
      day: current.day + 1,
      missed: verdict === 'missed' ? current.missed + 1 : current.missed,
      trips: current.trips + worn,
    })),
    today: career.today + 1,
  };
}

/**
 * § 8.4 step one. *"If it needs no nights it is fitted immediately and works tomorrow"* — so a
 * zero-night tier books at today's index and is live the moment `startIdx + 0 ≤ dayIdx` holds,
 * which it does. Anything with nights becomes a {@link PendingBooking} and the grid lights.
 */
function pressTier(
  career: CampaignCareer,
  towerId: string,
  categoryId: ShopCategoryId,
  level: number,
): CampaignCareer {
  const tower = towerById(career, towerId);
  const tier = shopTierAt(categoryId, level);
  if (tower === undefined || tier === undefined) return career;
  if (bookingFor(tower, categoryId, level) !== undefined) return career;
  if (purseOf(tower) < tier.units) return career;
  if (tier.nights === 0) {
    const booking: WorksBooking = {
      categoryId,
      level,
      startIdx: dayIndexOf(tower),
      nights: 0,
      units: tier.units,
    };
    return mapTower(career, towerId, (current) => ({
      ...current,
      bookings: [...current.bookings, booking],
    }));
  }
  return { ...career, pendingBooking: { towerId, categoryId, level } };
}

/**
 * § 8.4 step two. The money leaves the purse **here** — when it is booked, not when it goes live —
 * which is the third of § 8.2's buying rules and the reason `committedUnits` sums bookings.
 */
function pickStart(career: CampaignCareer, startIdx: number): CampaignCareer {
  const pending = career.pendingBooking;
  if (pending === undefined) return career;
  const tower = towerById(career, pending.towerId);
  const tier = shopTierAt(pending.categoryId, pending.level);
  if (tower === undefined || tier === undefined) return { ...career, pendingBooking: undefined };
  if (!startIsLegal(tower, startIdx, tier.nights)) return career;
  if (purseOf(tower) < tier.units) return { ...career, pendingBooking: undefined };
  const booking: WorksBooking = {
    categoryId: pending.categoryId,
    level: pending.level,
    startIdx,
    nights: tier.nights,
    units: tier.units,
  };
  return {
    ...mapTower(career, pending.towerId, (current) => ({
      ...current,
      bookings: [...current.bookings, booking],
    })),
    pendingBooking: undefined,
  };
}

/**
 * § 8.2's desk decision, applied.
 *
 * The renewal arm is where a month rolls over, and it rolls over exactly what § 8.1 and § 8.3 say
 * it does: the purse carries (`carry` becomes what was on hand), the kit stays with the building
 * (live bookings become `fitted`), the wear clock does **not** reset unless the refurbishment was
 * bought, the rate becomes § 8.5's offer, and the contract day starts again at one.
 */
function answerNeed(career: CampaignCareer, towerId: string, optionId: string): CampaignCareer {
  const tower = towerById(career, towerId);
  if (tower === undefined) return career;
  const need = needOf(tower);
  if (need === undefined) return career;
  const option = need.options.find((entry) => entry.id === optionId);
  if (option === undefined) return career;
  if (option.units > purseOf(tower)) return career;

  if (need.kind === 'service') {
    if (option.id === 'leave') return career;
    const starts = startIsLegal(tower, dayIndexOf(tower), option.nights)
      ? dayIndexOf(tower)
      : undefined;
    if (starts === undefined) return career;
    /*
     * A window and a refurbishment are both works and both reset the wear clock; only the
     * refurbishment moves the refit clock, which is what § 8.7 prices its ten nights for. The
     * nights are booked against `machines`, because that is the category § 8.3's relief credits.
     */
    return mapTower(career, towerId, (current) => ({
      ...current,
      trips: 0,
      refit: option.id === 'refurbish' ? 0 : current.refit,
      bookings: [
        ...current.bookings,
        {
          categoryId: 'machines' as const,
          level: 0,
          startIdx: starts,
          nights: option.nights,
          units: option.units,
        },
      ],
    }));
  }

  if (option.id === 'hand-back') {
    /* § 8.9's fourth option: the slot is freed and what the record earned is banked as standing. */
    return {
      ...career,
      carry: career.carry + clearedDays(tower) * 2 - tower.missed * 3,
      towers: career.towers.filter((entry) => entry.id !== towerId),
      openTowerId: career.openTowerId === towerId ? undefined : career.openTowerId,
      monthsWorked: career.monthsWorked + tower.months,
      pendingBooking: undefined,
    };
  }

  const offer = renewalOffer(tower);
  const rate =
    option.id === 'push' ? offer.offered + 1 : offer.offered;
  const dayIdx = dayIndexOf(tower);
  const carriedKit: Partial<Record<ShopCategoryId, number>> = { ...tower.fitted };
  for (const booking of tower.bookings) {
    if (booking.startIdx + booking.nights > dayIdx) continue;
    if (booking.level <= 0) continue;
    carriedKit[booking.categoryId] = Math.max(
      carriedKit[booking.categoryId] ?? 0,
      booking.level,
    );
  }
  return {
    ...career,
    carry: career.carry + clearedDays(tower) * 2 - tower.missed * 3,
    monthsWorked: career.monthsWorked + 1,
    pendingBooking: undefined,
    towers: career.towers.map((entry) =>
      entry.id !== towerId
        ? entry
        : {
            ...entry,
            day: 1,
            missed: 0,
            months: entry.months + 1,
            carry: purseOf(entry) - option.units,
            rate,
            fitted: carriedKit,
            bookings:
              option.id === 'refurbish'
                ? [
                    {
                      categoryId: 'machines' as const,
                      level: 0,
                      startIdx: 0,
                      nights: option.nights,
                      units: option.units,
                    },
                  ]
                : [],
            trips: option.id === 'refurbish' ? 0 : entry.trips,
            refit: option.id === 'refurbish' ? 0 : entry.refit,
          },
    ),
  };
}

/**
 * Whether the career is over — § 8.10's *"three lost contracts and the agency stops calling"*.
 *
 * Counted from `lost` plus the towers whose missed days have already exceeded their allowance, so a
 * contract that is over but still on the screen counts toward the ceiling before anybody clears it
 * away. Derived rather than latched: a latched flag is a second place the count can be wrong.
 */
export function careerIsOver(career: CampaignCareer): boolean {
  const failing = career.towers.filter(contractIsLost).length;
  return career.lost + failing >= LOST_CONTRACTS_MAX;
}
