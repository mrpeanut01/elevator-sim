/**
 * **The profile's section list is a fact about the schema, and this is where that is proved.**
 *
 * `experiments/src/tuning/space/encode.ts` has to know which keys of a dispatcher profile are
 * written as `profile.<section>.<key>`, because that is how it turns an optimizer's candidate into
 * a profile and reads it back. It knew by carrying a hand-written list, and CLAUDE.md's *Standing
 * requirement* describes exactly what that costs: `selection` landed in `schema.ts` with seven
 * declared, round-trip-tested rows, the list did not gain it, and `collectSearchSpace()` reported
 * all seven **unauthorable** and dropped them — with nothing anywhere reading as wrong
 * (`DECISIONS.md` § D146).
 *
 * {@link objectSectionsOf} replaces the list. A test that only checked it against
 * `dispatcherProfileSchema` would be worth very little: a hand-written list passes that too, which
 * is the entire history of this defect. So the deriver is exercised against a **fictional profile
 * schema the product does not ship** — § D134's technique, for the reason it gives about W4's
 * generated controls: *a generated control that looks live only because the shipped schema happens
 * to fit it is the risk*.
 *
 * Three claims, and the third is the one that keeps the other two honest:
 *
 * 1. the shipped schema yields the seven sections it declares, in declaration order;
 * 2. a fictional eighth, ninth and tenth are found with no edit to the deriver, and fictional
 *    non-sections are not;
 * 3. the verdict agrees, key for key, with an **independent oracle** built from
 *    `parseDispatcherProfiles` — the function `loadConfig` calls — which shares no code with the
 *    deriver at all.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseDispatcherProfiles } from './parse.js';
import {
  DISPATCHER_PROFILE_OBJECT_SECTIONS,
  dispatcherProfileSchema,
  objectSectionsOf,
} from './schema.js';

/* -------------------------------------------------------------------------- *
 * The shipped schema
 * -------------------------------------------------------------------------- */

/**
 * The seven, in the order `dispatcherProfileSchema` declares them.
 *
 * Pinned rather than recomputed, because the pin is the guard: a section that stops being found —
 * by being re-authored in a shape the rule does not admit, or by being deleted — must fail here
 * rather than quietly shrink the tuning search space by however many rows it carried. § D146's
 * count is the evidence that a silent shrink is not hypothetical: seven rows, 49 dimensions where
 * there should have been 56.
 */
const SHIPPED_SECTIONS = [
  'normalization',
  'dispatch',
  'eligibility',
  'answer',
  'idle',
  'auction',
  'selection',
] as const;

describe('objectSectionsOf, against the shipped dispatcher profile', () => {
  it('derives the seven declared sections, in declaration order', () => {
    expect(DISPATCHER_PROFILE_OBJECT_SECTIONS).toStrictEqual([...SHIPPED_SECTIONS]);
    expect(objectSectionsOf(dispatcherProfileSchema)).toStrictEqual([...SHIPPED_SECTIONS]);
  });

  it('excludes the two pseudo-sections and the scalars, and each for its own reason', () => {
    // `weights` and `hardConstraints` are real profile fields and are **not** written as
    // `profile.<section>.<key>` — `encode.ts` translates both itself, `weights` because it is an
    // open record with no fixed keys and `hardConstraints` because a set is not something a
    // generic optimizer samples. Their absence here is what makes that translation the only one.
    for (const pseudo of ['weights', 'hardConstraints']) {
      expect(Object.hasOwn(dispatcherProfileSchema.shape, pseudo)).toBe(true);
      expect(DISPATCHER_PROFILE_OBJECT_SECTIONS).not.toContain(pseudo);
    }
    for (const scalar of ['$comment', 'id', 'name', 'role', 'engine']) {
      expect(Object.hasOwn(dispatcherProfileSchema.shape, scalar)).toBe(true);
      expect(DISPATCHER_PROFILE_OBJECT_SECTIONS).not.toContain(scalar);
    }
    // And nothing else exists: every key of the shape is accounted for by one of the three lists
    // above, so a *new* key cannot land in none of them and go unnoticed by this file.
    expect([...Object.keys(dispatcherProfileSchema.shape)].sort()).toStrictEqual(
      [
        ...SHIPPED_SECTIONS,
        'weights',
        'hardConstraints',
        '$comment',
        'id',
        'name',
        'role',
        'engine',
      ].sort(),
    );
  });
});

/* -------------------------------------------------------------------------- *
 * A schema the product does not ship
 * -------------------------------------------------------------------------- */

/**
 * A dispatcher profile that does not exist, with three sections and three non-sections.
 *
 * Fictional on purpose. The claim being tested is that the deriver reads *shape*, and a shipped
 * schema cannot distinguish that claim from a list somebody happened to keep in step. Every
 * addition below is a shape a future section could plausibly be authored in:
 *
 * - `plaza` — `.optional()`, which is how all seven shipped sections are written;
 * - `concourse` — **required**, no wrapper at all;
 * - `mezzanine` — `.default({})`, a wrapper the shipped schema never uses;
 * - `terrace` — `.optional().readonly()`, two wrappers deep, which is why the peel is a loop.
 *
 * And three that must **not** be found, each standing for a different reason:
 *
 * - `atriumNote` — a scalar;
 * - `skylights` — an array, like `hardConstraints`;
 * - `banners` — a **record**, like `weights`. This one is the deriver's stated blind spot rather
 *   than an oversight, and it is asserted here so that the boundary is a pinned fact: a section
 *   authored as an open map has no fixed keys, so there is nothing for a search to declare, and it
 *   would need `encode.ts` to grow a second translation the way `weights` has one.
 */
const FICTIONAL_PROFILE_SCHEMA = dispatcherProfileSchema.extend({
  plaza: z.strictObject({ fountainDwellS: z.number().optional() }).optional(),
  concourse: z.strictObject({ turnstileS: z.number().optional() }),
  mezzanine: z.strictObject({ escalatorGain: z.number().optional() }).default({}),
  terrace: z.strictObject({ awningS: z.number().optional() }).optional().readonly(),
  atriumNote: z.string().optional(),
  skylights: z.array(z.string()).optional(),
  banners: z.record(z.string(), z.number()).optional(),
});

describe('objectSectionsOf, against a fictional schema the product does not ship', () => {
  it('picks up sections it has never seen, with no edit to the deriver', () => {
    // The load-bearing assertion of this file. Four fictional sections, in four different
    // wrapper shapes, all found — and found by a function whose source names none of them.
    expect(objectSectionsOf(FICTIONAL_PROFILE_SCHEMA)).toStrictEqual([
      ...SHIPPED_SECTIONS,
      'plaza',
      'concourse',
      'mezzanine',
      'terrace',
    ]);
  });

  it('states its blind spot rather than hiding it', () => {
    const derived = objectSectionsOf(FICTIONAL_PROFILE_SCHEMA);
    // A scalar and an array are correctly not sections: neither is a `<section>.<key>` path.
    expect(derived).not.toContain('atriumNote');
    expect(derived).not.toContain('skylights');
    // A record is **also** not found, and unlike the two above that is a limitation and not a
    // judgement. A section authored this way would fail the same silent way `selection` did.
    expect(derived).not.toContain('banners');

    // The same limitation, generalized: any shape with no single `innerType` to peel — a union, an
    // intersection, a lazy — is invisible. Named here so the boundary is asserted rather than
    // discovered by whoever authors the eighth section.
    const invisible = objectSectionsOf(
      z.strictObject({
        eitherOr: z.union([z.strictObject({ a: z.number() }), z.strictObject({ b: z.number() })]),
        both: z.intersection(z.strictObject({ a: z.number() }), z.strictObject({ b: z.number() })),
        later: z.lazy(() => z.strictObject({ a: z.number() })),
        plain: z.strictObject({ a: z.number().optional() }),
      }),
    );
    expect(invisible).toStrictEqual(['plain']);
  });
});

/* -------------------------------------------------------------------------- *
 * An independent oracle
 * -------------------------------------------------------------------------- */

/**
 * Whether the **real parser** accepts an empty object at this key of a dispatcher profile.
 *
 * Shares no code with {@link objectSectionsOf}: it authors a minimal profile, puts `{}` at the
 * key, and runs `parseDispatcherProfiles` — the function `loadConfig` calls. A section is exactly
 * a key whose every field is optional and which therefore accepts `{}`; a string, an array or a
 * required scalar does not.
 */
function parserAcceptsEmptyObjectAt(key: string): boolean {
  try {
    parseDispatcherProfiles(
      {
        version: 1,
        terms: [{ id: 'waitTime', measures: 'wait', serves: 'section oracle' }],
        normalization: { required: true },
        profiles: [{ id: 'probe', name: 'Probe', weights: {}, [key]: {} }],
      },
      '<section oracle>',
    );
    return true;
  } catch {
    return false;
  }
}

describe('the derived section list, cross-checked against the parser', () => {
  it('agrees with the parser key for key, with `weights` the one documented difference', () => {
    const accepted = Object.keys(dispatcherProfileSchema.shape).filter(parserAcceptsEmptyObjectAt);

    // `weights` accepts `{}` because it is a record and an empty map is a valid one — which is
    // the same fact that makes it a pseudo-section rather than a section, and the same fact the
    // blind-spot assertion above records. Everything else the parser accepts as an empty object
    // is a section, and every section is accepted.
    expect(accepted.filter((key) => key !== 'weights')).toStrictEqual([
      ...DISPATCHER_PROFILE_OBJECT_SECTIONS,
    ]);
    expect(accepted).toContain('weights');

    // The oracle discriminates: it must not be answering `true` for everything.
    expect(accepted.length).toBeLessThan(Object.keys(dispatcherProfileSchema.shape).length);
  });
});
