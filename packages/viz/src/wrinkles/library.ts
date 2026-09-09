/**
 * The parsed library, and the one place `data/wrinkles.json` enters the program — issue **#159**.
 *
 * ## Bundled rather than fetched, and § 17 is the reason
 *
 * Every other document in `data/` reaches the viewer through `dev/data.ts`'s `fetchJson` at boot
 * and is then threaded to whatever needs it. This one is imported, and the argument is § 17's own
 * second consequence:
 *
 * > the generator's output must be pinned to a commit, or everyone's "same tower" quietly diverges
 *
 * A bundled library is pinned to the commit **by construction**: the bytes that shipped are the
 * bytes that drew the day, and there is no fetch that could serve a different revision to two
 * players. A fetched one would need a version check to make the same promise.
 *
 * The mechanical half matters as much. `shift/calendar.ts#scheduledEventFor` is *pure in
 * `(period, day, dayIdx)`* — deliberately, and `briefView.ts` states what that purity buys: *"two
 * players on day 3 meet the same wrinkle by construction"*. Threading an asynchronously fetched
 * library through it would have made eleven call sites take a parameter they have no use for, and
 * would have replaced a pure function with one whose answer depends on what had loaded.
 *
 * The cost is stated rather than hidden: this is the **only** JSON import in the repository, so it
 * is a convention of one, and `data/wrinkles.json` is consequently in the bundle whether or not a
 * screen draws a wrinkle. It is about nine kilobytes.
 *
 * ## No `DECISIONS.md` number, and why not
 *
 * Two of this issue's choices reach past the module that took them — this import, which is a
 * repository-first convention, and `ShiftEvent.id` widening from a closed union to a string, which
 * `shift/types.ts` argues at the field. [§ D405](../../../../DECISIONS.md) is the rule that decides
 * what happens next: a number is allocated to a lane **before** it starts, from a block the
 * integrator reserves, and a lane with no block may not take one — *"never take the number above
 * it, because the next lane holds it"*. This work had no block. So the docstring **is** the record
 * § D405 says it is, at both sites, and this paragraph says so rather than writing that a number is
 * owed — which `documentation.test.ts` counts as debt against a ratchet that may only fall.
 */

// Named `libraryDocument` rather than `document`: `boundaries.test.ts` confines the DOM to the
// dev entry point by looking for bare globals, and a binding called `document` is one.
import libraryDocument from '../../../../data/wrinkles.json' with { type: 'json' };
import { TEMPLATE_ROTATION_DAYS, drawWrinkle } from './draw.js';
import { parseWrinkleLibrary } from './parse.js';
import type { WrinkleLibrary } from './types.js';

/**
 * The library, parsed once at module init.
 *
 * Parsed rather than cast: the document is authored by hand and every rule `parse.ts` holds is one
 * a hand can break. A malformed library is a startup failure with the whole list of what is wrong,
 * which is the loud failure this repository prefers to a screen that renders a `{window}`.
 */
/**
 * How far ahead the rotation is checked at load. Four weeks of every weekday phase.
 *
 * The window slides, so a horizon of `n` checks every 14-day window that starts inside it. Twenty-eight
 * is two full cycles of the shorter (weekend) pool, which is where a too-small pool shows up first.
 */
const ROTATION_HORIZON_DAYS = 28;

/**
 * § 17's *"no wrinkle template twice in fourteen"*, checked against the shipped library at load.
 *
 * **Here rather than in `parse.ts`, and by calling `drawWrinkle` rather than re-deriving its
 * arithmetic.** The rule is a property of the draw over a document, not of the document alone, so a
 * check in the parser would have had to copy the index formula — two sources of truth for which
 * wrinkle a day gets, which is the defect this whole issue is about.
 *
 * It is a load-time refusal rather than a test because the arithmetic that satisfies it is not
 * obvious and is easy to break by editing content: this file's first draft shipped **three**
 * weekend templates, and four weekend days fall inside every fourteen-day window, so the rule was
 * unsatisfiable no matter what the draw did. A test caught that; a load-time check means the next
 * author is told at startup, with the two days named.
 *
 * Every weekday phase, because `day` and `dayIdx` are independent inputs and a rule that held only
 * when day 1 was a Monday would be a rule about day 1.
 */
function assertRotates(library: WrinkleLibrary): WrinkleLibrary {
  for (let phase = 0; phase < 7; phase += 1) {
    for (let start = 1; start <= ROTATION_HORIZON_DAYS; start += 1) {
      const seen = new Map<string, number>();
      for (let day = start; day < start + TEMPLATE_ROTATION_DAYS; day += 1) {
        const drawn = drawWrinkle(library, day, (day - 1 + phase) % 7);
        const earlier = seen.get(drawn.templateId);
        if (earlier !== undefined) {
          throw new Error(
            `data/wrinkles.json breaks § 17's rotation: ${drawn.templateId} is drawn on day ` +
              `${String(earlier)} and again on day ${String(day)}, inside ` +
              `${String(TEMPLATE_ROTATION_DAYS)}. The pool for that kind of day is too small — a ` +
              'template repeats after as many days of its own kind as the pool has rows.',
          );
        }
        seen.set(drawn.templateId, day);
      }
    }
  }
  return library;
}

export const WRINKLE_LIBRARY: WrinkleLibrary = assertRotates(parseWrinkleLibrary(libraryDocument));
