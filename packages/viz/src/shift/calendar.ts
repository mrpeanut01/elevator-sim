/**
 * The calendar — a between-games axis sitting above the week, and a **building edit** while it is
 * there.
 *
 * ## Legality, stated up front rather than left for a reader to wonder about
 *
 * [`docs/10`](../../../../docs/10-honest-game-design.md) § 5.5 bans *"a difficulty setting that
 * changes anything other than declared `TRAFFIC_PARAMETERS` and building fabric. Difficulty is
 * demand and geometry; it is never a fudge factor on a metric."*
 *
 * A period changes exactly two kinds of thing, and both are on the permitted side of that line:
 *
 * | what a period writes | what it is |
 * |---|---|
 * | floor populations, through {@link scaledBuilding} | **building fabric** — a real `BuildingConfig` |
 * | `demand.directionalSplit` | `traffic.directionalSplit.{incoming,outgoing,interfloor}` |
 * | the demand template | `traffic.template` |
 * | a car reserved out of passenger service | `RecordRunOptions.outOfServiceCarIds` — fabric for a day |
 *
 * and it writes **nothing else**. No metric is touched, no bar is moved, no figure is scaled on its
 * way to a caption. `docs/17` § 4.2 makes the same argument in one sentence — *"a calendar changes
 * demand and fabric and nothing else, so it is admissible"* — and this module is where it has to be
 * true rather than said.
 *
 * ## The seam, which is the whole point
 *
 * `docs/17` § 4.2: *"It attaches at exactly `growth.ts`'s seam — a real edit to a real
 * `BuildingConfig` put back through `parseBuilding`/`resolveBuilding`, never a multiplier on a
 * header."* {@link calendarPatch} returns a `BuildingConfig`, the caller puts it back through the
 * loader exactly as a grown building goes, and the population the kernel counts arrivals against is
 * the population the caption quotes. A vacation implemented as `× 0.6` on a tenant count in a header
 * would be the caption-that-does-not-describe-the-picture defect this repository has now named
 * twelve times — and it would be the *lying* kind, because the run underneath would be unchanged.
 *
 * The population factor is applied to **today's** building rather than to the shipped one, so a
 * vacation in week three is a fraction of week three. Growth keeps rising underneath a period, which
 * is `docs/17` § 4.2's own reason for wanting vacation at all: *"the week where the goals feel easy
 * while the growth curve keeps rising underneath"*.
 *
 * ## `WEEKDAYS` finally means something
 *
 * Before this module the only thing any weekday did was `dayIdx >= 5` in `events.ts#eventFor`. A
 * calendar that ignored which weekday a day is would be a second growth curve — a factor that
 * depends only on how far into the run you are. So {@link Weekday} does three distinct jobs here,
 * and every one of them is load-bearing in a shipped period:
 *
 * 1. **It gates.** {@link CalendarPeriod.appliesOn} names the weekdays a period touches at all;
 *    `quarter-end` is a business-week period and a Saturday inside its window is byte-identical to
 *    no period at all.
 * 2. **It overrides.** {@link CalendarPeriod.overrides} is keyed by weekday, which is what makes
 *    *"the movers do not work Sunday"* and *"the weekend rota is skeleton staff"* expressible as
 *    data rather than as a branch.
 * 3. **It is named.** {@link calendarLine} prints the weekday, because a period is a stretch of days
 *    and *which* day of it you are standing on is the thing a player is deciding against.
 *
 * There is still **no `Date` anywhere in this directory** and there must not be — `types.ts` states
 * why, and `boundaries.test.ts` enforces it. `dayIdx` is an index into {@link WEEKDAYS} and that is
 * the only calendar this layer has.
 *
 * ## What a period may not do, and why the refusals are values
 *
 * Three combinations are refused rather than resolved silently, in {@link CalendarPatch.withheld}'s
 * form — the shape `events.ts` already uses, so a surface prints the refusal beside the period's own
 * note and the caption and the run agree:
 *
 * - **A bias under a mix-varying template.** `core` refuses an explicit `directionalSplit` together
 *   with a template that varies the mix within the run (`lunch-two-way`, whose
 *   `meanDirectionalSplit` is declared): `generateTrace` throws rather than let one win silently. A
 *   period that wanted to bias the mix under such a template therefore cannot, and says so.
 * - **A template over the player's own choice.** Free Play's template select is the reader's most
 *   explicit statement about what to run (§ D215), and a period quietly replacing it would be a
 *   control that stopped working when a calendar was open.
 * - **A template the shift is too short for.** A template declares a period of its own — 30 minutes
 *   for both of the templates a shipped period names, `office-down-peak` and `shift-change`, and 20
 *   for `evening-egress` — and `menu.ts` already refuses a free-play run shorter than that as
 *   leaving nothing to measure. Shorter still and `core` throws outright: at the 300 s free-play
 *   duration the egress's step and hold do not fit inside the run. The period defers to the shift
 *   and reports it.
 *
 * ## The one coarsening, named
 *
 * A declared `directionalSplit` replaces **every floor's** own profile split, not just the
 * building-level one — `TRAFFIC_PARAMETERS` says so: *"set them together or leave all three unset to
 * use each floor's profile."* So on a building whose floors declare different traffic profiles, a
 * period that biases the mix flattens that variation. That is a real coarsening and it is not new:
 * `fire-drill` and `conference` have made exactly the same one since they were written. It is
 * recorded here rather than discovered later.
 */

import {
  expandFloors,
  type BuildingConfig,
  type DemandTemplate,
  type DemandTemplateId,
  type DirectionalSplit,
  type FloorConfig,
  type FloorRange,
  type SimulationDemandOptions,
} from '@elevator-sim/core/browser';

import { scaledBuilding } from './growth.js';
import { carsToDerate, type CarRef } from './incidents.js';
import { weekdayOf, type ShiftEventId, type Weekday } from './types.js';

/* -------------------------------------------------------------------------- *
 * A bias on the directional mix
 * -------------------------------------------------------------------------- */

/**
 * A pull of the mix **toward** a named target, by an amount — never a replacement of it.
 *
 * `amount` is `0`–`1` and the arithmetic is a blend: `share' = (1 − a) · base + a · target`. At `0`
 * the run's own mix survives untouched; at `1` the target replaces it, which is what `fire-drill`
 * and `conference` already do to the split and is therefore the familiar end of the range rather
 * than a new mechanism.
 *
 * ## Why a blend and not a set of multipliers
 *
 * The first draft of this type was three multiplicative weights, in the spirit of
 * `EventEffect.arrivalRateMultiplier` — *"a multiplier rather than an absolute rate, because the
 * absolute rate belongs to the building's traffic profile"*. It is the wrong instrument here, and
 * measurably so: `vacation` wants *the split flatter*, and on `office-standard`'s 85/5/10 the
 * weights that flatten it are `×0.5 / ×3 / ×3`, while the same weights on `residential`'s 15/75/10
 * give 3/85/11 — **less** flat than the base. A multiplier expresses *push this direction harder*
 * and cannot express *make this more even*, so a period declaring one would mean a different thing
 * on every building and the word *flatter* would be false on half of them.
 *
 * A blend toward a target is well-behaved on any base: the result is between the base and the
 * target, and *flatter* is a target of one third each, by definition rather than by luck.
 */
export interface SplitBias {
  /**
   * How {@link calendarLine} names this bias — *flatter*, *toward the lobby*. Prose, and the only
   * prose that reaches a player from this type, so it must describe the direction of travel and not
   * promise a magnitude the amount does not deliver.
   */
  readonly label: string;
  /** The mix this bias pulls toward. Shares are normalized, so they need not sum to 1. */
  readonly toward: DirectionalSplit;
  /** `0`–`1`. `0` leaves the run's own mix alone; `1` replaces it with {@link toward}. */
  readonly amount: number;
}

/**
 * An even mix — a third each.
 *
 * The definition of *flatter*, not a measurement, and it is stated as a constant so that the word
 * in a period's note and the number in its bias are the same thing.
 */
const FLAT: DirectionalSplit = Object.freeze({ incoming: 1 / 3, outgoing: 1 / 3, interfloor: 1 / 3 });

/**
 * A building emptying: almost everybody heading for a terminal floor.
 *
 * `0.1 / 0.8 / 0.1` rather than `0 / 1 / 0`, and the reason is `events.ts`'s own, kept rather than
 * re-argued: a pure one-way trace removes interfloor and incoming demand entirely, which is a
 * *different experiment* — the closed-form oracle's pure up-peak in mirror image — rather than a
 * building whose people are leaving. A tenth each keeps the building recognisable.
 */
const EGRESS: DirectionalSplit = Object.freeze({ incoming: 0.1, outgoing: 0.8, interfloor: 0.1 });

/**
 * The two-way mix, and the one number here that is **cited** rather than assumed.
 *
 * 45 % incoming / 45 % outgoing / 10 % interfloor is CIBSE Guide D's lunch two-way period mix,
 * carried in `data/traffic-profiles.json`'s `lunch-two-way` record and reproduced there by that
 * template's own endpoints. It is the right target for a building that is filling and emptying at
 * once — a hospital rota changeover — and taking it from the reference data rather than inventing a
 * near-miss is the difference between a target and a guess.
 */
const TWO_WAY: DirectionalSplit = Object.freeze({ incoming: 0.45, outgoing: 0.45, interfloor: 0.1 });

/**
 * Boxes and furniture moving between floors, with the lobby feeding them.
 *
 * **Derived, not cited.** No table in this project's references gives a move-in day's mix. It is
 * stated as an assumption: a move-in is the only day on which interfloor traffic outweighs the
 * morning arrival, which is the fact `conference` exists to test from the other direction.
 */
const MOVING: DirectionalSplit = Object.freeze({ incoming: 0.35, outgoing: 0.25, interfloor: 0.4 });

/* -------------------------------------------------------------------------- *
 * What a period does to one day
 * -------------------------------------------------------------------------- */

/**
 * One day's worth of a period — every field of which is something the simulator reads.
 *
 * The same discipline `EventEffect` is built on and for the same reason: a field here that only a
 * caption consumed would be the dead-caption defect, one layer up from the dead-seam defect
 * `docs/05-roadmap.md`'s standing requirement is written about.
 */
export interface CalendarShift {
  /**
   * What today's building population is multiplied by. `1` leaves the fabric alone.
   *
   * Applied to **today's grown building**, through `growth.ts#scaledBuilding` — one implementation
   * of the rounding and of the `expandFloors` total, shared with growth rather than copied beside
   * it. Arrival rate is a percentage of population, so this reaches the trace by construction: a
   * building at 0.25 population generates a quarter of the arrivals at the same declared rate.
   */
  readonly populationFactor: number;
  /** How the mix is pulled, or `null` for *leave it alone*. */
  readonly splitBias: SplitBias | null;
  /**
   * The demand template this period runs on, or `null` for *whatever the run had*.
   *
   * `traffic.template` is a declared `TRAFFIC_PARAMETER`, which is what makes this admissible under
   * § 5.5 — and it is the field that lets a period change the *shape* of a day rather than only its
   * size. Refused, with a reason, when the player has chosen a template themselves.
   */
  readonly demandTemplateId: DemandTemplateId | null;
  /**
   * Today's twist, overriding `events.ts#eventFor`'s schedule, or `null` to leave the week's own
   * schedule alone.
   *
   * A period is *above* the week, so `moving-week` really can be *"`move-in` every day"* —
   * `docs/17` § 4.2's own words — rather than a week that happens to contain one move-in on day 3.
   * An id rather than a `ShiftEvent`, so this module does not import the event table and the two
   * directories keep one owner apiece for *what an event does*.
   */
  readonly eventId: ShiftEventId | null;
  /**
   * Cars reserved out of **passenger** service for the whole day — the movers' goods car.
   *
   * A whole-shift hold rather than an incident, and the distinction is `incidents.ts`'s own: a
   * reserved goods car is *not in the building today* as far as a passenger is concerned, which is
   * exactly what `RecordRunOptions.outOfServiceCarIds` means. A car that leaves and comes back is a
   * different mechanic and belongs to an incident.
   */
  readonly goodsCars: number;
  /**
   * The sentence a coach ribbon shows. Atmosphere, and true of the **population** — the one part of
   * a shift that is never withheld.
   *
   * Deliberately not a claim about the mix or the template: those two can be refused (see
   * {@link CalendarPatch.withheld}), and a note asserting a mechanism the run did not get would be
   * the caption defect. {@link calendarLine} is the line that describes the run, and it is built
   * from what was **applied**.
   */
  readonly note: string;
}

/**
 * A per-weekday override: the fields it names win, the rest are the period's own.
 *
 * Absence means *inherit*; an explicit `null` on a nullable field means *not today*. That
 * distinction is what lets `moving-week` say *the movers do not work Sunday* by writing
 * `{ eventId: null, goodsCars: 0 }` rather than restating the whole shift.
 */
export type CalendarOverride = Partial<CalendarShift>;

/* -------------------------------------------------------------------------- *
 * A period
 * -------------------------------------------------------------------------- */

export const CALENDAR_PERIOD_IDS = [
  'vacation',
  'public-holiday',
  'moving-week',
  'quarter-end',
  'rota-week',
] as const;

export type CalendarPeriodId = (typeof CALENDAR_PERIOD_IDS)[number];

/** A stretch of days that changes what the building is and what its demand looks like. */
export interface CalendarPeriod {
  readonly id: CalendarPeriodId;
  /** The name a menu shows. */
  readonly name: string;
  /** What this period is for, in the player's terms. */
  readonly note: string;
  /** First day of the window, 1-based and **inclusive**. Matched against `WeekState.day`. */
  readonly fromDay: number;
  /** Last day of the window, inclusive. Equal to {@link fromDay} for a single day. */
  readonly toDay: number;
  /**
   * The weekdays this period touches at all, or `null` for every day.
   *
   * A day inside the window but outside this list is byte-identical to no period — see
   * {@link calendarDayFor}, and `calendar.test.ts` asserts it on the legs.
   */
  readonly appliesOn: readonly Weekday[] | null;
  /** What the period does on an ordinary day of itself. */
  readonly shift: CalendarShift;
  /** Days of the week that differ from {@link shift}. */
  readonly overrides: Readonly<Partial<Record<Weekday, CalendarOverride>>>;
}

/**
 * The five shipped periods.
 *
 * Four are `docs/17` § 4.2's own, with its reason for each kept beside it. The fifth — `rota-week` —
 * is added because the shipped `data/` asks for it out loud; see its own note below.
 *
 * Every window here is a **default**, and the menu re-windows a period with {@link periodOnDays}: a
 * period is a shape (*what a vacation is*) plus a placement (*which days it covers*), and only the
 * shape is data this module owns.
 */
export const CALENDAR_PERIODS: Readonly<Record<CalendarPeriodId, CalendarPeriod>> = Object.freeze({
  /*
   * "Occupancy well down, the split flatter. The week where the goals feel easy while the growth
   * curve keeps rising underneath, which is a good lesson badly served by a flat difficulty ramp."
   *
   * NOT CITED: 0.6, and the 0.6 blend. Both are assumptions about how empty an office is in August.
   */
  vacation: Object.freeze({
    id: 'vacation',
    name: 'Vacation week',
    note: 'Half the building is away. The week where the bars feel generous — and the growth curve is still climbing underneath it.',
    fromDay: 1,
    toDay: 7,
    appliesOn: null,
    shift: Object.freeze({
      populationFactor: 0.6,
      splitBias: Object.freeze({ label: 'flatter', toward: FLAT, amount: 0.6 }),
      demandTemplateId: null,
      eventId: null,
      goodsCars: 0,
      note: 'Three in five are in. Nobody is in a hurry.',
    }),
    overrides: Object.freeze({}),
  }),

  /*
   * "One day at a fraction of demand."
   *
   * A single day by default, and the only period that declares no bias, no template and no car: a
   * public holiday is *fewer people*, and dressing it with a mechanism would make it a second
   * vacation. It is also the period that proves the § D177 rule cuts both ways — a day that should
   * be quiet still has to move the legs, in the other direction, or the control is inert.
   */
  'public-holiday': Object.freeze({
    id: 'public-holiday',
    name: 'Public holiday',
    note: 'The doors are open and almost nobody came. A skeleton day.',
    fromDay: 1,
    toDay: 1,
    appliesOn: null,
    shift: Object.freeze({
      populationFactor: 0.25,
      splitBias: null,
      demandTemplateId: null,
      eventId: null,
      goodsCars: 0,
      note: 'A quarter of the building came in, and nothing else about today has changed.',
    }),
    overrides: Object.freeze({}),
  }),

  /*
   * "`move-in` every day plus a reserved goods car; needs § 4.1 to be expressible."
   *
   * § 4.1 landed — `shift/incidents.ts` is `serviceEvents`' first non-test caller — so both halves
   * are expressible now: the event override makes every day a move-in day, and the goods car is a
   * whole-shift hold. Saturday is the heavy day and Sunday is not a moving day at all, which is the
   * per-weekday override earning its place rather than demonstrating itself.
   */
  'moving-week': Object.freeze({
    id: 'moving-week',
    name: 'Moving week',
    note: 'A whole floor is changing tenant. Every day is a move-in day and one car belongs to the movers.',
    fromDay: 1,
    toDay: 7,
    appliesOn: null,
    shift: Object.freeze({
      populationFactor: 1,
      splitBias: Object.freeze({ label: 'toward floor-to-floor', toward: MOVING, amount: 0.5 }),
      demandTemplateId: null,
      eventId: 'move-in' as ShiftEventId,
      goodsCars: 1,
      note: 'Boxes all day. One car is spoken for.',
    }),
    overrides: Object.freeze({
      // The big push, and the day the building is otherwise quiet enough to allow it.
      Saturday: Object.freeze({ goodsCars: 2, note: 'The heavy day: two cars are the movers’.' }),
      // Movers do not work Sunday. The period is still on — the tenants are still half moved in —
      // but nothing is reserved and the week's own event schedule is left alone.
      Sunday: Object.freeze({
        eventId: null,
        goodsCars: 0,
        note: 'Nobody moves on a Sunday. The boxes are where they were left.',
      }),
    }),
  }),

  /*
   * "Demand up and a sustained evening egress."
   *
   * **It runs `office-down-peak`, not `evening-egress`, and the swap is the whole of
   * `DECISIONS.md` § D263.** `docs/17` § 4.2's sentence — *"which is what `evening-egress` was
   * authored for"* — was wrong about that record and this period was the evidence: `evening-egress`
   * is named *Event egress*, its `$comment` argues a ballroom emptying, and this period is an office
   * end of day. § D244 then gave every template exactly one `startOfDayMin`, and one record cannot
   * be both 17:30 and 22:30. So the office reading has its own record, with its own hour and its own
   * citation status, and this period selects it; `evening-egress` keeps the ballroom, which
   * `crown-hotel` and the challenge rotation are the callers of.
   *
   * **The period is 30 minutes now rather than 20**, because `office-down-peak` inherits
   * `rise-and-fall`'s duration. That is no more demanding than the shipped default: 1 800 s is both
   * `DEFAULT_SHIFT_LENGTH_S` and the default template's own period, so a shift too short for this
   * one was already too short to measure the template it replaced.
   *
   * The business week only: a quarter does not end on a Saturday, and `appliesOn` is what says so.
   * That is also the clause that makes the *inverse* assertion available — a Saturday inside this
   * window has to be byte-identical to no period at all.
   *
   * NOT CITED: 1.15. An assumption about how many people are in the office when the numbers are
   * being filed.
   *
   * **The bias is still this period's job and not the template's**, and the reason is on the record:
   * `office-down-peak` authors no `directionalSplitAtStart`, so the mix stays the caller's to set
   * and {@link calendarPatch} applies it here rather than withholding it. What that costs is
   * measured and named rather than implied — an 0.5 blend toward `EGRESS` off an 85/5/10 office
   * profile leaves *incoming* the larger share, which `calendar.test.ts` asserts in those words.
   */
  'quarter-end': Object.freeze({
    id: 'quarter-end',
    name: 'Quarter end',
    note: 'Everyone is in, and the whole building leaves at once when the numbers are filed.',
    fromDay: 1,
    toDay: 5,
    appliesOn: Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const),
    shift: Object.freeze({
      populationFactor: 1.15,
      splitBias: Object.freeze({ label: 'toward the lobby', toward: EGRESS, amount: 0.5 }),
      demandTemplateId: 'office-down-peak' as DemandTemplateId,
      eventId: null,
      goodsCars: 0,
      note: 'A fuller building than usual, and it empties in one go.',
    }),
    overrides: Object.freeze({
      // Filing day. The fullest building of the period and the hardest egress in it, which is the
      // per-weekday override doing the thing a flat period cannot: a stretch of days with a shape.
      Friday: Object.freeze({
        populationFactor: 1.25,
        splitBias: Object.freeze({ label: 'hard toward the lobby', toward: EGRESS, amount: 0.8 }),
        note: 'Filing day. Everybody is in, and everybody leaves together.',
      }),
    }),
  }),

  /*
   * The fifth, and the shipped `data/` asks for it by name.
   *
   * `data/buildings/st-jude-hospital.json`'s own `$comment`: the building *"is meant to be run
   * against the `shift-change` demand template rather than an office's rise-and-fall"*, because a
   * hospital's peaks **are** rota changeovers. `shift-change` ships in `data/traffic-profiles.json`
   * and is resolved by `core`, and **nothing in this repository pairs it with anything**: Free Play
   * offers it in a list of every loaded template — so it is selectable, and the claim here is
   * narrower than *dead* — but no authored configuration, campaign stage, challenge or building ever
   * asks for it, so the pairing the hospital's own comment requests has to be made by hand or not at
   * all. This period is that pairing, made once and in data.
   *
   * It is also the period that most needs the weekday to mean something. A hospital does not empty
   * at the weekend, it *thins*: the weekend rota is skeleton staff on the same two-way mix, which
   * is two override entries and no new mechanism.
   *
   * NOT CITED: 0.55 for the weekend rota. An assumption. The two-way target is cited — see
   * {@link TWO_WAY}.
   */
  'rota-week': Object.freeze({
    id: 'rota-week',
    name: 'Rota week',
    note: 'The building never empties. It turns over — one shift leaving while the next arrives, twice a day.',
    fromDay: 1,
    toDay: 7,
    appliesOn: null,
    shift: Object.freeze({
      populationFactor: 1,
      splitBias: Object.freeze({ label: 'two-way', toward: TWO_WAY, amount: 0.7 }),
      demandTemplateId: 'shift-change' as DemandTemplateId,
      eventId: null,
      goodsCars: 0,
      note: 'Two peaks, and a trough that never reaches zero.',
    }),
    overrides: Object.freeze({
      Saturday: Object.freeze({
        populationFactor: 0.55,
        note: 'Weekend rota: skeleton staff, same changeover.',
      }),
      Sunday: Object.freeze({
        populationFactor: 0.55,
        note: 'Weekend rota: skeleton staff, same changeover.',
      }),
    }),
  }),
});

/**
 * The same period placed on different days.
 *
 * The menu's whole job with a period: *which week is the vacation?* A new object every time and the
 * input untouched, so a period is a value a screen can hold two of.
 *
 * `toDay` below `fromDay` is not repaired here — it produces a window no day is inside, which
 * {@link calendarDayFor} reports as *no period today* and is therefore the empty calendar rather
 * than an error. A silent swap would let a screen show a window it is not running.
 */
export function periodOnDays(
  period: CalendarPeriod,
  fromDay: number,
  toDay: number,
): CalendarPeriod {
  return { ...period, fromDay, toDay };
}

/* -------------------------------------------------------------------------- *
 * Resolving today
 * -------------------------------------------------------------------------- */

/** Today, inside a period: which period, which weekday, and what it does. */
export interface CalendarDay {
  readonly periodId: CalendarPeriodId;
  /** The period's own name, for a header. */
  readonly name: string;
  /** 1-based, the `WeekState.day` this was resolved for. */
  readonly day: number;
  readonly weekday: Weekday;
  /** The period's shift with today's override merged over it. */
  readonly shift: CalendarShift;
  /** `true` when a weekday override changed today. For a surface that wants to mark it. */
  readonly overridden: boolean;
}

/**
 * What the period does today — or `null`, which is the whole of *no calendar*.
 *
 * `null` in three cases and they are deliberately indistinguishable to a caller: no period at all,
 * a day outside the window, and a weekday the period does not touch. All three mean *today is an
 * ordinary day*, and a caller that treated them differently would be inventing a state the product
 * does not have.
 *
 * Pure in `(period, day, dayIdx)` — no clock, no draw, no `Date` — so a week replays exactly, which
 * is the same property CLAUDE.md invariant 5 asks of a run.
 */
export function calendarDayFor(
  period: CalendarPeriod | null,
  day: number,
  dayIdx: number,
): CalendarDay | null {
  if (period === null) return null;
  if (day < period.fromDay || day > period.toDay) return null;

  const weekday = weekdayOf(dayIdx);
  if (period.appliesOn !== null && !period.appliesOn.includes(weekday)) return null;

  const override = period.overrides[weekday];
  return {
    periodId: period.id,
    name: period.name,
    day,
    weekday,
    shift: override === undefined ? period.shift : { ...period.shift, ...override },
    overridden: override !== undefined,
  };
}

/* -------------------------------------------------------------------------- *
 * The patch
 * -------------------------------------------------------------------------- */

export interface CalendarPatchInput {
  /** Today, from {@link calendarDayFor}. `null` is the no-calendar case and costs nothing. */
  readonly day: CalendarDay | null;
  /**
   * The building the run would otherwise use — **grown, and before incidents**.
   *
   * A `BuildingConfig` rather than a `ResolvedBuilding`, because the output goes back through
   * `parseBuilding`/`resolveBuilding` like every other building edit in this directory.
   */
  readonly building: BuildingConfig;
  /**
   * The directional mix in effect after the day's event — `patch.demand.directionalSplit` when the
   * event set one, the building's own profile split otherwise.
   *
   * Taken as an input rather than looked up, so a period biases the mix the run **actually has**: a
   * fire drill inside a vacation is still a drill, pulled a little flatter, rather than a drill the
   * calendar quietly cancelled.
   */
  readonly split: DirectionalSplit;
  /** The demand template in effect. Used to decide whether a bias can be applied at all. */
  readonly demandTemplateId: DemandTemplateId;
  /**
   * `data/traffic-profiles.json`'s own `demandTemplates` records — `resources.trafficProfiles
   * .demandTemplates`.
   *
   * Two questions are answered from them rather than from a list kept here, and both are facts about
   * the reference data rather than about this module:
   *
   * - **Does this template vary the directional mix within the run?** A record declaring
   *   `directionalSplitAtStart` is the thing that makes the resolved template carry a
   *   `meanDirectionalSplit`, and `core`'s `resolveDemandTemplate` refuses a template that disagrees
   *   with itself about that. So the record is the authority, and a sixth template that varied the
   *   mix would be handled the day it shipped rather than the day somebody remembered this list.
   * - **Is the shift long enough to run it?** {@link runLengthS}.
   */
  readonly demandTemplates: readonly DemandTemplate[];
  /**
   * How long the shift is, in simulated seconds — `state.shiftLengthS`, the same value the incidents
   * are scheduled against.
   *
   * A period that imposes a demand template has to know, because a template declares a period of its
   * own: `evening-egress` is 20 minutes and `shift-change` is 30, and `menu.ts` already **refuses**
   * a free-play run shorter than a template's declared duration in exactly those words — *"a
   * 5-minute run leaves nothing to measure"*. Shorter still, `core` throws outright: at 300 s the
   * egress's step and hold do not fit inside the run at all, and 300 s is one of the five offered
   * free-play durations.
   *
   * So the period defers to the run rather than the other way round, and says so. A calendar that
   * silently ran a 20-minute template over five minutes would be publishing a shape nobody could
   * measure; one that threw would take the shift with it.
   */
  readonly runLengthS: number;
  /**
   * Whether {@link demandTemplateId} is the **player's** explicit choice (Free Play's select) rather
   * than a default. A period does not overrule it; it says so instead.
   */
  readonly templateChosenByPlayer?: boolean | undefined;
  /**
   * Runtime car ids already spoken for today — the day's whole-shift holds and the cars any incident
   * has scheduled.
   *
   * Without it a goods car and a move-in derate pick the **same** car by the same total order, and
   * the incident's return-to-service event would put the movers' car back in passenger service
   * halfway through the shift. The reservation steps down the same order instead.
   */
  readonly spokenForCarIds?: readonly string[] | undefined;
}

export interface CalendarPatch {
  /** Echoed back so a caption is built from the patch alone. `null` when no period applies. */
  readonly day: CalendarDay | null;
  /**
   * The building to run, which is **the input object itself** when the calendar changed no fabric.
   *
   * Identity, not equality: the caller's *did anything happen today?* check is an identity test
   * (`incidents.ts#withIncidents` established it), and a fresh-but-equal object would force a second
   * parse and resolve on every ordinary day and make every run's building document a new value —
   * and the building document is digested into a leaderboard board.
   */
  readonly building: BuildingConfig;
  /** Merged **over** the run's own demand options. Empty when no period applies. */
  readonly demand: SimulationDemandOptions;
  /** The template this period runs on, or `null` for *leave the run's own alone*. */
  readonly demandTemplateId: DemandTemplateId | null;
  /** Today's twist, overriding the week's schedule, or `null`. `SHIFT_EVENTS` is keyed by it. */
  readonly eventId: ShiftEventId | null;
  /** Runtime car ids to add to `RecordRunOptions.outOfServiceCarIds`. Sorted. */
  readonly outOfServiceCarIds: readonly string[];
  /** Parts of the period that could not be applied, each with its reason. Never swallowed. */
  readonly withheld: readonly string[];
  /**
   * People in the building before and after the fabric edit, both counted through `core`'s own
   * `expandFloors`. `null` when the fabric was not touched.
   *
   * Carried so {@link calendarLine} can quote the population the **run** has rather than the factor
   * that was asked for. They differ: populations round per floor, and a caption quoting `× 0.6` of a
   * number nobody counted is the shape of claim this repository has three published examples of.
   */
  readonly population: { readonly before: number; readonly after: number } | null;
}

/**
 * Turn today's period into the values a run is built from.
 *
 * Pure. Reads no clock, draws no random number, mutates neither its input building nor its period,
 * and returns a fresh patch every call.
 *
 * ## Where this goes in `shiftRunConfigOf`, and why it is two calls rather than one
 *
 * {@link calendarDayFor} is called **early** — before `eventFor` — because a period may name today's
 * event and `shiftRunPatch` needs to be handed the event that is actually running:
 *
 * ```ts
 * const today = calendarDayFor(period, state.week.day, state.week.dayIdx);
 * const event = today?.shift.eventId === undefined || today.shift.eventId === null
 *   ? eventFor(state.week.day, state.week.dayIdx)
 *   : SHIFT_EVENTS[today.shift.eventId];
 * ```
 *
 * This function is called **late** — after `shiftRunPatch`, before `withIncidents`:
 *
 * - after `grownBuilding`, because a period scales *today's* building rather than the shipped one;
 * - after `shiftRunPatch`, because {@link CalendarPatchInput.split} is the mix the run actually has
 *   once the day's event has spoken, and because the cars that event took are what
 *   {@link CalendarPatchInput.spokenForCarIds} steps over;
 * - **before** `withIncidents`, because the incident schedule is written onto the building this
 *   returns — so one `parseBuilding`/`resolveBuilding` covers both edits, and the existing
 *   *"nothing happened today"* identity check (`withEvents === grown`) still holds untouched, since
 *   this returns its input building when the calendar changed no fabric.
 *
 * The remaining three outputs go where their names say: {@link CalendarPatch.demand} merged over the
 * run's demand options **after** the event's, {@link CalendarPatch.demandTemplateId} in place of the
 * run's template when it is not `null`, and {@link CalendarPatch.outOfServiceCarIds} into the same
 * `Set` the event's holds already go into. {@link CalendarPatch.withheld} is appended to the run's.
 */
export function calendarPatch(input: CalendarPatchInput): CalendarPatch {
  const { day } = input;
  if (day === null) {
    return {
      day: null,
      building: input.building,
      demand: {},
      demandTemplateId: null,
      eventId: null,
      outOfServiceCarIds: [],
      withheld: [],
      population: null,
    };
  }

  const { shift } = day;
  const withheld: string[] = [];

  /* --- fabric ---------------------------------------------------------- */
  const building =
    shift.populationFactor === 1 ? input.building : scaledBuilding(input.building, shift.populationFactor);
  const population =
    building === input.building
      ? null
      : { before: populationOf(input.building), after: populationOf(building) };

  /* --- the template ---------------------------------------------------- */
  let demandTemplateId: DemandTemplateId | null = null;
  if (shift.demandTemplateId !== null) {
    const wanted = shift.demandTemplateId;
    const minimumS = declaredPeriodOf(input.demandTemplates, wanted);
    if (input.templateChosenByPlayer === true) {
      withheld.push(
        `${day.name}: this period runs on the ${wanted} demand template, and you have chosen ` +
          `${input.demandTemplateId} yourself. Your choice stands — the calendar does not overrule ` +
          'a control you set.',
      );
    } else if (minimumS !== null && input.runLengthS < minimumS) {
      withheld.push(
        `${day.name}: this period runs on the ${wanted} demand template, which declares a ` +
          `${String(Math.round(minimumS / 60))}-minute period; a ` +
          `${String(Math.round(input.runLengthS / 60))}-minute shift leaves nothing to measure of ` +
          `it. The run keeps ${input.demandTemplateId}.`,
      );
    } else {
      demandTemplateId = wanted;
    }
  }
  const runningTemplate = demandTemplateId ?? input.demandTemplateId;

  /* --- the mix --------------------------------------------------------- */
  const demand: { directionalSplit?: DirectionalSplit } = {};
  if (shift.splitBias !== null) {
    const record = input.demandTemplates.find((entry) => entry.id === runningTemplate);
    if (record === undefined) {
      withheld.push(
        `${day.name}: this build ships no record for the ${runningTemplate} demand template, so ` +
          'the calendar cannot tell whether that template varies the directional mix within the ' +
          'run — and setting a mix under one that does is a run the engine refuses. The mix was ' +
          'left as it was.',
      );
    } else if (record.directionalSplitAtStart !== undefined) {
      withheld.push(
        `${day.name}: the directional mix is set by this run’s ${runningTemplate} demand template, ` +
          'which varies it within the run. The engine refuses both at once rather than letting one ' +
          'win silently, so the mix is the template’s and only the building moved.',
      );
    } else {
      demand.directionalSplit = biasedSplit(input.split, shift.splitBias);
    }
  }

  /* --- the goods cars -------------------------------------------------- */
  const reserved =
    shift.goodsCars > 0
      ? reserveCars(building, shift.goodsCars, input.spokenForCarIds ?? [])
      : { ids: [] as readonly string[], shortfall: 0 };
  if (reserved.shortfall > 0) {
    withheld.push(
      `${day.name}: asked to reserve ${String(shift.goodsCars)} car(s) for the day and could ` +
        `reserve ${String(shift.goodsCars - reserved.shortfall)}. Every bank keeps at least one car ` +
        'in service — a bank with none is a set of floors nobody can reach — and a car another part ' +
        'of today has already taken is not free to reserve.',
    );
  }

  return {
    day,
    building,
    demand,
    demandTemplateId,
    eventId: shift.eventId,
    outOfServiceCarIds: reserved.ids,
    withheld,
    population,
  };
}

/**
 * The line a surface prints about today's period — built from what was **applied**.
 *
 * Every clause is read off the patch rather than off the period's declaration, which is the whole
 * discipline: a bias that was withheld does not appear, a template that lost to the player's own
 * choice does not appear, and the population is the one the building actually carries rather than
 * the factor that was asked for. A caption assembled from a declaration would be describing the
 * configuration somebody wanted instead of the run they got.
 *
 * The empty string when no period applies, so a caller can print it unconditionally.
 */
export function calendarLine(patch: CalendarPatch): string {
  const { day } = patch;
  if (day === null) return '';

  const parts: string[] = [];
  if (patch.population !== null) {
    const after = patch.population.after.toLocaleString('en-GB');
    const before = patch.population.before.toLocaleString('en-GB');
    // Two phrasings, because *"1,957 of 1,710 people in"* reads as a subset of a number it exceeds.
    // A period may fill the building as readily as it empties it, and the line has to survive both.
    parts.push(
      patch.population.after > patch.population.before
        ? `${after} people in, ${before} on an ordinary day`
        : `${after} of ${before} people in`,
    );
  }
  if (patch.demand.directionalSplit !== undefined && day.shift.splitBias !== null) {
    parts.push(`mix ${day.shift.splitBias.label}`);
  }
  if (patch.demandTemplateId !== null) parts.push(`on the ${patch.demandTemplateId} template`);
  if (patch.outOfServiceCarIds.length > 0) {
    const cars = patch.outOfServiceCarIds.length;
    parts.push(`${String(cars)} car${cars === 1 ? '' : 's'} reserved`);
  }

  const head = `${day.name} · ${day.weekday}`;
  // No clause means the period applies today and asks nothing of the run — which is a legitimate
  // day of a period and is said, rather than printed as a bare heading a reader would mistrust.
  return parts.length === 0
    ? `${head} — the building is running as it would anyway`
    : `${head} — ${parts.join(', ')}`;
}

/* -------------------------------------------------------------------------- *
 * The arithmetic
 * -------------------------------------------------------------------------- */

/**
 * `base` pulled `amount` of the way toward `bias.toward`, normalized.
 *
 * Normalized here as well as in `core` — `generateTrace`'s own `normalizeSplit` does it again on the
 * way in — because the blend needs both endpoints on the same scale to mean anything, and because
 * the result is a number a caption may quote. The two normalizations agree by construction: it is
 * the same division by the same sum.
 */
function biasedSplit(base: DirectionalSplit, bias: SplitBias): DirectionalSplit {
  const amount = Math.min(1, Math.max(0, bias.amount));
  const from = normalized(base);
  const to = normalized(bias.toward);
  return normalized({
    incoming: from.incoming + amount * (to.incoming - from.incoming),
    outgoing: from.outgoing + amount * (to.outgoing - from.outgoing),
    interfloor: from.interfloor + amount * (to.interfloor - from.interfloor),
  });
}

/**
 * The period a demand template declares, in seconds — or `null` when this build ships no record.
 *
 * `durationMin × 60`, which is the same arithmetic `menu/catalogue.ts` performs to produce the
 * `minimumDurationS` its own free-play validator refuses a shorter run against. One quantity, two
 * readers, and the refusal a player meets is worded the same way in both places.
 */
function declaredPeriodOf(
  templates: readonly DemandTemplate[],
  id: DemandTemplateId,
): number | null {
  const record = templates.find((entry) => entry.id === id);
  return record === undefined ? null : record.durationMin * 60;
}

/** Shares over their sum. A split with no positive share is left alone for `core` to refuse by name. */
function normalized(split: DirectionalSplit): DirectionalSplit {
  const total = split.incoming + split.outgoing + split.interfloor;
  if (!Number.isFinite(total) || total <= 0) return split;
  return {
    incoming: split.incoming / total,
    outgoing: split.outgoing / total,
    interfloor: split.interfloor / total,
  };
}

/**
 * How many people a building document declares, through `core`'s own `expandFloors`.
 *
 * The same function `resolveBuilding` calls, for the same reason `growth.ts` gives: range expansion
 * and the explicit-floor precedence rule are read from one implementation rather than two.
 */
function populationOf(config: {
  readonly floors?: readonly FloorConfig[] | undefined;
  readonly floorRanges?: readonly FloorRange[] | undefined;
}): number {
  return expandFloors(config).reduce((sum, floor) => sum + floor.population, 0);
}

/** The id `Simulation` gives a car at run time, and the one `outOfServiceCarIds` is matched on. */
function carRuntimeId(car: CarRef): string {
  return `${car.bankId}-${car.carId}`;
}

/**
 * Reserve `count` cars that nothing else today has taken.
 *
 * The order is `incidents.ts#carsToDerate`'s — the same total order the day's event and the player's
 * own holds use, so *which car goes out today* has one answer. Cars already spoken for are stepped
 * over rather than double-booked: a goods car that was also a move-in derate would be put back into
 * passenger service by the incident's return event, halfway through a shift the movers still have it.
 *
 * The widening loop terminates on the building rather than on a count: `carsToDerate` never empties
 * a bank, so once asking for one more returns no more cars, there are none left to reserve and the
 * shortfall is reported rather than papered over.
 */
function reserveCars(
  building: { readonly banks: readonly { readonly id: string; readonly cars: readonly { readonly id: string }[] }[] },
  count: number,
  spokenFor: readonly string[],
): { readonly ids: readonly string[]; readonly shortfall: number } {
  const taken = new Set(spokenFor);
  let wanted = taken.size + count;
  let held = carsToDerate(building, wanted).held;
  let free = held.map(carRuntimeId).filter((id) => !taken.has(id));

  while (free.length < count) {
    const next = carsToDerate(building, wanted + 1).held;
    if (next.length === held.length) break;
    wanted += 1;
    held = next;
    free = held.map(carRuntimeId).filter((id) => !taken.has(id));
  }

  const ids = free.slice(0, count).sort((a, b) => a.localeCompare(b));
  return { ids: Object.freeze(ids), shortfall: count - ids.length };
}
