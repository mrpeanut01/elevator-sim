/**
 * Drawing a day's wrinkle, and § 17's rotation — GitHub issue **#159**.
 *
 * ## The rules, and which of the three this module can keep
 *
 * `GAMEPLAY_AND_NAVIGATION.md` § 17:
 *
 * > **Rotation:** no tower twice in seven days; no wrinkle template twice in fourteen; the pair
 * > (tower, template) never inside a month.
 *
 * Two of those three name a **tower**, and the draw § 17 describes is over `(tower, wrinkle,
 * crowd)`. This build has no tower draw at all: `everyday/today.ts#todayOf` is handed a building,
 * it never picks one, and nothing anywhere selects the day's tower. So:
 *
 * - **no wrinkle template twice in fourteen** — kept here, by {@link drawWrinkle}, on every day the
 *   week's rota draws, and checked against the shipped library at load time by
 *   `library.ts#assertRotates` rather than asserted in prose.
 * - **no tower twice in seven days** and **the pair (tower, template) never inside a month** —
 *   **not implemented, and deliberately not faked.** Both name a tower, and there is no tower draw
 *   to constrain: `everyday/today.ts#todayOf` is handed a building, it never picks one, and nothing
 *   anywhere selects the day's tower. A predicate over a sequence nothing produces is the dead seam
 *   `docs/05-roadmap.md`'s standing requirement is about, so both rules wait for the tower draw.
 *
 *   A `pairIsRotated` was written for the second of them and **deleted before this landed**, which
 *   is the same disposition `model/bank.ts` gave two of its five deck functions. Its docstring
 *   named an offline gate in `packages/experiments` as its caller; that gate is in `gate.ts` here,
 *   it has a tower but no *history* of towers to rotate against, and it never called it. A stated
 *   caller that does not call is the defect the standing requirement is about, arriving as a
 *   sentence instead of as code — `deadCode.test.ts` is what caught it.
 *
 * ## Why the index is `day` and not a hash
 *
 * A template is chosen by `day mod pool.length` over the pool for that day's kind, so two days draw
 * the same template only when they are `pool.length` apart. With 18 weekday templates and 5 weekend
 * ones that is a gap of 18 calendar days for a weekday and — because weekend days fall in pairs
 * seven apart — 15 for a weekend. Both clear fourteen, and it is checked rather than trusted in two places:
 * `library.ts#assertRotates` refuses a library that breaks it at load, and `wrinkles.test.ts`
 * walks every 14-day window over every weekday phase.
 *
 * A hash would have been the obvious choice and cannot make that promise: hashing distributes, it
 * does not space, and two days five apart colliding is exactly what a rotation rule forbids.
 */

import type { RunHorizon } from '../shift/types.js';
import type {
  DrawnWrinkle,
  WholeDayPlacement,
  WrinkleAxis,
  WrinkleAxisValue,
  WrinkleDays,
  WrinkleEffect,
  WrinkleLibrary,
  WrinkleTemplate,
} from './types.js';

/** Weekday indices `5` and `6` are the weekend — `shift/types.ts#WEEKDAYS`' own ordering. */
const FIRST_WEEKEND_INDEX = 5;

/** How many days § 17 forbids a template from repeating inside. */
export const TEMPLATE_ROTATION_DAYS = 14;

/** Which pool a day draws from. `campaign` templates are never in a pool — see {@link poolFor}. */
export function dayKindOf(dayIdx: number): WrinkleDays {
  const wrapped = ((Math.trunc(dayIdx) % 7) + 7) % 7;
  return wrapped >= FIRST_WEEKEND_INDEX ? 'weekend' : 'weekday';
}

/**
 * Which kind of run a day is drawn for — `shift/types.ts#RunHorizon`, imported as a type only, so
 * nothing of `shift/` (which imports this directory) is loaded at run time.
 */
export type DrawHorizon = RunHorizon;

/**
 * The templates a given kind of day may draw, in file order.
 *
 * `campaign` templates are excluded from every pool on purpose: `breakdown` and `coach-party` are
 * the campaign's, reached by id through `campaign/incidents.ts#campaignEventFor`, and the week's
 * rota has never drawn them. `SHIFT_EVENT_IDS` said so in a comment; this says it in code.
 *
 * **On a whole day, a template whose placement is refused is not in the pool** — the week swarm's
 * S2 condition, kept by [§ D1057](../../../../DECISIONS.md): a wrinkle that cannot be spliced
 * honestly into the day is not drawn there, rather than drawn and then described as withheld.
 * The pool is shorter by exactly those rows, so the rotation arithmetic below holds per horizon and
 * `library.ts#assertRotates` checks both.
 */
export function poolFor(
  library: WrinkleLibrary,
  kind: WrinkleDays,
  horizon: DrawHorizon = 'period',
): readonly WrinkleTemplate[] {
  return library.templates.filter(
    (template) =>
      template.days === kind &&
      (horizon === 'period' || template.effect.wholeDay?.kind !== 'refused'),
  );
}

/** A small deterministic mixer, so an axis's choice varies without varying the template's. */
function axisIndex(day: number, dayIdx: number, axis: WrinkleAxis): number {
  let hash = 2166136261;
  for (let i = 0; i < axis.id.length; i += 1) {
    hash ^= axis.id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const mixed = (Math.imul(day, 31) + Math.imul(dayIdx, 7) + (hash >>> 8)) >>> 0;
  return mixed % axis.values.length;
}

/** A placement with an axis value's window or level moved — `caterers`' *when*. */
function placedWith(
  placement: WholeDayPlacement | null | undefined,
  value: WrinkleAxisValue,
): WholeDayPlacement | null {
  if (placement === undefined || placement === null) return null;
  if (placement.kind === 'refused' || value.wholeDay === undefined) return placement;
  return {
    ...placement,
    fromMin: value.wholeDay.fromMin ?? placement.fromMin,
    toMin: value.wholeDay.toMin ?? placement.toMin,
    intensity: value.wholeDay.intensity ?? placement.intensity,
  };
}

/** `HH:MM` for clock minutes since midnight. */
function clockText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes - hours * 60);
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * The whole-day note's `{episode}`: *"from 10:00 to 10:20"*, from the placement the splice uses, so
 * the sentence and the run cannot name different times.
 */
function episodeWindowText(fromMin: number, toMin: number): string {
  return `from ${clockText(fromMin)} to ${clockText(toMin)}`;
}

/* Collapse the double space a silent axis leaves behind, and trim the ends it can leave. */
function tidy(note: string): string {
  return note.replaceAll(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
}

function applyValue(effect: WrinkleEffect, value: WrinkleAxisValue): WrinkleEffect {
  return {
    changesNothing: effect.changesNothing,
    arrivalRateMultiplier:
      value.arrivalRateMultiplier === undefined
        ? effect.arrivalRateMultiplier
        : value.arrivalRateMultiplier,
    directionalSplit:
      value.directionalSplit === undefined ? effect.directionalSplit : value.directionalSplit,
    carsOutOfService:
      value.carsOutOfService === undefined ? effect.carsOutOfService : value.carsOutOfService,
    derate: value.derate === undefined ? effect.derate : value.derate,
    wholeDay: placedWith(effect.wholeDay, value),
  };
}

/**
 * Compose a template and one value per axis into the wrinkle a day actually gets.
 *
 * Exported because the offline gate enumerates concrete wrinkles rather than days: § 17's gate asks
 * whether *a candidate day* shuffles the ranking, and a day is a template plus its chosen values.
 */
export function composeWrinkle(
  template: WrinkleTemplate,
  chosen: readonly WrinkleAxisValue[],
): DrawnWrinkle {
  let effect = template.effect;
  let note = template.note;
  const placed = template.effect.wholeDay;
  let dayNote = placed?.kind === 'episode' ? placed.note : '';
  const parts: string[] = [template.id];
  for (const [index, value] of chosen.entries()) {
    const axis = template.axes[index];
    if (axis === undefined) continue;
    effect = applyValue(effect, value);
    note = note.replaceAll(`{${axis.id}}`, value.label);
    dayNote = dayNote.replaceAll(`{${axis.id}}`, value.label);
    parts.push(value.id);
  }
  /*
   * The whole-day note is composed here, beside the slice note, from the placement the axis values
   * have already moved — so `{episode}` names the window the splice will write, § D1057.
   */
  const wholeDay = effect.wholeDay ?? null;
  return {
    id: parts.join(':'),
    templateId: template.id,
    name: template.name,
    note: tidy(note),
    effect:
      wholeDay?.kind === 'episode'
        ? {
            ...effect,
            wholeDay: {
              ...wholeDay,
              note: tidy(
                dayNote.replace('{episode}', episodeWindowText(wholeDay.fromMin, wholeDay.toMin)),
              ),
            },
          }
        : effect,
  };
}

/** Every concrete wrinkle in the library — the cross product of each template with its axes. */
export function everyWrinkle(library: WrinkleLibrary): readonly DrawnWrinkle[] {
  const out: DrawnWrinkle[] = [];
  for (const template of library.templates) {
    let combos: WrinkleAxisValue[][] = [[]];
    for (const axis of template.axes) {
      combos = combos.flatMap((prefix) => axis.values.map((value) => [...prefix, value]));
    }
    for (const combo of combos) out.push(composeWrinkle(template, combo));
  }
  return out;
}

/**
 * The day's wrinkle. Pure and total in `(day, dayIdx)`, which is what
 * `shift/calendar.ts#scheduledEventFor` promises its callers and what makes two players on day 3
 * meet the same wrinkle.
 */
export function drawWrinkle(
  library: WrinkleLibrary,
  day: number,
  dayIdx: number,
  /*
   * The kind of run the day is drawn for. `'whole-day'` leaves out a template whose whole-day
   * placement is refused ({@link poolFor}); on the shipped library no drawable template is, and
   * `shift/wholeDayEvents.test.ts` holds the two horizons' draws equal while that stays true, so a
   * caller that does not pass the horizon cannot name a different wrinkle from the run until the
   * day a refusal ships — and that test is where it is told.
   */
  horizon: DrawHorizon = 'period',
): DrawnWrinkle {
  const kind = dayKindOf(dayIdx);
  const pool = poolFor(library, kind, horizon);
  if (pool.length === 0) {
    throw new Error(`wrinkles: the ${kind} pool is empty, so no day of that kind can be drawn.`);
  }
  const whole = Math.trunc(day);
  /*
   * `day - 1`, so **day 1 draws the pool's first row** — which is `ordinary`, the one wrinkle that
   * declares `changesNothing`.
   *
   * That is a product rule rather than an arithmetic convenience, and it is § 20.13's: *"Day one
   * must be gradeable … Saturation is something the player causes by week two, never the state a
   * level ships in."* Indexing on `day` put `move-in` on day 1 — a first day with a car already out
   * of service, for a player who has not yet been told what a car is. The offset costs nothing: a
   * template still repeats only after `pool.length` days of its kind, because shifting every index
   * by a constant does not change the gaps between them.
   */
  const index = (((whole - 1) % pool.length) + pool.length) % pool.length;
  // Non-null: `index` is inside the pool by construction.
  const template = pool[index] as WrinkleTemplate;
  const chosen = template.axes.map(
    (axis) => axis.values[axisIndex(whole, Math.trunc(dayIdx), axis)] as WrinkleAxisValue,
  );
  return composeWrinkle(template, chosen);
}
