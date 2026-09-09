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
 * seven apart — 15 for a weekend. Both clear fourteen, and `draw.test.ts` asserts it by walking
 * every 14-day window over every weekday phase rather than by trusting this paragraph.
 *
 * A hash would have been the obvious choice and cannot make that promise: hashing distributes, it
 * does not space, and two days five apart colliding is exactly what a rotation rule forbids.
 */

import type {
  DrawnWrinkle,
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
 * The templates a given kind of day may draw, in file order.
 *
 * `campaign` templates are excluded from every pool on purpose: `breakdown` and `coach-party` are
 * the campaign's, reached by id through `campaign/incidents.ts#campaignEventFor`, and the week's
 * rota has never drawn them. `SHIFT_EVENT_IDS` said so in a comment; this says it in code.
 */
export function poolFor(library: WrinkleLibrary, kind: WrinkleDays): readonly WrinkleTemplate[] {
  return library.templates.filter((template) => template.days === kind);
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
  const parts: string[] = [template.id];
  for (const [index, value] of chosen.entries()) {
    const axis = template.axes[index];
    if (axis === undefined) continue;
    effect = applyValue(effect, value);
    note = note.replaceAll(`{${axis.id}}`, value.label);
    parts.push(value.id);
  }
  return {
    id: parts.join(':'),
    templateId: template.id,
    name: template.name,
    /* Collapse the double space a silent axis leaves behind, and trim the ends it can leave. */
    note: note.replaceAll(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim(),
    effect,
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
export function drawWrinkle(library: WrinkleLibrary, day: number, dayIdx: number): DrawnWrinkle {
  const kind = dayKindOf(dayIdx);
  const pool = poolFor(library, kind);
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
