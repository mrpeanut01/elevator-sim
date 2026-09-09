/**
 * The wrinkle library, its refusals, and § 17's rotation — GitHub issue **#159**.
 *
 * Three things are checked here and one of them is unusual enough to say out loud.
 *
 * 1. **The shipped document parses**, which is the only test that runs against the real
 *    `data/wrinkles.json` and so the only one that can fail because of an edit to it.
 * 2. **Every refusal in `parse.ts` fires on a fixture that breaks it.** A validator nobody has
 *    watched reject anything is a validator that cannot fail, and five of those have shipped in
 *    this repository — `events.test.ts` says so where it keeps its own detector fixture.
 * 3. **The drawn schedule is pinned to this commit.** § 17's second consequence is that *"the
 *    generator's output must be pinned to a commit, or everyone's 'same tower' quietly diverges"*,
 *    and a table of twenty-eight days is what pinning it looks like. A library edit that moves a
 *    day turns this red, which is the point: the day moving is a content decision and should be
 *    made on purpose rather than noticed by a player.
 */

import { describe, expect, it } from 'vitest';

import { WRINKLE_LIBRARY } from './library.js';
import { REQUIRED_TEMPLATE_IDS, WrinkleLibraryError, parseWrinkleLibrary } from './parse.js';
import {
  TEMPLATE_ROTATION_DAYS,
  composeWrinkle,
  dayKindOf,
  drawWrinkle,
  everyWrinkle,
  poolFor,
} from './draw.js';

/** A minimal library that parses, so each refusal below can break exactly one thing. */
const wellFormed = (): Record<string, unknown> => ({
  version: 1,
  unexpressible: [{ kind: 'doors slowed on one car', needs: 'a per-car door-timing override' }],
  templates: [
    ...REQUIRED_TEMPLATE_IDS.map((id) => ({
      id,
      name: id,
      note: 'A note.',
      days: 'weekday',
      effect: {
        changesNothing: false,
        arrivalRateMultiplier: 1.2,
        directionalSplit: null,
        carsOutOfService: 0,
        derate: null,
      },
      axes: [],
    })),
  ],
});

describe('the shipped library', () => {
  it('parses, which is the only assertion here that data/wrinkles.json can break', () => {
    expect(WRINKLE_LIBRARY.templates.length).toBeGreaterThanOrEqual(20);
  });

  it('carries every id shipped code names as a literal', () => {
    const ids = new Set(WRINKLE_LIBRARY.templates.map((template) => template.id));
    for (const required of REQUIRED_TEMPLATE_IDS) expect(ids, required).toContain(required);
  });

  it('holds a pool big enough for § 17’s rotation on both kinds of day', () => {
    /*
     * Ten weekdays and four weekend days fall inside any fourteen-day window, and a template
     * repeats after `pool.length` days of its own kind. The margins are what make the rotation rule
     * satisfiable at all — with three weekend templates it is not, whatever the draw does.
     */
    expect(poolFor(WRINKLE_LIBRARY, 'weekday').length).toBeGreaterThan(10);
    expect(poolFor(WRINKLE_LIBRARY, 'weekend').length).toBeGreaterThan(4);
  });

  it('keeps the campaign’s two out of every rota pool', () => {
    // `campaign/incidents.ts#campaignEventFor` is their only chooser, and the week's rota has never
    // drawn them. `SHIFT_EVENT_IDS` said so in a comment; `poolFor` says it in code.
    for (const kind of ['weekday', 'weekend'] as const) {
      const ids = poolFor(WRINKLE_LIBRARY, kind).map((template) => template.id);
      expect(ids).not.toContain('breakdown');
      expect(ids).not.toContain('coach-party');
    }
  });

  it('names the § 17 kinds it cannot express, and what each one needs', () => {
    // The list is the honest half of this build: § 17 names six kinds of wrinkle and the engine's
    // four effect fields reach three of them. An empty list would claim otherwise.
    expect(WRINKLE_LIBRARY.unexpressible.length).toBeGreaterThan(0);
    for (const entry of WRINKLE_LIBRARY.unexpressible) {
      expect(entry.kind.length, 'a kind with no name').toBeGreaterThan(0);
      expect(entry.needs.length, `${entry.kind} names no seam`).toBeGreaterThan(0);
    }
  });
});

describe('the parser refuses a library it cannot trust', () => {
  const refuses = (mutate: (doc: Record<string, unknown>) => void, expected: RegExp): void => {
    const doc = wellFormed();
    mutate(doc);
    expect(() => parseWrinkleLibrary(doc)).toThrow(WrinkleLibraryError);
    expect(() => parseWrinkleLibrary(doc)).toThrow(expected);
  };

  it('accepts the fixture, so every rejection below is about the one thing it broke', () => {
    expect(() => parseWrinkleLibrary(wellFormed())).not.toThrow();
  });

  it('a template shipped code names by hand has gone', () => {
    refuses((doc) => {
      const templates = doc['templates'] as Record<string, unknown>[];
      doc['templates'] = templates.filter((template) => template['id'] !== 'ordinary');
    }, /template ordinary is named as a literal/);
  });

  it('two templates share an id', () => {
    refuses((doc) => {
      const templates = doc['templates'] as Record<string, unknown>[];
      templates.push({ ...templates[0] } as Record<string, unknown>);
    }, /duplicate template id/);
  });

  it('a directional split’s shares do not sum to one', () => {
    refuses((doc) => {
      const templates = doc['templates'] as Record<string, unknown>[];
      (templates[0] as { effect: Record<string, unknown> }).effect['directionalSplit'] = {
        incoming: 0.5,
        outgoing: 0.5,
        interfloor: 0.5,
      };
    }, /shares sum to 1\.5, not 1/);
  });

  it('a derate window ends before it starts', () => {
    refuses((doc) => {
      const templates = doc['templates'] as Record<string, unknown>[];
      (templates[0] as { effect: Record<string, unknown> }).effect['derate'] = {
        cars: 1,
        fromFraction: 0.8,
        toFraction: 0.2,
      };
    }, /ends at or before it starts/);
  });

  it('a template claims to change nothing and writes a field the engine reads', () => {
    refuses((doc) => {
      const templates = doc['templates'] as Record<string, unknown>[];
      (templates[0] as { effect: Record<string, unknown> }).effect['changesNothing'] = true;
    }, /claims to change nothing and writes a field/);
  });

  it('a template claims a change and writes nothing', () => {
    refuses((doc) => {
      const templates = doc['templates'] as Record<string, unknown>[];
      (templates[0] as { effect: Record<string, unknown> }).effect['arrivalRateMultiplier'] = null;
    }, /claims a change and writes no field/);
  });

  it('a note names a placeholder no axis fills, which a player would see', () => {
    refuses((doc) => {
      const templates = doc['templates'] as Record<string, unknown>[];
      (templates[0] as Record<string, unknown>)['note'] = 'A car is out {window}.';
    }, /\{window\} names no axis/);
  });

  it('an axis carries labels the note never renders, so it varies the run silently', () => {
    refuses((doc) => {
      const templates = doc['templates'] as Record<string, unknown>[];
      (templates[0] as Record<string, unknown>)['axes'] = [
        {
          id: 'window',
          values: [
            { id: 'a', label: 'in the morning', arrivalRateMultiplier: 1.1 },
            { id: 'b', label: 'in the afternoon', arrivalRateMultiplier: 1.3 },
          ],
        },
      ];
    }, /carries labels the note never renders/);
  });

  it('the unexpressible list has been emptied', () => {
    refuses((doc) => {
      doc['unexpressible'] = [];
    }, /claims every kind § 17 names is reachable/);
  });
});

describe('§ 17’s rotation', () => {
  it('draws no template twice inside fourteen days, on every weekday phase', () => {
    for (let phase = 0; phase < 7; phase += 1) {
      for (let start = 1; start <= 60; start += 1) {
        const seen = new Map<string, number>();
        for (let day = start; day < start + TEMPLATE_ROTATION_DAYS; day += 1) {
          const drawn = drawWrinkle(WRINKLE_LIBRARY, day, (day - 1 + phase) % 7);
          const earlier = seen.get(drawn.templateId);
          expect(
            earlier,
            `phase ${String(phase)}: ${drawn.templateId} on day ${String(earlier)} and again on ` +
              `day ${String(day)}`,
          ).toBeUndefined();
          seen.set(drawn.templateId, day);
        }
      }
    }
  });

  it('draws a weekend day from the weekend pool and a weekday from the weekday pool', () => {
    for (let day = 1; day <= 60; day += 1) {
      for (let dayIdx = 0; dayIdx < 7; dayIdx += 1) {
        const kind = dayKindOf(dayIdx);
        const drawn = drawWrinkle(WRINKLE_LIBRARY, day, dayIdx);
        expect(
          poolFor(WRINKLE_LIBRARY, kind).map((template) => template.id),
          `day ${String(day)} idx ${String(dayIdx)}`,
        ).toContain(drawn.templateId);
      }
    }
  });

  /*
   * **§ 17's other two rotation rules are not tested here because they are not built.** *"No tower
   * twice in seven days"* and *"the pair (tower, template) never inside a month"* both name a
   * tower, and nothing in this build draws one — `everyday/today.ts#todayOf` is handed a building.
   * A `pairIsRotated` for the second was written and deleted before this landed; `draw.ts`'s
   * docstring says why, and says what caught it.
   */
});

describe('a wrinkle composes to a sentence a player can read', () => {
  it('substitutes every axis label and leaves no placeholder behind', () => {
    for (const wrinkle of everyWrinkle(WRINKLE_LIBRARY)) {
      expect(wrinkle.note, wrinkle.id).not.toMatch(/[{}]/);
      expect(wrinkle.note.trim(), wrinkle.id).toBe(wrinkle.note);
      expect(wrinkle.note, wrinkle.id).not.toMatch(/\s{2,}/);
      expect(wrinkle.note, wrinkle.id).not.toMatch(/\s[.,]/);
    }
  });

  it('detects a placeholder when there is one, so a green run above means something', () => {
    // The detector's own fixture. A sweep that has never seen a `{window}` is a sweep that cannot
    // find one.
    const template = {
      id: 'x',
      name: 'X',
      note: 'A car is out {window}.',
      days: 'weekday' as const,
      effect: {
        changesNothing: false,
        arrivalRateMultiplier: 1.2,
        directionalSplit: null,
        carsOutOfService: 0,
        derate: null,
      },
      axes: [],
    };
    expect(composeWrinkle(template, []).note).toMatch(/[{}]/);
  });
});

describe('the drawn schedule is pinned to this commit — § 17', () => {
  /*
   * § 17: *"the generator's output must be pinned to a commit, or everyone's 'same tower' quietly
   * diverges."* This is that pin. It is deliberately the whole first four weeks rather than a hash,
   * so that a diff says *which day moved and to what* rather than that something did.
   *
   * A library edit will turn this red. That is correct and is the point: which wrinkle a player
   * meets on day 3 is a content decision, and it should be made in a commit rather than discovered.
   */
  const FIRST_FOUR_WEEKS: readonly string[] = [
    'ordinary',
    'move-in:middle',
    'fire-drill:full',
    'conference:full-floor',
    'shaft-out:most-of-day',
    'weekend',
    'weekend-quiet',
    'goods-inward',
    'evacuation-drill:floor-by-floor',
    'shift-change:tight',
    'quiet-morning:half',
    'contractors:afternoon',
    'weekend-works',
    'weekend-move-out',
    'flu-day',
    'open-day:busy',
    'late-finish',
    'lift-service:mid-shift',
    'ordinary',
    'weekend-event',
    'weekend',
    'conference:half-floor',
    'shaft-out:most-of-day',
    'two-cars-down',
    'caterers:into-the-rush',
    'goods-inward',
    'weekend-quiet',
    'weekend-works',
  ];


  it('draws exactly the schedule this commit shipped', () => {
    const drawn = Array.from({ length: FIRST_FOUR_WEEKS.length }, (_, i) => i + 1).map(
      (day) => drawWrinkle(WRINKLE_LIBRARY, day, (day - 1) % 7).id,
    );
    expect(drawn).toEqual(FIRST_FOUR_WEEKS);
  });

  it('is a pure function of (day, dayIdx), so two players meet the same day', () => {
    for (let day = 1; day <= 30; day += 1) {
      for (let dayIdx = 0; dayIdx < 7; dayIdx += 1) {
        expect(drawWrinkle(WRINKLE_LIBRARY, day, dayIdx)).toEqual(
          drawWrinkle(WRINKLE_LIBRARY, day, dayIdx),
        );
      }
    }
  });
});
